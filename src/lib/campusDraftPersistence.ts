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
  /** Current editor writes this only after the full campus structure loaded. */
  structureReady?: true;
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
    structureReady: true,
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

function hasAuthoredCampusContent(campus: Campus): boolean {
  const hasFloorContent = (campus.buildings ?? []).some((building) =>
    (building.floors ?? []).some((floor) =>
      (floor.rooms?.length ?? 0) > 0
      || (floor.paths?.length ?? 0) > 0
      || (floor.walls?.length ?? 0) > 0
      || (floor.doors?.length ?? 0) > 0
      || (floor.windows?.length ?? 0) > 0
      || (floor.furniture?.length ?? 0) > 0
      || (floor.stairs?.length ?? 0) > 0
      || (floor.ramps?.length ?? 0) > 0
      || (floor.elevators?.length ?? 0) > 0
      || (floor.labels?.length ?? 0) > 0,
    ),
  );
  return hasFloorContent
    || (campus.paths?.length ?? 0) > 0
    || (campus.markers?.length ?? 0) > 0
    || (campus.decorAssets?.length ?? 0) > 0
    || (campus.navNodes?.length ?? 0) > 0
    || (campus.navEdges?.length ?? 0) > 0
    || (campus.routes?.length ?? 0) > 0
    || (campus.accessibilityFeatures?.length ?? 0) > 0
    || (campus.assemblyPoints?.length ?? 0) > 0
    || (campus.eventOverlays?.length ?? 0) > 0;
}

/**
 * Older editor builds could persist the campus-list card as a draft. That
 * shape has preview buildings but no floor content and no authored top-level
 * collections. Only reject that unmistakable partial shape; a complete draft
 * from an older build remains recoverable even though it has no marker.
 */
function isClearlyPartialCampusDraft(candidate: Campus, persisted: Campus): boolean {
  // `previewBuildingsLoaded` did not exist on the earliest draft records, so
  // an omitted value is also compatible with the old card shape. A complete
  // legacy draft is still protected by the authored-content checks below.
  if (candidate.previewBuildingsLoaded !== true && candidate.previewBuildingsLoaded !== undefined) return false;
  if ((candidate.buildings?.length ?? 0) === 0) return false;
  const buildingsHaveNoFloors = (candidate.buildings ?? []).every((building) => (building.floors?.length ?? 0) === 0);
  const candidateHasNoAuthoredCollections = !hasAuthoredCampusContent(candidate);
  return buildingsHaveNoFloors
    && candidateHasNoAuthoredCollections
    && hasAuthoredCampusContent(persisted);
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
  // structure on first entry. The shape check is intentional even for marked
  // records: a defensive boundary must reject a partial value if an older
  // callback or a future caller ever writes one.
  if (persisted.previewBuildingsLoaded === true
    && isClearlyPartialCampusDraft(record.campus, persisted)) {
    clearCampusDraft(persisted.id);
    return persisted;
  }
  return record.campus;
}
