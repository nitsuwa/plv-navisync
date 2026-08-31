import { describe, expect, it } from "vitest";
import { syncExteriorEmergencyStairGraph, syncExteriorEmergencyStairOccurrences, exteriorEmergencyStairWorldPosition } from "../exteriorEmergencyStairs";
import { findNavigationRoute } from "../pathfinding";
import type { Campus, CampusBuilding, FloorPlan, ExteriorEmergencyStair } from "../../components/map-builder/types";

const floor = (id: string, number: number): FloorPlan => ({
  id, buildingId: "b1", number, label: number === 1 ? "Ground Floor" : `Floor ${number}`,
  canvasW: 900, canvasH: 680, backgroundColor: "#fff", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
} as FloorPlan);

const building = (stairs: ExteriorEmergencyStair[] = [], floors = [floor("f1", 1), floor("f2", 2), floor("f3", 3)]): CampusBuilding => ({
  id: "b1", name: "Main", code: "MAIN", category: "academic", description: "", x: 100, y: 100, width: 300, height: 220, color: "#123", floors, exteriorEmergencyStairs: stairs,
} as CampusBuilding);

const stair = (id: string, servedFloorIds = ["f1", "f2", "f3"]): ExteriorEmergencyStair => ({
  id, buildingId: "b1", label: `${id} Emergency Stair`, state: "open", width: 28, height: 42,
  attachment: { edge: "right", offset: 0.5 }, servedFloorIds, sharedId: `shared-${id}`, emergencySafe: true,
});

const campus = (b: CampusBuilding): Campus => ({
  id: "c1", name: "Campus", code: "C", description: "", address: "", city: "", province: "", postalCode: "", status: "active", publishStatus: "draft", visibleToStudents: false,
  features: { accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true }, canvasW: 1200, canvasH: 800, settings: { accessibility: true, emergency: true, eventLayer: true, gps: false }, buildings: [b], markers: [], paths: [], navNodes: [], navEdges: [], createdAt: "", updatedAt: "",
});

