import { getSupabase } from "../lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../types/database.generated";
import { logActivity } from "./activityLogService";

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
  roomId?: string | null;
  roomName?: string;
  submissionWarning?: string;
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
  roomId?: string | null;
  roomName?: string;
  category: string;
  priority?: string;
  title: string;
  description: string;
  imageFile?: File | Blob | null;
}

export const REPORT_CATEGORIES = ["broken_equipment", "damaged_facility", "electrical_issue", "water_leak", "cleanliness", "accessibility_concern", "safety_concern", "navigation_error", "other"];
const REPORT_COLUMNS = "id,campus_id,building_id,floor_id,map_element_id,reporter_id,category,priority,title,description,status,resolution_notes,created_at,updated_at";

export function normalizeReportCategory(category: string): string {
  const legacy: Record<string, string> = { maintenance: "damaged_facility", accessibility: "accessibility_concern", hazard: "safety_concern", map_error: "navigation_error" };
  const value = legacy[category] ?? category;
  if (!REPORT_CATEGORIES.includes(value)) throw new Error("Choose a valid issue category.");
  return value;
}

export function validateReportImage(file: Blob): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG, or WebP photo.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The photo must be 5 MB or smaller.");
}

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
    roomId: row.map_element_id,
    reporterId: row.reporter_id,
    category: row.category,
    priority: row.priority,
    title: row.title,
    description: row.description,
    status: normalizeReportStatus(row.status),
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

// Submission succeeds only after the database confirms persistence. No local-only
// report may masquerade as a report delivered to campus staff.
export async function submitReport(input: CreateReportInput): Promise<IssueReport> {
  const client = getSupabase();
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) throw new Error("Sign in to submit a report.");
  if (!input.campusId || !input.buildingId) throw new Error("Choose a published building before reporting.");
  if (!input.title.trim() || !input.description.trim()) throw new Error("Describe the issue before submitting.");
  if (input.imageFile) validateReportImage(input.imageFile);
  const payload: TablesInsert<"reports"> = {
    id: crypto.randomUUID(), campus_id: input.campusId, building_id: input.buildingId,
    floor_id: input.floorId || null, map_element_id: input.roomId || null,
    reporter_id: userData.user.id, category: normalizeReportCategory(input.category),
    priority: "normal", title: input.title.trim(), description: input.description.trim(), status: "pending",
  };
  const { data, error } = await client.from("reports").insert(payload).select(REPORT_COLUMNS).single();
  if (error || !data) throw new Error(error?.message || "The report was not saved. Please try again.");
  const report = toIssueReport(data as ReportRow);
  report.buildingName = input.buildingName;
  report.floorLabel = input.floorLabel;
  report.roomName = input.roomName;
  if (input.imageFile) {
    try {
      const uploaded = await uploadReportImage(input.imageFile, report.id, client);
      if (uploaded) {
        const { error: imageError } = await client.from("report_images").insert({
          report_id: report.id, storage_path: uploaded.path, uploaded_by: userData.user.id,
        });
        if (!imageError) report.imageUrl = uploaded.url;
        else {
          await client.storage.from("report-images").remove([uploaded.path]).catch(() => undefined);
          report.submissionWarning = "Your report was saved, but the photo could not be attached.";
        }
      } else report.submissionWarning = "Your report was saved, but the photo could not be uploaded.";
    } catch {
      // The report is already persisted. Do not invite a duplicate submission
      // when only the optional attachment request failed.
      report.submissionWarning = "Your report was saved, but the photo could not be attached.";
    }
  }
  return report;
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
  const roomIds = reports.map(report => report.roomId).filter(Boolean) as string[];

  const read = async (query: any): Promise<any[]> => {
    try {
      const { data, error } = await query;
      if (error) return [];
      return data ?? [];
    } catch {
      return [];
    }
  };

  const [buildingRows, floorRows, imageRows, historyRows, roomRows] = await Promise.all([
    buildingIds.length ? read(from("buildings").select("id,name").in("id", buildingIds)) : Promise.resolve([]),
    floorIds.length ? read(from("floors").select("id,name").in("id", floorIds)) : Promise.resolve([]),
    read(from("report_images").select("report_id,storage_path,created_at").in("report_id", reportIds)),
    read(from("report_history").select("report_id,action,new_status,note,created_at").in("report_id", reportIds).order("created_at", { ascending: true })),
    roomIds.length ? read(from("map_elements").select("id,name").in("id", roomIds)) : Promise.resolve([]),
  ]);

  const buildingNames = new Map(buildingRows.map((row) => [row.id, row.name]));
  const floorNames = new Map(floorRows.map((row) => [row.id, row.name]));
  const roomNames = new Map(roomRows.map((row) => [row.id, row.name]));
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
    roomName: report.roomName ?? (report.roomId ? roomNames.get(report.roomId) : undefined),
    imageUrl: report.imageUrl ?? imageByReport.get(report.id) ?? null,
    updates: updatesByReport.get(report.id) ?? [{ text: "Report submitted", date: report.createdAt }],
  }));
}

