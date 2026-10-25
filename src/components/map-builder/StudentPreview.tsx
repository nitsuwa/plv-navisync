import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CheckCircle2, Globe2, Loader2, X, AlertTriangle } from "lucide-react";
import { CampusMapPage } from "../../pages/CampusMapPage";
import type { Campus } from "./types";
import type { ValidationIssue } from "./ValidationErrorsDialog";
import { cn } from "../../lib/utils";
import { CampusPublicationOutcomeUncertainError, CampusPublicationTimeoutError } from "../../services/campusService";

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
  const [publishError, setPublishError] = useState<{ title: string; message: string } | null>(null);
  const [publishOutcomeUncertain, setPublishOutcomeUncertain] = useState(false);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const publishingRef = useRef(false);
  const publishDialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPreparing(false));
    return () => cancelAnimationFrame(frame);
  }, []);

  const blockers = useMemo(() => validationIssues.filter((issue) => issue.severity === "error"), [validationIssues]);
  const warnings = useMemo(() => validationIssues.filter((issue) => issue.severity === "warning"), [validationIssues]);
  useEffect(() => {
    if (confirmOpen) cancelButtonRef.current?.focus();
  }, [confirmOpen]);

  const issueLocation = (issue: ValidationIssue) => {
    const building = issue.buildingId ? campus.buildings.find((item) => item.id === issue.buildingId) : undefined;
    const floor = building && issue.floorId ? building.floors.find((item) => item.id === issue.floorId) : undefined;
    const room = floor && issue.roomId ? floor.rooms.find((item) => item.id === issue.roomId) : undefined;
    return [building?.name || building?.code, floor?.label, room?.name].filter(Boolean).join(" · ") || null;
  };
  const warningTitle = (issue: ValidationIssue) => {
    if (issue.type === "no_emergency_exit_configured") {
      return `${issueLocation(issue) || "Building"}: No dedicated emergency exit`;
    }
    return issue.message.length > 120 ? `${issue.message.slice(0, 117).trimEnd()}…` : issue.message;
  };
  const warningDescription = (issue: ValidationIssue) => issue.type === "no_emergency_exit_configured"
    ? "Emergency routes may use a general entrance instead."
    : issue.message;
  const previewLabel = campus.lifecycleStatus === "coming_soon"
    ? "Coming Soon Preview"
    : campus.publishStatus === "published" ? "Published Map Preview" : "Draft Preview";

  const submitPublish = async () => {
    if (publishingRef.current || blockers.length > 0) return;
    publishingRef.current = true;
    setPublishing(true);
    setPublishError(null);
    try {
      await onPublish();
      setConfirmOpen(false);
      setPublished(true);
      setPublishOutcomeUncertain(false);
    } catch (error) {
      console.error("[StudentPreview] Campus publication failed", error);
      const uncertain = error instanceof CampusPublicationOutcomeUncertainError
        || (error instanceof CampusPublicationTimeoutError && !error.confirmedNotPublished);
      setPublishOutcomeUncertain(uncertain);
      if (error instanceof CampusPublicationTimeoutError) {
        setPublishError({ title: "Publishing took too long", message: error.message });
      } else if (error instanceof CampusPublicationOutcomeUncertainError) {
        setPublishError({ title: error.timedOut ? "Publishing took too long" : "Publication status is unclear", message: error.message });
      } else if (error instanceof Error && error.message.startsWith("Campus isn't ready to publish")) {
        setPublishError({ title: "Campus isn't ready to publish", message: error.message });
      } else {
        setPublishError({
          title: "Campus couldn't be published",
          message: "We couldn't publish this saved version. Your draft remains unchanged. Review the issue and try again.",
        });
      }
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  return (
    <motion.div
      data-testid="student-preview-root"
      data-student-preview-root="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[300] flex flex-col overflow-hidden bg-background"
      aria-label="Student Preview"
    >
      <header data-testid="student-preview-toolbar" className="relative z-10 flex w-full shrink-0 justify-end border-b border-border bg-background/95 px-2 py-1.5 shadow-sm sm:px-3">
        <div className="flex w-full max-w-full flex-wrap items-center justify-between gap-1.5 sm:w-auto sm:flex-nowrap sm:gap-2 rounded-xl border border-primary/25 bg-card/95 px-2 py-1.5 shadow-sm sm:px-2.5">
          <div className="flex min-w-0 items-center gap-1.5 pr-0.5">
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{previewLabel}</p>
          </div>
          <button onClick={onBack} disabled={publishing || publishOutcomeUncertain} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-bold text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50" aria-label="Back to editor">
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Back to Editor</span><span className="sm:hidden">Back</span>
          </button>
          {!published && (
            <button onClick={() => setConfirmOpen(true)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90">
              <Globe2 className="h-3.5 w-3.5" /> Publish
            </button>
          )}
        </div>
      </header>

      <div data-testid="student-preview-viewport" className="relative min-h-0 flex-1 overflow-hidden">
        <CampusMapPage previewCampus={campus} fullScreen fullScreenHeight="100%" />
      </div>

      <AnimatePresence>
        {preparing && (
          <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="pointer-events-none fixed inset-0 z-[340] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/95 px-4 py-3 text-xs font-bold text-foreground shadow-lg"><Loader2 className="h-4 w-4 animate-spin text-primary" />Preparing Student Preview…</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {published && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[350] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-2xl sm:p-7"
              role="dialog"
              aria-modal="true"
              aria-label="Campus Published"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-extrabold text-foreground">Campus Published</h2>
              <p className="mx-auto mt-1 max-w-xs text-sm leading-5 text-muted-foreground">The latest campus version is now available to students.</p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                {onViewPublished && <button onClick={onViewPublished} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none">View Student Map</button>}
                <button onClick={onBack} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-border px-4 text-xs font-bold text-foreground transition-colors hover:bg-muted sm:flex-none">Back to Map Builder</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmOpen && !published && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[360] flex items-center justify-center overflow-y-auto bg-black/35 p-3 sm:p-4" onClick={() => { if (!publishing && !publishOutcomeUncertain) setConfirmOpen(false); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !publishing && !publishOutcomeUncertain) {
                  event.stopPropagation();
                  setConfirmOpen(false);
                  return;
                }
                if (event.key !== "Tab") return;
                const focusable = publishDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])");
                if (!focusable?.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }}
              ref={publishDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="publish-campus-dialog-title"
              aria-busy={publishing}
            >
              <div className="flex shrink-0 items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", blockers.length ? "bg-red-100 text-red-600" : warnings.length ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600")}>
                  {blockers.length || warnings.length ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Globe2 className="h-4 w-4" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="publish-campus-dialog-title" className="text-base font-extrabold text-foreground">
                    {publishing ? "Publishing Campus…" : publishError?.title ?? (blockers.length ? "Campus isn’t ready to publish yet" : "Publish Campus?")}
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {publishing ? "Publishing the saved version for students. Please wait for server confirmation." : `Students will see this saved version of ${campus.name}.`}
                  </p>
                </div>
                {!publishing && !publishOutcomeUncertain && <button onClick={() => setConfirmOpen(false)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Close publish dialog"><X className="h-4 w-4" /></button>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-4 sm:px-5">
              {(blockers.length > 0 || warnings.length > 0) && (
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
                  {blockers.length > 0 && <div><p className="text-xs font-bold text-red-700 dark:text-red-300">Publishing blocked · {blockers.length} {blockers.length === 1 ? "issue" : "issues"}</p><ul className="mt-2 max-h-32 space-y-2 overflow-y-auto text-sm text-muted-foreground">{blockers.slice(0, 6).map((issue, index) => <li key={`${issue.type}-${index}`} className="rounded-lg border border-red-200/70 bg-background/60 px-3 py-2"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-red-700">Blocking error</span>{issue.message}{issueLocation(issue) && <span className="mt-1 block text-xs text-muted-foreground">{issueLocation(issue)}</span>}</li>)}</ul>{blockers.length > 6 && <p className="mt-1 text-xs text-muted-foreground">And {blockers.length - 6} more blocking issues.</p>}</div>}
                  {warnings.length > 0 && <section>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{warnings.length} non-blocking {warnings.length === 1 ? "warning" : "warnings"}</p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Review these findings before continuing. They do not prevent publishing.</p>
                      </div>
                      <button type="button" onClick={() => setWarningsExpanded((expanded) => !expanded)} aria-expanded={warningsExpanded} className="shrink-0 rounded-md px-1 py-1 text-xs font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {warningsExpanded ? "Hide details" : "View details"}
                      </button>
                    </div>
                    {warningsExpanded && <ul className="mt-3 space-y-2" aria-label="Publication warning details">{warnings.map((issue, index) => <li key={`${issue.type}-${index}`} className="rounded-lg border border-amber-200/70 bg-background/60 px-3 py-2.5 text-sm text-foreground dark:border-amber-800/60">
                      <p className="font-semibold leading-5">{warningTitle(issue)}</p>
                      {issue.type === "no_emergency_exit_configured" && <p className="mt-1 text-xs leading-5 text-muted-foreground">{warningDescription(issue)}</p>}
                      {issue.type !== "no_emergency_exit_configured" && issueLocation(issue) && <p className="mt-1 text-xs leading-5 text-muted-foreground">{issueLocation(issue)}</p>}
                      {(issue.type === "no_emergency_exit_configured" || warningTitle(issue) !== issue.message) && <details className="mt-2 border-t border-border/70 pt-2 text-xs">
                        <summary className="cursor-pointer font-semibold text-muted-foreground">Technical details</summary>
                        <p className="mt-2 break-words leading-5 text-muted-foreground">{issue.message}{issueLocation(issue) && ` · ${issueLocation(issue)}`}</p>
                      </details>}
                    </li>)}</ul>}
                  </section>}
                </div>
              )}
              {publishError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">{publishError.message}</p>}
              {publishing && <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm font-semibold text-primary" role="status" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Publishing saved campus data…</div>}
              </div>
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                {!publishing && !publishOutcomeUncertain && <button ref={cancelButtonRef} onClick={() => setConfirmOpen(false)} className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Cancel</button>}
                <button onClick={submitPublish} disabled={publishing || blockers.length > 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card">
                  {publishing ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Publishing…</> : publishOutcomeUncertain ? "Verify status & retry" : publishError ? "Retry Publish" : warnings.length > 0 ? "Publish Anyway" : "Publish"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
