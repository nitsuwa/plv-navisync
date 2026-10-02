import { afterEach, describe, expect, it, vi } from "vitest";
import type { Campus, CampusEventOverlay } from "../../components/map-builder/types";
import { getSupabase } from "../../lib/supabase";
import {
  campusStructureService,
  assertActiveBuildingCodesAvailable,
  canonicalizeCampusStructureForPersistence,
  hydrateCampusStructure,
  navigationEdgePairConflictIds,
  planFloorNumberWrites,
  rekeyNavigationEdgePayloadPairs,
  roomService,
  serializeCampusStructure,
  validateCampusStructurePayload,
  type CampusStructurePayload,
  type FloorNumberRow,
} from "../campusStructureService";
import { ENTRANCE_TRANSITION_EDGE_TYPE, linkEntranceToIndoorDoor, removeEntranceIndoorConnection } from "../../lib/entranceTransitions";
import { createIndoorNavNode } from "../../lib/indoorNavigationGraph";
import { repairInvalidFloorMapElementIds } from "../../lib/physicalFloorIntegrity";
import { duplicateFloorInBuilding } from "../../lib/floorManagement";
import { prepareFloorTemplateReplacement } from "../../lib/floorTemplateReplacement";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

const IDs = {
  campus: "10000000-0000-4000-8000-000000000001",
  building: "10000000-0000-4000-8000-000000000002",
  floorA: "10000000-0000-4000-8000-000000000003",
  floorB: "10000000-0000-4000-8000-000000000004",
  floorC: "10000000-0000-4000-8000-000000000005",
  nodeA: "10000000-0000-4000-8000-000000000006",
  nodeB: "10000000-0000-4000-8000-000000000007",
  nodeC: "10000000-0000-4000-8000-000000000008",
  edge: "10000000-0000-4000-8000-000000000009",
  edgeB: "10000000-0000-4000-8000-000000000010",
  entranceNode: "10000000-0000-4000-8000-000000000011",
  doorA: "10000000-0000-4000-8000-000000000012",
  doorB: "10000000-0000-4000-8000-000000000013",
  doorNodeA: "10000000-0000-4000-8000-000000000014",
  doorNodeB: "10000000-0000-4000-8000-000000000015",
  roomNode: "10000000-0000-4000-8000-000000000016",
};

/** Minimal campus: one building, the given floors (deep-cloned per call). */
function makeCampus(floors: Array<{ id: string; number: number; label?: string }>): Campus {
  return {
    id: IDs.campus, name: "Persist Campus", code: "PC", description: "", address: "", city: "",
    province: "", postalCode: "", status: "active", publishStatus: "draft", visibleToStudents: false,
    canvasW: 1200, canvasH: 800, features: {}, settings: {},
    buildings: [{
      id: IDs.building, name: "Engineering", code: "ENG", category: "Academic", description: "",
      x: 10, y: 20, width: 200, height: 100, rotation: 0, visible: true,
      floors: floors.map((f) => ({
        id: f.id, buildingId: IDs.building, number: f.number, label: f.label ?? `Floor ${f.number}`,
        canvasW: 580, canvasH: 380, rooms: [], paths: [], walls: [], doors: [],
        windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
      })),
    }],
    markers: [], paths: [], navNodes: [], navEdges: [],
  } as unknown as Campus;
}

/**
 * Simulates the migration's two-phase `save_campus_structure` floor writes:
 * Phase 1 moves rows (plan.moves) to temporary negatives, Phase 2 upserts the
 * final rows in payload order, enforcing floors_building_number_uq per write,
 * and stale rows not in the payload are archived. Throws on any duplicate-key
 * collision exactly as Postgres would mid-statement.
 */
function simulateTwoPhaseSave(existing: FloorNumberRow[], payload: FloorNumberRow[]) {
  const plan = planFloorNumberWrites(payload, existing);
  const rows = existing.map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const m of plan.moves) {
    const row = byId.get(m.id);
    if (row) row.number = m.tempNumber;
  }
  for (const f of plan.finals) {
    const clash = rows.some((r) => r.id !== f.id && r.buildingId === f.buildingId && r.number === f.number);
    if (clash) throw new Error(`duplicate key value violates unique constraint "floors_building_number_uq" (${f.buildingId}, ${f.number})`);
    const existingRow = byId.get(f.id);
    if (existingRow) { existingRow.buildingId = f.buildingId; existingRow.number = f.number; }
    else { const fresh = { ...f }; rows.push(fresh); byId.set(f.id, fresh); }
  }
  const finalIds = new Set(payload.map((f) => f.id));
  return rows.map((r) => ({ ...r, archived: !finalIds.has(r.id) }));
}

/** The PRE-fix behavior: a single naive upsert in payload order (no moves). */
function naiveSinglePassUpsert(existing: FloorNumberRow[], payload: FloorNumberRow[]) {
  const rows = existing.map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const f of payload) {
    const clash = rows.some((r) => r.id !== f.id && r.buildingId === f.buildingId && r.number === f.number);
    if (clash) throw new Error(`duplicate key value violates unique constraint "floors_building_number_uq" (${f.buildingId}, ${f.number})`);
    const existingRow = byId.get(f.id);
    if (existingRow) { existingRow.buildingId = f.buildingId; existingRow.number = f.number; }
    else { const fresh = { ...f }; rows.push(fresh); byId.set(f.id, fresh); }
  }
  const finalIds = new Set(payload.map((f) => f.id));
  return rows.map((r) => ({ ...r, archived: !finalIds.has(r.id) }));
}

const live = (id: string, number: number): FloorNumberRow => ({ id, buildingId: IDs.building, number });
const makeUuidGen = () => {
  const values = [IDs.entranceNode, IDs.edge, IDs.edgeB];
  let index = 0;
  return () => values[index++] ?? `10000000-0000-4000-8000-0000000000${20 + index++}`;
};

function makeEntranceCampus(): Campus {
  const campus = makeCampus([{ id: IDs.floorA, number: 1, label: "Ground Floor" }]) as Campus;
  campus.buildings[0].entrances = [{ id: "ent-main", name: "Main Entrance", type: "general", edge: "bottom", offset: 0.5, accessible: true }];
  campus.buildings[0].floors[0].doors = [
    { id: IDs.doorA, label: "Door A", x: 20, y: 20, width: 20, direction: "left", color: "#b45309" },
    { id: IDs.doorB, label: "Door B", x: 40, y: 20, width: 20, direction: "left", color: "#b45309" },
  ];
  campus.navNodes = [
    createIndoorNavNode({ id: IDs.doorNodeA, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, doorId: IDs.doorA, name: "Door A", type: "hallway", x: 20, y: 20 }),
    createIndoorNavNode({ id: IDs.doorNodeB, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, doorId: IDs.doorB, name: "Door B", type: "hallway", x: 40, y: 20 }),
  ];
  campus.navEdges = [];
  return campus;
}

const transitionPayloadRows = (campus: Campus) =>
  serializeCampusStructure(campus).navigation_edges
    .filter((edge) => (edge.metadata as { ui?: { type?: string } }).ui?.type === ENTRANCE_TRANSITION_EDGE_TYPE);

describe("student-facing building information persistence", () => {
  it("stores the image and hours in existing building columns and preserves curated facilities in metadata", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    Object.assign(campus.buildings[0], {
      coverImagePath: "buildings/eng/cover.webp",
      operatingHours: "Mon–Fri, 8:00 AM–5:00 PM",
      facilities: ["Study Area", "Wi-Fi"],
    });

    const row = serializeCampusStructure(campus).buildings[0];
    expect(row.image_path).toBe("buildings/eng/cover.webp");
    expect(row.operating_hours).toBe("Mon–Fri, 8:00 AM–5:00 PM");
    expect(row.metadata).toMatchObject({ ui: { facilities: ["Study Area", "Wi-Fi"] } });
    expect((row.metadata as { ui: Record<string, unknown> }).ui).not.toHaveProperty("coverImagePath");
    expect((row.metadata as { ui: Record<string, unknown> }).ui).not.toHaveProperty("operatingHours");
  });
});

