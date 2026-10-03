import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EventOverlayLocation } from "../../map-builder/types";
import { EventLocationSwitcher } from "../EventLocationSwitcher";

const locations: EventOverlayLocation[] = [
  { id: "campus", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [{ id: "1" } as never], eventLabels: [] },
  { id: "science-f2", locationRef: { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Building — Floor 2" }, eventFurniture: [], eventLabels: [{ id: "2" } as never] },
];

describe("EventLocationSwitcher", () => {
  it("shows each requested location and switches the focused canvas", () => {
    const onChange = vi.fn();
    render(<EventLocationSwitcher locations={locations} activeLocationId="campus" onChange={onChange} />);
    expect(screen.getByText("Campus Grounds")).toBeInTheDocument();
    expect(screen.getByText("Science Building — Floor 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /science building/i }));
    expect(onChange).toHaveBeenCalledWith("science-f2");
  });

  it("presents an admin-style location rail with context and switch affordances", () => {
    render(<EventLocationSwitcher locations={locations} activeLocationId="science-f2" onChange={vi.fn()} />);

    const rail = screen.getByRole("complementary", { name: /event locations/i });
    expect(rail).toBeInTheDocument();
    expect(within(rail).getByText("Building · Floor 2")).toBeInTheDocument();
    expect(within(rail).getByText("1 furniture · 0 labels")).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: /edit science building/i })).toHaveAttribute("aria-current", "page");
    expect(within(rail).getByText("Switch map")).toBeInTheDocument();
  });

  it("shows a compact mobile trigger and switches maps from the themed sheet", () => {
    const previous = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({ matches: query === "(min-width: 1024px)" ? false : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
    const onChange = vi.fn();
    render(<EventLocationSwitcher presentation="responsive" locations={locations} activeLocationId="campus" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /choose event location.*campus grounds/i })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /event locations/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /choose event location/i }));
    expect(screen.getByRole("dialog", { name: "Event locations" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Science Building — Floor 2" }));
    expect(onChange).toHaveBeenCalledWith("science-f2");
    expect(screen.queryByRole("dialog", { name: "Event locations" })).not.toBeInTheDocument();
    if (previous) Object.defineProperty(window, "matchMedia", { configurable: true, value: previous });
    else Reflect.deleteProperty(window, "matchMedia");
  });

  it("collapses the desktop rail without losing the location list", () => {
    const previous = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({ matches: query === "(min-width: 1024px)", media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
    render(<EventLocationSwitcher presentation="responsive" locations={locations} activeLocationId="science-f2" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse locations" }));
    expect(screen.queryByText("Science Building — Floor 2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Science Building — Floor 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Edit Campus Grounds" })).toBeEnabled();
    expect(document.querySelector(".writing-mode-vertical")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand locations" }));
    expect(screen.getByText("Science Building — Floor 2")).toBeInTheDocument();
    if (previous) Object.defineProperty(window, "matchMedia", { configurable: true, value: previous });
    else Reflect.deleteProperty(window, "matchMedia");
  });

  it("keeps a visible location-tour target while the desktop rail is collapsed", () => {
    const previous = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({ matches: query === "(min-width: 1024px)", media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
    render(<EventLocationSwitcher presentation="responsive" locations={locations} activeLocationId="science-f2" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse locations" }));
    const tourTarget = document.querySelector('[data-event-tour="locations"]');
    expect(tourTarget).toBe(screen.getByRole("button", { name: "Expand locations" }));

    if (previous) Object.defineProperty(window, "matchMedia", { configurable: true, value: previous });
    else Reflect.deleteProperty(window, "matchMedia");
  });
});
