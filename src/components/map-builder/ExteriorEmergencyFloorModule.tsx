import type { ExteriorEmergencyStair, FloorStairs } from "./types";
import { exteriorEmergencyStairVisualDimensions } from "./ReadonlyOutdoorVisuals";
import { ExteriorEmergencyFloorStairSymbol } from "./FloorMapVisuals";

export interface ExteriorStairPresentationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Presentation-only copy positioned beyond the wall; saved floor coordinates
 * remain the canonical wall anchor used by Admin editing and navigation. */
export function exteriorStairVisualItem(
  item: FloorStairs,
  canvasW: number,
  canvasH: number,
  visualSize?: ExteriorEmergencyStair["visualSize"],
) {
  const edge = item.attachment?.edge ?? "right";
  const { width, height } = exteriorEmergencyStairVisualDimensions({ width: item.width, height: item.height, visualSize });
  const gap = 28;
  const offset = Math.max(0, Math.min(1, Number(item.attachment?.offset) || 0.5));
  const centerX = edge === "right" ? canvasW + gap + width / 2 : edge === "left" ? -gap - width / 2 : canvasW * offset;
  const centerY = edge === "bottom" ? canvasH + gap + height / 2 : edge === "top" ? -gap - height / 2 : canvasH * offset;
  return { ...item, x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/** Bounds for the entire module, including its attachment to the wall. */
export function exteriorStairPresentationBounds(
  item: FloorStairs,
  canvasW: number,
  canvasH: number,
  visualSize?: ExteriorEmergencyStair["visualSize"],
): ExteriorStairPresentationBounds {
  const edge = item.attachment?.edge ?? "right";
  const visual = exteriorStairVisualItem(item, canvasW, canvasH, visualSize);
  const vertical = edge === "left" || edge === "right";
  const platformWidth = Math.max(22, Math.min(34, vertical ? visual.width + 8 : visual.height + 8));
  const wall = edge === "left" ? 0 : edge === "right" ? canvasW : edge === "top" ? 0 : canvasH;
  const centerX = visual.x + visual.width / 2;
  const centerY = visual.y + visual.height / 2;
  const pad = 6;
  if (edge === "right") return { x: wall - pad, y: centerY - platformWidth / 2 - pad, width: visual.x + visual.width - wall + pad * 2, height: platformWidth + pad * 2 };
  if (edge === "left") return { x: visual.x - pad, y: centerY - platformWidth / 2 - pad, width: wall - visual.x + pad * 2, height: platformWidth + pad * 2 };
  if (edge === "bottom") return { x: centerX - platformWidth / 2 - pad, y: wall - pad, width: platformWidth + pad * 2, height: visual.y + visual.height - wall + pad * 2 };
  return { x: centerX - platformWidth / 2 - pad, y: visual.y - pad, width: platformWidth + pad * 2, height: wall - visual.y + pad * 2 };
}

/** Canonical exterior stair artwork shared by the Admin editor and readonly
 * Student/Preview renderers. Readonly mode omits the editor hit target. */
export function ExteriorEmergencyFloorModule({
  item,
  canvasW,
  canvasH,
  visualSize,
  selected,
  placementInvalid = false,
  interactive = true,
}: {
  item: FloorStairs;
  canvasW: number;
  canvasH: number;
  visualSize?: ExteriorEmergencyStair["visualSize"];
  selected: boolean;
  placementInvalid?: boolean;
  interactive?: boolean;
}) {
  const edge = item.attachment?.edge ?? "right";
  const visual = exteriorStairVisualItem(item, canvasW, canvasH, visualSize);
  const bounds = exteriorStairPresentationBounds(item, canvasW, canvasH, visualSize);
  const vertical = edge === "left" || edge === "right";
  const stroke = placementInvalid ? "#dc2626" : selected ? "var(--accent)" : "#b91c1c";
  const centerX = visual.x + visual.width / 2;
  const centerY = visual.y + visual.height / 2;
  const platformWidth = Math.max(22, Math.min(34, vertical ? visual.width + 8 : visual.height + 8));
  const wall = edge === "left" ? 0 : edge === "right" ? canvasW : edge === "top" ? 0 : canvasH;
  const doorLength = Math.max(12, Math.min(20, vertical ? visual.height * 0.34 : visual.width * 0.34));
  const wallDoorX = edge === "left" ? wall - 1 : edge === "right" ? wall - 2 : centerX - doorLength / 2;
  const wallDoorY = edge === "top" ? wall - 1 : edge === "bottom" ? wall - 2 : centerY - doorLength / 2;
  const platform = edge === "right"
    ? { x: wall, y: centerY - platformWidth / 2, width: Math.max(0, visual.x - wall), height: platformWidth }
    : edge === "left"
      ? { x: visual.x + visual.width, y: centerY - platformWidth / 2, width: Math.max(0, wall - (visual.x + visual.width)), height: platformWidth }
      : edge === "bottom"
        ? { x: centerX - platformWidth / 2, y: wall, width: platformWidth, height: Math.max(0, visual.y - wall) }
        : { x: centerX - platformWidth / 2, y: visual.y + visual.height, width: platformWidth, height: Math.max(0, wall - (visual.y + visual.height)) };
  return (
    <g data-testid="floor-exterior-emergency-module" data-edge={edge} className="pointer-events-none">
      {interactive && <rect data-testid="floor-exterior-emergency-hit-target" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="rgba(0,0,0,0)" pointerEvents="all" />}
      {(selected || placementInvalid) && <rect data-testid="exterior-stair-selection-outline" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={4} fill={placementInvalid ? "rgba(220,38,38,0.12)" : "none"} stroke={placementInvalid ? "#dc2626" : "var(--accent)"} strokeWidth={1.8} strokeDasharray="4 2" />}
      <rect data-testid="exterior-stair-platform" x={platform.x} y={platform.y} width={platform.width} height={platform.height} rx={2} fill="rgba(226,232,240,0.92)" stroke={stroke} strokeWidth={1} />
      {vertical ? <>
        <line x1={platform.x} y1={platform.y + 2} x2={platform.x + platform.width} y2={platform.y + 2} stroke="#64748b" strokeWidth={0.8} strokeDasharray="2 2" />
        <line x1={platform.x} y1={platform.y + platform.height - 2} x2={platform.x + platform.width} y2={platform.y + platform.height - 2} stroke="#64748b" strokeWidth={0.8} strokeDasharray="2 2" />
      </> : <>
        <line x1={platform.x + 2} y1={platform.y} x2={platform.x + 2} y2={platform.y + platform.height} stroke="#64748b" strokeWidth={0.8} strokeDasharray="2 2" />
        <line x1={platform.x + platform.width - 2} y1={platform.y} x2={platform.x + platform.width - 2} y2={platform.y + platform.height} stroke="#64748b" strokeWidth={0.8} strokeDasharray="2 2" />
      </>}
      <rect data-testid="exterior-stair-door-opening" x={wallDoorX} y={wallDoorY} width={vertical ? 3 : doorLength} height={vertical ? doorLength : 3} rx={0.8} fill="#f8fafc" stroke={stroke} strokeWidth={1} />
      <path data-testid="exterior-stair-door-swing" d={vertical ? `M ${edge === "left" ? wall + 2 : wall - 2} ${centerY - doorLength / 2} V ${centerY + doorLength / 2}` : `M ${centerX - doorLength / 2} ${edge === "top" ? wall + 2 : wall - 2} H ${centerX + doorLength / 2}`} fill="none" stroke={stroke} strokeWidth={0.8} strokeDasharray="2 2" />
      <ExteriorEmergencyFloorStairSymbol item={visual} selected={selected} />
      <g data-testid="exterior-emergency-exit-badge" transform={`translate(${visual.x + visual.width - 14} ${visual.y + 8})`} className="pointer-events-none">
        <rect x={-14} y={-7} width={28} height={14} rx={2.5} fill="#15803d" stroke="#f0fdf4" strokeWidth={1} />
        <text x={-6.4} y={0.8} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={4.7} fontWeight={900} letterSpacing={0.45}>EXIT</text>
        <path d="M 0 0 H 9 M 6 -3 L 9 0 L 6 3" fill="none" stroke="#fff" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
        <title>Emergency exit</title>
      </g>
      <text x={centerX} y={vertical ? visual.y + visual.height + 11 : edge === "top" ? visual.y - 8 : visual.y + visual.height + 11} textAnchor="middle" fill="rgba(71,85,105,0.7)" fontSize={5.5} fontWeight="800" letterSpacing="0.6" className="pointer-events-none select-none">STAIR EXIT</text>
    </g>
  );
}
