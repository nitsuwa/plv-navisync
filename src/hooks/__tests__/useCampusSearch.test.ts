import { describe, expect, it } from "vitest";
import type { CampusBuilding, FloorPlan } from "../../components/map-builder/types";
import { searchFloorRooms } from "../useCampusSearch";

const building: Pick<CampusBuilding, "id" | "name" | "code"> = {
  id: "building-1",
  name: "Science Building",
  code: "SCI",
};

const floor: FloorPlan = {
  id: "floor-1",
  buildingId: building.id,
  number: 1,
  label: "Ground Floor",
  rooms: [
    {
      id: "room-1",
      name: "Physics Lab",
      type: "laboratory",
      x: 20,
      y: 20,
      w: 80,
      h: 50,
      floorId: "floor-1",
      buildingId: building.id,
    },
    {
      id: "room-2",
      name: "Registrar Office",
      type: "office",
      x: 120,
      y: 20,
      w: 80,
      h: 50,
      floorId: "floor-1",
      buildingId: building.id,
    },
    {
      id: "hidden-room",
      name: "Hidden Room",
      type: "room",
      x: 220,
      y: 20,
      w: 80,
      h: 50,
      visible: false,
      floorId: "floor-1",
      buildingId: building.id,
    },
  ],
  paths: [],
  walls: [],
  doors: [],
  windows: [],
  furniture: [],
  stairs: [],
  ramps: [],
  elevators: [],
  labels: [],
};

describe("searchFloorRooms", () => {
  it("updates synchronously and only returns matching visible rooms", () => {
    expect(searchFloorRooms(floor, building, "physics").map((room) => room.id)).toEqual(["room-1"]);
    expect(searchFloorRooms(floor, building, "registrar").map((room) => room.id)).toEqual(["room-2"]);
    expect(searchFloorRooms(floor, building, "hidden")).toEqual([]);
  });

  it("preserves the authored building and floor context for selection", () => {
    const [result] = searchFloorRooms(floor, building, "physics");

    expect(result).toMatchObject({
      buildingId: building.id,
      buildingName: building.name,
      floorId: floor.id,
      floorNumber: floor.number,
      floorLabel: floor.label,
      kind: "laboratory",
    });
  });
});
