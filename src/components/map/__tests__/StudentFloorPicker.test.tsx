import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeStudentFloorPickerLayout, StudentFloorPicker } from "../StudentFloorPicker";

const floors = [
  { number: 1, label: "Ground Floor" },
  { number: 2, label: "Floor 2" },
  { number: 3, label: "Floor 3" },
  { number: 4, label: "Floor 4" },
];

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top, toJSON: () => ({}) } as DOMRect;
}

function renderPicker({ width = 390, height = 760, floorOptions = floors, routePanelOpen = false, onSelect = vi.fn(), onFallbackOpenChange = vi.fn(), onMapPointerDown = vi.fn() } = {}) {
  setViewport(width, height);
  const view = render(
    <div data-testid="student-map-surface" onPointerDown={onMapPointerDown}>
      <div data-map-search-header="true" />
      <StudentFloorPicker
        buildingName="Student Center"
        floors={floorOptions}
        activeFloor={1}
        routeFloors={[3]}
        routePanelOpen={routePanelOpen}
        onSelect={onSelect}
        onFallbackOpenChange={onFallbackOpenChange}
      />
    </div>,
  );
  const surface = screen.getByTestId("student-map-surface");
  const header = surface.querySelector<HTMLElement>("[data-map-search-header='true']")!;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(rect(0, 0, width, height));
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue(rect(0, 0, width, 56));
  const trigger = screen.getByRole("button", { name: /Choose floor/ });
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect(width - 100, 78, width - 12, 122));
  return { ...view, trigger, onSelect, onFallbackOpenChange, onMapPointerDown, surface };
}

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  vi.restoreAllMocks();
});

