import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

// ── B5 Phase 6.9 — Floor-parity outdoor nav movement + Connect click routing ─
// 1. Connect-tool clicks that land on an EDGE hit polyline (a waypoint that
//    sits ON a diagonal edge / was inserted between two waypoints) fall through
//    to node-target priority instead of being swallowed by edge selection.
// 2. Bend dragging matches the Floor Editor: Shift = strict H/V constraint,
//    no 20px grid snap, near-axis snap tolerance, alignment guides.
// 3. Node dragging matches the Floor Editor: no grid snap (freely alignable
//    so edges can be made perfectly straight), alignment guides preserved.

function makeCampus(): Campus {
  return {
    id: "c1", name: "Test Campus", code: "TC", description: "", address: "", city: "", province: "",
    postalCode: "", status: "active", publishStatus: "published", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900, canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{ id: "b1", name: "Building One", code: "B1", category: "Academic", description: "", x: 100, y: 100, width: 120, height: 80, color: "#1e40af", expanded: false, floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }] }],
    markers: [], paths: [], navNodes: [], navEdges: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

function diagonalCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 400, y: 400, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnC", name: "Gate C", type: "outdoor", x: 400, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: Math.round(Math.hypot(200, 200)), bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
  ];
  return campus;
}

function straightEdgeCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
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
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
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

afterEach(cleanup);

describe("B5 Phase 6.9 — Connect clicks fall through the edge hit polyline (diagonal/inserted waypoints)", () => {
  it("Connect click on a waypoint sitting ON a diagonal edge starts from that node (edge hit no longer swallows it)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={diagonalCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Insert W into the diagonal A→B edge at (300,300).
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const w = latest!.navNodes.find((n) => n.x === 300 && n.y === 300);
    expect(w).toBeTruthy();
    // The split edge A→W must carry a REAL distance (not the old zero-length bug).
    const aToW = latest!.navEdges.find((e) => e.startNodeId === "nnA" && e.endNodeId === w!.id);
    expect(aToW).toBeTruthy();
    expect(aToW!.distance).toBeGreaterThan(0);
    const wToB = latest!.navEdges.find((e) => e.startNodeId === w!.id && e.endNodeId === "nnB");
    expect(wToB).toBeTruthy();
    expect(wToB!.distance).toBeGreaterThan(0);

    // Connect tool. In a real browser the click on W first hits the EDGE hit
    // polyline (the diagonal A→W passes exactly through W). The edge must let
    // the click fall through so node-target priority starts Connect at W.
    fireEvent.keyDown(window, { key: "p" });
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    expect(edgeG).toBeTruthy();
    // Dispatch the pointerdown ON the edge element at W's position — exactly
    // what a browser does when the edge's 14px hit stroke is under the cursor.
    fireEvent.mouseDown(edgeG, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // The preview must start from W's center — no extra bend on/around W.
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 240, bubbles: true });
    const preview = container.querySelector("[data-testid='nav-path-preview']");
    const previewPts = preview ? preview.querySelector("polyline")?.getAttribute("points") : null;
    expect(previewPts).toBeTruthy();
    expect(previewPts!.startsWith("300,300")).toBe(true);

    // Commit to C: one clean L-bend, W→C.
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const wc = latest!.navEdges.find((e) => e.startNodeId === w!.id && e.endNodeId === "nnC");
    expect(wc).toBeTruthy();
    expect(wc!.bendPoints).toEqual([{ x: 400, y: 300 }]);
  });

  it("Connect click on the diagonal edge NOT near a node pins a bend (fall-through, no crash)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={diagonalCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Click the diagonal edge well away from any node.
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    fireEvent.mouseDown(edgeG, { clientX: 330, clientY: 330, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Pinning a bend only updates local connect state (the edge commits on
    // destination click) — the pinned corner shows up in the live preview.
    const preview = container.querySelector("[data-testid='nav-path-preview']");
    expect(preview).toBeTruthy();
    const pinned = preview!.querySelectorAll("circle").length;
    expect(pinned).toBeGreaterThan(1); // ghost ring + pinned bend markers
    // No crash, source still armed — finish the connection to confirm commit.
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges.find((e) => e.startNodeId === "nnA" && e.endNodeId === "nnC")).toBeTruthy();
  });
});

describe("B5 Phase 6.9 — Floor-parity bend dragging (Shift H/V, no grid snap)", () => {
  it("Shift-dragging a bend constrains it to the dominant axis (X moves, Y stays)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    fireEvent.mouseDown(edgeG, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handle = container.querySelector("circle[fill='var(--accent)'][stroke='white']") as SVGCircleElement;
    expect(handle).toBeTruthy();
    fireEvent.mouseDown(handle, { clientX: 400, clientY: 200, shiftKey: true, bubbles: true });
    // Dominant delta is horizontal (450 vs 220) → X moves, Y locked at 200.
    fireEvent.mouseMove(svg, { clientX: 450, clientY: 220, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges![0].bendPoints![0]).toEqual({ x: 450, y: 200 });
  });

  it("Shift-dragging a bend the other way locks X and moves Y only", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    fireEvent.mouseDown(edgeG, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handle = container.querySelector("circle[fill='var(--accent)'][stroke='white']") as SVGCircleElement;
    fireEvent.mouseDown(handle, { clientX: 400, clientY: 200, shiftKey: true, bubbles: true });
    // Dominant delta is vertical (390 vs 250) → Y moves, X locked at 400.
    fireEvent.mouseMove(svg, { clientX: 390, clientY: 250, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges![0].bendPoints![0]).toEqual({ x: 400, y: 250 });
  });

  it("bend drag without Shift is NOT grid-snapped (lands on exact pointer position)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const edgeG = container.querySelector("[data-testid='nav-edge']") as SVGGElement;
    fireEvent.mouseDown(edgeG, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handle = container.querySelector("circle[fill='var(--accent)'][stroke='white']") as SVGCircleElement;
    fireEvent.mouseDown(handle, { clientX: 400, clientY: 200, bubbles: true });
    // 447 is NOT a multiple of 20 — a grid-snapped implementation would move it.
    fireEvent.mouseMove(svg, { clientX: 447, clientY: 218, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges![0].bendPoints![0]).toEqual({ x: 447, y: 218 });
  });
});

describe("B5 Phase 6.9 — Floor-parity node dragging (no grid snap, edges can be straightened)", () => {
  it("dragging a waypoint to a non-grid position keeps the exact pointer position", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={straightEdgeCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const node = navNodeAt(container, 300, 200);
    fireEvent.mouseDown(node, { clientX: 300, clientY: 200, bubbles: true });
    // 317 is NOT a multiple of 20 — grid snap would round to 320.
    fireEvent.mouseMove(svg, { clientX: 317, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const moved = latest!.navNodes.find((n) => n.id === "nnB");
    expect(moved).toMatchObject({ x: 317, y: 200 });
  });

  it("alignment guides still snap a dragged node to another node's axis (guides set)", () => {
    let latest: Campus | undefined;
    const campus = straightEdgeCampus();
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnD", name: "Gate D", type: "outdoor", x: 150, y: 320, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    const node = navNodeAt(container, 150, 320);
    fireEvent.mouseDown(node, { clientX: 150, clientY: 320, bubbles: true });
    // Dragging toward y=200 (within the 12px SNAP_DIST of nnB's y) aligns Y.
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 204, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const moved = latest!.navNodes.find((n) => n.id === "nnD");
    expect(moved!.y).toBe(200);
  });
});
