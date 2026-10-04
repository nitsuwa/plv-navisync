import { useState } from "react";
import { History, ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import { eventOverlayService, type EventRevision } from "../../services/eventOverlayService";
import { normalizeEventOverlayLocations } from "../../lib/eventOverlayModel";
import type { CampusEventOverlay } from "../map-builder/types";

export function describeEventRevision(entry: EventRevision): string[] {
  const before = normalizeEventOverlayLocations(entry.before);
  const after = normalizeEventOverlayLocations(entry.after);
  const summaries: string[] = [];
  for (const location of after) {
    const previous = before.find(candidate => candidate.id === location.id);
    const oldItems = [...(previous?.eventFurniture ?? []), ...(previous?.eventLabels ?? [])];
    const newItems = [...location.eventFurniture, ...location.eventLabels];
    const added = newItems.filter(item => !oldItems.some(old => old.id === item.id)).length;
    const removed = oldItems.filter(item => !newItems.some(next => next.id === item.id)).length;
    const changed = newItems.filter(item => { const old = oldItems.find(old => old.id === item.id); return old && JSON.stringify(old) !== JSON.stringify(item); }).length;
    if (!previous || added || removed || changed) summaries.push(`${location.locationRef.label}: ${added} added · ${removed} removed · ${changed} changed`);
  }
  for (const location of before) if (!after.some(next => next.id === location.id)) summaries.push(`${location.locationRef.label}: location removed`);
  if (entry.before.title !== entry.after.title || entry.before.description !== entry.after.description || entry.before.organizer !== entry.after.organizer) summaries.push("Event details updated");
  if (entry.before.adminComment !== entry.after.adminComment && entry.after.adminComment) summaries.push(`Admin feedback: ${entry.after.adminComment}`);
  for (const locationId of new Set([...Object.keys(entry.before.feedbackResolutions ?? {}), ...Object.keys(entry.after.feedbackResolutions ?? {})])) {
    const previous = entry.before.feedbackResolutions?.[locationId] ?? {};
    const next = entry.after.feedbackResolutions?.[locationId] ?? {};
    const label = after.find(location => location.id === locationId)?.locationRef.label ?? before.find(location => location.id === locationId)?.locationRef.label ?? 'Location';
    for (const pinId of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      if (JSON.stringify(previous[pinId]) === JSON.stringify(next[pinId])) continue;
      summaries.push(`${label}: feedback pin ${next[pinId] ? 'addressed' : 'reopened'}${next[pinId]?.note ? ` · ${next[pinId].note}` : ''}`);
    }
  }
  if (JSON.stringify(entry.before.locationFeedback) !== JSON.stringify(entry.after.locationFeedback)) summaries.push('Location feedback updated');
  return summaries;
}

export function EventRevisionHistory({ overlay }: { overlay: CampusEventOverlay }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<EventRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submittedRevision = entries.find(entry => entry.action === "submitted");
  const sinceSubmission = submittedRevision ? describeEventRevision({ before: submittedRevision.after, after: overlay } as EventRevision) : [];
  const load = async () => {
    setLoading(true); setError("");
    try { setEntries(await eventOverlayService.listEventRevisions(overlay.id)); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load event history."); }
    finally { setLoading(false); }
  };
  return <section className="rounded-xl border border-border bg-card p-3 sm:p-4 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex min-w-0 flex-1 items-start gap-2 leading-relaxed text-muted-foreground"><Clock3 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{overlay.lastEditedAt ? `Last edited: ${new Date(overlay.lastEditedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short", hour12: true })} PHT` : "Edit timestamp unavailable for this older record"}{overlay.revision ? ` · Revision ${overlay.revision}` : ""}</span></p><button type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary"><History aria-hidden className="h-4 w-4" />{open ? "Hide edit history" : "View edit history"}{open ? <ChevronUp aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" />}</button></div>
    {open && <div className="mt-3 max-h-64 space-y-3 overflow-y-auto overscroll-contain" aria-label="Event edit history">
      {!loading && !error && overlay.status === "pending" && <div className="rounded-xl bg-primary/5 p-3"><p className="font-bold text-primary">Changes since submission</p>{submittedRevision ? (sinceSubmission.length ? <ul className="mt-2 space-y-1">{sinceSubmission.map(summary => <li key={summary}>{summary}</li>)}</ul> : <p className="mt-1 text-muted-foreground">No layout or event-detail changes since the latest submission.</p>) : <p className="mt-1 text-muted-foreground">Submission baseline unavailable in the latest 100 recorded revisions. Earlier changes cannot be compared reliably.</p>}</div>}
      {loading && <p role="status">Loading saved revisions…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-bold text-primary">Retry history</button></div>}
      {!loading && !error && !entries.length && <p className="text-muted-foreground">No recorded history yet. History starts after the revision migration is installed; older edits cannot be reconstructed.</p>}
      {!loading && !error && entries.map(entry => <article key={entry.id} className="border-l-2 border-primary/20 pl-3"><p className="font-bold capitalize">{entry.action === "disapproved" ? "Needs revision" : entry.action}</p><p className="mt-1 text-muted-foreground">{new Date(entry.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PHT · {entry.actorId === overlay.createdByUserId ? "Event owner" : entry.actorId ? "Administrator / account" : "System"}</p><ul className="mt-1 space-y-1">{describeEventRevision(entry).map((summary, index) => <li key={index}>{summary}</li>)}</ul>{entry.actorId && <details className="mt-1 text-muted-foreground"><summary>Account identifier</summary><p className="break-all">{entry.actorId}</p></details>}</article>)}
    </div>}
  </section>;
}
