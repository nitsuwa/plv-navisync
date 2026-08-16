import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { EventCardSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";
import { useEscToClose } from "../hooks/useEscToClose";
import {
  CalendarDays, MapPin, Plus, Edit2, Trash2, CheckCircle2,
  Clock, XCircle, Search, Archive, AlertCircle,
} from "lucide-react";
import { cn } from "../lib/utils";
import { SearchBar } from "../components/ui/SearchBar";
import { EmptyState } from "../components/ui/EmptyState";
import {
  eventService,
  type ManagedEvent,
  type ManagedEventStatus,
  type EventInput,
} from "../services/eventService";

const EVENT_CATEGORIES = ["Academic", "Sports", "Cultural", "Administrative", "Student Affairs"];

const STATUS_CONFIG: Record<ManagedEventStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",     color: "text-muted-foreground",                       bg: "bg-muted border-border",                          icon: Edit2       },
  published: { label: "Published", color: "text-green-600 dark:text-green-400",          bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30", icon: CheckCircle2 },
  archived:  { label: "Archived",  color: "text-muted-foreground",                       bg: "bg-muted border-border",                          icon: Archive     },
};

function toLocalInput(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

// ── Create/Edit modal ──────────────────────────────────────────────────────
function EventModal({ event, onClose, onSave }: {
  event: ManagedEvent | null;
  onClose: () => void;
  onSave: (input: EventInput) => Promise<void>;
}) {
  useEscToClose(onClose);
  const isNew = event === null;
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    category: event?.category ?? EVENT_CATEGORIES[0],
    organizer: event?.organizer ?? "",
    venue: event?.venue ?? "",
    startsAt: toLocalInput(event?.startsAt ?? ""),
    endsAt: toLocalInput(event?.endsAt ?? ""),
    status: event?.status ?? ("draft" as ManagedEventStatus),
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const update = (k: keyof typeof form, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    if (formErrors[k]) setFormErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = "Event title is required";
    if (!form.venue.trim()) errors.venue = "Venue is required";
    if (!form.startsAt) errors.startsAt = "Start date is required";
    if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) errors.endsAt = "End must be after start";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        organizer: form.organizer.trim() || undefined,
        venue: form.venue.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt || form.startsAt).toISOString(),
        status: form.status,
      });
      toast.success(isNew ? "Event created" : "Event updated", `"${form.title}" has been ${isNew ? "created" : "updated"}.`);
      onClose();
    } catch (err) {
      toast.error(isNew ? "Create failed" : "Update failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
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
            {isNew ? "Create Event" : "Edit Event"}
          </h3>
          <button type="button" aria-label="Close modal" onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4 scrollbar-show-on-hover">
          <div>
            <label htmlFor="event-title" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Event Title *</label>
            <input id="event-title" type="text" value={form.title} onChange={e => update("title", e.target.value)}
              placeholder="e.g. PLV Foundation Day 2025"
              className={inputCls + (formErrors.title ? " border-destructive focus:ring-destructive/30" : "")} />
            {formErrors.title && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.title}</p>}
          </div>

          <div>
            <label htmlFor="event-description" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Description</label>
            <textarea id="event-description" value={form.description} onChange={e => update("description", e.target.value)}
              rows={2} placeholder="Brief event description…"
              className={cn(inputCls, "resize-y min-h-[44px] pt-2.5")} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-category" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Category</label>
              <select id="event-category" value={form.category} onChange={e => update("category", e.target.value)}
                className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                {EVENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="event-organizer" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Organizer</label>
              <input id="event-organizer" type="text" value={form.organizer} onChange={e => update("organizer", e.target.value)}
                placeholder="Department / committee" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="event-venue" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Venue <span className="text-destructive">*</span></label>
            <input id="event-venue" type="text" value={form.venue} onChange={e => update("venue", e.target.value)}
              placeholder="Campus-wide / GYM / LRC 3F…"
              className={inputCls + (formErrors.venue ? " border-destructive focus:ring-destructive/30" : "")} />
            {formErrors.venue && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.venue}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="event-start" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Start Date & Time *</label>
              <input id="event-start" type="datetime-local" value={form.startsAt} onChange={e => update("startsAt", e.target.value)}
                className={inputCls + (formErrors.startsAt ? " border-destructive focus:ring-destructive/30" : "")} />
              {formErrors.startsAt && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.startsAt}</p>}
            </div>
            <div>
              <label htmlFor="event-end" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">End Date & Time</label>
              <input id="event-end" type="datetime-local" value={form.endsAt} onChange={e => update("endsAt", e.target.value)}
                className={inputCls + (formErrors.endsAt ? " border-destructive focus:ring-destructive/30" : "")} />
              {formErrors.endsAt && <p className="text-[10px] text-destructive mt-1 font-medium">{formErrors.endsAt}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="event-status" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Status</label>
            <select id="event-status" value={form.status} onChange={e => update("status", e.target.value)}
              className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">Published events appear on the map during their time window.</p>
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted active:scale-[0.97] transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.venue.trim()}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? "Saving…" : isNew ? "Create Event" : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function AdminEventsPage() {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ManagedEvent | null | "new">(null);
  const [statusFilter, setStatusFilter] = useState<ManagedEventStatus | "all">("all");
  const [archiveTarget, setArchiveTarget] = useState<ManagedEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const toast = useToast();

  const loadEvents = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const data = await eventService.listEvents({ status: statusFilter, search });
      if (requestId !== requestRef.current) return;
      setEvents(data);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Could not load events.");
      setEvents([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSave = async (input: EventInput) => {
    if (modal && modal !== "new") {
      await eventService.updateEvent(modal.id, input);
    } else {
      await eventService.createEvent(input);
    }
    loadEvents();
  };

  const handlePublish = async (event: ManagedEvent) => {
    setBusy(true);
    try {
      await eventService.updateEvent(event.id, { status: "published" });
      toast.success("Event published", `"${event.title}" is now visible to students.`);
      loadEvents();
    } catch (err) {
      toast.error("Publish failed", err instanceof Error ? err.message : "Could not publish the event.");
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await eventService.archiveEvent(archiveTarget.id);
      toast.success("Event archived", `"${archiveTarget.title}" has been archived.`);
      setArchiveTarget(null);
      loadEvents();
    } catch (err) {
      toast.error("Archive failed", err instanceof Error ? err.message : "Could not archive the event.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <EventCardSkeleton cards={3} />;

  const now = Date.now();
  const ongoing = events.find(e =>
    e.status === "published" && new Date(e.startsAt).getTime() <= now && now <= new Date(e.endsAt).getTime()
  );

  const tabs: { key: ManagedEventStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "published", label: "Published" },
    { key: "draft", label: "Draft" },
    { key: "archived", label: "Archived" },
  ];

  const counts: Record<string, number> = {
    all: events.length,
    published: events.filter(e => e.status === "published").length,
    draft: events.filter(e => e.status === "draft").length,
    archived: events.filter(e => e.status === "archived").length,
  };

  if (error && events.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Campus Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage campus events that appear on the map.</p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="Could not load events"
          description={error}
          action={
            <button onClick={loadEvents}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all">
              Try Again
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Campus Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage campus events. Published events appear on the student map during their time window.
          </p>
        </div>
        <button onClick={() => setModal("new")}
          className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shrink-0 shadow-sm">
          <Plus className="h-3.5 w-3.5" /> New Event
        </button>
      </div>

      {/* Ongoing event banner */}
      {ongoing && (
        <div className="bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800/30 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <CalendarDays className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-green-700 dark:text-green-400">Ongoing: {ongoing.title}</p>
            <p className="text-xs text-green-600/80 dark:text-green-400/60">
              Students can see this event on the map until {formatDate(ongoing.endsAt)}.
            </p>
          </div>
        </div>
      )}

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
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Event cards */}
      <div className="grid gap-4">
        {events.map(event => {
          const cfg = STATUS_CONFIG[event.status];
          const StatusIcon = cfg.icon;
          return (
            <div key={event.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4 p-5">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-extrabold text-foreground text-sm">{event.title}</h3>
                    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0", cfg.bg, cfg.color)}>
                      <StatusIcon className="h-3 w-3" /> {cfg.label}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{event.description}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 text-primary" /> {event.venue}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {formatDate(event.startsAt)}
                      {formatDate(event.endsAt) !== formatDate(event.startsAt) ? ` – ${formatDate(event.endsAt)}` : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" /> {event.category}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
                <button onClick={() => setModal(event)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted active:scale-[0.97] transition-all">
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>

                {event.status === "draft" && (
                  <button onClick={() => handlePublish(event)} disabled={busy}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 active:scale-[0.97] transition-all disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Publish
                  </button>
                )}

                {event.status === "published" && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 dark:text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live window
                  </span>
                )}

                <div className="ml-auto">
                  <button onClick={() => setArchiveTarget(event)} disabled={busy}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 active:scale-[0.97] transition-all">
                    <Trash2 className="h-3.5 w-3.5" /> Archive
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {events.length === 0 && (
          <EmptyState
            icon={search || statusFilter !== "all" ? Search : CalendarDays}
            title={search ? "No matching events" : statusFilter !== "all" ? "No events in this category" : "No events yet"}
            description={search
              ? "No events match your search criteria. Try a different keyword."
              : statusFilter !== "all"
                ? "There are no events matching the current filter. Try a different status or create a new one."
                : "Create campus events with a title, venue, and schedule. Published events appear on the student map during their time window."
            }
            action={
              <button onClick={() => setModal("new")}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shadow-sm">
                <Plus className="h-3.5 w-3.5" /> New Event
              </button>
            }
          />
        )}
      </div>

      {/* Modal */}
      {(modal === "new" || (modal && modal !== "new")) && (
        <EventModal
          event={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Archive confirm */}
      <AnimatePresence>
        {archiveTarget && (
          <motion.div
            key="archive-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <Archive className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-extrabold text-foreground mb-1">Archive Event?</h3>
              <p className="text-sm text-muted-foreground mb-5">
                "{archiveTarget.title}" will be hidden from students. Its history is preserved.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setArchiveTarget(null)}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button onClick={handleArchive} disabled={busy}
                  className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-bold hover:bg-destructive/90 transition-colors disabled:opacity-50">
                  {busy ? "Archiving…" : "Archive Event"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
