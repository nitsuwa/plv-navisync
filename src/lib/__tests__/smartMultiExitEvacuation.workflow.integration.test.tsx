import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campus, CampusBuilding, FloorPlan, FloorRoom, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import { RoomEmergencyEvacuationSection } from "../../components/map-builder/RoomEmergencyEvacuationSection";
import { UnifiedRoutePlannerDialog } from "../../components/map/UnifiedRoutePlannerDialog";
import { RouteMapOverlay } from "../../components/map/RouteMapOverlay";
import type { RoomDest } from "../combinedPathfinding";
import { studentRouteUiReducer, initialStudentRouteUiState, studentFacingRouteSteps } from "../studentRouteFlow";
import { readCampusDraft, writeCampusDraft, clearCampusDraft } from "../campusDraftPersistence";
import { guidedRouteProgressDuration, navigationWalkDuration } from "../walkingAnimation";
import { evaluateRoomEmergencyEvacuation } from "../roomEmergencyEvacuation";
import { resolveAutomaticStudentEvacuationRoutes, studentEmergencyCampusRouteSegments, studentEmergencyFloorRouteSegments } from "../studentEmergencyEvacuation";
import { planStudentEmergencyRoute } from "../studentEmergencyNavigation";
import { assemblyPointReviewFingerprint } from "../emergencyAssemblyPoints";
import { serializeCampusStructure, hydrateCampusStructure } from "../../services/campusStructureService";
import { listPublishedCampusSnapshots, publishCampusVersion } from "../../services/campusService";

const dbState = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

// Keep the real publication service in the workflow, but replace only the
// network boundary with an in-memory database that cannot reach production.
vi.mock("../../lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: dbState.getUser }, from: dbState.from, rpc: dbState.rpc }),
}));

const ids = {
  campus: "30000000-0000-4000-8000-000000000001",
  building: "30000000-0000-4000-8000-000000000002",
  ground: "30000000-0000-4000-8000-000000000003",
  upper: "30000000-0000-4000-8000-000000000004",
  room: "30000000-0000-4000-8000-000000000005",
  roomNode: "30000000-0000-4000-8000-000000000006",
  doorA: "30000000-0000-4000-8000-000000000007",
  doorB: "30000000-0000-4000-8000-000000000008",
  exitDoorGround: "30000000-0000-4000-8000-000000000009",
  exitDoorUpper: "30000000-0000-4000-8000-000000000010",
  wallA: "30000000-0000-4000-8000-000000000011",
  wallB: "30000000-0000-4000-8000-000000000012",
};

const node = (id: string, x: number, y: number, refs: Partial<NavigationNode> = {}): NavigationNode => ({
  id, name: id, type: "hallway", x, y, buildingId: ids.building, floorId: ids.upper,
  accessible: true, color: "#2563eb", ...refs,
});

const edge = (id: string, startNodeId: string, endNodeId: string, distance = 10, type: NavigationEdge["type"] = "hallway", bidirectional = true): NavigationEdge => ({
  id, startNodeId, endNodeId, distance, bidirectional, accessible: true,
  emergencySafe: true, type, color: "#2563eb", width: 3,
});

