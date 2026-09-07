import type { ReactNode } from "react";
import type {
  CampusBuilding,
  CampusDecorAsset,
  CampusMarker,
  CampusPath,
  ExteriorEmergencyStair,
  ExteriorEmergencyStairVisualSize,
} from "./types";
import { DECOR_ASSET_MAP, groundTypeForDecorType, isDecorAreaType } from "./constants";
import { DecorAssetArt } from "./DecorAssetVisual";
import { CampusGateVisual } from "./CampusGateVisual";
import { effectiveStackKey } from "../../lib/campusStack";
import { entranceDisplayName, entranceWorldPosition } from "../../lib/buildingEntrances";
import { exteriorEmergencyStairWorldPosition } from "../../lib/exteriorEmergencyStairs";
import { pathRenderStyle } from "../../lib/outdoorPathVisual";
import { isCampusGate } from "../../lib/campusGates";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "../../lib/readonlyOutdoorCampus";
import { surfaceCellRuns } from "../../lib/campusSurface";
import { campusGroundAppearance, campusGroundPatternId } from "../../lib/campusCanvas";

export interface OutdoorBuildingVisualProps {
  building: CampusBuilding;
  selected?: boolean;
  onSelect?: (buildingId: string) => void;
  onDoubleClick?: (buildingId: string) => void;
  /** Admin wrappers provide their own hit surface; Student may opt in. */
  interactive?: boolean;
  /** Editor wrappers already own transforms/opacity; they can opt out here. */
  applyTransform?: boolean;
  applyOpacity?: boolean;
  showName?: boolean;
  showFloorCount?: boolean;
  labelLayout?: "student" | "editor";
  bodyOpacity?: number;
}

/**
 * Convert the authored Exterior Emergency Stair footprint into a presentation
 * footprint.  This is deliberately kept out of the navigation/occurrence
 * synchronisation helpers: visual size must never move graph nodes or change
 * the served-floor contract.  Older campus records have no value and use the
 * medium scale.
 */
export function exteriorEmergencyStairVisualDimensions(stair: Pick<ExteriorEmergencyStair, "width" | "height" | "visualSize">) {
  // Medium is the default authored presentation. Keep the size readable at
  // normal floor zoom while preserving a restrained Small/Large progression.
  const factor = stair.visualSize === "small" ? 0.96 : stair.visualSize === "large" ? 1.58 : 1.35;
  return {
    width: Math.max(24, Math.round((stair.width || 28) * factor)),
    height: Math.max(36, Math.round((stair.height || 42) * factor)),
  };
}

/** Safe normalized attachment span for the complete rendered stair module. */
export function exteriorEmergencyStairSafeOffsetRange(
  edge: ExteriorEmergencyStair["attachment"]["edge"],
  span: number,
  width: number,
  height: number,
  visualSize?: ExteriorEmergencyStairVisualSize,
) {
  const visual = exteriorEmergencyStairVisualDimensions({ width, height, visualSize });
  const along = edge === "top" || edge === "bottom" ? visual.width : visual.height;
  const halfWithPadding = along / 2 + 6;
  const inset = Math.min(0.45, halfWithPadding / Math.max(1, span));
  return { min: inset, max: 1 - inset };
}

