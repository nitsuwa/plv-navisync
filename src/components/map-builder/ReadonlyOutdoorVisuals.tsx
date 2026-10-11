import { memo, useMemo, useState, type ReactNode } from "react";
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
import { DECOR_ASSET_MAP, groundTypeForDecorType, isDecorAreaType, type DecorAssetDescriptor } from "./constants";
import { DecorAssetArt } from "./DecorAssetVisual";
import { CampusGateVisual } from "./CampusGateVisual";
import { effectiveStackKey, sortOutdoorGroundAssets } from "../../lib/campusStack";
import { BUILDING_ENTRANCE_TYPE_COLORS, entranceDisplayName, entranceWorldPosition, normalizeEntranceDirection, normalizeEntranceType } from "../../lib/buildingEntrances";
import { exteriorEmergencyStairWorldPosition } from "../../lib/exteriorEmergencyStairs";
import { OutdoorPathNetworkArtwork } from "./OutdoorPathNetworkVisuals";
import { isCampusGate } from "../../lib/campusGates";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "../../lib/readonlyOutdoorCampus";
import { surfaceCellRuns } from "../../lib/campusSurface";
import { campusAreaGroundAppearance, campusGroundAppearance } from "../../lib/campusCanvas";
import { decorRenderScale, decorWorldSize } from "../../lib/decorVisual";
import { EntranceDirectionBadge, entranceDirectionBadgePlacement, studentDoorwayActionLabelPlacement, studentDoorwayActionLabelSize } from "./EntranceDirectionBadge";
import { CampusGroundPatternDefs } from "./CampusGroundPatternDefs";
import { CampusGroundSurface } from "./CampusGroundSurface";
import { Tooltip } from "../ui/Tooltip";
import { studentOverviewDuplicateIds } from "../../lib/studentRouteFlow";
import { resolveSuhayHusayDecorAssetId } from "../../lib/studentCampus3dPresentation";
import { SUHAY_HUSAY_V3_POINTS, SUHAY_HUSAY_V3_ROCKS, SUHAY_HUSAY_V5_LIMBS, SUHAY_HUSAY_V5_POINTS, SUHAY_HUSAY_V6_SHAPES, SUHAY_HUSAY_V7_SHAPES, SUHAY_HUSAY_V8_SHAPES, SUHAY_HUSAY_V9_SHAPES, SUHAY_HUSAY_V10_SHAPES, SUHAY_HUSAY_V11_SHAPES, suhayHusaySymbolPath, suhayHusaySymbolPoint, suhayHusayV6SymbolPoint, suhayHusayV7SymbolPoint, suhayHusayV8SymbolPoint, suhayHusayV9SymbolPoint, suhayHusayV10SymbolPoint, suhayHusayV11SymbolPoint, type SuhayPointName, type SuhayV5PointName, type SuhayV6ShapeName, type SuhayV7ShapeName, type SuhayV8ShapeName, type SuhayV9ShapeName, type SuhayV10ShapeName, type SuhayV11ShapeName } from "../../lib/suhayHusayLandmark";