/** A two-door auditorium: Door A uses the upper-floor egress; Door B uses an authored stair transition to the ground exit. */
function makeWorkflowCampus(): Campus {
  const room: FloorRoom = {
    id: ids.room, name: "Test Auditorium", type: "auditorium", x: 100, y: 100, w: 120, h: 70,
    buildingId: ids.building, floorId: ids.upper, accessDoorId: ids.doorA, accessDoorIds: [ids.doorA, ids.doorB],
  };
  const ground: FloorPlan = {
    id: ids.ground, buildingId: ids.building, number: 1, label: "Ground Floor", canvasW: 700, canvasH: 500,
    rooms: [], paths: [], walls: [], doors: [
      { id: ids.exitDoorGround, x: 600, y: 70, width: 12, direction: "right", color: "#dc2626", isEmergencyExit: true },
    ], windows: [], furniture: [], stairs: [
      { id: "30000000-0000-4000-8000-000000000015", label: "Inner stairs", x: 330, y: 300, width: 28, height: 34, direction: "up", sharedId: "inner-stair", emergencySafe: true },
    ], ramps: [], elevators: [], labels: [],
  };
  const upper: FloorPlan = {
    id: ids.upper, buildingId: ids.building, number: 2, label: "Floor 2", canvasW: 700, canvasH: 500,
    rooms: [room], paths: [], walls: [
      { id: ids.wallA, x1: 100, y1: 100, x2: 100, y2: 170, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: room.id, edge: "left", offset: 0.5 } },
      { id: ids.wallB, x1: 220, y1: 100, x2: 220, y2: 170, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: room.id, edge: "right", offset: 0.5 } },
    ], doors: [
      { id: ids.doorA, label: "Auditorium Door A", x: 100, y: 135, width: 12, direction: "left", color: "#d97706", wallId: ids.wallA, offset: 0.5 },
      { id: ids.doorB, label: "Auditorium Door B", x: 220, y: 135, width: 12, direction: "right", color: "#d97706", wallId: ids.wallB, offset: 0.5 },
      { id: ids.exitDoorUpper, x: 600, y: 425, width: 12, direction: "right", color: "#dc2626", isEmergencyExit: true },
    ], windows: [], furniture: [], stairs: [
      { id: "30000000-0000-4000-8000-000000000016", label: "Inner stairs", x: 330, y: 80, width: 28, height: 34, direction: "down", sharedId: "inner-stair", emergencySafe: true },
    ], ramps: [], elevators: [], labels: [],
  };
  const building: CampusBuilding = {
    id: ids.building, name: "Test Building", code: "TEST", category: "academic", description: "Isolated workflow fixture",
    x: 0, y: 0, width: 700, height: 500, color: "#ddd", visible: true, floors: [ground, upper],
    entrances: [
      { id: "30000000-0000-4000-8000-000000000017", buildingId: ids.building, edge: "right", offset: 0.15, type: "emergency_exit", name: "Ground Emergency Exit" },
      { id: "30000000-0000-4000-8000-000000000018", buildingId: ids.building, edge: "right", offset: 0.85, type: "emergency_exit", name: "Upper Emergency Exit" },
    ],
  };
  const groundEntranceId = building.entrances![0].id;
  const upperEntranceId = building.entrances![1].id;
  const nodes: NavigationNode[] = [
    node(ids.roomNode, 160, 125, { type: "room_access", roomId: ids.room, floorId: ids.upper, name: room.name }),
    node("30000000-0000-4000-8000-000000000019", 100, 135, { doorId: ids.doorA, floorId: ids.upper, name: "Auditorium Door A" }),
    node("30000000-0000-4000-8000-000000000020", 220, 135, { doorId: ids.doorB, floorId: ids.upper, name: "Auditorium Door B" }),
    node("30000000-0000-4000-8000-000000000021", 300, 135, { floorId: ids.upper, name: "Upper route junction" }),
    node("30000000-0000-4000-8000-000000000044", 580, 425, { floorId: ids.upper, name: "Upper egress approach" }),
    node("30000000-0000-4000-8000-000000000022", 600, 425, { doorId: ids.exitDoorUpper, floorId: ids.upper, name: "Upper exit door" }),
    node("30000000-0000-4000-8000-000000000023", 344, 114, { type: "stair", stairId: upper.stairs[0].id, transitionSharedId: "inner-stair", floorId: ids.upper, name: "Inner stairs, Floor 2" }),
    node("30000000-0000-4000-8000-000000000024", 344, 334, { type: "stair", stairId: ground.stairs[0].id, transitionSharedId: "inner-stair", floorId: ids.ground, name: "Inner stairs, Ground Floor" }),
    node("30000000-0000-4000-8000-000000000025", 500, 300, { floorId: ids.ground, name: "Ground corridor" }),
    node("30000000-0000-4000-8000-000000000045", 580, 70, { floorId: ids.ground, name: "Ground egress approach" }),
    node("30000000-0000-4000-8000-000000000026", 600, 70, { doorId: ids.exitDoorGround, floorId: ids.ground, name: "Ground exit door" }),
    node("30000000-0000-4000-8000-000000000027", 700, 75, { buildingId: ids.building, floorId: undefined, entranceId: groundEntranceId, type: "entrance", name: "Ground Emergency Exit" }),
    node("30000000-0000-4000-8000-000000000028", 730, 75, { buildingId: undefined, floorId: undefined, type: "outdoor", name: "Ground exit discharge" }),
    node("30000000-0000-4000-8000-000000000029", 700, 425, { buildingId: ids.building, floorId: undefined, entranceId: upperEntranceId, type: "entrance", name: "Upper Emergency Exit" }),
    node("30000000-0000-4000-8000-000000000030", 730, 425, { buildingId: undefined, floorId: undefined, type: "outdoor", name: "Upper exit discharge" }),
    node("30000000-0000-4000-8000-000000000050", 790, 250, { buildingId: undefined, floorId: undefined, type: "outdoor", name: "Shared assembly approach" }),
    node("30000000-0000-4000-8000-000000000051", 820, 250, { buildingId: undefined, floorId: undefined, type: "assembly", assemblyPointId: "30000000-0000-4000-8000-000000000052", name: "Test Assembly Point" }),
  ];
  const navEdges = [
    edge("30000000-0000-4000-8000-000000000031", ids.roomNode, "30000000-0000-4000-8000-000000000019", 1, "room_door_transition"),
    edge("30000000-0000-4000-8000-000000000032", ids.roomNode, "30000000-0000-4000-8000-000000000020", 1, "room_door_transition"),
    edge("30000000-0000-4000-8000-000000000033", "30000000-0000-4000-8000-000000000019", "30000000-0000-4000-8000-000000000021", 20),
    edge("30000000-0000-4000-8000-000000000034", "30000000-0000-4000-8000-000000000021", "30000000-0000-4000-8000-000000000044", 20),
    edge("30000000-0000-4000-8000-000000000046", "30000000-0000-4000-8000-000000000044", "30000000-0000-4000-8000-000000000022", 5),
    edge("30000000-0000-4000-8000-000000000035", "30000000-0000-4000-8000-000000000021", "30000000-0000-4000-8000-000000000023", 25),
    edge("30000000-0000-4000-8000-000000000036", "30000000-0000-4000-8000-000000000020", "30000000-0000-4000-8000-000000000023", 15),
    edge("30000000-0000-4000-8000-000000000037", "30000000-0000-4000-8000-000000000023", "30000000-0000-4000-8000-000000000024", 5, "floor_transition"),
    edge("30000000-0000-4000-8000-000000000038", "30000000-0000-4000-8000-000000000024", "30000000-0000-4000-8000-000000000025", 20),
    edge("30000000-0000-4000-8000-000000000039", "30000000-0000-4000-8000-000000000025", "30000000-0000-4000-8000-000000000045", 20),
    edge("30000000-0000-4000-8000-000000000047", "30000000-0000-4000-8000-000000000045", "30000000-0000-4000-8000-000000000026", 5),
    edge("30000000-0000-4000-8000-000000000040", "30000000-0000-4000-8000-000000000026", "30000000-0000-4000-8000-000000000027", 1, "entrance_transition", false),
    edge("30000000-0000-4000-8000-000000000041", "30000000-0000-4000-8000-000000000027", "30000000-0000-4000-8000-000000000028", 1),
    edge("30000000-0000-4000-8000-000000000042", "30000000-0000-4000-8000-000000000022", "30000000-0000-4000-8000-000000000029", 1, "entrance_transition", false),
    edge("30000000-0000-4000-8000-000000000043", "30000000-0000-4000-8000-000000000029", "30000000-0000-4000-8000-000000000030", 1),
    edge("30000000-0000-4000-8000-000000000053", "30000000-0000-4000-8000-000000000028", "30000000-0000-4000-8000-000000000050", 12),
    edge("30000000-0000-4000-8000-000000000054", "30000000-0000-4000-8000-000000000030", "30000000-0000-4000-8000-000000000050", 18),
    edge("30000000-0000-4000-8000-000000000055", "30000000-0000-4000-8000-000000000050", "30000000-0000-4000-8000-000000000051", 10),
  ];
  const campus = {
    id: ids.campus, name: "Isolated Emergency Workflow", code: "IEW", description: "Test fixture", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false, features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: false },
    canvasW: 1200, canvasH: 800, settings: { accessibility: true, emergency: true, eventLayer: false, gps: false }, buildings: [building], markers: [], paths: [], navNodes: nodes, navEdges,
    assemblyPoints: [{ id: "30000000-0000-4000-8000-000000000052", name: "Test Assembly Point", x: 820, y: 250, campusId: ids.campus, navNodeId: "30000000-0000-4000-8000-000000000051", buildingAssignments: [{ buildingId: ids.building, designation: "primary" as const }] }],
    createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z",
  } as Campus;
  const point = campus.assemblyPoints![0];
  campus.assemblyPoints = [{
    ...point,
    safetyReview: {
      status: "approved",
      approvedAt: "2026-10-14T00:00:00.000Z",
      approvedBy: "isolated-fixture-reviewer",
      approvedByRole: "admin",
      fingerprint: assemblyPointReviewFingerprint(campus, point) ?? undefined,
    },
  }];
  return campus;
}

