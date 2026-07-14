import { useState } from "react";
import {
  CalendarDays, MapPin, Plus, Edit2, Trash2, Eye, CheckCircle2,
  Clock, XCircle, Star, AlertTriangle,
} from "lucide-react";
import { cn } from "../lib/utils";

type EventStatus = "draft" | "scheduled" | "active" | "ended";

interface CampusEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  dateStart: string;
  dateEnd: string;
  status: EventStatus;
  markerCount: number;
  organizer: string;
  affectedAreas: string[];
  tempFeatures: string[];
}

const MOCK_EVENTS: CampusEvent[] = [
  {
    id:"ev1",
    title:"PLV Foundation Day 2025",
    description:"Annual foundation day celebration with performances, exhibits, and booths across the campus.",
    venue:"Campus-wide",
    dateStart:"Jan 25, 2025", dateEnd:"Jan 27, 2025",
    status:"scheduled",
    markerCount:12,
    organizer:"PLV Office of Student Affairs",
    affectedAreas:["Main Plaza","MAB Grounds","GYM Area"],
    tempFeatures:["Stage","Food Booths (×8)","Registration Tent","First Aid Station","Temporary Restrooms"],
  },
  {
    id:"ev2",
    title:"STEM Fair 2025",
    description:"Annual science and technology exhibition where students showcase research and innovation projects.",
    venue:"Main Academic Building",
    dateStart:"Feb 12, 2025", dateEnd:"Feb 14, 2025",
    status:"draft",
    markerCount:6,
    organizer:"College of Engineering",
    affectedAreas:["MAB Ground Floor","Main Plaza"],
    tempFeatures:["Exhibit Booths (×20)","Demo Area","Judges Station"],
  },
  {
    id:"ev3",
    title:"Career Fair 2024",
    description:"Connects students with industry partners for internship and employment opportunities.",
    venue:"ADM Building Lobby",
    dateStart:"Nov 20, 2024", dateEnd:"Nov 21, 2024",
    status:"ended",
    markerCount:8,
    organizer:"Placement Office",
    affectedAreas:["ADM Building","Main Entrance"],
    tempFeatures:["Company Booths (×15)","Interview Rooms","CV Submission Booth"],
  },
  {
    id:"ev4",
    title:"Sports Day 2025",
    description:"Inter-program sports competition open to all enrolled students.",
    venue:"Gymnasium & Sports Field",
    dateStart:"Mar 5, 2025", dateEnd:"Mar 5, 2025",
    status:"draft",
    markerCount:5,
    organizer:"SSC Sports Committee",
    affectedAreas:["Gymnasium","South Sports Field"],
    tempFeatures:["Bleacher Expansion","First Aid Tent","Scoreboard","Refreshment Area"],
  },
];

const STATUS_CONFIG: Record<EventStatus, { label:string; color:string; bg:string; icon:React.ElementType }> = {
  draft:     { label:"Draft",     color:"text-muted-foreground",                         bg:"bg-muted border-border",                                                    icon:Edit2        },
  scheduled: { label:"Scheduled", color:"text-blue-600 dark:text-blue-400",               bg:"bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30",    icon:CalendarDays },
  active:    { label:"Active",    color:"text-green-600 dark:text-green-400",             bg:"bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30", icon:CheckCircle2 },
  ended:     { label:"Ended",     color:"text-muted-foreground",                          bg:"bg-muted border-border",                                                    icon:XCircle      },
};

