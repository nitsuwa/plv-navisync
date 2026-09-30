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
  markers: [
    { id: "m1", name: "Gate", type: "entrance", x: 30, y: 40, color: "#111827" },
    { id: "m2", name: "Landmark", type: "landmark", x: 70, y: 40, color: "#7c3aed" },
  ],
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

  it("keeps regular outdoor assets at the Admin canvas display scale", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} /></svg>);

    const tree = screen.getAllByTestId("readonly-decor").find((node) => node.getAttribute("data-asset-id") === "d1");
    const treeArtwork = tree?.querySelector("svg");

    // The Admin Canvas renders the tree descriptor (24 × 28) at the shared
    // 3× decor scale. Student Preview must preserve that authored footprint.
    expect(treeArtwork).toHaveAttribute("width", "72");
    expect(treeArtwork).toHaveAttribute("height", "84");
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

  it("uses Admin building label/body styling and the shared entrance glyph", () => {
    const { container } = render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} /></svg>);
    const building = screen.getByTestId("readonly-building");
    const buildingName = Array.from(building.querySelectorAll("text")).find((node) => node.textContent === "Library");
    expect(building.querySelector('rect[fill="#0f4c81"]')).toHaveAttribute("opacity", "0.82");
    expect(buildingName).toHaveAttribute("y", "152");

    const entranceArt = screen.getByTestId("campus-entrance-artwork");
    expect(entranceArt.querySelector("path")).toHaveAttribute("d", "M-10,-7 L10,-7 L10,7 L-10,7 Z");
    expect(entranceArt.querySelector('circle[cx="-8"]')).toBeInTheDocument();
    expect(container.querySelector('pattern[id="campus-ground-asphalt-pattern"]')).toBeInTheDocument();
    const markerArtwork = screen.getAllByTestId("campus-marker-artwork").find((node) => node.getAttribute("data-marker-id") === "m2");
    expect(markerArtwork.querySelector("text")?.textContent).toBe("★");
  });

  it("hides student-facing building and marker labels when labels are disabled", () => {
    const { container } = render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} showLabels={false} /></svg>);
    const textValues = Array.from(container.querySelectorAll("text")).map((element) => element.textContent);
    expect(textValues).not.toContain("LIB");
    expect(textValues).not.toContain("Library");
    expect(textValues).not.toContain("Landmark");
    expect(screen.getByTestId("readonly-building")).toBeInTheDocument();
  });

  it("uses the shared continuous path-chain geometry for connected authored paths", () => {
    const connectedPathsCampus = {
      ...campus,
      paths: [
        campus.paths[0],
        { id: "p2", points: [{ x: 100, y: 80 }, { x: 200, y: 100 }], type: "walkway", color: "#b45309", width: 10 },
      ],
    } as unknown as Campus;
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(connectedPathsCampus)} /></svg>);
    const chain = screen.getByTestId("readonly-campus-path");
    expect(chain).toHaveAttribute("data-path-ids", "p1,p2");
    expect(screen.getByTestId("campus-path-network-artwork").querySelectorAll("path")).toHaveLength(2);
  });

  it("keeps authored physical paths visible when the building layer is hidden", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} showBuildings={false} /></svg>);
    expect(screen.getByTestId("readonly-campus-path")).toBeInTheDocument();
    expect(screen.queryByTestId("readonly-building")).not.toBeInTheDocument();
  });

  it("renders parking with the shared detailed stall and vehicle artwork", () => {
    const parkingCampus = {
      ...campus,
      decorAssets: [{ ...campus.decorAssets![1]!, type: "parking-lot" as const, width: 360, height: 180, rotation: 27 }],
    };
    const projected = projectReadonlyOutdoorCampus(parkingCampus);
    render(<svg><ReadonlyOutdoorCampusScene campus={projected} /></svg>);
    const lot = screen.getByTestId("readonly-ground-area");
    expect(lot).toHaveAttribute("data-ground-type", "parking");
    expect(lot).toHaveAttribute("transform", "rotate(27,420,360)");
    const markings = screen.getByTestId("parking-stalls");
    expect(markings.querySelectorAll("path")).toHaveLength(4);
    expect(markings.querySelector("svg")).toHaveAttribute("viewBox", "0 0 120 72");
    expect(markings.querySelector("svg")).toHaveAttribute("width", "360");
    expect(markings.querySelector("svg")).toHaveAttribute("height", "180");
    expect(markings.querySelector("svg path")).toHaveAttribute("fill", "#cbd5e1");
    expect(projected.decorAssets[0]).toBe(parkingCampus.decorAssets?.[0]);
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
