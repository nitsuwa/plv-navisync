import { X, CalendarDays, MapPin, Info, Navigation } from "lucide-react";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEscToClose } from "../../hooks/useEscToClose";
import type { CampusEventOverlay } from "../map-builder/types";

interface EventInfoPanelProps {
  event: CampusEventOverlay;
  onClose: () => void;
  onNavigate?: () => void;
}

export function EventInfoPanel({ event, onClose, onNavigate }: EventInfoPanelProps) {
  useEscToClose(onClose);

  function formatDate(iso: string): string {
    try {
      const date = new Date(iso);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch {
      return iso;
    }
  }

  // Determine portal target safely for SSR/tests
  const target = typeof document !== 'undefined' ? document.body : null;
  if (!target) return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={event.title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md mx-0 sm:mx-4 p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest block mb-0.5">
                Campus Event
              </span>
              <h3 className="font-extrabold text-foreground text-lg leading-tight">
                {event.title}
              </h3>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close event info" className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {event.posterUrl && (
          <div className="w-full aspect-video rounded-2xl overflow-hidden mb-6 border border-border/50 bg-muted/20">
            <img src={event.posterUrl} alt="Event Poster" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="space-y-3 mb-6 bg-muted/30 p-4 rounded-2xl border border-border/50">
          <div className="flex items-start gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-medium">{formatDate(event.dateStart)}</p>
              <p className="text-muted-foreground text-xs mt-0.5">to {formatDate(event.dateEnd)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-medium">{event.locationRef?.label || "Location not specified"}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-medium">Organized by {event.organizer}</p>
            </div>
          </div>
        </div>

        {event.description && (
          <div className="mb-6">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">About Event</h4>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {event.description}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {onNavigate && event.locationRef?.buildingId && (
            <button
              onClick={onNavigate}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm"
            >
              <Navigation className="h-4 w-4" />
              Navigate to Event
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center justify-center gap-2 hover:bg-muted/80 active:scale-[0.98] transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>,
    target
  );
}
