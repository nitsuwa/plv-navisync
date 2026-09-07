import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FloorEditor, exteriorEmergencyStairSafeOffsetRange } from "../FloorEditor";
import type { Campus, FloorStairs } from "../types";
import { syncExteriorEmergencyStairGraph } from "../../../lib/exteriorEmergencyStairs";

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

function mockFloorSvgViewport(svg: SVGSVGElement, width = 600, height = 450) {
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width, height, right: width, bottom: height }),
  });
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

  it("exposes the expanded university furniture categories without leaving the floor workspace", () => {
    render(<FloorEditor campus={makeCampus()} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Tables / Work" }));
    expect(screen.getByText("Whiteboard / Teaching Board")).toBeInTheDocument();
    expect(screen.getByText("Lectern / Podium")).toBeInTheDocument();
    expect(screen.getByText("Laboratory Sink")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Storage" }));
    expect(screen.getByText("Locker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Electronics" }));
    expect(screen.getByText("Printer / Copier")).toBeInTheDocument();
    expect(screen.getByText("Server / Network Rack")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restroom / Fixtures" }));
    expect(screen.getByText("Toilet")).toBeInTheDocument();
    expect(screen.getByText("Accessible / PWD Stall")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Safety / Facilities" }));
    expect(screen.getByText("Wall Fire Extinguisher")).toBeInTheDocument();
    expect(screen.getByText("Emergency Light")).toBeInTheDocument();
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

  it("uses compact Exterior Architecture cards instead of pre-placement type/side selectors", () => {
    render(<FloorEditor campus={makeCampus()} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    expect(screen.getByTitle("Exterior Zone")).toBeInTheDocument();
    expect(screen.getByTitle("Entrance Steps")).toBeInTheDocument();
    expect(screen.getByTitle("Entrance Ramp")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Exterior Zone type" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Exterior Zone side" })).toBeNull();
  });

  it("keeps Room creation in the Build group and ignores modified tool hotkeys", () => {
    render(<FloorEditor campus={makeCampus()} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    const roomAction = screen.getByTestId("room-library-tool");
    expect(roomAction).toBeInTheDocument();
    expect(roomAction.parentElement?.textContent).toContain("+ Room");

    const stairsAction = screen.getByTitle("Stairs");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(stairsAction.className).not.toContain("border-primary");
    fireEvent.keyDown(window, { key: "s" });
    expect(stairsAction.className).toContain("border-primary");
  });

  it("keeps a furniture footprint in an authored Veranda while dragging", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Veranda 1" }];
    floor.furniture = [{ id: "chair-1", type: "chair", name: "Chair", category: "seating", x: 250, y: 470, width: 24, height: 20, rotation: 0, color: "#c08457" }];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const furniture = container.querySelector('[data-layer-key="furniture:chair-1"]');
    expect(furniture).toBeTruthy();
    fireEvent.mouseDown(furniture!, { clientX: 262, clientY: 480, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 290, clientY: 490, bubbles: true });
    fireEvent.mouseUp(svg!, { bubbles: true });
    const moved = updates.at(-1)?.buildings[0].floors[0].furniture?.find((item) => item.id === "chair-1");
    expect(moved?.y).toBeGreaterThan(450);
    expect(moved?.x).toBeGreaterThan(250);
  });

  it("allows furniture to cross the perimeter wall when the final footprint enters a Veranda", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Veranda 1" }];
    floor.furniture = [{ id: "chair-1", type: "chair", name: "Chair", category: "seating", x: 250, y: 400, width: 24, height: 20, rotation: 0, color: "#c08457" }];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const furniture = container.querySelector('[data-layer-key="furniture:chair-1"]');
    expect(furniture).toBeTruthy();
    fireEvent.mouseDown(furniture!, { clientX: 262, clientY: 410, bubbles: true });
    // The pointer crosses y=450 (the perimeter) before reaching this fully
    // contained Veranda destination.  The editor validates the destination,
    // not that intermediate pointer trajectory.
    fireEvent.mouseMove(svg!, { clientX: 262, clientY: 480, bubbles: true });
    fireEvent.mouseUp(svg!, { bubbles: true });
    const moved = updates.at(-1)?.buildings[0].floors[0].furniture?.find((item) => item.id === "chair-1");
    expect(moved?.y).toBeGreaterThanOrEqual(450);
    expect(moved?.y).toBeLessThanOrEqual(502);
  });

  it("rejects a furniture destination that is still straddling the perimeter wall", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Veranda 1" }];
    floor.furniture = [{ id: "chair-1", type: "chair", name: "Chair", category: "seating", x: 250, y: 420, width: 24, height: 20, rotation: 0, color: "#c08457" }];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const furniture = container.querySelector('[data-layer-key="furniture:chair-1"]');
    expect(furniture).toBeTruthy();
    fireEvent.mouseDown(furniture!, { clientX: 262, clientY: 430, bubbles: true });
    // y=440..460 is neither wholly indoor nor wholly inside the Veranda.
    fireEvent.mouseMove(svg!, { clientX: 262, clientY: 450, bubbles: true });
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates).toHaveLength(0);
  });

  it("shows a red Room ghost for an invalid move while preserving the last valid Room", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [
      { id: "room-a", name: "Room A", type: "classroom", x: 80, y: 80, w: 100, h: 70, floorId: "f1", buildingId: "b1" },
      { id: "room-b", name: "Room B", type: "classroom", x: 300, y: 80, w: 100, h: 70, floorId: "f1", buildingId: "b1" },
    ];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.querySelector('[data-testid="floor-canvas-boundary"]'));
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    // The interactive ordered-room layer owns the pointer handler; the later
    // visual layer is intentionally pointer-events-none.
    const room = container.querySelector('[data-floor-title="Room A"]');
    expect(room).toBeTruthy();
    fireEvent.mouseDown(room!, { clientX: 90, clientY: 90, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 310, clientY: 90, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="placement-warning-badge"]')?.textContent).toMatch(/Overlaps.*Room/);
    const previewRect = container.querySelector('[data-testid="room-invalid-preview"] rect');
    const badge = container.querySelector('[data-testid="placement-warning-badge"]');
    expect(Number(badge?.getAttribute("data-anchor-center-y"))).toBeCloseTo(
      Number(previewRect?.getAttribute("y")) + Number(previewRect?.getAttribute("height")) / 2,
    );
    expect(updates).toHaveLength(0);
    expect(room?.querySelector("rect")?.getAttribute("x")).toBe("80");
    fireEvent.mouseMove(svg!, { clientX: 100, clientY: 200, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')).toBeNull();
    fireEvent.mouseUp(svg!, { bubbles: true });
  });

  it("shows a red Room ghost for an invalid resize and commits no blocked geometry", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [
      { id: "room-a", name: "Room A", type: "classroom", x: 80, y: 80, w: 100, h: 70, floorId: "f1", buildingId: "b1" },
      { id: "room-b", name: "Room B", type: "classroom", x: 300, y: 80, w: 100, h: 70, floorId: "f1", buildingId: "b1" },
    ];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "room", id: "room-a" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.querySelector('[data-testid="floor-canvas-boundary"]'));
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const eastHandle = Array.from(container.querySelectorAll('[data-testid="room-resize-handle"]')).find((handle) => handle.getAttribute("data-corner") === "e");
    expect(eastHandle).toBeTruthy();
    fireEvent.mouseDown(eastHandle!, { clientX: 180, clientY: 115, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 320, clientY: 115, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')?.getAttribute("data-preview-kind")).toBe("resize");
    expect(container.querySelector('[data-testid="placement-warning-badge"]')?.textContent).toMatch(/Overlaps.*Room/);
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates).toHaveLength(0);
  });

  it("cancels every physical placement tool with Escape without creating history", () => {
    const campus = makeCampus();
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    for (const toolName of ["Wall", "Door", "Window", "Room", "Stairs", "Elevator", "Exterior Zone", "Entrance Steps", "Entrance Ramp"] as const) {
      fireEvent.click(screen.getByTitle(toolName));
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.mouseMove(svg!, { clientX: 260, clientY: 260, bubbles: true });
      fireEvent.mouseDown(svg!, { clientX: 260, clientY: 260, bubbles: true });
      fireEvent.mouseUp(svg!, { bubbles: true });
    }
    expect(updates).toHaveLength(0);
    expect(screen.getByTitle("Select (V)").className).toContain("bg-primary");
  });

  it("keeps furniture resizing in an authored Veranda instead of clamping to the indoor floor", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Veranda 1" }];
    floor.furniture = [{ id: "chair-1", type: "chair", name: "Chair", category: "seating", x: 250, y: 470, width: 24, height: 20, rotation: 0, color: "#c08457" }];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const furniture = container.querySelector('[data-layer-key="furniture:chair-1"]');
    expect(furniture).toBeTruthy();
    fireEvent.mouseDown(furniture!, { clientX: 262, clientY: 480, bubbles: true });
    const eastHandle = Array.from(container.querySelectorAll('[data-testid="furniture-resize-handle"]')).find((handle) => handle.getAttribute("data-corner") === "e");
    expect(eastHandle).toBeTruthy();
    fireEvent.mouseDown(eastHandle!, { clientX: 274, clientY: 480, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 320, clientY: 480, bubbles: true });
    const resized = updates.at(-1)?.buildings[0].floors[0].furniture?.find((item) => item.id === "chair-1");
    expect(resized?.y).toBeGreaterThan(450);
    expect((resized?.x ?? 0) + (resized?.width ?? 0)).toBeLessThanOrEqual(390.5);
  });

  it("presents a generated exterior stair landing in a locked outside zone", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-east",
      buildingId: "b1",
      label: "East Fire Escape",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      sharedId: "ext-east-shared",
      emergencySafe: true,
    }];
    floor.stairs = [{
      id: "landing-f1",
      x: 886,
      y: 319,
      width: 28,
      height: 42,
      direction: "both",
      label: "East Fire Escape",
      exteriorEmergencyStairId: "ext-east",
      attachment: { edge: "right", offset: 0.5 },
      locked: true,
      visible: true,
    } as FloorStairs];

    render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);

    expect(screen.getByTestId("floor-exterior-emergency-module")).toBeInTheDocument();
    expect(screen.getByTestId("floor-exterior-emergency-hit-target")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-stair-platform")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-stair-door-opening")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-emergency-stair-floor-symbol")).toBeInTheDocument();
  });

  it("uses the generated exterior inspector and visible-module bounds when selected", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-east",
      buildingId: "b1",
      label: "East Fire Escape",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      sharedId: "ext-east-shared",
      emergencySafe: true,
      visualSize: "large",
    }];
    floor.stairs = [{
      id: "landing-f1",
      x: 886,
      y: 319,
      width: 28,
      height: 42,
      direction: "both",
      label: "East Fire Escape",
      exteriorEmergencyStairId: "ext-east",
      attachment: { edge: "right", offset: 0.5 },
      locked: true,
      visible: true,
    } as FloorStairs];

    render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "stairs", id: "landing-f1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);

    expect(screen.getByTestId("generated-exterior-stair-inspector")).toBeInTheDocument();
    expect(screen.getByText("Generated / Locked")).toBeInTheDocument();
    expect(screen.queryByTestId("stair-direction-control")).toBeNull();
    expect(screen.queryByText("Entry side")).toBeNull();
    expect(screen.queryByText("Manage Connections")).toBeNull();
    expect(screen.queryAllByTestId("stairs-resize-handle")).toHaveLength(0);
    expect(screen.getByTestId("exterior-stair-selection-outline")).toBeInTheDocument();
    expect(screen.getAllByTestId("exterior-emergency-stair-status")).toHaveLength(1);
    expect(screen.queryByTestId("circulation-quick-nav-stairs")).toBeNull();
    expect(screen.getByText("STAIR EXIT")).toBeInTheDocument();
    expect(screen.getByText("EXIT", { exact: true })).toBeInTheDocument();
    const exitBadge = screen.getByTestId("exterior-emergency-exit-badge");
    expect(exitBadge.querySelector('[data-testid="emergency-exit-person"]')).toBeNull();
    expect(exitBadge.querySelector("text")?.textContent).toBe("EXIT");
  });

  it("shows an actionable readiness reason when the generated stair lacks outdoor discharge connectivity", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-needs-connection", buildingId: "b1", label: "East Fire Escape", state: "open",
      width: 28, height: 42, attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"], sharedId: "ext-needs-connection-shared", emergencySafe: true,
    }];
    floor.stairs = [{
      id: "landing-needs-connection", x: 886, y: 319, width: 28, height: 42, direction: "both",
      label: "East Fire Escape", exteriorEmergencyStairId: "ext-needs-connection",
      attachment: { edge: "right", offset: 0.5 }, locked: true, visible: true,
    } as FloorStairs];
    campus.navNodes = [
      {
        id: "landing-needs-connection-nav", name: "East Fire Escape", type: "stair", x: 900, y: 340,
        buildingId: "b1", floorId: "f1", stairId: "landing-needs-connection",
        exteriorEmergencyStairId: "ext-needs-connection", accessible: false, emergencySafe: true,
      },
      { id: "local-ground-waypoint", name: "Ground walkway", type: "hallway", x: 860, y: 340, buildingId: "b1", floorId: "f1", accessible: true, emergencySafe: true },
    ];
    campus.navEdges = [{
      id: "landing-local-edge", startNodeId: "landing-needs-connection-nav", endNodeId: "local-ground-waypoint",
      distance: 40, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway",
    }];

    render(<FloorEditor
      campus={syncExteriorEmergencyStairGraph(campus)}
      buildingId="b1"
      floorId="f1"
      initialSelection={{ type: "stairs", id: "landing-needs-connection" }}
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={() => {}}
    />);

    expect(screen.getByTestId("generated-stair-readiness-status")).toHaveTextContent("Needs attention");
    expect(screen.getByTestId("generated-stair-readiness-issue")).toHaveTextContent(/Connect the Ground discharge to the Outdoor Walking Network/i);
  });

  it("keeps a generated Exterior Emergency Stair anchor derived while Navigation Select is active", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-east", buildingId: "b1", label: "East Fire Escape", state: "open",
      width: 28, height: 42, attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"], sharedId: "ext-east-shared", emergencySafe: true,
    }];
    const synced = syncExteriorEmergencyStairGraph(campus);
    const updates: Campus[] = [];
    render(<FloorEditor campus={synced} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);

    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const anchor = screen.getByTestId("nav-linked-node");
    const svg = anchor.closest("svg");
    fireEvent.mouseDown(anchor, { clientX: 500, clientY: 225 });
    fireEvent.mouseMove(svg!, { clientX: 430, clientY: 180 });
    fireEvent.mouseUp(svg!);

    expect(updates).toHaveLength(0);
    expect(screen.getByTestId("nav-stair-access-marker")).toBeInTheDocument();
    expect(screen.getByTestId("nav-stair-access-marker").querySelector('circle[stroke="#dc2626"]')).toBeNull();
    expect(screen.getByTestId("floor-exterior-emergency-module")).toBeInTheDocument();
  });

  it("closes Test Route without turning off an already-enabled Navigation overlay", async () => {
    render(<FloorEditor campus={makeCampus()} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const routeButtons = screen.getAllByRole("button", { name: "Test Route" });
    fireEvent.click(routeButtons.at(-1)!);
    fireEvent.click(screen.getAllByRole("button", { name: "Test Route" }).at(-1)!);

    await waitFor(() => expect(screen.queryAllByTestId("test-route-full")).toHaveLength(0));
    expect(screen.getByRole("button", { name: "Hide Navigation" })).toBeInTheDocument();
  });

  it("confirms Building-owned Exterior Emergency Stair removal from the Floor inspector", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-east", buildingId: "b1", label: "East Fire Escape", state: "open",
      width: 28, height: 42, attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"], sharedId: "ext-east-shared", emergencySafe: true,
    }];
    floor.stairs = [{
      id: "landing-f1", x: 886, y: 319, width: 28, height: 42, direction: "both",
      label: "East Fire Escape", exteriorEmergencyStairId: "ext-east",
      attachment: { edge: "right", offset: 0.5 }, locked: true, visible: true,
    } as FloorStairs];
    const updates: Campus[] = [];
    render(<FloorEditor campus={syncExteriorEmergencyStairGraph(campus)} buildingId="b1" floorId="f1" initialSelection={{ type: "stairs", id: "landing-f1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Exterior Emergency Stair" }));
    expect(screen.getByRole("dialog", { name: "Remove Exterior Emergency Stair?" })).toHaveTextContent("Building-owned");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updates).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove Exterior Emergency Stair" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Stair" }));
    expect(updates.at(-1)?.buildings[0].exteriorEmergencyStairs ?? []).toHaveLength(0);
    expect(updates.at(-1)?.buildings[0].floors[0].stairs ?? []).toHaveLength(0);
  });

  it("collapses and restores the Object Library without consuming Floor Navigator space", () => {
    render(<FloorEditor campus={makeCampus()} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    expect(screen.getByRole("button", { name: "Collapse Object Library" })).toBeInTheDocument();
    expect(screen.getByTestId("floor-tab-bar")).toHaveStyle({ left: "224px" });

    fireEvent.click(screen.getByRole("button", { name: "Collapse Object Library" }));
    expect(screen.getByRole("button", { name: "Expand Object Library" })).toBeInTheDocument();
    expect(screen.getByTestId("floor-tab-bar")).toHaveStyle({ left: "52px" });

    fireEvent.click(screen.getByRole("button", { name: "Expand Object Library" }));
    expect(screen.getByRole("button", { name: "Collapse Object Library" })).toBeInTheDocument();
  });

  it("renders wall-constrained Exterior Zone resize affordances on selection", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Veranda 1" }];
    render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.mouseDown(screen.getByTestId("exterior-zone"), { clientX: 390, clientY: 380 });
    expect(screen.getByTestId("exterior-zone-selection-outline")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-zone-resize-handle-span-start")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-zone-resize-handle-span-end")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-zone-resize-handle-depth")).toBeInTheDocument();
  });

  it("renders parent-attached access features on their selected exposed edges", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Veranda 1" }];
    floor.entranceSteps = [{ id: "steps-1", x: 0, y: 0, width: 48, height: 28, label: "Steps", parentZoneId: "zone-1", attachmentEdge: "end", attachmentOffset: 0.5, accessible: false }];
    floor.entranceRamps = [{ id: "ramp-1", x: 0, y: 0, width: 64, height: 36, label: "Ramp", parentZoneId: "zone-1", attachmentEdge: "outer", attachmentOffset: 0.5, accessible: true }];
    render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);

    expect(screen.getByTestId("entrance-steps")).toHaveAttribute("data-edge", "right");
    expect(screen.getByTestId("entrance-ramp")).toHaveAttribute("data-edge", "bottom");
  });

  it.each([
    ["Exterior ZoneAdd semi-outdoor space", "zone"],
    ["Entrance StepsAdd local stair approach", "steps"],
    ["Entrance RampAdd accessible approach", "ramp"],
  ] as const)("keeps %s placement active while Space pans without committing", (buttonName, kind) => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    if (kind !== "zone") {
      floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 220, depth: 180, label: "Veranda 1" }];
    }
    const updates: Campus[] = [];
    const { container } = render(
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId="f1"
        initialSelection={kind === "zone" ? undefined : { type: "exteriorZone", id: "zone-1" }}
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={(next) => updates.push(next)}
      />
    );
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.mouseDown(svg!, { clientX: 420, clientY: 320, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 340, clientY: 280, bubbles: true });
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates).toHaveLength(0);
    fireEvent.keyUp(window, { code: "Space" });

    // The tool remains armed after the camera gesture; the next ordinary
    // click commits through the normal placement path.
    // With the camera panned up/left, the child candidate is on the parent
    // zone's exposed South-left edge while remaining inside the SVG viewport.
    const placementPoint = kind === "zone" ? { clientX: 300, clientY: 380 } : { clientX: 110, clientY: 450 };
    fireEvent.mouseMove(svg!, { ...placementPoint, bubbles: true });
    fireEvent.mouseDown(svg!, { ...placementPoint, bubbles: true });
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates).toHaveLength(1);
  });

  it("preserves an authored ramp depth while dragging along its parent edge", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 220, depth: 180, label: "Veranda 1" }];
    floor.entranceRamps = [{ id: "ramp-1", x: 0, y: 0, width: 64, height: 70, label: "Ramp", parentZoneId: "zone-1", attachmentEdge: "outer", attachmentOffset: 0.5, accessible: true }];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "entranceRamp", id: "ramp-1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);

    fireEvent.mouseDown(screen.getByTestId("entrance-ramp"), { clientX: 300, clientY: 640, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 340, clientY: 630, bubbles: true });
    const movedRamp = updates.at(-1)?.buildings[0].floors[0].entranceRamps?.[0];
    expect(movedRamp?.attachmentOffset).not.toBe(0.5);
    expect(movedRamp?.height).toBe(70);
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates.at(-1)?.buildings[0].floors[0].entranceRamps?.[0].height).toBe(70);
  });

  it("mirrors a selected access feature to the opposite parent edge", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 220, depth: 180, label: "Veranda 1" }];
    floor.entranceSteps = [{ id: "steps-1", x: 0, y: 0, width: 48, height: 28, label: "Steps", parentZoneId: "zone-1", attachmentEdge: "start", attachmentOffset: 0.2, accessible: false }];
    const updates: Campus[] = [];
    render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "entranceSteps", id: "steps-1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByTestId("duplicate-opposite-side"));
    const copy = updates.at(-1)?.buildings[0].floors[0].entranceSteps?.find((item) => item.id !== "steps-1");
    expect(copy?.parentZoneId).toBe("zone-1");
    expect(copy?.attachmentEdge).toBe("end");
    expect(copy?.attachmentOffset).toBeCloseTo(0.8);
  });

  it("exposes constrained ramp layout and horizontal/vertical mirror controls", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 220, depth: 90, label: "Veranda 1" }];
    floor.entranceRamps = [{ id: "ramp-1", x: 0, y: 0, width: 64, height: 36, label: "Ramp", parentZoneId: "zone-1", attachmentEdge: "outer", attachmentOffset: 0.5, accessible: true, layout: "l_turn_left" }];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "entranceRamp", id: "ramp-1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    expect(screen.getByRole("combobox", { name: "Ramp layout" })).toBeInTheDocument();
    const path = container.querySelector<SVGPathElement>('[data-testid="ramp-layout-path"]');
    const arrowHead = container.querySelector<SVGPathElement>('[data-testid="ramp-direction-cue"]');
    expect(path?.getAttribute("data-layout")).toBe("l_turn_left");
    expect(container.querySelectorAll('[data-testid="ramp-layout-path"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="ramp-direction-cue"]')).toHaveLength(1);
    // L-turns intentionally omit inner rails so the bend remains a single
    // readable route instead of three stacked L-shaped strokes.
    expect(container.querySelectorAll('[data-testid="ramp-rail"]')).toHaveLength(0);
    expect(path?.getAttribute("d")?.match(/\bM\b/g)).toHaveLength(1);
    expect(arrowHead?.getAttribute("d")?.match(/\bM\b/g)).toHaveLength(2);
    expect(arrowHead?.getAttribute("stroke")).toBe(path?.getAttribute("stroke"));
    expect(arrowHead?.getAttribute("stroke-width")).toBe(path?.getAttribute("stroke-width"));
    expect(arrowHead?.getAttribute("opacity")).toBe(path?.getAttribute("opacity"));
    const values = (path?.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
    expect(points.length).toBe(3);
    expect(points.slice(1).every((point, index) => point.x === points[index].x || point.y === points[index].y)).toBe(true);
    fireEvent.click(screen.getByTestId("flip-horizontal"));
    expect(updates.at(-1)?.buildings[0].floors[0].entranceRamps?.[0].flipHorizontal).toBe(true);
    fireEvent.click(screen.getByTestId("flip-vertical"));
    expect(updates.at(-1)?.buildings[0].floors[0].entranceRamps?.[0].flipVertical).toBe(true);
  });

  it("keeps Straight and L-turn Right ramps to one clean path and two rails", () => {
    for (const layout of ["straight", "l_turn_right"] as const) {
      const campus = makeCampus();
      const floor = campus.buildings[0].floors[0];
      floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 220, depth: 90, label: "Veranda 1" }];
      floor.entranceRamps = [{ id: "ramp-1", x: 0, y: 0, width: 96, height: 56, label: "Ramp", parentZoneId: "zone-1", attachmentEdge: "outer", attachmentOffset: 0.5, accessible: true, layout }];
      const { container, unmount } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "entranceRamp", id: "ramp-1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
      const path = container.querySelector<SVGPathElement>('[data-testid="ramp-layout-path"]');
      expect(container.querySelectorAll('[data-testid="ramp-layout-path"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-testid="ramp-direction-cue"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-testid="ramp-rail"]')).toHaveLength(layout === "straight" ? 2 : 0);
      expect(path?.getAttribute("d")?.match(/\bM\b/g)).toHaveLength(1);
      expect(container.querySelector<SVGPathElement>('[data-testid="ramp-direction-cue"]')?.getAttribute("d")?.match(/\bM\b/g)).toHaveLength(2);
      if (layout === "l_turn_right") {
        const values = (path?.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
        expect(points).toHaveLength(3);
        expect(points.slice(1).every((point, index) => point.x === points[index].x || point.y === points[index].y)).toBe(true);
      }
      unmount();
    }
  });

  it("scales the straight travel path with authored ramp depth", () => {
    const renderRamp = (height: number) => {
      const campus = makeCampus();
      const floor = campus.buildings[0].floors[0];
      floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 220, depth: 120, label: "Veranda 1" }];
      floor.entranceRamps = [{ id: "ramp-1", x: 0, y: 0, width: 80, height, label: "Ramp", parentZoneId: "zone-1", attachmentEdge: "outer", attachmentOffset: 0.5, accessible: true, layout: "straight" }];
      const rendered = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "entranceRamp", id: "ramp-1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
      const path = rendered.container.querySelector<SVGPathElement>('[data-testid="ramp-layout-path"]');
      const values = (path?.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const run = Math.abs((values[3] ?? 0) - (values[1] ?? 0));
      rendered.unmount();
      return run;
    };

    expect(renderRamp(96)).toBeGreaterThan(renderRamp(32));
  });

  it("keeps the generated module orientation tied to each authored attachment side", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    const owner = {
      id: "ext",
      buildingId: "b1",
      label: "Fire Escape",
      state: "open" as const,
      width: 28,
      height: 42,
      attachment: { edge: "right" as const, offset: 0.5 },
      servedFloorIds: ["f1"],
      sharedId: "ext-shared",
    };
    campus.buildings[0].exteriorEmergencyStairs = [owner];
    floor.stairs = [{ id: "ext-occ", x: 860, y: 300, width: 28, height: 42, direction: "both", label: "Fire Escape", exteriorEmergencyStairId: owner.id, attachment: owner.attachment, locked: true, visible: true } as FloorStairs];
    const view = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    for (const edge of ["right", "left", "top", "bottom"] as const) {
      owner.attachment = { edge, offset: 0.5 };
      floor.stairs[0].attachment = owner.attachment;
      view.rerender(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
      expect(screen.getByTestId("floor-exterior-emergency-module")).toHaveAttribute("data-edge", edge);
    }
  });

  it("writes a Floor drag back to the canonical owner and reconciles every served occurrence", () => {
    const campus = makeCampus();
    campus.buildings[0].floors.push({ ...campus.buildings[0].floors[0], id: "f2", number: 2, label: "Floor 2" });
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-east",
      buildingId: "b1",
      label: "East Fire Escape",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1", "f2"],
      sharedId: "ext-east-shared",
      emergencySafe: true,
    }];
    const synced = syncExteriorEmergencyStairGraph(campus);
    const updates: Campus[] = [];
    const view = render(<FloorEditor campus={synced} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const hit = screen.getByTestId("floor-exterior-emergency-hit-target");
    const svg = hit.closest("svg");
    expect(svg).toBeTruthy();
    fireEvent.mouseDown(hit, { clientX: 0, clientY: 225 });
    fireEvent.mouseMove(svg!, { clientX: 0, clientY: 180 });
    fireEvent.mouseUp(svg!);
    const latest = updates.at(-1);
    expect(latest?.buildings[0].exteriorEmergencyStairs?.[0].attachment.offset).toBe(0.4);
    expect(latest?.buildings[0].floors.flatMap((floor) => floor.stairs).filter((stair) => stair.exteriorEmergencyStairId === "ext-east").every((stair) => stair.attachment?.offset === 0.4)).toBe(true);

    // The single gesture history entry carries the owner snapshot. Restoring
    // it must reconcile all served occurrences, not only the mounted Floor.
    view.rerender(<FloorEditor campus={latest!} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const undone = updates.at(-1);
    expect(undone?.buildings[0].exteriorEmergencyStairs?.[0].attachment.offset).toBe(0.5);
    expect(undone?.buildings[0].floors.flatMap((floor) => floor.stairs).filter((stair) => stair.exteriorEmergencyStairId === "ext-east").every((stair) => stair.attachment?.offset === 0.5)).toBe(true);

    // Redo reapplies the same canonical owner position and therefore moves
    // every served occurrence together again.
    view.rerender(<FloorEditor campus={undone!} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    const redone = updates.at(-1);
    expect(redone?.buildings[0].exteriorEmergencyStairs?.[0].attachment.offset).toBe(0.4);
    expect(redone?.buildings[0].floors.flatMap((floor) => floor.stairs).filter((stair) => stair.exteriorEmergencyStairId === "ext-east").every((stair) => stair.attachment?.offset === 0.4)).toBe(true);
  });

  it("keeps the complete generated module inside the safe span on every attached side", () => {
    const sides = ["left", "right", "top", "bottom"] as const;
    for (const side of sides) {
      const range = exteriorEmergencyStairSafeOffsetRange(side, 580, 380, 28, 42, "large");
      expect(range.min).toBeGreaterThan(0);
      expect(range.max).toBeLessThan(1);
      expect(range.min).toBeLessThan(range.max);
    }
  });
});