describe("B5 Phase 3.1.2 — floor unique-constraint persistence (write order)", () => {
  afterEach(() => vi.clearAllMocks());

  it("persisted floor 1 + Add Floor 2 saves successfully", () => {
    const before = [live(IDs.floorA, 1)];
    const payload = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const after = simulateTwoPhaseSave(before, payload);
    expect(after.find((r) => r.id === IDs.floorA)).toMatchObject({ number: 1, archived: false });
    expect(after.find((r) => r.id === IDs.floorB)).toMatchObject({ number: 2, archived: false });
  });

  it("repeated save does not insert duplicate floor 2", () => {
    const before = [live(IDs.floorA, 1)];
    const payload = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const afterFirst = simulateTwoPhaseSave(before, payload);
    const afterSecond = simulateTwoPhaseSave(
      afterFirst.filter((r) => !r.archived).map(({ id, buildingId, number }) => ({ id, buildingId, number })),
      payload,
    );
    expect(afterSecond.filter((r) => r.id === IDs.floorB && !r.archived)).toHaveLength(1);
    expect(new Set(afterSecond.filter((r) => !r.archived).map((r) => r.number)).size).toBe(2);
  });

  it("adding a third floor produces number 3", () => {
    const before = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const payload = [live(IDs.floorA, 1), live(IDs.floorB, 2), live(IDs.floorC, 3)];
    const after = simulateTwoPhaseSave(before, payload);
    expect(after.find((r) => r.id === IDs.floorC)).toMatchObject({ number: 3, archived: false });
    expect(new Set(after.filter((r) => !r.archived).map((r) => r.number))).toEqual(new Set([1, 2, 3]));
  });

  it("existing floor IDs are updated, never recreated", () => {
    const before = [live(IDs.floorA, 1)];
    const payload = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const after = simulateTwoPhaseSave(before, payload);
    expect(after.filter((r) => !r.archived).map((r) => r.id)).toEqual([IDs.floorA, IDs.floorB]);
  });

  it("final rows always have unique (building_id, floor_number)", () => {
    const before = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const payload = [live(IDs.floorA, 2), live(IDs.floorB, 1)]; // swap
    const after = simulateTwoPhaseSave(before, payload);
    const active = after.filter((r) => !r.archived);
    expect(new Set(active.map((r) => `${r.buildingId}|${r.number}`)).size).toBe(active.length);
  });

  it("the two-phase reorder cannot collide even though a naive upsert would", () => {
    // DB: A=1, B=2. Desired: A=2, B=1. Updating A→2 first collides with B in
    // a single naive pass; the two-phase plan moves both rows first.
    const before = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const payload = [live(IDs.floorA, 2), live(IDs.floorB, 1)];
    expect(() => naiveSinglePassUpsert(before, payload)).toThrow(/duplicate key value violates unique constraint/);
    const after = simulateTwoPhaseSave(before, payload);
    expect(after.find((r) => r.id === IDs.floorA)).toMatchObject({ number: 2, archived: false });
    expect(after.find((r) => r.id === IDs.floorB)).toMatchObject({ number: 1, archived: false });
  });

  it("a new floor taking a number held by an archived stale row succeeds (blocker moved)", () => {
    // floorB was previously deleted (archived, still occupies number 2).
    const before = [live(IDs.floorA, 1), { ...live(IDs.floorB, 2), archived: true } as FloorNumberRow];
    const payload = [live(IDs.floorA, 1), live(IDs.floorC, 2)];
    const after = simulateTwoPhaseSave(before, payload);
    const newFloor = after.find((r) => r.id === IDs.floorC)!;
    expect(newFloor).toMatchObject({ number: 2, archived: false });
    // stale archived row no longer blocks the number
    expect(after.find((r) => r.id === IDs.floorB)).toMatchObject({ archived: true });
  });

  it("temporary moves choose numbers below archived temp rows from earlier saves", () => {
    const before = [
      live(IDs.floorA, 1),
      live(IDs.floorB, 2),
      { ...live(IDs.floorC, -1000000001), archived: true } as FloorNumberRow,
    ];
    const payload = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const plan = planFloorNumberWrites(payload, before);
    expect(plan.moves.map((m) => m.tempNumber)).toEqual([-1000000002, -1000000003]);
    const after = simulateTwoPhaseSave(before, payload);
    expect(after.find((r) => r.id === IDs.floorA)).toMatchObject({ number: 1, archived: false });
    expect(after.find((r) => r.id === IDs.floorB)).toMatchObject({ number: 2, archived: false });
  });

  it("a stale removed floor is reconciled (archived), not left active", () => {
    const before = [live(IDs.floorA, 1), live(IDs.floorB, 2)];
    const payload = [live(IDs.floorA, 1), live(IDs.floorC, 3)];
    const after = simulateTwoPhaseSave(before, payload);
    expect(after.find((r) => r.id === IDs.floorB)).toMatchObject({ archived: true });
    expect(after.find((r) => r.id === IDs.floorC)).toMatchObject({ number: 3, archived: false });
  });

  it("serializer never emits duplicate floor ids (duplicated local object fails early)", () => {
    const dupCampus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    (dupCampus.buildings[0].floors as unknown as Array<{ id: string }>).push(dupCampus.buildings[0].floors[0] as never);
    expect(() => serializeCampusStructure(dupCampus)).toThrow(/duplicate floor id/);
  });

  it("validates persisted object UUIDs, uniqueness, and exact Floor ownership before the RPC", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    campus.buildings[0].floors[0].rooms = [{
      id: "not-a-uuid", name: "Room", type: "office", x: 10, y: 10, w: 80, h: 60,
    } as never];
    const malformedPayload = serializeCampusStructure(campus);
    expect(() => validateCampusStructurePayload(malformedPayload)).toThrow(
      /Room 'Room' on Floor "Floor 1" \(ID "10000000-0000-4000-8000-000000000003"\) in Building "Engineering \(ENG\)" \(ID "10000000-0000-4000-8000-000000000002"\) has invalid map element ID 'not-a-uuid'/,
    );
    const repairedCandidate = repairInvalidFloorMapElementIds(campus).campus;
    const repairedPayload = serializeCampusStructure(repairedCandidate);
    const isRoom = (row: Record<string, unknown>) => (row.metadata as { kind?: string } | undefined)?.kind === "room";
    const repairedRoom = repairedPayload.map_elements.find(isRoom);
    expect(repairedRoom?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(() => validateCampusStructurePayload(repairedPayload)).not.toThrow();
    expect(serializeCampusStructure(repairedCandidate).map_elements.find(isRoom)?.id).toBe(repairedRoom?.id);

    const malformedPayloadWithDiagnostic = structuredClone(repairedPayload);
    const malformedRoom = malformedPayloadWithDiagnostic.map_elements.find(isRoom)!;
    malformedRoom.id = "room-copy-123";
    expect(() => validateCampusStructurePayload(malformedPayloadWithDiagnostic)).toThrow(
      /Room 'Room' on Floor "Floor 1" \(ID "10000000-0000-4000-8000-000000000003"\) in Building "Engineering \(ENG\)" \(ID "10000000-0000-4000-8000-000000000002"\) has invalid map element ID 'room-copy-123'/,
    );

    campus.buildings[0].floors[0].rooms[0].id = IDs.roomNode;
    const validPayload = serializeCampusStructure(campus);
    expect(() => validateCampusStructurePayload(validPayload)).not.toThrow();
    const duplicate = structuredClone(validPayload);
    duplicate.map_elements.push(structuredClone(duplicate.map_elements[0]));
    expect(() => validateCampusStructurePayload(duplicate)).toThrow(/duplicate map element ID/);
    const wrongFloor = structuredClone(validPayload);
    wrongFloor.map_elements[0].floor_id = IDs.floorB;
    expect(() => validateCampusStructurePayload(wrongFloor)).toThrow(/missing Floor|inconsistent Building\/Floor ownership/);
  });

  it("blocks a Floor save with a dangling Room wall anchor before any persistence call", async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    vi.mocked(getSupabase).mockReturnValue({ from, rpc } as never);
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [{ id: "new-room-id", name: "Room A", type: "office", x: 0, y: 0, w: 100, h: 100 } as never];
    floor.walls = [{
      id: "wall-with-stale-room-anchor", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4, color: "#000", material: "drywall",
      startAnchor: { targetType: "room", roomId: "old-template-room-id", edge: "top", offset: 0 },
    } as never];
    const before = structuredClone(campus);

    await expect(campusStructureService.save(campus)).rejects.toThrow(/Wall anchor refers to missing Room "old-template-room-id" on Wall ".+" \(start endpoint\)/);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(campus).toEqual(before);
  });

  it("blocks a map element primary-key collision owned by another Campus before the RPC", async () => {
    const rpc = vi.fn();
    const collisionRoomId = "20000000-0000-4000-8000-000000000001";
    const from = vi.fn((tableName: string) => {
      let requestedIds: string[] = [];
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn(function (this: unknown, _column: string, ids: string[]) { requestedIds = ids; return this; }),
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          const data = tableName === "map_elements" && requestedIds.includes(collisionRoomId)
            ? [{ id: collisionRoomId, campus_id: "20000000-0000-4000-8000-000000000099", building_id: IDs.building, floor_id: IDs.floorA, archived_at: null }]
            : [];
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return builder;
    });
    vi.mocked(getSupabase).mockReturnValue({ from, rpc } as never);
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    campus.buildings[0].floors[0].rooms = [{
      id: collisionRoomId, name: "Template Room", type: "office", x: 20, y: 30, w: 120, h: 80,
    } as never];

    await expect(campusStructureService.save(campus)).rejects.toThrow(/Map element ID collision: .*belongs to another Campus/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("serializer keeps final floor numbers unique per building while preserving own numbers", () => {
    const campus = makeCampus([
      { id: IDs.floorA, number: 1 },
      { id: IDs.floorB, number: 3 },
    ]);
    const payload = serializeCampusStructure(campus);
    expect(payload.floors.map((f) => f.floor_number).sort()).toEqual([1, 3]);
    expect(new Set(payload.floors.map((f) => f.floor_number)).size).toBe(2);
  });

  it("preserves normalized authored Building codes and only generates defaults for blank codes", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    campus.buildings[0].code = "  ceit  ";
    campus.buildings.push({
      ...structuredClone(campus.buildings[0]),
      id: "10000000-0000-4000-8000-000000000017",
      name: "Engineering Copy",
      code: "",
      floors: [],
    });
    campus.buildings.push({
      ...structuredClone(campus.buildings[0]),
      id: "10000000-0000-4000-8000-000000000018",
      name: "Explicit default code",
      code: "BLDG-01",
      floors: [],
    });

    const before = structuredClone(campus);
    const payload = serializeCampusStructure(campus);
    expect(payload.buildings.map((building) => building.code)).toEqual(["CEIT", "BLDG-02", "BLDG-01"]);
    expect(new Set(payload.buildings.map((building) => String(building.code).toUpperCase())).size)
      .toBe(payload.buildings.length);
    expect(payload.buildings[0].id).toBe(IDs.building);
    expect(campus).toEqual(before);
    const reloaded = roundTripHydrate(campus);
    expect(reloaded.buildings.map((building) => [building.id, building.code])).toEqual([
      [IDs.building, "CEIT"],
      ["10000000-0000-4000-8000-000000000017", "BLDG-02"],
      ["10000000-0000-4000-8000-000000000018", "BLDG-01"],
    ]);
  });

  it("rejects duplicate active Building codes instead of silently renaming either Building", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    campus.buildings[0].code = "CEIT";
    campus.buildings.push({
      ...structuredClone(campus.buildings[0]),
      id: "10000000-0000-4000-8000-000000000017",
      name: "Engineering Copy",
      code: " ceit ",
      floors: [],
    });

    expect(() => serializeCampusStructure(campus)).toThrow("Building code 'CEIT' is already in use.");
    expect(campus.buildings[0].id).toBe(IDs.building);
    expect(campus.buildings[0].code).toBe("CEIT");
  });

  it("allows an archived Building code to be reused but rejects another active Building's code", () => {
    const payloadBuildings = [{ id: "new-building", code: " CEIT " }];
    expect(() => assertActiveBuildingCodesAvailable(payloadBuildings, [
      { id: "archived-building", code: "ceit", archived_at: "2026-01-01T00:00:00Z" },
    ], new Set())).not.toThrow();
    expect(() => assertActiveBuildingCodesAvailable(payloadBuildings, [
      { id: "active-building", code: "ceit", archived_at: null },
    ], new Set())).toThrow("Building code 'CEIT' is already in use.");
  });

  it("blocks an active database code conflict before calling the save RPC", async () => {
    const rpc = vi.fn();
    const buildingQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [{ id: "20000000-0000-4000-8000-000000000020", code: "ceit", archived_at: null }], error: null }),
    };
    const from = vi.fn(() => buildingQuery);
    vi.mocked(getSupabase).mockReturnValue({ from, rpc } as never);
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    campus.buildings[0].code = "CEIT";

    await expect(campusStructureService.save(campus)).rejects.toThrow("Building code 'CEIT' is already in use.");
    expect(rpc).not.toHaveBeenCalled();
    expect(campus.buildings[0].code).toBe("CEIT");
  });

  it("floor IDs referenced by nav nodes and transition edges survive the save payload", () => {
    const campus = makeCampus([
      { id: IDs.floorA, number: 1 },
      { id: IDs.floorB, number: 2 },
    ]) as Campus;
    campus.navNodes = [
      { id: IDs.nodeA, name: "Stair F1", type: "stair", x: 1, y: 2, buildingId: IDs.building, floorId: IDs.floorA, accessible: true, stairId: "st-core", sharedId: "st-core" },
      { id: IDs.nodeB, name: "Stair F2", type: "stair", x: 1, y: 2, buildingId: IDs.building, floorId: IDs.floorB, accessible: true, stairId: "st-core", sharedId: "st-core" },
    ];
    campus.navEdges = [{
      id: IDs.edge, startNodeId: IDs.nodeA, endNodeId: IDs.nodeB, distance: 4,
      bidirectional: true, accessible: false, emergencySafe: true, type: "floor_transition",
    }];
    const payload = serializeCampusStructure(campus);
    expect(payload.navigation_nodes.map((n) => n.floor_id)).toEqual([IDs.floorA, IDs.floorB]);
    const transition = payload.navigation_edges.find((e) => e.id === IDs.edge)!;
    // floor_transition maps onto the DB's allowed 'transition' value...
    expect(transition.edge_type).toBe("transition");
    // ...while the full UI type round-trips through metadata JSON.
    expect((transition.metadata as { ui: { type: string } }).ui.type).toBe("floor_transition");
  });

  it("failed persistence propagates the real Supabase error (no fake success)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { message: 'duplicate key value violates unique constraint "floors_building_number_uq"' },
    });
    const from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    }));
    vi.mocked(getSupabase).mockReturnValue({ from, rpc } as never);
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    await expect(campusStructureService.save(campus)).rejects.toThrow(/Campus structure was not saved: duplicate key value violates unique constraint/);
  });

  it("loads only active navigation edges so stale entrance links cannot resurrect after save", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const table = (data: unknown[]) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(function (this: unknown, column: string, value: unknown) {
        eqCalls.push([column, value]);
        return this;
      }),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data, error: null }));
      },
    });
    const from = vi.fn((name: string) => {
      if (name === "buildings") return table([]);
      if (name === "floors") return table([]);
      if (name === "map_elements") return table([]);
      if (name === "navigation_nodes") return table([]);
      if (name === "navigation_edges") return table([]);
      return table([]);
    });
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    await campusStructureService.load(makeCampus([{ id: IDs.floorA, number: 1 }]));

    expect(from).toHaveBeenCalledWith("navigation_edges");
    expect(eqCalls).toContainEqual(["is_temporarily_closed", false]);
  });

  it("loads only active navigation nodes so removed Door navigation entries cannot resurrect", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const table = (data: unknown[]) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(function (this: unknown, column: string, value: unknown) {
        eqCalls.push([column, value]);
        return this;
      }),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data, error: null }));
      },
    });
    const from = vi.fn((name: string) => {
      if (name === "buildings") return table([]);
      if (name === "floors") return table([]);
      if (name === "map_elements") return table([]);
      if (name === "navigation_nodes") return table([]);
      if (name === "navigation_edges") return table([]);
      return table([]);
    });
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    await campusStructureService.load(makeCampus([{ id: IDs.floorA, number: 1 }]));

    expect(from).toHaveBeenCalledWith("navigation_nodes");
    expect(eqCalls).toContainEqual(["is_active", true]);
  });

  it("hydration ignores inactive Door nav nodes and drops stale entrance transitions touching them", () => {
    const campus = makeEntranceCampus();
    const linked = linkEntranceToIndoorDoor(campus, IDs.building, "ent-main", IDs.doorNodeA, makeUuidGen());
    const rows = serializeCampusStructure(linked);
    const hydrated = hydrateCampusStructure(campus, {
      buildings: rows.buildings as never,
      floors: rows.floors.map((row) => ({ ...row, display_order: Number(row.display_order ?? 0), floor_number: Number(row.floor_number ?? 1) })) as never,
      mapElements: rows.map_elements as never,
      navigationNodes: rows.navigation_nodes.map((row) => (
        row.id === IDs.doorNodeA ? { ...row, is_active: false } : row
      )) as never,
      navigationEdges: rows.navigation_edges as never,
    });

    expect(hydrated.buildings[0].floors[0].doors.some((door) => door.id === IDs.doorA)).toBe(true);
    expect(hydrated.navNodes.some((node) => node.id === IDs.doorNodeA || node.doorId === IDs.doorA)).toBe(false);
    expect(hydrated.navEdges.filter((edge) => edge.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(0);
  });

  it("serializer persists Door Add/Remove explicitly without recreating physical Door nodes", () => {
    const campus = makeEntranceCampus();
    const doorNode = campus.navNodes.find((node) => node.id === IDs.doorNodeA)!;
    const addedPayload = serializeCampusStructure(campus);
    expect(addedPayload.navigation_nodes.filter((node) => (node.metadata as { ui?: { doorId?: string } }).ui?.doorId === IDs.doorA)).toHaveLength(1);

    const removed: Campus = {
      ...campus,
      navNodes: campus.navNodes.filter((node) => node.id !== doorNode.id),
      navEdges: campus.navEdges.filter((edge) => edge.startNodeId !== doorNode.id && edge.endNodeId !== doorNode.id),
    };
    const removedPayload = serializeCampusStructure(removed);

    expect(removed.buildings[0].floors[0].doors.some((door) => door.id === IDs.doorA)).toBe(true);
    expect(removedPayload.navigation_nodes.some((node) => (node.metadata as { ui?: { doorId?: string } }).ui?.doorId === IDs.doorA)).toBe(false);
  });

  it("serializes one active entrance transition pair for connect and reconnect to the same Door", () => {
    const gen = makeUuidGen();
    const once = linkEntranceToIndoorDoor(makeEntranceCampus(), IDs.building, "ent-main", IDs.doorNodeA, gen);
    const twice = linkEntranceToIndoorDoor(once, IDs.building, "ent-main", IDs.doorNodeA, gen);
    const rows = transitionPayloadRows(twice);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_node_id: IDs.entranceNode, to_node_id: IDs.doorNodeA });
    expect(rows[0].is_temporarily_closed).toBe(false);
  });

  it("serializes one active entrance transition pair after changing Door A to Door B", () => {
    const gen = makeUuidGen();
    const doorA = linkEntranceToIndoorDoor(makeEntranceCampus(), IDs.building, "ent-main", IDs.doorNodeA, gen);
    const doorB = linkEntranceToIndoorDoor(doorA, IDs.building, "ent-main", IDs.doorNodeB, gen);
    const rows = transitionPayloadRows(doorB);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_node_id: IDs.entranceNode, to_node_id: IDs.doorNodeB });
  });

  it("serializes zero entrance transition pairs after removing the connection", () => {
    const linked = linkEntranceToIndoorDoor(makeEntranceCampus(), IDs.building, "ent-main", IDs.doorNodeA, makeUuidGen());
    const removed = removeEntranceIndoorConnection(linked, IDs.building, "ent-main");

    expect(transitionPayloadRows(removed)).toHaveLength(0);
  });

  it("plans stale same-pair edge retirement before save upsert to avoid navigation_edges_unique_pair_uq", () => {
    const payload = [{ id: IDs.edgeB, campusId: IDs.campus, fromNodeId: IDs.entranceNode, toNodeId: IDs.doorNodeA }];
    const existing = [
      { id: IDs.edge, campusId: IDs.campus, fromNodeId: IDs.entranceNode, toNodeId: IDs.doorNodeA },
      { id: "other-campus-edge", campusId: "other-campus", fromNodeId: IDs.entranceNode, toNodeId: IDs.doorNodeA },
      { id: "different-pair", campusId: IDs.campus, fromNodeId: IDs.entranceNode, toNodeId: IDs.doorNodeB },
    ];

    expect(navigationEdgePairConflictIds(payload, existing, IDs.campus)).toEqual([IDs.edge]);
  });

  it("reuses existing DB edge ids for same-pair logical edges before persistence", () => {
    const linked = linkEntranceToIndoorDoor(makeEntranceCampus(), IDs.building, "ent-main", IDs.doorNodeA, makeUuidGen());
    const payload = serializeCampusStructure({
      ...linked,
      navEdges: linked.navEdges.map((edge) => ({ ...edge, id: IDs.edgeB })),
    });

    const rekeyed = rekeyNavigationEdgePayloadPairs(payload, [{
      id: IDs.edge,
      campusId: IDs.campus,
      fromNodeId: IDs.entranceNode,
      toNodeId: IDs.doorNodeA,
    }], IDs.campus);

    expect(rekeyed.navigation_edges).toHaveLength(1);
    expect(rekeyed.navigation_edges[0].id).toBe(IDs.edge);
    expect((rekeyed.navigation_edges[0].metadata as { ui: { id: string } }).ui.id).toBe(IDs.edge);
  });

  it("reuses pair rows across E-A to E-B to E-A saves without pair conflicts", () => {
    const gen = makeUuidGen();
    const doorA = linkEntranceToIndoorDoor(makeEntranceCampus(), IDs.building, "ent-main", IDs.doorNodeA, gen);
    const doorB = linkEntranceToIndoorDoor(doorA, IDs.building, "ent-main", IDs.doorNodeB, gen);
    const backToA = linkEntranceToIndoorDoor(doorB, IDs.building, "ent-main", IDs.doorNodeA, gen);

    const payload = serializeCampusStructure(backToA);
    const rekeyed = rekeyNavigationEdgePayloadPairs(payload, [
      { id: IDs.edge, campusId: IDs.campus, fromNodeId: IDs.entranceNode, toNodeId: IDs.doorNodeA },
      { id: IDs.edgeB, campusId: IDs.campus, fromNodeId: IDs.entranceNode, toNodeId: IDs.doorNodeB },
    ], IDs.campus);

    expect(rekeyed.navigation_edges).toHaveLength(1);
    expect(rekeyed.navigation_edges[0]).toMatchObject({
      id: IDs.edge,
      from_node_id: IDs.entranceNode,
      to_node_id: IDs.doorNodeA,
    });
  });
});

