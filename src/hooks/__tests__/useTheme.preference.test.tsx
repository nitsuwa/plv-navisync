import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "../useTheme";

describe("shared theme preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("persists explicit choices and follows live system changes", () => {
    let changeListener: ((event: { matches: boolean }) => void) | undefined;
    const media = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn((_event: string, listener: (event: { matches: boolean }) => void) => { changeListener = listener; }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => media));

    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("light");

    act(() => result.current.setThemePreference("dark"));
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem("plv-theme-preference")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    act(() => result.current.setThemePreference("system"));
    media.matches = true;
    act(() => changeListener?.({ matches: true }));
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});