/** Presentation-only authored Building visual. No editor handles or graph UI. */
export function OutdoorBuildingVisual({
  building,
  selected = false,
  onSelect,
  onDoubleClick,
  interactive = Boolean(onSelect || onDoubleClick),
  applyTransform = true,
  applyOpacity = true,
  showName = true,
  showFloorCount = true,
  labelLayout = "student",
  bodyOpacity = 0.88,
}: OutdoorBuildingVisualProps) {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const rotation = building.rotation ?? 0;
  const opacity = building.opacity ?? 1;
  return (
    <g
      data-testid="readonly-building"
      data-building-id={building.id}
      data-bldg="true"
      pointerEvents={interactive ? undefined : "none"}
      transform={applyTransform && rotation ? `rotate(${rotation}, ${cx}, ${cy})` : undefined}
      opacity={applyOpacity ? opacity : undefined}
      style={{ cursor: onSelect ? "pointer" : undefined }}
      onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(building.id); } : undefined}
      onDoubleClick={onDoubleClick ? (event) => { event.stopPropagation(); onDoubleClick(building.id); } : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(building.id);
        }
      } : undefined}
    >
      {selected && <rect x={building.x - 6} y={building.y - 6} width={building.width + 12} height={building.height + 12} rx={10} fill="none" stroke="#2563eb" strokeWidth={2.5} pointerEvents={interactive ? undefined : "none"} />}
      <rect x={building.x} y={building.y} width={building.width} height={building.height} rx={8} fill={building.color || "#64748b"} stroke={selected ? "#2563eb" : "rgba(255,255,255,0.68)"} strokeWidth={selected ? 2.5 : 1.5} opacity={bodyOpacity} pointerEvents={interactive ? undefined : "none"} />
      {/* A restrained architectural treatment keeps the authored footprint and
          color authoritative while giving the building a little depth at map
          scale.  These marks are presentation-only and remain pointer
          transparent in the editor wrapper. */}
      <rect x={building.x + 4} y={building.y + 4} width={Math.max(0, building.width - 8)} height={Math.max(0, building.height - 8)} rx={5} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1} pointerEvents="none" />
      <rect x={building.x + 2} y={building.y + 2} width={Math.max(0, building.width - 4)} height={Math.min(5, building.height)} rx={5} fill="rgba(255,255,255,0.14)" pointerEvents="none" />
      {building.width >= 80 && building.height >= 56 && (
        <g pointerEvents="none" opacity={0.42}>
          {Array.from({ length: Math.max(2, Math.min(7, Math.floor(building.width / 34))) }, (_, index) => {
            const count = Math.max(2, Math.min(7, Math.floor(building.width / 34)));
            const x = building.x + 14 + (index * Math.max(1, building.width - 28)) / Math.max(1, count - 1);
            return <g key={`window-${index}`}>
              <rect x={x - 4} y={building.y + 13} width={8} height={4} rx={1.5} fill="rgba(255,255,255,0.72)" />
              <rect x={x - 4} y={building.y + building.height - 17} width={8} height={4} rx={1.5} fill="rgba(255,255,255,0.58)" />
            </g>;
          })}
          <line x1={building.x + 10} y1={cy} x2={building.x + building.width - 10} y2={cy} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
        </g>
      )}
      <text x={cx} y={labelLayout === "editor" ? cy - 8 : cy - 3} textAnchor="middle" fill="white" fontSize={11} fontWeight="800" className="pointer-events-none select-none">{building.code}</text>
      {showFloorCount && (building.floors ?? []).length > 0 && <text x={cx} y={labelLayout === "editor" ? cy + 4 : cy + 11} textAnchor="middle" fill={labelLayout === "editor" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.78)"} fontSize={7} className="pointer-events-none select-none">{building.floors.length}F</text>}
      {showName && building.name && building.name !== "New Building" && (
        <text x={cx} y={labelLayout === "editor" ? cy + 14 : building.y + building.height + 14} textAnchor="middle" fill={labelLayout === "editor" ? "rgba(255,255,255,0.55)" : "var(--map-building-name, #475569)"} fontSize={labelLayout === "editor" ? 5.5 : 7} fontWeight="600" className="pointer-events-none select-none" stroke={labelLayout === "editor" ? "rgba(0,0,0,0.15)" : undefined} strokeWidth={labelLayout === "editor" ? 1.5 : undefined} paintOrder={labelLayout === "editor" ? "stroke" : undefined}>
          {labelLayout === "editor"
            ? (building.name.length > 16 ? `${building.name.slice(0, 14)}…` : building.name)
            : (building.name.length > 22 ? `${building.name.slice(0, 20)}…` : building.name)}
        </text>
      )}
    </g>
  );
}

