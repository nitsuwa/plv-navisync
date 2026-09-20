import { describe, expect, it } from "vitest";
import type { CampusEventOverlay, FloorFurniture, FloorLabel } from "../../components/map-builder/types";
import {
  countEventOverlayItems,
  eventLocationKey,
  normalizeEventOverlayLocations,
  replaceEventOverlayLocation,
} from "../eventOverlayModel";

const campus = { type: "campus" as const, label: "Campus Grounds" };
const floor = {
  type: "building" as const,
  buildingId: "science",
  floorId: "science-f2",
  label: "Science Building — Floor 2",
};

const furniture: FloorFurniture = {
  id: "booth-1",
  type: "booth",
  name: "Booth",
  category: "event",
  x: 10,
  y: 10,
  width: 60,
  height: 40,
  rotation: 0,
  color: "#f59e0b",
};
const label: FloorLabel = {
  id: "label-1",
  x: 20,
  y: 20,
  text: "Entrance",
  fontSize: 14,
  color: "#111827",
  rotation: 0,
  align: "left",
};

function overlay(partial: Partial<CampusEventOverlay>): CampusEventOverlay {
  return {
    id: "event-1",
    title: "Student Fair",
    description: "",
    dateStart: "",
    dateEnd: "",
    organizer: "Council",
    markers: [],
    restrictedAreas: [],
    isActive: true,
    status: "pending",
    ...partial,
  };
}

describe("event overlay location model", () => {
  it("normalizes a legacy single-location overlay", () => {
    expect(
      normalizeEventOverlayLocations(
        overlay({ locationRef: floor, eventFurniture: [furniture], eventLabels: [label] })
      )
    ).toEqual([
      {
        id: "location-science-science-f2",
        locationRef: floor,
        eventFurniture: [furniture],
        eventLabels: [label],
      },
    ]);
  });

  it("preserves all locations and their event-owned items", () => {
    const locations = [
      { id: "campus", locationRef: campus, eventFurniture: [furniture], eventLabels: [] },
      { id: "science-f2", locationRef: floor, eventFurniture: [], eventLabels: [label] },
    ];
    expect(normalizeEventOverlayLocations(overlay({ locations }))).toEqual(locations);
    expect(countEventOverlayItems(locations)).toEqual({ furniture: 1, labels: 1 });
  });

  it("creates stable keys for campus grounds and building floors", () => {
    expect(eventLocationKey(campus)).toBe("campus");
    expect(eventLocationKey(floor)).toBe("science-science-f2");
  });

  it("updates only the active location and keeps other maps intact", () => {
    const locations = normalizeEventOverlayLocations(overlay({ locations: [
      { id: "campus", locationRef: campus, eventFurniture: [furniture], eventLabels: [] },
      { id: "science-f2", locationRef: floor, eventFurniture: [], eventLabels: [label] },
    ] }));
    const next = replaceEventOverlayLocation(locations, "science-f2", [furniture], []);
    expect(next[0]).toEqual(locations[0]);
    expect(next[1].eventFurniture).toEqual([furniture]);
    expect(next[1].eventLabels).toEqual([]);
  });
});
