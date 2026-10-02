import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteStepsPanel } from "../RouteStepsPanel";
import type { PlannedRoute } from "../../../lib/routePlanner";

describe("RouteStepsPanel", () => {
  it("shows a floor transition once as an ordered direction, not as a duplicate badge", () => {
    const transition = "Take the Left Stair down to Ground Floor.";
    const route: PlannedRoute = {
      points: [],
      dist: 45,
      mins: 1,
      steps: [
        { id: "exit", icon: "walk", instruction: "Follow the indoor path to the Left Stair.", distanceM: 12 },
        { id: "stairs", icon: "stairs", instruction: transition },
        { id: "leave", icon: "enter", instruction: "Exit CEIT building." },
      ],
      isGraphBased: true,
      isAuthoredGraph: true,
      mode: "standard",
      fromCode: "CEIT",
      toCode: "SC",
      transitions: [transition],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="SC"
        onEnd={() => undefined}
        onZoom={() => undefined}
      />,
    );

    expect(screen.getAllByText(transition)).toHaveLength(1);
    expect(screen.getByText("Follow the indoor path to the Left Stair.")).toBeInTheDocument();
    expect(screen.queryByText(/waypoint/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Dist")).not.toBeInTheDocument();
    expect(screen.queryByText("Time")).not.toBeInTheDocument();
    expect(screen.queryByText("Via")).not.toBeInTheDocument();
    expect(screen.queryByText("12 m")).not.toBeInTheDocument();
  });

  it("turns legacy waypoint placeholders into directions students can follow", () => {
    const route: PlannedRoute = {
      points: [],
      dist: 26,
      mins: 1,
      steps: [
        { id: "start", icon: "start", instruction: "Start from Door" },
        { id: "legacy-waypoint", icon: "walk", instruction: "Walk 18m to Waypoint" },
        { id: "floor-waypoint", icon: "walk", instruction: "Continue to floor waypoint 2" },
      ],
      isGraphBased: true,
      mode: "standard",
      fromCode: "Door",
      toCode: "Room",
      transitions: [],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="Room"
        onEnd={() => undefined}
        onZoom={() => undefined}
      />,
    );

    expect(screen.getByText("Start at the room door.")).toBeInTheDocument();
    expect(screen.getByText("Follow the highlighted path for 18 m.")).toBeInTheDocument();
    expect(screen.getByText("Continue along the connected indoor path.")).toBeInTheDocument();
    expect(screen.queryByText(/waypoint/i)).not.toBeInTheDocument();
  });

  it("lets the compact mobile panel resize with the drag handle or keyboard", () => {
    const route: PlannedRoute = {
      points: [],
      dist: 26,
      mins: 1,
      steps: [{ id: "start", icon: "start", instruction: "Start from Door" }],
      isGraphBased: true,
      mode: "standard",
      fromCode: "Door",
      toCode: "Room",
      transitions: [],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="Room"
        compact
        onEnd={() => undefined}
        onZoom={() => undefined}
      />,
    );

    const handle = screen.getByRole("slider", { name: "Resize route panel" });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle).toHaveAttribute("aria-valuenow", "332");
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 250 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 250 });
    expect(handle).toHaveAttribute("aria-valuenow", "482");
  });

  it.each([
    { label: "mobile", compact: true },
    { label: "laptop", compact: false },
  ])("lets the $label route panel move by dragging its header", ({ compact }) => {
    const route: PlannedRoute = {
      points: [],
      dist: 26,
      mins: 1,
      steps: [{ id: "start", icon: "start", instruction: "Start from Door" }],
      isGraphBased: true,
      mode: "standard",
      fromCode: "Door",
      toCode: "Room",
      transitions: [],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="Room"
        compact={compact}
        onEnd={() => undefined}
        onZoom={() => undefined}
      />,
    );

    const panel = screen.getByTestId("route-steps-panel");
    const dragHandle = screen.getByTestId("route-panel-drag-handle");
    fireEvent.pointerDown(dragHandle, { pointerId: 2, clientX: 100, clientY: 200, button: 0 });
    fireEvent.pointerMove(dragHandle, { pointerId: 2, clientX: 145, clientY: 250 });
    fireEvent.pointerUp(dragHandle, { pointerId: 2, clientX: 145, clientY: 250 });

    expect(panel).toHaveStyle({ transform: "translate3d(45px, 50px, 0)" });
  });
});
