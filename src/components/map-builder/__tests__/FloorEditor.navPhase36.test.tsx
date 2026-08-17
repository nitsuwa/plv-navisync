import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { replaceBuildingFloorsAndReconcileTransitions } from "../../../lib/indoorNavigationGraph";
import { ENTRANCE_TRANSITION_EDGE_TYPE } from "../../../lib/entranceTransitions";
import type { Campus } from "../types";

// ── B5 Phase 3.2 — canonical floor order + non-blocking nav empty-state + ───
//    circulation quick-link authoring ─────────────────────────────────────────

function makeBaseCampus(): Campus {
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

/** A floor with one (or two) physical stairs that are NOT yet linked. */
function withUnlinkedStairs(campus: Campus, stairs: unknown[]): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].stairs = stairs as Campus["buildings"][number]["floors"][number]["stairs"];
  return next;
}

function physicalObjectsCampus(): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].floors[0] = {
    ...campus.buildings[0].floors[0],
    rooms: [{ id: "room-101", x: 20, y: 20, w: 70, h: 45, type: "classroom", name: "Room 101", color: "#dbeafe" }],
    doors: [{ id: "door-101", x: 105, y: 45, width: 18, direction: "left", color: "#d97706", label: "North Door" }],
  };
  return campus;
}

function doorLinkedToEntranceCampus(): Campus {
  const campus = physicalObjectsCampus();
  campus.buildings[0].entrances = [
    { id: "ent-main", name: "Main Entrance", type: "general", edge: "bottom", offset: 0.5, accessible: true, isPrimary: true },
  ];
  campus.navNodes = [
    { id: "door-node-101", name: "North Door", type: "hallway", x: 105, y: 45, buildingId: "b1", floorId: "f1", doorId: "door-101", accessible: true, color: "#16a34a" },
    { id: "free-node-1", name: "Waypoint", type: "hallway", x: 145, y: 45, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "entrance-node-1", name: "Main Entrance", type: "entrance", x: 160, y: 180, buildingId: "b1", entranceId: "ent-main", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "walk-edge-1", startNodeId: "door-node-101", endNodeId: "free-node-1", distance: 40, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway" },
    { id: "entrance-edge-1", startNodeId: "entrance-node-1", endNodeId: "door-node-101", distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: ENTRANCE_TRANSITION_EDGE_TYPE },
  ];
  return campus;
}

function duplicateDoorLinkedCampus(): Campus {
  const campus = doorLinkedToEntranceCampus();
  campus.navNodes = [
    ...campus.navNodes,
    { id: "door-node-101-dupe", name: "North Door Duplicate", type: "hallway", x: 106, y: 45, buildingId: "b1", floorId: "f1", doorId: "door-101", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    ...campus.navEdges,
    { id: "walk-edge-dupe", startNodeId: "door-node-101-dupe", endNodeId: "free-node-1", distance: 39, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway" },
  ];
  return campus;
}

function twoFloorTwoStairCampus(): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].circulationGroups = [
    { id: "east-stair", buildingId: "b1", kind: "stair", name: "East Stair" },
    { id: "west-stair", buildingId: "b1", kind: "stair", name: "West Stair" },
    { id: "main-elevator", buildingId: "b1", kind: "elevator", name: "Main Elevator" },
  ];
  campus.buildings[0].floors = [
    {
      id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160,
      rooms: [], walls: [], doors: [], windows: [], furniture: [],
      stairs: [
        { id: "st-east-1", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "up", label: "East Stair", sharedId: "east-stair" },
        { id: "st-west-1", x: 80, y: 30, width: 20, height: 16, rotation: 0, direction: "up", label: "West Stair", sharedId: "west-stair" },
      ],
      ramps: [],
      elevators: [{ id: "el-main-1", x: 130, y: 30, width: 18, height: 18, doorWidth: 8, label: "Main Elevator", sharedId: "main-elevator", floors: [1, 2] }],
      labels: [], paths: [],
    },
    {
      id: "f2", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160,
      rooms: [], walls: [], doors: [], windows: [], furniture: [],
      stairs: [
        { id: "st-east-2", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "down", label: "East Stair", sharedId: "east-stair" },
        { id: "st-west-2", x: 80, y: 30, width: 20, height: 16, rotation: 0, direction: "down", label: "West Stair", sharedId: "west-stair" },
      ],
      ramps: [],
      elevators: [{ id: "el-main-2", x: 130, y: 30, width: 18, height: 18, doorWidth: 8, label: "Main Elevator", sharedId: "main-elevator", floors: [1, 2] }],
      labels: [], paths: [],
    },
  ];
  campus.navNodes = [
    { id: "n-east-1", name: "East Stair", type: "stair", x: 30, y: 38, buildingId: "b1", floorId: "f1", stairId: "st-east-1", accessible: false, color: "#16a34a" },
    { id: "n-west-1", name: "West Stair", type: "stair", x: 90, y: 38, buildingId: "b1", floorId: "f1", stairId: "st-west-1", accessible: false, color: "#16a34a" },
    { id: "n-east-2", name: "East Stair", type: "stair", x: 30, y: 38, buildingId: "b1", floorId: "f2", stairId: "st-east-2", accessible: false, color: "#16a34a" },
    { id: "n-west-2", name: "West Stair", type: "stair", x: 90, y: 38, buildingId: "b1", floorId: "f2", stairId: "st-west-2", accessible: false, color: "#16a34a" },
  ];
  return replaceBuildingFloorsAndReconcileTransitions(campus, "b1", campus.buildings[0].floors);
}

function Harness({ onCampusChange, initialCampus = makeBaseCampus(), floorId = "f1" }: {
  onCampusChange?: (c: Campus) => void;
  initialCampus?: Campus;
  floorId?: string;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId={floorId}
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onSave={async () => campus}
    />
  );
}

function OuterReorderHarness({ onCampusChange, initialCampus, floorId = "f3" }: {
  onCampusChange?: (c: Campus) => void;
  initialCampus: Campus;
  floorId?: string;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  const updateCampus = (next: Campus) => {
    onCampusChange?.(next);
    setCampus(next);
  };
  const moveF3ToCanonicalLowest = () => {
    const building = campus.buildings[0];
    const byId = new Map(building.floors.map((floor) => [floor.id, floor]));
    const floors = ["f3", "f1", "f2"].map((id) => byId.get(id)!);
    updateCampus(replaceBuildingFloorsAndReconcileTransitions(campus, "b1", floors));
  };
  return (
    <div>
      <button type="button" onClick={moveF3ToCanonicalLowest}>Outer Move Floor 3 First</button>
      <FloorEditor
        campus={campus}
        buildingId="b1"
        floorId={floorId}
        onBack={() => {}}
        onSwitchFloor={() => {}}
        onUpdate={updateCampus}
        onSave={async () => campus}
      />
    </div>
  );
}

function threeFloorCampus({ withStair = true }: { withStair?: boolean } = {}): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].floors = [
    { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
    { id: "f2", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
    {
      id: "f3", buildingId: "b1", number: 3, label: "Floor 3", canvasW: 220, canvasH: 160,
      rooms: [], walls: [], doors: [], windows: [], furniture: [],
      stairs: withStair ? [{ id: "st3", x: 40, y: 30, width: 20, height: 16, rotation: 0, direction: "down", label: "Stairs", sharedId: "stair-core-a" }] : [],
      ramps: [], elevators: [], labels: [], paths: [],
    },
  ];
  return campus;
}

function fourFloorCirculationCampus(): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].floors = [
    { id: "fa", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "sa", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "down", label: "Stairs", sharedId: "stair-s" }], ramps: [{ id: "ra", x: 30, y: 80, width: 40, height: 20, rotation: 0, direction: "both", label: "Ramp", sharedId: "ramp-r", slope: "steep" }], elevators: [{ id: "ea", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
    { id: "fb", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "sb", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-s" }], ramps: [], elevators: [{ id: "eb", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
    { id: "fc", buildingId: "b1", number: 3, label: "Floor 3", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "sc", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-s" }], ramps: [], elevators: [{ id: "ec", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
    { id: "fd", buildingId: "b1", number: 4, label: "Floor 4", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "sd", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "down", label: "Stairs", sharedId: "stair-s" }], ramps: [], elevators: [{ id: "ed", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
  ];
  campus.navNodes = [
    { id: "n-ea", name: "Elevator", type: "elevator", x: 99, y: 49, buildingId: "b1", floorId: "fa", elevatorId: "ea", accessible: true, color: "#16a34a" },
    { id: "n-eb", name: "Elevator", type: "elevator", x: 99, y: 49, buildingId: "b1", floorId: "fb", elevatorId: "eb", accessible: true, color: "#16a34a" },
    { id: "n-ec", name: "Elevator", type: "elevator", x: 99, y: 49, buildingId: "b1", floorId: "fc", elevatorId: "ec", accessible: true, color: "#16a34a" },
  ];
  return campus;
}

function manualReorderedStairCampus({ unlinkFloor3 = false }: { unlinkFloor3?: boolean } = {}): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].floors = [
    { id: "fg", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "sg", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "up", label: "Stairs", sharedId: "stair-s" }], ramps: [], elevators: [{ id: "eg", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
    { id: "f3", buildingId: "b1", number: 3, label: "Floor 3", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "s3", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-s" }], ramps: [], elevators: [{ id: "e3", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
    { id: "f2", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "s2", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-s" }], ramps: [], elevators: [{ id: "e2", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
    { id: "f4", buildingId: "b1", number: 4, label: "Floor 4", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "s4", x: 20, y: 30, width: 20, height: 16, rotation: 0, direction: "down", label: "Stairs", sharedId: "stair-s" }], ramps: [], elevators: [{ id: "e4", x: 90, y: 40, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-e", floors: [1, 2, 3, 4] }], labels: [], paths: [] },
  ];
  campus.navNodes = [
    { id: "n-sg", name: "Stairs", type: "stair", x: 30, y: 38, buildingId: "b1", floorId: "fg", stairId: "sg", accessible: false, color: "#16a34a" },
    ...(unlinkFloor3 ? [] : [{ id: "n-s3", name: "Stairs", type: "stair" as const, x: 30, y: 38, buildingId: "b1", floorId: "f3", stairId: "s3", accessible: false, color: "#16a34a" }]),
    { id: "n-s2", name: "Stairs", type: "stair", x: 30, y: 38, buildingId: "b1", floorId: "f2", stairId: "s2", accessible: false, color: "#16a34a" },
    { id: "n-s4", name: "Stairs", type: "stair", x: 30, y: 38, buildingId: "b1", floorId: "f4", stairId: "s4", accessible: false, color: "#16a34a" },
    { id: "n-eg", name: "Elevator", type: "elevator", x: 99, y: 49, buildingId: "b1", floorId: "fg", elevatorId: "eg", accessible: true, color: "#16a34a" },
    { id: "n-e3", name: "Elevator", type: "elevator", x: 99, y: 49, buildingId: "b1", floorId: "f3", elevatorId: "e3", accessible: true, color: "#16a34a" },
    { id: "n-e2", name: "Elevator", type: "elevator", x: 99, y: 49, buildingId: "b1", floorId: "f2", elevatorId: "e2", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "bad-ground-floor2", startNodeId: "n-sg", endNodeId: "n-s2", distance: 1, bidirectional: true, accessible: false, emergencySafe: true, type: "floor_transition", color: "#475569", width: 1 },
  ];
  return replaceBuildingFloorsAndReconcileTransitions(campus, "b1", campus.buildings[0].floors);
}

function canvasSvg(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find(
    (s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`
  );
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

function enterNavigationMode() {
  fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
}

/** Select a stair in Design mode by mousedown on its canvas group. */
function selectStair(container: HTMLElement, label = "Stairs") {
  const stairGroup = Array.from(container.querySelectorAll("[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === label
  ) as SVGGElement | undefined;
  expect(stairGroup).toBeTruthy();
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(stairGroup!, { bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function selectRamp(container: HTMLElement, label = "Ramp") {
  const rampGroup = Array.from(container.querySelectorAll("[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === label
  ) as SVGGElement | undefined;
  expect(rampGroup).toBeTruthy();
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(rampGroup!, { bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function selectElevator(container: HTMLElement, label = "Elevator") {
  const elevatorGroup = Array.from(container.querySelectorAll("[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === label
  ) as SVGGElement | undefined;
  expect(elevatorGroup).toBeTruthy();
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(elevatorGroup!, { bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function selectRoom(container: HTMLElement, label = "Room 101") {
  const roomGroup = Array.from(container.querySelectorAll("[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === label
  ) as SVGGElement | undefined;
  expect(roomGroup).toBeTruthy();
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(roomGroup!, { bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function selectDoor(container: HTMLElement, label = "North Door") {
  const doorGroup = Array.from(container.querySelectorAll("[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === label
  ) as SVGGElement | undefined;
  expect(doorGroup).toBeTruthy();
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(doorGroup!, { bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function linkedNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-linked-node"]')) as SVGGElement[];
}

function stairDirectionButtons() {
  const control = screen.getByTestId("stair-direction-control");
  return {
    up: within(control).getByRole("button", { name: "Up" }),
    down: within(control).getByRole("button", { name: "Down" }),
    both: within(control).getByRole("button", { name: "Both" }),
  };
}

function drawStair(container: HTMLElement) {
  const svg = stubSvgRect(container);
  fireEvent.click(screen.getByTitle("Stairs"));
  fireEvent.mouseDown(svg, { clientX: 30, clientY: 30, bubbles: true });
  fireEvent.mouseMove(svg, { clientX: 62, clientY: 54, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

describe("B5 Phase 3.2 — non-blocking nav empty-state + circulation quick-link", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
    vi.spyOn(toast, "success").mockImplementation(() => "" as never);
    onCampusChange = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the empty-state banner while idle but hides it as soon as Link Location is armed", () => {
    const campus = withUnlinkedStairs(makeBaseCampus(), [
      { id: "st1", x: 10, y: 120, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-core-a" },
    ]);
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    // Idle (Select tool) → the compact banner is present but never blocks the canvas.
    const banner = screen.getByTestId("floor-nav-canvas-empty-state");
    expect(banner).toBeTruthy();
    expect(banner.className).toContain("pointer-events-none");
    // Arming Link Location hides it immediately — the physical stair stays visible.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    expect(screen.queryByTestId("floor-nav-canvas-empty-state")).toBeNull();
  });

  it("hides the empty-state banner while the Waypoint tool is armed", () => {
    const rendered = render(<Harness initialCampus={makeBaseCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    expect(screen.getByTestId("floor-nav-canvas-empty-state")).toBeTruthy();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    expect(screen.queryByTestId("floor-nav-canvas-empty-state")).toBeNull();
  });

  it("hides the empty-state banner while the Connect tool is armed", () => {
    const rendered = render(<Harness initialCampus={makeBaseCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    expect(screen.getByTestId("floor-nav-canvas-empty-state")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    expect(screen.queryByTestId("floor-nav-canvas-empty-state")).toBeNull();
  });

  it("reordering floors revalidates an existing Stair's direction immediately", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors = [
      { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [{ id: "st1", x: 10, y: 120, width: 20, height: 16, rotation: 0, direction: "up", label: "Stairs", sharedId: "stair-core-a" }], ramps: [], elevators: [], labels: [], paths: [] },
      { id: "f2", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
      { id: "f3", buildingId: "b1", number: 3, label: "Floor 3", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
    ];
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    container = rendered.container;
    // Active floor f1 is the LOWEST — a stair with direction "up" is valid here.
    selectStair(container);
    expect(screen.queryByTestId("stair-direction-invalid")).toBeNull();
    // Move the active floor DOWN twice via the shared actions menu: f1 becomes
    // the HIGHEST floor, where "up" is impossible.
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(screen.getByTestId("floor-actions-menu")).getByRole("button", { name: "Move Down" }));
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(within(screen.getByTestId("floor-actions-menu")).getByRole("button", { name: "Move Down" }));
    // Canonical array order is now [Floor 2, Floor 3, Ground Floor] — Ground is
    // HIGHEST, so the existing "up" direction is flagged invalid immediately.
    expect(latestCampus(onCampusChange).buildings[0].floors.map((f) => f.label)).toEqual(["Floor 2", "Floor 3", "Ground Floor"]);
    expect(screen.getByTestId("stair-direction-invalid")).toBeTruthy();
  });

  it("outer hierarchy reorder immediately revalidates an existing stored Stair direction without overwriting it", () => {
    const rendered = render(<OuterReorderHarness initialCampus={threeFloorCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    selectStair(container);
    expect(stairDirectionButtons().down).not.toBeDisabled();
    expect(screen.queryByTestId("stair-direction-invalid")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Outer Move Floor 3 First" }));

    expect(screen.getByTestId("stair-direction-invalid")).toBeTruthy();
    expect(stairDirectionButtons().up).not.toBeDisabled();
    expect(stairDirectionButtons().down).toBeDisabled();
    const latest = latestCampus(onCampusChange);
    const floor3 = latest.buildings[0].floors.find((floor) => floor.id === "f3")!;
    expect(floor3.stairs[0].direction).toBe("down");
  });

  it("new Stairs after an outer hierarchy reorder use the canonical default for the reordered floor", () => {
    const rendered = render(<OuterReorderHarness initialCampus={threeFloorCampus({ withStair: false })} onCampusChange={onCampusChange} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Outer Move Floor 3 First" }));

    drawStair(container);

    const latest = latestCampus(onCampusChange);
    const floor3 = latest.buildings[0].floors.find((floor) => floor.id === "f3")!;
    expect(floor3.stairs).toHaveLength(1);
    expect(floor3.stairs[0].direction).toBe("up");
  });

  it("Add to Navigation links the selected stair through the SAME node logic (centered anchor, stair defaults)", () => {
    const campus = withUnlinkedStairs(makeBaseCampus(), [
      { id: "st1", x: 10, y: 120, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-core-a" },
    ]);
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    container = rendered.container;
    // Design mode: select the stair → the quick-link action appears in properties.
    selectStair(container);
    const addBtn = screen.getByRole("button", { name: /Add to Navigation/ });
    fireEvent.click(addBtn);
    const latest = latestCampus(onCampusChange);
    const node = latest.navNodes.find((n) => n.stairId === "st1");
    expect(node).toBeTruthy();
    // Same anchor Link Location would produce: the object's transformed center.
    expect(node!.x).toBe(20);
    expect(node!.y).toBe(128);
    // Stairs are not accessible by default.
    expect(node!.accessible).toBe(false);
    // Properties panel now reports Linked.
    expect(screen.getByText("Linked")).toBeTruthy();
  });

  it("Add to Navigation links a Room once, exposes View, and removes only its nav node", () => {
    const rendered = render(<Harness initialCampus={physicalObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;

    selectRoom(container);
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));
    let latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((n) => n.roomId === "room-101")).toHaveLength(1);
    expect(screen.getByText("Destination linked")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /View in Navigation/ }));
    expect(linkedNodes(container)).toHaveLength(1);
    expect(screen.getByTestId("floor-nav-node-props")).toHaveTextContent("Linked to a room");

    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    selectRoom(container);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    latest = latestCampus(onCampusChange);
    expect(latest.navNodes.some((n) => n.roomId === "room-101")).toBe(false);
    expect(latest.buildings[0].floors[0].rooms.some((r) => r.id === "room-101")).toBe(true);
  });

  it("Add to Navigation links a Door once and Link Location on it does not duplicate", () => {
    const rendered = render(<Harness initialCampus={physicalObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;

    selectDoor(container);
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));
    let latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((n) => n.doorId === "door-101")).toHaveLength(1);
    expect(screen.getByText("Navigation entry linked")).toBeTruthy();

    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-link"));
    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 105, clientY: 45, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });

    latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((n) => n.doorId === "door-101")).toHaveLength(1);
    expect(toast.info).toHaveBeenCalledWith(
      "Already added to navigation",
      expect.objectContaining({ description: "This location already has a navigation point." })
    );
  });

  it("Remove from Navigation removes a Door node, touching edges, and its entrance transition without deleting the Door", async () => {
    const rendered = render(<Harness initialCampus={doorLinkedToEntranceCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;

    selectDoor(container);
    expect(screen.getByText("Navigation entry linked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));

    const latest = latestCampus(onCampusChange);
    expect(latest.buildings[0].floors[0].doors.some((door) => door.id === "door-101")).toBe(true);
    expect(latest.navNodes.some((node) => node.doorId === "door-101")).toBe(false);
    expect(latest.navNodes.some((node) => node.entranceId === "ent-main")).toBe(true);
    expect(latest.navEdges.some((edge) => edge.startNodeId === "door-node-101" || edge.endNodeId === "door-node-101")).toBe(false);
    expect(latest.navEdges.some((edge) => edge.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toBe(false);
    await waitFor(() => expect(screen.getByText("Not linked")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Add to Navigation/ })).toBeTruthy();
  });

  it("one Remove click clears duplicate Door nav nodes from legacy state", async () => {
    const rendered = render(<Harness initialCampus={duplicateDoorLinkedCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;

    selectDoor(container);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));

    const latest = latestCampus(onCampusChange);
    expect(latest.buildings[0].floors[0].doors.some((door) => door.id === "door-101")).toBe(true);
    expect(latest.navNodes.filter((node) => node.doorId === "door-101")).toHaveLength(0);
    expect(latest.navEdges.some((edge) => edge.startNodeId.includes("door-node-101") || edge.endNodeId.includes("door-node-101"))).toBe(false);
    expect(latest.navEdges.some((edge) => edge.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toBe(false);
    await waitFor(() => expect(screen.getByText("Not linked")).toBeTruthy());
  });

  it("Door Add then Remove can repeat without accumulating nodes", async () => {
    const rendered = render(<Harness initialCampus={physicalObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;

    selectDoor(container);
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));
    let latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((node) => node.doorId === "door-101")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((node) => node.doorId === "door-101")).toHaveLength(0);
    await waitFor(() => expect(screen.getByText("Not linked")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));
    latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((node) => node.doorId === "door-101")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((node) => node.doorId === "door-101")).toHaveLength(0);
    await waitFor(() => expect(screen.getByText("Not linked")).toBeTruthy());
  });

  it("links ONLY the selected object — an unrelated unselected stair is never auto-linked", () => {
    const campus = withUnlinkedStairs(makeBaseCampus(), [
      { id: "st1", x: 10, y: 120, width: 20, height: 16, rotation: 0, direction: "both", label: "Stair A", sharedId: "stair-core-a" },
      { id: "st2", x: 120, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stair B", sharedId: "stair-core-b" },
    ]);
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    container = rendered.container;
    selectStair(container, "Stair A");
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));
    const latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((n) => n.stairId === "st1")).toHaveLength(1);
    // The unselected stair got NO node — Link Location stays the intentional path.
    expect(latest.navNodes.some((n) => n.stairId === "st2")).toBe(false);
  });

  it("Add to Navigation links a Ramp as a local accessible path anchor without floor transitions", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors = [
      {
        ...campus.buildings[0].floors[0],
        ramps: [{ id: "r1", x: 30, y: 50, width: 40, height: 20, rotation: 0, direction: "both", label: "Ramp", sharedId: "ramp-a" }],
      },
      {
        id: "f2", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160,
        rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [],
        ramps: [{ id: "r2", x: 60, y: 70, width: 40, height: 20, rotation: 0, direction: "both", label: "Ramp", sharedId: "ramp-a" }],
        elevators: [], labels: [], paths: [],
      },
    ];
    campus.navNodes = [
      { id: "n2", name: "Ramp", type: "ramp", x: 80, y: 80, buildingId: "b1", floorId: "f2", rampId: "r2", accessible: true, color: "#16a34a" },
    ];
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    container = rendered.container;

    selectRamp(container);
    expect(screen.getByText(/accessible path anchor/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));

    const latestRampCampus = latestCampus(onCampusChange);
    const node = latestRampCampus.navNodes.find((n) => n.rampId === "r1");
    expect(node).toBeTruthy();
    expect(node!.x).toBe(50);
    expect(node!.y).toBe(60);
    expect(node!.accessible).toBe(true);
    expect(latestRampCampus.navEdges.filter((e) => e.type === "floor_transition")).toHaveLength(0);
    expect(screen.queryByText(/Connected to/)).toBeNull();
  });

  it("Waypoint and Destination placement on an existing node are rejected without stacking duplicates", () => {
    const rendered = render(<Harness initialCampus={makeBaseCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    enterNavigationMode();

    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    fireEvent.mouseDown(svg, { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    let latest = latestCampus(onCampusChange);
    expect(latest.navNodes).toHaveLength(1);

    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    fireEvent.mouseDown(svg, { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    latest = latestCampus(onCampusChange);
    expect(latest.navNodes).toHaveLength(1);
    expect(screen.getByTestId("nav-duplicate-node-warning")).toBeTruthy();

    fireEvent.click(screen.getByTestId("nav-library-destination"));
    fireEvent.mouseDown(svg, { clientX: 51, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    latest = latestCampus(onCampusChange);
    expect(latest.navNodes).toHaveLength(1);
    expect(toast.info).toHaveBeenCalledWith(
      "Navigation point already exists here.",
      expect.objectContaining({ description: "Delete the existing point first to replace it." })
    );

    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    fireEvent.mouseDown(svg, { clientX: 80, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    latest = latestCampus(onCampusChange);
    expect(latest.navNodes).toHaveLength(2);
  });

  it("four-floor fixture shows invalid issues semantically, clarifies Elevator served floors, and keeps Ramp simple", () => {
    const rendered = render(<Harness initialCampus={fourFloorCirculationCampus()} onCampusChange={onCampusChange} floorId="fa" />);
    container = rendered.container;

    const issuesButton = screen.getByTestId("issues-toolbar");
    expect(issuesButton).toHaveTextContent("Issues");
    // B7 Phase 1: the Floor panel now also surfaces the canonical floor-scoped
    // issues — here the orphaned elevator nav node on floor fa (1 local stair
    // direction warning + 1 canonical orphan warning = 2).
    expect(issuesButton).toHaveTextContent("2");
    expect(issuesButton.className).toContain("text-destructive");

    selectElevator(container);
    expect(screen.getByText("Served Floors")).toBeTruthy();
    expect(screen.getByText(/3 of 4 served floors added to navigation/)).toBeTruthy();
    expect(screen.getByText(/Floor 4.*Not added to navigation/)).toBeTruthy();
    expect(screen.queryByText(/Connected to Floor/)).toBeNull();

    selectRamp(container);
    expect(screen.getByText(/accessible path anchor/i)).toBeTruthy();
    expect(screen.queryByText("Slope")).toBeNull();
    expect(screen.queryByText("Shared ID")).toBeNull();
    expect(screen.queryByText("Direction")).toBeNull();
    expect(screen.queryByText("Handrails")).toBeNull();

    fireEvent.click(issuesButton);
    expect(screen.getByText(/Stair direction is invalid/)).toBeTruthy();
    // Canonical floor issue is now visible in the Floor Editor panel too.
    expect(screen.getByText(/has no navigation connections/)).toBeTruthy();
    expect(screen.queryByText("No floor issues found")).toBeNull();
    expect(screen.getByText("Floor Issues").closest(".bg-card")?.querySelector(".text-emerald-600")).toBeNull();
  });

  it("manual reordered Stair status uses only actual valid adjacent transition edges in Design and Navigation", () => {
    const campus = manualReorderedStairCampus();
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} floorId="f2" />);
    container = rendered.container;

    selectStair(container);
    expect(screen.getByText(/Connected to/)).toHaveTextContent("Floor 3");
    expect(screen.getByText(/Connected to/)).toHaveTextContent("Floor 4");
    expect(screen.getByText(/Connected to/)).not.toHaveTextContent("Ground Floor");

    enterNavigationMode();
    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 30, clientY: 38, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    const chips = screen.getAllByTestId("nav-transition-floor-chip").map((chip) => chip.textContent);
    expect(chips).toEqual(["Floor 3", "Floor 4"]);
    expect(chips).not.toContain("Ground Floor");
  });

  it("manual reordered Stair status does not skip to Ground when Floor 3 is not linked", () => {
    const campus = manualReorderedStairCampus({ unlinkFloor3: true });
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} floorId="f2" />);
    container = rendered.container;

    selectStair(container);
    expect(screen.getByText(/Connected to/)).toHaveTextContent("Floor 4");
    expect(screen.getByText(/Connected to/)).not.toHaveTextContent("Ground Floor");
    expect(screen.getByText(/Matching stair on Floor 3 is not added to navigation/i)).toBeTruthy();

    enterNavigationMode();
    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 30, clientY: 38, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    const chips = screen.getAllByTestId("nav-transition-floor-chip").map((chip) => chip.textContent);
    expect(chips).toEqual(["Floor 4"]);
    expect(chips).not.toContain("Ground Floor");
  });

  it("Elevator Design and Navigation inspector both show served-floor status, not direct edge neighbors", () => {
    const campus = manualReorderedStairCampus();
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} floorId="f2" />);
    container = rendered.container;

    selectElevator(container);
    expect(screen.getByText("Served Floors")).toBeTruthy();
    expect(screen.getByText(/3 of 4 served floors added to navigation/)).toBeTruthy();
    expect(screen.getByText(/Floor 4.*Not added to navigation/)).toBeTruthy();
    expect(screen.queryByText(/Connected floors/)).toBeNull();

    enterNavigationMode();
    fireEvent.mouseDown(linkedNodes(container)[1], { clientX: 99, clientY: 49, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    expect(screen.getByTestId("nav-elevator-served-status")).toHaveTextContent("3 of 4 served floors added to navigation");
    expect(screen.getByText(/Floor 4.*Not added to navigation/)).toBeTruthy();
    expect(screen.queryByTestId("nav-transition-status-linked")).toBeNull();
    expect(screen.queryByText(/Connected floors/)).toBeNull();
  });

  it("Stair Connection picker uses friendly groups, keeps East/West separate, and blocks duplicate same-floor assignment", () => {
    const campus = twoFloorTwoStairCampus();
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} floorId="f2" />);
    container = rendered.container;

    selectStair(container, "East Stair");
    expect(screen.getByText("Stair Connection")).toBeTruthy();
    expect(screen.queryByText("Shared ID")).toBeNull();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const picker = screen.getByTestId("circulation-group-picker");
    expect(within(picker).getByText("Stair Connections")).toBeTruthy();
    expect(within(picker).getByText(/Used on: Ground Floor, Floor 2/)).toBeTruthy();
    expect(within(picker).getByRole("button", { name: /West Stair/ })).toBeDisabled();

    const pairs = campus.navEdges.filter((e) => e.type === "floor_transition")
      .map((e) => [e.startNodeId, e.endNodeId].sort().join("|")).sort();
    expect(pairs).toEqual(["n-east-1|n-east-2", "n-west-1|n-west-2"]);
  });

  it("Stair Connection create, rename, reassign and unassign update sharedId without raw ID entry", () => {
    const campus = twoFloorTwoStairCampus();
    campus.buildings[0].floors[1].stairs[0].sharedId = undefined;
    campus.navEdges = [];
    const rendered = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} floorId="f2" />);
    container = rendered.container;

    selectStair(container, "East Stair");
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    fireEvent.click(within(screen.getByTestId("circulation-group-picker")).getByRole("button", { name: /\+ Create New Stair Connection/ }));
    fireEvent.change(screen.getByPlaceholderText("East Stair"), { target: { value: "Emergency Stair" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    let latest = latestCampus(onCampusChange);
    const createdId = latest.buildings[0].floors[1].stairs[0].sharedId;
    expect(createdId).toBeTruthy();
    expect(createdId).toMatch(/^shared_stair_/);
    expect(latest.buildings[0].circulationGroups?.find((g) => g.id === createdId)?.name).toBe("Emergency Stair");

    fireEvent.change(screen.getByPlaceholderText("Rename Emergency Stair"), { target: { value: "East Wing Stair" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    latest = latestCampus(onCampusChange);
    expect(latest.buildings[0].floors[1].stairs[0].sharedId).toBe(createdId);
    expect(latest.buildings[0].circulationGroups?.find((g) => g.id === createdId)?.name).toBe("East Wing Stair");

    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    fireEvent.click(within(screen.getByTestId("circulation-group-picker")).getByRole("button", { name: /^East Stair/ }));
    latest = latestCampus(onCampusChange);
    expect(latest.buildings[0].floors[1].stairs[0].sharedId).toBe("east-stair");

    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    fireEvent.click(within(screen.getByTestId("circulation-group-picker")).getByRole("button", { name: "Not assigned" }));
    latest = latestCampus(onCampusChange);
    expect(latest.buildings[0].floors[1].stairs[0].sharedId).toBeUndefined();
    expect(latest.navEdges.filter((e) => e.type === "floor_transition").some((e) => e.startNodeId === "n-east-2" || e.endNodeId === "n-east-2")).toBe(false);
  });

  it("Elevator Shaft picker is friendly and cannot list Stair Connection groups", () => {
    const rendered = render(<Harness initialCampus={twoFloorTwoStairCampus()} onCampusChange={onCampusChange} floorId="f2" />);
    container = rendered.container;

    selectElevator(container, "Main Elevator");
    expect(screen.getByText("Elevator Shaft")).toBeTruthy();
    expect(screen.queryByText("Shared ID")).toBeNull();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    const picker = screen.getByTestId("circulation-group-picker");
    expect(within(picker).getByText("Elevator Shafts")).toBeTruthy();
    expect(within(picker).getByRole("button", { name: /Main Elevator/ })).toBeTruthy();
    expect(within(picker).queryByRole("button", { name: /East Stair/ })).toBeNull();
  });
});
