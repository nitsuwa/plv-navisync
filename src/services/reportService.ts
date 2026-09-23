import { getSupabase } from "../lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../types/database.generated";
import { logActivity, listActivityLogs, type ActivityLogRow } from "./activityLogService";

export type ReportRow = Tables<"reports">;

/** Report lifecycle statuses used by the admin workflow. */
export type ReportStatus = "pending" | "under_review" | "in_progress" | "resolved" | "rejected";

export interface IssueReport {
  id: string;
  /** Null when the campus was permanently deleted; the report remains audit history. */
  campusId: string | null;
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
  updates?: ReportUpdate[];
  internalNotes?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportUpdate {
  text: string;
  date: string;
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

export function normalizeReportStatus(status: string): ReportStatus {
  switch (status) {
    case "investigating":
    case "under_review":
      return "under_review";
    case "in-progress":
    case "in_progress":
      return "in_progress";
    case "dismissed":
      return "rejected";
    case "resolved":
      return "resolved";
    case "rejected":
      return "rejected";
    default:
      return "pending";
  }
}

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
    status: normalizeReportStatus(row.status),
    internalNotes: row.internal_notes,
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Upload photo to the private Supabase bucket. The report id is the first
// path segment because the storage RLS policy uses it to authorize access.
export async function uploadReportImage(
  file: Blob,
  reportId: string,
  client: SupabaseClient<Database> = getSupabase(),
): Promise<{ path: string; url: string | null } | null> {
  try {
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1] || "png";
    const path = `${reportId}/${crypto.randomUUID()}.${ext}`;
    const storage = client.storage.from("report-images");
    const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;

    const { data, error: signedUrlError } = await storage.createSignedUrl(path, 60 * 60);
    return { path, url: signedUrlError ? null : data?.signedUrl ?? null };
  } catch (err) {
    console.warn("Failed uploading report image to storage:", err);
    return null;
  }
}

async function blobToDataUrl(file: Blob): Promise<string | null> {
  if (typeof FileReader === "undefined") return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// Submit a new issue report
export async function submitReport(input: CreateReportInput): Promise<IssueReport> {
  const reportId = crypto.randomUUID();

  let client: SupabaseClient<Database>;
  try {
    client = getSupabase();
  } catch {
    const imageUrl = input.imageFile ? await blobToDataUrl(input.imageFile) : null;
    const localReport: IssueReport = {
      id: reportId,
      campusId: input.campusId ?? null,
      buildingId: input.buildingId || null,
      buildingName: input.buildingName,
      floorId: input.floorId || null,
      floorLabel: input.floorLabel,
      reporterId: "guest-student-id",
      category: input.category || "maintenance",
      priority: input.priority || "medium",
      title: input.title,
      description: input.description,
      status: "pending",
      imageUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveToLocalCache(localReport);
    return localReport;
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData?.user?.id || "guest-student-id";
  const newReport: IssueReport = {
    id: reportId,
    campusId: input.campusId ?? null,
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
    imageUrl: null,
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

    const { data, error } = await client.from("reports").insert(insertPayload).select("*").single();

    if (!error && data) {
      const reportFromDb = toIssueReport(data);
      let imageUrl: string | null = null;
      if (input.imageFile) {
        const uploaded = await uploadReportImage(input.imageFile, reportFromDb.id, client);
        if (uploaded) {
          imageUrl = uploaded.url;
          const { error: imageRowError } = await client.from("report_images").insert({
            report_id: reportFromDb.id,
            storage_path: uploaded.path,
            uploaded_by: userId,
          } satisfies TablesInsert<"report_images">);
          if (imageRowError) console.warn("Report image metadata insert warning:", imageRowError.message);
        }
      }
      const result = { ...reportFromDb, buildingName: input.buildingName, floorLabel: input.floorLabel, imageUrl };
      saveToLocalCache(result);
      return result;
    }
  } catch (err) {
    console.warn("Supabase report insert fallback:", err);
  }

  // Save to local storage for offline / demo mode
  const imageUrl = input.imageFile ? await blobToDataUrl(input.imageFile) : null;
  const localReport = { ...newReport, imageUrl };
  saveToLocalCache(localReport);
  return localReport;
}

function humanizeHistoryAction(action: string): string {
  return action
    .replace(/^report\./, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function hydrateStudentReports(
  reports: IssueReport[],
  client: SupabaseClient<Database>,
): Promise<IssueReport[]> {
  if (reports.length === 0) return reports;
  const from = (table: string) => (client.from as unknown as (name: string) => any)(table);
  const buildingIds = [...new Set(reports.map((report) => report.buildingId).filter(Boolean))] as string[];
  const floorIds = [...new Set(reports.map((report) => report.floorId).filter(Boolean))] as string[];
  const reportIds = reports.map((report) => report.id);

  const read = async (query: any): Promise<any[]> => {
    try {
      const { data, error } = await query;
      if (error) return [];
      return data ?? [];
    } catch {
      return [];
    }
  };

  const [buildingRows, floorRows, imageRows, historyRows] = await Promise.all([
    buildingIds.length ? read(from("buildings").select("id,name").in("id", buildingIds)) : Promise.resolve([]),
    floorIds.length ? read(from("floors").select("id,name").in("id", floorIds)) : Promise.resolve([]),
    read(from("report_images").select("report_id,storage_path,created_at").in("report_id", reportIds)),
    read(from("report_history").select("report_id,action,new_status,note,created_at").in("report_id", reportIds).order("created_at", { ascending: true })),
  ]);

  const buildingNames = new Map(buildingRows.map((row) => [row.id, row.name]));
  const floorNames = new Map(floorRows.map((row) => [row.id, row.name]));
  const imageByReport = new Map<string, string>();
  await Promise.all(imageRows.map(async (image) => {
    try {
      const { data } = await client.storage.from("report-images").createSignedUrl(image.storage_path, 60 * 60);
      if (data?.signedUrl && !imageByReport.has(image.report_id)) imageByReport.set(image.report_id, data.signedUrl);
    } catch {
      // Keep the report usable when an image has expired or was removed.
    }
  }));

  const updatesByReport = new Map<string, ReportUpdate[]>();
  historyRows.forEach((history) => {
    const text = history.note?.trim() || (history.new_status
      ? `Status changed to ${humanizeHistoryAction(normalizeReportStatus(history.new_status))}`
      : humanizeHistoryAction(history.action));
    const updates = updatesByReport.get(history.report_id) ?? [];
    updates.push({ text, date: history.created_at });
    updatesByReport.set(history.report_id, updates);
  });

  return reports.map((report) => ({
    ...report,
    buildingName: report.buildingName ?? (report.buildingId ? buildingNames.get(report.buildingId) : undefined),
    floorLabel: report.floorLabel ?? (report.floorId ? floorNames.get(report.floorId) : undefined),
    imageUrl: report.imageUrl ?? imageByReport.get(report.id) ?? null,
    updates: updatesByReport.get(report.id) ?? [{ text: "Report submitted", date: report.createdAt }],
  }));
}

// Get submitted report history for student
export async function getStudentReports(): Promise<IssueReport[]> {
  let client: SupabaseClient<Database> | null = null;
  try {
    client = getSupabase();
  } catch {
    const localReports = getLocalCachedReports();
    return localReports.map((report) => ({
      ...report,
      status: normalizeReportStatus(report.status),
      updates: report.updates ?? [{ text: "Report submitted", date: report.createdAt }],
    }));
  }

  let userData: Awaited<ReturnType<typeof client.auth.getUser>>["data"] | null = null;
  try {
    ({ data: userData } = await client.auth.getUser());
  } catch {
    // Treat an expired or unavailable session as an offline/local-read case.
  }
  const userId = userData?.user?.id;
  let dbReports: IssueReport[] = [];

  if (userId) {
    try {
      const { data, error } = await client
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
  localReports.forEach((r) => map.set(r.id, {
    ...r,
    status: normalizeReportStatus(r.status),
    updates: r.updates ?? [{ text: "Report submitted", date: r.createdAt }],
  }));
  dbReports.forEach((r) => {
    const local = map.get(r.id);
    map.set(r.id, { ...local, ...r, buildingName: r.buildingName ?? local?.buildingName, floorLabel: r.floorLabel ?? local?.floorLabel, imageUrl: r.imageUrl ?? local?.imageUrl });
  });

  const combined = Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return client ? hydrateStudentReports(combined, client) : combined;
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
  const updates: TablesUpdate<"reports"> = {
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
