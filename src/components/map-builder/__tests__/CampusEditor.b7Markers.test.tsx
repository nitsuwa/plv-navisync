import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode, NavigationEdge, FloorSelection } from "../types";

// ── B7 Phase 1 — Campus on-canvas markers + locate-flash geometry ─────────
// Affected campus objects (building / entrance / nav node / nav edge) carry
// ONE small restrained marker; the locate ping centers EXACTLY on the target
// geometry (node coordinates / polyline midpoint).

function makeCampus(overrides?: Partial<Campus>): Campus {
  return {
    id: "c1",
    name: "Test Campus",
    code: "TC",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "published",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function node(overrides: Partial<NavigationNode> & { id: string; type: NavigationNode["type"] }): NavigationNode {
  return {
    name: overrides.id,
    x: 200,
    y: 200,
    accessible: true,
    color: "#16a34a",
    ...overrides,
  };
}

function edge(overrides: Partial<NavigationEdge> & { id: string; startNodeId: string; endNodeId: string }): NavigationEdge {
  return {
    distance: 100,
    bidirectional: true,
    accessible: true,
    type: "walkway",
    color: "#16a34a",
    width: 3,
    ...overrides,
  };
}

function withBuilding(campus: Campus, overrides: Partial<Campus["buildings"][number]> = {}): Campus {
  return {
    ...campus,
    buildings: [{
      id: "b1",
      name: "Building One",
      code: "B1",
      category: "Academic",
      description: "",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      color: "#1e40af",
      expanded: false,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general" }],
      ...overrides,
    }],
  };
}

let applyFixRef: ((c: Campus) => void) | null = null;

function Harness({ initialCampus }: { initialCampus: Campus }) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  applyFixRef = setCampus;
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={setCampus}
      onPublish={() => {}}
      onOpenFloor={(_buildingId: string, _floorId: string, _selection?: FloorSelection) => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus)}
    />
  );
}

function openIssuesPopover() {
  fireEvent.mouseDown(screen.getByTestId("issues-popover"));
}

function campusMarkers(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-testid="campus-issue-marker"]'));
}

let warningSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
  infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
});

afterEach(() => {
  cleanup();
  warningSpy.mockRestore();
  infoSpy.mockRestore();
  applyFixRef = null;
});

describe("CampusEditor on-canvas issue markers (B7 Phase 1)", () => {
  it("shows one marker on an orphan nav node (Navigation layer only)", () => {
    const campus = makeCampus({
      navNodes: [node({ id: "n1", type: "outdoor" })],
    });
    const { container } = render(<Harness initialCampus={campus} />);
    // B7 correction: nav markers are hidden in Design mode (default layer).
    const designMarkers = campusMarkers(container);
    expect(designMarkers).toHaveLength(0);
    // Switch to Navigation layer — the nav marker appears.
    fireEvent.click(screen.getByText("Navigation"));
    const navMarkers = campusMarkers(container);
    expect(navMarkers).toHaveLength(1);
    expect(navMarkers[0].getAttribute("data-issue-object")).toBe("navNode:n1");
    expect(navMarkers[0].getAttribute("data-issue-severity")).toBe("warning");
  });

  it("shows one marker on a building entrance with no navigation waypoint", () => {
    const campus = withBuilding(makeCampus());
    const { container } = render(<Harness initialCampus={campus} />);
    const markers = campusMarkers(container);
    const entranceMarker = markers.find((m) => m.getAttribute("data-issue-object") === "entrance:e1");
    expect(entranceMarker).toBeTruthy();
    expect(entranceMarker!.getAttribute("data-issue-severity")).toBe("warning");
  });

  it("renders ONE marker per object when multiple issues hit the same building (error wins)", () => {
    // Missing name (warning) + extends beyond the canvas (error) — both target
    // the SAME building, so exactly one marker must render with error severity.
    const campus = withBuilding(makeCampus(), {
      name: "",
      x: 850, // canvas is 900 wide; building is 120 wide → boundary error
    });
    const { container } = render(<Harness initialCampus={campus} />);
    const buildingMarkers = campusMarkers(container).filter((m) => m.getAttribute("data-issue-object") === "building:b1");
    expect(buildingMarkers).toHaveLength(1);
    expect(buildingMarkers[0].getAttribute("data-issue-severity")).toBe("error");
  });

  it("the marker disappears immediately when the issue is fixed", () => {
    const campus = makeCampus({
      navNodes: [node({ id: "n1", type: "outdoor" })],
    });
    const { container } = render(<Harness initialCampus={campus} />);
    // B7 correction: nav markers are hidden in Design mode (default layer).
    // Switch to Navigation to see the marker, then fix the issue.
    fireEvent.click(screen.getByText("Navigation"));
    expect(campusMarkers(container)).toHaveLength(1);

    // Replace the campus (as if the admin deleted the orphan node) — the
    // marker must vanish without a save.
    act(() => { applyFixRef!({ ...campus, navNodes: [] }); });
    expect(campusMarkers(container)).toHaveLength(0);
    // With zero issues the popover is replaced by the green OK badge.
    expect(screen.queryByTestId("issues-popover")).toBeNull();
    expect(screen.getByText("OK")).toBeTruthy();
  });
});

describe("CampusEditor locate behavior (B7 Phase 1 — ping removed)", () => {
  it("selects the waypoint after clicking locate (no floating ping)", () => {
    const campus = makeCampus({
      navNodes: [node({ id: "n1", type: "outdoor", x: 240, y: 160 })],
    });
    const { container } = render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/has no navigation connections/));

    // Locate flash overlay should NOT render (removed in B7 correction)
    expect(container.querySelector('[data-testid="locate-flash"]')).toBeNull();
  });

  it("selects the edge after clicking locate for a bent-edge duplicate (no floating ping)", () => {
    const campus = makeCampus({
      navNodes: [
        node({ id: "a", type: "outdoor", x: 200, y: 200 }),
        node({ id: "b", type: "outdoor", x: 400, y: 200 }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "a", endNodeId: "b", bendPoints: [{ x: 300, y: 100 }] }),
        edge({ id: "e2", startNodeId: "a", endNodeId: "b", bendPoints: [{ x: 300, y: 100 }] }),
      ],
    });
    const { container } = render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/Duplicate navigation connection/));

    // Locate flash overlay should NOT render (removed in B7 correction)
    expect(container.querySelector('[data-testid="locate-flash"]')).toBeNull();
  });
});
