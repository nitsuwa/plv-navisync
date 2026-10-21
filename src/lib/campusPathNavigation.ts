import type { Campus, CampusPath, GeneratedPathIntersectionEdgeRef, GeneratedPathIntersectionRef, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { createNavEdge, createNavNode, findDuplicateNavEdge, isSelfEdge } from "./navigationGraph";
import { reconcileEntranceOutdoorConnections, type EntranceOutdoorReconciliationOptions } from "./entranceTransitions";

export type PathwayIdFactory = (prefix: string) => string;

type PathVertexRef = { pathId: string; vertexId: string };

const refKey = (ref: PathVertexRef) => `${ref.pathId}:${ref.vertexId}`;
const pointKey = (point: { x: number; y: number }) => `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;
const pathPointIsDisconnected = (path: CampusPath | undefined, point: { x: number; y: number }) =>
  Boolean(path?.disconnectedJunctionKeys?.includes(pointKey(point)));

const edgeDistanceWithBends = (edge: NavigationEdge, nodes: NavigationNode[]) => {
  const start = nodes.find((node) => node.id === edge.startNodeId);
  const end = nodes.find((node) => node.id === edge.endNodeId);
  if (!start || !end) return edge.distance;
  const points = [start, ...(edge.bendPoints ?? []), end];
  return Math.round(points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0));
};

function canShareGeneratedNode(
  node: NavigationNode,
  point: { x: number; y: number },
  pathById: Map<string, CampusPath>,
): boolean {
  return (node.generatedFromPathVertices ?? []).every((ref) =>
    !pathPointIsDisconnected(pathById.get(ref.pathId), point)
  );
}

function validVertexIds(path: CampusPath): string[] | null {
  if (!path.navigationVertexIds || path.navigationVertexIds.length !== path.points.length) return null;
  const ids = path.navigationVertexIds;
  return new Set(ids).size === ids.length ? ids : null;
}

function refPoint(pathById: Map<string, CampusPath>, ref: PathVertexRef): { x: number; y: number } | undefined {
  const ownerPath = pathById.get(ref.pathId);
  const vertexIndex = ownerPath ? validVertexIds(ownerPath)?.indexOf(ref.vertexId) ?? -1 : -1;
  return vertexIndex >= 0 ? ownerPath?.points[vertexIndex] : undefined;
}

/** True only when a pathway has explicit, persisted generated-vertex identity. */
export function pathwayHasOwnedNavigation(path: CampusPath | undefined): boolean {
  return Boolean(path && validVertexIds(path));
}

/** True for paths attached to artwork only, before they own or join a real navigation network. */
export function isVisualOnlyPathAttachment(
  path: CampusPath | undefined,
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
): boolean {
  return Boolean(path?.visualAttachments?.length
    && !pathwayHasOwnedNavigation(path)
    && !path.pathNetworkId
    && !pathwayHasLegacyNavigationChain(path, nodes, edges));
}

/**
 * Conservative legacy detection used by the UI. It deliberately does not
 * claim ownership: old conversions predate provenance and must remain manual
 * until an administrator explicitly rebuilds them.
 */
export function pathwayHasLegacyNavigationChain(
  path: CampusPath | undefined,
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
): boolean {
  if (!path || validVertexIds(path) || path.points.length < 2) return false;
  const pointNodeIds = path.points.map((point) => nodes?.find((node) =>
    node.type === "outdoor" && !node.floorId &&
    Math.hypot(node.x - point.x, node.y - point.y) <= 1
  )?.id);
  if (pointNodeIds.some((id) => !id)) return false;
  return pointNodeIds.slice(0, -1).every((startNodeId, index) => {
    const endNodeId = pointNodeIds[index + 1];
    return Boolean(startNodeId && endNodeId && startNodeId !== endNodeId &&
      edges?.some((edge) =>
        (edge.startNodeId === startNodeId && edge.endNodeId === endNodeId) ||
        (edge.startNodeId === endNodeId && edge.endNodeId === startNodeId)
      ));
  });
}

function addNodeRef(node: NavigationNode, ref: PathVertexRef): NavigationNode {
  const refs = node.generatedFromPathVertices ?? [];
  if (refs.some((candidate) => refKey(candidate) === refKey(ref))) return node;
  return { ...node, generatedFromPathVertices: [...refs, ref] };
}

function pathPairExists(nodeIds: string[], edge: NavigationEdge): boolean {
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const a = nodeIds[index];
    const b = nodeIds[index + 1];
    if ((edge.startNodeId === a && edge.endNodeId === b) || (edge.startNodeId === b && edge.endNodeId === a)) return true;
  }
  return false;
}

type ReconciledPathSegment = {
  path: CampusPath;
  index: number;
  ref: GeneratedPathIntersectionRef;
  key: string;
  startNodeId: string;
  endNodeId: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type SegmentHit = { segment: ReconciledPathSegment; t: number };
type PathIntersectionGroup = {
  networkId: string;
  point: { x: number; y: number };
  hits: Map<string, SegmentHit>;
};

const segmentRefKey = (ref: GeneratedPathIntersectionRef) =>
  `${ref.pathId}:${ref.startVertexId}:${ref.endVertexId}`;
const intersectionNodeRefsKey = (refs: GeneratedPathIntersectionRef[]) =>
  refs.map(segmentRefKey).sort().join("|");
const intersectionEdgeRefKey = (ref: GeneratedPathIntersectionEdgeRef) =>
  `${segmentRefKey(ref)}:${ref.fromJunctionKey}>${ref.toJunctionKey}`;
const cross2 = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.y - a.y * b.x;
const subtract = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x - b.x, y: a.y - b.y });

/**
 * Return a proper segment crossing from the authored centerlines. Collinear
 * overlaps are not guessed into junctions; endpoint-to-segment T hits and
 * interior X hits are accepted within floating-point tolerance.
 */
function lineSegmentIntersection(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): { t: number; u: number; point: { x: number; y: number } } | null {
  const r = subtract(b, a);
  const s = subtract(d, c);
  const denominator = cross2(r, s);
  if (Math.abs(denominator) < 1e-8) return null;
  const offset = subtract(c, a);
  const rawT = cross2(offset, s) / denominator;
  const rawU = cross2(offset, r) / denominator;
  const endpointTolerance = 1e-8;
  if (rawT < -endpointTolerance || rawT > 1 + endpointTolerance || rawU < -endpointTolerance || rawU > 1 + endpointTolerance) return null;
  const t = Math.max(0, Math.min(1, rawT));
  const u = Math.max(0, Math.min(1, rawU));
  const pointA = { x: a.x + r.x * t, y: a.y + r.y * t };
  const pointB = { x: c.x + s.x * u, y: c.y + s.y * u };
  return { t, u, point: { x: (pointA.x + pointB.x) / 2, y: (pointA.y + pointB.y) / 2 } };
}

function adjacentSegments(a: ReconciledPathSegment, b: ReconciledPathSegment): boolean {
  if (a.path.id !== b.path.id) return false;
  if (Math.abs(a.index - b.index) === 1) return true;
  const ids = validVertexIds(a.path);
  return Boolean(ids && a.path.points.length > 2 && pointKey(a.path.points[0]) === pointKey(a.path.points[a.path.points.length - 1])
    && Math.min(a.index, b.index) === 0 && Math.max(a.index, b.index) === a.path.points.length - 2);
}

function visualAttachmentOwnsIntersection(
  source: CampusPath,
  sourceSegmentIndex: number,
  target: CampusPath,
  point: { x: number; y: number },
): boolean {
  return (source.visualAttachments ?? []).some((attachment) => {
    if (attachment.targetPathId !== target.id) return false;
    const sourcePoint = source.points[attachment.pointIndex];
    if (!sourcePoint || Math.hypot(sourcePoint.x - point.x, sourcePoint.y - point.y) > 0.002) return false;
    if (attachment.pointIndex !== sourceSegmentIndex && attachment.pointIndex !== sourceSegmentIndex + 1) return false;
    // Visual attachments are deliberately non-navigable. Their target segment
    // index and fraction can become stale when the target Pathway is split or
    // gains vertices, but the persisted source point + target path identity
    // still marks this exact endpoint contact as visual-only. Requiring the
    // old segment index here would silently promote legacy visual joins into
    // physical navigation junctions after an otherwise unrelated edit.
    return true;
  });
}

/**
 * Compile intersections only where pathway ownership establishes a shared
 * physical network. Visual-only attachments, explicitly disconnected points,
 * different authored elevations, and paths without navigation ownership stay
 * separate. The compiler adds graph topology without changing CampusPath
 * centerline geometry.
 */
function reconcilePathwayIntersections(
  campus: Campus,
  paths: CampusPath[],
  pathNodeIds: Map<string, string[]>,
  previousIntersectionNodes: NavigationNode[],
  previousIntersectionEdges: NavigationEdge[],
  makeId: PathwayIdFactory,
): Campus {
  const eligiblePaths = paths.filter((path) => Boolean(path.pathNetworkId && validVertexIds(path)));
  const segments: ReconciledPathSegment[] = [];
  for (const path of eligiblePaths) {
    const vertexIds = validVertexIds(path);
    const nodeIds = pathNodeIds.get(path.id);
    if (!vertexIds || !nodeIds) continue;
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const startVertexId = vertexIds[index];
      const endVertexId = vertexIds[index + 1];
      const startNodeId = nodeIds[index];
      const endNodeId = nodeIds[index + 1];
      if (!startVertexId || !endVertexId || !startNodeId || !endNodeId || startNodeId === endNodeId) continue;
      segments.push({
        path,
        index,
        ref: { pathId: path.id, startVertexId, endVertexId },
        key: `${path.id}:${startVertexId}:${endVertexId}`,
        startNodeId,
        endNodeId,
        start: path.points[index],
        end: path.points[index + 1],
      });
    }
  }

  const groups = new Map<string, PathIntersectionGroup>();
  // Sort by the horizontal extent first so ordinary campus maps compare only
  // nearby segments. This reconciliation also runs while editing geometry, so
  // a full segment-pair scan on every pointer update would be needlessly costly.
  const bounds = segments.map((segment) => ({
    segment,
    minX: Math.min(segment.start.x, segment.end.x),
    maxX: Math.max(segment.start.x, segment.end.x),
    minY: Math.min(segment.start.y, segment.end.y),
    maxY: Math.max(segment.start.y, segment.end.y),
  })).sort((a, b) => a.minX - b.minX || a.minY - b.minY || a.segment.key.localeCompare(b.segment.key));
  let active: typeof bounds = [];
  for (const current of bounds) {
    active = active.filter((candidate) => candidate.maxX >= current.minX - 1e-8);
    for (const candidate of active) {
      if (candidate.maxY < current.minY - 1e-8 || current.maxY < candidate.minY - 1e-8) continue;
      const left = candidate.segment;
      const right = current.segment;
      if (left.path.pathNetworkId !== right.path.pathNetworkId) continue;
      if (left.path.elevation !== right.path.elevation) continue;
      if (adjacentSegments(left, right)) continue;
      const hit = lineSegmentIntersection(left.start, left.end, right.start, right.end);
      if (!hit) continue;
      const point = { x: Number(hit.point.x.toFixed(6)), y: Number(hit.point.y.toFixed(6)) };
      if (pathPointIsDisconnected(left.path, point) || pathPointIsDisconnected(right.path, point)) continue;
      if (visualAttachmentOwnsIntersection(left.path, left.index, right.path, point)
        || visualAttachmentOwnsIntersection(right.path, right.index, left.path, point)) continue;

      const leftEndpoint = hit.t <= 1e-8 ? left.startNodeId : hit.t >= 1 - 1e-8 ? left.endNodeId : undefined;
      const rightEndpoint = hit.u <= 1e-8 ? right.startNodeId : hit.u >= 1 - 1e-8 ? right.endNodeId : undefined;
      // Existing endpoint-to-endpoint topology is already canonicalized by
      // reconcilePathwayNavigation; it needs no derived split records.
      if (leftEndpoint && rightEndpoint && leftEndpoint === rightEndpoint) continue;

      const key = `${left.path.pathNetworkId}:${pointKey(point)}`;
      const group = groups.get(key) ?? { networkId: left.path.pathNetworkId!, point, hits: new Map<string, SegmentHit>() };
      group.hits.set(left.key, { segment: left, t: hit.t });
      group.hits.set(right.key, { segment: right, t: hit.u });
      groups.set(key, group);
    }
    active.push(current);
  }

  if (groups.size === 0) return campus;
  const nodes = [...(campus.navNodes ?? [])];
  const edges = [...(campus.navEdges ?? [])];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const previousNodeById = new Map(previousIntersectionNodes.map((node) => [node.id, node]));
  const previousEdgeByKey = new Map<string, NavigationEdge>();
  for (const edge of previousIntersectionEdges) {
    for (const ref of edge.generatedFromPathIntersectionSegments ?? []) previousEdgeByKey.set(intersectionEdgeRefKey(ref), edge);
  }
  const cutsBySegment = new Map<string, { segment: ReconciledPathSegment; cuts: Map<string, { t: number; nodeId: string }> }>();
  const pathById = new Map(paths.map((path) => [path.id, path]));

  for (const [groupKey, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const hits = [...group.hits.values()];
    const refs = Array.from(new Map(hits.map(({ segment }) => [segmentRefKey(segment.ref), segment.ref])).values())
      .sort((a, b) => segmentRefKey(a).localeCompare(segmentRefKey(b)));
    const refsKey = intersectionNodeRefsKey(refs);
    const endpointIds = Array.from(new Set(hits.flatMap(({ segment, t }) =>
      t <= 1e-8 ? [segment.startNodeId] : t >= 1 - 1e-8 ? [segment.endNodeId] : [],
    )));
    let junction = endpointIds
      .map((id) => nodeById.get(id))
      .find((node): node is NavigationNode => Boolean(node && Math.hypot(node.x - group.point.x, node.y - group.point.y) <= 0.01));

    // A vertex already owned by another member of the same explicitly joined
    // network is a legitimate canonical endpoint. Manual nodes are never
    // claimed through coordinate proximity.
    if (!junction) {
      junction = nodes.find((node) => {
        if (!node.generatedFromPathVertices?.length || pointKey(node) !== pointKey(group.point)) return false;
        return node.generatedFromPathVertices.some((ref) => pathById.get(ref.pathId)?.pathNetworkId === group.networkId);
      });
    }

    let isGeneratedIntersectionNode = false;
    if (!junction) {
      const reusable = previousIntersectionNodes.find((node) => {
        const priorRefs = node.generatedFromPathIntersections ?? [];
        const hasStableSegment = priorRefs.some((prior) => refs.some((current) => segmentRefKey(prior) === segmentRefKey(current)));
        const hasSameNetworkOwner = priorRefs.some((prior) => pathById.get(prior.pathId)?.pathNetworkId === group.networkId);
        return hasStableSegment || (hasSameNetworkOwner && Math.hypot(node.x - group.point.x, node.y - group.point.y) <= 0.01);
      });
      if (reusable) {
        junction = {
          ...reusable,
          x: group.point.x,
          y: group.point.y,
          generatedFromPathIntersections: refs,
        };
        isGeneratedIntersectionNode = true;
      } else {
        junction = {
          ...createNavNode({
            id: makeId("nn"),
            x: group.point.x,
            y: group.point.y,
            campusId: campus.id,
            name: "Path Junction",
            type: "outdoor",
            color: "#16a34a",
          }),
          x: group.point.x,
          y: group.point.y,
          generatedFromPathIntersections: refs,
        };
        isGeneratedIntersectionNode = true;
      }
      nodeById.set(junction.id, junction);
      const index = nodes.findIndex((node) => node.id === junction!.id);
      if (index < 0) nodes.push(junction);
      else nodes[index] = junction;
    }

    const junctionKey = isGeneratedIntersectionNode ? `intersection:${refsKey}` : `node:${junction.id}`;
    for (const { segment, t } of hits) {
      const nearStart = t <= 1e-8;
      const nearEnd = t >= 1 - 1e-8;
      const nodeId = nearStart ? segment.startNodeId : nearEnd ? segment.endNodeId : junction.id;
      const key = nearStart ? `node:${segment.startNodeId}` : nearEnd ? `node:${segment.endNodeId}` : junctionKey;
      const record = cutsBySegment.get(segment.key) ?? { segment, cuts: new Map<string, { t: number; nodeId: string }>() };
      record.cuts.set(key, { t: nearStart ? 0 : nearEnd ? 1 : t, nodeId });
      cutsBySegment.set(segment.key, record);
    }
    // A stale compiler-created node may have an explicit manual edge. Keep it
    // as an ordinary user-owned node even if the physical crossing is gone.
    const prior = previousNodeById.get(junction.id);
    if (prior && !isGeneratedIntersectionNode && !junction.generatedFromPathIntersections) {
      const index = nodes.findIndex((node) => node.id === junction!.id);
      if (index >= 0) nodes[index] = junction;
    }
  }

  for (const { segment, cuts } of cutsBySegment.values()) {
    const interior = [...cuts.values()].filter((cut) => cut.t > 1e-8 && cut.t < 1 - 1e-8);
    if (interior.length === 0) continue;
    const parent = edges.find((edge) =>
      edge.type !== "entrance_transition" && edge.type !== "floor_transition" && edge.type !== "cross_floor"
      && ((edge.startNodeId === segment.startNodeId && edge.endNodeId === segment.endNodeId)
        || (edge.startNodeId === segment.endNodeId && edge.endNodeId === segment.startNodeId))
      && (edge.generatedFromPathIds?.includes(segment.path.id)
        || !edges.some((candidate) => candidate.generatedFromPathIds?.includes(segment.path.id)
          && ((candidate.startNodeId === segment.startNodeId && candidate.endNodeId === segment.endNodeId)
            || (candidate.startNodeId === segment.endNodeId && candidate.endNodeId === segment.startNodeId)))),
    );
    if (!parent || parent.bendPoints?.length) continue;
    const startIsParentStart = parent.startNodeId === segment.startNodeId;
    const orderedCuts = [...interior].sort((a, b) => startIsParentStart ? a.t - b.t : b.t - a.t);
    const points = startIsParentStart
      ? [{ nodeId: parent.startNodeId, t: 0, key: `node:${parent.startNodeId}` }, ...orderedCuts.map((cut) => ({ nodeId: cut.nodeId, t: cut.t, key: [...cuts.entries()].find(([, value]) => value === cut)?.[0] ?? `node:${cut.nodeId}` })), { nodeId: parent.endNodeId, t: 1, key: `node:${parent.endNodeId}` }]
      : [{ nodeId: parent.startNodeId, t: 1, key: `node:${parent.startNodeId}` }, ...orderedCuts.map((cut) => ({ nodeId: cut.nodeId, t: cut.t, key: [...cuts.entries()].find(([, value]) => value === cut)?.[0] ?? `node:${cut.nodeId}` })), { nodeId: parent.endNodeId, t: 0, key: `node:${parent.endNodeId}` }];
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      if (from.nodeId === to.nodeId) continue;
      const ref: GeneratedPathIntersectionEdgeRef = {
        ...segment.ref,
        fromJunctionKey: from.key,
        toJunctionKey: to.key,
      };
      const cached = previousEdgeByKey.get(intersectionEdgeRefKey(ref));
      const lengthFraction = Math.abs(to.t - from.t);
      const edge: NavigationEdge = {
        ...parent,
        id: cached?.id ?? makeId("ne"),
        startNodeId: from.nodeId,
        endNodeId: to.nodeId,
        distance: Math.max(0.001, parent.distance * lengthFraction),
        generatedFromPathIds: [...new Set([...(parent.generatedFromPathIds ?? []), segment.path.id])],
        generatedFromPathIntersectionSegments: [ref],
      };
      // Keep the source segment and its compiled branches as separate graph
      // edges. This preserves the original stable edge ID and gives the new
      // junction a cost-neutral, direction-safe path through the same surface.
      edges.push(edge);
    }
  }

  return { ...campus, navNodes: nodes, navEdges: edges };
}

/**
 * Collapse only duplicate objects that carry the same explicit pathway-vertex
 * reference. Unowned/manual nodes are never considered, even when they share
 * coordinates with a pathway. The closest proven copy becomes canonical so a
 * previously buggy drag can be repaired without a coordinate-wide delete.
 */
function collapseDuplicateOwnedObjects(
  nodes: NavigationNode[],
  edges: NavigationEdge[],
  paths: CampusPath[],
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const collapseGeneratedEdgeCopies = (input: NavigationEdge[]): NavigationEdge[] => {
    const canonicalByOwnerPair = new Map<string, string>();
    const mergedOwners = new Map<string, Set<string>>();
    const removed = new Set<string>();
    for (const edge of input) {
      const owners = edge.generatedFromPathIds ?? [];
      if (owners.length === 0) continue;
      const pair = [edge.startNodeId, edge.endNodeId].sort().join("::");
      const ownerSet = mergedOwners.get(edge.id) ?? new Set(owners);
      mergedOwners.set(edge.id, ownerSet);
      const canonicalId = owners
        .map((pathId) => canonicalByOwnerPair.get(`${pair}::${pathId}`))
        .find((candidate) => candidate && candidate !== edge.id);
      if (canonicalId) {
        removed.add(edge.id);
        for (const pathId of owners) mergedOwners.get(canonicalId)?.add(pathId);
      } else {
        for (const pathId of owners) canonicalByOwnerPair.set(`${pair}::${pathId}`, edge.id);
      }
    }
    return input
      .filter((edge) => !removed.has(edge.id))
      .map((edge) => {
        const owners = mergedOwners.get(edge.id);
        return owners && owners.size !== (edge.generatedFromPathIds?.length ?? 0)
          ? { ...edge, generatedFromPathIds: [...owners] }
          : edge;
      });
  };
  const candidatesByRef = new Map<string, { node: NavigationNode; index: number }[]>();
  for (const [index, node] of nodes.entries()) {
    for (const ref of node.generatedFromPathVertices ?? []) {
      const key = refKey(ref);
      candidatesByRef.set(key, [...(candidatesByRef.get(key) ?? []), { node, index }]);
    }
  }

  const canonicalByRef = new Map<string, string>();
  for (const path of paths) {
    const vertexIds = validVertexIds(path);
    if (!vertexIds) continue;
    vertexIds.forEach((vertexId, index) => {
      const key = refKey({ pathId: path.id, vertexId });
      const candidates = candidatesByRef.get(key) ?? [];
      if (candidates.length < 2) return;
      const point = path.points[index];
      const canonical = candidates.slice().sort((a, b) => {
        const da = Math.hypot(a.node.x - point.x, a.node.y - point.y);
        const db = Math.hypot(b.node.x - point.x, b.node.y - point.y);
        return da - db || a.index - b.index;
      })[0];
      if (canonical) canonicalByRef.set(key, canonical.node.id);
    });
  }

  if (canonicalByRef.size === 0) return { nodes, edges: collapseGeneratedEdgeCopies(edges) };
  const nodeRewire = new Map<string, string>();
  const dedupedNodes: NavigationNode[] = [];
  for (const node of nodes) {
    const refs = node.generatedFromPathVertices ?? [];
    const duplicateRefs = refs.filter((ref) => {
      const canonical = canonicalByRef.get(refKey(ref));
      return Boolean(canonical && canonical !== node.id);
    });
    if (duplicateRefs.length === 0) {
      dedupedNodes.push(node);
      continue;
    }
    const targets = new Set(duplicateRefs.map((ref) => canonicalByRef.get(refKey(ref))!));
    const remainingRefs = refs.filter((ref) => !duplicateRefs.some((duplicate) => refKey(duplicate) === refKey(ref)));
    if (remainingRefs.length === 0 && targets.size === 1) {
      nodeRewire.set(node.id, [...targets][0]);
      continue;
    }
    if (remainingRefs.length > 0) {
      dedupedNodes.push({ ...node, generatedFromPathVertices: remainingRefs });
    } else {
      const { generatedFromPathVertices: _removed, ...withoutOwnership } = node;
      dedupedNodes.push(withoutOwnership);
    }
  }

  if (nodeRewire.size === 0) return { nodes: dedupedNodes, edges: collapseGeneratedEdgeCopies(edges) };
  const edgeByPair = new Map<string, NavigationEdge>();
  for (const edge of edges) {
    const startNodeId = nodeRewire.get(edge.startNodeId) ?? edge.startNodeId;
    const endNodeId = nodeRewire.get(edge.endNodeId) ?? edge.endNodeId;
    if (isSelfEdge(startNodeId, endNodeId)) continue;
    const remapped = startNodeId === edge.startNodeId && endNodeId === edge.endNodeId
      ? edge
      : { ...edge, startNodeId, endNodeId };
    const pair = [startNodeId, endNodeId].sort().join("::");
    const existing = edgeByPair.get(pair);
    if (!existing) {
      edgeByPair.set(pair, remapped);
      continue;
    }
    // Keep a manual edge manual. Merge provenance only when both copies are
    // explicitly generated; this never claims an unowned edge.
    if (existing.generatedFromPathIds?.length && remapped.generatedFromPathIds?.length) {
      edgeByPair.set(pair, {
        ...existing,
        generatedFromPathIds: [...new Set([...existing.generatedFromPathIds, ...remapped.generatedFromPathIds])],
      });
    } else if (!existing.generatedFromPathIds?.length && remapped.generatedFromPathIds?.length) {
      edgeByPair.set(pair, existing);
    }
  }
  return { nodes: dedupedNodes, edges: collapseGeneratedEdgeCopies([...edgeByPair.values()]) };
}

/**
 * Collapse generated nodes that represent the same explicit physical
 * junction.  A coordinate match is only eligible when every reference is a
 * valid persisted Pathway vertex, no owner has explicitly disconnected that
 * junction, and the topology is unambiguous (same editor network, or shared
 * endpoints).  Manual/linked nodes are never considered.
 */
function collapseSharedGeneratedJunctions(
  nodes: NavigationNode[],
  edges: NavigationEdge[],
  paths: CampusPath[],
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const pathById = new Map(paths.map((path) => [path.id, path]));
  const grouped = new Map<string, NavigationNode[]>();
  for (const node of nodes) {
    if (!(node.generatedFromPathVertices?.length)) continue;
    grouped.set(pointKey(node), [...(grouped.get(pointKey(node)) ?? []), node]);
  }
  const rewire = new Map<string, string>();
  const merged = new Map<string, NavigationNode>();

  for (const candidates of grouped.values()) {
    if (candidates.length < 2) continue;
    const refs = candidates.flatMap((node) => node.generatedFromPathVertices ?? []);
    const uniqueRefs = Array.from(new Map(refs.map((ref) => [refKey(ref), ref])).values());
    const ownerPaths = uniqueRefs.map((ref) => pathById.get(ref.pathId));
    if (ownerPaths.some((path) => !path)) continue;
    if (new Set(uniqueRefs.map((ref) => ref.pathId)).size !== uniqueRefs.length) continue;
    if (uniqueRefs.some((ref) => {
      const path = pathById.get(ref.pathId);
      const index = path ? validVertexIds(path)?.indexOf(ref.vertexId) ?? -1 : -1;
      const point = index >= 0 ? path?.points[index] : undefined;
      return !point || pointKey(point) !== pointKey(candidates[0]) || pathPointIsDisconnected(path, point);
    })) continue;
    const sameNetwork = new Set(ownerPaths.map((path) => path?.pathNetworkId).filter(Boolean)).size === 1
      && ownerPaths.every((path) => Boolean(path?.pathNetworkId));
    const endpointOnly = uniqueRefs.every((ref) => {
      const path = pathById.get(ref.pathId);
      const index = path ? validVertexIds(path)?.indexOf(ref.vertexId) ?? -1 : -1;
      return index === 0 || index === (path?.points.length ?? 0) - 1;
    });
    if (!sameNetwork && !endpointOnly) continue;

    const canonical = candidates[0];
    const mergedRefs = uniqueRefs;
    merged.set(canonical.id, { ...canonical, generatedFromPathVertices: mergedRefs });
    for (const duplicate of candidates.slice(1)) rewire.set(duplicate.id, canonical.id);
  }
  if (rewire.size === 0) return { nodes, edges };

  const nextNodes = nodes
    .filter((node) => !rewire.has(node.id))
    .map((node) => merged.get(node.id) ?? node);
  const nextEdges: NavigationEdge[] = [];
  for (const edge of edges) {
    const startNodeId = rewire.get(edge.startNodeId) ?? edge.startNodeId;
    const endNodeId = rewire.get(edge.endNodeId) ?? edge.endNodeId;
    if (isSelfEdge(startNodeId, endNodeId)) continue;
    const remapped = startNodeId === edge.startNodeId && endNodeId === edge.endNodeId
      ? edge
      : { ...edge, startNodeId, endNodeId };
    const pair = [startNodeId, endNodeId].sort().join("::");
    // Manual edges are independent authored objects; preserve parallel manual
    // connections even when a generated junction rewire gives them the same
    // endpoint pair.
    if (!remapped.generatedFromPathIds?.length) {
      nextEdges.push(remapped);
      continue;
    }
    const existingIndex = nextEdges.findIndex((candidate) =>
      candidate.generatedFromPathIds?.length
      && [candidate.startNodeId, candidate.endNodeId].sort().join("::") === pair
    );
    const existing = existingIndex >= 0 ? nextEdges[existingIndex] : undefined;
    if (!existing) {
      nextEdges.push(remapped);
      continue;
    }
    if (existing.generatedFromPathIds?.length && remapped.generatedFromPathIds?.length) {
      nextEdges[existingIndex] = {
        ...existing,
        generatedFromPathIds: [...new Set([
          ...existing.generatedFromPathIds,
          ...remapped.generatedFromPathIds,
        ])],
      };
    }
  }
  return { nodes: nextNodes, edges: nextEdges };
}

/**
 * Reconciles only navigation objects carrying explicit pathway provenance.
 * Manual points, entrance nodes, linked indoor nodes, and manual edges are
 * never claimed by coordinate proximity and are never removed by this pass.
 */
export interface PathwayReconciliationOptions extends EntranceOutdoorReconciliationOptions {}

/**
 * Remove only the graph objects that depended on physical Pathways which were
 * actually deleted.  This is intentionally separate from ordinary Pathway
 * reconciliation: a preserved Pathway edit may keep an authored connector
 * aimed at the same generated vertex, while a delete must never leave that
 * connector pointing at a vanished physical owner.
 *
 * Ownership is resolved exclusively from generatedFromPathVertices,
 * generatedFromPathIds, and the explicit path-junction metadata.  Manual
 * Walking Points and their authored edges are untouched unless they would
 * otherwise reference a node that is being removed.
 */
export function cleanupDeletedPathwayNavigation(previous: Campus, next: Campus): Campus {
  const currentPathIds = new Set((next.paths ?? []).map((path) => path.id));
  const deletedPathIds = new Set(
    (previous.paths ?? []).map((path) => path.id).filter((pathId) => !currentPathIds.has(pathId)),
  );
  if (deletedPathIds.size === 0) return next;

  const sourceNodes = previous.navNodes ?? next.navNodes ?? [];
  const sourceEdges = previous.navEdges ?? next.navEdges ?? [];
  const deletedOnlyGeneratedNodeIds = new Set<string>();

  for (const node of sourceNodes) {
    const refs = node.generatedFromPathVertices ?? [];
    if (refs.length === 0) continue;
    const liveRefs = refs.filter((ref) => !deletedPathIds.has(ref.pathId));
    if (liveRefs.length === 0) deletedOnlyGeneratedNodeIds.add(node.id);
  }

  // Any explicit path-junction metadata attached to an edge incident to a
  // deleted generated vertex identifies a connector-owned helper.  It is a
  // local ownership signal, not a coordinate/proximity guess.
  const candidateJunctionIds = new Set<string>();
  for (const edge of sourceEdges) {
    const touchesDeletedGeneratedNode = deletedOnlyGeneratedNodeIds.has(edge.startNodeId)
      || deletedOnlyGeneratedNodeIds.has(edge.endNodeId);
    if (!touchesDeletedGeneratedNode) continue;
    if (edge.pathJunctionId) candidateJunctionIds.add(edge.pathJunctionId);
    for (const junctionId of edge.pathJunctionIds ?? []) candidateJunctionIds.add(junctionId);
    for (const endpointId of [edge.startNodeId, edge.endNodeId]) {
      const endpoint = sourceNodes.find((node) => node.id === endpointId);
      if (endpoint?.pathJunction) candidateJunctionIds.add(endpoint.id);
    }
  }

  const nextNodes = (next.navNodes ?? sourceNodes)
    .map((node) => {
      const refs = node.generatedFromPathVertices ?? [];
      if (refs.length === 0) return node;
      const liveRefs = refs.filter((ref) => !deletedPathIds.has(ref.pathId));
      if (liveRefs.length === refs.length) return node;
      if (liveRefs.length > 0) return { ...node, generatedFromPathVertices: liveRefs };
      return null;
    })
    .filter((node): node is NavigationNode => Boolean(node));

  const removedNodeIds = new Set(deletedOnlyGeneratedNodeIds);
  const nextEdges = (next.navEdges ?? sourceEdges)
    .map((edge) => {
      const owners = edge.generatedFromPathIds ?? [];
      if (owners.length === 0) return edge;
      const liveOwners = owners.filter((pathId) => !deletedPathIds.has(pathId));
      if (liveOwners.length === 0) {
        return null;
      }
      return liveOwners.length === owners.length
        ? edge
        : { ...edge, generatedFromPathIds: liveOwners };
    })
    .filter((edge): edge is NavigationEdge => Boolean(edge))
    .filter((edge) => {
      const touchesRemovedNode = removedNodeIds.has(edge.startNodeId) || removedNodeIds.has(edge.endNodeId);
      if (touchesRemovedNode) {
        return false;
      }
      return true;
    });

  // A Pathway deletion can remove one leg of a connector-owned junction.  A
  // surviving degree-2/shared junction remains useful; an explicitly marked
  // helper with zero or one surviving incident edge does not.  Iterate so a
  // short chain of helpers is cleaned up without touching ordinary authored
  // Walking Points.
  let edges = nextEdges;
  let nodes = nextNodes;
  let changed = true;
  while (changed) {
    changed = false;
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.startNodeId, (degree.get(edge.startNodeId) ?? 0) + 1);
      degree.set(edge.endNodeId, (degree.get(edge.endNodeId) ?? 0) + 1);
    }
    const orphanJunctionIds = new Set(
      [...candidateJunctionIds].filter((id) => {
        const node = nodes.find((candidate) => candidate.id === id);
        // Older connector records may carry the explicit edge metadata but
        // lack the node flag.  The metadata is still authoritative ownership
        // for this local cleanup; ordinary Walking Points are not candidates.
        return Boolean(node && (node.pathJunction || candidateJunctionIds.has(id)) && (degree.get(id) ?? 0) <= 1);
      }),
    );
    if (orphanJunctionIds.size === 0) break;
    changed = true;
    for (const id of orphanJunctionIds) removedNodeIds.add(id);
    nodes = nodes.filter((node) => !orphanJunctionIds.has(node.id));
    edges = edges.filter((edge) => !orphanJunctionIds.has(edge.startNodeId) && !orphanJunctionIds.has(edge.endNodeId));
  }

  // Strip references to helpers that were removed while retaining all
  // metadata for genuinely shared surviving junctions.
  edges = edges.map((edge) => {
    const junctionIds = (edge.pathJunctionIds ?? []).filter((id) => !removedNodeIds.has(id));
    const clean = { ...edge };
    if (clean.pathJunctionId && removedNodeIds.has(clean.pathJunctionId)) delete clean.pathJunctionId;
    if (junctionIds.length > 0) clean.pathJunctionIds = junctionIds;
    else delete clean.pathJunctionIds;
    if (clean.pathJunctionId === undefined) delete clean.pathJunctionParent;
    return clean;
  });

  const finalReferencedNodeIds = new Set(edges.flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
  nodes = nodes.filter((node) => !removedNodeIds.has(node.id) || finalReferencedNodeIds.has(node.id));
  return {
    ...next,
    navNodes: nodes,
    navEdges: edges,
  };
}

export function reconcilePathwayNavigation(
  campus: Campus,
  makeId: PathwayIdFactory,
  options: PathwayReconciliationOptions = {},
): Campus {
  const paths = campus.paths ?? [];
  // Keep the pre-reconciliation identity sets so an Entrance bridge to a
  // generated target can be removed when that target's physical vertex is
  // structurally deleted. A generated node may otherwise be conservatively
  // retained as an unowned node because an authored edge still references it.
  const originalNodes = campus.navNodes ?? [];
  const originalEdges = campus.navEdges ?? [];
  const originalEntranceNodeIds = new Set(originalNodes.filter((node) => node.entranceId && !node.floorId).map((node) => node.id));
  const originalGeneratedNodeIds = new Set(originalNodes.filter((node) => node.generatedFromPathVertices?.length).map((node) => node.id));
  const previousIntersectionNodes = originalNodes.filter((node) => node.generatedFromPathIntersections?.length);
  const previousIntersectionNodeIds = new Set(previousIntersectionNodes.map((node) => node.id));
  const previousIntersectionEdges = originalEdges.filter((edge) => edge.generatedFromPathIntersectionSegments?.length);
  const externalIntersectionReferences = new Set(originalEdges
    .filter((edge) => !edge.generatedFromPathIntersectionSegments?.length)
    .flatMap((edge) => [edge.startNodeId, edge.endNodeId])
    .filter((nodeId) => previousIntersectionNodeIds.has(nodeId)));
  const baseNodes = originalNodes
    .filter((node) => !previousIntersectionNodeIds.has(node.id))
    .concat(previousIntersectionNodes
      .filter((node) => externalIntersectionReferences.has(node.id))
      .map((node) => {
        const { generatedFromPathIntersections: _derived, ...manualNode } = node;
        return manualNode;
      }));
  const baseEdges = originalEdges.filter((edge) => !edge.generatedFromPathIntersectionSegments?.length);
  const collapsed = collapseDuplicateOwnedObjects(
    [...baseNodes],
    [...baseEdges],
    paths,
  );
  const sharedCollapsed = collapseSharedGeneratedJunctions(collapsed.nodes, collapsed.edges, paths);
  let nodes = sharedCollapsed.nodes;
  let edges = sharedCollapsed.edges;
  const pathById = new Map(paths.map((path) => [path.id, path]));
  const pathNodeIds = new Map<string, string[]>();

  for (const path of paths) {
    const vertexIds = validVertexIds(path);
    if (!vertexIds || path.points.length === 0) continue;
    const nodeIds: string[] = [];
    for (let index = 0; index < path.points.length; index += 1) {
      const point = path.points[index];
      const ref = { pathId: path.id, vertexId: vertexIds[index] };
      let nodeIndex = nodes.findIndex((node) =>
        node.generatedFromPathVertices?.some((candidate) => refKey(candidate) === refKey(ref))
      );
      // A shared junction can stop being shared when one physical pathway is
      // moved or a vertex is reshaped. A node owned only by this vertex is
      // updated in place; only a genuinely shared node detaches this pathway's
      // reference so the other pathway keeps its original junction node.
      const currentNode = nodeIndex >= 0 ? nodes[nodeIndex] : undefined;
      const hasOtherOwner = Boolean(currentNode?.generatedFromPathVertices?.some((candidate) => refKey(candidate) !== refKey(ref)));
      // When a proxy drag moves every physical vertex represented by a shared
      // canonical node, all of its explicit owners arrive at the same new
      // coordinate in this reconciliation pass. Treat that as one junction
      // translation and keep the shared node/provenance intact; detaching on
      // the first pathway would otherwise manufacture a replacement node and
      // leave the old canonical node behind.
      const sharedOwnersRemainTogether = Boolean(currentNode && hasOtherOwner &&
        (currentNode.generatedFromPathVertices ?? []).every((candidate) => {
          const ownerPath = pathById.get(candidate.pathId);
          const ownerPoint = refPoint(pathById, candidate);
          return Boolean(ownerPath && ownerPoint && !pathPointIsDisconnected(ownerPath, ownerPoint) && pointKey(ownerPoint) === pointKey(point));
        }));
      const hasDisconnectedSharedRef = Boolean(currentNode && pathPointIsDisconnected(path, point) &&
        currentNode.generatedFromPathVertices?.some((candidate) => {
          if (refKey(candidate) === refKey(ref)) return false;
          const ownerPath = pathById.get(candidate.pathId);
          const ownerPoint = refPoint(pathById, candidate);
          return Boolean(ownerPath && ownerPath.id !== path.id && ownerPoint && pointKey(ownerPoint) === pointKey(point));
        }));
      if (nodeIndex >= 0 && ((hasOtherOwner && pointKey(nodes[nodeIndex]) !== pointKey(point) && !sharedOwnersRemainTogether) || hasDisconnectedSharedRef)) {
        const current = nodes[nodeIndex];
        const remaining = (current.generatedFromPathVertices ?? []).filter((candidate) => refKey(candidate) !== refKey(ref));
        nodes[nodeIndex] = remaining.length > 0
          ? { ...current, generatedFromPathVertices: remaining }
          : (() => {
              const { generatedFromPathVertices: _removed, ...withoutOwnership } = current;
              return withoutOwnership;
            })();
        nodeIndex = -1;
      }
      // A generated junction may be shared by several physical pathways. Only
      // reuse a node that already has explicit generated provenance; an
      // unowned/manual/entrance node is never claimed by proximity.
      if (nodeIndex < 0) {
        nodeIndex = nodes.findIndex((node) =>
          node.type === "outdoor" && !node.floorId &&
          (node.generatedFromPathVertices?.length ?? 0) > 0 &&
          pointKey(node) === pointKey(point) &&
          !pathPointIsDisconnected(path, point) &&
          canShareGeneratedNode(node, point, pathById)
        );
      }
      if (nodeIndex < 0) {
        const created = createNavNode({
          id: makeId("nn"), x: point.x, y: point.y, campusId: campus.id,
          name: "Walking Point", type: "outdoor", color: "#16a34a",
        });
        nodes.push({ ...created, generatedFromPathVertices: [ref] });
        nodeIndex = nodes.length - 1;
      } else {
        const current = nodes[nodeIndex];
        nodes[nodeIndex] = {
          ...addNodeRef(current, ref),
          x: Math.round(point.x),
          y: Math.round(point.y),
        };
      }
      nodeIds.push(nodes[nodeIndex].id);
    }
    pathNodeIds.set(path.id, nodeIds);

    for (let index = 0; index < nodeIds.length - 1; index += 1) {
      const startNodeId = nodeIds[index];
      const endNodeId = nodeIds[index + 1];
      if (!startNodeId || !endNodeId || isSelfEdge(startNodeId, endNodeId)) continue;
      const existing = edges.find((edge) =>
        (edge.startNodeId === startNodeId && edge.endNodeId === endNodeId) ||
        (edge.startNodeId === endNodeId && edge.endNodeId === startNodeId)
      );
      if (existing) {
        const existingIndex = edges.findIndex((edge) => edge.id === existing.id);
        if (existing.generatedFromPathIds?.includes(path.id)) {
          const distance = Math.round(Math.hypot(
            (nodes.find((node) => node.id === existing.startNodeId)?.x ?? 0) - (nodes.find((node) => node.id === existing.endNodeId)?.x ?? 0),
            (nodes.find((node) => node.id === existing.startNodeId)?.y ?? 0) - (nodes.find((node) => node.id === existing.endNodeId)?.y ?? 0),
          ));
          edges[existingIndex] = { ...existing, distance };
        } else if (existing.generatedFromPathIds?.length) {
          edges[existingIndex] = { ...existing, generatedFromPathIds: [...new Set([...existing.generatedFromPathIds, path.id])] };
        }
        // An unowned duplicate edge is intentionally left manual.
        continue;
      }
      const created = createNavEdge({ id: makeId("ne"), startNodeId, endNodeId, nodes });
      edges.push({ ...created, generatedFromPathIds: [path.id] });
    }
  }

  // Remove stale ownership from edges first. Shared generated edges survive as
  // long as at least one owning pathway still references that node pair.
  edges = edges.flatMap((edge) => {
    if (!edge.generatedFromPathIds?.length) return [edge];
    const validOwners = edge.generatedFromPathIds.filter((pathId) => {
      const path = pathById.get(pathId);
      const ids = path ? pathNodeIds.get(pathId) : undefined;
      return Boolean(path && ids && pathPairExists(ids, edge));
    });
    if (validOwners.length === 0) return [];
    const start = nodes.find((node) => node.id === edge.startNodeId);
    const end = nodes.find((node) => node.id === edge.endNodeId);
    return [{
      ...edge,
      generatedFromPathIds: validOwners,
      bendPoints: undefined,
      ...(start && end ? { distance: Math.round(Math.hypot(end.x - start.x, end.y - start.y)) } : {}),
    }];
  });

  // Remove stale Entrance bridges before deciding which formerly generated
  // nodes are still referenced. Otherwise the bridge itself would keep a
  // deleted generated target alive as an unowned manual node.
  const currentNodesBeforeCleanup = new Map(nodes.map((node) => [node.id, node]));
  edges = edges.filter((edge) => {
    if (edge.type === "entrance_transition") return true;
    const entranceId = originalEntranceNodeIds.has(edge.startNodeId)
      ? edge.startNodeId
      : originalEntranceNodeIds.has(edge.endNodeId)
        ? edge.endNodeId
        : undefined;
    if (!entranceId) return true;
    const targetId = edge.startNodeId === entranceId ? edge.endNodeId : edge.startNodeId;
    const target = currentNodesBeforeCleanup.get(targetId);
    if (!target) return false;
    const targetStillGenerated = (target.generatedFromPathVertices ?? []).some((ref) => {
      const owner = pathById.get(ref.pathId);
      return Boolean(owner && validVertexIds(owner)?.includes(ref.vertexId));
    });
    // Physical Pathway edits/deletes are local graph mutations.  When the
    // caller explicitly preserves authored geometry, keep an Entrance edge
    // aimed at a formerly-generated vertex instead of retargeting/removing it
    // during this reconciliation pass.  The vertex cleanup below strips stale
    // provenance and keeps it as a manual canonical point while the edge still
    // references it.  The default hydration/reconciliation behavior retains
    // the historical stale-bridge cleanup for genuinely removed structure.
    return options.preserveAuthoredGeometry
      ? true
      : !(originalGeneratedNodeIds.has(targetId) && !targetStillGenerated);
  });

  const referencedNodeIds = new Set(edges.flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
  nodes = nodes.flatMap((node) => {
    if (!node.generatedFromPathVertices?.length) return [node];
    const validRefs = node.generatedFromPathVertices.filter((ref) => {
      const path = pathById.get(ref.pathId);
      return Boolean(path && validVertexIds(path)?.includes(ref.vertexId));
    });
    if (validRefs.length > 0) return [{ ...node, generatedFromPathVertices: validRefs }];
    // Preserve a formerly generated node if an independently-authored edge
    // still uses it; just remove the provenance so deletion cannot cascade
    // into manual graph data.
    if (referencedNodeIds.has(node.id)) {
      const { generatedFromPathVertices: _removed, ...manualNode } = node;
      return [manualNode];
    }
    return [];
  });

  // Pathway moves can move an Entrance's generated target without changing
  // the bridge IDs. Recompute only that bridge's bend geometry so it continues
  // to leave the building safely while preserving every other edge/object.
  const withIntersections = reconcilePathwayIntersections(
    { ...campus, navNodes: nodes, navEdges: edges },
    paths,
    pathNodeIds,
    previousIntersectionNodes,
    previousIntersectionEdges,
    makeId,
  );
  return reconcileEntranceOutdoorConnections(withIntersections, options);
}

/**
 * Explicitly join two physical Pathway vertices.  This is intentionally a
 * separate authoring operation: ordinary hydration/reconciliation never
 * claims a nearby vertex by coordinate proximity.  The target vertex's
 * generated node is canonical when it already exists; the source node (and
 * every authored edge incident to it) is rewired to that target only as the
 * direct consequence of this explicit drop gesture.
 */
export function joinPathwayVerticesExplicitly(
  campus: Campus,
  sourcePathId: string,
  sourcePointIndex: number,
  targetPathId: string,
  targetPointIndex: number,
  makeId: PathwayIdFactory,
): Campus {
  if (sourcePathId === targetPathId && sourcePointIndex === targetPointIndex) return campus;
  const sourcePath = (campus.paths ?? []).find((path) => path.id === sourcePathId);
  const targetPath = (campus.paths ?? []).find((path) => path.id === targetPathId);
  const sourceIds = sourcePath ? validVertexIds(sourcePath) : null;
  const targetIds = targetPath ? validVertexIds(targetPath) : null;
  if (!sourcePath || !targetPath || !sourceIds || !targetIds) return campus;
  const sourcePoint = sourcePath.points[sourcePointIndex];
  const targetPoint = targetPath.points[targetPointIndex];
  const sourceVertexId = sourceIds[sourcePointIndex];
  const targetVertexId = targetIds[targetPointIndex];
  if (!sourcePoint || !targetPoint || !sourceVertexId || !targetVertexId) return campus;
  if (pathPointIsDisconnected(sourcePath, sourcePoint) || pathPointIsDisconnected(targetPath, targetPoint)) return campus;

  const sourceRef = { pathId: sourcePathId, vertexId: sourceVertexId };
  const targetRef = { pathId: targetPathId, vertexId: targetVertexId };
  const nodes = [...(campus.navNodes ?? [])];
  const sourceNode = nodes.find((node) => node.generatedFromPathVertices?.some((ref) => refKey(ref) === refKey(sourceRef)));
  const targetNode = nodes.find((node) => node.generatedFromPathVertices?.some((ref) => refKey(ref) === refKey(targetRef)));

  // If the source is already a shared canonical node, all of its physical
  // owners move together. This is the same explicit shared-junction contract
  // used by the generated-point proxy drag; no coordinate scan is performed.
  const sourceRefs = sourceNode?.generatedFromPathVertices?.length
    ? sourceNode.generatedFromPathVertices
    : [sourceRef];
  const movedRefKeys = new Set(sourceRefs.map(refKey));
  const nextPaths = (campus.paths ?? []).map((path) => {
    let changed = false;
    const points = path.points.map((point, index) => {
      const vertexId = validVertexIds(path)?.[index];
      if (!vertexId || !movedRefKeys.has(refKey({ pathId: path.id, vertexId }))) return point;
      changed = true;
      return { x: targetPoint.x, y: targetPoint.y };
    });
    return changed ? { ...path, points } : path;
  });

  let nextNodes = nodes;
  let nextEdges = [...(campus.navEdges ?? [])];
  const survivingNodeId = targetNode?.id ?? sourceNode?.id;
  if (survivingNodeId) {
    const mergedRefs = Array.from(new Map([
      ...(targetNode?.generatedFromPathVertices ?? []),
      ...sourceRefs,
    ].map((ref) => [refKey(ref), ref])).values());
    nextNodes = nodes
      .filter((node) => !sourceNode || node.id !== sourceNode.id || node.id === survivingNodeId)
      .map((node) => node.id === survivingNodeId
        ? { ...node, x: targetPoint.x, y: targetPoint.y, generatedFromPathVertices: mergedRefs }
        : node);
    if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
      const edgePair = (startNodeId: string, endNodeId: string) => [startNodeId, endNodeId].sort().join("::");
      const deduped: NavigationEdge[] = [];
      for (const edge of nextEdges) {
        const startNodeId = edge.startNodeId === sourceNode.id ? targetNode.id : edge.startNodeId;
        const endNodeId = edge.endNodeId === sourceNode.id ? targetNode.id : edge.endNodeId;
        if (startNodeId === endNodeId) continue;
        const remapped = startNodeId === edge.startNodeId && endNodeId === edge.endNodeId
          ? edge
          : { ...edge, startNodeId, endNodeId };
        const remappedDistance = startNodeId !== edge.startNodeId || endNodeId !== edge.endNodeId
          ? edgeDistanceWithBends(remapped, nextNodes)
          : remapped.distance;
        const withDistance = remapped.distance === remappedDistance
          ? remapped
          : { ...remapped, distance: remappedDistance };
        const duplicateIndex = deduped.findIndex((candidate) => edgePair(candidate.startNodeId, candidate.endNodeId) === edgePair(startNodeId, endNodeId));
        if (duplicateIndex < 0) {
          deduped.push(withDistance);
          continue;
        }
        const existing = deduped[duplicateIndex];
        // Only generated copies collapse. Authored/manual edges remain
        // separate because their semantic ownership may differ even after an
        // explicit node merge.
        if (existing.generatedFromPathIds?.length && withDistance.generatedFromPathIds?.length) {
          deduped[duplicateIndex] = {
            ...existing,
            generatedFromPathIds: [...new Set([
              ...existing.generatedFromPathIds,
              ...withDistance.generatedFromPathIds,
            ])],
          };
        } else {
          deduped.push(withDistance);
        }
      }
      nextEdges = deduped;
    }
  }

  return reconcilePathwayNavigation({
    ...campus,
    paths: nextPaths,
    navNodes: nextNodes,
    navEdges: nextEdges,
  }, makeId, { preserveAuthoredGeometry: true });
}

export interface PathwayConversionResult {
  campus: Campus;
  createdNodes: number;
  createdEdges: number;
  legacyPathIds: string[];
}

/** Convert only the requested physical pathways, conservatively preserving legacy/manual graph data. */
export function convertPathwaysToNavigation(
  campus: Campus,
  pathIds: string[],
  makeId: PathwayIdFactory,
): PathwayConversionResult {
  const selected = (campus.paths ?? []).filter((path) => pathIds.includes(path.id) && path.points.length >= 2);
  if (selected.length === 0) return { campus, createdNodes: 0, createdEdges: 0, legacyPathIds: [] };
  let paths = [...(campus.paths ?? [])];
  let nodes = [...(campus.navNodes ?? [])];
  let edges = [...(campus.navEdges ?? [])];
  let createdNodes = 0;
  let createdEdges = 0;
  const legacyPathIds: string[] = [];
  const pathById = new Map(paths.map((candidate) => [candidate.id, candidate]));

  for (const path of selected) {
    let vertexIds = validVertexIds(path);
    if (!vertexIds) {
      if (pathwayHasLegacyNavigationChain(path, nodes, edges)) {
        legacyPathIds.push(path.id);
        continue;
      }
      vertexIds = path.points.map(() => makeId("pv"));
      paths = paths.map((candidate) => candidate.id === path.id ? { ...candidate, navigationVertexIds: vertexIds! } : candidate);
    }
    const nodeIds: string[] = [];
    for (let index = 0; index < path.points.length; index += 1) {
      const point = path.points[index];
      const ref = { pathId: path.id, vertexId: vertexIds[index] };
      let nodeIndex = nodes.findIndex((node) => node.generatedFromPathVertices?.some((candidate) => refKey(candidate) === refKey(ref)));
      if (nodeIndex < 0) {
        nodeIndex = nodes.findIndex((node) =>
          node.type === "outdoor" && !node.floorId &&
          (node.generatedFromPathVertices?.length ?? 0) > 0 &&
          pointKey(node) === pointKey(point) &&
          canShareGeneratedNode(node, point, pathById)
        );
      }
      if (nodeIndex < 0) {
        const created = createNavNode({ id: makeId("nn"), x: point.x, y: point.y, campusId: campus.id, name: "Walking Point", type: "outdoor", color: "#16a34a" });
        nodes.push({ ...created, generatedFromPathVertices: [ref] });
        nodeIndex = nodes.length - 1;
        createdNodes += 1;
      } else {
        nodes[nodeIndex] = { ...addNodeRef(nodes[nodeIndex], ref), x: Math.round(point.x), y: Math.round(point.y) };
      }
      nodeIds.push(nodes[nodeIndex].id);
    }
    for (let index = 0; index < nodeIds.length - 1; index += 1) {
      const startNodeId = nodeIds[index];
      const endNodeId = nodeIds[index + 1];
      if (!startNodeId || !endNodeId || isSelfEdge(startNodeId, endNodeId)) continue;
      const duplicate = findDuplicateNavEdge(edges, startNodeId, endNodeId);
      if (duplicate) {
        if (duplicate.generatedFromPathIds?.length) {
          edges = edges.map((edge) => edge.id === duplicate.id
            ? { ...edge, generatedFromPathIds: [...new Set([...duplicate.generatedFromPathIds!, path.id])] }
            : edge);
        }
        continue;
      }
      const created = createNavEdge({ id: makeId("ne"), startNodeId, endNodeId, nodes });
      edges.push({ ...created, generatedFromPathIds: [path.id] });
      createdEdges += 1;
    }
  }

  const reconciled = reconcilePathwayNavigation({ ...campus, paths, navNodes: nodes, navEdges: edges }, makeId);
  return { campus: reconciled, createdNodes, createdEdges, legacyPathIds };
}
