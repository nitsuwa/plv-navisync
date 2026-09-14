import { describe, expect, it } from "vitest";
import { formatManagedPerimeterDependencies, getManagedPerimeterDependencies } from "../floorPerimeterDependencies";

function makeFloor() {
  return {
    walls: [
      { id: "perimeter-right", x1: 100, y1: 0, x2: 100, y2: 80, thickness: 6, managedKind: "perimeter" as const },
      { id: "interior", x1: 20, y1: 20, x2: 80, y2: 20, thickness: 6 },
    ],
    doors: [
      { id: "attached-door", x: 100, y: 30, width: 18, wallId: "perimeter-right", direction: "left" as const, color: "#fff" },
      { id: "nearby-door", x: 98, y: 30, width: 18, direction: "left" as const, color: "#fff" },
    ],
    windows: [
      { id: "attached-window", x: 100, y: 55, width: 20, height: 8, wallId: "perimeter-right", color: "#fff" },
    ],
  };
}

describe("managed perimeter dependency detection", () => {
  it("uses explicit wall ownership and ignores proximity", () => {
    const floor = makeFloor();
    const before = JSON.stringify(floor);
    const dependencies = getManagedPerimeterDependencies(floor);

    expect(dependencies.total).toBe(2);
    expect(dependencies.doors.map((door) => door.id)).toEqual(["attached-door"]);
    expect(dependencies.windows.map((window) => window.id)).toEqual(["attached-window"]);
    expect(JSON.stringify(floor)).toBe(before);
  });

  it("returns no blockers when the managed wall set has no attached openings", () => {
    const floor = makeFloor();
    floor.doors = floor.doors.map((door) => ({ ...door, wallId: undefined }));
    floor.windows = floor.windows.map((window) => ({ ...window, wallId: undefined }));

    expect(getManagedPerimeterDependencies(floor)).toMatchObject({ doors: [], windows: [], total: 0 });
  });

  it("treats an explicitly linked generated entrance Door as a dependency", () => {
    const floor = makeFloor();
    floor.doors = floor.doors.filter((door) => door.id === "nearby-door").map((door) => ({ ...door, buildingEntranceId: "entrance-1" }));

    const dependencies = getManagedPerimeterDependencies(floor, [{ id: "entrance-1" }]);
    expect(dependencies.doors.map((door) => door.id)).toEqual(["nearby-door"]);
  });

  it("formats exact singular and plural opening counts", () => {
    const dependencies = getManagedPerimeterDependencies(makeFloor());
    expect(formatManagedPerimeterDependencies(dependencies)).toContain("• 1 Door");
    expect(formatManagedPerimeterDependencies(dependencies)).toContain("• 1 Window");
    expect(formatManagedPerimeterDependencies({
      doors: [...dependencies.doors, { ...dependencies.doors[0], id: "attached-door-2" }],
      windows: [...dependencies.windows, { ...dependencies.windows[0], id: "attached-window-2" }, { ...dependencies.windows[0], id: "attached-window-3" }],
      total: 5,
    })).toMatch(/• 2 Doors[\s\S]*• 3 Windows/);
  });
});
