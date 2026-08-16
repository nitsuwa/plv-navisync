import type { Campus } from "../components/map-builder/types";
import type { ValidationIssue, ValidationSeverity } from "../components/map-builder/ValidationErrorsDialog";
import { computeBuildingOverlaps, validateCampusData } from "../lib/campusValidation";
import { reconcileEntranceTransitions } from "../lib/entranceTransitions";
import { dedupeValidationIssues } from "../lib/issueLocate";
import { getSupabase } from "../lib/supabase";
import { validateNavigationGraph } from "../lib/validateNavigationGraph";
import type { Json, Tables } from "../types/database.generated";
import { CampusConflictError, CampusServiceError, campusService } from "./campusService";
import { campusStructureService, serializeCampusStructure } from "./campusStructureService";

export type CampusVersionRow = Tables<"campus_versions">;
export type PublicationValidationStatus = "passed" | "warning" | "failed";

export interface PublicationValidationResult {
  status: PublicationValidationStatus;
  score: number;
  issues: ValidationIssue[];
  errorsCount: number;
  warningsCount: number;
  infoCount: number;
}

export interface DraftSaveResult {
  campus: Campus;
  versionId: string;
  versionNumber: number;
  versionUpdatedAt: string;
}

export interface PublishResult {
  campus: Campus;
  versionId: string;
  versionNumber: number;
  publishedAt: string;
  validation: PublicationValidationResult;
}

export interface PublicationHistoryEntry {
  id: string;
  versionNumber: number;
  state: string;
  changeSummary: string | null;
  validationScore: number | null;
  createdAt: string;
  publishedAt: string | null;
  publisher: { id: string; name: string; email: string } | null;
}

export interface CampusSnapshotComparison {
  draftVersionId: string | null;
  publishedVersionId: string | null;
  changed: boolean;
  changedSections: string[];
}

interface DraftRpcResult {
  version_id: string;
  version_number: number;
  campus_updated_at: string;
  version_updated_at: string;
}

interface PublishRpcResult {
  version_id: string;
  version_number: number;
  published_at: string;
  campus_updated_at: string;
}

