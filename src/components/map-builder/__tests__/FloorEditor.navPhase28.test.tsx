import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── Fixtures (mirror the other navPhase suites) ──────────────────────────────

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
          {
            id: "f1",
            buildingId: "b1",
            number: 1,
            label: "Ground Floor",
            canvasW: 220,
            canvasH: 160,
            rooms: [],
            walls: [],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
            paths: [],
          },
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

/** Horizontal wall across the floor (y=70, x 40..140) — the Phase 2 wall fixtures use this. */
function withWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  return next;
}

/** A wall-attached Door with a connected derived nav anchor. */
function withLinkedDoor(campus: Campus): Campus {
  const next = withWall(campus);
  next.buildings[0].floors[0].doors = [
    { id: "door-linked", x: 70, y: 70, width: 20, direction: "left", color: "#b45309", wallId: "w1", offset: 0.3 },
  ];
  next.navNodes = [
    { id: "door-linked-node", name: "Door", type: "door", x: 70, y: 70, campusId: "c1", buildingId: "b1", floorId: "f1", doorId: "door-linked", accessible: true, emergencySafe: true, color: "#b45309" },
    { id: "door-linked-waypoint", name: "Waypoint", type: "hallway", x: 100, y: 45, campusId: "c1", buildingId: "b1", floorId: "f1", accessible: true, emergencySafe: true, color: "#16a34a" },
  ];
  next.navEdges = [
    { id: "door-linked-edge", startNodeId: "door-linked-node", endNodeId: "door-linked-waypoint", distance: 30, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 3 },
  ];
  return next;
}

/** Ramp (170,20,24x12 → center 182,26). */
function withRamp(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].ramps = [{ id: "rmp1", x: 170, y: 20, width: 24, height: 12, label: "Ramp", direction: "both", handrails: true, slope: "gentle", accessible: true }];
  return next;
}

