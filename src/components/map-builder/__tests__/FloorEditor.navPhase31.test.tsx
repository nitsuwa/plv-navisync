import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 2.11 — invalid existing edge state + Add Bend repair UX ────────

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

/** Horizontal wall across the floor (y=70, x 40..140) — standard fixture. */
function withWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  return next;
}

const FREE_NODE = (id: string, x: number, y: number) => ({
  id, name: "Waypoint", type: "hallway" as const, x, y, campusId: "c1", buildingId: "b1", floorId: "f1",
  accessible: true, color: "#16a34a",
});

const EDGE = (id: string, startNodeId: string, endNodeId: string, bendPoints?: { x: number; y: number }[]) => ({
  id, startNodeId, endNodeId, distance: 0, bidirectional: true, accessible: true, emergencySafe: true,
  type: "hallway", color: "#16a34a", width: 4, ...(bendPoints ? { bendPoints } : {}),
});

/** A(20,40) → B(160,100) with a VALID L bend [(160,40)] around the wall. */
function withValidBendEdge(campus: Campus): Campus {
  const next = withWall(campus);
  next.navNodes = [FREE_NODE("n1", 20, 40), FREE_NODE("n2", 160, 100)];
  next.navEdges = [EDGE("e1", "n1", "n2", [{ x: 160, y: 40 }])];
  return next;
}

/** A(20,40) → B(160,100) with bends [(90,40),(90,16)] — the final diagonal
 *  (90,16)→(160,100) crosses the wall → the edge is INVALID but editable. */
function withInvalidBendEdge(campus: Campus): Campus {
  const next = withWall(campus);
  next.navNodes = [FREE_NODE("n1", 20, 40), FREE_NODE("n2", 160, 100)];
  next.navEdges = [EDGE("e1", "n1", "n2", [{ x: 90, y: 40 }, { x: 90, y: 16 }])];
  return next;
}

/** Straight axis-aligned edge (20,20)→(180,20) with NO bends. */
function withStraightEdge(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.navNodes = [FREE_NODE("n1", 20, 20), FREE_NODE("n2", 180, 20)];
  next.navEdges = [EDGE("e1", "n1", "n2")];
  return next;
}

/** Door-valid edge through (70,70) + a second edge crossing the SAME wall away
 *  from the door (must stay blocked — the door exception is LOCAL). */
function withDoorEdge(campus: Campus): Campus {
  const next = withWall(campus);
  next.buildings[0].floors[0].doors = [
    { id: "d1", x: 70, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.3 },
  ];
  next.navNodes = [
    FREE_NODE("n1", 70, 30), FREE_NODE("n2", 70, 120),
    FREE_NODE("n3", 110, 30), FREE_NODE("n4", 110, 120),
  ];
  next.navEdges = [EDGE("e1", "n1", "n2"), EDGE("e2", "n3", "n4")];
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
}

function navNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
}

function navEdges(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]'));
}

function invalidEdges(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"][data-invalid="true"], [data-testid="nav-edge-selected"][data-invalid="true"]'));
}