export function OutdoorPathVisual({ path }: { path: CampusPath }) {
  if (!path.points || path.points.length < 2) return null;
  const points = path.points.map((point) => `${point.x},${point.y}`).join(" ");
  const closed = path.points.length >= 4 && Math.hypot(
    path.points[0].x - path.points[path.points.length - 1].x,
    path.points[0].y - path.points[path.points.length - 1].y,
  ) < 1;
  const style = pathRenderStyle(path);
  const join = style.kind === "road" ? "bevel" : "round";
  return closed ? (
    <g data-testid="readonly-campus-path" data-path-id={path.id}>
      <path d={`M${points.replaceAll(" ", " L")} Z`} fill="none" stroke={style.edge} strokeWidth={style.baseWidth + 2} strokeLinecap="butt" strokeLinejoin={join} />
      <polygon points={points} fill="none" stroke={style.surface} strokeWidth={style.baseWidth} strokeLinejoin={join} />
      {style.kind === "road" && <polygon points={points} fill="none" stroke="#f8fafc" strokeWidth={1.2} strokeLinejoin="bevel" strokeDasharray="10 10" opacity={0.72} />}
    </g>
  ) : (
    <g data-testid="readonly-campus-path" data-path-id={path.id}>
      <polyline points={points} fill="none" stroke={style.edge} strokeWidth={style.baseWidth + 2} strokeLinecap="butt" strokeLinejoin={join} />
      <polyline points={points} fill="none" stroke={style.surface} strokeWidth={style.baseWidth} strokeLinecap="butt" strokeLinejoin={join} />
      {style.kind === "road" && <polyline points={points} fill="none" stroke="#f8fafc" strokeWidth={1.2} strokeLinecap="butt" strokeLinejoin="bevel" strokeDasharray="10 10" opacity={0.72} />}
    </g>
  );
}

function groundAreaStyle(kind: CampusDecorAsset["groundType"] = "grass") {
  switch (kind) {
    case "planted": return { fill: "#b8cfab", stroke: "#739b69", accent: "#8daf7a", pattern: "campus-garden-pattern" };
    case "plaza": return { fill: "#d8d5ce", stroke: "#a8a29a", accent: "#b8b2a8", pattern: "campus-plaza-pattern" };
    case "field": return { fill: "#dbe8c2", stroke: "#9db76d", accent: "#b6ca86", pattern: "campus-garden-pattern" };
    case "parking": return { fill: "#8a9296", stroke: "#626b70", accent: "#f8fafc", pattern: undefined };
    default: return { fill: "#bfd4b8", stroke: "#7fa876", accent: "#9fbe91", pattern: "campus-lawn-pattern" };
  }
}