export interface OutdoorBuildingVisualProps {
  building: CampusBuilding;
  selected?: boolean;
  /** Student map-pick affordance; never used by Admin Canvas. */
  pickTarget?: boolean;
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
function OutdoorBuildingVisualView({
  building,
  selected = false,
  pickTarget = false,
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
      className={onSelect ? "student-map-building" : undefined}
      data-selected={selected ? "true" : "false"}
      data-interactive={onSelect ? "true" : "false"}
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
      {selected && <rect className="student-map-building__selection-halo" x={building.x - 7} y={building.y - 7} width={building.width + 14} height={building.height + 14} rx={11} fill="rgba(37,99,235,0.045)" stroke="rgba(37,99,235,0.38)" strokeWidth={7} pointerEvents="none" />}
      {pickTarget && !selected && <rect data-testid="student-map-pick-building-target" x={building.x - 3} y={building.y - 3} width={building.width + 6} height={building.height + 6} rx={9} fill="rgba(37,99,235,0.035)" stroke="#60a5fa" strokeWidth={2.2} strokeDasharray="7 4" pointerEvents="none" />}
      {selected && <rect className="student-map-building__selection-outline" x={building.x - 3} y={building.y - 3} width={building.width + 6} height={building.height + 6} rx={9} fill="none" stroke="#2563eb" strokeWidth={2.5} pointerEvents={interactive ? undefined : "none"} />}
      <rect className="student-map-building__body" x={building.x} y={building.y} width={building.width} height={building.height} rx={8} fill={building.color || "#64748b"} stroke={selected ? "#2563eb" : "rgba(255,255,255,0.68)"} strokeWidth={selected ? 2.5 : 1.5} opacity={bodyOpacity} pointerEvents={interactive ? undefined : "none"} />
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

export const OutdoorBuildingVisual = memo(OutdoorBuildingVisualView);

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
function OutdoorGroundAreaArtworkView({ asset, x = asset.x, y = asset.y, width, height, gridSize = 20, selected = false }: {
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
  if (asset.surfaceCells?.length && asset.type !== "parking-lot") {
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
  // Older persisted Parking Lots can arrive as the generic Ground Area type
  // with groundType=parking. Keep their original geometry, but recover the
  // canonical Parking Lot artwork instead of drawing the generic stall sketch.
  const parkingLotDescriptor = kind === "parking" ? DECOR_ASSET_MAP["parking-lot"] : undefined;
  const drawWidth = Math.max(30, width ?? asset.width ?? (descriptor?.defaultWidth ?? 150) * decorRenderScale(asset.scale));
  const drawHeight = Math.max(24, height ?? asset.height ?? (descriptor?.defaultHeight ?? 95) * decorRenderScale(asset.scale));
  const areaAsset = asset.type !== "ground-area";
  const left = x - drawWidth / 2;
  const top = y - drawHeight / 2;
  // Parking artwork must remain identical in the Student map while its Admin
  // object is selected; Canvas already draws separate selection handles.
  const selectedArtwork = selected && kind !== "parking";
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
        stroke={selectedArtwork ? "var(--accent)" : areaAsset ? "transparent" : kind === "parking" ? "#626b70" : "transparent"}
        strokeWidth={selectedArtwork ? 2 : areaAsset ? 0 : kind === "parking" ? 0.8 : 0} />
      {appearance.pattern && <rect x={left} y={top} width={drawWidth} height={drawHeight}
        fill={`url(#${appearance.pattern})`} opacity={0.75} pointerEvents="none" />}
      {kind === "parking" && (
        <g data-testid="parking-stalls" pointerEvents="none" opacity={0.68}>
          {parkingLotDescriptor ? (
            <svg x={left} y={top} width={drawWidth} height={drawHeight}
              viewBox={`0 0 ${parkingLotDescriptor.defaultWidth} ${parkingLotDescriptor.defaultHeight}`}
              preserveAspectRatio="none" overflow="hidden">
              {/* Keep the canonical Admin Parking Lot surface as well as its
                  markings and vehicles across editor, preview, and Student. */}
              <DecorAssetArt descriptor={parkingLotDescriptor} />
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

export const OutdoorGroundAreaArtwork = memo(OutdoorGroundAreaArtworkView);

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

function outdoorEntrancePosition(building: CampusBuilding, entrance: ReadonlyOutdoorEntrance) {
  return entrance.legacyPosition
    ? { ...entrance.legacyPosition, angle: 0 }
    : entranceWorldPosition(building, entrance);
}

/** Shared Student eligibility rule for authored outdoor Enter actions. */
export function canEnterOutdoorBuilding(entrance: ReadonlyOutdoorEntrance) {
  return normalizeEntranceType(entrance.type) !== "emergency_exit"
    && normalizeEntranceDirection(entrance) !== "exit_only";
}

function outdoorEntryLabelOrigin(badgePoint: { x: number; y: number; angle: number }) {
  const radians = (badgePoint.angle * Math.PI) / 180;
  const outwardX = Math.sin(radians);
  const outwardY = -Math.cos(radians);

  // Put the pill beyond the direction badge so door and badge symbols cannot
  // sit on top of its text. Choose the dominant outward axis for rotated walls.
  if (Math.abs(outwardX) > Math.abs(outwardY)) {
    return {
      x: badgePoint.x + (outwardX < 0 ? -96 : 10),
      y: badgePoint.y - 9,
    };
  }

  return {
    x: badgePoint.x + 9,
    y: badgePoint.y + (outwardY < 0 ? -28 : 10),
  };
}

function outdoorEntryLabelBounds(building: CampusBuilding, entrance: ReadonlyOutdoorEntrance, expanded = false) {
  const position = outdoorEntrancePosition(building, entrance);
  const badgePoint = entranceDirectionBadgePlacement(
    position.x,
    position.y,
    entrance.edge,
    entrance.legacyPosition ? 0 : building.rotation ?? 0,
  );
  const labelText = expanded ? `Enter ${building.code || building.name}` : "Enter";
  const { width, height } = studentDoorwayActionLabelSize(labelText);
  const label = studentDoorwayActionLabelPlacement(badgePoint.angle, width, height);
  const centerX = badgePoint.x + label.screenX;
  const centerY = badgePoint.y + label.screenY;
  return { left: centerX - width / 2, right: centerX + width / 2, top: centerY - height / 2, bottom: centerY + height / 2 };
}

function defaultOutdoorEntryLabelIds(campus: ReadonlyOutdoorCampus, activeId?: string | null, hoveredId?: string | null, suppressedId?: string | null) {
  const visibleIds = new Set<string>();
  const buildings = new Map(campus.buildings.map((building) => [building.id, building]));
  const candidates = campus.entrances
    .filter((entrance) => entrance.id !== suppressedId && canEnterOutdoorBuilding(entrance) && buildings.has(entrance.buildingId))
    .sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId)
      || Number(b.id === hoveredId) - Number(a.id === hoveredId)
      || Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)))
    .map((entrance) => {
      const building = buildings.get(entrance.buildingId)!;
      const position = outdoorEntrancePosition(building, entrance);
      const badge = entranceDirectionBadgePlacement(position.x, position.y, entrance.edge, entrance.legacyPosition ? 0 : building.rotation ?? 0);
      const expanded = entrance.id === activeId || entrance.id === hoveredId;
      return {
        entrance,
        bounds: outdoorEntryLabelBounds(building, entrance, expanded),
        icon: { left: badge.x - 11, right: badge.x + 11, top: badge.y - 11, bottom: badge.y + 11 },
      };
    });
  const placedLabels: ReturnType<typeof outdoorEntryLabelBounds>[] = [];

  for (const candidate of candidates) {
    const { entrance, bounds } = candidate;
    const coversOtherIcon = candidates.some((other) => other.entrance.id !== entrance.id
      && bounds.left < other.icon.right && bounds.right > other.icon.left
      && bounds.top < other.icon.bottom && bounds.bottom > other.icon.top);
    if (coversOtherIcon) continue;
    if (placedLabels.some((placed) => bounds.left < placed.right && bounds.right > placed.left
      && bounds.top < placed.bottom && bounds.bottom > placed.top)) continue;
    visibleIds.add(entrance.id);
    placedLabels.push(bounds);
  }

  return visibleIds;
}

export function OutdoorEntranceVisual({
  building,
  entrance,
  onClick,
  showEntryLabelByDefault = true,
  showEntryPill = true,
  compactEntryAction = false,
  routeRelevant = false,
  active = false,
  suppressActiveAction = false,
  reducedMotion = false,
  overviewDuplicate = false,
  onEmphasisChange,
}: {
  building: CampusBuilding;
  entrance: ReadonlyOutdoorEntrance;
  /** Optional read-only map callback for selecting the entrance's building. */
  onClick?: (buildingId: string) => void;
  /** Keep default labels sparse; secondary doors reveal their label on focus or hover. */
  showEntryLabelByDefault?: boolean;
  /** Hide the permanent world-space action pill while preserving the entrance glyph and hit target. */
  showEntryPill?: boolean;
  /** Student maps omit the separate action pill and rely on the authored direction arrow. */
  compactEntryAction?: boolean;
  routeRelevant?: boolean;
  active?: boolean;
  /** The active route control replaces the passive arrow at this doorway. */
  suppressActiveAction?: boolean;
  reducedMotion?: boolean;
  overviewDuplicate?: boolean;
  onEmphasisChange?: (entranceId: string | null) => void;
}) {
  const [emphasized, setEmphasized] = useState(false);
  const position = outdoorEntrancePosition(building, entrance);
  const label = entranceDisplayName(entrance, (building.entrances ?? []).findIndex((item) => item.id === entrance.id));
  const entryActionLabel = `Enter ${building.code || building.name}`;
  const color = BUILDING_ENTRANCE_TYPE_COLORS[normalizeEntranceType(entrance.type)];
  const canEnterBuilding = Boolean(
    onClick
      && canEnterOutdoorBuilding(entrance),
  );
  const canActivateEntrance = canEnterBuilding && !suppressActiveAction;
  const badgePoint = entranceDirectionBadgePlacement(
    position.x,
    position.y,
    entrance.edge,
    entrance.legacyPosition ? 0 : building.rotation ?? 0,
  );
  const originalLabelOrigin = outdoorEntryLabelOrigin(badgePoint);
  const labelOrigin = originalLabelOrigin;
  const showEntryIndicator = showEntryPill && canEnterBuilding && !compactEntryAction && (emphasized || showEntryLabelByDefault);
  return (
    <g data-testid="readonly-entrance" data-entrance-id={entrance.id}
      className={compactEntryAction && canEnterBuilding ? "student-map-doorway-action" : undefined}
      role={canActivateEntrance ? "button" : undefined}
      tabIndex={canActivateEntrance ? 0 : undefined}
      aria-label={canActivateEntrance ? `Enter ${building.name}` : undefined}
      style={{ cursor: canActivateEntrance ? "pointer" : undefined }}
      onKeyDown={canActivateEntrance ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onClick?.(building.id);
      } : undefined}
      onFocus={canActivateEntrance ? () => { setEmphasized(true); onEmphasisChange?.(entrance.id); } : undefined}
      onBlur={canActivateEntrance ? () => { setEmphasized(false); onEmphasisChange?.(null); } : undefined}
      onMouseEnter={canActivateEntrance ? () => { setEmphasized(true); onEmphasisChange?.(entrance.id); } : undefined}
      onMouseLeave={canActivateEntrance ? () => { setEmphasized(false); onEmphasisChange?.(null); } : undefined}
      onClick={canActivateEntrance ? (event) => { event.stopPropagation(); onClick?.(building.id); } : undefined}>
      <title>{compactEntryAction && canEnterBuilding
        ? `${entryActionLabel} building`
        : `${label}${canEnterBuilding ? " · Enter Building" : ""}${entrance.accessible ? " · Accessible" : ""}`}</title>
      <g transform={`translate(${position.x},${position.y}) rotate(${position.angle ?? 0})`}>
        {canActivateEntrance && <rect data-testid="readonly-enter-building-door-hit-target" x={-24} y={-24}
          width={48} height={48} fill="transparent" pointerEvents="all" />}
        <OutdoorEntranceArtwork entrance={entrance} color={color} />
      </g>
      {!suppressActiveAction && <EntranceDirectionBadge
        x={position.x}
        y={position.y}
        edge={entrance.edge}
        direction={entrance.direction}
        type={entrance.type}
        rotation={entrance.legacyPosition ? 0 : building.rotation ?? 0}
        routeRelevant={compactEntryAction && routeRelevant}
        active={compactEntryAction && active}
        emphasized={emphasized}
        pressableDirection={compactEntryAction && canEnterBuilding ? "entrance" : undefined}
        activeDirection={compactEntryAction && active ? "entrance" : undefined}
        screenConsistent={compactEntryAction}
        interactiveHitTarget={compactEntryAction && canEnterBuilding}
        overviewDuplicate={compactEntryAction && overviewDuplicate}
        actionLabel={compactEntryAction && canEnterBuilding ? "Enter" : undefined}
        expandedActionLabel={compactEntryAction && canEnterBuilding ? entryActionLabel : undefined}
        showActionLabel={!compactEntryAction || showEntryLabelByDefault}
        reducedMotion={reducedMotion}
      />}
      {showEntryIndicator && (
        <g data-testid="student-enter-building-indicator" pointerEvents="all">
          {emphasized && <circle cx={badgePoint.x} cy={badgePoint.y} r={10.5} fill="#60a5fa" opacity={0.32} />}
          <g transform={`translate(${labelOrigin.x},${labelOrigin.y})`}>
            <rect data-testid="readonly-enter-building-indicator-hit-target" x={-3} y={-13} width={92} height={44}
              rx={12} fill="transparent" pointerEvents="all" />
            <rect data-testid="student-enter-building-pill" width={86} height={18} rx={9}
              fill={emphasized ? "#dbeafe" : "#eff6ff"}
              stroke={emphasized ? "#1d4ed8" : "#3b82f6"} strokeWidth={emphasized ? 1.4 : 1} />
            <path d="M5.5 5.5 12 12m-5.5 0H12V6.5" fill="none" stroke="#1e40af" strokeWidth={1.3}
              strokeLinecap="round" strokeLinejoin="round" />
            <text data-testid="student-enter-building-label" x={16} y={11.8} textLength={64} lengthAdjust="spacingAndGlyphs" fill="#1e3a8a" fontSize={7.2} fontWeight={700} fontFamily="inherit">{entryActionLabel}</text>
          </g>
          <title>Enter Building — open {building.name}</title>
        </g>
      )}
    </g>
  );
}

/** Canonical physical entrance glyph used in both Admin Canvas and viewer. */
function OutdoorEntranceArtworkView({ entrance, color, outlineColor = color, outlineWidth = 1.8, showPrimary = true, showAccessible = true }: {
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

export const OutdoorEmergencyStairVisual = memo(function OutdoorEmergencyStairVisual({
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
});

function StudentSuhayHusayDecorVisualLegacy({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  return <g data-testid="student-suhay-husay-2d-symbol" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.09)" stroke="#2563eb" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}
      <path d="M3 23.5 L29 23.5 L26.2 28.5 L5.8 28.5 Z" fill="#a8a29e" stroke="#625f5a" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M5 22 L27 22 L29 24 L3 24 Z" fill="#d6d3d1" stroke="#78716c" strokeWidth="0.65" strokeLinejoin="round" />
      {/* Taller standing figure, left: separated legs and an inward-leaning torso. */}
      <path d="M10.2 17.7 L8.2 23 M11.5 17.6 L14.1 23 M10.9 17.9 L11.9 12.1 L13.1 9.4" fill="none" stroke="#51483e" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13.7" cy="7.7" r="1.75" fill="#6a5a48" />
      <path d="M12.4 11.9 L15.3 10.8 L17.1 12.1 M11.5 12.4 L14.4 13.6 L17.1 12.4" fill="none" stroke="#51483e" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
      {/* Lower seated/kneeling figure: low torso, folded leg, face turned left. */}
      <path d="M21.5 17.4 L19.3 19.3 L23.2 20.3 L25.8 23.1 M19.6 19.3 L17.5 21.4 L20.5 23.1 M20.4 17.6 L18.7 14.8 L17.1 12.4" fill="none" stroke="#51483e" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.9" cy="15.1" r="1.7" fill="#6a5a48" />
      <path d="M20.7 17.1 L18.7 14.8 L17.1 12.4 M22.2 17.7 L19.4 15.2 L17.1 12.4" fill="none" stroke="#51483e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.1" cy="12.4" r="1.05" fill="#806b52" stroke="#403a34" strokeWidth="0.45" />
      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.9" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V2 is a compact top-down landmark pictogram. Filled angular body shapes
 * distinguish the upright figure from the seated figure; one joined reach
 * links them across the shared faceted stone base. */
function StudentSuhayHusayDecorVisualV2({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v2" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.09)" stroke="#2563eb" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}
      {/* The faceted stone is a substantial base, not a decorative ground
          line. The second plane gives the low figure a visible seat. */}
      <path d="M3.4 23.2 L28.6 23.2 L25.3 28.3 L6.4 28.3 Z" fill="#565550" stroke="#393a39" strokeWidth="0.7" strokeLinejoin="round" />
      <path d="M5.3 21.9 L26.9 21.9 L28.6 23.4 L3.4 23.4 Z" fill="#99968d" stroke="#5d5b55" strokeWidth="0.65" strokeLinejoin="round" />
      <path d="M19.1 19.2 L22.8 18.4 L25.9 21.9 L19.3 21.9 Z" fill="#b1aca0" stroke="#726f67" strokeWidth="0.55" strokeLinejoin="round" />

      {/* Upright person at left: broad tapered trunk, two planted legs and a
          head high above the seated person's head. */}
      <path data-testid="student-suhay-standing-silhouette" d="M9.2 18.3 L8.2 22.7 L10.3 22.7 L11.5 19.8 L12.5 22.7 L14.6 22.7 L13.6 18 L14.4 13.1 L13.1 10.8 L10.7 11.5 L10.3 15.6 Z" fill="#51483d" stroke="#3d382f" strokeWidth="0.55" strokeLinejoin="round" />
      <path d="M10.6 12 L12.7 10.9 L14.3 11.8 L14.8 14.2 L12.8 14.9 L10.2 14 Z" fill="#756047" stroke="#51483d" strokeWidth="0.45" strokeLinejoin="round" />
      <path d="M11.8 10.8 L12.5 9.7 L14.3 9.3 L14.5 10.4 L13.3 11.5 Z" fill="#5f503e" />
      <path d="M13.5 9.2 L14.8 9.7 L14.2 11 L12.9 10.5 Z" fill="#806b52" stroke="#51483d" strokeWidth="0.4" />

      {/* Seated/kneeling person at right: low raised torso, visible folded
          thigh across the stone and tucked shin, so this cannot read as a
          second standing figure. */}
      <path data-testid="student-suhay-seated-silhouette" d="M18.6 18.9 L17.7 16.6 L18.5 14.8 L20.1 14.4 L21.5 16.2 L21.9 18.2 L25.8 20.9 L24.9 22.2 L20.7 21.1 L18.9 20.1 Z" fill="#51483d" stroke="#3d382f" strokeWidth="0.55" strokeLinejoin="round" />
      <path d="M18.5 17.1 L19.2 15.2 L20.8 14.8 L21.6 16.6 L21.2 18.8 L19.7 19.2 Z" fill="#756047" stroke="#51483d" strokeWidth="0.45" strokeLinejoin="round" />
      <path d="M17.8 14.7 L18.2 13.5 L19.6 13 L20.4 13.8 L19.6 15.2 L18.5 15.4 Z" fill="#806b52" stroke="#51483d" strokeWidth="0.4" strokeLinejoin="round" />
      <path d="M18.8 19.3 L16.9 20.2 L18.2 21.6 L21.1 21.8 L22 21.1 L20 20.1 Z" fill="#5c5041" stroke="#40392f" strokeWidth="0.45" strokeLinejoin="round" />

      {/* The reaching arms converge in one visible supportive hand clasp.
          A filled link is intentional: thin crossing strokes looked combative
          at this scale. */}
      <path d="M12.8 12.8 L14.6 12.5 L16.2 13.7 L17.4 14.3 L18.4 14.5 L18.1 15.5 L16.7 15.1 L15.3 14.3 L13.7 14.4 Z" fill="#66533e" stroke="#403a32" strokeWidth="0.55" strokeLinejoin="round" />
      <path d="M17.2 14.1 L18.5 14.4 L18.9 15.2 L18.2 15.8 L17.4 15.3 L16.8 14.7 Z" fill="#b09168" stroke="#51483d" strokeWidth="0.45" strokeLinejoin="round" />
      <path d="M18.25 14.85 L18.65 15.02" stroke="#ded0b6" strokeWidth="0.6" strokeLinecap="round" />

      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.9" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

function suhayHusaySymbolLimbPath(from: readonly number[], to: readonly number[], radius: number): string {
  const [ax, ay] = suhayHusaySymbolPoint(from);
  const [bx, by] = suhayHusaySymbolPoint(to);
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const nx = (-dy / length) * radius * 20;
  const ny = (dx / length) * radius * 15;
  return suhayHusaySymbolPath([
    [(ax - 16 + nx) / 20, (28 - (ay + ny)) / 15],
    [(bx - 16 + nx) / 20, (28 - (by + ny)) / 15],
    [(bx - 16 - nx) / 20, (28 - (by - ny)) / 15],
    [(ax - 16 - nx) / 20, (28 - (ay - ny)) / 15],
  ]);
}

/** V3 uses the same joint anchors as the 3D sculpture, projected into a small
 * filled-polygon emblem. No line-and-circle stick-figure construction. */
function StudentSuhayHusayDecorVisualV3({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const p = (name: SuhayPointName) => SUHAY_HUSAY_V3_POINTS[name];
  const offset = (name: SuhayPointName, dx: number, dy: number): number[] => [p(name)[0] + dx, p(name)[1] + dy];
  const shape = (points: readonly (readonly number[])[]) => suhayHusaySymbolPath(points);
  const limbPath = (from: SuhayPointName, to: SuhayPointName, radius: number) => suhayHusaySymbolLimbPath(p(from), p(to), radius);
  const rockTones: Record<string, string> = { dark: "#414442", mid: "#575851", light: "#777269" };
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v3" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.09)" stroke="#2563eb" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}

      {/* Faceted rising outcrop: the planted feet and seated body grow from
          one irregular stone silhouette rather than a flat box pedestal. */}
      <path d={suhayHusaySymbolPath([[-0.64, 0.04], [-0.56, 0.2], [-0.45, 0.18], [-0.35, 0.45], [-0.17, 0.34], [0.03, 0.59], [0.27, 0.35], [0.43, 0.48], [0.58, 0.16], [0.65, 0.04]])} fill="#494b48" stroke="#343735" strokeWidth="0.65" strokeLinejoin="round" />
      {SUHAY_HUSAY_V3_ROCKS.map((rock, index) => {
        const [cx, cy] = suhayHusaySymbolPoint(rock.position);
        const rx = rock.scale[0] * 20;
        const ry = rock.scale[1] * 15;
        const points = [
          [cx - rx * 0.88, cy + ry * 0.34], [cx - rx * 0.72, cy - ry * 0.42],
          [cx - rx * 0.14, cy - ry * 0.95], [cx + rx * 0.62, cy - ry * 0.38],
          [cx + rx * 0.9, cy + ry * 0.52], [cx + rx * 0.08, cy + ry * 0.88],
        ].map(([x, y]) => [(x - 16) / 20, (28 - y) / 15]);
        return <path key={rock.id} d={suhayHusaySymbolPath(points)} fill={rockTones[rock.tone]} stroke="#383a38" strokeWidth="0.35" strokeLinejoin="round" opacity={index === 3 ? 0.88 : 1} />;
      })}

      {/* Upper figure: two separated, substantial legs enclose the lower
          person. The long torso leans back and the angular head tips skyward. */}
      <g data-testid="student-suhay-standing-silhouette">
        <path d={shape([offset("upperFootLeft", -0.1, -0.035), offset("upperFootLeft", 0.09, -0.03), offset("upperKneeLeft", 0.075, 0.02), offset("upperHipLeft", 0.07, 0.02), offset("upperPelvis", -0.13, -0.02), offset("upperHipLeft", -0.075, -0.03), offset("upperKneeLeft", -0.075, -0.025)])} fill="#414442" stroke="#2f3231" strokeWidth="0.4" strokeLinejoin="round" />
        <path d={shape([offset("upperFootRight", -0.09, -0.03), offset("upperFootRight", 0.1, -0.035), offset("upperKneeRight", 0.075, -0.025), offset("upperHipRight", 0.07, -0.03), offset("upperPelvis", 0.15, -0.02), offset("upperHipRight", -0.07, 0.02), offset("upperKneeRight", -0.075, 0.02)])} fill="#4b4b47" stroke="#2f3231" strokeWidth="0.4" strokeLinejoin="round" />
        <path d={shape([offset("upperPelvis", -0.14, -0.04), offset("upperPelvis", 0.13, -0.04), offset("upperShoulderRight", 0.08, 0.025), offset("upperShoulderRight", 0.035, 0.095), offset("upperShoulderLeft", -0.045, 0.095), offset("upperShoulderLeft", -0.055, 0.025)])} fill="#55534d" stroke="#383a38" strokeWidth="0.42" strokeLinejoin="round" />
        <path d={shape([offset("upperNeck", -0.08, -0.02), offset("upperNeck", 0.06, -0.03), offset("upperHead", 0.07, -0.035), offset("upperHead", 0.08, 0.025), offset("upperHead", 0.02, 0.095), offset("upperHead", -0.055, 0.06), offset("upperHead", -0.09, 0.01)])} fill="#484947" stroke="#343735" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape([offset("upperHead", -0.09, 0.01), offset("upperHead", -0.055, 0.06), offset("upperHead", 0.02, 0.095), offset("upperHead", 0.08, 0.025), offset("upperHead", 0.035, -0.045), offset("upperHead", -0.035, -0.08)])} fill="#5c5a52" stroke="#343735" strokeWidth="0.4" strokeLinejoin="round" />
        <path d={shape([offset("upperShoulderLeft", -0.04, 0.01), offset("upperShoulderLeft", 0.07, -0.025), offset("upperElbowLeft", 0.05, 0.015), offset("upperElbowLeft", -0.04, -0.02)])} fill="#55534d" stroke="#383a38" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape([offset("upperShoulderRight", -0.04, 0.015), offset("upperShoulderRight", 0.04, -0.02), offset("upperElbowRight", 0.045, 0.02), offset("upperElbowRight", -0.04, -0.015)])} fill="#4b4b47" stroke="#383a38" strokeWidth="0.38" strokeLinejoin="round" />
      </g>

      {/* Lower figure is layered in front of the standing legs: folded thighs
          and shins rest on stone while the torso and face rise toward the clasp. */}
      <g data-testid="student-suhay-seated-silhouette">
        <path d={shape([offset("lowerHipRight", -0.06, 0.01), offset("lowerKneeRight", -0.055, 0.035), offset("lowerFootRight", 0.055, 0.025), offset("lowerFootRight", 0.075, 0.105), offset("lowerKneeRight", 0.035, 0.1), offset("lowerPelvis", 0.07, 0.045)])} fill="#4a4b47" stroke="#303332" strokeWidth="0.4" strokeLinejoin="round" />
        <path d={shape([offset("lowerPelvis", -0.07, 0.05), offset("lowerHipLeft", -0.05, 0.01), offset("lowerKneeLeft", 0.045, 0.02), offset("lowerFootLeft", 0.07, 0.025), offset("lowerFootLeft", -0.05, 0.1), offset("lowerKneeLeft", -0.04, 0.08)])} fill="#414442" stroke="#303332" strokeWidth="0.4" strokeLinejoin="round" />
        <path d={shape([offset("lowerPelvis", -0.14, -0.04), offset("lowerPelvis", 0.14, -0.04), offset("lowerChest", 0.1, 0.02), offset("lowerShoulderRight", 0.05, 0.055), offset("lowerShoulderLeft", -0.06, 0.055), offset("lowerChest", -0.11, 0.02)])} fill="#56554f" stroke="#343735" strokeWidth="0.42" strokeLinejoin="round" />
        <path d={shape([offset("lowerNeck", -0.05, -0.015), offset("lowerNeck", 0.055, -0.02), offset("lowerHead", 0.075, -0.02), offset("lowerHead", 0.075, 0.025), offset("lowerHead", 0.01, 0.085), offset("lowerHead", -0.06, 0.055), offset("lowerHead", -0.08, 0.005)])} fill="#484947" stroke="#343735" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape([offset("lowerShoulderLeft", -0.04, 0.025), offset("lowerShoulderLeft", 0.04, -0.035), offset("lowerElbowLeft", 0.04, 0.015), offset("lowerElbowLeft", -0.035, -0.02)])} fill="#55534d" stroke="#343735" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape([offset("lowerShoulderRight", -0.04, 0.025), offset("lowerShoulderRight", 0.04, -0.035), offset("lowerElbowRight", 0.04, 0.015), offset("lowerElbowRight", -0.035, -0.02)])} fill="#55534d" stroke="#383a38" strokeWidth="0.34" strokeLinejoin="round" />
      </g>

      {/* A pair of raised, solid polygonal reaches meet hand-to-hand. */}
      <path d={limbPath("upperShoulderLeft", "upperElbowLeft", 0.048)} fill="#55534d" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbPath("upperElbowLeft", "claspLeft", 0.043)} fill="#4b4b47" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbPath("upperShoulderRight", "upperElbowRight", 0.048)} fill="#4b4b47" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbPath("upperElbowRight", "claspRight", 0.043)} fill="#55534d" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbPath("lowerShoulderLeft", "lowerElbowLeft", 0.043)} fill="#5c5a52" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbPath("lowerElbowLeft", "claspLeft", 0.04)} fill="#55534d" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbPath("lowerShoulderRight", "lowerElbowRight", 0.043)} fill="#55534d" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbPath("lowerElbowRight", "claspRight", 0.04)} fill="#4b4b47" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />
      {(["claspLeft", "claspRight"] as const).map((name, index) => {
        const [x, y] = suhayHusaySymbolPoint(p(name));
        return <path key={name} d={index === 0 ? `M${x - 1.05} ${y - 0.55} L${x + 0.45} ${y - 0.85} L${x + 1.05} ${y + 0.35} L${x - 0.45} ${y + 0.9} Z` : `M${x - 0.9} ${y - 0.65} L${x + 0.65} ${y - 0.75} L${x + 1} ${y + 0.5} L${x - 0.5} ${y + 0.8} Z`} fill="#716858" stroke="#343735" strokeWidth="0.35" strokeLinejoin="round" />;
      })}

      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.9" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V4 keeps the 2D symbol deliberately spare: one clear plinth, a unified
 * angular outcrop, an open standing stance, and a seated figure in its center. */
