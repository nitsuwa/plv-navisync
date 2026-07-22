import { useState, useRef, useCallback, useEffect } from "react";

// ── Animation constants ─────────────────────────────────────────────────────
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_DURATION_MS = 180;
const WHEEL_ZOOM_DURATION_MS = 200;
const WHEEL_SENSITIVITY = 0.001;
const SCROLL_LINE_SENSITIVITY = 0.05;
const ZOOM_BUTTON_STEP = 0.25;

// ── Spacebar pan state (module-level ref so all hooks instances share) ──────
// Use a ref rather than state to avoid re-renders on every space press
const spacePressedRef = { current: false };

export function isSpacePressed() {
  return spacePressedRef.current;
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
export function useCanvasControls(canvasW: number, canvasH: number) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // ── Refs for smooth animation ───────────────────────────────────────────
  const currentZoom = useRef(1);
  const currentPan = useRef({ x: 0, y: 0 });
  const targetZoom = useRef(1);
  const targetPan = useRef({ x: 0, y: 0 });
  const animStartTime = useRef(0);
  const animStartZoom = useRef(1);
  const animStartPan = useRef({ x: 0, y: 0 });
  const animDuration = useRef(ZOOM_DURATION_MS);
  const animFrame = useRef<number | null>(null);
  const animating = useRef(false);

  // ── Shared state refs ───────────────────────────────────────────────────
  const panning = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Start or continue the animation loop ────────────────────────────────
  const startAnimation = useCallback((duration?: number) => {
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
      const newPanX = animStartPan.current.x + (targetPan.current.x - animStartPan.current.x) * eased;
      const newPanY = animStartPan.current.y + (targetPan.current.y - animStartPan.current.y) * eased;

      currentZoom.current = newZoom;
      currentPan.current = { x: newPanX, y: newPanY };

      // Update React state for rendering (triggers re-render for zoom % display)
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });

      if (progress >= 1) {
        // Snap to exact target values
        currentZoom.current = targetZoom.current;
        currentPan.current = { ...targetPan.current };
        setZoom(targetZoom.current);
        setPan({ ...targetPan.current });
        animFrame.current = null;
        animating.current = false;
        return;
      }

      animFrame.current = requestAnimationFrame(tick);
    };

    animFrame.current = requestAnimationFrame(tick);
  }, []);

  // ── Cancel animation loop on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animFrame.current !== null) {
        cancelAnimationFrame(animFrame.current);
      }
    };
  }, []);

  // ── Convert screen coords to canvas coords ──────────────────────────────
  const getPoint = useCallback(
    (e: React.MouseEvent | MouseEvent, cw: number, ch: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const z = currentZoom.current;
      const p = currentPan.current;
      return {
        x: (((e.clientX - rect.left) / rect.width) * cw - p.x) / z,
        y: (((e.clientY - rect.top) / rect.height) * ch - p.y) / z,
      };
    },
    []
  );

  // ── Convert screen coords to SVG world coords (helper for zoom-to-cursor) ─
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const z = currentZoom.current;
      const p = currentPan.current;
      return {
        x: (((clientX - rect.left) / rect.width) * canvasW - p.x) / z,
        y: (((clientY - rect.top) / rect.height) * canvasH - p.y) / z,
      };
    },
    [canvasW, canvasH]
  );

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
      duration?: number
    ) => {
      const clampedZoom = clamp(newZoom, ZOOM_MIN, ZOOM_MAX);
      const oldZoom = currentZoom.current;

      let newPanX = targetPan.current.x;
      let newPanY = targetPan.current.y;

      if (clientX !== undefined && clientY !== undefined) {
        // Zoom toward cursor: keep the world point under the cursor fixed
        const world = screenToWorld(clientX, clientY);
        if (world) {
          const svg = svgRef.current;
          if (svg) {
            const rect = svg.getBoundingClientRect();
            newPanX = ((clientX - rect.left) / rect.width) * canvasW - world.x * clampedZoom;
            newPanY = ((clientY - rect.top) / rect.height) * canvasH - world.y * clampedZoom;
          } else {
            newPanX = canvasW / 2 - world.x * clampedZoom;
            newPanY = canvasH / 2 - world.y * clampedZoom;
          }
        }
      } else {
        // No cursor point: zoom from center, adjust pan to keep center fixed
        const zoomRatio = clampedZoom / oldZoom;
        newPanX = currentPan.current.x * zoomRatio + (canvasW / 2) * (1 - zoomRatio);
        newPanY = currentPan.current.y * zoomRatio + (canvasH / 2) * (1 - zoomRatio);
      }

      targetZoom.current = clampedZoom;
      targetPan.current = { x: newPanX, y: newPanY };

      startAnimation(duration);
    },
    [canvasW, canvasH, screenToWorld, startAnimation]
  );

  // ── Global keyboard listener for spacebar pan ──────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        // Don't intercept space when typing in text fields
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.getAttribute("contenteditable") === "true") return;
        e.preventDefault();
        spacePressedRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spacePressedRef.current = false;
        endPan();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      spacePressedRef.current = false;
    };
  }, []);

  // ── Panning ─────────────────────────────────────────────────────────────
  const startPan = useCallback((e: React.MouseEvent) => {
    panning.current = { sx: e.clientX, sy: e.clientY, ox: currentPan.current.x, oy: currentPan.current.y };
  }, []);

  const isMiddleClick = (e: React.MouseEvent | MouseEvent) => e.button === 1;

  const movePan = useCallback((e: React.MouseEvent) => {
    if (!panning.current) return;
    const newPan = {
      x: panning.current.ox + e.clientX - panning.current.sx,
      y: panning.current.oy + e.clientY - panning.current.sy,
    };
    // Update both ref and state immediately for responsive panning
    currentPan.current = newPan;
    targetPan.current = { ...newPan };
    setPan(newPan);
  }, []);

  const endPan = useCallback(() => {
    panning.current = null;
  }, []);

  const handleMiddleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMiddleClick(e)) {
        e.preventDefault();
        startPan(e);
      }
    },
    [startPan]
  );

  // ── Scroll-wheel zoom (Ctrl+wheel, zoom toward cursor) ──────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const delta = e.deltaMode === 1 ? e.deltaY * SCROLL_LINE_SENSITIVITY : e.deltaY * WHEEL_SENSITIVITY;
      const currentZ = targetZoom.current;
      const newZoom = clamp(currentZ - delta, ZOOM_MIN, ZOOM_MAX);

      // If at limit, stop
      if (newZoom === currentZ) return;

      smoothZoomTo(newZoom, e.clientX, e.clientY, WHEEL_ZOOM_DURATION_MS);
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [smoothZoomTo]);

  // ── Zoom in/out buttons ─────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const newZoom = clamp(targetZoom.current + ZOOM_BUTTON_STEP, ZOOM_MIN, ZOOM_MAX);
    // Zoom from center (no cursor position)
    const zoomRatio = newZoom / currentZoom.current;
    const newPanX = currentPan.current.x * zoomRatio + (canvasW / 2) * (1 - zoomRatio);
    const newPanY = currentPan.current.y * zoomRatio + (canvasH / 2) * (1 - zoomRatio);

    targetZoom.current = newZoom;
    targetPan.current = { x: newPanX, y: newPanY };
    startAnimation();
  }, [canvasW, canvasH, startAnimation]);

  const zoomOut = useCallback(() => {
    const newZoom = clamp(targetZoom.current - ZOOM_BUTTON_STEP, ZOOM_MIN, ZOOM_MAX);
    const zoomRatio = newZoom / currentZoom.current;
    const newPanX = currentPan.current.x * zoomRatio + (canvasW / 2) * (1 - zoomRatio);
    const newPanY = currentPan.current.y * zoomRatio + (canvasH / 2) * (1 - zoomRatio);

    targetZoom.current = newZoom;
    targetPan.current = { x: newPanX, y: newPanY };
    startAnimation();
  }, [canvasW, canvasH, startAnimation]);

  // ── Reset view (animated) ───────────────────────────────────────────────
  const resetView = useCallback(() => {
    targetZoom.current = 1;
    targetPan.current = { x: 0, y: 0 };
    startAnimation(ZOOM_DURATION_MS);
  }, [startAnimation]);

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

      const containerRect = container.getBoundingClientRect();
      const pxPerUnit = containerRect.width / svg.viewBox.baseVal.width;
      const fitZoomX = ((containerRect.width - padding * 2) / w) / pxPerUnit;
      const fitZoomY = ((containerRect.height - padding * 2) / h) / pxPerUnit;
      const fitZoom = Math.min(fitZoomX, fitZoomY, 3);
      const clampedZoom = clamp(fitZoom, ZOOM_MIN, 3);
      const centerX = x + w / 2;
      const centerY = y + h / 2;

      targetZoom.current = clampedZoom;
      targetPan.current = {
        x: canvasW / 2 - centerX * clampedZoom,
        y: canvasH / 2 - centerY * clampedZoom,
      };
      startAnimation(ZOOM_DURATION_MS);
    },
    [canvasW, canvasH, startAnimation]
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
    getPoint,
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
  };
}
