import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("truncates a long building name independently from the always-visible floor label", () => {
    render(
      <StudentFloorPicker
        buildingName="COLLEGE OF ENGINEERING AND INFORMATION TECHNOLOGY"
        floors={[{ number: 1, label: "Ground Floor" }, { number: 3, label: "Floor 3" }]}
        activeFloor={3}
        onSelect={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Choose floor. Current floor: Floor 3" });
    const buildingLabel = within(trigger).getByTestId("student-floor-building-name");
    const floorLabel = within(trigger).getByTestId("student-floor-current-label");
    expect(buildingLabel).toHaveClass("min-w-0", "flex-1", "truncate");
    expect(buildingLabel).toHaveTextContent("COLLEGE OF ENGINEERING AND INFORMATION TECHNOLOGY");
    expect(floorLabel).toHaveClass("shrink-0", "whitespace-nowrap");
    expect(floorLabel).toHaveTextContent("Floor 3");
    expect(trigger.querySelectorAll("svg")).toHaveLength(2);
  });

  it("keeps Report directly visible with Directions as the primary room action", () => {
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
    expect(within(card).getByRole("heading", { name: "Administration Office" })).toHaveClass("line-clamp-2", "min-w-0");
    expect(card).toHaveTextContent("Student Center Building · Floor 2");
    expect(screen.getByRole("button", { name: "Directions" })).toHaveClass("bg-primary");
    const report = screen.getByRole("button", { name: "Report this room" });
    expect(report).toHaveClass("text-destructive", "border-destructive/30");
    fireEvent.click(report);
    expect(onReport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onStartHere).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "More place actions" })).not.toBeInTheDocument();
  });

  it("keeps the floor picker in its bottom-left dock and opens the menu above the control", () => {
    render(
      <StudentFloorPicker
        buildingName="Student Center Building"
        floors={[{ number: 1, label: "Ground Floor" }, { number: 2, label: "Floor 2" }]}
        activeFloor={1}
        onSelect={vi.fn()}
      />,
    );
    const picker = screen.getByTestId("student-floor-picker");
    expect(picker).toHaveAttribute("data-dock", "floor-control-bottom-left");
    expect(picker).toHaveClass("left-3", "bottom-4", "student-map-utility-control");
    fireEvent.click(screen.getByRole("button", { name: "Choose floor. Current floor: Ground Floor" }));
    const menu = screen.getByTestId("student-floor-picker-menu");
    expect(menu).toHaveClass("bottom-full");
    expect(menu.style.maxHeight).toContain("--student-map-floor-menu-max-height");
  });
});
