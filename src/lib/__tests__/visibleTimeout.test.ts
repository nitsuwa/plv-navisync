import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleVisibleTimeout } from "../visibleTimeout";

describe("scheduleVisibleTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("pauses while hidden and resumes its full window when visible", () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "hidden";
    const documentRef = new EventTarget() as Document;
    Object.defineProperty(documentRef, "visibilityState", { get: () => visibilityState });
    const callback = vi.fn();
    const cleanup = scheduleVisibleTimeout(callback, 8000, documentRef);

    vi.advanceTimersByTime(20_000);
    expect(callback).not.toHaveBeenCalled();

    visibilityState = "visible";
    documentRef.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(7999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
    cleanup();
  });

  it("cleans up the timeout and visibility listener when recovery completes", () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "visible";
    const documentRef = new EventTarget() as Document;
    Object.defineProperty(documentRef, "visibilityState", { get: () => visibilityState });
    const callback = vi.fn();
    const cleanup = scheduleVisibleTimeout(callback, 8000, documentRef);

    cleanup();
    visibilityState = "hidden";
    documentRef.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(8000);

    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
