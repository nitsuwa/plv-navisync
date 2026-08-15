import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus, NavigationNode } from "../types";

// ── B5 FINAL CORRECTION — Floor Editor nav graph group move ───────────────
// Multi-selected free waypoints AND the bends of edges whose both endpoints
// are selected translate together (same shared pure helper as the outdoor
// editor); the group outline spans the whole moving substructure.

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

function bentGraphCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nA", name: "Waypoint A", type: "hallway", x: 60, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "nB", name: "Waypoint B", type: "hallway", x: 160, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "nC", name: "Waypoint C", type: "hallway", x: 40, y: 140, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "ne1", startNodeId: "nA", endNodeId: "nB", distance: 120, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", bendPoints: [{ x: 110, y: 80 }] },
    { id: "ne2", startNodeId: "nB", endNodeId: "nC", distance: 60, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", bendPoints: [{ x: 100, y: 120 }] },
  ];
  return campus;
}

function Harness({ initialCampus, onCampusChange }: { initialCampus: Campus; onCampusChange: (c: Campus) => void }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange(c); setCampus(c); }}
      onSave={async () => campus}
    />
  );
}

function canvasSvg(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).filter((s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`)[0] as SVGSVGElement | undefined;
  expect(svg).toBeTruthy();
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg.viewBox, "baseVal", { configurable: true, value: { width: w, height: h, x: 0, y: 0 } });
  Object.defineProperty(svg.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function enterNavigationMode() {
  fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
}

function navNodeAt(container: HTMLElement, x: number): SVGGElement {
  const nodes = Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
  const g = nodes.find((el) => el.querySelector("circle")?.getAttribute("cx") === String(x));
  expect(g, `free nav node at x=${x}`).toBeTruthy();
  return g!;
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

describe("FloorEditor nav graph group move (B5 correction)", () => {
  it("arrow nudge translates selected nodes AND the bends of edges whose both endpoints are selected", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentGraphCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    enterNavigationMode();
    // Select A, then shift-select B → group {A, B}.
    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 160), { clientX: 160, clientY: 100, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowDown" });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nA")).toMatchObject({ x: 60, y: 101 });
    expect(nodes.find((n) => n.id === "nB")).toMatchObject({ x: 160, y: 101 });
    // Unselected C stays put.
    expect(nodes.find((n) => n.id === "nC")).toMatchObject({ x: 40, y: 140 });
    // ne1 (A+B both moving) carries its bend; ne2 (only B moving) keeps it.
    const edges = latest!.navEdges!;
    expect(edges.find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 110, y: 81 }]);
    expect(edges.find((e) => e.id === "ne2")!.bendPoints).toEqual([{ x: 100, y: 120 }]);
  });

  it("group mouse drag translates bends rigidly (same helper as the nudge)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentGraphCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    enterNavigationMode();
    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 160), { clientX: 160, clientY: 100, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Drag A by (4, 6) — the group follows.
    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 64, clientY: 106, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nA")).toMatchObject({ x: 64, y: 106 });
    expect(nodes.find((n) => n.id === "nB")).toMatchObject({ x: 164, y: 106 });
    expect(latest!.navEdges!.find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 114, y: 86 }]);
    // ne2 keeps its bend (only nB is a selected endpoint).
    expect(latest!.navEdges!.find((e) => e.id === "ne2")!.bendPoints).toEqual([{ x: 100, y: 120 }]);
  });

  it("renders a group outline spanning the selected nodes + their bend geometry", () => {
    const { container } = render(<Harness initialCampus={bentGraphCampus()} onCampusChange={() => {}} />);
    const svg = canvasSvg(container);
    enterNavigationMode();
    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 160), { clientX: 160, clientY: 100, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const outline = container.querySelector("[data-testid='floor-nav-group-outline'] rect") as SVGRectElement | null;
    expect(outline).toBeTruthy();
    // The A–B bend at y=80 sits ABOVE the node row (y=100) — the outline must
    // reach it: top edge (y attr) = 80 - 18 = 62.
    const y = Number(outline!.getAttribute("y"));
    expect(y).toBe(62);
  });

  it("pointerdown on EMPTY space inside the outline starts the same rigid group drag", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentGraphCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    enterNavigationMode();
    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 160), { clientX: 160, clientY: 100, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Grab the empty interior (below the bend, above the node row).
    const surface = container.querySelector("[data-testid='floor-nav-group-drag-surface']") as SVGRectElement | null;
    expect(surface).toBeTruthy();
    const sx = 110;
    const sy = 90;
    fireEvent.mouseDown(surface!, { clientX: sx, clientY: sy, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: sx + 40, clientY: sy + 25, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nA")).toMatchObject({ x: 100, y: 125 });
    expect(nodes.find((n) => n.id === "nB")).toMatchObject({ x: 200, y: 125 });
    // Unselected C stays put.
    expect(nodes.find((n) => n.id === "nC")).toMatchObject({ x: 40, y: 140 });
    // Internal A–B edge carries its bend rigidly; boundary edge keeps its own.
    expect(latest!.navEdges!.find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 150, y: 105 }]);
    expect(latest!.navEdges!.find((e) => e.id === "ne2")!.bendPoints).toEqual([{ x: 100, y: 120 }]);
  });

  it("multiple pointermoves are NOT compounded — total delta applies to the drag-start snapshot", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentGraphCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    enterNavigationMode();
    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 160), { clientX: 160, clientY: 100, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    // Cursor sweeps +10 twice → total +20. Nodes must land at +20, NOT +10+20.
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 80, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nA")).toMatchObject({ x: 80, y: 100 });
    expect(nodes.find((n) => n.id === "nB")).toMatchObject({ x: 180, y: 100 });
    expect(latest!.navEdges!.find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 130, y: 80 }]);
  });

  it("outline-empty drag commits ONE history entry; undo restores exact geometry", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={bentGraphCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    enterNavigationMode();
    fireEvent.mouseDown(navNodeAt(container, 60), { clientX: 60, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 160), { clientX: 160, clientY: 100, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const surface = container.querySelector("[data-testid='floor-nav-group-drag-surface']") as SVGRectElement | null;
    const sx = 110;
    const sy = 90;
    fireEvent.mouseDown(surface!, { clientX: sx, clientY: sy, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: sx + 12, clientY: sy - 8, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navNodes!.find((n) => n.id === "nA")).toMatchObject({ x: 72, y: 92 });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latest!.navNodes!.find((n) => n.id === "nA")).toMatchObject({ x: 60, y: 100 });
    expect(latest!.navNodes!.find((n) => n.id === "nB")).toMatchObject({ x: 160, y: 100 });
    expect(latest!.navEdges!.find((e) => e.id === "ne1")!.bendPoints).toEqual([{ x: 110, y: 80 }]);
  });
});
