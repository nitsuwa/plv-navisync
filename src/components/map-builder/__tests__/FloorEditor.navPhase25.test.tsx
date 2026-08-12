import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { rampLinkedCuePosition } from "../../../lib/indoorNavigationGraph";
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

/** Full-height wall at x=100 (0→160) — blocks every straight/horizontal route. */
function withFullWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 100, y1: 0, x2: 100, y2: 160, thickness: 4, color: "#64748b", material: "concrete" },
  ];
  return next;
}

/** Partial wall at x=100 spanning y 60→130 — an L-shape can route AROUND it. */
function withPartialWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 100, y1: 60, x2: 100, y2: 130, thickness: 4, color: "#64748b", material: "concrete" },
  ];
  return next;
}

/** Ramp (170,20,24x12 → center 182,26; anchor 187,24). */
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

describe("B5 Phase 2.5 — Segmented Paths + Design Nav Overlay + Ramp Visual", () => {
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

  function expectInfoToast(message: string) {
    expect(toastInfoSpy.mock.calls.some((call) => String(call[0]).includes(message))).toBe(true);
  }

  // ── 1. SEGMENTED EDGE CREATION ──

  it("Connect auto-creates a wall-safe ORTHOGONAL bend for non-aligned nodes", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 110);
    connectNodes(container, navNodes(container)[0], 60, 60, navNodes(container)[1], 140, 110);

    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge).toBeTruthy();
    // Single L-bend (horizontal-then-vertical) — A ────┐ then └──── B.
    expect(edge.bendPoints).toHaveLength(1);
    expect(edge.bendPoints![0]).toEqual({ x: 140, y: 60 });
    // Distance/weight = TOTAL polyline length (80 + 50), NOT the 94-unit diagonal.
    expect(edge.distance).toBe(130);
    // The edge RENDERS as a polyline (points attribute present).
    const rendered = navEdges(container)[0];
    expect(rendered.getAttribute("points")).toContain("140,60");
  });

  it("axis-aligned nodes stay STRAIGHT (no bends)", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 60);
    connectNodes(container, navNodes(container)[0], 60, 60, navNodes(container)[1], 140, 60);
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints ?? []).toHaveLength(0);
    expect(edge.distance).toBe(80);
  });

  // ── 2. WALL VALIDATION ACROSS SEGMENTS ──

  it("a segmented path whose segments cross a solid wall is rejected", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withFullWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 110);
    const callsBefore = onCampusChange.mock.calls.length;
    connectNodes(container, navNodes(container)[0], 60, 60, navNodes(container)[1], 140, 110);

    expect(latestCampus(onCampusChange).navEdges).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    expect(toastWarnSpy.mock.calls.some((call) => String(call[0]).includes("door opening"))).toBe(true);
  });

  it("a segmented path that routes AROUND a wall corner is allowed", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPartialWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 60, 30);
    placeWaypoint(container, 140, 150);
    connectNodes(container, navNodes(container)[0], 60, 30, navNodes(container)[1], 140, 150);

    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge).toBeTruthy();
    // Both L candidates are wall-safe here; the horizontal-first bend wins.
    expect(edge.bendPoints![0]).toEqual({ x: 140, y: 30 });
    expect(edge.distance).toBe(200);
  });

  // ── 3. BEND EDITING (properties panel + handle drag) ──

  it("Path Shape panel: Add Bend, Remove Bend and Straighten each mutate once", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 110);
    connectNodes(container, navNodes(container)[0], 60, 60, navNodes(container)[1], 140, 110);
    const callsAfterConnect = onCampusChange.mock.calls.length;

    fireEvent.click(screen.getByTestId("nav-path-add-bend"));
    // B5 Phase 2.11: Add Bend now inserts a USEFUL orthogonal dog-leg (U-shape
    // corner pair) instead of a collinear midpoint that normalized away — the
    // longest segment (60,60)→(140,60) becomes a 3-bend U at y=80.
    expect(latestCampus(onCampusChange).navEdges[0].bendPoints).toHaveLength(4);
    expect(onCampusChange.mock.calls.length).toBe(callsAfterConnect + 1);

    fireEvent.click(screen.getByTestId("nav-path-remove-bend"));
    expect(latestCampus(onCampusChange).navEdges[0].bendPoints).toHaveLength(3);
    expect(onCampusChange.mock.calls.length).toBe(callsAfterConnect + 2);

    fireEvent.click(screen.getByTestId("nav-path-straighten"));
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints ?? []).toHaveLength(0);
    // Straightening restores the direct distance (hypot(80,50) = 94).
    expect(edge.distance).toBe(94);
    expect(onCampusChange.mock.calls.length).toBe(callsAfterConnect + 3);
  });

  it("dragging a bend handle reshapes the path and undo restores it in ONE step", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 110);
    connectNodes(container, navNodes(container)[0], 60, 60, navNodes(container)[1], 140, 110);
    const svg = stubSvgRect(container);

    const handle = container.querySelector('[data-testid="nav-bend-handle"]') as SVGGElement;
    expect(handle).toBeTruthy();
    fireEvent.mouseDown(handle, { clientX: 140, clientY: 60, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    let edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints![0]).toEqual({ x: 150, y: 40 });
    // Distance is recomputed from the CURRENT polyline: hypot(90,20)+hypot(10,70) = 163.
    expect(edge.distance).toBe(163);

    // ONE undo step restores the pre-drag bend (and the pre-drag distance).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints![0]).toEqual({ x: 140, y: 60 });
  });

  it("Ctrl+C / Ctrl+V preserves segmented bend geometry with fresh IDs and polyline distance", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 110);
    connectNodes(container, navNodes(container)[0], 60, 60, navNodes(container)[1], 140, 110);
    const original = latestCampus(onCampusChange).navEdges[0];
    const originalNodeIds = new Set(latestCampus(onCampusChange).navNodes.map((n) => n.id));

    // Multi-select BOTH free waypoints via Shift-click, then copy + paste.
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 60, clientY: 60, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 140, clientY: 110, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });

    const latest = latestCampus(onCampusChange);
    expect(latest.navNodes).toHaveLength(4);
    expect(latest.navEdges).toHaveLength(2);
    const pasted = latest.navEdges.find((e) => e.id !== original.id)!;
    // The L-bend travels WITH the pasted nodes (+12 offset) — shape preserved.
    expect(pasted.bendPoints).toHaveLength(1);
    expect(pasted.bendPoints![0]).toEqual({ x: 152, y: 72 });
    // Fresh endpoint IDs — never reused from the original graph.
    expect(originalNodeIds.has(pasted.startNodeId)).toBe(false);
    expect(originalNodeIds.has(pasted.endNodeId)).toBe(false);
    // Distance = TOTAL polyline length (80 + 50), not the straight diagonal.
    expect(pasted.distance).toBe(130);
  });

  // ── 4. DESIGN-MODE READ-ONLY NAVIGATION OVERLAY ──

  it("Design 'Show Navigation' renders a read-only overlay that never dirties the draft", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 60);
    connectNodes(container, navNodes(container)[0], 60, 60, navNodes(container)[1], 140, 60);
    const callsBeforeToggle = onCampusChange.mock.calls.length;

    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    // The toggle exists only in Design mode.
    const toggle = screen.getByRole("button", { name: /Show Navigation overlay/ });
    expect(toggle).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-overlay")).toBeNull();

    fireEvent.click(toggle);
    const overlay = screen.getByTestId("floor-nav-overlay");
    expect(overlay).toBeTruthy();
    // Read-only: reduced-opacity graph, pointer-events-none, no hit surfaces.
    expect(overlay.className.baseVal || overlay.getAttribute("class")).toContain("pointer-events-none");
    expect(overlay.querySelector("circle")).toBeTruthy();
    expect(overlay.querySelector("line, polyline")).toBeTruthy();
    // The graph is NOT selectable in Design mode — no selection surface exists.
    expect(overlay.querySelector('[data-testid="nav-node-hit"]')).toBeNull();

    // Pure view preference — toggling does NOT call onUpdate (no dirty/history).
    fireEvent.click(toggle);
    expect(screen.queryByTestId("floor-nav-overlay")).toBeNull();
    expect(onCampusChange.mock.calls.length).toBe(callsBeforeToggle);
  });

  it("the overlay is not shown in Navigation mode and design Select stays floor-only", () => {
    enterNavigationMode();
    expect(screen.queryByRole("button", { name: /Show Navigation overlay/ })).toBeNull();
  });

  // ── 5. RAMP VISUAL + LINKED CUE ──

  it("Ramp renders a blue functional footprint with a centered accessibility icon", () => {
    cleanup();
    const rendered = render(<Harness initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    const symbol = circulationGroup(container, "ramp-symbol");
    expect(symbol.querySelector('[data-testid="ramp-blue-base"]')).toBeTruthy();
    const icon = symbol.querySelector('[data-testid="ramp-accessibility-icon"]') as SVGGElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute("transform")).toContain("translate(182 26)");
    // Direction cue for direction "both" is present.
    expect(symbol.querySelector('[data-testid="ramp-direction-cue"]')).toBeTruthy();
  });

  it("the ramp logical anchor sits at the CENTER while the visual cue renders offset", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 182, 26); // ramp center — Link Location targets the object

    const node = latestCampus(onCampusChange).navNodes.find((n) => n.rampId === "rmp1")!;
    expect(node).toBeTruthy();
    // B5 Phase 2.6/2.7: the LOGICAL routing anchor is the object center (route
    // edges terminate exactly there) — never over the centered accessibility icon.
    expect(node.x).toBe(182);
    expect(node.y).toBe(26);
    // The VISUAL routing cue renders AT the anchor (center) so Connect shows the
    // real routing location; only a tiny presentation-only badge offsets.
    const badge = rampLinkedCuePosition({ x: 170, y: 20, width: 24, height: 12 });
    expect(badge.x).not.toBe(182);
    expect(badge.y).not.toBe(26);
    const linked = container.querySelector('[data-testid="nav-linked-node"]') as SVGGElement;
    const cue = linked?.querySelector('[data-testid="nav-linked-cue"]');
    expect(Number(cue?.getAttribute("cx"))).toBe(182);
    expect(Number(cue?.getAttribute("cy"))).toBe(26);
    const corner = linked?.querySelector('[data-testid="nav-linked-badge"]');
    expect(Number(corner?.getAttribute("cx"))).toBe(badge.x);
    expect(Number(corner?.getAttribute("cy"))).toBe(badge.y);
  });
});
