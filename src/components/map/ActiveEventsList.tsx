import { CalendarDays, X, MapPin } from "lucide-react";
import { motion } from "motion/react";
import type { CampusEventOverlay } from "../map-builder/types";

interface ActiveEventsListProps {
  events: CampusEventOverlay[];
  onSelectEvent: (event: CampusEventOverlay) => void;
  onClose: () => void;
}

export function ActiveEventsList({ events, onSelectEvent, onClose }: ActiveEventsListProps) {
  if (events.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="absolute bottom-full right-0 mb-3 w-72 bg-card border border-border rounded-2xl shadow-xl overflow-hidden origin-bottom-right"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Today's Events</h3>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {events.map((event) => (
          <button
            key={event.id}
            onClick={() => {
              onSelectEvent(event);
              onClose();
            }}
            className="w-full text-left px-4 py-3 hover:bg-muted/50 border-b border-border/50 last:border-0 transition-colors group"
          >
            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              {event.title}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{event.locationRef?.label || "Unknown location"}</span>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
