import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEventViewportMotion } from "../useEventViewportMotion";

function createRafScheduler() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    request: vi.fn((callback: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    }),
    cancel: vi.fn((id: number) => {
      pending.delete(id);
    }),
    runFrame(now: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(now));
    },
    pendingCount: () => pending.size,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useEventViewportMotion", () => {
  it("eases toward an exact clamped transform", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => ({ x: Math.max(-100, pan.x), y: Math.max(-100, pan.y) }),
      reducedMotion: false,
    }));

    act(() => result.current.animateTo({ zoom: 2, pan: { x: -200, y: -40 } }, 200));
    expect(result.current.zoom).toBe(1);
    expect(result.current.targetRef.current).toEqual({ zoom: 2, pan: { x: -100, y: -40 } });

    act(() => frames.shift()?.(0));
    act(() => frames.shift()?.(100));
    expect(result.current.zoom).toBeGreaterThan(1);
    expect(result.current.zoom).toBeLessThan(2);

    act(() => frames.shift()?.(200));
    expect(result.current.zoom).toBe(2);
    expect(result.current.pan).toEqual({ x: -100, y: -40 });
  });

  it("applies the target immediately when reduced motion is enabled", () => {
    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: true,
    }));

    act(() => result.current.animateTo({ zoom: 1.5, pan: { x: 24, y: -12 } }));

    expect(result.current.zoom).toBe(1.5);
    expect(result.current.pan).toEqual({ x: 24, y: -12 });
  });

  it("keeps current, target, and rendered state synchronized for reduced-motion commands", () => {
    const requestFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => ({ x: Math.max(-15, Math.min(15, pan.x)), y: pan.y }),
      reducedMotion: true,
    }));

    act(() => result.current.animateTo({ zoom: 1.25, pan: { x: 40, y: -8 } }));

    expect(requestFrame).not.toHaveBeenCalled();
    expect(result.current.currentRef.current).toEqual({ zoom: 1.25, pan: { x: 15, y: -8 } });
    expect(result.current.targetRef.current).toEqual(result.current.currentRef.current);
    expect({ zoom: result.current.zoom, pan: result.current.pan }).toEqual(result.current.currentRef.current);
  });

  it("keeps target synchronized for zero-duration commands without reduced motion", () => {
    const requestFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: false,
    }));

    act(() => result.current.animateTo({ zoom: 1.1, pan: { x: 12, y: 7 } }, 0));

    expect(requestFrame).not.toHaveBeenCalled();
    expect(result.current.targetRef.current).toEqual(result.current.currentRef.current);
    expect(result.current.targetRef.current).toEqual({ zoom: 1.1, pan: { x: 12, y: 7 } });
  });

  it("accumulates repeated reduced-motion commands from the synchronized target", () => {
    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: true,
    }));

    for (let index = 1; index <= 3; index += 1) {
      act(() => {
        const nextX = result.current.targetRef.current.pan.x + 10;
        result.current.animateTo({ zoom: 1, pan: { x: nextX, y: 0 } });
      });
      expect(result.current.targetRef.current.pan.x).toBe(index * 10);
      expect(result.current.currentRef.current.pan.x).toBe(index * 10);
      expect(result.current.pan.x).toBe(index * 10);
    }
  });

  it("synchronizes the target to the visible frame when an animation is interrupted", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: false,
    }));

    act(() => result.current.animateTo({ zoom: 2, pan: { x: 100, y: 40 } }, 200));
    act(() => frames.shift()?.(0));
    act(() => frames.shift()?.(80));
    const visible = { zoom: result.current.zoom, pan: { ...result.current.pan } };

    act(() => result.current.cancelMotion());

    expect(result.current.targetRef.current).toEqual(visible);
  });

  it("retargets continuous wheel motion on one animation frame loop", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: false,
    }));

    act(() => result.current.animateTo({ zoom: 1, pan: { x: 20, y: 0 } }, 120));
    expect(frames).toHaveLength(1);
    act(() => result.current.animateTo({ zoom: 1, pan: { x: 80, y: 0 } }, 120));
    expect(frames).toHaveLength(1);
    act(() => frames.shift()?.(0));
    act(() => frames.shift()?.(120));

    expect(result.current.pan.x).toBe(80);
  });

  it("keeps measurable progress during continuous 8ms wheel retargeting", () => {
    const scheduler = createRafScheduler();
    vi.stubGlobal("requestAnimationFrame", scheduler.request);
    vi.stubGlobal("cancelAnimationFrame", scheduler.cancel);

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: false,
    }));

    act(() => result.current.animateTo({ zoom: 1, pan: { x: 10, y: 0 } }, 120));
    act(() => scheduler.runFrame(0));

    for (let time = 8; time <= 160; time += 8) {
      act(() => result.current.animateTo({ zoom: 1, pan: { x: time + 10, y: 0 } }, 120));
      if (time % 16 === 0) act(() => scheduler.runFrame(time));
      if (time === 64) expect(result.current.pan.x).toBeGreaterThan(0);
    }

    expect(scheduler.pendingCount()).toBe(1);
    act(() => scheduler.runFrame(288));
    expect(result.current.pan.x).toBe(170);
    expect(result.current.targetRef.current).toEqual(result.current.currentRef.current);
  });

  it("retargets a reversing wheel stream from the last rendered frame", () => {
    const scheduler = createRafScheduler();
    vi.stubGlobal("requestAnimationFrame", scheduler.request);
    vi.stubGlobal("cancelAnimationFrame", scheduler.cancel);

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: false,
    }));

    act(() => result.current.animateTo({ zoom: 1, pan: { x: 100, y: 0 } }, 120));
    act(() => scheduler.runFrame(0));
    act(() => scheduler.runFrame(40));
    const visibleBeforeReverse = result.current.pan.x;

    act(() => result.current.animateTo({ zoom: 1, pan: { x: -50, y: 0 } }, 120));
    act(() => scheduler.runFrame(56));
    expect(result.current.pan.x).toBeLessThan(visibleBeforeReverse);
    expect(result.current.pan.x).toBeGreaterThan(-50);

    act(() => scheduler.runFrame(160));
    expect(result.current.pan.x).toBe(-50);
  });

  it("does not allow a canceled wheel frame to apply a late transform", () => {
    const scheduler = createRafScheduler();
    vi.stubGlobal("requestAnimationFrame", scheduler.request);
    vi.stubGlobal("cancelAnimationFrame", scheduler.cancel);

    const { result } = renderHook(() => useEventViewportMotion({
      initialZoom: 1,
      initialPan: { x: 0, y: 0 },
      clampPan: (pan) => pan,
      reducedMotion: false,
    }));

    act(() => result.current.animateTo({ zoom: 1, pan: { x: 100, y: 0 } }, 120));
    act(() => scheduler.runFrame(0));
    act(() => result.current.cancelMotion());
    const visible = { zoom: result.current.zoom, pan: { ...result.current.pan } };

    expect(scheduler.pendingCount()).toBe(0);
    act(() => scheduler.runFrame(240));
    expect({ zoom: result.current.zoom, pan: result.current.pan }).toEqual(visible);
  });
});
