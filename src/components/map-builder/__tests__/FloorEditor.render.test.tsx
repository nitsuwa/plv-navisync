import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor, exteriorEmergencyStairSafeOffsetRange } from "../FloorEditor";
import { ReadonlyFloorPlanScene } from "../ReadonlyFloorPlanVisuals";
import type { Campus, FloorStairs } from "../types";
import { syncExteriorEmergencyStairGraph } from "../../../lib/exteriorEmergencyStairs";
import { createFloorPerimeterWalls } from "../../../lib/floorShape";

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

  it("keeps perimeter Room selection and name overlays visible above physical content", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [{ id: "edge-room", name: "Perimeter Study Room", type: "classroom", x: 0, y: 0, w: 180, h: 120, floorId: "f1", buildingId: "b1" }];
    floor.walls = [{ id: "room-wall", x1: 0, y1: 120, x2: 180, y2: 120, thickness: 5, color: "#475569", material: "concrete" }];
    floor.furniture = [{ id: "room-desk", type: "desk", name: "Desk", category: "tables", x: 52, y: 24, width: 48, height: 28, rotation: 0, color: "#9a7048" }];

    const { container } = render(
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId="f1"
        initialSelection={{ type: "room", id: "edge-room" }}
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={() => {}}
      />,
    );

    const label = container.querySelector('[data-testid="room-label-overlay"][data-room-id="edge-room"]');
    const outline = container.querySelector('[data-testid="room-selection-overlay"][data-room-id="edge-room"]');
    const physicalFurniture = container.querySelector('[data-layer-key="furniture:room-desk"]');
    const overlayLayer = container.querySelector('[data-testid="room-name-overlay-layer"]');
    expect(label).toBeTruthy();
    expect(label?.classList.contains("pointer-events-none")).toBe(true);
    expect(Number(outline?.getAttribute("x"))).toBeGreaterThan(0);
    expect(Number(outline?.getAttribute("y"))).toBeGreaterThan(0);
    expect(physicalFurniture && overlayLayer && Boolean(physicalFurniture.compareDocumentPosition(overlayLayer) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("renders the complete long Room name with a dynamically tall Editor label", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    const name = "VP FOR STUDENT SERVICES, RESEARCH AND EXTENSION, PLANNING AND DEVELOPMENT";
    floor.rooms = [{ id: "long-room", name, type: "classroom", x: 80, y: 70, w: 150, h: 110, floorId: "f1", buildingId: "b1" }];

    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />,
    );

    const label = container.querySelector('[data-testid="room-label-overlay"][data-room-id="long-room"]')!;
    const lines = Array.from(label.querySelectorAll("tspan"), (line) => line.textContent ?? "");
    expect(lines.join(" ")).toBe(name);
    expect(lines.length).toBeGreaterThan(2);
    expect(Number(label.querySelector("rect")?.getAttribute("width"))).toBeLessThanOrEqual(150 * 0.86 + 0.1);
    expect(floor.rooms[0].name).toBe(name);
  });

  it("keeps a named Room label visible and rewraps it live while resizing", async () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    const name = "VP FOR STUDENT SERVICES, RESEARCH AND EXTENSION, PLANNING AND DEVELOPMENT";
    floor.rooms = [{ id: "resized-long-room", name, type: "classroom", x: 80, y: 70, w: 260, h: 140, floorId: "f1", buildingId: "b1" }];
    campus.navNodes = [{ id: "protected-nav-node", name: "Protected", type: "outdoor", x: 420, y: 310, accessible: true, color: "#2563eb" }];
    campus.navEdges = [];
    const beforeNavNodes = structuredClone(campus.navNodes);
    const beforeNavEdges = structuredClone(campus.navEdges);
    let latestCampus = campus;

    function StatefulFloorEditor() {
      const [currentCampus, setCurrentCampus] = useState(campus);
      return <FloorEditor campus={currentCampus} buildingId="b1" floorId="f1" initialSelection={{ type: "room", id: "resized-long-room" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => { latestCampus = next; setCurrentCampus(next); }} />;
    }

    const { container } = render(<StatefulFloorEditor />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const readLines = () => {
      const label = container.querySelector('[data-testid="room-label-overlay"][data-room-id="resized-long-room"]')!;
      return {
        label,
        lines: Array.from(label.querySelectorAll("tspan"), (line) => line.textContent ?? ""),
      };
    };
    const initial = readLines();
    const eastHandle = Array.from(container.querySelectorAll('[data-testid="room-resize-handle"]'))
      .find((handle) => handle.getAttribute("data-corner") === "e");
    expect(eastHandle).toBeTruthy();

    fireEvent.mouseDown(eastHandle!, { clientX: 340, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 180, clientY: 140, bubbles: true });
    const narrow = readLines();
    expect(narrow.label).toBeTruthy();
    expect(narrow.lines.join(" ")).toBe(name);
    expect(narrow.lines.length).toBeGreaterThan(initial.lines.length);

    fireEvent.mouseMove(svg!, { clientX: 400, clientY: 140, bubbles: true });
    const wide = readLines();
    expect(wide.lines.join(" ")).toBe(name);
    expect(wide.lines.length).toBeLessThan(narrow.lines.length);
    expect(latestCampus.buildings[0].floors[0].rooms[0].name).toBe(name);
    expect(latestCampus.navNodes).toEqual(beforeNavNodes);
    expect(latestCampus.navEdges).toEqual(beforeNavEdges);
    fireEvent.mouseUp(svg!, { bubbles: true });

    const resizedWidth = latestCampus.buildings[0].floors[0].rooms[0].w;
    fireEvent.click(screen.getByRole("button", { name: /^Undo/i }));
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].rooms[0].w).toBe(260));
    expect(latestCampus.buildings[0].floors[0].rooms[0].name).toBe(name);
    expect(readLines().lines.join(" ")).toBe(name);
    fireEvent.click(screen.getByRole("button", { name: /^Redo/i }));
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].rooms[0].w).toBe(resizedWidth));
    expect(latestCampus.buildings[0].floors[0].rooms[0].name).toBe(name);
    expect(readLines().lines.join(" ")).toBe(name);
  });

  it("preserves a custom Room polygon and full name through a live resize", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    const name = "MEDICAL AND DENTAL CLINIC";
    floor.rooms = [{
      id: "resized-custom-room", name, type: "clinic", x: 80, y: 70, w: 260, h: 140,
      shapePoints: [{ x: 80, y: 70 }, { x: 340, y: 70 }, { x: 340, y: 210 }, { x: 80, y: 210 }],
      floorId: "f1", buildingId: "b1",
    }];
    let latestCampus = campus;
    function StatefulFloorEditor() {
      const [currentCampus, setCurrentCampus] = useState(campus);
      return <FloorEditor campus={currentCampus} buildingId="b1" floorId="f1" initialSelection={{ type: "room", id: "resized-custom-room" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => { latestCampus = next; setCurrentCampus(next); }} />;
    }

    const { container } = render(<StatefulFloorEditor />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const eastHandle = Array.from(container.querySelectorAll('[data-testid="room-resize-handle"]'))
      .find((handle) => handle.getAttribute("data-corner") === "e");
    fireEvent.mouseDown(eastHandle!, { clientX: 340, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 190, clientY: 140, bubbles: true });

    const resizedRoom = latestCampus.buildings[0].floors[0].rooms[0];
    expect(resizedRoom.name).toBe(name);
    expect(resizedRoom.shapePoints).toHaveLength(4);
    expect(Math.max(...resizedRoom.shapePoints!.map((point) => point.x)) - Math.min(...resizedRoom.shapePoints!.map((point) => point.x))).toBe(resizedRoom.w);
    const label = container.querySelector('[data-testid="room-label-overlay"][data-room-id="resized-custom-room"]')!;
    expect(Array.from(label.querySelectorAll("tspan"), (line) => line.textContent ?? "").join(" ")).toBe(name);
    fireEvent.mouseUp(svg!, { bubbles: true });
  });

  it("uses the shared full-name layout in the Readonly Floor view", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    const name = "VP FOR ADMINISTRATION AND FINANCE";
    floor.rooms = [{ id: "readonly-long-room", name, type: "office", x: 60, y: 50, w: 130, h: 90, floorId: "f1", buildingId: "b1" }];

    const { container } = render(<svg><ReadonlyFloorPlanScene floor={floor} /></svg>);

    const label = container.querySelector('[data-testid="readonly-room-label-overlay"][data-room-id="readonly-long-room"]')!;
    const lines = Array.from(label.querySelectorAll("tspan"), (line) => line.textContent ?? "");
    expect(lines.join(" ")).toBe(name);
    expect(lines.join(" ")).toContain("FINANCE");
    expect(Number(label.querySelector("rect")?.getAttribute("width"))).toBeLessThanOrEqual(130 * 0.86 + 0.1);
    expect(floor.rooms[0].name).toBe(name);
  });

  it("renders an Entrance-linked Open Passage with the same Entrance direction badge", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    campus.buildings[0].entrances = [{
      id: "entrance-main",
      buildingId: "b1",
      edge: "bottom",
      offset: 0.5,
      type: "general",
      direction: "exit_only",
    }];
    floor.walls = [{ id: "wall-entry", x1: 20, y1: 100, x2: 180, y2: 100, thickness: 6, color: "#475569", material: "concrete" }];
    floor.doors = [{
      id: "canonical-entry-door",
      x: 100,
      y: 100,
      width: 32,
      wallId: "wall-entry",
      offset: 0.5,
      direction: "left",
      color: "#b45309",
      buildingEntranceId: "entrance-main",
      openingType: "open_passage",
    }];

    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />,
    );
    const opening = container.querySelector('[data-testid="attached-open-passage-opening-symbol"]');
    const badge = container.querySelector('[data-testid="entrance-direction-badge"]');

    expect(opening?.querySelector('[data-testid="open-passage-wall-cut"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="attached-door-opening-symbol"]')).toBeNull();
    expect(badge?.getAttribute("data-entrance-direction")).toBe("exit_only");
  });

  it("keeps Furniture below Walls and Openings when local zOrder is extreme", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.furniture = [{ id: "high-order-chair", type: "chair", name: "Chair", category: "Seating", x: 80, y: 80, width: 40, height: 32, rotation: 0, color: "#4b5563", zOrder: 999_999 }];
    floor.walls = [{ id: "layer-wall", x1: 40, y1: 96, x2: 200, y2: 96, thickness: 6, color: "#475569", zOrder: -100 }];
    floor.doors = [{ id: "layer-door", x: 100, y: 96, width: 30, wallId: "layer-wall", offset: 0.375, direction: "left", color: "#795548", zOrder: 900_000 }];
    floor.windows = [{ id: "layer-window", x: 160, y: 96, width: 24, height: 6, wallId: "layer-wall", offset: 0.75, color: "#38bdf8", zOrder: -900_000 }];

    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />,
    );
    const furniture = container.querySelector('[data-layer-key="furniture:high-order-chair"]');
    const wall = container.querySelector('[data-layer-key="wall:layer-wall"]');
    const door = container.querySelector('[data-layer-key="door:layer-door"]');
    const window = container.querySelector('[data-layer-key="window:layer-window"]');
    expect(furniture && wall && Boolean(furniture.compareDocumentPosition(wall) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(wall && door && Boolean(wall.compareDocumentPosition(door) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(door && window && Boolean(door.compareDocumentPosition(window) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("moves selected Furniture within its local layer and disables actions at its front edge", async () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].furniture = [
      { id: "chair", type: "chair", name: "Chair", category: "Seating", x: 40, y: 50, width: 24, height: 20, rotation: 0, color: "#4b5563", zOrder: 0 },
      { id: "desk", type: "desk", name: "Desk", category: "Tables / Work", x: 55, y: 55, width: 32, height: 24, rotation: 0, color: "#7a5c3a", zOrder: 1 },
    ];
    function Harness() {
      const [liveCampus, setLiveCampus] = useState(campus);
      return <FloorEditor campus={liveCampus} buildingId="b1" floorId="f1" initialSelection={{ type: "furniture", id: "chair" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={setLiveCampus} />;
    }
    const { container } = render(<Harness />);
    const physicalOrder = () => Array.from(container.querySelectorAll('[data-semantic-layer="furniture"] [data-layer-key^="furniture:"]'))
      .map((item) => item.getAttribute("data-layer-key"));
    expect(physicalOrder()).toEqual(["furniture:chair", "furniture:desk"]);

    const front = screen.getByRole("button", { name: "Bring to front of layer" });
    expect(front).toBeEnabled();
    fireEvent.click(front);
    await waitFor(() => expect(physicalOrder()).toEqual(["furniture:desk", "furniture:chair"]));
    expect(screen.getByRole("button", { name: "Bring to front of layer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move one step forward in layer" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Move one step back in layer" }));
    await waitFor(() => expect(physicalOrder()).toEqual(["furniture:chair", "furniture:desk"]));
  });

  it("reorders, hides, restores, and locks attached Windows without losing their Wall attachment", async () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.walls = [{ id: "window-wall", x1: 40, y1: 90, x2: 200, y2: 90, thickness: 6, color: "#475569" }];
    floor.furniture = [{ id: "window-overlap-furniture", type: "desk", name: "Desk", category: "Tables / Work", x: 88, y: 74, width: 44, height: 32, rotation: 0, color: "#7a5c3a", zOrder: 999_999 }];
    floor.windows = [
      { id: "window-a", x: 100, y: 90, width: 20, height: 6, wallId: "window-wall", offset: 0.375, color: "#38bdf8", zOrder: 0 },
      { id: "window-b", x: 160, y: 90, width: 20, height: 6, wallId: "window-wall", offset: 0.75, color: "#38bdf8", zOrder: 1 },
    ];
    let latestCampus = campus;
    function Harness() {
      const [liveCampus, setLiveCampus] = useState(campus);
      return <FloorEditor campus={liveCampus} buildingId="b1" floorId="f1" initialSelection={{ type: "window", id: "window-a" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => { latestCampus = next; setLiveCampus(next); }} />;
    }
    const { container } = render(<Harness />);
    const physicalOrder = () => Array.from(container.querySelectorAll('[data-semantic-layer="opening"][data-layer-key^="window:"]'))
      .map((item) => item.getAttribute("data-layer-key"));
    expect(physicalOrder()).toEqual(["window:window-a", "window:window-b"]);

    fireEvent.click(screen.getByRole("button", { name: "Move one step forward in layer" }));
    await waitFor(() => expect(physicalOrder()).toEqual(["window:window-b", "window:window-a"]));
    let changedWindow = latestCampus.buildings[0].floors[0].windows.find((item) => item.id === "window-a")!;
    expect(changedWindow.zOrder).toBeGreaterThan(0);
    expect(changedWindow.wallId).toBe("window-wall");
    const furniture = container.querySelector('[data-layer-key="furniture:window-overlap-furniture"]')!;
    const opening = container.querySelector('[data-layer-key="window:window-a"]')!;
    expect(Boolean(furniture.compareDocumentPosition(opening) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    fireEvent.click(within(container.querySelector('[data-testid="state-layer-controls"]')!).getByRole("button", { name: /^Hide$/i }));
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].windows.find((item) => item.id === "window-a")?.visible).toBe(false));
    expect(container.querySelector('[data-layer-key="window:window-a"]')?.getAttribute("opacity")).toBe("0");
    expect(latestCampus.buildings[0].floors[0].windows).toHaveLength(2);
    expect(latestCampus.buildings[0].floors[0].windows.find((item) => item.id === "window-a")?.wallId).toBe("window-wall");

    fireEvent.click(within(container.querySelector('[data-testid="state-layer-controls"]')!).getByRole("button", { name: /^Show$/i }));
    await waitFor(() => expect(container.querySelector('[data-layer-key="window:window-a"]')?.getAttribute("opacity")).toBe("1"));
    fireEvent.click(within(container.querySelector('[data-testid="state-layer-controls"]')!).getByRole("button", { name: /^Lock$/i }));
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].windows.find((item) => item.id === "window-a")?.locked).toBe(true));
    expect(screen.queryByTestId("opening-resize-handle")).toBeNull();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(latestCampus.buildings[0].floors[0].windows).toHaveLength(2);
    changedWindow = latestCampus.buildings[0].floors[0].windows.find((item) => item.id === "window-a")!;
    expect(changedWindow).toMatchObject({ wallId: "window-wall", locked: true, visible: true });
  });

  it("restores normal resize and rotation controls for a selected custom Room", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [{
      id: "custom-room",
      name: "Slanted Study Room",
      type: "classroom",
      x: 90,
      y: 40,
      w: 220,
      h: 150,
      rotation: 30,
      shapePoints: [
        { x: 90, y: 40 },
        { x: 310, y: 40 },
        { x: 310, y: 190 },
        { x: 90, y: 170 },
      ],
      floorId: "f1",
      buildingId: "b1",
    }];

    const { container } = render(
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId="f1"
        initialSelection={{ type: "room", id: "custom-room" }}
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={() => {}}
      />,
    );

    expect(container.querySelector('[data-testid="room-custom-shape"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="room-rotate-handle"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="room-resize-handle"]')).toHaveLength(8);
    expect(container.querySelector('[data-testid="room-shape-edit-handles"]')).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Medical" }));
    const medicalCategory = screen.getByRole("button", { name: "Medical" }).parentElement;
    expect(medicalCategory).toHaveTextContent("Clinic Bed");
    expect(medicalCategory).toHaveTextContent("First Aid Cabinet");
    expect(screen.getByRole("button", { name: "Medical" }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: "Safety / Facilities" }).textContent).toContain("4");
    expect(screen.getAllByRole("button", { name: "First Aid Cabinet" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Facilities / Amenities" }));

    const tableTennis = screen.getByRole("button", { name: "Table Tennis" });
    expect(tableTennis).toHaveAttribute("aria-label", "Table Tennis");
    expect(tableTennis).not.toHaveAttribute("title");
  });

  it("searches the object library globally and clears back to the normal browser", () => {
    render(<FloorEditor campus={makeCampus()} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    const search = screen.getByRole("textbox", { name: "Search objects" });
    expect(search).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "counter" } });
    expect(screen.getByRole("button", { name: "Service Counter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reception / Service Counter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Food / Service" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear object search" }));
    expect(search).toHaveValue("");
    fireEvent.change(search, { target: { value: "umbrella" } });
    expect(screen.getByRole("button", { name: "Garden Shade Umbrella" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear object search" }));
    fireEvent.change(search, { target: { value: "study" } });
    expect(screen.getByRole("button", { name: "Study Carrel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Long Study Table + Chairs" })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "First Aid" } });
    expect(screen.getAllByRole("button", { name: "First Aid Cabinet" })).toHaveLength(1);
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
    fireEvent.mouseMove(svg!, { clientX: 280, clientY: 486, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 290, clientY: 490, bubbles: true });
    // Drag preview is transient: no campus/floor serialization happens until
    // the final snapped position is committed on release.
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates).toHaveLength(1);
    const moved = updates.at(-1)?.buildings[0].floors[0].furniture?.find((item) => item.id === "chair-1");
    expect(moved?.y).toBeGreaterThan(450);
    expect(moved?.x).toBeGreaterThan(250);
  });

  it("moves grouped furniture as one transient drag and preserves child geometry", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.furniture = [
      { id: "chair-a", groupId: "set-a", type: "chair", name: "Chair A", category: "seating", x: 100, y: 100, width: 24, height: 20, rotation: 30, color: "#c08457" },
      { id: "chair-b", groupId: "set-a", type: "chair", name: "Chair B", category: "seating", x: 140, y: 100, width: 28, height: 22, rotation: 90, color: "#c08457", flipX: true },
    ];
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const furniture = container.querySelector('[data-layer-key="furniture:chair-a"]');
    expect(furniture).toBeTruthy();
    fireEvent.mouseDown(furniture!, { clientX: 112, clientY: 110, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 132, clientY: 125, bubbles: true });
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg!, { bubbles: true });

    expect(updates).toHaveLength(1);
    const moved = updates[0].buildings[0].floors[0].furniture ?? [];
    const chairA = moved.find((item) => item.id === "chair-a");
    const chairB = moved.find((item) => item.id === "chair-b");
    expect(chairA?.x).toBeGreaterThan(100);
    expect(chairA?.y).toBeGreaterThan(100);
    expect(chairB?.x).toBe((chairA?.x ?? 0) + 40);
    expect(chairB?.y).toBe(chairA?.y);
    expect(chairA).toMatchObject({ width: 24, height: 20, rotation: 30 });
    expect(chairB).toMatchObject({ width: 28, height: 22, rotation: 90, flipX: true });
  });

  it("shows temporary Space-pan feedback, restores it on release/blur, and leaves typing alone", () => {
    const { container } = render(<FloorEditor campus={makeCampus()} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    const svg = container.querySelector('[data-testid="floor-canvas-boundary"]')?.closest("svg");
    expect(svg).toBeTruthy();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { code: "Space", key: " " });
    expect(screen.queryByTestId("floor-space-pan-indicator")).toBeNull();
    input.blur();
    input.remove();

    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(screen.getByTestId("floor-space-pan-indicator")).toHaveTextContent("Pan mode");
    expect(container.querySelector('[data-temporary-pan-active="true"]')).toBeTruthy();
    expect((svg as SVGSVGElement).style.cursor).toBe("grab");

    fireEvent.blur(window);
    expect(screen.queryByTestId("floor-space-pan-indicator")).toBeNull();
    expect(container.querySelector('[data-temporary-pan-active="true"]')).toBeNull();
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

  it("lets a coincident selected Room copy preview through overlap and commit once clear", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [
      { id: "room-source", name: "Room A", type: "classroom", x: 80, y: 80, w: 100, h: 70, floorId: "f1", buildingId: "b1" },
      { id: "room-copy", name: "Room A Copy", type: "classroom", x: 80, y: 80, w: 100, h: 70, floorId: "f1", buildingId: "b1" },
    ];
    campus.navNodes = [{ id: "protected-node", name: "Protected", type: "outdoor", x: 500, y: 300, accessible: true, color: "#2563eb" }];
    campus.navEdges = [{ id: "protected-edge", type: "hallway", startNodeId: "protected-node", endNodeId: "protected-node", distance: 0, bidirectional: true }];
    const beforeNavNodes = structuredClone(campus.navNodes);
    const beforeNavEdges = structuredClone(campus.navEdges);
    const updates: Campus[] = [];
    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "room", id: "room-copy" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />,
    );
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.querySelector('[data-testid="floor-canvas-boundary"]'));
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const copy = container.querySelector('[data-layer-key="room:room-copy"]');
    expect(copy).toBeTruthy();
    expect(Boolean(container.querySelector('[data-layer-key="room:room-source"]')?.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    // A release while still invalid keeps the original geometry and leaves
    // the copy selected so another drag can recover it.
    fireEvent.mouseDown(copy!, { clientX: 90, clientY: 90, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 120, clientY: 90, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')).toBeTruthy();
    expect(Number(container.querySelector('[data-testid="room-invalid-preview"] rect')?.getAttribute("x"))).toBe(110);
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates).toHaveLength(0);
    expect(container.querySelector('[data-layer-key="room:room-copy"] rect')?.getAttribute("x")).toBe("80");

    // The next drag begins from the invalid overlap as well. It follows the
    // pointer until the footprints clear, then commits the new location.
    const retryCopy = container.querySelector('[data-layer-key="room:room-copy"]');
    fireEvent.mouseDown(retryCopy!, { clientX: 90, clientY: 90, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 190, clientY: 90, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')).toBeNull();
    fireEvent.mouseUp(svg!, { bubbles: true });

    const movedFloor = updates.at(-1)?.buildings[0].floors[0];
    expect(movedFloor?.rooms.find((room) => room.id === "room-source")?.x).toBe(80);
    expect(movedFloor?.rooms.find((room) => room.id === "room-copy")?.x).toBe(180);
    expect(updates.at(-1)?.navNodes).toEqual(beforeNavNodes);
    expect(updates.at(-1)?.navEdges).toEqual(beforeNavEdges);
  });

  it("keeps authored Room z-order while valid nested Rooms have no overlap warning", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [
      { id: "library", name: "CABA LIBRARY", type: "classroom", x: 60, y: 50, w: 340, h: 280, zOrder: 10, floorId: "f1", buildingId: "b1" },
      { id: "collab", name: "COLLAB ROOM 3A", type: "classroom", x: 170, y: 130, w: 100, h: 80, zOrder: 0, floorId: "f1", buildingId: "b1" },
    ];

    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />,
    );
    const parent = container.querySelector('[data-layer-key="room:library"]')!;
    const child = container.querySelector('[data-layer-key="room:collab"]')!;
    expect(Boolean(child.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(parent.querySelector("rect")?.getAttribute("stroke")).not.toBe("#dc2626");
    expect(child.querySelector("rect")?.getAttribute("stroke")).not.toBe("#dc2626");
    expect(container.querySelector('[data-testid="room-invalid-preview"]')).toBeNull();
  });

  it("shows invalid feedback while a nested Room crosses its parent, then lets it move completely outside", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [
      { id: "library", name: "CABA LIBRARY", type: "classroom", x: 80, y: 80, w: 300, h: 200, zOrder: 10, floorId: "f1", buildingId: "b1" },
      { id: "collab", name: "COLLAB ROOM 3A", type: "classroom", x: 180, y: 120, w: 80, h: 60, zOrder: 0, floorId: "f1", buildingId: "b1" },
    ];
    campus.navNodes = [{ id: "protected-node", name: "Outdoor point", type: "outdoor", x: 500, y: 300, accessible: true, color: "#2563eb" }];
    campus.navEdges = [{ id: "protected-edge", type: "hallway", startNodeId: "protected-node", endNodeId: "protected-node", distance: 0, bidirectional: true }];
    const beforeNavNodes = structuredClone(campus.navNodes);
    const beforeNavEdges = structuredClone(campus.navEdges);
    const updates: Campus[] = [];
    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />,
    );
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.querySelector('[data-testid="floor-canvas-boundary"]'));
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const parent = container.querySelector('[data-layer-key="room:library"]')!;
    // Simulate the browser targeting the frontmost parent fill. The Room hit
    // resolver must redirect both selection and drag to the contained child.
    fireEvent.mouseDown(parent, { clientX: 190, clientY: 130, bubbles: true });
    expect(container.querySelector('[data-testid="room-selection-overlay"][data-room-id="collab"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="room-resize-handle"]')).toBeTruthy();
    fireEvent.mouseMove(svg!, { clientX: 350, clientY: 130, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="placement-warning-badge"]')?.textContent).toMatch(/Overlaps.*Room/);

    fireEvent.mouseMove(svg!, { clientX: 490, clientY: 130, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')).toBeNull();
    fireEvent.mouseUp(svg!, { bubbles: true });
    const movedFloor = updates.at(-1)?.buildings[0].floors[0];
    expect(movedFloor?.rooms.find((room) => room.id === "collab")?.x).toBe(480);
    expect(movedFloor?.rooms.find((room) => room.id === "library")?.x).toBe(80);
    expect(updates.at(-1)?.navNodes).toEqual(beforeNavNodes);
    expect(updates.at(-1)?.navEdges).toEqual(beforeNavEdges);

    // An uncovered part of the same parent remains independently selectable.
    const movedParent = container.querySelector('[data-layer-key="room:library"]')!;
    fireEvent.mouseDown(movedParent, { clientX: 100, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(container.querySelector('[data-testid="room-selection-overlay"][data-room-id="library"]')).toBeTruthy();
  });

  it("resolves nested Room context menus and Shift multi-selection to the child Rooms", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [
      { id: "library", name: "CABA LIBRARY", type: "classroom", x: 60, y: 50, w: 340, h: 280, zOrder: 10, floorId: "f1", buildingId: "b1" },
      { id: "room-a", name: "Room A", type: "classroom", x: 120, y: 120, w: 90, h: 70, zOrder: 0, floorId: "f1", buildingId: "b1" },
      { id: "room-b", name: "Room B", type: "classroom", x: 250, y: 120, w: 90, h: 70, zOrder: 0, floorId: "f1", buildingId: "b1" },
    ];
    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />,
    );
    const parent = container.querySelector('[data-layer-key="room:library"]')!;
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    fireEvent.contextMenu(parent, { clientX: 150, clientY: 145, bubbles: true });
    expect(container.querySelector('[data-testid="room-selection-overlay"][data-room-id="room-a"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bring to Front" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(parent, { clientX: 150, clientY: 145, shiftKey: true, bubbles: true });
    fireEvent.mouseDown(parent, { clientX: 280, clientY: 145, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(container.querySelector('[data-testid="room-selection-overlay"][data-room-id="room-a"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="room-selection-overlay"][data-room-id="room-b"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="room-selection-overlay"][data-room-id="library"]')).toBeNull();
  });

  it("blocks shrinking a parent Room when that would leave its existing child outside", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.rooms = [
      { id: "library", name: "CABA LIBRARY", type: "classroom", x: 80, y: 80, w: 300, h: 200, floorId: "f1", buildingId: "b1" },
      { id: "collab", name: "COLLAB ROOM 3A", type: "classroom", x: 350, y: 120, w: 25, h: 60, floorId: "f1", buildingId: "b1" },
    ];
    const updates: Campus[] = [];
    const { container } = render(
      <FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "room", id: "library" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />,
    );
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.querySelector('[data-testid="floor-canvas-boundary"]'));
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    const eastHandle = Array.from(container.querySelectorAll('[data-testid="room-resize-handle"]'))
      .find((handle) => handle.getAttribute("data-corner") === "e");
    expect(eastHandle).toBeTruthy();
    fireEvent.mouseDown(eastHandle!, { clientX: 380, clientY: 180, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 340, clientY: 180, bubbles: true });
    expect(container.querySelector('[data-testid="room-invalid-preview"]')?.getAttribute("data-preview-kind")).toBe("resize");
    expect(container.querySelector('[data-testid="placement-warning-badge"]')?.getAttribute("aria-label"))
      .toBe("Resize would leave a contained Room outside");
    fireEvent.mouseUp(svg!, { bubbles: true });
    expect(updates).toHaveLength(0);
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

  it("selects a walkable Veranda on a Navigation click while preserving drag marquee ownership", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Veranda 1", walkable: true }];
    render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);

    const svg = Array.from(document.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === "0 0 600 450");
    expect(svg).toBeTruthy();
    mockFloorSvgViewport(svg!);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));

    const zone = screen.getByTestId("exterior-zone");
    fireEvent.mouseDown(zone, { clientX: 300, clientY: 480, bubbles: true });
    fireEvent.mouseUp(svg!, { clientX: 300, clientY: 480, bubbles: true });

    expect(screen.getByTestId("exterior-zone-inspector")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-zone-inspector").textContent).toContain("Veranda 1");

    fireEvent.mouseDown(zone, { clientX: 300, clientY: 480, bubbles: true });
    fireEvent.mouseMove(svg!, { clientX: 360, clientY: 510, bubbles: true });
    expect(screen.getByTestId("floor-marquee-selection")).toBeInTheDocument();
    fireEvent.mouseUp(svg!, { clientX: 360, clientY: 510, bubbles: true });
    expect(screen.queryByTestId("exterior-zone-inspector")).toBeNull();
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

  it("renders Entrance Ramp as a sharp architectural symbol with adaptive segment marks", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.exteriorZones = [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 220, depth: 120, label: "Veranda 1" }];
    floor.entranceRamps = [{ id: "ramp-1", x: 0, y: 0, width: 96, height: 72, rotation: 90, label: "Ramp", parentZoneId: "zone-1", attachmentEdge: "outer", attachmentOffset: 0.5, accessible: true, layout: "straight" }];
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" initialSelection={{ type: "entranceRamp", id: "ramp-1" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);

    const symbol = container.querySelector('[data-testid="entrance-ramp"] [data-testid="ramp-symbol"]');
    expect(symbol).toBeTruthy();
    expect(symbol?.getAttribute("transform")).toContain("rotate(90");
    expect(symbol?.querySelector("rect")?.getAttribute("rx")).toBe("0");
    expect(symbol?.querySelectorAll('[data-testid="ramp-segment-line"]').length).toBeGreaterThanOrEqual(3);
  });

  it("hides visual junction caps by Floor preference or an authored Wall override", () => {
    const renderJunctionFixture = (showWallJunctions: boolean | undefined, junctionBlocks?: "auto" | "show" | "hide") => {
      const campus = makeCampus();
      const floor = campus.buildings[0].floors[0];
      floor.showWallJunctions = showWallJunctions;
      floor.walls = [
        { id: "horizontal", x1: 100, y1: 120, x2: 300, y2: 120, thickness: 5, color: "#475569", material: "concrete", junctionBlocks },
        { id: "vertical", x1: 200, y1: 50, x2: 200, y2: 120, thickness: 5, color: "#475569", material: "concrete" },
      ];
      return render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    };
    const hasSharedJunction = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-testid="wall-joint-cap"]')).some((group) => {
      const rect = group.querySelector("rect");
      const x = Number(rect?.getAttribute("x"));
      const y = Number(rect?.getAttribute("y"));
      const width = Number(rect?.getAttribute("width"));
      const height = Number(rect?.getAttribute("height"));
      return Math.abs(x + width / 2 - 200) < 0.01 && Math.abs(y + height / 2 - 120) < 0.01;
    });

    const visible = renderJunctionFixture(undefined);
    expect(hasSharedJunction(visible.container)).toBe(true);
    visible.unmount();

    const floorHidden = renderJunctionFixture(false);
    expect(floorHidden.container.querySelectorAll('[data-testid="wall-joint-cap"]')).toHaveLength(0);
    floorHidden.unmount();

    const wallForcedHidden = renderJunctionFixture(undefined, "hide");
    expect(hasSharedJunction(wallForcedHidden.container)).toBe(false);
    wallForcedHidden.unmount();

    const wallForcedShown = renderJunctionFixture(false, "show");
    expect(hasSharedJunction(wallForcedShown.container)).toBe(true);
    wallForcedShown.unmount();
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
    expect(screen.getByTestId("floor-settings-trigger")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle snap to grid" })).not.toBeInTheDocument();
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

describe("FloorEditor Furniture duplication and color actions", () => {
  it("keeps the existing Sofa on normal rotation and resize controls", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].furniture = [{
      id: "sofa-transform", type: "sofa", name: "Sofa", category: "Seating",
      x: 20, y: 20, width: 34, height: 16, rotation: 0, color: "#8b6f4e",
    }];
    let latestCampus = campus;
    const selection = { type: "furniture" as const, id: "sofa-transform" };
    function Harness() {
      const [liveCampus, setLiveCampus] = useState(campus);
      return <FloorEditor campus={liveCampus} buildingId="b1" floorId="f1" initialSelection={selection} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => { latestCampus = next; setLiveCampus(next); }} />;
    }
    const { container } = render(<Harness />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "90" } });
    fireEvent.change(screen.getByDisplayValue("34"), { target: { value: "40" } });
    fireEvent.blur(screen.getByDisplayValue("40"));

    expect(latestCampus.buildings[0].floors[0].furniture[0]).toMatchObject({ width: 40, height: 16, rotation: 90 });
    expect(container.querySelector('[data-layer-key="furniture:sofa-transform"] [data-testid="sofa-symbol"]')).toBeTruthy();
    expect(container.querySelector('[data-layer-key="furniture:sofa-transform"] > g')?.getAttribute("transform")).toBe("rotate(90, 40, 28)");
  });

  it("duplicates Furniture by a predictable nearby offset, selects it, preserves its style, and undoes once", async () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.furniture = [{
      id: "source-sofa", type: "sofa", name: "Sofa", category: "Seating",
      x: 100, y: 100, width: 12, height: 12, rotation: 30, color: "#654321",
      flipX: true, flipY: true, zOrder: 5,
    }];
    campus.navNodes = [{ id: "nav-preserved", name: "Floor point", type: "room", x: 24, y: 28, buildingId: "b1", floorId: "f1", accessible: true, color: "#2563eb" }];
    campus.navEdges = [{ id: "edge-preserved", startNodeId: "nav-preserved", endNodeId: "nav-preserved", distance: 0, bidirectional: true, accessible: true, type: "hallway", color: "#2563eb", width: 2 }];
    const originalNavNodes = structuredClone(campus.navNodes);
    const originalNavEdges = structuredClone(campus.navEdges);
    let latestCampus = campus;
    const sourceSelection = { type: "furniture" as const, id: "source-sofa" };
    function Harness() {
      const [liveCampus, setLiveCampus] = useState(campus);
      return <FloorEditor campus={liveCampus} buildingId="b1" floorId="f1" initialSelection={sourceSelection} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => { latestCampus = next; setLiveCampus(next); }} />;
    }
    const { container } = render(<Harness />);
    const floorFurniture = () => latestCampus.buildings[0].floors[0].furniture;
    const duplicate = () => fireEvent.keyDown(window, { key: "d", ctrlKey: true });

    duplicate();
    await waitFor(() => expect(floorFurniture()).toHaveLength(2));
    const firstCopy = floorFurniture().find((item) => item.id !== "source-sofa")!;
    expect(firstCopy).toMatchObject({
      type: "sofa", x: 116, y: 116, width: 12, height: 12, rotation: 30,
      color: "#654321", flipX: true, flipY: true, zOrder: 1,
    });
    expect(firstCopy.id).not.toBe("source-sofa");
    expect(floorFurniture().find((item) => item.id === "source-sofa")?.zOrder).toBe(0);
    expect(latestCampus.navNodes).toEqual(originalNavNodes);
    expect(latestCampus.navEdges).toEqual(originalNavEdges);
    expect(screen.getByDisplayValue("Sofa Copy")).toBeInTheDocument();

    duplicate();
    await waitFor(() => expect(floorFurniture()).toHaveLength(3));
    const secondCopy = floorFurniture().find((item) => item.id !== "source-sofa" && item.id !== firstCopy.id)!;
    expect(secondCopy).toMatchObject({ x: 132, y: 132, width: 12, height: 12, color: "#654321", flipX: true, flipY: true, zOrder: 2 });
    expect(secondCopy.id).not.toBe(firstCopy.id);
    expect(screen.getByDisplayValue("Sofa Copy Copy")).toBeInTheDocument();
    expect(latestCampus.navNodes).toEqual(originalNavNodes);
    expect(latestCampus.navEdges).toEqual(originalNavEdges);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(floorFurniture()).toHaveLength(2));
    expect(floorFurniture().some((item) => item.id === secondCopy.id)).toBe(false);
    expect(container.querySelector('[data-layer-key^="furniture:"]')).toBeTruthy();
  });

  it("applies color to recolorable members of the selected group as one undoable action", async () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.furniture = [
      { id: "group-sofa", type: "sofa", name: "Sofa", category: "Seating", x: 20, y: 20, width: 34, height: 16, rotation: 0, color: "#654321", groupId: "lounge-group" },
      { id: "group-table", type: "square-coffee-table", name: "Table", category: "Tables / Work", x: 80, y: 20, width: 18, height: 18, rotation: 0, color: "#aabbcc", groupId: "lounge-group" },
      { id: "group-chair", type: "arm-chair", name: "Arm Chair", category: "Seating", x: 120, y: 20, width: 16, height: 16, rotation: 0, color: "#ccaa88", groupId: "lounge-group" },
      { id: "fixed-exit", type: "exit-sign", name: "Exit Sign", category: "Safety / Facilities", x: 160, y: 20, width: 18, height: 10, rotation: 0, color: "#16a34a", groupId: "lounge-group" },
    ];
    let latestCampus = campus;
    function Harness() {
      const [liveCampus, setLiveCampus] = useState(campus);
      return <FloorEditor campus={liveCampus} buildingId="b1" floorId="f1" initialSelection={{ type: "furniture", id: "group-sofa" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => { latestCampus = next; setLiveCampus(next); }} />;
    }
    render(<Harness />);
    expect(screen.getByText("Same-type color changes affect this floor only.")).toBeInTheDocument();
    const applyGroup = screen.getByRole("button", { name: "Apply to Group (3)" });
    expect(applyGroup).toBeEnabled();

    fireEvent.click(applyGroup);
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].furniture.find((item) => item.id === "group-table")?.color).toBe("#654321"));
    const afterApply = latestCampus.buildings[0].floors[0].furniture;
    expect(afterApply.find((item) => item.id === "group-chair")?.color).toBe("#654321");
    expect(afterApply.find((item) => item.id === "fixed-exit")?.color).toBe("#16a34a");
    expect(afterApply.filter((item) => item.groupId === "lounge-group").map((item) => item.id)).toEqual(["group-sofa", "group-table", "group-chair", "fixed-exit"]);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].furniture.find((item) => item.id === "group-table")?.color).toBe("#aabbcc"));
    expect(latestCampus.buildings[0].floors[0].furniture.find((item) => item.id === "group-chair")?.color).toBe("#ccaa88");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].furniture.find((item) => item.id === "group-table")?.color).toBe("#654321"));
  });

  it("limits same-type color changes to editable matches on the current Floor", async () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.furniture = [
      { id: "selected-sofa", type: "sofa", name: "Sofa", category: "Seating", x: 20, y: 20, width: 34, height: 16, rotation: 0, color: "#654321" },
      { id: "matching-sofa", type: "sofa", name: "Sofa", category: "Seating", x: 70, y: 20, width: 34, height: 16, rotation: 0, color: "#aabbcc" },
      { id: "other-style", type: "arm-chair", name: "Arm Chair", category: "Seating", x: 120, y: 20, width: 16, height: 16, rotation: 0, color: "#ccaa88" },
    ];
    const secondFloor = structuredClone(floor);
    secondFloor.id = "f2";
    secondFloor.number = 2;
    secondFloor.label = "Second Floor";
    secondFloor.furniture = [{ id: "other-floor-sofa", type: "sofa", name: "Sofa", category: "Seating", x: 20, y: 20, width: 34, height: 16, rotation: 0, color: "#bbbbbb" }];
    campus.buildings[0].floors.push(secondFloor);
    const otherBuilding = structuredClone(campus.buildings[0]);
    otherBuilding.id = "b2";
    otherBuilding.name = "Other Building";
    otherBuilding.floors = [{ ...structuredClone(floor), id: "b2-f1", buildingId: "b2", furniture: [{ id: "other-building-sofa", type: "sofa", name: "Sofa", category: "Seating", x: 20, y: 20, width: 34, height: 16, rotation: 0, color: "#cccccc" }] }];
    campus.buildings.push(otherBuilding);
    let latestCampus = campus;
    function Harness() {
      const [liveCampus, setLiveCampus] = useState(campus);
      return <FloorEditor campus={liveCampus} buildingId="b1" floorId="f1" initialSelection={{ type: "furniture", id: "selected-sofa" }} onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => { latestCampus = next; setLiveCampus(next); }} />;
    }
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Apply to Same Type (2)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Apply to Group (0)" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Apply to Same Type (2)" }));
    await waitFor(() => expect(latestCampus.buildings[0].floors[0].furniture.find((item) => item.id === "matching-sofa")?.color).toBe("#654321"));
    expect(latestCampus.buildings[0].floors[0].furniture.find((item) => item.id === "other-style")?.color).toBe("#ccaa88");
    expect(latestCampus.buildings[0].floors[1].furniture[0].color).toBe("#bbbbbb");
    expect(latestCampus.buildings[1].floors[0].furniture[0].color).toBe("#cccccc");
  });

  it("keeps Floor Shape editing active while Space-drag pans the camera", async () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.extensions = [{ id: "east-lobby", side: "right", offset: 80, width: 180, depth: 200 }];
    floor.walls = createFloorPerimeterWalls(floor.id, 600, 450, floor.extensions, {
      perimeterThickness: 6,
      perimeterMaterial: "concrete",
      perimeterColor: "#64748b",
    });
    const onUpdate = vi.fn();
    const { container } = render(<FloorEditor campus={campus} buildingId="b1" floorId="f1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={onUpdate} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.querySelector('[data-testid="floor-canvas-boundary"]'))!;
    mockFloorSvgViewport(svg, 600, 450);
    expect(svg.querySelector('[data-testid="floor-managed-perimeter-core"]')?.getAttribute("d"))
      .toBe(svg.querySelector('[data-testid="floor-canvas-boundary"]')?.getAttribute("d"));
    const canvas = container.querySelector('[data-tutorial="floor-canvas"]') as HTMLElement;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle properties panel" }));
    fireEvent.click(screen.getByTestId("edit-floor-shape"));
    expect(screen.getByTestId("floor-shape-panel")).toBeInTheDocument();
    fireEvent.pointerDown(svg.querySelector('[data-floor-shape-action="body"]')!, { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    // Zoom enough that there is room to pan within the viewport's safe area.
    const content = svg.querySelector("g[transform^='translate('")!;
    const beforeZoom = content.getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    await new Promise((resolve) => window.setTimeout(resolve, 240));
    expect(content.getAttribute("transform")).not.toBe(beforeZoom);
    const beforePan = content.getAttribute("transform");
    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.mouseDown(screen.getByTestId("floor-shape-panel"), { button: 0, clientX: 320, clientY: 300 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 390, clientY: 350 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    fireEvent.keyUp(window, { code: "Space", key: " " });

    expect(content.getAttribute("transform")).not.toBe(beforePan);
    const afterSpacePan = content.getAttribute("transform");
    fireEvent.mouseDown(svg, { button: 1, clientX: 400, clientY: 340 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 450, clientY: 380 });
    fireEvent.pointerUp(window, { pointerId: 3 });
    expect(content.getAttribute("transform")).not.toBe(afterSpacePan);
    expect(screen.getByTestId("floor-shape-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(floor.extensions).toEqual([{ id: "east-lobby", side: "right", offset: 80, width: 180, depth: 200 }]);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
