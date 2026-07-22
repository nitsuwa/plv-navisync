import { useState, useEffect, useCallback, useRef } from "react";
import type { PaginatedResponse } from "../services/types";

interface UseDataListOptions<T> {
  /** Async fetcher function that returns paginated results */
  fetcher: (params: {
    page: number;
    pageSize: number;
    search: string;
    filter?: Record<string, string>;
  }) => Promise<PaginatedResponse<T>>;
  /** Initial page size */
  pageSize?: number;
  /** Debounce delay for search (ms) */
  debounceMs?: number;
  /** Auto-load on mount */
  autoLoad?: boolean;
}

interface UseDataListReturn<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  search: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setSearch: (q: string) => void;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  setFilter: (f: Record<string, string> | undefined) => void;
  refresh: () => void;
  reload: () => void;
  /** Re-run the current query (useful for retrying after an error) */
  retry: () => void;
}

/**
 * Generic hook for fetching paginated, searchable, filterable lists.
 *
 * Usage:
 * ```ts
 * const { data, loading, search, setSearch, refresh } = useDataList({
 *   fetcher: (params) => buildingService.list(params),
 * });
 * ```
 */
export function useDataList<T>(options: UseDataListOptions<T>): UseDataListReturn<T> {
  const {
    fetcher,
    pageSize: initialPageSize = 20,
    debounceMs = 300,
    autoLoad = true,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearchState] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filter, setFilterState] = useState<Record<string, string> | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const mountedRef = useRef(true);

  // Debounce search
  const setSearch = useCallback((q: string) => {
    setSearchState(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(q);
      setPage(1);
    }, debounceMs);
  }, [debounceMs]);

  // Manual filter setter
  const setFilter = useCallback((f: Record<string, string> | undefined) => {
    setFilterState(f);
    setPage(1);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher({
        page,
        pageSize,
        search: debouncedSearch,
        filter,
      });
      if (!mountedRef.current) return;
      setData(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to fetch data";
      setError(message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher, page, pageSize, debouncedSearch, filter]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoLoad) fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData, autoLoad]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);
  const reload = useCallback(() => { setPage(1); fetchData(); }, [fetchData]);

  useEffect(() => {
    return () => { clearTimeout(debounceRef.current); };
  }, []);

  return {
    data, loading, error,
    search, page, pageSize, total, totalPages,
    setSearch, setPage, setPageSize, setFilter,
    refresh, reload,
    retry: fetchData,
  };
}
