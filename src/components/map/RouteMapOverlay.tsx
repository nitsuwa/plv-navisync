import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Pt, RouteMode } from "../../lib/routePlanner";
import { cn } from "../../lib/utils";
import { useReducedMotion } from "../../hooks";

interface RouteMapOverlayProps {
  points: Pt[];
  mode: RouteMode;
  fading?: boolean;
  /** Controls presentation motion only; route geometry and selection are unchanged. */
  animated?: boolean;
  /** Keep moving arrows mounted at their current phase while playback is paused. */
  flowPaused?: boolean;
  /** 0..1 guided progress; omitted for the calm full-route preview. */
  walkProgress?: number;
  /** Split route strokes from their markers to keep authored transition markers above the line. */
  layer?: "all" | "line" | "markers";
  /** True only when THIS polyline contains the true route Start (A). */
  showStartMarker?: boolean;
  /** True only when THIS polyline ends at the true final destination (B). */
  showEndMarker?: boolean;
  /** Optional stable color used to distinguish concurrently visible approved routes. */
  routeColor?: string;
  /** Reduced emphasis for an alternative while another approved route is active. */
  opacity?: number;
  /** Optional dash cadence provides a second visual cue alongside route color. */
  routeDashArray?: string;
  /** Short route assignment label shown beside its start marker in overview mode. */
  routeLabel?: string;
  /** Renderer-owned Follow updates avoid reconciling the containing map scene each frame. */
  progressFrameWriterRef?: { current: ((progress: number) => void) | null };
}

/** One shared lap duration for every chevron on a route. Identical duration
 * across chevrons is what guarantees one animation phase: spacing is constant
 * and no chevron can ever overtake another. */
export const ROUTE_CHEVRON_LAP_SECONDS = 18;
export const ROUTE_CHEVRON_MIN = 2;
export const ROUTE_CHEVRON_MAX = 24;
export const ROUTE_CHEVRON_SPACING = 160;

/** SVG bearing in degrees, where 0 points right and positive angles turn down. */
export function segmentBearing(from: Pt, to: Pt): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** One SVG path of arrows sampled along the authored polyline in travel order.
 * It is derived from route points, never from the camera. */
export function routeChevronPath(points: readonly Pt[], spacing = 48, size = 9): string {
  if (points.length < 2) return "";
  const commands: string[] = [];
  let walked = 0;
  let nextArrow = spacing * 0.6;
  for (let index = 1; index < points.length && commands.length < 180; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const ux = dx / length;
    const uy = dy / length;
    while (nextArrow <= walked + length && commands.length < 180) {
      const distance = nextArrow - walked;
      const tipX = from.x + ux * distance;
      const tipY = from.y + uy * distance;
      const backX = tipX - ux * size;
      const backY = tipY - uy * size;
      const wingX = -uy * size * 0.58;
      const wingY = ux * size * 0.58;
      commands.push(`M${backX + wingX},${backY + wingY} L${tipX},${tipY} L${backX - wingX},${backY - wingY}`);
      nextArrow += spacing;
    }
    walked += length;
  }
  return commands.join(" ");
}

