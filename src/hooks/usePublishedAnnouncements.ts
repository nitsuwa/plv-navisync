import { useEffect } from "react";
import {
  getPublishedAnnouncements,
  type CampusAnnouncement,
} from "../services/announcementService";
import { useSupabaseRealtimeData } from "./useSupabaseRealtimeData";

const PUBLIC_ANNOUNCEMENT_TABLES = ["announcements", "campuses"] as const;

/**
 * Public announcement feed backed only by Supabase.
 *
 * Postgres Changes provides immediate invalidation for visible inserts and
 * updates. The periodic refresh also handles schedule boundaries and changes
 * that become hidden by RLS, such as archiving an announcement.
 */
export function usePublishedAnnouncements(pollMs = 60_000) {
  const state = useSupabaseRealtimeData<CampusAnnouncement[]>({
    channel: "public-announcements",
    tables: PUBLIC_ANNOUNCEMENT_TABLES,
    load: getPublishedAnnouncements,
  });

  useEffect(() => {
    const interval = window.setInterval(() => void state.refresh(), pollMs);
    return () => window.clearInterval(interval);
  }, [pollMs, state.refresh]);

  return {
    ...state,
    announcements: state.data ?? [],
  };
}
