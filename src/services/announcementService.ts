import { getSupabase } from "../lib/supabase";
import { resolveActiveCampusId, resolvePublishedCampusId } from "./campusService";
import type { Tables, TablesInsert } from "../types/database.generated";
import { logActivity } from "./activityLogService";

export type AnnouncementRow = Tables<"announcements">;
export type AnnouncementLocationRow = Tables<"announcement_locations">;
export type AnnouncementLocationInput = Omit<TablesInsert<"announcement_locations">, "announcement_id">;

export type AnnouncementCategory = "general" | "academic" | "event" | "emergency" | "maintenance";
export type AnnouncementPriority = "low" | "normal" | "high" | "urgent";
export type AnnouncementStatus = "draft" | "published" | "archived";
export type AnnouncementScope = "global" | "campus";

/** Public-facing announcement shape (consumed by the landing page). */
export interface CampusAnnouncement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory | (string & {});
  priority: AnnouncementPriority | (string & {});
  status: AnnouncementStatus | (string & {});
  scope: AnnouncementScope;
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
  scope: AnnouncementScope;
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
  scope?: AnnouncementScope;
  startsAt?: string | null;
  expiresAt?: string | null;
}

export interface AnnouncementFilters {
  status?: AnnouncementStatus | "all";
  category?: AnnouncementCategory | "all";
  search?: string;
}

function toCampusAnnouncement(row: AnnouncementRow): CampusAnnouncement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    priority: row.priority,
    status: row.status,
    scope: row.audience_scope as AnnouncementScope,
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
    scope: (row.audience_scope as AnnouncementScope) || "global",
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
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("status", "published")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // RLS enforces the same publication window. This local check also removes
  // announcements that expire while a public page remains open.
  const now = Date.now();
  return (data ?? [])
    .filter((row) => {
      const hasStarted = !row.starts_at || new Date(row.starts_at).getTime() <= now;
      const hasNotExpired = !row.expires_at || new Date(row.expires_at).getTime() >= now;
      return hasStarted && hasNotExpired;
    })
    .map(toCampusAnnouncement);
}

const NO_PUBLISHED_CAMPUS_MESSAGE =
  "Campus-scoped announcements require a published campus. Choose System-wide or publish the campus first.";

async function requirePublishedCampus(campusId: string | null): Promise<void> {
  if (!campusId) throw new Error(NO_PUBLISHED_CAMPUS_MESSAGE);
  const { data: campus, error: campusError } = await getSupabase()
    .from("campuses")
    .select("id")
    .eq("id", campusId)
    .eq("status", "published")
    .is("archived_at", null)
    .maybeSingle();
  if (campusError) throw campusError;
  if (!campus) throw new Error(NO_PUBLISHED_CAMPUS_MESSAGE);
}

async function requireAnnouncementPublicationAllowed(
  announcementId: string,
  changes: Pick<Partial<AnnouncementInput>, "scope" | "status"> = {},
): Promise<void> {
  const { data, error } = await getSupabase()
    .from("announcements")
    .select("campus_id, audience_scope, status")
    .eq("id", announcementId)
    .single();
  if (error) throw error;

  const nextScope = changes.scope ?? (data.audience_scope as AnnouncementScope);
  const nextStatus = changes.status ?? (data.status as AnnouncementStatus);
  if (nextScope === "campus" && nextStatus === "published") {
    await requirePublishedCampus(data.campus_id);
  }
}

export async function canPublishAnnouncements(): Promise<boolean> {
  return Boolean(await resolvePublishedCampusId());
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

  const scope = input.scope ?? "global";
  const campusId = scope === "campus"
    ? input.status === "published"
      ? await resolvePublishedCampusId()
      : await resolveActiveCampusId()
    : null;
  if (scope === "campus" && input.status === "published" && !campusId) {
    throw new Error(NO_PUBLISHED_CAMPUS_MESSAGE);
  }
  if (scope === "campus" && !campusId) {
    throw new Error("No active campus found. Create a campus or choose a system-wide announcement.");
  }

  const row: TablesInsert<"announcements"> = {
    campus_id: campusId,
    audience_scope: scope,
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
  if (changes.status === "published" || changes.scope !== undefined) {
    await requireAnnouncementPublicationAllowed(id, changes);
  }
  const supabase = getSupabase();
  const row: TablesInsert<"announcements"> = { updated_at: new Date().toISOString() };
  if (changes.title !== undefined) row.title = changes.title;
  if (changes.content !== undefined) row.content = changes.content;
  if (changes.category !== undefined) row.category = changes.category;
  if (changes.priority !== undefined) row.priority = changes.priority;
  if (changes.status !== undefined) row.status = changes.status;
  if (changes.scope !== undefined) row.audience_scope = changes.scope;
  if (changes.startsAt !== undefined) row.starts_at = changes.startsAt ?? null;
  if (changes.expiresAt !== undefined) row.expires_at = changes.expiresAt ?? null;

  const { error } = await supabase.from("announcements").update(row).eq("id", id);
  if (error) throw error;

  await logActivity({ action: "announcement.update", entityType: "announcement", entityId: id });
}

/** Publish a draft announcement so it appears on the public feed. */
export async function publishAnnouncement(id: string): Promise<void> {
  await requireAnnouncementPublicationAllowed(id, { status: "published" });
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

/** Read mapped notices and temporary closures; visibility and expiry are enforced by RLS. */
export async function listAnnouncementLocations(announcementId: string): Promise<AnnouncementLocationRow[]> {
  const { data, error } = await getSupabase().from("announcement_locations").select("*").eq("announcement_id", announcementId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Replace mapped locations, including controlled navigation-edge closures, for an announcement. */
export async function replaceAnnouncementLocations(announcementId: string, locations: AnnouncementLocationInput[]): Promise<AnnouncementLocationRow[]> {
  const supabase = getSupabase();
  const removed = await supabase.from("announcement_locations").delete().eq("announcement_id", announcementId);
  if (removed.error) throw removed.error;
  if (locations.length === 0) return [];
  const { data, error } = await supabase.from("announcement_locations").insert(locations.map((location) => ({ ...location, announcement_id: announcementId }))).select("*");
  if (error) throw error;
  return data ?? [];
}

export const announcementService = {
  getPublishedAnnouncements,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
  listAnnouncementLocations,
  replaceAnnouncementLocations,
  canPublishAnnouncements,
};
