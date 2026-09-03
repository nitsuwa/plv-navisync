import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

// ── Canvas helpers (1:1 viewBox mapping, like the existing floor tests) ──────

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
  // A freshly created edge is auto-selected, so it renders with the selected testid.
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]')) as SVGLineElement[];
}

function nodeCircle(container: HTMLElement, index: number): SVGCircleElement {
  const g = navNodes(container)[index];
  expect(g).toBeTruthy();
  const circle = g.querySelector("circle") as SVGCircleElement | undefined;
  expect(circle).toBeTruthy();
  return circle;
}

function roomGroup(container: HTMLElement, room: FloorRoom): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector(`rect[width="${room.w}"][height="${room.h}"]`)
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
}

describe("B5 Phase 2 — Floor Editor indoor Navigation mode", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    onCampusChange = vi.fn();
    const rendered = render(<Harness onCampusChange={onCampusChange} />);
    container = rendered.container;
  });

  afterEach(() => cleanup());

  it("isolates Design vs Navigation toolbars", () => {
    expect(screen.queryByTestId("floor-nav-toolbar")).toBeNull();
    expect(screen.getByRole("tab", { name: "Design" })).toBeTruthy();
    enterNavigationMode();
    expect(screen.getByTestId("floor-nav-toolbar")).toBeTruthy();
    // B5 Phase 2.4: the top toolbar is Select / Pan / Connect / Remove — no
    // separate Add Waypoint action (waypoint creation lives in the library).
    expect(screen.queryByRole("button", { name: /Add Waypoint/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Connect/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeTruthy();
  });

  it("shows a restrained canvas empty state and does NOT auto-open the Properties sidebar", () => {
    enterNavigationMode();
    // B5 Phase 2.1: instructions moved to a small canvas overlay — never the sidebar.
    expect(screen.getByTestId("floor-nav-canvas-empty-state")).toBeTruthy();
    expect(screen.getByText("Build the Walking Network")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-empty-state")).toBeNull();
  });

  it("places a free indoor waypoint at the exact clicked world coordinate", () => {
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 50, 40);
    expect(navNodes(container)).toHaveLength(1);
    const circle = nodeCircle(container, 0);
    expect(Number(circle.getAttribute("cx"))).toBe(50);
    expect(Number(circle.getAttribute("cy"))).toBe(40);
    // Node opens the WAYPOINT inspector — not a marker inspector.
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    expect(within(screen.getByTestId("floor-nav-node-props")).getByText("Waypoint")).toBeTruthy();
    // Graph mutation marks the outer Campus draft dirty.
    expect(onCampusChange.mock.calls.length).toBeGreaterThan(0);
  });

  it("does not mark the draft dirty just for switching modes", () => {
    enterNavigationMode();
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
  });

  it("Navigation Select cannot select floor objects (rooms stay context-only)", () => {
    const withRoom = makeBaseCampus();
    withRoom.buildings[0].floors[0].rooms = [
      { id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    cleanup();
    const rendered = render(<Harness initialCampus={withRoom} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(roomGroup(container, withRoom.buildings[0].floors[0].rooms[0]), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // No design properties panel, no room selection state — and no nav node was created.
    expect(screen.queryByTestId("floor-properties-panel")).toBeNull();
    expect(navNodes(container)).toHaveLength(0);
  });

  it("Connect Path connects two existing waypoints", () => {
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 40, 40);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 120, 80);
    expect(navNodes(container)).toHaveLength(2);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const edge = navEdges(container)[0];
    // B5 Phase 2.5: non-aligned nodes connect as an auto-orthogonal polyline —
    // start at the first waypoint, bend, and terminate at the second.
    const pts = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(pts[0]).toEqual([40, 40]);
    expect(pts[pts.length - 1]).toEqual([120, 80]);
    expect(screen.getByTestId("floor-nav-edge-props")).toBeTruthy();
    expect(screen.getByText("Navigation Path")).toBeTruthy();
  });

  it("Connect Path splits an existing manual path and terminates at one canonical junction", () => {
    const withPath = makeBaseCampus();
    withPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Elevator", type: "hallway", x: 110, y: 130, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withPath.navEdges = [{ id: "edge-ab", startNodeId: "nav-a", endNodeId: "nav-b", distance: 140, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    fireEvent.mouseDown(navNodes(container).find((node) => node.getAttribute("data-node-id") === "nav-source") ?? navNodes(container)[2], { clientX: 110, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const floorNodes = (latest.navNodes ?? []).filter((node) => node.floorId === "f1");
    const floorEdges = (latest.navEdges ?? []).filter((edge) => {
      const ids = new Set(floorNodes.map((node) => node.id));
      return ids.has(edge.startNodeId) && ids.has(edge.endNodeId);
    });
    const junction = floorNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    expect(junction?.x).toBe(110);
    expect(junction?.y).toBe(80);
    expect(floorNodes).toHaveLength(4);
    expect(floorEdges).toHaveLength(3);
    expect(floorEdges.some((edge) => edge.startNodeId === "nav-a" && edge.endNodeId === "nav-b")).toBe(false);
    expect(floorEdges.some((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("nav-source") && new Set([edge.startNodeId, edge.endNodeId]).has(junction!.id))).toBe(true);
  });

  it("shows the hovered manual path as a projected Connect target", () => {
    const withPath = makeBaseCampus();
    withPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Elevator", type: "hallway", x: 110, y: 130, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withPath.navEdges = [{ id: "edge-ab", startNodeId: "nav-a", endNodeId: "nav-b", distance: 140, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container)[2];
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 110, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    fireEvent.mouseMove(pathHit!, { clientX: 110, clientY: 80, bubbles: true });
    expect(screen.getByTestId("nav-connect-path-target")).toBeTruthy();
    expect(screen.getByTestId("nav-connect-path-hint")).toHaveTextContent("Click to connect to path");

    // The commit must consume the exact hovered edge/segment projection rather
    // than re-running generic nearest-node hit testing on mouse-up.  A midpoint
    // click therefore creates a canonical split at the preview marker.
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const floorNodes = (latest.navNodes ?? []).filter((node) => node.floorId === "f1");
    const floorEdges = (latest.navEdges ?? []).filter((edge) => {
      const ids = new Set(floorNodes.map((node) => node.id));
      return ids.has(edge.startNodeId) && ids.has(edge.endNodeId);
    });
    const junction = floorNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    expect(junction?.x).toBe(110);
    expect(junction?.y).toBe(80);
    expect(floorEdges.some((edge) => edge.startNodeId === "nav-a" && edge.endNodeId === "nav-b")).toBe(false);
    expect(floorEdges).toHaveLength(3);
  });

  it("splits the exact hovered segment of a bent Walking Path", () => {
    const withBentPath = makeBaseCampus();
    withBentPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 160, y: 140, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Door", type: "hallway", x: 110, y: 140, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withBentPath.navEdges = [{
      id: "edge-bent", startNodeId: "nav-a", endNodeId: "nav-b", distance: 220,
      bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4,
      bendPoints: [{ x: 40, y: 100 }, { x: 160, y: 100 }],
    }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withBentPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container).find((node) => {
      const circle = node.querySelector("circle");
      return circle?.getAttribute("cx") === "110" && circle?.getAttribute("cy") === "140";
    });
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 110, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    fireEvent.mouseMove(pathHit!, { clientX: 110, clientY: 100, bubbles: true });
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const floorNodes = (latest.navNodes ?? []).filter((node) => node.floorId === "f1");
    const floorEdges = (latest.navEdges ?? []).filter((edge) => {
      const ids = new Set(floorNodes.map((node) => node.id));
      return ids.has(edge.startNodeId) && ids.has(edge.endNodeId);
    });
    const junction = floorNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    expect(junction?.x).toBe(110);
    expect(junction?.y).toBe(100);
    expect(floorEdges).toHaveLength(3);
    expect(floorEdges.some((edge) => edge.startNodeId === "nav-a" && edge.endNodeId === "nav-b")).toBe(false);
    const left = floorEdges.find((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("nav-a") && new Set([edge.startNodeId, edge.endNodeId]).has(junction!.id));
    const right = floorEdges.find((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("nav-b") && new Set([edge.startNodeId, edge.endNodeId]).has(junction!.id));
    expect(left?.bendPoints).toEqual([{ x: 40, y: 100 }]);
    expect(right?.bendPoints).toEqual([{ x: 160, y: 100 }]);
  });

  it("keeps a diagonal Connect junction on the exact projected segment", () => {
    const withDiagonalPath = makeBaseCampus();
    withDiagonalPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 140, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Source", type: "hallway", x: 110, y: 145, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withDiagonalPath.navEdges = [{ id: "edge-diagonal", startNodeId: "nav-a", endNodeId: "nav-b", distance: 172,
      bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDiagonalPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container)[2];
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 110, clientY: 145, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    // Deliberately click several pixels off the diagonal. The projected point,
    // not this raw pointer coordinate or an endpoint, is authoritative.
    fireEvent.mouseMove(pathHit!, { clientX: 110, clientY: 95, bubbles: true });
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 95, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const junction = latest.navNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    const dx = 180 - 40;
    const dy = 140 - 40;
    const cross = (junction!.x - 40) * dy - (junction!.y - 40) * dx;
    expect(Math.abs(cross)).toBeLessThan(0.0001);
    expect(junction!.x).not.toBe(180);
    expect(junction!.y).not.toBe(140);
  });

  it("allows an isolated internal junction to be deleted after its paths are gone", () => {
    const withJunction = makeBaseCampus();
    withJunction.navNodes = [
      { id: "nav-junction", name: "Waypoint", type: "hallway", x: 110, y: 80, buildingId: "b1", floorId: "f1", pathJunction: true, accessible: true, color: "#d97706" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withJunction} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const junction = container.querySelector('[data-testid="nav-path-junction"]');
    expect(junction).toBeTruthy();
    fireEvent.mouseDown(junction!, { clientX: 110, clientY: 80, bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(container.querySelector('[data-testid="nav-path-junction"]')).toBeNull();
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    expect((latest.navNodes ?? []).some((node) => node.id === "nav-junction")).toBe(false);
  });

  it("reshapes a diagonal path segment with bends while keeping endpoints fixed", () => {
    const withDiagonal = makeBaseCampus();
    withDiagonal.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 30, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 120, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withDiagonal.navEdges = [{ id: "edge-diagonal", startNodeId: "nav-a", endNodeId: "nav-b", distance: 166, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDiagonal} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    // First click selects the edge; the second begins the segment gesture.
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 75, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 75, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edited = container.querySelector('[data-testid="nav-edge-selected"]') as SVGPolylineElement | null;
    expect(edited).toBeTruthy();
    const points = (edited?.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(points.length).toBeGreaterThan(2);
    expect(points[0]).toEqual([40, 30]);
    expect(points[points.length - 1]).toEqual([180, 120]);
    for (let i = 1; i < points.length; i++) {
      expect(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1]).toBe(true);
    }
  });

  it("Connect Path empty-space clicks do nothing BEFORE a start; after a start they PIN bends (no waypoints)", () => {
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    // B5 Phase 2.8: clicking empty floor BEFORE a start does NOT create a node.
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.mouseDown(svg, { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    // Place a start waypoint, re-arm Connect, start at it.
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 30, 30);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Empty click → PIN a geometry bend: STILL one node, no edge yet.
    fireEvent.mouseDown(svg, { clientX: 140, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(1);
    expect(navEdges(container)).toHaveLength(0);
    // Place a destination node, re-arm Connect, start at node A, finish at node B.
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 150, 60);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // One more pinned bend on the way, then finish on the destination node.
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 150, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(2);
    expect(navEdges(container)).toHaveLength(1);
    // The committed connector is fully ORTHOGONAL (no diagonal segments).
    const edge = navEdges(container)[0];
    const pts = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(pts.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1]).toBe(true);
    }
  });

  it("rejects a self-connection and a duplicate connection", () => {
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 40, 40);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 120, 80);
    const svg = stubSvgRect(container);
    // Self-edge: connect A → A.
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(0);
    // Duplicate: A → B twice.
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
  });

  it("Escape cancels an incomplete connection without leaving an edge", () => {
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 40, 40);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // B5 Phase 2.7: the connect hint now advertises empty-space bend pinning.
    expect(screen.getByText(/Shift for H\/V/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(navEdges(container)).toHaveLength(0);
    expect(screen.queryByTestId("floor-nav-connect-preview")).toBeNull();
  });

  it("links a Room as a destination node and reuses it on repeat", () => {
    const withRoom = makeBaseCampus();
    withRoom.buildings[0].floors[0].rooms = [
      { id: "r1", name: "Lecture Hall", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // B5 Phase 2.3: linking goes through Link Location — the Add Waypoint tool
    // now blocks free placement on the room semantic target.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // inside room r1 (20-70, 20-60)
    expect(navLinkedNodes(container)).toHaveLength(1);
    // Reuse — no second node.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40);
    expect(navLinkedNodes(container)).toHaveLength(1);
    // B5 Phase 2.4: node data sits at the room ROUTING ANCHOR (deterministic
    // offset above the center) so edges terminate at the cue — never the label.
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    const roomNode = latest.navNodes.find((n) => n.roomId === "r1");
    expect(roomNode).toBeTruthy();
    expect(roomNode.x).toBe(45);
    expect(roomNode.y).toBe(30);
  });

  it("links a Door as a node and a Stairs node defaults to not accessible", () => {
    const withDoor = makeBaseCampus();
    withDoor.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    withDoor.buildings[0].floors[0].doors = [
      { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
    ];
    withDoor.buildings[0].floors[0].stairs = [
      { id: "st1", x: 150, y: 20, width: 20, height: 16, direction: "both", label: "Stairs" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDoor} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // B5 Phase 2.3: linking goes through Link Location.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 90, 70); // on the door
    expect(navLinkedNodes(container)).toHaveLength(1);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 160, 28); // on the stairs
    expect(navLinkedNodes(container)).toHaveLength(2);
    // Stairs node must be not-accessible by default.
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    const stairNode = latest.navNodes.find((n: { stairId?: string }) => n.stairId === "st1");
    expect(stairNode).toBeTruthy();
    expect(stairNode.accessible).toBe(false);
  });

  it("rejects an edge crossing a wall unless it passes through a door opening", () => {
    const withWall = makeBaseCampus();
    withWall.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    cleanup();
    const rendered = render(<Harness initialCampus={withWall} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 70, 30);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 70, 120);
    expect(navNodes(container)).toHaveLength(2);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 70, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(0);
    // Now add a door at the crossing point → connection allowed.
    const withDoor = makeBaseCampus();
    withDoor.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    withDoor.buildings[0].floors[0].doors = [
      { id: "d1", x: 70, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.3 },
    ];
    cleanup();
    const rendered2 = render(<Harness initialCampus={withDoor} />);
    const container2 = rendered2.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container2, 70, 30);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container2, 70, 120);
    const svg2 = stubSvgRect(container2);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container2)[0], { clientX: 70, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg2, { bubbles: true });
    fireEvent.mouseDown(navNodes(container2)[1], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg2, { bubbles: true });
    expect(navEdges(container2)).toHaveLength(1);
  });

  it("moves free waypoints as a group; linked nodes stay derived and edges follow", () => {
    const withRoom = makeBaseCampus();
    withRoom.buildings[0].floors[0].rooms = [
      { id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    cleanup();
    const rendered = render(<Harness initialCampus={withRoom} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // Two free waypoints + one room-linked node (via Link Location).
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 20, 130);
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 100, 130);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // room node at room center
    expect(navNodes(container)).toHaveLength(2);
    expect(navLinkedNodes(container)).toHaveLength(1);
    // Connect free A → free B, then drag A 30px right — B must NOT follow (only A selected).
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 20, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 100, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    // Drag node A by +40x. (x=60 is clear of the room-linked node's x=45 and
    // free node B's x=100 — the 8-unit alignment guide would otherwise snap it.)
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 20, clientY: 130, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const aCircle = nodeCircle(container, 0);
    expect(Number(aCircle.getAttribute("cx"))).toBe(60);
    // Edge follows the moved endpoint.
    const edge = navEdges(container)[0];
    expect(Number(edge.getAttribute("x1"))).toBe(60);
  });

  it("delete key removes a selected node and its connected edges; undo restores", () => {
    enterNavigationMode();
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
    expect(navEdges(container)).toHaveLength(1);
    // Select node A and Delete.
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(navNodes(container)).toHaveLength(1);
    expect(navEdges(container)).toHaveLength(0);
    // Undo restores node + edge.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(navNodes(container)).toHaveLength(2);
    expect(navEdges(container)).toHaveLength(1);
  });

  it("undo/redo works for waypoint creation", () => {
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 40, 40);
    expect(navNodes(container)).toHaveLength(1);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(navNodes(container)).toHaveLength(0);
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(navNodes(container)).toHaveLength(1);
  });

  it("duplicates the indoor graph when the Floor is duplicated (fresh ids, no back-references)", () => {
    enterNavigationMode();
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
    const before = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    expect(before.navNodes).toHaveLength(2);
    expect(before.navEdges).toHaveLength(1);
    // Duplicate the floor from the shared floor-actions menu.
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Floor" }));
    const after = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    const copyFloorId = after.buildings[0].floors.find((f) => f.id !== "f1")!.id;
    const copyNodes = after.navNodes.filter((n) => n.floorId === copyFloorId);
    const copyEdges = after.navEdges.filter((e) =>
      copyNodes.some((n) => n.id === e.startNodeId) && copyNodes.some((n) => n.id === e.endNodeId)
    );
    expect(copyNodes).toHaveLength(2);
    expect(copyEdges).toHaveLength(1);
    // Fresh ids — no references back to the source floor.
    const originalIds = new Set(before.navNodes.map((n) => n.id));
    expect(copyNodes.every((n) => !originalIds.has(n.id))).toBe(true);
    expect(copyEdges[0].id).not.toBe(before.navEdges[0].id);
    expect(copyNodes.every((n) => n.floorId === copyFloorId && n.buildingId === "b1")).toBe(true);
  });

  it("prunes the linked node + edges when the physical Door is deleted in Design mode", () => {
    const withDoor = makeBaseCampus();
    withDoor.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    withDoor.buildings[0].floors[0].doors = [
      { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDoor} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 90, 70);
    expect(navLinkedNodes(container)).toHaveLength(1);
    // Switch to Design, select the door and delete it with the keyboard.
    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    const door = Array.from(container.querySelectorAll('[data-testid="attached-door-opening-symbol"]'))[0] as SVGGElement | undefined;
    expect(door).toBeTruthy();
    fireEvent.mouseDown(door!, { clientX: 90, clientY: 70, bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    // Back in Navigation mode the door-linked node is pruned — no stale refs.
    fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
    expect(navLinkedNodes(container)).toHaveLength(0);
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    expect(latest.navNodes.every((n) => n.doorId !== "d1")).toBe(true);
  });
});
