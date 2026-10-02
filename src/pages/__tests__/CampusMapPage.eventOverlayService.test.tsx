import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { settingsService, DEFAULT_PUBLIC_PLATFORM_SETTINGS } from "../../services/settingsService";
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

vi.mock("../../services/eventOverlayService", () => ({
  eventOverlayService: {
    getApprovedOverlaysForCampus: vi.fn().mockResolvedValue([]),
    getApprovedOverlaysForFloor: vi.fn().mockResolvedValue([]),
    listPublishedEventPreviews: vi.fn().mockResolvedValue({ serverNow: "2026-10-08T02:00:00.000Z", events: [] }),
  },
}));

vi.mock("../../services/usageAnalyticsService", () => ({
  usageAnalyticsService: { track: vi.fn() },
}));

describe("CampusMapPage event overlays", () => {
  const renderCampusMap = (props: ComponentProps<typeof CampusMapPage> = {}) =>
    render(
      <MemoryRouter>
        <CampusMapPage {...props} />
      </MemoryRouter>,
    );

  it("toggles event preview without changing the navigation camera", async () => {
    vi.spyOn(settingsService, "getPublicPlatformSettings").mockResolvedValue(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
    renderCampusMap({ previewCampus });
    const toggle = await screen.findByRole("button", { name: "Event map" });
    const svg = screen.getByTestId("student-map-surface").querySelector("svg");
    const camera = svg?.querySelector("g[transform]")?.getAttribute("transform");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(/No published events/i)).toBeInTheDocument();
    expect(svg?.querySelector("g[transform]")?.getAttribute("transform")).toBe(camera);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Campus events" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Close campus events" }));
    expect(toggle).toHaveFocus();
  });

  it("loads student event previews from the allowlisted feed when the panel opens", async () => {
    renderCampusMap({ previewCampus });
    fireEvent.click(await screen.findByRole("button", { name: "Event map" }));
    await waitFor(() => expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledWith("campus-test"));
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

  it("labels manual pin mode as dropping a pin", async () => {
    renderCampusMap({ previewCampus });

    const dropPinButton = await screen.findByRole("button", { name: "Drop pin" });
    fireEvent.click(dropPinButton);

    expect(screen.getByText("Tap map to drop pin")).toBeInTheDocument();
    expect(screen.queryByText("Tap anywhere on the map to set your location")).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Report issue in Copy Shop" }));
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
    await waitFor(() => expect(screen.getByText("180%")).toBeInTheDocument(), { timeout: 3000 });

    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Science Hall" } });
    fireEvent.click(await screen.findByRole("option", { name: /Science Hall, Building/i }));
    await waitFor(() => expect(screen.queryByTestId("readonly-room")).not.toBeInTheDocument());
    expect(screen.getByTestId("mobile-building-sheet")).toBeInTheDocument();
  });

  it("exposes every published floor after View Floor Plan, using floor labels rather than internal numbers", async () => {
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
    expect(screen.queryByRole("button", { name: /View Floor Plan/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View Floor 2 of Science Hall" })[0]).toHaveTextContent("2");
    expect(screen.getAllByRole("button", { name: "View Floor 3 of Science Hall" })[0]).toHaveTextContent("3");
    expect(screen.getAllByRole("button", { name: "View Floor 4 of Science Hall" })[0]).toHaveTextContent("4");
    fireEvent.click(screen.getAllByRole("button", { name: "View Floor 3 of Science Hall" })[0]);
    expect(screen.getAllByRole("button", { name: "View Floor 3 of Science Hall" })[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("readonly-room")).toHaveAttribute("data-room-id", "room-third");
  });

  it("uses visible zoom buttons and prevents zooming beyond the fit-map limit", async () => {
    renderCampusMap({ previewCampus });
    const zoomIn = await screen.findByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(zoomOut).toBeDisabled();
    fireEvent.click(zoomIn);
    await waitFor(() => expect(zoomOut).not.toBeDisabled());
    fireEvent.click(zoomOut);
    await waitFor(() => expect(zoomOut).toBeDisabled());
    for (let index = 0; index < 30; index += 1) fireEvent.click(zoomIn);
    await waitFor(() => expect(zoomIn).toBeDisabled());
    expect(screen.getByText("350%")).toBeInTheDocument();
  });

  it("does not zoom the map when scrolling its search controls", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    fireEvent.wheel(search, { deltaY: -1000 });
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    fireEvent.wheel(screen.getByTestId("student-map-surface"), { deltaY: -1000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Zoom out" })).not.toBeDisabled());
    fireEvent.wheel(screen.getByTestId("student-map-surface"), { deltaY: 10000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled());
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
    renderCampusMap({ previewCampus: campus });
    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    fireEvent.click(screen.getByRole("option", { name: /CABA-103, Room/ }));
    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    fireEvent.click(screen.getByRole("option", { name: /CEIT, Building/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Zoom out" })).not.toBeDisabled());
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
    expect(screen.queryByTestId("mobile-building-sheet")).not.toBeInTheDocument();
  });
});
