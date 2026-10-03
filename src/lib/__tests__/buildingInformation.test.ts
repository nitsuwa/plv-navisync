import { describe, expect, it } from "vitest";
import type { CampusBuilding } from "../../components/map-builder/types";
import { buildingTypeValue, deriveBuildingAccessibilityFacts, facilityIsOnAuthoredMap, weeklyHoursPreset } from "../buildingInformation";

describe("building information helpers", () => {
  it("derives facilities and precise accessibility facts from authored map objects", () => {
    const building = {
      id: "b1",
      category: "Academic",
      entrances: [{ id: "e1", name: "Main Entrance", buildingId: "b1", type: "general", edge: "bottom", offset: 0.5, accessible: true }],
      floors: [{
        elevators: [{ id: "el1", x: 10, y: 10, width: 20, height: 20, visible: true }],
        ramps: [{ id: "ramp1", x: 10, y: 10, width: 40, height: 12, visible: true, accessible: true }],
        entranceRamps: [],
        rooms: [{ id: "rr1", name: "Restroom", type: "restroom", x: 5, y: 5, w: 20, h: 20, accessibility: true }],
      }],
    } as unknown as CampusBuilding;
    expect(facilityIsOnAuthoredMap(building, "Elevator")).toBe(true);
    expect(facilityIsOnAuthoredMap(building, "Clinic")).toBe(false);
    expect(deriveBuildingAccessibilityFacts(building).map((fact) => fact.label)).toEqual([
      "Accessible entrance", "Elevator available", "Ramp access", "Accessible restroom",
    ]);
  });

  it("uses a controlled type and stores closed preset days without times", () => {
    expect(buildingTypeValue({ category: "Administrative" })).toBe("administrative");
    expect(weeklyHoursPreset("weekdays").saturday).toEqual({ closed: true });
  });
});
