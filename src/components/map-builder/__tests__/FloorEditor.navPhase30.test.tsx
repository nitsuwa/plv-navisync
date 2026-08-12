import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 2.10 — strict thick-wall collision + bend-on-wall rejection ────

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

/** Horizontal wall across the floor (y=70, x 40..140) — the standard fixture. */
function withWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  return next;
}

/** Vertical wall (x=100, y 60..130) — used for the diagonal-straighten test. */
function withPartialWall(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 100, y1: 60, x2: 100, y2: 130, thickness: 4, color: "#64748b", material: "concrete" },
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

function pinMarkers(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-connect-pin"]'));
}

function invalidFeedback(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="floor-nav-preview-invalid"]'));
}

function placeWaypoint(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, x, y);
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

function startConnectFrom(container: HTMLElement, index: number, x: number, y: number): SVGSVGElement {
  const svg = stubSvgRect(container);
  fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
  fireEvent.mouseDown(navNodes(container)[index], { clientX: x, clientY: y, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  return svg;
}

describe("B5 Phase 2.10 — strict thick-wall collision (bend points + preview/commit consistency)", () => {
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

  it("an empty-space click ON the wall does NOT pin a bend / add history — Connect stays active", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 60, 40); // open floor above the wall
    const svg = startConnectFrom(container, 0, 60, 40);
    // Pointer ON the wall centerline (100,70): the point check makes the preview RED.
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 70, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(1);
    expect(screen.getByText("Path blocked by wall")).toBeTruthy();
    const callsBefore = onCampusChange.mock.calls.length;
    // Click on the wall — the bend must be REJECTED (no pin, no history).
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    // Connect is still ACTIVE (preview still rendering).
    expect(screen.getByTestId("floor-nav-connect-preview")).toBeTruthy();
    // Moving to genuine open floor (same side of the wall as the start) makes
    // ONE click immediately pin the L.
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 55, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(0);
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 55, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(2); // corner (100,40) + click (100,55)
  });

  it("clicking inside the wall's CLEARANCE BAND is also rejected (thick obstacle)", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 60, 40);
    const svg = startConnectFrom(container, 0, 60, 40);
    // (100,78) is 8 units off the centerline — within the effective band
    // (thickness/2 + 6 = 9) but already past the visible face (73): rejected.
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 78, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(1);
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 78, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
  });

  it("preview validity EQUALS click/commit validity — the committed edge never contains an on-wall bend", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 60, 40);
    placeWaypoint(container, 160, 40);
    const svg = startConnectFrom(container, 0, 60, 40);
    // Red over the wall.
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 70, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(1);
    // Clicking it changes nothing.
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(0);
    // Valid preview in open floor → click pins the L the preview promised.
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 55, bubbles: true });
    expect(invalidFeedback(container)).toHaveLength(0);
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 55, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(pinMarkers(container)).toHaveLength(2);
    // Finish on the destination: the committed edge carries the valid pins only.
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 40, bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 160, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const edge = latestCampus(onCampusChange).navEdges[0];
    // No bend sits on the wall (y=70) and no bend hides inside the wall band.
    expect(edge.bendPoints.every((p) => p.y !== 70 && Math.abs(p.y - 70) > 9)).toBe(true);
    expect(edge.bendPoints).toEqual([{ x: 100, y: 40 }, { x: 100, y: 55 }, { x: 160, y: 55 }]);
  });

  it("Straighten stays blocked for a DIAGONAL through a wall (no silent wall-crossing)", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPartialWall(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 160, 100);
    // Valid L around the vertical wall (bend at 160,40) — the direct A→B line
    // is DIAGONAL and would slice through the wall.
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 160, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    expect(latestCampus(onCampusChange).navEdges[0].bendPoints).toHaveLength(1);
    const straighten = screen.getByTestId("nav-path-straighten") as HTMLButtonElement;
    expect(straighten.disabled).toBe(true);
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.click(straighten);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore); // no mutation
    expect(latestCampus(onCampusChange).navEdges[0].bendPoints).toHaveLength(1);
  });
});
