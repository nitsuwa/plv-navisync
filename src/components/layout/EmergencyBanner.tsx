import { useState, useEffect } from "react";
import { AlertTriangle, Info, ShieldAlert, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEmergencyAlert, type EmergencyLevel } from "../../hooks/useEmergencyAlert";
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
 * Full-width emergency broadcast banner. Rendered inside PublicLayout; polls
 * the public settings so an admin-posted alert shows up live.
 */
export function EmergencyBanner() {
  const alert = useEmergencyAlert();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("emergency-dismissed") === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (dismissed) {
      try { sessionStorage.setItem("emergency-dismissed", "1"); } catch {}
    }
  }, [dismissed]);

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
            <p className={cn("text-xs font-bold flex-1 min-w-0", style.text)}>
              {alert.message}
            </p>
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
