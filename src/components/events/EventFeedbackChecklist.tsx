import { useEffect, useRef, useState } from "react";
import type { CampusEventOverlay } from "../map-builder/types";
import { countOpenFeedbackPins, isFeedbackPinAddressed, readEventFeedback } from "../../lib/eventFeedbackPins";
import { normalizeEventOverlayLocations } from "../../lib/eventOverlayModel";

export function EventFeedbackChecklist({ overlay, busy = false, onChange, onLocatePin, forceOpen = false }: {
  overlay: CampusEventOverlay; busy?: boolean;
  onChange?: (locationId: string, pinId: string, addressed: boolean, note: string) => void;
  onLocatePin?: (locationId: string, pinId: string) => void;
  forceOpen?: boolean;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'open' | 'addressed'>('all');
  const rootRef = useRef<HTMLDetailsElement>(null);
  const focusPending = useRef(false);
  useEffect(() => {
    if (forceOpen) { if (rootRef.current) rootRef.current.open = true; setFilter('open'); focusPending.current = true; }
  }, [forceOpen]);
  useEffect(() => {
    if (forceOpen && filter === 'open' && focusPending.current) {
      rootRef.current?.querySelector<HTMLButtonElement>('[data-open-issue] button')?.focus();
      focusPending.current = false;
    }
  }, [forceOpen, filter]);
  const locations = normalizeEventOverlayLocations(overlay);
  const entries = Object.entries(overlay.locationFeedback ?? {}).flatMap(([locationId, feedback]) => readEventFeedback(feedback).pins.map((pin, index) => ({ locationId, feedback, pin, index })));
  if (!entries.length) return null;
  const open = countOpenFeedbackPins(overlay.locationFeedback, overlay.feedbackResolutions);
  const approved = overlay.status === "approved";
  const instructions = onChange
    ? approved
      ? "This approved map stays locked. Mark GSO feedback addressed when resolved; this only updates its status."
      : "Fix each issue on the map, then mark it as addressed before resubmitting."
    : approved
      ? "These GSO follow-up pins stay visible after approval until the student org marks them addressed."
      : "Review the submitted fixes on the map.";
  return <details ref={rootRef} data-feedback-checklist className="event-feedback-checklist rounded-xl border border-border bg-card text-xs">
    <summary className="cursor-pointer font-bold">Feedback checklist <span className="feedback-progress">{entries.length - open}/{entries.length} addressed</span></summary>
    <div className="feedback-checklist-body"><p className="mt-2 text-muted-foreground">{instructions}</p>
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter feedback">{(['all', 'open', 'addressed'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className="min-h-10 rounded-lg border border-border px-3 font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground">{value[0].toUpperCase() + value.slice(1)} {value === 'all' ? entries.length : value === 'open' ? open : entries.length - open}</button>)}</div>
    <div className="mt-3 max-h-52 space-y-2 overflow-y-auto overscroll-contain">
      {entries.map(({ locationId, feedback, pin, index }) => {
        const key = `${locationId}/${pin.id}`;
        const resolution = overlay.feedbackResolutions?.[locationId]?.[pin.id];
        const addressed = isFeedbackPinAddressed(feedback, resolution);
        if ((filter === 'open' && addressed) || (filter === 'addressed' && !addressed)) return null;
        return <div key={key} data-open-issue={addressed ? undefined : true} className="rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-3"><p className="font-semibold">{locations.find(location => location.id === locationId)?.locationRef.label ?? "Location"} · Pin {index + 1}</p><span className={addressed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>{addressed ? "Addressed" : "Open"}</span></div>
          <p className="mt-1 break-words">{pin.comment}</p>
          {onLocatePin && (!addressed || !onChange) && <button type="button" aria-label={`Show pin ${index + 1} on map`} onClick={() => { if (rootRef.current) rootRef.current.open = false; onLocatePin(locationId, pin.id); }} className="mt-2 min-h-10 rounded-lg border border-border px-3 font-semibold text-primary">Show on map</button>}
          {addressed && <p className="mt-2 break-words text-muted-foreground">Student note: {resolution?.note || "Marked as addressed"} · {new Date(resolution!.addressedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", hour12: true })} PHT</p>}
          {onChange && <div className="mt-2 flex flex-wrap gap-2">{!addressed && <input aria-label={`Resolution note for pin ${index + 1} in ${locationId}`} maxLength={1000} placeholder="What did you fix? (optional)" value={notes[key] ?? ""} onChange={event => setNotes(current => ({ ...current, [key]: event.target.value }))} className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3" />}<button type="button" disabled={busy} onClick={() => onChange(locationId, pin.id, !addressed, notes[key] ?? "")} className="min-h-10 rounded-lg border border-border px-3 font-semibold text-primary disabled:opacity-50">{addressed ? "Reopen issue" : "Mark as addressed"}</button></div>}
        </div>;
      })}
    </div></div>
  </details>;
}
