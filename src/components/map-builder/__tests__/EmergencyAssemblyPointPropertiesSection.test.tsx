import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AssemblyPoint, Campus, NavigationEdge, NavigationNode } from "../types";
import { EmergencyAssemblyPointPropertiesSection } from "../EmergencyAssemblyPointPropertiesSection";

const primary: AssemblyPoint = {
  id: "primary-a", name: "Main Field", x: 100, y: 100, campusId: "test-campus", navNodeId: "node-primary-a",
  buildingAssignments: [{ buildingId: "building-a", designation: "primary" }],
};
const firstAlternate: AssemblyPoint = {
  id: "alternate-a", name: "East Gathering Area", x: 200, y: 100, campusId: "test-campus", navNodeId: "node-alternate-a",
  buildingAssignments: [{ buildingId: "building-a", designation: "alternate" }],
};
const selectedPoint: AssemblyPoint = {
  id: "selected", name: "Secondary Open Space", x: 300, y: 100, campusId: "test-campus", navNodeId: "node-selected",
  buildingAssignments: [{ buildingId: "building-b", designation: "primary" }],
};

function AssignmentHarness() {
  const [points, setPoints] = useState<AssemblyPoint[]>([primary, firstAlternate, selectedPoint]);
  const current = points.find((point) => point.id === selectedPoint.id)!;
  const campus = {
    id: "test-campus",
    buildings: [
      { id: "building-a", code: "A", name: "Building A" },
      { id: "building-b", code: "B", name: "Building B" },
    ],
    assemblyPoints: points,
  } as unknown as Campus;
  return <>
    <EmergencyAssemblyPointPropertiesSection
      campus={campus}
      point={current}
      onUpdate={(id, changes) => setPoints((existing) => existing.map((point) => point.id === id ? { ...point, ...changes } : point))}
      onConnect={vi.fn()}
      onDelete={vi.fn()}
    />
    <output data-testid="current-assignments">{JSON.stringify(current.buildingAssignments)}</output>
  </>;
}