/** Total authored length of one route polyline. */
export function routePolylineLength(points: readonly Pt[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

/** Keep directional cues spaced along the whole route, including long campus legs. */
export function routeChevronCount(points: readonly Pt[]): number {
  const count = Math.ceil(routePolylineLength(points) / ROUTE_CHEVRON_SPACING);
  return Math.max(ROUTE_CHEVRON_MIN, Math.min(ROUTE_CHEVRON_MAX, count));
}

/** A moving chevron's SVG transform sampled from the authored route geometry. */
export function routeChevronMotionTransform(points: readonly Pt[], index: number, count: number, phaseDistance = 0): string {
  const totalLength = routePolylineLength(points);
  if (points.length < 2 || totalLength <= 0 || count <= 0) return "";
  const distance = ((index * totalLength / count + phaseDistance) % totalLength + totalLength) % totalLength;
  const position = routeProgressGeometry(points, distance / totalLength).position;
  let consumed = 0;
  let bearing = 0;
  for (let segmentIndex = 1; segmentIndex < points.length; segmentIndex += 1) {
    const from = points[segmentIndex - 1];
    const to = points[segmentIndex];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (distance <= consumed + length || segmentIndex === points.length - 1) {
      bearing = segmentBearing(from, to);
      break;
    }
    consumed += length;
  }
  return `translate(${position.x},${position.y}) rotate(${bearing})`;
}

export interface RouteProgressGeometry {
  completedPoints: Pt[];
  remainingPoints: Pt[];
  position: Pt;
}

/** Split one canonical route polyline at its progress point. The completed
 * stroke endpoint and current-position marker share the exact same geometry. */
export function routeProgressGeometry(points: readonly Pt[], progress: number): RouteProgressGeometry {
  if (points.length === 0) return { completedPoints: [], remainingPoints: [], position: { x: 0, y: 0 } };
  const t = Math.max(0, Math.min(1, progress));
  if (points.length === 1 || t <= 0) {
    return { completedPoints: [points[0]], remainingPoints: [...points], position: points[0] };
  }
  if (t >= 1) {
    const last = points[points.length - 1];
    return { completedPoints: [...points], remainingPoints: [last], position: last };
  }

  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    totalLength += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  if (totalLength <= 0) return { completedPoints: [points[0]], remainingPoints: [...points], position: points[0] };

  const target = totalLength * t;
  let consumed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (consumed + length >= target || index === points.length - 2) {
      const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, (target - consumed) / length));
      const position = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      const completedPoints = [...points.slice(0, index + 1), position];
      const remainingPoints = [position, ...points.slice(index + 1)];
      return { completedPoints, remainingPoints, position };
    }
    consumed += length;
  }
  const last = points[points.length - 1];
  return { completedPoints: [...points], remainingPoints: [last], position: last };
}

