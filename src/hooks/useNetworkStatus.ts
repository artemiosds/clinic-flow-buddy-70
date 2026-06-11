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

    // Health check function
    const checkHealth = async () => {
      if (!navigator.onLine) {
        setIsBackendReachable(false);
        return;
      }
      try {
        // Simple light check to Supabase
        const { error } = await supabase.from("_health_check").select("id").limit(1);
        // If error is 404 it means table doesn't exist but backend responded
        // If error is network error it means unreachable
        setIsBackendReachable(true);
      } catch (err) {
        setIsBackendReachable(false);
      }
    };

    const interval = setInterval(checkHealth, 30000); // Every 30s
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
