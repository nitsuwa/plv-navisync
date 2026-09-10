import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Campus } from "../types";
import { projectReadonlyOutdoorCampus } from "../../../lib/readonlyOutdoorCampus";
import { ReadonlyOutdoorCampusScene, exteriorEmergencyStairVisualDimensions } from "../ReadonlyOutdoorVisuals";

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
  decorAssets: [
    { id: "d1", type: "tree" as const, x: 60, y: 60, scale: 1 },
    { id: "surface-parking", type: "ground-area" as const, groundType: "parking" as const, x: 420, y: 360, width: 220, height: 120, scale: 1, zOrder: -1000 },
    { id: "monument-1", type: "monument" as const, x: 460, y: 290, scale: 1 },
  ],
} as unknown as Campus;

describe("ReadonlyOutdoorCampusScene", () => {
  it("renders authored physical scene objects without graph overlays", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} onSelectBuilding={vi.fn()} /></svg>);
    expect(screen.getByTestId("readonly-outdoor-scene")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("data-building-id", "b1");
    expect(screen.getByTestId("readonly-campus-path")).toHaveAttribute("data-path-id", "p1");
    expect(screen.getByTestId("readonly-entrance")).toHaveAttribute("data-entrance-id", "e1");
    expect(screen.getByTestId("readonly-exterior-emergency-stair")).toHaveAttribute("data-stair-id", "s1");
    expect(screen.getByTestId("exterior-stair-module")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-stair-landing")).toBeInTheDocument();
    expect(screen.getAllByTestId("exterior-stair-tread").length).toBeGreaterThan(2);
    expect(screen.getAllByTestId("readonly-decor").some((node) => node.getAttribute("data-asset-id") === "d1")).toBe(true);
    expect(screen.getByTestId("readonly-ground-area")).toHaveAttribute("data-ground-type", "parking");
    expect(screen.getAllByTestId("readonly-decor").some((node) => node.getAttribute("data-asset-id") === "monument-1")).toBe(true);
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

  it("renders entrance callbacks without throwing and reports the owning building", () => {
    const onClickEntrance = vi.fn();
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} onClickEntrance={onClickEntrance} /></svg>);

    fireEvent.click(screen.getByTestId("readonly-entrance"));
    expect(onClickEntrance).toHaveBeenCalledTimes(1);
    expect(onClickEntrance).toHaveBeenCalledWith("b1");
  });

  it("keeps authored physical paths visible when the building layer is hidden", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} showBuildings={false} /></svg>);
    expect(screen.getByTestId("readonly-campus-path")).toBeInTheDocument();
    expect(screen.queryByTestId("readonly-building")).not.toBeInTheDocument();
  });

  it("renders parking as adaptive stall markings without a dominant P card label", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} /></svg>);
    const lot = screen.getByTestId("readonly-ground-area");
    expect(lot).toHaveAttribute("data-ground-type", "parking");
    expect(lot.querySelectorAll("line").length).toBeGreaterThan(4);
    expect(lot.textContent).not.toContain("P");
  });

  it("uses a medium legacy default with constrained visual size options", () => {
    const base = { width: 28, height: 42 } as const;
    const small = exteriorEmergencyStairVisualDimensions({ ...base, visualSize: "small" });
    const medium = exteriorEmergencyStairVisualDimensions({ ...base, visualSize: undefined });
    const large = exteriorEmergencyStairVisualDimensions({ ...base, visualSize: "large" });
    expect(medium.width).toBeGreaterThan(base.width);
    expect(medium.height).toBeGreaterThan(base.height);
    expect(small.width).toBeLessThan(medium.width);
    expect(large.height).toBeGreaterThan(medium.height);
  });
});
