import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "../lib/supabase";
import type { Database } from "../types/database.generated";

export type RealtimeTable = keyof Database["public"]["Tables"];

interface UseSupabaseRealtimeDataOptions<T> {
  channel: string;
  tables: readonly RealtimeTable[];
  load: () => Promise<T>;
}

export interface SupabaseRealtimeDataState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  realtimeConnected: boolean;
  lastUpdatedAt: Date | null;
  refresh: () => Promise<void>;
}

interface UseSupabaseRealtimeRefreshOptions {
  channel: string;
  tables: readonly RealtimeTable[];
  onChange: () => void | Promise<void>;
}

/** Attach Realtime invalidation to a page that already owns its loading state. */
export function useSupabaseRealtimeRefresh({ channel, tables, onChange }: UseSupabaseRealtimeRefreshOptions) {
  const callbackRef = useRef(onChange);
  const instanceRef = useRef(crypto.randomUUID());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const tablesKey = useMemo(() => [...tables].sort().join(","), [tables]);

  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let client: ReturnType<typeof getSupabase>;
    try {
      client = getSupabase();
    } catch {
      // The page's own loader remains usable in disconnected previews/tests.
      return;
    }
    let realtimeChannel = client.channel(`admin-${channel}-${instanceRef.current}`);
    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void callbackRef.current(), 180);
    };
    for (const table of tablesKey.split(",").filter(Boolean) as RealtimeTable[]) {
      realtimeChannel = realtimeChannel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    realtimeChannel.subscribe();
    return () => {
      clearTimeout(timerRef.current);
      void client.removeChannel(realtimeChannel);
    };
  }, [channel, tablesKey]);
}

/**
 * Loads a database snapshot and keeps it current with Postgres Changes.
 *
 * Change notifications are deliberately treated as invalidation signals: the
 * hook re-runs the authoritative typed query instead of trying to merge partial
 * payloads from several related tables. Bursts from one save transaction are
 * debounced into a single refresh.
 */
export function useSupabaseRealtimeData<T>({
  channel,
  tables,
  load,
}: UseSupabaseRealtimeDataOptions<T>): SupabaseRealtimeDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const loadRef = useRef(load);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const instanceRef = useRef(crypto.randomUUID());
  const tablesKey = useMemo(() => [...tables].sort().join(","), [tables]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const runLoad = useCallback(async (initial = false) => {
    const requestId = ++requestRef.current;
    if (initial) setLoading(true);
    else setRefreshing(true);

    try {
      const next = await loadRef.current();
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setData(next);
      setError(null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Could not load live database data.");
    } finally {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => runLoad(false), [runLoad]);

  useEffect(() => {
    mountedRef.current = true;
    void runLoad(true);

    const scheduleRefresh = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void runLoad(false), 180);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void runLoad(false);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    let client: ReturnType<typeof getSupabase>;
    try {
      client = getSupabase();
    } catch {
      return () => {
        mountedRef.current = false;
        clearTimeout(debounceRef.current);
        window.removeEventListener("focus", refreshWhenVisible);
        document.removeEventListener("visibilitychange", refreshWhenVisible);
      };
    }

    let realtimeChannel = client.channel(`admin-${channel}-${instanceRef.current}`);
    for (const table of tablesKey.split(",").filter(Boolean) as RealtimeTable[]) {
      realtimeChannel = realtimeChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }

    realtimeChannel.subscribe((status) => {
      if (!mountedRef.current) return;
      setRealtimeConnected(status === "SUBSCRIBED");
    });

    return () => {
      mountedRef.current = false;
      clearTimeout(debounceRef.current);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void client.removeChannel(realtimeChannel);
    };
  }, [channel, runLoad, tablesKey]);

  return {
    data,
    loading,
    refreshing,
    error,
    realtimeConnected,
    lastUpdatedAt,
    refresh,
  };
}