// ── B6 Phase 1 — event overlay persistence ───────────────────────────────────

describe("B6 Phase 1 — event overlay persistence", () => {
  function makeEventOverlay(overrides?: Partial<CampusEventOverlay>): CampusEventOverlay {
    return {
      id: "eo-1",
      title: "Foundation Day",
      description: "Campus-wide celebration",
      dateStart: "2026-09-01T08:00:00.000Z",
      dateEnd: "2026-09-01T17:00:00.000Z",
      organizer: "Student Council",
      markers: [{ x: 10, y: 20, color: "#e11d48", label: "Stage" }],
      restrictedAreas: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }] }],
      isActive: true,
      ...overrides,
    };
  }

  /** Serialize → hydrate a campus through the existing structure payload shape. */
  const hydrateFromPayload = (campus: Campus) => {
    const rows = serializeCampusStructure(campus);
    return hydrateCampusStructure(campus, {
      buildings: rows.buildings as never,
      floors: rows.floors.map((row) => ({ ...row, display_order: Number(row.display_order ?? 0), floor_number: Number(row.floor_number ?? 1) })) as never,
      mapElements: rows.map_elements as never,
      navigationNodes: rows.navigation_nodes as never,
      navigationEdges: rows.navigation_edges as never,
    });
  };

  it("hydrates an empty eventOverlays list when no overlays are persisted", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    const rows = serializeCampusStructure(campus);
    expect(rows.map_elements.filter((el) => (el.metadata as { kind?: string })?.kind === "event_overlay")).toHaveLength(0);
    expect(hydrateFromPayload(campus).eventOverlays).toEqual([]);
  });

  it("round-trips a single event overlay with all authored fields", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    campus.eventOverlays = [makeEventOverlay()];
    const rows = serializeCampusStructure(campus);
    const overlayRows = rows.map_elements.filter((el) => (el.metadata as { kind?: string })?.kind === "event_overlay");
    expect(overlayRows).toHaveLength(1);
    const hydrated = hydrateFromPayload(campus);
    expect(hydrated.eventOverlays).toEqual([makeEventOverlay()]);
  });

  it("restores multiple overlays with their original ids and per-overlay state", () => {
    const campus = makeCampus([]);
    campus.eventOverlays = [
      makeEventOverlay({ id: "eo-a", title: "First" }),
      makeEventOverlay({ id: "eo-b", title: "Second", isActive: false }),
    ];
    const hydrated = hydrateFromPayload(campus);
    expect(hydrated.eventOverlays?.map((eo) => eo.id)).toEqual(["eo-a", "eo-b"]);
    expect(hydrated.eventOverlays?.find((eo) => eo.id === "eo-b")?.isActive).toBe(false);
  });

  it("preserves the locationRef through serialize + hydrate", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    campus.eventOverlays = [makeEventOverlay({
      locationRef: { type: "room", buildingId: IDs.building, floorId: IDs.floorA, roomId: "room-101", label: "Engineering — Ground — 101" },
    })];
    const hydrated = hydrateFromPayload(campus);
    expect(hydrated.eventOverlays?.[0].locationRef).toEqual({
      type: "room", buildingId: IDs.building, floorId: IDs.floorA, roomId: "room-101", label: "Engineering — Ground — 101",
    });
  });

  it("preserves overlay markers and restricted-area geometry", () => {
    const campus = makeCampus([]);
    campus.eventOverlays = [makeEventOverlay({
      markers: [
        { x: 10, y: 20, color: "#e11d48", label: "Stage" },
        { x: 200, y: 40, color: "#2563eb", label: "Booth" },
      ],
      restrictedAreas: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }] }],
    })];
    const hydrated = hydrateFromPayload(campus);
    expect(hydrated.eventOverlays?.[0].markers).toEqual([
      { x: 10, y: 20, color: "#e11d48", label: "Stage" },
      { x: 200, y: 40, color: "#2563eb", label: "Booth" },
    ]);
    expect(hydrated.eventOverlays?.[0].restrictedAreas).toEqual([
      { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }] },
    ]);
  });

  it("persists overlays alongside existing structure without dropping any entity", () => {
    const campus = makeEntranceCampus(); // building + floor + two doors + two door nav nodes
    campus.eventOverlays = [makeEventOverlay(), makeEventOverlay({ id: "eo-2", title: "Orientation" })];
    const rows = serializeCampusStructure(campus);
    expect(rows.buildings).toHaveLength(1);
    expect(rows.floors).toHaveLength(1);
    expect(rows.navigation_nodes).toHaveLength(2);
    const hydrated = hydrateFromPayload(campus);
    expect(hydrated.buildings).toHaveLength(1);
    expect(hydrated.buildings[0].floors[0].doors).toHaveLength(2);
    expect(hydrated.navNodes).toHaveLength(2);
    expect(hydrated.eventOverlays).toHaveLength(2);
    expect(hydrated.eventOverlays?.[1].id).toBe("eo-2");
  });

  it("repairs a legacy Event Organizer ID before Floor-save payload validation", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    campus.eventOverlays = [makeEventOverlay({
      id: "eo-1790650205083-pe84vm",
      title: "TEST: College Week 2026",
      locationRef: { type: "room", buildingId: IDs.building, floorId: IDs.floorA, roomId: "room-101", label: "Engineering — Floor 1 — Room 101" },
    })];

    const candidate = repairInvalidFloorMapElementIds(campus).campus;
    const payload = serializeCampusStructure(candidate);
    const eventRow = payload.map_elements.find((row) => (row.metadata as { kind?: string })?.kind === "event_overlay")!;

    expect(eventRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(() => validateCampusStructurePayload(payload)).not.toThrow();
    expect((eventRow.metadata as { ui: { title: string; locationRef: { roomId: string } } }).ui)
      .toMatchObject({ title: "TEST: College Week 2026", locationRef: { roomId: "room-101" } });

    const secondCandidate = repairInvalidFloorMapElementIds(candidate);
    expect(secondCandidate.repairs).toEqual([]);
    expect(serializeCampusStructure(secondCandidate.campus).map_elements.find((row) => (row.metadata as { kind?: string })?.kind === "event_overlay")?.id)
      .toBe(eventRow.id);
  });

  it("saves an unrelated Floor with a legacy Student Org event and retains the event", async () => {
    const stored: Record<string, unknown[]> = {
      buildings: [], floors: [], map_elements: [], navigation_nodes: [], navigation_edges: [],
    };
    const rpc = vi.fn(async (_name: string, args: { p_payload: CampusStructurePayload }) => {
      const payload = args.p_payload;
      stored.buildings = payload.buildings.map((row) => ({ ...row, campus_id: IDs.campus, archived_at: null }));
      stored.floors = payload.floors.map((row) => ({ ...row, archived_at: null }));
      stored.map_elements = payload.map_elements.map((row) => ({ ...row, archived_at: null, created_at: "2026-01-01T00:00:00.000Z" }));
      stored.navigation_nodes = payload.navigation_nodes.map((row) => ({ ...row, campus_id: IDs.campus }));
      stored.navigation_edges = payload.navigation_edges.map((row) => ({ ...row, campus_id: IDs.campus }));
      return { error: null };
    });
    const from = vi.fn((tableName: string) => {
      let range: [number, number] = [0, 499];
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn(function (this: unknown, start: number, end: number) { range = [start, end]; return this; }),
        then(resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: (stored[tableName] ?? []).slice(range[0], range[1] + 1), error: null }).then(resolve, reject);
        },
      };
      return builder;
    });
    vi.mocked(getSupabase).mockReturnValue({ from, rpc } as never);
    const campus = makeCampus([{ id: IDs.floorA, number: 1, label: "Ground Floor" }]);
    const legacyId = "eo-1790650205083-pe84vm";
    campus.eventOverlays = [makeEventOverlay({ id: legacyId, title: "TEST: College Week 2026" })];

    const saved = await campusStructureService.save(campus);
    const savePayload = rpc.mock.calls[0][1].p_payload;
    const eventRow = savePayload.map_elements.find((row) => (row.metadata as { kind?: string })?.kind === "event_overlay")!;

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(eventRow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(saved.eventOverlays?.[0]).toMatchObject({ id: eventRow.id, title: "TEST: College Week 2026" });
    expect(campus.eventOverlays?.[0].id).toBe(legacyId);
  });

  it("hydrates a legacy metadata event ID using its stable canonical map element row ID", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]);
    const legacyId = "eo-1790650205083-pe84vm";
    campus.eventOverlays = [makeEventOverlay({
      id: legacyId,
      title: "TEST: College Week 2026",
      locationRef: { type: "room", buildingId: IDs.building, floorId: IDs.floorA, roomId: "room-101", label: "Room 101" },
    })];
    const serialized = serializeCampusStructure(campus);
    const canonicalRowId = "10000000-0000-4000-8000-000000000099";
    const mapElements = serialized.map_elements.map((row) => {
      if ((row.metadata as { kind?: string })?.kind !== "event_overlay") return row;
      const metadata = row.metadata as { ui: Record<string, unknown> };
      return { ...row, id: canonicalRowId, metadata: { ...metadata, ui: { ...metadata.ui, id: legacyId } } };
    });
    const hydrated = hydrateCampusStructure(campus, {
      buildings: serialized.buildings as never,
      floors: serialized.floors.map((row) => ({ ...row, display_order: Number(row.display_order ?? 0), floor_number: Number(row.floor_number ?? 1) })) as never,
      mapElements: mapElements as never,
      navigationNodes: serialized.navigation_nodes as never,
      navigationEdges: serialized.navigation_edges as never,
    });

    expect(hydrated.eventOverlays?.[0]).toMatchObject({
      id: canonicalRowId,
      title: "TEST: College Week 2026",
      locationRef: { roomId: "room-101" },
      markers: [{ label: "Stage" }],
    });
  });

  it("reports legacy event identity failures with the event name and UUID requirement", () => {
    const campus = makeCampus([]);
    campus.eventOverlays = [makeEventOverlay({ id: "eo-1790650205083-pe84vm", title: "TEST: College Week 2026" })];
    expect(() => validateCampusStructurePayload(serializeCampusStructure(campus))).toThrow(
      /Student event 'TEST: College Week 2026' on the Campus has invalid map element ID 'eo-1790650205083-pe84vm' \(expected UUID format\)/,
    );
  });
});

