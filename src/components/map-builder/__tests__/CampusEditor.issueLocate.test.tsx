import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode, NavigationEdge, FloorSelection } from "../types";

// ── B5 Final — live issues + click-to-locate workflow ─────────────────────
// 1. Issues are derived from the CURRENT campus (orphan appears → connect →
//    disappears immediately, count updates in the toolbar).
// 2. Duplicate validation runs never show the same issue twice.
// 3. Outdoor locate: switch layer, select, open properties.
// 4. Indoor locate: onOpenFloor(building, floor, navNode/navEdge selection).

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

function withBuilding(campus: Campus): Campus {
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
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general" }],
    }],
  };
}

let openFloorCalls: { buildingId: string; floorId: string; selection: FloorSelection | undefined }[] = [];
let applyFixRef: ((c: Campus) => void) | null = null;

function Harness({ initialCampus, onCampusChange }: { initialCampus: Campus; onCampusChange?: (c: Campus) => void }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus);
  applyFixRef = setCampus;
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={(buildingId, floorId, selection) => { openFloorCalls.push({ buildingId, floorId, selection }); }}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus)}
    />
  );
}

function openIssuesPopover() {
  const btn = screen.getByTestId("issues-popover");
  // The popover opens on mousedown (like a click); fireEvent.mouseDown is the
  // reliable trigger in jsdom for this button's onMouseDown handler.
  fireEvent.mouseDown(btn);
}

let warningSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
  infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
  openFloorCalls = [];
  applyFixRef = null;
});

afterEach(() => {
  cleanup();
  warningSpy.mockRestore();
  infoSpy.mockRestore();
});

// ── A/B/D. LIVE ISSUES + COUNT ────────────────────────────────────────────

describe("live issues", () => {
  it("orphan node issue appears, then disappears immediately once connected", () => {
    const campus = makeCampus({
      navNodes: [node({ id: "nnA", type: "outdoor" }), node({ id: "nnB", type: "outdoor" })],
    });
    const { container } = render(<Harness initialCampus={campus} />);

    const btn = screen.getByTestId("issues-popover");
    expect(btn.getAttribute("data-count")).toBe("2");

    // Fix: connect the two nodes.
    const fixed: Campus = { ...campus, navEdges: [edge({ id: "ne1", startNodeId: "nnA", endNodeId: "nnB" })] };
    act(() => { applyFixRef!(fixed); });

    // Both orphans are gone → zero issues → the OK badge replaces the popover.
    expect(screen.queryByTestId("issues-popover")).toBeNull();
    expect(screen.getByText("OK")).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it("issue count matches the current validation result after a partial fix", () => {
    const campus = makeCampus({
      navNodes: [
        node({ id: "nnA", type: "outdoor" }),
        node({ id: "nnB", type: "outdoor" }),
        node({ id: "nnC", type: "outdoor" }),
        node({ id: "nnD", type: "outdoor" }),
      ],
    });
    render(<Harness initialCampus={campus} />);
    expect(screen.getByTestId("issues-popover").getAttribute("data-count")).toBe("4");

    // Connect two of the four nodes → the other two remain orphans.
    const fixed: Campus = { ...campus, navEdges: [edge({ id: "ne1", startNodeId: "nnA", endNodeId: "nnB" })] };
    act(() => { applyFixRef!(fixed); });
    expect(screen.getByTestId("issues-popover").getAttribute("data-count")).toBe("2");
  });

  it("repeated validation runs never duplicate the same logical issue", () => {
    // A single blocked outdoor edge crossing a building footprint would
    // produce one issue per validation run — the memo must not duplicate it.
    const campus = makeCampus({
      buildings: [{
        id: "b1",
        name: "Blocking Building",
        code: "BB",
        category: "Academic",
        description: "",
        x: 150,
        y: -40,
        width: 100,
        height: 80,
        color: "#1e40af",
        expanded: false,
        floors: [],
      }],
      navNodes: [
        node({ id: "n1", type: "outdoor", x: 0, y: 0 }),
        node({ id: "n2", type: "outdoor", x: 400, y: 0 }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "n1", endNodeId: "n2" })],
    });
    render(<Harness initialCampus={campus} />);

    // The blocked-edge warning should appear exactly once in the popover.
    openIssuesPopover();
    const blockedRows = screen.queryAllByText(/intersects a blocking obstacle/);
    expect(blockedRows.length).toBe(1);
  });

  it("broken physical reference produces one issue and disappears when repaired", () => {
    const campus = withBuilding(makeCampus({
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
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      }],
      navNodes: [node({ id: "door-node", type: "room_access", buildingId: "b1", floorId: "f1", doorId: "missing-door" })],
    }));
    render(<Harness initialCampus={campus} />);
    const btn = screen.getByTestId("issues-popover");
    const before = Number(btn.getAttribute("data-count"));

    // Repair: restore the door on the floor.
    const fixed: Campus = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        floors: [{
          id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [],
          doors: [{ id: "missing-door", x: 10, y: 10, width: 8, direction: "left", color: "#000" }],
        }],
      }],
    };
    act(() => { applyFixRef!(fixed); });
    const after = Number(screen.getByTestId("issues-popover").getAttribute("data-count"));
    expect(after).toBe(before - 1);
  });
});

