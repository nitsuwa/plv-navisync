import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("shared theme preference", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("persists explicit choices and follows live system changes", async () => {
    const { useTheme } = await import("../useTheme");
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

  it("turns System into the opposite explicit theme when the Navbar toggle is used", async () => {
    const { useTheme } = await import("../useTheme");
    let systemThemeIsDark = false;
    let changeListener: ((event: { matches: boolean }) => void) | undefined;
    const media = {
      get matches() { return systemThemeIsDark; },
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

    act(() => result.current.toggleTheme());
    expect(result.current.preference).toBe("dark");
    expect(result.current.theme).toBe("dark");

    act(() => result.current.setThemePreference("system"));
    systemThemeIsDark = true;
    act(() => changeListener?.({ matches: true }));
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggleTheme());
    expect(result.current.preference).toBe("light");
    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem("plv-theme-preference")).toBe("light");
    expect(localStorage.getItem("plv-theme")).toBe("light");
  });

  it("synchronizes Navbar and Settings subscribers, including cross-tab storage changes", async () => {
    const { useTheme } = await import("../useTheme");
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const navbar = renderHook(() => useTheme());
    const settings = renderHook(() => useTheme());

    act(() => navbar.result.current.setThemePreference("dark"));
    expect(navbar.result.current).toMatchObject({ preference: "dark", theme: "dark" });
    expect(settings.result.current).toMatchObject({ preference: "dark", theme: "dark" });
    expect(document.documentElement).toHaveClass("dark");

    localStorage.setItem("plv-theme-preference", "light");
    localStorage.setItem("plv-theme", "light");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "plv-theme-preference", newValue: "light" })));

    expect(navbar.result.current).toMatchObject({ preference: "light", theme: "light" });
    expect(settings.result.current).toMatchObject({ preference: "light", theme: "light" });
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("restores the saved preference when the page's theme module is recreated", async () => {
    const firstModule = await import("../useTheme");
    const firstPage = renderHook(() => firstModule.useTheme());
    act(() => firstPage.result.current.setThemePreference("dark"));
    firstPage.unmount();

    vi.resetModules();
    const reloadedModule = await import("../useTheme");
    const reloadedPage = renderHook(() => reloadedModule.useTheme());

    expect(reloadedPage.result.current).toMatchObject({ preference: "dark", theme: "dark" });
    expect(document.documentElement).toHaveClass("dark");
  });
});
