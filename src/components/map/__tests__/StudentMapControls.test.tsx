import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentMapControls, type StudentMapControlsProps } from "../StudentMapControls";
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

describe("StudentMapControls", () => {
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
    expect(screen.getByTestId("student-map-controls")).toHaveClass("map-layer-controls");
    expect(screen.getByTestId("student-map-search-panel").querySelector("[data-map-search-header='true']")).toBeInTheDocument();
    expect(screen.getByTestId("student-map-search-panel")).toHaveClass("right-16");
    expect(screen.getByTestId("student-map-utility-controls")).toHaveClass("bottom-3", "md:bottom-6", "flex-col", "items-end");
    expect(screen.getByTestId("student-map-utility-controls")).toHaveStyle({ bottom: "var(--student-map-utility-bottom-inset, calc(0.75rem + env(safe-area-inset-bottom, 0px)))" });
    expect(screen.getByRole("button", { name: "Open directions" })).toBeInTheDocument();
    expect(within(screen.getByTestId("student-map-utility-controls")).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Drop pin|Move dropped pin|Cancel drop pin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use my location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset map view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
  });

  it("expands the focused mobile search into the profile-button space", () => {
    render(<StudentMapControls {...props({ searchFocused: true, search: "science", searchResults: [result] })} />);

    const panel = screen.getByTestId("student-map-search-panel");
    expect(panel).toHaveClass("right-2", "transition-[right]");
    expect(panel).not.toHaveClass("right-16");
    const results = screen.getByRole("listbox", { name: "Campus destination results" });
    expect(results.getAttribute("style")).toContain("100dvh");
    expect(results.getAttribute("style")).toContain("safe-area-inset-bottom");
  });

  it("reserves space for the notification bell beside the profile button", () => {
    render(<StudentMapControls {...props({ notificationBellVisible: true })} />);

    expect(screen.getByTestId("student-map-search-panel")).toHaveClass("right-32");
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

  it("aligns the single view-mode icon above the utility actions", () => {
    render(<StudentMapControls {...props({
      campusViewMode: "3d",
      campusViewToggleVisible: true,
      onToggleCampusViewMode: vi.fn(),
      onResetView: vi.fn(),
      onScanLocation: vi.fn(),
    })} />);
    const stack = screen.getByTestId("student-map-utility-controls");
    expect(stack.className).toContain("items-end");
    expect(stack.className).toContain("flex-col");
    expect(within(stack).getAllByRole("button")[0]).toHaveAttribute("aria-label", "Switch to 2D view");
    const actions = within(stack).getByTestId("student-map-utility-actions");
    expect(within(actions).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Recenter map", "Scan location QR", "Open directions",
    ]);
  });

  it("keeps the view-mode button reachable above route overlays while yielding other utility actions", () => {
    const onToggleCampusViewMode = vi.fn();
    const viewProps = props({ campusViewMode: "2d", campusViewToggleVisible: true, onToggleCampusViewMode });
    const { rerender } = render(<StudentMapControls {...viewProps} />);
    const toggle = screen.getByRole("button", { name: "Switch to 3D view" });
    expect(toggle).toHaveAttribute("data-testid", "student-campus-view-mode-toggle");
    expect(toggle).toHaveAttribute("data-dock", "map-control-bottom-right");
    expect(toggle).toHaveAttribute("title", "Switch to 3D");
    expect(toggle).toHaveClass("h-11", "w-11", "rounded-xl", "md:h-10", "md:w-10");
    expect(screen.getAllByTestId("student-campus-view-mode-toggle")).toHaveLength(1);
    expect(screen.getByTestId("student-map-utility-controls").firstElementChild?.contains(toggle)).toBe(true);
    fireEvent.click(toggle);
    expect(onToggleCampusViewMode).toHaveBeenCalledOnce();

    rerender(<StudentMapControls {...props({ ...viewProps, mapOverlayOpen: true })} />);
    const overlayStack = screen.getByTestId("student-map-utility-controls");
    expect(overlayStack).toHaveAttribute("data-map-overlay-open", "true");
    expect(screen.getByRole("button", { name: "Switch to 3D view" })).toBeInTheDocument();
    expect(overlayStack).toHaveClass("bottom-3", "md:bottom-6");
    expect(screen.queryByRole("button", { name: "Open directions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recenter map" })).not.toBeInTheDocument();
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

  it("keeps the indoor renderer toggle in the utility cluster above the exposed sheet area", () => {
    render(<StudentMapControls {...props({
      isFloorMode: true,
      mapOverlayOpen: true,
      campusViewMode: "3d",
      campusViewToggleVisible: true,
      onToggleCampusViewMode: vi.fn(),
    })} />);

    const stack = screen.getByTestId("student-map-utility-controls");
    expect(stack).toHaveAttribute("data-floor-mode", "true");
    expect(stack).toHaveAttribute("data-map-overlay-open", "true");
    expect(stack).toHaveClass("bottom-3", "md:bottom-6", "flex-col", "items-end");
    expect(within(stack).getByRole("button", { name: "Switch to 2D view" })).toBeInTheDocument();
  });

  it("docks only the view switch above compact Follow panels and below the indoor floor control", () => {
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

    const outdoorStack = screen.getByTestId("student-map-utility-controls");
    expect(outdoorStack).toHaveAttribute("data-navigation-active", "true");
    expect(outdoorStack).toHaveClass("bottom-3", "md:bottom-6", "flex-col", "items-end");
    expect(within(outdoorStack).getByTestId("student-campus-view-mode-toggle")).toHaveAttribute("aria-label", "Switch to 3D view");
    expect(screen.queryByRole("button", { name: "Recenter map" })).not.toBeInTheDocument();

    rerender(<StudentMapControls {...props({ ...shared, isFloorMode: true })} />);
    const indoorStack = screen.getByTestId("student-map-utility-controls");
    expect(indoorStack).toHaveAttribute("data-floor-mode", "true");
    expect(indoorStack).toHaveClass("bottom-3", "md:bottom-6");
    expect(within(indoorStack).getByTestId("student-campus-view-mode-toggle")).toHaveAttribute("aria-label", "Switch to 3D view");
  });

  it("keeps the utility stack anchored while yielding its controls to Profile", () => {
    render(<StudentMapControls {...props({ profileOpen: true, onResetView: vi.fn() })} />);

    const stack = screen.getByTestId("student-map-utility-controls");
    expect(stack).toHaveClass("absolute", "right-3", "bottom-3", "md:bottom-6", "flex-col", "items-end");
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

  it("locates an exact building name or code when Enter is pressed", () => {
    const onSelectSearchResult = vi.fn();
    render(<StudentMapControls {...props({ searchFocused: true, search: "SCI", searchResults: [result], onSelectSearchResult })} />);
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search campus map" }), { key: "Enter" });
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
