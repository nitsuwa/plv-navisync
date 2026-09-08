import type { Campus } from "../components/map-builder/types";

/**
 * Draft recovery is intentionally session-scoped: it protects an in-progress
 * map edit when a browser tab is suspended or remounted, without turning the
 * browser into a second source of persisted campus data.  Successful saves
 * remove the record.
 */
const DRAFT_KEY_PREFIX = "plv-navisync:campus-draft:";
const DRAFT_VERSION = 1;

export interface CampusDraftRecord {
  version: typeof DRAFT_VERSION;
  campusId: string;
  /** Version of the persisted campus from which this draft was edited. */
  persistedUpdatedAt?: string;
  persistedDatabaseUpdatedAt?: string;
  savedAt: string;
  campus: Campus;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Storage can be unavailable in private browsing or a restricted frame.
    return null;
  }
}

export function campusDraftStorageKey(campusId: string): string {
  return `${DRAFT_KEY_PREFIX}${campusId}`;
}

export function readCampusDraft(campusId: string): CampusDraftRecord | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(campusDraftStorageKey(campusId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CampusDraftRecord>;
    if (value.version !== DRAFT_VERSION || value.campusId !== campusId || !value.campus || value.campus.id !== campusId) {
      store.removeItem(campusDraftStorageKey(campusId));
      return null;
    }
    return value as CampusDraftRecord;
  } catch {
    return null;
  }
}

export function writeCampusDraft(campus: Campus, persistedBaseline?: Campus): void {
  const store = storage();
  if (!store) return;
  const record: CampusDraftRecord = {
    version: DRAFT_VERSION,
    campusId: campus.id,
    persistedUpdatedAt: persistedBaseline?.updatedAt ?? campus.updatedAt,
    persistedDatabaseUpdatedAt: persistedBaseline?.databaseUpdatedAt ?? campus.databaseUpdatedAt,
    savedAt: new Date().toISOString(),
    campus,
  };
  try {
    store.setItem(campusDraftStorageKey(campus.id), JSON.stringify(record));
  } catch {
    // Draft recovery is best effort. A full server save remains authoritative.
  }
}

export function clearCampusDraft(campusId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(campusDraftStorageKey(campusId));
  } catch {
    // Ignore storage failures; they must never block an editor save.
  }
}

/**
 * Draft writes are allowed only after the page has an authoritative persisted
 * baseline.  During startup a lightweight campus card can briefly exist
 * without its structure; treating that temporary snapshot as an editable
 * empty campus would risk overwriting authored map data.  Keeping this guard
 * pure makes the hydration/save boundary easy to exercise in focused tests.
 */
export function shouldPersistCampusDraft(campus: Campus, persistedSnapshot?: string): boolean {
  if (!persistedSnapshot) return false;
  return persistedSnapshot !== JSON.stringify(campus);
}

/** A structure write is safe only after authoritative hydration for the same campus. */
export function canPersistCampusStructure(
  campus: Campus,
  persistedSnapshot: string | undefined,
  hydrated: boolean,
): boolean {
  if (!hydrated || !persistedSnapshot) return false;
  try {
    const baseline = JSON.parse(persistedSnapshot) as Partial<Campus>;
    return baseline.id === campus.id;
  } catch {
    return false;
  }
}

/**
 * Do not restore a browser draft over a newer server version.  Older records
 * may not have either timestamp, so they remain recoverable for compatibility.
 */
export function campusDraftMatchesBaseline(record: CampusDraftRecord, persisted: Campus): boolean {
  if (record.persistedDatabaseUpdatedAt && persisted.databaseUpdatedAt) {
    return record.persistedDatabaseUpdatedAt === persisted.databaseUpdatedAt;
  }
  if (record.persistedUpdatedAt && persisted.updatedAt) {
    return record.persistedUpdatedAt === persisted.updatedAt;
  }
  return true;
}

export function restoreCampusDraft(persisted: Campus): Campus {
  const record = readCampusDraft(persisted.id);
  if (!record) return persisted;
  if (!campusDraftMatchesBaseline(record, persisted)) {
    clearCampusDraft(persisted.id);
    return persisted;
  }
  // A draft written by an older editor build could have been captured from a
  // lightweight campus card (Buildings present, but paths/gates/floors still
  // absent). Never let that partial snapshot replace a complete persisted
  // structure on first entry. Current drafts are marked complete by the page
  // once the authoritative structure load has finished.
  if (persisted.previewBuildingsLoaded === true && record.campus.previewBuildingsLoaded !== true) {
    clearCampusDraft(persisted.id);
    return persisted;
  }
  return record.campus;
}
