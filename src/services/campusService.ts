import { getSupabase } from "../lib/supabase";
import { DEFAULT_FEATURES } from "../components/map-builder/constants";
import type { Campus, CampusBuilding } from "../components/map-builder/types";
import type { Json, Tables, TablesInsert, TablesUpdate } from "../types/database.generated";
import { serializeCampusStructure } from "./campusStructureService";

export type CampusRow = Tables<"campuses">;
export type CampusVersionRow = Tables<"campus_versions">;
export type CampusLifecycleStatus = "draft" | "published" | "unpublished" | "archived";
type CampusPreviewBuildingRow = Pick<
  Tables<"buildings">,
  "id" | "name" | "code" | "category" | "description" | "x" | "y" | "width" | "height" | "rotation" | "is_visible" | "metadata" | "archived_at"
>;
type CampusListRow = CampusRow & {
  preview_buildings?: CampusPreviewBuildingRow[] | null;
};
type CampusPreviewFloorRow = Pick<Tables<"floors">, "id" | "archived_at"> & { buildings?: { campus_id: string } | null };
type CampusPreviewRoomRow = Pick<Tables<"map_elements">, "id" | "campus_id" | "element_type" | "archived_at">;
type CampusPreviewSummary = { floors: number; rooms: number };

export type CampusCreateInput = Pick<
  TablesInsert<"campuses">,
  "name" | "code" | "description" | "address" | "city" | "province" | "postal_code" |
  "latitude" | "longitude" | "logo_path" | "overview_image_path" | "theme_color" |
  "canvas_width" | "canvas_height" | "canvas_configured" | "map_scale_m_per_unit" | "is_default"
>;

export type CampusUpdateInput = Pick<
  TablesUpdate<"campuses">,
  "name" | "code" | "description" | "address" | "city" | "province" | "postal_code" |
  "latitude" | "longitude" | "logo_path" | "overview_image_path" | "theme_color" |
  "canvas_width" | "canvas_height" | "canvas_configured" | "map_scale_m_per_unit" | "is_default"
>;

export class CampusConflictError extends Error {
  constructor() {
    super("This campus changed in another session. Refresh before saving again.");
    this.name = "CampusConflictError";
  }
}

/**
 * A campus operation failed. Carries the structured PostgREST/Supabase error
 * details (code, details, hint) so development logging and tests can reason
 * about the real failure instead of a generic message.
 */
export class CampusServiceError extends Error {
  /** PostgREST/Supabase error code, e.g. "23514" (check violation). */
  readonly dbCode?: string;
  /** PostgREST `details` (constraint/row details) when available. */
  readonly dbDetails?: string;
  /** PostgREST `hint` when available. */
  readonly dbHint?: string;
  /** The operation that failed, e.g. "create campus". */
  readonly operation: string;

  constructor(opts: { operation: string; message: string; code?: string; details?: string; hint?: string }) {
    super(opts.message);
    this.name = "CampusServiceError";
    this.operation = opts.operation;
    this.dbCode = opts.code;
    this.dbDetails = opts.details;
    this.dbHint = opts.hint;
  }
}

/**
 * Normalize + validate a campus code against the DB contract
 * (`^[A-Z0-9][A-Z0-9_-]{0,29}$` — required, 1-30 chars, no spaces).
 *
 * The INSERT would otherwise be rejected by `campuses_code_format_check` with
 * a cryptic PostgREST error ("Could not save campus"). Failing fast here gives
 * the wizard/UI a clear, user-facing message.
 */
export function normalizeCampusCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!code) {
    throw new CampusServiceError({ operation: "create campus", message: "Campus code is required." });
  }
  if (!/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(code)) {
    throw new CampusServiceError({
      operation: "create campus",
      message: "Campus code must be 1–30 letters, numbers, hyphens, or underscores (no spaces).",
    });
  }
  return code;
}

export function deriveCampusLifecycleStatus(row: CampusRow): CampusLifecycleStatus {
  if (row.status === "archived") return "archived";
  if (row.status === "published") return "published";
  return row.latest_published_version_id ? "unpublished" : "draft";
}

