import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { eventPreviewFixture } from "../../../test/eventFullPackFixtures";
import { EventMapPanel, type EventMapPanelProps } from "../EventMapPanel";

function props(overrides: Partial<EventMapPanelProps> = {}): EventMapPanelProps {
  return {
    open: true, loading: false, error: null, events: [eventPreviewFixture()], nowMs: Date.parse("2026-10-08T02:00:00Z"),
    filter: "all", selectedEventId: null, selectedLocationId: null, onClose: vi.fn(), onRetry: vi.fn(),
    onFilterChange: vi.fn(), onSelectEvent: vi.fn(), onViewLocation: vi.fn(), onBackToEvents: vi.fn(), ...overrides,
  };
}

describe("EventMapPanel", () => {
  it("keeps event details in the same nonmodal panel and lists all requested locations", () => {
    const event = eventPreviewFixture({ locations: [
      { id: "grounds", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] },
      { id: "floor-1", locationRef: { type: "building", buildingId: "b1", floorId: "b1-f1", label: "Library — Floor 1" }, eventFurniture: [], eventLabels: [] },
      { id: "floor-2", locationRef: { type: "building", buildingId: "b2", floorId: "b2-f2", label: "Gym — Floor 2" }, eventFurniture: [], eventLabels: [] },
    ] });
    const onSelectEvent = vi.fn();
    const view = render(<EventMapPanel {...props({ events: [event], onSelectEvent })} />);
    fireEvent.click(screen.getByRole("button", { name: /College Week/i }));
    expect(onSelectEvent).toHaveBeenCalledWith("event-a");
    view.rerender(<EventMapPanel {...props({ events: [event], selectedEventId: "event-a" })} />);
    expect(screen.getByRole("region", { name: /Campus events/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Back to events/i })).toHaveLength(1);
    expect(screen.getByText("Campus Grounds")).toBeInTheDocument();
    expect(screen.getByText("Library — Floor 1")).toBeInTheDocument();
    expect(screen.getByText("Gym — Floor 2")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Campus Grounds/i })).toHaveClass("min-h-12");
  });

  it("supports keyboard-operable filters and explicit empty states", () => {
    const onFilterChange = vi.fn();
    render(<EventMapPanel {...props({ events: [], onFilterChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(onFilterChange).toHaveBeenCalledWith("upcoming");
    expect(screen.getByText(/No published events/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Close campus events/i })).toBeInTheDocument();
  });

  it("shows retry after a feed error and does not expose a modal scrim", () => {
    const onRetry = vi.fn();
    render(<EventMapPanel {...props({ error: "Network unavailable", onRetry })} />);
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("region", { name: /Campus events/i })).not.toHaveAttribute("aria-modal");
  });
});
