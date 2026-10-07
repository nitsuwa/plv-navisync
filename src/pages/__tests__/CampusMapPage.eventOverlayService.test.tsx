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

function withNavigableRooms(campus: EditorCampus, rooms: { buildingId: string; floorId: string; roomId: string }[]): EditorCampus {
  const buildingIds = [...new Set(rooms.map((room) => room.buildingId))];
  const entranceNodes = buildingIds.flatMap((buildingId) => [
    { id: `test-outdoor-${buildingId}`, name: "Campus Path", type: "outdoor" as const, x: 20, y: 20, accessible: true, color: "#2563eb" },
    { id: `test-entrance-${buildingId}`, name: "Main Entrance", type: "entrance" as const, x: 40, y: 40, buildingId, accessible: true, color: "#2563eb" },
  ]);
  const entranceEdges = buildingIds.map((buildingId) => ({
    id: `test-entrance-edge-${buildingId}`,
    startNodeId: `test-outdoor-${buildingId}`,
    endNodeId: `test-entrance-${buildingId}`,
    bidirectional: true,
    distance: 20,
    accessible: true,
    type: "path",
    color: "#2563eb",
    width: 4,
  }));
  return {
    ...campus,
    navNodes: [
      ...(campus.navNodes ?? []),
      ...entranceNodes,
      ...rooms.map(({ buildingId, floorId, roomId }) => ({
        id: `test-room-node-${buildingId}-${floorId}-${roomId}`,
        name: roomId,
        type: "room_access" as const,
        x: 80,
        y: 80,
        buildingId,
        floorId,
        roomId,
        accessible: true,
        color: "#2563eb",
      })),
    ],
    navEdges: [...(campus.navEdges ?? []), ...entranceEdges],
  };
}

