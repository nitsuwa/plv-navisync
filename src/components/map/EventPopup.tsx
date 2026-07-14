import { X, CalendarDays, MapPin, Navigation } from "lucide-react";

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
  return (
    <div
      className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm mx-0 sm:mx-4 p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: event.color }} />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Campus Event
            </span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl bg-muted flex items-center justify-center">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        <h3 className="font-extrabold text-foreground text-base mb-2" style={{ fontFamily: "var(--font-sans)" }}>
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
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Navigation className="h-4 w-4" /> Navigate to {event.venue}
        </button>
      </div>
    </div>
  );
}
