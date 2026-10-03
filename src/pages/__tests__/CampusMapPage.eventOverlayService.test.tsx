import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { ComponentProps } from "react";
import { CampusMapPage } from "../CampusMapPage";
import { eventOverlayService } from "../../services/eventOverlayService";
import type { Campus as EditorCampus } from "../../components/map-builder/types";

const previewCampus: EditorCampus = {
  id: "campus-test",
  name: "PLV Main Campus",
  code: "MAIN",
  description: "Test campus",
  address: "Maysan Road",
  city: "Valenzuela",
  province: "Metro Manila",
  postalCode: "1442",
  status: "active",
  publishStatus: "published",
  visibleToStudents: true,
  features: {
    indoorNavigation: true,
    accessibilityNavigation: true,
    emergencyRoutes: true,
    issueReporting: true,
  },
  canvasW: 900,
  canvasH: 680,
  canvasConfigured: true,
  settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  buildings: [
    {
      id: "building-test",
      name: "Science Hall",
      code: "SCI",
      category: "academic",
      description: "",
      x: 120,
      y: 120,
      width: 160,
      height: 100,
      color: "#1d4ed8",
      floors: [],
    },
  ],
  markers: [],
  paths: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  publishedAt: "2026-01-02",
};

const settingsMocks = vi.hoisted(() => ({ getPublicPlatformSettings: vi.fn() }));

vi.mock("../../services/eventOverlayService", () => ({
  eventOverlayService: {
    getApprovedOverlaysForCampus: vi.fn().mockResolvedValue([]),
    getApprovedOverlaysForFloor: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../services/usageAnalyticsService", () => ({
  usageAnalyticsService: { track: vi.fn() },
}));

vi.mock("../../services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/settingsService")>();
  return {
    ...actual,
    settingsService: { ...actual.settingsService, getPublicPlatformSettings: settingsMocks.getPublicPlatformSettings },
  };
});

