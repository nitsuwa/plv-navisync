import { Trash2 } from "lucide-react";
import type { EventFeedbackPin } from "../../lib/eventFeedbackPins";

export function EventFeedbackPinList({ locationLabel, pins, onRemove, disabled = false }: {
  locationLabel: string;
  pins: EventFeedbackPin[];
  onRemove: (pinId: string) => void;
  disabled?: boolean;
}) {
  if (!pins.length) return null;
  return <ul aria-label={`Feedback pins for ${locationLabel}`} className="mt-3 space-y-2">
    {pins.map((pin, index) => <li key={pin.id} className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-muted/25 p-2.5 sm:gap-3 sm:px-3">
      <span aria-hidden="true" className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-800 dark:text-amber-300">{index + 1}</span>
      <div className="min-w-0 flex-1 py-1"><p className="text-xs font-bold text-foreground">Pin {index + 1}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{pin.comment}</p></div>
      <button type="button" disabled={disabled} aria-label={`Remove feedback pin ${index + 1} from ${locationLabel}`} onClick={() => onRemove(pin.id)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /><span>Remove</span></button>
    </li>)}
  </ul>;
}
