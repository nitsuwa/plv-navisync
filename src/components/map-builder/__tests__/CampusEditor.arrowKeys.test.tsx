import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode } from "../types";

// ── B5 Final — arrow-key nudge (Outdoor Editor) ───────────────────────────
// Arrow = 1 unit, Shift+Arrow = 10 units; works for nav nodes, buildings and
// multi-select groups; rapid nudges batch into one undo step.

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

describe("CampusEditor arrow-key nudge", () => {
  it("ArrowRight nudges a selected nav node by 1", () => {
    let latest: Campus | undefined;
    const campus = makeCampus({ navNodes: [node({ id: "nnA", x: 200, y: 200 })] });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    openNavigationLayer(container);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(latest!.navNodes![0].x).toBe(201);
    expect(latest!.navNodes![0].y).toBe(200);
  });

  it("Shift+Arrow nudges by 10", () => {
    let latest: Campus | undefined;
    const campus = makeCampus({ navNodes: [node({ id: "nnA", x: 200, y: 200 })] });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    openNavigationLayer(container);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(latest!.navNodes![0].x).toBe(210);
  });

  it("nudges a shift-selected group of nav nodes rigidly", () => {
    let latest: Campus | undefined;
    const campus = makeCampus({
      navNodes: [
        node({ id: "nnA", x: 200, y: 200 }),
        node({ id: "nnB", x: 300, y: 200 }),
        node({ id: "nnC", x: 400, y: 300 }),
      ],
    });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    openNavigationLayer(container);
    const svg = canvasSvg(container);
    // Select A, then shift-select B → group of two.
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    const movedA = latest!.navNodes!.find((n) => n.id === "nnA")!;
    const movedB = latest!.navNodes!.find((n) => n.id === "nnB")!;
    const movedC = latest!.navNodes!.find((n) => n.id === "nnC")!;
    expect(movedA.y).toBe(201);
    expect(movedB.y).toBe(201);
    // The unselected node stays put.
    expect(movedC.y).toBe(300);
  });

  it("ArrowRight nudges a selected building by 1 (campus layer)", () => {
    let latest: Campus | undefined;
    const campus = makeCampus({
      buildings: [{
        id: "b1", name: "Building One", code: "B1", category: "Academic", description: "",
        x: 100, y: 100, width: 120, height: 80, color: "#1e40af", expanded: false,
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      }],
    });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    canvasSvg(container);
    // Buildings select through their own SVG group — click the body rect.
    const body = container.querySelector('rect[width="120"][height="80"]');
    expect(body).toBeTruthy();
    fireEvent.mouseDown(body!, { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(body!, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(latest!.buildings![0].x).toBe(101);
  });
});
