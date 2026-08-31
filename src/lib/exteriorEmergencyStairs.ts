import type {
  Campus,
  CampusBuilding,
  ExteriorEmergencyStair,
  FloorPlan,
  FloorStairs,
  NavigationEdge,
  NavigationNode,
} from "../components/map-builder/types";
import { reconcileCrossFloorTransitions } from "./indoorNavigationGraph";

/**
 * Exterior Emergency Stairs are authored once on a Building.  Floor landing
 * occurrences are derived from the building attachment and the explicitly
 * served floor list; they still use the normal FloorStairs/sharedId graph
 * representation so routing and persistence stay on the existing path.
 */
export const EXTERIOR_EMERGENCY_STAIR_ROLE = "exterior_emergency" as const;

export function exteriorEmergencyStairWorldPosition(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation">,
  stair: Pick<ExteriorEmergencyStair, "attachment" | "width" | "height">,
) {
  const edge = stair.attachment.edge;
  const offset = Math.max(0, Math.min(1, Number(stair.attachment.offset) || 0.5));
  const width = Math.max(18, stair.width || 28);
  const height = Math.max(24, stair.height || 42);
  const local = edge === "top"
    ? { x: building.width * offset, y: -height / 2 - 10 }
    : edge === "right"
      ? { x: building.width + width / 2 + 10, y: building.height * offset }
      : edge === "bottom"
        ? { x: building.width * offset, y: building.height + height / 2 + 10 }
        : { x: -width / 2 - 10, y: building.height * offset };
  const rotation = ((building.rotation ?? 0) * Math.PI) / 180;
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const relative = { x: local.x - building.width / 2, y: local.y - building.height / 2 };
  return {
    x: cx + relative.x * Math.cos(rotation) - relative.y * Math.sin(rotation),
    y: cy + relative.x * Math.sin(rotation) + relative.y * Math.cos(rotation),
    angle: (Math.atan2(
      (edge === "top" ? -1 : edge === "bottom" ? 1 : 0),
      edge === "left" ? -1 : edge === "right" ? 1 : 0,
    ) * 180) / Math.PI + (building.rotation ?? 0),
  };
}

function occurrencePosition(floor: Pick<FloorPlan, "canvasW" | "canvasH">, stair: ExteriorEmergencyStair) {
  const w = Math.max(18, stair.width || 28);
  const h = Math.max(24, stair.height || 42);
  const width = floor.canvasW ?? 900;
  const height = floor.canvasH ?? 680;
  const offset = Math.max(0, Math.min(1, Number(stair.attachment.offset) || 0.5));
  switch (stair.attachment.edge) {
    case "top": return { x: width * offset, y: Math.max(2, h / 2) };
    case "right": return { x: Math.max(2, width - w / 2), y: height * offset };
    case "bottom": return { x: width * offset, y: Math.max(2, height - h / 2) };
    case "left": return { x: Math.max(2, w / 2), y: height * offset };
  }
}

function occurrenceId(stair: ExteriorEmergencyStair, floor: FloorPlan, existing?: FloorStairs) {
  return existing?.id
    ?? stair.occurrenceIds?.[floor.id]
    ?? crypto.randomUUID();
}