/** Student route strokes and their markers are separate layers when embedded in authored map SVGs. */
export const RouteMapOverlay = memo(function RouteMapOverlay({ points, mode, fading = false, walkProgress, animated = true, flowPaused = false, layer = "all", showStartMarker = true, showEndMarker = true, routeColor, opacity = 1, routeDashArray, routeLabel, progressFrameWriterRef }: RouteMapOverlayProps) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<SVGGElement | null>(null);
  const routeFlowPhaseRef = useRef(0);
  const routeFlowPathRef = useRef<string | null>(null);

  // Camera transforms do not change authored route geometry. Keep the SVG
  // point serialization stable across camera/UI renders and playback progress.
  const pathStr = useMemo(() => points.map((point) => `${point.x},${point.y}`).join(" "), [points]);
  const color = routeColor ?? (mode === "accessible" ? "#16a34a" : mode === "emergency" ? "#dc2626" : "#1e40af");
  const showLine = layer !== "markers";
  const showMarkers = layer !== "line";
  const optimizedProgress = Boolean(progressFrameWriterRef);
  const progress = typeof walkProgress === "number" ? Math.max(0, Math.min(1, walkProgress)) : null;
  const flowEnabled = animated && !reducedMotion;
  const progressGeometry = useMemo(
    () => progress === null ? null : routeProgressGeometry(points, progress),
    [points, progress],
  );
  const completedPathStr = useMemo(
    () => progressGeometry?.completedPoints.map((point) => `${point.x},${point.y}`).join(" ") ?? "",
    [progressGeometry],
  );
  const remainingPathStr = useMemo(
    () => progressGeometry?.remainingPoints.map((point) => `${point.x},${point.y}`).join(" ") ?? pathStr,
    [pathStr, progressGeometry],
  );
  // The sparse directional system is derived from the same canonical
  // polyline as the strokes: an evenly spaced static set for preview/paused/
  // reduced-motion, and a shared-phase moving set during guided playback.
  // Keep flow geometry anchored to the complete route. Sampling only the
  // remaining split path made cursor updates reset the arrows at each frame.
  const chevronPoints = points;
  const chevronCount = useMemo(() => routeChevronCount(chevronPoints), [chevronPoints]);
  const chevronPath = useMemo(() => {
    const length = routePolylineLength(chevronPoints);
    if (length <= 0) return "";
    return routeChevronPath(chevronPoints, length / chevronCount, 9);
  }, [chevronPoints, chevronCount]);

  const routeSegments = useMemo(() => {
    let distance = 0;
    return points.slice(1).map((to, index) => {
      const from = points[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const segment = { from, to, start: distance, length, end: distance + length };
      distance += length;
      return segment;
    });
  }, [points]);
  const totalRouteLength = routeSegments.at(-1)?.end ?? 0;

  const writeFlowFrame = useCallback((phaseDistance: number) => {
    const root = rootRef.current;
    if (!root || points.length < 2 || totalRouteLength <= 0) return;
    root.querySelectorAll<SVGGElement>('[data-testid="route-direction-chevron"]').forEach((chevron) => {
      const index = Number(chevron.getAttribute("data-chevron-index"));
      chevron.setAttribute("transform", routeChevronMotionTransform(points, index, chevronCount, phaseDistance));
    });
    root.setAttribute("data-flow-phase-distance", String(phaseDistance));
  }, [chevronCount, points, totalRouteLength]);

  useLayoutEffect(() => {
    if (routeFlowPathRef.current !== pathStr) {
      routeFlowPathRef.current = pathStr;
      routeFlowPhaseRef.current = 0;
    }
    writeFlowFrame(routeFlowPhaseRef.current);
  }, [pathStr, writeFlowFrame]);

  useEffect(() => {
    if (!flowEnabled || flowPaused || totalRouteLength <= 0) return;
    let frame = 0;
    let previousTime: number | null = null;
    const tick = (time: number) => {
      if (previousTime !== null) {
        const elapsed = Math.min(50, Math.max(0, time - previousTime));
        routeFlowPhaseRef.current = (routeFlowPhaseRef.current
          + totalRouteLength * elapsed / (ROUTE_CHEVRON_LAP_SECONDS * 1000)) % totalRouteLength;
        writeFlowFrame(routeFlowPhaseRef.current);
      }
      previousTime = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flowEnabled, flowPaused, pathStr, totalRouteLength, writeFlowFrame]);

  const writeProgressFrame = useCallback((nextProgress: number) => {
    const root = rootRef.current;
    if (!root || points.length < 2 || totalRouteLength <= 0) return;
    const progress = Math.max(0, Math.min(1, nextProgress));
    const geometry = routeProgressGeometry(points, progress);
    const completedPoints = geometry.completedPoints.map((point) => `${point.x},${point.y}`).join(" ");
    const completed = root.querySelector<SVGPolylineElement>('[data-testid="completed-route-line"]');
    completed?.setAttribute("points", completedPoints);
    completed?.setAttribute("data-progress", String(progress));
    completed?.setAttribute("opacity", progress > 0 && geometry.completedPoints.length > 1 ? "0.56" : "0");
    const remainingLine = root.querySelector<SVGPolylineElement>('[data-testid="remaining-route-line"]');
    remainingLine?.setAttribute("data-progress", String(progress));
    const current = root.querySelector<SVGGElement>("[data-route-current-position]");
    current?.setAttribute("transform", `translate(${geometry.position.x},${geometry.position.y})`);
    current?.setAttribute("data-progress", String(progress));
  }, [points, totalRouteLength]);

  useLayoutEffect(() => {
    if (!progressFrameWriterRef) return;
    progressFrameWriterRef.current = writeProgressFrame;
    if (typeof walkProgress === "number") writeProgressFrame(walkProgress);
    return () => {
      if (progressFrameWriterRef.current === writeProgressFrame) progressFrameWriterRef.current = null;
    };
  }, [progressFrameWriterRef, walkProgress, writeProgressFrame]);
  if (points.length < 2) return null;

  return (
    <g ref={rootRef} data-route-group data-route-layer={layer} data-student-marker-layer={showMarkers ? "route" : undefined} data-route-color={routeColor} data-route-opacity={opacity} data-flow-paused={flowPaused && flowEnabled ? "true" : undefined} className={cn("transition-opacity duration-300", fading && "opacity-0")} opacity={opacity} pointerEvents="none">
      {showLine && <g data-route-strokes>
        <polyline data-testid="route-outer-casing" points={pathStr} fill="none" stroke={mode === "emergency" ? "#ffffff" : "#60a5fa"} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.88}
          vectorEffect="non-scaling-stroke" />
        <polyline points={pathStr} fill="none" stroke="white" strokeWidth={8.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.98}
          vectorEffect="non-scaling-stroke" />
        {progressGeometry && progress !== null && (optimizedProgress || progress > 0 && progressGeometry.completedPoints.length > 1) && <polyline data-testid="completed-route-line" data-progress={progress}
          points={completedPathStr} fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round"
          opacity={progress > 0 ? 0.56 : 0} vectorEffect="non-scaling-stroke" />}
        {/* Keep the complete authored route leg visible at every cursor value.
            Progress is shown by the moving marker and optional completed
            highlight; a dash split must never make the valid path appear cut. */}
        <polyline data-testid="remaining-route-line" points={pathStr} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={routeDashArray}
          opacity={0.98} vectorEffect="non-scaling-stroke" />
        {!flowEnabled && chevronPath && <g data-testid="route-direction-chevrons" data-travel-direction="start-to-destination" data-chevron-count={chevronCount}>
          <path d={chevronPath} fill="none" stroke="#0f172a" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} vectorEffect="non-scaling-stroke" />
          <path d={chevronPath} fill="none" stroke="white" strokeWidth={3}
            strokeLinecap="round" strokeLinejoin="round" opacity={progress === null ? 0.84 : 0.94} vectorEffect="non-scaling-stroke" />
        </g>}
        {flowEnabled && chevronPoints.length > 1 && (
          <g data-testid="route-direction-flow" data-motion-path={`M${pathStr.replaceAll(" ", " L")}`} data-chevron-count={chevronCount}>
            {Array.from({ length: chevronCount }, (_, index) => (
              <g key={index} data-testid="route-direction-chevron" data-chevron-index={index}
                data-chevron-offset={(index / chevronCount).toFixed(4)}
                transform={routeChevronMotionTransform(chevronPoints, index, chevronCount, routeFlowPhaseRef.current)}>
                <path d="M-6.5,-4.5 L0,0 L-6.5,4.5" fill="none" stroke="#0f172a" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} vectorEffect="non-scaling-stroke" />
                <path d="M-6.5,-4.5 L0,0 L-6.5,4.5" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.98} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </g>
        )}
      </g>}
      {showMarkers && <>
        {progressGeometry && (() => {
          const { x, y } = progressGeometry.position;
          return <g data-route-current-position data-progress={progress} transform={`translate(${x},${y})`} style={{ pointerEvents: "none" }}>
            <g className="student-map-screen-marker">
            <circle cx={0} cy={0} r={13} fill="rgba(249,115,22,0.24)" />
            <circle cx={0} cy={0} r={10.2} fill="#0f172a" />
            <circle cx={0} cy={0} r={8.6} fill="#0f766e" stroke="white" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            <g transform="scale(0.55)">
              <circle cy={-4.5} r={3.4} fill="white" />
              <path d="M -3.4 7 L 0 0 L 3.4 7 M 0 0 L 0 -4.5" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" />
            </g>
            </g>
          </g>;
        })()}
        {showStartMarker && <g data-route-marker="start" aria-label="Route start" transform={`translate(${points[0].x},${points[0].y})`}>
          <g className="student-map-screen-marker">
          <circle data-testid="route-start-reveal" className={progress === null ? "student-route-start-reveal" : undefined} r={21} fill="rgba(22,163,74,0.19)" />
          <circle r={16} fill="#16a34a" stroke="white" strokeWidth={3.5} vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 2px 4px rgba(15,23,42,0.28))" }} />
          <circle r={11.5} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <text y={4.5} textAnchor="middle" fill="white" fontSize={12} fontWeight="900" className="select-none">A</text>
          </g>
        </g>}
        {showEndMarker && <g data-route-marker="destination" aria-label="Route destination" transform={`translate(${points[points.length - 1].x},${points[points.length - 1].y})`}>
          <g className="student-map-screen-marker">
          <circle data-testid="destination-pin-halo" cy={-19} r={20} fill="rgba(220,38,38,0.13)" />
          <path data-testid="destination-pin" d="M0 0 C-3.5 -5.5 -14.5 -16 -14.5 -23 A14.5 14.5 0 1 1 14.5 -23 C14.5 -16 3.5 -5.5 0 0 Z"
            fill="#dc2626" stroke="white" strokeWidth={2.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 2px 4px rgba(15,23,42,0.24))" }} />
          <circle cx={0} cy={-23} r={5.8} fill="white" />
          <circle cx={0} cy={-23} r={2.4} fill="#dc2626" />
          </g>
        </g>}
        {routeLabel && <g data-testid="approved-emergency-route-label" data-route-label={routeLabel} transform={`translate(${points[0].x + 23},${points[0].y - 24})`}>
          <text x={0} y={4} fill={color} stroke="white" strokeWidth={4} paintOrder="stroke" fontSize={11} fontWeight={800}>{routeLabel}</text>
        </g>}
      </>}
    </g>
  );
});
