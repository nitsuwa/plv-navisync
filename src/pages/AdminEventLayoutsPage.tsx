/**
 * AdminEventLayoutsPage — GSO approval dashboard for student org event layouts.
 *
 * Displays pending event overlays submitted by student orgs.
 * Admins can review the layout, approve it, or disapprove with comments.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useRef, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { EventRevisionHistory } from "../components/events/EventRevisionHistory";
import { AdminEventMapPreviewDialog } from "../components/events/AdminEventMapPreviewDialog";
import { EventFurnitureSummary } from "../components/events/EventFurnitureSummary";
import { readEventFeedback, writeEventFeedback } from "../lib/eventFeedbackPins";
import { EventFeedbackChecklist } from "../components/events/EventFeedbackChecklist";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
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
import { findEventConflicts, formatEventDate } from "../lib/eventPublication";
import { formatEventSubmissionTime } from "../lib/eventSubmissionTime";
import { isValidThemedTime, manilaDateTimeToIso, ThemedDateTimeField } from "../components/ui/ThemedDateTimeField";
import { AdminEventPublicationDialog } from "../components/events/AdminEventPublicationDialog";
import type { EventPublicationCommand } from "../types/eventPreview";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { clearEventReviewDraft, readEventReviewDraft, writeEventReviewDraft } from "../lib/eventReviewDraft";
import { EventFeedbackPinList } from "../components/events/EventFeedbackPinList";
import { useSearchParams } from 'react-router';
import { useAdminEventSubmissions } from '../hooks/useAdminEventSubmissions';
import { submissionUpdateLabel } from '../lib/adminEventSubmissions';
import { EventStudentVisibility } from '../components/events/EventStudentVisibility';

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

// ── Review Modal ─────────────────────────────────────────────────────────

function ReviewModal({
  overlay,
  reviewerId,
  submitterName,
  onClose,
  returnFocusRef,
  onReview,
  allOverlays,
  onRefresh,
  initialPreview = false,
}: {
  overlay: CampusEventOverlay;
  reviewerId?: string;
  submitterName?: string;
  allOverlays: CampusEventOverlay[];
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onRefresh: () => void;
  initialPreview?: boolean;
  onReview: (
    id: string,
    decision: "approved" | "disapproved",
    comment?: string,
    publication?: { expectedUpdatedAt?: string; dateStart?: string; dateEnd?: string; publicationMode?: "now" | "schedule"; publicationAt?: string; locationFeedback?: Record<string, string> }
  ) => Promise<void>;
}) {
  const [recovery] = useState(() => readEventReviewDraft(reviewerId, overlay));
  const recoveredDraft = recovery.status === "restored" ? recovery.draft : undefined;
  const [draftStorageState, setDraftStorageState] = useState<"empty" | "saved" | "unavailable">("empty");
  const draftFinished = useRef(false);
  const draftWritten = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!initialPreview) return;
    // Mount the parent dialog first so its focus/aria isolation does not hide
    // the nested preview when opened directly from a queue card.
    const frame = requestAnimationFrame(() => setPreviewOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [initialPreview]);
  const [conflictCheckFailed, setConflictCheckFailed] = useState(false);
  const [approvedEvents, setApprovedEvents] = useState<CampusEventOverlay[]>(allOverlays);
  useEffect(() => {
    let cancelled = false;
    eventOverlayService.listEventOverlays({ allCampuses: true, campusId: overlay.campusId, status: "approved", strict: true }).then(events => { if (!cancelled) setApprovedEvents(events); }).catch(() => { if (!cancelled) setConflictCheckFailed(true); });
    return () => { cancelled = true; };
  }, [overlay.campusId]);
  const [comment, setComment] = useState(recoveredDraft?.comment ?? "");
  const [publicationMode, setPublicationMode] = useState<"now" | "schedule">(recoveredDraft?.publicationMode ?? "now");
  const [eventStartDate, setEventStartDate] = useState(recoveredDraft?.eventStartDate ?? "");
  const [eventStartTime, setEventStartTime] = useState(recoveredDraft?.eventStartTime ?? "09:00");
  const [eventEndDate, setEventEndDate] = useState(recoveredDraft?.eventEndDate ?? "");
  const [eventEndTime, setEventEndTime] = useState(recoveredDraft?.eventEndTime ?? "17:00");
  const [publicationDate, setPublicationDate] = useState(recoveredDraft?.publicationDate ?? "");
  const [publicationTime, setPublicationTime] = useState(recoveredDraft?.publicationTime ?? "");
  const [locationFeedback, setLocationFeedback] = useState<Record<string, string>>(recoveredDraft?.locationFeedback ?? overlay.locationFeedback ?? {});
  const [busyAction,setBusyAction] = useState<'approved' | 'disapproved' | null>(null);
  const busy = busyAction !== null;
  const reducedMotion = useReducedMotion();
  const [reviewError, setReviewError] = useState("");
  const [scheduleTouched, setScheduleTouched] = useState(recoveredDraft?.scheduleTouched ?? false);
  const [discardReview, setDiscardReview] = useState(false);
  const reviewInFlight = useRef(false);
  const hasReviewChanges = Boolean(comment.trim() || scheduleTouched || eventStartDate || eventEndDate || eventStartTime !== "09:00" || eventEndTime !== "17:00" || publicationMode !== "now" || publicationDate || publicationTime || JSON.stringify(locationFeedback) !== JSON.stringify(overlay.locationFeedback ?? {}));
  // Persist committed review edits before a visible "saved" pin can be lost to a reload.
  useLayoutEffect(() => {
    if (draftFinished.current) return;
    if (!hasReviewChanges) {
      if (recovery.status === "restored" || draftWritten.current) {
        clearEventReviewDraft(reviewerId, overlay.id);
        draftWritten.current = false;
      }
      setDraftStorageState("empty");
      return;
    }
    const saved = writeEventReviewDraft(reviewerId, overlay, { comment, locationFeedback, publicationMode, eventStartDate, eventStartTime, eventEndDate, eventEndTime, publicationDate, publicationTime, scheduleTouched });
    if (saved) draftWritten.current = true;
    setDraftStorageState(saved ? "saved" : "unavailable");
  }, [reviewerId, overlay, recovery.status, hasReviewChanges, comment, locationFeedback, publicationMode, eventStartDate, eventStartTime, eventEndDate, eventEndTime, publicationDate, publicationTime, scheduleTouched]);
  const draftNotice = draftStorageState === "saved"
    ? "Review draft saved on this browser. Send it to the organization with Approve or Disapprove."
    : draftStorageState === "unavailable"
      ? "Your review draft could not be saved on this browser. Keep this review open until you submit it."
      : undefined;
  const discardLocalReview = () => {
    if (!clearEventReviewDraft(reviewerId, overlay.id)) {
      toast.error("Could not discard local draft", "Browser storage is unavailable. Try again before closing this review.");
      return;
    }
    draftFinished.current = true;
    onClose();
  };
  const requestClose = () => {
    if (reviewInFlight.current) return;
    if (hasReviewChanges) setDiscardReview(true);
    else onClose();
  };
  const toast = useToast();

  const dateStart = manilaDateTimeToIso(eventStartDate, eventStartTime);
  const dateEnd = manilaDateTimeToIso(eventEndDate, eventEndTime);
  const hasValidEventTimes = isValidThemedTime(eventStartTime) && isValidThemedTime(eventEndTime);
  const eventScheduleError = !eventStartDate || !eventEndDate || !eventStartTime || !eventEndTime
    ? "Choose the start and end dates, then select a time using AM or PM."
    : !hasValidEventTimes
      ? "Choose a valid time using AM or PM."
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
    if (reviewInFlight.current) return;
    if (decision === "approved" && !eventScheduleValid) return;
    if (decision === "approved" && !publicationScheduleValid) return;
    reviewInFlight.current = true;
    setBusyAction(decision);
    setReviewError("");
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
      draftFinished.current = true;
      clearEventReviewDraft(reviewerId, overlay.id);
      toast.success(
        decision === "approved" ? "Event layout approved" : "Event layout disapproved",
        decision === "disapproved" ? "The proposal was returned for revision with your feedback." : publicationMode === "schedule" ? "The proposal is approved. Student visibility begins at the scheduled publication time." : "The proposal is approved and available during its publication period."
      );
      onClose();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not complete this review.");
      toast.error(
        "Review failed",
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      reviewInFlight.current = false;
      setBusyAction(null);
    }
  };

  const locations = normalizeEventOverlayLocations(overlay);
  const { furniture: furnitureCount, labels: labelCount } = countEventOverlayItems(locations);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) requestClose(); }}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
      <Dialog.Content asChild onCloseAutoFocus={event => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.16 }}
        aria-busy={busy}
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-2xl shadow-2xl w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden max-h-[calc(100dvh-1.5rem)] flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <Dialog.Title asChild><h3 className="font-extrabold text-foreground text-sm">
            Review Event Layout
          </h3></Dialog.Title>
          <Dialog.Description className="sr-only">Review {overlay.title}, inspect each map, and approve with a schedule or return it with feedback.</Dialog.Description>
          <button
            type="button"
            aria-label="Close modal"
            onClick={requestClose}
            disabled={busy}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain flex-1 p-4 sm:p-6 space-y-4">
          {draftNotice && <p role={draftStorageState === "unavailable" ? "alert" : "status"} className={cn("rounded-xl border p-3 text-xs", draftStorageState === "unavailable" ? "border-amber-500/30 bg-amber-500/10 text-foreground" : "border-primary/15 bg-primary/5 text-muted-foreground")}>{draftNotice}</p>}
          {recovery.status === "stale" && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">The submission changed since the draft was saved. Previous draft pins were not applied to this submission. Review the current map.</p>}
          {recovery.status === "invalid" && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">The previous local draft could not be recovered. Review the current map and add your feedback again.</p>}
          {reviewError && <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><p>{reviewError}</p><button type="button" disabled={busy} onClick={onRefresh} className="mt-2 rounded-lg border border-destructive/25 px-3 py-2 text-xs font-bold">Close and refresh list</button></div>}
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
            <p className="text-xs text-muted-foreground">Submitted by: <span className="font-semibold text-foreground">{submitterName || (overlay.createdByUserId ? "Student organization account" : "Not recorded on this legacy event")}</span></p>
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold">Creator account details</summary><p className="mt-2 break-all">{overlay.createdByUserId || "Not recorded on this legacy event"}</p></details>
            {!overlay.submittedAt && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">Legacy pending record: no submission timestamp was recorded. Verify its origin before approval.</p>}
            <button ref={previewTriggerRef} type="button" disabled={busy} onClick={() => setPreviewOpen(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10"><Eye className="h-4 w-4" />Preview requested maps</button>
            <EventRevisionHistory overlay={overlay} />
            <EventFeedbackChecklist overlay={overlay} />

            {/* Layout Summary */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Furniture</span>
                <span className="font-bold">{furnitureCount} {furnitureCount === 1 ? "item" : "items"}</span>
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
            <div className="grid gap-4 md:grid-cols-2" onChangeCapture={() => setScheduleTouched(true)} onClickCapture={() => setScheduleTouched(true)}>
              <ThemedDateTimeField label="Event starts" date={eventStartDate} time={eventStartTime} disabled={busy} onDateChange={setEventStartDate} onTimeChange={setEventStartTime} />
              <ThemedDateTimeField label="Event ends" date={eventEndDate} time={eventEndTime} disabled={busy} onDateChange={setEventEndDate} onTimeChange={setEventEndTime} />
            </div>
            {eventScheduleError && <p role={scheduleTouched && eventStartDate && eventEndDate ? "alert" : undefined} className={cn("text-xs", scheduleTouched && eventStartDate && eventEndDate ? "text-destructive" : "text-muted-foreground")}>{eventScheduleError}</p>}
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
          <div className="space-y-3"><p className="text-xs font-bold">Feedback by location</p><p className="text-xs text-muted-foreground">Use Preview requested maps to place feedback pins. Pins remain visible after approval until the student org marks them addressed; remove any pin that does not need follow-up.</p>{locations.map(location => <div key={location.id} className="rounded-xl border border-border p-3"><label className="block text-xs font-semibold">{location.locationRef.label}<input disabled={busy} value={readEventFeedback(locationFeedback[location.id]).text} onChange={e=>setLocationFeedback({...locationFeedback,[location.id]:writeEventFeedback(e.target.value, readEventFeedback(locationFeedback[location.id]).pins)})} placeholder="Specific feedback for this map" className="mt-2 block min-h-10 w-full rounded-lg border border-border bg-background p-2 font-normal" /></label><EventFeedbackPinList locationLabel={location.locationRef.label} pins={readEventFeedback(locationFeedback[location.id]).pins} disabled={busy} onRemove={pinId => setLocationFeedback(current => { const feedback = readEventFeedback(current[location.id]); return { ...current, [location.id]: writeEventFeedback(feedback.text, feedback.pins.filter(pin => pin.id !== pinId)) }; })} /></div>)}</div>
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
              disabled={busy}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Add feedback for the student org (optional for approval, required for disapproval)..."
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y min-h-[60px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

        </div>

        <div className="flex flex-wrap gap-2 px-4 sm:px-6 pb-5 pt-3 border-t border-border shrink-0 bg-card">
          <button
            onClick={requestClose}
            disabled={busy}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted active:scale-[0.97] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => handleReview("disapproved")}
            disabled={busy || (comment.trim().length === 0) || !overlay.updatedAt}
            className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-bold hover:bg-destructive/90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busyAction === 'disapproved' ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {busyAction === 'disapproved' ? 'Requesting changes…' : 'Disapprove'}
          </button>
          <button
            onClick={() => handleReview("approved")}
            disabled={busy || !eventScheduleValid || !publicationScheduleValid || !overlay.updatedAt || !locations.length || !overlay.createdByUserId}
            className="flex-1 h-10 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busyAction === 'approved' ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {busyAction === 'approved' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </motion.div>
      </Dialog.Content></Dialog.Portal>{previewOpen && <AdminEventMapPreviewDialog overlay={{ ...overlay, locationFeedback }} reviewDraftNotice={draftNotice} returnFocusRef={previewTriggerRef} onClose={() => setPreviewOpen(false)} onAddFeedbackPin={(locationId, pin) => setLocationFeedback(current => { const feedback = readEventFeedback(current[locationId]); if (feedback.pins.length >= 30) return current; return { ...current, [locationId]: writeEventFeedback(feedback.text, [...feedback.pins, pin]) }; })} />}<AlertDialog.Root open={discardReview} onOpenChange={setDiscardReview}><AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-[130] bg-black/40" /><AlertDialog.Content className="fixed left-1/2 top-1/2 z-[131] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"><AlertDialog.Title className="font-bold">Discard review changes?</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm text-muted-foreground">Your comments, pins and schedule have not been saved with a review decision.</AlertDialog.Description><div className="mt-5 flex flex-wrap justify-end gap-2"><AlertDialog.Cancel className="min-h-11 rounded-xl border border-border px-3 font-semibold">Keep reviewing</AlertDialog.Cancel><AlertDialog.Action onClick={discardLocalReview} className="min-h-11 rounded-xl bg-destructive px-3 font-semibold text-destructive-foreground">Discard review</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root></Dialog.Root>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function AdminEventLayoutsPage() {
  const { profile, isAdmin, loading: authLoading } = useAdminAuth();
  const submissions = useAdminEventSubmissions(profile?.id, isAdmin && !authLoading);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedReviewId = searchParams.get('review');
  const [reviewPreviewFirst, setReviewPreviewFirst] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<CampusEventOverlay | null>(null);
  const standalonePreviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const reviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [overlays, setOverlays] = useState<CampusEventOverlay[]>([]);
  const [submitterNames, setSubmitterNames] = useState<Record<string, string>>({});
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
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!requestedReviewId || !isAdmin || authLoading) return;
    let cancelled = false;
    void eventOverlayService.getEventOverlay(requestedReviewId).then(event => {
      if (cancelled) return;
      if (event?.status === 'pending') {
        setSearch(''); setStatusFilter('all'); setReviewPreviewFirst(false);
        setReviewTarget(event);
      } else if (!event) toastRef.current.error('Could not open submission', 'Refresh Event Layouts, then retry the notification.');
      else toastRef.current.error('Submission is no longer pending', 'Refresh Event Layouts to see its current review status.');
      setSearchParams(current => { const next = new URLSearchParams(current); next.delete('review'); return next; }, { replace: true });
    }).catch(error => {
      if (!cancelled) toastRef.current.error('Could not open submission', error instanceof Error ? error.message : 'Please retry from the notification.');
    });
    return () => { cancelled = true; };
  }, [requestedReviewId, isAdmin, authLoading, setSearchParams]);

  useEffect(() => {
    // The modal is absent during the skeleton and the empty error page.
    // Do not acknowledge a notification until its review is actually rendered.
    if (!loading && !(error && overlays.length === 0) && reviewTarget && submissions.unreadIds.has(reviewTarget.id)) void submissions.markRead(reviewTarget);
  }, [loading, error, overlays.length, reviewTarget, submissions.events, submissions.markRead]);

  const loadOverlays = useCallback(async (background = false) => {
    const requestId = ++requestRef.current;
    if (!background) setLoading(true);
    try {
      const data = await eventOverlayService.listEventOverlays({
        allCampuses: true,
        status: statusFilter,
        search,
        strict: true,
      });
      if (requestId !== requestRef.current) return;
      const submitted = data.filter((item) => item.status !== "draft");
      setOverlays(submitted);
      const visibleIds = new Set(submitted.map(item => item.id));
      setReviewTarget(current => current && !visibleIds.has(current.id) ? null : current);
      setPreviewTarget(current => current && !visibleIds.has(current.id) ? null : current);
      setError(null);
      const names = await eventOverlayService.listEventSubmitterNames(submitted.flatMap(item => item.createdByUserId ? [item.createdByUserId] : []));
      if (requestId === requestRef.current) setSubmitterNames(names);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(
        err instanceof Error ? err.message : "Could not load event layouts."
      );
      if (!background) setOverlays([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void loadOverlays();
    const refresh = () => { if (document.visibilityState === "visible") void loadOverlays(true); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
      ++requestRef.current;
    };
  }, [loadOverlays]);

  const handleReview = async (
    id: string,
    decision: "approved" | "disapproved",
    comment?: string,
    publication?: { expectedUpdatedAt?: string; dateStart?: string; dateEnd?: string; publicationMode?: "now" | "schedule"; publicationAt?: string; locationFeedback?: Record<string, string> }
  ) => {
    await eventOverlayService.reviewEventOverlay(id, decision, comment, publication);
    void submissions.refresh();
    // The server decision is confirmed; cleanup must not wait for the queue refresh.
    clearEventReviewDraft(profile?.id, id);
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
              onClick={() => void loadOverlays()}
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
      {error && overlays.length > 0 && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs"><p>Showing the last loaded event layouts. {error}</p><button type="button" onClick={()=>void loadOverlays(true)} className="mt-1 min-h-11 font-bold text-primary">Retry event layouts</button></div>}
      {counts.pending > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-2xl px-4 py-3 flex items-center gap-3">
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
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 rounded-2xl border border-border bg-card p-3">
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
              aria-pressed={statusFilter === t.key}
              onClick={() => setStatusFilter(t.key)}
              className={cn(
                "shrink-0 min-h-10 px-3 rounded-xl text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary",
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
              <div className="flex items-start gap-3 p-4 sm:p-5">
                <div className="hidden sm:flex w-10 h-10 rounded-xl bg-primary/10 items-center justify-center shrink-0">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <h3 className="font-extrabold text-foreground text-base break-words">
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
                  {overlay.description && overlay.description !== overlay.title && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                      {overlay.description}
                    </p>
                  )}
                  {status === 'pending' && submissions.unreadIds.has(overlay.id) && <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-600" />{submissionUpdateLabel(overlay) === 'Maps updated' ? 'Updated submission' : 'New submission'}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 text-primary" />{" "}
                      {locations.length} requested location{locations.length === 1 ? "" : "s"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Organizer:</span> {overlay.organizer || "Not recorded"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Submitted by:</span><span>{(overlay.createdByUserId && submitterNames[overlay.createdByUserId]) || (overlay.createdByUserId ? "Student organization account" : "Not recorded")}</span></span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {locations.map((location) => location.locationRef.label).join(" · ") || "No location set"}
                  </p>
                  <dl className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Submitted to GSO</dt><dd className="mt-1 text-xs text-foreground">{formatEventSubmissionTime(overlay.submittedAt)}</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Latest content edit</dt><dd className="mt-1 text-xs text-foreground">{overlay.lastEditedAt ? formatEventSubmissionTime(overlay.lastEditedAt) : "Not recorded"}{overlay.revision ? ` · Revision ${overlay.revision}` : ""}</dd></div>
                  </dl>
                  {status === 'approved' && <EventStudentVisibility overlay={overlay} />}
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
              <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-t border-border bg-muted/20">
                {status === "pending" && <button type="button" onClick={event => { reviewTriggerRef.current = event.currentTarget; setReviewPreviewFirst(false); setReviewTarget(overlay); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Eye className="h-3.5 w-3.5" />Review submission</button>}
                {status === "approved" && <button type="button" onClick={() => setPublicationTarget(overlay)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Settings2 className="h-3.5 w-3.5" />Manage publication</button>}
                <button type="button" onClick={event => { if (overlay.status === "pending") { reviewTriggerRef.current = event.currentTarget; setReviewPreviewFirst(true); setReviewTarget(overlay); } else { standalonePreviewTriggerRef.current = event.currentTarget; setPreviewTarget(overlay); } }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold text-foreground hover:bg-muted"><Eye className="h-3.5 w-3.5" />Open map preview</button>
                <EventFurnitureSummary overlay={overlay} />

                {overlay.createdByUserId && <details className="min-w-0 w-full sm:w-auto sm:ml-auto text-[10px] text-muted-foreground"><summary className="cursor-pointer py-2">Creator account</summary><p className="max-w-xs break-all pb-1">{overlay.createdByUserId}</p></details>}
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
      {previewTarget && <AdminEventMapPreviewDialog overlay={previewTarget} returnFocusRef={standalonePreviewTriggerRef} onClose={() => setPreviewTarget(null)} />}
      {reviewTarget && (
        <ReviewModal
          key={`${profile?.id ?? "unknown"}:${reviewTarget.id}:${reviewTarget.updatedAt ?? ""}`}
          reviewerId={profile?.id}
          overlay={reviewTarget} submitterName={reviewTarget.createdByUserId ? submitterNames[reviewTarget.createdByUserId] : undefined} initialPreview={reviewPreviewFirst}
          returnFocusRef={reviewTriggerRef}
          onClose={() => setReviewTarget(null)}
          allOverlays={overlays}
          onReview={handleReview}
          onRefresh={() => { setReviewTarget(null); void loadOverlays(); }}
        />
      )}
      {publicationTarget && <AdminEventPublicationDialog overlay={publicationTarget} onClose={() => setPublicationTarget(null)} onSave={handlePublicationChange} />}
    </div>
  );
}
