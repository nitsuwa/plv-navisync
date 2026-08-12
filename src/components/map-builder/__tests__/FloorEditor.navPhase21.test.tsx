import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// ── Canvas helpers (1:1 viewBox mapping like the existing floor tests) ───────

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

/** The canvas content-group transform — the single source of camera truth. */
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

function navLinkedNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-linked-node"]')) as SVGGElement[];
}

function navEdges(container: HTMLElement): SVGLineElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]')) as SVGLineElement[];
}

function nodeCircle(container: HTMLElement, index: number): SVGCircleElement {
  const g = navNodes(container)[index];
  expect(g).toBeTruthy();
  const circle = g.querySelector("circle") as SVGCircleElement | undefined;
  expect(circle).toBeTruthy();
  return circle;
}

function roomGroup(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector(`rect[width="${TEST_ROOM.w}"][height="${TEST_ROOM.h}"]`)
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

/** Create two free waypoints + one edge in Navigation mode (like Phase 2 tests). */
function seedTwoConnectedWaypoints(container: HTMLElement) {
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, 40, 40);
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, 120, 80);
  const svg = stubSvgRect(container);
  fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
  fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

/**
 * Drag-event dispatcher. testing-library's createEvent builds a real jsdom
 * DragEvent (which React processes) but jsdom DROPS clientX/clientY from the
 * DragEventInit, so the coordinates are defined on the event instance before
 * it is dispatched — production browsers pass them through normally.
 */
function fireDrag(type: "dragstart" | "dragover" | "drop", el: Element, x: number, y: number, dt: object) {
  const ev =
    type === "dragstart"
      ? createEvent.dragStart(el, { dataTransfer: dt })
      : type === "dragover"
        ? createEvent.dragOver(el, { dataTransfer: dt })
        : createEvent.drop(el, { dataTransfer: dt });
  Object.defineProperty(ev, "clientX", { configurable: true, value: x });
  Object.defineProperty(ev, "clientY", { configurable: true, value: y });
  fireEvent(el, ev as Event);
  return ev;
}

/** Ctrl+wheel zoom event (clientX is also dropped by jsdom's WheelEvent path). */
function fireWheel(el: Element, x: number, y: number, deltaY: number) {
  const ev = createEvent.wheel(el, { deltaY, ctrlKey: true }) as unknown as Record<string, unknown>;
  Object.defineProperty(ev, "clientX", { configurable: true, value: x });
  Object.defineProperty(ev, "clientY", { configurable: true, value: y });
  fireEvent(el, ev as Event);
}

function dragDataTransfer() {
  return { setData: vi.fn(), effectAllowed: "copy", dropEffect: "copy" };
}

