import { useState, useEffect, useCallback, useMemo } from "react";
import { campusPublishingService } from "../services/campusPublishingService";
import { SEED_CAMPUSES } from "../components/map-builder/constants";
import type { Campus } from "../components/map-builder/types";

const SESSION_CACHE_KEY = "plv_published_campuses_cache_v1";

interface UsePublishedCampusResult {
  campuses: Campus[];
  activeCampus: Campus | null;
  selectedCampusId: string | null;
  setSelectedCampusId: (id: string) => void;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  isCached: boolean;
  refetch: () => Promise<void>;
}

export function usePublishedCampus(): UsePublishedCampusResult {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);

  // Try reading cached campuses from sessionStorage on mount
  const getCachedCampuses = useCallback((): Campus[] => {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore sessionStorage read errors
    }
    return [];
  }, []);

  const fetchPublishedCampuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // RLS exposes only each campus's active immutable published snapshot.
      let published = await campusPublishingService.listPublished();

      // Fallback: If database has no published campuses yet (fresh seed state),
      // use SEED_CAMPUSES so the public map displays the default published PLV campus.
      if (published.length === 0 && SEED_CAMPUSES.length > 0) {
        published = SEED_CAMPUSES.map((c) => ({
          ...c,
          publishStatus: "published" as const,
          visibleToStudents: true,
        }));
      }

      setCampuses(published);
      setIsCached(false);

      // Save to sessionStorage cache for offline / fallback
      if (published.length > 0) {
        try {
          sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(published));
        } catch {
          // Ignore sessionStorage write errors
        }
      }
    } catch (err: unknown) {
      // Fallback: Try sessionStorage cache first, then SEED_CAMPUSES
      const cached = getCachedCampuses();
      if (cached.length > 0) {
        setCampuses(cached);
        setIsCached(true);
      } else if (SEED_CAMPUSES.length > 0) {
        const defaultSeeds = SEED_CAMPUSES.map((c) => ({
          ...c,
          publishStatus: "published" as const,
          visibleToStudents: true,
        }));
        setCampuses(defaultSeeds);
        setIsCached(true);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to load published campus map.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [getCachedCampuses]);

  useEffect(() => {
    fetchPublishedCampuses();
  }, [fetchPublishedCampuses]);

  // Derived active campus
  const activeCampus = useMemo(() => {
    if (!campuses.length) return null;
    if (selectedCampusId) {
      const found = campuses.find((c) => c.id === selectedCampusId);
      if (found) return found;
    }
    return campuses.find((c) => c.isDefault) || campuses[0] || null;
  }, [campuses, selectedCampusId]);

  // Auto-select first campus if selection invalid
  useEffect(() => {
    if (campuses.length > 0 && (!selectedCampusId || !campuses.some((c) => c.id === selectedCampusId))) {
      const defaultCampus = campuses.find((c) => c.isDefault) || campuses[0];
      setSelectedCampusId(defaultCampus.id);
    }
  }, [campuses, selectedCampusId]);

  const isEmpty = !loading && campuses.length === 0;

  return {
    campuses,
    activeCampus,
    selectedCampusId,
    setSelectedCampusId,
    loading,
    error,
    isEmpty,
    isCached,
    refetch: fetchPublishedCampuses,
  };
}
