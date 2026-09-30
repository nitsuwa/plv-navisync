import { memo, useMemo } from "react";
import type { TestRouteHighlight } from "./TestNavigationPanel";
import { trimRouteFragmentAtMarkerBoundary } from "./TestNavigationPanel";

export interface FloorTestRouteGeometry {
  routePath: string;
  arrowPath: string;
  arrowCount: number;
}

function routeArrowMarkers(points: { x: number; y: number }[]) {
  const markers: { x: number; y: number; angle: number }[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 18) continue;
    const count = Math.max(1, Math.floor(length / 72));
    for (let marker = 1; marker <= count; marker += 1) {
      const t = marker / (count + 1);
      markers.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
        angle: Math.atan2(dy, dx) * 180 / Math.PI,
      });
    }
  }
  return markers;
}

function arrowsToPath(markers: { x: number; y: number; angle: number }[]): string {
  return markers.map(({ x, y, angle }) => {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const vertices = [[-5, -4], [5, 0], [-5, 4]].map(([localX, localY]) => ({
      x: x + localX * cos - localY * sin,
      y: y + localX * sin + localY * cos,
    }));
    return `M ${vertices[0].x} ${vertices[0].y} L ${vertices[1].x} ${vertices[1].y} L ${vertices[2].x} ${vertices[2].y} Z`;
  }).join(" ");
}

/** Build presentation-only SVG data once per route object. */
export function buildFloorTestRouteGeometry(route: TestRouteHighlight): FloorTestRouteGeometry {
  const markerPoints = [
    ...(route.transitionMarkers ?? []),
    ...(route.continuationMarkers ?? []),
  ].flatMap((marker) => marker.x !== undefined && marker.y !== undefined
    ? [{ x: marker.x, y: marker.y }]
    : []);
  const fragments = route.waypointFragments ?? [route.waypoints];
  const clipped = fragments
    .map((fragment) => trimRouteFragmentAtMarkerBoundary(fragment, markerPoints))
    .filter((fragment) => fragment.length > 0);
  const routePath = clipped.map((fragment) => fragment
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" "))
    .join(" ");
  const markers = clipped.flatMap(routeArrowMarkers);
  return { routePath, arrowPath: arrowsToPath(markers), arrowCount: markers.length };
}

/**
 * The route overlay is presentation-only. Its native SVG dash animation does
 * not update React state, and memoization keeps parent editor renders from
 * rebuilding its route geometry or arrow artwork unless the route changes.
 */
export const FloorTestRouteOverlay = memo(function FloorTestRouteOverlay({
  route,
}: {
  route: TestRouteHighlight;
}) {
  const geometry = useMemo(() => buildFloorTestRouteGeometry(route), [route]);
  if (!route.routeNodeIds?.length || !geometry.routePath) return null;

  return (
    <g data-testid="floor-test-route-active-overlay" className="pointer-events-none">
      <path
        d={geometry.routePath}
        fill="none"
        stroke={route.color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.28}
        data-testid="floor-test-route-glow"
      />
      <path
        d={geometry.routePath}
        fill="none"
        stroke={route.color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="12 8"
        opacity={1}
        data-testid="floor-test-route-animated-stroke"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.2s" repeatCount="indefinite" />
      </path>
      {geometry.arrowPath && (
        <path
          d={geometry.arrowPath}
          fill={route.color}
          stroke="white"
          strokeWidth={1}
          strokeLinejoin="round"
          data-testid="floor-test-route-direction-arrows"
          data-arrow-count={geometry.arrowCount}
        />
      )}
    </g>
  );
});

