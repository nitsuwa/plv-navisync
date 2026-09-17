import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSpacePan } from "../useSpacePan";

describe("useSpacePan", () => {
  it("tracks a held Space key and prevents page scrolling", () => {
    const { result } = renderHook(() => useSpacePan(true));
    const event = new KeyboardEvent("keydown", { code: "Space", key: " " });
    const preventDefault = vi.spyOn(event, "preventDefault");

    act(() => window.dispatchEvent(event));

    expect(result.current.spaceHeld).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("releases Space on keyup and ignores editable fields", () => {
    const { result } = renderHook(() => useSpacePan(true));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { code: "Space", key: " " });
    const preventDefault = vi.spyOn(event, "preventDefault");
    act(() => window.dispatchEvent(event));
    expect(result.current.spaceHeld).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();

    input.blur();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " })));
    expect(result.current.spaceHeld).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " })));
    expect(result.current.spaceHeld).toBe(false);

    input.remove();
  });
});
