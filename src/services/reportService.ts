import { getSupabase } from "../lib/supabase";
import type { Tables, TablesInsert } from "../types/database.generated";
import { logActivity, listActivityLogs, type ActivityLogRow } from "./activityLogService";

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
export async function uploadReportImage(file: Blob): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1] || "png";
    const path = `reports/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from("report-images")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      console.warn("Storage upload warning, using local data URL fallback:", error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage.from("report-images").getPublicUrl(path);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn("Failed uploading report image to storage:", err);
    return null;
  }
}

// Submit a new issue report
export async function submitReport(input: CreateReportInput): Promise<IssueReport> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || "guest-student-id";

  let imageUrl: string | null = null;
  if (input.imageFile) {
    imageUrl = await uploadReportImage(input.imageFile);
  }

  const newReport: IssueReport = {
    id: crypto.randomUUID(),
    campusId: input.campusId || "plv-main-campus",
    buildingId: input.buildingId || null,
    buildingName: input.buildingName,
    floorId: input.floorId || null,
    floorLabel: input.floorLabel,
    reporterId: userId,
    category: input.category || "maintenance",
    priority: input.priority || "medium",
    title: input.title,
    description: input.description,
    status: "pending",
    imageUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Try inserting into Supabase reports table
  try {
    const insertPayload: TablesInsert<"reports"> = {
      id: newReport.id,
      campus_id: newReport.campusId,
      building_id: newReport.buildingId,
      floor_id: newReport.floorId,
      reporter_id: userId !== "guest-student-id" ? userId : "00000000-0000-0000-0000-000000000000",
      category: newReport.category,
      priority: newReport.priority,
      title: newReport.title,
      description: newReport.description,
      status: "pending",
    };

    const { data, error } = await supabase.from("reports").insert(insertPayload).select("*").single();

    if (!error && data) {
      const reportFromDb = toIssueReport(data);
      saveToLocalCache({ ...reportFromDb, buildingName: input.buildingName, floorLabel: input.floorLabel, imageUrl });
      return { ...reportFromDb, buildingName: input.buildingName, floorLabel: input.floorLabel, imageUrl };
    }
  } catch (err) {
    console.warn("Supabase report insert fallback:", err);
  }

  // Save to local storage for offline / demo mode
  saveToLocalCache(newReport);
  return newReport;
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
  const updates: TablesInsert<"reports"> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "resolved") updates.resolved_at = new Date().toISOString();
  if (resolutionNotes !== undefined) updates.resolution_notes = resolutionNotes || null;

  const { error } = await supabase.from("reports").update(updates).eq("id", id);
  if (error) throw error;

  await logActivity({
    action: `report.${status}`,
    entityType: "report",
    entityId: id,
    metadata: resolutionNotes ? { resolutionNotes } : null,
  });
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
  return listActivityLogs({ entityType: "report", entityId: id });
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
