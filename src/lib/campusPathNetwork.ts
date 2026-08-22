import type { CampusPath, NavigationEdge, NavigationNode } from "../components/map-builder/types";

type Point = { x: number; y: number };

const pointKey = (point: Point) => `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;

const pointIsDisconnected = (path: CampusPath, point: Point) =>
  Boolean(path.disconnectedJunctionKeys?.includes(pointKey(point)));

/** Explicit editor grouping scope. Topological connectivity remains point-based. */
export function pathNetworkSelectionIds(
  paths: CampusPath[],
  pathId: string,
  mode: "network" | "member" = "network",
): string[] {
  if (mode === "member") return paths.some((path) => path.id === pathId) ? [pathId] : [];
  const path = paths.find((candidate) => candidate.id === pathId);
  if (!path?.pathNetworkId) return path ? [pathId] : [];
  return paths
    .filter((candidate) => candidate.pathNetworkId === path.pathNetworkId)
    .map((candidate) => candidate.id);
}

/**
 * Translate one physical Pathway while preserving connected shared junctions.
 * Only matching shared vertices in other Pathways follow; their remaining
 * geometry never participates in the rigid translation.
 */
export function movePathMemberPreservingJunctions(
  paths: CampusPath[],
  pathId: string,
  originPointsByPathId: ReadonlyMap<string, Point[]>,
  dx: number,
  dy: number,
  snap: (value: number) => number = (value) => value,
): CampusPath[] {
  const movingPath = paths.find((path) => path.id === pathId);
  if (!movingPath) return paths;
  const movingOrigin = originPointsByPathId.get(pathId) ?? movingPath.points;
  const movedPoints = movingOrigin.map((point) => ({
    x: snap(point.x + dx),
    y: snap(point.y + dy),
  }));
  const movedByOriginalKey = new Map(movingOrigin.map((point, index) => [pointKey(point), movedPoints[index]]));

  return paths.map((path) => {
    const originPoints = originPointsByPathId.get(path.id) ?? path.points;
    if (path.id === pathId) return { ...path, points: movedPoints };
    const nextPoints = originPoints.map((point) => {
      const moved = movedByOriginalKey.get(pointKey(point));
      if (!moved || pointIsDisconnected(movingPath, point) || pointIsDisconnected(path, point)) return point;
      return moved;
    });
    return nextPoints.some((point, index) => point !== originPoints[index])
      ? { ...path, points: nextPoints }
      : path;
  });
}

export const isPathwayGeneratedNode = (node: NavigationNode | undefined) =>
  Boolean(node?.generatedFromPathVertices?.length);

export const isPathwayGeneratedEdge = (edge: NavigationEdge | undefined) =>
  Boolean(edge?.generatedFromPathIds?.length);

export type GeneratedNavigationPermissions = {
  geometryEditable: boolean;
  independentlyDeletable: boolean;
};

/** Physical Pathways are the sole geometry/deletion owner of generated nodes. */
export function navigationNodePermissions(node: NavigationNode | undefined): GeneratedNavigationPermissions {
  const generated = isPathwayGeneratedNode(node);
  return { geometryEditable: !generated, independentlyDeletable: !generated };
}

/** Generated edge routing flags remain editable; only geometry/deletion are owned. */
export function navigationEdgePermissions(edge: NavigationEdge | undefined): GeneratedNavigationPermissions {
  const generated = isPathwayGeneratedEdge(edge);
  return { geometryEditable: !generated, independentlyDeletable: !generated };
}

/** Navigation visibility is presentation-only and never suppresses Pathway authoring feedback. */
export function shouldRenderPathwayAuthoringPreview(hasPreview: boolean, _navigationVisible: boolean): boolean {
  return hasPreview;
}

export type PathNetworkNavigationStatus = {
  total: number;
  enabled: number;
  missingPathIds: string[];
  state: "none" | "partial" | "complete";
};

/** Counts only explicit persisted ownership; coordinate proximity is ignored. */
export function pathNetworkNavigationStatus(
  paths: CampusPath[],
  navNodes?: NavigationNode[],
  navEdges?: NavigationEdge[],
): PathNetworkNavigationStatus {
  const hasCanonicalOwnedChain = (path: CampusPath) => {
    const vertexIds = path.navigationVertexIds;
    if (!vertexIds || vertexIds.length !== path.points.length || new Set(vertexIds).size !== vertexIds.length) return false;
    if (!navNodes || !navEdges) return true;
    const nodeIds = vertexIds.map((vertexId) => navNodes.find((node) =>
      node.generatedFromPathVertices?.some((ref) => ref.pathId === path.id && ref.vertexId === vertexId)
    )?.id);
    if (nodeIds.some((id) => !id)) return false;
    return nodeIds.slice(0, -1).every((startNodeId, index) => {
      const endNodeId = nodeIds[index + 1];
      return navEdges.some((edge) => edge.generatedFromPathIds?.includes(path.id) && (
        (edge.startNodeId === startNodeId && edge.endNodeId === endNodeId)
        || (edge.startNodeId === endNodeId && edge.endNodeId === startNodeId)
      ));
    });
  };
  const missingPathIds = paths
    .filter((path) => !hasCanonicalOwnedChain(path))
    .map((path) => path.id);
  const total = paths.length;
  const enabled = total - missingPathIds.length;
  return {
    total,
    enabled,
    missingPathIds,
    state: enabled === 0 ? "none" : enabled === total ? "complete" : "partial",
  };
}

export const editorPathRenderMode = (path: CampusPath): "normal" | "ghost" =>
  path.visible === false ? "ghost" : "normal";

export const pathIsPubliclyVisible = (path: CampusPath) => path.visible !== false;
