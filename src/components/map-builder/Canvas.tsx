import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, Navigation as NavigationIcon } from "lucide-react";
import { MARKER_STYLES } from "../../data/mapData";
import type { Campus, CampusBuilding, CampusMarker, SimpleTool, EditorLayer, CampusSelection, RubberBand, CampusDecorAsset, CampusPath, NavigationNode, NavigationEdge, BuildingTypeDescriptor } from "./types";
import { campusGateSize, isCampusGate } from "../../lib/campusGates";
import type { TestRouteHighlight, TestRouteTransitionMarker } from "./TestNavigationPanel";
import { RouteEndpointMarker, RouteTransitionMarker } from "./RouteTransitionMarker";
import { DECOR_ASSET_MAP, BUILDING_TYPE_MAP, genId, getRotatedAABB, groundTypeForDecorType, isDecorAreaType } from "./constants";
import { computeBuildingPlacement, screenToWorld } from "../../lib/editorPlacement";
import { decorRenderScale, decorSelectionOutlineBox, decorWorldSize } from "../../lib/decorVisual";
import { mergeOutdoorStack, sortOutdoorGroundAssets } from "../../lib/campusStack";
import { outdoorGroupSelectionBounds } from "../../lib/campusSelection";
import { navGroupSelectionBounds } from "../../lib/navigationGraph";
import { DecorAssetArt, DecorAssetVisual } from "./DecorAssetVisual";
import { CampusGateVisual } from "./CampusGateVisual";
import { OutdoorBuildingVisual, OutdoorEmergencyStairVisual, exteriorEmergencyStairVisualDimensions } from "./ReadonlyOutdoorVisuals";
import { BUILDING_ENTRANCE_TYPE_COLORS, entranceDisplayName, entranceWorldPosition, normalizeEntranceType } from "../../lib/buildingEntrances";
import { canonicalExteriorEmergencyStairsForBuilding, exteriorEmergencyStairWorldPosition } from "../../lib/exteriorEmergencyStairs";
import { pathRenderStyle, type OutdoorPathRenderStyle } from "../../lib/outdoorPathVisual";
import {
  editorPathRenderMode,
  isPathwayGeneratedEdge,
  isPathwayGeneratedNode,
  shouldRenderPathwayAuthoringPreview,
} from "../../lib/campusPathNetwork";
import { surfaceCellRuns } from "../../lib/campusSurface";
import { campusGroundAppearance, campusGroundPatternId, campusObjectSafeBounds } from "../../lib/campusCanvas";
import { CampusGroundPatternDefs } from "./CampusGroundPatternDefs";

// ── Rotation-aware resize cursor helpers (shared by buildings and decor assets) ──
function angleToCursor(deg: number): string {
  const a = ((deg % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return "ew-resize";
  if (a < 67.5) return "nwse-resize";
  if (a < 112.5) return "ns-resize";
  if (a < 157.5) return "nesw-resize";
  if (a < 202.5) return "ew-resize";
  if (a < 247.5) return "nwse-resize";
  if (a < 292.5) return "ns-resize";
  return "nesw-resize";
}
const CORNER_ANGLES: Record<string, number> = { ne: -45, se: 45, sw: 135, nw: 225 };
const EDGE_ANGLES: Record<string, number> = { n: 270, s: 90, e: 0, w: 180 };
const getCornerCursor = (corner: string, rot: number) => angleToCursor((CORNER_ANGLES[corner] ?? 45) + rot);
const getEdgeCursor = (edge: string, rot: number) => angleToCursor((EDGE_ANGLES[edge] ?? 0) + rot);
const pathPointRenderKey = (point: { x: number; y: number }) => `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;

type PathJunctionBranch = PathRenderStyle & {
  ux: number;
  uy: number;
};

type PathRenderStyle = OutdoorPathRenderStyle;

type Pt = { x: number; y: number };

type PathChainSegment = {
  id: string;
  pathId: string;
  style: PathRenderStyle;
  aKey: string;
  bKey: string;
  a: Pt;
  b: Pt;
};

type PathChainNode = {
  key: string;
  x: number;
  y: number;
  segs: string[];
  pathIds: Set<string>;
};

type PathChainInfo = {
  id: string;
  points: Pt[];
  style: PathRenderStyle;
  freeStart: boolean;
  freeEnd: boolean;
  closed: boolean;
  pathIds: string[];
};

type PathJunctionInfo = {
  key: string;
  x: number;
  y: number;
  connectedPathIds: Set<string>;
  branches: PathJunctionBranch[];
};

type PathNetworkGeometry = {
  chains: PathChainInfo[];
  junctions: Map<string, PathJunctionInfo>;
};

function convexHull2D(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * B5 Phase 5.15 — Different-style junction polygon.
 *
 * Only called for junctions where surface colors DIFFER. Fills the visual gap
 * between two different-colored strokes. For same-style junctions, the chain
 * strokes already cover the area — no polygon needed.
 */
function buildPathTransitionShape(
  center: { x: number; y: number },
  branches: PathJunctionBranch[],
  layer: "edge" | "surface",
): string {
  if (branches.length < 2) return "";
  const inflate = layer === "edge" ? 2 : 0;
  // Sort branches by polar angle for consistent polygon ordering
  const sorted = [...branches].sort((a, b) => Math.atan2(a.uy, a.ux) - Math.atan2(b.uy, b.ux));
  // Compute perpendicular rim points for each branch
  const rimPairs = sorted.map((branch) => {
    const half = (branch.baseWidth + inflate) / 2;
    const px = -branch.uy;
    const py = branch.ux;
    return {
      left: { x: center.x + px * half, y: center.y + py * half },
      right: { x: center.x - px * half, y: center.y - py * half },
    };
  });
  const round10 = (v: number) => Math.round(v * 10) / 10;
  if (branches.length === 2) {
    const a = sorted[0]; const b = sorted[1];
    const aHalf = (a.baseWidth + inflate) / 2;
    const bHalf = (b.baseWidth + inflate) / 2;
    const sameWidth = Math.abs(a.baseWidth - b.baseWidth) < 0.5;
    // Angle between branch directions
    const dot = a.ux * b.ux + a.uy * b.uy;
    const angleBetween = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (sameWidth) {
      // Same width: perpendicular rim points form a clean diamond/quadrilateral
      const pts = [rimPairs[0].left, rimPairs[0].right, rimPairs[1].right, rimPairs[1].left];
      return `M${pts.map((p) => `${round10(p.x)} ${round10(p.y)}`).join(" L")} Z`;
    }
    // Different width: compute miter intersection of offset edges
    // Left edge of A intersects right edge of B (and vice versa)
    const intersectOffsetEdges = (
      aDir: { x: number; y: number }, aPerp: { x: number; y: number }, aW: number,
      bDir: { x: number; y: number }, bPerp: { x: number; y: number }, bW: number,
    ): Pt | null => {
      // Line A: center + aDir*t + aPerp*(aW/2)
      // Line B: center + bDir*s + bPerp*(-bW/2)
      const dx = center.x + aDir.x * 500 + aPerp.x * aW;
      const dy = center.y + aDir.y * 500 + aPerp.y * aW;
      const ex = center.x + aDir.x * 500 - aPerp.x * aW;
      const ey = center.y + aDir.y * 500 - aPerp.y * aW;
      const fx = center.x + bDir.x * 500 + bPerp.x * bW;
      const fy = center.y + bDir.y * 500 + bPerp.y * bW;
      const gx = center.x - bDir.x * 500 + bPerp.x * bW;
      const gy = center.y - bDir.y * 500 + bPerp.y * bW;
      const d = (fx - gx) * (ey - dy) - (ex - dx) * (fy - gy);
      if (Math.abs(d) < 0.001) return null;
      const t = ((fx - dx) * (ey - dy) - (ex - dx) * (fy - dy)) / d;
      return { x: fx + (gx - fx) * t, y: fy + (gy - fy) * t };
    };
    const aPerp: Pt = { x: -a.uy, y: a.ux };
    const bPerp: Pt = { x: -b.uy, y: b.ux };
    if (angleBetween < Math.PI / 4) {
      // Very acute angle: bevel fallback — use perpendicular rim points directly
      const pts = [rimPairs[0].left, rimPairs[0].right, rimPairs[1].right, rimPairs[1].left];
      return `M${pts.map((p) => `${round10(p.x)} ${round10(p.y)}`).join(" L")} Z`;
    }
    // Miter intersection: left-edge-of-A × right-edge-of-B → miter corner 1
    //                     right-edge-of-A × left-edge-of-B → miter corner 2
    const m1 = intersectOffsetEdges(
      { x: a.ux, y: a.uy }, { x: aPerp.x, y: aPerp.y }, aHalf,
      { x: b.ux, y: b.uy }, { x: bPerp.x, y: bPerp.y }, bHalf,
    );
    const m2 = intersectOffsetEdges(
      { x: a.ux, y: a.uy }, { x: -aPerp.x, y: -aPerp.y }, aHalf,
      { x: b.ux, y: b.uy }, { x: -bPerp.x, y: -bPerp.y }, bHalf,
    );
    if (m1 && m2) {
      // Miter point too far out (acute miter): use bevel fallback
      const maxMiter = Math.max(aHalf, bHalf) * 3;
      if (Math.hypot(m1.x - center.x, m1.y - center.y) > maxMiter || Math.hypot(m2.x - center.x, m2.y - center.y) > maxMiter) {
        const pts = [rimPairs[0].left, rimPairs[0].right, rimPairs[1].right, rimPairs[1].left];
        return `M${pts.map((p) => `${round10(p.x)} ${round10(p.y)}`).join(" L")} Z`;
      }
      // Trapezoidal transition: A's rim → miter → B's rim
      const pts = [rimPairs[0].left, m1, rimPairs[1].left, rimPairs[1].right, m2, rimPairs[0].right];
      return `M${pts.map((p) => `${round10(p.x)} ${round10(p.y)}`).join(" L")} Z`;
    }
    // Fallback: perpendicular rim points
    const pts = [rimPairs[0].left, rimPairs[0].right, rimPairs[1].right, rimPairs[1].left];
    return `M${pts.map((p) => `${round10(p.x)} ${round10(p.y)}`).join(" L")} Z`;
  }
  // Multi-way (3+ branches): convex hull of all perpendicular rim points.
  // Already bounded by the branch widths; covers internal chain butt-caps.
  const rimPoints = rimPairs.flatMap((pair) => [pair.left, pair.right]);
  const hull = convexHull2D(rimPoints);
  if (hull.length < 3) return "";
  return `M${hull.map((point) => `${round10(point.x)} ${round10(point.y)}`).join(" L")} Z`;
}

function buildChainPathD(chain: PathChainInfo): string {
  if (chain.points.length === 0) return "";
  const pts = chain.points.map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`);
  return `M${pts.join(" L")}${chain.closed ? " Z" : ""}`;
}

/**
 * B5 Phase 5.12 — continuous path-network geometry.
 *
 * Segments are stitched into maximal SAME-STYLE chains: a chain continues
 * through a node whenever exactly one unvisited same-style segment touches it
 * (or, at a branch, the straightest same-style continuation), so joined path
 * records render as ONE stroke with a proper linejoin at the corner — no
 * endpoint caps, no internal seams, one continuous road centerline. Chains
 * stop at free ends, style transitions, and unresolvable branches; those spots
 * either need no cover (a narrower branch's flat cap sits inside the passing
 * chain's body) or get a small transition patch (different styles only).
 */
