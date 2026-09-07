import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle, CheckCircle2, X, Globe, Building2, MapPin,
  Layers, Ruler, FileText, Navigation, Accessibility, ArrowRight,
  ChevronDown, ChevronRight, Loader2, Info,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Campus, CampusBuilding } from "./types";
import type { ValidationIssue, ValidationSeverity } from "./ValidationErrorsDialog";
import { resolveIssueTarget } from "../../lib/issueLocate";

// ── Check definitions (B7 Phase 3: mapped to ACTUAL current validators) ────

interface CheckGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  /** Issue types that belong to this group. A type matches if it starts with
   *  any of these prefixes (for nav_* types) or equals exactly. */
  types: string[];
}

const CHECK_GROUPS: CheckGroup[] = [
  {
    id: "campus_buildings", label: "Campus & Buildings", icon: Building2,
    color: "var(--primary)",
    types: [
      "missing_campus_name", "no_buildings", "canvas_not_configured", "duplicate_code",
      "missing_name", "missing_code", "boundary", "overlap", "no_floors",
      "empty_floor", "no_building_entrance", "no_primary_entrance", "multiple_primary_entrances",
    ],
  },
  {
    id: "rooms_content", label: "Rooms & Floor Content", icon: Layers,
    color: "#7c3aed",
    types: [
      "duplicate_room_name", "room_out_of_bounds", "missing_room_name", "room_no_type",
    ],
  },
  {
    id: "navigation", label: "Navigation", icon: Navigation,
    color: "#16a34a",
    types: [
      "nav_broken_edge", "nav_duplicate_edge", "nav_orphan_node",
      "nav_disconnected_component", "nav_entrance_bridge_missing",
      "nav_entrance_door_missing", "nav_floor_transition_invalid",
      "nav_edge_blocked_by_obstacle", "emergency_exit_no_nav", "no_emergency_exit_configured", "exterior_emergency_stair_incomplete",
    ],
  },
  {
    id: "accessibility", label: "Accessibility", icon: Accessibility,
    color: "#2563eb",
    types: [
      "nav_accessibility_contradiction",
    ],
  },
];

/** Match an issue type to a group. Nav types use prefix matching. */
function issueTypeMatchesGroup(type: string, group: CheckGroup): boolean {
  return group.types.some((t) => type === t || (t.endsWith("_") && type.startsWith(t)));
}

/** Readable location derived from the issue target + campus data. */
function issueLocation(issue: ValidationIssue, campus: Campus): string | null {
  const target = resolveIssueTarget(issue);
  if (!target) return null;
  const parts: string[] = [];
  if (target.buildingId) {
    const b = campus.buildings.find((x) => x.id === target.buildingId);
    if (b) parts.push(b.name || b.code);
  }
  if (target.floorId && target.buildingId) {
    const b = campus.buildings.find((x) => x.id === target.buildingId);
    const f = b?.floors.find((fl) => fl.id === target.floorId);
    if (f) parts.push(f.label);
  }
  if (parts.length === 0) return null;
  return parts.join(" \u00B7 ");
}

