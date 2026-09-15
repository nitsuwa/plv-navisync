import { describe, expect, it } from "vitest";
import { createDefaultFloor } from "../floorPlanNormalization";
import { prepareFloorTemplateReplacement, summarizeFloorForTemplateReplacement } from "../floorTemplateReplacement";
import type { FloorDoor, FloorFurniture, FloorWindow, NavigationEdge, NavigationNode } from "../../components/map-builder/types";

function floorFixture() {
  const floor = createDefaultFloor({ id: "floor-1", buildingId: "building-1", number: 1, canvasW: 600, canvasH: 450 });
  const door: FloorDoor = { id: "entry-door", x: 10, y: 0, width: 18, direction: "double", color: "#334155", buildingEntranceId: "entrance-1", wallId: floor.walls[0].id, offset: 0.2 };
  const zone = { id: "veranda-1", type: "veranda" as const, side: "bottom" as const, offset: 0.5, width: 180, depth: 72 };
  const exteriorFurniture: FloorFurniture = { id: "veranda-chair", type: "chair", name: "Chair", category: "seating", x: 280, y: 460, width: 12, height: 12, rotation: 0, color: "#475569", exteriorZoneId: zone.id };
  return { ...floor, doors: [door], exteriorZones: [zone], furniture: [exteriorFurniture], stairs: [{ id: "stair-occurrence", x: 580, y: 160, width: 30, height: 80, direction: "down" as const, label: "Emergency", exteriorEmergencyStairId: "stair-owner", color: undefined } as any] };
}

describe("Floor template replacement safety", () => {
  it("keeps explicit exterior-owned records while replacing indoor content", () => {
    const current = floorFixture();
    const templateDoor: FloorDoor = { id: "template-door", x: 120, y: 220, width: 24, direction: "left", color: "#b45309" };
    const templateWindow: FloorWindow = { id: "template-window", x: 160, y: 0, width: 48, height: 5, color: "#38bdf8" };
    const instantiated = { ...current, doors: [templateDoor], windows: [templateWindow], furniture: [], stairs: [], exteriorZones: [], entranceSteps: [], entranceRamps: [], rooms: [], walls: [], labels: [], paths: [] };
    const nodes: NavigationNode[] = [
      { id: "entry-node", name: "Entry", type: "hallway", x: 10, y: 0, buildingId: current.buildingId, floorId: current.id, doorId: "entry-door", buildingEntranceId: "entrance-1", accessible: false, color: "#475569" },
      { id: "free-node", name: "Waypoint", type: "hallway", x: 100, y: 100, buildingId: current.buildingId, floorId: current.id, accessible: true, color: "#475569" },
      { id: "outdoor", name: "Outdoor", type: "entrance", x: 0, y: 0, buildingId: current.buildingId, accessible: true, color: "#475569" },
    ];
    const edges: NavigationEdge[] = [
      { id: "bridge", startNodeId: "entry-node", endNodeId: "outdoor", distance: 1, bidirectional: true, type: "entrance_transition", accessible: true, emergencySafe: false, color: "#000", width: 1 },
      { id: "stale", startNodeId: "entry-node", endNodeId: "free-node", distance: 1, bidirectional: true, type: "walking", accessible: true, emergencySafe: false, color: "#000", width: 1 },
    ];
    const result = prepareFloorTemplateReplacement(current, instantiated, nodes, edges);
    expect(result.floor.canvasW).toBe(current.canvasW);
    expect(result.floor.canvasH).toBe(current.canvasH);
    expect(result.floor.doors.map((door) => door.id)).toEqual(["template-door", "entry-door"]);
    expect(result.floor.windows.map((window) => window.id)).toEqual(["template-window"]);
    expect(result.floor.exteriorZones?.map((zone) => zone.id)).toEqual(["veranda-1"]);
    expect(result.floor.furniture.map((item) => item.id)).toEqual(["veranda-chair"]);
    expect(result.floor.stairs.map((stair) => stair.id)).toEqual(["stair-occurrence"]);
    expect(result.retainedNavNodes.map((node) => node.id)).toEqual(["entry-node"]);
    expect(result.retainedNavEdges.map((edge) => edge.id)).toEqual(["bridge"]);
  });

  it("counts only indoor content in the replacement summary", () => {
    const current = floorFixture();
    const summary = summarizeFloorForTemplateReplacement(current, [
      { id: "entry-node", name: "Entry", type: "hallway", x: 0, y: 0, buildingId: current.buildingId, floorId: current.id, doorId: "entry-door", buildingEntranceId: "entrance-1", accessible: false, color: "#475569" },
      { id: "free-node", name: "Waypoint", type: "hallway", x: 0, y: 0, buildingId: current.buildingId, floorId: current.id, accessible: true, color: "#475569" },
    ], []);
    expect(summary.doors).toBe(0);
    expect(summary.furniture).toBe(0);
    expect(summary.walkingPoints).toBe(1);
  });

  it("preserves legacy Entrance-owned Doors when provenance is retained on the node", () => {
    const current = floorFixture();
    const legacyDoor = { ...current.doors[0], buildingEntranceId: undefined };
    const legacyCurrent = { ...current, doors: [legacyDoor] };
    const instantiated = { ...legacyCurrent, doors: [], windows: [], furniture: [], stairs: [], exteriorZones: [], entranceSteps: [], entranceRamps: [], rooms: [], walls: [], labels: [], paths: [] };
    const nodes: NavigationNode[] = [{
      id: "entry-node", name: "Entry", type: "hallway", x: 10, y: 0,
      buildingId: legacyCurrent.buildingId, floorId: legacyCurrent.id, doorId: legacyDoor.id,
      buildingEntranceId: "entrance-1", accessible: false, color: "#475569",
    }];
    const result = prepareFloorTemplateReplacement(legacyCurrent, instantiated, nodes, []);
    expect(result.floor.doors.map((door) => door.id)).toEqual([legacyDoor.id]);
    expect(result.retainedNavNodes.map((node) => node.id)).toEqual(["entry-node"]);
  });
});
