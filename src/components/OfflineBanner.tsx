import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useQuery } from "@tanstack/react-query";
import { offlineDb } from "@/lib/offline-db";

export const OfflineBanner: React.FC = () => {
  const { isOnline } = useNetworkStatus();
  
  // Count pending operations
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['offline-operations-count'],
    queryFn: async () => {
      const rows = await offlineDb.operations.toArray();
      return rows.filter((op) => ['pending', 'syncing', 'pendente', 'sincronizando'].includes(op.status)).length;
    },
    refetchInterval: 5000
  });

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 transition-colors ${
      !isOnline ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"
    }`}>
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">
            Modo offline: dados salvos localmente. Sincronização pendente.
          </span>
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">
            Sincronizando {pendingCount} alterações pendentes...
          </span>
        </>
      )}
    </div>
  );
};
