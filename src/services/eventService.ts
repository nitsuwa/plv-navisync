import { getSupabase } from "../lib/supabase";
import { resolveActiveCampusId } from "./campusService";
import type { Tables, TablesInsert } from "../types/database.generated";
import { logActivity } from "./activityLogService";
import { getPublishedAnnouncements } from "./announcementService";

export type EventRow = Tables<"events">;
export type EventLocationRow = Tables<"event_locations">;

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  category: "Academic" | "Sports" | "Cultural" | "Administrative" | "Student Affairs" | string;
  organizer: string;
  buildingId?: string | null;
  buildingName?: string;
  locationLabel?: string;
  coverImage?: string | null;
  startsAt: string;
  endsAt: string;
  status: "published" | "upcoming" | "ongoing" | "completed" | string;
}

const MOCK_EVENTS: CampusEvent[] = [
  {
    id: "evt-1",
    title: "PLV Annual Tech & Innovation Summit 2025",
    description: "Join fellow students, industry leaders, and faculty for keynotes on AI, software development, and campus tech solutions.",
    category: "Academic",
    organizer: "College of Information Technology & Engineering",
    buildingId: "b3",
    buildingName: "Library & Learning Resource Center",
    locationLabel: "LRC 3rd Floor Audio-Visual Room",
    coverImage: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80",
    startsAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 2 + 14400000).toISOString(),
    status: "published",
  },
  {
    id: "evt-2",
    title: "Inter-College Basketball Championship Finals",
    description: "Cheer for your college team at the PLV Gymnasium! Gates open 30 minutes before tip-off.",
    category: "Sports",
    organizer: "PLV Athletics & Sports Development",
    buildingId: "b5",
    buildingName: "Gymnasium",
    locationLabel: "Main Arena",
    coverImage: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&auto=format&fit=crop&q=80",
    startsAt: new Date(Date.now() + 86400000 * 4).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 4 + 10800000).toISOString(),
    status: "published",
  },
  {
    id: "evt-3",
    title: "PLV Cultural Arts & Music Festival",
    description: "A celebration of student talent featuring dance performances, live acoustic sets, and art exhibits.",
    category: "Cultural",
    organizer: "Student Center & Arts Club",
    buildingId: "b6",
    buildingName: "Student Services Center",
    locationLabel: "SSC Open Grounds",
    coverImage: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80",
    startsAt: new Date(Date.now() + 86400000 * 7).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 7 + 21600000).toISOString(),
    status: "published",
  },
];

export async function getUpcomingEvents(): Promise<CampusEvent[]> {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    if (!error && data && data.length > 0) {
      // Attach venue labels from event_locations in one follow-up query.
      let locationMap: Record<string, string> = {};
      const ids = data.map((row) => row.id);
      const { data: locations } = await supabase
        .from("event_locations")
        .select("event_id, label")
        .in("event_id", ids);
      (locations ?? []).forEach((loc) => {
        if (!locationMap[loc.event_id]) locationMap[loc.event_id] = loc.label;
      });

      return data.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description || "",
        category: row.category,
        organizer: row.organizer || "PLV Campus",
        buildingId: null,
        buildingName: undefined,
        locationLabel: locationMap[row.id] ?? "Campus Venue",
        coverImage: row.cover_image_path || null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
      }));
    }
  } catch (err) {
    console.warn("Using mock events fallback:", err);
  }
  return MOCK_EVENTS;
}

// ── Admin event management ────────────────────────────────────────────────

export type ManagedEventStatus = "draft" | "published" | "archived";

export interface ManagedEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  organizer: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  status: ManagedEventStatus;
  coverImagePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  title: string;
  description?: string;
  category: string;
  organizer?: string;
  venue?: string;
  startsAt: string;
  endsAt: string;
  status: ManagedEventStatus;
}

export interface EventFilters {
  status?: ManagedEventStatus | "all";
  search?: string;
}

function toManagedEvent(row: EventRow, venues: string[]): ManagedEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    category: row.category,
    organizer: row.organizer || "PLV Campus",
    venue: venues[0] || "Campus Venue",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: (row.status as ManagedEventStatus) || "draft",
    coverImagePath: row.cover_image_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** List all events (including drafts and archived) for the admin queue. */
export async function listEvents(filters: EventFilters = {}): Promise<ManagedEvent[]> {
  const supabase = getSupabase();
  let query = supabase.from("events").select("*").order("starts_at", { ascending: false });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;

  let events = data ?? [];
  if (events.length > 0) {
    const ids = events.map((row) => row.id);
    const { data: locations } = await supabase
      .from("event_locations")
      .select("event_id, label")
      .in("event_id", ids);
    const venueMap: Record<string, string[]> = {};
    (locations ?? []).forEach((loc) => {
      (venueMap[loc.event_id] ??= []).push(loc.label);
    });
    events = events.map((row) => toManagedEvent(row, venueMap[row.id] ?? []));
  }

  const q = filters.search?.trim().toLocaleLowerCase();
  if (q) {
    events = events.filter((e) =>
      [e.title, e.description, e.venue, e.organizer, e.category].join(" ").toLocaleLowerCase().includes(q)
    );
  }
  return events;
}

/** Create an event and its primary venue label. */
export async function createEvent(input: EventInput): Promise<ManagedEvent> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("You must be signed in to create an event.");

  const campusId = await resolveActiveCampusId();
  if (!campusId) throw new Error("No active campus found. Create a campus before adding events.");

  const row: TablesInsert<"events"> = {
    campus_id: campusId,
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    organizer: input.organizer ?? null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    status: input.status,
    created_by: userId,
  };

  const { data, error } = await supabase.from("events").insert(row).select("*").single();
  if (error) throw error;

  const venue = input.venue?.trim();
  if (venue) {
    await supabase.from("event_locations").insert({ event_id: data.id, label: venue });
  }

  await logActivity({ action: "event.create", entityType: "event", entityId: data.id, metadata: { title: input.title } });
  return toManagedEvent(data, venue ? [venue] : []);
}

/** Update an event and its primary venue label. */
export async function updateEvent(id: string, input: Partial<EventInput>): Promise<void> {
  const supabase = getSupabase();
  const changes: TablesInsert<"events"> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = input.description || null;
  if (input.category !== undefined) changes.category = input.category;
  if (input.organizer !== undefined) changes.organizer = input.organizer || null;
  if (input.startsAt !== undefined) changes.starts_at = input.startsAt;
  if (input.endsAt !== undefined) changes.ends_at = input.endsAt;
  if (input.status !== undefined) changes.status = input.status;

  const { error } = await supabase.from("events").update(changes).eq("id", id);
  if (error) throw error;

  if (input.venue !== undefined) {
    const venue = input.venue.trim();
    const { data: locations } = await supabase.from("event_locations").select("id").eq("event_id", id).limit(1);
    if (locations && locations.length > 0) {
      await supabase.from("event_locations").update({ label: venue || "Campus Venue" }).eq("id", locations[0].id);
    } else if (venue) {
      await supabase.from("event_locations").insert({ event_id: id, label: venue });
    }
  }

  await logActivity({ action: "event.update", entityType: "event", entityId: id });
}

/** Archive an event (safe delete that preserves history). */
export async function archiveEvent(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("events")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ action: "event.archive", entityType: "event", entityId: id });
}

export const eventService = {
  getPublishedAnnouncements,
  getUpcomingEvents,
  listEvents,
  createEvent,
  updateEvent,
  archiveEvent,
};