// ── B6 Phase 2 — deterministic round-trip + save/reload integrity ───────────

/** Serialize → hydrate a campus through the existing structure payload shape. */
const roundTripHydrate = (campus: Campus) => {
  const rows = serializeCampusStructure(campus);
  return hydrateCampusStructure(campus, {
    buildings: rows.buildings as never,
    floors: rows.floors.map((row) => ({ ...row, display_order: Number(row.display_order ?? 0), floor_number: Number(row.floor_number ?? 1) })) as never,
    mapElements: rows.map_elements as never,
    navigationNodes: rows.navigation_nodes as never,
    navigationEdges: rows.navigation_edges as never,
  });
};

describe("floor duplication graph persistence protection", () => {
  it("canonicalizes generated Exterior Stair direction before serialization and round-trip while preserving ordinary Stair direction", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1, label: "Ground Floor" }]);
    const floor = campus.buildings[0].floors[0];
    const ownerId = "10000000-0000-4000-8000-000000000017";
    floor.stairs = [
      { id: "10000000-0000-4000-8000-000000000018", x: 40, y: 40, width: 24, height: 32, direction: "up", label: "Ordinary Stair" },
      { id: "10000000-0000-4000-8000-000000000019", x: 80, y: 40, width: 24, height: 32, direction: "up", label: "Exterior", sharedId: "exterior-shared", exteriorEmergencyStairId: ownerId },
    ] as never;
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: ownerId, buildingId: IDs.building, label: "Exterior Emergency Stair", state: "open", width: 24, height: 32,
      attachment: { edge: "right", offset: 0.5 }, servedFloorIds: [IDs.floorA], sharedId: "exterior-shared",
    }] as never;

    const canonical = canonicalizeCampusStructureForPersistence(campus);
    const canonicalAgain = canonicalizeCampusStructureForPersistence(canonical);
    const stairs = canonical.buildings[0].floors[0].stairs;
    const savedStairs = serializeCampusStructure(campus).map_elements
      .filter((row) => row.element_type === "stairs")
      .map((row) => (row.metadata as Record<string, unknown>).ui as Record<string, unknown>);
    const hydrated = roundTripHydrate(campus);

    expect(stairs.find((stair) => stair.exteriorEmergencyStairId === ownerId)?.direction).toBe("both");
    expect(stairs.find((stair) => stair.id === "10000000-0000-4000-8000-000000000018")?.direction).toBe("up");
    expect(savedStairs.find((stair) => stair.exteriorEmergencyStairId === ownerId)?.direction).toBe("both");
    expect(hydrated.buildings[0].floors[0].stairs.find((stair) => stair.exteriorEmergencyStairId === ownerId)?.direction).toBe("both");
    expect(hydrated.buildings[0].floors[0].stairs.find((stair) => stair.id === "10000000-0000-4000-8000-000000000018")?.direction).toBe("up");
    expect(canonicalAgain.buildings[0].floors[0].stairs.filter((stair) => stair.exteriorEmergencyStairId === ownerId)).toHaveLength(1);
    expect(canonicalAgain.navNodes?.filter((node) => node.exteriorEmergencyStairId === ownerId).map((node) => node.id))
      .toEqual(canonical.navNodes?.filter((node) => node.exteriorEmergencyStairId === ownerId).map((node) => node.id));
    expect(canonicalAgain.navEdges?.filter((edge) => edge.derivedOwnerId === ownerId).map((edge) => edge.id))
      .toEqual(canonical.navEdges?.filter((edge) => edge.derivedOwnerId === ownerId).map((edge) => edge.id));
  });

  it("preserves a duplicated custom Floor and its extension contents through save/reload", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1, label: "Ground Floor" }]);
    const source = campus.buildings[0].floors[0];
    source.extensions = [{ id: "10000000-0000-4000-8000-000000000017", side: "right", offset: 40, width: 100, depth: 80 }];
    source.rooms = [{
      id: "10000000-0000-4000-8000-000000000018", name: "Extension Room", type: "office", x: 590, y: 30, w: 60, h: 40,
      buildingId: IDs.building, floorId: IDs.floorA,
    }];
    source.walls = [{ id: "10000000-0000-4000-8000-000000000019", x1: 590, y1: 30, x2: 650, y2: 30, thickness: 4, color: "#64748b" }];
    source.doors = [{
      id: "10000000-0000-4000-8000-000000000020", x: 620, y: 30, width: 16, direction: "right", color: "#b45309",
      wallId: "10000000-0000-4000-8000-000000000019",
    }];
    source.furniture = [{
      id: "10000000-0000-4000-8000-000000000021", type: "desk", name: "Desk", category: "tables", x: 610, y: 45,
      width: 24, height: 18, rotation: 0, color: "#987654",
    }];
    const beforeSource = structuredClone(source);
    const duplicate = duplicateFloorInBuilding([source], IDs.building, IDs.floorA, [], []);
    const copy = duplicate.copy!;
    const copiedCampus = {
      ...campus,
      buildings: campus.buildings.map((building) => ({ ...building, floors: [...duplicate.floors] })),
    } as Campus;

    expect(source).toEqual(beforeSource);
    expect(copy.id).not.toBe(source.id);
    expect(copy.extensions?.[0]).toMatchObject({ side: "right", offset: 40, width: 100, depth: 80 });
    expect(copy.extensions?.[0].id).not.toBe(source.extensions?.[0].id);
    expect(copy.rooms[0].id).not.toBe(source.rooms[0].id);
    expect(copy.walls[0].id).not.toBe(source.walls[0].id);
    expect(copy.doors[0].id).not.toBe(source.doors[0].id);
    expect(copy.furniture[0].id).not.toBe(source.furniture[0].id);
    expect(copy.extensions).not.toBe(source.extensions);
    expect(copy.extensions?.[0]).not.toBe(source.extensions?.[0]);

    const firstReload = roundTripHydrate(copiedCampus);
    const secondReload = roundTripHydrate(firstReload);
    const reloadedCopy = firstReload.buildings[0].floors.find((floor) => floor.id === copy.id)!;
    const reloadedAgain = secondReload.buildings[0].floors.find((floor) => floor.id === copy.id)!;
    expect(reloadedCopy.extensions).toEqual(copy.extensions);
    expect(reloadedAgain.extensions).toEqual(copy.extensions);
    expect(reloadedCopy.rooms).toEqual(copy.rooms);
    expect(reloadedCopy.walls).toEqual(copy.walls);
    expect(reloadedCopy.doors).toEqual(copy.doors);
    expect(reloadedCopy.furniture).toEqual(copy.furniture);
    const reloadedSource = firstReload.buildings[0].floors.find((floor) => floor.id === source.id)!;
    expect(reloadedSource.extensions).toEqual(source.extensions);
    expect(reloadedSource.rooms).toEqual(expect.arrayContaining([expect.objectContaining({ id: source.rooms[0].id, x: 590, y: 30, w: 60, h: 40 })]));
    expect(reloadedSource.furniture).toEqual(expect.arrayContaining([expect.objectContaining({ id: source.furniture[0].id, x: 610, y: 45, width: 24, height: 18 })]));
  });

  it("keeps the complete graph unchanged through Floor-template replacement and repeated reload", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1, label: "Ground Floor" }]);
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [{ id: "template-source-room", name: "Old Room", type: "office", x: 10, y: 10, w: 80, h: 60, buildingId: IDs.building, floorId: IDs.floorA }];
    floor.walls = [{ id: "template-source-wall", x1: 10, y1: 10, x2: 90, y2: 10, thickness: 4, color: "#64748b" }];
    floor.doors = [{ id: "template-source-door", x: 50, y: 10, width: 12, direction: "left", color: "#b45309", wallId: "template-source-wall" }];

    const outdoorA = { id: IDs.nodeA, name: "Outdoor A", type: "outdoor" as const, x: 400, y: 250, accessible: true, color: "#1d4ed8", custom: { retained: true } };
    const outdoorB = { ...outdoorA, id: IDs.nodeB, name: "Outdoor B", x: 460, y: 280 };
    const roomNode = createIndoorNavNode({ id: IDs.roomNode, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, roomId: "template-source-room", name: "Old Room", type: "room_access", x: 50, y: 40 });
    const doorNode = createIndoorNavNode({ id: IDs.doorNodeA, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, doorId: "template-source-door", name: "Old Door", type: "hallway", x: 50, y: 10 });
    const waypoint = createIndoorNavNode({ id: IDs.doorNodeB, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, name: "Hall", type: "hallway", x: 120, y: 40 });
    campus.navNodes = [outdoorA, outdoorB, roomNode, doorNode, waypoint] as never;
    campus.navEdges = [
      { id: IDs.edge, startNodeId: outdoorA.id, endNodeId: outdoorB.id, distance: 64, bidirectional: true, accessible: true, type: "walkway", color: "#334155", width: 2, bendPoints: [{ x: 430, y: 260 }], custom: { untouched: true } },
      { id: IDs.edgeB, startNodeId: roomNode.id, endNodeId: doorNode.id, distance: 30, bidirectional: true, accessible: true, type: "room_door_transition", color: "#334155", width: 2 },
      { id: IDs.entranceNode, startNodeId: doorNode.id, endNodeId: waypoint.id, distance: 70, bidirectional: true, accessible: true, type: "hallway", color: "#334155", width: 2 },
    ] as never;
    const expectedNodes = structuredClone(campus.navNodes);
    const expectedEdges = structuredClone(campus.navEdges);
    const templateFloor = {
      ...floor,
      rooms: [{ id: "template-copy-room", name: "New Room", type: "office", x: 200, y: 100, w: 100, h: 80, buildingId: IDs.building, floorId: IDs.floorA }],
      walls: [{ id: "template-copy-wall", x1: 200, y1: 100, x2: 300, y2: 100, thickness: 4, color: "#64748b" }],
      doors: [{ id: "template-copy-door", x: 250, y: 100, width: 18, direction: "right" as const, color: "#b45309", wallId: "template-copy-wall" }],
      furniture: [], windows: [], labels: [], stairs: [], ramps: [], elevators: [],
    };
    const prepared = prepareFloorTemplateReplacement(floor, templateFloor, campus.navNodes, campus.navEdges);
    campus.buildings[0].floors[0] = prepared.floor;

    const afterFirstReload = roundTripHydrate(campus);
    const afterSecondReload = roundTripHydrate(afterFirstReload);
    expect(afterFirstReload.navNodes).toEqual(expectedNodes);
    expect(afterFirstReload.navEdges).toEqual(expectedEdges);
    expect(afterSecondReload.navNodes).toEqual(expectedNodes);
    expect(afterSecondReload.navEdges).toEqual(expectedEdges);
  });

  it("retains Outdoor, source-Floor, other-Floor, and copied-Floor graph through repeated save/reload round-trips", () => {
    const campus = makeCampus([
      { id: IDs.floorA, number: 1, label: "Ground Floor" },
      { id: IDs.floorB, number: 2, label: "Second Floor" },
    ]);
    const source = campus.buildings[0].floors[0];
    source.rooms = [{
      id: "room-source", name: "Clinic", type: "clinic", x: 10, y: 10, w: 40, h: 30,
      buildingId: IDs.building, floorId: IDs.floorA,
      accessDoorId: "door-source", accessDoorIds: ["door-source"], accessNodeId: IDs.roomNode,
    }];
    source.walls = [{ id: "wall-source", x1: 10, y1: 10, x2: 50, y2: 10, thickness: 4, color: "#64748b" }];
    source.doors = [{ id: "door-source", x: 30, y: 10, width: 12, direction: "left", color: "#b45309", wallId: "wall-source" }];

    const outdoor1 = {
      id: IDs.nodeA, name: "Outdoor West", type: "outdoor" as const, x: 400, y: 250,
      campusId: IDs.campus, accessible: true, emergencySafe: true, color: "#1d4ed8",
      outdoorMetadata: { zone: "quad", authoredValues: [1, 2, 3] },
    };
    const outdoor2 = { ...outdoor1, id: IDs.nodeB, name: "Outdoor East", x: 450, y: 260 };
    const sourceRoomNode = createIndoorNavNode({
      id: IDs.roomNode, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA,
      roomId: "room-source", name: "Clinic", type: "room_access", x: 30, y: 15,
    });
    const sourceDoorNode = createIndoorNavNode({
      id: IDs.doorNodeA, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA,
      doorId: "door-source", name: "Clinic Door", type: "hallway", x: 30, y: 10,
    });
    const sourceWaypoint = createIndoorNavNode({
      id: IDs.doorNodeB, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA,
      name: "Clinic Hall", type: "hallway", x: 70, y: 30,
    });
    const otherFloorWaypoint = createIndoorNavNode({
      id: IDs.nodeC, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorB,
      name: "Second Floor Hall", type: "hallway", x: 90, y: 60,
    });
    const otherFloorWaypoint2 = createIndoorNavNode({
      id: "other-floor-waypoint-2", campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorB,
      name: "Second Floor Hall 2", type: "hallway", x: 120, y: 60,
    });
    campus.navNodes = [outdoor1, outdoor2, sourceRoomNode, sourceDoorNode, sourceWaypoint, otherFloorWaypoint, otherFloorWaypoint2];
    campus.navEdges = [
      { id: IDs.edge, startNodeId: outdoor1.id, endNodeId: outdoor2.id, distance: 51, bidirectional: true, accessible: true, type: "walkway", color: "#334155", width: 2, bendPoints: [{ x: 423, y: 255 }], outdoorEdgeMetadata: { authored: true } } as never,
      { id: IDs.edgeB, startNodeId: sourceRoomNode.id, endNodeId: sourceDoorNode.id, distance: 15, bidirectional: true, accessible: true, type: "room_door_transition", color: "#334155", width: 2 },
      { id: IDs.entranceNode, startNodeId: sourceDoorNode.id, endNodeId: sourceWaypoint.id, distance: 44, bidirectional: true, accessible: true, type: "hallway", color: "#334155", width: 2, bendPoints: [{ x: 50, y: 20 }] },
      { id: "other-floor-edge", startNodeId: otherFloorWaypoint.id, endNodeId: otherFloorWaypoint2.id, distance: 30, bidirectional: true, accessible: true, type: "hallway", color: "#334155", width: 2 },
    ];
    const beforeNodes = structuredClone(campus.navNodes);
    const beforeEdges = structuredClone(campus.navEdges);
    const beforeSourceFloor = structuredClone(source);

    const duplicate = duplicateFloorInBuilding(
      campus.buildings[0].floors, IDs.building, IDs.floorA, campus.navNodes, campus.navEdges
    );
    expect(source).toEqual(beforeSourceFloor);
    expect(campus.navNodes).toEqual(beforeNodes);
    expect(campus.navEdges).toEqual(beforeEdges);
    const copiedCampus: Campus = {
      ...campus,
      buildings: campus.buildings.map((building) => building.id === IDs.building
        ? { ...building, floors: duplicate.floors }
        : building),
      navNodes: [...campus.navNodes, ...(duplicate.copiedNavNodes ?? [])],
      navEdges: [...campus.navEdges, ...(duplicate.copiedNavEdges ?? [])],
    };

    const firstReload = roundTripHydrate(copiedCampus);
    const secondReload = roundTripHydrate(firstReload);
    const copy = duplicate.copy!;
    const copiedNodeIds = new Set(duplicate.copiedNavNodes?.map((node) => node.id));
    const copiedEdgeIds = new Set(duplicate.copiedNavEdges?.map((edge) => edge.id));
    for (const protectedNode of beforeNodes) {
      expect(firstReload.navNodes.find((node) => node.id === protectedNode.id)).toMatchObject(protectedNode);
      expect(secondReload.navNodes.find((node) => node.id === protectedNode.id)).toMatchObject(protectedNode);
    }
    for (const protectedEdge of beforeEdges) {
      expect(firstReload.navEdges.find((edge) => edge.id === protectedEdge.id)).toMatchObject(protectedEdge);
      expect(secondReload.navEdges.find((edge) => edge.id === protectedEdge.id)).toMatchObject(protectedEdge);
    }
    for (const id of copiedNodeIds) {
      expect(firstReload.navNodes.find((node) => node.id === id)).toBeDefined();
      expect(secondReload.navNodes.find((node) => node.id === id)).toBeDefined();
    }
    for (const id of copiedEdgeIds) {
      expect(firstReload.navEdges.find((edge) => edge.id === id)).toBeDefined();
      expect(secondReload.navEdges.find((edge) => edge.id === id)).toBeDefined();
    }
    expect(firstReload.navNodes).toHaveLength(copiedCampus.navNodes.length);
    expect(secondReload.navNodes).toHaveLength(copiedCampus.navNodes.length);
    expect(firstReload.navEdges).toHaveLength(copiedCampus.navEdges.length);
    expect(secondReload.navEdges).toHaveLength(copiedCampus.navEdges.length);
    expect(new Set(firstReload.navNodes.map((node) => node.id)).size).toBe(firstReload.navNodes.length);
    expect(new Set(firstReload.navEdges.map((edge) => edge.id)).size).toBe(firstReload.navEdges.length);

    const firstOutdoor = firstReload.navNodes.find((node) => node.id === outdoor1.id)!;
    expect(firstOutdoor).toMatchObject({ x: outdoor1.x, y: outdoor1.y, outdoorMetadata: outdoor1.outdoorMetadata });
    expect(firstReload.navEdges.find((edge) => edge.id === IDs.edge)).toMatchObject(beforeEdges[0]);
    const copiedRoom = firstReload.buildings[0].floors.find((floor) => floor.id === copy.id)!.rooms[0];
    expect(copiedRoom.accessDoorId).toBe(copy.doors[0].id);
    expect(copiedRoom.accessDoorIds).toEqual([copy.doors[0].id]);
    expect(copiedRoom.accessNodeId).toBe(duplicate.copiedNavNodes?.find((node) => node.roomId === copiedRoom.id)?.id);
  });
});

