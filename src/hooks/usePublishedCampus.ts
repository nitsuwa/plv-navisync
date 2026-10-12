import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { campusService } from "../services/campusService";
import type { Campus } from "../components/map-builder/types";
import { studentCampusListing } from "../lib/studentCampusListing";
import { useAuth } from "../contexts/StudentAuthContext";
import { DEFAULT_PUBLIC_PLATFORM_SETTINGS, settingsService, type PublicPlatformSettings } from "../services/settingsService";

const SESSION_CACHE_KEY = "plv_published_campuses_version_cache_v2";
const LAST_CAMPUS_KEY = "plv_student_last_campus_v1";
const PUBLISHED_VERSION_POLL_INTERVAL_MS = 60_000;
const VERSION_STATUS_POLL_DRIFT_TOLERANCE_MS = 1_000;
const SHARED_VERSION_STATUS_FRESH_MS = 5_000;
const MAX_REFRESH_BACKOFF_MS = 5 * 60_000;
const REFRESH_RETRY_BASE_MS = 60_000;
const COMING_SOON_CACHE_TTL_MS = 5 * 60_000;
const CAMPUS_LOAD_ERROR = "We couldn't load the campus map right now. Please try again.";

interface PublishedVersionStatus {
  campus_id: string;
  latest_published_version_id: string;
  published_at: string | null;
}

interface VersionedCampusSnapshot {
  campusId: string;
  versionId: string;
  publishedAt: string | null;
  campus: Campus | null;
}

interface PersistedPublishedCampusCache {
  schemaVersion: 2;
  snapshots: VersionedCampusSnapshot[];
  comingSoon: Campus[];
}

function samePublicSettings(left: PublicPlatformSettings, right: PublicPlatformSettings): boolean {
  const keys = Object.keys(left) as Array<keyof PublicPlatformSettings>;
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function isPublished(campus: Campus): boolean {
  return campus.lifecycleStatus === "published" || campus.publishStatus === "published";
}

const sharedDirectoryRequests = new Map<string, Promise<unknown>>();
const publishedSnapshotsByCampus = new Map<string, VersionedCampusSnapshot>();
let publishedCacheHydrated = false;
let cachedComingSoonCampuses: Campus[] = [];
let cachedComingSoonAt = 0;
let sharedVersionStatusRequest: Promise<PublishedVersionStatus[]> | null = null;
let sharedVersionStatus: PublishedVersionStatus[] | null = null;
let sharedVersionStatusAt = 0;
let sharedVersionStatusLastAttemptAt = 0;
let sharedVersionFailureCount = 0;
let sharedVersionRetryAt = 0;
let sharedSnapshotFailureCount = 0;
let sharedSnapshotRetryAt = 0;

function hydrateVersionedCache(): void {
  if (publishedCacheHydrated) return;
  publishedCacheHydrated = true;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<PersistedPublishedCampusCache>;
    if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.snapshots)) return;
    for (const record of parsed.snapshots) {
      if (record && typeof record.campusId === "string" && typeof record.versionId === "string"
        && (!record.campus || record.campus.id === record.campusId)) {
        publishedSnapshotsByCampus.set(record.campusId, record as VersionedCampusSnapshot);
      }
    }
    if (Array.isArray(parsed.comingSoon)) {
      cachedComingSoonCampuses = parsed.comingSoon.filter((campus): campus is Campus =>
        Boolean(campus && typeof campus.id === "string" && campus.lifecycleStatus === "coming_soon"),
      );
    }
  } catch {
    publishedSnapshotsByCampus.clear();
    cachedComingSoonCampuses = [];
  }
}

function persistVersionedCache(): void {
  hydrateVersionedCache();
  try {
    const value: PersistedPublishedCampusCache = {
      schemaVersion: 2,
      snapshots: Array.from(publishedSnapshotsByCampus.values()),
      comingSoon: cachedComingSoonCampuses,
    };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(value));
  } catch {
    // Session storage is only an offline optimization.
  }
}

function cachedCampusesForStatus(status: readonly PublishedVersionStatus[]): Campus[] {
  hydrateVersionedCache();
  return status.flatMap((item) => {
    const cached = publishedSnapshotsByCampus.get(item.campus_id);
    return cached?.versionId === item.latest_published_version_id && cached.campus ? [cached.campus] : [];
  });
}

function setCachedSnapshots(status: readonly PublishedVersionStatus[], snapshots: readonly Campus[]): void {
  hydrateVersionedCache();
  const allowedCampusIds = new Set(status.map((item) => item.campus_id));
  for (const campusId of publishedSnapshotsByCampus.keys()) {
    if (!allowedCampusIds.has(campusId)) publishedSnapshotsByCampus.delete(campusId);
  }
  const snapshotsById = new Map(snapshots.map((campus) => [campus.id, campus]));
  for (const item of status) {
    const campus = snapshotsById.get(item.campus_id);
    publishedSnapshotsByCampus.set(item.campus_id, {
      campusId: item.campus_id,
      versionId: item.latest_published_version_id,
      publishedAt: item.published_at,
      campus,
    });
  }
  persistVersionedCache();
}