/** Shared read-only surface treatment for authored campus ground patches. */
export function OutdoorGroundAreaVisual({ asset }: { asset: CampusDecorAsset }) {
  const kind = asset.groundType ?? groundTypeForDecorType(asset.type) ?? "grass";
  if (asset.surfaceCells?.length) {
    const size = Math.max(4, asset.surfaceCellSize ?? 20);
    const style = groundAreaStyle(kind);
    return (
      <g data-testid="readonly-ground-area" data-ground-type={kind} data-surface-material={kind} opacity={asset.visible === false ? 0 : 1}>
        {surfaceCellRuns(asset.surfaceCells).map((run) => (
          <rect key={`${asset.id}-${run.x}-${run.y}`} x={run.x * size} y={run.y * size} width={run.width * size + 0.5} height={size + 0.5} fill={style.fill} />
        ))}
      </g>
    );
  }
  const descriptor = DECOR_ASSET_MAP[asset.type];
  const width = Math.max(30, asset.width ?? descriptor?.defaultWidth ?? 150);
  const height = Math.max(24, asset.height ?? descriptor?.defaultHeight ?? 95);
  const areaAsset = asset.type !== "ground-area";
  const style = groundAreaStyle(kind);
  const x = asset.x - width / 2;
  const y = asset.y - height / 2;
  return (
    <g data-testid="readonly-ground-area" data-ground-type={kind} transform={`translate(${x},${y}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`} opacity={asset.visible === false ? 0 : 1}>
      <rect width={width} height={height} rx={areaAsset ? 0 : kind === "plaza" || kind === "parking" ? 6 : 12} fill={style.fill} stroke={areaAsset ? "none" : style.stroke} strokeWidth={areaAsset ? 0 : 1.2} />
      {style.pattern && <rect width={width} height={height} fill={`url(#${style.pattern})`} opacity={0.75} pointerEvents="none" />}
      {kind === "parking" && <g opacity={0.8}>
        {(() => {
          const horizontal = width >= height;
          const span = horizontal ? width : height;
          const depth = horizontal ? height : width;
          const aisle = Math.max(10, Math.min(18, depth * 0.25));
          const count = Math.max(2, Math.floor(span / Math.max(14, Math.min(28, span / 7))));
          if (horizontal) {
            const aisleTop = height / 2 - aisle / 2;
            const aisleBottom = height / 2 + aisle / 2;
            return <>
              <line x1={3} y1={height / 2} x2={width - 3} y2={height / 2} stroke="#8b949b" strokeWidth={1.1} opacity={0.6} />
              {Array.from({ length: count + 1 }, (_, index) => {
                const x = (index * width) / count;
                return <g key={`parking-v-${index}`}><line x1={x} y1={3} x2={x} y2={aisleTop - 2} stroke={style.accent} strokeWidth={1.1} /><line x1={x} y1={aisleBottom + 2} x2={x} y2={height - 3} stroke={style.accent} strokeWidth={1.1} /></g>;
              })}
            </>;
          }
          const aisleLeft = width / 2 - aisle / 2;
          const aisleRight = width / 2 + aisle / 2;
          return <>
            <line x1={width / 2} y1={3} x2={width / 2} y2={height - 3} stroke="#8b949b" strokeWidth={1.1} opacity={0.6} />
            {Array.from({ length: count + 1 }, (_, index) => {
              const y = (index * height) / count;
              return <g key={`parking-h-${index}`}><line x1={3} y1={y} x2={aisleLeft - 2} y2={y} stroke={style.accent} strokeWidth={1.1} /><line x1={aisleRight + 2} y1={y} x2={width - 3} y2={y} stroke={style.accent} strokeWidth={1.1} /></g>;
            })}
          </>;
        })()}
      </g>}
    </g>
  );
}

export function OutdoorEntranceVisual({ building, entrance }: { building: CampusBuilding; entrance: ReadonlyOutdoorEntrance }) {
  const position = entrance.legacyPosition
    ? { ...entrance.legacyPosition, angle: 0 }
    : entranceWorldPosition(building, entrance);
  const label = entranceDisplayName(entrance, (building.entrances ?? []).findIndex((item) => item.id === entrance.id));
  const color = entrance.type === "emergency_exit" || entrance.type === "emergency" ? "#dc2626" : entrance.type === "service" ? "#7c3aed" : "#0f766e";
  return (
    <g data-testid="readonly-entrance" data-entrance-id={entrance.id} transform={`translate(${position.x},${position.y}) rotate(${position.angle ?? 0})`} style={{ cursor: onClick ? "pointer" : undefined }} onClick={onClick ? (e) => { e.stopPropagation(); onClick(building.id); } : undefined}>
      <title>{label}{entrance.accessible ? " · Accessible" : ""}</title>
      <path d="M-9,-6 H9 V6 H-9 Z" fill="var(--card, #fff)" stroke={color} strokeWidth={1.8} />
      <path d="M-3,6 V-2 H3 V6" fill={color} opacity={0.9} />
      <path d="M0,12 L-4,6 H4 Z" fill={color} />
      {entrance.accessible && <circle cx={-7} cy={-7} r={2.5} fill="#2563eb" stroke="white" strokeWidth={0.8} />}
    </g>
  );
}