interface SupabaseErrorLike {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertPublishingOk(error: SupabaseErrorLike | null, operation: string): void {
  if (!error) return;
  if (error.code === "PT409" || error.code === "40001") throw new CampusConflictError();
  throw new CampusServiceError({
    operation,
    message: error.message,
    code: error.code ?? undefined,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  });
}

function requireConcurrencyToken(campus: Campus): string {
  if (!campus.databaseUpdatedAt) {
    throw new CampusConflictError();
  }
  return campus.databaseUpdatedAt;
}

function baselineSeverity(issue: ValidationIssue): ValidationSeverity {
  if (["overlap", "boundary", "missing_campus_name", "multiple_primary_entrances"].includes(issue.type)) return "error";
  if (["missing_name", "missing_code", "no_floors", "no_building_entrance", "no_primary_entrance"].includes(issue.type)) return "warning";
  return "info";
}

export function validateCampusForPublication(campus: Campus): PublicationValidationResult {
  const baseline = validateCampusData(campus, computeBuildingOverlaps(campus.buildings)).map((issue) => ({
    ...issue,
    severity: issue.severity ?? baselineSeverity(issue),
  }));
  const navigation = validateNavigationGraph(campus).issues;
  const issues = dedupeValidationIssues([...baseline, ...navigation]);
  const errorsCount = issues.filter((issue) => issue.severity === "error").length;
  const warningsCount = issues.filter((issue) => issue.severity === "warning").length;
  const infoCount = issues.filter((issue) => issue.severity === "info" || !issue.severity).length;
  const status: PublicationValidationStatus = errorsCount > 0 ? "failed" : warningsCount > 0 ? "warning" : "passed";
  const score = Math.max(0, 100 - errorsCount * 20 - warningsCount * 5 - infoCount);
  return { status, score, issues, errorsCount, warningsCount, infoCount };
}

/** Build the immutable public payload without short-lived signed URLs or list-preview fields. */
export function createCampusVersionSnapshot(campus: Campus): Json {
  const canonical = reconcileEntranceTransitions(campus);
  const {
    logo: _logo,
    thumbnail: _thumbnail,
    databaseUpdatedAt: _databaseUpdatedAt,
    previewBuildingCount: _previewBuildingCount,
    previewFloorCount: _previewFloorCount,
    previewRoomCount: _previewRoomCount,
    previewBuildingsLoaded: _previewBuildingsLoaded,
    ...snapshot
  } = canonical;
  return JSON.parse(JSON.stringify(snapshot)) as Json;
}

function issuePayload(issue: ValidationIssue): Json {
  const entityId = issue.target?.id ?? issue.buildingId ?? issue.floorId ?? issue.roomId ?? issue.nodeId ?? issue.edgeId;
  return {
    severity: issue.severity ?? "info",
    rule_code: issue.type,
    message: issue.message,
    entity_type: issue.target?.selectionType ?? null,
    entity_id: entityId && UUID_PATTERN.test(entityId) ? entityId : null,
    suggested_resolution: null,
  };
}

function hydratePublicSnapshot(row: Pick<CampusVersionRow, "id" | "snapshot" | "published_at" | "version_number">): Campus | null {
  if (!row.snapshot || typeof row.snapshot !== "object" || Array.isArray(row.snapshot)) return null;
  const snapshot = row.snapshot as unknown as Campus;
  if (!snapshot.id || !Array.isArray(snapshot.buildings)) return null;
  const publishedAt = row.published_at ?? snapshot.publishedAt;
  return {
    ...snapshot,
    publishStatus: "published",
    visibleToStudents: true,
    lifecycleStatus: "published",
    status: "active",
    publishedAt,
    updatedAt: publishedAt ?? snapshot.updatedAt,
  };
}

async function loadHydratedCampus(campusId: string): Promise<Campus> {
  const campus = await campusService.getById(campusId);
  if (!campus) throw new Error("Campus no longer exists.");
  return campusStructureService.load(campus);
}

export async function saveCampusDraft(campus: Campus, changeSummary = "Map Builder draft save"): Promise<DraftSaveResult> {
  const { data, error } = await getSupabase().rpc("save_campus_draft", {
    p_campus_id: campus.id,
    p_structure: serializeCampusStructure(campus) as Json,
    p_snapshot: createCampusVersionSnapshot(campus),
    p_change_summary: changeSummary,
    p_expected_updated_at: requireConcurrencyToken(campus),
  });
  assertPublishingOk(error, "save campus draft");
  const result = data as unknown as DraftRpcResult;
  const hydrated = await loadHydratedCampus(campus.id);
  return {
    campus: {
      ...hydrated,
      databaseUpdatedAt: result.campus_updated_at,
      updatedAt: result.campus_updated_at,
    },
    versionId: result.version_id,
    versionNumber: result.version_number,
    versionUpdatedAt: result.version_updated_at,
  };
}

export async function publishCampusDraft(campus: Campus): Promise<PublishResult> {
  const db = getSupabase();
  const { data: draft, error: draftError } = await db
    .from("campus_versions")
    .select("*")
    .eq("campus_id", campus.id)
    .eq("state", "draft")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertPublishingOk(draftError, "load campus draft version");
  if (!draft) throw new Error("Save this campus as a draft before publishing.");

  const validation = validateCampusForPublication(campus);
  if (validation.status === "failed") {
    throw new CampusServiceError({
      operation: "publish campus draft",
      message: `Resolve ${validation.errorsCount} blocking validation issue${validation.errorsCount === 1 ? "" : "s"} before publishing.`,
      code: "23514",
    });
  }

  const { error: validationError } = await db.rpc("record_campus_validation", {
    p_version_id: draft.id,
    p_status: validation.status,
    p_score: validation.score,
    p_issues: validation.issues.map(issuePayload),
  });
  assertPublishingOk(validationError, "record campus validation");

  const { data, error } = await db.rpc("publish_validated_campus_draft", {
    p_version_id: draft.id,
    p_expected_updated_at: requireConcurrencyToken(campus),
  });
  assertPublishingOk(error, "publish campus draft");
  const result = data as unknown as PublishRpcResult;
  const hydrated = await loadHydratedCampus(campus.id);
  return {
    campus: {
      ...hydrated,
      publishStatus: "published",
      visibleToStudents: true,
      lifecycleStatus: "published",
      publishedAt: result.published_at,
      databaseUpdatedAt: result.campus_updated_at,
      updatedAt: result.campus_updated_at,
    },
    versionId: result.version_id,
    versionNumber: result.version_number,
    publishedAt: result.published_at,
    validation,
  };
}

export async function unpublishCampusMap(campus: Campus): Promise<Campus> {
  const { error } = await getSupabase().rpc("unpublish_campus_map", {
    p_campus_id: campus.id,
    p_expected_updated_at: requireConcurrencyToken(campus),
  });
  assertPublishingOk(error, "unpublish campus map");
  return loadHydratedCampus(campus.id);
}

export async function archiveCampusMap(campus: Campus): Promise<Campus> {
  const { error } = await getSupabase().rpc("archive_campus_map", {
    p_campus_id: campus.id,
    p_expected_updated_at: requireConcurrencyToken(campus),
  });
  assertPublishingOk(error, "archive campus map");
  const archived = await campusService.getById(campus.id);
  if (!archived) throw new Error("Campus no longer exists.");
  return archived;
}

export async function discardCampusDraft(campus: Campus, versionId: string): Promise<Campus> {
  const { error } = await getSupabase().rpc("discard_campus_draft", {
    p_version_id: versionId,
    p_expected_updated_at: requireConcurrencyToken(campus),
  });
  assertPublishingOk(error, "discard campus draft");
  return loadHydratedCampus(campus.id);
}

export async function listPublishedCampusSnapshots(): Promise<Campus[]> {
  const { data, error } = await getSupabase()
    .from("campus_versions")
    .select("id,snapshot,published_at,version_number")
    .eq("state", "published")
    .order("published_at", { ascending: false });
  assertPublishingOk(error, "load published campus maps");
  return (data ?? []).map(hydratePublicSnapshot).filter((campus): campus is Campus => campus !== null);
}

export async function listPublicationHistory(campusId: string): Promise<PublicationHistoryEntry[]> {
  const db = getSupabase();
  const { data: versions, error } = await db
    .from("campus_versions")
    .select("*")
    .eq("campus_id", campusId)
    .order("version_number", { ascending: false });
  assertPublishingOk(error, "load publication history");
  const publisherIds = [...new Set((versions ?? []).map((row) => row.published_by).filter((id): id is string => Boolean(id)))];
  const { data: publishers, error: publishersError } = publisherIds.length
    ? await db.from("profiles").select("id,first_name,last_name,email").in("id", publisherIds)
    : { data: [], error: null };
  assertPublishingOk(publishersError, "load publication publishers");
  const byId = new Map((publishers ?? []).map((profile) => [profile.id, profile]));
  return (versions ?? []).map((row) => {
    const publisher = row.published_by ? byId.get(row.published_by) : undefined;
    return {
      id: row.id,
      versionNumber: row.version_number,
      state: row.state,
      changeSummary: row.change_summary,
      validationScore: row.validation_score,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      publisher: publisher ? {
        id: publisher.id,
        name: `${publisher.first_name} ${publisher.last_name}`.trim(),
        email: publisher.email,
      } : null,
    };
  });
}

function snapshotObject(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json> : {};
}

export function compareCampusVersionSnapshots(draft: Json, published: Json): CampusSnapshotComparison {
  const draftObject = snapshotObject(draft);
  const publishedObject = snapshotObject(published);
  const ignored = new Set(["updatedAt", "publishedAt", "publishStatus", "visibleToStudents", "lifecycleStatus"]);
  const keys = [...new Set([...Object.keys(draftObject), ...Object.keys(publishedObject)])]
    .filter((key) => !ignored.has(key))
    .sort();
  const changedSections = keys.filter((key) => JSON.stringify(draftObject[key]) !== JSON.stringify(publishedObject[key]));
  return { draftVersionId: null, publishedVersionId: null, changed: changedSections.length > 0, changedSections };
}

export async function getCampusDraftComparison(campusId: string): Promise<CampusSnapshotComparison> {
  const { data, error } = await getSupabase()
    .from("campus_versions")
    .select("id,state,snapshot,version_number")
    .eq("campus_id", campusId)
    .in("state", ["draft", "published"])
    .order("version_number", { ascending: false });
  assertPublishingOk(error, "compare campus versions");
  const draft = (data ?? []).find((row) => row.state === "draft");
  const published = (data ?? []).find((row) => row.state === "published");
  const comparison = compareCampusVersionSnapshots(draft?.snapshot ?? {}, published?.snapshot ?? {});
  return {
    ...comparison,
    draftVersionId: draft?.id ?? null,
    publishedVersionId: published?.id ?? null,
  };
}

export const campusPublishingService = {
  saveDraft: saveCampusDraft,
  publish: publishCampusDraft,
  unpublish: unpublishCampusMap,
  archive: archiveCampusMap,
  discardDraft: discardCampusDraft,
  listPublished: listPublishedCampusSnapshots,
  listHistory: listPublicationHistory,
  compareDraft: getCampusDraftComparison,
  validate: validateCampusForPublication,
  snapshot: createCampusVersionSnapshot,
};
