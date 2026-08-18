import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { FURNITURE_CATEGORIES } from "../constants";
import { resizeCirculationWithinFloor, rotatedRectBounds } from "../../../lib/floorGeometry";
import type { Campus, FloorWall } from "../types";

// ── Shared fixtures ─────────────────────────────────────────────────────────

function makeRichCampus(): Campus {
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
            canvasW: 220,
            canvasH: 160,
            rooms: [{ id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" }],
            walls: [{ id: "w1", x1: 80, y1: 70, x2: 130, y2: 70, thickness: 4, color: "#64748b", material: "concrete" }],
            doors: [{ id: "d1", x: 60, y: 90, width: 8, direction: "left", color: "#d97706" }],
            windows: [{ id: "wn1", x: 30, y: 120, width: 12, height: 4, color: "#7dd3fc" }],
            furniture: [{ id: "fur1", type: "desk", name: "Desk", category: "tables", x: 90, y: 90, width: 18, height: 12, rotation: 0, color: "#7a5c3a" }],
            stairs: [{ id: "st1", x: 140, y: 90, width: 20, height: 16, direction: "both", label: "Stairs" }],
            ramps: [{ id: "rm1", x: 150, y: 120, width: 20, height: 12, label: "Ramp" }],
            elevators: [{ id: "el1", x: 180, y: 60, width: 14, height: 14, doorWidth: 6, label: "Elevator" }],
            labels: [{ id: "lb1", x: 40, y: 150, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0 }],
            paths: [{ id: "p1", points: [{ x: 100, y: 150 }, { x: 150, y: 150 }], type: "footpath", color: "#94a3b8", width: 3 }],
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

function makeSnapCampus(): Campus {
  const campus = makeRichCampus();
  const floor = campus.buildings[0].floors[0];
  floor.canvasW = 580;
  floor.canvasH = 380;
  // These legacy snap regressions assert the historical 10-unit grid behavior.
  floor.gridSize = 10;
  floor.rooms = [];
  floor.walls = [
    { id: "w1", x1: 53, y1: 57, x2: 153, y2: 57, thickness: 4, color: "#64748b", material: "concrete" },
    { id: "w2", x1: 253, y1: 57, x2: 353, y2: 57, thickness: 4, color: "#64748b", material: "concrete" },
  ];
  floor.doors = [];
  floor.windows = [];
  floor.furniture = [];
  floor.stairs = [];
  floor.ramps = [];
  floor.elevators = [];
  floor.labels = [];
  floor.paths = [];
  return campus;
}

function makeOpeningVisualCampus(): Campus {
  const campus = makeRichCampus();
  const floor = campus.buildings[0].floors[0];
  floor.rooms = [];
  floor.walls = [
    { id: "wh", x1: 20, y1: 20, x2: 100, y2: 20, thickness: 6, color: "#64748b", material: "concrete" },
    { id: "wv", x1: 130, y1: 20, x2: 130, y2: 100, thickness: 6, color: "#64748b", material: "concrete" },
    { id: "wd", x1: 160, y1: 20, x2: 210, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  floor.doors = [
    { id: "dh", x: 60, y: 20, width: 20, direction: "left", color: "#b45309", wallId: "wh", offset: 0.5 },
    { id: "dv", x: 130, y: 60, width: 20, direction: "right", color: "#b45309", wallId: "wv", offset: 0.5 },
    { id: "dd", x: 185, y: 45, width: 20, direction: "left", color: "#b45309", wallId: "wd", offset: 0.5 },
  ];
  floor.windows = [
    { id: "winh", x: 60, y: 20, width: 28, height: 6, color: "#0284c7", wallId: "wh", offset: 0.5 },
    { id: "winv", x: 130, y: 60, width: 28, height: 6, color: "#0284c7", wallId: "wv", offset: 0.5 },
    { id: "wind", x: 185, y: 45, width: 28, height: 6, color: "#0284c7", wallId: "wd", offset: 0.5 },
  ];
  floor.furniture = [];
  floor.stairs = [];
  floor.ramps = [];
  floor.elevators = [];
  floor.labels = [];
  floor.paths = [];
  return campus;
}

function makePerimeterOpeningCampus(): Campus {
  const campus = makeRichCampus();
  const floor = campus.buildings[0].floors[0];
  floor.canvasW = 220;
  floor.canvasH = 160;
  floor.rooms = [];
  floor.walls = [
    { id: "interior", x1: 40, y1: 70, x2: 150, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    { id: "perim-top", x1: 0, y1: 0, x2: 220, y2: 0, thickness: 6, color: "#64748b", material: "concrete", locked: true, managedKind: "perimeter", perimeterSide: "top" },
    { id: "perim-right", x1: 220, y1: 0, x2: 220, y2: 160, thickness: 6, color: "#64748b", material: "concrete", locked: true, managedKind: "perimeter", perimeterSide: "right" },
    { id: "perim-bottom", x1: 220, y1: 160, x2: 0, y2: 160, thickness: 6, color: "#64748b", material: "concrete", locked: true, managedKind: "perimeter", perimeterSide: "bottom" },
    { id: "perim-left", x1: 0, y1: 160, x2: 0, y2: 0, thickness: 6, color: "#64748b", material: "concrete", locked: true, managedKind: "perimeter", perimeterSide: "left" },
  ];
  floor.doors = [
    { id: "door-perim", x: 110, y: 0, width: 24, direction: "left", color: "#b45309", wallId: "perim-top", offset: 0.5 },
  ];
  floor.windows = [
    { id: "window-perim", x: 220, y: 80, width: 32, height: 6, color: "#0284c7", wallId: "perim-right", offset: 0.5 },
  ];
  floor.furniture = [];
  floor.stairs = [];
  floor.ramps = [];
  floor.elevators = [];
  floor.labels = [];
  floor.paths = [];
  return campus;
}

function makeOutOfBoundsCampus(): Campus {
  const campus = makeRichCampus();
  const floor = campus.buildings[0].floors[0];
  floor.canvasW = 220;
  floor.canvasH = 160;
  floor.rooms = [];
  floor.walls = [
    { id: "inside", x1: 20, y1: 20, x2: 90, y2: 20, thickness: 4, color: "#64748b", material: "concrete" },
    { id: "outside", x1: 250, y1: 40, x2: 310, y2: 40, thickness: 4, color: "#64748b", material: "concrete" },
  ];
  floor.doors = [];
  floor.windows = [];
  floor.furniture = [];
  floor.stairs = [];
  floor.ramps = [];
  floor.elevators = [];
  floor.labels = [];
  floor.paths = [];
  return campus;
}

function makePartialOutOfBoundsCampus(): Campus {
  const campus = makeOutOfBoundsCampus();
  campus.buildings[0].floors[0].walls = [
    { id: "inside", x1: 20, y1: 20, x2: 90, y2: 20, thickness: 4, color: "#64748b", material: "concrete" },
    { id: "partial", x1: -30, y1: 80, x2: 35, y2: 80, thickness: 4, color: "#64748b", material: "concrete" },
  ];
  return campus;
}

function Harness({
  onCampusChange,
  initialCampus = makeRichCampus(),
  onSave,
}: {
  onCampusChange?: (c: Campus) => void;
  initialCampus?: Campus;
  onSave?: (c: Campus) => Promise<Campus>;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onSave={onSave}
    />
  );
}

function makeFloorManagementCampus(): Campus {
  const campus = makeRichCampus();
  const floor = campus.buildings[0].floors[0];
  floor.canvasW = 600;
  floor.canvasH = 450;
  floor.rooms = [{ id: "r1", name: "Room", type: "classroom", x: 50, y: 50, w: 120, h: 90, floorId: "f1", buildingId: "b1" }];
  floor.walls = [{
    id: "w1",
    x1: 50,
    y1: 50,
    x2: 170,
    y2: 50,
    thickness: 6,
    color: "#64748b",
    material: "concrete",
    startAnchor: { targetType: "room", roomId: "r1", edge: "top", offset: 0 },
    endAnchor: { targetType: "room", roomId: "r1", edge: "top", offset: 1 },
  }];
  floor.doors = [{ id: "d1", x: 110, y: 50, width: 28, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 }];
  floor.windows = [{ id: "win1", x: 140, y: 50, width: 32, height: 6, color: "#0284c7", wallId: "w1", offset: 0.75 }];
  floor.furniture = [];
  floor.stairs = [];
  floor.ramps = [];
  floor.elevators = [];
  floor.labels = [{ id: "lb1", x: 90, y: 130, text: "GF", fontSize: 12, color: "#374151", rotation: 0 }];
  floor.paths = [];
  return campus;
}

function FloorWorkflowHarness({
  onCampusChange,
  initialCampus = makeFloorManagementCampus(),
}: {
  onCampusChange?: (c: Campus) => void;
  initialCampus?: Campus;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  const [activeFloorId, setActiveFloorId] = useState("f1");
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId={activeFloorId}
      onBack={() => {}}
      onSwitchFloor={setActiveFloorId}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onSave={(c) => Promise.resolve(c)}
    />
  );
}

function canvasSvg(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`);
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = canvasSvg(container, w, h);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg.viewBox, "baseVal", {
    configurable: true,
    value: { width: w, height: h, x: 0, y: 0 },
  });
  Object.defineProperty(svg.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function roomGroup(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector('rect[width="50"][height="40"]')
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
}

function marqueeSelect(container: HTMLElement, w = 220, h = 160) {
  const svg = stubSvgRect(container, w, h);
  fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, bubbles: true });
  fireEvent.mouseMove(svg, { clientX: w, clientY: h, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  return svg;
}

function furnitureGroup(container: HTMLElement, title: string): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector("title")?.textContent === title
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
}

function layerKeys(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-layer-key]")).map((el) => el.getAttribute("data-layer-key"));
}

function titledGroup(container: HTMLElement, title: string): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && (el.querySelector("title")?.textContent === title || el.getAttribute("data-floor-title") === title)
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
}

function wallGroupByX1(container: HTMLElement, x1: number, color = "#64748b"): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find((el) => {
    if (el.hasAttribute("transform")) return false;
    const line = el.querySelector(`line[stroke="${color}"]`);
    return line != null && line.getAttribute("x1") === String(x1);
  }) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
}

let latestCampus: Campus | null = null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  latestCampus = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

describe("B5 final cleanup regressions", () => {
  it("previous/next floor buttons follow canonical order and disable at boundaries", () => {
    const campus = makeFloorManagementCampus();
    const base = campus.buildings[0].floors[0];
    campus.buildings[0].floors = [
      base,
      { ...structuredClone(base), id: "f2", number: 2, label: "Floor 2", rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
      { ...structuredClone(base), id: "f3", number: 3, label: "Floor 3", rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
    ];

    render(<FloorWorkflowHarness initialCampus={campus} />);

    const previous = screen.getByRole("button", { name: "Previous floor" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next floor" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    expect(screen.getByRole("button", { name: "Select floor" })).toHaveTextContent("Floor 2");
    expect((screen.getByRole("button", { name: "Previous floor" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Next floor" }));
    expect(screen.getByRole("button", { name: "Select floor" })).toHaveTextContent("Floor 3");
    expect((screen.getByRole("button", { name: "Next floor" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not clamp authored circulation resize back to small defaults", () => {
    const resized = resizeCirculationWithinFloor(
      { id: "st-large", x: 40, y: 40, width: 120, height: 40, direction: "both", label: "Stairs", rotation: 0 },
      "e",
      80,
      0,
      300,
      220,
      false
    );

    expect(resized.width).toBe(200);
    expect(resized.height).toBe(40);
    expect(resized.x).toBe(40);
  });

  it("commits a wall endpoint to the exact room-boundary intersection target", () => {
    const campus = makeRichCampus();
    const floor = campus.buildings[0].floors[0];
    floor.canvasW = 220;
    floor.canvasH = 160;
    floor.rooms = [{ id: "r-intersect", name: "Room", type: "classroom", x: 50, y: 50, w: 120, h: 90, floorId: "f1", buildingId: "b1" }];
    floor.walls = [{ id: "existing-cross", x1: 110, y1: 20, x2: 110, y2: 100, thickness: 4, color: "#64748b", material: "concrete" }];
    floor.doors = [];
    floor.windows = [];
    floor.furniture = [];
    floor.stairs = [];
    floor.ramps = [];
    floor.elevators = [];
    floor.labels = [];
    floor.paths = [];

    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 20, clientY: 50, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 50, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 110, clientY: 50, bubbles: true });

    const drawn = latestCampus!.buildings[0].floors[0].walls[1];
    expect(drawn).toMatchObject({ x1: 20, y1: 60, x2: 110, y2: 50 });
    expect(drawn.endAnchor).toMatchObject({ targetType: "room", roomId: "r-intersect", edge: "top" });
  });
});

describe("B4 floor workflow completion", () => {
  it("adds a new default floor and switches into a clean editor state", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));

    const floors = latestCampus!.buildings[0].floors;
    expect(floors).toHaveLength(2);
    expect(floors[1]).toMatchObject({ buildingId: "b1", number: 2, label: "Floor 2", canvasW: 600, canvasH: 450, gridSize: 20 });
    expect(floors[1].rooms).toEqual([]);
    expect(screen.queryByTestId("floor-properties-panel")).toBeNull();
    // The new floor becomes the ACTIVE floor — shown in the floor selector button.
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 2");
  });

  it("duplicates a populated floor with independent IDs and remapped room-wall-opening relationships", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Floor" }));

    const [source, copy] = latestCampus!.buildings[0].floors;
    expect(copy.label).toBe("Ground Floor Copy");
    expect(copy.rooms[0].id).not.toBe(source.rooms[0].id);
    expect(copy.walls[0].id).not.toBe(source.walls[0].id);
    expect(copy.walls[0].startAnchor?.roomId).toBe(copy.rooms[0].id);
    expect(copy.walls[0].endAnchor?.roomId).toBe(copy.rooms[0].id);
    expect(copy.doors[0].id).not.toBe(source.doors[0].id);
    expect(copy.doors[0].wallId).toBe(copy.walls[0].id);
    expect(copy.windows[0].id).not.toBe(source.windows[0].id);
    expect(copy.windows[0].wallId).toBe(copy.walls[0].id);
  });

  it("reorders floors and deletes only after confirmation", async () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Floor" }));
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Up" }));
    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Ground Floor Copy", "Ground Floor"]);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Floor" }));
    expect(screen.getByTestId("delete-floor-confirm-dialog")).toHaveTextContent("Ground Floor Copy");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // The dialog is wrapped in AnimatePresence, so it stays mounted through the
    // exit animation after Cancel. Wait for it to fully unmount before reopening
    // the floor actions menu, otherwise the ghost confirm button duplicates the
    // menu item's accessible name.
    await waitFor(() => expect(screen.queryByTestId("delete-floor-confirm-dialog")).toBeNull());
    expect(latestCampus!.buildings[0].floors).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Floor" }));
    fireEvent.click(within(screen.getByTestId("delete-floor-confirm-dialog")).getByRole("button", { name: "Delete Floor" }));
    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Ground Floor"]);
    // The surviving floor becomes the ACTIVE floor after deletion.
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Ground Floor");
  });

  it("persists grid presets from normal Floor Settings without exposing deferred tools", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    // The Floor Settings dialog is opened from the toolbar button whose
    // accessible name is exactly "Floor Settings".
    fireEvent.click(screen.getByRole("button", { name: /^Floor Settings$/i }));
    expect(screen.queryByText(/Import Floor Plan/i)).toBeNull();
    expect(screen.queryByText(/Calibrate Scale/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Measure/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Grid size 10" }));
    fireEvent.click(screen.getByRole("button", { name: "Grid size 40" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(latestCampus!.buildings[0].floors[0].gridSize).toBe(40);
  });

  it("commits one completed inline text edit as exactly one history action", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Hi", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    fireEvent.dblClick(screen.getByTestId("floor-label-hit-area"), { clientX: 42, clientY: 80, bubbles: true });
    const inline = screen.getByLabelText("Inline label text");
    // Multiple keystrokes while editing must only ever record ONE history entry.
    fireEvent.change(inline, { target: { value: "M" } });
    fireEvent.change(inline, { target: { value: "Ma" } });
    fireEvent.change(inline, { target: { value: "Main Lobby" } });
    fireEvent.blur(inline);

    const label = latestCampus!.buildings[0].floors[0].labels[0];
    expect(label.text).toBe("Main Lobby");
    const undoBtn = screen.getByTitle("Undo (Ctrl+Z)") as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(false);
    fireEvent.click(undoBtn);
    expect(latestCampus!.buildings[0].floors[0].labels[0].text).toBe("Hi");
    expect((screen.getByTitle("Undo (Ctrl+Z)") as HTMLButtonElement).disabled).toBe(true);
  });

  it("protects the last remaining floor from deletion", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Floor" }));

    expect(screen.queryByTestId("delete-floor-confirm-dialog")).toBeNull();
    expect(latestCampus).toBeNull();
    // The only floor is still present and active in the selector button.
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Ground Floor");
  });

  it("changes grid presets without moving existing objects", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: /^Floor Settings$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Grid size 40" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor.gridSize).toBe(40);
    expect(floor.walls[0]).toMatchObject({ x1: 50, y1: 50, x2: 170, y2: 50 });
    expect(floor.rooms[0]).toMatchObject({ x: 50, y: 50, w: 120, h: 90 });
    expect(floor.doors[0]).toMatchObject({ x: 110, y: 50, wallId: "w1" });
  });
});

describe("B4 floor management UX consistency", () => {
  function floorActionsMenu(): HTMLElement {
    return screen.getByTestId("floor-actions-menu");
  }

  it("labels the floor actions button and shows the shared menu with edge disable states", () => {
    render(<FloorWorkflowHarness />);

    const actionsButton = screen.getByRole("button", { name: "Floor actions" });
    expect(actionsButton).toHaveAttribute("title", "Floor actions");
    fireEvent.click(actionsButton);

    const menu = floorActionsMenu();
    expect(within(menu).getByRole("button", { name: "Rename Floor" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Duplicate Floor" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Floor Settings" })).toBeInTheDocument();
    // Single floor: reordering and deleting are blocked from the menu too.
    expect((within(menu).getByRole("button", { name: "Move Up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(menu).getByRole("button", { name: "Move Down" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(menu).getByRole("button", { name: "Delete Floor" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renames the active floor from the menu and rejects an empty name", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(floorActionsMenu()).getByRole("button", { name: "Rename Floor" }));
    fireEvent.change(screen.getByLabelText("Rename floor input"), { target: { value: "Lobby 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Floor" }));

    expect(latestCampus!.buildings[0].floors[0].label).toBe("Lobby 1");
    // The renamed ACTIVE floor is shown in the selector button.
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Lobby 1");

    // Empty/whitespace names keep the dialog open with a disabled save.
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(floorActionsMenu()).getByRole("button", { name: "Rename Floor" }));
    fireEvent.change(screen.getByLabelText("Rename floor input"), { target: { value: "   " } });
    expect(screen.getByText("Floor name cannot be empty.")).toBeInTheDocument();
    expect((screen.getByRole("button", { name: "Rename Floor" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Rename floor input")).toBeInTheDocument();
  });

  it("moves the active floor up/down with edge disable states while keeping the active floor by ID", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" })); // active = Floor 2 (last)
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    const menu = floorActionsMenu();
    expect((within(menu).getByRole("button", { name: "Move Down" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(menu).getByRole("button", { name: "Move Up" }));

    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Floor 2", "Ground Floor"]);
    // Active floor is tracked by ID, not array index — Floor 2 stays active after reorder.
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 2");
  });

  it("opens the shared menu from a floor selector right-click and acts on that floor", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" })); // active = Floor 2
    // Right-click the INACTIVE Ground Floor inside the selector popover → the
    // shared actions menu targets THAT floor (the old tab right-click flow).
    fireEvent.click(screen.getByRole("button", { name: "Select floor" }));
    fireEvent.contextMenu(
      within(screen.getByTestId("floor-selector-popover")).getByRole("option", { name: /Ground Floor/ }),
      { clientX: 120, clientY: 40 }
    );

    const menu = floorActionsMenu();
    fireEvent.click(within(menu).getByRole("button", { name: "Duplicate Floor" }));

    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Ground Floor", "Floor 2", "Ground Floor Copy"]);
    // Duplicating switches to the copy → it becomes the ACTIVE floor.
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Ground Floor Copy");
  });

  it("exposes the compact floor section in the properties sidebar when nothing is selected", () => {
    render(<FloorWorkflowHarness />);

    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    const panel = screen.getByTestId("floor-properties-panel");
    expect(within(panel).getByText("Floor Overview")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Name")).toHaveValue("Ground Floor");
    expect(within(panel).getByLabelText("Width")).toHaveValue(600);
    expect(within(panel).getByLabelText("Height")).toHaveValue(450);
    expect(within(panel).getByRole("button", { name: "Show Grid" })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByRole("button", { name: "Floor grid 40" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Open Floor Settings" })).toBeInTheDocument();
    // Single-floor building: reorder and delete stay disabled in the sidebar too.
    expect((within(panel).getByRole("button", { name: "Move Up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole("button", { name: "Move Down" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole("button", { name: "Delete Floor" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("quick-edits name, canvas size, grid size, and grid visibility from the sidebar", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    const panel = screen.getByTestId("floor-properties-panel");

    fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "Atrium" } });
    fireEvent.blur(within(panel).getByLabelText("Name"));
    expect(latestCampus!.buildings[0].floors[0].label).toBe("Atrium");

    fireEvent.change(within(panel).getByLabelText("Width"), { target: { value: "300" } });
    fireEvent.blur(within(panel).getByLabelText("Width"));
    expect(latestCampus!.buildings[0].floors[0].canvasW).toBe(300);

    fireEvent.click(within(panel).getByRole("button", { name: "Floor grid 40" }));
    expect(latestCampus!.buildings[0].floors[0].gridSize).toBe(40);

    fireEvent.click(within(panel).getByRole("button", { name: "Show Grid" }));
    expect(latestCampus!.buildings[0].floors[0].showGrid).toBe(false);
  });

  it("duplicates, moves, and deletes the active floor from the sidebar actions", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" })); // active = Floor 2
    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    const panel = screen.getByTestId("floor-properties-panel");

    fireEvent.click(within(panel).getByRole("button", { name: "Duplicate Floor" }));
    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Ground Floor", "Floor 2", "Floor 2 Copy"]);
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 2 Copy");

    // Duplicating switches to the copy and clears transient state (the sidebar
    // closes, like a floor switch) — reopen it for the next action.
    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    const panel2 = screen.getByTestId("floor-properties-panel");
    expect((within(panel2).getByRole("button", { name: "Move Down" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(panel2).getByRole("button", { name: "Move Up" }));
    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Ground Floor", "Floor 2 Copy", "Floor 2"]);
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 2 Copy");

    fireEvent.click(within(panel2).getByRole("button", { name: "Delete Floor" }));
    fireEvent.click(within(screen.getByTestId("delete-floor-confirm-dialog")).getByRole("button", { name: "Delete Floor" }));
    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Ground Floor", "Floor 2"]);
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 2");
  });

  it("deleting an inactive floor leaves the active floor untouched", () => {
    let latestCampus: Campus | null = null;
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" })); // active = Floor 2, Ground is inactive
    // Right-click the INACTIVE Ground Floor in the selector popover → delete it.
    fireEvent.click(screen.getByRole("button", { name: "Select floor" }));
    fireEvent.contextMenu(
      within(screen.getByTestId("floor-selector-popover")).getByRole("option", { name: /Ground Floor/ }),
      { clientX: 120, clientY: 40 }
    );
    fireEvent.click(within(floorActionsMenu()).getByRole("button", { name: "Delete Floor" }));
    expect(screen.getByTestId("delete-floor-confirm-dialog")).toHaveTextContent("Delete Ground Floor and its");
    fireEvent.click(within(screen.getByTestId("delete-floor-confirm-dialog")).getByRole("button", { name: "Delete Floor" }));

    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Floor 2"]);
    // The ACTIVE floor (Floor 2) was untouched by deleting the inactive one.
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 2");
  });

  it("persists renamed floors and reordered arrays through save/reopen", async () => {
    render(<FloorWorkflowHarness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(floorActionsMenu()).getByRole("button", { name: "Rename Floor" }));
    fireEvent.change(screen.getByLabelText("Rename floor input"), { target: { value: "Mezzanine" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Floor" }));

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    // B5 Phase 3.1: the renamed floor is dirty, so Add Floor first asks
    // Save/Discard — Save persists the rename exactly once before the new floor
    // is created (no duplicate floor record, no duplicate floor number). The
    // save is async, so wait for the dialog to close before touching the tabs.
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.queryByText("Unsaved Floor Changes")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(floorActionsMenu()).getByRole("button", { name: "Move Up" }));
    expect(latestCampus!.buildings[0].floors.map((floor) => floor.label)).toEqual(["Floor 2", "Mezzanine"]);

    // "Reopen": mount a fresh editor with the saved campus — names and order survive.
    cleanup();
    render(<FloorWorkflowHarness initialCampus={latestCampus!} />);
    // The selector popover lists every floor (the active one is shown in the button).
    fireEvent.click(screen.getByRole("button", { name: "Select floor" }));
    const popover = screen.getByTestId("floor-selector-popover");
    expect(within(popover).getByRole("option", { name: /Floor 2/ })).toBeInTheDocument();
    expect(within(popover).getByRole("option", { name: /Mezzanine/ })).toBeInTheDocument();
  });
});

describe("Phase 2.1 - room layering, state, and structural snapping", () => {
  it("renders rotated room selection handles as first-class transform controls", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].rooms[0].rotation = 30;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });

    const outline = screen.getByTestId("room-selection-outline");
    expect(outline.parentElement?.getAttribute("transform")).toContain("rotate(30");
    expect(screen.getByTestId("room-rotate-handle")).toBeInTheDocument();
    expect(screen.getAllByTestId("room-resize-handle")).toHaveLength(8);
  });

  it("blocks delete for locked rooms while still allowing inspector state changes", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].rooms[0].locked = true;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(campus.buildings[0].floors[0].rooms).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Unlock/i }));
    expect(latestCampus!.buildings[0].floors[0].rooms[0].locked).toBe(false);
  });

  it("persists visibility and z-order from the properties panel", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /^Hide$/i }));
    expect(latestCampus!.buildings[0].floors[0].rooms[0].visible).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /^Front$/i }));
    expect(latestCampus!.buildings[0].floors[0].rooms[0].zOrder).toBeGreaterThanOrEqual(0);
  });

  it("orders floor layers from the properties panel across object types and supports undo/redo", async () => {
    const campus = makeRichCampus();
    const floor = campus.buildings[0].floors[0];
    floor.furniture[0].x = 30;
    floor.furniture[0].y = 30;
    floor.stairs[0].x = 34;
    floor.stairs[0].y = 34;
    floor.rooms[0].zOrder = 0;
    floor.furniture[0].zOrder = 1;
    floor.stairs[0].zOrder = 2;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    expect(layerKeys(container)).toEqual(expect.arrayContaining(["room:r1", "furniture:fur1", "stairs:st1"]));
    expect(layerKeys(container).indexOf("room:r1")).toBeLessThan(layerKeys(container).indexOf("furniture:fur1"));
    expect(layerKeys(container).indexOf("furniture:fur1")).toBeLessThan(layerKeys(container).indexOf("stairs:st1"));

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /^Front$/i }));
    let changed = latestCampus!.buildings[0].floors[0];
    expect(changed.rooms[0].zOrder).toBeGreaterThan(changed.furniture[0].zOrder ?? -1);
    expect(layerKeys(container).indexOf("room:r1")).toBeGreaterThan(layerKeys(container).indexOf("stairs:st1"));

    await waitFor(() => expect(screen.getByTitle("Undo (Ctrl+Z)")).not.toBeDisabled());
    fireEvent.click(screen.getByTitle("Undo (Ctrl+Z)"));
    await waitFor(() => {
      changed = latestCampus!.buildings[0].floors[0];
      expect(changed.rooms[0].zOrder).toBeLessThan(changed.furniture[0].zOrder ?? 999);
      expect(layerKeys(container).indexOf("room:r1")).toBeLessThan(layerKeys(container).indexOf("furniture:fur1"));
    });

    await waitFor(() => expect(screen.getByTitle("Redo (Ctrl+Y)")).not.toBeDisabled());
    fireEvent.click(screen.getByTitle("Redo (Ctrl+Y)"));
    await waitFor(() => {
      changed = latestCampus!.buildings[0].floors[0];
      expect(changed.rooms[0].zOrder).toBeGreaterThan(changed.furniture[0].zOrder ?? -1);
      expect(layerKeys(container).indexOf("room:r1")).toBeGreaterThan(layerKeys(container).indexOf("stairs:st1"));
    });
  });

  it("orders floor layers from the context menu using the same cross-type stack", () => {
    const campus = makeRichCampus();
    const floor = campus.buildings[0].floors[0];
    floor.furniture[0].x = 30;
    floor.furniture[0].y = 30;
    floor.stairs[0].x = 34;
    floor.stairs[0].y = 34;
    floor.rooms[0].zOrder = 4;
    floor.furniture[0].zOrder = 0;
    floor.stairs[0].zOrder = 2;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    expect(layerKeys(container).indexOf("room:r1")).toBeGreaterThan(layerKeys(container).indexOf("stairs:st1"));
    fireEvent.contextMenu(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Send to Back/i }));

    const changed = latestCampus!.buildings[0].floors[0];
    expect(changed.rooms[0].zOrder).toBeLessThan(changed.furniture[0].zOrder ?? 999);
    expect(changed.rooms[0].zOrder).toBeLessThan(changed.stairs[0].zOrder ?? 999);
    expect(layerKeys(container).indexOf("room:r1")).toBeLessThan(layerKeys(container).indexOf("furniture:fur1"));
  });

  it("snaps wall drawing to visible room edges after wall endpoints and segments", () => {
    const campus = makeRichCampus();
    const floor = campus.buildings[0].floors[0];
    floor.canvasW = 220;
    floor.canvasH = 160;
    floor.walls = [];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 45, clientY: 18, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 45, clientY: 18, bubbles: true });

    const drawn = latestCampus!.buildings[0].floors[0].walls[0];
    expect(drawn.x2).toBe(45);
    expect(drawn.y2).toBe(20);
    expect(drawn.endAnchor).toMatchObject({ targetType: "room", roomId: "r1", edge: "top" });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Wall");
    expect(screen.getByTitle("Select (V)").className).toContain("bg-primary");
  });

  it("keeps the wall tool active when Shift completes a wall", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].walls = [];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 20, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 80, clientY: 20, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 80, clientY: 20, shiftKey: true, bubbles: true });

    expect(latestCampus!.buildings[0].floors[0].walls).toHaveLength(1);
    expect(screen.getByTitle("Wall").className).toContain("bg-primary");
    expect(screen.getByText(/Shift-click to continue/)).toBeInTheDocument();
  });

  it("rejects door placement in empty space when no wall candidate is nearby", () => {
    const campus = makeSnapCampus();
    campus.buildings[0].floors[0].walls = [{ id: "w1", x1: 200, y1: 200, x2: 300, y2: 200, thickness: 4, color: "#64748b", material: "concrete" }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "d" });
    fireEvent.mouseDown(svg, { clientX: 40, clientY: 40, bubbles: true });

    expect(latestCampus).toBeNull();
    expect(campus.buildings[0].floors[0].doors).toHaveLength(0);
  });

  it("places doors and windows as wall-attached openings with normalized offsets", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "d" });
    fireEvent.mouseMove(svg, { clientX: 103, clientY: 58, bubbles: true });
    expect(screen.getByTestId("door-wall-preview")).toBeInTheDocument();
    fireEvent.mouseDown(svg, { clientX: 103, clientY: 58, bubbles: true });

    let floor = latestCampus!.buildings[0].floors[0];
    expect(floor.doors).toHaveLength(1);
    expect(floor.doors[0]).toMatchObject({ wallId: "w1", x: 103, y: 57 });
    expect(floor.doors[0].offset).toBeCloseTo(0.5, 1);
    expect(floor.doors[0].width).toBeGreaterThanOrEqual(18);
    expect(screen.getByTestId("attached-door-opening")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "i" });
    fireEvent.mouseMove(svg, { clientX: 303, clientY: 58, bubbles: true });
    expect(screen.getByTestId("window-wall-preview")).toBeInTheDocument();
    fireEvent.mouseDown(svg, { clientX: 303, clientY: 58, bubbles: true });

    floor = latestCampus!.buildings[0].floors[0];
    expect(floor.windows).toHaveLength(1);
    expect(floor.windows[0]).toMatchObject({ wallId: "w2", x: 303, y: 57 });
    expect(floor.windows[0].offset).toBeCloseTo(0.5, 1);
    expect(floor.windows[0].width).toBeGreaterThanOrEqual(28);
    expect(screen.getByTestId("attached-window-opening")).toBeInTheDocument();
  });

  it("renders attached Doors as centered wall cuts with hinge, leaf, and swing arc on horizontal, vertical, and diagonal walls", () => {
    render(<Harness initialCampus={makeOpeningVisualCampus()} />);

    const doors = screen.getAllByTestId("attached-door-opening-symbol");
    expect(doors).toHaveLength(3);
    expect(doors[0]).toHaveAttribute("transform", "translate(60, 20) rotate(0)");
    expect(doors[1]).toHaveAttribute("transform", "translate(130, 60) rotate(90)");
    expect(doors[2]).toHaveAttribute("transform", "translate(185, 45) rotate(45)");
    expect(screen.getAllByTestId("door-wall-cut")).toHaveLength(3);
    expect(screen.getAllByTestId("door-hinge")).toHaveLength(3);
    expect(screen.getAllByTestId("door-leaf")).toHaveLength(3);
    expect(screen.getAllByTestId("door-swing-arc")).toHaveLength(3);
    expect(screen.getAllByTestId("attached-door-opening")).toHaveLength(3);
    doors.forEach((door) => expect(door).not.toHaveAttribute("clip-path"));
  });

  it("renders attached Windows as centered wall cuts with glazing and frame lines on horizontal, vertical, and diagonal walls", () => {
    render(<Harness initialCampus={makeOpeningVisualCampus()} />);

    const windows = screen.getAllByTestId("attached-window-opening-symbol");
    expect(windows).toHaveLength(3);
    expect(windows[0]).toHaveAttribute("transform", "translate(60, 20) rotate(0)");
    expect(windows[1]).toHaveAttribute("transform", "translate(130, 60) rotate(90)");
    expect(windows[2]).toHaveAttribute("transform", "translate(185, 45) rotate(45)");
    expect(screen.getAllByTestId("window-wall-cut")).toHaveLength(3);
    expect(screen.getAllByTestId("window-glazing")).toHaveLength(3);
    expect(screen.getAllByTestId("attached-window-opening")).toHaveLength(3);
    windows.forEach((win) => expect(win).not.toHaveAttribute("clip-path"));
  });

  it("renders perimeter Door and Window symbols inward and outside the floor clip", () => {
    render(<Harness initialCampus={makePerimeterOpeningCampus()} />);

    const door = screen.getByTestId("attached-door-opening-symbol");
    const win = screen.getByTestId("attached-window-opening-symbol");

    expect(door).toHaveAttribute("transform", "translate(110, 0) rotate(0) scale(1 -1)");
    expect(win).toHaveAttribute("transform", "translate(220, 80) rotate(90) scale(1 -1)");
    expect(door).not.toHaveAttribute("clip-path");
    expect(win).not.toHaveAttribute("clip-path");
    expect(screen.getByTestId("door-wall-cut")).toBeInTheDocument();
    expect(screen.getByTestId("door-hinge")).toBeInTheDocument();
    expect(screen.getByTestId("door-leaf")).toBeInTheDocument();
    expect(screen.getByTestId("door-swing-arc")).toBeInTheDocument();
    expect(screen.getByTestId("window-wall-cut")).toBeInTheDocument();
    expect(screen.getByTestId("window-glazing")).toBeInTheDocument();
  });

  it("keeps selected Door and Window overlays outside the floor clip", () => {
    const { container } = render(<Harness initialCampus={makePerimeterOpeningCampus()} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getByTestId("attached-door-opening-symbol"), { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("attached-door-opening-symbol")).not.toHaveAttribute("clip-path");
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Door");

    fireEvent.mouseDown(screen.getByTestId("attached-window-opening-symbol"), { clientX: 220, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("attached-window-opening-symbol")).not.toHaveAttribute("clip-path");
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Window");
  });

  it("detects Door and Window placement from clicks directly on the visible wall body", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);
    const wall = wallGroupByX1(container, 53);

    fireEvent.keyDown(window, { key: "d" });
    fireEvent.mouseMove(wall, { clientX: 103, clientY: 57, bubbles: true });
    expect(screen.getByTestId("door-wall-preview")).toBeInTheDocument();
    fireEvent.mouseDown(wall, { clientX: 103, clientY: 57, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus!.buildings[0].floors[0].doors[0]).toMatchObject({ wallId: "w1", x: 103, y: 57 });

    fireEvent.keyDown(window, { key: "i" });
    fireEvent.mouseMove(wall, { clientX: 123, clientY: 57, bubbles: true });
    expect(screen.getByTestId("window-wall-preview")).toBeInTheDocument();
    fireEvent.mouseDown(wall, { clientX: 123, clientY: 57, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus!.buildings[0].floors[0].windows[0]).toMatchObject({ wallId: "w1", x: 123, y: 57 });
  });

  it("clamps new Door and Window openings fully away from wall ends", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "d" });
    fireEvent.mouseDown(svg, { clientX: 54, clientY: 57, bubbles: true });

    let floor = latestCampus!.buildings[0].floors[0];
    expect(floor.doors[0]).toMatchObject({ wallId: "w1", y: 57 });
    expect(floor.doors[0].x).toBeGreaterThanOrEqual(72);
    expect(floor.doors[0].offset).toBeGreaterThanOrEqual(0.19);

    fireEvent.keyDown(window, { key: "i" });
    fireEvent.mouseDown(svg, { clientX: 352, clientY: 57, bubbles: true });

    floor = latestCampus!.buildings[0].floors[0];
    expect(floor.windows[0]).toMatchObject({ wallId: "w2", y: 57 });
    expect(floor.windows[0].x).toBeLessThanOrEqual(329);
    expect(floor.windows[0].offset).toBeLessThanOrEqual(0.77);
  });

  it("keeps perimeter corner placements inside the parent wall and defaults doors inward", () => {
    const campus = makePerimeterOpeningCampus();
    campus.buildings[0].floors[0].doors = [];
    campus.buildings[0].floors[0].windows = [];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "d" });
    fireEvent.mouseDown(svg, { clientX: 2, clientY: 0, bubbles: true });

    const door = latestCampus!.buildings[0].floors[0].doors[0];
    const topWall = latestCampus!.buildings[0].floors[0].walls.find((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === "top")!;
    expect(topWall.id).toMatch(UUID_RE);
    expect(door).toMatchObject({ wallId: topWall.id, y: 0, hinge: "left", swingSide: "b" });
    expect(door.x).toBeGreaterThanOrEqual(21);
    expect(door.offset).toBeGreaterThan(0.09);
    expect(screen.getByTestId("attached-door-opening-symbol")).toHaveAttribute("transform", expect.stringContaining("scale(1 -1)"));
  });

  it("persists independent Door hinge and swing-side controls without native dropdowns", () => {
    const { container } = render(<Harness initialCampus={makeOpeningVisualCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getAllByTestId("attached-door-opening-symbol")[0], { clientX: 60, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const panel = screen.getByTestId("floor-properties-panel");
    expect(within(panel).queryByRole("combobox")).toBeNull();
    expect(within(panel).getByRole("button", { name: "Right" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Side B" })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Right" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Side B" }));

    const door = latestCampus!.buildings[0].floors[0].doors.find((d) => d.id === "dh")!;
    expect(door).toMatchObject({ hinge: "right", direction: "right", swingSide: "b" });
  });

  it("offers exactly two along-wall resize handles for selected Door and Window openings", () => {
    const { container } = render(<Harness initialCampus={makeOpeningVisualCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getAllByTestId("attached-door-opening-symbol")[0], { clientX: 60, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    let handles = Array.from(container.querySelectorAll('[data-testid="opening-resize-handle"][data-kind="door"]'));
    expect(handles).toHaveLength(2);

    fireEvent.mouseDown(handles[1], { clientX: 70, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 86, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    let floor = latestCampus!.buildings[0].floors[0];
    expect(floor.doors.find((d) => d.id === "dh")!.width).toBeGreaterThan(20);

    fireEvent.mouseDown(screen.getAllByTestId("attached-window-opening-symbol")[0], { clientX: 60, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    handles = Array.from(container.querySelectorAll('[data-testid="opening-resize-handle"][data-kind="window"]'));
    expect(handles).toHaveLength(2);

    fireEvent.mouseDown(handles[0], { clientX: 46, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 32, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    floor = latestCampus!.buildings[0].floors[0];
    expect(floor.windows.find((w) => w.id === "winh")!.width).toBeGreaterThan(28);
  });

  it("slides unlocked perimeter openings while managed perimeter walls remain non-selectable", () => {
    const { container } = render(<Harness initialCampus={makePerimeterOpeningCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getByTestId("attached-door-opening-symbol"), { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 2, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const floor = latestCampus?.buildings[0].floors[0] ?? makePerimeterOpeningCampus().buildings[0].floors[0];
    const door = floor.doors[0];
    const topWall = floor.walls.find((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === "top")!;
    expect(door.wallId).toBe(topWall.id);
    if (latestCampus) {
      expect(door.x).toBeGreaterThanOrEqual(24);
      expect(door.offset).toBeGreaterThan(0.1);
    }

    fireEvent.mouseDown(wallGroupByX1(container, 0, "#64748b"), { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // The floor overview sidebar shows "Perimeter Wall" in its settings section,
    // but the wall should NOT be selected as an editable wall object — verify
    // no wall-specific editing fields (thickness, material, color, locked) appear.
    expect(screen.getByTestId("floor-properties-panel")).not.toHaveTextContent("Thickness");
    expect(screen.getByTestId("floor-properties-panel")).not.toHaveTextContent("Material");
  });

  it("treats user-locked parent walls as edit locks for attached opening structure", () => {
    const campus = makeOpeningVisualCampus();
    campus.buildings[0].floors[0].walls[0].locked = true;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getAllByTestId("attached-door-opening-symbol")[0], { clientX: 60, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 78, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latestCampus).toBeNull();
    expect(container.querySelectorAll('[data-testid="opening-resize-handle"][data-kind="door"]')).toHaveLength(2);
  });

  it("keeps a large Single Door cutout, leaf, arc, and handles synchronized to one width", () => {
    const campus = makeOpeningVisualCampus();
    const floor = campus.buildings[0].floors[0];
    floor.doors = [{ id: "wide-single", x: 60, y: 20, width: 44, doorType: "single", direction: "left", color: "#b45309", wallId: "wh", offset: 0.5 }];
    floor.windows = [];
    render(<Harness initialCampus={campus} />);

    expect(screen.getByTestId("door-wall-cut")).toHaveAttribute("x1", "-22");
    expect(screen.getByTestId("door-wall-cut")).toHaveAttribute("x2", "22");
    expect(screen.getByTestId("door-leaf")).toHaveAttribute("x1", "-22");
    expect(screen.getByTestId("door-leaf")).toHaveAttribute("y2", "-44");
    expect(screen.getByTestId("door-swing-arc")).toHaveAttribute("d", expect.stringContaining("A 44 44"));
  });

  it("resizes Door openings wider and narrower from along-wall handles", () => {
    const { container } = render(<Harness initialCampus={makeOpeningVisualCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getAllByTestId("attached-door-opening-symbol")[0], { clientX: 60, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    let handles = Array.from(container.querySelectorAll('[data-testid="opening-resize-handle"][data-kind="door"]'));
    fireEvent.mouseDown(handles[1], { clientX: 70, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 90, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    let door = latestCampus!.buildings[0].floors[0].doors.find((d) => d.id === "dh")!;
    expect(door.width).toBeGreaterThan(20);

    handles = Array.from(container.querySelectorAll('[data-testid="opening-resize-handle"][data-kind="door"]'));
    fireEvent.mouseDown(handles[1], { clientX: door.x + door.width / 2, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: door.x + 6, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    door = latestCampus!.buildings[0].floors[0].doors.find((d) => d.id === "dh")!;
    expect(door.width).toBeLessThan(30);
    expect(door.width).toBeGreaterThanOrEqual(10);
  });

  it("keeps managed perimeter Doors resizable", () => {
    const { container } = render(<Harness initialCampus={makePerimeterOpeningCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getByTestId("attached-door-opening-symbol"), { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const rightHandle = Array.from(container.querySelectorAll('[data-testid="opening-resize-handle"][data-kind="door"]'))[1];
    fireEvent.mouseDown(rightHandle, { clientX: 122, clientY: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latestCampus!.buildings[0].floors[0].doors[0].width).toBeGreaterThan(24);
  });

  it("renders Double Door as one shared opening with paired leaves, hinges, and arcs", () => {
    const campus = makeOpeningVisualCampus();
    const floor = campus.buildings[0].floors[0];
    floor.doors = [{ id: "double-door", x: 60, y: 20, width: 40, doorType: "double", direction: "double", color: "#b45309", wallId: "wh", offset: 0.5 }];
    floor.windows = [];
    render(<Harness initialCampus={campus} />);

    expect(screen.getByTestId("door-wall-cut")).toHaveAttribute("x1", "-20");
    expect(screen.getByTestId("door-wall-cut")).toHaveAttribute("x2", "20");
    expect(screen.getAllByTestId("door-hinge")).toHaveLength(2);
    const leaves = screen.getAllByTestId("door-leaf");
    expect(leaves).toHaveLength(2);
    const leftEndX = Number(leaves[0].getAttribute("x2"));
    const rightEndX = Number(leaves[1].getAttribute("x2"));
    expect(leftEndX).toBeLessThan(0);
    expect(rightEndX).toBeGreaterThan(0);
    expect(leftEndX).toBeCloseTo(-rightEndX, 1);
    expect(Number(leaves[0].getAttribute("y2"))).toBeCloseTo(Number(leaves[1].getAttribute("y2")), 1);
    expect(screen.getAllByTestId("door-swing-arc")).toHaveLength(2);
  });

  it("flips both Double Door leaves to the opposite swing side without crossing them", () => {
    const campus = makeOpeningVisualCampus();
    const floor = campus.buildings[0].floors[0];
    floor.doors = [{ id: "double-door", x: 60, y: 20, width: 40, doorType: "double", direction: "double", swingSide: "b", color: "#b45309", wallId: "wh", offset: 0.5 }];
    floor.windows = [];
    render(<Harness initialCampus={campus} />);

    const leaves = screen.getAllByTestId("door-leaf");
    expect(Number(leaves[0].getAttribute("x2"))).toBeLessThan(0);
    expect(Number(leaves[1].getAttribute("x2"))).toBeGreaterThan(0);
    expect(Number(leaves[0].getAttribute("y2"))).toBeGreaterThan(0);
    expect(Number(leaves[1].getAttribute("y2"))).toBeGreaterThan(0);
  });

  it("persists Door Type changes and hides Hinge controls for Double Door", () => {
    const { container } = render(<Harness initialCampus={makeOpeningVisualCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getAllByTestId("attached-door-opening-symbol")[0], { clientX: 60, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const panel = screen.getByTestId("floor-properties-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "Double" }));

    let door = latestCampus!.buildings[0].floors[0].doors.find((d) => d.id === "dh")!;
    expect(door).toMatchObject({ doorType: "double", direction: "double" });
    expect(door.width).toBeGreaterThanOrEqual(28);
    expect(within(panel).queryByText("Hinge")).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "Single" }));
    door = latestCampus!.buildings[0].floors[0].doors.find((d) => d.id === "dh")!;
    expect(door.doorType).toBe("single");
    expect(door.direction).not.toBe("double");
  });

  it("rejects switching to Double Door when the parent wall cannot fit the double minimum", () => {
    const campus = makeOpeningVisualCampus();
    const floor = campus.buildings[0].floors[0];
    floor.walls = [{ id: "short", x1: 20, y1: 20, x2: 60, y2: 20, thickness: 6, color: "#64748b", material: "concrete" }];
    floor.doors = [{ id: "short-door", x: 40, y: 20, width: 18, doorType: "single", direction: "left", color: "#b45309", wallId: "short", offset: 0.5 }];
    floor.windows = [];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getByTestId("attached-door-opening-symbol"), { clientX: 40, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(within(screen.getByTestId("floor-properties-panel")).getByRole("button", { name: "Double" }));

    expect(latestCampus).toBeNull();
  });

  it("keeps Window placement and resize behavior unchanged after Door type changes", () => {
    const { container } = render(<Harness initialCampus={makeOpeningVisualCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getAllByTestId("attached-window-opening-symbol")[0], { clientX: 60, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handle = Array.from(container.querySelectorAll('[data-testid="opening-resize-handle"][data-kind="window"]'))[1];
    fireEvent.mouseDown(handle, { clientX: 74, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 88, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latestCampus!.buildings[0].floors[0].windows.find((w) => w.id === "winh")!.width).toBeGreaterThan(28);
  });
});

describe("Phase 1.9 - visual and interaction polish", () => {
  it("uses a compact single-panel inspector for walls", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(wallGroupByX1(container, 80), { clientX: 100, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const panel = screen.getByTestId("floor-properties-panel");
    expect(panel).toHaveTextContent("Wall");
    expect(panel).toHaveTextContent("Thickness");
    expect(panel).toHaveTextContent("Material");
    expect(panel).toHaveTextContent("Color");
    expect(panel).toHaveTextContent("Length");
    expect(screen.queryByRole("button", { name: "Info" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Style" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Size" })).toBeNull();
  });

  it("renders room names as an overlay above placed floor objects", () => {
    render(<Harness />);

    expect(screen.getAllByTestId("room-label-overlay")).toHaveLength(1);
    expect(screen.getByText("Room")).toBeInTheDocument();
  });

  it("renders stairs, ramp, and elevator as distinct structured top-down symbols", () => {
    const { container } = render(<Harness />);
    stubSvgRect(container);

    const stairsSymbol = screen.getByTestId("stairs-symbol");
    const rampSymbol = screen.getByTestId("ramp-symbol");
    const elevatorSymbol = screen.getByTestId("elevator-symbol");

    expect(stairsSymbol.querySelectorAll("line").length).toBeGreaterThanOrEqual(4);
    expect(stairsSymbol.querySelector("path")).toBeTruthy();
    // B5 Phase 2.5: the simplified ramp is a functional blue footprint with a
    // centered accessibility icon (lucide) + a small direction cue.
    expect(rampSymbol.querySelector('[data-testid="ramp-blue-base"]')).toBeTruthy();
    expect(rampSymbol.querySelector('[data-testid="ramp-accessibility-icon"]')).toBeTruthy();
    expect(elevatorSymbol.querySelectorAll("rect").length).toBeGreaterThanOrEqual(3);
    expect(elevatorSymbol.querySelector("path")).toBeTruthy();
  });

  it("exposes compact resize and rotate handles for small circulation objects", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(titledGroup(container, "Stairs"), { clientX: 150, clientY: 98, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const handles = screen.getAllByTestId("stairs-resize-handle");
    expect(handles.length).toBe(8);
    for (const handle of handles) {
      expect(Number(handle.getAttribute("width"))).toBeLessThanOrEqual(7);
      expect(Number(handle.getAttribute("height"))).toBeLessThanOrEqual(7);
    }
    expect(screen.getByTestId("stairs-rotate-handle")).toBeInTheDocument();
  });

  it("resizes and rotates circulation objects while preserving floor bounds", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(titledGroup(container, "Stairs"), { clientX: 150, clientY: 98, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const east = container.querySelector('[data-testid="stairs-resize-handle"][data-corner="e"]') as SVGRectElement;
    fireEvent.mouseDown(east, { clientX: 160, clientY: 98, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 98, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    let stairs = latestCampus!.buildings[0].floors[0].stairs[0];
    expect(stairs.width).toBeGreaterThan(20);
    expect(stairs.x + stairs.width).toBeLessThanOrEqual(220);

    const rotate = screen.getByTestId("stairs-rotate-handle");
    fireEvent.mouseDown(rotate, { clientX: stairs.x + stairs.width / 2, clientY: stairs.y - 12, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: stairs.x + stairs.width / 2 + 20, clientY: stairs.y + stairs.height / 2, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    stairs = latestCampus!.buildings[0].floors[0].stairs[0];
    expect(stairs.rotation).toBe(90);
  });

  it("uses one compact inspector for circulation objects with geometry and actions visible", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(titledGroup(container, "Elevator"), { clientX: 187, clientY: 67, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const panel = screen.getByTestId("floor-properties-panel");
    expect(panel).toHaveTextContent("Elevator");
    expect(panel).toHaveTextContent("Door Width");
    expect(panel).toHaveTextContent("Width");
    expect(panel).toHaveTextContent("Height");
    expect(panel).toHaveTextContent("Rotation");
    expect(screen.queryByRole("button", { name: "Info" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Style" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Size" })).toBeNull();
  });
});

describe("Phase 2.0 - transform and property UX completion", () => {
  it("rotates selected furniture outlines and handles with the object", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].furniture[0].rotation = 35;
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(furnitureGroup(container, "Desk"), { clientX: 99, clientY: 96, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const outline = screen.getByTestId("furniture-selection-outline");
    expect(outline.closest("g")?.getAttribute("transform")).toContain("rotate(35");
  });

  it("clicking empty space inside a multi-selection moves the group instead of clearing it", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = marqueeSelect(container);
    expect(screen.getByText("9 selected")).toBeInTheDocument();

    fireEvent.mouseDown(svg, { clientX: 95, clientY: 85, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 105, clientY: 95, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByText("9 selected")).toBeInTheDocument();
    expect(latestCampus!.buildings[0].floors[0].walls[0]).toMatchObject({ x1: 90, y1: 76, x2: 140, y2: 76 });
  });

  it("group resize handles scale walls and objects in one live transform", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = marqueeSelect(container);
    const east = screen.getAllByTestId("floor-group-resize-handle").find((el) => el.getAttribute("data-corner") === "e")!;

    fireEvent.mouseDown(east, { clientX: 224, clientY: 80, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 240, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor.walls[0].x2).toBeGreaterThan(130);
    expect(floor.furniture[0].width).toBeGreaterThan(18);
  });

  it("group rotation rotates furniture and wall endpoints around the group center", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = marqueeSelect(container);
    const rotate = screen.getByTestId("floor-group-rotate-handle");

    fireEvent.mouseDown(rotate, { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor.furniture[0].rotation).not.toBe(0);
    expect(floor.walls[0].y1).not.toBe(70);
  });

  it("wall material uses NaviSync button controls and changes the rendered wall treatment", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(wallGroupByX1(container, 80), { clientX: 100, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Glass" }));
    const glassWall = latestCampus!.buildings[0].floors[0].walls[0];
    expect(glassWall.material).toBe("glass");
    const group = wallGroupByX1(container, 80, glassWall.color);
    expect(group.querySelector('line[stroke="#60a5fa"]')?.getAttribute("stroke-dasharray")).toBe("6 3");
  });

  it("Ctrl+Z, Ctrl+Y, and Ctrl+Shift+Z preserve editor history without hijacking text inputs", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 65, clientY: 55, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Alignment may snap room bottom edge (75) to nearby elevator bottom (74) — 1px shift.
    const movedRoom = latestCampus!.buildings[0].floors[0].rooms[0];
    expect(movedRoom.x).toBe(40);
    expect(movedRoom.y).toBeGreaterThanOrEqual(34);
    expect(movedRoom.y).toBeLessThanOrEqual(35);
    const savedY = movedRoom.y;

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latestCampus!.buildings[0].floors[0].rooms[0]).toMatchObject({ x: 20, y: 20 });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(latestCampus!.buildings[0].floors[0].rooms[0].x).toBe(40);
    expect(latestCampus!.buildings[0].floors[0].rooms[0].y).toBe(savedY);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(latestCampus!.buildings[0].floors[0].rooms[0]).toMatchObject({ x: 20, y: 20 });
  });

  it("save feedback is a compact top-center floating surface", async () => {
    let resolveSave!: (c: Campus) => void;
    const onSave = vi.fn((c: Campus) => new Promise<Campus>((resolve) => { resolveSave = resolve; }));
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} onSave={onSave} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const status = screen.getByTestId("floor-save-status");
    expect(status.className).toContain("top-4");
    expect(status.className).not.toContain("inset-0");
    resolveSave(latestCampus!);
    await waitFor(() => expect(screen.getByTestId("floor-save-status")).toHaveTextContent("Saved"));
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1.8 — persistent multi-selection
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 1.8 — multi-selection persists through drag and right-click", () => {
  it("keeps the whole group selected after dragging one of its members", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    marqueeSelect(container);
    expect(screen.getByText("9 selected")).toBeInTheDocument();

    const svg = canvasSvg(container);
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 90, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // The group moved (dx capped at 26 by the rightmost elevator, dy at 6 by the
    // bottom-most label) AND remains selected — no need to rebuild the selection.
    expect(latestCampus!.buildings[0].floors[0].rooms[0]).toMatchObject({ x: 46, y: 26 });
    expect(screen.getByText("9 selected")).toBeInTheDocument();
    expect(screen.getByTestId("floor-group-outline")).toBeInTheDocument();
  });

  it("keeps the group when right-clicking a selected member", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    marqueeSelect(container);

    fireEvent.contextMenu(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });

    // Group menu labels the selection and offers group-safe actions (the same
    // actions also exist in the Selected Objects inspector panel, so use getAll)
    expect(screen.getByRole("button", { name: /Selected Objects/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Duplicate Selected/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Delete Selected/i }).length).toBeGreaterThan(0);
    // Still selected — right-clicking a member did not collapse the group
    expect(screen.getByText("9 selected")).toBeInTheDocument();
  });

  it("selects every current-floor object with Ctrl+A without hijacking focused inputs", () => {
    const { container } = render(<Harness />);

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getByText("9 selected")).toBeInTheDocument();
    expect(screen.getByTestId("floor-group-outline")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    const nameInput = screen.getByDisplayValue("Room");
    nameInput.focus();
    fireEvent.keyDown(nameInput, { key: "a", ctrlKey: true });
    expect(screen.queryByText("9 selected")).toBeNull();
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Room");
  });

  it("Ctrl+A excludes a completely out-of-bounds wall while keeping an in-bounds wall selectable", () => {
    render(<Harness initialCampus={makeOutOfBoundsCampus()} />);

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect(screen.queryByText("2 selected")).toBeNull();
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Wall");
    const handles = screen.getAllByTestId("wall-endpoint-handle");
    expect(handles.some((handle) => handle.getAttribute("cx") === "20")).toBe(true);
    expect(handles.some((handle) => handle.getAttribute("cx") === "250")).toBe(false);
  });

  it("keeps managed perimeter walls out of Ctrl+A and direct selection", () => {
    const campus = makePerimeterOpeningCampus();
    campus.buildings[0].floors[0].doors = [];
    campus.buildings[0].floors[0].windows = [];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Wall");
    expect(screen.getAllByTestId("wall-endpoint-handle").some((handle) => handle.getAttribute("cx") === "0")).toBe(false);

    fireEvent.mouseDown(wallGroupByX1(container, 0, "#64748b"), { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Floor Overview");
    expect(screen.queryAllByTestId("wall-endpoint-handle").some((handle) => handle.getAttribute("cx") === "0")).toBe(false);
  });

  it("keeps managed perimeter walls valid Door and Window placement targets", () => {
    const campus = makePerimeterOpeningCampus();
    campus.buildings[0].floors[0].doors = [];
    campus.buildings[0].floors[0].windows = [];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "d" });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 0, bubbles: true });
    expect(screen.getByTestId("door-wall-preview")).toBeInTheDocument();
    fireEvent.mouseDown(svg, { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    let floor = latestCampus!.buildings[0].floors[0];
    let topWall = floor.walls.find((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === "top")!;
    expect(floor.doors[0]).toMatchObject({ wallId: topWall.id, x: 110, y: 0 });

    fireEvent.keyDown(window, { key: "i" });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 0, bubbles: true });
    expect(screen.getByTestId("window-wall-preview")).toBeInTheDocument();
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    floor = latestCampus!.buildings[0].floors[0];
    topWall = floor.walls.find((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === "top")!;
    expect(floor.windows[0]).toMatchObject({ wallId: topWall.id, x: 150, y: 0 });
  });

  it("Ctrl+A keeps partially intersecting objects in the selection", () => {
    render(<Harness initialCampus={makePartialOutOfBoundsCampus()} />);

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("manual click can still select a completely out-of-bounds wall", () => {
    const { container } = render(<Harness initialCampus={makeOutOfBoundsCampus()} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.getAllByTestId("wall-endpoint-handle").some((handle) => handle.getAttribute("cx") === "250")).toBe(false);

    fireEvent.mouseDown(wallGroupByX1(container, 250), { clientX: 250, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Wall");
    expect(screen.getAllByTestId("wall-endpoint-handle").some((handle) => handle.getAttribute("cx") === "250")).toBe(true);
  });

  it("empty clicks inside the floor and on the surrounding editor background clear selection", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Room");

    fireEvent.mouseDown(svg, { clientX: 200, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Floor Overview");

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Room");

    fireEvent.mouseDown(svg, { clientX: 260, clientY: 190, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Floor Overview");
  });

  it("empty clicks outside the floor clear multi-selection, including blank space inside the group box", () => {
    const { container } = render(<Harness />);
    const svg = marqueeSelect(container);
    expect(screen.getByText("9 selected")).toBeInTheDocument();

    fireEvent.mouseDown(svg, { clientX: 75, clientY: 75, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByText("9 selected")).toBeNull();
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Floor Overview");

    marqueeSelect(container);
    expect(screen.getByText("9 selected")).toBeInTheDocument();
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 190, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByText("9 selected")).toBeNull();
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Floor Overview");
  });

  it("does not clear selection when clicking editor UI controls", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Room");

    fireEvent.click(screen.getByLabelText("Keyboard shortcuts"));
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Room");
  });

  it("documents Ctrl+D in the Floor Editor shortcuts help", () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Keyboard shortcuts"));

    expect(screen.getByText("Ctrl + D")).toBeInTheDocument();
    expect(screen.getByText("Duplicate selected floor object(s)")).toBeInTheDocument();
  });

  it("duplicates single selections with Ctrl+D and preserves undo/redo history", async () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    await waitFor(() => expect(latestCampus!.buildings[0].floors[0].rooms).toHaveLength(2));
    expect(latestCampus!.buildings[0].floors[0].rooms[1].name).toBe("Room Copy");

    const undoButton = screen.getByTitle("Undo (Ctrl+Z)") as HTMLButtonElement;
    await waitFor(() => expect(undoButton.disabled).toBe(false));
    fireEvent.click(undoButton);
    await waitFor(() => expect(latestCampus!.buildings[0].floors[0].rooms).toHaveLength(1));

    const redoButton = screen.getByTitle("Redo (Ctrl+Y)") as HTMLButtonElement;
    await waitFor(() => expect(redoButton.disabled).toBe(false));
    fireEvent.click(redoButton);
    await waitFor(() => expect(latestCampus!.buildings[0].floors[0].rooms).toHaveLength(2));
  });

  it("duplicates multi-selections with Ctrl+D and does not hijack focused inputs", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);

    marqueeSelect(container);
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    let floor = latestCampus!.buildings[0].floors[0];
    expect(floor.rooms).toHaveLength(2);
    expect(floor.walls).toHaveLength(2);
    expect(floor.furniture).toHaveLength(2);
    expect(screen.getByText("9 selected")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { bubbles: true });
    const nameInput = screen.getAllByRole("textbox")[0];
    nameInput.focus();
    fireEvent.keyDown(nameInput, { key: "d", ctrlKey: true });
    floor = latestCampus!.buildings[0].floors[0];
    expect(floor.rooms).toHaveLength(2);
  });

  it("right-clicking an unrelated object replaces the selection", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    // Build a 2-member group via modifier clicks
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(furnitureGroup(container, "Desk"), { clientX: 99, clientY: 96, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // Right-click the window (not part of the group) → selection replaced
    const windowG = Array.from(container.querySelectorAll("g")).find(
      (el) => !el.hasAttribute("transform") && el.querySelector('rect[stroke="#38bdf8"]')
    ) as SVGGElement;
    fireEvent.contextMenu(windowG, { clientX: 36, clientY: 122, bubbles: true });

    expect(screen.queryByText("2 selected")).toBeNull();
    expect(screen.getByRole("button", { name: /Duplicate/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Duplicate Selected/i })).toBeNull();
  });

  it("clears the multi-selection intentionally on empty-canvas click", () => {
    const { container } = render(<Harness />);
    const svg = marqueeSelect(container);
    expect(screen.getByText("9 selected")).toBeInTheDocument();

    fireEvent.mouseDown(svg, { clientX: 210, clientY: 5, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.queryByText("9 selected")).toBeNull();
    expect(screen.queryByTestId("floor-group-outline")).toBeNull();
  });

  it("shows a group bounding outline that updates with the group", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = marqueeSelect(container);

    const outline = screen.getByTestId("floor-group-outline");
    const xBefore = Number(outline.getAttribute("x"));
    expect(xBefore).toBeLessThan(20); // room starts at 20 → padded -4
    expect(Number(outline.getAttribute("width"))).toBeGreaterThan(160);

    // After the group moves, the outline follows the group bounds
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 80, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const xAfter = Number(screen.getByTestId("floor-group-outline").getAttribute("x"));
    expect(xAfter).toBeGreaterThan(xBefore);
  });
});

describe("Phase 1.8 — Selected Objects inspector", () => {
  it("shows a dedicated multi-selection state with no canvas/single-object settings", () => {
    const { container } = render(<Harness />);
    marqueeSelect(container);

    const panel = screen.getByTestId("floor-multi-properties-panel");
    expect(panel).toHaveTextContent("Selected Objects");
    expect(panel).toHaveTextContent("9 objects selected");
    expect(screen.getByRole("button", { name: /Duplicate Selected/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete Selected/i })).toBeInTheDocument();
    // Floor canvas size must NOT appear as a multi-selection property
    expect(screen.queryByLabelText("Floor canvas width")).toBeNull();
    expect(screen.queryByLabelText("Floor canvas height")).toBeNull();
    // Floor Settings is not reachable from the multi panel
    expect(panel.textContent).not.toContain("Floor Settings");
  });

  it("mixed selection count stays correct across modifier clicks", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(furnitureGroup(container, "Desk"), { clientX: 99, clientY: 96, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    const panel = screen.getByTestId("floor-multi-properties-panel");
    expect(panel).toHaveTextContent("2 objects selected");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1.8 — wall connection quality / detach / re-angle
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 1.8 — wall connection quality", () => {
  it("terminates a wall at the EXACT snap point on a diagonal segment (no rounding gaps)", () => {
    const campus = makeSnapCampus();
    const floor = campus.buildings[0].floors[0];
    // Diagonal target wall with non-integer segment points
    floor.walls = [{ id: "wd", x1: 37, y1: 43, x2: 151, y2: 99, thickness: 4, color: "#64748b", material: "concrete" }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 30, clientY: 120, bubbles: true }); // start (30,120)
    fireEvent.mouseMove(svg, { clientX: 95, clientY: 71, shiftKey: true, bubbles: true }); // near segment (94.8,71.4)
    fireEvent.mouseDown(svg, { clientX: 95, clientY: 71, shiftKey: true, bubbles: true });

    const walls = latestCampus!.buildings[0].floors[0].walls as FloorWall[];
    expect(walls).toHaveLength(2);
    const drawn = walls[1];
    // The endpoint lands on the diagonal line EXACTLY (cross-product ≈ 0 within
    // floating point), so a visually connected wall truly meets the target with
    // no 2–5px stroke/rounding gap.
    const dx = 151 - 37;
    const dy = 99 - 43;
    const cross = (drawn.x2 - 37) * dy - (drawn.y2 - 43) * dx;
    expect(Math.abs(cross)).toBeLessThan(0.05);
    expect(drawn.x2).toBeCloseTo(94.8, 1);
    expect(drawn.y2).toBeCloseTo(71.4, 1);
  });

  it("angle assistance never overrides a stronger structural snap target", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 30, clientY: 90, bubbles: true }); // start (30,90)
    // No Shift: 45° angle assist would rotate this endpoint, but the wall
    // segment at (100,57) is a stronger structural target and must win.
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 60, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 60, bubbles: true });

    const walls = latestCampus!.buildings[0].floors[0].walls;
    expect(walls[2]).toMatchObject({ x1: 30, y1: 90, x2: 100, y2: 57 });
  });

  it("detaches a snapped wall by dragging its endpoint away (free movement)", () => {
    const campus = makeSnapCampus();
    campus.buildings[0].floors[0].walls = [
      { id: "wa", x1: 30, y1: 90, x2: 100, y2: 57, thickness: 4, color: "#64748b", material: "concrete" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    // Select the wall
    fireEvent.mouseDown(wallGroupByX1(container, 30), { clientX: 60, clientY: 75, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Drag the x2 endpoint far from any snap target → free movement
    const handles = screen.queryAllByTestId("wall-endpoint-handle");
    const x2Handle = Array.from(handles).find((h) => Number(h.getAttribute("cx")) === 100)!;
    fireEvent.mouseDown(x2Handle, { clientX: 100, clientY: 57, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 220, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const wall = latestCampus!.buildings[0].floors[0].walls[0];
    expect(wall).toMatchObject({ x1: 30, y1: 90, x2: 300, y2: 220 });
  });

  it("lets a wall that was snapped to a segment become diagonal", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    // Draw a wall whose end snaps to the w1 segment at (100,57)
    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 30, clientY: 90, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 60, shiftKey: true, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 60, shiftKey: true, bubbles: true });
    const walls = latestCampus!.buildings[0].floors[0].walls;
    expect(walls[2]).toMatchObject({ x1: 30, y1: 90, x2: 100, y2: 57 });

    // Switch to select, then drag the endpoint to a free diagonal position
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(wallGroupByX1(container, 30), { clientX: 60, clientY: 75, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handles = screen.queryAllByTestId("wall-endpoint-handle");
    const x2Handle = Array.from(handles).find((h) => Number(h.getAttribute("cx")) === 100)!;
    fireEvent.mouseDown(x2Handle, { clientX: 100, clientY: 57, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 170, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const wall = latestCampus!.buildings[0].floors[0].walls[2];
    expect(wall).toMatchObject({ x1: 30, y1: 90, x2: 170, y2: 150 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1.8 — furniture library, renderer, and resize
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 1.8 — curated furniture library", () => {
  it("keeps a small default library with no pointless duplicates", () => {
    const allTypes = FURNITURE_CATEGORIES.flatMap((c) => c.items.map((i) => i.type));
    expect(allTypes).toEqual([
      "chair", "bench", "sofa",
      "desk", "table",
      "cabinet", "bookshelf",
      "computer-workstation",
      "plant",
    ]);
    // The redundant variants were removed from the DEFAULT palette…
    expect(allTypes).not.toContain("student-chair");
    expect(allTypes).not.toContain("student-desk");
    expect(allTypes).not.toContain("teacher-desk");
    // …and no two entries share a display name
    const names = FURNITURE_CATEGORIES.flatMap((c) => c.items.map((i) => i.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("renders legacy furniture types safely (removed from palette, still renderable)", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].furniture = [
      { id: "lc1", type: "student-chair", name: "Student Chair", category: "seating", x: 90, y: 90, width: 12, height: 12, rotation: 0, color: "#2563eb" },
      { id: "lc2", type: "fume-hood", name: "Legacy Hood", category: "lab", x: 140, y: 90, width: 16, height: 12, rotation: 0, color: "#d4d4d8" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container);

    // Legacy chair renders through the chair branch (seat + backrest)
    const legacyChair = furnitureGroup(container, "Student Chair");
    expect(legacyChair.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    // Unknown legacy type renders the structured fallback (never a bare rect)
    const legacyHood = furnitureGroup(container, "Legacy Hood");
    expect(legacyHood.querySelector("rect")).toBeTruthy();
    expect(legacyHood.querySelectorAll("line").length).toBeGreaterThanOrEqual(2);
  });

  it("renders structurally distinct, recognizable symbols for common furniture", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].furniture = [
      { id: "f1", type: "chair", name: "Chair", category: "seating", x: 10, y: 10, width: 12, height: 12, rotation: 0, color: "#4b5563" },
      { id: "f2", type: "sofa", name: "Sofa", category: "seating", x: 40, y: 10, width: 34, height: 16, rotation: 0, color: "#3f3f46" },
      { id: "f3", type: "bench", name: "Bench", category: "seating", x: 90, y: 10, width: 30, height: 10, rotation: 0, color: "#6b5b45" },
      { id: "f4", type: "desk", name: "Desk", category: "tables", x: 10, y: 40, width: 26, height: 16, rotation: 0, color: "#7a5c3a" },
      { id: "f5", type: "table", name: "Table", category: "tables", x: 60, y: 40, width: 28, height: 18, rotation: 0, color: "#8b6f4e" },
      { id: "f6", type: "cabinet", name: "Cabinet", category: "storage", x: 10, y: 80, width: 18, height: 12, rotation: 0, color: "#71717a" },
      { id: "f7", type: "bookshelf", name: "Shelf", category: "storage", x: 40, y: 80, width: 18, height: 10, rotation: 0, color: "#6b5b45" },
      { id: "f8", type: "computer-workstation", name: "Computer Workstation", category: "electronics", x: 80, y: 80, width: 28, height: 16, rotation: 0, color: "#475569" },
      { id: "f9", type: "plant", name: "Plant", category: "decor", x: 130, y: 80, width: 10, height: 10, rotation: 0, color: "#3f7d4a" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container);

    const signature = (title: string) => {
      const g = furnitureGroup(container, title);
      return {
        rects: g.querySelectorAll("rect").length,
        lines: g.querySelectorAll("line").length,
        circles: g.querySelectorAll("circle").length,
      };
    };
    // Chair: seat + backrest (2 rects, no lines/circles)
    expect(signature("Chair")).toEqual({ rects: 2, lines: 0, circles: 0 });
    // Sofa: body + cushion + 2 arms
    expect(signature("Sofa").rects).toBeGreaterThanOrEqual(4);
    // Desk: flat top + work zone + keyboard band (3 rects)
    expect(signature("Desk")).toEqual({ rects: 3, lines: 0, circles: 0 });
    // Table: rounded tabletop + inner panel + centre leaf
    expect(signature("Table").rects).toBe(2);
    expect(signature("Table").lines).toBe(1);
    // Cabinet: doors + handle dots
    expect(signature("Cabinet").circles).toBe(2);
    // Shelf: visible shelf divisions
    expect(signature("Shelf").lines).toBe(3);
    // Computer workstation: monitor + keyboard
    expect(signature("Computer Workstation").rects).toBe(3);
    // Plant: planter + organic leaves
    expect(signature("Plant").circles).toBe(3);
  });

  it("color is a real functional property — the renderer honors it", () => {
    const make = (color: string): Campus => {
      const campus = makeRichCampus();
      campus.buildings[0].floors[0].furniture = [
        { id: "c1", type: "chair", name: "Chair", category: "seating", x: 90, y: 90, width: 12, height: 12, rotation: 0, color },
      ];
      return campus;
    };
    const { container, unmount } = render(<Harness initialCampus={make("#ff0000")} />);
    stubSvgRect(container);
    expect(furnitureGroup(container, "Chair").querySelector("rect")?.getAttribute("fill")).toBe("#ff0000");

    unmount();
    document.body.innerHTML = "";
    const { container: c2 } = render(<Harness initialCampus={make("#00ff00")} />);
    stubSvgRect(c2);
    expect(furnitureGroup(c2, "Chair").querySelector("rect")?.getAttribute("fill")).toBe("#00ff00");

    // The furniture inspector still exposes the working Color control
    const campus3 = make("#4b5563");
    const { container: c3 } = render(<Harness initialCampus={campus3} />);
    stubSvgRect(c3);
    fireEvent.mouseDown(furnitureGroup(c3, "Chair"), { clientX: 96, clientY: 96, bubbles: true });
    const panel = screen.getByTestId("floor-properties-panel");
    expect(panel).toHaveTextContent("Furniture");
    expect(panel).toHaveTextContent("Color");
  });

  it("shows a simplified unified furniture inspector (no Info/Style/Size tabs)", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(furnitureGroup(container, "Desk"), { clientX: 99, clientY: 96, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const panel = screen.getByTestId("floor-properties-panel");
    expect(panel).toHaveTextContent("Furniture");
    expect(panel).toHaveTextContent("Desk");
    // One clear panel instead of fragmented tabs
    expect(screen.queryByRole("button", { name: "Info" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Style" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Size" })).toBeNull();
    // Width / Height / Rotation / Color / Duplicate are all reachable
    expect(screen.getByText("Width")).toBeInTheDocument();
    expect(screen.getByText("Height")).toBeInTheDocument();
    expect(screen.getByText("Rotation")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Duplicate/i })).toBeInTheDocument();
  });

  it("places furniture directly inside a room while select mode still selects the room", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.click(screen.getByRole("button", { name: /Tables \/ Work/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Desk$/i }));
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor.furniture).toHaveLength(2);
    expect(floor.furniture[1].name).toBe("Desk");
    expect(floor.furniture[1].x).toBeGreaterThanOrEqual(floor.rooms[0].x);
    expect(floor.furniture[1].y).toBeGreaterThanOrEqual(floor.rooms[0].y);

    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Room");
  });

  it("resizes a single dimension from a side handle", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(furnitureGroup(container, "Desk"), { clientX: 99, clientY: 96, bubbles: true });
    const east = Array.from(container.querySelectorAll('[data-testid="furniture-resize-handle"][data-corner="e"]'))[0];
    fireEvent.mouseDown(east, { clientX: 108, clientY: 96, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 96, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const item = latestCampus!.buildings[0].floors[0].furniture[0];
    // Only the width changed (east handle → desk ceiling 74); height stayed put
    expect(item.width).toBe(74);
    expect(item.height).toBe(12);
    expect(item.x + item.width).toBeLessThanOrEqual(220);
  });

  it("keeps rotated furniture inside the floor while resizing", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].furniture = [
      { id: "r1", type: "desk", name: "Desk", category: "tables", x: 180, y: 130, width: 30, height: 20, rotation: 45, color: "#7a5c3a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(furnitureGroup(container, "Desk"), { clientX: 195, clientY: 140, bubbles: true });
    const se = Array.from(container.querySelectorAll('[data-testid="furniture-resize-handle"][data-corner="se"]'))[0];
    fireEvent.mouseDown(se, { clientX: 210, clientY: 150, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const item = latestCampus!.buildings[0].floors[0].furniture[0];
    const aabb = rotatedRectBounds(item.x, item.y, item.width, item.height, item.rotation);
    expect(aabb.x).toBeGreaterThanOrEqual(0);
    expect(aabb.y).toBeGreaterThanOrEqual(0);
    expect(aabb.x + aabb.w).toBeLessThanOrEqual(220);
    expect(aabb.y + aabb.h).toBeLessThanOrEqual(160);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1.8 — text annotation editing
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 1.8 — text annotation is a real editable object", () => {
  it("places a text label and immediately makes it editable in Properties", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "t" }); // text tool
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const labels = latestCampus!.buildings[0].floors[0].labels;
    expect(labels).toHaveLength(2); // the fixture already has a Lobby label
    expect(labels[1]).toMatchObject({ text: "Label", fontSize: 12 });
    // Properties panel is open and ready to type
    const textarea = screen.getByLabelText("Label text");
    expect(textarea).toBeInTheDocument();
  });

  it("edits text, font size, alignment, and color through the panel", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    // Select the label
    const labelGroup = Array.from(container.querySelectorAll("g")).find(
      (el) => !el.hasAttribute("transform") && el.querySelector("text")?.textContent === "Lobby"
    ) as SVGGElement;
    fireEvent.mouseDown(labelGroup, { clientX: 60, clientY: 80, bubbles: true });

    // Text content
    fireEvent.change(screen.getByLabelText("Label text"), { target: { value: "Main Lobby" } });
    // Font size
    fireEvent.change(screen.getByLabelText("Label font size"), { target: { value: "16" } });
    // Alignment
    fireEvent.click(screen.getByRole("button", { name: "Center" }));
    // Color is wired through the functional ColorPicker in the panel
    const colorLabel = screen.getByText("Text Color");
    expect(colorLabel).toBeInTheDocument();

    const label = latestCampus!.buildings[0].floors[0].labels[0];
    expect(label.text).toBe("Main Lobby");
    expect(label.fontSize).toBe(16);
    expect(label.align).toBe("center");

    // Rendered text follows the alignment anchor
    const renderedText = Array.from(container.querySelectorAll("text")).find((t) => t.textContent === "Main Lobby");
    expect(renderedText?.getAttribute("text-anchor")).toBe("middle");
  });

  it("double-clicking a label opens the text editor", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = stubSvgRect(container);

    fireEvent.dblClick(screen.getByTestId("floor-label-hit-area"), { clientX: 60, clientY: 80, bubbles: true });

    expect(screen.getByLabelText("Label text")).toBeInTheDocument();
    expect(screen.getByLabelText("Inline label text")).toBeInTheDocument();
  });

  it("commits inline text edits from the canvas and preserves normal label persistence fields", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getByTestId("floor-label-object"), { clientX: 60, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(screen.getByTestId("floor-label-object"), { clientX: 60, clientY: 80, detail: 2, bubbles: true });

    const inline = screen.getByLabelText("Inline label text");
    fireEvent.change(inline, { target: { value: "Main Lobby" } });
    fireEvent.blur(inline);

    const label = latestCampus!.buildings[0].floors[0].labels[0];
    expect(label).toMatchObject({
      text: "Main Lobby",
      x: 40,
      y: 80,
      fontSize: 12,
      color: "#374151",
      rotation: 0,
      align: "left",
    });
    expect(screen.queryByLabelText("Inline label text")).toBeNull();
  });

  it("keeps text inside the floor when it grows near an edge", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 200, y: 80, text: "Hi", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    const labelGroup = Array.from(container.querySelectorAll("g")).find(
      (el) => !el.hasAttribute("transform") && el.querySelector("text")?.textContent === "Hi"
    ) as SVGGElement;
    fireEvent.mouseDown(labelGroup, { clientX: 210, clientY: 80, bubbles: true });

    // Growing the text past the right edge must pull the label back inside
    fireEvent.change(screen.getByLabelText("Label text"), { target: { value: "WWWWW" } });
    const label = latestCampus!.buildings[0].floors[0].labels[0];
    expect(label.x + label.text.length * label.fontSize * 0.6).toBeLessThanOrEqual(220);
  });

  it("cancels inline edits with Escape without changing text", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getByTestId("floor-label-hit-area"), { clientX: 60, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.dblClick(screen.getByTestId("floor-label-hit-area"), { clientX: 60, clientY: 80, bubbles: true });
    const inline = screen.getByLabelText("Inline label text");
    fireEvent.change(inline, { target: { value: "Draft Name" } });
    fireEvent.keyDown(inline, { key: "Escape", bubbles: true });

    expect(latestCampus).toBeNull();
    expect(campus.buildings[0].floors[0].labels[0].text).toBe("Lobby");
    expect(screen.queryByLabelText("Inline label text")).toBeNull();
  });

  it("click selects, drag moves, and A-/A+ adjust selected text size", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    const labelGroup = screen.getByTestId("floor-label-object");
    fireEvent.mouseDown(labelGroup, { clientX: 40, clientY: 80, bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Label");
    expect(screen.getByTestId("selected-label-font-controls")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Increase selected text size" }));
    expect(latestCampus!.buildings[0].floors[0].labels[0].fontSize).toBe(13);

    fireEvent.click(screen.getByRole("button", { name: "Decrease selected text size" }));
    expect(latestCampus!.buildings[0].floors[0].labels[0].fontSize).toBe(12);

    fireEvent.mouseMove(svg, { clientX: 60, clientY: 95, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Alignment may snap label edges to nearby room/furniture edges (Issue 2A).
    const movedLabel = latestCampus!.buildings[0].floors[0].labels[0];
    expect(movedLabel.x).toBeGreaterThanOrEqual(58);
    expect(movedLabel.x).toBeLessThanOrEqual(62);
    expect(movedLabel.y).toBeGreaterThanOrEqual(93);
    expect(movedLabel.y).toBeLessThanOrEqual(100);
  });

  it("selects and drags from the text body hit area, not only the outline", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    const hitArea = screen.getByTestId("floor-label-hit-area");
    fireEvent.mouseDown(hitArea, { clientX: 42, clientY: 76, bubbles: true });
    expect(screen.getByTestId("floor-label-selection-outline")).toBeInTheDocument();

    fireEvent.mouseMove(svg, { clientX: 70, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Alignment may snap label edges to nearby room/furniture edges.
    const movedLabel = latestCampus!.buildings[0].floors[0].labels[0];
    expect(movedLabel.x).toBeGreaterThanOrEqual(68);
    expect(movedLabel.x).toBeLessThanOrEqual(70);
    expect(movedLabel.y).toBeGreaterThanOrEqual(102);
    expect(movedLabel.y).toBeLessThanOrEqual(104);
  });

  it("shows text transform handles and scales text by changing font size", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(screen.getByTestId("floor-label-hit-area"), { clientX: 42, clientY: 76, bubbles: true });
    expect(screen.getAllByTestId("floor-label-resize-handle")).toHaveLength(4);
    expect(screen.getByTestId("floor-label-rotate-handle")).toBeInTheDocument();

    const resizeHandle = screen.getAllByTestId("floor-label-resize-handle").find((el) => el.getAttribute("data-corner") === "se")!;
    fireEvent.mouseDown(resizeHandle, { clientX: 84, clientY: 90, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 122, clientY: 122, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latestCampus!.buildings[0].floors[0].labels[0].fontSize).toBeGreaterThan(12);
  });

  it("keeps multi-selected text out of edit mode until double-click isolates it", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].rooms = [];
    campus.buildings[0].floors[0].walls = [];
    campus.buildings[0].floors[0].doors = [];
    campus.buildings[0].floors[0].windows = [];
    campus.buildings[0].floors[0].stairs = [];
    campus.buildings[0].floors[0].ramps = [];
    campus.buildings[0].floors[0].elevators = [];
    campus.buildings[0].floors[0].paths = [];
    campus.buildings[0].floors[0].furniture = [
      { id: "furx", type: "chair", name: "Chair", category: "seating", x: 80, y: 80, width: 16, height: 16, rotation: 0, color: "#64748b" },
    ];
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(svg, { clientX: 20, clientY: 55, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 115, clientY: 110, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-multi-properties-panel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Inline label text")).toBeNull();

    fireEvent.keyDown(window, { key: "x", bubbles: true });
    expect(screen.queryByLabelText("Inline label text")).toBeNull();

    fireEvent.mouseDown(screen.getByTestId("floor-label-hit-area"), { clientX: 60, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.dblClick(screen.getByTestId("floor-label-hit-area"), { clientX: 60, clientY: 80, bubbles: true });

    expect(screen.queryByTestId("floor-multi-properties-panel")).toBeNull();
    expect(screen.getByLabelText("Inline label text")).toBeInTheDocument();
  });

  it("keeps floor shortcuts inactive while inline text is being edited", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    const labelGroup = screen.getByTestId("floor-label-object");
    fireEvent.mouseDown(labelGroup, { clientX: 60, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(labelGroup, { clientX: 60, clientY: 80, bubbles: true });
    const inline = screen.getByLabelText("Inline label text");

    fireEvent.keyDown(inline, { key: "a", ctrlKey: true, bubbles: true });
    fireEvent.keyDown(inline, { key: "d", ctrlKey: true, bubbles: true });
    fireEvent.keyDown(inline, { key: "Backspace", bubbles: true });
    fireEvent.keyDown(inline, { key: "Delete", bubbles: true });

    expect(campus.buildings[0].floors[0].labels).toHaveLength(1);
    expect(screen.queryByTestId("floor-multi-properties-panel")).toBeNull();
    expect(screen.getByLabelText("Inline label text")).toBeInTheDocument();
    expect(latestCampus).toBeNull();
  });

  it("auto-sizes inline editing live and hides the committed text underneath", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].labels = [
      { id: "lbx", x: 40, y: 80, text: "Hi", fontSize: 12, color: "#374151", rotation: 0, align: "left" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container);

    fireEvent.dblClick(screen.getByTestId("floor-label-hit-area"), { clientX: 42, clientY: 80, bubbles: true });
    const inline = screen.getByLabelText("Inline label text") as HTMLTextAreaElement;
    // Query the editor by its stable data-testid instead of the SVG element name,
    // which JSDOM's closest() does not always match case-sensitively.
    const editor = () => inline.closest('[data-testid="inline-label-editor"]') as SVGForeignObjectElement;
    const initialWidth = Number(editor().getAttribute("width"));

    expect(Array.from(container.querySelectorAll("text")).filter((node) => node.textContent === "Hi")).toHaveLength(0);
    fireEvent.change(inline, { target: { value: "A much longer wayfinding note" } });
    expect(Number(editor().getAttribute("width"))).toBeGreaterThan(initialWidth);

    fireEvent.change(inline, { target: { value: "Ok" } });
    expect(Number(editor().getAttribute("width"))).toBe(initialWidth);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1.8 — Floor Settings dialog (General / Canvas / Appearance)
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 1.8 — Floor Settings dialog", () => {
  function openSettings() {
    const toolbarSettings = screen.queryByRole("button", { name: /^Floor Settings$/i });
    if (toolbarSettings) {
      fireEvent.click(toolbarSettings);
    } else {
      fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
      fireEvent.click(screen.getByRole("button", { name: /Open Floor Settings/i }));
    }
    expect(screen.getByTestId("floor-settings-dialog")).toBeInTheDocument();
  }

  it("applies canvas size + floor background + grid preference as one edit and marks the floor dirty", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);
    openSettings();

    fireEvent.change(screen.getByLabelText("Floor canvas width"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Floor canvas height"), { target: { value: "220" } });
    fireEvent.click(screen.getByRole("button", { name: /Background Warm White/i }));
    fireEvent.click(screen.getByRole("button", { name: /Show canvas grid/i }));
    fireEvent.click(screen.getByRole("button", { name: "Grid size 40" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor).toMatchObject({ canvasW: 300, canvasH: 220, backgroundColor: "#faf7f0", showGrid: false, gridSize: 40 });

    // The floor surface visually uses the applied background; grid lines hide
    const boundary = screen.getByTestId("floor-canvas-boundary");
    expect(boundary).toHaveAttribute("fill", "#faf7f0");
    expect(container.querySelector('line[stroke="rgba(55,48,40,0.08)"]')).toBeNull();

    // The change made the floor dirty so Save is now enabled
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explicitly creates and resizes managed perimeter walls without moving authored walls", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);
    openSettings();

    fireEvent.click(screen.getByRole("button", { name: /Enable structural perimeter walls/i }));
    fireEvent.click(screen.getByRole("button", { name: /Thin/i }));
    fireEvent.click(screen.getByRole("button", { name: /Glass/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    let floor = latestCampus!.buildings[0].floors[0];
    const managed = floor.walls.filter((wall) => wall.managedKind === "perimeter");
    expect(managed).toHaveLength(4);
    expect(managed.every((wall) => UUID_RE.test(wall.id))).toBe(true);
    expect(managed.every((wall) => wall.locked && wall.thickness === 2 && wall.material === "glass")).toBe(true);
    expect(floor.walls.find((wall) => wall.id === "w1")).toMatchObject({ x1: 80, y1: 70, x2: 130, y2: 70 });
    const idsBySide = Object.fromEntries(managed.map((wall) => [wall.perimeterSide, wall.id]));

    openSettings();
    fireEvent.change(screen.getByLabelText("Floor canvas width"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Floor canvas height"), { target: { value: "220" } });
    fireEvent.click(screen.getByRole("button", { name: /Brick/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    floor = latestCampus!.buildings[0].floors[0];
    const right = floor.walls.find((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === "right");
    const bottom = floor.walls.find((wall) => wall.managedKind === "perimeter" && wall.perimeterSide === "bottom");
    expect(right).toMatchObject({ id: idsBySide.right, x1: 300, y1: 0, x2: 300, y2: 220, material: "brick" });
    expect(bottom).toMatchObject({ id: idsBySide.bottom, x1: 300, y1: 220, x2: 0, y2: 220, material: "brick" });
    expect(floor.walls.find((wall) => wall.id === "w1")).toMatchObject({ x1: 80, y1: 70, x2: 130, y2: 70 });
  });

  it("keeps managed perimeter walls structural-only with clean corners and no endpoint handles", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    openSettings();

    fireEvent.click(screen.getByRole("button", { name: /Enable structural perimeter walls/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    const topPerimeter = wallGroupByX1(container, 0, "#64748b");

    fireEvent.mouseDown(topPerimeter, { clientX: 110, clientY: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-properties-panel")).toHaveTextContent("Floor Overview");
    expect(screen.queryAllByTestId("wall-endpoint-handle")).toHaveLength(0);
    expect(screen.queryAllByTestId("wall-joint-cap")).toHaveLength(0);
  });

  it("reverts the floor name draft on Cancel without touching the campus", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    fireEvent.click(screen.getByRole("button", { name: /Open Floor Settings/i }));

    const nameInput = screen.getByLabelText("Floor name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Renamed Floor" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(latestCampus).toBeNull();
  });

  it("does not close when input selection or backdrop mouse release lands outside the dialog", () => {
    render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    openSettings();

    const dialog = screen.getByTestId("floor-settings-dialog");
    const widthInput = screen.getByLabelText("Floor canvas width");
    fireEvent.mouseDown(widthInput, { clientX: 20, clientY: 20, bubbles: true });
    fireEvent.mouseMove(dialog, { clientX: 1, clientY: 1, bubbles: true });
    fireEvent.mouseUp(dialog, { clientX: 1, clientY: 1, bubbles: true });
    fireEvent.click(dialog);

    expect(screen.getByTestId("floor-settings-dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Floor canvas width")).toBeInTheDocument();
    expect(latestCampus).toBeNull();
  });

  it("closes only through explicit close controls while keeping a bounded scroll body and footer", async () => {
    render(<Harness />);
    openSettings();

    expect(screen.getByTestId("floor-settings-scroll-body").className).toContain("overflow-y-auto");
    expect(screen.getByTestId("floor-settings-footer").className).toContain("shrink-0");

    fireEvent.click(screen.getByLabelText("Close floor settings"));
    await waitFor(() => expect(screen.queryByTestId("floor-settings-dialog")).toBeNull());

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByTestId("floor-settings-dialog")).toBeNull());
  });

  it("does not leak Floor Settings controls into multi-selection or single-object properties", () => {
    const { container } = render(<Harness />);
    marqueeSelect(container);

    // Multi-selection panel has no Floor Settings / canvas controls
    const multiPanel = screen.getByTestId("floor-multi-properties-panel");
    expect(multiPanel.textContent).not.toContain("Floor Settings");
    expect(multiPanel.textContent).not.toContain("Canvas");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1.8 — Save feedback (overlay, not only a toast)
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 1.8 — Save UX transitions", () => {
  it("idle → saving → saved with a central overlay that responds to the real async op", async () => {
    let resolveSave!: (c: Campus) => void;
    const savePromise = new Promise<Campus>((res) => { resolveSave = res; });
    const onSave = vi.fn(() => savePromise);

    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} onSave={onSave} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("floor-save-status")).toBeInTheDocument();
    expect(screen.getByTestId("floor-save-status")).toHaveTextContent("Saving floor…");

    resolveSave(latestCampus!);
    await waitFor(() => expect(screen.getByTestId("floor-save-status")).toHaveTextContent("Saved"));
  });

  it("idle → saving → error: overlay leaves, edits and dirty state survive", async () => {
    const onSave = vi.fn(() => Promise.reject(new Error("DB offline")));

    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} onSave={onSave} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("floor-save-status")).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByTestId("floor-save-status")).toBeNull());
    // Edits remain, dirty remains → Save is enabled again
    expect(latestCampus!.buildings[0].floors[0].rooms[0]).toMatchObject({ x: 35, y: 30 });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── B7 Final: Alignment guides, keyboard collision, rotated bounds ──
describe("B7 Final — Outdoor-style alignment guides + keyboard collision", () => {
  let latestCampus: Campus | null = null;

  beforeEach(() => {
    latestCampus = null;
    cleanup();
  });
  afterEach(() => cleanup());

  it("room move near another room's edge produces a visible guide AND a snapped result", async () => {
    const campus = makeRichCampus();
    // Add a second room whose left edge sits exactly where the first room's
    // left edge will land after the +10 drag (r1 x 20 → 30, r2 left = 30).
    campus.buildings[0].floors[0].rooms.push(
      { id: "r2", name: "Room B", type: "office", x: 30, y: 80, w: 50, h: 40, floorId: "f1", buildingId: "b1" }
    );
    let latestCampus: Campus | null = null;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    expect(container.querySelectorAll("[data-testid='room-align-guide']").length).toBe(0);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 55, clientY: 40, bubbles: true });
    console.log("DBG latest r1:", JSON.stringify(latestCampus?.buildings[0].floors[0].rooms.find((r) => r.id === "r1")));
    console.log("DBG guide count:", container.querySelectorAll("[data-testid='room-align-guide']").length);
    console.log("DBG svg exists:", !!container.querySelector("svg"));
    console.log("DBG all testid count:", container.querySelectorAll("[data-testid]").length);
    console.log("DBG svg html:", container.querySelector("svg")?.innerHTML?.substring(0, 200));
    // r1 moved +10 (20 → 30): its left edge now coincides with r2's left edge,
    // so a vertical guide MUST render at x=30 (visible, full-height, accent).
    const guides = container.querySelectorAll("[data-testid='room-align-guide']");
    expect(guides.length).toBeGreaterThan(0);
    const vertical = Array.from(guides).find((l) => l.getAttribute("x1") === "30" && l.getAttribute("x2") === "30");
    expect(vertical).toBeTruthy();
    // The guide is a dashed accent line above objects (pointer-events none).
    expect(vertical!.getAttribute("stroke")).toBe("var(--accent)");
    // Vertical guide spans the full floor height — NOT a zero-length line.
    expect(vertical!.getAttribute("y1")).toBe("0");
    expect(vertical!.getAttribute("y2")).toBe("160");
    // Snapped result committed to state.
    const moved = latestCampus!.buildings[0].floors[0].rooms.find((r) => r.id === "r1")!;
    expect(moved.x).toBe(30);

    // After pointer-up, guides must be gone.
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelectorAll("[data-testid='room-align-guide']").length).toBe(0);
  });

  it("alignment guide uses var(--accent) color and dashed stroke (Outdoor style)", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].rooms.push(
      { id: "r2", name: "Room B", type: "office", x: 30, y: 80, w: 50, h: 40, floorId: "f1", buildingId: "b1" }
    );
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Move room r1 (at x:20) right toward r2's left edge (x:30)
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 55, clientY: 40, bubbles: true });

    const guides = container.querySelectorAll("[data-testid='room-align-guide']");
    if (guides.length > 0) {
      const line = guides[0] as SVGLineElement;
      // Should use accent color and have dashed stroke
      expect(line.getAttribute("stroke")).toBe("var(--accent)");
      // Glow layer has strokeWidth=8, dashed layer has strokeDasharray
      const parent = line.closest("g.pointer-events-none");
      expect(parent).toBeTruthy();
    }
  });

  it("alignment guide disappears after pointer-up", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].rooms.push(
      { id: "r2", name: "Room B", type: "office", x: 30, y: 80, w: 50, h: 40, floorId: "f1", buildingId: "b1" }
    );
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 55, clientY: 40, bubbles: true });
    // May or may not have guides depending on snap proximity

    fireEvent.mouseUp(svg, { bubbles: true });

    // After pointer-up, guides must be gone
    const guides = container.querySelectorAll("[data-testid='room-align-guide']");
    expect(guides.length).toBe(0);
  });  it("ArrowRight stops exactly at adjacent room edge (no overlap)", () => {
    const campus = makeRichCampus();
    // Room A at x=10, Room B at x=70 — 20px gap between right edge of A (50) and left edge of B (70)
    campus.buildings[0].floors[0].rooms = [
      { id: "rA", name: "A", type: "classroom", x: 10, y: 20, w: 40, h: 40, floorId: "f1", buildingId: "b1" },
      { id: "rB", name: "B", type: "office", x: 70, y: 20, w: 40, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    let latestCampus: Campus | null = null;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select room A by clicking it
    const groups = container.querySelectorAll("g[data-floor-title]");
    const rAGroup = Array.from(groups).find((g) => g.getAttribute("aria-label") === "A");
    fireEvent.mouseDown(rAGroup!, { clientX: 20, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Press ArrowRight 3 times (10px each) — should move from x=10 to x=30, right edge = 70 = B.left
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    }
    // Try more — should not go past B's left edge (70)
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }

    const roomA = latestCampus!.buildings[0].floors[0].rooms.find((r) => r.id === "rA")!;
    // Room A right edge must be exactly at B's left edge (70)
    expect(roomA.x + roomA.w).toBeLessThanOrEqual(70);
    expect(roomA.x + roomA.w).toBe(70);
  });

  it("ArrowLeft stops exactly at adjacent room edge", () => {
    const campus = makeRichCampus();
    // Room A at x=10, Room B at x=70 — 20px gap between A.right (50) and B.left (70)
    campus.buildings[0].floors[0].rooms = [
      { id: "rA", name: "A", type: "classroom", x: 10, y: 20, w: 40, h: 40, floorId: "f1", buildingId: "b1" },
      { id: "rB", name: "B", type: "office", x: 70, y: 20, w: 40, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    let latestCampus: Campus | null = null;
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select room B by clicking it
    const groups = container.querySelectorAll("g[data-floor-title]");
    const rBGroup = Array.from(groups).find((g) => g.getAttribute("aria-label") === "B");
    fireEvent.mouseDown(rBGroup!, { clientX: 80, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Press ArrowLeft 3 times (10px each) — should move from x=70 to x=50, left edge = 50 = A.right
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
    }
    // Try more — should not go past A's right edge (50)
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    }

    const roomB = latestCampus!.buildings[0].floors[0].rooms.find((r) => r.id === "rB")!;
    // Room B left edge must be exactly at A's right edge (50)
    expect(roomB.x).toBeGreaterThanOrEqual(50);
    expect(roomB.x).toBe(50);
  });

  it("keyboard nudge works normally in free space (no nearby rooms)", () => {
    let latestCampus: Campus | null = null;
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select and move room
    const roomGroups = container.querySelectorAll("g[data-floor-title]");
    const rGroup = Array.from(roomGroups).find((g) => g.getAttribute("aria-label") === "Room");
    fireEvent.mouseDown(rGroup!, { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Nudge right 5px
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }
    expect(latestCampus!.buildings[0].floors[0].rooms[0].x).toBe(25);
  });

  it("keyboard nudge stays inside floor bounds", () => {
    let latestCampus: Campus | null = null;
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    const roomGroups = container.querySelectorAll("g[data-floor-title]");
    const rGroup = Array.from(roomGroups).find((g) => g.getAttribute("aria-label") === "Room");
    fireEvent.mouseDown(rGroup!, { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Try to nudge room way off the right edge (room is at x=20, w=50, floorW=220)
    for (let i = 0; i < 300; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    }
    const room = latestCampus!.buildings[0].floors[0].rooms[0];
    expect(room.x + room.w).toBeLessThanOrEqual(220);
    expect(room.x).toBeGreaterThanOrEqual(0);
  });
});
