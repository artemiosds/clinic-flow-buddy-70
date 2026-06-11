import Dexie, { type Table } from 'dexie';

export interface OfflineOperation {
  id?: number;
  clientOperationId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  table: string;
  payload: any;
  userId: string;
  unitId?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: 'pendente' | 'sincronizando' | 'sincronizado' | 'falha';
}

export class OfflineDatabase extends Dexie {
  operations!: Table<OfflineOperation>;

  constructor() {
    super('CER_Offline_DB');
    this.version(1).stores({
      operations: '++id, clientOperationId, status, userId, unitId, createdAt'
    });
  }
}

export const offlineDb = new OfflineDatabase();

export const addToOfflineQueue = async (op: Omit<OfflineOperation, 'id' | 'createdAt' | 'attempts' | 'status'>) => {
  return await offlineDb.operations.add({
    ...op,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pendente'
  });
};
