import { offlineDb, type OfflineOperation } from "../offline-db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OfflineOperationType = 'INSERT' | 'UPDATE' | 'DELETE' | string;

export interface EnqueueOptions {
  table: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  showToast?: boolean;
  lookupField?: string;
  lookupValue?: any;
}

export const enqueueOfflineMutation = async (
  operation: OfflineOperationType,
  payload: any,
  options: EnqueueOptions
) => {
  const clientOperationId = crypto.randomUUID();
  
  // Get current user session
  // We use a fallback if auth is not available
  let userId = 'anonymous';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id || 'anonymous';
  } catch (e) {
    console.warn("Auth session not available for offline mutation", e);
  }

  // Determine the operation type
  const opType = (operation === 'INSERT' || operation === 'UPDATE' || operation === 'DELETE') 
    ? operation 
    : operation.includes('CREATE') ? 'INSERT' : operation.includes('EDIT') || operation.includes('UPDATE') ? 'UPDATE' : 'INSERT';

  const op: Omit<OfflineOperation, 'id'> = {
    clientOperationId,
    operation: opType,
    table: options.table,
    payload: {
      ...payload,
      // Store lookup info in payload if it's an update/delete
      __lookupField: options.lookupField,
      __lookupValue: options.lookupValue
    },
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
        duration: 3000,
      });
    }

    // Trigger immediate sync attempt if online
    if (navigator.onLine) {
      window.dispatchEvent(new Event('trigger-offline-sync'));
    }

    if (options.onSuccess) {
      options.onSuccess({ clientOperationId, status: 'pendente', id: options.lookupValue });
    }

    return { clientOperationId, status: 'pendente', id: options.lookupValue };
  } catch (error) {
    console.error("Failed to enqueue offline mutation:", error);
    if (options.onError) {
      options.onError(error);
    }
    toast.error("Erro ao salvar localmente.");
    throw error;
  }
};

