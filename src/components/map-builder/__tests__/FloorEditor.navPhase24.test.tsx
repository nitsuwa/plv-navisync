import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { roomLinkedCuePosition } from "../../../lib/indoorNavigationGraph";
import type { Campus } from "../types";

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

/** Room (20,20,50,40) + a wall attached to its TOP edge (room-anchored). */
function withRoomAttachedWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].rooms = [
    { id: "r1", name: "Lobby", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
  ];
  next.buildings[0].floors[0].walls = [
    {
      id: "w1", x1: 20, y1: 20, x2: 70, y2: 20, thickness: 4, color: "#64748b", material: "concrete",
      startAnchor: { targetType: "room", roomId: "r1", edge: "top", offset: 0 },
    },
  ];
  return next;
}

/** Room (20,20,50,40) center (45,40) — used for room-linked navigation tests. */
function withRoom(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].rooms = [
    { id: "r1", name: "Lecture Hall", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
  ];
  return next;
}

/** Stair (10,120,20x16 → center 20,128), Elevator (120,120,16x16 → center 128,128), Ramp (170,20,24x12 → center 182,26). */
function withCirculation(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].stairs = [{ id: "st1", x: 10, y: 120, width: 20, height: 16, direction: "both", label: "Stairs" }];
  next.buildings[0].floors[0].elevators = [{ id: "ev1", x: 120, y: 120, width: 16, height: 16, doorWidth: 6, label: "Elevator", accessible: true }];
  next.buildings[0].floors[0].ramps = [{ id: "rmp1", x: 170, y: 20, width: 24, height: 12, label: "Ramp", direction: "both", handrails: true, slope: "gentle", accessible: true }];
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

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

function placeWaypoint(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, x, y);
}

function linkAt(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-link"));
  clickCanvas(container, x, y);
}

