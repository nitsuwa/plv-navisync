import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle } from "lucide-react";
import { MARKER_STYLES } from "../../data/mapData";
import type { Campus, CampusBuilding, CampusMarker, SimpleTool, EditorLayer, CampusSelection, RubberBand, CampusDecorAsset, CampusPath, NavigationNode, NavigationEdge } from "./types";
import { DECOR_ASSET_MAP, BUILDING_TYPE_MAP, genId, getRotatedAABB } from "./constants";
import { computeBuildingPlacement, screenToWorld } from "../../lib/editorPlacement";
import { decorRenderScale, decorSelectionOutlineBox, decorWorldSize } from "../../lib/decorVisual";
import { mergeOutdoorStack } from "../../lib/campusStack";
import { outdoorGroupSelectionBounds } from "../../lib/campusSelection";
import { navGroupSelectionBounds } from "../../lib/navigationGraph";
import { DecorAssetArt, DecorAssetVisual } from "./DecorAssetVisual";
import { BUILDING_ENTRANCE_TYPE_COLORS, entranceDisplayName, entranceWorldPosition, normalizeEntranceType } from "../../lib/buildingEntrances";

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

type PathRenderStyle = {
  kind: "road" | "accessible" | "walkway";
  baseWidth: number;
  surface: string;
  edge: string;
};

type PathJunctionBranch = PathRenderStyle & {
  ux: number;
  uy: number;
};

function pathRenderStyle(path: CampusPath): PathRenderStyle {
  const kind = path.type === "road" || path.type === "driveway" ? "road" : path.type === "accessible" ? "accessible" : "walkway";
  const baseWidth = Math.max(3, path.width ?? (kind === "road" ? 18 : 10));
  return {
    kind,
    baseWidth,
    surface: kind === "road" ? "#cbd5e1" : kind === "accessible" ? "#a7f3d0" : path.color || "#94a3b8",
    edge: kind === "road" ? "#64748b" : kind === "accessible" ? "#059669" : "#64748b",
  };
}

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
  groundBrushPreview?: { x: number; y: number; width: number; height: number } | null;
  groundErasePreview?: { x: number; y: number; width: number; height: number } | null;
  groundPaintType?: CampusDecorAsset["groundType"];
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
  onItemDown: (e: React.MouseEvent, type: "building" | "marker" | "decorAsset" | "navNode", id: string, ox: number, oy: number) => void;
  onGroupSurfaceDown?: (e: React.MouseEvent) => void;
  onPathGroupScaleStart?: (e: React.MouseEvent, corner: "nw" | "ne" | "sw" | "se", bounds: { x: number; y: number; width: number; height: number }) => void;
  onPathGroupRotateStart?: (e: React.MouseEvent, center: { x: number; y: number }) => void;
  /** True while a path-group/network rotation gesture is active (floating degree label). */
  pathGroupRotationActive?: boolean;
  /** Frozen bounds during rotation gesture so the outline doesn't awkwardly resize. */
  pathGroupRotationBounds?: { x: number; y: number; width: number; height: number } | null;
  onPathDown?: (e: React.MouseEvent, id: string) => void;
  /** Double-click a member pathway — enters member edit mode for that path. */
  onPathDblClick?: (id: string) => void;
  /** Path currently being edited inside its network (member edit mode). */
  pathMemberEditId?: string | null;
  onPathPointDown?: (e: React.MouseEvent, id: string, pointIndex: number) => void;
  onPathExtendStart?: (e: React.MouseEvent, id: string, pointIndex: number) => void;
  onPathAddPoint?: (id: string, pointIndex: number, point: { x: number; y: number }) => void;
  onPathWidthDown?: (e: React.MouseEvent, id: string, segmentIndex: number, handlePoint: { x: number; y: number }) => void;
  onEntranceDown?: (e: React.MouseEvent, buildingId: string, entranceId: string, ox: number, oy: number) => void;
  onItemContextMenu?: (e: React.MouseEvent, type: "building" | "marker" | "path" | "decorAsset", id: string) => void;
  onResizeStart?: (e: React.MouseEvent, b: CampusBuilding, corner: string) => void;
  onRotateStart?: (e: React.MouseEvent, b: CampusBuilding) => void;
  onBuildingDoubleClick?: (id: string) => void;
  onPathClick: (id: string) => void;
  onSelect: (sel: CampusSelection | null) => void;
  /** Navigation-graph authoring (B5 Phase 1): edges/nodes render + interaction in the navigation layer. */
  navNodes?: NavigationNode[];
  navEdges?: NavigationEdge[];
  /** Read-only outdoor navigation overlay for the Campus layer. */
  showNavigationOverlay?: boolean;
  /** Node the Path tool is currently connecting FROM (dashed start ring + live preview). */
  navConnectStartId?: string | null;
  /** Live pointer position while the Path tool has an active start node. */
  navPreview?: { x: number; y: number } | null;
  navConnectBends?: { x: number; y: number }[];
  /** B5 Phase 6.9: the FULL proposed pin shape (corner + click point) the
   *  preview renders — the exact geometry a click would pin (preview == commit). */
  navPreviewPins?: { x: number; y: number }[];
  /** Entrance currently targeted by Add Waypoint / Connect Path (highlighted). */
  navEntranceHover?: { buildingId: string; entranceId: string; x: number; y: number } | null;
  /** B5 Phase 6.1: edge snap preview for waypoint-on-edge insertion. */
  edgeSnapPreview?: { edgeId: string; nearest: { x: number; y: number } } | null;
  /** B5 Phase 6.2: outdoor Connect blocked preview (crosses building). */
  connectBlocked?: boolean;
  /** B5 Phase 6.10: set of edge IDs currently blocked by obstacles (rendered red). */
  navBlockedEdgeIds?: Set<string>;
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
  /** Called when a building type is dropped from the palette */
  onDropBuilding?: (type: string, x: number, y: number) => void;
  /** Canvas width/height for coordinate conversion */
  canvasW?: number;
  canvasH?: number;
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
  /** Called when the decor asset rotation handle is grabbed */
  onDecorRotateStart?: (e: React.MouseEvent, da: CampusDecorAsset) => void;
  /** Called when a decor asset resize corner/edge is grabbed */
  onDecorResizeStart?: (e: React.MouseEvent, da: CampusDecorAsset, corner: string) => void;
  /** Route to highlight from the test-navigation panel (waypoints + color) */
  highlightedRoute?: { waypoints: { x: number; y: number }[]; color: string } | null;
  /** ID of a just-completed path to play the draw-in animation on */
  animatingPathId?: string | null;
}

