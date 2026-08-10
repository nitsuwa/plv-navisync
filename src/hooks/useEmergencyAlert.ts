import { useEffect, useState } from "react";
import { settingsService } from "../services/settingsService";

export type EmergencyLevel = "info" | "warning" | "critical";

export interface EmergencyAlert {
  active: boolean;
  message: string;
  level: EmergencyLevel;
  /** epoch ms when the alert was last updated */
  updatedAt: number;
}

export const EMPTY_ALERT: EmergencyAlert = {
  active: false,
  message: "",
  level: "info",
  updatedAt: 0,
};

/**
 * Reads the public emergency-alert settings (`emergency_active`,
 * `emergency_message`, `emergency_level`) from Supabase and polls every 60s so
 * a banner posted by an admin appears on public pages without a reload.
 */
export function useEmergencyAlert(pollMs = 60_000): EmergencyAlert {
  const [alert, setAlert] = useState<EmergencyAlert>(EMPTY_ALERT);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const s = await settingsService.getPublicSettings();
        if (!mounted) return;
        const active = String(s.emergency_active ?? "false") === "true";
        const message = String(s.emergency_message ?? "").trim();
        const level = (String(s.emergency_level ?? "info") as EmergencyLevel);
        const updatedAt =
          typeof s.emergency_updated_at === "number"
            ? s.emergency_updated_at
            : Date.now();
        setAlert({
          active: active && message.length > 0,
          message,
          level: ["info", "warning", "critical"].includes(level) ? level : "info",
          updatedAt,
        });
      } catch {
        if (mounted) setAlert(EMPTY_ALERT);
      }
    };

    load();
    const id = window.setInterval(load, pollMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return alert;
}