/** Sync only the physical occurrences; no graph mutation is performed here. */
export function syncExteriorEmergencyStairOccurrences(building: CampusBuilding): CampusBuilding {
  const exterior = (building.exteriorEmergencyStairs ?? []).map((stair) => ({
    ...stair,
    buildingId: building.id,
    sharedId: stair.sharedId || stair.id,
    attachment: {
      edge: stair.attachment?.edge ?? "right",
      offset: Math.max(0, Math.min(1, Number(stair.attachment?.offset) || 0.5)),
    },
    servedFloorIds: Array.from(new Set((stair.servedFloorIds ?? []).filter((id) => building.floors.some((floor) => floor.id === id)))),
    width: Math.max(18, stair.width ?? 28),
    height: Math.max(24, stair.height ?? 42),
  }));
  const occurrenceIds: Record<string, string> = {};
  const floors = building.floors.map((floor) => {
    let nextStairs = (floor.stairs ?? []).filter((candidate) => !candidate.exteriorEmergencyStairId || exterior.some((stair) => stair.id === candidate.exteriorEmergencyStairId));
    for (const stair of exterior) {
      if (!stair.servedFloorIds.includes(floor.id)) {
        nextStairs = nextStairs.filter((candidate) => candidate.exteriorEmergencyStairId !== stair.id);
        continue;
      }
      const current = nextStairs.find((candidate) => candidate.exteriorEmergencyStairId === stair.id);
      // A generated landing is one occurrence per served Floor.  If an older
      // edit left duplicate generated records behind, retain the established
      // ID and remove only the extras; unrelated authored Stairs are untouched.
      nextStairs = nextStairs.filter((candidate) =>
        candidate.exteriorEmergencyStairId !== stair.id || candidate.id === current?.id,
      );
      const id = occurrenceId(stair, floor, current);
      occurrenceIds[`${stair.id}:${floor.id}`] = id;
      const pos = occurrencePosition(floor, stair);
      const occurrence: FloorStairs = {
        ...(current ?? {}),
        id,
        x: pos.x - stair.width / 2,
        y: pos.y - stair.height / 2,
        width: stair.width,
        height: stair.height,
        rotation: current?.rotation ?? 0,
        flip: current?.flip,
        direction: "both",
        label: stair.label || "Exterior Emergency Stair",
        sharedId: stair.sharedId,
        accessible: false,
        emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false,
        exteriorEmergencyStairId: stair.id,
        attachment: stair.attachment,
        locked: true,
        visible: stair.state !== "closed",
        zOrder: current?.zOrder ?? 1000,
      };
      nextStairs = current
        ? nextStairs.map((candidate) => candidate.id === current.id ? occurrence : candidate)
        : [...nextStairs, occurrence];
    }
    return { ...floor, stairs: nextStairs };
  });
  const nextExterior = exterior.map((stair) => ({
    ...stair,
    occurrenceIds: { ...(stair.occurrenceIds ?? {}), ...Object.fromEntries(
      Object.entries(occurrenceIds)
        .filter(([key]) => key.startsWith(`${stair.id}:`))
        .map(([key, id]) => [key.slice(stair.id.length + 1), id]),
    ) },
  }));
  return { ...building, floors, exteriorEmergencyStairs: nextExterior };
}

/** Normalize all building-owned occurrences while leaving unrelated data intact. */
export function syncExteriorEmergencyStairs(campus: Campus): Campus {
  return { ...campus, buildings: campus.buildings.map(syncExteriorEmergencyStairOccurrences) };
}

