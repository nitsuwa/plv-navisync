import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReadonlyFloorPlanScene } from "../ReadonlyFloorPlanVisuals";
import type { CampusEntrance, FloorPlan } from "../types";

const wall = { id: "wall-entry", x1: 20, y1: 100, x2: 180, y2: 100, thickness: 6, color: "#475569" };
const door = {
  id: "canonical-entry-door",
  x: 100,
  y: 100,
  width: 32,
  wallId: wall.id,
  offset: 0.5,
  direction: "left" as const,
  color: "#b45309",
  buildingEntranceId: "entrance-main",
};

function floorWithDoor(openingType?: "door" | "open_passage"): FloorPlan {
  return {
    id: "floor-ground",
    buildingId: "building-main",
    number: 1,
    label: "Ground Floor",
    canvasW: 200,
    canvasH: 120,
    rooms: [],
    paths: [],
    walls: [wall],
    doors: [{ ...door, ...(openingType ? { openingType } : {}) }],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
  };
}

const entrance = (direction: CampusEntrance["direction"] = "both"): CampusEntrance => ({
  id: "entrance-main",
  buildingId: "building-main",
  name: "Main Entrance",
  edge: "bottom",
  offset: 0.5,
  type: "general",
  direction,
});

describe("Readonly Entrance-linked opening visuals", () => {
  it("keeps the legacy Door appearance and Entrance sign by default", () => {
    const { container } = render(
      <svg><ReadonlyFloorPlanScene floor={floorWithDoor()} entrances={[entrance("exit_only")]} /></svg>,
    );
    const opening = container.querySelector('[data-testid="readonly-door"][data-door-id="canonical-entry-door"]')!;
    const badge = container.querySelector('[data-testid="entrance-direction-badge"]')!;

    expect(opening.querySelector('[data-testid="readonly-door-leaf"]')).toBeTruthy();
    expect(opening.querySelector('[data-testid="readonly-open-passage-symbol"]')).toBeNull();
    expect(opening.contains(badge)).toBe(true);
    expect(badge.getAttribute("data-entrance-direction")).toBe("exit_only");
  });

  it("renders a leaf-free opening while keeping the same center-anchored Entrance sign", () => {
    const { container, rerender } = render(
      <svg><ReadonlyFloorPlanScene floor={floorWithDoor("open_passage")} entrances={[entrance("both")]} /></svg>,
    );
    const opening = container.querySelector('[data-testid="readonly-door"][data-door-id="canonical-entry-door"]')!;
    const badge = container.querySelector('[data-testid="entrance-direction-badge"]')!;

    expect(opening.querySelector('[data-testid="readonly-open-passage-wall-cut"]')).toBeTruthy();
    expect(opening.querySelector('[data-testid="readonly-door-leaf"]')).toBeNull();
    expect(opening.querySelector('[data-testid="readonly-door-hinge"]')).toBeNull();
    expect(opening.querySelector('[data-testid="readonly-door-swing-arc"]')).toBeNull();
    expect(opening.contains(badge)).toBe(true);
    expect(badge.getAttribute("data-entrance-direction")).toBe("both");
    expect(opening.getAttribute("transform")).toBe("translate(100,100) rotate(0)");

    for (const direction of ["entrance_only", "exit_only", "both"] as const) {
      rerender(<svg><ReadonlyFloorPlanScene floor={floorWithDoor("open_passage")} entrances={[entrance(direction)]} /></svg>);
      expect(container.querySelector('[data-testid="readonly-door"][data-door-id="canonical-entry-door"]')).toBe(opening);
      expect(container.querySelector('[data-testid="entrance-direction-badge"]')?.getAttribute("data-entrance-direction")).toBe(direction);
    }
  });
});
