import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, ChevronRight, CheckCircle2, Save, X, ZoomIn, ZoomOut, Undo2, Redo2,
  Grid3X3, Layers, Paintbrush, Sofa, SeparatorHorizontal, MoveVertical,
  DoorOpen, Binary, Text, PanelRightClose, Navigation, LandPlot,
  MousePointer2, Hand, HelpCircle, AlertTriangle, Maximize2, MoreHorizontal,
  Square as SquareIcon, GitBranch as GitBranchIcon, Trash2 as TrashIcon, Copy, Settings2,
  Loader2, Globe2, Eye, EyeOff, Lock, Unlock, Plus, Pencil, Waypoints, Link2, MapPin,
  Accessibility as AccessibilityIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useCanvasControls, isSpacePressed } from "./useCanvasControls";
import { useFloorHistory } from "./useFloorHistory";
import {
  ROOM_TYPES, ROOM_MAP,
  FURNITURE_CATEGORIES, genId,
} from "./constants";
import { FloorPropertiesPanel } from "./FloorPropertiesPanel";
import { FloorNavPropertiesPanel } from "./FloorNavPropertiesPanel";
import { FloorOverviewSidebar } from "./FloorOverviewSidebar";
import { FloorActionsMenu } from "./FloorActionsMenu";
import { FloorSettingsDialog, type FloorSettingsDraft } from "./FloorSettingsDialog";
import { ShortcutCheatSheet } from "./ShortcutCheatSheet";
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
  orthogonalBendsFor,
  pointInsideWallObstacle,
  pruneOrphanedIndoorNodes,
  translateOrthogonalSegment,
  rampLinkedCuePosition,
  remapIndoorNavForFloorCopy,
  roomLinkedCuePosition,
  syncIndoorLinkedNodePositions,
  linkedObjectRef,
  findNavNodeAtPoint,
  createNavEdge,
  navEdgeIsBlocked,
} from "../../lib/indoorNavigationGraph";
import {
  addFloorToBuilding,
  countFloorAuthoredItems,
  deleteFloorFromBuilding,
  duplicateFloorInBuilding,
  moveFloorInBuilding,
  renameFloorInBuilding,
} from "../../lib/floorManagement";
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

type WallSnapTarget = { x: number; y: number; edge?: { x1: number; y1: number; x2: number; y2: number }; roomAnchor?: FloorWallEndpointAnchor };
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