describe("Exterior Emergency Stair authoring", () => {
  it("derives only explicitly served floor occurrences and keeps one shared identity", () => {
    const result = syncExteriorEmergencyStairOccurrences(building([stair("east", ["f1", "f3"]) ]));
    expect(result.floors.flatMap((f) => f.stairs).map((s) => s.exteriorEmergencyStairId)).toEqual(["east", "east"]);
    expect(result.floors[1].stairs).toHaveLength(0);
    expect(result.floors[0].stairs[0].sharedId).toBe("shared-east");
    expect(result.floors[1].stairs).toHaveLength(0);
  });

  it("keeps generated occurrence IDs stable across repeated reconciliation", () => {
    const first = syncExteriorEmergencyStairOccurrences(building([stair("east") ]));
    const second = syncExteriorEmergencyStairOccurrences(first);
    expect(second.floors.flatMap((f) => f.stairs).map((s) => s.id)).toEqual(first.floors.flatMap((f) => f.stairs).map((s) => s.id));
  });

  it("creates canonical floor nodes, adjacent transitions, and one outdoor discharge anchor", () => {
    const result = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const owned = result.navNodes?.filter((n) => n.exteriorEmergencyStairId === "east") ?? [];
    expect(owned).toHaveLength(4);
    expect(owned.filter((n) => n.floorId)).toHaveLength(3);
    expect(owned.filter((n) => !n.floorId)).toHaveLength(1);
    const transitions = result.navEdges?.filter((e) => e.type === "floor_transition") ?? [];
    expect(transitions.length).toBeGreaterThanOrEqual(3);
    expect(transitions.every((e) => e.emergencySafe !== false)).toBe(true);
    const upper = owned.find((node) => node.floorId === "f3")!;
    const outdoor = owned.find((node) => !node.floorId)!;
    expect(findNavigationRoute(result.navNodes ?? [], result.navEdges ?? [], upper.id, outdoor.id, false, true)).not.toBeNull();
  });

  it("uses only configured served Floors and discharges at Ground", () => {
    const floors = [1, 2, 3, 4, 5].map((number) => floor(`f${number}`, number));
    const result = syncExteriorEmergencyStairGraph(campus(building([stair("east", ["f1", "f2", "f3", "f5"])], floors)));
    const owned = result.navNodes?.filter((node) => node.exteriorEmergencyStairId === "east") ?? [];
    expect(owned.filter((node) => node.floorId).map((node) => node.floorId)).toEqual(["f1", "f2", "f3", "f5"]);
    const transitions = result.navEdges?.filter((edge) => edge.type === "floor_transition") ?? [];
    expect(transitions.some((edge) => {
      const endpoints = [edge.startNodeId, edge.endNodeId].map((id) => owned.find((node) => node.id === id));
      return endpoints.some((node) => node?.floorId === "f3") && endpoints.some((node) => node?.floorId === "f5");
    })).toBe(true);
    const outdoor = owned.find((node) => !node.floorId);
    expect(outdoor).toBeDefined();
    expect(transitions.some((edge) => edge.startNodeId === outdoor!.id || edge.endNodeId === outdoor!.id)).toBe(true);
  });

  it("does not author a false outdoor discharge when Ground is not served", () => {
    const original = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const result = syncExteriorEmergencyStairGraph({
      ...original,
      buildings: original.buildings.map((item) => ({
        ...item,
        exteriorEmergencyStairs: (item.exteriorEmergencyStairs ?? []).map((candidate) => ({ ...candidate, servedFloorIds: ["f2", "f3"] })),
      })),
    });
    expect((result.navNodes ?? []).some((node) => node.exteriorEmergencyStairId === "east" && !node.floorId)).toBe(false);
  });

  it("marks a closed exterior stair unavailable for emergency discharge", () => {
    const result = syncExteriorEmergencyStairGraph(campus(building([ { ...stair("east"), state: "closed" } ])));
    const owned = result.navNodes?.filter((n) => n.exteriorEmergencyStairId === "east") ?? [];
    const upper = owned.find((node) => node.floorId === "f3")!;
    const outdoor = owned.find((node) => !node.floorId)!;
    expect(result.navEdges?.filter((edge) => edge.type === "floor_transition").every((edge) => edge.emergencySafe === false)).toBe(true);
    expect(findNavigationRoute(result.navNodes ?? [], result.navEdges ?? [], upper.id, outdoor.id, false, true)).toBeNull();
  });

  it("keeps exterior stair identities independent", () => {
    const result = syncExteriorEmergencyStairGraph(campus(building([stair("east"), stair("west")] )));
    const east = new Set((result.navNodes ?? []).filter((n) => n.exteriorEmergencyStairId === "east").map((n) => n.id));
    const west = new Set((result.navNodes ?? []).filter((n) => n.exteriorEmergencyStairId === "west").map((n) => n.id));
    expect([...east].some((id) => west.has(id))).toBe(false);
  });

  it("removes derived landings and nodes when the authored stair is removed", () => {
    const original = syncExteriorEmergencyStairGraph(campus(building([stair("east")])));
    const removed = syncExteriorEmergencyStairGraph({ ...original, buildings: original.buildings.map((b) => ({ ...b, exteriorEmergencyStairs: [] })) });
    expect(removed.buildings[0].floors.flatMap((f) => f.stairs).some((s) => s.exteriorEmergencyStairId)).toBe(false);
    expect((removed.navNodes ?? []).some((n) => n.exteriorEmergencyStairId)).toBe(false);
  });

  it("removes the discharge anchor when no floor is served", () => {
    const original = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const noStops = syncExteriorEmergencyStairGraph({
      ...original,
      buildings: original.buildings.map((b) => ({
        ...b,
        exteriorEmergencyStairs: (b.exteriorEmergencyStairs ?? []).map((item) => ({ ...item, servedFloorIds: [] })),
      })),
    });
    expect((noStops.navNodes ?? []).some((node) => node.exteriorEmergencyStairId === "east")).toBe(false);
  });

  it("keeps the attached outdoor anchor outside the building perimeter", () => {
    const b = building([stair("east")]);
    const pos = exteriorEmergencyStairWorldPosition(b, b.exteriorEmergencyStairs![0]);
    expect(pos.x).toBeGreaterThan(b.x + b.width);
  });
});
