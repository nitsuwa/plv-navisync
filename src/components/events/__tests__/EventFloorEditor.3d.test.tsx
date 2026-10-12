import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventFloorEditor } from "../EventFloorEditor";
import type { CampusEventOverlay, FloorPlan } from "../../map-builder/types";

const floor: FloorPlan = { id: "f1", buildingId: "b1", number: 1, label: "Floor 1", canvasW: 440, canvasH: 290, gridSize: 20, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] };
const overlay: CampusEventOverlay = { id: "3d-test", title: "Fair", organizer: "Council", description: "", status: "draft", isActive: true, markers: [], restrictedAreas: [], locationRef: { type: "building", buildingId: "b1", floorId: "f1", label: "Floor 1" }, eventLabels: [], eventFurniture: [{ id: "chair", type: "chair", name: "Chair", category: "event", x: 24, y: 24, width: 24, height: 24, rotation: 0, color: "#0ea5e9", layer: "events" }] };
beforeEach(() => localStorage.clear());
describe("event editor 3D preview", () => {
  it("commits a pending label edit before showing its 3D label", async () => {
    render(<EventFloorEditor floorPlan={floor} overlay={{ ...overlay, eventLabels: [{ id: "sign", text: "Old sign", x: 100, y: 100, fontSize: 14, color: "#111", rotation: 0, align: "left" }] }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.doubleClick(screen.getByTestId("event-label-sign"));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit label text" }), { target: { value: "Welcome area" } });
    fireEvent.click(screen.getByRole("button", { name: /^3D layout$/ }));
    expect(await screen.findByRole("list", { name: "Event items in 3D preview" })).toHaveTextContent("Welcome area");
  });
  it("previews unsaved duplicates and preserves them across view switches without saving", async () => {
    const save = vi.fn().mockResolvedValue(undefined), submit = vi.fn();
    render(<EventFloorEditor floorPlan={floor} overlay={overlay} onSave={save} onSubmit={submit} onBack={vi.fn()} />);
    const chair = screen.getByTestId("event-furniture-chair");
    fireEvent.pointerDown(chair, { pointerId: 1, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: "touch", clientX: 36, clientY: 36 });
    fireEvent.click(screen.getAllByRole("button", { name: /^Duplicate selected item$/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^3D layout$/ }));
    const list = await screen.findByRole("list", { name: "Event items in 3D preview" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Undo$/ })).toBeEnabled();
    expect(save).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(screen.getByRole("button", { name: /^2D layout$/ }));
    expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toHaveLength(2);
  });
  it("supports compact read-only review and returns to 2D for feedback placement", async () => {
    const props = { floorPlan: floor, overlay: { ...overlay, status: "pending" as const }, readOnly: true, compactPreview: true, onSave: vi.fn(), onSubmit: vi.fn(), onBack: vi.fn() };
    const { rerender } = render(<EventFloorEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^3D preview$/ }));
    expect(await screen.findByRole("region", { name: "Event 3D preview" })).toBeInTheDocument();
    rerender(<EventFloorEditor {...props} onFeedbackPoint={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^2D layout$/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /^3D preview$/ })).toBeDisabled();
    expect(screen.getByLabelText("Event layout canvas")).toBeVisible();
  });
  it("offers return to 2D on an unsupported device without losing the layout", async () => {
    render(<EventFloorEditor floorPlan={floor} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^3D layout$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Return to 2D" }));
    expect(screen.getByTestId("event-furniture-chair")).toBeVisible();
  });
});