// ── E/F. OUTDOOR LOCATE ───────────────────────────────────────────────────

describe("outdoor locate", () => {
  it("locating an outdoor waypoint switches to Navigation mode and selects the node", () => {
    const campus = makeCampus({
      navNodes: [node({ id: "nnA", name: "Gate A", type: "outdoor" })],
    });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/has no navigation connections/));

    // No floor hop for outdoor targets.
    expect(openFloorCalls).toHaveLength(0);
    // Navigation layer becomes active + the waypoint properties panel opens.
    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.value).toBe("Gate A");
  });

  it("locating an outdoor nav edge selects the edge and opens Navigation Connection properties", () => {
    const campus = makeCampus({
      // Building straddles the polyline so the edge is blocked.
      buildings: [{
        id: "b1",
        name: "Blocking Building",
        code: "BB",
        category: "Academic",
        description: "",
        x: 150,
        y: -40,
        width: 100,
        height: 80,
        color: "#1e40af",
        expanded: false,
        floors: [],
      }],
      navNodes: [
        node({ id: "n1", type: "outdoor", x: 0, y: 0 }),
        node({ id: "n2", type: "outdoor", x: 400, y: 0 }),
      ],
      navEdges: [edge({ id: "e1", startNodeId: "n1", endNodeId: "n2" })],
    });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/intersects a blocking obstacle/));

    expect(openFloorCalls).toHaveLength(0);
    // Navigation Connection properties are open (heading + section label).
    expect(screen.getAllByText("Navigation Connection").length).toBeGreaterThan(0);
    // The blocked warning surfaces in the edge properties.
    expect(screen.getAllByText(/blocked|intersects/i).length).toBeGreaterThan(0);
  });

  it("locating an entrance issue selects the entrance without hopping into a floor", () => {
    const campus = withBuilding(makeCampus());
    // Building has floors but no entrance nav node → nav_entrance_bridge_missing.
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/has no navigation waypoint/));

    expect(openFloorCalls).toHaveLength(0);
    // Entrance properties panel opens (Entrance heading in properties).
    expect(screen.getAllByText("Entrance").length).toBeGreaterThan(0);
  });
});

// ── G/H. INDOOR LOCATE ────────────────────────────────────────────────────

