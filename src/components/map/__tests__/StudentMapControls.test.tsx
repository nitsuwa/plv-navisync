import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { StudentMapControls, StudentMapModeToggle, type StudentMapControlsProps } from "../StudentMapControls";
import { RoutePlannerDialog } from "../RoutePlannerDialog";
import type { SearchResult } from "../../../hooks";
import type { Building } from "../../../types";

const building: Building = {
  id: "science",
  code: "SCI",
  name: "Science Hall",
  description: "",
  category: "academic",
  floor_count: 3,
  created_at: "2026-01-01",
};

const result: SearchResult = {
  id: building.id,
  name: building.name,
  code: building.code,
  kind: "building",
  category: "academic",
  buildingId: building.id,
  buildingName: building.name,
  accessible: true,
  keywords: ["science", "sci"],
};

const props = (overrides: Partial<StudentMapControlsProps> = {}): StudentMapControlsProps => ({
  isFloorMode: false,
  search: "",
  searchFocused: false,
  directionsMode: false,
  searchResults: [],
  onSearchChange: vi.fn(),
  onSearchFocus: vi.fn(),
  onSearchBlur: vi.fn(),
  onClearSearch: vi.fn(),
  onSelectSearchResult: vi.fn(),
  onOpenDirections: vi.fn(),
  ...overrides,
});

const routePlannerProps = (overrides: Partial<React.ComponentProps<typeof RoutePlannerDialog>> = {}) => ({
  from: null,
  to: null,
  onFromChange: vi.fn(),
  onToChange: vi.fn(),
  buildings: [],
  mode: "standard" as const,
  onModeChange: vi.fn(),
  route: null,
  onClose: vi.fn(),
  onClear: vi.fn(),
  onFindRoute: vi.fn(),
  youAreHere: null,
  useMyLocation: false,
  onUseMyLocationChange: vi.fn(),
  destinationResults: [],
  ...overrides,
});

function RendererToggleFixture() {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const toggleMode = () => setMode((current) => current === "2d" ? "3d" : "2d");
  return <>
    <button type="button" onClick={() => setPlannerOpen(true)}>Open fixture planner</button>
    <StudentMapControls {...props({
      directionsMode: plannerOpen,
      mapOverlayOpen: plannerOpen,
      campusViewMode: mode,
      campusViewToggleVisible: true,
      onToggleCampusViewMode: toggleMode,
    })} />
    {plannerOpen && <RoutePlannerDialog {...routePlannerProps({
      headerUtility: <StudentMapModeToggle compact mode={mode} onToggle={toggleMode} />,
      onClose: () => setPlannerOpen(false),
    })} />}
  </>;
}

