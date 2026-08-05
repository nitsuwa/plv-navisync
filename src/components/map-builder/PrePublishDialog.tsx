import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle, CheckCircle2, X, Globe, Building2, MapPin,
  Layers, Ruler, FileText, Navigation, Accessibility, ArrowRight,
  ChevronDown, ChevronRight, Loader2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Campus, CampusBuilding } from "./types";
import type { ValidationIssue, ValidationSeverity } from "./ValidationErrorsDialog";

// ── Check definitions ──────────────────────────────────────────────────────

interface CheckGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  checks: string[]; // issue type prefixes that belong to this group
}

const CHECK_GROUPS: CheckGroup[] = [
  {
    id: "structure", label: "Campus Structure", icon: MapPin,
    color: "var(--primary)",
    checks: ["missing_campus_name", "no_buildings", "canvas_not_configured", "duplicate_code"],
  },
  {
    id: "buildings", label: "Buildings & Floors", icon: Building2,
    color: "#1e40af",
    checks: ["missing_name", "missing_code", "boundary", "overlap", "no_floors", "empty_floor"],
  },
  {
    id: "rooms", label: "Rooms & Spaces", icon: Layers,
    color: "#7c3aed",
    checks: ["room_out_of_bounds", "missing_room_name", "room_no_type"],
  },
  {
    id: "navigation", label: "Navigation", icon: Navigation,
    color: "#16a34a",
    checks: ["no_stairs_elevator", "room_no_nav_connection", "nav_disconnected", "no_routes"],
  },
  {
    id: "accessibility", label: "Accessibility", icon: Accessibility,
    color: "#2563eb",
    checks: ["no_elevator_accessible", "no_accessible_rooms"],
  },
];

// ── Props ──────────────────────────────────────────────────────────────────

interface PrePublishDialogProps {
  open: boolean;
  campus: Campus;
  errors: ValidationIssue[];
  onClose: () => void;
  onPublish: () => void;
  onReviewIssue: (issue: ValidationIssue) => void;
  isPublishing?: boolean;
}

// ── Severity helpers ───────────────────────────────────────────────────────

function severityScore(severity: ValidationSeverity): number {
  return severity === "error" ? 2 : severity === "warning" ? 1 : 0;
}

// ── Component ──────────────────────────────────────────────────────────────