describe("StudentFloorPicker", () => {
  it("opens a compact menu anchored below the mobile Floor chip", () => {
    const { trigger } = renderPicker();
    expect(screen.getByTestId("student-floor-picker")).toHaveAttribute("data-dock", "floor-control-top");
    expect(trigger).toHaveClass("min-h-11");
    fireEvent.click(trigger);
    const menu = screen.getByTestId("student-floor-picker-menu");
    expect(menu).toHaveAttribute("data-placement", "below");
    expect(menu).toHaveClass("fixed", "overflow-hidden");
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThan(122);
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(menu.style.left) + Number.parseFloat(menu.style.width)).toBeLessThanOrEqual(378);
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  it("keeps the desktop trigger anchored at the upper right in normal and route states", () => {
    const normal = renderPicker({ width: 1024, height: 768 });
    const root = screen.getByTestId("student-floor-picker");
    expect(root).toHaveClass("md:right-4", "md:top-4");
    expect(root.className).not.toContain("md:bottom-8");
    normal.unmount();

    renderPicker({ width: 1024, height: 768, routePanelOpen: true });
    expect(screen.getByTestId("student-floor-picker")).toHaveClass("md:right-4", "md:top-4");
  });

  it("presents the embedded Floor action as a focused theme-aware sheet", async () => {
    setViewport(390, 844);
    const onFallbackOpenChange = vi.fn();
    const view = render(
      <div data-testid="student-map-surface">
        <div data-map-search-header="true" />
        <StudentFloorPicker embedded buildingCode="CABA" buildingName="College of Accountancy and Business Administration" floors={floors} activeFloor={1} onSelect={vi.fn()} onFallbackOpenChange={onFallbackOpenChange} />
      </div>,
    );
    const surface = screen.getByTestId("student-map-surface");
    const header = surface.querySelector<HTMLElement>("[data-map-search-header='true']")!;
    const trigger = screen.getByRole("button", { name: /Choose floor/ });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(rect(0, 0, 390, 844));
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue(rect(0, 0, 390, 56));
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect(250, 350, 360, 394));

    fireEvent.click(trigger);
    const menu = await screen.findByTestId("student-floor-picker-menu");
    expect(menu).toHaveAttribute("data-placement", "sheet");
    expect(menu).toHaveClass("bg-card", "text-foreground");
    expect(menu).toHaveTextContent("CABA");
    expect(menu).toHaveTextContent("Choose floor");
    await waitFor(() => expect(onFallbackOpenChange).toHaveBeenCalledWith(true));
    view.unmount();
  });

  it("keeps only the embedded trigger visible on mobile while a route panel is open", () => {
    setViewport(390, 844);
    render(
      <div data-testid="student-map-surface">
        <StudentFloorPicker buildingName="Student Center" floors={floors} activeFloor={1} routePanelOpen onSelect={vi.fn()} />
        <StudentFloorPicker embedded buildingName="Student Center" floors={floors} activeFloor={1} routePanelOpen onSelect={vi.fn()} />
      </div>,
    );

    expect(screen.getByTestId("student-floor-picker")).toHaveClass("hidden", "md:block");
    expect(screen.getByTestId("student-floor-picker-inline")).toHaveClass("md:hidden");
    expect(screen.getAllByRole("button", { name: /Choose floor/ })).toHaveLength(2);
  });

  it("flips above the chip and remains within the visible surface when the lower area is short", () => {
    const { trigger } = renderPicker({ height: 370 });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect(280, 285, 378, 329));
    fireEvent.click(trigger);
    const menu = screen.getByTestId("student-floor-picker-menu");
    expect(menu).toHaveAttribute("data-placement", "above");
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(64);
    expect(Number.parseFloat(menu.style.top) + Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(277);
  });

  it("keeps a narrow-phone menu inside the viewport without switching to a sheet unnecessarily", () => {
    const { trigger } = renderPicker({ width: 320, height: 640 });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect(220, 78, 308, 122));
    fireEvent.click(trigger);
    const menu = screen.getByTestId("student-floor-picker-menu");
    expect(menu).not.toHaveAttribute("role", "dialog");
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(menu.style.left) + Number.parseFloat(menu.style.width)).toBeLessThanOrEqual(308);
  });

  it.each([320, 360, 390, 430, 768, 1024])("keeps the Floor menu within a %ipx-wide visible viewport", (width) => {
    const { trigger } = renderPicker({ width, height: 760 });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect(width - 100, 78, width - 12, 122));
    fireEvent.click(trigger);
    const menu = screen.getByTestId("student-floor-picker-menu");
    const left = Number.parseFloat(menu.style.left);
    const menuWidth = Number.parseFloat(menu.style.width);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + menuWidth).toBeLessThanOrEqual(width - 12);
    expect(Number.parseFloat(menu.style.top) + Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(672);
  });

  it("uses a compact modal only when there is not enough room for the anchored menu", async () => {
    const { trigger, onFallbackOpenChange } = renderPicker({ width: 320, height: 280 });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect(220, 108, 308, 152));
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Student Center" });
    expect(dialog).toHaveAttribute("data-placement", "sheet");
    expect(Number.parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(280 * 0.72);
    expect(await screen.findByRole("listbox", { name: "Floors in Student Center" })).toBeInTheDocument();
    expect(onFallbackOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Student Center" })).not.toBeInTheDocument());
    expect(onFallbackOpenChange).toHaveBeenLastCalledWith(false);
    expect(trigger).toHaveFocus();
  });

  it("keeps route planning state external and preserves the chosen Floor and route-floor cue", () => {
    const onSelect = vi.fn();
    const { trigger } = renderPicker({ routePanelOpen: true, onSelect });
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: /Ground Floor/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Floor 3.*Route/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Floor 2/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(2);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-label", "Choose floor. Current floor: Ground Floor");
  });

  it("supports keyboard open, option movement, selection, and focus return", async () => {
    const onSelect = vi.fn();
    const { trigger } = renderPicker({ onSelect });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const selected = screen.getByRole("option", { name: /Ground Floor/ });
    expect(selected).toHaveFocus();
    fireEvent.keyDown(selected, { key: "ArrowDown" });
    const secondFloor = screen.getByRole("option", { name: /Floor 2/ });
    expect(secondFloor).toHaveFocus();
    fireEvent.keyDown(secondFloor, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(2);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps Floor Picker keyboard commands from reaching map camera shortcuts", async () => {
    const globalKey = vi.fn();
    window.addEventListener("keydown", globalKey);
    try {
      const { trigger } = renderPicker();
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
      expect(globalKey).not.toHaveBeenCalled();

      const current = screen.getByRole("option", { name: /Ground Floor/ });
      fireEvent.keyDown(current, { key: "ArrowDown" });
      expect(globalKey).not.toHaveBeenCalled();

      fireEvent.keyDown(current, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
      expect(globalKey).not.toHaveBeenCalled();
      expect(trigger).toHaveFocus();
    } finally {
      window.removeEventListener("keydown", globalKey);
    }
  });

  it("keeps eight floors in a bounded internal scroll region", () => {
    const manyFloors = Array.from({ length: 8 }, (_, index) => ({ number: index + 1, label: index === 0 ? "Ground Floor" : "Floor " + (index + 1) }));
    const { trigger } = renderPicker({ floorOptions: manyFloors });
    fireEvent.click(trigger);
    const menu = screen.getByTestId("student-floor-picker-menu");
    expect(menu.style.maxHeight).toBe("352px");
    expect(screen.getAllByRole("option")).toHaveLength(8);
    expect(screen.getByRole("listbox")).toHaveClass("overflow-y-auto");
  });

  it("does not show an unnecessary Floor control in a one-Floor building", () => {
    render(
      <div data-testid="student-map-surface">
        <StudentFloorPicker buildingName="Student Center" floors={[{ number: 1, label: "Ground Floor" }]} activeFloor={1} onSelect={vi.fn()} />
      </div>,
    );
    expect(screen.queryByTestId("student-floor-picker")).not.toBeInTheDocument();
  });

  it("computes anchored coordinates independently from the trigger's fixed visual size", () => {
    const input = {
      trigger: { left: 290, top: 160, right: 360, bottom: 204 },
      viewport: { left: 0, top: 0, width: 390, height: 800 },
      surface: { left: 0, right: 390, top: 0, bottom: 800 },
      headerBottom: 56,
      floorCount: 4,
      mobile: true,
    };
    const normal = computeStudentFloorPickerLayout(input);
    const panned = computeStudentFloorPickerLayout({ ...input, surface: { ...input.surface, top: -120, bottom: 680 } });
    expect(normal.kind).toBe("popover");
    expect(normal.top).toBeGreaterThan(input.trigger.bottom);
    expect(panned.top).toBeGreaterThan(input.trigger.bottom);
    expect(normal.left).toBe(panned.left);
  });

  it("falls back to the modal when a visible panel blocks both anchored positions", () => {
    const layout = computeStudentFloorPickerLayout({
      trigger: { left: 290, top: 160, right: 360, bottom: 204 },
      viewport: { left: 0, top: 0, width: 390, height: 800 },
      surface: { left: 0, right: 390, top: 0, bottom: 800 },
      headerBottom: 56,
      floorCount: 4,
      mobile: true,
      obstacles: [{ left: 0, right: 390, top: 210, bottom: 700 }],
    });
    expect(layout.kind).toBe("sheet");
  });

  it("keeps menu pointer input from bubbling to the map surface", () => {
    const onMapPointerDown = vi.fn();
    const { trigger } = renderPicker({ onMapPointerDown });
    fireEvent.click(trigger);
    onMapPointerDown.mockClear();
    fireEvent.pointerDown(screen.getByRole("option", { name: /Floor 2/ }));
    expect(onMapPointerDown).not.toHaveBeenCalled();
  });

  it("uses the first outside map tap only to dismiss the menu", () => {
    const onMapPointerDown = vi.fn();
    const { trigger, surface } = renderPicker({ onMapPointerDown });
    fireEvent.click(trigger);
    onMapPointerDown.mockClear();
    fireEvent.pointerDown(surface);
    expect(onMapPointerDown).not.toHaveBeenCalled();
    expect(screen.queryByTestId("student-floor-picker-menu")).not.toBeInTheDocument();
  });
});
