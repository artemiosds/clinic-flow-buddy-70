import { offlineDb, type OfflineOperation } from "../offline-db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OfflineOperationType = 'INSERT' | 'UPDATE' | 'DELETE' | string;

export interface EnqueueOptions {
  table: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  showToast?: boolean;
}

export const enqueueOfflineMutation = async (
  operation: OfflineOperationType,
  payload: any,
  options: EnqueueOptions
) => {
  const clientOperationId = crypto.randomUUID();
  
  // Get current user session
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || 'anonymous';

  const op: Omit<OfflineOperation, 'id'> = {
    clientOperationId,
    operation: operation as any,
    table: options.table,
    payload,
    userId,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pendente'
  };

  try {
    await offlineDb.operations.add(op);
    
    if (options.showToast !== false) {
      toast.success("Salvo localmente. Aguardando sincronização.", {
        description: "Os dados serão enviados automaticamente assim que houver conexão.",
        duration: 5000,
      });
    }

    // Trigger immediate sync attempt if online
    const isOnline = navigator.onLine;
    if (isOnline) {
      // We don't await this to keep the "immediate" feel
      // But we can trigger it
      setTimeout(() => {
        window.dispatchEvent(new Event('trigger-offline-sync'));
      }, 0);
    }

    if (options.onSuccess) {
      options.onSuccess({ clientOperationId, status: 'pendente' });
    }

    return { clientOperationId, status: 'pendente' };
  } catch (error) {
    console.error("Failed to enqueue offline mutation:", error);
    if (options.onError) {
      options.onError(error);
    }
    toast.error("Erro ao salvar localmente. Tente novamente.");
    throw error;
  }
};
