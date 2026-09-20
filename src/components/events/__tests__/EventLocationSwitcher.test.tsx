import { fireEvent, render, screen } from "@testing-library/react";
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
});
