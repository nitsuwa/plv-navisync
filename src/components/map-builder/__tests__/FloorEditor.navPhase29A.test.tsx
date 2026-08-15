import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 2.9A — invalid Connect preview feedback ────────────────────────

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

/** Horizontal wall across the floor (y=70, x 40..140) — same fixture as Phase 2.8. */
function withWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  return next;
}

/** Adds a door opening in the wall at (70,70). */
function withDoor(campus: Campus): Campus {
  const next = withWall(campus);
  next.buildings[0].floors[0].doors = [
    { id: "d1", x: 70, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.3 },
  ];
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

function invalidFeedback(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="floor-nav-preview-invalid"]'));
}

function placeWaypoint(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, x, y);
}

function startConnectFrom(container: HTMLElement, index: number, x: number, y: number): SVGSVGElement {
  const svg = stubSvgRect(container);
  fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
  fireEvent.mouseDown(navNodes(container)[index], { clientX: x, clientY: y, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  return svg;
}

describe("B5 Phase 2.9A — invalid Connect preview feedback", () => {
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

  it("a wall-crossing preview shows the INVALID state (red feedback) before any click", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 70, 30);  // above the wall
    placeWaypoint(container, 70, 120); // below the wall
    const svg = startConnectFrom(container, 0, 70, 30);
    // Point at the destination — the straight tail crosses the wall (no door).
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 120, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(1);
    // The red ring + the message label are part of the feedback.
    expect(container.querySelector('[data-testid="floor-nav-preview-invalid-ring"]')).toBeTruthy();
    expect(screen.getByText("Path blocked by wall")).toBeTruthy();
    // No edge was created by merely previewing.
    expect(navEdges(container)).toHaveLength(0);
  });

  it("a wall-hugging preview shows the INVALID state (segment runs along the wall)", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 50, 70);  // ON the wall line
    placeWaypoint(container, 120, 70); // ON the wall line
    const svg = startConnectFrom(container, 0, 50, 70);
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 70, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(1);
    expect(screen.getByText("Path blocked by wall")).toBeTruthy();
  });

  it("clicking an invalid destination does NOT create an edge or history", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 70, 30);
    placeWaypoint(container, 70, 120);
    const svg = startConnectFrom(container, 0, 70, 30);
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 120, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(1);
    const callsBefore = onCampusChange.mock.calls.length;
    // Click the destination node while the preview is invalid.
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore); // no history
  });

  it("Connect stays ACTIVE after the rejected click — the invalid feedback persists", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 70, 30);
    placeWaypoint(container, 70, 120);
    const svg = startConnectFrom(container, 0, 70, 30);
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // The connection was NOT cancelled: preview + invalid feedback still render.
    expect(screen.getByTestId("floor-nav-connect-preview")).toBeTruthy();
    expect(invalidFeedback(container)).toHaveLength(1);
    expect(screen.getByText("Path blocked by wall")).toBeTruthy();
    // Moving away clears the invalid state (feedback is transient, no permanent marker).
    fireEvent.mouseMove(svg, { clientX: 30, clientY: 30, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(0);
  });

  it("a valid Door passage does NOT show the invalid state", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDoor(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 70, 30);
    placeWaypoint(container, 70, 120);
    const svg = startConnectFrom(container, 0, 70, 30);
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 120, bubbles: true });
    // Crossing through the door opening is legal — normal valid preview.
    expect(invalidFeedback(container)).toHaveLength(0);
    expect(screen.queryByText("Path blocked by wall")).toBeNull();
    // And committing through the door still works.
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
  });
});
