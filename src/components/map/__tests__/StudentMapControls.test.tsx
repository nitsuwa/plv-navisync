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
  it("keeps search and the single useful route action in the floating controls", () => {
    render(<StudentMapControls {...props()} />);

    expect(screen.getByRole("searchbox", { name: "Search campus map" })).toBeInTheDocument();
    expect(screen.getByTestId("student-map-controls")).toHaveClass("map-layer-controls");
    expect(screen.getByTestId("student-map-search-panel").querySelector("[data-map-search-header='true']")).toBeInTheDocument();
    expect(screen.getByTestId("student-map-search-panel")).toHaveClass("right-16");
    expect(screen.getByRole("button", { name: "Open directions" })).toBeInTheDocument();
    expect(within(screen.getByTestId("student-map-utility-controls")).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Drop pin|Move dropped pin|Cancel drop pin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use my location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset map view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
  });

  it("keeps route modes and building shortcuts out of the search area", () => {
    render(<StudentMapControls {...props()} />);

    expect(screen.queryByTestId("student-map-quick-filters")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accessible routes|Emergency routes|All buildings/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("student-map-utility-controls").contains(screen.getByRole("button", { name: "Open directions" }))).toBe(true);
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
