import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventSelectionOverlay } from "../EventSelectionOverlay";
import type { FloorFurniture } from "../../map-builder/types";

const chair: FloorFurniture = {
  id: "chair-1",
  type: "chair",
  name: "Chair 1",
  category: "event",
  x: 24,
  y: 36,
  width: 16,
  height: 16,
  rotation: 30,
  color: "#1d4ed8",
  layer: "events",
};

describe("EventSelectionOverlay", () => {
  it("draws a rotated outline over the artwork without a pointer-blocking layer", () => {
    render(
      <EventSelectionOverlay
        items={[chair]}
        selectedIds={[chair.id]}
        zoom={1}
        readOnly={false}
        panActive={false}
        onRotatePointerDown={vi.fn()}
      />,
    );

    const outline = screen.getByTestId("event-item-selection-chair-1");
    expect(outline).toHaveStyle({ left: "24px", top: "36px", width: "16px", height: "16px", transform: "rotate(30deg)" });
    expect(outline).toHaveClass("pointer-events-none", "border-primary");
    expect(screen.getByTestId("event-selection-overlay")).toHaveClass("z-[200]");
  });

  it("keeps the rotate control screen-sized at different zoom levels and routes the item", () => {
    const onRotatePointerDown = vi.fn();
    const { rerender } = render(
      <EventSelectionOverlay
        items={[chair]}
        selectedIds={[chair.id]}
        zoom={0.5}
        readOnly={false}
        panActive
        onRotatePointerDown={onRotatePointerDown}
      />,
    );

    const handle = screen.getByRole("button", { name: "Rotate Chair 1" });
    expect(handle).toHaveClass("h-11", "w-11", "pointer-events-auto", "cursor-grab");
    expect(handle).toHaveStyle({ transform: "translateX(-50%) scale(2)" });
    fireEvent.pointerDown(handle, { pointerId: 7, button: 0 });
    expect(onRotatePointerDown).toHaveBeenCalledWith(expect.objectContaining({ type: "pointerdown" }), chair);

    rerender(
      <EventSelectionOverlay
        items={[chair]}
        selectedIds={[chair.id]}
        zoom={2}
        readOnly={false}
        panActive={false}
        onRotatePointerDown={onRotatePointerDown}
      />,
    );
    expect(screen.getByRole("button", { name: "Rotate Chair 1" })).toHaveStyle({ transform: "translateX(-50%) scale(0.5)" });
  });

  it.each([
    ["read-only", { readOnly: true, locked: false }],
    ["locked", { readOnly: false, locked: true }],
  ])("hides rotation handles for %s items", (_label, { readOnly, locked }) => {
    render(
      <EventSelectionOverlay
        items={[{ ...chair, locked }]}
        selectedIds={[chair.id]}
        zoom={1}
        readOnly={readOnly}
        panActive={false}
        onRotatePointerDown={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Rotate/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("event-item-selection-chair-1")).toBeInTheDocument();
  });

  it("shows outlines for every selected item but one rotation affordance only for a single selection", () => {
    render(
      <EventSelectionOverlay
        items={[chair, { ...chair, id: "chair-2", name: "Chair 2", x: 80 }]}
        selectedIds={[chair.id, "chair-2"]}
        zoom={1}
        readOnly={false}
        panActive={false}
        onRotatePointerDown={vi.fn()}
      />,
    );
    expect(screen.getByTestId("event-item-selection-chair-1")).toBeInTheDocument();
    expect(screen.getByTestId("event-item-selection-chair-2")).toBeInTheDocument();
    expect(screen.queryByTestId("event-furniture-rotate-handle")).not.toBeInTheDocument();
  });
});
