import { useEffect, useCallback } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { offlineDb } from "@/lib/offline-db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useOfflineSync = () => {
  const { isOnline } = useNetworkStatus();

  const syncQueue = useCallback(async () => {
    // Only sync if online
    if (!navigator.onLine) return;

    // Find operations that are pending or failed, but NOT recently attempted to avoid rapid loops on persistent errors
    const pendingOps = await offlineDb.operations
      .where("status")
      .anyOf(["pendente", "falha"])
      .filter(op => !op.lastError || op.attempts < 10)
      .toArray();

    if (pendingOps.length === 0) return;

    console.log(`Iniciando sincronização de ${pendingOps.length} operações...`);

    for (const op of pendingOps) {
      try {
        await offlineDb.operations.update(op.id!, { status: "sincronizando" });

        let result;
        const payloadWithId = { 
          ...op.payload, 
          client_operation_id: op.clientOperationId 
        };

        // Map generic operation names to Supabase methods if needed
        const operation = op.operation.toUpperCase();

        if (operation === "INSERT" || operation.startsWith("CREATE")) {
          result = await supabase
            .from(op.table as any)
            .insert(payloadWithId);
        } else if (operation === "UPDATE" || operation.startsWith("UPDATE") || operation.startsWith("EDIT")) {
          result = await supabase
            .from(op.table as any)
            .update(op.payload) // Usually update shouldn't overwrite client_operation_id unless needed
            .eq("client_operation_id", op.clientOperationId);
            
          // If no row was updated by client_operation_id, try by payload.id if exists
          if (result.status === 204 && op.payload.id) {
             result = await supabase
              .from(op.table as any)
              .update(op.payload)
              .eq("id", op.payload.id);
          }
        } else if (operation === "DELETE" || operation.startsWith("DELETE") || operation.startsWith("REMOVE")) {
          result = await supabase
            .from(op.table as any)
            .delete()
            .eq("client_operation_id", op.clientOperationId);

          if (result.status === 204 && op.payload.id) {
            result = await supabase
             .from(op.table as any)
             .delete()
             .eq("id", op.payload.id);
         }
        }

        if (result?.error) throw result.error;

        await offlineDb.operations.update(op.id!, { status: "sincronizado" });
        console.log(`Operação ${op.clientOperationId} sincronizada com sucesso.`);
      } catch (error: any) {
        console.error("Sync error:", error);
        
        // Technical validation: handle specific error codes
        // 23505 = Unique constraint violation (Idempotency)
        const isIdempotencyError = error.code === "23505" && 
          (
            error.message?.includes("client_operation_id") || 
            error.details?.includes("client_operation_id") ||
            (error.message?.includes("unique_") && error.message?.includes("_client_op"))
          );
        
        if (isIdempotencyError) {
          console.info(`Operação ${op.clientOperationId} já sincronizada (Idempotência).`);
          await offlineDb.operations.update(op.id!, { status: "sincronizado" });
          continue;
        }

        // If it's a network error, keep it as pending for next attempt
        const isNetworkError = error instanceof TypeError && error.message === "Failed to fetch";
        
        if (isNetworkError) {
          await offlineDb.operations.update(op.id!, { status: "pendente" });
          break; // Stop processing queue if network is failing
        }

        await offlineDb.operations.update(op.id!, {
          status: "falha",
          attempts: (op.attempts || 0) + 1,
          lastError: error.message || error.details || "Erro desconhecido",
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(syncQueue, 30000); // 30s interval
    syncQueue();

    // Listen for manual triggers
    window.addEventListener('trigger-offline-sync', syncQueue);

    return () => {
      clearInterval(interval);
      window.removeEventListener('trigger-offline-sync', syncQueue);
    };
  }, [isOnline, syncQueue]);
};