/** Wait until the camera is stable (mount auto-fit + zoom animations settled). */
async function settleCamera(target: HTMLElement) {
  await waitFor(async () => {
    const a = contentTransform(target);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(contentTransform(target)).toBe(a);
  });
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("B5 Phase 2.1 — Floor Editor Navigation UX / shortcuts / tooling", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    // rAF must actually tick so zoom animations settle (same stub as the floor-view tests).
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

  // ── SHORTCUTS: Floor Design ──

  it("Design Ctrl+C / Ctrl+V pastes a room copy with a fresh id, offset, and one-history undo", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    const pasted = latestCampus(onCampusChange);
    const rooms = pasted.buildings[0].floors[0].rooms;
    expect(rooms).toHaveLength(2);
    const copy = rooms.find((r: FloorRoom) => r.id !== "r1")!;
    expect(copy).toBeTruthy();
    expect(copy.x).toBe(32); // +12 offset (clamped)
    expect(copy.y).toBe(32);
    // ONE history action — a single undo removes the paste.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    const undone = latestCampus(onCampusChange);
    expect(undone.buildings[0].floors[0].rooms).toHaveLength(1);
  });

  it("Design Ctrl+D duplicates the selected floor object with a fresh id", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    const duplicated = latestCampus(onCampusChange);
    const rooms = duplicated.buildings[0].floors[0].rooms;
    expect(rooms).toHaveLength(2);
    expect(rooms.filter((r: FloorRoom) => r.id === "r1")).toHaveLength(1);
    expect(rooms.filter((r: FloorRoom) => r.id !== "r1")).toHaveLength(1);
  });

  it("copy/paste shortcuts never hijack text inputs", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const input = screen.getByPlaceholderText("Room name");
    input.focus();
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    fireEvent.keyDown(input, { key: "v", ctrlKey: true });
    fireEvent.keyDown(input, { key: "d", ctrlKey: true });
    // No canvas mutation from shortcuts while typing in the name field.
    expect(container.querySelectorAll('rect[width="50"][height="40"]')).toHaveLength(1);
    expect(onCampusChange.mock.calls.length).toBe(0);
  });

  // ── SHORTCUTS: Floor Navigation ──

  it("Navigation Ctrl+C / Ctrl+V pastes free waypoints with fresh ids and remapped edges", () => {
    enterNavigationMode();
    seedTwoConnectedWaypoints(container);
    const before = latestCampus(onCampusChange);
    const sourceNodeIds = new Set(before.navNodes.map((n) => n.id));
    const sourceEdgeIds = new Set(before.navEdges.map((e) => e.id));
    // Shift-select both nodes.
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    const pasted = latestCampus(onCampusChange);
    const pastedNodes = pasted.navNodes.filter((n) => !sourceNodeIds.has(n.id));
    const pastedEdges = pasted.navEdges.filter((e) => !sourceEdgeIds.has(e.id));
    expect(pastedNodes).toHaveLength(2);
    expect(pastedEdges).toHaveLength(1);
    // Pasted nodes are offset +12 from their originals.
    const origA = before.navNodes[0];
    const copyA = pastedNodes.find((n) => n.x === origA.x + 12 && n.y === origA.y + 12)!;
    expect(copyA).toBeTruthy();
    // The pasted edge's endpoints point at the NEW nodes only.
    const pastedNodeIds = new Set(pastedNodes.map((n) => n.id));
    expect(pastedEdges[0].startNodeId !== pastedEdges[0].endNodeId).toBe(true);
    expect(pastedNodeIds.has(pastedEdges[0].startNodeId) && pastedNodeIds.has(pastedEdges[0].endNodeId)).toBe(true);
    // ONE history action — a single undo restores 2 nodes / 1 edge.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    const undone = latestCampus(onCampusChange);
    expect(undone.navNodes.filter((n) => n.floorId === "f1")).toHaveLength(2);
    expect(undone.navEdges.filter((e) => undone.navNodes.some((n) => n.id === e.startNodeId) && undone.navNodes.some((n) => n.id === e.endNodeId))).toHaveLength(1);
  });

  it("Navigation Ctrl+D duplicates the selected free waypoints", () => {
    enterNavigationMode();
    seedTwoConnectedWaypoints(container);
    const before = latestCampus(onCampusChange);
    const sourceNodeIds = new Set(before.navNodes.map((n) => n.id));
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    const duplicated = latestCampus(onCampusChange);
    expect(duplicated.navNodes.filter((n) => !sourceNodeIds.has(n.id))).toHaveLength(2);
    expect(duplicated.navEdges).toHaveLength(2);
  });

  it("Navigation duplicate/copy never creates a second canonical link for a linked node", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // room center → room-linked node
    expect(navLinkedNodes(container)).toHaveLength(1);
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(navLinkedNodes(container)[0], { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    const after = latestCampus(onCampusChange);
    // The linked node still exists exactly once with its roomId intact — no copies.
    expect(after.navNodes.filter((n) => n.roomId === "r1")).toHaveLength(1);
    expect(after.navNodes.filter((n) => n.floorId === "f1")).toHaveLength(1);
  });

  // ── VIEW CONTROLS ──

  it("preserves the camera across Design → Navigation and Navigation Pan actually pans", async () => {
    const svg = stubSvgRect(container);
    // Let the mount auto-fit settle, then zoom in and let it settle again.
    await settleCamera(container);
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    await settleCamera(container);
    const designCamera = contentTransform(container);
    // Mode switch must NOT reset zoom/pan.
    enterNavigationMode();
    expect(contentTransform(container)).toBe(designCamera);
    // Navigation Pan tool actually moves the camera (fixed Phase 2.1 bug).
    const beforePan = parseCamera(contentTransform(container));
    fireEvent.click(screen.getByRole("button", { name: "Pan the floor canvas" }));
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 140, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const panned = parseCamera(contentTransform(container));
    expect(panned.x - beforePan.x).toBeCloseTo(40);
    expect(panned.y - beforePan.y).toBeCloseTo(20);
    // Fit Floor works in Navigation mode.
    const beforeFit = contentTransform(container);
    fireEvent.click(screen.getAllByRole("button", { name: "Fit Floor" })[0]);
    await waitFor(() => expect(contentTransform(container)).not.toBe(beforeFit));
  });

  it("Ctrl+wheel zoom works in Navigation mode and view-only actions never mark the draft dirty", async () => {
    const svg = stubSvgRect(container);
    enterNavigationMode();
    await settleCamera(container);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    // Ctrl+wheel zoom (attached to the canvas container).
    const beforeZoom = parseCamera(contentTransform(container)).z;
    fireWheel(svg.parentElement!, 110, 80, -120);
    await waitFor(() => expect(parseCamera(contentTransform(container)).z).toBeGreaterThan(beforeZoom));
    // Pan with the Navigation Pan tool.
    fireEvent.click(screen.getByRole("button", { name: "Pan the floor canvas" }));
    fireEvent.mouseDown(svg, { clientX: 80, clientY: 60, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Pure view interactions: still no pending Save, and the campus draft never changed.
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(onCampusChange.mock.calls.length).toBe(0);
  });

  // ── SIDEBAR ──

  it("entering Navigation does not auto-open the Properties sidebar", () => {
    expect(screen.queryByTestId("floor-nav-empty-state")).toBeNull();
    enterNavigationMode();
    // Sidebar stays closed: no properties panel, no verbose tutorial panel.
    expect(screen.queryByTestId("floor-nav-empty-state")).toBeNull();
    expect(screen.queryByTestId("floor-nav-node-props")).toBeNull();
    // The instructions live in the small canvas empty-state instead.
    expect(screen.getByTestId("floor-nav-canvas-empty-state")).toBeTruthy();
  });

  it("shows the Navigation Library in Navigation mode and the Object Library in Design mode", () => {
    expect(screen.getByText("Object Library")).toBeTruthy();
    expect(screen.queryByText("Navigation Library")).toBeNull();
    enterNavigationMode();
    expect(screen.getByText("Navigation Library")).toBeTruthy();
    expect(screen.queryByText("Object Library")).toBeNull();
    // No architectural placement assets in Navigation mode.
    expect(screen.queryByText("Furniture")).toBeNull();
    expect(screen.queryByText("Wall")).toBeNull();
    expect(screen.queryByText("Chairs")).toBeNull();
    // Navigation items are present — B5 Phase 2.2: one unified Link Location
    // replaces the five per-kind linked drag items.
    expect(screen.getByTestId("nav-library-waypoint")).toBeTruthy();
    expect(screen.getByTestId("nav-library-destination")).toBeTruthy();
    expect(screen.getByTestId("nav-library-link")).toBeTruthy();
    expect(screen.queryByTestId("nav-library-room")).toBeNull();
    expect(screen.queryByTestId("nav-library-door")).toBeNull();
    expect(screen.queryByTestId("nav-library-ramp")).toBeNull();
  });

  // ── DRAG / DROP ──

  it("drags a Waypoint from the Navigation Library and places it at the exact world coordinate", () => {
    enterNavigationMode();
    const svg = stubSvgRect(container);
    const dt = dragDataTransfer();
    fireDrag("dragstart", screen.getByTestId("nav-library-waypoint"), 0, 0, dt);
    fireDrag("dragover", svg.parentElement!, 60, 50, dt);
    expect(screen.getByTestId("floor-nav-drag-preview")).toBeTruthy();
    fireDrag("drop", svg.parentElement!, 60, 50, dt);
    expect(navNodes(container)).toHaveLength(1);
    expect(Number(nodeCircle(container, 0).getAttribute("cx"))).toBe(60);
    expect(Number(nodeCircle(container, 0).getAttribute("cy"))).toBe(50);
    // Placed node is selected and its properties open.
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    // The drop returned to Select (no lingering placement tool).
    expect(screen.queryByTestId("floor-nav-drag-preview")).toBeNull();
  });

  it("drops a Waypoint under zoom + pan at the correct world coordinate", async () => {
    enterNavigationMode();
    const svg = stubSvgRect(container);
    await settleCamera(container);
    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    await settleCamera(container);
    const cam = parseCamera(contentTransform(container));
    const screenX = 110;
    const screenY = 80;
    const expectedWorldX = Math.round((screenX - cam.x) / cam.z);
    const expectedWorldY = Math.round((screenY - cam.y) / cam.z);
    const dt = dragDataTransfer();
    fireDrag("dragstart", screen.getByTestId("nav-library-waypoint"), 0, 0, dt);
    fireDrag("dragover", svg.parentElement!, screenX, screenY, dt);
    fireDrag("drop", svg.parentElement!, screenX, screenY, dt);
    expect(navNodes(container)).toHaveLength(1);
    expect(Number(nodeCircle(container, 0).getAttribute("cx"))).toBe(expectedWorldX);
    expect(Number(nodeCircle(container, 0).getAttribute("cy"))).toBe(expectedWorldY);
  });

  // B5 Phase 2.2: linked items are no longer draggable — the unified Link
  // Location tool infers the node type from the physical object under the click.

  it("Link Location links a Room: canonical linked node, reuse, no fake room", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    // The room highlights as a link target on hover.
    clickCanvas(container, 45, 40);
    expect(navLinkedNodes(container)).toHaveLength(1);
    // Clicking again REUSES the canonical node — no duplicate, no fake physical room.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40);
    expect(navLinkedNodes(container)).toHaveLength(1);
    expect(latestCampus(onCampusChange).buildings[0].floors[0].rooms).toHaveLength(1);
    expect(latestCampus(onCampusChange).navNodes.filter((n) => n.roomId === "r1")).toHaveLength(1);
  });

  it("Link Location links a Door to create its canonical door node", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    campus.buildings[0].floors[0].doors = [
      { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 90, 70);
    expect(navLinkedNodes(container)).toHaveLength(1);
    expect(latestCampus(onCampusChange).navNodes.filter((n) => n.doorId === "d1")).toHaveLength(1);
  });

  it("Link Location links Stairs / Elevator / Ramp with accessibility defaults", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors[0].stairs = [{ id: "st1", x: 10, y: 120, width: 20, height: 16, direction: "both", label: "Stairs" }];
    campus.buildings[0].floors[0].elevators = [{ id: "ev1", x: 120, y: 120, width: 16, height: 16, doorWidth: 6, label: "Elevator", accessible: true }];
    campus.buildings[0].floors[0].ramps = [{ id: "rmp1", x: 170, y: 20, width: 24, height: 12, label: "Ramp", direction: "both", handrails: true, slope: "gentle", accessible: true }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 20, 128);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 128, 128);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 182, 26);
    const latest = latestCampus(onCampusChange);
    expect(latest.navNodes.filter((n) => n.stairId === "st1")).toHaveLength(1);
    expect(latest.navNodes.filter((n) => n.elevatorId === "ev1")).toHaveLength(1);
    expect(latest.navNodes.filter((n) => n.rampId === "rmp1")).toHaveLength(1);
    // Accessibility authoring defaults preserved by the canonical creation path.
    expect(latest.navNodes.find((n) => n.stairId === "st1")!.accessible).toBe(false);
    expect(latest.navNodes.find((n) => n.elevatorId === "ev1")!.accessible).toBe(true);
    expect(latest.navNodes.find((n) => n.rampId === "rmp1")!.accessible).toBe(true);
  });

  it("Link Location rejects an invalid target (empty floor) without creating anything", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    const callsBefore = onCampusChange.mock.calls.length;
    // Empty floor space — rejected with guidance, no mutation.
    clickCanvas(container, 150, 130);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    expect(navNodes(container)).toHaveLength(0);
    expect(navLinkedNodes(container)).toHaveLength(0);
    expect(container.querySelectorAll('rect[width="50"][height="40"]')).toHaveLength(1);
  });

  // ── SELECT ──

  it("Navigation marquee selects only graph elements, never floor objects", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // Two free waypoints outside the room + one linked room node.
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 100, 130);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 160, 130);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // room node
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(svg, { clientX: 80, clientY: 110, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 180, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Only the two free waypoints inside the marquee rect show the selection ring.
    expect(container.querySelectorAll('[data-testid="nav-node-selected"]')).toHaveLength(2);
    // The room itself is untouched — no design selection, no properties panel for it.
    expect(screen.queryByTestId("floor-properties-panel")).toBeNull();
    expect(latestCampus(onCampusChange).buildings[0].floors[0].rooms).toHaveLength(1);
  });

  it("group drag moves free waypoints together while linked nodes stay derived", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 100, 130);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 160, 130);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // linked room node
    const svg = stubSvgRect(container);
    // Shift-select both free nodes.
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 100, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 160, clientY: 130, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Drag the group by +30x.
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 100, clientY: 130, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 130, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(Number(nodeCircle(container, 0).getAttribute("cx"))).toBe(130);
    expect(Number(nodeCircle(container, 1).getAttribute("cx"))).toBe(190);
    // The room-linked node stayed at the room center.
    const linkedCircle = navLinkedNodes(container)[0].querySelector("circle") as SVGCircleElement;
    expect(Number(linkedCircle.getAttribute("cx"))).toBe(45);
  });
});