export function OutdoorEmergencyStairVisual({
  building,
  stair,
  selected = false,
  applyTransform = true,
}: {
  building: CampusBuilding;
  stair: ExteriorEmergencyStair;
  selected?: boolean;
  /** Admin owns the outer world transform so its hit target stays authoritative. */
  applyTransform?: boolean;
}) {
  const position = exteriorEmergencyStairWorldPosition(building, stair);
  const { width, height } = exteriorEmergencyStairVisualDimensions(stair);
  const stepCount = Math.max(4, Math.min(9, Math.round(height / 7)));
  const wallSide = -width / 2;
  const stroke = selected ? "#2563eb" : "#b91c1c";
  const surface = selected ? "#eff6ff" : "#fff7ed";
  return (
    <g data-testid="readonly-exterior-emergency-stair" data-stair-id={stair.id} transform={applyTransform ? `translate(${position.x},${position.y}) rotate(${position.angle})` : undefined} pointerEvents="none">
      <title>{stair.label || "Exterior Emergency Stair"}</title>
      {/* Small bridge and landing make the attachment to the wall explicit. */}
      <line data-testid="exterior-stair-wall-connection" x1={wallSide - 11} y1={0} x2={wallSide} y2={0} stroke={stroke} strokeWidth={2} strokeDasharray="3 2" />
      <rect data-testid="exterior-stair-landing" x={wallSide - 9} y={-height / 2 - 2} width={9} height={height + 4} rx={2} fill="#e2e8f0" stroke={stroke} strokeWidth={1.1} />
      <rect data-testid="exterior-stair-module" x={-width / 2} y={-height / 2} width={width} height={height} rx={3} fill={surface} stroke={stroke} strokeWidth={selected ? 2 : 1.5} />
      <line x1={wallSide + 2} y1={-height / 2 + 3} x2={wallSide + 2} y2={height / 2 - 3} stroke={stroke} strokeWidth={1.2} opacity={0.8} />
      <line x1={width / 2 - 2} y1={-height / 2 + 3} x2={width / 2 - 2} y2={height / 2 - 3} stroke={stroke} strokeWidth={1.2} opacity={0.8} />
      {Array.from({ length: stepCount }, (_, index) => {
        const y = -height / 2 + 5 + index * ((height - 10) / (stepCount - 1));
        return <line key={index} data-testid="exterior-stair-tread" x1={-width / 2 + 4} y1={y} x2={width / 2 - 4} y2={y} stroke={stroke} strokeWidth={1.1} opacity={0.78} />;
      })}
      <line x1={-width / 2 + 5} y1={-height / 2 + 3} x2={width / 2 - 5} y2={height / 2 - 3} stroke={stroke} strokeWidth={0.8} opacity={0.28} />
      <line x1={-width / 2 + 5} y1={height / 2 - 3} x2={width / 2 - 5} y2={-height / 2 + 3} stroke={stroke} strokeWidth={0.8} opacity={0.28} />
    </g>
  );
}

