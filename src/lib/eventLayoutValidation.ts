import type { FloorFurniture } from "../components/map-builder/types";

export interface LayoutWarning {
  code: "outside-boundary" | "overlap" | "blocked-access" | "narrow-aisle";
  severity: "info" | "warning" | "critical";
  itemIds: string[];
  message: string;
}

interface Rect { x: number; y: number; width: number; height: number }

function rectOf(item: Rect): Rect {
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function projectionsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function validateEventLayout(input: {
  furniture: readonly FloorFurniture[];
  canvasWidth: number;
  canvasHeight: number;
  blockedRegions?: readonly (Rect & { label: string })[];
}): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const furniture = input.furniture;

  for (const item of furniture) {
    const outside = item.x < 0 || item.y < 0 || item.x + item.width > input.canvasWidth || item.y + item.height > input.canvasHeight;
    if (outside) {
      warnings.push({
        code: "outside-boundary",
        severity: "critical",
        itemIds: [item.id],
        message: `${item.name} sits outside the editable canvas boundary.`,
      });
    }
    for (const region of input.blockedRegions ?? []) {
      if (intersects(rectOf(item), region)) {
        warnings.push({
          code: "blocked-access",
          severity: "critical",
          itemIds: [item.id],
          message: `${item.name} overlaps the blocked access area: ${region.label}.`,
        });
      }
    }
  }

  for (let first = 0; first < furniture.length; first += 1) {
    const a = furniture[first];
    const aRect = rectOf(a);
    for (let second = first + 1; second < furniture.length; second += 1) {
      const b = furniture[second];
      const bRect = rectOf(b);
      const itemIds = [a.id, b.id];
      if (intersects(aRect, bRect)) {
        warnings.push({
          code: "overlap",
          severity: "warning",
          itemIds,
          message: `${a.name} overlaps ${b.name}. Consider adding clearance between them.`,
        });
        continue;
      }

      const horizontalGap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
      const verticalGap = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
      const sideBySide = horizontalGap >= 0 && horizontalGap < 12 && projectionsOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
      const stacked = verticalGap >= 0 && verticalGap < 12 && projectionsOverlap(a.x, a.x + a.width, b.x, b.x + b.width);
      if (sideBySide || stacked) {
        warnings.push({
          code: "narrow-aisle",
          severity: "info",
          itemIds,
          message: `The aisle between ${a.name} and ${b.name} is narrower than the recommended 12 units.`,
        });
      }
    }
  }

  return warnings;
}
