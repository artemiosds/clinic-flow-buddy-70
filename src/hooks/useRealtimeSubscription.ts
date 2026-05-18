import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName =
  | 'agendamentos'
  | 'fila_espera'
  | 'atendimentos'
  | 'prontuarios'
  | 'treatment_cycles'
  | 'treatment_sessions'
  | 'permissoes'
  | 'pacientes';

interface UseRealtimeOptions {
  tables: TableName[];
  /** Callback fired (debounced) when any subscribed table changes. */
  onchange?: () => void;
  /** Optional TanStack query keys to invalidate granularly per change. */
  invalidateKeys?: readonly (readonly unknown[])[];
  /** Optional postgres filter applied to each subscription (e.g. `unidade_id=eq.${id}`). */
  filter?: string;
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Granular realtime subscription:
 * - Stable channel name (no Date.now) → avoids reconnect storms on re-renders
 * - Optional `filter` so the server pushes only relevant rows
 * - Optional `invalidateKeys` for surgical cache refresh (preferred over full refetch)
 */
export function useRealtimeSubscription({
  tables,
  onchange,
  invalidateKeys,
  filter,
  enabled = true,
  debounceMs = 400,
}: UseRealtimeOptions) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onchangeRef = useRef(onchange);
  const invalidateKeysRef = useRef(invalidateKeys);
  onchangeRef.current = onchange;
  invalidateKeysRef.current = invalidateKeys;

  const tablesKey = tables.join(',');

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const debouncedHandler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const keys = invalidateKeysRef.current;
        if (keys && keys.length > 0) {
          keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k as unknown[] }));
        }
        onchangeRef.current?.();
      }, debounceMs);
    };

    // Stable name → React StrictMode/double-mount reuses same channel instead of stacking
    const channelName = `rt-${tablesKey}${filter ? `-${filter}` : ''}`;
    let channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        debouncedHandler,
      );
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, filter, enabled, debounceMs]);
}
