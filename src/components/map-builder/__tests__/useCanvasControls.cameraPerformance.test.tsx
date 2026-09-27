import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { useCanvasControls } from "../useCanvasControls";

function installAnimationFrameQueue() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return {
    callbacks,
    flush(timestamp = performance.now() + 17) {
      const frame = Array.from(callbacks.values());
      callbacks.clear();
      frame.forEach((callback) => callback(timestamp));
    },
  };
}

function attachCanvasRefs(result: { current: ReturnType<typeof useCanvasControls> }, transform: SVGElement) {
  const containerRect = { left: 0, top: 0, width: 100, height: 100 };
  const svgRect = { left: 0, top: 0, width: 500, height: 500 };
  result.current.containerRef.current = { getBoundingClientRect: () => containerRect } as unknown as HTMLDivElement;
  result.current.svgRef.current = {
    getBoundingClientRect: () => svgRect,
    viewBox: { baseVal: { x: 0, y: 0, width: 500, height: 500 } },
    style: { cursor: "grab" },
  } as unknown as SVGSVGElement;
  result.current.cameraTransformRef.current = transform as SVGGElement;
}

describe("useCanvasControls imperative Floor camera", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("coalesces pan moves to one SVG transform per frame and publishes React state at release", () => {
    const raf = installAnimationFrameQueue();
    const transform = document.createElementNS("http://www.w3.org/2000/svg", "g");
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCanvasControls(500, 500, { imperativeCamera: true });
    });
    attachCanvasRefs(result, transform);

    const rendersBeforeStart = renders;
    act(() => result.current.startPan({ clientX: 100, clientY: 100 } as MouseEvent));
    expect(renders).toBe(rendersBeforeStart);
    expect(result.current.svgRef.current?.style.cursor).toBe("grabbing");
    const rendersAfterStart = renders;
    act(() => {
      result.current.movePan({ clientX: 80, clientY: 90 } as MouseEvent);
      result.current.movePan({ clientX: 60, clientY: 70 } as MouseEvent);
    });

    expect(renders).toBe(rendersAfterStart);
    expect(raf.callbacks.size).toBe(1);
    act(() => raf.flush());
    expect(renders).toBe(rendersAfterStart);
    expect(transform.getAttribute("transform")).toBe("translate(-40,-30) scale(1)");
    expect(result.current.pan).toEqual({ x: 0, y: 0 });

    act(() => result.current.endPan());
    expect(result.current.pan).toEqual({ x: -40, y: -30 });
    expect(result.current.svgRef.current?.style.cursor).toBe("grab");
  });

  it("keeps the same zoom-to-cursor result while rendering only the next camera frame", () => {
    const raf = installAnimationFrameQueue();
    const transform = document.createElementNS("http://www.w3.org/2000/svg", "g");
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCanvasControls(500, 500, { imperativeCamera: true });
    });
    attachCanvasRefs(result, transform);

    act(() => {
      result.current.startPan({ clientX: 100, clientY: 100 } as MouseEvent);
      result.current.movePan({ clientX: 0, clientY: 0 } as MouseEvent);
    });
    act(() => raf.flush());
    act(() => result.current.endPan());
    const rendersBeforeWheel = renders;

    act(() => result.current.handleWheel({
      ctrlKey: true,
      metaKey: false,
      deltaY: 100,
      deltaMode: 0,
      clientX: 250,
      clientY: 250,
      preventDefault: vi.fn(),
    } as unknown as React.WheelEvent<HTMLDivElement>));

    expect(renders).toBe(rendersBeforeWheel);
    expect(raf.callbacks.size).toBe(1);
    act(() => raf.flush(performance.now() + 250));
    expect(result.current.zoom).toBeCloseTo(0.9);
    expect(result.current.pan).toEqual({ x: -65, y: -65 });
    expect(transform.getAttribute("transform")).toBe("translate(-65,-65) scale(0.9)");
  });
});