function reconcilePublishedCache(status: readonly PublishedVersionStatus[]): boolean {
  hydrateVersionedCache();
  const allowedCampusIds = new Set(status.map((item) => item.campus_id));
  let removed = false;
  for (const campusId of publishedSnapshotsByCampus.keys()) {
    if (!allowedCampusIds.has(campusId)) {
      publishedSnapshotsByCampus.delete(campusId);
      removed = true;
    }
  }
  if (removed) persistVersionedCache();
  return removed;
}

function sameCampusObjects(left: readonly Campus[], right: readonly Campus[]): boolean {
  return left.length === right.length && left.every((campus, index) => campus === right[index]);
}

function getSharedVersionStatus(force = false): Promise<PublishedVersionStatus[] | null> {
  hydrateVersionedCache();
  if (sharedVersionStatusRequest) return sharedVersionStatusRequest;
  const now = Date.now();
  if (!force && sharedVersionStatus && now - sharedVersionStatusAt < SHARED_VERSION_STATUS_FRESH_MS) {
    return Promise.resolve(sharedVersionStatus);
  }
  if (!force && now < sharedVersionRetryAt) return Promise.resolve(null);
  if (!force && now - sharedVersionStatusLastAttemptAt < PUBLISHED_VERSION_POLL_INTERVAL_MS - VERSION_STATUS_POLL_DRIFT_TOLERANCE_MS) {
    return Promise.resolve(sharedVersionStatus);
  }
  sharedVersionStatusLastAttemptAt = now;
  const request = shareDirectoryRequest("published-version-status", () => campusService.listPublishedVersionStatus());
  sharedVersionStatusRequest = request as Promise<PublishedVersionStatus[]>;
  return request.then((status) => {
    sharedVersionStatus = status;
    sharedVersionStatusAt = Date.now();
    sharedVersionFailureCount = 0;
    sharedVersionRetryAt = 0;
    return status;
  }, (error) => {
    sharedVersionFailureCount += 1;
    const delay = Math.min(REFRESH_RETRY_BASE_MS * 2 ** (sharedVersionFailureCount - 1), MAX_REFRESH_BACKOFF_MS);
    sharedVersionRetryAt = Date.now() + delay;
    throw error;
  }).finally(() => {
    if (sharedVersionStatusRequest === request) sharedVersionStatusRequest = null;
  });
}

function loadSanitizedPublishedSnapshots(): Promise<Campus[]> {
  if (Date.now() < sharedSnapshotRetryAt) {
    return Promise.reject(new Error("Published campus snapshot retry is deferred."));
  }
  return shareDirectoryRequest("published-sanitized-snapshots", async () => {
    try {
      const snapshots = await campusService.listPublishedSnapshots();
      sharedSnapshotFailureCount = 0;
      sharedSnapshotRetryAt = 0;
      return snapshots;
    } catch (error) {
      sharedSnapshotFailureCount += 1;
      const delay = Math.min(REFRESH_RETRY_BASE_MS * 2 ** (sharedSnapshotFailureCount - 1), MAX_REFRESH_BACKOFF_MS);
      sharedSnapshotRetryAt = Date.now() + delay;
      throw error;
    }
  });
}

function loadComingSoonCampuses(force = false): Promise<Campus[]> {
  hydrateVersionedCache();
  if (!force && cachedComingSoonAt > 0 && Date.now() - cachedComingSoonAt < COMING_SOON_CACHE_TTL_MS) {
    return Promise.resolve(cachedComingSoonCampuses);
  }
  return shareDirectoryRequest("coming-soon-campuses", () => campusService.listComingSoon()).then((campuses) => {
    cachedComingSoonCampuses = campuses;
    cachedComingSoonAt = Date.now();
    persistVersionedCache();
    return campuses;
  });
}

export function resetPublishedCampusDirectoryThrottle(): void {
  sharedDirectoryRequests.clear();
  publishedSnapshotsByCampus.clear();
  publishedCacheHydrated = false;
  cachedComingSoonCampuses = [];
  cachedComingSoonAt = 0;
  sharedVersionStatusRequest = null;
  sharedVersionStatus = null;
  sharedVersionStatusAt = 0;
  sharedVersionStatusLastAttemptAt = 0;
  sharedVersionFailureCount = 0;
  sharedVersionRetryAt = 0;
  sharedSnapshotFailureCount = 0;
  sharedSnapshotRetryAt = 0;
}

function shareDirectoryRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = sharedDirectoryRequests.get(key);
  if (existing) return existing as Promise<T>;
  const request = Promise.resolve().then(load);
  sharedDirectoryRequests.set(key, request);
  void request.then(
    () => { if (sharedDirectoryRequests.get(key) === request) sharedDirectoryRequests.delete(key); },
    () => { if (sharedDirectoryRequests.get(key) === request) sharedDirectoryRequests.delete(key); },
  );
  return request;
}