/** Connect node A → node B via the Connect tool (clicks on the node elements). */
function connectNodes(container: HTMLElement, a: SVGGElement, ax: number, ay: number, b: SVGGElement, bx: number, by: number) {
  const svg = stubSvgRect(container);
  fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
  fireEvent.mouseDown(a, { clientX: ax, clientY: ay, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  fireEvent.mouseDown(b, { clientX: bx, clientY: by, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function circulationGroup(container: HTMLElement, testId: string): SVGGElement {
  const g = container.querySelector(`[data-testid="${testId}"]`) as SVGGElement | null;
  expect(g, testId).toBeTruthy();
  return g!;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("B5 Phase 2.4 — Indoor Navigation Tool Simplification + Route Anchor + Circulation Visual Corrections", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;
  // Sonner's <Toaster /> does not mount its portal in jsdom, so toasts are
  // asserted by spying on the sonner API the app calls through useToast.
  let toastInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    toastInfoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    onCampusChange = vi.fn();
    const rendered = render(<Harness onCampusChange={onCampusChange} />);
    container = rendered.container;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function expectInfoToast(message: string) {
    expect(toastInfoSpy.mock.calls.some((call) => String(call[0]).includes(message))).toBe(true);
  }

  // ── 1. WALL CREATION REGRESSION — ROOM-ATTACHED WALL TARGET ──

  it("completes a Wall in ONE click on a Room-attached Wall endpoint", () => {
    cleanup();
    const campus = withRoomAttachedWall(makeBaseCampus());
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 120, bubbles: true }); // free start
    fireEvent.mouseMove(svg, { clientX: 22, clientY: 21, bubbles: true });  // preview near w1 endpoint (20,20)
    fireEvent.mouseDown(svg, { clientX: 22, clientY: 21, bubbles: true });  // single completion click
    fireEvent.mouseUp(svg, { bubbles: true });

    const walls = latestCampus(onCampusChange).buildings[0].floors[0].walls;
    const created = walls.find((w) => w.id !== "w1");
    expect(created).toBeDefined();
    expect(created!.x2).toBe(20);
    expect(created!.y2).toBe(20);
  });

  it("completes a Wall in ONE click on a Room-attached Wall segment (T-junction)", () => {
    cleanup();
    const campus = withRoomAttachedWall(makeBaseCampus());
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 120, bubbles: true }); // free start
    fireEvent.mouseMove(svg, { clientX: 45, clientY: 21, bubbles: true });  // preview near w1 segment (projects to (45,20))
    fireEvent.mouseDown(svg, { clientX: 45, clientY: 21, bubbles: true });  // single completion click
    fireEvent.mouseUp(svg, { bubbles: true });

    const walls = latestCampus(onCampusChange).buildings[0].floors[0].walls;
    const created = walls.find((w) => w.id !== "w1");
    expect(created).toBeDefined();
    expect(created!.x2).toBe(45);
    expect(created!.y2).toBe(20);
  });

  it("drawing previews are pointer-events-none so they never intercept completion clicks", () => {
    const svg = stubSvgRect(container);
    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 120, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 103, clientY: 103, bubbles: true });
    // The wall preview line ends exactly at the cursor — if it captured pointer
    // events, the completion click would hit it instead of the svg background.
    const preview = screen.getByTestId("wall-draw-preview");
    expect(preview.className.baseVal || preview.getAttribute("class")).toContain("pointer-events-none");
  });

  // ── 2. SIMPLIFIED NAVIGATION TOOL ARCHITECTURE ──

  it("Navigation top toolbar exposes Select / Pan / Connect / Remove and NO top Add Waypoint", () => {
    enterNavigationMode();
    expect(screen.queryByRole("button", { name: /Add Waypoint/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Select waypoints and paths/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pan the floor canvas/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connect routing points and locations/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeTruthy();
  });

  it("the Navigation Library exposes only Waypoint / Destination / Link Location", () => {
    enterNavigationMode();
    expect(screen.getByTestId("nav-library-waypoint")).toBeTruthy();
    expect(screen.getByTestId("nav-library-destination")).toBeTruthy();
    expect(screen.getByTestId("nav-library-link")).toBeTruthy();
    // No per-kind linked drag items remain.
    expect(screen.queryByTestId("nav-library-room")).toBeNull();
    expect(screen.queryByTestId("nav-library-door")).toBeNull();
  });

  it("Link Location on empty floor space is rejected with guidance and no mutation", () => {
    enterNavigationMode();
    const callsBefore = onCampusChange.mock.calls.length;
    linkAt(container, 60, 90); // empty space
    expect(navNodes(container)).toHaveLength(0);
    expect(navLinkedNodes(container)).toHaveLength(0);
    // Guidance toast fired, no node created, no history entry.
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    expectInfoToast("Nothing to link");
  });

  it("free Waypoint and Destination placement still works through the library", () => {
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 40, 60);
    fireEvent.click(screen.getByTestId("nav-library-destination"));
    clickCanvas(container, 140, 60);
    const latest = latestCampus(onCampusChange);
    expect(latest.navNodes).toHaveLength(2);
    expect(latest.navNodes.some((n) => n.type === "room_access")).toBeTruthy(); // destination
    expect(latest.navNodes.some((n) => n.type === "hallway")).toBeTruthy();     // waypoint
  });

  // ── 3. ROOM ROUTE ANCHOR ──

  it("a Navigation Path terminates at the room-linked node anchor, never the label center", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();

    linkAt(container, 45, 40); // click room center (semantic target)
    const latest = latestCampus(onCampusChange);
    const roomNode = latest.navNodes.find((n) => n.roomId === "r1")!;
    expect(roomNode).toBeTruthy();
    // The canonical node position is the deterministic routing anchor — NOT the
    // center (45,40) where the room label renders.
    const anchor = roomLinkedCuePosition({ id: "r1", name: "Lecture Hall", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" });
    expect(roomNode.x).toBe(anchor.x);
    expect(roomNode.y).toBe(anchor.y);
    expect(roomNode.x).toBe(45);
    expect(roomNode.y).toBeLessThan(40);

    // Connect a free waypoint → room node; the edge must end exactly at the node.
    placeWaypoint(container, 60, 130);
    connectNodes(container, navNodes(container)[0], 60, 130, navLinkedNodes(container)[0], roomNode.x, roomNode.y);
    // B5 Phase 2.5: the connection is an auto-orthogonal polyline (A─┐└─B) —
    // its LAST point is the terminal coordinate, which must be the room node.
    const edge = navEdges(container)[0];
    expect(edge).toBeTruthy();
    const pts = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(pts[pts.length - 1][0]).toBe(roomNode.x);
    expect(pts[pts.length - 1][1]).toBe(roomNode.y);
  });

  // ── 4. STAIR VISUAL FINALIZATION ──

  it("Stairs render treads, boundary rails and a centered direction arrow", () => {
    cleanup();
    const rendered = render(<Harness initialCampus={withCirculation(makeBaseCampus())} />);
    container = rendered.container;
    const symbol = circulationGroup(container, "stairs-symbol");
    expect(symbol.querySelectorAll('[data-testid="stairs-tread"]').length).toBeGreaterThanOrEqual(3);
    expect(symbol.querySelectorAll('[data-testid="stairs-rail"]').length).toBe(2);
    expect(symbol.querySelector('[data-testid="stairs-arrow"]')).toBeTruthy();
    // Arrow is centered on the object center (local frame → rotation-safe).
    const arrow = symbol.querySelector('[data-testid="stairs-arrow"]') as SVGGElement;
    expect(arrow.getAttribute("transform")).toContain("translate(20 128)");
  });

  it("single-floor Stairs keep a neutral travel cue", () => {
    cleanup();
    const campus = withCirculation(makeBaseCampus());
    campus.buildings[0].floors[0].stairs[0].direction = "up";
    const r1 = render(<Harness initialCampus={campus} />);
    const up = r1.container.querySelector('[data-testid="stairs-arrow"] path') as SVGPathElement | null;
    expect(up).toBeTruthy();
    cleanup();
    const campusDown = withCirculation(makeBaseCampus());
    campusDown.buildings[0].floors[0].stairs[0].direction = "down";
    const r2 = render(<Harness initialCampus={campusDown} />);
    const down = r2.container.querySelector('[data-testid="stairs-arrow"] path') as SVGPathElement | null;
    expect(down).toBeTruthy();
    // A one-floor building has no cross-floor travel direction, even if a
    // persisted Stair direction value is present.
    expect(up!.getAttribute("d")).toBe("M -3.5 0 L 3.5 0");
    expect(down!.getAttribute("d")).toBe("M -3.5 0 L 3.5 0");
  });

  // ── 5. ELEVATOR VISUAL POLISH ──

  it("Elevator renders shaft, cab, centered door and centered vertical up/down chevrons", () => {
    cleanup();
    const rendered = render(<Harness initialCampus={withCirculation(makeBaseCampus())} />);
    container = rendered.container;
    const symbol = circulationGroup(container, "elevator-symbol");
    expect(symbol.querySelector('[data-testid="elevator-shaft"]')).toBeTruthy();
    expect(symbol.querySelector('[data-testid="elevator-cab"]')).toBeTruthy();
    expect(symbol.querySelector('[data-testid="elevator-door"]')).toBeTruthy();
    const chevrons = symbol.querySelector('[data-testid="elevator-chevrons"]') as SVGGElement;
    expect(chevrons.getAttribute("transform")).toContain("translate(128 128)");
  });

  it("Elevator chevrons stay centered after resize", () => {
    cleanup();
    const campus = withCirculation(makeBaseCampus());
    campus.buildings[0].floors[0].elevators[0].width = 24;
    campus.buildings[0].floors[0].elevators[0].height = 24;
    const rendered = render(<Harness initialCampus={campus} />);
    const symbol = circulationGroup(rendered.container, "elevator-symbol");
    const chevrons = symbol.querySelector('[data-testid="elevator-chevrons"]') as SVGGElement;
    // New center (120+12, 120+12) = (132,132) — indicator never drifts off-center.
    expect(chevrons.getAttribute("transform")).toContain("translate(132 132)");
  });

  // ── 6. RAMP VISUAL — B5 Phase 2.5 simplification ──

  it("Ramp renders a functional blue footprint with a centered accessibility icon and a small direction cue", () => {
    cleanup();
    const rendered = render(<Harness initialCampus={withCirculation(makeBaseCampus())} />);
    container = rendered.container;
    const symbol = circulationGroup(container, "ramp-symbol");
    expect(symbol.querySelector('[data-testid="ramp-blue-base"]')).toBeTruthy();
    const icon = symbol.querySelector('[data-testid="ramp-accessibility-icon"]') as SVGGElement;
    expect(icon).toBeTruthy();
    // The wheelchair icon is CENTERED on the object (local frame → rotation-safe).
    expect(icon.getAttribute("transform")).toContain("translate(182 26)");
    // A small secondary direction cue (both → double arrow) is also centered.
    const cue = symbol.querySelector('[data-testid="ramp-direction-cue"]') as SVGGElement;
    expect(cue).toBeTruthy();
    // B5 Phase 2.6: the direction cue is a TINY corner marker (bottom-right),
    // never competing with the dominant centered accessibility icon.
    expect(cue.getAttribute("transform")).toContain("translate(190 28)");
  });

  // ── 7. CIRCULATION LINKED-NODE ANCHOR CENTERING ──

  it("Stair/Elevator/Ramp linked nodes sit at the owner center and edges terminate exactly at the node", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withCirculation(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();

    linkAt(container, 20, 128);  // stair center
    linkAt(container, 128, 128); // elevator center
    linkAt(container, 182, 26);  // ramp center
    const latest = latestCampus(onCampusChange);
    const stairNode = latest.navNodes.find((n) => n.stairId === "st1")!;
    const elevatorNode = latest.navNodes.find((n) => n.elevatorId === "ev1")!;
    const rampNode = latest.navNodes.find((n) => n.rampId === "rmp1")!;
    expect(stairNode.x).toBe(20);
    expect(stairNode.y).toBe(128);
    expect(elevatorNode.x).toBe(128);
    expect(elevatorNode.y).toBe(128);
    // B5 Phase 2.6: the ramp's LOGICAL routing anchor is the object CENTER
    // (route edges terminate there); the visual badge may render offset.
    expect(rampNode.x).toBe(182);
    expect(rampNode.y).toBe(26);

    // Connect a free waypoint → stair node; the polyline terminal point must be
    // the node coordinate (B5 Phase 2.5 auto-orthogonal rendering).
    placeWaypoint(container, 60, 60);
    connectNodes(container, navNodes(container)[0], 60, 60, navLinkedNodes(container)[0], 20, 128);
    const edge = navEdges(container)[0];
    const pts = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(pts[pts.length - 1][0]).toBe(20);
    expect(pts[pts.length - 1][1]).toBe(128);
  });
});
