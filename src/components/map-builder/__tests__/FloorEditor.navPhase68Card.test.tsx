import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 6.8 — ONE shared NavigationRelationshipCard in both modes ─────
// Design mode (FloorPropertiesPanel) and Navigation mode (PhysicalNavPropertiesPanel)
// must literally render the same component with the same canonical graph actions.

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

/** One of every supported physical object, all UNLINKED. */
function allObjectsCampus(): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].floors[0] = {
    ...campus.buildings[0].floors[0],
    rooms: [{ id: "room-101", x: 20, y: 20, w: 70, h: 45, type: "classroom", name: "Room 101", color: "#dbeafe" }],
    doors: [{ id: "door-101", x: 105, y: 45, width: 18, direction: "left", color: "#d97706", label: "North Door" }],
    stairs: [{ id: "st1", x: 10, y: 120, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs", sharedId: "stair-core-a" }],
    elevators: [{ id: "el1", x: 150, y: 30, width: 18, height: 18, doorWidth: 8, label: "Elevator", sharedId: "elev-a", floors: [1, 2] }],
    ramps: [{ id: "r1", x: 30, y: 80, width: 40, height: 20, rotation: 0, direction: "both", label: "Ramp", sharedId: "ramp-a" }],
  };
  return campus;
}

function allObjectsLinkedCampus(): Campus {
  const campus = allObjectsCampus();
  campus.navNodes = [
    { id: "n-room", name: "Room 101", type: "room", x: 55, y: 42, buildingId: "b1", floorId: "f1", roomId: "room-101", accessible: true, color: "#16a34a" },
    { id: "n-door", name: "North Door", type: "hallway", x: 105, y: 45, buildingId: "b1", floorId: "f1", doorId: "door-101", accessible: true, color: "#16a34a" },
    { id: "n-stair", name: "Stairs", type: "stair", x: 20, y: 128, buildingId: "b1", floorId: "f1", stairId: "st1", accessible: false, color: "#16a34a" },
    { id: "n-elev", name: "Elevator", type: "elevator", x: 159, y: 39, buildingId: "b1", floorId: "f1", elevatorId: "el1", accessible: true, color: "#16a34a" },
    { id: "n-ramp", name: "Ramp", type: "ramp", x: 50, y: 90, buildingId: "b1", floorId: "f1", rampId: "r1", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "ne-1", startNodeId: "n-room", endNodeId: "n-door", distance: 50, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway" },
  ];
  return campus;
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

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 220 160");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement): SVGSVGElement {
  const svg = canvasSvg(container);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 220, bottom: 160, width: 220, height: 160, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg.viewBox, "baseVal", { configurable: true, value: { width: 220, height: 160, x: 0, y: 0 } });
  Object.defineProperty(svg.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 220, bottom: 160, width: 220, height: 160, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function enterNavigationMode() {
  fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
}

function selectPhysical(container: HTMLElement, label: string) {
  const group = Array.from(container.querySelectorAll("[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === label
  ) as SVGGElement | undefined;
  expect(group, `physical object "${label}"`).toBeTruthy();
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(group!, { bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function navCard(container: HTMLElement): HTMLElement {
  const card = container.querySelector("[data-testid='navigation-relationship-card']");
  expect(card, "shared NavigationRelationshipCard rendered").toBeTruthy();
  return card as HTMLElement;
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

describe("B5 Phase 6.8 — ONE shared NavigationRelationshipCard in both modes", () => {
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

  it("Design mode renders the shared NavigationRelationshipCard (not a private copy)", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    selectPhysical(container, "Stairs");
    // The SAME shared component with the shared testid.
    expect(navCard(container)).toBeTruthy();
    expect(screen.getByText("Not linked")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add to Navigation/ })).toBeTruthy();
  });

  it("Navigation mode renders the SAME shared NavigationRelationshipCard for physical objects", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    selectPhysical(container, "Stairs");
    expect(navCard(container)).toBeTruthy();
    expect(screen.getByText("Not linked")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add to Navigation/ })).toBeTruthy();
    // Navigation mode shows the navigation-only View label.
    expect(screen.queryByRole("button", { name: /View Linked Node/ })).toBeNull();
  });

  it("linked state is shared: Add in Design shows Linked in Navigation mode too", async () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;

    selectPhysical(container, "Stairs");
    expect(navCard(container).textContent).toContain("Not linked");
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));
    // Immediate status update — no reload required.
    expect(navCard(container).textContent).toContain("Linked");

    enterNavigationMode();
    selectPhysical(container, "Stairs");
    const navCardEl = navCard(container);
    expect(navCardEl.textContent).toContain("Linked");
    // Navigation mode label: View Linked Node.
    expect(screen.getByRole("button", { name: /View Linked Node/ })).toBeTruthy();
  });

  it("Add from Navigation mode reaches the SAME canonical logic (node created once, correct anchor)", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    selectPhysical(container, "Stairs");
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));

    const campus = latestCampus(onCampusChange);
    const node = campus.navNodes.find((n) => n.stairId === "st1");
    expect(node).toBeTruthy();
    // Same anchor semantics as Design mode: stair center (x 20 + 10, y 120 + 8).
    expect(node!.x).toBe(20);
    expect(node!.y).toBe(128);
    expect(node!.accessible).toBe(false);
    // B5 Phase 6.10: the physical-object panel STAYS open — the shared card
    // flips to Linked in place instead of jumping to the node inspector.
    expect(navCard(container).textContent).toContain("Linked");
    expect(screen.queryByRole("button", { name: /Add to Navigation/ })).toBeNull();
    expect(screen.queryByTestId("floor-nav-node-props")).toBeNull();
  });

  it("Add from Navigation mode keeps the physical panel (no design-tab-style node inspector)", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    selectPhysical(container, "Room 101");
    expect(navCard(container).textContent).toContain("Not linked");
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));

    // The physical navigation panel remains — not the node inspector.
    expect(navCard(container)).toBeTruthy();
    expect(navCard(container).textContent).toContain("Linked");
    expect(screen.queryByTestId("floor-nav-node-props")).toBeNull();
    // Click out and re-pick the same object — identical result.
    fireEvent.mouseDown(container.querySelector("svg")!);
    selectPhysical(container, "Room 101");
    expect(navCard(container).textContent).toContain("Linked");
  });

  it("repeated Add never duplicates the canonical node (both entry points)", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    selectPhysical(container, "Room 101");
    fireEvent.click(screen.getByRole("button", { name: /Add to Navigation/ }));
    let campus = latestCampus(onCampusChange);
    expect(campus.navNodes.filter((n) => n.roomId === "room-101")).toHaveLength(1);
    // Once linked the card swaps to Remove — the Add entry point is gone,
    // so duplicates cannot accumulate from the UI in Design mode.
    expect(navCard(container).textContent).toContain("Linked");
    expect(screen.queryByRole("button", { name: /Add to Navigation/ })).toBeNull();

    enterNavigationMode();
    selectPhysical(container, "Room 101");
    expect(navCard(container).textContent).toContain("Linked");
    expect(screen.queryByRole("button", { name: /Add to Navigation/ })).toBeNull();
    campus = latestCampus(onCampusChange);
    expect(campus.navNodes.filter((n) => n.roomId === "room-101")).toHaveLength(1);
  });

  it("Design View in Navigation switches to Navigation mode and focuses the linked node", () => {
    const rendered = render(<Harness initialCampus={allObjectsLinkedCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    selectPhysical(container, "Room 101");
    fireEvent.click(screen.getByRole("button", { name: /View in Navigation/ }));

    // Switched to Navigation mode and the linked node is selected (nav props panel).
    expect(screen.getByTestId("floor-nav-node-props")).toHaveTextContent("Linked to a room");
  });

  it("Navigation View Linked Node stays in Navigation mode and selects the node", () => {
    const rendered = render(<Harness initialCampus={allObjectsLinkedCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    selectPhysical(container, "Room 101");
    expect(navCard(container).textContent).toContain("Linked");
    fireEvent.click(screen.getByRole("button", { name: /View Linked Node/ }));

    expect(screen.getByTestId("floor-nav-node-props")).toHaveTextContent("Linked to a room");
  });

  it("Remove cleanup is shared: unlinks the node + touching edges, keeps the physical object", async () => {
    const rendered = render(<Harness initialCampus={allObjectsLinkedCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    selectPhysical(container, "Room 101");
    expect(navCard(container).textContent).toContain("Linked");
    fireEvent.click(screen.getByRole("button", { name: /Remove from Navigation/ }));

    const campus = latestCampus(onCampusChange);
    expect(campus.buildings[0].floors[0].rooms.some((r) => r.id === "room-101")).toBe(true);
    expect(campus.navNodes.some((n) => n.roomId === "room-101")).toBe(false);
    // The touching edge is cleaned up too.
    expect(campus.navEdges.some((e) => e.startNodeId === "n-room" || e.endNodeId === "n-room")).toBe(false);
    await waitFor(() => expect(navCard(container).textContent).toContain("Not linked"));
    expect(screen.getByRole("button", { name: /Add to Navigation/ })).toBeTruthy();
  });

  it("the shared card supports Room, Door, Stair, Elevator and Ramp in Design mode", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    for (const label of ["Room 101", "North Door", "Stairs", "Elevator", "Ramp"]) {
      selectPhysical(container, label);
      expect(navCard(container)).toBeTruthy();
      expect(navCard(container).textContent).toContain("Not linked");
      expect(screen.getByRole("button", { name: /Add to Navigation/ })).toBeTruthy();
    }
  });

  it("the shared card supports Room, Door, Stair, Elevator and Ramp in Navigation mode", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    enterNavigationMode();
    for (const label of ["Room 101", "North Door", "Stairs", "Elevator", "Ramp"]) {
      selectPhysical(container, label);
      expect(navCard(container)).toBeTruthy();
      expect(navCard(container).textContent).toContain("Not linked");
      expect(screen.getByRole("button", { name: /Add to Navigation/ })).toBeTruthy();
    }
  });

  it("linked card shows connection count in BOTH modes (same content)", () => {
    const rendered = render(<Harness initialCampus={allObjectsLinkedCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;
    // Room 101's node n-room has one edge (ne-1) → Connections: 1.
    selectPhysical(container, "Room 101");
    expect(navCard(container).textContent).toContain("Connections: 1");

    enterNavigationMode();
    selectPhysical(container, "Room 101");
    expect(navCard(container).textContent).toContain("Connections: 1");
  });

  it("Navigation-tab properties panels are w-60 — same size as or smaller than the Design tab's w-64", () => {
    const rendered = render(<Harness initialCampus={allObjectsCampus()} onCampusChange={onCampusChange} />);
    container = rendered.container;

    // Design tab selected-object panel is w-64 (256px).
    selectPhysical(container, "Stairs");
    expect(screen.getByTestId("floor-properties-panel").className).toContain("w-64");

    // Navigation tab physical-object panel is w-60 (240px) — smaller than design.
    enterNavigationMode();
    selectPhysical(container, "Stairs");
    const physicalPanel = navCard(container).closest('[class*="w-60"]');
    expect(physicalPanel, "nav physical panel is w-60").toBeTruthy();
    expect(physicalPanel!.className).toContain("w-60");
    expect(physicalPanel!.className).not.toContain("w-64");

    // Node / edge inspectors are w-60 as well — never wider than design.
    expect(screen.queryByTestId("floor-nav-node-props")).toBeNull();
  });
});
