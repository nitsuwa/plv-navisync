import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor, restoreCampusHistoryReferences } from "../CampusEditor";
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
  fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
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

async function flushArrowNudgeFrame() {
  await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
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
  it("ArrowRight nudges a selected nav node by 1", async () => {
    let latest: Campus | undefined;
    const updates: Campus[] = [];
    const campus = makeCampus({ navNodes: [node({ id: "nnA", x: 200, y: 200 })] });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; updates.push(c); }} />);
    openNavigationLayer(container);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await flushArrowNudgeFrame();
    expect(latest!.navNodes![0].x).toBe(201);
    expect(latest!.navNodes![0].y).toBe(200);
    expect(updates).toHaveLength(1);
  });

  it("keeps unchanged authored Campus records stable when undo restores a snapshot", () => {
    const original = makeCampus({ buildings: [
      { id: "b1", name: "A", code: "A", category: "Academic", x: 10, y: 20, width: 30, height: 40, color: "#111111", floors: [] },
      { id: "b2", name: "B", code: "B", category: "Academic", x: 50, y: 60, width: 30, height: 40, color: "#222222", floors: [] },
    ] });
    const current = structuredClone(original);
    current.buildings[0].x += 1;
    const restored = restoreCampusHistoryReferences(current, structuredClone(original));

    expect(restored.buildings[0].x).toBe(original.buildings[0].x);
    expect(restored.buildings[1]).toBe(current.buildings[1]);
    expect(restored.markers).toBe(current.markers);
  });

  it("Shift+Arrow nudges by 10", async () => {
    let latest: Campus | undefined;
    const campus = makeCampus({ navNodes: [node({ id: "nnA", x: 200, y: 200 })] });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    openNavigationLayer(container);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    await flushArrowNudgeFrame();
    expect(latest!.navNodes![0].x).toBe(210);
  });

  it("nudges a shift-selected group of nav nodes rigidly", async () => {
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
    await flushArrowNudgeFrame();
    const movedA = latest!.navNodes!.find((n) => n.id === "nnA")!;
    const movedB = latest!.navNodes!.find((n) => n.id === "nnB")!;
    const movedC = latest!.navNodes!.find((n) => n.id === "nnC")!;
    expect(movedA.y).toBe(201);
    expect(movedB.y).toBe(201);
    // The unselected node stays put.
    expect(movedC.y).toBe(300);
  });

  it("ArrowRight nudges a selected building by 1 (campus layer)", async () => {
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
    await flushArrowNudgeFrame();
    expect(latest!.buildings![0].x).toBe(101);
  });

  it.each([
    ["ArrowUp", "ArrowRight", 1, -1],
    ["ArrowUp", "ArrowLeft", -1, -1],
    ["ArrowDown", "ArrowRight", 1, 1],
    ["ArrowDown", "ArrowLeft", -1, 1],
  ] as const)("coalesces %s + %s into one Campus update without changing either nudge", async (vertical, horizontal, dx, dy) => {
    let latest: Campus | undefined;
    const updates: Campus[] = [];
    const campus = makeCampus({ buildings: [{
      id: "b1", name: "Building One", code: "B1", category: "Academic", description: "",
      x: 100, y: 100, width: 120, height: 80, color: "#1e40af", expanded: false,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
    }] });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(next) => { latest = next; updates.push(next); }} />);
    canvasSvg(container);
    const body = container.querySelector('rect[width="120"][height="80"]')!;
    fireEvent.mouseDown(body, { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(body, { bubbles: true });
    updates.length = 0;

    fireEvent.keyDown(window, { key: vertical });
    fireEvent.keyDown(window, { key: horizontal });
    await flushArrowNudgeFrame();

    expect(updates).toHaveLength(1);
    expect(latest!.buildings[0]).toMatchObject({ x: 100 + dx, y: 100 + dy });
  });
});
