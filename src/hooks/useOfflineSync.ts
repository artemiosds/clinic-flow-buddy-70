import { useEffect, useCallback } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { processOfflineQueue } from "@/lib/offline/offlineMutation";
import { queryClient } from "@/App";
import { toast } from "sonner";

export const useOfflineSync = () => {
  const { isOnline } = useNetworkStatus();

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const result = await processOfflineQueue();
    if (result.syncedTables.length > 0) {
      result.syncedTables.forEach(table => queryClient.invalidateQueries({ queryKey: [table] }));
      queryClient.invalidateQueries({ queryKey: ["offline-operations-count"] });
    }
    if (result.synced > 0) toast.success(`${result.synced} alteração(ões) sincronizada(s).`, { duration: 2000 });
    if (result.failed > 0) {
      toast.error(`${result.failed} alteração(ões) precisam de intervenção.`, { duration: 5000 });
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
