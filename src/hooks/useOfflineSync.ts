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
      const pendingOps = await offlineDb.operations
        .where("status")
        .anyOf(["pendente", "falha"])
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
          await offlineDb.operations.update(op.id!, {
            status: "falha",
            attempts: (op.attempts || 0) + 1,
            lastError: error.message,
          });
          
          if (error.code === "42501") { // RLS / Permission
            toast.error(`Erro de permissão ao sincronizar ${op.table}. Ação manual necessária.`);
          }
        }
      }
    };

    const interval = setInterval(syncQueue, 10000); // Try sync every 10s when online
    syncQueue();

    return () => clearInterval(interval);
  }, [isOnline]);
};
