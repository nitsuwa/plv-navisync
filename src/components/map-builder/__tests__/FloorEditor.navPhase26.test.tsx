import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { rampLinkedCuePosition } from "../../../lib/indoorNavigationGraph";
import type { Campus } from "../types";

// ── Fixtures (mirror FloorEditor.navPhase25.test.tsx) ────────────────────────

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

/** Partial wall at x=100 spanning y 60→130 — an L-shape can route AROUND it but
 *  the direct A(40,40)→B(160,100) line crosses it at (100,70). */
function withPartialWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 100, y1: 60, x2: 100, y2: 130, thickness: 4, color: "#64748b", material: "concrete" },
  ];
  return next;
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

function placeDestination(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-destination"));
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

/** Build a segmented A(40,40)→B(100,80) path (auto L-bend at (100,40)). */
function buildSegmentedPath(container: HTMLElement) {
  enterNavigationMode();
  placeWaypoint(container, 40, 40);
  placeWaypoint(container, 100, 80);
  connectNodes(container, navNodes(container)[0], 40, 40, navNodes(container)[1], 100, 80);
  return navEdges(container)[0];
}

describe("B5 Phase 2.6 — Connect Feedback + Path Bend UX + Overlay Semantics + Ramp Polish", () => {
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

  // ── 1. CONNECT TARGET FEEDBACK ──

  it("Connect shows a subtle target ring on hover and a STRONGER ring once a start is chosen", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeWaypoint(container, 140, 60);
    const nodes = navNodes(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));

    // The LAST placed waypoint is still selected — hover the UNselected first
    // node so the target ring is not suppressed by the selection ring.
    // Pre-start hover — one subtle violet ring.
    fireEvent.mouseEnter(nodes[0]);
    const pre = screen.getByTestId("nav-connect-target");
    expect(pre.getAttribute("r")).toBe("9");
    expect(pre.getAttribute("stroke")).toBe("#7c3aed");
    fireEvent.mouseLeave(nodes[0]);
    expect(screen.queryByTestId("nav-connect-target")).toBeNull();

    // Choose the start.
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(nodes[0], { clientX: 60, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("nav-connect-start")).toBeTruthy();

    // Post-start hover on the OTHER (unselected) node — stronger accent ring.
    fireEvent.mouseEnter(nodes[1]);
    const post = screen.getByTestId("nav-connect-target");
    expect(post.getAttribute("r")).toBe("12");
    expect(post.getAttribute("stroke-width")).toBe("2");
    expect(post.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("Shift-constrained bend drag keeps the bend axis-aligned", () => {
    buildSegmentedPath(container);
    // Auto L-bend at (100,40) on A(40,40)→B(100,80).
    const handle = container.querySelector('[data-testid="nav-bend-handle"]') as SVGGElement;
    expect(handle).toBeTruthy();
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 40, bubbles: true });
    // Diagonal pointer movement + Shift → x follows, y stays on the original axis.
    fireEvent.mouseMove(svg, { clientX: 130, clientY: 70, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toEqual([{ x: 130, y: 40 }]);
    // No diagonal result — the changed segment stays horizontal.
  });

  // ── 2. BEND EDITING UX ──

  it("Add Bend splits the longest segment and never stacks on an existing bend", () => {
    buildSegmentedPath(container);
    fireEvent.click(screen.getByTestId("nav-path-add-bend"));
    const edge = latestCampus(onCampusChange).navEdges[0];
    // B5 Phase 2.11: Add Bend inserts a USEFUL orthogonal dog-leg (U-shape)
    // around the midpoint of the longest segment (40,40)→(100,40) — never a
    // collinear midpoint that normalization would remove.
    expect(edge.bendPoints).toHaveLength(4);
    // Dog-leg starts at the midpoint (70,40), distinct from the existing (100,40).
    expect(edge.bendPoints![0]).toEqual({ x: 70, y: 40 });
    expect(edge.bendPoints![3]).toEqual({ x: 100, y: 40 });
    const seen = new Set(edge.bendPoints!.map((p) => `${p.x},${p.y}`));
    expect(seen.size).toBe(4);
    // Rendered polyline has 6 points (start + 4 bends + end).
    const rendered = navEdges(container)[0];
    const pts = (rendered.getAttribute("points") ?? "").trim().split(/\s+/);
    expect(pts).toHaveLength(6);
  });

  it("Remove Bend removes the specifically SELECTED inner bend and neighbors reconnect", () => {
    buildSegmentedPath(container);
    fireEvent.click(screen.getByTestId("nav-path-add-bend")); // now the 4-bend dog-leg
    // Select the FIRST bend handle (70,40).
    const handles = container.querySelectorAll('[data-testid="nav-bend-handle"]');
    expect(handles.length).toBe(4);
    fireEvent.mouseDown(handles[0], { clientX: 70, clientY: 40, bubbles: true });
    expect(screen.getByTestId("nav-bend-selected")).toBeTruthy();
    fireEvent.click(screen.getByTestId("nav-path-remove-bend"));
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toEqual([{ x: 70, y: 55 }, { x: 100, y: 55 }, { x: 100, y: 40 }]);
    const rendered = navEdges(container)[0];
    expect((rendered.getAttribute("points") ?? "").trim().split(/\s+/)).toHaveLength(5);
    // Distance recomputed for the remaining polyline: 34 + 30 + 15 + 40 = 119.
    expect(edge.distance).toBe(119);
  });

  it("Straighten is BLOCKED when the direct line would cross a wall (disabled + no mutation)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPartialWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 160, 100);
    connectNodes(container, navNodes(container)[0], 40, 40, navNodes(container)[1], 160, 100);
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toHaveLength(1); // valid L around the wall
    const callsBefore = onCampusChange.mock.calls.length;

    const straighten = screen.getByTestId("nav-path-straighten") as HTMLButtonElement;
    expect(straighten.disabled).toBe(true);
    fireEvent.click(straighten);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore); // no mutation
    expect(toastWarnSpy).not.toHaveBeenCalled(); // disabled — no toast needed
    // The edge still keeps its bend.
    expect(latestCampus(onCampusChange).navEdges[0].bendPoints).toHaveLength(1);
  });

  it("Straighten succeeds when the direct line is wall-safe", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 100, 80);
    connectNodes(container, navNodes(container)[0], 40, 40, navNodes(container)[1], 100, 80);
    const straighten = screen.getByTestId("nav-path-straighten") as HTMLButtonElement;
    expect(straighten.disabled).toBe(false);
    fireEvent.click(straighten);
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toBeUndefined();
    expect(edge.distance).toBe(Math.round(Math.hypot(60, 40)));
  });

  // ── 3. DESIGN OVERLAY SEMANTICS ──

  it("Design overlay preserves semantic colors: Waypoint green vs Destination violet", () => {
    enterNavigationMode();
    placeWaypoint(container, 60, 60);
    placeDestination(container, 140, 60);
    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    fireEvent.click(screen.getByRole("button", { name: /Show Navigation overlay/ }));
    const overlay = screen.getByTestId("floor-nav-overlay");
    const fills = Array.from(overlay.querySelectorAll("circle")).map((c) => c.getAttribute("fill"));
    expect(fills).toContain("rgba(22,163,74,0.55)"); // waypoint green
    expect(fills).toContain("rgba(124,58,237,0.65)"); // destination violet
    // The overlay itself stays read-only.
    expect(overlay.getAttribute("class")).toContain("pointer-events-none");
  });

  // ── 4. RAMP ANCHOR + VISUAL ──

  it("the ramp routing anchor is the CENTER and route edges terminate there, badge offset", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 182, 26); // ramp center
    const rampNode = latestCampus(onCampusChange).navNodes.find((n) => n.rampId === "rmp1")!;
    expect(rampNode.x).toBe(182);
    expect(rampNode.y).toBe(26);
    const badge = rampLinkedCuePosition({ x: 170, y: 20, width: 24, height: 12 });
    expect(badge.x).not.toBe(182);
    expect(badge.y).not.toBe(26);

    // Connect a free waypoint → ramp; the polyline endpoint lands on the CENTER.
    placeWaypoint(container, 60, 60);
    const linked = container.querySelector('[data-testid="nav-linked-node"]') as SVGGElement;
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 60, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(linked, { clientX: 182, clientY: 26, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edge = navEdges(container)[0];
    const pts = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(pts[pts.length - 1]).toEqual([182, 26]);
  });

  it("Ramp renders as a deep-blue accessibility sign with a larger white icon and tiny corner cue", () => {
    cleanup();
    const rendered = render(<Harness initialCampus={withRamp(makeBaseCampus())} />);
    container = rendered.container;
    const symbol = container.querySelector('[data-testid="ramp-symbol"]') as SVGGElement;
    const base = symbol.querySelector('[data-testid="ramp-blue-base"]') as SVGElement;
    expect(base.getAttribute("fill")).toBe("#2563eb");
    const icon = symbol.querySelector('[data-testid="ramp-accessibility-icon"] svg') as SVGElement;
    expect(icon).toBeTruthy();
    // Icon is LARGER than before (>=10 units) and white (lucide renders the
    // color prop onto the svg stroke when it is the only visual channel).
    expect(Number(icon.getAttribute("width"))).toBeGreaterThanOrEqual(10);
    expect(icon.getAttribute("stroke") ?? icon.getAttribute("color")).toBe("#ffffff");
    // Direction cue is tiny and tucked into the bottom-right corner.
    const cue = symbol.querySelector('[data-testid="ramp-direction-cue"]') as SVGGElement;
    expect(cue.getAttribute("transform")).toContain("translate(190 28)");
  });
});
