import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEventAutosave } from "../useEventAutosave";

afterEach(() => vi.useRealTimers());
describe("event autosave", () => {
  it("debounces edits and saves only when enabled", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(true);
    const view = renderHook(({ revision, enabled }) => useEventAutosave(true, enabled, revision, save), { initialProps: { revision: 1, enabled: true } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(save).not.toHaveBeenCalled();
    view.rerender({ revision: 2, enabled: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(view.result.current).toBe("Saved");
    view.rerender({ revision: 3, enabled: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("reports failed saves without discarding or repeatedly retrying", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(false);
    const view = renderHook(() => useEventAutosave(true, true, 1, save));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(view.result.current).toBe("Autosave failed — use Save draft to retry");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("does not retry the same failed edit when saving briefly disables the hook", async () => {
    vi.useFakeTimers();
    let resolveSave!: (saved: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>((resolve) => { resolveSave = resolve; }));
    const view = renderHook(({ enabled }) => useEventAutosave(true, enabled, 1, save), { initialProps: { enabled: true } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    view.rerender({ enabled: false });
    await act(async () => { resolveSave(false); });
    view.rerender({ enabled: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(view.result.current).toBe("Autosave failed — use Save draft to retry");
  });
});
