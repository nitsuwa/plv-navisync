import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  Building2,
  MapPin,
  Ruler,
  FileText,
  X,
  ArrowRight,
  Layers,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  /** Machine-readable type for grouping */
  type:
    | "missing_campus_name"
    | "missing_name"
    | "missing_code"
    | "boundary"
    | "no_floors"
    | "overlap";
  /** Human-readable message explaining how to fix */
  message: string;
  /** Building ID (if the issue is building-specific) */
  buildingId?: string;
}

interface ValidationCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgClass: string;
  borderClass: string;
}

const CATEGORIES: Record<string, ValidationCategory> = {
  boundary: {
    id: "boundary",
    label: "Boundary Issues",
    icon: Ruler,
    color: "#dc2626",
    bgClass: "bg-red-50 dark:bg-red-900/10",
    borderClass: "border-red-200 dark:border-red-800/30",
  },
  missing: {
    id: "missing",
    label: "Missing Information",
    icon: FileText,
    color: "#d97706",
    bgClass: "bg-amber-50 dark:bg-amber-900/10",
    borderClass: "border-amber-200 dark:border-amber-800/30",
  },
  overlap: {
    id: "overlap",
    label: "Overlap Issues",
    icon: Layers,
    color: "#dc2626",
    bgClass: "bg-red-50 dark:bg-red-900/10",
    borderClass: "border-red-200 dark:border-red-800/30",
  },
};

/** Map issue type → category id */
const ISSUE_CATEGORY: Record<string, string> = {
  missing_campus_name: "missing",
  missing_name: "missing",
  missing_code: "missing",
  boundary: "boundary",
  no_floors: "missing",
  overlap: "overlap",
};

/** Per-issue icon */
const ISSUE_ICONS: Record<string, React.ElementType> = {
  missing_campus_name: AlertTriangle,
  missing_name: Building2,
  missing_code: Building2,
  boundary: Ruler,
  no_floors: Layers,
  overlap: Layers,
};

function getIssueIcon(type: string): React.ElementType {
  return ISSUE_ICONS[type] ?? AlertTriangle;
}

// ── Props ──────────────────────────────────────────────────────────────────

interface ValidationErrorsDialogProps {
  open: boolean;
  errors: ValidationIssue[];
  onClose: () => void;
  /** Called when the user clicks "Review Issues" – navigates to the first issue */
  onReviewIssues: (firstIssue: ValidationIssue) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ValidationErrorsDialog({
  open,
  errors,
  onClose,
  onReviewIssues,
}: ValidationErrorsDialogProps) {
  // ── Group errors by category ──────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    for (const err of errors) {
      const cat = ISSUE_CATEGORY[err.type] ?? "missing";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(err);
    }
    return map;
  }, [errors]);

  const firstIssue = errors.length > 0 ? errors[0] : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Validation Errors"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{
              type: "spring",
              duration: 0.4,
              bounce: 0.2,
            }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
            style={{ maxWidth: "520px", maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex items-start gap-3 px-6 pt-5 pb-3 shrink-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
                }}
              >
                <AlertTriangle
                  className="h-5 w-5"
                  style={{ color: "var(--destructive)" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  className="text-lg font-extrabold text-foreground"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  Validation Errors
                </h2>
                <p
                  className="mt-1 text-sm text-muted-foreground leading-relaxed"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Your campus map contains validation issues that must be fixed
                  before it can be saved.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Error count badge ── */}
            <div className="px-6 pb-2 shrink-0">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  background: "color-mix(in srgb, var(--destructive) 10%, transparent)",
                  color: "var(--destructive)",
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Found {errors.length} issue{errors.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* ── Scrollable error list ── */}
            <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0 scrollbar-show-on-hover">
              <div className="space-y-4">
                {Array.from(grouped.entries()).map(([catId, items]) => {
                  const cat = CATEGORIES[catId] ?? CATEGORIES.missing;
                  const Icon = cat.icon;
                  return (
                    <div key={catId}>
                      {/* Category header */}
                      <div className="flex items-center gap-2 mb-2">
                        <Icon
                          className="h-4 w-4 shrink-0"
                          style={{ color: cat.color }}
                        />
                        <h3
                          className="text-xs font-extrabold uppercase tracking-wider"
                          style={{ color: cat.color }}
                        >
                          {cat.label}
                        </h3>
                        <span
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            background: "color-mix(in srgb, var(--muted) 50%, transparent)",
                            color: "var(--muted-foreground)",
                          }}
                        >
                          {items.length}
                        </span>
                      </div>

                      {/* Issue items */}
                      <div className="space-y-1.5">
                        {items.map((issue, idx) => {
                          const IssueIcon = getIssueIcon(issue.type);
                          return (
                            <div
                              key={`${issue.type}-${issue.buildingId ?? idx}`}
                              className={cn(
                                "flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border",
                                cat.bgClass,
                                cat.borderClass
                              )}
                            >
                              <IssueIcon
                                className="h-4 w-4 shrink-0 mt-0.5"
                                style={{ color: cat.color }}
                              />
                              <span
                                className="text-sm leading-relaxed"
                                style={{
                                  fontFamily: "var(--font-body)",
                                  color: "var(--foreground)",
                                  lineHeight: 1.6,
                                }}
                              >
                                {issue.message}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Footer actions ── */}
            <div className="flex gap-2.5 px-6 pb-5 pt-3 border-t border-border shrink-0">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
              >
                <X className="h-4 w-4" />
                Close
              </button>
              <button
                onClick={() => {
                  if (firstIssue) onReviewIssues(firstIssue);
                }}
                disabled={!firstIssue}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <ArrowRight className="h-4 w-4" />
                Review Issues
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
