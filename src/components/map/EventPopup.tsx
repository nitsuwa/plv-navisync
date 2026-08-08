import { X, CalendarDays, MapPin, Navigation } from "lucide-react";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEscToClose } from "../../hooks/useEscToClose";

interface EventData {
  id: string;
  title: string;
  x: number;
  y: number;
  color: string;
  date: string;
  venue: string;
  org: string;
  desc: string;
}

interface EventPopupProps {
  event: EventData;
  onClose: () => void;
  onNavigate: () => void;
}

export function EventPopup({ event, onClose, onNavigate }: EventPopupProps) {
  useEscToClose(onClose);
  // Portaled to body so this overlay clears PublicLayout's z-[1] stacking context
  // and stays above the z-50 mobile bottom navigation.
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
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm mx-0 sm:mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: event.color }} />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Campus Event
            </span>
          </div>
          <button onClick={onClose} aria-label="Close event popup" className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        <h3 className="font-extrabold text-foreground text-base mb-2">
          {event.title}
        </h3>
        <div className="flex items-center gap-4 mb-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> {event.date}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {event.venue}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{event.desc}</p>
        <p className="text-[10px] text-muted-foreground mb-4">
          Organizer: <span className="font-bold text-foreground">{event.org}</span>
        </p>
        <button
          onClick={onNavigate}
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <Navigation className="h-4 w-4" /> Navigate to {event.venue}
        </button>
      </motion.div>
    </motion.div>,
    document.body
  );
}