/** Select an edge by clicking its transparent hit line (one click = select). */
function selectEdge(container: HTMLElement, x: number, y: number) {
  const svg = stubSvgRect(container);
  const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
  expect(hit).toBeTruthy();
  fireEvent.mouseDown(hit, { clientX: x, clientY: y, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

describe("B5 Phase 2.11 — invalid existing edge state + Add Bend repair UX", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
    onCampusChange = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // ── 1. LIVE VALIDITY: Remove Bend can invalidate an existing edge ──

  it("Remove Bend that causes a wall collision marks the edge INVALID (red + warning)", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withValidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    selectEdge(container, 60, 40);
    fireEvent.click(screen.getByTestId("nav-path-remove-bend"));

    expect(latestCampus(onCampusChange).navEdges[0].bendPoints ?? []).toHaveLength(0);
    const edgeEl = navEdges(container)[0];
    expect(edgeEl.getAttribute("data-invalid")).toBe("true");
    expect(edgeEl.getAttribute("stroke")).toBe("#dc2626");
    // Selected invalid edge: warning marker near the path + message in properties.
    expect(container.querySelector('[data-testid="nav-edge-invalid-marker"]')).toBeTruthy();
    expect(screen.getByTestId("nav-edge-blocked-warning")).toBeTruthy();
  });

  it("deleting the last bend (Delete key) leaves a diagonal wall-crossing edge INVALID", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withValidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    selectEdge(container, 60, 40);
    const handle = container.querySelector('[data-testid="nav-bend-handle"]') as SVGGElement;
    expect(handle).toBeTruthy();
    fireEvent.mouseDown(handle, { clientX: 160, clientY: 40, bubbles: true });
    expect(screen.getByTestId("nav-bend-selected")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Delete", bubbles: true });

    expect(latestCampus(onCampusChange).navEdges[0].bendPoints ?? []).toHaveLength(0);
    expect(invalidEdges(container)).toHaveLength(1);
  });

  it("a selected INVALID edge keeps its bend/segment editing handles", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withInvalidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    selectEdge(container, 50, 40);

    expect(invalidEdges(container)).toHaveLength(1);
    // Bends (and therefore their handles) survive the invalid state — repair possible.
    expect(container.querySelectorAll('[data-testid="nav-bend-handle"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="nav-edge-hit"]')).toBeTruthy();
  });

  // ── 2. REPAIR: segment drag + free-endpoint movement re-validate live ──

  it("segment drag is the primary repair — dragging clear restores valid styling", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withInvalidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    selectEdge(container, 50, 40); // select (click 1)
    // Click 2 on the interior vertical segment (90,40)→(90,16) starts the drag.
    const hit = container.querySelector('[data-testid="nav-edge-hit"]') as Element;
    fireEvent.mouseDown(hit, { clientX: 90, clientY: 28, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 28, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toEqual([{ x: 160, y: 40 }, { x: 160, y: 16 }]);
    expect(invalidEdges(container)).toHaveLength(0);
    expect(navEdges(container)[0].getAttribute("data-invalid")).toBeNull();
  });

  it("moving a FREE endpoint recomputes validity — repair restores valid styling", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withInvalidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 160, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latestCampus(onCampusChange).navNodes[1].y).toBe(40);
    expect(invalidEdges(container)).toHaveLength(0);
  });

  // ── 3. ADD BEND: no more no-op, useful orthogonal dog-leg, wall-aware side ──

  it("Add Bend on a straight segment is NOT a no-op — useful orthogonal dog-leg", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withStraightEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    selectEdge(container, 100, 20);
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.click(screen.getByTestId("nav-path-add-bend"));

    expect(onCampusChange.mock.calls.length).toBe(callsBefore + 1);
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toEqual([{ x: 100, y: 20 }, { x: 100, y: 44 }, { x: 180, y: 44 }]);
    // Total polyline length: 80 + 24 + 80 + 24 = 208 (straight was 160).
    expect(edge.distance).toBe(208);
    // Rendered polyline has 5 points (start + 3 bends + end) — NOT normalized away.
    const pts = (navEdges(container)[0].getAttribute("points") ?? "").trim().split(/\s+/);
    expect(pts).toHaveLength(5);
    const seen = new Set(edge.bendPoints!.map((p) => `${p.x},${p.y}`));
    expect(seen.size).toBe(3); // no duplicates / zero-length
    // The dog-leg is axis-aligned (editable orthogonal geometry).
    const all = [{ x: 20, y: 20 }, ...edge.bendPoints!, { x: 180, y: 20 }];
    expect(all.every((p, i) =>
      i === all.length - 1 || p.x === all[i + 1].x || p.y === all[i + 1].y
    )).toBe(true);
  });

  it("Add Bend picks the CLEAR side when the other side is wall-blocked", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withValidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    selectEdge(container, 60, 40);
    fireEvent.click(screen.getByTestId("nav-path-add-bend"));

    const edge = latestCampus(onCampusChange).navEdges[0];
    // Longest segment (20,40)→(160,40): the downward dog-leg (y=64) sits inside
    // the wall band (61..79) → rejected; the upward side (y=16) is chosen.
    expect(edge.bendPoints).toEqual([{ x: 90, y: 40 }, { x: 90, y: 16 }, { x: 160, y: 16 }, { x: 160, y: 40 }]);
    // The edited edge stays VALID (no wall-crossing introduced).
    expect(invalidEdges(container)).toHaveLength(0);
  });

  it("Add Bend does not create excessive/redundant bends (one dog-leg only)", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withStraightEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    selectEdge(container, 100, 20);
    fireEvent.click(screen.getByTestId("nav-path-add-bend"));
    const edge = latestCampus(onCampusChange).navEdges[0];
    expect(edge.bendPoints).toHaveLength(3); // the minimal U-shape corner pair
    const pts = (navEdges(container)[0].getAttribute("points") ?? "").trim().split(/\s+/);
    expect(pts).toHaveLength(5);
  });

  // ── 4. NEW CONNECT RULES PRESERVED (creation never commits invalid paths) ──

  it("a NEW invalid Connect still cannot commit — red preview, Connect stays active", () => {
    const campus = withWall(makeBaseCampus());
    campus.navNodes = [FREE_NODE("n1", 90, 20), FREE_NODE("n2", 90, 120)];
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 90, clientY: 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 90, clientY: 120, bubbles: true });
    expect(container.querySelectorAll('[data-testid="floor-nav-preview-invalid"]')).toHaveLength(1);
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 90, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(navEdges(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore); // no history
    expect(screen.getByTestId("floor-nav-connect-preview")).toBeTruthy(); // still active
  });

  // ── 5. DOOR LOCALITY + DESIGN OVERLAY + ISSUES ──

  it("a Door-valid existing edge stays valid — the same wall AWAY from the Door stays blocked", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDoorEdge(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();

    const edges = navEdges(container);
    expect(edges).toHaveLength(2);
    // e1 crosses through the door opening → valid.
    expect(edges[0].getAttribute("data-invalid")).toBeNull();
    // e2 crosses the same wall 100 units away from the door → blocked.
    expect(edges[1].getAttribute("data-invalid")).toBe("true");
    expect(edges[1].getAttribute("stroke")).toBe("#dc2626");
  });

  it("Design Show Navigation overlay flags the invalid edge (subdued red, read-only)", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withInvalidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    // Design mode is the default; enable the read-only navigation overlay.
    fireEvent.click(screen.getByRole("button", { name: /Show Navigation/ }));

    const overlay = container.querySelector('[data-testid="floor-nav-overlay"]');
    expect(overlay).toBeTruthy();
    const flagged = overlay!.querySelectorAll('polyline[data-invalid="true"]');
    expect(flagged).toHaveLength(1);
    expect(flagged[0].getAttribute("stroke")).toBe("#dc2626");
  });

  it("the Issues dialog counts a wall-blocked edge and clicking it selects the edge for repair", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withInvalidBendEdge(makeBaseCampus())} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: /Issues/ }));

    const issueButton = screen.getByTestId("nav-edge-issue-e1");
    expect(issueButton).toBeTruthy();
    expect(screen.getByText("Navigation path crosses or overlaps a wall.")).toBeTruthy();
    fireEvent.click(issueButton);

    // Jumps into Navigation mode with the invalid edge selected + properties open.
    const selected = container.querySelector('[data-testid="nav-edge-selected"][data-invalid="true"]');
    expect(selected).toBeTruthy();
    expect(screen.getByTestId("floor-nav-edge-props")).toBeTruthy();
    expect(screen.getByTestId("nav-edge-blocked-warning")).toBeTruthy();
  });
});
