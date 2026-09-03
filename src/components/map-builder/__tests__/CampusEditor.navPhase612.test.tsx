import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

// ── B5 Phase 6.12 — Outdoor Connect interaction REPLACED with the Floor Editor
// model: empty-space clicks pin the FULL preview shape (orthogonal corner +
// click point), the click point becomes the next continuation anchor, the
// preview renders the same geometry the click commits, Ctrl+Z removes the
// whole click GROUP (Ctrl+Y restores it), Shift constrains H/V, and
// obstacle-crossing pins are rejected at click time.

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
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
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

function seededCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 300, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  return campus;
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

function armConnect(container: HTMLElement, svg: SVGSVGElement) {
  fireEvent.keyDown(window, { key: "p" });
  fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

afterEach(cleanup);

describe("B5 Phase 6.12 — Floor-parity Outdoor Connect interaction", () => {
  it("one diagonal empty-space click pins corner + click point (click point is never dropped)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // The preview now renders the FULL proposed shape starting from the start
    // node: A(200,200) → corner (260,200) → click point (260,260).
    const preview = container.querySelector("[data-testid='nav-path-preview'] polyline");
    expect(preview?.getAttribute("points")).toBe("200,200 260,200 260,260");
  });

  it("the next preview continues from the LAST pinned click point, not the corner (no stuck geometry)", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Move the pointer ABOVE the click point — the preview must start from the
    // pinned click point (260,260), never snap back to the corner or the source.
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 180, bubbles: true });
    const preview = container.querySelector("[data-testid='nav-path-preview'] polyline");
    expect(preview?.getAttribute("points")).toBe("200,200 260,200 260,260 260,180");
  });

  it("preview == commit: the proposed pins the preview shows are what the commit stores", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 260, bubbles: true });
    const beforeClick = container.querySelector("[data-testid='nav-path-preview'] polyline")?.getAttribute("points");
    expect(beforeClick).toBe("200,200 260,200 260,260");
    // Click EXACTLY what the preview showed, then commit to B.
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const edge = latest!.navEdges![0];
    // Same shape the preview promised: A → (260,200) → (260,260) → tail (300,260).
    expect(edge.bendPoints).toEqual([
      { x: 260, y: 200 },
      { x: 260, y: 260 },
      { x: 300, y: 260 },
    ]);
  });

  it("Ctrl+Z removes the WHOLE click group (both pins of one click); second Ctrl+Z cancels the connection", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);

    // ONE Ctrl+Z removes both pins of that single click (never a stray half-bend).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    // Connect is still active — the status chip remains.
    expect(screen.getByTestId("nav-path-status")).toBeTruthy();

    // Second Ctrl+Z with no bends left cancels the whole unfinished connection
    // (the tool stays armed; the status chip returns to the idle start prompt).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(screen.getByText("Select or place start point")).toBeTruthy();
  });

  it("Ctrl+Y restores the removed click group; a new bend after undo clears the redo stack", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    // Ctrl+Y restores the entire click group.
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);

    // Undo again, then pin a NEW click — the redo stack must be cleared.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    fireEvent.mouseDown(svg, { clientX: 280, clientY: 240, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    // Nothing restored — the new pin invalidated the redo stack, so the pins
    // stay exactly as the new click left them (2 pins for that one click).
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);
  });

  it("Shift-click constrains the pin to the dominant H/V axis (Floor parity)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    // (260,260) is equally 60px in both axes from (200,200) — Shift keeps Y at
    // the anchor (dx >= dy → horizontal), so the pin is a single point (260,200).
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const preview = container.querySelector("[data-testid='nav-path-preview'] polyline");
    expect(preview?.getAttribute("points")).toBe("200,200 260,200");
  });

  it("an obstacle-crossing pin click is rejected (warning toast, no bend, Connect stays active)", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    // Building spans (200,150)-(300,250). A(100,200) is to its LEFT at the same
    // y — a horizontal pin click through the building is rejected outright.
    campus.buildings = [{ ...campus.buildings[0], x: 200, y: 150, width: 100, height: 100 }];
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 100, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 400, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 100, 200), { clientX: 100, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(warningSpy).toHaveBeenCalledWith(
      "Connection blocked",
      expect.objectContaining({ description: "The connection crosses a building or obstacle." })
    );
    // No bend was pinned (no pin markers), no edge committed, Connect stays active.
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    expect(latest).toBeUndefined();
    expect(screen.getByTestId("nav-path-status")).toBeTruthy();
  });

  it("a rejected pin keeps the connection active — a later valid destination still commits", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    // Building spans (200,150)-(300,250). A sits ABOVE it at y=50. A pin click
    // at (300,300) routes the vertical leg down the building's right edge
    // (x=300 is inclusive) → rejected. B(400,350) stays reachable via the
    // default horizontal-first tail corner (400,50).
    campus.buildings = [{ ...campus.buildings[0], x: 200, y: 150, width: 100, height: 100 }];
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 100, y: 50, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 400, y: 350, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 100, 50), { clientX: 100, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Rejected pin: corner (300,50) + click (300,300) — the vertical leg at
    // x=300 hugs the building's right edge (inclusive) → blocked.
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(warningSpy).toHaveBeenCalledWith(
      "Connection blocked",
      expect.objectContaining({ description: "The connection crosses a building or obstacle." })
    );
    // The connection is still armed — committing to B succeeds with the tail
    // L corner (400,50) above the building.
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 350, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0].bendPoints).toEqual([{ x: 400, y: 50 }]);
  });
});
