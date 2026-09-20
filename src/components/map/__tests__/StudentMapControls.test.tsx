import { fireEvent, render, screen } from "@testing-library/react";
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
  mapMode: "standard",
  directionsMode: false,
  pinning: false,
  youAreHere: false,
  buildings: [building],
  searchResults: [],
  recentSearches: [],
  onSearchChange: vi.fn(),
  onSearchFocus: vi.fn(),
  onSearchBlur: vi.fn(),
  onClearSearch: vi.fn(),
  onSelectSearchResult: vi.fn(),
  onClearRecentSearches: vi.fn(),
  onSelectBuilding: vi.fn(),
  onMapModeChange: vi.fn(),
  onOpenDirections: vi.fn(),
  onTogglePin: vi.fn(),
  onResetView: vi.fn(),
  ...overrides,
});

describe("StudentMapControls", () => {
  it("keeps the primary search, directions, and map actions named", () => {
    render(<StudentMapControls {...props()} />);

    expect(screen.getByRole("searchbox", { name: "Search campus map" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open directions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drop pin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset map view" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use my location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
  });

  it("starts manual pin mode when Drop pin is pressed", () => {
    const onTogglePin = vi.fn();
    render(<StudentMapControls {...props({ onTogglePin })} />);

    fireEvent.click(screen.getByRole("button", { name: "Drop pin" }));

    expect(onTogglePin).toHaveBeenCalledOnce();
  });

  it("lets users move an existing pin", () => {
    const onTogglePin = vi.fn();
    render(<StudentMapControls {...props({ youAreHere: true, onTogglePin })} />);

    fireEvent.click(screen.getByRole("button", { name: "Move dropped pin" }));

    expect(onTogglePin).toHaveBeenCalledOnce();
  });

  it("exposes map modes as a single pressed filter group", () => {
    render(<StudentMapControls {...props({ mapMode: "accessible" })} />);

    expect(screen.getByRole("button", { name: /Accessible routes/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /All buildings/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects a search result without submitting a form", () => {
    const onSelectSearchResult = vi.fn();
    render(
      <StudentMapControls
        {...props({ searchFocused: true, search: "sci", searchResults: [result], onSelectSearchResult })}
      />,
    );

    expect(screen.getByRole("button", { name: "All destinations" })).toBeInTheDocument();
    expect(screen.getByText("Building")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Science Hall/i }));
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
  });
});