/**
 * Map a campus-operation failure to a concise, user-safe message.
 *
 * Known PostgREST/Supabase codes become friendly one-liners; the full
 * structured detail (code/message/details/hint) stays in the dev console log
 * from `assertOk`. Errors without a recognized DB code keep their own message
 * (e.g. client-side validation or the duplicate-code pre-check).
 */
export function userFacingCampusMessage(error: unknown): string {
  if (error instanceof CampusDeletionError) {
    switch (error.stage) {
      case "storage_list_failed":
      case "storage_remove_failed":
        return "We couldn't remove this campus's stored map files. The campus is still available.";
      case "invalid_lifecycle_state":
        return "This campus is not archived.";
      case "authorization_failed":
        return "Your account is not allowed to permanently delete campuses.";
      case "database_delete_failed":
        if (error.dbCode === "P0002") return "That campus no longer exists. Refresh the campus list.";
        if (error.dbCode === "22023") return "Only archived campuses can be permanently deleted.";
        if (error.dbCode === "42501") return "Your account is not allowed to permanently delete campuses.";
        if (error.dbCode === "23514") return "A protected campus lifecycle dependency prevented deletion. The campus is still available.";
        if (error.dbCode === "P0001" || error.dbCode === "23503") {
          return "A database dependency prevented deletion. The campus is still available.";
        }
        return "We couldn't complete the database deletion. The campus is still available.";
    }
  }
  if (error instanceof CampusServiceError && error.operation.includes("permanently delete") && error.operation.includes("storage")) {
    return "Campus files could not be removed. The campus was not deleted.";
  }
  if (error instanceof CampusServiceError && error.dbCode) {
    if (error.operation.includes("permanently delete")) {
      switch (error.dbCode) {
        case "22023":
          return "Only archived campuses can be permanently deleted.";
        case "42501":
          return "Your account is not allowed to permanently delete campuses.";
        case "23514":
          return "A protected campus lifecycle dependency prevented deletion. The campus is still available.";
        case "23503":
          return "This campus still has protected dependent data. Refresh and try again.";
        case "P0002":
          return "That campus no longer exists. Refresh the campus list.";
        default:
          return "The campus could not be permanently deleted. Try again or refresh the page.";
      }
    }
    switch (error.dbCode) {
      case "23505": // unique_violation
        return "A campus with this code already exists. Choose a different code.";
      case "23514": // check_violation
        return "Some campus details don't meet the required format. Check the code, name, and coordinates.";
      case "23502": // not_null_violation
        return "Some required campus details are missing.";
      case "23503": // foreign_key_violation
        return "This campus references data that no longer exists. Refresh and try again.";
      case "42501": // insufficient_privilege
        return "Your account is not allowed to save campuses.";
      default:
        return "The campus could not be saved. Try again or refresh the page.";
    }
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

interface SupabaseErrorLike {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

function assertOk(error: SupabaseErrorLike | null, operation = "campus operation"): void {
  if (!error) return;
  const wrapped = new CampusServiceError({
    operation,
    message: error.message,
    code: error.code ?? undefined,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  });
  if (import.meta.env.DEV) {
    // Development-only structured diagnostics: code/message/details/hint keep
    // the real Supabase failure visible (e.g. a 23514 check violation naming
    // campuses_code_format_check). Never exposed to normal users.
    console.error(`[campusService] ${operation} failed`, {
      code: wrapped.dbCode,
      message: wrapped.message,
      details: wrapped.dbDetails,
      hint: wrapped.dbHint,
    });
  }
  throw wrapped;
}

async function requireCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser();
  assertOk(error);
  if (!data.user) throw new Error("You must be signed in to manage campuses.");
  return data.user.id;
}

async function signedImageUrl(path: string | null): Promise<string | undefined> {
  if (!path) return undefined;
  const { data, error } = await getSupabase().storage.from("campus-images").createSignedUrl(path, 3600);
  if (error) return undefined;
  return data.signedUrl;
}

function metadataUi(metadata: Json): Partial<CampusBuilding> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const ui = (metadata as { ui?: unknown }).ui;
  return ui && typeof ui === "object" && !Array.isArray(ui) ? ui as Partial<CampusBuilding> : {};
}

function previewBuildings(row: CampusListRow, fallbackColor: string): CampusBuilding[] {
  return (row.preview_buildings ?? [])
    .filter((building) => !building.archived_at)
    .map((building) => {
      const ui = metadataUi(building.metadata);
      return {
        ...ui,
        id: building.id,
        name: building.name,
        code: building.code,
        category: building.category,
        description: building.description ?? "",
        x: building.x,
        y: building.y,
        width: building.width,
        height: building.height,
        rotation: building.rotation,
        visible: building.is_visible,
        color: ui.color ?? fallbackColor,
        floors: [],
      };
    });
}

export async function toEditorCampus(row: CampusListRow, previewSummary?: CampusPreviewSummary): Promise<Campus> {
  const [logo, thumbnail] = await Promise.all([
    signedImageUrl(row.logo_path),
    signedImageUrl(row.overview_image_path),
  ]);
  const lifecycleStatus = deriveCampusLifecycleStatus(row);
  const day = row.updated_at.slice(0, 10);
  const hasPreviewBuildings = row.preview_buildings !== undefined;
  const buildings = hasPreviewBuildings ? previewBuildings(row, row.theme_color) : [];
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    coordinates: row.latitude == null || row.longitude == null ? undefined : { lat: row.latitude, lng: row.longitude },
    logo,
    thumbnail,
    themeColor: row.theme_color,
    status: row.status === "archived" ? "archived" : "active",
    publishStatus: row.status === "published" ? "published" : "draft",
    visibleToStudents: row.status === "published",
    features: { ...DEFAULT_FEATURES },
    canvasW: row.canvas_width,
    canvasH: row.canvas_height,
    canvasConfigured: row.canvas_configured,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings, markers: [], paths: [], navNodes: [], navEdges: [], routes: [],
    previewBuildingCount: hasPreviewBuildings ? buildings.length : undefined,
    previewFloorCount: previewSummary?.floors,
    previewRoomCount: previewSummary?.rooms,
    previewBuildingsLoaded: hasPreviewBuildings,
    accessibilityFeatures: [], assemblyPoints: [], eventOverlays: [], decorAssets: [],
    createdAt: row.created_at.slice(0, 10),
    updatedAt: day,
    publishedAt: lifecycleStatus === "published" ? day : undefined,
    createdBy: row.created_by ?? undefined,
    databaseUpdatedAt: row.updated_at,
    logoPath: row.logo_path ?? undefined,
    overviewImagePath: row.overview_image_path ?? undefined,
    isDefault: row.is_default,
    lifecycleStatus,
  };
}

