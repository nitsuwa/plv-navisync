import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus, FloorRoom } from "../types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

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

const TEST_ROOM: FloorRoom = { id: "r1", name: "Lecture Hall", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" };

function withRoom(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].rooms = [TEST_ROOM];
  return next;
}

function withWallAndDoor(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  next.buildings[0].floors[0].doors = [
    { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
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

// ── Canvas helpers (1:1 viewBox mapping like the other floor tests) ─────────

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

function contentTransform(container: HTMLElement): string {
  const g = container.querySelector("svg g[transform]");
  expect(g, "content group").toBeTruthy();
  return g!.getAttribute("transform")!;
}

function parseCamera(transform: string): { x: number; y: number; z: number } {
  const m = transform.match(/translate\((-?[\d.]+),\s*(-?[\d.]+)\)\s*scale\(([\d.]+)\)/);
  expect(m, `parse camera from ${transform}`).toBeTruthy();
  return { x: Number(m![1]), y: Number(m![2]), z: Number(m![3]) };
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

function navNodeHits(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node-hit"]')) as SVGCircleElement[];
}

function navLinkedNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-linked-node"]')) as SVGGElement[];
}

function navEdges(container: HTMLElement): SVGLineElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]')) as SVGLineElement[];
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

function nodeAt(container: HTMLElement, x: number, y: number): SVGGElement {
  const g = navNodes(container).find((el) => {
    const hit = el.querySelector('[data-testid="nav-node-hit"]') as SVGCircleElement | null;
    return hit && Number(hit.getAttribute("cx")) === x && Number(hit.getAttribute("cy")) === y;
  });
  expect(g, `node at ${x},${y}`).toBeTruthy();
  return g!;
}

/** Create a free waypoint at (x,y) with the Add Waypoint tool. */
function placeWaypoint(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, x, y);
}

/** Ctrl+wheel zoom (clientX/Y dropped by jsdom wheel path). */
function fireWheel(el: Element, x: number, y: number, deltaY: number) {
  const ev = createEvent.wheel(el, { deltaY, ctrlKey: true }) as unknown as Record<string, unknown>;
  Object.defineProperty(ev, "clientX", { configurable: true, value: x });
  Object.defineProperty(ev, "clientY", { configurable: true, value: y });
  fireEvent(el, ev as Event);
}

async function settleCamera(target: HTMLElement) {
  await waitFor(async () => {
    const a = contentTransform(target);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(contentTransform(target)).toBe(a);
  });
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("B5 Phase 2.2 — Indoor Navigation UX Simplification + Interaction Fixes", () => {
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

  // ── MODE TRANSITION ──

  it("Design ↔ Navigation keeps the canvas mounted and preserves zoom/pan", async () => {
    const svg = stubSvgRect(container);
    // Let the mount auto-fit settle, then zoom so the camera is non-trivial.
    await settleCamera(container);
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    await settleCamera(container);
    const before = contentTransform(container);
    enterNavigationMode();
    await settleCamera(container);
    expect(contentTransform(container)).toBe(before);
    expect(canvasSvg(container)).toBe(svg);
    // And back.
    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    await settleCamera(container);
    expect(contentTransform(container)).toBe(before);
    expect(canvasSvg(container)).toBe(svg);
  });

  it("Navigation entry does not auto-open a verbose Properties sidebar", () => {
    enterNavigationMode();
    // No tutorial panel, no auto-opened properties.
    expect(screen.queryByTestId("floor-nav-empty-state")).toBeNull();
    expect(screen.queryByTestId("floor-nav-node-props")).toBeNull();
  });

  // ── SELECTION: click + drag ──

  it("clicking a free Waypoint directly selects it (no marquee required)", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 50);
    const svg = stubSvgRect(container);
    // Click directly on the node's transparent hit target.
    fireEvent.mouseDown(nodeAt(container, 60, 50), { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="nav-node-selected"]')).toHaveLength(1);
  });

  it("every nav node renders an invisible hit target for click/drag", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    expect(navNodeHits(container)).toHaveLength(2);
    for (const hit of navNodeHits(container)) {
      expect(hit.getAttribute("fill")).toBe("transparent");
    }
  });

  it("click selection works under zoom (hit target on the node element)", async () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 50);
    stubSvgRect(container);
    await settleCamera(container);
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    await settleCamera(container);
    const svg = stubSvgRect(container);
    // The node element is inside the camera transform — jsdom has no real SVG
    // hit-testing, so dispatch the pointer directly on the node's hit circle
    // (which is what a browser hits at this screen position).
    fireEvent.mouseDown(nodeAt(container, 60, 50), { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
  });

  it("dragging a free Waypoint moves it, edges follow, and it is one history action", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    // Connect the two.
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const beforeDrag = latestCampus(onCampusChange);
    const draggedId = beforeDrag.navNodes.find((n) => n.x === 40 && n.y === 40)!.id;
    // Drag the first node +30/+20.
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const after = latestCampus(onCampusChange);
    const moved = after.navNodes.find((n) => n.id === draggedId)!;
    expect(moved.x).toBe(70);
    expect(moved.y).toBe(60);
    // The edge follows derived node positions.
    const other = after.navNodes.find((n) => n.id !== draggedId)!;
    const edge = after.navEdges[0];
    const from = after.navNodes.find((n) => n.id === edge.startNodeId)!;
    const to = after.navNodes.find((n) => n.id === edge.endNodeId)!;
    expect([from.id, to.id].sort()).toEqual([draggedId, other.id].sort());
    // ONE history action — a single undo restores the original position.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    const undone = latestCampus(onCampusChange);
    expect(undone.navNodes.find((n) => n.id === draggedId)!.x).toBe(40);
    expect(undone.navNodes.find((n) => n.id === draggedId)!.y).toBe(40);
  });

  // ── SEMANTICS: Waypoint vs Destination ──

  it("creates a Destination via the library and renders it distinctly from a Waypoint", () => {
    enterNavigationMode();
    // Waypoint.
    placeWaypoint(container, 60, 120);
    // Destination via the library.
    fireEvent.click(screen.getByTestId("nav-library-destination"));
    clickCanvas(container, 140, 40);
    const campus = latestCampus(onCampusChange);
    const dest = campus.navNodes.find((n) => n.type === "room_access")!;
    expect(dest.name).toBe("Destination");
    // Destination node renders a different fill (violet target vs green dot).
    const destG = navNodes(container).find((g) => {
      const hit = g.querySelector('[data-testid="nav-node-hit"]') as SVGCircleElement | null;
      return hit && Number(hit.getAttribute("cx")) === 140;
    })!;
    expect(destG).toBeTruthy();
    // Its properties heading says DESTINATION, not WAYPOINT (scoped to the panel).
    fireEvent.mouseDown(nodeAt(container, 140, 40), { clientX: 140, clientY: 40, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    const panel = screen.getByTestId("floor-nav-node-props");
    expect(within(panel).getAllByText("Destination").length).toBeGreaterThanOrEqual(1);
    expect(within(panel).queryByText("Indoor Waypoint")).toBeNull();
  });

  it("Waypoint inspector heading stays WAYPOINT", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 50);
    fireEvent.mouseDown(nodeAt(container, 60, 50), { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    const panel = screen.getByTestId("floor-nav-node-props");
    expect(within(panel).getByText("Waypoint")).toBeTruthy();
    expect(within(panel).getByText("Indoor Waypoint")).toBeTruthy(); // type popover for free waypoints
  });

  // ── LINK LOCATION ──

  it("Link Location infers Room / Door / Stair / Elevator / Ramp from the clicked object", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors[0].rooms = [TEST_ROOM];
    campus.buildings[0].floors[0].walls = [{ id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" }];
    campus.buildings[0].floors[0].doors = [{ id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 }];
    campus.buildings[0].floors[0].stairs = [{ id: "st1", x: 10, y: 120, width: 20, height: 16, direction: "both", label: "Stairs" }];
    campus.buildings[0].floors[0].elevators = [{ id: "ev1", x: 120, y: 120, width: 16, height: 16, doorWidth: 6, label: "Elevator", accessible: true }];
    campus.buildings[0].floors[0].ramps = [{ id: "rmp1", x: 170, y: 20, width: 24, height: 12, label: "Ramp", direction: "both", handrails: true, slope: "gentle", accessible: true }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // One unified tool — no per-kind drag items.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // room center
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 90, 70); // door
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 20, 128); // stairs
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 128, 128); // elevator
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 182, 26); // ramp
    const latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((n) => n.roomId === "r1")).toHaveLength(1);
    expect(latest.navNodes.filter((n) => n.doorId === "d1")).toHaveLength(1);
    expect(latest.navNodes.filter((n) => n.stairId === "st1")).toHaveLength(1);
    expect(latest.navNodes.filter((n) => n.elevatorId === "ev1")).toHaveLength(1);
    expect(latest.navNodes.filter((n) => n.rampId === "rmp1")).toHaveLength(1);
  });

  it("Link Location duplicates reuse the canonical node (no second link)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40);
    expect(latestCampus(onCampusChange).navNodes.filter((n) => n.roomId === "r1")).toHaveLength(1);
  });

  it("Link Location with no valid target mutates nothing", () => {
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    const callsBefore = onCampusChange.mock.calls.length;
    clickCanvas(container, 150, 130); // empty space
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    expect(navNodes(container)).toHaveLength(0);
  });

  it("Escape cancels an armed Link Location tool back to Select", () => {
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    const svg = canvasSvg(container);
    expect(svg.style.cursor).toBe("crosshair"); // link armed
    fireEvent.keyDown(window, { key: "Escape" });
    expect(svg.style.cursor).toBe("default"); // back to Select
  });

  // ── MULTI-SELECTION ──

  it("multi-selection shows the summary inspector, never a single node's properties", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    const svg = stubSvgRect(container);
    // Shift-select both.
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-multi-props")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-node-props")).toBeNull();
    expect(screen.getByText("2 waypoints selected")).toBeTruthy();
    expect(screen.getByText("Waypoints")).toBeTruthy();
    expect(screen.getByText("Destinations")).toBeTruthy();
    expect(screen.getByText("Linked Locations")).toBeTruthy();
    expect(screen.getByText("Paths")).toBeTruthy();
  });

  it("group-drags free waypoints while linked nodes stay attached (one toast)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 40, 130);
    placeWaypoint(container, 120, 130);
    // Link the room.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40);
    const svg = stubSvgRect(container);
    // Shift-select the two free waypoints + the linked room node.
    fireEvent.mouseDown(nodeAt(container, 40, 130), { clientX: 40, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 130), { clientX: 120, clientY: 130, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navLinkedNodes(container)[0], { clientX: 45, clientY: 40, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Drag a free node — free ones move, linked stays.
    fireEvent.mouseDown(nodeAt(container, 40, 130), { clientX: 40, clientY: 130, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const after = latestCampus(onCampusChange);
    const movedFree = after.navNodes.find((n) => n.type === "hallway" && n.x === 60)!;
    expect(movedFree).toBeTruthy();
    const roomNode = after.navNodes.find((n) => n.roomId === "r1")!;
    expect(roomNode.x).toBe(45); // linked stays at its room routing anchor (offset above center)
    expect(roomNode.y).toBe(30);
  });

  // ── REMOVE TOOL ──

  it("Remove removes a node and its edges; the physical floor object is untouched", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 50);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    fireEvent.mouseDown(nodeAt(container, 60, 50), { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus(onCampusChange).navNodes).toHaveLength(0);
    expect(latestCampus(onCampusChange).buildings[0].floors[0].rooms).toHaveLength(0); // no rooms existed
  });

  it("Remove removes an edge by clicking its hit line without touching the nodes", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus(onCampusChange).navEdges).toHaveLength(1);
    // Remove the edge via its transparent hit line. (The edge's Path Shape
    // panel also has a "Remove" bend button, so query the toolbar explicitly.)
    fireEvent.click(screen.getByRole("button", { name: "Remove — Delete the selected waypoint or path" }));
    const hitLine = container.querySelector('[data-testid="nav-edge-hit"]') as SVGLineElement;
    expect(hitLine).toBeTruthy();
    fireEvent.mouseDown(hitLine, { clientX: 80, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus(onCampusChange).navEdges).toHaveLength(0);
    expect(latestCampus(onCampusChange).navNodes).toHaveLength(2); // nodes survive
  });

  it("Remove tool shows destructive hover and a not-allowed cursor on nodes", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 50);
    stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    const node = nodeAt(container, 60, 50);
    expect(node.style.cursor).toBe("not-allowed");
    fireEvent.mouseEnter(node);
    expect(screen.getByTestId("nav-erase-hover")).toBeTruthy();
  });

  it("Remove never falls through to Design deletion (graph-only)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWallAndDoor(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    // Click on the door position (a floor object) — the Remove tool is graph-only:
    // the physical door/wall must survive and no graph node may be created.
    clickCanvas(container, 90, 70);
    expect(onCampusChange.mock.calls.length).toBe(0); // no mutation at all
    expect(container.querySelectorAll('rect[width="24"]')).toHaveLength(0); // no fake nodes
    expect(container.querySelectorAll('[data-testid="nav-node"]')).toHaveLength(0);
  });

  // ── CURSOR PARITY ──

  it("Remove cursor differs from Select across the nav tools", () => {
    enterNavigationMode();
    stubSvgRect(container);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    expect(svg.style.cursor).toBe("crosshair");
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    expect(svg.style.cursor).toBe("not-allowed");
    fireEvent.click(screen.getByRole("button", { name: /Select/ }));
    expect(svg.style.cursor).toBe("default");
  });

  // ── SHORTCUT REGRESSION ──

  it("Delete / Backspace still removes selected nav nodes (input guard intact)", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 50);
    fireEvent.mouseDown(nodeAt(container, 60, 50), { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(latestCampus(onCampusChange).navNodes).toHaveLength(0);
  });

  it("Ctrl+C / Ctrl+V / Ctrl+D still work in Navigation after the interaction changes", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const before = latestCampus(onCampusChange).navNodes.length;
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    expect(latestCampus(onCampusChange).navNodes.length).toBe(before + 1);
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(latestCampus(onCampusChange).navNodes.length).toBe(before + 2);
  });

  it("copy/paste shortcuts never hijack text inputs (input guard)", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 50);
    fireEvent.mouseDown(nodeAt(container, 60, 50), { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    const input = screen.getByPlaceholderText("Waypoint name");
    input.focus();
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    fireEvent.keyDown(input, { key: "v", ctrlKey: true });
    fireEvent.keyDown(input, { key: "d", ctrlKey: true });
    expect(latestCampus(onCampusChange).navNodes).toHaveLength(1);
  });

  // ── VIEW CONTROLS ──

  it("Pan / Zoom / Fit Floor keep working in Navigation (view-only, no dirty)", () => {
    enterNavigationMode();
    const svg = stubSvgRect(container);
    const beforeCalls = onCampusChange.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Pan the floor canvas" }));
    fireEvent.mouseDown(svg, { clientX: 80, clientY: 60, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Fit Floor" })[0]);
    expect(onCampusChange.mock.calls.length).toBe(beforeCalls); // view-only actions never dirty
  });
});
