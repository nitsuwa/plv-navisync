import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { directoryFromSnapshot, hydrateCampusStructure, serializeCampusStructure } from "../campusStructureService";

const ids = {
  campus: "10000000-0000-4000-8000-000000000001",
  building: "10000000-0000-4000-8000-000000000002",
  floor: "10000000-0000-4000-8000-000000000003",
  room: "10000000-0000-4000-8000-000000000004",
  nodeA: "10000000-0000-4000-8000-000000000005",
  nodeB: "10000000-0000-4000-8000-000000000006",
  edge: "10000000-0000-4000-8000-000000000007",
};

const campus = {
  id: ids.campus, name: "A5 Campus", code: "A5", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "draft", visibleToStudents: false, canvasW: 1200, canvasH: 800,
  buildings: [{ id: ids.building, name: "Engineering", code: "ENG", category: "Academic", description: "",
    x: 10, y: 20, width: 200, height: 100, color: "#123456", rotation: 15, visible: true,
    accessibility: { wheelchairAccessible: true, hasElevator: false, hasRamp: true, accessibleEntrance: true },
    floors: [{ id: ids.floor, buildingId: ids.building, number: 1, label: "Ground Floor",
      rooms: [{ id: ids.room, buildingId: ids.building, floorId: ids.floor, name: "ENG 101", type: "classroom",
        x: 5, y: 6, w: 80, h: 50, accessibility: true, accessNodeId: ids.nodeB }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }] }],
  markers: [], paths: [], navNodes: [
    { id: ids.nodeA, name: "Entrance", type: "entrance", x: 1, y: 2, buildingId: ids.building, accessible: true, color: "green" },
    { id: ids.nodeB, name: "Room access", type: "room_access", x: 5, y: 6, buildingId: ids.building, floorId: ids.floor, accessible: true, color: "blue" },
  ], navEdges: [{ id: ids.edge, startNodeId: ids.nodeA, endNodeId: ids.nodeB, distance: 10,
    bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "green", width: 3 }],
  features: {}, settings: {}, createdAt: "2026-08-06", updatedAt: "2026-08-06",
} as Campus;

describe("campus structure mapping", () => {
  it("serializes all approved entity layers with database-safe properties", () => {
    const payload = serializeCampusStructure(campus);
    expect(payload.buildings).toHaveLength(1);
    expect(payload.floors).toHaveLength(1);
    expect(payload.map_elements).toHaveLength(1);
    expect(payload.navigation_nodes).toHaveLength(2);
    expect(payload.navigation_edges).toHaveLength(1);
    expect(payload.buildings[0]).toMatchObject({ category: "academic", rotation: 15, is_accessible: true });
    expect(payload.map_elements[0]).toMatchObject({ element_type: "classroom", floor_id: ids.floor, is_accessible: true });
  });

  it("serializes a newly added building whose empty floor collections are not initialized yet", () => {
    const wizardCampus = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          id: ids.floor, number: 1, label: "Ground Floor", rooms: [], paths: [],
        }],
      }],
    } as Campus;
    expect(() => serializeCampusStructure(wizardCampus)).not.toThrow();
    const payload = serializeCampusStructure(wizardCampus);
    expect(payload).toMatchObject({ buildings: [{ id: ids.building }], floors: [{ id: ids.floor }], map_elements: [] });
  });

  it("round-trips editor identity, coordinates, accessibility and floor links", () => {
    const payload = serializeCampusStructure(campus);
    const hydrated = hydrateCampusStructure(campus, {
      buildings: payload.buildings.map((v) => ({ ...v, campus_id: ids.campus }) as never),
      floors: payload.floors.map((v) => v as never), mapElements: payload.map_elements.map((v) => v as never),
      navigationNodes: payload.navigation_nodes.map((v) => v as never), navigationEdges: payload.navigation_edges.map((v) => v as never),
    });
    expect(hydrated.buildings[0].color).toBe("#123456");
    expect(hydrated.buildings[0].floors[0].rooms[0]).toMatchObject({ id: ids.room, floorId: ids.floor, accessibility: true });
    expect(hydrated.navEdges?.[0]).toMatchObject({ id: ids.edge, emergencySafe: true });
  });

  it("builds directory results from published snapshots only", () => {
    const payload = serializeCampusStructure(campus);
    expect(directoryFromSnapshot(ids.campus, { structure: payload } as never)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ids.building, kind: "building" }),
      expect.objectContaining({ id: ids.room, kind: "room", floorId: ids.floor }),
    ]));
    expect(directoryFromSnapshot(ids.campus, null)).toEqual([]);
  });
});
