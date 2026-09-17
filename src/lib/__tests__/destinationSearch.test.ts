import { describe, expect, it } from "vitest";
import type { SearchResult } from "../../hooks/useCampusSearch";
import {
  destinationContextLabel,
  destinationKindLabel,
  destinationResultKey,
  filterDestinationResults,
  searchDestinationResults,
} from "../destinationSearch";

function result(overrides: Partial<SearchResult> & Pick<SearchResult, "id" | "name" | "kind">): SearchResult {
  return {
    accessible: false,
    keywords: [overrides.name.toLowerCase()],
    ...overrides,
  };
}

describe("destination search helpers", () => {
  it("filters buildings, rooms, and offices without mutating the source list", () => {
    const building = result({ id: "b1", name: "Science Hall", kind: "building" });
    const room = result({ id: "r205", name: "Room 205", kind: "room", buildingId: "b1" });
    const office = result({ id: "o1", name: "Registrar", kind: "office", buildingId: "b1" });
    const all = [building, room, office];

    expect(filterDestinationResults(all, "all")).toEqual(all);
    expect(filterDestinationResults(all, "building")).toEqual([building]);
    expect(filterDestinationResults(all, "room")).toEqual([room]);
    expect(filterDestinationResults(all, "office")).toEqual([office]);
    expect(all).toEqual([building, room, office]);
  });

  it("labels a room with its building and floor context", () => {
    const room = result({
      id: "r205",
      name: "Room 205",
      kind: "room",
      buildingId: "b1",
      buildingName: "Science Hall",
      floorId: "b1-f2",
      floorNumber: 2,
      floorLabel: "Floor 2",
    });

    expect(destinationKindLabel(room)).toBe("Room");
    expect(destinationContextLabel(room)).toBe("Science Hall · Floor 2");
  });

  it("keeps same-named rooms in different buildings distinct", () => {
    const first = result({ id: "room-101", name: "Room 101", kind: "room", buildingId: "b1", floorId: "f1" });
    const second = result({ id: "room-101", name: "Room 101", kind: "room", buildingId: "b2", floorId: "f1" });

    expect(destinationResultKey(first)).not.toBe(destinationResultKey(second));
  });

  it("labels non-room destinations in user-facing language", () => {
    expect(destinationKindLabel(result({ id: "lab", name: "Chem Lab", kind: "laboratory" }))).toBe("Laboratory");
    expect(destinationKindLabel(result({ id: "landmark", name: "Main Gate", kind: "marker", category: "facility" }))).toBe("Landmark");
  });

  it("matches destination names and contextual keywords", () => {
    const room = result({
      id: "r205",
      name: "Room 205",
      kind: "room",
      buildingName: "Science Hall",
      floorLabel: "Floor 2",
      keywords: ["room 205", "science hall", "floor 2"],
    });
    const building = result({ id: "b1", name: "Science Hall", kind: "building", keywords: ["science hall"] });

    expect(searchDestinationResults([room, building], "science")).toEqual([room, building]);
    expect(searchDestinationResults([room, building], "205")).toEqual([room]);
    expect(searchDestinationResults([room, building], " ")).toEqual([room, building]);
  });
});