describe("FloorEditor top toolbar (B6 manual-QA: deterministic responsive grouping)", () => {
  function renderEditor() {
    return render(
      <FloorEditor
        campus={makeCampus()}
        buildingId="b1"
        floorId="f1"
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={() => {}}
      />
    );
  }

  it("keeps floor toolbar lifecycle controls in a visible three-zone header", () => {
    renderEditor();
    const header = screen.getByTestId("floor-editor-header");
    expect(header.className).toContain("editor-toolbar-shell");
    expect(header.className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]");
    expect(header.className).toContain("overflow-visible");
    expect(screen.getByTestId("floor-toolbar-left")).toBeInTheDocument();
    expect(screen.getByTestId("floor-toolbar-center")).toBeInTheDocument();
    expect(screen.getByTestId("floor-toolbar-right")).toBeInTheDocument();
    expect(screen.getByTestId("floor-toolbar-lifecycle")).toBeInTheDocument();
    expect(screen.getByTestId("floor-toolbar-right").querySelector(".flex-1.min-w-8")).toBeNull();
    expect(screen.getByTestId("floor-tab-bar").className).toContain("absolute");
  });

  it("keeps Save and Publish in the same shrink-0 group so a wrapped row never splits them", () => {
    renderEditor();
    const save = screen.getByRole("button", { name: /^Save$/i });
    const publish = screen.getByRole("button", { name: /^Publish$/i });
    expect(save.parentElement).toBe(publish.parentElement);
    expect(save.parentElement?.className).toContain("shrink-0");
    // Both sit inside the deterministic flex-wrap toolbar row.
    const wrap = save.closest(".flex-wrap");
    expect(wrap).toBeTruthy();
    expect(wrap?.className).toContain("min-h-11");
  });

  it("keeps Undo and Redo in the same group", () => {
    renderEditor();
    const undo = screen.getByRole("button", { name: /^Undo/i });
    const redo = screen.getByRole("button", { name: /^Redo/i });
    expect(undo.parentElement).toBe(redo.parentElement);
  });

  it("still renders the major control groups (mode switch, floor tabs, issues, save/publish)", () => {
    renderEditor();
    expect(screen.getByTestId("floor-tab-bar")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Design" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Navigation" })).toBeTruthy();
    expect(screen.getByTestId("issues-toolbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Save$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Publish$/i })).toBeTruthy();
  });
});