describe("StudentMapControls", () => {
  it("offers Discover PLV and removes ordinary controls while the tour is active", () => {
    const onOpenDiscover = vi.fn();
    const view = render(<StudentMapControls {...props({ onOpenDiscover })} />);
    const discover = screen.getByRole("button", { name: "Discover PLV" });
    expect(discover).toHaveClass("hidden", "md:inline-flex");
    fireEvent.click(discover);
    expect(onOpenDiscover).toHaveBeenCalledOnce();
    view.rerender(<StudentMapControls {...props({ onOpenDiscover, discoverMode: true })} />);
    expect(screen.queryByRole("button", { name: "Discover PLV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open directions" })).not.toBeInTheDocument();
  });

  it("hides Discover while route planning or guided navigation owns the map", () => {
    render(<StudentMapControls {...props({ onOpenDiscover: vi.fn(), directionsMode: true, navigationActive: true })} />);
    expect(screen.queryByRole("button", { name: "Discover PLV" })).not.toBeInTheDocument();
  });
  it("replaces normal search chrome in event mode while retaining directions and recenter", () => {
    render(<StudentMapControls {...{ ...props({ onResetView: vi.fn() }), eventMode: true }} />);
    expect(screen.queryByRole("searchbox", { name: "Search campus map" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open directions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recenter map" })).toBeInTheDocument();
  });
  it("keeps search and the single useful route action in the floating controls", () => {
    render(<StudentMapControls {...props()} />);

    const searchbox = screen.getByRole("searchbox", { name: "Search campus map" });
    expect(searchbox).toBeInTheDocument();
    expect(searchbox).toHaveClass("text-xs", "sm:text-[13px]");
    expect(screen.getByTestId("student-map-controls")).not.toHaveClass("map-layer-controls");
    expect(screen.getByTestId("student-map-header-slot")).toHaveAttribute("data-map-search-shell", "true");
    expect(screen.getByTestId("student-map-search-panel").querySelector("[data-map-search-header='true']")).toBeInTheDocument();
    expect(screen.getByTestId("student-map-header-slot")).toHaveAttribute("data-right-reservation", "profile");
    expect(screen.getByTestId("student-map-utility-controls")).toHaveClass("bottom-3", "md:bottom-6", "flex-col", "items-end");
    expect(screen.getByTestId("student-map-utility-controls")).toHaveAttribute("data-anchor", "map-bottom-right");
    expect(screen.getByTestId("student-map-utility-controls")).toHaveStyle({
      right: "var(--student-map-utility-anchor-right, calc(0.75rem + env(safe-area-inset-right, 0px)))",
      bottom: "var(--student-map-utility-anchor-bottom, calc(0.75rem + env(safe-area-inset-bottom, 0px)))",
    });
    expect(screen.getByRole("button", { name: "Open directions" })).toBeInTheDocument();
    expect(within(screen.getByTestId("student-map-utility-controls")).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Drop pin|Move dropped pin|Cancel drop pin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use my location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset map view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
  });

  it("keeps the focused search anchored in its original safe header slot", () => {
    render(<StudentMapControls {...props({ searchFocused: true, search: "science", searchResults: [result] })} />);

    const slot = screen.getByTestId("student-map-header-slot");
    expect(slot).toHaveAttribute("data-right-reservation", "profile");
    expect(slot).not.toHaveClass("transition-[right]");
    const results = screen.getByRole("listbox", { name: "Campus destination results" });
    expect(results.getAttribute("style")).toContain("100dvh");
    expect(results.getAttribute("style")).toContain("safe-area-inset-bottom");
    expect(results).toHaveClass("overscroll-contain");
  });

  it("reserves space for the notification bell beside the profile button", () => {
    render(<StudentMapControls {...props({ notificationBellVisible: true })} />);

    const slot = screen.getByTestId("student-map-header-slot");
    expect(slot).toHaveAttribute("data-right-reservation", "notification-and-profile");
    expect(slot.style.right).toContain("7.5rem");
  });

  it("keeps route modes and building shortcuts out of the search area", () => {
    render(<StudentMapControls {...props()} />);

    expect(screen.queryByTestId("student-map-quick-filters")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accessible routes|Emergency routes|All buildings/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("student-map-utility-controls").contains(screen.getByRole("button", { name: "Open directions" }))).toBe(true);
  });

  it("uses the right utility stack for its only recenter action", () => {
    const onResetView = vi.fn();
    render(<StudentMapControls {...props({ onResetView })} />);

    const recenter = screen.getByRole("button", { name: "Recenter map" });
    expect(recenter).toHaveAttribute("data-testid", "student-map-recenter-button");
    expect(recenter).toHaveAttribute("data-dock", "map-control-bottom-right");
    expect(screen.queryByRole("button", { name: /Drop pin|Move dropped pin|Cancel drop pin/i })).not.toBeInTheDocument();
    fireEvent.click(recenter);
    expect(onResetView).toHaveBeenCalledOnce();
  });

  it("keeps the view-mode icon inside the fixed bottom-right control rail", () => {
    render(<StudentMapControls {...props({
      campusViewMode: "3d",
      campusViewToggleVisible: true,
      onToggleCampusViewMode: vi.fn(),
      onResetView: vi.fn(),
      onScanLocation: vi.fn(),
    })} />);
    const stack = screen.getByTestId("student-map-utility-controls");
    const toggle = screen.getByTestId("student-campus-view-mode-toggle");
    expect(screen.getByTestId("student-map-mode-toggle-anchor")).toHaveClass("map-layer-mode-toggle");
    expect(toggle).toHaveAttribute("data-dock", "map-control-bottom-right");
    expect(stack.contains(toggle)).toBe(true);
    const actions = within(stack).getByTestId("student-map-utility-actions");
    expect(within(actions).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Recenter map", "Scan location QR", "Open directions",
    ]);
  });

  it("keeps the renderer switch in the bottom-right rail while search is focused", () => {
    const onToggleCampusViewMode = vi.fn();
    render(<StudentMapControls {...props({
      searchFocused: true,
      search: "science",
      searchResults: [result],
      campusViewMode: "2d",
      campusViewToggleVisible: true,
      onToggleCampusViewMode,
    })} />);

    const shell = screen.getByTestId("student-map-utility-controls");
    const toggle = screen.getByRole("button", { name: "Switch to 3D view" });
    expect(shell.contains(toggle)).toBe(true);
    expect(shell).toHaveAttribute("data-anchor", "map-bottom-right");
    fireEvent.click(toggle);
    expect(onToggleCampusViewMode).toHaveBeenCalledOnce();
  });

  it("hides the floating renderer switch while the route planner owns the map controls", () => {
    const onToggleCampusViewMode = vi.fn();
    const viewProps = props({ campusViewMode: "2d", campusViewToggleVisible: true, onToggleCampusViewMode });
    const { rerender } = render(<StudentMapControls {...viewProps} />);
    const toggle = screen.getByRole("button", { name: "Switch to 3D view" });
    expect(toggle).toHaveAttribute("data-testid", "student-campus-view-mode-toggle");
    expect(toggle).toHaveAttribute("data-dock", "map-control-bottom-right");
    expect(toggle).toHaveAttribute("title", "Switch to 3D");
    expect(toggle).toHaveClass("h-11", "w-11", "rounded-xl");
    expect(screen.getAllByTestId("student-campus-view-mode-toggle")).toHaveLength(1);
    const initialRail = screen.getByTestId("student-map-utility-controls");
    expect(initialRail.contains(toggle)).toBe(true);
    const initialStyle = initialRail.getAttribute("style");
    fireEvent.click(toggle);
    expect(onToggleCampusViewMode).toHaveBeenCalledOnce();

    rerender(<StudentMapControls {...props({ ...viewProps, mapOverlayOpen: true })} />);
    rerender(<StudentMapControls {...props({ ...viewProps, directionsMode: true, mapOverlayOpen: true })} />);
    expect(screen.queryByTestId("student-map-utility-controls")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-map-search-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-campus-view-mode-toggle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open directions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recenter map" })).not.toBeInTheDocument();
    expect(initialStyle).toContain("var(--student-map-utility-anchor-right");
  });

  it.each([360, 390, 768, 1024, 1440])("shows exactly one working renderer toggle across planner open/close at %ipx", (width) => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    const originalWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const view = render(<RendererToggleFixture />);
    try {
      const getToggles = () => screen.getAllByTestId("student-campus-view-mode-toggle");

      expect(getToggles()).toHaveLength(1);
      expect(screen.getByTestId("student-map-utility-controls").contains(getToggles()[0])).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Open fixture planner" }));

      const dialog = screen.getByRole("dialog", { name: "Route planner" });
      expect(getToggles()).toHaveLength(1);
      expect(dialog.querySelector("header")?.contains(getToggles()[0])).toBe(true);
      expect(getToggles()[0]).toHaveAttribute("aria-label", "Switch to 3D view");
      fireEvent.click(getToggles()[0]);
      expect(getToggles()).toHaveLength(1);
      expect(getToggles()[0]).toHaveAttribute("aria-label", "Switch to 2D view");

      fireEvent.click(screen.getByRole("button", { name: "Cancel route planning" }));
      expect(getToggles()).toHaveLength(1);
      expect(screen.getByTestId("student-map-utility-controls").contains(getToggles()[0])).toBe(true);
      expect(getToggles()[0]).toHaveAttribute("aria-label", "Switch to 2D view");
    } finally {
      view.unmount();
      if (originalWidthDescriptor) Object.defineProperty(window, "innerWidth", originalWidthDescriptor);
      else Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("offers the opposite map renderer with one accessible icon control in either mode", () => {
    const onToggleCampusViewMode = vi.fn();
    const { rerender } = render(<StudentMapControls {...props({ campusViewMode: "2d", campusViewToggleVisible: true, onToggleCampusViewMode })} />);
    const switchTo3D = screen.getByRole("button", { name: "Switch to 3D view" });
    expect(switchTo3D).toHaveAttribute("title", "Switch to 3D");
    expect(switchTo3D).toHaveAttribute("data-view-mode-target", "3d");
    expect(switchTo3D.querySelector("svg")).toBeInTheDocument();

    rerender(<StudentMapControls {...props({ campusViewMode: "3d", campusViewToggleVisible: true, onToggleCampusViewMode })} />);
    const switchTo2D = screen.getByRole("button", { name: "Switch to 2D view" });
    expect(switchTo2D).toHaveAttribute("title", "Switch to 2D");
    expect(switchTo2D).toHaveAttribute("data-view-mode-target", "2d");
    expect(screen.getAllByTestId("student-campus-view-mode-toggle")).toHaveLength(1);
  });

  it("keeps the indoor renderer toggle in the anchored rail while a sheet is open", () => {
    render(<StudentMapControls {...props({
      isFloorMode: true,
      mapOverlayOpen: true,
      campusViewMode: "3d",
      campusViewToggleVisible: true,
      onToggleCampusViewMode: vi.fn(),
    })} />);

    const rail = screen.getByTestId("student-map-utility-controls");
    expect(rail).toHaveAttribute("data-anchor", "map-bottom-right");
    expect(rail).toContainElement(screen.getByRole("button", { name: "Switch to 2D view" }));
    expect(screen.queryByTestId("student-map-utility-actions")).not.toBeInTheDocument();
  });

  it("keeps the view switch in its bottom-right rail during Follow and floor changes", () => {
    const onToggleCampusViewMode = vi.fn();
    const shared = {
      campusViewMode: "2d" as const,
      campusViewToggleVisible: true,
      onToggleCampusViewMode,
      navigationActive: true,
      onResetView: vi.fn(),
      onScanLocation: vi.fn(),
      onTogglePin: vi.fn(),
    };
    const { rerender } = render(<StudentMapControls {...props(shared)} />);

    const outdoorRail = screen.getByTestId("student-map-utility-controls");
    expect(within(outdoorRail).getByTestId("student-campus-view-mode-toggle")).toHaveAttribute("aria-label", "Switch to 3D view");
    const outdoorPosition = outdoorRail.getAttribute("style");
    expect(screen.queryByRole("button", { name: "Recenter map" })).not.toBeInTheDocument();

    rerender(<StudentMapControls {...props({ ...shared, isFloorMode: true })} />);
    const indoorRail = screen.getByTestId("student-map-utility-controls");
    expect(indoorRail).toHaveAttribute("style", outdoorPosition);
    expect(within(indoorRail).getByTestId("student-campus-view-mode-toggle")).toHaveAttribute("aria-label", "Switch to 3D view");
  });

  it("keeps the utility stack anchored while yielding its controls to Profile", () => {
    render(<StudentMapControls {...props({ profileOpen: true, onResetView: vi.fn() })} />);

    const stack = screen.getByTestId("student-map-utility-controls");
    expect(stack).toHaveClass("absolute", "right-3", "bottom-3", "md:bottom-6", "flex-col", "items-end");
    expect(stack).toHaveAttribute("data-anchor", "map-bottom-right");
    expect(stack).toHaveAttribute("data-profile-open", "true");
    expect(within(stack).getByTestId("student-map-recenter-button")).toBeInTheDocument();
  });

  it("selects a search result without submitting a form", () => {
    const onSelectSearchResult = vi.fn();
    render(
      <StudentMapControls
        {...props({ searchFocused: true, search: "sci", searchResults: [result], onSelectSearchResult })}
      />,
    );

    expect(screen.getByRole("button", { name: "All destinations" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Campus destination results" })).toHaveAttribute("data-map-layer", "transient");
    expect(screen.getByText("Building")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Science Hall/i }));
    expect(onSelectSearchResult).toHaveBeenCalledWith(result);
  });

  it("groups rooms under their buildings and shows only the app clear button", () => {
    const room = { ...result, id: "copy", name: "Copy Shop", kind: "room" as const, buildingName: "Science Hall", floorLabel: "Ground Floor" };
    const secondBuilding = { ...result, id: "arts", buildingId: "arts", name: "Arts Hall", code: "ART" };
    const secondRoom = { ...room, id: "studio", buildingId: "arts", buildingName: "Arts Hall", name: "Studio" };
    render(<StudentMapControls {...props({ searchFocused: true, search: "room", searchResults: [result, room, secondBuilding, secondRoom] })} />);

    const groups = screen.getAllByRole("group").filter((group) => group.getAttribute("aria-label")?.includes("Hall ("));
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByRole("option", { name: /Studio/i })).toBeInTheDocument();
    expect(within(groups[1]).getByRole("option", { name: /Copy Shop/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search campus map" })).toHaveAttribute("type", "text");
    expect(screen.getAllByRole("button", { name: "Clear map search" })).toHaveLength(1);
  });

  it("keeps results visible on Enter and selects only after explicit keyboard highlighting", () => {
    const onSelectSearchResult = vi.fn();
    render(<StudentMapControls {...props({ searchFocused: true, search: "SCI", searchResults: [result], onSelectSearchResult })} />);
    const input = screen.getByRole("searchbox", { name: "Search campus map" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("listbox", { name: "Campus destination results" })).toBeInTheDocument();
    expect(onSelectSearchResult).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectSearchResult).toHaveBeenCalledWith(result);
  });

  it("keeps search results open when focus moves within the search panel", () => {
    const onSearchBlur = vi.fn();
    render(
      <StudentMapControls
        {...props({ searchFocused: true, search: "sci", searchResults: [result], onSearchBlur })}
      />,
    );

    const searchbox = screen.getByRole("searchbox", { name: "Search campus map" });
    const clearButton = screen.getByRole("button", { name: "Clear map search" });
    fireEvent.blur(searchbox, { relatedTarget: clearButton });

    expect(onSearchBlur).not.toHaveBeenCalled();
    expect(screen.queryByTestId("student-map-utility-controls")).not.toBeInTheDocument();
  });

  it("shows the full index on focus and clears a stale type filter when typing", () => {
    const room = { ...result, id: "copy", name: "Copy Shop", kind: "room" as const };
    render(<StudentMapControls {...props({ searchFocused: true, searchResults: [result, room] })} />);
    expect(screen.getByRole("option", { name: /^Science Hall, Building/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Copy Shop/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Offices" }));
    expect(screen.queryByRole("option", { name: /Copy Shop/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search campus map" }), { target: { value: "copy" } });
    expect(screen.getByRole("button", { name: "All destinations" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("option", { name: /Copy Shop/i })).toBeInTheDocument();
  });
});
