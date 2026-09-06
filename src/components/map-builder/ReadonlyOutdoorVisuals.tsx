import type { ReactNode } from "react";
import type {
  CampusBuilding,
  CampusDecorAsset,
  CampusMarker,
  CampusPath,
  ExteriorEmergencyStair,
} from "./types";
import { DECOR_ASSET_MAP } from "./constants";
import { DecorAssetArt } from "./DecorAssetVisual";
import { effectiveStackKey } from "../../lib/campusStack";
import { entranceDisplayName, entranceWorldPosition } from "../../lib/buildingEntrances";
import { exteriorEmergencyStairWorldPosition } from "../../lib/exteriorEmergencyStairs";
import { pathRenderStyle } from "../../lib/outdoorPathVisual";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "../../lib/readonlyOutdoorCampus";

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
  bodyOpacity = 0.94,
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
      <rect x={building.x + 3} y={building.y + 4} width={building.width} height={building.height} rx={8} fill="rgba(0,0,0,0.14)" pointerEvents={interactive ? undefined : "none"} />
      {selected && <rect x={building.x - 6} y={building.y - 6} width={building.width + 12} height={building.height + 12} rx={10} fill="none" stroke="#2563eb" strokeWidth={2.5} pointerEvents={interactive ? undefined : "none"} />}
      <rect x={building.x} y={building.y} width={building.width} height={building.height} rx={8} fill={building.color || "#64748b"} stroke={selected ? "#2563eb" : "rgba(255,255,255,0.68)"} strokeWidth={selected ? 2.5 : 1.5} opacity={bodyOpacity} pointerEvents={interactive ? undefined : "none"} />
      <rect x={building.x} y={building.y} width={building.width} height={Math.min(8, building.height)} rx={8} fill="rgba(0,0,0,0.14)" pointerEvents={interactive ? undefined : "none"} />
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

export function OutdoorEntranceVisual({ building, entrance, onClick }: { building: CampusBuilding; entrance: ReadonlyOutdoorEntrance; onClick?: (buildingId: string) => void }) {
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

export function OutdoorEmergencyStairVisual({ building, stair }: { building: CampusBuilding; stair: ExteriorEmergencyStair }) {
  const position = exteriorEmergencyStairWorldPosition(building, stair);
  const width = Math.max(18, stair.width || 28);
  const height = Math.max(24, stair.height || 42);
  const stepCount = 4;
  return (
    <g data-testid="readonly-exterior-emergency-stair" data-stair-id={stair.id} transform={`translate(${position.x},${position.y}) rotate(${position.angle})`}>
      <title>{stair.label || "Exterior Emergency Stair"}</title>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={3} fill="#fef2f2" stroke="#b91c1c" strokeWidth={1.5} />
      {Array.from({ length: stepCount }, (_, index) => {
        const y = -height / 2 + 7 + index * ((height - 14) / (stepCount - 1));
        return <line key={index} x1={-width / 2 + 4} y1={y} x2={width / 2 - 4} y2={y} stroke="#dc2626" strokeWidth={1.2} opacity={0.75} />;
      })}
      <text x={0} y={4} textAnchor="middle" fill="#991b1b" fontSize={6.5} fontWeight="900" className="pointer-events-none select-none">EXIT</text>
    </g>
  );
}

export function OutdoorDecorVisual({ asset }: { asset: CampusDecorAsset }) {
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
  campus.decorAssets.forEach((asset, index) => stack.push({ zOrder: effectiveStackKey("decorAsset", asset.zOrder, index), order: index, node: <OutdoorDecorVisual key={`decor-${asset.id}`} asset={asset} /> }));
  stack.sort((a, b) => a.zOrder - b.zOrder || a.order - b.order);
  return (
    <g data-testid="readonly-outdoor-scene">
      <rect
        data-testid="readonly-campus-background"
        width={campus.canvasW}
        height={campus.canvasH}
        fill={campus.backgroundColor || "var(--map-bg, #f5f3ef)"}
        opacity={campus.backgroundOpacity ?? 1}
        pointerEvents="none"
      />
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
      {campus.markers.map((marker) => <OutdoorMarkerVisual key={`marker-${marker.id}`} marker={marker} />)}
    </g>
  );
}
