import type { ReactNode } from "react";
import type {
  CampusBuilding,
  CampusDecorAsset,
  CampusMarker,
  CampusPath,
  CampusEntrance,
  ExteriorEmergencyStair,
  ExteriorEmergencyStairVisualSize,
} from "./types";
import { MARKER_STYLES } from "../../data/mapData";
import { DECOR_ASSET_MAP, groundTypeForDecorType, isDecorAreaType } from "./constants";
import { DecorAssetArt } from "./DecorAssetVisual";
import { CampusGateVisual } from "./CampusGateVisual";
import { effectiveStackKey } from "../../lib/campusStack";
import { BUILDING_ENTRANCE_TYPE_COLORS, entranceDisplayName, entranceWorldPosition, normalizeEntranceType } from "../../lib/buildingEntrances";
import { exteriorEmergencyStairWorldPosition } from "../../lib/exteriorEmergencyStairs";
import { OutdoorPathNetworkArtwork } from "./OutdoorPathNetworkVisuals";
import { isCampusGate } from "../../lib/campusGates";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "../../lib/readonlyOutdoorCampus";
import { surfaceCellRuns } from "../../lib/campusSurface";
import { campusAreaGroundAppearance, campusGroundAppearance } from "../../lib/campusCanvas";
import { decorRenderScale, decorWorldSize } from "../../lib/decorVisual";
import { EntranceDirectionBadge } from "./EntranceDirectionBadge";
import { CampusGroundPatternDefs } from "./CampusGroundPatternDefs";
import { CampusGroundSurface } from "./CampusGroundSurface";
import { Tooltip } from "../ui/Tooltip";

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
  showLabels?: boolean;
  labelLayout?: "student" | "editor";
  bodyOpacity?: number;
}

export interface FittedOutdoorBuildingLabel {
  text: string;
  truncated: boolean;
}

export interface FittedOutdoorBuildingLabelLines extends FittedOutdoorBuildingLabel {
  lines: string[];
}

/**
 * Estimate the rendered width of the small SVG label using the same world-unit
 * font size that the visual uses.  This keeps fitting proportional to the
 * actual Building width instead of imposing a fixed character limit.
 */
