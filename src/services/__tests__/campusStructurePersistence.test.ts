import { afterEach, describe, expect, it, vi } from "vitest";
import type { Campus, CampusEventOverlay } from "../../components/map-builder/types";
import { getSupabase } from "../../lib/supabase";
import {
  campusStructureService,
  hydrateCampusStructure,
  navigationEdgePairConflictIds,
  planFloorNumberWrites,
  rekeyNavigationEdgePayloadPairs,
  serializeCampusStructure,
  type FloorNumberRow,
} from "../campusStructureService";
import { ENTRANCE_TRANSITION_EDGE_TYPE, linkEntranceToIndoorDoor, removeEntranceIndoorConnection } from "../../lib/entranceTransitions";
import { createIndoorNavNode } from "../../lib/indoorNavigationGraph";

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

  it("serializer keeps final floor numbers unique per building while preserving own numbers", () => {
    const campus = makeCampus([
      { id: IDs.floorA, number: 1 },
      { id: IDs.floorB, number: 3 },
    ]);
    const payload = serializeCampusStructure(campus);
    expect(payload.floors.map((f) => f.floor_number).sort()).toEqual([1, 3]);
    expect(new Set(payload.floors.map((f) => f.floor_number)).size).toBe(2);
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
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      is: vi.fn().mockResolvedValue({ data, error: null }),
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
      is: vi.fn().mockResolvedValue({ data, error: null }),
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
      { id: "node-stair-g", name: "Stairwell A", type: "stair" as const, x: 220, y: 100, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-g", stairId: "stair-g", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" as const, color: "#64748b" },
      { id: "node-stair-2", name: "Stairwell A", type: "stair" as const, x: 220, y: 100, campusId: IDs.campus, buildingId: "bldg-eng", floorId: "flr-2", stairId: "stair-2", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" as const, color: "#64748b" },
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
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    expect(node.get("node-stair-g")).toMatchObject({ type: "stair", x: 220, y: 100, floorId: "flr-g", stairId: "stair-g", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" });
    expect(node.get("node-stair-2")).toMatchObject({ type: "stair", x: 220, y: 100, floorId: "flr-2", stairId: "stair-2", transitionSharedId: "stairwell-a", accessible: false, inaccessibleReason: "stairs" });
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
});
