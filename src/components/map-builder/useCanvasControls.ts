import { useState, useRef, useCallback, useEffect } from "react";
import { screenToWorld, screenPointToLocalCoordinates, screenPixelsToWorldDistance, panToKeepWorldPoint, type ScreenRect } from "../../lib/editorPlacement";
import { clampViewportPan, dampCameraZoomLogarithm, getViewportFitZoom, getViewportPanBounds, normalizeStudentMapWheelDelta, type MapViewportInsets, type MapViewportPanBounds } from "../../lib/mapViewport";

// ── Animation constants ─────────────────────────────────────────────────────
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_DURATION_MS = 180;
const WHEEL_ZOOM_DURATION_MS = 200;
const ZOOM_BUTTON_STEP = 0.25;
const EDITOR_WORKSPACE_PADDING = 180;

interface WheelZoomAnchor {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
  svgRect: ScreenRect;
  mapWidth: number;
  mapHeight: number;
  origin: { x: number; y: number };
}

// ── Spacebar pan state (module-level ref so all hooks instances share) ──────
// Use a ref rather than state to avoid re-renders on every space press
const spacePressedRef = { current: false };

const spacePanSubscribers = new Set<(pressed: boolean) => void>();

function updateSpacePressed(pressed: boolean) {
  if (spacePressedRef.current === pressed) return;
  spacePressedRef.current = pressed;
  spacePanSubscribers.forEach((subscriber) => subscriber(pressed));
}

function isSpacePanBlockedTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : document.activeElement;
  if (!(element instanceof Element)) return false;
  return element.matches("input, textarea, select, [role='textbox']")
    || (element as HTMLElement).isContentEditable
    || element.closest("[contenteditable='true']") !== null;
}

export function isSpacePressed() {
  return spacePressedRef.current;
}

/** Subscribe UI that needs to reflect the temporary pan state immediately. */
export function useSpacePressedState() {
  const [pressed, setPressed] = useState(spacePressedRef.current);
  useEffect(() => {
    spacePanSubscribers.add(setPressed);
    setPressed(spacePressedRef.current);
    return () => { spacePanSubscribers.delete(setPressed); };
  }, []);
  return pressed;
}

// ── Easing function (cubic ease-out) ───────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Clamp a value between min and max */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Hook managing SVG canvas pan, zoom, and coordinate transforms.
 * Features smooth animated zoom toward cursor position (like Figma/Canva).
 */
export interface CanvasViewportOptions {
  mode?: "editor" | "viewer";
  editorPadding?: number;
  /** Screen-space areas reserved by fixed editor UI over the canvas. */
  insets?: MapViewportInsets;
  /** Optional world-space area rendered by the SVG viewBox, including content
   * that extends beyond the base canvas. */
  worldBounds?: { x: number; y: number; width: number; height: number };
  /** Update one SVG camera group directly during gestures, then publish React
   * state when the gesture/animation settles. Used by large map-editor scenes. */
  imperativeCamera?: boolean;
  /** Receives transient camera frames for small DOM-only viewport readouts. */
  onCameraFrame?: (zoom: number, pan: { x: number; y: number }) => void;
}

