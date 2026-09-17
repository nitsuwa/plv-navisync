import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventFloorEditor } from "../EventFloorEditor";
import { EVENT_ASSET_DRAG_TYPE } from "../../canvas/CanvasAssetPalette";
import { eventLayoutDraftStorageKey } from "../../../lib/eventDraftPersistence";
import type { CampusEventOverlay, FloorPlan } from "../../map-builder/types";

const floorPlan: FloorPlan = {
  id: "science-f2",
  buildingId: "science",
  number: 2,
  label: "Floor 2",
  canvasW: 440,
  canvasH: 290,
  backgroundColor: "#f8f9fa",
  showGrid: true,
  gridSize: 20,
  rooms: [],
  paths: [],
  walls: [],
  doors: [],
  windows: [],
  furniture: [],
  stairs: [],
  ramps: [],
  elevators: [],
  labels: [],
};

const overlay: CampusEventOverlay = {
  id: "event-1",
  title: "Student Fair",
  description: "",
  organizer: "Council",
  markers: [],
  restrictedAreas: [],
  isActive: true,
  status: "pending",
  locationRef: { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Building — Floor 2" },
  eventFurniture: [],
  eventLabels: [],
};

const overlayWithChair: CampusEventOverlay = {
  ...overlay,
  eventFurniture: [{
    id: "chair-1",
    type: "chair",
    name: "Chair",
    category: "event",
    x: 24,
    y: 24,
    width: 24,
    height: 24,
    rotation: 0,
    color: "#0ea5e9",
    layer: "events",
  }],
};

afterEach(() => localStorage.clear());
beforeEach(() => localStorage.clear());

describe("EventFloorEditor", () => {
  it("keeps the published map review read-only", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        readOnly
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("Read-only review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save draft|submit to gso|delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Furniture" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset map view/i })).toBeInTheDocument();
    expect(screen.getByText("No event additions yet")).toBeInTheDocument();
  });

  it("renders the visual asset picker and supports Space pan from Select", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.click(within(canvas).getByRole("button", { name: /More assets/i }));
    expect(within(canvas).getByRole("option", { name: /Chair: Single chair/i })).toBeInTheDocument();
    expect(within(screen.getByTestId("event-furniture-chair-1")).queryByText("Chair")).not.toBeInTheDocument();

    const spaceDown = new KeyboardEvent("keydown", { code: "Space", key: " " });
    const preventDefault = vi.spyOn(spaceDown, "preventDefault");
    fireEvent(window, spaceDown);
    expect(preventDefault).toHaveBeenCalled();
    fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 115 });
    fireEvent.mouseUp(canvas);
    fireEvent.keyUp(window, { code: "Space", key: " " });

    expect(screen.getByTestId("event-furniture-chair-1")).toBeInTheDocument();
  });

  it("uses normal wheel input for bounded canvas pan and Ctrl/Cmd wheel for gradual zoom", () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 360,
      bottom: 240,
      width: 360,
      height: 240,
      toJSON: () => ({}),
    });

    render(
      <EventFloorEditor
        floorPlan={{ ...floorPlan, canvasW: 1200, canvasH: 800 }}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const content = screen.getByTestId("event-canvas-content");
    const initialTransform = content.getAttribute("style") || "";
    const initialScale = Number(initialTransform.match(/scale\(([^)]+)\)/)?.[1]);

    fireEvent.wheel(canvas, { deltaX: 0, deltaY: 100, deltaMode: 0, clientX: 180, clientY: 120 });
    const afterPan = content.getAttribute("style") || "";
    expect(afterPan).toContain(`scale(${initialScale})`);
    expect(afterPan).not.toBe(initialTransform);

    fireEvent.wheel(canvas, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true, clientX: 180, clientY: 120 });
    const afterZoom = content.getAttribute("style") || "";
    const afterZoomScale = Number(afterZoom.match(/scale\(([^)]+)\)/)?.[1]);
    expect(afterZoomScale).toBeGreaterThan(initialScale);
    expect(afterZoomScale).toBeLessThan(initialScale * 1.2);

    vi.restoreAllMocks();
    expect(originalRect).toBeDefined();
  });

  it("prevents browser page zoom for Ctrl/Cmd wheel on the map", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 360,
      bottom: 240,
      width: 360,
      height: 240,
      toJSON: () => ({}),
    });

    render(
      <EventFloorEditor
        floorPlan={{ ...floorPlan, canvasW: 1200, canvasH: 800 }}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const preventDefault = vi.spyOn(Event.prototype, "preventDefault");

    fireEvent.wheel(canvas, {
      deltaY: -100,
      ctrlKey: true,
      clientX: 180,
      clientY: 120,
    });

    expect(preventDefault).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("prevents browser page zoom when Ctrl/Cmd wheel starts over the asset picker", () => {
    vi.spyOn(Event.prototype, "preventDefault");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 720,
      bottom: 480,
      width: 720,
      height: 480,
      toJSON: () => ({}),
    });

    render(
      <EventFloorEditor
        floorPlan={{ ...floorPlan, canvasW: 1200, canvasH: 800 }}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.click(within(canvas).getByRole("button", { name: /More assets/i }));
    const catalog = within(canvas).getByRole("dialog", { name: "Choose an event item" });

    fireEvent.wheel(catalog, { deltaY: -100, ctrlKey: true, clientX: 160, clientY: 120 });

    expect(Event.prototype.preventDefault).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("fits the event map to the viewport with the 0 shortcut", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 360,
      bottom: 240,
      width: 360,
      height: 240,
      toJSON: () => ({}),
    });

    render(
      <EventFloorEditor
        floorPlan={{ ...floorPlan, canvasW: 1200, canvasH: 800 }}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const zoomed = screen.getByTestId("event-zoom-level").textContent;
    fireEvent.keyDown(window, { key: "0" });

    expect(screen.getByTestId("event-zoom-level").textContent).not.toBe(zoomed);
    vi.restoreAllMocks();
  });

  it("cancels an active rotate gesture when Escape is pressed", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);
    fireEvent.mouseDown(screen.getByTestId("event-furniture-rotate-handle"), { button: 0, clientX: 36, clientY: 15 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseMove(canvas, { clientX: 57, clientY: 36 });
    fireEvent.mouseUp(canvas);

    expect(item.style.transform).toContain("rotate(0deg)");
    expect(screen.queryByTestId("event-furniture-rotate-handle")).not.toBeInTheDocument();
  });

  it("keeps asset catalog scrolling inside the picker instead of panning the canvas", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 720,
      bottom: 480,
      width: 720,
      height: 480,
      toJSON: () => ({}),
    });

    render(
      <EventFloorEditor
        floorPlan={{ ...floorPlan, canvasW: 1200, canvasH: 800 }}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.click(within(canvas).getByRole("button", { name: /More assets/i }));
    const catalog = within(canvas).getByRole("dialog", { name: "Choose an event item" });
    const content = screen.getByTestId("event-canvas-content");
    const beforeScroll = content.getAttribute("style");

    fireEvent.wheel(catalog, { deltaX: 0, deltaY: 240, deltaMode: 0, clientX: 160, clientY: 120 });

    expect(content.getAttribute("style")).toBe(beforeScroll);
    vi.restoreAllMocks();
  });

  it("restores an unsaved layout draft after the editor is reloaded", () => {
    const restoredChair = {
      ...overlayWithChair.eventFurniture![0],
      x: 120,
      y: 84,
    };
    localStorage.setItem(eventLayoutDraftStorageKey("event-1", overlay.locationRef!), JSON.stringify({
      version: 1,
      overlayId: "event-1",
      locationKey: "science-science-f2",
      eventFurniture: [restoredChair],
      eventLabels: [],
      updatedAt: Date.now(),
    }));

    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("event-furniture-chair-1")).toBeInTheDocument();
    expect(screen.getByText("Recovered unsaved changes")).toBeInTheDocument();
  });

  it("autosaves changed layout items locally before a reload", async () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.click(within(canvas).getByRole("button", { name: "Chair" }));
    fireEvent.click(canvas, { clientX: 120, clientY: 100 });

    await waitFor(() => {
      const rawDraft = localStorage.getItem(eventLayoutDraftStorageKey("event-1", overlay.locationRef!));
      expect(rawDraft).not.toBeNull();
      expect(JSON.parse(rawDraft!).eventFurniture).toHaveLength(1);
    });
  });

  it("drags an existing item while Furniture mode is active without duplicating it", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    const initialLeft = item.style.left;

    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 96 });
    fireEvent.mouseUp(canvas);

    expect(screen.getAllByTestId(/^event-furniture-/).filter((node) => {
      const testId = node.getAttribute("data-testid") || "";
      return !testId.startsWith("event-furniture-resize-handle") && testId !== "event-furniture-rotate-handle";
    })).toHaveLength(1);
    expect(screen.getByTestId("event-furniture-chair-1").style.left).not.toBe(initialLeft);
  });

  it("keeps dragged furniture inside the event canvas", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseMove(canvas, { clientX: -100, clientY: -100 });
    expect(Number.parseFloat(item.style.left)).toBeGreaterThanOrEqual(0);

    fireEvent.mouseMove(canvas, { clientX: 999, clientY: 999 });
    expect(Number.parseFloat(item.style.left)).toBeLessThanOrEqual(416);
    expect(Number.parseFloat(item.style.top)).toBeLessThanOrEqual(266);
    fireEvent.mouseUp(canvas);
  });

  it("continues an item drag when the pointer leaves the canvas", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    const initialLeft = item.style.left;
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseLeave(canvas);
    fireEvent.mouseMove(window, { clientX: 120, clientY: 96 });
    fireEvent.mouseUp(window);

    expect(item.style.left).not.toBe(initialLeft);
  });

  it("resizes an existing item while Furniture mode is active", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);

    const resizeHandle = screen.getByTestId("event-furniture-resize-handle");
    const initialWidth = item.style.width;
    fireEvent.mouseDown(resizeHandle, { button: 0, clientX: 48, clientY: 48 });
    fireEvent.mouseMove(canvas, { clientX: 88, clientY: 88 });
    fireEvent.mouseUp(canvas);

    expect(item.style.width).not.toBe(initialWidth);
  });

  it("exposes a visible rotate action for a selected furniture item", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);

    const rotateButton = screen.getByRole("button", { name: "Rotate selected item" });
    expect(rotateButton).toBeInTheDocument();
    fireEvent.click(rotateButton);

    expect(item.style.transform).toContain("rotate(15deg)");
  });

  it("provides a Visio-style rotation handle and rotates from a direct drag", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);

    const rotateHandle = screen.getByTestId("event-furniture-rotate-handle");
    expect(rotateHandle).toHaveAttribute("aria-label", "Rotate Chair");

    fireEvent.mouseDown(rotateHandle, { button: 0, clientX: 36, clientY: 15 });
    fireEvent.mouseMove(canvas, { clientX: 57, clientY: 36 });
    fireEvent.mouseUp(canvas);

    expect(item.style.transform).toContain("rotate(90deg)");
  });

  it("provides eight resize handles for direct manipulation", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);

    expect(screen.getAllByTestId(/^event-furniture-resize-handle/)).toHaveLength(8);
  });

  it("snaps a dragged item to a nearby sibling edge and shows an alignment guide", () => {
    const target = { ...overlayWithChair.eventFurniture![0], id: "chair-2", x: 100 };
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={{ ...overlay, eventFurniture: [overlayWithChair.eventFurniture![0], target] }}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseMove(canvas, { clientX: 88, clientY: 36 });

    expect(screen.getByTestId("event-snap-guide-x")).toHaveStyle({ left: "100px" });
    expect(item.style.left).toBe("76px");
    fireEvent.mouseUp(canvas);
    expect(screen.queryByTestId("event-snap-guide-x")).not.toBeInTheDocument();
  });

  it("exposes a clear snapping toggle for beginner-friendly placement", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const snapToggle = screen.getByRole("button", { name: "Toggle snapping" });
    expect(snapToggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(snapToggle);
    expect(snapToggle).toHaveAttribute("aria-pressed", "false");
  });

  it("opens an item details inspector and updates its dimensions", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-1"), { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Open item details" }));

    const inspector = screen.getByRole("dialog", { name: "Item details" });
    const width = within(inspector).getByRole("spinbutton", { name: "Width" });
    fireEvent.change(width, { target: { value: "48" } });

    expect(width).toHaveValue(48);
    expect(screen.getByTestId("event-furniture-chair-1").style.width).toBe("48px");
  });

  it("locks a selected item and prevents accidental dragging", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);
    const initialLeft = item.style.left;

    fireEvent.click(screen.getByRole("button", { name: "Lock selected item" }));
    expect(screen.getByRole("button", { name: "Unlock selected item" })).toBeInTheDocument();
    expect(screen.queryByTestId("event-furniture-rotate-handle")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open item details" }));
    const inspector = screen.getByRole("dialog", { name: "Item details" });
    const width = within(inspector).getByRole("spinbutton", { name: "Width" });
    expect(width).toBeDisabled();
    fireEvent.change(width, { target: { value: "48" } });
    expect(item.style.width).not.toBe("48px");

    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseMove(canvas, { clientX: 180, clientY: 100 });
    fireEvent.mouseUp(canvas);
    expect(item.style.left).toBe(initialLeft);
    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.getByTestId("event-furniture-chair-1")).toBeInTheDocument();
  });

  it("groups selected items and moves the group together", () => {
    const chairs = [24, 100].map((x, index) => ({
      ...overlayWithChair.eventFurniture![0],
      id: `chair-${index + 1}`,
      x,
    }));
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={{ ...overlay, eventFurniture: chairs }}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const first = screen.getByTestId("event-furniture-chair-1");
    const second = screen.getByTestId("event-furniture-chair-2");
    fireEvent.mouseDown(first, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseDown(second, { button: 0, shiftKey: true, clientX: 112, clientY: 36 });
    fireEvent.click(screen.getByRole("button", { name: "Group selected items" }));

    const firstLeft = first.style.left;
    const secondLeft = second.style.left;
    fireEvent.mouseDown(first, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseMove(canvas, { clientX: 76, clientY: 36 });
    fireEvent.mouseUp(canvas);

    expect(Number.parseFloat(first.style.left)).toBeGreaterThan(Number.parseFloat(firstLeft));
    expect(Number.parseFloat(second.style.left)).toBeGreaterThan(Number.parseFloat(secondLeft));
  });

  it("duplicates an item when it is Alt-dragged", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const original = screen.getByTestId("event-furniture-chair-1");
    const originalLeft = original.style.left;
    fireEvent.mouseDown(original, { button: 0, altKey: true, clientX: 36, clientY: 36 });
    fireEvent.mouseMove(canvas, { clientX: 76, clientY: 76, altKey: true });
    fireEvent.mouseUp(canvas);

    const items = screen.getAllByTestId(/^event-furniture-/).filter((node) => {
      const testId = node.getAttribute("data-testid") || "";
      return !testId.startsWith("event-furniture-resize-handle") && testId !== "event-furniture-rotate-handle";
    });
    expect(items).toHaveLength(2);
    expect(original.style.left).toBe(originalLeft);
    expect(items.find((item) => item !== original)?.style.left).not.toBe(originalLeft);
  });

  it("supports visibility and layer controls from the item details inspector", () => {
    const chairs = [24, 100].map((x, index) => ({
      ...overlayWithChair.eventFurniture![0],
      id: `chair-${index + 1}`,
      x,
    }));
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={{ ...overlay, eventFurniture: chairs }}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const first = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(first, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Open item details" }));
    const inspector = screen.getByRole("dialog", { name: "Item details" });

    fireEvent.click(within(inspector).getByRole("button", { name: "Hide selected item" }));
    expect(screen.getByRole("button", { name: "Show selected item" })).toBeInTheDocument();
    expect(first.style.opacity).toBe("0.45");
    fireEvent.click(within(inspector).getByRole("button", { name: "Bring selected item to front" }));
    expect(Number(first.style.zIndex)).toBeGreaterThan(110);
  });

  it("renders malformed duplicate furniture IDs only once", () => {
    const duplicate = overlayWithChair.eventFurniture![0];
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={{ ...overlay, eventFurniture: [duplicate, { ...duplicate }] }}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("event-furniture-chair-1")).toHaveLength(1);
    expect(screen.getByText("1 furniture · 0 labels")).toBeInTheDocument();
  });

  it("keeps the single-selection action bubble outside the transformed map layer", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);

    const actions = screen.getByTestId("event-single-item-actions");
    expect(actions.parentElement).toBe(canvas);
    expect(actions.closest('[data-testid="event-canvas-content"]')).toBeNull();
  });

  it("keeps the asset dock over the canvas and supports repeated beginner placement", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    expect(within(canvas).getByTestId("event-asset-dock")).toBeInTheDocument();

    fireEvent.click(within(canvas).getByRole("button", { name: "Chair" }));
    fireEvent.click(canvas, { clientX: 120, clientY: 100 });
    fireEvent.click(canvas, { clientX: 180, clientY: 120 });

    expect(screen.getAllByTestId(/^event-furniture-/).filter((node) => {
      const testId = node.getAttribute("data-testid") || "";
      return !testId.startsWith("event-furniture-resize-handle") && testId !== "event-furniture-rotate-handle";
    })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Furniture$/ })).toHaveClass("bg-primary");
  });

  it("shows Arrange only for multiple selected furniture items", () => {
    const seededChairs = [20, 80, 140].map((x, index) => ({
      ...overlayWithChair.eventFurniture![0],
      id: `chair-${index + 1}`,
      x,
    }));
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={{ ...overlay, eventFurniture: seededChairs }}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Arrange selected items" })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-1"), { button: 0, clientX: 20, clientY: 20 });
    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-2"), { button: 0, shiftKey: true, clientX: 80, clientY: 20 });

    const arrange = screen.getByRole("button", { name: "Arrange selected items" });
    expect(arrange).toBeInTheDocument();
    expect(screen.getByTestId("event-layout-actions")).toHaveClass("absolute");
    expect(screen.getByTestId("event-layout-actions").firstElementChild).toHaveClass("flex-wrap");
    expect(screen.queryByRole("button", { name: "Align left" })).not.toBeInTheDocument();

    fireEvent.click(arrange);
    expect(screen.getByRole("button", { name: "Align left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeInTheDocument();
  });

  it("places a dragged recent asset at the canvas drop point", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    const chair = within(canvas).getByRole("button", { name: "Chair" });
    const dataTransfer = {
      types: [EVENT_ASSET_DRAG_TYPE, "text/plain"],
      getData: (type: string) => type === EVENT_ASSET_DRAG_TYPE ? "chair" : "chair",
      setData: vi.fn(),
      dropEffect: "none",
      effectAllowed: "all",
    };

    fireEvent.dragStart(chair, { dataTransfer });
    fireEvent.dragOver(canvas, { dataTransfer, clientX: 160, clientY: 120 });
    fireEvent.drop(canvas, { dataTransfer, clientX: 160, clientY: 120 });

    const placedItems = screen.getAllByTestId(/^event-furniture-/).filter((node) => {
      const testId = node.getAttribute("data-testid") || "";
      return !testId.startsWith("event-furniture-resize-handle") && testId !== "event-furniture-rotate-handle";
    });
    expect(placedItems).toHaveLength(1);
    expect(placedItems[0].getAttribute("style")).not.toContain("NaN");
  });
});
