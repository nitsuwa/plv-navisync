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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

  it("interpolates wheel zoom through one RAF target and commits only after it settles", () => {
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

    const wheel = (deltaY: number) => result.current.handleWheel({
      ctrlKey: true,
      metaKey: false,
      deltaY,
      deltaMode: 0,
      clientX: 250,
      clientY: 250,
      currentTarget: { clientHeight: 500 },
      preventDefault: vi.fn(),
    } as unknown as React.WheelEvent<HTMLDivElement>);
    act(() => wheel(100));

    expect(renders).toBe(rendersBeforeWheel);
    expect(raf.callbacks.size).toBe(1);
    const firstFrameTime = performance.now() + 17;
    act(() => raf.flush(firstFrameTime));
    expect(renders).toBe(rendersBeforeWheel);
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: -100, y: -100 });
    const firstScale = Number(transform.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1]);
    expect(firstScale).toBeLessThan(1);
    expect(firstScale).toBeGreaterThan(0.89);
    expect(transform.getAttribute("transform")).not.toBe("translate(-61.5,-61.5) scale(0.89)");

    act(() => wheel(-50));
    expect(raf.callbacks.size).toBe(1);
    let timestamp = firstFrameTime;
    for (let frame = 0; frame < 40 && raf.callbacks.size > 0; frame += 1) {
      timestamp += 17;
      act(() => raf.flush(timestamp));
    }
    expect(result.current.zoom).toBeCloseTo(0.945);
    expect(result.current.pan).not.toEqual({ x: -100, y: -100 });
    expect(transform.getAttribute("transform")).toBe(`translate(${result.current.pan.x},${result.current.pan.y}) scale(${result.current.zoom})`);
    expect(renders).toBeGreaterThan(rendersBeforeWheel);
    expect(raf.callbacks.size).toBe(0);
  });

  it("moves the Floor camera on the first Pan or Space-pan pointer move", () => {
    installAnimationFrameQueue();
    const transform = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const { result } = renderHook(() => useCanvasControls(500, 500, {
      imperativeCamera: true, immediatePan: true, svgPanCoordinateSpace: true,
    }));
    attachCanvasRefs(result, transform);
    act(() => result.current.startPan({ clientX: 100, clientY: 100 } as MouseEvent));
    act(() => result.current.movePan({ clientX: 80, clientY: 90 } as MouseEvent));
    expect(transform.getAttribute("transform")).toBe("translate(-20,-10) scale(1)");
    act(() => result.current.endPan());
    expect(result.current.pan).toEqual({ x: -20, y: -10 });
  });

  it("keeps deliberate zoom actions animated and yields smoothly to wheel input", () => {
    const raf = installAnimationFrameQueue();
    const transform = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const { result } = renderHook(() => useCanvasControls(500, 500, { imperativeCamera: true }));
    attachCanvasRefs(result, transform);

    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(1);
    expect(transform.getAttribute("transform")).toBeNull();
    act(() => raf.flush(performance.now() + 40));
    const inFlightScale = Number(transform.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1]);
    expect(inFlightScale).toBeGreaterThan(1);
    expect(inFlightScale).toBeLessThan(1.25);

    const beforeWheel = transform.getAttribute("transform");
    act(() => result.current.handleWheel({
      ctrlKey: true, metaKey: false, deltaY: 100, deltaMode: 0,
      clientX: 250, clientY: 250, currentTarget: { clientHeight: 500 }, preventDefault: vi.fn(),
    } as unknown as React.WheelEvent<HTMLDivElement>));
    expect(transform.getAttribute("transform")).toBe(beforeWheel);
    let timestamp = performance.now() + 57;
    for (let frame = 0; frame < 40 && raf.callbacks.size > 0; frame += 1) {
      timestamp += 17;
      act(() => raf.flush(timestamp));
    }
    expect(result.current.zoom).toBeLessThan(1.25);
    expect(raf.callbacks.size).toBe(0);
  });

  it("keeps the world point under the cursor stable through interpolated zoom", () => {
    const raf = installAnimationFrameQueue();
    const transform = document.createElementNS("http://www.w3.org/2000/svg", "g");
    Object.defineProperty(transform, "getScreenCTM", {
      value: () => {
        const value = transform.getAttribute("transform") ?? "translate(0,0) scale(1)";
        const [x = "0", y = "0"] = value.match(/translate\(([^,]+),([^)]+)\)/)?.slice(1) ?? [];
        const scale = Number(value.match(/scale\(([^)]+)\)/)?.[1] ?? 1);
        return { a: scale, b: 0, c: 0, d: scale, e: Number(x), f: Number(y) };
      },
    });
    const { result } = renderHook(() => useCanvasControls(500, 500, { mode: "viewer", imperativeCamera: true }));
    attachCanvasRefs(result, transform);
    result.current.containerRef.current = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    } as unknown as HTMLDivElement;

    act(() => result.current.handleWheel({
      ctrlKey: true, metaKey: false, deltaY: -100, deltaMode: 0,
      clientX: 200, clientY: 200, currentTarget: { clientHeight: 500 }, preventDefault: vi.fn(),
    } as unknown as React.WheelEvent<HTMLDivElement>));

    const immediateScale = Number(transform.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1] ?? 1);
    expect(immediateScale).toBe(1);
    let timestamp = performance.now();
    for (let frame = 0; frame < 40 && raf.callbacks.size > 0; frame += 1) {
      timestamp += 17;
      act(() => raf.flush(timestamp));
      const liveMatrix = (transform as unknown as SVGGraphicsElement).getScreenCTM()!;
      expect((200 - liveMatrix.e) / liveMatrix.a).toBeCloseTo(200, 3);
      expect((200 - liveMatrix.f) / liveMatrix.d).toBeCloseTo(200, 3);
    }

    const finalMatrix = (transform as unknown as SVGGraphicsElement).getScreenCTM()!;
    const finalWorldX = (200 - finalMatrix.e) / finalMatrix.a;
    const finalWorldY = (200 - finalMatrix.f) / finalMatrix.d;
    expect(finalWorldX).toBeCloseTo(200, 3);
    expect(finalWorldY).toBeCloseTo(200, 3);
    expect(raf.callbacks.size).toBe(0);
  });

  it("converts pointerdown through the live camera matrix, independent of SVG child target and layout shift", () => {
    const transform = document.createElementNS("http://www.w3.org/2000/svg", "g");
    let matrix = { a: 2.5, b: 0, c: 0, d: 2.5, e: 400 + 20, f: 120 - 12 };
    Object.defineProperty(transform, "getScreenCTM", { value: () => matrix });
    const { result } = renderHook(() => useCanvasControls(500, 500, { imperativeCamera: true }));
    attachCanvasRefs(result, transform);

    const screenPoint = { clientX: 400 + 20 + 100 * 2.5, clientY: 120 - 12 + 80 * 2.5 };
    const emptySvgClick = { ...screenPoint, target: document.createElementNS("http://www.w3.org/2000/svg", "svg") } as unknown as MouseEvent;
    const childPathClick = { ...screenPoint, target: document.createElementNS("http://www.w3.org/2000/svg", "path") } as unknown as MouseEvent;
    expect(result.current.getPoint(emptySvgClick, 500, 500)).toEqual({ x: 100, y: 80 });
    expect(result.current.getPoint(childPathClick, 500, 500)).toEqual({ x: 100, y: 80 });

    // A sidebar can translate the SVG without changing its mocked dimensions.
    // The old cached-rect path would miss this origin shift.
    matrix = { ...matrix, e: 760 + 20 };
    const shiftedClick = { clientX: 760 + 20 + 100 * 2.5, clientY: screenPoint.clientY } as MouseEvent;
    expect(result.current.getPoint(shiftedClick, 500, 500)).toEqual({ x: 100, y: 80 });
  });

  it("lets outdoor authored edges pan into the center of the measured usable viewport", () => {
    const transform = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const { result } = renderHook(() => useCanvasControls(3_000, 1_000, {
      imperativeCamera: true,
      immediatePan: true,
      centerMapEdges: true,
    }));
    const usableRect = { left: 224, top: 0, width: 680, height: 700 };
    result.current.containerRef.current = { getBoundingClientRect: () => usableRect } as unknown as HTMLDivElement;
    result.current.svgRef.current = {
      getBoundingClientRect: () => usableRect,
      viewBox: { baseVal: { x: 0, y: 0, width: 3_000, height: 1_000 } },
      style: { cursor: "grab" },
    } as unknown as SVGSVGElement;
    result.current.cameraTransformRef.current = transform as SVGGElement;

    act(() => {
      result.current.startPan({ clientX: 0, clientY: 0 } as MouseEvent);
      result.current.movePan({ clientX: -1_600, clientY: 0 } as MouseEvent);
    });
    expect(Number(transform.getAttribute("transform")?.match(/translate\(([^,]+)/)?.[1])).toBeCloseTo(-1_600);
    act(() => result.current.endPan());

    act(() => {
      result.current.startPan({ clientX: 0, clientY: 0 } as MouseEvent);
      result.current.movePan({ clientX: 3_200, clientY: 0 } as MouseEvent);
    });
    expect(Number(transform.getAttribute("transform")?.match(/translate\(([^,]+)/)?.[1])).toBeCloseTo(1_600);
    act(() => result.current.endPan());
  });
});
