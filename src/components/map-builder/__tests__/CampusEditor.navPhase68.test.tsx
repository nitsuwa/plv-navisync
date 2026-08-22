import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode } from "../types";

// ── B5 Phase 6.8 — final browser-reality navigation parity ────────────────
// Outdoor Connect bend cleanup (one visual corner = one canonical bendPoint),
// inserted-waypoint source/target parity, reliable node-target clicks, and
// Floor-parity outdoor segment dragging + Add/Remove/Straighten actions.

function makeCampus(): Campus {
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
    publishStatus: "published",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1",
      name: "Building One",
      code: "B1",
      category: "Academic",
      description: "",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      color: "#1e40af",
      expanded: false,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
    }],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ onCampusChange, initialCampus }: { onCampusChange?: (c: Campus) => void; initialCampus?: Campus }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus ?? makeCampus());
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus ?? makeCampus())}
    />
  );
}

let warningSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
  infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
});

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svgs = Array.from(container.querySelectorAll("svg")).filter((s) => s.getAttribute("viewBox") === "0 0 900 680");
  const svg = svgs[svgs.length - 1];
  expect(svg).toBeTruthy();
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 900, bottom: 680, width: 900, height: 680, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg as SVGSVGElement;
}

function openNavigationLayer(container: HTMLElement): SVGSVGElement {
  fireEvent.click(screen.getByText("Navigation"));
  return canvasSvg(container);
}

function navNodeAt(container: HTMLElement, x: number, y: number): SVGGElement {
  const g = Array.from(container.querySelectorAll<SVGGElement>("[data-testid='nav-node']")).find((el) => {
    const c = el.querySelector("circle");
    return c && Math.abs(Number(c.getAttribute("cx")) - x) < 2 && Math.abs(Number(c.getAttribute("cy")) - y) < 2;
  });
  expect(g, `nav node at (${x}, ${y})`).toBeTruthy();
  return g!;
}

function seededCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  return campus;
}

function diagonalCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 400, y: 400, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnC", name: "Gate C", type: "outdoor", x: 400, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  // A legacy pure-diagonal edge (no bends) between nnA and nnB.
  campus.navEdges = [
    { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: Math.round(Math.hypot(200, 200)), bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
  ];
  return campus;
}

function straightEdgeCampus(): Campus {
  const campus = seededCampus();
  campus.navEdges = [
    { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
  ];
  return campus;
}

function bentEdgeCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 400, y: 300, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 300, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 400, y: 200 }] },
  ];
  return campus;
}

afterEach(cleanup);