describe("CampusMapPage event overlays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMocks.getPublicPlatformSettings.mockResolvedValue({
      defaultCampusId: "",
      defaultLandingPage: "home",
      rememberLastCampus: true,
      showApprovedEventOverlays: true,
      defaultRouteMode: "standard",
      animatedRouteArrows: true,
      autoFocusRoute: true,
      autoFollowFloors: true,
      showMapLabels: true,
    });
  });

  const renderCampusMap = (props: ComponentProps<typeof CampusMapPage> = {}) =>
    render(
      <MemoryRouter>
        <CampusMapPage {...props} />
      </MemoryRouter>,
    );

  it("loads approved campus overlays without throwing a missing service reference", async () => {
    renderCampusMap({ previewCampus });
    await waitFor(() => expect(eventOverlayService.getApprovedOverlaysForCampus).toHaveBeenCalled());
  });

  it("uses the platform overlay setting in Student Preview", async () => {
    settingsMocks.getPublicPlatformSettings.mockResolvedValueOnce({
      defaultCampusId: "", defaultLandingPage: "home", rememberLastCampus: true,
      showApprovedEventOverlays: false, defaultRouteMode: "standard", animatedRouteArrows: true,
      autoFocusRoute: true, autoFollowFloors: true, showMapLabels: true,
    });
    renderCampusMap({ previewCampus });
    await waitFor(() => expect(settingsMocks.getPublicPlatformSettings).toHaveBeenCalled());
    expect(eventOverlayService.getApprovedOverlaysForCampus).not.toHaveBeenCalled();
  });

  it("uses the platform label setting in Student Preview", async () => {
    settingsMocks.getPublicPlatformSettings.mockResolvedValueOnce({
      defaultCampusId: "", defaultLandingPage: "home", rememberLastCampus: true,
      showApprovedEventOverlays: true, defaultRouteMode: "standard", animatedRouteArrows: true,
      autoFocusRoute: true, autoFollowFloors: true, showMapLabels: false,
    });
    renderCampusMap({ previewCampus });
    await waitFor(() => expect(settingsMocks.getPublicPlatformSettings).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("building-label-group")).not.toBeInTheDocument());
  });

  it("preselects the saved accessible mode when Student directions open", async () => {
    settingsMocks.getPublicPlatformSettings.mockResolvedValueOnce({
      defaultCampusId: "", defaultLandingPage: "home", rememberLastCampus: true,
      showApprovedEventOverlays: true, defaultRouteMode: "accessible", animatedRouteArrows: false,
      autoFocusRoute: false, autoFollowFloors: false, showMapLabels: true,
    });
    renderCampusMap({ previewCampus });
    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    expect(await screen.findByRole("button", { name: "Accessible routing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Standard routing" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps accessible and emergency mode guidance inside the route planner", async () => {
    renderCampusMap({ previewCampus });
    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));

    fireEvent.click(await screen.findByRole("button", { name: "Accessible routing" }));
    expect(screen.getByTestId("accessible-route-note")).toHaveTextContent(/ramps.*elevators/i);
    expect(screen.queryByText("Accessible Route")).not.toBeInTheDocument();
    expect(screen.queryByText("Emergency Mode")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "SOS routing" }));
    expect(screen.queryByText("Accessible Route")).not.toBeInTheDocument();
    expect(screen.queryByText("Emergency Mode")).not.toBeInTheDocument();
  });

  it("shows the key building actions and floor-plan shortcut in the first mobile sheet snap", async () => {
    const campus: EditorCampus = {
      ...previewCampus,
      buildings: [{
        ...previewCampus.buildings[0],
        floors: [{
          id: "science-floor",
          buildingId: "building-test",
          number: 1,
          label: "Ground Floor",
          rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
        }],
      }],
    };
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));

    const sheet = await screen.findByTestId("mobile-building-sheet");
    const sheetActions = within(sheet);
    expect(sheet).toHaveStyle({ height: "58dvh" });
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("data-selected", "true");
    expect(screen.queryByTestId("student-map-zoom-controls")).not.toBeInTheDocument();
    expect(sheetActions.getByRole("button", { name: /Directions/i })).toBeVisible();
    const floorPlanActions = sheetActions.getAllByRole("button", { name: /Floor Plan/i });
    expect(floorPlanActions).toHaveLength(2);
    floorPlanActions.forEach((button) => expect(button).toBeVisible());
    expect(sheetActions.getByRole("button", { name: /Save/i })).toBeVisible();
    expect(sheetActions.getByRole("button", { name: /Report/i })).toBeVisible();
    expect(sheetActions.getByRole("button", { name: /View Floor Plan/i })).toBeVisible();
  });

  it("exposes the responsive student map landmarks and controls", async () => {
    renderCampusMap({ previewCampus });

    await waitFor(() => {
      expect(screen.getByTestId("student-map-surface")).toHaveAttribute(
        "aria-label",
        "Interactive campus map",
      );
      expect(screen.getByTestId("student-map-controls")).toBeInTheDocument();
      expect(screen.queryByTestId("student-map-quick-filters")).not.toBeInTheDocument();
      expect(screen.getByRole("searchbox", { name: "Search campus map" })).toHaveAttribute(
        "placeholder",
        "Search buildings, offices, and rooms",
      );
    });
  });

  it("starts a fresh room-directions planner in the configured mode, not a previous SOS mode", async () => {
    const campus: EditorCampus = { ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [{
      id: "route-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
      rooms: [{ id: "copyshop-room", name: "Copyshop", type: "classroom", floorId: "route-floor", buildingId: "building-test", x: 10, y: 10, w: 60, h: 60 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }] }] };
    renderCampusMap({ previewCampus: campus });

    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    fireEvent.click(screen.getByRole("button", { name: "SOS routing" }));
    expect(screen.getByRole("button", { name: "SOS routing" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close directions" }));
    await waitFor(() => expect(screen.queryByTestId("route-planner-dialog")).not.toBeInTheDocument());

    const search = screen.getByRole("searchbox", { name: "Search campus map" });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Science Hall" } });
    fireEvent.click(await screen.findByRole("option", { name: /Science Hall, Building/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /View Floor Plan/i })[0]);
    fireEvent.click(await screen.findByTestId("readonly-room"));
    fireEvent.click(screen.getByRole("button", { name: "Get directions to Copyshop" }));

    expect(screen.getByRole("button", { name: "Standard routing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "SOS routing" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens a building selected by a scanned QR deep link after the campus loads", async () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, "", "/map?buildingId=building-test");
    try {
      renderCampusMap({ previewCampus });
      fireEvent.click(await screen.findByRole("button", { name: /QR Code/i }));
      expect(screen.getByLabelText("QR code for Science Hall")).toBeInTheDocument();
      expect(screen.getAllByText("Science Hall").length).toBeGreaterThan(1);
      expect(window.location.search).toBe("");
    } finally {
      window.history.replaceState({}, "", originalUrl);
    }
  });

  it("keeps manual drop-pin navigation available on the student map", async () => {
    renderCampusMap({ previewCampus });

    await screen.findByRole("searchbox", { name: "Search campus map" });
    const dropPin = screen.getByRole("button", { name: "Drop pin" });
    expect(dropPin).toBeInTheDocument();
    fireEvent.click(dropPin);
    expect(screen.getByRole("button", { name: "Cancel drop pin" })).toBeInTheDocument();
    expect(screen.getByText("Tap map to drop pin")).toBeInTheDocument();
  });

  it("lets users report an interacted indoor room with its floor prefilled", async () => {
    const campus: EditorCampus = { ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [{
      id: "report-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
      rooms: [{ id: "report-room", name: "Copy Shop", type: "classroom", floorId: "report-floor", buildingId: "building-test", x: 10, y: 10, w: 60, h: 60 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }] }] };
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Floor Plan/ })[0]);
    fireEvent.click(await screen.findByTestId("readonly-room"));
    fireEvent.click(await screen.findByRole("button", { name: "More place actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Report a room issue" }));
    expect(screen.getByRole("dialog", { name: "Report issue" })).toBeInTheDocument();
    expect(screen.getByLabelText("Floor (optional)")).toHaveValue("report-floor");
    expect(screen.getByLabelText("Room (optional)")).toHaveValue("report-room");
  });

  it("opens and zooms to a searched room, then returns to the campus for a building result", async () => {
    const campus: EditorCampus = { ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [{
      id: "search-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
      rooms: [{ id: "search-room", name: "Copy Shop", type: "classroom", floorId: "search-floor", buildingId: "building-test", x: 15, y: 20, w: 60, h: 40 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }] }] };
    renderCampusMap({ previewCampus: campus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Copy Shop" } });
    fireEvent.click(await screen.findByRole("option", { name: /Copy Shop, Room/i }));
    expect(await screen.findByTestId("readonly-room")).toBeInTheDocument();
    expect(screen.queryByTestId("student-map-zoom-percentage")).not.toBeInTheDocument();

    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Science Hall" } });
    fireEvent.click(await screen.findByRole("option", { name: /Science Hall, Building/i }));
    await waitFor(() => expect(screen.queryByTestId("readonly-room")).not.toBeInTheDocument());
    expect(screen.getByTestId("mobile-building-sheet")).toBeInTheDocument();
  });

  it("exposes every published floor through the compact picker using authored labels", async () => {
    const floors = [
      { id: "ground", number: 1, label: "Ground Floor" },
      { id: "second", number: 3, label: "Floor 2" },
      { id: "third", number: 4, label: "Floor 3" },
      { id: "fourth", number: 5, label: "Floor 4" },
    ].map((floor) => ({
      ...floor, buildingId: "building-test",
      rooms: [{ id: `room-${floor.id}`, name: `${floor.label} Room`, type: "classroom", floorId: floor.id, buildingId: "building-test", x: 10, y: 10, w: 60, h: 40 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }));
    const campus: EditorCampus = { ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors }] };
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /View Floor Plan/i })[0]);
    await waitFor(() => expect(screen.queryByRole("button", { name: /View Floor Plan/i })).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole("button", { name: "Choose floor. Current floor: Ground Floor" }));
    const floorsList = screen.getByRole("listbox", { name: "Floors in Science Hall" });
    expect(within(floorsList).getAllByRole("option")).toHaveLength(4);
    expect(within(floorsList).getByRole("option", { name: /Floor 2/ })).toBeInTheDocument();
    expect(within(floorsList).getByRole("option", { name: /Floor 3/ })).toBeInTheDocument();
    expect(within(floorsList).getByRole("option", { name: /Floor 4/ })).toBeInTheDocument();
    fireEvent.click(within(floorsList).getByRole("option", { name: /Floor 3/ }));
    expect(await screen.findByRole("button", { name: "Choose floor. Current floor: Floor 3" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("readonly-room")).toHaveAttribute("data-room-id", "room-third");
  });

  it("hides the visible zoom controls and percentage indicator", async () => {
    renderCampusMap({ previewCampus });
    await screen.findByTestId("student-map-surface");
    expect(screen.queryByTestId("student-map-zoom-controls")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-map-zoom-percentage")).not.toBeInTheDocument();
  });

  it("does not zoom the map when scrolling its search controls", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    const surface = screen.getByTestId("student-map-surface");
    const camera = surface.querySelector("svg > g[transform]");
    const before = camera?.getAttribute("transform");
    fireEvent.wheel(search, { deltaY: -1000 });
    expect(camera).toHaveAttribute("transform", before);
    fireEvent.wheel(surface, { deltaY: -1000 });
    await waitFor(() => expect(camera).not.toHaveAttribute("transform", before));
    const zoomed = camera?.getAttribute("transform");
    fireEvent.wheel(surface, { deltaY: 10000 });
    await waitFor(() => expect(camera).not.toHaveAttribute("transform", zoomed));
  });

  it("renders intermediate wheel-zoom scales without rebuilding the map scene", async () => {
    renderCampusMap({ previewCampus });
    const surface = await screen.findByTestId("student-map-surface");
    const camera = surface.querySelector("svg > g[transform]");
    const building = screen.getByTestId("readonly-building");
    const readScale = () => Number(camera?.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1]);

    fireEvent.wheel(surface, { deltaY: -100, clientX: 300, clientY: 220 });

    await waitFor(() => expect(readScale()).toBeGreaterThan(1));
    const intermediateScale = readScale();
    expect(intermediateScale).toBeLessThan(Math.exp(0.11));
    expect(screen.getByTestId("readonly-building")).toBe(building);

    await waitFor(() => expect(readScale()).toBeCloseTo(Math.exp(0.11), 2), { timeout: 1_200 });
  });

  it("shows only journey instructions for a room-to-building navigation", async () => {
    const campus: EditorCampus = {
      ...previewCampus,
      buildings: [
        { ...previewCampus.buildings[0], entranceNodeId: "source-entry", floors: [{
          id: "ground", buildingId: "building-test", number: 1, label: "Ground Floor",
          rooms: [{ id: "source-room", name: "CABA-103", type: "classroom", x: 10, y: 10, w: 60, h: 60, floorId: "ground", buildingId: "building-test", accessDoorId: "room-door" }],
          paths: [], walls: [], doors: [{ id: "room-door", x: 40, y: 70, width: 20, height: 5, color: "#a16207" }], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
        }] },
        { ...previewCampus.buildings[0], id: "ceit", name: "CEIT", code: "CEIT", x: 500, entranceNodeId: "target-entry" },
      ],
      navNodes: [
        { id: "room-door-node", name: "Room Door", type: "hallway", x: 40, y: 70, buildingId: "building-test", floorId: "ground", doorId: "room-door", accessible: true, color: "#3b82f6" },
        { id: "hall", name: "Hall", type: "hallway", x: 40, y: 150, buildingId: "building-test", floorId: "ground", accessible: true, color: "#3b82f6" },
        { id: "source-entry", name: "Entrance", type: "entrance", x: 200, y: 220, buildingId: "building-test", accessible: true, color: "#3b82f6" },
        { id: "target-entry", name: "Entrance", type: "entrance", x: 500, y: 220, buildingId: "ceit", accessible: true, color: "#3b82f6" },
      ],
      navEdges: [
        { id: "indoor", startNodeId: "room-door-node", endNodeId: "hall", distance: 80, bidirectional: true, accessible: true, type: "walkway", color: "#3b82f6", width: 3 },
        { id: "exit", startNodeId: "hall", endNodeId: "source-entry", distance: 20, bidirectional: true, accessible: true, type: "entrance_transition", color: "#3b82f6", width: 3 },
        { id: "outdoor", startNodeId: "source-entry", endNodeId: "target-entry", distance: 300, bidirectional: true, accessible: true, type: "walkway", color: "#3b82f6", width: 3 },
      ],
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderCampusMap({ previewCampus: campus });
    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    fireEvent.click(await screen.findByRole("option", { name: /CABA-103, Room/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose destination" }));
    fireEvent.click(await screen.findByRole("option", { name: /CEIT, Building/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Start navigation" }));

    await waitFor(() => expect(screen.getAllByTestId("route-steps-panel").length).toBe(2));
    const [desktopRoutePanel, mobileRoutePanel] = screen.getAllByTestId("route-steps-panel");
    expect(desktopRoutePanel.parentElement?.parentElement).toHaveClass("hidden", "md:block");
    expect(mobileRoutePanel.parentElement).toHaveClass(
      "left-3",
      "md:hidden",
      "w-[min(18rem,calc(100vw_-_5rem))]",
    );
    expect(mobileRoutePanel.querySelector("button")).toHaveClass("h-8");
    expect(screen.queryByTestId("indoor-route-preview")).not.toBeInTheDocument();
    expect(screen.queryByText("Directions to room")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const maxDepthWarnings = consoleError.mock.calls.filter((call) =>
      call.some((value) => String(value).includes("Maximum update depth exceeded")),
    );
    consoleError.mockRestore();
    expect(maxDepthWarnings).toHaveLength(0);
  });

  it("zooms the student map when a two-finger pinch spreads", async () => {
    renderCampusMap({ previewCampus });

    const surface = await screen.findByTestId("student-map-surface");
    const svg = surface.querySelector("svg");
    expect(svg).not.toBeNull();

    const point = {
      x: 200,
      y: 150,
      matrixTransform: () => ({ x: 200, y: 150 }),
    } as unknown as DOMPoint;
    const matrix = {
      inverse: () => matrix,
    } as unknown as DOMMatrix;
    Object.defineProperty(svg!, "createSVGPoint", {
      configurable: true,
      value: () => point,
    });
    Object.defineProperty(svg!, "getScreenCTM", {
      configurable: true,
      value: () => matrix,
    });

    const transform = () => surface.querySelector("svg > g[transform]")?.getAttribute("transform") ?? "";
    const before = transform();

    fireEvent.touchStart(surface, {
      touches: [
        { clientX: 100, clientY: 240 },
        { clientX: 200, clientY: 240 },
      ],
    });
    fireEvent.touchMove(surface, {
      touches: [
        { clientX: 50, clientY: 240 },
        { clientX: 250, clientY: 240 },
      ],
    });

    await waitFor(() => expect(transform()).not.toBe(before));
    expect(transform()).toContain("scale(");
  });

  it("zooms the student map when a touch pointer pinch spreads", async () => {
    renderCampusMap({ previewCampus });

    const surface = await screen.findByTestId("student-map-surface");
    const svg = surface.querySelector("svg");
    expect(svg).not.toBeNull();

    const point = {
      x: 200,
      y: 150,
      matrixTransform: () => ({ x: 200, y: 150 }),
    } as unknown as DOMPoint;
    const matrix = {
      inverse: () => matrix,
    } as unknown as DOMMatrix;
    Object.defineProperty(svg!, "createSVGPoint", {
      configurable: true,
      value: () => point,
    });
    Object.defineProperty(svg!, "getScreenCTM", {
      configurable: true,
      value: () => matrix,
    });

    const transform = () => surface.querySelector("svg > g[transform]")?.getAttribute("transform") ?? "";
    const before = transform();

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 240,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 200,
      clientY: 240,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 50,
      clientY: 240,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 250,
      clientY: 240,
    });

    await waitFor(() => expect(transform()).not.toBe(before));
  });

  it("renders published Parking Lot artwork and authored geometry in the student viewer path", async () => {
    const parkingCampus: EditorCampus = {
      ...previewCampus,
      decorAssets: [{
        id: "published-parking",
        type: "parking-lot",
        x: 430,
        y: 340,
        width: 360,
        height: 180,
        rotation: 27,
        scale: 1,
        groundType: "parking",
      }],
    };
    renderCampusMap({ previewCampus: parkingCampus });

    const lot = await screen.findByTestId("readonly-ground-area");
    expect(lot).toHaveAttribute("transform", "rotate(27,430,340)");
    expect(screen.getByTestId("parking-stalls").querySelector("svg path")).toHaveAttribute("fill", "#cbd5e1");
  });

  it("updates the existing SVG viewport transform during mouse pan without rebuilding the scene", async () => {
    renderCampusMap({ previewCampus });
    const surface = await screen.findByTestId("student-map-surface");
    const svg = surface.querySelector("svg");
    const camera = svg?.querySelector(":scope > g[transform]");
    expect(camera).not.toBeNull();
    fireEvent.wheel(surface, { deltaY: -1000, clientX: 300, clientY: 220 });
    await waitFor(() => expect(camera?.getAttribute("transform")).not.toBe("translate(0,0) scale(1)"));
    const before = camera?.getAttribute("transform");
    const building = screen.getByTestId("readonly-building");

    fireEvent.mouseDown(surface, { clientX: 100, clientY: 120, button: 0 });
    fireEvent.mouseMove(surface, { clientX: 50, clientY: 145 });
    await waitFor(() => expect(camera).not.toHaveAttribute("transform", before));
    expect(screen.getByTestId("readonly-building")).toBe(building);
    fireEvent.mouseUp(surface, { clientX: 50, clientY: 145 });
  });

  it("reserves the mobile bottom navigation and safe area from the map viewport", async () => {
    renderCampusMap({ previewCampus });

    const surface = await screen.findByTestId("student-map-surface");

    expect(surface).toHaveClass("h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))]");
    expect(surface).toHaveClass("md:h-[calc(100dvh-76px)]");
  });

  it("keeps the mobile building sheet closed when directions opens", async () => {
    renderCampusMap({ previewCampus });

    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/ }));
    expect(screen.getByTestId("mobile-building-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open directions" }));

    expect(screen.getByTestId("route-planner-dialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("mobile-building-sheet")).not.toBeInTheDocument());
  });

  it("shows building actions in a sheet positioned above the mobile navigation", async () => {
    renderCampusMap({ previewCampus });

    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/ }));

    const sheet = await screen.findByTestId("mobile-building-sheet");
    expect(sheet.style.bottom).toContain("4.75rem");
    expect(sheet.style.height).toBe("58dvh");
    expect(within(sheet).getByRole("button", { name: /Directions/i })).toBeInTheDocument();
  });
});
