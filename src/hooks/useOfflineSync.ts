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

    // Find operations that are pending or failed
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

        const { __lookupField, __lookupValue, ...cleanPayload } = op.payload;
        const payloadWithId = { 
          ...cleanPayload, 
          client_operation_id: op.clientOperationId 
        };

        const operation = op.operation.toUpperCase();
        let result;

        if (operation === "INSERT") {
          result = await supabase
            .from(op.table as any)
            .insert(payloadWithId);
        } else if (operation === "UPDATE") {
          const query = supabase.from(op.table as any).update(cleanPayload);
          
          if (__lookupField && __lookupValue) {
            result = await query.eq(__lookupField, __lookupValue);
          } else {
            result = await query.eq("client_operation_id", op.clientOperationId);
          }
        } else if (operation === "DELETE") {
          const query = supabase.from(op.table as any).delete();
          
          if (__lookupField && __lookupValue) {
            result = await query.eq(__lookupField, __lookupValue);
          } else {
            result = await query.eq("client_operation_id", op.clientOperationId);
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

        // Network error - stay pending
        if (error instanceof TypeError && error.message === "Failed to fetch") {
          await offlineDb.operations.update(op.id!, { status: "pendente" });
          break;
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

    const interval = setInterval(syncQueue, 30000); // 30s
    syncQueue();

    window.addEventListener('trigger-offline-sync', syncQueue);

    return () => {
      clearInterval(interval);
      window.removeEventListener('trigger-offline-sync', syncQueue);
    };
  }, [isOnline, syncQueue]);
};
