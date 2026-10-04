import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventFloorEditor } from "../EventFloorEditor";
import { EVENT_ASSET_DRAG_TYPE } from "../../canvas/CanvasAssetPalette";
import { eventLayoutDraftStorageKey, readEventLayoutDraft } from "../../../lib/eventDraftPersistence";
import * as eventValidation from "../../../lib/eventLayoutValidation";
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

const overlayWithLabel: CampusEventOverlay = {
  ...overlay,
  eventLabels: [{
    id: "label-1",
    x: 48,
    y: 48,
    text: "Welcome desk",
    fontSize: 14,
    color: "#1f2937",
    rotation: 0,
    align: "left",
  }],
};

function installPointerCaptureRegistry() {
  const captures = new WeakMap<Element, Set<number>>();
  const originalSet = Element.prototype.setPointerCapture;
  const originalHas = Element.prototype.hasPointerCapture;
  const originalRelease = Element.prototype.releasePointerCapture;
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value(this: Element, pointerId: number) {
      const ids = captures.get(this) ?? new Set<number>();
      ids.add(pointerId);
      captures.set(this, ids);
    },
  });
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    configurable: true,
    value(this: Element, pointerId: number) {
      return captures.get(this)?.has(pointerId) ?? false;
    },
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    value(this: Element, pointerId: number) {
      const ids = captures.get(this);
      if (!ids?.delete(pointerId)) return;
      const event = new Event("lostpointercapture", { bubbles: true });
      Object.defineProperty(event, "pointerId", { configurable: true, value: pointerId });
      this.dispatchEvent(event);
    },
  });
  return {
    owner(pointerId: number) {
      for (const element of [document.body, document.documentElement, ...Array.from(document.querySelectorAll("*"))]) {
        if (captures.get(element)?.has(pointerId)) return element;
      }
      return null;
    },
    emitLost(pointerId: number) {
      const element = this.owner(pointerId);
      if (!element) return;
      const ids = captures.get(element);
      ids?.delete(pointerId);
      const event = new Event("lostpointercapture", { bubbles: true });
      Object.defineProperty(event, "pointerId", { configurable: true, value: pointerId });
      element.dispatchEvent(event);
    },
    emitStaleLost(pointerId: number) {
      const element = this.owner(pointerId);
      if (!element) return;
      const event = new Event("lostpointercapture", { bubbles: true });
      Object.defineProperty(event, "pointerId", { configurable: true, value: pointerId });
      element.dispatchEvent(event);
    },
    restore() {
      if (originalSet) Object.defineProperty(Element.prototype, "setPointerCapture", { configurable: true, value: originalSet });
      else delete (Element.prototype as unknown as Partial<Record<string, unknown>>).setPointerCapture;
      if (originalHas) Object.defineProperty(Element.prototype, "hasPointerCapture", { configurable: true, value: originalHas });
      else delete (Element.prototype as unknown as Partial<Record<string, unknown>>).hasPointerCapture;
      if (originalRelease) Object.defineProperty(Element.prototype, "releasePointerCapture", { configurable: true, value: originalRelease });
      else delete (Element.prototype as unknown as Partial<Record<string, unknown>>).releasePointerCapture;
    },
  };
}

const fireEventCompat = fireEvent as unknown as {
  mouseDown: typeof fireEvent.mouseDown;
  mouseMove: typeof fireEvent.mouseMove;
  mouseUp: typeof fireEvent.mouseUp;
  mouseLeave: typeof fireEvent.mouseLeave;
};
const originalMouseDown = fireEventCompat.mouseDown;
const originalMouseMove = fireEventCompat.mouseMove;
const originalMouseUp = fireEventCompat.mouseUp;
const originalMouseLeave = fireEventCompat.mouseLeave;
type CompatibilityMouseInit = MouseEventInit & { shiftKey?: boolean };
let compatibilityPointerId = 1000;
let activeCompatibilityPointerId: number | null = null;
let activeCompatibilityPointerPosition = { clientX: 0, clientY: 0 };
let restoreInspectorMatchMedia: (() => void) | null = null;

function setInspectorViewport(isMobile: boolean) {
  const previous = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: ["(max-width: 1279px)", "(max-width: 1023px)"].includes(query) ? isMobile : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia,
  });
  restoreInspectorMatchMedia = () => {
    if (previous) Object.defineProperty(window, "matchMedia", { configurable: true, value: previous });
    else Reflect.deleteProperty(window, "matchMedia");
  };
}

beforeEach(() => {
  localStorage.clear();
  fireEventCompat.mouseDown = ((element, init: CompatibilityMouseInit = {}) => {
    if (activeCompatibilityPointerId !== null) {
      fireEvent.pointerUp(window, { pointerId: activeCompatibilityPointerId, pointerType: "mouse", clientX: 0, clientY: 0 });
    }
    activeCompatibilityPointerId = compatibilityPointerId++;
    activeCompatibilityPointerPosition = {
      clientX: init?.clientX ?? 0,
      clientY: init?.clientY ?? 0,
    };
    return fireEvent.pointerDown(element, {
      ...init,
      pointerId: activeCompatibilityPointerId,
      pointerType: "mouse",
      button: init?.button ?? 0,
    });
  }) as typeof fireEvent.mouseDown;
  fireEventCompat.mouseMove = ((element, init: CompatibilityMouseInit = {}) => {
    activeCompatibilityPointerPosition = {
      clientX: init?.clientX ?? activeCompatibilityPointerPosition.clientX,
      clientY: init?.clientY ?? activeCompatibilityPointerPosition.clientY,
    };
    return fireEvent.pointerMove(element, {
    ...init,
    pointerId: activeCompatibilityPointerId ?? 0,
    pointerType: "mouse",
    });
  }) as typeof fireEvent.mouseMove;
  fireEventCompat.mouseUp = ((element, init: CompatibilityMouseInit = {}) => {
    const pointerId = activeCompatibilityPointerId ?? 0;
    activeCompatibilityPointerId = null;
    return fireEvent.pointerUp(element, {
      ...init,
      clientX: init?.clientX ?? activeCompatibilityPointerPosition.clientX,
      clientY: init?.clientY ?? activeCompatibilityPointerPosition.clientY,
      pointerId,
      pointerType: "mouse",
    });
  }) as typeof fireEvent.mouseUp;
  fireEventCompat.mouseLeave = (() => true) as typeof fireEvent.mouseLeave;
});

afterEach(() => {
  restoreInspectorMatchMedia?.();
  restoreInspectorMatchMedia = null;
  fireEventCompat.mouseDown = originalMouseDown;
  fireEventCompat.mouseMove = originalMouseMove;
  fireEventCompat.mouseUp = originalMouseUp;
  fireEventCompat.mouseLeave = originalMouseLeave;
  activeCompatibilityPointerId = null;
  activeCompatibilityPointerPosition = { clientX: 0, clientY: 0 };
  localStorage.clear();
});

