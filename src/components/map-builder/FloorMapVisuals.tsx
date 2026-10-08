import { memo } from "react";
import { Accessibility as AccessibilityIcon } from "lucide-react";
import type { FloorDoor, FloorElevatorItem, FloorLabel, FloorPath, FloorRamp, FloorRoom, FloorStairs, FloorWall, FloorWindow } from "./types";
import { ROOM_MAP } from "./constants";
import { roomOutlinePoints, roomShapePath, roomShapeBounds, roomShapeHorizontalSpan, roomShapeLabelPoint } from "../../lib/roomShape";
import { layoutRoomLabel, roomLabelLineCenterY } from "../../lib/roomLabel";

export function wallMaterialStyle(material?: string) {
  if (material === "glass") return { coreOpacity: 0.62, casingOpacity: 0.72, dash: "6 3", casing: "#60a5fa" };
  if (material === "brick") return { coreOpacity: 1, casingOpacity: 0.86, dash: "2 2", casing: "#991b1b" };
  if (material === "wood") return { coreOpacity: 0.98, casingOpacity: 0.78, dash: "9 2 1.5 2", casing: "#92400e" };
  if (material === "drywall") return { coreOpacity: 0.92, casingOpacity: 0.58, dash: "12 4", casing: "#64748b" };
  return { coreOpacity: 1, casingOpacity: 0.85, dash: undefined, casing: "#2f3a46" };
}

