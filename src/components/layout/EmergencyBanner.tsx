import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Info, ShieldAlert, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEmergencyAlert, type EmergencyLevel } from "../../hooks/useEmergencyAlert";
import { usePublishedAnnouncements } from "../../hooks/usePublishedAnnouncements";
import { cn } from "../../lib/utils";

const STYLES: Record<
  EmergencyLevel,
  { bg: string; text: string; border: string; icon: typeof Info }
> = {
  info: {
    bg: "bg-sky-600",
    text: "text-white",
    border: "border-sky-400/40",
    icon: Info,
  },
  warning: {
    bg: "bg-amber-500",
    text: "text-white",
    border: "border-amber-300/40",
    icon: AlertTriangle,
  },
  critical: {
    bg: "bg-red-600",
    text: "text-white",
    border: "border-red-400/40",
    icon: ShieldAlert,
  },
};

/**
 * Full-width public announcement banner. Published admin announcements arrive
 * through Supabase Realtime; the legacy emergency setting remains a fallback.
 */
export function EmergencyBanner() {
  const emergencyAlert = useEmergencyAlert();
  const { announcements } = usePublishedAnnouncements();
  const [dismissed, setDismissed] = useState(false);

  const announcement = announcements[0];
  const announcementLevel: EmergencyLevel =
    announcement?.priority === "urgent" || announcement?.category === "emergency"
      ? "critical"
      : announcement?.priority === "high"
        ? "warning"
        : "info";
  const alert = announcement
    ? {
        active: true,
        message: announcement.content,
        title: announcement.title,
        level: announcementLevel,
        key: announcement.id,
      }
    : {
        active: emergencyAlert.active,
        message: emergencyAlert.message,
        title: "Campus advisory",
        level: emergencyAlert.level,
        key: `emergency-${emergencyAlert.updatedAt}`,
      };

  useEffect(() => {
    setDismissed(false);
  }, [alert.key]);

  const show = alert.active && !dismissed;
  const style = STYLES[alert.level];
  const Icon = style.icon;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={cn("overflow-hidden border-b", style.bg, style.border)}
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
            <Icon className={cn("h-4 w-4 shrink-0 animate-pulse", style.text)} />
            <div className={cn("flex-1 min-w-0", style.text)}>
              <p className="text-xs font-extrabold truncate">{alert.title}</p>
              <p className="text-[11px] font-medium opacity-95 line-clamp-1">{alert.message}</p>
            </div>
            {announcement && (
              <Link
                to="/announcements"
                className={cn("hidden sm:inline text-[11px] font-extrabold underline underline-offset-2 shrink-0", style.text)}
              >
                View all
              </Link>
            )}
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss emergency alert"
              className={cn(
                "shrink-0 w-6 h-6 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                style.text
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