function outdoorBuildingGlyphWidth(character: string, fontSize: number) {
  if (/\s/.test(character)) return fontSize * 0.28;
  if (/[ilI.,:;!|'`]/.test(character)) return fontSize * 0.24;
  if (/[MW@#%&]/.test(character)) return fontSize * 0.82;
  if (/[A-Z0-9]/.test(character)) return fontSize * 0.62;
  return fontSize * 0.54;
}

function outdoorBuildingTextWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((width, character) => width + outdoorBuildingGlyphWidth(character, fontSize), 0);
}

function outdoorBuildingLabelId(buildingId: string) {
  return `building-label-clip-${buildingId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

const buildingLabelEllipsis = "\u2026";

function fitOutdoorBuildingLabelSingleLine(value: string, maxWidth: number, fontSize: number): FittedOutdoorBuildingLabel {
  const name = value.trim();
  if (!name) return { text: "", truncated: false };
  const safeWidth = Math.max(0, maxWidth);
  if (outdoorBuildingTextWidth(name, fontSize) <= safeWidth) {
    return { text: name, truncated: false };
  }

  const ellipsis = "…";
  const ellipsisWidth = outdoorBuildingTextWidth(buildingLabelEllipsis, fontSize);
  let fitted = "";
  for (const character of Array.from(name)) {
    const candidate = `${fitted}${character}`;
    if (outdoorBuildingTextWidth(candidate, fontSize) + ellipsisWidth > safeWidth) break;
    fitted = candidate;
  }
  return { text: `${fitted.trimEnd()}${buildingLabelEllipsis}`, truncated: true };
}

/** Fit a short code to the actual available Building width. */
export function fitOutdoorBuildingLabel(value: string, maxWidth: number, fontSize: number): FittedOutdoorBuildingLabel {
  return fitOutdoorBuildingLabelSingleLine(value, maxWidth, fontSize);
}

/** Fit a Building name into up to two readable lines without a character limit. */
export function fitOutdoorBuildingLabelLines(value: string, maxWidth: number, fontSize: number, maxLines = 2): FittedOutdoorBuildingLabelLines {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { text: "", lines: [], truncated: false };
  const safeWidth = Math.max(0, maxWidth);
  if (outdoorBuildingTextWidth(name, fontSize) <= safeWidth) {
    return { text: name, lines: [name], truncated: false };
  }

  const words = name.split(" ");
  const lines: string[] = [];
  let current = "";
  let wordIndex = 0;
  while (wordIndex < words.length && lines.length < maxLines) {
    const word = words[wordIndex];
    const candidate = current ? `${current} ${word}` : word;
    if (outdoorBuildingTextWidth(candidate, fontSize) <= safeWidth || !current) {
      current = candidate;
      wordIndex += 1;
      if (outdoorBuildingTextWidth(current, fontSize) > safeWidth) {
        current = fitOutdoorBuildingLabelSingleLine(current, safeWidth, fontSize).text;
      }
    } else {
      lines.push(current);
      current = "";
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  const truncated = wordIndex < words.length || lines.some((line) => line.endsWith("…"));
  const shouldTruncate = truncated || lines.some((line) => line.endsWith(buildingLabelEllipsis));
  if (shouldTruncate && lines.length > 0) {
    const lastIndex = Math.min(maxLines, lines.length) - 1;
    const base = lines[lastIndex].replace(/…$/, "").trimEnd();
    let candidate = `${base}…`;
    const baseWithoutProperEllipsis = base.replace(new RegExp(`${buildingLabelEllipsis}$`), "").trimEnd();
    candidate = `${baseWithoutProperEllipsis}${buildingLabelEllipsis}`;
    while (candidate.length > 1 && outdoorBuildingTextWidth(candidate, fontSize) > safeWidth) {
      candidate = `${candidate.slice(0, -2).trimEnd()}…`;
    }
    candidate = candidate.split(String.fromCharCode(0xE2, 0x20AC, 0xA6)).join(buildingLabelEllipsis);
    lines[lastIndex] = candidate;
  }
  const normalizedLines = lines.filter(Boolean).slice(0, maxLines);
  return { text: normalizedLines.join(" "), lines: normalizedLines, truncated: shouldTruncate };
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
  showLabels = true,
  labelLayout = "student",
  bodyOpacity = 0.88,
}: OutdoorBuildingVisualProps) {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const rotation = building.rotation ?? 0;
  const opacity = building.opacity ?? 1;
  const labelScale = Math.min(building.width, building.height);
  const codeFontSize = Math.max(12, Math.min(15, labelScale * 0.18));
  const floorFontSize = Math.max(8, Math.min(9, labelScale * 0.11));
  const nameFontSize = labelLayout === "editor" ? 7 : 8;
  // Fit labels in the Building's local coordinate space.  The editor wrapper
  // (and the read-only root when applyTransform is enabled) owns rotation, so
  // the usable width must never come from a rotated world-space bounding box.
  const labelPaddingX = labelLayout === "editor"
    ? Math.min(12, Math.max(6, building.width * 0.08))
    : Math.min(8, Math.max(4, building.width * 0.06));
  const labelPaddingY = labelLayout === "editor"
    ? Math.min(8, Math.max(4, building.height * 0.08))
    : 0;
  const labelMaxWidth = Math.max(4, building.width - labelPaddingX * 2);
  const fittedCode = fitOutdoorBuildingLabel(building.code ?? "", labelMaxWidth, codeFontSize);
  const fittedName = showName && building.name && building.name !== "New Building"
    ? fitOutdoorBuildingLabelLines(building.name, labelMaxWidth, nameFontSize, 2)
    : null;
  const labelClipId = outdoorBuildingLabelId(building.id);
  const labelClip = labelLayout === "editor" ? `url(#${labelClipId})` : undefined;
  const labelNameStartY = labelLayout === "editor" ? cy + 12 : building.y + building.height + 14;
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
      {labelLayout === "editor" && (
        <defs>
          <clipPath id={labelClipId} clipPathUnits="userSpaceOnUse">
            <rect
              x={building.x + labelPaddingX}
              y={building.y + labelPaddingY}
              width={Math.max(0, building.width - labelPaddingX * 2)}
              height={Math.max(0, building.height - labelPaddingY * 2)}
            />
          </clipPath>
        </defs>
      )}
      {(showLabels || selected) && <g data-testid="building-label-group" clipPath={labelClip} pointerEvents="none" className="select-none">
        <text x={cx} y={labelLayout === "editor" ? cy - 9 : cy - 3} textAnchor="middle" fill="white" fontSize={codeFontSize} fontWeight="900" stroke="rgba(0,0,0,0.38)" strokeWidth={2} paintOrder="stroke">{fittedCode.text}</text>
        {showFloorCount && (building.floors ?? []).length > 0 && <text x={cx} y={labelLayout === "editor" ? cy + 4 : cy + 11} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={floorFontSize} fontWeight="700" stroke="rgba(0,0,0,0.28)" strokeWidth={1.2} paintOrder="stroke">{building.floors.length}F</text>}
        {fittedName && (() => {
          const nameLines = fittedName.lines.map((line, index) => (
            <text key={`${building.id}-name-line-${index}`} x={cx} y={labelNameStartY + index * (nameFontSize + 1)} textAnchor="middle" fill={labelLayout === "editor" ? "rgba(255,255,255,0.82)" : "var(--map-building-name, #475569)"} fontSize={nameFontSize} fontWeight="600" pointerEvents={fittedName.truncated ? "all" : "none"} stroke={labelLayout === "editor" ? "rgba(0,0,0,0.28)" : undefined} strokeWidth={labelLayout === "editor" ? 1.2 : undefined} paintOrder={labelLayout === "editor" ? "stroke" : undefined}>
              {line}
            </text>
          ));
          return fittedName.truncated
            ? <Tooltip element="g" content={building.name} className="pointer-events-auto">{nameLines}</Tooltip>
            : nameLines;
        })()}
      </g>}
    </g>
  );
}

export function OutdoorPathVisual({ path }: { path: CampusPath }) {
  if (!path.points || path.points.length < 2) return null;
  return <OutdoorPathNetworkArtwork paths={[path]} />;
}

const groundAreaAccent = {
  planted: "#8daf7a",
  plaza: "#b8b2a8",
  field: "#9db76d",
  parking: "#f8fafc",
  grass: "#9fbe91",
} as const;

/** Shared physical Ground Area artwork used by both Admin Canvas and viewer. */
export function OutdoorGroundAreaArtwork({ asset, x = asset.x, y = asset.y, width, height, gridSize = 20, selected = false }: {
  asset: CampusDecorAsset;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  gridSize?: number;
  selected?: boolean;
}) {
  const kind = asset.groundType ?? groundTypeForDecorType(asset.type) ?? "grass";
  const appearance = campusAreaGroundAppearance(asset);
  const accent = groundAreaAccent[kind as keyof typeof groundAreaAccent] ?? groundAreaAccent.grass;
  if (asset.surfaceCells?.length) {
    const size = Math.max(4, asset.surfaceCellSize ?? gridSize);
    return (
      <g data-testid="campus-surface-artwork" data-surface-material={kind}>
        {surfaceCellRuns(asset.surfaceCells).map((run) => (
          <g key={`${asset.id}-${run.x}-${run.y}`}>
            <rect x={run.x * size} y={run.y * size} width={run.width * size + 0.5} height={size + 0.5} fill={appearance.color} />
            {appearance.pattern && <rect x={run.x * size} y={run.y * size} width={run.width * size + 0.5} height={size + 0.5} fill={`url(#${appearance.pattern})`} opacity={0.75} />}
          </g>
        ))}
      </g>
    );
  }
  const descriptor = DECOR_ASSET_MAP[asset.type];
  const drawWidth = Math.max(30, width ?? asset.width ?? (descriptor?.defaultWidth ?? 150) * decorRenderScale(asset.scale));
  const drawHeight = Math.max(24, height ?? asset.height ?? (descriptor?.defaultHeight ?? 95) * decorRenderScale(asset.scale));
  const areaAsset = asset.type !== "ground-area";
  const left = x - drawWidth / 2;
  const top = y - drawHeight / 2;
  const horizontal = drawWidth >= drawHeight;
  const span = horizontal ? drawWidth : drawHeight;
  const depth = horizontal ? drawHeight : drawWidth;
  const aisle = Math.max(14, Math.min(24, depth * 0.28));
  const stallDepth = Math.max(8, (depth - aisle) / 2);
  const count = Math.max(2, Math.min(14, Math.floor(span / 22)));
  return (
    <g data-testid="campus-ground-area-artwork" data-ground-type={kind}>
      <rect x={left} y={top} width={drawWidth} height={drawHeight}
        rx={areaAsset ? 0 : kind === "plaza" ? 5 : 10} fill={appearance.color}
        stroke={selected ? "var(--accent)" : areaAsset ? "transparent" : kind === "parking" ? "#626b70" : "transparent"}
        strokeWidth={selected ? 2 : areaAsset ? 0 : kind === "parking" ? 0.8 : 0} />
      {appearance.pattern && <rect x={left} y={top} width={drawWidth} height={drawHeight}
        fill={`url(#${appearance.pattern})`} opacity={0.75} pointerEvents="none" />}
      {kind === "parking" && (
        <g data-testid="parking-stalls" pointerEvents="none" opacity={selected ? 0.86 : 0.68}>
          {asset.type === "parking-lot" && descriptor ? (
            <svg x={left} y={top} width={drawWidth} height={drawHeight}
              viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`}
              preserveAspectRatio="none" overflow="hidden">
              {/* Keep the canonical Admin Parking Lot surface as well as its
                  markings and vehicles across editor, preview, and Student. */}
              <DecorAssetArt descriptor={descriptor} />
            </svg>
          ) : (
          <g>{horizontal ? (() => {
            const aisleTop = y - aisle / 2;
            const aisleBottom = y + aisle / 2;
            return <>
              <line x1={left + 3} y1={y} x2={left + drawWidth - 3} y2={y} stroke="#8b949b" strokeWidth={1.1} opacity={0.6} />
              {Array.from({ length: count + 1 }, (_, index) => {
                const px = left + index * drawWidth / count;
                return <g key={`parking-v-${index}`}><line x1={px} y1={top + 3} x2={px} y2={aisleTop - 2} stroke={accent} strokeWidth={1.1} /><line x1={px} y1={aisleBottom + 2} x2={px} y2={top + drawHeight - 3} stroke={accent} strokeWidth={1.1} /></g>;
              })}
              <line x1={left + 3} y1={top + stallDepth} x2={left + drawWidth - 3} y2={top + stallDepth} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
              <line x1={left + 3} y1={top + drawHeight - stallDepth} x2={left + drawWidth - 3} y2={top + drawHeight - stallDepth} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
            </>;
          })() : (() => {
            const aisleLeft = x - aisle / 2;
            const aisleRight = x + aisle / 2;
            return <>
              <line x1={x} y1={top + 3} x2={x} y2={top + drawHeight - 3} stroke="#8b949b" strokeWidth={1.1} opacity={0.6} />
              {Array.from({ length: count + 1 }, (_, index) => {
                const py = top + index * drawHeight / count;
                return <g key={`parking-h-${index}`}><line x1={left + 3} y1={py} x2={aisleLeft - 2} y2={py} stroke={accent} strokeWidth={1.1} /><line x1={aisleRight + 2} y1={py} x2={left + drawWidth - 3} y2={py} stroke={accent} strokeWidth={1.1} /></g>;
              })}
              <line x1={left + stallDepth} y1={top + 3} x2={left + stallDepth} y2={top + drawHeight - 3} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
              <line x1={left + drawWidth - stallDepth} y1={top + 3} x2={left + drawWidth - stallDepth} y2={top + drawHeight - 3} stroke="#f8fafc" strokeWidth={0.8} opacity={0.45} />
            </>;
          })()}</g>
          )}
        </g>
      )}
    </g>
  );
}

/** Read-only wrapper; physical artwork is the same component used in Canvas. */
export function OutdoorGroundAreaVisual({ asset, gridSize = 20 }: { asset: CampusDecorAsset; gridSize?: number }) {
  if (isDecorAreaType(asset.type)) {
    const descriptor = DECOR_ASSET_MAP[asset.type];
    const width = Math.max(30, asset.width ?? (descriptor?.defaultWidth ?? 150) * decorRenderScale(asset.scale));
    const height = Math.max(24, asset.height ?? (descriptor?.defaultHeight ?? 95) * decorRenderScale(asset.scale));
    return <g data-testid="readonly-ground-area" data-ground-type={asset.groundType ?? groundTypeForDecorType(asset.type) ?? "grass"} opacity={asset.visible === false ? 0 : 1}
      transform={`rotate(${asset.rotation ?? 0},${asset.x},${asset.y})`}>
      <OutdoorGroundAreaArtwork asset={asset} width={width} height={height} gridSize={gridSize} />
    </g>;
  }
  return <OutdoorGroundAreaArtwork asset={asset} gridSize={gridSize} />;
}
export function OutdoorEntranceVisual({
  building,
  entrance,
  onClick,
}: {
  building: CampusBuilding;
  entrance: ReadonlyOutdoorEntrance;
  /** Optional read-only map callback for selecting the entrance's building. */
  onClick?: (buildingId: string) => void;
}) {
  const position = entrance.legacyPosition
    ? { ...entrance.legacyPosition, angle: 0 }
    : entranceWorldPosition(building, entrance);
  const label = entranceDisplayName(entrance, (building.entrances ?? []).findIndex((item) => item.id === entrance.id));
  const color = BUILDING_ENTRANCE_TYPE_COLORS[normalizeEntranceType(entrance.type)];
  return (
    <g data-testid="readonly-entrance" data-entrance-id={entrance.id} style={{ cursor: onClick ? "pointer" : undefined }} onClick={onClick ? (e) => { e.stopPropagation(); onClick(building.id); } : undefined}>
      <title>{label}{entrance.accessible ? " · Accessible" : ""}</title>
      <g transform={`translate(${position.x},${position.y}) rotate(${position.angle ?? 0})`}>
        <OutdoorEntranceArtwork entrance={entrance} color={color} />
      </g>
      <EntranceDirectionBadge
        x={position.x}
        y={position.y}
        edge={entrance.edge}
        direction={entrance.direction}
        type={entrance.type}
        rotation={entrance.legacyPosition ? 0 : building.rotation ?? 0}
      />
    </g>
  );
}

/** Canonical physical entrance glyph used in both Admin Canvas and viewer. */
export function OutdoorEntranceArtwork({ entrance, color, outlineColor = color, outlineWidth = 1.8, showPrimary = true, showAccessible = true }: {
  entrance: Pick<CampusEntrance, "isPrimary" | "accessible">;
  color: string;
  outlineColor?: string;
  outlineWidth?: number;
  showPrimary?: boolean;
  showAccessible?: boolean;
}) {
  return (
    <g data-testid="campus-entrance-artwork" pointerEvents="none">
      <path d="M-10,-7 L10,-7 L10,7 L-10,7 Z" fill="var(--card)" stroke={outlineColor} strokeWidth={outlineWidth} />
      <path d="M-4,7 L-4,-3 L4,-3 L4,7" fill={color} opacity={0.92} />
      <path d="M0,13 L-5,6 H5 Z" fill={outlineColor} />
      {showPrimary && entrance.isPrimary && <circle cx={8} cy={-8} r={3} fill="#f59e0b" stroke="white" strokeWidth={1} />}
      {showAccessible && entrance.accessible && <circle cx={-8} cy={-8} r={3} fill="#2563eb" stroke="white" strokeWidth={1} />}
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

export function OutdoorDecorVisual({ asset, gridSize }: { asset: CampusDecorAsset; gridSize?: number }) {
  if (isDecorAreaType(asset.type)) return <OutdoorGroundAreaVisual asset={asset} gridSize={gridSize} />;
  const descriptor = DECOR_ASSET_MAP[asset.type];
  if (!descriptor) return null;
  // Admin's Canvas uses decorWorldSize/decorRenderScale for every regular
  // outdoor asset.  Reusing that calculation here preserves the published
  // authored footprint exactly; the previous native-size fallback made the
  // Student map render these assets three times smaller.
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  return (
    <g data-testid="readonly-decor" data-asset-id={asset.id} transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`} opacity={asset.visible === false ? 0 : 1}>
      <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet">
        <DecorAssetArt descriptor={descriptor} />
      </svg>
    </g>
  );
}

export function OutdoorMarkerArtwork({ marker, selected = false, zoom = 1, showName = true }: { marker: CampusMarker; selected?: boolean; zoom?: number; showName?: boolean }) {
  const style = MARKER_STYLES[marker.type] ?? MARKER_STYLES.custom;
  const color = marker.color || style.color;
  return (
    <g data-testid="campus-marker-artwork" data-marker-id={marker.id}>
      <ellipse cx={marker.x} cy={marker.y + 1} rx={10} ry={5} fill="rgba(0,0,0,0.18)" />
      <circle cx={marker.x} cy={marker.y} r={13} fill={color} stroke={selected ? "var(--accent)" : "white"} strokeWidth={selected ? 2.5 : 2} />
      <text x={marker.x} y={marker.y + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight={900} className="pointer-events-none select-none">{style.symbol}</text>
      {showName && zoom > 0.6 && marker.name && <text x={marker.x} y={marker.y + 25} textAnchor="middle" fill={color} fontSize={9} fontWeight={700} stroke="rgba(240,238,234,0.95)" strokeWidth={3} paintOrder="stroke" className="pointer-events-none select-none">{marker.name}</text>}
    </g>
  );
}

function OutdoorMarkerVisual({ marker, zoom, showLabel }: { marker: CampusMarker; zoom: number; showLabel: boolean }) {
  return (
    <g data-testid="readonly-campus-marker" data-marker-id={marker.id}>
      <title>{marker.name}</title>
      <OutdoorMarkerArtwork marker={marker} zoom={zoom} showName={showLabel} />
    </g>
  );
}

function OutdoorCampusGateVisual({ marker, showLabel }: { marker: CampusMarker; showLabel: boolean }) {
  const emergency = marker.purpose === "emergency_exit";
  const color = emergency ? "#dc2626" : "#2563eb";
  return (
    <g data-testid="readonly-campus-gate" data-marker-id={marker.id}>
      <title>{marker.name || (emergency ? "Emergency Exit Gate" : "Campus Gate")}</title>
      <CampusGateVisual x={marker.x - 18} y={marker.y - 15} width={36} height={30} color={color} />
      {showLabel && marker.name && <text x={marker.x} y={marker.y + 18} textAnchor="middle" fill="var(--map-building-name, #475569)" fontSize={6.5} fontWeight="700" className="pointer-events-none select-none">{marker.name}</text>}
    </g>
  );
}

export interface ReadonlyOutdoorCampusSceneProps {
  campus: ReadonlyOutdoorCampus;
  zoom?: number;
  /** Keep physical layers independently visible; layer toggles should not hide authored paths. */
  showBuildings?: boolean;
  showLabels?: boolean;
  selectedBuildingId?: string | null;
  onSelectBuilding?: (buildingId: string) => void;
  onDoubleClickBuilding?: (buildingId: string) => void;
  onClickEntrance?: (buildingId: string) => void;
}

/** Read-only scene composition shared by Preview and the public campus map. */
export function ReadonlyOutdoorCampusScene({ campus, zoom = 1, showBuildings = true, showLabels = true, selectedBuildingId, onSelectBuilding, onDoubleClickBuilding, onClickEntrance }: ReadonlyOutdoorCampusSceneProps) {
  const buildingById = new Map(campus.buildings.map((building) => [building.id, building]));
  const stack: { zOrder: number; order: number; node: ReactNode }[] = [];
  if (campus.paths.length) stack.push({ zOrder: -1000, order: 0, node: <OutdoorPathNetworkArtwork key="campus-path-network" paths={campus.paths} /> });
  if (showBuildings) {
    campus.buildings.forEach((building, index) => stack.push({ zOrder: effectiveStackKey("building", building.zOrder, index), order: index, node: <OutdoorBuildingVisual key={`building-${building.id}`} building={building} selected={selectedBuildingId === building.id} onSelect={onSelectBuilding} onDoubleClick={onDoubleClickBuilding} showName={zoom > 0.7 && building.name !== "New Building"} showFloorCount labelLayout="editor" showLabels={showLabels} bodyOpacity={0.82} /> }));
  }
  campus.decorAssets.forEach((asset, index) => stack.push({
    // Ground surfaces are the back-most authored layer in both Admin and
    // read-only scenes, so paths and physical objects remain legible above
    // grass, plazas, and parking even when a legacy zOrder is present.
    zOrder: isDecorAreaType(asset.type) ? -2000 + index : effectiveStackKey("decorAsset", asset.zOrder, index),
    order: index,
    node: <OutdoorDecorVisual key={`decor-${asset.id}`} asset={asset} gridSize={campus.gridSize} />,
  }));
  stack.sort((a, b) => a.zOrder - b.zOrder || a.order - b.order);
  return (
    <g data-testid="readonly-outdoor-scene">
      <defs><CampusGroundPatternDefs /></defs>
      {(() => {
        const appearance = campusGroundAppearance(campus);
        return <>
          <CampusGroundSurface material={appearance.material} texture={appearance.texture} color={appearance.color}
            width={campus.canvasW} height={campus.canvasH} backgroundTestId="readonly-campus-background"
            backgroundOpacity={campus.backgroundOpacity ?? 1} textureTestId="readonly-campus-ground-texture" />
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
        ? <OutdoorCampusGateVisual key={`marker-${marker.id}`} marker={marker} showLabel={showLabels} />
        : <OutdoorMarkerVisual key={`marker-${marker.id}`} marker={marker} zoom={zoom} showLabel={showLabels} />)}
    </g>
  );
}
