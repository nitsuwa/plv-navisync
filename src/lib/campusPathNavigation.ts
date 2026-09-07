import type { Campus, CampusPath, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { createNavEdge, createNavNode, findDuplicateNavEdge, isSelfEdge } from "./navigationGraph";
import { reconcileEntranceOutdoorConnections, type EntranceOutdoorReconciliationOptions } from "./entranceTransitions";

export type PathwayIdFactory = (prefix: string) => string;

type PathVertexRef = { pathId: string; vertexId: string };

const refKey = (ref: PathVertexRef) => `${ref.pathId}:${ref.vertexId}`;
const pointKey = (point: { x: number; y: number }) => `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;
const pathPointIsDisconnected = (path: CampusPath | undefined, point: { x: number; y: number }) =>
  Boolean(path?.disconnectedJunctionKeys?.includes(pointKey(point)));

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
  const originalEntranceNodeIds = new Set(originalNodes.filter((node) => node.entranceId && !node.floorId).map((node) => node.id));
  const originalGeneratedNodeIds = new Set(originalNodes.filter((node) => node.generatedFromPathVertices?.length).map((node) => node.id));
  const collapsed = collapseDuplicateOwnedObjects(
    [...(campus.navNodes ?? [])],
    [...(campus.navEdges ?? [])],
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
  return reconcileEntranceOutdoorConnections({ ...campus, navNodes: nodes, navEdges: edges }, options);
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
