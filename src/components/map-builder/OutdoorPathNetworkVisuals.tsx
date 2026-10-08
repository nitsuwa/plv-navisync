import { memo } from "react";
import type { CampusPath } from "./types";
import { pathRenderStyle, type OutdoorPathRenderStyle } from "../../lib/outdoorPathVisual";
export type PathJunctionBranch = PathRenderStyle & {
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

export type PathChainInfo = {
  id: string;
  points: Pt[];
  style: PathRenderStyle;
  freeStart: boolean;
  freeEnd: boolean;
  closed: boolean;
  pathIds: string[];
};

export type PathJunctionInfo = {
  key: string;
  x: number;
  y: number;
  connectedPathIds: Set<string>;
  branches: PathJunctionBranch[];
};

export type PathNetworkGeometry = {
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
export function buildPathTransitionShape(
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

export function buildChainPathD(chain: PathChainInfo): string {
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
export function buildPathNetworkGeometry(paths: CampusPath[]): PathNetworkGeometry {
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


/** Shared static physical path network renderer used by Admin and viewer. */
export const OutdoorPathJunctionArtwork = memo(function OutdoorPathJunctionArtwork({ junctions }: { junctions: Map<string, PathJunctionInfo> }) {
  return (
    <g data-testid="path-junction-layer" className="pointer-events-none">
      {Array.from(junctions.entries()).map(([key, junction]) => {
        const dominant = junction.branches.slice().sort((a, b) => b.baseWidth - a.baseWidth)[0] ?? junction.branches[0];
        const edgeShape = buildPathTransitionShape({ x: junction.x, y: junction.y }, junction.branches, "edge");
        const surfaceShape = buildPathTransitionShape({ x: junction.x, y: junction.y }, junction.branches, "surface");
        if (!edgeShape) return null;
        return (
          <g key={"junction-" + key} data-testid="path-junction-union"
            data-connected-paths={junction.connectedPathIds.size} data-branch-count={junction.branches.length}
            data-junction-shape="directional">
            <path data-testid="path-junction-edge-union" d={edgeShape} fill={dominant.edge} opacity={1} fillRule="nonzero" />
            <path data-testid="path-junction-surface-union" d={surfaceShape} fill={dominant.surface} opacity={1} fillRule="nonzero" />
          </g>
        );
      })}
    </g>
  );
});

export function OutdoorPathNetworkArtwork({ paths }: { paths: readonly CampusPath[] }) {
  const geometry = buildPathNetworkGeometry([...paths]);
  return (
    <g data-testid="campus-path-network-artwork">
      <g data-testid="path-chain-layer" className="pointer-events-none">
        {geometry.chains.map((chain) => (
          <path key={chain.id + "-edge"} d={buildChainPathD(chain)} fill="none"
            stroke={chain.style.edge} strokeWidth={chain.style.baseWidth + 2} strokeLinecap="butt"
            strokeLinejoin={chain.style.kind === "road" ? "bevel" : "round"} />
        ))}
        {geometry.chains.map((chain) => (
          <g key={chain.id} data-testid="readonly-campus-path" data-path-id={chain.pathIds[0]}
            data-path-ids={chain.pathIds.join(",")} data-chain-kind={chain.style.kind}>
            <path d={buildChainPathD(chain)} fill="none" stroke={chain.style.surface}
              strokeWidth={chain.style.baseWidth} strokeLinecap="butt"
              strokeLinejoin={chain.style.kind === "road" ? "bevel" : "round"} />
            {chain.style.kind === "road" && <path d={buildChainPathD(chain)} fill="none"
              stroke="#f8fafc" strokeWidth={1.2} strokeLinecap="butt" strokeLinejoin="bevel"
              strokeDasharray="10 10" opacity={0.72} />}
          </g>
        ))}
        <OutdoorPathJunctionArtwork junctions={geometry.junctions} />
      </g>
    </g>
  );
}
