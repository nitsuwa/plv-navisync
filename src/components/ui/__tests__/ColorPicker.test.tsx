import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
});