function buildPathNetworkGeometry(paths: CampusPath[]): PathNetworkGeometry {
  const nodeMap = new Map<string, PathChainNode>();
  const segments: PathChainSegment[] = [];
  const keyFor = (path: CampusPath, point: Pt) => {
    const key = `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;
    return (path.disconnectedJunctionKeys ?? []).includes(key) ? `${key}::${path.id}` : key;
  };
  for (const path of paths) {
    if (path.visible === false) continue;
    const style = pathRenderStyle(path);
    for (let i = 0; i < path.points.length - 1; i += 1) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const aKey = keyFor(path, a);
      const bKey = keyFor(path, b);
      const segId = `${path.id}:${i}`;
      segments.push({ id: segId, pathId: path.id, style, aKey, bKey, a, b });
      for (const [key, pt] of [[aKey, a], [bKey, b]] as const) {
        let node = nodeMap.get(key);
        if (!node) {
          node = { key, x: pt.x, y: pt.y, segs: [], pathIds: new Set() };
          nodeMap.set(key, node);
        }
        node.segs.push(segId);
        node.pathIds.add(path.id);
      }
    }
  }
  const styleKey = (style: PathRenderStyle) => `${style.kind}|${style.baseWidth}|${style.surface}`;
  const segById = new Map(segments.map((seg) => [seg.id, seg]));
  const visited = new Set<string>();
  const chains: PathChainInfo[] = [];

  const dotWithContinuation = (cand: PathChainSegment, nodeKey: string, travel: Pt) => {
    const other = cand.aKey === nodeKey ? cand.b : cand.a;
    const nodePt = cand.aKey === nodeKey ? cand.a : cand.b;
    const cx = other.x - nodePt.x;
    const cy = other.y - nodePt.y;
    const cl = Math.hypot(cx, cy) || 1;
    return (travel.x * cx + travel.y * cy) / cl;
  };

  const bestContinuation = (nodeKey: string, curSeg: PathChainSegment, styleStr: string): PathChainSegment | null => {
    const node = nodeMap.get(nodeKey);
    if (!node) return null;
    const candidates = node.segs
      .filter((id) => id !== curSeg.id && !visited.has(id))
      .map((id) => segById.get(id))
      .filter((seg): seg is PathChainSegment => !!seg && styleKey(seg.style) === styleStr);
    if (candidates.length === 0) return null;
    const travel = curSeg.aKey === nodeKey
      ? { x: curSeg.a.x - curSeg.b.x, y: curSeg.a.y - curSeg.b.y }
      : { x: curSeg.b.x - curSeg.a.x, y: curSeg.b.y - curSeg.a.y };
    candidates.sort((p, q) => dotWithContinuation(q, nodeKey, travel) - dotWithContinuation(p, nodeKey, travel));
    return candidates[0]!;
  };

  for (const start of segments) {
    if (visited.has(start.id)) continue;
    const styleStr = styleKey(start.style);
    const pts: Pt[] = [start.a, start.b];
    const chainPathIds = new Set<string>([start.pathId]);
    visited.add(start.id);
    let curKey = start.bKey;
    let curSeg = start;
    let endKey = curKey;
    for (;;) {
      const nxt = bestContinuation(curKey, curSeg, styleStr);
      if (!nxt) break;
      visited.add(nxt.id);
      chainPathIds.add(nxt.pathId);
      const otherKey = nxt.aKey === curKey ? nxt.bKey : nxt.aKey;
      pts.push(nxt.aKey === curKey ? nxt.b : nxt.a);
      curKey = otherKey;
      curSeg = nxt;
      endKey = curKey;
    }
    curKey = start.aKey;
    curSeg = start;
    for (;;) {
      const nxt = bestContinuation(curKey, curSeg, styleStr);
      if (!nxt) break;
      visited.add(nxt.id);
      chainPathIds.add(nxt.pathId);
      const otherKey = nxt.aKey === curKey ? nxt.bKey : nxt.aKey;
      pts.unshift(nxt.aKey === curKey ? nxt.b : nxt.a);
      curKey = otherKey;
      curSeg = nxt;
    }
    const startKey = curKey;
    const startNode = nodeMap.get(startKey);
    const endNode = nodeMap.get(endKey);
    // B5 Phase 5.16: extend the chain through same-style junction nodes so
    // the edge stroke's butt cap lands INSIDE the other chain's surface.
    // This eliminates the visible internal transverse line at junctions.
    const isSameStyleJunction = (nodeKey: string): boolean => {
      const node = nodeMap.get(nodeKey);
      if (!node || node.segs.length < 2) return false;
      return node.segs.every((id) => {
        const seg = segById.get(id);
        return seg && styleKey(seg.style) === styleStr;
      });
    };
    const extendedPts = [...pts];
    if (!start.closed && isSameStyleJunction(startKey) && startNode) {
      extendedPts.unshift({ x: startNode.x, y: startNode.y });
    }
    if (!start.closed && isSameStyleJunction(endKey) && endNode) {
      extendedPts.push({ x: endNode.x, y: endNode.y });
    }
    chains.push({
      id: `chain-${chains.length}`,
      points: extendedPts,
      style: start.style,
      freeStart: (startNode?.segs.length ?? 0) <= 1,
      freeEnd: (endNode?.segs.length ?? 0) <= 1,
      closed: startKey === endKey,
      pathIds: Array.from(chainPathIds),
    });
  }

  // B5 Phase 5.15: junction polygon ONLY for different-style junctions where
  // surface colors differ. Same-style junctions (bends, T-junctions, crosses)
  // are fully covered by the chain strokes — no polygon needed.
  const junctions = new Map<string, PathJunctionInfo>();
  for (const [key, node] of nodeMap) {
    if (node.segs.length < 2) continue;
    const styles = new Set(node.segs.map((id) => segById.get(id)!.style).map(styleKey));
    if (styles.size < 2) continue; // same-style: chain strokes cover it
    const branches: PathJunctionBranch[] = [];
    for (const segId of node.segs) {
      const seg = segById.get(segId)!;
      const nodePt = seg.aKey === key ? seg.a : seg.b;
      const other = seg.aKey === key ? seg.b : seg.a;
      const dx = other.x - nodePt.x;
      const dy = other.y - nodePt.y;
      const len = Math.hypot(dx, dy);
      if (len <= 0.01) continue;
      const ux = dx / len;
      const uy = dy / len;
      const duplicate = branches.some((branch) =>
        branch.surface === seg.style.surface
        && Math.abs(branch.baseWidth - seg.style.baseWidth) < 0.5
        && Math.abs(branch.ux - ux) < 0.01
        && Math.abs(branch.uy - uy) < 0.01
      );
      if (!duplicate) branches.push({ ...seg.style, ux, uy });
    }
    if (branches.length < 2) continue;
    junctions.set(key, { key, x: node.x, y: node.y, connectedPathIds: node.pathIds, branches });
  }

  return { chains, junctions };
}

interface CanvasProps {
  campus: Campus;
  tool: SimpleTool;
  layer: EditorLayer;
  selected: CampusSelection | null;
  multiSelected: string[];
  selectedPathPoint?: { pathId: string; pointIndex: number } | null;
  showGroupOutline?: boolean;
  rubberBand: RubberBand | null;
  drawingPath: { x: number; y: number }[];
  snapGrid: boolean;
  zoom: number;
  pan: { x: number; y: number };
  svgRef: React.RefObject<SVGSVGElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  cursor: string;
  buildingDrag?: { sx: number; sy: number; cx: number; cy: number } | null;
  buildingPlacementPreview?: BuildingTypeDescriptor | null;
  groundBrushPreview?: { x: number; y: number; width: number; height: number } | null;
  groundErasePreview?: { x: number; y: number; width: number; height: number } | null;
  groundPaintType?: CampusDecorAsset["groundType"];
  /** Armed click-to-place outdoor asset preview. */
  armedDecorAssetType?: string | null;
  armedCampusGatePlacement?: boolean;
  pathPaintPreview?: { points: { x: number; y: number }[]; width: number; type: string; color: string; snapKind?: "endpoint" | "bend" | "segment" } | null;
  guides?: { type: "h" | "v"; pos: number }[];
  cursorPos?: { x: number; y: number } | null;
  overlappingBuildings?: Set<string>;
  invalidBuildings?: Set<string>;
  onCanvasDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasUp: (e: React.MouseEvent<SVGSVGElement>) => void;
  /** Fired when the cursor leaves the canvas (defaults to onCanvasUp for backward compatibility) */
  onCanvasLeave?: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasDblClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  onItemDown: (e: React.MouseEvent, type: "building" | "marker" | "gate" | "decorAsset" | "navNode", id: string, ox: number, oy: number) => void;
  onGroupSurfaceDown?: (e: React.MouseEvent) => void;
  onGroupResizeStart?: (e: React.MouseEvent, corner: "nw" | "ne" | "sw" | "se", bounds: { x: number; y: number; width: number; height: number }) => void;
  onPathGroupScaleStart?: (e: React.MouseEvent, corner: "nw" | "ne" | "sw" | "se", bounds: { x: number; y: number; width: number; height: number }) => void;
  onPathGroupRotateStart?: (e: React.MouseEvent, center: { x: number; y: number }) => void;
  /** True while a path-group/network rotation gesture is active (floating degree label). */
  pathGroupRotationActive?: boolean;
  /** Frozen bounds during rotation gesture so the outline doesn't awkwardly resize. */
  pathGroupRotationBounds?: { x: number; y: number; width: number; height: number } | null;
  onPathDown?: (e: React.MouseEvent, id: string) => void;
  /** Double-click a member pathway — enters member edit mode for that path. */
  onPathDblClick?: (id: string) => void;
  /** Hovered physical pathway member for temporary network identification. */
  hoveredPathId?: string | null;
  onPathHover?: (id: string | null) => void;
  /** Path currently being edited inside its network (member edit mode). */
  pathMemberEditId?: string | null;
  onPathPointDown?: (e: React.MouseEvent, id: string, pointIndex: number) => void;
  onPathExtendStart?: (e: React.MouseEvent, id: string, pointIndex: number) => void;
  onPathAddPoint?: (id: string, pointIndex: number, point: { x: number; y: number }) => void;
  /** Insert a Pathway bend and keep the pointer gesture armed so the new
   * vertex can be positioned in the same drag. */
  onPathAddPointDragStart?: (e: React.MouseEvent, id: string, pointIndex: number, point: { x: number; y: number }) => void;
  onPathWidthDown?: (e: React.MouseEvent, id: string, segmentIndex: number, handlePoint: { x: number; y: number }) => void;
  onEntranceDown?: (e: React.MouseEvent, buildingId: string, entranceId: string, ox: number, oy: number) => void;
  onExteriorEmergencyStairDown?: (e: React.MouseEvent, buildingId: string, stairId: string) => void;
  exteriorEmergencyStairPreview?: { buildingId: string; stairId: string; edge: "top" | "right" | "bottom" | "left"; offset: number; valid: boolean } | null;
  onExteriorEmergencyStairFloorNavigate?: (buildingId: string, floorId: string, stairId: string) => void;
  onItemContextMenu?: (e: React.MouseEvent, type: "building" | "marker" | "path" | "decorAsset", id: string) => void;
  onResizeStart?: (e: React.MouseEvent, b: CampusBuilding, corner: string) => void;
  onMarkerResizeStart?: (e: React.MouseEvent, marker: CampusMarker, corner: string) => void;
  onRotateStart?: (e: React.MouseEvent, b: CampusBuilding) => void;
  onBuildingDoubleClick?: (id: string) => void;
  onPathClick: (id: string) => void;
  onSelect: (sel: CampusSelection | null) => void;
  /** Navigation-graph authoring (B5 Phase 1): edges/nodes render + interaction in the navigation layer. */
  navNodes?: NavigationNode[];
  navEdges?: NavigationEdge[];
  /** Read-only outdoor navigation overlay for the Campus layer. */
  showNavigationOverlay?: boolean;
  /** Test Route presentation mode hides authoring graph visuals and hit targets. */
  routePreview?: boolean;
  /** Node the Path tool is currently connecting FROM (dashed start ring + live preview). */
  navConnectStartId?: string | null;
  /** Live pointer position while the Path tool has an active start node. */
  navPreview?: { x: number; y: number } | null;
  navConnectBends?: { x: number; y: number }[];
  /** Exact manual Walking Path segment/projection captured by Connect hover. */
  navPathTargetHover?: {
    edgeId: string;
    segmentIndex: number;
    point: { x: number; y: number };
  } | null;
  /** B5 Phase 6.9: the FULL proposed pin shape (corner + click point) the
   *  preview renders — the exact geometry a click would pin (preview == commit). */
  navPreviewPins?: { x: number; y: number }[];
  /** Entrance currently targeted by Add Waypoint / Connect Path (highlighted). */
  navEntranceHover?: { buildingId: string; entranceId: string; x: number; y: number } | null;
  /** B5 Phase 6.1: edge snap preview for waypoint-on-edge insertion. */
  edgeSnapPreview?: {
    edgeId: string;
    nearest: { x: number; y: number };
    /** Optional context-specific helper for a read-only managed connector. */
    helper?: string;
  } | null;
  /** B5 Phase 6.2: outdoor Connect blocked preview (crosses building). */
  connectBlocked?: boolean;
  /** B5 Phase 6.10: set of edge IDs currently blocked by obstacles (rendered red). */
  navBlockedEdgeIds?: Set<string>;
  /** B7 Phase 1: restrained validation issue markers (world-space anchors). One
   *  small badge per affected campus object, pointer-events-none, drawn on top. */
  issueMarkers?: { key: string; x: number; y: number; severity: "error" | "warning" }[];
  /** Click an edge (select mode selects it; path mode is ignored). */
  onNavEdgeSelect?: (e: React.MouseEvent, id: string) => void;
  onNavEdgeBendDown?: (e: React.MouseEvent, id: string, bendIndex: number) => void;
  onNavEdgeAddBend?: (id: string, bendIndex: number, point: { x: number; y: number }) => void;
  onResetView?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSetTool?: (t: SimpleTool) => void;
  onToggleSnap?: () => void;
  onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
  snapGrid?: boolean;
  /** Called when an asset is dropped from the palette onto the canvas */
  onDropAsset?: (asset: CampusDecorAsset) => void;
  /** Called when the functional Campus Gate asset is dropped on the canvas. */
  onDropCampusGate?: (x: number, y: number) => void;
  /** Called when a building type is dropped from the palette */
  onDropBuilding?: (type: string, x: number, y: number) => void;
  /** Canvas width/height for coordinate conversion */
  canvasW?: number;
  canvasH?: number;
  /** Visual resize mode/handle gesture. */
  canvasResizeMode?: boolean;
  /** Proposed canvas dimensions currently outside the authored content bounds. */
  canvasResizeInvalid?: boolean;
  onCanvasResizeStart?: (e: React.MouseEvent, handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") => void;
  /** ID of the building currently being rotated (handle hidden during rotation, like Canva) */
  rotatingId?: string | null;
  /** Current rotation angle while actively rotating (for floating degree indicator) */
  rotatingAngle?: number;
  /** ID of the building currently being resized (shows dimension indicator) */
  resizingId?: string | null;
  /** ID of the decor asset currently being rotated (handle hidden during rotation) */
  decorRotatingId?: string | null;
  /** ID of the decor asset currently being resized (shows scale indicator) */
  decorResizingId?: string | null;
  /** ID of a Campus Gate currently being resized. */
  markerResizingId?: string | null;
  /** Called when the decor asset rotation handle is grabbed */
  onDecorRotateStart?: (e: React.MouseEvent, da: CampusDecorAsset) => void;
  /** Called when a decor asset resize corner/edge is grabbed */
  onDecorResizeStart?: (e: React.MouseEvent, da: CampusDecorAsset, corner: string) => void;
  /** Route to highlight from the test-navigation panel (waypoints + color) */
  highlightedRoute?: TestRouteHighlight | null;
  onRouteTransitionClick?: (marker: TestRouteTransitionMarker) => void;
  /** Current-context Test Route map picking. Only physical semantic targets
   * (buildings/entrances/gates) are surfaced here; generic graph nodes stay hidden. */
  testRoutePickKind?: "start" | "destination" | null;
  testRoutePickHover?: { type: "building" | "entrance" | "gate"; id: string } | null;
  onTestRoutePickHover?: (target: { type: "building" | "entrance" | "gate"; id: string } | null) => void;
  /** ID of a just-completed path to play the draw-in animation on */
  animatingPathId?: string | null;
}

// ── Drag-over indicator component — shows a real SVG preview of the dragged asset at the cursor ──
function DragOverlay({
  x, y, valid, label,
  type, assetType,
}: {
  x: number; y: number; valid: boolean; label: string;
  type: "decorAsset" | "buildingType" | "campusGate";
  assetType?: string;
}) {
  const decor = type === "decorAsset" && assetType ? DECOR_ASSET_MAP[assetType] : null;
  const building = type === "buildingType" && assetType ? BUILDING_TYPE_MAP[assetType] : null;

  const previewSize = 56;
  const borderColor = valid ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)";
  const bgColor = valid ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";

  return (
    <>
      {/* Real SVG preview floating at cursor */}
      <div
        className="absolute z-20 pointer-events-none flex items-center justify-center"
        style={{
          left: x,
          top: y,
          transform: "translate(-50%, -50%)",
          width: previewSize,
          height: previewSize,
        }}
      >
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full transition-colors"
          style={{
            border: `2px solid ${borderColor}`,
            background: bgColor,
            boxShadow: valid
              ? `0 0 20px rgba(34,197,94,0.2)`
              : `0 0 20px rgba(239,68,68,0.2)`,
            transform: "scale(1.4)",
          }}
        />
        {/* Inner preview shape */}
        <div className="relative flex items-center justify-center" style={{ width: 32, height: 32 }}>
          {decor && (
            <DecorAssetVisual type={assetType ?? ""} className="w-8 h-8 drop-shadow-md" />
          )}
          {building && (
            <svg width={32} height={32} viewBox="0 0 40 40" className="drop-shadow-md">
              <rect x={4} y={8} width={32} height={28} rx={4} fill={building.color} opacity={0.9} />
              <rect x={8} y={4} width={24} height={6} rx={2} fill={building.color} opacity={0.7} />
              <text x={20} y={28} textAnchor="middle" fill="white" fontSize={7} fontWeight="900">
                {building.label.slice(0, 2).toUpperCase()}
              </text>
            </svg>
          )}
          {type === "campusGate" && (
            <CampusGateVisual width={34} height={30} color="#2563eb" className="drop-shadow-md" />
          )}
          {!decor && !building && type !== "campusGate" && (
            <div className="w-7 h-7 rounded-lg border-2 border-dashed" style={{ borderColor }} />
          )}
        </div>
      </div>

      {/* Compact label pill floating near the preview */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{ left: x + 32, top: y - 16 }}
      >
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-lg border transition-colors ${
            valid
              ? "bg-green-50/90 border-green-300 text-green-700 dark:bg-green-900/40 dark:border-green-600 dark:text-green-300"
              : "bg-red-50/90 border-red-300 text-red-700 dark:bg-red-900/40 dark:border-red-600 dark:text-red-300"
          }`}
          style={{ backdropFilter: "blur(8px)" }}
        >
          {valid ? (
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
          ) : (
            <XCircle className="h-2.5 w-2.5 shrink-0" />
          )}
          <span className="truncate max-w-[100px]">{valid ? `Place ${label}` : "Can't place here"}</span>
        </div>
      </div>
    </>
  );
}