async function previewStructureSummaries(campusIds: string[]): Promise<Map<string, CampusPreviewSummary>> {
  const summaries = new Map(campusIds.map((id) => [id, { floors: 0, rooms: 0 }]));
  if (campusIds.length === 0) return summaries;
  const db = getSupabase();
  const [floors, rooms] = await Promise.all([
    db
      .from("floors")
      .select("id,archived_at,buildings!inner(campus_id)")
      .in("buildings.campus_id", campusIds)
      .is("archived_at", null),
    db
      .from("map_elements")
      .select("id,campus_id,element_type,archived_at")
      .in("campus_id", campusIds)
      .eq("element_type", "room")
      .is("archived_at", null),
  ]);
  assertOk(floors.error);
  assertOk(rooms.error);
  for (const floor of (floors.data ?? []) as CampusPreviewFloorRow[]) {
    const campusId = floor.buildings?.campus_id;
    if (!campusId || floor.archived_at) continue;
    const summary = summaries.get(campusId);
    if (summary) summary.floors += 1;
  }
  for (const room of (rooms.data ?? []) as CampusPreviewRoomRow[]) {
    if (room.archived_at || room.element_type !== "room") continue;
    const summary = summaries.get(room.campus_id);
    if (summary) summary.rooms += 1;
  }
  return summaries;
}

