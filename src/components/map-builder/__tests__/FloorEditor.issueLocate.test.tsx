import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Final — FloorEditor issue-locate arrival ───────────────────────────
// When CampusEditor dispatches an indoor issue it calls onOpenFloor with an
// initialSelection. The Floor Editor must land in the right mode, select the
// target and open its properties:
//   navNode / navEdge → Navigation mode + nav properties panel
//   physical objects (stairs/elevator/…) → Design mode + object properties

function makeCampus(): Campus {
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
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 580,
    canvasH: 380,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [
      {
        id: "b1",
        name: "Main Building",
        code: "MB",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 120,
        height: 80,
        color: "#0e2a6e",
        floors: [
          { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
        ],
      },
    ],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function withGraph(): Campus {
  const campus = makeCampus();
  campus.buildings[0].floors[0] = {
    ...campus.buildings[0].floors[0],
    stairs: [{ id: "st1", x: 10, y: 120, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-core-a" }],
  };
  campus.navNodes = [
    { id: "n-orphan", name: "Broken Waypoint", type: "hallway", x: 40, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "n-stair", name: "Stairs", type: "stair", x: 20, y: 128, buildingId: "b1", floorId: "f1", stairId: "st1", accessible: false, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "ne-1", startNodeId: "n-orphan", endNodeId: "n-stair", distance: 100, bidirectional: false, accessible: true, emergencySafe: true, type: "walkway", bendPoints: [{ x: 60, y: 90 }] },
  ];
  return campus;
}

function Harness({ campus, initialSelection }: { campus: Campus; initialSelection: Parameters<typeof FloorEditor>[0]["initialSelection"] }) {
  const [state, setState] = useState<Campus>(campus);
  return (
    <FloorEditor
      campus={state}
      buildingId="b1"
      floorId="f1"
      initialSelection={initialSelection}
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={setState}
      onSave={async () => state}
    />
  );
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
});

describe("FloorEditor issue-locate arrival", () => {
  it("navNode initialSelection lands in Navigation mode with the node selected", () => {
    render(<Harness campus={withGraph()} initialSelection={{ type: "navNode", id: "n-orphan" }} />);
    // Navigation toolbar active.
    expect(screen.getByTestId("floor-nav-toolbar")).toBeTruthy();
    // Node properties open with the located waypoint's name.
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Broken Waypoint");
  });

  it("navEdge initialSelection lands in Navigation mode with the edge selected", () => {
    render(<Harness campus={withGraph()} initialSelection={{ type: "navEdge", id: "ne-1" }} />);
    expect(screen.getByTestId("floor-nav-toolbar")).toBeTruthy();
    expect(screen.getByTestId("floor-nav-edge-props")).toBeTruthy();
  });

  it("stairs initialSelection lands in Design mode with the physical stair selected", () => {
    render(<Harness campus={withGraph()} initialSelection={{ type: "stairs", id: "st1" }} />);
    // Design mode (no nav toolbar).
    expect(screen.queryByTestId("floor-nav-toolbar")).toBeNull();
    // Stair properties heading visible.
    expect(screen.getAllByText("Stairs").length).toBeGreaterThan(0);
  });

  it("door initialSelection lands in Design mode with the door selected", () => {
    const campus = withGraph();
    campus.buildings[0].floors[0] = {
      ...campus.buildings[0].floors[0],
      doors: [{ id: "door-1", x: 105, y: 45, width: 18, direction: "left", color: "#d97706", label: "North Door" }],
    };
    render(<Harness campus={campus} initialSelection={{ type: "door", id: "door-1" }} />);
    expect(screen.queryByTestId("floor-nav-toolbar")).toBeNull();
    expect(screen.getAllByText("Door").length).toBeGreaterThan(0);
  });
});
