import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook managing SVG canvas pan, zoom, and coordinate transforms.
 */
export function useCanvasControls(_canvasW: number, _canvasH: number) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panning = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll-wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 0.05 : e.deltaY * 0.001;
      setZoom((z) => parseFloat(Math.max(0.25, Math.min(4, z - delta)).toFixed(3)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  /** Convert screen coordinates to canvas coordinates */
  const getPoint = useCallback(
    (e: React.MouseEvent | MouseEvent, cw: number, ch: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (((e.clientX - rect.left) / rect.width) * cw - pan.x) / zoom,
        y: (((e.clientY - rect.top) / rect.height) * ch - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const startPan = (e: React.MouseEvent) => {
    panning.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
  };

  const movePan = (e: React.MouseEvent) => {
    if (!panning.current) return;
    setPan({
      x: panning.current.ox + e.clientX - panning.current.sx,
      y: panning.current.oy + e.clientY - panning.current.sy,
    });
  };

  const endPan = () => {
    panning.current = null;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));

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
  };
}
