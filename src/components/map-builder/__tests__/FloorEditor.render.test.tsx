import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

/**
 * Minimal campus fixture — just enough for the Floor Editor to mount.
 */
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
          {
            id: "f1",
            buildingId: "b1",
            number: 1,
            label: "Ground Floor",
            rooms: [],
            paths: [],
            walls: [],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
          },
        ],
      },
    ],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

describe("FloorEditor render (regression: LandPlot runtime crash)", () => {
  it("renders the structure editor without throwing", () => {
    expect(() =>
      render(
        <FloorEditor
          campus={makeCampus()}
          buildingId="b1"
          floorId="f1"
          onBack={() => {}}
          onSwitchFloor={() => {}}
          onUpdate={() => {}}
        />
      )
    ).not.toThrow();
  });

  it("shows the unified floor object library including the Window (LandPlot) button", () => {
    render(
      <FloorEditor
        campus={makeCampus()}
        buildingId="b1"
        floorId="f1"
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={() => {}}
      />
    );
    // Object-library sidebar buttons (rendered from the same JSX that used
    // the previously-unimported LandPlot icon)
    expect(screen.getByText("Wall")).toBeInTheDocument();
    expect(screen.getByText("Window")).toBeInTheDocument();
    expect(screen.getByText("Door")).toBeInTheDocument();
    expect(screen.getByText("Stairs")).toBeInTheDocument();
    // "Elevator" appears in multiple places (sidebar + tool labels)
    expect(screen.getAllByText("Elevator").length).toBeGreaterThan(0);
    // Floor breadcrumb + unified library render.
    expect(screen.getAllByText("Ground Floor").length).toBeGreaterThan(0);
    expect(screen.getByText("Object Library")).toBeInTheDocument();
    expect(screen.queryByText("Structure")).toBeNull();
    expect(screen.queryByText("Interior")).toBeNull();
  });

  it("shows a recoverable message instead of creating fake data when the floor is missing", () => {
    render(
      <FloorEditor
        campus={makeCampus()}
        buildingId="b1"
        floorId="missing-floor"
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={() => {
          throw new Error("missing floor must not save fake data");
        }}
      />
    );

    expect(screen.getByText("Floor unavailable")).toBeInTheDocument();
    expect(screen.getByText("The selected floor could not be loaded. No floor data was changed.")).toBeInTheDocument();
  });
});