describe("B5 Phase 6.8 — outdoor Connect bend cleanup + node target priority", () => {
  it("a single diagonal click pins corner + click point (Floor parity); commit keeps one clean corner per turn — no near-duplicate stacked circles", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 300, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // B5 Phase 6.9 (Floor Editor parity): ONE diagonal click at (260,260) pins
    // the FULL preview shape — the auto-L corner (260,200) AND the click point
    // (260,260), which becomes the new continuation anchor (the click point is
    // NEVER dropped back onto the source / old geometry).
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Commit to the diagonal destination (300,300) — the tail auto-L corner
    // (300,260) joins the already-pinned shape. All three bends are DISTINCT
    // corners of the orthogonal route: no near-duplicate/stacked circles.
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navEdges).toHaveLength(1);
    const bends = latest!.navEdges![0].bendPoints;
    expect(bends).toBeDefined();
    // Same shape Floor Editor produces for this exact gesture: A → (260,200)
    // → (260,260) → (300,260) → (300,300).
    expect(bends).toEqual([
      { x: 260, y: 200 },
      { x: 260, y: 260 },
      { x: 300, y: 260 },
    ]);
    // 60 + 60 + 40 + 40 = 200 (the last leg (300,260)→(300,300) is 40 units).
    expect(latest!.navEdges![0].distance).toBe(200);
  });

  it("near-duplicate pinned + regenerated corners collapse to ONE clean bend", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 401, y: 300, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Pin at (400,200) — the always-on node alignment snaps X to the (401,300)
    // node's axis (Floor parity), so the pinned corner lands exactly on the
    // regenerated corner (401,200): ONE clean bend, no stacked handles.
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 401, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const bends = latest!.navEdges![0].bendPoints;
    expect(bends!.length).toBe(1);
    expect(bends![0]).toEqual({ x: 401, y: 200 });
  });

  it("a waypoint inserted into a DIAGONAL edge is a real canonical source (exact node position, no extra bend)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={diagonalCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Insert W into the diagonal A→B edge at (300,300).
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navNodes).toHaveLength(4);
    const w = latest!.navNodes!.find((n) => n.x === 300 && n.y === 300);
    expect(w).toBeTruthy();
    // The old diagonal was split into A-W + W-B (no legacy geometry left).
    expect(latest!.navEdges).toHaveLength(2);
    expect(latest!.navEdges!.every((e) => e.startNodeId === w!.id || e.endNodeId === w!.id)).toBe(true);

    // Connect from W → C: the source must be EXACTLY W (300,300).
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 300, 300), { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Move the pointer (preview must start at W) then commit on C.
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 240, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const edge = latest!.navEdges!.find((e) => e.startNodeId === w!.id && e.endNodeId === "nnC");
    expect(edge).toBeTruthy();
    // ONE clean L corner — NO extra bend on/around W, no duplicate source point.
    expect(edge!.bendPoints).toEqual([{ x: 400, y: 300 }]);
  });

  it("clicking a visible Waypoint target ALWAYS commits (node target priority over empty-space pinning)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Click 6 units off B's center — inside the preview snap radius (12) but
    // outside the old 7-unit visual circle. This previously fell through to
    // empty-space bend pinning beside the node.
    fireEvent.mouseDown(svg, { clientX: 306, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0]).toMatchObject({ startNodeId: "nnA", endNodeId: "nnB" });
    // No stray bend was pinned at the click position.
    expect(latest!.navEdges![0].bendPoints).toBeUndefined();
  });

  it("self-target is rejected cleanly (no self-edge, no bend at source)", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
    expect(warningSpy).toHaveBeenCalledWith(
      "Cannot connect a waypoint to itself",
      expect.objectContaining({ description: "Pick a different destination waypoint." })
    );
  });

  it("visual target overlays never intercept the destination click (preview ring is pointer-events-none)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Hover B → the ghost preview ring renders at B (pointer-events-none group).
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 200, bubbles: true });
    expect(container.querySelector("[data-testid='nav-path-preview']")).toBeTruthy();
    // Click exactly on the preview ring position → must commit, not pin a bend.
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0].endNodeId).toBe("nnB");
    expect(latest!.navEdges![0].bendPoints).toBeUndefined();
    expect(container.querySelector("[data-testid='nav-path-preview']")).toBeNull();
  });
});

