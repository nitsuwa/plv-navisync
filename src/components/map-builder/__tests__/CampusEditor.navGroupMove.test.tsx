import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode } from "../types";

// ── B5 FINAL CORRECTION — true nav graph group move + Reverse Direction ──
// 1. Multi-selected waypoints AND the bends of edges whose both endpoints are
//    selected translate together (mouse drag AND arrow nudge share ONE pure
//    helper — no torn graph geometry).
// 2. Reverse Direction on a one-way bent edge swaps endpoints AND reverses
//    bendPoints order so the exact visible polyline is preserved losslessly.

function makeCampus(overrides?: Partial<Campus>): Campus {
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
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function node(overrides: Partial<NavigationNode> & { id: string }): NavigationNode {
  return { name: overrides.id, type: "outdoor", x: 200, y: 200, accessible: true, color: "#16a34a", ...overrides };
}

function bentEdgeCampus(): Campus {
  return makeCampus({
    navNodes: [
      node({ id: "nnA", x: 200, y: 200 }),
      node({ id: "nnB", x: 400, y: 200 }),
      node({ id: "nnC", x: 400, y: 400 }),
    ],
    navEdges: [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 300, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 300, y: 160 }] },
      { id: "ne2", startNodeId: "nnB", endNodeId: "nnC", distance: 200, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 440, y: 300 }] },
    ],
  });
}

function Harness({ initialCampus, onCampusChange }: { initialCampus: Campus; onCampusChange: (c: Campus) => void }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus)}
    />
  );
}

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
  fireEvent.click(screen.getByText("2. Navigation"));
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

function shiftSelect(container: HTMLElement, x: number, y: number) {
  const svg = canvasSvg(container);
  fireEvent.mouseDown(navNodeAt(container, x, y), { clientX: x, clientY: y, shiftKey: true, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

let warningSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
  infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
});

afterEach(() => {
  cleanup();
  warningSpy.mockRestore();
  infoSpy.mockRestore();
});

describe("CampusEditor nav graph group move (B5 correction)", () => {
  it("arrow nudge translates selected nodes AND the bends of edges whose both endpoints are selected", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    openNavigationLayer(container);
    // Select A, shift-select B → the A–B edge (both endpoints selected) rides rigidly.
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { bubbles: true });
    shiftSelect(container, 400, 200);
    fireEvent.keyDown(window, { key: "ArrowRight" });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 201, y: 200 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 401, y: 200 });
    // Unselected C stays put.
    expect(nodes.find((n) => n.id === "nnC")).toMatchObject({ x: 400, y: 400 });
    // ne1 (A+B both moving) carries its bend; ne2 (only B moving) keeps it.
    const edges = latest!.navEdges!;
    expect(edges.find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 301, y: 160 }]);
    expect(edges.find((e) => e.id === "ne2")!.bendPoints).toEqual([{ x: 440, y: 300 }]);
  });

  it("group drag (mouse) uses the same rigid translation — bends ride with the group", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    shiftSelect(container, 400, 200);
    // Drag A by (5, 7).
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 205, clientY: 207, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 205, y: 207 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 405, y: 207 });
    expect(edgesOf(latest!).find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 305, y: 167 }]);
    // Partial-move edge (only B selected endpoint moves) keeps its bend.
    expect(edgesOf(latest!).find((e) => e.id === "ne2")!.bendPoints).toEqual([{ x: 440, y: 300 }]);
  });

  it("undo restores the exact node + bend geometry after a group nudge", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    openNavigationLayer(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { bubbles: true });
    shiftSelect(container, 400, 200);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(latest!.navNodes!.find((n) => n.id === "nnA")!.y).toBe(201);

    // One undo restores the ENTIRE pre-nudge graph (nodes + bends).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 200, y: 200 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 400, y: 200 });
    expect(edgesOf(latest!).find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 300, y: 160 }]);
  });

  it("renders a group outline that includes the selected edge bend geometry", () => {
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={() => {}} />);
    openNavigationLayer(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { bubbles: true });
    shiftSelect(container, 400, 200);

    const outline = container.querySelector("[data-testid='campus-group-outline']") as SVGRectElement | null;
    expect(outline).toBeTruthy();
    // Bounds reach ABOVE the node row to cover the A–B bend at y=160 (nodes at
    // y=200) — the outline spans the whole moving substructure.
    const y = Number(outline!.getAttribute("y"));
    const height = Number(outline!.getAttribute("height"));
    expect(y + 18).toBeLessThan(200); // padding 18 → top edge above 182
    expect(height).toBeGreaterThan(40);
  });

  it("pointerdown on EMPTY space inside the outline starts the same rigid group drag", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    shiftSelect(container, 400, 200);

    // Grab the empty interior ABOVE the node row (no node/edge/bend there —
    // inside the outline, which reaches above y=182).
    const surface = container.querySelector("[data-testid='campus-group-drag-surface']") as SVGRectElement | null;
    expect(surface).toBeTruthy();
    const sx = 300;
    const sy = 175;
    fireEvent.mouseDown(surface!, { clientX: sx, clientY: sy, bubbles: true });
    // Move 1:1 (+40, +25) — must NOT rubber-band, clear selection, or pan.
    fireEvent.mouseMove(svg, { clientX: sx + 40, clientY: sy + 25, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 240, y: 225 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 440, y: 225 });
    expect(nodes.find((n) => n.id === "nnC")).toMatchObject({ x: 400, y: 400 });
    expect(edgesOf(latest!).find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 340, y: 185 }]);
    // Selection survives (no rubber-band clear).
    expect(container.querySelector("[data-testid='nav-node']") || container.querySelector("[data-testid='campus-group-outline']")).toBeTruthy();
  });

  it("multiple pointermoves are NOT compounded — every frame derives from the drag-start snapshot", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    shiftSelect(container, 400, 200);

    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    // Cursor sweeps +10 twice: total +20. Nodes must land at 200+20=220, NOT
    // 200+10+20=230 (which is what frame-compounding would produce).
    fireEvent.mouseMove(svg, { clientX: 210, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 220, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 220, y: 200 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 420, y: 200 });
    expect(edgesOf(latest!).find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 320, y: 160 }]);
  });

  it("outline-empty drag commits ONE history entry; undo restores exact geometry", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    shiftSelect(container, 400, 200);

    const surface = container.querySelector("[data-testid='campus-group-drag-surface']") as SVGRectElement | null;
    const sx = 300;
    const sy = 175;
    fireEvent.mouseDown(surface!, { clientX: sx, clientY: sy, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: sx + 12, clientY: sy - 8, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navNodes!.find((n) => n.id === "nnA")).toMatchObject({ x: 212, y: 192 });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latest!.navNodes!.find((n) => n.id === "nnA")).toMatchObject({ x: 200, y: 200 });
    expect(latest!.navNodes!.find((n) => n.id === "nnB")).toMatchObject({ x: 400, y: 200 });
    expect(edgesOf(latest!).find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 300, y: 160 }]);
  });
});

