import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommittedNumberInput } from "../CommittedNumberInput";

describe("CommittedNumberInput", () => {
  it("keeps clearing and typing local until the field is committed", () => {
    const onCommit = vi.fn();
    render(<CommittedNumberInput aria-label="Width" value={59} onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Width" });

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "42" } });
    expect(input).toHaveValue("42");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it("rejects invalid drafts and clamps valid values on commit", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<CommittedNumberInput aria-label="Width" value={59} min={10} max={72} onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Width" });

    fireEvent.change(input, { target: { value: "not-a-number" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("59");

    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(72);

    rerender(<CommittedNumberInput aria-label="Width" value={72} min={10} max={72} onCommit={onCommit} />);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("72");
  });

  it("supports one-unit and shift-ten-unit keyboard steps", () => {
    const onStep = vi.fn();
    render(<CommittedNumberInput aria-label="Length" value={95} onCommit={vi.fn()} onStep={onStep} />);
    const input = screen.getByRole("textbox", { name: "Length" });

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });

    expect(onStep).toHaveBeenNthCalledWith(1, 1, 95);
    expect(onStep).toHaveBeenNthCalledWith(2, -10, 95);
  });
});