async function mapRows(rows: CampusListRow[]): Promise<Campus[]> {
  const summaries = await previewStructureSummaries(rows.map((row) => row.id));
  return Promise.all(rows.map((row) => toEditorCampus(row, summaries.get(row.id))));
}

export async function listCampuses(): Promise<Campus[]> {
  const { data, error } = await getSupabase()
    .from("campuses")
    .select("*, preview_buildings:buildings(id,name,code,category,description,x,y,width,height,rotation,is_visible,metadata,archived_at)")
    .order("is_default", { ascending: false })
    .order("name");
  assertOk(error);
  return mapRows((data ?? []) as CampusListRow[]);
}

/** Read the immutable snapshots that are currently visible to students. */
export async function listPublishedCampusSnapshots(): Promise<Campus[]> {
  const { data, error } = await getSupabase()
    .from("campus_versions")
    .select("campus_id,snapshot,published_at")
    .eq("state", "published")
    .order("published_at", { ascending: false });
  assertOk(error, "list published campus versions");
  const result: Campus[] = [];
  for (const row of data ?? []) {
    const snapshot = row.snapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) continue;
    const campus = (snapshot as { campus?: unknown }).campus;
    if (!campus || typeof campus !== "object" || Array.isArray(campus)) continue;
    const value = campus as Campus;
    result.push({
      ...value,
      publishStatus: "published",
      lifecycleStatus: "published",
      visibleToStudents: true,
      publishedAt: row.published_at ?? value.publishedAt,
    });
  }
  return result;
}

/** Choose a usable campus without assuming the database contains one. */
export function selectActiveCampus(campuses: Campus[], preferredId?: string): Campus | null {
  const available = campuses.filter((campus) => campus.status !== "archived");
  return available.find((campus) => campus.id === preferredId)
    ?? available.find((campus) => campus.isDefault)
    ?? available[0]
    ?? null;
}

/**
 * Resolve the id of the campus that new operational records (events,
 * announcements, reports) should attach to.
 *
 * Order of preference:
 *  1. The designated default campus (is_default = true) — the designed path.
 *  2. The non-archived campus with the most real content (building count),
 *     used while no default has been flagged yet (e.g. draft campuses).
 *  3. The earliest-created non-archived campus as a final fallback.
 *
 * Returns null only when no usable campus exists at all.
 */
export async function resolveActiveCampusId(): Promise<string | null> {
  const supabase = getSupabase();

  // 1) Prefer the designated default campus.
  const { data: def } = await supabase
    .from("campuses")
    .select("id")
    .eq("is_default", true)
    .is("archived_at", null)
    .maybeSingle();
  if (def?.id) return def.id;

  // 2/3) Fall back to a non-archived campus, preferring the one with the most
  // real content (buildings) and tie-breaking on earliest creation. PostgREST
  // embedded aggregate `buildings(count)` returns [{ count }] per row.
  const { data: candidates } = await supabase
    .from("campuses")
    .select("id, buildings(count)")
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const rows = (candidates ?? []) as unknown as {
    id: string;
    buildings?: { count: number }[];
  }[];
  const picked = rows
    .slice()
    .sort((a, b) => (b.buildings?.[0]?.count ?? 0) - (a.buildings?.[0]?.count ?? 0))[0];
  return picked?.id ?? null;
}

export async function getCampusById(id: string): Promise<Campus | null> {
  const { data, error } = await getSupabase().from("campuses").select("*").eq("id", id).maybeSingle();
  assertOk(error);
  return data ? toEditorCampus(data) : null;
}

export async function createCampus(input: CampusCreateInput): Promise<Campus> {
  const userId = await requireCurrentUserId();
  const code = normalizeCampusCode(input.code);
  const { data, error } = await getSupabase().from("campuses").insert({
    ...input, code, status: "draft", created_by: userId, updated_by: userId,
  }).select("*").single();
  assertOk(error, "create campus");
  return toEditorCampus(data!);
}

