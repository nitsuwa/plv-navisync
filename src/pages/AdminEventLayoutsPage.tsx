/**
 * AdminEventLayoutsPage — GSO approval dashboard for student org event layouts.
 *
 * Displays pending event overlays submitted by student orgs.
 * Admins can review the layout, approve it, or disapprove with comments.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarDays,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  AlertCircle,
  MessageSquare,
  Eye,
  Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { SearchBar } from "../components/ui/SearchBar";
import { EmptyState } from "../components/ui/EmptyState";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";
import {
  eventOverlayService,
  type EventOverlayStatus,
} from "../services/eventOverlayService";
import type { CampusEventOverlay } from "../components/map-builder/types";

// ── Status configuration ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EventOverlayStatus | "all",
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  all: {
    label: "All",
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
    icon: CalendarDays,
  },
  pending: {
    label: "Pending",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30",
    icon: CheckCircle2,
  },
  disapproved: {
    label: "Disapproved",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30",
    icon: XCircle,
  },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Review Modal ─────────────────────────────────────────────────────────

function ReviewModal({
  overlay,
  onClose,
  onReview,
}: {
  overlay: CampusEventOverlay;
  onClose: () => void;
  onReview: (
    id: string,
    decision: "approved" | "disapproved",
    comment?: string
  ) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const handleReview = async (decision: "approved" | "disapproved") => {
    setBusy(true);
    try {
      await onReview(
        overlay.id,
        decision,
        decision === "disapproved" ? comment : undefined
      );
      toast.success(
        decision === "approved" ? "Event layout approved" : "Event layout disapproved",
        `"${overlay.title}" has been ${decision}.`
      );
      onClose();
    } catch (err) {
      toast.error(
        "Review failed",
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  };

  const furnitureCount = overlay.eventFurniture?.length ?? 0;
  const labelCount = overlay.eventLabels?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-extrabold text-foreground text-sm">
            Review Event Layout
          </h3>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Event Info */}
          <div className="space-y-3">
            <div>
              <h4 className="font-extrabold text-foreground">{overlay.title}</h4>
              {overlay.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {overlay.description}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>
                  {formatDate(overlay.dateStart)} – {formatDate(overlay.dateEnd)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span>{overlay.locationRef?.label || "No location set"}</span>
              </div>
            </div>

            {/* Layout Summary */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Furniture</span>
                <span className="font-bold">{furnitureCount} items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Text Labels</span>
                <span className="font-bold">{labelCount} labels</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Organizer</span>
                <span className="font-bold">{overlay.organizer || "—"}</span>
              </div>
            </div>
          </div>

          {/* Admin Comment */}
          <div>
            <label
              htmlFor="review-comment"
              className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
            >
              Admin Comment {"(required if disapproving)"}
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Add feedback for the student org (optional for approval, required for disapproval)..."
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y min-h-[60px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted active:scale-[0.97] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => handleReview("disapproved")}
            disabled={busy || (comment.trim().length === 0)}
            className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-bold hover:bg-destructive/90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Disapprove
          </button>
          <button
            onClick={() => handleReview("approved")}
            disabled={busy}
            className="flex-1 h-10 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function AdminEventLayoutsPage() {
  const [overlays, setOverlays] = useState<CampusEventOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventOverlayStatus | "all">(
    "all"
  );
  const [reviewTarget, setReviewTarget] = useState<CampusEventOverlay | null>(
    null
  );
  const requestRef = useRef(0);
  const toast = useToast();

  const loadOverlays = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const data = await eventOverlayService.listEventOverlays({
        status: statusFilter,
        search,
      });
      if (requestId !== requestRef.current) return;
      setOverlays(data);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(
        err instanceof Error ? err.message : "Could not load event layouts."
      );
      setOverlays([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadOverlays();
  }, [loadOverlays]);

  const handleReview = async (
    id: string,
    decision: "approved" | "disapproved",
    comment?: string
  ) => {
    await eventOverlayService.reviewEventOverlay(id, decision, comment);
    loadOverlays();
  };

  if (loading) return <TablePageSkeleton rows={4} />;

  const tabs: { key: EventOverlayStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "disapproved", label: "Disapproved" },
  ];

  const counts: Record<string, number> = {
    all: overlays.length,
    pending: overlays.filter((o) => o.status === "pending").length,
    approved: overlays.filter((o) => o.status === "approved").length,
    disapproved: overlays.filter((o) => o.status === "disapproved").length,
  };

  if (error && overlays.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            Event Layouts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve student organization event map layouts.
          </p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="Could not load event layouts"
          description={error}
          action={
            <button
              onClick={loadOverlays}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
            >
              Try Again
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
          <h1 className="text-2xl font-extrabold text-foreground">
            Event Layouts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve student organization event map layouts.
          </p>
        </div>
      </div>

      {/* Pending Count Banner */}
      {counts.pending > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              {counts.pending} Pending Review{counts.pending !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/60">
              Student organizations are waiting for approval on their event
              layouts.
            </p>
          </div>
        </div>
      )}

      {/* Search + Filter tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="max-w-sm w-full">
          <SearchBar
            placeholder="Search event layouts..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            showShortcutHint
            size="md"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={cn(
                "shrink-0 h-8 px-3 rounded-xl text-xs font-bold transition-all active:scale-[0.97]",
                statusFilter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 text-[10px] px-1.5 rounded-full",
                  statusFilter === t.key ? "bg-white/20" : "bg-muted text-foreground"
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Event Layout Cards */}
      <div className="grid gap-4">
        {overlays.map((overlay) => {
          const status = overlay.status || "pending";
          const cfg = STATUS_CONFIG[status];
          const StatusIcon = cfg.icon;

          return (
            <div
              key={overlay.id}
              className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4 p-5">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="font-extrabold text-foreground text-sm">
                      {overlay.title}
                    </h3>
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0",
                        cfg.bg,
                        cfg.color
                      )}
                    >
                      <StatusIcon className="h-3 w-3" /> {cfg.label}
                    </div>
                  </div>
                  {overlay.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                      {overlay.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 text-primary" />{" "}
                      {overlay.locationRef?.label || "No location set"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />{" "}
                      {formatDate(overlay.dateStart)} –{" "}
                      {formatDate(overlay.dateEnd)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" /> {overlay.organizer}
                    </span>
                  </div>
                  {/* Layout stats */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                      {overlay.eventFurniture?.length ?? 0} furniture
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                      {overlay.eventLabels?.length ?? 0} labels
                    </span>
                  </div>
                </div>
              </div>

              {/* Admin Comment (if disapproved) */}
              {status === "disapproved" && overlay.adminComment && (
                <div className="px-5 py-3 border-t border-border bg-red-50/50 dark:bg-red-900/10">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase mb-0.5">
                        Admin Comment
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300">
                        {overlay.adminComment}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
                <button
                  onClick={() => setReviewTarget(overlay)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
                >
                  <Eye className="h-3.5 w-3.5" /> View & Review
                </button>

                {status === "pending" && (
                  <>
                    <button
                      onClick={() => handleReview(overlay.id, "approved")}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 active:scale-[0.97] transition-all"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Quick Approve
                    </button>
                  </>
                )}

                <div className="ml-auto text-[10px] text-muted-foreground">
                  {overlay.createdByUserId &&
                    `Created by: ${overlay.createdByUserId.slice(0, 8)}...`}
                </div>
              </div>
            </div>
          );
        })}

        {overlays.length === 0 && (
          <EmptyState
            icon={
              search || statusFilter !== "all" ? Search : CalendarDays
            }
            title={
              search
                ? "No matching layouts"
                : statusFilter !== "all"
                ? "No layouts in this category"
                : "No event layouts yet"
            }
            description={
              search
                ? "No event layouts match your search criteria."
                : statusFilter !== "all"
                ? "There are no event layouts matching the current filter."
                : "Student organizations haven't submitted any event layouts for review yet."
            }
          />
        )}
      </div>

      {/* Review Modal */}
      {reviewTarget && (
        <ReviewModal
          overlay={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onReview={handleReview}
        />
      )}
    </div>
  );
}
