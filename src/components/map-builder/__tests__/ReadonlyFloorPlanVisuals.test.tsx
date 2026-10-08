import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FloorPlan } from "../types";
import { ReadonlyFloorPlanScene, readonlyFloorPlanViewport } from "../ReadonlyFloorPlanVisuals";
import { RouteMapOverlay } from "../../map/RouteMapOverlay";

const floor = {
  id: "floor-1",
  buildingId: "building-1",
  number: 1,
  label: "Ground Floor",
  canvasW: 440,
  canvasH: 290,
  rooms: [],
  paths: [],
  walls: [],
  doors: [],
  windows: [],
  furniture: [
    {
      id: "chair-1",
      type: "chair",
      assetKey: "chair",
      name: "Chair",
      category: "seating",
      x: 60,
      y: 70,
      width: 24,
      height: 24,
      rotation: 15,
      color: "#8b6f4e",
    },
    {
      id: "table-1",
      type: "table",
      assetKey: "table",
      name: "Table",
      category: "essentials",
      x: 110,
      y: 70,
      width: 50,
      height: 30,
      rotation: 0,
      color: "#8b6f4e",
    },
  ],
  stairs: [],
  ramps: [],
  elevators: [],
  labels: [],
  exteriorZones: [
    {
      id: "veranda-1",
      type: "veranda",
      side: "bottom",
      offset: 0.5,
      width: 160,
      depth: 48,
      label: "Veranda",
    },
  ],
  entranceSteps: [
    {
      id: "steps-1",
      x: 0,
      y: 0,
      width: 28,
      height: 18,
      label: "Entrance Steps",
      parentZoneId: "veranda-1",
      attachmentEdge: "outer",
      attachmentOffset: 0.5,
    },
  ],
  entranceRamps: [
    {
      id: "ramp-1",
      x: 0,
      y: 0,
      width: 32,
      height: 20,
      label: "Entrance Ramp",
      parentZoneId: "veranda-1",
      attachmentEdge: "outer",
      attachmentOffset: 0.78,
      layout: "straight",
    },
  ],
} as FloorPlan;

const compositeFurnitureFloor = {
  ...floor,
  furniture: [
    ...floor.furniture,
    {
      id: "study-table-1",
      type: "study-table-4",
      assetKey: "study-table-4",
      name: "Study Table",
      category: "essentials",
      x: 180,
      y: 70,
      width: 64,
      height: 34,
      rotation: 0,
      color: "#8b6f4e",
    },
    {
      id: "student-desk-chair-1",
      type: "student-desk-chair",
      assetKey: "student-desk-chair",
      name: "Student Desk Chair",
      category: "seating",
      x: 270,
      y: 70,
      width: 34,
      height: 34,
      rotation: 0,
      color: "#8b6f4e",
    },
  ],
} as FloorPlan;

const sharedVisualFloor = {
  ...floor,
  rooms: [{
    id: "lab-room", floorId: "floor-1", buildingId: "building-1", name: "Fluid Mechanics Laboratory",
    type: "lab", x: 30, y: 120, w: 180, h: 100, color: "#d9e7f5", rotation: 0,
    shapePoints: [{ x: 30, y: 120 }, { x: 210, y: 120 }, { x: 195, y: 220 }, { x: 30, y: 220 }],
  }],
  walls: [{ id: "wall-1", x1: 30, y1: 120, x2: 210, y2: 120, thickness: 6, color: "#334155", material: "brick" }],
  doors: [{ id: "door-1", x: 100, y: 120, width: 36, wallId: "wall-1", offset: 0.4, direction: "double", doorType: "double", hinge: "right", swingSide: "b", color: "#8b4513" }],
  windows: [{ id: "window-1", x: 170, y: 120, width: 42, height: 8, wallId: "wall-1", offset: 0.8, color: "#0284c7" }],
  stairs: [{ id: "stairs-1", x: 230, y: 120, width: 54, height: 76, direction: "both", label: "North Stair", rotation: 90 }],
  ramps: [{ id: "ramp-1", x: 300, y: 120, width: 50, height: 34, direction: "up", label: "Ramp", rotation: 15 }],
  elevators: [{ id: "elevator-1", x: 360, y: 120, width: 48, height: 48, doorWidth: 24, label: "Elevator" }],
  labels: [{ id: "label-1", x: 32, y: 260, text: "North Wing", color: "#334155", fontSize: 10, align: "left", rotation: 12 }],
  paths: [{ id: "floor-path-1", points: [{ x: 220, y: 240 }, { x: 300, y: 240 }], color: "#c2410c", width: 5 }],
} as unknown as FloorPlan;

