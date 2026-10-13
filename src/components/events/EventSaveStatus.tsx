import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
export function EventSaveStatus({ status }: { status: string }) {
  const failed = /failed|error/i.test(status), saving = /saving/i.test(status), saved = status === "Saved";
  const Icon = failed ? AlertCircle : saving ? Loader2 : saved ? CheckCircle2 : Circle;
  return <span data-event-tour="save-status" role="status" aria-live="polite" aria-atomic="true" className={"inline-flex min-w-0 items-center gap-1.5 text-xs " + (failed ? "text-destructive" : saved ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
    <Icon aria-hidden="true" className={"h-3.5 w-3.5 shrink-0 " + (saving ? "motion-safe:animate-spin" : "")} /><span className="max-w-56 break-words">{status}</span>
  </span>;
}