function routeDirectionMarkers(points: { x: number; y: number }[]): { x: number; y: number; angle: number }[] {
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

export function Canvas({
  campus, tool, layer, selected, multiSelected, selectedPathPoint = null, showGroupOutline = true, rubberBand, drawingPath, snapGrid,
  zoom, pan, svgRef, containerRef, cursor,
  buildingDrag, buildingPlacementPreview, groundBrushPreview, groundErasePreview, groundPaintType = "grass", armedDecorAssetType, armedCampusGatePlacement = false, pathPaintPreview, guides, cursorPos, overlappingBuildings,
  onCanvasDown, onCanvasMove, onCanvasUp, onCanvasLeave, onCanvasDblClick,
  onItemDown, onGroupSurfaceDown, onGroupResizeStart, onPathDown, onPathPointDown, onPathExtendStart, onPathAddPoint, onPathAddPointDragStart, onPathWidthDown, onEntranceDown, onExteriorEmergencyStairDown, exteriorEmergencyStairPreview, onItemContextMenu, onResizeStart, onMarkerResizeStart, onBuildingDoubleClick, onPathClick, onSelect,
  onExteriorEmergencyStairFloorNavigate,
  onPathGroupScaleStart, onPathGroupRotateStart, pathGroupRotationActive = false, pathGroupRotationBounds = null, onPathDblClick, pathMemberEditId = null, hoveredPathId = null, onPathHover,
  onResetView, onZoomIn, onZoomOut, onSetTool, onToggleSnap,
  onWheel, invalidBuildings = new Set(),
  onDropAsset, onDropCampusGate, onDropBuilding,
  onRotateStart, canvasW, canvasH,
  canvasResizeMode = false, canvasResizeInvalid = false, onCanvasResizeStart,
  rotatingId, rotatingAngle,
  resizingId, highlightedRoute, animatingPathId,
  decorRotatingId, decorResizingId, markerResizingId = null, onDecorRotateStart, onDecorResizeStart,
  navNodes, navEdges, showNavigationOverlay = false, routePreview = false, navConnectStartId, navPreview, navConnectBends = [], navPreviewPins = [], navPathTargetHover, navEntranceHover, edgeSnapPreview, connectBlocked, navBlockedEdgeIds, onNavEdgeSelect, onNavEdgeBendDown, onNavEdgeAddBend,
  issueMarkers = [],
  testRoutePickKind = null, testRoutePickHover = null, onTestRoutePickHover, onRouteTransitionClick,
}: CanvasProps) {
  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const pathPointCounts = new Map<string, number>();
  paths.forEach((path) => {
    path.points.forEach((point) => {
      const key = pathPointRenderKey(point);
      if ((path.disconnectedJunctionKeys ?? []).includes(key)) return;
      pathPointCounts.set(key, (pathPointCounts.get(key) ?? 0) + 1);
    });
  });
  const decorAssets = campus.decorAssets ?? [];
  // Ground/area assets remain in the dedicated background layer (below paths
  // and foreground objects), but they still honour the same optional z-order
  // field as every other outdoor asset.  Previously this list was rendered in
  // raw array order, so the Layer Order controls appeared to work yet had no
  // visible effect for Lawn/Garden/Plaza/Parking records.  Keep the semantic
  // background layer while sorting within it; the original array index is the
  // deterministic legacy tie-break for records without an explicit order.
  const groundAreas = sortOutdoorGroundAssets(decorAssets);
  const foregroundDecorAssets = decorAssets.filter((asset) => !isDecorAreaType(asset.type));
  const [exteriorQuickNavKey, setExteriorQuickNavKey] = useState<string | null>(null);
  const exteriorQuickNavTimer = useRef<number | null>(null);
  const cancelExteriorQuickNavClose = () => {
    if (exteriorQuickNavTimer.current !== null) {
      window.clearTimeout(exteriorQuickNavTimer.current);
      exteriorQuickNavTimer.current = null;
    }
  };
  const closeExteriorQuickNav = () => {
    cancelExteriorQuickNavClose();
    setExteriorQuickNavKey(null);
  };
  const scheduleExteriorQuickNavClose = () => {
    cancelExteriorQuickNavClose();
    exteriorQuickNavTimer.current = window.setTimeout(() => {
      exteriorQuickNavTimer.current = null;
      setExteriorQuickNavKey(null);
    }, 180);
  };
  useEffect(() => () => cancelExteriorQuickNavClose(), []);

  // B5 Phase 2.9: the nav props are the SCOPED collection the outdoor editor
  // derives (outdoor-only entities) — indoor floor nodes/edges never render
  // here, even when their building sits on this canvas. The campus fallback is
  // only a safety net for legacy direct usage.
  const renderNavNodes = navNodes ?? campus.navNodes ?? [];
  const renderNavEdges = navEdges ?? campus.navEdges ?? [];
  const navGraphInteractive = layer === "navigation" && !routePreview;
  // `path` was the historical runtime id for Navigation Connect.  Keep that
  // alias guarded here so a stale editor/session state cannot fall through to
  // a child authoring surface while the canonical `connect` tool is active.
  const connectCanvasActive = navGraphInteractive && (tool === "connect" || tool === "path");
  const shouldRenderNavGraph = !routePreview && (navGraphInteractive || showNavigationOverlay);

  // B5 Phase 5.12 — continuous path-network geometry: joined same-style records
  // render as ONE stroke (no internal seams/caps, continuous road centerlines),
  // with style-transition junction covers for the remaining corner gaps.
  const pathGeometry = useMemo(() => buildPathNetworkGeometry(paths), [paths]);
  const pathNetworkSize = useMemo(() => {
    const map = new Map<string, number>();
    paths.forEach((path) => {
      if (path.pathNetworkId) map.set(path.pathNetworkId, (map.get(path.pathNetworkId) ?? 0) + 1);
    });
    return map;
  }, [paths]);
  const pathOnlyMultiSelect = multiSelected.length >= 2
    && multiSelected.every((id) => paths.some((path) => path.id === id));
  // A physical Pathway owns the overlay hit surface only while that member is
  // explicitly being edited.  Normal Navigation Select must still be able to
  // select generated nodes/edges after a Pathway or network was inspected.
  const selectedPhysicalPathIds = new Set(
    pathMemberEditId && paths.some((path) => path.id === pathMemberEditId)
      ? [pathMemberEditId]
      : [],
  );

  // Normalized canvas dimensions: prefer the explicit props (CampusEditor
  // passes its safe/normalized dims) so a transiently-unset campus can never
  // render a degenerate viewBox or collapse pointer conversion toward (0,0).
  const cw = (canvasW ?? campus.canvasW) || 900;
  const ch = (canvasH ?? campus.canvasH) || 680;
  const groundAppearance = campusGroundAppearance(campus);
  const groundPattern = campusGroundPatternId(groundAppearance.material, groundAppearance.texture);
  const groundStyle = (kind: CampusDecorAsset["groundType"] = "grass") => {
    switch (kind) {
      case "planted":
        return { fill: "#b8cfab", stroke: "#739b69", accent: "#8daf7a", pattern: "campus-garden-pattern", label: "Planted" };
      case "plaza":
        return { fill: "#d8d5ce", stroke: "#a8a29a", accent: "#b8b2a8", pattern: "campus-plaza-pattern", label: "Plaza" };
      case "field":
        return { fill: "#dbe8c2", stroke: "#9db76d", accent: "#b6ca86", pattern: "campus-garden-pattern", label: "Open Field" };
      case "parking":
        return { fill: "#8a9296", stroke: "#626b70", accent: "#f8fafc", pattern: undefined, label: "Parking" };
      case "grass":
      default:
        return { fill: "#bfd4b8", stroke: "#7fa876", accent: "#9fbe91", pattern: "campus-lawn-pattern", label: "Grass" };
    }
  };

  // ── ONE cross-type visual stack for buildings + decorative assets ──
  // Document order == stacking order, so a bench can sit in front of part of a
  // building and a tree behind it (B2 cross-type layer ordering). Markers,
  // paths, nav/event objects stay in their own fixed layers.
  const stackedOutdoor = mergeOutdoorStack(buildings, foregroundDecorAssets);
  const groupSelectionBounds = useMemo(() => {
    if (!showGroupOutline) return null;
    // Unified editor — group outlines visible in all layers
    return outdoorGroupSelectionBounds(multiSelected, buildings, decorAssets, DECOR_ASSET_MAP, paths, { includeHidden: true }, markers);
  }, [buildings, decorAssets, layer, markers, multiSelected, paths, showGroupOutline]);

  // B5 correction — nav graph multi-select group outline: bounds come from the
  // ACTUAL selected graph geometry (node coords + the bends of edges whose
  // both endpoints are selected), so the frame communicates that the whole
  // graph substructure moves together. Rendered only on the Navigation layer.
  const navGroupBounds = useMemo(() => {
    if (!showGroupOutline || layer !== "navigation") return null;
    if (multiSelected.length < 2) return null;
    const nodeIds = new Set(
      multiSelected.filter((id) => renderNavNodes.some((n) => n.id === id))
    );
    const edgeIds = new Set(
      multiSelected.filter((id) => renderNavEdges.some((e) => e.id === id))
    );
    if (nodeIds.size === 0 && edgeIds.size === 0) return null;
    return navGroupSelectionBounds(renderNavNodes, renderNavEdges, nodeIds, edgeIds);
  }, [layer, multiSelected, renderNavEdges, renderNavNodes, showGroupOutline]);

  // B5 correction: the empty-interior drag surface only renders when at least
  // TWO free (non-entrance-linked) waypoints are selected — a single node or a
  // node+edge-only selection must not swallow clicks for a surface that can't
  // move a group.
  const navGroupDragSurfaceEligible = useMemo(() => {
    if (layer !== "navigation" || multiSelected.length < 2) return false;
    return multiSelected.filter((id) => {
      const n = renderNavNodes.find((x) => x.id === id);
      return Boolean(n && !n.entranceId);
    }).length >= 2;
  }, [layer, multiSelected, renderNavNodes]);
  const isPathOnlyGroup = multiSelected.length >= 2
    && multiSelected.every((id) => paths.some((path) => path.id === id));
  const physicalGroupMemberCount = multiSelected.filter((id) => {
    const building = buildings.find((item) => item.id === id);
    if (building) return !building.locked;
    const asset = decorAssets.find((item) => item.id === id);
    if (asset) return !asset.locked && !!DECOR_ASSET_MAP[asset.type];
    const marker = markers.find((item) => item.id === id);
    return Boolean(marker && isCampusGate(marker));
  }).length;
  const physicalGroupResizeEligible = Boolean(groupSelectionBounds)
    && !isPathOnlyGroup
    && multiSelected.length >= 2
    && multiSelected.every((id) => !paths.some((path) => path.id === id))
    && physicalGroupMemberCount >= 2;

  // ── Drag-and-drop state ──
  const [dragOver, setDragOver] = useState<{
    x: number; y: number;
    canvasX: number; canvasY: number;
    valid: boolean; label: string;
  type: "decorAsset" | "buildingType" | "campusGate";
    assetType?: string;
  } | null>(null);
  const dragCounterRef = useRef(0);
  const dragLabelRef = useRef("Item");
  const dragTypeRef = useRef<"decorAsset" | "buildingType" | "campusGate">("decorAsset");
  // Use refs to avoid stale closures in drag handlers
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen coords to canvas coords — the SAME shared, letterbox-aware
    // path every other editor interaction uses (no independent formula here).
    const svg = svgRef.current;
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    const pt = screenToWorld(e.clientX, e.clientY, svgRect, cw, ch, pan, zoom);
    const canvasX = Math.round(pt.x);
    const canvasY = Math.round(pt.y);

    // Check if position is valid (inside canvas bounds, not overlapping)
    const inBounds = canvasX >= 0 && canvasY >= 0 && canvasX <= cw && canvasY <= ch;

    // Check overlap against existing buildings (rotated-AABB collision) — using ref to avoid stale closure
    let overlapsBuilding = false;
    const dropW = 24;
    const dropH = 24;
    const dropBox = { x: canvasX, y: canvasY, w: dropW, h: dropH };
    for (const b of buildingsRef.current) {
      const ba = getRotatedAABB(b.x, b.y, b.width, b.height, b.rotation ?? 0);
      if (
        dropBox.x < ba.x + ba.width &&
        dropBox.x + dropBox.w > ba.x &&
        dropBox.y < ba.y + ba.height &&
        dropBox.y + dropBox.h > ba.y
      ) {
        overlapsBuilding = true;
        break;
      }
    }

    setDragOver({
      x, y,
      canvasX, canvasY,
      valid: inBounds && !overlapsBuilding,
      label: dragLabelRef.current,
      type: dragTypeRef.current,
    });
  }, [cw, ch, pan, zoom, svgRef, containerRef]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current += 1;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    try {
      const raw = e.dataTransfer.getData("text/plain");
      const data = JSON.parse(raw);
      if (data.type === "decorAsset") {
        const label = DECOR_ASSET_MAP[data.assetType]?.label || data.assetType;
        dragLabelRef.current = label;
        dragTypeRef.current = "decorAsset";
        setDragOver({
          x: cx, y: cy,
          canvasX: 0, canvasY: 0,
          valid: true,
          label,
          type: "decorAsset",
          assetType: data.assetType,
        });
      } else if (data.type === "buildingType") {
        const label = data.label || "Building";
        dragLabelRef.current = label;
        dragTypeRef.current = "buildingType";
        setDragOver({
          x: cx, y: cy,
          canvasX: 0, canvasY: 0,
          valid: true,
          label,
          type: "buildingType",
          assetType: data.assetType,
        });
      } else if (data.type === "campusGate") {
        dragLabelRef.current = "Campus Gate";
        dragTypeRef.current = "campusGate";
        setDragOver({ x: cx, y: cy, canvasX: 0, canvasY: 0, valid: true, label: "Campus Gate", type: "campusGate" });
      }
    } catch {
      // Not our data format — ignore
    }
  }, [containerRef]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);
    dragCounterRef.current = 0;

    // Convert screen coords to canvas coords — same shared conversion as all
    // other tools (letterbox-aware, zoom/pan-aware).
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pt = screenToWorld(e.clientX, e.clientY, rect, cw, ch, pan, zoom);
    const canvasX = Math.round(pt.x);
    const canvasY = Math.round(pt.y);

    // Clamp to canvas bounds
    const clampedX = Math.max(0, Math.min(cw, canvasX));
    const clampedY = Math.max(0, Math.min(ch, canvasY));

    try {
      const raw = e.dataTransfer.getData("text/plain");
      const data = JSON.parse(raw);

      if (data.type === "campusGate" && onDropCampusGate) {
        onDropCampusGate(clampedX, clampedY);
      } else if (data.type === "decorAsset" && onDropAsset) {
        const isGroundArea = isDecorAreaType(data.assetType);
        const asset: CampusDecorAsset = {
          id: genId("dec"),
          type: data.assetType,
          x: clampedX,
          y: clampedY,
          rotation: 0,
          ...(isGroundArea ? { width: Number(data.w) || DECOR_ASSET_MAP[data.assetType]?.defaultWidth || 180, height: Number(data.h) || DECOR_ASSET_MAP[data.assetType]?.defaultHeight || 110, groundType: (data.groundType || groundTypeForDecorType(data.assetType) || "grass") as CampusDecorAsset["groundType"], zOrder: -1000 } : { scale: 1 }),
        };
        onDropAsset(asset);
      } else if (data.type === "buildingType" && onDropBuilding) {
        onDropBuilding(data.assetType || data.label, clampedX, clampedY);
      }
    } catch {
      // Ignore invalid data
    }
  }, [cw, ch, pan, zoom, svgRef, onDropAsset, onDropCampusGate, onDropBuilding]);

  // Cleanup drag counter on unmount
  useEffect(() => {
    return () => { dragCounterRef.current = 0; };
  }, []);

  const renderPathJunctionLayer = () => (
    <g data-testid="path-junction-layer" className="pointer-events-none">
      {Array.from(pathGeometry.junctions.entries()).map(([key, junction]) => {
        const dominant = junction.branches.slice().sort((a, b) => b.baseWidth - a.baseWidth)[0] ?? junction.branches[0];
        const edgeShape = buildPathTransitionShape({ x: junction.x, y: junction.y }, junction.branches, "edge");
        const surfaceShape = buildPathTransitionShape({ x: junction.x, y: junction.y }, junction.branches, "surface");
        if (!edgeShape) return null;
        return (
          <g
            key={`junction-${key}`}
            data-testid="path-junction-union"
            data-connected-paths={junction.connectedPathIds.size}
            data-branch-count={junction.branches.length}
            data-junction-shape="directional"
          >
            <path data-testid="path-junction-edge-union" d={edgeShape} fill={dominant.edge} opacity={1} fillRule="nonzero" />
            <path data-testid="path-junction-surface-union" d={surfaceShape} fill={dominant.surface} opacity={1} fillRule="nonzero" />
          </g>
        );
      })}
    </g>
  );

  const renderPathControls = (p: CampusPath) => {
    const isSel = selected?.type === "path" && selected.id === p.id;
    // Unified editor — path controls visible in all layers when path is selected
    const inNetworkGroup = !!p.pathNetworkId
      && (pathNetworkSize.get(p.pathNetworkId) ?? 1) > 1
      && pathOnlyMultiSelect;
    const showControls = isSel && (!inNetworkGroup || pathMemberEditId === p.id);
    if (!showControls) return null;
    const kind = p.type === "road" || p.type === "driveway" ? "road" : p.type === "accessible" ? "accessible" : "walkway";
    const baseWidth = Math.max(3, p.width ?? (kind === "road" ? 18 : 10));
    const widthSegmentIndex = p.points.length > 1
      ? p.points.slice(0, -1).reduce((best, point, index) => {
          const next = p.points[index + 1];
          const len = Math.hypot(next.x - point.x, next.y - point.y);
          return len > best.len ? { index, len } : best;
        }, { index: 0, len: -1 }).index
      : 0;
    return (
      <g key={`${p.id}-controls`} data-testid="campus-path-controls" data-path-id={p.id}>
        {p.points.map((point, index) => {
          const pointKey = `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;
          const isJunctionPoint = (pathPointCounts.get(pointKey) ?? 0) > 1;
          const isSelectedPoint = selectedPathPoint?.pathId === p.id && selectedPathPoint.pointIndex === index;
          return (
            <g key={`${p.id}-pt-${index}`}>
              <circle
                data-testid={isJunctionPoint ? "path-junction-handle" : "path-point-handle"}
                data-path-id={p.id}
                data-point-index={index}
                cx={point.x}
                cy={point.y}
                r={isJunctionPoint ? 7 : 6}
                fill={isSelectedPoint ? "var(--accent)" : "var(--card)"}
                stroke={isJunctionPoint ? "#f59e0b" : "var(--accent)"}
                strokeWidth={isSelectedPoint || isJunctionPoint ? 2.5 : 2}
                style={{ cursor: "grab", pointerEvents: "all" }}
                onMouseDown={(e) => onPathPointDown?.(e, p.id, index)}
                onClick={(e) => e.stopPropagation()}
              />
              {(index === 0 || index === p.points.length - 1) && (() => {
                const neighbor = index === 0 ? p.points[1] : p.points[index - 1];
                if (!neighbor) return null;
                const dx = point.x - neighbor.x;
                const dy = point.y - neighbor.y;
                const len = Math.max(1, Math.hypot(dx, dy));
                const hx = Math.round(point.x + (dx / len) * 20);
                const hy = Math.round(point.y + (dy / len) * 20);
                return (
                  <g data-testid="path-extension-handle" data-point-index={index}>
                    <line x1={point.x} y1={point.y} x2={hx} y2={hy} stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.65} className="pointer-events-none" />
                    <circle
                      cx={hx}
                      cy={hy}
                      r={6}
                      fill="var(--accent)"
                      stroke="white"
                      strokeWidth={2}
                      style={{ cursor: "crosshair", pointerEvents: "all" }}
                      onMouseDown={(e) => onPathExtendStart?.(e, p.id, index)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <path d={`M${hx - 3} ${hy} H${hx + 3} M${hx} ${hy - 3} V${hy + 3}`} stroke="white" strokeWidth={1.5} strokeLinecap="round" className="pointer-events-none" />
                  </g>
                );
              })()}
              {index < p.points.length - 1 && (() => {
                const next = p.points[index + 1];
                const mid = { x: Math.round((point.x + next.x) / 2), y: Math.round((point.y + next.y) / 2) };
                return (
                  <circle
                    data-testid="path-add-bend-handle"
                    cx={mid.x}
                    cy={mid.y}
                    r={4}
                    fill="var(--accent)"
                    opacity={0.75}
                    style={{ cursor: "copy", pointerEvents: "all" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (onPathAddPointDragStart) onPathAddPointDragStart(e, p.id, index + 1, mid);
                      else onPathAddPoint?.(p.id, index + 1, mid);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                );
              })()}
            </g>
          );
        })}
        {p.points.length > 1 && (() => {
          const a = p.points[widthSegmentIndex];
          const b = p.points[widthSegmentIndex + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const nx = -dy / len;
          const ny = dx / len;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const handle = { x: Math.round(mid.x + nx * (baseWidth / 2 + 18)), y: Math.round(mid.y + ny * (baseWidth / 2 + 18)) };
          return (
            <g data-testid="path-width-control">
              <line x1={mid.x} y1={mid.y} x2={handle.x} y2={handle.y} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.7} className="pointer-events-none" />
              <circle
                data-testid="path-width-handle"
                cx={handle.x}
                cy={handle.y}
                r={6}
                fill="var(--accent)"
                stroke="white"
                strokeWidth={2}
                style={{ cursor: "ew-resize", pointerEvents: "all" }}
                onMouseDown={(e) => { e.stopPropagation(); onPathWidthDown?.(e, p.id, widthSegmentIndex, handle); }}
                onClick={(e) => e.stopPropagation()}
              />
            </g>
          );
        })()}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ background: "#f3f1ec" }}
      onWheel={onWheel}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-over indicator — shows a real SVG preview of the dragged asset */}
      {dragOver && (
        <DragOverlay
          x={dragOver.x}
          y={dragOver.y}
          valid={dragOver.valid}
          label={dragOver.label}
          type={dragOver.type}
          assetType={dragOver.assetType}
        />
      )}

      {/* Dot grid pattern overlay — uses campus gridSize */}
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${cw} ${ch}`}
        className="w-full h-full"
        style={{ cursor, userSelect: "none" }}
        // Connect is an exclusive canvas interaction.  Capture it before
        // child Pathway/marker hit surfaces can bubble the same pointer into
        // their ordinary authoring handlers (which would create a loose
        // Walking Point instead of a draft bend).  The normal canvas handler
        // remains unchanged for every other tool.
        onMouseDownCapture={(event) => {
          if (connectCanvasActive) {
            event.stopPropagation();
            onCanvasDown(event);
          }
        }}
        onMouseDown={connectCanvasActive ? undefined : onCanvasDown}
        onClickCapture={(event) => {
          // A completed browser click follows mouse down/up.  Keep Connect's
          // canvas ownership exclusive for that trailing click as well, so a
          // Pathway's ordinary selection onClick cannot process the same
          // gesture after the Connect state machine has handled it.
          if (connectCanvasActive) event.stopPropagation();
        }}
        onMouseMove={onCanvasMove}
        onMouseUp={onCanvasUp}
        // A resize gesture is a draft transaction. Do not let a transient
        // pointer leave invoke the generic "finish everything" path and hide
        // the resize handles before Apply/Cancel. Other tools retain the
        // existing leave fallback for backwards compatibility.
        onMouseLeave={canvasResizeMode ? onCanvasLeave : (onCanvasLeave ?? onCanvasUp)}
        onDoubleClick={onCanvasDblClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx={0} dy={1} stdDeviation={2} floodColor="rgba(0,0,0,0.3)" />
          </filter>
          <CampusGroundPatternDefs />
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Canvas material is independent from the logical/editor snapping grid. */}
          <rect data-bg="true" data-ground-material={groundAppearance.material} width={cw} height={ch} fill={groundAppearance.color} />
          {groundPattern && <rect data-testid="campus-ground-texture" width={cw} height={ch} fill={`url(#${groundPattern})`} pointerEvents="none" opacity={0.82} />}
          {/* A restrained perimeter makes the authored campus extent explicit
              without adding another interactive object or affecting hit tests. */}
            <rect
            data-testid="campus-canvas-boundary"
            x={0}
            y={0}
            width={cw}
            height={ch}
            fill="none"
            stroke={canvasResizeInvalid ? "#dc2626" : "rgba(14,42,110,0.28)"}
            strokeWidth={1.5}
            pointerEvents="none"
          />
          {canvasResizeMode && (
            <g data-testid="canvas-resize-handles" className="pointer-events-auto">
              {([
                { handle: "n", x: cw / 2 - 18, y: 0, width: 36, height: 10, cursor: "ns-resize" },
                { handle: "s", x: cw / 2 - 18, y: ch - 10, width: 36, height: 10, cursor: "ns-resize" },
                { handle: "w", x: 0, y: ch / 2 - 18, width: 10, height: 36, cursor: "ew-resize" },
                { handle: "e", x: cw - 10, y: ch / 2 - 18, width: 10, height: 36, cursor: "ew-resize" },
                { handle: "nw", x: 0, y: 0, width: 14, height: 14, cursor: "nwse-resize" },
                { handle: "ne", x: cw - 14, y: 0, width: 14, height: 14, cursor: "nesw-resize" },
                { handle: "sw", x: 0, y: ch - 14, width: 14, height: 14, cursor: "nesw-resize" },
                { handle: "se", x: cw - 14, y: ch - 14, width: 14, height: 14, cursor: "nwse-resize" },
              ] as const).map(({ handle, x, y, width, height, cursor: handleCursor }) => (
                <rect
                  key={handle}
                  data-testid={`canvas-resize-handle-${handle}`}
                  role="button"
                  aria-label={`Resize campus canvas ${handle}`}
                  title={`Resize canvas ${handle}`}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx={handle.length === 2 ? 2 : 3}
                  fill={canvasResizeInvalid ? "#fef2f2" : "var(--card)"}
                  stroke={canvasResizeInvalid ? "#dc2626" : "var(--accent)"}
                  strokeWidth={2}
                  style={{ cursor: handleCursor }}
                  onMouseDown={(event) => { event.stopPropagation(); onCanvasResizeStart?.(event, handle); }}
                />
              ))}
              {canvasResizeInvalid && (
                <g data-testid="canvas-resize-invalid-feedback" className="pointer-events-none">
                  <rect x={cw / 2 - 124} y={12} width={248} height={24} rx={8} fill="#fef2f2" stroke="#dc2626" strokeWidth={1.2} opacity={0.96} />
                  <text x={cw / 2} y={28} textAnchor="middle" fontSize={10} fontWeight={700} fill="#b91c1c">Some authored content would be clipped</text>
                </g>
              )}
            </g>
          )}

          {/* Empty state — compact contextual prompt, not a tutorial */}
          {layer === "campus" && buildings.length === 0 && (
            <g opacity={0.5}>
              <text x={cw / 2} y={ch / 2 - 20} textAnchor="middle" fontSize={15} fontWeight="800" fill="var(--primary)" className="pointer-events-none select-none">Start Building Your Campus</text>
              <text x={cw / 2} y={ch / 2} textAnchor="middle" fontSize={10} fill="#6b7280" className="pointer-events-none select-none">Select a building type or asset from the left panel and place it here.</text>
            </g>
          )}

          {/* All SVG content (unchanged from original) */}
          {/* Navigation empty state — rendered as HTML overlay below (see end of Canvas) */}

          {/* The outdoor grid remains logical for snapping, but is intentionally
              hidden in the normal map view so the site plan stays quiet. */}

          {/* Layer-specific indicators */}
          {/* B5 Phase 1.7: the old static green dashed "entrance connector" was
              removed — after completing a path to a building entrance it read as
              a leftover preview line (a ghost dashed line after completion). The
              real committed edge to the entrance-linked waypoint is the only
              connection shown; the graph stays unambiguous. */}
          {layer === "events" &&
            buildings.map((b, i) =>
              i % 2 === 0 ? (
                <g key={`evt-${b.id}`} transform={`translate(${b.x + b.width / 2},${b.y - 14})`}>
                  <circle cx={0} cy={0} r={10} fill="#d97706" opacity={0.9} />
                  <text x={0} y={4} textAnchor="middle" fontSize={10} fill="white" className="pointer-events-none select-none">★</text>
                </g>
              ) : null
            )}

          {/* Ground Areas - background landscape layer */}
          {groundAreas.map((area) => {
            const template = DECOR_ASSET_MAP[area.type];
            if (!template) return null;
            if (area.surfaceCells?.length) {
              const size = Math.max(4, area.surfaceCellSize ?? campus.gridSize ?? 20);
              const style = groundStyle(area.groundType);
              const opacity = area.visible === false ? 0.16 : 0.9;
              return (
                <g key={area.id} data-testid="campus-surface" data-surface-material={area.groundType ?? "grass"} className="pointer-events-none" opacity={opacity}>
                  {surfaceCellRuns(area.surfaceCells).map((run) => (
                    <rect key={`${area.id}-${run.x}-${run.y}`} x={run.x * size} y={run.y * size} width={run.width * size + 0.5} height={size + 0.5} fill={style.fill} />
                  ))}
                </g>
              );
            }
            const rot = area.rotation ?? 0;
            const isVisible = area.visible ?? true;
            const isLocked = area.locked ?? false;
            const isAreaType = area.type !== "ground-area";
            const areaKind = area.groundType ?? groundTypeForDecorType(area.type) ?? "grass";
            const isSel = selected?.type === "decorAsset" && selected.id === area.id;
            const isMultiSel = multiSelected.includes(area.id);
            const width = Math.max(30, area.width ?? template.defaultWidth * decorRenderScale(area.scale));
            const height = Math.max(24, area.height ?? template.defaultHeight * decorRenderScale(area.scale));
            const hw = width / 2;
            const hh = height / 2;
            const style = groundStyle(areaKind);
            // New area assets are opaque ground paint, so adjacent/overlapping
            // same-material rectangles composite as one continuous surface
            // instead of darkening at their shared edges. Legacy Ground Area
            // records retain the softer historical opacity for compatibility.
            const editorOpacity = isVisible
              ? (isSel ? 0.98 : isAreaType ? 1 : 0.94)
              : (isSel || isMultiSel ? 0.34 : 0.2);
            const aabb = getRotatedAABB(area.x - hw, area.y - hh, width, height, rot);
            const rotRad = (rot * Math.PI) / 180;
            const cosR = Math.cos(rotRad);
            const sinR = Math.sin(rotRad);
            const cornerPos = (lx: number, ly: number) => ({
              x: area.x + lx * cosR - ly * sinR,
              y: area.y + lx * sinR + ly * cosR,
            });
            return (
              <g
                key={area.id}
                data-testid={isAreaType ? "campus-area" : "ground-area"}
                data-ground-type={areaKind}
                data-hidden={isVisible ? undefined : "true"}
                opacity={editorOpacity}
                style={{ cursor: isLocked ? "default" : tool === "select" ? "move" : cursor }}
                onMouseDown={(e) => { if (!isLocked && (tool === "select" || tool === "erase")) onItemDown(e, "decorAsset", area.id, area.x, area.y); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "decorAsset", area.id); }}
              >
                <g transform={`rotate(${rot}, ${area.x}, ${area.y})`}>
                  <rect
                    x={area.x - hw}
                    y={area.y - hh}
                    width={width}
                    height={height}
                    rx={isAreaType ? 0 : areaKind === "plaza" ? 5 : 10}
                    fill={style.fill}
                    stroke={isSel ? "var(--accent)" : areaKind === "parking" ? style.stroke : "transparent"}
                    strokeWidth={isSel ? 2 : areaKind === "parking" ? 0.8 : 0}
                  />
                  {style.pattern && (
                    <rect
                      x={area.x - hw}
                      y={area.y - hh}
                      width={width}
                      height={height}
                      fill={`url(#${style.pattern})`}
                      opacity={isSel ? 0.9 : 0.75}
                      pointerEvents="none"
                    />
                  )}
                  {areaKind === "parking" && (
                    <g data-testid="parking-stalls" pointerEvents="none" opacity={isSel ? 0.86 : 0.68}>
                      {(() => {
                        const horizontal = width >= height;
                        const span = horizontal ? width : height;
                        const depth = horizontal ? height : width;
                        const aisle = Math.max(14, Math.min(24, depth * 0.28));
                        const stallDepth = Math.max(8, (depth - aisle) / 2);
                        // Keep stalls visually consistent as the area is
                        // resized: derive a reasonable count from the current
                        // span rather than stretching a fixed illustration.
                        const count = Math.max(2, Math.min(14, Math.floor(span / 22)));
                        const x0 = area.x - hw;
                        const y0 = area.y - hh;
                        const x1 = area.x + hw;
                        const y1 = area.y + hh;
                        if (horizontal) {
                          const aisleTop = area.y - aisle / 2;
                          const aisleBottom = area.y + aisle / 2;
                          return (
                            <>
                              <line x1={x0 + 3} y1={area.y} x2={x1 - 3} y2={area.y} stroke="#8b949b" strokeWidth={1.1} opacity={0.6} />
                              {Array.from({ length: count + 1 }, (_, index) => {
                                const x = x0 + (index * span) / count;
                                return <g key={`parking-v-${index}`}><line x1={x} y1={y0 + 3} x2={x} y2={aisleTop - 2} stroke={style.accent} strokeWidth={1.1} /><line x1={x} y1={aisleBottom + 2} x2={x} y2={y1 - 3} stroke={style.accent} strokeWidth={1.1} /></g>;
                              })}
                              <line x1={x0 + 3} y1={y0 + stallDepth} x2={x1 - 3} y2={y0 + stallDepth} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
                              <line x1={x0 + 3} y1={y1 - stallDepth} x2={x1 - 3} y2={y1 - stallDepth} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
                            </>
                          );
                        }
                        const aisleLeft = area.x - aisle / 2;
                        const aisleRight = area.x + aisle / 2;
                        return (
                          <>
                            <line x1={area.x} y1={y0 + 3} x2={area.x} y2={y1 - 3} stroke="#8b949b" strokeWidth={1.1} opacity={0.6} />
                            {Array.from({ length: count + 1 }, (_, index) => {
                              const y = y0 + (index * depth) / count;
                              return <g key={`parking-h-${index}`}><line x1={x0 + 3} y1={y} x2={aisleLeft - 2} y2={y} stroke={style.accent} strokeWidth={1.1} /><line x1={aisleRight + 2} y1={y} x2={x1 - 3} y2={y} stroke={style.accent} strokeWidth={1.1} /></g>;
                            })}
                            <line x1={x0 + stallDepth} y1={y0 + 3} x2={x0 + stallDepth} y2={y1 - 3} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
                            <line x1={x1 - stallDepth} y1={y0 + 3} x2={x1 - stallDepth} y2={y1 - 3} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
                          </>
                        );
                      })()}
                    </g>
                  )}
                  {(isSel || isMultiSel) && (
                    <rect
                      x={area.x - hw - 5}
                      y={area.y - hh - 5}
                      width={width + 10}
                      height={height + 10}
                      rx={isAreaType ? 2 : areaKind === "plaza" ? 7 : 12}
                      fill="none"
                      stroke={isSel ? "var(--accent)" : "var(--primary)"}
                      strokeWidth={isSel ? 2 : 1}
                      strokeDasharray={undefined}
                      opacity={isSel ? 0.72 : 0.35}
                    />
                  )}
                </g>
                {isSel && !physicalGroupResizeEligible && !isLocked && tool === "select" && ["nw", "ne", "sw", "se"].map((corner) => {
                  const lx = corner.includes("e") ? hw : -hw;
                  const ly = corner.includes("s") ? hh : -hh;
                  const p = cornerPos(lx, ly);
                  return (
                    <g key={corner}>
                      {/* Keep a slightly larger invisible hit target while making
                          the visible grip proportional to small outdoor assets. */}
                      <rect data-testid="ground-area-resize-handle" data-corner={corner} x={p.x - 10} y={p.y - 10} width={20} height={20} fill="transparent" style={{ cursor: getCornerCursor(corner, rot) }} onMouseDown={(e) => { e.stopPropagation(); onDecorResizeStart?.(e, area, corner); }} />
                      <rect x={p.x - 5} y={p.y - 5} width={10} height={10} rx={2} fill="white" stroke="var(--accent)" strokeWidth={1.6} className="pointer-events-none" />
                    </g>
                  );
                })}
                {isSel && !physicalGroupResizeEligible && !isLocked && tool === "select" && ["n", "s", "e", "w"].map((side) => {
                  const lx = side === "e" ? hw : side === "w" ? -hw : 0;
                  const ly = side === "s" ? hh : side === "n" ? -hh : 0;
                  const p = cornerPos(lx, ly);
                  return (
                    <circle
                      key={side}
                      data-testid="ground-area-resize-handle"
                      data-corner={side}
                      cx={p.x}
                      cy={p.y}
                      r={5}
                      fill="white"
                      stroke="var(--accent)"
                      strokeWidth={1.6}
                      style={{ cursor: getEdgeCursor(side, rot) }}
                      onMouseDown={(e) => { e.stopPropagation(); onDecorResizeStart?.(e, area, side); }}
                    />
                  );
                })}
                {decorResizingId === area.id && (
                  <g className="pointer-events-none select-none">
                    <rect x={aabb.x + aabb.width / 2 - 34} y={aabb.y + aabb.height + 6} width={68} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                    <text x={aabb.x + aabb.width / 2} y={aabb.y + aabb.height + 18} textAnchor="middle" fill="white" fontSize={9} fontWeight="900">{Math.round(width)}x{Math.round(height)}</text>
                  </g>
                )}
              </g>
            );
          })}

          {armedDecorAssetType && cursorPos && tool === "decor" && DECOR_ASSET_MAP[armedDecorAssetType] && (() => {
            const descriptor = DECOR_ASSET_MAP[armedDecorAssetType];
            return (
              <g data-testid="decor-placement-preview" transform={`translate(${cursorPos.x},${cursorPos.y})`} opacity={0.42} className="pointer-events-none">
                <rect x={-descriptor.defaultWidth / 2 - 4} y={-descriptor.defaultHeight / 2 - 4} width={descriptor.defaultWidth + 8} height={descriptor.defaultHeight + 8} rx={4} fill="rgba(34,197,94,0.12)" stroke="#16a34a" strokeWidth={1.2} />
                <g transform={`translate(${-descriptor.defaultWidth / 2},${-descriptor.defaultHeight / 2})`}>
                  <DecorAssetArt descriptor={descriptor} />
                </g>
              </g>
            );
          })()}

          {groundBrushPreview && layer !== "navigation" && (
            <g data-testid="ground-brush-preview" data-ground-type={groundPaintType} className="pointer-events-none">
              {(() => {
                const style = groundStyle(groundPaintType);
                return (
                  <>
                    <rect
                      x={groundBrushPreview.x}
                      y={groundBrushPreview.y}
                      width={groundBrushPreview.width}
                      height={groundBrushPreview.height}
                      rx={groundPaintType === "plaza" ? 5 : 10}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      opacity={0.48}
                    />
                    <path
                      d={`M${groundBrushPreview.x + 8} ${groundBrushPreview.y + groundBrushPreview.height * 0.35} H${groundBrushPreview.x + groundBrushPreview.width - 8} M${groundBrushPreview.x + 8} ${groundBrushPreview.y + groundBrushPreview.height * 0.65} H${groundBrushPreview.x + groundBrushPreview.width - 8}`}
                      fill="none"
                      stroke={style.accent}
                      strokeWidth={1}
                      strokeLinecap="round"
                      opacity={0.7}
                    />
                  </>
                );
              })()}
            </g>
          )}

          {groundErasePreview && layer !== "navigation" && (
            <g data-testid="ground-erase-preview" className="pointer-events-none">
              <rect
                x={groundErasePreview.x}
                y={groundErasePreview.y}
                width={groundErasePreview.width}
                height={groundErasePreview.height}
                rx={6}
                fill="rgba(239,68,68,0.08)"
                stroke="rgba(220,38,38,0.72)"
                strokeWidth={2}
                strokeDasharray="5 3"
              />
              <path
                d={`M${groundErasePreview.x + 6} ${groundErasePreview.y + 6} L${groundErasePreview.x + groundErasePreview.width - 6} ${groundErasePreview.y + groundErasePreview.height - 6} M${groundErasePreview.x + groundErasePreview.width - 6} ${groundErasePreview.y + 6} L${groundErasePreview.x + 6} ${groundErasePreview.y + groundErasePreview.height - 6}`}
                stroke="rgba(220,38,38,0.7)"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            </g>
          )}

          {/* A selected physical Path Network owns the empty interior of its
              bounds, but this hit surface is deliberately rendered UNDER the
              physical path, nav, entrance, and handle layers. Those higher
              priority targets therefore keep their normal interactions while
              truly empty space starts the same group-drag pipeline. */}
          {pathOnlyMultiSelect && !pathMemberEditId && tool === "select" && groupSelectionBounds && (
            <rect
              data-testid="campus-path-network-empty-drag-surface"
              x={groupSelectionBounds.x - 4}
              y={groupSelectionBounds.y - 4}
              width={groupSelectionBounds.width + 8}
              height={groupSelectionBounds.height + 8}
              rx={2}
              fill="transparent"
              stroke="none"
              style={{ cursor: "move", pointerEvents: "fill" }}
              onMouseDown={(e) => onGroupSurfaceDown?.(e)}
            />
          )}

          {/* Paths — B5 Phase 5.17: two-pass rendering so surface strokes always
              cover edge strokes at junctions. Pass 1: all edge strokes (background).
              Pass 2: all surface strokes + centerlines + selection highlights (foreground).
              This eliminates the "branch drawn on top" overlap look at T-junctions. */}
          <g data-testid="path-chain-layer" className="pointer-events-none">
            {/* Pass 1: edge strokes (all chains, rendered first = background) */}
            {pathGeometry.chains.map((chain) => {
              const kind = chain.style.kind;
              const baseWidth = chain.style.baseWidth;
              const d = buildChainPathD(chain);
              const join = kind === "road" ? "bevel" : "round";
              const hoveredNetworkId = hoveredPathId ? paths.find((path) => path.id === hoveredPathId)?.pathNetworkId : undefined;
              const networkHoverActive = !!hoveredNetworkId && chain.pathIds.some((id) => paths.some((path) => path.id === id && path.pathNetworkId === hoveredNetworkId));
              const chainHasHoveredMember = !!hoveredPathId && chain.pathIds.includes(hoveredPathId);
              const chainOpacity = networkHoverActive ? (chainHasHoveredMember ? 1 : 0.42) : 1;
              return (
                <path key={`${chain.id}-edge`} d={d} fill="none" stroke={chain.style.edge} strokeWidth={baseWidth + 2} strokeLinecap="butt" strokeLinejoin={join} opacity={chainOpacity} />
              );
            })}
            {/* Pass 2: surface strokes + centerlines + selection (all chains, rendered second = foreground) */}
            {pathGeometry.chains.map((chain) => {
              const kind = chain.style.kind;
              const baseWidth = chain.style.baseWidth;
              const d = buildChainPathD(chain);
              const isSel = chain.pathIds.some((id) => selected?.type === "path" && selected.id === id);
              const isMultiSel = chain.pathIds.some((id) => multiSelected.includes(id));
              const isAnimating = !!animatingPathId && chain.pathIds.includes(animatingPathId);
              const join = kind === "road" ? "bevel" : "round";
              const hoveredNetworkId = hoveredPathId ? paths.find((path) => path.id === hoveredPathId)?.pathNetworkId : undefined;
              const networkHoverActive = !!hoveredNetworkId && chain.pathIds.some((id) => paths.some((path) => path.id === id && path.pathNetworkId === hoveredNetworkId));
              const chainHasHoveredMember = !!hoveredPathId && chain.pathIds.includes(hoveredPathId);
              const chainOpacity = networkHoverActive ? (chainHasHoveredMember ? 1 : 0.42) : 1;
              return (
                <g key={chain.id} data-testid="path-chain" data-chain-kind={kind} data-path-ids={chain.pathIds.join(",")}>
                  {isAnimating ? (
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={chain.style.surface}
                      strokeWidth={baseWidth}
                      strokeLinecap="butt"
                      strokeLinejoin={join}
                      initial={{ pathLength: 0, opacity: 1 }}
                      animate={{ pathLength: 1, opacity: chainOpacity }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    />
                  ) : (
                    <path d={d} fill="none" stroke={chain.style.surface} strokeWidth={baseWidth} strokeLinecap="butt" strokeLinejoin={join} opacity={chainOpacity} />
                  )}
                  {kind === "road" && <path d={d} fill="none" stroke="#f8fafc" strokeWidth={1.2} strokeLinecap="butt" strokeLinejoin="bevel" strokeDasharray="10 10" opacity={0.72 * chainOpacity} />}
                  {(isSel || isMultiSel) && <path d={d} fill="none" stroke={isSel ? "var(--accent)" : "var(--primary)"} strokeWidth={baseWidth + 6} strokeLinecap="butt" strokeLinejoin={join} opacity={(isSel ? 0.18 : 0.12) * chainOpacity} />}
                </g>
              );
            })}
            {hoveredPathId && (() => {
              const hoveredPath = paths.find((path) => path.id === hoveredPathId);
              if (!hoveredPath?.pathNetworkId) return null;
              const kind = hoveredPath.type === "road" || hoveredPath.type === "driveway" ? "road" : hoveredPath.type === "accessible" ? "accessible" : "walkway";
              const width = Math.max(3, hoveredPath.width ?? (kind === "road" ? 18 : 10));
              return (
                <polyline
                  data-testid="hovered-path-highlight"
                  data-path-id={hoveredPath.id}
                  points={hoveredPath.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={width + 5}
                  strokeLinecap="butt"
                  strokeLinejoin={kind === "road" ? "bevel" : "round"}
                  opacity={0.28}
                />
              );
            })()}
          </g>

          {/* Hidden physical Pathways remain recoverable in the admin editor.
              They are excluded from the normal network surface above and render
              only as a subdued, dashed editor ghost. */}
          <g data-testid="hidden-path-editor-layer" className="pointer-events-none">
            {paths.filter((path) => editorPathRenderMode(path) === "ghost").map((path) => {
              const style = pathRenderStyle(path);
              const mid = path.points[Math.floor((path.points.length - 1) / 2)];
              return (
                <g key={`${path.id}-hidden-ghost`} data-testid="hidden-campus-path-ghost" data-path-id={path.id}>
                  <polyline
                    points={path.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={style.surface}
                    strokeWidth={style.baseWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="7 5"
                    opacity={0.28}
                  />
                  {mid && (
                    <g transform={`translate(${mid.x} ${mid.y})`}>
                      <circle r={7} fill="var(--card)" stroke="var(--muted-foreground)" strokeWidth={1.2} opacity={0.9} />
                      <path d="M-4 4 L4 -4" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {paths.map((p) => {
            const kind = p.type === "road" || p.type === "driveway" ? "road" : p.type === "accessible" ? "accessible" : "walkway";
            const baseWidth = Math.max(3, p.width ?? (kind === "road" ? 18 : 10));
            // Unified editor — paths always interactive in select/erase/pan tools
            return (
              <g
                key={`${p.id}-hit`}
                data-testid="campus-path"
                data-path-id={p.id}
                data-path-network-id={p.pathNetworkId}
                data-path-kind={kind}
                onMouseEnter={() => onPathHover?.(p.id)}
                onMouseLeave={() => onPathHover?.(null)}
                onMouseDown={(e) => {
                  // Navigation authoring tools need the canvas to see a
                  // physical-path hit so they can place a manual point or
                  // explain why Connect needs a real navigation anchor first.
                  // Select/erase retain the path surface's existing isolated
                  // interaction behavior.
                  if (tool === "select") {
                    e.stopPropagation();
                    onPathDown?.(e, p.id);
                  } else if (!(layer === "navigation" && (tool === "marker" || tool === "connect" || tool === "path"))) {
                    e.stopPropagation();
                  }
                }}
                onClick={(e) => { e.stopPropagation(); if (tool === "erase") { onSelect(null); } else onPathClick(p.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); if (tool === "select") onPathDblClick?.(p.id); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "path", p.id); }}
                style={{ cursor: p.locked ? "not-allowed" : tool === "erase" ? "not-allowed" : tool === "select" ? "move" : "pointer" }}
              >
                <polyline points={p.points.map((pt) => `${pt.x},${pt.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={baseWidth + 2} strokeLinecap="butt" strokeLinejoin={kind === "road" ? "bevel" : "round"} />
              </g>
            );
          })}

          {/* Style-transition junction covers — small corner fills only (no
              internal end outlines; same-style joins are one continuous chain). */}
          {renderPathJunctionLayer()}
          {paths.map((p) => renderPathControls(p))}

          {pathPaintPreview && shouldRenderPathwayAuthoringPreview(true, layer === "navigation") && (
            <g data-testid="path-paint-preview" data-path-kind={pathPaintPreview.type} className="pointer-events-none">
              {pathPaintPreview.points.length > 1 ? (
                <>
                  <polyline
                    points={pathPaintPreview.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={pathPaintPreview.type === "road" ? "#64748b" : pathPaintPreview.type === "accessible" ? "#059669" : "#64748b"}
                    strokeWidth={pathPaintPreview.width + 2}
                    strokeLinecap={pathPaintPreview.type === "road" ? "butt" : "round"}
                    strokeLinejoin={pathPaintPreview.type === "road" ? "bevel" : "round"}
                    opacity={0.42}
                  />
                  <polyline
                    points={pathPaintPreview.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={pathPaintPreview.color}
                    strokeWidth={pathPaintPreview.width}
                    strokeLinecap={pathPaintPreview.type === "road" ? "butt" : "round"}
                    strokeLinejoin={pathPaintPreview.type === "road" ? "bevel" : "round"}
                    opacity={0.68}
                  />
                  {pathPaintPreview.type === "road" && (
                    <polyline
                      points={pathPaintPreview.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#f8fafc"
                      strokeWidth={1.2}
                      strokeLinecap="butt"
                      strokeLinejoin="bevel"
                      strokeDasharray="10 10"
                      opacity={0.65}
                    />
                  )}
                  {pathPaintPreview.snapKind && (() => {
                    const end = pathPaintPreview.points[pathPaintPreview.points.length - 1];
                    if (!end) return null;
                    const isSegment = pathPaintPreview.snapKind === "segment";
                    return (
                      <g data-testid={isSegment ? "path-segment-junction-target" : "path-endpoint-junction-target"}>
                        <circle cx={end.x} cy={end.y} r={pathPaintPreview.width / 2 + 8} fill={isSegment ? "rgba(245,158,11,0.14)" : "rgba(34,197,94,0.14)"} stroke={isSegment ? "#f59e0b" : "#22c55e"} strokeWidth={2} strokeDasharray={isSegment ? "4 3" : undefined} />
                        {isSegment && (
                          <path d={`M${end.x - 6} ${end.y} H${end.x + 6} M${end.x} ${end.y - 6} V${end.y + 6}`} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
                        )}
                      </g>
                    );
                  })()}
                </>
              ) : (
                <circle
                  cx={pathPaintPreview.points[0]?.x ?? 0}
                  cy={pathPaintPreview.points[0]?.y ?? 0}
                  r={pathPaintPreview.width / 2}
                  fill={pathPaintPreview.color}
                  stroke={pathPaintPreview.type === "road" ? "#64748b" : pathPaintPreview.type === "accessible" ? "#059669" : "#64748b"}
                  strokeWidth={2}
                  opacity={0.42}
                />
              )}
            </g>
          )}

          {/* Test-navigation highlighted route */}
          {!highlightedRoute?.routeNodeIds?.length && highlightedRoute && (highlightedRoute.waypoints.length > 0 || (highlightedRoute.endpointMarkers?.length ?? 0) > 0 || (highlightedRoute.transitionMarkers?.length ?? 0) > 0) && (
            <>
            <g pointerEvents="none">
              {/* Soft glow underlay */}
              <polyline
                points={highlightedRoute.waypoints.map((w) => `${w.x},${w.y}`).join(" ")}
                fill="none"
                stroke={highlightedRoute.color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
              />
              {/* Clean route stroke. A light dash animation communicates travel
                  direction without turning the preview into an editable path. */}
              <polyline
                points={highlightedRoute.waypoints.map((w) => `${w.x},${w.y}`).join(" ")}
                fill="none"
                stroke={highlightedRoute.color}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="12 8"
                opacity={0.95}
              >
                <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.2s" repeatCount="indefinite" />
              </polyline>
              {routeDirectionMarkers(highlightedRoute.waypoints).map((marker, index) => (
                <path
                  key={`route-arrow-${index}`}
                  d="M -5 -4 L 5 0 L -5 4 Z"
                  transform={`translate(${marker.x} ${marker.y}) rotate(${marker.angle})`}
                  fill={highlightedRoute.color}
                  stroke="white"
                  strokeWidth={1}
                  opacity={0.95}
                />
              ))}
            </g>
            </>
          )}

          {/* Alignment guides */}
          {guides && guides.map((g, i) => (
            <g key={`g${i}`}>
              {g.type === "v" ? (
                <line data-testid="alignment-guide" x1={g.pos} y1={0} x2={g.pos} y2={ch} stroke="var(--accent)" strokeWidth={8} opacity={0.15} />
              ) : (
                <line data-testid="alignment-guide" x1={0} y1={g.pos} x2={cw} y2={g.pos} stroke="var(--accent)" strokeWidth={8} opacity={0.15} />
              )}
              {g.type === "v" ? (
                <line x1={g.pos} y1={0} x2={g.pos} y2={ch} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              ) : (
                <line x1={0} y1={g.pos} x2={cw} y2={g.pos} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              )}
              <rect x={g.type === "v" ? g.pos - 16 : cw - 36} y={g.type === "v" ? 6 : g.pos - 7} width={32} height={14} rx={3} fill="var(--accent)" fillOpacity={0.85} />
              <text x={g.type === "v" ? g.pos : cw - 20} y={g.type === "v" ? 15 : g.pos + 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="800" className="pointer-events-none select-none">{g.pos}</text>
            </g>
          ))}

          {/* Rubber-band selection */}
          {rubberBand && (() => {
            const rx = Math.min(rubberBand.sx, rubberBand.cx);
            const ry = Math.min(rubberBand.sy, rubberBand.cy);
            const rw = Math.abs(rubberBand.cx - rubberBand.sx);
            const rh = Math.abs(rubberBand.cy - rubberBand.sy);
            return (
              <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(14,42,110,0.06)" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="6 4" rx={2} />
            );
          })()}

          {/* Building drag preview — uses the SAME geometry function as the
              finalize step, so the preview and the created building always match
              exactly (position, size, minimums, canvas clamping). */}
          {(pathGroupRotationBounds ?? groupSelectionBounds ?? navGroupBounds) && (() => {
            const bounds = pathGroupRotationBounds ?? groupSelectionBounds ?? navGroupBounds!;
            const pad = 4;
            const x = bounds.x - pad;
            const y = bounds.y - pad;
            const w = bounds.width + pad * 2;
            const h = bounds.height + pad * 2;
            // B5 correction: the nav graph group's outline interior is a REAL
            // drag surface (same one the outdoor object-group UX uses) — but
            // only when the selection can actually move a rigid group. It
            // renders BEFORE the graph so nodes/edges/bend handles stay on top
            // (event priority: direct edit > node/edge > empty interior).
            const renderNavDragSurface = !!navGroupBounds && navGroupDragSurfaceEligible && !groupSelectionBounds && !pathGroupRotationBounds;
            // The transparent hit surface is interactive for BOTH the outdoor
            // object-group UX (campus layer) and the nav graph group (nav
            // layer); it stays inert when it is only a visual outline.
            // A path-only network is selected through the physical path hit
            // targets themselves. Its transparent bounds must not sit above
            // those targets, otherwise the second click (and member drag)
            // can only re-enter the group transform and never reach the
            // individual Pathway. Mixed object groups and nav groups retain
            // their existing bounds drag surface.
            const surfaceInteractive = (!isPathOnlyGroup && !!groupSelectionBounds) || !!pathGroupRotationBounds || renderNavDragSurface;
            // B5 Phase 5.14: during rotation, the selection frame rotates with
            // the network via SVG transform around the captured pivot center.
            const rotationAngle = pathGroupRotationBounds?.angle ?? 0;
            const rotCx = pathGroupRotationBounds?.cx ?? (x + w / 2);
            const rotCy = pathGroupRotationBounds?.cy ?? (y + h / 2);
            const transform = rotationAngle !== 0 ? `rotate(${rotationAngle} ${rotCx} ${rotCy})` : undefined;
            return (
              <g transform={transform}>
                <rect
                  data-testid="campus-group-drag-surface"
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={2}
                  fill="transparent"
                  stroke="none"
                  style={{ cursor: tool === "select" ? "move" : cursor, pointerEvents: surfaceInteractive ? "fill" : "none" }}
                  onMouseDown={(e) => { if (surfaceInteractive) onGroupSurfaceDown?.(e); }}
                />
                <rect
                  data-testid="campus-group-outline"
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
                {(isPathOnlyGroup || physicalGroupResizeEligible) && (["nw", "ne", "sw", "se"] as const).map((corner) => {
                  const hx = corner.includes("e") ? x + w : x;
                  const hy = corner.includes("s") ? y + h : y;
                  return (
                    <rect
                      key={corner}
                      data-testid={isPathOnlyGroup ? "path-group-scale-handle" : "campus-group-resize-handle"}
                      data-corner={corner}
                      x={hx - 5}
                      y={hy - 5}
                      width={10}
                      height={10}
                      rx={2}
                      fill="var(--card)"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize", pointerEvents: "all" }}
                      onMouseDown={(e) => {
                        if (isPathOnlyGroup) onPathGroupScaleStart?.(e, corner, groupSelectionBounds);
                        else onGroupResizeStart?.(e, corner, groupSelectionBounds!);
                      }}
                    />
                  );
                })}
                {isPathOnlyGroup && (
                  <g>
                    <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - 30} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.5} />
                    <circle
                      data-testid="path-group-rotate-handle"
                      cx={x + w / 2}
                      cy={y - 30}
                      r={6}
                      fill="var(--accent)"
                      stroke="white"
                      strokeWidth={2}
                      style={{ cursor: "grab", pointerEvents: "all" }}
                      onMouseDown={(e) => onPathGroupRotateStart?.(e, { x: x + w / 2, y: y + h / 2 })}
                    />
                    <path d={`M${x + w / 2 - 2.5} ${y - 32} Q${x + w / 2} ${y - 35} ${x + w / 2 + 2.5} ${y - 32}`} fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" className="pointer-events-none" />
                  </g>
                )}
                {isPathOnlyGroup && pathGroupRotationActive && (
                  <g className="pointer-events-none select-none">
                    <rect x={x + w / 2 - 22} y={y - 52} width={44} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                    <text x={x + w / 2} y={y - 39} textAnchor="middle" fill="white" fontSize={10} fontWeight="900">{Math.round(rotatingAngle ?? 0)}°</text>
                  </g>
                )}
              </g>
            );
          })()}

          {buildingDrag && (() => {
            const r = computeBuildingPlacement(
              buildingDrag.sx, buildingDrag.sy, buildingDrag.cx, buildingDrag.cy,
              cw, ch
            );
            const safe = campusObjectSafeBounds(cw, ch);
            const width = Math.min(r.width, safe.maxX - safe.minX);
            const height = Math.min(r.height, safe.maxY - safe.minY);
            const x = Math.max(safe.minX, Math.min(safe.maxX - width, r.x));
            const y = Math.max(safe.minY, Math.min(safe.maxY - height, r.y));
            return (
              <g>
                <rect x={x} y={y} width={width} height={height} rx={6} fill="var(--primary)" fillOpacity={0.12} stroke="var(--primary)" strokeWidth={2} strokeDasharray="8 4" />
                <text x={r.x + r.width / 2} y={r.y + r.height / 2 + 3} textAnchor="middle" fill="var(--primary)" fontSize={10} fontWeight="700" className="pointer-events-none select-none">{r.width}×{r.height}</text>
              </g>
            );
          })()}
          {buildingPlacementPreview && cursorPos && tool === "building" && !buildingDrag && (() => {
            const safe = campusObjectSafeBounds(cw, ch);
            const width = Math.min(buildingPlacementPreview.defaultWidth, safe.maxX - safe.minX);
            const height = Math.min(buildingPlacementPreview.defaultHeight, safe.maxY - safe.minY);
            const x = Math.max(safe.minX, Math.min(safe.maxX - width, cursorPos.x - width / 2));
            const y = Math.max(safe.minY, Math.min(safe.maxY - height, cursorPos.y - height / 2));
            return (
              <g data-testid="building-placement-preview" className="pointer-events-none" opacity={0.42}>
                <rect x={x} y={y} width={buildingPlacementPreview.defaultWidth} height={buildingPlacementPreview.defaultHeight} rx={6} fill={buildingPlacementPreview.color} fillOpacity={0.18} stroke={buildingPlacementPreview.color} strokeWidth={2} strokeDasharray="8 4" />
                <text x={x + buildingPlacementPreview.defaultWidth / 2} y={y + buildingPlacementPreview.defaultHeight / 2 + 3} textAnchor="middle" fill={buildingPlacementPreview.color} fontSize={10} fontWeight="700" className="select-none">{buildingPlacementPreview.label}</text>
              </g>
            );
          })()}
          {armedCampusGatePlacement && cursorPos && tool === "gate" && (
            <g data-testid="campus-gate-placement-preview" transform={`translate(${cursorPos.x},${cursorPos.y})`} opacity={0.45} className="pointer-events-none">
              <rect x={-24} y={-19} width={48} height={38} rx={5} fill="rgba(37,99,235,0.1)" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 3" />
              <CampusGateVisual x={-22} y={-17} width={44} height={34} color="#2563eb" />
            </g>
          )}

          {/* Drawing path */}
          {drawingPath.length > 0 && (
            <g>
              {drawingPath.length > 1 && (
                <polyline points={drawingPath.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth={4} strokeLinecap="round" strokeDasharray="10 5" opacity={0.9} />
              )}
              {drawingPath.map((pt, i) => (
                <g key={i}>
                  <circle cx={pt.x} cy={pt.y} r={6} fill="var(--primary)" opacity={0.9} />
                  <text x={pt.x} y={pt.y - 12} textAnchor="middle" fontSize={8} fill="var(--primary)" fontWeight="700" className="select-none">{i + 1}</text>
                </g>
              ))}
            </g>
          )}

          {/* Buildings + decorative assets — ONE cross-type visual stack */}
          {stackedOutdoor.map((entry) => {
            if (entry.kind === "building") {
              const b = entry.item as CampusBuilding;
              const isSel = selected?.type === "building" && selected.id === b.id;
            const isMultiSel = multiSelected.includes(b.id);
            const isInvalid = invalidBuildings?.has(b.id) ?? false;
            const isOverlapping = overlappingBuildings?.has(b.id) ?? false;
            const cx = b.x + b.width / 2;
            const cy = b.y + b.height / 2;
            const rot = b.rotation ?? 0;
            const isVisible = b.visible ?? true;
            const isLocked = b.locked ?? false;
            const opacity = b.opacity ?? 1;
            const editorOpacity = isVisible ? opacity : Math.min(opacity, isSel || isMultiSel ? 0.35 : 0.28);
            return (
              <g key={b.id} data-hidden={isVisible ? undefined : "true"} onMouseDown={(e) => { if (isLocked) return; onItemDown(e, "building", b.id, b.x, b.y); }} onMouseEnter={() => { if (testRoutePickKind) onTestRoutePickHover?.({ type: "building", id: b.id }); }} onMouseLeave={() => { if (testRoutePickHover?.type === "building" && testRoutePickHover.id === b.id) onTestRoutePickHover?.(null); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (isLocked) return; onItemContextMenu?.(e, "building", b.id); }} onDoubleClick={(e) => { if (isLocked) return; e.stopPropagation(); onBuildingDoubleClick?.(b.id); }} style={{ cursor: isLocked ? "default" : tool === "select" ? "move" : cursor, opacity: editorOpacity }}>
                {/* ── Rotated group: shadow, outline, handles, overlap borders, and body all rotate together ── */}
                <g transform={rot !== 0 ? `rotate(${rot}, ${cx}, ${cy})` : ''}>
                  {/* The editor wrapper owns hit testing; the shared visual
                      remains pointer-transparent in Admin mode. */}
                  <rect
                    data-testid="building-hit-target"
                    x={b.x - 2}
                    y={b.y - 2}
                    width={b.width + 4}
                    height={b.height + 4}
                    rx={9}
                    fill="transparent"
                    stroke="none"
                    pointerEvents="all"
                  />
                  {/* Multi-selection highlight */}
                  {isMultiSel && !isSel && (
                    <rect x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx={8} fill="none" stroke="var(--primary)" strokeWidth={1} strokeDasharray="3 4" opacity={0.35} />
                  )}
                  {/* Overlap warning border (rotated with building so it matches the actual visual) */}
                  {isOverlapping && (
                    <>
                      <rect x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx={10} fill="none" stroke="#dc2626" strokeWidth={2.5} strokeDasharray="6 4" opacity={0.9} />
                      <rect x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={12} fill="none" stroke="#dc2626" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} />
                    </>
                  )}
                  {/* Building body */}
                  {testRoutePickKind && (
                    <rect x={b.x - 5} y={b.y - 5} width={b.width + 10} height={b.height + 10} rx={10}
                      fill="none" stroke="#8b5cf6" strokeWidth={testRoutePickHover?.type === "building" && testRoutePickHover.id === b.id ? 3 : 1.6}
                      strokeDasharray={testRoutePickHover?.type === "building" && testRoutePickHover.id === b.id ? undefined : "5 4"} opacity={testRoutePickHover?.type === "building" && testRoutePickHover.id === b.id ? 1 : 0.55} className="pointer-events-none" />
                  )}
                  <OutdoorBuildingVisual
                    building={b}
                    applyTransform={false}
                    applyOpacity={false}
                    interactive={false}
                    showName={zoom > 0.7 && b.name !== "New Building"}
                    showFloorCount
                    labelLayout="editor"
                    bodyOpacity={0.82}
                  />
                  {!isVisible && (
                    <g className="pointer-events-none select-none" opacity={0.95}>
                      <rect x={b.x + 5} y={b.y + 5} width={18} height={14} rx={4} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
                      <path d={`M${b.x + 8} ${b.y + 12} Q${b.x + 14} ${b.y + 7} ${b.x + 20} ${b.y + 12} Q${b.x + 14} ${b.y + 17} ${b.x + 8} ${b.y + 12}Z`} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} />
                      <circle cx={b.x + 14} cy={b.y + 12} r={2} fill="var(--muted-foreground)" />
                      <line x1={b.x + 8} y1={b.y + 17} x2={b.x + 21} y2={b.y + 6} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
                    </g>
                  )}
                  {/* Building name — INSIDE rotation group so it rotates with building code */}
                  {false && zoom > 0.7 && b.name !== "New Building" && (
                    <text x={cx} y={b.y + b.height / 2 + 14} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={5.5} fontWeight="600" className="pointer-events-none select-none" stroke="rgba(0,0,0,0.15)" strokeWidth={1.5} paintOrder="stroke">
                      {b.name.length > 16 ? b.name.slice(0, 14) + "…" : b.name}
                    </text>
                  )}
                  {isLocked && (
                    <g>
                      <rect x={b.x + b.width - 16} y={b.y + 4} width={12} height={10} rx={2} fill="rgba(255,255,255,0.85)" />
                      <text x={b.x + b.width - 10} y={b.y + 12} textAnchor="middle" fill="#92400e" fontSize={8} fontWeight="900" className="pointer-events-none select-none">🔒</text>
                    </g>
                  )}
                  {/* Issue indicator replaced with subtle badge — see below */}
                  {/* Single selection outlines + resize handles — rendered ABOVE the body so the rotation-aware resize cursors are visible on hover (rotated with building) */}
                  {isSel && !physicalGroupResizeEligible && !isLocked && (
                    <>
                      <rect x={b.x - 8} y={b.y - 8} width={b.width + 16} height={b.height + 16} rx={12} fill="none" stroke="var(--accent)" strokeWidth={5} opacity={0.15} />
                      <rect x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={10} fill="none" stroke="var(--accent)" strokeWidth={2.5} opacity={0.8} />
                      {(() => {
                        return ["nw", "ne", "sw", "se"].map((corner) => {
                          const hs = 14;
                          const hx = corner.includes("e") ? b.x + b.width - hs / 2 : b.x - hs / 2;
                          const hy = corner.includes("s") ? b.y + b.height - hs / 2 : b.y - hs / 2;
                          const cornerCursor = getCornerCursor(corner, rot);
                          return (
                            <g key={corner}>
                              <rect x={hx - 5} y={hy - 5} width={hs + 10} height={hs + 10} fill="transparent" stroke="none" style={{ cursor: cornerCursor }} onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />
                              <rect x={hx} y={hy} width={hs} height={hs} rx={2} fill="white" stroke="var(--accent)" strokeWidth={2} style={{ pointerEvents: "none", cursor: cornerCursor }} />
                            </g>
                          );
                        });
                      })()}
                      {["n", "s", "e", "w"].map((corner) => {
                        const HIT_EDGE = 24;
                        const edgeW = corner === "n" || corner === "s" ? b.width : HIT_EDGE;
                        const edgeH = corner === "e" || corner === "w" ? b.height : HIT_EDGE;
                        const edgeX = corner === "e" ? b.x + b.width - HIT_EDGE / 2 : corner === "w" ? b.x - HIT_EDGE / 2 : b.x;
                        const edgeY = corner === "s" ? b.y + b.height - HIT_EDGE / 2 : corner === "n" ? b.y - HIT_EDGE / 2 : b.y;
                        return <rect key={corner} x={edgeX} y={edgeY} width={edgeW} height={edgeH} fill="transparent" stroke="none" style={{ cursor: getEdgeCursor(corner, rot) }} onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />;
                      })}
                      {["n", "s", "e", "w"].map((corner) => {
                        const INSET = 10;
                        const innerW = corner === "n" || corner === "s" ? b.width : INSET;
                        const innerH = corner === "e" || corner === "w" ? b.height : INSET;
                        const innerX = corner === "n" || corner === "s" ? b.x : (corner === "e" ? b.x + b.width - INSET : b.x);
                        const innerY = corner === "e" || corner === "w" ? b.y : (corner === "s" ? b.y + b.height - INSET : b.y);
                        return <rect key={`i-${corner}`} x={innerX} y={innerY} width={innerW} height={innerH} fill="transparent" stroke="none" style={{ cursor: getEdgeCursor(corner, rot) }} onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />;
                      })}
                    </>
                  )}
                  {/* Rotation handle — INSIDE rotation group so it rotates with building */}
                  {isSel && !physicalGroupResizeEligible && !isLocked && rotatingId !== b.id && (
                    <g>
                      <line x1={cx} y1={b.y} x2={cx} y2={b.y - 32} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.5} />
                      <circle cx={cx} cy={b.y - 32} r={6} fill="var(--accent)" stroke="white" strokeWidth={2}
                        style={{ cursor: "grab" }}
                        onMouseDown={(e) => { e.stopPropagation(); onRotateStart?.(e, b); }}
                      />
                      <path d={`M${cx - 2.5} ${b.y - 34} Q${cx} ${b.y - 37} ${cx + 2.5} ${b.y - 34}`}
                        fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
                    </g>
                  )}
                  {/* Issue/warning badges — rendered AFTER the selection outline and
                      resize/rotation handles so the selection overlay never covers
                      them. This is an editor-overlay z-layer: it is NOT affected by
                      Bring Forward / Send Backward (which only stack buildings and
                      decor assets). */}
                  {isOverlapping && (
                    <g className="pointer-events-none select-none">
                      {/* OVERLAP badge — top-right INSIDE the building, rotates with it */}
                      <rect x={b.x + b.width - 34} y={b.y + 3} width={31} height={13} rx={3} fill="#dc2626" opacity={0.92} />
                      <text x={b.x + b.width - 18.5} y={b.y + 12} textAnchor="middle" fill="white" fontSize={7} fontWeight="900">OVERLAP</text>
                    </g>
                  )}
                  {isInvalid && !isOverlapping && (
                    <g className="pointer-events-none select-none">
                      {/* Subtle warning badge — outside top-right of building AABB, rotates with it */}
                      <circle cx={b.x + b.width - 2} cy={b.y - 2} r={6} fill="#fef3c7" stroke="#d97706" strokeWidth={1.2} opacity={0.95} />
                      <text x={b.x + b.width - 2} y={b.y + 1.5} textAnchor="middle" fill="#b45309" fontSize={8} fontWeight="900">⚠</text>
                    </g>
                  )}
                </g>

                {/* ══ Degree indicators — OUTSIDE rotation group so text stays axis-aligned & readable ══ */}
                {/* Static degree badge (non-rotating) */}
                {isSel && !isLocked && rotatingId !== b.id && rot !== 0 && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const visCx = rotAABB.x + rotAABB.width / 2;
                  const visTop = rotAABB.y;
                  return (
                    <g className="pointer-events-none select-none">
                      <rect x={visCx - 16} y={visTop - 14} width={32} height={14} rx={3} fill="var(--accent)" opacity={0.9} />
                      <text x={visCx} y={visTop - 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="800">{rot}°</text>
                    </g>
                  );
                })()}
                {/* Floating degree indicator during active rotation (axis-aligned, readable) */}
                {isSel && !isLocked && rotatingId === b.id && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const visCx = rotAABB.x + rotAABB.width / 2;
                  const visTop = rotAABB.y;
                  return (
                    <g className="pointer-events-none select-none">
                      <line x1={visCx} y1={visTop} x2={visCx} y2={visTop - 24} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
                      <rect x={visCx - 22} y={visTop - 40} width={44} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                      <text x={visCx} y={visTop - 27} textAnchor="middle" fill="white" fontSize={10} fontWeight="900">{rotatingAngle ?? rot}°</text>
                    </g>
                  );
                })()}
                {/* ══ Dimension indicator during resize (axis-aligned, readable) ══ */}
                {resizingId === b.id && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const visBot = rotAABB.y + rotAABB.height;
                  const visCx = rotAABB.x + rotAABB.width / 2;
                  return (
                    <g className="pointer-events-none select-none">
                      <rect x={visCx - 32} y={visBot + 6} width={64} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                      <text x={visCx} y={visBot + 18} textAnchor="middle" fill="white" fontSize={9} fontWeight="900">{b.width}×{b.height}</text>
                    </g>
                  );
                })()}
              </g>
            );
            }
            const da = entry.item as CampusDecorAsset;
            const template = DECOR_ASSET_MAP[da.type];
            if (!template) return null;
            const s = decorRenderScale(da.scale);
            const rot = da.rotation ?? 0;
            const isVisible = da.visible ?? true;
            const isLocked = da.locked ?? false;
            const isSel = selected?.type === "decorAsset" && selected.id === da.id;
            const isMultiSel = multiSelected.includes(da.id);
            const editorOpacity = isVisible ? (isSel ? 1 : 0.9) : (isSel || isMultiSel ? 0.35 : 0.28);

            // World-space half extents (asset center is at da.x, da.y)
            const { width: worldW, height: worldH } = decorWorldSize(template, da.scale);
            const outline = decorSelectionOutlineBox(template, da.scale);
            const hw = worldW / 2;
            const hh = worldH / 2;
            const rotRad = (rot * Math.PI) / 180;
            const cosR = Math.cos(rotRad);
            const sinR = Math.sin(rotRad);
            // Rotate a local offset (lx, ly) about the asset center → world coords
            const cornerPos = (lx: number, ly: number) => ({
              x: da.x + lx * cosR - ly * sinR,
              y: da.y + lx * sinR + ly * cosR,
            });
            // Axis-aligned AABB of the rotated asset (for axis-aligned badges)
            const aabb = getRotatedAABB(da.x - hw, da.y - hh, hw * 2, hh * 2, rot);
            const visCx = aabb.x + aabb.width / 2;
            const rotHandlePos = cornerPos(0, -(hh + 24));

            return (
              <g key={da.id}
                data-decor-type={da.type}
                data-hidden={isVisible ? undefined : "true"}
                opacity={editorOpacity}
                style={{ cursor: isLocked ? "default" : tool === "select" ? "move" : cursor }}
                onMouseDown={(e) => { if (!isLocked && (tool === "select" || tool === "erase")) onItemDown(e, "decorAsset", da.id, da.x, da.y); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "decorAsset", da.id); }}
              >
                {/* Body — transform group (rotates & scales with the asset) */}
                <rect
                  data-testid="decor-hitbox"
                  x={da.x - outline.width / 2}
                  y={da.y - outline.height / 2}
                  width={outline.width}
                  height={outline.height}
                  rx={outline.rx}
                  fill="transparent"
                  stroke="none"
                  transform={`rotate(${rot}, ${da.x}, ${da.y})`}
                />
                {(isMultiSel || isSel) && (
                  <rect
                    data-testid="decor-selection-outline"
                    x={da.x - outline.width / 2}
                    y={da.y - outline.height / 2}
                    width={outline.width}
                    height={outline.height}
                    rx={outline.rx}
                    fill="none"
                    stroke={isSel ? "var(--accent)" : "var(--primary)"}
                    strokeWidth={isSel ? 2 : 1}
                    strokeDasharray="3 4"
                    opacity={isSel ? 0.8 : 0.35}
                    transform={`rotate(${rot}, ${da.x}, ${da.y})`}
                  />
                )}
                <g transform={`translate(${da.x},${da.y}) rotate(${rot}) scale(${s})`}>
                  <g transform={`translate(-${template.defaultWidth / 2},-${template.defaultHeight / 2})`}>
                    <DecorAssetArt descriptor={template} />
                  </g>
                </g>

                {/* Selection handles — world space, rotation-aware cursors (not scaled with asset).
                    Only shown in select tool so an erase/other tool can click the asset directly. */}
                {!isVisible && (
                  <g className="pointer-events-none select-none" opacity={0.95}>
                    <rect x={aabb.x + 4} y={aabb.y + 4} width={18} height={14} rx={4} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
                    <path d={`M${aabb.x + 7} ${aabb.y + 11} Q${aabb.x + 13} ${aabb.y + 6} ${aabb.x + 19} ${aabb.y + 11} Q${aabb.x + 13} ${aabb.y + 16} ${aabb.x + 7} ${aabb.y + 11}Z`} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} />
                    <circle cx={aabb.x + 13} cy={aabb.y + 11} r={2} fill="var(--muted-foreground)" />
                    <line x1={aabb.x + 7} y1={aabb.y + 16} x2={aabb.x + 20} y2={aabb.y + 5} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
                  </g>
                )}
                {isSel && !physicalGroupResizeEligible && tool === "select" && (
                  <>
                    {/* Rotation handle — sits above the rotated asset */}
                    {decorRotatingId !== da.id && (
                      <g>
                        <line x1={da.x} y1={da.y} x2={rotHandlePos.x} y2={rotHandlePos.y} stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="3 2" opacity={0.5} />
                        <circle cx={rotHandlePos.x} cy={rotHandlePos.y} r={5} fill="var(--accent)" stroke="white" strokeWidth={1.6}
                          style={{ cursor: "grab" }}
                          onMouseDown={(e) => { e.stopPropagation(); onDecorRotateStart?.(e, da); }}
                        />
                        <path d={`M${rotHandlePos.x - 2} ${rotHandlePos.y - 1.5} Q${rotHandlePos.x} ${rotHandlePos.y - 4} ${rotHandlePos.x + 2} ${rotHandlePos.y - 1.5}`}
                          fill="none" stroke="white" strokeWidth={1.2} strokeLinecap="round" />
                      </g>
                    )}
                    {/* Corner resize handles — rotate with the asset via rotation-aware cursors */}
                    {["nw", "ne", "sw", "se"].map((corner) => {
                      const lx = corner.includes("e") ? hw : -hw;
                      const ly = corner.includes("s") ? hh : -hh;
                      const p = cornerPos(lx, ly);
                      const cornerCursor = getCornerCursor(corner, rot);
                      return (
                        <g key={corner}>
                          <rect data-testid="decor-resize-handle" data-asset-id={da.id} data-corner={corner} x={p.x - 10} y={p.y - 10} width={20} height={20} fill="transparent" stroke="none" style={{ cursor: cornerCursor, pointerEvents: "all" }} onMouseDown={(e) => { e.stopPropagation(); onDecorResizeStart?.(e, da, corner); }} />
                          <rect x={p.x - 5} y={p.y - 5} width={10} height={10} rx={2} fill="white" stroke="var(--accent)" strokeWidth={1.6} style={{ pointerEvents: "none", cursor: cornerCursor }} />
                        </g>
                      );
                    })}
                    {/* Static degree badge (axis-aligned, readable) */}
                    {rot !== 0 && decorRotatingId !== da.id && (
                      <g className="pointer-events-none select-none">
                        <rect x={visCx - 16} y={aabb.y - 14} width={32} height={14} rx={3} fill="var(--accent)" opacity={0.9} />
                        <text x={visCx} y={aabb.y - 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="800">{rot}°</text>
                      </g>
                    )}
                    {/* Floating degree indicator during active rotation */}
                    {decorRotatingId === da.id && (
                      <g className="pointer-events-none select-none">
                        <rect x={visCx - 22} y={aabb.y - 40} width={44} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                        <text x={visCx} y={aabb.y - 27} textAnchor="middle" fill="white" fontSize={10} fontWeight="900">{rotatingAngle ?? rot}°</text>
                      </g>
                    )}
                    {/* Scale indicator during resize */}
                    {decorResizingId === da.id && (
                      <g className="pointer-events-none select-none">
                        <rect x={visCx - 26} y={aabb.y + aabb.height + 6} width={52} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                        <text x={visCx} y={aabb.y + aabb.height + 18} textAnchor="middle" fill="white" fontSize={9} fontWeight="900">{Math.round((da.scale ?? 1) * 10) / 10}×</text>
                      </g>
                    )}
                  </>
                )}

                {/* Custom name label (B2 Phase 3) — shown under the asset when named.
                    During an active resize the scale badge occupies +6..+24 below the
                    asset, so the label drops lower to avoid overlapping it.
                    B5 Final: compact + truncated — long custom names never wrap or
                    sprawl across the canvas. */}
                {da.name && (
                  <text x={visCx} y={aabb.y + aabb.height + (decorResizingId === da.id ? 34 : 14)} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="var(--muted-foreground)" stroke="var(--card)" strokeWidth={2.5} paintOrder="stroke" className="pointer-events-none select-none">{da.name.length > 24 ? `${da.name.slice(0, 23)}…` : da.name}</text>
                )}
              </g>
            );
          })}

          {/* Building-attached Exterior Emergency Stairs sit in the outdoor
              overlay, outside the footprint, while their served-floor landing
              occurrences are rendered by FloorEditor. */}
          {buildings.flatMap((building) => canonicalExteriorEmergencyStairsForBuilding(building).map((stair) => {
            if (stair.visible === false || stair.state === "closed") return null;
            const preview = exteriorEmergencyStairPreview?.buildingId === building.id && exteriorEmergencyStairPreview.stairId === stair.id
              ? exteriorEmergencyStairPreview
              : null;
            const displayStair = preview
              ? { ...stair, attachment: { ...stair.attachment, edge: preview.edge, offset: preview.offset } }
              : stair;
            const pos = exteriorEmergencyStairWorldPosition(building, displayStair);
            const isSel = selected?.type === "building" && selected.id === building.id;
            const { width: visualWidth, height: visualHeight } = exteriorEmergencyStairVisualDimensions(displayStair);
            return (
              <g key={`exterior-emergency-stair-${stair.id}`} data-testid="exterior-emergency-stair" transform={`translate(${pos.x},${pos.y}) rotate(${pos.angle})`} onMouseDown={(e) => { e.stopPropagation(); onExteriorEmergencyStairDown?.(e, building.id, stair.id); }} style={{ cursor: tool === "select" ? (preview ? ((preview.edge === "top" || preview.edge === "bottom") ? "ew-resize" : "ns-resize") : "grab") : cursor }}>
                {/* Keep the wrapper as the authoritative Admin hit surface; the
                    shared visual is presentation-only and pointer-transparent. */}
                <rect x={-visualWidth / 2 - 13} y={-visualHeight / 2 - 5} width={visualWidth + 26} height={visualHeight + 10} rx={6} fill="transparent" pointerEvents="all" />
                <OutdoorEmergencyStairVisual building={building} stair={displayStair} selected={isSel} applyTransform={false} />
                {preview && !preview.valid && <rect data-testid="exterior-emergency-stair-blocked-preview" x={-visualWidth / 2 - 7} y={-visualHeight / 2 - 7} width={visualWidth + 14} height={visualHeight + 14} rx={6} fill="rgba(220,38,38,0.18)" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" pointerEvents="none" />}
                {(stair.servedFloorIds?.length ?? 0) > 1 && <g
                  data-testid="exterior-emergency-stair-quick-nav"
                  role="button"
                  tabIndex={0}
                  aria-label={`View connected Floors for ${stair.label}`}
                  className="cursor-pointer"
                  onMouseEnter={() => { cancelExteriorQuickNavClose(); setExteriorQuickNavKey(stair.id); }}
                  onMouseLeave={scheduleExteriorQuickNavClose}
                  onFocus={() => { cancelExteriorQuickNavClose(); setExteriorQuickNavKey(stair.id); }}
                  onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) scheduleExteriorQuickNavClose(); }}
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onClick={(event) => { event.stopPropagation(); setExteriorQuickNavKey(stair.id); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExteriorQuickNavKey(stair.id); }
                    if (event.key === "Escape") { event.preventDefault(); closeExteriorQuickNav(); }
                  }}
                ><circle cx={-visualWidth / 2 - 3} cy={-visualHeight / 2 + 4} r={4} fill="#475569" stroke="white" strokeWidth={1} /><path d="M-5 -1 H-1 M-5 1 H-1" stroke="white" strokeWidth={0.8} strokeLinecap="round" /></g>}
                <title>{stair.label} · Exterior Emergency Stair</title>
              </g>
            );
          }))}

          {/* Building entrances: functional editor overlay, not part of z-order. */}
          {buildings.flatMap((b) => {
            const entrances = b.entrances ?? [];
            const isParentVisible = b.visible ?? true;
            const isParentLocked = b.locked ?? false;
            return entrances.map((entrance) => {
              const pos = entranceWorldPosition(b, entrance);
              const entranceName = entranceDisplayName(entrance, entrances.findIndex((e) => e.id === entrance.id));
              const entranceTypeLabel = normalizeEntranceType(entrance.type) === "emergency_exit"
                ? "Emergency Exit"
                : normalizeEntranceType(entrance.type) === "service"
                  ? "Service Access"
                  : entrance.isPrimary ? "Primary Entrance" : "General Access";
              const entranceQuickInfo = `${entranceName} · ${entranceTypeLabel}`;
              const isSel = selected?.type === "entrance" && selected.id === entrance.id;
              const isNavTarget = navEntranceHover?.buildingId === b.id && navEntranceHover?.entranceId === entrance.id;
              const stroke = BUILDING_ENTRANCE_TYPE_COLORS[normalizeEntranceType(entrance.type)];
              const opacity = isParentVisible ? 1 : isSel ? 0.45 : 0.3;
              return (
                <g
                  key={entrance.id}
                  data-entrance-id={entrance.id}
                  data-building-id={b.id}
                  data-hidden={isParentVisible ? undefined : "true"}
                  transform={`translate(${pos.x},${pos.y}) rotate(${pos.angle})`}
                  opacity={opacity}
                  tabIndex={0}
                  aria-label={entranceQuickInfo}
                  style={{ cursor: isParentLocked ? "default" : showNavigationOverlay && tool === "select" ? "pointer" : tool === "select" ? "grab" : cursor }}
                  onMouseDown={(e) => onEntranceDown?.(e, b.id, entrance.id, pos.x, pos.y)}
                >
                  <title>{entranceQuickInfo}</title>
                  <circle cx={0} cy={0} r={12} fill="transparent" />
                  {/* Navigation routing-target highlight (Add Waypoint / Connect Path) —
                      B5 Phase 1.9: this is the SINGLE Connect Target indicator; the
                      linked nav-node renders nothing extra while it is active. */}
                  {isNavTarget && (
                    <circle data-testid="entrance-connect-target" cx={0} cy={0} r={17} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" opacity={0.95} className="pointer-events-none" />
                  )}
                  <path d="M-10,-7 L10,-7 L10,7 L-10,7 Z" fill="var(--card)" stroke={isNavTarget ? "#16a34a" : isSel ? "var(--accent)" : stroke} strokeWidth={isNavTarget ? 2.5 : isSel ? 2.5 : 1.8} />
                  <path d="M-4,7 L-4,-3 L4,-3 L4,7" fill={stroke} opacity={0.92} />
                  <path d="M0,13 L-5,6 H5 Z" fill={isNavTarget ? "#16a34a" : isSel ? "var(--accent)" : stroke} />
                  {entrance.isPrimary && <circle cx={8} cy={-8} r={3} fill="#f59e0b" stroke="white" strokeWidth={1} />}
                  {entrance.accessible && <circle cx={-8} cy={-8} r={3} fill="#2563eb" stroke="white" strokeWidth={1} />}
                  {isSel && !isNavTarget && <circle cx={0} cy={0} r={15} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" />}
                </g>
              );
            });
          })}

          {/* Markers */}
          {markers.map((m) => {
            const style = MARKER_STYLES[m.type] ?? MARKER_STYLES.custom;
            const color = m.color || style.color;
            const isGate = isCampusGate(m);
            const isSel = (selected?.type === "marker" || selected?.type === "gate") && selected.id === m.id;
            const isPickHover = isGate && testRoutePickHover?.type === "gate" && testRoutePickHover.id === m.id;
            const isPickTarget = isGate && !!testRoutePickKind;
            const gateSize = isGate ? campusGateSize(m) : null;
            return (
              <g key={m.id} data-testid={isGate ? "campus-gate" : undefined} pointerEvents={isGate ? "all" : undefined} onMouseDown={(e) => onItemDown(e, isGate ? "gate" : "marker", m.id, m.x, m.y)} onMouseEnter={() => { if (isPickTarget) onTestRoutePickHover?.({ type: "gate", id: m.id }); }} onMouseLeave={() => { if (testRoutePickHover?.type === "gate" && testRoutePickHover.id === m.id) onTestRoutePickHover?.(null); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "marker", m.id); }} style={{ cursor: testRoutePickKind ? "pointer" : tool === "select" ? "move" : cursor }}>
                {(isSel || isPickTarget || isPickHover) && <rect x={m.x - (gateSize?.width ?? 22) / 2 - (isPickHover ? 8 : 5)} y={m.y - (gateSize?.height ?? 22) / 2 - (isPickHover ? 8 : 5)} width={(gateSize?.width ?? 22) + (isPickHover ? 16 : 10)} height={(gateSize?.height ?? 22) + (isPickHover ? 16 : 10)} rx={5} fill={isPickTarget && !isSel ? "rgba(22,163,74,0.08)" : "none"} stroke={isPickTarget && !isSel ? "#16a34a" : "var(--accent)"} strokeWidth={isPickHover ? 2.6 : 2} strokeDasharray={isPickTarget && !isSel ? "5 3" : undefined} opacity={isPickTarget && !isSel ? (isPickHover ? 1 : 0.75) : 0.6} pointerEvents="none" />}
                {isGate ? (
                  <g transform={`translate(${m.x} ${m.y})`} className="pointer-events-auto">
                    <rect x={-(gateSize?.width ?? 44) / 2} y={-(gateSize?.height ?? 34) / 2} width={gateSize?.width ?? 44} height={gateSize?.height ?? 34} fill="transparent" />
                    <CampusGateVisual x={-(gateSize?.width ?? 44) / 2} y={-(gateSize?.height ?? 34) / 2} width={gateSize?.width ?? 44} height={gateSize?.height ?? 34} color={isSel ? "var(--accent)" : color} />
                    <circle cx={-(gateSize?.width ?? 44) / 2 + 4} cy={-(gateSize?.height ?? 34) / 2 + 4} r={4} fill={m.purpose === "emergency_exit" ? "#dc2626" : "#2563eb"} stroke="white" strokeWidth={1} />
                    {isSel && !physicalGroupResizeEligible && tool === "select" && !markerResizingId && (
                      <g className="pointer-events-auto">
                        {(["nw", "ne", "sw", "se"] as const).map((corner) => {
                          const hx = corner.includes("e") ? (gateSize?.width ?? 44) / 2 : -(gateSize?.width ?? 44) / 2;
                          const hy = corner.includes("s") ? (gateSize?.height ?? 34) / 2 : -(gateSize?.height ?? 34) / 2;
                          return <rect key={corner} data-testid={`campus-gate-resize-handle-${corner}`} x={hx - 4} y={hy - 4} width={8} height={8} rx={2} fill="var(--card)" stroke="var(--accent)" strokeWidth={1.5} style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }} onMouseDown={(event) => { event.stopPropagation(); onMarkerResizeStart?.(event, m, corner); }} />;
                        })}
                      </g>
                    )}
                  </g>
                ) : (
                  <>
                    <ellipse cx={m.x} cy={m.y + 1} rx={10} ry={5} fill="rgba(0,0,0,0.18)" />
                    <circle cx={m.x} cy={m.y} r={13} fill={color} stroke={isSel ? "var(--accent)" : "white"} strokeWidth={isSel ? 2.5 : 2} />
                    <text x={m.x} y={m.y + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight="900" className="pointer-events-none select-none">{style.symbol}</text>
                  </>
                )}
                {zoom > 0.6 && (
                  <text x={m.x} y={m.y + 25} textAnchor="middle" fill={color} fontSize={9} fontWeight="700" stroke="rgba(240,238,234,0.95)" strokeWidth={3} paintOrder="stroke" className="pointer-events-none select-none">{m.name}</text>
                )}
              </g>
            );
          })}

          {/* ═══ NAVIGATION GRAPH (navigation layer or read-only Campus overlay) ═══ */}
          {shouldRenderNavGraph && (
            <g
              data-testid="nav-graph-layer"
              data-overlay={navGraphInteractive ? undefined : "true"}
              className={navGraphInteractive ? undefined : "pointer-events-none"}
            >
              {/* Edges — the walking-network connections between nodes */}
              {renderNavEdges.map((e) => {
                const a = renderNavNodes.find((n) => n.id === e.startNodeId);
                const b = renderNavNodes.find((n) => n.id === e.endNodeId);
                if (!a || !b) return null;
                const isSel = selected?.type === "navEdge" && selected.id === e.id;
                const isMultiSel = multiSelected.includes(e.id);
                const pathwayGenerated = isPathwayGeneratedEdge(e);
                const entranceManaged = e.type !== "entrance_transition" && Boolean(
                  (a.entranceId && !a.floorId) || (b.entranceId && !b.floorId),
                );
                const selectedPhysicalPathOwnsEdge = Boolean(
                  pathwayGenerated
                  && e.generatedFromPathIds?.some((pathId) => selectedPhysicalPathIds.has(pathId)),
                );
                const oneWay = e.bidirectional === false;
                const isClosed = e.closed === true;
                const edgePoints = [{ x: a.x, y: a.y }, ...(pathwayGenerated ? [] : (e.bendPoints ?? [])), { x: b.x, y: b.y }];
                const edgePts = edgePoints.map((pt) => `${pt.x},${pt.y}`).join(" ");
                const middleSegmentIndex = Math.max(0, Math.floor((edgePoints.length - 1) / 2));
                const middleA = edgePoints[middleSegmentIndex];
                const middleB = edgePoints[middleSegmentIndex + 1] ?? middleA;
                const midX = (middleA.x + middleB.x) / 2;
                const midY = (middleA.y + middleB.y) / 2;
                // B5 Final: one-way arrow follows the POLYLINE segment that
                // contains the midpoint (not the straight A→B diagonal), so bent
                // routes show the actual travel direction at the arrow.
                const angle = Math.atan2(middleB.y - middleA.y, middleB.x - middleA.x) * (180 / Math.PI);
                // B5 Phase 6.10: blocked edges render red (obstacle intersection)
                const isBlocked = navBlockedEdgeIds?.has(e.id) ?? false;
                const edgeColor = isBlocked ? "#dc2626" : (isSel || isMultiSel ? "var(--accent)" : e.color || "#16a34a");
                const connectPathTarget = navGraphInteractive
                  && !pathwayGenerated
                  && navConnectStartId
                  && navPathTargetHover?.edgeId === e.id
                  && navPathTargetHover.segmentIndex >= 0
                  && navPathTargetHover.segmentIndex < edgePoints.length - 1
                  ? navPathTargetHover
                  : null;
                return (
                  <g key={e.id} data-testid="nav-edge" data-edge-id={e.id} data-pathway-generated={pathwayGenerated ? "true" : undefined} data-entrance-managed={entranceManaged ? "true" : undefined} className="group/nav-edge"
                    onMouseDown={(ev) => {
                      if (!navGraphInteractive) return;
                      // B5 Phase 6.7/6.8: Waypoint AND Connect tools must not be
                      // intercepted by edge selection — the edge hit polyline passes
                      // through waypoints that sit ON an edge (inserted waypoints),
                      // so stopPropagation here would swallow the node click before
                      // handleSvgDown's node-target priority ever runs. Fall through
                      // for both marker and path (Connect) tools.
                      if (tool === "marker" || tool === "connect" || tool === "path") return;
                      ev.stopPropagation();
                      onNavEdgeSelect?.(ev, e.id);
                    }}
                    style={{
                      cursor: navGraphInteractive ? (tool === "select" ? "pointer" : tool === "marker" ? "crosshair" : "crosshair") : "default",
                      // A selected physical Pathway owns its generated edge
                      // for ordinary selection/editing, but Connect still
                      // needs to receive the edge hit so an admin can target
                      // that existing network without falling through to an
                      // empty-canvas bend.
                      pointerEvents: selectedPhysicalPathOwnsEdge && tool === "select" ? "none" : undefined,
                    }}
                  >
                    {/* Invisible generous hit target so thin edges are clickable */}
                    <polyline points={edgePts} fill="none" stroke="transparent" strokeWidth={pathwayGenerated ? 6 : 14} strokeLinecap="round" strokeLinejoin="round" />
                    {/* Hover halo — reveals the edge is interactive without color noise */}
                    <polyline points={edgePts} fill="none"
                      stroke="var(--accent)"
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0}
                      className="pointer-events-none transition-opacity duration-150 group-hover/nav-edge:opacity-20"
                    />
                    {connectPathTarget && (() => {
                      const p = edgePoints[connectPathTarget.segmentIndex];
                      const q = edgePoints[connectPathTarget.segmentIndex + 1];
                      return (
                        <g className="pointer-events-none" data-testid="nav-connect-path-target">
                          <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                            stroke="#f59e0b" strokeWidth={5} opacity={0.82}
                            strokeDasharray="7 3" strokeLinecap="round" />
                          <circle cx={connectPathTarget.point.x} cy={connectPathTarget.point.y} r={6}
                            fill="rgba(245,158,11,0.16)" stroke="#f59e0b"
                            strokeWidth={1.7} strokeDasharray="2 2" />
                          <circle cx={connectPathTarget.point.x} cy={connectPathTarget.point.y} r={2} fill="#f59e0b" />
                          <text x={connectPathTarget.point.x + 9} y={connectPathTarget.point.y - 9}
                            fill="#b45309" fontSize={7} fontWeight={700}
                            stroke="rgba(255,255,255,0.92)" strokeWidth={1.8}
                            paintOrder="stroke" data-testid="nav-connect-path-hint">
                            Click to connect to path
                          </text>
                        </g>
                      );
                    })()}
                    <polyline points={edgePts} fill="none"
                      stroke={edgeColor}
                      strokeWidth={isSel || isMultiSel ? 4 : e.width ?? 3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity={isClosed ? 0.35 : e.accessible === false ? 0.35 : e.emergencySafe === false ? 0.6 : 0.85}
                      strokeDasharray={isClosed ? "6 4" : e.accessible === false ? "4 3" : undefined}
                      className="pointer-events-none"
                    />
                    {(isSel || isMultiSel) && <circle cx={midX} cy={midY} r={4} fill="var(--accent)" className="pointer-events-none" />}
                    {/* B5 Phase 6.10: blocked-edge warning marker on selected edges */}
                    {isSel && isBlocked && (
                      <g transform={`translate(${midX + 10} ${midY - 10})`} data-testid="nav-edge-blocked-marker" className="pointer-events-none">
                        <path d="M 0 -4.5 L 4 3.5 L -4 3.5 Z" fill="#dc2626" />
                        <line x1={0} y1={-1.6} x2={0} y2={1.4} stroke="#fff" strokeWidth={1.1} />
                        <circle cx={0} cy={2.8} r={0.7} fill="#fff" />
                      </g>
                    )}
                    {/* One-way direction arrow at midpoint — oriented along the
                        POLYLINE segment containing the midpoint (B5 Final), so
                        bent routes show the actual travel direction. */}
                    {oneWay && (
                      <g className="pointer-events-none">
                        <polygon
                          data-testid="nav-edge-direction"
                          points={`${midX + 6 * Math.cos((angle * Math.PI) / 180)},${midY + 6 * Math.sin((angle * Math.PI) / 180)} ${midX - 5 * Math.cos((angle * Math.PI) / 180) + 4 * Math.cos(((angle + 90) * Math.PI) / 180)},${midY - 5 * Math.sin((angle * Math.PI) / 180) + 4 * Math.sin(((angle + 90) * Math.PI) / 180)} ${midX - 5 * Math.cos((angle * Math.PI) / 180) - 4 * Math.cos(((angle + 90) * Math.PI) / 180)},${midY - 5 * Math.sin((angle * Math.PI) / 180) - 4 * Math.sin(((angle + 90) * Math.PI) / 180)}`}
                          fill={edgeColor}
                          opacity={0.85}
                        />
                      </g>
                    )}
                    {navGraphInteractive && !pathwayGenerated && isSel && tool === "select" && edgePoints.slice(0, -1).map((point, index) => {
                      const next = edgePoints[index + 1];
                      const addPoint = { x: Math.round((point.x + next.x) / 2), y: Math.round((point.y + next.y) / 2) };
                      return (
                        <circle
                          key={`${e.id}-add-${index}`}
                          cx={addPoint.x}
                          cy={addPoint.y}
                          r={4}
                          fill="var(--card)"
                          stroke="var(--accent)"
                          strokeWidth={1.5}
                          opacity={0.86}
                          onMouseDown={(ev) => { ev.stopPropagation(); onNavEdgeAddBend?.(e.id, index, addPoint); }}
                        />
                      );
                    })}
                    {navGraphInteractive && !pathwayGenerated && isSel && tool === "select" && (e.bendPoints ?? []).map((point, index) => (
                      <circle
                        key={`${e.id}-bend-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={6}
                        fill="var(--accent)"
                        stroke="white"
                        strokeWidth={2}
                        onMouseDown={(ev) => { ev.stopPropagation(); onNavEdgeBendDown?.(ev, e.id, index); }}
                      />
                    ))}
                    {/* Closed indicator — small block mark so Closed reads as unavailable, not broken */}
                    {isClosed && (
                      <g transform={`translate(${midX},${midY})`} data-testid="nav-edge-closed-marker" className="pointer-events-none">
                        <circle r={5} fill="var(--card)" stroke="#b45309" strokeWidth={1.5} />
                        <path d="M-2,-2 L2,2 M2,-2 L-2,2" stroke="#b45309" strokeWidth={1.5} strokeLinecap="round" />
                      </g>
                    )}
                    {/* Direction indicator — only for one-way edges */}
                    {oneWay && !isClosed && (
                      <g transform={`translate(${midX},${midY}) rotate(${angle})`} className="pointer-events-none">
                        <polygon points="10,0 -4,-5 -4,5" fill={edgeColor} stroke="rgba(255,255,255,0.9)" strokeWidth={1} />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Nodes — compact graph waypoints (not map pins) with selected /
                  start / destination rings and subtle accessible + emergency
                  indicators only when relevant */}
              {renderNavNodes.map((n) => {
                const isSel = selected?.type === "navNode" && selected.id === n.id;
                const isMultiSel = multiSelected.includes(n.id);
                const isStart = navConnectStartId === n.id;
                const isDestHover = !!navConnectStartId && navConnectStartId !== n.id && !!navPreview && navPreview.x === n.x && navPreview.y === n.y;
                const dimmed = n.accessible === false;
                // B5 Phase 1.7: modest semantic type indicators — readable at a
                // glance without making the graph noisy. Ordinary outdoor nodes
                // stay neutral; special roles get a small glyph + ring.
                const isEmergency = n.type === "emergency_exit";
                const gateManaged = Boolean(n.gateId);
                const isGatePickTarget = gateManaged && !!testRoutePickKind;
                const isGatePickHover = gateManaged && testRoutePickHover?.type === "gate" && testRoutePickHover.id === n.gateId;
                const isAssembly = n.type === "assembly";
                const isSafeArea = n.type === "safe_area";
                const isEntrance = n.type === "entrance";
                const isDestination = n.type === "room_access";
                const pathwayGenerated = isPathwayGeneratedNode(n);
                const isPathJunction = n.pathJunction === true;
                // A ground Exterior Emergency Stair discharge is a generated
                // Building-owned anchor: it remains a visible Connect target,
                // but is not an independently authored Walking Point.
                const generatedExteriorStair = Boolean(n.exteriorEmergencyStairId && !n.floorId);
                const activeRouteNodeIds = highlightedRoute?.routeNodeIds;
                const isRouteNode = !!activeRouteNodeIds?.includes(n.id);
                const deEmphasizeForRoute = !!activeRouteNodeIds?.length && !isRouteNode && !isSel && !isMultiSel && tool === "select";
                const nodeName = (n.name ?? "").trim();
                const anonymousNode = !nodeName || /^(?:generated\s+)?(?:walking point|waypoint|path junction)(?:\s+\d+)?$/i.test(nodeName);
                const nodeRadius = gateManaged
                  ? (isSel || isMultiSel || navConnectStartId ? 6.5 : 5.5)
                  : generatedExteriorStair
                  ? (isSel || isMultiSel || navConnectStartId ? 9 : 8)
                  : isPathJunction
                  ? (isSel || isMultiSel || navConnectStartId ? 7.5 : 5.5)
                  : pathwayGenerated && !isSel && !isMultiSel ? 5.5 : 7.5;
                const selectedPhysicalPathOwnsNode = Boolean(
                  pathwayGenerated
                  && n.generatedFromPathVertices?.some((ref) => selectedPhysicalPathIds.has(ref.pathId)),
                );
                // B5 Phase 1.8: an entrance-linked node is DERIVED geometry of
                // the physical door — the door symbol is the primary visual, so
                // the node renders ONLY a small subtle connected badge + one
                // clean hover/selected ring (never a stacked waypoint target).
                const isEntranceLinked = !!n.entranceId;
                // B5 Phase 1.9: Connect Target is the single visual-state winner
                // for entrance-linked nodes — the physical entrance overlay's
                // dashed target ring is the ONLY indicator while it is active.
                const isConnectTarget = isEntranceLinked && !!navEntranceHover
                  && navEntranceHover.buildingId === n.buildingId
                  && navEntranceHover.entranceId === n.entranceId;
                // Display name follows the linked entrance (never a generic
                // "Waypoint" stacked on the physical entrance name).
                const entranceDisplay = (() => {
                  if (!isEntranceLinked) return undefined;
                  const parent = buildings.find((b) => b.id === n.buildingId);
                  const entrance = parent?.entrances?.find((en) => en.id === n.entranceId);
                  if (!parent || !entrance) return undefined;
                  return entranceDisplayName(entrance, (parent.entrances ?? []).findIndex((en) => en.id === entrance.id));
                })();
                return (
                  <g key={n.id} data-testid="nav-node" data-node-id={n.id} data-path-junction={isPathJunction ? "true" : undefined} data-entrance-linked={isEntranceLinked ? "true" : undefined} className="group/nav-node"
                    onMouseDown={(e) => { if (navGraphInteractive) onItemDown(e, "navNode", n.id, n.x, n.y); }}
                    onMouseEnter={() => { if (isGatePickTarget && n.gateId) onTestRoutePickHover?.({ type: "gate", id: n.gateId }); }}
                    onMouseLeave={() => { if (testRoutePickHover?.type === "gate" && testRoutePickHover.id === n.gateId) onTestRoutePickHover?.(null); }}
                    onContextMenu={(e) => {
                      if (!navGraphInteractive) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (!pathwayGenerated && !generatedExteriorStair && !gateManaged) onItemContextMenu?.(e, "navNode", n.id);
                    }}
                    style={{
                      cursor: navGraphInteractive ? ((pathwayGenerated || generatedExteriorStair || gateManaged) ? "pointer" : tool === "select" ? "move" : cursor) : "default",
                      // A Building Entrance is the single admin-visible
                      // representation of its canonical graph anchor. In
                      // normal Select, let the physical Entrance hit target
                      // receive the click; Connect/marker modes still need
                      // the internal node as a routing target.
                      // Keep generated Pathway vertices available as real
                      // Connect targets.  They are hidden only while the
                      // physical Pathway is selected in ordinary Select mode;
                      // disabling them during Connect made target clicks fall
                      // through and pin stray waypoints on the canvas.
                      pointerEvents: (selectedPhysicalPathOwnsNode && tool === "select") || (isEntranceLinked && tool === "select") ? "none" : undefined,
                      ...(deEmphasizeForRoute ? { opacity: 0.24 } : pathwayGenerated && !isSel && !isMultiSel ? { opacity: 0.9 } : {}),
                    }}
                  >
                    <title>{generatedExteriorStair ? "Generated Stair Exit (Connect target)" : gateManaged ? "Campus Gate navigation anchor (Connect target)" : nodeName || "Walking Point"}</title>
                    {/* B5 Phase 6.8: invisible hit area matching NAV_NODE_HIT_THRESHOLD
                        (12) so Connect/Waypoint destination clicks are reliable —
                        the live preview snaps within the same radius, so the click
                        must resolve the node there too (never pin a stray bend or
                        fall through to an edge/empty-canvas handler). A rect keeps
                        the node's circle count/visual assertions stable. */}
                    <rect x={n.x - 12} y={n.y - 12} width={24} height={24} fill="transparent" />
                    {!isEntranceLinked && (
                      <>
                        {/* Hover ring — reveals interactivity without dominating the graph */}
                        <circle cx={n.x} cy={n.y} r={11} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0}
                          className="pointer-events-none transition-opacity duration-150 group-hover/nav-node:opacity-60" />
                        {(isSel || isMultiSel) && <circle cx={n.x} cy={n.y} r={11} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.7} className="pointer-events-none" />}
                        {isStart && <circle cx={n.x} cy={n.y} r={13} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" opacity={0.9} className="pointer-events-none" />}
                        {isDestHover && <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" opacity={0.95} className="pointer-events-none" />}
                        {isEmergency && <circle cx={n.x} cy={n.y} r={9} fill="none" stroke="#dc2626" strokeWidth={1.5} opacity={0.85} className="pointer-events-none" />}
                        {isAssembly && <circle cx={n.x} cy={n.y} r={9} fill="none" stroke="#d97706" strokeWidth={1.5} strokeDasharray="2 2" opacity={0.85} className="pointer-events-none" />}
                        {isSafeArea && <circle cx={n.x} cy={n.y} r={10} fill="none" stroke="#0d9488" strokeWidth={1.5} opacity={0.85} className="pointer-events-none" />}
                        {isEntrance && <circle cx={n.x} cy={n.y} r={10} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.9} className="pointer-events-none" />}
                        {isDestination && <circle cx={n.x} cy={n.y} r={9} fill="none" stroke="#7c3aed" strokeWidth={1.5} opacity={0.8} className="pointer-events-none" />}
                      </>
                    )}
                    {isEntranceLinked ? (
                      // ── B5 Phase 1.9: ONE navigation-state decoration at a time ──
                      // Strict priority: Connect Target > Start/Dest > Selected >
                      // Connected (badge). The physical door symbol stays the
                      // primary visual; no stacked/concentric rings ever coexist.
                      isConnectTarget ? null : isStart ? (
                        <circle cx={n.x} cy={n.y} r={13} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" opacity={0.9} className="pointer-events-none" />
                      ) : isDestHover ? (
                        <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" opacity={0.95} className="pointer-events-none" />
                      ) : (isSel || isMultiSel) ? (
                        // ONE clean selection ring, sized to the entrance icon.
                        <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="var(--accent)" strokeWidth={1.6} opacity={0.9} className="pointer-events-none" />
                      ) : (
                        // Connected/normal: the physical Entrance marker is
                        // the only visible representation. Keep the canonical
                        // node in the graph without stacking a waypoint badge.
                        null
                      )
                    ) : generatedExteriorStair ? (
                      <>
                        <circle cx={n.x} cy={n.y} r={nodeRadius + 5} fill="rgba(220,38,38,0.12)"
                          stroke={navConnectStartId ? "#f59e0b" : "#dc2626"} strokeWidth={navConnectStartId ? 2.2 : 1.8}
                          strokeDasharray={navConnectStartId ? "4 2" : undefined} className="pointer-events-none" />
                        <circle cx={n.x} cy={n.y} r={nodeRadius} fill="#dc2626"
                          stroke={isSel || isMultiSel ? "var(--accent)" : "white"} strokeWidth={isSel || isMultiSel ? 2.5 : 2} />
                        <path d={`M${n.x - 4},${n.y + 3} L${n.x - 4},${n.y - 2} L${n.x},${n.y - 4} L${n.x + 4},${n.y - 2} L${n.x + 4},${n.y + 3} Z`}
                          fill="white" className="pointer-events-none" />
                      </>
                    ) : gateManaged ? (
                      <>
                        <circle cx={n.x} cy={n.y} r={isGatePickHover ? nodeRadius + 6 : nodeRadius + 3.5} fill={isGatePickTarget ? "rgba(22,163,74,0.10)" : "rgba(37,99,235,0.10)"}
                          stroke={isGatePickTarget ? "#16a34a" : navConnectStartId ? "#f59e0b" : (isEmergency ? "#dc2626" : "#2563eb")} strokeWidth={isGatePickHover ? 2.6 : navConnectStartId ? 2.2 : 1.8}
                          strokeDasharray={isGatePickTarget || navConnectStartId ? "4 2" : undefined} className="pointer-events-none" />
                        <circle cx={n.x} cy={n.y} r={nodeRadius} fill={isEmergency ? "#dc2626" : "#2563eb"}
                          stroke={isSel || isMultiSel ? "var(--accent)" : "white"} strokeWidth={isSel || isMultiSel ? 2.5 : 2} />
                        <path d={`M${n.x - 4},${n.y - 4} V${n.y + 4} M${n.x - 1},${n.y - 4} V${n.y + 4} M${n.x + 2},${n.y - 4} V${n.y + 4} M${n.x + 5},${n.y - 4} V${n.y + 4}`} stroke="white" strokeWidth={1.2} strokeLinecap="round" className="pointer-events-none" />
                      </>
                    ) : (
                      <circle cx={n.x} cy={n.y} r={nodeRadius} fill={n.color || "#16a34a"} stroke={isSel || isMultiSel ? "var(--accent)" : "white"} strokeWidth={2}
                        opacity={dimmed ? 0.55 : 1} strokeDasharray={dimmed ? "3 2" : undefined} />
                    )}
                    {/* Compact type glyphs — one small path each, pointer-events none */}
                    {!isEntranceLinked && isEmergency && <path d={`M${n.x - 3.5},${n.y + 3} L${n.x - 3.5},${n.y - 2} L${n.x},${n.y - 3.5} L${n.x + 3.5},${n.y - 2} L${n.x + 3.5},${n.y + 3} Z`} fill="#dc2626" className="pointer-events-none" />}
                    {!isEntranceLinked && isAssembly && <g className="pointer-events-none"><circle cx={n.x} cy={n.y - 1} r={2.2} fill="#d97706" /><path d={`M${n.x - 3},${n.y + 3.2} L${n.x + 3},${n.y + 3.2}`} stroke="#d97706" strokeWidth={1.4} strokeLinecap="round" /></g>}
                    {!isEntranceLinked && isSafeArea && <path d={`M${n.x},${n.y - 3.2} L${n.x + 2.6},${n.y - 1.6} L${n.x + 2.6},${n.y + 0.6} L${n.x},${n.y + 2.8} L${n.x - 2.6},${n.y + 0.6} L${n.x - 2.6},${n.y - 1.6} Z`} fill="#0d9488" className="pointer-events-none" />}
                    {!isEntranceLinked && isEntrance && <rect x={n.x - 2.4} y={n.y - 3.4} width={4.8} height={6.8} rx={0.8} fill="#2563eb" className="pointer-events-none" />}
                    {!isEntranceLinked && isDestination && <g className="pointer-events-none"><circle cx={n.x} cy={n.y} r={1.6} fill="#7c3aed" /><circle cx={n.x} cy={n.y} r={3.6} fill="none" stroke="#7c3aed" strokeWidth={1.1} /></g>}
                    {zoom > 0.6 && !isEntranceLinked && !generatedExteriorStair && !gateManaged && !anonymousNode && (() => {
                      const nodeLabel = nodeName;
                      const displayLabel = nodeLabel.length > 22 ? `${nodeLabel.slice(0, 21)}…` : nodeLabel;
                      return (
                        <g className="pointer-events-none select-none">
                          <text x={n.x} y={n.y + 22} textAnchor="middle" fill="#1f2937" fontSize={9} fontWeight={700}
                            stroke="rgba(255,255,255,0.92)" strokeWidth={2.6} paintOrder="stroke" strokeLinejoin="round">
                            {displayLabel}
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}

              {/* Connect Path preview — a temporary dashed line from the start
                  waypoint to the current node, Entrance, Pathway, or cursor. */}
              {navGraphInteractive && navPreview && (() => {
                const start = renderNavNodes.find((n) => n.id === navConnectStartId);
                // B5 Phase 6.9 (Floor parity): render the FULL proposed pin shape
                // computed by CampusEditor (navPreviewPins) — the same geometry a
                // click pins/commits, so preview == commit (no separate Outdoor
                // preview algorithm, no L-shape-then-different-commit).
                const proposed = navPreviewPins ?? [];
                let previewPoints: { x: number; y: number }[];
                 if (start) {
                   // CampusEditor supplies the complete canonical candidate
                   // bends for the current target. Render that one list as-is
                   // so the dashed preview is byte-for-byte the geometry that
                   // the commit path persists (draft bends are already folded
                   // into `proposed`).
                     if (proposed.length > 0) {
                       const candidateBends = [...proposed];
                       const lastBend = candidateBends[candidateBends.length - 1];
                       if (!lastBend || lastBend.x !== navPreview.x || lastBend.y !== navPreview.y) {
                         candidateBends.push(navPreview);
                       }
                       previewPoints = [{ x: start.x, y: start.y }, ...candidateBends];
                     } else {
                      const fallbackBends = [...navConnectBends];
                      const lastBend = fallbackBends[fallbackBends.length - 1];
                      // After an empty click, navPreview is the latest pinned
                      // bend until the next pointer move. Do not append that
                      // same coordinate twice; the preview must remain the
                      // exact source→bend chain the user committed.
                      if (!lastBend || lastBend.x !== navPreview.x || lastBend.y !== navPreview.y) {
                        fallbackBends.push(navPreview);
                      }
                      previewPoints = [{ x: start.x, y: start.y }, ...fallbackBends];
                    }
                } else {
                  previewPoints = [navPreview];
                }
                 // navPreview is always the canonical target endpoint.  The
                 // last bend is not necessarily the target, especially when a
                 // multi-bend candidate is being previewed.
                 const ringPos = navPreview;
                // B5 Phase 1.9: hovering a connect-target entrance must NOT stack
                // the ghost waypoint node on top of the entrance's single target
                // ring — keep only the dashed edge preview line.
                const overEntranceTarget = Boolean(navEntranceHover
                  && !(start?.entranceId && !start.floorId
                    && start.buildingId === navEntranceHover.buildingId
                    && start.entranceId === navEntranceHover.entranceId));
                // Existing Walking Points already render their own destination
                // highlight. Do not draw a second ghost dot on the same node;
                // the dashed preview still terminates there.
                const overNodeTarget = Boolean(
                  start
                  && ringPos
                  && renderNavNodes.some((node) => node.id !== start.id && node.x === ringPos.x && node.y === ringPos.y),
                );
                return (
                  <g data-testid="nav-path-preview" className="pointer-events-none">
                    {start && (
                      <>
                        <polyline points={previewPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                          fill="none" stroke={connectBlocked ? "#dc2626" : "#16a34a"} strokeWidth={2.5} strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
                        {navConnectBends.map((bend, index) => (
                          /* Match Floor Editor's draft affordance: a small
                             neutral geometry handle, deliberately distinct
                             from a persisted green Walking Point. */
                          <rect key={`nav-preview-bend-${index}`} data-testid="nav-connect-pin"
                            x={bend.x - 2} y={bend.y - 2} width={4} height={4} rx={0.8}
                            fill="none" stroke={connectBlocked ? "#dc2626" : "var(--muted-foreground)"}
                            strokeWidth={1.1} opacity={0.9} />
                        ))}
                      </>
                    )}
                    {!overEntranceTarget && !overNodeTarget && ringPos && (
                      <>
                        <circle cx={ringPos.x} cy={ringPos.y} r={9} fill="none" stroke={connectBlocked ? "#dc2626" : "#16a34a"} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.9} />
                        <circle cx={ringPos.x} cy={ringPos.y} r={3.5} fill={connectBlocked ? "#dc2626" : "#16a34a"} opacity={0.95} />
                      </>
                    )}
                    {connectBlocked && ringPos && (
                      <text x={ringPos.x} y={ringPos.y - 16} textAnchor="middle" fontSize={10} fontWeight={600} fill="#dc2626" opacity={0.95}
                        style={{ fontFamily: "var(--font-sans)" }}>
                        Connection blocked by building
                      </text>
                    )}
                  </g>
                );
              })()}
            </g>
          )}

          {/* B5 Phase 6.1: edge snap preview for waypoint-on-edge insertion */}
          {edgeSnapPreview && (
            <g className="pointer-events-none">
              <circle cx={edgeSnapPreview.nearest.x} cy={edgeSnapPreview.nearest.y} r={8}
                fill="none" stroke="#7c3aed" strokeWidth={2} strokeDasharray="4 3" opacity={0.9} />
              <circle cx={edgeSnapPreview.nearest.x} cy={edgeSnapPreview.nearest.y} r={3}
                fill="#7c3aed" opacity={0.95} />
              <text x={edgeSnapPreview.nearest.x} y={edgeSnapPreview.nearest.y - 14}
                textAnchor="middle" fontSize={10} fontWeight={600} fill="#7c3aed" opacity={0.95}
                style={{ fontFamily: "var(--font-sans)" }}
                data-testid={edgeSnapPreview.helper ? "entrance-edge-helper" : "edge-snap-helper"}>
                {edgeSnapPreview.helper ?? "Add connection point"}
              </text>
            </g>
          )}

          {/* ── B7 Phase 1: validation issue markers — one small badge per
              affected campus object, drawn in the SAME world→SVG transform as
              the objects. Warnings stay amber, errors stay red; the layer is
              pointer-events-none so it never intercepts canvas interactions. ── */}
          {issueMarkers.length > 0 && (
            <g className="pointer-events-none" data-testid="campus-issue-marker-layer">
              {issueMarkers.map((m) => {
                const bg = m.severity === "error" ? "#fef2f2" : "#fef3c7";
                const fg = m.severity === "error" ? "#b91c1c" : "#b45309";
                const stroke = m.severity === "error" ? "#dc2626" : "#d97706";
                return (
                  <g key={m.key} data-testid="campus-issue-marker" data-issue-object={m.key} data-issue-severity={m.severity}>
                    <circle cx={m.x} cy={m.y - 13} r={6.5} fill={bg} stroke={stroke} strokeWidth={1.1} opacity={0.95} />
                    <text x={m.x} y={m.y - 10} textAnchor="middle" fill={fg} fontSize={8} fontWeight="900">⚠</text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Entrance endpoint priority: the physical Entrance remains the
              primary Select target even when an auto-managed connector's
              transparent hit stroke reaches the same coordinates. */}
          {navGraphInteractive && tool === "select" && (
            <g data-testid="entrance-hit-priority-layer">
              {buildings.flatMap((building) => (building.entrances ?? []).map((entrance) => {
                const position = entranceWorldPosition(building, entrance);
                return (
                  <circle
                    key={`entrance-hit-${building.id}-${entrance.id}`}
                    data-testid="entrance-hit-priority"
                    data-entrance-id={entrance.id}
                    cx={position.x}
                    cy={position.y}
                    r={15}
                    fill="transparent"
                    style={{ cursor: building.locked ? "default" : "pointer" }}
                    onMouseDown={(event) => onEntranceDown?.(event, building.id, entrance.id, position.x, position.y)}
                  />
                );
              }))}
            </g>
          )}
          {/* Keep route endpoint/transition controls in the final world-space
              layer so nav hit targets and physical artwork cannot cover them. */}
          {highlightedRoute && (
            <>
              {!!highlightedRoute.routeNodeIds?.length && highlightedRoute.waypoints.length > 0 && (
                <g data-testid="test-route-active-overlay" className="pointer-events-none">
                  <polyline
                    points={highlightedRoute.waypoints.map((w) => `${w.x},${w.y}`).join(" ")}
                    fill="none"
                    stroke={highlightedRoute.color}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.28}
                  />
                  <polyline
                    points={highlightedRoute.waypoints.map((w) => `${w.x},${w.y}`).join(" ")}
                    fill="none"
                    stroke={highlightedRoute.color}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="12 8"
                    opacity={1}
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.2s" repeatCount="indefinite" />
                  </polyline>
                  {routeDirectionMarkers(highlightedRoute.waypoints).map((marker, index) => (
                    <path
                      key={`active-route-arrow-${index}`}
                      d="M -5 -4 L 5 0 L -5 4 Z"
                      transform={`translate(${marker.x} ${marker.y}) rotate(${marker.angle})`}
                      fill={highlightedRoute.color}
                      stroke="white"
                      strokeWidth={1}
                      opacity={1}
                    />
                  ))}
                </g>
              )}
              {(highlightedRoute.endpointMarkers ?? []).map((marker) => (
                <RouteEndpointMarker key={`route-endpoint-${marker.kind}`} {...marker} color={highlightedRoute.color} />
              ))}
              {(highlightedRoute.transitionMarkers ?? []).map((marker) => (
                <RouteTransitionMarker key={marker.id} marker={marker} zoom={zoom} viewport={{ width: cw, height: ch, pan }} onClick={onRouteTransitionClick} />
              ))}
            </>
          )}
        </g>
      </svg>

      {(() => {
        const stair = buildings.flatMap((building) => canonicalExteriorEmergencyStairsForBuilding(building).map((item) => ({ building, item })))
          .find(({ item }) => item.id === exteriorQuickNavKey)?.item;
        const building = buildings.find((candidate) => canonicalExteriorEmergencyStairsForBuilding(candidate).some((item) => item.id === exteriorQuickNavKey));
        if (!stair || !building || stair.state === "closed" || stair.servedFloorIds.length <= 1) return null;
        const pos = exteriorEmergencyStairWorldPosition(building, stair);
        const floors = building.floors.filter((floor) => stair.servedFloorIds.includes(floor.id));
        const rect = containerRef.current?.getBoundingClientRect();
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!rect || !svgRect) return null;
        const scale = Math.min(svgRect.width / cw, svgRect.height / ch);
        const offsetX = (svgRect.width - cw * scale) / 2;
        const offsetY = (svgRect.height - ch * scale) / 2;
        const anchorX = svgRect.left - rect.left + offsetX + (pan.x + pos.x * zoom) * scale;
        const anchorY = svgRect.top - rect.top + offsetY + (pan.y + pos.y * zoom) * scale;
        const popupWidth = 206;
        const popupHeight = Math.min(250, 38 + floors.length * 30);
        const openLeft = anchorX > rect.width - popupWidth - 28;
        const left = Math.max(8, Math.min(rect.width - popupWidth - 8, anchorX + (openLeft ? -popupWidth - 12 : 12)));
        const top = Math.max(8, Math.min(rect.height - popupHeight - 8, anchorY - popupHeight / 2));
        return <div
          data-testid="exterior-emergency-stair-quick-nav-popover"
          className="absolute z-[45] w-[206px] rounded-lg border border-red-200/70 bg-card/95 p-1.5 text-foreground shadow-lg backdrop-blur-sm"
          style={{ left, top }}
          onMouseEnter={cancelExteriorQuickNavClose}
          onMouseLeave={scheduleExteriorQuickNavClose}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeExteriorQuickNav();
            }
          }}
        >
          <div className="mb-1 px-1 text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Connected Floors</div>
          <div className="max-h-[214px] space-y-0.5 overflow-y-auto">
            {floors.map((floor) => {
              const occurrence = floor.stairs.find((item) => item.exteriorEmergencyStairId === stair.id);
              if (!occurrence) return null;
              return <button key={floor.id} type="button" className="flex w-full items-center gap-1 rounded-md border border-border/70 bg-background/60 px-1.5 py-1 text-left text-[10px] font-semibold transition-colors hover:border-red-300 hover:bg-red-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-950/20" onClick={() => { closeExteriorQuickNav(); onExteriorEmergencyStairFloorNavigate?.(building.id, floor.id, stair.id); }}>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-red-100 text-[9px] text-red-700 dark:bg-red-950/50 dark:text-red-300">E</span>
                <span className="min-w-0 flex-1 truncate">{floor.label} · {occurrence.label || stair.label}</span>
              </button>;
            })}
          </div>
        </div>;
      })()}

      {/* Layer overlay animation */}
      <AnimatePresence>
        <motion.div
          key={layer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 z-10 pointer-events-none"
        >
          {layer === "navigation" && <div className="absolute inset-0" style={{ background: "rgba(22,163,74,0.03)" }} />}
          {layer === "events" && <div className="absolute inset-0" style={{ background: "rgba(217,119,6,0.03)" }} />}
        </motion.div>
      </AnimatePresence>

      {/* Navigation empty state — foreground coachmark, above all canvas content */}
      {layer === "navigation" && renderNavNodes.length === 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-card/95 backdrop-blur px-3 py-2 shadow-md max-w-[min(500px,calc(100%-24px))]">
            <NavigationIcon className="h-4 w-4 text-green-600 shrink-0" />
            <div>
              <div className="text-[11px] font-extrabold text-green-700">Build the Walking Network</div>
              <div className="text-[10px] text-muted-foreground">Place Walking Points at intersections, then connect them with Connect.</div>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
        className="absolute bottom-3 left-[12px] right-[140px] flex items-center justify-between z-10 pointer-events-none"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 px-3 py-1 rounded-full border border-border/60 text-[11px] font-mono" style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)", color: "var(--muted-foreground)" }}>
            <span className="font-bold">B:{buildings.length}</span>
            <span className="opacity-50">·</span>
            <span>M:{markers.length}</span>
            <span className="opacity-50">·</span>
            <span>P:{paths.length}</span>
          </div>
          {cursorPos && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border/60 text-[10px] font-mono" style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)", color: "var(--muted-foreground)" }}>
              X:{cursorPos.x} Y:{cursorPos.y}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