export function useCanvasControls(canvasW: number, canvasH: number, options: CanvasViewportOptions = {}) {
  const mode = options.mode ?? "editor";
  const workspacePadding = mode === "editor"
    ? Math.max(0, options.editorPadding ?? EDITOR_WORKSPACE_PADDING)
    : 0;
  const insetTop = Math.max(0, options.insets?.top ?? 0);
  const insetRight = Math.max(0, options.insets?.right ?? 0);
  const insetBottom = Math.max(0, options.insets?.bottom ?? 0);
  const insetLeft = Math.max(0, options.insets?.left ?? 0);
  const worldBounds = options.worldBounds;
  const imperativeCamera = options.imperativeCamera ?? false;
  const cameraFrameCallbackRef = useRef(options.onCameraFrame);
  cameraFrameCallbackRef.current = options.onCameraFrame;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // ── Refs for smooth animation ───────────────────────────────────────────
  const currentZoom = useRef(1);
  const currentPan = useRef({ x: 0, y: 0 });
  const endPanForSpaceRef = useRef<() => void>(() => {});
  const targetZoom = useRef(1);
  const targetLogZoom = useRef(0);
  const targetPan = useRef({ x: 0, y: 0 });
  const wheelZoomAnchorRef = useRef<WheelZoomAnchor | null>(null);
  const animStartTime = useRef(0);
  const animStartZoom = useRef(1);
  const animStartPan = useRef({ x: 0, y: 0 });
  const animDuration = useRef(ZOOM_DURATION_MS);
  const animFrame = useRef<number | null>(null);
  const animating = useRef(false);
  const animationModeRef = useRef<"programmatic" | "wheel">("programmatic");

  // ── Shared state refs ───────────────────────────────────────────────────
  const panning = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraTransformRef = useRef<SVGGElement>(null);
  const viewportRectsRef = useRef<{ container: ScreenRect; svg?: ScreenRect } | null>(null);
  const clampPanRef = useRef<(point: { x: number; y: number }, zoomValue: number) => { x: number; y: number }>((point) => point);
  const panFrameRef = useRef<number | null>(null);
  const latestPanPointerRef = useRef<{ x: number; y: number } | null>(null);
  const panCursorBeforeRef = useRef<string | null>(null);

  const measureViewport = useCallback(() => {
    const container = containerRef.current?.getBoundingClientRect();
    if (!container) return;
    const svg = svgRef.current?.getBoundingClientRect();
    viewportRectsRef.current = {
      container: { left: container.left, top: container.top, width: container.width, height: container.height },
      ...(svg ? { svg: { left: svg.left, top: svg.top, width: svg.width, height: svg.height } } : {}),
    };
  }, []);

  useEffect(() => {
    measureViewport();
    const container = containerRef.current;
    const svg = svgRef.current;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureViewport);
    if (container) observer?.observe(container);
    if (svg) observer?.observe(svg);
    window.addEventListener("resize", measureViewport);
    // A scroll can move the editor without changing its observed dimensions.
    window.addEventListener("scroll", measureViewport, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureViewport);
      window.removeEventListener("scroll", measureViewport, true);
    };
  }, [measureViewport]);

  const getSvgRect = useCallback((): ScreenRect | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  }, []);

  const applyCameraTransform = useCallback((nextPan: { x: number; y: number }, nextZoom: number) => {
    if (imperativeCamera) {
      cameraTransformRef.current?.setAttribute("transform", `translate(${nextPan.x},${nextPan.y}) scale(${nextZoom})`);
    }
    cameraFrameCallbackRef.current?.(nextZoom, nextPan);
  }, [imperativeCamera]);

  const getPanBounds = useCallback((zoomValue: number): MapViewportPanBounds => {
    const rect = viewportRectsRef.current?.container ?? containerRef.current?.getBoundingClientRect();
    return getViewportPanBounds({
      mapWidth: Math.max(1, worldBounds?.width ?? canvasW),
      mapHeight: Math.max(1, worldBounds?.height ?? canvasH),
      viewportWidth: rect?.width || canvasW,
      viewportHeight: rect?.height || canvasH,
      zoom: zoomValue,
      padding: workspacePadding,
      insets: { top: insetTop, right: insetRight, bottom: insetBottom, left: insetLeft },
      zoomOrigin: "top-left",
      worldOrigin: worldBounds ? { x: worldBounds.x, y: worldBounds.y } : undefined,
    });
  }, [canvasH, canvasW, insetBottom, insetLeft, insetRight, insetTop, worldBounds?.height, worldBounds?.width, worldBounds?.x, worldBounds?.y, workspacePadding]);

  const clampPan = useCallback((point: { x: number; y: number }, zoomValue = targetZoom.current) =>
    clampViewportPan(point, getPanBounds(zoomValue)), [getPanBounds]);

  useEffect(() => {
    clampPanRef.current = clampPan;
    const next = clampPan(currentPan.current, zoom);
    if (next.x !== currentPan.current.x || next.y !== currentPan.current.y) {
      currentPan.current = next;
      targetPan.current = next;
      applyCameraTransform(next, currentZoom.current);
      setPan(next);
    }
  }, [applyCameraTransform, clampPan, zoom]);

  // ── Start or continue the animation loop ────────────────────────────────
  const startAnimation = useCallback((duration?: number) => {
    // Programmatic actions take over from the live wheel frame, never from a
    // stale React state or a queued manual-wheel commit.
    if (animFrame.current !== null && animationModeRef.current === "wheel") {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
      animating.current = false;
    }
    animationModeRef.current = "programmatic";
    wheelZoomAnchorRef.current = null;
    if (duration !== undefined) {
      animDuration.current = duration;
    }
    // Reset animation start state if not already animating, or blend smoothly
    if (!animating.current) {
      animStartZoom.current = currentZoom.current;
      animStartPan.current = { ...currentPan.current };
      animStartTime.current = performance.now();
      animating.current = true;
    } else {
      // Continuous zoom: adjust the start values and time so the animation
      // continues smoothly from where we are (blending instead of restarting)
      const elapsed = performance.now() - animStartTime.current;
      const progress = clamp(elapsed / animDuration.current, 0, 1);
      const eased = easeOutCubic(progress);
      const curZ = animStartZoom.current + (targetZoom.current - animStartZoom.current) * eased;
      const curPx = animStartPan.current.x + (targetPan.current.x - animStartPan.current.x) * eased;
      const curPy = animStartPan.current.y + (targetPan.current.y - animStartPan.current.y) * eased;
      animStartZoom.current = curZ;
      animStartPan.current = { x: curPx, y: curPy };
      animStartTime.current = performance.now();
    }

    if (animFrame.current !== null) return;

    const tick = (now: number) => {
      const elapsed = now - animStartTime.current;
      const progress = clamp(elapsed / animDuration.current, 0, 1);
      const eased = easeOutCubic(progress);

      const newZoom = animStartZoom.current + (targetZoom.current - animStartZoom.current) * eased;
      const nextPan = clampPanRef.current({
        x: animStartPan.current.x + (targetPan.current.x - animStartPan.current.x) * eased,
        y: animStartPan.current.y + (targetPan.current.y - animStartPan.current.y) * eased,
      }, newZoom);
      const newPanX = nextPan.x;
      const newPanY = nextPan.y;

      currentZoom.current = newZoom;
      currentPan.current = { x: newPanX, y: newPanY };

      // The Floor Editor has one camera group containing the full authored
      // scene. Move that group directly while a camera animation is active so
      // pan/zoom frames do not rebuild the large React tree.
      applyCameraTransform(currentPan.current, newZoom);
      if (!imperativeCamera) {
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      }

      if (progress >= 1) {
        // Snap to exact target values
        currentZoom.current = targetZoom.current;
        currentPan.current = clampPanRef.current({ ...targetPan.current }, targetZoom.current);
        applyCameraTransform(currentPan.current, targetZoom.current);
        setZoom(targetZoom.current);
        setPan({ ...currentPan.current });
        animFrame.current = null;
        animating.current = false;
        return;
      }

      animFrame.current = requestAnimationFrame(tick);
    };

    animFrame.current = requestAnimationFrame(tick);
  }, [applyCameraTransform, imperativeCamera]);

  /** One target-driven RAF for continuous wheel/trackpad zoom. */
  const startWheelAnimation = useCallback(() => {
    if (animFrame.current !== null && animationModeRef.current === "wheel") return;
    if (animFrame.current !== null) cancelAnimationFrame(animFrame.current);
    animFrame.current = null;
    animationModeRef.current = "wheel";
    animating.current = true;

    let previousTime = performance.now();
    const tick = (now: number) => {
      const delta = Math.max(0, Math.min(64, now - previousTime));
      previousTime = now;
      const dampedZoom = dampCameraZoomLogarithm(currentZoom.current, targetZoom.current, delta, 34);
      const nextZoom = Math.abs(Math.log(targetZoom.current) - Math.log(dampedZoom)) < 0.0005
        ? targetZoom.current
        : dampedZoom;
      const anchor = wheelZoomAnchorRef.current;
      const anchoredPan = anchor
        ? panToKeepWorldPoint(
            anchor.clientX,
            anchor.clientY,
            anchor.svgRect,
            anchor.mapWidth,
            anchor.mapHeight,
            anchor.worldX,
            anchor.worldY,
            nextZoom,
            anchor.origin,
          )
        : {
            x: currentPan.current.x + (targetPan.current.x - currentPan.current.x) * (1 - Math.exp(-delta / 34)),
            y: currentPan.current.y + (targetPan.current.y - currentPan.current.y) * (1 - Math.exp(-delta / 34)),
          };
      const nextPan = clampPanRef.current(anchoredPan, nextZoom);
      currentZoom.current = nextZoom;
      currentPan.current = nextPan;
      applyCameraTransform(nextPan, nextZoom);
      if (!imperativeCamera) {
        setZoom(nextZoom);
        setPan({ ...nextPan });
      }

      const settled = Math.abs(Math.log(targetZoom.current) - Math.log(nextZoom)) < 0.0005
        && Math.abs(targetPan.current.x - nextPan.x) < 0.5
        && Math.abs(targetPan.current.y - nextPan.y) < 0.5;
      if (settled) {
        currentZoom.current = targetZoom.current;
        currentPan.current = { ...targetPan.current };
        applyCameraTransform(currentPan.current, targetZoom.current);
        setZoom(targetZoom.current);
        setPan({ ...currentPan.current });
        animFrame.current = null;
        animating.current = false;
        animationModeRef.current = "programmatic";
        targetLogZoom.current = Math.log(targetZoom.current);
        wheelZoomAnchorRef.current = null;
        return;
      }
      animFrame.current = requestAnimationFrame(tick);
    };

    animFrame.current = requestAnimationFrame(tick);
  }, [applyCameraTransform, imperativeCamera]);

  // ── Cancel animation loop on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animFrame.current !== null) {
        cancelAnimationFrame(animFrame.current);
      }
      if (panFrameRef.current !== null) {
        cancelAnimationFrame(panFrameRef.current);
      }
    };
  }, []);

  // ── Convert screen coords to canvas coords ──────────────────────────────
  // Delegates to the pure screenToWorld helper (src/lib/editorPlacement.ts),
  // which is unit-tested, so the tested math is the math used in production.
  // The helper is letterbox-aware (preserveAspectRatio="xMidYMid meet") and
  // guards against degenerate rects, so the visible cursor and the world
  // point always agree regardless of container aspect, zoom, pan, or a
  // freshly-created canvas that has not laid out yet.
  const clientToWorld = useCallback(
    (clientX: number, clientY: number, cw = canvasW, ch = canvasH): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const cameraMatrix = cameraTransformRef.current?.getScreenCTM?.();
      if (cameraMatrix) {
        const worldPoint = screenPointToLocalCoordinates(clientX, clientY, cameraMatrix);
        if (worldPoint) return worldPoint;
      }
      // Fallback for test/non-browser environments. Use the current rect so a
      // position-only sidebar shift cannot leave pointer conversion stale.
      const domRect = svg.getBoundingClientRect();
      const rect = { left: domRect.left, top: domRect.top, width: domRect.width, height: domRect.height };
      const viewBox = svg.viewBox.baseVal;
      const mapWidth = viewBox.width > 0 ? viewBox.width : cw;
      const mapHeight = viewBox.height > 0 ? viewBox.height : ch;
      const origin = viewBox.width > 0 && viewBox.height > 0 ? { x: viewBox.x, y: viewBox.y } : { x: 0, y: 0 };
      return screenToWorld(clientX, clientY, rect, mapWidth, mapHeight, currentPan.current, currentZoom.current, origin);
    },
    [canvasW, canvasH]
  );

  const getPoint = useCallback(
    (e: Pick<MouseEvent, "clientX" | "clientY">, cw: number, ch: number): { x: number; y: number } =>
      clientToWorld(e.clientX, e.clientY, cw, ch),
    [clientToWorld],
  );

  // ── Convert screen coords to SVG world coords (helper for zoom-to-cursor) ─
  // Same shared, letterbox-aware conversion as getPoint — never a second,
  // independent formula that could drift from pointer coordinates.
  const screenToWorldPt = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null =>
      svgRef.current ? clientToWorld(clientX, clientY) : null,
    [clientToWorld]
  );

  // Hit testing stays visually consistent at every zoom. The SVG viewBox can
  // be letterboxed inside its CSS box, so use the same content-box scale as
  // screenToWorld instead of dividing only by the camera zoom.
  const getWorldUnitsForScreenPixels = useCallback((pixels: number): number => {
    const cameraMatrix = cameraTransformRef.current?.getScreenCTM?.();
    if (cameraMatrix) {
      const effectiveScale = Math.hypot(cameraMatrix.a, cameraMatrix.b);
      if (Number.isFinite(effectiveScale) && effectiveScale > 0) return Math.abs(pixels) / effectiveScale;
    }
    const svg = svgRef.current;
    const domRect = svg?.getBoundingClientRect();
    if (!svg || !domRect) return Math.abs(pixels) / Math.max(currentZoom.current, Number.EPSILON);
    const rect = { left: domRect.left, top: domRect.top, width: domRect.width, height: domRect.height };
    const viewBox = svg.viewBox.baseVal;
    const mapWidth = viewBox.width > 0 ? viewBox.width : canvasW;
    const mapHeight = viewBox.height > 0 ? viewBox.height : canvasH;
    return screenPixelsToWorldDistance(pixels, rect, mapWidth, mapHeight, currentZoom.current);
  }, [canvasW, canvasH]);

  /**
   * Smoothly set target zoom/pan and start animation.
   * If client coordinates are provided, zoom toward that point (cursor).
   * Uses blending: if already animating, smoothly adjusts target.
   */
  const smoothZoomTo = useCallback(
    (
      newZoom: number,
      clientX?: number,
      clientY?: number,
      duration?: number,
      manualWheel = false,
    ) => {
      const clampedZoom = clamp(newZoom, ZOOM_MIN, ZOOM_MAX);
      const oldZoom = currentZoom.current;

      if (manualWheel) {
        let nextPan = { ...currentPan.current };
        const world = clientX !== undefined && clientY !== undefined ? screenToWorldPt(clientX, clientY) : null;
        const svg = svgRef.current;
        const rect = viewportRectsRef.current?.svg ?? getSvgRect();
        if (world && svg && rect && clientX !== undefined && clientY !== undefined) {
          const viewBox = svg.viewBox.baseVal;
          const mapWidth = viewBox.width > 0 ? viewBox.width : canvasW;
          const mapHeight = viewBox.height > 0 ? viewBox.height : canvasH;
          const origin = viewBox.width > 0 && viewBox.height > 0 ? { x: viewBox.x, y: viewBox.y } : { x: 0, y: 0 };
          const anchor: WheelZoomAnchor = {
            clientX, clientY, worldX: world.x, worldY: world.y,
            svgRect: { ...rect }, mapWidth, mapHeight, origin,
          };
          wheelZoomAnchorRef.current = anchor;
          nextPan = panToKeepWorldPoint(clientX, clientY, anchor.svgRect, mapWidth, mapHeight, world.x, world.y, clampedZoom, origin);
        } else {
          wheelZoomAnchorRef.current = null;
          const zoomRatio = clampedZoom / oldZoom;
          const viewBox = svgRef.current?.viewBox.baseVal;
          const centerX = viewBox && viewBox.width > 0 ? viewBox.x + viewBox.width / 2 : canvasW / 2;
          const centerY = viewBox && viewBox.height > 0 ? viewBox.y + viewBox.height / 2 : canvasH / 2;
          nextPan = {
            x: currentPan.current.x * zoomRatio + centerX * (1 - zoomRatio),
            y: currentPan.current.y * zoomRatio + centerY * (1 - zoomRatio),
          };
        }
        targetZoom.current = clampedZoom;
        targetLogZoom.current = Math.log(clampedZoom);
        targetPan.current = clampPanRef.current(nextPan, clampedZoom);
        startWheelAnimation();
        return;
      }

      let newPanX = targetPan.current.x;
      let newPanY = targetPan.current.y;

      if (clientX !== undefined && clientY !== undefined) {
        // Zoom toward cursor: keep the world point under the cursor fixed
        const world = screenToWorldPt(clientX, clientY);
        if (world) {
          const svg = svgRef.current;
          if (svg) {
            const rect = getSvgRect();
            if (!rect) return;
            const viewBox = svg.viewBox.baseVal;
            const mapWidth = viewBox.width > 0 ? viewBox.width : canvasW;
            const mapHeight = viewBox.height > 0 ? viewBox.height : canvasH;
            const origin = viewBox.width > 0 && viewBox.height > 0 ? { x: viewBox.x, y: viewBox.y } : { x: 0, y: 0 };
            const p = panToKeepWorldPoint(clientX, clientY, rect, mapWidth, mapHeight, world.x, world.y, clampedZoom, origin);
            newPanX = p.x;
            newPanY = p.y;
          } else {
            newPanX = canvasW / 2 - world.x * clampedZoom;
            newPanY = canvasH / 2 - world.y * clampedZoom;
          }
        }
      } else {
        // No cursor point: zoom from center, adjust pan to keep center fixed
        const zoomRatio = clampedZoom / oldZoom;
        const viewBox = svgRef.current?.viewBox.baseVal;
        const centerX = viewBox && viewBox.width > 0 ? viewBox.x + viewBox.width / 2 : canvasW / 2;
        const centerY = viewBox && viewBox.height > 0 ? viewBox.y + viewBox.height / 2 : canvasH / 2;
        newPanX = currentPan.current.x * zoomRatio + centerX * (1 - zoomRatio);
        newPanY = currentPan.current.y * zoomRatio + centerY * (1 - zoomRatio);
      }

      targetZoom.current = clampedZoom;
      targetPan.current = clampPanRef.current({ x: newPanX, y: newPanY }, clampedZoom);
      targetLogZoom.current = Math.log(clampedZoom);

      startAnimation(duration);
    },
    [canvasW, canvasH, getSvgRect, screenToWorldPt, startAnimation, startWheelAnimation]
  );

  // ── Global keyboard listener for spacebar pan ──────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        // Don't intercept Space while a form control or editable field owns it.
        if (isSpacePanBlockedTarget(e.target)) return;
        e.preventDefault();
        updateSpacePressed(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        updateSpacePressed(false);
        endPanForSpaceRef.current();
      }
    };
    const blur = () => {
      updateSpacePressed(false);
      endPanForSpaceRef.current();
    };
    const visibilityChange = () => {
      if (document.visibilityState === "hidden") blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibilityChange);
      updateSpacePressed(false);
    };
  }, []);

  // ── Panning ─────────────────────────────────────────────────────────────
  const startPan = useCallback((e: Pick<MouseEvent, "clientX" | "clientY">) => {
    if (animFrame.current !== null) cancelAnimationFrame(animFrame.current);
    animFrame.current = null;
    animating.current = false;
    animationModeRef.current = "programmatic";
    targetZoom.current = currentZoom.current;
    targetLogZoom.current = Math.log(currentZoom.current);
    targetPan.current = { ...currentPan.current };
    wheelZoomAnchorRef.current = null;
    if (imperativeCamera && !panning.current && svgRef.current) {
      panCursorBeforeRef.current = svgRef.current.style.cursor;
      svgRef.current.style.cursor = "grabbing";
    }
    panning.current = { sx: e.clientX, sy: e.clientY, ox: currentPan.current.x, oy: currentPan.current.y };
    latestPanPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [imperativeCamera]);

  const isMiddleClick = (e: React.MouseEvent | MouseEvent) => e.button === 1;

  const flushPendingPan = useCallback(() => {
    const gesture = panning.current;
    const pointer = latestPanPointerRef.current;
    if (!gesture || !pointer) return;
    const nextPan = clampPan({
      x: gesture.ox + pointer.x - gesture.sx,
      y: gesture.oy + pointer.y - gesture.sy,
    });
    currentPan.current = nextPan;
    targetPan.current = { ...nextPan };
    applyCameraTransform(nextPan, currentZoom.current);
  }, [applyCameraTransform, clampPan]);

  const movePan = useCallback((e: Pick<MouseEvent, "clientX" | "clientY">) => {
    if (!panning.current) return;
    if (imperativeCamera) {
      latestPanPointerRef.current = { x: e.clientX, y: e.clientY };
      if (panFrameRef.current === null) {
        panFrameRef.current = requestAnimationFrame(() => {
          panFrameRef.current = null;
          flushPendingPan();
        });
      }
      return;
    }
    const nextPan = clampPan({
      x: panning.current.ox + e.clientX - panning.current.sx,
      y: panning.current.oy + e.clientY - panning.current.sy,
    });
    currentPan.current = nextPan;
    targetPan.current = { ...nextPan };
    setPan(nextPan);
  }, [clampPan, flushPendingPan, imperativeCamera]);

  const endPan = useCallback(() => {
    if (imperativeCamera && panning.current) {
      if (panFrameRef.current !== null) {
        cancelAnimationFrame(panFrameRef.current);
        panFrameRef.current = null;
      }
      flushPendingPan();
      latestPanPointerRef.current = null;
      panning.current = null;
      if (svgRef.current && panCursorBeforeRef.current !== null) {
        svgRef.current.style.cursor = panCursorBeforeRef.current;
      }
      panCursorBeforeRef.current = null;
      // Publish only the final pan so camera-dependent editor UI catches up
      // once, after the direct SVG camera movement has finished.
      setPan({ ...currentPan.current });
      return;
    }
    panning.current = null;
  }, [flushPendingPan, imperativeCamera]);
  endPanForSpaceRef.current = endPan;

  const handleMiddleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMiddleClick(e)) {
        e.preventDefault();
        startPan(e);
      }
    },
    [startPan]
  );

  // ── Window-level capture listeners to block browser defaults ──
  // Chrome (v73+) treats wheel event listeners as passive by default,
  // which silently ignores preventDefault() in React synthetic handlers.
  // We use a capture-phase window listener with { passive: false } so
  // preventDefault() actually works AND we intercept the event before it
  // reaches any React handlers. The containerRef is checked at event time,
  // not at setup time, so this works even if the ref isn't populated yet.
  useEffect(() => {
    // Block Ctrl+Scroll / Cmd+Scroll from zooming the browser page
    const wheelHandler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      // Only prevent if the event is inside the canvas container
      if (containerRef.current?.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    // Block middle-click auto-scroll (the 4-direction arrow cursor)
    const mouseDownHandler = (e: MouseEvent) => {
      if (e.button === 1 && containerRef.current?.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    // Capture phase + passive: false ensures preventDefault works
    window.addEventListener("wheel", wheelHandler, { passive: false, capture: true });
    window.addEventListener("mousedown", mouseDownHandler, { capture: true });
    return () => {
      window.removeEventListener("wheel", wheelHandler, { capture: true });
      window.removeEventListener("mousedown", mouseDownHandler, { capture: true });
    };
  }, []);



  // ── Scroll-wheel zoom + trackpad pinch-to-zoom ──
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;

    // Note: e.preventDefault() is already handled by the native listener above,
    // but we keep it here too as a fallback for older browsers.
    e.preventDefault();

    const delta = normalizeStudentMapWheelDelta(e.deltaY, e.deltaMode, e.currentTarget.clientHeight);

    // When wheel input interrupts a programmatic move, start from its visible
    // frame rather than the old destination. Subsequent wheel events accumulate
    // on the live wheel target while its single RAF remains active.
    if (animFrame.current !== null && animationModeRef.current !== "wheel") {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
      animating.current = false;
      targetZoom.current = currentZoom.current;
      targetLogZoom.current = Math.log(currentZoom.current);
      targetPan.current = { ...currentPan.current };
      wheelZoomAnchorRef.current = null;
    }

    const isContinuingWheel = animFrame.current !== null && animationModeRef.current === "wheel";
    const baseLogZoom = isContinuingWheel ? targetLogZoom.current : Math.log(currentZoom.current);
    const newZoom = clamp(Math.exp(baseLogZoom - delta), ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(Math.log(newZoom) - baseLogZoom) < 1e-9) return;
    smoothZoomTo(newZoom, e.clientX, e.clientY, WHEEL_ZOOM_DURATION_MS, true);
  }, [smoothZoomTo]);

  // ── Zoom in/out buttons ─────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const newZoom = clamp(targetZoom.current + ZOOM_BUTTON_STEP, ZOOM_MIN, ZOOM_MAX);
    // Zoom from center (no cursor position)
    const zoomRatio = newZoom / currentZoom.current;
    const nextPan = clampPan({
      x: currentPan.current.x * zoomRatio + (canvasW / 2) * (1 - zoomRatio),
      y: currentPan.current.y * zoomRatio + (canvasH / 2) * (1 - zoomRatio),
    }, newZoom);

    targetZoom.current = newZoom;
    targetPan.current = nextPan;
    if (!imperativeCamera) setZoom(newZoom);
    startAnimation();
  }, [canvasW, canvasH, clampPan, imperativeCamera, startAnimation]);

  const zoomOut = useCallback(() => {
    const newZoom = clamp(targetZoom.current - ZOOM_BUTTON_STEP, ZOOM_MIN, ZOOM_MAX);
    const zoomRatio = newZoom / currentZoom.current;
    const nextPan = clampPan({
      x: currentPan.current.x * zoomRatio + (canvasW / 2) * (1 - zoomRatio),
      y: currentPan.current.y * zoomRatio + (canvasH / 2) * (1 - zoomRatio),
    }, newZoom);

    targetZoom.current = newZoom;
    targetPan.current = nextPan;
    if (!imperativeCamera) setZoom(newZoom);
    startAnimation();
  }, [canvasW, canvasH, clampPan, imperativeCamera, startAnimation]);

  // ── Reset view (animated) ───────────────────────────────────────────────
  const resetView = useCallback(() => {
    targetZoom.current = 1;
    targetPan.current = clampPan({ x: 0, y: 0 }, 1);
    startAnimation(ZOOM_DURATION_MS);
  }, [clampPan, startAnimation]);

  // ── Double-click to zoom in toward point (optional) ─────────────────────
  const zoomInAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const newZoom = clamp(targetZoom.current + ZOOM_BUTTON_STEP, ZOOM_MIN, ZOOM_MAX);
      smoothZoomTo(newZoom, clientX, clientY);
    },
    [smoothZoomTo]
  );

  // ── Zoom to a specific region (animated) ────────────────────────────────
  const zoomToFit = useCallback(
    (x: number, y: number, w: number, h: number, padding: number = 40) => {
      const svg = svgRef.current;
      const container = containerRef.current;
      if (!svg || !container) return;

      const containerRect = viewportRectsRef.current?.container ?? container.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;
      if (
        containerRect.width <= padding * 2 ||
        containerRect.height <= padding * 2 ||
        viewBox.width <= 0 ||
        viewBox.height <= 0 ||
        w <= 0 ||
        h <= 0
      ) return;
      const fitScale = getViewportFitZoom({
        mapWidth: viewBox.width,
        mapHeight: viewBox.height,
        viewportWidth: containerRect.width,
        viewportHeight: containerRect.height,
      });
      const letterboxX = Math.max(0, (containerRect.width - viewBox.width * fitScale) / 2);
      const letterboxY = Math.max(0, (containerRect.height - viewBox.height * fitScale) / 2);
      const availableWidth = Math.max(1, containerRect.width - insetLeft - insetRight - padding * 2);
      const availableHeight = Math.max(1, containerRect.height - insetTop - insetBottom - padding * 2);
      const fitZoomX = (availableWidth / w) / fitScale;
      const fitZoomY = (availableHeight / h) / fitScale;
      const fitZoom = Math.min(fitZoomX, fitZoomY, 3);
      const clampedZoom = clamp(fitZoom, ZOOM_MIN, 3);
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const visibleCenterX = (insetLeft + padding + containerRect.width - insetRight - padding) / 2;
      const visibleCenterY = (insetTop + padding + containerRect.height - insetBottom - padding) / 2;

      targetZoom.current = clampedZoom;
      targetPan.current = clampPan({
        x: viewBox.x + (visibleCenterX - letterboxX) / fitScale - centerX * clampedZoom,
        y: viewBox.y + (visibleCenterY - letterboxY) / fitScale - centerY * clampedZoom,
      }, clampedZoom);
      startAnimation(ZOOM_DURATION_MS);
    },
    [clampPan, insetBottom, insetLeft, insetRight, insetTop, startAnimation]
  );

  /** Zoom to show a specific building (animated) */
  const zoomToBuilding = useCallback(
    (bx: number, by: number, bw: number, bh: number) => {
      zoomToFit(bx, by, bw, bh);
    },
    [zoomToFit]
  );

  return {
    zoom,
    pan,
    panning,
    svgRef,
    containerRef,
    cameraTransformRef,
    getPoint,
    getWorldUnitsForScreenPixels,
    startPan,
    movePan,
    endPan,
    resetView,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomToBuilding,
    handleMiddleMouseDown,
    /** Zoom in at a specific screen point (for double-click) */
    zoomInAtPoint,
    handleWheel,
    mode,
  };
}