async function updateWithVersion(id: string, expectedUpdatedAt: string, changes: TablesUpdate<"campuses">): Promise<Campus> {
  const userId = await requireCurrentUserId();
  const { data, error } = await getSupabase().from("campuses").update({ ...changes, updated_by: userId })
    .eq("id", id).eq("updated_at", expectedUpdatedAt).select("*").maybeSingle();
  assertOk(error, "update campus");
  if (!data) throw new CampusConflictError();
  return toEditorCampus(data);
}

export function updateCampus(id: string, input: CampusUpdateInput, expectedUpdatedAt: string): Promise<Campus> {
  return updateWithVersion(id, expectedUpdatedAt, input);
}

export async function archiveCampus(id: string, expectedUpdatedAt: string): Promise<Campus> {
  const { data, error } = await getSupabase().from("campuses").select("status").eq("id", id).maybeSingle();
  assertOk(error, "check campus archive eligibility");
  if (!data) throw new Error("Campus not found.");
  if (data.status === "published") {
    throw new Error("Unpublish this campus before archiving it.");
  }
  return updateWithVersion(id, expectedUpdatedAt, { status: "archived", archived_at: new Date().toISOString(), is_default: false });
}

export function restoreCampus(id: string, expectedUpdatedAt: string): Promise<Campus> {
  return updateWithVersion(id, expectedUpdatedAt, { status: "draft", archived_at: null, is_default: false });
}

export function unpublishCampus(id: string, expectedUpdatedAt: string): Promise<Campus> {
  return updateWithVersion(id, expectedUpdatedAt, { status: "draft", archived_at: null });
}

export async function listCampusVersions(campusId: string): Promise<CampusVersionRow[]> {
  const { data, error } = await getSupabase().from("campus_versions").select("*").eq("campus_id", campusId).order("version_number", { ascending: false });
  assertOk(error);
  return data ?? [];
}

const CAMPUS_STORAGE_BUCKETS = ["campus-images", "floor-plans"] as const;
const STORAGE_LIST_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 1000;

type CampusStorageBucket = (typeof CAMPUS_STORAGE_BUCKETS)[number];
type StorageListEntry = { name: string; id?: string | null; metadata?: unknown };

function storagePath(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name;
}

/**
 * Supabase Storage folders are prefixes, not recursively deletable objects.
 * Walk each campus prefix and return only file paths (folder entries have no
 * object id) so the caller can remove them through the Storage API.
 */
