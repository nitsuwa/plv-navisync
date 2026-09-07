import type { Campus, CampusBuilding, CampusEntrance, FloorDoor, FloorPlan, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { genId as defaultGenId } from "../components/map-builder/constants";
import { entranceDisplayName, entranceWorldPosition } from "./buildingEntrances";
import { createNavNode, navEdgeDistance, findEntranceNavNode, syncEntranceNodePositions, pruneOrphanedEntranceNodes, DEFAULT_NAV_NODE_COLOR } from "./navigationGraph";
import { entranceConnectorDistance, entranceConnectorGeometry } from "./entranceConnector";
import { createIndoorNavNode, ROOM_DOOR_EDGE_TYPE } from "./indoorNavigationGraph";
import { DEFAULT_FLOOR_CANVAS, clampWallOpeningOffset, maxOpeningWidthForWall, wallLength } from "./floorGeometry";

export const ENTRANCE_TRANSITION_EDGE_TYPE = "entrance_transition";

/** Apply a Floor Door edit to its canonical outdoor owner before reconciliation. */
export function syncEntrancesFromFloorDoors(campus: Campus, buildingId: string, floorId: string, previousDoors: FloorDoor[]): Campus {
  const buildings = campus.buildings.map((building) => {
    if (building.id !== buildingId) return building;
    const floor = building.floors.find((item) => item.id === floorId);
    if (!floor) return building;
    const removed = new Set(previousDoors.filter((door) => door.buildingEntranceId && !floor.doors.some((item) => item.id === door.id)).map((door) => door.buildingEntranceId));
    const entrances = (building.entrances ?? []).filter((entrance) => !removed.has(entrance.id)).map((entrance) => {
      const door = floor.doors.find((item) => item.buildingEntranceId === entrance.id);
      const wall = door && floor.walls.find((item) => item.id === door.wallId);
      if (!door || !wall) return entrance;
      const horizontal = entrance.edge === "top" || entrance.edge === "bottom";
      const start = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
      const length = horizontal ? Math.abs(wall.x2 - wall.x1) : Math.abs(wall.y2 - wall.y1);
      const offset = Math.max(0, Math.min(1, ((horizontal ? door.x : door.y) - start) / Math.max(1, length)));
      return { ...entrance, offset };
    });
    return { ...building, entrances };
  });
  const synced = syncEntranceNodePositions(buildings, campus.navNodes ?? []);
  const graph = pruneOrphanedEntranceNodes(buildings, synced, campus.navEdges ?? []);
  return reconcileEntranceDoors({ ...campus, buildings, navNodes: graph.nodes, navEdges: graph.edges });
}

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
export interface EntranceOutdoorReconciliationOptions {
  /**
   * Preserve authored bend geometry while a physical Pathway target moves.
   * Entrance edits still use the normal connector resolver; Pathway transforms
   * pass this flag so a committed Connect route is not re-authored as an
   * automatic shortest connector on every pointer frame.
   */
  preserveAuthoredGeometry?: boolean;
}

export function reconcileEntranceOutdoorConnections(
  campus: Campus,
  options: EntranceOutdoorReconciliationOptions = {},
): Campus {
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
    if (options.preserveAuthoredGeometry) {
      // The bend list is the user's committed geometry.  Keep it byte-for-byte
      // stable while the target node follows its owning Pathway; only the
      // endpoint-derived distance is refreshed for routing cost/labels.
      const startNode = nodes.find((node) => node.id === edge.startNodeId);
      const endNode = nodes.find((node) => node.id === edge.endNodeId);
      if (startNode && endNode) {
        const points = [startNode, ...(edge.bendPoints ?? []), endNode];
        const distance = entranceConnectorDistance(points);
        return edge.accessible === accessible && edge.distance === distance
          ? edge
          : { ...edge, accessible, distance };
      }
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

/** Resolve the Ground-floor Door position from the same edge + normalized
 * offset used by the canonical outdoor Building Entrance.  Floor plans use a
 * stable authoring canvas, so this remains valid through building move,
 * resize, and rotation without storing a second raw campus coordinate. */
export function entranceDoorPosition(
  floor: Pick<FloorPlan, "canvasW" | "canvasH" | "walls">,
  entrance: Pick<CampusEntrance, "edge" | "offset">,
): { x: number; y: number } {
  const perimeterWall = (floor.walls ?? []).find((wall) => wall.perimeterSide === entrance.edge)
    ?? (floor.walls ?? []).find((wall) => wall.managedKind === "perimeter" && (
      (entrance.edge === "top" && wall.y1 === 0 && wall.y2 === 0)
      || (entrance.edge === "bottom" && wall.y1 === floor.canvasH && wall.y2 === floor.canvasH)
      || (entrance.edge === "left" && wall.x1 === 0 && wall.x2 === 0)
      || (entrance.edge === "right" && wall.x1 === floor.canvasW && wall.x2 === floor.canvasW)
    ));
  if (perimeterWall) {
    const length = wallLength(perimeterWall);
    if (length > 0) {
      const offset = Math.max(0, Math.min(1, Number.isFinite(Number(entrance.offset)) ? Number(entrance.offset) : 0.5));
      // Entrance offsets are measured in the canonical perimeter direction:
      // left→right on horizontal sides and top→bottom on vertical sides.
      // Managed floor walls intentionally use a clockwise winding, so the
      // bottom and left wall endpoints run in the opposite direction. Using
      // side semantics here prevents a physical outside move from mirroring
      // the generated Door inside the floor editor.
      const minX = Math.min(perimeterWall.x1, perimeterWall.x2);
      const maxX = Math.max(perimeterWall.x1, perimeterWall.x2);
      const minY = Math.min(perimeterWall.y1, perimeterWall.y2);
      const maxY = Math.max(perimeterWall.y1, perimeterWall.y2);
      switch (entrance.edge) {
        case "top": return { x: Math.round(minX + (maxX - minX) * offset), y: Math.round((perimeterWall.y1 + perimeterWall.y2) / 2) };
        case "right": return { x: Math.round((perimeterWall.x1 + perimeterWall.x2) / 2), y: Math.round(minY + (maxY - minY) * offset) };
        case "left": return { x: Math.round((perimeterWall.x1 + perimeterWall.x2) / 2), y: Math.round(minY + (maxY - minY) * offset) };
        case "bottom":
        default: return { x: Math.round(minX + (maxX - minX) * offset), y: Math.round((perimeterWall.y1 + perimeterWall.y2) / 2) };
      }
    }
  }
  const width = floor.canvasW ?? DEFAULT_FLOOR_CANVAS.w;
  const height = floor.canvasH ?? DEFAULT_FLOOR_CANVAS.h;
  const offset = Math.max(0, Math.min(1, Number.isFinite(Number(entrance.offset)) ? Number(entrance.offset) : 0.5));
  switch (entrance.edge) {
    case "top": return { x: Math.round(width * offset), y: 0 };
    case "right": return { x: width, y: Math.round(height * offset) };
    case "left": return { x: 0, y: Math.round(height * offset) };
    case "bottom":
    default: return { x: Math.round(width * offset), y: height };
  }
}

function entrancePerimeterWall(
  floor: Pick<FloorPlan, "canvasW" | "canvasH" | "walls">,
  edge: Pick<CampusEntrance, "edge">["edge"],
) {
  return (floor.walls ?? []).find((wall) => wall.perimeterSide === edge)
    ?? (floor.walls ?? []).find((wall) => wall.managedKind === "perimeter" && (
      (edge === "top" && wall.y1 === 0 && wall.y2 === 0)
      || (edge === "bottom" && wall.y1 === floor.canvasH && wall.y2 === floor.canvasH)
      || (edge === "left" && wall.x1 === 0 && wall.x2 === 0)
      || (edge === "right" && wall.x1 === floor.canvasW && wall.x2 === floor.canvasW)
    ));
}

function entranceDoorWallOffset(
  wall: NonNullable<ReturnType<typeof entrancePerimeterWall>>,
  entrance: Pick<CampusEntrance, "edge" | "offset">,
): number {
  const requested = normalizedEntranceOffset(entrance);
  const ascending = entrance.edge === "top" || entrance.edge === "bottom"
    ? wall.x2 >= wall.x1
    : wall.y2 >= wall.y1;
  return ascending ? requested : 1 - requested;
}

function entranceDoorWidth(wall: ReturnType<typeof entrancePerimeterWall> | undefined): number {
  if (!wall) return 28;
  return Math.round(maxOpeningWidthForWall(wall, 32, 28));
}

function entranceDoorWallId(floor: Pick<FloorPlan, "canvasW" | "canvasH" | "walls">, entrance: Pick<CampusEntrance, "edge">): string | undefined {
  return (floor.walls ?? []).find((wall) => wall.perimeterSide === entrance.edge)?.id
    ?? (floor.walls ?? []).find((wall) => wall.managedKind === "perimeter" && (
      (entrance.edge === "top" && wall.y1 === 0 && wall.y2 === 0)
      || (entrance.edge === "bottom" && wall.y1 === floor.canvasH && wall.y2 === floor.canvasH)
      || (entrance.edge === "left" && wall.x1 === 0 && wall.x2 === 0)
      || (entrance.edge === "right" && wall.x1 === floor.canvasW && wall.x2 === floor.canvasW)
    ))?.id;
}

function normalizedEntranceOffset(entrance: Pick<CampusEntrance, "offset">): number {
  const value = Number(entrance.offset);
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function generatedEntranceDoorLabel(entrance: CampusEntrance, index = 0): string {
  const name = entrance.name?.trim();
  if (name) return /door$/i.test(name) ? name : `${name} Door`;
  switch (entrance.type) {
    case "service": return "Service Entrance";
    case "emergency_exit":
    case "emergency": return "Emergency Exit";
    default: return entrance.isPrimary ? "Main Entrance" : `Entrance ${index + 1}`;
  }
}

/**
 * Reconcile Building Entrance -> Ground-floor Door infrastructure. A Door
 * created by this helper is marked with `buildingEntranceId` so it remains
 * associated with the canonical perimeter relationship while still being
 * editable on its valid parent wall. Existing manually linked Doors are
 * preserved; only Entrances without a link get a generated Door. The returned
 * Campus is referentially stable when nothing changed, which makes it safe to
 * call after hydration and ordinary building edits.
 */
export function reconcileEntranceDoors(
  campus: Campus,
  genId: (prefix: string) => string = defaultGenId,
): Campus {
  let buildingsChanged = false;
  const nextBuildings = (campus.buildings ?? []).map((building) => {
    const entrances = building.entrances ?? [];
    const validEntranceIds = new Set(entrances.map((entrance) => entrance.id));
    const entryFloorId = building.floors[0]?.id;
    let changed = false;
    let floors = building.floors.map((floor) => {
      const nextDoors = (floor.doors ?? []).filter((door) => {
        if (!door.buildingEntranceId) return true;
        // Generated Entrance Doors belong to the building's current entry
        // floor (the ordered floor array is authoritative). Move the
        // relationship on reconciliation instead of leaving a stale Door on
        // a floor that was demoted/reordered.
        const keep = validEntranceIds.has(door.buildingEntranceId)
          && (!entryFloorId || floor.id === entryFloorId);
        if (!keep) changed = true;
        return keep;
      });
      if (nextDoors.length !== (floor.doors ?? []).length) return { ...floor, doors: nextDoors };
      return floor;
    });
    const entryFloor = entryFloorForBuilding({ floors });
    if (entryFloor) {
      let entryDoors = entryFloor.doors ?? [];
      // Generated doors need stable, human-identifiable labels even when a
      // building has several entrances with the same/default name. Keep the
      // primary entrance's familiar label, then add a deterministic suffix
      // only when another generated entrance would collide with it.
      const generatedDoorLabels = new Set<string>();
      for (const entrance of entrances) {
        const linkedTransition = findEntranceTransitionForEntrance(campus.navNodes, campus.navEdges, building.id, entrance.id);
        const linkedDoorNode = linkedTransition ? doorNodeForEdge(linkedTransition, campus.navNodes ?? []) : undefined;
        const linkedDoor = linkedDoorNode
          ? entryDoors.find((door) => door.id === linkedDoorNode.doorId)
          : undefined;
        // Existing manually linked Door records remain authoritative. A
        // generated Door is identified explicitly and is safe to update.
        let generated = entryDoors.find((door) => door.buildingEntranceId === entrance.id);
        if (!generated && linkedDoor) continue;
        const perimeterWall = entrancePerimeterWall(entryFloor, entrance.edge);
        const width = perimeterWall ? maxOpeningWidthForWall(perimeterWall, generated?.width ?? 32, 28) : (generated?.width ?? 32);
        const requestedOffset = normalizedEntranceOffset(entrance);
        const wallOffset = perimeterWall
          ? clampWallOpeningOffset(perimeterWall, width, entranceDoorWallOffset(perimeterWall, entrance))
          : requestedOffset;
        const canonicalOffset = perimeterWall
          ? (entranceDoorWallOffset(perimeterWall, entrance) === requestedOffset ? wallOffset : 1 - wallOffset)
          : requestedOffset;
        const position = entranceDoorPosition(entryFloor, { ...entrance, offset: canonicalOffset });
        const wallId = entranceDoorWallId(entryFloor, entrance);
        const offset = wallOffset;
        const baseDoorLabel = generatedEntranceDoorLabel(entrance, entrances.indexOf(entrance));
        let doorLabel = baseDoorLabel;
        let labelSuffix = 2;
        while (generatedDoorLabels.has(doorLabel.toLowerCase())) {
          doorLabel = `${baseDoorLabel} ${labelSuffix}`;
          labelSuffix += 1;
        }
        generatedDoorLabels.add(doorLabel.toLowerCase());
        if (!generated) {
          generated = {
            id: genId("dr"),
            x: position.x,
            y: position.y,
            width,
            ...(wallId ? { wallId, offset } : {}),
            direction: "double" as const,
            color: "#b45309",
            label: doorLabel,
            locked: false,
            visible: true,
            buildingEntranceId: entrance.id,
            ...(entrance.type === "emergency_exit" || entrance.type === "emergency"
              ? { isEmergencyExit: true }
              : {}),
          };
          entryDoors = [...entryDoors, generated];
          changed = true;
        } else {
          const nextGenerated = {
            ...generated,
            x: position.x,
            y: position.y,
            width,
            ...(wallId ? { wallId, offset } : { wallId: undefined, offset: undefined }),
            label: doorLabel,
            locked: false,
            visible: generated.visible !== false,
            ...(entrance.type === "emergency_exit" || entrance.type === "emergency"
              ? { isEmergencyExit: true }
              : { isEmergencyExit: undefined }),
          };
          if (JSON.stringify(nextGenerated) !== JSON.stringify(generated)) {
            entryDoors = entryDoors.map((door) => door.id === generated!.id ? nextGenerated : door);
            generated = nextGenerated;
            changed = true;
          }
        }

        const doorFloorId = entryFloor.id;
        let doorNode = (campus.navNodes ?? []).find((node) =>
          node.buildingId === building.id && node.floorId === doorFloorId && node.doorId === generated!.id,
        );
        if (!doorNode) {
          doorNode = createIndoorNavNode({
            id: genId("nn"),
            x: generated!.x,
            y: generated!.y,
            campusId: campus.id,
            buildingId: building.id,
            floorId: doorFloorId,
            doorId: generated!.id,
            buildingEntranceId: entrance.id,
            name: generated!.label,
            type: "hallway",
            accessible: entrance.accessible !== false,
            emergencySafe: entrance.type === "emergency_exit" || entrance.type === "emergency" ? true : undefined,
          });
          changed = true;
        }
      }
      if (entryDoors !== entryFloor.doors) {
        floors = floors.map((floor) => floor.id === entryFloor.id ? { ...floor, doors: entryDoors } : floor);
      }
    }
    if (!changed) return building;
    buildingsChanged = true;
    return { ...building, floors };
  });

  // The loop above creates Door nodes lazily; rebuild from the resulting
  // physical records so legacy campuses and newly-added Entrances converge in
  // one pass without duplicate IDs.
  let next: Campus = buildingsChanged ? { ...campus, buildings: nextBuildings } : campus;
  const nextNodes = [...(next.navNodes ?? [])];
  let nodesChanged = false;
  const liveGeneratedDoorKeys = new Set(
    (next.buildings ?? []).flatMap((building) => {
      const floor = entryFloorForBuilding(building);
      return (floor?.doors ?? []).filter((door) => door.buildingEntranceId).map((door) => `${building.id}:${floor!.id}:${door.id}`);
    }),
  );
  for (let index = nextNodes.length - 1; index >= 0; index -= 1) {
    const node = nextNodes[index];
    if (node.buildingEntranceId && !liveGeneratedDoorKeys.has(`${node.buildingId}:${node.floorId}:${node.doorId}`)) {
      nextNodes.splice(index, 1);
      nodesChanged = true;
    }
  }
  for (const building of next.buildings ?? []) {
    const entryFloor = entryFloorForBuilding(building);
    if (!entryFloor) continue;
    for (const door of entryFloor.doors ?? []) {
      if (!door.buildingEntranceId) continue;
        const entrance = building.entrances?.find((item) => item.id === door.buildingEntranceId);
        if (!entrance) continue;
        const existing = nextNodes.find((node) => node.buildingId === building.id && node.floorId === entryFloor.id && node.doorId === door.id);
        if (existing) {
          const perimeterWall = entrancePerimeterWall(entryFloor, entrance.edge);
          const width = door.width;
          const requestedOffset = normalizedEntranceOffset(entrance);
          const wallOffset = perimeterWall
            ? clampWallOpeningOffset(perimeterWall, width, entranceDoorWallOffset(perimeterWall, entrance))
            : requestedOffset;
          const canonicalOffset = perimeterWall
            ? (entranceDoorWallOffset(perimeterWall, entrance) === requestedOffset ? wallOffset : 1 - wallOffset)
            : requestedOffset;
          const position = entranceDoorPosition(entryFloor, { ...entrance, offset: canonicalOffset });
          if (existing.x !== position.x || existing.y !== position.y || existing.buildingEntranceId !== entrance.id || existing.name !== door.label) {
            const index = nextNodes.indexOf(existing);
            nextNodes[index] = { ...existing, x: position.x, y: position.y, buildingEntranceId: entrance.id, name: door.label || "Entrance" };
            nodesChanged = true;
        }
      } else {
        nextNodes.push(createIndoorNavNode({
          id: genId("nn"), x: door.x, y: door.y, campusId: next.id,
          buildingId: building.id, floorId: entryFloor.id, doorId: door.id,
          buildingEntranceId: entrance.id, name: door.label || "Entrance", type: "hallway",
          accessible: entrance.accessible !== false,
          emergencySafe: entrance.type === "emergency_exit" || entrance.type === "emergency" ? true : undefined,
        }));
        nodesChanged = true;
      }
    }
  }
  if (nodesChanged) next = { ...next, navNodes: nextNodes };
  if (nodesChanged) {
    const liveNodeIds = new Set(nextNodes.map((node) => node.id));
    const retainedEdges = (next.navEdges ?? []).filter((edge) => liveNodeIds.has(edge.startNodeId) && liveNodeIds.has(edge.endNodeId));
    if (retainedEdges.length !== (next.navEdges ?? []).length) next = { ...next, navEdges: retainedEdges };
  }
  // Indoor walking links are explicitly authored with Connect. Reconciliation
  // owns only the Door anchor and its outdoor Entrance bridge.
  const generatedDoorNodes = nextNodes.filter((node) => node.buildingEntranceId && node.floorId && node.doorId);
  let nextEdges = [...(next.navEdges ?? [])];
  let edgesChanged = false;
  const generatedDoorNodeIds = new Set(generatedDoorNodes.map((node) => node.id));
  const refreshedEdges = nextEdges.map((edge) => {
    if (!generatedDoorNodeIds.has(edge.startNodeId) && !generatedDoorNodeIds.has(edge.endNodeId)) return edge;
    const start = nextNodes.find((node) => node.id === edge.startNodeId);
    const end = nextNodes.find((node) => node.id === edge.endNodeId);
    if (!start || !end || edge.type === ENTRANCE_TRANSITION_EDGE_TYPE || edge.type === ROOM_DOOR_EDGE_TYPE) return edge;
    const distance = navEdgeDistance(start, end);
    return edge.distance === distance ? edge : { ...edge, distance };
  });
  if (refreshedEdges.some((edge, index) => edge !== nextEdges[index])) {
    nextEdges = refreshedEdges;
    edgesChanged = true;
  }
  if (edgesChanged) next = { ...next, navEdges: nextEdges };
  const linked = (next.buildings ?? []).reduce((current, building) => {
    for (const entrance of building.entrances ?? []) {
      const floor = entryFloorForBuilding(building);
      const door = floor?.doors?.find((candidate) => candidate.buildingEntranceId === entrance.id);
      const node = door && (current.navNodes ?? []).find((candidate) => candidate.buildingId === building.id && candidate.floorId === floor!.id && candidate.doorId === door.id);
      if (node && !findEntranceTransitionForEntrance(current.navNodes, current.navEdges, building.id, entrance.id)) {
        return linkEntranceToIndoorDoor(current, building.id, entrance.id, node.id, genId);
      }
    }
    return current;
  }, next);
  return reconcileEntranceTransitions(linked);
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
        : !doorNavigationConnected ? "Connect the linked indoor Door to the indoor Walking Network." : undefined,
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
        : !doorNavigationConnected ? "Connect the linked indoor Door to the indoor Walking Network." : undefined,
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
  const unchanged = nextEdges.length === (campus.navEdges ?? []).length
    && nextEdges.every((edge, index) => edge === (campus.navEdges ?? [])[index]);
  return unchanged ? campus : { ...campus, navEdges: nextEdges };
}
