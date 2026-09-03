import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CheckCircle2, Globe2, Loader2, X, AlertTriangle } from "lucide-react";
import { CampusMapPage } from "../../pages/CampusMapPage";
import type { Campus } from "./types";
import type { ValidationIssue } from "./ValidationErrorsDialog";
import { cn } from "../../lib/utils";

interface StudentPreviewProps {
  campus: Campus;
  validationIssues: ValidationIssue[];
  onBack: () => void;
  onPublish: () => Promise<void>;
  onViewPublished?: () => void;
}

/**
 * Read-only student-facing view of the saved candidate campus. The editor is
 * left mounted underneath this fixed layer, so Back restores its exact
 * building/floor/selection context without a route reload.
 */
export function StudentPreview({ campus, validationIssues, onBack, onPublish, onViewPublished }: StudentPreviewProps) {
  const [preparing, setPreparing] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPreparing(false));
    return () => cancelAnimationFrame(frame);
  }, []);

  const blockers = useMemo(() => validationIssues.filter((issue) => issue.severity === "error"), [validationIssues]);
  const warnings = useMemo(() => validationIssues.filter((issue) => issue.severity === "warning"), [validationIssues]);

  const submitPublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await onPublish();
      setConfirmOpen(false);
      setPublished(true);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Publishing failed. Try again.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[300] overflow-hidden bg-background"
      aria-label="Student Preview"
    >
      <CampusMapPage previewCampus={campus} fullScreen />

      <div className="pointer-events-none fixed right-3 top-[8.5rem] z-[320] flex max-w-[calc(100vw-1.5rem)] justify-end md:top-3">
        <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-xl border border-primary/25 bg-card/95 px-2 py-2 shadow-lg backdrop-blur-xl sm:gap-2 sm:px-2.5">
          <div className="flex min-w-0 items-center gap-1.5 pr-0.5">
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Student Preview</p>
          </div>
          <button onClick={onBack} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-bold text-foreground hover:bg-muted" aria-label="Back to editor">
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Back to Editor</span><span className="sm:hidden">Back</span>
          </button>
          {!published && (
            <button onClick={() => setConfirmOpen(true)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90">
              <Globe2 className="h-3.5 w-3.5" /> Publish
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {preparing && (
          <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="pointer-events-none fixed inset-0 z-[340] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/95 px-4 py-3 text-xs font-bold text-foreground shadow-lg"><Loader2 className="h-4 w-4 animate-spin text-primary" />Preparing Student Preview…</div>
          </motion.div>
        )}
      </AnimatePresence>

      {published && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h2 className="mt-3 text-lg font-extrabold text-foreground">Campus Published</h2>
            <p className="mt-1 text-xs text-muted-foreground">Students will now see this version of the campus.</p>
            <div className="mt-5 flex justify-center gap-2">
              {onViewPublished && <button onClick={onViewPublished} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90">View Published Student Map</button>}
              <button onClick={onBack} className="h-9 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Back to Map Builder</button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirmOpen && !published && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[360] flex items-center justify-center bg-black/35 p-4" onClick={() => !publishing && setConfirmOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Publish campus">
              <div className="flex items-start gap-3">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", blockers.length ? "bg-red-100 text-red-600" : warnings.length ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600")}>
                  {blockers.length ? <AlertTriangle className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1"><h2 className="text-base font-extrabold text-foreground">Publish Campus?</h2><p className="mt-0.5 text-xs text-muted-foreground">Students will see this saved version of {campus.name}.</p></div>
                <button onClick={() => setConfirmOpen(false)} disabled={publishing} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close publish dialog"><X className="h-4 w-4" /></button>
              </div>
              {(blockers.length > 0 || warnings.length > 0) && (
                <div className="mt-4 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                  {blockers.length > 0 && <div><p className="text-[10px] font-extrabold uppercase tracking-wider text-red-600">Blocking issues ({blockers.length})</p><p className="mt-1 text-xs text-muted-foreground">Fix these issues before publishing.</p></div>}
                  {warnings.length > 0 && <div><p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Warnings ({warnings.length})</p><p className="mt-1 text-xs text-muted-foreground">Warnings do not prevent publishing.</p></div>}
                </div>
              )}
              {publishError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{publishError}</p>}
              <div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirmOpen(false)} disabled={publishing} className="h-9 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Cancel</button><button onClick={submitPublish} disabled={publishing || blockers.length > 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{publishing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{warnings.length > 0 ? "Publish Anyway" : "Publish"}</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