export async function listCampusStoragePaths(
  bucket: CampusStorageBucket,
  campusId: string,
): Promise<string[]> {
  const storage = getSupabase().storage.from(bucket);
  const paths: string[] = [];

  const walk = async (prefix: string): Promise<void> => {
    let offset = 0;
    while (true) {
      const { data, error } = await storage.list(prefix, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      assertOk(error, `permanently delete campus storage (${bucket})`);
      const entries = (data ?? []) as StorageListEntry[];
      if (entries.length === 0) break;

      for (const entry of entries) {
        if (!entry?.name) continue;
        const path = storagePath(prefix, entry.name);
        if (entry.id || entry.metadata) {
          paths.push(path);
        } else {
          await walk(path);
        }
      }

      if (entries.length < STORAGE_LIST_PAGE_SIZE) break;
      offset += entries.length;
    }
  };

  await walk(campusId);
  return paths;
}

/** Remove actual campus-owned files through Supabase Storage, in batches. */
export async function removeCampusStoragePaths(
  bucket: CampusStorageBucket,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const storage = getSupabase().storage.from(bucket);
  for (let index = 0; index < paths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await storage.remove(batch);
    assertOk(error, `permanently delete campus storage (${bucket})`);
  }
}

export type CampusDeletionStage =
  | "storage_list_failed"
  | "storage_remove_failed"
  | "invalid_lifecycle_state"
  | "authorization_failed"
  | "database_delete_failed";

/** A permanent-delete failure with an actionable stage for the lifecycle UI. */
export class CampusDeletionError extends CampusServiceError {
  readonly stage: CampusDeletionStage;
  readonly causeError?: unknown;

  constructor(opts: {
    stage: CampusDeletionStage;
    operation: string;
    message: string;
    code?: string;
    details?: string;
    hint?: string;
    cause?: unknown;
  }) {
    super(opts);
    this.name = "CampusDeletionError";
    this.stage = opts.stage;
    this.causeError = opts.cause;
  }
}

function asCampusDeletionError(
  stage: CampusDeletionStage,
  operation: string,
  error: unknown,
  fallbackMessage: string,
): CampusDeletionError {
  if (error instanceof CampusDeletionError) return error;
  if (error instanceof CampusServiceError) {
    return new CampusDeletionError({
      stage,
      operation,
      message: error.message,
      code: error.dbCode,
      details: error.dbDetails,
      hint: error.dbHint,
      cause: error,
    });
  }
  return new CampusDeletionError({
    stage,
    operation,
    message: error instanceof Error ? error.message : fallbackMessage,
    cause: error,
  });
}

/**
 * Clean campus-owned files before invoking the relational delete RPC. Storage
 * and Postgres cannot share a transaction; the caller therefore surfaces any
 * later RPC failure honestly instead of claiming the campus was deleted.
 */
export async function cleanupCampusStorage(campusId: string): Promise<void> {
  // Discover every bucket first. A listing failure must not leave an earlier
  // bucket's files removed while the relational campus still exists.
  const filesByBucket = await Promise.all(
    CAMPUS_STORAGE_BUCKETS.map(async (bucket) => {
      try {
        return { bucket, paths: await listCampusStoragePaths(bucket, campusId) };
      } catch (error) {
        throw asCampusDeletionError(
          "storage_list_failed",
          `permanently delete campus storage (${bucket})`,
          error,
          "Campus storage could not be listed.",
        );
      }
    }),
  );
  for (const { bucket, paths } of filesByBucket) {
    try {
      await removeCampusStoragePaths(bucket, paths);
    } catch (error) {
      throw asCampusDeletionError(
        "storage_remove_failed",
        `permanently delete campus storage (${bucket})`,
        error,
        "Campus storage could not be removed.",
      );
    }
  }
}

async function assertCampusArchivedForPermanentDelete(id: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("campuses")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  try {
    assertOk(error, "check permanent delete eligibility");
  } catch (failure) {
    throw asCampusDeletionError(
      failure instanceof CampusServiceError && failure.dbCode === "42501" ? "authorization_failed" : "database_delete_failed",
      "check permanent delete eligibility",
      failure,
      "Permanent delete eligibility could not be checked.",
    );
  }
  if (!data) {
    throw new CampusDeletionError({
      stage: "invalid_lifecycle_state",
      operation: "check permanent delete eligibility",
      message: "Campus not found.",
    });
  }
  if (data.status !== "archived") {
    throw new CampusDeletionError({
      stage: "invalid_lifecycle_state",
      operation: "check permanent delete eligibility",
      message: "Only archived campuses can be permanently deleted.",
    });
  }
}

/**
 * Permanently delete an archived campus through the Storage API followed by
 * the database-owned lifecycle contract. The RPC performs relational
 * dependency cleanup in one transaction; the browser deliberately never
 * issues child-table deletes itself. Storage and Postgres are separate
 * services, so a later RPC failure is surfaced rather than reported as a
 * successful campus deletion.
 */
export async function permanentlyDeleteCampus(id: string): Promise<void> {
  await assertCampusArchivedForPermanentDelete(id);
  try {
    await cleanupCampusStorage(id);
  } catch (error) {
    throw asCampusDeletionError(
      error instanceof CampusDeletionError ? error.stage : "storage_list_failed",
      "permanently delete campus storage",
      error,
      "Campus storage cleanup failed.",
    );
  }
  const { data, error } = await getSupabase().rpc("permanently_delete_campus", {
    target_campus_id: id,
  });
  try {
    assertOk(error, "permanently delete campus");
  } catch (failure) {
    throw asCampusDeletionError(
      failure instanceof CampusServiceError && failure.dbCode === "42501" ? "authorization_failed" : "database_delete_failed",
      "permanently delete campus",
      failure,
      "The relational campus deletion failed.",
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || (data as { deleted?: unknown }).deleted !== true) {
    throw new CampusDeletionError({
      stage: "database_delete_failed",
      operation: "permanently delete campus",
      message: "The campus delete operation did not return an authoritative confirmation.",
    });
  }
}

const ALLOWED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);
export function validateCampusImage(file: Blob): void {
  if (!ALLOWED_IMAGES.has(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Campus images must be 5 MB or smaller.");
}

export async function uploadCampusImage(campusId: string, kind: "logo" | "overview", file: Blob): Promise<string> {
  validateCampusImage(file);
  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${campusId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabase().storage.from("campus-images").upload(path, file, { contentType: file.type, upsert: false });
  assertOk(error);
  return path;
}

/**
 * Persist the current authored campus as a version and publish it through the
 * database-owned publication contract.  Keeping this operation here means
 * Preview and the eventual public consumer share one immutable snapshot,
 * rather than relying on the editor's in-memory state.
 */
export async function publishCampusVersion(
  campus: Campus,
  validation: { errors: number; warnings: number; passed: number; total: number },
): Promise<Campus> {
  if (validation.errors > 0) {
    throw new Error("Fix the blocking validation issues before publishing this campus.");
  }
  const userId = await requireCurrentUserId();
  const existingVersions = await listCampusVersions(campus.id);
  const nextVersion = existingVersions.reduce((max, version) => Math.max(max, version.version_number), 0) + 1;
  const snapshot = {
    version: 1,
    campus: JSON.parse(JSON.stringify(campus)) as Campus,
    structure: serializeCampusStructure(campus),
  } as unknown as Json;
  const score = validation.total > 0
    ? Math.round((validation.passed / validation.total) * 100)
    : 100;
  const { data: version, error: versionError } = await getSupabase()
    .from("campus_versions")
    .insert({
      campus_id: campus.id,
      version_number: nextVersion,
      state: "draft",
      snapshot,
      validation_score: score,
      change_summary: "Published from Admin Student Preview",
      created_by: userId,
    })
    .select("id")
    .single();
  assertOk(versionError, "create campus publish version");
  if (!version?.id) throw new Error("The publish version was not created.");

  const status = validation.warnings > 0 ? "warning" : "passed";
  const { error: validationError } = await getSupabase()
    .from("validation_runs")
    .insert({
      campus_id: campus.id,
      campus_version_id: version.id,
      status,
      score,
      errors_count: validation.errors,
      warnings_count: validation.warnings,
      passed_count: validation.passed,
      run_by: userId,
    });
  assertOk(validationError, "record campus publish validation");

  const { data: publishedId, error: publishError } = await getSupabase()
    .rpc("publish_campus_version", { p_version_id: version.id });
  assertOk(publishError, "publish campus version");
  if (typeof publishedId !== "string" || publishedId !== version.id) {
    throw new Error("Publishing did not return an authoritative version confirmation.");
  }
  const publishedAt = new Date().toISOString();
  return {
    ...campus,
    publishStatus: "published",
    lifecycleStatus: "published",
    visibleToStudents: true,
    publishedAt,
  };
}

export const campusService = {
  list: listCampuses, getById: getCampusById, create: createCampus, update: updateCampus,
  archive: archiveCampus, restore: restoreCampus, unpublish: unpublishCampus, selectActive: selectActiveCampus,
  listVersions: listCampusVersions, listPublishedSnapshots: listPublishedCampusSnapshots, permanentlyDelete: permanentlyDeleteCampus,
  validateImage: validateCampusImage, uploadImage: uploadCampusImage,
  publishVersion: publishCampusVersion,
};
