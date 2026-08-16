import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus, FloorRoom, NavigationNode } from "../types";

// ── B5 Final — Floor Editor arrow-key nudge ───────────────────────────────
// Arrow = 1 unit, Shift+Arrow = 10 units; Design objects and free nav
// waypoints move; linked nodes stay attached to their physical owners.

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

function withRoomAndGraph(): Campus {
  const campus = makeCampus();
  campus.buildings[0].floors[0] = {
    ...campus.buildings[0].floors[0],
    rooms: [{ id: "room-1", name: "Room 1", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" }],
    doors: [{ id: "door-1", x: 100, y: 30, width: 14, direction: "left", color: "#d97706", label: "Door" }],
  };
  campus.navNodes = [
    { id: "n-free", name: "Free Waypoint", type: "hallway", x: 120, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    { id: "n-linked", name: "Door Point", type: "hallway", x: 100, y: 30, buildingId: "b1", floorId: "f1", doorId: "door-1", accessible: true, color: "#16a34a" },
  ];
  campus.navEdges = [
    { id: "ne-1", startNodeId: "n-free", endNodeId: "n-linked", distance: 80, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway" },
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

function navNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
}

function roomGroup(container: HTMLElement, room: FloorRoom): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector(`rect[width="${room.w}"][height="${room.h}"]`)
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
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

describe("FloorEditor arrow-key nudge", () => {
  it("ArrowRight nudges a selected room by 1 in Design mode", () => {
    let latest: Campus | undefined;
    const campus = withRoomAndGraph();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    const room = campus.buildings[0].floors[0].rooms[0];
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const moved = latest!.buildings[0].floors[0].rooms[0];
    expect(moved.x).toBe(21);
    expect(moved.y).toBe(20);
  });

  it("Shift+ArrowRight nudges a room by 10", () => {
    let latest: Campus | undefined;
    const campus = withRoomAndGraph();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    const room = campus.buildings[0].floors[0].rooms[0];
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(latest!.buildings[0].floors[0].rooms[0].x).toBe(30);
  });

  it("nudges a free nav waypoint in Navigation mode", () => {
    let latest: Campus | undefined;
    const campus = withRoomAndGraph();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    canvasSvg(container);
    enterNavigationMode();
    // Click the free waypoint node to select it.
    const nodes = navNodes(container);
    const freeNode = nodes.find((g) => g.querySelector("circle")?.getAttribute("cx") === "120");
    expect(freeNode).toBeTruthy();
    fireEvent.mouseDown(freeNode!, { clientX: 120, clientY: 100, bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    const moved = latest!.navNodes!.find((n) => n.id === "n-free")!;
    expect(moved.y).toBe(101);
  });

  it("does not nudge a linked node (stays attached to its physical owner)", () => {
    let latest: Campus | undefined;
    const campus = withRoomAndGraph();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    canvasSvg(container);
    enterNavigationMode();
    // Linked nodes render with their own testid.
    const nodes = Array.from(container.querySelectorAll('[data-testid="nav-node"], [data-testid="nav-linked-node"]')) as SVGGElement[];
    const linkedNode = nodes.find((g) => g.querySelector("circle")?.getAttribute("cx") === "100");
    expect(linkedNode).toBeTruthy();
    fireEvent.mouseDown(linkedNode!, { clientX: 100, clientY: 30, bubbles: true });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    // The linked node must not move — the nudge is rejected outright, so no
    // campus update is produced at all.
    expect(latest).toBeUndefined();
  });
});
