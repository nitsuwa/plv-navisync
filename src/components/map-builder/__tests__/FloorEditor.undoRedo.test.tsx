import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

/**
 * Fixture: a floor with one wall (endpoint-based, x1/y1/x2/y2) so we can test
 * the exact wall-drag + undo/redo + persistence-contract path.
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
            canvasW: 580,
            canvasH: 380,
            rooms: [],
            paths: [],
            walls: [{ id: "w1", x1: 50, y1: 50, x2: 150, y2: 50, thickness: 4, color: "#64748b", material: "concrete" }],
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

/** Find the wall <g> — the wall g has no `transform` attribute (the outer canvas g does). */
function findWallG(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector('line[stroke="#64748b"]')
  );
  expect(g).toBeTruthy();
  return g as SVGGElement;
}

let latestCampus: Campus | null = null;

beforeEach(() => {
  latestCampus = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("FloorEditor undo/redo integration", () => {
  it("whole-wall drag moves x1/y1/x2/y2 and commits exactly one undo step via the toolbar", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    const undoBtn = screen.getByTitle("Undo (Ctrl+Z)");
    const redoBtn = screen.getByTitle("Redo (Ctrl+Y)");
    // Disabled button states must reflect availability BEFORE any edit
    expect((undoBtn as HTMLButtonElement).disabled).toBe(true);
    expect((redoBtn as HTMLButtonElement).disabled).toBe(true);

    // Drag the wall body from (50,50) to (80,80)
    fireEvent.mouseDown(findWallG(container), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 80, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const wallAfter = latestCampus!.buildings[0].floors[0].walls[0];
    expect(wallAfter.x1).toBe(80);
    expect(wallAfter.y1).toBe(80);
    expect(wallAfter.x2).toBe(180);
    expect(wallAfter.y2).toBe(80);
    // Critical regression: dragging must NOT leave NaN x/y on the wall object
    // (NaN serialized to JSON null and broke the map_elements NOT NULL x column)
    expect(wallAfter.x).toBeUndefined();
    expect(wallAfter.y).toBeUndefined();
    expect(Number.isNaN(wallAfter.x1)).toBe(false);

    expect((undoBtn as HTMLButtonElement).disabled).toBe(false);
    expect((redoBtn as HTMLButtonElement).disabled).toBe(true);

    // Undo via toolbar → wall restored to the pre-drag position
    fireEvent.click(undoBtn);
    const wallUndone = latestCampus!.buildings[0].floors[0].walls[0];
    expect(wallUndone.x1).toBe(50);
    expect(wallUndone.y1).toBe(50);
    expect(wallUndone.x2).toBe(150);

    // Redo via toolbar → wall moves again
    fireEvent.click(redoBtn);
    const wallRedone = latestCampus!.buildings[0].floors[0].walls[0];
    expect(wallRedone.x1).toBe(80);
  });

  it("Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z drive the same history as the toolbar", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(findWallG(container), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 90, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus!.buildings[0].floors[0].walls[0].x1).toBe(90);

    // Ctrl+Z → undo
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latestCampus!.buildings[0].floors[0].walls[0].x1).toBe(50);

    // Ctrl+Shift+Z → redo (same as Ctrl+Y per the editor's shortcut contract)
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(latestCampus!.buildings[0].floors[0].walls[0].x1).toBe(90);

    // Ctrl+Y → redo again (now at the top of the stack → no-op)
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(latestCampus!.buildings[0].floors[0].walls[0].x1).toBe(90);

    // Ctrl+Shift+Z after undo → redo re-applies the gesture
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(latestCampus!.buildings[0].floors[0].walls[0].x1).toBe(90);
  });

  it("Delete removes a wall and Undo restores it", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Select the wall
    fireEvent.mouseDown(findWallG(container), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Delete it
    fireEvent.keyDown(window, { key: "Delete" });
    expect(latestCampus!.buildings[0].floors[0].walls).toHaveLength(0);

    // Undo restores it
    fireEvent.click(screen.getByTitle("Undo (Ctrl+Z)"));
    expect(latestCampus!.buildings[0].floors[0].walls).toHaveLength(1);
    expect(latestCampus!.buildings[0].floors[0].walls[0].id).toBe("w1");
  });

  it("shortcuts do not fire while typing in an input", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Create a history entry
    fireEvent.mouseDown(findWallG(container), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus!.buildings[0].floors[0].walls[0].x1).toBe(70);

    // Focus an input (simulate the user typing in a properties field)
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    // Ctrl+Z while typing must NOT undo
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latestCampus!.buildings[0].floors[0].walls[0].x1).toBe(70);
    input.remove();
  });

  it("a plain click (no movement) does not create a history entry", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(findWallG(container), { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // No movement → nothing committed → undo stays disabled
    expect((screen.getByTitle("Undo (Ctrl+Z)") as HTMLButtonElement).disabled).toBe(true);
  });
});
