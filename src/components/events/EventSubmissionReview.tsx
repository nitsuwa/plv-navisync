import * as Dialog from "@radix-ui/react-dialog";

export interface EventSubmissionLocationCheck {
  id: string;
  label: string;
  furnitureCount: number;
  labelCount: number;
  issues: Array<{ severity: "critical" | "warning" | "info"; message: string }>;
}

export function EventSubmissionReview({ open, title, locations, onClose, onConfirm, onReviewLocation, busy = false }: {
  open: boolean; title: string; locations: EventSubmissionLocationCheck[];
  onClose: () => void; onConfirm: () => void; onReviewLocation: (id: string) => void; busy?: boolean;
}) {
  const blocked = locations.some((location) => location.issues.some((issue) => issue.severity === "critical"));
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] flex max-h-[85dvh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <Dialog.Title className="text-lg font-extrabold text-foreground">Review before submitting</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">{title}: all requested maps will be sent together for GSO review.</Dialog.Description>
        <div className="my-4 min-h-0 space-y-3 overflow-y-auto">
          {locations.map((location) => <div key={location.id} className="rounded-xl border border-border p-3">
            <p className="text-sm font-bold text-foreground">{location.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{location.furnitureCount} assets · {location.labelCount} labels</p>
            {location.issues.length === 0 ? <p className="mt-2 text-xs text-emerald-600">Layout checks passed</p> : <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{location.issues.map((issue, index) => <li key={index} className={issue.severity === "critical" ? "text-destructive" : ""}>{issue.message}</li>)}</ul>}
            <button type="button" disabled={busy} onClick={() => onReviewLocation(location.id)} className="mt-2 text-xs font-bold text-primary underline">Review {location.label}</button>
          </div>)}
        </div>
        <p role="status" className="mb-3 text-xs text-muted-foreground">{blocked ? "Fix the highlighted issues before submitting. Your draft stays in the editor." : "Review any design hints, then confirm when all maps are ready."}</p>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground">Keep editing</button>
          <button type="button" disabled={busy || blocked || !locations.length} onClick={onConfirm} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Submitting…" : "Confirm submission"}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