function WallOpeningSymbolView({
  kind,
  width,
  wallThickness,
  color,
  background,
  direction = "left",
  doorType = "single",
  hinge,
  swingSide = "a",
  selected = false,
  locked = false,
  testIdPrefix = "",
}: {
  kind: "door" | "open_passage" | "window";
  width: number;
  wallThickness: number;
  color: string;
  background: string;
  direction?: string;
  doorType?: "single" | "double";
  hinge?: "left" | "right";
  swingSide?: "a" | "b";
  selected?: boolean;
  locked?: boolean;
  /** Preserve viewer-facing test hooks without forking the physical SVG. */
  testIdPrefix?: string;
}) {
  const testId = (name: string) => `${testIdPrefix}${name}`;
  const half = width / 2;
  // Clear the wall core and its small casing (the casing is wallThickness + 2
  // below). The generous interaction target remains transparent, so this
  // narrow aperture never paints a floor-sized rectangle over exterior zones.
  const gapStroke = kind !== "window"
    ? Math.max(1, wallThickness + 2)
    : Math.max(wallThickness + 7, 12);
  const jamb = Math.max(wallThickness / 2 + 2, 4);
  const hitId = kind === "door"
    ? "attached-door-opening"
    : kind === "open_passage" ? "attached-open-passage-opening" : "attached-window-opening";
  if (kind === "open_passage") {
    return (
      <>
        <line data-testid={testId("open-passage-wall-cut")} x1={-half} y1={0} x2={half} y2={0}
          stroke={background} strokeWidth={gapStroke} strokeLinecap="butt" />
        <line x1={-half} y1={-jamb} x2={-half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <line x1={half} y1={-jamb} x2={half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <line x1={-half + 2} y1={-jamb - 1} x2={half - 2} y2={-jamb - 1} stroke={color} strokeWidth={1.2} strokeLinecap="round" opacity={0.72} />
        <line data-testid={hitId} x1={-half} y1={0} x2={half} y2={0} stroke="transparent" strokeWidth={28} strokeLinecap="butt" />
        {selected && <rect data-testid={testId("opening-selection-outline")} x={-half - 3} y={-jamb - 3} width={width + 6} height={jamb * 2 + 6} rx={1.5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
        {locked && (
          <path d="M-2 -3 V-4.5 C-2 -6 -1 -7 0 -7 C1 -7 2 -6 2 -4.5 V-3 M-3 -3 H3 V2 H-3 Z" fill="#0f172a" stroke="white" strokeWidth={0.6} />
        )}
      </>
    );
  }
  if (kind === "door") {
    const sliding = direction === "sliding";
    const double = doorType === "double" || direction === "double";
    const singleLeaf = width;
    const doubleLeaf = width / 2;
    const leaf = double ? doubleLeaf : singleLeaf;
    const hingeValue = hinge ?? (direction === "right" ? "right" : "left");
    const sideSign = swingSide === "b" ? 1 : -1;
    const hingeX = hingeValue === "right" ? half : -half;
    const closedX = hingeValue === "right" ? -half : half;
    const arcSweep = hingeValue === "right"
      ? (swingSide === "b" ? 1 : 0)
      : (swingSide === "b" ? 0 : 1);
    return (
      <>
        <line data-testid={testId("door-wall-cut")} x1={-half} y1={0} x2={half} y2={0}
          stroke={background} strokeWidth={gapStroke} strokeLinecap="butt" />
        <line x1={-half} y1={-jamb} x2={-half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <line x1={half} y1={-jamb} x2={half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <line x1={-half} y1={0} x2={half} y2={0} data-testid={hitId} stroke="transparent" strokeWidth={28} strokeLinecap="butt" />
        {sliding ? (
          <>
            <line data-testid={testId("door-leaf")} x1={-half} y1={-5.5} x2={half} y2={-5.5} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={-half * 0.55} y1={4.5} x2={half} y2={4.5} stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.65} />
          </>
        ) : double ? (
          (() => {
            const leftOpenX = -half;
            const rightOpenX = half;
            const openY = sideSign * doubleLeaf;
            return (
          <>
            <circle data-testid={testId("door-hinge")} cx={-half} cy={0} r={2.3} fill={color} />
            <circle data-testid={testId("door-hinge")} cx={half} cy={0} r={2.3} fill={color} />
            <line data-testid={testId("door-leaf")} x1={-half} y1={0} x2={leftOpenX} y2={openY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <line data-testid={testId("door-leaf")} x1={half} y1={0} x2={rightOpenX} y2={openY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <path data-testid={testId("door-swing-arc")} d={`M 0 0 A ${doubleLeaf} ${doubleLeaf} 0 0 ${swingSide === "b" ? 0 : 1} ${leftOpenX} ${openY}`}
              fill="none" stroke={color} strokeWidth={1.5} opacity={0.82} />
            <path data-testid={testId("door-swing-arc")} d={`M 0 0 A ${doubleLeaf} ${doubleLeaf} 0 0 ${swingSide === "b" ? 1 : 0} ${rightOpenX} ${openY}`}
              fill="none" stroke={color} strokeWidth={1.5} opacity={0.82} />
          </>
            );
          })()
        ) : (
          <>
            <circle data-testid={testId("door-hinge")} cx={hingeX} cy={0} r={2.4} fill={color} />
            <line data-testid={testId("door-leaf")} x1={hingeX} y1={0} x2={hingeX} y2={sideSign * leaf} stroke={color} strokeWidth={2.7} strokeLinecap="round" />
            <path data-testid={testId("door-swing-arc")} d={`M ${closedX} 0 A ${leaf} ${leaf} 0 0 ${arcSweep} ${hingeX} ${sideSign * leaf}`}
              fill="none" stroke={color} strokeWidth={1.6} opacity={0.84} />
          </>
        )}
        {selected && <rect data-testid={testId("opening-selection-outline")} x={-half - 3} y={(sideSign < 0 ? -leaf - 4 : -6)} width={width + 6} height={leaf + 10} rx={1.5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
        {locked && (
          <path d="M-2 -3 V-4.5 C-2 -6 -1 -7 0 -7 C1 -7 2 -6 2 -4.5 V-3 M-3 -3 H3 V2 H-3 Z" fill="#0f172a" stroke="white" strokeWidth={0.6} />
        )}
      </>
    );
  }
  const rail = Math.max(wallThickness / 2 + 2, 4.5);
  return (
    <>
      <line data-testid={testId("window-wall-cut")} x1={-half} y1={0} x2={half} y2={0}
        stroke={background} strokeWidth={gapStroke} strokeLinecap="butt" />
      <rect x={-half} y={-rail} width={width} height={rail * 2} fill="rgba(125, 211, 252, 0.16)" stroke="none" />
      <line x1={-half} y1={-jamb} x2={-half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <line x1={half} y1={-jamb} x2={half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <line data-testid={hitId} x1={-half} y1={0} x2={half} y2={0} stroke="transparent" strokeWidth={28} strokeLinecap="butt" />
      <line data-testid={testId("window-glazing")} x1={-half} y1={-rail} x2={half} y2={-rail} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <line x1={-half} y1={rail} x2={half} y2={rail} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <line x1={0} y1={-rail - 2} x2={0} y2={rail + 2} stroke={color} strokeWidth={1.4} opacity={0.8} />
      <line x1={-half + 3} y1={0} x2={half - 3} y2={0} stroke="#e0f2fe" strokeWidth={1.1} opacity={0.9} />
      {selected && <rect data-testid={testId("opening-selection-outline")} x={-half - 3} y={-rail - 3} width={width + 6} height={rail * 2 + 6} rx={1.5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
      {locked && (
        <path d="M-2 -3 V-4.5 C-2 -6 -1 -7 0 -7 C1 -7 2 -6 2 -4.5 V-3 M-3 -3 H3 V2 H-3 Z" fill="#0f172a" stroke="white" strokeWidth={0.6} />
      )}
    </>
  );
}

type StairVisualDirection = "up" | "down" | "both" | "none";

/**
 * Resolve the direction cue shown inside a Stair from the current, ordered
 * building floors.  The persisted Stair direction still controls routing on
 * middle floors; the boundary floors are clamped visually because they cannot
 * lead beyond the building. A one-floor building keeps a neutral cue for the
 * default Both direction; legacy explicit one-way values remain legible.
 */
function stairVisualDirection(
  direction: FloorStairs["direction"],
  floorIndex?: number,
  floorCount?: number,
): StairVisualDirection {
  if (floorIndex == null || floorCount == null || floorIndex < 0) return "none";
  // A single-floor building has no cross-floor implication, so keep the symbol
  // neutral regardless of any persisted direction value.
  if (floorCount <= 1) return "none";
  if (floorIndex === 0) return "up";
  if (floorIndex === floorCount - 1) return "down";
  return direction === "up" ? "up" : direction === "down" ? "down" : "both";
}

function stairArrowPath(direction: "up" | "down", size: number) {
  const y1 = direction === "up" ? size * 0.72 : -size * 0.72;
  const y2 = direction === "up" ? -size * 0.52 : size * 0.52;
  return `M 0 ${y1} L 0 ${y2}`;
}

function stairArrowHeadPath(direction: "up" | "down", size: number) {
  const tipY = direction === "up" ? -size * 0.86 : size * 0.86;
  const baseY = direction === "up" ? -size * 0.5 : size * 0.5;
  const halfWidth = size * 0.4;
  return `M 0 ${tipY} L ${-halfWidth} ${baseY} L ${halfWidth} ${baseY} Z`;
}

export const WallOpeningSymbol = memo(WallOpeningSymbolView);

function StairsSymbolView({
  item,
  selected,
  floorIndex,
  floorCount,
}: {
  item: FloorStairs;
  selected: boolean;
  floorIndex?: number;
  floorCount?: number;
}) {
  const stroke = selected ? "var(--accent)" : "#475569";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const inset = Math.max(2, Math.min(item.width, item.height) * 0.08);
  const wellX = item.x + inset;
  const wellY = item.y + inset;
  const wellWidth = Math.max(4, item.width - inset * 2);
  const wellHeight = Math.max(4, item.height - inset * 2);
  // A conventional half-landing/U-shaped plan symbol. All geometry is in the
  // Stair's local frame; the existing parent rotate() carries it with the object.
  const landingHeight = Math.max(4, Math.min(12, wellHeight * 0.2));
  const flightGap = Math.max(2.5, Math.min(8, wellWidth * 0.1));
  const flightWidth = Math.max(4, (wellWidth - flightGap) / 2);
  const leftFlightX = wellX;
  const rightFlightX = wellX + flightWidth + flightGap;
  // Entry-side orientation is a horizontal mirror only.  The landing remains
  // at the same end of the local stairwell so Entry Right never reverses the
  // semantic Up/Down travel cue.
  const landingAtTop = true;
  const flightY = landingAtTop ? wellY + landingHeight : wellY;
  const flightHeight = Math.max(4, wellHeight - landingHeight);
  const landingY = landingAtTop ? wellY : wellY + wellHeight - landingHeight;
  const treadCount = Math.max(3, Math.min(10, Math.floor(flightHeight / 5)));
  const dir = stairVisualDirection(item.direction, floorIndex, floorCount);
  const entryFlightX = item.flip ? rightFlightX : leftFlightX;
  const continuationFlightX = item.flip ? leftFlightX : rightFlightX;
  const visualUp = "up" as const;
  const visualDown = "down" as const;
  // Keep the cue readable on the small default Stair while leaving the tread
  // pattern legible.  The shaft nearly spans the flight and terminates just
  // inside each landing/entry edge.
  const arrowLimit = Math.max(3.2, flightHeight / 2 - 1.1);
  const arrowSize = Math.min(9, Math.max(4, flightHeight * 0.28), arrowLimit);
  const arrowStrokeWidth = Math.max(1.05, Math.min(1.65, Math.min(flightWidth, flightHeight) * 0.1));
  const arrowY = flightY + flightHeight * 0.5;
  // A subtle continuous travel line follows the complete U-turn: it starts at
  // the floor-facing entry, crosses the landing, and returns along the second
  // flight.  The line is intentionally separate from the directional
  // arrowheads so the symbol reads as one stair path without changing the
  // semantic Up/Down state or the canonical navigation anchor.
  const travelEntryInset = Math.min(2.2, Math.max(0.8, flightHeight * 0.1));
  const travelEntryY = landingAtTop ? flightY + flightHeight - travelEntryInset : flightY + travelEntryInset;
  const travelTurnY = landingY + landingHeight / 2;
  const entryFlightCenterX = entryFlightX + flightWidth / 2;
  const continuationFlightCenterX = continuationFlightX + flightWidth / 2;
  const travelPathUpD = [
    `M ${entryFlightCenterX - cx} ${travelEntryY - cy}`,
    `L ${entryFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${continuationFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${continuationFlightCenterX - cx} ${travelEntryY - cy}`,
  ].join(" ");
  const travelPathDownD = [
    `M ${continuationFlightCenterX - cx} ${travelEntryY - cy}`,
    `L ${continuationFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${entryFlightCenterX - cx} ${travelTurnY - cy}`,
    `L ${entryFlightCenterX - cx} ${travelEntryY - cy}`,
  ].join(" ");
  const travelPathD = dir === "down" ? travelPathDownD : travelPathUpD;
  const renderArrow = (flightX: number, arrowDirection: "up" | "down") => (
    <g
      data-testid="stairs-arrow-flight"
      transform={`translate(${flightX + flightWidth / 2 - cx} ${arrowY - cy})`}
    >
      {/* A restrained light underlay keeps the cue legible over treads without
          making the arrow look like a heavy icon. */}
      <path
        d={stairArrowPath(arrowDirection, arrowSize)}
        fill="none"
        stroke="#f8fafc"
        strokeWidth={arrowStrokeWidth + 1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.86}
        className="pointer-events-none"
      />
      <path
        data-testid="stairs-arrow-path"
        d={stairArrowPath(arrowDirection, arrowSize)}
        fill="none"
        stroke="#0f172a"
        strokeWidth={arrowStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none"
      />
      <path
        data-testid="stairs-arrow-head"
        d={stairArrowHeadPath(arrowDirection, arrowSize)}
        fill="#0f172a"
        stroke="#0f172a"
        strokeWidth={0.3}
        strokeLinejoin="round"
        className="pointer-events-none"
      />
    </g>
  );
  return (
    <>
      <rect data-testid="stairs-footprint" x={item.x} y={item.y} width={item.width} height={item.height} rx={0}
        fill={selected ? "rgba(30,64,175,0.14)" : "#e8eef7"} stroke={stroke} strokeWidth={selected ? 1.8 : 1.15} />
      <rect data-testid="stairs-well" x={wellX} y={wellY} width={wellWidth} height={wellHeight} rx={0}
        fill={selected ? "rgba(255,255,255,0.72)" : "#f8fafc"} stroke="#94a3b8" strokeWidth={0.8} />
      <rect data-testid="stairs-landing" x={wellX + 0.8} y={landingY + 0.8} width={wellWidth - 1.6} height={Math.max(2, landingHeight - 1.6)}
        rx={0} fill={selected ? "#dbeafe" : "#e2e8f0"} />
      {[leftFlightX, rightFlightX].map((flightX) => (
        <g key={flightX} data-testid="stairs-flight">
          {/* Keep both stringers on the inner edges of the two flights.  Entry
              side mirrors the composition, but must not swap these rails to
              the outer edges and create a visually heavier Left variant. */}
          <line data-testid="stairs-rail" x1={flightX === leftFlightX ? flightX + flightWidth - 1 : flightX + 1} y1={flightY} x2={flightX === leftFlightX ? flightX + flightWidth - 1 : flightX + 1} y2={flightY + flightHeight} stroke="#64748b" strokeWidth={0.8} opacity={0.8} />
          {Array.from({ length: treadCount }, (_, i) => {
            const ty = flightY + (flightHeight / (treadCount + 1)) * (i + 1);
            return <line key={i} data-testid="stairs-tread" x1={flightX + 2} y1={ty} x2={flightX + flightWidth - 2} y2={ty} stroke="#64748b" strokeWidth={0.85} />;
          })}
        </g>
      ))}
      {/* The central opening/stringer gap makes the U-turn legible without a grate-like fill. */}
      <rect x={wellX + flightWidth} y={flightY} width={flightGap} height={flightHeight} fill={selected ? "rgba(226,232,240,0.65)" : "#eef2f7"} stroke="#cbd5e1" strokeWidth={0.55} />
      <line data-testid="stairs-center-line" x1={wellX + flightWidth + flightGap / 2} y1={flightY + 1} x2={wellX + flightWidth + flightGap / 2} y2={flightY + flightHeight - 1} stroke="#94a3b8" strokeWidth={0.65} strokeDasharray="2 2" />
      <g data-testid="stairs-arrow" transform={`translate(${cx} ${cy})`}>
        {dir !== "none" && (
          <>
            <path
              d={travelPathD}
              fill="none"
              stroke="#f8fafc"
              strokeWidth={arrowStrokeWidth + 2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
              className="pointer-events-none"
            />
            <path
              data-testid="stairs-travel-path"
              d={travelPathD}
              fill="none"
              stroke="#0f172a"
              strokeWidth={Math.max(0.9, arrowStrokeWidth * 0.72)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.72}
              className="pointer-events-none"
            />
          </>
        )}
        {dir === "up" && renderArrow(entryFlightX, visualUp)}
        {dir === "down" && renderArrow(continuationFlightX, visualDown)}
        {dir === "both" && <>{renderArrow(entryFlightX, visualUp)}{renderArrow(continuationFlightX, visualDown)}</>}
        {dir === "none" && (
          <path d="M -3.5 0 L 3.5 0" fill="none" stroke="#64748b" strokeWidth={1.15} strokeLinecap="round" />
        )}
      </g>
    </>
  );
}

export const StairsSymbol = memo(StairsSymbolView);

function RampSymbolView({ item, selected = false }: { item: FloorRamp; selected?: boolean }) {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  // B5 Phase 2.6: accessibility-sign style — a deep-blue footprint with a LARGE
  // centered white wheelchair icon as the dominant visual, a clean border, and
  // only a tiny secondary direction cue tucked into the corner. Everything is
  // local-frame geometry, so rotation/resize keep the symbol centered.
  const dir = item.direction === "down" ? "down" : item.direction === "up" ? "up" : "both";
  const iconSize = Math.max(10, Math.min(item.width, item.height) * 0.68);
  const showCue = item.height >= 12 && item.width >= 12;
  return (
    <>
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={2}
        fill={selected ? "#1e40af" : "#2563eb"} stroke={selected ? "var(--accent)" : "#1e40af"}
        strokeWidth={selected ? 1.8 : 1.2} data-testid="ramp-blue-base" />
      {/* Large centered white accessibility icon — the ramp's primary visual. */}
      <g data-testid="ramp-accessibility-icon" transform={`translate(${cx} ${cy})`} className="pointer-events-none">
        <AccessibilityIcon size={iconSize} strokeWidth={1.6} color="#ffffff" x={-iconSize / 2} y={-iconSize / 2} />
      </g>
      {/* Tiny corner direction cue (up / down / both) — never competes with the
          dominant accessibility symbol. */}
      {showCue && (
        <g data-testid="ramp-direction-cue" transform={`translate(${item.x + item.width - 4} ${item.y + item.height - 4})`} opacity={0.95} className="pointer-events-none">
          {dir === "up" && (
            <path d="M 0 2.5 L 0 -2.5 M 0 -2.5 L -1.6 0 M 0 -2.5 L 1.6 0" fill="none" stroke="#dbeafe" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {dir === "down" && (
            <path d="M 0 -2.5 L 0 2.5 M 0 2.5 L -1.6 0 M 0 2.5 L 1.6 0" fill="none" stroke="#dbeafe" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {dir === "both" && (
            <path d="M 0 2.5 L 0 -2.5 M 0 -2.5 L -1.6 0 M 0 -2.5 L 1.6 0 M 0 2.5 L -1.6 0 M 0 2.5 L 1.6 0" fill="none" stroke="#dbeafe" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </g>
      )}
    </>
  );
}

export const RampSymbol = memo(RampSymbolView);

function ElevatorSymbolView({ item, selected = false }: { item: FloorElevatorItem; selected?: boolean }) {
  const stroke = selected ? "var(--accent)" : "#15803d";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  // B5 Phase 2.3: recognizable top-down elevator — outer shaft frame, inner cab
  // rectangle, centered door opening, and SYMMETRIC up/down chevrons centered in
  // the cab. Everything is local-frame (rotates/resizes with the object); the
  // old chevron path was asymmetric and drifted off-center after resize.
  const cabW = Math.max(4, item.width - 8);
  const cabH = Math.max(4, item.height - 8);
  const doorW = Math.min(Math.max(4, item.doorWidth), cabW - 2);
  return (
    <>
      {/* Outer shaft / frame */}
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={0}
        fill={selected ? "rgba(22,163,74,0.14)" : "#f0fdf4"} stroke={stroke} strokeWidth={selected ? 1.8 : 1.1} data-testid="elevator-shaft" />
      {/* Inner cab */}
      <rect x={cx - cabW / 2} y={cy - cabH / 2} width={cabW} height={cabH} rx={0}
        fill="none" stroke="#86efac" strokeWidth={0.9} data-testid="elevator-cab" />
      {/* Centered door opening */}
      <rect x={cx - doorW / 2} y={item.y + item.height - 3.2} width={doorW} height={2.4} rx={0.5} fill="#22c55e" data-testid="elevator-door" />
      {/* B5 Phase 2.4: stacked vertical up/down chevrons (▲ over ▼) centered
          symmetrically inside the cab — scaled to the cab and rotation-safe. */}
      <g data-testid="elevator-chevrons" transform={`translate(${cx} ${cy})`}>
        <path d={`M ${-cabW * 0.2} ${-cabH * 0.12} L 0 ${-cabH * 0.3} L ${cabW * 0.2} ${-cabH * 0.12} M ${-cabW * 0.2} ${cabH * 0.12} L 0 ${cabH * 0.3} L ${cabW * 0.2} ${cabH * 0.12}`}
          fill="none" stroke="#14532d" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

export const ElevatorSymbol = memo(ElevatorSymbolView);

/** The authored Floor wall appearance shared by editor and published viewer. */
function FloorWallArtworkView({ wall, suppressPerimeter = false }: { wall: FloorWall; suppressPerimeter?: boolean }) {
  const material = wallMaterialStyle(wall.material);
  const hidden = suppressPerimeter && wall.managedKind === "perimeter";
  return (
    <>
      <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
        stroke={hidden ? "none" : material.casing} strokeWidth={wall.thickness + 2}
        strokeLinecap="butt" strokeLinejoin="round" opacity={material.casingOpacity} strokeDasharray={material.dash} />
      <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
        stroke={hidden ? "none" : wall.color} strokeWidth={wall.thickness}
        strokeLinecap="butt" strokeLinejoin="round" opacity={material.coreOpacity} />
    </>
  );
}

export const FloorWallArtwork = memo(FloorWallArtworkView);

/** Physical room fill shared by the editor and read-only published map. */
function FloorRoomArtworkView({
  room,
  selected = false,
  overlap = false,
  fillOpacity,
  strokeColor,
  strokeWidth,
}: {
  room: FloorRoom;
  selected?: boolean;
  overlap?: boolean;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
}) {
  const palette = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
  const fill = room.color ?? palette.fill;
  const stroke = strokeColor ?? (overlap ? "#dc2626" : selected ? "var(--accent)" : room.color ?? palette.stroke);
  const custom = Array.isArray(room.shapePoints) && room.shapePoints.length >= 3;
  const points = custom ? roomOutlinePoints(room) : null;
  const path = points ? roomShapePath(points) : "";
  return (
    <>
      {points ? (
        <path data-testid="room-custom-shape" d={path} fill={fill} fillOpacity={fillOpacity ?? (selected ? 0.72 : 0.58)}
          stroke={stroke} strokeWidth={strokeWidth ?? (overlap ? 2.5 : selected ? 2 : 1)} strokeDasharray={overlap ? "4 2" : undefined} />
      ) : (
        <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
          fill={fill} fillOpacity={fillOpacity ?? (selected ? 0.72 : 0.58)}
          stroke={stroke} strokeWidth={strokeWidth ?? (overlap ? 2.5 : selected ? 2 : 1)} strokeDasharray={overlap ? "4 2" : undefined} />
      )}
      {points
        ? <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="rgba(0,0,0,0.06)" strokeWidth={1.5} />
        : <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1} stroke="rgba(0,0,0,0.06)" strokeWidth={1.5} />}
    </>
  );
}

export const FloorRoomArtwork = memo(FloorRoomArtworkView);

/** Room name plaque from the shared authored geometry and wrapping rules. */
function FloorRoomLabelArtworkView({ room, emphasized = false, studentSelected = false, opacity = 0.78 }: { room: FloorRoom; emphasized?: boolean; studentSelected?: boolean; opacity?: number }) {
  const palette = ROOM_MAP[room.type] ?? ROOM_MAP.classroom;
  const points = roomOutlinePoints(room);
  const custom = Array.isArray(room.shapePoints) && room.shapePoints.length >= 3;
  const bounds = roomShapeBounds(points);
  const center = custom ? roomShapeLabelPoint(points) : { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const fontSize = Math.min(12.5, Math.max(7.2, Math.min(bounds.w, bounds.h * 2.4) / 29));
  const shapeSpan = roomShapeHorizontalSpan(points, center.y);
  const labelSpan = shapeSpan >= Math.max(1, bounds.w * 0.1) ? shapeSpan : bounds.w;
  const layout = layoutRoomLabel({
    text: room.name,
    maxWidth: Math.max(1, Math.min(labelSpan * 0.86, labelSpan - 8)),
    fontSize,
    minFontSize: Math.max(6, fontSize * 0.82),
    paddingX: 5,
    paddingY: 3.5,
  });
  const labelY = center.y - layout.height / 2;
  return (
    <g data-testid="room-label-overlay" data-room-id={room.id} data-room-label-selected={studentSelected ? "true" : undefined} className="pointer-events-none select-none"
      style={{ opacity, transition: "opacity 150ms ease, fill-opacity 150ms ease" }}>
      <rect x={center.x - layout.width / 2} y={labelY} width={layout.width} height={layout.height} rx={studentSelected ? 4 : 3}
        fill={studentSelected ? "#0f2748" : "#ffffff"} fillOpacity={emphasized ? 0.97 : 0.88}
        stroke={studentSelected ? "#059669" : palette.stroke}
        strokeOpacity={studentSelected ? 0.92 : emphasized ? 0.72 : 0.42} strokeWidth={studentSelected ? 1 : 0.8} />
      <text x={center.x} y={labelY + layout.height / 2} textAnchor="middle" dominantBaseline="middle"
        fill={studentSelected ? "#ffffff" : palette.text} fontSize={layout.fontSize} fontWeight={studentSelected ? "700" : "600"} fontFamily="var(--font-sans)">
        {layout.lines.map((line, index) => <tspan key={`${room.id}-label-line-${index}`} x={center.x}
          y={roomLabelLineCenterY(labelY + layout.height / 2, index, layout.lines.length, layout.lineHeight)}>{line}</tspan>)}
      </text>
    </g>
  );
}

export const FloorRoomLabelArtwork = memo(FloorRoomLabelArtworkView);

/** Authored Floor label text; editor hit/selection controls remain external. */
function FloorLabelArtworkView({ label }: { label: FloorLabel }) {
  const anchor = label.align === "center" ? "middle" : label.align === "right" ? "end" : "start";
  return <text data-testid="floor-label-artwork" x={label.x} y={label.y} textAnchor={anchor}
    fill={label.color || "#475569"} fontSize={label.fontSize || 8} fontWeight="600"
    className="pointer-events-none select-none">{label.text}</text>;
}

export const FloorLabelArtwork = memo(FloorLabelArtworkView);

/** Authored decorative path beneath the navigation graph, shared in both modes. */
function FloorPathArtworkView({ path }: { path: FloorPath }) {
  if (!path.points || path.points.length < 2) return null;
  const points = path.points.map((point) => `${point.x},${point.y}`).join(" ");
  return <polyline points={points} fill="none" stroke={path.color} strokeWidth={path.width}
    strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />;
}

export const FloorPathArtwork = memo(FloorPathArtworkView);


function ExteriorEmergencyFloorStairSymbolView({ item, selected }: { item: FloorStairs; selected: boolean }) {
  const edge = item.attachment?.edge ?? "right";
  const stroke = selected ? "var(--accent)" : "#b91c1c";
  const fill = selected ? "rgba(239,246,255,0.94)" : "rgba(255,247,237,0.96)";
  const x = item.x;
  const y = item.y;
  const w = item.width;
  const h = item.height;
  const landing = Math.max(5, Math.min(10, Math.min(w, h) * 0.22));
  const vertical = edge === "left" || edge === "right";
  return (
    <g data-testid="exterior-emergency-stair-floor-symbol" className="pointer-events-none">
      <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={3} fill="rgba(148,163,184,0.18)" stroke="rgba(71,85,105,0.35)" strokeDasharray="3 2" strokeWidth={0.9} />
      <rect x={x} y={y} width={w} height={h} rx={0} fill={fill} stroke={stroke} strokeWidth={selected ? 1.8 : 1.2} />
      {vertical ? (
        <>
          <rect x={edge === "left" ? x + w - landing : x} y={y + 1} width={landing} height={h - 2} rx={1} fill="#e2e8f0" stroke={stroke} strokeWidth={0.8} />
          <line x1={x + 3} y1={y + 3} x2={x + 3} y2={y + h - 3} stroke={stroke} strokeWidth={1} opacity={0.72} />
          <line x1={x + w - 3} y1={y + 3} x2={x + w - 3} y2={y + h - 3} stroke={stroke} strokeWidth={1} opacity={0.72} />
          {Array.from({ length: Math.max(4, Math.min(8, Math.round(h / 7))) }, (_, index) => {
            const ty = y + 4 + index * ((h - 8) / (Math.max(4, Math.min(8, Math.round(h / 7))) - 1));
            return <line key={index} x1={x + 4} y1={ty} x2={x + w - 4} y2={ty} stroke={stroke} strokeWidth={0.9} opacity={0.78} />;
          })}
          <line x1={edge === "left" ? x + w + 2 : x - 2} y1={y + h / 2} x2={edge === "left" ? x + w + 7 : x - 7} y2={y + h / 2} stroke={stroke} strokeWidth={1.5} strokeDasharray="2 2" />
        </>
      ) : (
        <>
          <rect x={x + 1} y={edge === "top" ? y + h - landing : y} width={w - 2} height={landing} rx={1} fill="#e2e8f0" stroke={stroke} strokeWidth={0.8} />
          <line x1={x + 3} y1={y + 3} x2={x + w - 3} y2={y + 3} stroke={stroke} strokeWidth={1} opacity={0.72} />
          <line x1={x + 3} y1={y + h - 3} x2={x + w - 3} y2={y + h - 3} stroke={stroke} strokeWidth={1} opacity={0.72} />
          {Array.from({ length: Math.max(4, Math.min(8, Math.round(w / 7))) }, (_, index) => {
            const tx = x + 4 + index * ((w - 8) / (Math.max(4, Math.min(8, Math.round(w / 7))) - 1));
            return <line key={index} x1={tx} y1={y + 4} x2={tx} y2={y + h - 4} stroke={stroke} strokeWidth={0.9} opacity={0.78} />;
          })}
          <line x1={x + w / 2} y1={edge === "top" ? y + h + 2 : y - 2} x2={x + w / 2} y2={edge === "top" ? y + h + 7 : y - 7} stroke={stroke} strokeWidth={1.5} strokeDasharray="2 2" />
        </>
      )}
      <title>Exterior Emergency Stair landing</title>
    </g>
  );
}

export const ExteriorEmergencyFloorStairSymbol = memo(ExteriorEmergencyFloorStairSymbolView);

type ExteriorStairPresentationBounds = { x: number; y: number; width: number; height: number };

/** Build a presentation-only visual item outside the floor boundary.  The
 * generated FloorStairs record remains at its canonical wall anchor for
 * navigation and persistence; only this copy is displaced for rendering. */
