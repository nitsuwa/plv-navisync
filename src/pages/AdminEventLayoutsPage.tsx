/**
 * AdminEventLayoutsPage — GSO approval dashboard for student org event layouts.
 *
 * Displays pending event overlays submitted by student orgs.
 * Admins can review the layout, approve it, or disapprove with comments.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarDays,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  AlertCircle,
  MessageSquare,
  Eye,
  Loader2,
  Settings2,
  ExternalLink,
} from "lucide-react";
import { cn } from "../lib/utils";
import { SearchBar } from "../components/ui/SearchBar";
import { EmptyState } from "../components/ui/EmptyState";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";
import {
  eventOverlayService,
  type EventOverlayStatus,
} from "../services/eventOverlayService";
import type { CampusEventOverlay } from "../components/map-builder/types";
import { countEventOverlayItems, normalizeEventOverlayLocations } from "../lib/eventOverlayModel";
import { findEventConflicts, formatEventDate, getStudentEventPhase } from "../lib/eventPublication";
import { formatEventSubmissionTime } from "../lib/eventSubmissionTime";
import { isValidThemedTime, manilaDateTimeToIso, ThemedDateTimeField } from "../components/ui/ThemedDateTimeField";
import { AdminEventPublicationDialog } from "../components/events/AdminEventPublicationDialog";
import type { EventPublicationCommand } from "../types/eventPreview";

// ── Status configuration ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EventOverlayStatus | "all",
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  all: {
    label: "All",
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
    icon: CalendarDays,
  },
  draft: {
    label: "Draft",
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
    icon: CalendarDays,
  },
  pending: {
    label: "Pending",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30",
    icon: CheckCircle2,
  },
  disapproved: {
    label: "Disapproved",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30",
    icon: XCircle,
  },
};

function publicationStateLabel(overlay: CampusEventOverlay): string {
  if (!overlay.isActive) return "Unpublished";
  const phase = getStudentEventPhase(overlay, Date.now());
  if (phase === "scheduled") return "Scheduled";
  if (phase === "upcoming") return "Upcoming";
  if (phase === "ongoing") return "Ongoing";
  if (phase === "ended") return "Ended";
  return "Timing unavailable";
}

// ── Review Modal ─────────────────────────────────────────────────────────

function ReviewModal({
  overlay,
  onClose,
  onReview,
  allOverlays,
}: {
  overlay: CampusEventOverlay;
  allOverlays: CampusEventOverlay[];
  onClose: () => void;
  onReview: (
    id: string,
    decision: "approved" | "disapproved",
    comment?: string,
    publication?: { expectedUpdatedAt?: string; dateStart?: string; dateEnd?: string; publicationMode?: "now" | "schedule"; publicationAt?: string; locationFeedback?: Record<string, string> }
  ) => Promise<void>;
}) {
  const [conflictCheckFailed, setConflictCheckFailed] = useState(false);
  const [approvedEvents, setApprovedEvents] = useState<CampusEventOverlay[]>(allOverlays);
  useEffect(() => {
    let cancelled = false;
    eventOverlayService.listEventOverlays({ allCampuses: true, campusId: overlay.campusId, status: "approved", strict: true }).then(events => { if (!cancelled) setApprovedEvents(events); }).catch(() => { if (!cancelled) setConflictCheckFailed(true); });
    return () => { cancelled = true; };
  }, [overlay.campusId]);
  const [comment, setComment] = useState("");
  const [publicationMode, setPublicationMode] = useState<"now" | "schedule">("now");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [publicationTime, setPublicationTime] = useState("");
  const [locationFeedback, setLocationFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const dateStart = manilaDateTimeToIso(eventStartDate, eventStartTime);
  const dateEnd = manilaDateTimeToIso(eventEndDate, eventEndTime);
  const hasValidEventTimes = isValidThemedTime(eventStartTime) && isValidThemedTime(eventEndTime);
  const eventScheduleError = !eventStartDate || !eventEndDate || !eventStartTime || !eventEndTime
    ? "Set a start and end date with 24-hour times (for example, 09:00)."
    : !hasValidEventTimes
      ? "Use valid 24-hour times, for example 09:00."
      : !dateStart || !dateEnd
        ? "Choose valid calendar dates for the event start and end."
        : Date.parse(dateEnd) <= Date.now()
      ? "The event end must be in the future."
      : dateStart && dateEnd && Date.parse(dateEnd) <= Date.parse(dateStart)
      ? "The event end must be later than its start."
      : "";
  const eventScheduleValid = !eventScheduleError && Boolean(dateStart && dateEnd);
  const scheduledPublicationAt = manilaDateTimeToIso(publicationDate, publicationTime);
  const publicationTooLate = Boolean(scheduledPublicationAt && dateEnd && Date.parse(scheduledPublicationAt) >= Date.parse(dateEnd));
  const publicationScheduleValid = publicationMode === "now" || Boolean(scheduledPublicationAt && Date.parse(scheduledPublicationAt) > Date.now() && !publicationTooLate);
  const publicationScheduleError = !scheduledPublicationAt || (publicationMode === "schedule" && Date.parse(scheduledPublicationAt) <= Date.now())
    ? "Choose a publication date and enter a valid time."
    : publicationTooLate
      ? "Publication must be scheduled before the event ends."
      : "";
  const scheduleForConflicts = eventScheduleValid ? { ...overlay, dateStart, dateEnd } : null;

  const handleReview = async (decision: "approved" | "disapproved") => {
    if (decision === "approved" && !eventScheduleValid) return;
    if (decision === "approved" && !publicationScheduleValid) return;
    setBusy(true);
    try {
      await onReview(
        overlay.id,
        decision,
        comment || undefined,
        {
          dateStart: decision === "approved" ? dateStart : undefined,
          dateEnd: decision === "approved" ? dateEnd : undefined,
          expectedUpdatedAt: overlay.updatedAt,
          publicationMode: decision === "approved" ? publicationMode : undefined,
          publicationAt: decision === "approved" && publicationMode === "schedule" ? scheduledPublicationAt : undefined,
          locationFeedback,
        }
      );
      toast.success(
        decision === "approved" ? "Event layout approved" : "Event layout disapproved",
        `"${overlay.title}" has been ${decision}.`
      );
      onClose();
    } catch (err) {
      toast.error(
        "Review failed",
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  };

  const locations = normalizeEventOverlayLocations(overlay);
  const { furniture: furnitureCount, labels: labelCount } = countEventOverlayItems(locations);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-extrabold text-foreground text-sm">
            Review Event Layout
          </h3>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Event Info */}
          <div className="space-y-3">
            <div>
              <h4 className="font-extrabold text-foreground">{overlay.title}</h4>
              {overlay.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {overlay.description}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{locations.map((location) => location.locationRef.label).join(" · ") || "No location set"}</span>
            </div>
            <p className="text-xs text-muted-foreground">Submitted to GSO: {formatEventSubmissionTime(overlay.submittedAt)}</p>

            {/* Layout Summary */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Furniture</span>
                <span className="font-bold">{furnitureCount} items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Text Labels</span>
                <span className="font-bold">{labelCount} labels</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Organizer</span>
                <span className="font-bold">{overlay.organizer || "—"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-bold">Event schedule</p>
              <p className="mt-1 text-xs text-muted-foreground">Set when the event takes place. Dates and times use Asia/Manila.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ThemedDateTimeField label="Event starts" date={eventStartDate} time={eventStartTime} disabled={busy} onDateChange={setEventStartDate} onTimeChange={setEventStartTime} />
              <ThemedDateTimeField label="Event ends" date={eventEndDate} time={eventEndTime} disabled={busy} onDateChange={setEventEndDate} onTimeChange={setEventEndTime} />
            </div>
            {eventScheduleError && <p role="alert" className="text-xs text-destructive">{eventScheduleError}</p>}
            {eventScheduleValid && <p className="text-xs text-muted-foreground">Event: {formatEventDate(dateStart)} – {formatEventDate(dateEnd)}. The preview expires when the event ends.</p>}
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-sm font-bold">Student publication</p>
              <div role="group" aria-label="Publication timing" className="grid gap-2 sm:grid-cols-2">
                {([
                  { value: "now", label: "Publish now" },
                  { value: "schedule", label: "Schedule publication" },
                ] as const).map((option) => <button key={option.value} type="button" aria-pressed={publicationMode === option.value} disabled={busy} onClick={() => setPublicationMode(option.value)} className={cn("rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", publicationMode === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
                  {option.label}{option.value === "now" ? " after approval" : ""}
                </button>)}
              </div>
              {publicationMode === "schedule" && <div className="mt-3"><ThemedDateTimeField label="Publish on" date={publicationDate} time={publicationTime} disabled={busy} onDateChange={setPublicationDate} onTimeChange={setPublicationTime} /></div>}
              {publicationMode === "schedule" && publicationScheduleError && <p role="alert" className="mt-2 text-xs text-destructive">{publicationScheduleError}</p>}
            </div>
            {conflictCheckFailed && <p role="alert" className="text-xs text-amber-600">Venue conflicts could not be checked. Verify the schedule before approving.</p>}
            {(scheduleForConflicts ? findEventConflicts(scheduleForConflicts, approvedEvents) : []).map(conflict => <p key={conflict.id} role="alert" className="text-xs text-amber-600">Location/time conflict: {conflict.title}. Check venue availability before approving.</p>)}
          </div>
          <div className="space-y-2"><p className="text-xs font-bold">Feedback by location</p>{locations.map(location => <label key={location.id} className="block text-xs">{location.locationRef.label}<input value={locationFeedback[location.id] || ""} onChange={e=>setLocationFeedback({...locationFeedback,[location.id]:e.target.value})} placeholder="Specific feedback for this map" className="mt-1 block w-full rounded-lg border border-border bg-background p-2" /></label>)}</div>
          {/* Admin Comment */}
          <div>
            <label
              htmlFor="review-comment"
              className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
            >
              Admin Comment {"(required if disapproving)"}
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Add feedback for the student org (optional for approval, required for disapproval)..."
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y min-h-[60px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Map Preview Action */}
          <div className="pt-2">
            <a
              href={`/admin-dashboard/event-layouts/${overlay.id}/preview`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 active:scale-[0.97] transition-all"
            >
              <MapPin className="h-4 w-4" />
              Open Read-only Map Preview
            </a>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Review every requested location without changing the student submission.
            </p>
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted active:scale-[0.97] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => handleReview("disapproved")}
            disabled={busy || (comment.trim().length === 0) || !overlay.updatedAt}
            className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-bold hover:bg-destructive/90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Disapprove
          </button>
          <button
            onClick={() => handleReview("approved")}
            disabled={busy || !eventScheduleValid || !publicationScheduleValid || !overlay.updatedAt}
            className="flex-1 h-10 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function AdminEventLayoutsPage() {
  const [overlays, setOverlays] = useState<CampusEventOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventOverlayStatus | "all">(
    "all"
  );
  const [reviewTarget, setReviewTarget] = useState<CampusEventOverlay | null>(
    null
  );
  const [publicationTarget, setPublicationTarget] = useState<CampusEventOverlay | null>(null);
  const requestRef = useRef(0);
  const toast = useToast();

  const loadOverlays = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const data = await eventOverlayService.listEventOverlays({
        allCampuses: true,
        status: statusFilter,
        search,
      });
      if (requestId !== requestRef.current) return;
      setOverlays(data.filter((item) => item.status !== "draft"));
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(
        err instanceof Error ? err.message : "Could not load event layouts."
      );
      setOverlays([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadOverlays();
  }, [loadOverlays]);

  const handleReview = async (
    id: string,
    decision: "approved" | "disapproved",
    comment?: string,
    publication?: { expectedUpdatedAt?: string; dateStart?: string; dateEnd?: string; publicationMode?: "now" | "schedule"; publicationAt?: string; locationFeedback?: Record<string, string> }
  ) => {
    await eventOverlayService.reviewEventOverlay(id, decision, comment, publication);
    await loadOverlays();
  };

  const handlePublicationChange = async (overlay: CampusEventOverlay, command: EventPublicationCommand) => {
    if (!overlay.updatedAt) throw new Error("This event has no server revision. Refresh the event list before changing publication.");
    await eventOverlayService.manageEventPublication(overlay.id, overlay.updatedAt, command);
    await loadOverlays();
  };

  if (loading) return <TablePageSkeleton rows={4} />;

  const tabs: { key: EventOverlayStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "disapproved", label: "Disapproved" },
  ];

  const counts: Record<string, number> = {
    all: overlays.length,
    pending: overlays.filter((o) => o.status === "pending").length,
    approved: overlays.filter((o) => o.status === "approved").length,
    disapproved: overlays.filter((o) => o.status === "disapproved").length,
  };

  if (error && overlays.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            Event Layouts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve student organization event map layouts.
          </p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="Could not load event layouts"
          description={error}
          action={
            <button
              onClick={loadOverlays}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
            >
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
          <h1 className="text-2xl font-extrabold text-foreground">
            Event Layouts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve student organization event map layouts.
          </p>
        </div>
      </div>

      {/* Pending Count Banner */}
      {counts.pending > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              {counts.pending} Pending Review{counts.pending !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/60">
              Student organizations are waiting for approval on their event
              layouts.
            </p>
          </div>
        </div>
      )}

      {/* Search + Filter tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="max-w-sm w-full">
          <SearchBar
            placeholder="Search event layouts..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            showShortcutHint
            size="md"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={cn(
                "shrink-0 h-8 px-3 rounded-xl text-xs font-bold transition-all active:scale-[0.97]",
                statusFilter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 text-[10px] px-1.5 rounded-full",
                  statusFilter === t.key ? "bg-white/20" : "bg-muted text-foreground"
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Event Layout Cards */}
      <div className="grid gap-4">
        {overlays.map((overlay) => {
          const status = overlay.status || "pending";
          const cfg = STATUS_CONFIG[status];
          const StatusIcon = cfg.icon;
          const locations = normalizeEventOverlayLocations(overlay);
          const itemCounts = countEventOverlayItems(locations);

          return (
            <div
              key={overlay.id}
              className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4 p-5">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-extrabold text-foreground text-sm">
                      {overlay.title}
                    </h3>
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0",
                        cfg.bg,
                        cfg.color
                      )}
                    >
                      <StatusIcon className="h-3 w-3" /> {cfg.label}
                    </div>
                  </div>
                  {overlay.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                      {overlay.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 text-primary" />{" "}
                      {locations.length} requested location{locations.length === 1 ? "" : "s"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" /> {overlay.organizer}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                    {locations.map((location) => location.locationRef.label).join(" · ") || "No location set"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Submitted to GSO: {formatEventSubmissionTime(overlay.submittedAt)}</p>
                  {status === "approved" && <p className="mt-1 text-[11px] font-semibold text-muted-foreground">Student publication: {publicationStateLabel(overlay)}</p>}
                  {/* Layout stats */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                      {itemCounts.furniture} furniture
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                      {itemCounts.labels} labels
                    </span>
                  </div>
                </div>
              </div>

              {/* Admin Comment (if disapproved) */}
              {status === "disapproved" && overlay.adminComment && (
                <div className="px-5 py-3 border-t border-border bg-red-50/50 dark:bg-red-900/10">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase mb-0.5">
                        Admin Comment
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300">
                        {overlay.adminComment}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
                {status === "pending" && <button type="button" onClick={() => setReviewTarget(overlay)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Eye className="h-3.5 w-3.5" />Review submission</button>}
                {status === "approved" && <button type="button" onClick={() => setPublicationTarget(overlay)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Settings2 className="h-3.5 w-3.5" />Manage publication</button>}
                <a href={`/admin-dashboard/event-layouts/${overlay.id}/preview`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold text-foreground hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" />Open map preview</a>

                <div className="ml-auto text-[10px] text-muted-foreground">
                  {overlay.createdByUserId &&
                    `Created by: ${overlay.createdByUserId.slice(0, 8)}...`}
                </div>
              </div>
            </div>
          );
        })}

        {overlays.length === 0 && (
          <EmptyState
            icon={
              search || statusFilter !== "all" ? Search : CalendarDays
            }
            title={
              search
                ? "No matching layouts"
                : statusFilter !== "all"
                ? "No layouts in this category"
                : "No event layouts yet"
            }
            description={
              search
                ? "No event layouts match your search criteria."
                : statusFilter !== "all"
                ? "There are no event layouts matching the current filter."
                : "Student organizations haven't submitted any event layouts for review yet."
            }
          />
        )}
      </div>

      {/* Review Modal */}
      {reviewTarget && (
        <ReviewModal
          overlay={reviewTarget}
          onClose={() => setReviewTarget(null)}
          allOverlays={overlays}
          onReview={handleReview}
        />
      )}
      {publicationTarget && <AdminEventPublicationDialog overlay={publicationTarget} onClose={() => setPublicationTarget(null)} onSave={handlePublicationChange} />}
    </div>
  );
}
