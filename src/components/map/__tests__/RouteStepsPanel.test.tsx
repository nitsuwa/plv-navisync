import { render, screen } from "@testing-library/react";
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
        { id: "exit", icon: "walk", instruction: "Follow the indoor path to the Left Stair." },
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
});