describe("indoor locate", () => {
  it("locating an indoor node opens the correct building/floor in Navigation mode", () => {
    const campus = withBuilding(makeCampus({
      navNodes: [node({ id: "indoor-orphan", type: "hallway", buildingId: "b1", floorId: "f1" })],
    }));
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/has no navigation connections/));

    expect(openFloorCalls).toHaveLength(1);
    expect(openFloorCalls[0].buildingId).toBe("b1");
    expect(openFloorCalls[0].floorId).toBe("f1");
    expect(openFloorCalls[0].selection).toEqual({ type: "navNode", id: "indoor-orphan" });
  });

  it("locating a broken Door reference selects the broken nav node (not the missing door)", () => {
    const campus = withBuilding(makeCampus({
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
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      }],
      navNodes: [node({ id: "door-node", type: "room_access", buildingId: "b1", floorId: "f1", doorId: "missing-door" })],
    }));
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/references a door that no longer exists/));

    expect(openFloorCalls).toHaveLength(1);
    expect(openFloorCalls[0].buildingId).toBe("b1");
    expect(openFloorCalls[0].floorId).toBe("f1");
    // The door is gone — locate the broken nav node itself.
    expect(openFloorCalls[0].selection).toEqual({ type: "navNode", id: "door-node" });
  });

  it("locating a broken Room reference selects the broken nav node", () => {
    const campus = withBuilding(makeCampus({
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
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      }],
      navNodes: [node({ id: "room-node", type: "room_access", buildingId: "b1", floorId: "f1", roomId: "missing-room" })],
    }));
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/references a room that no longer exists/));

    expect(openFloorCalls).toHaveLength(1);
    expect(openFloorCalls[0].selection).toEqual({ type: "navNode", id: "room-node" });
  });

  // ── B5 FINAL CORRECTION — stale building/floor fallback ────────────────
  // An issue whose node references a DELETED floor/building must NEVER hop
  // into a dead editor route ("Floor unavailable"). It stays on the campus
  // canvas, selects the surviving nav node, opens its Waypoint properties and
  // warns — or shows a toast when nothing survives.

  it("broken Door + DELETED floor does NOT open the Floor Editor and selects the stale node", () => {
    const campus = makeCampus({
      // Building exists but the referenced floor "f1" was deleted.
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
        floors: [{ id: "f2", buildingId: "b1", number: 2, label: "Second Floor", rooms: [], paths: [] }],
      }],
      navNodes: [node({ id: "door-node", type: "room_access", buildingId: "b1", floorId: "f1", doorId: "missing-door" })],
    });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/references a door that no longer exists/));

    // Never a dead floor route.
    expect(openFloorCalls).toHaveLength(0);
    // Warning + the surviving nav node is selected on the campus canvas.
    expect(warningSpy).toHaveBeenCalledWith("Referenced floor no longer exists", expect.objectContaining({ description: expect.any(String) }));
    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
  });

  it("broken Room + DELETED building does NOT open the Floor Editor", () => {
    const campus = makeCampus({
      // The node references building "b1" which no longer exists at all.
      buildings: [],
      navNodes: [node({ id: "room-node", type: "room_access", buildingId: "b1", floorId: "f1", roomId: "missing-room" })],
    });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/references a room that no longer exists/));

    expect(openFloorCalls).toHaveLength(0);
    expect(warningSpy).toHaveBeenCalledWith("Referenced floor no longer exists", expect.objectContaining({ description: expect.any(String) }));
    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
  });

  it("an issue with no locatable target stays stable (toast, no navigation)", () => {
    // nav_disconnected_component carries no node/edge/building target — the
    // dispatcher must not navigate anywhere.
    const campus = makeCampus({
      navNodes: [
        node({ id: "n1", type: "outdoor", x: 0, y: 0 }),
        node({ id: "n2", type: "outdoor", x: 40, y: 0 }),
        node({ id: "n3", type: "outdoor", x: 200, y: 0 }),
        node({ id: "n4", type: "outdoor", x: 240, y: 0 }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "n1", endNodeId: "n2" }),
        edge({ id: "e2", startNodeId: "n3", endNodeId: "n4" }),
      ],
    });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    // The row exists; clicking it must NOT hop floors or switch selection.
    const rows = screen.queryAllByText(/disconnected components/);
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    expect(openFloorCalls).toHaveLength(0);
    expect(infoSpy).toHaveBeenCalledWith("This issue refers to an object or floor that no longer exists", expect.objectContaining({ description: expect.any(String) }));
  });

  it("locating a missing shared transition ID opens Design mode targeting the physical stair", () => {
    const campus = withBuilding(makeCampus({
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
        floors: [
          { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] },
          { id: "f2", buildingId: "b1", number: 2, label: "Second Floor", rooms: [], paths: [] },
        ],
      }],
      navNodes: [
        node({ id: "stair-node-1", type: "stair", buildingId: "b1", floorId: "f1", stairId: "phys-stair-1" }),
        node({ id: "stair-node-2", type: "stair", buildingId: "b1", floorId: "f2", stairId: "phys-stair-2" }),
      ],
      navEdges: [edge({ id: "te1", startNodeId: "stair-node-1", endNodeId: "stair-node-2", type: "floor_transition" })],
    }));
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/missing a shared transition ID/));

    expect(openFloorCalls).toHaveLength(1);
    expect(openFloorCalls[0].buildingId).toBe("b1");
    expect(openFloorCalls[0].floorId).toBe("f1");
    // Physical stair in Design mode so the shared ID can be fixed.
    expect(openFloorCalls[0].selection).toEqual({ type: "stairs", id: "phys-stair-1" });
  });
});