let publishedSnapshot: Record<string, unknown> | null = null;
let nextVersionId = "30000000-0000-4000-8000-000000000099";

function inMemoryQuery(table: string) {
  let operation: "select" | "insert" = "select";
  let payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  const query: Record<string, (...args: unknown[]) => unknown> & { then?: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown> } = {};
  query.select = () => query;
  query.eq = () => query;
  query.order = () => query;
  query.limit = () => query;
  query.maybeSingle = async () => ({ data: null, error: null });
  query.insert = (value) => { operation = "insert"; payload = value as typeof payload; return query; };
  query.single = async () => {
    if (table === "campus_versions" && operation === "insert") {
      const row = Array.isArray(payload) ? payload[0] : payload;
      publishedSnapshot = (row?.snapshot as Record<string, unknown>) ?? null;
      return { data: { id: nextVersionId }, error: null };
    }
    return { data: null, error: null };
  };
  query.then = (resolve, reject) => Promise.resolve({ data: operation === "select" ? [] : null, error: null }).then(resolve, reject);
  return query;
}

beforeEach(() => {
  publishedSnapshot = null;
  dbState.getUser.mockResolvedValue({ data: { user: { id: "30000000-0000-4000-8000-000000000098" } }, error: null });
  dbState.from.mockImplementation((table: string) => inMemoryQuery(table));
  dbState.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
    if (name === "publish_campus_version") return { data: args?.p_version_id, error: null };
    if (name === "list_event_safe_published_campuses") return { data: publishedSnapshot ? [{ snapshot: publishedSnapshot, published_at: "2026-10-14T00:01:00.000Z" }] : [], error: null };
    return { data: null, error: null };
  });
});

afterEach(() => {
  clearCampusDraft(ids.campus);
  vi.clearAllMocks();
});

