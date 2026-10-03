import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routeInfo: vi.fn(),
  roomDoorIds: vi.fn((room: { id?: string; accessDoorId?: string; accessDoorIds?: string[] }) => room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : [])),
  doorIsValid: vi.fn((_room: unknown, door: unknown) => Boolean(door)),
  doorConnected: vi.fn(() => false),
}));

vi.mock("../TestNavigationPanel", () => ({
  buildTestRouteEdges: vi.fn(() => []),
  roomRouteInfo: mocks.routeInfo,
}));
vi.mock("../../../lib/indoorNavigationGraph", () => ({
  roomAccessDoorIds: mocks.roomDoorIds,
  roomDoorIsValid: mocks.doorIsValid,
}));
vi.mock("../../../lib/entranceTransitions", () => ({ doorHasIndoorNavigationConnection: mocks.doorConnected }));

import { buildingNavigationHealth, reviewTargetForRoomIssue } from "../buildingNavigationHealth";
import type { Campus, CampusBuilding } from "../types";

function fixture(roomOverrides: Record<string, unknown> = {}, door = true) {
  const room = { id: "r1", name: "Office", type: "office", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1", ...roomOverrides };
  const building = { id: "b1", name: "Building", code: "B", floors: [{ id: "f1", label: "Ground Floor", number: 1, rooms: [room], doors: door ? [{ id: "d1", x: 20, y: 20, width: 20, direction: "left", color: "#000" }] : [], walls: [] }] } as unknown as CampusBuilding;
  const campus = { id: "c1", buildings: [building], navNodes: [], navEdges: [] } as unknown as Campus;
  return { campus, building, room };
}

describe("building navigation health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roomDoorIds.mockImplementation((room) => room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : []));
    mocks.doorIsValid.mockImplementation((_room, door) => Boolean(door));
    mocks.doorConnected.mockReturnValue(false);
  });

  it("counts a room as connected when the shared Test Route resolver accepts it, regardless of stale local flags", () => {
    const { campus, building } = fixture({ accessDoorId: "d1", navConnection: undefined, accessNodeId: undefined });
    mocks.routeInfo.mockReturnValue({ door: { id: "d1" } });
    expect(buildingNavigationHealth(campus, building)).toMatchObject({ total: 1, connected: 1, issues: [] });
  });

  it("reports a valid linked door with no walking-network connection as an issue", () => {
    const { campus, building } = fixture({ accessDoorId: "d1" });
    campus.navNodes = [
      { id: "room-node", roomId: "r1", buildingId: "b1", floorId: "f1" },
      { id: "door-node", doorId: "d1", buildingId: "b1", floorId: "f1" },
    ] as Campus["navNodes"];
    mocks.routeInfo.mockReturnValue(null);
    expect(buildingNavigationHealth(campus, building).issues[0]).toMatchObject({
      status: "needs_attention",
      reason: "Door is not connected to the walking network.",
    });
  });

  it("reports rooms without a usable linked entrance and points Review to the room", () => {
    const { campus, building } = fixture({}, false);
    mocks.routeInfo.mockReturnValue(null);
    const health = buildingNavigationHealth(campus, building);
    expect(health).toMatchObject({ total: 1, connected: 0 });
    expect(health.issues[0]).toMatchObject({ status: "no_usable_entrance", reason: "No usable linked room entrance." });
    expect(reviewTargetForRoomIssue(health.issues[0])).toEqual({ type: "room", id: "r1" });
  });

  it("excludes connected rooms from the issue list and reviews a problem at its door", () => {
    const { campus, building } = fixture({ accessDoorId: "d1" });
    campus.buildings[0].floors[0].rooms.push({ id: "r2", name: "Lab", type: "lab", x: 0, y: 0, w: 30, h: 30, floorId: "f1", buildingId: "b1" });
    mocks.routeInfo.mockImplementation((_campus, _buildingId, roomId) => roomId === "r1" ? { door: { id: "d1" } } : null);
    mocks.roomDoorIds.mockImplementation((room) => room.id === "r2" ? ["d2"] : ["d1"]);
    const health = buildingNavigationHealth(campus, building);
    expect(health).toMatchObject({ total: 2, connected: 1 });
    expect(health.issues).toHaveLength(1);
    expect(reviewTargetForRoomIssue({ ...health.issues[0], doorId: "d2" })).toEqual({ type: "door", id: "d2" });
  });
});
