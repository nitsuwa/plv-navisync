import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from 'motion/react';
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Clock3, Loader2, X, XCircle } from "lucide-react";
import type { CampusEventOverlay } from "../map-builder/types";
import type { EventPublicationCommand } from "../../types/eventPreview";
import { getStudentEventPhase, formatEventDate } from "../../lib/eventPublication";
import { cn } from "../../lib/utils";
import { isValidThemedTime, manilaDateTimeParts, manilaDateTimeToIso, ThemedDateTimeField } from "../ui/ThemedDateTimeField";
import { EventStudentVisibility } from './EventStudentVisibility';

export function AdminEventPublicationDialog({ overlay, onClose, onSave }: {
  overlay: CampusEventOverlay;
  onClose: () => void;
  onSave: (overlay: CampusEventOverlay, command: EventPublicationCommand) => Promise<void>;
}) {
  const initial = manilaDateTimeParts(overlay.publicationAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [activeAction, setActiveAction] = useState<EventPublicationCommand['action'] | null>(null);
  const busy = activeAction !== null;
  const inFlight = useRef(false);
  const reducedMotion = useReducedMotion();
  const progressLabel = activeAction === 'publish_now' ? 'Publishing…' : activeAction === 'schedule' ? 'Scheduling…' : 'Unpublishing…';
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmSchedule, setConfirmSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const phase = getStudentEventPhase(overlay, nowMs);
  const isVisibleToStudents = phase === "upcoming" || phase === "ongoing";
  const publicationAt = manilaDateTimeToIso(date, time);
  const dateStart = overlay.dateStart ? Date.parse(overlay.dateStart) : NaN;
  const dateEnd = overlay.dateEnd ? Date.parse(overlay.dateEnd) : NaN;
  const validOccurrence = overlay.status === "approved" && Number.isFinite(dateStart) && Number.isFinite(dateEnd) && dateStart < dateEnd && dateEnd > nowMs;
  const occurrenceError = validOccurrence ? null : Number.isFinite(dateEnd) && dateEnd <= nowMs
    ? "This event has ended. Request a new event proposal with updated start and end dates before publishing."
    : "A valid event start and end schedule is required. Request a proposal with updated dates for review.";
  const scheduleError = occurrenceError
    ? occurrenceError
    : !publicationAt
    ? "Choose a publication date and time using AM or PM."
    : Date.parse(publicationAt) <= nowMs
      ? "Choose a future publication time."
      : !Number.isFinite(dateEnd) || Date.parse(publicationAt) >= dateEnd
        ? "Publication must be before the event ends."
        : null;

  const save = async (command: EventPublicationCommand) => {
    if (inFlight.current || (command.action === "publish_now" && isVisibleToStudents)) return;
    if (command.action !== "unpublish" && !validOccurrence) { setError(occurrenceError); return; }
    if (command.action === "schedule" && scheduleError) { setScheduleTouched(true); return; }
    if (!overlay.updatedAt) { setError("This event has no server revision. Reload the event list before changing publication."); return; }
    inFlight.current = true; setActiveAction(command.action); setError(null);
    try { await onSave(overlay, command); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update event publication."); }
    finally { inFlight.current = false; setActiveAction(null); }
  };

  const requestSchedule = () => {
    if (!publicationAt || scheduleError) { setScheduleTouched(true); return; }
    if (isVisibleToStudents && Date.parse(publicationAt) > nowMs) {
      setConfirmSchedule(true);
      setConfirmUnpublish(false);
      return;
    }
    void save({ action: "schedule", publicationAt });
  };

  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm" />
    <Dialog.Content asChild onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
    <motion.section initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} aria-busy={busy} className="fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div><Dialog.Title className="text-sm font-extrabold">Manage event publication</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Choose when students can see this approved event map.</Dialog.Description></div>
        <button type="button" disabled={busy} aria-label="Close publication settings" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted disabled:opacity-50"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div><p className="break-words text-base font-extrabold">{overlay.title}</p><EventStudentVisibility overlay={overlay} nowMs={nowMs} /><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{occurrenceError ? "Update the event schedule before publishing this map." : isVisibleToStudents ? "Scheduling this map for later will hide it until the new publication time." : phase === "scheduled" ? "Publication controls when the approved map becomes visible. The event starts and ends at its own scheduled times." : "Publish now to show the approved map immediately, or choose a future publication time."}</p></div>
        <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <div><p className="text-xs font-bold text-muted-foreground">Event starts</p><p className="mt-1 text-sm font-semibold">{formatEventDate(overlay.dateStart)}</p></div>
          <div><p className="text-xs font-bold text-muted-foreground">Event ends</p><p className="mt-1 text-sm font-semibold">{formatEventDate(overlay.dateEnd)}</p></div>
        </div>
        {overlay.publicationAt && <p className="text-xs text-muted-foreground">Configured publication: {formatEventDate(overlay.publicationAt)}</p>}
        {occurrenceError && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive">{occurrenceError}</p>}
        <ThemedDateTimeField label="Schedule student publication" date={date} time={time} disabled={busy || !validOccurrence} onDateChange={value => { setDate(value); setScheduleTouched(true); setConfirmSchedule(false); }} onTimeChange={value => { setTime(value); setScheduleTouched(true); setConfirmSchedule(false); }} error={time && !isValidThemedTime(time) ? "Choose a valid time using AM or PM." : undefined} />
        {validOccurrence && scheduleError && <p role={scheduleTouched ? "alert" : undefined} className={cn("text-xs leading-relaxed", scheduleTouched ? "text-destructive" : "text-muted-foreground")}>{scheduleTouched ? scheduleError : "Choose a future date and time to change the publication schedule. The event dates stay the same."}</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {confirmUnpublish && <div role="alertdialog" aria-label="Confirm unpublish event" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-bold">Remove this event map from student view?</p><p className="mt-1 text-xs text-muted-foreground">The approved layout and schedule will be kept. You can publish it again later.</p>
          <div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirmUnpublish(false)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold">Keep published</button><button type="button" disabled={busy} onClick={() => void save({ action: "unpublish" })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-3 text-sm font-bold text-destructive-foreground">{activeAction === 'unpublish' && <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin"/>}{activeAction === 'unpublish' ? progressLabel : 'Confirm unpublish'}</button></div>
        </div>}
        {confirmSchedule && publicationAt && <div role="alertdialog" aria-label="Confirm schedule change" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-bold">This event is currently visible to students.</p>
          <p className="mt-1 text-xs text-muted-foreground">Saving this schedule will hide its map from student view until {formatEventDate(publicationAt)}. Approval and the event layout will be kept.</p>
          <div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirmSchedule(false)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold">Keep visible</button><button type="button" disabled={busy} onClick={() => void save({ action: "schedule", publicationAt })} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground">Confirm schedule</button></div>
        </div>}
      </div>
      <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-4 sm:grid-cols-3">
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground hover:bg-muted">Cancel</button>
        <button type="button" disabled={busy || !validOccurrence || isVisibleToStudents || !overlay.updatedAt} title={isVisibleToStudents ? "This event map is already visible to students." : undefined} onClick={() => void save({ action: "publish_now" })} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold", isVisibleToStudents ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-primary text-primary-foreground disabled:opacity-50")}>{activeAction === 'publish_now' ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}{activeAction === 'publish_now' ? progressLabel : isVisibleToStudents ? "Published" : "Publish now"}</button>
        <button type="button" disabled={busy || Boolean(scheduleError) || !overlay.updatedAt} onClick={requestSchedule} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary px-3 text-sm font-bold text-primary disabled:opacity-50 sm:col-span-1">{activeAction === 'schedule' ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <Clock3 aria-hidden="true" className="h-4 w-4" />}{activeAction === 'schedule' ? progressLabel : 'Save schedule'}</button>
        {overlay.isActive && <button type="button" disabled={busy} onClick={() => setConfirmUnpublish(true)} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-destructive/40 text-sm font-bold text-destructive hover:bg-destructive/5 disabled:opacity-50 sm:col-span-3"><XCircle className="h-4 w-4" />Unpublish</button>}
        {busy && <span role="status" className="sr-only">{progressLabel}</span>}
      </footer>
    </motion.section></Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
