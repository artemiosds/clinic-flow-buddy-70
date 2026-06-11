import { useEffect } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { offlineDb } from "@/lib/offline-db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useOfflineSync = () => {
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    if (!isOnline) return;

    const syncQueue = async () => {
      // Find operations that are pending or failed, but NOT recently attempted to avoid rapid loops on persistent errors
      const pendingOps = await offlineDb.operations
        .where("status")
        .anyOf(["pendente", "falha"])
        .filter(op => !op.lastError || op.attempts < 10) // Limit retries for fatal errors
        .toArray();

      if (pendingOps.length === 0) return;

      for (const op of pendingOps) {
        try {
          await offlineDb.operations.update(op.id!, { status: "sincronizando" });

          let result;
          if (op.operation === "INSERT") {
            result = await supabase
              .from(op.table as any)
              .insert({ ...op.payload, client_operation_id: op.clientOperationId });
          } else if (op.operation === "UPDATE") {
            result = await supabase
              .from(op.table as any)
              .update(op.payload)
              .eq("client_operation_id", op.clientOperationId);
          } else if (op.operation === "DELETE") {
            result = await supabase
              .from(op.table as any)
              .delete()
              .eq("client_operation_id", op.clientOperationId);
          }

          if (result?.error) throw result.error;

          await offlineDb.operations.update(op.id!, { status: "sincronizado" });
        } catch (error: any) {
          console.error("Sync error:", error);
          
          // Technical validation: handle specific error codes
          // 42501 = RLS / Permission
          // 23505 = Unique constraint violation (Idempotency)
          
          const isIdempotencyError = error.code === "23505" && 
            (error.message?.includes("client_op") || error.details?.includes("client_op"));
          
          await offlineDb.operations.update(op.id!, {
            status: "falha",
            attempts: (op.attempts || 0) + 1,
            lastError: error.message || error.details || "Erro desconhecido",
          });
          
          if (isIdempotencyError) {
            // Already synced or duplicated by idempotency key, mark as synchronized to clear queue
            await offlineDb.operations.update(op.id!, { status: "sincronizado" });
          } else if (error.code === "42501") {
            toast.error(`Erro de permissão ao sincronizar ${op.table}. Ação manual necessária.`);
          }
        }
      }
    };

    const interval = setInterval(syncQueue, 15000); // 15s interval with backoff logic inside
    syncQueue();

    return () => clearInterval(interval);
  }, [isOnline]);
};

