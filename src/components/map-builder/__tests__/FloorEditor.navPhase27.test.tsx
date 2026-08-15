import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { rampLinkedCuePosition } from "../../../lib/indoorNavigationGraph";
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

/** Ramp (170,20,24x12 → center 182,26). */
function withRamp(campus: Campus): Campus {
  const next = structuredClone(campus);
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

/** Link Location → the ramp at its center (182,26), then clear selection. */
function linkRamp(container: HTMLElement): SVGGElement {
  fireEvent.click(screen.getByTestId("nav-library-link"));
  clickCanvas(container, 182, 26);
  fireEvent.keyDown(window, { key: "Escape" }); // clear selection before Connect
  const linked = container.querySelector('[data-testid="nav-linked-node"]') as SVGGElement;
  expect(linked).toBeTruthy();
  return linked;
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

describe("B5 Phase 2.7 — Orthogonal Connector UX + Connect Hover Fix + Centered Linked Anchors", () => {
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

  // ── 1. CONNECT HOVER — NODE STAYS VISIBLE ──

  it("Connect hover keeps the actual linked node visible under the violet target ring", () => {
    cleanup();
    const rendered = render(<Harness initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const linked = linkRamp(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseEnter(linked);
    // Both the actual routing cue AND the violet target ring are visible — the
    // ring is feedback AROUND the node, never a replacement for it.
    expect(screen.getByTestId("nav-linked-cue")).toBeTruthy();
    const ring = screen.getByTestId("nav-connect-target");
    expect(Number(ring.getAttribute("cx"))).toBe(182);
    expect(Number(ring.getAttribute("cy"))).toBe(26);
  });

  it("direct node hover suppresses the conflicting physical target highlight", () => {
    cleanup();
    const rendered = render(<Harness initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const linked = linkRamp(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    const svg = stubSvgRect(container);
    // Move over the ramp body → physical (yellow) target would normally show.
    fireEvent.mouseMove(svg, { clientX: 182, clientY: 26, bubbles: true });
    // Hover directly over the routing node → node target WINS, physical hidden.
    fireEvent.mouseEnter(linked);
    expect(screen.getByTestId("nav-connect-target")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-target")).toBeNull();
  });

  // ── 2. MULTI-BEND CONNECT ──

  it("empty-space clicks PIN bends (no nodes) and Escape cancels with no mutation", () => {
    enterNavigationMode();
    placeWaypoint(container, 30, 30);
    placeWaypoint(container, 150, 60);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Pin two bends via empty-space clicks — no new nodes, no edge yet.
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(2);
    expect(navEdges(container)).toHaveLength(0);
    // Pinned preview markers are rendered (geometry-only, not nodes).
    expect(container.querySelectorAll('[data-testid="nav-connect-pin"]').length).toBeGreaterThanOrEqual(2);
    const callsBefore = onCampusChange.mock.calls.length;
    // Escape cancels the unfinished connection — no mutation/history.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(navEdges(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
  });

  it("a destination node click commits ONE edge with every pinned bend, fully orthogonal", () => {
    enterNavigationMode();
    placeWaypoint(container, 30, 30);
    placeWaypoint(container, 150, 60);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 150, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toBeTruthy();
    // No unintended diagonal segments — every segment is horizontal/vertical.
    expect(allAxisAligned(polylinePts(navEdges(container)[0]))).toBe(true);
  });

  // ── 3. ORTHOGONAL SEGMENT EDITING ──

  it("dragging a HORIZONTAL segment translates it vertically, staying orthogonal", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 100, 80);
    connectNodes(container, navNodes(container)[0], 40, 40, navNodes(container)[1], 100, 80);
    // Auto L-bend at (100,40). Drag the horizontal segment (40,40)→(100,40) down.
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(hit, { clientX: 60, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toEqual([{ x: 40, y: 60 }, { x: 100, y: 60 }]);
    expect(allAxisAligned(polylinePts(navEdges(container)[0]))).toBe(true);
  });

  it("dragging a VERTICAL segment translates it horizontally, staying orthogonal", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 100, 80);
    connectNodes(container, navNodes(container)[0], 40, 40, navNodes(container)[1], 100, 80);
    // Drag the vertical segment (100,40)→(100,80) right.
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(hit, { clientX: 100, clientY: 60, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toEqual([{ x: 120, y: 40 }, { x: 120, y: 80 }]);
    expect(allAxisAligned(polylinePts(navEdges(container)[0]))).toBe(true);
  });

  // ── 4. ALWAYS-ON ALIGNMENT GUIDES (Shift alignment removed in Phase 2.8) ──

  it("dragging a free waypoint near another node's X center snaps WITHOUT Shift and shows a guide", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 46, 80);
    const a = navNodes(container)[0];
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(a, { clientX: 40, clientY: 40, bubbles: true });
    // Target (52,38): node B is at x=46 — within the snap threshold → X aligns
    // ALWAYS (no Shift required) and a temporary guide renders during the drag.
    fireEvent.mouseMove(svg, { clientX: 52, clientY: 38, bubbles: true });
    expect(container.querySelectorAll('[data-testid="nav-align-guide"]').length).toBeGreaterThan(0);
    fireEvent.mouseUp(svg, { bubbles: true });
    const nodes = latestCampus(onCampusChange).navNodes;
    const moved = nodes.find((n) => n.x === 46 && n.y === 38)!;
    expect(moved).toBeTruthy();
    // Guide disappears after the drag.
    expect(container.querySelectorAll('[data-testid="nav-align-guide"]').length).toBe(0);
  });

  // ── 5. RAMP CENTERED ANCHOR + CONNECT RING ──

  it("Ramp Connect target ring appears around the CENTERED node; badge never alters coordinates", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const linked = linkRamp(container);
    // Logical anchor is the EXACT ramp center (routing coordinate).
    const node = latestCampus(onCampusChange).navNodes.find((n) => n.rampId === "rmp1")!;
    expect(node.x).toBe(182);
    expect(node.y).toBe(26);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseEnter(linked);
    // Violet ring surrounds the CENTERED node.
    const ring = screen.getByTestId("nav-connect-target");
    expect(Number(ring.getAttribute("cx"))).toBe(182);
    expect(Number(ring.getAttribute("cy"))).toBe(26);
    // Cue at the center; only the presentation badge offsets to a corner.
    const cue = linked.querySelector('[data-testid="nav-linked-cue"]');
    expect(Number(cue?.getAttribute("cx"))).toBe(182);
    expect(Number(cue?.getAttribute("cy"))).toBe(26);
    const badge = linked.querySelector('[data-testid="nav-linked-badge"]');
    const expected = rampLinkedCuePosition({ x: 170, y: 20, width: 24, height: 12 });
    expect(Number(badge?.getAttribute("cx"))).toBe(expected.x);
    expect(Number(badge?.getAttribute("cy"))).toBe(expected.y);
  });
});
