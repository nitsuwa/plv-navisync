import { afterEach, describe, expect, it, vi } from "vitest";
import type { Campus } from "../../components/map-builder/types";
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
