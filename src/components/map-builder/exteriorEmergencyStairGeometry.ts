import type { ExteriorEmergencyStair, FloorStairs } from "./types";

export interface ExteriorStairPresentationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Presentation-only dimensions; these never alter authored or navigation geometry. */
export function exteriorEmergencyStairVisualDimensions(
  stair: Pick<ExteriorEmergencyStair, "width" | "height" | "visualSize">,
) {
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
  visualSize?: ExteriorEmergencyStair["visualSize"],
) {
  const visual = exteriorEmergencyStairVisualDimensions({ width, height, visualSize });
  const along = edge === "top" || edge === "bottom" ? visual.width : visual.height;
  const halfWithPadding = along / 2 + 6;
  const inset = Math.min(0.45, halfWithPadding / Math.max(1, span));
  return { min: inset, max: 1 - inset };
}

/** Copy positioned outside its authored wall anchor for presentation only. */
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

/** Bounds for the whole exterior stair module, including its wall attachment. */
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