function StairsSymbol({ item, selected }: { item: FloorStairs; selected: boolean }) {
  const stroke = selected ? "var(--accent)" : "#6b7280";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  // B5 Phase 2.3: recognizable top-down straight stair — repeated tread lines
  // across the run plus a centered directional arrow. Everything is in the
  // object's local frame, so the parent rotate() keeps it aligned; the arrow
  // clearly communicates ascent (up) / descent (down) / transition (both).
  const treadCount = Math.max(3, Math.min(8, Math.floor(item.width / 7)));
  const dir = item.direction === "up" ? "up" : item.direction === "down" ? "down" : "both";
  return (
    <>
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={1.5}
        fill={selected ? "rgba(14,42,110,0.12)" : "#f8fafc"} stroke={stroke} strokeWidth={selected ? 1.8 : 1.1} />
      {/* B5 Phase 2.4: subtle boundary guard rails inside the footprint edges —
          they follow the run axis and rotate with the object (local frame). */}
      <line data-testid="stairs-rail" x1={item.x + 1.5} y1={item.y + 2} x2={item.x + 1.5} y2={item.y + item.height - 2} stroke="#94a3b8" strokeWidth={0.7} opacity={0.55} />
      <line data-testid="stairs-rail" x1={item.x + item.width - 1.5} y1={item.y + 2} x2={item.x + item.width - 1.5} y2={item.y + item.height - 2} stroke="#94a3b8" strokeWidth={0.7} opacity={0.55} />
      {Array.from({ length: treadCount }, (_, i) => {
        const tx = item.x + (item.width / (treadCount + 1)) * (i + 1);
        return <line key={i} data-testid="stairs-tread" x1={tx} y1={item.y + 2} x2={tx} y2={item.y + item.height - 2} stroke="#64748b" strokeWidth={0.85} />;
      })}
      {/* Center dashed run line + directional arrow, both centered on the object. */}
      <line data-testid="stairs-center-line" x1={cx} y1={item.y + 3} x2={cx} y2={item.y + item.height - 3} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2 2" />
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
    { id: "toggle-grid", label: "Toggle Grid", icon: Grid3X3 },
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
  onSwitchFloor: (floorId: string) => void;
  onUpdate: (c: Campus) => void;
  onSave?: (c: Campus) => Promise<Campus>;
  onPublish?: (c: Campus) => void;
  publishingEnabled?: boolean;
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

export function FloorEditor({ campus, buildingId, floorId, onBack, onSwitchFloor, onUpdate, onSave, onPublish, publishingEnabled = false }: FloorEditorProps) {
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
  const [mode, setMode] = useState<FloorEditorMode>("structure");
  // B5 Phase 2: indoor Navigation authoring mode (Design vs Navigation).
  const navMode = mode === "navigation";
  const [navTool, setNavTool] = useState<"select" | "pan" | "waypoint" | "destination" | "connect" | "link" | "erase">("select");
  // B5 Phase 2.2: destructive-hover target for the Remove tool (node or edge).
  const [navEraseHover, setNavEraseHover] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [navSelected, setNavSelected] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [navMultiSelected, setNavMultiSelected] = useState<string[]>([]);
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
  // B5 Phase 2.7: multi-bend Connect — empty-space clicks PIN geometry bends on
  // ONE edge (never NavigationNodes) until a routing node finishes the edge.
  const [navConnectBends, setNavConnectBends] = useState<{ x: number; y: number }[]>([]);
  // B5 Phase 2.9: per-click pin counts — ONE empty-space click pins the FULL
  // segment shape the preview showed (an L corner + the click point, or the
  // click point alone on a straight continuation), and temporary Ctrl+Z must
  // remove that whole last click in one step (never leave a stray corner).
  const navConnectBendGroupsRef = useRef<number[]>([]);
  const navGraphRef = useRef<{ nodes: NavigationNode[]; edges: NavigationEdge[] }>({ nodes: [], edges: [] });
  const [, setNavGraphVersion] = useState(0); // bump-only: recompute nav-derived UI
  // Free-waypoint group drag — linked nodes are excluded (derived geometry).
  const navDragRef = useRef<{ ids: string[]; origins: { id: string; x: number; y: number }[]; sx: number; sy: number } | null>(null);
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
  } | null>(null);
  // B5 Phase 2.8: always-on alignment guides (outdoor-editor philosophy, no
  // Shift) — temporary h/v lines shown while a free node / bend drags near
  // another routing node's X or Y center. Cleared on release/cancel/tool-switch.
  const [navAlignGuides, setNavAlignGuides] = useState<{ type: "h" | "v"; pos: number }[]>([]);
  // B5 Phase 2.8: one-time wall warning per drag gesture (avoid toast spam).
  const navDragWallWarnedRef = useRef(false);
  // B5 Phase 2.1: editor-local clipboards + Navigation Library drag state.
  const [clipboard, setClipboard] = useState<{ type: FloorSelection["type"]; id: string }[] | null>(null);
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
  const [drawingPath, setDP] = useState<{ x: number; y: number }[]>([]);
  // ── Sidebar ──
  const [sidebarCategory, setSidebarCategory] = useState<string | null>(null);
  const [showProperties, setShowProperties] = useState(false);
  // ── Furniture placement ──
  const [furnitureTemplate, setFurnitureTemplate] = useState<{ type: string; name: string; width: number; height: number; color: string } | null>(null);
  // ── Saving ──
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingFloorSwitch, setPendingFloorSwitch] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  // B5 Phase 2.5: Design-mode "Show Navigation" view preference — a READ-ONLY
  // graph overlay for alignment/reference. Pure view state: no dirty, no history.
  const [showNavOverlay, setShowNavOverlay] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [showFloorSettings, setShowFloorSettings] = useState(false);
  const [floorMenu, setFloorMenu] = useState<{ floorId: string; x: number; y: number } | null>(null);
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
  const orderedWalls = useMemo(() => sortByZ(walls), [walls]);
  const orderedDoors = useMemo(() => sortByZ(doors), [doors]);
  const orderedWindows = useMemo(() => sortByZ(windows), [windows]);
  const wallById = useMemo(() => new Map(walls.map((wall) => [wall.id, wall])), [walls]);
  const orderedFurniture = useMemo(() => sortByZ(furniture), [furniture]);
  const orderedStairs = useMemo(() => sortByZ(stairs), [stairs]);
  const orderedRamps = useMemo(() => sortByZ(ramps), [ramps]);
  const orderedElevators = useMemo(() => sortByZ(elevators), [elevators]);
  const orderedLabels = useMemo(() => sortByZ(labels), [labels]);
  const allSelectableIds = useMemo(
    () => selectionIdsInRect(floor, { x: 0, y: 0, w: FP_W, h: FP_H }),
    [floor, FP_W, FP_H]
  );
  const wallJoints = useMemo(() => {
    const joints = new Map<string, { x: number; y: number; radius: number; color: string; count: number; managedCount: number }>();
    for (const wall of walls) {
      for (const point of [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]) {
        const key = `${Math.round(point.x * 100) / 100},${Math.round(point.y * 100) / 100}`;
        const existing = joints.get(key);
        const radius = Math.max(2, wall.thickness / 2 + 1);
        if (existing) {
          existing.radius = Math.max(existing.radius, radius);
          existing.count += 1;
          if (isManagedPerimeterWall(wall)) existing.managedCount += 1;
        } else {
          joints.set(key, { ...point, radius, color: wall.color, count: 1, managedCount: isManagedPerimeterWall(wall) ? 1 : 0 });
        }
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
  const resizing = useRef<RoomResizeState | null>(null);
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
  const indoorNavKey = useMemo(() => JSON.stringify([indoorNodes, indoorEdges]), [indoorNodes, indoorEdges]);
  const floorStateKey = useMemo(() => JSON.stringify(floor), [floor]);
  const fullStateKey = `${floorStateKey}|${indoorNavKey}`;
  const baselineFloorRef = useRef<FloorPlan>(structuredClone(floor));
  const baselineEntryRef = useRef<FloorUndoEntry>(floorUndoEntryFromFloor(floor));
  const [baselineKey, setBaselineKey] = useState(fullStateKey);
  const isFloorDirty = fullStateKey !== baselineKey;
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
  const commitNavGraph = useCallback((nextNodes: NavigationNode[], nextEdges: NavigationEdge[]) => {
    const syncedNodes = syncIndoorLinkedNodePositions(nextNodes, {
      rooms, doors, stairs, ramps, elevators,
    });
    const pruned = pruneOrphanedIndoorNodes(syncedNodes, nextEdges, {
      rooms, doors, stairs, ramps, elevators,
    });
    // B5 Phase 2.5: segmented edges report their CURRENT total polyline length
    // (start → bends → end) so distance stays accurate after node/bend edits.
    const finalEdges = pruned.edges.map((e) => {
      if (!e.bendPoints || e.bendPoints.length === 0) return e;
      const pts = edgePolylinePoints(e, pruned.nodes);
      if (!pts) return e;
      const dist = navEdgePolylineDistance(pts);
      return dist === e.distance ? e : { ...e, distance: dist };
    });
    const merged = mergeFloorNavIntoCampus(pruned.nodes, finalEdges);
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
    onUpdate(merged);
  }, [doors, elevators, floor, mergeFloorNavIntoCampus, onUpdate, pushHistory, ramps, rooms, stairs]);

  const clearTransientEditorState = useCallback(() => {
    setSelected(null);
    setMultiSelected([]);
    setRubberBand(null);
    setWallStart(null);
    setWallSnapIndicator(null);
    setWallPreview(null);
    setRoomDrag(null);
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
  }, []);

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
    clearTransientEditorState();
  }, [floorId]);

  const buildFloorUpdates = useCallback(
    (updates: Partial<FloorPlan> & FloorNavGraphState) => {
      // B5 Phase 2: after a physical-object edit, re-sync + prune the indoor nav
      // graph against the NEW floor geometry so linked nodes follow their owner
      // (and orphans never linger) in the SAME campus update — no extra history.
      const synced = syncIndoorLinkedNodePositions(updates.navNodes ?? indoorNodes, {
        rooms: updates.rooms ?? rooms,
        doors: updates.doors ?? doors,
        stairs: updates.stairs ?? stairs,
        ramps: updates.ramps ?? ramps,
        elevators: updates.elevators ?? elevators,
      });
      const pruned = pruneOrphanedIndoorNodes(synced, updates.navEdges ?? indoorEdges, {
        rooms: updates.rooms ?? rooms,
        doors: updates.doors ?? doors,
        stairs: updates.stairs ?? stairs,
        ramps: updates.ramps ?? ramps,
        elevators: updates.elevators ?? elevators,
      });
      const floorNav = { navNodes: pruned.nodes, navEdges: pruned.edges };
      const updatedCampus = mergeFloorNavIntoCampus(floorNav.navNodes, floorNav.navEdges);
      // The nav graph lives on the CAMPUS arrays, never inside the FloorPlan —
      // strip those keys before merging into the floor object so normalizeFloor
      // (which spreads its input) can't leak navNodes/navEdges into the floor
      // and break the JSON dirty comparison against the saved baseline.
      const { navNodes: _navNodes, navEdges: _navEdges, ...floorUpdates } = updates;
      updatedCampus.buildings = updatedCampus.buildings.map((b) =>
        b.id === buildingId
          ? {
              ...b,
              floors: b.floors.map((f) =>
                f.id === floorId
                  ? normalizeFloor({ ...f, ...floorUpdates }, { buildingId: b.id })
                  : normalizeFloor(f, { buildingId: b.id })
              ),
            }
          : b
      );
      onUpdate(updatedCampus);
      return updatedCampus;
    },
    [campus, buildingId, floorId, indoorEdges, indoorNodes, mergeFloorNavIntoCampus, onUpdate, rooms, doors, stairs, ramps, elevators]
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
        navEdges: indoorEdges,
      };
      // Record the POST-change state as the new history tip (unless we are in the
      // middle of a drag gesture — that commit happens once on pointer release).
      if (!suppressHistoryRef.current) pushHistory(next);
      buildFloorUpdates(next);
    },
    [buildFloorUpdates, floor.canvasW, floor.canvasH, floor.backgroundColor, floor.showGrid, floor.gridSize, floor.backgroundImage, floor.calibration, floor.label, walls, doors, windows, furniture, stairs, ramps, elevators, labels, pushHistory]
  );

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
    const issues = validateFloorGeometry(floor);
    const errors = issues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      setShowIssues(true);
      toast.error("Resolve floor issues before saving", `${errors.length} blocking issue${errors.length !== 1 ? "s" : ""} found on this floor.`);
      return false;
    }
    setSaving(true);
    try {
      const candidate = buildFloorUpdates({});
      const savedCampus = onSave ? await onSave(candidate) : candidate;
      onUpdate(savedCampus);
      const savedFloor = normalizeFloor(
        savedCampus.buildings.find((b) => b.id === buildingId)?.floors.find((f) => f.id === floorId) ?? floor,
        { buildingId }
      );
      const entry: FloorUndoEntry = {
        ...floorUndoEntryFromFloor(savedFloor),
        navNodes: navGraphRef.current.nodes,
        navEdges: navGraphRef.current.edges,
      };
      baselineFloorRef.current = structuredClone(savedFloor);
      baselineEntryRef.current = structuredClone(entry);
      // Baseline must match the composed dirty key (floor + indoor nav graph).
      setBaselineKey(JSON.stringify(savedFloor) + "|" + JSON.stringify([entry.navNodes ?? [], entry.navEdges ?? []]));
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
  }, [buildFloorUpdates, onSave, onUpdate, buildingId, floorId, floor, resetHistory, toast, isFloorDirty, saving, indoorNavKey]);

  const handlePublish = useCallback(() => {
    const issues = validateFloorGeometry(floor);
    const errors = issues.filter((issue) => issue.severity === "error");
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
  }, [campus, floor, onPublish, publishingEnabled, toast]);

  const switchToFloor = useCallback((targetFloorId: string) => {
    if (targetFloorId === floorId) return;
    clearTransientEditorState();
    onSwitchFloor(targetFloorId);
  }, [clearTransientEditorState, floorId, onSwitchFloor]);

  const requestFloorSwitch = useCallback((targetFloorId: string) => {
    if (targetFloorId === floorId) return;
    setFloorMenu(null);
    clearTransientEditorState();
    if (isFloorDirty) {
      setPendingFloorSwitch(targetFloorId);
      return;
    }
    switchToFloor(targetFloorId);
  }, [clearTransientEditorState, floorId, isFloorDirty, switchToFloor]);

  const updateBuildingFloors = useCallback((nextFloors: FloorPlan[]) => {
    const updatedCampus: Campus = {
      ...campus,
      buildings: campus.buildings.map((b) =>
        b.id === buildingId
          ? { ...b, floors: nextFloors.map((nextFloor) => normalizeFloor(nextFloor, { buildingId: b.id })) }
          : b
      ),
    };
    onUpdate(updatedCampus);
    return updatedCampus;
  }, [buildingId, campus, onUpdate]);

  // ── Floor management — ALL surfaces (the `...` button, tab right-clicks,
  //    the rename/delete dialogs, and the Floor Overview sidebar) route through
  //    these handlers and the shared floorManagement helpers, so no surface can
  //    drift into a separate duplicate/delete/reorder implementation. ──

  const addFloorFromEditor = useCallback(() => {
    const { floors, floor: newFloor } = addFloorToBuilding(building.floors, buildingId);
    updateBuildingFloors(floors);
    clearTransientEditorState();
    setFloorMenu(null);
    onSwitchFloor(newFloor.id);
    toast.success("Floor added", `${newFloor.label} is ready to edit.`);
  }, [building.floors, buildingId, clearTransientEditorState, onSwitchFloor, toast, updateBuildingFloors]);

  const requestDuplicateFloor = useCallback((targetId: string) => {
    // B5 Phase 2: pass the campus nav graph so the duplicate floor also clones
    // its indoor nav graph (new IDs, remapped floorId + linked object refs).
    const { floors, copy, navNodes, navEdges } = duplicateFloorInBuilding(building.floors, buildingId, targetId, campus.navNodes, campus.navEdges);
    if (!copy) {
      setFloorMenu(null);
      return;
    }
    const updatedCampus: Campus = {
      ...campus,
      navNodes: navNodes ?? campus.navNodes,
      navEdges: navEdges ?? campus.navEdges,
      buildings: campus.buildings.map((b) =>
        b.id === buildingId ? { ...b, floors } : b
      ),
    };
    onUpdate(updatedCampus);
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
    toast.success("Floor order updated", `${label} moved ${direction < 0 ? "left" : "right"}.`);
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
    if (floorMenu) {
      setFloorMenu(null);
      return;
    }
    const rect = floorActionsButtonRef.current?.getBoundingClientRect();
    setFloorMenu({ floorId, x: rect?.left ?? 8, y: (rect?.bottom ?? 8) + 4 });
  }, [floorId, floorMenu]);

  const saveAndSwitchFloor = useCallback(async () => {
    if (!pendingFloorSwitch) return;
    const target = pendingFloorSwitch;
    const ok = await handleSave();
    if (!ok) return;
    setPendingFloorSwitch(null);
    switchToFloor(target);
  }, [handleSave, pendingFloorSwitch, switchToFloor]);

  const discardAndSwitchFloor = useCallback(() => {
    if (!pendingFloorSwitch) return;
    const target = pendingFloorSwitch;
    // Restore the FULL saved baseline — floor AND indoor nav graph — so a
    // Discard never leaves unsaved nav edits behind.
    const entry = baselineEntryRef.current ?? floorUndoEntryFromFloor(structuredClone(baselineFloorRef.current));
    buildFloorUpdates(entry);
    resetHistory(entry);
    baselineEntryRef.current = structuredClone(entry);
    setBaselineKey(JSON.stringify(baselineFloorRef.current) + "|" + JSON.stringify([entry.navNodes ?? [], entry.navEdges ?? []]));
    setPendingFloorSwitch(null);
    switchToFloor(target);
  }, [buildFloorUpdates, pendingFloorSwitch, resetHistory, switchToFloor]);

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

  const selectFloorItem = useCallback((selection: FloorSelection | null) => {
    setMultiSelected([]);
    setSelected(selection);
    setShowProperties(true);
  }, []);

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
    setWallStart(null);
    setWallPreview(null);
    setWallSnapIndicator(null);
    setOpeningPreview(null);
    setDP([]);
    if (next !== "measure") setMeasureDraft({});
    setShowMoreTools(false);
  }, [calibratedMetersPerUnit, toast]);

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
    const idsByType = new Map<FloorSelection["type"], Set<string>>();
    scope.forEach((item) => idsByType.set(item.type, new Set([...(idsByType.get(item.type) ?? []), item.id])));
    const layerList = <T extends { id: string; zOrder?: number }>(items: T[], type: FloorSelection["type"]) => {
      const ids = idsByType.get(type);
      if (!ids || ids.size === 0) return items;
      const normalized = sortByZ(items).map((item, index) => ({ ...item, zOrder: index }));
      if (action === "bring-front" || action === "send-back") {
        const selectedItems = normalized.filter((item) => ids.has(item.id));
        const rest = normalized.filter((item) => !ids.has(item.id));
        const nextOrder = action === "bring-front" ? [...rest, ...selectedItems] : [...selectedItems, ...rest];
        return nextOrder.map((item, index) => ({ ...item, zOrder: index }));
      }
      const next = [...normalized];
      if (action === "bring-forward") {
        for (let i = next.length - 2; i >= 0; i -= 1) {
          if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      } else {
        for (let i = 1; i < next.length; i += 1) {
          if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
      return next.map((item, index) => ({ ...item, zOrder: index }));
    };
    updFloor(
      layerList(rooms, "room"),
      fpaths,
      layerList(walls, "wall"),
      layerList(doors, "door"),
      layerList(windows, "window"),
      layerList(furniture, "furniture"),
      layerList(stairs, "stairs"),
      layerList(elevators, "elevator"),
      layerList(labels, "label"),
      layerList(ramps, "ramp")
    );
  }, [selectionScope, rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps, updFloor]);

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
    entries: { type: FloorSelection["type"]; id: string; item: any }[],
    offset: number
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
    const delta = constrainDeltaForBounds(bounds, offset, offset, FP_W, FP_H);
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
    const selectedWallIds = new Set(duplicatedWallIds.keys());
    for (const entry of valid) {
      if (entry.type === "room") {
        const copy = translateFloorItem("room", { ...(entry.item as FloorRoom), id: duplicatedRoomIds.get(entry.id) ?? genId("rm"), name: `${(entry.item as FloorRoom).name} Copy` }, delta.dx, delta.dy, FP_W, FP_H) as FloorRoom;
        nextRooms.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "wall") {
        const source = entry.item as FloorWall;
        const startAnchor = source.startAnchor && duplicatedRoomIds.has(source.startAnchor.roomId)
          ? { ...source.startAnchor, roomId: duplicatedRoomIds.get(source.startAnchor.roomId)! }
          : undefined;
        const endAnchor = source.endAnchor && duplicatedRoomIds.has(source.endAnchor.roomId)
          ? { ...source.endAnchor, roomId: duplicatedRoomIds.get(source.endAnchor.roomId)! }
          : undefined;
        const copy = translateFloorItem("wall", { ...source, id: duplicatedWallIds.get(entry.id) ?? genId("wl"), startAnchor, endAnchor }, delta.dx, delta.dy, FP_W, FP_H) as FloorWall;
        nextWalls.push(copy); nextIds.push(copy.id);
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
        if ((entry.item as FloorDoor).wallId && selectedWallIds.has((entry.item as FloorDoor).wallId!)) continue;
        const copy = translateFloorItem("door", { ...(entry.item as FloorDoor), id: genId("dr") }, delta.dx, delta.dy, FP_W, FP_H) as FloorDoor;
        nextDoors.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "window") {
        if ((entry.item as FloorWindow).wallId && selectedWallIds.has((entry.item as FloorWindow).wallId!)) continue;
        const copy = translateFloorItem("window", { ...(entry.item as FloorWindow), id: genId("wn") }, delta.dx, delta.dy, FP_W, FP_H) as FloorWindow;
        nextWindows.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "furniture") {
        const copy = translateFloorItem("furniture", { ...(entry.item as FloorFurniture), id: genId("fn"), name: `${(entry.item as FloorFurniture).name} Copy` }, delta.dx, delta.dy, FP_W, FP_H) as FloorFurniture;
        nextFurniture.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "stairs") {
        const copy = translateFloorItem("stairs", { ...(entry.item as FloorStairs), id: genId("st") }, delta.dx, delta.dy, FP_W, FP_H) as FloorStairs;
        nextStairs.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "ramp") {
        const copy = translateFloorItem("ramp", { ...(entry.item as FloorRamp), id: genId("rmp") }, delta.dx, delta.dy, FP_W, FP_H) as FloorRamp;
        nextRamps.push(copy); nextIds.push(copy.id);
      } else if (entry.type === "elevator") {
        const copy = translateFloorItem("elevator", { ...(entry.item as FloorElevatorItem), id: genId("ev") }, delta.dx, delta.dy, FP_W, FP_H) as FloorElevatorItem;
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
      const copy = translateFloorItem("room", { ...(item as FloorRoom), id: genId("rm"), name: `${(item as FloorRoom).name} Copy` }, offset, offset, FP_W, FP_H) as FloorRoom;
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
      const copy = translateFloorItem("elevator", { ...(item as FloorElevatorItem), id: genId("ev") }, offset, offset, FP_W, FP_H) as FloorElevatorItem;
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
    const ids: { type: FloorSelection["type"]; id: string }[] = [];
    if (multiSelected.length > 1) {
      for (const id of multiSelected) {
        const sel = selectionForId(id);
        if (sel) ids.push(sel);
      }
    } else if (selected) {
      ids.push({ type: selected.type, id: selected.id });
    }
    if (ids.length === 0) {
      toast.info("Nothing to copy", "Select a floor object first (Ctrl+C).");
      return;
    }
    setClipboard(ids);
    pasteOffsetRef.current = 12;
    toast.success("Copied", `${ids.length} object${ids.length !== 1 ? "s" : ""} copied (Ctrl+V to paste).`);
  }, [multiSelected, selected, selectionForId, toast]);

  const pasteSelection = useCallback(() => {
    if (!clipboard || clipboard.length === 0) {
      toast.info("Nothing to paste", "Copy a floor object first (Ctrl+C).");
      return;
    }
    const entries = clipboard
      .map((sel) => {
        const item = getSelectionItem(sel.type, sel.id);
        return item ? { type: sel.type, id: sel.id, item: structuredClone(item) } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry);
    if (entries.length === 0) {
      toast.info("Nothing to paste", "The copied object no longer exists on this floor.");
      return;
    }
    const nextIds = duplicateEntrySet(entries, pasteOffsetRef.current);
    pasteOffsetRef.current += 12;
    if (nextIds.length === 1) {
      // Single paste feels like the single-item duplicate: select the copy directly.
      setMultiSelected([]);
      setSelected({ type: entries[0].type, id: nextIds[0] });
    }
    toast.success("Pasted", `${nextIds.length} object${nextIds.length !== 1 ? "s" : ""} pasted with fresh IDs.`);
  }, [clipboard, duplicateEntrySet, getSelectionItem, toast]);

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
      const roomAnchor = roomAnchorAtPoint(room, point, SNAP_THRESHOLD);
      if (!roomAnchor) continue;
      if (roomAnchor.anchor.offset === 0 || roomAnchor.anchor.offset === 1) {
        if (!bestRoomCorner || roomAnchor.d < bestRoomCorner.d) bestRoomCorner = { ...roomAnchor, roomAnchor: roomAnchor.anchor };
      } else {
        const edge = roomGuideSegments(room).find((segment) => segment.edge === roomAnchor.anchor.edge)!;
        if (!bestRoomEdge || roomAnchor.d < bestRoomEdge.d) bestRoomEdge = { ...roomAnchor, edge, roomAnchor: roomAnchor.anchor };
      }
    }
    return bestEndpoint ?? bestSegment ?? bestRoomCorner ?? bestRoomEdge ?? null;
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

  // Structural wall snapping is resolved from the RAW pointer FIRST (endpoint →
  // segment → boundary). A stronger structural target always beats grid/angle
  // assistance and is never moved away from afterwards — the exact coordinate
  // becomes the committed geometry, so visually connected walls truly meet with
  // no 2–5px stroke/rounding gaps.
  const wallDrawCursor = useCallback((raw: { x: number; y: number }, shiftHeld: boolean) => {
    const structural = findWallSnapTarget(raw);
    if (structural) return { point: structural, indicator: { x: structural.x, y: structural.y } };
    const s = (v: number) => (snapOn ? snapToGrid(v, floorGridSize) : Math.round(v));
    let ex = s(raw.x);
    let ey = s(raw.y);
    // 45° angle assistance while drawing (Shift held = free drawing)
    if (!shiftHeld && wallStart) {
      const dx = ex - wallStart.x;
      const dy = ey - wallStart.y;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const snappedAngle = snapAngleDeg(angle, WALL_SNAP_ANGLE);
      const len = Math.sqrt(dx * dx + dy * dy);
      ex = wallStart.x + Math.cos(snappedAngle * (Math.PI / 180)) * len;
      ey = wallStart.y + Math.sin(snappedAngle * (Math.PI / 180)) * len;
    }
    const bounded = { x: clamp(ex, 0, FP_W), y: clamp(ey, 0, FP_H) };
    return { point: snapPointToFloorBounds(bounded, FP_W, FP_H, SNAP_THRESHOLD), indicator: findSnapIndicator(bounded) };
  }, [FP_W, FP_H, findWallSnapTarget, findSnapIndicator, snapOn, floorGridSize, wallStart]);

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
    const structural = findWallSnapTarget(raw, ep.wallId);
    if (structural) return { point: structural, indicator: { x: structural.x, y: structural.y } };
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
    }
    const bounded = { x: clamp(nx, 0, FP_W), y: clamp(ny, 0, FP_H) };
    return { point: snapPointToFloorBounds(bounded, FP_W, FP_H, SNAP_THRESHOLD), indicator: findSnapIndicator(bounded) };
  }, [FP_W, FP_H, findWallSnapTarget, findSnapIndicator, snapOn, floorGridSize]);

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

  const floorIssues = useMemo<FloorIssue[]>(() => validateFloorGeometry(floor), [floor]);
  const blockingIssues = floorIssues.filter((issue) => issue.severity === "error");

  // B5 Phase 2.11: LIVE validity of every existing indoor edge — the same strict
  // thick-wall model as Connect creation, recomputed against the CURRENT nodes
  // and authored bends. An invalid edge renders RED and stays editable so the
  // admin can repair it (Remove Bend may legitimately invalidate an edge). This
  // derived set is the authoring invariant future routing/publish code can rely
  // on — no persisted field, no migration.
  const navBlockedEdgeIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const e of indoorEdges) {
      if (navEdgeIsBlocked(e, indoorNodes, walls, doors)) blocked.add(e.id);
    }
    return blocked;
  }, [indoorEdges, indoorNodes, walls, doors]);
  const totalIssues = floorIssues.length + navBlockedEdgeIds.size;
  const hasBlockingIssues = blockingIssues.length > 0 || navBlockedEdgeIds.size > 0;

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
    setTool("select");
    setCalibrationDraft({ active: true, distanceInput: "" });
  }, [floor.backgroundImage, toast]);

  const removeCalibration = useCallback(() => {
    updateFloorMetadata({ calibration: undefined }, "Floor scale calibration removed");
    if (tool === "measure") setTool("select");
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
        || draft.perimeterColor !== (firstPerimeter?.color ?? "#334155")
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
      perimeterColor: firstPerimeter?.color ?? "#334155",
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
        return { kind: circ.kind, id: circ.id, x: Math.round(owner.x + owner.width / 2), y: Math.round(owner.y + owner.height / 2) };
      }
    }
    const room = findRoomAtPoint(rooms, pt);
    if (room) return { kind: "room", id: room.id, x: Math.round(room.x + room.w / 2), y: Math.round(room.y + room.h / 2) };
    return null;
  };

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
      toast.info("Nothing selected", "Select a waypoint or path to remove it.");
      return;
    }
    const nodeIdSet = new Set(nodeIds);
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
      nodeIds.length > 0 && removedEdges.length > 0 ? "Waypoints removed"
      : nodeIds.length > 0 ? "Waypoint removed"
      : "Path removed",
      removedEdges.length > 0
        ? `Removed ${nodeIds.length} waypoint${nodeIds.length !== 1 ? "s" : ""} and ${removedEdges.length} path${removedEdges.length !== 1 ? "s" : ""}.`
        : "The selected waypoint was removed."
    );
  }, [commitNavGraph, indoorEdges, indoorNodes, navMultiSelected, navSelected, toast]);

  const navEraseAt = (pt: { x: number; y: number }) => {
    const hitNode = findNavNodeAtPoint(indoorNodes, pt);
    if (hitNode) { deleteNavSelection({ type: "node", id: hitNode.id }); return; }
    const hitEdge = indoorEdges.find((edge) => {
      const a = indoorNodes.find((n) => n.id === edge.startNodeId);
      const b = indoorNodes.find((n) => n.id === edge.endNodeId);
      if (!a || !b) return false;
      return distToSegment(pt, { x: a.x, y: a.y }, { x: b.x, y: b.y }) <= 10;
    });
    if (hitEdge) { deleteNavSelection({ type: "edge", id: hitEdge.id }); return; }
    toast.info("Nothing to remove", "Click a waypoint or path to remove it.");
  };

  const handleNavNodeDown = (e: React.MouseEvent, node: NavigationNode) => {
    e.stopPropagation();
    if (isSpacePressed()) { startPan(e); return; }
    const pt = navPointFromEvent(e);
    if (navTool === "erase") { deleteNavSelection({ type: "node", id: node.id }); return; }
    if (navTool === "waypoint" || navTool === "destination" || navTool === "link") {
      // Waypoint / Destination / Link Location on an existing node just selects
      // it (no duplicate) — the canonical node is reused.
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      setShowProperties(true);
      setNavTool("select");
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
    navDragRef.current = { ids, origins, sx: pt.x, sy: pt.y };
  };

  const handleNavEdgeDown = (e: React.MouseEvent, edge: NavigationEdge) => {
    e.stopPropagation();
    if (isSpacePressed()) { startPan(e); return; }
    if (navTool === "erase") { deleteNavSelection({ type: "edge", id: edge.id }); return; }
    if (navTool === "connect") return;
    // B5 Phase 2.7: dragging a SEGMENT of the already-selected segmented path
    // translates it perpendicular (draw.io-style); a plain click still selects.
    const isSel = navSelected?.type === "edge" && navSelected.id === edge.id;
    if (navTool === "select" && isSel && edge.bendPoints && edge.bendPoints.length > 0) {
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
        // Only axis-aligned segments are draggable (Straighten diagonals are not).
        if (p0.x === p1.x || p0.y === p1.y) {
          suppressHistoryRef.current = true;
          gestureMoved.current = false;
          navDragWallWarnedRef.current = false;
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
            isHorizontal: p0.y === p1.y,
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

  const switchFloorEditorMode = useCallback((nextMode: FloorEditorMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
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
    setNavAlignGuides([]);
    navDragWallWarnedRef.current = false;
    navLibraryDragRef.current = null;
    navBendDragRef.current = null;
    navSegDragRef.current = null;
    setRubberBand(null);
    if (nextMode === "navigation") {
      setNavTool("select");
      setSelected(null);
      setMultiSelected([]);
      // B5 Phase 2.1: the Properties sidebar represents the CURRENT SELECTION —
      // entering Navigation must never auto-open it just to show tutorial text.
      setShowProperties(false);
    } else {
      setNavSelected(null);
      setNavMultiSelected([]);
      setTool("select");
    }
  }, [mode]);

  const selectNavTool = useCallback((id: "select" | "pan" | "waypoint" | "destination" | "connect" | "link" | "erase") => {
    if (id !== "connect") { setNavConnectStart(null); setNavPreview(null); setNavConnectBends([]); navConnectBendGroupsRef.current = []; }
    setNavTool(id);
    setNavEraseHover(null);
    setNavNodeHover(null);
    setNavAlignGuides([]);
    if (id !== "select") setNavSelectedBend(null);
    setNavSegmentHover(null);
  }, []);

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
    };
    if (startId === endId) {
      toast.info("Cannot connect a waypoint to itself", "Pick a different destination.");
      clearConnect();
      return false;
    }
    const dup = edges.find((e) =>
      (e.startNodeId === startId && e.endNodeId === endId) ||
      (e.bidirectional !== false && e.startNodeId === endId && e.endNodeId === startId)
    );
    if (dup) {
      toast.info("Those points are already connected", "Select the existing path to edit it.");
      clearConnect();
      return false;
    }
    const a = nodes.find((n) => n.id === startId);
    const b = nodes.find((n) => n.id === endId);
    if (!a || !b) return false;
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
    const edge = createNavEdge({ id: genId("ne"), startNodeId: startId, endNodeId: endId, nodes, type: "hallway" });
    if (bends.length > 0 && polyline) {
      // B5 Phase 2.8: normalize the committed polyline (drop duplicate /
      // collinear bends) so authored geometry stays clean.
      const normalized = normalizeBendPoints(bends.map((bp) => ({ x: Math.round(bp.x), y: Math.round(bp.y) })));
      edge.bendPoints = normalized;
      // Distance/weight = TOTAL polyline length (start → bends → end).
      edge.distance = navEdgePolylineDistance([polyline[0], ...normalized, polyline[polyline.length - 1]]);
    }
    commitNavGraph(nodes, [...edges, edge]);
    setNavSelected({ type: "edge", id: edge.id });
    setNavMultiSelected([]);
    setShowProperties(true);
    clearConnect();
    toast.success("Connection created", `Waypoints connected (${edge.distance} units).`);
    return true;
  }, [commitNavGraph, doors, indoorEdges, indoorNodes, toast, walls]);

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
    const hit = findNavNodeAtPoint(indoorNodes, pt);
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
        name: room.name, type: "room_access", roomId: room.id,
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
      const cx = Math.round(owner.x + owner.width / 2);
      const cy = Math.round(owner.y + owner.height / 2);
      const type = circ.kind === "stairs" ? "stair" : circ.kind === "elevator" ? "elevator" : "ramp";
      const node = createIndoorNavNode({
        id: genId("nn"), x: cx, y: cy, buildingId, floorId, campusId: campus.id,
        name: circ.kind === "stairs" ? (owner as FloorStairs).label ?? "Stairs" : circ.kind === "elevator" ? (owner as FloorElevatorItem).label ?? "Elevator" : (owner as FloorRamp).label ?? "Ramp",
        type,
        stairId: circ.kind === "stairs" ? circ.id : undefined,
        elevatorId: circ.kind === "elevator" ? circ.id : undefined,
        rampId: circ.kind === "ramp" ? circ.id : undefined,
      });
      commitNavGraph([...indoorNodes, node], indoorEdges);
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      return { kind: "node" as const, node };
    }
    // 5. Free outdoor-style indoor waypoint.
    return { kind: "free" as const, x: pt.x, y: pt.y };
  }, [buildingId, campus.id, commitNavGraph, doors, elevators, floorId, indoorEdges, indoorNodes, ramps, rooms, stairs, toast, walls]);

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
      // Existing node under the pointer → select it (never duplicate).
      const existing = findNavNodeAtPoint(indoorNodes, pt);
      if (existing) {
        setNavSelected({ type: "node", id: existing.id });
        setNavMultiSelected([]);
        setShowProperties(true);
        setNavTool("select");
        return;
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
      const result = navWaypointAt(pt);
      if (result.kind === "node") {
        setNavSelected({ type: "node", id: result.node.id });
        setNavMultiSelected([]);
        setShowProperties(true);
        setNavTool("select");
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
  const navConnectAtPoint = (pt: { x: number; y: number }) => {
    const result = navWaypointAt(pt);
    if (!navConnectStart) {
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
      toast.info("Nothing to copy", "Select free waypoints first (Ctrl+C).");
      return;
    }
    navClipboardRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    navPasteOffsetRef.current = 12;
    if (linkedCount > 0) {
      toast.info("Linked waypoints not copied", `${linkedCount} linked waypoint${linkedCount !== 1 ? "s" : ""} follow their physical object and cannot be copied.`);
    } else {
      toast.success("Copied", `${nodes.length} waypoint${nodes.length !== 1 ? "s" : ""} copied (Ctrl+V to paste).`);
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
      toast.info("Nothing to paste", "Copy waypoints first (Ctrl+C).");
      return;
    }
    const count = pasteNavGraph(navClipboardRef.current.nodes, navClipboardRef.current.edges, navPasteOffsetRef.current);
    navPasteOffsetRef.current += 12;
    toast.success("Waypoints pasted", `${count} waypoint${count !== 1 ? "s" : ""} pasted with fresh connections.`);
  }, [pasteNavGraph, toast]);

  const duplicateNavSelection = useCallback(() => {
    const { nodes, edges, linkedCount } = navSelectionGraph();
    if (nodes.length === 0) {
      toast.info("Nothing to duplicate", "Select free waypoints first (Ctrl+D).");
      return;
    }
    if (linkedCount > 0) {
      toast.info("Linked waypoints excluded", `${linkedCount} linked waypoint${linkedCount !== 1 ? "s" : ""} follow their physical object and cannot be duplicated.`);
    }
    const count = pasteNavGraph(nodes, edges, 12);
    toast.success("Waypoints duplicated", `${count} waypoint${count !== 1 ? "s" : ""} duplicated.`);
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
      // B5 Phase 2.3: reject free drops on linked-location semantic targets
      // (Room center zone / Door / Stair / Elevator / Ramp) — no orphan node.
      const blocked = linkedPlacementBlockAt(pt, rooms, doors, stairs, elevators, ramps);
      if (blocked) {
        toast.info("Use Link Location for this object", "Rooms, doors and circulation points link through Link Location.");
        return;
      }
      const node = createIndoorNavNode({
        id: genId("nn"), x: pt.x, y: pt.y, buildingId, floorId, campusId: campus.id,
        name: kind === "destination" ? "Destination" : "Waypoint",
        type: kind === "destination" ? "room_access" : "hallway",
      });
      commitNavGraph([...indoorNodes, node], indoorEdges);
      setNavSelected({ type: "node", id: node.id });
      setNavMultiSelected([]);
      setShowProperties(true);
      setNavTool("select");
      toast.success(kind === "destination" ? "Destination placed" : "Waypoint placed", "Added to the walking network.");
      return;
    }
    // B5 Phase 2.2: linked kinds are NO LONGER draggable — the unified Link
    // Location tool infers the type from the actual object under the pointer,
    // so a wrong-type drop can never occur. Defensive reject for unknown kinds.
    toast.info("Use Link Location", "Drag Waypoints and Destinations; link Rooms, Doors, Stairs, Elevators and Ramps with Link Location.");
  }, [buildingId, campus.id, commitNavGraph, doors, elevators, floorId, indoorEdges, indoorNodes, ramps, rooms, stairs, toast]);

  const handleSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (navMode) { handleNavSvgDown(e); return; }
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
            dragging.current = { entries, sx: pt.x, sy: pt.y, fromBackground: true };
            setSelected(null);
            setShowProperties(true);
            return;
          }
        }
        if (!e.shiftKey) {
          setSelected(null);
          setMultiSelected([]);
          setShowProperties(true);
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
          thickness: 4, color: "#64748b", material: "concrete",
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
      const fx = clamp(clamped.x - furnitureTemplate.width / 2, 0, FP_W - furnitureTemplate.width);
      const fy = clamp(clamped.y - furnitureTemplate.height / 2, 0, FP_H - furnitureTemplate.height);
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
        setNavTargetHover(resolveNavTargetAt(pt));
      } else {
        setNavTargetHover(null);
      }
      if (navConnectStart) {
        setNavPreview(pt);
        // B5 Phase 2.9: the pin-snap guide feedback is transient — it appears
        // right after an empty-click pin and clears once the pointer moves.
        setNavAlignGuides([]);
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
        if (!segEdge || !segEdge.bendPoints || segEdge.bendPoints.length === 0) { navSegDragRef.current = null; return; }
        const delta = segDrag.isHorizontal
          ? Math.round(boundedPt.y) - segDrag.oy
          : Math.round(boundedPt.x) - segDrag.ox;
        if (delta !== 0) gestureMoved.current = true;
        if (delta === 0) return;
        // Clamp the translation delta so the segment tracks the cursor 1:1 and
        // stays inside floor bounds (same intuitive rate as other draggables).
        let nextBends = translateOrthogonalSegment(segDrag.origPts, segDrag.origBends, segDrag.segIndex, delta, segDrag.isHorizontal);
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
        // B5 Phase 2.8: always-on ALIGNMENT GUIDES (outdoor-editor philosophy —
        // no Shift required) — snap the dragged group's bbox edges/center to
        // another routing node's X or Y within a modest threshold and show a
        // temporary guide. Free nodes only; linked nodes stay attached to owners.
        {
          const xs = drag.origins.map((o) => o.x);
          const ys = drag.origins.map((o) => o.y);
          const snap = navGroupAlignSnap(
            {
              minX: Math.min(...xs),
              minY: Math.min(...ys),
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            },
            dx,
            dy,
            indoorNodes.filter((n) => !drag.ids.includes(n.id))
          );
          dx = snap.dx;
          dy = snap.dy;
          setNavAlignGuides(snap.guides);
        }
        const originById = new Map(drag.origins.map((o) => [o.id, o]));
        const nextNodes = indoorNodes.map((n) => {
          const origin = originById.get(n.id);
          if (!origin) return n;
          const x = clamp(Math.round(origin.x + dx), 0, FP_W);
          const y = clamp(Math.round(origin.y + dy), 0, FP_H);
          if (x === n.x && y === n.y) return n;
          return { ...n, x, y };
        });
        commitNavGraph(nextNodes, indoorEdges);
        return;
      }
      return;
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
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (length < OPENING_MIN_WIDTH) return;
      const minWidth = state.type === "door" ? doorMinWidth(effectiveDoorType(state.origin as FloorDoor)) : OPENING_MIN_WIDTH;
      const maxWidth = state.type === "door" ? doorMaxWidth(effectiveDoorType(state.origin as FloorDoor)) : WINDOW_MAX_WIDTH;
      const width = clamp(state.origin.width, Math.min(minWidth, length), maxOpeningWidthForWall(wall, maxWidth, minWidth));
      const offset = clampWallOpeningOffset(wall, width, nearest.t);
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
      setRoomDrag({ ...roomDrag, cx: clamp(s(pt.x), 0, FP_W), cy: clamp(s(pt.y), 0, FP_H) });
      return;
    }

    if (resizing.current) {
      const state = resizing.current;
      const origin: FloorRoom = { ...rooms.find((r) => r.id === state.id)!, x: state.ox, y: state.oy, w: state.ow, h: state.oh, rotation: state.rotation ?? 0 };
      const dx = Math.round(e.clientX - state.sx);
      const dy = Math.round(e.clientY - state.sy);
      const resized = resizeRoomWithinFloor(origin, state.corner, dx, dy, FP_W, FP_H);
      const nextRooms = rooms.map((r) => r.id === state.id ? resized : r);
      const anchored = anchoredRoomUpdate(nextRooms, walls, new Set([state.id]));
      if (anchored.blocked) return;
      if (resized.x !== origin.x || resized.y !== origin.y || resized.w !== origin.w || resized.h !== origin.h) gestureMoved.current = true;
      updFloor(nextRooms, fpaths, anchored.walls);
      return;
    }

    if (furnitureResizing.current) {
      const state = furnitureResizing.current;
      const dx = Math.round(e.clientX - state.sx);
      const dy = Math.round(e.clientY - state.sy);
      const resized = resizeFurnitureWithinFloor(state.origin, state.corner, dx, dy, FP_W, FP_H, e.shiftKey);
      if (
        resized.x !== state.origin.x ||
        resized.y !== state.origin.y ||
        resized.width !== state.origin.width ||
        resized.height !== state.origin.height
      ) {
        gestureMoved.current = true;
      }
      updFloor(rooms, fpaths, walls, doors, windows, furniture.map((f) => f.id === state.id ? resized : f));
      return;
    }

    if (circulationResizing.current) {
      const state = circulationResizing.current;
      const dx = Math.round(e.clientX - state.sx);
      const dy = Math.round(e.clientY - state.sy);
      const resized = resizeCirculationWithinFloor(state.origin as any, state.corner, dx, dy, FP_W, FP_H, e.shiftKey);
      if (
        resized.x !== state.origin.x ||
        resized.y !== state.origin.y ||
        resized.width !== state.origin.width ||
        resized.height !== state.origin.height
      ) {
        gestureMoved.current = true;
      }
      if (state.type === "stairs") {
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.map((s) => s.id === state.id ? resized : s));
      } else if (state.type === "ramp") {
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators, labels, ramps.map((r) => r.id === state.id ? resized : r));
      } else {
        updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs, elevators.map((el) => el.id === state.id ? resized : el));
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
    const nextRooms = rooms.map((r) => byId.get(r.id) ?? r);
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
    if (dx !== 0 || dy !== 0) gestureMoved.current = true;
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
  };

  const handleSvgUp = () => {
    endPan();
    if (navMode) {
      setNavTargetHover(null);
      setNavNodeHover(null);
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
        const captured = rect.w >= 3 || rect.h >= 3
          ? indoorNodes.filter((n) =>
              n.x >= rect.x - 2 && n.x <= rect.x + rect.w + 2 &&
              n.y >= rect.y - 2 && n.y <= rect.y + rect.h + 2
            ).map((n) => n.id)
          : [];
        if (captured.length > 0) {
          setNavSelected({ type: "node", id: captured[captured.length - 1] });
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
    if (roomDrag && tool === "room") {
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 20);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 15);
      const rx = clamp(Math.min(roomDrag.sx, roomDrag.cx), 0, FP_W - rw);
      const ry = clamp(Math.min(roomDrag.sy, roomDrag.cy), 0, FP_H - rh);
      const newRoom: FloorRoom = {
        id: genId("rm"), name: "Room",
        type: sidebarCategory && ROOM_MAP[sidebarCategory] ? sidebarCategory : "classroom", x: Math.round(rx), y: Math.round(ry),
        w: Math.round(rw), h: Math.round(rh),
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
      const rw = Math.max(Math.abs(roomDrag.cx - roomDrag.sx), 16);
      const rh = Math.max(Math.abs(roomDrag.cy - roomDrag.sy), 12);
      const rx = clamp(Math.min(roomDrag.sx, roomDrag.cx), 0, FP_W - rw);
      const ry = clamp(Math.min(roomDrag.sy, roomDrag.cy), 0, FP_H - rh);
      // Auto-generate a sharedId so this stair can be linked across floors
      const stairSharedId = `shared_stair_${buildingId}_${(        stairs.filter(s => s.label === 'Stairs').length + 1)}`;
      const newStairs: FloorStairs = {
        id: genId("st"), x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        rotation: 0, direction: "both", label: "Stairs",
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
      // Auto-generate a sharedId so this elevator can be linked across floors
      const elevatorSharedId = `shared_el_${buildingId}_${(elevators.filter(e => e.label === 'Elevator').length + 1)}`;
      const newElevator: FloorElevatorItem = {
        id: genId("ev"), x: Math.round(rx), y: Math.round(ry),
        width: Math.round(rw), height: Math.round(rh),
        rotation: 0, doorWidth: 6, label: "Elevator",
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
    if (navMode) return;
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
    if (navMode) return; // Navigation mode: floor objects are context-only.
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
      return;
    }
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
    if (navMode) return; // Navigation mode: floor objects are context-only.
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
        if (navMode) {
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
      if ((e.key === "Delete" || e.key === "Backspace") && navMode) {
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
        if (navMode) {
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
          // Link Location / Destination return to Select on cancel.
          if (navTool === "link" || navTool === "destination") setNavTool("select");
          return;
        }
        setWallStart(null); setWallPreview(null); setWallSnapIndicator(null); setDP([]);
        setSelected(null); setMultiSelected([]); setRubberBand(null); setContextMenu(null);
        setCalibrationDraft({ active: false, distanceInput: "" }); setMeasureDraft({});
        suppressHistoryRef.current = false; gestureMoved.current = false; dragging.current = null;
        if (tool === "path" || tool === "measure") setTool("select");
      }
      if (navMode) {
        if (e.key === "v" || e.key === "V") selectNavTool("select");
        if (e.key === "h" || e.key === "H") selectNavTool("pan");
        if (e.key === "n" || e.key === "N") selectNavTool("waypoint");
        if (e.key === "c" || e.key === "C") selectNavTool("connect");
        if (e.key === "e" || e.key === "E") selectNavTool("erase");
        return;
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
  }, [allSelectableIds, selected, multiSelected, tool, navTool, undo, redo, applyEntry, handleSave, fitFloor, switchTool, deleteSelection, duplicateSelection, copySelection, pasteSelection, copyNavSelection, pasteNavSelection, duplicateNavSelection, selectFloorItem, selectionForId, navMode, indoorNodes, deleteNavSelection, selectNavTool, navSelectedBend, removeBendFromEdge, navConnectStart, navConnectBends]);

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
  const moreTools = [
    { id: "wall" as SimpleTool, icon: SeparatorHorizontal, label: "Wall", key: "W" },
    { id: "room" as SimpleTool, icon: SquareIcon, label: "Room", key: "R" },
    { id: "door" as SimpleTool, icon: DoorOpen, label: "Door", key: "D" },
    { id: "window" as SimpleTool, icon: LandPlot, label: "Window", key: "I" },
    { id: "stairs" as SimpleTool, icon: MoveVertical, label: "Stairs", key: "S" },
    { id: "ramp" as SimpleTool, icon: Navigation, label: "Ramp", key: "A" },
    { id: "elevator" as SimpleTool, icon: Binary, label: "Elevator", key: "L" },
    { id: "furniture" as SimpleTool, icon: Sofa, label: "Furniture", key: "F" },
    { id: "text" as SimpleTool, icon: Text, label: "Text", key: "T" },
    { id: "path" as SimpleTool, icon: GitBranchIcon, label: "Path", key: "P" },
    { id: "erase" as SimpleTool, icon: TrashIcon, label: "Erase", key: "E" },
  ];
  const navTools = [
    { id: "select" as const, icon: MousePointer2, label: "Select", hint: "Select waypoints and paths" },
    { id: "pan" as const, icon: Hand, label: "Pan", hint: "Pan the floor canvas" },
    { id: "connect" as const, icon: Link2, label: "Connect", hint: "Connect routing points and locations" },
    { id: "erase" as const, icon: TrashIcon, label: "Remove", hint: "Remove — Delete the selected waypoint or path" },
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
        <div className="flex items-center h-10 px-2 gap-1">
          {/* Breadcrumb */}
          <button onClick={onBack} className="flex items-center gap-1 h-7 px-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-[11px] font-semibold shrink-0 group">
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">{campus.name}</span>
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="text-[11px] text-muted-foreground font-semibold shrink-0">{building.code}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="text-xs font-extrabold text-foreground truncate max-w-[120px]">{floor.label}</span>
          <span className="text-[9px] text-muted-foreground/50 ml-1 font-medium shrink-0">
            ({allItemsCount} item{allItemsCount !== 1 ? "s" : ""})
          </span>

          {/* Floor tabs — right-clicking a tab opens the shared floor actions menu for THAT floor */}
          <div className="flex items-center gap-0.5 ml-2 overflow-x-auto no-scrollbar">
            {building.floors.map((f) => (
              <button key={f.id}
                className={cn("shrink-0 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                  f.id === floorId ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                onClick={() => requestFloorSwitch(f.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFloorMenu({ floorId: f.id, x: e.clientX, y: e.clientY });
                }}>
                {f.label}
              </button>
            ))}
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
          </div>

          <div className="flex-1" />

          {/* Mode switch — Design architectural authoring vs Navigation graph authoring */}
          <div className="flex items-center p-0.5 rounded-lg border border-border bg-muted/30" role="tablist" aria-label="Floor editor mode">
            {[
              { id: "structure" as FloorEditorMode, label: "Design" },
              { id: "navigation" as FloorEditorMode, label: "Navigation" },
            ].map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => switchFloorEditorMode(m.id)}
                className={cn("h-6 px-2.5 rounded-md text-[10px] font-extrabold transition-all",
                  mode === m.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                title={m.id === "structure" ? "Edit rooms, walls, doors and furniture" : "Author the indoor walking network"}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Contextual tools — Navigation toolbar replaces the design toolbar.
              B5 Phase 2.2: a restrained keyed fade/slide (150–220ms) so the
              switch feels intentional; the canvas itself never remounts. */}
          <motion.div
            key={navMode ? "nav-toolbar" : "design-toolbar"}
            initial={{ opacity: 0, x: navMode ? 6 : -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center"
          >
          {navMode ? (
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/30" data-testid="floor-nav-toolbar">
              {navTools.map((t) => {
                const Icon = t.icon;
                const isActive = navTool === t.id;
                return (
                  <button key={t.id} onClick={() => selectNavTool(t.id)}
                    title={t.hint}
                    aria-label={t.hint}
                    className={cn("flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                      isActive ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                    <Icon className="h-3 w-3" />
                    <span className="hidden md:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
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
              <div className="relative">
                <button
                  onClick={() => setShowMoreTools((v) => !v)}
                  title="More tools"
                  aria-label="More tools"
                  className={cn("flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-extrabold transition-all",
                    showMoreTools ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">More tools</span>
                </button>
                {showMoreTools && (
                  <div className="absolute right-0 top-8 z-50 w-56 rounded-xl border border-border bg-card shadow-2xl p-1.5 grid grid-cols-2 gap-1">
                    {moreTools.map((t) => {
                      const Icon = t.icon;
                      const isActive = tool === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => switchTool(t.id)}
                          className={cn("flex items-center gap-2 h-8 px-2 rounded-lg text-[11px] font-bold transition-all text-left",
                            isActive && t.id === "erase" ? "bg-destructive text-destructive-foreground"
                            : isActive ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{t.label}</span>
                          <span className="ml-auto text-[8px] opacity-70">{t.key}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          </motion.div>

          {selectedLabel && multiSelected.length <= 1 && !inlineLabelEdit && (
            <>
              <div className="w-px h-5 bg-border mx-0.5" />
              <div
                className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5"
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

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Undo/Redo */}
          <button onClick={() => applyEntry(undo())} disabled={!canUndo}
            className={cn("flex items-center justify-center h-7 w-7 rounded-md transition-all",
              canUndo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed")}
            title="Undo (Ctrl+Z)">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => applyEntry(redo())} disabled={!canRedo}
            className={cn("flex items-center justify-center h-7 w-7 rounded-md transition-all",
              canRedo ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-muted-foreground/40 cursor-not-allowed")}
            title="Redo (Ctrl+Y)">
            <Redo2 className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Snap toggle */}
          <button onClick={() => setSnapOn((v) => !v)}
            title="Toggle grid snap"
            className={cn("flex items-center justify-center h-7 px-2 rounded-md text-[10px] font-bold transition-all border",
              snapOn ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}>
            <Grid3X3 className="h-3 w-3 mr-1" />
            Grid
          </button>

          {/* B5 Phase 2.5: Design-mode READ-ONLY navigation overlay — a view
              preference for alignment/reference (never marks the draft dirty). */}
          {!navMode && (
            <button onClick={() => setShowNavOverlay((v) => !v)}
              title="Show the navigation graph as a read-only overlay while editing the floor"
              aria-label="Show Navigation overlay"
              className={cn("flex items-center justify-center h-7 px-2 rounded-md text-[10px] font-bold transition-all border",
                showNavOverlay ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Waypoints className="h-3 w-3 mr-1" />
              Show Navigation
            </button>
          )}

          <button onClick={fitFloor}
            title="Fit Floor"
            aria-label="Fit Floor"
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          <button onClick={() => setShowIssues(true)}
            title="Issues"
            aria-label={`Issues: ${totalIssues}`}
            className={cn("flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-extrabold transition-all border",
              hasBlockingIssues ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border text-emerald-600 hover:bg-muted")}>
            {hasBlockingIssues ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            Issues {totalIssues}
          </button>

          <button onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>

          {/* Properties toggle */}
          <button onClick={() => setShowProperties((v) => !v)}
            className={cn("flex items-center justify-center h-7 w-7 rounded-md transition-all",
              showProperties ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
            title="Toggle Properties Panel">
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>

          {/* Floor Settings dialog */}
          <button onClick={() => setShowFloorSettings(true)}
            title="Floor Settings"
            aria-label="Floor Settings"
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          {/* Save / Publish */}
          <button onClick={handleSave} disabled={saving || !isFloorDirty}
            title={isFloorDirty ? "Save floor draft changes" : "No floor changes to save"}
            className={cn("flex items-center gap-1 h-7 px-2.5 rounded-md text-[10px] font-extrabold transition-all border shadow-sm",
              isFloorDirty ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90" : "bg-muted/40 text-muted-foreground border-border cursor-not-allowed")}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> :
              saved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
          <button
            onClick={handlePublish}
            disabled={!publishingEnabled || saving || isFloorDirty}
            title={
              !publishingEnabled ? "Publishing becomes available in A6"
              : isFloorDirty ? "Save your draft first before publishing"
              : "Publish the current campus draft"
            }
            className={cn("flex items-center gap-1 h-7 px-2.5 rounded-md text-[10px] font-extrabold transition-all border",
              !publishingEnabled || isFloorDirty || saving ? "border-border text-muted-foreground/60 cursor-not-allowed" : "border-emerald-500/30 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/15")}
          >
            <Globe2 className="h-3 w-3" />
            Publish
          </button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN BODY
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── LEFT SIDEBAR ── */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-52 border-r border-border bg-card flex flex-col overflow-hidden shrink-0"
        >
          {/* B5 Phase 2.2: subtle keyed transition for the sidebar content on
              Design ↔ Navigation switch — never touches the canvas camera. */}
          <motion.div
            key={navMode ? "nav-library" : "object-library"}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
          {navMode ? (
            <>
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Navigation Library</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">Author the indoor walking network</p>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-2 space-y-3">
                <div>
                  <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Create</span>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {[
                      { kind: "waypoint", label: "Waypoint", icon: Waypoints, tool: "waypoint" as const, tip: "Drag onto the floor to place a routing point. Click to arm the Waypoint tool." },
                      { kind: "destination", label: "Destination", icon: MapPin, tool: "destination" as const, tip: "Drag onto the floor to place a destination point. Click to arm the Destination tool." },
                    ].map((item) => (
                      <button
                        key={item.kind}
                        data-testid={`nav-library-${item.kind}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", item.kind);
                          e.dataTransfer.effectAllowed = "copy";
                          navLibraryDragRef.current = item.kind;
                        }}
                        onDragEnd={() => { navLibraryDragRef.current = null; setNavDragPreview(null); setNavDragBlocked(null); setNavTargetHover(null); }}
                        onClick={() => selectNavTool(item.tool)}
                        className="h-14 rounded-lg border text-left px-2 py-1.5 transition-all hover:bg-muted/60 text-foreground"
                        title={item.tip}
                      >
                        <item.icon className="h-4 w-4 mb-1" />
                        <span className="text-[10px] font-bold block truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="px-1 mt-1.5 text-[9px] leading-relaxed text-muted-foreground/70">Drag onto the floor to place, or click to arm the placement tool.</p>
                </div>

                {/* B5 Phase 2.2: ONE unified Link Location action — the type is
                    inferred from the physical object you click (Room / Door /
                    Stairs / Elevator / Ramp), so wrong-type links are impossible. */}
                <div>
                  <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Link</span>
                  <button
                    data-testid="nav-library-link"
                    onClick={() => selectNavTool("link")}
                    className={cn("h-10 w-full rounded-lg border text-left px-2 py-1.5 transition-all",
                      navTool === "link" ? "border-primary bg-primary/8 text-primary" : "border-border hover:bg-muted/60 text-foreground")}
                    title="Link an existing Room, Door, Stair, Elevator or Ramp to the walking network"
                  >
                    <span className="flex items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[10px] font-bold block truncate">Link Location</span>
                    </span>
                  </button>
                  <p className="px-1 mt-1.5 text-[9px] leading-relaxed text-muted-foreground/70">
                    Link an existing Room, Door, Stair, Elevator or Ramp to the walking network.
                  </p>
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
              <div className="grid grid-cols-2 gap-1 mt-1">
                {ROOM_TYPES.filter((rt) => !["elevator", "stairs"].includes(rt.type)).map((rt) => (
                  <button key={rt.type} onClick={() => { switchTool("room"); setSidebarCategory(rt.type); setFurnitureTemplate(null); }}
                    className={cn("h-14 rounded-lg border text-left px-2 py-1.5 transition-all",
                      tool === "room" && sidebarCategory === rt.type ? "border-primary bg-primary/8" : "border-border hover:bg-muted/60")}
                    title={rt.label}>
                    <div className="w-4 h-4 rounded border mb-1" style={{ background: rt.fill, borderColor: rt.stroke }} />
                    <span className="text-[10px] font-bold block truncate text-foreground">{rt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="px-1 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Circulation</span>
              <div className="grid grid-cols-3 gap-1 mt-1">
                {[
                  { id: "stairs" as SimpleTool, label: "Stairs", icon: MoveVertical },
                  { id: "ramp" as SimpleTool, label: "Ramp", icon: Navigation },
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
        </motion.div>

        {/* ── CANVAS ── */}
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 overflow-hidden relative"
          style={{ background: "#b0ada8" }}
          onWheel={handleWheel}
          onDragOver={(e) => handleNavLibraryDragOver(e)}
          onDrop={(e) => handleNavLibraryDrop(e)}
          onDragLeave={(e) => {
            if (e.target === e.currentTarget) { setNavDragPreview(null); setNavDragBlocked(null); setNavTargetHover(null); }
          }}
          onMouseDown={(e) => {
            if (navMode) return; // Navigation mode clears its own graph selection.
            if (e.target !== containerRef.current || tool !== "select" || e.shiftKey) return;
            setSelected(null);
            setMultiSelected([]);
            setShowProperties(true);
          }}
        >
          <svg ref={svgRef}
            viewBox={`0 0 ${FP_W} ${FP_H}`}
            className="w-full h-full"
            style={{ cursor, userSelect: "none" }}
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
                const isSel = (selected?.type === "room" && selected.id === room.id) || multiSelected.includes(room.id);
                const rotation = room.rotation ?? 0;
                const cx = room.x + room.w / 2;
                const cy = room.y + room.h / 2;
                return (
                  <g key={room.id} clipPath={`url(#${floorClipId})`} onMouseDown={(e) => onItemDown(e, "room", room.id, room)}
                    onContextMenu={(e) => onItemContextMenu(e, "room", room.id)}
                    opacity={visibleOpacity(room)}
                    style={{ cursor: tool === "select" ? room.locked ? "default" : "move" : cursor }}>
                    <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                      <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
                        fill={isSel ? "rgba(14,42,110,0.15)" : rt.fill}
                        fillOpacity={isSel ? 0.72 : 0.58}
                        stroke={isSel ? "var(--accent)" : rt.stroke}
                        strokeWidth={isSel ? 2 : 1} />
                      <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1}
                        stroke="rgba(0,0,0,0.06)" strokeWidth={1.5} />
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
                return (
                  <g key={wall.id} clipPath={`url(#${floorClipId})`}
                    onMouseDown={(e) => onItemDown(e, "wall", wall.id, wall)}
                    onContextMenu={(e) => onItemContextMenu(e, "wall", wall.id)}
                    opacity={visibleOpacity(wall)}
                    style={{ cursor: tool === "select" && selectableWall ? "pointer" : cursor }}>
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
                <circle
                  key={`${joint.x}-${joint.y}`}
                  data-testid="wall-joint-cap"
                  cx={joint.x}
                  cy={joint.y}
                  r={joint.radius}
                  fill={joint.color}
                  stroke="#2f3a46"
                  strokeWidth={0.7}
                  className="pointer-events-none"
                />
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
                const geom = resolveWallOpeningGeometry(door, door.wallId ? wallById.get(door.wallId) : undefined);
                if (geom) {
                  return (
                    <g key={door.id} onMouseDown={(e) => onItemDown(e, "door", door.id, door)}
                      data-testid="attached-door-opening-symbol"
                      onContextMenu={(e) => onItemContextMenu(e, "door", door.id)}
                      opacity={visibleOpacity(door)}
                      transform={openingSymbolTransform(geom)}
                      style={{ cursor: tool === "select" ? "pointer" : cursor }}>
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
                  <g key={door.id} clipPath={`url(#${floorClipId})`} onMouseDown={(e) => onItemDown(e, "door", door.id, door)}
                    onContextMenu={(e) => onItemContextMenu(e, "door", door.id)}
                    opacity={visibleOpacity(door)}
                    style={{ cursor: tool === "select" ? "pointer" : cursor }}>
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
              {orderedFurniture.map((fi) => {
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
              {orderedRamps.map((rp) => {
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
              {orderedStairs.map((st) => {
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
                      <StairsSymbol item={st} selected={isSel} />
                    </g>
                  </g>
                );
              })}

              {/* ═══ ELEVATORS ═══ */}
              {orderedElevators.map((el) => {
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
              {orderedRooms.map((room) => {
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

              {rooms.filter(r => r.navConnection).map((room) => {
                const nc = room.navConnection!;
                const cx = FP_W / 2;
                const cy = FP_H / 2;
                return (
                  <g key={`nav-${room.id}`} className="pointer-events-none">
                    {/* Dashed line from nav node toward floor center (representing corridor connection) */}
                    <line x1={nc.x} y1={nc.y} x2={cx} y2={cy}
                      stroke="#16a34a" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.4} />
                    {/* Glow ring */}
                    <circle cx={nc.x} cy={nc.y} r={9}
                      fill="none" stroke="#16a34a" strokeWidth={3} opacity={0.25} />
                    {/* Solid node */}
                    <circle cx={nc.x} cy={nc.y} r={5}
                      fill="#16a34a" stroke="white" strokeWidth={2} />
                    {/* Direction indicator — small arrow pointing outward from room toward corridor */}
                    <text x={nc.x} y={nc.y + 1.5} textAnchor="middle" fill="white"
                      fontSize={6} fontWeight="900" className="select-none">
                      {(nc.x < room.x + room.w / 2) ? "◀" : (nc.x > room.x + room.w / 2) ? "▶" : (nc.y < room.y + room.h / 2) ? "▲" : "▼"}
                    </text>
                  </g>
                );
              })}

              {/* ═══ DRAWING PREVIEWS ═══ */}
              {wallSnapIndicator && (
                <g data-testid="wall-snap-indicator" className="pointer-events-none">
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

              {/* ═══ INDOOR NAVIGATION LAYER (Navigation mode) ═══ */}
              {navMode && (
                <g data-testid="floor-nav-layer">
                  {/* Edges — geometry derived from node positions, drawn under nodes */}
                  {indoorEdges.map((edge) => {
                    const a = indoorNodes.find((n) => n.id === edge.startNodeId);
                    const b = indoorNodes.find((n) => n.id === edge.endNodeId);
                    if (!a || !b) return null;
                    // B5 Phase 2.5: optional authored bends turn the edge into a
                    // polyline (orthogonal hallway routing). Endpoints always come
                    // from the nodes; bends are absolute geometry-only points.
                    const pts = edgePolylinePoints(edge, indoorNodes) ?? [];
                    const poly = pts.length > 2;
                    const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                    const isSel = navSelected?.type === "edge" && navSelected.id === edge.id;
                    const closed = edge.closed === true;
                    // B5 Phase 2.11: an existing edge that currently crosses /
                    // overlaps a wall (strict Phase 2.10 model) renders RED so an
                    // invalid authoring state is never mistaken for a fine path.
                    const invalid = navBlockedEdgeIds.has(edge.id);
                    const mid = navEdgeMidpoint(pts.length > 1 ? pts : [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
                    const midX = mid.x;
                    const midY = mid.y;
                    const edgeStroke = closed ? "#b45309" : invalid ? "#dc2626" : isSel ? "var(--accent)" : "#3f6212";
                    return (
                      <g key={edge.id}>
                        {poly ? (
                          <polyline points={pointsStr} fill="none" stroke={edgeStroke}
                            strokeWidth={isSel ? 2.4 : 1.6}
                            strokeDasharray={closed ? "5 3" : undefined}
                            strokeLinejoin="round" strokeLinecap="round"
                            opacity={closed ? 0.75 : 0.9}
                            data-invalid={invalid ? "true" : undefined}
                            data-testid={isSel ? "nav-edge-selected" : "nav-edge"} />
                        ) : (
                          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                            stroke={edgeStroke}
                            strokeWidth={isSel ? 2.4 : 1.6}
                            strokeDasharray={closed ? "5 3" : undefined}
                            opacity={closed ? 0.75 : 0.9}
                            data-invalid={invalid ? "true" : undefined}
                            data-testid={isSel ? "nav-edge-selected" : "nav-edge"} />
                        )}
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
                              fill={closed ? "#b45309" : invalid ? "#dc2626" : "#3f6212"} opacity={0.9} data-testid="nav-edge-direction" />
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
                    const isSel = navSelected?.type === "node" && navSelected.id === node.id;
                    const isMulti = navMultiSelected.includes(node.id);
                    const isConnectStart = navConnectStart === node.id;
                    const isDest = !isLinked && node.type === "room_access";
                    const isEraseHover = navEraseHover?.type === "node" && navEraseHover.id === node.id;
                    const label = (node.name || "Waypoint").trim();
                    const showLabel = !isLinked && label && label !== "Waypoint";
                    // B5 Phase 2.7: the linked routing cue ALWAYS renders at the
                    // node's LOGICAL anchor (node.x/node.y — synced to the owner:
                    // room anchor, door position, circulation center). For ramps
                    // the anchor is the exact center; only a tiny presentation-only
                    // corner badge marks "linked" (never a routing location).
                    const rampOwner = node.rampId ? ramps.find((r) => r.id === node.rampId) : null;
                    const cue = { x: node.x, y: node.y };
                    return (
                      <g key={node.id}
                        data-testid={isLinked ? "nav-linked-node" : "nav-node"}
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
                          data-testid="nav-node-hit" />
                        {isLinked ? (
                          // B5 Phase 2.7: the actual routing node stays VISIBLE even
                          // while the violet Connect ring surrounds it — the ring is
                          // feedback around the node, never a replacement for it.
                          <g className="pointer-events-none">
                            <circle cx={cue.x} cy={cue.y} r={4} fill="rgba(21,128,61,0.85)" data-testid="nav-linked-cue" />
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
                            <circle cx={node.x} cy={node.y} r={4.5}
                              fill={isSel || isMulti ? "var(--accent)" : "#16a34a"}
                              stroke="#f8fafc" strokeWidth={1} />
                            {(isSel || isMulti) && (
                              <circle cx={node.x} cy={node.y} r={7.5} fill="none"
                                stroke="var(--accent)" strokeWidth={1.6} data-testid="nav-node-selected" />
                            )}
                            {isConnectStart && (
                              <circle cx={node.x} cy={node.y} r={10} fill="none"
                                stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="3 2" data-testid="nav-connect-start" />
                            )}
                            {showLabel && (
                              <text x={node.x} y={node.y + 13} textAnchor="middle" fontSize={5.5}
                                fill="#334155" fontWeight={600} className="pointer-events-none select-none">
                                {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                              </text>
                            )}
                          </g>
                        )}
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
                  {navTargetHover && (navTool === "waypoint" || navTool === "destination" || navTool === "connect" || navTool === "link" || navLibraryDragRef.current != null) && !navNodeHover && !(navTool === "connect" && navTargetHasLinkedNode) && (
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
                </g>
              )}

              {/* B5 Phase 2.5: Design-mode READ-ONLY navigation overlay — shown
                  only while "Show Navigation" is on. Reduced opacity, thinner
                  lines, smaller nodes; pointer-events-none so Design Select keeps
                  editing ONLY floor objects (graph is not selectable/movable). */}
              {!navMode && showNavOverlay && (indoorNodes.length > 0 || indoorEdges.length > 0) && (
                <g data-testid="floor-nav-overlay" className="pointer-events-none">
                  {indoorEdges.map((edge) => {
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
                    const isDest = !isLinked && node.type === "room_access";
                    return (
                      <circle key={node.id} cx={node.x} cy={node.y} r={isDest ? 2.6 : 2.2}
                        fill={isLinked ? "rgba(21,128,61,0.7)" : isDest ? "rgba(124,58,237,0.65)" : "rgba(22,163,74,0.55)"} />
                    );
                  })}
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

            </g>
          </svg>

          {/* Furniture tooltip — shows when furniture tool is active */}
          {tool === "furniture" && furnitureTemplate && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground flex items-center gap-2">
                <Paintbrush className="h-3 w-3 text-primary" />
                Placing: {furnitureTemplate.name}
                <button onClick={() => { setFurnitureTemplate(null); switchTool("select"); }}
                  className="ml-1 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
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

          {/* Navigation authoring status hint */}
          {navMode && (navTool === "connect" || navTool === "waypoint" || navTool === "destination" || navTool === "link") && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg border shadow-sm bg-card text-[11px] font-semibold text-foreground">
                {navTool === "connect"
                  ? (navConnectStart ? "Select destination or click empty space to pin a bend · Esc to cancel" : "Select a start point")
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

          {/* B5 Phase 2.1: restrained canvas empty-state — only when the floor has no nav graph */}
          {navMode && indoorNodes.length === 0 && indoorEdges.length === 0 && (
            <div data-testid="floor-nav-canvas-empty-state" className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="rounded-xl border border-border bg-card/90 backdrop-blur px-6 py-5 text-center shadow-xl max-w-sm">
                <Waypoints className="h-6 w-6 mx-auto mb-2 text-primary" />
                <div className="text-sm font-extrabold text-foreground">Build the Walking Network</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Add waypoints to hallways and intersections, then connect Rooms, Doors, Stairs and Elevators.
                </p>
                <button
                  onClick={() => selectNavTool("waypoint")}
                  aria-label="Start building the walking network"
                  className="mt-3 pointer-events-auto h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-extrabold hover:opacity-90 transition-opacity"
                >
                  Add Waypoint
                </button>
              </div>
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-10 right-3 z-20 flex items-center gap-1 p-1 rounded-xl border border-border shadow-md bg-card">
            <button onClick={zoomOut} title="Zoom Out" aria-label="Zoom Out" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-center text-[10px] font-mono font-bold text-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} title="Zoom In" aria-label="Zoom In" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button onClick={fitFloor} title="Fit Floor" aria-label="Fit Floor" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>

        {/* ── PROPERTIES PANEL ── */}
        {showProperties && multiSelected.length > 1 && (
          <div
            data-testid="floor-multi-properties-panel"
            className="w-64 shrink-0 flex flex-col border-l border-border overflow-hidden bg-card"
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
          </div>
        )}
        {/* B5 Phase 2.2: nav properties fade in per selection state (single /
            multi / none) — a restrained 180ms, never re-mounting the canvas. */}
        {navMode && showProperties && navMultiSelected.length > 1 && (
          <motion.div
            key="nav-multi-props"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 flex"
          >
          <div data-testid="floor-nav-multi-props" className="w-64 shrink-0 flex flex-col border-l border-border overflow-hidden bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">Selected Navigation Objects</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{navMultiSelected.length} waypoint{navMultiSelected.length !== 1 ? "s" : ""} selected</p>
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
                      { label: "Waypoints", value: waypointCount },
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
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 flex"
          >
          <FloorNavPropertiesPanel
            selected={navSelected}
            nodes={indoorNodes}
            edges={indoorEdges}
            onUpdateNode={(id, ch) => commitNavGraph(indoorNodes.map((n) => n.id === id ? { ...n, ...ch } : n), indoorEdges)}
            onUpdateEdge={(id, ch) => commitNavGraph(indoorNodes, indoorEdges.map((e) => e.id === id ? { ...e, ...ch } : e))}
            onDelete={() => deleteNavSelection()}
            onClose={() => { setNavSelected(null); setNavMultiSelected([]); }}
            onAddBend={addBendToEdge}
            onRemoveBend={removeBendFromEdge}
            onStraighten={straightenEdge}
            straightenBlocked={straightenBlocked}
            edgeBlocked={navSelected?.type === "edge" ? navBlockedEdgeIds.has(navSelected.id) : false}
          />
          </motion.div>
        )}
        {navMode && showProperties && !navSelected && (
          <div data-testid="floor-nav-empty-state" className="shrink-0 flex">
            <div className="w-60 border-l border-border bg-card/80 backdrop-blur flex flex-col">
              <div className="flex items-center justify-between px-3 h-9 border-b border-border">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Navigation</span>
                <button onClick={() => setShowProperties(false)} aria-label="Close properties" className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="p-3 space-y-3">
                {/* B5 Phase 2.1: minimal neutral state — instructions live on the canvas empty state. */}
                <div className="text-xs font-bold text-foreground">Nothing selected</div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Select a waypoint or path to edit its properties, or use the Navigation Library to add one.
                </p>
              </div>
            </div>
          </div>
        )}
        {!navMode && showProperties && multiSelected.length <= 1 && !selected && (
          <div data-testid="floor-properties-panel" className="shrink-0 flex">
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
            />
          </div>
        )}
        {showProperties && multiSelected.length <= 1 && selected && (
          <FloorPropertiesPanel
            selected={selected}
            mode={mode}
            rooms={rooms}
            walls={walls}
            doors={doors}
            windows={windows}
            furniture={furniture}
            stairs={stairs}
            ramps={ramps}
            elevators={elevators}
            labels={labels}
            onUpdateRoom={(id, ch) => { updFloor(rooms.map((r) => r.id === id ? { ...r, ...ch } : r), fpaths); }}
            onUpdateWall={(id, ch) => { updFloor(rooms, fpaths, walls.map((w) => w.id === id ? { ...w, ...ch } : w)); }}
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
            onUpdateStairs={(id, ch) => { updFloor(rooms, fpaths, walls, doors, windows, furniture, stairs.map((s) => s.id === id ? { ...s, ...ch } : s)); }}
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
        )}

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

        <AnimatePresence>
          {pendingFloorSwitch && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
              onClick={() => setPendingFloorSwitch(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
                className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-4 p-5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="text-sm font-extrabold text-foreground">Unsaved Floor Changes</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Save or discard changes to {floor.label} before switching floors.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 px-5 pb-5">
                  <button
                    onClick={() => setPendingFloorSwitch(null)}
                    className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Keep Editing
                  </button>
                  <button
                    onClick={saveAndSwitchFloor}
                    disabled={saving}
                    className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" /> Save Changes
                  </button>
                  <button
                    onClick={discardAndSwitchFloor}
                    disabled={saving}
                    className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-xs font-extrabold hover:bg-destructive/90 shadow-sm transition-all disabled:opacity-50"
                  >
                    Discard Changes
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
              moveUpLabel="Move Left"
              moveDownLabel="Move Right"
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
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", hasBlockingIssues ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600")}>
                      {hasBlockingIssues ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
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
                      {floorIssues.map((issue) => (
                        <button
                          key={issue.id}
                          onClick={() => selectIssue(issue)}
                          className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/70 transition-colors"
                        >
                          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground">{issue.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Click to select the affected object.</p>
                          </div>
                        </button>
                      ))}
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
