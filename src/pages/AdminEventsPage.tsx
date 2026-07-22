import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SPRING, DURATION } from "../config/animation";
import { EventCardSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";
import {
  CalendarDays, MapPin, Plus, Edit2, Trash2, Eye, CheckCircle2,
  Clock, XCircle, Star, AlertTriangle, Search,
} from "lucide-react";
import { cn } from "../lib/utils";
import { SearchBar } from "../components/ui/SearchBar";

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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  const update = (k: keyof CampusEvent, v: any) => setForm(p => ({...p, [k]:v}));

  const addFeature = () => {
    if (!featureInput.trim()) return;
    update("tempFeatures", [...(form.tempFeatures ?? []), featureInput.trim()]);
    setFeatureInput("");
  };

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.title?.trim()) errors.title = "Event title is required";
    if (!form.venue?.trim()) errors.venue = "Venue is required";
    if (!form.dateStart?.trim()) errors.dateStart = "Start date is required";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    toast.success(isNew ? "Event map created" : "Event map updated", `"${form.title}" has been ${isNew ? "created" : "updated"}.`);
    onSave({
      id: event?.id ?? `ev${Date.now()}`,
      ...form as CampusEvent,
    });
  };

  const inputCls = "w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-extrabold text-foreground text-sm">
            {isNew ? "Create Event Map" : "Edit Event Map"}
          </h3>
          <button type="button" aria-label="Close modal" onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground">
            <XCircle className="h-4 w-4"/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4 scrollbar-show-on-hover">
          <div>
            <label htmlFor="event-title" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Event Title *</label>
            <input id="event-title" type="text" value={form.title ?? ""} onChange={e => update("title", e.target.value)}
              placeholder="e.g. PLV Foundation Day 2025" className={inputCls}/>
          </div>
          <div>
            <label htmlFor="event-description" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Description</label>
            <textarea id="event-description" value={form.description ?? ""} onChange={e => update("description", e.target.value)}
              rows={2} placeholder="Brief event description…" className={cn(inputCls, "resize-y min-h-[44px] pt-2.5")}/>
            <div className="flex items-center justify-end mt-1">
              <span className="text-[10px] text-muted-foreground tabular-nums">{(form.description ?? "").length}/{500}</span>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-venue" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Venue <span className="text-destructive">*</span></label>
              <input id="event-venue" type="text" value={form.venue ?? ""} onChange={e => { update("venue", e.target.value); if (formErrors.venue) setFormErrors(prev => { const n = {...prev}; delete n.venue; return n; }); }}
                placeholder="Campus-wide / GYM…" className={inputCls + (formErrors.venue ? " border-destructive focus:ring-destructive/30" : "")}/>
              {formErrors.venue && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.venue}</p>}
              <p className="text-[10px] text-muted-foreground mt-1">Physical location of the event</p>
            </div>
            <div>
              <label htmlFor="event-organizer" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Organizer</label>
              <input id="event-organizer" type="text" value={form.organizer ?? ""} onChange={e => update("organizer", e.target.value)}
                placeholder="Department / committee" className={inputCls}/>
              <p className="text-[10px] text-muted-foreground mt-1">Department or organization in charge</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-start" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Start Date <span className="text-destructive">*</span></label>
              <input id="event-start" type="text" value={form.dateStart ?? ""} onChange={e => update("dateStart", e.target.value)}
                placeholder="Jan 25, 2025" className={inputCls}/>
              <p className="text-[10px] text-muted-foreground mt-1">When the event starts</p>
            </div>
            <div>
              <label htmlFor="event-end" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">End Date</label>
              <input id="event-end" type="text" value={form.dateEnd ?? ""} onChange={e => update("dateEnd", e.target.value)}
                placeholder="Jan 27, 2025" className={inputCls}/>
              <p className="text-[10px] text-muted-foreground mt-1">Leave empty if single-day event</p>
            </div>
          </div>
          {/* Temporary features */}
          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">
              Temporary Map Features
              <span className="ml-1 text-muted-foreground font-normal normal-case tracking-normal">(markers on event map)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input id="event-feature-input" type="text" value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFeature(); }}}
                placeholder="e.g. Food Booth, First Aid Station…" className={cn(inputCls, "flex-1")}/>
              <button type="button" aria-label="Add feature" onClick={addFeature} className="px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shrink-0">Add</button>
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
                <span className="text-xs text-muted-foreground">No features added yet</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted active:scale-[0.97] transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!form.title || !form.venue}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {isNew ? "Create Event Map" : "Save Changes"}
          </button>
          {(!form.title || !form.venue) && (
            <p className="text-[10px] text-destructive text-center mt-1">Fill in all required fields (*) to save</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function AdminEventsPage() {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<CampusEvent|null|"new">(null);
  const [statusFilter, setStatusFilter] = useState<EventStatus|"all">("all");
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setEvents(MOCK_EVENTS);
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <EventCardSkeleton cards={3} />;

  const handleSave = (e: CampusEvent) => {
    setEvents(prev => {
      const idx = prev.findIndex(x => x.id === e.id);
      if (idx === -1) return [...prev, e];
      return prev.map((x, i) => i === idx ? e : x);
    });
    setModal(null);
  };

  const handleDelete = (id: string) => {
    const deleted = events.find(e => e.id === id);
    setEvents(prev => prev.filter(e => e.id !== id));
    if (deleted) toast.success("Event deleted", `${deleted.title} has been removed.`);
  };

  const handleActivate = (id: string) =>
    setEvents(prev => prev.map(e => e.id === id ? {...e, status:"active"} : e.status === "active" ? {...e, status:"ended"} : e));

  const filtered = events.filter(e => {
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      e.title.toLowerCase().includes(q) ||
      e.venue.toLowerCase().includes(q) ||
      e.organizer.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

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
          <h1 className="text-2xl font-extrabold text-foreground">
            Event Map Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create temporary event versions of the campus map with custom markers, restricted areas, and special venues. Active events automatically update the student map.
          </p>
        </div>
        <button onClick={() => setModal("new")}
          className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shrink-0 shadow-sm">
          <Plus className="h-3.5 w-3.5" /> New Event Map
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
              <p className="text-xs text-green-600/80 dark:text-green-400/60">
                Students are currently seeing the event version of the campus map · {active.dateStart} – {active.dateEnd}
              </p>
            </div>
            <button onClick={() => setEvents(prev => prev.map(e => e.id === active.id ? {...e, status:"ended"} : e))}
              className="shrink-0 text-xs font-bold text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700/50 px-3 py-1.5 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 active:scale-[0.97] transition-all">
              Deactivate
            </button>
          </div>
        );
      })()}

      {/* Search + Filter tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="max-w-sm w-full">
          <SearchBar
            placeholder="Search events..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            showShortcutHint
            size="md"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setStatusFilter(t.key)}
            className={cn("shrink-0 h-8 px-3 rounded-xl text-xs font-bold transition-all active:scale-[0.97]",
              statusFilter === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {t.label}
            <span className={cn("ml-1.5 text-[10px] px-1.5 rounded-full",
              statusFilter === t.key ? "bg-white/20" : "bg-muted text-foreground")}>
              {events.filter(e => t.key === "all" || e.status === t.key).length}
            </span>
          </button>
        ))}
      </div>
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
                    <h3 className="font-extrabold text-foreground text-sm">
                      {event.title}
                    </h3>
                    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0", cfg.bg, cfg.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {cfg.label}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
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
                      <Star className="h-3 w-3 text-accent" /> {event.markerCount} temp markers
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
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted active:scale-[0.97] transition-all">
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>

                {event.status === "draft" && (
                  <button
                    onClick={() => setEvents(prev => prev.map(e => e.id === event.id ? {...e, status:"scheduled"} : e))}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-blue-300 dark:border-blue-700/50 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.97] transition-all">
                    <Eye className="h-3.5 w-3.5" /> Schedule
                  </button>
                )}

                {event.status === "scheduled" && (
                  <button onClick={() => handleActivate(event.id)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 active:scale-[0.97] transition-all">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Activate
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
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 active:scale-[0.97] transition-all">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <EmptyState
            icon={search || statusFilter !== "all" ? Search : CalendarDays}
            title={search ? "No matching events" : statusFilter !== "all" ? "No events in this category" : "No events yet"}
            description={search
              ? "No events match your search criteria. Try a different keyword."
              : statusFilter !== "all"
                ? "There are no event maps matching the current filter. Try a different status or create a new one."
                : "Create temporary event versions of the campus map with custom markers, restricted areas, and special venues for upcoming campus events."
            }
            action={
              <button onClick={() => setModal("new")}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shadow-sm">
                <Plus className="h-3.5 w-3.5" /> New Event Map
              </button>
            }
          />
        )}
      </div>

      {/* Info card */}
      <div className="bg-muted/30 border border-border rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-foreground mb-1">
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
