import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampusEventOverlay, FloorPlan } from "../../map-builder/types";
import type { Event3DEditing, Event3DLayout } from "../../../lib/event3dEditing";
import { EventFloorEditor } from "../EventFloorEditor";

// jsdom cannot render WebGL. Only replace the graphics surface; the actual
// editor controls, validation, history, data and save callbacks remain real.
vi.mock("../EventLayout3DPreview", () => ({
  EventLayout3DPreview: ({ furniture, labels, editing, editorTools }: { furniture: Event3DLayout["furniture"]; labels: Event3DLayout["labels"]; editing?: Event3DEditing; editorTools?: React.ReactNode }) => <section aria-label="3D test surface">
    {editorTools}
    <button onClick={() => editing?.onSelect("chair")}>Select chair on 3D map</button>
    <button onClick={() => editing?.onPlacementPoint({ x: 200, y: 160 })}>Pick 3D placement point</button>
    <button onClick={() => editing?.onCommit({ furniture, labels }, { furniture: furniture.map(item => item.id === "chair" ? { ...item, x: 80, y: 90 } : item), labels })}>Finish 3D drag</button>
    <button onClick={() => editing?.onBusyChange(true)}>Begin 3D drag</button>
    <button onClick={() => editing?.onBusyChange(false)}>Cancel 3D drag</button>
    <output>{furniture.map(item => `${item.id}:${item.x},${item.y}`).join(";")}</output>
    <span>{editing ? "Editing callbacks available" : "Read-only scene"}</span>
  </section>,
}));
const floor: FloorPlan = { id: "f1", buildingId: "b1", number: 1, label: "Floor 1", canvasW: 440, canvasH: 290, gridSize: 20, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] };
const overlay: CampusEventOverlay = { id: "edit-3d-test", title: "Fair", organizer: "Council", description: "", status: "draft", isActive: true, markers: [], restrictedAreas: [], locationRef: { type: "building", buildingId: "b1", floorId: "f1", label: "Floor 1" }, eventLabels: [], eventFurniture: [{ id: "chair", type: "chair", name: "Chair", category: "event", x: 24, y: 24, width: 24, height: 24, rotation: 0, color: "#0ea5e9", layer: "events" }] };
beforeEach(() => localStorage.clear());
function setup(event: CampusEventOverlay = overlay, readOnly = false, map: FloorPlan = floor) {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<EventFloorEditor floorPlan={map} overlay={event} readOnly={readOnly} onSave={save} onSubmit={vi.fn()} onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: readOnly ? /^3D preview$/ : /^3D layout$/ }));
  return save;
}
function updateNumber(name: string, value: string) {
  const input = screen.getByRole("spinbutton", { name });
  fireEvent.focus(input); fireEvent.change(input, { target: { value } }); fireEvent.blur(input);
}
describe("direct 3D event editor integration", () => {
  it("offers searchable illustrated assets with keyboard focus returning to the picker", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add item in 3D" }));
    const search = screen.getByRole("searchbox", { name: "Search event assets" });
    fireEvent.change(search, { target: { value: "chair" } });
    expect(screen.queryByRole("button", { name: "Choose Tent" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose Chair" }));
    expect(screen.queryByRole("dialog", { name: "Choose event asset" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose 3D event asset" })).toHaveTextContent("Chair");
  });
  it("saves completed 3D geometry through the real editor and reflects it in 2D", async () => {
    const save = setup({ ...overlay, eventFurniture: [{ ...overlay.eventFurniture![0], type: "table", name: "Table" }] });
    fireEvent.click(screen.getByRole("button", { name: "Select chair on 3D map" }));
    fireEvent.click(screen.getByRole("button", { name: "Item details in 3D" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Lock proportions" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    updateNumber("Rotation in 3D", "90"); updateNumber("Width in 3D", "32"); updateNumber("Depth in 3D", "24"); updateNumber("X in 3D", "120");
    if (screen.queryByRole("dialog", { name: "Item details" })) fireEvent.click(screen.getByRole("button", { name: "Close item details" }));
    fireEvent.click(screen.getByRole("button", { name: /^2D layout$/ }));
    expect(screen.getByTestId("event-furniture-chair")).toHaveStyle({ left: "120px", width: "32px", transform: "rotate(90deg)" });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0][0]).toMatchObject({ x: 120, width: 32, height: 24, rotation: 90 });
  });
  it("records a completed scene move as one undoable step across views", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Finish 3D drag" }));
    fireEvent.click(screen.getByRole("button", { name: /^Undo$/ }));
    expect(screen.getByText("chair:24,24")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Redo$/ }));
    expect(screen.getByText("chair:80,90")).toBeInTheDocument();
    if (screen.queryByRole("dialog", { name: "Item details" })) fireEvent.click(screen.getByRole("button", { name: "Close item details" }));
    fireEvent.click(screen.getByRole("button", { name: /^2D layout$/ }));
    expect(screen.getByTestId("event-furniture-chair")).toHaveStyle({ left: "80px", top: "90px" });
  });
  it("explicitly places the chosen event asset at the selected 3D map point", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add item in 3D" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose Tent" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick 3D placement point" }));
    fireEvent.click(screen.getByRole("button", { name: "Place here in 3D" }));
    if (screen.queryByRole("dialog", { name: "Item details" })) fireEvent.click(screen.getByRole("button", { name: "Close item details" }));
    fireEvent.click(screen.getByRole("button", { name: /^2D layout$/ }));
    const items = screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveStyle({ left: "140px", top: "100px", width: "120px", height: "120px" });
  });
  it("blocks saves and history while a gesture is pending and restores them on cancel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Begin 3D drag" }));
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review & submit" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel 3D drag" }));
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
    expect(screen.getByText("chair:24,24")).toBeInTheDocument();
  });
  it("never changes locked event items through scene callbacks", () => {
    setup({ ...overlay, eventFurniture: [{ ...overlay.eventFurniture![0], locked: true }] });
    fireEvent.click(screen.getByRole("button", { name: "Finish 3D drag" }));
    expect(screen.getByText("chair:24,24")).toBeInTheDocument();
  });
  it("does not provide editing controls or callbacks to admin review", () => {
    setup({ ...overlay, status: "pending" }, true);
    expect(screen.getByText("Read-only scene")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add item in 3D" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
  });
  it("cancels a pending numeric edit with Escape", () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Select chair on 3D map" }));
    fireEvent.click(screen.getByRole("button", { name: "Item details in 3D" }));
    const input = screen.getByRole("spinbutton", { name: "Rotation in 3D" });
    act(() => input.focus()); fireEvent.change(input, { target: { value: "90" } });
    fireEvent.keyDown(input, { key: "Escape" }); fireEvent.blur(input);
    if (screen.queryByRole("dialog", { name: "Item details" })) fireEvent.click(screen.getByRole("button", { name: "Close item details" }));
    fireEvent.click(screen.getByRole("button", { name: /^2D layout$/ }));
    expect(screen.getByTestId("event-furniture-chair")).toHaveStyle({ transform: "rotate(0deg)" });
  });
  it("edits label text, size and color in 3D and preserves them on save", async () => {
    const save = setup({ ...overlay, eventLabels: [{ id: "label", text: "Welcome", x: 40, y: 80, fontSize: 14, color: "#111111", rotation: 0 }] });
    fireEvent.change(screen.getByRole("combobox", { name: "Selected 3D item" }), { target: { value: "label" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Label text in 3D" }), { target: { value: "Check-in area" } });
    updateNumber("Font size in 3D", "18");
    fireEvent.change(screen.getByLabelText("Label color in 3D"), { target: { value: "#00aa00" } });
    if (screen.queryByRole("dialog", { name: "Item details" })) fireEvent.click(screen.getByRole("button", { name: "Close item details" }));
    fireEvent.click(screen.getByRole("button", { name: /^2D layout$/ }));
    expect(screen.getByTestId("event-label-label")).toHaveStyle({ fontSize: "18px", color: "#00aa00" });
    expect(screen.getByTestId("event-label-label")).toHaveTextContent("Check-in area");
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1][0]).toMatchObject({ text: "Check-in area", fontSize: 18, color: "#00aa00" });
  });
  it("rejects a scene move onto a protected base-map entrance", () => {
    setup(overlay, false, { ...floor, doors: [{ id: "exit", x: 92, y: 102, width: 24, wallId: "wall", direction: "left", color: "#b45309" }] });
    fireEvent.click(screen.getByRole("button", { name: "Finish 3D drag" }));
    expect(screen.getByText("chair:24,24")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some(status => /entrance/.test(status.textContent || ""))).toBe(true);
  });
});
