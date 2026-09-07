import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { canvasAppearanceRecordId, directoryFromSnapshot, hydrateCampusStructure, serializeCampusStructure } from "../campusStructureService";

const ids = {
  campus: "10000000-0000-4000-8000-000000000001",
  building: "10000000-0000-4000-8000-000000000002",
  floor: "10000000-0000-4000-8000-000000000003",
  room: "10000000-0000-4000-8000-000000000004",
  nodeA: "10000000-0000-4000-8000-000000000005",
  nodeB: "10000000-0000-4000-8000-000000000006",
  edge: "10000000-0000-4000-8000-000000000007",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const campus = {
  id: ids.campus, name: "A5 Campus", code: "A5", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "draft", visibleToStudents: false, canvasW: 1200, canvasH: 800,
  buildings: [{ id: ids.building, name: "Engineering", code: "ENG", category: "Academic", description: "",
    x: 10, y: 20, width: 200, height: 100, color: "#123456", rotation: 15, visible: true,
    accessibility: { wheelchairAccessible: true, hasElevator: false, hasRamp: true, accessibleEntrance: true },
    floors: [{ id: ids.floor, buildingId: ids.building, number: 1, label: "Ground Floor",
      rooms: [{ id: ids.room, buildingId: ids.building, floorId: ids.floor, name: "ENG 101", type: "classroom",
        x: 5, y: 6, w: 80, h: 50, accessibility: true, accessNodeId: ids.nodeB, accessDoorId: "door-1" }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }] }],
  markers: [], paths: [], navNodes: [
    { id: ids.nodeA, name: "Entrance", type: "entrance", x: 1, y: 2, buildingId: ids.building, accessible: true, color: "green" },
    { id: ids.nodeB, name: "Room access", type: "room_access", x: 5, y: 6, buildingId: ids.building, floorId: ids.floor, accessible: true, color: "blue" },
  ], navEdges: [{ id: ids.edge, startNodeId: ids.nodeA, endNodeId: ids.nodeB, distance: 10,
    bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "green", width: 3 }],
  features: {}, settings: {}, createdAt: "2026-08-06", updatedAt: "2026-08-06",
} as Campus;

describe("campus structure mapping", () => {
  it("hydrates legacy metadata.ui rows completely on the first load", () => {
    const legacyCampus = { ...campus, markers: [], paths: [], decorAssets: [], navNodes: [], navEdges: [] } as Campus;
    const rows = {
      buildings: [{
        id: ids.building, campus_id: ids.campus, name: "Engineering", code: "ENG", category: "academic",
        description: "", x: 10, y: 20, width: 200, height: 100, rotation: 0, is_visible: true,
        metadata: { ui: { ...campus.buildings[0], entrances: [{ id: "entrance-1", edge: "bottom", offset: 0.5, type: "general", name: "Main Entrance" }] } },
      }],
      floors: [],
      mapElements: [
        { id: "path-1", campus_id: ids.campus, element_type: "custom", floor_id: null, metadata: { ui: { kind: "campus_path", id: "path-1", points: [{ x: 2, y: 3 }, { x: 40, y: 3 }], type: "walkway", color: "#94a3b8", width: 8 } } },
        { id: "gate-1", campus_id: ids.campus, element_type: "gate", floor_id: null, metadata: { ui: { kind: "gate", id: "gate-1", type: "gate", purpose: "general", x: 44, y: 3, width: 30, height: 20, color: "#2563eb" } } },
        { id: "decor-1", campus_id: ids.campus, element_type: "custom", floor_id: null, metadata: { ui: { kind: "decor", id: "decor-1", type: "tree", x: 80, y: 40, scale: 1, rotation: 0, name: "Tree" } } },
      ],
      navigationNodes: [],
      navigationEdges: [],
    } as never;
    const hydrated = hydrateCampusStructure(legacyCampus, rows);
    expect(hydrated.paths).toHaveLength(1);
    expect(hydrated.markers).toHaveLength(1);
    expect(hydrated.markers[0]?.type).toBe("gate");
    expect(hydrated.decorAssets).toHaveLength(1);
    expect(hydrated.buildings[0]?.entrances).toHaveLength(1);
  });

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

  it("round-trips canvas ground appearance through the existing structure JSON channel", () => {
    const styled = { ...campus, canvasGroundMaterial: "pavers" as const, canvasGroundColor: "#b9ad98", canvasGroundTexture: "subtle" as const };
    const payload = serializeCampusStructure(styled);
    const appearance = payload.map_elements.find((row) => (row.metadata as { kind?: string })?.kind === "canvas_appearance");
    expect(appearance).toBeTruthy();
    expect((appearance?.metadata as { ui: Campus }).ui).toMatchObject({ canvasGroundMaterial: "pavers", canvasGroundColor: "#b9ad98", canvasGroundTexture: "subtle" });
    const hydrated = hydrateCampusStructure(styled, {
      buildings: payload.buildings.map((v) => ({ ...v, campus_id: ids.campus }) as never),
      floors: payload.floors.map((v) => v as never), mapElements: payload.map_elements.map((v) => v as never),
      navigationNodes: payload.navigation_nodes.map((v) => v as never), navigationEdges: payload.navigation_edges.map((v) => v as never),
    });
    expect(hydrated).toMatchObject({ canvasGroundMaterial: "pavers", canvasGroundColor: "#b9ad98", canvasGroundTexture: "subtle" });
  });

  it("uses a stable valid UUID for the canvas appearance record", () => {
    const id = canvasAppearanceRecordId(ids.campus);
    expect(id).toMatch(UUID_RE);
    expect(id).not.toContain(":");
    expect(canvasAppearanceRecordId(ids.campus)).toBe(id);
    const appearance = serializeCampusStructure({ ...campus, canvasGroundMaterial: "grass" }).map_elements
      .find((row) => (row.metadata as { kind?: string })?.kind === "canvas_appearance");
    expect(appearance?.id).toBe(id);
    expect(String(appearance?.id)).not.toContain(":canvas-appearance");
  });

  it("derives a nonblank persistence name when an optional floor-object label is empty", () => {
    const withUnnamedDoor = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          ...campus.buildings[0].floors[0],
          doors: [{ id: "door-unnamed", x: 20, y: 20, width: 18, direction: "left", color: "#b45309", label: "   " }],
        }],
      }],
    } as Campus;
    const payload = serializeCampusStructure(withUnnamedDoor);
    const door = payload.map_elements.find((row) => row.element_type === "door");
    expect(door).toMatchObject({ id: "door-unnamed", name: "Door" });
    expect(String(door?.name).trim()).not.toBe("");
    expect(payload.map_elements.every((row) => String(row.name ?? "").trim().length > 0)).toBe(true);
  });

  it("B5 Phase 3.1: renumbers colliding per-building floor numbers before persisting", () => {
    const dupCampus = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [
          { ...campus.buildings[0].floors[0], id: ids.floor, number: 1, label: "Ground Floor" },
          { id: "dup-floor", buildingId: ids.building, number: 1, label: "Duplicate Number" },
          { id: "third-floor", buildingId: ids.building, number: 3, label: "Floor 3" },
        ],
      }],
    } as Campus;
    const payload = serializeCampusStructure(dupCampus);
    const numbers = payload.floors.map((f) => f.floor_number);
    // The second floor (duplicate number 1) is deterministically bumped to the
    // next free number (max used + 1 = 2); the third floor keeps its own 3.
    expect(numbers).toEqual([1, 2, 3]);
    expect(new Set(numbers).size).toBe(numbers.length);
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
    expect(hydrated.buildings[0].floors[0].rooms[0]).toMatchObject({ id: ids.room, floorId: ids.floor, accessibility: true, accessDoorId: "door-1" });
    expect(hydrated.navEdges?.[0]).toMatchObject({ id: ids.edge, emergencySafe: true });
  });

  it("serializes and hydrates floor-plan background metadata and calibrated scale", () => {
    const withBackground = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          ...campus.buildings[0].floors[0],
          canvasW: 220,
          canvasH: 160,
          backgroundImage: {
            storagePath: "campus/building/floor/plan.png",
            fileName: "plan.png",
            mimeType: "image/png",
            size: 2048,
            visible: true,
            opacity: 0.4,
            locked: true,
            x: 12,
            y: 8,
            width: 180,
            height: 120,
            rotation: 3,
          },
          calibration: {
            metersPerUnit: 0.05,
            editorDistance: 200,
            realDistanceM: 10,
            points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
          },
        }],
      }],
    } as Campus;

    const payload = serializeCampusStructure(withBackground);
    expect(payload.floors[0]).toMatchObject({
      floor_plan_path: "campus/building/floor/plan.png",
      canvas_width: 220,
      canvas_height: 160,
      map_scale_m_per_unit: 0.05,
    });

    const hydrated = hydrateCampusStructure(withBackground, {
      buildings: payload.buildings.map((v) => ({ ...v, campus_id: ids.campus }) as never),
      floors: payload.floors.map((v) => v as never),
      mapElements: payload.map_elements.map((v) => v as never),
      navigationNodes: payload.navigation_nodes.map((v) => v as never),
      navigationEdges: payload.navigation_edges.map((v) => v as never),
    });

    expect(hydrated.buildings[0].floors[0].backgroundImage).toMatchObject({
      storagePath: "campus/building/floor/plan.png",
      opacity: 0.4,
      x: 12,
      width: 180,
    });
    expect(hydrated.buildings[0].floors[0].calibration?.metersPerUnit).toBe(0.05);
  });

  it("builds directory results from published snapshots only", () => {
    const payload = serializeCampusStructure(campus);
    expect(directoryFromSnapshot(ids.campus, { structure: payload } as never)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ids.building, kind: "building" }),
      expect.objectContaining({ id: ids.room, kind: "room", floorId: ids.floor }),
    ]));
    expect(directoryFromSnapshot(ids.campus, null)).toEqual([]);
  });

  it("never emits null x/y for endpoint-based walls (regression: NOT NULL violation)", () => {
    const withWall = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          ...campus.buildings[0].floors[0],
          rooms: [],
          walls: [{ id: ids.room, x1: 10, y1: 20, x2: 110, y2: 20, thickness: 4, color: "#64748b" }],
        }],
      }],
    } as Campus;
    const payload = serializeCampusStructure(withWall);
    const wallRow = payload.map_elements.find((e) => e.element_type === "wall")!;
    // The canonical anchor is the wall START point — finite, never null/NaN
    expect(wallRow.x).toBe(10);
    expect(wallRow.y).toBe(20);
    expect(Number.isFinite(wallRow.x)).toBe(true);
    expect(Number.isFinite(wallRow.y)).toBe(true);
    // Endpoint geometry survives in metadata.ui for round-tripping
    const ui = (wallRow.metadata as { ui: { x1: number; y1: number; x2: number; y2: number } }).ui;
    expect(ui).toMatchObject({ x1: 10, y1: 20, x2: 110, y2: 20 });
  });

  it("normalizes legacy synthetic managed perimeter wall ids before building the save payload", () => {
    const syntheticId = `managed-perimeter-${ids.floor}-top`;
    const withLegacyPerimeter = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          ...campus.buildings[0].floors[0],
          rooms: [],
          walls: [{ id: syntheticId, x1: 0, y1: 0, x2: 220, y2: 0, thickness: 6, color: "#64748b", locked: true, managedKind: "perimeter", perimeterSide: "top" }],
          doors: [{ id: "10000000-0000-4000-8000-000000000021", x: 110, y: 0, width: 24, direction: "left", color: "#b45309", wallId: syntheticId, offset: 0.5 }],
          windows: [{ id: "10000000-0000-4000-8000-000000000022", x: 120, y: 0, width: 32, height: 6, color: "#0284c7", wallId: syntheticId, offset: 0.55 }],
        }],
      }],
    } as Campus;

    const payload = serializeCampusStructure(withLegacyPerimeter);
    const wallRow = payload.map_elements.find((row) => row.element_type === "wall")!;
    const doorRow = payload.map_elements.find((row) => row.element_type === "door")!;
    const windowRow = payload.map_elements.find((row) => row.element_type === "window")!;
    const wallUi = (wallRow.metadata as { ui: { id: string; managedKind: string; perimeterSide: string } }).ui;
    const doorUi = (doorRow.metadata as { ui: { wallId: string } }).ui;
    const windowUi = (windowRow.metadata as { ui: { wallId: string } }).ui;

    expect(wallRow.id).toMatch(UUID_RE);
    expect(wallRow.id).not.toContain("managed-perimeter");
    expect(wallUi).toMatchObject({ id: wallRow.id, managedKind: "perimeter", perimeterSide: "top" });
    expect(doorUi.wallId).toBe(wallRow.id);
    expect(windowUi.wallId).toBe(wallRow.id);
    expect(JSON.stringify(payload)).not.toContain("managed-perimeter");
  });

  it("sanitizes stray NaN x/y on legacy walls instead of serializing null (regression: broken drag)", () => {
    // A wall polluted by the old broken drag wrote x: NaN / y: NaN onto the wall
    // object; JSON.stringify turned NaN into null and the DB rejected NOT NULL x.
    const withNaN = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          ...campus.buildings[0].floors[0],
          rooms: [],
          walls: [{ id: ids.room, x1: 10, y1: 20, x2: 110, y2: 20, thickness: 4, color: "#64748b", x: Number.NaN, y: Number.NaN }],
        }],
      }],
    } as Campus;
    const payload = serializeCampusStructure(withNaN);
    const wallRow = payload.map_elements.find((e) => e.element_type === "wall")!;
    expect(Number.isFinite(wallRow.x)).toBe(true);
    expect(Number.isFinite(wallRow.y)).toBe(true);
    expect(wallRow.x).toBe(10);
    expect(wallRow.y).toBe(20);
    // A JSON round-trip of the payload must never contain null x/y
    const roundTripped = JSON.parse(JSON.stringify(payload.map_elements));
    for (const el of roundTripped) {
      expect(el.x).not.toBeNull();
      expect(el.y).not.toBeNull();
    }
  });

  it("reports a specific element type + id instead of a raw DB error for corrupt coordinates", () => {
    const corrupt = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          ...campus.buildings[0].floors[0],
          rooms: [{ ...campus.buildings[0].floors[0].rooms[0], x: Number.NaN }],
        }],
      }],
    } as Campus;
    expect(() => serializeCampusStructure(corrupt)).toThrow(/map_elements \(room .*invalid x value/);
  });

  it("a floor with every supported element kind produces only finite x/y rows", () => {
    const fullFloor = {
      ...campus.buildings[0].floors[0],
      rooms: campus.buildings[0].floors[0].rooms,
      walls: [{ id: "wl1", x1: 0, y1: 0, x2: 40, y2: 0, thickness: 4, color: "#64748b" }],
      doors: [{ id: "dr1", x: 5, y: 5, width: 8, direction: "left", color: "#d97706" }],
      windows: [{ id: "wn1", x: 10, y: 10, width: 12, height: 4, color: "#7dd3fc" }],
      furniture: [{ id: "fn1", type: "desk", name: "Desk", category: "seating", x: 15, y: 15, width: 20, height: 12, rotation: 0, color: "#aaa" }],
      stairs: [{ id: "st1", x: 20, y: 20, width: 16, height: 12, direction: "both", label: "Stairs" }],
      ramps: [{ id: "rmp1", x: 25, y: 25, width: 20, height: 10, label: "Ramp", direction: "both", handrails: true, slope: "gentle", accessible: true }],
      elevators: [{ id: "ev1", x: 30, y: 30, width: 14, height: 14, doorWidth: 6, label: "Elevator" }],
      labels: [{ id: "lb1", x: 35, y: 35, text: "Lobby", fontSize: 12, color: "#111", rotation: 0 }],
      paths: [{ id: "fp1", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], type: "footpath", color: "#94a3b8", width: 3 }],
    };
    const full = { ...campus, buildings: [{ ...campus.buildings[0], floors: [fullFloor] }] } as Campus;
    const payload = serializeCampusStructure(full);
    expect(payload.map_elements.length).toBeGreaterThanOrEqual(9);
    for (const el of payload.map_elements) {
      expect(Number.isFinite(el.x)).toBe(true);
      expect(Number.isFinite(el.y)).toBe(true);
    }
  });
});