export function PrePublishDialog({
  open, campus, errors, onClose, onPublish, onReviewIssue, isPublishing,
}: PrePublishDialogProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>("structure");
  const [confirmPublish, setConfirmPublish] = useState(false);

  // ── Group errors by check group ──
  const groupedIssues = useMemo(() => {
    const result = new Map<string, { errors: ValidationIssue[]; warnings: ValidationIssue[] }>();
    for (const group of CHECK_GROUPS) {
      result.set(group.id, { errors: [], warnings: [] });
    }
    // Uncategorized -> structure
    const def = result.get("structure")!;
    for (const err of errors) {
      let placed = false;
      for (const group of CHECK_GROUPS) {
        if (group.checks.includes(err.type)) {
          const entry = result.get(group.id)!;
          if (err.severity === "error") entry.errors.push(err);
          else entry.warnings.push(err);
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (err.severity === "error") def.errors.push(err);
        else def.warnings.push(err);
      }
    }
    return result;
  }, [errors]);

  // ── Stats ──
  const stats = useMemo(() => {
    let totalErrors = 0, totalWarnings = 0, totalInfo = 0;
    for (const err of errors) {
      if (err.severity === "error") totalErrors++;
      else if (err.severity === "warning") totalWarnings++;
      else totalInfo++;
    }
    return { totalErrors, totalWarnings, totalInfo, total: errors.length };
  }, [errors]);

  // ── Compute readiness ──
  const readiness = useMemo(() => {
    if (stats.totalErrors === 0 && stats.totalWarnings === 0) return "ready";
    if (stats.totalErrors === 0) return "warning";
    return "blocked";
  }, [stats]);

  // ── Building count ──
  const bldgs = campus.buildings;
  const totalRooms = bldgs.reduce((s, b) => s + b.floors.reduce((sf, f) => sf + f.rooms.length, 0), 0);
  const totalFloors = bldgs.reduce((s, b) => s + b.floors.length, 0);
  const totalStairs = bldgs.reduce((s, b) => s + b.floors.reduce((sf, f) => sf + (f.stairs?.length ?? 0), 0), 0);
  const totalElevators = bldgs.reduce((s, b) => s + b.floors.reduce((sf, f) => sf + (f.elevators?.length ?? 0), 0), 0);
  const totalNavConnected = bldgs.reduce((s, b) => s + b.floors.reduce((sf, f) => sf + f.rooms.filter(r => r.navConnection).length, 0), 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          style={{
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Pre-publish validation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 20 }}
            transition={{ type: "spring", duration: 0.45, bounce: 0.2 }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
            style={{ maxWidth: "580px", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ═══ HEADER ═══ */}
            <div className="flex items-start gap-3 px-6 pt-5 pb-2 shrink-0">
              <div
                className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                  readiness === "ready" ? "bg-green-100 dark:bg-green-900/20" :
                  readiness === "warning" ? "bg-amber-100 dark:bg-amber-900/20" :
                  "bg-red-100 dark:bg-red-900/20"
                )}
              >
                {readiness === "ready" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className={cn(
                    "h-5 w-5",
                    readiness === "warning" ? "text-amber-600" : "text-red-600"
                  )} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
                  {readiness === "ready" ? "Ready to Publish" :
                   readiness === "warning" ? "Publish with Warnings" :
                   "Validation Issues Found"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                  {readiness === "ready"
                    ? "Your campus map passes all pre-publish checks. You can publish it now."
                    : readiness === "warning"
                      ? "There are warnings that won't block publishing, but you may want to review them."
                      : "Fix the errors below before publishing your campus map."}
                </p>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ═══ CAMPUS SNAPSHOT ═══ */}
            <div className="px-6 py-2 shrink-0">
              <div className="flex flex-wrap gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/20">
                {[
                  { label: "Buildings", value: bldgs.length, color: "var(--primary)" },
                  { label: "Floors", value: totalFloors, color: "#1e40af" },
                  { label: "Rooms", value: totalRooms, color: "#7c3aed" },
                  { label: "Markers", value: campus.markers.length, color: "#d97706" },
                  { label: "Paths", value: campus.paths.length, color: "#94a3b8" },
                  { label: "Nav Connections", value: totalNavConnected, color: "#16a34a" },
                  { label: "Stairs", value: totalStairs, color: "#9ca3af" },
                  { label: "Elevators", value: totalElevators, color: "#86efac" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card border border-border/40">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stat.color }} />
                    <span className="text-[10px] font-extrabold text-foreground tabular-nums">{stat.value}</span>
                    <span className="text-[9px] text-muted-foreground">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ ERROR/WARNING SUMMARY BADGE ═══ */}
            {stats.total > 0 && (
              <div className="px-6 py-1 shrink-0">
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold",
                  stats.totalErrors > 0
                    ? "bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-400"
                    : "bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400"
                )}>
                  {stats.totalErrors > 0 ? (
                    <><AlertTriangle className="h-3.5 w-3.5" /> {stats.totalErrors} error{stats.totalErrors !== 1 ? "s" : ""}{stats.totalWarnings > 0 ? `, ${stats.totalWarnings} warning${stats.totalWarnings !== 1 ? "s" : ""}` : ""}</>
                  ) : (
                    <><AlertTriangle className="h-3.5 w-3.5" /> {stats.totalWarnings} warning{stats.totalWarnings !== 1 ? "s" : ""}</>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable check groups */}
            <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0 scrollbar-show-on-hover space-y-1.5">
              {CHECK_GROUPS.map((group) => {
                const data = groupedIssues.get(group.id);
                if (!data) return null;
                const groupErrors = data.errors.length;
                const groupWarnings = data.warnings.length;
                const totalGroup = groupErrors + groupWarnings;
                const Icon = group.icon;
                const isExpanded = expandedGroup === group.id;
                const hasContent = totalGroup > 0;

                return (
                  <div key={group.id} className="rounded-xl border border-border overflow-hidden">
                    {/* Group header */}
                    <button
                      onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      <Icon className="h-4 w-4 shrink-0" style={{ color: group.color }} />
                      <span className="text-xs font-extrabold text-foreground flex-1">{group.label}</span>
                      {totalGroup > 0 ? (
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                          groupErrors > 0
                            ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                            : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                        )}>
                          {groupErrors > 0 ? `${groupErrors} err` : `${groupWarnings} warn`}
                        </span>
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      )}
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>

                    {/* Expanded issues */}
                    <AnimatePresence>
                      {isExpanded && hasContent && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 pb-2.5 space-y-1">
                            {[...data.errors, ...data.warnings].map((issue, idx) => (
                              <div
                                key={`${issue.type}-${issue.buildingId ?? issue.roomId ?? idx}`}
                                className={cn(
                                  "flex items-start gap-2 px-3 py-2 rounded-lg border",
                                  issue.severity === "error"
                                    ? "bg-red-50/60 dark:bg-red-900/8 border-red-200 dark:border-red-800/20"
                                    : "bg-amber-50/60 dark:bg-amber-900/8 border-amber-200 dark:border-amber-800/20"
                                )}
                              >
                                <AlertTriangle className={cn(
                                  "h-3.5 w-3.5 shrink-0 mt-0.5",
                                  issue.severity === "error" ? "text-red-500" : "text-amber-500"
                                )} />
                                <span className="text-xs leading-relaxed text-foreground flex-1">{issue.message}</span>
                                <button
                                  onClick={() => onReviewIssue(issue)}
                                  className="shrink-0 h-6 px-2 rounded-lg border border-border text-[9px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
                                >
                                  Fix <ArrowRight className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                      {isExpanded && !hasContent && (
                        <div className="px-3.5 pb-2.5">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50/50 dark:bg-green-900/8 border border-green-200 dark:border-green-800/20">
                            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                            <span className="text-[11px] text-green-700 dark:text-green-400 font-medium">All checks passed</span>
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* ═══ FOOTER ═══ */}
            <div className="flex items-center gap-2.5 px-6 py-4 border-t border-border shrink-0">
              <button onClick={onClose}
                className="h-10 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <div className="flex-1" />
              {readiness === "ready" || readiness === "warning" ? (
                confirmPublish ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setConfirmPublish(false)}
                      className="h-10 px-3 rounded-xl border border-border text-[10px] font-bold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Back
                    </button>
                    <button onClick={onPublish} disabled={isPublishing}
                      className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isPublishing ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Publishing...</>
                      ) : (
                        <><Globe className="h-3.5 w-3.5" /> Confirm Publish</>
                      )}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmPublish(true)}
                    className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Globe className="h-3.5 w-3.5" /> Publish Now
                  </button>
                )
              ) : (
                <button disabled
                  className="h-10 px-5 rounded-xl bg-muted text-muted-foreground text-xs font-extrabold cursor-not-allowed flex items-center gap-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Fix Errors to Publish
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
