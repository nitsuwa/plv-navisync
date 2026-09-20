import { fireEvent, render, screen } from "@testing-library/react";
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

    fireEvent.change(screen.getByRole("combobox", { name: /building/i }), {
      target: { value: "science" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /floor/i }), {
      target: { value: "2" },
    });
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
});
