import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ReadonlyFloorPlanScene } from "../ReadonlyFloorPlanVisuals";
import { entranceDirectionBadgePlacement } from "../EntranceDirectionBadge";
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

  it("adds an accessible Exit to Campus cue only to graph-eligible transition doors", () => {
    const onDoorClick = vi.fn();
    const { container, getByRole } = render(
      <svg><ReadonlyFloorPlanScene
        floor={floorWithDoor()}
        entrances={[entrance("both")]}
        interactiveExitDoorIds={new Set([door.id])}
        compactExitActions
        onDoorClick={onDoorClick}
      /></svg>,
    );

    const transitionDoor = getByRole("button", { name: "Exit to Campus" });
    const indicator = container.querySelector('[data-testid="student-exit-campus-indicator"]');
    expect(indicator?.querySelector('[data-testid="student-exit-campus-arrow"]')).toBeTruthy();
    expect(indicator?.querySelector('[data-testid="student-doorway-micro-label-text"]')).toHaveTextContent("Exit");
    const arrows = indicator?.querySelectorAll("[data-transition-arrow]");
    expect(arrows).toHaveLength(2);
    expect(indicator?.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(indicator?.querySelector('[data-transition-arrow="entrance"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(container.querySelector('[data-testid="student-exit-campus-marker"]')).toBeNull();
    expect(container.querySelector('[data-testid="student-exit-campus-tooltip"]')).toBeNull();
    expect(container.querySelector('[data-testid="readonly-exit-door-hit-target"]')).toBeTruthy();
    expect(transitionDoor.querySelector("title")?.textContent).toBe("Exit to Campus");
    fireEvent.mouseEnter(transitionDoor);
    expect(container.querySelector('[data-testid="student-exit-campus-tooltip"]')).toBeNull();
    expect(indicator?.querySelector('[data-transition-arrow="exit"]')).toHaveAttribute("data-transition-emphasis", "pressable");
    fireEvent.click(container.querySelector('[data-testid="readonly-exit-door-hit-target"]')!);
    fireEvent.keyDown(transitionDoor, { key: "Enter" });
    expect(onDoorClick).toHaveBeenNthCalledWith(1, door.id);
    expect(onDoorClick).toHaveBeenNthCalledWith(2, door.id);
  });

  it("keeps the active Floor exit arrow at the authored door without duplicating the shared route callout", () => {
    const floor = floorWithDoor();
    const props = { floor, entrances: [entrance("both")], compactExitActions: true, activeExitDoorId: door.id,
      interactiveExitDoorIds: new Set([door.id]), onDoorClick: vi.fn() };
    const { container, rerender } = render(<svg><ReadonlyFloorPlanScene {...props} /></svg>);
    const badge = container.querySelector('[data-testid="student-exit-campus-arrow"]')!;
    const anchor = [badge.getAttribute("data-world-anchor-x"), badge.getAttribute("data-world-anchor-y")];
    expect(anchor).toEqual(["100", "100"]);
    const placement = entranceDirectionBadgePlacement(100, 100, "bottom");
    expect(badge.getAttribute("transform")).toBe(`translate(${placement.x},${placement.y}) rotate(${placement.angle})`);
    expect(badge.querySelector('[data-transition-arrow="exit"]')).toHaveAttribute("data-transition-emphasis", "active");
    expect(container.querySelector('[data-testid="student-exit-campus-tooltip"]')).toBeNull();
    rerender(<svg><ReadonlyFloorPlanScene {...props} mapMode="accessible" /></svg>);
    expect(container.querySelector('[data-testid="student-exit-campus-arrow"]')).toBe(badge);
    expect(badge.getAttribute("data-world-anchor-x")).toBe(anchor[0]);
    expect(badge.getAttribute("data-world-anchor-y")).toBe(anchor[1]);
    expect(container.querySelector('[data-testid="student-exit-campus-tooltip"]')).toBeNull();
  });

  it("adds hover emphasis without moving the Floor exit action anchor", () => {
    const { container, getByRole } = render(
      <svg><ReadonlyFloorPlanScene
        floor={floorWithDoor()}
        entrances={[entrance("both")]}
        compactExitActions
        interactiveExitDoorIds={new Set([door.id])}
        onDoorClick={vi.fn()}
      /></svg>,
    );
    const action = getByRole("button", { name: "Exit to Campus" });
    const badge = container.querySelector('[data-testid="student-exit-campus-arrow"]')!;
    const anchorTransform = badge.getAttribute("transform");
    const anchorX = badge.getAttribute("data-world-anchor-x");
    const anchorY = badge.getAttribute("data-world-anchor-y");

    fireEvent.mouseEnter(action);

    expect(badge).toHaveAttribute("transform", anchorTransform);
    expect(badge).toHaveAttribute("data-world-anchor-x", anchorX);
    expect(badge).toHaveAttribute("data-world-anchor-y", anchorY);
    expect(badge).toHaveAttribute("data-emphasized-direction", "exit");
    expect(badge.querySelector('[data-testid="student-doorway-micro-label-text"]')).toHaveTextContent("Exit to Campus");
  });

  it("suppresses the passive Floor exit arrow while the active route control owns that door", () => {
    const { container } = render(
      <svg><ReadonlyFloorPlanScene
        floor={floorWithDoor()}
        entrances={[entrance("both")]}
        compactExitActions
        activeExitDoorId={door.id}
        suppressActiveExitDoorId={door.id}
        interactiveExitDoorIds={new Set([door.id])}
        onDoorClick={vi.fn()}
      /></svg>,
    );

    expect(container.querySelector('[data-testid="student-exit-campus-arrow"]')).toBeNull();
    expect(container.querySelector('[data-testid="readonly-exit-door-hit-target"]')).toBeTruthy();
  });

  it("does not add the campus-exit cue to ordinary doors", () => {
    const ordinaryFloor = floorWithDoor();
    ordinaryFloor.doors = [{ ...door, buildingEntranceId: undefined }];
    const { container, queryByRole } = render(
      <svg><ReadonlyFloorPlanScene
        floor={ordinaryFloor}
        onDoorClick={() => undefined}
        interactiveExitDoorIds={new Set([door.id])}
      /></svg>,
    );

    expect(queryByRole("button", { name: "Exit to campus view" })).toBeNull();
    expect(container.querySelector('[data-testid="student-exit-campus-indicator"]')).toBeNull();
    expect(container.querySelector('[data-testid="readonly-exit-door-hit-target"]')).toBeNull();
  });

  it("keeps the authored inward arrow visible on a non-exitable Floor door without inventing an Exit", () => {
    const { container } = render(
      <svg><ReadonlyFloorPlanScene
        floor={floorWithDoor()}
        entrances={[entrance("entrance_only")]}
        compactExitActions
      /></svg>,
    );
    const badge = container.querySelector('[data-testid="student-exit-campus-arrow"]')!;
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(1);
    expect(badge.querySelector('[data-transition-arrow="entrance"]')).toBeInTheDocument();
    expect(badge.querySelector('[data-transition-arrow="exit"]')).toBeNull();
    expect(badge.querySelector('[data-testid$="-emphasis"]')).toBeNull();
    expect(container.querySelector('[data-testid="readonly-door"][role="button"]')).toBeNull();
  });
});