// Read only the signed-in student's persisted reports. Legacy shared-browser
// caches are intentionally neither read nor deleted: they may contain unsent drafts.
export async function getStudentReports(): Promise<IssueReport[]> {
  const client = getSupabase();
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) throw new Error("Sign in to view your reports.");
  const { data, error } = await client.from("reports").select(REPORT_COLUMNS)
    .eq("reporter_id", userData.user.id).is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrateStudentReports((data ?? []).map(row => toIssueReport(row as ReportRow)), client);
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
    .is("archived_at", null)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

/** List every report for the admin review queue, newest first. */
export async function listAllReports(filters: ReportFilters = {}): Promise<IssueReport[]> {
  const supabase = getSupabase();
  let query = supabase.from("reports").select(REPORT_COLUMNS).is("archived_at", null).order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);

  const { data, error } = await query;
  if (error) throw error;

  let reports = await hydrateStudentReports((data ?? []).map(row => toIssueReport(row as ReportRow)), supabase);
  if (reports.length) {
    const { data: notes, error: notesError } = await supabase.from("report_admin_notes")
      .select("report_id,notes").in("report_id", reports.map(report => report.id));
    if (notesError) throw new Error("Admin notes could not be loaded. Apply the reporting migration and try again.");
    reports = reports.map(report => ({ ...report, internalNotes: notes?.find(note => note.report_id === report.id)?.notes ?? null }));
  }
  const q = filters.search?.trim().toLocaleLowerCase();
  if (q) {
    reports = reports.filter((r) =>
      [r.title, r.buildingName, r.floorLabel, r.roomName, r.category, r.description].filter(Boolean).join(" ").toLocaleLowerCase().includes(q)
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
  if (status === "resolved" && !resolutionNotes?.trim()) throw new Error("Resolution notes are required.");
  const updates: TablesUpdate<"reports"> = {
    status,
    updated_at: new Date().toISOString(),
  };
  updates.resolved_at = status === "resolved" ? new Date().toISOString() : null;
  if (resolutionNotes !== undefined) updates.resolution_notes = resolutionNotes || null;

  const { data, error } = await supabase.from("reports").update(updates).eq("id", id).select("id").single();
  if (error || !data) throw new Error(error?.message || "Report not found or update not permitted.");

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
  const { data, error } = await supabase.from("report_admin_notes")
    .upsert({ report_id: id, notes: notes.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "report_id" })
    .select("report_id").single();
  if (error || !data) throw new Error(error?.message || "Admin notes could not be saved.");

  await logActivity({ action: "report.notes", entityType: "report", entityId: id });
}

/** Soft-delete a report by archiving it; the workflow status is left untouched. */
export async function archiveReport(id: string): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reports")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).select("id").single();
  if (error || !data) throw new Error(error?.message || "Report not found or archive not permitted.");

  await logActivity({ action: "report.archive", entityType: "report", entityId: id });
}

/** Full audit history for one report. */
export async function getReportHistory(id: string): Promise<Tables<"report_history">[]> {
  const { data, error } = await getSupabase().from("report_history").select("*")
    .eq("report_id", id).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
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
