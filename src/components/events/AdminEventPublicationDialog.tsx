import { useState } from "react";
import { CheckCircle2, Clock3, Loader2, X, XCircle } from "lucide-react";
import type { CampusEventOverlay } from "../map-builder/types";
import type { EventPublicationCommand } from "../../types/eventPreview";
import { getStudentEventPhase, formatEventDate } from "../../lib/eventPublication";
import { cn } from "../../lib/utils";
import { isValidThemedTime, manilaDateTimeParts, manilaDateTimeToIso, ThemedDateTimeField } from "../ui/ThemedDateTimeField";

export function AdminEventPublicationDialog({ overlay, onClose, onSave }: {
  overlay: CampusEventOverlay;
  onClose: () => void;
  onSave: (overlay: CampusEventOverlay, command: EventPublicationCommand) => Promise<void>;
}) {
  const initial = manilaDateTimeParts(overlay.publicationAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [busy, setBusy] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmSchedule, setConfirmSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phase = getStudentEventPhase(overlay, Date.now());
  const stateLabel = !overlay.isActive ? "Unpublished" : phase === "scheduled" ? "Scheduled" : phase === "upcoming" ? "Upcoming" : phase === "ongoing" ? "Ongoing" : phase === "ended" ? "Ended" : "Timing unavailable";
  const publicationAt = manilaDateTimeToIso(date, time);
  const dateStart = overlay.dateStart ? Date.parse(overlay.dateStart) : NaN;
  const dateEnd = overlay.dateEnd ? Date.parse(overlay.dateEnd) : NaN;
  const validOccurrence = Number.isFinite(dateStart) && Number.isFinite(dateEnd) && dateStart < dateEnd && dateEnd > Date.now();
  const scheduleError = !validOccurrence
    ? "This event needs a valid future start and end schedule before it can be published."
    : !publicationAt
    ? "Choose a valid publication date and 24-hour time."
    : Date.parse(publicationAt) <= Date.now()
      ? "Choose a future publication time."
      : !Number.isFinite(dateEnd) || Date.parse(publicationAt) >= dateEnd
        ? "Publication must be before the event ends."
        : null;

  const save = async (command: EventPublicationCommand) => {
    if (!overlay.updatedAt) { setError("This event has no server revision. Reload the event list before changing publication."); return; }
    setBusy(true); setError(null);
    try { await onSave(overlay, command); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update event publication."); }
    finally { setBusy(false); }
  };

  const requestSchedule = () => {
    if (!publicationAt) return;
    const isVisibleToStudents = phase === "upcoming" || phase === "ongoing";
    if (isVisibleToStudents && Date.parse(publicationAt) > Date.now()) {
      setConfirmSchedule(true);
      setConfirmUnpublish(false);
      return;
    }
    void save({ action: "schedule", publicationAt });
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-3 backdrop-blur-sm" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="publication-dialog-title" className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div><h2 id="publication-dialog-title" className="text-sm font-extrabold">Manage event publication</h2><p className="mt-1 text-xs text-muted-foreground">Approval and the event schedule remain unchanged.</p></div>
        <button type="button" aria-label="Close publication settings" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div><p className="text-base font-extrabold">{overlay.title}</p><p className="mt-1 text-xs text-muted-foreground">{stateLabel} · {overlay.isActive ? "Visible when publication time is reached" : "Hidden from student maps"}</p></div>
        <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <div><p className="text-xs font-bold text-muted-foreground">Event starts</p><p className="mt-1 text-sm font-semibold">{formatEventDate(overlay.dateStart)}</p></div>
          <div><p className="text-xs font-bold text-muted-foreground">Event ends</p><p className="mt-1 text-sm font-semibold">{formatEventDate(overlay.dateEnd)}</p></div>
        </div>
        {overlay.publicationAt && <p className="text-xs text-muted-foreground">Configured publication: {formatEventDate(overlay.publicationAt)}</p>}
        <ThemedDateTimeField label="Schedule student publication" date={date} time={time} disabled={busy} onDateChange={setDate} onTimeChange={setTime} error={time && !isValidThemedTime(time) ? "Use a valid 24-hour time, for example 09:00." : undefined} />
        {scheduleError && <p className="text-xs text-destructive">{scheduleError}</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {confirmUnpublish && <div role="alertdialog" aria-label="Confirm unpublish event" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-bold">Remove this event map from student view?</p><p className="mt-1 text-xs text-muted-foreground">The approved layout and schedule will be kept. You can publish it again later.</p>
          <div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirmUnpublish(false)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold">Keep published</button><button type="button" disabled={busy} onClick={() => void save({ action: "unpublish" })} className="min-h-11 rounded-xl bg-destructive px-3 text-sm font-bold text-destructive-foreground">Confirm unpublish</button></div>
        </div>}
        {confirmSchedule && publicationAt && <div role="alertdialog" aria-label="Confirm schedule change" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-bold">This event is currently visible to students.</p>
          <p className="mt-1 text-xs text-muted-foreground">Saving this schedule will hide its map from student view until {formatEventDate(publicationAt)}. Approval and the event layout will be kept.</p>
          <div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirmSchedule(false)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold">Keep visible</button><button type="button" disabled={busy} onClick={() => void save({ action: "schedule", publicationAt })} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground">Confirm schedule</button></div>
        </div>}
      </div>
      <footer className="flex shrink-0 flex-wrap gap-2 border-t border-border p-4">
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground hover:bg-muted">Cancel</button>
        <button type="button" disabled={busy || !validOccurrence} onClick={() => void save({ action: "publish_now" })} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Publish now</button>
        <button type="button" disabled={busy || Boolean(scheduleError)} onClick={requestSchedule} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary px-3 text-sm font-bold text-primary disabled:opacity-50"><Clock3 className="h-4 w-4" />Save schedule</button>
        {overlay.isActive && <button type="button" disabled={busy} onClick={() => setConfirmUnpublish(true)} className={cn("inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 text-sm font-bold text-destructive hover:bg-destructive/5 disabled:opacity-50")}><XCircle className="h-4 w-4" />Unpublish</button>}
        {busy && <span role="status" className="sr-only"><Loader2 className="h-4 w-4 animate-spin" /> Saving</span>}
      </footer>
    </section>
  </div>;
}
