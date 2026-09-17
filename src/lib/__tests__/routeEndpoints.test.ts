import { describe, expect, it } from "vitest";
import type { SearchResult } from "../../hooks/useCampusSearch";
import type { Building } from "../../types";
import type { RoomDest } from "../combinedPathfinding";
import {
  routeEndpointContext,
  routeEndpointFromSearchResult,
  routeEndpointKey,
  routeEndpointLabel,
  type RouteEndpoint,
} from "../routeEndpoints";

const building: Building = {
  id: "b1",
  code: "SCI",
  name: "Science Hall",
  description: "",
  category: "academic",
  floor_count: 3,
  created_at: "2026-01-01",
};

const room: RoomDest = {
  type: "room",
  buildingId: "b1",
  floorNumber: 2,
  roomId: "r205",
  roomName: "Room 205",
  buildingLabel: "Science Hall",
  buildingCode: "SCI",
};

function result(overrides: Partial<SearchResult> & Pick<SearchResult, "id" | "name" | "kind">): SearchResult {
  return {
    accessible: false,
    keywords: [overrides.name.toLowerCase()],
    ...overrides,
  };
}

describe("route endpoint adapter", () => {
  it("converts a building result to a building endpoint", () => {
    const endpoint = routeEndpointFromSearchResult(
      result({ id: "b1", name: "Science Hall", kind: "building", buildingId: "b1" }),
      [building],
      [room],
    );

    expect(endpoint).toEqual({ kind: "building", building });
    expect(routeEndpointLabel(endpoint!)).toBe("Science Hall");
    expect(routeEndpointContext(endpoint!)).toBe("SCI · Building");
  });

  it("converts a room-like result to one room endpoint with floor context", () => {
    const endpoint = routeEndpointFromSearchResult(
      result({ id: "r205", name: "Room 205", kind: "office", buildingId: "b1", floorNumber: 2 }),
      [building],
      [room],
    );

    expect(endpoint).toEqual({ kind: "room", room, building });
    expect(routeEndpointLabel(endpoint!)).toBe("Room 205");
    expect(routeEndpointContext(endpoint!)).toBe("Science Hall · Floor 2");
  });

  it("rejects a stale result instead of creating a routable-looking endpoint", () => {
    expect(routeEndpointFromSearchResult(result({ id: "gone", name: "Room 999", kind: "room", buildingId: "b1" }), [building], [room])).toBeNull();
    expect(routeEndpointFromSearchResult(result({ id: "missing", name: "Unknown", kind: "marker" }), [building], [room])).toBeNull();
  });

  it("keeps endpoint keys distinct and labels a manual pin explicitly", () => {
    const pin: RouteEndpoint = { kind: "manual-pin", point: { x: 10, y: 20 }, label: "You are here" };
    const roomEndpoint: RouteEndpoint = { kind: "room", room, building };

    expect(routeEndpointLabel(pin)).toBe("You are here");
    expect(routeEndpointContext(pin)).toBe("Dropped pin");
    expect(routeEndpointKey(pin)).not.toBe(routeEndpointKey(roomEndpoint));
  });
});
