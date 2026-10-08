import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CampusEditor } from "../CampusEditor";
import { TestRouteSessionProvider, useTestRouteSessionActions } from "../TestNavigationPanel";
import type { Campus } from "../types";

const renderCounts = vi.hoisted(() => ({
  building: 0,
  junction: 0,
  emergencyStair: 0,
  floorRoom: 0,
  floorWall: 0,
  furniture: 0,
}));

vi.mock("../../../lib/pathfinding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/pathfinding")>();
  return {
    ...actual,
    prepareNavigationGraph: vi.fn(actual.prepareNavigationGraph),
  };
});

vi.mock("../OutdoorPathNetworkVisuals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../OutdoorPathNetworkVisuals")>();
  const React = await import("react");
  const instrument = (component: any, key: "junction") => {
    const isMemo = typeof component === "object" && component?.$$typeof === Symbol.for("react.memo");
    const renderCounted = (props: any) => {
      renderCounts[key] += 1;
      return React.createElement(component, props);
    };
    return isMemo ? React.memo(renderCounted) : renderCounted;
  };
  return { ...actual, OutdoorPathJunctionArtwork: instrument(actual.OutdoorPathJunctionArtwork, "junction") };
});

vi.mock("../ReadonlyOutdoorVisuals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ReadonlyOutdoorVisuals")>();
  const React = await import("react");
  const component: any = actual.OutdoorBuildingVisual;
  const isMemo = typeof component === "object" && component?.$$typeof === Symbol.for("react.memo");
  const stairComponent: any = actual.OutdoorEmergencyStairVisual;
  const stairIsMemo = typeof stairComponent === "object" && stairComponent?.$$typeof === Symbol.for("react.memo");
  const BuildingVisual = (props: any) => {
    renderCounts.building += 1;
    return React.createElement(component, props);
  };
  const StairVisual = (props: any) => {
    renderCounts.emergencyStair += 1;
    return React.createElement(stairComponent, props);
  };
  return {
    ...actual,
    OutdoorBuildingVisual: isMemo ? React.memo(BuildingVisual) : BuildingVisual,
    OutdoorEmergencyStairVisual: stairIsMemo ? React.memo(StairVisual) : StairVisual,
  };
});

vi.mock("../FloorMapVisuals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../FloorMapVisuals")>();
  const React = await import("react");
  const instrument = (component: any, key: "floorRoom" | "floorWall") => {
    const isMemo = typeof component === "object" && component?.$$typeof === Symbol.for("react.memo");
    const renderCounted = (props: any) => {
      renderCounts[key] += 1;
      return React.createElement(component, props);
    };
    return isMemo ? React.memo(renderCounted) : renderCounted;
  };
  return {
    ...actual,
    FloorRoomArtwork: instrument(actual.FloorRoomArtwork, "floorRoom"),
    FloorWallArtwork: instrument(actual.FloorWallArtwork, "floorWall"),
  };
});

vi.mock("../FloorFurnitureSymbol", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../FloorFurnitureSymbol")>();
  const React = await import("react");
  const component: any = actual.FloorFurnitureSymbol;
  const isMemo = typeof component === "object" && component?.$$typeof === Symbol.for("react.memo");
  const renderCounted = (props: any) => {
    renderCounts.furniture += 1;
    return React.createElement(component, props);
  };
  return { ...actual, FloorFurnitureSymbol: isMemo ? React.memo(renderCounted) : renderCounted };
});

import { prepareNavigationGraph } from "../../../lib/pathfinding";
import { FloorEditor } from "../FloorEditor";

function makeTestCampus(): Campus {
  return {
  id: "test-route-render-campus",
  name: "Test Route Render Campus",
  code: "TR",
  description: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  status: "active",
  publishStatus: "draft",
  visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  canvasW: 900,
  canvasH: 680,
  settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  buildings: [{
    id: "render-building",
    name: "Render Building",
    code: "RB",
    category: "Academic",
    description: "",
    x: 100,
    y: 100,
    width: 140,
    height: 90,
    color: "#1e40af",
    floors: [],
    entrances: [],
    exteriorEmergencyStairs: [{
      id: "render-stair",
      buildingId: "render-building",
      label: "Emergency Stair",
      state: "open",
      width: 30,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: [],
      sharedId: "render-stair-shared",
    }],
  }],
  markers: [],
  paths: [
    { id: "render-walkway", points: [{ x: 200, y: 300 }, { x: 400, y: 300 }], type: "walkway", color: "#64748b", width: 12 },
    { id: "render-road", points: [{ x: 300, y: 200 }, { x: 300, y: 400 }], type: "road", color: "#334155", width: 18 },
  ],
  navNodes: [],
  navEdges: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  };
}

const testCampus = makeTestCampus();

function NavigationModeControl() {
  const { setNavigationEnabled } = useTestRouteSessionActions();
  return <button type="button" onClick={() => setNavigationEnabled((enabled) => !enabled)}>Toggle Navigation Mode</button>;
}

