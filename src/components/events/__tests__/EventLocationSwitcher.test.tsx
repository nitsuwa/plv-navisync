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
});
