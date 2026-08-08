import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import {
  Flag, MapPin, Clock, CheckCircle2, XCircle, AlertCircle,
  Search, Eye, ExternalLink, Image, StickyNote, History, Archive, RefreshCw, Download,
} from "lucide-react";
import { SearchBar } from "../components/ui/SearchBar";
import { cn } from "../lib/utils";
import { Link } from "react-router";
import { ReportsSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";
import { useEscToClose } from "../hooks/useEscToClose";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import {
  reportService,
  type IssueReport,
  type ReportStatus,
} from "../services/reportService";
import type { ActivityLogRow } from "../services/activityLogService";
import { downloadCsv, downloadJson } from "../lib/exporters";

// ── Report workflow ────────────────────────────────────────────────────────
const STATUS_ORDER: ReportStatus[] = ["pending", "under_review", "in_progress", "resolved", "rejected"];

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:      { label: "Pending",       color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30",   icon: Clock        },
  under_review: { label: "Under Review",  color: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30",      icon: AlertCircle  },
  in_progress:  { label: "In Progress",   color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/30", icon: CheckCircle2 },
  resolved:     { label: "Resolved",      color: "text-green-600 dark:text-green-400",    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30",    icon: CheckCircle2 },
  rejected:     { label: "Rejected",      color: "text-destructive",                      bg: "bg-destructive/8 border-destructive/20",                                         icon: XCircle      },
};

const CATEGORIES = ["All Categories", "maintenance", "accessibility", "hazard", "map_error"];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function friendlyAction(action: string): string {
  const map: Record<string, string> = {
    "report.pending": "Report submitted",
    "report.under_review": "Marked under review",
    "report.in_progress": "Marked in progress",
    "report.resolved": "Report resolved",
    "report.rejected": "Report rejected",
    "report.notes": "Internal notes updated",
    "report.archive": "Report archived",
  };
  return map[action] ?? action.replaceAll("_", " ").replace(/^report\./, "Report ");
}

// ── Detail modal ───────────────────────────────────────────────────────────
function ReportDetailModal({ report, onClose, onChanged }: {
  report: IssueReport;
  onClose: () => void;
  onChanged: () => void;
}) {
  useEscToClose(onClose);
  const cfg = STATUS_CONFIG[report.status as ReportStatus] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const toast = useToast();

  const [history, setHistory] = useState<ActivityLogRow[]>([]);
  const [internalNotes, setInternalNotes] = useState(report.internalNotes ?? "");
  const [resolutionNotes, setResolutionNotes] = useState(report.resolutionNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  useEffect(() => {
    reportService.getReportHistory(report.id).then(setHistory).catch(() => setHistory([]));
  }, [report.id]);

  const saveInternalNotes = async () => {
    setSavingNotes(true);
    try {
      await reportService.updateReportInternalNotes(report.id, internalNotes);
      toast.success("Notes saved", "Internal notes have been updated.");
      onChanged();
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Could not save notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const changeStatus = async (status: ReportStatus) => {
    if (status === "resolved" && !resolutionNotes.trim()) {
      toast.error("Resolution notes required", "Add a short resolution note before marking the report as resolved.");
      return;
    }
    setChangingStatus(true);
    try {
      await reportService.updateReportStatus(report.id, status, resolutionNotes.trim() || undefined);
      toast.success(STATUS_CONFIG[status].label, "Report status has been updated.");
      setShowStatusMenu(false);
      onChanged();
    } catch (err) {
      toast.error("Update failed", err instanceof Error ? err.message : "Could not update the report status.");
    } finally {
      setChangingStatus(false);
    }
  };

  const archive = async () => {
    setChangingStatus(true);
    try {
      await reportService.archiveReport(report.id);
      toast.success("Report archived", "The report has been archived.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error("Archive failed", err instanceof Error ? err.message : "Could not archive the report.");
    } finally {
      setChangingStatus(false);
    }
  };

  const mapTarget = report.buildingId ? `/map?buildingId=${report.buildingId}` : "/map";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-show-on-hover"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Flag className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-sm">{report.title}</h3>
              <p className="text-[11px] text-muted-foreground">Report #{report.id.slice(0, 8)}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close modal"
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status badge */}
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold w-fit", cfg.bg, cfg.color)}>
            <Icon className="h-4 w-4" /> {cfg.label}
          </div>

          {/* Location */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-muted/60 border border-border">
            <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-foreground">{report.buildingName ?? report.buildingId ?? "Campus"}</p>
              <p className="text-xs text-muted-foreground">{report.category} · {report.priority} priority</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Description</p>
            <p className="text-sm text-foreground leading-relaxed">{report.description}</p>
          </div>

          {/* Photo */}
          {report.imageUrl && (
            <div>
              <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Attached Photo</p>
              <img src={report.imageUrl} alt="Report evidence" className="rounded-xl border border-border max-h-48 object-cover w-full" />
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2.5 rounded-xl bg-muted/50">
              <p className="text-[10px] text-muted-foreground mb-0.5">Reporter</p>
              <p className="text-xs font-bold text-foreground truncate">{report.reporterId}</p>
            </div>
            <div className="px-3 py-2.5 rounded-xl bg-muted/50">
              <p className="text-[10px] text-muted-foreground mb-0.5">Submitted</p>
              <p className="text-xs font-bold text-foreground">{formatDateTime(report.createdAt)}</p>
            </div>
          </div>

          {/* Resolution notes */}
          <div>
            <label htmlFor="report-resolution-notes" className="block text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
              Resolution notes <span className="normal-case font-medium">(required to resolve)</span>
            </label>
            <textarea
              id="report-resolution-notes" rows={2} value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
              placeholder="e.g. Maintenance team fixed the broken light on Jan 20…"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Internal notes */}
          <div>
            <label htmlFor="report-internal-notes" className="flex items-center gap-1.5 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
              <StickyNote className="h-3 w-3" /> Internal notes <span className="normal-case font-medium">(visible to admins only)</span>
            </label>
            <textarea
              id="report-internal-notes" rows={2} value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              placeholder="Private notes for the admin team…"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-end mt-1.5">
              <Button variant="outline" size="sm" onClick={saveInternalNotes} disabled={savingNotes}>
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            </div>
          </div>

          {/* History */}
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
              <History className="h-3 w-3" /> History
            </p>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-start gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-foreground">{friendlyAction(h.action)}</p>
                      <p className="text-muted-foreground text-[11px]">{formatDateTime(h.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-5 border-t border-border pt-4 flex-wrap">
          <Link to={mapTarget}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
            <ExternalLink className="h-3.5 w-3.5" /> View on Map
          </Link>
          <button onClick={archive} disabled={changingStatus}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
            <Archive className="h-3.5 w-3.5" /> Archive
          </button>
          <div className="relative ml-auto">
            <button onClick={() => setShowStatusMenu(v => !v)} disabled={changingStatus}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 active:scale-[0.97] transition-all disabled:opacity-50">
              {changingStatus ? "Updating…" : "Change Status"}
            </button>
            {showStatusMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10 min-w-[190px] animate-scale-in">
                {STATUS_ORDER.filter(s => s !== report.status).map(s => {
                  const c = STATUS_CONFIG[s];
                  const I = c.icon;
                  return (
                    <button key={s} onClick={() => changeStatus(s)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted transition-colors text-left">
                      <I className={cn("h-3.5 w-3.5 shrink-0", c.color)} />
                      <span className="text-xs font-semibold text-foreground">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function AdminReportsPage() {
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IssueReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef(0);
  const toast = useToast();

  const loadReports = useCallback(async (showSpinner = true) => {
    const requestId = ++requestRef.current;
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await reportService.listAllReports({ status: statusFilter, category: categoryFilter === "All Categories" ? undefined : categoryFilter, search });
      if (requestId !== requestRef.current) return;
      setReports(data);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Could not load reports.");
      setReports([]);
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter, search]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleStatusChange = () => {
    loadReports(false);
  };

  /** Export the currently filtered reports (CSV or JSON). */
  const exportReports = (format: "csv" | "json") => {
    const rows = reports.map((r) => ({
      title: r.title,
      description: r.description,
      category: r.category,
      priority: r.priority,
      status: r.status,
      building: r.buildingName ?? r.buildingId ?? "Campus",
      submitted: r.createdAt,
      reporter: r.reporterId,
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") downloadCsv(rows, `reports-${stamp}.csv`);
    else downloadJson(rows, `reports-${stamp}.json`);
  };

  const counts: Record<string, number> = {
    all: reports.length,
    pending: reports.filter(r => r.status === "pending").length,
    under_review: reports.filter(r => r.status === "under_review").length,
    in_progress: reports.filter(r => r.status === "in_progress").length,
    resolved: reports.filter(r => r.status === "resolved").length,
    rejected: reports.filter(r => r.status === "rejected").length,
  };

  const tabs: { key: ReportStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "under_review", label: "Under Review" },
    { key: "in_progress", label: "In Progress" },
    { key: "resolved", label: "Resolved" },
    { key: "rejected", label: "Rejected" },
  ];

  if (loading) return <ReportsSkeleton />;

  if (error && reports.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Student Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review and resolve campus issues reported by students.</p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="Could not load reports"
          description={error}
          action={
            <button onClick={() => loadReports()}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all">
              <RefreshCw className="h-4 w-4" /> Try Again
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Student Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and resolve campus issues reported by students. Reports help keep the navigation system accurate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportReports("csv")}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            title="Download the current list as CSV" disabled={reports.length === 0}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button onClick={() => exportReports("json")}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            title="Download the current list as JSON" disabled={reports.length === 0}>
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
          <button onClick={() => loadReports(false)}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Refresh reports" title="Refresh">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
          {counts.pending > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{counts.pending} pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <motion.div
        initial="hidden" animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        {[
          { label: "Total Reports", value: counts.all, color: "text-foreground", bg: "bg-muted/50" },
          { label: "Pending", value: counts.pending, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/15" },
          { label: "In Progress", value: counts.in_progress, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/15" },
          { label: "Resolved", value: counts.resolved, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/15" },
          { label: "Rejected", value: counts.rejected, color: "text-destructive", bg: "bg-destructive/5" },
        ].map(c => (
          <motion.div
            key={c.label}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={cn("rounded-2xl border border-border p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200", c.bg)}
          >
            <p className={cn("text-2xl font-extrabold", c.color)}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setStatusFilter(t.key)}
                className={cn("shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold transition-all",
                  statusFilter === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {t.label}
                <span className={cn("text-[10px] px-1.5 rounded-full font-extrabold",
                  statusFilter === t.key ? "bg-white/20" : "bg-muted text-foreground")}>
                  {counts[t.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="custom-select h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm"
              style={{ fontFamily: "var(--font-body)" }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <div className="w-48">
              <SearchBar
                placeholder="Search reports…"
                value={search}
                onSearch={setSearch}
                onClear={() => setSearch("")}
                size="md"
              />
            </div>
          </div>
        </div>

        {/* Reports table */}
        {reports.length === 0 ? (
          <EmptyState
            icon={search || categoryFilter !== "All Categories" || statusFilter !== "all" ? Search : Flag}
            title={search || categoryFilter !== "All Categories" || statusFilter !== "all"
              ? "No matching reports"
              : "No reports yet"}
            description={(search || categoryFilter !== "All Categories" || statusFilter !== "all")
              ? "We couldn't find any reports matching your filters. Try different search terms or clear the filters to see all reports."
              : "Student-submitted reports about campus issues, accessibility concerns, and navigation inaccuracies will appear here for review and resolution. Reports are submitted from the campus map and help center."
            }
            action={(search || categoryFilter !== "All Categories" || statusFilter !== "all") ? (
              <button
                onClick={() => { setSearch(""); setCategoryFilter("All Categories"); setStatusFilter("all"); }}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted transition-all"
              >
                Clear Filters
              </button>
            ) : undefined}
          />
        ) : (
          <motion.div
            initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
            className="divide-y divide-border"
          >
            {reports.map(report => {
              const cfg = STATUS_CONFIG[report.status as ReportStatus] ?? STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={report.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors group">
                  <div className="w-9 h-9 rounded-xl bg-destructive/8 flex items-center justify-center shrink-0 mt-0.5">
                    <Flag className="h-4 w-4 text-destructive" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-bold text-foreground">{report.title}</span>
                      {report.imageUrl && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                          <Image className="h-2.5 w-2.5" /> Photo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                      <span className="truncate">{report.buildingName ?? report.buildingId ?? "Campus"} · {report.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{report.description}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold", cfg.bg, cfg.color)}>
                      <StatusIcon className="h-2.5 w-2.5" /> {cfg.label}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{formatDate(report.createdAt)}</span>
                    <button onClick={() => setSelected(report)}
                      className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="h-3 w-3" /> View
                    </button>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <ReportDetailModal
          report={selected}
          onClose={() => setSelected(null)}
          onChanged={handleStatusChange}
        />
      )}
    </div>
  );
}