function updateRoomConfiguration(campus: Campus, config: NonNullable<FloorRoom["emergencyEvacuation"]>): Campus {
  return {
    ...campus,
    buildings: campus.buildings.map((building) => building.id !== ids.building ? building : {
      ...building,
      floors: building.floors.map((floor) => floor.id !== ids.upper ? floor : {
        ...floor,
        rooms: floor.rooms.map((room) => room.id === ids.room ? { ...room, emergencyEvacuation: config } : room),
      }),
    }),
  };
}

function adminHarness(initial: Campus, onCampus: (campus: Campus) => void) {
  let current = initial;
  function Harness() {
    const [campus, setCampus] = useState(initial);
    current = campus;
    onCampus(campus);
    const room = campus.buildings[0].floors[1].rooms[0];
    return <RoomEmergencyEvacuationSection
      campus={campus} buildingId={ids.building} floorId={ids.upper} room={room}
      onChange={(configuration) => setCampus((value) => updateRoomConfiguration(value, configuration))}
    />;
  }
  return { Harness, getCampus: () => current };
}

const roomDestination = (): RoomDest => ({
  type: "room", buildingId: ids.building, floorNumber: 2, roomId: ids.room, roomName: "Test Auditorium",
  buildingLabel: "Test Building", buildingCode: "TEST",
});

