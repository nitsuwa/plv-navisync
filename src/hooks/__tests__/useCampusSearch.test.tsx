import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { connectedCampusDestinations, useCampusSearch } from "../useCampusSearch";

const campus = {
  id: "campus",
  buildings: [
    { id: "connected", name: "Student Center", code: "STUDC", category: "academic", entrances: [{ id: "main" }], floors: [
      { id: "ground", number: 1, label: "Ground Floor", rooms: [
        { id: "copy", name: "Copy Shop", type: "classroom", floorId: "ground", buildingId: "connected", accessDoorId: "copy-door" },
        { id: "unlinked", name: "Unlinked Room", type: "classroom", floorId: "ground", buildingId: "connected", accessDoorId: "unlinked-door" },
      ] },
    ] },
    { id: "isolated", name: "Isolated Building", code: "ISO", category: "academic", entrances: [{ id: "isolated-entry" }], floors: [] },
  ],
  navNodes: [
    { id: "entry", buildingId: "connected", entranceId: "main", x: 0, y: 0 },
    { id: "hall", buildingId: "connected", floorId: "ground", x: 1, y: 0 },
    { id: "copy-door-node", buildingId: "connected", floorId: "ground", doorId: "copy-door", x: 2, y: 0 },
    { id: "unlinked-door-node", buildingId: "connected", floorId: "ground", doorId: "unlinked-door", x: 3, y: 0 },
    { id: "isolated-entry-node", buildingId: "isolated", entranceId: "isolated-entry", x: 4, y: 0 },
  ],
  navEdges: [
    { startNodeId: "entry", endNodeId: "hall", bidirectional: true, distance: 1, accessible: true },
    { startNodeId: "hall", endNodeId: "copy-door-node", bidirectional: true, distance: 1, accessible: true },
    { startNodeId: "hall", endNodeId: "unlinked-door-node", bidirectional: true, distance: 1, accessible: true, closed: true },
  ],
} as unknown as Campus;

describe("published campus search connectivity", () => {
  it("indexes every connected building and room, but not isolated or closed destinations", () => {
    const connected = connectedCampusDestinations(campus);
    expect([...connected.buildingIds]).toEqual(["connected"]);
    expect([...connected.roomKeys]).toEqual(["connected:ground:copy"]);

    const { result } = renderHook(() => useCampusSearch(campus));
    expect(result.current.results.map((entry) => entry.name)).toEqual(["Student Center", "Copy Shop"]);
    act(() => result.current.setSelectedCategory("office"));
    expect(result.current.results).toHaveLength(0);
    expect(result.current.destinations.map((entry) => entry.name)).toEqual(["Student Center", "Copy Shop"]);
  });

  it("recognizes a room linked through the published Room-to-Door relation", () => {
    const linked = {
      ...campus,
      buildings: [{ ...campus.buildings[0], floors: [{ ...campus.buildings[0].floors[0], rooms: [
        { id: "semantic", name: "Admin Office", type: "office", floorId: "ground", buildingId: "connected" },
      ] }] }],
      navNodes: [...campus.navNodes, { id: "room-node", buildingId: "connected", floorId: "ground", roomId: "semantic", x: 2, y: 1 }],
      navEdges: [...campus.navEdges, { startNodeId: "room-node", endNodeId: "copy-door-node", type: "room_door_transition", bidirectional: true, distance: 1, accessible: true }],
    } as Campus;
    expect(connectedCampusDestinations(linked).roomKeys.has("connected:ground:semantic")).toBe(true);
  });
});