describe("Test Route render isolation", () => {
  afterEach(() => cleanup());

  it("shares route graph preparation across responsive panels and keeps authored Campus artwork stable during panel-only updates", () => {
    renderCounts.building = 0;
    renderCounts.junction = 0;
    renderCounts.emergencyStair = 0;
    vi.mocked(prepareNavigationGraph).mockClear();

    render(
      <TestRouteSessionProvider>
        <NavigationModeControl />
        <CampusEditor
          campus={testCampus}
          onBack={() => {}}
          onUpdate={() => {}}
          onPublish={() => {}}
          onOpenFloor={() => {}}
          onAddBuilding={() => {}}
        />
      </TestRouteSessionProvider>,
    );

    const initialArtworkCounts = { ...renderCounts };
    fireEvent.click(screen.getByRole("button", { name: "Test Route" }));

    // The open transition enables only the navigation overlay. Memoized physical
    // artwork with unchanged authored props must not recompute as a side effect.
    expect(renderCounts.building).toBe(initialArtworkCounts.building);
    expect(renderCounts.junction).toBe(initialArtworkCounts.junction);
    expect(renderCounts.emergencyStair).toBe(initialArtworkCounts.emergencyStair);

    // Desktop and mobile variants share one Campus-scoped prepared graph.
    expect(vi.mocked(prepareNavigationGraph)).toHaveBeenCalledTimes(1);

    const desktopPanel = screen.getAllByTestId("test-route-full")[0]!;
    const startSearch = within(desktopPanel).getAllByPlaceholderText("Search/select location…")[0]!;
    fireEvent.change(startSearch, { target: { value: "Render Building" } });
    fireEvent.click(desktopPanel.querySelector<HTMLElement>("[data-picker-option]")!);
    const destinationSearch = within(desktopPanel).getByPlaceholderText("Search/select location…");
    fireEvent.change(destinationSearch, { target: { value: "Render Building" } });
    fireEvent.click(desktopPanel.querySelector<HTMLElement>("[data-picker-option]")!);
    expect(vi.mocked(prepareNavigationGraph)).toHaveBeenCalledTimes(1);
    expect(renderCounts).toEqual(initialArtworkCounts);

    fireEvent.click(screen.getByRole("button", { name: "Toggle Navigation Mode" }));
    expect(vi.mocked(prepareNavigationGraph)).toHaveBeenCalledTimes(1);
    expect(renderCounts).toEqual(initialArtworkCounts);

    // Store/UI-only updates rerender subscribed route panels but do not prepare
    // another graph or repaint the authored map scene.
    fireEvent.click(screen.getAllByRole("button", { name: "Collapse Test Route" })[0]);
    expect(vi.mocked(prepareNavigationGraph)).toHaveBeenCalledTimes(1);
    expect(renderCounts).toEqual(initialArtworkCounts);
  });

  it("keeps Floor room, wall, and furniture artwork stable while opening Test Route", () => {
    const campus = makeTestCampus();
    campus.id = "test-route-render-floor-campus";
    campus.buildings[0]!.floors = [{
      id: "render-floor",
      buildingId: "render-building",
      number: 1,
      label: "Ground Floor",
      rooms: [{ id: "render-room", name: "Room", type: "classroom", x: 30, y: 30, w: 100, h: 80, buildingId: "render-building", floorId: "render-floor" }],
      walls: [{ id: "render-wall", x1: 20, y1: 20, x2: 180, y2: 20, thickness: 5, color: "#334155", material: "concrete" }],
      doors: [],
      windows: [],
      furniture: [{ id: "render-desk", type: "desk", name: "Desk", category: "tables", x: 80, y: 70, width: 36, height: 24, rotation: 0, color: "#a16207" }],
      stairs: [],
      ramps: [],
      elevators: [],
      labels: [],
      paths: [],
    }];
    renderCounts.floorRoom = 0;
    renderCounts.floorWall = 0;
    renderCounts.furniture = 0;
    vi.mocked(prepareNavigationGraph).mockClear();

    render(
      <TestRouteSessionProvider>
        <FloorEditor
          campus={campus}
          buildingId="render-building"
          floorId="render-floor"
          onBack={() => {}}
          onSwitchFloor={() => {}}
          onUpdate={() => {}}
        />
      </TestRouteSessionProvider>,
    );
    const initialArtworkCounts = { ...renderCounts };

    fireEvent.click(screen.getByRole("button", { name: "Test Route" }));
    expect(renderCounts.floorRoom).toBe(initialArtworkCounts.floorRoom);
    expect(renderCounts.floorWall).toBe(initialArtworkCounts.floorWall);
    expect(renderCounts.furniture).toBe(initialArtworkCounts.furniture);
    expect(vi.mocked(prepareNavigationGraph)).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Collapse Test Route" })[0]);
    expect(vi.mocked(prepareNavigationGraph)).toHaveBeenCalledTimes(1);
    expect(renderCounts.floorRoom).toBe(initialArtworkCounts.floorRoom);
    expect(renderCounts.floorWall).toBe(initialArtworkCounts.floorWall);
    expect(renderCounts.furniture).toBe(initialArtworkCounts.furniture);
  });
});
