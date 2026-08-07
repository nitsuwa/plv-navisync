import { getSupabase } from "../lib/supabase";
import type { Tables, TablesInsert } from "../types/database.generated";
import { logActivity, type ActivityLogRow } from "./activityLogService";

export type ReportRow = Tables<"reports">;

/** Report lifecycle statuses used by the admin workflow. */
export type ReportStatus = "pending" | "under_review" | "in_progress" | "resolved" | "rejected";

export interface IssueReport {
  id: string;
  campusId: string;
  buildingId?: string | null;
  buildingName?: string;
  floorId?: string | null;
  floorLabel?: string;
  reporterId: string;
  category: "accessibility" | "maintenance" | "map_error" | "hazard" | string;
  priority: "low" | "medium" | "high" | "urgent" | string;
  title: string;
  description: string;
  status: ReportStatus | (string & {});
  imageUrl?: string | null;
  internalNotes?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportInput {
  campusId?: string;
  buildingId?: string | null;
  buildingName?: string;
  floorId?: string | null;
  floorLabel?: string;
  category: string;
  priority?: string;
  title: string;
  description: string;
  imageFile?: File | Blob | null;
}

const LOCAL_STORAGE_REPORTS_KEY = "plv_student_submitted_reports_v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper to convert database row to domain IssueReport
export function toIssueReport(row: ReportRow): IssueReport {
  return {
    id: row.id,
    campusId: row.campus_id,
    buildingId: row.building_id,
    floorId: row.floor_id,
    reporterId: row.reporter_id,
    category: row.category,
    priority: row.priority,
    title: row.title,
    description: row.description,
    status: row.status,
    internalNotes: row.internal_notes,
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Upload photo to Supabase storage bucket `report-images`
export async function uploadReportImage(reportId: string, file: Blob): Promise<string> {
  const allowed = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
  const ext = allowed.get(file.type);
  if (!ext) throw new Error("Report photos must be JPEG, PNG, or WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Report photos must be 8 MB or smaller.");
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You must be signed in to upload a report photo.");
  const path = `${reportId}/${crypto.randomUUID()}.${ext}`;
  const uploaded = await supabase.storage.from("report-images").upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const linked = await supabase.from("report_images").insert({ report_id: reportId, storage_path: path, uploaded_by: auth.user.id });
  if (linked.error) { await supabase.storage.from("report-images").remove([path]); throw linked.error; }
  const signed = await supabase.storage.from("report-images").createSignedUrl(path, 3600);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}

function databaseReportCategory(value: string): ReportRow["category"] {
  const mapped: Record<string, ReportRow["category"]> = {
    accessibility: "accessibility_concern", maintenance: "damaged_facility", map_error: "navigation_error", hazard: "safety_concern",
  };
  return mapped[value] ?? (value as ReportRow["category"]);
}

/** Resolve browser/mock map identifiers to a real published database target. */
export async function resolveReportTarget(input: Pick<CreateReportInput, "campusId" | "buildingId" | "floorId">): Promise<{
  campusId: string; buildingId: string | null; floorId: string | null;
}> {
  const supabase = getSupabase();
  if (input.buildingId && UUID.test(input.buildingId)) {
    const { data, error } = await supabase.from("buildings").select("id,campus_id").eq("id", input.buildingId).is("archived_at", null).maybeSingle();
    if (error) throw error;
    if (data) return {
      campusId: data.campus_id,
      buildingId: data.id,
      floorId: input.floorId && UUID.test(input.floorId) ? input.floorId : null,
    };
  }

  let query = supabase.from("campuses").select("id").eq("status", "published").is("archived_at", null);
  if (input.campusId && UUID.test(input.campusId)) query = query.eq("id", input.campusId);
  const { data, error } = await query.order("is_default", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No campus is published yet. Ask an administrator to publish the campus map before submitting reports.");
  return { campusId: data.id, buildingId: null, floorId: null };
}

// Submit a new issue report
export async function submitReport(input: CreateReportInput): Promise<IssueReport> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("You must be signed in to submit a report.");
  const target = await resolveReportTarget(input);

  const newReport: IssueReport = {
    id: crypto.randomUUID(),
    campusId: target.campusId,
    buildingId: target.buildingId,
    buildingName: input.buildingName,
    floorId: target.floorId,
    floorLabel: input.floorLabel,
    reporterId: userId,
    category: databaseReportCategory(input.category || "maintenance"),
    priority: "normal",
    title: input.title,
    description: input.description,
    status: "pending",
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const insertPayload: TablesInsert<"reports"> = {
      id: newReport.id,
      campus_id: newReport.campusId,
      building_id: newReport.buildingId,
      floor_id: newReport.floorId,
      reporter_id: userId,
      category: newReport.category,
      priority: newReport.priority,
      title: newReport.title,
      description: newReport.description,
      status: "pending",
  };

  const { data, error } = await supabase.from("reports").insert(insertPayload).select("*").single();
  if (error) throw error;

  const reportFromDb = toIssueReport(data);
  const imageUrl = input.imageFile ? await uploadReportImage(data.id, input.imageFile) : null;
  const result = { ...reportFromDb, buildingName: input.buildingName, floorLabel: input.floorLabel, imageUrl };
  saveToLocalCache(result);
  return result;
}

// Get submitted report history for student
export async function getStudentReports(): Promise<IssueReport[]> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  let dbReports: IssueReport[] = [];

  if (userId) {
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("reporter_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        dbReports = data.map(toIssueReport);
      }
    } catch {
      // Ignore DB read errors
    }
  }

  const localReports = getLocalCachedReports();
  
  // Combine DB and local reports (unique by id)
  const map = new Map<string, IssueReport>();
  localReports.forEach((r) => map.set(r.id, r));
  dbReports.forEach((r) => map.set(r.id, { ...r, ...map.get(r.id) }));

  const combined = Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return combined;
}

// ── Admin workflow ─────────────────────────────────────────────────────────

export interface ReportFilters {
  status?: ReportStatus | "all";
  category?: string;
  search?: string;
}

/** Count reports still awaiting review (used for the admin sidebar badge). */
export async function countPendingReports(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

/** List every report for the admin review queue, newest first. */
export async function listAllReports(filters: ReportFilters = {}): Promise<IssueReport[]> {
  const supabase = getSupabase();
  let query = supabase.from("reports").select("*").order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);

  const { data, error } = await query;
  if (error) throw error;

  let reports = (data ?? []).map(toIssueReport);
  const q = filters.search?.trim().toLocaleLowerCase();
  if (q) {
    reports = reports.filter((r) =>
      [r.title, r.buildingName, r.category, r.description].filter(Boolean).join(" ").toLocaleLowerCase().includes(q)
    );
  }
  return reports;
}

/** Advance a report through the admin workflow and append an audit entry. */
export async function updateReportStatus(
  id: string,
  status: ReportStatus,
  resolutionNotes?: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("update_report_workflow", {
    p_report_id: id, p_status: status, p_resolution_notes: resolutionNotes ?? null, p_internal_notes: null,
  });
  if (error) throw error;
}

/** Save private admin notes on a report. */
export async function updateReportInternalNotes(id: string, notes: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("reports")
    .update({ internal_notes: notes || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ action: "report.notes", entityType: "report", entityId: id });
}

/** Soft-delete a report by archiving it; the workflow status is left untouched. */
export async function archiveReport(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("reports")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ action: "report.archive", entityType: "report", entityId: id });
}

/** Full audit history for one report. */
export async function getReportHistory(id: string): Promise<ActivityLogRow[]> {
  const { data, error } = await getSupabase().from("report_history").select("*").eq("report_id", id).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, actor_id: row.performed_by, campus_id: null,
    action: `report.${row.new_status ?? row.action}`, entity_type: "report", entity_id: row.report_id,
    metadata: { old_status: row.old_status, new_status: row.new_status, note: row.note }, created_at: row.created_at })) as ActivityLogRow[];
}

// Local Storage Cache Helpers
function getLocalCachedReports(): IssueReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_REPORTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveToLocalCache(report: IssueReport): void {
  try {
    const existing = getLocalCachedReports();
    const updated = [report, ...existing.filter((r) => r.id !== report.id)];
    localStorage.setItem(LOCAL_STORAGE_REPORTS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage write errors
  }
}

export const reportService = {
  submitReport,
  getStudentReports,
  uploadReportImage,
  countPendingReports,
  listAllReports,
  updateReportStatus,
  updateReportInternalNotes,
  archiveReport,
  getReportHistory,
};
