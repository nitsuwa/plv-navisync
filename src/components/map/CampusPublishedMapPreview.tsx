import type { Campus } from "../map-builder/types";

export function CampusPublishedMapPreview({ campus, className = "" }: { campus: Campus; className?: string }) {
  const visibleBuildings = (campus.buildings ?? []).filter((building) => building.visible !== false && building.width > 0 && building.height > 0);
  const visiblePaths = campus.paths ?? [];
  const points = [
    ...visibleBuildings.flatMap((building) => [
      { x: building.x, y: building.y },
      { x: building.x + building.width, y: building.y + building.height },
    ]),
    ...visiblePaths.flatMap((path) => path.points ?? []),
    ...(campus.markers ?? []).map(({ x, y }) => ({ x, y })),
  ].filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const canvasWidth = Math.max(1, campus.canvasW || 900);
  const canvasHeight = Math.max(1, campus.canvasH || 680);
  const xMin = points.length ? Math.min(...points.map((point) => point.x)) : 0;
  const xMax = points.length ? Math.max(...points.map((point) => point.x)) : canvasWidth;
  const yMin = points.length ? Math.min(...points.map((point) => point.y)) : 0;
  const yMax = points.length ? Math.max(...points.map((point) => point.y)) : canvasHeight;
  const padding = Math.max(24, Math.max(xMax - xMin, yMax - yMin) * 0.1);
  const viewX = Math.max(0, xMin - padding);
  const viewY = Math.max(0, yMin - padding);
  const viewWidth = Math.max(1, Math.min(canvasWidth, xMax + padding) - viewX);
  const viewHeight = Math.max(1, Math.min(canvasHeight, yMax + padding) - viewY);
  return (
    <svg data-testid="campus-published-map-preview" viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`} preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label={`${campus.name} published campus map preview`}>
      <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} fill="var(--muted)" />
      <defs><pattern id={`campus-map-grid-${campus.id}`} width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="var(--primary)" opacity=".12" /></pattern></defs>
      <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} fill={`url(#campus-map-grid-${campus.id})`} />
      {visiblePaths.map((path) => <polyline key={path.id} points={path.points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={path.color || "var(--primary)"} strokeWidth={Math.max(2, path.width || 2)} strokeLinecap="round" strokeLinejoin="round" opacity=".48" />)}
      {visibleBuildings.map((building) => <g key={building.id}>
        <rect x={building.x} y={building.y} width={building.width} height={building.height} rx={Math.max(4, Math.min(building.width, building.height) * 0.06)} fill={building.color || campus.themeColor || "var(--primary)"} opacity=".9" stroke="white" strokeWidth={Math.max(2, Math.min(building.width, building.height) * 0.025)} />
        {building.width > viewWidth * 0.08 && building.height > viewHeight * 0.08 && <text x={building.x + building.width / 2} y={building.y + building.height / 2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={Math.min(building.width, building.height) * 0.22} fontWeight="700">{building.code}</text>}
      </g>)}
      {(campus.markers ?? []).map((marker) => <circle key={marker.id} cx={marker.x} cy={marker.y} r={Math.max(4, Math.min(viewWidth, viewHeight) * 0.012)} fill={marker.color || "var(--primary)"} stroke="white" strokeWidth="2" />)}
    </svg>
  );
}