describe("B5 Phase 6.8 — Floor-parity outdoor segment drag", () => {
  it("pointerdown on the selected straight segment starts a nav segment drag (not pan), creating an orthogonal U-dog-leg", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={straightEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    // First click selects the edge.
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Second pointerdown on the LINE drags the segment vertically.
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeDefined();
    const edge = latest!.navEdges![0];
    expect(edge.bendPoints).toEqual([
      { x: 200, y: 250 },
      { x: 300, y: 250 },
    ]);
    // Endpoints stay fixed — the dog-leg is purely orthogonal, never a V diagonal.
    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 200, y: 200 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 300, y: 200 });
    expect(edge.distance).toBe(200);
  });

  it("bent edge: dragging the vertical segment changes X only; endpoints remain fixed", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    fireEvent.mouseDown(edgeG, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Drag the VERTICAL segment (400,200)→(400,300) sideways.
    fireEvent.mouseDown(edgeG, { clientX: 400, clientY: 250, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 450, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const edge = latest!.navEdges![0];
    expect(edge.bendPoints).toEqual([
      { x: 450, y: 200 },
      { x: 450, y: 300 },
    ]);
    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 200, y: 200 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 400, y: 300 });
  });

  it("one history entry per segment drag — Ctrl+Z restores, Ctrl+Y reapplies", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={straightEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    fireEvent.mouseDown(edgeG, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(edgeG, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 250, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges![0].bendPoints).toHaveLength(2);

    fireEvent.click(screen.getByTitle(/Undo/));
    expect(latest!.navEdges![0].bendPoints).toBeUndefined();
    expect(latest!.navEdges![0].distance).toBe(100);
    fireEvent.click(screen.getByTitle(/Redo/));
    expect(latest!.navEdges![0].bendPoints).toEqual([
      { x: 200, y: 250 },
      { x: 300, y: 250 },
    ]);
  });

  it("bend handles still work after the segment-drag changes", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    fireEvent.mouseDown(edgeG, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handle = container.querySelector("circle[fill='var(--accent)'][stroke='white']") as SVGCircleElement;
    expect(handle).toBeTruthy();
    fireEvent.mouseDown(handle, { clientX: 400, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 450, clientY: 220, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // B5 Phase 6.9: bend drags are NOT grid-snapped anymore (Floor parity) —
    // the bend lands exactly on the pointer (450,220), never a 20px multiple.
    expect(latest!.navEdges![0].bendPoints![0]).toEqual({ x: 450, y: 220 });
  });
});

describe("B5 Phase 6.8 — outdoor edge geometry actions", () => {
  it("Add Bend inserts a useful orthogonal dog-leg (never a collinear midpoint)", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByTestId("nav-edge-add-bend"));

    const bends = latest!.navEdges![0].bendPoints;
    expect(bends).toBeDefined();
    // A U-dog-leg: corner on the line + two offset corners — all orthogonal.
    expect(bends!.length).toBe(3);
    expect(bends![0]).toEqual({ x: 250, y: 200 });
    expect(bends![1].x).toBe(250);
    expect(bends![2].y).toBe(bends![1].y);
  });

  it("Remove Bend removes a bend and normalizes the survivor geometry", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 148, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 250, y: 200 }, { x: 250, y: 224 }, { x: 300, y: 224 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 260, clientY: 210, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByTestId("nav-edge-remove-bend"));

    const bends = latest!.navEdges![0].bendPoints;
    expect(bends!.length).toBe(2);
  });

  it("Straighten removes all bends when the direct line is clear", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 148, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 250, y: 220 }, { x: 260, y: 200 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByTestId("nav-edge-straighten"));

    expect(latest!.navEdges![0].bendPoints).toBeUndefined();
    expect(latest!.navEdges![0].distance).toBe(100);
  });

  it("Straighten does NOT commit through a blocking building (toast + geometry kept)", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.buildings = [{ ...campus.buildings[0], x: 150, y: 100, width: 100, height: 80 }];
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 100, y: 140, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 140, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 340, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 200, y: 240 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 150, clientY: 190, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // The panel itself disables Straighten (direct line crosses the building).
    const straighten = screen.getByTestId("nav-edge-straighten") as HTMLButtonElement;
    expect(straighten.disabled).toBe(true);
    fireEvent.click(straighten);

    expect(latest).toBeUndefined();
    expect(campus.navEdges![0].bendPoints).toEqual([{ x: 200, y: 240 }]);
  });

  it("Straighten does NOT commit through a blocking solid asset", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.buildings = [];
    campus.decorAssets = [
      { id: "tree1", type: "tree", x: 190, y: 120, width: 30, height: 30, rotation: 0, scale: 1 },
    ];
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 100, y: 140, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 140, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 360, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 260, y: 220 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 180, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const straighten = screen.getByTestId("nav-edge-straighten") as HTMLButtonElement;
    expect(straighten.disabled).toBe(true);
    fireEvent.click(straighten);
    expect(latest).toBeUndefined();
    expect(campus.navEdges![0].bendPoints).toEqual([{ x: 260, y: 220 }]);
  });
});
