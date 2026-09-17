import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../../hooks/useCampusSearch";
import { CampusDestinationSearch } from "../CampusDestinationSearch";

function result(overrides: Partial<SearchResult> & Pick<SearchResult, "id" | "name" | "kind">): SearchResult {
  return {
    accessible: false,
    keywords: [overrides.name.toLowerCase()],
    ...overrides,
  };
}

const building = result({ id: "b1", name: "Science Hall", code: "SCI", kind: "building" });
const room = result({
  id: "r205",
  name: "Room 205",
  kind: "room",
  buildingId: "b1",
  buildingName: "Science Hall",
  floorNumber: 2,
  floorLabel: "Floor 2",
});

function props(overrides: Partial<React.ComponentProps<typeof CampusDestinationSearch>> = {}) {
  return {
    query: "",
    results: [building, room],
    focused: true,
    filter: "all" as const,
    placeholder: "Search buildings, rooms, offices...",
    ariaLabel: "Search campus destinations",
    onQueryChange: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    onFilterChange: vi.fn(),
    onSelect: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

describe("CampusDestinationSearch", () => {
  it("shows destination type and room building/floor context", () => {
    const onSelect = vi.fn();
    render(<CampusDestinationSearch {...props({ onSelect })} />);

    expect(screen.getByRole("searchbox", { name: "Search campus destinations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All destinations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buildings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rooms" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offices" })).toBeInTheDocument();
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("Room")).toBeInTheDocument();
    expect(screen.getByText("Science Hall · Floor 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /Room 205/ }));
    expect(onSelect).toHaveBeenCalledWith(room);
  });

  it("delegates filter, query, clear, focus, and Escape interactions", () => {
    const handlers = props({ focused: false });
    const view = render(<CampusDestinationSearch {...handlers} />);

    const searchbox = within(view.container).getByRole("searchbox", { name: "Search campus destinations" });
    fireEvent.focus(searchbox);
    expect(handlers.onFocus).toHaveBeenCalledOnce();
    fireEvent.change(searchbox, { target: { value: "room 205" } });
    expect(handlers.onQueryChange).toHaveBeenCalledWith("room 205");

    view.rerender(<CampusDestinationSearch {...props({ query: "room", onFilterChange: handlers.onFilterChange, onClear: handlers.onClear, onBlur: handlers.onBlur })} />);
    const focused = within(view.container);
    fireEvent.click(focused.getByRole("button", { name: "Rooms" }));
    expect(handlers.onFilterChange).toHaveBeenCalledWith("room");
    fireEvent.click(focused.getByRole("button", { name: "Clear search" }));
    expect(handlers.onClear).toHaveBeenCalledOnce();
    fireEvent.keyDown(focused.getByRole("searchbox", { name: "Search campus destinations" }), { key: "Escape" });
    expect(handlers.onBlur).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("keeps result scrolling inside the list", () => {
    const onMapWheel = vi.fn();
    render(
      <div onWheel={onMapWheel}>
        <CampusDestinationSearch {...props()} />
      </div>,
    );

    const list = screen.getByRole("listbox", { name: "Campus destination results" });
    fireEvent.wheel(list, { deltaY: 120 });
    fireEvent.touchMove(list, { touches: [{ clientY: 100 }] });
    expect(onMapWheel).not.toHaveBeenCalled();
  });
});
