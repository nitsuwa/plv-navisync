import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { AlertCircle, Copy, LoaderCircle, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { eventOverlayService } from "../../services/eventOverlayService";
import { buildReusableLayoutPreview } from "../../lib/eventOrganizationReuse";
import type { CampusEventOverlay } from "../map-builder/types";
import type { EventOrganizationContext } from "../../types/eventOrganization";

export function ReuseOrganizationEventDialog({
  source,
  organization,
  onClose,
  onCreated,
}: {
  source: CampusEventOverlay;
  organization: EventOrganizationContext;
  onClose: () => void;
  onCreated: (event: CampusEventOverlay) => void;
}) {
  const preview = buildReusableLayoutPreview(source);
  const [title, setTitle] = useState(source.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const reducedMotion = useReducedMotion();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const created = await eventOverlayService.reuseOrganizationEvent(source, organization, title, requestId.current);
      onCreated(created);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The new draft could not be confirmed. Retry safely.");
    } finally {
      setBusy(false);
    }
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm" />
      <Dialog.Content
        onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
        className="fixed left-1/2 top-1/2 z-[81] flex max-h-[min(92dvh,48rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl outline-none"
      >
        <motion.div initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.18 }} className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div><Dialog.Title className="text-base font-extrabold">Reuse event layout</Dialog.Title><Dialog.Description className="mt-1 text-sm text-muted-foreground">Start a new organization draft from a past layout.</Dialog.Description></div>
            <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Source layout</p>
                <p className="mt-1 break-words font-semibold">{source.title} · {source.academicYear?.trim() || "Unknown academic year"}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">New organization draft</p>
                <p className="mt-1 break-words font-semibold">{organization.organizationName} · {organization.academicYear}</p>
              </div>
              <div>
                <label htmlFor="reuse-event-title" className="mb-1.5 block text-xs font-bold">New event title</label>
                <input id="reuse-event-title" aria-label="New event title" autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60" />
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs font-bold">What will be reused</p>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                  {preview.locations.map((location, index) => <li key={`${location.label}-${index}`}>{location.label} · {location.furnitureCount} furniture · {location.labelCount} labels</li>)}
                  {source.posterUrl && <li>Existing event poster link (publicly accessible)</li>}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Schedule, approval, feedback, and revision history will not carry over.</p>
                {source.posterUrl && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The poster remains a public link. Replace it in the new draft if it is outdated; referenced posters are protected from deletion.</p>}
              </div>
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">This creates a new draft that needs fresh admin approval before students can see it. Check every placement against the current map; required layout issues will be shown before submission.</p>
              {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></p>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:px-6">
              <Dialog.Close asChild><button type="button" disabled={busy} className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50">Cancel</button></Dialog.Close>
              <button type="submit" disabled={busy || !title.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? <><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> Creating draft…</> : <><Copy aria-hidden="true" className="h-4 w-4" />{error ? "Retry reuse" : "Create new draft"}</>}</button>
            </div>
          </form>
        </motion.div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
