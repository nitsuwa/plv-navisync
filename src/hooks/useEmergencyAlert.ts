import { useEffect, useState } from "react";
import { announcementService } from "../services/announcementService";

export type EmergencyLevel = "info" | "warning" | "critical";

export interface EmergencyAlert {
  active: boolean;
  id: string | null;
  message: string;
  level: EmergencyLevel;
  /** epoch ms from the announcement's creation time */
  updatedAt: number;
}

export const EMPTY_ALERT: EmergencyAlert = {
  active: false,
  id: null,
  message: "",
  level: "critical",
  updatedAt: 0,
};

/** Reads the latest active, published Emergency-severity announcement. */
export function useEmergencyAlert(pollMs = 60_000): EmergencyAlert {
  const [alert, setAlert] = useState<EmergencyAlert>(EMPTY_ALERT);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const announcement = await announcementService.getActiveEmergencyAnnouncement();
        if (!mounted) return;
        if (!announcement) {
          setAlert(EMPTY_ALERT);
          return;
        }
        setAlert({
          active: true,
          id: announcement.id,
          message: `${announcement.title}: ${announcement.content}`,
          level: "critical",
          updatedAt: new Date(announcement.createdAt).getTime() || Date.now(),
        });
      } catch {
        // Retain the last verified alert during a transient network failure.
      }
    };

    void load();
    const id = window.setInterval(() => void load(), pollMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return alert;
}