function authoredGeometry(campus: Campus) {
  return {
    buildings: campus.buildings.map((building) => ({
      id: building.id, x: building.x, y: building.y, width: building.width, height: building.height,
      entrances: building.entrances?.map((entrance) => ({ id: entrance.id, edge: entrance.edge, offset: entrance.offset })),
      floors: building.floors.map((floor) => ({
        id: floor.id,
        rooms: floor.rooms.map((room) => ({ id: room.id, x: room.x, y: room.y, w: room.w, h: room.h })),
        doors: floor.doors.map((door) => ({ id: door.id, x: door.x, y: door.y, width: door.width, wallId: door.wallId })),
        stairs: floor.stairs.map((stair) => ({ id: stair.id, x: stair.x, y: stair.y, width: stair.width, height: stair.height })),
      })),
    })),
    nodes: campus.navNodes?.map((item) => ({ id: item.id, x: item.x, y: item.y, buildingId: item.buildingId, floorId: item.floorId, roomId: item.roomId, doorId: item.doorId, stairId: item.stairId, entranceId: item.entranceId })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: campus.navEdges?.map((item) => {
      const endpoints = item.bidirectional && item.startNodeId.localeCompare(item.endNodeId) > 0
        ? [item.endNodeId, item.startNodeId]
        : [item.startNodeId, item.endNodeId];
      return { id: item.id, startNodeId: endpoints[0], endNodeId: endpoints[1], distance: item.distance, bidirectional: item.bidirectional, type: item.type, emergencySafe: item.emergencySafe, bendPoints: item.bendPoints };
    }).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

describe("isolated Smart Multi-Exit Admin-to-Student workflow", () => {
  it("routes a Floor 6 room down ordinary stairs with unset emergency metadata without intermediate-floor exits", () => {
    const campus = makeWorkflowCampus();
    const building = campus.buildings[0];
    const ground = building.floors.find((floor) => floor.id === ids.ground)!;
    const floorSix = building.floors.find((floor) => floor.id === ids.upper)!;
    const intermediateFloors = [2, 3, 4, 5].map((number) => {
      const floorId = `30000000-0000-4000-8000-0000000001${String(number).padStart(2, "0")}`;
      const stairId = `30000000-0000-4000-8000-0000000002${String(number).padStart(2, "0")}`;
      return {
        id: floorId,
        buildingId: ids.building,
        number,
        label: `Floor ${number}`,
        canvasW: 700,
        canvasH: 500,
        rooms: [],
        paths: [],
        walls: [],
        doors: [],
        windows: [],
        furniture: [],
        stairs: [{ id: stairId, label: "TEST ONLY Inner Stair", x: 330, y: 200, width: 28, height: 34, direction: "both" as const, sharedId: "inner-stair" }],
        ramps: [],
        elevators: [],
        labels: [],
      };
    });
    const floorSixWithoutExit = {
      ...floorSix,
      number: 6,
      label: "Floor 6",
      doors: floorSix.doors.filter((door) => door.id !== ids.exitDoorUpper),
    };
    const groundEntranceId = building.entrances![0].id;
    const upperInteriorExitNodeIds = new Set([
      "30000000-0000-4000-8000-000000000022",
      "30000000-0000-4000-8000-000000000029",
      "30000000-0000-4000-8000-000000000044",
    ]);
    const middleStairNodes = intermediateFloors.map((floor, index) => node(
      `30000000-0000-4000-8000-0000000003${String(index + 2).padStart(2, "0")}`,
      344,
      200,
      {
        type: "stair",
        stairId: floor.stairs[0].id,
        transitionSharedId: "inner-stair",
        floorId: floor.id,
        name: `TEST ONLY Inner Stair, Floor ${floor.number}`,
      },
    ));
    const expandedCampus: Campus = {
      ...campus,
      buildings: [{
        ...building,
        floors: [ground, ...intermediateFloors, floorSixWithoutExit],
        entrances: building.entrances!.filter((entrance) => entrance.id === groundEntranceId),
      }],
      navNodes: [...(campus.navNodes ?? []).filter((candidate) => !upperInteriorExitNodeIds.has(candidate.id)), ...middleStairNodes],
      navEdges: (campus.navEdges ?? []).filter((edge) => !upperInteriorExitNodeIds.has(edge.startNodeId) && !upperInteriorExitNodeIds.has(edge.endNodeId)),
    };

    const evaluation = evaluateRoomEmergencyEvacuation(expandedCampus, ids.building, ids.upper, ids.room);
    expect(evaluation.candidates).toHaveLength(1);
    expect(evaluation.candidates[0]).toMatchObject({
      destinationNodeId: expandedCampus.assemblyPoints![0].navNodeId,
      assemblyPointDesignation: "primary",
      completeAssemblyRoute: true,
    });
    expect(evaluation.candidates[0].exitLabel).toContain("Ground Emergency Exit");
    expect(new Set(evaluation.candidates[0].route.indoorSegments?.map((segment) => segment.floorId)))
      .toEqual(new Set([ids.ground, ...intermediateFloors.map((floor) => floor.id), ids.upper]));
    expect(evaluation.candidates[0].route.isGraphBased).toBe(true);

    const upperRoom = floorSixWithoutExit.rooms.find((candidate) => candidate.id === ids.room)!;
    const studentOrigin = {
      type: "room" as const,
      buildingId: ids.building,
      floorNumber: 6,
      roomId: ids.room,
      roomName: upperRoom.name,
      buildingLabel: "Test Building",
      buildingCode: "TEST",
      accessDoorIds: upperRoom.accessDoorIds,
    };
    const automatic = resolveAutomaticStudentEvacuationRoutes(expandedCampus, studentOrigin);
    const selected = planStudentEmergencyRoute(expandedCampus, studentOrigin);
    expect(automatic.routes).toHaveLength(1);
    expect(automatic.routes[0].candidate.exitLabel).toContain("Ground Emergency Exit");
    expect(selected?.emergencyAssemblyPointId).toBe(expandedCampus.assemblyPoints![0].id);
    expect(new Set(selected?.indoorSegments?.map((segment) => segment.floorId))).toEqual(new Set([
      ids.ground,
      ...intermediateFloors.map((floor) => floor.id),
      ids.upper,
    ]));
    expect(selected?.campusPoints?.at(-1)).toEqual({ x: 820, y: 250 });
    expect(selected?.steps.at(-1)?.contextLegIndex).toBe((selected?.contextLegs?.length ?? 1) - 1);
  });

  it("discovers automatic cross-floor routes without per-room approval and publishes only the eligible graph", async () => {
    const initial = makeWorkflowCampus();
    // Legacy per-room configuration remains readable and serializable while
    // route discovery no longer depends on it.
    initial.buildings[0].floors[1].rooms[0].emergencyEvacuation = { enabled: true, routes: [] };
    const beforeGeometry = JSON.stringify(authoredGeometry(initial));
    const initialEvaluation = evaluateRoomEmergencyEvacuation(initial, ids.building, ids.upper, ids.room);
    expect(initialEvaluation.doorReadiness.every((door) => door.state === "route_ready"), JSON.stringify(initialEvaluation.doorReadiness)).toBe(true);
    expect(initialEvaluation.candidates).toHaveLength(2);
    expect(new Set(initialEvaluation.candidates.map((candidate) => candidate.exitId)).size).toBe(2);
    expect(initialEvaluation.candidates.some((candidate) => candidate.route.indoorSegments?.some((segment) => segment.floorId === ids.ground))).toBe(true);
    expect(initialEvaluation.candidates.every((candidate) => candidate.route.isGraphBased && candidate.route.isAuthoredGraph)).toBe(true);

    const campusChanged = vi.fn();
    const harness = adminHarness(initial, campusChanged);
    render(<harness.Harness />);
    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation/i }));
    const ordinaryPlan = resolveAutomaticStudentEvacuationRoutes(harness.getCampus(), roomDestination());
    expect(ordinaryPlan.configured).toBe(true);
    expect(ordinaryPlan.routes).toHaveLength(2);
    expect(ordinaryPlan.routes[0].assignment.approved).toBe(false);
    expect(ordinaryPlan.routes[0].candidate.assemblyPointId).toBe(initial.assemblyPoints![0].id);

    expect(await screen.findByTestId("room-emergency-validation-summary")).toHaveTextContent("Route available");
    expect(screen.getByTestId("room-emergency-validation-summary")).toHaveTextContent("Test Assembly Point");
    expect(screen.queryByRole("button", { name: /find emergency route|preview emergency route|review & approve/i })).not.toBeInTheDocument();
    expect(screen.getByText("Inspect Connections")).toBeInTheDocument();
    expect(harness.getCampus().buildings[0].floors[1].rooms[0].emergencyEvacuation).toEqual({ enabled: true, routes: [] });

    const draftCampus = harness.getCampus();
    expect(JSON.stringify(authoredGeometry(draftCampus))).toBe(beforeGeometry);

    // Exercise the actual local draft persistence boundary and structure row
    // serializer/hydrator used by save/reload.
    writeCampusDraft(draftCampus, initial);
    const savedDraft = readCampusDraft(ids.campus)!.campus;
    const rows = serializeCampusStructure(savedDraft);
    const reloaded = hydrateCampusStructure(savedDraft, {
      buildings: rows.buildings as never,
      floors: rows.floors.map((row) => ({ ...row, display_order: Number(row.display_order ?? 0), floor_number: Number(row.floor_number ?? 1) })) as never,
      mapElements: rows.map_elements as never,
      navigationNodes: rows.navigation_nodes as never,
      navigationEdges: rows.navigation_edges as never,
    });
    expect(reloaded.buildings[0].floors[1].rooms[0].emergencyEvacuation).toEqual({ enabled: true, routes: [] });
    const stableEvaluation = evaluateRoomEmergencyEvacuation(reloaded, ids.building, ids.upper, ids.room);
    expect(stableEvaluation.candidates.map((candidate) => candidate.routeSignature)).toEqual(initialEvaluation.candidates.map((candidate) => candidate.routeSignature));
    const unrelatedRoomEdit: Campus = {
      ...reloaded,
      buildings: reloaded.buildings.map((building) => building.id !== ids.building ? building : {
        ...building,
        floors: building.floors.map((floor) => floor.id !== ids.ground ? floor : {
          ...floor,
          rooms: [{ id: "30000000-0000-4000-8000-000000000050", name: "Unrelated Lobby", type: "lobby", x: 40, y: 350, w: 60, h: 40, buildingId: ids.building, floorId: ids.ground }],
        }),
      }),
    };
    expect(resolveAutomaticStudentEvacuationRoutes(unrelatedRoomEdit, roomDestination()).routes).toHaveLength(2);

    // Use the real publication service with a strictly local in-memory
    // Supabase boundary. The real route approval and structure snapshot are
    // serialized; no production or remote Supabase call is possible here.
    await publishCampusVersion(reloaded, { errors: 0, warnings: 0, passed: 1, total: 1 });
    expect(dbState.from).toHaveBeenCalledWith("campus_versions");
    expect(dbState.from).toHaveBeenCalledWith("validation_runs");
    const studentCampuses = await listPublishedCampusSnapshots();
    expect(studentCampuses).toHaveLength(1);
    const studentCampus = studentCampuses[0];
    const resolution = resolveAutomaticStudentEvacuationRoutes(studentCampus, roomDestination());
    expect(resolution.routes).toHaveLength(2);
    expect(new Set(resolution.routes.map((route) => route.candidate.exitId)).size).toBe(2);
    expect(new Set(resolution.routes.map((route) => route.candidate.assemblyPointId))).toEqual(new Set([initial.assemblyPoints![0].id]));
    expect(studentCampus.navEdges?.filter((edge) => edge.id === "30000000-0000-4000-8000-000000000041" || edge.id === "30000000-0000-4000-8000-000000000043").map((edge) => edge.distance)).toEqual([30, 30]);
    expect(studentEmergencyFloorRouteSegments(resolution.routes, ids.building, 2)).toHaveLength(2);
    expect(studentEmergencyFloorRouteSegments(resolution.routes, ids.building, 1)).toHaveLength(1);
    const campusSegments = studentEmergencyCampusRouteSegments(resolution.routes);
    expect(campusSegments.length).toBeGreaterThan(0);
    expect(campusSegments.map((segment) => segment.label)).toEqual(["Route A", "Route B"]);
    expect(campusSegments.map((segment) => segment.color)).toEqual(["#dc2626", "#c2410c"]);
    const upperFloorSegments = studentEmergencyFloorRouteSegments(resolution.routes, ids.building, 2);
    expect(upperFloorSegments.map((segment) => segment.label)).toEqual(["Route A", "Route B"]);
    expect(upperFloorSegments.map((segment) => segment.color)).toEqual(["#dc2626", "#c2410c"]);
    const routeOverlay = render(<svg>{upperFloorSegments.map((segment) => <RouteMapOverlay
      key={segment.id} points={segment.points} mode="emergency" animated={false} routeColor={segment.color} routeLabel={segment.label}
      showStartMarker={segment.showDoorMarker} showEndMarker={segment.showExitMarker}
    />)}</svg>);
    expect(routeOverlay.container.querySelectorAll("[data-route-group]")).toHaveLength(2);
    expect([...routeOverlay.container.querySelectorAll("[data-route-marker=destination]")]).toHaveLength(2);
    expect([...routeOverlay.container.querySelectorAll("[data-route-label]")].map((label) => label.getAttribute("data-route-label"))).toEqual(["Route A", "Route B"]);
    const publishedGeometry = authoredGeometry(studentCampus);
    const initialGeometry = JSON.parse(beforeGeometry) as ReturnType<typeof authoredGeometry>;
    const entranceNodeIds = new Set((initial.navNodes ?? []).filter((node) => node.entranceId && !node.floorId).map((node) => node.id));
    const withoutDerivedEntranceCosts = (geometry: ReturnType<typeof authoredGeometry>) => ({
      ...geometry,
      edges: geometry.edges?.map((edge) => entranceNodeIds.has(edge.startNodeId) || entranceNodeIds.has(edge.endNodeId)
        ? { ...edge, distance: undefined }
        : edge),
    });
    // Publication reconciles Entrance connector costs from their real geometry
    // (the fixture starts with placeholder cost 1, while these stubs are 30m).
    // All authored buildings, nodes, edges, and non-derived costs stay intact.
    expect(JSON.stringify(withoutDerivedEntranceCosts(publishedGeometry)))
      .toBe(JSON.stringify(withoutDerivedEntranceCosts(initialGeometry)));
  });

  it("drives the actual student planner for both choices, camera modes, controls, speeds, floor geometry, and arrival", async () => {
    const campus = makeWorkflowCampus();
    const room = campus.buildings[0].floors[1].rooms[0];
    room.emergencyEvacuation = { enabled: true, routes: [] };
    const routes = resolveAutomaticStudentEvacuationRoutes(campus, roomDestination()).routes;
    const groundRoute = routes.find((route) => route.candidate.exitLabel.includes("Ground Emergency Exit"))!;
    const upperRoute = routes.find((route) => route.candidate.exitLabel.includes("Upper Emergency Exit"))!;
    const groundRouteIndex = routes.findIndex((route) => route.id === groundRoute.id);
    const choices = routes.map(({ id, label, candidate }) => ({ id, label, doorLabel: candidate.doorLabel, exitLabel: candidate.exitLabel }));
    const building = { id: ids.building, code: "TEST", name: "Test Building", description: "", category: "academic" as const, floor_count: 2, created_at: "2026-10-14" };
    const callbacks = {
      select: vi.fn(), overview: vi.fn(), camera: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(),
      previous: vi.fn(), next: vi.fn(), speed: vi.fn(), inspect: vi.fn(),
    };
    const steps = studentFacingRouteSteps(groundRoute.candidate.route).map((step) => step.instruction);
    let playbackSpeed: 1 | 1.5 | 2 = 1;
    const common = {
      from: building, to: null, onFromChange: vi.fn(), onToChange: vi.fn(), buildings: [building], mode: "emergency" as const,
      onModeChange: vi.fn(), onClose: vi.fn(), onClear: vi.fn(), onFindRoute: vi.fn(), useMyLocation: false,
      onUseMyLocationChange: vi.fn(), emergencyRoutes: choices, onSelectEmergencyRoute: callbacks.select,
      onReturnToEmergencyOverview: callbacks.overview, onCameraModeChange: callbacks.camera, onStartNavigation: callbacks.start,
      onPause: callbacks.pause, onResume: callbacks.resume, onPreviousStep: callbacks.previous, onNextStep: callbacks.next,
      onPlaybackSpeedChange: (speed: 1 | 1.5 | 2) => { callbacks.speed(speed); playbackSpeed = speed; }, onInspectStep: callbacks.inspect,
    };
    const view = render(<UnifiedRoutePlannerDialog {...common} route={groundRoute.candidate.route} phase="preview" activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    expect(screen.getByTestId("route-summary")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route A");
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route B");
    expect(screen.getByTestId(`emergency-route-tab-${groundRouteIndex}`)).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Both Routes")).not.toBeInTheDocument();
    expect(callbacks.select).not.toHaveBeenCalled();

    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="preview" cameraMode="follow" navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(callbacks.start).toHaveBeenCalledOnce();
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="navigating" cameraMode="follow" playbackPaused={false} currentStepIndex={1} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent(steps[1]);
    fireEvent.click(screen.getByRole("button", { name: "Pause navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(callbacks.previous).toHaveBeenCalledOnce();
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="navigating" cameraMode="follow" playbackPaused currentStepIndex={0} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent(steps[0]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(callbacks.next).toHaveBeenCalledOnce();
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="navigating" cameraMode="follow" playbackPaused currentStepIndex={1} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    fireEvent.click(screen.getByTestId("route-playback-speed"));
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="navigating" cameraMode="follow" playbackPaused currentStepIndex={1} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    fireEvent.click(screen.getByTestId("route-playback-speed"));
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="navigating" cameraMode="follow" playbackPaused currentStepIndex={1} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    fireEvent.click(screen.getByTestId("route-playback-speed"));
    expect(callbacks.pause).toHaveBeenCalledOnce();
    expect(callbacks.previous).toHaveBeenCalledOnce();
    expect(callbacks.next).toHaveBeenCalledOnce();
    expect(callbacks.speed).toHaveBeenNthCalledWith(1, 1.5);
    expect(callbacks.speed).toHaveBeenNthCalledWith(2, 2);
    expect(callbacks.speed).toHaveBeenNthCalledWith(3, 1);
    expect(guidedRouteProgressDuration(steps.length) / 1.5).toBeCloseTo(guidedRouteProgressDuration(steps.length) * (2 / 3));
    expect(navigationWalkDuration(80, 320, 1)).toBeGreaterThan(navigationWalkDuration(80, 320, 1.5));
    expect(navigationWalkDuration(80, 320, 1.5)).toBeGreaterThan(navigationWalkDuration(80, 320, 2));
    fireEvent.click(screen.getByRole("button", { name: "Switch to Explore mode" }));
    expect(callbacks.camera).toHaveBeenCalledWith("explore");
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="navigating" cameraMode="explore" playbackPaused currentStepIndex={1} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Return to Follow mode" }));
    expect(callbacks.camera).toHaveBeenLastCalledWith("follow");
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="navigating" cameraMode="follow" playbackPaused currentStepIndex={1} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    const otherRoute = routes.find((route) => route.id !== groundRoute.id)!;
    expect(otherRoute.id).toBe(upperRoute.id);
    const otherRouteIndex = routes.findIndex((route) => route.id === otherRoute.id);
    const otherRouteLabel = `Route ${String.fromCharCode(65 + otherRouteIndex)}`;
    fireEvent.click(screen.getByTestId(`emergency-route-tab-${otherRouteIndex}`));
    expect(screen.getByTestId("emergency-route-switch-confirmation")).toHaveTextContent(`Switch to ${otherRouteLabel}?`);
    expect(callbacks.select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Switch to ${otherRouteLabel}` }));
    expect(callbacks.select).toHaveBeenLastCalledWith(otherRoute.id);
    const otherRouteSteps = studentFacingRouteSteps(otherRoute.candidate.route).map((step) => step.instruction);
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={otherRoute.candidate.route} phase="preview" cameraMode="follow" playbackPaused navigationSteps={otherRouteSteps} activeEmergencyRouteId={otherRoute.id} emergencyRouteOverview={false} />);
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Emergency route");
    expect(screen.getByTestId(`emergency-route-tab-${otherRouteIndex}`)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("emergency-route-summary-destination")).toHaveTextContent("Test Assembly Point");
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(callbacks.start).toHaveBeenCalledTimes(2);
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={otherRoute.candidate.route} phase="navigating" cameraMode="explore" playbackPaused currentStepIndex={1} navigationSteps={otherRouteSteps} activeEmergencyRouteId={otherRoute.id} emergencyRouteOverview={false} />);
    expect(screen.getByTestId("explore-route-summary")).toHaveTextContent("Test Assembly Point");
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent(otherRouteSteps[1]);
    expect(screen.getByTestId("guided-route-steps")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume navigation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to Follow mode" }));
    expect(callbacks.camera).toHaveBeenLastCalledWith("follow");
    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={otherRoute.candidate.route} phase="navigating" cameraMode="follow" playbackPaused currentStepIndex={1} navigationSteps={otherRouteSteps} activeEmergencyRouteId={otherRoute.id} emergencyRouteOverview={false} />);
    fireEvent.click(screen.getByTestId("route-playback-speed"));
    expect(callbacks.resume).not.toHaveBeenCalled();
    expect(callbacks.speed).toHaveBeenCalledTimes(4);
    expect(callbacks.speed).toHaveBeenLastCalledWith(1.5);
    expect(studentEmergencyFloorRouteSegments(routes, ids.building, 2).map((segment) => segment.id)).toEqual(routes.map((route) => route.id));
    expect(studentEmergencyFloorRouteSegments(routes, ids.building, 1).map((segment) => segment.id)).toEqual([groundRoute.id]);

    view.rerender(<UnifiedRoutePlannerDialog {...common} playbackSpeed={playbackSpeed} route={groundRoute.candidate.route} phase="arrived" cameraMode="follow" playbackPaused currentStepIndex={steps.length - 1} navigationSteps={steps} activeEmergencyRouteId={groundRoute.id} emergencyRouteOverview={false} />);
    expect(screen.getByTestId("route-arrival-state")).toHaveTextContent("Test Assembly Point");
    expect(screen.getByTestId("route-arrival-title")).toHaveTextContent("Arrived at Test Assembly Point");
    expect(screen.getByTestId("route-arrival-state")).toHaveTextContent("Follow campus personnel's instructions.");
    fireEvent.click(screen.getByRole("button", { name: "Restart Route" }));
    expect(callbacks.start).toHaveBeenCalledTimes(3);
  });

  it("keeps Follow/Explore and pause state transitions independent across rapid mode changes", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "START_NAVIGATION", camera: "follow" });
    expect(state.playback).toBe("playing");
    state = studentRouteUiReducer(state, { type: "PAUSE" });
    expect(state.playback).toBe("paused");
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "explore" });
    expect(state).toMatchObject({ camera: "explore", playback: "paused", phase: "navigating" });
    state = studentRouteUiReducer(state, { type: "RESUME" });
    expect(state.playback).toBe("paused");
    expect(state.resumePlaybackAfterExplore).toBe("playing");
    state = studentRouteUiReducer(state, { type: "RECENTER" });
    expect(state).toMatchObject({ camera: "follow", playback: "paused", phase: "navigating" });
    state = studentRouteUiReducer(state, { type: "RECENTER_COMPLETE" });
    expect(state).toMatchObject({ camera: "follow", playback: "playing", phase: "navigating" });
    state = studentRouteUiReducer(state, { type: "ENTER_EXPLORE" });
    expect(state).toMatchObject({ camera: "explore", playback: "paused", resumePlaybackAfterExplore: "playing" });
    state = studentRouteUiReducer(state, { type: "PAUSE" });
    state = studentRouteUiReducer(state, { type: "RECENTER" });
    expect(state).toMatchObject({ camera: "follow", playback: "paused", phase: "navigating" });
  });
});
