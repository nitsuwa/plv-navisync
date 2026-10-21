import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EventItemInspector } from "../EventItemInspector";
import { eventFurnitureFromTemplate, getEventFurnitureTemplate } from "../eventAssets";
const props = { isOpen: true, label: null, canvasWidth: 500, canvasHeight: 500, onClose: vi.fn(), onUpdateLabel: vi.fn(), onToggleFurnitureLock: vi.fn(), onToggleLabelLock: vi.fn(), onToggleVisibility: vi.fn(), onRotate: vi.fn(), onUpdateLayer: vi.fn(), onUngroup: vi.fn() };
describe("shared event item sizing inspector", () => {
  it("offers table dimensions and an explicit undoable reference reset", () => {
    const reset = vi.fn(), update = vi.fn();
    render(<EventItemInspector {...props} furniture={eventFurnitureFromTemplate(getEventFurnitureTemplate("table"), 50, 50, "table")} onUpdateFurniture={update} onResetSize={reset} />);
    const width = screen.getByRole("spinbutton", { name: "Width" });
    fireEvent.focus(width); fireEvent.change(width, { target: { value: "60" } }); fireEvent.blur(width);
    expect(update).toHaveBeenCalledWith({ width: 60 });
    fireEvent.click(screen.getByRole("button", { name: "Reset to standard size" }));
    expect(reset).toHaveBeenCalledOnce();
  });
  it("keeps chairs at reference variants and never exposes free resizing", () => {
    render(<EventItemInspector {...props} furniture={eventFurnitureFromTemplate(getEventFurnitureTemplate("chair"), 50, 50, "chair")} onUpdateFurniture={vi.fn()} onResetSize={vi.fn()} onSizePreset={vi.fn()} />);
    expect(screen.queryByRole("spinbutton", { name: "Width" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Size preset" })).toBeInTheDocument();
    expect(screen.getByText(/Reference size/)).toBeInTheDocument();
  });
});
