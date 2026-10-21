import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentRouteTransitionMarker } from "../StudentRouteTransitionMarker";

describe("Student Explore transition choices", () => {
  it("keeps a single valid transition as a direct action without a choice menu", () => {
    const inspectFloorFour = vi.fn();
    render(
      <svg>
        <StudentRouteTransitionMarker
          x={80}
          y={80}
          kind="elevator"
          label="Elevator to Floor 4"
          choices={[{ id: "floor-4", kind: "elevator", label: "Elevator to Floor 4", displayLabel: "Elevator Up — Floor 4", point: { x: 80, y: 80 }, onActivate: inspectFloorFour }]}
          onActivate={inspectFloorFour}
        />
      </svg>,
    );
    fireEvent.click(screen.getByTestId("test-route-transition-marker"));
    expect(inspectFloorFour).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("student-explore-transition-marker")).not.toBeInTheDocument();
  });

  it("uses one marker and inspects only the selected nearby route option", () => {
    const inspectFloorFour = vi.fn();
    const inspectFloorSix = vi.fn();
    const { container } = render(
      <svg>
        <StudentRouteTransitionMarker
          x={140}
          y={110}
          kind="stairs"
          label="Two stair destinations"
          markerId="shared-stair"
          choices={[
            { id: "down-4", kind: "stairs", label: "Stairs down", displayLabel: "Stairs Down — Floor 4", point: { x: 140, y: 110 }, onActivate: inspectFloorFour },
            { id: "up-6", kind: "stairs", label: "Stairs up", displayLabel: "Stairs Up — Floor 6", point: { x: 146, y: 114 }, onActivate: inspectFloorSix },
          ]}
        />
      </svg>,
    );

    expect(screen.getAllByTestId("student-active-transition-marker")).toHaveLength(1);
    const trigger = screen.getByRole("button", { name: "Stair options: 2 destinations" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Stairs Up — Floor 6/ }));
    expect(inspectFloorSix).toHaveBeenCalledTimes(1);
    expect(inspectFloorFour).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="student-explore-transition-marker"]')).toHaveLength(1);
  });

  it("opens grouped choices without inspecting the first destination", () => {
    const inspectFirst = vi.fn();
    const inspectSecond = vi.fn();
    render(
      <svg>
        <StudentRouteTransitionMarker
          x={80}
          y={80}
          kind="stairs"
          label="Shared stair landing"
          choices={[
            { id: "floor-4", kind: "stairs", label: "Down", displayLabel: "Stairs down — Floor 4", point: { x: 80, y: 80 }, onActivate: inspectFirst },
            { id: "floor-6", kind: "stairs", label: "Up", displayLabel: "Stairs up — Floor 6", point: { x: 81, y: 81 }, onActivate: inspectSecond },
          ]}
          onActivate={inspectFirst}
        />
      </svg>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stair options: 2 destinations" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(inspectFirst).not.toHaveBeenCalled();
    expect(inspectSecond).not.toHaveBeenCalled();
  });

  it("dismisses the menu with Escape without activating a transition", () => {
    const onActivate = vi.fn();
    const globalEscapeShortcut = vi.fn();
    window.addEventListener("keydown", globalEscapeShortcut);
    render(
      <svg>
        <StudentRouteTransitionMarker
          x={90}
          y={90}
          kind="elevator"
          label="Two elevator destinations"
          choices={[
            { id: "ground", kind: "elevator", label: "Down", displayLabel: "Elevator Down — Ground Floor", point: { x: 90, y: 90 }, onActivate },
            { id: "four", kind: "elevator", label: "Up", displayLabel: "Elevator Up — Floor 4", point: { x: 90, y: 90 }, onActivate },
          ]}
        />
      </svg>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Elevator options: 2 destinations" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onActivate).not.toHaveBeenCalled();
    expect(globalEscapeShortcut).not.toHaveBeenCalled();
    window.removeEventListener("keydown", globalEscapeShortcut);
  });
});
