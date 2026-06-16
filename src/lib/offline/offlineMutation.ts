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

/**
 * Funçao central para enfileirar mutações offline (Local-First).
 * Salva no Dexie imediatamente e dispara o worker de sincronização.
 */
export const enqueueOfflineMutation = async (
  operationOrObject: OfflineOperationType | any,
  payloadOrUndefined?: any,
  optionsOrUndefined?: EnqueueOptions
) => {
  // Overload handling for legacy calls
  let operation: OfflineOperationType;
  let payload: any;
  let options: EnqueueOptions;

  if (typeof operationOrObject === 'string') {
    operation = operationOrObject;
    payload = payloadOrUndefined;
    options = optionsOrUndefined!;
  } else {
    // Legacy call: enqueueOfflineMutation(object)
    const obj = operationOrObject;
    operation = obj.operation;
    payload = obj.payload;
    options = {
      table: obj.table,
      lookupField: obj.lookupField,
      lookupValue: obj.lookupValue,
    };
  }

  const clientOperationId = crypto.randomUUID();
  
  let userId = 'anonymous';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id || 'anonymous';
  } catch (e) {
    console.warn("Auth session not available for offline mutation", e);
  }

  const opType = (operation === 'INSERT' || operation === 'UPDATE' || operation === 'DELETE') 
    ? operation 
    : operation.includes('CREATE') ? 'INSERT' : operation.includes('EDIT') || operation.includes('UPDATE') ? 'UPDATE' : 'INSERT';

  const op: Omit<OfflineOperation, 'id'> = {
    clientOperationId,
    operation: opType,
    table: options.table,
    payload: {
      ...payload,
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
    
    const isOnline = navigator.onLine;

    if (options.showToast !== false) {
      if (isOnline) {
        toast.success("Salvo com sucesso.", { duration: 2000 });
      } else {
        toast.success("Salvo localmente. Aguardando sincronização.", {
          description: "Os dados serão enviados automaticamente assim que houver conexão.",
          duration: 3000,
        });
      }
    }

    if (isOnline) {
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
