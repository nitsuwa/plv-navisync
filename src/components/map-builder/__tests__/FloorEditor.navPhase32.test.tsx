import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 3 — cross-floor navigation linking ─────────────────────────────

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

const STAIR_F1 = { id: "s1", x: 60, y: 40, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-core-a" };
const STAIR_F2 = { id: "s2", x: 60, y: 40, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-core-a" };
const STAIR_ALT = { id: "s-alt", x: 115, y: 40, width: 20, height: 16, rotation: 0, direction: "both", label: "Back Stairs", sharedId: "stair-core-b" };

/** Two floors, the same stair core (sharedId), both linked into navigation. */
function withLinkedStairCore(campus: Campus, { linkFloor2 = true, floor2SharedId = "stair-core-a" } = {}): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors = [
    {
      ...next.buildings[0].floors[0],
      stairs: [STAIR_F1],
    },
    {
      id: "f2", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160,
      rooms: [], walls: [], doors: [], windows: [], furniture: [],
      stairs: [{ ...STAIR_F2, sharedId: floor2SharedId }],
      ramps: [], elevators: [], labels: [], paths: [],
    },
  ];
  const stairNode = (id: string, floorId: string, stairId: string) => ({
    id, name: "Stairs", type: "stair", x: 70, y: 48, campusId: "c1", buildingId: "b1", floorId,
    stairId, accessible: false, color: "#16a34a",
  });
  next.navNodes = [
    stairNode("n1", "f1", "s1"),
    ...(linkFloor2 ? [stairNode("n2", "f2", "s2")] : []),
  ];
  next.navEdges = [];
  return next;
}

function withUnlinkedStairChoices(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors = [
    {
      ...next.buildings[0].floors[0],
      stairs: [STAIR_F1, STAIR_ALT],
    },
    {
      id: "f2", buildingId: "b1", number: 2, label: "Floor 2", canvasW: 220, canvasH: 160,
      rooms: [], walls: [], doors: [], windows: [], furniture: [],
      stairs: [{ ...STAIR_F2 }],
      ramps: [], elevators: [], labels: [], paths: [],
    },
  ];
  next.navNodes = [];
  next.navEdges = [];
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

function navEdges(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]'));
}

function navNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
}

function linkedNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-linked-node"]')) as SVGGElement[];
}

function floorObject(container: HTMLElement, label: string): SVGGElement {
  const object = Array.from(container.querySelectorAll("g[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === label
  ) as SVGGElement | undefined;
  expect(object).toBeTruthy();
  return object!;
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

describe("B5 Phase 3 — cross-floor navigation linking", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
    vi.spyOn(toast, "success").mockImplementation(() => "" as never);
    onCampusChange = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("matching Stair sharedIds across floors reconcile ONE transition edge on the next commit", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withLinkedStairCore(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    // Trigger a commit: a free waypoint placement (Link Location workflow already
    // created both stair nodes; reconciliation runs on every campus write).
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 150, 130);

    const latest = latestCampus(onCampusChange);
    expect(latest.navEdges).toHaveLength(1);
    const t = latest.navEdges[0];
    expect(t.type).toBe("floor_transition");
    expect(t.accessible).toBe(false); // stairs are not accessible by default
    expect([t.startNodeId, t.endNodeId].sort()).toEqual(["n1", "n2"]);
    // The local linked node shows the subtle transition badge (not a waypoint).
    expect(container.querySelector('[data-testid="nav-transition-badge"]')).toBeTruthy();
    // The transition is NOT a walkable floor edge: it renders no line, no handles.
    expect(navEdges(container)).toHaveLength(0);
    expect(container.querySelector('[data-testid="nav-bend-handle"]')).toBeNull();
  });

  it("deleting a transition node removes/reconciles its transition edge", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withLinkedStairCore(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 150, 130);
    expect(latestCampus(onCampusChange).navEdges).toHaveLength(1);

    // Select the local linked stair node and delete it.
    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 70, clientY: 48, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    fireEvent.keyDown(window, { key: "Delete", bubbles: true });

    const latest = latestCampus(onCampusChange);
    expect(latest.navEdges).toHaveLength(0); // stale transition reconciled away
    expect(container.querySelector('[data-testid="nav-transition-badge"]')).toBeNull();
  });

  it("selected linked node shows its connected floors in properties", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withLinkedStairCore(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 150, 130);

    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 70, clientY: 48, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    expect(screen.getByTestId("nav-transition-status-linked")).toBeTruthy();
    const chips = screen.getAllByTestId("nav-transition-floor-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["Floor 2"]);
  });

  it("a linked stair with no matching node on another floor shows the lightweight hint", () => {
    const campus = withLinkedStairCore(makeBaseCampus(), { linkFloor2: false });
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 70, clientY: 48, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    expect(screen.getByTestId("nav-transition-no-match")).toBeTruthy();
    expect(container.querySelector('[data-testid="nav-transition-badge"]')).toBeNull();
  });

  it("a local walkable path leading TO a circulation node still obeys strict wall validation", () => {
    const campus = withLinkedStairCore(makeBaseCampus());
    campus.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 70, 120); // below the wall
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 70, clientY: 48, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 120, bubbles: true });
    expect(container.querySelectorAll('[data-testid="floor-nav-preview-invalid"]')).toHaveLength(1);
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // The wall still blocks the WALKABLE connection to the stair node — no
    // walkable edge is created (the auto-reconciled floor_transition remains).
    expect(navEdges(container)).toHaveLength(0);
    expect(latestCampus(onCampusChange).navEdges.filter((e) => e.type !== "floor_transition")).toHaveLength(0);
  });

  it("a stair whose sharedId does not match another floor shows 'Not linked to another floor'", () => {
    const campus = withLinkedStairCore(makeBaseCampus(), { floor2SharedId: "stair-core-b" });
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    fireEvent.mouseDown(linkedNodes(container)[0], { clientX: 70, clientY: 48, bubbles: true });
    fireEvent.mouseUp(stubSvgRect(container), { bubbles: true });
    expect(screen.getByTestId("nav-transition-no-match")).toBeTruthy();
    // No transition edge is ever created for mismatched chains.
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 150, 130);
    expect(latestCampus(onCampusChange).navEdges).toHaveLength(0);
  });

  it("hides the walking-network empty state while Link Location is armed", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={makeBaseCampus()} />);
    container = rendered.container;
    enterNavigationMode();
    expect(screen.getByTestId("floor-nav-canvas-empty-state")).toBeTruthy();

    fireEvent.click(screen.getByTestId("nav-library-link"));

    expect(screen.queryByTestId("floor-nav-canvas-empty-state")).toBeNull();
  });

  it("Design properties Add to Navigation links only the selected circulation object", () => {
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withUnlinkedStairChoices(makeBaseCampus())} />);
    container = rendered.container;
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(floorObject(container, "Stairs"), { clientX: 70, clientY: 48, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByText("Matching stair on Floor 2 is not added to navigation.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to Navigation" }));

    const latest = latestCampus(onCampusChange);
    expect(latest.navNodes).toHaveLength(1);
    expect(latest.navNodes[0]).toMatchObject({ stairId: "s1", floorId: "f1", type: "stair" });
    expect(latest.navNodes.some((node) => node.stairId === "s-alt")).toBe(false);
  });
});