const settingsMocks = vi.hoisted(() => ({ getPublicPlatformSettings: vi.fn() }));

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

  const readStudentMapCameraScale = (surface: HTMLElement) => {
    const camera = surface.querySelector<SVGGElement>("svg > g");
    const transform = camera?.getAttribute("transform") || camera?.style.transform || "";
    const scale = transform.match(/scale\(([^)]+)\)/)?.[1];
    return scale ? Number(scale) : Number.NaN;
  };

  it("toggles event preview without changing the navigation camera", async () => {
    renderCampusMap({ previewCampus });
    const toggle = await screen.findByRole("button", { name: "Open event map" }, { timeout: 5000 });
    expect(toggle).toHaveAttribute("data-dock", "event-map-bottom-left");
    expect(screen.getByTestId("student-map-recenter-button")).toHaveAttribute("data-dock", "map-control-top-right");
    const svg = screen.getByTestId("student-map-surface").querySelector("svg");
    const camera = svg?.querySelector("g[transform]")?.getAttribute("transform");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(/No published events/i)).toBeInTheDocument();
    expect(svg?.querySelector("g[transform]")?.getAttribute("transform")).toBe(camera);
    fireEvent.click(screen.getByRole("button", { name: "Close campus events" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Campus events" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Close campus events" }));
    expect(toggle).toHaveFocus();
  });

  it("loads student event previews from the allowlisted feed when the panel opens", async () => {
    renderCampusMap({ previewCampus });
    fireEvent.click(await screen.findByRole("button", { name: "Open event map" }));
    await waitFor(() => expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledWith("campus-test"));
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
    expect(eventOverlayService.listPublishedEventPreviews).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Open event map" })).not.toBeInTheDocument();
  });

  it("docks event map at the outdoor lower-left and yields it to the route planner", async () => {
    renderCampusMap({ previewCampus });
    const button = await screen.findByRole("button", { name: "Open event map" });
    expect(button).toHaveAttribute("data-dock", "event-map-bottom-left");
    expect(button).toHaveClass("student-map-event-control", "left-3");

    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    await screen.findByTestId("route-planner-dialog");
    await waitFor(() => expect(button).toHaveAttribute("aria-hidden", "true"));
    expect(button).toBeDisabled();
  });

  it("closes the event panel when building details take the foreground", async () => {
    renderCampusMap({ previewCampus });
    fireEvent.click(await screen.findByRole("button", { name: "Open event map" }));
    await screen.findByTestId("event-map-panel");

    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));

    await waitFor(() => expect(screen.queryByTestId("event-map-panel")).not.toBeInTheDocument());
    expect(screen.getByTestId("mobile-building-sheet")).toBeInTheDocument();
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

  it("shows the compact building details and keeps the zoom dock mounted across sheet states", async () => {
    const campus: EditorCampus = {
      ...previewCampus,
      buildings: [{
        ...previewCampus.buildings[0],
        entrances: [{ id: "science-main-entrance", buildingId: "building-test", edge: "bottom", offset: 0.5, type: "general", isPrimary: true }],
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
    const utilityControls = screen.getByTestId("student-map-utility-controls");
    const recenterButton = screen.getByTestId("student-map-recenter-button");
    expect(sheet).toHaveAttribute("data-sheet-state", "default");
    expect(sheetActions.getByTestId("building-cover-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("student-enter-building-pill")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-entrance")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-enter-building-door-hit-target")).toBeInTheDocument();
    expect(screen.queryByTestId("student-map-zoom-controls")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-map-recenter-button")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
    expect(sheetActions.getByRole("button", { name: /Directions/i })).toBeVisible();
    expect(sheetActions.getByRole("button", { name: "Enter Building" })).toBeVisible();
    expect(sheetActions.getByRole("button", { name: /Save/i })).toBeVisible();
    expect(sheetActions.getByRole("button", { name: /Report/i })).toBeVisible();
    expect(sheetActions.getByRole("button", { name: "More building actions" })).toBeVisible();
    expect(sheetActions.getByRole("button", { name: "Report map issue" })).toBeVisible();
    expect(utilityControls).toHaveClass("right-3", "bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]", "md:top-20");
    expect(screen.getByTestId("student-map-surface").style.getPropertyValue("--student-map-controls-safe-top")).toMatch(/px$/);

    fireEvent.click(sheetActions.getByRole("button", { name: "Expand building details" }));
    expect(sheet).toHaveAttribute("data-sheet-state", "expanded");
    expect(screen.getByTestId("student-map-utility-controls")).toBe(utilityControls);
    expect(screen.getByTestId("student-map-recenter-button")).toBe(recenterButton);
    fireEvent.click(sheetActions.getByRole("button", { name: "Close building details" }));
    await waitFor(() => expect(screen.queryByTestId("mobile-building-sheet")).not.toBeInTheDocument());
    expect(screen.getByTestId("student-map-utility-controls")).toBe(utilityControls);
    expect(screen.getByTestId("student-map-recenter-button")).toBe(recenterButton);
  });

  it("keeps the selected building sheet mounted and pauses its drag while search is foregrounded", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));

    const sheet = await screen.findByTestId("mobile-building-sheet");
    fireEvent.focus(search);
    expect(screen.getByTestId("mobile-building-sheet")).toBe(sheet);
    expect(sheet).toHaveAttribute("data-interaction-paused", "true");
    expect(sheet).toHaveAttribute("data-sheet-state", "default");
    expect(screen.getByTestId("student-map-controls").parentElement).toHaveAttribute("data-map-layer", "transient");

    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(sheet).toHaveAttribute("data-interaction-paused", "false"), { timeout: 1000 });
    expect(screen.getByTestId("mobile-building-sheet")).toBe(sheet);
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("student-map-utility-controls")).toBeInTheDocument();
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

  it("expands mobile search and temporarily hides the account trigger while focused", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    const searchPanel = screen.getByTestId("student-map-search-panel");
    const accountPositioner = screen.getByTestId("student-map-profile-trigger").parentElement!;

    expect(searchPanel).toHaveClass("right-16");
    expect(accountPositioner).not.toHaveAttribute("aria-hidden", "true");
    fireEvent.focus(search);

    await waitFor(() => {
      expect(searchPanel).toHaveClass("right-2");
      expect(accountPositioner).toHaveAttribute("aria-hidden", "true");
      expect(accountPositioner).toHaveAttribute("inert");
      expect(accountPositioner).toHaveClass("pointer-events-none", "opacity-0");
    });

    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => {
      expect(searchPanel).toHaveClass("right-16");
      expect(accountPositioner).not.toHaveAttribute("aria-hidden", "true");
    });
  });

  it("starts a fresh room-directions planner in the configured mode, not a previous SOS mode", async () => {
    const campus: EditorCampus = withNavigableRooms({ ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [{
      id: "route-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
      rooms: [{ id: "copyshop-room", name: "Copyshop", type: "classroom", floorId: "route-floor", buildingId: "building-test", x: 10, y: 10, w: 60, h: 60 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }] }] }, [{ buildingId: "building-test", floorId: "route-floor", roomId: "copyshop-room" }]);
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
    fireEvent.click(screen.getAllByRole("button", { name: /Enter Building/i })[0]);
    fireEvent.click(await screen.findByTestId("readonly-room"));
    fireEvent.click(within(screen.getByTestId("student-selected-place-card")).getByRole("button", { name: "Directions" }));

    expect(screen.getByRole("button", { name: "Standard routing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "SOS routing" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens a building selected by a scanned QR deep link after the campus loads", async () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, "", "/map?buildingId=building-test");
    try {
      renderCampusMap({ previewCampus });
      const sheet = await screen.findByTestId("mobile-building-sheet");
      fireEvent.click(within(sheet).getByRole("button", { name: "Show building QR code" }));
      expect(within(sheet).getByLabelText("QR code for Science Hall")).toBeInTheDocument();
      expect(screen.getAllByText("Science Hall").length).toBeGreaterThan(1);
      expect(window.location.search).toBe("");
    } finally {
      window.history.replaceState({}, "", originalUrl);
    }
  });

  it("replaces the drop-pin utility with the single Recenter action", async () => {
    renderCampusMap({ previewCampus });

    await screen.findByRole("searchbox", { name: "Search campus map" });
    expect(screen.queryByRole("button", { name: /Drop pin|Move dropped pin|Cancel drop pin/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Recenter map" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Recenter map" })).toHaveAttribute("data-dock", "map-control-top-right");
  });

  it("dismisses search outside without passing the same tap to a building", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    fireEvent.focus(search);
    expect(search).toHaveAttribute("aria-expanded", "true");
    const building = screen.getByTestId("readonly-building");

    fireEvent.pointerDown(building, { pointerType: "touch" });
    fireEvent.click(building);

    expect(search).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("mobile-building-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("data-selected", "false");
  });

  it("dismisses search for click-only input without activating the map underneath", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    fireEvent.focus(search);
    const building = screen.getByTestId("readonly-building");

    fireEvent.click(building);

    expect(search).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("mobile-building-sheet")).not.toBeInTheDocument();
    expect(building).toHaveAttribute("data-selected", "false");
  });

  it("hands focus between Search and Profile without keeping both overlays open", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    const profile = await screen.findByRole("button", { name: /user menu/i });

    fireEvent.focus(search);
    fireEvent.pointerDown(profile, { pointerType: "touch" });
    fireEvent.click(profile);
    expect(search).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByRole("menu", { name: "Student account menu" })).toBeInTheDocument();

    fireEvent.pointerDown(search, { pointerType: "touch" });
    fireEvent.click(search);
    fireEvent.focus(search);
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument());
    expect(search).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps Profile anchored and does not move the camera or lower-left utility", async () => {
    renderCampusMap({ previewCampus });
    await screen.findByRole("searchbox", { name: "Search campus map" });
    const surface = screen.getByTestId("student-map-surface");
    const cameraBefore = surface.querySelector("svg > g[transform]")?.getAttribute("transform");
    const stack = screen.getByTestId("student-map-utility-controls");
    const eventMap = screen.getByRole("button", { name: "Open event map" });

    fireEvent.click(await screen.findByRole("button", { name: /user menu/i }));
    expect(await screen.findByRole("menu", { name: "Student account menu" })).toBeInTheDocument();
    expect(stack).toHaveAttribute("data-profile-open", "true");
    expect(stack).toHaveClass("right-3", "bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]", "md:top-20");
    expect(screen.getByRole("button", { name: "Open event map" })).toBe(eventMap);
    expect(eventMap).toHaveAttribute("data-dock", "event-map-bottom-left");
    expect(surface.querySelector("svg > g[transform]")?.getAttribute("transform")).toBe(cameraBefore);

    fireEvent.pointerDown(screen.getByTestId("readonly-building"), { pointerType: "touch" });
    fireEvent.click(screen.getByTestId("readonly-building"));
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument());
    expect(stack).toHaveAttribute("data-profile-open", "false");
    expect(surface.querySelector("svg > g[transform]")?.getAttribute("transform")).toBe(cameraBefore);
    expect(screen.queryByTestId("mobile-building-sheet")).not.toBeInTheDocument();
  });

  it("lets users report an interacted indoor room with its floor prefilled", async () => {
    const campus: EditorCampus = withNavigableRooms({ ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [{
      id: "report-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
      rooms: [{ id: "report-room", name: "Copy Shop", type: "classroom", floorId: "report-floor", buildingId: "building-test", x: 10, y: 10, w: 60, h: 60 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }] }] }, [{ buildingId: "building-test", floorId: "report-floor", roomId: "report-room" }]);
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Enter Building" })[0]);
    fireEvent.click(await screen.findByTestId("readonly-room"));
    const roomCard = await screen.findByTestId("student-selected-place-card");
    expect(roomCard).toHaveClass("left-3", "right-3");
    expect(screen.getByTestId("student-map-surface").style.getPropertyValue("--student-map-room-card-top")).toMatch(/px$/);
    fireEvent.click(within(roomCard).getByRole("button", { name: "Report this room" }));
    expect(screen.getByRole("dialog", { name: "Report issue" })).toBeInTheDocument();
    expect(screen.getByLabelText("Floor")).toHaveValue("Ground Floor");
    expect(screen.getByLabelText("Room")).toHaveValue("Copy Shop");
  });

  it("keeps visual-only rooms inert, excludes them from Student search/routes, and follows published navigation membership", async () => {
    const floor = {
      id: "visual-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
      rooms: [
        { id: "comfort-room", name: "Comfort Room", type: "restroom", floorId: "visual-floor", buildingId: "building-test", x: 10, y: 10, w: 60, h: 60 },
        { id: "classroom", name: "Room 101", type: "classroom", floorId: "visual-floor", buildingId: "building-test", x: 90, y: 10, w: 60, h: 60 },
      ],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    };
    const visualOnlyCampus: EditorCampus = { ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [floor] }] };
    const campusWithRoom101 = withNavigableRooms(visualOnlyCampus, [{
      buildingId: "building-test", floorId: "visual-floor", roomId: "classroom",
    }]);
    const view = renderCampusMap({ previewCampus: campusWithRoom101 });

    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Comfort Room" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: /Comfort Room, Facility/i })).not.toBeInTheDocument());
    fireEvent.change(search, { target: { value: "Science Hall" } });
    fireEvent.click(await screen.findByRole("option", { name: /Science Hall, Building/i }));
    fireEvent.click(screen.getAllByTestId("building-enter")[0]);

    await screen.findByTestId("readonly-floor-plan-scene");
    const visualRoom = screen.getAllByTestId("readonly-room").find((room) => room.getAttribute("data-room-id") === "comfort-room");
    expect(visualRoom).toBeDefined();
    expect(visualRoom).toHaveAttribute("data-room-interactive", "false");
    expect(visualRoom).not.toHaveAttribute("role", "button");
    expect(document.querySelector("[data-testid='room-label-overlay'][data-room-id='comfort-room']")).toHaveTextContent(/Comfort\s*Room/);
    const navigableRoom101 = screen.getAllByTestId("readonly-room").find((room) => room.getAttribute("data-room-id") === "classroom");
    expect(navigableRoom101).toHaveAttribute("data-room-interactive", "true");
    fireEvent.click(navigableRoom101!);
    expect(await screen.findByTestId("student-selected-place-card")).toHaveTextContent("Room 101");
    const camera = screen.getByTestId("student-map-surface").querySelector("svg > g[transform]");
    const cameraBefore = camera?.getAttribute("transform");
    fireEvent.click(visualRoom!);
    expect(screen.getByTestId("student-selected-place-card")).toHaveTextContent("Room 101");
    expect(camera?.getAttribute("transform")).toBe(cameraBefore);

    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose destination" }));
    const destinationSearch = await screen.findByRole("searchbox", { name: "Search destination" });
    fireEvent.change(destinationSearch, { target: { value: "Comfort Room" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: /Comfort Room/ })).not.toBeInTheDocument());

    const navigableCampus = withNavigableRooms(visualOnlyCampus, [
      { buildingId: "building-test", floorId: "visual-floor", roomId: "classroom" },
      { buildingId: "building-test", floorId: "visual-floor", roomId: "comfort-room" },
    ]);
    view.rerender(<MemoryRouter><CampusMapPage previewCampus={navigableCampus} /></MemoryRouter>);
    const nowNavigable = screen.getAllByTestId("readonly-room").find((room) => room.getAttribute("data-room-id") === "comfort-room");
    expect(nowNavigable).toBeDefined();
    expect(nowNavigable).toHaveAttribute("data-room-interactive", "true");
    expect(nowNavigable).toHaveAttribute("role", "button");
    expect(await screen.findByRole("option", { name: /Comfort Room/ })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Back to route planner" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close directions" }));
    await waitFor(() => expect(screen.queryByTestId("route-planner-dialog")).not.toBeInTheDocument());
    const currentNavigableRoom = screen.getAllByTestId("readonly-room").find((room) => room.getAttribute("data-room-id") === "comfort-room");
    fireEvent.click(currentNavigableRoom!);
    expect(await screen.findByTestId("student-selected-place-card")).toBeInTheDocument();

    // Removing the authored node (the Admin's Remove from Navigation action)
    // withdraws its Student selection and details state on the updated preview.
    view.rerender(<MemoryRouter><CampusMapPage previewCampus={campusWithRoom101} /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByTestId("student-selected-place-card")).not.toBeInTheDocument());
    const removedRoom = screen.getAllByTestId("readonly-room").find((room) => room.getAttribute("data-room-id") === "comfort-room");
    expect(removedRoom).toHaveAttribute("data-room-interactive", "false");
  });

  it("keeps a selected room card only while that room exists on the newly selected floor", async () => {
    const sharedRoom = { id: "same-room", name: "Study Lounge", type: "lounge", x: 20, y: 20, w: 70, h: 50 };
    const campus: EditorCampus = withNavigableRooms({ ...previewCampus, buildings: [{
      ...previewCampus.buildings[0],
      floors: [
        { id: "ground", buildingId: "building-test", number: 1, label: "Ground Floor", rooms: [{ ...sharedRoom, floorId: "ground", buildingId: "building-test" }], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
        { id: "second", buildingId: "building-test", number: 2, label: "Floor 2", rooms: [{ ...sharedRoom, floorId: "second", buildingId: "building-test" }], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
        { id: "third", buildingId: "building-test", number: 3, label: "Floor 3", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
      ],
    }] }, [
      { buildingId: "building-test", floorId: "ground", roomId: "same-room" },
      { buildingId: "building-test", floorId: "second", roomId: "same-room" },
    ]);
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "Enter Building" })[0]);
    fireEvent.click(await screen.findByTestId("readonly-room"));

    expect(await screen.findByTestId("student-selected-place-card")).toBeInTheDocument();
    expect(screen.getByTestId("student-floor-picker")).toHaveAttribute("data-dock", "floor-control-bottom-left");
    expect(screen.queryByTestId("student-campus-selector")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-map-recenter-button")).toHaveAttribute("data-dock", "map-control-top-right");
    expect(screen.getByTestId("student-map-recenter-button")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose floor. Current floor: Ground Floor" }));
    fireEvent.click(within(screen.getByTestId("student-floor-picker-menu")).getByRole("option", { name: /Floor 2/ }));
    expect(await screen.findByTestId("student-selected-place-card")).toHaveTextContent("Floor 2");

    fireEvent.click(screen.getByRole("button", { name: "Choose floor. Current floor: Floor 2" }));
    fireEvent.click(within(screen.getByTestId("student-floor-picker-menu")).getByRole("option", { name: /Floor 3/ }));
    await waitFor(() => expect(screen.queryByTestId("student-selected-place-card")).not.toBeInTheDocument());
  });

  it("inspects a floor room without changing the open route planner endpoints or mode", async () => {
    const campus: EditorCampus = withNavigableRooms({ ...previewCampus, buildings: [{
      ...previewCampus.buildings[0],
      floors: [{
        id: "inspect-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
        rooms: [{ id: "inspect-room", name: "Visitor Lounge", type: "lounge", floorId: "inspect-floor", buildingId: "building-test", x: 10, y: 10, w: 80, h: 50 }],
        paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
      }],
    }] }, [{ buildingId: "building-test", floorId: "inspect-floor", roomId: "inspect-room" }]);
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "Enter Building" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accessible routing" }));

    const planner = screen.getByTestId("route-planner-dialog");
    fireEvent.click(screen.getByTestId("readonly-room"));

    expect(within(planner).getByTestId("route-endpoint-card-start")).toHaveTextContent("Choose starting point");
    expect(within(planner).getByTestId("route-endpoint-card-destination")).toHaveTextContent("Choose destination");
    expect(within(planner).getByRole("button", { name: "Accessible routing" })).toHaveAttribute("aria-pressed", "true");
    expect(within(planner).queryByTestId("selected-room-planner-context")).not.toBeInTheDocument();
    expect(within(planner).queryByRole("button", { name: "Report this room" })).not.toBeInTheDocument();
  });

  it.each([
    ["Directions", "route-endpoint-card-destination", "Administration Office", "route-endpoint-card-start", "Choose starting point"],
    ["Start", "route-endpoint-card-start", "Administration Office", "route-endpoint-card-destination", "Choose destination"],
  ])("transfers a selected room into the planner from the %s action", async (action, chosenEndpoint, chosenLabel, emptyEndpoint, emptyLabel) => {
    const campus: EditorCampus = withNavigableRooms({ ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [{
      id: "context-floor", buildingId: "building-test", number: 2, label: "Floor 2",
      rooms: [{ id: "admin-office", name: "Administration Office", type: "office", floorId: "context-floor", buildingId: "building-test", x: 10, y: 10, w: 80, h: 50 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }] }] }, [{ buildingId: "building-test", floorId: "context-floor", roomId: "admin-office" }]);
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "Enter Building" })[0]);
    fireEvent.click(await screen.findByTestId("readonly-room"));
    fireEvent.click(within(screen.getByTestId("student-selected-place-card")).getByRole("button", { name: action === "Directions" ? "Directions" : "Start" }));

    expect(await screen.findByTestId(chosenEndpoint)).toHaveTextContent(chosenLabel);
    expect(screen.getByTestId(emptyEndpoint)).toHaveTextContent(emptyLabel);
    await waitFor(() => expect(screen.queryByTestId("student-selected-place-card")).not.toBeInTheDocument());
  });

  it("opens a searched room without forcing a zoom change, then returns to the campus for a building result", async () => {
    const campus: EditorCampus = withNavigableRooms({ ...previewCampus, buildings: [{ ...previewCampus.buildings[0], floors: [{
      id: "search-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
      rooms: [{ id: "search-room", name: "Copy Shop", type: "classroom", floorId: "search-floor", buildingId: "building-test", x: 15, y: 20, w: 60, h: 40 }],
      paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    }] }] }, [{ buildingId: "building-test", floorId: "search-floor", roomId: "search-room" }]);
    renderCampusMap({ previewCampus: campus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Copy Shop" } });
    fireEvent.click(await screen.findByRole("option", { name: /Copy Shop, Room/i }));
    expect(await screen.findByTestId("readonly-room")).toBeInTheDocument();
    expect(screen.queryByTestId("student-map-zoom-percentage")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(readStudentMapCameraScale(screen.getByTestId("student-map-surface"))).toBeCloseTo(1, 1);
    }, { timeout: 3000 });

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
    fireEvent.click(screen.getAllByRole("button", { name: "Enter Building" })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose floor. Current floor: Ground Floor" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Recenter map" })).toBeInTheDocument();
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

  it("keeps zoom controls hidden while wheel and keyboard zoom remain available", async () => {
    renderCampusMap({ previewCampus });
    const surface = await screen.findByTestId("student-map-surface");
    const readScale = () => Number(surface.querySelector("svg > g[transform]")?.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1]);
    const recenter = screen.getByRole("button", { name: "Recenter map" });
    expect(recenter).toHaveAttribute("data-testid", "student-map-recenter-button");
    expect(recenter).toHaveAttribute("data-dock", "map-control-top-right");
    expect(screen.getByTestId("student-map-utility-controls").contains(recenter)).toBe(true);
    expect(screen.queryAllByTestId("student-map-recenter-button")).toHaveLength(1);
    expect(screen.queryByTestId("student-map-zoom-controls")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-map-zoom-percentage")).not.toBeInTheDocument();

    const initialScale = readScale();
    fireEvent.wheel(surface, { deltaY: 100, clientX: 300, clientY: 220 });
    await waitFor(() => expect(readScale()).toBeLessThan(initialScale));
    const zoomedOutScale = readScale();
    fireEvent.keyDown(window, { key: "+" });
    await waitFor(() => expect(readScale()).toBeGreaterThan(zoomedOutScale));
    fireEvent.click(recenter);
    await waitFor(() => expect(readScale()).toBeCloseTo(initialScale, 2), { timeout: 1200 });
  });

  it("does not zoom the map when scrolling its search controls", async () => {
    renderCampusMap({ previewCampus });
    const search = await screen.findByRole("searchbox", { name: "Search campus map" });
    const surface = screen.getByTestId("student-map-surface");
    const readTransform = () => surface.querySelector("svg > g[transform]")?.getAttribute("transform");
    const before = readTransform();
    fireEvent.wheel(search, { deltaY: -1000 });
    expect(readTransform()).toBe(before);
    fireEvent.wheel(surface, { deltaY: -1000 });
    await waitFor(() => expect(readTransform()).not.toBe(before));
    const zoomed = readTransform();
    fireEvent.wheel(surface, { deltaY: 10000 });
    await waitFor(() => expect(readTransform()).not.toBe(zoomed));
    expect(screen.getByRole("button", { name: "Recenter map" })).toBeInTheDocument();
  });

  it("smoothly wheel-zooms without replacing the map scene", async () => {
    renderCampusMap({ previewCampus });
    const surface = await screen.findByTestId("student-map-surface");
    const camera = surface.querySelector("svg > g[transform]");
    const building = screen.getByTestId("readonly-building");
    const readScale = () => Number(camera?.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1]);
    const initialScale = readScale();

    fireEvent.wheel(surface, { deltaY: -100, clientX: 300, clientY: 220 });

    // Wheel input only changes the target; the visible transform moves on the
    // next camera frame rather than stepping to the final scale in the event.
    expect(readScale()).toBe(initialScale);
    await waitFor(() => expect(readScale()).toBeCloseTo(Math.exp(0.11), 2));
    expect(screen.getByTestId("readonly-building")).toBe(building);
  });

  it("uses the same continuous cursor-anchored wheel zoom in the indoor floor view", async () => {
    const campus: EditorCampus = { ...previewCampus, buildings: [{
      ...previewCampus.buildings[0],
      floors: [{
        id: "zoom-floor", buildingId: "building-test", number: 1, label: "Ground Floor",
        rooms: [{ id: "zoom-room", name: "Room", type: "classroom", floorId: "zoom-floor", buildingId: "building-test", x: 20, y: 20, w: 80, h: 50 }],
        paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
      }],
    }] };
    renderCampusMap({ previewCampus: campus });
    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/i }));
    fireEvent.click(screen.getAllByTestId("building-enter")[0]);

    const surface = await screen.findByTestId("student-map-surface");
    await screen.findByTestId("readonly-floor-plan-scene");
    const readScale = () => readStudentMapCameraScale(surface);
    const initialScale = readScale();

    fireEvent.wheel(surface, { deltaY: -100, clientX: 300, clientY: 220 });
    expect(readScale()).toBe(initialScale);
    await waitFor(() => expect(readScale()).toBeCloseTo(initialScale * Math.exp(0.11), 2));
  });

  it("shows only journey instructions for a room-to-building navigation", async () => {
    const campus: EditorCampus = {
      ...previewCampus,
      buildings: [
        { ...previewCampus.buildings[0], entranceNodeId: "source-entry", floors: [{
          id: "ground", buildingId: "building-test", number: 1, label: "Ground Floor",
          rooms: [{ id: "source-room", name: "CABA-103", type: "classroom", x: 10, y: 10, w: 60, h: 60, floorId: "ground", buildingId: "building-test", accessDoorId: "room-door" }],
          paths: [], walls: [], doors: [{ id: "room-door", x: 40, y: 70, width: 20, direction: "left", color: "#a16207" }], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
        }] },
        { ...previewCampus.buildings[0], id: "ceit", name: "CEIT", code: "CEIT", x: 500, entranceNodeId: "target-entry" },
      ],
      navNodes: [
        { id: "source-room-access", name: "CABA-103", type: "room_access", roomId: "source-room", x: 40, y: 50, buildingId: "building-test", floorId: "ground", accessible: true, color: "#3b82f6" },
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
    expect(mobileRoutePanel.parentElement).toHaveClass("inset-x-2", "bottom-0", "md:hidden");
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
    fireEvent.wheel(surface, { deltaY: -100, clientX: 300, clientY: 220 });
    await waitFor(() => expect(Number(camera?.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1])).toBeGreaterThan(1));
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

  it("lets students inspect a building during route planning without changing planner state", async () => {
    renderCampusMap({ previewCampus });
    fireEvent.click(await screen.findByRole("button", { name: "Open directions" }));
    const planner = screen.getByTestId("route-planner-dialog");
    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    const startSearch = await screen.findByRole("searchbox", { name: "Search start" });
    fireEvent.change(startSearch, { target: { value: "Science" } });

    fireEvent.click(screen.getByTestId("readonly-building"));
    const details = await screen.findByTestId("mobile-building-sheet");
    expect(planner).toHaveAttribute("data-suspended-for-building", "true");
    expect(screen.getByTestId("route-planner-dialog")).toBe(planner);
    expect(within(details).getByRole("button", { name: "Back to route planner" })).toBeInTheDocument();

    fireEvent.click(within(details).getByRole("button", { name: "Back to route planner" }));
    expect(screen.getByTestId("route-planner-dialog")).toBe(planner);
    expect(screen.getByRole("searchbox", { name: "Search start" })).toHaveValue("Science");
    expect(screen.queryByTestId("route-endpoint-card-start")).not.toBeInTheDocument();
  });

  it("shows building actions in a sheet positioned above the mobile navigation", async () => {
    renderCampusMap({ previewCampus });

    fireEvent.focus(await screen.findByRole("searchbox", { name: "Search campus map" }));
    fireEvent.click(screen.getByRole("option", { name: /Science Hall, Building/ }));

    const sheet = await screen.findByTestId("mobile-building-sheet");
    expect(sheet.style.bottom).toContain("4.75rem");
    expect(sheet).toHaveAttribute("data-sheet-state", "default");
    expect(within(sheet).getByTestId("building-cover-fallback")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Directions" })).toBeInTheDocument();
  });
});
