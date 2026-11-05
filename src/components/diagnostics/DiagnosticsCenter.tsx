import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bug, Check, Clipboard, Download, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/StudentAuthContext";
import {
  OPEN_DIAGNOSTICS_EVENT,
  createDiagnosticReport,
  diagnosticReportFilename,
  formatDiagnosticSummary,
  getMapDiagnosticContext,
  getRecentDiagnosticEvents,
  isDiagnosticsAuthorized,
  recordDiagnosticEvent,
  subscribeDiagnosticEvents,
  type DiagnosticEvent,
} from "../../lib/diagnostics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../app/components/ui/dialog";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function useDiagnosticEvents(open: boolean): DiagnosticEvent[] {
  const [events, setEvents] = useState(getRecentDiagnosticEvents);
  useEffect(() => {
    if (!open) return;
    setEvents(getRecentDiagnosticEvents());
    return subscribeDiagnosticEvents(() => setEvents(getRecentDiagnosticEvents()));
  }, [open]);
  return events;
}

export function DiagnosticsCenter({ localUnlockEnabled = import.meta.env.DEV }: { localUnlockEnabled?: boolean } = {}) {
  const auth = useAuth();
  const adminAuthorized = isDiagnosticsAuthorized({ status: auth.status, hasSession: Boolean(auth.session), profile: auth.profile });
  const [open, setOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [developerId, setDeveloperId] = useState("");
  const [developerPassword, setDeveloperPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [developerToken, setDeveloperToken] = useState<string | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState(0);
  const [issue, setIssue] = useState("");
  const [report, setReport] = useState<ReturnType<typeof createDiagnosticReport> | null>(null);
  const [status, setStatus] = useState("");
  const events = useDiagnosticEvents(open);
  const authorized = adminAuthorized || Boolean(developerToken);

  const lockDeveloperAccess = useCallback(() => {
    const token = developerToken;
    setDeveloperToken(null);
    setOpen(false);
    setIssue("");
    setReport(null);
    if (token && localUnlockEnabled) {
      void fetch("/__plv/diagnostics/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
  }, [developerToken, localUnlockEnabled]);

  const validateDeveloperAccess = useCallback(async (): Promise<boolean> => {
    if (adminAuthorized) return true;
    if (!localUnlockEnabled || !developerToken) return false;
    try {
      const response = await fetch("/__plv/diagnostics/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: developerToken }),
      });
      if (!response.ok) throw new Error("expired");
      setLastActivityAt(Date.now());
      return true;
    } catch {
      setUnlockError("Developer Diagnostics access expired. Unlock again to continue.");
      lockDeveloperAccess();
      return false;
    }
  }, [adminAuthorized, developerToken, localUnlockEnabled, lockDeveloperAccess]);

  const openFromShortcut = useCallback(() => {
    if (adminAuthorized || developerToken) {
      setIssue("");
      setReport(null);
      setStatus("");
      setOpen(true);
      return;
    }
    if (localUnlockEnabled) {
      setDeveloperId("");
      setDeveloperPassword("");
      setUnlockError("");
      setUnlockOpen(true);
    }
  }, [adminAuthorized, developerToken, localUnlockEnabled]);

  const unlockDiagnostics = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!localUnlockEnabled || unlockBusy) return;
    setUnlockBusy(true);
    setUnlockError("");
    try {
      const response = await fetch("/__plv/diagnostics/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerId, password: developerPassword }),
      });
      if (!response.ok) throw new Error("invalid");
      const result = await response.json() as { token?: unknown };
      if (typeof result.token !== "string" || !result.token) throw new Error("invalid");
      setDeveloperToken(result.token);
      const now = Date.now();
      setLastActivityAt(now);
      setDeveloperPassword("");
      setUnlockOpen(false);
      setOpen(true);
    } catch {
      setDeveloperPassword("");
      setUnlockError("Could not unlock Diagnostics. Check the credentials or local development configuration.");
    } finally {
      setUnlockBusy(false);
    }
  };

  useEffect(() => {
    const requestOpen = () => { if (authorized) openFromShortcut(); };
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d";
      if (!shortcut || event.repeat || isTypingTarget(event.target) || (!adminAuthorized && !developerToken && !localUnlockEnabled)) return;
      event.preventDefault();
      openFromShortcut();
    };
    window.addEventListener(OPEN_DIAGNOSTICS_EVENT, requestOpen);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(OPEN_DIAGNOSTICS_EVENT, requestOpen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [adminAuthorized, developerToken, authorized, localUnlockEnabled, openFromShortcut]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => recordDiagnosticEvent({
      category: "runtime",
      severity: "error",
      summary: event.message || "An uncaught JavaScript error occurred.",
      source: event.filename ? event.filename.split(/[\\/]/).pop() : "window.error",
    });
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : typeof event.reason === "string" ? event.reason : "An unhandled promise rejection occurred.";
      recordDiagnosticEvent({ category: "runtime", severity: "error", summary: reason, source: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (!authorized) setOpen(false);
  }, [authorized]);

  useEffect(() => {
    if (!developerToken || !open) return;
    const remaining = Math.max(0, 10 * 60 * 1000 - (Date.now() - lastActivityAt));
    const timer = window.setTimeout(lockDeveloperAccess, remaining);
    return () => window.clearTimeout(timer);
  }, [developerToken, lastActivityAt, open, lockDeveloperAccess]);

  const summary = useMemo(() => report ? formatDiagnosticSummary(report) : "", [report]);

  const capture = async () => {
    if (!authorized || !(await validateDeveloperAccess())) return;
    const context = getMapDiagnosticContext();
    const outdoorCanvas = document.querySelector<HTMLCanvasElement>("[data-testid='student-campus-3d-canvas']");
    const indoorRoot = document.querySelector<HTMLElement>("[data-testid='student-indoor-3d-renderer']");
    const canvas = outdoorCanvas ?? indoorRoot?.querySelector("canvas") ?? null;
    let webgl: "ready" | "context-lost" | "unavailable" | "unknown" = "unknown";
    if (canvas) {
      try {
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        webgl = !gl ? "unavailable" : gl.isContextLost() ? "context-lost" : "ready";
      } catch {
        webgl = "unavailable";
      }
    }
    const next = createDiagnosticReport({
      pathname: window.location.pathname,
      userAgent: navigator.userAgent,
      width: window.innerWidth,
      height: window.innerHeight,
      context,
      events: getRecentDiagnosticEvents(),
      rendererMounted: Boolean(canvas),
      webgl,
      issue,
    });
    setReport(next);
    setStatus("Bug report captured. Copy the summary or download the JSON file.");
  };

  const copySummary = async () => {
    if (!report || !(await validateDeveloperAccess())) return;
    try {
      await navigator.clipboard.writeText(summary);
      setStatus("Debug summary copied to clipboard.");
    } catch {
      setStatus("Clipboard access is unavailable in this browser. Select and copy the summary below.");
    }
  };

  const downloadReport = async () => {
    if (!report || !(await validateDeveloperAccess())) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = diagnosticReportFilename(report.capturedAt);
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Sanitized JSON report downloaded.");
  };

  if (!adminAuthorized && !developerToken && !unlockOpen) return null;
  const context = getMapDiagnosticContext();

  return <>
    <Dialog open={unlockOpen && !adminAuthorized && !developerToken} onOpenChange={(nextOpen) => {
      setUnlockOpen(nextOpen);
      if (!nextOpen) { setDeveloperPassword(""); setUnlockError(""); }
    }}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto rounded-2xl border-border bg-card p-0 text-foreground shadow-2xl">
        <div className="border-b border-border bg-primary/[0.04] px-5 py-4 pr-12">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold"><ShieldCheck className="h-5 w-5 text-primary" /> Developer Diagnostics</DialogTitle>
            <DialogDescription>Internal troubleshooting access for local development. This does not change your account or map session.</DialogDescription>
          </DialogHeader>
        </div>
        <form onSubmit={(event) => void unlockDiagnostics(event)} className="space-y-4 px-5 py-5">
          <label className="block space-y-1.5 text-xs font-semibold">Developer ID
            <input autoComplete="username" value={developerId} onChange={(event) => setDeveloperId(event.target.value)} required maxLength={120} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold">Password
            <span className="relative block">
              <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={developerPassword} onChange={(event) => setDeveloperPassword(event.target.value)} required maxLength={1024} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 pr-12 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-1 inline-flex w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          {unlockError && <p role="alert" className="text-xs font-medium text-destructive">{unlockError}</p>}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setUnlockOpen(false); setDeveloperPassword(""); setUnlockError(""); }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">Cancel</button>
            <button type="submit" disabled={unlockBusy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"><ShieldCheck className="h-4 w-4" />{unlockBusy ? "Verifying…" : "Unlock Diagnostics"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {authorized && <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); else lockDeveloperAccess(); }}>
    <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto rounded-2xl border-border bg-card p-0 text-foreground shadow-2xl">
      <div className="border-b border-border bg-primary/[0.04] px-5 py-4 pr-12 sm:px-6">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold"><Activity className="h-5 w-5 text-primary" /> Diagnostics Center</DialogTitle>
          <DialogDescription>Capture safe system context and recent failures for developer investigation.</DialogDescription>
        </DialogHeader>
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        <section aria-label="System overview" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <OverviewItem label="Application" value={`PLV NaviSync ${report?.application.version ?? "version 0.0.1"}`} />
          <OverviewItem label="Page" value={window.location.pathname} />
          <OverviewItem label="Map mode" value={context?.mapMode ?? "Not available"} />
          <OverviewItem label="Navigation" value={context ? `${context.navigationState} / ${context.cameraMode}` : "Not available"} />
          <OverviewItem label="Map data" value={context?.mapDataStatus ?? "Not available"} />
          <OverviewItem label="Camera recovery" value={context?.cameraRecovery ?? "Not available"} />
          <OverviewItem label="Renderer" value={context?.mapMode === "3D" ? (document.querySelector("[data-testid='student-campus-3d-canvas'], [data-testid='student-indoor-3d-renderer']") ? "Mounted" : "Not mounted") : "Not expected"} />
          <OverviewItem label="Recent events" value={`${events.length} / 30`} />
          <OverviewItem label="Access" value={adminAuthorized ? "Authorized administrator" : "Local developer diagnostics"} />
        </section>

        <section className="space-y-2 rounded-xl border border-border p-3.5">
          <h3 className="text-sm font-bold">Capture a bug report</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">Add a short description if useful. The report includes only approved map, navigation, renderer, and redacted error fields.</p>
          <textarea value={issue} onChange={(event) => setIssue(event.target.value)} maxLength={500} rows={2} aria-label="What happened?" placeholder="What did you see? (optional)" className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="button" onClick={() => void capture()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"><Bug className="h-4 w-4" /> Capture Bug Report</button>
        </section>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copySummary()} disabled={!report} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45"><Clipboard className="h-4 w-4" /> Copy Debug Summary</button>
          <button type="button" onClick={() => void downloadReport()} disabled={!report} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-bold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"><Download className="h-4 w-4" /> Download JSON</button>
        </div>
        {status && <p role="status" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Check className="h-4 w-4 text-emerald-600" />{status}</p>}
        {report && <>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">Codex-ready summary</h3>
            <textarea readOnly value={summary} aria-label="Diagnostic summary" rows={12} className="w-full rounded-xl border border-border bg-muted/35 p-3 font-mono text-[11px] leading-relaxed text-foreground" />
          </section>
          <details className="rounded-xl border border-border px-3.5 py-3">
            <summary className="cursor-pointer select-none text-sm font-bold">Advanced details (sanitized JSON)</summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-[10px]">{JSON.stringify(report, null, 2)}</pre>
          </details>
        </>}

        <details className="rounded-xl border border-border px-3.5 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" /> Recent diagnostic events ({events.length})</summary>
          {events.length ? <ul className="mt-3 space-y-2">{events.slice().reverse().map((event, index) => <li key={`${event.timestamp}-${index}`} className="rounded-lg bg-muted/35 px-3 py-2 text-xs"><span className="font-semibold">{event.category} · {event.severity}</span><p className="mt-0.5 text-muted-foreground">{event.summary}</p></li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">No recent errors or warnings have been captured.</p>}
        </details>
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />No tokens, cookies, request headers, camera frames, database records, or full browser logs are included.</p>
      </div>
    </DialogContent>
  </Dialog>}
  </>;
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-border/70 bg-background px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-xs font-bold" title={value}>{value}</p></div>;
}
