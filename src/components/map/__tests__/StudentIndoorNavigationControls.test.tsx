import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RoomDest } from "../../../lib/combinedPathfinding";
import { StudentFloorPicker } from "../StudentFloorPicker";
import { StudentSelectedPlaceCard } from "../StudentSelectedPlaceCard";

const room: RoomDest = {
  type: "room",
  buildingId: "student-center",
  floorNumber: 2,
  floorLabel: "Floor 2",
  roomId: "admin-office",
  roomName: "Administration Office",
  buildingLabel: "Student Center Building",
  buildingCode: "SC",
};

describe("student indoor navigation controls", () => {
  it("offers a compact, data-driven floor picker with keyboard selection", () => {
    const onSelect = vi.fn();
    render(
      <StudentFloorPicker
        buildingName="Student Center Building"
        floors={[{ number: 1, label: "Ground Floor" }, { number: 2, label: "Floor 2" }, { number: 4, label: "Floor 4" }]}
        activeFloor={2}
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Choose floor. Current floor: Floor 2" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const options = screen.getByRole("listbox", { name: "Floors in Student Center Building" });
    expect(options).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: /Floor 2/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("option", { name: /Floor 4/ }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("keeps reporting in the selected-room overflow while Directions stays primary", () => {
    const onDirections = vi.fn();
    const onStartHere = vi.fn();
    const onReport = vi.fn();
    render(
      <StudentSelectedPlaceCard
        room={room}
        onDirections={onDirections}
        onStartHere={onStartHere}
        onReport={onReport}
        onClose={vi.fn()}
      />,
    );

    const card = screen.getByTestId("student-selected-place-card");
    expect(card).toHaveTextContent("Administration Office");
    expect(card).toHaveTextContent("Student Center Building · Floor 2");
    expect(screen.getByRole("button", { name: /directions/i })).toHaveClass("bg-primary");
    expect(screen.queryByRole("button", { name: /Report/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More place actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Report a room issue" }));
    expect(onReport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onStartHere).toHaveBeenCalledOnce();
  });
});
