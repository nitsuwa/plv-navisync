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

export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Structured target used by the "Click to locate on map" workflow.
 *
 * The validator attaches this to every locatable issue so the editor can jump
 * straight to the object — no fragile message-text parsing. `scope` decides
 * whether the target lives on the campus canvas ("campus") or inside a
 * building floor ("floor"); `mode` decides which editor mode (Design vs
 * Navigation) should be active when the target is revealed.
 */
export interface IssueTarget {
  /** Where the target object lives. */
  scope: "campus" | "floor";
  /** Which editor mode should be active when the target is revealed. */
  mode: "design" | "navigation";
  /** Building ID when the target is inside a building (floor scope). */
  buildingId?: string;
  /** Floor ID when the target lives on a specific floor. */
  floorId?: string;
  /** What kind of object to select. */
  selectionType:
    | "navNode"
    | "navEdge"
    | "room"
    | "door"
    | "stairs"
    | "elevator"
    | "ramp"
    | "entrance"
    | "building"
    | "path"
    | "decorAsset"
    | "marker"
    | "wall"
    | "window"
    | "furniture"
    | "label"
    | "groundArea"
    | "campus";
  /** The object's id. For entrance issues this is the entrance id (buildingId carries the building). */
  id: string;
}

export interface ValidationIssue {
  /** Machine-readable type for grouping */
  type:
    | "missing_campus_name"
    | "missing_name"
    | "missing_code"
    | "boundary"
    | "no_floors"
    | "overlap"
    | "no_building_entrance"
    | "no_primary_entrance"
    | "multiple_primary_entrances"
    | "empty_floor"
    | "no_buildings"
    | "no_stairs_elevator"
    | "room_no_nav_connection"
    | "nav_disconnected"
    | "no_elevator_accessible"
    | "no_accessible_rooms"
    | "no_routes"
    | "duplicate_code"
    | "canvas_not_configured"
    | "room_out_of_bounds"
    | "missing_room_name"
    | "building_entrance_disconnected"
    | "room_no_nav_access"
    | "nav_dest_invalid_entity"
    | "unreachable_room"
    | "room_no_type"
    // ── B7 Phase 1: structural completeness ──
    | "duplicate_room_name"
    // ── Phase 1: Hierarchy integrity checks ──
    | "floor_no_building"
    | "room_no_floor"
    | "duplicate_id"
    | "invalid_reference"
    // ── Phase 2: Navigation graph checks ──
    | "isolated_node"
    | "nav_edge_orphan"
    | "nav_duplicate_id"
    | "zero_length_edge"
    // ── Phase 4: Multi-floor transition checks ──
    | "elevator_incomplete"
    | "stair_incomplete"
    | "no_floor_transition"
    | "stair_disconnected_nav"
    | "elevator_disconnected_nav"
    // ── Phase 6: Emergency checks ──
    | "emergency_exit_no_nav"
    | "no_emergency_exit_configured"
    | "exterior_emergency_stair_incomplete"
    | "assembly_point_unreachable"
    | "room_no_evacuation_route"
    | "emergency_route_blocked"
    // ── Phase 7: Event checks ──
    | "event_no_location"
    | "event_location_deleted"
    | "event_location_unreachable"
    // ── B5 Phase 6: Navigation graph readiness ──
    | "nav_orphan_node"
    | "nav_broken_edge"
    | "nav_duplicate_edge"
    | "nav_entrance_bridge_missing"
    | "nav_entrance_door_missing"
    | "nav_floor_transition_invalid"
    | "nav_accessibility_contradiction"
    | "nav_disconnected_component"
    // ── B5 Phase 6.10: obstacle-blocked edges ──
    | "nav_edge_blocked_by_obstacle";
  /** Severity level */
  severity: ValidationSeverity;
  /** Human-readable message explaining how to fix */
  message: string;
  /** Building ID (if the issue is building-specific) */
  buildingId?: string;
  /** Floor ID (if the issue is floor-specific) */
  floorId?: string;
  /** Room ID (if the issue is room-specific) */
  roomId?: string;
  /** Navigation node ID (if the issue is node-specific) */
  nodeId?: string;
  /** Navigation edge ID (if the issue is edge-specific) */
  edgeId?: string;
  /**
   * B5 Final: structured locate metadata. When present, "Click to locate on
   * map" uses this exclusively (no message parsing). When absent, the editor
   * falls back to deriving a target from the flat fields above.
   */
  target?: IssueTarget;
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
    label: "Boundary & Layout",
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
  navigation: {
    id: "navigation",
    label: "Navigation",
    icon: MapPin,
    color: "#16a34a",
    bgClass: "bg-green-50 dark:bg-green-900/10",
    borderClass: "border-green-200 dark:border-green-800/30",
  },
  accessibility: {
    id: "accessibility",
    label: "Accessibility",
    icon: Building2,
    color: "#2563eb",
    bgClass: "bg-blue-50 dark:bg-blue-900/10",
    borderClass: "border-blue-200 dark:border-blue-800/30",
  },
  rooms: {
    id: "rooms",
    label: "Rooms & Spaces",
    icon: Layers,
    color: "#7c3aed",
    bgClass: "bg-purple-50 dark:bg-purple-900/10",
    borderClass: "border-purple-200 dark:border-purple-800/30",
  },
};