/** Concise suggested resolution for common issue types. */
function suggestedResolution(type: string): string | null {
  const resolutions: Record<string, string> = {
    duplicate_room_name: "Rename one of the rooms so names are unique on this floor.",
    emergency_exit_no_nav: "Add this door to the navigation network.",
    no_emergency_exit_configured: "Add a designated Emergency Exit or verify the safe General entrance fallback.",
    exterior_emergency_stair_incomplete: "Resolve the Exterior Emergency Stair readiness issue before relying on it for egress.",
    nav_disconnected_component: "Connect this navigation section to the main network.",
    no_building_entrance: "Add at least one usable building entrance.",
    no_primary_entrance: "Mark one entrance as Primary.",
    missing_campus_name: "Enter a name for the campus.",
    missing_name: "Enter a name for this building.",
    missing_code: "Enter a short code for this building.",
    no_floors: "Add at least one floor to this building.",
    boundary: "Ensure the building fits within the campus canvas.",
    overlap: "Move or resize buildings so they do not overlap.",
    nav_broken_edge: "Fix or remove the broken navigation connection.",
    nav_orphan_node: "Connect this waypoint to the navigation network.",
    nav_duplicate_edge: "Remove the duplicate navigation connection.",
    nav_edge_blocked_by_obstacle: "Adjust the path to avoid the obstacle.",
    nav_entrance_bridge_missing: "Link this entrance to its indoor navigation node.",
    nav_floor_transition_invalid: "Fix the stair or elevator floor-transition edge.",
    nav_accessibility_contradiction: "Review accessibility flags on this navigation element.",
  };
  return resolutions[type] ?? null;
}

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

  // ── Group errors by check group (B7 Phase 3: uses ACTUAL current types) ──
  const groupedIssues = useMemo(() => {
    const result = new Map<string, { errors: ValidationIssue[]; warnings: ValidationIssue[]; info: ValidationIssue[] }>();
    for (const group of CHECK_GROUPS) {
      result.set(group.id, { errors: [], warnings: [], info: [] });
    }
    // Uncategorized goes to campus_buildings as fallback
    const fallback = result.get("campus_buildings")!;
    for (const err of errors) {
      let placed = false;
      for (const group of CHECK_GROUPS) {
        if (issueTypeMatchesGroup(err.type, group)) {
          const entry = result.get(group.id)!;
          if (err.severity === "error") entry.errors.push(err);
          else if (err.severity === "warning") entry.warnings.push(err);
          else entry.info.push(err);
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (err.severity === "error") fallback.errors.push(err);
        else if (err.severity === "warning") fallback.warnings.push(err);
        else fallback.info.push(err);
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

  // ── Compute readiness (B7 Phase 3: user-friendly wording) ──
  const readiness = useMemo(() => {
    if (stats.totalErrors === 0 && stats.totalWarnings === 0) return "ready" as const;
    if (stats.totalErrors === 0) return "warning" as const;
    return "blocked" as const;
  }, [stats]);

  // ── Validation summary: passed checks count ──
  const summary = useMemo(() => {
    const totalChecks = CHECK_GROUPS.length;
    const groupsWithIssues = new Set<string>();
    for (const [id, data] of groupedIssues) {
      if (data.errors.length + data.warnings.length > 0) groupsWithIssues.add(id);
    }
    return {
      passed: totalChecks - groupsWithIssues.size,
      total: totalChecks,
      errors: stats.totalErrors,
      warnings: stats.totalWarnings,
    };
  }, [groupedIssues, stats]);

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
                   readiness === "warning" ? "Needs Attention" :
                   "Not Ready to Publish"}
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

            {/* ═══ VALIDATION SUMMARY (B7 Phase 3) ═══ */}
            <div className="px-6 py-1.5 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold",
                  stats.totalErrors > 0
                    ? "bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-400"
                    : stats.totalWarnings > 0
                      ? "bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400"
                      : "bg-green-50 dark:bg-green-900/15 text-green-700 dark:text-green-400"
                )}>
                  {stats.totalErrors > 0 ? (
                    <><AlertTriangle className="h-3 w-3" /> {stats.totalErrors} error{stats.totalErrors !== 1 ? "s" : ""}</>
                  ) : stats.totalWarnings > 0 ? (
                    <><AlertTriangle className="h-3 w-3" /> {stats.totalWarnings} warning{stats.totalWarnings !== 1 ? "s" : ""}</>
                  ) : (
                    <><CheckCircle2 className="h-3 w-3" /> All checks passed</>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {summary.passed} of {summary.total} checks passed
                </span>
              </div>
            </div>

            {/* Scrollable check groups */}
            <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0 scrollbar-show-on-hover space-y-1.5">
              {CHECK_GROUPS.map((group) => {
                const data = groupedIssues.get(group.id);
                if (!data) return null;
                const groupErrors = data.errors.length;
                const groupWarnings = data.warnings.length;
                const groupInfo = data.info.length;
                const totalGroup = groupErrors + groupWarnings + groupInfo;
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
                            : groupWarnings > 0
                              ? "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                              : "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                        )}>
                          {groupErrors > 0 ? `${groupErrors} err` : groupWarnings > 0 ? `${groupWarnings} warn` : `${groupInfo} info`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-green-600 dark:text-green-400 font-bold">Passed</span>
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
                            {[...data.errors, ...data.warnings, ...data.info].map((issue, idx) => {
                              const location = issueLocation(issue, campus);
                              const resolution = suggestedResolution(issue.type);
                              return (
                                <div
                                  key={`${issue.type}-${issue.buildingId ?? issue.roomId ?? idx}`}
                                  className={cn(
                                    "px-3 py-2 rounded-lg border",
                                    issue.severity === "error"
                                      ? "bg-red-50/60 dark:bg-red-900/8 border-red-200 dark:border-red-800/20"
                                      : issue.severity === "warning"
                                        ? "bg-amber-50/60 dark:bg-amber-900/8 border-amber-200 dark:border-amber-800/20"
                                        : "bg-blue-50/60 dark:bg-blue-900/8 border-blue-200 dark:border-blue-800/20"
                                  )}
                                >
                                  <div className="flex items-start gap-2">
                                    {issue.severity === "error" ? (
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
                                    ) : issue.severity === "warning" ? (
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                                    ) : (
                                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs leading-relaxed text-foreground block">{issue.message}</span>
                                      {location && (
                                        <span className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                          <MapPin className="h-2 w-2 shrink-0" />{location}
                                        </span>
                                      )}
                                      {resolution && (
                                        <span className="text-[9px] text-muted-foreground mt-0.5 block italic">{resolution}</span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => onReviewIssue(issue)}
                                      className="shrink-0 h-6 px-2 rounded-lg border border-border text-[9px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
                                    >
                                      Fix <ArrowRight className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
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
              {readiness === "ready" ? (
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
              ) : readiness === "warning" ? (
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
                        <><Globe className="h-3.5 w-3.5" /> Publish with Warnings</>
                      )}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmPublish(true)}
                    className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Review Warnings & Publish
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
