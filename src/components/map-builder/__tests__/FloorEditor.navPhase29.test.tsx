import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus, NavigationNode } from "../types";

// ── B5 Phase 2.9 — single-click Connect bend UX + floor-scope isolation ─────

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
          { id: "f2", buildingId: "b1", number: 2, label: "Second Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
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

function freeNode(id: string, x: number, y: number, floorId: string): NavigationNode {
  return { id, name: "Waypoint", type: "hallway", x, y, campusId: "c1", buildingId: "b1", floorId, accessible: true, color: "#16a34a" };
}

/** Horizontal wall across the floor (y=70, x 40..140) — same fixture as Phase 2.8. */
function withWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  return next;
}

/** Ramp (170,20,24x12 → center 182,26). */
function withRamp(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].ramps = [{ id: "rmp1", x: 170, y: 20, width: 24, height: 12, label: "Ramp", direction: "both", handrails: true, slope: "gentle", accessible: true }];
  return next;
}

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

function pinMarkers(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-connect-pin"]'));
}

function previewPolyline(container: HTMLElement): number[][] {
  const el = screen.getByTestId("floor-nav-connect-preview").querySelector("polyline");
  return (el?.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
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

function polylinePts(edge: Element): number[][] {
  return (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
}

describe("B5 Phase 2.9 — single-click Connect bend UX", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
    onCampusChange = vi.fn();
    const rendered = render(<Harness onCampusChange={onCampusChange} />);
    container = rendered.container;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("ONE empty click pins the FULL L shape (corner + click point) — no confirmation click", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // ONE empty-space click at (100,90) — resolved L: (100,40) corner + click.
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // The click is ALREADY pinned: corner + click point, no second click needed.
    expect(pinMarkers(container)).toHaveLength(2);
    const coords = pinMarkers(container).map((m) => [Number(m.getAttribute("x")) + 1.75, Number(m.getAttribute("y")) + 1.75]);
    expect(coords).toContainEqual([100, 40]);
    expect(coords).toContainEqual([100, 90]);
    // No NavigationNode was created by the empty click.
    expect(navNodes(container)).toHaveLength(1);
    expect(navEdges(container)).toHaveLength(0);
  });

  it("the pointer preview immediately continues from the newly pinned click point", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Move toward the destination — the preview must start from the pinned
    // click point (100,90), not from the corner alone.
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 120, bubbles: true });
    const pts = previewPolyline(container);
    expect(pts).toContainEqual([100, 90]);
    // No extra pins were added by the pointer move (still exactly one click).
    expect(pinMarkers(container)).toHaveLength(2);
  });

  it("destination click commits ONE edge carrying every pinned bend (preview == commit)", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 160, 120);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Preview toward the destination node shows the exact committed shape.
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 120, bubbles: true });
    const preview = previewPolyline(container);
    // Finish on the destination node.
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 160, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const data = latestCampus(onCampusChange);
    expect(data.navNodes).toHaveLength(2); // no phantom nodes
    // Preview geometry === committed geometry (bends normalized).
    expect(data.navEdges[0].bendPoints).toEqual([{ x: 100, y: 40 }, { x: 100, y: 90 }, { x: 160, y: 90 }]);
    const committed = polylinePts(navEdges(container)[0]);
    expect(committed).toEqual(preview);
  });

  it("empty click before a start still does nothing (Phase 2.8 rule preserved)", () => {
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(0);
    expect(navNodes(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(0);
  });

  it("multiple single clicks accumulate bendPoints on ONE edge", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 180, 140);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Click 1: L → (100,40) + (100,90)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Click 2: L from (100,90) → (140,90) + (140,60)
    fireEvent.mouseDown(svg, { clientX: 140, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(4);
    // Finish on the destination node.
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 180, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toEqual([{ x: 100, y: 40 }, { x: 100, y: 90 }, { x: 140, y: 90 }, { x: 140, y: 60 }, { x: 180, y: 60 }]);
  });

  it("temporary Ctrl+Z removes the WHOLE last click (corner + click point), Escape cancels", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(2);
    // Ctrl+Z pops the whole click — no stray corner marker remains.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, bubbles: true });
    expect(pinMarkers(container)).toHaveLength(0);
    expect(screen.getByTestId("floor-nav-connect-preview")).toBeTruthy(); // connection still active
    // Escape cancels the unfinished connection without history.
    fireEvent.keyDown(window, { key: "Escape", bubbles: true });
    expect(screen.queryByTestId("floor-nav-connect-preview")).toBeNull();
    expect(navEdges(container)).toHaveLength(0);
    expect(navNodes(container)).toHaveLength(1);
    expect(onCampusChange.mock.calls.length).toBe(1); // only the waypoint placement
  });

  it("the wall-safe preview equals the committed geometry (wall-side anchor)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 70, 70); // ON the wall
    placeWaypoint(container, 140, 120);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 70, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 140, clientY: 120, bubbles: true });
    const preview = previewPolyline(container);
    // The preview leaves the wall vertically first, then runs horizontally.
    expect(preview[1]).toEqual([70, 120]);
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 140, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    expect(latestCampus(onCampusChange).navEdges[0].bendPoints).toEqual([{ x: 70, y: 120 }]);
    expect(polylinePts(navEdges(container)[0])).toEqual(preview);
  });

  it("segment drag does not grow bends (immutable snapshot regression)", () => {
    cleanup();
    const campus = makeBaseCampus();
    campus.navNodes = [freeNode("n1", 40, 40, "f1"), freeNode("n2", 100, 40, "f1"), freeNode("n3", 100, 120, "f1")];
    campus.navEdges = [{
      id: "e1", startNodeId: "n1", endNodeId: "n3", distance: 200, bidirectional: true,
      accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4,
      bendPoints: [{ x: 100, y: 40 }],
    }];
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Drag the vertical segment (100,40)→(100,120) right by 20 — exactly ONE move.
    fireEvent.mouseDown(hit, { clientX: 100, clientY: 80, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 80, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges.find((e) => e.id === "e1")!;
    // Boundary segment drag: the adjacent bend translates + ONE minimal corner
    // reconnects the fixed node — no per-pointermove bend growth.
    expect(edge.bendPoints).toEqual([{ x: 120, y: 40 }, { x: 120, y: 120 }]);
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

  it("Connect targeting shows the semantic node + ONE violet ring only (no yellow competition)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 182, 26);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    const svg = stubSvgRect(container);
    const linked = container.querySelector('[data-testid="nav-linked-node"]') as SVGGElement;
    fireEvent.mouseMove(svg, { clientX: 182, clientY: 26, bubbles: true });
    fireEvent.mouseEnter(linked);
    expect(screen.getByTestId("nav-connect-target")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-target")).toBeNull();
  });
});

describe("B5 Phase 2.9 — floor-scope isolation (current floor only)", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    onCampusChange = vi.fn();
    const rendered = render(<Harness onCampusChange={onCampusChange} />);
    container = rendered.container;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function seed(): Campus {
    const campus = makeBaseCampus();
    campus.navNodes = [
      freeNode("f1a", 40, 40, "f1"),
      freeNode("f1b", 100, 40, "f1"),
      freeNode("f2a", 60, 60, "f2"),           // ANOTHER floor's node
      { id: "o1", name: "Outdoor", type: "outdoor", x: 150, y: 150, campusId: "c1", accessible: true, color: "#16a34a" }, // outdoor node
    ];
    campus.navEdges = [
      { id: "ef1", startNodeId: "f1a", endNodeId: "f1b", distance: 60, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a", width: 4 },
      { id: "ef2", startNodeId: "f2a", endNodeId: "f2a", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a", width: 4 }, // other floor
      { id: "ex", startNodeId: "f1a", endNodeId: "o1", distance: 10, bidirectional: true, accessible: true, type: "hallway", color: "#16a34a", width: 4 }, // cross-scope
    ];
    return campus;
  }

  it("renders ONLY the current floor's nodes — another floor's nodes and outdoor nodes never leak", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={seed()} />);
    container = rendered.container;
    enterNavigationMode();
    expect(navNodes(container)).toHaveLength(2); // f1a + f1b only
    const coords = navNodes(container).map((g) => {
      const c = g.querySelector("circle");
      return c ? `${c.getAttribute("cx")},${c.getAttribute("cy")}` : "";
    });
    expect(coords).toEqual(["40,40", "100,40"]);
  });

  it("renders ONLY the current floor's edges", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={seed()} />);
    container = rendered.container;
    enterNavigationMode();
    expect(navEdges(container)).toHaveLength(1);
  });
});
