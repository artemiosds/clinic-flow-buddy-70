import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isBackendReachable, setIsBackendReachable] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const checkHealth = async () => {
      if (!navigator.onLine) {
        setIsBackendReachable(false);
        return;
      }
      try {
        // Use a simple query to verify backend reachability
        const { error } = await supabase.from("pacientes" as any).select("id").limit(1);
        setIsBackendReachable(true);
      } catch (err) {
        setIsBackendReachable(false);
      }
    };

    const interval = setInterval(checkHealth, 30000);
    checkHealth();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return {
    isOnline: isOnline && isBackendReachable,
    isConnectionWeak: isOnline && !isBackendReachable
  };
};
