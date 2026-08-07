import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

/**
 * Fixture: a floor with two walls (endpoint-based, x1/y1/x2/y2) so tests can
 * switch selection between objects and prove object clicks never bubble into
 * an accidental background deselection.
 */
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
          {
            id: "f1",
            buildingId: "b1",
            number: 1,
            label: "Ground Floor",
            rooms: [],
            paths: [],
            walls: [
              { id: "w1", x1: 50, y1: 50, x2: 150, y2: 50, thickness: 4, color: "#64748b", material: "concrete" },
              { id: "w2", x1: 250, y1: 50, x2: 350, y2: 50, thickness: 4, color: "#64748b", material: "concrete" },
            ],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
          },
        ],
      },
    ],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

/** Harness that keeps the editor's campus state in React so onUpdate round-trips. */
function Harness({ onCampusChange }: { onCampusChange?: (c: Campus) => void }) {
  const [campus, setCampus] = useState<Campus>(makeCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
    />
  );
}

/** The canvas SVG is the one with the Floor Editor viewBox (lucide icons are svg too). */
function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 580 380");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

/** Stub the SVG rect so screenToWorld maps client coords 1:1 to world coords (zoom 1, pan 0). */
function stubSvgRect(container: HTMLElement) {
  const svg = canvasSvg(container);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 580, bottom: 380, width: 580, height: 380, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

/** Find the wall <g> whose body line starts at the given world x (walls have no transform attr). */
function findWallGByX1(container: HTMLElement, x1: number): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find((el) => {
    if (el.hasAttribute("transform")) return false;
    const line = el.querySelector('line[stroke="#64748b"]');
    return line != null && line.getAttribute("x1") === String(x1);
  });
  expect(g).toBeTruthy();
  return g as SVGGElement;
}

/** The visible "empty floor" area — the interior decoration rect inside the data-bg group. */
function floorAreaRect(container: HTMLElement): SVGRectElement {
  const rect = container.querySelector('rect[fill="#cdc9c3"]');
  expect(rect).toBeTruthy();
  return rect as SVGRectElement;
}

/** Which wall is selected: the selection-glow line's parent g contains that wall's body line. */
function selectedWallX1(container: HTMLElement): number | null {
  const glow = screen.queryByTestId("selection-glow");
  if (!glow) return null;
  const g = glow.closest("g") as SVGGElement | null;
  if (!g) return null;
  const line = g.querySelector('line[stroke="#64748b"]');
  return line ? Number(line.getAttribute("x1")) : null;
}

let latestCampus: Campus | null = null;

beforeEach(() => {
  latestCampus = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("FloorEditor canvas selection", () => {
  it("clicking empty canvas space deselects the selected object without data or history changes", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select wall w1 — selection visuals appear
    fireEvent.mouseDown(findWallGByX1(container, 50), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByTestId("selection-glow")).toBeTruthy();
    expect(screen.queryAllByTestId("wall-endpoint-handle")).toHaveLength(2);

    // Click the empty floor interior → deselect
    fireEvent.mouseDown(floorAreaRect(container), { clientX: 100, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.queryByTestId("selection-glow")).toBeNull();
    expect(screen.queryAllByTestId("wall-endpoint-handle")).toHaveLength(0);
    // Deselection is UI state only: the object is untouched (both wall bodies
    // still render at their original coordinates — onUpdate was never called,
    // so latestCampus stays null) and no undo entry is created
    expect(latestCampus).toBeNull();
    expect(container.querySelectorAll('line[stroke="#64748b"]')).toHaveLength(2);
    expect(findWallGByX1(container, 50)).toBeTruthy();
    expect((screen.getByTitle("Undo (Ctrl+Z)") as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking another object selects it; clicking an object never bubbles into deselection", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select w1
    fireEvent.mouseDown(findWallGByX1(container, 50), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(selectedWallX1(container)).toBe(50);

    // Click w2 → w1 deselects, w2 becomes selected (no bubbling accidental deselect)
    fireEvent.mouseDown(findWallGByX1(container, 250), { clientX: 250, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(selectedWallX1(container)).toBe(250);
    expect(screen.queryAllByTestId("wall-endpoint-handle")).toHaveLength(2);

    // Click the same object again → it must remain selected
    fireEvent.mouseDown(findWallGByX1(container, 250), { clientX: 250, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(selectedWallX1(container)).toBe(250);
    expect(screen.queryAllByTestId("wall-endpoint-handle")).toHaveLength(2);
  });

  it("clicking or dragging a wall endpoint preserves the wall selection", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select w1
    fireEvent.mouseDown(findWallGByX1(container, 50), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByTestId("selection-glow")).toBeTruthy();

    // Drag the x2 endpoint handle (it sits inside the selected wall's g)
    const handles = screen.queryAllByTestId("wall-endpoint-handle");
    const x2Handle = Array.from(handles).find((h) => Number(h.getAttribute("cx")) === 150)!;
    fireEvent.mouseDown(x2Handle, { clientX: 150, clientY: 50, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // The wall was reshaped AND stays selected with its handles visible
    expect(latestCampus!.buildings[0].floors[0].walls[0].x2).toBe(200);
    expect(selectedWallX1(container)).toBe(50);
    expect(screen.queryAllByTestId("wall-endpoint-handle")).toHaveLength(2);
  });

  it("Escape deselects and clears transient drawing state", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select w1
    fireEvent.mouseDown(findWallGByX1(container, 50), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByTestId("selection-glow")).toBeTruthy();

    // Escape deselects
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("selection-glow")).toBeNull();
    expect(screen.queryAllByTestId("wall-endpoint-handle")).toHaveLength(0);

    // Escape also cancels an in-progress wall draw: first click starts a wall,
    // move shows the preview, Escape clears it, and the next click starts fresh
    // instead of completing the aborted wall.
    fireEvent.keyDown(window, { key: "w" }); // switch to wall tool
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 60, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 60, bubbles: true });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(svg, { clientX: 120, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // No accidental wall was completed by the second click (the aborted draw's
    // endpoint was cleared, so the click started a fresh wall instead of
    // completing one — campus was never updated)
    expect(latestCampus).toBeNull();
    expect(container.querySelectorAll('line[stroke="#64748b"]')).toHaveLength(2);
  });
});