export function lastCampusStorageKey(userId: string): string {
  return `${LAST_CAMPUS_KEY}:${userId || "guest"}`;
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
  // Do not present a session snapshot as current until the lightweight version
  // RPC confirms that its exact version id is still published.
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const campusesRef = useRef(campuses);
  campusesRef.current = campuses;
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PublicPlatformSettings>(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
  const platformSettingsRef = useRef(platformSettings);
  platformSettingsRef.current = platformSettings;
  const [loading, setLoading] = useState<boolean>(() => campuses.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const hasCampusDataRef = useRef(campuses.length > 0);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const userIdRef = useRef(userId);
  const previousUserIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchPublishedCampuses = useCallback((source: "initial" | "manual" | "poll" | "resume" = "manual"): Promise<void> => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;
    if (!hasCampusDataRef.current && source === "initial") setLoading(true);
    if (source === "initial" || source === "manual") setError(null);

    const request = (async () => {
      try {
        let status: PublishedVersionStatus[] | null;
        if (source === "initial") {
          const settingsPromise = shareDirectoryRequest("settings", () => settingsService.getPublicPlatformSettings());
          const [settingsResult, statusResult] = await Promise.allSettled([
            settingsPromise,
            getSharedVersionStatus(),
          ]);
          if (settingsResult.status === "fulfilled") {
            setPlatformSettings((current) => samePublicSettings(current, settingsResult.value) ? current : settingsResult.value);
            platformSettingsRef.current = settingsResult.value;
          }
          if (statusResult.status === "rejected") throw statusResult.reason;
          status = statusResult.value;
        } else {
          status = await getSharedVersionStatus(source === "manual");
        }
        if (status === null) return;

        const removedCampus = reconcilePublishedCache(status);
        const needsSnapshot = status.some((item) => {
          const cached = publishedSnapshotsByCampus.get(item.campus_id);
          return cached?.versionId !== item.latest_published_version_id;
        });
        if (needsSnapshot) {
          const snapshots = await loadSanitizedPublishedSnapshots();
          setCachedSnapshots(status, snapshots);
        }

        const published = cachedCampusesForStatus(status);
        const shouldRefreshComingSoon = source === "initial" || needsSnapshot || removedCampus;
        const comingSoon = shouldRefreshComingSoon
          ? await loadComingSoonCampuses()
          : cachedComingSoonCampuses;
        const nextListing = studentCampusListing(published, comingSoon);
        const stableListing = sameCampusObjects(campusesRef.current, nextListing)
          ? campusesRef.current
          : nextListing;

        if (stableListing !== campusesRef.current) {
          campusesRef.current = stableListing;
          setCampuses(stableListing);
        }
        hasCampusDataRef.current = stableListing.length > 0;
        setSelectedCampusId((currentId) => currentId && stableListing.some((campus) => campus.id === currentId)
          ? currentId
          : chooseInitialCampus(stableListing, platformSettingsRef.current, userIdRef.current)?.id ?? null);
        setIsCached(false);
        setError(null);
      } catch {
        // Background metadata or snapshot failure leaves the last good map
        // untouched; the shared retry timers bound future attempts.
        if (hasCampusDataRef.current) {
          setError(null);
        } else if (source === "initial" || source === "manual") {
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
      // Preview is read-only and renders exactly the saved candidate passed by
      // the Admin Map Builder; it does not use the published cache.
      setCampuses([previewCampus]);
      hasCampusDataRef.current = true;
      setSelectedCampusId(previewCampus.id);
      setLoading(false);
      setError(null);
      setIsCached(false);
      return;
    }
    void fetchPublishedCampuses("initial");
  }, [fetchPublishedCampuses, previewCampus]);

  // Apply the signed-in student's remembered/default campus without restarting
  // the public version check or map fetch.
  useEffect(() => {
    if (previousUserIdRef.current === userId) return;
    previousUserIdRef.current = userId;
    if (previewCampus || campuses.length === 0) return;
    setSelectedCampusId(chooseInitialCampus(campuses, platformSettings, userId)?.id ?? null);
  }, [userId, previewCampus, campuses, platformSettings]);

  // Every mounted consumer joins the same lightweight version check. Full
  // sanitized snapshots are fetched only after metadata reports a new version.
  useEffect(() => {
    if (previewCampus) return;
    let hiddenAt = 0;
    const interval = window.setInterval(() => {
      void fetchPublishedCampuses("poll");
    }, PUBLISHED_VERSION_POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const wasHiddenLongEnough = hiddenAt > 0 && Date.now() - hiddenAt >= 15_000;
        hiddenAt = 0;
        if (wasHiddenLongEnough) void fetchPublishedCampuses("resume");
      } else {
        hiddenAt = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
    refetch: () => fetchPublishedCampuses("manual"),
  };
}