describe("ReadonlyFloorPlanScene", () => {
  it("does not render the authored floor scene again for a camera-only parent update", () => {
    let floorIdReads = 0;
    const observedFloor = new Proxy(floor, {
      get(target, property, receiver) {
        if (property === "id") floorIdReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const view = render(<svg data-camera-zoom="1"><ReadonlyFloorPlanScene floor={observedFloor} /></svg>);
    const initialReads = floorIdReads;
    expect(initialReads).toBeGreaterThan(0);

    view.rerender(<svg data-camera-zoom="1.2"><ReadonlyFloorPlanScene floor={observedFloor} /></svg>);
    expect(floorIdReads).toBe(initialReads);
  });

  it("preserves Admin-authored chair and table dimensions and rotation", () => {
    render(<svg><ReadonlyFloorPlanScene floor={floor} /></svg>);

    const furniture = screen.getAllByTestId("readonly-furniture");
    const chair = furniture[0];
    expect(chair).toHaveAttribute("transform", "rotate(15, 72, 82)");
    const chairArtwork = chair.querySelector("svg");
    expect(chairArtwork).toHaveAttribute("width", "24");
    expect(chairArtwork).toHaveAttribute("height", "24");

    const tableArtwork = furniture[1].querySelector("svg");
    expect(tableArtwork).toHaveAttribute("width", "50");
    expect(tableArtwork).toHaveAttribute("height", "30");
  });

  it("uses the Admin composite symbols for published tables and desk chairs", () => {
    render(<svg><ReadonlyFloorPlanScene floor={compositeFurnitureFloor} /></svg>);

    expect(screen.getByTestId("study-table")).toBeInTheDocument();
    expect(screen.getByTestId("student-desk-surface")).toBeInTheDocument();
    expect(screen.getAllByTestId("furniture-seat").length).toBeGreaterThan(0);
  });

  it("uses the same shared Admin geometry for rooms, walls, openings, circulation, labels, and Floor Paths", () => {
    render(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} floorIndex={1} floorCount={3} /></svg>);

    expect(screen.getByTestId("room-custom-shape")).toHaveAttribute("fill", "#d9e7f5");
    expect(screen.getByTestId("room-label-overlay").textContent).toContain("Fluid Mechanics Laboratory");
    expect(screen.getByTestId("readonly-wall").querySelectorAll("line")).toHaveLength(2);
    expect(screen.getAllByTestId("readonly-door-leaf")).toHaveLength(2);
    expect(screen.getByTestId("readonly-window").querySelector("[data-testid='readonly-window-glazing']")).toBeInTheDocument();
    expect(screen.getByTestId("stairs-travel-path")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-ramp")).toHaveAttribute("transform", "rotate(15,325,137)");
    expect(screen.getByTestId("elevator-shaft")).toBeInTheDocument();
    expect(screen.getByTestId("floor-label-artwork")).toHaveAttribute("fill", "#334155");
    expect(screen.getByTestId("readonly-floor-path").querySelector("polyline")).toHaveAttribute("stroke", "#c2410c");
  });

  it("highlights a selected irregular room above neighboring fills while preserving map details", () => {
    const view = render(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} highlightedRoomId="lab-room" showLabels onRoomClick={() => undefined} /></svg>);

    const room = screen.getByTestId("readonly-room");
    const roomShape = screen.getByTestId("room-custom-shape");
    const selection = screen.getByTestId("readonly-room-selection");
    const halo = screen.getByTestId("readonly-room-selection-halo");
    const outline = screen.getByTestId("readonly-room-selection-outline");
    const trace = screen.getByTestId("readonly-room-selection-trace");
    const semanticLayers = Array.from(document.querySelectorAll("[data-semantic-layer]"));

    expect(room).toHaveAttribute("aria-pressed", "true");
    expect(selection).toHaveAttribute("data-room-id", "lab-room");
    expect(selection).toHaveAttribute("pointer-events", "none");
    expect(screen.queryByTestId("readonly-room-selection-tint")).not.toBeInTheDocument();
    expect(halo).toHaveAttribute("d", roomShape.getAttribute("d"));
    expect(halo).toHaveAttribute("stroke-opacity", "0.045");
    expect(halo).toHaveAttribute("stroke-width", "4");
    expect(outline).toHaveAttribute("d", roomShape.getAttribute("d"));
    expect(outline).toHaveAttribute("stroke-width", "2.5");
    expect(outline).toHaveAttribute("stroke", "#059669");
    expect(halo).toHaveClass("student-room-selection-halo");
    expect(trace).toHaveClass("student-room-selection-trace");
    expect(trace).toHaveAttribute("d", roomShape.getAttribute("d"));
    expect(trace).toHaveAttribute("pathLength", "1");
    expect(semanticLayers.map((layer) => layer.getAttribute("data-semantic-layer"))).toEqual(expect.arrayContaining(["room-fills", "room-selection", "furniture", "walls", "openings"]));
    const layerOrder = semanticLayers.map((layer) => layer.getAttribute("data-semantic-layer"));
    expect(layerOrder.indexOf("room-fills")).toBeLessThan(layerOrder.indexOf("room-selection"));
    expect(layerOrder.indexOf("room-selection")).toBeLessThan(layerOrder.indexOf("furniture"));
    expect(layerOrder.indexOf("room-selection")).toBeLessThan(layerOrder.indexOf("walls"));
    expect(layerOrder.indexOf("room-selection")).toBeLessThan(layerOrder.indexOf("openings"));
    expect(screen.getByTestId("readonly-door")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-wall")).toBeInTheDocument();
    expect(screen.getByTestId("room-label-overlay")).toHaveTextContent("Fluid Mechanics Laboratory");
    expect(screen.getByTestId("room-label-overlay")).toHaveAttribute("data-room-label-selected", "true");
    expect(screen.getByTestId("room-label-overlay").querySelector("rect")).toHaveAttribute("fill", "#0f2748");
    expect(screen.getByTestId("room-label-overlay").querySelector("rect")).toHaveAttribute("stroke", "#059669");
    expect(screen.getByTestId("room-label-overlay").querySelector("rect")).toHaveAttribute("stroke-width", "1");
    expect(screen.getByTestId("room-label-overlay").querySelector("text")).toHaveAttribute("fill", "#ffffff");
    expect(screen.queryByTestId("room-label-selected-accent")).not.toBeInTheDocument();

    view.rerender(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} hoveredRoomId="lab-room" showLabels onRoomClick={() => undefined} /></svg>);
    expect(screen.queryByTestId("readonly-room-selection")).not.toBeInTheDocument();
    expect(screen.getByTestId("readonly-room")).toHaveAttribute("data-room-hovered", "true");
    expect(screen.getByTestId("readonly-room")).toHaveAttribute("data-room-highlighted", "false");
    expect(screen.getByTestId("room-label-overlay")).not.toHaveAttribute("data-room-label-selected", "true");
  });

  it("keeps a non-navigable room visible but removes Student interaction and selection", () => {
    const onRoomClick = vi.fn();
    const onRoomHover = vi.fn();
    const { container } = render(<svg><ReadonlyFloorPlanScene
      floor={sharedVisualFloor}
      highlightedRoomId="lab-room"
      hoveredRoomId="lab-room"
      interactiveRoomIds={new Set()}
      onRoomClick={onRoomClick}
      onRoomHover={onRoomHover}
    /></svg>);

    const room = container.querySelector<SVGGElement>("[data-room-id='lab-room'][data-testid='readonly-room']");
    expect(room).toHaveAttribute("data-room-interactive", "false");
    expect(room).toHaveAttribute("data-room-hovered", "false");
    expect(room).toHaveAttribute("data-room-highlighted", "false");
    expect(room).toHaveStyle({ cursor: "default" });
    expect(room).not.toHaveAttribute("role", "button");
    expect(room).not.toHaveAttribute("tabindex");
    fireEvent.mouseEnter(room!);
    fireEvent.click(room!);
    expect(onRoomHover).not.toHaveBeenCalled();
    expect(onRoomClick).not.toHaveBeenCalled();
    expect(screen.queryByTestId("readonly-room-selection")).not.toBeInTheDocument();
    expect(screen.getByTestId("room-label-overlay")).toHaveTextContent("Fluid Mechanics Laboratory");
    expect(screen.getByTestId("room-label-overlay")).not.toHaveAttribute("data-room-label-selected", "true");
  });

  it("skips static floor-scene renders when its authored data and interactions are unchanged", () => {
    const component = ReadonlyFloorPlanScene as unknown as { type: (...args: unknown[]) => unknown };
    const sceneRender = vi.spyOn(component, "type");
    const props = { floor, showLabels: false };
    const tree = () => (
      <svg>
        <ReadonlyFloorPlanScene {...props} />
      </svg>
    );
    const view = render(tree());
    expect(sceneRender).toHaveBeenCalledTimes(1);

    view.rerender(tree());
    expect(sceneRender).toHaveBeenCalledTimes(1);
    sceneRender.mockRestore();
  });

  it("hides informational labels while retaining an active route destination label", () => {
    const { rerender } = render(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} showLabels={false} /></svg>);
    expect(screen.queryByTestId("room-label-overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("floor-label-artwork")).not.toBeInTheDocument();

    rerender(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} showLabels={false} highlightedRoomId="lab-room" /></svg>);
    expect(screen.getByTestId("room-label-overlay").textContent).toContain("Fluid Mechanics Laboratory");
    expect(screen.queryByTestId("floor-label-artwork")).not.toBeInTheDocument();
  });

  it("renders the published veranda and its authored entrance features", () => {
    render(<svg><ReadonlyFloorPlanScene floor={floor} /></svg>);

    const veranda = screen.getByTestId("readonly-exterior-zone");
    expect(veranda).toHaveAttribute("data-exterior-zone-id", "veranda-1");
    expect(veranda.querySelector("rect")).toHaveAttribute("x", "140");
    expect(veranda.querySelector("rect")).toHaveAttribute("y", "290");
    expect(screen.getByTestId("readonly-entrance-steps")).toHaveAttribute("data-edge", "bottom");
    expect(screen.getByTestId("readonly-entrance-ramp")).toHaveAttribute("data-edge", "bottom");
    expect(screen.getByTestId("readonly-entrance-steps-symbol")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-entrance-ramp-symbol")).toBeInTheDocument();
  });

  it("previews only routable Floor rooms as student map-pick targets", () => {
    render(<svg><ReadonlyFloorPlanScene
      floor={sharedVisualFloor}
      mapPickActive
      interactiveRoomIds={new Set(["lab-room"])}
      onRoomClick={vi.fn()}
    /></svg>);
    expect(screen.getByTestId("student-map-pick-room-target")).toHaveAttribute("data-room-id", "lab-room");
    expect(screen.queryByTestId("readonly-room-selection")).not.toBeInTheDocument();
  });

  it("keeps the student Exit to Campus arrow compact and reveals a detached label on focus", () => {
    const studentFloor = {
      ...floor,
      doors: [{ id: "exit-door", x: 210, y: 18, width: 18, color: "#8b6f4e", direction: "left" as const, buildingEntranceId: "west" }],
    } as FloorPlan;
    const onDoorClick = vi.fn();
    render(<svg><ReadonlyFloorPlanScene
      floor={studentFloor}
      entrances={[{ id: "west", buildingId: "building-1", edge: "top", offset: 0.5 }]}
      interactiveExitDoorIds={new Set(["exit-door"])}
      compactExitActions
      onDoorClick={onDoorClick}
    /></svg>);

    const exit = screen.getByTestId("readonly-door");
    const marker = screen.getByTestId("student-exit-campus-arrow");
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveAttribute("data-screen-space", "true");
    expect(marker.querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("r", "7.5");
    expect(marker.querySelector('.student-transition-marker-lod')).toBeInTheDocument();
    expect(marker.querySelectorAll("[data-transition-arrow]")).toHaveLength(2);
    expect(marker.querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(marker.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(marker.querySelector('[data-transition-arrow="entrance"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(screen.queryByTestId("student-exit-campus-marker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-enter-building-marker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-exit-campus-tooltip")).not.toBeInTheDocument();
    fireEvent.focus(exit);
    expect(screen.queryByTestId("student-exit-campus-tooltip")).not.toBeInTheDocument();
    expect(marker.querySelector('[data-transition-arrow="exit"]')).toHaveAttribute("data-transition-emphasis", "pressable");
    expect(screen.getByTestId("readonly-exit-door-hit-target")).toHaveAttribute("height", "48");
    expect(marker.querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("r", "7.5");
    fireEvent.blur(exit);
    expect(screen.queryByTestId("student-exit-campus-tooltip")).not.toBeInTheDocument();
    fireEvent.click(exit);
    expect(onDoorClick).toHaveBeenCalledWith("exit-door");
  });

  it("does not rerender Floor artwork when only the parent camera transform changes", () => {
    const component = ReadonlyFloorPlanScene as unknown as { type: (...args: unknown[]) => unknown };
    const sceneRender = vi.spyOn(component, "type");
    const routeLayer = <RouteMapOverlay points={[{ x: 24, y: 24 }, { x: 120, y: 24 }]} mode="standard" animated={false} layer="line" />;
    const view = (transform: string) => <svg><g transform={transform}>
      <ReadonlyFloorPlanScene floor={floor} routeOverlay={routeLayer} />
    </g></svg>;
    const { rerender } = render(view("translate(0,0) scale(1)"));
    expect(sceneRender).toHaveBeenCalledTimes(1);

    rerender(view("translate(-120,40) scale(2.5)"));
    expect(sceneRender).toHaveBeenCalledTimes(1);
    sceneRender.mockRestore();
  });

  it("places the route stroke above Floor artwork and below the Exit to Campus marker", () => {
    const studentFloor = {
      ...sharedVisualFloor,
      doors: [{ ...sharedVisualFloor.doors![0], id: "exit-door", buildingEntranceId: "west" }],
    } as FloorPlan;
    const { container } = render(<svg>
      <ReadonlyFloorPlanScene
        floor={studentFloor}
        entrances={[{ id: "west", buildingId: "building-1", edge: "top", offset: 0.5 }]}
        interactiveExitDoorIds={new Set(["exit-door"])}
        compactExitActions
        onDoorClick={vi.fn()}
        routeOverlay={<RouteMapOverlay points={[{ x: 24, y: 160 }, { x: 100, y: 160 }, { x: 170, y: 160 }]} mode="accessible" animated={false} layer="line" />}
      />
    </svg>);
    const walls = container.querySelector('[data-semantic-layer="walls"]')!;
    const route = container.querySelector('[data-route-group][data-route-layer="line"]')!;
    const marker = screen.getByTestId("student-exit-campus-arrow");
    expect(route.querySelector('polyline[stroke="#16a34a"]')).toHaveAttribute("points", "24,160 100,160 170,160");
    expect(Boolean(walls.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(route.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("emphasizes the active Exit arrow and keeps a static ring for reduced motion", () => {
    const studentFloor = {
      ...floor,
      doors: [{ id: "exit-door", x: 210, y: 18, width: 18, color: "#8b6f4e", buildingEntranceId: "west" }],
    } as FloorPlan;
    const { container, rerender } = render(<svg><ReadonlyFloorPlanScene
      floor={studentFloor}
      entrances={[{ id: "west", buildingId: "building-1", edge: "top", offset: 0.5 }]}
      interactiveExitDoorIds={new Set(["exit-door"])}
      routeRelevantExitDoorIds={new Set(["exit-door"])}
      activeExitDoorId="exit-door"
      compactExitActions
      onDoorClick={() => undefined}
    /></svg>);
    const arrow = screen.getByTestId("student-exit-campus-arrow");
    expect(arrow).toHaveAttribute("data-active-transition", "true");
    expect(arrow.querySelector('[data-transition-arrow="exit"]')).toHaveAttribute("data-transition-emphasis", "active");
    expect(arrow.querySelector('[data-transition-arrow="entrance"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(arrow.querySelector('[data-testid="entrance-direction-exit-emphasis"] animate')).toBeInTheDocument();
    expect(arrow.querySelector('[data-testid="entrance-direction-entrance-emphasis"]')).toBeNull();
    expect(screen.queryByTestId("student-exit-campus-tooltip")).not.toBeInTheDocument();

    rerender(<svg><ReadonlyFloorPlanScene
      floor={studentFloor}
      entrances={[{ id: "west", buildingId: "building-1", edge: "top", offset: 0.5 }]}
      interactiveExitDoorIds={new Set(["exit-door"])}
      routeRelevantExitDoorIds={new Set(["exit-door"])}
      activeExitDoorId="exit-door"
      compactExitActions
      reducedMotion
      onDoorClick={() => undefined}
    /></svg>);
    expect(container.querySelector('[data-testid="entrance-direction-exit-emphasis"] animate')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="entrance-direction-exit-emphasis"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="entrance-direction-active-ring"]')).toBeInTheDocument();
  });

  it("expands the floor viewBox only enough to keep exterior content visible", () => {
    const viewport = readonlyFloorPlanViewport(floor);
    expect(viewport.offsetX).toBe(0);
    expect(viewport.offsetY).toBe(0);
    expect(viewport.width).toBe(440);
    expect(viewport.height).toBe(366);

    const indoorOnly = readonlyFloorPlanViewport({ ...floor, exteriorZones: [], entranceSteps: [], entranceRamps: [] });
    expect(indoorOnly).toEqual({ width: 440, height: 290, offsetX: 0, offsetY: 0 });
  });

  it("places generated emergency stairs outside the floor like the Admin module and includes them in the viewBox", () => {
    const exteriorStair = {
      id: "stair-landing-1",
      x: 412,
      y: 124,
      width: 28,
      height: 42,
      direction: "both" as const,
      label: "Exterior Stair",
      attachment: { edge: "right" as const, offset: 0.5 },
      exteriorEmergencyStairId: "stair-owner-1",
    };
    const owner = {
      id: "stair-owner-1",
      visualSize: "medium" as const,
      width: 28,
      height: 42,
      attachment: { edge: "right" as const, offset: 0.5 },
    };
    const exteriorFloor = { ...floor, stairs: [exteriorStair] } as FloorPlan;
    const viewport = readonlyFloorPlanViewport(exteriorFloor, [owner] as never);
    expect(viewport.width).toBeGreaterThan(440);

    render(<svg><ReadonlyFloorPlanScene floor={exteriorFloor} exteriorEmergencyStairs={[owner] as never} /></svg>);
    const module = screen.getByTestId("floor-exterior-emergency-module");
    const stairBody = module.querySelector('[data-testid="exterior-emergency-stair-floor-symbol"] rect:nth-of-type(2)');
    expect(module).toHaveAttribute("data-edge", "right");
    expect(Number(stairBody?.getAttribute("x"))).toBeGreaterThan(440);
    expect(screen.getByTestId("exterior-emergency-exit-badge")).toBeInTheDocument();
    expect(module.textContent).toContain("STAIR EXIT");
    expect(screen.queryByTestId("floor-exterior-emergency-hit-target")).not.toBeInTheDocument();
  });
});
