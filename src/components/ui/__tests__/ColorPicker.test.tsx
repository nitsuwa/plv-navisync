import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ColorPicker } from "../ColorPicker";

describe("ColorPicker positioning", () => {
  it("keeps the portaled panel comfortably inside the viewport and flips above low triggers", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });

    render(<ColorPicker value="#336699" onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Open color picker" });
    Object.defineProperty(trigger, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 340,
        top: 570,
        right: 470,
        bottom: 610,
        width: 130,
        height: 40,
        x: 340,
        y: 570,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(trigger);

    const panel = screen.getByTestId("color-picker-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.style.position).toBe("fixed");
    expect(Number.parseFloat(panel.style.top)).toBeLessThan(570);
    expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(24);
    expect(Number.parseFloat(panel.style.top) + 300).toBeLessThanOrEqual(640 - 24);
  });

  it("cancels an active drag when the window loses focus", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#336699" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Open color picker" });
    fireEvent.click(trigger);

    const hueBar = screen.getByTestId("color-picker-hue-bar");
    Object.defineProperty(hueBar, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 180, bottom: 24, width: 180, height: 24 }),
    });

    fireEvent.pointerDown(hueBar, { pointerId: 7, pointerType: "mouse", button: 0, clientX: 20, clientY: 12 });
    const callsBeforeBlur = onChange.mock.calls.length;

    // Leaving the control while holding the pointer must not clamp the hue
    // to the red edge of the rainbow.
    fireEvent.pointerMove(window, { pointerId: 7, pointerType: "mouse", clientX: -40, clientY: 12 });
    expect(onChange).toHaveBeenCalledTimes(callsBeforeBlur);

    window.dispatchEvent(new Event("blur"));
    fireEvent.pointerMove(window, { pointerId: 7, pointerType: "mouse", clientX: 160, clientY: 12 });

    expect(onChange).toHaveBeenCalledTimes(callsBeforeBlur);
  });

  it("keeps the active hue when the controlled value echoes a grayscale drag", () => {
    const onChange = vi.fn();

    function ControlledPicker() {
      const [color, setColor] = useState("#336699");
      return <ColorPicker value={color} onChange={(next) => { onChange(next); setColor(next); }} />;
    }

    render(<ControlledPicker />);

    fireEvent.click(screen.getByRole("button", { name: "Open color picker" }));
    const square = screen.getByTestId("color-picker-sat-light-square");
    Object.defineProperty(square, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 185, bottom: 160, width: 185, height: 160 }),
    });

    // First remove saturation. The hue must remain 210° internally even
    // though #808080 itself has no meaningful hue.
    fireEvent.pointerDown(square, { pointerId: 8, pointerType: "mouse", button: 0, clientX: 0, clientY: 80 });
    fireEvent.pointerMove(square, { pointerId: 8, pointerType: "mouse", clientX: 92.5, clientY: 80 });

    expect(onChange).toHaveBeenLastCalledWith("#406080");
  });

  it("uses the upper-right of the square for a vivid color instead of white", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#e08248" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Open color picker" }));
    const square = screen.getByTestId("color-picker-sat-light-square");
    Object.defineProperty(square, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 185, bottom: 160, width: 185, height: 160 }),
    });

    fireEvent.pointerDown(square, { pointerId: 9, pointerType: "mouse", button: 0, clientX: 185, clientY: 0 });

    expect(onChange).toHaveBeenLastCalledWith("#ff6200");
  });
});
