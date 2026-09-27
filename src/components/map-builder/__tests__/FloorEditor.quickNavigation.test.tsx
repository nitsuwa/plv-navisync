import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor, nextElevatorName } from "../FloorEditor";
import type { Campus, FloorPlan, NavigationEdge, NavigationNode } from "../types";

function makeQuickNavCampus(): Campus {
  const stair = (floorId: string, id: string): FloorPlan["stairs"][number] => ({
    id,
    x: 120,
    y: 100,
    width: 60,
    height: 80,
    label: "Left Stair",
    direction: "both",
    sharedId: "left-stair",
  });
  const floor = (id: string, number: number, stairId: string): FloorPlan => ({
    id,
    buildingId: "b1",
    number,
    label: number === 1 ? "Ground Floor" : "Floor 2",
    rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [],
    stairs: [stair(id, stairId)], ramps: [], elevators: [], labels: [],
  });
  const floors = [floor("f1", 1, "s1"), floor("f2", 2, "s2")];
  const navNodes: NavigationNode[] = [
    { id: "n1", name: "Left Stair", type: "stair", x: 150, y: 180, buildingId: "b1", floorId: "f1", stairId: "s1", accessible: false, color: "#475569" },
    { id: "n2", name: "Left Stair", type: "stair", x: 150, y: 180, buildingId: "b1", floorId: "f2", stairId: "s2", accessible: false, color: "#475569" },
  ];
  const navEdges: NavigationEdge[] = [{
    id: "tr1", startNodeId: "n1", endNodeId: "n2", distance: 1,
    bidirectional: true, accessible: false, type: "floor_transition", color: "#475569", width: 1,
  }];
  return {
    id: "c1", name: "Test Campus", code: "TC", description: "", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 580, canvasH: 380,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{ id: "b1", name: "Main Building", code: "MB", category: "Academic", description: "", x: 100, y: 100, width: 120, height: 80, color: "#0e2a6e", floors }],
    markers: [], paths: [], navNodes, navEdges, createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

describe("FloorEditor circulation quick navigation", () => {
  it("generates distinct numbered Elevator defaults without reusing an active number", () => {
    expect(nextElevatorName([])).toBe("Elevator 1");
    expect(nextElevatorName([{ label: "Elevator 1" }, { label: "Main Elevator" }])).toBe("Elevator 2");
    expect(nextElevatorName([{ label: "Elevator 2" }])).toBe("Elevator 3");
    expect(nextElevatorName([{ label: "Left Elevator" }], "Left Elevator")).toBe("Left Elevator Copy");
  });

  it("keeps legacy Ramp data loadable without offering a new Ramp tool", () => {
    const campus = makeQuickNavCampus();
    campus.buildings[0].floors[0].ramps = [{
      id: "legacy-ramp", x: 300, y: 100, width: 40, height: 20,
      label: "Legacy Ramp", direction: "both", accessible: true,
    }];
    render(
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId="f1"
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ramp", exact: true })).toBeNull();
    expect(screen.getByTestId("ramp-symbol")).toBeInTheDocument();
  });

  it("adds an Above link without replacing an existing Below link", () => {
    const campus = makeQuickNavCampus();
    let latestCampus = campus;
    const [floorOne, floorTwo] = campus.buildings[0].floors;
    floorOne.stairs[0].sharedId = "left-chain";
    floorTwo.stairs[0].sharedId = "left-chain";
    campus.buildings[0].floors.push({
      ...floorTwo,
      id: "f3",
      number: 3,
      label: "Floor 3",
      stairs: [{ ...floorTwo.stairs[0], id: "s3", sharedId: "upper-provisional" }],
    });
    campus.navNodes.push({
      id: "n3", name: "Left Stair", type: "stair", x: 150, y: 180,
      buildingId: "b1", floorId: "f3", stairId: "s3", accessible: false, color: "#475569",
    });

    function Harness() {
      const [value, setValue] = useState(campus);
      return (
        <FloorEditor
          campus={value}
          buildingId="b1"
          floorId="f2"
          initialSelection={{ type: "stairs", id: "s2" }}
          onBack={() => {}}
          onSwitchFloor={() => {}}
          onUpdate={(next) => { latestCampus = next; setValue(next); }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const target = within(screen.getByTestId("stair-picker-floor-f3")).getAllByRole("button", { name: /Left Stair/ })[0];
    fireEvent.click(target);
    const confirmation = screen.getByTestId("stair-cross-pair-confirmation");
    expect(confirmation).toHaveTextContent("Floor 3");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Connect" }));

    const floors = latestCampus.buildings[0].floors;
    expect(floors[0].stairs[0].sharedId).toBe("left-chain");
    expect(floors[1].stairs[0].sharedId).toBe("left-chain");
    expect(floors[2].stairs[0].sharedId).toBe("left-chain");
    expect(screen.getByTestId("stair-connections-side-panel")).toBeInTheDocument();
    expect(within(screen.getByTestId("stair-picker-floor-f3")).getByTestId("stair-picker-connected")).toHaveTextContent("Left Stair");
  });

  it("repairs a legacy mixed-shaft identity using only the explicitly selected Stair pair", () => {
    const campus = makeQuickNavCampus();
    const makeFloor = (id: string, number: number, leftId: string, rightId: string): FloorPlan => ({
      ...campus.buildings[0].floors[0],
      id,
      number,
      label: number === 1 ? "Ground Floor" : `Floor ${number}`,
      stairs: [
        { id: leftId, x: 40, y: 60, width: 24, height: 32, label: "Left Stair", direction: "both", sharedId: "legacy-main" },
        { id: rightId, x: 120, y: 60, width: 24, height: 32, label: "Right Stair", direction: "both", sharedId: "legacy-main" },
      ],
    });
    campus.buildings[0].floors = [
      makeFloor("f1", 1, "left-1", "right-1"),
      makeFloor("f2", 2, "left-2", "right-2"),
      makeFloor("f3", 3, "left-3", "right-3"),
    ];
    campus.navNodes = campus.buildings[0].floors.flatMap((floor) => floor.stairs.map((stair) => ({
      id: `node-${stair.id}`,
      name: stair.label!,
      type: "stair" as const,
      x: stair.x + stair.width / 2,
      y: stair.y + stair.height / 2,
      buildingId: "b1",
      floorId: floor.id,
      stairId: stair.id,
      accessible: false,
      color: "#475569",
    })));
    campus.navNodes.push({
      id: "free-walk-point",
      name: "Walking Point",
      type: "waypoint",
      x: 260,
      y: 210,
      buildingId: "b1",
      floorId: "f2",
      accessible: true,
      color: "#f97316",
    });
    campus.navEdges = [{
      id: "local-walk-edge",
      startNodeId: "node-right-2",
      endNodeId: "free-walk-point",
      distance: 170,
      bidirectional: true,
      accessible: true,
    }];
    const beforeNodes = structuredClone(campus.navNodes);
    const beforeEdges = structuredClone(campus.navEdges);
    let latestCampus = campus;

    function Harness() {
      const [value, setValue] = useState(campus);
      return (
        <FloorEditor
          campus={value}
          buildingId="b1"
          floorId="f2"
          initialSelection={{ type: "stairs", id: "right-2" }}
          onBack={() => {}}
          onSwitchFloor={() => {}}
          onUpdate={(next) => { latestCampus = next; setValue(next); }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const above = screen.getByTestId("stair-picker-floor-f3");
    expect(within(above).queryByTestId("stair-picker-connected")).toBeNull();
    expect(within(above).getByTestId("stair-connection-conflict-f3")).toBeInTheDocument();
    fireEvent.click(within(above).getByRole("button", { name: /Right Stair/ }));
    const confirmation = screen.getByTestId("stair-cross-pair-confirmation");
    expect(confirmation).toHaveTextContent("only these two selected Stairs");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Connect" }));

    const below = screen.getByTestId("stair-picker-floor-f1");
    fireEvent.click(within(below).getByRole("button", { name: /Right Stair/ }));
    const belowConfirmation = screen.getByTestId("stair-cross-pair-confirmation");
    fireEvent.click(within(belowConfirmation).getByRole("button", { name: "Connect" }));

    const floors = latestCampus.buildings[0].floors;
    const selectedChain = floors[1].stairs.find((stair) => stair.id === "right-2")?.sharedId;
    expect(selectedChain).toBeTruthy();
    expect(selectedChain).not.toBe("legacy-main");
    expect(floors[0].stairs.find((stair) => stair.id === "right-1")?.sharedId).toBe(selectedChain);
    expect(floors[2].stairs.find((stair) => stair.id === "right-3")?.sharedId).toBe(selectedChain);
    expect(floors[2].stairs.find((stair) => stair.id === "left-3")?.sharedId).toBe("legacy-main");
    expect(floors[0].stairs.find((stair) => stair.id === "left-1")?.sharedId).toBe("legacy-main");
    expect(floors[1].stairs.find((stair) => stair.id === "left-2")?.sharedId).toBe("legacy-main");
    expect(within(screen.getByTestId("stair-picker-floor-f3")).getByTestId("stair-picker-connected")).toHaveTextContent("Right Stair");
    expect(within(screen.getByTestId("stair-picker-floor-f3")).getByTestId("stair-picker-connected")).not.toHaveTextContent("Left Stair");
    expect(within(screen.getByTestId("stair-picker-floor-f1")).getByTestId("stair-picker-connected")).toHaveTextContent("Right Stair");
    expect(within(screen.getByTestId("stair-picker-floor-f1")).getByTestId("stair-picker-connected")).not.toHaveTextContent("Left Stair");
    const beforeNodeById = new Map(beforeNodes.map((node) => [node.id, node]));
    const afterNodeById = new Map(latestCampus.navNodes.map((node) => [node.id, node]));
    for (const untouchedId of ["node-left-1", "node-left-2", "node-left-3", "free-walk-point"]) {
      expect(afterNodeById.get(untouchedId)).toEqual(beforeNodeById.get(untouchedId));
    }
    for (const movedIdentityId of ["node-right-1", "node-right-2", "node-right-3"]) {
      expect(afterNodeById.get(movedIdentityId)?.x).toBe(beforeNodeById.get(movedIdentityId)?.x);
      expect(afterNodeById.get(movedIdentityId)?.y).toBe(beforeNodeById.get(movedIdentityId)?.y);
      expect(afterNodeById.get(movedIdentityId)?.transitionSharedId).toBe(selectedChain);
    }
    const transitionPairs = latestCampus.navEdges.filter((edge) => edge.type === "floor_transition")
      .map((edge) => [edge.startNodeId, edge.endNodeId].sort().join("|"));
    expect(transitionPairs).toContain("node-right-1|node-right-2");
    expect(transitionPairs).toContain("node-right-2|node-right-3");
    expect(transitionPairs).not.toContain("node-right-2|node-left-3");
    expect(latestCampus.navEdges.filter((edge) => edge.type !== "floor_transition")).toEqual(beforeEdges);
  });

  it("changes only the chosen Above continuation and preserves the Below Stair chain", () => {
    const campus = makeQuickNavCampus();
    const makeFloor = (id: string, number: number): FloorPlan => ({
      ...campus.buildings[0].floors[0],
      id,
      number,
      label: number === 1 ? "Ground Floor" : `Floor ${number}`,
      stairs: [
        { id: `left-${number}`, x: 40, y: 60, width: 24, height: 32, label: "Left Stair", direction: "both", sharedId: "left-chain" },
        { id: `right-${number}`, x: 120, y: 60, width: 24, height: 32, label: "Right Stair", direction: "both", sharedId: "right-chain" },
      ],
    });
    campus.buildings[0].floors = [makeFloor("f1", 1), makeFloor("f2", 2), makeFloor("f3", 3)];
    campus.navNodes = campus.buildings[0].floors.flatMap((floor) => floor.stairs.map((stair) => ({
      id: `node-${stair.id}`,
      name: stair.label!,
      type: "stair" as const,
      x: stair.x + stair.width / 2,
      y: stair.y + stair.height / 2,
      buildingId: "b1",
      floorId: floor.id,
      stairId: stair.id,
      accessible: false,
      color: "#475569",
    })));
    campus.navEdges = [];
    let latestCampus = campus;

    function Harness() {
      const [value, setValue] = useState(campus);
      return (
        <FloorEditor
          campus={value}
          buildingId="b1"
          floorId="f2"
          initialSelection={{ type: "stairs", id: "right-2" }}
          onBack={() => {}}
          onSwitchFloor={() => {}}
          onUpdate={(next) => { latestCampus = next; setValue(next); }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const above = screen.getByTestId("stair-picker-floor-f3");
    expect(within(above).getByTestId("stair-picker-connected")).toHaveTextContent("Right Stair");
    fireEvent.click(within(above).getByRole("button", { name: /Left Stair/ }));
    const confirmation = screen.getByTestId("stair-cross-pair-confirmation");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Connect" }));

    const floors = latestCampus.buildings[0].floors;
    const rightId = floors[1].stairs.find((stair) => stair.id === "right-2")?.sharedId;
    expect(floors[0].stairs.find((stair) => stair.id === "right-1")?.sharedId).toBe(rightId);
    expect(floors[2].stairs.find((stair) => stair.id === "left-3")?.sharedId).toBe(rightId);
    expect(floors[2].stairs.find((stair) => stair.id === "right-3")?.sharedId).not.toBe(rightId);
    expect(floors[0].stairs.find((stair) => stair.id === "left-1")?.sharedId)
      .toBe(floors[1].stairs.find((stair) => stair.id === "left-2")?.sharedId);
    const transitionPairs = latestCampus.navEdges.filter((edge) => edge.type === "floor_transition")
      .map((edge) => [edge.startNodeId, edge.endNodeId].sort().join("|"));
    expect(transitionPairs.sort()).toEqual([
      "node-left-1|node-left-2",
      "node-left-3|node-right-2",
      "node-right-1|node-right-2",
    ]);
  });

  it("connects both unambiguous matching Stair sides in one explicit action", () => {
    const campus = makeQuickNavCampus();
    const [floorOne, floorTwo] = campus.buildings[0].floors;
    floorOne.stairs[0].sharedId = "lower-provisional";
    delete floorTwo.stairs[0].sharedId;
    campus.buildings[0].floors.push({
      ...floorTwo,
      id: "f3",
      number: 3,
      label: "Floor 3",
      stairs: [{ ...floorTwo.stairs[0], id: "s3", sharedId: "upper-provisional" }],
    });
    campus.navNodes.push({
      id: "n3", name: "Left Stair", type: "stair", x: 150, y: 180,
      buildingId: "b1", floorId: "f3", stairId: "s3", accessible: false, color: "#475569",
    });
    let latestCampus = campus;
    function Harness() {
      const [value, setValue] = useState(campus);
      return (
        <FloorEditor
          campus={value}
          buildingId="b1"
          floorId="f2"
          initialSelection={{ type: "stairs", id: "s2" }}
          onBack={() => {}}
          onSwitchFloor={() => {}}
          onUpdate={(next) => { latestCampus = next; setValue(next); }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    fireEvent.click(screen.getByRole("button", { name: "Connect Matching Stairs" }));
    const confirmation = screen.getByTestId("stair-matching-confirmation");
    expect(confirmation).toHaveTextContent("Floor 3 · Left Stair");
    expect(confirmation).toHaveTextContent("Ground Floor · Left Stair");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Connect" }));
    const updatedFloors = latestCampus.buildings[0].floors;
    expect(updatedFloors[0].stairs[0].sharedId).toBeTruthy();
    expect(updatedFloors[1].stairs[0].sharedId).toBe(updatedFloors[0].stairs[0].sharedId);
    expect(updatedFloors[2].stairs[0].sharedId).toBe(updatedFloors[0].stairs[0].sharedId);
  });

  it("shows an identity-backed Stair indicator and jumps to the connected occurrence", () => {
    const onSwitchFloor = vi.fn();
    render(
      <FloorEditor
        campus={makeQuickNavCampus()}
        buildingId="b1"
        floorId="f1"
        onBack={() => {}}
        onSwitchFloor={onSwitchFloor}
        onUpdate={() => {}}
      />,
    );

    const indicator = screen.getByTestId("circulation-quick-nav-stairs");
    expect(indicator).toHaveAttribute("aria-label", "View connected Floors for Left Stair");
    fireEvent.mouseEnter(indicator);
    const popover = screen.getByTestId("circulation-quick-nav-popover-stairs");
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveClass("z-[200]");
    const dialog = popover.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toHaveStyle({ transform: "scale(1)" });
    expect(screen.getByText("Floor 2 · Left Stair")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Floor 2 · Left Stair/ }));
    expect(onSwitchFloor).toHaveBeenCalledWith("f2", { type: "stairs", id: "s2" });
  });

  it("keeps direction semantics separate from the physical continuation", () => {
    const campus = makeQuickNavCampus();
    campus.buildings[0].floors[1].stairs[0].direction = "up";
    render(
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId="f2"
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={() => {}}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId("circulation-quick-nav-stairs"));
    const lowerFloor = screen.getByRole("button", { name: /Ground Floor · Left Stair/ });
    expect(lowerFloor).toBeDisabled();
    expect(lowerFloor).toHaveAttribute("aria-label", expect.stringContaining("not usable from this floor"));
  });

  it("uses the same shortcut for an explicitly linked Elevator occurrence", () => {
    const campus = makeQuickNavCampus();
    const elevator = (id: string) => ({
      id, x: 220, y: 100, width: 46, height: 64, doorWidth: 24,
      label: "Main Elevator", sharedId: "main-elevator", floors: [1, 2],
    });
    campus.buildings[0].floors[0].elevators = [elevator("e1")];
    campus.buildings[0].floors[1].elevators = [elevator("e2")];
    campus.navNodes.push(
      { id: "en1", name: "Main Elevator", type: "elevator", x: 243, y: 132, buildingId: "b1", floorId: "f1", elevatorId: "e1", accessible: true, color: "#15803d" },
      { id: "en2", name: "Main Elevator", type: "elevator", x: 243, y: 132, buildingId: "b1", floorId: "f2", elevatorId: "e2", accessible: true, color: "#15803d" },
    );
    campus.navEdges.push({
      id: "etr1", startNodeId: "en1", endNodeId: "en2", distance: 1,
      bidirectional: true, accessible: true, type: "floor_transition", color: "#475569", width: 1,
    });
    const onSwitchFloor = vi.fn();
    render(
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId="f1"
        onBack={() => {}}
        onSwitchFloor={onSwitchFloor}
        onUpdate={() => {}}
      />,
    );

    expect(screen.getByTestId("elevator-connection-status")).toHaveAttribute("aria-label", "Connected to 2 floors");
    fireEvent.mouseEnter(screen.getByTestId("circulation-quick-nav-elevator"));
    expect(screen.getByText("Floor 2 · Main Elevator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Floor 2 · Main Elevator/ }));
    expect(onSwitchFloor).toHaveBeenCalledWith("f2", { type: "elevator", id: "e2" });
  });

  it("lists every served Elevator floor and jumps directly to a skipped stop", () => {
    const campus = makeQuickNavCampus();
    const elevator = (id: string) => ({
      id, x: 220, y: 100, width: 46, height: 64, doorWidth: 24,
      label: "Elevator 1", sharedId: "lift-all", floors: [1, 2, 5],
    });
    const building = campus.buildings[0];
    building.floors[0].elevators = [elevator("e1")];
    building.floors[1].elevators = [elevator("e2")];
    building.floors.push(
      { ...building.floors[1], id: "f3", number: 3, label: "Floor 3", elevators: [] },
      { ...building.floors[1], id: "f5", number: 5, label: "Floor 5", elevators: [elevator("e5")] },
    );
    const onSwitchFloor = vi.fn();
    render(
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId="f1"
        onBack={() => {}}
        onSwitchFloor={onSwitchFloor}
        onUpdate={() => {}}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId("circulation-quick-nav-elevator"));
    expect(screen.getByText(/Ground Floor .*Elevator 1/)).toBeInTheDocument();
    expect(screen.getByText(/Floor 2 .*Elevator 1/)).toBeInTheDocument();
    expect(screen.getByText(/Floor 5 .*Elevator 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Floor 3 .*Elevator 1/)).toBeNull();
    expect(screen.getByText("CURRENT")).toBeInTheDocument();
    expect(screen.queryByText("Current floor")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Floor 5 .*Elevator 1/ }));
    expect(onSwitchFloor).toHaveBeenCalledWith("f5", { type: "elevator", id: "e5" });
  });
});
