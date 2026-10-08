import { memo } from "react";
import type { FloorExteriorZone, BuildingEntranceEdge } from "./types";
import { exteriorZoneTypeLabel } from "../../lib/exteriorFloorZones";

export type ExteriorVisualBounds = { x: number; y: number; width: number; height: number };

export function FloorExteriorZoneArtworkView({
  zone,
  bounds,
  selected = false,
}: {
  zone: FloorExteriorZone;
  bounds: ExteriorVisualBounds;
  selected?: boolean;
}) {
  const fill = zone.type === "veranda"
    ? "#d9c5a1"
    : zone.type === "entrance_landing"
      ? "#cbd5e1"
      : zone.type === "covered_walkway"
        ? "#b8c8d8"
        : "#d1d5db";
  return (
    <>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={4}
        fill={fill}
        fillOpacity={0.78}
        stroke={selected ? "var(--accent)" : "#64748b"}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={zone.type === "covered_walkway" ? "6 3" : undefined}
      />
      <line
        x1={bounds.x + 8}
        y1={bounds.y + 8}
        x2={bounds.x + bounds.width - 8}
        y2={bounds.y + 8}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={1}
      />
      {zone.labelVisible !== false && (
        <text
          x={bounds.x + bounds.width / 2 + (zone.labelOffsetX ?? 0)}
          y={bounds.y + bounds.height / 2 + 3 + (zone.labelOffsetY ?? 0)}
          textAnchor="middle"
          fontSize={9}
          fontWeight={800}
          fill="#334155"
          pointerEvents="none"
          className="pointer-events-none select-none"
        >
          {zone.label ?? exteriorZoneTypeLabel(zone.type)}
        </text>
      )}
    </>
  );
}

function sameBounds(a: ExteriorVisualBounds, b: ExteriorVisualBounds) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export const FloorExteriorZoneArtwork = memo(FloorExteriorZoneArtworkView, (previous, next) =>
  previous.zone === next.zone && previous.selected === next.selected && sameBounds(previous.bounds, next.bounds),
);

function FloorEntranceStepsArtworkView({
  bounds,
  side,
  selected = false,
  routeActive = false,
  routeColor = "#3b82f6",
  direction = "forward",
  flipHorizontal = false,
  flipVertical = false,
  testId = "steps-symbol",
}: {
  bounds: ExteriorVisualBounds;
  side: BuildingEntranceEdge;
  selected?: boolean;
  routeActive?: boolean;
  routeColor?: string;
  direction?: "forward" | "reverse";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  testId?: string;
}) {
  const horizontalEdge = side === "top" || side === "bottom";
  const inset = Math.max(2.5, Math.min(6, Math.min(bounds.width, bounds.height) * 0.18));
  const run = horizontalEdge ? bounds.height : bounds.width;
  const treadCount = Math.max(3, Math.min(6, Math.round(run / 8)));
  const rails = horizontalEdge
    ? [bounds.x + inset, bounds.x + bounds.width - inset].map((x) => (
        <line key={x} x1={x} y1={bounds.y + inset} x2={x} y2={bounds.y + bounds.height - inset} stroke="#8b6d47" strokeWidth={0.8} opacity={0.78} />
      ))
    : [bounds.y + inset, bounds.y + bounds.height - inset].map((y) => (
        <line key={y} x1={bounds.x + inset} y1={y} x2={bounds.x + bounds.width - inset} y2={y} stroke="#8b6d47" strokeWidth={0.8} opacity={0.78} />
      ));
  const towardParent = side === "top" ? { x: 0, y: 1 } : side === "bottom" ? { x: 0, y: -1 } : side === "left" ? { x: 1, y: 0 } : { x: -1, y: 0 };
  const cueDirection = direction === "reverse" ? { x: -towardParent.x, y: -towardParent.y } : towardParent;
  const cueLength = Math.max(5, Math.min(12, run * 0.24));
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const cueStart = { x: cx - cueDirection.x * cueLength / 2, y: cy - cueDirection.y * cueLength / 2 };
  const cueEnd = { x: cx + cueDirection.x * cueLength / 2, y: cy + cueDirection.y * cueLength / 2 };
  const cueTangent = { x: -cueDirection.y, y: cueDirection.x };
  const mirrorTransform = `translate(${cx} ${cy}) scale(${flipHorizontal ? -1 : 1} ${flipVertical ? -1 : 1}) translate(${-cx} ${-cy})`;
  return (
    <g data-testid={testId} data-route-active={routeActive ? "true" : undefined} transform={mirrorTransform}>
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={2.5} fill="#e8d6b7" stroke={routeActive ? routeColor : selected ? "var(--accent)" : "#8b6d47"} strokeWidth={routeActive ? 2.5 : selected ? 2.3 : 1.35} />
      {routeActive && <rect x={bounds.x - 3} y={bounds.y - 3} width={bounds.width + 6} height={bounds.height + 6} rx={4} fill="none" stroke={routeColor} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.9} pointerEvents="none" />}
      <rect x={bounds.x + 1.5} y={bounds.y + 1.5} width={Math.max(0, bounds.width - 3)} height={Math.max(0, bounds.height - 3)} rx={1.5} fill="#f6ead6" opacity={0.68} />
      {Array.from({ length: treadCount }, (_, index) => {
        const ratio = (index + 1) / (treadCount + 1);
        return horizontalEdge
          ? <line key={index} x1={bounds.x + inset} y1={bounds.y + ratio * (bounds.height - inset * 2)} x2={bounds.x + bounds.width - inset} y2={bounds.y + ratio * (bounds.height - inset * 2)} stroke="#745b3c" strokeWidth={1.05} />
          : <line key={index} x1={bounds.x + ratio * (bounds.width - inset * 2)} y1={bounds.y + inset} x2={bounds.x + ratio * (bounds.width - inset * 2)} y2={bounds.y + bounds.height - inset} stroke="#745b3c" strokeWidth={1.05} />;
      })}
      {rails}
      <path data-testid={testId === "steps-symbol" ? "steps-direction-cue" : "readonly-steps-direction-cue"} d={`M ${cueStart.x} ${cueStart.y} L ${cueEnd.x} ${cueEnd.y} M ${cueEnd.x} ${cueEnd.y} L ${cueEnd.x - cueDirection.x * 3 + cueTangent.x * 2.2} ${cueEnd.y - cueDirection.y * 3 + cueTangent.y * 2.2} M ${cueEnd.x} ${cueEnd.y} L ${cueEnd.x - cueDirection.x * 3 - cueTangent.x * 2.2} ${cueEnd.y - cueDirection.y * 3 - cueTangent.y * 2.2}`} fill="none" stroke="#5f4630" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
    </g>
  );
}

