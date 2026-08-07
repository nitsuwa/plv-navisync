import { getSupabase } from "../lib/supabase";
import { DEFAULT_FEATURES } from "../components/map-builder/constants";
import type { Campus } from "../components/map-builder/types";
import type { Tables, TablesInsert, TablesUpdate } from "../types/database.generated";

export type CampusRow = Tables<"campuses">;
export type CampusVersionRow = Tables<"campus_versions">;
export type CampusLifecycleStatus = "draft" | "published" | "unpublished" | "archived";

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

export function deriveCampusLifecycleStatus(row: CampusRow): CampusLifecycleStatus {
  if (row.status === "archived") return "archived";
  if (row.status === "published") return "published";
  return row.latest_published_version_id ? "unpublished" : "draft";
}

function assertOk(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
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

export async function toEditorCampus(row: CampusRow): Promise<Campus> {
  const [logo, thumbnail] = await Promise.all([
    signedImageUrl(row.logo_path),
    signedImageUrl(row.overview_image_path),
  ]);
  const lifecycleStatus = deriveCampusLifecycleStatus(row);
  const day = row.updated_at.slice(0, 10);
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
    buildings: [], markers: [], paths: [], navNodes: [], navEdges: [], routes: [],
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

async function mapRows(rows: CampusRow[]): Promise<Campus[]> {
  return Promise.all(rows.map(toEditorCampus));
}

export async function listCampuses(): Promise<Campus[]> {
  const { data, error } = await getSupabase().from("campuses").select("*").order("is_default", { ascending: false }).order("name");
  assertOk(error);
  return mapRows(data ?? []);
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
  const { data, error } = await getSupabase().from("campuses").insert({
    ...input, code: input.code.trim().toUpperCase(), status: "draft", created_by: userId, updated_by: userId,
  }).select("*").single();
  assertOk(error);
  return toEditorCampus(data!);
}

async function updateWithVersion(id: string, expectedUpdatedAt: string, changes: TablesUpdate<"campuses">): Promise<Campus> {
  const userId = await requireCurrentUserId();
  const { data, error } = await getSupabase().from("campuses").update({ ...changes, updated_by: userId })
    .eq("id", id).eq("updated_at", expectedUpdatedAt).select("*").maybeSingle();
  assertOk(error);
  if (!data) throw new CampusConflictError();
  return toEditorCampus(data);
}

export function updateCampus(id: string, input: CampusUpdateInput, expectedUpdatedAt: string): Promise<Campus> {
  return updateWithVersion(id, expectedUpdatedAt, input);
}

export function archiveCampus(id: string, expectedUpdatedAt: string): Promise<Campus> {
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

export const campusService = {
  list: listCampuses, getById: getCampusById, create: createCampus, update: updateCampus,
  archive: archiveCampus, restore: restoreCampus, unpublish: unpublishCampus, selectActive: selectActiveCampus,
  listVersions: listCampusVersions, validateImage: validateCampusImage, uploadImage: uploadCampusImage,
};