describe("EventFloorEditor", () => {
  it.each(["chair", "layout"])("warns and refuses %s placement on a campus building footprint", (mode) => {
    const campusFloor = { ...floorPlan, id: "campus", rooms: [{ id: "hall", name: "Student Hall", type: "building", x: 100, y: 70, w: 260, h: 160, floorId: "campus", buildingId: "campus", color: "orange" }] };
    render(<EventFloorEditor floorPlan={campusFloor} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    if (mode === "layout") {
      fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
      fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));
    } else fireEvent.click(screen.getByRole("button", { name: "Chair" }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.click(canvas, { clientX: 220, clientY: 145 });
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(0);
    expect(screen.getAllByRole("alert").some(alert => alert.textContent?.includes("overlaps building Student Hall"))).toBe(true);
  });

  it("renders a visible draft pin before saving and hides the duplicate preview header", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} compactPreview readOnly draftFeedbackPoint={{ x: 50, y: 60 }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText("Unsaved feedback pin position")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to My Events" })).not.toBeInTheDocument();
  });
  it("provides a working Pan toggle and shortcut guide in read-only mode", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} readOnly onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const pan = screen.getByRole("button", { name: "Pan map" });
    expect(pan).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(pan);
    expect(pan).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
  });
  it("can focus event furniture in a read-only preview without selection", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} readOnly onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Focus event items" })).toBeEnabled();
  });
  it("prevents map wheel gestures from scrolling an enclosing preview", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} readOnly onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const wheel = new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true });
    screen.getByLabelText("Event layout canvas").dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
  });
  it("shows map feedback without modifying furniture in read-only mode", () => {
    const save = vi.fn();
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} readOnly feedbackPins={[{ id: "pin", x: 50, y: 60, comment: "Move booth" }]} onSave={save} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Feedback pin 1: Move booth" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Feedback pin 1: Move booth" }));
    expect(save).not.toHaveBeenCalled();
  });
  it("offers saving an updated submission while an event is pending", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Review & update GSO" })).toBeEnabled();
  });

  it("shows advisory alignment and spacing only while a single asset is dragged", () => {
    const twoChairs = { ...overlayWithChair, eventFurniture: [...overlayWithChair.eventFurniture!, { ...overlayWithChair.eventFurniture![0], id: "chair-2", y: 100 }] };
    render(<EventFloorEditor floorPlan={floorPlan} overlay={twoChairs} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByTestId("event-placement-guides")).not.toBeInTheDocument();
    fireEventCompat.mouseDown(screen.getByTestId("event-furniture-chair-1"), { clientX: 36, clientY: 36 });
    expect(screen.getByTestId("event-placement-guides")).toHaveClass("pointer-events-none");
    expect(screen.getByTestId("event-alignment-guide-x")).toBeInTheDocument();
    expect(screen.getByText("52 map units")).toBeInTheDocument();
    fireEventCompat.mouseUp(window);
    expect(screen.queryByTestId("event-placement-guides")).not.toBeInTheDocument();
  });
  it("keeps physical asset sizes fixed while preserving saved legacy dimensions", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);
    expect(screen.queryAllByTestId(/^event-furniture-resize-handle/)).toHaveLength(0);
    expect(item.style.width).toBe("24px");
    expect(screen.getByTestId("event-furniture-rotate-handle")).toBeInTheDocument();
  });

  it("marquee-selects event items from blank canvas and exposes shared bulk actions", () => {
    setInspectorViewport(false);
    const chairs = [20, 80, 200].map((x, index) => ({
      ...overlayWithChair.eventFurniture![0], id: `chair-${index + 1}`, x,
    }));
    render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlay, eventFurniture: chairs }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.pointerDown(canvas, { pointerId: 501, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 501, pointerType: "mouse", clientX: 115, clientY: 65 });
    expect(screen.getByTestId("event-selection-marquee")).toBeInTheDocument();
    fireEvent.pointerUp(window, { pointerId: 501, pointerType: "mouse", clientX: 115, clientY: 65 });

    expect(screen.getByText("2 items selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arrange selected items" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate selected items" })).toBeInTheDocument();
    expect(screen.getByTestId("event-furniture-chair-3")).not.toHaveClass("border-primary");
  });

  it("toggles already selected items with a Shift marquee", () => {
    const chairs = [20, 80].map((x, index) => ({ ...overlayWithChair.eventFurniture![0], id: `chair-${index + 1}`, x }));
    render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlay, eventFurniture: chairs }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.pointerDown(canvas, { pointerId: 510, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 510, pointerType: "mouse", clientX: 115, clientY: 65 });
    fireEvent.pointerUp(window, { pointerId: 510, pointerType: "mouse", clientX: 115, clientY: 65 });
    fireEvent.pointerDown(canvas, { pointerId: 511, pointerType: "mouse", button: 0, shiftKey: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 511, pointerType: "mouse", shiftKey: true, clientX: 52, clientY: 65 });
    fireEvent.pointerUp(window, { pointerId: 511, pointerType: "mouse", shiftKey: true, clientX: 52, clientY: 65 });
    expect(screen.getByTestId("event-furniture-chair-1")).not.toHaveClass("border-primary");
    expect(screen.getByTestId("event-item-selection-chair-2")).toHaveClass("border-primary");
  });

  it("offers shared bulk actions when a marquee includes furniture and a label", () => {
    setInspectorViewport(false);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlayWithChair, eventLabels: overlayWithLabel.eventLabels }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.pointerDown(canvas, { pointerId: 502, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 502, pointerType: "mouse", clientX: 160, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 502, pointerType: "mouse", clientX: 160, clientY: 100 });
    expect(screen.getByText("2 items selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate selected items" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrange selected items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rotate selected items" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("event-item-inspector-rail")).not.toBeInTheDocument();
  });

  it("arms a preset preview before creating its furniture", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));

    expect(screen.getByTestId("event-preset-preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(0);
    expect(screen.getByRole("spinbutton", { name: "Preset item count" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Preset item count" }), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Chairs per row" }), { target: { value: "4" } });
    fireEvent.click(screen.getByLabelText("Event layout canvas"), { clientX: 125, clientY: 110 });
    expect(screen.queryByTestId("event-preset-preview")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(4);
  });

  it("previews 12 fixed-size chairs in rows of five and places the exact 5/5/2 batch", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Preset item count" }), { target: { value: "12" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Chairs per row" }), { target: { value: "5" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Column gap" }), { target: { value: "18" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Row gap" }), { target: { value: "24" } });
    expect(screen.getByText("12 chairs · 3 rows · 5 per row · last row: 2")).toBeInTheDocument();
    const canvas = screen.getByLabelText("Event layout canvas");
    const preview = Array.from(screen.getByTestId("event-preset-preview").querySelectorAll("div.absolute")) as HTMLElement[];
    expect(preview).toHaveLength(12);
    expect(preview.every((item) => item.style.width === "16px" && item.style.height === "16px")).toBe(true);
    fireEvent.click(canvas, { clientX: 125, clientY: 110 });
    const placed = Array.from(canvas.querySelectorAll("[data-event-item]")) as HTMLElement[];
    expect(placed).toHaveLength(12);
    const rows = [...new Set(placed.map((item) => item.style.top))];
    expect(rows.map((row) => placed.filter((item) => item.style.top === row).length)).toEqual([5, 5, 2]);
  });

  it.each([100, 500])("previews, commits and undoes the complete %i-chair batch atomically", (count) => {
    render(<EventFloorEditor floorPlan={{ ...floorPlan, canvasW: 1800, canvasH: 1600 }} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Preset item count" }), { target: { value: String(count) } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Chairs per row" }), { target: { value: "30" } });

    const canvas = screen.getByLabelText("Event layout canvas");
    const preview = screen.getByTestId("event-preset-preview");
    expect(preview.querySelectorAll("div.absolute")).toHaveLength(count);
    fireEvent.click(canvas, { clientX: 900, clientY: 800 });

    const placed = Array.from(canvas.querySelectorAll<HTMLElement>("[data-event-item]"));
    const ids = placed.map((item) => item.dataset.testid);
    const names = placed.map((item) => item.title.split(" — ")[0]);
    expect(placed).toHaveLength(count);
    expect(new Set(ids).size).toBe(count);
    expect(new Set(names).size).toBe(count);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(count);
  });

  it("does not clamp an invalid preset quantity into a different layout", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Preset item count" }), { target: { value: "999" } });
    expect(screen.getAllByText("Enter a whole number between 1 and 500.")).toHaveLength(1);
    expect(screen.getByRole("spinbutton", { name: "Preset item count" })).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByLabelText("Event layout canvas"), { clientX: 125, clientY: 110 });
    expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(0);
    expect(screen.getByRole("spinbutton", { name: "Preset item count" })).toHaveAttribute("aria-invalid", "true");
  });

  it("places an edge preset exactly where its ghost was shown", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Booth Area/i }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.pointerMove(canvas, { pointerId: 520, pointerType: "mouse", clientX: 5, clientY: 5 });
    const ghost = screen.getByTestId("event-preset-preview").firstElementChild as HTMLElement;
    const ghostLeft = ghost.style.left;
    const ghostTop = ghost.style.top;
    fireEvent.click(canvas, { clientX: 5, clientY: 5 });
    const placed = canvas.querySelector("[data-event-item]") as HTMLElement;
    expect(placed.style.left).toBe(ghostLeft);
    expect(placed.style.top).toBe(ghostTop);
  });

  it("cancels a preset preview with Escape while a placement control is focused", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Booth Area/i }));
    const spacing = screen.getByRole("spinbutton", { name: "Preset spacing" });
    spacing.focus();
    fireEvent.keyDown(spacing, { key: "Escape" });
    expect(screen.queryByTestId("event-preset-preview")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(0);
  });

  it("retains mobile layout validation feedback after closing settings without placing", () => {
    setInspectorViewport(true);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Preset item count" }), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Preview on map" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close layout settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Correct the highlighted values in Edit layout before placing.");
    expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(0);
  });

  it("finds placed items in the object list and selects one", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show event objects" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search event objects" }), { target: { value: "chair" } });
    fireEvent.click(screen.getByRole("button", { name: /select chair/i }));
    expect(screen.getByTestId("event-item-selection-chair-1")).toHaveClass("border-primary");
  });

  it("fits the floating asset catalog inside the visible canvas so the Safety section can be scrolled to", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Browse assets/i }));
    const canvas = screen.getByLabelText("Event layout canvas");
    const catalog = screen.getByTestId("canvas-asset-catalog");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 450, left: 0, right: 800, width: 800, height: 350, x: 0, y: 100, toJSON: () => ({}) });
    vi.spyOn(screen.getByRole("button", { name: "Add event item — Close asset picker" }), "getBoundingClientRect").mockReturnValue({ top: 160, bottom: 192, left: 20, right: 300, width: 280, height: 32, x: 20, y: 160, toJSON: () => ({}) });
    vi.spyOn(catalog, "getBoundingClientRect").mockReturnValue({ top: 200, bottom: 700, left: 0, right: 500, width: 500, height: 500, x: 0, y: 200, toJSON: () => ({}) });
    fireEvent(window, new Event("resize"));
    expect(catalog.getAttribute("style")).toContain("238px");
    expect(within(catalog).getByText("Safety")).toBeInTheDocument();
  });
  it("does not republish an unchanged draft when the parent callback identity changes", async () => {
    const onDraftChange = vi.fn();

    function ParentHarness() {
      const [, setVersion] = useState(0);
      return (
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlay}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          onDraftChange={(furniture, labels) => {
            onDraftChange(furniture, labels);
            if (onDraftChange.mock.calls.length < 3) setVersion((value) => value + 1);
          }}
        />
      );
    }

    render(<ParentHarness />);
    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(onDraftChange).toHaveBeenCalledTimes(1);
  });

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
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save draft|submit to gso|delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Furniture" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit map" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Focus event items" })).toBeDisabled();
    expect(screen.getByText("No event additions yet")).toBeInTheDocument();
  });

  it("renders the complete canonical published floor beneath event items", () => {
    const detailedFloor: FloorPlan = {
      ...floorPlan,
      rooms: [{ id: "room-1", name: "CABA-101", type: "classroom", x: 40, y: 40, w: 100, h: 70, floorId: floorPlan.id, buildingId: "science" }],
      paths: [{ id: "path-1", points: [{ x: 20, y: 140 }, { x: 200, y: 140 }], type: "hallway", color: "#94a3b8", width: 12 }],
      walls: [{ id: "wall-1", x1: 20, y1: 20, x2: 220, y2: 20, thickness: 4, color: "#475569" }],
      doors: [{ id: "door-1", x: 90, y: 20, width: 24, wallId: "wall-1", direction: "left", color: "#b45309" }],
      windows: [{ id: "window-1", x: 150, y: 20, width: 28, height: 3, wallId: "wall-1", color: "#60a5fa" }],
      furniture: [{ id: "desk-1", type: "desk", name: "Desk", category: "tables", x: 72, y: 62, width: 36, height: 20, rotation: 0, color: "#8b6f4e", assetKey: "desk" }],
      stairs: [{ id: "stairs-1", x: 250, y: 40, width: 40, height: 60, direction: "up", label: "Stairs" }],
      ramps: [{ id: "ramp-1", x: 250, y: 120, width: 50, height: 28, label: "Ramp", direction: "up" }],
      elevators: [{ id: "elevator-1", x: 320, y: 40, width: 40, height: 54, doorWidth: 20, label: "Elevator" }],
      labels: [{ id: "floor-label-1", x: 40, y: 180, text: "LOBBY", fontSize: 12, color: "#334155", rotation: 0, align: "left" }],
    };

    render(
      <EventFloorEditor
        floorPlan={detailedFloor}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("readonly-floor-plan-scene")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-floor-surface")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-floor-path")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-room")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-wall")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-door")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-window")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-furniture")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-stairs")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-ramp")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-elevator")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-label")).toHaveTextContent("LOBBY");
    expect(screen.getByTestId("event-furniture-chair-1")).toBeInTheDocument();
  });

  it("keeps the mobile settings sheet inside the visual viewport as the keyboard area changes", () => {
    setInspectorViewport(true);
    const previous = window.visualViewport;
    const viewport = Object.assign(new EventTarget(), { height: 300, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    try {
      render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
      fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
      fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));
      const sheet = screen.getByRole("dialog", { name: "Layout settings" });
      expect(sheet).toHaveStyle({ maxHeight: "255px", bottom: `${window.innerHeight - 300}px` });
      viewport.height = 240;
      act(() => viewport.dispatchEvent(new Event("resize")));
      expect(sheet).toHaveStyle({ maxHeight: "204px", bottom: `${window.innerHeight - 240}px` });
      fireEvent.keyDown(within(sheet).getByRole("spinbutton", { name: "Preset item count" }), { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Layout settings" })).not.toBeInTheDocument();
      expect(screen.getByTestId("event-preset-preview")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: previous });
    }
  });

  it("configures a mobile layout in a sheet and returns to explicit map placement", () => {
    setInspectorViewport(true);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: /Chair Row/i }));
    const sheet = screen.getByRole("dialog", { name: "Layout settings" });
    fireEvent.change(within(sheet).getByRole("spinbutton", { name: "Preset item count" }), { target: { value: "4" } });
    fireEvent.change(within(sheet).getByRole("spinbutton", { name: "Chairs per row" }), { target: { value: "2" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Preview on map" }));
    expect(screen.queryByRole("dialog", { name: "Layout settings" })).not.toBeInTheDocument();
    const edit = screen.getByRole("button", { name: "Edit layout settings" });
    fireEvent.click(edit);
    expect(screen.getByRole("spinbutton", { name: "Preset item count" })).toHaveValue(4);
    fireEvent.click(screen.getByRole("button", { name: "Close layout settings" }));
    expect(screen.getByTestId("event-preset-preview")).toBeInTheDocument();
    const canvas = screen.getByLabelText("Event layout canvas");
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(0);
    fireEvent.pointerDown(canvas, { pointerId: 7150, pointerType: "touch", button: 0, clientX: 220, clientY: 160 });
    fireEvent.pointerUp(window, { pointerId: 7150, pointerType: "touch", clientX: 220, clientY: 160 });
    fireEvent.click(canvas, { clientX: 220, clientY: 160 });
    fireEvent.click(screen.getByRole("button", { name: "Place here" }));
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(4);
  });

  it("changes selection decoration without whitening or raising the furniture artwork", () => {
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
    const artworkLayer = item.style.zIndex;
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);

    expect(artworkLayer).toBe("10");
    expect(item.style.zIndex).toBe(artworkLayer);
    expect(item.style.backgroundColor).toBe("");
    expect(screen.getByTestId("event-item-selection-chair-1")).toBeInTheDocument();
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
    fireEvent.click(within(canvas).getByRole("button", { name: /Browse assets/i }));
    expect(screen.getByRole("option", { name: /Chair: Single chair/i })).toBeInTheDocument();
    expect(within(screen.getByTestId("event-furniture-chair-1")).queryByText("Chair")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Choose an event item" }), { key: "Escape" });

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

  it("shows armed and active feedback for temporary Space panning", () => {
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
    const pan = screen.getByRole("button", { name: "Pan" });
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(canvas).toHaveStyle({ cursor: "grab" });
    expect(pan).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Pan · Space held");

    fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 115 });
    expect(canvas).toHaveStyle({ cursor: "grabbing" });
    expect(screen.getByRole("status")).toHaveTextContent("Panning");

    fireEvent.mouseUp(window);
    expect(canvas).toHaveStyle({ cursor: "grab" });
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(canvas).toHaveStyle({ cursor: "default" });
    expect(pan).toHaveAttribute("aria-pressed", "false");
  });

  it("uses normal wheel input for bounded canvas pan and Ctrl/Cmd wheel for gradual zoom", async () => {
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
    await waitFor(() => expect(content.getAttribute("style") || "").not.toBe(initialTransform));
    const afterPan = content.getAttribute("style") || "";
    expect(afterPan).toContain(`scale(${initialScale})`);
    expect(afterPan).not.toBe(initialTransform);

    fireEvent.wheel(canvas, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true, clientX: 180, clientY: 120 });
    await waitFor(() => {
      const current = Number((content.getAttribute("style") || "").match(/scale\(([^)]+)\)/)?.[1]);
      expect(current).toBeGreaterThan(initialScale);
    });
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
    fireEvent.click(within(canvas).getByRole("button", { name: /Browse assets/i }));
    const catalog = screen.getByRole("dialog", { name: "Choose an event item" });

    fireEvent.wheel(catalog, { deltaY: -100, ctrlKey: true, clientX: 160, clientY: 120 });

    expect(Event.prototype.preventDefault).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("fits the event map to the viewport with the 0 shortcut", async () => {
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
    await waitFor(() => expect(screen.getByTestId("event-zoom-level").textContent).not.toBe("25%"));
    const zoomed = screen.getByTestId("event-zoom-level").textContent;
    fireEvent.keyDown(window, { key: "0" });

    await waitFor(() => expect(screen.getByTestId("event-zoom-level").textContent).not.toBe(zoomed));
    vi.restoreAllMocks();
  });

  it("keeps viewport panning active outside the canvas and stops on release", () => {
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
    const content = screen.getByTestId("event-canvas-content");
    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    fireEvent.mouseDown(canvas, { button: 0, clientX: 80, clientY: 80 });
    const initialTransform = content.getAttribute("style") || "";
    fireEvent.mouseLeave(canvas);
    fireEvent.mouseMove(window, { clientX: 140, clientY: 120 });

    expect(content.getAttribute("style")).not.toBe(initialTransform);

    fireEvent.mouseUp(window);
    const releasedTransform = content.getAttribute("style") || "";
    fireEvent.mouseMove(canvas, { clientX: 220, clientY: 180 });
    expect(content.getAttribute("style")).toBe(releasedTransform);

    vi.restoreAllMocks();
  });

  it("cancels an active viewport pan when the window loses focus", () => {
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
    const content = screen.getByTestId("event-canvas-content");
    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    fireEvent.mouseDown(canvas, { button: 0, clientX: 80, clientY: 80 });
    fireEvent.blur(window);
    const cancelledTransform = content.getAttribute("style") || "";
    fireEvent.mouseMove(canvas, { clientX: 220, clientY: 180 });

    expect(content.getAttribute("style")).toBe(cancelledTransform);

    vi.restoreAllMocks();
  });

  it("exposes the active canvas tool to assistive technology", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const select = screen.getByRole("button", { name: "Select" });
    const pan = screen.getByRole("button", { name: "Pan" });
    expect(select).toHaveAttribute("aria-pressed", "true");
    expect(pan).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pan);
    expect(pan).toHaveAttribute("aria-pressed", "true");
    expect(select).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Event layout canvas")).toHaveStyle({ cursor: "grab" });
  });

  it("pans from an event item while Pan mode is active without moving the item", () => {
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
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    const content = screen.getByTestId("event-canvas-content");
    const item = screen.getByTestId("event-furniture-chair-1");
    const itemPosition = item.getAttribute("style") || "";
    const initialTransform = content.getAttribute("style") || "";

    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    fireEvent.mouseDown(item, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 96 });
    fireEvent.mouseUp(canvas);

    expect(content.getAttribute("style")).not.toBe(initialTransform);
    expect(item.getAttribute("style")).toBe(itemPosition);

    vi.restoreAllMocks();
  });

  it("keeps pan cursor ownership over selected assets and hides floating actions while moving", () => {
    setInspectorViewport(false);
    const capture = installPointerCaptureRegistry();
    try {
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
      fireEvent.mouseUp(canvas, { clientX: 36, clientY: 36 });
      expect(screen.getByTestId("event-single-item-actions")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Pan" }));
      expect(item).toHaveClass("cursor-grab");
      expect(screen.getByTestId("event-single-item-actions")).toBeInTheDocument();
      fireEvent.pointerDown(item, { pointerId: 30, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 30, pointerType: "mouse", clientX: 76, clientY: 36 });
      expect(item).toHaveClass("cursor-grabbing");
      expect(screen.queryByTestId("event-single-item-actions")).not.toBeInTheDocument();
      fireEvent.pointerUp(window, { pointerId: 30, pointerType: "mouse", clientX: 76, clientY: 36 });
      expect(screen.getByTestId("event-single-item-actions")).toBeInTheDocument();
    } finally {
      capture.restore();
    }
  });

  it("does not arm canvas pan while Space is typed in the label editor", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithLabel}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    const label = screen.getByTestId("event-label-label-1");
    fireEvent.mouseDown(label, { button: 0, clientX: 48, clientY: 48 });
    fireEvent.mouseUp(label, { clientX: 48, clientY: 48 });
    fireEvent.click(screen.getByRole("button", { name: "Open label details" }));
    const input = screen.getByRole("textbox", { name: "Label text" });
    input.focus();
    fireEvent.keyDown(input, { code: "Space", key: " " });
    expect(screen.getByTestId("event-pan-status")).toHaveTextContent("");
    expect(screen.getByLabelText("Event layout canvas")).toHaveStyle({ cursor: "default" });
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
    fireEvent.click(within(canvas).getByRole("button", { name: /Browse assets/i }));
    const catalog = screen.getByRole("dialog", { name: "Choose an event item" });
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

  it("keeps newly clicked furniture inside the editable canvas boundary", () => {
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
    fireEvent.click(canvas, { clientX: 10_000, clientY: 10_000 });

    const item = canvas.querySelector("[data-event-item]") as HTMLElement;
    expect(item).toBeTruthy();
    expect(Number.parseFloat(item.style.left) + Number.parseFloat(item.style.width)).toBeLessThanOrEqual(floorPlan.canvasW!);
    expect(Number.parseFloat(item.style.top) + Number.parseFloat(item.style.height)).toBeLessThanOrEqual(floorPlan.canvasH!);
  });

  it("reports unsaved event additions to the location coordinator", () => {
    const onDraftChange = vi.fn();
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    fireEvent.click(screen.getByLabelText("Event layout canvas"), { clientX: 120, clientY: 100 });

    expect(onDraftChange).toHaveBeenLastCalledWith(
      [expect.objectContaining({ type: "booth" })],
      [],
    );
  });

  it("edits a selected event label instead of forcing a replacement label", () => {
    const onDraftChange = vi.fn();
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithLabel}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );

    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.mouseDown(screen.getByTestId("event-label-label-1"), { button: 0, clientX: 52, clientY: 52 });
    fireEvent.mouseUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Open label details" }));
    fireEvent.change(screen.getByLabelText("Label text"), { target: { value: "Registration" } });

    expect(onDraftChange).toHaveBeenLastCalledWith(
      [],
      [expect.objectContaining({ id: "label-1", text: "Registration" })],
    );
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


  it("owns a pointer drag once and ignores the compatibility mouse event", () => {
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.pointerDown(item, { pointerId: 7, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 76, clientY: 36 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 76, clientY: 36 });

    expect(Number.parseFloat(item.style.left)).toBeGreaterThan(24);
  });

  it("captures accepted manipulation on the stable canvas surface", () => {
    const capture = installPointerCaptureRegistry();
    try {
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
      fireEvent.pointerDown(item, { pointerId: 21, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });

      expect(capture.owner(21)).toBe(canvas);
      fireEvent.pointerMove(window, { pointerId: 21, pointerType: "mouse", clientX: 76, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 21, pointerType: "mouse", clientX: 76, clientY: 36 });
      expect(Number.parseFloat(item.style.left)).toBeGreaterThan(24);
    } finally {
      capture.restore();
    }
  });

  it("finishes an active pointer exactly once when capture is lost", () => {
    const capture = installPointerCaptureRegistry();
    try {
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
      fireEvent.pointerDown(item, { pointerId: 22, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 22, pointerType: "mouse", clientX: 76, clientY: 36 });
      act(() => capture.emitLost(22));
      const committedLeft = item.style.left;
      fireEvent.pointerMove(window, { pointerId: 22, pointerType: "mouse", clientX: 176, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 22, pointerType: "mouse", clientX: 176, clientY: 36 });

      expect(item.style.left).toBe(committedLeft);
      expect(capture.owner(22)).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it("applies the final pointer-up coordinate before the pending preview frame", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );

      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 23, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 23, pointerType: "mouse", clientX: 56, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 23, pointerType: "mouse", clientX: 96, clientY: 36 });

      expect(Number.parseFloat(item.style.left)).toBeGreaterThan(60);
    } finally {
      capture.restore();
    }
  });

  it("flushes the newest pending preview before Save Draft reads the layout", async () => {
    const capture = installPointerCaptureRegistry();
    try {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={onSave}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Toggle snapping" }));
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 27, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 27, pointerType: "mouse", clientX: 56, clientY: 46 });
      fireEvent.pointerMove(window, { pointerId: 27, pointerType: "mouse", clientX: 96, clientY: 86 });
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave.mock.calls[0][0][0]).toMatchObject({ id: "chair-1", x: 84, y: 74 });
      expect(capture.owner(27)).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it("flushes the latest gesture geometry to the location recovery key on unmount", () => {
    const capture = installPointerCaptureRegistry();
    const locationRef = overlay.locationRef!;
    const key = eventLayoutDraftStorageKey(overlay.id, locationRef);
    try {
      const { unmount } = render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Toggle snapping" }));
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 29, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 29, pointerType: "mouse", clientX: 56, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 29, pointerType: "mouse", clientX: 96, clientY: 36 });

      unmount();

      expect(localStorage.getItem(key)).not.toBeNull();
      expect(readEventLayoutDraft(overlay.id, locationRef)?.eventFurniture[0]).toMatchObject({ id: "chair-1", x: 84, y: 24 });
      expect(capture.owner(29)).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it("publishes and validates a 100-asset layout once after the gesture commits", async () => {
    const capture = installPointerCaptureRegistry();
    const validateSpy = vi.spyOn(eventValidation, "validateEventLayout");
    try {
      const assets = Array.from({ length: 100 }, (_, index) => ({
        ...overlayWithChair.eventFurniture![0],
        id: `asset-${index}`,
        x: 20 + (index % 10) * 80,
        y: 20 + Math.floor(index / 10) * 70,
        rotation: index === 0 ? 30 : 0,
      }));
      const onDraftChange = vi.fn();
      render(
        <EventFloorEditor
          floorPlan={{ ...floorPlan, canvasW: 1000, canvasH: 800 }}
          overlay={{ ...overlay, eventFurniture: assets }}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onDraftChange={onDraftChange}
          onBack={vi.fn()}
        />,
      );

      await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
      const publishedAtMount = onDraftChange.mock.calls.length;
      const validatedAtMount = validateSpy.mock.calls.length;
      const item = screen.getByTestId("event-furniture-asset-0");
      fireEvent.pointerDown(item, { pointerId: 28, pointerType: "mouse", button: 0, clientX: 30, clientY: 30 });
      fireEvent.pointerMove(window, { pointerId: 28, pointerType: "mouse", clientX: 50, clientY: 30 });
      fireEvent.pointerMove(window, { pointerId: 28, pointerType: "mouse", clientX: 90, clientY: 30 });
      fireEvent.pointerUp(window, { pointerId: 28, pointerType: "mouse", clientX: 90, clientY: 30 });

      await waitFor(() => expect(onDraftChange.mock.calls.length).toBe(publishedAtMount + 1));
      expect(validateSpy.mock.calls.length).toBe(validatedAtMount + 1);
    } finally {
      validateSpy.mockRestore();
      capture.restore();
    }
  });

  it("keeps continuous drag tracking in the captured coordinate frame", () => {
    const capture = installPointerCaptureRegistry();
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 50,
      top: 50,
      left: 100,
      right: 540,
      bottom: 340,
      width: 440,
      height: 290,
      toJSON: () => ({}),
    });
    try {
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
      expect(screen.getByTestId("event-zoom-level")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Toggle snapping" }));
      const zoom = Number.parseInt(screen.getByTestId("event-zoom-level").textContent || "100", 10) / 100;
      const item = screen.getByTestId("event-furniture-chair-1");
      const start = { clientX: 130, clientY: 80 };
      const initialLeft = Number.parseFloat(item.style.left);
      fireEvent.pointerDown(item, { pointerId: 29, pointerType: "mouse", button: 0, ...start });

      for (const [clientX, clientY] of [[140, 90], [120, 100], [160, 70], [180, 110]]) {
        fireEvent.pointerMove(window, { pointerId: 29, pointerType: "mouse", clientX, clientY });
        act(() => vi.runOnlyPendingTimers());
        const expectedLeft = initialLeft + (clientX - start.clientX) / zoom;
        expect(Math.abs(Number.parseFloat(item.style.left) - expectedLeft), `left=${item.style.left} expected=${expectedLeft} zoom=${zoom} input=${clientX}`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(Number.parseFloat(item.style.top) - (24 + (clientY - start.clientY) / zoom)), `top=${item.style.top} zoom=${zoom} input=${clientY}`).toBeLessThanOrEqual(0.01);
      }
      fireEvent.pointerUp(window, { pointerId: 29, pointerType: "mouse", clientX: 180, clientY: 110 });
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
      expect(HTMLElement.prototype.getBoundingClientRect).toBe(originalRect);
      capture.restore();
    }
  });

  it("ignores pointer movement and release from an unrelated pointer ID", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          />,
      );

      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 24, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 99, pointerType: "mouse", clientX: 176, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 99, pointerType: "mouse", clientX: 176, clientY: 36 });

      expect(item.style.left).toBe("24px");
    } finally {
      capture.restore();
    }
  });

  it("pans with the middle button over an item without moving the item", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );

      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 25, pointerType: "mouse", button: 1, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 25, pointerType: "mouse", clientX: 76, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 25, pointerType: "mouse", clientX: 76, clientY: 36 });

      expect(item.style.left).toBe("24px");
    } finally {
      capture.restore();
    }
  });

  it("does not spawn furniture from a completed item pointer gesture", () => {
    const capture = installPointerCaptureRegistry();
    try {
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
      fireEvent.pointerDown(item, { pointerId: 26, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 26, pointerType: "mouse", clientX: 36, clientY: 36 });
      fireEvent.click(canvas, { clientX: 160, clientY: 120 });

      expect(screen.getAllByTestId("event-furniture-chair-1")).toHaveLength(1);
    } finally {
      capture.restore();
    }
  });

  it("does not spawn furniture from a completed blank pinch navigation", () => {
    const capture = installPointerCaptureRegistry();
    try {
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
      fireEvent.pointerDown(canvas, { pointerId: 101, pointerType: "touch", button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerDown(canvas, { pointerId: 102, pointerType: "touch", button: 0, clientX: 180, clientY: 100 });
      fireEvent.pointerMove(window, { pointerId: 101, pointerType: "touch", clientX: 120, clientY: 115 });
      fireEvent.pointerMove(window, { pointerId: 102, pointerType: "touch", clientX: 200, clientY: 115 });
      fireEvent.pointerUp(window, { pointerId: 101, pointerType: "touch", clientX: 120, clientY: 115 });
      fireEvent.click(canvas, { clientX: 220, clientY: 140 });

      expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(0);
      expect(capture.owner(101)).toBeNull();
      expect(capture.owner(102)).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it("commits an item touch before transferring ownership to pinch navigation", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Toggle snapping" }));
      const canvas = screen.getByLabelText("Event layout canvas");
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 11, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 11, pointerType: "touch", clientX: 56, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 11, pointerType: "touch", clientX: 76, clientY: 36 });
      fireEvent.pointerDown(canvas, { pointerId: 12, pointerType: "touch", button: 0, clientX: 100, clientY: 36 });
      expect(item).toHaveStyle({ left: "64px", top: "24px" });

      fireEvent.pointerMove(window, { pointerId: 11, pointerType: "touch", clientX: 96, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 12, pointerType: "touch", clientX: 120, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 11, pointerType: "touch", clientX: 96, clientY: 36 });
      expect(item).toHaveStyle({ left: "64px", top: "24px" });
      expect(capture.owner(11)).toBeNull();
      expect(capture.owner(12)).toBeNull();

      const undoButton = screen.getAllByRole("button").find((button) => button.querySelector("svg.lucide-undo-2"));
      expect(undoButton).not.toBeDisabled();
      fireEvent.click(undoButton!);
      expect(item).toHaveStyle({ left: "24px", top: "24px" });
      expect(undoButton).toBeDisabled();
    } finally {
      capture.restore();
    }
  });

  it("recaptures both pointers during item-to-pinch handoff and ignores a delayed loss event", () => {
    const capture = installPointerCaptureRegistry();
    try {
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
      fireEvent.pointerDown(item, { pointerId: 51, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
      expect(capture.owner(51)).toBe(canvas);
      fireEvent.pointerDown(canvas, { pointerId: 52, pointerType: "touch", button: 0, clientX: 100, clientY: 36 });

      expect(capture.owner(51)).toBe(canvas);
      expect(capture.owner(52)).toBe(canvas);
      capture.emitStaleLost(52);
      fireEvent.pointerMove(window, { pointerId: 51, pointerType: "touch", clientX: 80, clientY: 36 });

      expect(screen.getByTestId("event-furniture-chair-1")).toHaveStyle({ left: "24px", top: "24px" });
      fireEvent.pointerUp(window, { pointerId: 51, pointerType: "touch", clientX: 80, clientY: 36 });
      expect(capture.owner(51)).toBeNull();
      expect(capture.owner(52)).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it("translates the viewport 1:1 when two touch pointers move together", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlay}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      const canvas = screen.getByLabelText("Event layout canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 100, top: 50, width: 600, height: 400, right: 700, bottom: 450 }) });
      const content = screen.getByTestId("event-canvas-content");
      const initialTransform = content.style.transform;

      fireEvent.pointerDown(canvas, { pointerId: 31, pointerType: "touch", button: 0, clientX: 220, clientY: 150 });
      fireEvent.pointerDown(canvas, { pointerId: 32, pointerType: "touch", button: 0, clientX: 320, clientY: 150 });
      fireEvent.pointerMove(window, { pointerId: 31, pointerType: "touch", clientX: 260, clientY: 175 });
      fireEvent.pointerMove(window, { pointerId: 32, pointerType: "touch", clientX: 360, clientY: 175 });

      expect(content.style.transform).not.toBe(initialTransform);
      expect(screen.getByTestId("event-zoom-level")).toHaveTextContent("100%");
      fireEvent.pointerUp(window, { pointerId: 31, pointerType: "touch", clientX: 260, clientY: 175 });
      const afterEnd = content.style.transform;
      fireEvent.pointerMove(window, { pointerId: 32, pointerType: "touch", clientX: 420, clientY: 235 });
      expect(content.style.transform).toBe(afterEnd);
    } finally {
      capture.restore();
    }
  });

  it("keeps the original world anchor under the midpoint while pinching and translating", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlay}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      const canvas = screen.getByLabelText("Event layout canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => ({ left: 100, top: 50, width: 600, height: 400, right: 700, bottom: 450 }) });
      const content = screen.getByTestId("event-canvas-content");

      fireEvent.pointerDown(canvas, { pointerId: 41, pointerType: "touch", button: 0, clientX: 240, clientY: 180 });
      fireEvent.pointerDown(canvas, { pointerId: 42, pointerType: "touch", button: 0, clientX: 340, clientY: 180 });
      fireEvent.pointerMove(window, { pointerId: 41, pointerType: "touch", clientX: 210, clientY: 205 });
      fireEvent.pointerMove(window, { pointerId: 42, pointerType: "touch", clientX: 410, clientY: 205 });

      expect(content.style.transform).toMatch(/scale\(2\)/);
      expect(screen.getByTestId("event-zoom-level")).toHaveTextContent("200%");
    } finally {
      capture.restore();
    }
  });

  it("ignores touch contact during a mouse-owned drag", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /snap/i }));
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 181, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerDown(screen.getByLabelText("Event layout canvas"), { pointerId: 182, pointerType: "touch", clientX: 100, clientY: 100 });
      expect(capture.owner(182)).toBeNull();
      fireEvent.pointerMove(window, { pointerId: 181, pointerType: "mouse", clientX: 76, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 181, pointerType: "mouse", clientX: 76, clientY: 36 });
      expect(item).toHaveStyle({ left: "64px" });
    } finally { capture.restore(); }
  });

  it("ignores a third touch pointer during an active pinch", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlay}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      const canvas = screen.getByLabelText("Event layout canvas");
      const content = screen.getByTestId("event-canvas-content");
      fireEvent.pointerDown(canvas, { pointerId: 51, pointerType: "touch", button: 0, clientX: 220, clientY: 150 });
      fireEvent.pointerDown(canvas, { pointerId: 52, pointerType: "touch", button: 0, clientX: 320, clientY: 150 });
      fireEvent.pointerDown(canvas, { pointerId: 53, pointerType: "touch", button: 0, clientX: 420, clientY: 150 });
      const beforeThirdMove = content.style.transform;
      fireEvent.pointerMove(window, { pointerId: 53, pointerType: "touch", clientX: 520, clientY: 250 });
      expect(content.style.transform).toBe(beforeThirdMove);
    } finally {
      capture.restore();
    }
  });

  it("restores a dragged item on Escape without adding history or retaining capture", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 61, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 61, pointerType: "mouse", clientX: 96, clientY: 36 });
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.pointerUp(window, { pointerId: 61, pointerType: "mouse", clientX: 196, clientY: 36 });

      expect(item).toHaveStyle({ left: "24px", top: "24px" });
      expect(capture.owner(61)).toBeNull();
      const undoButton = screen.getAllByRole("button").find((button) => button.querySelector("svg.lucide-undo-2"));
      expect(undoButton).toBeDisabled();

      fireEvent.pointerDown(item, { pointerId: 62, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 62, pointerType: "mouse", clientX: 76, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 62, pointerType: "mouse", clientX: 76, clientY: 36 });
      expect(Number.parseFloat(item.style.left)).toBeGreaterThan(24);
    } finally {
      capture.restore();
    }
  });

  it("clears Escape-canceled pan so the canvas is not stuck grabbing", () => {
    const capture = installPointerCaptureRegistry();
    try {
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
      fireEvent.keyDown(window, { code: "Space", key: " " });
      fireEvent.pointerDown(canvas, { pointerId: 63, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { pointerId: 63, pointerType: "mouse", clientX: 140, clientY: 120 });
      expect(canvas).toHaveStyle({ cursor: "grabbing" });
      fireEvent.keyDown(window, { key: "Escape" });

      expect(canvas).toHaveStyle({ cursor: "grab" });
      expect(capture.owner(63)).toBeNull();
      fireEvent.keyUp(window, { code: "Space", key: " " });
    } finally {
      capture.restore();
    }
  });

  it("prevents a queued preview frame from writing after Escape", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 64, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 64, pointerType: "mouse", clientX: 56, clientY: 36 });
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.pointerUp(window, { pointerId: 64, pointerType: "mouse", clientX: 156, clientY: 36 });

      expect(item).toHaveStyle({ left: "24px", top: "24px" });
    } finally {
      capture.restore();
    }
  });

  it("finishes the active gesture before refitting after a viewport resize", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 71, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 71, pointerType: "mouse", clientX: 76, clientY: 36 });
      const displayedBeforeResize = item.style.left;
      fireEvent.pointerMove(window, { pointerId: 71, pointerType: "mouse", clientX: 136, clientY: 36 });
      fireEvent(window, new Event("resize"));
      fireEvent.pointerMove(window, { pointerId: 71, pointerType: "mouse", clientX: 236, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 71, pointerType: "mouse", clientX: 236, clientY: 36 });

      expect(item.style.left).toBe(displayedBeforeResize);
      expect(capture.owner(71)).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it.each(["cancel", "lostcapture", "blur", "hidden"])("discards unrendered movement on %s and releases capture", (reason) => {
    const capture = installPointerCaptureRegistry();
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    try {
      render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /snap/i }));
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 172, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 172, pointerType: "mouse", clientX: 76, clientY: 36 });
      const displayed = item.style.left;
      fireEvent.pointerMove(window, { pointerId: 172, pointerType: "mouse", clientX: 176, clientY: 36 });
      if (reason === "cancel") fireEvent.pointerCancel(window, { pointerId: 172 });
      if (reason === "lostcapture") act(() => capture.emitLost(172));
      if (reason === "blur") fireEvent.blur(window);
      if (reason === "hidden") {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        fireEvent(document, new Event("visibilitychange"));
      }
      expect(item.style.left).toBe(displayed);
      expect(capture.owner(172)).toBeNull();
      fireEvent.pointerUp(window, { pointerId: 172, clientX: 236, clientY: 36 });
      expect(item.style.left).toBe(displayed);
    } finally {
      if (visibility) Object.defineProperty(document, "visibilityState", visibility);
      else Reflect.deleteProperty(document, "visibilityState");
      capture.restore();
    }
  });

  it("discards a pending old-frame preview during resize and allows a fresh gesture", () => {
    const capture = installPointerCaptureRegistry();
    try {
      render(
        <EventFloorEditor
          floorPlan={floorPlan}
          overlay={overlayWithChair}
          onSave={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      const item = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(item, { pointerId: 72, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 72, pointerType: "mouse", clientX: 76, clientY: 36 });
      const displayed = item.style.left;
      fireEvent.pointerMove(window, { pointerId: 72, pointerType: "mouse", clientX: 176, clientY: 36 });
      fireEvent(window, new Event("resize"));
      expect(item.style.left).toBe(displayed);

      fireEvent.pointerDown(item, { pointerId: 73, pointerType: "mouse", button: 0, clientX: 76, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 73, pointerType: "mouse", clientX: 96, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 73, pointerType: "mouse", clientX: 96, clientY: 36 });
      expect(Number.parseFloat(item.style.left)).toBeGreaterThan(Number.parseFloat(displayed));
      expect(capture.owner(72)).toBeNull();
      expect(capture.owner(73)).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it("releases an active gesture before a zero-size viewport resize", () => {
    const capture = installPointerCaptureRegistry();
    try {
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
      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      });

      fireEvent.pointerDown(item, { pointerId: 74, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerMove(window, { pointerId: 74, pointerType: "mouse", clientX: 56, clientY: 36 });
      const displayed = item.style.left;
      fireEvent(window, new Event("resize"));
      fireEvent.pointerMove(window, { pointerId: 74, pointerType: "mouse", clientX: 156, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId: 74, pointerType: "mouse", clientX: 156, clientY: 36 });

      expect(item.style.left).toBe(displayed);
      expect(capture.owner(74)).toBeNull();
    } finally {
      capture.restore();
    }
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

  it("opens item details for placement while retaining fixed dimensions", () => {
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
    fireEvent.click(within(inspector).getByRole("button", { name: "Advanced" }));
    expect(within(inspector).queryByRole("spinbutton", { name: "Width" })).not.toBeInTheDocument();
    const x = within(inspector).getByRole("spinbutton", { name: "X" });
    fireEvent.change(x, { target: { value: "48" } });
    expect(screen.getByTestId("event-furniture-chair-1").style.left).toBe("48px");
    expect(screen.getByTestId("event-furniture-chair-1").style.width).toBe("24px");
  });

  it("opens and collapses the compact desktop inspector outside the canvas", () => {
    setInspectorViewport(false);
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlayWithChair}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const workspace = screen.getByTestId("event-editor-workspace");
    const canvas = screen.getByLabelText("Event layout canvas");
    expect(screen.queryByTestId("event-item-inspector-rail")).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-1"), { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Open item details" }));
    const rail = screen.getByTestId("event-item-inspector-rail");
    const details = within(rail).getByRole("region", { name: "Item details" });
    expect(canvas).not.toContainElement(details);
    expect(canvas.parentElement).toBe(workspace);
    expect(rail).toHaveClass("w-[17rem]");

    fireEvent.click(within(rail).getByRole("button", { name: "Close item details" }));
    expect(screen.queryByTestId("event-item-inspector-rail")).not.toBeInTheDocument();
  });

  it("opens item details as a mobile sheet, restores focus, and leaves canvas gestures available after close", async () => {
    setInspectorViewport(true);
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
    const detailsButton = screen.getByRole("button", { name: "Open item details" });
    const originalCoordinates = [screen.getByTestId("event-furniture-chair-1").style.left, screen.getByTestId("event-furniture-chair-1").style.top];
    fireEvent.click(detailsButton);

    const sheet = await screen.findByRole("dialog", { name: "Item details" });
    expect(sheet).toHaveClass("fixed", "bottom-0");
    expect(sheet).toHaveAttribute("data-testid", "event-item-inspector-sheet");
    expect(screen.getByTestId("event-furniture-chair-1").style.left).toBe(originalCoordinates[0]);
    expect(screen.getByTestId("event-furniture-chair-1").style.top).toBe(originalCoordinates[1]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Close item details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Item details" })).not.toBeInTheDocument());
    expect(detailsButton).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    fireEvent.pointerDown(canvas, { pointerId: 301, pointerType: "touch", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 301, pointerType: "touch", button: 0, clientX: 106, clientY: 104 });
    expect(screen.getByTestId("event-pan-status")).toHaveTextContent("Panning");
    fireEvent.pointerUp(window, { pointerId: 301, pointerType: "touch", button: 0, clientX: 100, clientY: 100 });
  });

  it("clears item selection and closes details when the keyed floor editor switches location", async () => {
    const view = render(
      <EventFloorEditor
        key="science-f2"
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
    expect(await screen.findByRole("dialog", { name: "Item details" })).toBeInTheDocument();

    view.rerender(
      <EventFloorEditor
        key="science-f1"
        floorPlan={{ ...floorPlan, id: "science-f1", number: 1, label: "Floor 1" }}
        overlay={{ ...overlayWithChair, locationRef: { type: "building", buildingId: "science", floorId: "science-f1", label: "Science Building — Floor 1" } }}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Item details" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Open item details" })).not.toBeInTheDocument();
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
    fireEvent.click(within(inspector).getByRole("button", { name: "Advanced" }));
    const x = within(inspector).getByRole("spinbutton", { name: "X" });
    expect(x).toBeDisabled();
    fireEvent.change(x, { target: { value: "48" } });
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
    const second = screen.getByTestId("event-furniture-chair-2");
    expect(Number(first.style.zIndex)).toBeLessThan(Number(second.style.zIndex));
    fireEvent.mouseDown(first, { button: 0, clientX: 36, clientY: 36 });
    fireEvent.mouseUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Open item details" }));
    const inspector = screen.getByRole("dialog", { name: "Item details" });
    fireEvent.click(within(inspector).getByRole("button", { name: "Advanced" }));

    fireEvent.click(within(inspector).getByRole("button", { name: "Hide selected item" }));
    expect(screen.getByRole("button", { name: "Show selected item" })).toBeInTheDocument();
    expect(first.style.opacity).toBe("0.45");
    fireEvent.click(within(inspector).getByRole("button", { name: "Bring selected item to front" }));
    expect(Number(first.style.zIndex)).toBeGreaterThan(Number(second.style.zIndex));
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
    setInspectorViewport(false);
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

  it("keeps selected actions inside a narrow canvas near its lower-right edge", () => {
    setInspectorViewport(false);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlayWithChair, eventFurniture: [{ ...overlayWithChair.eventFurniture![0], x: 360, y: 240 }] }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 390 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 290 });
    fireEvent.pointerDown(screen.getByTestId("event-furniture-chair-1"), { pointerId: 191, pointerType: "mouse", button: 0, clientX: 372, clientY: 252 });
    fireEvent.pointerUp(window, { pointerId: 191, pointerType: "mouse", clientX: 372, clientY: 252 });
    const actions = screen.getByTestId("event-single-item-actions");
    expect(Number.parseFloat(actions.style.left)).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(actions.style.left)).toBeLessThan(canvas.clientWidth);
    expect(Number.parseFloat(actions.style.top)).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(actions.style.top)).toBeLessThan(canvas.clientHeight);
  });

  it("moves selection actions below a top-edge item to preserve its direct rotation handle", () => {
    setInspectorViewport(false);
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

    const actions = screen.getByTestId("event-single-item-actions");
    expect(Number.parseFloat(actions.style.top)).toBeGreaterThan(48);
    expect(screen.getByTestId("event-furniture-rotate-handle")).toBeInTheDocument();
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

  it("keeps the asset catalog and Objects panel from stacking", () => {
    setInspectorViewport(false);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.click(within(canvas).getByRole("button", { name: /Browse assets/i }));
    expect(screen.getByRole("dialog", { name: "Choose an event item" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show event objects" }));
    expect(screen.queryByRole("dialog", { name: "Choose an event item" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Event objects" })).toBeInTheDocument();

    fireEvent.click(within(canvas).getByRole("button", { name: /Browse assets/i }));
    expect(screen.queryByRole("region", { name: "Event objects" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Choose an event item" })).toBeInTheDocument();
  });

  it.each(["panel", "search"])("closes Objects from %s before canceling the active tool on Escape", (target) => {
    setInspectorViewport(false);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const objectsTrigger = screen.getByRole("button", { name: "Show event objects" });
    fireEvent.click(objectsTrigger);
    expect(screen.getByRole("region", { name: "Event objects" })).toBeInTheDocument();

    const escapeTarget = target === "search" ? screen.getByRole("searchbox", { name: "Search event objects" }) : screen.getByRole("region", { name: "Event objects" });
    if (target === "search") escapeTarget.focus();
    fireEvent.keyDown(escapeTarget, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Event objects" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(objectsTrigger);
    expect(screen.getByRole("button", { name: /Furniture$/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not place furniture from editor chrome when Snap is clicked", () => {
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
    const snap = within(canvas).getByRole("button", { name: /toggle snapping/i });
    const furnitureCount = () => canvas.querySelectorAll("[data-event-item]").length;

    expect(furnitureCount()).toBe(0);
    expect(snap).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(snap);

    expect(snap).toHaveAttribute("aria-pressed", "false");
    expect(furnitureCount()).toBe(0);
  });

  it("keeps the layout-check row fixed while details remain expandable", () => {
    const crowdedFurniture = [0, 1, 2].map((index) => ({
      ...overlayWithChair.eventFurniture![0],
      id: `crowded-chair-${index}`,
      x: 24 + index * 2,
      y: 24,
    }));
    render(
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={{ ...overlay, eventFurniture: crowdedFurniture }}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const issues = screen.getByTestId("event-layout-warnings");
    expect(issues).toHaveClass("h-8", "shrink-0");
    expect(issues).not.toHaveClass("flex-wrap");
    fireEvent.click(screen.getByRole("button", { name: /open \d+ layout issues/i }));
    expect(screen.getAllByRole("button", { name: /show items/i }).length).toBeGreaterThan(0);
  });

  it("shows Arrange only for multiple selected furniture items", () => {
    setInspectorViewport(false);
    const seededChairs = [20, 80, 140].map((x, index) => ({
      ...overlayWithChair.eventFurniture![0],
      id: `chair-${index + 1}`,
      x: index === 1 ? 100 : x,
      width: index === 0 ? 40 : index === 1 ? 30 : 24,
      height: 20,
      rotation: index === 0 ? 90 : 0,
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
    fireEvent.pointerDown(screen.getByTestId("event-furniture-chair-1"), { pointerId: 7001, pointerType: "mouse", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 7001, pointerType: "mouse", clientX: 20, clientY: 20 });
    fireEvent.pointerDown(screen.getByTestId("event-furniture-chair-2"), { pointerId: 7002, pointerType: "mouse", button: 0, shiftKey: true, clientX: 80, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 7002, pointerType: "mouse", clientX: 80, clientY: 20 });

    const arrange = screen.getByRole("button", { name: "Arrange selected items" });
    expect(arrange).toBeInTheDocument();
    expect(screen.getByTestId("event-layout-actions")).toHaveClass("absolute");
    expect(screen.getByTestId("event-layout-actions").firstElementChild).toHaveClass("flex-wrap");
    expect(screen.queryByRole("button", { name: "Align left" })).not.toBeInTheDocument();

    fireEvent.click(arrange);
    expect(screen.getByRole("button", { name: "Align left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Align left" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const visibleLeft = (id: string) => {
      const node = screen.getByTestId(`event-furniture-${id}`);
      const width = Number.parseFloat(node.style.width);
      const height = Number.parseFloat(node.style.height);
      const degrees = Number(node.style.transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1] ?? 0);
      const radians = degrees * Math.PI / 180;
      const visualWidth = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
      return Number.parseFloat(node.style.left) + width / 2 - visualWidth / 2;
    };

    expect(visibleLeft("chair-1")).toBeCloseTo(visibleLeft("chair-2"));
    expect(screen.getByTestId("event-furniture-chair-3")).toHaveStyle({ left: "140px" });
  });

  it("disables Arrange when fewer than two selected furniture items are unlocked", () => {
    setInspectorViewport(false);
    const chairs = [
      { ...overlayWithChair.eventFurniture![0], id: "chair-1", x: 20 },
      { ...overlayWithChair.eventFurniture![0], id: "chair-2", x: 100, locked: true },
    ];
    render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlay, eventFurniture: chairs }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-1"), { button: 0, clientX: 20, clientY: 20 });
    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-2"), { button: 0, shiftKey: true, clientX: 100, clientY: 20 });
    const arrange = screen.getByRole("button", { name: "Arrange selected items" });
    expect(arrange).toBeDisabled();
    expect(arrange).toHaveAttribute("title", "Select at least two unlocked items to arrange.");
  });

  it("arranges unlocked furniture without moving a locked selected item", () => {
    setInspectorViewport(false);
    const chairs = [20, 100, 220].map((x, index) => ({
      ...overlayWithChair.eventFurniture![0],
      id: `chair-${index + 1}`,
      x,
      locked: index === 2,
    }));
    render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlay, eventFurniture: chairs }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);

    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-1"), { button: 0, clientX: 20, clientY: 20 });
    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-2"), { button: 0, shiftKey: true, clientX: 100, clientY: 20 });
    fireEvent.mouseDown(screen.getByTestId("event-furniture-chair-3"), { button: 0, shiftKey: true, clientX: 220, clientY: 20 });
    const lockedPosition = screen.getByTestId("event-furniture-chair-3").style.left;

    fireEvent.click(screen.getByRole("button", { name: "Arrange selected items" }));
    fireEvent.click(screen.getByRole("button", { name: "Distribute horizontally" }));

    expect(screen.getByTestId("event-furniture-chair-3")).toHaveStyle({ left: lockedPosition });
    expect(screen.getByTestId("event-furniture-chair-1").style.left).not.toBe("20px");
  });

  it("previews mobile Move here, cancels without changes, and commits one undoable move", () => {
    setInspectorViewport(true);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    const original = { left: item.style.left, top: item.style.top };
    fireEvent.pointerDown(item, { pointerId: 7101, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
    fireEvent.pointerUp(window, { pointerId: 7101, pointerType: "touch", clientX: 36, clientY: 36 });
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    fireEvent.click(canvas, { clientX: 220, clientY: 160 });
    expect(screen.getByTestId("event-move-here-preview")).toBeInTheDocument();
    expect(item.style.left).toBe(original.left);
    expect(item.style.top).toBe(original.top);
    fireEvent.click(screen.getByRole("button", { name: "Cancel move" }));
    expect(screen.queryByTestId("event-move-here-preview")).not.toBeInTheDocument();
    expect(item.style.left).toBe(original.left);
    expect(item.style.top).toBe(original.top);

    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    fireEvent.click(canvas, { clientX: 220, clientY: 160 });
    fireEvent.click(screen.getByRole("button", { name: "Confirm move here" }));
    expect(item.style.left).not.toBe(original.left);
    expect(item.style.top).not.toBe(original.top);
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();
  });

  it("does not restore an unrelated undone item when confirming a pending Move here preview", () => {
    setInspectorViewport(true);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    const countFurniture = () => canvas.querySelectorAll("[data-event-item]").length;
    const chair = screen.getByTestId("event-furniture-chair-1");
    fireEvent.pointerDown(chair, { pointerId: 7111, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
    fireEvent.pointerUp(window, { pointerId: 7111, pointerType: "touch", clientX: 36, clientY: 36 });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate selected item" }));
    expect(countFurniture()).toBe(2);

    fireEvent.pointerDown(chair, { pointerId: 7112, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
    fireEvent.pointerUp(window, { pointerId: 7112, pointerType: "touch", clientX: 36, clientY: 36 });
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    fireEvent.click(canvas, { clientX: 220, clientY: 160 });
    expect(screen.getByRole("button", { name: "Confirm move here" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(countFurniture()).toBe(1);
    expect(screen.queryByRole("button", { name: "Confirm move here" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("event-move-here-preview")).not.toBeInTheDocument();
    expect(countFurniture()).toBe(1);
  });

  it.each(["redo", "duplicate"])("invalidates Move here after an intervening %s without replacing live furniture", (action) => {
    setInspectorViewport(true);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    const selectChair = (pointerId: number) => {
      const chair = screen.getByTestId("event-furniture-chair-1");
      fireEvent.pointerDown(chair, { pointerId, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
      fireEvent.pointerUp(window, { pointerId, pointerType: "touch", clientX: 36, clientY: 36 });
    };
    selectChair(7120);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate selected item" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    selectChair(7121);
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    fireEvent.click(canvas, { clientX: 220, clientY: 160 });
    expect(screen.getByTestId("event-move-here-preview")).toBeInTheDocument();
    if (action === "redo") fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    else fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(2);
    expect(screen.getByTestId("event-furniture-chair-1")).toHaveStyle({ left: "24px", top: "24px" });
    expect(screen.queryByTestId("event-move-here-preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm move here" })).not.toBeInTheDocument();
  });

  it("disables Move here for a group containing a locked member", () => {
    setInspectorViewport(true);
    const group = [
      { ...overlayWithChair.eventFurniture![0], id: "group-a", groupId: "group-1", x: 24 },
      { ...overlayWithChair.eventFurniture![0], id: "group-b", groupId: "group-1", x: 80, locked: true },
    ];
    render(<EventFloorEditor floorPlan={floorPlan} overlay={{ ...overlay, eventFurniture: group }} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const item = screen.getByTestId("event-furniture-group-a");
    fireEvent.pointerDown(item, { pointerId: 7102, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
    fireEvent.pointerUp(window, { pointerId: 7102, pointerType: "touch", clientX: 36, clientY: 36 });
    const move = screen.getByRole("button", { name: "Move here" });
    expect(move).toBeDisabled();
    expect(move).toHaveAttribute("title", "This group contains a locked item. Unlock every group member before moving it.");
  });

  it("keeps Move here armed without committing when the map is panned", () => {
    setInspectorViewport(true);
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlayWithChair} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const canvas = screen.getByLabelText("Event layout canvas");
    const item = screen.getByTestId("event-furniture-chair-1");
    fireEvent.pointerDown(item, { pointerId: 7103, pointerType: "touch", button: 0, clientX: 36, clientY: 36 });
    fireEvent.pointerUp(window, { pointerId: 7103, pointerType: "touch", clientX: 36, clientY: 36 });
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    fireEvent.pointerDown(canvas, { pointerId: 7104, pointerType: "touch", button: 0, clientX: 200, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 7104, pointerType: "touch", clientX: 230, clientY: 190 });
    fireEvent.pointerUp(window, { pointerId: 7104, pointerType: "touch", clientX: 230, clientY: 190 });
    expect(screen.getByText("Tap a map destination. The preview will not move items until you confirm." )).toBeInTheDocument();
    expect(screen.queryByTestId("event-move-here-preview")).not.toBeInTheDocument();
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

  it("previews an asset without committing it and places exactly the shown candidate", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.pointerMove(canvas, { pointerId: 701, pointerType: "mouse", clientX: 100, clientY: 100 });

    const ghost = screen.getByTestId("event-placement-preview");
    const ghostLeft = ghost.style.left;
    const ghostTop = ghost.style.top;
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(0);
    expect(screen.getByText(/Ready to place: Booth/)).toBeInTheDocument();

    fireEvent.click(canvas, { clientX: 100, clientY: 100 });
    const placed = canvas.querySelector("[data-event-item]") as HTMLElement;
    expect(placed.style.left).toBe(ghostLeft);
    expect(placed.style.top).toBe(ghostTop);
    expect(screen.queryByTestId("event-placement-preview")).not.toBeInTheDocument();
  });

  it("requires an explicit Place here action after a touch tap", () => {
    render(<EventFloorEditor floorPlan={floorPlan} overlay={overlay} onSave={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Furniture$/ }));
    const canvas = screen.getByLabelText("Event layout canvas");
    fireEvent.pointerDown(canvas, { pointerId: 702, pointerType: "touch", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 702, pointerType: "touch", button: 0, clientX: 100, clientY: 100 });
    fireEvent.click(canvas, { clientX: 100, clientY: 100 });

    expect(screen.getByTestId("event-placement-preview")).toBeInTheDocument();
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Place here" }));
    expect(canvas.querySelectorAll("[data-event-item]")).toHaveLength(1);
  });
});
