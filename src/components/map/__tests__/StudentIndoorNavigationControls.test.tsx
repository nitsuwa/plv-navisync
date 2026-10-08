import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(card).toHaveAttribute("data-sheet-state", "default");
    expect(card).toHaveAttribute("data-map-layer", "room-sheet");
    expect(card).toHaveClass("fixed", "inset-x-3", "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]");
    expect(card.style.height).toBe("auto");
    expect(card).toHaveTextContent("Administration Office");
    expect(within(card).getByRole("heading", { name: "Administration Office" })).toHaveClass("line-clamp-2", "min-w-0");
    expect(card).toHaveTextContent(/Student Center Building\s*·\s*Floor 2/);
    expect(screen.getByTestId("student-room-floor-context")).toHaveClass("shrink-0", "whitespace-nowrap");
    expect(screen.getByRole("button", { name: "Directions" })).toHaveClass("bg-primary");
    const report = screen.getByRole("button", { name: "Report this room" });
    expect(report).toHaveClass("text-destructive", "border-destructive/30");
    fireEvent.click(report);
    expect(onReport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onStartHere).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "More place actions" })).not.toBeInTheDocument();
  });

  it("expands Room information and preserves it while the constrained Floor Picker takes focus", async () => {
    const props = {
      room,
      description: "Student Supreme Council room details.",
      onDirections: vi.fn(),
      onStartHere: vi.fn(),
      onReport: vi.fn(),
      onClose: vi.fn(),
      suspendedForFloorPicker: false,
    };
    const view = render(<StudentSelectedPlaceCard {...props} />);
    const card = screen.getByTestId("student-selected-place-card");
    const handle = screen.getByRole("button", { name: "Expand room information" });

    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "touch", clientY: 240 });
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: "touch", clientY: 180 });
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: "touch", clientY: 180 });
    await waitFor(() => expect(card).toHaveAttribute("data-sheet-state", "expanded"));
    expect(screen.getByTestId("student-room-sheet-details")).toHaveTextContent("Student Supreme Council room details.");
    expect(screen.getByRole("button", { name: "Directions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report this room" })).toBeInTheDocument();

    view.rerender(<StudentSelectedPlaceCard {...props} suspendedForFloorPicker />);
    await waitFor(() => expect(card).toHaveAttribute("data-sheet-state", "default"));
    view.rerender(<StudentSelectedPlaceCard {...props} />);
    await waitFor(() => expect(card).toHaveAttribute("data-sheet-state", "expanded"));
  });

  it("does not offer empty expansion for Rooms without additional details", () => {
    render(<StudentSelectedPlaceCard room={room} onDirections={vi.fn()} onStartHere={vi.fn()} onReport={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId("student-room-sheet-handle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /expand room information/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Directions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report this room" })).toBeInTheDocument();
  });

  it("uses the Room sheet keyboard handle when real details exist", () => {
    const globalKey = vi.fn();
    window.addEventListener("keydown", globalKey);
    try {
      render(<StudentSelectedPlaceCard room={room} description="Additional room details." onDirections={vi.fn()} onStartHere={vi.fn()} onReport={vi.fn()} onClose={vi.fn()} />);
      const handle = screen.getByRole("button", { name: "Expand room information" });
      fireEvent.keyDown(handle, { key: "ArrowUp" });
      expect(screen.getByTestId("student-selected-place-card")).toHaveAttribute("data-sheet-state", "expanded");
      expect(globalKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", globalKey);
    }
  });

  it("keeps the Floor chip in the top control lane and Room details in the bottom sheet lane", () => {
    render(
      <div data-testid="student-map-surface" className="relative h-[700px] w-[390px]">
        <StudentFloorPicker
          buildingName="Student Center Building"
          floors={[{ number: 1, label: "Ground Floor" }, { number: 2, label: "Floor 2" }]}
          activeFloor={1}
          onSelect={vi.fn()}
        />
        <StudentSelectedPlaceCard room={room} onDirections={vi.fn()} onStartHere={vi.fn()} onReport={vi.fn()} onClose={vi.fn()} />
      </div>,
    );

    expect(screen.getByTestId("student-floor-picker")).toHaveAttribute("data-dock", "floor-control-top");
    const card = screen.getByTestId("student-selected-place-card");
    expect(card).toHaveAttribute("data-map-layer", "room-sheet");
    expect(card.className).toContain("bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]");
    expect(card.className).not.toContain("student-map-room-card-top");
  });

});