describe("CampusEditor Reverse Direction (B5 correction)", () => {
  it("swaps endpoints AND reverses bendPoints — exact polyline preserved", () => {
    let latest: Campus | undefined;
    const campus = makeCampus({
      navNodes: [
        node({ id: "nnA", x: 200, y: 200 }),
        node({ id: "nnB", x: 400, y: 300 }),
      ],
      navEdges: [
        { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 300, bidirectional: false, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 400, y: 200 }, { x: 400, y: 260 }] },
      ],
    });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 300, clientY: 220, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.click(screen.getByTestId("nav-edge-reverse-direction"));

    const edge = latest!.navEdges![0];
    expect(edge.startNodeId).toBe("nnB");
    expect(edge.endNodeId).toBe("nnA");
    // The polyline B→(400,260)→(400,200)→A is the exact reverse of
    // A→(400,200)→(400,260)→B — same coordinates, only order changed.
    expect(edge.bendPoints).toEqual([{ x: 400, y: 260 }, { x: 400, y: 200 }]);
    // Metadata survives untouched.
    expect(edge.bidirectional).toBe(false);
    expect(edge.distance).toBe(300);
    expect(edge.type).toBe("walkway");
    expect(edge.accessible).toBe(true);
    expect(edge.emergencySafe).toBe(true);
  });

  it("reverse on a straight one-way edge swaps endpoints with no bends", () => {
    let latest: Campus | undefined;
    const campus = makeCampus({
      navNodes: [
        node({ id: "nnA", x: 200, y: 200 }),
        node({ id: "nnB", x: 400, y: 200 }),
      ],
      navEdges: [
        { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 200, bidirectional: false, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
      ],
    });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.click(screen.getByTestId("nav-edge-reverse-direction"));
    expect(latest!.navEdges![0]).toMatchObject({ startNodeId: "nnB", endNodeId: "nnA", bendPoints: undefined });
  });
});

function edgesOf(campus: Campus) {
  return campus.navEdges ?? [];
}
