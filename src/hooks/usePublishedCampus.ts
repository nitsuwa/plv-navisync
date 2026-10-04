import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { campusService } from "../services/campusService";
import { campusStructureService } from "../services/campusStructureService";
import type { Campus } from "../components/map-builder/types";
import { studentCampusListing } from "../lib/studentCampusListing";
import { useAuth } from "../contexts/StudentAuthContext";
import { DEFAULT_PUBLIC_PLATFORM_SETTINGS, settingsService, type PublicPlatformSettings } from "../services/settingsService";

const SESSION_CACHE_KEY = "plv_published_campuses_cache_v1";
const LAST_CAMPUS_KEY = "plv_student_last_campus_v1";
const RESUME_REFRESH_INTERVAL_MS = 15_000;
const CAMPUS_LOAD_ERROR = "We couldn't load the campus map right now. Please try again.";

function isMissingPublishedSnapshotSchema(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code?: unknown }).code ?? "");
  // Older installations may not have the immutable snapshot relation/columns.
  // Timeouts, permission errors, and network failures must not fall through to
  // the legacy list, which can look like a valid empty published map.
  return ["42P01", "42703"].includes(code);
}

function isPublished(campus: Campus): boolean {
  return campus.lifecycleStatus === "published" || campus.publishStatus === "published";
}

export function lastCampusStorageKey(userId: string): string {
  return `${LAST_CAMPUS_KEY}:${userId || "guest"}`;
}

function readCachedCampuses(): Campus[] {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((campus): campus is Campus =>
      campus && typeof campus.id === "string" &&
      (campus.lifecycleStatus === "published" || campus.publishStatus === "published" || campus.lifecycleStatus === "coming_soon"),
    );
  } catch {
    return [];
  }
}

function readRememberedCampus(userId: string): string | null {
  try { return window.localStorage.getItem(lastCampusStorageKey(userId)); } catch { return null; }
}

export function chooseInitialCampus(campuses: Campus[], settings: PublicPlatformSettings, userId: string): Campus | null {
  const rememberedId = settings.rememberLastCampus ? readRememberedCampus(userId) : null;
  const remembered = rememberedId ? campuses.find((campus) => campus.id === rememberedId) : null;
  if (remembered) return remembered;

  const configuredDefault = settings.defaultCampusId
    ? campuses.find((campus) => campus.id === settings.defaultCampusId && isPublished(campus))
    : null;
  if (configuredDefault) return configuredDefault;

  return campuses.find((campus) => isPublished(campus) && campus.isDefault)
    ?? campuses.find(isPublished)
    ?? campuses[0]
    ?? null;
}

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

