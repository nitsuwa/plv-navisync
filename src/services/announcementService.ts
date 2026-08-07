import { getSupabase } from "../lib/supabase";
import { resolveActiveCampusId } from "./campusService";
import type { Tables, TablesInsert } from "../types/database.generated";
import { logActivity } from "./activityLogService";

export type AnnouncementRow = Tables<"announcements">;

export type AnnouncementCategory = "general" | "academic" | "event" | "emergency" | "maintenance";
export type AnnouncementPriority = "low" | "normal" | "high" | "urgent";
export type AnnouncementStatus = "draft" | "published" | "archived";

/** Public-facing announcement shape (consumed by the landing page). */
export interface CampusAnnouncement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory | (string & {});
  priority: AnnouncementPriority | (string & {});
  status: AnnouncementStatus | (string & {});
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

/** Admin-facing announcement shape. */
export interface ManagedAnnouncement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  startsAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AnnouncementInput {
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  startsAt?: string | null;
  expiresAt?: string | null;
}

export interface AnnouncementFilters {
  status?: AnnouncementStatus | "all";
  category?: AnnouncementCategory | "all";
  search?: string;
}

const MOCK_ANNOUNCEMENTS: CampusAnnouncement[] = [
  {
    id: "anc-1",
    title: "Second Semester Registration & Enrolment Guidelines",
    content: "Official enrolment schedule for AY 2025-2026. Please check your student portal for priority appointment dates.",
    category: "academic",
    priority: "high",
    status: "published",
    createdAt: new Date().toISOString(),
  },
  {
    id: "anc-2",
    title: "Main Academic Building Elevator Maintenance",
    content: "Elevator B in the MAB will undergo scheduled servicing on Friday. Please use stairs or Elevator A.",
    category: "maintenance",
    priority: "normal",
    status: "published",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

function toCampusAnnouncement(row: AnnouncementRow): CampusAnnouncement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    priority: row.priority,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function toManagedAnnouncement(row: AnnouncementRow): ManagedAnnouncement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category as AnnouncementCategory,
    priority: row.priority as AnnouncementPriority,
    status: (row.status as AnnouncementStatus) || "draft",
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/** Public reader: only published, non-expired announcements, newest first. */
export async function getPublishedAnnouncements(): Promise<CampusAnnouncement[]> {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("status", "published")
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      // Filter expiry client-side to avoid brittle PostgREST `or()` filters.
      const now = Date.now();
      const visible = data.filter(
        (row) => !row.expires_at || new Date(row.expires_at).getTime() >= now
      );
      if (visible.length > 0) return visible.map(toCampusAnnouncement);
    }
  } catch (err) {
    console.warn("Using mock announcements fallback:", err);
  }
  return MOCK_ANNOUNCEMENTS;
}

// ── Admin announcement management ─────────────────────────────────────────

/** List all announcements (including drafts and archived) for the admin queue. */
export async function listAnnouncements(filters: AnnouncementFilters = {}): Promise<ManagedAnnouncement[]> {
  const supabase = getSupabase();
  let query = supabase.from("announcements").select("*").order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);

  const { data, error } = await query;
  if (error) throw error;

  let announcements = (data ?? []).map(toManagedAnnouncement);
  const q = filters.search?.trim().toLocaleLowerCase();
  if (q) {
    announcements = announcements.filter((a) =>
      [a.title, a.content, a.category].filter(Boolean).join(" ").toLocaleLowerCase().includes(q)
    );
  }
  return announcements;
}

/** Create an announcement. Defaults to draft when no status is given. */
export async function createAnnouncement(input: AnnouncementInput): Promise<ManagedAnnouncement> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("You must be signed in to post an announcement.");

  const campusId = await resolveActiveCampusId();
  if (!campusId) throw new Error("No active campus found. Create a campus before posting announcements.");

  const row: TablesInsert<"announcements"> = {
    campus_id: campusId,
    title: input.title,
    content: input.content,
    category: input.category,
    priority: input.priority,
    status: input.status,
    starts_at: input.startsAt ?? null,
    expires_at: input.expiresAt ?? null,
    created_by: userId,
  };

  const { data, error } = await supabase.from("announcements").insert(row).select("*").single();
  if (error) throw error;

  await logActivity({
    action: input.status === "published" ? "announcement.publish" : "announcement.create",
    entityType: "announcement",
    entityId: data.id,
    metadata: { title: input.title },
  });
  return toManagedAnnouncement(data);
}

/** Update an announcement's fields. */
export async function updateAnnouncement(id: string, changes: Partial<AnnouncementInput>): Promise<void> {
  const supabase = getSupabase();
  const row: TablesInsert<"announcements"> = { updated_at: new Date().toISOString() };
  if (changes.title !== undefined) row.title = changes.title;
  if (changes.content !== undefined) row.content = changes.content;
  if (changes.category !== undefined) row.category = changes.category;
  if (changes.priority !== undefined) row.priority = changes.priority;
  if (changes.status !== undefined) row.status = changes.status;
  if (changes.startsAt !== undefined) row.starts_at = changes.startsAt ?? null;
  if (changes.expiresAt !== undefined) row.expires_at = changes.expiresAt ?? null;

  const { error } = await supabase.from("announcements").update(row).eq("id", id);
  if (error) throw error;

  await logActivity({ action: "announcement.update", entityType: "announcement", entityId: id });
}

/** Publish a draft announcement so it appears on the public feed. */
export async function publishAnnouncement(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("announcements")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ action: "announcement.publish", entityType: "announcement", entityId: id });
}

/** Archive an announcement (safe delete that hides it everywhere). */
export async function archiveAnnouncement(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("announcements")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ action: "announcement.archive", entityType: "announcement", entityId: id });
}

export const announcementService = {
  getPublishedAnnouncements,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
};
