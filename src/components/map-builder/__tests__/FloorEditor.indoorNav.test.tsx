import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus, FloorRoom, NavigationEdge } from "../types";
import { ROOM_DOOR_EDGE_TYPE } from "../../../lib/indoorNavigationGraph";

// ── Fixtures ─────────────────────────────────────────────────────────────────

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
          {
            id: "f1",
            buildingId: "b1",
            number: 1,
            label: "Ground Floor",
            canvasW: 220,
            canvasH: 160,
            rooms: [],
            walls: [],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
            paths: [],
          },
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

// ── Harness ──────────────────────────────────────────────────────────────────

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

// ── Canvas helpers (1:1 viewBox mapping, like the existing floor tests) ──────

function canvasSvg(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find(
    (s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`
      && s.getAttribute("data-testid") !== "campus-interaction-overlay"
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
  fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
}

function clickWalkingPointTool() {
  fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Walking Point" }));
}

function clickCanvas(container: HTMLElement, x: number, y: number) {
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(svg, { clientX: x, clientY: y, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  return svg;
}

function navNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
}

function navLinkedNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-linked-node"]')) as SVGGElement[];
}

function navEdges(container: HTMLElement): SVGLineElement[] {
  // A freshly created edge is auto-selected, so it renders with the selected testid.
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]')) as SVGLineElement[];
}

function nodeCircle(container: HTMLElement, index: number): SVGCircleElement {
  const g = navNodes(container)[index];
  expect(g).toBeTruthy();
  const circle = g.querySelector("circle") as SVGCircleElement | undefined;
  expect(circle).toBeTruthy();
  return circle;
}

function roomGroup(container: HTMLElement, room: FloorRoom): SVGGElement {
  const g = Array.from(container.querySelectorAll<SVGGElement>('g[data-semantic-layer="room"]')).find(
    (el) => el.getAttribute("data-layer-key") === `room:${room.id}`
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
}

describe("B5 Phase 2 — Floor Editor indoor Navigation mode", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;

  beforeEach(() => {
    onCampusChange = vi.fn();
    const rendered = render(<Harness onCampusChange={onCampusChange} />);
    container = rendered.container;
  });

  afterEach(() => cleanup());

  it("isolates Design vs Navigation toolbars", () => {
    expect(screen.queryByTestId("floor-nav-toolbar")).toBeNull();
    expect(screen.getByRole("tab", { name: "Design" })).toBeTruthy();
    enterNavigationMode();
    expect(screen.getByTestId("floor-nav-toolbar")).toBeTruthy();
    // B5 Phase 2.4: the top toolbar is Select / Pan / Connect / Remove — no
    // separate Add Waypoint action (waypoint creation lives in the library).
    expect(screen.queryByRole("button", { name: /Add Waypoint/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Connect/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeTruthy();
  });

  it("hides only typed or semantically identified synthetic room-door connectors", () => {
    const linked = makeBaseCampus();
    linked.buildings[0].floors[0].rooms = [{
      id: "linked-room", name: "LIBRARY", type: "library", x: 20, y: 20, w: 90, h: 60,
      floorId: "f1", buildingId: "b1", accessDoorId: "linked-door-a", accessDoorIds: ["linked-door-a", "linked-door-b"],
    }, {
      id: "adjacent-room", name: "LECTURE ROOM", type: "lecture", x: 120, y: 20, w: 80, h: 60,
      floorId: "f1", buildingId: "b1",
    }];
    linked.buildings[0].floors[0].doors = [{
      id: "linked-door-a", x: 55, y: 80, width: 18, direction: "left", color: "#b45309", wallId: "room-wall", offset: 0.4,
    }, {
      id: "linked-door-b", x: 95, y: 80, width: 18, direction: "left", color: "#b45309", wallId: "room-wall", offset: 0.8,
    }];
    linked.buildings[0].floors[0].walls = [{ id: "room-wall", x1: 20, y1: 80, x2: 110, y2: 80, thickness: 4, color: "#64748b" }];
    linked.navNodes = [
      // Legacy synthetic edge has an explicit semantic room node and a
      // configured physical door endpoint, but predates the edge type.
      { id: "linked-room-node", name: "LIBRARY", type: "room_access", x: 65, y: 40, buildingId: "b1", floorId: "f1", roomId: "linked-room", accessible: true, color: "#16a34a" },
      { id: "linked-door-node-a", name: "Library Door A", type: "hallway", x: 55, y: 80, buildingId: "b1", floorId: "f1", doorId: "linked-door-a", accessible: true, color: "#16a34a" },
      { id: "linked-door-node-b", name: "Library Door B", type: "hallway", x: 95, y: 80, buildingId: "b1", floorId: "f1", doorId: "linked-door-b", accessible: true, color: "#16a34a" },
      { id: "library-interior-node", name: "Interior Aisle", type: "hallway", x: 75, y: 55, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "adjacent-room-node", name: "Lecture Room Access", type: "room_access", roomId: "adjacent-room", x: 160, y: 50, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "hall-node-a", name: "Hall A", type: "hallway", x: 55, y: 115, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "hall-node-b", name: "Hall B", type: "hallway", x: 95, y: 115, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    linked.navEdges = [
      { id: "legacy-room-door-line-a", startNodeId: "linked-room-node", endNodeId: "linked-door-node-a", distance: 45, bidirectional: true, accessible: true } as NavigationEdge,
      { id: "typed-room-door-line-b", startNodeId: "linked-room-node", endNodeId: "linked-door-node-b", distance: 45, bidirectional: true, accessible: true, type: ROOM_DOOR_EDGE_TYPE, color: "#64748b", width: 2 },
      { id: "room-interior-edge", startNodeId: "linked-room-node", endNodeId: "library-interior-node", distance: 20, bidirectional: true, accessible: true } as NavigationEdge,
      { id: "interior-door-path", startNodeId: "library-interior-node", endNodeId: "linked-door-node-a", distance: 30, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
      { id: "multi-room-authored-path", startNodeId: "library-interior-node", endNodeId: "adjacent-room-node", distance: 80, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
      { id: "hallway-edge-a", startNodeId: "linked-door-node-a", endNodeId: "hall-node-a", distance: 35, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
      { id: "hallway-edge-b", startNodeId: "linked-door-node-b", endNodeId: "hall-node-b", distance: 35, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange as (campus: Campus) => void} initialCampus={linked} />);
    container = rendered.container;
    const changesBeforeViewOnlyToggles = onCampusChange.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    expect(container.querySelector('[data-nav-edge-id="legacy-room-door-line-a"]')).toBeNull();
    expect(container.querySelector('[data-nav-edge-id="typed-room-door-line-b"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="nav-edge-hit"]')).toHaveLength(5);
    expect(container.querySelector('[data-nav-edge-id="room-interior-edge"]')).toBeTruthy();
    expect(container.querySelector('[data-nav-edge-id="interior-door-path"]')).toBeTruthy();
    expect(container.querySelector('[data-nav-edge-id="multi-room-authored-path"]')).toBeTruthy();
    expect(container.querySelector('[data-nav-edge-id="hallway-edge-a"]')).toBeTruthy();
    expect(container.querySelector('[data-nav-edge-id="hallway-edge-b"]')).toBeTruthy();

    // Switching to a Design tool leaves the authored navigation overlay
    // visible in its read-only renderer.
    fireEvent.click(screen.getByRole("button", { name: /^WallCreate room\/floor boundaries$/ }));
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="legacy-room-door-line-a"]')).toBeNull();
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="typed-room-door-line-b"]')).toBeNull();
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="hallway-edge-a"]')).toBeTruthy();
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="room-interior-edge"]')).toBeTruthy();
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="interior-door-path"]')).toBeTruthy();
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="multi-room-authored-path"]')).toBeTruthy();
    expect(onCampusChange.mock.calls.length).toBe(changesBeforeViewOnlyToggles);
    expect(linked.buildings[0].floors[0].rooms[0].accessDoorIds).toEqual(["linked-door-a", "linked-door-b"]);
    expect(linked.navEdges.map((edge) => edge.id)).toContain("legacy-room-door-line-a");
    expect(linked.navEdges.map((edge) => edge.id)).toContain("typed-room-door-line-b");
  });

  it("keeps synthetic multi-door access edges out of the imperative room/door gesture preview", () => {
    const authored = makeBaseCampus();
    const room: FloorRoom = {
      id: "multi-door-room", name: "STUDY ROOM", type: "classroom", x: 20, y: 20, w: 100, h: 65,
      floorId: "f1", buildingId: "b1", accessNodeId: "room-anchor",
      accessDoorId: "door-a", accessDoorIds: ["door-a", "door-b", "door-c"],
    };
    authored.buildings[0].floors[0].rooms = [room];
    authored.buildings[0].floors[0].walls = [{ id: "room-wall", x1: 20, y1: 85, x2: 120, y2: 85, thickness: 4, color: "#64748b" }];
    authored.buildings[0].floors[0].doors = [
      { id: "door-a", x: 35, y: 85, width: 14, direction: "left", color: "#b45309", wallId: "room-wall", offset: 0.15 },
      { id: "door-b", x: 70, y: 85, width: 14, direction: "left", color: "#b45309", wallId: "room-wall", offset: 0.5 },
      { id: "door-c", x: 105, y: 85, width: 14, direction: "left", color: "#b45309", wallId: "room-wall", offset: 0.85 },
    ];
    authored.navNodes = [
      { id: "room-anchor", name: "Study Room", type: "room_access", x: 70, y: 50, buildingId: "b1", floorId: "f1", roomId: room.id, accessible: true, color: "#16a34a" },
      { id: "door-node-a", name: "Door A", type: "hallway", x: 35, y: 85, buildingId: "b1", floorId: "f1", doorId: "door-a", accessible: true, color: "#16a34a" },
      { id: "door-node-b", name: "Door B", type: "hallway", x: 70, y: 85, buildingId: "b1", floorId: "f1", doorId: "door-b", accessible: true, color: "#16a34a" },
      { id: "door-node-c", name: "Door C", type: "hallway", x: 105, y: 85, buildingId: "b1", floorId: "f1", doorId: "door-c", accessible: true, color: "#16a34a" },
      { id: "room-aisle", name: "Room Aisle", type: "hallway", x: 70, y: 62, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "hall-a", name: "Hall A", type: "hallway", x: 35, y: 115, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "hall-b", name: "Hall B", type: "hallway", x: 70, y: 115, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "hall-c", name: "Hall C", type: "hallway", x: 105, y: 115, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    authored.navEdges = [
      // One generated typed relation and two persisted legacy relations model
      // the multi-door star seen in the CEIT recording.
      { id: "synthetic-door-a", startNodeId: "room-anchor", endNodeId: "door-node-a", distance: 45, bidirectional: true, accessible: true, type: ROOM_DOOR_EDGE_TYPE, color: "#64748b", width: 2 },
      { id: "synthetic-door-b", startNodeId: "room-anchor", endNodeId: "door-node-b", distance: 35, bidirectional: true, accessible: true } as NavigationEdge,
      { id: "synthetic-door-c", startNodeId: "room-anchor", endNodeId: "door-node-c", distance: 45, bidirectional: true, accessible: true } as NavigationEdge,
      { id: "authored-room-aisle", startNodeId: "room-anchor", endNodeId: "room-aisle", distance: 12, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
      { id: "authored-door-a-hall", startNodeId: "door-node-a", endNodeId: "hall-a", distance: 30, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
      { id: "authored-door-b-hall", startNodeId: "door-node-b", endNodeId: "hall-b", distance: 30, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
      { id: "authored-door-c-hall", startNodeId: "door-node-c", endNodeId: "hall-c", distance: 30, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
    ];

    cleanup();
    const { container } = render(<Harness initialCampus={authored} />);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));

    const roomElement = container.querySelector<SVGGElement>('[data-layer-key="room:multi-door-room"]');
    expect(roomElement).toBeTruthy();
    // This preview is specifically for an empty-room physical gesture. Keep
    // the start point clear of the authored vertical aisle at x=70 so the
    // navigation path correctly owns clicks made directly on that aisle.
    fireEvent.mouseDown(roomElement!, { clientX: 55, clientY: 50, button: 0, bubbles: true });
    const roomPreview = container.querySelector<SVGGElement>('[data-testid="floor-nav-gesture-preview"]');
    expect(roomPreview?.getAttribute("data-preview-trigger")).toBe("physical-object-gesture");
    expect(roomPreview?.getAttribute("data-preview-owner-ids")).toContain("multi-door-room");
    expect(roomPreview?.querySelector('[data-preview-edge-id="synthetic-door-a"]')).toBeNull();
    expect(roomPreview?.querySelector('[data-preview-edge-id="synthetic-door-b"]')).toBeNull();
    expect(roomPreview?.querySelector('[data-preview-edge-id="synthetic-door-c"]')).toBeNull();
    expect(Array.from(roomPreview?.querySelectorAll<SVGPolylineElement>("[data-preview-edge-id]") ?? [], (edge) => edge.getAttribute("data-preview-edge-id")).sort())
      .toEqual(["authored-door-a-hall", "authored-door-b-hall", "authored-door-c-hall", "authored-room-aisle"]);
    const aislePreview = roomPreview?.querySelector<SVGPolylineElement>('[data-preview-edge-id="authored-room-aisle"]');
    expect(aislePreview).toBeTruthy();
    expect(aislePreview?.getAttribute("data-preview-source-collection")).toBe("visibleIndoorEdges");
    expect(aislePreview?.getAttribute("data-preview-start-node-id")).toBe("room-anchor");
    expect(aislePreview?.getAttribute("data-preview-start-room-id")).toBe(room.id);
    expect(authored.buildings[0].floors[0].rooms[0]).toMatchObject({ x: 20, y: 20, w: 100, h: 65 });
    fireEvent.mouseUp(svg, { clientX: 55, clientY: 50, button: 0, bubbles: true });
    expect(container.querySelector('[data-testid="floor-nav-gesture-preview"]')).toBeNull();

    // Selecting a Door uses the same filtered edge set: its genuine hallway
    // continuation stays visible while the synthetic room connector stays out.
    const doorElement = container.querySelector<SVGGElement>('[data-layer-key="door:door-a"]');
    expect(doorElement).toBeTruthy();
    fireEvent.mouseDown(doorElement!, { clientX: 35, clientY: 85, button: 0, bubbles: true });
    const doorPreview = container.querySelector<SVGGElement>('[data-testid="floor-nav-gesture-preview"]');
    expect(doorPreview?.querySelector('[data-preview-edge-id="synthetic-door-a"]')).toBeNull();
    const corridorPreview = doorPreview?.querySelector<SVGPolylineElement>('[data-preview-edge-id="authored-door-a-hall"]');
    expect(corridorPreview).toBeTruthy();
    expect(corridorPreview?.getAttribute("data-preview-end-node-id")).toBe("hall-a");
    expect(container.querySelector('[data-nav-edge-id="authored-door-a-hall"]')?.getAttribute("data-nav-edge-type")).toBe("hallway");

    // The visibility control owns the entire transient navigation layer too;
    // switching it off mid-gesture restores source visibility and removes the
    // clone instead of letting it survive the next pan/zoom.
    fireEvent.click(screen.getByRole("button", { name: "Hide Navigation" }));
    expect(container.querySelector('[data-testid="floor-nav-gesture-preview"]')).toBeNull();
    expect(container.querySelector('[data-testid="floor-nav-interaction-overlay"]')?.getAttribute("visibility")).toBe("hidden");
    fireEvent.mouseUp(svg, { clientX: 35, clientY: 85, button: 0, bubbles: true });
    expect(container.querySelector('[data-testid="floor-nav-gesture-preview"]')).toBeNull();
    expect(authored.navEdges).toHaveLength(7);
    expect(authored.navEdges?.map((edge) => edge.id)).toContain("synthetic-door-b");
  });

  it("reproduces the CEIT Floor 3 room-path case across visibility, selection, pan, and zoom", async () => {
    const authored = makeBaseCampus();
    authored.buildings[0].name = "CEIT";
    authored.buildings[0].floors[0].number = 3;
    authored.buildings[0].floors[0].label = "Floor 3";
    const room: FloorRoom = {
      id: "ceit-library", name: "CEIT LIBRARY", type: "library", x: 20, y: 20, w: 90, h: 60,
      floorId: "f1", buildingId: "b1",
    };
    authored.buildings[0].floors[0].rooms = [room];
    authored.buildings[0].floors[0].paths = [{
      id: "path-through-room", points: [{ x: 0, y: 50 }, { x: 150, y: 50 }], type: "walkway", color: "#15803d", width: 3,
    }, {
      id: "path-inside-room", points: [{ x: 35, y: 35 }, { x: 95, y: 35 }], type: "walkway", color: "#15803d", width: 3,
    }, {
      id: "path-touching-room-boundary", points: [{ x: 20, y: 80 }, { x: 110, y: 80 }], type: "walkway", color: "#15803d", width: 3,
    }];
    authored.navNodes = [
      { id: "line-a", name: "A", type: "hallway", x: 0, y: 50, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "line-b", name: "B", type: "hallway", x: 150, y: 50, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "inside-a", name: "Inside A", type: "hallway", x: 35, y: 55, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "inside-b", name: "Inside B", type: "hallway", x: 95, y: 55, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    authored.navEdges = [
      { id: "line-through-room", startNodeId: "line-a", endNodeId: "line-b", distance: 150, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
      { id: "line-inside-room", startNodeId: "inside-a", endNodeId: "inside-b", distance: 60, bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3 },
    ];

    cleanup();
    const onUpdate = vi.fn();
    const { container } = render(<Harness initialCampus={authored} onCampusChange={onUpdate as (campus: Campus) => void} />);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));

    const pathLayer = screen.getByTestId("floor-internal-paths");
    expect(pathLayer.hasAttribute("mask")).toBe(false);
    const visibleAuthoredPaths = () => pathLayer.querySelectorAll<SVGPolylineElement>(
      'polyline:not([data-testid="floor-path-hit"]):not([data-testid="floor-path-selected"])',
    );
    expect(visibleAuthoredPaths()).toHaveLength(3);
    expect(pathLayer.querySelectorAll('[data-testid="floor-path-hit"]')).toHaveLength(3);
    const originalPathPoints = Array.from(visibleAuthoredPaths(), (line) => line.getAttribute("points"));
    const networkLayer = screen.getByTestId("floor-nav-edge-lines");
    expect(networkLayer.hasAttribute("mask")).toBe(false);
    expect(networkLayer.querySelector('[data-nav-edge-id="line-through-room"]')).toBeInTheDocument();
    expect(networkLayer.querySelector('[data-nav-edge-id="line-inside-room"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide Navigation" }));
    expect(screen.queryByTestId("floor-nav-overlay")).toBeNull();

    const roomElement = container.querySelector<SVGGElement>('[data-layer-key="room:ceit-library"]');
    expect(roomElement).toBeTruthy();
    // Keep this well clear of the authored path endpoints: it represents an
    // actual empty-room click after the overlap-selection checks above.
    fireEvent.mouseDown(roomElement!, { clientX: 105, clientY: 25, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByDisplayValue("CEIT LIBRARY")).toBeInTheDocument();
    expect(screen.queryByTestId("floor-nav-overlay")).toBeNull();
    const updateCallsBeforePan = onUpdate.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    fireEvent.click(screen.getByRole("button", { name: /WallCreate room\/floor boundaries/ }));
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="line-through-room"]')).toBeInTheDocument();
    expect(screen.getByTestId("floor-nav-overlay").querySelector('[data-nav-edge-id="line-inside-room"]')).toBeInTheDocument();
    const readOnlyNetworkLayer = screen.getByTestId("floor-nav-overlay-edge-lines");
    expect(readOnlyNetworkLayer.hasAttribute("mask")).toBe(false);
    expect(readOnlyNetworkLayer.querySelector('[data-nav-edge-id="line-through-room"]')).toBeInTheDocument();
    expect(readOnlyNetworkLayer.querySelector('[data-nav-edge-id="line-inside-room"]')).toBeInTheDocument();

    const cameraTransform = Array.from(svg.querySelectorAll<SVGGElement>("g[transform]"))
      .find((element) => /^translate\(/.test(element.getAttribute("transform") ?? ""));
    expect(cameraTransform).toBeTruthy();
    const beforePan = cameraTransform!.getAttribute("transform");
    const pathGeometryBefore = Array.from(visibleAuthoredPaths(), (line) => line.getAttribute("points"));
    const edgeGeometryBefore = Array.from(readOnlyNetworkLayer.querySelectorAll<SVGLineElement>("[data-nav-edge-id]"), (line) => [line.getAttribute("x1"), line.getAttribute("y1"), line.getAttribute("x2"), line.getAttribute("y2")]);
    fireEvent.keyDown(window, { key: "h" });
    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 42, clientY: 31, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(cameraTransform!.getAttribute("transform")).not.toBe(beforePan);
    expect(Array.from(visibleAuthoredPaths(), (line) => line.getAttribute("points"))).toEqual(pathGeometryBefore);
    expect(pathGeometryBefore).toEqual(originalPathPoints);
    const pannedNetworkLayer = screen.getByTestId("floor-nav-edge-lines");
    const edgeGeometryAfter = Array.from(pannedNetworkLayer.querySelectorAll<SVGLineElement>("[data-nav-edge-id]"), (line) => [line.getAttribute("x1"), line.getAttribute("y1"), line.getAttribute("x2"), line.getAttribute("y2")]);
    expect(edgeGeometryAfter).toEqual(edgeGeometryBefore);
    expect(pannedNetworkLayer.querySelector('[data-nav-edge-id="line-through-room"]')).toBeInTheDocument();
    expect(pannedNetworkLayer.querySelector('[data-nav-edge-id="line-inside-room"]')).toBeInTheDocument();
    const beforeZoom = cameraTransform!.getAttribute("transform");
    fireEvent.wheel(svg, { ctrlKey: true, clientX: 100, clientY: 80, deltaY: -120, bubbles: true });
    await waitFor(() => expect(cameraTransform!.getAttribute("transform")).not.toBe(beforeZoom));
    expect(Array.from(visibleAuthoredPaths(), (line) => line.getAttribute("points"))).toEqual(pathGeometryBefore);
    const zoomedNetworkLayer = screen.getByTestId("floor-nav-edge-lines");
    expect(Array.from(zoomedNetworkLayer.querySelectorAll<SVGLineElement>("[data-nav-edge-id]"), (line) => [line.getAttribute("x1"), line.getAttribute("y1"), line.getAttribute("x2"), line.getAttribute("y2")])).toEqual(edgeGeometryBefore);
    expect(screen.getByDisplayValue("CEIT LIBRARY")).toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledTimes(updateCallsBeforePan);
    expect(authored.buildings[0].floors[0].rooms[0]).toMatchObject({ x: 20, y: 20, w: 90, h: 60 });
    expect(authored.navEdges[0].startNodeId).toBe("line-a");
  });

  it("suspends Connect preview during camera pan and resumes from fresh world coordinates", async () => {
    const withNodes = makeBaseCampus();
    withNodes.navNodes = [
      { id: "pan-source", name: "A", type: "hallway", x: 40, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "pan-target", name: "B", type: "hallway", x: 120, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withNodes} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));

    const source = navNodes(container).find((node) => node.getAttribute("data-nav-node-id") === "pan-source")!;
    const target = () => navNodes(container).find((node) => node.getAttribute("data-nav-node-id") === "pan-target")!;
    fireEvent.mouseDown(source, { clientX: 40, clientY: 40, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 40, clientY: 40, bubbles: true });
    expect(container.querySelector('[data-testid="nav-connect-start"]')).toBeTruthy();

    fireEvent.mouseMove(svg, { clientX: 120, clientY: 100, bubbles: true });
    const firstPreview = await screen.findByTestId("floor-nav-connect-live-preview");
    expect(firstPreview).toBeTruthy();
    const changesBeforePan = onCampusChange.mock.calls.length;
    const graphBeforePan = JSON.stringify({ nodes: withNodes.navNodes, edges: withNodes.navEdges });

    // Middle-button camera pan owns this whole pointer stream. The armed
    // source survives, while both the React and imperative previews are gone.
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 120, button: 1, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 190, clientY: 140, button: 1, bubbles: true });
    expect(container.querySelector('[data-testid="floor-nav-connect-live-preview"]')).toBeNull();
    expect(container.querySelector('[data-testid="floor-nav-connect-preview"]')).toBeNull();
    fireEvent.mouseUp(svg, { clientX: 190, clientY: 140, button: 1, bubbles: true });
    expect(container.querySelector('[data-testid="nav-connect-start"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="floor-nav-connect-live-preview"]')).toBeNull();
    expect(onCampusChange.mock.calls.length).toBe(changesBeforePan);
    expect(JSON.stringify({ nodes: withNodes.navNodes, edges: withNodes.navEdges })).toBe(graphBeforePan);

    // After a fresh move, screen position (160,120) maps through the new
    // +40,+20 camera pan to the original target world point (120,100).
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 120, bubbles: true });
    const resumedPreview = await screen.findByTestId("floor-nav-connect-live-preview");
    const previewLine = resumedPreview.querySelector("[data-connect-line]")!;
    expect(previewLine.getAttribute("points")?.trim().split(/\s+/).at(-1)).toBe("120,100");

    fireEvent.mouseDown(target(), { clientX: 160, clientY: 120, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 160, clientY: 120, bubbles: true });
    const latest = onCampusChange.mock.calls.at(-1)?.[0] as Campus;
    expect(latest.navNodes).toHaveLength(2);
    expect(latest.navNodes?.find((node) => node.id === "pan-source")).toMatchObject({ x: 40, y: 40 });
    expect(latest.navNodes?.find((node) => node.id === "pan-target")).toMatchObject({ x: 120, y: 100 });
    expect(latest.navEdges).toHaveLength(1);
    expect(new Set([latest.navEdges?.[0].startNodeId, latest.navEdges?.[0].endNodeId])).toEqual(new Set(["pan-source", "pan-target"]));
  });

  it("keeps Connect preview suspended after Space-pan until the next pointer move", async () => {
    const withNodes = makeBaseCampus();
    withNodes.navNodes = [
      { id: "space-source", name: "A", type: "hallway", x: 45, y: 45, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "space-target", name: "B", type: "hallway", x: 140, y: 90, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withNodes} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container).find((node) => node.getAttribute("data-nav-node-id") === "space-source")!;
    fireEvent.mouseDown(source, { clientX: 45, clientY: 45, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 45, clientY: 45, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 80, clientY: 80, bubbles: true });
    await screen.findByTestId("floor-nav-connect-live-preview");

    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 110, button: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 130, clientY: 130, button: 0, bubbles: true });
    expect(container.querySelector('[data-testid="floor-nav-connect-live-preview"]')).toBeNull();
    fireEvent.mouseUp(svg, { clientX: 130, clientY: 130, bubbles: true });
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(container.querySelector('[data-testid="nav-connect-start"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="floor-nav-connect-live-preview"]')).toBeNull();

    fireEvent.mouseMove(svg, { clientX: 125, clientY: 115, bubbles: true });
    const preview = await screen.findByTestId("floor-nav-connect-live-preview");
    expect(preview.querySelector("[data-connect-line]")?.getAttribute("points")).toMatch(/45,45/);
    expect(container.querySelectorAll('[data-testid="nav-edge"]')).toHaveLength(0);
    expect(onCampusChange).not.toHaveBeenCalled();
  });

  it("temporarily returns from the Pan tool to the armed Connect source", async () => {
    const withNodes = makeBaseCampus();
    withNodes.navNodes = [
      { id: "tool-pan-source", name: "A", type: "hallway", x: 40, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "tool-pan-target", name: "B", type: "hallway", x: 120, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withNodes} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container).find((node) => node.getAttribute("data-nav-node-id") === "tool-pan-source")!;
    fireEvent.mouseDown(source, { clientX: 40, clientY: 40, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 80, bubbles: true });
    await screen.findByTestId("floor-nav-connect-live-preview");

    fireEvent.click(container.querySelector('[data-tutorial="floor-pan-tool"]') as HTMLElement);
    expect(container.querySelector('[data-testid="nav-connect-start"]')).toBeTruthy();
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 120, button: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 180, clientY: 140, button: 0, bubbles: true });
    expect(container.querySelector('[data-testid="floor-nav-connect-live-preview"]')).toBeNull();
    fireEvent.mouseUp(svg, { clientX: 180, clientY: 140, button: 0, bubbles: true });

    expect(container.querySelector('[data-testid="nav-connect-start"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="floor-nav-connect-live-preview"]')).toBeNull();
    expect(container.querySelector('[data-tutorial="floor-select-tool"]')).toHaveAttribute("aria-pressed", "true");
    expect(onCampusChange).not.toHaveBeenCalled();
    fireEvent.mouseMove(svg, { clientX: 90, clientY: 80, bubbles: true });
    const preview = await screen.findByTestId("floor-nav-connect-live-preview");
    // The camera moved by (+30,+20) viewBox units, so the fresh pointer at
    // (90,80) now resolves to world-space (60,60), not the old pre-pan point.
    expect(preview.querySelector("[data-connect-line]")?.getAttribute("points")).toMatch(/60,60/);
  });

  it("shows a restrained canvas empty state and does NOT auto-open the Properties sidebar", () => {
    enterNavigationMode();
    // B5 Phase 2.1: instructions moved to a small canvas overlay — never the sidebar.
    expect(screen.getByTestId("floor-nav-canvas-empty-state")).toBeTruthy();
    expect(screen.getByText("Build the Walking Network")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-empty-state")).toBeNull();
  });

  it("places a free indoor waypoint at the exact clicked world coordinate", () => {
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 50, 40);
    expect(navNodes(container)).toHaveLength(1);
    const circle = nodeCircle(container, 0);
    expect(Number(circle.getAttribute("cx"))).toBe(50);
    expect(Number(circle.getAttribute("cy"))).toBe(40);
    // Node opens the WAYPOINT inspector — not a marker inspector.
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    expect(within(screen.getByTestId("floor-nav-node-props")).getByText("Waypoint")).toBeTruthy();
    // Graph mutation marks the outer Campus draft dirty.
    expect(onCampusChange.mock.calls.length).toBeGreaterThan(0);
  });

  it("places a waypoint at the immediate click position even when the last hover was elsewhere", () => {
    const withLeftPath = makeBaseCampus();
    withLeftPath.navNodes = [
      { id: "left-a", name: "Left A", type: "hallway", x: 35, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "left-b", name: "Left B", type: "hallway", x: 65, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withLeftPath.navEdges = [{
      id: "left-path", startNodeId: "left-a", endNodeId: "left-b", distance: 30,
      bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange as any} initialCampus={withLeftPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Walking Point" }));
    const svg = stubSvgRect(container);
    const cameraGroup = svg.querySelector("g") as SVGGElement;
    const cameraMatrix = { a: 2.5, b: 0, c: 0, d: 2.5, e: 450, f: 106 };
    Object.defineProperty(cameraGroup, "getScreenCTM", { value: () => cameraMatrix });
    const screenAtWorld = (x: number, y: number) => ({ clientX: 450 + x * 2.5, clientY: 106 + y * 2.5 });
    // Simulate a slow/stale hover sample, then click elsewhere immediately.
    fireEvent.mouseMove(svg, screenAtWorld(40, 40));
    fireEvent.mouseDown(svg, { ...screenAtWorld(180, 120), bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(navNodes(container)).toHaveLength(3);
    const positions = navNodes(container).map((item) => {
      const circle = item.querySelector("circle");
      return [Number(circle?.getAttribute("cx")), Number(circle?.getAttribute("cy"))];
    });
    expect(positions).toContainEqual([180, 120]);
  });

  it("does not mark the draft dirty just for switching modes", () => {
    enterNavigationMode();
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
  });

  it("Navigation Select cannot select floor objects (rooms stay context-only)", () => {
    const withRoom = makeBaseCampus();
    withRoom.buildings[0].floors[0].rooms = [
      { id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    cleanup();
    const rendered = render(<Harness initialCampus={withRoom} />);
    container = rendered.container;
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(roomGroup(container, withRoom.buildings[0].floors[0].rooms[0]), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // No design properties panel, no room selection state — and no nav node was created.
    expect(screen.queryByTestId("floor-properties-panel")).toBeNull();
    expect(navNodes(container)).toHaveLength(0);
  });

  it("Inspect Connections focuses a physical Door that has no navigation node and exposes its repair action", async () => {
    const withUnlinkedDoor = makeBaseCampus();
    const room: FloorRoom = {
      id: "electrical-room", name: "Electrical Room", type: "utility", x: 20, y: 20, w: 50, h: 40,
      floorId: "f1", buildingId: "b1", accessDoorIds: ["electrical-door-2"],
    };
    withUnlinkedDoor.buildings[0].floors[0].rooms = [room];
    withUnlinkedDoor.buildings[0].floors[0].walls = [{
      id: "electrical-wall", x1: 20, y1: 60, x2: 70, y2: 60, thickness: 4, color: "#64748b",
    }];
    withUnlinkedDoor.buildings[0].floors[0].doors = [{
      id: "electrical-door-2", label: "Electrical Room Door 2", x: 45, y: 60, width: 16,
      wallId: "electrical-wall", direction: "left", color: "#64748b",
    }];

    cleanup();
    const rendered = render(<Harness initialCampus={withUnlinkedDoor} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 40, clientY: 40, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /^Emergency Evacuation/ }));
    await screen.findByTestId("room-emergency-validation-summary");
    fireEvent.click(screen.getByText("Inspect Connections"));
    fireEvent.click(within(screen.getByTestId("room-emergency-validation-summary")).getByRole("button", { name: "Inspect" }));

    expect(screen.getByText("Electrical Room Door 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Navigation" })).toBeInTheDocument();
    expect(navNodes(container)).toHaveLength(0);
    expect(onCampusChange).not.toHaveBeenCalled();
  });

  it("selects a navigation edge or waypoint when the Room receives the overlapping pointer event", () => {
    const withLibrary = makeBaseCampus();
    const room: FloorRoom = {
      id: "library", name: "CEIT LIBRARY", type: "library", x: 20, y: 20, w: 180, h: 120,
      floorId: "f1", buildingId: "b1",
    };
    withLibrary.buildings[0].floors[0].rooms = [room];
    withLibrary.navNodes = [
      { id: "library-a", name: "Aisle A", type: "hallway", x: 45, y: 60, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "library-b", name: "Aisle B", type: "hallway", x: 175, y: 60, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "library-waypoint", name: "Interior Junction", type: "hallway", x: 110, y: 95, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withLibrary.navEdges = [{
      id: "library-interior-path", startNodeId: "library-a", endNodeId: "library-b", distance: 130,
      bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3,
    }];
    cleanup();
    const rendered = render(<Harness initialCampus={withLibrary} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));

    // Empty room space continues to select the Room normally.
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 150, clientY: 110, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByDisplayValue("CEIT LIBRARY")).toBeInTheDocument();

    // Exercise the failure path: the browser resolved the click to the Room
    // group even though it is geometrically on top of an authored graph edge.
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 100, clientY: 60, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-edge-props")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="nav-edge-selected"]')).toBeInTheDocument();
    expect(screen.queryByDisplayValue("CEIT LIBRARY")).toBeNull();

    // A waypoint hit is prioritized over the containing Room (and over the
    // path edge when both are within the screen-space tolerance).
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 110, clientY: 95, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-node-props")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("CEIT LIBRARY")).toBeNull();

    // The arbitration is narrow: empty Room interior still restores ordinary
    // Room Properties selection.
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 150, clientY: 110, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByDisplayValue("CEIT LIBRARY")).toBeInTheDocument();
    expect(screen.queryByTestId("floor-nav-edge-props")).toBeNull();

    // Turning the overlay off removes graph hit eligibility; the same point
    // then belongs to the Room and cannot be selected through a hidden target.
    fireEvent.click(screen.getByRole("button", { name: "Hide Navigation" }));
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 100, clientY: 60, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByDisplayValue("CEIT LIBRARY")).toBeInTheDocument();
  });

  it("selects a thin authored floor path inside a Room before the Room drag starts", () => {
    const withLibrary = makeBaseCampus();
    const room: FloorRoom = {
      id: "library", name: "CEIT LIBRARY", type: "library", x: 20, y: 20, w: 180, h: 120,
      floorId: "f1", buildingId: "b1",
    };
    withLibrary.buildings[0].floors[0].rooms = [room];
    withLibrary.buildings[0].floors[0].paths = [{
      id: "library-aisle", points: [{ x: 35, y: 70 }, { x: 190, y: 70 }],
      type: "footpath", color: "#15803d", width: 2,
    }, {
      id: "library-secondary-aisle", points: [{ x: 35, y: 92 }, { x: 190, y: 92 }],
      type: "footpath", color: "#15803d", width: 2,
    }];
    cleanup();
    const rendered = render(<Harness initialCampus={withLibrary} />);
    container = rendered.container;
    const svg = stubSvgRect(container);

    // Simulate the real overlap case where the Room polygon wins SVG hit
    // testing, but the pointer is only a few screen pixels from the authored
    // path. Path selection must own the gesture before onRoomPointerDown.
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 100, clientY: 75, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelector('[data-testid="floor-path-selected"]')).toBeInTheDocument();
    expect(screen.queryByDisplayValue("CEIT LIBRARY")).toBeNull();

    const hitStroke = container.querySelector<SVGPolylineElement>('[data-testid="floor-path-hit"][data-floor-path-id="library-aisle"]');
    expect(hitStroke).toBeTruthy();
    expect(hitStroke?.getAttribute("pointer-events")).toBe("stroke");
    expect(Number(hitStroke?.getAttribute("stroke-width"))).toBeGreaterThan(2);
    expect(Array.from(container.querySelectorAll<SVGGElement>('[data-testid="floor-path-target"]')).at(-1)?.getAttribute("data-floor-path-id"))
      .toBe("library-aisle");

    // Clicking away from every path segment still selects the Room normally.
    fireEvent.mouseDown(roomGroup(container, room), { clientX: 150, clientY: 110, button: 0, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByDisplayValue("CEIT LIBRARY")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="floor-path-selected"]')).toBeNull();
  });

  it("keeps a selected room-interior path and its waypoints stationary during Space-pan", () => {
    const withLibrary = makeBaseCampus();
    withLibrary.buildings[0].floors[0].rooms = [
      { id: "library", name: "CEIT LIBRARY", type: "library", x: 20, y: 20, w: 180, h: 120, floorId: "f1", buildingId: "b1" },
    ];
    withLibrary.navNodes = [
      { id: "library-a", name: "Aisle A", type: "hallway", x: 45, y: 60, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "library-b", name: "Aisle B", type: "hallway", x: 175, y: 60, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withLibrary.navEdges = [{
      id: "library-interior-path", startNodeId: "library-a", endNodeId: "library-b", distance: 130,
      bidirectional: true, accessible: true, type: "hallway", color: "#15803d", width: 3,
    }];
    cleanup();
    const onUpdate = vi.fn();
    const rendered = render(<Harness initialCampus={withLibrary} onCampusChange={onUpdate as (campus: Campus) => void} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));

    fireEvent.mouseDown(roomGroup(container, withLibrary.buildings[0].floors[0].rooms[0]), {
      clientX: 100, clientY: 60, button: 0, bubbles: true,
    });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-edge-props")).toBeInTheDocument();

    const cameraGroup = Array.from(svg.querySelectorAll<SVGGElement>("g[transform]"))
      .find((element) => /^translate\(/.test(element.getAttribute("transform") ?? ""));
    expect(cameraGroup).toBeTruthy();
    const cameraBefore = cameraGroup!.getAttribute("transform");
    const nodePositionsBefore = Array.from(container.querySelectorAll<SVGGElement>('[data-testid="nav-node"]'), (node) => {
      const hit = node.querySelector<SVGCircleElement>('[data-testid="nav-node-hit"]')!;
      return [hit.getAttribute("cx"), hit.getAttribute("cy")];
    });
    const edgeGeometryBefore = Array.from(container.querySelectorAll<SVGElement>('[data-nav-edge-id="library-interior-path"] line, [data-nav-edge-id="library-interior-path"] polyline'), (edge) => edge.outerHTML);
    const updateCountBeforePan = onUpdate.mock.calls.length;

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    const edgeHit = container.querySelector('[data-testid="nav-edge-hit"]')!;
    fireEvent.mouseDown(edgeHit, { clientX: 100, clientY: 60, button: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 130, clientY: 95, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 130, clientY: 95, bubbles: true });
    fireEvent.keyUp(window, { key: " ", code: "Space" });

    expect(cameraGroup!.getAttribute("transform")).not.toBe(cameraBefore);
    expect(Array.from(container.querySelectorAll<SVGGElement>('[data-testid="nav-node"]'), (node) => {
      const hit = node.querySelector<SVGCircleElement>('[data-testid="nav-node-hit"]')!;
      return [hit.getAttribute("cx"), hit.getAttribute("cy")];
    })).toEqual(nodePositionsBefore);
    expect(Array.from(container.querySelectorAll<SVGElement>('[data-nav-edge-id="library-interior-path"] line, [data-nav-edge-id="library-interior-path"] polyline'), (edge) => edge.outerHTML)).toEqual(edgeGeometryBefore);
    expect(onUpdate).toHaveBeenCalledTimes(updateCountBeforePan);
    expect(screen.getByTestId("floor-nav-edge-props")).toBeInTheDocument();
  });

  it("Connect Path connects two existing waypoints", () => {
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 40, 40);
    clickWalkingPointTool();
    clickCanvas(container, 120, 80);
    expect(navNodes(container)).toHaveLength(2);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const edge = navEdges(container)[0];
    // B5 Phase 2.5: non-aligned nodes connect as an auto-orthogonal polyline —
    // start at the first waypoint, bend, and terminate at the second.
    const pts = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(pts[0]).toEqual([40, 40]);
    expect(pts[pts.length - 1]).toEqual([120, 80]);
    expect(screen.getByTestId("floor-nav-edge-props")).toBeTruthy();
    expect(screen.getByText("Navigation Path")).toBeTruthy();
  });

  it("connects existing Walking Points inside a large Room", () => {
    const withLibrary = makeBaseCampus();
    withLibrary.buildings[0].floors[0].rooms = [
      { id: "library", name: "CABA Library", type: "library", x: 20, y: 20, w: 180, h: 120, floorId: "f1", buildingId: "b1" },
    ];
    withLibrary.navNodes = [
      { id: "library-walk-a", name: "Aisle A", type: "hallway", x: 45, y: 55, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "library-walk-b", name: "Aisle B", type: "hallway", x: 160, y: 55, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withLibrary} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const [first, second] = navNodes(container);
    fireEvent.mouseDown(first, { clientX: 45, clientY: 55, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(second, { clientX: 160, clientY: 55, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    expect(latest.navEdges?.some((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("library-walk-a")
      && new Set([edge.startNodeId, edge.endNodeId]).has("library-walk-b"))).toBe(true);
    expect(screen.queryByText("Use the Room Door")).toBeNull();
  });

  it("connects a nested Room Door to a manual Walking Path in its containing Room", () => {
    const nested = makeBaseCampus();
    nested.buildings[0].floors[0].rooms = [
      { id: "library", name: "CABA Library", type: "library", x: 10, y: 10, w: 200, h: 140, floorId: "f1", buildingId: "b1" },
      { id: "collab", name: "Collab Room 3A", type: "classroom", x: 70, y: 55, w: 80, h: 60, floorId: "f1", buildingId: "b1", accessDoorId: "collab-door" },
    ];
    nested.buildings[0].floors[0].doors = [
      { id: "collab-door", x: 110, y: 55, width: 20, direction: "right", color: "#b45309", wallId: "collab-wall", offset: 0.5 },
    ];
    nested.navNodes = [
      { id: "collab-door-node", name: "Collab Door", type: "hallway", x: 110, y: 55, buildingId: "b1", floorId: "f1", doorId: "collab-door", accessible: true, color: "#16a34a" },
      { id: "library-path-a", name: "Library Path A", type: "hallway", x: 40, y: 35, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "library-path-b", name: "Library Path B", type: "hallway", x: 180, y: 35, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    nested.navEdges = [{ id: "library-path", startNodeId: "library-path-a", endNodeId: "library-path-b", distance: 140, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={nested} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const doorNode = container.querySelector('[data-testid="nav-linked-node"]');
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(doorNode).toBeTruthy();
    expect(pathHit).toBeTruthy();
    fireEvent.mouseDown(doorNode!, { clientX: 110, clientY: 55, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 35, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    expect(latest.navNodes?.some((node) => node.pathJunction && node.x === 110 && node.y === 35)).toBe(true);
    expect(latest.navEdges?.filter((edge) => edge.id !== "library-path")).toHaveLength(3);
    expect(screen.queryByText("Connect to the containing Room network")).toBeNull();
  });

  it("Connect Path uses the current click point instead of a prior same-edge hover projection", async () => {
    const withPath = makeBaseCampus();
    withPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Elevator", type: "hallway", x: 110, y: 130, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withPath.navEdges = [{ id: "edge-ab", startNodeId: "nav-a", endNodeId: "nav-b", distance: 140, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPath} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    const cameraGroup = svg.querySelector("g") as SVGGElement;
    const cameraMatrix = { a: 2.5, b: 0, c: 0, d: 2.5, e: 450, f: 106 };
    Object.defineProperty(cameraGroup, "getScreenCTM", { value: () => cameraMatrix });
    const screenAtWorld = (x: number, y: number) => ({ clientX: 450 + x * 2.5, clientY: 106 + y * 2.5 });
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    fireEvent.mouseDown(navNodes(container).find((node) => node.getAttribute("data-node-id") === "nav-source") ?? navNodes(container)[2], { ...screenAtWorld(110, 130), bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    let pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    // Put the hover projection on the left part of the same edge, wait for
    // that preview, then click the right part of the same edge.
    fireEvent.mouseMove(pathHit!, screenAtWorld(65, 80));
    await screen.findByTestId("nav-connect-path-target");
    pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    fireEvent.mouseDown(pathHit!, { ...screenAtWorld(150, 80), bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const floorNodes = (latest.navNodes ?? []).filter((node) => node.floorId === "f1");
    const floorEdges = (latest.navEdges ?? []).filter((edge) => {
      const ids = new Set(floorNodes.map((node) => node.id));
      return ids.has(edge.startNodeId) && ids.has(edge.endNodeId);
    });
    const junction = floorNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    expect(junction?.x).toBe(150);
    expect(junction?.y).toBe(80);
    expect(floorNodes).toHaveLength(4);
    expect(floorEdges).toHaveLength(3);
    expect(floorEdges.some((edge) => edge.startNodeId === "nav-a" && edge.endNodeId === "nav-b")).toBe(false);
    expect(floorEdges.some((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("nav-source") && new Set([edge.startNodeId, edge.endNodeId]).has(junction!.id))).toBe(true);
  });

  it("shows the hovered manual path as a projected Connect target", async () => {
    const withPath = makeBaseCampus();
    withPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Elevator", type: "hallway", x: 110, y: 130, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withPath.navEdges = [{ id: "edge-ab", startNodeId: "nav-a", endNodeId: "nav-b", distance: 140, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPath} />);
    container = rendered.container;
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container)[2];
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 110, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    fireEvent.mouseMove(pathHit!, { clientX: 110, clientY: 80, bubbles: true });
    expect(await screen.findByTestId("nav-connect-path-target")).toBeTruthy();
    expect(screen.getByTestId("nav-connect-path-hint")).toHaveTextContent("Click to connect to path");

    // The actual pointer-down coordinate is projected onto the path at commit;
    // the frame-coalesced preview remains a visual aid only.
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const floorNodes = (latest.navNodes ?? []).filter((node) => node.floorId === "f1");
    const floorEdges = (latest.navEdges ?? []).filter((edge) => {
      const ids = new Set(floorNodes.map((node) => node.id));
      return ids.has(edge.startNodeId) && ids.has(edge.endNodeId);
    });
    const junction = floorNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    expect(junction?.x).toBe(110);
    expect(junction?.y).toBe(80);
    expect(floorEdges.some((edge) => edge.startNodeId === "nav-a" && edge.endNodeId === "nav-b")).toBe(false);
    expect(floorEdges).toHaveLength(3);
  });

  it("previews and commits a near-horizontal path junction at the same snapped point", () => {
    const withPath = makeBaseCampus();
    withPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 80.8, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 80.8, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Source", type: "hallway", x: 100, y: 81.5, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withPath.navEdges = [{ id: "edge-ab", startNodeId: "nav-a", endNodeId: "nav-b", distance: 140, type: "hallway", bidirectional: true, accessible: true, emergencySafe: true }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container).find((node) => node.querySelector('circle[cx="100"][cy="81.5"]'))!;
    fireEvent.mouseDown(source, { clientX: 100, clientY: 81.5, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]')!;
    fireEvent.mouseMove(pathHit, { clientX: 120, clientY: 81, bubbles: true });
    const preview = container.querySelector('[data-testid="floor-nav-connect-preview"] polyline')!;
    const previewPoints = (preview.getAttribute("points") ?? "").split(/\s+/).map((point) => point.split(",").map(Number));
    expect(previewPoints[0]).toEqual([100, 81.5]);
    expect(previewPoints[previewPoints.length - 1]).toEqual([120, 81.5]);

    fireEvent.mouseDown(pathHit, { clientX: 120, clientY: 81, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const junction = latest.navNodes.find((node) => node.pathJunction)!;
    expect(junction).toMatchObject({ x: previewPoints.at(-1)![0], y: previewPoints.at(-1)![1] });
    const incidentEdges = latest.navEdges.filter((edge) => edge.startNodeId === junction.id || edge.endNodeId === junction.id);
    expect(incidentEdges).toHaveLength(3);
    const sourceEdge = incidentEdges.find((edge) => edge.startNodeId === "nav-source" || edge.endNodeId === "nav-source")!;
    expect(sourceEdge.bendPoints ?? []).toEqual([]);
  });

  it("splits the exact hovered segment of a bent Walking Path", () => {
    const withBentPath = makeBaseCampus();
    withBentPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 160, y: 140, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Door", type: "hallway", x: 110, y: 140, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withBentPath.navEdges = [{
      id: "edge-bent", startNodeId: "nav-a", endNodeId: "nav-b", distance: 220,
      bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4,
      bendPoints: [{ x: 40, y: 100 }, { x: 160, y: 100 }],
    }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withBentPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container).find((node) => {
      const circle = node.querySelector("circle");
      return circle?.getAttribute("cx") === "110" && circle?.getAttribute("cy") === "140";
    });
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 110, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    fireEvent.mouseMove(pathHit!, { clientX: 110, clientY: 100, bubbles: true });
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const floorNodes = (latest.navNodes ?? []).filter((node) => node.floorId === "f1");
    const floorEdges = (latest.navEdges ?? []).filter((edge) => {
      const ids = new Set(floorNodes.map((node) => node.id));
      return ids.has(edge.startNodeId) && ids.has(edge.endNodeId);
    });
    const junction = floorNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    expect(junction?.x).toBe(110);
    expect(junction?.y).toBe(100);
    expect(floorEdges).toHaveLength(3);
    expect(floorEdges.some((edge) => edge.startNodeId === "nav-a" && edge.endNodeId === "nav-b")).toBe(false);
    const left = floorEdges.find((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("nav-a") && new Set([edge.startNodeId, edge.endNodeId]).has(junction!.id));
    const right = floorEdges.find((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("nav-b") && new Set([edge.startNodeId, edge.endNodeId]).has(junction!.id));
    expect(left?.bendPoints).toEqual([{ x: 40, y: 100 }]);
    expect(right?.bendPoints).toEqual([{ x: 160, y: 100 }]);
  });

  it("keeps a diagonal Connect junction on the exact projected segment", () => {
    const withDiagonalPath = makeBaseCampus();
    withDiagonalPath.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 40, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 140, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-source", name: "Source", type: "hallway", x: 110, y: 145, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withDiagonalPath.navEdges = [{ id: "edge-diagonal", startNodeId: "nav-a", endNodeId: "nav-b", distance: 172,
      bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDiagonalPath} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const source = navNodes(container)[2];
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 110, clientY: 145, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    // Deliberately click several pixels off the diagonal. The projected point,
    // not this raw pointer coordinate or an endpoint, is authoritative.
    fireEvent.mouseMove(pathHit!, { clientX: 110, clientY: 95, bubbles: true });
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 95, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const junction = latest.navNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    const dx = 180 - 40;
    const dy = 140 - 40;
    const cross = (junction!.x - 40) * dy - (junction!.y - 40) * dx;
    expect(Math.abs(cross)).toBeLessThan(0.0001);
    expect(junction!.x).not.toBe(180);
    expect(junction!.y).not.toBe(140);
  });

  it("starts Connect from a Door on a slanted Room boundary without the Room Door warning", () => {
    const withSlantedDoor = makeBaseCampus();
    withSlantedDoor.buildings[0].floors[0].rooms = [{
      id: "r-slanted",
      name: "Slanted Room",
      type: "classroom",
      x: 20,
      y: 60,
      w: 170,
      h: 80,
      shapePoints: [
        { x: 20, y: 100 },
        { x: 180, y: 60 },
        { x: 190, y: 140 },
        { x: 20, y: 140 },
      ],
      floorId: "f1",
      buildingId: "b1",
      accessDoorId: "d-slanted",
    }];
    withSlantedDoor.buildings[0].floors[0].walls = [{
      id: "w-slanted",
      x1: 20,
      y1: 100,
      x2: 180,
      y2: 60,
      thickness: 4,
      color: "#64748b",
    }];
    withSlantedDoor.buildings[0].floors[0].doors = [{
      id: "d-slanted",
      x: 100,
      y: 80,
      width: 18,
      direction: "left",
      color: "#b45309",
      wallId: "w-slanted",
      offset: 0.5,
    }];
    withSlantedDoor.navNodes = [
      {
        id: "node-slanted-door",
        name: "Slanted Door",
        type: "hallway",
        x: 100,
        y: 80,
        buildingId: "b1",
        floorId: "f1",
        doorId: "d-slanted",
        accessible: true,
        color: "#16a34a",
      },
      { id: "nav-a", name: "A", type: "hallway", x: 70, y: 55, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 130, y: 70, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withSlantedDoor.navEdges = [{
      id: "edge-diagonal",
      startNodeId: "nav-a",
      endNodeId: "nav-b",
      distance: 62,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      type: "hallway",
      color: "#16a34a",
      width: 4,
    }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withSlantedDoor} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: "Connect" }));
    const doorNode = container.querySelector('[data-testid="nav-linked-node"]');
    expect(doorNode).toBeTruthy();
    fireEvent.mouseDown(doorNode!, { clientX: 100, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByText("Use the Room Door")).toBeNull();
    expect(container.querySelectorAll('[data-testid="nav-linked-node"]')).toHaveLength(1);
    expect(navNodes(container)).toHaveLength(2);
    expect(navEdges(container)).toHaveLength(1);
    const diagonalPath = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(diagonalPath).toBeTruthy();
    fireEvent.mouseMove(diagonalPath!, { clientX: 100, clientY: 62.5, bubbles: true });
    fireEvent.mouseDown(diagonalPath!, { clientX: 100, clientY: 62.5, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByText("Use the Room Door")).toBeNull();
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const junction = latest.navNodes.find((node) => node.pathJunction);
    expect(junction).toBeTruthy();
    const diagonalCross = (junction!.x - 70) * (70 - 55) - (junction!.y - 55) * (130 - 70);
    expect(Math.abs(diagonalCross)).toBeLessThan(0.0001);
    expect(latest.navEdges).toHaveLength(3);
  });

  it("allows an isolated internal junction to be deleted after its paths are gone", () => {
    const withJunction = makeBaseCampus();
    withJunction.navNodes = [
      { id: "nav-junction", name: "Waypoint", type: "hallway", x: 110, y: 80, buildingId: "b1", floorId: "f1", pathJunction: true, accessible: true, color: "#d97706" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withJunction} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const junction = container.querySelector('[data-testid="nav-path-junction"]');
    expect(junction).toBeTruthy();
    fireEvent.mouseDown(junction!, { clientX: 110, clientY: 80, bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(container.querySelector('[data-testid="nav-path-junction"]')).toBeNull();
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    expect((latest.navNodes ?? []).some((node) => node.id === "nav-junction")).toBe(false);
  });

  it("reshapes a diagonal path segment with bends while keeping endpoints fixed", () => {
    const withDiagonal = makeBaseCampus();
    withDiagonal.navNodes = [
      { id: "nav-a", name: "A", type: "hallway", x: 40, y: 30, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "nav-b", name: "B", type: "hallway", x: 180, y: 120, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    withDiagonal.navEdges = [{ id: "edge-diagonal", startNodeId: "nav-a", endNodeId: "nav-b", distance: 166, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDiagonal} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);
    const pathHit = container.querySelector('[data-testid="nav-edge-hit"]');
    expect(pathHit).toBeTruthy();
    // First click selects the edge; the second begins the segment gesture.
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 75, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(pathHit!, { clientX: 110, clientY: 75, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const edited = container.querySelector('[data-testid="nav-edge-selected"]') as SVGPolylineElement | null;
    expect(edited).toBeTruthy();
    const points = (edited?.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(points.length).toBeGreaterThan(2);
    expect(points[0]).toEqual([40, 30]);
    expect(points[points.length - 1]).toEqual([180, 120]);
    for (let i = 1; i < points.length; i++) {
      expect(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1]).toBe(true);
    }
  });

  it("Connect Path empty-space clicks do nothing BEFORE a start; after a start they PIN bends (no waypoints)", () => {
    enterNavigationMode();
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    // B5 Phase 2.8: clicking empty floor BEFORE a start does NOT create a node.
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.mouseDown(svg, { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(0);
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    // Place a start waypoint, re-arm Connect, start at it.
    clickWalkingPointTool();
    clickCanvas(container, 30, 30);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Empty click → PIN a geometry bend: STILL one node, no edge yet.
    fireEvent.mouseDown(svg, { clientX: 140, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(1);
    expect(navEdges(container)).toHaveLength(0);
    // Place a destination node, re-arm Connect, start at node A, finish at node B.
    clickWalkingPointTool();
    clickCanvas(container, 150, 60);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // One more pinned bend on the way, then finish on the destination node.
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 150, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navNodes(container)).toHaveLength(2);
    expect(navEdges(container)).toHaveLength(1);
    // The committed connector is fully ORTHOGONAL (no diagonal segments).
    const edge = navEdges(container)[0];
    const pts = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    expect(pts.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1]).toBe(true);
    }
  });

  it("rejects a self-connection and a duplicate connection", () => {
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 40, 40);
    clickWalkingPointTool();
    clickCanvas(container, 120, 80);
    const svg = stubSvgRect(container);
    // Self-edge: connect A → A.
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(0);
    // Duplicate: A → B twice.
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
  });

  it("Escape cancels an incomplete connection without leaving an edge", () => {
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 40, 40);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // B5 Phase 2.7: the connect hint now advertises empty-space bend pinning.
    expect(screen.getByText(/Shift for H\/V/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(navEdges(container)).toHaveLength(0);
    expect(screen.queryByTestId("floor-nav-connect-preview")).toBeNull();
  });

  it("links a Room as a destination node and reuses it on repeat", () => {
    const withRoom = makeBaseCampus();
    withRoom.buildings[0].floors[0].rooms = [
      { id: "r1", name: "Lecture Hall", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // B5 Phase 2.3: linking goes through Link Location — the Add Waypoint tool
    // now blocks free placement on the room semantic target.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // inside room r1 (20-70, 20-60)
    expect(navLinkedNodes(container)).toHaveLength(1);
    // Reuse — no second node.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40);
    expect(navLinkedNodes(container)).toHaveLength(1);
    // B5 Phase 2.4: node data sits at the room ROUTING ANCHOR (deterministic
    // offset above the center) so edges terminate at the cue — never the label.
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    const roomNode = latest.navNodes.find((n) => n.roomId === "r1");
    expect(roomNode).toBeTruthy();
    expect(roomNode.x).toBe(45);
    expect(roomNode.y).toBe(30);
  });

  it("links a Door as a node and a Stairs node defaults to not accessible", () => {
    const withDoor = makeBaseCampus();
    withDoor.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    withDoor.buildings[0].floors[0].doors = [
      { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
    ];
    withDoor.buildings[0].floors[0].stairs = [
      { id: "st1", x: 150, y: 20, width: 20, height: 16, direction: "both", label: "Stairs" },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDoor} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // B5 Phase 2.3: linking goes through Link Location.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 90, 70); // on the door
    expect(navLinkedNodes(container)).toHaveLength(1);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 160, 28); // on the stairs
    expect(navLinkedNodes(container)).toHaveLength(2);
    // Stairs node must be not-accessible by default.
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    const stairNode = latest.navNodes.find((n: { stairId?: string }) => n.stairId === "st1");
    expect(stairNode).toBeTruthy();
    expect(stairNode.accessible).toBe(false);
  });

  it("rejects an edge crossing a wall unless it passes through a door opening", () => {
    const withWall = makeBaseCampus();
    withWall.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    cleanup();
    const rendered = render(<Harness initialCampus={withWall} />);
    container = rendered.container;
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 70, 30);
    clickWalkingPointTool();
    clickCanvas(container, 70, 120);
    expect(navNodes(container)).toHaveLength(2);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 70, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(0);
    // Now add a door at the crossing point → connection allowed.
    const withDoor = makeBaseCampus();
    withDoor.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    withDoor.buildings[0].floors[0].doors = [
      { id: "d1", x: 70, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.3 },
    ];
    cleanup();
    const rendered2 = render(<Harness initialCampus={withDoor} />);
    const container2 = rendered2.container;
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container2, 70, 30);
    clickWalkingPointTool();
    clickCanvas(container2, 70, 120);
    const svg2 = stubSvgRect(container2);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container2)[0], { clientX: 70, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg2, { bubbles: true });
    fireEvent.mouseDown(navNodes(container2)[1], { clientX: 70, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg2, { bubbles: true });
    expect(navEdges(container2)).toHaveLength(1);
  });

  it("moves free waypoints as a group; linked nodes stay derived and edges follow", () => {
    const withRoom = makeBaseCampus();
    withRoom.buildings[0].floors[0].rooms = [
      { id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" },
    ];
    cleanup();
    const rendered = render(<Harness initialCampus={withRoom} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // Two free waypoints + one room-linked node (via Link Location).
    clickWalkingPointTool();
    clickCanvas(container, 20, 130);
    clickWalkingPointTool();
    clickCanvas(container, 100, 130);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 45, 40); // room node at room center
    expect(navNodes(container)).toHaveLength(2);
    expect(navLinkedNodes(container)).toHaveLength(1);
    // Connect free A → free B, then drag A 30px right — B must NOT follow (only A selected).
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 20, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 100, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    // Drag node A by +40x. (x=60 is clear of the room-linked node's x=45 and
    // free node B's x=100 — the 8-unit alignment guide would otherwise snap it.)
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 20, clientY: 130, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const aCircle = nodeCircle(container, 0);
    expect(Number(aCircle.getAttribute("cx"))).toBe(60);
    // Edge follows the moved endpoint.
    const edge = navEdges(container)[0];
    expect(Number(edge.getAttribute("x1"))).toBe(60);
  });

  it("delete key removes a selected node and its connected edges; undo restores", () => {
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 40, 40);
    clickWalkingPointTool();
    clickCanvas(container, 120, 80);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(navEdges(container)).toHaveLength(1);
    // Select node A and Delete.
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(navNodes(container)).toHaveLength(1);
    expect(navEdges(container)).toHaveLength(0);
    // Undo restores node + edge.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(navNodes(container)).toHaveLength(2);
    expect(navEdges(container)).toHaveLength(1);
  });

  it("undo/redo works for waypoint creation", () => {
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 40, 40);
    expect(navNodes(container)).toHaveLength(1);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(navNodes(container)).toHaveLength(0);
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(navNodes(container)).toHaveLength(1);
  });

  it("duplicates the indoor graph when the Floor is duplicated (fresh ids, no back-references)", () => {
    enterNavigationMode();
    clickWalkingPointTool();
    clickCanvas(container, 40, 40);
    clickWalkingPointTool();
    clickCanvas(container, 120, 80);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(navNodes(container)[0], { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodes(container)[1], { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const before = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    expect(before.navNodes).toHaveLength(2);
    expect(before.navEdges).toHaveLength(1);
    // Duplicate the floor from the shared floor-actions menu.
    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Floor" }));
    const after = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    const copyFloorId = after.buildings[0].floors.find((f) => f.id !== "f1")!.id;
    const copyNodes = after.navNodes.filter((n) => n.floorId === copyFloorId);
    const copyEdges = after.navEdges.filter((e) =>
      copyNodes.some((n) => n.id === e.startNodeId) && copyNodes.some((n) => n.id === e.endNodeId)
    );
    expect(copyNodes).toHaveLength(2);
    expect(copyEdges).toHaveLength(1);
    // Fresh ids — no references back to the source floor.
    const originalIds = new Set(before.navNodes.map((n) => n.id));
    expect(copyNodes.every((n) => !originalIds.has(n.id))).toBe(true);
    expect(copyEdges[0].id).not.toBe(before.navEdges[0].id);
    expect(copyNodes.every((n) => n.floorId === copyFloorId && n.buildingId === "b1")).toBe(true);
  });

  it("prunes the linked node + edges when the physical Door is deleted in Design mode", () => {
    const withDoor = makeBaseCampus();
    withDoor.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
    ];
    withDoor.buildings[0].floors[0].doors = [
      { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
    ];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withDoor} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 90, 70);
    expect(navLinkedNodes(container)).toHaveLength(1);
    // Switch to Design, select the door and delete it with the keyboard.
    fireEvent.click(screen.getByRole("tab", { name: "Design" }));
    const door = Array.from(container.querySelectorAll('[data-testid="attached-door-opening-symbol"]'))[0] as SVGGElement | undefined;
    expect(door).toBeTruthy();
    fireEvent.mouseDown(door!, { clientX: 90, clientY: 70, bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    // Back in Navigation mode the door-linked node is pruned — no stale refs.
    fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
    expect(navLinkedNodes(container)).toHaveLength(0);
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    expect(latest.navNodes.every((n) => n.doorId !== "d1")).toBe(true);
  });

  it("keeps a nearby Door and waypoint draggable when a navigation edge overlaps them", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors[0].walls = [
      { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b" },
    ];
    campus.buildings[0].floors[0].doors = [
      { id: "d1", x: 90, y: 70, width: 18, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
    ];
    campus.navNodes = [
      { id: "a", name: "A", type: "hallway", x: 40, y: 70, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "b", name: "B", type: "hallway", x: 140, y: 70, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      { id: "near-door", name: "Waypoint", type: "hallway", x: 94, y: 74, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [{
      id: "edge-ab", startNodeId: "a", endNodeId: "b", distance: 100, bidirectional: true,
      accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 3,
    }];
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    fireEvent.click(screen.getByRole("button", { name: "Show Navigation" }));
    const svg = stubSvgRect(container);

    const nodeHit = Array.from(container.querySelectorAll('[data-testid="nav-node-hit"]'))
      .find((hit) => Number(hit.getAttribute("cx")) === 94) as SVGCircleElement;
    expect(nodeHit).toBeTruthy();
    fireEvent.mouseDown(nodeHit, { clientX: 94, clientY: 74, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 90, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 110, clientY: 90, bubbles: true });

    let latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    expect(latest.navNodes.find((node) => node.id === "near-door")).toMatchObject({ x: 110, y: 90 });
    expect(latest.buildings[0].floors[0].doors?.[0].x).toBe(90);

    const edgeHit = container.querySelector('[data-testid="nav-edge-hit"]') as SVGLineElement;
    expect(edgeHit).toBeTruthy();
    fireEvent.mouseDown(edgeHit, { clientX: 90, clientY: 70, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 110, clientY: 70, bubbles: true });

    latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1][0] as Campus;
    expect(latest.buildings[0].floors[0].doors?.[0].x).toBe(110);
    expect(latest.navNodes.map((node) => node.id)).toEqual(["a", "b", "near-door"]);
    expect(latest.navEdges.map((edge) => edge.id)).toEqual(["edge-ab"]);
    expect(latest.navEdges[0]).toMatchObject({ startNodeId: "a", endNodeId: "b" });
  });
});