export function usePublishedCampus(previewCampus?: Campus | null): UsePublishedCampusResult {
  const auth = useAuth();
  const userId = auth.session?.user.id ?? auth.profile?.id ?? "guest";
  const [campuses, setCampuses] = useState<Campus[]>(readCachedCampuses);
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PublicPlatformSettings>(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
  const [loading, setLoading] = useState<boolean>(() => campuses.length === 0);
  const [error, setError] = useState<string | null>(null);
  // A session cache can render immediately while the live list revalidates.
  // Show the offline warning only if that revalidation actually fails.
  const [isCached, setIsCached] = useState(false);
  const hasCampusDataRef = useRef(campuses.length > 0);
  const lastGoodCampusesRef = useRef<Campus[]>(campuses);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const userIdRef = useRef(userId);
  const previousUserIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchPublishedCampuses = useCallback((): Promise<void> => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;
    // Keep a usable map on screen during background revalidation. The full
    // loading state is reserved for the initial load or an empty map retry.
    if (!hasCampusDataRef.current) setLoading(true);
    setError(null);
    const request = (async () => {
      try {
        const studentSettings = await settingsService.getPublicPlatformSettings();
        setPlatformSettings(studentSettings);
        // Prefer immutable published snapshots. This keeps draft/editor edits
        // out of the public map until the database publication RPC succeeds.
        let published: Campus[] = [];
        try {
          published = await campusService.listPublishedSnapshots();
          // Published snapshots carry the full campus object including buildings,
          // floors, rooms, walls, and navigation data from the serialized
          // structure payload — no additional hydration needed.
        } catch (snapshotError) {
          if (!isMissingPublishedSnapshotSchema(snapshotError)) throw snapshotError;
          // Compatibility fallback is limited to known missing-schema cases.
          // In particular, a Postgres statement timeout (57014) must preserve
          // the previous map rather than falling through to an empty legacy list.
        }
        if (published.length === 0) {
          const allCampuses = await campusService.list();
          published = allCampuses.filter((campus) => campus.publishStatus === "published");
          // The list() path returns lightweight campus rows with empty floors.
          // Hydrate each campus so buildings carry their authored floor plans,
          // rooms, and walls — required by the public CampusMapPage.
          if (published.length > 0) {
            const hydrated = await Promise.allSettled(
              published.map(async (campus) => {
                try { return await campusStructureService.load(campus); }
                catch { return campus; }
              }),
            );
            published = hydrated.map((r, i) => r.status === "fulfilled" ? r.value : published[i]);
          }
        }

        // Coming Soon campuses are loaded through a database RPC that returns
        // announcement metadata only. Their authored map structure remains
        // protected by the existing published-only RLS policies.
        const comingSoon = await campusService.listComingSoon().catch(() => []);
        published = studentCampusListing(published, comingSoon);

        setCampuses(published);
        hasCampusDataRef.current = published.length > 0;
        lastGoodCampusesRef.current = published;
        setSelectedCampusId((currentId) => currentId && published.some((campus) => campus.id === currentId)
          ? currentId
          : chooseInitialCampus(published, studentSettings, userIdRef.current)?.id ?? null);
        setIsCached(false);

        // Save to sessionStorage cache for offline / fallback
        if (published.length > 0) {
          try {
            sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(published));
          } catch {
            // Ignore sessionStorage write errors
          }
        }
      } catch {
        // Preserve the last successfully rendered campus before consulting
        // session storage. This keeps refresh failures from clearing the map,
        // even when browser storage is unavailable.
        const cached = lastGoodCampusesRef.current;
        if (cached.length > 0) {
          setCampuses(cached);
          lastGoodCampusesRef.current = cached;
          hasCampusDataRef.current = true;
          setIsCached(true);
          setError(null);
        } else {
          setError(CAMPUS_LOAD_ERROR);
        }
      } finally {
        setLoading(false);
      }
    })();
    fetchInFlightRef.current = request;
    void request.finally(() => {
      if (fetchInFlightRef.current === request) fetchInFlightRef.current = null;
    });
    return request;
  }, []);

  useEffect(() => {
    if (previewCampus) {
      // Preview is intentionally read-only and must never fall back to the
      // published directory. It renders exactly the saved candidate passed by
      // the Admin Map Builder.
      setCampuses([previewCampus]);
      hasCampusDataRef.current = true;
      setSelectedCampusId(previewCampus.id);
      setLoading(false);
      setError(null);
      setIsCached(false);
      return;
    }
    fetchPublishedCampuses();
  }, [fetchPublishedCampuses, previewCampus]);

  // Auth bootstrap may resolve after the public campus list is already visible.
  // Apply the signed-in student's own remembered/default campus without
  // restarting the map fetch or showing another loading state.
  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    if (previewCampus || campuses.length === 0) return;
    setSelectedCampusId(chooseInitialCampus(campuses, platformSettings, userId)?.id ?? null);
  }, [userId, previewCampus, campuses, platformSettings]);

  // ── Real-time publishing: refetch when the user returns to this tab ──
  // When an admin publishes a new campus version, student tabs that were
  // backgrounded will pick it up on refocus without requiring a manual
  // page reload.
  useEffect(() => {
    if (previewCampus) return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const wasHiddenLongEnough = hiddenAt > 0 && Date.now() - hiddenAt >= RESUME_REFRESH_INTERVAL_MS;
        hiddenAt = 0;
        if (wasHiddenLongEnough) void fetchPublishedCampuses();
      } else {
        hiddenAt = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchPublishedCampuses, previewCampus]);

  // Derived active campus
  const activeCampus = useMemo(() => {
    if (!campuses.length) return null;
    if (selectedCampusId) {
      const found = campuses.find((c) => c.id === selectedCampusId);
      if (found) return found;
    }
    return chooseInitialCampus(campuses, platformSettings, userId);
  }, [campuses, selectedCampusId, platformSettings, userId]);

  const selectCampus = useCallback((id: string) => {
    setSelectedCampusId(id);
    if (previewCampus) return;
    try {
      const key = lastCampusStorageKey(userId);
      if (platformSettings.rememberLastCampus) window.localStorage.setItem(key, id);
      else window.localStorage.removeItem(key);
    } catch {
      // The selected campus still works for this session when browser storage is blocked.
    }
  }, [platformSettings.rememberLastCampus, previewCampus, userId]);

  // Auto-select first campus if selection invalid
  useEffect(() => {
    if (campuses.length > 0 && (!selectedCampusId || !campuses.some((c) => c.id === selectedCampusId))) {
      const defaultCampus = chooseInitialCampus(campuses, platformSettings, userId);
      if (defaultCampus) setSelectedCampusId(defaultCampus.id);
    }
  }, [campuses, selectedCampusId, platformSettings, userId]);

  useEffect(() => {
    if (previewCampus || platformSettings.rememberLastCampus) return;
    try { window.localStorage.removeItem(lastCampusStorageKey(userId)); } catch { /* optional preference */ }
  }, [platformSettings.rememberLastCampus, previewCampus, userId]);

  const isEmpty = !loading && campuses.length === 0;

  return {
    campuses,
    activeCampus,
    selectedCampusId,
    setSelectedCampusId: selectCampus,
    loading,
    error,
    isEmpty,
    isCached,
    refetch: fetchPublishedCampuses,
  };
}