// ── Create/Edit modal ──────────────────────────────────────────────────────
function EventModal({ event, onClose, onSave }: {
  event: CampusEvent|null; onClose: () => void;
  onSave: (e: CampusEvent) => void;
}) {
  const isNew = event === null;
  const [form, setForm] = useState<Partial<CampusEvent>>(event ?? {
    title:"", description:"", venue:"", dateStart:"", dateEnd:"",
    status:"draft", markerCount:0, organizer:"", affectedAreas:[], tempFeatures:[],
  });
  const [featureInput, setFeatureInput] = useState("");

  const update = (k: keyof CampusEvent, v: any) => setForm(p => ({...p, [k]:v}));

  const addFeature = () => {
    if (!featureInput.trim()) return;
    update("tempFeatures", [...(form.tempFeatures ?? []), featureInput.trim()]);
    setFeatureInput("");
  };

  const handleSave = () => {
    if (!form.title || !form.venue || !form.dateStart) return;
    onSave({
      id: event?.id ?? `ev${Date.now()}`,
      ...form as CampusEvent,
    });
  };

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-extrabold text-foreground text-sm" style={{ fontFamily:"var(--font-sans)" }}>
            {isNew ? "Create Event Map" : "Edit Event Map"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground">
            <XCircle className="h-4 w-4"/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4 scrollbar-show-on-hover">
          <div>
            <label htmlFor="event-title" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Event Title *</label>
            <input id="event-title" type="text" value={form.title ?? ""} onChange={e => update("title", e.target.value)}
              placeholder="e.g. PLV Foundation Day 2025" className={inputCls} style={{ fontFamily:"var(--font-body)" }}/>
          </div>
          <div>
            <label htmlFor="event-description" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Description</label>
            <textarea id="event-description" value={form.description ?? ""} onChange={e => update("description", e.target.value)}
              rows={2} placeholder="Brief event description…" className={cn(inputCls, "resize-none")} style={{ fontFamily:"var(--font-body)" }}/>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-venue" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Venue *</label>
              <input id="event-venue" type="text" value={form.venue ?? ""} onChange={e => update("venue", e.target.value)}
                placeholder="Campus-wide / GYM…" className={inputCls} style={{ fontFamily:"var(--font-body)" }}/>
            </div>
            <div>
              <label htmlFor="event-organizer" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Organizer</label>
              <input id="event-organizer" type="text" value={form.organizer ?? ""} onChange={e => update("organizer", e.target.value)}
                placeholder="Department / committee" className={inputCls} style={{ fontFamily:"var(--font-body)" }}/>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-start" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Start Date *</label>
              <input id="event-start" type="text" value={form.dateStart ?? ""} onChange={e => update("dateStart", e.target.value)}
                placeholder="Jan 25, 2025" className={inputCls} style={{ fontFamily:"var(--font-body)" }}/>
            </div>
            <div>
              <label htmlFor="event-end" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">End Date</label>
              <input id="event-end" type="text" value={form.dateEnd ?? ""} onChange={e => update("dateEnd", e.target.value)}
                placeholder="Jan 27, 2025" className={inputCls} style={{ fontFamily:"var(--font-body)" }}/>
            </div>
          </div>
          {/* Temporary features */}
          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">
              Temporary Map Features
              <span className="ml-1 text-muted-foreground font-normal normal-case tracking-normal">(markers on event map)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input type="text" value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFeature(); }}}
                placeholder="e.g. Food Booth, First Aid Station…" className={cn(inputCls, "flex-1")} style={{ fontFamily:"var(--font-body)" }}/>
              <button onClick={addFeature} className="px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shrink-0">Add</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(form.tempFeatures ?? []).map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-foreground">
                  {f}
                  <button onClick={() => update("tempFeatures", (form.tempFeatures ?? []).filter((_,j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive ml-0.5">×</button>
                </span>
              ))}
              {(form.tempFeatures ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground" style={{ fontFamily:"var(--font-body)" }}>No features added yet</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!form.title || !form.venue}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {isNew ? "Create Event Map" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function AdminEventsPage() {
  const [events, setEvents] = useState<CampusEvent[]>(MOCK_EVENTS);
  const [modal, setModal] = useState<CampusEvent|null|"new">(null);
  const [statusFilter, setStatusFilter] = useState<EventStatus|"all">("all");

  const handleSave = (e: CampusEvent) => {
    setEvents(prev => {
      const idx = prev.findIndex(x => x.id === e.id);
      if (idx === -1) return [...prev, e];
      return prev.map((x, i) => i === idx ? e : x);
    });
    setModal(null);
  };

  const handleDelete = (id: string) => setEvents(prev => prev.filter(e => e.id !== id));

  const handleActivate = (id: string) =>
    setEvents(prev => prev.map(e => e.id === id ? {...e, status:"active"} : e.status === "active" ? {...e, status:"ended"} : e));

  const filtered = events.filter(e => statusFilter === "all" || e.status === statusFilter);

  const tabs: { key: EventStatus|"all"; label: string }[] = [
    { key:"all", label:"All" },
    { key:"active", label:"Active" },
    { key:"scheduled", label:"Scheduled" },
    { key:"draft", label:"Draft" },
    { key:"ended", label:"Ended" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground" style={{ fontFamily:"var(--font-sans)" }}>
            Event Map Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5" style={{ fontFamily:"var(--font-body)" }}>
            Create temporary event versions of the campus map with custom markers, restricted areas, and special venues. Active events automatically update the student map.
          </p>
        </div>
        <button onClick={() => setModal("new")}
          className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shrink-0 shadow-sm">
          <Plus className="h-4 w-4"/> New Event Map
        </button>
      </div>

      {/* Active event banner */}
      {events.find(e => e.status === "active") && (() => {
        const active = events.find(e => e.status === "active")!;
        return (
          <div className="bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800/30 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 text-green-600 dark:text-green-400"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-green-700 dark:text-green-400">Event Map Active: {active.title}</p>
              <p className="text-xs text-green-600/80 dark:text-green-400/60" style={{ fontFamily:"var(--font-body)" }}>
                Students are currently seeing the event version of the campus map · {active.dateStart} – {active.dateEnd}
              </p>
            </div>
            <button onClick={() => setEvents(prev => prev.map(e => e.id === active.id ? {...e, status:"ended"} : e))}
              className="shrink-0 text-xs font-bold text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700/50 px-3 py-1.5 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
              Deactivate
            </button>
          </div>
        );
      })()}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setStatusFilter(t.key)}
            className={cn("shrink-0 h-8 px-3 rounded-xl text-xs font-bold transition-all",
              statusFilter === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {t.label}
            <span className={cn("ml-1.5 text-[10px] px-1.5 rounded-full",
              statusFilter === t.key ? "bg-white/20" : "bg-muted text-foreground")}>
              {events.filter(e => t.key === "all" || e.status === t.key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Event cards */}
      <div className="grid gap-4">
        {filtered.map(event => {
          const cfg = STATUS_CONFIG[event.status];
          const StatusIcon = cfg.icon;
          return (
            <div key={event.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4 p-5">
                {/* Icon */}
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-6 w-6 text-primary"/>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-extrabold text-foreground text-sm" style={{ fontFamily:"var(--font-sans)" }}>
                      {event.title}
                    </h3>
                    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0", cfg.bg, cfg.color)}>
                      <StatusIcon className="h-2.5 w-2.5"/>
                      {cfg.label}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-1" style={{ fontFamily:"var(--font-body)" }}>
                    {event.description}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 text-primary"/> {event.venue}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3"/> {event.dateStart}{event.dateEnd !== event.dateStart ? ` – ${event.dateEnd}` : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 text-accent"/> {event.markerCount} temp markers
                    </span>
                  </div>
                </div>
              </div>

              {/* Temp features */}
              {event.tempFeatures.length > 0 && (
                <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                  {event.tempFeatures.map((f, i) => (
                    <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                      {f}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
                <button onClick={() => setModal(event)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
                  <Edit2 className="h-3 w-3"/> Edit
                </button>

                {event.status === "draft" && (
                  <button
                    onClick={() => setEvents(prev => prev.map(e => e.id === event.id ? {...e, status:"scheduled"} : e))}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-blue-300 dark:border-blue-700/50 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    <Eye className="h-3 w-3"/> Schedule
                  </button>
                )}

                {event.status === "scheduled" && (
                  <button onClick={() => handleActivate(event.id)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors">
                    <CheckCircle2 className="h-3 w-3"/> Activate
                  </button>
                )}

                {event.status === "active" && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-green-600 dark:text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                    Live on student map
                  </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {event.status !== "active" && (
                    <button onClick={() => handleDelete(event.id)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3 w-3"/> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-card rounded-2xl border border-border p-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3"/>
            <p className="text-sm font-bold text-muted-foreground">No events in this category</p>
            <button onClick={() => setModal("new")} className="mt-4 text-xs font-bold text-primary hover:underline">
              Create your first event map →
            </button>
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="bg-muted/30 border border-border rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-foreground mb-1" style={{ fontFamily:"var(--font-sans)" }}>
              How Event Maps Work
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily:"var(--font-body)" }}>
              Event maps are temporary overlays on the standard campus map. When activated, students automatically see event-specific markers and routes without changing the permanent map. Once the event ends, the system returns to the standard view automatically.
              Only one event map can be active at a time.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {(modal === "new" || (modal && modal !== "new")) && (
        <EventModal
          event={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