/** Map issue type → category id */
const ISSUE_CATEGORY: Record<string, string> = {
  missing_campus_name: "missing",
  missing_name: "missing",
  missing_code: "missing",
  boundary: "boundary",
  no_floors: "missing",
  no_building_entrance: "navigation",
  no_primary_entrance: "navigation",
  multiple_primary_entrances: "navigation",
  overlap: "overlap",
  empty_floor: "missing",
  no_buildings: "missing",
  no_stairs_elevator: "navigation",
  room_no_nav_connection: "navigation",
  nav_disconnected: "navigation",
  no_elevator_accessible: "accessibility",
  no_accessible_rooms: "accessibility",
  no_routes: "navigation",
  duplicate_code: "missing",
  canvas_not_configured: "missing",
  room_out_of_bounds: "rooms",
  missing_room_name: "rooms",
  room_no_type: "rooms",
  duplicate_room_name: "rooms",
  // ── Phase 1: Hierarchy integrity ──
  floor_no_building: "missing",
  room_no_floor: "missing",
  duplicate_id: "missing",
  invalid_reference: "missing",
  // ── Phase 2: Navigation graph ──
  isolated_node: "navigation",
  nav_edge_orphan: "navigation",
  nav_duplicate_id: "missing",
  zero_length_edge: "navigation",
  elevator_incomplete: "navigation",
  stair_incomplete: "navigation",
  no_floor_transition: "navigation",
  stair_disconnected_nav: "navigation",
  elevator_disconnected_nav: "navigation",
  emergency_exit_no_nav: "navigation",
  no_emergency_exit_configured: "navigation",
  exterior_emergency_stair_incomplete: "navigation",
  assembly_point_unreachable: "boundary",
  room_no_evacuation_route: "navigation",
  emergency_route_blocked: "boundary",
  event_no_location: "missing",
  event_location_deleted: "missing",
  event_location_unreachable: "navigation",
};

/** Per-issue icon */
const ISSUE_ICONS: Record<string, React.ElementType> = {
  missing_campus_name: AlertTriangle,
  missing_name: Building2,
  missing_code: Building2,
  boundary: Ruler,
  no_floors: Layers,
  no_building_entrance: MapPin,
  no_primary_entrance: MapPin,
  multiple_primary_entrances: AlertTriangle,
  overlap: Layers,
  empty_floor: Layers,
  no_buildings: Building2,
  no_stairs_elevator: MapPin,
  room_no_nav_connection: MapPin,
  nav_disconnected: MapPin,
  no_elevator_accessible: Building2,
  no_accessible_rooms: Building2,
  no_routes: MapPin,
  duplicate_code: AlertTriangle,
  canvas_not_configured: Ruler,
  room_out_of_bounds: Ruler,
  missing_room_name: AlertTriangle,
  room_no_type: AlertTriangle,
  duplicate_room_name: Layers,
  // ── Phase 1: Hierarchy integrity ──
  floor_no_building: Layers,
  room_no_floor: Layers,
  duplicate_id: AlertTriangle,
  invalid_reference: AlertTriangle,
  // ── Phase 2: Navigation graph ──
  isolated_node: MapPin,
  nav_edge_orphan: MapPin,
  nav_duplicate_id: AlertTriangle,
  zero_length_edge: Ruler,
  elevator_incomplete: MapPin,
  stair_incomplete: MapPin,
  no_floor_transition: MapPin,
  stair_disconnected_nav: MapPin,
  elevator_disconnected_nav: MapPin,
  emergency_exit_no_nav: AlertTriangle,
  no_emergency_exit_configured: AlertTriangle,
  exterior_emergency_stair_incomplete: AlertTriangle,
  assembly_point_unreachable: MapPin,
  room_no_evacuation_route: AlertTriangle,
  emergency_route_blocked: AlertTriangle,
  event_no_location: AlertTriangle,
  event_location_deleted: AlertTriangle,
  event_location_unreachable: MapPin,
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