function StudentSuhayHusayDecorVisualV4({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v4" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.09)" stroke="#2563eb" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}

      {/* A low, organized rock shoulder sits behind a formal stone plinth. */}
      <path d="M4.9 24.7 L7.4 22.6 L10.2 19.7 L12.7 21 L15.8 18.3 L18.5 20.3 L21 19.5 L25.4 22.7 L27.1 24.7 Z" fill="#5d5a53" stroke="#383a38" strokeWidth="0.55" strokeLinejoin="round" />
      <path d="M9.1 23.6 L12.7 21 L14.2 24.7 L7.2 24.7 Z" fill="#716d63" />
      <path d="M17.1 24.7 L18.5 20.3 L22.5 22.1 L25.4 24.7 Z" fill="#494b49" />
      <path d="M5.4 24.8 L26.6 24.8 L23.6 28.6 L8.3 28.6 Z" fill="#484946" stroke="#343735" strokeWidth="0.7" strokeLinejoin="round" />
      <path d="M4.6 24.5 L27.4 24.5 L26.6 25.2 L5.4 25.2 Z" fill="#89857b" stroke="#494a47" strokeWidth="0.55" strokeLinejoin="round" />

      {/* Standing figure. Its raised head, backward-leaning trunk, and two
          separated legs are one unmistakable upward-reaching silhouette. */}
      <g data-testid="student-suhay-standing-silhouette">
        <path d="M11.8 13.9 L14.1 14.2 L12.6 18.3 L10.2 23.7 L8.2 24 L9.1 21.5 L10.6 17.2 Z" fill="#474640" stroke="#302f2c" strokeWidth="0.45" strokeLinejoin="round" />
        <path d="M14.8 14.1 L17 13.8 L18.4 17.4 L21.5 22.6 L20.2 24 L18.2 22.8 L15.9 19.2 L14.3 17 Z" fill="#514c43" stroke="#302f2c" strokeWidth="0.45" strokeLinejoin="round" />
        <path d="M12.2 7.2 L15.4 7.9 L17 13.5 L15.8 15.6 L13 15 L11.9 10.5 Z" fill="#5a544a" stroke="#34332f" strokeWidth="0.48" strokeLinejoin="round" />
        <path d="M12.2 7.7 L13.6 7.3 L11.9 5.4 L10.8 5.1 L10.4 5.8 Z" fill="#776b58" stroke="#34332f" strokeWidth="0.38" strokeLinejoin="round" />
        <path d="M9.1 3.7 L10.2 3.1 L11.5 3.7 L11.8 4.6 L10.8 5.3 L9.5 4.8 Z" fill="#514b42" stroke="#302f2c" strokeWidth="0.42" strokeLinejoin="round" />
        <path d="M12.7 8 L13.7 7.8 L17 9.8 L19.5 13.3 L20.4 14 L19.4 15 L18.1 14.2 L15.7 11 L13 9.5 Z" fill="#62594c" stroke="#34332f" strokeWidth="0.38" strokeLinejoin="round" />
        <path d="M15 8.8 L16.1 8.7 L18.4 10.8 L20.2 13.5 L20.7 14.7 L19.5 15.1 L18.5 13.1 L16.9 11.4 Z" fill="#514b42" stroke="#34332f" strokeWidth="0.38" strokeLinejoin="round" />
      </g>

      {/* Lower figure, clearly below and between the standing legs: a lifted
          chest over folded legs, with both forearms joining the same hands. */}
      <g data-testid="student-suhay-seated-silhouette">
        <path d="M16.5 19.4 L15.1 20.4 L13.3 22.3 L14.6 23.4 L17.3 22.6 L18.2 21.1 Z" fill="#625846" stroke="#34332f" strokeWidth="0.42" strokeLinejoin="round" />
        <path d="M17.5 19.5 L19.4 20.1 L21 22.1 L20 23.4 L18 22.7 L16.9 21.4 Z" fill="#514b42" stroke="#34332f" strokeWidth="0.42" strokeLinejoin="round" />
        <path d="M16 17.7 L16.6 16.1 L18.1 15.9 L19.7 17 L19.4 19.9 L17.2 20.7 L15.9 19.2 Z" fill="#776a56" stroke="#34332f" strokeWidth="0.45" strokeLinejoin="round" />
        <path d="M17.6 14.5 L18.8 13.9 L20 14.5 L20.1 15.5 L19.2 16.1 L18 15.7 Z" fill="#5a5145" stroke="#34332f" strokeWidth="0.38" strokeLinejoin="round" />
        <path d="M16.1 16.8 L17 15.9 L18.8 14.6 L19.7 14.1 L20.3 14.9 L19.1 15.8 L17.9 17.5 Z" fill="#80715a" stroke="#34332f" strokeWidth="0.36" strokeLinejoin="round" />
        <path d="M18 17 L18.8 16.1 L19.9 14.8 L20.7 14.9 L20.3 16.2 L19 17.8 Z" fill="#695e4e" stroke="#34332f" strokeWidth="0.36" strokeLinejoin="round" />
      </g>
      <path d="M19.2 13.8 L20 13.6 L20.7 14.3 L20.1 15 L19.3 14.9 L18.9 14.3 Z" fill="#a18b6c" stroke="#443c31" strokeWidth="0.35" strokeLinejoin="round" />

      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.9" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V5 uses one calm, angular silhouette: the standing figure rises on the
 * left, the folded figure rests low on the right, and their four forearms
 * meet at the same anchors used by the 3D model. */
function StudentSuhayHusayDecorVisualV5({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const p = (name: SuhayV5PointName) => SUHAY_HUSAY_V5_POINTS[name];
  const offset = (name: SuhayV5PointName, dx: number, dy: number): number[] => [p(name)[0] + dx, p(name)[1] + dy];
  const shape = (points: readonly (readonly number[])[]) => suhayHusaySymbolPath(points);
  const limb = (from: SuhayV5PointName, to: SuhayV5PointName, radius: number) => suhayHusaySymbolLimbPath(p(from), p(to), radius);
  const limbGroup = (ids: readonly string[]) => ids.map((id) => {
    const item = SUHAY_HUSAY_V5_LIMBS.find((part) => part.id === id)!;
    return limb(item.from, item.to, item.radius);
  }).join(" ");
  const angularHead = (name: "upperHead" | "lowerHead", scaleX: number, scaleY: number) => {
    const [x, y] = p(name);
    return shape([
      [x - scaleX * 0.75, y - scaleY * 0.2], [x - scaleX * 0.28, y - scaleY],
      [x + scaleX * 0.56, y - scaleY * 0.76], [x + scaleX, y - scaleY * 0.04],
      [x + scaleX * 0.48, y + scaleY * 0.7], [x - scaleX * 0.35, y + scaleY * 0.58],
    ]);
  };
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v5" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}

      {/* Unified rock shoulder and a clean beveled pedestal, not loose stones. */}
      <path d={shape([[-0.72, 0.14], [-0.65, 0.36], [-0.46, 0.31], [-0.3, 0.63], [-0.1, 0.46], [0.08, 0.59], [0.29, 0.36], [0.47, 0.43], [0.67, 0.2], [0.72, 0.14]])} fill="#555752" stroke="#343835" strokeWidth="0.52" strokeLinejoin="round" />
      <path d={shape([[-0.65, 0.15], [-0.46, 0.31], [-0.3, 0.63], [-0.18, 0.18]])} fill="#6a6b63" />
      <path d={shape([[-0.1, 0.46], [0.08, 0.59], [0.29, 0.36], [0.19, 0.15]])} fill="#454844" />
      <path d={shape([[-0.7, 0.13], [0.7, 0.13], [0.54, -0.035], [-0.54, -0.035]])} fill="#494c49" stroke="#333735" strokeWidth="0.58" strokeLinejoin="round" />
      <path d={shape([[-0.73, 0.15], [0.73, 0.15], [0.68, 0.1], [-0.68, 0.1]])} fill="#858176" stroke="#494b47" strokeWidth="0.42" strokeLinejoin="round" />

      {/* Standing figure on the CABA/left side; the separated legs leave a
          readable opening and the angular head tips toward the sky. */}
      <g data-testid="student-suhay-standing-silhouette">
        <path d={limbGroup(["upper-left-shin", "upper-right-shin"])} fill="#3b3d3b" stroke="#303331" strokeWidth="0.36" strokeLinejoin="round" />
        <path d={limbGroup(["upper-left-thigh", "upper-right-thigh"])} fill="#4e4d47" stroke="#303331" strokeWidth="0.36" strokeLinejoin="round" />
        <path d={shape([offset("upperPelvis", -0.18, -0.07), offset("upperHipRight", 0.02, 0), offset("upperShoulderRight", 0.08, -0.05), offset("upperShoulderRight", 0.055, 0.055), offset("upperShoulderLeft", -0.05, 0.06), offset("upperChest", -0.11, 0.04), offset("upperPelvis", -0.1, 0.08)])} fill="#57564f" stroke="#333532" strokeWidth="0.42" strokeLinejoin="round" />
        <path d={limb("upperChest", "upperNeck", 0.075)} fill="#666157" stroke="#383a37" strokeWidth="0.34" strokeLinejoin="round" />
        <path d={angularHead("upperHead", 0.12, 0.145)} fill="#494a46" stroke="#2f3331" strokeWidth="0.42" strokeLinejoin="round" />
      </g>

      {/* Right-side figure has folded knees and feet grounded on the stone. */}
      <g data-testid="student-suhay-seated-silhouette">
        <path d={limbGroup(["lower-left-thigh", "lower-right-thigh"])} fill="#625b50" stroke="#343532" strokeWidth="0.36" strokeLinejoin="round" />
        <path d={limbGroup(["lower-left-shin", "lower-right-shin"])} fill="#41423e" stroke="#343532" strokeWidth="0.36" strokeLinejoin="round" />
        <path d={shape([offset("lowerPelvis", -0.12, -0.02), offset("lowerPelvis", 0.11, -0.03), offset("lowerChest", 0.1, 0.03), offset("lowerShoulderRight", 0.05, 0.07), offset("lowerShoulderLeft", -0.06, 0.06), offset("lowerChest", -0.11, 0.04)])} fill="#6a6255" stroke="#373833" strokeWidth="0.42" strokeLinejoin="round" />
        <path d={limb("lowerChest", "lowerNeck", 0.056)} fill="#817564" stroke="#393a36" strokeWidth="0.32" strokeLinejoin="round" />
        <path d={angularHead("lowerHead", 0.096, 0.105)} fill="#514c43" stroke="#313431" strokeWidth="0.38" strokeLinejoin="round" />
      </g>

      {/* Four solid forearms meet at two small joined hands above the lower
          figure. They read as a clasp instead of crossing combat lines. */}
      <path d={limbGroup(["upper-left-arm", "upper-left-forearm", "upper-right-arm", "upper-right-forearm"])} fill="#57554d" stroke="#333532" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={limbGroup(["lower-left-arm", "lower-left-forearm", "lower-right-arm", "lower-right-forearm"])} fill="#716858" stroke="#383935" strokeWidth="0.35" strokeLinejoin="round" />
      <path d={(["claspLeft", "claspRight"] as const).map((name) => {
        const [x, y] = suhayHusaySymbolPoint(p(name));
        return `M${x - 0.68} ${y} L${x} ${y - 0.78} L${x + 0.72} ${y} L${x} ${y + 0.78} Z`;
      }).join(" ")} fill="#98876b" stroke="#403d35" strokeWidth="0.32" strokeLinejoin="round" />

      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.9" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V6 is a compact, clean side-profile icon. Its filled shapes match the 3D
 * sculpture's normalized pose and avoid the thin crossed strokes that read as
 * fighting stick figures at campus-map scale. */
function StudentSuhayHusayDecorVisualV6({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const shape = (name: SuhayV6ShapeName) => SUHAY_HUSAY_V6_SHAPES[name].map(([x, y], index) => {
    const [sx, sy] = suhayHusayV6SymbolPoint([x, y]);
    return `${index === 0 ? "M" : "L"}${sx.toFixed(2)} ${sy.toFixed(2)}`;
  }).join(" ") + " Z";
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v6" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.07)" stroke="#2563eb" strokeWidth="1.15" vectorEffect="non-scaling-stroke" />}

      {/* One formal tapered stone pedestal and one faceted rock shoulder. */}
      <path data-testid="student-suhay-v6-pedestal" d={shape("pedestal")} fill="#555a57" stroke="#343936" strokeWidth="0.58" strokeLinejoin="round" />
      <path d={shape("pedestalFacet")} fill="#73776f" stroke="#454a46" strokeWidth="0.28" strokeLinejoin="round" />
      <path data-testid="student-suhay-v6-outcrop" d={shape("outcrop")} fill="#444a47" stroke="#313634" strokeWidth="0.5" strokeLinejoin="round" />
      <path d={shape("outcropFacet")} fill="#656b64" stroke="#414641" strokeWidth="0.24" strokeLinejoin="round" />

      {/* Standing figure to the left: distinct planted legs, upright mass and
          an unmistakable upward arm/head silhouette. */}
      <g data-testid="student-suhay-standing-silhouette">
        <path d={shape("standingLeftLeg")} fill="#424946" stroke="#303633" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape("standingRightLeg")} fill="#4d5450" stroke="#303633" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape("standingRaisedArm")} fill="#5b635d" stroke="#353c38" strokeWidth="0.34" strokeLinejoin="round" />
        <path d={shape("standingTorso")} fill="#565d59" stroke="#333a37" strokeWidth="0.4" strokeLinejoin="round" />
        <path d={shape("standingNeck")} fill="#686e67" stroke="#373d39" strokeWidth="0.3" strokeLinejoin="round" />
        <path d={shape("standingHead")} fill="#4d5450" stroke="#303633" strokeWidth="0.36" strokeLinejoin="round" />
      </g>

      {/* Lower person sits/reclines on the right with folded legs and a lifted
          torso. The reaching arm joins the standing figure's lower hand. */}
      <g data-testid="student-suhay-seated-silhouette">
        <path d={shape("lowerRaisedThigh")} fill="#77796f" stroke="#363b37" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape("lowerBentShin")} fill="#686f67" stroke="#363b37" strokeWidth="0.36" strokeLinejoin="round" />
        <path d={shape("lowerTuckedLeg")} fill="#5f665e" stroke="#363b37" strokeWidth="0.34" strokeLinejoin="round" />
        <path d={shape("lowerTorso")} fill="#89897d" stroke="#3b403c" strokeWidth="0.38" strokeLinejoin="round" />
        <path d={shape("lowerHead")} fill="#747a72" stroke="#353a37" strokeWidth="0.34" strokeLinejoin="round" />
        <path d={shape("lowerRestingArm")} fill="#777b72" stroke="#343a37" strokeWidth="0.3" strokeLinejoin="round" />
      </g>

      <path data-testid="student-suhay-v6-linked-hands" d={shape("standingLinkedArm")} fill="#555d59" stroke="#333a37" strokeWidth="0.34" strokeLinejoin="round" />
      <path d={shape("lowerLinkedArm")} fill="#85877c" stroke="#39403b" strokeWidth="0.34" strokeLinejoin="round" />
      <path d={shape("clasp")} fill="#a09680" stroke="#41433d" strokeWidth="0.28" strokeLinejoin="round" />

      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.9" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V7 is a cleaner shared side-profile pictogram: the lower body is folded
 * between the standing legs, and the joined arms create one readable gesture. */
function StudentSuhayHusayDecorVisualV7({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const shape = (name: SuhayV7ShapeName) => SUHAY_HUSAY_V7_SHAPES[name].map(([x, y], index) => {
    const [sx, sy] = suhayHusayV7SymbolPoint([x, y]);
    return `${index === 0 ? "M" : "L"}${sx.toFixed(2)} ${sy.toFixed(2)}`;
  }).join(" ") + " Z";
  const path = (name: SuhayV7ShapeName, fill: string, stroke = "#343b38", strokeWidth = 0.34) => (
    <path d={shape(name)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
  );
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v7" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.07)" stroke="#2563eb" strokeWidth="1.15" vectorEffect="non-scaling-stroke" />}
      {/* Formal tapered monument plinth with one rising faceted shoulder. */}
      {path("pedestal", "#515957", "#343a38", 0.48)}
      {path("pedestalTop", "#92958d", "#4c5350", 0.34)}
      {path("pedestalFacet", "#6e7771", "#414946", 0.24)}
      {path("outcrop", "#414a46", "#303734", 0.38)}
      {path("outcropFacet", "#626c65", "#38413d", 0.25)}

      {/* Left/top figure: broad torso and planted separated legs; the angled
          head and raised arm keep the skyward gesture legible at icon scale. */}
      <g data-testid="student-suhay-standing-silhouette">
        {path("standingLeftLeg", "#3e4743")}
        {path("standingRightLeg", "#505a55")}
        {path("standingTorso", "#59635e", "#343b38", 0.42)}
        {path("standingNeck", "#707972", "#414945", 0.28)}
        {path("standingHead", "#48534e", "#303835", 0.32)}
        {path("standingRaisedArm", "#66716a", "#37403b", 0.3)}
      </g>

      {/* Right/lower figure: folded thigh and grounded shin sit within the
          stance; filled masses avoid a crossed-stick appearance. */}
      <g data-testid="student-suhay-seated-silhouette">
        {path("lowerBackThigh", "#747b73")}
        {path("lowerFrontShin", "#626b65")}
        {path("lowerFoldedLeg", "#606a64")}
        {path("lowerTorso", "#85887e", "#3d4540", 0.36)}
        {path("lowerHead", "#747b73", "#3b423f", 0.31)}
        {path("lowerRestingArm", "#737b73", "#39413d", 0.27)}
      </g>
      {path("standingLinkedArm", "#515b56", "#343b38", 0.32)}
      {path("lowerLinkedArm", "#898b80", "#414743", 0.32)}
      {path("clasp", "#a09680", "#494b43", 0.25)}
      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.9" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V8 is a compact, connected monument pictogram. Unified head/neck/body
 * silhouettes remove the disconnected joins, while the restrained plinth and
 * single faceted rise keep it clear at ordinary campus-map scale. */
function StudentSuhayHusayDecorVisualConnected({ asset, descriptor, selected = false, version = "v8" }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean; version?: "v8" | "v9" }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const shapes = version === "v9" ? SUHAY_HUSAY_V9_SHAPES : SUHAY_HUSAY_V8_SHAPES;
  const shape = (name: SuhayV8ShapeName | SuhayV9ShapeName) => shapes[name].map(([x, y], index) => {
    const [sx, sy] = version === "v9" ? suhayHusayV9SymbolPoint([x, y]) : suhayHusayV8SymbolPoint([x, y]);
    return `${index === 0 ? "M" : "L"}${sx.toFixed(2)} ${sy.toFixed(2)}`;
  }).join(" ") + " Z";
  const path = (name: SuhayV8ShapeName, fill: string, stroke = "#303a36", strokeWidth = 0.24) => (
    <path d={shape(name)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
  );
  return <g data-testid="student-suhay-husay-2d-symbol" data-version={version} data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="16" ry="14" fill="rgba(37,99,235,0.07)" stroke="#2563eb" strokeWidth="1.15" vectorEffect="non-scaling-stroke" />}

      {/* One broad, beveled base and one joined stone shoulder. */}
      {path("pedestal", "#535b57", "#303835", 0.34)}
      {path("pedestalTop", "#858b83", "#424a46", 0.25)}
      {path("pedestalFacet", "#69716b", "#414844", 0.18)}
      {path("outcrop", "#444c47", "#303835", 0.26)}
      {path("outcropFacet", "#626b63", "#3c4540", 0.18)}
      {path("seatedSupport", "#525a53", "#373f3a", 0.18)}

      {/* The standing figure's legs and one continuous torso-to-head mass. */}
      <g data-testid="student-suhay-standing-silhouette">
        {path("standingLeftLeg", "#46504a")}
        {path("standingRightLeg", "#515b54")}
        {path("standingCore", "#626b63", "#303a35", 0.28)}
        {path("standingRaisedArm", "#6b746a", "#37413b", 0.22)}
      </g>

      {/* The lower person folds onto the stone seat between the standing
          legs. Both reach masses overlap at one visible clasp. */}
      <g data-testid="student-suhay-seated-silhouette">
        {path("lowerFoldedLeg", "#626b63")}
        {path("lowerCore", "#7a8177", "#3e4740", 0.24)}
        {path("lowerRestingArm", "#6e776d", "#3d463f", 0.18)}
      </g>
      {path("standingLinkedArm", "#515b54", "#303a35", 0.23)}
      {path("lowerLinkedArm", "#85877a", "#43493f", 0.23)}
      {path("clasp", "#a09680", "#4b4d43", 0.2)}
      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.92" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** Keep all previous art selectable; flip this constant for a one-line rollback. */
const STUDENT_SUHAY_HUSAY_2D_VERSION: "legacy" | "v2" | "v3" | "v4" | "v5" | "v6" | "v7" | "v8" | "v9" | "v10" | "v11" | "v12" | "v13" = "v13";

function StudentSuhayHusayDecorVisualV10({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const shape = (name: SuhayV10ShapeName) => SUHAY_HUSAY_V10_SHAPES[name].map((point, index) => {
    const [x, y] = suhayHusayV10SymbolPoint(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
  const path = (name: SuhayV10ShapeName, fill: string, stroke = "#3c403e", strokeWidth = 0.24) => (
    <path key={name} d={shape(name)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
  );
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v10" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="14.7" ry="14.4" fill="rgba(37,99,235,0.055)" stroke="#2563eb" strokeWidth="1.05" vectorEffect="non-scaling-stroke" />}

      {/* One clean tapered plinth with three large connected stone planes. */}
      {path("pedestal", "#59615d", "#343a37", 0.34)}
      {path("pedestalTop", "#858a82", "#4b504c", 0.22)}
      {path("rockMass", "#666c65", "#363d39", 0.28)}
      {path("rockLeftFacet", "#7b8077", "#4a504b", 0.16)}
      {path("rockCenterFacet", "#515a55", "#3e4641", 0.16)}
      {path("seatedSupport", "#626960", "#414842", 0.18)}

      {/* The standing person's joined head, neck, and torso form one readable
          silhouette. Its separated legs frame the lower seated figure. */}
      <g data-testid="student-suhay-standing-silhouette">
        {path("standingLeftLeg", "#444c48", "#303734", 0.26)}
        {path("standingRightLeg", "#515a54", "#303734", 0.26)}
        {path("standingCore", "#687068", "#333a36", 0.28)}
        {path("standingCoreFacet", "#778078", "#4b524c", 0.12)}
        {path("standingHeadFacet", "#7b8076", "#424842", 0.14)}
      {path("standingFreeArm", "#73796f", "#414842", 0.2)}
      </g>

      {/* Lower figure is layered forward, folded onto the stone and between
          the standing legs. Both reaching forearms meet at one shared clasp. */}
      <g data-testid="student-suhay-seated-silhouette">
        {path("lowerFoldedLeg", "#555e58", "#343b37", 0.24)}
        {path("lowerCore", "#88877c", "#414741", 0.26)}
        {path("lowerCoreFacet", "#797b72", "#50544d", 0.12)}
        {path("lowerHeadFacet", "#a09a8b", "#4e5149", 0.14)}
        {path("lowerRestingArm", "#73796f", "#414741", 0.19)}
      </g>
      {path("standingLinkedArm", "#626a63", "#333a36", 0.23)}
      {path("lowerLinkedArm", "#999487", "#474b44", 0.23)}
      {path("clasp", "#b0a58e", "#55564d", 0.18)}
      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.92" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V11 is a quieter, connected landmark silhouette: fewer facets, larger
 * masses and thinner outlines preserve the same side-profile pose at map scale. */
function StudentSuhayHusayDecorVisualV11({ asset, descriptor, selected = false }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const shape = (name: SuhayV11ShapeName) => SUHAY_HUSAY_V11_SHAPES[name].map((point, index) => {
    const [x, y] = suhayHusayV11SymbolPoint(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
  const path = (name: SuhayV11ShapeName, fill: string, stroke = "#3d4540", strokeWidth = 0.16) => (
    <path key={name} d={shape(name)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
  );
  return <g data-testid="student-suhay-husay-2d-symbol" data-version="v11" data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="14.7" ry="14.4" fill="rgba(37,99,235,0.055)" stroke="#2563eb" strokeWidth="1.05" vectorEffect="non-scaling-stroke" />}

      {/* A single grounded outcrop and clean beveled plinth; two broad facets
          echo the target's mountain-like support without a loose-rock texture. */}
      {path("pedestal", "#545d57", "#353d38", 0.28)}
      {path("rockMass", "#626b64", "#414943", 0.19)}
      {path("rockLeftFacet", "#7d847b", "#555d56", 0.11)}
      {path("rockRightFacet", "#4e5851", "#414943", 0.11)}

      {/* The upper person keeps a continuous head/neck/chest silhouette and
          two separate planted legs, leaving a visible opening around the low figure. */}
      <g data-testid="student-suhay-standing-silhouette">
        {path("standingLeftLeg", "#444d47", "#333b36", 0.17)}
        {path("standingRightLeg", "#505a53", "#333b36", 0.17)}
        {path("standingCore", "#626d65", "#3b443e", 0.18)}
        {path("standingCoreFacet", "#7b8278", "#566057", 0.1)}
        {path("standingFreeArm", "#70786f", "#485148", 0.13)}
      </g>

      {/* The second person is low, folded onto the rock and visibly distinct;
          both arms meet at the same small clasp between the figures. */}
      <g data-testid="student-suhay-seated-silhouette">
        {path("lowerFoldedLeg", "#58625a", "#3a433d", 0.15)}
        {path("lowerCore", "#858378", "#444a43", 0.18)}
        {path("lowerCoreFacet", "#74786f", "#596057", 0.1)}
        {path("lowerRestingArm", "#70786f", "#454e47", 0.13)}
      </g>
      {path("standingLinkedArm", "#59635b", "#3a433d", 0.15)}
      {path("lowerLinkedArm", "#999282", "#4d5148", 0.15)}
      {path("clasp", "#b2a68d", "#56584f", 0.12)}
      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.92" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V12 preserves V11's shared profile pose while removing inner facet cuts so
 * the small campus icon reads as one connected, polished monument. */
function StudentSuhayHusayDecorVisualV12({ asset, descriptor, selected = false, version = "v12" }: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean; version?: "v12" | "v13" }) {
  const [hovered, setHovered] = useState(false);
  const { width, height } = decorWorldSize(descriptor, asset.scale);
  const showLabel = selected || hovered;
  const shape = (name: SuhayV11ShapeName) => SUHAY_HUSAY_V11_SHAPES[name].map((point, index) => {
    const [baseX, baseY] = suhayHusayV11SymbolPoint(point);
    const x = 16 + (baseX - 16) * (version === "v13" ? 0.96 : 1);
    const y = 17 + (baseY - 17) * (version === "v13" ? 1.03 : 1);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
  const path = (name: SuhayV11ShapeName, fill: string, stroke = "#3d4540", strokeWidth = 0.14) => (
    <path key={name} d={shape(name)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
  );
  return <g data-testid="student-suhay-husay-2d-symbol" data-version={version} data-asset-id={asset.id}
    transform={`translate(${asset.x - width / 2},${asset.y - height / 2}) rotate(${asset.rotation ?? 0},${width / 2},${height / 2})`}
    opacity={asset.visible === false ? 0 : 1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ cursor: "help" }}>
    <title>Suhay Husay</title>
    <svg x={0} y={0} width={width} height={height} viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      {selected && <ellipse data-testid="student-suhay-husay-selection-ring" cx="16" cy="17" rx="14.7" ry="14.4" fill="rgba(37,99,235,0.055)" stroke="#2563eb" strokeWidth="1.05" vectorEffect="non-scaling-stroke" />}

      {path("pedestal", "#545d57", "#353d38", 0.25)}
      {path("rockMass", "#626b64", "#414943", 0.16)}

      <g data-testid="student-suhay-standing-silhouette">
        {path("standingLeftLeg", "#444d47")}
        {path("standingRightLeg", "#505a53")}
        {path("standingCore", "#687269")}
        {path("standingFreeArm", "#70786f", "#485148", 0.12)}
      </g>

      <g data-testid="student-suhay-seated-silhouette">
        {path("lowerFoldedLeg", "#71776e", "#3a433d", 0.13)}
        {path("lowerCore", "#918e82", "#444a43", 0.15)}
        {path("lowerRestingArm", "#7c8278", "#454e47", 0.12)}
      </g>
      {path("standingLinkedArm", "#59635b", "#3a433d", 0.13)}
      {path("lowerLinkedArm", "#a09a8b", "#4d5148", 0.13)}
      {path("clasp", "#b7aa90", "#56584f", 0.11)}
      {showLabel && <g pointerEvents="none"><rect x="3.1" y="0.1" width="25.8" height="5.4" rx="2.1" fill="#17212b" opacity="0.92" /><text x="16" y="3.85" textAnchor="middle" fill="white" fontSize="3.25" fontWeight="800">Suhay Husay</text></g>}
    </svg>
  </g>;
}

/** V13 uses the same clean V12 symbol with a little more vertical emphasis so
 * the standing-versus-seated relationship survives at campus overview scale. */
function StudentSuhayHusayDecorVisualV13(props: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  return <StudentSuhayHusayDecorVisualV12 {...props} version="v13" />;
}

function StudentSuhayHusayDecorVisual(props: { asset: CampusDecorAsset; descriptor: DecorAssetDescriptor; selected?: boolean }) {
  return STUDENT_SUHAY_HUSAY_2D_VERSION === "v13"
    ? <StudentSuhayHusayDecorVisualV13 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v12"
    ? <StudentSuhayHusayDecorVisualV12 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v11"
    ? <StudentSuhayHusayDecorVisualV11 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v10"
    ? <StudentSuhayHusayDecorVisualV10 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v8"
    ? <StudentSuhayHusayDecorVisualConnected {...props} version="v8" />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v9"
    ? <StudentSuhayHusayDecorVisualConnected {...props} version="v9" />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v7"
    ? <StudentSuhayHusayDecorVisualV7 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v6"
    ? <StudentSuhayHusayDecorVisualV6 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v5"
    ? <StudentSuhayHusayDecorVisualV5 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v4"
    ? <StudentSuhayHusayDecorVisualV4 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v3"
    ? <StudentSuhayHusayDecorVisualV3 {...props} />
    : STUDENT_SUHAY_HUSAY_2D_VERSION === "v2"
      ? <StudentSuhayHusayDecorVisualV2 {...props} />
      : <StudentSuhayHusayDecorVisualLegacy {...props} />;
}

export function OutdoorDecorVisual({ asset, gridSize, studentSuhayHusayLandmark = false, selectedLandmark = false }: { asset: CampusDecorAsset; gridSize?: number; studentSuhayHusayLandmark?: boolean; selectedLandmark?: boolean }) {
  if (isDecorAreaType(asset.type)) return <OutdoorGroundAreaVisual asset={asset} gridSize={gridSize} />;
  const descriptor = DECOR_ASSET_MAP[asset.type];
  if (!descriptor) return null;
  if (studentSuhayHusayLandmark && asset.type === "monument") return <StudentSuhayHusayDecorVisual asset={asset} descriptor={descriptor} selected={selectedLandmark} />;
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

export const OutdoorEntranceArtwork = memo(OutdoorEntranceArtworkView);

function OutdoorMarkerArtworkView({ marker, selected = false, zoom = 1, showName = true }: { marker: CampusMarker; selected?: boolean; zoom?: number; showName?: boolean }) {
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

export const OutdoorMarkerArtwork = memo(OutdoorMarkerArtworkView);

function OutdoorMarkerVisual({ marker, zoom, showLabel, selected = false, pickTarget = false, onSelect }: { marker: CampusMarker; zoom: number; showLabel: boolean; selected?: boolean; pickTarget?: boolean; onSelect?: (markerId: string) => void }) {
  return (
    <g data-testid="readonly-campus-marker" data-marker-id={marker.id} data-no-drag={onSelect ? "true" : undefined}
      role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `View ${marker.name || "campus place"} details` : undefined}
      onPointerDown={onSelect ? (event) => event.stopPropagation() : undefined}
      onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(marker.id); } : undefined}
      onKeyDown={onSelect ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(marker.id); } } : undefined}
      style={onSelect ? { cursor: "pointer" } : undefined}>
      <title>{marker.name}</title>
      {pickTarget && !selected && <circle data-testid="student-map-pick-place-target" cx={marker.x} cy={marker.y} r={20} fill="rgba(37,99,235,0.08)" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {selected && <circle className="campus-place-selection-ring" cx={marker.x} cy={marker.y} r={22} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth={2.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      <OutdoorMarkerArtwork marker={marker} selected={selected} zoom={zoom} showName={showLabel} />
    </g>
  );
}

function OutdoorCampusGateVisual({ marker, showLabel, selected = false, pickTarget = false, onSelect, screenConsistent = false, studentZoom = 1 }: { marker: CampusMarker; showLabel: boolean; selected?: boolean; pickTarget?: boolean; onSelect?: (markerId: string) => void; screenConsistent?: boolean; studentZoom?: number }) {
  const emergency = marker.purpose === "emergency_exit";
  const color = emergency ? "#dc2626" : "#2563eb";
  return (
    <g data-testid="readonly-campus-gate" data-marker-id={marker.id} data-student-gate-screen-space={screenConsistent ? "true" : undefined} data-no-drag={onSelect ? "true" : undefined}
      role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `View ${marker.name || "Campus Gate"} details` : undefined}
      onPointerDown={onSelect ? (event) => event.stopPropagation() : undefined}
      onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(marker.id); } : undefined}
      onKeyDown={onSelect ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(marker.id); } } : undefined}
      style={onSelect ? { cursor: "pointer" } : undefined}>
      <title>{marker.name || (emergency ? "Emergency Exit Gate" : "Campus Gate")}</title>
      {pickTarget && !selected && <circle data-testid="student-map-pick-gate-target" cx={marker.x} cy={marker.y} r={27} fill="rgba(37,99,235,0.08)" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {selected && <circle className="campus-place-selection-ring" cx={marker.x} cy={marker.y} r={25} fill="rgba(37,99,235,0.14)" stroke="#2563eb" strokeWidth={2.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {screenConsistent ? <g transform={`translate(${marker.x},${marker.y})`}>
        <g className="student-map-screen-marker"><g className="student-transition-marker-lod">
          <CampusGateVisual x={-18} y={-15} width={36} height={30} color={color} />
        </g></g>
      </g> : <CampusGateVisual x={marker.x - 18} y={marker.y - 15} width={36} height={30} color={color} />}
      {showLabel && marker.name && (!screenConsistent || studentZoom >= 0.5) && <text x={marker.x} y={marker.y + 18} textAnchor="middle" fill="var(--map-building-name, #475569)" fontSize={6.5} fontWeight="700" className="pointer-events-none select-none">{marker.name}</text>}
    </g>
  );
}

export interface ReadonlyOutdoorCampusSceneProps {
  campus: ReadonlyOutdoorCampus;
  /** Student route stroke is composed above map artwork and below entrance/exit markers. */
  routeOverlay?: ReactNode;
  zoom?: number;
  /** Camera zoom and CSS-pixel scale affect student marker decluttering only. */
  studentZoom?: number;
  studentPixelScale?: number;
  /** Keep physical layers independently visible; layer toggles should not hide authored paths. */
  showBuildings?: boolean;
  showLabels?: boolean;
  selectedBuildingId?: string | null;
  selectedCampusPlaceId?: string | null;
  onSelectBuilding?: (buildingId: string) => void;
  onSelectCampusPlace?: (placeId: string) => void;
  onDoubleClickBuilding?: (buildingId: string) => void;
  onClickEntrance?: (buildingId: string) => void;
  /** Whether read-only outdoor entrances render a permanent Enter Building pill. */
  showEntryPills?: boolean;
  /** Keep student-side entrance actions icon-only until hover/focus. */
  compactEntryActions?: boolean;
  routeRelevantEntranceIds?: ReadonlySet<string>;
  activeEntranceId?: string | null;
  /** Hide the ordinary arrow while the active route transition owns the doorway. */
  suppressActiveEntranceId?: string | null;
  /** Suppress every ambient action for a Building while its route Enter is active. */
  suppressActiveEntranceBuildingId?: string | null;
  reducedMotion?: boolean;
  /** Preview routable map-pick targets without exposing editor handles. */
  mapPickActive?: boolean;
  /** Student-only landmark artwork override; Admin/Preview keep generic authored artwork. */
  studentSuhayHusayLandmark?: boolean;
  emergencyMode?: boolean;
}

interface ReadonlyOutdoorArtworkLayerProps extends Pick<ReadonlyOutdoorCampusSceneProps,
  "campus" | "zoom" | "showBuildings" | "showLabels" | "selectedBuildingId" | "selectedCampusPlaceId" | "onSelectBuilding" | "onDoubleClickBuilding" | "mapPickActive" | "studentSuhayHusayLandmark"> {}

/** Heavy authored artwork is isolated from route progress and transition UI. */
export const ReadonlyOutdoorArtworkLayer = memo(function ReadonlyOutdoorArtworkLayer({
  campus,
  zoom = 1,
  showBuildings = true,
  showLabels = true,
  selectedBuildingId,
  selectedCampusPlaceId,
  mapPickActive = false,
  studentSuhayHusayLandmark = false,
  onSelectBuilding,
  onDoubleClickBuilding,
}: ReadonlyOutdoorArtworkLayerProps) {
  const stack: { zOrder: number; order: number; node: ReactNode }[] = [];
  const groundAreaAssets = sortOutdoorGroundAssets([...campus.decorAssets]);
  const suhayHusayAssetId = studentSuhayHusayLandmark ? resolveSuhayHusayDecorAssetId(campus.decorAssets) : null;
  const selectedPlace = campus.markers.find((marker) => marker.id === selectedCampusPlaceId);
  const suhayHusaySelected = Boolean(selectedPlace && /suhay\s*(?:ng\s*)?husay/i.test(`${selectedPlace.id} ${selectedPlace.name} ${selectedPlace.type}`));
  if (campus.paths.length) stack.push({ zOrder: -1000, order: 0, node: <OutdoorPathNetworkArtwork key="campus-path-network" paths={campus.paths} /> });
  if (showBuildings) {
    campus.buildings.forEach((building, index) => stack.push({ zOrder: effectiveStackKey("building", building.zOrder, index), order: index, node: <OutdoorBuildingVisual key={`building-${building.id}`} building={building} selected={selectedBuildingId === building.id} pickTarget={mapPickActive && Boolean(onSelectBuilding)} onSelect={onSelectBuilding} onDoubleClick={onDoubleClickBuilding} showName={zoom > 0.7 && building.name !== "New Building"} showFloorCount labelLayout="editor" showLabels={showLabels} bodyOpacity={0.82} /> }));
  }
  // Keep the semantic ground layer behind paths and physical objects while
  // honoring its authored order exactly as Admin Canvas does. Overlapping
  // areas such as a parking lot and plaza rely on this order for their artwork
  // to remain visible in the read-only map.
  groundAreaAssets.forEach((asset, index) => stack.push({
    zOrder: -2000 + index,
    order: index,
    node: <OutdoorDecorVisual key={`decor-${asset.id}`} asset={asset} gridSize={campus.gridSize} />,
  }));
  campus.decorAssets.forEach((asset, index) => {
    if (isDecorAreaType(asset.type)) return;
    stack.push({
      zOrder: effectiveStackKey("decorAsset", asset.zOrder, index),
      order: index,
      node: <OutdoorDecorVisual key={`decor-${asset.id}`} asset={asset} gridSize={campus.gridSize} studentSuhayHusayLandmark={asset.id === suhayHusayAssetId} selectedLandmark={asset.id === suhayHusayAssetId && suhayHusaySelected} />,
    });
  });
  stack.sort((a, b) => a.zOrder - b.zOrder || a.order - b.order);
  const appearance = campusGroundAppearance(campus);
  return <g data-testid="readonly-outdoor-authored-artwork">
    <defs><CampusGroundPatternDefs /></defs>
    <CampusGroundSurface material={appearance.material} texture={appearance.texture} color={appearance.color}
      width={campus.canvasW} height={campus.canvasH} backgroundTestId="readonly-campus-background"
      backgroundOpacity={campus.backgroundOpacity ?? 1} textureTestId="readonly-campus-ground-texture" />
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
  </g>;
});

type ReadonlyOutdoorTransitionLayerProps = Pick<ReadonlyOutdoorCampusSceneProps,
  "campus" | "showBuildings" | "showLabels" | "selectedCampusPlaceId" | "onSelectCampusPlace" | "onClickEntrance" | "showEntryPills" | "compactEntryActions" | "routeRelevantEntranceIds" | "activeEntranceId" | "suppressActiveEntranceId" | "suppressActiveEntranceBuildingId" | "reducedMotion" | "zoom" | "studentZoom" | "studentPixelScale" | "mapPickActive" | "emergencyMode">;

const ReadonlyOutdoorTransitionLayer = memo(function ReadonlyOutdoorTransitionLayer({
  campus,
  showBuildings = true,
  showLabels = true,
  selectedCampusPlaceId,
  onSelectCampusPlace,
  onClickEntrance,
  showEntryPills = true,
  compactEntryActions = false,
  routeRelevantEntranceIds,
  activeEntranceId,
  suppressActiveEntranceId,
  suppressActiveEntranceBuildingId,
  reducedMotion = false,
  zoom = 1,
  studentZoom = zoom,
  studentPixelScale = 1,
  mapPickActive = false,
  emergencyMode = false,
}: ReadonlyOutdoorTransitionLayerProps) {
  const [hoveredEntranceId, setHoveredEntranceId] = useState<string | null>(null);
  const buildingById = useMemo(() => new Map(campus.buildings.map((building) => [building.id, building])), [campus.buildings]);
  const defaultEntryLabelIds = useMemo(() => defaultOutdoorEntryLabelIds(campus, activeEntranceId, hoveredEntranceId, suppressActiveEntranceId), [activeEntranceId, campus, hoveredEntranceId, suppressActiveEntranceId]);
  const overviewDuplicates = useMemo(() => !compactEntryActions ? new Set<string>() : studentOverviewDuplicateIds(campus.entrances.map((entrance) => {
    const building = buildingById.get(entrance.buildingId);
    const point = building ? outdoorEntrancePosition(building, entrance) : { x: 0, y: 0 };
    return { id: entrance.id, x: point.x, y: point.y, direction: normalizeEntranceDirection(entrance) };
  }), activeEntranceId), [activeEntranceId, buildingById, campus.entrances, compactEntryActions]);
  const entranceEntries = campus.entrances.map((entrance) => ({ entrance }));
  const orderedEntrances = compactEntryActions
    ? [...entranceEntries].sort((left, right) =>
      Number(left.entrance.id === activeEntranceId || left.entrance.id === hoveredEntranceId)
      - Number(right.entrance.id === activeEntranceId || right.entrance.id === hoveredEntranceId))
    : entranceEntries;
  const renderEntrance = ({ entrance }: (typeof entranceEntries)[number]) => {
    const building = buildingById.get(entrance.buildingId);
    return building ? <OutdoorEntranceVisual key={`entrance-${entrance.id}`} building={building} entrance={entrance}
      onClick={onClickEntrance} showEntryLabelByDefault={defaultEntryLabelIds.has(entrance.id)} showEntryPill={showEntryPills} compactEntryAction={compactEntryActions}
      routeRelevant={routeRelevantEntranceIds?.has(entrance.id)} active={activeEntranceId === entrance.id} reducedMotion={reducedMotion}
      suppressActiveAction={suppressActiveEntranceId === entrance.id || suppressActiveEntranceBuildingId === entrance.buildingId}
      overviewDuplicate={overviewDuplicates.has(entrance.id)}
      onEmphasisChange={compactEntryActions ? setHoveredEntranceId : undefined} /> : null;
  };
  return <g data-testid="readonly-outdoor-student-overlays" data-student-marker-layer={compactEntryActions ? "outdoor" : undefined}>
    {showBuildings && campus.exteriorEmergencyStairs.map((stair) => {
      const building = buildingById.get(stair.buildingId);
      return building ? <OutdoorEmergencyStairVisual key={`stair-${stair.id}`} building={building} stair={stair} /> : null;
    })}
    {campus.markers.map((marker) => {
      const pickTarget = mapPickActive && Boolean(onSelectCampusPlace) && !(emergencyMode && isCampusGate(marker));
      return isCampusGate(marker)
        ? <OutdoorCampusGateVisual key={`marker-${marker.id}`} marker={marker} showLabel={showLabels} selected={selectedCampusPlaceId === marker.id} pickTarget={pickTarget} onSelect={onSelectCampusPlace} screenConsistent={compactEntryActions} studentZoom={studentZoom * studentPixelScale} />
        : <OutdoorMarkerVisual key={`marker-${marker.id}`} marker={marker} zoom={zoom} showLabel={showLabels} selected={selectedCampusPlaceId === marker.id} pickTarget={pickTarget} onSelect={onSelectCampusPlace} />;
    })}
    {showBuildings && orderedEntrances.map(renderEntrance)}
  </g>;
});

/** Read-only scene composition shared by Preview and the public campus map. */
export const ReadonlyOutdoorCampusScene = memo(function ReadonlyOutdoorCampusScene(props: ReadonlyOutdoorCampusSceneProps) {
  return <g data-testid="readonly-outdoor-scene">
    <ReadonlyOutdoorArtworkLayer
      campus={props.campus}
      zoom={props.zoom}
      showBuildings={props.showBuildings}
      showLabels={props.showLabels}
      selectedBuildingId={props.selectedBuildingId}
      selectedCampusPlaceId={props.selectedCampusPlaceId}
      studentSuhayHusayLandmark={props.studentSuhayHusayLandmark}
      mapPickActive={props.mapPickActive}
      onSelectBuilding={props.onSelectBuilding}
      onDoubleClickBuilding={props.onDoubleClickBuilding}
    />
    {props.routeOverlay}
    <ReadonlyOutdoorTransitionLayer
      campus={props.campus}
      showBuildings={props.showBuildings}
      showLabels={props.showLabels}
      selectedCampusPlaceId={props.selectedCampusPlaceId}
      onSelectCampusPlace={props.onSelectCampusPlace}
      onClickEntrance={props.onClickEntrance}
      showEntryPills={props.showEntryPills}
      compactEntryActions={props.compactEntryActions}
      routeRelevantEntranceIds={props.routeRelevantEntranceIds}
      activeEntranceId={props.activeEntranceId}
      suppressActiveEntranceId={props.suppressActiveEntranceId}
      suppressActiveEntranceBuildingId={props.suppressActiveEntranceBuildingId}
      reducedMotion={props.reducedMotion}
      zoom={props.zoom}
      studentZoom={props.studentZoom}
      studentPixelScale={props.studentPixelScale}
      mapPickActive={props.mapPickActive}
      emergencyMode={props.emergencyMode}
    />
  </g>;
});
