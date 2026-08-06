import { getSupabase } from "../lib/supabase";
import type { Tables } from "../types/database.generated";

export type AnnouncementRow = Tables<"announcements">;
export type EventRow = Tables<"events">;

export interface CampusAnnouncement {
  id: string;
  title: string;
  content: string;
  category: "general" | "academic" | "urgent" | "event" | string;
  priority: "low" | "medium" | "high" | "urgent" | string;
  status: "published" | "draft" | "archived" | string;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

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
    category: "urgent",
    priority: "medium",
    status: "published",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

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

export async function getPublishedAnnouncements(): Promise<CampusAnnouncement[]> {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        category: row.category,
        priority: row.priority,
        status: row.status,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      }));
    }
  } catch (err) {
    console.warn("Using mock announcements fallback:", err);
  }
  return MOCK_ANNOUNCEMENTS;
}

export async function getUpcomingEvents(): Promise<CampusEvent[]> {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .order("starts_at", { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description || "",
        category: row.category,
        organizer: row.organizer || "PLV Campus",
        buildingId: null,
        buildingName: undefined,
        locationLabel: "Campus Venue",
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

export const eventService = {
  getPublishedAnnouncements,
  getUpcomingEvents,
};