export const FloorEntranceStepsArtwork = memo(FloorEntranceStepsArtworkView, (previous, next) =>
  sameBounds(previous.bounds, next.bounds)
  && previous.side === next.side
  && previous.selected === next.selected
  && previous.routeActive === next.routeActive
  && previous.routeColor === next.routeColor
  && previous.direction === next.direction
  && previous.flipHorizontal === next.flipHorizontal
  && previous.flipVertical === next.flipVertical
  && previous.testId === next.testId,
);

function FloorAccessibleRampArtworkView({
  bounds,
  side,
  selected = false,
  routeActive = false,
  routeColor = "#3b82f6",
  direction = "forward",
  layout = "straight",
  flipHorizontal = false,
  flipVertical = false,
  rotation = 0,
  testId = "ramp-symbol",
}: {
  bounds: ExteriorVisualBounds;
  side: BuildingEntranceEdge;
  selected?: boolean;
  routeActive?: boolean;
  routeColor?: string;
  direction?: "forward" | "reverse";
  layout?: "straight" | "l_turn_left" | "l_turn_right";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  rotation?: number;
  testId?: string;
}) {
  const horizontalRun = side === "top" || side === "bottom";
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const runLength = horizontalRun ? bounds.height : bounds.width;
  const crossLength = horizontalRun ? bounds.width : bounds.height;
  const runInset = Math.max(3, Math.min(9, runLength * 0.09));
  const crossInset = Math.max(3, Math.min(9, crossLength * 0.12));
  const routeStroke = 1.05;
  const railStroke = 0.8;
  const baseRouteColor = "#27765c";
  const railColor = "#39866a";
  const surfaceColor = "#dff2e8";
  const runStart = side === "top" || side === "left"
    ? (horizontalRun ? bounds.y + runInset : bounds.x + runInset)
    : (horizontalRun ? bounds.y + bounds.height - runInset : bounds.x + bounds.width - runInset);
  const runEnd = side === "top" || side === "left"
    ? (horizontalRun ? bounds.y + bounds.height - runInset : bounds.x + bounds.width - runInset)
    : (horizontalRun ? bounds.y + runInset : bounds.x + runInset);
  const turnSign = layout === "l_turn_left" ? -1 : 1;
  const turnLeg = Math.max(2, Math.min(crossLength * 0.34, crossLength / 2 - crossInset));
  const railOffset = Math.max(3, Math.min(crossLength * 0.28, crossLength / 2 - crossInset));
  const showRails = layout === "straight" && runLength >= 24 && crossLength >= 24 && railOffset > 2.5;
  const segmentCount = layout === "straight" ? runLength < 24 ? 2 : Math.max(3, Math.min(12, Math.round(runLength / 10))) : 0;
  const baseRunPoints = layout === "straight"
    ? horizontalRun
      ? [{ x: cx, y: runStart }, { x: cx, y: runEnd }]
      : [{ x: runStart, y: cy }, { x: runEnd, y: cy }]
    : horizontalRun
      ? [{ x: cx + turnSign * turnLeg, y: runStart }, { x: cx, y: runStart }, { x: cx, y: runEnd }]
      : [{ x: runStart, y: cy + turnSign * turnLeg }, { x: runStart, y: cy }, { x: runEnd, y: cy }];
  const runPoints = direction === "reverse" ? [...baseRunPoints].reverse() : baseRunPoints;
  const toPath = (points: { x: number; y: number }[]) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const travelPath = toPath(runPoints);
  const arrowTip = runPoints[runPoints.length - 1];
  const arrowBase = runPoints[runPoints.length - 2] ?? arrowTip;
  const arrowVector = { x: arrowTip.x - arrowBase.x, y: arrowTip.y - arrowBase.y };
  const arrowLength = Math.max(1, Math.hypot(arrowVector.x, arrowVector.y));
  const arrowUnit = { x: arrowVector.x / arrowLength, y: arrowVector.y / arrowLength };
  const arrowNormal = { x: -arrowUnit.y, y: arrowUnit.x };
  const arrowHead = Math.max(2.2, Math.min(5, crossLength * 0.11, arrowLength * 0.22));
  const arrowCue = [
    `M ${arrowTip.x} ${arrowTip.y} L ${arrowTip.x - arrowUnit.x * arrowHead + arrowNormal.x * arrowHead} ${arrowTip.y - arrowUnit.y * arrowHead + arrowNormal.y * arrowHead}`,
    `M ${arrowTip.x} ${arrowTip.y} L ${arrowTip.x - arrowUnit.x * arrowHead - arrowNormal.x * arrowHead} ${arrowTip.y - arrowUnit.y * arrowHead - arrowNormal.y * arrowHead}`,
  ].join(" ");
  const mirrorTransform = `translate(${cx} ${cy}) scale(${flipHorizontal ? -1 : 1} ${flipVertical ? -1 : 1}) translate(${-cx} ${-cy})`;
  return (
    <g data-testid={testId} data-route-active={routeActive ? "true" : undefined} transform={`rotate(${rotation} ${cx} ${cy}) ${mirrorTransform}`}>
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={0} fill={surfaceColor} stroke={routeActive ? routeColor : selected ? "var(--accent)" : baseRouteColor} strokeWidth={routeActive ? 2.5 : selected ? 2.3 : 1.35} />
      {routeActive && <rect x={bounds.x - 3} y={bounds.y - 3} width={bounds.width + 6} height={bounds.height + 6} rx={0} fill="none" stroke={routeColor} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.9} pointerEvents="none" />}
      {segmentCount > 0 && Array.from({ length: segmentCount }, (_, index) => {
        const ratio = (index + 1) / (segmentCount + 1);
        const position = runStart + ratio * (runEnd - runStart);
        return horizontalRun
          ? <line key={`ramp-segment-${index}`} data-testid={testId === "ramp-symbol" ? "ramp-segment-line" : undefined} x1={bounds.x + crossInset} y1={position} x2={bounds.x + bounds.width - crossInset} y2={position} stroke="#82a899" strokeWidth={0.7} opacity={0.72} />
          : <line key={`ramp-segment-${index}`} data-testid={testId === "ramp-symbol" ? "ramp-segment-line" : undefined} x1={position} y1={bounds.y + crossInset} x2={position} y2={bounds.y + bounds.height - crossInset} stroke="#82a899" strokeWidth={0.7} opacity={0.72} />;
      })}
      {showRails && layout === "straight" && (horizontalRun
        ? [cx - railOffset, cx + railOffset].map((x) => <line key={x} data-testid={testId === "ramp-symbol" ? "ramp-rail" : undefined} x1={x} y1={runStart} x2={x} y2={runEnd} fill="none" stroke={railColor} strokeWidth={railStroke} opacity={0.7} strokeLinecap="round" />)
        : [cy - railOffset, cy + railOffset].map((y) => <line key={y} data-testid={testId === "ramp-symbol" ? "ramp-rail" : undefined} x1={runStart} y1={y} x2={runEnd} y2={y} fill="none" stroke={railColor} strokeWidth={railStroke} opacity={0.7} strokeLinecap="round" />))}
      <path data-testid={testId === "ramp-symbol" ? "ramp-layout-path" : "readonly-ramp-layout-path"} data-layout={layout} d={travelPath} fill="none" stroke={baseRouteColor} strokeWidth={routeStroke} strokeLinecap="round" strokeLinejoin="round" opacity={0.82} />
      <path data-testid={testId === "ramp-symbol" ? "ramp-direction-cue" : "readonly-ramp-direction-cue"} d={arrowCue} fill="none" stroke={baseRouteColor} strokeWidth={routeStroke} strokeLinecap="round" strokeLinejoin="round" opacity={0.82} />
    </g>
  );
}

export const FloorAccessibleRampArtwork = memo(FloorAccessibleRampArtworkView, (previous, next) =>
  sameBounds(previous.bounds, next.bounds)
  && previous.side === next.side
  && previous.selected === next.selected
  && previous.routeActive === next.routeActive
  && previous.routeColor === next.routeColor
  && previous.direction === next.direction
  && previous.layout === next.layout
  && previous.flipHorizontal === next.flipHorizontal
  && previous.flipVertical === next.flipVertical
  && previous.rotation === next.rotation
  && previous.testId === next.testId,
);