export function OutdoorDecorVisual({ asset }: { asset: CampusDecorAsset }) {
  if (isDecorAreaType(asset.type)) return <OutdoorGroundAreaVisual asset={asset} />;
  const descriptor = DECOR_ASSET_MAP[asset.type];
  if (!descriptor) return null;
  const scale = asset.scale ?? 1;
  const width = Math.max(1, asset.width ?? descriptor.defaultWidth * scale);
  const height = Math.max(1, asset.height ?? descriptor.defaultHeight * scale);
  return (
    <g data-testid="readonly-decor" data-asset-id={asset.id} transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`} opacity={asset.visible === false ? 0 : 1}>
      <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet">
        <DecorAssetArt descriptor={descriptor} />
      </svg>
    </g>
  );
}

function OutdoorMarkerVisual({ marker }: { marker: CampusMarker }) {
  return (
    <g data-testid="readonly-campus-marker" data-marker-id={marker.id}>
      <title>{marker.name}</title>
      <circle cx={marker.x} cy={marker.y} r={9} fill={marker.color || "#475569"} stroke="white" strokeWidth={1.5} />
      <circle cx={marker.x} cy={marker.y} r={2.5} fill="white" />
      {marker.name && <text x={marker.x} y={marker.y + 17} textAnchor="middle" fill="var(--map-building-name, #475569)" fontSize={6.5} fontWeight="600" className="pointer-events-none select-none">{marker.name}</text>}
    </g>
  );
}

function OutdoorCampusGateVisual({ marker }: { marker: CampusMarker }) {
  const emergency = marker.purpose === "emergency_exit";
  const color = emergency ? "#dc2626" : "#2563eb";
  return (
    <g data-testid="readonly-campus-gate" data-marker-id={marker.id}>
      <title>{marker.name || (emergency ? "Emergency Exit Gate" : "Campus Gate")}</title>
      <CampusGateVisual x={marker.x - 18} y={marker.y - 15} width={36} height={30} color={color} />
      {marker.name && <text x={marker.x} y={marker.y + 18} textAnchor="middle" fill="var(--map-building-name, #475569)" fontSize={6.5} fontWeight="700" className="pointer-events-none select-none">{marker.name}</text>}
    </g>
  );
}

export interface ReadonlyOutdoorCampusSceneProps {
  campus: ReadonlyOutdoorCampus;
  /** Keep physical layers independently visible; layer toggles should not hide authored paths. */
  showBuildings?: boolean;
  selectedBuildingId?: string | null;
  onSelectBuilding?: (buildingId: string) => void;
  onDoubleClickBuilding?: (buildingId: string) => void;
  onClickEntrance?: (buildingId: string) => void;
}

/** Read-only scene composition shared by Preview and the public campus map. */
export function ReadonlyOutdoorCampusScene({ campus, showBuildings = true, selectedBuildingId, onSelectBuilding, onDoubleClickBuilding, onClickEntrance }: ReadonlyOutdoorCampusSceneProps) {
  const buildingById = new Map(campus.buildings.map((building) => [building.id, building]));
  const stack: { zOrder: number; order: number; node: ReactNode }[] = [];
  campus.paths.forEach((path, index) => stack.push({ zOrder: -1000, order: index, node: <OutdoorPathVisual key={`path-${path.id}`} path={path} /> }));
  if (showBuildings) {
    campus.buildings.forEach((building, index) => stack.push({ zOrder: effectiveStackKey("building", building.zOrder, index), order: index, node: <OutdoorBuildingVisual key={`building-${building.id}`} building={building} selected={selectedBuildingId === building.id} onSelect={onSelectBuilding} onDoubleClick={onDoubleClickBuilding} /> }));
  }
  campus.decorAssets.forEach((asset, index) => stack.push({
    // Ground surfaces are the back-most authored layer in both Admin and
    // read-only scenes, so paths and physical objects remain legible above
    // grass, plazas, and parking even when a legacy zOrder is present.
    zOrder: isDecorAreaType(asset.type) ? -2000 + index : effectiveStackKey("decorAsset", asset.zOrder, index),
    order: index,
    node: <OutdoorDecorVisual key={`decor-${asset.id}`} asset={asset} />,
  }));
  stack.sort((a, b) => a.zOrder - b.zOrder || a.order - b.order);
  return (
    <g data-testid="readonly-outdoor-scene">
      <defs>
        <pattern id="campus-lawn-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M5 17 l2 -4 M8 18 l2 -3 M20 7 l2 -4 M22 8 l2 -3" stroke="#6f9f68" strokeWidth="1" strokeLinecap="round" opacity="0.22" />
          <circle cx="14" cy="23" r="1" fill="#6f9f68" opacity="0.16" />
        </pattern>
        <pattern id="campus-garden-pattern" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="9" r="2.2" fill="#6b9860" opacity="0.24" />
          <circle cx="11" cy="7" r="1.7" fill="#7eaa6a" opacity="0.22" />
          <circle cx="23" cy="20" r="2" fill="#6b9860" opacity="0.2" />
          <path d="M5 23 q3 -4 6 0 M20 11 q3 -4 6 0" fill="none" stroke="#6b9860" strokeWidth="1" strokeLinecap="round" opacity="0.18" />
        </pattern>
        <pattern id="campus-plaza-pattern" width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M0 0H36M0 18H36M12 0V18M30 18V36" fill="none" stroke="#aaa59d" strokeWidth="0.8" opacity="0.16" />
        </pattern>
        <pattern id="campus-ground-grass-pattern" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M6 20l2-4m2 5 2-3m14-9 2-4m2 5 2-3" stroke="#4f7d53" strokeWidth="1" strokeLinecap="round" opacity="0.22" />
          <circle cx="17" cy="27" r="0.9" fill="#4f7d53" opacity="0.12" />
        </pattern>
        <pattern id="campus-ground-concrete-pattern" width="72" height="64" patternUnits="userSpaceOnUse">
          <path d="M0 32H72" fill="none" stroke="#b2aea7" strokeWidth="0.8" opacity="0.18" />
          <path d="M36 0V32M18 32V64" fill="none" stroke="#b2aea7" strokeWidth="0.8" opacity="0.12" />
        </pattern>
        <pattern id="campus-ground-pavers-pattern" width="64" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 0H64M0 20H64" fill="none" stroke="#a59d91" strokeWidth="1" opacity="0.2" />
          <path d="M16 0V20M48 0V20M0 20V40M32 20V40" fill="none" stroke="#a59d91" strokeWidth="1" opacity="0.16" />
        </pattern>
        <pattern id="campus-ground-asphalt-pattern" width="34" height="34" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="9" r="0.8" fill="#d8dde0" opacity="0.16" />
          <circle cx="24" cy="19" r="0.7" fill="#d8dde0" opacity="0.13" />
          <circle cx="14" cy="29" r="0.6" fill="#d8dde0" opacity="0.12" />
        </pattern>
        <pattern id="campus-ground-custom-pattern" width="48" height="48" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="16" r="0.7" fill="#64748b" opacity="0.1" />
          <circle cx="35" cy="31" r="0.6" fill="#64748b" opacity="0.08" />
        </pattern>
      </defs>
      {(() => {
        const appearance = campusGroundAppearance(campus);
        const pattern = campusGroundPatternId(appearance.material, appearance.texture);
        return <>
      <rect
        data-testid="readonly-campus-background"
        data-ground-material={appearance.material}
        width={campus.canvasW}
        height={campus.canvasH}
        fill={appearance.color || "var(--map-bg, #f3f1ec)"}
        opacity={campus.backgroundOpacity ?? 1}
        pointerEvents="none"
      />
      {pattern && <rect data-testid="readonly-campus-ground-texture" width={campus.canvasW} height={campus.canvasH} fill={`url(#${pattern})`} opacity={0.82} pointerEvents="none" />}
        </>;
      })()}
      {campus.backgroundImage && (
        <image
          data-testid="readonly-campus-background-image"
          href={campus.backgroundImage}
          x={0}
          y={0}
          width={campus.canvasW}
          height={campus.canvasH}
          preserveAspectRatio={campus.backgroundFit === "contain" ? "xMidYMid meet" : campus.backgroundFit === "center" ? "xMidYMid slice" : "xMidYMid slice"}
          opacity={campus.backgroundOpacity ?? 1}
          pointerEvents="none"
        />
      )}
      {stack.map((entry) => entry.node)}
      {showBuildings && campus.entrances.map((entrance) => {
        const building = buildingById.get(entrance.buildingId);
        return building ? <OutdoorEntranceVisual key={`entrance-${entrance.id}`} building={building} entrance={entrance} onClick={onClickEntrance} /> : null;
      })}
      {showBuildings && campus.exteriorEmergencyStairs.map((stair) => {
        const building = buildingById.get(stair.buildingId);
        return building ? <OutdoorEmergencyStairVisual key={`stair-${stair.id}`} building={building} stair={stair} /> : null;
      })}
      {campus.markers.map((marker) => isCampusGate(marker)
        ? <OutdoorCampusGateVisual key={`marker-${marker.id}`} marker={marker} />
        : <OutdoorMarkerVisual key={`marker-${marker.id}`} marker={marker} />)}
    </g>
  );
}
