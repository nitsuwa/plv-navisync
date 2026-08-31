import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, ChevronRight, ChevronDown, CheckCircle2, Save, X, ZoomIn, ZoomOut, Undo2, Redo2,
  ChevronLeft,
  Grid3X3, Layers, Sofa, SeparatorHorizontal, MoveVertical,
  DoorOpen, Binary, Text, PanelRightClose, PanelRightOpen, LandPlot,
  MousePointer2, Hand, HelpCircle, AlertTriangle, Maximize2,
  Square as SquareIcon, GitBranch as GitBranchIcon, Trash2 as TrashIcon, Copy, Settings2, Route,
  Loader2, Globe2, Eye, EyeOff, Lock, Unlock, Plus, Pencil, Waypoints, Link2,
  Accessibility as AccessibilityIcon, Search, MoreHorizontal,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls, isSpacePressed } from "./useCanvasControls";
import { useFloorHistory } from "./useFloorHistory";
import {
  ROOM_MAP,
  FURNITURE_CATEGORIES, genId,
} from "./constants";
import { FloorPropertiesPanel } from "./FloorPropertiesPanel";
import { FloorNavPropertiesPanel } from "./FloorNavPropertiesPanel";
import { TestNavigationPanel, useTestRouteSession, type TestRouteHighlight, type TestRouteTransitionMarker } from "./TestNavigationPanel";
import { RouteEndpointMarker, RouteTransitionMarker } from "./RouteTransitionMarker";
import { NavigationRelationshipCard } from "./NavigationRelationshipCard";
import { FloorOverviewSidebar } from "./FloorOverviewSidebar";
import { FloorActionsMenu } from "./FloorActionsMenu";
import { FloorSettingsDialog, type FloorSettingsDraft } from "./FloorSettingsDialog";
import { ShortcutCheatSheet } from "./ShortcutCheatSheet";
import { ToolbarTooltip } from "./ToolbarTooltip";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { useToast } from "../../hooks/useToast";
import { floorUndoEntryFromFloor, normalizeFloor } from "../../lib/floorPlanNormalization";
import {
  createIndoorNavNode,
  edgeCrossesWallWithoutDoor,
  edgePolylineCrossesWallWithoutDoor,
  edgePolylinePoints,
  findCirculationAtPoint,
  findDoorAtPoint,
  findRoomAtPoint,
  indoorNavEdges,
  indoorNavNodes,
  linkedPlacementBlockAt,
  navAlignSnap,
  navEdgeMidpoint,
  navEdgePolylineDistance,
  navGroupAlignSnap,
  normalizeBendPoints,
  normalizeNavigationEdges,
  orthogonalBendsFor,
  pointInsideWallObstacle,
  pruneOrphanedIndoorNodes,
  translateOrthogonalSegment,
  rampLinkedCuePosition,
  remapIndoorNavForFloorCopy,
  roomDisplayName,
  isDoorEligibleForRoom,
  roomAccessDoorIds,
  reconcileRoomDoorEdges,
  ROOM_DOOR_EDGE_TYPE,
  roomLinkedCuePosition,
  stairEntryPosition,
  elevatorEntryPosition,
  syncIndoorLinkedNodePositions,
  linkedObjectRef,
  findNavNodeAtPoint,
  createNavEdge,
  navEdgeIsBlocked,
  navEdgeIsBlockedExtended,
  CROSS_FLOOR_EDGE_TYPE,
  findCrossFloorOwnerInfo,
  reconcileCrossFloorTransitions,
  replaceBuildingFloorsAndReconcileTransitions,
  type NavPoint,
} from "../../lib/indoorNavigationGraph";
import { findNavEdgeAtPoint, NAV_EDGE_SNAP_THRESHOLD, NAV_NODE_HIT_THRESHOLD, translateSelectedNavGraph, navGroupSelectionBounds } from "../../lib/navigationGraph";
import {
  addFloorToBuilding,
  countFloorAuthoredItems,
  deleteFloorFromBuilding,
  duplicateFloorInBuilding,
  moveFloorInBuilding,
  renameFloorInBuilding,
  stairContinuationDirectionAllows,
  stairDirectionsForFloorInOrder,
  defaultStairDirectionForFloorInOrder,
  stairLabelForEntrySide,
  isDefaultStairLabel,
  reconcileStairDirectionsForFloorOrder,
  validateStairContinuation,
} from "../../lib/floorManagement";
import { doorDisplayName, doorEntranceLinkStatus, reconcileEntranceTransitions } from "../../lib/entranceTransitions";
import { validationIssuesForFloor, mergeFloorIssueLists, floorIssuesForSelection } from "../../lib/liveValidation";
import { floorIssuesToItems } from "./ObjectIssueSection";
import { floorObjectCenter, polylineMidpoint } from "../../lib/issueLocate";
import { findOverlappingRoom, snapRoomToNearbyEdges, computeRoomAlignmentGuides, computeResizeLimits, snapResizeEdges, computeAlignmentGuides, computeResizeAlignmentGuides, clampNudgeToEdge, resolveStableAlignmentAxis, type AlignmentAxisSnapLock, type RoomAlignGuide } from "../../lib/roomOverlap";
import {
  createFittedFloorPlanBackground,
  createFloorScaleCalibration,
  fitFloorPlanBackgroundToFloor,
  measureDistanceMeters,
  resetFloorPlanBackgroundPosition,
} from "../../lib/floorPlanBackground";
import { floorPlanStorageService } from "../../services/floorPlanStorageService";
import {
  clamp as clampFloorValue,
  constrainDeltaForBounds,
  constrainLabelToFloor,
  itemBounds,
  labelBounds,
  normalizeFloorCanvasSize,
  normalizeWallRoomAnchors,
  normalizeRotation,
  nearestPointOnWall,
  rotatePoint,
  rotateFloorItem,
  resolveWallOpeningGeometry,
  clampWallOpeningOffset,
  maxOpeningWidthForWall,
  wallOpeningSafetyUnits,
  applyRoomAnchorsToWalls,
  clearWallRoomAnchors,
  floorResizeIssues,
  lockedWallsAffectedByRoomAnchors,
  resizeCirculationWithinFloor,
  resizeFurnitureWithinFloor,
  resizeRoomWithinFloor,
  rotatedRectBounds,
  roomAnchorAtPoint,
  roomAnchorSegments,
  scaleFloorItemFromBounds,
  selectionIdsInRect,
  summarizeFloorResizeIssues,
  snapPointToFloorBounds,
  syncOpeningsToWalls,
  translateFloorItem,
  validateFloorGeometry,
  wallLengthLabelPosition,
  type FloorIssue,
} from "../../lib/floorGeometry";
import type {
  Campus, FloorPlan, FloorRoom, FloorPath,
  FloorWall, FloorDoor, FloorWindow, FloorFurniture,
  FloorStairs, FloorRamp, FloorElevatorItem, FloorLabel,
  FloorSelection, SimpleTool, FloorEditorMode, FloorPlanBackground,
  RoomResizeState, FloorUndoEntry, FloorWallEndpointAnchor,
  NavigationNode, NavigationEdge, FloorNavGraphState,
} from "./types";
import { elevatorSystemNumberOf, nextElevatorSystemNumber } from "./types";

type FloorClipboardEntry = { type: Exclude<FloorSelection["type"], "navNode" | "navEdge">; id: string; item: any };
type FloorClipboard = { campusId: string; sourceFloorId: string; entries: FloorClipboardEntry[] };
// Clipboard contents intentionally live outside an individual FloorEditor
// mount so Ctrl+C on one floor can be followed by Ctrl+V after switching
// floors. This is transient editor state only; it is never persisted to a
// campus or navigation graph.
let floorObjectClipboard: FloorClipboard | null = null;

// ── Constants ───────────────────────────────────────────────────────────────

const SNAP_THRESHOLD = 8;
const DOOR_DEFAULT_WIDTH = 18;
const DOUBLE_DOOR_DEFAULT_WIDTH = 36;
const WINDOW_DEFAULT_WIDTH = 28;
const OPENING_MIN_WIDTH = 10;
const DOOR_MAX_WIDTH = 48;
const DOUBLE_DOOR_MIN_WIDTH = 28;
const DOUBLE_DOOR_MAX_WIDTH = 72;
const WINDOW_MAX_WIDTH = 72;
const OPENING_HIT_TOLERANCE = 22;
const ADVANCED_FLOOR_REFERENCE_ENABLED = false;
const PERIMETER_SIDES = ["top", "right", "bottom", "left"] as const;
type PerimeterSide = typeof PERIMETER_SIDES[number];
const WALL_SNAP_ANGLE = 45; // degrees — snap to 45° angles when drawing walls

// ── Snap helpers ────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return clampFloorValue(v, min, max);
}

/** Return a deterministic, floor-local name for a newly authored Room. */
export function nextRoomName(rooms: Pick<FloorRoom, "name">[], preferred?: string): string {
  const used = new Set(rooms.map((room) => (room.name ?? "").trim().toLocaleLowerCase()).filter(Boolean));
  const source = (preferred ?? "").trim();
  const numbered = /^room\s+(\d+)$/i.test(source) || source === "" || /^room$/i.test(source);
  if (numbered) {
    let number = 1;
    while (used.has(`room ${number}`)) number += 1;
    return `Room ${number}`;
  }
  const copyBase = `${source} Copy`;
  if (!used.has(copyBase.toLocaleLowerCase())) return copyBase;
  let suffix = 2;
  while (used.has(`${copyBase} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${copyBase} ${suffix}`;
}

/** Return the next human-friendly Elevator label on a Floor.  Generated
 * labels are floor-local; an explicit/custom source label is copied without
 * changing the physical Elevator identity. */
export function nextElevatorName(
  elevators: Pick<FloorElevatorItem, "label" | "systemNumber">[],
  preferred?: string,
): string {
  const used = new Set(elevators.map((elevator) => (elevator.label ?? "").trim().toLocaleLowerCase()).filter(Boolean));
  const source = (preferred ?? "").trim();
  const isGenerated = !source || /^elevator(?:\s+\d+)?$/i.test(source);
  if (!isGenerated) {
    const copyBase = `${source} Copy`;
    if (!used.has(copyBase.toLocaleLowerCase())) return copyBase;
    let suffix = 2;
    while (used.has(`${copyBase} ${suffix}`.toLocaleLowerCase())) suffix += 1;
    return `${copyBase} ${suffix}`;
  }
  // Numbering is intentionally floor-local.  Use the stable system number
  // when present and retain a legacy-label fallback for older saved floors.
  let number = nextElevatorSystemNumber(elevators);
  while (used.has(`elevator ${number}`)) number += 1;
  return `Elevator ${number}`;
}

/** The complete physical/navigation gate used by Room → Add Door mode. */
export function roomDoorLinkTargetIsValid(
  room: FloorRoom | undefined,
  door: FloorDoor | undefined,
  walls: FloorWall[],
  nodes: NavigationNode[],
  buildingId: string,
  floorId: string,
  linkedDoorIds: string[] = [],
  allRooms: FloorRoom[] = [],
): boolean {
  // Keep the exported helper for existing tests/callers, but delegate all
  // eligibility decisions to the shared graph-level authority.
  if (!room || room.buildingId !== buildingId || room.floorId !== floorId) return false;
  return isDoorEligibleForRoom(room, door, walls, nodes, { excludeDoorIds: linkedDoorIds, rooms: allRooms });
}

function visibleDuplicateDelta(bounds: { x: number; y: number; w: number; h: number }[], offset: number, canvasW: number, canvasH: number) {
  const candidates = [
    { dx: offset, dy: offset },
    { dx: -offset, dy: offset },
    { dx: offset, dy: -offset },
    { dx: -offset, dy: -offset },
  ].map(({ dx, dy }) => constrainDeltaForBounds(bounds, dx, dy, canvasW, canvasH));
  return candidates.sort((a, b) => Math.hypot(b.dx, b.dy) - Math.hypot(a.dx, a.dy))[0] ?? { dx: 0, dy: 0 };
}

/** Snap a value to the grid */
function snapToGrid(v: number, grid: number) {
  return Math.round(v / grid) * grid;
}

/** Snap a wall angle to the nearest 15° increment */
function snapAngleDeg(deg: number, increment: number = 15): number {
  return Math.round(deg / increment) * increment;
}

/** Distance between two points */
function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

function pointInRect(point: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function segmentsIntersect(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const cross = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: typeof a, q: typeof a, r: typeof a) =>
    Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x)
    && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (Math.abs(abC) < 0.001 && onSegment(a, c, b)) return true;
  if (Math.abs(abD) < 0.001 && onSegment(a, d, b)) return true;
  if (Math.abs(cdA) < 0.001 && onSegment(c, a, d)) return true;
  if (Math.abs(cdB) < 0.001 && onSegment(c, b, d)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function polylineIntersectsRect(points: { x: number; y: number }[], rect: { x: number; y: number; w: number; h: number }) {
  if (points.some((point) => pointInRect(point, rect))) return true;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (segmentsIntersect(a, b, corners[0], corners[1])
      || segmentsIntersect(a, b, corners[1], corners[2])
      || segmentsIntersect(a, b, corners[2], corners[3])
      || segmentsIntersect(a, b, corners[3], corners[0])) return true;
  }
  return false;
}

function textMetrics(value: string, fontSize: number) {
  const text = value.length > 0 ? value : " ";
  // Real canvas measurement is used when a 2D context is available (production
  // browsers). JSDOM/test environments return null (or can throw), so we fall
  // back to a deterministic per-character estimate — no canvas dependency is
  // added just for tests.
  try {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const context = canvas?.getContext("2d");
    if (context && typeof context.measureText === "function") {
      context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      return { width: Math.ceil(context.measureText(text).width), height: Math.ceil(fontSize * 1.35) };
    }
  } catch {
    // Fall through to the deterministic estimate below.
  }
  return { width: Math.ceil(text.length * fontSize * 0.62), height: Math.ceil(fontSize * 1.35) };
}

function inlineLabelEditorBounds(label: FloorLabel, value: string, canvasW: number, canvasH: number) {
  const fontSize = Math.max(11, label.fontSize);
  const metrics = textMetrics(value, fontSize);
  const width = Math.max(72, metrics.width + 20);
  const height = Math.max(32, metrics.height + 14);
  let x = label.x - 6;
  if (label.align === "center") x = label.x - width / 2;
  if (label.align === "right") x = label.x - width + 6;
  if (width <= canvasW) x = Math.max(0, Math.min(x, canvasW - width));
  else x = 0;
  let y = label.y - height + fontSize * 0.65;
  if (height <= canvasH) y = Math.max(0, Math.min(y, canvasH - height));
  else y = 0;
  return { x, y, width, height };
}

function readImageSize(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    if (typeof URL === "undefined" || typeof Image === "undefined") {
      resolve({});
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}
function wallMaterialStyle(material?: string) {
  if (material === "glass") return { coreOpacity: 0.62, casingOpacity: 0.72, dash: "6 3", casing: "#60a5fa" };
  if (material === "brick") return { coreOpacity: 1, casingOpacity: 0.86, dash: "2 2", casing: "#991b1b" };
  if (material === "wood") return { coreOpacity: 0.98, casingOpacity: 0.78, dash: "9 2 1.5 2", casing: "#92400e" };
  if (material === "drywall") return { coreOpacity: 0.92, casingOpacity: 0.58, dash: "12 4", casing: "#64748b" };
  return { coreOpacity: 1, casingOpacity: 0.85, dash: undefined, casing: "#2f3a46" };
}

function WallOpeningSymbol({
  kind,
  width,
  wallThickness,
  color,
  background,
  direction = "left",
  doorType = "single",
  hinge,
  swingSide = "a",
  selected = false,
  locked = false,
}: {
  kind: "door" | "window";
  width: number;
  wallThickness: number;
  color: string;
  background: string;
  direction?: string;
  doorType?: "single" | "double";
  hinge?: "left" | "right";
  swingSide?: "a" | "b";
  selected?: boolean;
  locked?: boolean;
}) {
  const half = width / 2;
  const gapStroke = Math.max(wallThickness + 7, 12);
  const jamb = Math.max(wallThickness / 2 + 2, 4);
  const hitId = kind === "door" ? "attached-door-opening" : "attached-window-opening";
  if (kind === "door") {
    const sliding = direction === "sliding";
    const double = doorType === "double" || direction === "double";
    const singleLeaf = width;
    const doubleLeaf = width / 2;
    const leaf = double ? doubleLeaf : singleLeaf;
    const hingeValue = hinge ?? (direction === "right" ? "right" : "left");
    const sideSign = swingSide === "b" ? 1 : -1;
    const hingeX = hingeValue === "right" ? half : -half;
    const closedX = hingeValue === "right" ? -half : half;
    const arcSweep = hingeValue === "right"
      ? (swingSide === "b" ? 1 : 0)
      : (swingSide === "b" ? 0 : 1);
    return (
      <>
        <line data-testid="door-wall-cut" x1={-half} y1={0} x2={half} y2={0}
          stroke={background} strokeWidth={gapStroke} strokeLinecap="butt" />
        <line x1={-half} y1={-jamb} x2={-half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <line x1={half} y1={-jamb} x2={half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <line x1={-half} y1={0} x2={half} y2={0} data-testid={hitId} stroke="transparent" strokeWidth={28} strokeLinecap="butt" />
        {sliding ? (
          <>
            <line data-testid="door-leaf" x1={-half} y1={-5.5} x2={half} y2={-5.5} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-half * 0.55} y1={4.5} x2={half} y2={4.5} stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.65} />
          </>
        ) : double ? (
          (() => {
            const leftOpenX = -half;
            const rightOpenX = half;
            const openY = sideSign * doubleLeaf;
            return (
          <>
            <circle data-testid="door-hinge" cx={-half} cy={0} r={2.3} fill={color} />
            <circle data-testid="door-hinge" cx={half} cy={0} r={2.3} fill={color} />
            <line data-testid="door-leaf" x1={-half} y1={0} x2={leftOpenX} y2={openY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <line data-testid="door-leaf" x1={half} y1={0} x2={rightOpenX} y2={openY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <path data-testid="door-swing-arc" d={`M 0 0 A ${doubleLeaf} ${doubleLeaf} 0 0 ${swingSide === "b" ? 0 : 1} ${leftOpenX} ${openY}`}
              fill="none" stroke={color} strokeWidth={1.5} opacity={0.82} />
            <path data-testid="door-swing-arc" d={`M 0 0 A ${doubleLeaf} ${doubleLeaf} 0 0 ${swingSide === "b" ? 1 : 0} ${rightOpenX} ${openY}`}
              fill="none" stroke={color} strokeWidth={1.5} opacity={0.82} />
          </>
            );
          })()
        ) : (
          <>
            <circle data-testid="door-hinge" cx={hingeX} cy={0} r={2.4} fill={color} />
            <line data-testid="door-leaf" x1={hingeX} y1={0} x2={hingeX} y2={sideSign * leaf} stroke={color} strokeWidth={2.7} strokeLinecap="round" />
            <path data-testid="door-swing-arc" d={`M ${closedX} 0 A ${leaf} ${leaf} 0 0 ${arcSweep} ${hingeX} ${sideSign * leaf}`}
              fill="none" stroke={color} strokeWidth={1.6} opacity={0.84} />
          </>
        )}
        {selected && <rect x={-half - 3} y={(sideSign < 0 ? -leaf - 4 : -6)} width={width + 6} height={leaf + 10} rx={1.5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
        {locked && (
          <path d="M-2 -3 V-4.5 C-2 -6 -1 -7 0 -7 C1 -7 2 -6 2 -4.5 V-3 M-3 -3 H3 V2 H-3 Z" fill="#0f172a" stroke="white" strokeWidth={0.6} />
        )}
      </>
    );
  }
  const rail = Math.max(wallThickness / 2 + 2, 4.5);
  return (
    <>
      <line data-testid="window-wall-cut" x1={-half} y1={0} x2={half} y2={0}
        stroke={background} strokeWidth={gapStroke} strokeLinecap="butt" />
      <rect x={-half} y={-rail} width={width} height={rail * 2} fill="rgba(125, 211, 252, 0.16)" stroke="none" />
      <line x1={-half} y1={-jamb} x2={-half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <line x1={half} y1={-jamb} x2={half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <line data-testid={hitId} x1={-half} y1={0} x2={half} y2={0} stroke="transparent" strokeWidth={28} strokeLinecap="butt" />
      <line data-testid="window-glazing" x1={-half} y1={-rail} x2={half} y2={-rail} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <line x1={-half} y1={rail} x2={half} y2={rail} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <line x1={0} y1={-rail - 2} x2={0} y2={rail + 2} stroke={color} strokeWidth={1.4} opacity={0.8} />
      <line x1={-half + 3} y1={0} x2={half - 3} y2={0} stroke="#e0f2fe" strokeWidth={1.1} opacity={0.9} />
      {selected && <rect x={-half - 3} y={-rail - 3} width={width + 6} height={rail * 2 + 6} rx={1.5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
      {locked && (
        <path d="M-2 -3 V-4.5 C-2 -6 -1 -7 0 -7 C1 -7 2 -6 2 -4.5 V-3 M-3 -3 H3 V2 H-3 Z" fill="#0f172a" stroke="white" strokeWidth={0.6} />
      )}
    </>
  );
}

function isManagedPerimeterWall(wall: FloorWall) {
  return wall.managedKind === "perimeter";
}

function openingSymbolTransform(geom: ReturnType<typeof resolveWallOpeningGeometry>) {
  if (!geom) return "";
  const visibleSide = isManagedPerimeterWall(geom.wall) ? " scale(1 -1)" : "";
  return `translate(${geom.x}, ${geom.y}) rotate(${geom.angle})${visibleSide}`;
}

function isUserLockedWall(wall: FloorWall | undefined) {
  return Boolean(wall?.locked && !isManagedPerimeterWall(wall));
}

function defaultSwingSideForWall(wall: FloorWall | undefined): "a" | "b" {
  return wall && isManagedPerimeterWall(wall) ? "b" : "a";
}

function effectiveDoorType(door: Pick<FloorDoor, "doorType" | "direction"> | undefined): "single" | "double" {
  return door?.doorType ?? (door?.direction === "double" ? "double" : "single");
}

function doorMinWidth(type: "single" | "double") {
  return type === "double" ? DOUBLE_DOOR_MIN_WIDTH : OPENING_MIN_WIDTH;
}

function doorMaxWidth(type: "single" | "double") {
  return type === "double" ? DOUBLE_DOOR_MAX_WIDTH : DOOR_MAX_WIDTH;
}

function doorDefaultWidth(type: "single" | "double") {
  return type === "double" ? DOUBLE_DOOR_DEFAULT_WIDTH : DOOR_DEFAULT_WIDTH;
}

function wallCanFitOpening(wall: FloorWall, minWidth: number) {
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  return length >= minWidth + wallOpeningSafetyUnits(minWidth, wall.thickness) * 2;
}

function clampDoorWidthForWall(wall: FloorWall, width: number, type: "single" | "double") {
  const minWidth = doorMinWidth(type);
  const maxWidth = maxOpeningWidthForWall(wall, doorMaxWidth(type), minWidth);
  return clamp(width, minWidth, maxWidth);
}

function perimeterWallId(floorId: string, side: PerimeterSide) {
  void floorId;
  void side;
  return genId("managed-perimeter");
}

function perimeterEndpoints(side: PerimeterSide, canvasW: number, canvasH: number) {
  if (side === "top") return { x1: 0, y1: 0, x2: canvasW, y2: 0 };
  if (side === "right") return { x1: canvasW, y1: 0, x2: canvasW, y2: canvasH };
  if (side === "bottom") return { x1: canvasW, y1: canvasH, x2: 0, y2: canvasH };
  return { x1: 0, y1: canvasH, x2: 0, y2: 0 };
}

function managedPerimeterWalls(
  floorId: string,
  canvasW: number,
  canvasH: number,
  settings: Pick<FloorSettingsDraft, "perimeterThickness" | "perimeterMaterial" | "perimeterColor">,
  existingWalls: FloorWall[]
) {
  return PERIMETER_SIDES.map((side, index) => {
    const existing = existingWalls.find((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === side);
    return {
      ...(existing ?? {}),
      id: existing?.id ?? perimeterWallId(floorId, side),
      ...perimeterEndpoints(side, canvasW, canvasH),
      thickness: settings.perimeterThickness,
      material: settings.perimeterMaterial,
      color: settings.perimeterColor,
      managedKind: "perimeter" as const,
      perimeterSide: side,
      layer: "structure",
      visible: existing?.visible ?? true,
      locked: true,
      zOrder: existing?.zOrder ?? -100 + index,
    };
  });
}

function isEditableShortcutTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : document.activeElement;
  if (!(element instanceof Element)) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.closest("[contenteditable='true']") != null;
}

function nearestPointOnSegment(point: { x: number; y: number }, wall: FloorWall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: wall.x1, y: wall.y1 };
  const t = clamp(((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lenSq, 0, 1);
  return { x: wall.x1 + t * dx, y: wall.y1 + t * dy };
}

type WallSnapTarget = {
  x: number;
  y: number;
  edge?: { x1: number; y1: number; x2: number; y2: number };
  roomAnchor?: FloorWallEndpointAnchor;
  /** Temporary straight-line assistance (independent of structural snapping). */
  guide?: "h" | "v";
};
type LayerAction = "bring-forward" | "send-backward" | "bring-front" | "send-back";

function visibleOpacity(item: { visible?: boolean }) {
  return item.visible === false ? 0.34 : 1;
}

function sortByZ<T extends { zOrder?: number; id: string }>(items: T[]) {
  return [...items].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0) || a.id.localeCompare(b.id));
}

function roomGuideSegments(room: FloorRoom) {
  return roomAnchorSegments(room);
}

function snapPointOnSegment(point: { x: number; y: number }, segment: { x1: number; y1: number; x2: number; y2: number }) {
  return nearestPointOnSegment(point, segment as FloorWall);
}

function segmentIntersectionPoint(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number }
) {
  const rX = a.x2 - a.x1;
  const rY = a.y2 - a.y1;
  const sX = b.x2 - b.x1;
  const sY = b.y2 - b.y1;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 0.0001) return null;
  const qpx = b.x1 - a.x1;
  const qpy = b.y1 - a.y1;
  const t = (qpx * sY - qpy * sX) / denom;
  const u = (qpx * rY - qpy * rX) / denom;
  if (t < -0.0001 || t > 1.0001 || u < -0.0001 || u > 1.0001) return null;
  return { x: a.x1 + t * rX, y: a.y1 + t * rY };
}

type FloorContextMenuState =
  | { x: number; y: number; type: FloorSelection["type"]; id: string }
  | { x: number; y: number; type: "group"; id?: undefined }
  | { x: number; y: number; type: "canvas"; id?: undefined };

function FloorFurnitureSymbol({ type, x, y, width, height, color, selected = false }: {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  selected?: boolean;
}) {
  const stroke = selected ? "var(--accent)" : "rgba(38,32,25,0.38)";
  const inset = Math.max(1, Math.min(width, height) * 0.1);
  const cx = x + width / 2;
  const cy = y + height / 2;
  const selStroke = selected ? 1.4 : 0.8;
  if (type.includes("chair")) {
    // Chair: rounded seat + a clear backrest band on the "top" side.
    return (
      <>
        <rect x={x + width * 0.18} y={y + height * 0.34} width={width * 0.64} height={height * 0.54} rx={Math.min(width, height) * 0.18} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.16} y={y + height * 0.12} width={width * 0.68} height={height * 0.24} rx={1.5} fill="rgba(255,255,255,0.3)" stroke={color} strokeWidth={0.8} />
      </>
    );
  }
  if (type.includes("sofa")) {
    // Sofa: rounded body with two armrest blocks and a seat-cushion divider.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.16} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.1} y={y + height * 0.16} width={width * 0.8} height={height * 0.66} rx={2} fill="rgba(255,255,255,0.18)" />
        <rect x={x + width * 0.03} y={y + height * 0.12} width={width * 0.09} height={height * 0.72} rx={1.5} fill="rgba(0,0,0,0.14)" />
        <rect x={x + width * 0.88} y={y + height * 0.12} width={width * 0.09} height={height * 0.72} rx={1.5} fill="rgba(0,0,0,0.14)" />
        <line x1={cx} y1={y + height * 0.18} x2={cx} y2={y + height * 0.78} stroke="rgba(255,255,255,0.32)" strokeWidth={1} />
      </>
    );
  }
  if (type.includes("bench")) {
    // Bench: long rounded seating structure with visible slats.
    const slats = Math.max(1, Math.min(4, Math.floor(width / 12)));
    return (
      <>
        <rect x={x} y={y + height * 0.16} width={width} height={height * 0.68} rx={height * 0.22} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {slats > 1 && Array.from({ length: slats - 1 }, (_, i) => (
          <line key={i} x1={x + (width / slats) * (i + 1)} y1={y + height * 0.18} x2={x + (width / slats) * (i + 1)} y2={y + height * 0.82} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
        ))}
      </>
    );
  }
  if (type.includes("computer")) {
    // Computer workstation: desk surface + monitor + keyboard.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.3} y={y + height * 0.1} width={width * 0.4} height={height * 0.3} rx={1} fill="#1f2937" />
        <rect x={x + width * 0.26} y={y + height * 0.5} width={width * 0.48} height={height * 0.14} rx={1} fill="#374151" />
        <line x1={cx} y1={y + height * 0.4} x2={cx} y2={y + height * 0.5} stroke="#1f2937" strokeWidth={1} />
      </>
    );
  }
  if (type.includes("table")) {
    // Table: rounded tabletop with a centre-leaf hint.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.14} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + inset} y={y + inset} width={Math.max(1, width - inset * 2)} height={Math.max(1, height - inset * 2)} rx={Math.min(width, height) * 0.1} fill="rgba(255,255,255,0.14)" />
        <line x1={cx} y1={y + inset} x2={cx} y2={y + height - inset} stroke="rgba(255,255,255,0.24)" strokeWidth={0.8} />
      </>
    );
  }
  if (type.includes("desk")) {
    // Desk: flat work surface with a darker back work-zone and keyboard band.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.06} y={y + height * 0.1} width={width * 0.88} height={height * 0.24} rx={1} fill="rgba(0,0,0,0.12)" />
        <rect x={x + width * 0.1} y={y + height * 0.46} width={width * 0.8} height={height * 0.12} rx={0.8} fill="rgba(255,255,255,0.26)" />
      </>
    );
  }
  if (type.includes("cabinet")) {
    // Cabinet: body with a door division and handle dots.
    const handleR = Math.max(0.7, Math.min(width, height) * 0.05);
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={cx} y1={y + inset} x2={cx} y2={y + height - inset} stroke="rgba(255,255,255,0.45)" strokeWidth={0.9} />
        <circle cx={cx - Math.min(width, height) * 0.16} cy={cy} r={handleR} fill="rgba(0,0,0,0.3)" />
        <circle cx={cx + Math.min(width, height) * 0.16} cy={cy} r={handleR} fill="rgba(0,0,0,0.3)" />
      </>
    );
  }
  if (type.includes("shelf") || type.includes("bookshelf")) {
    // Shelf: body with visible horizontal shelf divisions.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {[0.32, 0.58, 0.82].map((t) => (
          <line key={t} x1={x + inset * 0.7} y1={y + height * t} x2={x + width - inset * 0.7} y2={y + height * t} stroke="rgba(255,255,255,0.38)" strokeWidth={0.8} />
        ))}
      </>
    );
  }
  if (type.includes("plant")) {
    // Plant: planter pot + organic leaf clusters.
    const r = Math.min(width, height);
    return (
      <>
        <rect x={x + width * 0.14} y={y + height * 0.5} width={width * 0.72} height={height * 0.46} rx={r * 0.12} fill="#c2620a" stroke={stroke} strokeWidth={selStroke} />
        <circle cx={cx - width * 0.16} cy={cy - height * 0.12} r={r * 0.24} fill={color} opacity={0.94} />
        <circle cx={cx + width * 0.14} cy={cy - height * 0.2} r={r * 0.2} fill="#2f6f3e" opacity={0.94} />
        <circle cx={cx + width * 0.02} cy={cy - height * 0.36} r={r * 0.17} fill="#5f9360" opacity={0.94} />
      </>
    );
  }
  // Fallback — structured generic storage (never a bare rect, never a text box).
  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
      <line x1={x + inset} y1={y + inset} x2={x + width - inset} y2={y + height - inset} stroke="rgba(255,255,255,0.28)" strokeWidth={0.8} />
      <line x1={x + width - inset} y1={y + inset} x2={x + inset} y2={y + height - inset} stroke="rgba(255,255,255,0.28)" strokeWidth={0.8} />
    </>
  );
}

function FurniturePreview({ type, color }: { type: string; color: string }) {
  return (
    <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0" aria-hidden="true">
      <FloorFurnitureSymbol type={type} color={color} x={3} y={3} width={22} height={14} />
    </svg>
  );
}
function CirculationSelectionHandles({
  x, y, width, height, rotation = 0, handleSize, rotateOffset, testPrefix, onResize, onRotate,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  handleSize: number;
  rotateOffset: number;
  testPrefix: string;
  onResize: (e: React.MouseEvent, handle: string) => void;
  onRotate: (e: React.MouseEvent) => void;
}) {
  const hs = handleSize;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const handles = [
    { id: "n", x: x + width / 2 - hs / 2, y: y - hs / 2, cursor: "ns-resize" },
    { id: "s", x: x + width / 2 - hs / 2, y: y + height - hs / 2, cursor: "ns-resize" },
    { id: "e", x: x + width - hs / 2, y: y + height / 2 - hs / 2, cursor: "ew-resize" },
    { id: "w", x: x - hs / 2, y: y + height / 2 - hs / 2, cursor: "ew-resize" },
    { id: "nw", x: x - hs / 2, y: y - hs / 2, cursor: "nwse-resize" },
    { id: "ne", x: x + width - hs / 2, y: y - hs / 2, cursor: "nesw-resize" },
    { id: "sw", x: x - hs / 2, y: y + height - hs / 2, cursor: "nesw-resize" },
    { id: "se", x: x + width - hs / 2, y: y + height - hs / 2, cursor: "nwse-resize" },
  ];
  return (
    <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
      <rect data-testid={`${testPrefix}-selection-outline`} x={x - 2} y={y - 2} width={width + 4} height={height + 4} rx={1.5}
        fill="none" stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="3 2" />
      <line x1={x + width / 2} y1={y - 2} x2={x + width / 2} y2={y - rotateOffset + 2}
        stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 2" />
      <circle
        data-testid={`${testPrefix}-rotate-handle`}
        cx={x + width / 2}
        cy={y - rotateOffset}
        r={Math.max(3, hs * 0.72)}
        fill="white"
        stroke="var(--accent)"
        strokeWidth={1.4}
        style={{ cursor: "grab" }}
        onMouseDown={onRotate}
      />
      {handles.map((handle) => (
        <rect
          key={handle.id}
          data-testid={`${testPrefix}-resize-handle`}
          data-corner={handle.id}
          x={handle.x}
          y={handle.y}
          width={hs}
          height={hs}
          rx={Math.max(1, hs * 0.25)}
          fill="white"
          stroke="var(--accent)"
          strokeWidth={1.2}
          style={{ cursor: handle.cursor }}
          onMouseDown={(e) => onResize(e, handle.id)}
        />
      ))}
    </g>
  );
}

type StairVisualDirection = "up" | "down" | "both" | "none";

/**
 * Resolve the direction cue shown inside a Stair from the current, ordered
 * building floors.  The persisted Stair direction still controls routing on
 * middle floors; the boundary floors are clamped visually because they cannot
 * lead beyond the building. A one-floor building keeps a neutral cue for the
 * default Both direction; legacy explicit one-way values remain legible.
 */
function stairVisualDirection(
  direction: FloorStairs["direction"],
  floorIndex?: number,
  floorCount?: number,
): StairVisualDirection {
  if (floorIndex == null || floorCount == null || floorIndex < 0) return "none";
  // A single-floor building has no cross-floor implication, so keep the symbol
  // neutral regardless of any persisted direction value.
  if (floorCount <= 1) return "none";
  if (floorIndex === 0) return "up";
  if (floorIndex === floorCount - 1) return "down";
  return direction === "up" ? "up" : direction === "down" ? "down" : "both";
}

function stairArrowPath(direction: "up" | "down", size: number) {
  const y1 = direction === "up" ? size * 0.72 : -size * 0.72;
  const y2 = direction === "up" ? -size * 0.52 : size * 0.52;
  return `M 0 ${y1} L 0 ${y2}`;
}

function stairArrowHeadPath(direction: "up" | "down", size: number) {
  const tipY = direction === "up" ? -size * 0.86 : size * 0.86;
  const baseY = direction === "up" ? -size * 0.5 : size * 0.5;
  const halfWidth = size * 0.4;
  return `M 0 ${tipY} L ${-halfWidth} ${baseY} L ${halfWidth} ${baseY} Z`;
}

/**
 * Keep alignment assistance legible while preserving the underlying snap
 * calculation.  Resize matching can produce several edge/size guides for the
 * same axis; the canvas only needs the strongest guide in each orientation.
 */
function compactAlignmentGuides<T extends { type: "h" | "v"; pos: number }>(guides: T[]): T[] {
  const byAxis = new Map<T["type"], T>();
  for (const guide of guides) {
    if (!byAxis.has(guide.type)) byAxis.set(guide.type, guide);
  }
  return (["v", "h"] as const)
    .map((axis) => byAxis.get(axis))
    .filter((guide): guide is T => !!guide);
}

function LegacyStairsSymbol({
  item,
  selected,
  floorIndex,
  floorCount,
}: {
  item: FloorStairs;
  selected: boolean;
  floorIndex?: number;
  floorCount?: number;
}) {
  const stroke = selected ? "var(--accent)" : "#475569";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const inset = Math.max(2, Math.min(item.width, item.height) * 0.08);
  const wellX = item.x + inset;
  const wellY = item.y + inset;
  const wellWidth = Math.max(4, item.width - inset * 2);
  const wellHeight = Math.max(4, item.height - inset * 2);
  const landingHeight = Math.max(2.5, Math.min(6, wellHeight * 0.16));
  // B5 Phase 2.3: recognizable top-down straight stair — repeated tread lines
  // across the run plus a centered directional arrow. Everything is in the
  // object's local frame, so the parent rotate() keeps it aligned; the arrow
  // clearly communicates ascent (up) / descent (down) / transition (both).
  const treadCount = Math.max(3, Math.min(10, Math.floor(wellHeight / 5)));
  const dir = stairVisualDirection(item.direction, floorIndex, floorCount);
  return (
    <>
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={2.5}
        fill={selected ? "rgba(30,64,175,0.14)" : "#e8eef7"} stroke={stroke} strokeWidth={selected ? 1.8 : 1.15} />
      <rect data-testid="stairs-well" x={wellX} y={wellY} width={wellWidth} height={wellHeight} rx={1.5}
        fill={selected ? "rgba(255,255,255,0.72)" : "#f8fafc"} stroke="#94a3b8" strokeWidth={0.8} />
      <rect data-testid="stairs-landing" x={wellX + 0.8} y={wellY + 0.8} width={wellWidth - 1.6} height={landingHeight}
        rx={0.8} fill={selected ? "#dbeafe" : "#e2e8f0"} />
      <rect data-testid="stairs-landing" x={wellX + 0.8} y={wellY + wellHeight - landingHeight - 0.8} width={wellWidth - 1.6} height={landingHeight}
        rx={0.8} fill={selected ? "#dbeafe" : "#e2e8f0"} />
      {/* B5 Phase 2.4: subtle boundary guard rails inside the footprint edges —
          they follow the run axis and rotate with the object (local frame). */}
      <line data-testid="stairs-rail" x1={wellX + 1.2} y1={wellY + landingHeight + 1} x2={wellX + 1.2} y2={wellY + wellHeight - landingHeight - 1} stroke="#94a3b8" strokeWidth={0.8} opacity={0.8} />
      <line data-testid="stairs-rail" x1={wellX + wellWidth - 1.2} y1={wellY + landingHeight + 1} x2={wellX + wellWidth - 1.2} y2={wellY + wellHeight - landingHeight - 1} stroke="#94a3b8" strokeWidth={0.8} opacity={0.8} />
      {Array.from({ length: treadCount }, (_, i) => {
        const ty = wellY + (wellHeight / (treadCount + 1)) * (i + 1);
        return <line key={i} data-testid="stairs-tread" x1={wellX + 2} y1={ty} x2={wellX + wellWidth - 2} y2={ty} stroke="#64748b" strokeWidth={0.85} />;
      })}
      {/* Center dashed run line + directional arrow, both centered on the object. */}
      <line data-testid="stairs-center-line" x1={cx} y1={wellY + landingHeight + 2} x2={cx} y2={wellY + wellHeight - landingHeight - 2} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2 2" />
      <g data-testid="stairs-arrow" transform={`translate(${cx} ${cy})`}>
        {dir === "up" && (
          <path d="M 0 6 L 0 -6 M 0 -6 L -3.2 -1.6 M 0 -6 L 3.2 -1.6" fill="none" stroke="#334155" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {dir === "down" && (
          <path d="M 0 -6 L 0 6 M 0 6 L -3.2 1.6 M 0 6 L 3.2 1.6" fill="none" stroke="#334155" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {dir === "both" && (
          <path d="M 0 6 L 0 -6 M 0 -6 L -3.2 -1.6 M 0 -6 L 3.2 -1.6 M 0 6 L -3.2 1.6 M 0 6 L 3.2 1.6" fill="none" stroke="#334155" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {dir === "none" && (
          <path d="M -3.5 0 L 3.5 0" fill="none" stroke="#64748b" strokeWidth={1.15} strokeLinecap="round" />
        )}
      </g>
    </>
  );
}

function StairsSymbol({
  item,
  selected,
  floorIndex,
  floorCount,
}: {
  item: FloorStairs;
  selected: boolean;
  floorIndex?: number;
  floorCount?: number;
}) {
  const stroke = selected ? "var(--accent)" : "#475569";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const inset = Math.max(2, Math.min(item.width, item.height) * 0.08);
  const wellX = item.x + inset;
  const wellY = item.y + inset;
  const wellWidth = Math.max(4, item.width - inset * 2);
  const wellHeight = Math.max(4, item.height - inset * 2);
  // A conventional half-landing/U-shaped plan symbol. All geometry is in the
  // Stair's local frame; the existing parent rotate() carries it with the object.
  const landingHeight = Math.max(4, Math.min(12, wellHeight * 0.2));
  const flightGap = Math.max(2.5, Math.min(8, wellWidth * 0.1));
  const flightWidth = Math.max(4, (wellWidth - flightGap) / 2);
  const leftFlightX = wellX;
  const rightFlightX = wellX + flightWidth + flightGap;
  // Entry-side orientation is a horizontal mirror only.  The landing remains
  // at the same end of the local stairwell so Entry Right never reverses the
  // semantic Up/Down travel cue.
  const landingAtTop = true;
  const flightY = landingAtTop ? wellY + landingHeight : wellY;
  const flightHeight = Math.max(4, wellHeight - landingHeight);
  const landingY = landingAtTop ? wellY : wellY + wellHeight - landingHeight;
  const treadCount = Math.max(3, Math.min(10, Math.floor(flightHeight / 5)));
  const dir = stairVisualDirection(item.direction, floorIndex, floorCount);
  const entryFlightX = item.flip ? rightFlightX : leftFlightX;
  const continuationFlightX = item.flip ? leftFlightX : rightFlightX;
  const visualUp = "up" as const;
  const visualDown = "down" as const;
  // Keep the cue readable on the small default Stair while leaving the tread
  // pattern legible.  The shaft nearly spans the flight and terminates just
  // inside each landing/entry edge.
  const arrowLimit = Math.max(3.2, flightHeight / 2 - 1.1);
  const arrowSize = Math.min(9, Math.max(4, flightHeight * 0.28), arrowLimit);
  const arrowStrokeWidth = Math.max(1.05, Math.min(1.65, Math.min(flightWidth, flightHeight) * 0.1));
  const arrowY = flightY + flightHeight * 0.5;
  // A subtle continuous travel line follows the complete U-turn: it starts at
  // the floor-facing entry, crosses the landing, and returns along the second
  // flight.  The line is intentionally separate from the directional
  // arrowheads so the symbol reads as one stair path without changing the
  // semantic Up/Down state or the canonical navigation anchor.
  const travelEntryInset = Math.min(2.2, Math.max(0.8, flightHeight * 0.1));
  const travelEntryY = landingAtTop ? flightY + flightHeight - travelEntryInset : flightY + travelEntryInset;
  const travelTurnY = landingY + landingHeight / 2;
  const entryFlightCenterX = entryFlightX + flightWidth / 2;
  const continuationFlightCenterX = continuationFlightX + flightWidth / 2;
  const travelPathUpD = [
    `M ${entryFlightCenterX - cx} ${travelEntryY - cy}`,
    `L ${entryFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${continuationFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${continuationFlightCenterX - cx} ${travelEntryY - cy}`,
  ].join(" ");
  const travelPathDownD = [
    `M ${continuationFlightCenterX - cx} ${travelEntryY - cy}`,
    `L ${continuationFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${entryFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${entryFlightCenterX - cx} ${travelEntryY - cy}`,
  ].join(" ");
  const travelPathD = dir === "down" ? travelPathDownD : travelPathUpD;
  const renderArrow = (flightX: number, arrowDirection: "up" | "down") => (
    <g
      data-testid="stairs-arrow-flight"
      transform={`translate(${flightX + flightWidth / 2 - cx} ${arrowY - cy})`}
    >
      {/* A restrained light underlay keeps the cue legible over treads without
          making the arrow look like a heavy icon. */}
      <path
        d={stairArrowPath(arrowDirection, arrowSize)}
        fill="none"
        stroke="#f8fafc"
        strokeWidth={arrowStrokeWidth + 1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.86}
        className="pointer-events-none"
      />
      <path
        data-testid="stairs-arrow-path"
        d={stairArrowPath(arrowDirection, arrowSize)}
        fill="none"
        stroke="#0f172a"
        strokeWidth={arrowStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none"
      />
      <path
        data-testid="stairs-arrow-head"
        d={stairArrowHeadPath(arrowDirection, arrowSize)}
        fill="#0f172a"
        stroke="#0f172a"
        strokeWidth={0.3}
        strokeLinejoin="round"
        className="pointer-events-none"
      />
    </g>
  );
  return (
    <>
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={2.5}
        fill={selected ? "rgba(30,64,175,0.14)" : "#e8eef7"} stroke={stroke} strokeWidth={selected ? 1.8 : 1.15} />
      <rect data-testid="stairs-well" x={wellX} y={wellY} width={wellWidth} height={wellHeight} rx={1.5}
        fill={selected ? "rgba(255,255,255,0.72)" : "#f8fafc"} stroke="#94a3b8" strokeWidth={0.8} />
      <rect data-testid="stairs-landing" x={wellX + 0.8} y={landingY + 0.8} width={wellWidth - 1.6} height={Math.max(2, landingHeight - 1.6)}
        rx={0.8} fill={selected ? "#dbeafe" : "#e2e8f0"} />
      {[leftFlightX, rightFlightX].map((flightX) => (
        <g key={flightX} data-testid="stairs-flight">
          {/* Keep both stringers on the inner edges of the two flights.  Entry
              side mirrors the composition, but must not swap these rails to
              the outer edges and create a visually heavier Left variant. */}
          <line data-testid="stairs-rail" x1={flightX === leftFlightX ? flightX + flightWidth - 1 : flightX + 1} y1={flightY} x2={flightX === leftFlightX ? flightX + flightWidth - 1 : flightX + 1} y2={flightY + flightHeight} stroke="#64748b" strokeWidth={0.8} opacity={0.8} />
          {Array.from({ length: treadCount }, (_, i) => {
            const ty = flightY + (flightHeight / (treadCount + 1)) * (i + 1);
            return <line key={i} data-testid="stairs-tread" x1={flightX + 2} y1={ty} x2={flightX + flightWidth - 2} y2={ty} stroke="#64748b" strokeWidth={0.85} />;
          })}
        </g>
      ))}
      {/* The central opening/stringer gap makes the U-turn legible without a grate-like fill. */}
      <rect x={wellX + flightWidth} y={flightY} width={flightGap} height={flightHeight} fill={selected ? "rgba(226,232,240,0.65)" : "#eef2f7"} stroke="#cbd5e1" strokeWidth={0.55} />
      <line data-testid="stairs-center-line" x1={wellX + flightWidth + flightGap / 2} y1={flightY + 1} x2={wellX + flightWidth + flightGap / 2} y2={flightY + flightHeight - 1} stroke="#94a3b8" strokeWidth={0.65} strokeDasharray="2 2" />
      <g data-testid="stairs-arrow" transform={`translate(${cx} ${cy})`}>
        {dir !== "none" && (
          <>
            <path
              d={travelPathD}
              fill="none"
              stroke="#f8fafc"
              strokeWidth={arrowStrokeWidth + 2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
              className="pointer-events-none"
            />
            <path
              data-testid="stairs-travel-path"
              d={travelPathD}
              fill="none"
              stroke="#0f172a"
              strokeWidth={Math.max(0.9, arrowStrokeWidth * 0.72)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.72}
              className="pointer-events-none"
            />
          </>
        )}
        {dir === "up" && renderArrow(entryFlightX, visualUp)}
        {dir === "down" && renderArrow(continuationFlightX, visualDown)}
        {dir === "both" && <>{renderArrow(entryFlightX, visualUp)}{renderArrow(continuationFlightX, visualDown)}</>}
        {dir === "none" && (
          <path d="M -3.5 0 L 3.5 0" fill="none" stroke="#64748b" strokeWidth={1.15} strokeLinecap="round" />
        )}
      </g>
    </>
  );
}

function RampSymbol({ item, selected }: { item: FloorRamp; selected: boolean }) {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  // B5 Phase 2.6: accessibility-sign style — a deep-blue footprint with a LARGE
  // centered white wheelchair icon as the dominant visual, a clean border, and
  // only a tiny secondary direction cue tucked into the corner. Everything is
  // local-frame geometry, so rotation/resize keep the symbol centered.
  const dir = item.direction === "down" ? "down" : item.direction === "up" ? "up" : "both";
  const iconSize = Math.max(10, Math.min(item.width, item.height) * 0.68);
  const showCue = item.height >= 12 && item.width >= 12;
  return (
    <>
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={2}
        fill={selected ? "#1e40af" : "#2563eb"} stroke={selected ? "var(--accent)" : "#1e40af"}
        strokeWidth={selected ? 1.8 : 1.2} data-testid="ramp-blue-base" />
      {/* Large centered white accessibility icon — the ramp's primary visual. */}
      <g data-testid="ramp-accessibility-icon" transform={`translate(${cx} ${cy})`} className="pointer-events-none">
        <AccessibilityIcon size={iconSize} strokeWidth={1.6} color="#ffffff" x={-iconSize / 2} y={-iconSize / 2} />
      </g>
      {/* Tiny corner direction cue (up / down / both) — never competes with the
          dominant accessibility symbol. */}
      {showCue && (
        <g data-testid="ramp-direction-cue" transform={`translate(${item.x + item.width - 4} ${item.y + item.height - 4})`} opacity={0.95} className="pointer-events-none">
          {dir === "up" && (
            <path d="M 0 2.5 L 0 -2.5 M 0 -2.5 L -1.6 0 M 0 -2.5 L 1.6 0" fill="none" stroke="#dbeafe" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {dir === "down" && (
            <path d="M 0 -2.5 L 0 2.5 M 0 2.5 L -1.6 0 M 0 2.5 L 1.6 0" fill="none" stroke="#dbeafe" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {dir === "both" && (
            <path d="M 0 2.5 L 0 -2.5 M 0 -2.5 L -1.6 0 M 0 -2.5 L 1.6 0 M 0 2.5 L -1.6 0 M 0 2.5 L 1.6 0" fill="none" stroke="#dbeafe" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </g>
      )}
    </>
  );
}

function ElevatorSymbol({ item, selected }: { item: FloorElevatorItem; selected: boolean }) {
  const stroke = selected ? "var(--accent)" : "#15803d";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  // B5 Phase 2.3: recognizable top-down elevator — outer shaft frame, inner cab
  // rectangle, centered door opening, and SYMMETRIC up/down chevrons centered in
  // the cab. Everything is local-frame (rotates/resizes with the object); the
  // old chevron path was asymmetric and drifted off-center after resize.
  const cabW = Math.max(4, item.width - 8);
  const cabH = Math.max(4, item.height - 8);
  const doorW = Math.min(Math.max(4, item.doorWidth), cabW - 2);
  return (
    <>
      {/* Outer shaft / frame */}
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={1.5}
        fill={selected ? "rgba(22,163,74,0.14)" : "#f0fdf4"} stroke={stroke} strokeWidth={selected ? 1.8 : 1.1} data-testid="elevator-shaft" />
      {/* Inner cab */}
      <rect x={cx - cabW / 2} y={cy - cabH / 2} width={cabW} height={cabH} rx={1}
        fill="none" stroke="#86efac" strokeWidth={0.9} data-testid="elevator-cab" />
      {/* Centered door opening */}
      <rect x={cx - doorW / 2} y={item.y + item.height - 3.2} width={doorW} height={2.4} rx={0.5} fill="#22c55e" data-testid="elevator-door" />
      {/* B5 Phase 2.4: stacked vertical up/down chevrons (▲ over ▼) centered
          symmetrically inside the cab — scaled to the cab and rotation-safe. */}
      <g data-testid="elevator-chevrons" transform={`translate(${cx} ${cy})`}>
        <path d={`M ${-cabW * 0.2} ${-cabH * 0.12} L 0 ${-cabH * 0.3} L ${cabW * 0.2} ${-cabH * 0.12} M ${-cabW * 0.2} ${cabH * 0.12} L 0 ${cabH * 0.3} L ${cabW * 0.2} ${cabH * 0.12}`}
          fill="none" stroke="#14532d" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function FloorContextMenu({
  menu,
  state,
  onAction,
  onClose,
}: {
  menu: FloorContextMenuState;
  state: { locked: boolean; hidden: boolean };
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const objectActions = menu.type === "group"
    ? [
        { id: "properties", label: "Selected Objects", icon: Settings2 },
        { id: "bring-front", label: "Bring to Front", icon: Layers },
        { id: "send-back", label: "Send to Back", icon: Layers },
        { id: "toggle-visibility", label: state.hidden ? "Show Selected" : "Hide Selected", icon: state.hidden ? Eye : EyeOff },
        { id: "toggle-lock", label: state.locked ? "Unlock Selected" : "Lock Selected", icon: state.locked ? Unlock : Lock },
        { id: "duplicate", label: "Duplicate Selected", icon: Copy },
        { id: "delete", label: "Delete Selected", icon: TrashIcon, danger: true },
      ]
    : [
        { id: "properties", label: "Properties", icon: Settings2 },
        { id: "bring-front", label: "Bring to Front", icon: Layers },
        { id: "bring-forward", label: "Bring Forward", icon: Layers },
        { id: "send-backward", label: "Send Backward", icon: Layers },
        { id: "send-back", label: "Send to Back", icon: Layers },
        { id: "toggle-visibility", label: state.hidden ? "Show" : "Hide", icon: state.hidden ? Eye : EyeOff },
        { id: "toggle-lock", label: state.locked ? "Unlock" : "Lock", icon: state.locked ? Unlock : Lock },
        { id: "duplicate", label: "Duplicate", icon: Copy },
        { id: "delete", label: "Delete", icon: TrashIcon, danger: true },
      ];
  const canvasActions = [
    { id: "fit-floor", label: "Fit Floor", icon: Maximize2 },
    { id: "floor-settings", label: "Floor Settings", icon: PanelRightClose },
    { id: "toggle-grid", label: "Snap to Grid", icon: Grid3X3 },
  ];
  const openingActions = menu.type === "door"
    ? [
        { id: "flip-hinge", label: "Flip Hinge", icon: DoorOpen },
        { id: "flip-swing", label: "Flip Swing Side", icon: DoorOpen },
      ]
    : [];
  const actions = menu.type === "canvas" ? canvasActions : [...openingActions, ...objectActions];
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      className="fixed z-[160] min-w-40 rounded-xl border border-border bg-card p-1 shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      onMouseLeave={onClose}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
                  className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold transition-colors",
              action.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        );
      })}
    </motion.div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────

interface FloorEditorProps {
  campus: Campus;
  buildingId: string;
  floorId: string;
  onBack: () => void;
  /** Open an arbitrary Building/Floor directly for a calculated route origin. */
  onOpenFloor?: (buildingId: string, floorId: string) => void;
  /** Switch the visible floor, optionally selecting an authored object there. */
  onSwitchFloor: (floorId: string, initialSelection?: FloorSelection) => void;
  onUpdate: (c: Campus) => void;
  onSave?: (c: Campus) => Promise<Campus>;
  onPublish?: (c: Campus) => void;
  onPreviewStudent?: (c: Campus, isDirty: boolean) => void | Promise<void>;
  publishingEnabled?: boolean;
  // B5 Phase 3.1.4: the page's persisted campus snapshot (same value the outer
  // CampusEditor compares against). Deriving the STRUCTURE dirty from this
  // prop — instead of component state alone — survives the page re-mounting
  // FloorEditor when the floorId changes (Add Floor switches to the new tab).
  savedSnapshot?: string;
  initialSelection?: FloorSelection;
}

// ── Component ───────────────────────────────────────────────────────────────

/** Distance from a point to a segment (B5 Phase 2.6 — segment hover for Add Bend). */
function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Manual same-floor Walking Paths are the only edges eligible for the basic
 * duplicate-pair guard. Coordinate overlap is not connectivity. */
function isManualIndoorWalkingEdge(edge: NavigationEdge, nodes: NavigationNode[]): boolean {
  if ((edge.type !== "hallway" && edge.type !== "walkway") || edge.generatedFromPathIds?.length) return false;
  const a = nodes.find((node) => node.id === edge.startNodeId);
  const b = nodes.find((node) => node.id === edge.endNodeId);
  return !!a && !!b && ((!a.floorId && !b.floorId) || (!!a.floorId && !!b.floorId && a.floorId === b.floorId));
}

/** Return true only for an obvious duplicate of the proposed authored path.
 * Same endpoints alone are not enough: meaningful parallel paths (direction,
 * accessibility, emergency, closure, bends, or provenance) must remain. */
function isEquivalentManualIndoorWalkingEdge(
  edge: NavigationEdge,
  nodes: NavigationNode[],
  startId: string,
  endId: string,
  proposedBends: { x: number; y: number }[],
): boolean {
  if (!isManualIndoorWalkingEdge(edge, nodes)) return false;
  const forward = edge.startNodeId === startId && edge.endNodeId === endId;
  const reverse = edge.bidirectional !== false && edge.startNodeId === endId && edge.endNodeId === startId;
  if (!forward && !reverse) return false;
  const existingBends = normalizeBendPoints((edge.bendPoints ?? []).map((point) => ({ x: point.x, y: point.y })), 2);
  const orientedBends = reverse && !forward ? [...existingBends].reverse() : existingBends;
  const rounded = (points: { x: number; y: number }[]) => points.map((point) => [Math.round(point.x), Math.round(point.y)]);
  const coreSemantics = (candidate: NavigationEdge) => [
    candidate.bidirectional !== false,
    candidate.accessible ?? true,
    candidate.emergencySafe ?? true,
    candidate.closed ?? false,
    candidate.width ?? 4,
    candidate.inaccessibleReason ?? null,
    candidate.emergencyReason ?? null,
  ];
  const semantics = (candidate: NavigationEdge) => [
    ...coreSemantics(candidate),
    candidate.pathJunctionId ?? null,
    candidate.pathJunctionParent ?? false,
    [...(candidate.pathJunctionIds ?? [])].sort(),
  ];
  const proposedSemantics: NavigationEdge = {
    // Connect creates a normal manual hallway edge.  Do not copy the existing
    // edge's routing metadata into the proposal: accessibility, emergency,
    // closure, direction, bends, and junction provenance are what distinguish
    // meaningful parallel paths from an accidental duplicate.
    id: "proposed",
    type: "hallway",
    startNodeId: startId,
    endNodeId: endId,
    distance: 0,
    bidirectional: true,
    accessible: true,
    emergencySafe: true,
    closed: undefined,
    width: 4,
    color: "#16a34a",
    inaccessibleReason: undefined,
    pathJunctionId: undefined,
    pathJunctionParent: undefined,
    pathJunctionIds: undefined,
  };
  const sameGeometry = JSON.stringify(rounded(orientedBends)) === JSON.stringify(rounded(proposedBends));
  if (!sameGeometry) return false;
  if (JSON.stringify(semantics(edge)) === JSON.stringify(semantics(proposedSemantics))) return true;

  // A split corridor segment carries path-junction provenance on purpose. If
  // an admin explicitly reconnects to that same canonical junction, the new
  // authored connector has no provenance of its own but is still the same
  // logical edge. Suppress only this narrow case (the endpoint is a persisted
  // junction and the proposed edge is provenance-free); meaningful metadata
  // variants and unrelated parallel paths remain distinct.
  const proposedUsesJunction = nodes.some((node) =>
    (node.id === startId || node.id === endId) && node.pathJunction === true,
  );
  const proposedHasNoJunctionProvenance = !proposedSemantics.pathJunctionId
    && proposedSemantics.pathJunctionParent !== true
    && !(proposedSemantics.pathJunctionIds?.length);
  const existingHasJunctionProvenance = !!edge.pathJunctionId
    || edge.pathJunctionParent === true
    || !!edge.pathJunctionIds?.length;
  return proposedUsesJunction
    && proposedHasNoJunctionProvenance
    && existingHasJunctionProvenance
    && JSON.stringify(coreSemantics(edge)) === JSON.stringify(coreSemantics(proposedSemantics));
}

/** Rebuild an authored edge from its current endpoint positions while retaining
 * its authored bends and all routing metadata. This is geometry normalization
 * only: it never changes edge identity, direction, availability, or provenance. */
function rebuildEdgeGeometryFromCurrentNodes(
  edge: NavigationEdge,
  nodes: NavigationNode[],
  staleEndpointPositions: { x: number; y: number }[] = [],
): NavigationEdge {
  const points = edgePolylinePoints(edge, nodes);
  if (!points || points.length < 2) return edge;
  const start = points[0];
  const end = points[points.length - 1];
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 3) => Math.hypot(a.x - b.x, a.y - b.y) <= eps;
  const bends = normalizeBendPoints(points.slice(1, -1).filter((point) =>
    !near(point, start)
    && !near(point, end)
    && !staleEndpointPositions.some((old) => !near(old, start) && !near(old, end) && near(point, old))
  ));
  return {
    ...edge,
    bendPoints: bends.length > 0 ? bends : undefined,
    distance: navEdgePolylineDistance([start, ...bends, end]),
  };
}

function edgeIsParentForJunction(edge: NavigationEdge, junctionId: string): boolean {
  return edge.pathJunctionParent === true
    && (edge.pathJunctionId === junctionId || edge.pathJunctionIds?.includes(junctionId) === true);
}

/**
 * B5 Phase 3.1.3: deterministic identity key for a building's floor STRUCTURE
 * (floor ids, numbers, labels — order-sensitive). Add Floor / delete / reorder
 * / rename all change this key, which is what enables the Save button even
 * when the current floor's own content is untouched.
 */
function floorStructureKeyOf(floors: FloorPlan[] | undefined): string {
  return JSON.stringify((floors ?? []).map((f) => [f.id, f.number, f.label]));
}

function floorDirtyKeyOf(floor: FloorPlan, nodes: NavigationNode[], edges: NavigationEdge[]): string {
  return `${JSON.stringify(floor)}|${JSON.stringify([nodes, edges])}`;
}

/**
 * B5 Phase 2.10: ONE proposed pin geometry for a raw empty-space click during
 * an ACTIVE Connect — the SAME helper the live preview and the click handler
 * both call, so the shown geometry and the pinned geometry can never diverge.
 * Alignment-snapped (no-Shift, modest threshold) with guide feedback, but wall
 * validity ALWAYS wins: when the snapped shape is wall-blocked the geometry
 * falls back to the raw pointer. Every produced point is later point-validated
 * against wall obstacles by the caller.
 */
function navPinGeometryFor(
  rawPt: { x: number; y: number },
  last: { x: number; y: number },
  nodes: { x: number; y: number }[],
  walls: FloorWall[] | undefined,
  doors: FloorDoor[] | undefined,
  bounds: { width: number; height: number }
): { pins: { x: number; y: number }[]; snapped: boolean; guides: { type: "h" | "v"; pos: number }[] } {
  const align = navAlignSnap(rawPt, nodes, 8);
  const snapPt = { x: align.x, y: align.y };
  const cornerSnap = orthogonalBendsFor(last, snapPt, walls, doors, bounds);
  const pinsSnap = cornerSnap.length > 0 ? [...cornerSnap, snapPt] : [snapPt];
  if (align.x === rawPt.x && align.y === rawPt.y) {
    return { pins: pinsSnap, snapped: false, guides: [] };
  }
  if (!edgePolylineCrossesWallWithoutDoor([last, ...pinsSnap], walls, doors)) {
    return { pins: pinsSnap, snapped: true, guides: align.guides };
  }
  const corner = orthogonalBendsFor(last, rawPt, walls, doors, bounds);
  return {
    pins: corner.length > 0 ? [...corner, rawPt] : [rawPt],
    snapped: false,
    guides: [],
  };
}

// ── B5 Phase 6.2: Physical object navigation-only properties panel ──────
function PhysicalNavPropertiesPanel({
  physicalType, physicalId, rooms, doors, stairs, elevators, ramps, nodes, navEdges, onClose,
  onAdd, onRemove, onView,
}: {
  physicalType: "room" | "door" | "stairs" | "elevator" | "ramp";
  physicalId: string;
  rooms: FloorRoom[];
  doors: FloorDoor[];
  stairs: FloorStairs[];
  elevators: FloorElevatorItem[];
  ramps: FloorRamp[];
  nodes: NavigationNode[];
  navEdges: NavigationEdge[];
  onClose: () => void;
  /** B5 Phase 6.8: canonical graph actions shared with Design mode. */
  onAdd?: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onRemove?: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
  onView?: (type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => void;
}) {
  const iconMap: Record<string, React.ElementType> = {
    room: DoorOpen, door: DoorOpen, stairs: Waypoints, elevator: Waypoints, ramp: AccessibilityIcon,
  };
  const Icon = iconMap[physicalType] ?? DoorOpen;

  // Find the physical object
  const physical = physicalType === "room" ? rooms.find((r) => r.id === physicalId)
    : physicalType === "door" ? doors.find((d) => d.id === physicalId)
    : physicalType === "stairs" ? stairs.find((s) => s.id === physicalId)
    : physicalType === "elevator" ? elevators.find((e) => e.id === physicalId)
    : ramps.find((r) => r.id === physicalId);

  // Find linked navigation node
  const linkedNode = nodes.find((n) =>
    physicalType === "room" ? n.roomId === physicalId
    : physicalType === "door" ? n.doorId === physicalId
    : physicalType === "stairs" ? n.stairId === physicalId
    : physicalType === "elevator" ? n.elevatorId === physicalId
    : n.rampId === physicalId
  );

  const name = physicalType === "room" ? (physical as FloorRoom)?.name
    : physicalType === "door" ? (physical as FloorDoor)?.label ?? "Door"
    : physicalType === "stairs" ? (physical as FloorStairs)?.name
    : physicalType === "elevator" ? (physical as FloorElevatorItem)?.name
    : (physical as FloorRamp)?.name ?? "Ramp";

  // Count connections for the linked node
  const connCount = linkedNode ? navEdges.filter((e) =>
    e.startNodeId === linkedNode.id || e.endNodeId === linkedNode.id
  ).length : 0;

  return (
    <div data-testid="floor-nav-physical-props" className="w-60 shrink-0 border-l border-border bg-card/80 backdrop-blur flex flex-col">
      <div className="flex items-center justify-between px-3 h-9 border-b border-border">
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-blue-500" />
          {physicalType === "stairs" ? "Stair" : physicalType === "elevator" ? "Elevator" : physicalType === "ramp" ? "Ramp" : physicalType === "door" ? "Door" : "Room"}
        </span>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 space-y-3 text-[10px]">
        <div>
          <span className="font-semibold text-foreground">{name || "Unnamed"}</span>
          <span className="ml-1.5 text-muted-foreground">({physicalType})</span>
        </div>
        {/* B5 Phase 6.7/6.8: shared NavigationRelationshipCard — the SAME
            component + the SAME canonical graph actions as Design mode (only
            the View button label differs). */}
        <NavigationRelationshipCard
          linked={!!linkedNode}
          detail={linkedNode ? `Connected to navigation node "${linkedNode.name}"` : `Add ${physicalType} to the navigation network.`}
          mode="navigation"
          connectionCount={connCount}
          showView={false}
          onView={() => {
            if (onView) { onView(physicalType, physicalId); return; }
            setNavPhysicalSelected(null);
            setNavSelected({ type: "node", id: linkedNode!.id });
          }}
          onAdd={() => onAdd?.(physicalType, physicalId)}
          onRemove={() => onRemove?.(physicalType, physicalId)}
        />
        {physicalType === "stairs" && (
          <div className="pt-2 border-t border-border space-y-1.5">
            <span className="font-extrabold uppercase tracking-widest text-muted-foreground text-[9px]">Properties</span>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Accessible</span>
              <span className="font-semibold">No</span>
            </div>
          </div>
        )}
        {(physicalType === "elevator" || physicalType === "ramp") && (
          <div className="pt-2 border-t border-border space-y-1.5">
            <span className="font-extrabold uppercase tracking-widest text-muted-foreground text-[9px]">Properties</span>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Accessible</span>
              <span className="font-semibold">Yes</span>
            </div>
          </div>
        )}
        <p className="text-[9px] text-muted-foreground pt-2 border-t border-border">
          Physical editing is available in Design mode. This is Navigation mode — for routing relationships only.
        </p>
      </div>
    </div>
  );
}

function floorRouteArrowPoints(points: { x: number; y: number }[]) {
  const markers: { x: number; y: number; angle: number }[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 18) continue;
    const count = Math.max(1, Math.floor(length / 72));
    for (let j = 1; j <= count; j += 1) {
      const t = j / (count + 1);
      markers.push({ x: a.x + dx * t, y: a.y + dy * t, angle: Math.atan2(dy, dx) * 180 / Math.PI });
    }
  }
  return markers;
}

export function FloorEditor({ campus, buildingId, floorId, onBack, onOpenFloor, onSwitchFloor, onUpdate, onSave, onPublish, onPreviewStudent, publishingEnabled = false, savedSnapshot, initialSelection }: FloorEditorProps) {
  const building = campus.buildings.find((b) => b.id === buildingId);
  const rawFloor = building?.floors.find((f) => f.id === floorId);

  if (!building || !rawFloor) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="h-14 border-b border-border px-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-sm font-extrabold text-foreground">Floor unavailable</h2>
            <p className="text-xs text-muted-foreground">The selected floor could not be loaded. No floor data was changed.</p>
          </div>
        </div>
      </div>
    );
  }

  const floor = normalizeFloor(rawFloor, { buildingId });

  // ── Core state ──
  const testRouteSessionContext = useTestRouteSession();
  const routePreview = Boolean(testRouteSessionContext.session?.previewRoute && testRouteSessionContext.session?.result);
  const { navigationEnabled, setNavigationEnabled } = testRouteSessionContext;
  // B8 Phase 1: navMode is now true when the nav overlay is active AND a nav
  // tool is selected (or a nav object is selected). Physical tools always work.
  // Preview keeps the Navigation session enabled for routing, but presents the
  // editor as non-authoring: graph visuals and graph hit targets are suppressed.
  const [testNavOpen, setLocalTestNavOpen] = useState(testRouteSessionContext.open);
  const [localNavigationEnabled, setLocalNavigationEnabled] = useState(navigationEnabled || testNavOpen);
  const showNavOverlay = localNavigationEnabled || navigationEnabled || testNavOpen || routePreview;
  const setShowNavOverlay = useCallback((enabled: boolean) => {
    if (testNavOpen || routePreview) return;
    setLocalNavigationEnabled(enabled);
    setNavigationEnabled(enabled);
  }, [routePreview, setNavigationEnabled, testNavOpen]);
  useEffect(() => {
    setLocalNavigationEnabled(navigationEnabled || testNavOpen);
  }, [navigationEnabled, testNavOpen]);
  const navMode = showNavOverlay && !routePreview;
  const [navTool, setNavTool] = useState<"select" | "pan" | "waypoint" | "destination" | "connect" | "link" | "erase">("select");
  // B8: Test route panel toggle — explicit action, NOT auto-opened.
  const setTestNavOpen = useCallback((open: boolean) => {
    setLocalTestNavOpen(open);
    testRouteSessionContext.setOpen(open);
  }, [testRouteSessionContext.setOpen]);
  useEffect(() => {
    setLocalTestNavOpen(testRouteSessionContext.open);
  }, [testRouteSessionContext.open]);
  // Test Route reports its compact live-monitor presentation separately from
  // the inspector visibility.  Keeping this in the editor host lets the
  // floating panel animate its width without changing canvas coordinates.
  const [testRouteCompact, setTestRouteCompact] = useState(() => Boolean(
    testRouteSessionContext.session?.manualCollapsed
      || (testRouteSessionContext.session?.hasCalculatedRoute && !testRouteSessionContext.session.manualExpanded),
  ));
  // Elevator transitions switch floors directly.  The route marker itself is
  // the lightweight, hover/focus-readable cue; no blocking loading card is
  // needed for this admin-only editor action.
  const cancelElevatorTransition = useCallback(() => undefined, []);
  // B5 Phase 2.2: destructive-hover target for the Remove tool (node or edge).
  const [navEraseHover, setNavEraseHover] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [navSelected, setNavSelected] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  // B5 Phase 6.2: physical object selected in Navigation mode (read-only context)
  const [navPhysicalSelected, setNavPhysicalSelected] = useState<{ type: "room" | "door" | "stairs" | "elevator" | "ramp"; id: string } | null>(null);
  // B5 Phase 6.4: edge snap indicator for waypoint insertion in Floor Editor
  const [floorEdgeSnap, setFloorEdgeSnap] = useState<{ edgeId: string; nearest: { x: number; y: number } } | null>(null);
  const [navMultiSelected, setNavMultiSelected] = useState<string[]>([]);
  const [navDuplicateNodeId, setNavDuplicateNodeId] = useState<string | null>(null);
  const [navConnectStart, setNavConnectStart] = useState<string | null>(null);
  const [navPreview, setNavPreview] = useState<{ x: number; y: number } | null>(null);
  const [navTargetHover, setNavTargetHover] = useState<{
    kind: "room" | "door" | "stairs" | "elevator" | "ramp";
    id: string;
    x: number;
    y: number;
  } | null>(null);
  // B5 Phase 2.6: Connect-tool hover feedback — the node id under the pointer so
  // a valid routing target shows ONE clean target ring (stronger once a start
  // has been chosen). Cleared on leave/tool-switch/cancel.
  const [navNodeHover, setNavNodeHover] = useState<string | null>(null);
  // B5 Phase 2.6: bend editing — the specifically selected bend (Remove Bend /
  // Delete removes THAT bend, not just the last one) and the hovered segment of
  // the selected path (Add Bend splits the hovered segment, else the longest).
  const [navSelectedBend, setNavSelectedBend] = useState<{ edgeId: string; index: number } | null>(null);
  const [navSegmentHover, setNavSegmentHover] = useState<{ edgeId: string; index: number } | null>(null);
  // Connect-mode path targeting is a presentation-only state.  It records the
  // nearest segment and projected join point without touching the graph; the
  // click handler performs the authoritative split/reuse commit.
  const [navPathTargetHover, setNavPathTargetHover] = useState<{
    edgeId: string;
    index: number;
    point: { x: number; y: number };
  } | null>(null);
  // B5 Phase 2.7: multi-bend Connect — empty-space clicks PIN geometry bends on
  // ONE edge (never NavigationNodes) until a routing node finishes the edge.
  const [navConnectBends, setNavConnectBends] = useState<{ x: number; y: number }[]>([]);
  const [highlightedRoute, setHighlightedRoute] = useState<TestRouteHighlight | null>(null);
  // Route overlays belong to the page-level session.  Clear this editor's
  // derived overlay immediately when the session/result disappears so a
  // responsive host cannot leave a stale stroke behind after Clear or Close.
  useEffect(() => {
    if (!testNavOpen || !testRouteSessionContext.session?.result) setHighlightedRoute(null);
  }, [testNavOpen, testRouteSessionContext.session?.result]);
  // B5 Phase 2.9: per-click pin counts — ONE empty-space click pins the FULL
  // segment shape the preview showed (an L corner + the click point, or the
  // click point alone on a straight continuation), and temporary Ctrl+Z must
  // remove that whole last click in one step (never leave a stray corner).
  const navConnectBendGroupsRef = useRef<number[]>([]);
  const navGraphRef = useRef<{ nodes: NavigationNode[]; edges: NavigationEdge[] }>({ nodes: [], edges: [] });
  const [, setNavGraphVersion] = useState(0); // bump-only: recompute nav-derived UI
  // Free-waypoint group drag — linked nodes are excluded (derived geometry).
  // B5 correction: `origins` + `edgeOrigins` form the IMMUTABLE drag-start
  // snapshot (original node positions + original bendPoints of every INTERNAL
  // edge). Every mousemove applies the TOTAL world delta to these originals —
  // never to already-translated geometry — so the group tracks the cursor 1:1
  // and its exact shape is preserved (no frame compounding, no reshaping).
  const navDragRef = useRef<{
    ids: string[];
    origins: { id: string; x: number; y: number }[];
    edgeOrigins: Map<string, { x: number; y: number }[]>;
    sx: number;
    sy: number;
  } | null>(null);
  // B5 Phase 2.5: bend-handle drag on a selected segmented path (one history
  // action on release, same convention as node drags).
  const navBendDragRef = useRef<{ edgeId: string; index: number; ox: number; oy: number } | null>(null);
  // B5 Phase 2.7: orthogonal SEGMENT drag on a selected segmented path — dragging
  // a horizontal/vertical segment translates it perpendicular, keeping the
  // connector axis-aligned (one history action on release). B5 Phase 2.8: the
  // drag stores the IMMUTABLE drag-start snapshot (origPts/origBends) so each
  // pointermove computes geometry = snapshot + current delta — never compounding
  // on already-modified bends, never appending bends every frame.
  const navSegDragRef = useRef<{
    edgeId: string;
    segIndex: number;
    ox: number;
    oy: number;
    origBends: { x: number; y: number }[];
    origPts: { x: number; y: number }[];
    isHorizontal: boolean;
    isDiagonal?: boolean;
  } | null>(null);
  // B5 Phase 2.8: always-on alignment guides (outdoor-editor philosophy, no
  // Shift) — temporary h/v lines shown while a free node / bend drags near
  // another routing node's X or Y center. Cleared on release/cancel/tool-switch.
  const [navAlignGuides, setNavAlignGuides] = useState<{ type: "h" | "v"; pos: number }[]>([]);
  // B5 Phase 2.8: one-time wall warning per drag gesture (avoid toast spam).
  const navDragWallWarnedRef = useRef(false);
  // B7 Authoring: one-time room overlap warning per move gesture (avoid toast spam).
  const roomOverlapWarnedRef = useRef(false);
  // B7 QA: room alignment + same-size guide lines shown during move/resize.
  const [alignGuides, setAlignGuides] = useState<{
    type: "h" | "v";
    pos: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[]>([]);
  // B5 Phase 2.1: the design clipboard is transient but shared across
  // FloorEditor mounts so a copied object can be pasted on another floor.
  const [clipboard, setClipboard] = useState<FloorClipboard | null>(() => (
    floorObjectClipboard?.campusId === campus.id ? floorObjectClipboard : null
  ));
  const pasteOffsetRef = useRef(12);
  const navClipboardRef = useRef<{ nodes: NavigationNode[]; edges: NavigationEdge[] } | null>(null);
  const navPasteOffsetRef = useRef(12);
  const navLibraryDragRef = useRef<string | null>(null);
  const [navDragPreview, setNavDragPreview] = useState<{ x: number; y: number } | null>(null);
  // B5 Phase 2.3: not-allowed preview when dragging a free Waypoint/Destination
  // over a linked-location semantic target (Room center / Door / Stairs / …).
  const [navDragBlocked, setNavDragBlocked] = useState<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<SimpleTool>("select");
  const [selected, setSelected] = useState<FloorSelection | null>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  useEffect(() => {
    if (!routePreview) return;
    setNavTool("select");
    setRoomDrag(null);
    alignmentSnapLocksRef.current = { x: null, y: null };
    setNavAlignGuides([]);
    setAlignGuides([]);
    setNavTargetHover(null);
    setNavNodeHover(null);
    setNavSegmentHover(null);
    setNavSelectedBend(null);
    setNavSelected(null);
    setNavMultiSelected([]);
    setNavPhysicalSelected(null);
    setShowProperties(false);
    setTestRoutePickKind(null);
  }, [routePreview]);
  useEffect(() => {
    if (!initialSelection) return;
    // B5 Final: issue-locate selections — nav targets land in Navigation mode
    // (the node/edge is selected + its properties open); physical targets land
    // in Design mode with the object selected.
    if (initialSelection.type === "navNode" || initialSelection.type === "navEdge") {
      setSelected(null);
      setMultiSelected([]);
      setNavTool("select");
      setNavSelected({ type: initialSelection.type === "navNode" ? "node" : "edge", id: initialSelection.id });
      setShowProperties(true);
      if (!showNavOverlay) setShowNavOverlay(true);
    } else {
      setSelected(initialSelection);
      setMultiSelected([]);
      setShowProperties(true);
    }
  }, [initialSelection]);
  const [rubberBand, setRubberBand] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  // ── Drawing state ──
  const [wallStart, setWallStart] = useState<WallSnapTarget | null>(null);
  const [wallSnapIndicator, setWallSnapIndicator] = useState<WallSnapTarget | null>(null);
  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<FloorContextMenuState | null>(null);
  // ── Wall endpoint dragging ──
  const wallEndpointDrag = useRef<{ wallId: string; endpoint: "x1" | "x2"; origin: FloorWall } | null>(null);
  const openingDrag = useRef<{ type: "door" | "window"; id: string; wallId: string; origin: FloorDoor | FloorWindow } | null>(null);
  const openingResize = useRef<{ type: "door" | "window"; id: string; wallId: string; origin: FloorDoor | FloorWindow; handleSign: -1 | 1 } | null>(null);
  const [wallPreview, setWallPreview] = useState<{ x: number; y: number } | null>(null);
  const [openingPreview, setOpeningPreview] = useState<{ type: "door" | "window"; wallId: string; x: number; y: number; offset: number; width: number; angle: number } | null>(null);
  const [roomDrag, setRoomDrag] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  // Room↔Door authoring is a physical-location workflow, separate from the
  // generic navigation tools.  Keeping it explicit prevents accidental direct
  // Room→Walking Point edges and gives Escape a deterministic cancel path.
  const [roomDoorLinking, setRoomDoorLinking] = useState(false);
  const [roomDoorLinkMode, setRoomDoorLinkMode] = useState<"replace" | "add">("replace");
  const [roomDoorHoverId, setRoomDoorHoverId] = useState<string | null>(null);
  const [roomDoorInspectorHoverId, setRoomDoorInspectorHoverId] = useState<string | null>(null);
  const clearRoomDoorLinkState = useCallback(() => {
    setRoomDoorLinking(false);
    setRoomDoorLinkMode("replace");
    setRoomDoorHoverId(null);
    setRoomDoorInspectorHoverId(null);
  }, []);
  useEffect(() => {
    // Door-row highlights are transient inspector cues, never selection state.
    // Clear them whenever the selected physical object changes.
    setRoomDoorInspectorHoverId(null);
    setRoomDoorHoverId(null);
  }, [selected?.id, selected?.type]);
  useEffect(() => {
    if (roomDoorLinking && selected?.type !== "room") clearRoomDoorLinkState();
    if (!roomDoorLinking) setRoomDoorHoverId(null);
  }, [clearRoomDoorLinkState, roomDoorLinking, selected?.type]);
  const [testRoutePickKind, setTestRoutePickKind] = useState<"start" | "destination" | null>(null);
  const [testRouteMapPick, setTestRouteMapPick] = useState<{ kind: "start" | "destination"; value: string } | null>(null);
  const [testRoutePickHover, setTestRoutePickHover] = useState<{ type: string; id: string } | null>(null);
  useEffect(() => {
    if (testRoutePickKind) clearRoomDoorLinkState();
  }, [clearRoomDoorLinkState, testRoutePickKind]);
  // Keep the live route visible during an actual geometry drag.  A click may
  // still open Properties, but the first movement of a route-related object
  // closes that inspector so it cannot cover the canvas while the route is
  // being inspected.  The shared docking state then moves Test Route back to
  // the right immediately.
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  // ── Sidebar ──
  const [sidebarCategory, setSidebarCategory] = useState<string | null>(null);
  // Seed inspector visibility from issue/selection navigation so Test Route's
  // very first render uses the correct dock; it must not flash at the right
  // margin and then jump left after the initial-selection effect runs.
  const [showProperties, setShowProperties] = useState(() => Boolean(initialSelection));
  useEffect(() => {
    if (!showProperties) {
      if (roomDoorLinking) clearRoomDoorLinkState();
      setRoomDoorInspectorHoverId(null);
    }
  }, [clearRoomDoorLinkState, roomDoorLinking, showProperties]);
  // ── Furniture placement ──
  const [furnitureTemplate, setFurnitureTemplate] = useState<{ type: string; name: string; width: number; height: number; color: string } | null>(null);
  // ── Saving ──
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  // B5 Phase 3.1: Add Floor / floor switching with unsaved changes first asks
  // Save/Discard (SHARED unsaved-changes guard — see the useUnsavedChangesGuard
  // hook below) so the CURRENT floor's changes are persisted exactly once
  // BEFORE the new floor is created — a failed save never leaves a
  // partially-added duplicate floor behind.
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  // ── B5 Final: arrow-key nudge batching (groups rapid nudges into one undo step) ──
  const lastNudgeRef = useRef(0);
  const [showFloorSettings, setShowFloorSettings] = useState(false);
  const [floorMenu, setFloorMenu] = useState<{ floorId: string; x: number; y: number } | null>(null);
  const [floorSelectorOpen, setFloorSelectorOpen] = useState(false);
  const [floorSelectorSearch, setFloorSelectorSearch] = useState("");
  const floorSelectorButtonRef = useRef<HTMLButtonElement | null>(null);
  const floorSelectorPopoverRef = useRef<HTMLDivElement | null>(null);
  const [floorSelectorPosition, setFloorSelectorPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const floorActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const [floorRename, setFloorRename] = useState<{ floorId: string; currentLabel: string } | null>(null);
  const [floorRenameValue, setFloorRenameValue] = useState("");
  const [floorDeleteConfirm, setFloorDeleteConfirm] = useState<{ id: string; label: string } | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [calibrationDraft, setCalibrationDraft] = useState<{
    active: boolean;
    p1?: { x: number; y: number };
    p2?: { x: number; y: number };
    distanceInput: string;
  }>({ active: false, distanceInput: "" });
  const [measureDraft, setMeasureDraft] = useState<{
    start?: { x: number; y: number };
    end?: { x: number; y: number };
  }>({});
  const [inlineLabelEdit, setInlineLabelEdit] = useState<{ id: string; value: string; original: string } | null>(null);
  const skipNextInlineCommitRef = useRef(false);
  const inlineLabelBlurReadyRef = useRef(true);
  const lastLabelClickRef = useRef<{ id: string; at: number } | null>(null);

  const toast = useToast();
  const floorClipId = useMemo(() => `floor-clip-${floor.id.replace(/[^A-Za-z0-9_-]/g, "-")}`, [floor.id]);

  // ── Floor data ──
  const rooms = floor.rooms;
  const fpaths = floor.paths;
  const walls = floor.walls;
  const doors = floor.doors;
  const windows = floor.windows;
  const furniture = floor.furniture;
  const stairs = floor.stairs;
  const ramps = floor.ramps;
  const elevators = floor.elevators;
  const labels = floor.labels;
  const floorCanvas = normalizeFloorCanvasSize(floor.canvasW, floor.canvasH);
  const FP_W = floorCanvas.w;
  const FP_H = floorCanvas.h;
  const floorGridSize = floor.gridSize ?? 20;
  const floorBackground = floor.backgroundImage;
  const calibratedMetersPerUnit = floor.calibration?.metersPerUnit;
  const orderedRooms = useMemo(() => sortByZ(rooms), [rooms]);
  // B7 Part F: compute set of room IDs that overlap another room (for visual feedback).
  const overlappingRoomIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i]; const b = rooms[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) { ids.add(a.id); ids.add(b.id); }
      }
    }
    return ids;
  }, [rooms]);
  const orderedWalls = useMemo(() => sortByZ(walls), [walls]);
  const orderedDoors = useMemo(() => sortByZ(doors), [doors]);
  const orderedWindows = useMemo(() => sortByZ(windows), [windows]);
  const wallById = useMemo(() => new Map(walls.map((wall) => [wall.id, wall])), [walls]);
  const orderedFurniture = useMemo(() => sortByZ(furniture), [furniture]);
  const orderedStairs = useMemo(() => sortByZ(stairs), [stairs]);
  const orderedRamps = useMemo(() => sortByZ(ramps), [ramps]);
  const orderedElevators = useMemo(() => sortByZ(elevators), [elevators]);
  const orderedLabels = useMemo(() => sortByZ(labels), [labels]);
  const floorLayerStack = useMemo(() => [
    ...rooms.map((item) => ({ type: "room" as const, item, id: item.id })),
    ...walls.map((item) => ({ type: "wall" as const, item, id: item.id })),
    ...doors.map((item) => ({ type: "door" as const, item, id: item.id })),
    ...windows.map((item) => ({ type: "window" as const, item, id: item.id })),
    ...furniture.map((item) => ({ type: "furniture" as const, item, id: item.id })),
    ...stairs.map((item) => ({ type: "stairs" as const, item, id: item.id })),
    ...ramps.map((item) => ({ type: "ramp" as const, item, id: item.id })),
    ...elevators.map((item) => ({ type: "elevator" as const, item, id: item.id })),
    ...labels.map((item) => ({ type: "label" as const, item, id: item.id })),
  ].sort((a, b) => (a.item.zOrder ?? 0) - (b.item.zOrder ?? 0) || `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)), [doors, elevators, furniture, labels, ramps, rooms, stairs, walls, windows]);
  const allSelectableIds = useMemo(
    () => selectionIdsInRect(floor, { x: 0, y: 0, w: FP_W, h: FP_H }),
    [floor, FP_W, FP_H]
  );
  const wallJoints = useMemo(() => {
    const joints = new Map<string, {
      x: number; y: number; radius: number; color: string; casingColor: string;
      appearanceKey: string; count: number; managedCount: number;
    }>();
    for (const wall of walls) {
      for (const [point, other] of [
        [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }],
        [{ x: wall.x2, y: wall.y2 }, { x: wall.x1, y: wall.y1 }],
      ] as const) {
        const key = `${Math.round(point.x * 100) / 100},${Math.round(point.y * 100) / 100}`;
        const material = wallMaterialStyle(wall.material);
        const appearanceKey = `${wall.color}|${wall.material ?? "concrete"}|${wall.thickness}`;
        const existing = joints.get(key);
        const radius = Math.max(2, wall.thickness / 2 + 1);
        if (existing) {
          // Keep one deterministic compact joint style. The thickest incident
          // wall wins; equal-width styles retain stable first-seen ordering.
          if (existing.appearanceKey !== appearanceKey && radius > existing.radius) {
            existing.color = wall.color;
            existing.casingColor = material.casing;
            existing.appearanceKey = appearanceKey;
          }
          existing.radius = Math.max(existing.radius, radius);
          existing.count += 1;
          if (isManagedPerimeterWall(wall)) existing.managedCount += 1;
        } else {
          joints.set(key, {
            ...point,
            radius,
            color: wall.color,
            casingColor: material.casing,
            appearanceKey,
            count: 1,
            managedCount: isManagedPerimeterWall(wall) ? 1 : 0,
          });
        }
      }
    }
    // Endpoint-to-segment joins do not create a target Wall endpoint record.
    // Add the two half-segments of every Wall whose centerline contains the
    // shared point so T/cross/angled junctions receive the same N-way union
    // patch as endpoint-to-endpoint joins.
    for (const joint of joints.values()) {
      for (const wall of walls) {
        const ax = wall.x1;
        const ay = wall.y1;
        const bx = wall.x2;
        const by = wall.y2;
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.001) continue;
        const t = ((joint.x - ax) * dx + (joint.y - ay) * dy) / lenSq;
        if (t <= 0.01 || t >= 0.99) continue;
        const px = ax + t * dx;
        const py = ay + t * dy;
        if (Math.hypot(joint.x - px, joint.y - py) > 1.2) continue;
        const material = wallMaterialStyle(wall.material);
        const appearanceKey = `${wall.color}|${wall.material ?? "concrete"}|${wall.thickness}`;
        joint.count += 2;
        if (isManagedPerimeterWall(wall)) joint.managedCount += 2;
        if (joint.appearanceKey !== appearanceKey && wall.thickness / 2 + 1 > joint.radius) {
          joint.color = wall.color;
          joint.casingColor = material.casing;
          joint.appearanceKey = appearanceKey;
        }
        joint.radius = Math.max(joint.radius, wall.thickness / 2 + 1);
      }
    }
    return Array.from(joints.values()).filter((joint) => joint.count > 1 && joint.managedCount < joint.count);
  }, [walls]);

  // ── Canvas controls ──
  const { zoom, pan, panning, svgRef, containerRef, getPoint, startPan, movePan, endPan, zoomIn, zoomOut, zoomToFit, handleWheel } =
    useCanvasControls(FP_W, FP_H);
  const handleSizeFor = useCallback((w: number, h: number) => {
    const targetWorld = 6 / Math.max(zoom, 0.5);
    const relativeWorld = Math.max(2.5, Math.min(w, h) * 0.28);
    return clamp(Math.min(targetWorld, relativeWorld), 2.5, 7);
  }, [zoom]);
  const rotateHandleOffsetFor = useCallback((h: number) => Math.max(10, Math.min(18, h * 0.5)), []);
  const rotationFromPoint = useCallback((pt: { x: number; y: number }, cx: number, cy: number) => (
    Math.round((((Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI + 90 + 360) % 360) / 5) * 5
  ), []);

  // ── B5 Final: issue-locate focus flash state ──────────────────────────
  // The camera-focus effect itself lives BELOW (after indoorNodes/indoorEdges
  // and getSelectionItem are declared) to avoid TDZ on the dependency array.
  const [locateFlash, setLocateFlash] = useState<{ world: { x: number; y: number } } | null>(null);
  useEffect(() => {
    if (!locateFlash) return;
    // Keep a destination jump cue brief; the normal selection styling remains
    // after the transient highlight fades.
    const t = window.setTimeout(() => setLocateFlash(null), 900);
    return () => window.clearTimeout(t);
  }, [locateFlash]);
  const locateFocusedRef = useRef<string | null>(null);

  // Authoring quick-navigation for linked Stairs/Elevators. This is deliberately
  // separate from Test Route transition markers: it only helps an admin inspect
  // the same physical circulation object on another floor and never mutates the
  // graph or route session.
  const [quickNavOpenKey, setQuickNavOpenKey] = useState<string | null>(null);
  const quickNavCloseTimerRef = useRef<number | null>(null);
  const cancelQuickNavClose = useCallback(() => {
    if (quickNavCloseTimerRef.current !== null) {
      window.clearTimeout(quickNavCloseTimerRef.current);
      quickNavCloseTimerRef.current = null;
    }
  }, []);
  const closeQuickNav = useCallback(() => {
    cancelQuickNavClose();
    setQuickNavOpenKey(null);
  }, [cancelQuickNavClose]);
  const openQuickNav = useCallback((key: string) => {
    cancelQuickNavClose();
    setQuickNavOpenKey(key);
  }, [cancelQuickNavClose]);
  const scheduleQuickNavClose = useCallback(() => {
    cancelQuickNavClose();
    quickNavCloseTimerRef.current = window.setTimeout(() => {
      quickNavCloseTimerRef.current = null;
      setQuickNavOpenKey(null);
    }, 180);
  }, [cancelQuickNavClose]);
  useEffect(() => () => {
    cancelQuickNavClose();
  }, [cancelQuickNavClose]);
  useEffect(() => {
    if (!quickNavOpenKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeQuickNav();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeQuickNav, quickNavOpenKey]);
  const quickNavSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    const selectionKey = selected ? `${selected.type}:${selected.id}` : null;
    if (quickNavSelectionRef.current !== null && quickNavSelectionRef.current !== selectionKey) closeQuickNav();
    quickNavSelectionRef.current = selectionKey;
  }, [closeQuickNav, selected]);

  useEffect(() => {
    let cancelled = false;
    const path = floorBackground?.storagePath;
    if (!path) {
      setBackgroundPreviewUrl(null);
      return;
    }
    if (/^(blob:|data:|https?:\/\/)/.test(path)) {
      setBackgroundPreviewUrl(path);
      return;
    }
    floorPlanStorageService.signedUrl(path)
      .then((url) => { if (!cancelled) setBackgroundPreviewUrl(url); })
      .catch(() => { if (!cancelled) setBackgroundPreviewUrl(null); });
    return () => { cancelled = true; };
  }, [floorBackground?.storagePath]);

  // ── Data refs for drag operations ──
  const dragging = useRef<{ entries: { type: FloorSelection["type"]; id: string; origin: any }[]; sx: number; sy: number; fromBackground?: boolean } | null>(null);
  // Universal object dragging keeps one stable alignment target per axis for
  // the current gesture.  The target is resolved from the raw drag geometry,
  // never from the already-snapped display geometry.
  const alignmentSnapLocksRef = useRef<{ x: AlignmentAxisSnapLock | null; y: AlignmentAxisSnapLock | null }>({ x: null, y: null });
  const resizing = useRef<RoomResizeState | null>(null);
  // B7 QA: last-valid-geometry tracker for room resize — prevents invalid
  // geometry (overlap / out-of-bounds) from ever entering canonical state.
  const lastValidResizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  // B7 QA: last-used wall color for authoring — new walls default to this color.
  const lastWallStyleRef = useRef<{ color: string; thickness: number; material: string }>({ color: "#64748b", thickness: 4, material: "concrete" });
  const furnitureResizing = useRef<{ id: string; corner: string; sx: number; sy: number; origin: FloorFurniture } | null>(null);
  const circulationResizing = useRef<{ type: "stairs" | "ramp" | "elevator"; id: string; corner: string; sx: number; sy: number; origin: FloorStairs | FloorRamp | FloorElevatorItem } | null>(null);
  const rotating = useRef<{ type: "room" | "furniture" | "stairs" | "ramp" | "elevator"; id: string; cx: number; cy: number; originRotation: number; startAngle: number } | null>(null);
  const labelTransforming = useRef<{
    kind: "resize" | "rotate";
    id: string;
    origin: FloorLabel;
    center: { x: number; y: number };
    startDistance?: number;
    originRotation?: number;
    startAngle?: number;
  } | null>(null);
  const groupTransforming = useRef<{
    kind: "resize" | "rotate";
    handle?: string;
    sx: number;
    sy: number;
    originBounds: { x: number; y: number; w: number; h: number };
    entries: { type: FloorSelection["type"]; id: string; origin: any }[];
    center: { x: number; y: number };
    startAngle?: number;
  } | null>(null);
  // ── Gesture history: during a drag we suppress per-frame history pushes and
  //    commit exactly ONE undo entry (the POST-gesture state) on pointer release,
  //    so undo restores the pre-gesture state and redo re-applies the gesture. ──
  const suppressHistoryRef = useRef(false);
  const gestureMoved = useRef(false);

  // ── B5 Phase 2: floor-scoped indoor nav graph (single source of truth is the
  //    campus nav arrays, filtered to this building+floor). ──
  const indoorNodes = useMemo(
    () => indoorNavNodes(campus.navNodes, buildingId, floorId),
    [campus.navNodes, buildingId, floorId]
  );
  const indoorEdges = useMemo(
    () => indoorNavEdges(campus.navEdges, indoorNodes, buildingId, floorId),
    [campus.navEdges, indoorNodes, buildingId, floorId]
  );
  // Room↔Door edges are semantic destination relationships. They remain in
  // the canonical graph for routing, but are intentionally excluded from all
  // generic Walking Path authoring/rendering surfaces.
  const walkableIndoorEdges = useMemo(
    () => indoorEdges.filter((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE),
    [indoorEdges]
  );
  const marqueeIndoorEdges = useMemo(
    () => walkableIndoorEdges.filter((edge) => edge.type !== CROSS_FLOOR_EDGE_TYPE && !(edge.generatedFromPathIds?.length)),
    [walkableIndoorEdges]
  );
  // Only ordinary, hand-authored indoor paths may be split by the Walking
  // Point tool.  Semantic Room↔Door links, floor transitions, and generated
  // pathway geometry remain graph-owned and read-only.
  const editableIndoorEdges = useMemo(
    () => marqueeIndoorEdges,
    [marqueeIndoorEdges]
  );
  // Shared Canva/Figma-style alignment references for indoor navigation drags.
  // The graph nodes remain the connectivity authority; these physical anchors
  // are visual/snap references only. Stairs use their floor-facing entry edge;
  // other semantic objects use their established center/cue anchor.
  const indoorAlignmentReferences = useMemo(() => {
    // Prefer the canonical navigation anchor's coordinates whenever an object
    // is already linked.  Physical object centres are only a fallback for
    // unlinked objects; snapping a Walking Point to a Door therefore aligns to
    // the actual routing endpoint rather than an arbitrary rectangle centre.
    const linkedPoint = (kind: "door" | "room" | "stairs" | "ramp" | "elevator", id: string, fallback: { x: number; y: number }) => {
      const node = indoorNodes.find((candidate) => (
        kind === "door" ? candidate.doorId === id
          : kind === "room" ? candidate.roomId === id
            : kind === "stairs" ? candidate.stairId === id
              : kind === "ramp" ? candidate.rampId === id
                : candidate.elevatorId === id
      ));
      return node ? { x: node.x, y: node.y } : fallback;
    };
    return [
      ...indoorNodes.map((node) => ({ x: node.x, y: node.y, id: node.id })),
      ...doors.map((door) => ({ ...linkedPoint("door", door.id, { x: door.x, y: door.y }), id: indoorNodes.find((node) => node.doorId === door.id)?.id ?? `door:${door.id}` })),
      ...rooms.map((room) => ({ ...linkedPoint("room", room.id, { x: room.x + room.w / 2, y: room.y + room.h / 2 }), id: indoorNodes.find((node) => node.roomId === room.id)?.id ?? `room:${room.id}` })),
      ...stairs.map((item) => ({ ...linkedPoint("stairs", item.id, stairEntryPosition(item)), id: indoorNodes.find((node) => node.stairId === item.id)?.id ?? `stairs:${item.id}` })),
      ...ramps.map((item) => ({ ...linkedPoint("ramp", item.id, { x: item.x + item.width / 2, y: item.y + item.height / 2 }), id: indoorNodes.find((node) => node.rampId === item.id)?.id ?? `ramp:${item.id}` })),
      ...elevators.map((item) => ({ ...linkedPoint("elevator", item.id, elevatorEntryPosition(item)), id: indoorNodes.find((node) => node.elevatorId === item.id)?.id ?? `elevator:${item.id}` })),
    ];
  }, [doors, elevators, indoorNodes, ramps, rooms, stairs]);

  // A Door's physical movement is constrained to its wall. Align only along
  // the wall's free axis so the Door remains attached while its canonical nav
  // anchor can line up with any useful nearby navigation anchor (connected
  // anchors are preferred). This is visual/snap assistance only; graph
  // identity and edge creation remain unchanged.
  const alignDoorOnWallToConnectedPoint = useCallback((
    doorId: string,
    wall: FloorWall,
    point: { x: number; y: number },
  ): { point: { x: number; y: number }; guides: { type: "h" | "v"; pos: number }[] } => {
    const doorNode = indoorNodes.find((node) => node.doorId === doorId);
    if (!doorNode) return { point, guides: [] };
    const connectedIds = new Set<string>();
    for (const edge of indoorEdges) {
      if (edge.startNodeId === doorNode.id) connectedIds.add(edge.endNodeId);
      if (edge.endNodeId === doorNode.id) connectedIds.add(edge.startNodeId);
    }
    const wallDx = wall.x2 - wall.x1;
    const wallDy = wall.y2 - wall.y1;
    const horizontal = Math.abs(wallDx) >= Math.abs(wallDy);
    const lengthSq = wallDx * wallDx + wallDy * wallDy;
    if (lengthSq <= 0) return { point, guides: [] };
    const selfIds = new Set([doorNode.id, `door:${doorId}`]);
    const references = indoorAlignmentReferences.filter((reference) => {
      if (selfIds.has(reference.id)) return false;
      const value = horizontal ? reference.x : reference.y;
      const start = horizontal ? wall.x1 : wall.y1;
      const end = horizontal ? wall.x2 : wall.y2;
      const span = end - start;
      if (Math.abs(span) < 0.001) return false;
      const t = (value - start) / span;
      return Number.isFinite(t) && t >= 0 && t <= 1;
    });
    if (references.length === 0) return { point, guides: [] };

    // navAlignSnap supplies deterministic nearest candidates and gives
    // directly connected anchors priority. Keep the chosen axis locked against
    // the raw Door position for this drag so the displayed Door never feeds
    // back into a different candidate on the next pointer frame.
    const snapped = navAlignSnap(point, references, 8, connectedIds);
    const guideType = horizontal ? "v" : "h";
    const candidate = snapped.guides.find((guide) => guide.type === guideType);
    const candidateGuide: RoomAlignGuide | undefined = candidate
      ? horizontal
        ? { type: "v", pos: candidate.pos, x1: candidate.pos, y1: wall.y1, x2: candidate.pos, y2: wall.y2 }
        : { type: "h", pos: candidate.pos, x1: wall.x1, y1: candidate.pos, x2: wall.x2, y2: candidate.pos }
      : undefined;
    const rawAxis = horizontal ? point.x : point.y;
    const stable = resolveStableAlignmentAxis(
      rawAxis,
      candidate?.pos ?? rawAxis,
      candidateGuide,
      horizontal ? alignmentSnapLocksRef.current.x : alignmentSnapLocksRef.current.y,
    );
    if (horizontal) alignmentSnapLocksRef.current.x = stable.lock;
    else alignmentSnapLocksRef.current.y = stable.lock;
    if (!stable.snapped) return { point, guides: [] };
    const value = stable.position;
    const t = horizontal ? (value - wall.x1) / wallDx : (value - wall.y1) / wallDy;
    return {
      point: {
        x: Math.round(wall.x1 + wallDx * t),
        y: Math.round(wall.y1 + wallDy * t),
      },
      guides: [{ type: guideType, pos: value }],
    };
  }, [alignmentSnapLocksRef, indoorAlignmentReferences, indoorEdges, indoorNodes]);
  // B5 Phase 2.6: straightening the selected segmented path is blocked (button
  // disabled + guidance) when the direct A→B line would cross a wall without a
  // door opening — never silently create an invalid wall-crossing route.
  const straightenBlocked = (() => {
    if (navSelected?.type !== "edge") return false;
    const edge = indoorEdges.find((e) => e.id === navSelected.id);
    if (!edge || !edge.bendPoints || edge.bendPoints.length === 0) return false;
    const base = edgePolylinePoints(edge, indoorNodes);
    if (!base || base.length < 2) return false;
    return Boolean(edgePolylineCrossesWallWithoutDoor([base[0], base[base.length - 1]], walls, doors));
  })();

  // B5 Phase 2.8: does the hovered physical object already have its canonical
  // linked routing node? While CONNECT is active the routing node itself is the
  // target, so the yellow physical-object highlight must not compete with it.
  const navTargetHasLinkedNode = (() => {
    if (!navTargetHover) return false;
    return indoorNodes.some((n) => {
      if (navTargetHover.kind === "room" && n.roomId === navTargetHover.id) return true;
      if (navTargetHover.kind === "door" && n.doorId === navTargetHover.id) return true;
      if (navTargetHover.kind === "stairs" && n.stairId === navTargetHover.id) return true;
      if (navTargetHover.kind === "elevator" && n.elevatorId === navTargetHover.id) return true;
      if (navTargetHover.kind === "ramp" && n.rampId === navTargetHover.id) return true;
      return false;
    });
  })();

  // ── History (full floor state so undo/redo restores every element type) ──
  const floorSnapshot = (): FloorUndoEntry => floorUndoEntryFromFloor(floor);
  // Nav graph snapshot for history — same post-change convention as floorSnapshot.
  const navSnapshot = (): FloorUndoEntry => ({
    ...floorUndoEntryFromFloor(floor),
    navNodes: navGraphRef.current.nodes,
    navEdges: navGraphRef.current.edges,
  });
  // B5 Phase 2: the dirty key includes this floor's indoor nav graph so graph
  // edits enable the floor Save button exactly like physical-object edits do.
  const fullStateKey = floorDirtyKeyOf(floor, indoorNodes, indoorEdges);
  const baselineFloorRef = useRef<FloorPlan>(structuredClone(floor));
  const baselineEntryRef = useRef<FloorUndoEntry>(floorUndoEntryFromFloor(floor));
  const [baselineKey, setBaselineKey] = useState(fullStateKey);
  // B5 Phase 3.1.3: the building's floor STRUCTURE (floor list identity — ids,
  // numbers, labels, order) is a SEPARATE dirty dimension. `fullStateKey` only
  // covers the CURRENT floor's content, so Add Floor / Delete / reorder / rename
  // (which mutate the floors ARRAY, never this floor) would leave the Save
  // button disabled. The structure baseline is captured at mount and cleared
  // ONLY by a successful save — floor switches must NOT reset it, otherwise
  // switching onto the freshly-added floor would wipe the unsaved structure
  // change.
  const structureKey = useMemo(() => floorStructureKeyOf(building?.floors), [building?.floors]);
  const [structureBaselineKey, setStructureBaselineKey] = useState(structureKey);
  useEffect(() => {
    navGraphRef.current = { nodes: indoorNodes, edges: indoorEdges };
    setNavGraphVersion((v) => v + 1);
  }, [indoorNodes, indoorEdges, structureKey]);
  // B5 Phase 3.1.4: the page re-keys the floor view by floorId (viewKey =
  // `floor-${campusId}-${floorId}`), so switching to a freshly added floor
  // REMOUNTS FloorEditor and re-initializes the useState baseline above —
  // wiping the unsaved structure change (inner Save disabled while the outer
  // Save stayed enabled). When the page supplies its persisted snapshot
  // (survives remounts because it is a prop), derive the structure dirty from
  // it instead. Fall back to the state baseline when no snapshot is provided.
  const savedCampusForDirty = useMemo(() => {
    if (!savedSnapshot) return null;
    try {
      return JSON.parse(savedSnapshot) as Campus;
    } catch {
      return null;
    }
  }, [savedSnapshot, buildingId]);
  const savedStructureKey = useMemo(() => (
    savedCampusForDirty
      ? floorStructureKeyOf(savedCampusForDirty.buildings?.find((b) => b.id === buildingId)?.floors)
      : null
  ), [savedCampusForDirty, buildingId]);
  const savedFullStateKey = useMemo(() => {
    if (!savedCampusForDirty) return null;
    const savedFloor = savedCampusForDirty.buildings
      ?.find((b) => b.id === buildingId)
      ?.floors.find((f) => f.id === floorId);
    if (!savedFloor) return null;
    const normalizedSavedFloor = normalizeFloor(savedFloor, { buildingId });
    const savedNodes = indoorNavNodes(savedCampusForDirty.navNodes, buildingId, floorId);
    const savedEdges = indoorNavEdges(savedCampusForDirty.navEdges, savedNodes, buildingId, floorId);
    return floorDirtyKeyOf(normalizedSavedFloor, savedNodes, savedEdges);
  }, [savedCampusForDirty, buildingId, floorId]);
  const structureDirty = savedStructureKey !== null
    ? structureKey !== savedStructureKey
    : structureKey !== structureBaselineKey;
  const isFloorDirty = fullStateKey !== (savedFullStateKey ?? baselineKey) || structureDirty;
  const { pushHistory, undo, redo, resetHistory, canUndo, canRedo } = useFloorHistory(floorSnapshot());

  /** Merge floor-scoped nav back into the campus arrays (replace this floor's slice). */
  const mergeFloorNavIntoCampus = useCallback((nextNodes: NavigationNode[], nextEdges: NavigationEdge[]): Campus => {
    // A floor owns its single-floor edges: any old edge whose BOTH endpoints are
    // indoor nodes of THIS floor is replaced wholesale by nextEdges — so a
    // deleted edge is truly removed from campus data (no stale/dangling refs).
    // Edges with an outdoor endpoint (indoor↔outdoor entrance links) are NOT
    // floor-owned and are preserved untouched.
    const floorNodeIds = new Set(
      (campus.navNodes ?? [])
        .filter((n) => n.buildingId === buildingId && n.floorId === floorId)
        .map((n) => n.id)
    );
    const ownedByFloor = (e: NavigationEdge) =>
      floorNodeIds.has(e.startNodeId) && floorNodeIds.has(e.endNodeId);
    return {
      ...campus,
      navNodes: [
        ...(campus.navNodes ?? []).filter((n) => !(n.buildingId === buildingId && n.floorId === floorId)),
        ...nextNodes,
      ],
      navEdges: [
        ...(campus.navEdges ?? []).filter((e) => !ownedByFloor(e)),
        ...nextEdges,
      ],
    };
  }, [buildingId, campus, floorId]);

  /**
   * Commit a floor-scoped nav graph change: merge into campus, push ONE history
   * entry (nav rides inside the floor undo entry so Ctrl+Z restores it), and
   * rebuild the floor. Linked-node positions are re-synced against the CURRENT
   * floor geometry on every commit.
   */

  // B5 Phase 6.3: split an indoor nav edge by inserting a waypoint
  const splitIndoorNavEdge = useCallback((
    edge: NavigationEdge,
    waypoint: NavigationNode,
    allNodes: NavigationNode[],
    preferredSegmentIndex?: number,
  ): { newEdges: NavigationEdge[] } | null => {
    const nodeMap: Record<string, { x: number; y: number }> = Object.fromEntries(allNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const startNode = nodeMap[edge.startNodeId];
    const endNode = nodeMap[edge.endNodeId];
    if (!startNode || !endNode) return null;
    const allPoints = [
      { x: startNode.x, y: startNode.y },
      ...(edge.bendPoints ?? []),
      { x: endNode.x, y: endNode.y },
    ];
    const nearest = findNavEdgeAtPoint([edge], nodeMap, { x: waypoint.x, y: waypoint.y });
    const splitIdx = Number.isInteger(preferredSegmentIndex)
      && preferredSegmentIndex! >= 0
      && preferredSegmentIndex! < allPoints.length - 1
      ? preferredSegmentIndex!
      : nearest?.nearest.segIndex;
    if (splitIdx == null) return null;
    // `segIndex` identifies the segment between allPoints[index] and
    // allPoints[index + 1].  The inserted node must terminate the first edge;
    // omitting it leaves the original start-side geometry ending at the old
    // bend and produces a malformed/red diagonal after insertion.
    const beforePoints = [...allPoints.slice(0, splitIdx + 1), { x: waypoint.x, y: waypoint.y }];
    const afterPoints = [{ x: waypoint.x, y: waypoint.y }, ...allPoints.slice(splitIdx + 1)];
    const edgeBendBefore = beforePoints.length > 2 ? beforePoints.slice(1, -1) : [];
    const edgeBendAfter = afterPoints.length > 2 ? afterPoints.slice(1, -1) : [];
    const distBefore = navEdgePolylineDistance(beforePoints);
    const distAfter = navEdgePolylineDistance(afterPoints);
    const inheritedJunctionIds = [
      ...(edge.pathJunctionIds ?? []),
      ...(edge.pathJunctionId ? [edge.pathJunctionId] : []),
      waypoint.id,
    ].filter((id, index, all) => all.indexOf(id) === index);
    const edgeBefore: NavigationEdge = {
      ...edge, id: genId("ne"), startNodeId: edge.startNodeId, endNodeId: waypoint.id,
      bendPoints: edgeBendBefore, distance: distBefore,
      pathJunctionId: waypoint.id,
      pathJunctionParent: true,
      pathJunctionIds: inheritedJunctionIds,
    };
    const edgeAfter: NavigationEdge = {
      ...edge, id: genId("ne"), startNodeId: waypoint.id, endNodeId: edge.endNodeId,
      bendPoints: edgeBendAfter, distance: distAfter,
      pathJunctionId: waypoint.id,
      pathJunctionParent: true,
      pathJunctionIds: inheritedJunctionIds,
    };
    return { newEdges: [edgeBefore, edgeAfter] };
  }, []);

  const commitNavGraph = useCallback((
    nextNodes: NavigationNode[],
    nextEdges: NavigationEdge[],
    options?: { splitNodeIds?: Set<string> },
  ) => {
    const syncedNodes = syncIndoorLinkedNodePositions(nextNodes, {
      rooms, doors, stairs, ramps, elevators,
    });
    const roomDoorEdges = reconcileRoomDoorEdges(syncedNodes, nextEdges, rooms, doors, walls);
    const pruned = pruneOrphanedIndoorNodes(syncedNodes, roomDoorEdges, {
      rooms, doors, stairs, ramps, elevators,
    });
    // B5 Phase 2.5: segmented edges report their CURRENT total polyline length
    // (start → bends → end) so distance stays accurate after node/bend edits.
    const finalEdges = normalizeNavigationEdges(pruned.edges.map((e) => {
      if (!e.bendPoints || e.bendPoints.length === 0) return e;
      const pts = edgePolylinePoints(e, pruned.nodes);
      if (!pts) return e;
      const dist = navEdgePolylineDistance(pts);
      return dist === e.distance ? e : { ...e, distance: dist };
    }), pruned.nodes, 2, options);
    const merged = mergeFloorNavIntoCampus(pruned.nodes, finalEdges);
    // B5 Phase 3: reconcile the building's cross-floor transition edges against
    // the CURRENT linked circulation nodes — fully derived + idempotent, so a
    // node created on another floor (or deleted here) automatically establishes
    // / removes its transitions with NO manual cross-floor line drawing.
    const reconciledEdges = reconcileCrossFloorTransitions(
      merged.navNodes, merged.navEdges,
      (merged.buildings ?? []).find((b) => b.id === buildingId)?.floors,
      buildingId
    );
    const reconciled: Campus = reconcileEntranceTransitions({ ...merged, navEdges: reconciledEdges });
    navGraphRef.current = { nodes: pruned.nodes, edges: finalEdges };
    setNavGraphVersion((v) => v + 1);
    // Per-frame drag updates are suppressed; the gesture commits ONE history
    // entry on mouse-up (same convention as the architectural floor drag).
    if (!suppressHistoryRef.current) {
      pushHistory({
        ...floorUndoEntryFromFloor(floor),
        navNodes: pruned.nodes,
        navEdges: finalEdges,
      });
    }
    onUpdate(reconciled);
  }, [buildingId, doors, elevators, floor, mergeFloorNavIntoCampus, onUpdate, pushHistory, ramps, rooms, stairs, walls]);

  const clearTransientEditorState = useCallback(() => {
    setSelected(null);
    setMultiSelected([]);
    setRubberBand(null);
    setWallStart(null);
    setWallSnapIndicator(null);
    setWallPreview(null);
    setRoomDrag(null);
    alignmentSnapLocksRef.current = { x: null, y: null };
    clearRoomDoorLinkState();
    setDP([]);
    setContextMenu(null);
    setShowProperties(false);
    setInlineLabelEdit(null);
    setFloorMenu(null);
    wallEndpointDrag.current = null;
    dragging.current = null;
    resizing.current = null;
    furnitureResizing.current = null;
    circulationResizing.current = null;
    rotating.current = null;
    labelTransforming.current = null;
    groupTransforming.current = null;
    suppressHistoryRef.current = false;
    gestureMoved.current = false;
  }, [clearRoomDoorLinkState]);

  useEffect(() => {
    baselineFloorRef.current = structuredClone(floor);
    const entry: FloorUndoEntry = {
      ...floorUndoEntryFromFloor(floor),
      navNodes: indoorNodes,
      navEdges: indoorEdges,
    };
    baselineEntryRef.current = structuredClone(entry);
    setBaselineKey(fullStateKey);
    resetHistory(entry);
    // B5 Final: when arriving via an issue-locate initialSelection, preserve
    // the selection/properties state set by the initialSelection effect
    // instead of wiping it (the transient clear still runs for floor
    // switches, where initialSelection is undefined).
    if (!initialSelection) clearTransientEditorState();
  }, [floorId]);

  const buildFloorUpdates = useCallback(
    (updates: Partial<FloorPlan> & FloorNavGraphState, buildingUpdates?: Partial<Campus["buildings"][number]>) => {
      // B5 Phase 2: after a physical-object edit, re-sync + prune the indoor nav
      // graph against the NEW floor geometry so linked nodes follow their owner
      // (and orphans never linger) in the SAME campus update — no extra history.
      const nextRooms = updates.rooms ?? rooms;
      const nextWalls = updates.walls ?? walls;
      const nextDoors = updates.doors ?? doors;
      const synced = syncIndoorLinkedNodePositions(updates.navNodes ?? indoorNodes, {
        rooms: nextRooms,
        doors: nextDoors,
        stairs: updates.stairs ?? stairs,
        ramps: updates.ramps ?? ramps,
        elevators: updates.elevators ?? elevators,
      });
      const roomDoorEdges = reconcileRoomDoorEdges(synced, updates.navEdges ?? indoorEdges, nextRooms, nextDoors, nextWalls);
      const pruned = pruneOrphanedIndoorNodes(synced, roomDoorEdges, {
        rooms: nextRooms,
        doors: nextDoors,
        stairs: updates.stairs ?? stairs,
        ramps: updates.ramps ?? ramps,
        elevators: updates.elevators ?? elevators,
      });
      const floorNav = { navNodes: pruned.nodes, navEdges: pruned.edges };
      const mergedCampus = mergeFloorNavIntoCampus(floorNav.navNodes, floorNav.navEdges);
      // B5 Phase 3: reconcile cross-floor transitions on EVERY campus write —
      // physical-object edits (sharedId changes, deletion), Link Location node
      // creation and undo/redo restore all flow through here.
      const reconciledEdges = reconcileCrossFloorTransitions(
        mergedCampus.navNodes, mergedCampus.navEdges,
        (mergedCampus.buildings ?? []).find((b) => b.id === buildingId)?.floors,
        buildingId
      );
      const updatedCampus: Campus = { ...mergedCampus, navEdges: reconciledEdges };
      // The nav graph lives on the CAMPUS arrays, never inside the FloorPlan —
      // strip those keys before merging into the floor object so normalizeFloor
      // (which spreads its input) can't leak navNodes/navEdges into the floor
      // and break the JSON dirty comparison against the saved baseline.
      const { navNodes: _navNodes, navEdges: _navEdges, ...floorUpdates } = updates;
      updatedCampus.buildings = updatedCampus.buildings.map((b) =>
        b.id === buildingId
          ? {
              ...b,
              ...buildingUpdates,
              floors: b.floors.map((f) =>
                f.id === floorId
                  ? normalizeFloor({ ...f, ...floorUpdates }, { buildingId: b.id })
                  : normalizeFloor(f, { buildingId: b.id })
              ),
            }
          : b
      );
      updatedCampus.navEdges = reconcileCrossFloorTransitions(
        updatedCampus.navNodes, updatedCampus.navEdges,
        (updatedCampus.buildings ?? []).find((b) => b.id === buildingId)?.floors,
        buildingId
      );
      onUpdate(updatedCampus);
      return updatedCampus;
    },
    [campus, buildingId, floorId, indoorEdges, indoorNodes, mergeFloorNavIntoCampus, onUpdate, rooms, doors, stairs, ramps, elevators, walls]
  );

  const updFloor = useCallback(
    (newRooms: FloorRoom[], newPaths: FloorPath[], newWalls?: FloorWall[], newDoors?: FloorDoor[], newWindows?: FloorWindow[],
     newFurniture?: FloorFurniture[], newStairs?: FloorStairs[], newElevators?: FloorElevatorItem[], newLabels?: FloorLabel[], newRamps?: FloorRamp[]) => {
      const nextWalls = newWalls ?? walls;
      const syncedOpenings = syncOpeningsToWalls(newDoors ?? doors, newWindows ?? windows, nextWalls);
      const next: FloorUndoEntry = {
        canvasW: floor.canvasW,
        canvasH: floor.canvasH,
        backgroundColor: floor.backgroundColor,
        showGrid: floor.showGrid,
        gridSize: floor.gridSize,
        backgroundImage: floor.backgroundImage,
        calibration: floor.calibration,
        label: floor.label,
        rooms: newRooms, paths: newPaths,
        walls: nextWalls, doors: syncedOpenings.doors,
        windows: syncedOpenings.windows, furniture: newFurniture ?? furniture,
        stairs: newStairs ?? stairs, elevators: newElevators ?? elevators, labels: newLabels ?? labels,
        ramps: newRamps ?? ramps,
        // B5 Phase 2: physical-object edits carry the re-synced nav snapshot so
        // undo/redo restores linked-node positions together with their owners.
        navNodes: syncIndoorLinkedNodePositions(indoorNodes, {
          rooms: newRooms, doors: syncedOpenings.doors,
          stairs: newStairs ?? stairs, ramps: newRamps ?? ramps, elevators: newElevators ?? elevators,
        }),
        navEdges: reconcileRoomDoorEdges(
          indoorNodes,
          indoorEdges,
          newRooms,
          syncedOpenings.doors,
          nextWalls,
        ),
      };
      // Record the POST-change state as the new history tip (unless we are in the
      // middle of a drag gesture — that commit happens once on pointer release).
      if (!suppressHistoryRef.current) pushHistory(next);
      buildFloorUpdates(next);
    },
    [buildFloorUpdates, floor.canvasW, floor.canvasH, floor.backgroundColor, floor.showGrid, floor.gridSize, floor.backgroundImage, floor.calibration, floor.label, walls, doors, windows, furniture, stairs, ramps, elevators, labels, pushHistory, indoorNodes, indoorEdges]
  );

  const updateCirculationGroupMetadata = useCallback((groups: NonNullable<Campus["buildings"][number]["circulationGroups"]>) => {
    pushHistory(floorUndoEntryFromFloor(floor));
    const floorsForBuilding = (campus.buildings ?? []).find((b) => b.id === buildingId)?.floors ?? [];
    const nextCampus = replaceBuildingFloorsAndReconcileTransitions({
      ...campus,
      buildings: campus.buildings.map((b) => b.id === buildingId ? { ...b, circulationGroups: groups } : b),
    }, buildingId, floorsForBuilding);
    onUpdate(nextCampus);
  }, [buildingId, campus, floor, onUpdate, pushHistory]);

  const ensureCirculationGroupName = useCallback((type: "stairs" | "elevator", sharedId: string, fallbackName: string) => {
    const kind = type === "stairs" ? "stair" : "elevator";
    const groups = building?.circulationGroups ?? [];
    if (groups.some((g) => g.id === sharedId && g.kind === kind)) return groups;
    return [...groups, { id: sharedId, buildingId, kind, name: fallbackName }];
  }, [building?.circulationGroups, buildingId]);

  const assignCirculationGroup = useCallback((type: "stairs" | "elevator", objectId: string, sharedId: string | undefined) => {
    if (sharedId) {
      const duplicate = (building?.floors ?? []).some((f) => {
        const items = type === "stairs" ? (f.stairs ?? []) : (f.elevators ?? []);
        return items.some((item) => item.id !== objectId && item.sharedId === sharedId && f.id === floorId);
      });
      if (duplicate) {
        toast.warning(
          type === "stairs" ? "Stair continuation already used" : "Elevator already used",
          `${type === "stairs" ? "This Stair continuation" : "This elevator shaft"} is already assigned to another ${type === "stairs" ? "Stair" : "elevator"} on this Floor.`
        );
        return;
      }
    }
    if (type === "stairs") buildFloorUpdates({ stairs: stairs.map((s) => s.id === objectId ? { ...s, sharedId } : s) });
    else buildFloorUpdates({ elevators: elevators.map((e) => e.id === objectId ? { ...e, sharedId } : e) });
  }, [building?.floors, buildFloorUpdates, elevators, floorId, stairs, toast]);

  /**
   * Connect exactly one Stair occurrence to exactly one target occurrence.
   * The persisted sharedId remains the canonical chain identity; the target
   * object id is used only to prevent a same-floor Stair from being treated as
   * an interchangeable member of the chain.
   */
  const changeStairConnection = useCallback((stairId: string, targetFloorId: string, targetStairId: string) => {
    const floors = (building?.floors ?? []).map((candidateFloor) => ({
      ...candidateFloor,
      stairs: [...(candidateFloor.stairs ?? [])],
    }));
    const sourceFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === floorId);
    const targetFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === targetFloorId);
    const sourceFloor = floors[sourceFloorIndex];
    const targetFloor = floors[targetFloorIndex];
    const source = sourceFloor?.stairs?.find((stair) => stair.id === stairId);
    const target = targetFloor?.stairs?.find((stair) => stair.id === targetStairId);
    if (!source || !target || sourceFloorIndex < 0 || targetFloorIndex < 0 || sourceFloorIndex === targetFloorIndex) return;
    // Stair continuations remain the existing adjacent-floor model even when
    // a caller supplies an exact target occurrence.
    if (Math.abs(targetFloorIndex - sourceFloorIndex) !== 1) return;
    if (!stairContinuationDirectionAllows(source.direction ?? "both", sourceFloorIndex, targetFloorIndex)) {
      toast.warning("Stair direction blocks this connection", "Change the Stair direction before choosing this Floor.");
      return;
    }
    // Preserve the selected Stair's established chain when adding a second
    // adjacent link.  Each occurrence starts with its own generated identity,
    // so the target may have a different provisional chain; joining it must
    // never replace the source's opposite-side relationship.
    const sourceSharedId = source.sharedId ?? target.sharedId ?? `shared_stair_${buildingId}_${genId("chain")}`;
    const targetSharedId = target.sharedId;
    const sourceChainHasTargetFloor = (building?.floors ?? []).some((candidateFloor) => candidateFloor.id === targetFloorId
      && (candidateFloor.stairs ?? []).some((stair) => stair.id !== targetStairId && stair.sharedId === sourceSharedId));
    const targetChainHasSourceFloor = !!targetSharedId && targetSharedId !== sourceSharedId
      && (building?.floors ?? []).some((candidateFloor) => candidateFloor.id === floorId
        && (candidateFloor.stairs ?? []).some((stair) => stair.id !== stairId && stair.sharedId === targetSharedId));
    if (sourceChainHasTargetFloor || targetChainHasSourceFloor) {
      toast.warning("Stair continuation already used", "Choose a Stair that is not already part of another chain on this Floor.");
      return;
    }
    const nextFloors = floors.map((candidateFloor, index) => {
      if (index === sourceFloorIndex) {
        return { ...candidateFloor, stairs: (candidateFloor.stairs ?? []).map((stair) => stair.id === stairId ? { ...stair, sharedId: sourceSharedId } : stair) };
      }
      // Merge only the target occurrence's already-established chain into the
      // source chain after the floor-conflict checks above. This preserves any
      // existing links on the source's opposite side (Both direction).
      if (targetSharedId && targetSharedId !== sourceSharedId) {
        return { ...candidateFloor, stairs: (candidateFloor.stairs ?? []).map((stair) => stair.sharedId === targetSharedId ? { ...stair, sharedId: sourceSharedId } : stair) };
      }
      // A target without an identity is uncommon, but assigning the exact
      // occurrence keeps the explicit choice coherent without labels/coords.
      if (index === targetFloorIndex && !targetSharedId) {
        return { ...candidateFloor, stairs: (candidateFloor.stairs ?? []).map((stair) => stair.id === targetStairId ? { ...stair, sharedId: sourceSharedId } : stair) };
      }
      return candidateFloor;
    });
    const groupsWithSource = ensureCirculationGroupName("stairs", sourceSharedId, source.label || target.label || "Stair");
    const groups = targetSharedId && targetSharedId !== sourceSharedId
      ? groupsWithSource.filter((group) => group.id !== targetSharedId)
      : groupsWithSource;
    pushHistory(floorUndoEntryFromFloor(floor));
    const nextCampus = replaceBuildingFloorsAndReconcileTransitions({
      ...campus,
      buildings: campus.buildings.map((buildingItem) => buildingItem.id === buildingId
        ? { ...buildingItem, floors: nextFloors, circulationGroups: groups }
        : buildingItem),
    }, buildingId, nextFloors);
    onUpdate(nextCampus);
  }, [building?.floors, buildingId, campus, ensureCirculationGroupName, floor, floorId, onUpdate, pushHistory, toast]);

  /** Elevator links use the existing sharedId identity, but each authoring
   * action still names one exact target occurrence. Elevators intentionally do
   * not inherit Stair adjacency rules; served-floor metadata remains the
   * source of truth for which floors may receive transitions. */
  const connectElevatorConnections = useCallback((elevatorId: string, targets: Array<{ targetFloorId: string; targetElevatorId: string }>) => {
    if (targets.length === 0) return;
    const floors = (building?.floors ?? []).map((candidateFloor) => ({
      ...candidateFloor,
      elevators: [...(candidateFloor.elevators ?? [])],
    }));
    const sourceFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === floorId);
    if (sourceFloorIndex < 0 || !floors[sourceFloorIndex]?.elevators?.some((elevator) => elevator.id === elevatorId)) return;
    let sourceSharedId = floors[sourceFloorIndex].elevators?.find((elevator) => elevator.id === elevatorId)?.sharedId;
    const removedGroupIds = new Set<string>();
    const joinedFloorIds = new Set<string>();
    for (const targetSpec of targets) {
      const targetFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === targetSpec.targetFloorId);
      const target = floors[targetFloorIndex]?.elevators?.find((elevator) => elevator.id === targetSpec.targetElevatorId);
      const source = floors[sourceFloorIndex].elevators?.find((elevator) => elevator.id === elevatorId);
      if (!source || !target || targetFloorIndex < 0 || targetFloorIndex === sourceFloorIndex) return;
      joinedFloorIds.add(targetSpec.targetFloorId);
      const targetSharedId = target.sharedId;
      const sourceGroupSize = sourceSharedId
        ? floors.reduce((count, candidateFloor) => count + (candidateFloor.elevators ?? []).filter((item) => item.sharedId === sourceSharedId).length, 0)
        : 1;
      const targetGroupSize = targetSharedId
        ? floors.reduce((count, candidateFloor) => count + (candidateFloor.elevators ?? []).filter((item) => item.sharedId === targetSharedId).length, 0)
        : 0;
      sourceSharedId = sourceSharedId ?? targetSharedId ?? `shared_elevator_${buildingId}_${genId("chain")}`;
      // A shaft may have at most one occurrence on a Floor.  Check both the
      // source shaft and the target shaft before any join/move branch runs;
      // otherwise a malformed/legacy duplicate on the target Floor could be
      // silently preserved or created by an otherwise valid join.
      const sourceChainHasTargetFloor = floors.some((candidateFloor) => candidateFloor.id === targetSpec.targetFloorId
        && (candidateFloor.elevators ?? []).some((elevator) => elevator.id !== targetSpec.targetElevatorId && elevator.sharedId === sourceSharedId));
      const targetChainHasTargetFloor = !!targetSharedId && floors.some((candidateFloor) => candidateFloor.id === targetSpec.targetFloorId
        && (candidateFloor.elevators ?? []).some((elevator) => elevator.id !== targetSpec.targetElevatorId && elevator.sharedId === targetSharedId));
      const targetChainHasSourceFloor = !!targetSharedId
        && floors.some((candidateFloor) => candidateFloor.id === floorId
          && (candidateFloor.elevators ?? []).some((elevator) => elevator.id !== elevatorId && elevator.sharedId === targetSharedId));
      // If the selected source shaft already has another occurrence on the
      // target Floor, an explicit candidate click can still mean “move this
      // exact source occurrence to that other shaft” (for example Floor 1
      // Elevator 1 -> Floor 2 Elevator 2 while Floor 2 Elevator 1 remains in
      // place).  Treat that as a deliberate membership move, not an invalid
      // duplicate, provided the destination shaft has no occurrence on either
      // endpoint Floor.  Ordinary joins continue to reject duplicate shaft
      // occupancy on the same Floor.
      const moveSourceToTargetShaft = !!targetSharedId
        && targetSharedId !== sourceSharedId
        && sourceChainHasTargetFloor
        && !targetChainHasTargetFloor
        && !targetChainHasSourceFloor;
      if ((sourceChainHasTargetFloor && !moveSourceToTargetShaft) || targetChainHasTargetFloor || targetChainHasSourceFloor) {
        toast.warning("Elevator connection already used", "Choose an Elevator occurrence that is not assigned to another shaft on this Floor.");
        return;
      }
      if (moveSourceToTargetShaft) {
        // Keep the two shafts independent: only the selected source occurrence
        // changes membership, while every other member remains untouched.
        floors[sourceFloorIndex].elevators = (floors[sourceFloorIndex].elevators ?? []).map((item) => item.id === elevatorId
          ? { ...item, sharedId: targetSharedId }
          : item);
        sourceSharedId = targetSharedId;
      } else if (targetSharedId && targetSharedId !== sourceSharedId && sourceGroupSize > 1 && targetGroupSize > 1) {
        // Change: move only this exact floor occurrence to the selected
        // existing shaft.  The two established shafts remain independent.
        floors[sourceFloorIndex].elevators = (floors[sourceFloorIndex].elevators ?? []).map((item) => item.id === elevatorId
          ? { ...item, sharedId: targetSharedId }
          : item);
      } else if (targetSharedId && targetSharedId !== sourceSharedId && targetGroupSize > 1) {
        // Join: a provisional occurrence adopts the established shaft ID;
        // no pairwise edge authoring or duplicate shaft is created.
        floors[sourceFloorIndex].elevators = (floors[sourceFloorIndex].elevators ?? []).map((item) => item.id === elevatorId
          ? { ...item, sharedId: targetSharedId }
          : item);
        removedGroupIds.add(sourceSharedId);
        sourceSharedId = targetSharedId;
      } else if (targetSharedId && targetSharedId !== sourceSharedId && sourceGroupSize > 1) {
        // Join: an established shaft adopts the newly authored target
        // occurrence. This is the common “add Floor 3 to Elevator 1” flow.
        floors[targetFloorIndex].elevators = (floors[targetFloorIndex].elevators ?? []).map((item) => item.id === targetSpec.targetElevatorId
          ? { ...item, sharedId: sourceSharedId }
          : item);
        // The target was a provisional one-occurrence shaft.  Once its only
        // member adopts the established source identity, drop the now-empty
        // group so it cannot reappear as a phantom shaft in the manager.
        removedGroupIds.add(targetSharedId);
      } else if (targetSharedId && targetSharedId !== sourceSharedId) {
        floors[sourceFloorIndex].elevators = (floors[sourceFloorIndex].elevators ?? []).map((item) => item.id === elevatorId
          ? { ...item, sharedId: sourceSharedId }
          : item);
        floors.forEach((candidateFloor, index) => {
          floors[index] = {
            ...candidateFloor,
            elevators: (candidateFloor.elevators ?? []).map((item) => item.sharedId === targetSharedId
              ? { ...item, sharedId: sourceSharedId }
              : item),
          };
        });
        removedGroupIds.add(targetSharedId);
      } else if (!targetSharedId || targetSharedId === sourceSharedId) {
        floors[targetFloorIndex].elevators = (floors[targetFloorIndex].elevators ?? []).map((item) => item.id === targetSpec.targetElevatorId
          ? { ...item, sharedId: sourceSharedId }
          : item);
      }
    }
    if (!sourceSharedId) return;
    // Always persist the source occurrence's canonical identity as part of the
    // same mutation. Legacy/hand-authored data may omit sharedId on the source;
    // leaving it unset would make the connection appear only from the target
    // Floor after a context switch.
    floors[sourceFloorIndex].elevators = (floors[sourceFloorIndex].elevators ?? []).map((item) => item.id === elevatorId
      ? { ...item, sharedId: sourceSharedId }
      : item);
    // Keep the shaft's explicit served-floor metadata coherent with the
    // identity join.  Reconciliation uses this list to decide which Elevator
    // occurrences participate in transitions and quick-nav; changing only
    // sharedId would leave a restricted shaft unaware of its newly joined stop.
    const shaftEntries = floors.flatMap((candidateFloor) => (candidateFloor.elevators ?? [])
      .filter((item) => item.sharedId === sourceSharedId)
      .map((item) => ({ floor: candidateFloor, item })));
    const explicitServedFloors = new Set(shaftEntries.flatMap(({ item }) => item.floors?.length ? item.floors : []));
    if (explicitServedFloors.size > 0) {
      shaftEntries.forEach(({ floor }) => explicitServedFloors.add(floor.number));
      joinedFloorIds.forEach((targetFloorId) => {
        const targetFloor = floors.find((candidateFloor) => candidateFloor.id === targetFloorId);
        if (targetFloor) explicitServedFloors.add(targetFloor.number);
      });
      const servedFloors = [...explicitServedFloors].sort((a, b) => a - b);
      floors.forEach((candidateFloor, index) => {
        floors[index] = {
          ...candidateFloor,
          elevators: (candidateFloor.elevators ?? []).map((item) => item.sharedId === sourceSharedId
            ? { ...item, floors: servedFloors }
            : item),
        };
      });
    }
    const existingGroups = building?.circulationGroups ?? [];
    const sourceLabel = floors[sourceFloorIndex].elevators?.find((item) => item.id === elevatorId)?.label || "Elevator";
    const groupsWithSource = existingGroups.some((group) => group.id === sourceSharedId && group.kind === "elevator")
      ? existingGroups
      : [...existingGroups, { id: sourceSharedId, buildingId, kind: "elevator" as const, name: sourceLabel }];
    const groups = groupsWithSource.filter((group) => !removedGroupIds.has(group.id));
    pushHistory(floorUndoEntryFromFloor(floor));
    const nextCampus = replaceBuildingFloorsAndReconcileTransitions({
      ...campus,
      buildings: campus.buildings.map((buildingItem) => buildingItem.id === buildingId
        ? { ...buildingItem, floors, circulationGroups: groups }
        : buildingItem),
    }, buildingId, floors);
    onUpdate(nextCampus);
  }, [building?.circulationGroups, building?.floors, buildingId, campus, floor, floorId, onUpdate, pushHistory, toast]);

  const changeElevatorConnection = useCallback((elevatorId: string, targetFloorId: string, targetElevatorId: string) => {
    connectElevatorConnections(elevatorId, [{ targetFloorId, targetElevatorId }]);
  }, [connectElevatorConnections]);

  /** Split only the explicitly selected target occurrence from the existing
   * shaft identity. Other Elevator occurrences and the source relationship
   * remain untouched. */
  const disconnectElevatorConnection = useCallback((elevatorId: string, targetFloorId: string, targetElevatorId: string) => {
    const floors = (building?.floors ?? []).map((candidateFloor) => ({
      ...candidateFloor,
      elevators: [...(candidateFloor.elevators ?? [])],
    }));
    const sourceFloor = floors.find((candidateFloor) => candidateFloor.id === floorId);
    const targetFloor = floors.find((candidateFloor) => candidateFloor.id === targetFloorId);
    const source = sourceFloor?.elevators?.find((elevator) => elevator.id === elevatorId);
    const target = targetFloor?.elevators?.find((elevator) => elevator.id === targetElevatorId);
    if (!source?.sharedId || !target || target.sharedId !== source.sharedId) return;
    const splitSharedId = `shared_elevator_${buildingId}_${genId("chain")}`;
    const nextFloors = floors.map((candidateFloor) => candidateFloor.id === targetFloorId
      ? { ...candidateFloor, elevators: (candidateFloor.elevators ?? []).map((elevator) => elevator.id === targetElevatorId ? { ...elevator, sharedId: splitSharedId } : elevator) }
      : candidateFloor);
    const groups = ensureCirculationGroupName("elevator", splitSharedId, target.label || "Elevator");
    pushHistory(floorUndoEntryFromFloor(floor));
    const nextCampus = replaceBuildingFloorsAndReconcileTransitions({
      ...campus,
      buildings: campus.buildings.map((buildingItem) => buildingItem.id === buildingId
        ? { ...buildingItem, floors: nextFloors, circulationGroups: groups }
        : buildingItem),
    }, buildingId, nextFloors);
    onUpdate(nextCampus);
  }, [building?.floors, buildingId, campus, ensureCirculationGroupName, floor, floorId, onUpdate, pushHistory]);

  /** Clear only cross-floor membership for the selected Elevator shaft.  Each
   * physical occurrence remains in place (and keeps its local nav node); it
   * receives a fresh one-occurrence identity so transition reconciliation
   * cannot reconnect the stops after the destructive action. */
  const disconnectAllElevatorConnections = useCallback((elevatorId: string) => {
    const floors = (building?.floors ?? []).map((candidateFloor) => ({
      ...candidateFloor,
      elevators: [...(candidateFloor.elevators ?? [])],
    }));
    const sourceFloor = floors.find((candidateFloor) => candidateFloor.id === floorId);
    const source = sourceFloor?.elevators?.find((elevator) => elevator.id === elevatorId);
    if (!source?.sharedId) return;
    const shaftId = source.sharedId;
    const members = floors.flatMap((candidateFloor) => (candidateFloor.elevators ?? [])
      .filter((elevator) => elevator.sharedId === shaftId)
      .map((elevator) => ({ floorId: candidateFloor.id, elevator })));
    const memberFloorIds = new Set(members.map((member) => member.floorId));
    if (memberFloorIds.size <= 1) return;
    const shaftGroup = (building?.circulationGroups ?? []).find((group) => group.id === shaftId && group.kind === "elevator");
    const freshIdentityByOccurrence = new Map<string, string>();
    members.forEach(({ elevator }) => {
      freshIdentityByOccurrence.set(elevator.id, `shared_elevator_${buildingId}_${genId("chain")}`);
    });
    const nextFloors = floors.map((candidateFloor) => ({
      ...candidateFloor,
      elevators: (candidateFloor.elevators ?? []).map((elevator) => {
        const freshId = freshIdentityByOccurrence.get(elevator.id);
        return freshId ? { ...elevator, sharedId: freshId } : elevator;
      }),
    }));
    const retainedGroups = (building?.circulationGroups ?? []).filter((group) => group.id !== shaftId || group.kind !== "elevator");
    const splitGroups = members.map(({ elevator }) => ({
      id: freshIdentityByOccurrence.get(elevator.id)!,
      buildingId,
      kind: "elevator" as const,
      name: shaftGroup?.name || elevator.label || "Elevator",
    }));
    pushHistory(floorUndoEntryFromFloor(floor));
    const nextCampus = replaceBuildingFloorsAndReconcileTransitions({
      ...campus,
      buildings: campus.buildings.map((buildingItem) => buildingItem.id === buildingId
        ? { ...buildingItem, floors: nextFloors, circulationGroups: [...retainedGroups, ...splitGroups] }
        : buildingItem),
    }, buildingId, nextFloors);
    onUpdate(nextCampus);
  }, [building?.circulationGroups, building?.floors, buildingId, campus, floor, floorId, onUpdate, pushHistory]);

  /**
   * Commit the optional "Connect Matching Stairs" action as one explicit
   * authoring edit.  Each target occurrence is validated independently, then
   * all requested adjacent links are reconciled from the same floor snapshot
   * so adding Above never replaces an existing Below relationship.
   */
  const connectMatchingStairConnections = useCallback((stairId: string, targets: Array<{ targetFloorId: string; targetStairId: string }>) => {
    if (targets.length === 0) return;
    const floors = (building?.floors ?? []).map((candidateFloor) => ({
      ...candidateFloor,
      stairs: [...(candidateFloor.stairs ?? [])],
    }));
    const sourceFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === floorId);
    const sourceFloor = floors[sourceFloorIndex];
    if (!sourceFloor || sourceFloorIndex < 0) return;
    let source = sourceFloor.stairs?.find((stair) => stair.id === stairId);
    if (!source) return;
    let sourceSharedId = source.sharedId;
    const removedGroupIds = new Set<string>();

    for (const targetSpec of targets) {
      const targetFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === targetSpec.targetFloorId);
      const targetFloor = floors[targetFloorIndex];
      const target = targetFloor?.stairs?.find((stair) => stair.id === targetSpec.targetStairId);
      if (!target || targetFloorIndex < 0 || targetFloorIndex === sourceFloorIndex) return;
      if (Math.abs(targetFloorIndex - sourceFloorIndex) !== 1) {
        toast.warning("Stair connection unavailable", "Choose an adjacent Floor for this Stair.");
        return;
      }
      if (!stairContinuationDirectionAllows(source.direction ?? "both", sourceFloorIndex, targetFloorIndex)) {
        toast.warning("Stair direction blocks this connection", "Change the Stair direction before choosing this Floor.");
        return;
      }
      sourceSharedId = sourceSharedId ?? target.sharedId ?? `shared_stair_${buildingId}_${genId("chain")}`;
      const targetSharedId = target.sharedId;
      const sourceChainHasTargetFloor = floors.some((candidateFloor) => candidateFloor.id === targetSpec.targetFloorId
        && (candidateFloor.stairs ?? []).some((stair) => stair.id !== targetSpec.targetStairId && stair.sharedId === sourceSharedId));
      const targetChainHasSourceFloor = !!targetSharedId && targetSharedId !== sourceSharedId
        && floors.some((candidateFloor) => candidateFloor.id === floorId
          && (candidateFloor.stairs ?? []).some((stair) => stair.id !== stairId && stair.sharedId === targetSharedId));
      if (sourceChainHasTargetFloor || targetChainHasSourceFloor) {
        toast.warning("Stair continuation already used", "Choose a Stair that is not already part of another chain on this Floor.");
        return;
      }

      // Keep the source occurrence on the selected chain for every requested
      // side.  Merging a target's prior provisional/explicit chain is only
      // done for this exact, explicitly chosen target occurrence after the
      // conflict checks above.
      floors[sourceFloorIndex].stairs = (floors[sourceFloorIndex].stairs ?? []).map((stair) => stair.id === stairId
        ? { ...stair, sharedId: sourceSharedId }
        : stair);
      if (targetSharedId && targetSharedId !== sourceSharedId) {
        floors.forEach((candidateFloor, index) => {
          floors[index] = {
            ...candidateFloor,
            stairs: (candidateFloor.stairs ?? []).map((stair) => stair.sharedId === targetSharedId
              ? { ...stair, sharedId: sourceSharedId }
              : stair),
          };
        });
        removedGroupIds.add(targetSharedId);
      } else if (!targetSharedId) {
        floors[targetFloorIndex].stairs = (floors[targetFloorIndex].stairs ?? []).map((stair) => stair.id === targetSpec.targetStairId
          ? { ...stair, sharedId: sourceSharedId }
          : stair);
      }
      source = floors[sourceFloorIndex].stairs?.find((stair) => stair.id === stairId) ?? source;
    }

    if (!sourceSharedId) return;
    const existingGroups = building?.circulationGroups ?? [];
    const groupsWithSource = existingGroups.some((group) => group.id === sourceSharedId && group.kind === "stair")
      ? existingGroups
      : [...existingGroups, { id: sourceSharedId, buildingId, kind: "stair" as const, name: source.label || "Stair" }];
    const groups = groupsWithSource.filter((group) => !removedGroupIds.has(group.id));
    pushHistory(floorUndoEntryFromFloor(floor));
    const nextCampus = replaceBuildingFloorsAndReconcileTransitions({
      ...campus,
      buildings: campus.buildings.map((buildingItem) => buildingItem.id === buildingId
        ? { ...buildingItem, floors, circulationGroups: groups }
        : buildingItem),
    }, buildingId, floors);
    onUpdate(nextCampus);
  }, [building?.circulationGroups, building?.floors, buildingId, campus, floor, floorId, onUpdate, pushHistory, toast]);

  /**
   * Disconnect one adjacent relationship while preserving the rest of the
   * chain.  Since one Stair occurrence has one canonical sharedId, the
   * target-side occurrences are partitioned into a fresh identity instead of
   * clearing the selected Stair's unrelated opposite-side connection.
   */
  const disconnectStairConnection = useCallback((stairId: string, targetFloorId: string, targetStairId: string) => {
    const floors = (building?.floors ?? []).map((candidateFloor) => ({
      ...candidateFloor,
      stairs: [...(candidateFloor.stairs ?? [])],
    }));
    const sourceFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === floorId);
    const targetFloorIndex = floors.findIndex((candidateFloor) => candidateFloor.id === targetFloorId);
    const sourceFloor = floors[sourceFloorIndex];
    const targetFloor = floors[targetFloorIndex];
    const source = sourceFloor?.stairs?.find((stair) => stair.id === stairId);
    const target = targetFloor?.stairs?.find((stair) => stair.id === targetStairId);
    if (!source?.sharedId || !target || target.sharedId !== source.sharedId || sourceFloorIndex < 0 || targetFloorIndex < 0) return;
    if (Math.abs(targetFloorIndex - sourceFloorIndex) !== 1) return;
    const movingUp = targetFloorIndex > sourceFloorIndex;
    const splitSharedId = `shared_stair_${buildingId}_${genId("chain")}`;
    const nextFloors = floors.map((candidateFloor, index) => {
      const onTargetSide = movingUp ? index > sourceFloorIndex : index < sourceFloorIndex;
      if (!onTargetSide) return candidateFloor;
      return {
        ...candidateFloor,
        stairs: (candidateFloor.stairs ?? []).map((stair) => stair.sharedId === source.sharedId ? { ...stair, sharedId: splitSharedId } : stair),
      };
    });
    const groups = ensureCirculationGroupName("stairs", splitSharedId, target.label || "Stair");
    pushHistory(floorUndoEntryFromFloor(floor));
    const nextCampus = replaceBuildingFloorsAndReconcileTransitions({
      ...campus,
      buildings: campus.buildings.map((buildingItem) => buildingItem.id === buildingId
        ? { ...buildingItem, floors: nextFloors, circulationGroups: groups }
        : buildingItem),
    }, buildingId, nextFloors);
    onUpdate(nextCampus);
  }, [building?.floors, buildingId, campus, ensureCirculationGroupName, floor, floorId, onUpdate, pushHistory]);

  const createCirculationGroup = useCallback((type: "stairs" | "elevator", objectId: string, name: string) => {
    const prefix = type === "stairs" ? "stair" : "el";
    const sharedId = `shared_${prefix}_${genId("cg")}`;
    const groups = ensureCirculationGroupName(type, sharedId, name);
    if (type === "stairs") {
      buildFloorUpdates({ stairs: stairs.map((s) => s.id === objectId ? { ...s, sharedId } : s) }, { circulationGroups: groups });
    } else {
      buildFloorUpdates({ elevators: elevators.map((e) => e.id === objectId ? { ...e, sharedId } : e) }, { circulationGroups: groups });
    }
  }, [buildFloorUpdates, elevators, ensureCirculationGroupName, stairs]);

  const renameCirculationGroup = useCallback((type: "stairs" | "elevator", sharedId: string, name: string) => {
    const kind = type === "stairs" ? "stair" : "elevator";
    const groups = building?.circulationGroups ?? [];
    const nextGroups = groups.some((g) => g.id === sharedId && g.kind === kind)
      ? groups.map((g) => g.id === sharedId && g.kind === kind ? { ...g, name } : g)
      : [...groups, { id: sharedId, buildingId, kind, name }];
    updateCirculationGroupMetadata(nextGroups);
  }, [building?.circulationGroups, buildingId, updateCirculationGroupMetadata]);

  // Apply a history entry to the floor (shared by toolbar buttons + shortcuts).
  // History pushes are suppressed while applying so undo/redo never record
  // themselves as a new edit.
  const applyEntry = useCallback((entry: FloorUndoEntry | null) => {
    if (!entry) return;
    suppressHistoryRef.current = true;
    buildFloorUpdates(entry);
    suppressHistoryRef.current = false;
  }, [buildFloorUpdates]);

  // ── Toggle navigation connection for a room ──
  const onToggleNavConnection = useCallback((room: FloorRoom) => {
    if (room.navConnection) {
      // Disconnect — remove the nav connection
      const { navConnection: _, ...rest } = room;
      updFloor(
        rooms.map((r) => r.id === room.id ? rest : r),
        fpaths
      );
      toast.info("Navigation disconnected", `${room.name} is no longer a navigation destination.`);
    } else {
      // Connect — auto-detect door position
      const cx = FP_W / 2;
      const cy = FP_H / 2;
      const edges = [
        { x: room.x + room.w / 2, y: room.y },             // top
        { x: room.x + room.w / 2, y: room.y + room.h },    // bottom
        { x: room.x,              y: room.y + room.h / 2 }, // left
        { x: room.x + room.w,     y: room.y + room.h / 2 }, // right
      ];
      let bestDist = Infinity;
      let best = edges[0];
      for (const pt of edges) {
        const d = Math.sqrt((pt.x - cx) ** 2 + (pt.y - cy) ** 2);
        if (d < bestDist) { bestDist = d; best = pt; }
      }
      const connected: FloorRoom = { ...room, navConnection: { x: Math.round(best.x), y: Math.round(best.y) } };
      updFloor(
        rooms.map((r) => r.id === room.id ? connected : r),
        fpaths
      );
      toast.success("Connected to Navigation", `${room.name} is now a reachable destination.`);
    }
  }, [rooms, fpaths, updFloor, pushHistory, toast]);

  // ── Save ──
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!isFloorDirty || saving) return true;
    // B7 Phase 2: SAVE DRAFT must never be blocked by map validation. A draft
    // is allowed to be incomplete — issues stay visible (Issues panel, markers)
    // but never stop the administrator from preserving unfinished work. Only
    // genuine persistence failures (below) can prevent a save.
    setSaving(true);
    try {
      // Navigation commits update navGraphRef immediately, while React props
      // may still contain the previous render for one tick. Serialize that
      // current graph so a fast Save cannot overwrite newly authored nodes or
      // edges with a stale indoorNodes/indoorEdges snapshot.
      const candidate = buildFloorUpdates({
        navNodes: navGraphRef.current.nodes,
        navEdges: navGraphRef.current.edges,
      });
      const savedCampus = onSave ? await onSave(candidate) : candidate;
      onUpdate(savedCampus);
      const savedFloor = normalizeFloor(
        savedCampus.buildings.find((b) => b.id === buildingId)?.floors.find((f) => f.id === floorId) ?? floor,
        { buildingId }
      );
      const savedIndoorNodes = indoorNavNodes(savedCampus.navNodes, buildingId, floorId);
      const savedIndoorEdges = indoorNavEdges(savedCampus.navEdges, savedIndoorNodes, buildingId, floorId);
      const entry: FloorUndoEntry = {
        ...floorUndoEntryFromFloor(savedFloor),
        navNodes: savedIndoorNodes,
        navEdges: savedIndoorEdges,
      };
      navGraphRef.current = { nodes: savedIndoorNodes, edges: savedIndoorEdges };
      setNavGraphVersion((v) => v + 1);
      baselineFloorRef.current = structuredClone(savedFloor);
      baselineEntryRef.current = structuredClone(entry);
      // Baseline must match the composed dirty key (floor + indoor nav graph)
      // derived from the confirmed saved campus, not from pre-save refs.
      setBaselineKey(floorDirtyKeyOf(savedFloor, savedIndoorNodes, savedIndoorEdges));
      // B5 Phase 3.1.3: a successful save also re-baselines the building floor
      // structure (the new floor list is now persisted) so Save disables again.
      // Fall back to the pre-save structure if the saved campus lacks the
      // building (defensive — never mark a saved state dirty spuriously).
      setStructureBaselineKey(floorStructureKeyOf(
        savedCampus.buildings.find((b) => b.id === buildingId)?.floors ?? building.floors
      ));
      resetHistory(entry);
      setSaving(false);
      setSaved(true);
      toast.success("Floor saved", `${floor.label} changes saved successfully.`);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (error) {
      setSaving(false);
      toast.error("Could not save floor", error instanceof Error ? error.message : "The database rejected the save.");
      return false;
    }
  }, [buildFloorUpdates, onSave, onUpdate, buildingId, floorId, floor, resetHistory, toast, isFloorDirty, saving]);

  // ── Shared unsaved-changes guard: floor switch / add floor / back / exit.
  // Runs the real save flow (handleSave) on Save Changes, restores the FULL
  // saved baseline (floor + indoor nav graph) on Discard, and registers the
  // native beforeunload protection while the floor is dirty.
  const unsavedGuard = useUnsavedChangesGuard({
    isDirty: isFloorDirty,
    onSave: handleSave,
    onDiscard: () => {
      // Restore the FULL saved baseline — floor AND indoor nav graph — so a
      // Discard never leaves unsaved nav edits behind.
      const entry = baselineEntryRef.current ?? floorUndoEntryFromFloor(structuredClone(baselineFloorRef.current));
      buildFloorUpdates(entry);
      resetHistory(entry);
      baselineEntryRef.current = structuredClone(entry);
      setBaselineKey(JSON.stringify(baselineFloorRef.current) + "|" + JSON.stringify([entry.navNodes ?? [], entry.navEdges ?? []]));
    },
  });
  const { guard: guardNavigation } = unsavedGuard;

  // ── Back to the Campus editor — same guard path as every other exit ──
  const handleBack = useCallback(() => {
    guardNavigation(() => onBack());
  }, [guardNavigation, onBack]);

  const handlePublish = useCallback(() => {
    if (onPreviewStudent) {
      onPreviewStudent(campus, isFloorDirty);
      return;
    }
    // B7 Phase 2: PUBLISH uses the SAME canonical live issue list as the Issues
    // panel — the floor-local geometry checks merged with the canonical
    // campus/navigation issues that target this floor. Errors block publishing;
    // warnings/info may proceed (severity is the source of truth).
    const localGeometryErrors = validateFloorGeometry(floor).filter((issue) => issue.severity === "error");
    const canonicalFloorErrors = validationIssuesForFloor(campus, floorId).filter((issue) => issue.severity === "error");
    const seen = new Set<string>();
    const errors: FloorIssue[] = [];
    for (const issue of [...localGeometryErrors, ...canonicalFloorErrors]) {
      const selection = issue.selection ? `${issue.selection.type}|${issue.selection.id}` : "";
      const key = `${issue.id ?? ""}|${selection}|${issue.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      errors.push(issue);
    }
    if (errors.length > 0) {
      setShowIssues(true);
      toast.error("Resolve floor issues before publishing", `${errors.length} blocking issue${errors.length !== 1 ? "s" : ""} found on this floor.`);
      return;
    }
    if (!publishingEnabled || !onPublish) {
      toast.info("Publishing is implemented in A6.", "Save this floor draft now; campus-level publishing will use the existing Map Builder publish workflow.");
      return;
    }
    onPublish(campus);
  }, [campus, floor, floorId, onPublish, onPreviewStudent, publishingEnabled, toast, isFloorDirty]);

  const switchToFloor = useCallback((targetFloorId: string, initialSelection?: FloorSelection) => {
    if (targetFloorId === floorId) return;
    clearTransientEditorState();
    onSwitchFloor(targetFloorId, initialSelection);
  }, [clearTransientEditorState, floorId, onSwitchFloor]);

  const requestFloorSwitch = useCallback((targetFloorId: string, initialSelection?: FloorSelection) => {
    if (targetFloorId === floorId) return;
    setFloorMenu(null);
    setFloorSelectorOpen(false);
    clearTransientEditorState();
    // Dirty floor edits go through the shared unsaved-changes guard (same
    // flow as Add Floor and back). The pending action resumes after
    // Save Changes / Discard Changes or is cancelled by Keep Editing.
    guardNavigation(() => switchToFloor(targetFloorId, initialSelection), {
      description: `Save or discard changes to ${floor.label} before switching floors.`,
    });
  }, [clearTransientEditorState, floor, floorId, guardNavigation, switchToFloor]);

  // A successful route calculation may switch from Outdoor or another floor
  // into this editor. Consume the one-shot origin focus only after this floor
  // has mounted and its canvas controls are ready; otherwise the previous
  // editor can consume the request and the new floor opens at its default view.
  useEffect(() => {
    const request = testRouteSessionContext.session?.pendingFocus;
    if (!request || request.context.kind !== "floor"
      || request.context.buildingId !== buildingId
      || request.context.floorId !== floorId) return;
    const node = indoorNodes.find((candidate) => candidate.id === request.nodeId);
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      // Keep automatic route focus useful without pinning the camera tightly
      // to a Stair/Room. A moderate context window lets the admin orient on
      // the surrounding floor plan immediately.
      zoomToFit(Math.max(0, node.x - 140), Math.max(0, node.y - 110), 280, 220, 72);
      const current = testRouteSessionContext.session;
      if (current?.pendingFocus?.nodeId === request.nodeId
        && current.pendingFocus.context.kind === "floor"
        && current.pendingFocus.context.floorId === floorId) {
        testRouteSessionContext.setSession({ ...current, pendingFocus: undefined });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [buildingId, floorId, indoorNodes, testRouteSessionContext.session, testRouteSessionContext.setSession, zoomToFit]);

  const handleTestRouteTransition = useCallback((marker: TestRouteTransitionMarker) => {
    if (marker.kind === "elevator" && marker.targetContext.kind === "floor" && marker.targetContext.floorId) {
      const targetNode = marker.targetNodeId
        ? (campus.navNodes ?? []).find((node) => node.id === marker.targetNodeId)
        : undefined;
      const initialSelection: FloorSelection | undefined = targetNode?.elevatorId
        ? { type: "elevator", id: targetNode.elevatorId }
        : targetNode?.stairId
          ? { type: "stairs", id: targetNode.stairId }
          : targetNode?.doorId
            ? { type: "door", id: targetNode.doorId }
            : undefined;
      requestFloorSwitch(marker.targetContext.floorId, initialSelection);
      return;
    }
    if (marker.targetContext.kind === "outdoor") {
      const current = testRouteSessionContext.session;
      if (current && marker.targetNodeId) {
        testRouteSessionContext.setSession({
          ...current,
          pendingFocus: { nodeId: marker.targetNodeId, context: marker.targetContext },
        });
      }
      handleBack();
      return;
    }
    if (marker.targetContext.buildingId === buildingId && marker.targetContext.floorId) {
      const targetNode = marker.targetNodeId
        ? (campus.navNodes ?? []).find((node) => node.id === marker.targetNodeId)
        : undefined;
      const initialSelection: FloorSelection | undefined = targetNode?.elevatorId
        ? { type: "elevator", id: targetNode.elevatorId }
        : targetNode?.stairId
          ? { type: "stairs", id: targetNode.stairId }
          : targetNode?.doorId
            ? { type: "door", id: targetNode.doorId }
            : undefined;
      requestFloorSwitch(marker.targetContext.floorId, initialSelection);
    }
  }, [buildingId, campus.navNodes, handleBack, requestFloorSwitch, testRouteSessionContext]);

  const updateFloorSelectorPosition = useCallback(() => {
    const trigger = floorSelectorButtonRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const margin = 12;
    const width = Math.min(320, Math.max(180, window.innerWidth - margin * 2));
    const left = clamp(rect.left, margin, Math.max(margin, window.innerWidth - width - margin));
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const openAbove = below < 180 && above > below;
    const maxHeight = Math.max(160, Math.min(288, openAbove ? above : below));
    const top = openAbove
      ? Math.max(margin, rect.top - gap - maxHeight)
      : Math.min(rect.bottom + gap, window.innerHeight - margin - maxHeight);
    setFloorSelectorPosition({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!floorSelectorOpen) return;
    updateFloorSelectorPosition();
    const onReposition = () => updateFloorSelectorPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [floorSelectorOpen, updateFloorSelectorPosition]);

  const updateBuildingFloors = useCallback((nextFloors: FloorPlan[]) => {
    const reconciledDirections = reconcileStairDirectionsForFloorOrder(nextFloors);
    const updatedCampus = replaceBuildingFloorsAndReconcileTransitions(
      campus,
      buildingId,
      reconciledDirections.floors.map((nextFloor) => normalizeFloor(nextFloor, { buildingId }))
    );
    onUpdate(updatedCampus);
    for (const adjustment of reconciledDirections.adjustments) {
      const directionLabel = adjustment.to === "both" ? "Both" : adjustment.to === "up" ? "Up" : "Down";
      toast.info("Stair direction updated", `${adjustment.stairLabel} is now ${directionLabel} on ${adjustment.floorLabel}.`);
    }
    return updatedCampus;
  }, [buildingId, campus, onUpdate, toast]);

  // ── Floor management — ALL surfaces (the `...` button, tab right-clicks,
  //    the rename/delete dialogs, and the Floor Overview sidebar) route through
  //    these handlers and the shared floorManagement helpers, so no surface can
  //    drift into a separate duplicate/delete/reorder implementation. ──

  // B5 Phase 3.1: the ACTUAL add-floor mutation, shared by the direct path
  // (clean floor) and the Save/Discard dialog path (dirty floor).
  const performAddFloor = useCallback(() => {
    const { floors, floor: newFloor } = addFloorToBuilding(building.floors, buildingId);
    updateBuildingFloors(floors);
    clearTransientEditorState();
    setFloorMenu(null);
    setFloorSelectorOpen(false);
    onSwitchFloor(newFloor.id);
    toast.success("Floor added", `${newFloor.label} is ready to edit.`);
  }, [building.floors, buildingId, clearTransientEditorState, onSwitchFloor, toast, updateBuildingFloors]);

  const addFloorFromEditor = useCallback(() => {
    setFloorMenu(null);
    setFloorSelectorOpen(false);
    clearTransientEditorState();
    // B5 Phase 3.1: never create a new floor on top of unsaved changes — the
    // admin must first decide Save/Discard through the shared guard. This
    // keeps the "Add Floor → Save" flow single-creation: the save happens
    // once, the new floor opens once, and a failed save leaves the floor list
    // untouched.
    guardNavigation(performAddFloor, {
      description: `Save or discard changes to ${floor.label} before adding a new floor.`,
    });
  }, [clearTransientEditorState, floor, guardNavigation, performAddFloor]);

  const requestDuplicateFloor = useCallback((targetId: string) => {
    // B5 Phase 2: pass the campus nav graph so the duplicate floor also clones
    // its indoor nav graph (new IDs, remapped floorId + linked object refs).
    const { floors: duplicatedFloors, copy, navNodes, navEdges } = duplicateFloorInBuilding(building.floors, buildingId, targetId, campus.navNodes, campus.navEdges);
    if (!copy) {
      setFloorMenu(null);
      return;
    }
    // A duplicated floor changes the authoritative floor position for every
    // Stair in the building. Reconcile boundary directions in the same write
    // as the duplicate so a one-floor stair that becomes a lower/middle stair
    // never retains a stale direction in Properties or validation.
    const reconciledDirections = reconcileStairDirectionsForFloorOrder(duplicatedFloors);
    const baseCampus: Campus = {
      ...campus,
      navNodes: navNodes ?? campus.navNodes,
      navEdges: navEdges ?? campus.navEdges,
      buildings: campus.buildings.map((b) =>
        b.id === buildingId ? { ...b, floors: reconciledDirections.floors } : b
      ),
    };
    // B5 Phase 3: replace floors through the shared helper. Besides rebuilding
    // derived transitions, it re-resolves linked Stair anchors after any
    // direction reconciliation so a duplicated/reordered floor cannot leave a
    // canonical node at its old physical entry.
    const updatedCampus = replaceBuildingFloorsAndReconcileTransitions(
      baseCampus,
      buildingId,
      reconciledDirections.floors
    );
    onUpdate(updatedCampus);
    for (const adjustment of reconciledDirections.adjustments) {
      const directionLabel = adjustment.to === "both" ? "Both" : adjustment.to === "up" ? "Up" : "Down";
      toast.info("Stair direction updated", `${adjustment.stairLabel} is now ${directionLabel} on ${adjustment.floorLabel}.`);
    }
    clearTransientEditorState();
    setFloorMenu(null);
    onSwitchFloor(copy.id);
    toast.success("Floor duplicated", `${copy.label} was copied with new object IDs.`);
  }, [building.floors, buildingId, campus, clearTransientEditorState, onSwitchFloor, toast, onUpdate]);

  const requestMoveFloor = useCallback((targetId: string, direction: -1 | 1) => {
    const { floors, moved } = moveFloorInBuilding(building.floors, targetId, direction);
    if (!moved) return;
    updateBuildingFloors(floors);
    setFloorMenu(null);
    const label = building.floors.find((f) => f.id === targetId)?.label ?? "Floor";
    toast.success("Floor order updated", `${label} moved ${direction < 0 ? "up" : "down"}.`);
  }, [building.floors, toast, updateBuildingFloors]);

  const requestDeleteFloor = useCallback((targetId: string) => {
    if (building.floors.length <= 1) {
      toast.error("Cannot delete floor", "A building must keep at least one floor.");
      setFloorMenu(null);
      return;
    }
    const target = building.floors.find((f) => f.id === targetId);
    setFloorDeleteConfirm({ id: targetId, label: target?.label ?? "this floor" });
    setFloorMenu(null);
  }, [building.floors, toast]);

  const confirmDeleteFloorById = useCallback((targetId: string) => {
    const { floors, deleted, nextActiveId } = deleteFloorFromBuilding(building.floors, targetId);
    if (!deleted) {
      setFloorDeleteConfirm(null);
      return;
    }
    if (floors.length === 0) {
      toast.error("Cannot delete floor", "A building must keep at least one floor.");
      setFloorDeleteConfirm(null);
      return;
    }
    updateBuildingFloors(floors);
    clearTransientEditorState();
    setFloorDeleteConfirm(null);
    // Track the active floor by ID: deleting the active floor activates the
    // nearest remaining floor (next at the same index, else previous); deleting
    // an inactive floor leaves the current active floor untouched.
    if (targetId === floorId && nextActiveId) onSwitchFloor(nextActiveId);
    toast.success("Floor deleted", `${deleted.label} has been removed.`);
  }, [building.floors, clearTransientEditorState, floorId, onSwitchFloor, toast, updateBuildingFloors]);

  const beginRenameFloor = useCallback((target: FloorPlan) => {
    setFloorRename({ floorId: target.id, currentLabel: target.label });
    setFloorRenameValue(target.label);
    setFloorMenu(null);
  }, []);

  const applyFloorRename = useCallback(() => {
    if (!floorRename) return;
    const value = floorRenameValue.trim();
    if (!value) {
      toast.error("Name required", "Floor name cannot be empty.");
      return;
    }
    if (value === floorRename.currentLabel) {
      setFloorRename(null);
      return;
    }
    updateBuildingFloors(renameFloorInBuilding(building.floors, floorRename.floorId, value));
    setFloorRename(null);
    toast.success("Floor renamed", `Renamed to "${value}".`);
  }, [building.floors, floorRename, floorRenameValue, toast, updateBuildingFloors]);

  const openFloorActionsAtButton = useCallback(() => {
    setFloorSelectorOpen(false);
    if (floorMenu) {
      setFloorMenu(null);
      return;
    }
    const rect = floorActionsButtonRef.current?.getBoundingClientRect();
    setFloorMenu({ floorId, x: rect?.left ?? 8, y: (rect?.bottom ?? 8) + 4 });
  }, [floorId, floorMenu]);

  const getSelectionItem = useCallback((type: FloorSelection["type"], id: string) => {
    if (type === "room") return rooms.find((r) => r.id === id);
    if (type === "wall") return walls.find((w) => w.id === id);
    if (type === "door") return doors.find((d) => d.id === id);
    if (type === "window") return windows.find((w) => w.id === id);
    if (type === "furniture") return furniture.find((f) => f.id === id);
    if (type === "stairs") return stairs.find((s) => s.id === id);
    if (type === "ramp") return ramps.find((r) => r.id === id);
    if (type === "elevator") return elevators.find((e) => e.id === id);
    if (type === "label") return labels.find((l) => l.id === id);
    if (type === "path") return fpaths.find((p) => p.id === id);
    return undefined;
  }, [rooms, walls, doors, windows, furniture, stairs, ramps, elevators, labels, fpaths]);

  const selectionForId = useCallback((id: string): FloorSelection | null => {
    const types: FloorSelection["type"][] = ["room", "furniture", "stairs", "ramp", "elevator", "label", "wall", "door", "window", "path"];
    for (const type of types) {
      const item = getSelectionItem(type, id);
      if (!item) continue;
      if (type === "wall" && isManagedPerimeterWall(item as FloorWall)) return null;
      return { type, id };
    }
    return null;
  }, [getSelectionItem]);

  const isSelectionLocked = useCallback((selection: FloorSelection | null | undefined) => {
    if (!selection) return false;
    return Boolean((getSelectionItem(selection.type, selection.id) as any)?.locked);
  }, [getSelectionItem]);

  // ── Universal alignment: collect reference bounds from all supported objects ──
  const collectAlignRefs = useCallback((excludeIds: Set<string> = new Set()) => {
    const refs: { x: number; y: number; w: number; h: number; id: string }[] = [];
    // Helper: use AABB (visible world-space bounds) for rotated objects
    // so alignment matches the VISUAL edge, not the unrotated rect.
    const aabb = (x: number, y: number, w: number, h: number, rot?: number) => {
      if (rot) { const b = rotatedRectBounds(x, y, w, h, rot); return { x: b.x, y: b.y, w: b.w, h: b.h }; }
      return { x, y, w, h };
    };
    for (const room of rooms) {
      if (excludeIds.has(room.id)) continue;
      if (room.visible === false) continue;
      const b = aabb(room.x, room.y, room.w, room.h, room.rotation);
      refs.push({ ...b, id: room.id });
    }
    for (const f of furniture) {
      if (excludeIds.has(f.id)) continue;
      if (f.visible === false) continue;
      const b = aabb(f.x, f.y, f.width, f.height, f.rotation);
      refs.push({ ...b, id: f.id });
    }
    for (const s of stairs) {
      if (excludeIds.has(s.id)) continue;
      if (s.visible === false) continue;
      const b = aabb(s.x, s.y, s.width, s.height, s.rotation);
      refs.push({ ...b, id: s.id });
    }
    for (const r of ramps) {
      if (excludeIds.has(r.id)) continue;
      if (r.visible === false) continue;
      const b = aabb(r.x, r.y, r.width, r.height, r.rotation);
      refs.push({ ...b, id: r.id });
    }
    for (const el of elevators) {
      if (excludeIds.has(el.id)) continue;
      if (el.visible === false) continue;
      const b = aabb(el.x, el.y, el.width, el.height, el.rotation);
      refs.push({ ...b, id: el.id });
    }
    // Structural and navigation anchors are alignment references only. They do
    // not create ownership or graph connectivity; they simply let a movable
    // object line up with a wall, Door, or nearby path point.
    for (const wall of walls) {
      if (excludeIds.has(wall.id)) continue;
      refs.push({
        x: Math.min(wall.x1, wall.x2), y: Math.min(wall.y1, wall.y2),
        w: Math.max(1, Math.abs(wall.x2 - wall.x1)), h: Math.max(1, Math.abs(wall.y2 - wall.y1)),
        id: `wall:${wall.id}`,
      });
    }
    for (const door of doors) {
      if (excludeIds.has(door.id)) continue;
      refs.push({ x: door.x - 1, y: door.y - 1, w: 2, h: 2, id: `door:${door.id}` });
    }
    for (const node of indoorNodes) {
      if (node.roomId) continue;
      refs.push({ x: node.x - 1, y: node.y - 1, w: 2, h: 2, id: `nav:${node.id}` });
    }
    for (const path of fpaths) {
      for (const [index, point] of path.points.entries()) {
        refs.push({ x: point.x - 1, y: point.y - 1, w: 2, h: 2, id: `path:${path.id}:${index}` });
      }
    }
    // Labels are excluded from alignment references per spec — they don't
    // serve as useful spatial alignment targets for rooms/furniture/circulation.
    return refs;
  }, [doors, elevators, fpaths, furniture, indoorNodes, labels, ramps, rooms, stairs, walls]);

  const selectFloorItem = useCallback((selection: FloorSelection | null) => {
    clearRoomDoorLinkState();
    setMultiSelected([]);
    setSelected(selection);
    setNavSelected(null);
    setNavMultiSelected([]);
    setNavPhysicalSelected(null);
    setShowProperties(true);
  }, [clearRoomDoorLinkState]);

  // ── B5 Final: issue-locate camera focus ───────────────────────────────
  // After an initialSelection arrives (issue clicked on the campus editor),
  // center the camera on the located object so the admin lands directly on
  // the problem. The ref guard prevents re-zooming on unrelated re-renders.
  useEffect(() => {
    if (!initialSelection) return;
    const focusKey = `${initialSelection.type}:${initialSelection.id}`;
    if (locateFocusedRef.current === focusKey) return;
    locateFocusedRef.current = focusKey;
    if (initialSelection.type === "navNode") {
      const n = indoorNodes.find((x) => x.id === initialSelection.id);
      if (n) {
        // Point object — the rendered node center IS its coordinates.
        zoomToFit(Math.max(0, n.x - 60), Math.max(0, n.y - 60), 120, 120, 48);
        setLocateFlash({ world: { x: n.x, y: n.y } });
      }
      return;
    }
    if (initialSelection.type === "navEdge") {
      const e = indoorEdges.find((x) => x.id === initialSelection.id);
      const a = e ? indoorNodes.find((n) => n.id === e.startNodeId) : undefined;
      const b = e ? indoorNodes.find((n) => n.id === e.endNodeId) : undefined;
      if (e && a && b) {
        // B7 Phase 1: flash the midpoint measured ALONG the rendered polyline,
        // never the bounding-box center (which can sit off a bent edge).
        const pts = [{ x: a.x, y: a.y }, ...(e.bendPoints ?? []), { x: b.x, y: b.y }];
        const mid = polylineMidpoint(pts);
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        zoomToFit(Math.max(0, minX - 40), Math.max(0, minY - 40), maxX - minX + 80, maxY - minY + 80, 40);
        setLocateFlash({ world: { x: mid.x, y: mid.y } });
      }
      return;
    }
    const item = getSelectionItem(initialSelection.type, initialSelection.id) as { x?: number; y?: number; w?: number; h?: number; width?: number; height?: number } | undefined;
    if (item && typeof item.x === "number" && typeof item.y === "number") {
      // B7 Phase 1: rectangular objects flash at their rendered bounds CENTER
      // (rooms, stairs, elevators, ramps, furniture, windows); point objects
      // (doors, labels) at their coordinate. Never the top-left corner.
      const anchor = floorObjectCenter(initialSelection.type as Parameters<typeof floorObjectCenter>[0], item);
      zoomToFit(Math.max(0, anchor.x - 60), Math.max(0, anchor.y - 60), 120, 120, 48);
      setLocateFlash({ world: { x: anchor.x, y: anchor.y } });
    }
  }, [initialSelection, indoorNodes, indoorEdges, getSelectionItem, zoomToFit, locateFocusedRef]);

  const updateLabel = useCallback((id: string, changes: Partial<FloorLabel>) => {
    const current = labels.find((label) => label.id === id);
    if (!current) return;
    const next = constrainLabelToFloor({ ...current, ...changes }, FP_W, FP_H);
    updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels.map((label) => label.id === id ? next : label));
  }, [FP_W, FP_H, rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, updFloor]);

  const beginInlineLabelEdit = useCallback((label: FloorLabel, options?: { isolate?: boolean }) => {
    if (label.locked) return;
    if (multiSelected.length > 1 && !options?.isolate) return;
    skipNextInlineCommitRef.current = false;
    inlineLabelBlurReadyRef.current = false;
    window.setTimeout(() => { inlineLabelBlurReadyRef.current = true; }, 0);
    setMultiSelected([]);
    selectFloorItem({ type: "label", id: label.id });
    setInlineLabelEdit({ id: label.id, value: label.text, original: label.text });
  }, [multiSelected.length, selectFloorItem]);

  const commitInlineLabelEdit = useCallback(() => {
    if (!inlineLabelEdit) return;
    if (skipNextInlineCommitRef.current) {
      skipNextInlineCommitRef.current = false;
      return;
    }
    const nextValue = inlineLabelEdit.value.trim().length > 0 ? inlineLabelEdit.value : "Label";
    if (nextValue !== inlineLabelEdit.original) {
      updateLabel(inlineLabelEdit.id, { text: nextValue });
    }
    setInlineLabelEdit(null);
  }, [inlineLabelEdit, updateLabel]);

  const cancelInlineLabelEdit = useCallback(() => {
    skipNextInlineCommitRef.current = true;
    setInlineLabelEdit(null);
  }, []);

  // Switching tools abandons any in-progress wall draw / snap feedback so the
  // transient snap indicator never stays behind as stale decoration.
  const switchTool = useCallback((next: SimpleTool) => {
    if (next === "measure" && (!ADVANCED_FLOOR_REFERENCE_ENABLED || !calibratedMetersPerUnit)) {
      toast.info("Calibrate floor scale first", "Measure uses the calibrated floor scale and will not fake meters.");
      return;
    }
    setTool(next);
    // A physical placement gesture belongs to the tool that armed it. Clear
    // stale placement state before another tool can receive a canvas click.
    setRoomDrag(null);
    alignmentSnapLocksRef.current = { x: null, y: null };
    clearRoomDoorLinkState();
    setRoomDoorInspectorHoverId(null);
    setTestRoutePickKind(null);
    setTestRoutePickHover(null);
    setTestRouteMapPick(null);
    // Selecting a physical floor tool gives pointer ownership back to the
    // floor canvas while the navigation overlay remains visible.
    setNavTool("select");
    setNavConnectStart(null);
    setNavPreview(null);
    setNavConnectBends([]);
    navConnectBendGroupsRef.current = [];
    setWallStart(null);
    setWallPreview(null);
    setWallSnapIndicator(null);
    setOpeningPreview(null);
    setDP([]);
    if (next !== "measure") setMeasureDraft({});
    setShowMoreTools(false);
  }, [calibratedMetersPerUnit, clearRoomDoorLinkState, toast]);

  const selectionsFromIds = useCallback((ids: string[]) =>
    ids.map((id) => selectionForId(id)).filter((value): value is FloorSelection => !!value),
  [selectionForId]);

  const selectedContextState = useMemo(() => {
    const selections = multiSelected.length > 1 ? selectionsFromIds(multiSelected) : selected ? [selected] : [];
    const items = selections.map((selection) => getSelectionItem(selection.type, selection.id)).filter(Boolean) as any[];
    return {
      locked: items.length > 0 && items.every((item) => item.locked === true),
      hidden: items.length > 0 && items.every((item) => item.visible === false),
    };
  }, [getSelectionItem, multiSelected, selected, selectionsFromIds]);

  const anchoredRoomUpdate = useCallback((nextRooms: FloorRoom[], nextWalls: FloorWall[], changedRoomIds: Set<string>, skipWallIds = new Set<string>()) => {
    if (changedRoomIds.size === 0) return { blocked: false, walls: nextWalls };
    if (lockedWallsAffectedByRoomAnchors(nextRooms, nextWalls, changedRoomIds, skipWallIds)) {
      toast.info("Locked attached wall", "Unlock attached walls before transforming this room.");
      return { blocked: true, walls: nextWalls };
    }
    return {
      blocked: false,
      walls: applyRoomAnchorsToWalls(nextRooms, nextWalls, changedRoomIds, skipWallIds),
    };
  }, [toast]);

  const applyTransformedEntries = useCallback((entries: { type: FloorSelection["type"]; id: string; item: any }[]) => {
    const byId = new Map(entries.map((entry) => [entry.id, entry.item]));
    const changedRoomIds = new Set(entries.filter((entry) => entry.type === "room").map((entry) => entry.id));
    const transformedWallIds = new Set(entries.filter((entry) => entry.type === "wall").map((entry) => entry.id));
    const nextRooms = rooms.map((r) => byId.get(r.id) ?? r);
    let nextWalls = walls.map((w) => {
      const transformed = byId.get(w.id) as FloorWall | undefined;
      if (!transformed) return w;
      const startAnchor = transformed.startAnchor && changedRoomIds.has(transformed.startAnchor.roomId) ? transformed.startAnchor : undefined;
      const endAnchor = transformed.endAnchor && changedRoomIds.has(transformed.endAnchor.roomId) ? transformed.endAnchor : undefined;
      return { ...transformed, startAnchor, endAnchor };
    });
    const anchored = anchoredRoomUpdate(nextRooms, nextWalls, changedRoomIds, transformedWallIds);
    if (anchored.blocked) return false;
    nextWalls = anchored.walls;
    updFloor(
      nextRooms,
      fpaths,
      nextWalls,
      doors.map((d) => byId.get(d.id) ?? d),
      windows.map((w) => byId.get(w.id) ?? w),
      furniture.map((f) => byId.get(f.id) ?? f),
      stairs.map((s) => byId.get(s.id) ?? s),
      elevators.map((el) => byId.get(el.id) ?? el),
      labels.map((lb) => byId.get(lb.id) ?? lb),
      ramps.map((rp) => byId.get(rp.id) ?? rp)
    );
    return true;
  }, [rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps, updFloor, anchoredRoomUpdate]);

  const applySelectionChanges = useCallback((selections: FloorSelection[], change: (item: any, selection: FloorSelection) => any) => {
    const byId = new Map<string, any>();
    selections.forEach((selection) => {
      const item = getSelectionItem(selection.type, selection.id);
      if (item) byId.set(selection.id, change(item, selection));
    });
    if (byId.size === 0) return;
    updFloor(
      rooms.map((r) => byId.get(r.id) ?? r),
      fpaths,
      walls.map((w) => byId.get(w.id) ?? w),
      doors.map((d) => byId.get(d.id) ?? d),
      windows.map((w) => byId.get(w.id) ?? w),
      furniture.map((f) => byId.get(f.id) ?? f),
      stairs.map((s) => byId.get(s.id) ?? s),
      elevators.map((el) => byId.get(el.id) ?? el),
      labels.map((lb) => byId.get(lb.id) ?? lb),
      ramps.map((rp) => byId.get(rp.id) ?? rp)
    );
  }, [getSelectionItem, rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps, updFloor]);

  const selectionScope = useCallback((selection: FloorSelection | null = selected) => {
    const groupSelections = multiSelected.length > 1 ? selectionsFromIds(multiSelected) : [];
    if (groupSelections.length > 1 && (!selection || groupSelections.some((item) => item.id === selection.id))) return groupSelections;
    return selection ? [selection] : [];
  }, [multiSelected, selected, selectionsFromIds]);

  const setSelectionState = useCallback((selection: FloorSelection | null, changes: { visible?: boolean; locked?: boolean }) => {
    const scope = selectionScope(selection);
    applySelectionChanges(scope, (item) => ({ ...item, ...changes }));
  }, [applySelectionChanges, selectionScope]);

  const applyLayerAction = useCallback((selection: FloorSelection | null, action: LayerAction) => {
    const scope = selectionScope(selection).filter((item) => item.type !== "path");
    if (scope.length === 0) return;
    const selectedKeys = new Set(scope.map((item) => `${item.type}:${item.id}`));
    const entries = [
      ...rooms.map((item) => ({ type: "room" as const, item })),
      ...walls.map((item) => ({ type: "wall" as const, item })),
      ...doors.map((item) => ({ type: "door" as const, item })),
      ...windows.map((item) => ({ type: "window" as const, item })),
      ...furniture.map((item) => ({ type: "furniture" as const, item })),
      ...stairs.map((item) => ({ type: "stairs" as const, item })),
      ...elevators.map((item) => ({ type: "elevator" as const, item })),
      ...labels.map((item) => ({ type: "label" as const, item })),
      ...ramps.map((item) => ({ type: "ramp" as const, item })),
    ].sort((a, b) => (a.item.zOrder ?? 0) - (b.item.zOrder ?? 0) || `${a.type}:${a.item.id}`.localeCompare(`${b.type}:${b.item.id}`));
    const normalized = entries.map((entry, index) => ({ ...entry, item: { ...entry.item, zOrder: index } }));
    const next = [...normalized];
    if (action === "bring-front" || action === "send-back") {
      const selectedEntries = normalized.filter((entry) => selectedKeys.has(`${entry.type}:${entry.item.id}`));
      const rest = normalized.filter((entry) => !selectedKeys.has(`${entry.type}:${entry.item.id}`));
      next.splice(0, next.length, ...(action === "bring-front" ? [...rest, ...selectedEntries] : [...selectedEntries, ...rest]));
    } else if (action === "bring-forward") {
      for (let i = next.length - 2; i >= 0; i -= 1) {
        const key = `${next[i].type}:${next[i].item.id}`;
        const nextKey = `${next[i + 1].type}:${next[i + 1].item.id}`;
        if (selectedKeys.has(key) && !selectedKeys.has(nextKey)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    } else {
      for (let i = 1; i < next.length; i += 1) {
        const key = `${next[i].type}:${next[i].item.id}`;
        const previousKey = `${next[i - 1].type}:${next[i - 1].item.id}`;
        if (selectedKeys.has(key) && !selectedKeys.has(previousKey)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
    const keyed = new Map(next.map((entry, index) => [`${entry.type}:${entry.item.id}`, { ...entry.item, zOrder: index }]));
    const changed = normalized.some((entry) => {
      const nextItem = keyed.get(`${entry.type}:${entry.item.id}`);
      return nextItem && nextItem.zOrder !== entry.item.zOrder;
    });
    if (!changed) return;
    const applyZ = <T extends { id: string; zOrder?: number }>(items: T[], type: FloorSelection["type"]) =>
      items.map((item) => (keyed.get(`${type}:${item.id}`) as T | undefined) ?? item);
    pushHistory({
      ...floorUndoEntryFromFloor({
        ...floor,
        rooms,
        paths: fpaths,
        walls,
        doors,
        windows,
        furniture,
        stairs,
        elevators,
        labels,
        ramps,
      }),
      navNodes: indoorNodes,
      navEdges: indoorEdges,
    });
    updFloor(
      applyZ(rooms, "room"),
      fpaths,
      applyZ(walls, "wall"),
      applyZ(doors, "door"),
      applyZ(windows, "window"),
      applyZ(furniture, "furniture"),
      applyZ(stairs, "stairs"),
      applyZ(elevators, "elevator"),
      applyZ(labels, "label"),
      applyZ(ramps, "ramp")
    );
  }, [selectionScope, rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps, pushHistory, floor, indoorNodes, indoorEdges, updFloor]);

  const deleteSelections = useCallback((selections: FloorSelection[]) => {
    if (selections.length === 0) return;
    if (selections.some((selection) => isSelectionLocked(selection))) {
      toast.info("Locked selection", "Unlock locked floor objects before deleting them.");
      return;
    }
    const idsByType = new Map<FloorSelection["type"], Set<string>>();
    for (const selection of selections) {
      const ids = idsByType.get(selection.type) ?? new Set<string>();
      ids.add(selection.id);
      idsByType.set(selection.type, ids);
    }
    const has = (type: FloorSelection["type"], id: string) => idsByType.get(type)?.has(id) ?? false;
    const deletedRoomIds = idsByType.get("room") ?? new Set<string>();
    const deletedWallIds = idsByType.get("wall") ?? new Set<string>();
    updFloor(
      rooms.filter((r) => !has("room", r.id)),
      fpaths.filter((p) => !has("path", p.id)),
      walls.filter((w) => !has("wall", w.id)).map((w) => clearWallRoomAnchors(w, deletedRoomIds)),
      doors.filter((d) => !has("door", d.id) && !(d.wallId && deletedWallIds.has(d.wallId))),
      windows.filter((w) => !has("window", w.id) && !(w.wallId && deletedWallIds.has(w.wallId))),
      furniture.filter((f) => !has("furniture", f.id)),
      stairs.filter((s) => !has("stairs", s.id)),
      elevators.filter((e) => !has("elevator", e.id)),
      labels.filter((l) => !has("label", l.id)),
      ramps.filter((r) => !has("ramp", r.id))
    );
    setSelected(null);
    setMultiSelected([]);
    setShowProperties(true);
  }, [rooms, fpaths, walls, doors, windows, furniture, stairs, ramps, elevators, labels, updFloor, isSelectionLocked, toast]);

  const deleteSelection = useCallback((selection: FloorSelection | null = selected) => {
    const groupSelections = multiSelected.length > 1 ? selectionsFromIds(multiSelected) : [];
    if (groupSelections.length > 1 && (!selection || groupSelections.some((item) => item.id === selection.id))) {
      deleteSelections(groupSelections);
      return;
    }
    if (selection) deleteSelections([selection]);
  }, [selected, multiSelected, selectionsFromIds, deleteSelections]);

  /**
   * B5 Phase 2.1: shared duplication core used by Ctrl+D and Ctrl+V paste.
   * Copies the given entries with fresh IDs, relationship remapping (room→wall
   * anchors, wall→attached doors/windows), a clamped offset, and ONE history
   * action. Returns the copied object ids.
   */
  const duplicateEntrySet = useCallback((
    entries: { type: Exclude<FloorSelection["type"], "navNode" | "navEdge">; id: string; item: any }[],
    offset: number,
    options: { resetCirculationIdentity?: boolean } = {},
  ): string[] => {
    if (entries.length === 0) return [];
    if (entries.some((entry) => isSelectionLocked({ type: entry.type, id: entry.id }))) {
      toast.info("Locked selection", "Unlock locked floor objects before duplicating them.");
      return [];
    }
    const valid = entries.filter((entry) => entry.item && entry.type !== "path");
    const bounds = valid
      .map((entry) => itemBounds(entry.type, entry.item))
      .filter((value): value is NonNullable<typeof value> => !!value);
    const delta = visibleDuplicateDelta(bounds, offset, FP_W, FP_H);
    const nextRooms = [...rooms];
    const nextWalls = [...walls];
    const nextDoors = [...doors];
    const nextWindows = [...windows];
    const nextFurniture = [...furniture];
    const nextStairs = [...stairs];
    const nextRamps = [...ramps];
    const nextElevators = [...elevators];
    const nextLabels = [...labels];
    const nextIds: string[] = [];
    const duplicatedRoomIds = new Map(valid.filter((entry) => entry.type === "room").map((entry) => [entry.id, genId("rm")]));
    const duplicatedWallIds = new Map(valid.filter((entry) => entry.type === "wall").map((entry) => [entry.id, genId("wl")]));
    for (const entry of valid) {
      if (entry.type === "room") {
        const sourceRoom = entry.item as FloorRoom;
        const copy = translateFloorItem("room", {
          ...sourceRoom,
          id: duplicatedRoomIds.get(entry.id) ?? genId("rm"),
          name: nextRoomName(nextRooms, sourceRoom.name),
          ...(options.resetCirculationIdentity ? {
            buildingId,
            floorId,
            navConnection: undefined,
            accessNodeId: undefined,
            accessDoorId: undefined,
            accessDoorIds: undefined,
          } : {}),
        }, delta.dx, delta.dy, FP_W, FP_H) as FloorRoom;
        nextRooms.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "wall") {
        const source = entry.item as FloorWall;
        const startAnchor = source.startAnchor && duplicatedRoomIds.has(source.startAnchor.roomId)
          ? { ...source.startAnchor, roomId: duplicatedRoomIds.get(source.startAnchor.roomId)! }
          : options.resetCirculationIdentity ? undefined : source.startAnchor;
        const endAnchor = source.endAnchor && duplicatedRoomIds.has(source.endAnchor.roomId)
          ? { ...source.endAnchor, roomId: duplicatedRoomIds.get(source.endAnchor.roomId)! }
          : options.resetCirculationIdentity ? undefined : source.endAnchor;
        const copy = translateFloorItem("wall", { ...source, id: duplicatedWallIds.get(entry.id) ?? genId("wl"), startAnchor, endAnchor }, delta.dx, delta.dy, FP_W, FP_H) as FloorWall;
        nextWalls.push(copy); nextIds.push(copy.id);
        // Attached openings are part of the copied wall composition on both
        // same-floor duplicates and cross-floor pastes.  Cross-floor copies
        // intentionally reset navigation identity elsewhere, but must not
        // lose the authored Door/Window geometry.
        doors.filter((door) => door.wallId === source.id).forEach((door) => {
          const doorCopy = syncOpeningsToWalls([{ ...door, id: genId("dr"), wallId: copy.id }], [], [copy]).doors[0];
          nextDoors.push(doorCopy);
          nextIds.push(doorCopy.id);
        });
        windows.filter((win) => win.wallId === source.id).forEach((win) => {
          const winCopy = syncOpeningsToWalls([], [{ ...win, id: genId("wn"), wallId: copy.id }], [copy]).windows[0];
          nextWindows.push(winCopy);
          nextIds.push(winCopy.id);
        });
      } else if (entry.type === "door") {
        if ((entry.item as FloorDoor).wallId && duplicatedWallIds.has((entry.item as FloorDoor).wallId!)) continue;
        const sourceDoor = entry.item as FloorDoor;
        const copy = translateFloorItem("door", { ...sourceDoor, id: genId("dr"), wallId: duplicatedWallIds.get(sourceDoor.wallId ?? "") ?? (options.resetCirculationIdentity ? undefined : sourceDoor.wallId) }, delta.dx, delta.dy, FP_W, FP_H) as FloorDoor;
        nextDoors.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "window") {
        if ((entry.item as FloorWindow).wallId && duplicatedWallIds.has((entry.item as FloorWindow).wallId!)) continue;
        const sourceWindow = entry.item as FloorWindow;
        const copy = translateFloorItem("window", { ...sourceWindow, id: genId("wn"), wallId: duplicatedWallIds.get(sourceWindow.wallId ?? "") ?? (options.resetCirculationIdentity ? undefined : sourceWindow.wallId) }, delta.dx, delta.dy, FP_W, FP_H) as FloorWindow;
        nextWindows.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "furniture") {
        const copy = translateFloorItem("furniture", { ...(entry.item as FloorFurniture), id: genId("fn"), name: `${(entry.item as FloorFurniture).name} Copy` }, delta.dx, delta.dy, FP_W, FP_H) as FloorFurniture;
        nextFurniture.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "stairs") {
        const source = entry.item as FloorStairs;
        const copy = translateFloorItem("stairs", {
          ...source,
          ...(options.resetCirculationIdentity ? { sharedId: undefined } : {}),
          id: genId("st"),
        }, delta.dx, delta.dy, FP_W, FP_H) as FloorStairs;
        nextStairs.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "ramp") {
        const copy = translateFloorItem("ramp", { ...(entry.item as FloorRamp), id: genId("rmp") }, delta.dx, delta.dy, FP_W, FP_H) as FloorRamp;
        nextRamps.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "elevator") {
        const source = entry.item as FloorElevatorItem;
        const copy = translateFloorItem("elevator", {
          ...source,
          label: nextElevatorName(nextElevators, source.label),
          // A duplicate is a new physical occurrence.  Give it a fresh
          // floor-local system number even when the source uses a custom
          // display label.  It must never inherit the source shaft identity:
          // one floor can contain only one occurrence per physical shaft.
          systemNumber: nextElevatorSystemNumber(nextElevators),
          sharedId: undefined,
          floors: undefined,
          id: genId("ev"),
        }, delta.dx, delta.dy, FP_W, FP_H) as FloorElevatorItem;
        nextElevators.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "label") {
        const copy = translateFloorItem("label", { ...(entry.item as FloorLabel), id: genId("lb"), text: `${(entry.item as FloorLabel).text} Copy` }, delta.dx, delta.dy, FP_W, FP_H) as FloorLabel;
        nextLabels.push(copy); nextIds.push(copy.id);
      }
    }
    updFloor(nextRooms, fpaths, nextWalls, nextDoors, nextWindows, nextFurniture, nextStairs, nextElevators, nextLabels, nextRamps);
    setSelected(null);
    setMultiSelected(nextIds);
    setShowProperties(true);
    return nextIds;
  }, [rooms, fpaths, walls, doors, windows, furniture, stairs, ramps, elevators, labels, FP_W, FP_H, updFloor, isSelectionLocked, itemBounds, constrainDeltaForBounds, toast]);

  const duplicateSelection = useCallback((selection: FloorSelection | null = selected) => {
    const groupSelections = multiSelected.length > 1 ? selectionsFromIds(multiSelected) : [];
    if (groupSelections.length > 1 && (!selection || groupSelections.some((item) => item.id === selection.id))) {
      const entries = groupSelections
        .map((value) => ({ ...value, item: structuredClone(getSelectionItem(value.type, value.id)) }))
        .filter((entry) => entry.item);
      duplicateEntrySet(entries, 12);
      return;
    }
    if (!selection) return;
    if (isSelectionLocked(selection)) {
      toast.info("Locked object", "Unlock this floor object before duplicating it.");
      return;
    }
    const item = getSelectionItem(selection.type, selection.id);
    if (!item) return;
    const offset = 12;
    if (selection.type === "room") {
      const sourceRoom = item as FloorRoom;
      const sourceBounds = itemBounds("room", sourceRoom);
      const delta = sourceBounds ? visibleDuplicateDelta([sourceBounds], offset, FP_W, FP_H) : { dx: offset, dy: offset };
      const copy = translateFloorItem("room", { ...sourceRoom, id: genId("rm"), name: nextRoomName(rooms, sourceRoom.name) }, delta.dx, delta.dy, FP_W, FP_H) as FloorRoom;
      updFloor([...rooms, copy], fpaths);
      selectFloorItem({ type: "room", id: copy.id });
    } else if (selection.type === "wall") {
      const copy = translateFloorItem("wall", { ...(item as FloorWall), id: genId("wl"), startAnchor: undefined, endAnchor: undefined }, offset, offset, FP_W, FP_H) as FloorWall;
      const copiedDoors = doors
        .filter((door) => door.wallId === (item as FloorWall).id)
        .map((door) => syncOpeningsToWalls([{ ...door, id: genId("dr"), wallId: copy.id }], [], [copy]).doors[0]);
      const copiedWindows = windows
        .filter((win) => win.wallId === (item as FloorWall).id)
        .map((win) => syncOpeningsToWalls([], [{ ...win, id: genId("wn"), wallId: copy.id }], [copy]).windows[0]);
      updFloor(rooms, fpaths, [...walls, copy], [...doors, ...copiedDoors], [...windows, ...copiedWindows]);
      selectFloorItem({ type: "wall", id: copy.id });
    } else if (selection.type === "door") {
      const copy = translateFloorItem("door", { ...(item as FloorDoor), id: genId("dr") }, offset, offset, FP_W, FP_H) as FloorDoor;
      updFloor(rooms, fpaths, walls, [...doors, copy]);
      selectFloorItem({ type: "door", id: copy.id });
    } else if (selection.type === "window") {
      const copy = translateFloorItem("window", { ...(item as FloorWindow), id: genId("wn") }, offset, offset, FP_W, FP_H) as FloorWindow;
      updFloor(rooms, fpaths, walls, doors, [...windows, copy]);
      selectFloorItem({ type: "window", id: copy.id });
    } else if (selection.type === "furniture") {
      const copy = translateFloorItem("furniture", { ...(item as FloorFurniture), id: genId("fn"), name: `${(item as FloorFurniture).name} Copy` }, offset, offset, FP_W, FP_H) as FloorFurniture;
      updFloor(rooms, fpaths, walls, doors, windows, [...furniture, copy]);
      selectFloorItem({ type: "furniture", id: copy.id });
    } else if (selection.type === "stairs") {
      const copy = translateFloorItem("stairs", { ...(item as FloorStairs), id: genId("st") }, offset, offset, FP_W, FP_H) as FloorStairs;
      updFloor(rooms, fpaths, walls, doors, windows, furniture, [...stairs, copy]);
      selectFloorItem({ type: "stairs", id: copy.id });
    } else if (selection.type === "ramp") {
      const copy = translateFloorItem("ramp", { ...(item as FloorRamp), id: genId("rmp") }, offset, offset, FP_W, FP_H) as FloorRamp;
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, [...ramps, copy]);
      selectFloorItem({ type: "ramp", id: copy.id });
    } else if (selection.type === "elevator") {
      const sourceElevator = item as FloorElevatorItem;
      const copy = translateFloorItem("elevator", {
        ...sourceElevator,
        id: genId("ev"),
        label: nextElevatorName(elevators, sourceElevator.label),
        systemNumber: nextElevatorSystemNumber(elevators),
        // A duplicated Elevator is a new physical shaft occurrence, never a
        // second occurrence of the source shaft on this Floor.
        sharedId: undefined,
        floors: undefined,
      }, offset, offset, FP_W, FP_H) as FloorElevatorItem;
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, [...elevators, copy]);
      selectFloorItem({ type: "elevator", id: copy.id });
    } else if (selection.type === "label") {
      const copy = translateFloorItem("label", { ...(item as FloorLabel), id: genId("lb"), text: `${(item as FloorLabel).text} Copy` }, offset, offset, FP_W, FP_H) as FloorLabel;
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, [...labels, copy]);
      selectFloorItem({ type: "label", id: copy.id });
    } else if (selection.type === "path") {
      const copy = {
        ...(item as FloorPath),
        id: genId("fp"),
        points: (item as FloorPath).points.map((point) => snapPointToFloorBounds({ x: point.x + offset, y: point.y + offset }, FP_W, FP_H, 0)),
      };
      updFloor(rooms, [...fpaths, copy]);
      selectFloorItem({ type: "path", id: copy.id });
    }
  }, [selected, multiSelected, selectionsFromIds, getSelectionItem, FP_W, FP_H, rooms, fpaths, walls, doors, windows, furniture, stairs, ramps, elevators, labels, updFloor, selectFloorItem, isSelectionLocked, toast]);

  // ── B5 Phase 2.1: Design copy / paste (Ctrl+C / Ctrl+V) ────────────────────

  const copySelection = useCallback(() => {
    const selections: FloorSelection[] = [];
    if (multiSelected.length > 1) {
      for (const id of multiSelected) {
        const sel = selectionForId(id);
        if (sel) selections.push(sel);
      }
    } else if (selected) {
      selections.push(selected);
    }
    const entries = selections
      .filter((sel): sel is Exclude<FloorSelection, { type: "navNode" | "navEdge" }> => sel.type !== "navNode" && sel.type !== "navEdge")
      .map((sel) => {
        const item = getSelectionItem(sel.type, sel.id);
        return item ? { type: sel.type, id: sel.id, item: structuredClone(item) } : null;
      })
      .filter((entry): entry is FloorClipboardEntry => !!entry);
    // Include openings attached to copied walls so a cross-floor paste keeps
    // the authored wall/door/window composition without carrying source-wall
    // references into the destination floor.
    const copiedWallIds = new Set(entries.filter((entry) => entry.type === "wall").map((entry) => entry.id));
    for (const opening of [...doors, ...windows]) {
      if (!opening.wallId || !copiedWallIds.has(opening.wallId) || entries.some((entry) => entry.id === opening.id)) continue;
      const type = "direction" in opening ? "door" : "window";
      entries.push({ type, id: opening.id, item: structuredClone(opening) } as FloorClipboardEntry);
    }
    if (entries.length === 0) {
      toast.info("Nothing to copy", "Select a floor object first (Ctrl+C).");
      return;
    }
    const nextClipboard: FloorClipboard = { campusId: campus.id, sourceFloorId: floorId, entries };
    floorObjectClipboard = nextClipboard;
    setClipboard(nextClipboard);
    pasteOffsetRef.current = 12;
    toast.success("Copied", `${entries.length} object${entries.length !== 1 ? "s" : ""} copied (Ctrl+V to paste).`);
  }, [campus.id, floorId, getSelectionItem, multiSelected, selected, selectionForId, toast]);

  const pasteSelection = useCallback(() => {
    const sourceClipboard = floorObjectClipboard ?? clipboard;
    if (!sourceClipboard || sourceClipboard.campusId !== campus.id || sourceClipboard.entries.length === 0) {
      toast.info("Nothing to paste", "Copy a floor object first (Ctrl+C).");
      return;
    }
    const crossFloor = sourceClipboard.sourceFloorId !== floorId;
    const nextIds = duplicateEntrySet(sourceClipboard.entries, pasteOffsetRef.current, {
      resetCirculationIdentity: crossFloor,
    });
    pasteOffsetRef.current += 12;
    if (nextIds.length === 1) {
      // Single paste feels like the single-item duplicate: select the copy directly.
      setMultiSelected([]);
      setSelected({ type: sourceClipboard.entries[0].type, id: nextIds[0] });
    }
    toast.success("Pasted", `${nextIds.length} object${nextIds.length !== 1 ? "s" : ""} pasted with fresh IDs.`);
  }, [campus.id, clipboard, duplicateEntrySet, floorId, toast]);

  // Wall connection snapping priority (verified in Phase 1.7):
  //   1. existing wall endpoint   (exact coordinates)
  //   2. valid nearby wall segment (closest point on segment)
  //   3. room corners
  //   4. room edges
  //   5. floor boundary (x=0 / x=width / y=0 / y=height)
  //   6. grid/angle snap (applied by callers before invoking these helpers)
  // The wall candidates are measured from the RAW point so endpoint/segment
  // snapping always beats boundary snapping instead of the two fighting.
  const findWallSnapTarget = useCallback((point: { x: number; y: number }, ignoreWallId?: string) => {
    let bestEndpoint: { x: number; y: number; d: number } | null = null;
    let bestIntersection: { x: number; y: number; d: number; roomAnchor?: FloorWallEndpointAnchor } | null = null;
    let bestSegment: { x: number; y: number; d: number } | null = null;
    let bestRoomCorner: { x: number; y: number; d: number; roomAnchor: FloorWallEndpointAnchor } | null = null;
    let bestRoomEdge: { x: number; y: number; d: number; edge: { x1: number; y1: number; x2: number; y2: number }; roomAnchor: FloorWallEndpointAnchor } | null = null;
    for (const wall of walls) {
      if (wall.id === ignoreWallId) continue;
      for (const endpoint of [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]) {
        const d = dist(point.x, point.y, endpoint.x, endpoint.y);
        if (d <= SNAP_THRESHOLD && (!bestEndpoint || d < bestEndpoint.d)) bestEndpoint = { ...endpoint, d };
      }
      const segmentPoint = nearestPointOnSegment(point, wall);
      const segmentDist = dist(point.x, point.y, segmentPoint.x, segmentPoint.y);
      if (segmentDist <= SNAP_THRESHOLD && (!bestSegment || segmentDist < bestSegment.d)) {
        // Keep the EXACT on-segment coordinates — rounding here pushed a
        // snapped endpoint a few pixels off a diagonal wall's centerline and
        // produced visible 2–5px connection gaps.
        bestSegment = { x: segmentPoint.x, y: segmentPoint.y, d: segmentDist };
      }
    }
    for (const room of rooms) {
      if (room.visible === false) continue;
      const roomSegments = roomGuideSegments(room);
      for (const roomSegment of roomSegments) {
        for (const wall of walls) {
          if (wall.id === ignoreWallId) continue;
          const intersection = segmentIntersectionPoint(wall, roomSegment);
          if (!intersection) continue;
          const d = dist(point.x, point.y, intersection.x, intersection.y);
          if (d > SNAP_THRESHOLD || (bestIntersection && d >= bestIntersection.d)) continue;
          const anchor = roomAnchorAtPoint(room, intersection, 0.75)?.anchor
            ?? roomAnchorAtPoint(room, intersection, SNAP_THRESHOLD)?.anchor;
          bestIntersection = { ...intersection, d, roomAnchor: anchor };
        }
      }
      const roomAnchor = roomAnchorAtPoint(room, point, SNAP_THRESHOLD);
      if (!roomAnchor) continue;
      if (roomAnchor.anchor.offset === 0 || roomAnchor.anchor.offset === 1) {
        if (!bestRoomCorner || roomAnchor.d < bestRoomCorner.d) bestRoomCorner = { ...roomAnchor, roomAnchor: roomAnchor.anchor };
      } else {
        const edge = roomGuideSegments(room).find((segment) => segment.edge === roomAnchor.anchor.edge)!;
        if (!bestRoomEdge || roomAnchor.d < bestRoomEdge.d) bestRoomEdge = { ...roomAnchor, edge, roomAnchor: roomAnchor.anchor };
      }
    }
    return bestEndpoint ?? bestIntersection ?? bestSegment ?? bestRoomCorner ?? bestRoomEdge ?? null;
  }, [walls, rooms]);

  const snapFloorPoint = useCallback((point: { x: number; y: number }, ignoreWallId?: string) => {
    const wallSnap = findWallSnapTarget(point, ignoreWallId);
    if (wallSnap) return { x: wallSnap.x, y: wallSnap.y };
    return snapPointToFloorBounds(point, FP_W, FP_H, SNAP_THRESHOLD);
  }, [FP_W, FP_H, findWallSnapTarget]);

  const findSnapIndicator = useCallback((point: { x: number; y: number }, ignoreWallId?: string) => {
    const wallSnap = findWallSnapTarget(point, ignoreWallId);
    if (wallSnap) return { x: wallSnap.x, y: wallSnap.y };
    const boundarySnap = snapPointToFloorBounds(point, FP_W, FP_H, SNAP_THRESHOLD);
    return boundarySnap.x !== Math.round(point.x) || boundarySnap.y !== Math.round(point.y) ? boundarySnap : null;
  }, [FP_W, FP_H, findWallSnapTarget]);

  // Resolve an endpoint that is simultaneously axis-aligned with its fixed
  // endpoint and attached to another wall. Structural snapping used to win
  // first, which made the straight guide disappear at the junction.
  const findAxisWallAttachment = useCallback((
    raw: { x: number; y: number },
    fixed: { x: number; y: number },
    axis: "h" | "v",
    ignoreWallId?: string,
  ): WallSnapTarget | null => {
    if (!snapOn) return null;
    let best: (WallSnapTarget & { d: number }) | null = null;
    for (const wall of walls) {
      if (wall.id === ignoreWallId) continue;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const denominator = axis === "h" ? dy : dx;
      if (Math.abs(denominator) < 1e-6) {
        for (const point of [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]) {
          if ((axis === "h" ? Math.abs(point.y - fixed.y) : Math.abs(point.x - fixed.x)) > 1) continue;
          const d = Math.hypot(raw.x - point.x, raw.y - point.y);
          if (d <= SNAP_THRESHOLD * 1.5 && (!best || d < best.d)) best = { ...point, guide: axis, d };
        }
        continue;
      }
      const t = axis === "h" ? (fixed.y - wall.y1) / dy : (fixed.x - wall.x1) / dx;
      if (t < -1e-6 || t > 1 + 1e-6) continue;
      const point = { x: wall.x1 + dx * t, y: wall.y1 + dy * t };
      const d = Math.hypot(raw.x - point.x, raw.y - point.y);
      if (d <= SNAP_THRESHOLD * 1.5 && (!best || d < best.d)) best = { ...point, guide: axis, d };
    }
    return best;
  }, [snapOn, walls]);

  // Structural wall snapping is resolved from the RAW pointer FIRST (endpoint →
  // segment → boundary). A stronger structural target always beats grid/angle
  // assistance and is never moved away from afterwards — the exact coordinate
  // becomes the committed geometry, so visually connected walls truly meet with
  // no 2–5px stroke/rounding gaps.
  const wallDrawCursor = useCallback((raw: { x: number; y: number }, shiftHeld: boolean) => {
    if (!shiftHeld && wallStart) {
      const axis: "h" | "v" | undefined = snapOn && Math.abs(raw.y - wallStart.y) <= SNAP_THRESHOLD
        ? "h"
        : snapOn && Math.abs(raw.x - wallStart.x) <= SNAP_THRESHOLD
          ? "v"
          : undefined;
      if (axis) {
        const combined = findAxisWallAttachment(raw, wallStart, axis);
        if (combined) return { point: combined, indicator: combined };
      }
    }
    const structural = findWallSnapTarget(raw);
    if (structural) {
      const guide = !shiftHeld && wallStart && snapOn
        ? Math.abs(structural.y - wallStart.y) <= 1 ? "h" as const
          : Math.abs(structural.x - wallStart.x) <= 1 ? "v" as const : undefined
        : undefined;
      return { point: structural, indicator: { ...structural, ...(guide ? { guide } : {}) } };
    }
    const s = (v: number) => (snapOn ? snapToGrid(v, floorGridSize) : Math.round(v));
    let ex = s(raw.x);
    let ey = s(raw.y);
    // 45° angle assistance while drawing (Shift held = free drawing)
    if (!shiftHeld && wallStart) {
      const dx = ex - wallStart.x;
      const dy = ey - wallStart.y;
      if (snapOn && Math.abs(dx) <= SNAP_THRESHOLD) {
        ex = wallStart.x;
      } else if (snapOn && Math.abs(dy) <= SNAP_THRESHOLD) {
        ey = wallStart.y;
      } else {
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const snappedAngle = snapAngleDeg(angle, WALL_SNAP_ANGLE);
        const len = Math.sqrt(dx * dx + dy * dy);
        ex = wallStart.x + Math.cos(snappedAngle * (Math.PI / 180)) * len;
        ey = wallStart.y + Math.sin(snappedAngle * (Math.PI / 180)) * len;
      }
    }
    const bounded = { x: clamp(ex, 0, FP_W), y: clamp(ey, 0, FP_H) };
    const guide = !shiftHeld && wallStart
      ? Math.abs(raw.y - wallStart.y) <= SNAP_THRESHOLD ? "h" as const
        : Math.abs(raw.x - wallStart.x) <= SNAP_THRESHOLD ? "v" as const
          : undefined
      : undefined;
    const snapIndicator = findSnapIndicator(bounded);
    return {
      point: snapPointToFloorBounds(bounded, FP_W, FP_H, SNAP_THRESHOLD),
      indicator: guide ? { ...(snapIndicator ?? bounded), guide } : snapIndicator,
    };
  }, [FP_W, FP_H, findWallSnapTarget, findAxisWallAttachment, findSnapIndicator, snapOn, floorGridSize, wallStart]);

  // Wall-start placement: structural → grid (coarse) → boundary. No angle pivot yet.
  const wallStartCursor = useCallback((raw: { x: number; y: number }) => {
    const structural = findWallSnapTarget(raw);
    if (structural) return { point: structural, indicator: { x: structural.x, y: structural.y } };
    const s = (v: number) => (snapOn ? snapToGrid(v, floorGridSize) : Math.round(v));
    const bounded = { x: clamp(s(raw.x), 0, FP_W), y: clamp(s(raw.y), 0, FP_H) };
    return { point: snapPointToFloorBounds(bounded, FP_W, FP_H, SNAP_THRESHOLD), indicator: findSnapIndicator(bounded) };
  }, [FP_W, FP_H, findWallSnapTarget, findSnapIndicator, snapOn, floorGridSize]);

  // Endpoint editing: free movement by default (walls never feel stuck to an
  // orientation — drag away to detach and re-angle); Shift holds 15° angle
  // assistance around the fixed endpoint. Structural snaps always win.
  const wallEndpointCursor = useCallback((raw: { x: number; y: number }, shiftHeld: boolean, ep: NonNullable<typeof wallEndpointDrag.current>) => {
    const fixed = ep.endpoint === "x1" ? { x: ep.origin.x2, y: ep.origin.y2 } : { x: ep.origin.x1, y: ep.origin.y1 };
    if (!shiftHeld) {
      const axis: "h" | "v" | undefined = snapOn && Math.abs(raw.y - fixed.y) <= SNAP_THRESHOLD
        ? "h"
        : snapOn && Math.abs(raw.x - fixed.x) <= SNAP_THRESHOLD
          ? "v"
          : undefined;
      if (axis) {
        const combined = findAxisWallAttachment(raw, fixed, axis, ep.wallId);
        if (combined) return { point: combined, indicator: combined };
      }
    }
    const structural = findWallSnapTarget(raw, ep.wallId);
    if (structural) {
      const guide = !shiftHeld && snapOn
        ? Math.abs(structural.y - fixed.y) <= 1 ? "h" as const
          : Math.abs(structural.x - fixed.x) <= 1 ? "v" as const : undefined
        : undefined;
      return { point: structural, indicator: { ...structural, ...(guide ? { guide } : {}) } };
    }
    const s = (v: number) => (snapOn ? snapToGrid(v, floorGridSize) : Math.round(v));
    let nx = s(raw.x);
    let ny = s(raw.y);
    if (shiftHeld) {
      const fixedX = ep.endpoint === "x1" ? ep.origin.x2 : ep.origin.x1;
      const fixedY = ep.endpoint === "x1" ? ep.origin.y2 : ep.origin.y1;
      const dx = nx - fixedX;
      const dy = ny - fixedY;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const snappedAngle = snapAngleDeg(angle, 15);
      const len = Math.sqrt(dx * dx + dy * dy);
      nx = fixedX + Math.cos(snappedAngle * (Math.PI / 180)) * len;
      ny = fixedY + Math.sin(snappedAngle * (Math.PI / 180)) * len;
    } else if (snapOn) {
      const fixedX = ep.endpoint === "x1" ? ep.origin.x2 : ep.origin.x1;
      const fixedY = ep.endpoint === "x1" ? ep.origin.y2 : ep.origin.y1;
      if (Math.abs(nx - fixedX) <= SNAP_THRESHOLD) nx = fixedX;
      if (Math.abs(ny - fixedY) <= SNAP_THRESHOLD) ny = fixedY;
    }
    const bounded = { x: clamp(nx, 0, FP_W), y: clamp(ny, 0, FP_H) };
    const fixedX = ep.endpoint === "x1" ? ep.origin.x2 : ep.origin.x1;
    const fixedY = ep.endpoint === "x1" ? ep.origin.y2 : ep.origin.y1;
    const guide = !shiftHeld
      ? Math.abs(raw.y - fixedY) <= SNAP_THRESHOLD ? "h" as const
        : Math.abs(raw.x - fixedX) <= SNAP_THRESHOLD ? "v" as const
          : undefined
      : undefined;
    const snapIndicator = findSnapIndicator(bounded, ep.wallId);
    return {
      point: snapPointToFloorBounds(bounded, FP_W, FP_H, SNAP_THRESHOLD),
      indicator: guide ? { ...(snapIndicator ?? bounded), guide } : snapIndicator,
    };
  }, [FP_W, FP_H, findWallSnapTarget, findAxisWallAttachment, findSnapIndicator, snapOn, floorGridSize]);

  const openingWallTarget = useCallback((point: { x: number; y: number }, type: "door" | "window") => {
    const width = type === "door" ? DOOR_DEFAULT_WIDTH : WINDOW_DEFAULT_WIDTH;
    let best: { wall: FloorWall; x: number; y: number; offset: number; width: number; angle: number; d: number } | null = null;
    for (const wall of walls) {
      if (wall.visible === false) continue;
      const nearest = nearestPointOnWall(point, wall);
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      const hitTolerance = Math.max(OPENING_HIT_TOLERANCE / Math.max(zoom, 0.35), wall.thickness * 1.5 + 12);
      if (len < OPENING_MIN_WIDTH || nearest.d > hitTolerance) continue;
      const maxWidth = type === "door" ? DOOR_MAX_WIDTH : WINDOW_MAX_WIDTH;
      const clampedWidth = clamp(width, Math.min(OPENING_MIN_WIDTH, len), maxOpeningWidthForWall(wall, maxWidth, OPENING_MIN_WIDTH));
      const offset = clampWallOpeningOffset(wall, clampedWidth, nearest.t);
      const x = wall.x1 + (wall.x2 - wall.x1) * offset;
      const y = wall.y1 + (wall.y2 - wall.y1) * offset;
      const angle = (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;
      if (!best || nearest.d < best.d) best = { wall, x, y, offset, width: clampedWidth, angle, d: nearest.d };
    }
    return best;
  }, [walls, zoom]);

  // B5 Phase 2.11: LIVE validity of every existing indoor edge — the same strict
  // thick-wall model as Connect creation, recomputed against the CURRENT nodes
  // and authored bends. An invalid edge renders RED and stays editable so the
  // admin can repair it (Remove Bend may legitimately invalidate an edge). This
  // derived set is the authoring invariant future routing/publish code can rely
  // on — no persisted field, no migration.
  const navBlockedEdgeIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const e of walkableIndoorEdges) {
      if (navEdgeIsBlockedExtended(e, indoorNodes, walls, doors, floor.furniture)) blocked.add(e.id);
    }
    return blocked;
  }, [walkableIndoorEdges, indoorNodes, walls, doors, floor.furniture]);

  // ── Floor Issues (B7 Phase 1) ──
  // = FloorEditor-local live checks (floor geometry, stair direction, door/
  // entrance relationship, blocked nav edges) + the CANONICAL campus/nav
  // validation issues that target THIS floor (duplicate room names, emergency
  // exits without a nav link, nav node/edge issues on this floor, …). The
  // canonical list is the exact same derivation the Campus Editor's global
  // Issues control shows (src/lib/liveValidation.ts) — filtered to the current
  // floor and merged WITHOUT duplicating a logical issue that both sides
  // produce (e.g. a wall-blocked nav edge). Renaming a room or linking an
  // emergency exit disappears the row immediately because this memo re-runs on
  // the live campus.
  const floorIssues = useMemo<FloorIssue[]>(() => {
    const geometryIssues = validateFloorGeometry(floor);
    // B5 Phase 3.1: an impossible stair direction (e.g. Down on the lowest
    // floor with no floor below, or Up on the highest) counts as a local floor
    // issue so the admin notices and corrects it. Single-floor buildings are
    // exempt — direction has no cross-floor meaning there.
    const orderedFloors = (campus.buildings ?? []).find((b) => b.id === buildingId)?.floors ?? [];
    const currentTransitionEdges = reconcileCrossFloorTransitions(
      campus.navNodes,
      campus.navEdges,
      orderedFloors,
      buildingId,
    );
    const allowed = stairDirectionsForFloorInOrder(floor.id, orderedFloors);
    const stairIssues: FloorIssue[] = orderedFloors.length <= 1 ? [] : stairs.flatMap((s) => {
      const issues: FloorIssue[] = [];
      if (!allowed.includes(s.direction)) {
        issues.push({
          id: `stair-dir-${s.id}`,
          severity: "warning" as const,
          message: `Stair direction is invalid for this floor — no floor ${s.direction === "down" ? "below" : s.direction === "up" ? "above" : "connection"} available.`,
          selection: { type: "stairs", id: s.id } as FloorSelection,
        });
      }
      // A shared continuation can be present in the authoring data while its
      // direction or derived floor-transition is no longer valid. Keep this
      // warning separate from the local Walking Network check so the Stair's
      // issue badge explains the actual authoring problem.
      if (allowed.includes(s.direction)) {
        const continuation = validateStairContinuation(
          s,
          floor.id,
          orderedFloors,
          campus.navNodes ?? [],
          currentTransitionEdges,
        );
        if (continuation.state === "direction-mismatch") {
          issues.push({
            id: `stair-continuation-direction-${s.id}`,
            severity: "warning" as const,
            message: "Stair direction does not match its continuation. Change the Stair direction or choose a valid continuation.",
            selection: { type: "stairs", id: s.id } as FloorSelection,
          });
        } else if (continuation.state === "missing") {
          issues.push({
            id: `stair-continuation-missing-${s.id}`,
            severity: "warning" as const,
            message: "Stair continuation is missing or unavailable. Choose a valid Stair on another Floor.",
            selection: { type: "stairs", id: s.id } as FloorSelection,
          });
        }
      }
      return issues;
    });
    const doorIssues: FloorIssue[] = doors.flatMap((door) => {
      const status = doorEntranceLinkStatus(campus, buildingId, floorId, door.id);
      if (status.state !== "linked" || !status.entranceName) return [];
      const doorName = doorDisplayName(door, { doors });
      const issues: FloorIssue[] = [];
      if (status.entryFloor === false) {
        issues.push({
          id: `entrance-door-entry-floor-${door.id}`,
          severity: "warning" as const,
          message: `${doorName} is connected to ${status.entranceName} but is no longer on the building entry floor.`,
          selection: { type: "door", id: door.id } as FloorSelection,
        });
      }
      if (door.visible === false) {
        issues.push({
          id: `entrance-door-hidden-${door.id}`,
          severity: "warning" as const,
          message: `${doorName} is connected to ${status.entranceName} but is hidden.`,
          selection: { type: "door", id: door.id } as FloorSelection,
        });
      }
      return issues;
    });
    const localIssues: FloorIssue[] = [...geometryIssues, ...stairIssues, ...doorIssues];
    // Canonical campus/nav issues that target the CURRENT floor only. Blocked
    // nav edges already tracked locally are excluded so the same warning never
    // appears twice in one panel (the local blocked-edge rows render below).
    const campusFloorIssues = validationIssuesForFloor(campus, floorId);
    return mergeFloorIssueLists(localIssues, campusFloorIssues, navBlockedEdgeIds);
  }, [floor, stairs, doors, buildingId, floorId, campus, navBlockedEdgeIds]);
  const blockingIssues = floorIssues.filter((issue) => issue.severity === "error");
  const totalIssues = floorIssues.length + navBlockedEdgeIds.size;
  const hasBlockingIssues = blockingIssues.length > 0 || navBlockedEdgeIds.size > 0;
  const hasAnyIssues = totalIssues > 0;

  // ── B7 Phase 1: restrained on-canvas issue markers ────────────────────────
  // ONE small badge per affected object (rooms, doors, stairs, elevators,
  // ramps, nav nodes/edges) derived from the SAME live issue list the Issues
  // panel shows. The worst severity wins per object; warnings stay amber and
  // errors stay red; the badge is pointer-events-none so it never intercepts
  // canvas interactions, and it disappears the moment the issue is fixed
  // because it re-derives on every issue-list change.
  const floorIssueMarkers = useMemo(() => {
    const markers = new Map<string, { severity: "error" | "warning"; selection: FloorSelection }>();
    // B7 correction: nav-only markers (navNode, navEdge) are hidden when the
    // Navigation layer is not active — the issue stays in the Issues list but
    // no floating marker appears on an invisible object.
    const navVisible = showNavOverlay;
    const add = (selection: FloorSelection | undefined, severity: "error" | "warning" | "info") => {
      if (!selection || severity === "info") return;
      if (selection.type === "wall" || selection.type === "path" || selection.type === "window" || selection.type === "furniture" || selection.type === "label") return;
      // Hide nav-only issue markers when the Navigation layer is not active
      if (!navVisible && (selection.type === "navNode" || selection.type === "navEdge")) return;
      const key = `${selection.type}:${selection.id}`;
      const existing = markers.get(key);
      if (!existing || (severity === "error" && existing.severity !== "error")) {
        markers.set(key, { severity, selection });
      }
    };
    for (const issue of floorIssues) add(issue.selection, issue.severity);
    for (const edgeId of navBlockedEdgeIds) add({ type: "navEdge", id: edgeId }, "warning");
    return markers;
  }, [floorIssues, navBlockedEdgeIds, showNavOverlay]);

  // ── B7 Phase 2: contextual issue guidance for the SELECTED object ──
  // Same floor issue list the Issues panel + markers use: selecting an object
  // that has a marker explains exactly what is wrong (design + nav modes).
  const selectedIssueItems = useMemo(() => {
    if (!selected) return [];
    return floorIssuesToItems(floorIssuesForSelection(floorIssues, selected));
  }, [selected, floorIssues]);
  const navSelectedIssueItems = useMemo(() => {
    if (!navSelected) return [];
    const selection: FloorSelection =
      navSelected.type === "node" ? { type: "navNode", id: navSelected.id } : { type: "navEdge", id: navSelected.id };
    return floorIssuesToItems(floorIssuesForSelection(floorIssues, selection));
  }, [navSelected, floorIssues]);

  // World-space anchor of an issue marker: for rooms, the badge sits at
  // the top-RIGHT INNER corner with safe padding so it stays inside the
  // room rectangle, never covers resize handles, and remains visible even
  // when the room touches a floor boundary.  For other object types the
  // centre is fine.
  const floorMarkerAnchor = useCallback((selection: FloorSelection): { x: number; y: number } | null => {
    switch (selection.type) {
      case "room": {
        const r = rooms.find((x) => x.id === selection.id);
        if (!r) return null;
        // Prefer the top-right corner, then fall back to another inward corner
        // when the room is clipped or a boundary makes the preferred location
        // unsafe.  The final clamp keeps the full badge in the floor overlay.
        const pad = 9;
        const radius = 7;
        const candidates = [
          { x: r.x + r.w - pad, y: r.y + pad },
          { x: r.x + pad, y: r.y + pad },
          { x: r.x + r.w - pad, y: r.y + r.h - pad },
          { x: r.x + pad, y: r.y + r.h - pad },
        ];
        const visible = candidates.find((candidate) =>
          candidate.x >= radius && candidate.x <= FP_W - radius
          && candidate.y >= radius && candidate.y <= FP_H - radius
        );
        const point = visible ?? candidates[0];
        return {
          x: clamp(point.x, radius, FP_W - radius),
          y: clamp(point.y, radius, FP_H - radius),
        };
      }
      case "door": {
        const d = doors.find((x) => x.id === selection.id);
        return d ? { x: d.x, y: d.y - 13 } : null;
      }
      case "stairs": {
        const s = stairs.find((x) => x.id === selection.id);
        if (!s) return null;
        const center = floorObjectCenter("stairs", s);
        return { x: center.x, y: center.y - 13 };
      }
      case "elevator": {
        const e = elevators.find((x) => x.id === selection.id);
        if (!e) return null;
        const center = floorObjectCenter("elevator", e);
        return { x: center.x, y: center.y - 13 };
      }
      case "ramp": {
        const r = ramps.find((x) => x.id === selection.id);
        if (!r) return null;
        const center = floorObjectCenter("ramp", r);
        return { x: center.x, y: center.y - 13 };
      }
      case "navNode": {
        const n = indoorNodes.find((x) => x.id === selection.id);
        return n ? { x: n.x, y: n.y - 13 } : null;
      }
      case "navEdge": {
        const e = indoorEdges.find((x) => x.id === selection.id);
        const a = e ? indoorNodes.find((n) => n.id === e.startNodeId) : undefined;
        const b = e ? indoorNodes.find((n) => n.id === e.endNodeId) : undefined;
        if (!e || !a || !b) return null;
        return polylineMidpoint([{ x: a.x, y: a.y }, ...(e.bendPoints ?? []), { x: b.x, y: b.y }]);
      }
      default:
        return null;
    }
  }, [rooms, doors, stairs, elevators, ramps, indoorNodes, indoorEdges, FP_W, FP_H]);

  // B5 Phase 3: cross-floor transition status for the CURRENT floor's nodes —
  // connected floor labels (authoring feedback) + sharedId match state. Fully
  // derived from the campus transition edges; nothing here is persisted twice.
  const buildingFloors = useMemo(
    () => (campus.buildings ?? []).find((b) => b.id === buildingId)?.floors ?? [],
    [buildingId, campus.buildings]
  );

  const activeFloorIndex = buildingFloors.findIndex((f) => f.id === floorId);
  const previousFloor = activeFloorIndex > 0 ? buildingFloors[activeFloorIndex - 1] : null;
  const nextFloor = activeFloorIndex >= 0 && activeFloorIndex < buildingFloors.length - 1
    ? buildingFloors[activeFloorIndex + 1]
    : null;
  // Keep persisted Stair directions in sync when an external editor action
  // changes the active floor context/order.  The first render is intentionally
  // observed without mutation so legacy invalid data can still be reviewed;
  // only a subsequent floor-order/context change triggers reconciliation.
  const stairContextKey = `${floorId}|${buildingFloors.map((candidate) => `${candidate.id}:${candidate.number}:${candidate.label}`).join("|")}`;
  const lastStairContextKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastStairContextKeyRef.current === null) {
      lastStairContextKeyRef.current = stairContextKey;
      return;
    }
    if (lastStairContextKeyRef.current === stairContextKey) return;
    lastStairContextKeyRef.current = stairContextKey;
    const reconciledDirections = reconcileStairDirectionsForFloorOrder(buildingFloors);
    if (reconciledDirections.adjustments.length === 0) return;
    const updatedCampus = replaceBuildingFloorsAndReconcileTransitions(
      campus,
      buildingId,
      reconciledDirections.floors.map((nextFloor) => normalizeFloor(nextFloor, { buildingId }))
    );
    onUpdate(updatedCampus);
    for (const adjustment of reconciledDirections.adjustments) {
      const directionLabel = adjustment.to === "both" ? "Both" : adjustment.to === "up" ? "Up" : "Down";
      toast.info("Stair direction updated", `${adjustment.stairLabel} is now ${directionLabel} on ${adjustment.floorLabel}.`);
    }
  }, [buildingFloors, buildingId, campus, onUpdate, stairContextKey, toast]);
  const filteredFloorOptions = useMemo(() => {
    const query = floorSelectorSearch.trim().toLowerCase();
    if (!query) return buildingFloors;
    return buildingFloors.filter((f) => `${f.label} ${f.number}`.toLowerCase().includes(query));
  }, [buildingFloors, floorSelectorSearch]);

  useEffect(() => {
    if (!floorSelectorOpen) return;
    const option = floorSelectorPopoverRef.current?.querySelector<HTMLElement>("[aria-selected='true']");
    if (typeof option?.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
  }, [floorId, filteredFloorOptions, floorSelectorOpen]);

  const circulationGroups = useMemo(() => {
    const labels = new Map(buildingFloors.map((f) => [f.id, f.label]));
    const stored = building?.circulationGroups ?? [];
    const makeGroups = (kind: "stair" | "elevator") => {
      const storedById = new Map(stored.filter((g) => g.kind === kind).map((g) => [g.id, g.name]));
       const usage = new Map<string, { id: string; label: string; objectId: string; objectLabel: string; systemNumber?: number }[]>();
      for (const f of buildingFloors) {
        const items = kind === "stair" ? (f.stairs ?? []) : (f.elevators ?? []);
        for (const item of items) {
          if (!item.sharedId) continue;
          const list = usage.get(item.sharedId) ?? [];
           list.push({
             id: f.id,
             label: labels.get(f.id) ?? f.label,
             objectId: item.id,
             objectLabel: item.label,
             systemNumber: kind === "elevator" ? elevatorSystemNumberOf(item) : undefined,
           });
          usage.set(item.sharedId, list);
        }
      }
      let fallbackIndex = 1;
      return [...new Set([...storedById.keys(), ...usage.keys()])].map((id) => {
        const usedFloors = usage.get(id) ?? [];
        const objectLabel = usedFloors.find((u) => u.objectLabel && !/^stairs?$/i.test(u.objectLabel) && !/^elevator$/i.test(u.objectLabel))?.objectLabel;
        return {
          id,
          name: storedById.get(id) ?? objectLabel ?? `${kind === "stair" ? "Stair" : "Elevator"} ${fallbackIndex++}`,
          usedFloors,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
    };
    return { stairs: makeGroups("stair"), elevators: makeGroups("elevator") };
  }, [building?.circulationGroups, buildingFloors]);
  const reconciledTransitionEdges = useMemo(() => reconcileCrossFloorTransitions(
    campus.navNodes,
    campus.navEdges,
    buildingFloors,
    buildingId
  ), [buildingFloors, buildingId, campus.navEdges, campus.navNodes]);
  const navNodeTransitionStatus = useMemo(() => {
    const status = new Map<string, { floors: { id: string; label: string }[]; state: "linked" | "no-shared-id" | "no-match" }>();
    const keyByNode = new Map<string, string>();
    for (const node of campus.navNodes ?? []) {
      const info = findCrossFloorOwnerInfo(node, buildingFloors, buildingId);
      if (info) keyByNode.set(node.id, `${info.kind}:${info.sharedId}`);
    }
    const keyCounts = new Map<string, number>();
    for (const key of keyByNode.values()) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    const labels = new Map(buildingFloors.map((f) => [f.id, f.label]));
    for (const node of indoorNodes) {
      const key = keyByNode.get(node.id);
      if (!key) {
        status.set(node.id, { floors: [], state: "no-shared-id" });
        continue;
      }
      const floors: { id: string; label: string }[] = [];
      for (const e of reconciledTransitionEdges) {
        // Keep legacy `cross_floor` edges readable during hydration. New
        // mutations use CROSS_FLOOR_EDGE_TYPE, but both spellings describe the
        // same authored continuation for this status-only view.
        if (e.type !== CROSS_FLOOR_EDGE_TYPE && e.type !== "cross_floor") continue;
        const otherId = e.startNodeId === node.id ? e.endNodeId : e.endNodeId === node.id ? e.startNodeId : null;
        if (!otherId) continue;
        const other = (campus.navNodes ?? []).find((n) => n.id === otherId);
        if (!other) continue;
        const otherFloorId = other.floorId ?? "";
        const label = labels.get(otherFloorId) ?? "Other floor";
        if (!floors.some((f) => f.id === otherFloorId)) floors.push({ id: otherFloorId, label });
      }
      status.set(node.id, { floors, state: (keyCounts.get(key) ?? 0) > 1 ? "linked" : "no-match" });
    }
    return status;
  }, [buildingFloors, buildingId, campus.navNodes, indoorNodes, reconciledTransitionEdges]);

  type QuickNavigationTarget = {
    floorId: string;
    floorLabel: string;
    objectId: string;
    objectLabel: string;
    relation: "above" | "below";
    usable: boolean;
    /** Elevator popovers include the selected occurrence for context. */
    isCurrent?: boolean;
  };

  // Resolve the small authoring shortcut from the same canonical transition
  // edges used by the Navigation overlay. Physical proximity and labels are
  // intentionally ignored: the occurrence must share the explicit identity
  // and have a real transition edge to the current node.
  const quickNavigationTargets = useMemo(() => {
    const result = new Map<string, QuickNavigationTarget[]>();
    const nodeByPhysicalKey = new Map<string, NavigationNode>();
    for (const node of campus.navNodes ?? []) {
      if (node.stairId) nodeByPhysicalKey.set(`stairs:${node.stairId}`, node);
      if (node.elevatorId) nodeByPhysicalKey.set(`elevator:${node.elevatorId}`, node);
    }
    const floorIndexById = new Map(buildingFloors.map((candidate, index) => [candidate.id, index]));
    const addTargets = (kind: "stairs" | "elevator", items: Array<FloorStairs | FloorElevatorItem>) => {
      for (const item of items) {
        if (!item.sharedId) continue;
        const key = `${kind}:${item.id}`;
        const fromIndex = floorIndexById.get(floorId) ?? -1;

        // Elevator quick navigation follows the authoritative occurrence
        // identity and served-floor list, not the transition-edge adjacency
        // used by Stairs.  A shaft can skip floors, so resolving only the
        // immediately adjacent transition would hide valid stops such as
        // Ground -> Floor 2 -> Floor 5 from the popup.
        if (kind === "elevator") {
          const servedFloors = item.floors?.length ? new Set(item.floors) : null;
          const targets = buildingFloors.flatMap((targetFloor) => {
            if (servedFloors && !servedFloors.has(targetFloor.number)) return [];
            const targetItem = (targetFloor.elevators ?? []).find((candidate) => candidate.sharedId === item.sharedId);
            if (!targetItem) return [];
            const targetIndex = floorIndexById.get(targetFloor.id) ?? -1;
            return [{
              floorId: targetFloor.id,
              floorLabel: targetFloor.label,
              objectId: targetItem.id,
              objectLabel: targetItem.label?.trim() || "Elevator",
              relation: targetIndex > fromIndex ? "above" as const : "below" as const,
              usable: true,
              isCurrent: targetFloor.id === floorId,
            }];
          });
          const unique = targets.filter((target, index, all) => all.findIndex((candidate) => candidate.floorId === target.floorId && candidate.objectId === target.objectId) === index);
          if (unique.length > 0) result.set(key, unique.sort((a, b) => (floorIndexById.get(a.floorId) ?? 0) - (floorIndexById.get(b.floorId) ?? 0)));
          continue;
        }

        const localNode = nodeByPhysicalKey.get(key);
        const status = localNode ? navNodeTransitionStatus.get(localNode.id) : undefined;
        if (!localNode || status?.state !== "linked" || status.floors.length === 0) continue;
        const targets = status.floors.flatMap((statusFloor) => {
          const targetFloor = buildingFloors.find((candidate) => candidate.id === statusFloor.id);
          const targetIndex = targetFloor ? floorIndexById.get(targetFloor.id) ?? -1 : -1;
          if (!targetFloor || targetIndex < 0 || targetIndex === fromIndex) return [];
          const targetItem = kind === "stairs"
            ? (targetFloor.stairs ?? []).find((candidate) => candidate.sharedId === item.sharedId)
            : (targetFloor.elevators ?? []).find((candidate) => candidate.sharedId === item.sharedId);
          if (!targetItem) return [];
          const targetNode = nodeByPhysicalKey.get(`${kind}:${targetItem.id}`);
          if (!targetNode) return [];
          return [{
            floorId: targetFloor.id,
            floorLabel: targetFloor.label,
            objectId: targetItem.id,
            objectLabel: targetItem.label?.trim() || (kind === "stairs" ? "Stair" : "Elevator"),
            relation: targetIndex > fromIndex ? "above" as const : "below" as const,
            usable: kind === "stairs"
              ? stairContinuationDirectionAllows((item as FloorStairs).direction, fromIndex, targetIndex)
              : true,
          }];
        });
        const unique = targets.filter((target, index, all) => all.findIndex((candidate) => candidate.floorId === target.floorId && candidate.objectId === target.objectId) === index);
        if (unique.length > 0) result.set(key, unique.sort((a, b) => (floorIndexById.get(b.floorId) ?? 0) - (floorIndexById.get(a.floorId) ?? 0)));
      }
    };
    const currentFloor = buildingFloors.find((candidate) => candidate.id === floorId);
    addTargets("stairs", currentFloor?.stairs ?? []);
    addTargets("elevator", currentFloor?.elevators ?? []);
    return result;
  }, [buildingFloors, campus.navNodes, floorId, indoorNodes, navNodeTransitionStatus]);

  const navSelectedElevatorServedFloors = useMemo(() => {
    if (navSelected?.type !== "node") return [];
    const node = (campus.navNodes ?? []).find((n) => n.id === navSelected.id);
    if (!node?.elevatorId) return [];
    const currentFloor = buildingFloors.find((f) => f.id === node.floorId);
    const owner = currentFloor?.elevators?.find((e) => e.id === node.elevatorId);
    if (!owner?.sharedId) return [];
    const servedSet = owner.floors?.length ? new Set(owner.floors) : null;
    return buildingFloors
      .filter((f) => !servedSet || servedSet.has(f.number))
      .map((f) => {
        const floorOwner = (f.elevators ?? []).find((e) => e.sharedId === owner.sharedId);
        return {
          id: f.id,
          label: f.label,
          linked: !!floorOwner && (campus.navNodes ?? []).some((n) => n.floorId === f.id && n.elevatorId === floorOwner.id),
          isLocal: f.id === node.floorId,
        };
      });
  }, [buildingFloors, campus.navNodes, navSelected]);

  const circulationNavStatus = useMemo(() => {
    if (!selected || (selected.type !== "stairs" && selected.type !== "elevator" && selected.type !== "ramp")) return undefined;
    const kind = selected.type;
    const localNode = indoorNodes.find((n) =>
      kind === "stairs" ? n.stairId === selected.id
      : kind === "elevator" ? n.elevatorId === selected.id
      : n.rampId === selected.id
    );
    const localOwner = kind === "stairs" ? stairs.find((s) => s.id === selected.id)
      : kind === "elevator" ? elevators.find((e) => e.id === selected.id)
      : ramps.find((r) => r.id === selected.id);
    const sharedId = localOwner?.sharedId;
    const servedFloorSet = kind === "elevator" && localOwner && "floors" in localOwner && localOwner.floors?.length
      ? new Set(localOwner.floors)
      : null;
    const localFloorOrder = buildingFloors.findIndex((f) => f.id === floorId);
    const matching = sharedId && kind !== "ramp"
      ? buildingFloors.flatMap((f) => {
          if (f.id === floorId) return [];
          if (kind === "stairs" && Math.abs(buildingFloors.findIndex((candidate) => candidate.id === f.id) - localFloorOrder) !== 1) return [];
          if (servedFloorSet && !servedFloorSet.has(f.number)) return [];
          const owner = kind === "stairs"
            ? (f.stairs ?? []).find((s) => s.sharedId === sharedId)
            : (f.elevators ?? []).find((e) => e.sharedId === sharedId);
          return owner ? [{ floor: f, ownerId: owner.id }] : [];
        })
      : [];
    const servedFloors = kind === "elevator"
      ? buildingFloors
          .filter((f) => !servedFloorSet || servedFloorSet.has(f.number))
          .map((f) => {
            const owner = sharedId ? (f.elevators ?? []).find((e) => e.sharedId === sharedId) : undefined;
            return {
              id: f.id,
              label: f.label,
              hasPhysical: !!owner,
              linked: !!owner && (campus.navNodes ?? []).some((n) => n.floorId === f.id && n.elevatorId === owner.id),
              isLocal: f.id === floorId,
            };
          })
      : [];
    const selectedStairDirection = kind === "stairs"
      ? (localOwner as FloorStairs | undefined)?.direction
      : undefined;
    // Only transitions that are actually traversable FROM this occurrence are
    // presented as connected.  A directed Stair edge can touch the node while
    // still pointing into it from the other floor; counting that as a local
    // continuation makes an Up-only upper Stair look connected downward.
    const connectedFloors = localNode
      ? reconciledTransitionEdges
        .filter((edge) => (edge.type === CROSS_FLOOR_EDGE_TYPE || edge.type === "cross_floor")
          && (edge.startNodeId === localNode.id || (edge.bidirectional && edge.endNodeId === localNode.id)))
        .map((edge) => {
          const otherId = edge.startNodeId === localNode.id ? edge.endNodeId : edge.startNodeId;
          const other = (campus.navNodes ?? []).find((node) => node.id === otherId);
          if (!other) return null;
          const floor = buildingFloors.find((candidate) => candidate.id === other.floorId);
          return floor ? { id: floor.id, label: floor.label } : null;
        })
        .filter((floor): floor is { id: string; label: string } => !!floor)
        .filter((floor, index, all) => all.findIndex((candidate) => candidate.id === floor.id) === index)
      : [];
    const connected = new Set(connectedFloors.map((f) => f.id));
    const validMatching = matching.filter(({ floor }) => kind !== "stairs"
      || localFloorOrder < 0
      || stairContinuationDirectionAllows(
        selectedStairDirection,
        localFloorOrder,
        buildingFloors.findIndex((candidate) => candidate.id === floor.id),
      ));
    const invalidDirectionMatching = matching.filter(({ floor }) => kind === "stairs"
      && localFloorOrder >= 0
      && !stairContinuationDirectionAllows(
        selectedStairDirection,
        localFloorOrder,
        buildingFloors.findIndex((candidate) => candidate.id === floor.id),
      ));
    const waitingFloors = validMatching
      .filter(({ floor, ownerId }) => {
        if (connected.has(floor.id)) return false;
        return !(campus.navNodes ?? []).some((n) =>
          n.floorId === floor.id && (
            kind === "stairs" ? n.stairId === ownerId
            : n.elevatorId === ownerId
          )
        );
      })
      .map(({ floor }) => ({ id: floor.id, label: floor.label }));
    const directionBlockedFloors = [
      ...invalidDirectionMatching.map(({ floor }) => ({ id: floor.id, label: floor.label })),
      ...validMatching
      .filter(({ floor, ownerId }) => {
        const linked = (campus.navNodes ?? []).some((n) => n.floorId === floor.id && (
          kind === "stairs" ? n.stairId === ownerId : n.elevatorId === ownerId
        ));
        return linked && !connected.has(floor.id);
      })
      .map(({ floor }) => ({ id: floor.id, label: floor.label })),
    ].filter((floor, index, all) => all.findIndex((candidate) => candidate.id === floor.id) === index);
    const owner = kind === "stairs" ? stairs.find((s) => s.id === selected.id)
      : kind === "elevator" ? elevators.find((e) => e.id === selected.id)
      : ramps.find((r) => r.id === selected.id);
    const groupLabel = owner?.sharedId
      ? (kind === "stairs" ? circulationGroups.stairs : circulationGroups.elevators).find((g) => g.id === owner.sharedId)?.name
      : undefined;
    const localConnectionCount = localNode
      ? indoorEdges.filter((e) => e.type !== CROSS_FLOOR_EDGE_TYPE && e.type !== "cross_floor" && !e.closed
        && (e.startNodeId === localNode.id || e.endNodeId === localNode.id)).length
      : 0;
    const connectedLabel = connectedFloors.length > 0 ? `Connected to ${connectedFloors.map((f) => f.label).join(", ")}` : "Ready for routing";
    const stairDetail = !localNode
      ? "Add this stair as a local stair navigation anchor."
      : connectedFloors.length > 0 && localConnectionCount === 0
        ? `Connect this Stair to the Walking Network. ${connectedLabel}.`
        : localConnectionCount === 0
          ? "Connect this Stair to the Walking Network."
          : connectedFloors.length > 0
            ? `Ready for routing · ${connectedLabel}`
          : buildingFloors.length <= 1
            ? "Ready for routing"
            : directionBlockedFloors.length > 0
              ? `Direction does not allow travel to ${directionBlockedFloors.map((f) => f.label).join(", ")}.`
              : waitingFloors.length > 0
              ? `No matching Stair is available on ${waitingFloors.map((f) => f.label).join(", ")}.`
              : "No matching Stair is available on an adjacent floor.";
    const elevatorDetail = !localNode
      ? "Add this elevator as a local elevator navigation anchor."
      : localConnectionCount === 0
        ? "Connect this Elevator to the Walking Network."
        : connectedFloors.length > 0
          ? `Ready for routing · ${connectedLabel}`
          : buildingFloors.length <= 1
            ? "Ready for routing"
            : servedFloors.length > 0 && servedFloors.filter((f) => f.hasPhysical).length < 2
              ? "No matching Elevator is available on another served floor."
              : "No matching Elevator is connected on another served floor.";
    return {
      kind,
      linked: !!localNode,
      connectedFloors: kind === "ramp" ? [] : connectedFloors,
      waitingFloors: kind === "ramp" ? [] : waitingFloors,
      directionBlockedFloors: kind === "stairs" ? directionBlockedFloors : [],
      servedFloors,
      // B5 Phase 6.8: shared-card content (Design + Navigation parity).
      title: kind === "stairs" ? "Stair" : kind === "elevator" ? "Elevator" : "Ramp",
        detail: kind === "ramp"
          ? (localNode ? "Accessible path anchor for local walking routes." : "Add this ramp as an accessible path anchor.")
          : kind === "stairs"
          ? stairDetail
          : elevatorDetail,
      groupLabel: groupLabel ?? owner?.label,
      connectionCount: localNode ? (kind === "stairs" ? localConnectionCount : indoorEdges.filter((e) => e.type !== CROSS_FLOOR_EDGE_TYPE && e.type !== "cross_floor" && !e.closed && (e.startNodeId === localNode.id || e.endNodeId === localNode.id)).length) : undefined,
    };
  }, [buildingFloors, campus.navNodes, circulationGroups.elevators, circulationGroups.stairs, elevators, floorId, indoorEdges, indoorNodes, navNodeTransitionStatus, ramps, reconciledTransitionEdges, selected, stairs]);

  // Small canvas status cues are derived from the same canonical Floor data as
  // the manager. A shared identity with members on more than one Floor is a
  // connected shaft/continuation; a one-floor identity is intentionally shown
  // as unconnected without changing any routing or transition data.
  const circulationConnectionFloorCounts = useMemo(() => {
    const collect = <T extends { id: string; sharedId?: string }>(itemsForFloor: (candidateFloor: FloorPlan) => T[] | undefined) => {
      const floorsByIdentity = new Map<string, Set<string>>();
      for (const candidateFloor of buildingFloors) {
        for (const item of itemsForFloor(candidateFloor) ?? []) {
          if (!item.sharedId) continue;
          const members = floorsByIdentity.get(item.sharedId) ?? new Set<string>();
          members.add(candidateFloor.id);
          floorsByIdentity.set(item.sharedId, members);
        }
      }
      return new Map([...floorsByIdentity.entries()].map(([sharedId, floorIds]) => [sharedId, floorIds.size]));
    };
    return {
      stairs: collect((candidateFloor) => candidateFloor.stairs),
      elevators: collect((candidateFloor) => candidateFloor.elevators),
    };
  }, [buildingFloors]);

  const selectIssue = useCallback((issue: FloorIssue) => {
    if (issue.selection) {
      setMultiSelected([]);
      setSelected(issue.selection);
      setShowProperties(true);
    }
    setShowIssues(false);
  }, []);

  const updateFloorMetadata = useCallback((updates: Partial<FloorPlan>, message?: string) => {
    const candidate = normalizeFloor({ ...floor, ...updates }, { buildingId });
    pushHistory(floorUndoEntryFromFloor(candidate));
    buildFloorUpdates(updates);
    if (message) toast.success(message);
  }, [buildFloorUpdates, buildingId, floor, pushHistory, toast]);

  const handleImportBackground = useCallback(async (file: File) => {
    setBackgroundUploading(true);
    try {
      floorPlanStorageService.validate(file);
      const [storagePath, imageSize] = await Promise.all([
        floorPlanStorageService.upload({ campusId: campus.id, buildingId, floorId, file }),
        readImageSize(file),
      ]);
      const background = createFittedFloorPlanBackground({
        storagePath,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        canvasW: FP_W,
        canvasH: FP_H,
        naturalWidth: imageSize.width,
        naturalHeight: imageSize.height,
      });
      updateFloorMetadata({ backgroundImage: background }, "Floor plan imported");
      setShowFloorSettings(true);
    } catch (error) {
      toast.error("Could not import floor plan", error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBackgroundUploading(false);
    }
  }, [FP_H, FP_W, buildingId, campus.id, floorId, toast, updateFloorMetadata]);

  const handleUpdateBackground = useCallback((background: FloorPlanBackground | undefined) => {
    updateFloorMetadata({ backgroundImage: background, calibration: background ? floor.calibration : undefined }, background ? "Floor plan background updated" : "Floor plan background removed");
  }, [floor.calibration, updateFloorMetadata]);

  const handleFitBackground = useCallback(() => {
    const background = fitFloorPlanBackgroundToFloor(floor.backgroundImage, FP_W, FP_H);
    if (background) updateFloorMetadata({ backgroundImage: background }, "Floor plan fit to floor");
  }, [FP_H, FP_W, floor.backgroundImage, updateFloorMetadata]);

  const handleResetBackground = useCallback(() => {
    const background = resetFloorPlanBackgroundPosition(floor.backgroundImage);
    if (background) updateFloorMetadata({ backgroundImage: background }, "Floor plan position reset");
  }, [floor.backgroundImage, updateFloorMetadata]);

  const startCalibration = useCallback(() => {
    if (!floor.backgroundImage) {
      toast.info("Import a floor plan first", "Scale calibration needs a reference image.");
      return;
    }
    setShowFloorSettings(false);
    setRoomDrag(null);
    alignmentSnapLocksRef.current = { x: null, y: null };
    setTool("select");
    setCalibrationDraft({ active: true, distanceInput: "" });
  }, [floor.backgroundImage, toast]);

  const removeCalibration = useCallback(() => {
    updateFloorMetadata({ calibration: undefined }, "Floor scale calibration removed");
    if (tool === "measure") {
      setRoomDrag(null);
      alignmentSnapLocksRef.current = { x: null, y: null };
      setTool("select");
    }
    setMeasureDraft({});
  }, [tool, updateFloorMetadata]);

  const confirmCalibration = useCallback(() => {
    if (!calibrationDraft.p1 || !calibrationDraft.p2) return;
    const distanceM = Number(calibrationDraft.distanceInput);
    try {
      const calibration = createFloorScaleCalibration(calibrationDraft.p1, calibrationDraft.p2, distanceM);
      updateFloorMetadata({ calibration }, "Floor scale calibrated");
      setCalibrationDraft({ active: false, distanceInput: "" });
    } catch (error) {
      toast.error("Calibration blocked", error instanceof Error ? error.message : "Enter a valid distance.");
    }
  }, [calibrationDraft.distanceInput, calibrationDraft.p1, calibrationDraft.p2, toast, updateFloorMetadata]);

  // Floor Settings applies draft General/Canvas/Appearance values as ONE edit:
  // validates shrink against authored geometry, pushes one history entry, marks
  // the floor dirty, and returns whether the change was accepted.
  const applyFloorSettings = useCallback((draft: FloorSettingsDraft): boolean => {
    const nextCanvas = normalizeFloorCanvasSize(draft.canvasW, draft.canvasH);
    const perimeterWalls = walls.filter(isManagedPerimeterWall);
    const firstPerimeter = perimeterWalls[0];
    const perimeterEnabled = perimeterWalls.length > 0;
    const perimeterChanged = draft.perimeterEnabled !== perimeterEnabled
      || (draft.perimeterEnabled && (
        draft.perimeterThickness !== (firstPerimeter?.thickness ?? 6)
        || draft.perimeterMaterial !== (firstPerimeter?.material ?? "concrete")
        || draft.perimeterColor !== (firstPerimeter?.color ?? "#64748b")
      ));
    const unchanged = nextCanvas.w === FP_W && nextCanvas.h === FP_H
      && draft.label === floor.label
      && draft.backgroundColor === (floor.backgroundColor ?? "#e8e1d7")
      && draft.showGrid === (floor.showGrid !== false)
      && draft.gridSize === (floor.gridSize ?? 20)
      && !perimeterChanged;
    if (unchanged) { setShowFloorSettings(false); return true; }

    let nextWalls = walls;
    let nextDoors = doors;
    let nextWindows = windows;
    if (draft.perimeterEnabled) {
      const managed = managedPerimeterWalls(floor.id, nextCanvas.w, nextCanvas.h, draft, walls);
      const managedIds = new Set(managed.map((wall) => wall.id));
      nextWalls = [
        ...walls.filter((wall) => !isManagedPerimeterWall(wall) && !managedIds.has(wall.id)),
        ...managed,
      ];
    } else if (perimeterWalls.length > 0) {
      const perimeterIds = new Set(perimeterWalls.map((wall) => wall.id));
      const attachedCount = doors.filter((door) => door.wallId && perimeterIds.has(door.wallId)).length
        + windows.filter((win) => win.wallId && perimeterIds.has(win.wallId)).length;
      if (attachedCount > 0 && !window.confirm(`Remove managed perimeter walls and ${attachedCount} attached door/window opening${attachedCount === 1 ? "" : "s"}?`)) {
        return false;
      }
      nextWalls = walls.filter((wall) => !isManagedPerimeterWall(wall));
      nextDoors = doors.filter((door) => !(door.wallId && perimeterIds.has(door.wallId)));
      nextWindows = windows.filter((win) => !(win.wallId && perimeterIds.has(win.wallId)));
    }
    const syncedOpenings = syncOpeningsToWalls(nextDoors, nextWindows, nextWalls);
    nextDoors = syncedOpenings.doors;
    nextWindows = syncedOpenings.windows;
    const candidateFloor: FloorPlan = {
      ...floor,
      canvasW: nextCanvas.w,
      canvasH: nextCanvas.h,
      walls: nextWalls,
      doors: nextDoors,
      windows: nextWindows,
    };
    const shrinkIssues = floorResizeIssues(candidateFloor, nextCanvas.w, nextCanvas.h);
    if (shrinkIssues.length > 0) {
      toast.error("Floor resize blocked", `${summarizeFloorResizeIssues(shrinkIssues)} would fall outside the new floor size.`);
      setShowIssues(true);
      return false;
    }
    const updates: Partial<FloorPlan> = {
      canvasW: nextCanvas.w,
      canvasH: nextCanvas.h,
      label: draft.label,
      backgroundColor: draft.backgroundColor,
      showGrid: draft.showGrid,
      gridSize: draft.gridSize,
      walls: nextWalls,
      doors: nextDoors,
      windows: nextWindows,
    };
    const entry = floorUndoEntryFromFloor({ ...candidateFloor, ...updates });
    pushHistory(entry);
    buildFloorUpdates(updates);
    toast.success("Floor settings updated", `${nextCanvas.w} × ${nextCanvas.h} canvas and appearance applied.`);
    setShowFloorSettings(false);
    return true;
  }, [buildFloorUpdates, doors, floor, pushHistory, toast, walls, windows, FP_W, FP_H]);

  // Floor Overview sidebar quick-edits reuse Floor Settings' single-edit apply
  // path so width/height changes get the same shrink validation + history.
  const applySidebarFloorSettings = useCallback((partial: Partial<FloorSettingsDraft>) => {
    const perimeterWalls = walls.filter(isManagedPerimeterWall);
    const firstPerimeter = perimeterWalls[0];
    const draft: FloorSettingsDraft = {
      label: floor.label,
      canvasW: FP_W,
      canvasH: FP_H,
      backgroundColor: floor.backgroundColor ?? "#e8e1d7",
      showGrid: floor.showGrid !== false,
      gridSize: floor.gridSize ?? 20,
      perimeterEnabled: perimeterWalls.length > 0,
      perimeterThickness: firstPerimeter?.thickness ?? 6,
      perimeterMaterial: firstPerimeter?.material ?? "concrete",
      perimeterColor: firstPerimeter?.color ?? "#64748b",
      ...partial,
    };
    applyFloorSettings(draft);
  }, [FP_H, FP_W, applyFloorSettings, floor, walls]);

  const renameActiveFloorFromSidebar = useCallback((label: string) => {
    updateBuildingFloors(renameFloorInBuilding(building.floors, floorId, label));
  }, [building.floors, floorId, updateBuildingFloors]);

  const fitFloor = useCallback(() => {
    zoomToFit(0, 0, FP_W, FP_H, 48);
  }, [FP_W, FP_H, zoomToFit]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      zoomToFit(0, 0, FP_W, FP_H, 56);
    });
    return () => cancelAnimationFrame(frame);
  }, [floorId, FP_W, FP_H, zoomToFit]);

  // ── SVG Mouse handlers ──

  // ── B5 Phase 2: indoor Navigation authoring ────────────────────────────────
  // Graph-only pointer handling when the editor is in Navigation mode. Rooms,
  // walls, doors, furniture and circulation stay visible as CONTEXT only — the
  // nav branch below never mutates them.
  const navPointFromEvent = (e: React.MouseEvent): { x: number; y: number } => {
    const pt = getPoint(e as any, FP_W, FP_H);
    return { x: Math.max(0, Math.min(FP_W, Math.round(pt.x))), y: Math.max(0, Math.min(FP_H, Math.round(pt.y))) };
  };

  // Authoring target under the pointer (rooms, doors, stairs/elevator/ramp) —
  // the indoor equivalent of the outdoor building-entrance target affordance.
  const resolveNavTargetAt = (pt: { x: number; y: number }): {
    kind: "room" | "door" | "stairs" | "elevator" | "ramp"; id: string; x: number; y: number;
  } | null => {
    const door = findDoorAtPoint(doors, pt);
    if (door) return { kind: "door", id: door.id, x: Math.round(door.x), y: Math.round(door.y) };
    const circ = findCirculationAtPoint(stairs, elevators, ramps, pt);
    if (circ) {
      const owner = circ.kind === "stairs" ? stairs.find((s) => s.id === circ.id)
        : circ.kind === "elevator" ? elevators.find((el) => el.id === circ.id)
        : ramps.find((r) => r.id === circ.id);
      if (owner) {
        const anchor = circ.kind === "stairs"
          ? stairEntryPosition(owner as FloorStairs)
          : circ.kind === "elevator"
            ? elevatorEntryPosition(owner as FloorElevatorItem)
            : { x: Math.round(owner.x + owner.width / 2), y: Math.round(owner.y + owner.height / 2) };
        return { kind: circ.kind, id: circ.id, x: anchor.x, y: anchor.y };
      }
    }
    const room = findRoomAtPoint(rooms, pt);
    if (room) {
      const anchor = roomLinkedCuePosition(room);
      return { kind: "room", id: room.id, x: anchor.x, y: anchor.y };
    }
    return null;
  };

  // Normal Select is physical-first when the transparent navigation hit line
  // sits over a real map object. Keep this resolver deliberately narrow: it is
  // only used for pointer events whose target is a navigation hit surface, so
  // ordinary physical-object drags and navigation-only tools keep their native
  // event paths.
  const resolvePhysicalSelectAt = (pt: { x: number; y: number }): FloorSelection | null => {
    const door = findDoorAtPoint(doors, pt);
    if (door) return { type: "door", id: door.id };
    // Furniture is also physical floor geometry. Use its rotated footprint so
    // a wide nav hit line cannot swallow a desk, chair, or other placed object.
    const furnitureHit = [...furniture].reverse().find((item) => {
      if (item.visible === false) return false;
      const angle = -((item.rotation ?? 0) * Math.PI) / 180;
      const dx = pt.x - (item.x + item.width / 2);
      const dy = pt.y - (item.y + item.height / 2);
      const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
      return Math.abs(localX) <= item.width / 2 && Math.abs(localY) <= item.height / 2;
    });
    if (furnitureHit) return { type: "furniture", id: furnitureHit.id };
    let nearestWall: { id: string; distance: number } | null = null;
    for (const wall of walls) {
      if (wall.visible === false || isManagedPerimeterWall(wall)) continue;
      const distance = distanceToSegment(pt, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
      const tolerance = Math.max(6, wall.thickness / 2 + 4);
      if (distance > tolerance || (nearestWall && distance >= nearestWall.distance)) continue;
      nearestWall = { id: wall.id, distance };
    }
    if (nearestWall) return { type: "wall", id: nearestWall.id };
    const physical = resolveNavTargetAt(pt);
    if (!physical) return null;
    return { type: physical.kind === "stairs" ? "stairs" : physical.kind, id: physical.id };
  };

  const handlePhysicalSelectCapture = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!showNavOverlay || navTool !== "select" || roomDoorLinking) return;
    const target = e.target as Element;
    const navHit = target.closest?.('[data-testid="nav-edge-hit"], [data-testid="nav-node-hit"]');
    if (!navHit) return;
    const physical = resolvePhysicalSelectAt(navPointFromEvent(e));
    if (!physical) return;
    e.preventDefault();
    e.stopPropagation();
    selectFloorItem(physical);
  };

  const handleSvgDownCapture = (e: React.MouseEvent<SVGSVGElement>) => {
    // A canvas/context change dismisses the authoring quick navigator. The
    // indicator and its popover are explicitly exempt so their internal
    // controls remain interactive.
    const target = e.target as Element;
    if (!target.closest?.("[data-testid^='circulation-quick-nav']")) closeQuickNav();
    handlePhysicalSelectCapture(e);
  };

  const linkedNodeForPhysical = useCallback((
    kind: "room" | "door" | "stairs" | "elevator" | "ramp",
    id: string,
    nodes: NavigationNode[] = indoorNodes
  ) => nodes.find((node) =>
    kind === "room" ? node.roomId === id
    : kind === "door" ? node.doorId === id
    : kind === "stairs" ? node.stairId === id
    : kind === "elevator" ? node.elevatorId === id
    : node.rampId === id
  ), [indoorNodes]);

  const linkedNodesForPhysical = useCallback((
    kind: "room" | "door" | "stairs" | "elevator" | "ramp",
    id: string,
    nodes: NavigationNode[] = indoorNodes
  ) => nodes.filter((node) =>
    kind === "room" ? node.roomId === id
    : kind === "door" ? node.doorId === id
    : kind === "stairs" ? node.stairId === id
    : kind === "elevator" ? node.elevatorId === id
    : node.rampId === id
  ), [indoorNodes]);

  const physicalNavPoint = useCallback((kind: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => {
    if (kind === "room") {
      const room = rooms.find((r) => r.id === id);
      if (!room) return null;
      return roomLinkedCuePosition(room);
    }
    if (kind === "door") {
      const door = doors.find((d) => d.id === id);
      return door ? { x: Math.round(door.x), y: Math.round(door.y) } : null;
    }
    const owner = kind === "stairs" ? stairs.find((s) => s.id === id)
      : kind === "elevator" ? elevators.find((el) => el.id === id)
      : ramps.find((r) => r.id === id);
    if (!owner) return null;
    return kind === "stairs"
      ? stairEntryPosition(owner as FloorStairs)
      : kind === "elevator"
        ? elevatorEntryPosition(owner as FloorElevatorItem)
        : { x: Math.round(owner.x + owner.width / 2), y: Math.round(owner.y + owner.height / 2) };
  }, [doors, elevators, ramps, rooms, stairs]);

  const physicalNavLabel = useCallback((kind: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => {
    if (kind === "room") {
      const index = rooms.findIndex((r) => r.id === id);
      const room = rooms[index];
      return room ? roomDisplayName(room, index) : "Room";
    }
    if (kind === "door") return doors.find((d) => d.id === id)?.label ?? "Door";
    if (kind === "stairs") return stairs.find((s) => s.id === id)?.label ?? "Stairs";
    if (kind === "elevator") return elevators.find((el) => el.id === id)?.label ?? "Elevator";
    return ramps.find((r) => r.id === id)?.label ?? "Ramp";
  }, [doors, elevators, ramps, rooms, stairs]);

  const selectDuplicateNavNode = useCallback((node: NavigationNode) => {
    setNavSelected({ type: "node", id: node.id });
    setNavMultiSelected([]);
    setShowProperties(true);
    setNavDuplicateNodeId(node.id);
    window.setTimeout(() => setNavDuplicateNodeId((current) => (current === node.id ? null : current)), 1200);
    toast.info("Navigation point already exists here.", "Delete the existing point first to replace it.");
  }, [toast]);

  const deleteNavSelection = useCallback((target?: { type: "node" | "edge"; id: string }) => {
    // B5 Phase 2.3: the Remove tool targets ONLY the clicked element (consistent
    // with Floor Design erase) — a targeted remove must never silently delete the
    // rest of the current multi-selection. The Delete key (no target) still
    // removes the full multi-selection.
    let nodeIds: string[] = [];
    let edgeIds: string[] = [];
    if (target) {
      if (target.type === "node") nodeIds = [target.id];
      else edgeIds = [target.id];
    } else {
      const selNode = navSelected?.type === "node" ? navSelected.id : null;
      const selEdge = navSelected?.type === "edge" ? navSelected.id : null;
      if (selEdge) edgeIds = [selEdge];
      if (selNode) nodeIds = navMultiSelected.length > 0 ? [...new Set([...navMultiSelected, selNode])] : [selNode];
      else if (navMultiSelected.length > 0) nodeIds = navMultiSelected;
    }
    if (nodeIds.length === 0 && edgeIds.length === 0) {
      toast.info("Nothing selected", "Select a walking point or path to remove it.");
      return;
    }
    const nodeIdSet = new Set(nodeIds);
    const linkedNodes = indoorNodes.filter((node) => nodeIds.includes(node.id) && !!linkedObjectRef(node));
    if (linkedNodes.length > 0) {
      toast.info("Navigation anchor", "Edit or remove navigation from the owning Room, Door, or circulation object.");
      return;
    }
    const selectedJunctions = indoorNodes.filter((node) => nodeIds.includes(node.id) && node.pathJunction);
    if (selectedJunctions.length > 0 && (selectedJunctions.length !== 1 || nodeIds.length !== 1 || edgeIds.length > 0)) {
      toast.warning("Walking Point selected", "Remove or disconnect this point separately so its connected paths stay safe.");
      return;
    }

    // A point inserted onto a manual path may retain internal split provenance.
    // Removing a bare two-segment split point is safe: restore the original
    // corridor in one history action. A branched point is blocked so Delete can
    // never silently destroy a connected route. The admin-facing object remains
    // an ordinary Walking Point in either case.
    if (nodeIds.length === 1 && edgeIds.length === 0) {
      const junction = indoorNodes.find((node) => node.id === nodeIds[0] && node.pathJunction);
      if (junction) {
        const incident = indoorEdges.filter((edge) => edge.startNodeId === junction.id || edge.endNodeId === junction.id);
        // A path junction is only special while its split branches still exist.
        // Once the authoritative current graph has no incident edges, it is an
        // ordinary isolated manual Walking Point and must follow the normal
        // deletion path below (no stale "connected branches" warning).
        if (incident.length === 0) {
          // fall through to the generic node removal below
        } else {
        const parents = incident.filter((edge) => edgeIsParentForJunction(edge, junction.id));
        if (parents.length !== 2 || incident.length !== 2) {
          toast.warning("Walking Point has connected branches", "Disconnect the branches before removing this point.");
          return;
        }
        const [first, second] = parents;
        const compatible = first.type === second.type
          && first.bidirectional === second.bidirectional
          && first.accessible === second.accessible
          && first.emergencySafe === second.emergencySafe
          && first.closed === second.closed;
        if (!compatible) {
          toast.warning("Walking Point cannot be merged", "Its connected paths use different routing settings.");
          return;
        }
        const firstPoints = edgePolylinePoints(first, indoorNodes);
        const secondPoints = edgePolylinePoints(second, indoorNodes);
        if (!firstPoints || !secondPoints) return;
        const orientToJunction = (edge: NavigationEdge, points: { x: number; y: number }[]) =>
          edge.endNodeId === junction.id ? points : [...points].reverse();
        const left = orientToJunction(first, firstPoints);
        const right = orientToJunction(second, secondPoints);
        const mergedPoints = [...left, ...right.slice(1)];
        const merged: NavigationEdge = {
          ...first,
          id: genId("ne"),
          startNodeId: first.startNodeId === junction.id ? first.endNodeId : first.startNodeId,
          endNodeId: second.startNodeId === junction.id ? second.endNodeId : second.startNodeId,
          bendPoints: normalizeBendPoints(mergedPoints.slice(1, -1)),
          distance: navEdgePolylineDistance(mergedPoints),
          pathJunctionId: undefined,
          pathJunctionParent: undefined,
          pathJunctionIds: [...new Set([
            ...(first.pathJunctionIds ?? []),
            ...(second.pathJunctionIds ?? []),
          ])].filter((id) => id !== junction.id),
        };
        if (merged.pathJunctionIds && merged.pathJunctionIds.length > 0) {
          merged.pathJunctionId = merged.pathJunctionIds[merged.pathJunctionIds.length - 1];
          merged.pathJunctionParent = true;
        }
        commitNavGraph(
          indoorNodes.filter((node) => node.id !== junction.id),
          indoorEdges.filter((edge) => !parents.some((parent) => parent.id === edge.id)).concat(merged),
        );
        setNavSelected(null);
        setNavMultiSelected([]);
        toast.success("Walking Point removed", "The corridor was merged back into one walking path.");
        return;
        }
      }
    }
    const removedEdges = indoorEdges.filter((edge) =>
      nodeIdSet.has(edge.startNodeId) || nodeIdSet.has(edge.endNodeId) || edgeIds.includes(edge.id)
    );
    const nextNodes = indoorNodes.filter((n) => !nodeIdSet.has(n.id));
    const nextEdges = indoorEdges.filter((edge) => !removedEdges.includes(edge));
    commitNavGraph(nextNodes, nextEdges);
    // B5 Phase 2.3: a targeted Remove (Remove tool on a group member) prunes only
    // that element from the multi-selection — the remaining members stay selected
    // so the group isn't unexpectedly destroyed. The Delete key (no target)
    // clears the whole selection as before.
    if (target?.type === "node") {
      const remaining = navMultiSelected.filter((id) => id !== target.id);
      if (remaining.length > 0) {
        setNavMultiSelected(remaining);
        setNavSelected({ type: "node", id: remaining[remaining.length - 1] });
        setShowProperties(true);
      } else {
        setNavSelected(null);
        setNavMultiSelected([]);
      }
    } else {
      setNavSelected(null);
      setNavMultiSelected([]);
    }
    toast.success(
      nodeIds.length > 0 && removedEdges.length > 0 ? "Walking Points removed"
      : nodeIds.length > 0 ? "Walking Point removed"
      : "Path removed",
      removedEdges.length > 0
        ? `Removed ${nodeIds.length} waypoint${nodeIds.length !== 1 ? "s" : ""} and ${removedEdges.length} path${removedEdges.length !== 1 ? "s" : ""}.`
        : "The selected walking point was removed."
    );
  }, [commitNavGraph, indoorEdges, indoorNodes, navMultiSelected, navSelected, toast]);

  const navEraseAt = (pt: { x: number; y: number }) => {
    const hitNode = findNavNodeAtPoint(indoorNodes.filter((node) => !node.roomId), pt);
    if (hitNode) { deleteNavSelection({ type: "node", id: hitNode.id }); return; }
    const hitEdge = walkableIndoorEdges.find((edge) => {
      const a = indoorNodes.find((n) => n.id === edge.startNodeId);
      const b = indoorNodes.find((n) => n.id === edge.endNodeId);
      if (!a || !b) return false;
      return distToSegment(pt, { x: a.x, y: a.y }, { x: b.x, y: b.y }) <= 10;
    });
    if (hitEdge) { deleteNavSelection({ type: "edge", id: hitEdge.id }); return; }
    toast.info("Nothing to remove", "Click a walking point or path to remove it.");
  };

  const handleNavNodeDown = (e: React.MouseEvent, node: NavigationNode) => {
    e.stopPropagation();
    if (isSpacePressed()) { startPan(e); return; }
    // Linked navigation cues are derived from their physical owners. With
    // Select active, clicking the cue should still reach the normal physical
    // editor so Rooms, Doors, Stairs, Elevators, and Ramps remain editable
    // while the navigation overlay is visible.
    const linked = linkedObjectRef(node);
    if (navTool === "select" && linked) {
      const physicalType: FloorSelection["type"] = linked.kind === "stair" ? "stairs" : linked.kind as FloorSelection["type"];
      setNavSelected(null);
      setNavMultiSelected([]);
      setNavPhysicalSelected(null);
      setSelected({ type: physicalType, id: linked.id });
      setMultiSelected([]);
      setShowProperties(true);
      return;
    }
    const pt = navPointFromEvent(e);
    if (navTool === "erase") { deleteNavSelection({ type: "node", id: node.id }); return; }
    if (navTool === "waypoint" || navTool === "destination") {
      selectDuplicateNavNode(node);
      setNavTool("select");
      return;
      // Waypoint / Destination / Link Location on an existing node just selects
      // it (no duplicate) — the canonical node is reused.
    }
    if (navTool === "link") {
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      setShowProperties(true);
      setNavTool("select");
      toast.info("Already added to navigation", "This location already has a navigation point.");
      return;
    }
    if (navTool === "connect") { navConnectAtPoint(pt); return; }
    const multiBase = navMultiSelected.length > 0 ? navMultiSelected
      : navSelected?.type === "node" ? [navSelected.id] : [];
    if (e.shiftKey) {
      const next = multiBase.includes(node.id) ? multiBase.filter((id) => id !== node.id) : [...multiBase, node.id];
      setNavMultiSelected(next);
      setNavSelected({ type: "node", id: node.id });
      setShowProperties(true);
      return;
    }
    // B5 Phase 2.3: clicking a member of the CURRENT multi-selection PRESERVES
    // the whole group (Figma/outdoor-editor style) — dragging it moves the full
    // set and the multi-selection Properties stay open. Only clicking an
    // UNRELATED node collapses to single-object editing.
    const isMultiMember = multiBase.length > 1 && multiBase.includes(node.id);
    if (isMultiMember) {
      setNavSelected({ type: "node", id: node.id });
      setShowProperties(true);
    } else {
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      setShowProperties(true);
    }
    // Linked nodes are derived geometry — never draggable.
    if (linkedObjectRef(node)) return;
    // Free waypoints move as a rigid group (linked nodes excluded from the move).
    const dragBase = isMultiMember ? multiBase : [node.id];
    const hadLinkedInMulti = dragBase.some((id) => {
      const n = indoorNodes.find((x) => x.id === id);
      return !!n && !!linkedObjectRef(n);
    });
    const ids = [...new Set([...dragBase.filter((id) => {
      const n = indoorNodes.find((x) => x.id === id);
      return n && !linkedObjectRef(n);
    }), node.id])];
    const origins = indoorNodes.filter((n) => ids.includes(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
    if (origins.length === 0) return;
    // B5 Phase 2.2: predictable mixed rule — free nodes move, linked locations
    // stay attached to their floor objects (one concise toast).
    if (hadLinkedInMulti) {
      toast.info("Linked locations stay put", "Linked locations remain attached to their floor objects.");
    }
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    // B5 correction: snapshot the INTERNAL edge bends (both endpoints moving)
    // alongside the node origins for one rigid group translation.
    const movingIds = new Set(ids);
    const edgeOrigins = new Map<string, { x: number; y: number }[]>();
    for (const ed of indoorEdges) {
      if (movingIds.has(ed.startNodeId) && movingIds.has(ed.endNodeId)) {
        edgeOrigins.set(ed.id, (ed.bendPoints ?? []).map((b) => ({ x: b.x, y: b.y })));
      }
    }
    navDragRef.current = { ids, origins, edgeOrigins, sx: pt.x, sy: pt.y };
  };

  // ── B5 correction: empty-space drag surface inside the nav group outline ──
  // Pointerdown anywhere in the group bounds' EMPTY interior starts the SAME
  // rigid group drag as grabbing a member waypoint (identical snapshot + 1:1
  // translation pipeline — only the pointerdown origin differs). Priority:
  // bend handle > node > edge > physical object > empty group interior.
  const handleNavGroupSurfaceDown = (e: React.MouseEvent) => {
    if (navTool !== "select") return;
    const pt = navPointFromEvent(e);
    // A physical object (room/door/stair/elevator/ramp) under the pointer keeps
    // its Navigation-mode selection behavior — the surface must never swallow it.
    const physical = resolveNavTargetAt(pt);
    if (physical) {
      e.stopPropagation();
      selectFloorItem({ type: physical.kind, id: physical.id });
      return;
    }
    const freeIds = navMultiSelected.filter((id) => {
      const n = indoorNodes.find((x) => x.id === id);
      return Boolean(n && !linkedObjectRef(n));
    });
    if (freeIds.length < 2) return;
    e.stopPropagation();
    e.preventDefault();
    setNavSelected({ type: "node", id: freeIds[0] });
    setShowProperties(true);
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    const origins = indoorNodes.filter((n) => freeIds.includes(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
    const movingIds = new Set(freeIds);
    const edgeOrigins = new Map<string, { x: number; y: number }[]>();
    for (const ed of indoorEdges) {
      if (movingIds.has(ed.startNodeId) && movingIds.has(ed.endNodeId)) {
        edgeOrigins.set(ed.id, (ed.bendPoints ?? []).map((b) => ({ x: b.x, y: b.y })));
      }
    }
    navDragRef.current = { ids: freeIds, origins, edgeOrigins, sx: pt.x, sy: pt.y };
  };

  const handleNavEdgeDown = (e: React.MouseEvent, edge: NavigationEdge) => {
    // B5 Phase 6.7: Add Waypoint tool should not be intercepted by edge selection
    // — let the click fall through to handleNavSvgDown for edge insertion
    if (navTool === "waypoint" || navTool === "destination") return;
    e.stopPropagation();
    if (isSpacePressed()) { startPan(e); return; }
    if (navTool === "erase") { deleteNavSelection({ type: "edge", id: edge.id }); return; }
    if (navTool === "connect") {
      const point = navPointFromEvent(e);
      const hoveredTarget = navPathTargetHover?.edgeId === edge.id
        ? navPathTargetHover
        : undefined;
      navConnectAtPoint(point, edge, hoveredTarget);
      return;
    }
    if (navTool === "select") {
      const physical = resolveNavTargetAt(navPointFromEvent(e));
      if (physical) {
        selectFloorItem({ type: physical.kind, id: physical.id });
        return;
      }
    }
    // B5 Phase 2.7: dragging a SEGMENT of the already-selected segmented path
    // translates it perpendicular (draw.io-style); a plain click still selects.
    const isSel = navSelected?.type === "edge" && navSelected.id === edge.id;
    if (navTool === "select") {
      const pt = navPointFromEvent(e);
      const segPts = edgePolylinePoints(edge, indoorNodes);
      if (segPts && segPts.length >= 2) {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < segPts.length - 1; i++) {
          const d = distanceToSegment(pt, segPts[i], segPts[i + 1]);
          if (d < bestD) { bestD = d; best = i; }
        }
        const p0 = segPts[best];
        const p1 = segPts[best + 1];
        const axisAligned = p0.x === p1.x || p0.y === p1.y;
        const diagonal = !axisAligned;
        // Axis-aligned segment dragging remains available for authored bends;
        // a plain diagonal edge is also draggable and is reshaped into a clean
        // orthogonal dog-leg while its canonical endpoints stay fixed.
        if ((axisAligned && isSel && edge.bendPoints && edge.bendPoints.length > 0) || diagonal) {
          suppressHistoryRef.current = true;
          gestureMoved.current = false;
          navDragWallWarnedRef.current = false;
          // A diagonal can be dragged directly from an unselected path. Keep
          // the normal selection semantics while the gesture starts.
          if (!isSel) {
            setNavSelected({ type: "edge", id: edge.id });
            setNavMultiSelected([]);
            setShowProperties(true);
          }
          // B5 Phase 2.8: store the IMMUTABLE drag-start snapshot — geometry is
          // always computed from this + the current delta, never compounded on
          // already-modified live bends (the exaggerated-movement bug) and never
          // appending corner bends per pointermove (the too-many-bends bug).
          navSegDragRef.current = {
            edgeId: edge.id,
            segIndex: best,
            ox: pt.x,
            oy: pt.y,
            origBends: [...(edge.bendPoints ?? [])],
            origPts: segPts,
            isHorizontal: p0.y === p1.y || (diagonal && Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y)),
            isDiagonal: diagonal,
          };
          return;
        }
      }
    }
    setNavSelected({ type: "edge", id: edge.id });
    setNavMultiSelected([]);
    setShowProperties(true);
    setNavSelectedBend(null);
  };

  // B5 Phase 2.6: hovering the SELECTED path's hit line remembers which segment
  // the pointer is nearest — Add Bend then splits that exact segment.
  const handleNavEdgeMove = (e: React.MouseEvent, edge: NavigationEdge) => {
    if (navTool === "connect") {
      // Connect uses the edge only as a lightweight hit target; the actual
      // split/junction mutation occurs on click.  Keep the nearest segment and
      // projected point as transient UI state so the line itself visibly reads
      // as a valid target (without reconciling or mutating the graph on move).
      if (!navConnectStart || !isManualIndoorWalkingEdge(edge, indoorNodes)) {
        setNavPathTargetHover(null);
        setNavSegmentHover(null);
        return;
      }
      const point = navPointFromEvent(e);
      const nodeMap: Record<string, { x: number; y: number }> = Object.fromEntries(
        indoorNodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      );
      const hit = findNavEdgeAtPoint([edge], nodeMap, point);
      if (!hit) {
        setNavPathTargetHover(null);
        setNavSegmentHover(null);
        return;
      }
      // Keep the mathematical projection, not a rounded cursor coordinate, so
      // the preview marker and the committed junction remain on the same
      // segment (including diagonal segments).
      const nearest = { x: hit.nearest.x, y: hit.nearest.y };
      setNavPathTargetHover({ edgeId: edge.id, index: hit.nearest.segIndex, point: nearest });
      setNavSegmentHover(null);
      return;
    }
    if (navTool !== "select" || !(navSelected?.type === "edge" && navSelected.id === edge.id)) return;
    const pt = navPointFromEvent(e);
    const pts = edgePolylinePoints(edge, indoorNodes);
    if (!pts || pts.length < 2) return;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distanceToSegment(pt, pts[i], pts[i + 1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    setNavSegmentHover({ edgeId: edge.id, index: best });
  };

  // B5 Phase 2.5: grab a bend handle on a segmented path — the path reshapes
  // live during drag and commits ONE history action on mouse-up. B5 Phase 2.6:
  // grabbing a bend also SELECTS that specific bend (Remove Bend / Delete then
  // target it precisely) and opens the edge inspector.
  const handleNavBendDown = (e: React.MouseEvent, edge: NavigationEdge, index: number) => {
    e.stopPropagation();
    if (isSpacePressed()) { startPan(e); return; }
    if (navTool !== "select") return;
    const pt = navPointFromEvent(e);
    const orig = edge.bendPoints?.[index] ?? { x: pt.x, y: pt.y };
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    navBendDragRef.current = { edgeId: edge.id, index, ox: orig.x, oy: orig.y };
    setNavSelected({ type: "edge", id: edge.id });
    setNavSelectedBend({ edgeId: edge.id, index });
    setShowProperties(true);
  };

  // B8 Phase 1: unified editor — toggle navigation overlay on/off.
  // When ON: nav graph visible + editable, physical tools still work.
  // When OFF: clean design workspace.
  const toggleNavigation = useCallback(() => {
    const next = !showNavOverlay;
    if (!next && testNavOpen) return;
    setShowNavOverlay(next);
    if (!next) {
      cancelElevatorTransition();
      // Turning OFF: reset all nav state so the canvas is clean.
      setNavConnectStart(null);
      setNavPreview(null);
      setNavConnectBends([]);
      navConnectBendGroupsRef.current = [];
      setNavTargetHover(null);
      setNavDragPreview(null);
      setNavDragBlocked(null);
      setNavEraseHover(null);
      setNavNodeHover(null);
      setNavSelectedBend(null);
      setNavSegmentHover(null);
      setNavPathTargetHover(null);
      setNavAlignGuides([]);
      navDragWallWarnedRef.current = false;
      navLibraryDragRef.current = null;
      navBendDragRef.current = null;
      navSegDragRef.current = null;
      setRubberBand(null);
      setNavSelected(null);
      setNavMultiSelected([]);
      setNavTool("select");
      setRoomDrag(null);
      alignmentSnapLocksRef.current = { x: null, y: null };
      setTool("select");
      setTestNavOpen(false); // Close test route panel when nav overlay turns off.
    }
  }, [cancelElevatorTransition, showNavOverlay, testNavOpen]);
  // Keep backward compat for any remaining callers.
  const switchFloorEditorMode = useCallback((nextMode: FloorEditorMode) => {
    if (nextMode === "navigation" && !showNavOverlay) toggleNavigation();
    else if (nextMode === "structure" && showNavOverlay) toggleNavigation();
  }, [showNavOverlay, toggleNavigation]);

  const selectNavTool = useCallback((id: "select" | "pan" | "waypoint" | "destination" | "connect" | "link" | "erase") => {
    clearRoomDoorLinkState();
    setRoomDrag(null);
    alignmentSnapLocksRef.current = { x: null, y: null };
    if (id !== "select" && id !== "pan") setShowNavOverlay(true);
    if (id !== "connect") { setNavConnectStart(null); setNavPreview(null); setNavConnectBends([]); navConnectBendGroupsRef.current = []; }
    setNavTool(id);
    setNavEraseHover(null);
    setNavNodeHover(null);
    setNavAlignGuides([]);
    if (id !== "select") setNavSelectedBend(null);
    setNavSegmentHover(null);
    setNavPathTargetHover(null);
  }, [clearRoomDoorLinkState]);

  const commitNavEdgeBetween = useCallback((
    startId: string,
    endId: string,
    nodes: NavigationNode[] = indoorNodes,
    edges: NavigationEdge[] = indoorEdges,
    pinnedBends: { x: number; y: number }[] = []
  ): boolean => {
    const clearConnect = () => {
      setNavConnectStart(null);
      setNavPreview(null);
      setNavConnectBends([]);
      navConnectBendGroupsRef.current = [];
      setNavPathTargetHover(null);
    };
    if (startId === endId) {
      toast.info("Cannot connect a walking point to itself", "Pick a different destination.");
      clearConnect();
      return false;
    }
    const a = nodes.find((n) => n.id === startId);
    const b = nodes.find((n) => n.id === endId);
    if (!a || !b) return false;
    if (a.roomId || b.roomId) {
      toast.info("Use the Room Door", "Rooms use their linked Door. Select the Room and choose Link Room Door.");
      clearConnect();
      return false;
    }
    // B5 Phase 2.5/2.7: indoor connectors stay ORTHOGONAL by default. Every
    // pinned bend (Phase 2.7 empty-space clicks) becomes part of THIS one edge,
    // and the final segment from the last pinned point (or the start) to the
    // destination gets the same wall-safe auto-L the preview promised — so the
    // committed shape is always exactly what was previewed.
    const last = pinnedBends.length > 0 ? pinnedBends[pinnedBends.length - 1] : { x: a.x, y: a.y };
    const tail = orthogonalBendsFor(last, { x: b.x, y: b.y }, walls, doors, { width: FP_W, height: FP_H });
    const bends = [...pinnedBends, ...tail];
    const polyline = bends.length > 0 ? [{ x: a.x, y: a.y }, ...bends, { x: b.x, y: b.y }] : null;
    // Every segment of the final path is wall-validated (no automatic routing).
    const blocked = polyline
      ? edgePolylineCrossesWallWithoutDoor(polyline, walls, doors)
      : edgeCrossesWallWithoutDoor({ x: a.x, y: a.y }, { x: b.x, y: b.y }, walls, doors);
    // B5 Phase 2.9A: clicking an INVALID preview must NOT create the edge or
    // add history — and the connection stays ACTIVE so the admin can reposition
    // or pin a different bend. The red invalid preview keeps showing while the
    // pointer is still on the blocked target, so the rejection is self-evident.
    if (blocked) {
      toast.warning("Paths must pass through a door opening", `The path crosses a wall at (${blocked.x}, ${blocked.y}).`);
      return false;
    }
    const candidatePoints = polyline ?? [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    const proposedBends = normalizeBendPoints(bends.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })));
    const dup = edges.find((edge) => isEquivalentManualIndoorWalkingEdge(edge, nodes, startId, endId, proposedBends));
    if (dup) {
      toast.info("These Walking Points are already connected.", "Select the existing path to edit it.");
      clearConnect();
      return false;
    }
    // A Connect commit always creates one edge between its two explicit
    // canonical targets. There is intentionally no geometric path splitting
    // or implicit convergence here.
    const pieces = [{ startNodeId: startId, endNodeId: endId, points: candidatePoints }];
    const created: NavigationEdge[] = [];
    for (const piece of pieces) {
      const normalized = normalizeBendPoints(piece.points.slice(1, -1).map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })));
      // Endpoint equality alone is not a duplicate: authored parallel paths
      // may intentionally differ in direction, accessibility, emergency
      // safety, closure, bends, or other routing metadata. Reuse the same
      // equivalence contract as the graph normalizer instead.
      const existing = edges.find((existingEdge) => isEquivalentManualIndoorWalkingEdge(
        existingEdge,
        nodes,
        piece.startNodeId,
        piece.endNodeId,
        normalized,
      ));
      if (existing) continue;
      const nextEdge = createNavEdge({ id: genId("ne"), startNodeId: piece.startNodeId, endNodeId: piece.endNodeId, nodes, type: "hallway" });
      nextEdge.bendPoints = normalized.length > 0 ? normalized : undefined;
      nextEdge.distance = navEdgePolylineDistance([piece.points[0], ...normalized, piece.points[piece.points.length - 1]]);
      created.push(nextEdge);
    }
    if (created.length === 0) {
      toast.info("These Walking Points are already connected.", "Select the existing path to edit it.");
      clearConnect();
      return false;
    }
    if (bends.length > 0 && polyline && pieces.length === 1 && created.length === 1) {
      // B5 Phase 2.8: normalize the committed polyline (drop duplicate /
      // collinear bends) so authored geometry stays clean.
      const normalized = normalizeBendPoints(bends.map((bp) => ({ x: Math.round(bp.x), y: Math.round(bp.y) })));
      created[0].bendPoints = normalized;
      // Distance/weight = TOTAL polyline length (start → bends → end).
      created[0].distance = navEdgePolylineDistance([polyline[0], ...normalized, polyline[polyline.length - 1]]);
    }
    commitNavGraph(nodes, [...edges, ...created]);
    setNavSelected({ type: "edge", id: created[0].id });
    setNavMultiSelected([]);
    setShowProperties(true);
    clearConnect();
    toast.success("Connection created", `Walking points connected (${created[0].distance} units).`);
    return true;
  }, [commitNavGraph, doors, indoorEdges, indoorNodes, toast, walls]);

  /**
   * Connect an existing semantic/free navigation node directly to a manual
   * Walking Path.  A path click is an explicit junction authoring action: the
   * target edge is split into two canonical edges, then the source connector
   * terminates at the new (or reused endpoint) node in the SAME commit.  This
   * deliberately never infers connectivity from coordinate overlap elsewhere
   * in the graph.
   */
  const commitNavEdgeToExistingPath = useCallback((
    startId: string,
    targetEdge: NavigationEdge,
    point: { x: number; y: number },
    nodes: NavigationNode[] = indoorNodes,
    edges: NavigationEdge[] = indoorEdges,
    pinnedBends: { x: number; y: number }[] = [],
    /** Exact target captured by the Connect hover.  When present, the commit
     * must use this edge segment/projected point rather than resolving a new
     * generic nearest-node target on mouse-up. */
    pathTarget?: { edgeId: string; segmentIndex: number; projectedPoint: { x: number; y: number } },
  ): boolean => {
    const edge = edges.find((candidate) => candidate.id === targetEdge.id);
    if (!edge || !isManualIndoorWalkingEdge(edge, nodes)) {
      toast.info("This connection is managed", "Connect onto a manual Walking Path or use its existing junction.");
      return false;
    }
    const nodeMap: Record<string, { x: number; y: number }> = Object.fromEntries(
      nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );
    const targetSegment = pathTarget?.edgeId === edge.id
      ? pathTarget.segmentIndex
      : undefined;
    const edgePoints = edgePolylinePoints(edge, nodes);
    let hit: ReturnType<typeof findNavEdgeAtPoint> = null;
    // The hover state already projected the pointer onto a specific segment.
    // Preserve that exact segment through commit; only reject it if the graph
    // changed underneath the pointer and the captured projection is no longer
    // on that segment.  The fallback is used for direct edge clicks where no
    // prior mousemove was delivered (e.g. keyboard/synthetic events).
    if (
      Number.isInteger(targetSegment)
      && edgePoints
      && targetSegment! >= 0
      && targetSegment! < edgePoints.length - 1
      && pathTarget
    ) {
      const a = edgePoints[targetSegment!];
      const b = edgePoints[targetSegment! + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0) {
        let t = ((pathTarget.projectedPoint.x - a.x) * dx + (pathTarget.projectedPoint.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projected = { x: a.x + dx * t, y: a.y + dy * t };
        const dist = Math.hypot(pathTarget.projectedPoint.x - projected.x, pathTarget.projectedPoint.y - projected.y);
        if (dist <= NAV_EDGE_SNAP_THRESHOLD) {
          hit = {
            edge,
            nearest: {
              // Keep the captured projected point (rather than the nearest
              // node) as the authoritative join location. It remains exact so
              // persisted diagonal junctions stay mathematically on-segment.
              x: pathTarget.projectedPoint.x,
              y: pathTarget.projectedPoint.y,
              dist,
              segIndex: targetSegment!,
              t,
            },
          };
        }
      }
    }
    if (!hit) hit = findNavEdgeAtPoint([edge], nodeMap, point);
    if (!hit) return false;

    // Endpoint/junction reuse is based on actual canvas distance, not a broad
    // percentage of the edge.  A midpoint on a short/long path must still
    // split; only a genuinely nearby endpoint is reused.
    const startNode = nodes.find((node) => node.id === edge.startNodeId);
    const endNode = nodes.find((node) => node.id === edge.endNodeId);
    const endpointDistance = (node: NavigationNode | undefined) => node
      ? Math.hypot(hit!.nearest.x - node.x, hit!.nearest.y - node.y)
      : Infinity;
    const endpoint = endpointDistance(startNode) <= NAV_NODE_HIT_THRESHOLD
      ? startNode
      : endpointDistance(endNode) <= NAV_NODE_HIT_THRESHOLD
        ? endNode
        : undefined;
    if (endpoint) {
      return commitNavEdgeBetween(startId, endpoint.id, nodes, edges, pinnedBends);
    }

    // A pre-existing node on the target segment is an explicit canonical
    // target. Reuse it only when it lies on the hovered segment and is actually
    // close to the captured projection; unrelated nearby nodes must not steal a
    // midpoint path click. (This intentionally includes user Walking Points as
    // well as internally-created path junctions.)
    if (edgePoints && Number.isInteger(hit.nearest.segIndex)) {
      const segIndex = hit.nearest.segIndex;
      const a = edgePoints[segIndex];
      const b = edgePoints[segIndex + 1];
      const existingJunction = nodes
        .filter((node) => node.id !== startId)
        .map((node) => ({ node, distance: Math.hypot(node.x - hit!.nearest.x, node.y - hit!.nearest.y), onSegment: distanceToSegment(node, a, b) }))
        .filter(({ distance, onSegment }) => distance <= NAV_NODE_HIT_THRESHOLD && onSegment <= NAV_NODE_HIT_THRESHOLD)
        .sort((left, right) => left.distance - right.distance)[0]?.node;
      if (existingJunction) {
        return commitNavEdgeBetween(startId, existingJunction.id, nodes, edges, pinnedBends);
      }
    }

    // The projected point captured by Connect is the source of truth for the
    // new junction. createIndoorNavNode intentionally rounds ordinary authored
    // coordinates, but rounding a diagonal projection can move the junction
    // off the segment. Keep the canonical node metadata from the helper while
    // retaining the exact segment coordinate for this explicit split.
    const junctionBase = createIndoorNavNode({
      id: genId("nn"),
      x: hit.nearest.x,
      y: hit.nearest.y,
      buildingId,
      floorId,
      campusId: campus.id,
      name: "Waypoint",
      type: "hallway",
      pathJunction: true,
    });
    const junction = { ...junctionBase, x: hit.nearest.x, y: hit.nearest.y };
    const split = splitIndoorNavEdge(edge, junction, nodes, hit.nearest.segIndex);
    if (!split) return false;
    const nextNodes = [...nodes, junction];
    const nextEdges = edges
      .filter((candidate) => candidate.id !== edge.id)
      .concat(split.newEdges);
    // If the source is already one endpoint of the target path, the split
    // edge itself is the canonical source↔junction connector.  Do not add a
    // second indistinguishable edge on top of it.
    if (startId === edge.startNodeId || startId === edge.endNodeId) {
      commitNavGraph(nextNodes, nextEdges, { splitNodeIds: new Set([junction.id]) });
      const sourceEdge = split.newEdges.find((candidate) =>
        candidate.startNodeId === startId || candidate.endNodeId === startId,
      );
      if (sourceEdge) setNavSelected({ type: "edge", id: sourceEdge.id });
      setNavMultiSelected([]);
      setShowProperties(true);
      setNavConnectStart(null);
      setNavPreview(null);
      setNavConnectBends([]);
      navConnectBendGroupsRef.current = [];
      setNavPathTargetHover(null);
      toast.success("Junction created", "The existing Walking Path was split at the connection.");
      return true;
    }
    // commitNavEdgeBetween calls commitNavGraph exactly once, so the split and
    // source connector become one logical undo/history action.
    return commitNavEdgeBetween(startId, junction.id, nextNodes, nextEdges, pinnedBends);
  }, [buildingId, campus.id, commitNavEdgeBetween, commitNavGraph, floorId, indoorEdges, indoorNodes, splitIndoorNavEdge, toast]);

  // ── B5 Phase 2.6: bend editing actions — ONE history action each ───────────

  /** Insert a bend at the midpoint of the hovered segment (else the LONGEST
   *  segment) so Add Bend never stacks a new handle on top of an existing bend. */
  const addBendToEdge = useCallback((edgeId: string) => {
    const edge = indoorEdges.find((e) => e.id === edgeId);
    if (!edge) return;
    const base = edgePolylinePoints(edge, indoorNodes);
    if (!base || base.length < 2) return;
    // B5 Phase 2.11: intended segment — the hovered segment, else the segment
    // that FOLLOWS the selected bend, else the longest segment. Add Bend must
    // visibly alter the path without requiring an invisible hover state.
    let segIndex = navSegmentHover?.edgeId === edgeId ? navSegmentHover.index : -1;
    if (segIndex < 0 || segIndex >= base.length - 1) {
      if (navSelectedBend?.edgeId === edgeId) {
        segIndex = Math.min(navSelectedBend.index + 1, base.length - 2);
      }
    }
    if (segIndex < 0 || segIndex >= base.length - 1) {
      let best = 0;
      let bestLen = -1;
      for (let i = 0; i < base.length - 1; i++) {
        const len = Math.hypot(base[i + 1].x - base[i].x, base[i + 1].y - base[i].y);
        if (len > bestLen) { bestLen = len; best = i; }
      }
      segIndex = best;
    }
    const p = base[segIndex];
    const q = base[segIndex + 1];
    const segLen = Math.hypot(q.x - p.x, q.y - p.y);
    if (segLen < 2) return; // degenerate — nothing useful to split
    const mx = Math.round((p.x + q.x) / 2);
    const my = Math.round((p.y + q.y) / 2);
    // B5 Phase 2.11: a plain collinear midpoint is normalized away instantly —
    // split with a USEFUL orthogonal dog-leg (U-shape corner pair) so the new
    // geometry survives and the segment can actually be reshaped. Modest
    // deterministic offset; legacy diagonal segments get a V midpoint instead.
    const offset = Math.max(10, Math.min(24, Math.round(segLen / 4)));
    const horizontal = p.y === q.y;
    const vertical = p.x === q.x;
    const candidates: NavPoint[][] = horizontal
      ? [
          [{ x: mx, y: my }, { x: mx, y: my + offset }, { x: q.x, y: my + offset }],
          [{ x: mx, y: my }, { x: mx, y: my - offset }, { x: q.x, y: my - offset }],
        ]
      : vertical
        ? [
            [{ x: mx, y: my }, { x: mx + offset, y: my }, { x: mx + offset, y: q.y }],
            [{ x: mx, y: my }, { x: mx - offset, y: my }, { x: mx - offset, y: q.y }],
          ]
        : (() => {
            const perp = { x: -(q.y - p.y), y: q.x - p.x };
            const plen = Math.hypot(perp.x, perp.y) || 1;
            return [
              [{ x: Math.round(mx + (perp.x / plen) * offset), y: Math.round(my + (perp.y / plen) * offset) }],
              [{ x: Math.round(mx - (perp.x / plen) * offset), y: Math.round(my - (perp.y / plen) * offset) }],
            ];
          })();
    // B5 Phase 2.10/2.11: pick the FIRST wall-clear side — the FULL proposed
    // polyline runs through the strict wall check and every new bend is point-
    // validated (and kept inside the floor canvas). Wall validity wins over
    // alignment; when no side is clear the action is rejected with feedback.
    let chosen: NavPoint[] | null = null;
    for (const cand of candidates) {
      const nextPts = [...base.slice(0, segIndex + 1), ...cand, ...base.slice(segIndex + 1)];
      const blocked = edgePolylineCrossesWallWithoutDoor(nextPts, walls, doors) !== null
        || cand.some((bp) => pointInsideWallObstacle(bp, walls, doors) !== null)
        || cand.some((bp) => bp.x < 0 || bp.y < 0 || bp.x > FP_W || bp.y > FP_H);
      if (!blocked) { chosen = cand; break; }
    }
    if (!chosen) {
      toast.warning("Path blocked by wall", "No clear side is available for the new bend — move the geometry manually.");
      return;
    }
    const newBends = normalizeBendPoints([...base.slice(1, segIndex + 1), ...chosen, ...base.slice(segIndex + 1, -1)]);
    const nextPts = [base[0], ...newBends, base[base.length - 1]];
    commitNavGraph(
      indoorNodes,
      indoorEdges.map((e) => e.id === edgeId
        ? { ...e, bendPoints: newBends, distance: navEdgePolylineDistance(nextPts) }
        : e)
    );
    // The bend set changed — a previously selected bend index may now point at
    // a different bend, so clear the selection rather than stale-target it.
    setNavSelectedBend((s) => (s?.edgeId === edgeId ? null : s));
  }, [commitNavGraph, doors, indoorEdges, indoorNodes, navSegmentHover, navSelectedBend, toast, walls]);

  /** Remove a specific bend (defaults to the selected one, else the last).
   *  Neighboring segments reconnect and the distance recomputes. */
  const removeBendFromEdge = useCallback((edgeId: string, forcedIndex?: number) => {
    const edge = indoorEdges.find((e) => e.id === edgeId);
    if (!edge || !edge.bendPoints || edge.bendPoints.length === 0) return;
    const idx = forcedIndex ?? (navSelectedBend?.edgeId === edgeId ? navSelectedBend.index : edge.bendPoints.length - 1);
    if (idx < 0 || idx >= edge.bendPoints.length) return;
    const nextBends = edge.bendPoints.filter((_, i) => i !== idx);
    const pts = edgePolylinePoints({ ...edge, bendPoints: nextBends.length > 0 ? nextBends : undefined }, indoorNodes);
    commitNavGraph(
      indoorNodes,
      indoorEdges.map((e) => e.id === edgeId
        ? { ...e, bendPoints: nextBends.length > 0 ? nextBends : undefined, distance: pts ? navEdgePolylineDistance(pts) : e.distance }
        : e)
    );
    setNavSelectedBend((s) => (s?.edgeId === edgeId ? null : s));
  }, [commitNavGraph, indoorEdges, indoorNodes, navSelectedBend]);

  /** Straighten removes ALL intermediate bends — but never silently creates a
   *  wall-crossing path: the direct A→B line is validated first. */
  const straightenEdge = useCallback((edgeId: string) => {
    const edge = indoorEdges.find((e) => e.id === edgeId);
    if (!edge) return;
    const base = edgePolylinePoints(edge, indoorNodes);
    if (!base || base.length < 2) return;
    const a = base[0];
    const b = base[base.length - 1];
    if (edgePolylineCrossesWallWithoutDoor([a, b], walls, doors)) {
      toast.warning("Can't straighten", "The direct path crosses a wall without a door opening — keep a bend or add a door.");
      return;
    }
    commitNavGraph(
      indoorNodes,
      indoorEdges.map((e) => e.id === edgeId
        ? { ...e, bendPoints: undefined, distance: Math.round(Math.hypot(b.x - a.x, b.y - a.y)) }
        : e)
    );
    setNavSelectedBend((s) => (s?.edgeId === edgeId ? null : s));
  }, [commitNavGraph, doors, indoorEdges, indoorNodes, toast, walls]);

  const navWaypointAt = useCallback((pt: { x: number; y: number }) => {
    // 1. Existing node → select it (or use as connect target).
    const hit = findNavNodeAtPoint(indoorNodes.filter((node) => !node.roomId), pt);
    if (hit) return { kind: "node" as const, node: hit };
    // 2. Door target → create/reuse its canonical door node.
    const door = findDoorAtPoint(doors, pt);
    if (door) {
      const existing = indoorNodes.find((n) => n.doorId === door.id);
      if (existing) return { kind: "node" as const, node: existing };
      const node = createIndoorNavNode({
        id: genId("nn"), x: door.x, y: door.y, buildingId, floorId, campusId: campus.id,
        name: door.label ?? "Door", type: "hallway", doorId: door.id,
      });
      commitNavGraph([...indoorNodes, node], indoorEdges);
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      return { kind: "node" as const, node };
    }
    // 3. Room target → create/reuse its canonical room destination node.
    const room = findRoomAtPoint(rooms, pt);
    if (room) {
      const hasDoor = doors.some((d) => {
        const wall = walls.find((w) => w.id === d.wallId);
        return !!wall && (wall.startAnchor?.roomId === room.id || wall.endAnchor?.roomId === room.id);
      });
      if (!hasDoor) {
        toast.info("Add a door before connecting this room to the walking network", "Room destinations connect through their doorway.");
      }
      const existing = indoorNodes.find((n) => n.roomId === room.id);
      if (existing) return { kind: "node" as const, node: existing };
      // B5 Phase 2.4: the room-linked node's canonical position is the routing
      // anchor (deterministic offset above the center) so the nav cue and edge
      // endpoints never land on the room's centered name label.
      const anchor = roomLinkedCuePosition(room);
      const node = createIndoorNavNode({
        id: genId("nn"), x: anchor.x, y: anchor.y, buildingId, floorId, campusId: campus.id,
        name: roomDisplayName(room, rooms.findIndex((candidate) => candidate.id === room.id)), type: "room_access", roomId: room.id,
      });
      commitNavGraph([...indoorNodes, node], indoorEdges);
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      return { kind: "node" as const, node };
    }
    // 4. Stairs / elevator / ramp targets.
    const circ = findCirculationAtPoint(stairs, elevators, ramps, pt);
    if (circ) {
      const existing = indoorNodes.find((n) =>
        circ.kind === "stairs" ? n.stairId === circ.id
        : circ.kind === "elevator" ? n.elevatorId === circ.id
        : n.rampId === circ.id
      );
      if (existing) return { kind: "node" as const, node: existing };
      const owner = circ.kind === "stairs" ? stairs.find((s) => s.id === circ.id)
        : circ.kind === "elevator" ? elevators.find((el) => el.id === circ.id)
        : ramps.find((r) => r.id === circ.id);
      if (!owner) return { kind: "free" as const, x: pt.x, y: pt.y };
      // B5 Phase 2.5: the ramp-linked node uses a deterministic interior anchor
      // B5 Phase 2.6: every circulation LOGICAL anchor is the object center —
      // route edges terminate there. The visual ramp badge may offset
      // (rampLinkedCuePosition) so it never covers the centered accessibility
      // icon, but the routing node coordinate stays the transformed center.
      // The Stair node follows the physical floor-facing entry; other
      // circulation anchors keep their established center semantics.
      const anchor = circ.kind === "stairs"
        ? stairEntryPosition(owner as FloorStairs)
        : circ.kind === "elevator"
          ? elevatorEntryPosition(owner as FloorElevatorItem)
          : { x: Math.round(owner.x + owner.width / 2), y: Math.round(owner.y + owner.height / 2) };
      const type = circ.kind === "stairs" ? "stair" : circ.kind === "elevator" ? "elevator" : "ramp";
      const node = createIndoorNavNode({
        id: genId("nn"), x: anchor.x, y: anchor.y, buildingId, floorId, campusId: campus.id,
        name: circ.kind === "stairs" ? (owner as FloorStairs).label ?? "Stairs" : circ.kind === "elevator" ? (owner as FloorElevatorItem).label ?? "Elevator" : (owner as FloorRamp).label ?? "Ramp",
        type,
        stairId: circ.kind === "stairs" ? circ.id : undefined,
        elevatorId: circ.kind === "elevator" ? circ.id : undefined,
        rampId: circ.kind === "ramp" ? circ.id : undefined,
        transitionSharedId: circ.kind === "stairs" || circ.kind === "elevator"
          ? (owner as FloorStairs | FloorElevatorItem).sharedId
          : undefined,
      });
      commitNavGraph([...indoorNodes, node], indoorEdges);
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      return { kind: "node" as const, node };
    }
    // 5. Free outdoor-style indoor waypoint.
    return { kind: "free" as const, x: pt.x, y: pt.y };
  }, [buildingId, campus.id, commitNavGraph, doors, elevators, floorId, indoorEdges, indoorNodes, ramps, rooms, stairs, toast, walls]);

  const ensureLinkedNavigationNode = useCallback((kind: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => {
    const existing = linkedNodeForPhysical(kind, id);
    if (existing) return { node: existing, created: false };
    const pt = physicalNavPoint(kind, id);
    if (!pt) return null;
    const result = navWaypointAt(pt);
    if (result.kind !== "node") return null;
    return { node: result.node, created: true };
  }, [linkedNodeForPhysical, navWaypointAt, physicalNavPoint]);

  const addPhysicalToNavigation = useCallback((type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => {
    const result = ensureLinkedNavigationNode(type, id);
    if (!result) return;
    // B5 Phase 6.10: when Add is invoked from the Navigation-mode physical-object
    // panel, keep that panel open — the shared card flips to Linked in place.
    // (navWaypointAt internally selects the freshly created node, so we must
    // re-assert the physical selection here to stay on the physical panel.)
    const keepsPhysicalInspector = navMode && selected?.type === type && selected.id === id;
    if (keepsPhysicalInspector || (navMode && navPhysicalSelected)) {
      setNavSelected(null);
      setNavMultiSelected([]);
      setNavPhysicalSelected(keepsPhysicalInspector ? null : { type, id });
    } else {
      setNavSelected({ type: "node", id: result.node.id });
      setNavMultiSelected([]);
    }
    if (result.created) {
      toast.success("Added to navigation", `${physicalNavLabel(type, id)} is now linked to the walking network.`);
    } else {
      toast.info("Already added to navigation", `${physicalNavLabel(type, id)} is already linked.`);
    }
  }, [ensureLinkedNavigationNode, navMode, navPhysicalSelected, physicalNavLabel, selected, toast]);

  const viewPhysicalInNavigation = useCallback((type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => {
    const node = linkedNodeForPhysical(type, id);
    if (!node) return;
    switchFloorEditorMode("navigation");
    setNavTool("select");
    setNavSelected({ type: "node", id: node.id });
    setNavMultiSelected([]);
    setShowProperties(true);
    zoomToFit(Math.max(0, node.x - 40), Math.max(0, node.y - 40), 80, 80, 48);
  }, [linkedNodeForPhysical, switchFloorEditorMode, zoomToFit]);

  const removePhysicalFromNavigation = useCallback((type: "room" | "door" | "stairs" | "elevator" | "ramp", id: string) => {
    const nodes = linkedNodesForPhysical(type, id);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const nextNodes = indoorNodes.filter((n) => !nodeIds.has(n.id));
    const nextEdges = indoorEdges.filter((edge) => !nodeIds.has(edge.startNodeId) && !nodeIds.has(edge.endNodeId));
    if (type === "room") {
      const nextRooms = rooms.map((room) => room.id === id
        ? { ...room, accessDoorId: undefined, accessDoorIds: undefined, accessType: undefined, accessNodeId: undefined }
        : room);
      const nextEntry = {
        ...floorUndoEntryFromFloor(floor),
        rooms: nextRooms,
        navNodes: nextNodes,
        navEdges: nextEdges,
      };
      pushHistory(nextEntry);
      buildFloorUpdates(nextEntry);
    } else {
      if (nodes.length === 0) return;
      commitNavGraph(nextNodes, nextEdges);
    }
    setNavSelected(null);
    setNavMultiSelected([]);
    toast.success("Removed from navigation", `${physicalNavLabel(type, id)} remains on the floor plan.`);
  }, [buildFloorUpdates, commitNavGraph, floor, floorUndoEntryFromFloor, indoorEdges, indoorNodes, linkedNodesForPhysical, physicalNavLabel, pushHistory, rooms, toast]);

  const physicalNavStatus = useMemo(() => {
    if (!selected) return undefined;
    if (selected.type !== "room" && selected.type !== "door" && selected.type !== "stairs" && selected.type !== "elevator" && selected.type !== "ramp") {
      return undefined;
    }
    const linkedNode = linkedNodeForPhysical(selected.type, selected.id);
    const linked = !!linkedNode;
    // B5 Phase 6.8: connection count feeds the shared NavigationRelationshipCard
    // in BOTH modes so the card content is pixel-identical.
    const connectionCount = linkedNode
      ? indoorEdges.filter((e) => e.startNodeId === linkedNode.id || e.endNodeId === linkedNode.id).length
      : undefined;
    if (selected.type === "room") {
      return {
        kind: "room" as const,
        linked,
        title: "Room",
        detail: linked ? "Room destination" : "Add this Room as a navigation destination.",
        connectionCount,
      };
    }
    if (selected.type === "door") {
      return {
        kind: "door" as const,
        linked,
        title: "Door",
        detail: linked ? "Navigation entry linked" : "Create a door navigation entry so paths can connect directly to this doorway.",
        connectionCount,
      };
    }
    if (selected.type === "ramp") {
      return {
        kind: "ramp" as const,
        linked,
        title: "Ramp",
        detail: linked ? "Accessible path anchor" : "Add this ramp as an accessible path anchor.",
        connectionCount,
      };
    }
    if (selected.type === "stairs") {
      const stair = stairs.find((s) => s.id === selected.id);
      const groupLabel = stair?.sharedId ? circulationGroups.stairs.find((g) => g.id === stair.sharedId)?.name : undefined;
      return {
        kind: "stairs" as const,
        linked,
        title: "Stair",
        detail: linked ? "Linked" : "Add this stair as a local stair navigation anchor.",
        groupLabel: groupLabel ?? stair?.label,
        connectionCount,
      };
    }
    const elevator = elevators.find((el) => el.id === selected.id);
    const groupLabel = elevator?.sharedId ? circulationGroups.elevators.find((g) => g.id === elevator.sharedId)?.name : undefined;
    return {
      kind: "elevator" as const,
      linked,
      title: "Elevator",
      detail: linked ? "Linked" : "Add this elevator as a local elevator navigation anchor.",
      groupLabel: groupLabel ?? elevator?.label,
      connectionCount,
    };
  }, [circulationGroups.elevators, circulationGroups.stairs, elevators, indoorEdges, linkedNodeForPhysical, selected, stairs]);

  const roomDoorStatus = useMemo(() => {
    if (selected?.type !== "room") return undefined;
    const room = rooms.find((candidate) => candidate.id === selected.id);
    if (!room) return undefined;
    const roomNode = indoorNodes.find((node) => node.roomId === room.id);
    const linkedDoors = roomAccessDoorIds(room)
      .map((doorId) => doors.find((door) => door.id === doorId))
      .filter((door): door is NonNullable<typeof door> => !!door);
    const validDoors = linkedDoors.filter((door) => isDoorEligibleForRoom(room, door, walls, indoorNodes, { rooms }));
    const linkedDoor = validDoors[0];
    const doorNodes = validDoors.map((door) => indoorNodes.find((node) => node.doorId === door.id)).filter((node): node is NonNullable<typeof node> => !!node);
    const connectedDoorNodes = doorNodes.filter((doorNode) => indoorEdges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE && !edge.closed
      && (edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id)));
    const connectionCount = connectedDoorNodes.reduce((sum, doorNode) => sum + indoorEdges.filter((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE && !edge.closed
      && (edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id)).length, 0);
    const state = !roomNode ? "not_added"
      : linkedDoors.length === 0 ? "door_needed"
      : validDoors.length === 0 ? "door_invalid"
      : connectedDoorNodes.length > 0 ? "ready" : "door_not_connected";
    return {
      state,
      roomNodeId: roomNode?.id,
      doorId: linkedDoors[0]?.id,
      doorName: linkedDoors[0] ? doorDisplayName(linkedDoors[0], floor) : undefined,
      doorIds: linkedDoors.map((door) => door.id),
      doorNames: linkedDoors.map((door) => doorDisplayName(door, floor)),
      connectionCount,
      valid: validDoors.length > 0,
    } as const;
  }, [doors, floor, indoorEdges, indoorNodes, rooms, selected, walls]);

  const roomNavigationCueStatus = useMemo(() => {
    const result = new Map<string, "not_added" | "door_needed" | "door_invalid" | "door_not_connected" | "ready">();
    for (const room of rooms) {
      const roomNode = indoorNodes.find((node) => node.roomId === room.id);
      if (!roomNode) { result.set(room.id, "not_added"); continue; }
      const linkedDoors = roomAccessDoorIds(room).map((id) => doors.find((candidate) => candidate.id === id)).filter((door): door is NonNullable<typeof door> => !!door);
      const validDoors = linkedDoors.filter((door) => isDoorEligibleForRoom(room, door, walls, indoorNodes, { rooms }));
      if (linkedDoors.length === 0) { result.set(room.id, "door_needed"); continue; }
      if (validDoors.length === 0) { result.set(room.id, "door_invalid"); continue; }
      const connected = validDoors.some((door) => {
        const doorNode = indoorNodes.find((node) => node.doorId === door.id);
        return !!doorNode && indoorEdges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE && !edge.closed
          && (edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id));
      });
      result.set(room.id, connected ? "ready" : "door_not_connected");
    }
    return result;
  }, [doors, indoorEdges, indoorNodes, rooms, walls]);

  const beginRoomDoorLink = useCallback((roomId: string, mode: "replace" | "add" = "replace") => {
    if (!rooms.some((room) => room.id === roomId)) return;
    if (!indoorNodes.some((node) => node.roomId === roomId)) {
      toast.info("Add Room to Navigation first", "Create the Room destination before choosing its Door.");
      return;
    }
    setRoomDoorLinking(true);
    setRoomDoorLinkMode(mode);
    setRoomDrag(null);
    alignmentSnapLocksRef.current = { x: null, y: null };
    setTool("select");
    setNavTool("select");
    setShowProperties(true);
    toast.info("Select a Door", "Select a Door for this Room. Press Esc to cancel.");
  }, [indoorNodes, rooms, toast]);

  const selectRoomDoor = useCallback((doorId: string) => {
    selectFloorItem({ type: "door", id: doorId });
  }, [selectFloorItem]);

  const removeRoomDoor = useCallback((roomId: string, doorId: string) => {
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!room) return;
    const nextIds = roomAccessDoorIds(room).filter((id) => id !== doorId);
    updFloor(rooms.map((candidate) => candidate.id === roomId
      ? { ...candidate, accessDoorId: nextIds[0], accessDoorIds: nextIds.length > 0 ? nextIds : undefined }
      : candidate), fpaths);
  }, [fpaths, rooms, updFloor]);

  const roomDoorTargetIsValid = useCallback((door: FloorDoor) => {
    if (!roomDoorLinking || selected?.type !== "room") return false;
    const room = rooms.find((candidate) => candidate.id === selected.id);
    return roomDoorLinkTargetIsValid(room, door, walls, indoorNodes, buildingId, floorId, room ? roomAccessDoorIds(room) : [], rooms);
  }, [buildingId, floorId, indoorNodes, roomDoorLinking, rooms, selected, walls]);

  const selectedDoorEntranceStatus = useMemo(() => {
    if (selected?.type !== "door") return undefined;
    return doorEntranceLinkStatus(campus, buildingId, floorId, selected.id);
  }, [buildingId, campus, floorId, selected]);

  const handleNavSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1) { e.preventDefault(); startPan(e); return; }
    if (isSpacePressed()) { e.preventDefault(); startPan(e); return; }
    const target = e.target as SVGElement;
    const isBg = target === svgRef.current || target.dataset.bg === "true" || target.closest?.('[data-bg="true"]') != null;
    const pt = navPointFromEvent(e);

    if (navTool === "pan") { if (isBg) startPan(e); return; }

    if (navTool === "select") {
      if (isBg) {
        if (!e.shiftKey) { setNavSelected(null); setNavMultiSelected([]); }
        setRubberBand({ sx: pt.x, sy: pt.y, cx: pt.x, cy: pt.y });
      }
      return;
    }

    if (navTool === "erase") {
      if (isBg) { setNavSelected(null); setNavMultiSelected([]); return; }
      navEraseAt(pt);
      return;
    }

    if (navTool === "waypoint" || navTool === "destination") {
      const isDest = navTool === "destination";
      const existing = findNavNodeAtPoint(indoorNodes.filter((node) => !node.roomId), pt);
      if (existing) {
        selectDuplicateNavNode(existing);
        setNavTool("select");
        return;
      }
      // B5 Phase 2.3: FREE Waypoint / Destination placement is for open walkable
      // floor space. Landing directly on a semantic linked-location object (Room
      // semantic target / Door / Stair / Elevator / Ramp) is rejected with
      // guidance — those link through the Link Location workflow instead. The
      // interior of a large room (away from its center label zone) stays allowed.
      const blocked = linkedPlacementBlockAt(pt, rooms, doors, stairs, elevators, ramps);
      if (blocked) {
        toast.info("Use Link Location for this object", "Rooms, doors and circulation points link through Link Location.");
        return;
      }
      // B5 Phase 6.3: check if click is near an existing nav edge for insertion
      const edgeNodeMap = Object.fromEntries(indoorNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
      const managedEdgeHit = findNavEdgeAtPoint(walkableIndoorEdges, edgeNodeMap, pt);
      if (managedEdgeHit && !editableIndoorEdges.some((edge) => edge.id === managedEdgeHit.edge.id)) {
        toast.info("This connection is managed", "Entrance, Room, and generated pathway connections cannot be split.");
        return;
      }
      const edgeHit = findNavEdgeAtPoint(editableIndoorEdges, edgeNodeMap, pt);
      if (edgeHit) {
        // Insert waypoint into existing edge — split it
        const insertNodeBase = createIndoorNavNode({
          id: genId("nn"), x: edgeHit.nearest.x, y: edgeHit.nearest.y, buildingId, floorId, campusId: campus.id,
          name: isDest ? "Destination" : "Waypoint",
          type: isDest ? "room_access" : "hallway",
          pathJunction: true,
        });
        const insertNode = { ...insertNodeBase, x: edgeHit.nearest.x, y: edgeHit.nearest.y };
        const splitResult = splitIndoorNavEdge(edgeHit.edge, insertNode, indoorNodes);
        if (splitResult) {
          const nextEdges = indoorEdges.filter((e) => e.id !== edgeHit.edge.id);
          nextEdges.push(...splitResult.newEdges);
          commitNavGraph(
            [...indoorNodes, insertNode],
            nextEdges,
            { splitNodeIds: new Set([insertNode.id]) },
          );
          setNavSelected({ type: "node", id: insertNode.id });
          setNavMultiSelected([]);
          setShowProperties(true);
          setNavTool("select");
          toast.success("Walking Point inserted", "Edge split into two connections.");
          return;
        }
      }
      // Open floor (including large-room interiors away from the semantic
      // target) → a canonical free node at the exact clicked coordinate.
      const node = createIndoorNavNode({
        id: genId("nn"), x: pt.x, y: pt.y, buildingId, floorId, campusId: campus.id,
        name: isDest ? "Destination" : "Waypoint",
        type: isDest ? "room_access" : "hallway",
      });
      commitNavGraph([...indoorNodes, node], indoorEdges);
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      setShowProperties(true);
      setNavTool("select");
      return;
    }

    if (navTool === "link") {
      // B5 Phase 2.2: Link Location infers the node type from the physical
      // object under the pointer — Room / Door / Stairs / Elevator / Ramp.
      const target = resolveNavTargetAt(pt);
      if (!target) {
        toast.info("Nothing to link", "Select an existing floor location to link.");
        return;
      }
      const result = ensureLinkedNavigationNode(target.kind, target.id);
      if (result) {
        setNavSelected({ type: "node", id: result.node.id });
        setNavMultiSelected([]);
        setShowProperties(true);
        setNavTool("select");
        if (!result.created) toast.info("Already added to navigation", "This location already has a navigation point.");
      }
      return;
    }

    if (navTool === "connect") {
      navConnectAtPoint(pt);
      return;
    }
  };

  // Shared Connect Path interaction — used by both the canvas background and
  // existing-waypoint clicks so every surface behaves identically.
  const navConnectAtPoint = (
    pt: { x: number; y: number },
    targetEdge?: NavigationEdge,
    pathTarget?: { edgeId: string; index: number; point: { x: number; y: number } },
  ) => {
    if (!navConnectStart) {
      const roomTarget = findRoomAtPoint(rooms, pt);
      if (roomTarget) {
        toast.info("Use the Room Door", "Link this Room to its physical Door, then connect that Door to the Walking Network.");
        return;
      }
      const result = navWaypointAt(pt);
      // B5 Phase 2.8: a connection MUST begin by clicking an existing valid
      // routing node (or a linked-location target that becomes one). Clicking
      // EMPTY floor space before a start does NOTHING — no waypoint, no node,
      // no mutation/history. Only after a start exists may empty clicks pin
      // geometry bends.
      if (result.kind !== "node") return;
      const startId = result.node.id;
      setNavConnectStart(startId);
      const startNode = indoorNodes.find((n) => n.id === startId);
      setNavPreview({ x: startNode?.x ?? result.node.x, y: startNode?.y ?? result.node.y });
      setNavSelected({ type: "node", id: startId });
      return;
    }
    // A manual Walking Path is an explicit Connect target.  Reuse the same
    // canonical split semantics as the Walking Point tool, then terminate the
    // new connector at that junction.  Managed/generated paths remain read-only
    // and never become independent manual graph data.
    // The hovered edge + projected point are the explicit target. Resolve it
    // before generic waypoint/room hit testing so a nearby endpoint cannot
    // steal a midpoint click on the path.
    if (targetEdge) {
      const committed = commitNavEdgeToExistingPath(
        navConnectStart,
        targetEdge,
        pt,
        indoorNodes,
        indoorEdges,
        navConnectBends,
        pathTarget?.edgeId === targetEdge.id
          ? { edgeId: targetEdge.id, segmentIndex: pathTarget.index, projectedPoint: pathTarget.point }
          : undefined,
      );
      if (committed) setNavTool("select");
      return;
    }
    const roomTarget = findRoomAtPoint(rooms, pt);
    if (roomTarget) {
      toast.info("Use the Room Door", "Link this Room to its physical Door, then connect that Door to the Walking Network.");
      return;
    }
    const result = navWaypointAt(pt);
    const endId = result.kind === "node" ? result.node.id : null;
    if (endId) {
      // Finish: commit ONE edge carrying every pinned bend (one history action).
      // B5 Phase 2.9A: a REJECTED commit (invalid wall-crossing geometry) keeps
      // the Connect tool active — the tool only returns to Select on success.
      const committed = commitNavEdgeBetween(navConnectStart, endId, indoorNodes, indoorEdges, navConnectBends);
      if (committed) setNavTool("select");
      return;
    }
    // B5 Phase 2.9: ONE empty-space click during an ACTIVE connection pins the
    // FULL segment shape the preview shows — the orthogonal corner resolved from
    // the current anchor/latest bend PLUS the click point itself (or just the
    // click point on a straight continuation). The click point immediately
    // becomes the new continuation anchor, so the NEXT preview starts from it:
    // no confirmation click, no "selected but not yet pinned" state, and no
    // NavigationNode is ever created from an empty Connect click.
    const startNode = indoorNodes.find((n) => n.id === navConnectStart);
    if (!startNode) return;
    const last = navConnectBends.length > 0
      ? navConnectBends[navConnectBends.length - 1]
      : { x: startNode.x, y: startNode.y };
    const rawPt = { x: Math.round(pt.x), y: Math.round(pt.y) };
    // B5 Phase 2.10: ONE proposed pin geometry — the SAME helper the live
    // preview uses, so the click pins EXACTLY what was shown (alignment-snapped,
    // wall validity always winning over the snap, detours kept in floor bounds,
    // and never creating a NavigationNode).
    const geo = navPinGeometryFor(rawPt, last, indoorNodes, walls, doors, { width: FP_W, height: FP_H });
    const pins = geo.pins;
    // A bend may NEVER settle inside a wall's effective obstacle (thickness +
    // clearance). The click point AND the auto-resolved corner are both
    // point-validated — a segment that merely ENDS on a wall centerline can
    // pass the segment check, but the bend itself is still inside the wall.
    const badPin = pins.find((p) => pointInsideWallObstacle(p, walls, doors) !== null);
    if (badPin) {
      toast.warning("Path blocked by wall", "The bend would land inside a wall.");
      return;
    }
    // Every pinned segment is wall-validated (clearance + crossings + doors).
    if (edgePolylineCrossesWallWithoutDoor([last, ...pins], walls, doors)) {
      toast.warning("Paths must pass through a door opening", "This segment crosses a wall without a door opening.");
      return;
    }
    const lastPin = pins[pins.length - 1];
    if (Math.hypot(lastPin.x - last.x, lastPin.y - last.y) < 2) return; // ignore micro-clicks
    if (geo.snapped) setNavAlignGuides(geo.guides);
    // Dedupe against the previous pin (a snapped corner can coincide with it),
    // then record how many points THIS click actually appended so temporary
    // Ctrl+Z removes the whole click in one step.
    const out = [...navConnectBends];
    let appended = 0;
    for (const p of pins) {
      const lp = out[out.length - 1];
      if (lp && lp.x === p.x && lp.y === p.y) continue;
      out.push(p);
      appended++;
    }
    if (appended === 0) return;
    navConnectBendGroupsRef.current.push(appended);
    setNavConnectBends(out);
  };

  // ── B5 Phase 2.1: Navigation copy / paste / duplicate ──────────────────────

  /** Current nav selection as a free-node graph fragment (linked nodes excluded). */
  const navSelectionGraph = useCallback((): { nodes: NavigationNode[]; edges: NavigationEdge[]; linkedCount: number } => {
    const selNode = navSelected?.type === "node" ? navSelected.id : null;
    let nodeIds: string[] = [];
    if (selNode) nodeIds = navMultiSelected.length > 0 ? [...new Set([...navMultiSelected, selNode])] : [selNode];
    else nodeIds = navMultiSelected;
    const selectedNodes = indoorNodes.filter((n) => nodeIds.includes(n.id));
    const linkedCount = selectedNodes.filter((n) => linkedObjectRef(n)).length;
    const freeNodes = selectedNodes.filter((n) => !linkedObjectRef(n));
    const freeIds = new Set(freeNodes.map((n) => n.id));
    const edges = indoorEdges.filter((e) => freeIds.has(e.startNodeId) && freeIds.has(e.endNodeId));
    return { nodes: freeNodes, edges, linkedCount };
  }, [indoorEdges, indoorNodes, navMultiSelected, navSelected]);

  const copyNavSelection = useCallback(() => {
    const { nodes, edges, linkedCount } = navSelectionGraph();
    if (nodes.length === 0) {
      toast.info("Nothing to copy", "Select free walking points first (Ctrl+C).");
      return;
    }
    navClipboardRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    navPasteOffsetRef.current = 12;
    if (linkedCount > 0) {
      toast.info("Linked walking points not copied", `${linkedCount} linked walking point${linkedCount !== 1 ? "s" : ""} follow their physical object and cannot be copied.`);
    } else {
      toast.success("Copied", `${nodes.length} walking point${nodes.length !== 1 ? "s" : ""} copied (Ctrl+V to paste).`);
    }
  }, [navSelectionGraph, toast]);

  /**
   * Paste a nav graph fragment with fresh IDs, remapped edge endpoints, and a
   * small clamped offset — ONE history action via commitNavGraph.
   */
  const pasteNavGraph = useCallback((nodes: NavigationNode[], edges: NavigationEdge[], offset: number): number => {
    if (nodes.length === 0) return 0;
    const idMap = new Map<string, string>();
    const nextNodes: NavigationNode[] = nodes.map((n) => {
      const newId = genId("nn");
      idMap.set(n.id, newId);
      // Linked refs are never copied — strip defensively so no second canonical
      // link to the same physical object can ever exist.
      const free = { ...structuredClone(n), id: newId } as NavigationNode & Record<string, unknown>;
      delete free.roomId; delete free.doorId; delete free.stairId;
      delete free.elevatorId; delete free.rampId; delete free.entranceId;
      return {
        ...free,
        x: clamp(Math.round(n.x + offset), 0, FP_W),
        y: clamp(Math.round(n.y + offset), 0, FP_H),
      };
    });
    const nodeById = new Map(nextNodes.map((n) => [n.id, n]));
    const nextEdges: NavigationEdge[] = edges
      .filter((e) => idMap.has(e.startNodeId) && idMap.has(e.endNodeId))
      .map((e) => {
        const a = nodeById.get(idMap.get(e.startNodeId)!);
        const b = nodeById.get(idMap.get(e.endNodeId)!);
        // B5 Phase 2.5: bendPoints travel with the edge and translate WITH the
        // nodes (the copied L-shape stays attached to its pasted endpoints); the
        // distance is the TOTAL polyline length, never the straight diagonal.
        const bends = e.bendPoints?.map((p) => ({
          x: clamp(Math.round(p.x + offset), 0, FP_W),
          y: clamp(Math.round(p.y + offset), 0, FP_H),
        }));
        const pts = bends && bends.length > 0
          ? [{ x: a!.x, y: a!.y }, ...bends, { x: b!.x, y: b!.y }]
          : null;
        return {
          ...e,
          id: genId("ne"),
          startNodeId: a!.id,
          endNodeId: b!.id,
          ...(bends && bends.length > 0 ? { bendPoints: bends } : {}),
          distance: pts ? navEdgePolylineDistance(pts) : Math.round(Math.hypot(b!.x - a!.x, b!.y - a!.y)),
        };
      });
    commitNavGraph([...indoorNodes, ...nextNodes], [...indoorEdges, ...nextEdges]);
    setNavSelected({ type: "node", id: nextNodes[nextNodes.length - 1].id });
    setNavMultiSelected(nextNodes.map((n) => n.id));
    setShowProperties(true);
    return nextNodes.length;
  }, [FP_W, FP_H, commitNavGraph, indoorEdges, indoorNodes]);

  const pasteNavSelection = useCallback(() => {
    if (!navClipboardRef.current || navClipboardRef.current.nodes.length === 0) {
      toast.info("Nothing to paste", "Copy walking points first (Ctrl+C).");
      return;
    }
    const count = pasteNavGraph(navClipboardRef.current.nodes, navClipboardRef.current.edges, navPasteOffsetRef.current);
    navPasteOffsetRef.current += 12;
    toast.success("Walking Points pasted", `${count} walking point${count !== 1 ? "s" : ""} pasted with fresh connections.`);
  }, [pasteNavGraph, toast]);

  const duplicateNavSelection = useCallback(() => {
    const { nodes, edges, linkedCount } = navSelectionGraph();
    if (nodes.length === 0) {
      toast.info("Nothing to duplicate", "Select free walking points first (Ctrl+D).");
      return;
    }
    if (linkedCount > 0) {
      toast.info("Linked walking points excluded", `${linkedCount} linked walking point${linkedCount !== 1 ? "s" : ""} follow their physical object and cannot be duplicated.`);
    }
    const count = pasteNavGraph(nodes, edges, 12);
    toast.success("Walking Points duplicated", `${count} walking point${count !== 1 ? "s" : ""} duplicated.`);
  }, [navSelectionGraph, pasteNavGraph, toast]);

  // ── B5 Phase 2.1: Navigation Library drag-and-drop ─────────────────────────

  const navPointFromDrag = (e: React.DragEvent): { x: number; y: number } => {
    const pt = getPoint(e as any, FP_W, FP_H);
    return { x: Math.max(0, Math.min(FP_W, Math.round(pt.x))), y: Math.max(0, Math.min(FP_H, Math.round(pt.y))) };
  };

  const handleNavLibraryDragOver = useCallback((e: React.DragEvent) => {
    const kind = navLibraryDragRef.current;
    if (!kind) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const pt = navPointFromDrag(e);
    if (kind === "waypoint" || kind === "destination") {
      // B5 Phase 2.3: free placement is blocked on linked-location semantic
      // targets — show a not-allowed preview instead of a green ghost.
      const blocked = linkedPlacementBlockAt(pt, rooms, doors, stairs, elevators, ramps);
      if (blocked) {
        setNavDragPreview(null);
        setNavDragBlocked(pt);
      } else {
        setNavDragPreview(pt);
        setNavDragBlocked(null);
      }
      setNavTargetHover(null);
      return;
    }
    // B5 Phase 2.2: linked kinds are not draggable — the unified Link Location
    // tool (click-to-target) replaces the old per-kind drag items.
    setNavDragPreview(null);
    setNavDragBlocked(null);
    setNavTargetHover(null);
  }, [doors, elevators, ramps, rooms, stairs]);

  const handleNavLibraryDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = navLibraryDragRef.current;
    navLibraryDragRef.current = null;
    setNavDragPreview(null);
    setNavDragBlocked(null);
    setNavTargetHover(null);
    if (!kind) return;
    const pt = navPointFromDrag(e);
    if (kind === "waypoint" || kind === "destination") {
      const existing = findNavNodeAtPoint(indoorNodes.filter((node) => !node.roomId), pt);
      if (existing) {
        selectDuplicateNavNode(existing);
        setNavTool("select");
        return;
      }
      // B5 Phase 2.3: reject free drops on linked-location semantic targets
      // (Room center zone / Door / Stair / Elevator / Ramp) — no orphan node.
      const blocked = linkedPlacementBlockAt(pt, rooms, doors, stairs, elevators, ramps);
      if (blocked) {
        toast.info("Use Link Location for this object", "Rooms, doors and circulation points link through Link Location.");
        return;
      }
      const node = createIndoorNavNode({
        id: genId("nn"), x: pt.x, y: pt.y, buildingId, floorId, campusId: campus.id,
        name: kind === "destination" ? "Destination" : "Walking Point",
        type: kind === "destination" ? "room_access" : "hallway",
      });
      commitNavGraph([...indoorNodes, node], indoorEdges);
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      setShowProperties(true);
      setNavTool("select");
      toast.success(kind === "destination" ? "Destination placed" : "Walking Point placed", "Added to the walking network.");
      return;
    }
    // B5 Phase 2.2: linked kinds are NO LONGER draggable — the unified Link
    // Location tool infers the type from the actual object under the pointer,
    // so a wrong-type drop can never occur. Defensive reject for unknown kinds.      toast.info("Use Link Location", "Drag Walking Points and Destinations; link Rooms, Doors, Stairs, Elevators and Ramps with Link Location.");
  }, [buildingId, campus.id, commitNavGraph, doors, elevators, floorId, indoorEdges, indoorNodes, ramps, rooms, selectDuplicateNavNode, stairs, toast]);

  const handleSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (roomDoorLinking) {
      const target = e.target as SVGElement;
      const isBg = target === svgRef.current || target.dataset.bg === "true"
        || target.closest?.('[data-bg="true"]') != null;
      if (isBg) {
        clearRoomDoorLinkState();
        setSelected(null);
        setMultiSelected([]);
        setShowProperties(false);
        return;
      }
      e.preventDefault();
      toast.info("Select a Door", "Select a Door for this Room. Press Esc to cancel.");
      return;
    }
    // B8 Phase 1: when a nav tool is active, route to nav handler.
    // Otherwise, fall through to physical object handling.
    const isNavToolActive = showNavOverlay && navTool !== "select" && navTool !== "pan";
    if (isNavToolActive) { handleNavSvgDown(e); return; }
    if (e.button === 1) { e.preventDefault(); startPan(e); return; }
    if (isSpacePressed()) { e.preventDefault(); startPan(e); return; }
    const target = e.target as SVGElement;
    // "Empty canvas" = the svg itself or anything inside the decorative
    // background group (outer rect, grid lines, floor-area rects). Item <g>s are
    // siblings of that group, so object clicks never match and never deselect.
    const isBg = target === svgRef.current || target.dataset.bg === "true"
      || target.closest?.('[data-bg="true"]') != null;

    const pt = getPoint(e, FP_W, FP_H);
    const boundedPt = { x: clamp(Math.round(pt.x), 0, FP_W), y: clamp(Math.round(pt.y), 0, FP_H) };

    if (calibrationDraft.active) {
      e.preventDefault();
      if (!calibrationDraft.p1) {
        setCalibrationDraft((draft) => ({ ...draft, p1: boundedPt }));
      } else if (!calibrationDraft.p2) {
        setCalibrationDraft((draft) => ({ ...draft, p2: boundedPt }));
      }
      return;
    }

    if (tool === "measure") {
      e.preventDefault();
      if (!floor.calibration) {
        toast.info("Calibrate floor scale first", "Measure uses the calibrated floor scale and will not fake meters.");
        setTool("select");
        return;
      }
      setMeasureDraft((draft) => !draft.start || draft.end ? { start: boundedPt } : { ...draft, end: boundedPt });
      return;
    }

    if (tool === "pan") { if (isBg) startPan(e); return; }
    if (tool === "select" || tool === "erase") {
      if (isBg && tool === "select") {
        // Navigation selections live in a separate state domain from floor
        // objects.  Clear both domains together when Select is used on empty
        // canvas; otherwise a nav node/edge can keep the Properties panel open
        // after its visible highlight is gone.  Exclusive navigation tools are
        // handled by handleNavSvgDown above and never reach this branch.
        if (navMode && navTool === "select") {
          setNavSelected(null);
          setNavMultiSelected([]);
          setNavPhysicalSelected(null);
          setNavSelectedBend(null);
          setNavSegmentHover(null);
        }
        if (
          !e.shiftKey &&
          multiBounds &&
          multiSelected.length > 1 &&
          boundedPt.x >= multiBounds.x &&
          boundedPt.x <= multiBounds.x + multiBounds.w &&
          boundedPt.y >= multiBounds.y &&
          boundedPt.y <= multiBounds.y + multiBounds.h
        ) {
          const entries = multiSelected
            .map((selectedId) => selectionForId(selectedId))
            .filter((value): value is FloorSelection => !!value)
            .map((value) => ({ type: value.type, id: value.id, origin: structuredClone(getSelectionItem(value.type, value.id)) }))
            .filter((entry) => entry.origin && entry.type !== "path");
          if (entries.length > 1) {
            if (entries.some((entry) => (entry.origin as any)?.locked)) {
              toast.info("Locked selection", "Unlock locked floor objects before moving them.");
              return;
            }
            suppressHistoryRef.current = true;
            gestureMoved.current = false;
            roomOverlapWarnedRef.current = false;
            dragging.current = { entries, sx: pt.x, sy: pt.y, fromBackground: true };
            setSelected(null);
            setShowProperties(true);
            return;
          }
        }
        if (!e.shiftKey) {
          setSelected(null);
          setMultiSelected([]);
          setShowProperties(navMode && navTool === "select" ? false : true);
        }
        setRubberBand({ sx: boundedPt.x, sy: boundedPt.y, cx: boundedPt.x, cy: boundedPt.y });
      }
      if (isBg && tool === "erase" && !e.shiftKey) { setSelected(null); setShowProperties(true); }
      return;
    }

    const s = (v: number) => snapOn ? snapToGrid(v, floorGridSize) : Math.round(v);
    const clamped = snapFloorPoint({ x: clamp(s(pt.x), 0, FP_W), y: clamp(s(pt.y), 0, FP_H) });

    if (tool === "wall") {
      const raw = { x: pt.x, y: pt.y };
      if (!wallStart) {
        const resolved = wallStartCursor(raw);
        setWallStart(resolved.point);
        setWallSnapIndicator(resolved.indicator);
      } else {
        // Complete the wall — resolve the endpoint with the same live snapping
        // as the preview so the committed geometry terminates at the EXACT snap
        // point (no stale preview coordinates, no grid-after-connection shifts).
        const resolved = wallDrawCursor(raw, e.shiftKey);
        const newWall = normalizeWallRoomAnchors({
          id: genId("wl"),
          x1: wallStart.x, y1: wallStart.y,
          x2: resolved.point.x, y2: resolved.point.y,
          thickness: lastWallStyleRef.current.thickness,
          color: lastWallStyleRef.current.color,
          material: lastWallStyleRef.current.material,
          startAnchor: wallStart.roomAnchor,
          endAnchor: resolved.point.roomAnchor,
        }, rooms);
        updFloor(rooms, fpaths, [...walls, newWall]);
        selectFloorItem({ type: "wall", id: newWall.id });
        setWallStart(e.shiftKey ? resolved.point : null);
        setWallPreview(null);
        setWallSnapIndicator(null);
        if (!e.shiftKey) setTool("select");
      }
      return;
    }

    if (tool === "room") {
      setRoomDrag({ sx: clamped.x, sy: clamped.y, cx: clamped.x, cy: clamped.y });
      return;
    }

    if (tool === "door") {
      const target = openingWallTarget(pt, "door");
      if (!target) {
        toast.info("Place doors on a wall", "Move near a wall until it highlights, then click to add the door.");
        return;
      }
      const newDoor: FloorDoor = {
        id: genId("dr"),
        x: Math.round(target.x),
        y: Math.round(target.y),
        wallId: target.wall.id,
        offset: target.offset,
        width: Math.round(target.width),
        doorType: "single",
        hinge: "left",
        swingSide: defaultSwingSideForWall(target.wall),
        direction: "left",
        color: "#b45309",
      };
      updFloor(rooms, fpaths, walls, [...doors, newDoor]);
      selectFloorItem({ type: "door", id: newDoor.id });
      setOpeningPreview(null);
      setTool("select");
      return;
    }

    if (tool === "window") {
      const target = openingWallTarget(pt, "window");
      if (!target) {
        toast.info("Place windows on a wall", "Move near a wall until it highlights, then click to add the window.");
        return;
      }
      const newWindow: FloorWindow = {
        id: genId("wn"),
        x: Math.round(target.x),
        y: Math.round(target.y),
        wallId: target.wall.id,
        offset: target.offset,
        width: Math.round(target.width),
        height: 4,
        color: "#0284c7",
      };
      updFloor(rooms, fpaths, walls, doors, [...windows, newWindow]);
      selectFloorItem({ type: "window", id: newWindow.id });
      setOpeningPreview(null);
      setTool("select");
      return;
    }

    if (tool === "stairs" || tool === "ramp") {
      setRoomDrag({ sx: clamped.x, sy: clamped.y, cx: clamped.x, cy: clamped.y });
      return;
    }

    if (tool === "elevator") {
      setRoomDrag({ sx: clamped.x, sy: clamped.y, cx: clamped.x, cy: clamped.y });
      return;
    }

    if (tool === "furniture" && furnitureTemplate) {
      const rawFx = clamp(clamped.x - furnitureTemplate.width / 2, 0, FP_W - furnitureTemplate.width);
      const rawFy = clamp(clamped.y - furnitureTemplate.height / 2, 0, FP_H - furnitureTemplate.height);
      const refs = collectAlignRefs();
      const alignResult = computeAlignmentGuides(
        { x: rawFx, y: rawFy, w: furnitureTemplate.width, h: furnitureTemplate.height },
        refs,
      );
      if (alignResult.guides.length > 0) setAlignGuides(alignResult.guides);
      else setAlignGuides([]);
      const fx = Math.max(0, Math.min(snapOn ? alignResult.snappedX : rawFx, FP_W - furnitureTemplate.width));
      const fy = Math.max(0, Math.min(snapOn ? alignResult.snappedY : rawFy, FP_H - furnitureTemplate.height));
      const newItem: FloorFurniture = {
        id: genId("fn"),
        type: furnitureTemplate.type,
        name: furnitureTemplate.name,
        category: FURNITURE_CATEGORIES.find((c) => c.items.some((i) => i.type === furnitureTemplate.type))?.id ?? "seating",
        x: fx,
        y: fy,
        width: furnitureTemplate.width,
        height: furnitureTemplate.height,
        rotation: 0,
        color: furnitureTemplate.color,
      };
      updFloor(rooms, fpaths, walls, doors, windows, [...furniture, newItem]);
      selectFloorItem({ type: "furniture", id: newItem.id });
      setTool("select");
      return;
    }

    if (tool === "text") {
      const labelWidth = Math.max(10, "Label".length * 12 * 0.6);
      const newLabel: FloorLabel = {
        id: genId("lb"), x: clamp(clamped.x, 0, FP_W - labelWidth), y: clamp(clamped.y, 12, FP_H - 4),
        text: "Label", fontSize: 12, color: "#374151", rotation: 0,
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, [...labels, newLabel]);
      selectFloorItem({ type: "label", id: newLabel.id });
      setInlineLabelEdit({ id: newLabel.id, value: newLabel.text, original: newLabel.text });
      setTool("select");
      return;
    }

    if (tool === "path") {
      setDP((p) => [...p, { x: Math.round(pt.x), y: Math.round(pt.y) }]);
      return;
    }
  };

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getPoint(e, FP_W, FP_H);
    setCursorPos({ x: Math.round(pt.x), y: Math.round(pt.y) });
    const boundedPt = { x: clamp(Math.round(pt.x), 0, FP_W), y: clamp(Math.round(pt.y), 0, FP_H) };

    if (navMode) {
      // B5 Phase 2.1: Navigation Pan must behave identically to Design Pan —
      // movePan only acts while a pan gesture (Pan tool / space / middle mouse)
      // is active, so marquee + group drags are unaffected.
      movePan(e);
      // Connect preview follows the pointer; authoring targets highlight live.
      if (navTool === "waypoint" || navTool === "destination" || navTool === "connect" || navTool === "link") {
        const resolvedTarget = resolveNavTargetAt(pt);
        // A Room's canonical access node is semantic and intentionally not a
        // generic Connect target. Keep the Room guidance path, but do not paint
        // it with the same valid target cue used for Walking Points.
        setNavTargetHover(navTool === "connect" && resolvedTarget?.kind === "room" ? null : resolvedTarget);
      } else {
        setNavTargetHover(null);
      }
      // B5 Phase 6.4: detect edge snap for waypoint insertion in Floor Editor
      if (navTool === "waypoint" || navTool === "destination") {
        const edgeNodeMap = Object.fromEntries(indoorNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
        const edgeHit = findNavEdgeAtPoint(editableIndoorEdges, edgeNodeMap, pt);
        setFloorEdgeSnap(edgeHit ? { edgeId: edgeHit.edge.id, nearest: edgeHit.nearest } : null);
      } else {
        setFloorEdgeSnap(null);
      }
      if (navConnectStart) {
        const startNode = indoorNodes.find((node) => node.id === navConnectStart);
        // Resolve the live pointer target directly as well as from hover state.
        // Mouse-enter state can lag one render behind a fast Connect move (and
        // tests/trackpads may dispatch move events on the SVG rather than the
        // node group), so the guide must not depend on a stale hover id.
        const hoveredNode = (navNodeHover ? indoorNodes.find((node) => node.id === navNodeHover && !node.roomId) : undefined)
          ?? findNavNodeAtPoint(indoorNodes.filter((node) => !node.roomId), boundedPt);
        const livePhysicalTarget = resolveNavTargetAt(boundedPt) ?? navTargetHover;
        const hoveredLinkedNode = !hoveredNode && livePhysicalTarget
          ? linkedNodeForPhysical(livePhysicalTarget.kind, livePhysicalTarget.id)
          : undefined;
        const targetNode = hoveredNode ?? hoveredLinkedNode;
        if (targetNode && startNode) {
          // Existing nodes and linked Door anchors are fixed graph targets. Show
          // the same center-axis guide the eventual explicit connection will
          // use, without changing either node or creating connectivity.
          const aligned = navAlignSnap(
            { x: targetNode.x, y: targetNode.y },
            [{ x: startNode.x, y: startNode.y, id: startNode.id }],
            8,
            new Set([startNode.id]),
          );
          setNavPreview({ x: targetNode.x, y: targetNode.y });
          setNavAlignGuides(aligned.guides);
        } else if (startNode) {
          // Empty-space Connect uses the same pin helper as click/commit, so
          // hover guides and the eventual bend geometry stay identical.
          const last = navConnectBends.length > 0
            ? navConnectBends[navConnectBends.length - 1]
            : { x: startNode.x, y: startNode.y };
          const geo = navPinGeometryFor(boundedPt, last, indoorNodes, walls, doors, { width: FP_W, height: FP_H });
          const previewPoint = geo.pins[geo.pins.length - 1] ?? boundedPt;
          setNavPreview(previewPoint);
          setNavAlignGuides(geo.snapped ? geo.guides : []);
        } else {
          setNavPreview(boundedPt);
          setNavAlignGuides([]);
        }
      }
      // Nav marquee (rubber band over graph elements).
      if (rubberBand) { setRubberBand({ ...rubberBand, cx: boundedPt.x, cy: boundedPt.y }); return; }
      // B5 Phase 2.7/2.8: orthogonal SEGMENT drag — a horizontal segment moves
      // vertically, a vertical segment moves horizontally; the connector stays
      // axis-aligned (boundary segments get a corner bend, interior segments
      // translate both bends). Geometry is ALWAYS derived from the immutable
      // drag-start snapshot + the current pointer delta (never compounded on
      // already-modified bends, never appending bends every frame), then
      // normalized and wall-validated. One history action on release.
      if (navSegDragRef.current) {
        const segDrag = navSegDragRef.current;
        const segEdge = indoorEdges.find((ed) => ed.id === segDrag.edgeId);
        if (!segEdge) { navSegDragRef.current = null; return; }
        const segmentStart = segDrag.origPts[segDrag.segIndex];
        const segmentEnd = segDrag.origPts[segDrag.segIndex + 1];
        if (!segmentStart || !segmentEnd) { navSegDragRef.current = null; return; }
        let delta = segDrag.isHorizontal
          ? Math.round(boundedPt.y) - segDrag.oy
          : Math.round(boundedPt.x) - segDrag.ox;
        // Manual segment drags can align their translated axis to nearby
        // endpoints, bends, or navigation anchors.  Keep the orthogonal
        // segment constraint; only the perpendicular delta is adjusted.
        if (segmentStart && segmentEnd) {
          const references = [
            ...indoorAlignmentReferences,
            ...segDrag.origPts.map((point, index) => ({ ...point, id: `edge-point:${segDrag.edgeId}:${index}` })),
          ].filter((reference) =>
            !((reference.x === segmentStart.x && reference.y === segmentStart.y)
              || (reference.x === segmentEnd.x && reference.y === segmentEnd.y))
          );
          const axisTarget = segDrag.isDiagonal
            ? segDrag.isHorizontal
              ? { x: Math.round((segmentStart.x + segmentEnd.x) / 2), y: Math.round((segmentStart.y + segmentEnd.y) / 2) + delta }
              : { x: Math.round((segmentStart.x + segmentEnd.x) / 2) + delta, y: Math.round((segmentStart.y + segmentEnd.y) / 2) }
            : segDrag.isHorizontal
              ? { x: segmentStart.x, y: segmentStart.y + delta }
              : { x: segmentStart.x + delta, y: segmentStart.y };
          const aligned = navAlignSnap(axisTarget, references, 8);
          const axisGuide = aligned.guides.find((guide) => guide.type === (segDrag.isHorizontal ? "h" : "v"));
          if (axisGuide) {
            delta = segDrag.isHorizontal
              ? axisGuide.pos - (segDrag.isDiagonal ? Math.round((segmentStart.y + segmentEnd.y) / 2) : segmentStart.y)
              : axisGuide.pos - (segDrag.isDiagonal ? Math.round((segmentStart.x + segmentEnd.x) / 2) : segmentStart.x);
            setNavAlignGuides([axisGuide]);
          } else {
            setNavAlignGuides([]);
          }
        }
        if (delta !== 0) gestureMoved.current = true;
        if (delta === 0) return;
        // Clamp the translation delta so the segment tracks the cursor 1:1 and
        // stays inside floor bounds (same intuitive rate as other draggables).
        let nextBends: { x: number; y: number }[];
        if (segDrag.isDiagonal) {
          // Replace only the selected diagonal segment with the smallest
          // orthogonal dog-leg.  Prefix/suffix bends remain untouched, and the
          // segment's canonical endpoints are never moved or reassigned.
          const midX = Math.round((segmentStart.x + segmentEnd.x) / 2);
          const midY = Math.round((segmentStart.y + segmentEnd.y) / 2);
          const localBends = segDrag.isHorizontal
            ? [{ x: segmentStart.x, y: midY + delta }, { x: segmentEnd.x, y: midY + delta }]
            : [{ x: midX + delta, y: segmentStart.y }, { x: midX + delta, y: segmentEnd.y }];
          const prefix = segDrag.origPts.slice(1, segDrag.segIndex + 1);
          const suffix = segDrag.origPts.slice(segDrag.segIndex + 2, segDrag.origPts.length - 1);
          nextBends = normalizeBendPoints([...prefix, ...localBends, ...suffix]);
        } else {
          nextBends = translateOrthogonalSegment(segDrag.origPts, segDrag.origBends, segDrag.segIndex, delta, segDrag.isHorizontal);
        }
        nextBends = normalizeBendPoints(nextBends.map((bp) => ({
          x: clamp(Math.round(bp.x), 0, FP_W),
          y: clamp(Math.round(bp.y), 0, FP_H),
        })));
        // Wall validation on the FINAL geometry — a segment drag that would push
        // a path through a solid wall without a door opening is rejected.
        // B5 Phase 2.11: an ALREADY-invalid edge stays freely draggable so the
        // admin can repair it (drags may pass through blocked intermediate
        // states; the live red state clears as soon as the geometry is valid).
        const candidateEdge = { ...segEdge, bendPoints: nextBends };
        const candPts = edgePolylinePoints(candidateEdge, indoorNodes);
        if (candPts && !navBlockedEdgeIds.has(segDrag.edgeId) && edgePolylineCrossesWallWithoutDoor(candPts, walls, doors)) {
          if (!navDragWallWarnedRef.current) {
            navDragWallWarnedRef.current = true;
            toast.warning("Paths must pass through a door opening", "This segment would cross a wall without a door opening.");
          }
          return;
        }
        commitNavGraph(
          indoorNodes,
          indoorEdges.map((ed) => (ed.id === segDrag.edgeId ? { ...ed, bendPoints: nextBends } : ed))
        );
        return;
      }
      // B5 Phase 2.5: bend-handle drag — reshape the selected segmented path
      // live (history suppressed); mouse-up commits ONE undoable action.
      // B5 Phase 2.6: Shift = strict orthogonal constraint; otherwise a small
      // snap tolerance keeps near-axis segments exactly horizontal/vertical.
      if (navBendDragRef.current) {
        const drag = navBendDragRef.current;
        const dragEdge = indoorEdges.find((ed) => ed.id === drag.edgeId);
        const dragBends = dragEdge?.bendPoints;
        let nx = clamp(Math.round(boundedPt.x), 0, FP_W);
        let ny = clamp(Math.round(boundedPt.y), 0, FP_H);
        if (e.shiftKey) {
          // Strict axis constraint — keep the changed segment horizontal OR
          // vertical using whichever axis best matches the pointer movement.
          const dx = nx - drag.ox;
          const dy = ny - drag.oy;
          if (Math.abs(dx) >= Math.abs(dy)) ny = drag.oy;
          else nx = drag.ox;
        } else if (dragBends) {
          // Near-axis snap — never leave visually crooked 2–5° segments.
          const aNode = indoorNodes.find((n) => n.id === dragEdge?.startNodeId);
          const bNode = indoorNodes.find((n) => n.id === dragEdge?.endNodeId);
          const prev = drag.index > 0 && dragBends[drag.index - 1]
            ? dragBends[drag.index - 1]
            : aNode ? { x: aNode.x, y: aNode.y } : null;
          const next = drag.index < dragBends.length - 1 && dragBends[drag.index + 1]
            ? dragBends[drag.index + 1]
            : bNode ? { x: bNode.x, y: bNode.y } : null;
          const tol = 4;
          if (prev) {
            if (Math.abs(nx - prev.x) <= tol) nx = prev.x;
            if (Math.abs(ny - prev.y) <= tol) ny = prev.y;
          }
          if (next) {
            if (Math.abs(nx - next.x) <= tol) nx = next.x;
            if (Math.abs(ny - next.y) <= tol) ny = next.y;
          }
        }
        // B5 Phase 2.8: always-on alignment guides for bends — snap to a nearby
        // bend or endpoint node's X/Y center within the threshold and show a
        // subtle temporary guide (orthogonality preserved: only one axis snaps).
        if (dragEdge && dragEdge.bendPoints) {
          const aNode = indoorNodes.find((n) => n.id === dragEdge?.startNodeId);
          const bNode = indoorNodes.find((n) => n.id === dragEdge?.endNodeId);
          const others: { x: number; y: number }[] = [
            ...(aNode ? [{ x: aNode.x, y: aNode.y }] : []),
            ...(bNode ? [{ x: bNode.x, y: bNode.y }] : []),
            ...dragEdge.bendPoints.filter((_, i) => i !== drag.index),
            ...indoorAlignmentReferences,
          ];
          const snap = navAlignSnap({ x: nx, y: ny }, others);
          nx = snap.x;
          ny = snap.y;
          setNavAlignGuides(snap.guides);
        }
        // B5 Phase 2.10: a bend may not settle inside a wall's obstacle — the
        // point check catches a bend dragged onto/into a wall that the segment
        // check tolerates (a segment may legally END at a wall anchor).
        if (pointInsideWallObstacle({ x: nx, y: ny }, walls, doors)) {
          if (!navDragWallWarnedRef.current) {
            navDragWallWarnedRef.current = true;
            toast.warning("Path blocked by wall", "A bend cannot sit inside a wall.");
          }
          return;
        }
        if (nx !== drag.ox || ny !== drag.oy) gestureMoved.current = true;
        const nextEdges = indoorEdges.map((ed) => {
          if (ed.id !== drag.edgeId || !ed.bendPoints) return ed;
          const bends = normalizeBendPoints(
            ed.bendPoints.map((p, i) => (i === drag.index ? { x: nx, y: ny } : p))
          );
          return { ...ed, bendPoints: bends };
        });
        // B5 Phase 2.8: wall validation on the reshaped path — a bend drag that
        // would cross a solid wall without a door opening is rejected.
        // B5 Phase 2.11: except on an ALREADY-invalid edge, which stays freely
        // editable so the admin can pull it clear of the wall (live red state).
        const candEdge = nextEdges.find((ed) => ed.id === drag.edgeId);
        const candPts = candEdge ? edgePolylinePoints(candEdge, indoorNodes) : null;
        if (candPts && !navBlockedEdgeIds.has(drag.edgeId) && edgePolylineCrossesWallWithoutDoor(candPts, walls, doors)) {
          if (!navDragWallWarnedRef.current) {
            navDragWallWarnedRef.current = true;
            toast.warning("Paths must pass through a door opening", "This bend would cross a wall without a door opening.");
          }
          return;
        }
        commitNavGraph(indoorNodes, nextEdges);
        return;
      }
      // Free-waypoint group drag — edges follow derived node positions.
      if (navDragRef.current) {
        const drag = navDragRef.current;
        let dx = boundedPt.x - drag.sx;
        let dy = boundedPt.y - drag.sy;
        if (dx !== 0 || dy !== 0) gestureMoved.current = true;
        // B5 Phase 6.10: Shift constrains to dominant axis relative to drag
        // start — cooperate with alignment guides rather than fight them.
        if (e.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            dy = 0;
          } else {
            dx = 0;
          }
        }
        // B5 Phase 2.8/6.10: always-on ALIGNMENT GUIDES — snap the dragged
        // group's bbox edges/center to another routing node's X or Y within a
        // modest threshold. B5 Phase 6.10: connected-node priority for nodes
        // directly connected to any node in the dragged group.
        {
          const connectedIds = new Set<string>();
          for (const id of drag.ids) {
            for (const e2 of indoorEdges) {
              if (e2.type === "floor_transition") continue;
              if (e2.startNodeId === id) connectedIds.add(e2.endNodeId);
              if (e2.endNodeId === id) connectedIds.add(e2.startNodeId);
            }
          }
          const xs = drag.origins.map((o) => o.x);
          const ys = drag.origins.map((o) => o.y);
          const others = indoorAlignmentReferences
            .filter((candidate) => !drag.ids.includes(candidate.id))
            .map((candidate) => ({ x: candidate.x, y: candidate.y, id: candidate.id }));
          // A single free Walking Point should align by its actual anchor, so
          // the connected segment can become mathematically straight when the
          // pointer comes near a neighbour.  Group drags retain the rigid-bbox
          // behaviour; only the one-node path uses the per-axis connected-node
          // priority helper.
          if (drag.ids.length === 1) {
            const origin = drag.origins[0];
            const aligned = navAlignSnap(
              { x: origin.x + dx, y: origin.y + dy },
              others,
              8,
              connectedIds,
            );
            dx = aligned.x - origin.x;
            dy = aligned.y - origin.y;
            setNavAlignGuides(aligned.guides);
          } else {
            const snap = navGroupAlignSnap(
              {
                minX: Math.min(...xs),
                minY: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys),
              },
              dx,
              dy,
              others
            );
            dx = snap.dx;
            dy = snap.dy;
            setNavAlignGuides(snap.guides);
          }
        }
        // B5 correction: TRUE 1:1 RIGID TRANSLATION. `dx/dy` are the TOTAL
        // world delta from the drag-start pointer (already snapped/shifted as a
        // single shared vector above). Every frame applies that SAME vector to
        // the IMMUTABLE snapshot — node origins + internal edge bend origins —
        // never to already-translated geometry, so nothing compounds, the group
        // stays under the cursor under any zoom/pan, and the selected graph's
        // shape is identical before/after (no re-orthogonalization).
        const rdx = Math.round(dx);
        const rdy = Math.round(dy);
        const originById = new Map(drag.origins.map((o) => [o.id, o]));
        const nextNodes = indoorNodes.map((n) => {
          const origin = originById.get(n.id);
          if (!origin) return n;
          const x = clamp(Math.round(origin.x + rdx), 0, FP_W);
          const y = clamp(Math.round(origin.y + rdy), 0, FP_H);
          if (x === n.x && y === n.y) return n;
          return { ...n, x, y };
        });
        const movingIds = new Set(drag.ids);
        const nextEdges = indoorEdges.map((e) => {
          const originBends = drag.edgeOrigins.get(e.id);
          const translated = originBends && originBends.length > 0
            ? { ...e, bendPoints: originBends.map((b) => ({ x: b.x + rdx, y: b.y + rdy })) }
            : e;
          // A split-on-path point is an ordinary freely movable point. Rebuild
          // every incident manual edge from the CURRENT node positions so its
          // endpoint follows the point without retaining stale parent-corridor
          // bends or creating a hidden/retracing shortcut.
          if (!movingIds.has(e.startNodeId) && !movingIds.has(e.endNodeId)) return translated;
          return isManualIndoorWalkingEdge(translated, nextNodes)
            ? rebuildEdgeGeometryFromCurrentNodes(
                translated,
                nextNodes,
                drag.origins
                  .filter((origin) => origin.id === e.startNodeId || origin.id === e.endNodeId)
                  .map((origin) => ({ x: origin.x, y: origin.y })),
              )
            : translated;
        });
        commitNavGraph(nextNodes, nextEdges);
        return;
      }
      // Navigation visibility alone must not own the physical pointer stream.
      // Only an active exclusive navigation tool should stop the floor editor's
      // normal move/resize/placement pipeline here.
      if (showNavOverlay && navTool !== "select" && navTool !== "pan") return;
    }

    if (calibrationDraft.active || tool === "measure") return;

    if (tool === "door" || tool === "window") {
      const target = openingWallTarget(pt, tool);
      setOpeningPreview(target ? {
        type: tool,
        wallId: target.wall.id,
        x: target.x,
        y: target.y,
        offset: target.offset,
        width: target.width,
        angle: target.angle,
      } : null);
    } else if (openingPreview) {
      setOpeningPreview(null);
    }

    if (rubberBand) {
      setRubberBand({ ...rubberBand, cx: boundedPt.x, cy: boundedPt.y });
      return;
    }

    if (openingDrag.current) {
      const state = openingDrag.current;
      const wall = wallById.get(state.wallId);
      if (!wall) return;
      const nearest = nearestPointOnWall(pt, wall);
      const doorAlignment = state.type === "door"
        ? alignDoorOnWallToConnectedPoint(state.id, wall, { x: nearest.x, y: nearest.y })
        : { point: { x: nearest.x, y: nearest.y }, guides: [] as { type: "h" | "v"; pos: number }[] };
      const alignedNearest = nearestPointOnWall(doorAlignment.point, wall);
      setNavAlignGuides(doorAlignment.guides);
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (length < OPENING_MIN_WIDTH) return;
      const minWidth = state.type === "door" ? doorMinWidth(effectiveDoorType(state.origin as FloorDoor)) : OPENING_MIN_WIDTH;
      const maxWidth = state.type === "door" ? doorMaxWidth(effectiveDoorType(state.origin as FloorDoor)) : WINDOW_MAX_WIDTH;
      const width = clamp(state.origin.width, Math.min(minWidth, length), maxOpeningWidthForWall(wall, maxWidth, minWidth));
      const offset = clampWallOpeningOffset(wall, width, alignedNearest.t);
      const x = Math.round(wall.x1 + (wall.x2 - wall.x1) * offset);
      const y = Math.round(wall.y1 + (wall.y2 - wall.y1) * offset);
      if (Math.abs((state.origin.offset ?? 0) - offset) > 0.001 || state.origin.x !== x || state.origin.y !== y) gestureMoved.current = true;
      if (state.type === "door") {
        updFloor(rooms, fpaths, walls, doors.map((door) => door.id === state.id ? { ...door, x, y, offset, width: Math.round(width) } : door), windows);
      } else {
        updFloor(rooms, fpaths, walls, doors, windows.map((win) => win.id === state.id ? { ...win, x, y, offset, width: Math.round(width) } : win));
      }
      return;
    }

    // Wall drawing preview: structural snaps (endpoint → segment → boundary) are
    if (openingResize.current) {
      const state = openingResize.current;
      const wall = wallById.get(state.wallId);
      if (!wall) return;
      const nearest = nearestPointOnWall(pt, wall);
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (length < OPENING_MIN_WIDTH) return;
      const originOffset = state.origin.offset ?? nearestPointOnWall({ x: state.origin.x, y: state.origin.y }, wall).t;
      const originWidth = state.origin.width;
      const fixedEdgeOffset = clamp(originOffset - state.handleSign * (originWidth / 2 / length), 0, 1);
      const rawWidth = Math.abs(nearest.t - fixedEdgeOffset) * length;
      const minWidth = state.type === "door" ? doorMinWidth(effectiveDoorType(state.origin as FloorDoor)) : OPENING_MIN_WIDTH;
      const maxLimit = state.type === "door" ? doorMaxWidth(effectiveDoorType(state.origin as FloorDoor)) : WINDOW_MAX_WIDTH;
      if (!wallCanFitOpening(wall, minWidth)) return;
      const width = clamp(rawWidth, minWidth, maxOpeningWidthForWall(wall, maxLimit, minWidth));
      const requestedCenter = fixedEdgeOffset + state.handleSign * (width / 2 / length);
      const offset = clampWallOpeningOffset(wall, width, requestedCenter);
      const x = Math.round(wall.x1 + (wall.x2 - wall.x1) * offset);
      const y = Math.round(wall.y1 + (wall.y2 - wall.y1) * offset);
      if (Math.abs(state.origin.width - width) > 0.5 || Math.abs((state.origin.offset ?? 0.5) - offset) > 0.001) gestureMoved.current = true;
      if (state.type === "door") {
        updFloor(rooms, fpaths, walls, doors.map((door) => door.id === state.id ? { ...door, x, y, offset, width: Math.round(width) } : door), windows);
      } else {
        updFloor(rooms, fpaths, walls, doors, windows.map((win) => win.id === state.id ? { ...win, x, y, offset, width: Math.round(width) } : win));
      }
      return;
    }

    // resolved from the RAW pointer first so a stronger snap target always beats
    // grid/angle assistance; otherwise grid + 45° angle assistance apply.
    if (wallStart && tool === "wall") {
      const resolved = wallDrawCursor({ x: pt.x, y: pt.y }, e.shiftKey);
      setWallPreview(resolved.point);
      setWallSnapIndicator(resolved.indicator);
      return;
    }

    // Start-point hover feedback: while the Wall tool is armed but no start
    // point is placed yet, preview the EXACT structural snap the first click
    // will commit (same wallStartCursor resolution), so the connection target
    // is visible before clicking — wall creation feels as reliable as endpoint
    // editing. Falls through: nothing else is active before the first click.
    if (tool === "wall" && !wallStart) {
      const resolved = wallStartCursor({ x: pt.x, y: pt.y });
      setWallSnapIndicator(resolved.indicator);
    }

    // Wall endpoint editing: free movement by default (drag an endpoint away to
    // detach and re-angle a wall — it is never permanently locked to a snapped
    // orientation). Structural snaps resolve first from the raw pointer; Shift
    // holds 15° angle assistance around the fixed endpoint.
    if (wallEndpointDrag.current) {
      const ep = wallEndpointDrag.current;
      const resolved = wallEndpointCursor({ x: pt.x, y: pt.y }, e.shiftKey, ep);
      setWallSnapIndicator(resolved.indicator);
      const clampedX = resolved.point.x;
      const clampedY = resolved.point.y;
      const originPt = ep.endpoint === "x1" ? { x: ep.origin.x1, y: ep.origin.y1 } : { x: ep.origin.x2, y: ep.origin.y2 };
      if (originPt.x !== clampedX || originPt.y !== clampedY) gestureMoved.current = true;
      // Update the wall endpoint in real time
      updFloor(rooms, fpaths,
        walls.map((w) => {
          if (w.id !== ep.wallId) return w;
          const edited = ep.endpoint === "x1"
            ? { ...w, x1: clampedX, y1: clampedY, startAnchor: resolved.point.roomAnchor }
            : { ...w, x2: clampedX, y2: clampedY, endAnchor: resolved.point.roomAnchor };
          return normalizeWallRoomAnchors(edited, rooms);
        })
      );
      return;
    }

    // Room/stairs/elevator drag preview
    if (roomDrag && (tool === "room" || tool === "stairs" || tool === "ramp" || tool === "elevator")) {
      const s = (v: number) => snapOn ? snapToGrid(v, floorGridSize) : Math.round(v);
      let cx = clamp(s(pt.x), 0, FP_W);
      let cy = clamp(s(pt.y), 0, FP_H);
      // Universal placement alignment: snap to nearby object edges during creation preview.
      if (tool === "room") {
        const rw = Math.max(Math.abs(cx - roomDrag.sx), 20);
        const rh = Math.max(Math.abs(cy - roomDrag.sy), 15);
        const rx = Math.min(roomDrag.sx, cx);
        const ry = Math.min(roomDrag.sy, cy);
        const rawCandidate = { x: rx, y: ry, w: rw, h: rh };
        const alignment = computeRoomAlignmentGuides(rawCandidate, rooms);
        const snapped = snapOn
          ? snapRoomToNearbyEdges({ x: alignment.snappedX, y: alignment.snappedY, w: rw, h: rh }, rooms)
          : rawCandidate;
        if (snapped.x !== rx) cx = cx >= roomDrag.sx ? snapped.x + rw : snapped.x;
        if (snapped.y !== ry) cy = cy >= roomDrag.sy ? snapped.y + rh : snapped.y;
        // Guides remain useful with Snap OFF, but only Snap ON resolves the
        // candidate to the guide.
        const guideResult = snapOn
          ? computeRoomAlignmentGuides({ x: snapped.x, y: snapped.y, w: rw, h: rh }, rooms)
          : alignment;
        if (guideResult.guides.length > 0) {
          setAlignGuides(guideResult.guides);
        } else {
          setAlignGuides([]);
        }
      } else {
        // Stairs/ramp/elevator: alignment snap against all objects
        const minW = tool === "elevator" ? 14 : 16;
        const minH = tool === "elevator" ? 14 : 12;
        const rw = Math.max(Math.abs(cx - roomDrag.sx), minW);
        const rh = Math.max(Math.abs(cy - roomDrag.sy), minH);
        const rx = Math.min(roomDrag.sx, cx);
        const ry = Math.min(roomDrag.sy, cy);
        const refs = collectAlignRefs();
        const alignResult = computeAlignmentGuides({ x: rx, y: ry, w: rw, h: rh }, refs);
        if (snapOn && (alignResult.snappedX !== rx || alignResult.snappedY !== ry)) {
          const dsx = alignResult.snappedX - rx;
          const dsy = alignResult.snappedY - ry;
          cx = Math.round(cx + dsx);
          cy = Math.round(cy + dsy);
        }
        if (alignResult.guides.length > 0) {
          setAlignGuides(alignResult.guides);
        } else {
          setAlignGuides([]);
        }
      }
      setRoomDrag({ ...roomDrag, cx, cy });
      return;
    }

    if (resizing.current) {
      const state = resizing.current;
      const origin: FloorRoom = { ...rooms.find((r) => r.id === state.id)!, x: state.ox, y: state.oy, w: state.ow, h: state.oh, rotation: state.rotation ?? 0 };
      // B7 QA: compute delta in canvas coordinates, not screen pixels,
      // so resize tracks the cursor 1:1 at every zoom level.
      const startCanvas = getPoint({ clientX: state.sx, clientY: state.sy } as MouseEvent, FP_W, FP_H);
      const curCanvas = getPoint(e, FP_W, FP_H);
      const dx = Math.round(curCanvas.x - startCanvas.x);
      const dy = Math.round(curCanvas.y - startCanvas.y);
      const resized = resizeRoomWithinFloor(origin, state.corner, dx, dy, FP_W, FP_H);
      const corner = state.corner;
      const otherRooms = rooms.filter((r) => r.id !== state.id);
      // ── Single source of truth: compute hard limits BEFORE any snapping ──
      const limits = computeResizeLimits(origin, corner, otherRooms, FP_W, FP_H);
      // ── Anchor restoration + hard limits (deterministic base candidate) ──
      let candidate = { ...resized };
      if (corner.includes("e")) {
        candidate.x = origin.x;
        candidate.w = clamp(candidate.w, 20, limits.maxX - origin.x);
      } else if (corner.includes("w")) {
        const rightEdge = origin.x + origin.w;
        candidate.w = clamp(candidate.w, 20, rightEdge - limits.minX);
        candidate.x = rightEdge - candidate.w;
      } else {
        candidate.x = Math.max(limits.minX, Math.min(candidate.x, limits.maxX - candidate.w));
      }
      if (corner.includes("s")) {
        candidate.y = origin.y;
        candidate.h = clamp(candidate.h, 15, limits.maxY - origin.y);
      } else if (corner.includes("n")) {
        const bottomEdge = origin.y + origin.h;
        candidate.h = clamp(candidate.h, 15, bottomEdge - limits.minY);
        candidate.y = bottomEdge - candidate.h;
      } else {
        candidate.y = Math.max(limits.minY, Math.min(candidate.y, limits.maxY - candidate.h));
      }
      // ── Edge snapping: snap only the MOVING edge(s) within valid range ──
      // This avoids oscillation from full alignment snapping changing the
      // size, which anchor restoration then overwrites.
      const snapResult = snapResizeEdges(candidate, corner, limits, otherRooms);
      if (snapOn) {
        candidate = { x: snapResult.x, y: snapResult.y, w: snapResult.w, h: snapResult.h };
      }
      // Show alignment guides during resize.
      if (snapResult.guides.length > 0) {
        setAlignGuides(snapResult.guides);
      } else {
        setAlignGuides([]);
      }
      // ── Final floor-bounds safety clamp (defense-in-depth) ──
      candidate.x = Math.max(0, Math.min(candidate.x, FP_W - candidate.w));
      candidate.y = Math.max(0, Math.min(candidate.y, FP_H - candidate.h));
      candidate.w = clamp(candidate.w, 20, FP_W);
      candidate.h = clamp(candidate.h, 15, FP_H);
      // ── Overlap check (defense-in-depth after hard limits) ──
      const overlapDuringResize = findOverlappingRoom(candidate, rooms);
      if (overlapDuringResize) {
        // Try without snapping — recompute from raw resize with same anchor limits.
        let rawCandidate = { ...resized };
        if (corner.includes("e")) {
          rawCandidate.x = origin.x;
          rawCandidate.w = clamp(resized.w, 20, limits.maxX - origin.x);
        } else if (corner.includes("w")) {
          const rightEdge = origin.x + origin.w;
          rawCandidate.w = clamp(resized.w, 20, rightEdge - limits.minX);
          rawCandidate.x = rightEdge - rawCandidate.w;
        }
        if (corner.includes("s")) {
          rawCandidate.y = origin.y;
          rawCandidate.h = clamp(resized.h, 15, limits.maxY - origin.y);
        } else if (corner.includes("n")) {
          const bottomEdge = origin.y + origin.h;
          rawCandidate.h = clamp(resized.h, 15, bottomEdge - limits.minY);
          rawCandidate.y = bottomEdge - rawCandidate.h;
        }
        rawCandidate.x = Math.max(0, Math.min(rawCandidate.x, FP_W - rawCandidate.w));
        rawCandidate.y = Math.max(0, Math.min(rawCandidate.y, FP_H - rawCandidate.h));
        rawCandidate.w = clamp(rawCandidate.w, 20, FP_W);
        rawCandidate.h = clamp(rawCandidate.h, 15, FP_H);
        const rawOverlap = findOverlappingRoom(rawCandidate, rooms);
        if (!rawOverlap) {
          candidate = rawCandidate;
        } else if (lastValidResizeRef.current) {
          if (!gestureMoved.current) {
            toast.warning("Room overlap", `Cannot resize here — would overlap "${rawOverlap.name}".`);
          }
          gestureMoved.current = true;
          return;
        } else {
          candidate = rawCandidate;
        }
      }
      // Accept candidate — update last valid geometry.
      lastValidResizeRef.current = { x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h };
      const nextRooms = rooms.map((r) => r.id === state.id ? candidate : r);
      const anchored = anchoredRoomUpdate(nextRooms, walls, new Set([state.id]));
      if (anchored.blocked) return;
      if (candidate.x !== origin.x || candidate.y !== origin.y || candidate.w !== origin.w || candidate.h !== origin.h) gestureMoved.current = true;
      updFloor(nextRooms, fpaths, anchored.walls);
      return;
    }    if (furnitureResizing.current) {
      const state = furnitureResizing.current;
      const startCanvas = getPoint({ clientX: state.sx, clientY: state.sy } as MouseEvent, FP_W, FP_H);
      const curCanvas = getPoint(e, FP_W, FP_H);
      const dx = Math.round(curCanvas.x - startCanvas.x);
      const dy = Math.round(curCanvas.y - startCanvas.y);
      const resized = resizeFurnitureWithinFloor(state.origin, state.corner, dx, dy, FP_W, FP_H, e.shiftKey);
      // Alignment snap: match edges/size to nearby objects
      const refs = collectAlignRefs(new Set([state.id]));
      const alignResult = computeResizeAlignmentGuides(
        { x: resized.x, y: resized.y, w: resized.width, h: resized.height, id: state.id },
        refs, true,
      );
      let furnitureCandidate = { ...resized };
      if (snapOn && alignResult.snappedX !== resized.x) furnitureCandidate.x = alignResult.snappedX;
      if (snapOn && alignResult.snappedY !== resized.y) furnitureCandidate.y = alignResult.snappedY;
      if (snapOn && alignResult.snappedW !== undefined) furnitureCandidate.width = alignResult.snappedW;
      if (snapOn && alignResult.snappedH !== undefined) furnitureCandidate.height = alignResult.snappedH;
      // Clamp to floor using AABB for rotated furniture (no rounding until final)
      const fAabb = rotatedRectBounds(furnitureCandidate.x, furnitureCandidate.y, furnitureCandidate.width, furnitureCandidate.height, furnitureCandidate.rotation);
      let fDx = 0, fDy = 0;
      if (fAabb.x < 0) fDx = -fAabb.x;
      if (fAabb.y < 0) fDy = -fAabb.y;
      if (fAabb.x + fAabb.w > FP_W) fDx = Math.min(fDx, FP_W - fAabb.x - fAabb.w);
      if (fAabb.y + fAabb.h > FP_H) fDy = Math.min(fDy, FP_H - fAabb.y - fAabb.h);
      if (fDx !== 0 || fDy !== 0) {
        furnitureCandidate = { ...furnitureCandidate, x: furnitureCandidate.x + fDx, y: furnitureCandidate.y + fDy } as typeof furnitureCandidate;
      }
      // Show guides
      if (alignResult.guides.length > 0) {
        setAlignGuides(alignResult.guides);
      } else {
        setAlignGuides([]);
      }
      if (furnitureCandidate.x !== state.origin.x || furnitureCandidate.y !== state.origin.y ||
        furnitureCandidate.width !== state.origin.width || furnitureCandidate.height !== state.origin.height) {
        gestureMoved.current = true;
      }
      updFloor(rooms, fpaths, walls, doors, windows, furniture.map((f) => f.id === state.id ? furnitureCandidate : f));
      return;
    }

    if (circulationResizing.current) {
      const state = circulationResizing.current;
      // B7 QA: same canvas-space delta fix for circulation resize.
      const startCanvas = getPoint({ clientX: state.sx, clientY: state.sy } as MouseEvent, FP_W, FP_H);
      const curCanvas = getPoint(e, FP_W, FP_H);
      const dx = Math.round(curCanvas.x - startCanvas.x);
      const dy = Math.round(curCanvas.y - startCanvas.y);      const resized = resizeCirculationWithinFloor(state.origin as any, state.corner, dx, dy, FP_W, FP_H, e.shiftKey);
      // Alignment snap: match edges/size to nearby objects
      const refs = collectAlignRefs(new Set([state.id]));
      const alignResult = computeResizeAlignmentGuides(
        { x: resized.x, y: resized.y, w: resized.width, h: resized.height, id: state.id },
        refs, true,
      );
      let circCandidate = { ...resized };
      if (snapOn && alignResult.snappedX !== resized.x) circCandidate.x = alignResult.snappedX;
      if (snapOn && alignResult.snappedY !== resized.y) circCandidate.y = alignResult.snappedY;
      if (snapOn && alignResult.snappedW !== undefined) circCandidate.width = alignResult.snappedW;
      if (snapOn && alignResult.snappedH !== undefined) circCandidate.height = alignResult.snappedH;
      circCandidate.x = Math.max(0, Math.min(circCandidate.x, FP_W - circCandidate.width));
      circCandidate.y = Math.max(0, Math.min(circCandidate.y, FP_H - circCandidate.height));
      if (alignResult.guides.length > 0) setAlignGuides(alignResult.guides);
      else setAlignGuides([]);
      if (circCandidate.x !== state.origin.x || circCandidate.y !== state.origin.y ||
        circCandidate.width !== state.origin.width || circCandidate.height !== state.origin.height) {
        gestureMoved.current = true;
      }
      if (state.type === "stairs") {
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.map((s) => s.id === state.id ? circCandidate : s));
      } else if (state.type === "ramp") {
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps.map((r) => r.id === state.id ? circCandidate : r));
      } else {
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.map((el) => el.id === state.id ? circCandidate : el));
      }
      return;
    }

    if (rotating.current) {
      const state = rotating.current;
      const currentAngle = rotationFromPoint(pt, state.cx, state.cy);
      const delta = currentAngle - state.startAngle;
      const rotation = normalizeRotation(state.originRotation + (e.shiftKey ? Math.round(delta / 15) * 15 : delta));
      if (state.type === "room") {
        const nextRooms = rooms.map((r) => r.id === state.id ? { ...r, rotation } : r);
        const anchored = anchoredRoomUpdate(nextRooms, walls, new Set([state.id]));
        if (anchored.blocked) return;
        if (rotation !== state.originRotation) gestureMoved.current = true;
        updFloor(nextRooms, fpaths, anchored.walls);
      } else if (state.type === "furniture") {
        if (rotation !== state.originRotation) gestureMoved.current = true;
        updFloor(rooms, fpaths, walls, doors, windows, furniture.map((f) => f.id === state.id ? { ...f, rotation } : f));
      } else if (state.type === "stairs") {
        if (rotation !== state.originRotation) gestureMoved.current = true;
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.map((s) => s.id === state.id ? { ...s, rotation } : s));
      } else if (state.type === "ramp") {
        if (rotation !== state.originRotation) gestureMoved.current = true;
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps.map((r) => r.id === state.id ? { ...r, rotation } : r));
      } else {
        if (rotation !== state.originRotation) gestureMoved.current = true;
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.map((el) => el.id === state.id ? { ...el, rotation } : el));
      }
      return;
    }

    if (labelTransforming.current) {
      const state = labelTransforming.current;
      if (state.kind === "resize") {
        const currentDistance = Math.max(1, dist(pt.x, pt.y, state.center.x, state.center.y));
        const scale = clamp(currentDistance / Math.max(1, state.startDistance ?? currentDistance), 0.45, 3);
        const nextFontSize = clamp(Math.round(state.origin.fontSize * scale), 6, 48);
        if (nextFontSize !== state.origin.fontSize) gestureMoved.current = true;
        updateLabel(state.id, { fontSize: nextFontSize });
      } else {
        const currentAngle = rotationFromPoint(pt, state.center.x, state.center.y);
        const rawDelta = currentAngle - (state.startAngle ?? currentAngle);
        const rotation = normalizeRotation((state.originRotation ?? 0) + (e.shiftKey ? Math.round(rawDelta / 15) * 15 : rawDelta));
        if (rotation !== (state.originRotation ?? 0)) gestureMoved.current = true;
        updateLabel(state.id, { rotation });
      }
      return;
    }

    if (groupTransforming.current) {
      const state = groupTransforming.current;
      let transformed: { type: FloorSelection["type"]; id: string; item: any }[] = [];
      if (state.kind === "resize" && state.handle) {
        const minSize = 24;
        const b = state.originBounds;
        let nx = b.x;
        let ny = b.y;
        let nw = b.w;
        let nh = b.h;
        if (state.handle.includes("e")) nw = clamp(b.w + (boundedPt.x - (b.x + b.w)), minSize, FP_W - b.x);
        if (state.handle.includes("s")) nh = clamp(b.h + (boundedPt.y - (b.y + b.h)), minSize, FP_H - b.y);
        if (state.handle.includes("w")) {
          nx = clamp(boundedPt.x, 0, b.x + b.w - minSize);
          nw = b.x + b.w - nx;
        }
        if (state.handle.includes("n")) {
          ny = clamp(boundedPt.y, 0, b.y + b.h - minSize);
          nh = b.y + b.h - ny;
        }
        const nextBounds = { x: nx, y: ny, w: nw, h: nh };
        transformed = state.entries.map((entry) => ({
          type: entry.type,
          id: entry.id,
          item: scaleFloorItemFromBounds(entry.type, entry.origin, state.originBounds, nextBounds, FP_W, FP_H),
        }));
      } else {
        const currentAngle = rotationFromPoint(pt, state.center.x, state.center.y);
        const rawDelta = currentAngle - (state.startAngle ?? currentAngle);
        const delta = e.shiftKey ? Math.round(rawDelta / 15) * 15 : rawDelta;
        transformed = state.entries.map((entry) => ({
          type: entry.type,
          id: entry.id,
          item: rotateFloorItem(entry.type, entry.origin, state.center.x, state.center.y, delta, FP_W, FP_H),
        }));
      }
      const bounds = transformed
        .map((entry) => itemBounds(entry.type, entry.item))
        .filter((value): value is NonNullable<typeof value> => !!value);
      const fits = bounds.every((b) => b.x >= -0.1 && b.y >= -0.1 && b.x + b.w <= FP_W + 0.1 && b.y + b.h <= FP_H + 0.1);
      if (fits) {
        if (applyTransformedEntries(transformed)) gestureMoved.current = true;
      }
      return;
    }

    movePan(e);
    if (!dragging.current) return;
    const drag = dragging.current;
    const rawDx = Math.round(pt.x - drag.sx);
    const rawDy = Math.round(pt.y - drag.sy);
    const bounds = drag.entries
      .map((entry) => itemBounds(entry.type, entry.origin))
      .filter((value): value is NonNullable<typeof value> => !!value);
    const { dx, dy } = constrainDeltaForBounds(bounds, rawDx, rawDy, FP_W, FP_H);
    const moved = drag.entries.map((entry) => ({
      ...entry,
      item: translateFloorItem(entry.type, entry.origin, dx, dy, FP_W, FP_H),
    }));
    const byId = new Map(moved.map((entry) => [entry.id, entry.item]));
    const movedRoomIds = new Set(moved.filter((entry) => entry.type === "room").map((entry) => entry.id));
    const movedWallIds = new Set(moved.filter((entry) => entry.type === "wall").map((entry) => entry.id));
    let nextRooms = rooms.map((r) => byId.get(r.id) ?? r);
    let nextFurniture = furniture.map((f) => byId.get(f.id) ?? f);
    let nextStairs = stairs.map((s) => byId.get(s.id) ?? s);
    let nextRamps = ramps.map((r) => byId.get(r.id) ?? r);
    let nextElevators = elevators.map((el) => byId.get(el.id) ?? el);
    let nextLabels = labels.map((lb) => byId.get(lb.id) ?? lb);
    // ── Universal alignment: snap ALL supported moved objects ──
    let allMoveGuides: { type: "h" | "v"; pos: number; x1: number; y1: number; x2: number; y2: number }[] = [];
    const movedIds = new Set(moved.map((e) => e.id));
    const refs = collectAlignRefs(movedIds);
    // Resolve alignment once per axis from the first eligible RAW object in
    // this gesture.  The lock keeps a nearly-equal edge/centre target stable;
    // applying one delta to the selected set also prevents multi-selection
    // members from fighting over different guides.
    const eligibleMoved = moved
      .filter((entry) => entry.type !== "wall" && entry.type !== "door" && entry.type !== "window" && entry.type !== "path")
      .map((entry) => ({ entry, bounds: itemBounds(entry.type, entry.item) }))
      .filter((value): value is { entry: typeof moved[number]; bounds: NonNullable<ReturnType<typeof itemBounds>> } => !!value.bounds);
    let axisDxSnap = 0;
    let axisDySnap = 0;
    let axisXGuide: RoomAlignGuide | undefined;
    let axisYGuide: RoomAlignGuide | undefined;
    if (!snapOn) {
      alignmentSnapLocksRef.current = { x: null, y: null };
    } else {
      // Prefer the first moved object, but allow another selected object to
      // establish the axis when the first has no nearby candidate.
      for (const { entry, bounds: b } of eligibleMoved) {
        const result = computeAlignmentGuides({ x: b.x, y: b.y, w: b.w, h: b.h, id: entry.id }, refs);
        if (!alignmentSnapLocksRef.current.x || !axisXGuide) {
          const resolvedX = resolveStableAlignmentAxis(
            b.x,
            result.snappedX,
            result.guides.find((guide) => guide.type === "v"),
            alignmentSnapLocksRef.current.x,
          );
          alignmentSnapLocksRef.current.x = resolvedX.lock;
          if (resolvedX.snapped) {
            axisDxSnap = resolvedX.delta;
            axisXGuide = resolvedX.lock?.guide;
          }
        }
        if (!alignmentSnapLocksRef.current.y || !axisYGuide) {
          const resolvedY = resolveStableAlignmentAxis(
            b.y,
            result.snappedY,
            result.guides.find((guide) => guide.type === "h"),
            alignmentSnapLocksRef.current.y,
          );
          alignmentSnapLocksRef.current.y = resolvedY.lock;
          if (resolvedY.snapped) {
            axisDySnap = resolvedY.delta;
            axisYGuide = resolvedY.lock?.guide;
          }
        }
        // Existing locks are resolved against the first eligible object. Once
        // both axes are settled, later objects must not replace them.
        if (alignmentSnapLocksRef.current.x && alignmentSnapLocksRef.current.y) break;
      }
      if (axisXGuide) allMoveGuides.push(axisXGuide);
      if (axisYGuide) allMoveGuides.push(axisYGuide);
    }
    // Labels ARE snapped (their anchor box participates like any other rect)
    // so dragging a label near a room/furniture edge aligns visibly.
    for (const entry of moved) {
      if (entry.type === "wall" || entry.type === "door" || entry.type === "window" || entry.type === "path") continue;
      const b = itemBounds(entry.type, entry.item);
      if (!b) continue;
      const dxSnap = snapOn ? axisDxSnap : 0;
      const dySnap = snapOn ? axisDySnap : 0;
      if (dxSnap === 0 && dySnap === 0) continue;
      if (entry.type === "room") {
        nextRooms = nextRooms.map((r) => r.id === entry.id ? { ...r, x: r.x + dxSnap, y: r.y + dySnap } : r);
        byId.set(entry.id, { ...entry.item, x: entry.item.x + dxSnap, y: entry.item.y + dySnap });
      } else if (entry.type === "furniture") {
        nextFurniture = nextFurniture.map((f) => f.id === entry.id ? { ...f, x: f.x + dxSnap, y: f.y + dySnap } : f);
        byId.set(entry.id, { ...entry.item, x: entry.item.x + dxSnap, y: entry.item.y + dySnap });
      } else if (entry.type === "stairs") {
        nextStairs = nextStairs.map((s) => s.id === entry.id ? { ...s, x: s.x + dxSnap, y: s.y + dySnap } : s);
        byId.set(entry.id, { ...entry.item, x: entry.item.x + dxSnap, y: entry.item.y + dySnap });
      } else if (entry.type === "ramp") {
        nextRamps = nextRamps.map((r) => r.id === entry.id ? { ...r, x: r.x + dxSnap, y: r.y + dySnap } : r);
        byId.set(entry.id, { ...entry.item, x: entry.item.x + dxSnap, y: entry.item.y + dySnap });
      } else if (entry.type === "elevator") {
        nextElevators = nextElevators.map((el) => el.id === entry.id ? { ...el, x: el.x + dxSnap, y: el.y + dySnap } : el);
        byId.set(entry.id, { ...entry.item, x: entry.item.x + dxSnap, y: entry.item.y + dySnap });
      } else if (entry.type === "label") {
        nextLabels = nextLabels.map((lb) => lb.id === entry.id ? { ...lb, x: lb.x + dxSnap, y: lb.y + dySnap } : lb);
        byId.set(entry.id, { ...entry.item, x: entry.item.x + dxSnap, y: entry.item.y + dySnap });
      }
    }
    // Clamp ALL moved objects back within floor bounds using itemBounds
    // (handles both w/h and width/height property names correctly)
    if (movedRoomIds.size > 0) {
      nextRooms = nextRooms.map((r) => {
        if (!movedRoomIds.has(r.id)) return r;
        const cx = Math.max(0, Math.min(r.x, FP_W - r.w));
        const cy = Math.max(0, Math.min(r.y, FP_H - r.h));
        return (cx === r.x && cy === r.y) ? r : { ...r, x: cx, y: cy };
      });
    }
    for (const entry of moved) {
      if (entry.type === "furniture") {
        nextFurniture = nextFurniture.map((f) => {
          if (f.id !== entry.id) return f;
          const cx = Math.max(0, Math.min(f.x, FP_W - f.width));
          const cy = Math.max(0, Math.min(f.y, FP_H - f.height));
          return (cx === f.x && cy === f.y) ? f : { ...f, x: cx, y: cy };
        });
      }
      if (entry.type === "stairs") {
        nextStairs = nextStairs.map((s) => {
          if (s.id !== entry.id) return s;
          const cx = Math.max(0, Math.min(s.x, FP_W - s.width));
          const cy = Math.max(0, Math.min(s.y, FP_H - s.height));
          return (cx === s.x && cy === s.y) ? s : { ...s, x: cx, y: cy };
        });
      }
      if (entry.type === "ramp") {
        nextRamps = nextRamps.map((r) => {
          if (r.id !== entry.id) return r;
          const cx = Math.max(0, Math.min(r.x, FP_W - r.width));
          const cy = Math.max(0, Math.min(r.y, FP_H - r.height));
          return (cx === r.x && cy === r.y) ? r : { ...r, x: cx, y: cy };
        });
      }
      if (entry.type === "elevator") {
        nextElevators = nextElevators.map((el) => {
          if (el.id !== entry.id) return el;
          const cx = Math.max(0, Math.min(el.x, FP_W - el.width));
          const cy = Math.max(0, Math.min(el.y, FP_H - el.height));
          return (cx === el.x && cy === el.y) ? el : { ...el, x: cx, y: cy };
        });
      }
    }
    let nextWalls = walls.map((w) => {
      const movedWall = byId.get(w.id) as FloorWall | undefined;
      if (!movedWall) return w;
      const startAnchor = movedWall.startAnchor && movedRoomIds.has(movedWall.startAnchor.roomId) ? movedWall.startAnchor : undefined;
      const endAnchor = movedWall.endAnchor && movedRoomIds.has(movedWall.endAnchor.roomId) ? movedWall.endAnchor : undefined;
      return { ...movedWall, startAnchor, endAnchor };
    });
    const anchored = anchoredRoomUpdate(nextRooms, nextWalls, movedRoomIds, movedWallIds);
    if (anchored.blocked) return;
    nextWalls = anchored.walls;
    // B7 QA: prevent room moves that would overlap another room, UNLESS
    // the room is already overlapping (legacy/invalid state) — in that case,
    // allow movement so the user can recover the room to a valid position.
    if (movedRoomIds.size > 0) {
      const stationaryRooms = nextRooms.filter((r) => !movedRoomIds.has(r.id));
      for (const movedRoom of nextRooms.filter((r) => movedRoomIds.has(r.id))) {
        // Check if the room was ALREADY overlapping before the move.
        const originRoom = drag.entries.find((e) => e.id === movedRoom.id)?.origin ?? movedRoom;
        const wasAlreadyOverlapping = findOverlappingRoom(originRoom, rooms.filter((r) => !movedRoomIds.has(r.id))) !== null;
        if (wasAlreadyOverlapping) {
          // Room was already invalid — allow any movement toward recovery.
          continue;
        }
        const overlap = findOverlappingRoom(movedRoom, stationaryRooms);
        if (overlap) {
          // Revert to origin and cancel the move.
          gestureMoved.current = false;
          if (!roomOverlapWarnedRef.current) {
            roomOverlapWarnedRef.current = true;
            toast.warning("Room overlap", `Cannot move here — would overlap "${overlap.name}".`);
          }
          return;
        }
      }
    }
    if (dx !== 0 || dy !== 0) gestureMoved.current = true;
    // B7 QA: show alignment guides during move.
    if (allMoveGuides.length > 0) {
      setAlignGuides(allMoveGuides);
    } else {
      setAlignGuides([]);
    }
    updFloor(
      nextRooms,
      fpaths,
      nextWalls,
      doors.map((d) => byId.get(d.id) ?? d),
      windows.map((w) => byId.get(w.id) ?? w),
      nextFurniture,
      nextStairs,
      nextElevators,
      nextLabels,
      nextRamps
    );
  };

  const handleSvgUp = () => {
    endPan();
    alignmentSnapLocksRef.current = { x: null, y: null };
    // B7 QA: room alignment guides disappear after gesture.
    setAlignGuides([]);
    // Navigation-anchor guides (including Door-on-wall guides) are transient
    // as well; never leave the last drag's guide visible after mouseup.
    setNavAlignGuides([]);
    // Navigation visibility alone must not swallow the end of a physical
    // drag or placement gesture. Only an actual navigation gesture gets the
    // early graph-commit path; Select-mode floor interactions continue through
    // the normal physical cleanup/finalization below.
    if (navMode && (rubberBand || navDragRef.current || navBendDragRef.current || navSegDragRef.current)) {
      setNavTargetHover(null);
      setNavNodeHover(null);
      setNavPathTargetHover(null);
      // B5 Phase 2.8: alignment guides disappear after the drag.
      setNavAlignGuides([]);
      navDragWallWarnedRef.current = false;
      if (rubberBand) {
        const rect = {
          x: Math.min(rubberBand.sx, rubberBand.cx),
          y: Math.min(rubberBand.sy, rubberBand.cy),
          w: Math.abs(rubberBand.cx - rubberBand.sx),
          h: Math.abs(rubberBand.cy - rubberBand.sy),
        };
        const capturedNodes = rect.w >= 3 || rect.h >= 3
          ? indoorNodes.filter((n) => !n.roomId && !linkedObjectRef(n)
              && n.x >= rect.x - 2 && n.x <= rect.x + rect.w + 2
              && n.y >= rect.y - 2 && n.y <= rect.y + rect.h + 2
            ).map((n) => n.id)
          : [];
        const capturedEdges = rect.w >= 3 || rect.h >= 3
          ? marqueeIndoorEdges.filter((edge) => {
              const points = edgePolylinePoints(edge, indoorNodes);
              return points ? polylineIntersectsRect(points, rect) : false;
            }).map((edge) => edge.id)
          : [];
        const captured = [...capturedNodes, ...capturedEdges];
        if (captured.length > 0) {
          const last = captured[captured.length - 1];
          setNavSelected(capturedEdges.includes(last) ? { type: "edge", id: last } : { type: "node", id: last });
          setNavMultiSelected(captured);
          setShowProperties(true);
        } else {
          setNavSelected(null);
          setNavMultiSelected([]);
        }
        setRubberBand(null);
        return;
      }
      // Commit the nav drag as ONE history entry.
      if (navDragRef.current) {
        if (gestureMoved.current) pushHistory(navSnapshot());
        suppressHistoryRef.current = false;
        gestureMoved.current = false;
        navDragRef.current = null;
      }
      // B5 Phase 2.5: bend drags commit the same way — ONE undoable gesture.
      if (navBendDragRef.current) {
        if (gestureMoved.current) pushHistory(navSnapshot());
        suppressHistoryRef.current = false;
        gestureMoved.current = false;
        navBendDragRef.current = null;
      }
      // B5 Phase 2.7: segment drags commit the same way — ONE undoable gesture.
      if (navSegDragRef.current) {
        if (gestureMoved.current) pushHistory(navSnapshot());
        suppressHistoryRef.current = false;
        gestureMoved.current = false;
        navSegDragRef.current = null;
      }
      return;
    }
    if (rubberBand) {
      const rect = {
        x: Math.min(rubberBand.sx, rubberBand.cx),
        y: Math.min(rubberBand.sy, rubberBand.cy),
        w: Math.abs(rubberBand.cx - rubberBand.sx),
        h: Math.abs(rubberBand.cy - rubberBand.sy),
      };
      const captured = rect.w >= 3 || rect.h >= 3 ? selectionIdsInRect(floor, rect) : [];
      if (captured.length > 1) {
        setMultiSelected(captured);
        setSelected(null);
        setShowProperties(true);
      } else if (captured.length === 1) {
        setMultiSelected([]);
        selectFloorItem(selectionForId(captured[0]));
      } else {
        setMultiSelected([]);
        setSelected(null);
        setShowProperties(true);
      }
      setRubberBand(null);
      return;
    }
    if (dragging.current?.fromBackground && !gestureMoved.current) {
      suppressHistoryRef.current = false;
      dragging.current = null;
      setSelected(null);
      setMultiSelected([]);
      setShowProperties(true);
      return;
    }
    // Commit exactly ONE history entry per completed gesture: the POST-gesture
    // state (per-frame pushes were suppressed during the drag). Undo therefore
    // restores the pre-gesture snapshot and redo re-applies the gesture.
    if (gestureMoved.current) {
      lastLabelClickRef.current = null;
      pushHistory(floorSnapshot()); /* post-gesture commit */
    }
    suppressHistoryRef.current = false;
    gestureMoved.current = false;
    wallEndpointDrag.current = null;
    openingDrag.current = null;
    openingResize.current = null;
    // While a wall-drawing gesture is in progress the snap indicator stays put
    // (it is cleared explicitly when the wall completes, on Escape, on tool
    // switch, and on floor switch) — do not wipe it on the mid-gesture mouseup.
    if (!(tool === "wall" && wallStart)) setWallSnapIndicator(null);
    dragging.current = null;
    if (groupTransforming.current) { groupTransforming.current = null; return; }
    if (labelTransforming.current) { labelTransforming.current = null; return; }
    if (rotating.current) { rotating.current = null; return; }
    if (circulationResizing.current) { circulationResizing.current = null; return; }
    if (furnitureResizing.current) { furnitureResizing.current = null; return; }
    if (resizing.current) { resizing.current = null; return; }

    // Finalize room/stairs/elevator creation
    // If the placement tool was switched while a pointer gesture was still
    // pending, discard that stale gesture instead of allowing an empty click
    // in Select/Connect/Pan mode to create an object.
    if (roomDrag && tool !== "room" && tool !== "stairs" && tool !== "ramp" && tool !== "elevator") {
      setRoomDrag(null);
      return;
    }
    setNavPathTargetHover(null);
    if (roomDrag && tool === "room") {
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 20);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 15);
      const rx = clamp(Math.min(roomDrag.sx, roomDrag.cx), 0, FP_W - rw);
      const ry = clamp(Math.min(roomDrag.sy, roomDrag.cy), 0, FP_H - rh);
      // B7 Part F: reject room creation that would overlap an existing room.
      // B7 Authoring: snap to nearby room edges before overlap check so adjacent
      // rooms line up cleanly.
      const rawCandidate = { x: Math.round(rx), y: Math.round(ry), w: Math.round(rw), h: Math.round(rh) };
      const snapped = snapOn ? snapRoomToNearbyEdges(rawCandidate, rooms) : rawCandidate;
      // B7 Fix: clamp snapped position back within floor canvas so edge
      // snapping cannot push a newly-created room outside the perimeter.
      const candidate = {
        ...rawCandidate,
        x: Math.max(0, Math.min(snapped.x, FP_W - rawCandidate.w)),
        y: Math.max(0, Math.min(snapped.y, FP_H - rawCandidate.h)),
      };
      const overlap = findOverlappingRoom(candidate, rooms);
      if (overlap) {
        toast.error("Room overlaps", `Cannot place here — overlaps "${overlap.name}". Move or resize to avoid overlap.`);
        setRoomDrag(null);
        setTool("select");
        return;
      }
      const newRoom: FloorRoom = {
         id: genId("rm"), name: nextRoomName(rooms),
        type: sidebarCategory && ROOM_MAP[sidebarCategory] ? sidebarCategory : "classroom", x: candidate.x, y: candidate.y,
        w: candidate.w, h: candidate.h,
        floorId,
        buildingId,
      };
      updFloor([...rooms, newRoom], fpaths);
      selectFloorItem({ type: "room", id: newRoom.id });
      setTool("select");
      setRoomDrag(null);
      toast.success("Room created", "Edit properties in the right panel.");
      return;
    }

    if (roomDrag && tool === "stairs") {
      // A click-to-place Stair uses a compact, practical stairwell footprint.  A
      // deliberate drag still controls the dimensions exactly as before; this
      // only improves the default size for newly placed objects and never
      // resizes persisted Stairs.
      const rawWidth = Math.abs(roomDrag.cx - roomDrag.sx);
      const rawHeight = Math.abs(roomDrag.cy - roomDrag.sy);
      const isDefaultPlacement = rawWidth < 2 && rawHeight < 2;
      const rw = isDefaultPlacement ? 36 : Math.max(rawWidth, 16);
      const rh = isDefaultPlacement ? 44 : Math.max(rawHeight, 12);
      const rx = clamp(Math.min(roomDrag.sx, roomDrag.cx), 0, FP_W - rw);
      const ry = clamp(Math.min(roomDrag.sy, roomDrag.cy), 0, FP_H - rh);
      // Each physical Stair occurrence starts its own explicit continuation
      // identity.  Deriving this from the generic label/count caused a
      // renamed Stair to reuse another Stair's sharedId on the same Floor.
      // Keep the stable prefix for backwards compatibility, but make the
      // identity independent of labels and existing chain membership.
      const newStairId = genId("st");
      const stairSharedId = `shared_stair_${buildingId}_${newStairId}`;
      // B5 Phase 3.1: context-aware default direction — a stair on the lowest
      // floor defaults to Up, highest to Down, middle floors to Both, so the
      // authoring UI never silently creates an impossible cross-floor direction.
      const stairDirection = defaultStairDirectionForFloorInOrder(floor.id, buildingFloors);
      const newStairs: FloorStairs = {
        id: newStairId, x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        rotation: 0, direction: stairDirection, label: stairLabelForEntrySide(false),
        sharedId: stairSharedId,
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, [...stairs, newStairs]);
      selectFloorItem({ type: "stairs", id: newStairs.id });
      setTool("select");
      setRoomDrag(null);
      return;
    }

    if (roomDrag && tool === "ramp") {
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 16);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 12);
      const rx = clamp(Math.min(roomDrag.sx, roomDrag.cx), 0, FP_W - rw);
      const ry = clamp(Math.min(roomDrag.sy, roomDrag.cy), 0, FP_H - rh);
      const rampSharedId = `shared_ramp_${buildingId}_${(ramps.filter(r => r.label === 'Ramp').length + 1)}`;
      const newRamp: FloorRamp = {
        id: genId("rmp"), x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        rotation: 0, label: "Ramp", direction: "both",
        sharedId: rampSharedId,
        handrails: true,
        slope: "gentle",
        accessible: true,
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, [...ramps, newRamp]);
      selectFloorItem({ type: "ramp", id: newRamp.id });
      setTool("select");
      setRoomDrag(null);
      return;
    }

    if (roomDrag && tool === "elevator") {
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 14);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 14);
      const rx = clamp(Math.min(roomDrag.sx, roomDrag.cx), 0, FP_W - rw);
      const ry = clamp(Math.min(roomDrag.sy, roomDrag.cy), 0, FP_H - rh);
      // New Elevators get a useful display name immediately. Identity remains
      // a fresh sharedId and is established across floors only through the
      // explicit connection workflow. Number defaults are floor-local so the
      // same numbered candidates can be matched across Floors intentionally.
      const elevatorSystemNumber = nextElevatorSystemNumber(elevators);
      const elevatorLabel = nextElevatorName(elevators);
      const elevatorSharedId = `shared_el_${buildingId}_${genId("chain")}`;
      const newElevator: FloorElevatorItem = {
        id: genId("ev"), x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        rotation: 0, doorWidth: 6, label: elevatorLabel, systemNumber: elevatorSystemNumber,
        sharedId: elevatorSharedId,
        accessible: true, // Elevators are always accessible
      };
      updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, [...elevators, newElevator]);
      selectFloorItem({ type: "elevator", id: newElevator.id });
      setTool("select");
      setRoomDrag(null);
      return;
    }

    setRoomDrag(null);
  };

  const handleDblClick = () => {
    if (showNavOverlay && navTool !== "select" && navTool !== "pan") return;  // nav tool active
    if (drawingPath.length >= 2) {
      const newPath = { id: genId("fp"), points: drawingPath, type: "footpath", color: "#94a3b8", width: 3 };
      updFloor(rooms, [...fpaths, newPath]);
      selectFloorItem({ type: "path", id: newPath.id });
      setDP([]);
      setTool("select");
    }
  };

  // ── Item mouse handlers ──

  const onItemDown = (e: React.MouseEvent, type: string, id: string, item: any) => {
    if (testRoutePickKind) {
      if (type === "door") {
        toast.info("Choose a Room", "Normal Test Route picking uses Rooms. Doors are available under Advanced infrastructure.");
        return;
      }
      const node = indoorNodes.find((candidate) =>
        (type === "room" && candidate.roomId === id && (() => {
          const room = rooms.find((candidateRoom) => candidateRoom.id === id);
          return !!room && roomAccessDoorIds(room).some((doorId) => {
            const door = doors.find((candidateDoor) => candidateDoor.id === doorId);
            const doorNode = door ? indoorNodes.find((candidateNode) => candidateNode.doorId === door.id) : undefined;
            return !!door && isDoorEligibleForRoom(room, door, walls, indoorNodes, { rooms })
              && !!doorNode && doorNode.id !== candidate.id
              && walkableIndoorEdges.some((edge) => edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id);
          });
        })())
        || (type === "stairs" && candidate.stairId === id)
        || (type === "elevator" && candidate.elevatorId === id)
        || (type === "ramp" && candidate.rampId === id),
      );
      if (node) {
        const value = type === "room" ? `room:${buildingId}:${id}` : `node:${node.id}`;
        setTestRouteMapPick({ kind: testRoutePickKind, value });
        setTestRoutePickKind(null);
        setTestRoutePickHover(null);
        toast.success("Location selected", "Test Route endpoint set.");
      } else {
        toast.info("Location is not ready", "Choose a Room, Door, or circulation point connected to the Walking Network.");
      }
      return;
    }
    if (roomDoorLinking) {
      e.stopPropagation();
      if (type !== "door") {
        setRoomDoorHoverId(null);
        toast.info("Choose a Door on this Room", "Only a valid Door on the selected Room can be linked.");
        return;
      }
      const roomId = selected?.type === "room" ? selected.id : undefined;
      const room = roomId ? rooms.find((candidate) => candidate.id === roomId) : undefined;
      const door = doors.find((candidate) => candidate.id === id);
      const currentIds = room ? roomAccessDoorIds(room) : [];
      if (room && currentIds.includes(id)) {
        setRoomDoorHoverId(null);
        toast.info("Door already linked to this Room", "Choose another Door or remove this relationship first.");
        return;
      }
      const doorNode = door ? indoorNodes.find((node) => node.doorId === door.id) : undefined;
      if (!doorNode || doorNode.buildingId !== buildingId || doorNode.floorId !== floorId) {
        setRoomDoorHoverId(null);
        toast.info("Door must be added to Navigation", "Add this Door to the indoor Walking Network before linking it to the Room.");
        return;
      }
      if (!room || !door || !isDoorEligibleForRoom(room, door, walls, indoorNodes, { rooms })) {
        setRoomDoorHoverId(null);
        toast.warning("Door is not associated with this Room", "Choose a Door on this Room's boundary.");
        return;
      }
      const nextIds = roomDoorLinkMode === "add" ? Array.from(new Set([...currentIds, door.id])) : [door.id];
      const nextRooms = rooms.map((candidate) => candidate.id === room.id
        ? { ...candidate, accessDoorId: nextIds[0], accessDoorIds: nextIds, accessType: "door" as const }
        : candidate);
      updFloor(nextRooms, fpaths);
      clearRoomDoorLinkState();
      setTool("select");
      selectFloorItem({ type: "room", id: room.id });
      toast.success("Room Door linked", `${door.label?.trim() || "Door"} is now an entry for ${roomDisplayName(room, rooms.findIndex((candidate) => candidate.id === room.id))}.`);
      return;
    }
    // B8 Phase 1: when a nav tool is active, route to nav handling.
    const isNavToolActive = showNavOverlay && navTool !== "select" && navTool !== "pan";
    if (isNavToolActive) {
      // Nav tools own the click — physical objects are not selectable.
      return;
    }
    // When nav overlay is ON but no exclusive nav tool owns the pointer,
    // selecting a physical object switches cleanly back to the physical
    // selection domain without disabling the overlay.
    if (navMode) {
      setNavSelected(null);
      setNavMultiSelected([]);
      setNavPhysicalSelected(null);
    }
    if (isSpacePressed()) { e.stopPropagation(); startPan(e); return; }
    if (tool !== "select" && tool !== "erase") return;
    e.stopPropagation();
    if (type === "wall" && isManagedPerimeterWall(item as FloorWall)) {
      if (tool === "select" && !e.shiftKey) {
        setSelected(null);
        setMultiSelected([]);
        setShowProperties(true);
      }
      return;
    }
    if (tool === "erase") {
      deleteSelection({ type: type as FloorSelection["type"], id });
      return;
    }
    if (tool !== "select") return;
    if (type === "label") {
      const now = Date.now();
      const lastLabelClick = lastLabelClickRef.current;
      const isDoubleClick =
        e.detail >= 2 || (!!lastLabelClick && lastLabelClick.id === id && now - lastLabelClick.at <= 450);
      lastLabelClickRef.current = isDoubleClick ? null : { id, at: now };
      if (isDoubleClick) {
        beginInlineLabelEdit(item as FloorLabel, { isolate: true });
        return;
      }
    }
    const sel: FloorSelection = { type: type as any, id };
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const base = multiSelected.length > 0 ? multiSelected : selected ? [selected.id] : [];
      const next = base.includes(id) ? base.filter((value) => value !== id) : [...base, id];
      if (next.length > 1) {
        setMultiSelected(next);
        setSelected(sel);
        setShowProperties(true);
      } else if (next.length === 1) {
        setMultiSelected([]);
        selectFloorItem(selectionForId(next[0]));
      } else {
        setMultiSelected([]);
        setSelected(null);
        setShowProperties(true);
      }
      return;
    }
    // Clicking an object that is ALREADY part of the current multi-selection
    // keeps the whole group selected (Figma/outdoor-editor style): dragging it
    // moves the entire set, and the group stays selected until the user
    // intentionally clicks empty canvas, selects an unselected object without a
    // modifier, presses Escape, or switches floor/tool. Only clicking an
    // UNRELATED object collapses to single-object editing.
    if (multiSelected.includes(id)) {
      setSelected(sel);
      setShowProperties(true);
    } else {
      selectFloorItem(sel);
    }
    const pt = getPoint(e, FP_W, FP_H);
    // Suppress per-frame history pushes during the drag; ONE post-gesture entry
    // is committed on pointer release (handleSvgUp).
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    const entries = multiSelected.includes(id)
      ? multiSelected
          .map((selectedId) => selectionForId(selectedId))
          .filter((value): value is FloorSelection => !!value)
          .map((value) => ({ type: value.type, id: value.id, origin: structuredClone(getSelectionItem(value.type, value.id)) }))
          .filter((entry) => !!entry.origin)
      : [{ type: type as FloorSelection["type"], id, origin: structuredClone(item) }];
    if (entries.some((entry) => (entry.origin as any)?.locked)) {
      suppressHistoryRef.current = false;
      toast.info("Locked selection", "Unlock locked floor objects before moving them.");
      return;
    }
    if (entries.length === 1 && (type === "door" || type === "window") && item.wallId) {
      const parentWall = wallById.get(item.wallId);
      if (isUserLockedWall(parentWall)) {
        suppressHistoryRef.current = false;
        toast.info("Locked wall", "Unlock the parent wall before sliding this opening.");
        return;
      }
      openingDrag.current = { type: type as "door" | "window", id, wallId: item.wallId, origin: structuredClone(item) };
      alignmentSnapLocksRef.current = { x: null, y: null };
      setNavAlignGuides([]);
      return;
    }
    roomOverlapWarnedRef.current = false;
    alignmentSnapLocksRef.current = { x: null, y: null };
    dragging.current = { entries, sx: pt.x, sy: pt.y };
  };

  const onResizeStart = (e: React.MouseEvent, room: FloorRoom, corner: string) => {
    e.stopPropagation();
    if (room.locked) {
      toast.info("Locked room", "Unlock this room before resizing it.");
      return;
    }
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    lastValidResizeRef.current = { x: room.x, y: room.y, w: room.w, h: room.h };
    resizing.current = { id: room.id, corner, sx: e.clientX, sy: e.clientY, ox: room.x, oy: room.y, ow: room.w, oh: room.h, rotation: room.rotation ?? 0 };
  };

  const onFurnitureResizeStart = (e: React.MouseEvent, item: FloorFurniture, corner: string) => {
    e.stopPropagation();
    if (tool !== "select") return;
    if (item.locked) {
      toast.info("Locked object", "Unlock this floor object before resizing it.");
      return;
    }
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    furnitureResizing.current = { id: item.id, corner, sx: e.clientX, sy: e.clientY, origin: { ...item } };
  };

  const onCirculationResizeStart = (
    e: React.MouseEvent,
    type: "stairs" | "ramp" | "elevator",
    item: FloorStairs | FloorRamp | FloorElevatorItem,
    corner: string
  ) => {
    e.stopPropagation();
    if (tool !== "select") return;
    if (item.locked) {
      toast.info("Locked object", "Unlock this floor object before resizing it.");
      return;
    }
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    circulationResizing.current = { type, id: item.id, corner, sx: e.clientX, sy: e.clientY, origin: { ...item } };
  };

  const onRotateStart = (
    e: React.MouseEvent,
    type: "room" | "furniture" | "stairs" | "ramp" | "elevator",
    id: string,
    rect: { x: number; y: number; width: number; height: number; rotation?: number }
  ) => {
    e.stopPropagation();
    if (tool !== "select") return;
    if (isSelectionLocked({ type, id } as FloorSelection)) {
      toast.info("Locked object", "Unlock this floor object before rotating it.");
      return;
    }
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    rotating.current = {
      type,
      id,
      cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height / 2,
      originRotation: rect.rotation ?? 0,
      startAngle: rotationFromPoint(getPoint(e as any, FP_W, FP_H), rect.x + rect.width / 2, rect.y + rect.height / 2),
    };
  };

  const onItemContextMenu = (e: React.MouseEvent, type: FloorSelection["type"], id: string) => {
    if (showNavOverlay && navTool !== "select" && navTool !== "pan") return; // nav tool active
    e.preventDefault();
    e.stopPropagation();
    const item = getSelectionItem(type, id);
    if (type === "wall" && item && isManagedPerimeterWall(item as FloorWall)) {
      setContextMenu(null);
      return;
    }
    // Right-clicking a member of the current multi-selection must NOT collapse
    // the group: the whole selection stays, and group-safe actions apply.
    if (multiSelected.length > 1 && multiSelected.includes(id)) {
      setSelected(null);
      setShowProperties(true);
      setContextMenu({ x: e.clientX, y: e.clientY, type: "group" });
      return;
    }
    // Right-clicking an unrelated object may replace the selection (established
    // editor convention); right-clicking the already-selected object keeps it.
    if (!selected || selected.id !== id || selected.type !== type) {
      selectFloorItem({ type, id });
    } else {
      setShowProperties(true);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (isEditableShortcutTarget(e.target ?? document.activeElement)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        // B5 Phase 2.8/2.9: during an UNFINISHED Connect, Ctrl+Z must NOT undo
        // unrelated editor history — it removes the LAST temporary pinned CLICK
        // (the full corner+click shape, never a stray half-bend), or cancels
        // the whole unfinished connection when no bends exist yet. Neither
        // creates a history entry. Committed edges undo normally.
        if (navMode && navConnectStart) {
          const group = navConnectBendGroupsRef.current.pop() ?? 0;
          if (group > 0) {
            setNavConnectBends((prev) => prev.slice(0, Math.max(0, prev.length - group)));
          } else {
            setNavConnectStart(null);
            setNavPreview(null);
            setNavConnectBends([]);
            navConnectBendGroupsRef.current = [];
          }
          return;
        }
        applyEntry(undo());
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); applyEntry(redo()); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        // B8 Phase 1: Ctrl+A selects nav nodes when a nav object is selected,
        // or all floor objects when no nav selection exists.
        if (navSelected || navMultiSelected.length > 0) {
          if (indoorNodes.length === 0) return;
          setNavMultiSelected(indoorNodes.map((n) => n.id));
          setNavSelected({ type: "node", id: indoorNodes[indoorNodes.length - 1].id });
          setShowProperties(true);
          return;
        }
        if (allSelectableIds.length === 1) {
          const only = selectionForId(allSelectableIds[0]);
          if (only) selectFloorItem(only);
        } else {
          setSelected(null);
          setMultiSelected(allSelectableIds);
          setShowProperties(allSelectableIds.length > 0);
        }
        return;
      }
      // B5 Phase 2.1: copy / paste / duplicate — one history action each, fresh
      // IDs, and native text behavior is preserved by the editable-target guard.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        if (navMode) copyNavSelection(); else copySelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (navMode) pasteNavSelection(); else pasteSelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (navMode) duplicateNavSelection(); else duplicateSelection();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (navSelected || navMultiSelected.length > 0)) {
        e.preventDefault();
        // B5 Phase 2.6: a specifically selected bend is removed on Delete —
        // inner bends can be deleted in any order, not just reverse creation.
        if (navSelectedBend) {
          removeBendFromEdge(navSelectedBend.edgeId, navSelectedBend.index);
          return;
        }
        deleteNavSelection();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (selected || multiSelected.length > 0)) {
        e.preventDefault();
        deleteSelection(selected);
        return;
      }
      if (e.key === "Escape") {
        if (testRoutePickKind) {
          setTestRoutePickKind(null);
          setTestRouteMapPick(null);
          setTestRoutePickHover(null);
          toast.info("Map pick cancelled", "Test Route endpoint was not changed.");
          return;
        }
        if (roomDoorLinking) {
          clearRoomDoorLinkState();
          setTool("select");
          toast.info("Room Door linking cancelled", "The Room's Door was not changed.");
          return;
        }
        // Physical Room placement is a cancellable click-drag mode.  Keep its
        // Escape path explicit so the instruction pill/crosshair disappear even
        // when no drag has started yet.
        if (tool === "room") {
          setRoomDrag(null);
          setTool("select");
          return;
        }
        if (tool === "furniture") {
          setFurnitureTemplate(null);
          setTool("select");
          return;
        }
        if (tool === "stairs" || tool === "ramp" || tool === "elevator") {
          setRoomDrag(null);
          setTool("select");
          return;
        }
        if (navSelected || navMultiSelected.length > 0 || navConnectStart || navTool !== "select") {
          setNavConnectStart(null);
          setNavPreview(null);
          setNavConnectBends([]);
          navConnectBendGroupsRef.current = [];
          setNavTargetHover(null);
          setNavEraseHover(null);
          setNavNodeHover(null);
          setNavSelectedBend(null);
          setNavSegmentHover(null);
          setNavAlignGuides([]);
          navDragWallWarnedRef.current = false;
          setNavSelected(null);
          setNavMultiSelected([]);
          setRubberBand(null);
          // Temporary navigation authoring modes return to Select on cancel.
          if (navTool === "link" || navTool === "destination" || navTool === "connect" || navTool === "waypoint") {
            setNavTool("select");
          }
          return;
        }
        setWallStart(null); setWallPreview(null); setWallSnapIndicator(null); setDP([]);
        setSelected(null); setMultiSelected([]); setRubberBand(null); setContextMenu(null);
        setCalibrationDraft({ active: false, distanceInput: "" }); setMeasureDraft({});
        setRoomDrag(null);
        alignmentSnapLocksRef.current = { x: null, y: null };
        suppressHistoryRef.current = false; gestureMoved.current = false; dragging.current = null;
        if (tool === "path" || tool === "measure") setTool("select");
      }
      // ── Arrow keys: nudge the selected object(s) (1px, Shift=10px) ──
      // B5 Final: works in both Design and Navigation modes; rapid nudges
      // batch into ONE undo step (500 ms burst window). Linked navigation
      // nodes are derived geometry and stay attached to their owners.
      {
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;          if (dx || dy) {
          // B8 Phase 1: nudge nav nodes when they are selected, physical objects otherwise.
          if (navSelected || navMultiSelected.length > 0) {
            const targets = navMultiSelected.length > 0
              ? navMultiSelected
              : navSelected?.type === "node" ? [navSelected.id] : [];
            const freeIds = targets.filter((id) => {
              const n = indoorNodes.find((x) => x.id === id);
              return Boolean(n && !linkedObjectRef(n));
            });
            if (freeIds.length === 0) return;
            e.preventDefault();
            const now = Date.now();
            const isNewBurst = now - lastNudgeRef.current > 500;
            lastNudgeRef.current = now;
            if (isNewBurst) pushHistory({ ...floorUndoEntryFromFloor(floor), navNodes: indoorNodes, navEdges: indoorEdges });
            suppressHistoryRef.current = true;
            // B5 correction: nudge uses the SAME graph-group translation as the
            // mouse drag — selected free waypoints AND the bends of edges whose
            // both endpoints move translate together (no torn graph on nudges).
            const movingIds = new Set(freeIds);
            const { nodes: nudgedNodes, edges: nudgedEdges } = translateSelectedNavGraph(
              indoorNodes,
              indoorEdges,
              movingIds,
              dx,
              dy,
            );
            const clampedNodes = nudgedNodes.map((n) => movingIds.has(n.id)
              ? { ...n, x: clamp(n.x, 0, FP_W), y: clamp(n.y, 0, FP_H) }
              : n);
            const rebuiltEdges = nudgedEdges.map((edge) =>
              (movingIds.has(edge.startNodeId) || movingIds.has(edge.endNodeId))
                && isManualIndoorWalkingEdge(edge, clampedNodes)
                ? rebuildEdgeGeometryFromCurrentNodes(edge, clampedNodes)
                : edge
            );
            commitNavGraph(clampedNodes, rebuiltEdges);
            suppressHistoryRef.current = false;
            return;
          }
          const targets = multiSelected.length > 0 ? multiSelected : selected ? [selected.id] : [];
          if (targets.length === 0) return;
          const locked = targets.some((id) => {
            const sel = selectionForId(id);
            return sel ? isSelectionLocked(sel) : true;
          });
          if (locked) return;
          e.preventDefault();
          const now = Date.now();
          const isNewBurst = now - lastNudgeRef.current > 500;
          lastNudgeRef.current = now;
          if (isNewBurst) pushHistory(floorUndoEntryFromFloor(floor));
          suppressHistoryRef.current = true;
          let nextRooms = rooms, nextPaths = fpaths, nextWalls = walls, nextDoors = doors, nextWindows = windows,
              nextFurniture = furniture, nextStairs = stairs, nextElevators = elevators, nextLabels = labels, nextRamps = ramps;
          let roomNudgeBlocked = false;
          for (const id of targets) {
            const sel = selectionForId(id);
            if (!sel) continue;
            const move = <T extends { id: string; x: number; y: number }>(items: T[]) =>
              items.map((it) => it.id === id ? { ...it, x: Math.round(it.x + dx), y: Math.round(it.y + dy) } : it);
            if (sel.type === "room") {
              // B7 QA: strict keyboard collision — clamp delta to exact edge.
              const room = rooms.find((r) => r.id === id);
              if (room) {
                const otherRooms = rooms.filter((r) => r.id !== id);
                const clamped = clampNudgeToEdge(room, dx, dy, otherRooms, FP_W, FP_H);
                if (clamped.dx === 0 && clamped.dy === 0) {
                  roomNudgeBlocked = true;
                } else {
                  nextRooms = nextRooms.map((r) => r.id === id ? { ...r, x: Math.round(r.x + clamped.dx), y: Math.round(r.y + clamped.dy) } : r);
                }
              } else {
                roomNudgeBlocked = true;
              }
            } else if (sel.type === "door") nextDoors = move(nextDoors);
            else if (sel.type === "window") nextWindows = move(nextWindows);
            else if (sel.type === "furniture") nextFurniture = move(nextFurniture);
            else if (sel.type === "stairs") nextStairs = move(nextStairs);
            else if (sel.type === "ramp") nextRamps = move(nextRamps);
            else if (sel.type === "elevator") nextElevators = move(nextElevators);
            else if (sel.type === "label") nextLabels = move(nextLabels);
            else if (sel.type === "wall") nextWalls = nextWalls.map((w) => w.id === id ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy } : w);
            else if (sel.type === "path") nextPaths = nextPaths.map((p) => p.id === id ? { ...p, points: p.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })) } : p);
          }
          if (roomNudgeBlocked) {
            suppressHistoryRef.current = false;
            return;
          }
          updFloor(nextRooms, nextPaths, nextWalls, nextDoors, nextWindows, nextFurniture, nextStairs, nextElevators, nextLabels, nextRamps);
          suppressHistoryRef.current = false;
          return;
        }
      }
      if (navMode) {
        if (e.key === "v" || e.key === "V") { selectNavTool("select"); return; }
        if (e.key === "h" || e.key === "H") { selectNavTool("pan"); return; }
        if (e.key === "n" || e.key === "N") { selectNavTool("waypoint"); return; }
        if (e.key === "c" || e.key === "C") { selectNavTool("connect"); return; }
        if (e.key === "e" || e.key === "E") { selectNavTool("erase"); return; }
      }
      if (e.key === "v" || e.key === "V") switchTool("select");
      if (e.key === "w" || e.key === "W") switchTool("wall");
      if (e.key === "r" || e.key === "R") switchTool("room");
      if (e.key === "d" || e.key === "D") switchTool("door");
      if (e.key === "i" || e.key === "I") switchTool("window");
      if (e.key === "s" || e.key === "S") switchTool("stairs");
      if (e.key === "l" || e.key === "L") switchTool("elevator");
      if (e.key === "t" || e.key === "T") switchTool("text");
      if (e.key === "p" || e.key === "P") switchTool("path");
      if (e.key === "e" || e.key === "E") switchTool("erase");
      if (e.key === "f" || e.key === "F") switchTool("furniture");
      if (e.key === "h" || e.key === "H") switchTool("pan");
      if (e.key === "0") fitFloor();
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [allSelectableIds, selected, multiSelected, tool, navTool, undo, redo, applyEntry, handleSave, fitFloor, switchTool, deleteSelection, duplicateSelection, copySelection, pasteSelection, copyNavSelection, pasteNavSelection, duplicateNavSelection, selectFloorItem, selectionForId, navMode, indoorNodes, indoorEdges, deleteNavSelection, selectNavTool, navSelected, navMultiSelected, navSelectedBend, removeBendFromEdge, navConnectStart, navConnectBends, pushHistory, commitNavGraph, updFloor, isSelectionLocked, linkedObjectRef, floorUndoEntryFromFloor, rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps, FP_W, FP_H, roomDoorLinking, clearRoomDoorLinkState, toast]);

  // ── Cursor ──
  const cursor = navMode
    ? (isSpacePressed() || navTool === "pan")
      ? (panning.current ? "grabbing" : "grab")
      : navTool === "erase" ? "not-allowed"
      : navTool === "waypoint" || navTool === "destination" || navTool === "connect" || navTool === "link" ? "crosshair"
      : "default"
    : isSpacePressed()
    ? panning.current ? "grabbing" : "grab"
    : tool === "erase" ? "not-allowed"
    : tool === "pan" ? "grab"
    : panning.current ? "grabbing"
    : calibrationDraft.active || tool === "measure" || (tool === "wall" || tool === "room" || tool === "path" || tool === "door" || tool === "window" || tool === "stairs" || tool === "ramp" || tool === "elevator" || tool === "furniture" || tool === "text")
      ? "crosshair"
      : "default";

  const toolbarTools = [
    { id: "select" as SimpleTool, icon: MousePointer2, label: "Select", key: "V" },
    { id: "pan" as SimpleTool, icon: Hand, label: "Pan", key: "Space" },
  ];
  const navTools = [
    { id: "waypoint" as const, icon: Waypoints, label: "Walking Point" },
    { id: "connect" as const, icon: Link2, label: "Connect" },
    { id: "erase" as const, icon: TrashIcon, label: "Remove", hint: "Remove Walking Points or Walking Paths." },
  ];

  // ── Selected item for properties panel ──
  const selItem = selected ? (
    selected.type === "room" ? rooms.find((r) => r.id === selected.id)
    : selected.type === "wall" ? walls.find((w) => w.id === selected.id)
    : selected.type === "door" ? doors.find((d) => d.id === selected.id)
    : selected.type === "window" ? windows.find((w) => w.id === selected.id)
    : selected.type === "furniture" ? furniture.find((f) => f.id === selected.id)
    : selected.type === "stairs" ? stairs.find((s) => s.id === selected.id)
    : selected.type === "ramp" ? ramps.find((r) => r.id === selected.id)
    : selected.type === "elevator" ? elevators.find((e) => e.id === selected.id)
    : selected.type === "label" ? labels.find((l) => l.id === selected.id)
    : undefined
  ) : undefined;

  const allItemsCount = rooms.length + walls.length + doors.length + windows.length +
    furniture.length + stairs.length + ramps.length + elevators.length + labels.length + fpaths.length;
  const selectedLabel = selected?.type === "label" ? labels.find((label) => label.id === selected.id) : undefined;

  // Group bounding rectangle — the subtle outline that visually distinguishes a
  // multi-selection (like Canva / the Outdoor Map Builder) and updates live
  // while the group moves because it is derived from current item geometry.
  const multiBounds = useMemo(() => {
    if (multiSelected.length < 2) return null;
    const rects = multiSelected
      .map((id) => {
        const value = selectionForId(id);
        if (!value) return null;
        const item = getSelectionItem(value.type, value.id);
        return item ? itemBounds(value.type, item) : null;
      })
      .filter((value): value is NonNullable<typeof value> => !!value);
    if (rects.length === 0) return null;
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [multiSelected, selectionForId, getSelectionItem]);

  const startGroupTransform = useCallback((e: React.MouseEvent, kind: "resize" | "rotate", handle?: string) => {
    e.stopPropagation();
    if (!multiBounds || multiSelected.length < 2 || tool !== "select") return;
    const entries = multiSelected
      .map((id) => selectionForId(id))
      .filter((value): value is FloorSelection => !!value)
      .map((value) => ({ type: value.type, id: value.id, origin: structuredClone(getSelectionItem(value.type, value.id)) }))
      .filter((entry) => entry.origin && entry.type !== "path");
    if (entries.length < 2) return;
    if (entries.some((entry) => (entry.origin as any)?.locked)) {
      toast.info("Locked selection", "Unlock locked floor objects before transforming them.");
      return;
    }
    const center = { x: multiBounds.x + multiBounds.w / 2, y: multiBounds.y + multiBounds.h / 2 };
    const pt = getPoint(e as any, FP_W, FP_H);
    groupTransforming.current = {
      kind,
      handle,
      sx: pt.x,
      sy: pt.y,
      originBounds: multiBounds,
      entries,
      center,
      startAngle: kind === "rotate" ? rotationFromPoint(pt, center.x, center.y) : undefined,
    };
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    setSelected(null);
    setShowProperties(true);
  }, [FP_W, FP_H, getPoint, getSelectionItem, multiBounds, multiSelected, selectionForId, tool, toast]);

  // ── Empty state check ──
  const startLabelTransform = useCallback((e: React.MouseEvent, label: FloorLabel, kind: "resize" | "rotate") => {
    e.stopPropagation();
    if (tool !== "select" || label.locked || inlineLabelEdit?.id === label.id) return;
    const bounds = labelBounds(label);
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const pt = getPoint(e as any, FP_W, FP_H);
    labelTransforming.current = {
      kind,
      id: label.id,
      origin: structuredClone(label),
      originBounds: bounds,
      center,
      startDistance: kind === "resize" ? dist(pt.x, pt.y, center.x, center.y) : undefined,
      originRotation: label.rotation ?? 0,
      startAngle: kind === "rotate" ? rotationFromPoint(pt, center.x, center.y) : undefined,
    };
    suppressHistoryRef.current = true;
    gestureMoved.current = false;
    setMultiSelected([]);
    selectFloorItem({ type: "label", id: label.id });
  }, [FP_W, FP_H, getPoint, inlineLabelEdit?.id, rotationFromPoint, selectFloorItem, tool]);

  const isEmpty = allItemsCount === 0;

  // ── Context menu action handler ──
  const handleFloorContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    if (contextMenu.type === "canvas") {
      if (action === "fit-floor") fitFloor();
      if (action === "floor-settings") {
        setSelected(null);
        setMultiSelected([]);
        setShowProperties(true);
        setShowFloorSettings(true);
      }
      if (action === "toggle-grid") setSnapOn((v) => !v);
    } else if (contextMenu.type === "group") {
      if (action === "properties") {
        setSelected(null);
        setShowProperties(true);
      } else if (["bring-front", "send-back", "bring-forward", "send-backward"].includes(action)) {
        applyLayerAction(null, action as LayerAction);
      } else if (action === "toggle-visibility") {
        setSelectionState(null, { visible: selectedContextState.hidden });
      } else if (action === "toggle-lock") {
        setSelectionState(null, { locked: !selectedContextState.locked });
      } else if (action === "duplicate") {
        duplicateSelection(null);
      } else if (action === "delete") {
        deleteSelection(null);
        toast.info("Selected objects deleted", "The selected floor objects have been removed.");
      }
    } else if (action === "properties") {
      selectFloorItem({ type: contextMenu.type, id: contextMenu.id });
    } else if (contextMenu.type === "door" && action === "flip-hinge") {
      const door = doors.find((d) => d.id === contextMenu.id);
      if (door) {
        if (door.locked) toast.info("Locked door", "Unlock this door before editing it.");
        else if (effectiveDoorType(door) === "double") toast.info("Double Door", "Double doors use paired hinges; flip the swing side instead.");
        else updFloor(rooms, fpaths, walls, doors.map((d) => d.id === door.id ? { ...d, hinge: (d.hinge ?? (d.direction === "right" ? "right" : "left")) === "left" ? "right" : "left", direction: (d.hinge ?? (d.direction === "right" ? "right" : "left")) === "left" ? "right" : "left" } : d), windows);
      }
    } else if (contextMenu.type === "door" && action === "flip-swing") {
      const door = doors.find((d) => d.id === contextMenu.id);
      if (door) {
        if (door.locked) toast.info("Locked door", "Unlock this door before editing it.");
        else updFloor(rooms, fpaths, walls, doors.map((d) => d.id === door.id ? { ...d, swingSide: (d.swingSide ?? defaultSwingSideForWall(d.wallId ? wallById.get(d.wallId) : undefined)) === "a" ? "b" : "a" } : d), windows);
      }
    } else if (["bring-front", "send-back", "bring-forward", "send-backward"].includes(action)) {
      applyLayerAction({ type: contextMenu.type, id: contextMenu.id }, action as LayerAction);
    } else if (action === "toggle-visibility") {
      setSelectionState({ type: contextMenu.type, id: contextMenu.id }, { visible: selectedContextState.hidden });
    } else if (action === "toggle-lock") {
      setSelectionState({ type: contextMenu.type, id: contextMenu.id }, { locked: !selectedContextState.locked });
    } else if (action === "duplicate") {
      duplicateSelection({ type: contextMenu.type, id: contextMenu.id });
    } else if (action === "delete") {
      deleteSelection({ type: contextMenu.type, id: contextMenu.id });
      toast.info("Object deleted", "The floor object has been removed.");
    }
    setContextMenu(null);
  }, [contextMenu, fitFloor, selectFloorItem, duplicateSelection, deleteSelection, toast, applyLayerAction, setSelectionState, selectedContextState, doors, rooms, fpaths, walls, windows, updFloor, wallById]);

  // Quick navigation is authoring UI, not map geometry.  Keep the indicator in
  // the SVG for precise hit testing, but render its popover as a sibling HTML
  // overlay so later-painted Rooms/status layers cannot cover it and canvas
  // zoom never scales the content.
  const quickNavOverlay = (() => {
    if (!quickNavOpenKey || routePreview || highlightedRoute || testRouteSessionContext.session?.result) return null;
    const separator = quickNavOpenKey.indexOf(":");
    if (separator < 0) return null;
    const quickKind = quickNavOpenKey.slice(0, separator) as "stairs" | "elevator";
    if (quickKind !== "stairs" && quickKind !== "elevator") return null;
    const objectId = quickNavOpenKey.slice(separator + 1);
    const source = quickKind === "stairs"
      ? stairs.find((item) => item.id === objectId)
      : elevators.find((item) => item.id === objectId);
    const quickTargets = quickNavigationTargets.get(quickNavOpenKey) ?? [];
    if (!source || quickTargets.length === 0) return null;
    const cx = source.x + source.width / 2;
    const cy = source.y + source.height / 2;
    const indicator = rotatePoint(
      { x: source.x + source.width - 7, y: source.y + 7 },
      cx,
      cy,
      source.rotation ?? 0,
    );
    const width = quickKind === "elevator" ? 188 : 196;
    const height = Math.min(220, 44 + quickTargets.length * 31);
    const viewX = Math.max(0, Math.min(1, (pan.x + indicator.x * zoom) / FP_W));
    const viewY = Math.max(0, Math.min(1, (pan.y + indicator.y * zoom) / FP_H));
    // Keep the popover associated with the indicator.  Only flip when the
    // anchored point is genuinely near the viewport edge; flipping early
    // makes a compact popup appear detached from a Stair in ordinary layouts.
    const viewportWidth = containerRef.current?.clientWidth ?? FP_W;
    const viewportHeight = containerRef.current?.clientHeight ?? FP_H;
    const popupWidthRatio = Math.min(0.9, width / Math.max(viewportWidth, 1));
    const popupHeightRatio = Math.min(0.9, height / Math.max(viewportHeight, 1));
    const openLeft = viewX > 1 - popupWidthRatio - 0.02;
    const openAbove = viewY > 1 - popupHeightRatio / 2 - 0.03;
    const openBelow = !openAbove && viewY < popupHeightRatio / 2 + 0.03;
    const stopQuickEvent = (event: React.SyntheticEvent) => event.stopPropagation();
    return (
      <div className="pointer-events-none absolute inset-0 z-[35]" data-testid="circulation-quick-nav-overlay">
        <div
          data-testid={`circulation-quick-nav-popover-${quickKind}`}
          className="pointer-events-auto absolute z-[200]"
           style={{
             left: `${viewX * 100}%`,
             top: openAbove || openBelow
               ? `${viewY * 100}%`
               : `clamp(${Math.ceil(height / 2) + 4}px, ${viewY * 100}%, calc(100% - ${Math.ceil(height / 2) + 4}px))`,
             width: `${width}px`,
             transform: `${openLeft ? "translateX(calc(-100% - 10px))" : "translateX(10px)"} ${openAbove ? "translateY(calc(-100% - 10px))" : openBelow ? "translateY(10px)" : "translateY(-50%)"}`,
           }}
          onMouseEnter={cancelQuickNavClose}
          onMouseLeave={scheduleQuickNavClose}
          onMouseDown={stopQuickEvent}
          onClick={stopQuickEvent}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeQuickNav();
            }
          }}
        >
          <div
            role="dialog"
            aria-label="Connected Floors"
            style={{ width: `${width}px`, transform: "scale(1)", transformOrigin: "top left" }}
            className="rounded-lg border border-border/80 bg-card/95 p-1.5 text-foreground shadow-lg backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-reduce:animate-none"
          >
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Connected Floors</span>
              <span className="text-[8px] text-muted-foreground">{quickKind === "stairs" ? "Stair" : "Elevator"}</span>
            </div>
            <div className="max-h-[184px] space-y-0.5 overflow-y-auto">
              {quickTargets.map((target) => {
                const directionGlyph = quickKind === "stairs" ? (target.relation === "above" ? "↑" : "↓") : "•";
                const isCurrent = quickKind === "elevator" && target.isCurrent;
                const statusText = quickKind === "stairs" && !target.usable
                  ? "Not usable from this floor"
                  : "Open floor";
                return (
                  <button
                    key={`${target.floorId}:${target.objectId}`}
                    type="button"
                    disabled={!target.usable || !!isCurrent}
                    aria-label={`${target.floorLabel} · ${target.objectLabel}${!target.usable ? ", not usable from this floor" : ""}`}
                    className={cn(
                      "flex w-full items-center gap-1 rounded-md border px-1 py-0.5 text-left transition-colors",
                      target.usable && !isCurrent
                        ? "border-border/70 bg-background/60 hover:border-violet-400/70 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                        : "cursor-not-allowed border-border/40 bg-muted/40 text-muted-foreground opacity-60",
                    )}
                    onClick={() => {
                      if (!target.usable || isCurrent) return;
                      closeQuickNav();
                      requestFloorSwitch(target.floorId, { type: quickKind, id: target.objectId });
                    }}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground" aria-hidden="true">{directionGlyph}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground">{target.floorLabel} · {target.objectLabel}</span>
                        {isCurrent && <span className="shrink-0 text-[8px] font-extrabold uppercase tracking-wide text-primary">CURRENT</span>}
                      </span>
                      {!isCurrent && <span className="block truncate text-[8px] text-muted-foreground">{statusText}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div className="relative flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      {/* ═══════════════════════════════════════════════════════════════════
          TOP TOOLBAR
          ═══════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="shrink-0 bg-card border-b border-border"
      >
        {/* B5 Phase 6.9: de-cramped single header row with reserved left,
            center, and right zones so context, tools, and utilities never
            compete for the same horizontal space. */}
        <div className="relative grid h-16 min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_minmax(200px,max-content)_minmax(0,1fr)] items-center gap-x-1.5 overflow-hidden px-1.5 sm:gap-x-3 sm:px-3" data-testid="floor-editor-header">
          <div className="flex h-full min-w-0 items-center gap-x-1.5 overflow-hidden overscroll-contain sm:gap-x-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 min-w-[84px] shrink max-w-[220px] overflow-hidden sm:min-w-[120px] sm:max-w-[280px]">
            <button onClick={handleBack} className="flex items-center gap-1 h-7 px-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-[11px] font-semibold shrink-0 group">
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline max-w-[120px] truncate">{campus.name}</span>
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <span className="text-[11px] text-muted-foreground font-semibold shrink-0">{building.code}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <span className="text-xs font-extrabold text-foreground truncate max-w-[120px]">{floor.label}</span>
            <span className="text-[9px] text-muted-foreground/50 ml-1 font-medium shrink-0">
              ({allItemsCount} item{allItemsCount !== 1 ? "s" : ""})
            </span>
          </div>

          {/* Floor tabs — right-clicking a tab opens the shared floor actions menu for THAT floor.
              B5 Phase 3.1.4: the tab LIST lives in a BOUNDED flex-1 scroll region so many floors
              never push the pinned Add Floor (+) / Floor actions (…) controls off-screen; the
              active tab auto-scrolls into view on creation/switch. */}
          <div className="relative flex items-center gap-1 min-w-[108px] flex-[1_1_160px] max-w-[260px] sm:gap-1.5 sm:min-w-[150px] sm:flex-[1_1_200px] sm:max-w-[320px] xl:flex-none xl:w-[300px]" data-testid="floor-tab-bar">
            <button
              type="button"
              onClick={() => previousFloor && requestFloorSwitch(previousFloor.id)}
              disabled={!previousFloor}
              title={previousFloor ? `Previous floor: ${previousFloor.label}` : "No previous floor"}
              aria-label="Previous floor"
              className="shrink-0 h-6 w-6 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground flex items-center justify-center transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              ref={floorSelectorButtonRef}
              onClick={() => { setFloorSelectorOpen((v) => !v); setFloorMenu(null); }}
              aria-expanded={floorSelectorOpen}
              aria-label="Select floor"
              title={floor.label}
              className="min-w-0 flex-1 h-7 px-2.5 rounded-md border border-border bg-card text-[10px] font-extrabold text-foreground hover:bg-muted transition-all flex items-center justify-between gap-1.5"
            >
              <span className="truncate">{floor.label}</span>
              <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", floorSelectorOpen && "rotate-180")} />
            </button>
            <button
              type="button"
              onClick={() => nextFloor && requestFloorSwitch(nextFloor.id)}
              disabled={!nextFloor}
              title={nextFloor ? `Next floor: ${nextFloor.label}` : "No next floor"}
              aria-label="Next floor"
              className="shrink-0 h-6 w-6 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground flex items-center justify-center transition-all"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={addFloorFromEditor}
              title="Add Floor"
              aria-label="Add Floor"
              className="shrink-0 h-6 w-6 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                ref={floorActionsButtonRef}
                onClick={openFloorActionsAtButton}
                title="Floor actions"
                aria-label="Floor actions"
                className={cn(
                  "h-6 w-6 rounded-md border border-border flex items-center justify-center transition-all",
                  floorMenu ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
            {floorSelectorOpen && (
              <div
                ref={floorSelectorPopoverRef}
                data-testid="floor-selector-popover"
                className="fixed z-50 rounded-lg border border-border bg-card shadow-xl overflow-hidden"
                style={{
                  left: floorSelectorPosition?.left ?? 12,
                  top: floorSelectorPosition?.top ?? 48,
                  width: floorSelectorPosition?.width ?? 280,
                }}
              >
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Floors</div>
                </div>
                {buildingFloors.length > 15 && (
                  <label className="flex items-center gap-2 h-9 px-2 border-b border-border">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      value={floorSelectorSearch}
                      onChange={(e) => setFloorSelectorSearch(e.target.value)}
                      placeholder="Search floors"
                      className="min-w-0 flex-1 bg-transparent outline-none text-[11px] font-semibold text-foreground placeholder:text-muted-foreground"
                    />
                  </label>
                )}
                <div
                  className="overflow-y-auto py-1"
                  style={{ maxHeight: floorSelectorPosition ? Math.max(96, floorSelectorPosition.maxHeight - (buildingFloors.length > 15 ? 78 : 37)) : 288 }}
                  role="listbox"
                  aria-label="Floors"
                >
                  {filteredFloorOptions.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="option"
                      aria-selected={f.id === floorId}
                      data-testid="floor-selector-option"
                      onClick={() => requestFloorSwitch(f.id)}
                      onContextMenu={(e) => {
                        // B5 Phase 3.2: right-clicking a floor in the selector opens
                        // the SHARED floor actions menu for THAT floor — preserving
                        // the old tab right-click capability in the dropdown design
                        // (the actions menu already targets floorMenu.floorId).
                        e.preventDefault();
                        setFloorSelectorOpen(false);
                        setFloorMenu({ floorId: f.id, x: e.clientX, y: e.clientY });
                      }}
                      className={cn(
                        "w-full h-8 px-3 text-left text-[11px] font-bold flex items-center justify-between gap-3 hover:bg-muted transition-colors",
                        f.id === floorId ? "text-primary bg-primary/10" : "text-foreground"
                      )}
                      title={f.label}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", f.id === floorId ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{f.label}</span>
                      </span>
                      <span className="shrink-0 text-[9px] font-mono text-muted-foreground">#{f.number}</span>
                    </button>
                  ))}
                  {filteredFloorOptions.length === 0 && (
                    <div className="px-3 py-4 text-[11px] font-semibold text-muted-foreground">No floors found</div>
                  )}
                </div>
              </div>
            )}
          </div>

          </div>

          {/* B8 Phase 1: Navigation toggle — single button to show/hide the nav overlay */}
          {/* B8 Phase 1: Design tools always visible. Nav tools shown when overlay is ON. */}
          <div className="hidden">
            {/* Design tools — always available */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/30">
              {toolbarTools.map((t) => {
                const Icon = t.icon;
                const isActive = tool === t.id;
                return (
                  <button key={t.id} onClick={() => switchTool(t.id)}
                    title={`${t.label} (${t.key})`}
                    className={cn("flex items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold transition-all",
                      isActive ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                    <Icon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
            {/* Nav tools — shown when overlay is ON */}
            {showNavOverlay && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/30 ml-1" data-testid="floor-nav-toolbar-legacy">
              {navTools.map((t) => {
                const Icon = t.icon;
                const isActive = navTool === t.id;
                return (
                  <button key={t.id} onClick={() => selectNavTool(t.id)}
                    title={t.label}
                    aria-label={t.label}
                    className={cn("flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                      isActive ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                    <Icon className="h-3 w-3" />
                    <span className="hidden md:inline">{t.label}</span>
                  </button>
                );
              })}
              <div className="w-px h-4 bg-border mx-0.5" />
              <button
                onClick={() => {
                  if (testNavOpen) {
                    cancelElevatorTransition();
                    setTestNavOpen(false);
                    testRouteSessionContext.setSession(null);
                    setTestRouteCompact(false);
                    setHighlightedRoute(null);
                    setTestRoutePickKind(null);
                    setTestRouteMapPick(null);
                    setTestRoutePickHover(null);
                  } else {
                    setNavTool("select");
                    setRoomDrag(null);
                    setTestNavOpen(true);
                  }
                }}
                className={cn("flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                  testNavOpen ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                title="Test navigation routes on this floor"
              >
                <Route className="h-3 w-3" />
                <span className="hidden md:inline">Test Route</span>
              </button>
            </div>
            )}
          </div>

          <div className="relative z-20 flex h-full min-w-0 items-center justify-center overflow-hidden">
          {/* Stable interaction rail. Physical creation stays in Object Library;
              navigation actions remain visible and clickable in both states. */}
            <div className="mx-auto flex min-w-0 max-w-full items-center justify-center">
            <div className="flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden whitespace-nowrap rounded-xl border border-border/70 bg-muted/40 px-1.5 py-1 shadow-sm sm:gap-1 sm:px-2 sm:py-1.5 lg:px-2.5">
              <div className="flex items-center gap-0.5 shrink-0">
                {toolbarTools.map((t) => {
                    const Icon = t.icon;
                    const isActive = tool === t.id;
                    return (
                      <ToolbarTooltip key={t.id} tool={t.id} isActive={isActive}
                      hint={t.id === "select" ? "Select, move, resize, and edit floor items." : t.id === "pan" ? "Move around the floor canvas without changing objects." : t.id === "path" ? "Draw a floor path through the interior plan." : undefined}>
                        <button type="button" onClick={() => switchTool(t.id)}
                          aria-label={`${t.label}${t.key ? ` (${t.key})` : ""}`}
                          className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold transition-all sm:h-[30px] sm:w-[30px] lg:h-[34px] lg:w-[34px]",
                            isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                          <Icon className="h-[15px] w-[15px]" />
                        </button>
                      </ToolbarTooltip>
                    );
                })}
              </div>
              <div className="mx-1.5 h-5 w-px shrink-0 bg-border/70" />
              <div className="flex items-center gap-0.5 shrink-0" data-testid="floor-nav-toolbar">
                {navTools.map((t) => {
                  const Icon = t.icon;
                  const isActive = showNavOverlay && navTool === t.id;
                  return (
                    <ToolbarTooltip key={t.id} tool={t.id === "link" ? "linkLocation" : t.id} isActive={isActive}
                      label={t.id === "erase" ? "Remove" : undefined}
                      hint={t.id === "waypoint" ? "Place points along hallways or open circulation areas." : t.id === "connect" ? "Connect the points to define where people can walk." : t.id === "link" ? "Link Rooms, Doors, Stairs, Elevators, and Ramps to the walking network." : "Remove Walking Points or Walking Paths."}>
                      <button type="button" onClick={() => selectNavTool(t.id)}
                        aria-label={t.label}
                      className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold transition-all sm:h-[30px] sm:w-[30px] lg:h-[34px] lg:w-[34px]",
                          isActive ? "bg-primary text-primary-foreground shadow-sm" : !showNavOverlay ? "text-muted-foreground/60 hover:bg-muted hover:text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                        <Icon className="h-[15px] w-[15px]" />
                      </button>
                    </ToolbarTooltip>
                  );
                })}
                <ToolbarTooltip tool="navigationVisibility" isActive={showNavOverlay}
                  label={showNavOverlay ? "Hide Navigation" : "Show Navigation"}
                  hint={showNavOverlay ? "Hide the indoor walking network." : "Show and edit the indoor walking network."}>
                  <button type="button" onClick={toggleNavigation}
                    aria-label={showNavOverlay ? "Hide Navigation" : "Show Navigation"}
                    aria-pressed={showNavOverlay}
                    className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold transition-all sm:h-[30px] sm:w-[30px] lg:h-[34px] lg:w-[34px]",
                      showNavOverlay ? "bg-green-500/10 text-green-700 dark:text-green-400" : "text-muted-foreground/60 hover:bg-muted hover:text-foreground")}>
                    {showNavOverlay ? <EyeOff className="h-[15px] w-[15px]" /> : <Eye className="h-[15px] w-[15px]" />}
                  </button>
                </ToolbarTooltip>
              </div>
              <div className="mx-1.5 h-5 w-px shrink-0 bg-border/70" />
              <ToolbarTooltip tool="testRoute" isActive={testNavOpen} hint="Choose a start and destination to verify the route.">
                <button type="button" onClick={() => {
                  if (testNavOpen) {
                    cancelElevatorTransition();
                    setTestNavOpen(false);
                    testRouteSessionContext.setSession(null);
                    setTestRouteCompact(false);
                    setHighlightedRoute(null);
                    setTestRoutePickKind(null);
                    setTestRouteMapPick(null);
                    setTestRoutePickHover(null);
                  } else {
                    setNavTool("select");
                    setRoomDrag(null);
                    setTestNavOpen(true);
                  }
                }}
                  aria-label="Test Route"
                  className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold transition-all sm:h-[30px] sm:w-[30px] lg:h-[34px] lg:w-[34px]",
                    testNavOpen ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : !showNavOverlay ? "text-muted-foreground/60 hover:bg-muted hover:text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <Route className="h-[15px] w-[15px]" />
                </button>
              </ToolbarTooltip>
            </div>
          </div>

          </div>

          <div className="flex h-full min-w-0 max-w-full items-center justify-end gap-0.5 overflow-hidden pr-0.5 sm:gap-1 sm:pr-1">
          {selectedLabel && multiSelected.length <= 1 && !inlineLabelEdit && (
            <>
              <div className="hidden sm:block w-px h-5 bg-border mx-1" />
              <div
                className="hidden xl:flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5 shrink-0"
                data-testid="selected-label-font-controls"
              >
                <button
                  type="button"
                  aria-label="Decrease selected text size"
                  onClick={() => updateLabel(selectedLabel.id, { fontSize: Math.max(6, selectedLabel.fontSize - 1) })}
                  className="h-6 px-2 rounded-md text-[10px] font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                >
                  A-
                </button>
                <input
                  aria-label="Selected text font size"
                  type="number"
                  min={6}
                  max={24}
                  value={selectedLabel.fontSize}
                  onChange={(event) => updateLabel(selectedLabel.id, { fontSize: Math.max(6, Math.min(24, parseInt(event.target.value) || 12)) })}
                  className="h-6 w-11 rounded-md border border-border bg-input-background px-1 text-center text-[10px] font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  aria-label="Increase selected text size"
                  onClick={() => updateLabel(selectedLabel.id, { fontSize: Math.min(24, selectedLabel.fontSize + 1) })}
                  className="h-6 px-2 rounded-md text-[10px] font-extrabold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                >
                  A+
                </button>
              </div>
            </>
          )}

          <div className="hidden sm:block w-px h-5 bg-border mx-1" />

          {/* Undo/Redo — grouped so the pair never splits across wrapped rows */}
          <div className="flex items-center gap-0.5 shrink-0">
            <ToolbarTooltip tool="undo">
            <button onClick={() => applyEntry(undo())} disabled={!canUndo} aria-label="Undo"
              className={cn("flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-md transition-all",
                canUndo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed")}>
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            </ToolbarTooltip>
            <ToolbarTooltip tool="redo">
            <button onClick={() => applyEntry(redo())} disabled={!canRedo} aria-label="Redo"
              className={cn("flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-md transition-all",
                canRedo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed")}>
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            </ToolbarTooltip>
          </div>

          <div className="hidden lg:block flex-1 min-w-8" />
          <div className="hidden sm:block w-px h-5 bg-border mx-1" />

          {/* Snap toggle */}
          <ToolbarTooltip tool="gridSnap" isActive={snapOn}
            label="Grid Snap"
            hint={snapOn ? "Objects snap to the floor grid while you place or move them." : "Grid snapping is off. Objects can move freely."}>
          <button onClick={() => setSnapOn((v) => !v)} onMouseEnter={(e) => e.currentTarget.removeAttribute("title")}
            title={snapOn ? "Snap to grid: ON — click to disable" : "Snap to grid: OFF — click to enable"}
            aria-pressed={snapOn}
            aria-label="Toggle snap to grid"
            className={cn("flex items-center justify-center h-6 px-1 sm:h-7 sm:px-2 rounded-md text-[10px] font-bold transition-all border shrink-0",
              snapOn ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}>
            <Grid3X3 className="h-3 w-3" />
            <span className="hidden xl:inline ml-1">Snap</span>
          </button>
          </ToolbarTooltip>


          <ToolbarTooltip tool="resetView" label="Fit View" hint="Fit the current floor content inside the visible canvas.">
          <button onClick={fitFloor}
            aria-label="Fit Floor"
            className="flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          </ToolbarTooltip>

          {/* B5 Phase 3.1: compact one-line Issues control — whitespace-nowrap
              keeps icon + label + count chip on a single line at desktop widths
              (the old "Issues 0" text could wrap vertically). */}
          <ToolbarTooltip tool="canvasSettings" label="Issues" hint="Review floor items that need attention before publishing.">
          <button onClick={() => setShowIssues(true)}
            aria-label={`Issues: ${totalIssues}`}
            data-testid="issues-toolbar"
            className={cn("flex items-center gap-1 h-6 px-1 sm:h-7 sm:px-2.5 rounded-md text-[10px] font-extrabold whitespace-nowrap shrink-0 transition-all border",
              hasAnyIssues ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border text-emerald-600 hover:bg-muted")}>
            {hasAnyIssues ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            <span className="hidden xl:inline">Issues</span>
            <span className={cn("min-w-[18px] h-4 px-1 rounded-full text-[9px] flex items-center justify-center",
              hasAnyIssues ? "bg-destructive/15 text-destructive" : "bg-emerald-500/10 text-emerald-700")}>
              {totalIssues}
            </span>
          </button>
          </ToolbarTooltip>

          <ToolbarTooltip tool="keyboardShortcuts">
          <button onClick={() => setShowShortcuts(true)}
            aria-label="Keyboard shortcuts"
            className="hidden lg:flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
          </ToolbarTooltip>

          {/* Properties toggle */}
          <ToolbarTooltip tool="canvasSettings" label="Properties" hint="Show or hide properties for the selected floor item.">
          <button onClick={() => setShowProperties((v) => !v)}
            aria-pressed={showProperties}
            aria-label="Toggle properties panel"
            className={cn("flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded-md transition-all",
              showProperties ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
            >
            {showProperties ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </button>
          </ToolbarTooltip>

          {/* Floor Settings dialog */}
          <ToolbarTooltip tool="canvasSettings" label="Floor Settings" hint="Adjust floor display and editing preferences.">
          <button onClick={() => setShowFloorSettings(true)}
            aria-label="Floor Settings"
            className="hidden xl:flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          </ToolbarTooltip>

          {/* Save / Publish — grouped so the pair never splits across wrapped rows */}
          <div className="flex items-center gap-1 shrink-0 sm:gap-2">
            <ToolbarTooltip tool="save" label="Save" hint={isFloorDirty ? "Save your current floor draft changes." : "Your current floor draft is saved."}>
            <button onClick={handleSave} disabled={saving || !isFloorDirty}
              className={cn("flex items-center justify-center gap-1 h-6 w-6 px-0 sm:h-7 sm:w-auto sm:px-2.5 rounded-md text-[10px] font-extrabold transition-all border shadow-sm",
                isFloorDirty ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90" : "bg-muted/40 text-muted-foreground border-border cursor-not-allowed")}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> :
                saved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
              <span className="hidden xl:inline">{saving ? "Saving..." : saved ? "Saved" : "Save"}</span>
            </button>
            </ToolbarTooltip>
            <ToolbarTooltip tool="publish" label={onPreviewStudent ? "Preview Student View" : "Publish"} hint={onPreviewStudent ? "Review the saved campus as students will see it before publishing." : isFloorDirty ? "Save your latest changes before publishing." : "Publish the saved floor so it becomes available to users."}>
            <button
              onClick={handlePublish}
              disabled={!publishingEnabled || saving || (isFloorDirty && !onPreviewStudent)}
              className={cn("flex items-center justify-center gap-1 h-6 w-6 px-0 sm:h-7 sm:w-auto sm:px-2.5 rounded-md text-[10px] font-extrabold transition-all border",
                !publishingEnabled || (isFloorDirty && !onPreviewStudent) || saving ? "border-border text-muted-foreground/60 cursor-not-allowed" : "border-emerald-500/30 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/15")}
            >
              <Globe2 className="h-3 w-3" />
              <span className="hidden xl:inline">Publish</span>
            </button>
            </ToolbarTooltip>
          </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN BODY
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="relative flex flex-1 overflow-hidden min-h-0">
        {/* ── LEFT SIDEBAR ── */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-52 border-r border-border bg-card flex flex-col overflow-hidden shrink-0"
        >
          {/* B5 Phase 2.2: subtle keyed transition for the sidebar content on
              Design ↔ Navigation switch — never touches the canvas camera. */}
          <AnimatePresence mode="wait">
          <motion.div
            key="object-library"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
          {false ? (
            <>
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Navigation</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Build the indoor walking network</p>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-2 space-y-3">
                <div>
                  <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Build Walking Network</span>
                  <div className="grid grid-cols-1 gap-1 mt-1">
                    <button
                      data-testid="nav-library-waypoint"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", "waypoint");
                        e.dataTransfer.effectAllowed = "copy";
                        navLibraryDragRef.current = "waypoint";
                      }}
                      onDragEnd={() => { navLibraryDragRef.current = null; setNavDragPreview(null); setNavDragBlocked(null); setNavTargetHover(null); }}
                      onClick={() => selectNavTool("waypoint")}
                      className="h-12 rounded-lg border text-left px-2 py-1.5 transition-all hover:bg-muted/60 text-foreground"
                      title="Place points along hallways and intersections, then connect them to build the walking network."
                    >
                      <span className="flex items-center gap-2">
                        <Waypoints className="h-4 w-4 shrink-0" />
                        <span className="text-[10px] font-bold block truncate">Walking Point</span>
                      </span>
                    </button>
                  </div>
                  <p className="px-1 mt-1.5 text-[9px] leading-relaxed text-muted-foreground/70">Place points along hallways, then connect them.</p>
                </div>

              </div>
            </>
          ) : (
            <>
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Object Library</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Build indoor floor content</p>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-2 space-y-3">
            <div>
              <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Build</span>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {[
                  { id: "wall" as SimpleTool, label: "Wall", icon: SeparatorHorizontal },
                  { id: "door" as SimpleTool, label: "Door", icon: DoorOpen },
                  { id: "window" as SimpleTool, label: "Window", icon: LandPlot },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} onClick={() => { switchTool(item.id); setFurnitureTemplate(null); }}
                      className={cn("h-14 rounded-lg border text-left px-2 py-1.5 transition-all",
                        tool === item.id ? "border-primary bg-primary/8 text-primary" : "border-border hover:bg-muted/60 text-foreground")}
                      title={item.label}>
                      <Icon className="h-4 w-4 mb-1" />
                      <span className="text-[10px] font-bold block truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Rooms</span>
              <div className="mt-1">
                <button
                  data-testid="room-library-tool"
                  onClick={() => { switchTool("room"); setSidebarCategory("classroom"); setFurnitureTemplate(null); }}
                  className={cn("w-full h-14 rounded-lg border text-left px-2 py-1.5 transition-all",
                    tool === "room" ? "border-primary bg-primary/8 text-primary" : "border-border hover:bg-muted/60 text-foreground")}
                  title="Room"
                >
                  <span className="flex items-center gap-2">
                    <SquareIcon className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] font-bold truncate">+ Room</span>
                  </span>
                  <span className="text-[9px] text-muted-foreground block mt-1">Place any room footprint</span>
                </button>
              </div>
            </div>

            <div>
              <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Circulation</span>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {[
                  { id: "stairs" as SimpleTool, label: "Stairs", icon: MoveVertical },
                  { id: "elevator" as SimpleTool, label: "Elevator", icon: Binary },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} onClick={() => { switchTool(item.id); setFurnitureTemplate(null); }}
                      className={cn("h-12 rounded-lg border px-1.5 py-1.5 transition-all text-center",
                        tool === item.id ? "border-primary bg-primary/8 text-primary" : "border-border hover:bg-muted/60 text-foreground")}
                      title={item.label}>
                      <Icon className="h-4 w-4 mx-auto mb-0.5" />
                      <span className="text-[9px] font-bold block truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Furniture</span>
              <div className="space-y-1 mt-1">
                {FURNITURE_CATEGORIES.map((cat) => (
                  <div key={cat.id} className="rounded-lg border border-border overflow-hidden">
                    <button onClick={() => setSidebarCategory(sidebarCategory === cat.id ? null : cat.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 transition-colors text-left">
                      <Sofa className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex-1">{cat.label}</span>
                      <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", sidebarCategory === cat.id && "rotate-90")} />
                    </button>
                    {sidebarCategory === cat.id && (
                      <div className="grid grid-cols-2 gap-1 p-1 border-t border-border/60">
                        {cat.items.map((item) => (
                          <button key={item.type} onClick={() => { setFurnitureTemplate(item); switchTool("furniture"); }}
                            className={cn("h-12 rounded-md px-1.5 py-1 text-left transition-colors",
                              furnitureTemplate?.type === item.type ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground")}
                            title={`${item.name} ${item.width}x${item.height}`}>
                            <FurniturePreview type={item.type} color={item.color} />
                            <span className="text-[9px] font-bold block truncate">{item.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Annotate</span>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {[
                  { id: "text" as SimpleTool, label: "Text", icon: Text },
                  { id: "path" as SimpleTool, label: "Path", icon: GitBranchIcon },
                  ...(ADVANCED_FLOOR_REFERENCE_ENABLED ? [{ id: "measure" as SimpleTool, label: "Measure", icon: Text }] : []),
                ].map((item) => {
                  const Icon = item.icon;
                  const disabled = item.id === "measure" && !floor.calibration;
                  return (
                    <button key={item.id} onClick={() => { switchTool(item.id); setFurnitureTemplate(null); }}
                      disabled={disabled}
                      className={cn("h-12 rounded-lg border px-2 py-1.5 transition-all text-left",
                        tool === item.id ? "border-primary bg-primary/8 text-primary" : "border-border hover:bg-muted/60 text-foreground",
                        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent")}
                      title={disabled ? "Calibrate floor scale first." : item.label}>
                      <Icon className="h-4 w-4 mb-0.5" />
                      <span className="text-[10px] font-bold block truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
              </div>
            </>
          )}
          </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* ── CANVAS ── */}
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 overflow-hidden relative"
          style={{ background: "#b0ada8" }}
          >
          {testRoutePickKind && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 rounded-full border border-violet-300 bg-card/95 px-3 py-1.5 text-[10px] font-bold text-violet-700 shadow-lg pointer-events-none">
              {testRoutePickKind === "start" ? "Select a starting location · Esc to cancel" : "Select a destination · Esc to cancel"}
            </div>
          )}
          <div className="contents"
          onWheel={handleWheel}
          onDragOver={(e) => handleNavLibraryDragOver(e)}
          onDrop={(e) => handleNavLibraryDrop(e)}
          onDragLeave={(e) => {
            if (e.target === e.currentTarget) { setNavDragPreview(null); setNavDragBlocked(null); setNavTargetHover(null); }
          }}
          onMouseDown={(e) => {
            if (roomDoorLinking) return;
            if (showNavOverlay && navTool !== "select" && navTool !== "pan") return;
            const target = e.target as Element;
            const isCanvasBackground = e.target === containerRef.current
              || target?.dataset?.bg === "true"
              || target?.closest?.('[data-bg="true"]') != null;
            if (!isCanvasBackground || tool !== "select" || e.shiftKey) return;
            if (showNavOverlay && navTool === "select") {
              setNavSelected(null);
              setNavMultiSelected([]);
              setNavPhysicalSelected(null);
              setNavSelectedBend(null);
              setNavSegmentHover(null);
              setShowProperties(false);
            }
            setSelected(null);
            setMultiSelected([]);
            if (!(showNavOverlay && navTool === "select")) setShowProperties(true);
          }}
          >
          <svg ref={svgRef}
            viewBox={`0 0 ${FP_W} ${FP_H}`}
            className="w-full h-full"
            style={{ cursor: roomDoorLinking ? "crosshair" : cursor, userSelect: "none" }}
            onMouseDownCapture={handleSvgDownCapture}
            onMouseDown={handleSvgDown}
            onMouseMove={handleSvgMove}
            onMouseUp={handleSvgUp}
            onMouseLeave={handleSvgUp}
            onDoubleClick={handleDblClick}
            onContextMenu={(e) => {
              e.preventDefault();
              if (navMode) {
                // Navigation right-click cancels an incomplete connection
                // (including any temporary pinned bends).
                setNavConnectStart(null);
                setNavPreview(null);
                setNavConnectBends([]);
                navConnectBendGroupsRef.current = [];
                setNavTargetHover(null);
                setContextMenu(null);
                return;
              }
              const target = e.target as SVGElement;
              const isBg = target === svgRef.current || target.dataset.bg === "true" || target.closest?.('[data-bg="true"]') != null;
              if (isBg) setContextMenu({ x: e.clientX, y: e.clientY, type: "canvas" });
              else if (contextMenu) setContextMenu(null);
            }}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              <defs>
                <clipPath id={floorClipId}>
                  <rect x={0} y={0} width={FP_W} height={FP_H} />
                </clipPath>
              </defs>
              {/* Decorative background layer: the outer rect, grid lines and
                  floor-area rects are all inside a single data-bg group so a click
                  on ANY empty canvas space (not just the outer margin) clears the
                  current selection. Item <g>s are siblings of this group. */}
              <g data-bg="true">
                <rect data-testid="floor-canvas-boundary" data-bg="true" x={0} y={0} width={FP_W} height={FP_H} rx={2} fill={floor.backgroundColor ?? "#e8e1d7"} stroke="#5f5a52" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {ADVANCED_FLOOR_REFERENCE_ENABLED && floorBackground && floorBackground.visible !== false && (
                  <g
                    data-testid="floor-plan-background-layer"
                    data-bg="true"
                    clipPath={`url(#${floorClipId})`}
                    className="pointer-events-none"
                    opacity={floorBackground.opacity}
                    transform={`translate(${floorBackground.x}, ${floorBackground.y}) rotate(${floorBackground.rotation}, ${floorBackground.width / 2}, ${floorBackground.height / 2})`}
                  >
                    {backgroundPreviewUrl ? (
                      <image
                        data-testid="floor-plan-background-image"
                        href={backgroundPreviewUrl}
                        x={0}
                        y={0}
                        width={floorBackground.width}
                        height={floorBackground.height}
                        preserveAspectRatio="none"
                      />
                    ) : (
                      <rect
                        data-testid="floor-plan-background-placeholder"
                        x={0}
                        y={0}
                        width={floorBackground.width}
                        height={floorBackground.height}
                        fill="rgba(14,42,110,0.08)"
                        stroke="rgba(14,42,110,0.22)"
                        strokeDasharray="6 4"
                      />
                    )}
                  </g>
                )}
                {/* Grid lines — visibility follows the persisted floor appearance preference */}
                {floor.showGrid !== false && (
                  <>
                    {Array.from({ length: Math.ceil(FP_W / floorGridSize) + 1 }, (_, i) => (
                      <line key={`gv${i}`} x1={i * floorGridSize} y1={0} x2={i * floorGridSize} y2={FP_H} stroke="rgba(55,48,40,0.08)" strokeWidth={0.5} />
                    ))}
                    {Array.from({ length: Math.ceil(FP_H / floorGridSize) + 1 }, (_, i) => (
                      <line key={`gh${i}`} x1={0} y1={i * floorGridSize} x2={FP_W} y2={i * floorGridSize} stroke="rgba(55,48,40,0.08)" strokeWidth={0.5} />
                    ))}
                  </>
                )}
              </g>

              {!highlightedRoute?.routeNodeIds?.length && highlightedRoute && (highlightedRoute.waypoints.length > 0 || (highlightedRoute.endpointMarkers?.length ?? 0) > 0 || (highlightedRoute.transitionMarkers?.length ?? 0) > 0) && (
                <>
                <g data-testid="floor-test-route-preview" className="pointer-events-none">
                  <polyline
                    points={highlightedRoute.waypoints.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none" stroke={highlightedRoute.color} strokeWidth={7}
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.2}
                  />
                  <polyline
                    points={highlightedRoute.waypoints.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none" stroke={highlightedRoute.color} strokeWidth={3}
                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray="12 8"
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.2s" repeatCount="indefinite" />
                  </polyline>
                  {floorRouteArrowPoints(highlightedRoute.waypoints).map((marker, index) => (
                    <path key={`floor-route-arrow-${index}`} d="M -5 -4 L 5 0 L -5 4 Z"
                      transform={`translate(${marker.x} ${marker.y}) rotate(${marker.angle})`}
                      fill={highlightedRoute.color} stroke="white" strokeWidth={1} />
                  ))}
                  {(highlightedRoute.semanticEndpoints ?? []).map((endpoint) => (
                    <rect key={`semantic-route-${endpoint.kind}`} x={endpoint.x - 4} y={endpoint.y - 4} width={endpoint.width + 8} height={endpoint.height + 8}
                      rx={4} fill="none" stroke={endpoint.kind === "start" ? "#16a34a" : "#7c3aed"} strokeWidth={2} strokeDasharray="5 3" opacity={0.85} />
                  ))}
                </g>
                </>
              )}

              {isEmpty && (
                <g data-testid="floor-empty-state" transform={`translate(${FP_W / 2}, ${FP_H / 2})`} className="pointer-events-none">
                  <rect x={-52} y={-26} width={104} height={52} rx={4} fill="rgba(255,255,255,0.58)" stroke="rgba(95,90,82,0.18)" />
                  <text x={0} y={-3} textAnchor="middle" fill="#5f5a52" fontSize={8} fontWeight={800}>
                    This floor is empty
                  </text>
                  <text x={0} y={11} textAnchor="middle" fill="#756f66" fontSize={5.8} fontWeight={600}>
                    Choose an object from the library
                  </text>
                </g>
              )}

              {/* ═══ WALLS ═══ */}
              {orderedRooms.map((room) => {
                const rt = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
                const roomFill = room.color ?? rt.fill;
                const roomStroke = room.color ?? rt.stroke;
                const isSel = (selected?.type === "room" && selected.id === room.id) || multiSelected.includes(room.id);
                const roomAccessDoors = roomAccessDoorIds(room).map((id) => doors.find((door) => door.id === id)).filter((door): door is NonNullable<typeof door> => !!door);
                const roomPickReady = !!testRoutePickKind && roomAccessDoors.some((roomDoor) => {
                  const roomDoorNode = indoorNodes.find((node) => node.doorId === roomDoor.id);
                  return isDoorEligibleForRoom(room, roomDoor, walls, indoorNodes, { rooms }) && !!roomDoorNode
                    && indoorEdges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE
                      && (edge.startNodeId === roomDoorNode.id || edge.endNodeId === roomDoorNode.id));
                });
                const roomPickHover = testRoutePickHover?.type === "room" && testRoutePickHover.id === room.id;
                // B7 Part F: visual overlap indicator
                const isOverlap = overlappingRoomIds.has(room.id);
                const rotation = room.rotation ?? 0;
                const cx = room.x + room.w / 2;
                const cy = room.y + room.h / 2;
                return (
                  <g key={room.id} data-floor-title={room.name} aria-label={room.name} onMouseEnter={() => { if (roomPickReady) setTestRoutePickHover({ type: "room", id: room.id }); }} onMouseLeave={() => { if (roomPickHover) setTestRoutePickHover(null); }} onMouseDown={(e) => onItemDown(e, "room", room.id, room)}
                    onContextMenu={(e) => onItemContextMenu(e, "room", room.id)}
                    opacity={visibleOpacity(room)}
                    style={{ cursor: tool === "select" ? room.locked ? "default" : "move" : cursor }}>
                    <g transform={`rotate(${rotation}, ${cx}, ${cy})`} clipPath={`url(#${floorClipId})`}>
                      {roomPickReady && <rect x={room.x - 5} y={room.y - 5} width={room.w + 10} height={room.h + 10} rx={3} fill={roomPickHover ? "rgba(139,92,246,0.14)" : "none"} stroke="#8b5cf6" strokeWidth={roomPickHover ? 3 : 1.5} strokeDasharray={roomPickHover ? undefined : "5 4"} className="pointer-events-none" />}
                      <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
                         fill={roomFill}
                        fillOpacity={isSel ? 0.72 : 0.58}
                        stroke={isOverlap ? "#dc2626" : isSel ? "var(--accent)" : roomStroke}
                        strokeWidth={isOverlap ? 2.5 : isSel ? 2 : 1}
                        strokeDasharray={isOverlap ? "4 2" : undefined} />
                      <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1}
                        stroke="rgba(0,0,0,0.06)" strokeWidth={1.5} />
                    </g>
                    {room.locked && (
                      <g transform={`translate(${room.x + room.w - 10}, ${room.y + 4}) rotate(${rotation}, 4, 4)`} className="pointer-events-none">
                        <rect x={0} y={0} width={8} height={8} rx={1.5} fill="rgba(15,23,42,0.78)" />
                        <path d="M2.2 3.6 V2.8 C2.2 1.8 2.9 1.1 4 1.1 C5.1 1.1 5.8 1.8 5.8 2.8 V3.6 M1.8 3.4 H6.2 V6.8 H1.8 Z" fill="none" stroke="white" strokeWidth={0.7} strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                );
              })}

              {orderedWalls.map((wall) => {
                const selectableWall = !isManagedPerimeterWall(wall);
                const isSel = selectableWall && ((selected?.type === "wall" && selected.id === wall.id) || multiSelected.includes(wall.id));
                const materialStyle = wallMaterialStyle(wall.material);
                const label = wallLengthLabelPosition(wall);
                // B7 Part G: wall-drawing mode makes wall SVG groups non-interactive
                // so the completion click always reaches the SVG background handler
                // and the snap resolution picks the correct endpoint.
                const wallDrawingMode = tool === "wall" || tool === "door" || tool === "window";
                return (
                  <g key={wall.id} clipPath={`url(#${floorClipId})`}
                    onMouseDown={wallDrawingMode ? undefined : (e) => onItemDown(e, "wall", wall.id, wall)}
                    onContextMenu={wallDrawingMode ? undefined : (e) => onItemContextMenu(e, "wall", wall.id)}
                    opacity={visibleOpacity(wall)}
                    style={{ cursor: tool === "select" && selectableWall ? "pointer" : cursor, pointerEvents: wallDrawingMode ? "none" : undefined }}>
                    {/* Selection glow */}
                    {isSel && (
                      <line data-testid="selection-glow" x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                        stroke="var(--accent)" strokeWidth={wall.thickness + 6} opacity={0.3}
                        strokeLinecap="round" />
                    )}
                    {/* Wall body */}
                    <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                      stroke={materialStyle.casing} strokeWidth={wall.thickness + 2}
                      strokeLinecap="butt" strokeLinejoin="round" opacity={materialStyle.casingOpacity}
                      strokeDasharray={materialStyle.dash} />
                    <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                      stroke={wall.color} strokeWidth={wall.thickness}
                      strokeLinecap="butt" strokeLinejoin="round" opacity={materialStyle.coreOpacity} />
                    {/* Selection handles */}
                    {isSel && !isManagedPerimeterWall(wall) && (
                      <>
                        {/* Endpoint 1 — draggable */}
                        <circle data-testid="wall-endpoint-handle" cx={wall.x1} cy={wall.y1} r={6} fill={wall.startAnchor ? "var(--accent)" : "white"} stroke="var(--accent)" strokeWidth={2}
                          opacity={wall.startAnchor ? 0.88 : 1}
                          style={{ cursor: tool === "select" ? "move" : cursor }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (tool !== "select") return;
                            if (wall.locked) {
                              toast.info("Locked wall", "Unlock this wall before editing endpoints.");
                              return;
                            }
                            suppressHistoryRef.current = true;
                            gestureMoved.current = false;
                            wallEndpointDrag.current = { wallId: wall.id, endpoint: "x1", origin: { ...wall } };
                          }} />
                        {/* Endpoint 2 — draggable */}
                        <circle data-testid="wall-endpoint-handle" cx={wall.x2} cy={wall.y2} r={6} fill={wall.endAnchor ? "var(--accent)" : "white"} stroke="var(--accent)" strokeWidth={2}
                          opacity={wall.endAnchor ? 0.88 : 1}
                          style={{ cursor: tool === "select" ? "move" : cursor }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (tool !== "select") return;
                            if (wall.locked) {
                              toast.info("Locked wall", "Unlock this wall before editing endpoints.");
                              return;
                            }
                            suppressHistoryRef.current = true;
                            gestureMoved.current = false;
                            wallEndpointDrag.current = { wallId: wall.id, endpoint: "x2", origin: { ...wall } };
                          }} />
                        {/* Length label */}
                        <text x={label.x} y={label.y}
                          transform={`rotate(${label.angle}, ${label.x}, ${label.y})`}
                          textAnchor="middle" fill="#706d68" fontSize={6} fontWeight="600"
                          className="pointer-events-none select-none">
                          {Math.round(dist(wall.x1, wall.y1, wall.x2, wall.y2))}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* ═══ WALL ENDPOINT DRAG PREVIEW ═══ */}
              {wallJoints.map((joint) => (
                <g key={`${joint.x}-${joint.y}`} data-testid="wall-joint-cap" className="pointer-events-none">
                  {/* Compact square structural union. Its size is derived from
                      the thickest incident Wall; it is deliberately not an
                      editor handle or navigation node, and stays below the
                      independently rendered endpoint handles. */}
                  <rect x={joint.x - joint.radius} y={joint.y - joint.radius}
                    width={joint.radius * 2} height={joint.radius * 2}
                    fill={joint.casingColor} opacity={0.96} />
                  <rect x={joint.x - Math.max(1, joint.radius - 1)} y={joint.y - Math.max(1, joint.radius - 1)}
                    width={Math.max(2, (joint.radius - 1) * 2)} height={Math.max(2, (joint.radius - 1) * 2)}
                    fill={joint.color} />
                </g>
              ))}

              {(() => {
                const ep = wallEndpointDrag.current;
                if (!ep) return null;
                const wall = walls.find(w => w.id === ep.wallId);
                if (!wall) return null;
                return (
                  <circle
                    cx={wall[ep.endpoint === "x1" ? "x1" : "x2"]}
                    cy={wall[ep.endpoint === "x1" ? "y1" : "y2"]}
                    r={8} fill="var(--accent)" opacity={0.4}
                    className="pointer-events-none"
                  />
                );
              })()}

              {/* ═══ DOORS ═══ */}
              {openingPreview && (() => {
                const wall = wallById.get(openingPreview.wallId);
                const color = openingPreview.type === "door" ? "#b45309" : "#0284c7";
                const wallThickness = wall?.thickness ?? 6;
                return (
                  <g data-testid={`${openingPreview.type}-wall-preview`} className="pointer-events-none">
                    {wall && (
                      <line
                        x1={wall.x1}
                        y1={wall.y1}
                        x2={wall.x2}
                        y2={wall.y2}
                        stroke="var(--accent)"
                        strokeWidth={wall.thickness + 10}
                        strokeLinecap="butt"
                        opacity={0.24}
                      />
                    )}
                    <g transform={`translate(${openingPreview.x}, ${openingPreview.y}) rotate(${openingPreview.angle})`}>
                      <WallOpeningSymbol
                        kind={openingPreview.type}
                        width={openingPreview.width}
                        wallThickness={wallThickness}
                        color={color}
                        background={floor.backgroundColor ?? "#e8e1d7"}
                      />
                    </g>
                  </g>
                );
              })()}

              {orderedDoors.map((door) => {
                const isSel = (selected?.type === "door" && selected.id === door.id) || multiSelected.includes(door.id);
                const linkTarget = roomDoorTargetIsValid(door);
                const linkHover = linkTarget && roomDoorHoverId === door.id;
                const inspectorDoorHover = roomDoorInspectorHoverId === door.id;
                const currentRoom = selected?.type === "room" ? rooms.find((room) => room.id === selected.id) : undefined;
                const linkedToCurrentRoom = !!roomDoorLinking && selected?.type === "room"
                  && !!currentRoom && roomAccessDoorIds(currentRoom).includes(door.id);
                const routePickReady = false;
                const routePickHover = testRoutePickHover?.type === "door" && testRoutePickHover.id === door.id;
                const geom = resolveWallOpeningGeometry(door, door.wallId ? wallById.get(door.wallId) : undefined);
                const doorNavConnected = indoorNodes.some((node) => node.doorId === door.id);
                const doorQuickInfo = `${door.label?.trim() || "Door"} · ${door.isEmergencyExit ? "Emergency Exit Door" : "Indoor door"}${doorNavConnected ? " · Connected to Walking Network" : ""}`;
                if (geom) {
                  return (
                    <g key={door.id} onMouseDown={(e) => onItemDown(e, "door", door.id, door)}
                      data-testid="attached-door-opening-symbol"
                      data-floor-title={door.label ?? "Door"}
                      aria-label={doorQuickInfo}
                      tabIndex={0}
                      onContextMenu={(e) => onItemContextMenu(e, "door", door.id)}
                      onMouseEnter={() => { if (linkTarget || linkedToCurrentRoom) setRoomDoorHoverId(door.id); if (routePickReady) setTestRoutePickHover({ type: "door", id: door.id }); }}
                      onMouseLeave={() => { if (roomDoorHoverId === door.id) setRoomDoorHoverId(null); if (routePickHover) setTestRoutePickHover(null); }}
                      opacity={visibleOpacity(door)}
                      transform={openingSymbolTransform(geom)}
                    style={{ cursor: tool === "select" ? "pointer" : cursor }}>
                      <title>{doorQuickInfo}</title>
                      {/* Expanded physical hit area stays inside the Door group,
                          below its resize handles, so the linked nav cue cannot
                          steal body clicks while handles retain their own
                          stopPropagation behavior. */}
                      <rect
                        x={-geom.width / 2 - 6}
                        y={-(geom.wall.thickness / 2 + 7)}
                        width={geom.width + 12}
                        height={geom.wall.thickness + 14}
                        rx={3}
                        fill="transparent"
                        data-testid="floor-door-physical-hit"
                      />
                      {routePickReady && <rect data-testid="test-route-door-target" x={-geom.width / 2 - 11} y={-(geom.wall.thickness / 2 + 12)} width={geom.width + 22} height={geom.wall.thickness + 24} rx={4} fill={routePickHover ? "rgba(139,92,246,0.16)" : "none"} stroke="#8b5cf6" strokeWidth={routePickHover ? 2.5 : 1.3} strokeDasharray={routePickHover ? undefined : "5 4"} className="pointer-events-none" />}
                      {linkTarget && (
                        <rect
                          data-testid="room-door-link-target"
                          x={-geom.width / 2 - 9}
                          y={-(geom.wall.thickness / 2 + 10)}
                          width={geom.width + 18}
                          height={geom.wall.thickness + 20}
                          rx={4}
                          fill={linkHover ? "rgba(139,92,246,0.14)" : "transparent"}
                          stroke="#8b5cf6"
                          strokeWidth={linkHover ? 2 : 1.2}
                          strokeDasharray={linkHover ? undefined : "4 3"}
                          opacity={linkHover ? 1 : 0.62}
                          className="pointer-events-none"
                        />
                      )}
                      {linkedToCurrentRoom && !linkTarget && (
                        <rect data-testid="room-door-already-linked" x={-geom.width / 2 - 9} y={-(geom.wall.thickness / 2 + 10)} width={geom.width + 18} height={geom.wall.thickness + 20} rx={4}
                          fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.8} className="pointer-events-none" />
                      )}
                      {inspectorDoorHover && <rect data-testid="room-door-inspector-hover" x={-geom.width / 2 - 12} y={-(geom.wall.thickness / 2 + 13)} width={geom.width + 24} height={geom.wall.thickness + 26} rx={5} fill="rgba(139,92,246,0.08)" stroke="#8b5cf6" strokeWidth={1.4} className="pointer-events-none" />}
                      <WallOpeningSymbol
                        kind="door"
                        width={geom.width}
                        wallThickness={geom.wall.thickness}
                        color={door.color}
                        background={floor.backgroundColor ?? "#e8e1d7"}
                        direction={door.direction}
                        doorType={effectiveDoorType(door)}
                        hinge={door.hinge}
                        swingSide={door.swingSide ?? defaultSwingSideForWall(geom.wall)}
                        selected={isSel}
                        locked={door.locked}
                      />
                      {isSel && (
                        <>
                          {[-geom.width / 2, geom.width / 2].map((x, index) => {
                            const handleSign = (index === 0 ? -1 : 1) as -1 | 1;
                            return (
                            <rect
                              key={index}
                              data-testid="opening-resize-handle"
                              data-kind="door"
                              x={x - 3}
                              y={-5}
                              width={6}
                              height={10}
                              rx={1.5}
                              fill="white"
                              stroke="var(--accent)"
                              strokeWidth={1.5}
                              style={{ cursor: "ew-resize" }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (tool !== "select") return;
                                if (door.locked) {
                                  toast.info("Locked door", "Unlock this door before resizing it.");
                                  return;
                                }
                                if (isUserLockedWall(geom.wall)) {
                                  toast.info("Locked wall", "Unlock the parent wall before resizing this opening.");
                                  return;
                                }
                                suppressHistoryRef.current = true;
                                gestureMoved.current = false;
                                openingResize.current = { type: "door", id: door.id, wallId: geom.wall.id, origin: structuredClone(door), handleSign };
                              }}
                            />
                            );
                          })}
                        </>
                      )}
                    </g>
                  );
                }
                return (
                  <g key={door.id} clipPath={`url(#${floorClipId})`} data-floor-title={door.label ?? "Door"} aria-label={doorQuickInfo} tabIndex={0} onMouseDown={(e) => onItemDown(e, "door", door.id, door)}
                    onContextMenu={(e) => onItemContextMenu(e, "door", door.id)}
                    onMouseEnter={() => { if (linkTarget || linkedToCurrentRoom) setRoomDoorHoverId(door.id); if (routePickReady) setTestRoutePickHover({ type: "door", id: door.id }); }}
                    onMouseLeave={() => { if (roomDoorHoverId === door.id) setRoomDoorHoverId(null); if (routePickHover) setTestRoutePickHover(null); }}
                    opacity={visibleOpacity(door)}
                    style={{ cursor: tool === "select" ? "pointer" : cursor }}>
                    <title>{doorQuickInfo}</title>
                    <rect
                      x={door.x - door.width / 2 - 6}
                      y={door.y - 9}
                      width={door.width + 12}
                      height={18}
                      rx={3}
                      fill="transparent"
                      data-testid="floor-door-physical-hit"
                    />
                    {routePickReady && <rect data-testid="test-route-door-target" x={door.x - door.width / 2 - 11} y={door.y - 14} width={door.width + 22} height={28} rx={4} fill={routePickHover ? "rgba(139,92,246,0.16)" : "none"} stroke="#8b5cf6" strokeWidth={routePickHover ? 2.5 : 1.3} strokeDasharray={routePickHover ? undefined : "5 4"} className="pointer-events-none" />}
                    {linkTarget && (
                      <rect
                        data-testid="room-door-link-target"
                        x={door.x - door.width / 2 - 9}
                        y={door.y - 12}
                        width={door.width + 18}
                        height={24}
                        rx={4}
                        fill={linkHover ? "rgba(139,92,246,0.14)" : "transparent"}
                        stroke="#8b5cf6"
                        strokeWidth={linkHover ? 2 : 1.2}
                        strokeDasharray={linkHover ? undefined : "4 3"}
                        opacity={linkHover ? 1 : 0.62}
                        className="pointer-events-none"
                      />
                    )}
                    {linkedToCurrentRoom && !linkTarget && (
                      <rect data-testid="room-door-already-linked" x={door.x - door.width / 2 - 9} y={door.y - 12} width={door.width + 18} height={24} rx={4}
                        fill="rgba(34,197,94,0.08)" stroke="#22c55e" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.8} className="pointer-events-none" />
                    )}
                    {inspectorDoorHover && <rect data-testid="room-door-inspector-hover" x={door.x - door.width / 2 - 12} y={door.y - 15} width={door.width + 24} height={30} rx={5} fill="rgba(139,92,246,0.08)" stroke="#8b5cf6" strokeWidth={1.4} className="pointer-events-none" />}
                    {/* Door rectangle */}
                    <rect x={door.x - door.width / 2} y={door.y - 2} width={door.width} height={4} rx={1}
                      fill={isSel ? "var(--accent)" : door.color}
                      stroke={door.color} strokeWidth={1} />
                    {/* Swing arc indicator */}
                    {door.direction !== "sliding" && (
                      <path d={door.direction === "left"
                        ? `M ${door.x} ${door.y} A ${door.width} ${door.width} 0 0 0 ${door.x - door.width} ${door.y}`
                        : `M ${door.x} ${door.y} A ${door.width} ${door.width} 0 0 1 ${door.x + door.width} ${door.y}`}
                        fill="none" stroke={door.color} strokeWidth={1} opacity={0.5} />
                    )}
                    {door.locked && (
                      <text x={door.x} y={door.y + 3} textAnchor="middle" fill="white" fontSize={5} fontWeight="bold">🔒</text>
                    )}
                  </g>
                );
              })}

              {/* ═══ WINDOWS ═══ */}
              {orderedWindows.map((win) => {
                const isSel = (selected?.type === "window" && selected.id === win.id) || multiSelected.includes(win.id);
                const geom = resolveWallOpeningGeometry(win, win.wallId ? wallById.get(win.wallId) : undefined);
                if (geom) {
                  return (
                    <g key={win.id} onMouseDown={(e) => onItemDown(e, "window", win.id, win)}
                      data-testid="attached-window-opening-symbol"
                      onContextMenu={(e) => onItemContextMenu(e, "window", win.id)}
                      opacity={visibleOpacity(win)}
                      transform={openingSymbolTransform(geom)}
                      style={{ cursor: tool === "select" ? "pointer" : cursor }}>
                      <WallOpeningSymbol
                        kind="window"
                        width={geom.width}
                        wallThickness={geom.wall.thickness}
                        color={win.color}
                        background={floor.backgroundColor ?? "#e8e1d7"}
                        selected={isSel}
                        locked={win.locked}
                      />
                      {isSel && (
                        <>
                          {[-geom.width / 2, geom.width / 2].map((x, index) => {
                            const handleSign = (index === 0 ? -1 : 1) as -1 | 1;
                            return (
                            <rect
                              key={index}
                              data-testid="opening-resize-handle"
                              data-kind="window"
                              x={x - 3}
                              y={-5}
                              width={6}
                              height={10}
                              rx={1.5}
                              fill="white"
                              stroke="var(--accent)"
                              strokeWidth={1.5}
                              style={{ cursor: "ew-resize" }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (tool !== "select") return;
                                if (win.locked) {
                                  toast.info("Locked window", "Unlock this window before resizing it.");
                                  return;
                                }
                                if (isUserLockedWall(geom.wall)) {
                                  toast.info("Locked wall", "Unlock the parent wall before resizing this opening.");
                                  return;
                                }
                                suppressHistoryRef.current = true;
                                gestureMoved.current = false;
                                openingResize.current = { type: "window", id: win.id, wallId: geom.wall.id, origin: structuredClone(win), handleSign };
                              }}
                            />
                            );
                          })}
                        </>
                      )}
                    </g>
                  );
                }
                return (
                  <g key={win.id} clipPath={`url(#${floorClipId})`} onMouseDown={(e) => onItemDown(e, "window", win.id, win)}
                    onContextMenu={(e) => onItemContextMenu(e, "window", win.id)}
                    opacity={visibleOpacity(win)}
                    style={{ cursor: tool === "select" ? "pointer" : cursor }}>
                    <rect x={win.x} y={win.y} width={win.width} height={win.height}
                      fill={isSel ? "rgba(14,42,110,0.2)" : win.color}
                      stroke={isSel ? "var(--accent)" : "#38bdf8"} strokeWidth={1} rx={1} />
                    {/* Window divider lines */}
                    <line x1={win.x + win.width / 2} y1={win.y} x2={win.x + win.width / 2} y2={win.y + win.height}
                      stroke="#38bdf8" strokeWidth={0.5} opacity={0.6} />
                  </g>
                );
              })}

              {floorLayerStack.map((entry) => {
                if (entry.type === "room") {
                  const room = entry.item;
                  const rt = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
                  const isSel = (selected?.type === "room" && selected.id === room.id) || multiSelected.includes(room.id);
                  const rotation = room.rotation ?? 0;
                  const cx = room.x + room.w / 2;
                  const cy = room.y + room.h / 2;
                  const roomName = room.name.length > 18 ? `${room.name.slice(0, 17)}...` : room.name;
                  const fontSize = Math.min(room.w > 90 ? 8 : 7, 9);
                  const labelW = Math.min(room.w - 6, Math.max(28, roomName.length * fontSize * 0.58 + 8));
                  return (
                    <g
                      key={`${entry.type}-${entry.id}`}
                      data-layer-key={`${entry.type}:${entry.id}`}
                      data-floor-title={room.name}
                      aria-label={room.name}
                      opacity={visibleOpacity(room)}
                      style={{ cursor: tool === "select" ? room.locked ? "default" : "move" : cursor }}
                    >
                      <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                        {/* B7 QA: transparent rect must not intercept pointer events —
                            room selection is handled by the orderedRooms.map group rendered
                            BEFORE walls. This overlay is visual-only (labels, selection
                            handles). pointer-events-none on the rect prevents walls between
                            rooms from being unselectable. */}
                        <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1} fill="transparent" stroke="none" className="pointer-events-none" />
                        {room.visible !== false && room.w >= 40 && room.h >= 18 && (
                          <g data-testid="room-label-overlay" className="pointer-events-none select-none">
                            <rect
                              x={cx - labelW / 2}
                              y={cy - fontSize / 2 - 4}
                              width={labelW}
                              height={fontSize + 8}
                              rx={2}
                              fill={floor.backgroundColor ?? "#ffffff"}
                              fillOpacity={0.72}
                              stroke="rgba(15,23,42,0.12)"
                              strokeWidth={0.6}
                            />
                            <text
                              x={cx}
                              y={cy + fontSize * 0.34}
                              textAnchor="middle"
                              fill={rt.text}
                              fontSize={fontSize}
                              fontWeight="700"
                              stroke={floor.backgroundColor ?? "#ffffff"}
                              strokeWidth={1.8}
                              paintOrder="stroke fill"
                            >
                              {roomName}
                            </text>
                          </g>
                        )}
                      </g>
                      {isSel && (
                        <CirculationSelectionHandles
                          x={room.x} y={room.y} width={room.w} height={room.h}
                          rotation={rotation}
                          handleSize={handleSizeFor(room.w, room.h)}
                          rotateOffset={rotateHandleOffsetFor(room.h)}
                          testPrefix="room"
                          onResize={(event, handle) => onResizeStart(event, room, handle)}
                          onRotate={(event) => onRotateStart(event, "room", room.id, { x: room.x, y: room.y, width: room.w, height: room.h, rotation })}
                        />
                      )}
                      {isSel && room.w > 60 && room.h > 24 && (
                        <text x={cx} y={room.y + room.h + 12} textAnchor="middle"
                          fill="#706d68" fontSize={6} fontWeight="500" className="pointer-events-none select-none">
                          {room.w}x{room.h} | {Math.round(rotation)} deg
                        </text>
                      )}
                    </g>
                  );
                }

                if (entry.type === "furniture") {
                  const fi = entry.item;
                  const isSel = (selected?.type === "furniture" && selected.id === fi.id) || multiSelected.includes(fi.id);
                  const cx = fi.x + fi.width / 2;
                  const cy = fi.y + fi.height / 2;
                  return (
                    <g
                      key={`${entry.type}-${entry.id}`}
                      data-layer-key={`${entry.type}:${entry.id}`}
                      onMouseDown={(e) => onItemDown(e, "furniture", fi.id, fi)}
                      onContextMenu={(e) => onItemContextMenu(e, "furniture", fi.id)}
                      opacity={visibleOpacity(fi)}
                      style={{ cursor: tool === "select" ? "move" : cursor }}
                    >
                      {isSel && (
                        <g transform={`rotate(${fi.rotation}, ${cx}, ${cy})`}>
                          <rect data-testid="furniture-selection-outline" x={fi.x - 2} y={fi.y - 2} width={fi.width + 4} height={fi.height + 4} rx={1}
                            fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" />
                          <line x1={cx} y1={fi.y - 2} x2={cx} y2={fi.y - rotateHandleOffsetFor(fi.height) + 2}
                            stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 2" />
                          <circle data-testid="furniture-rotate-handle" cx={cx} cy={fi.y - rotateHandleOffsetFor(fi.height)}
                            r={Math.max(3, handleSizeFor(fi.width, fi.height) * 0.72)}
                            fill="white" stroke="var(--accent)" strokeWidth={1.4}
                            style={{ cursor: "grab" }}
                            onMouseDown={(e) => onRotateStart(e, "furniture", fi.id, fi)} />
                          {["n", "s", "e", "w"].map((side) => {
                            const hs = handleSizeFor(fi.width, fi.height);
                            const hx = side === "e" ? fi.x + fi.width - hs / 2 : side === "w" ? fi.x - hs / 2 : fi.x + fi.width / 2 - hs / 2;
                            const hy = side === "s" ? fi.y + fi.height - hs / 2 : side === "n" ? fi.y - hs / 2 : fi.y + fi.height / 2 - hs / 2;
                            return (
                              <rect
                                key={side}
                                data-testid="furniture-resize-handle"
                                data-corner={side}
                                x={hx}
                                y={hy}
                                width={hs}
                                height={hs}
                                rx={1.5}
                                fill="white"
                                stroke="var(--accent)"
                                strokeWidth={1.2}
                                style={{ cursor: side === "n" || side === "s" ? "ns-resize" : "ew-resize" }}
                                onMouseDown={(e) => onFurnitureResizeStart(e, fi, side)}
                              />
                            );
                          })}
                          {["nw", "ne", "sw", "se"].map((corner) => {
                            const hs = handleSizeFor(fi.width, fi.height);
                            const hx = corner.includes("e") ? fi.x + fi.width - hs / 2 : fi.x - hs / 2;
                            const hy = corner.includes("s") ? fi.y + fi.height - hs / 2 : fi.y - hs / 2;
                            return (
                              <rect
                                key={corner}
                                data-testid="furniture-resize-handle"
                                data-corner={corner}
                                x={hx}
                                y={hy}
                                width={hs}
                                height={hs}
                                rx={1.5}
                                fill="white"
                                stroke="var(--accent)"
                                strokeWidth={1.5}
                                style={{ cursor: "nwse-resize" }}
                                onMouseDown={(e) => onFurnitureResizeStart(e, fi, corner)}
                              />
                            );
                          })}
                        </g>
                      )}
                      <g transform={`rotate(${fi.rotation}, ${cx}, ${cy})`}>
                        <FloorFurnitureSymbol type={fi.type} x={fi.x} y={fi.y} width={fi.width} height={fi.height} color={fi.color} selected={isSel} />
                        <title>{fi.name}</title>
                      </g>
                    </g>
                  );
                }

                if (entry.type === "ramp" || entry.type === "stairs" || entry.type === "elevator") {
                  const item = entry.item;
                  const isExteriorEmergency = entry.type === "stairs" && Boolean(item.exteriorEmergencyStairId);
                  const isSel = (selected?.type === entry.type && selected.id === item.id) || multiSelected.includes(item.id);
                  const routeNode = indoorNodes.find((node) => (entry.type === "ramp" && node.rampId === item.id) || (entry.type === "stairs" && node.stairId === item.id) || (entry.type === "elevator" && node.elevatorId === item.id));
                  const routePickReady = !!testRoutePickKind && !!routeNode && walkableIndoorEdges.some((edge) => edge.startNodeId === routeNode.id || edge.endNodeId === routeNode.id);
                  const routePickHover = testRoutePickHover?.type === entry.type && testRoutePickHover.id === item.id;
                  const cx = item.x + item.width / 2;
                  const cy = item.y + item.height / 2;
                  const rotation = item.rotation ?? 0;
                  return (
                    <g
                      key={`${entry.type}-${entry.id}`}
                      data-layer-key={`${entry.type}:${entry.id}`}
                      data-floor-title={item.label}
                      aria-label={item.label}
                      onMouseEnter={() => { if (routePickReady) setTestRoutePickHover({ type: entry.type, id: item.id }); }}
                      onMouseLeave={() => { if (routePickHover) setTestRoutePickHover(null); }}
                      onMouseDown={(e) => {
                        if (isExteriorEmergency) {
                          e.stopPropagation();
                          if (navMode) {
                            setNavSelected(null);
                            setNavMultiSelected([]);
                            setNavPhysicalSelected({ type: "stairs", id: item.id });
                          } else {
                            setSelected({ type: "stairs", id: item.id });
                            setMultiSelected([]);
                          }
                          setShowProperties(true);
                        } else {
                          onItemDown(e, entry.type, item.id, item);
                        }
                      }}
                      onContextMenu={(e) => onItemContextMenu(e, entry.type, item.id)}
                      opacity={visibleOpacity(item)}
                      style={{ cursor: tool === "select" ? "move" : cursor }}
                    >
                      {isSel && (
                        <CirculationSelectionHandles
                          x={item.x} y={item.y} width={item.width} height={item.height}
                          rotation={rotation}
                          handleSize={handleSizeFor(item.width, item.height)}
                          rotateOffset={rotateHandleOffsetFor(item.height)}
                          testPrefix={entry.type}
                          onResize={(event, handle) => onCirculationResizeStart(event, entry.type, item, handle)}
                          onRotate={(event) => onRotateStart(event, entry.type, item.id, item)}
                        />
                      )}
                      {routePickReady && <rect x={item.x - 5} y={item.y - 5} width={item.width + 10} height={item.height + 10} rx={4} fill={routePickHover ? "rgba(139,92,246,0.16)" : "none"} stroke="#8b5cf6" strokeWidth={routePickHover ? 2.5 : 1.3} strokeDasharray={routePickHover ? undefined : "5 4"} className="pointer-events-none" />}
                      <g data-testid={`${entry.type}-symbol`} transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                        {entry.type === "ramp" ? <RampSymbol item={item} selected={isSel} /> : null}
                        {entry.type === "stairs" ? (
                          <StairsSymbol
                            item={item}
                            selected={isSel}
                            floorIndex={activeFloorIndex}
                            floorCount={buildingFloors.length}
                          />
                        ) : null}
                        {entry.type === "elevator" ? <ElevatorSymbol item={item} selected={isSel} /> : null}
                      </g>
                      {isExteriorEmergency && (
                        <g className="pointer-events-none select-none">
                          <circle cx={item.x + item.width - 5} cy={item.y + 5} r={5} fill="#dc2626" stroke="white" strokeWidth={1} />
                          <text x={item.x + item.width - 5} y={item.y + 7.5} textAnchor="middle" fill="white" fontSize={5.5} fontWeight="900">E</text>
                        </g>
                      )}
                      {(entry.type === "elevator" || entry.type === "stairs") && (() => {
                        const statusKind = entry.type === "elevator" ? "elevators" : "stairs";
                        const connectedFloorCount = item.sharedId
                          ? (circulationConnectionFloorCounts[statusKind].get(item.sharedId) ?? 1)
                          : 1;
                        const connected = connectedFloorCount > 1;
                        const statusLabel = connected
                          ? `Connected to ${connectedFloorCount} floors`
                          : "Not connected to another floor";
                        return (
                          <g
                            data-testid={`${entry.type}-connection-status`}
                            role="img"
                            tabIndex={0}
                            aria-label={statusLabel}
                            className="cursor-help outline-none"
                          >
                            <circle
                              cx={item.x + item.width - 5}
                              cy={item.y + item.height - 5}
                              r={4}
                              fill={connected ? "#059669" : "#d97706"}
                              stroke="white"
                              strokeWidth={1}
                              opacity={0.92}
                            />
                            <title>{statusLabel}</title>
                          </g>
                        );
                      })()}
                      {entry.type !== "ramp" && (() => {
                        const quickKind = entry.type as "stairs" | "elevator";
                        const quickKey = `${quickKind}:${item.id}`;
                        const quickTargets = quickNavigationTargets.get(quickKey) ?? [];
                        // Route markers own the interaction surface while a Test
                        // Route is active. The authoring shortcut returns as soon
                        // as the route session is cleared, without touching it.
                        const quickNavVisible = (quickKind === "elevator"
                          ? quickTargets.some((target) => !target.isCurrent)
                          : quickTargets.length > 0)
                          && !routePreview
                          && !highlightedRoute
                          && !testRouteSessionContext.session?.result;
                        if (!quickNavVisible) return null;
                        const quickOpen = quickNavOpenKey === quickKey;
                        const indicator = rotatePoint(
                          { x: item.x + item.width - 7, y: item.y + 7 },
                          cx,
                          cy,
                          rotation,
                        );
                        const showQuick = () => openQuickNav(quickKey);
                        return (
                          <>
                            <g
                              data-testid={`circulation-quick-nav-${quickKind}`}
                              role="button"
                              tabIndex={0}
                              aria-label={`View connected Floors for ${item.label || (quickKind === "stairs" ? "Stair" : "Elevator")}`}
                              transform={`translate(${indicator.x} ${indicator.y})`}
                              style={{ cursor: "pointer" }}
                              onMouseEnter={showQuick}
                              onMouseLeave={scheduleQuickNavClose}
                              onFocus={showQuick}
                              onBlur={(event) => {
                                if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) scheduleQuickNavClose();
                              }}
                              onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                              onClick={(event) => { event.stopPropagation(); showQuick(); }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  showQuick();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  closeQuickNav();
                                }
                              }}
                            >
                              {quickOpen || isSel ? (
                                <circle r={6.5} fill="#7c3aed" opacity={0.2} className="motion-safe:animate-pulse motion-reduce:animate-none" />
                              ) : null}
                              <circle r={4.5} fill="#475569" stroke="#f8fafc" strokeWidth={1} opacity={quickOpen || isSel ? 0.98 : 0.7} />
                              <path d="M -2.2 -1.4 H 2.2 M -2.2 1.4 H 2.2" stroke="#f8fafc" strokeWidth={0.8} strokeLinecap="round" />
                            </g>
                          </>
                        );
                      })()}
                    </g>
                  );
                }

                return null;
              })}

              {/* ═══ ROOMS ═══ */}
              {false && rooms.map((room) => {
                const rt = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
                const isSel = (selected?.type === "room" && selected.id === room.id) || multiSelected.includes(room.id);
                return (
                  <g key={room.id} onMouseDown={(e) => onItemDown(e, "room", room.id, room)}
                    onContextMenu={(e) => onItemContextMenu(e, "room", room.id)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <>
                        <rect x={room.x - 3} y={room.y - 3} width={room.w + 6} height={room.h + 6} rx={2}
                          fill="none" stroke="var(--accent)" strokeWidth={2.5} />
                        {/* Resize handles */}
                        {["nw", "ne", "sw", "se"].map((corner) => {
                          const hs = 7;
                          const hx = corner.includes("e") ? room.x + room.w - hs / 2 : room.x - hs / 2;
                          const hy = corner.includes("s") ? room.y + room.h - hs / 2 : room.y - hs / 2;
                          return (
                            <rect key={corner} x={hx} y={hy} width={hs} height={hs} rx={1.5}
                              fill="white" stroke="var(--accent)" strokeWidth={2}
                              style={{ cursor: "nwse-resize" }}
                              onMouseDown={(e) => onResizeStart(e, room, corner)} />
                          );
                        })}
                      </>
                    )}
                    <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
                      fill={isSel ? "rgba(14,42,110,0.15)" : rt.fill}
                      stroke={isSel ? "var(--accent)" : rt.stroke}
                      strokeWidth={isSel ? 2 : 1} />
                    <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1}
                      stroke="rgba(0,0,0,0.06)" strokeWidth={1.5} />
                    {room.w >= 40 && room.h >= 18 && (
                      <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 3} textAnchor="middle"
                        fill={rt.text} fontSize={Math.min(room.w > 90 ? 8 : 6.5, 9)} fontWeight="600"
                        className="pointer-events-none select-none">
                        {room.name.length > 14 ? room.name.slice(0, 13) + "..." : room.name}
                      </text>
                    )}
                    {isSel && room.w > 60 && room.h > 24 && (
                      <text x={room.x + room.w / 2} y={room.y + room.h + 10} textAnchor="middle"
                        fill="#706d68" fontSize={6} fontWeight="500" className="pointer-events-none select-none">
                        {room.w}×{room.h}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* ═══ FURNITURE ═══ */}
              {false && orderedFurniture.map((fi) => {
                const isSel = (selected?.type === "furniture" && selected.id === fi.id) || multiSelected.includes(fi.id);
                const cx = fi.x + fi.width / 2;
                const cy = fi.y + fi.height / 2;
                return (
                  <g key={fi.id} onMouseDown={(e) => onItemDown(e, "furniture", fi.id, fi)}
                    onContextMenu={(e) => onItemContextMenu(e, "furniture", fi.id)}
                    opacity={visibleOpacity(fi)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <g transform={`rotate(${fi.rotation}, ${cx}, ${cy})`}>
                        <rect data-testid="furniture-selection-outline" x={fi.x - 2} y={fi.y - 2} width={fi.width + 4} height={fi.height + 4} rx={1}
                          fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" />
                        <line x1={cx} y1={fi.y - 2} x2={cx} y2={fi.y - rotateHandleOffsetFor(fi.height) + 2}
                          stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 2" />
                        <circle data-testid="furniture-rotate-handle" cx={cx} cy={fi.y - rotateHandleOffsetFor(fi.height)}
                          r={Math.max(3, handleSizeFor(fi.width, fi.height) * 0.72)}
                          fill="white" stroke="var(--accent)" strokeWidth={1.4}
                          style={{ cursor: "grab" }}
                          onMouseDown={(e) => onRotateStart(e, "furniture", fi.id, fi)} />
                        {/* Side handles — resize a single dimension (n/s → height, e/w → width) */}
                        {["n", "s", "e", "w"].map((side) => {
                          const hs = handleSizeFor(fi.width, fi.height);
                          const hx = side === "e" ? fi.x + fi.width - hs / 2 : side === "w" ? fi.x - hs / 2 : fi.x + fi.width / 2 - hs / 2;
                          const hy = side === "s" ? fi.y + fi.height - hs / 2 : side === "n" ? fi.y - hs / 2 : fi.y + fi.height / 2 - hs / 2;
                          return (
                            <rect
                              key={side}
                              data-testid="furniture-resize-handle"
                              data-corner={side}
                              x={hx}
                              y={hy}
                              width={hs}
                              height={hs}
                              rx={1.5}
                              fill="white"
                              stroke="var(--accent)"
                              strokeWidth={1.2}
                              style={{ cursor: side === "n" || side === "s" ? "ns-resize" : "ew-resize" }}
                              onMouseDown={(e) => onFurnitureResizeStart(e, fi, side)}
                            />
                          );
                        })}
                        {/* Corner handles — resize width + height together (Shift preserves aspect) */}
                        {["nw", "ne", "sw", "se"].map((corner) => {
                          const hs = handleSizeFor(fi.width, fi.height);
                          const hx = corner.includes("e") ? fi.x + fi.width - hs / 2 : fi.x - hs / 2;
                          const hy = corner.includes("s") ? fi.y + fi.height - hs / 2 : fi.y - hs / 2;
                          return (
                            <rect
                              key={corner}
                              data-testid="furniture-resize-handle"
                              data-corner={corner}
                              x={hx}
                              y={hy}
                              width={hs}
                              height={hs}
                              rx={1.5}
                              fill="white"
                              stroke="var(--accent)"
                              strokeWidth={1.5}
                              style={{ cursor: "nwse-resize" }}
                              onMouseDown={(e) => onFurnitureResizeStart(e, fi, corner)}
                            />
                          );
                        })}
                      </g>
                    )}
                    <g transform={`rotate(${fi.rotation}, ${cx}, ${cy})`}>
                      <FloorFurnitureSymbol type={fi.type} x={fi.x} y={fi.y} width={fi.width} height={fi.height} color={fi.color} selected={isSel} />
                      <title>{fi.name}</title>
                    </g>
                  </g>
                );
              })}

              {/* ═══ RAMPS ═══ */}
              {false && orderedRamps.map((rp) => {
                const isSel = (selected?.type === "ramp" && selected.id === rp.id) || multiSelected.includes(rp.id);
                const cx = rp.x + rp.width / 2;
                const cy = rp.y + rp.height / 2;
                const rotation = rp.rotation ?? 0;
                return (
                  <g key={rp.id} data-floor-title={rp.label} aria-label={rp.label} onMouseDown={(e) => onItemDown(e, "ramp", rp.id, rp)}
                    onContextMenu={(e) => onItemContextMenu(e, "ramp", rp.id)}
                    opacity={visibleOpacity(rp)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <CirculationSelectionHandles
                        x={rp.x} y={rp.y} width={rp.width} height={rp.height}
                        rotation={rotation}
                        handleSize={handleSizeFor(rp.width, rp.height)}
                        rotateOffset={rotateHandleOffsetFor(rp.height)}
                        testPrefix="ramp"
                        onResize={(event, handle) => onCirculationResizeStart(event, "ramp", rp, handle)}
                        onRotate={(event) => onRotateStart(event, "ramp", rp.id, rp)}
                      />
                    )}
                    <g data-testid="ramp-symbol" transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                      <RampSymbol item={rp} selected={isSel} />
                    </g>
                  </g>
                );
              })}

              {/* ═══ STAIRS ═══ */}
              {false && orderedStairs.map((st) => {
                const isSel = (selected?.type === "stairs" && selected.id === st.id) || multiSelected.includes(st.id);
                const cx = st.x + st.width / 2;
                const cy = st.y + st.height / 2;
                const rotation = st.rotation ?? 0;
                return (
                  <g key={st.id} data-floor-title={st.label} aria-label={st.label} onMouseDown={(e) => onItemDown(e, "stairs", st.id, st)}
                    onContextMenu={(e) => onItemContextMenu(e, "stairs", st.id)}
                    opacity={visibleOpacity(st)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <CirculationSelectionHandles
                        x={st.x} y={st.y} width={st.width} height={st.height}
                        rotation={rotation}
                        handleSize={handleSizeFor(st.width, st.height)}
                        rotateOffset={rotateHandleOffsetFor(st.height)}
                        testPrefix="stairs"
                        onResize={(event, handle) => onCirculationResizeStart(event, "stairs", st, handle)}
                        onRotate={(event) => onRotateStart(event, "stairs", st.id, st)}
                      />
                    )}
                    <g data-testid="stairs-symbol" transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                      <StairsSymbol
                        item={st}
                        selected={isSel}
                        floorIndex={activeFloorIndex}
                        floorCount={buildingFloors.length}
                      />
                    </g>
                  </g>
                );
              })}

              {/* ═══ ELEVATORS ═══ */}
              {false && orderedElevators.map((el) => {
                const isSel = (selected?.type === "elevator" && selected.id === el.id) || multiSelected.includes(el.id);
                const cx = el.x + el.width / 2;
                const cy = el.y + el.height / 2;
                const rotation = el.rotation ?? 0;
                return (
                  <g key={el.id} data-floor-title={el.label} aria-label={el.label} onMouseDown={(e) => onItemDown(e, "elevator", el.id, el)}
                    onContextMenu={(e) => onItemContextMenu(e, "elevator", el.id)}
                    opacity={visibleOpacity(el)}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    {isSel && (
                      <CirculationSelectionHandles
                        x={el.x} y={el.y} width={el.width} height={el.height}
                        rotation={rotation}
                        handleSize={handleSizeFor(el.width, el.height)}
                        rotateOffset={rotateHandleOffsetFor(el.height)}
                        testPrefix="elevator"
                        onResize={(event, handle) => onCirculationResizeStart(event, "elevator", el, handle)}
                        onRotate={(event) => onRotateStart(event, "elevator", el.id, el)}
                      />
                    )}
                    <g data-testid="elevator-symbol" transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                      <ElevatorSymbol item={el} selected={isSel} />
                    </g>
                  </g>
                );
              })}

              {/* ═══ INTERNAL PATHS ═══ */}
              {fpaths.map((p) => {
                const pts = p.points.map((pt) => `${pt.x},${pt.y}`).join(" ");
                const isSel = selected?.type === "path" && selected.id === p.id;
                return (
                  <g key={p.id} onClick={(e) => { e.stopPropagation(); if (tool === "erase") { deleteSelection({ type: "path", id: p.id }); } else selectFloorItem({ type: "path", id: p.id }); }}
                    onContextMenu={(e) => onItemContextMenu(e, "path", p.id)}
                    style={{ cursor: tool === "erase" ? "not-allowed" : "pointer" }}>
                    {isSel && <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={p.width + 4} strokeLinecap="round" opacity={0.4} />}
                    <polyline points={pts} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" opacity={0.8} />
                  </g>
                );
              })}

              {/* ═══ LABELS ═══ */}
              {false && orderedRooms.map((room) => {
                if (room.visible === false || room.w < 40 || room.h < 18) return null;
                const rt = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
                const cx = room.x + room.w / 2;
                const cy = room.y + room.h / 2;
                const rotation = room.rotation ?? 0;
                const name = room.name.length > 18 ? `${room.name.slice(0, 17)}...` : room.name;
                const fontSize = Math.min(room.w > 90 ? 8 : 7, 9);
                const labelW = Math.min(room.w - 6, Math.max(28, name.length * fontSize * 0.58 + 8));
                return (
                  <g
                    key={`room-label-${room.id}`}
                    data-testid="room-label-overlay"
                    clipPath={`url(#${floorClipId})`}
                    transform={`rotate(${rotation}, ${cx}, ${cy})`}
                    className="pointer-events-none select-none"
                  >
                    <rect
                      x={cx - labelW / 2}
                      y={cy - fontSize / 2 - 4}
                      width={labelW}
                      height={fontSize + 8}
                      rx={2}
                      fill={floor.backgroundColor ?? "#ffffff"}
                      fillOpacity={0.72}
                      stroke="rgba(15,23,42,0.12)"
                      strokeWidth={0.6}
                    />
                    <text
                      x={cx}
                      y={cy + fontSize * 0.34}
                      textAnchor="middle"
                      fill={rt.text}
                      fontSize={fontSize}
                      fontWeight="700"
                      stroke={floor.backgroundColor ?? "#ffffff"}
                      strokeWidth={1.8}
                      paintOrder="stroke fill"
                    >
                      {name}
                    </text>
                  </g>
                );
              })}

              {orderedLabels.map((lb) => {
                const isSel = (selected?.type === "label" && selected.id === lb.id) || multiSelected.includes(lb.id);
                const isSingleLabelSelection = selected?.type === "label" && selected.id === lb.id && multiSelected.length === 0;
                const isEditingLabel = inlineLabelEdit?.id === lb.id;
                const bounds = labelBounds(lb);
                const editorValue = isEditingLabel ? inlineLabelEdit.value : lb.text;
                const editorBounds = inlineLabelEditorBounds(lb, editorValue, FP_W, FP_H);
                const anchor = lb.align === "center" ? "middle" : lb.align === "right" ? "end" : "start";
                const hitPad = Math.max(4, Math.min(8, 7 / zoom));
                const handleSize = Math.max(4, Math.min(7, 6 / zoom));
                const rotateOffset = Math.max(14, Math.min(24, (bounds.h + 18) / zoom));
                const handleBounds = {
                  x: bounds.x - hitPad,
                  y: bounds.y - hitPad,
                  w: bounds.w + hitPad * 2,
                  h: bounds.h + hitPad * 2,
                };
                const cornerHandles = [
                  { id: "nw", x: handleBounds.x - handleSize / 2, y: handleBounds.y - handleSize / 2, cursor: "nwse-resize" },
                  { id: "ne", x: handleBounds.x + handleBounds.w - handleSize / 2, y: handleBounds.y - handleSize / 2, cursor: "nesw-resize" },
                  { id: "sw", x: handleBounds.x - handleSize / 2, y: handleBounds.y + handleBounds.h - handleSize / 2, cursor: "nesw-resize" },
                  { id: "se", x: handleBounds.x + handleBounds.w - handleSize / 2, y: handleBounds.y + handleBounds.h - handleSize / 2, cursor: "nwse-resize" },
                ];
                return (
                  <g key={lb.id} data-testid="floor-label-object"
                    onMouseDownCapture={(e) => {
                      if (e.detail >= 2) {
                        e.preventDefault();
                        e.stopPropagation();
                        beginInlineLabelEdit(lb, { isolate: true });
                      }
                    }}
                    onMouseDown={(e) => onItemDown(e, "label", lb.id, lb)}
                    onClick={(e) => {
                      if (e.detail >= 2) {
                        e.stopPropagation();
                        beginInlineLabelEdit(lb, { isolate: true });
                      }
                    }}
                    onContextMenu={(e) => onItemContextMenu(e, "label", lb.id)}
                    opacity={visibleOpacity(lb)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      beginInlineLabelEdit(lb, { isolate: true });
                    }}
                    style={{ cursor: tool === "select" ? "move" : cursor }}>
                    <g transform={`rotate(${lb.rotation}, ${lb.x}, ${lb.y})`}>
                      <rect
                        data-testid="floor-label-hit-area"
                        x={handleBounds.x}
                        y={handleBounds.y}
                        width={handleBounds.w}
                        height={handleBounds.h}
                        rx={2}
                        fill="transparent"
                        style={{ pointerEvents: "all", cursor: tool === "select" ? "move" : cursor }}
                        onMouseDown={(e) => {
                          if (e.detail >= 2) {
                            e.preventDefault();
                            e.stopPropagation();
                            beginInlineLabelEdit(lb, { isolate: true });
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          beginInlineLabelEdit(lb, { isolate: true });
                        }}
                      />
                      {isSel && !isEditingLabel && (
                        <rect
                          data-testid="floor-label-selection-outline"
                          x={handleBounds.x}
                          y={handleBounds.y}
                          width={handleBounds.w}
                          height={handleBounds.h}
                          rx={2}
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth={1.1}
                          strokeDasharray="3 2"
                          className="pointer-events-none"
                        />
                      )}
                      {!isEditingLabel && (
                        <text x={lb.x} y={lb.y} textAnchor={anchor} fill={lb.color} fontSize={lb.fontSize} fontWeight="600"
                          className="pointer-events-none select-none">
                          {lb.text}
                        </text>
                      )}
                      {isSingleLabelSelection && !isEditingLabel && (
                        <>
                          <line
                            x1={handleBounds.x + handleBounds.w / 2}
                            y1={handleBounds.y}
                            x2={handleBounds.x + handleBounds.w / 2}
                            y2={handleBounds.y - rotateOffset}
                            stroke="var(--accent)"
                            strokeWidth={1}
                            strokeDasharray="2 2"
                            className="pointer-events-none"
                          />
                          <circle
                            data-testid="floor-label-rotate-handle"
                            cx={handleBounds.x + handleBounds.w / 2}
                            cy={handleBounds.y - rotateOffset}
                            r={Math.max(3.5, handleSize * 0.75)}
                            fill="white"
                            stroke="var(--accent)"
                            strokeWidth={1.4}
                            style={{ cursor: "grab" }}
                            onMouseDown={(e) => startLabelTransform(e, lb, "rotate")}
                          />
                          {cornerHandles.map((handle) => (
                            <rect
                              key={handle.id}
                              data-testid="floor-label-resize-handle"
                              data-corner={handle.id}
                              x={handle.x}
                              y={handle.y}
                              width={handleSize}
                              height={handleSize}
                              rx={Math.max(1, handleSize * 0.25)}
                              fill="white"
                              stroke="var(--accent)"
                              strokeWidth={1.2}
                              style={{ cursor: handle.cursor }}
                              onMouseDown={(e) => startLabelTransform(e, lb, "resize")}
                            />
                          ))}
                        </>
                      )}
                    </g>
                    {isEditingLabel && (
                      <foreignObject
                        x={editorBounds.x}
                        y={editorBounds.y}
                        width={Math.min(editorBounds.width, Math.max(FP_W, 72))}
                        height={editorBounds.height}
                        data-testid="inline-label-editor"
                      >
                        <textarea
                          autoFocus
                          aria-label="Inline label text"
                          value={inlineLabelEdit.value}
                          onChange={(event) => {
                            inlineLabelBlurReadyRef.current = true;
                            const nextValue = event.target.value.replace(/[\r\n]+/g, " ");
                            setInlineLabelEdit((current) => current?.id === lb.id ? { ...current, value: nextValue } : current);
                          }}
                          onBlur={() => {
                            if (!inlineLabelBlurReadyRef.current) return;
                            commitInlineLabelEdit();
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitInlineLabelEdit();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelInlineLabelEdit();
                              event.currentTarget.blur();
                            }
                          }}
                          className="h-full w-full resize-none rounded-md border border-primary/60 bg-card/95 px-2 py-1 text-[11px] font-semibold text-foreground shadow-lg outline-none ring-2 ring-primary/25 caret-primary"
                          style={{
                            fontSize: `${Math.max(11, lb.fontSize)}px`,
                            color: lb.color,
                            whiteSpace: "pre",
                            overflowX: "auto",
                            overflowY: "hidden",
                            textAlign: lb.align ?? "left",
                          }}
                        />
                      </foreignObject>
                    )}
                  </g>
                );
              })}

              {/* Multi-selection group bounding outline */}
              {multiBounds && (() => {
                const hs = Math.max(5, Math.min(8, 7 / zoom));
                const x = multiBounds.x - 4;
                const y = multiBounds.y - 4;
                const w = multiBounds.w + 8;
                const h = multiBounds.h + 8;
                const handles = [
                  { id: "n", x: x + w / 2 - hs / 2, y: y - hs / 2, cursor: "ns-resize" },
                  { id: "s", x: x + w / 2 - hs / 2, y: y + h - hs / 2, cursor: "ns-resize" },
                  { id: "e", x: x + w - hs / 2, y: y + h / 2 - hs / 2, cursor: "ew-resize" },
                  { id: "w", x: x - hs / 2, y: y + h / 2 - hs / 2, cursor: "ew-resize" },
                  { id: "nw", x: x - hs / 2, y: y - hs / 2, cursor: "nwse-resize" },
                  { id: "ne", x: x + w - hs / 2, y: y - hs / 2, cursor: "nesw-resize" },
                  { id: "sw", x: x - hs / 2, y: y + h - hs / 2, cursor: "nesw-resize" },
                  { id: "se", x: x + w - hs / 2, y: y + h - hs / 2, cursor: "nwse-resize" },
                ];
                return (
                  <g>
                    <rect
                      data-testid="floor-group-outline"
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx={2}
                      fill="var(--accent)"
                      fillOpacity={0.04}
                      stroke="var(--accent)"
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                      className="pointer-events-none"
                    />
                    <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - 20 / zoom} stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 2" />
                    <circle data-testid="floor-group-rotate-handle" cx={x + w / 2} cy={y - 24 / zoom} r={Math.max(4, hs * 0.75)}
                      fill="white" stroke="var(--accent)" strokeWidth={1.4} style={{ cursor: "grab" }}
                      onMouseDown={(e) => startGroupTransform(e, "rotate")} />
                    {handles.map((handle) => (
                      <rect key={handle.id} data-testid="floor-group-resize-handle" data-corner={handle.id}
                        x={handle.x} y={handle.y} width={hs} height={hs} rx={1.5}
                        fill="white" stroke="var(--accent)" strokeWidth={1.2}
                        style={{ cursor: handle.cursor }}
                        onMouseDown={(e) => startGroupTransform(e, "resize", handle.id)} />
                    ))}
                  </g>
                );
              })()}

              {/* ═══ NAVIGATION CONNECTIONS ═══ */}
              {ADVANCED_FLOOR_REFERENCE_ENABLED && floor.calibration && (
                <g data-testid="floor-calibration-line" className="pointer-events-none">
                  <line
                    x1={floor.calibration.points[0].x}
                    y1={floor.calibration.points[0].y}
                    x2={floor.calibration.points[1].x}
                    y2={floor.calibration.points[1].y}
                    stroke="#2563eb"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                  <circle cx={floor.calibration.points[0].x} cy={floor.calibration.points[0].y} r={4} fill="#2563eb" stroke="white" strokeWidth={1.5} />
                  <circle cx={floor.calibration.points[1].x} cy={floor.calibration.points[1].y} r={4} fill="#2563eb" stroke="white" strokeWidth={1.5} />
                </g>
              )}

              {ADVANCED_FLOOR_REFERENCE_ENABLED && calibrationDraft.active && calibrationDraft.p1 && (
                <g data-testid="floor-calibration-draft-line" className="pointer-events-none">
                  <line
                    x1={calibrationDraft.p1.x}
                    y1={calibrationDraft.p1.y}
                    x2={(calibrationDraft.p2 ?? cursorPos ?? calibrationDraft.p1).x}
                    y2={(calibrationDraft.p2 ?? cursorPos ?? calibrationDraft.p1).y}
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                  <circle cx={calibrationDraft.p1.x} cy={calibrationDraft.p1.y} r={5} fill="var(--primary)" stroke="white" strokeWidth={1.5} />
                  {calibrationDraft.p2 && <circle cx={calibrationDraft.p2.x} cy={calibrationDraft.p2.y} r={5} fill="var(--primary)" stroke="white" strokeWidth={1.5} />}
                </g>
              )}

              {ADVANCED_FLOOR_REFERENCE_ENABLED && measureDraft.start && (
                <g data-testid="floor-measure-line" className="pointer-events-none">
                  <line
                    x1={measureDraft.start.x}
                    y1={measureDraft.start.y}
                    x2={(measureDraft.end ?? cursorPos ?? measureDraft.start).x}
                    y2={(measureDraft.end ?? cursorPos ?? measureDraft.start).y}
                    stroke="#16a34a"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                  <circle cx={measureDraft.start.x} cy={measureDraft.start.y} r={4} fill="#16a34a" stroke="white" strokeWidth={1.5} />
                  {measureDraft.end && <circle cx={measureDraft.end.x} cy={measureDraft.end.y} r={4} fill="#16a34a" stroke="white" strokeWidth={1.5} />}
                  {measureDraft.end && floor.calibration && (
                    <text
                      x={(measureDraft.start.x + measureDraft.end.x) / 2}
                      y={(measureDraft.start.y + measureDraft.end.y) / 2 - 8}
                      textAnchor="middle"
                      fill="#166534"
                      fontSize={8}
                      fontWeight={800}
                      stroke="white"
                      strokeWidth={2}
                      paintOrder="stroke fill"
                    >
                      {measureDistanceMeters(measureDraft.start, measureDraft.end, floor.calibration)?.toFixed(2)} m
                    </text>
                  )}
                </g>
              )}

              {/* ═══ DRAWING PREVIEWS ═══ */}
              {wallSnapIndicator && (
                <g data-testid="wall-snap-indicator" className="pointer-events-none">
                  {wallSnapIndicator.guide === "h" && (
                    <line
                      data-testid="wall-alignment-guide"
                      x1={0} y1={wallSnapIndicator.y} x2={FP_W} y2={wallSnapIndicator.y}
                      stroke="var(--primary)" strokeWidth={1} strokeDasharray="5 4" opacity={0.62}
                    />
                  )}
                  {wallSnapIndicator.guide === "v" && (
                    <line
                      data-testid="wall-alignment-guide"
                      x1={wallSnapIndicator.x} y1={0} x2={wallSnapIndicator.x} y2={FP_H}
                      stroke="var(--primary)" strokeWidth={1} strokeDasharray="5 4" opacity={0.62}
                    />
                  )}
                  {wallSnapIndicator.edge && (
                    <line
                      x1={wallSnapIndicator.edge.x1}
                      y1={wallSnapIndicator.edge.y1}
                      x2={wallSnapIndicator.edge.x2}
                      y2={wallSnapIndicator.edge.y2}
                      stroke="var(--primary)"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      opacity={0.45}
                    />
                  )}
                  <circle cx={wallSnapIndicator.x} cy={wallSnapIndicator.y} r={7} fill="none" stroke="var(--primary)" strokeWidth={1.5} opacity={0.75} />
                  <circle cx={wallSnapIndicator.x} cy={wallSnapIndicator.y} r={2.5} fill="var(--primary)" opacity={0.9} />
                </g>
              )}
              {/* Wall drawing preview — pointer-events-none so the completion click always reaches the svg background (real-browser hit-testing) */}
              {wallStart && wallPreview && (
                <g className="pointer-events-none" data-testid="wall-draw-preview">
                  <line x1={wallStart.x} y1={wallStart.y} x2={wallPreview.x} y2={wallPreview.y}
                    stroke="var(--primary)" strokeWidth={4} strokeLinecap="round"
                    strokeDasharray="6 3" opacity={0.7} />
                  <circle cx={wallStart.x} cy={wallStart.y} r={4} fill="var(--primary)" opacity={0.8} />
                  {(() => {
                    const label = wallLengthLabelPosition({ id: "preview", x1: wallStart.x, y1: wallStart.y, x2: wallPreview.x, y2: wallPreview.y, thickness: 4, color: "#000" });
                    return (
                      <text x={label.x} y={label.y}
                        transform={`rotate(${label.angle}, ${label.x}, ${label.y})`}
                        textAnchor="middle" fill="var(--primary)" fontSize={7} fontWeight="700"
                        className="pointer-events-none select-none">
                        {Math.round(dist(wallStart.x, wallStart.y, wallPreview.x, wallPreview.y))}
                      </text>
                    );
                  })()}
                </g>
              )}
              {/* Room/stairs/elevator drag preview — pointer-events-none so drawing clicks reach the svg background */}
              {roomDrag && (tool === "room" || tool === "stairs" || tool === "ramp" || tool === "elevator") && (() => {
                const rx = Math.min(roomDrag.sx, roomDrag.cx);
                const ry = Math.min(roomDrag.sy, roomDrag.cy);
                const rw = Math.abs(roomDrag.cx - roomDrag.sx);
                const rh = Math.abs(roomDrag.cy - roomDrag.sy);
                const color = tool === "stairs" ? "#9ca3af" : tool === "ramp" ? "#34d399" : tool === "elevator" ? "#86efac" : "var(--primary)";
                return (
                  <rect className="pointer-events-none" x={rx} y={ry} width={rw} height={rh} rx={2}
                    fill={color} fillOpacity={0.1}
                    stroke={color} strokeWidth={2} strokeDasharray="6 3" />
                );
              })()}
              {/* Drawing path — pointer-events-none so completion clicks reach the svg background */}
              {drawingPath.length > 0 && (
                <g className="pointer-events-none">
                  {drawingPath.length > 1 && <polyline points={drawingPath.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" strokeDasharray="8 4" opacity={0.9} />}
                  {drawingPath.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r={4} fill="var(--primary)" opacity={0.9} />)}
                </g>
              )}

              {/* ═══ INDOOR NAVIGATION LAYER (visible when overlay is ON) ═══ */}
              {navMode && (
                <g data-testid="floor-nav-layer">
                  {/* B5 correction: empty-space drag surface for the nav graph
                      group. Rendered BEFORE edges/nodes so they stay on top
                      (event priority: bend > node > edge > group interior).
                      The handler re-checks physical objects under the pointer
                      so rooms/doors/circulation keep their nav selection. */}
                  {navTool === "select" && navMultiSelected.length > 1 && (() => {
                    const nodeIds = new Set(navMultiSelected.filter((id) => indoorNodes.some((n) => n.id === id && !n.roomId)));
                    const edgeIds = new Set(navMultiSelected.filter((id) => walkableIndoorEdges.some((e) => e.id === id)));
                    if (nodeIds.size === 0 && edgeIds.size === 0) return null;
                    const bounds = navGroupSelectionBounds(indoorNodes, walkableIndoorEdges, nodeIds, edgeIds);
                    if (!bounds) return null;
                    return (
                      <rect
                        data-testid="floor-nav-group-drag-surface"
                        x={bounds.x}
                        y={bounds.y}
                        width={bounds.width}
                        height={bounds.height}
                        rx={2}
                        fill="transparent"
                        stroke="none"
                        style={{ cursor: "move", pointerEvents: "fill" }}
                        onMouseDown={(e) => handleNavGroupSurfaceDown(e)}
                      />
                    );
                  })()}
                  {/* Edges — geometry derived from node positions, drawn under nodes */}
                  {walkableIndoorEdges.map((edge) => {
                    const a = indoorNodes.find((n) => n.id === edge.startNodeId);
                    const b = indoorNodes.find((n) => n.id === edge.endNodeId);
                    if (!a || !b) return null;
                    // B5 Phase 2.5: optional authored bends turn the edge into a
                    // polyline (orthogonal hallway routing). Endpoints always come
                    // from the nodes; bends are absolute geometry-only points.
                    const pts = edgePolylinePoints(edge, indoorNodes) ?? [];
                    const poly = pts.length > 2;
                    const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                    const isSel = (navSelected?.type === "edge" && navSelected.id === edge.id) || navMultiSelected.includes(edge.id);
                    const closed = edge.closed === true;
                    // B5 Phase 2.11: an existing edge that currently crosses /
                    // overlaps a wall (strict Phase 2.10 model) renders RED so an
                    // invalid authoring state is never mistaken for a fine path.
                    const invalid = navBlockedEdgeIds.has(edge.id);
                    const mid = navEdgeMidpoint(pts.length > 1 ? pts : [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
                    const midX = mid.x;
                    const midY = mid.y;
                    const edgeStroke = closed ? "#b45309" : invalid ? "#dc2626" : isSel ? "var(--accent)" : "#3f6212";
                    const connectPathHover = navTool === "connect"
                      && !!navConnectStart
                      && !navNodeHover
                      && navPathTargetHover?.edgeId === edge.id
                      && isManualIndoorWalkingEdge(edge, indoorNodes)
                      && pts[navPathTargetHover.index]
                      && pts[navPathTargetHover.index + 1];
                    return (
                      <g key={edge.id}>
                        {poly ? (
                          <polyline points={pointsStr} fill="none" stroke={edgeStroke}
                            strokeWidth={isSel ? 2.4 : 1.6}
                            strokeDasharray={closed ? "5 3" : undefined}
                            strokeLinejoin="round" strokeLinecap="round"
                            opacity={closed ? 0.75 : 0.9}
                            data-invalid={invalid ? "true" : undefined}
                            data-testid={isSel ? "nav-edge-selected" : "nav-edge"}
                            className="pointer-events-none" />
                        ) : (
                          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                            stroke={edgeStroke}
                            strokeWidth={isSel ? 2.4 : 1.6}
                            strokeDasharray={closed ? "5 3" : undefined}
                            opacity={closed ? 0.75 : 0.9}
                            data-invalid={invalid ? "true" : undefined}
                            data-testid={isSel ? "nav-edge-selected" : "nav-edge"}
                            className="pointer-events-none" />
                        )}
                        {connectPathHover && (() => {
                          const i = navPathTargetHover!.index;
                          const p = pts[i];
                          const q = pts[i + 1];
                          const join = navPathTargetHover!.point;
                          return (
                            <g className="pointer-events-none" data-testid="nav-connect-path-target">
                              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                                stroke="#f59e0b" strokeWidth={4} opacity={0.82}
                                strokeDasharray="6 3" strokeLinecap="round" />
                              <circle cx={join.x} cy={join.y} r={5}
                                fill="rgba(245,158,11,0.18)" stroke="#f59e0b"
                                strokeWidth={1.7} strokeDasharray="2 2" />
                              <circle cx={join.x} cy={join.y} r={1.8} fill="#f59e0b" />
                              <text x={join.x + 8} y={join.y - 8} fill="#b45309"
                                fontSize={6.5} fontWeight={700}
                                stroke="rgba(255,255,255,0.92)" strokeWidth={1.8}
                                paintOrder="stroke" data-testid="nav-connect-path-hint">
                                Click to connect to path
                              </text>
                            </g>
                          );
                        })()}
                        {edge.bidirectional === false && (() => {
                          // Direction arrow anchored at the polyline midpoint and
                          // oriented along the segment that contains it.
                          let ang = Math.atan2(b.y - a.y, b.x - a.x);
                          if (pts.length > 2) {
                            let acc = 0;
                            const total = navEdgePolylineDistance(pts);
                            const target = total / 2;
                            for (let i = 1; i < pts.length; i++) {
                              const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                              if (target <= acc + seg || i === pts.length - 1) {
                                ang = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
                                break;
                              }
                              acc += seg;
                            }
                          }
                          const size = 4;
                          const back = { x: midX - Math.cos(ang) * size * 1.6, y: midY - Math.sin(ang) * size * 1.6 };
                          const p1 = { x: back.x + Math.cos(ang + 2.6) * size, y: back.y + Math.sin(ang + 2.6) * size };
                          const p2 = { x: back.x + Math.cos(ang - 2.6) * size, y: back.y + Math.sin(ang - 2.6) * size };
                          return (
                            <path d={`M ${midX} ${midY} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`}
                              fill={closed ? "#b45309" : invalid ? "#dc2626" : "#3f6212"} opacity={0.9} data-testid="nav-edge-direction" className="pointer-events-none" />
                          );
                        })()}
                        {/* B5 Phase 2.11: selected INVALID edge — small warning
                            marker near the path midpoint; the edge stays fully
                            editable (bend/segment handles + drags remain live). */}
                        {isSel && invalid && (
                          <g transform={`translate(${midX + 10} ${midY - 10})`} data-testid="nav-edge-invalid-marker" className="pointer-events-none">
                            <path d="M 0 -4.5 L 4 3.5 L -4 3.5 Z" fill="#dc2626" />
                            <line x1={0} y1={-1.6} x2={0} y2={1.4} stroke="#fff" strokeWidth={1.1} />
                            <circle cx={0} cy={2.8} r={0.7} fill="#fff" />
                          </g>
                        )}
                        {/* B5 Phase 2.2: transparent hit line (the visible stroke is
                            pointer-events-none) with an erase-aware cursor + destructive hover. */}
                        {poly ? (
                          <polyline points={pointsStr} fill="none" stroke="transparent" strokeWidth={14}
                            onMouseDown={(e) => handleNavEdgeDown(e, edge)}
                            onMouseMove={(e) => handleNavEdgeMove(e, edge)}
                            onMouseEnter={() => { if (navTool === "erase") setNavEraseHover({ type: "edge", id: edge.id }); }}
                            onMouseLeave={() => {
                              setNavEraseHover((h) => h?.type === "edge" && h.id === edge.id ? null : h);
                              setNavSegmentHover((h) => (h?.edgeId === edge.id ? null : h));
                              setNavPathTargetHover((h) => (h?.edgeId === edge.id ? null : h));
                            }}
                            style={{ cursor: navTool === "erase" ? "not-allowed" : "pointer" }} data-testid="nav-edge-hit" />
                        ) : (
                          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14}
                            onMouseDown={(e) => handleNavEdgeDown(e, edge)}
                            onMouseMove={(e) => handleNavEdgeMove(e, edge)}
                            onMouseEnter={() => { if (navTool === "erase") setNavEraseHover({ type: "edge", id: edge.id }); }}
                            onMouseLeave={() => {
                              setNavEraseHover((h) => h?.type === "edge" && h.id === edge.id ? null : h);
                              setNavSegmentHover((h) => (h?.edgeId === edge.id ? null : h));
                              setNavPathTargetHover((h) => (h?.edgeId === edge.id ? null : h));
                            }}
                            style={{ cursor: navTool === "erase" ? "not-allowed" : "pointer" }} data-testid="nav-edge-hit" />
                        )}
                        {navEraseHover?.type === "edge" && navEraseHover.id === edge.id && (
                          poly ? (
                            <polyline points={pointsStr} fill="none" stroke="#dc2626" strokeWidth={3}
                              strokeDasharray="4 3" opacity={0.9} className="pointer-events-none" data-testid="nav-edge-erase-hover" />
                          ) : (
                            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dc2626" strokeWidth={3}
                              strokeDasharray="4 3" opacity={0.9} className="pointer-events-none" data-testid="nav-edge-erase-hover" />
                          )
                        )}
                        {/* B5 Phase 2.5: bend handles on the SELECTED segmented path —
                            drag a handle to reshape live (ONE history action on release).
                            B5 Phase 2.6: each bend is INDEPENDENTLY selectable; the
                            selected handle renders larger/highlighted so Remove Bend /
                            Delete target exactly that bend. */}
                        {isSel && navTool === "select" && edge.bendPoints && edge.bendPoints.length > 0 && edge.bendPoints.map((bp, i) => {
                          const bendSel = navSelectedBend?.edgeId === edge.id && navSelectedBend.index === i;
                          return (
                            <g key={i}
                              onMouseDown={(e) => handleNavBendDown(e, edge, i)}
                              className="cursor-grab"
                              data-testid="nav-bend-handle"
                            >
                              <circle cx={bp.x} cy={bp.y} r={7} fill="transparent" />
                              <circle cx={bp.x} cy={bp.y} r={bendSel ? 4.2 : 3.2}
                                fill="var(--accent)"
                                stroke="#f8fafc" strokeWidth={bendSel ? 1.6 : 1}
                                data-testid={bendSel ? "nav-bend-selected" : undefined}
                                className="pointer-events-none" />
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Nodes — free waypoints get the graph-node visual; linked nodes
                      (room/door/stair/elevator/ramp) stay as a small cue over the
                      physical object, mirroring the outdoor entrance philosophy. */}
                  {indoorNodes.map((node) => {
                    const ref = linkedObjectRef(node);
                    const isLinked = !!ref;
                    const isStairLinked = ref?.kind === "stairs";
                    // The Room itself is the visible navigation anchor. Keep
                    // the canonical linked node for graph identity and Connect
                    // targeting, but never paint a duplicate waypoint over it.
                    if (node.roomId) return null;
                    const isSel = navSelected?.type === "node" && navSelected.id === node.id;
                    const isMulti = navMultiSelected.includes(node.id);
                    const isConnectStart = navConnectStart === node.id;
                    const isDest = !isLinked && node.type === "room_access";
                    const isInternalJunction = !isLinked && node.pathJunction === true;
                    const isEraseHover = navEraseHover?.type === "node" && navEraseHover.id === node.id;
                    const isDuplicateWarn = navDuplicateNodeId === node.id;
                    // Path-inserted points are real canonical graph nodes, but
                    // they are implementation junctions rather than user-named
                    // waypoints. Keep them selectable/debuggable while using a
                    // compact visual and no large "Waypoint" label.
                    const label = ((node.name || "Walking Point").trim() === "Path Junction"
                      ? "Waypoint"
                      : (node.name || "Walking Point").trim());
                    const showLabel = !isLinked && !isInternalJunction && label && label !== "Walking Point";
                    // B5 Phase 2.7: the linked routing cue ALWAYS renders at the
                    // node's LOGICAL anchor (node.x/node.y — synced to the owner:
                    // room anchor, door position, or stair entry edge). For ramps
                    // the anchor is the exact center; only a tiny presentation-only
                    // corner badge marks "linked" (never a routing location).
                    const rampOwner = node.rampId ? ramps.find((r) => r.id === node.rampId) : null;
                    const cue = { x: node.x, y: node.y };
                    const stairTransitionLinked = isStairLinked && (() => {
                      const transition = navNodeTransitionStatus.get(node.id);
                      return transition?.state === "linked" && transition.floors.length > 0;
                    })();
                    return (
                      <g key={node.id}
                        data-testid={isLinked ? "nav-linked-node" : isInternalJunction ? "nav-path-junction" : "nav-node"}
                        onMouseDown={(e) => handleNavNodeDown(e, node)}
                        onMouseEnter={() => {
                          if (navTool === "erase") setNavEraseHover({ type: "node", id: node.id });
                          if (navTool === "connect") setNavNodeHover(node.id);
                        }}
                        onMouseLeave={() => {
                          setNavEraseHover((h) => h?.type === "node" && h.id === node.id ? null : h);
                          setNavNodeHover((h) => (h === node.id ? null : h));
                        }}
                        style={{ cursor: navTool === "erase" ? "not-allowed" : navTool === "connect" ? "pointer" : isLinked ? "pointer" : isDest ? "move" : "grab" }}
                      >
                        {/* B5 Phase 2.2: invisible hit target — the visible node art is
                            pointer-events-none (it must not capture hover/click on the
                            physical object underneath), so a transparent circle is the
                            actual click/drag surface. This is the click-selection fix. */}
                        <circle cx={cue.x} cy={cue.y} r={11} fill="transparent"
                          data-testid="nav-node-hit"
                          style={{ pointerEvents: isLinked && navTool === "select" ? "none" : undefined }} />
                        {isLinked ? (
                          // B5 Phase 2.7: the actual routing node stays VISIBLE even
                          // while the violet Connect ring surrounds it — the ring is
                          // feedback around the node, never a replacement for it.
                          <g className="pointer-events-none">
                            {isStairLinked ? (
                              <g data-testid={stairTransitionLinked ? "nav-transition-badge" : "nav-stair-access-marker"}>
                                <rect x={cue.x - 4} y={cue.y - 4} width={8} height={8} rx={2} fill="#64748b" stroke="#f8fafc" strokeWidth={1} />
                                <circle cx={cue.x} cy={cue.y} r={1.2} fill="#f8fafc" />
                              </g>
                            ) : (
                              <circle cx={cue.x} cy={cue.y} r={4} fill="rgba(21,128,61,0.85)" data-testid="nav-linked-cue" />
                            )}
                            <circle cx={cue.x} cy={cue.y} r={6.5} fill="none"
                              stroke={isSel || isMulti ? "var(--accent)" : "rgba(21,128,61,0.45)"}
                              strokeWidth={isSel || isMulti ? 1.8 : 1} />
                          </g>
                        ) : isDest ? (
                          /* B5 Phase 2.2: Destination — a compact target/pin so it is
                             genuinely distinct from a technical routing Waypoint. */
                          <g className="pointer-events-none">
                            <circle cx={node.x} cy={node.y} r={5}
                              fill={isSel || isMulti ? "var(--accent)" : "#7c3aed"}
                              stroke="#f8fafc" strokeWidth={1.2} />
                            <circle cx={node.x} cy={node.y} r={1.8} fill="#f8fafc" />
                            {(isSel || isMulti) && (
                              <circle cx={node.x} cy={node.y} r={8} fill="none"
                                stroke="var(--accent)" strokeWidth={1.6} data-testid="nav-node-selected" />
                            )}
                            {isConnectStart && (
                              <circle cx={node.x} cy={node.y} r={10.5} fill="none"
                                stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="3 2" data-testid="nav-connect-start" />
                            )}
                          </g>
                        ) : (
                          <g className="pointer-events-none">
                            <circle cx={node.x} cy={node.y} r={isInternalJunction ? 3.2 : 4.5}
                              fill={isSel || isMulti ? "var(--accent)" : isInternalJunction ? "#d97706" : "#16a34a"}
                              stroke="#f8fafc" strokeWidth={isInternalJunction ? 0.8 : 1} />
                            {(isSel || isMulti) && (
                              <circle cx={node.x} cy={node.y} r={isInternalJunction ? 6 : 7.5} fill="none"
                                stroke="var(--accent)" strokeWidth={1.6} data-testid="nav-node-selected" />
                            )}
                            {isConnectStart && (
                              <circle cx={node.x} cy={node.y} r={10} fill="none"
                                stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="3 2" data-testid="nav-connect-start" />
                            )}
                            {showLabel && (
                              <g className="pointer-events-none select-none">
                                <text x={node.x} y={node.y + 15} textAnchor="middle" fontSize={5.5}
                                  fill="#1f2937" fontWeight={600} stroke="rgba(255,255,255,0.92)"
                                  strokeWidth={1.8} paintOrder="stroke" strokeLinejoin="round">
                                  {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                                </text>
                              </g>
                            )}
                          </g>
                        )}
                        {/* B5 Phase 3: subtle cross-floor transition indicator for a
                            linked circulation node with floor-to-floor links — a
                            small neutral up/down chevron badge (never a waypoint,
                            never a routing location; the node stays the anchor). */}
                        {isLinked && !isStairLinked && (() => {
                          const t = navNodeTransitionStatus.get(node.id);
                          if (!t || t.state !== "linked" || t.floors.length === 0) return null;
                          return (
                            <g className="pointer-events-none" data-testid="nav-transition-badge">
                              <rect x={cue.x - 5} y={cue.y - 14.5} width={10} height={8} rx={2} fill="#475569" opacity={0.92} />
                              <path d={`M ${cue.x - 3} ${cue.y - 11.6} L ${cue.x} ${cue.y - 14.1} L ${cue.x + 3} ${cue.y - 11.6} Z`} fill="#f8fafc" />
                              <path d={`M ${cue.x - 3} ${cue.y - 9.2} L ${cue.x} ${cue.y - 6.7} L ${cue.x + 3} ${cue.y - 9.2} Z`} fill="#f8fafc" />
                            </g>
                          );
                        })()}
                        {/* B5 Phase 2.7: tiny presentation-only "linked" badge for
                            ramps (top-right corner) — NEVER a routing location; the
                            actual node/cue sits at the ramp center. */}
                        {rampOwner && (
                          <circle cx={rampLinkedCuePosition(rampOwner).x} cy={rampLinkedCuePosition(rampOwner).y}
                            r={1.6} fill="rgba(21,128,61,0.9)" className="pointer-events-none" data-testid="nav-linked-badge" />
                        )}
                        {/* B5 Phase 2.2: Remove tool destructive hover — one red ring. */}
                        {isEraseHover && (
                          <circle cx={cue.x} cy={cue.y} r={12} fill="none"
                            stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3"
                            className="pointer-events-none" data-testid="nav-erase-hover" />
                        )}
                        {isDuplicateWarn && (
                          <circle cx={cue.x} cy={cue.y} r={14} fill="none"
                            stroke="#f59e0b" strokeWidth={2.2} strokeDasharray="3 2"
                            className="pointer-events-none animate-pulse" data-testid="nav-duplicate-node-warning" />
                        )}
                        {/* B5 Phase 2.6: Connect tool target feedback — one clean
                            ring on the hovered candidate; stronger once a start has
                            been chosen. Never stacked with the start/selected rings. */}
                        {navTool === "connect" && navNodeHover === node.id && !isConnectStart && !isSel && !isMulti && (
                          <circle cx={cue.x} cy={cue.y} r={navConnectStart ? 12 : 9} fill="none"
                            stroke={navConnectStart ? "var(--accent)" : "#7c3aed"}
                            strokeWidth={navConnectStart ? 2 : 1.4}
                            strokeDasharray={navConnectStart ? undefined : "3 2"}
                            className="pointer-events-none" data-testid="nav-connect-target" />
                        )}
                      </g>
                    );
                  })}

                  {/* Authoring target highlight (rooms / doors / circulation) —
                      while CONNECT is active the routing NODE is the target (violet
                      ring on the semantic node/cue), so the yellow physical-object
                      highlight is suppressed to avoid yellow/violet competition. */}
                  {navTargetHover && (navTool === "waypoint" || navTool === "destination" || navTool === "connect" || navTool === "link" || navLibraryDragRef.current != null) && !navNodeHover && !(navTool === "connect" && navTargetHasLinkedNode && navTargetHover.kind !== "room") && (
                    <g className="pointer-events-none" data-testid="floor-nav-target">
                      <circle cx={navTargetHover.x} cy={navTargetHover.y} r={12} fill="none"
                        stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="4 3" />
                      <circle cx={navTargetHover.x} cy={navTargetHover.y} r={2.5} fill="var(--accent)" />
                    </g>
                  )}

                  {/* B5 Phase 2.8: always-on alignment guides while a free node /
                      bend drags near another routing node's X or Y center. */}
                  {navAlignGuides.map((guide, i) => (
                    <line key={i} data-testid="nav-align-guide"
                      x1={guide.type === "v" ? guide.pos : 0} y1={guide.type === "v" ? 0 : guide.pos}
                      x2={guide.type === "v" ? guide.pos : FP_W} y2={guide.type === "v" ? FP_H : guide.pos}
                      stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 3"
                      opacity={0.7} className="pointer-events-none" />
                  ))}


                  {/* Connect preview — dashed line + ghost node showing the FINAL
                      shape (pinned bends + the auto-orthogonal tail to the pointer
                      or hovered node — same resolved geometry as the commit). Each
                      pinned bend renders a small square marker. pointer-events-none.

                      B5 Phase 2.9A: the SAME wall validation the commit uses runs
                      here, so a preview that cannot be committed (wall crossing /
                      wall-hug / clearance violation) is shown in RED BEFORE the
                      click — the already-pinned geometry keeps its normal styling
                      and only the invalid proposed tail portion turns red, with a
                      small "Path blocked by wall" label near the target. */}
                  {navConnectStart && navPreview && (() => {
                    const start = indoorNodes.find((n) => n.id === navConnectStart);
                    if (!start) return null;
                    const hoveredNode = navNodeHover ? indoorNodes.find((n) => n.id === navNodeHover) : null;
                    const dest = hoveredNode
                      ? { x: hoveredNode.x, y: hoveredNode.y }
                      : navTargetHover ? { x: navTargetHover.x, y: navTargetHover.y } : navPreview;
                    const last = navConnectBends.length > 0
                      ? navConnectBends[navConnectBends.length - 1]
                      : { x: start.x, y: start.y };
                    // B5 Phase 2.10: the preview must show EXACTLY what a click
                    // would pin/commit. For the RAW-pointer target the SAME
                    // pin-geometry helper the click uses resolves the shape
                    // (alignment-snapped, wall validity winning, detours kept in
                    // floor bounds) — geometry AND validity can never diverge.
                    // Nodes / linked targets resolve the plain auto-L (a linked
                    // anchor legitimately sits on a wall, so no point check).
                    let proposed: { x: number; y: number }[];
                    if (!hoveredNode && !navTargetHover) {
                      const geo = navPinGeometryFor(
                        { x: dest.x, y: dest.y }, last, indoorNodes, walls, doors,
                        { width: FP_W, height: FP_H }
                      );
                      proposed = geo.pins;
                    } else {
                      const tail = orthogonalBendsFor(last, { x: dest.x, y: dest.y }, walls, doors, { width: FP_W, height: FP_H });
                      proposed = [...tail, { x: dest.x, y: dest.y }];
                    }
                    const ringPos = proposed[proposed.length - 1];
                    const pts = [{ x: start.x, y: start.y }, ...navConnectBends, ...proposed];
                    // Exact same validation as the pin-click / commit — preview
                    // can only look committable when it actually is committable:
                    // segment wall-validity PLUS every proposed point itself (a
                    // pointer resting on a wall — or an auto-L corner inside one
                    // — must preview RED; the click will be rejected). Nodes /
                    // linked targets are exempt — a linked anchor legitimately
                    // sits on a wall/doorway.
                    const invalid = edgePolylineCrossesWallWithoutDoor([last, ...proposed], walls, doors) !== null
                      || (!hoveredNode && !navTargetHover && proposed.some((p) => pointInsideWallObstacle(p, walls, doors) !== null));
                    const tailPts = invalid
                      ? [{ x: last.x, y: last.y }, ...proposed]
                      : null;
                    return (
                      <g className="pointer-events-none" data-testid="floor-nav-connect-preview">
                        {/* FULL preview — single source of truth for the shape. */}
                        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
                          stroke={invalid ? "#dc2626" : "var(--accent)"} strokeWidth={1.6}
                          strokeDasharray="5 4" opacity={0.85}
                          data-testid={invalid ? "floor-nav-preview-invalid-line" : undefined} />
                        {navConnectBends.map((bp, i) => (
                          /* B5 Phase 2.9: a subtle neutral geometry-edit marker —
                             never confusable with a green Waypoint, violet
                             Destination, linked-location cue, or the violet
                             connect-target ring. */
                          <rect key={i} x={bp.x - 1.75} y={bp.y - 1.75} width={3.5} height={3.5} rx={0.75}
                            fill="none" stroke="var(--muted-foreground)" strokeWidth={1.1} opacity={0.85}
                            data-testid="nav-connect-pin" />
                        ))}
                        <circle cx={ringPos.x} cy={ringPos.y} r={invalid ? 5.5 : 5} fill="none"
                          stroke={invalid ? "#dc2626" : "var(--accent)"}
                          strokeWidth={invalid ? 1.6 : 1.4} strokeDasharray="2 2"
                          data-testid={invalid ? "floor-nav-preview-invalid-ring" : undefined} />
                        {/* B5 Phase 2.9A: invalid proposed portion — red overdraw on
                            the tail only, plus a concise label near the target.
                            Already-valid pinned geometry keeps its normal look. */}
                        {tailPts && (
                          <g data-testid="floor-nav-preview-invalid">
                            <polyline points={tailPts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
                              stroke="#dc2626" strokeWidth={1.8} strokeDasharray="5 4" opacity={0.95} />
                            <text x={ringPos.x + 8} y={ringPos.y - 10} fontSize={9} fontWeight={700} fill="#dc2626"
                              stroke="rgba(255,255,255,0.9)" strokeWidth={3} paintOrder="stroke"
                              className="select-none">Path blocked by wall</text>
                          </g>
                        )}
                      </g>
                    );
                  })()}

                  {/* B5 Phase 2.1: Navigation Library drag ghost preview (free items) */}
                  {navDragPreview && (
                    <g className="pointer-events-none" data-testid="floor-nav-drag-preview">
                      <circle cx={navDragPreview.x} cy={navDragPreview.y} r={6} fill="rgba(22,163,74,0.3)" stroke="#16a34a" strokeWidth={1.4} strokeDasharray="3 2" />
                    </g>
                  )}
                  {/* B5 Phase 2.3: not-allowed drag feedback over linked-location
                      semantic targets — no green ghost, a red ✕ instead. */}
                  {navDragBlocked && (
                    <g className="pointer-events-none" data-testid="floor-nav-drag-blocked">
                      <circle cx={navDragBlocked.x} cy={navDragBlocked.y} r={7} fill="none" stroke="#dc2626" strokeWidth={1.6} strokeDasharray="3 2" />
                      <line x1={navDragBlocked.x - 3.5} y1={navDragBlocked.y - 3.5} x2={navDragBlocked.x + 3.5} y2={navDragBlocked.y + 3.5} stroke="#dc2626" strokeWidth={1.6} />
                      <line x1={navDragBlocked.x - 3.5} y1={navDragBlocked.y + 3.5} x2={navDragBlocked.x + 3.5} y2={navDragBlocked.y - 3.5} stroke="#dc2626" strokeWidth={1.6} />
                    </g>
                  )}
                  {/* B5 correction: nav graph multi-select group outline — bounds
                      from the actual selected graph geometry (node coords + bends
                      of edges whose both endpoints are selected), so the frame
                      communicates the whole substructure moves together. */}
                  {navMultiSelected.length > 1 && (() => {
                    const nodeIds = new Set(navMultiSelected.filter((id) => indoorNodes.some((n) => n.id === id && !n.roomId)));
                    const edgeIds = new Set(navMultiSelected.filter((id) => walkableIndoorEdges.some((e) => e.id === id)));
                    if (nodeIds.size === 0 && edgeIds.size === 0) return null;
                    const bounds = navGroupSelectionBounds(indoorNodes, walkableIndoorEdges, nodeIds, edgeIds);
                    if (!bounds) return null;
                    return (
                      <g className="pointer-events-none" data-testid="floor-nav-group-outline">
                        <rect
                          x={bounds.x}
                          y={bounds.y}
                          width={bounds.width}
                          height={bounds.height}
                          rx={2}
                          fill="var(--accent)"
                          fillOpacity={0.04}
                          stroke="var(--accent)"
                          strokeWidth={1.2}
                          strokeDasharray="4 3"
                        />
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* Outdoor-style alignment guides (yellow/orange dashed) for move/resize/place.
                  Rendered OUTSIDE the navMode block so they show in both design and navigation modes. */}
              {compactAlignmentGuides(alignGuides).map((guide, i) => {
                const isV = guide.type === "v";
                const y1 = isV ? 0 : guide.pos;
                const y2 = isV ? FP_H : guide.pos;
                const x1 = isV ? guide.pos : 0;
                const x2 = isV ? guide.pos : FP_W;
                return (
                  <g key={`ra-${i}`} className="pointer-events-none">
                    <line data-testid="room-align-guide"
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="var(--accent)" strokeWidth={8} opacity={0.15} />
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
                    <rect x={isV ? guide.pos - 16 : FP_W - 36} y={isV ? 6 : guide.pos - 7}
                      width={32} height={14} rx={3} fill="var(--accent)" fillOpacity={0.85} />
                    <text x={isV ? guide.pos : FP_W - 20} y={isV ? 15 : guide.pos + 4}
                      textAnchor="middle" fill="white" fontSize={8} fontWeight="800"
                      className="pointer-events-none select-none">{Math.round(guide.pos)}</text>
                  </g>
                );
              })}

              {/* B5 Phase 2.5: Design-mode READ-ONLY navigation overlay — shown
                  only while "Show Navigation" is on. Reduced opacity, thinner
                  lines, smaller nodes; pointer-events-none so Design Select keeps
                  editing ONLY floor objects (graph is not selectable/movable). */}
              {!navMode && showNavOverlay && !routePreview && (indoorNodes.length > 0 || indoorEdges.length > 0) && (
                <g data-testid="floor-nav-overlay" className="pointer-events-none">
                  {walkableIndoorEdges.map((edge) => {
                    const pts = edgePolylinePoints(edge, indoorNodes);
                    if (!pts || pts.length < 2) return null;
                    // B5 Phase 2.11: the read-only overlay also flags an invalid
                    // (wall-blocked) edge — subdued red — so the problem is not
                    // hidden outside Navigation mode (reuses the live memo).
                    const invalid = navBlockedEdgeIds.has(edge.id);
                    const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                    return pts.length > 2
                      ? <polyline key={edge.id} points={pointsStr} fill="none" stroke={invalid ? "#dc2626" : "#3f6212"} strokeWidth={1} opacity={invalid ? 0.55 : 0.4} data-invalid={invalid ? "true" : undefined} />
                      : <line key={edge.id} x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={invalid ? "#dc2626" : "#3f6212"} strokeWidth={1} opacity={invalid ? 0.55 : 0.4} data-invalid={invalid ? "true" : undefined} />;
                  })}
                  {indoorNodes.map((node) => {
                    // B5 Phase 2.6: the read-only overlay keeps SEMANTIC colors
                    // (Waypoint green, Destination violet, linked-location cues)
                    // — just subdued, so the graph still communicates what each
                    // element is while staying a reference-only view.
                    const isLinked = !!linkedObjectRef(node);
                    // Room destinations are represented by their physical Room
                    // marker, not a second generic marker in the overlay.
                    if (node.roomId) return null;
                    const isDest = !isLinked && node.type === "room_access";
                    return (
                      <circle key={node.id} cx={node.x} cy={node.y} r={isDest ? 2.6 : 2.2}
                        fill={isLinked ? "rgba(21,128,61,0.7)" : isDest ? "rgba(124,58,237,0.65)" : "rgba(22,163,74,0.55)"} />
                    );
                  })}
                </g>
              )}

              {/* B5 Phase 6.5: floor waypoint-on-edge insertion indicator */}
              {floorEdgeSnap && (
                <g className="pointer-events-none" data-testid="floor-edge-snap-indicator">
                  <circle cx={floorEdgeSnap.nearest.x} cy={floorEdgeSnap.nearest.y} r={5}
                    fill="none" stroke="var(--accent)" strokeWidth={1.6}
                    strokeDasharray="3 2" opacity={0.9} />
                  <line
                    x1={floorEdgeSnap.nearest.x - 4} y1={floorEdgeSnap.nearest.y}
                    x2={floorEdgeSnap.nearest.x + 4} y2={floorEdgeSnap.nearest.y}
                    stroke="var(--accent)" strokeWidth={1.2} opacity={0.7} />
                  <line
                    x1={floorEdgeSnap.nearest.x} y1={floorEdgeSnap.nearest.y - 4}
                    x2={floorEdgeSnap.nearest.x} y2={floorEdgeSnap.nearest.y + 4}
                    stroke="var(--accent)" strokeWidth={1.2} opacity={0.7} />
                </g>
              )}

              {rubberBand && (() => {
                const rx = Math.min(rubberBand.sx, rubberBand.cx);
                const ry = Math.min(rubberBand.sy, rubberBand.cy);
                const rw = Math.abs(rubberBand.cx - rubberBand.sx);
                const rh = Math.abs(rubberBand.cy - rubberBand.sy);
                return (
                  <rect
                    data-testid="floor-marquee-selection"
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill="var(--primary)"
                    fillOpacity={0.08}
                    stroke="var(--primary)"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                );
              })()}

              {/* ── B7 Phase 1: validation issue markers — one small badge per
                  affected object, derived live from the same issue list the
                  Issues panel shows. Warnings stay amber, errors stay red; the
                  layer is pointer-events-none and clipped to the floor so it
                  never intercepts canvas interactions or spills outside. ── */}
              {!routePreview && floorIssueMarkers.size > 0 && (
                <g className="pointer-events-none" data-testid="issue-marker-layer">
                  {Array.from(floorIssueMarkers.values()).map(({ severity, selection }) => {
                    const anchor = floorMarkerAnchor(selection);
                    if (!anchor) return null;
                    const bg = severity === "error" ? "#fef2f2" : "#fef3c7";
                    const fg = severity === "error" ? "#b91c1c" : "#b45309";
                    const stroke = severity === "error" ? "#dc2626" : "#d97706";
                    return (
                      <g
                        key={`${selection.type}:${selection.id}`}
                        data-testid="issue-marker"
                        data-issue-object={`${selection.type}:${selection.id}`}
                        data-issue-severity={severity}
                        className="pointer-events-auto cursor-pointer"
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          setNavSelected(null);
                          setNavMultiSelected([]);
                          if (selection.type === "navNode") {
                            setSelected(null);
                            setNavPhysicalSelected(null);
                            setNavSelected({ type: "node", id: selection.id });
                            setShowNavOverlay(true);
                            setNavTool("select");
                            setShowProperties(true);
                          } else if (selection.type === "navEdge") {
                            setSelected(null);
                            setNavPhysicalSelected(null);
                            setNavSelected({ type: "edge", id: selection.id });
                            setShowNavOverlay(true);
                            setNavTool("select");
                            setShowProperties(true);
                          } else if (showNavOverlay && (selection.type === "room" || selection.type === "door" || selection.type === "stairs" || selection.type === "elevator" || selection.type === "ramp")) {
                            // Issue markers target the physical object, even
                            // with Navigation visible, so the full Door/Room
                            // inspector (including physical controls) opens.
                            selectFloorItem(selection);
                          } else {
                            selectFloorItem(selection);
                          }
                        }}
                      >
                        {/* Subtle warning badge — small pill with ⚠ icon */}
                        <circle cx={anchor.x} cy={anchor.y} r={6.5} fill={bg} stroke={stroke} strokeWidth={1.1} opacity={0.95} />
                        <text x={anchor.x} y={anchor.y + 3} textAnchor="middle" fill={fg} fontSize={8} fontWeight="900">⚠</text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Ready cues live in the final overlay layer so walls, floor
                  boundaries, and room artwork can never cover the badge. */}
              {Array.from(roomNavigationCueStatus.entries()).map(([roomId, state]) => {
                if (state !== "ready") return null;
                const anchor = floorMarkerAnchor({ type: "room", id: roomId });
                if (!anchor) return null;
                return (
                  <g key={`room-ready-${roomId}`} data-testid="room-navigation-status-cue"
                    data-room-nav-state="ready" className="pointer-events-none">
                    <circle cx={anchor.x} cy={anchor.y} r={4.5} fill="#16a34a" stroke="#fff" strokeWidth={1} opacity={0.98} />
                    <path d={`M${anchor.x - 2} ${anchor.y} L${anchor.x - 0.5} ${anchor.y + 1.5} L${anchor.x + 2.5} ${anchor.y - 2}`}
                      stroke="#fff" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                );
              })}

              {/* Route controls are the final world-space layer so physical and
                  navigation hit targets cannot cover a transition marker. */}
              {highlightedRoute && (
                <>
                  {!!highlightedRoute.routeNodeIds?.length && highlightedRoute.waypoints.length > 0 && (
                    <g data-testid="floor-test-route-active-overlay" className="pointer-events-none">
                      <polyline
                        points={highlightedRoute.waypoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill="none" stroke={highlightedRoute.color} strokeWidth={8}
                        strokeLinecap="round" strokeLinejoin="round" opacity={0.28}
                      />
                      <polyline
                        points={highlightedRoute.waypoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill="none" stroke={highlightedRoute.color} strokeWidth={4}
                        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="12 8" opacity={1}
                      >
                        <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.2s" repeatCount="indefinite" />
                      </polyline>
                      {floorRouteArrowPoints(highlightedRoute.waypoints).map((marker, index) => (
                        <path key={`floor-active-route-arrow-${index}`} d="M -5 -4 L 5 0 L -5 4 Z"
                          transform={`translate(${marker.x} ${marker.y}) rotate(${marker.angle})`}
                          fill={highlightedRoute.color} stroke="white" strokeWidth={1} />
                      ))}
                    </g>
                  )}
                  {(highlightedRoute.endpointMarkers ?? []).map((marker) => (
                    <RouteEndpointMarker key={`floor-route-endpoint-${marker.kind}`} {...marker} color={highlightedRoute.color} />
                  ))}
                  {(highlightedRoute.transitionMarkers ?? []).map((marker) => (
                    <RouteTransitionMarker key={marker.id} marker={marker} zoom={zoom} viewport={{ width: FP_W, height: FP_H, pan }} onClick={handleTestRouteTransition} />
                  ))}
                </>
              )}

            </g>
          </svg>

          {quickNavOverlay}

          {/* Furniture tooltip — shows when furniture tool is active */}
          {tool === "furniture" && furnitureTemplate && (
            <div data-testid="furniture-placement-instruction" className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground">
                Click to place {furnitureTemplate.name} · Esc to cancel
              </div>
            </div>
          )}

          {/* Wall drawing hint */}
          {tool === "wall" && wallStart && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground">
                Click again to finish wall · Shift-click to continue · Esc to cancel
              </div>
            </div>
          )}

          {/* Physical Room placement feedback mirrors the navigation-tool pill
              and describes the actual click-drag interaction. */}
          {tool === "room" && (
            <div data-testid="room-placement-instruction" className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground">
                Click and drag to place Room · Esc to cancel
              </div>
            </div>
          )}

          {roomDoorLinking && (
            <div data-testid="room-door-link-instruction" className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg border border-primary/30 shadow-sm bg-card text-[11px] font-semibold text-foreground">
                Select a Door for this Room · Esc to cancel
              </div>
            </div>
          )}

          {/* Navigation authoring status hint */}
          {navMode && (navTool === "connect" || navTool === "waypoint" || navTool === "destination" || navTool === "link") && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground">
                {navTool === "connect"
                  ? (navConnectStart ? "Click destination · Shift for H/V · Esc to cancel" : "Select a start point")
                  : navTool === "link"
                    ? "Select a Room, Door, Stair, Elevator or Ramp."
                    : navTool === "destination"
                      ? "Click to place a destination point"
                      : "Click to place a routing point"}
                {(navTool === "connect" || navTool === "link") && " · Esc to cancel"}
              </div>
            </div>
          )}

          {/* Save status overlay — polished real-async feedback, not only a toast */}
          {ADVANCED_FLOOR_REFERENCE_ENABLED && backgroundUploading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Importing floor plan...
              </div>
            </div>
          )}

          {ADVANCED_FLOOR_REFERENCE_ENABLED && calibrationDraft.active && (
            <div data-testid="floor-calibration-panel" className="absolute top-4 left-4 z-30 w-72 rounded-xl border border-border bg-card shadow-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-foreground">Calibrate Scale</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {!calibrationDraft.p1 ? "Step 1 - Pick first point"
                      : !calibrationDraft.p2 ? "Step 2 - Pick second point"
                      : "Step 3 - Enter real distance"}
                  </p>
                </div>
                <button
                  onClick={() => setCalibrationDraft({ active: false, distanceInput: "" })}
                  className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                  aria-label="Cancel calibration"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 space-y-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Editor distance</span>
                  <span className="font-mono font-bold">{calibrationDraft.p1 && calibrationDraft.p2 ? dist(calibrationDraft.p1.x, calibrationDraft.p1.y, calibrationDraft.p2.x, calibrationDraft.p2.y).toFixed(2) : "-"}</span>
                </div>
                <label className="block">
                  <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Real distance (meters)</span>
                  <input
                    aria-label="Calibration real distance"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={calibrationDraft.distanceInput}
                    disabled={!calibrationDraft.p2}
                    onChange={(e) => setCalibrationDraft((draft) => ({ ...draft, distanceInput: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-xs font-mono disabled:opacity-50"
                  />
                </label>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resulting scale</span>
                  <span className="font-mono font-bold">{calibrationDraft.p1 && calibrationDraft.p2 && Number(calibrationDraft.distanceInput) > 0 ? (Number(calibrationDraft.distanceInput) / dist(calibrationDraft.p1.x, calibrationDraft.p1.y, calibrationDraft.p2.x, calibrationDraft.p2.y)).toFixed(4) : "-"} m/u</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setCalibrationDraft({ active: true, distanceInput: "" })} className="h-9 rounded-xl border border-border text-xs font-bold hover:bg-muted">
                  Restart
                </button>
                <button
                  onClick={confirmCalibration}
                  disabled={!calibrationDraft.p1 || !calibrationDraft.p2 || !(Number(calibrationDraft.distanceInput) > 0)}
                  className="h-9 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold disabled:opacity-50"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {(saving || saved) && (
              <motion.div
                key="floor-save-status"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute top-4 left-1/2 z-30 pointer-events-none -translate-x-1/2"
                data-testid="floor-save-status"
              >
                <div className={cn("flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl",
                  saved
                    ? "border-emerald-300 dark:border-emerald-700/50 bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-700 dark:text-emerald-400"
                    : "border-border bg-card/95 text-foreground")}
                  style={{ backdropFilter: "blur(8px)" }}>
                  {saved
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                  <span className="text-xs font-extrabold">{saved ? "Saved" : "Saving floor…"}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status bar overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/60 text-[10px] font-mono"
                style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)" }}>
                <span className="font-bold">{allItemsCount}</span>
                <span className="opacity-50">items</span>
              </div>
              {multiSelected.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/30 text-[10px] font-bold text-primary"
                  style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)" }}>
                  {multiSelected.length} selected
                </div>
              )}
              {cursorPos && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/60 text-[9px] font-mono"
                  style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)" }}>
                  X:{cursorPos.x} Y:{cursorPos.y}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">{Math.round(zoom * 100)}%</span>
              <span className="w-px h-3 bg-border" />
              <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">{FP_W} × {FP_H}</span>
              <span className="w-px h-3 bg-border" />
              <span className="text-[10px] font-medium text-muted-foreground">Floor Editor</span>
            </div>
          </div>

          {/* B5 Phase 3.2: NON-BLOCKING nav empty-state — a compact banner pinned
              near the top of the canvas, shown ONLY while the editor is idle
              (Select tool, nothing linked, no Connect in progress, no library
              drag). It never covers the physical objects the admin needs for
              Link Location: arming any authoring tool (Link Location / Waypoint
              / Connect) or starting a library drag hides it immediately, and
              the whole banner is pointer-events-none so it can never intercept
              a canvas click. */}
          {navMode && indoorNodes.length === 0 && indoorEdges.length === 0 && navTool === "select" && !navConnectStart && navLibraryDragRef.current == null && (
            <div data-testid="floor-nav-canvas-empty-state" className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card/90 backdrop-blur px-3 py-1.5 shadow-md max-w-[min(620px,calc(100%-24px))]">
                <Waypoints className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] font-extrabold text-foreground whitespace-nowrap">Build the Walking Network</span>
                <span className="hidden md:inline text-[10px] text-muted-foreground truncate">
                  Link a Room, Door, Stair, Elevator or Ramp — or drop a Waypoint.
                </span>
                <button
                  onClick={() => selectNavTool("waypoint")}
                  aria-label="Start building the walking network"
                  className="pointer-events-auto shrink-0 ml-1 h-6 px-2.5 rounded-md bg-primary text-primary-foreground text-[10px] font-extrabold hover:opacity-90 transition-opacity"
                >
                  Add Waypoint
                </button>
              </div>
            </div>
          )}

          {/* B7 Correction: locate flash overlay removed — locate behavior now
              relies on object selection, Properties sidebar, and contextual
              "Needs attention" section for a precise, non-misaligned result. */}

          {/* Zoom controls */}
          <div className="absolute bottom-10 right-3 z-20 flex items-center gap-1 p-1 rounded-xl border border-border shadow-md bg-card">
            <ToolbarTooltip tool="zoomOut">
            <button onClick={zoomOut} aria-label="Zoom Out" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            </ToolbarTooltip>
            <span className="w-10 text-center text-[10px] font-mono font-bold text-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
            <ToolbarTooltip tool="zoomIn">
            <button onClick={zoomIn} aria-label="Zoom In" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            </ToolbarTooltip>
            <ToolbarTooltip tool="resetView" label="Fit View" hint="Fit the current floor content inside the visible canvas.">
            <button onClick={fitFloor} aria-label="Fit Floor" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            </ToolbarTooltip>
          </div>

          {/* Test Navigation panel — slides up over the canvas */}
          <AnimatePresence initial={false}>
            {showNavOverlay && testNavOpen && (
              <motion.div
                initial={{ opacity: 0, x: 0, y: 0 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: 8, y: 6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "absolute top-3 z-40 flex max-w-[calc(100%-24px)]",
                  testRouteCompact
                    ? "h-auto max-h-none w-[420px] overflow-visible"
                    : "h-[min(620px,calc(100%-24px))] max-h-[calc(100%-24px)] w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl",
                )}
                style={{
                  background: testRouteCompact ? "transparent" : undefined,
                  boxShadow: testRouteCompact ? "none" : undefined,
                  left: "auto",
                  bottom: "auto",
                  right: showProperties ? "264px" : "12px",
                  transformOrigin: "top right",
                  width: testRouteCompact ? "min(420px, calc(100% - 24px))" : "320px",
                  height: testRouteCompact ? "auto" : undefined,
                  transition: "right 180ms cubic-bezier(0.16, 1, 0.3, 1), width 160ms cubic-bezier(0.16, 1, 0.3, 1), height 160ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <TestNavigationPanel
                  campus={campus}
                  onHighlightRoute={setHighlightedRoute}
                  inspectorVisible={showProperties}
                  onCompactModeChange={setTestRouteCompact}
                  currentBuildingId={buildingId}
                  currentFloorId={floorId}
                  onPickOnMap={(kind) => { setTestRoutePickKind(kind); setTestRoutePickHover(null); }}
                  mapPickResult={testRouteMapPick}
                  onMapPickResultConsumed={() => setTestRouteMapPick(null)}
                  onFocusNode={(nodeId) => {
                    const n = indoorNodes.find((x) => x.id === nodeId);
                    if (n) zoomToFit(Math.max(0, n.x - 60), Math.max(0, n.y - 60), 120, 120, 48);
                  }}
                  onRouteStartFocus={(nodeId, context) => {
                    if (context.kind === "outdoor") {
                      handleBack();
                      return;
                    }
                    if (context.buildingId === buildingId && context.floorId === floorId) {
                      const n = indoorNodes.find((x) => x.id === nodeId);
                      if (n) zoomToFit(Math.max(0, n.x - 140), Math.max(0, n.y - 110), 280, 220, 72);
                      return;
                    }
                    if (context.buildingId === buildingId && context.floorId) {
                      requestFloorSwitch(context.floorId);
                      return;
                    }
                    if (context.buildingId && context.floorId && onOpenFloor) {
                      guardNavigation(() => onOpenFloor(context.buildingId!, context.floorId!));
                      return;
                    }
                    handleBack();
                  }}
                  onRouteTransitionCancel={cancelElevatorTransition}
                  onClose={() => { cancelElevatorTransition(); setTestNavOpen(false); testRouteSessionContext.setSession(null); setTestRouteCompact(false); setHighlightedRoute(null); setTestRoutePickKind(null); setTestRouteMapPick(null); setTestRoutePickHover(null); }}
                  currentContext={{ kind: "floor", buildingId, floorId }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </motion.div>

        {/* ── PROPERTIES PANEL ── */}
        <AnimatePresence initial={false}>
        {showProperties && multiSelected.length > 1 && (
          <motion.div
            key="floor-multi-properties"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            data-testid="floor-multi-properties-panel"
            className="absolute inset-y-0 right-0 z-50 flex h-full w-64 flex-col border-l border-border overflow-hidden bg-card pointer-events-auto"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">Selected Objects</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{multiSelected.length} objects selected</p>
              </div>
              <button onClick={() => setShowProperties(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="rounded-xl border border-border bg-muted/25 p-3">
                <p className="text-[11px] font-bold text-foreground">{multiSelected.length} objects selected</p>
                <p className="text-[10px] text-muted-foreground mt-1">Drag any selected object to move the whole group. Right-click a member for group actions.</p>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setSelectionState(null, { visible: selectedContextState.hidden })}
                  className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1"
                >
                  {selectedContextState.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {selectedContextState.hidden ? "Show" : "Hide"}
                </button>
                <button
                  onClick={() => setSelectionState(null, { locked: !selectedContextState.locked })}
                  className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1"
                >
                  {selectedContextState.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {selectedContextState.locked ? "Unlock" : "Lock"}
                </button>
                <button
                  onClick={() => applyLayerAction(null, "send-back")}
                  className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1"
                >
                  <Layers className="h-3 w-3" /> Back
                </button>
                <button
                  onClick={() => applyLayerAction(null, "bring-front")}
                  className="h-8 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1"
                >
                  <Layers className="h-3 w-3" /> Front
                </button>
              </div>
              <button
                onClick={() => duplicateSelection(null)}
                className="w-full h-9 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate Selected
              </button>
              <button
                onClick={() => { deleteSelection(null); toast.info("Selected objects deleted", "The selected floor objects have been removed."); }}
                className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <TrashIcon className="h-3.5 w-3.5" /> Delete Selected
              </button>
              <button
                onClick={() => { setMultiSelected([]); setSelected(null); }}
                className="w-full h-9 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Clear Selection
              </button>
              <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
                Floor settings and single-object properties stay separate — they are intentionally not shown here.
              </p>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
        {/* B5 Phase 2.2: nav properties fade in per selection state (single /
            multi / none) — a restrained 180ms, never re-mounting the canvas. */}
        <AnimatePresence initial={false}>
        {navMode && showProperties && navMultiSelected.length > 1 && (
          <motion.div
            key="nav-multi-props"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 z-50 flex h-full pointer-events-auto"
          >
          <div data-testid="floor-nav-multi-props" className="w-60 shrink-0 flex flex-col border-l border-border overflow-hidden bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">Selected Objects</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{navMultiSelected.length} walking point{navMultiSelected.length !== 1 ? "s" : ""} selected</p>
              </div>
              <button onClick={() => setShowProperties(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(() => {
                const selSet = new Set(navMultiSelected);
                const selNodes = indoorNodes.filter((n) => selSet.has(n.id));
                const freeNodes = selNodes.filter((n) => !linkedObjectRef(n));
                const waypointCount = freeNodes.filter((n) => n.type !== "room_access").length;
                const destCount = freeNodes.filter((n) => n.type === "room_access").length;
                const linkedCount = selNodes.length - freeNodes.length;
                // Paths touching ANY selected node — matches exactly what the
                // Delete Selected action removes (deleteNavSelection removes
                // every edge connected to a selected node).
                const pathCount = indoorEdges.filter((e) => selSet.has(e.startNodeId) || selSet.has(e.endNodeId)).length;
                return (
                  <div className="rounded-xl border border-border bg-muted/25 p-3 space-y-2">
                    {[
                      { label: "Walking Points", value: waypointCount },
                      { label: "Destinations", value: destCount },
                      { label: "Linked Locations", value: linkedCount },
                      { label: "Paths", value: pathCount },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-muted-foreground">{row.label}</span>
                        <span className="text-[11px] font-extrabold text-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Drag a free waypoint to move the group. Linked locations stay attached to their floor objects.
              </p>
              <button
                onClick={() => deleteNavSelection()}
                className="w-full h-9 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <TrashIcon className="h-3.5 w-3.5" /> Delete Selected
              </button>
              <button
                onClick={() => { setNavMultiSelected([]); setNavSelected(null); }}
                className="w-full h-9 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Clear Selection
              </button>
            </div>
          </div>
          </motion.div>
        )}
        {navMode && showProperties && navMultiSelected.length <= 1 && navSelected && (
          <motion.div
            key="nav-single-props"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 z-50 flex h-full pointer-events-auto"
          >
          <FloorNavPropertiesPanel
            selected={navSelected}
            issueItems={navSelectedIssueItems}
            nodes={indoorNodes}
            edges={indoorEdges}
            onUpdateNode={(id, ch) => commitNavGraph(indoorNodes.map((n) => n.id === id ? { ...n, ...ch } : n), indoorEdges)}
            onUpdateEdge={(id, ch) => commitNavGraph(indoorNodes, indoorEdges.map((e) => e.id === id ? { ...e, ...ch } : e))}
            onDelete={() => deleteNavSelection()}
            onClose={() => { setNavSelected(null); setNavMultiSelected([]); setShowProperties(false); }}
            onAddBend={addBendToEdge}
            onRemoveBend={removeBendFromEdge}
            onStraighten={straightenEdge}
            straightenBlocked={straightenBlocked}
            edgeBlocked={navSelected?.type === "edge" ? navBlockedEdgeIds.has(navSelected.id) : false}
            transitionFloors={navSelected?.type === "node" ? (navNodeTransitionStatus.get(navSelected.id)?.floors ?? []) : []}
            transitionState={navSelected?.type === "node" ? (navNodeTransitionStatus.get(navSelected.id)?.state ?? "no-shared-id") : "no-shared-id"}
            elevatorServedFloors={navSelectedElevatorServedFloors}
          />
          </motion.div>
        )}
        {/* B5 Phase 6.2: physical object selected in Navigation mode — navigation-only info */}
        {navMode && showProperties && navPhysicalSelected && !navSelected && (
          <motion.div
            key="nav-physical-props"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 z-50 flex h-full pointer-events-auto"
          >
            <PhysicalNavPropertiesPanel
              physicalType={navPhysicalSelected.type}
              physicalId={navPhysicalSelected.id}
              rooms={rooms}
              doors={doors}
              stairs={stairs}
              elevators={elevators}
              ramps={ramps}
              nodes={indoorNodes}
              navEdges={indoorEdges}
              onClose={() => { setNavPhysicalSelected(null); setShowProperties(false); }}
              onAdd={addPhysicalToNavigation}
              onRemove={removePhysicalFromNavigation}
              onView={viewPhysicalInNavigation}
            />
          </motion.div>
        )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
        {!navMode && showProperties && multiSelected.length <= 1 && !selected && (
          <motion.div
            key="floor-overview-properties"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            data-testid="floor-properties-panel"
            className="absolute inset-y-0 right-0 z-50 flex h-full w-64 pointer-events-auto"
          >
            <FloorOverviewSidebar
              floor={floor}
              canvasW={FP_W}
              canvasH={FP_H}
              isFirst={building.floors.findIndex((f) => f.id === floorId) <= 0}
              isLast={building.floors.findIndex((f) => f.id === floorId) >= building.floors.length - 1}
              isOnly={building.floors.length <= 1}
              onClose={() => setShowProperties(false)}
              onRename={renameActiveFloorFromSidebar}
              onCanvasSize={(w, h) => applySidebarFloorSettings({ canvasW: w, canvasH: h })}
              onShowGrid={(v) => applySidebarFloorSettings({ showGrid: v })}
              onGridSize={(size) => applySidebarFloorSettings({ gridSize: size })}
              onOpenSettings={() => setShowFloorSettings(true)}
              onDuplicate={() => requestDuplicateFloor(floorId)}
              onMoveUp={() => requestMoveFloor(floorId, -1)}
              onMoveDown={() => requestMoveFloor(floorId, 1)}
              onDelete={() => requestDeleteFloor(floorId)}
              perimeterEnabled={walls.some(isManagedPerimeterWall)}
            />
          </motion.div>
        )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
        {showProperties && multiSelected.length <= 1 && selected && (!navMode || (navMode && navTool === "select" && !navSelected)) && (
          <motion.div
            key="floor-properties"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 z-50 flex h-full w-64 pointer-events-auto"
          >
          <FloorPropertiesPanel
            selected={selected}
            mode={showNavOverlay ? "navigation" : "structure"}
            issueItems={selectedIssueItems}
            rooms={rooms}
            walls={walls}
            doors={doors}
            windows={windows}
            furniture={furniture}
            stairs={stairs}
            ramps={ramps}
            elevators={elevators}
            labels={labels}
            floorId={floor.id}
            buildingFloors={buildingFloors.map((f) => ({ id: f.id, label: f.label, number: f.number }))}
            circulationGroups={circulationGroups}
            circulationNavStatus={circulationNavStatus}
            physicalNavStatus={physicalNavStatus}
            roomDoorStatus={roomDoorStatus}
            entranceConnectionStatus={selectedDoorEntranceStatus}
            onAddPhysicalToNavigation={addPhysicalToNavigation}
            onViewPhysicalInNavigation={viewPhysicalInNavigation}
            onRemovePhysicalFromNavigation={removePhysicalFromNavigation}
            onLinkRoomDoor={beginRoomDoorLink}
            onSelectRoomDoor={selectRoomDoor}
            onRemoveRoomDoor={removeRoomDoor}
            onHoverRoomDoor={setRoomDoorInspectorHoverId}
            onCirculationGroupChange={assignCirculationGroup}
            onElevatorConnectionChange={changeElevatorConnection}
            onElevatorConnectionsChange={connectElevatorConnections}
            onElevatorConnectionDisconnect={disconnectElevatorConnection}
            onElevatorConnectionsDisconnectAll={disconnectAllElevatorConnections}
            onStairConnectionChange={changeStairConnection}
            onStairConnectionsChange={connectMatchingStairConnections}
            onStairConnectionDisconnect={disconnectStairConnection}
            onCreateCirculationGroup={createCirculationGroup}
            onRenameCirculationGroup={renameCirculationGroup}
            onGoToFloor={(targetFloorId) => requestFloorSwitch(targetFloorId)}
            onUpdateRoom={(id, ch) => { updFloor(rooms.map((r) => r.id === id ? { ...r, ...ch } : r), fpaths); }}
            onUpdateWall={(id, ch) => {
              if ("color" in ch && typeof ch.color === "string") lastWallStyleRef.current = { ...lastWallStyleRef.current, color: ch.color };
              if ("thickness" in ch && typeof ch.thickness === "number") lastWallStyleRef.current = { ...lastWallStyleRef.current, thickness: ch.thickness };
              if ("material" in ch && typeof ch.material === "string") lastWallStyleRef.current = { ...lastWallStyleRef.current, material: ch.material };
              updFloor(rooms, fpaths, walls.map((w) => w.id === id ? { ...w, ...ch } : w));
            }}
            onApplyWallStyleToFloor={(style) => {
              lastWallStyleRef.current = style;
              updFloor(rooms, fpaths, walls.map((wall) => ({ ...wall, ...style })));
            }}
            onUpdateDoor={(id, ch) => {
              const door = doors.find((d) => d.id === id);
              const structural = "width" in ch || "offset" in ch || "wallId" in ch || "x" in ch || "y" in ch || "doorType" in ch;
              const orientation = "hinge" in ch || "swingSide" in ch || "direction" in ch || "doorType" in ch;
              if (door?.locked && (structural || orientation) && !("locked" in ch) && !("visible" in ch)) {
                toast.info("Locked door", "Unlock this door before editing it.");
                return;
              }
              if (door?.wallId && structural && isUserLockedWall(wallById.get(door.wallId))) {
                toast.info("Locked wall", "Unlock the parent wall before changing this opening.");
                return;
              }
              if (door && "doorType" in ch) {
                const requestedType = ch.doorType ?? effectiveDoorType({ ...door, ...ch });
                const wall = (ch.wallId ?? door.wallId) ? wallById.get((ch.wallId ?? door.wallId)!) : undefined;
                if (wall && !wallCanFitOpening(wall, doorMinWidth(requestedType))) {
                  toast.info("Door type blocked", `${requestedType === "double" ? "Double" : "Single"} Door cannot fit on this wall segment.`);
                  return;
                }
              }
              updFloor(rooms, fpaths, walls, doors.map((d) => {
                if (d.id !== id) return d;
                const next = { ...d, ...ch };
                const nextType = effectiveDoorType(next);
                if (nextType === "double") next.direction = "double";
                if (nextType === "single" && next.direction === "double") next.direction = next.hinge ?? "left";
                const wall = next.wallId ? wallById.get(next.wallId) : undefined;
                if (!wall) return next;
                const baseWidth = "doorType" in ch && nextType === "double"
                  ? Math.max(next.width, doorMinWidth("double"))
                  : "doorType" in ch && nextType === "single"
                    ? Math.min(next.width, doorMaxWidth("single"))
                    : next.width;
                const width = clampDoorWidthForWall(wall, baseWidth, nextType);
                const offset = clampWallOpeningOffset(wall, width, next.offset ?? d.offset ?? nearestPointOnWall({ x: d.x, y: d.y }, wall).t);
                return {
                  ...next,
                  width: Math.round(width),
                  offset,
                  x: Math.round(wall.x1 + (wall.x2 - wall.x1) * offset),
                  y: Math.round(wall.y1 + (wall.y2 - wall.y1) * offset),
                };
              }));
            }}
            onUpdateWindow={(id, ch) => {
              const win = windows.find((w) => w.id === id);
              const structural = "width" in ch || "offset" in ch || "wallId" in ch || "x" in ch || "y" in ch;
              if (win?.locked && structural && !("locked" in ch) && !("visible" in ch)) {
                toast.info("Locked window", "Unlock this window before editing it.");
                return;
              }
              if (win?.wallId && structural && isUserLockedWall(wallById.get(win.wallId))) {
                toast.info("Locked wall", "Unlock the parent wall before changing this opening.");
                return;
              }
              updFloor(rooms, fpaths, walls, doors, windows.map((w) => {
                if (w.id !== id) return w;
                const next = { ...w, ...ch };
                const wall = next.wallId ? wallById.get(next.wallId) : undefined;
                if (!wall) return next;
                const maxWidth = maxOpeningWidthForWall(wall, WINDOW_MAX_WIDTH, OPENING_MIN_WIDTH);
                const width = clamp(next.width, OPENING_MIN_WIDTH, maxWidth);
                const offset = clampWallOpeningOffset(wall, width, next.offset ?? w.offset ?? nearestPointOnWall({ x: w.x, y: w.y }, wall).t);
                return {
                  ...next,
                  width: Math.round(width),
                  offset,
                  x: Math.round(wall.x1 + (wall.x2 - wall.x1) * offset),
                  y: Math.round(wall.y1 + (wall.y2 - wall.y1) * offset),
                };
              }));
            }}
            onUpdateFurniture={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture.map((f) => f.id === id ? { ...f, ...ch } : f)); }}
            onUpdateStairs={(id, ch) => {
              const current = stairs.find((stair) => stair.id === id);
              // Continuation identity is authored only by the explicit Stair
              // connection controls.  Never let a Direction/property update
              // carry a stale sharedId and accidentally absorb another
              // occurrence during graph reconciliation.
              const safeChanges = { ...ch };
              if ("sharedId" in safeChanges) delete (safeChanges as Partial<FloorStairs>).sharedId;
              const generatedLabel = "flip" in safeChanges && isDefaultStairLabel(current?.label)
                ? stairLabelForEntrySide(safeChanges.flip)
                : undefined;
              updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.map((s) => s.id === id
                ? { ...s, ...safeChanges, ...(generatedLabel ? { label: generatedLabel } : {}) }
                : s));
            }}
            onUpdateRamp={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps.map((r) => r.id === id ? { ...r, ...ch } : r)); }}
            onUpdateElevator={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.map((e) => e.id === id ? { ...e, ...ch } : e)); }}
            onUpdateLabel={updateLabel}
            onToggleNavConnection={onToggleNavConnection}
            onDeleteSelected={() => {
              deleteSelection(selected);
            }}
            onDuplicateSelected={() => {
              duplicateSelection(selected);
            }}
            onSetSelectedState={(changes) => setSelectionState(selected, changes)}
            onLayerAction={(action) => applyLayerAction(selected, action)}
            onClose={() => setShowProperties(false)}
          />
          </motion.div>
        )}
        </AnimatePresence>

        {/* ── CONTEXT MENU ── */}
        <AnimatePresence>
          {contextMenu && (
            <FloorContextMenu
              menu={contextMenu}
              state={selectedContextState}
              onClose={() => setContextMenu(null)}
              onAction={handleFloorContextAction}
            />
          )}
        </AnimatePresence>

        {/* ── Shared unsaved-changes dialog (portal: covers the FULL viewport) ── */}
        <UnsavedChangesDialog
          open={unsavedGuard.open}
          isDirty
          saving={unsavedGuard.saving}
          error={unsavedGuard.error}
          title="Unsaved Floor Changes"
          continueLabel="Keep Editing"
          saveLabel="Save Changes"
          description={unsavedGuard.pendingDescription ?? `Save or discard changes to ${floor.label} before switching floors.`}
          onCancel={unsavedGuard.cancel}
          onSave={unsavedGuard.saveAndContinue}
          onDiscard={unsavedGuard.discard}
        />

        {/* Shared floor actions menu — opened from the `...` button or a tab right-click */}
        {floorMenu && (() => {
          const target = building.floors.find((f) => f.id === floorMenu.floorId);
          if (!target) return null;
          const index = building.floors.findIndex((f) => f.id === target.id);
          return (
            <FloorActionsMenu
              x={floorMenu.x}
              y={floorMenu.y}
              floor={target}
              isFirst={index <= 0}
              isLast={index >= building.floors.length - 1}
              isOnly={building.floors.length <= 1}
              showSettings
              testId="floor-actions-menu"
              onClose={() => setFloorMenu(null)}
              onRename={() => beginRenameFloor(target)}
              onDuplicate={() => requestDuplicateFloor(target.id)}
              onMoveUp={() => requestMoveFloor(target.id, -1)}
              onMoveDown={() => requestMoveFloor(target.id, 1)}
              onDelete={() => requestDeleteFloor(target.id)}
              onSettings={() => {
                setFloorMenu(null);
                if (target.id !== floorId) requestFloorSwitch(target.id);
                setShowFloorSettings(true);
              }}
            />
          );
        })()}

        {/* Rename Floor dialog — the same compact flow is used by the Hierarchy panel */}
        <AnimatePresence>
          {floorRename && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
              onClick={() => setFloorRename(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-extrabold text-foreground">Rename Floor</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Enter a new label for "{floorRename.currentLabel}".</p>
                </div>
                <div className="px-5 py-4">
                  <input
                    autoFocus
                    aria-label="Rename floor input"
                    value={floorRenameValue}
                    onChange={(e) => setFloorRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFloorRename();
                      if (e.key === "Escape") setFloorRename(null);
                    }}
                    placeholder="Floor label"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {!floorRenameValue.trim() && (
                    <p className="text-[10px] text-destructive mt-1.5">Floor name cannot be empty.</p>
                  )}
                </div>
                <div className="flex gap-2 px-5 pb-5">
                  <button
                    onClick={() => setFloorRename(null)}
                    className="flex-1 h-9 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyFloorRename}
                    disabled={!floorRenameValue.trim() || floorRenameValue.trim() === floorRename.currentLabel}
                    className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm"
                  >
                    <Pencil className="h-3 w-3 mr-1.5 inline-block align-[-2px]" />
                    Rename Floor
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {floorDeleteConfirm && (() => {
            const targetFloor = building.floors.find((f) => f.id === floorDeleteConfirm.id);
            const itemCount = targetFloor ? countFloorAuthoredItems(targetFloor) : 0;
            return (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
                onClick={() => setFloorDeleteConfirm(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                  data-testid="delete-floor-confirm-dialog"
                >
                  <div className="flex items-start gap-4 p-5">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                      <TrashIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <h3 className="text-sm font-extrabold text-foreground">Delete Floor</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Delete {floorDeleteConfirm.label} and its {itemCount} authored {itemCount === 1 ? "item" : "items"}?
                        This removes its rooms, walls, openings, furniture, circulation objects, labels, and settings from the draft.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 px-5 pb-5">
                    <button
                      onClick={() => setFloorDeleteConfirm(null)}
                      className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => confirmDeleteFloorById(floorDeleteConfirm.id)}
                      className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-xs font-extrabold hover:bg-destructive/90 shadow-sm transition-all"
                    >
                      Delete Floor
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        <AnimatePresence>
          {showIssues && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute right-3 top-12 z-[140]"
              onClick={() => setShowIssues(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
                className="w-96 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", hasAnyIssues ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600")}>
                      {hasAnyIssues ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-foreground">Floor Issues</h3>
                      <p className="text-xs text-muted-foreground">{totalIssues} issue{totalIssues !== 1 ? "s" : ""} on {floor.label}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowIssues(false)} className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[360px] overflow-y-auto p-3">
                  {totalIssues === 0 ? (
                    <div className="p-5 text-center">
                      <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                      <p className="text-sm font-bold text-foreground">No floor issues found</p>
                      <p className="text-xs text-muted-foreground mt-1">Current geometry is inside the floor canvas.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {floorIssues.map((issue) => {
                        // Severity-aware row styling: errors stay destructive,
                        // warnings stay amber, info stays blue (B7 Phase 1 —
                        // warnings must remain warnings, never a giant red state).
                        const severityStyle = issue.severity === "error"
                          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive"
                          : issue.severity === "warning"
                            ? "border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "border-sky-500/25 bg-sky-500/5 hover:bg-sky-500/10 text-sky-600 dark:text-sky-400";
                        return (
                          <button
                            key={issue.id}
                            onClick={() => selectIssue(issue)}
                            className={`w-full flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${severityStyle}`}
                          >
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground">{issue.message}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Click to select the affected object.</p>
                            </div>
                          </button>
                        );
                      })}
                      {/* B5 Phase 2.11: wall-blocked navigation paths count as local
                          issues; clicking one jumps to Navigation mode with the
                          invalid edge selected so it can be repaired. */}
                      {Array.from(navBlockedEdgeIds).map((edgeId) => (
                        <button
                          key={`nav-${edgeId}`}
                          onClick={() => {
                            setShowIssues(false);
                            switchFloorEditorMode("navigation");
                            setNavSelected({ type: "edge", id: edgeId });
                            setShowProperties(true);
                          }}
                          data-testid={`nav-edge-issue-${edgeId}`}
                          className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/70 transition-colors"
                        >
                          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground">Navigation path crosses or overlaps a wall.</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Click to select the affected edge.</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <ShortcutCheatSheet open={showShortcuts} onClose={() => setShowShortcuts(false)} variant="floor" />

        {/* Floor Settings dialog — canvas size + appearance, kept fully separate
            from object properties and multi-selection controls. */}
        <FloorSettingsDialog
          open={showFloorSettings}
          floor={floor}
          onApply={applyFloorSettings}
          onClose={() => setShowFloorSettings(false)}
          onImportBackground={handleImportBackground}
          onUpdateBackground={handleUpdateBackground}
          onFitBackground={handleFitBackground}
          onResetBackground={handleResetBackground}
          onStartCalibration={startCalibration}
          onRemoveCalibration={removeCalibration}
        />
      </div>
    </div>
  );
}