/** Pre-authored segmented edge: n1(40,40) ─ n2(100,40) ─ n3(160,40) ─ n4(160,120). */
function withSegmentedEdge(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.navNodes = [
    { id: "n1", name: "Waypoint", type: "hallway", x: 40, y: 40, campusId: "c1", buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "n2", name: "Waypoint", type: "hallway", x: 100, y: 40, campusId: "c1", buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "n3", name: "Waypoint", type: "hallway", x: 160, y: 40, campusId: "c1", buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "n4", name: "Waypoint", type: "hallway", x: 160, y: 120, campusId: "c1", buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
  ];
  next.navEdges = [
    { id: "e1", startNodeId: "n1", endNodeId: "n4", distance: 200, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4, bendPoints: [{ x: 100, y: 40 }, { x: 160, y: 40 }] },
  ];
  return next;
}

// ── Harness ──────────────────────────────────────────────────────────────────

function Harness({ onCampusChange, initialCampus = makeBaseCampus() }: {
  onCampusChange?: (c: Campus) => void;
  initialCampus?: Campus;
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
      onSave={async () => campus}
    />
  );
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

function clickCanvas(container: HTMLElement, x: number, y: number) {
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(svg, { clientX: x, clientY: y, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  return svg;
}

function navNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
}

function navEdges(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]'));
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

function placeWaypoint(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, x, y);
}

function connectNodes(container: HTMLElement, a: SVGGElement, ax: number, ay: number, b: SVGGElement, bx: number, by: number) {
  const svg = stubSvgRect(container);
  fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
  fireEvent.mouseDown(a, { clientX: ax, clientY: ay, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  fireEvent.mouseDown(b, { clientX: bx, clientY: by, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function allAxisAligned(pts: number[][]): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] !== pts[i - 1][0] && pts[i][1] !== pts[i - 1][1]) return false;
  }
  return true;
}

function polylinePts(edge: Element): number[][] {
  return (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
}

describe("B5 Phase 2.8 — Wall-Aware Connector + Connect Empty-Click + Temp Undo + Alignment + Segment Drag", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;
  let toastInfoSpy: ReturnType<typeof vi.spyOn>;
  let toastWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    toastInfoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    toastWarnSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
    onCampusChange = vi.fn();
    const rendered = render(<Harness onCampusChange={onCampusChange} />);
    container = rendered.container;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // ── 1. CONNECT EMPTY-CLICK BEFORE A START DOES NOTHING ──

  it("Connect + empty floor before a start creates NO waypoint/node/history", () => {
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 90, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(0);
    expect(navEdges(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
  });

  // ── 2. WALL-AWARE ORTHOGONAL CONNECTOR ──

  it("connects from a wall-edge node toward OPEN SPACE (vertical-first), not along the wall", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    // A sits exactly ON the wall (y=70); B is below-right at open floor.
    placeWaypoint(container, 70, 70);
    placeWaypoint(container, 140, 120);
    connectNodes(container, navNodes(container)[0], 70, 70, navNodes(container)[1], 140, 120);
    expect(navEdges(container)).toHaveLength(1);
    const edge = navEdges(container)[0];
    // The committed connector must leave the wall FIRST (vertical down at x=70),
    // then run horizontally — the wall-hugging horizontal-first L is rejected.
    const pts = polylinePts(edge);
    expect(pts[0]).toEqual([70, 70]);
    expect(pts[1]).toEqual([70, 120]);
    expect(pts[pts.length - 1]).toEqual([140, 120]);
    expect(allAxisAligned(pts)).toBe(true);
    const data = latestCampus(onCampusChange);
    expect(data.navEdges[0].bendPoints).toEqual([{ x: 70, y: 120 }]);
  });

  it("rejects a connection with NO safe orthogonal geometry instead of drawing through the wall", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    // Vertical pair crossing the wall — neither L can avoid it.
    placeWaypoint(container, 70, 30);
    placeWaypoint(container, 70, 120);
    connectNodes(container, navNodes(container)[0], 70, 30, navNodes(container)[1], 70, 120);
    expect(navEdges(container)).toHaveLength(0);
  });

  it("a door opening remains a valid wall passage", () => {
    cleanup();
    const campus = withWall(makeBaseCampus());
    campus.buildings[0].floors[0].doors = [
      { id: "d1", x: 70, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.3 },
    ];
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 70, 30);
    placeWaypoint(container, 70, 120);
    connectNodes(container, navNodes(container)[0], 70, 30, navNodes(container)[1], 70, 120);
    expect(navEdges(container)).toHaveLength(1);
  });

  // ── 3. TEMPORARY CTRL+Z DURING ACTIVE CONNECT ──

  it("Ctrl+Z during active Connect pops the last pinned bend, then cancels — no history", () => {
    enterNavigationMode();
    placeWaypoint(container, 30, 30);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelectorAll('[data-testid="nav-connect-pin"]').length).toBeGreaterThanOrEqual(2);
    // Ctrl+Z pops the LAST pinned bend only (temporary geometry, no history).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, bubbles: true });
    expect(container.querySelectorAll('[data-testid="nav-connect-pin"]').length).toBeGreaterThanOrEqual(1);
    expect(navEdges(container)).toHaveLength(0);
    // Ctrl+Z again with only the start active → cancels the unfinished connection.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, bubbles: true });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, bubbles: true });
    expect(screen.queryByTestId("floor-nav-connect-preview")).toBeNull();
    expect(navEdges(container)).toHaveLength(0);
    // No undo of unrelated history: the single waypoint stays, no edge created.
    expect(navNodes(container)).toHaveLength(1);
  });

  it("a COMMITTED connect remains one normal history action (undo removes the edge)", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 140, 60);
    connectNodes(container, navNodes(container)[0], 40, 40, navNodes(container)[1], 140, 60);
    expect(navEdges(container)).toHaveLength(1);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, bubbles: true });
    expect(navEdges(container)).toHaveLength(0);
    expect(navNodes(container)).toHaveLength(2); // waypoints stay — one undo restores the whole edge
  });

  // ── 4. SEGMENT DRAG — SNAPSHOT-BASED (1:1 TRACKING, NO BEND GROWTH) ──

  it("segment drag tracks the pointer 1:1 across multiple moves (no compounding)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withSegmentedEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    // Select the edge first (click), then drag the first horizontal segment down.
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 45, bubbles: true }); // +5
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 50, bubbles: true }); // +10 total
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges.find((e) => e.id === "e1")!;
    // Exactly +10 (never +5 then +10 compounded), no extra corners.
    expect(edge.bendPoints).toEqual([{ x: 40, y: 50 }, { x: 100, y: 50 }, { x: 160, y: 40 }]);
  });

  it("interior segment drag preserves the bend count (no manufactured corners)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withSegmentedEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Interior horizontal segment (100,40)→(160,40): drag down 20.
    fireEvent.mouseDown(hit, { clientX: 130, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 130, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges.find((e) => e.id === "e1")!;
    expect(edge.bendPoints).toEqual([{ x: 100, y: 60 }, { x: 160, y: 60 }]);
  });

  it("boundary segment drag creates only the minimum required corner once", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withSegmentedEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Last segment (160,40)→(160,120): drag right 20 — one corner, not one per frame.
    fireEvent.mouseDown(hit, { clientX: 160, clientY: 80, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 170, clientY: 80, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 180, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges.find((e) => e.id === "e1")!;
    expect(edge.bendPoints).toEqual([{ x: 100, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 120 }]);
  });

  // ── 5. BEND DRAG REMAINS CORRECT ──

  it("bend drag still reshapes the path naturally and normalizes collinear results", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withSegmentedEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    // Select the edge, then grab bend index 0 (100,40).
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const bend = container.querySelector('[data-testid="nav-bend-handle"]') as Element;
    fireEvent.mouseDown(bend, { clientX: 100, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges.find((e) => e.id === "e1")!;
    expect(edge.bendPoints).toEqual([{ x: 120, y: 40 }, { x: 160, y: 40 }]);
  });

  // ── 6. ALWAYS-ON ALIGNMENT GUIDES ──

  it("bend drag near another bend's Y center snaps and shows a guide", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withSegmentedEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Grab bend 0 (100,40) and drag it near the Y of the OTHER bend (160,40)?? —
    // they share y already; instead drag toward x=160,y=120 target alignment.
    const bend = container.querySelector('[data-testid="nav-bend-handle"]') as Element;
    fireEvent.mouseDown(bend, { clientX: 100, clientY: 40, bubbles: true });
    // Drag toward bend 1 (x=160) — within the 8-unit snap threshold → snaps to x=160.
    fireEvent.mouseMove(svg, { clientX: 156, clientY: 42, bubbles: true });
    expect(container.querySelectorAll('[data-testid="nav-align-guide"]').length).toBeGreaterThan(0);
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelectorAll('[data-testid="nav-align-guide"]').length).toBe(0);
    const edge = latestCampus(onCampusChange).navEdges.find((e) => e.id === "e1")!;
    expect(edge.bendPoints[0].x).toBe(160);
  });

  it("nav-linked Door drag aligns its derived anchor to the connected node", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withLinkedDoor(makeBaseCampus())} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    const door = screen.getByTestId("attached-door-opening-symbol");
    fireEvent.mouseDown(door, { clientX: 70, clientY: 70, bubbles: true });
    // The connected waypoint is x=100; x=96 is within the shared 8-unit
    // navAlignSnap tolerance and should move the physical Door, not its node.
    fireEvent.mouseMove(svg, { clientX: 96, clientY: 70, bubbles: true });
    expect(container.querySelectorAll('[data-testid="nav-align-guide"]').length).toBeGreaterThan(0);
    fireEvent.mouseUp(svg, { bubbles: true });
    const latest = latestCampus(onCampusChange);
    expect(latest.buildings[0].floors[0].doors[0].x).toBe(100);
    expect(latest.navEdges[0].startNodeId).toBe("door-linked-node");
    expect(latest.navEdges[0].endNodeId).toBe("door-linked-waypoint");
  });

  // ── 7. CONNECT TARGET VISUALS + RAMP REGRESSION ──

  it("Connect target shows no conflicting yellow highlight for a linked object", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 182, 26); // link the ramp
    fireEvent.keyDown(window, { key: "Escape" });
    const linked = container.querySelector('[data-testid="nav-linked-node"]') as SVGGElement;
    expect(linked).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    const svg = stubSvgRect(container);
    // Hover the ramp body (its node is at the exact center 182,26).
    fireEvent.mouseMove(svg, { clientX: 182, clientY: 26, bubbles: true });
    fireEvent.mouseEnter(linked);
    // The violet ring is the ONE target cue; the yellow physical highlight never shows.
    expect(screen.getByTestId("nav-connect-target")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-target")).toBeNull();
  });

  it("Ramp logical anchor stays the exact transformed center (regression)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 182, 26);
    const node = latestCampus(onCampusChange).navNodes.find((n) => n.rampId === "rmp1")!;
    expect(node.x).toBe(182);
    expect(node.y).toBe(26);
  });

  // ── 8. PAN / VIEW REGRESSION ──

  it("navigation Pan still works and never dirties the draft", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    const svg = stubSvgRect(container);
    const callsBefore = onCampusChange.mock.calls.length;
    // The Navigation toolbar's Pan has a unique aria-label (the Design toolbar
    // also exposes a /Pan/ button, so scope the query to the nav toolbar).
    const navBar = container.querySelector('[data-testid="floor-nav-toolbar"]') as HTMLElement;
    fireEvent.click(within(navBar).getByRole("button", { name: "Pan the floor canvas" }));
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 60, buttons: 1, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 80, clientY: 70, buttons: 1, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    expect(navNodes(container)).toHaveLength(1);
  });
});
