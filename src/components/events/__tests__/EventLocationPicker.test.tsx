import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EventLocationRef } from "../../map-builder/types";
import { EventLocationPicker } from "../EventLocationPicker";

const buildings = [
  {
    buildingId: "science",
    buildingName: "Science Building",
    floors: [
      { number: 1, label: "Floor 1" },
      { number: 2, label: "Floor 2" },
    ],
  },
];

const multiBuildingOptions = [
  ...buildings,
  {
    buildingId: "engineering",
    buildingName: "Engineering Building",
    floors: [{ number: 1, label: "Ground Floor" }],
  },
];

describe("EventLocationPicker", () => {
  it("adds campus grounds and a building floor, then removes only the selected request", () => {
    let selected: EventLocationRef[] = [];
    const onChange = vi.fn((next: EventLocationRef[]) => {
      selected = next;
      view.rerender(<EventLocationPicker buildings={buildings} locations={selected} onChange={onChange} />);
    });
    const campus: EventLocationRef = { type: "campus", label: "Campus Grounds" };
    const view = render(<EventLocationPicker buildings={buildings} locations={selected} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    expect(onChange).toHaveBeenLastCalledWith([campus]);

    fireEvent.click(screen.getByRole("combobox", { name: /building/i }));
    fireEvent.click(screen.getByRole("option", { name: "Science Building" }));
    fireEvent.click(screen.getByRole("combobox", { name: /floor/i }));
    fireEvent.click(screen.getByRole("option", { name: "Floor 2" }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    expect(onChange).toHaveBeenLastCalledWith([
      campus,
      {
        type: "building",
        buildingId: "science",
        floorId: "science-f2",
        label: "Science Building — Floor 2",
      },
    ]);
  });

  it("prevents duplicate requests and has no proposal date controls", () => {
    const location: EventLocationRef = {
      type: "building",
      buildingId: "science",
      floorId: "science-f1",
      label: "Science Building — Floor 1",
    };
    const onChange = vi.fn();
    render(<EventLocationPicker buildings={buildings} locations={[location]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/start date|end date/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove science building/i }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("keeps campus and multiple floors/buildings as distinct grouped requests", () => {
    let selected: EventLocationRef[] = [];
    let view: ReturnType<typeof render>;
    const onChange = vi.fn((next: EventLocationRef[]) => {
      selected = next;
      view.rerender(<EventLocationPicker buildings={multiBuildingOptions} locations={selected} onChange={onChange} />);
    });
    view = render(<EventLocationPicker buildings={multiBuildingOptions} locations={selected} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /campus grounds/i }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    expect(screen.getByRole("combobox", { name: "Floor" })).toHaveTextContent("Floor 2");
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));
    expect(screen.getByRole("status")).toHaveTextContent("All published floors for Science Building are already requested.");

    fireEvent.click(screen.getByRole("combobox", { name: "Building" }));
    fireEvent.click(screen.getByRole("option", { name: "Engineering Building" }));
    fireEvent.click(screen.getByRole("button", { name: /add building location/i }));

    expect(selected).toEqual([
      { type: "campus", label: "Campus Grounds" },
      { type: "building", buildingId: "science", floorId: "science-f1", label: "Science Building — Floor 1" },
      { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Building — Floor 2" },
      { type: "building", buildingId: "engineering", floorId: "engineering-f1", label: "Engineering Building — Ground Floor" },
    ]);

    const scienceGroup = screen.getByRole("group", { name: "Science Building" });
    expect(within(scienceGroup).getByRole("button", { name: "Remove Science Building — Floor 1" })).toBeInTheDocument();
    expect(within(scienceGroup).getByRole("button", { name: "Remove Science Building — Floor 2" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Engineering Building" })).toBeInTheDocument();
    expect(screen.getByText("Selected (4)")).toBeInTheDocument();

    fireEvent.click(within(scienceGroup).getByRole("button", { name: "Remove Science Building — Floor 1" }));
    expect(selected).toHaveLength(3);
    expect(selected.some((location) => location.type === "building" && location.floorId === "science-f2")).toBe(true);
  });
});
