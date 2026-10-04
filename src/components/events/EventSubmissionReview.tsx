import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, MapPin, Loader2, ArrowRight } from "lucide-react";

export interface EventSubmissionLocationCheck {
  id: string;
  label: string;
  furnitureCount: number;
  labelCount: number;
  issues: Array<{ severity: "critical" | "warning" | "info"; message: string }>;
}

export function EventSubmissionReview({ open, title, locations, onClose, onConfirm, onReviewLocation, busy = false, updateMode = false, feedbackTotal = 0, feedbackOpen = 0 }: {
  open: boolean; title: string; locations: EventSubmissionLocationCheck[];
  onClose: () => void; onConfirm: () => void; onReviewLocation: (id: string) => void; busy?: boolean; updateMode?: boolean; feedbackTotal?: number; feedbackOpen?: number;
}) {
  const blocked = feedbackOpen > 0 || locations.some((location) => location.issues.some((issue) => issue.severity === "critical"));
  const totalAssets = locations.reduce((count, location) => count + location.furnitureCount, 0);
  const totalLabels = locations.reduce((count, location) => count + location.labelCount, 0);
  const totalHints = locations.reduce((count, location) => count + location.issues.filter(issue => issue.severity !== "critical").length, 0);
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm" />
      <Dialog.Content onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }} className="fixed left-1/2 top-1/2 z-[101] flex max-h-[85dvh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl">
        <Dialog.Title className="text-lg font-extrabold text-foreground">{updateMode ? "Review submission updates" : "Review before submitting"}</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">{title}: {updateMode ? "save the latest maps for GSO without withdrawing your pending proposal." : "all requested maps will be sent together for GSO review."}</Dialog.Description>
        <div className="mt-4 shrink-0 rounded-xl bg-primary/5 p-3"><p className="text-xs font-bold text-primary">Submission summary</p><p className="mt-1 text-sm font-semibold">{locations.length} requested maps · {totalAssets} assets · {totalLabels} labels</p><p className="mt-1 text-xs text-muted-foreground">{totalHints ? `${totalHints} design hints to review. Hints do not block submission.` : "The administrator sets the event schedule and publication time."}</p></div>
        {feedbackTotal > 0 && <p className="mt-3 text-xs font-semibold">GSO feedback · {feedbackTotal - feedbackOpen}/{feedbackTotal} addressed · {feedbackOpen} open</p>}
        <div className="my-4 min-h-0 space-y-3 overflow-y-auto overscroll-contain">
          {locations.map((location) => <div key={location.id} className="rounded-xl border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground"><MapPin aria-hidden className="h-4 w-4 text-primary" />{location.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{location.furnitureCount} assets · {location.labelCount} labels</p>
            {location.issues.length === 0 ? <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 aria-hidden className="h-3.5 w-3.5" />Layout checks passed</p> : <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{location.issues.map((issue, index) => <li key={index} className={issue.severity === "critical" ? "text-destructive" : ""}>{issue.severity === "critical" ? "Required fix: " : "Design hint: "}{issue.message}</li>)}</ul>}
            <button type="button" disabled={busy} onClick={() => onReviewLocation(location.id)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50">Review {location.label}<ArrowRight aria-hidden className="h-3.5 w-3.5" /></button>
          </div>)}
        </div>
        <p role="status" className="mb-3 text-xs text-muted-foreground">{blocked ? "Fix the highlighted issues before submitting. Your draft stays in the editor." : "Review any design hints, then confirm when all maps are ready."}</p>
        <div className="flex shrink-0 flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground">Keep editing</button>
          <button type="button" disabled={busy || blocked || !locations.length} onClick={onConfirm} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{busy ? (updateMode ? "Updating…" : "Submitting…") : (updateMode ? "Confirm update" : "Confirm submission")}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
