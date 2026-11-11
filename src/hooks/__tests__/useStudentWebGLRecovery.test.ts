import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudentWebGLRecovery } from "../useStudentWebGLRecovery";

afterEach(() => vi.useRealTimers());

it("redraws after WebGL restoration and falls back when the next loss persists", () => {
  vi.useFakeTimers();
  const surface = document.createElement("div");
  const canvas = document.createElement("canvas");
  const invalidate = vi.fn();
  const onFallback = vi.fn();
  const { unmount } = renderHook(() =>
    useStudentWebGLRecovery({ current: surface }, { current: invalidate }, "test renderer", onFallback),
  );
  surface.appendChild(canvas);

  const lost = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(lost);
  expect(lost.defaultPrevented).toBe(true);
  expect(onFallback).not.toHaveBeenCalled();

  canvas.dispatchEvent(new Event("webglcontextrestored"));
  vi.runOnlyPendingTimers();
  expect(invalidate).toHaveBeenCalledOnce();
  expect(onFallback).not.toHaveBeenCalled();

  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  vi.runOnlyPendingTimers();
  expect(onFallback).toHaveBeenCalledOnce();

  canvas.dispatchEvent(new Event("webglcontextrestored"));
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  unmount();
  vi.runOnlyPendingTimers();
  expect(onFallback).toHaveBeenCalledOnce();
});
