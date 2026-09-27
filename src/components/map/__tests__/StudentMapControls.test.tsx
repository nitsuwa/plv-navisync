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
  directionsMode: false,
  pinning: false,
  youAreHere: false,
  searchResults: [],
  onSearchChange: vi.fn(),
  onSearchFocus: vi.fn(),
  onSearchBlur: vi.fn(),
  onClearSearch: vi.fn(),
  onSelectSearchResult: vi.fn(),
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
