import { useId, useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { useToast } from "../../hooks/useToast";
import { reportService, type IssueReport, type ReportStatus } from "../../services/reportService";
import { REOPEN_REASON_MIN_LENGTH, reporterReopenState } from "../../lib/reportWorkflow";
import { cn } from "../../lib/utils";

/**
 * For a resolved or dismissed report: shows what the campus team said and
 * lets the reporter reopen it if the problem is still there. The server
 * limits reopening (twice, within 30 days) and reports why when it refuses.
 */
export function ReportClosurePanel({ report, onReopened }: { report: IssueReport; onReopened: () => void }) {
  const status = report.status as ReportStatus;
  const toast = useToast();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "resolved" && status !== "rejected") return null;
  const resolved = status === "resolved";
  const reopen = reporterReopenState({ status, updatedAt: report.updatedAt });
  const length = reason.trim().length;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await reportService.reopenOwnReport(report.id, reason);
      toast.success("Report reopened", "The campus team will review it again.");
      setOpen(false);
      setReason("");
      onReopened();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report could not be reopened.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-5 py-4 border-b border-border/50">
      <div className={cn(
        "rounded-xl border px-3 py-2.5",
        resolved ? "border-green-500/25 bg-green-500/5" : "border-destructive/20 bg-destructive/5",
      )}>
        <p className={cn(
          "flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest",
          resolved ? "text-green-700 dark:text-green-400" : "text-destructive",
        )}>
          {resolved ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
          {resolved ? "Resolution from the campus team" : "Why this report was dismissed"}
        </p>
        <p className="mt-1 break-words text-xs leading-relaxed text-foreground/85">
          {report.resolutionNotes || (resolved ? "Marked as resolved." : "No reason was recorded.")}
        </p>
      </div>

      {reopen.allowed ? (
        open ? (
          <div className="mt-3">
            <label htmlFor={fieldId} className="block text-xs font-bold text-foreground mb-1.5">
              What's still wrong?
            </label>
            <textarea
              id={fieldId}
              rows={3}
              value={reason}
              autoFocus
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The light in CABA-101 is still flickering this morning."
              className="w-full rounded-xl border border-border bg-input-background px-3 py-2 text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {length}/{REOPEN_REASON_MIN_LENGTH} characters minimum · The campus team will see this.
            </p>
            {error && <p role="alert" className="mt-1.5 text-xs font-semibold text-destructive">{error}</p>}
            <div className="mt-2.5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setReason(""); setError(null); }} disabled={submitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={length < REOPEN_REASON_MIN_LENGTH} isLoading={submitting}>
                Reopen report
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {resolved ? "Still a problem? Reopen this report" : "Disagree? Ask for another review"}
          </button>
        )
      ) : reopen.reason ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{reopen.reason} Submit a new report if the problem is back.</p>
      ) : null}
    </div>
  );
}
