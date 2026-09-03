import type { Campus, CampusBuilding, CampusEntrance, FloorDoor, FloorPlan, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { genId as defaultGenId } from "../components/map-builder/constants";
import { entranceDisplayName, entranceWorldPosition } from "./buildingEntrances";
import { createNavNode, DEFAULT_NAV_NODE_COLOR, findEntranceNavNode } from "./navigationGraph";
import { entranceConnectorDistance, entranceConnectorGeometry } from "./entranceConnector";
import { ROOM_DOOR_EDGE_TYPE } from "./indoorNavigationGraph";

export const ENTRANCE_TRANSITION_EDGE_TYPE = "entrance_transition";

export interface DoorOption {
  floorId: string;
  floorLabel: string;
  floorNumber: number;
  doorId: string;
  doorLabel: string;
  nodeId?: string;
  linked: boolean;
  hidden?: boolean;
  entryFloor: boolean;
  eligible: boolean;
  ineligibleReason?: "not_linked" | "wrong_floor" | "already_used" | "hidden";
  usedByEntrance?: { buildingId: string; entranceId: string; name: string };
}

export interface EntranceIndoorLinkStatus {
  state: "not_linked" | "linked" | "missing";
  floorLabel?: string;
  floorId?: string;
  doorId?: string;
  doorLabel?: string;
  nodeId?: string;
  entranceName?: string;
  edgeId?: string;
  entryFloor?: boolean;
  hidden?: boolean;
  warning?: string;
  /** Whether the linked Door has a non-entrance edge into its indoor network. */
  doorNavigationConnected?: boolean;
}

export interface EntranceOutdoorLinkStatus {
  state: "not_connected" | "connected" | "missing";
  edgeId?: string;
  entranceNodeId?: string;
  targetNodeId?: string;
  targetName?: string;
  targetKind?: "generated" | "manual" | "entrance" | "indoor";
  warning?: string;
}

export function isEntranceTransitionEdge(edge: NavigationEdge | undefined): boolean {
  return edge?.type === ENTRANCE_TRANSITION_EDGE_TYPE;
}

export function entranceNodeForEdge(edge: NavigationEdge, nodes: NavigationNode[]): NavigationNode | undefined {
  const a = nodes.find((n) => n.id === edge.startNodeId);
  const b = nodes.find((n) => n.id === edge.endNodeId);
  if (a?.entranceId && !a.floorId) return a;
  if (b?.entranceId && !b.floorId) return b;
  return undefined;
}

export function doorNodeForEdge(edge: NavigationEdge, nodes: NavigationNode[]): NavigationNode | undefined {
  const a = nodes.find((n) => n.id === edge.startNodeId);
  const b = nodes.find((n) => n.id === edge.endNodeId);
  if (a?.doorId && a.floorId) return a;
  if (b?.doorId && b.floorId) return b;
  return undefined;
}

export function findEntranceTransitionForEntrance(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  buildingId: string,
  entranceId: string
): NavigationEdge | undefined {
  return (edges ?? []).find((edge) => {
    if (!isEntranceTransitionEdge(edge)) return false;
    const entrance = entranceNodeForEdge(edge, nodes ?? []);
    return entrance?.buildingId === buildingId && entrance.entranceId === entranceId;
  });
}

export function findEntranceTransitionForDoor(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  doorNodeId: string
): NavigationEdge | undefined {
  return (edges ?? []).find((edge) =>
    isEntranceTransitionEdge(edge) && (edge.startNodeId === doorNodeId || edge.endNodeId === doorNodeId)
  );
}

/**
 * Find the explicit outdoor bridge edge for an Entrance.  Indoor
 * `entrance_transition` edges are deliberately excluded: the Entrance node
 * is shared by both sides of the bridge, but the two connections have
 * different semantics.
 */
export function findEntranceOutdoorConnection(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  buildingId: string,
  entranceId: string,
): NavigationEdge | undefined {
  const entranceNode = findEntranceNavNode(nodes ?? [], buildingId, entranceId);
  if (!entranceNode) return undefined;
  return (edges ?? []).find((edge) =>
    !isEntranceTransitionEdge(edge)
    && (edge.startNodeId === entranceNode.id || edge.endNodeId === entranceNode.id)
  );
}

/** Human-facing status for the Entrance's outdoor Walking Network bridge. */
export function entranceOutdoorLinkStatus(
  campus: Pick<Campus, "navNodes" | "navEdges">,
  buildingId: string,
  entranceId: string,
): EntranceOutdoorLinkStatus {
  const nodes = campus.navNodes ?? [];
  const entranceNode = findEntranceNavNode(nodes, buildingId, entranceId);
  if (!entranceNode) return { state: "not_connected" };
  const edge = findEntranceOutdoorConnection(nodes, campus.navEdges, buildingId, entranceId);
  if (!edge) return { state: "not_connected", entranceNodeId: entranceNode.id };
  const targetId = edge.startNodeId === entranceNode.id ? edge.endNodeId : edge.startNodeId;
  const target = nodes.find((node) => node.id === targetId);
  if (!target) {
    return {
      state: "missing",
      edgeId: edge.id,
      entranceNodeId: entranceNode.id,
      targetNodeId: targetId,
      warning: "The connected Walking Point no longer exists.",
    };
  }
  const targetKind = target.generatedFromPathVertices?.length
    ? "generated"
    : target.entranceId
      ? "entrance"
      : target.floorId
        ? "indoor"
        : "manual";
  return {
    state: "connected",
    edgeId: edge.id,
    entranceNodeId: entranceNode.id,
    targetNodeId: target.id,
    targetName: target.name || "Walking Point",
    targetKind,
  };
}

/** Remove only the outdoor bridge edge(s), preserving the Entrance and its
 * indoor Door transition. */
export function removeEntranceOutdoorConnection(
  campus: Campus,
  buildingId: string,
  entranceId: string,
): Campus {
  const entranceNode = findEntranceNavNode(campus.navNodes ?? [], buildingId, entranceId);
  if (!entranceNode) return campus;
  const nextEdges = (campus.navEdges ?? []).filter((edge) =>
    isEntranceTransitionEdge(edge)
    || !(edge.startNodeId === entranceNode.id || edge.endNodeId === entranceNode.id)
  );
  return nextEdges.length === (campus.navEdges ?? []).length
    ? campus
    : { ...campus, navEdges: nextEdges };
}

/**
 * Remove dangling outdoor Entrance bridge edges after a target node is
 * deleted.  This is intentionally scoped to edges touching an explicit
 * Entrance node; unrelated manual graph edges are never swept.
 */
export function reconcileEntranceOutdoorConnections(campus: Campus): Campus {
  const nodes = campus.navNodes ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const entranceNodes = new Map(nodes.filter((node) => node.entranceId && !node.floorId).map((node) => [node.id, node]));
  const nextEdges = (campus.navEdges ?? []).filter((edge) => {
    if (isEntranceTransitionEdge(edge)) return true;
    const touchesEntrance = entranceNodes.has(edge.startNodeId) || entranceNodes.has(edge.endNodeId);
    if (!touchesEntrance) return true;
    return nodeIds.has(edge.startNodeId) && nodeIds.has(edge.endNodeId);
  }).map((edge) => {
    if (isEntranceTransitionEdge(edge)) return edge;
    const entranceNode = entranceNodes.get(edge.startNodeId) ?? entranceNodes.get(edge.endNodeId);
    if (!entranceNode) return edge;
    const accessible = entranceNode.accessible !== false;
    const building = campus.buildings.find((candidate) => candidate.id === entranceNode.buildingId);
    const entrance = building?.entrances?.find((candidate) => candidate.id === entranceNode.entranceId);
    const targetId = edge.startNodeId === entranceNode.id ? edge.endNodeId : edge.startNodeId;
    const target = nodes.find((node) => node.id === targetId);
    if (!building || !entrance || !target) {
      return edge.accessible === accessible ? edge : { ...edge, accessible };
    }
    const geometry = entranceConnectorGeometry(
      building,
      entrance,
      { x: target.x, y: target.y },
      campus.buildings,
      campus.decorAssets ?? [],
    );
    // Keep a previously valid connector intact if a later edit makes the
    // target genuinely unreachable. The next authoring attempt can surface
    // the blocked state without destroying the last known-good edge.
    if (geometry.blocked) return edge.accessible === accessible ? edge : { ...edge, accessible };
    const points = edge.startNodeId === entranceNode.id ? geometry.points : [...geometry.points].reverse();
    const bends = points.slice(1, -1);
    const distance = entranceConnectorDistance(points);
    const sameBends = (edge.bendPoints ?? []).length === bends.length
      && (edge.bendPoints ?? []).every((point, index) => point.x === bends[index].x && point.y === bends[index].y);
    if (edge.accessible === accessible && sameBends && edge.distance === distance) return edge;
    return { ...edge, accessible, bendPoints: bends.length > 0 ? bends : undefined, distance };
  });
  const unchanged = nextEdges.length === (campus.navEdges ?? []).length
    && nextEdges.every((edge, index) => edge === (campus.navEdges ?? [])[index]);
  return unchanged ? campus : { ...campus, navEdges: nextEdges };
}

/** A Door is indoor-network connected only when it has a real non-entrance
 * edge to another node on the same building/floor. The Entrance transition
 * itself is not mistaken for indoor walking connectivity. */
export function doorHasIndoorNavigationConnection(
  nodes: NavigationNode[] | undefined,
  edges: NavigationEdge[] | undefined,
  doorNode: NavigationNode | undefined,
  includeClosed = false,
): boolean {
  if (!doorNode?.buildingId || !doorNode.floorId || !doorNode.doorId) return false;
  const nodeIds = new Set((nodes ?? []).map((node) => node.id));
  return (edges ?? []).some((edge) => {
    if (isEntranceTransitionEdge(edge) || edge.type === ROOM_DOOR_EDGE_TYPE || (!includeClosed && edge.closed)) return false;
    const otherId = edge.startNodeId === doorNode.id
      ? edge.endNodeId
      : edge.endNodeId === doorNode.id
        ? edge.startNodeId
        : undefined;
    if (!otherId || !nodeIds.has(otherId)) return false;
    const other = (nodes ?? []).find((node) => node.id === otherId);
    return other?.buildingId === doorNode.buildingId && other.floorId === doorNode.floorId;
  });
}

function findDoor(building: CampusBuilding | undefined, floorId: string | undefined, doorId: string | undefined): { floor: FloorPlan; door: FloorDoor } | null {
  if (!building || !floorId || !doorId) return null;
  const floor = building.floors.find((f) => f.id === floorId);
  const door = floor?.doors?.find((d) => d.id === doorId);
  return floor && door ? { floor, door } : null;
}

export function entryFloorForBuilding(building: Pick<CampusBuilding, "floors"> | undefined): FloorPlan | undefined {
  return building?.floors?.[0];
}

export function doorDisplayName(door: Pick<FloorDoor, "label" | "id">, floor: Pick<FloorPlan, "doors">): string {
  const label = door.label?.trim();
  if (label) return label;
  const index = (floor.doors ?? []).findIndex((d) => d.id === door.id);
  return `Door ${index >= 0 ? index + 1 : 1}`;
}

export function entranceIndoorLinkStatus(
  campus: Pick<Campus, "buildings" | "navNodes" | "navEdges">,
  buildingId: string,
  entranceId: string
): EntranceIndoorLinkStatus {
  const nodes = campus.navNodes ?? [];
  const edge = findEntranceTransitionForEntrance(nodes, campus.navEdges, buildingId, entranceId);
  if (!edge) return { state: "not_linked" };
  const doorNode = doorNodeForEdge(edge, nodes);
  const building = campus.buildings.find((b) => b.id === buildingId);
  const resolved = findDoor(building, doorNode?.floorId, doorNode?.doorId);
  if (!doorNode || !resolved) return { state: "missing", edgeId: edge.id };
  const entryFloor = entryFloorForBuilding(building);
  const onEntryFloor = !!entryFloor && resolved.floor.id === entryFloor.id;
  const hidden = resolved.door.visible === false;
  const doorNavigationConnected = doorHasIndoorNavigationConnection(nodes, campus.navEdges, doorNode);
  return {
    state: "linked",
    floorId: resolved.floor.id,
    floorLabel: resolved.floor.label,
    doorId: resolved.door.id,
    doorLabel: doorDisplayName(resolved.door, resolved.floor),
    nodeId: doorNode.id,
    edgeId: edge.id,
    entryFloor: onEntryFloor,
    hidden,
    doorNavigationConnected,
    warning: !onEntryFloor
      ? "Connected door is no longer on the building entry floor."
      : hidden ? "Linked Door is hidden."
        : !doorNavigationConnected ? "Connect the Door to the indoor walking network." : undefined,
  };
}

export function doorEntranceLinkStatus(
  campus: Pick<Campus, "buildings" | "navNodes" | "navEdges">,
  buildingId: string,
  floorId: string,
  doorId: string
): EntranceIndoorLinkStatus {
  const nodes = campus.navNodes ?? [];
  const doorNode = nodes.find((n) => n.buildingId === buildingId && n.floorId === floorId && n.doorId === doorId);
  if (!doorNode) return { state: "not_linked" };
  const edge = findEntranceTransitionForDoor(nodes, campus.navEdges, doorNode.id);
  if (!edge) return { state: "not_linked" };
  const entranceNode = entranceNodeForEdge(edge, nodes);
  const building = campus.buildings.find((b) => b.id === entranceNode?.buildingId);
  const entrance = building?.entrances?.find((en) => en.id === entranceNode?.entranceId);
  if (!entranceNode || !building || !entrance) return { state: "missing", edgeId: edge.id };
  const entryFloor = entryFloorForBuilding(building);
  const onEntryFloor = !!entryFloor && floorId === entryFloor.id;
  const resolved = findDoor(building, floorId, doorId);
  const hidden = resolved?.door.visible === false;
  const doorNavigationConnected = doorHasIndoorNavigationConnection(nodes, campus.navEdges, doorNode);
  return {
    state: "linked",
    floorId,
    doorId,
    nodeId: doorNode.id,
    entranceName: entranceDisplayName(entrance, (building.entrances ?? []).findIndex((en) => en.id === entrance.id)),
    edgeId: edge.id,
    entryFloor: onEntryFloor,
    hidden,
    doorNavigationConnected,
    warning: !onEntryFloor
      ? "Connected door is no longer on the building entry floor."
      : hidden ? "Linked Door is hidden."
        : !doorNavigationConnected ? "Connect the Door to the indoor walking network." : undefined,
  };
}

export function indoorDoorOptionsForEntrance(
  campus: Pick<Campus, "buildings" | "navNodes" | "navEdges">,
  buildingId: string,
  entranceId: string
): DoorOption[] {
  const building = campus.buildings.find((b) => b.id === buildingId);
  if (!building) return [];
  const nodes = campus.navNodes ?? [];
  const edges = campus.navEdges ?? [];
  const entryFloor = entryFloorForBuilding(building);
  return building.floors.flatMap((floor) =>
    (floor.doors ?? []).map((door) => {
      const node = nodes.find((n) => n.buildingId === buildingId && n.floorId === floor.id && n.doorId === door.id);
      const usedEdge = node ? findEntranceTransitionForDoor(nodes, edges, node.id) : undefined;
      const usedEntranceNode = usedEdge ? entranceNodeForEdge(usedEdge, nodes) : undefined;
      const usedEntrance = usedEntranceNode?.entranceId && usedEntranceNode.entranceId !== entranceId
        ? building.entrances?.find((en) => en.id === usedEntranceNode.entranceId)
        : undefined;
      const entryFloorMatch = !!entryFloor && floor.id === entryFloor.id;
      const hidden = door.visible === false;
      const eligible = !!node && entryFloorMatch && !usedEntrance && !hidden;
      return {
        floorId: floor.id,
        floorLabel: floor.label,
        floorNumber: floor.number ?? 0,
        doorId: door.id,
        doorLabel: doorDisplayName(door, floor),
        nodeId: node?.id,
        linked: !!node,
        hidden,
        entryFloor: entryFloorMatch,
        eligible,
        ineligibleReason: eligible ? undefined : !node ? "not_linked" : !entryFloorMatch ? "wrong_floor" : hidden ? "hidden" : "already_used",
        usedByEntrance: usedEntranceNode && usedEntrance
          ? {
              buildingId: usedEntranceNode.buildingId ?? buildingId,
              entranceId: usedEntrance.id,
              name: entranceDisplayName(usedEntrance, (building.entrances ?? []).findIndex((en) => en.id === usedEntrance.id)),
            }
          : undefined,
      };
    })
  );
}

function buildEntranceNode(campus: Campus, building: CampusBuilding, entrance: CampusEntrance, genId: (prefix: string) => string): NavigationNode {
  const pos = entranceWorldPosition(building, entrance);
  return createNavNode({
    id: genId("nn"),
    x: pos.x,
    y: pos.y,
    campusId: campus.id,
    buildingId: building.id,
    entranceId: entrance.id,
    name: entranceDisplayName(entrance, (building.entrances ?? []).findIndex((en) => en.id === entrance.id)),
    type: "entrance",
    accessible: entrance.accessible !== false,
    color: DEFAULT_NAV_NODE_COLOR,
  });
}

export function linkEntranceToIndoorDoor(
  campus: Campus,
  buildingId: string,
  entranceId: string,
  doorNodeId: string,
  genId: (prefix: string) => string = defaultGenId
): Campus {
  const building = campus.buildings.find((b) => b.id === buildingId);
  const entrance = building?.entrances?.find((en) => en.id === entranceId);
  const doorNode = (campus.navNodes ?? []).find((n) => n.id === doorNodeId && n.buildingId === buildingId && n.floorId && n.doorId);
  if (!building || !entrance || !doorNode) return campus;
  const entryFloor = entryFloorForBuilding(building);
  if (!entryFloor || doorNode.floorId !== entryFloor.id) return campus;

  const existingEntranceNode = findEntranceNavNode(campus.navNodes ?? [], buildingId, entranceId);
  const entranceNode = existingEntranceNode ?? buildEntranceNode(campus, building, entrance, genId);
  const existingTransition = findEntranceTransitionForEntrance(campus.navNodes ?? [], campus.navEdges, buildingId, entranceId);
  const nodeIds = new Set([entranceNode.id, doorNode.id]);
  const nextNodes = existingEntranceNode ? campus.navNodes ?? [] : [...(campus.navNodes ?? []), entranceNode];
  const retainedEdges = (campus.navEdges ?? []).filter((edge) => {
    if (!isEntranceTransitionEdge(edge)) return true;
    const entranceEndpoint = entranceNodeForEdge(edge, nextNodes);
    if (entranceEndpoint?.buildingId === buildingId && entranceEndpoint.entranceId === entranceId) return false;
    return !(nodeIds.has(edge.startNodeId) && nodeIds.has(edge.endNodeId));
  });
  const edge: NavigationEdge = {
    id: existingTransition?.id ?? genId("ne"),
    startNodeId: entranceNode.id,
    endNodeId: doorNode.id,
    distance: 1,
    bidirectional: true,
    accessible: entrance.accessible !== false,
    emergencySafe: true,
    type: ENTRANCE_TRANSITION_EDGE_TYPE,
    color: "#2563eb",
    width: 2,
  };
  return { ...campus, navNodes: nextNodes, navEdges: [...retainedEdges, edge] };
}

export function removeEntranceIndoorConnection(campus: Campus, buildingId: string, entranceId: string): Campus {
  const nodes = campus.navNodes ?? [];
  const edge = findEntranceTransitionForEntrance(nodes, campus.navEdges, buildingId, entranceId);
  if (!edge) return campus;
  return { ...campus, navEdges: (campus.navEdges ?? []).filter((e) => e.id !== edge.id) };
}

export function reconcileEntranceTransitions(campus: Campus): Campus {
  const nodes = campus.navNodes ?? [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seenEntrance = new Set<string>();
  const seenPair = new Set<string>();
  const nextEdges = (campus.navEdges ?? []).filter((edge) => {
    if (!isEntranceTransitionEdge(edge)) return true;
    if (!nodeIds.has(edge.startNodeId) || !nodeIds.has(edge.endNodeId)) return false;
    const entranceNode = entranceNodeForEdge(edge, nodes);
    const doorNode = doorNodeForEdge(edge, nodes);
    if (!entranceNode?.buildingId || !entranceNode.entranceId || !doorNode?.buildingId || !doorNode.floorId || !doorNode.doorId) return false;
    if (entranceNode.buildingId !== doorNode.buildingId) return false;
    const building = campus.buildings.find((b) => b.id === entranceNode.buildingId);
    const entranceExists = building?.entrances?.some((en) => en.id === entranceNode.entranceId);
    const doorExists = !!findDoor(building, doorNode.floorId, doorNode.doorId);
    if (!entranceExists || !doorExists) return false;
    const entranceKey = `${entranceNode.buildingId}:${entranceNode.entranceId}`;
    const pairKey = [edge.startNodeId, edge.endNodeId].sort().join(":");
    if (seenEntrance.has(entranceKey) || seenPair.has(pairKey)) return false;
    seenEntrance.add(entranceKey);
    seenPair.add(pairKey);
    return true;
  }).map((edge) => {
    if (!isEntranceTransitionEdge(edge)) return edge;
    const entranceNode = entranceNodeForEdge(edge, nodes);
    const building = campus.buildings.find((b) => b.id === entranceNode?.buildingId);
    const entrance = building?.entrances?.find((en) => en.id === entranceNode?.entranceId);
    const accessible = entrance?.accessible !== false;
    return edge.accessible === accessible ? edge : { ...edge, accessible };
  });
  return nextEdges === campus.navEdges ? campus : { ...campus, navEdges: nextEdges };
}