// ── Drag-over indicator component — shows a real SVG preview of the dragged asset at the cursor ──
function DragOverlay({
  x, y, valid, label,
  type, assetType,
}: {
  x: number; y: number; valid: boolean; label: string;
  type: "decorAsset" | "buildingType";
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
          {!decor && !building && (
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

export function Canvas({
  campus, tool, layer, selected, multiSelected, selectedPathPoint = null, showGroupOutline = true, rubberBand, drawingPath, snapGrid,
  zoom, pan, svgRef, containerRef, cursor,
  buildingDrag, groundBrushPreview, groundErasePreview, groundPaintType = "grass", pathPaintPreview, guides, cursorPos, overlappingBuildings,
  onCanvasDown, onCanvasMove, onCanvasUp, onCanvasLeave, onCanvasDblClick,
  onItemDown, onGroupSurfaceDown, onPathDown, onPathPointDown, onPathExtendStart, onPathAddPoint, onPathWidthDown, onEntranceDown, onItemContextMenu, onResizeStart, onBuildingDoubleClick, onPathClick, onSelect,
  onPathGroupScaleStart, onPathGroupRotateStart, pathGroupRotationActive = false, pathGroupRotationBounds = null, onPathDblClick, pathMemberEditId = null,
  onResetView, onZoomIn, onZoomOut, onSetTool, onToggleSnap,
  onWheel, invalidBuildings = new Set(),
  onDropAsset, onDropBuilding,
  onRotateStart, canvasW, canvasH,
  rotatingId, rotatingAngle,
  resizingId, highlightedRoute, animatingPathId,
  decorRotatingId, decorResizingId, onDecorRotateStart, onDecorResizeStart,
  navNodes, navEdges, showNavigationOverlay = false, navConnectStartId, navPreview, navConnectBends = [], navPreviewPins = [], navEntranceHover, edgeSnapPreview, connectBlocked, navBlockedEdgeIds, onNavEdgeSelect, onNavEdgeBendDown, onNavEdgeAddBend,
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
  const groundAreas = decorAssets.filter((asset) => asset.type === "ground-area");
  const foregroundDecorAssets = decorAssets.filter((asset) => asset.type !== "ground-area");

  // B5 Phase 2.9: the nav props are the SCOPED collection the outdoor editor
  // derives (outdoor-only entities) — indoor floor nodes/edges never render
  // here, even when their building sits on this canvas. The campus fallback is
  // only a safety net for legacy direct usage.
  const renderNavNodes = navNodes ?? campus.navNodes ?? [];
  const renderNavEdges = navEdges ?? campus.navEdges ?? [];
  const navGraphInteractive = layer === "navigation";
  const shouldRenderNavGraph = navGraphInteractive || showNavigationOverlay;

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

  // Normalized canvas dimensions: prefer the explicit props (CampusEditor
  // passes its safe/normalized dims) so a transiently-unset campus can never
  // render a degenerate viewBox or collapse pointer conversion toward (0,0).
  const cw = (canvasW ?? campus.canvasW) || 900;
  const ch = (canvasH ?? campus.canvasH) || 680;
  const groundStyle = (kind: CampusDecorAsset["groundType"] = "grass") => {
    switch (kind) {
      case "planted":
        return { fill: "#cfe7c8", stroke: "#6da567", accent: "#8bbf7a", label: "Planted" };
      case "plaza":
        return { fill: "#d9d6cf", stroke: "#a8a29a", accent: "#b8b2a8", label: "Plaza" };
      case "field":
        return { fill: "#dbe8c2", stroke: "#9db76d", accent: "#b6ca86", label: "Open Field" };
      case "grass":
      default:
        return { fill: "#d7e9ce", stroke: "#86b879", accent: "#a9cf9b", label: "Grass" };
    }
  };

  // ── ONE cross-type visual stack for buildings + decorative assets ──
  // Document order == stacking order, so a bench can sit in front of part of a
  // building and a tree behind it (B2 cross-type layer ordering). Markers,
  // paths, nav/event objects stay in their own fixed layers.
  const stackedOutdoor = mergeOutdoorStack(buildings, foregroundDecorAssets);
  const groupSelectionBounds = useMemo(() => {
    if (!showGroupOutline) return null;
    if (layer === "navigation") return null;
    return outdoorGroupSelectionBounds(multiSelected, buildings, decorAssets, DECOR_ASSET_MAP, paths, { includeHidden: true });
  }, [buildings, decorAssets, layer, multiSelected, paths, showGroupOutline]);

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

  // ── Drag-and-drop state ──
  const [dragOver, setDragOver] = useState<{
    x: number; y: number;
    canvasX: number; canvasY: number;
    valid: boolean; label: string;
    type: "decorAsset" | "buildingType";
    assetType?: string;
  } | null>(null);
  const dragCounterRef = useRef(0);
  const dragLabelRef = useRef("Item");
  const dragTypeRef = useRef<"decorAsset" | "buildingType">("decorAsset");
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

      if (data.type === "decorAsset" && onDropAsset) {
        const isGroundArea = data.assetType === "ground-area";
        const asset: CampusDecorAsset = {
          id: genId("dec"),
          type: data.assetType,
          x: clampedX,
          y: clampedY,
          rotation: 0,
          ...(isGroundArea ? { width: 150, height: 95, groundType: "grass" as const, zOrder: -1000 } : { scale: 1 }),
        };
        onDropAsset(asset);
      } else if (data.type === "buildingType" && onDropBuilding) {
        onDropBuilding(data.assetType || data.label, clampedX, clampedY);
      }
    } catch {
      // Ignore invalid data
    }
  }, [cw, ch, pan, zoom, svgRef, onDropAsset, onDropBuilding]);

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
    const canEditPath = layer !== "navigation";
    // B5 Phase 5.12 — Canva-style group editing: a whole-network selection shows
    // group bounds only. Individual point/width controls appear only for a
    // single path or the member currently being edited (double-click entry).
    const inNetworkGroup = !!p.pathNetworkId
      && (pathNetworkSize.get(p.pathNetworkId) ?? 1) > 1
      && pathOnlyMultiSelect;
    const showControls = isSel && (!inNetworkGroup || pathMemberEditId === p.id);
    if (!canEditPath || !showControls || p.visible === false) return null;
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
                    onMouseDown={(e) => { e.stopPropagation(); onPathAddPoint?.(p.id, index + 1, mid); }}
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
      style={{ background: "#e8eaf0" }}
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
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(14,42,110,0.06) 1px, transparent 0)`,
        backgroundSize: `${campus.gridSize ?? 20}px ${campus.gridSize ?? 20}px`,
      }} />
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${cw} ${ch}`}
        className="w-full h-full"
        style={{ cursor, userSelect: "none" }}
        onMouseDown={onCanvasDown}
        onMouseMove={onCanvasMove}
        onMouseUp={onCanvasUp}
        onMouseLeave={onCanvasLeave ?? onCanvasUp}
        onDoubleClick={onCanvasDblClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="dotPattern" width={campus.gridSize ?? 20} height={campus.gridSize ?? 20} patternUnits="userSpaceOnUse">
            <circle cx={(campus.gridSize ?? 20) / 2} cy={(campus.gridSize ?? 20) / 2} r={1} fill="rgba(14,42,110,0.08)" />
          </pattern>
          <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx={0} dy={1} stdDeviation={2} floodColor="rgba(0,0,0,0.3)" />
          </filter>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Canvas background with subtle grid */}
          <rect data-bg="true" width={cw} height={ch} fill={(campus as unknown as { canvasColor?: string }).canvasColor ?? "#f5f3ef"} />
          <rect data-bg="true" width={cw} height={ch} fill="url(#dotPattern)" opacity={0.3} />

          {/* Empty state — compact contextual prompt, not a tutorial */}
          {layer === "campus" && buildings.length === 0 && (
            <g opacity={0.5}>
              <text x={cw / 2} y={ch / 2 - 20} textAnchor="middle" fontSize={15} fontWeight="800" fill="var(--primary)" className="pointer-events-none select-none">Start Building Your Campus</text>
              <text x={cw / 2} y={ch / 2} textAnchor="middle" fontSize={10} fill="#6b7280" className="pointer-events-none select-none">Select a building type or asset from the left panel and place it here.</text>
            </g>
          )}

          {/* All SVG content (unchanged from original) */}
          {/* Navigation empty state */}
          {layer === "navigation" && renderNavNodes.length === 0 && (
            <g opacity={0.5}>
              <text x={cw / 2} y={ch / 2 - 20} textAnchor="middle" fontSize={14} fontWeight="800" fill="#16a34a" className="pointer-events-none select-none">Build the Walking Network</text>
              <text x={cw / 2} y={ch / 2} textAnchor="middle" fontSize={10} fill="#6b7280" className="pointer-events-none select-none">Add waypoints at intersections and destinations, then connect them with Connect.</text>
            </g>
          )}

          {/* Major grid lines */}
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(cw / ((campus.gridSize ?? 20) * 4)) }, (_, i) => (
              <line key={`v${i}`} x1={i * (campus.gridSize ?? 20) * 4} y1={0} x2={i * (campus.gridSize ?? 20) * 4} y2={ch} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
            ))}
          </g>
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(ch / ((campus.gridSize ?? 20) * 4)) }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * (campus.gridSize ?? 20) * 4} x2={cw} y2={i * (campus.gridSize ?? 20) * 4} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
            ))}
          </g>

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
            const rot = area.rotation ?? 0;
            const isVisible = area.visible ?? true;
            const isLocked = area.locked ?? false;
            const isSel = selected?.type === "decorAsset" && selected.id === area.id;
            const isMultiSel = multiSelected.includes(area.id);
            const width = Math.max(30, area.width ?? template.defaultWidth * decorRenderScale(area.scale));
            const height = Math.max(24, area.height ?? template.defaultHeight * decorRenderScale(area.scale));
            const hw = width / 2;
            const hh = height / 2;
            const style = groundStyle(area.groundType);
            const editorOpacity = isVisible ? (isSel ? 0.96 : 0.82) : (isSel || isMultiSel ? 0.34 : 0.2);
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
                data-testid="ground-area"
                data-ground-type={area.groundType ?? "grass"}
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
                    rx={area.groundType === "plaza" ? 5 : 10}
                    fill={style.fill}
                    stroke={isSel ? "var(--accent)" : "transparent"}
                    strokeWidth={isSel ? 2 : 0}
                  />
                  <path
                    d={`M${area.x - hw + 10} ${area.y - hh + height * 0.35} H${area.x + hw - 10} M${area.x - hw + 10} ${area.y + hh - height * 0.35} H${area.x + hw - 10}`}
                    fill="none"
                    stroke={style.accent}
                    strokeWidth={area.groundType === "plaza" ? 0.8 : 1}
                    strokeLinecap="round"
                    strokeDasharray={area.groundType === "plaza" ? "8 6" : area.groundType === "planted" ? "3 5" : undefined}
                    opacity={isSel ? 0.55 : 0.28}
                  />
                  {(isSel || isMultiSel) && (
                    <rect
                      x={area.x - hw - 5}
                      y={area.y - hh - 5}
                      width={width + 10}
                      height={height + 10}
                      rx={area.groundType === "plaza" ? 7 : 12}
                      fill="none"
                      stroke={isSel ? "var(--accent)" : "var(--primary)"}
                      strokeWidth={isSel ? 2 : 1}
                      strokeDasharray="3 4"
                      opacity={isSel ? 0.72 : 0.35}
                    />
                  )}
                </g>
                {isSel && !isLocked && tool === "select" && ["nw", "ne", "sw", "se"].map((corner) => {
                  const lx = corner.includes("e") ? hw : -hw;
                  const ly = corner.includes("s") ? hh : -hh;
                  const p = cornerPos(lx, ly);
                  return (
                    <g key={corner}>
                      <rect data-testid="ground-area-resize-handle" data-corner={corner} x={p.x - 12} y={p.y - 12} width={24} height={24} fill="transparent" style={{ cursor: getCornerCursor(corner, rot) }} onMouseDown={(e) => { e.stopPropagation(); onDecorResizeStart?.(e, area, corner); }} />
                      <rect x={p.x - 6} y={p.y - 6} width={12} height={12} rx={2} fill="white" stroke="var(--accent)" strokeWidth={2} className="pointer-events-none" />
                    </g>
                  );
                })}
                {isSel && !isLocked && tool === "select" && ["n", "s", "e", "w"].map((side) => {
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
                      r={6}
                      fill="white"
                      stroke="var(--accent)"
                      strokeWidth={2}
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
              return (
                <path key={`${chain.id}-edge`} d={d} fill="none" stroke={chain.style.edge} strokeWidth={baseWidth + 2} strokeLinecap="butt" strokeLinejoin={join} opacity={1} />
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
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    />
                  ) : (
                    <path d={d} fill="none" stroke={chain.style.surface} strokeWidth={baseWidth} strokeLinecap="butt" strokeLinejoin={join} opacity={1} />
                  )}
                  {kind === "road" && <path d={d} fill="none" stroke="#f8fafc" strokeWidth={1.2} strokeLinecap="butt" strokeLinejoin="bevel" strokeDasharray="10 10" opacity={0.72} />}
                  {(isSel || isMultiSel) && <path d={d} fill="none" stroke={isSel ? "var(--accent)" : "var(--primary)"} strokeWidth={baseWidth + 6} strokeLinecap="butt" strokeLinejoin={join} opacity={isSel ? 0.18 : 0.12} />}
                </g>
              );
            })}
          </g>

          {paths.map((p) => {
            if (p.visible === false) return null;
            const kind = p.type === "road" || p.type === "driveway" ? "road" : p.type === "accessible" ? "accessible" : "walkway";
            const baseWidth = Math.max(3, p.width ?? (kind === "road" ? 18 : 10));
            const canEditPath = layer !== "navigation";
            return (
              <g
                key={`${p.id}-hit`}
                data-testid="campus-path"
                data-path-id={p.id}
                data-path-network-id={p.pathNetworkId}
                data-path-kind={kind}
                onMouseDown={(e) => { e.stopPropagation(); if (canEditPath && tool === "select") onPathDown?.(e, p.id); }}
                onClick={(e) => { e.stopPropagation(); if (!canEditPath) return; if (tool === "erase") { onSelect(null); } else onPathClick(p.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); if (canEditPath && tool === "select") onPathDblClick?.(p.id); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (canEditPath) onItemContextMenu?.(e, "path", p.id); }}
                style={{ cursor: !canEditPath ? "default" : p.locked ? "not-allowed" : tool === "erase" ? "not-allowed" : tool === "select" ? "move" : "pointer" }}
              >
                <polyline points={p.points.map((pt) => `${pt.x},${pt.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={baseWidth + 2} strokeLinecap="butt" strokeLinejoin={kind === "road" ? "bevel" : "round"} />
              </g>
            );
          })}

          {/* Style-transition junction covers — small corner fills only (no
              internal end outlines; same-style joins are one continuous chain). */}
          {renderPathJunctionLayer()}
          {paths.map((p) => renderPathControls(p))}

          {pathPaintPreview && layer !== "navigation" && (
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
          {highlightedRoute && highlightedRoute.waypoints.length > 0 && (
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
              {/* Animated dashed main line */}
              <polyline
                points={highlightedRoute.waypoints.map((w) => `${w.x},${w.y}`).join(" ")}
                fill="none"
                stroke={highlightedRoute.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="10 6"
                opacity={0.95}
              />
              {/* Start + end markers */}
              <circle cx={highlightedRoute.waypoints[0].x} cy={highlightedRoute.waypoints[0].y} r={6} fill={highlightedRoute.color} stroke="white" strokeWidth={2} />
              <circle cx={highlightedRoute.waypoints[highlightedRoute.waypoints.length - 1].x} cy={highlightedRoute.waypoints[highlightedRoute.waypoints.length - 1].y} r={6} fill={highlightedRoute.color} stroke="white" strokeWidth={2} />
            </g>
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
            const surfaceInteractive = !!groupSelectionBounds || !!pathGroupRotationBounds || renderNavDragSurface;
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
                {isPathOnlyGroup && (["nw", "ne", "sw", "se"] as const).map((corner) => {
                  const hx = corner.includes("e") ? x + w : x;
                  const hy = corner.includes("s") ? y + h : y;
                  return (
                    <rect
                      key={corner}
                      data-testid="path-group-scale-handle"
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
                      onMouseDown={(e) => onPathGroupScaleStart?.(e, corner, groupSelectionBounds)}
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
            return (
              <g>
                <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={6} fill="var(--primary)" fillOpacity={0.12} stroke="var(--primary)" strokeWidth={2} strokeDasharray="8 4" />
                <text x={r.x + r.width / 2} y={r.y + r.height / 2 + 3} textAnchor="middle" fill="var(--primary)" fontSize={10} fontWeight="700" className="pointer-events-none select-none">{r.width}×{r.height}</text>
              </g>
            );
          })()}

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
              <g key={b.id} data-hidden={isVisible ? undefined : "true"} onMouseDown={(e) => { if (isLocked) return; onItemDown(e, "building", b.id, b.x, b.y); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (isLocked) return; onItemContextMenu?.(e, "building", b.id); }} onDoubleClick={(e) => { if (isLocked) return; e.stopPropagation(); onBuildingDoubleClick?.(b.id); }} style={{ cursor: isLocked ? "default" : tool === "select" ? "move" : cursor, opacity: editorOpacity }}>
                {/* ── Rotated group: shadow, outline, handles, overlap borders, and body all rotate together ── */}
                <g transform={rot !== 0 ? `rotate(${rot}, ${cx}, ${cy})` : ''}>
                  {/* Shadow (rotated with building so it follows the visual) */}
                  <rect x={b.x + 3} y={b.y + 4} width={b.width} height={b.height} rx={8} fill="rgba(0,0,0,0.12)" />
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
                  <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={8} fill={b.color} stroke={isSel ? "var(--accent)" : "rgba(255,255,255,0.5)"} strokeWidth={isSel ? 2.5 : 1.5} opacity={0.92} />
                  <rect x={b.x} y={b.y} width={b.width} height={7} rx={8} fill="rgba(0,0,0,0.12)" />
                  {!isVisible && (
                    <g className="pointer-events-none select-none" opacity={0.95}>
                      <rect x={b.x + 5} y={b.y + 5} width={18} height={14} rx={4} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
                      <path d={`M${b.x + 8} ${b.y + 12} Q${b.x + 14} ${b.y + 7} ${b.x + 20} ${b.y + 12} Q${b.x + 14} ${b.y + 17} ${b.x + 8} ${b.y + 12}Z`} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} />
                      <circle cx={b.x + 14} cy={b.y + 12} r={2} fill="var(--muted-foreground)" />
                      <line x1={b.x + 8} y1={b.y + 17} x2={b.x + 21} y2={b.y + 6} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
                    </g>
                  )}
                  <text x={cx} y={b.y + b.height / 2 - 8} textAnchor="middle" fill="white" fontSize={11} fontWeight="800" className="pointer-events-none select-none">{b.code}</text>
                  {b.floors.length > 0 && <text x={cx} y={b.y + b.height / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={7} className="pointer-events-none select-none">{b.floors.length}F</text>}
                  {isLocked && (
                    <g>
                      <rect x={b.x + b.width - 16} y={b.y + 4} width={12} height={10} rx={2} fill="rgba(255,255,255,0.85)" />
                      <text x={b.x + b.width - 10} y={b.y + 12} textAnchor="middle" fill="#92400e" fontSize={8} fontWeight="900" className="pointer-events-none select-none">🔒</text>
                    </g>
                  )}
                  {isInvalid && !isOverlapping && (
                    <>
                      <rect x={b.x - 5} y={b.y - 5} width={b.width + 10} height={b.height + 10} rx={10} fill="none" stroke="#dc2626" strokeWidth={2.5} strokeDasharray="8 4" opacity={0.85} className="animate-validation-pulse" />
                      <rect x={b.x - 7} y={b.y - 7} width={b.width + 14} height={b.height + 14} rx={12} fill="none" stroke="#dc2626" strokeWidth={1} strokeDasharray="4 6" opacity={0.35} />
                    </>
                  )}
                  {/* Single selection outlines + resize handles — rendered ABOVE the body so the rotation-aware resize cursors are visible on hover (rotated with building) */}
                  {isSel && (
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
                  {isSel && !isLocked && rotatingId !== b.id && (
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
                      <rect x={b.x + b.width - 18} y={b.y - 14} width={32} height={16} rx={4} fill="#dc2626" opacity={0.95} />
                      <text x={b.x + b.width - 2} y={b.y - 3} textAnchor="middle" fill="white" fontSize={7} fontWeight="900">OVERLAP</text>
                    </g>
                  )}
                  {isInvalid && !isOverlapping && (
                    <g className="pointer-events-none select-none">
                      <rect x={b.x + b.width - 16} y={b.y - 14} width={30} height={16} rx={4} fill="#dc2626" opacity={0.95} />
                      <text x={b.x + b.width - 1} y={b.y - 3} textAnchor="middle" fill="white" fontSize={8} fontWeight="900">⚠</text>
                    </g>
                  )}
                </g>
                {/* Building name — OUTSIDE rotation group so text stays horizontal & readable */}
                {zoom > 0.7 && b.name !== "New Building" && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const rotCx = rotAABB.x + rotAABB.width / 2;
                  const rotCy = rotAABB.y + rotAABB.height / 2;
                  return (
                    <text x={rotCx} y={rotCy + 16} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={6} fontWeight="600" className="pointer-events-none select-none" stroke="rgba(0,0,0,0.2)" strokeWidth={2} paintOrder="stroke">
                      {b.name.length > 16 ? b.name.slice(0, 14) + "…" : b.name}
                    </text>
                  );
                })()}
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
            const rotHandlePos = cornerPos(0, -(hh + 30));

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
                {isSel && tool === "select" && (
                  <>
                    {/* Rotation handle — sits above the rotated asset */}
                    {decorRotatingId !== da.id && (
                      <g>
                        <line x1={da.x} y1={da.y} x2={rotHandlePos.x} y2={rotHandlePos.y} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.5} />
                        <circle cx={rotHandlePos.x} cy={rotHandlePos.y} r={6} fill="var(--accent)" stroke="white" strokeWidth={2}
                          style={{ cursor: "grab" }}
                          onMouseDown={(e) => { e.stopPropagation(); onDecorRotateStart?.(e, da); }}
                        />
                        <path d={`M${rotHandlePos.x - 2.5} ${rotHandlePos.y - 2} Q${rotHandlePos.x} ${rotHandlePos.y - 5} ${rotHandlePos.x + 2.5} ${rotHandlePos.y - 2}`}
                          fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
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
                          <rect x={p.x - 12} y={p.y - 12} width={24} height={24} fill="transparent" stroke="none" style={{ cursor: cornerCursor }} onMouseDown={(e) => { e.stopPropagation(); onDecorResizeStart?.(e, da, corner); }} />
                          <rect x={p.x - 7} y={p.y - 7} width={14} height={14} rx={2} fill="white" stroke="var(--accent)" strokeWidth={2} style={{ pointerEvents: "none", cursor: cornerCursor }} />
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

          {/* Building entrances: functional editor overlay, not part of z-order. */}
          {buildings.flatMap((b) => {
            const entrances = b.entrances ?? [];
            const isParentVisible = b.visible ?? true;
            const isParentLocked = b.locked ?? false;
            return entrances.map((entrance) => {
              const pos = entranceWorldPosition(b, entrance);
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
                  style={{ cursor: isParentLocked ? "default" : showNavigationOverlay && tool === "select" ? "pointer" : tool === "select" ? "grab" : cursor }}
                  onMouseDown={(e) => onEntranceDown?.(e, b.id, entrance.id, pos.x, pos.y)}
                >
                  <title>{entranceDisplayName(entrance, entrances.findIndex((e) => e.id === entrance.id))}</title>
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
            const isSel = selected?.type === "marker" && selected.id === m.id;
            return (
              <g key={m.id} onMouseDown={(e) => onItemDown(e, "marker", m.id, m.x, m.y)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "marker", m.id); }} style={{ cursor: tool === "select" ? "move" : cursor }}>
                {isSel && <circle cx={m.x} cy={m.y} r={22} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.6} />}
                <ellipse cx={m.x} cy={m.y + 1} rx={10} ry={5} fill="rgba(0,0,0,0.18)" />
                <circle cx={m.x} cy={m.y} r={13} fill={color} stroke={isSel ? "var(--accent)" : "white"} strokeWidth={isSel ? 2.5 : 2} />
                <text x={m.x} y={m.y + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight="900" className="pointer-events-none select-none">{style.symbol}</text>
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
                const oneWay = e.bidirectional === false;
                const isClosed = e.closed === true;
                const edgePoints = [{ x: a.x, y: a.y }, ...(e.bendPoints ?? []), { x: b.x, y: b.y }];
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
                return (
                  <g key={e.id} data-testid="nav-edge" className="group/nav-edge"
                    onMouseDown={(ev) => {
                      if (!navGraphInteractive) return;
                      // B5 Phase 6.7/6.8: Waypoint AND Connect tools must not be
                      // intercepted by edge selection — the edge hit polyline passes
                      // through waypoints that sit ON an edge (inserted waypoints),
                      // so stopPropagation here would swallow the node click before
                      // handleSvgDown's node-target priority ever runs. Fall through
                      // for both marker and path (Connect) tools.
                      if (tool === "marker" || tool === "path") return;
                      ev.stopPropagation();
                      onNavEdgeSelect?.(ev, e.id);
                    }}
                    style={{ cursor: navGraphInteractive ? (tool === "select" ? "pointer" : tool === "marker" ? "crosshair" : "crosshair") : "default" }}
                  >
                    {/* Invisible generous hit target so thin edges are clickable */}
                    <polyline points={edgePts} fill="none" stroke="transparent" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                    {/* Hover halo — reveals the edge is interactive without color noise */}
                    <polyline points={edgePts} fill="none"
                      stroke="var(--accent)"
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0}
                      className="pointer-events-none transition-opacity duration-150 group-hover/nav-edge:opacity-20"
                    />
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
                    {navGraphInteractive && isSel && tool === "select" && edgePoints.slice(0, -1).map((point, index) => {
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
                    {navGraphInteractive && isSel && tool === "select" && (e.bendPoints ?? []).map((point, index) => (
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
                const isAssembly = n.type === "assembly";
                const isSafeArea = n.type === "safe_area";
                const isEntrance = n.type === "entrance";
                const isDestination = n.type === "room_access";
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
                  <g key={n.id} data-testid="nav-node" data-entrance-linked={isEntranceLinked ? "true" : undefined} className="group/nav-node"
                    onMouseDown={(e) => { if (navGraphInteractive) onItemDown(e, "navNode", n.id, n.x, n.y); }}
                    onContextMenu={(e) => { if (!navGraphInteractive) return; e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "navNode", n.id); }}
                    style={{ cursor: navGraphInteractive ? (tool === "select" ? "move" : cursor) : "default" }}
                  >
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
                        // Connected/normal: the tiny badge ring doubles as the
                        // single hover highlight (one subtle cue, ~150ms).
                        <g className="pointer-events-none">
                          <circle cx={n.x} cy={n.y} r={4} fill="#16a34a" stroke="white" strokeWidth={1.5} opacity={0.95} />
                          <circle cx={n.x} cy={n.y} r={6.5} fill="none" stroke="#16a34a" strokeWidth={1.1} opacity={0.55} className="transition-opacity duration-150 group-hover/nav-node:opacity-100" />
                        </g>
                      )
                    ) : (
                      <circle cx={n.x} cy={n.y} r={7} fill={n.color || "#16a34a"} stroke={isSel || isMultiSel ? "var(--accent)" : "white"} strokeWidth={2}
                        opacity={dimmed ? 0.45 : 1} strokeDasharray={dimmed ? "3 2" : undefined} />
                    )}
                    {/* Compact type glyphs — one small path each, pointer-events none */}
                    {!isEntranceLinked && isEmergency && <path d={`M${n.x - 3.5},${n.y + 3} L${n.x - 3.5},${n.y - 2} L${n.x},${n.y - 3.5} L${n.x + 3.5},${n.y - 2} L${n.x + 3.5},${n.y + 3} Z`} fill="#dc2626" className="pointer-events-none" />}
                    {!isEntranceLinked && isAssembly && <g className="pointer-events-none"><circle cx={n.x} cy={n.y - 1} r={2.2} fill="#d97706" /><path d={`M${n.x - 3},${n.y + 3.2} L${n.x + 3},${n.y + 3.2}`} stroke="#d97706" strokeWidth={1.4} strokeLinecap="round" /></g>}
                    {!isEntranceLinked && isSafeArea && <path d={`M${n.x},${n.y - 3.2} L${n.x + 2.6},${n.y - 1.6} L${n.x + 2.6},${n.y + 0.6} L${n.x},${n.y + 2.8} L${n.x - 2.6},${n.y + 0.6} L${n.x - 2.6},${n.y - 1.6} Z`} fill="#0d9488" className="pointer-events-none" />}
                    {!isEntranceLinked && isEntrance && <rect x={n.x - 2.4} y={n.y - 3.4} width={4.8} height={6.8} rx={0.8} fill="#2563eb" className="pointer-events-none" />}
                    {!isEntranceLinked && isDestination && <g className="pointer-events-none"><circle cx={n.x} cy={n.y} r={1.6} fill="#7c3aed" /><circle cx={n.x} cy={n.y} r={3.6} fill="none" stroke="#7c3aed" strokeWidth={1.1} /></g>}
                    {zoom > 0.6 && (
                      <text x={n.x} y={n.y + 20} textAnchor="middle" fill={n.color || "#16a34a"} fontSize={9} fontWeight={700}
                        stroke="rgba(240,238,234,0.95)" strokeWidth={3} paintOrder="stroke"
                        className="pointer-events-none select-none">{entranceDisplay ?? n.name}</text>
                    )}
                  </g>
                );
              })}

              {/* Connect Path preview — the dashed line from the start waypoint
                  to the pointer, plus the would-be waypoint node at the pointer
                  (also shown before the first click: hovering empty space with
                  Connect Path active previews that a click places a Waypoint). */}
              {navGraphInteractive && navPreview && (() => {
                const start = renderNavNodes.find((n) => n.id === navConnectStartId);
                // B5 Phase 6.9 (Floor parity): render the FULL proposed pin shape
                // computed by CampusEditor (navPreviewPins) — the same geometry a
                // click pins/commits, so preview == commit (no separate Outdoor
                // preview algorithm, no L-shape-then-different-commit).
                const proposed = navPreviewPins ?? [];
                let previewPoints: { x: number; y: number }[];
                if (start) {
                  previewPoints = [{ x: start.x, y: start.y }, ...navConnectBends, ...proposed];
                } else {
                  previewPoints = [navPreview];
                }
                const ringPos = proposed.length > 0 ? proposed[proposed.length - 1] : navPreview;
                // B5 Phase 1.9: hovering a connect-target entrance must NOT stack
                // the ghost waypoint node on top of the entrance's single target
                // ring — keep only the dashed edge preview line.
                const overEntranceTarget = !!navEntranceHover;
                return (
                  <g data-testid="nav-path-preview" className="pointer-events-none">
                    {start && (
                      <>
                        <polyline points={previewPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                          fill="none" stroke={connectBlocked ? "#dc2626" : "#16a34a"} strokeWidth={2.5} strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
                        {navConnectBends.map((bend, index) => (
                          <circle key={`nav-preview-bend-${index}`} data-testid="nav-connect-pin" cx={bend.x} cy={bend.y} r={4} fill={connectBlocked ? "#dc2626" : "#16a34a"} opacity={0.85} />
                        ))}
                      </>
                    )}
                    {!overEntranceTarget && ringPos && (
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
                style={{ fontFamily: "var(--font-sans)" }}>
                Insert waypoint into connection
              </text>
            </g>
          )}
        </g>
      </svg>

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