/** Ensure canonical local nodes and one outdoor discharge bridge for each stair. */
export function syncExteriorEmergencyStairGraph(campus: Campus): Campus {
  const synced = syncExteriorEmergencyStairs(campus);
  const owners = new Map<string, ExteriorEmergencyStair>();
  const occurrenceIds = new Set<string>();
  for (const building of synced.buildings) {
    for (const stair of building.exteriorEmergencyStairs ?? []) owners.set(stair.id, stair);
    for (const floor of building.floors ?? []) {
      for (const stair of floor.stairs ?? []) {
        if (stair.exteriorEmergencyStairId) {
          occurrenceIds.add(stair.id);
        }
      }
    }
  }
  const nodes = (synced.navNodes ?? []).filter((node) => {
    if (!node.exteriorEmergencyStairId) return true;
    const owner = owners.get(node.exteriorEmergencyStairId);
    if (!owner) return false;
    if (node.floorId) return occurrenceIds.has(node.stairId ?? "");
    const ownerBuilding = synced.buildings.find((building) => building.id === owner.buildingId);
    const hasGround = ownerBuilding?.floors.some((floor) =>
      owner.servedFloorIds.includes(floor.id)
      && (floor.number === 1 || /ground/i.test(floor.label ?? "")),
    ) ?? false;
    return owner.outdoorNodeId === node.id && hasGround;
  });
  const retainedNodeIds = new Set(nodes.map((node) => node.id));
  let edges = (synced.navEdges ?? []).filter((edge) => retainedNodeIds.has(edge.startNodeId) && retainedNodeIds.has(edge.endNodeId));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeByPair = new Set(edges.map((edge) => [edge.startNodeId, edge.endNodeId].sort().join("|")));

  for (const building of synced.buildings) {
    for (const stair of building.exteriorEmergencyStairs ?? []) {
      const occurrences = building.floors
        .filter((floor) => stair.servedFloorIds.includes(floor.id))
        .flatMap((floor) => (floor.stairs ?? []).filter((item) => item.exteriorEmergencyStairId === stair.id).map((item) => ({ floor, item })));
      for (const { floor, item } of occurrences) {
        const existing = nodeById.get(item.id)
          ?? nodes.find((candidate) => candidate.exteriorEmergencyStairId === stair.id && candidate.stairId === item.id);
        const nodeId = existing?.id ?? crypto.randomUUID();
        const node: NavigationNode = {
          ...(nodeById.get(nodeId) ?? {}),
          id: nodeId,
          name: item.label,
          type: "stair",
          x: Math.round(item.x + item.width / 2),
          y: Math.round(item.y + item.height / 2),
          campusId: synced.id,
          buildingId: building.id,
          floorId: floor.id,
          stairId: item.id,
          exteriorEmergencyStairId: stair.id,
          transitionSharedId: stair.sharedId || stair.id,
          accessible: false,
          emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false,
          emergencyStair: true,
          color: "#dc2626",
        };
        nodeById.set(nodeId, node);
        const index = nodes.findIndex((candidate) => candidate.id === nodeId);
        if (index >= 0) nodes[index] = node; else nodes.push(node);
      }
      // Ground is the only valid outdoor discharge floor. Floor order is
      // canonical in the editor, while the explicit number/label fallback
      // keeps hydrated legacy campuses deterministic if their array order was
      // changed. A stair that does not serve Ground still gets its configured
      // upper landings, but no false outdoor discharge is authored.
      const ground = occurrences.find(({ floor }) => floor.number === 1 || /ground/i.test(floor.label ?? ""));
      if (!ground) continue;
      const pos = exteriorEmergencyStairWorldPosition(building, stair);
      const outdoorId = stair.outdoorNodeId || crypto.randomUUID();
      const outdoorNode: NavigationNode = {
        ...(nodeById.get(outdoorId) ?? {}),
        id: outdoorId,
        name: stair.label,
        type: "stair",
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        campusId: synced.id,
        exteriorEmergencyStairId: stair.id,
        transitionSharedId: stair.sharedId || stair.id,
        accessible: false,
        emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false,
        emergencyStair: true,
        color: "#dc2626",
      };
      nodeById.set(outdoorId, outdoorNode);
      const outdoorIndex = nodes.findIndex((candidate) => candidate.id === outdoorId);
      if (outdoorIndex >= 0) nodes[outdoorIndex] = outdoorNode; else nodes.push(outdoorNode);
      const groundNode = nodes.find((node) => node.stairId === ground.item.id && node.floorId === ground.floor.id);
      if (groundNode) {
        const pair = [outdoorId, groundNode.id].sort().join("|");
        if (!edgeByPair.has(pair)) {
          edges.push({ id: crypto.randomUUID(), startNodeId: outdoorId, endNodeId: groundNode.id, distance: 1, bidirectional: true, accessible: false, emergencySafe: stair.state !== "closed" && stair.emergencySafe !== false, type: "floor_transition", color: "#dc2626", width: 1 });
          edgeByPair.add(pair);
        }
      }
      if (stair.outdoorNodeId !== outdoorId) {
        const updatedBuildings = synced.buildings.map((candidate) => candidate.id !== building.id
          ? candidate
          : { ...candidate, exteriorEmergencyStairs: (candidate.exteriorEmergencyStairs ?? []).map((item) => item.id === stair.id ? { ...item, outdoorNodeId: outdoorId } : item) });
        synced.buildings = updatedBuildings;
      }
    }
  }
  for (const building of synced.buildings) {
    edges = reconcileCrossFloorTransitions(nodes, edges, building.floors, building.id);
  }
  return { ...synced, navNodes: nodes, navEdges: edges };
}