/**
 * A realistically authored campus covering the B2–B5 authoring model: two
 * buildings, non-trivial floor order, full floor interiors, outdoor assets,
 * physical paths, event overlays, and a navigation graph with every supported
 * node/edge metadata concept. Authored in already-normalized form so the
 * round trip is exact (no first-cycle default injection).
 */
function makeMaximalCampus(): Campus {
  // The same physical stairwell appears on both floors: each floor's stair
  // object carries its own id, cross-floor identity is the sharedId.
  const stairSecond = {
    id: "stair-2", x: 200, y: 60, width: 40, height: 80, rotation: 0, direction: "both" as const,
    label: "Stairwell A", floors: [1, 2], sharedId: "stairwell-a", accessible: false, zOrder: 0, visible: true, locked: false,
  };
  const stairGround = { ...stairSecond, id: "stair-g" };
  const secondFloor = {
    id: "flr-2", buildingId: "bldg-eng", number: 2, label: "Second Floor",
    canvasW: 580, canvasH: 380, backgroundColor: "#e8e1d7", showGrid: true, gridSize: 20,
    rooms: [{
      id: "room-201", name: "Room 201", type: "classroom", x: 120, y: 140, w: 60, h: 40, rotation: 0,
      zOrder: 0, visible: true, locked: false, floorId: "flr-2", buildingId: "bldg-eng",
    }],
    paths: [],
    walls: [],
    doors: [{
      id: "door-f2", x: 100, y: 50, width: 20, direction: "left" as const, color: "#b45309",
      zOrder: 0, visible: true, locked: false, label: "Main Door",
    }],
    windows: [], furniture: [],
    stairs: [stairSecond],
    ramps: [], elevators: [], labels: [],
  };
  const groundFloor = {
    id: "flr-g", buildingId: "bldg-eng", number: 1, label: "Ground Floor",
    canvasW: 580, canvasH: 380, backgroundColor: "#e8e1d7", showGrid: true, gridSize: 20,
    rooms: [{
      id: "room-101", name: "Room 101", type: "classroom", x: 120, y: 140, w: 60, h: 40, rotation: 0,
      zOrder: 0, visible: true, locked: false, description: "Lecture hall", accessibility: true,
      floorId: "flr-g", buildingId: "bldg-eng", navConnection: { x: 150, y: 160 },
      accessNodeId: "node-room101", accessType: "door" as const,
    }],
    paths: [{ id: "fp-1", points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], type: "hallway", color: "#94a3b8", width: 4 }],
    walls: [{
      id: "wall-1", x1: 100, y1: 100, x2: 200, y2: 100, thickness: 8, color: "#d6cdc0",
      zOrder: 0, visible: true, locked: false,
    }],
    doors: [{
      id: "door-exit", x: 60, y: 50, width: 20, direction: "left" as const, color: "#b45309",
      zOrder: 0, visible: true, locked: false, label: "Emergency Exit", isEmergencyExit: true,
    }],
    windows: [{ id: "win-1", x: 60, y: 40, width: 30, height: 20, color: "#93c5fd", zOrder: 0, visible: true, locked: false }],
    furniture: [{
      id: "furn-1", type: "desk", name: "Desk", category: "furniture", x: 130, y: 150,
      width: 20, height: 10, rotation: 0, color: "#92400e", zOrder: 0, visible: true, locked: false,
    }],
    stairs: [stairGround],
    ramps: [{
      id: "ramp-1", x: 300, y: 50, width: 30, height: 60, rotation: 0, label: "Access Ramp",
      direction: "both" as const, sharedId: "ramp-1", handrails: true, slope: "gentle" as const,
      accessible: true, zOrder: 0, visible: true, locked: false,
    }],
    elevators: [{
      id: "elev-1", x: 350, y: 40, width: 24, height: 30, rotation: 0, doorWidth: 8,
      label: "Elevator A", floors: [1, 2], sharedId: "elev-a", accessible: true,
      zOrder: 0, visible: true, locked: false,
    }],
    labels: [{
      id: "label-1", x: 150, y: 200, text: "Room 101", fontSize: 12, color: "#333333",
      rotation: 0, align: "center" as const, zOrder: 0, visible: true, locked: false,
    }],
  };
  const campus = makeCampus([{ id: "flr-2", number: 2, label: "Second Floor" }, { id: "flr-g", number: 1, label: "Ground Floor" }]) as Campus;
  return {
    ...campus,
    name: "Max Campus", code: "MAX", description: "Full authoring-model campus",
    canvasW: 1200, canvasH: 800, gridSize: 20, snapToGrid: true, backgroundColor: "#faf7f2",
    measurementUnit: "meters" as const, mapType: "campus-overview" as const,
    buildings: [
      {
        id: "bldg-eng", name: "Engineering Building", code: "ENG", category: "academic", description: "",
        x: 100, y: 200, width: 300, height: 200, rotation: 0, visible: true, color: "#3b82f6", zOrder: 1,
        floors: [secondFloor, groundFloor],
        entrances: [
          { id: "ent-main", buildingId: "bldg-eng", edge: "bottom" as const, offset: 0.5, type: "general" as const, name: "Main Entrance", isPrimary: true, accessible: true },
          { id: "ent-svc", buildingId: "bldg-eng", edge: "left" as const, offset: 0.3, type: "service" as const, name: "Service Entrance", accessible: false },
        ],
      },
      {
        id: "bldg-lib", name: "Library", code: "LIB", category: "library", description: "",
        x: 600, y: 220, width: 220, height: 160, rotation: 15, visible: true, color: "#8b5cf6", zOrder: 0,
        floors: [],
        entrances: [
          { id: "ent-lib", buildingId: "bldg-lib", edge: "bottom" as const, offset: 0.5, type: "general" as const, name: "Library Entrance", isPrimary: true, accessible: true },
        ],
      },
    ],
    markers: [{ id: "marker-1", name: "Main Gate", type: "gate", x: 30, y: 30, color: "#16a34a" }],
    paths: [{
      id: "path-1", points: [{ x: 0, y: 500 }, { x: 250, y: 500 }, { x: 500, y: 500 }],
      type: "walkway", color: "#94a3b8", width: 6, pathNetworkId: "net-1", name: "Central Walkway",
      visible: true, locked: false,
    }],
    routes: [{
      id: "route-1", name: "Campus Tour", description: "Visitor route",
      fromBuildingId: "bldg-eng", toBuildingId: "bldg-lib",
      waypoints: [{ x: 250, y: 400 }, { x: 600, y: 300 }], type: "walking" as const,
      distanceM: 800, durationMin: 12, color: "#2563eb", isActive: true,
    }],
    accessibilityFeatures: [{
      id: "af-1", buildingId: "bldg-eng", type: "accessible_entrance" as const,
      label: "Main entrance ramp", status: "present" as const, notes: "Wheelchair accessible",
    }],
    assemblyPoints: [{
      id: "ap-1", name: "North Field Assembly", x: 700, y: 500, campusId: IDs.campus,
      capacity: 500, accessible: true, navNodeId: "node-out-b",
    }],
    decorAssets: [{
      id: "decor-1", type: "tree" as const, x: 80, y: 60, scale: 1, rotation: 0,
      visible: true, zOrder: 2, name: "Oak",
    }],
    eventOverlays: [{
      id: "eo-1", title: "Foundation Day", description: "Campus-wide celebration",
      dateStart: "2026-09-01T08:00:00.000Z", dateEnd: "2026-09-01T17:00:00.000Z",
      organizer: "Student Council",
      markers: [{ x: 10, y: 20, color: "#e11d48", label: "Stage" }],
      locationRef: { type: "room" as const, buildingId: "bldg-eng", floorId: "flr-g", roomId: "room-101", label: "Engineering Building — Ground Floor — Room 101" },
      restrictedAreas: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }] }],
      isActive: true,
    }],
    navNodes: [
      { id: "node-ent-main", name: "Main Entrance", type: "entrance" as const, x: 250, y: 400, campusId: IDs.campus, buildingId: "bldg-eng", entranceId: "ent-main", accessible: true, color: "#2563eb" },
      { id: "node-out-a", name: "Gate", type: "outdoor" as const, x: 50, y: 500, campusId: IDs.campus, accessible: true, color: "#3b82f6" },
      { id: "node-out-b", name: "Plaza", type: "outdoor" as const, x: 450, y: 500, campusId: IDs.campus, accessible: true, color: "#3b82f6" },
      { id: "node-door-f2", name: "Main Door", type: "hallway" as const, x: 100, y: 50, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-2", doorId: "door-f2", accessible: true, color: "#64748b" },
      { id: "node-room101", name: "Room 101", type: "room_access" as const, x: 150, y: 150, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-g", roomId: "room-101", accessible: true, color: "#64748b" },
      { id: "node-stair-g", name: "Stairwell A", type: "stair" as const, x: 220, y: 140, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-g", stairId: "stair-g", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" as const, color: "#64748b" },
      { id: "node-stair-2", name: "Stairwell A", type: "stair" as const, x: 220, y: 140, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-2", stairId: "stair-2", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" as const, color: "#64748b" },
      { id: "node-elev-g", name: "Elevator A", type: "elevator" as const, x: 362, y: 55, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-g", elevatorId: "elev-1", transitionSharedId: "elev-a", accessible: true, color: "#64748b" },
      { id: "node-ramp-g", name: "Access Ramp", type: "ramp" as const, x: 315, y: 80, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-g", rampId: "ramp-1", accessible: true, color: "#64748b" },
    ],
    navEdges: [
      { id: "edge-out-ab", startNodeId: "node-out-a", endNodeId: "node-out-b", distance: 400, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", bendPoints: [{ x: 250, y: 500 }], color: "#94a3b8", width: 3 },
      { id: "edge-out-ent", startNodeId: "node-out-a", endNodeId: "node-ent-main", distance: 220, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#3b82f6", width: 2 },
      { id: "edge-ent-trans", startNodeId: "node-ent-main", endNodeId: "node-door-f2", distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: "entrance_transition", color: "#2563eb", width: 2 },
      { id: "edge-hall", startNodeId: "node-door-f2", endNodeId: "node-room101", distance: 140, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#64748b", width: 2 },
      { id: "edge-oneway", startNodeId: "node-room101", endNodeId: "node-stair-g", distance: 80, bidirectional: false, accessible: false, inaccessibleReason: "stairs" as const, emergencySafe: false, emergencyReason: "hazard" as const, closed: true, type: "hallway", color: "#94a3b8", width: 2 },
      { id: "edge-trans", startNodeId: "node-stair-g", endNodeId: "node-stair-2", distance: 5, bidirectional: true, accessible: false, inaccessibleReason: "stairs" as const, emergencySafe: true, type: "floor_transition", color: "#64748b", width: 2 },
      { id: "edge-elev", startNodeId: "node-room101", endNodeId: "node-elev-g", distance: 60, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#64748b", width: 2 },
    ],
  };
}

describe("B6 Phase 2 — deterministic round-trip + save/reload integrity", () => {
  afterEach(() => vi.clearAllMocks());

  it("load queries apply deterministic ordering to every structure table", async () => {
    const orderCalls: Array<[string, string]> = [];
    const table = (name: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn(function (this: unknown, column: string) { orderCalls.push([name, column]); return this; }),
      is: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    });
    const from = vi.fn((name: string) => table(name));
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    await campusStructureService.load(makeCampus([{ id: IDs.floorA, number: 1 }]));

    const byTable = new Map<string, string[]>();
    for (const [tableName, column] of orderCalls) {
      byTable.set(tableName, [...(byTable.get(tableName) ?? []), column]);
    }
    expect(byTable.get("buildings")).toEqual(["created_at", "id"]);
    expect(byTable.get("floors")).toEqual(["display_order", "floor_number", "id"]);
    expect(byTable.get("map_elements")).toEqual(["created_at", "id"]);
    expect(byTable.get("navigation_nodes")).toEqual(["created_at", "id"]);
    expect(byTable.get("navigation_edges")).toEqual(["created_at", "id"]);
  });

  it("loads every map element beyond the PostgREST 1,000-row cap", async () => {
    const rows = Array.from({ length: 1_072 }, (_, index) => ({
      id: `30000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      campus_id: IDs.campus,
      building_id: IDs.building,
      floor_id: IDs.floorA,
      element_type: "classroom",
      archived_at: null,
      created_at: "2026-01-01T00:00:00Z",
    }));
    const mapRanges: Array<[number, number]> = [];
    const table = (name: string) => {
      let range: [number, number] = [0, 499];
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        range: vi.fn(function (this: unknown, from: number, to: number) {
          range = [from, to];
          if (name === "map_elements") mapRanges.push(range);
          return this;
        }),
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          const source = name === "map_elements" ? rows : [];
          return Promise.resolve(resolve({ data: source.slice(range[0], range[1] + 1), error: null }));
        },
      };
      return builder;
    };
    const from = vi.fn((name: string) => table(name));
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    const loadedRooms = await roomService.list(IDs.campus);
    expect(loadedRooms).toHaveLength(1_072);
    expect(mapRanges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("maximal authored campus round-trips with all entities and metadata", () => {
    const A = makeMaximalCampus();
    const B = roundTripHydrate(A);

    // Campus identity + canvas data (base-campus passthrough).
    expect(B.id).toBe(IDs.campus);
    expect(B.name).toBe("Max Campus");
    expect(B.canvasW).toBe(1200);
    expect(B.canvasH).toBe(800);
    expect(B.gridSize).toBe(20);
    expect(B.measurementUnit).toBe("meters");

    // Buildings: ids + order, geometry/rotation/appearance, entrance metadata.
    expect(B.buildings.map((b) => b.id)).toEqual(["bldg-eng", "bldg-lib"]);
    const eng = B.buildings[0];
    expect(eng).toMatchObject({
      name: "Engineering Building", code: "ENG", category: "academic", description: "",
      x: 100, y: 200, width: 300, height: 200, rotation: 0, visible: true, color: "#3b82f6", zOrder: 1,
    });
    expect(eng.entrances?.map((e) => e.id)).toEqual(["ent-main", "ent-svc"]);
    expect(eng.entrances?.[0]).toMatchObject({ edge: "bottom", offset: 0.5, type: "general", name: "Main Entrance", isPrimary: true, accessible: true });
    expect(eng.entrances?.[1]).toMatchObject({ type: "service", accessible: false });
    expect(B.buildings[1]).toMatchObject({ id: "bldg-lib", name: "Library", rotation: 15 });

    // Floors: the editor's explicit authored order (Second Floor first) is
    // preserved — not re-sorted numerically.
    expect(eng.floors.map((f) => f.id)).toEqual(["flr-2", "flr-g"]);
    expect(eng.floors.map((f) => f.number)).toEqual([2, 1]);
    const ground = eng.floors[1];
    expect(ground).toMatchObject({ label: "Ground Floor", canvasW: 580, canvasH: 380, backgroundColor: "#e8e1d7", showGrid: true, gridSize: 20 });

    // Rooms.
    expect(ground.rooms.map((r) => r.id)).toEqual(["room-101"]);
    expect(ground.rooms[0]).toMatchObject({
      name: "Room 101", type: "classroom", x: 120, y: 140, w: 60, h: 40, description: "Lecture hall",
      accessibility: true, floorId: "flr-g", buildingId: "bldg-eng", navConnection: { x: 150, y: 160 },
      accessNodeId: "node-room101", accessType: "door",
    });

    // Floor interiors: paths, walls, doors, windows, furniture, stairs, ramps, elevators, labels.
    expect(ground.paths).toEqual([{ id: "fp-1", points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], type: "hallway", color: "#94a3b8", width: 4 }]);
    expect(ground.walls).toEqual([{ id: "wall-1", x1: 100, y1: 100, x2: 200, y2: 100, thickness: 8, color: "#d6cdc0", zOrder: 0, visible: true, locked: false }]);
    expect(ground.doors[0]).toMatchObject({ id: "door-exit", x: 60, y: 50, width: 20, direction: "left", label: "Emergency Exit", isEmergencyExit: true });
    expect(ground.windows[0]).toMatchObject({ id: "win-1", width: 30, height: 20 });
    expect(ground.furniture[0]).toMatchObject({ id: "furn-1", type: "desk", name: "Desk", category: "furniture" });
    expect(ground.stairs[0]).toMatchObject({ id: "stair-g", direction: "both", label: "Stairwell A", floors: [1, 2], sharedId: "stairwell-a", accessible: false });
    expect(ground.ramps[0]).toMatchObject({ id: "ramp-1", handrails: true, slope: "gentle", accessible: true, sharedId: "ramp-1" });
    expect(ground.elevators[0]).toMatchObject({ id: "elev-1", doorWidth: 8, floors: [1, 2], sharedId: "elev-a" });
    expect(ground.labels[0]).toMatchObject({ id: "label-1", text: "Room 101", fontSize: 12, align: "center" });
    // Second floor: shared stair identity + entry door.
    expect(eng.floors[0].stairs[0]).toMatchObject({ sharedId: "stairwell-a", accessible: false });
    expect(eng.floors[0].doors[0]).toMatchObject({ id: "door-f2", label: "Main Door" });

    // Campus-level entities.
    expect(B.markers).toEqual([{ id: "marker-1", name: "Main Gate", type: "gate", x: 30, y: 30, color: "#16a34a" }]);
    expect(B.paths).toEqual(A.paths);
    expect(B.routes).toEqual(A.routes);
    expect(B.accessibilityFeatures).toEqual(A.accessibilityFeatures);
    expect(B.assemblyPoints).toEqual(A.assemblyPoints);
    expect(B.decorAssets).toEqual(A.decorAssets);
    expect(B.eventOverlays).toEqual(A.eventOverlays);

    // Navigation nodes: ids, links, transitionSharedId, derived geometry.
    expect(B.navNodes?.map((n) => n.id).sort()).toEqual(
      ["node-ent-main", "node-out-a", "node-out-b", "node-door-f2", "node-room101", "node-stair-g", "node-stair-2", "node-elev-g", "node-ramp-g"].sort()
    );
    const node = new Map(B.navNodes!.map((n) => [n.id, n]));
    expect(node.get("node-ent-main")).toMatchObject({ type: "entrance", x: 250, y: 400, buildingId: "bldg-eng", entranceId: "ent-main", accessible: true });
    expect(node.get("node-out-a")).toMatchObject({ type: "outdoor", x: 50, y: 500 });
    expect(node.get("node-out-b")).toMatchObject({ type: "outdoor", x: 450, y: 500 });
    expect(node.get("node-door-f2")).toMatchObject({ type: "hallway", x: 100, y: 50, buildingId: "bldg-eng", floorId: "flr-2", doorId: "door-f2" });
    expect(node.get("node-room101")).toMatchObject({ type: "room_access", x: 150, y: 150, floorId: "flr-g", roomId: "room-101" });
    expect(node.get("node-stair-g")).toMatchObject({ type: "stair", x: 220, y: 140, floorId: "flr-g", stairId: "stair-g", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" });
    expect(node.get("node-stair-2")).toMatchObject({ type: "stair", x: 220, y: 140, floorId: "flr-2", stairId: "stair-2", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" });
    expect(node.get("node-elev-g")).toMatchObject({ type: "elevator", x: 362, y: 55, elevatorId: "elev-1", transitionSharedId: "elev-a" });
    expect(node.get("node-ramp-g")).toMatchObject({ type: "ramp", x: 315, y: 80, rampId: "ramp-1" });

    // Navigation edges: endpoints, distance, direction, accessibility, emergency, closed, bends, types.
    expect(B.navEdges?.map((e) => e.id).sort()).toEqual(
      ["edge-out-ab", "edge-out-ent", "edge-ent-trans", "edge-hall", "edge-oneway", "edge-trans", "edge-elev"].sort()
    );
    const edge = new Map(B.navEdges!.map((e) => [e.id, e]));
    expect(edge.get("edge-out-ab")).toMatchObject({ startNodeId: "node-out-a", endNodeId: "node-out-b", distance: 400, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", bendPoints: [{ x: 250, y: 500 }] });
    expect(edge.get("edge-ent-trans")).toMatchObject({ startNodeId: "node-ent-main", endNodeId: "node-door-f2", type: "entrance_transition", accessible: true });
    expect(edge.get("edge-oneway")).toMatchObject({ bidirectional: false, accessible: false, inaccessibleReason: "stairs", emergencySafe: false, emergencyReason: "hazard", closed: true, type: "hallway" });
    expect(edge.get("edge-trans")).toMatchObject({ startNodeId: "node-stair-g", endNodeId: "node-stair-2", type: "floor_transition", accessible: false, inaccessibleReason: "stairs" });
    expect(edge.get("edge-elev")).toMatchObject({ startNodeId: "node-room101", endNodeId: "node-elev-g", type: "hallway" });
  });

  it("round trip is idempotent — repeated save does not progressively mutate data", () => {
    const A = makeMaximalCampus();
    const first = serializeCampusStructure(A);
    const B = roundTripHydrate(A);
    const second = serializeCampusStructure(B);
    const C = roundTripHydrate(B);
    const third = serializeCampusStructure(C);

    // The first cycle must not change the payload at all (fixture is already
    // in normalized form), and later cycles must be byte-stable.
    expect(second).toEqual(first);
    expect(third).toEqual(second);

    // No new ids, no duplicates, no floor reordering, no missing metadata.
    expect(second.navigation_nodes.map((n) => n.id)).toEqual(first.navigation_nodes.map((n) => n.id));
    expect(second.navigation_edges.map((e) => e.id)).toEqual(first.navigation_edges.map((e) => e.id));
    expect(second.floors.map((f) => f.id)).toEqual(first.floors.map((f) => f.id));
    expect(second.map_elements.map((el) => String(el.id))).toEqual(first.map_elements.map((el) => String(el.id)));
    const count = <T>(list: T[], id: (item: T) => string) => new Map([...new Set(list.map(id))].map((k) => [k, list.filter((item) => id(item) === k).length]));
    expect([...count(second.map_elements, (el) => String(el.id)).values()]).toEqual([...count(second.map_elements, (el) => String(el.id)).values()].map(() => 1));
    expect(second.navigation_edges).toHaveLength(first.navigation_edges.length);
    // The closed edge stays closed; bends stay unchanged through both cycles.
    const closedEdge = second.navigation_edges.find((e) => (e.metadata as { ui?: { closed?: boolean } }).ui?.closed === true)!;
    expect(closedEdge).toBeTruthy();
    expect((third.navigation_edges.find((e) => e.id === closedEdge.id)!.metadata as { ui: { bendPoints?: unknown[] } }).ui.bendPoints)
      .toEqual((second.navigation_edges.find((e) => e.id === closedEdge.id)!.metadata as { ui: { bendPoints?: unknown[] } }).ui.bendPoints);
  });

  it("physical paths stay physical paths and nav edges stay nav edges", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    campus.paths = [{ id: "path-x", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], type: "road", color: "#334155", width: 5, pathNetworkId: "net-x", name: "Ring Road", visible: true }];
    campus.navNodes = [
      { id: "n1", name: "Gate", type: "outdoor", x: 0, y: 0, campusId: IDs.campus, accessible: true, color: "#3b82f6" },
      { id: "n2", name: "Plaza", type: "outdoor", x: 100, y: 0, campusId: IDs.campus, accessible: true, color: "#3b82f6" },
    ];
    campus.navEdges = [{ id: "e1", startNodeId: "n1", endNodeId: "n2", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#3b82f6", width: 2 }];

    const payload = serializeCampusStructure(campus);
    expect(payload.map_elements.filter((el) => (el.metadata as { kind?: string })?.kind === "campus_path")).toHaveLength(1);
    expect(payload.navigation_edges).toHaveLength(1);

    const hydrated = roundTripHydrate(campus);
    // Physical path stays a physical path — never becomes a nav edge.
    expect(hydrated.paths).toEqual(campus.paths);
    expect(hydrated.paths.some((p) => p.id === "e1")).toBe(false);
    // Nav edge stays a graph edge — never becomes a physical path, no bendPoints invented.
    expect(hydrated.navEdges?.map((e) => e.id)).toEqual(["e1"]);
    expect(hydrated.navEdges?.[0]).toMatchObject({ startNodeId: "n1", endNodeId: "n2", type: "walkway" });
    expect(hydrated.navEdges?.[0].bendPoints).toBeUndefined();

    // A second save keeps the separation intact.
    const again = serializeCampusStructure(hydrated);
    expect(again.map_elements.filter((el) => (el.metadata as { kind?: string })?.kind === "campus_path")).toHaveLength(1);
    expect(again.navigation_edges).toHaveLength(1);
  });

  it("navigation edge and node metadata survives round trip", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [{ id: "room-z", name: "Room Z", type: "classroom", x: 40, y: 40, w: 30, h: 20, floorId: IDs.floorA, buildingId: IDs.building }];
    floor.doors = [{ id: "door-z", x: 10, y: 10, width: 20, direction: "left", color: "#b45309" }];
    campus.navNodes = [
      { id: "node-door", name: "Door Z", type: "hallway", x: 10, y: 10, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, doorId: "door-z", accessible: true, color: "#64748b" },
      { id: "node-room", name: "Room Z", type: "room_access", x: 50, y: 50, campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, roomId: "room-z", accessible: true, color: "#64748b" },
    ];
    campus.navEdges = [{
      id: "edge-z", startNodeId: "node-door", endNodeId: "node-room", distance: 42.5,
      bidirectional: false, accessible: false, inaccessibleReason: "narrow_path",
      emergencySafe: false, emergencyReason: "blocked", closed: true,
      bendPoints: [{ x: 20, y: 20 }, { x: 30, y: 30 }], type: "hallway", color: "#64748b", width: 2,
    }];

    const hydrated = roundTripHydrate(campus);
    expect(hydrated.navNodes?.find((n) => n.id === "node-door")).toMatchObject({
      id: "node-door", name: "Door Z", type: "hallway", x: 10, y: 10,
      campusId: IDs.campus, buildingId: IDs.building, floorId: IDs.floorA, doorId: "door-z", accessible: true, color: "#64748b",
    });
    expect(hydrated.navNodes?.find((n) => n.id === "node-room")).toMatchObject({
      id: "node-room", roomId: "room-z", buildingId: IDs.building, floorId: IDs.floorA,
    });
    expect(hydrated.navEdges?.find((e) => e.id === "edge-z")).toMatchObject({
      id: "edge-z", startNodeId: "node-door", endNodeId: "node-room", distance: 42.5,
      bidirectional: false, accessible: false, inaccessibleReason: "narrow_path",
      emergencySafe: false, emergencyReason: "blocked", closed: true,
      bendPoints: [{ x: 20, y: 20 }, { x: 30, y: 30 }], type: "hallway", color: "#64748b", width: 2,
    });
  });

  it("keeps a disconnected manual point and its bent path after save/reload", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    campus.navNodes = [
      { id: "manual-a", name: "A", type: "outdoor", x: 20, y: 30, campusId: IDs.campus, accessible: true, color: "#2563eb" },
      { id: "manual-b", name: "B", type: "outdoor", x: 180, y: 30, campusId: IDs.campus, accessible: true, color: "#2563eb" },
      { id: "manual-free", name: "Unconnected", type: "outdoor", x: 90, y: 160, campusId: IDs.campus, accessible: true, color: "#2563eb" },
    ];
    campus.navEdges = [{
      id: "manual-edge", startNodeId: "manual-a", endNodeId: "manual-b", distance: 190,
      bidirectional: true, accessible: true, emergencySafe: true, bendPoints: [{ x: 80, y: 30 }, { x: 80, y: 100 }],
      type: "walkway", color: "#2563eb", width: 2,
    }];
    const hydrated = roundTripHydrate(campus);
    expect(hydrated.navNodes?.map((node) => node.id)).toEqual(["manual-a", "manual-b", "manual-free"]);
    expect(hydrated.navEdges).toEqual(campus.navEdges);
    expect(hydrated.navNodes?.find((node) => node.id === "manual-free")).toMatchObject({ x: 90, y: 160, name: "Unconnected" });
  });

  it("hydrates legacy navigation rows from database columns when metadata.ui is absent", () => {
    const campus = makeCampus([{ id: IDs.floorA, number: 1 }]) as Campus;
    const rows = serializeCampusStructure({
      ...campus,
      navNodes: [
        { id: "legacy-a", name: "Legacy A", type: "outdoor", x: 12, y: 24, campusId: IDs.campus, accessible: true, color: "#123456" },
        { id: "legacy-b", name: "Legacy B", type: "outdoor", x: 100, y: 24, campusId: IDs.campus, accessible: true, color: "#123456" },
      ],
      navEdges: [{ id: "legacy-edge", startNodeId: "legacy-a", endNodeId: "legacy-b", distance: 88, bidirectional: false, accessible: true, emergencySafe: true, type: "walkway", color: "#123456", width: 3, bendPoints: [{ x: 50, y: 40 }] }],
    } as Campus);
    const hydrated = hydrateCampusStructure(campus, {
      buildings: rows.buildings as never,
      floors: rows.floors.map((row) => ({ ...row, display_order: Number(row.display_order ?? 0), floor_number: Number(row.floor_number ?? 1) })) as never,
      mapElements: rows.map_elements as never,
      navigationNodes: rows.navigation_nodes.map((row) => ({ ...row, campus_id: IDs.campus, metadata: null })) as never,
      navigationEdges: rows.navigation_edges.map((row) => ({ ...row, campus_id: IDs.campus, metadata: null })) as never,
    });
    expect(hydrated.navNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "legacy-a", name: "Legacy A", type: "outdoor", x: 12, y: 24, campusId: IDs.campus, accessible: true }),
      expect.objectContaining({ id: "legacy-b", name: "Legacy B", type: "outdoor", x: 100, y: 24, campusId: IDs.campus, accessible: true }),
    ]));
    expect(hydrated.navEdges).toEqual([
      expect.objectContaining({ id: "legacy-edge", startNodeId: "legacy-a", endNodeId: "legacy-b", distance: 88, bidirectional: false, type: "walkway" }),
    ]);
  });
});