describe("EmergencyAssemblyPointPropertiesSection", () => {
  it("opens an outdoor connectivity report, focuses the owned point, and clears the map highlight", () => {
    const point: AssemblyPoint = {
      id: "inspection-point", name: "North Assembly Area", x: 10, y: 10, campusId: "test-campus", navNodeId: "assembly-anchor",
      buildingAssignments: [{ buildingId: "building-a", designation: "primary" }],
    };
    const makeNode = (id: string, x: number, refs: Partial<NavigationNode> = {}): NavigationNode => ({
      id, name: id, type: "outdoor", x, y: 10, campusId: "test-campus", accessible: true, color: "#16a34a", ...refs,
    });
    const makeEdge = (id: string, startNodeId: string, endNodeId: string): NavigationEdge => ({
      id, startNodeId, endNodeId, distance: 10, bidirectional: true, accessible: true, emergencySafe: true,
      type: "walkway", color: "#16a34a", width: 3,
    });
    const campus = {
      id: "test-campus", name: "Test Campus", code: "TEST", canvasW: 300, canvasH: 200,
      buildings: [{ id: "building-a", code: "A", name: "Building A" }],
      assemblyPoints: [point], settings: { emergencyDestinationPolicy: "fixed_primary" },
      navNodes: [
        makeNode("assembly-anchor", 10, { type: "assembly", assemblyPointId: point.id }),
        makeNode("local-endpoint", 20), makeNode("campus-endpoint", 100), makeNode("campus-main", 120),
      ],
      navEdges: [makeEdge("local-walkway", "assembly-anchor", "local-endpoint"), makeEdge("main-walkway", "campus-endpoint", "campus-main")],
    } as unknown as Campus;
    const onInspect = vi.fn();
    const onClear = vi.fn();

    render(<EmergencyAssemblyPointPropertiesSection
      campus={campus}
      point={point}
      onUpdate={vi.fn()}
      onConnect={vi.fn()}
      onInspectOutdoorNetwork={onInspect}
      onClearOutdoorNetworkInspection={onClear}
      onDelete={vi.fn()}
    />);

    expect(screen.getByTestId("assembly-outdoor-network-status")).toHaveTextContent("Connection needed");
    expect(screen.queryByTestId("assembly-anchor-link-status")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Connection" })).toBeInTheDocument();
    expect(screen.queryByText("Safety Review")).toBeNull();
    expect(screen.queryByTestId("emergency-destination-policy-select")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Inspect Connections" }));
    expect(onInspect).toHaveBeenCalledWith(point.id);
    expect(screen.getByTestId("assembly-outdoor-connectivity-report")).toHaveTextContent(/disconnected from the main/);
    expect(screen.getByTestId("assembly-nearest-outdoor-gap")).toHaveTextContent(/local-endpoint/);
    fireEvent.click(screen.getByRole("button", { name: "Clear outdoor network highlight" }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("assembly-outdoor-connectivity-report")).toBeNull();
  });

  it("allows multiple Alternate points for a building while keeping Primary unique", () => {
    render(<AssignmentHarness />);

    fireEvent.click(screen.getByText("Assigned Buildings"));

    const assignBuildingA = screen.getByRole("button", { name: "Assign A Building A" });
    expect(assignBuildingA).toBeEnabled();
    fireEvent.click(assignBuildingA);

    expect(screen.getByTestId("current-assignments")).toHaveTextContent(/"buildingId":"building-a","designation":"alternate"/);
    const alternateButtons = screen.getAllByRole("button", { name: "Alternate" });
    expect(alternateButtons).toHaveLength(2);
    expect(alternateButtons.every((button) => !button.hasAttribute("disabled"))).toBe(true);
    const selectedPrimary = screen.getAllByRole("button", { name: "Primary" }).find((button) => button.getAttribute("aria-pressed") === "false");
    expect(selectedPrimary).toBeTruthy();
    fireEvent.click(selectedPrimary!);
    expect(screen.getByRole("heading", { name: "Reassign the Primary Assembly Point?" })).toBeInTheDocument();
    expect(screen.getByText(/Main Field is currently Primary for Building A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reassign Primary" }));
    expect(screen.getByTestId("current-assignments")).toHaveTextContent(/"buildingId":"building-a","designation":"primary"/);
  });

  it("keeps policy and routine review controls out of Assembly Point properties", () => {
    render(<AssignmentHarness />);
    expect(screen.queryByTestId("emergency-destination-policy-select")).toBeNull();
    expect(screen.queryByTestId("assembly-point-approve")).toBeNull();
  });

  it("shows one campus-component legend when the Assembly Point is already in the largest network", () => {
    const point = { ...primary, navNodeId: "assembly-anchor" };
    const makeNode = (id: string, x: number, refs: Partial<NavigationNode> = {}): NavigationNode => ({
      id, name: id, type: "outdoor", x, y: 10, campusId: "test-campus", accessible: true, color: "#16a34a", ...refs,
    });
    const makeEdge = (id: string, startNodeId: string, endNodeId: string): NavigationEdge => ({
      id, startNodeId, endNodeId, distance: 10, bidirectional: true, accessible: true, emergencySafe: true,
      type: "walkway", color: "#16a34a", width: 3,
    });
    const campus = {
      id: "test-campus", name: "Test Campus", code: "TEST", canvasW: 300, canvasH: 200,
      buildings: [{ id: "building-a", code: "A", name: "Building A" }],
      assemblyPoints: [point],
      navNodes: [
        makeNode("assembly-anchor", 10, { type: "assembly", assemblyPointId: point.id }),
        makeNode("campus-a", 20), makeNode("campus-b", 30), makeNode("isolated-a", 100), makeNode("isolated-b", 110),
      ],
      navEdges: [
        makeEdge("assembly-link", "assembly-anchor", "campus-a"),
        makeEdge("campus-link", "campus-a", "campus-b"),
        makeEdge("isolated-link", "isolated-a", "isolated-b"),
      ],
    } as unknown as Campus;

    render(<EmergencyAssemblyPointPropertiesSection campus={campus} point={point} onUpdate={vi.fn()} onConnect={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect Connections" }));

    expect(screen.getByTestId("assembly-main-network-legend")).toHaveTextContent("Assembly Point in main campus component");
    expect(screen.queryByTestId("assembly-component-legend")).toBeNull();
    expect(screen.queryByTestId("main-campus-component-legend")).toBeNull();
  });
});
