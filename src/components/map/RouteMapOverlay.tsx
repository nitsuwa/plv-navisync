import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { Pt, RouteMode } from "../../lib/routePlanner";
import { cn } from "../../lib/utils";
import { useReducedMotion } from "../../hooks";

interface RouteMapOverlayProps {
  points: Pt[];
  mode: RouteMode;
  fading?: boolean;
  /** Controls presentation motion only; route geometry and selection are unchanged. */
  animated?: boolean;
  /** 0..1 guided progress; omitted for the calm full-route preview. */
  walkProgress?: number;
  /** Split route strokes from their markers to keep authored transition markers above the line. */
  layer?: "all" | "line" | "markers";
  /** True only when THIS polyline contains the true route Start (A). */
  showStartMarker?: boolean;
  /** True only when THIS polyline ends at the true final destination (B). */
  showEndMarker?: boolean;
  /** Renderer-owned Follow updates avoid reconciling the containing map scene each frame. */
  progressFrameWriterRef?: { current: ((progress: number) => void) | null };
}

/** One shared lap duration for every chevron on a route. Identical duration
 * across chevrons is what guarantees one animation phase: spacing is constant
 * and no chevron can ever overtake another. */
export const ROUTE_CHEVRON_LAP_SECONDS = 18;
export const ROUTE_CHEVRON_MIN = 2;
export const ROUTE_CHEVRON_MAX = 4;

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

/** Sparse directional system: 2–4 chevrons derived only from route geometry. */
export function routeChevronCount(points: readonly Pt[]): number {
  const count = Math.round(routePolylineLength(points) / 160);
  return Math.max(ROUTE_CHEVRON_MIN, Math.min(ROUTE_CHEVRON_MAX, count));
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
export const RouteMapOverlay = memo(function RouteMapOverlay({ points, mode, fading = false, walkProgress, animated = true, layer = "all", showStartMarker = true, showEndMarker = true, progressFrameWriterRef }: RouteMapOverlayProps) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<SVGGElement | null>(null);

  // Camera transforms do not change authored route geometry. Keep the SVG
  // point serialization stable across camera/UI renders and playback progress.
  const pathStr = useMemo(() => points.map((point) => `${point.x},${point.y}`).join(" "), [points]);
  const color = mode === "accessible" ? "#16a34a" : mode === "emergency" ? "#dc2626" : "#1e40af";
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
  const motionPath = useMemo(() => `M${remainingPathStr.replaceAll(" ", " L")}`, [remainingPathStr]);
  // The sparse directional system is derived from the same canonical
  // polyline as the strokes: an evenly spaced static set for preview/paused/
  // reduced-motion, and a shared-phase moving set during guided playback.
  const chevronPoints = progressGeometry?.remainingPoints ?? points;
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

  const writeProgressFrame = useCallback((nextProgress: number) => {
    const root = rootRef.current;
    if (!root || points.length < 2 || totalRouteLength <= 0) return;
    const progress = Math.max(0, Math.min(1, nextProgress));
    const targetDistance = totalRouteLength * progress;
    let position = points[points.length - 1];
    if (progress <= 0) position = points[0];
    else if (progress < 1) {
      const segment = routeSegments.find((candidate) => candidate.length > 0 && candidate.end >= targetDistance);
      if (segment) {
        const ratio = Math.max(0, Math.min(1, (targetDistance - segment.start) / segment.length));
        position = {
          x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
          y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
        };
      }
    }
    const completed = root.querySelector<SVGPolylineElement>('[data-testid="completed-route-line"]');
    completed?.setAttribute("stroke-dasharray", `${targetDistance} ${totalRouteLength}`);
    completed?.setAttribute("data-progress", String(progress));
    const remainingLine = root.querySelector<SVGPolylineElement>('[data-testid="remaining-route-line"]');
    remainingLine?.setAttribute("stroke-dasharray", `${totalRouteLength - targetDistance} ${totalRouteLength}`);
    remainingLine?.setAttribute("stroke-dashoffset", String(-targetDistance));
    remainingLine?.setAttribute("data-progress", String(progress));
    const current = root.querySelector<SVGGElement>("[data-route-current-position]");
    current?.setAttribute("transform", `translate(${position.x},${position.y})`);
    current?.setAttribute("data-progress", String(progress));
  }, [points, routeSegments, totalRouteLength]);

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
    <g ref={rootRef} data-route-group data-route-layer={layer} data-student-marker-layer={showMarkers ? "route" : undefined} className={cn("transition-opacity duration-300", fading && "opacity-0")} pointerEvents="none">
      {showLine && <g data-route-strokes>
        <polyline data-testid="route-outer-casing" points={pathStr} fill="none" stroke="#60a5fa" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.88}
          vectorEffect="non-scaling-stroke" />
        <polyline points={pathStr} fill="none" stroke="white" strokeWidth={8.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.98}
          vectorEffect="non-scaling-stroke" />
        {progressGeometry && progress !== null && (optimizedProgress || progress > 0 && progressGeometry.completedPoints.length > 1) && <polyline data-testid="completed-route-line" data-progress={progress}
          points={optimizedProgress ? pathStr : completedPathStr} fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={optimizedProgress ? `${totalRouteLength * progress} ${totalRouteLength}` : undefined}
          opacity={0.56} vectorEffect="non-scaling-stroke" />}
        <polyline data-testid="remaining-route-line" points={optimizedProgress && progress !== null ? pathStr : remainingPathStr} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={optimizedProgress && progress !== null ? `${totalRouteLength * (1 - progress)} ${totalRouteLength}` : undefined}
          strokeDashoffset={optimizedProgress && progress !== null ? -totalRouteLength * progress : undefined}
          opacity={0.98} vectorEffect="non-scaling-stroke" />
        {!flowEnabled && chevronPath && <g data-testid="route-direction-chevrons" data-travel-direction="start-to-destination" data-chevron-count={chevronCount}>
          <path d={chevronPath} fill="none" stroke="#0f172a" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} vectorEffect="non-scaling-stroke" />
          <path d={chevronPath} fill="none" stroke="white" strokeWidth={3}
            strokeLinecap="round" strokeLinejoin="round" opacity={progress === null ? 0.84 : 0.94} vectorEffect="non-scaling-stroke" />
        </g>}
        {flowEnabled && chevronPoints.length > 1 && (
          <g data-testid="route-direction-flow" data-motion-path={motionPath} data-chevron-count={chevronCount}>
            {Array.from({ length: chevronCount }, (_, index) => (
              <g key={index} data-testid="route-direction-chevron" data-chevron-index={index}
                data-chevron-offset={((index + 0.5) / chevronCount).toFixed(4)}>
                <path d="M-6.5,-4.5 L0,0 L-6.5,4.5" fill="none" stroke="#0f172a" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} vectorEffect="non-scaling-stroke" />
                <path d="M-6.5,-4.5 L0,0 L-6.5,4.5" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.98} vectorEffect="non-scaling-stroke" />
                {/* Same path + same duration + fixed begin offsets = ONE shared phase. */}
                <animateMotion path={motionPath} dur={`${ROUTE_CHEVRON_LAP_SECONDS}s`}
                  begin={`-${(((index + 0.5) / chevronCount) * ROUTE_CHEVRON_LAP_SECONDS).toFixed(3)}s`}
                  repeatCount="indefinite" rotate="auto" />
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
            <circle cx={0} cy={0} r={13} fill="rgba(37,99,235,0.18)" />
            <circle cx={0} cy={0} r={8.5} fill="#2563eb" stroke="white" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
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
      </>}
    </g>
  );
});
