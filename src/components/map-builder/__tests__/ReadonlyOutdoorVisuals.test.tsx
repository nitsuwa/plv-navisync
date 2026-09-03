import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Campus } from "../types";
import { projectReadonlyOutdoorCampus } from "../../../lib/readonlyOutdoorCampus";
import { ReadonlyOutdoorCampusScene } from "../ReadonlyOutdoorVisuals";

const campus = {
  id: "c1",
  canvasW: 900,
  canvasH: 680,
  buildings: [{
    id: "b1", name: "Library", code: "LIB", category: "facility", description: "",
    x: 100, y: 80, width: 220, height: 120, color: "#0f4c81", rotation: 12, opacity: 0.9,
    floors: [], entrances: [{ id: "e1", buildingId: "b1", edge: "bottom" as const, offset: 0.5, accessible: true }],
    exteriorEmergencyStairs: [{ id: "s1", buildingId: "b1", label: "Exit Stair", state: "open" as const, width: 28, height: 42, attachment: { edge: "right" as const, offset: 0.4 }, servedFloorIds: [], sharedId: "s1", emergencySafe: true }],
  }],
  markers: [{ id: "m1", name: "Gate", type: "entrance", x: 30, y: 40, color: "#111827" }],
  paths: [{ id: "p1", points: [{ x: 0, y: 0 }, { x: 100, y: 80 }], type: "walkway", color: "#b45309", width: 10 }],
  decorAssets: [{ id: "d1", type: "tree" as const, x: 60, y: 60, scale: 1 }],
} as unknown as Campus;

describe("ReadonlyOutdoorCampusScene", () => {
  it("renders authored physical scene objects without graph overlays", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} onSelectBuilding={vi.fn()} /></svg>);
    expect(screen.getByTestId("readonly-outdoor-scene")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("data-building-id", "b1");
    expect(screen.getByTestId("readonly-campus-path")).toHaveAttribute("data-path-id", "p1");
    expect(screen.getByTestId("readonly-entrance")).toHaveAttribute("data-entrance-id", "e1");
    expect(screen.getByTestId("readonly-exterior-emergency-stair")).toHaveAttribute("data-stair-id", "s1");
    expect(screen.getByTestId("readonly-decor")).toHaveAttribute("data-asset-id", "d1");
    expect(screen.queryByTestId("nav-graph-layer")).not.toBeInTheDocument();
  });

  it("keeps the shared building visual pointer-transparent for an admin hit surface", () => {
    const onAdminHit = vi.fn();
    render(
      <svg>
        <g onClick={() => onAdminHit()}>
          <rect data-testid="admin-building-hit-target" x={90} y={70} width={240} height={140} fill="transparent" pointerEvents="all" />
          <ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} />
        </g>
      </svg>,
    );
    fireEvent.click(screen.getByTestId("admin-building-hit-target"));
    expect(onAdminHit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("pointer-events", "none");
  });

  it("keeps authored physical paths visible when the building layer is hidden", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} showBuildings={false} /></svg>);
    expect(screen.getByTestId("readonly-campus-path")).toBeInTheDocument();
    expect(screen.queryByTestId("readonly-building")).not.toBeInTheDocument();
  });
});
