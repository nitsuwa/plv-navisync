import type { FloorFurniture } from "../components/map-builder/types";
import { validateEventLayout, type EventProtectedRegion, type LayoutWarning } from "./eventLayoutValidation";

export interface EventPlacementAssessmentInput {
  proposed: readonly FloorFurniture[];
  existing: readonly FloorFurniture[];
  canvasWidth: number;
  canvasHeight: number;
  blockedRegions: readonly EventProtectedRegion[];
  blockOverlaps: boolean;
}

export interface EventPlacementAssessment {
  items: readonly FloorFurniture[];
  issues: LayoutWarning[];
  canPlace: boolean;
  blockingReason: string | null;
}

/** Assesses a preview without adjusting, copying, or persisting its geometry. */
export function assessEventPlacement(input: EventPlacementAssessmentInput): EventPlacementAssessment {
  if (input.proposed.length === 0) {
    return { items: input.proposed, issues: [], canPlace: false, blockingReason: "Nothing to place yet." };
  }

  const invalidGeometry = input.proposed.find((item) => (
    !Number.isFinite(item.x)
    || !Number.isFinite(item.y)
    || !Number.isFinite(item.width)
    || !Number.isFinite(item.height)
    || !Number.isFinite(item.rotation ?? 0)
    || item.width <= 0
    || item.height <= 0
  ));
  if (invalidGeometry) {
    return {
      items: input.proposed,
      issues: [],
      canPlace: false,
      blockingReason: `${invalidGeometry.name || "This item"} needs a valid finite position, size, and rotation before it can be placed.`,
    };
  }

  if (!Number.isFinite(input.canvasWidth) || !Number.isFinite(input.canvasHeight) || input.canvasWidth <= 0 || input.canvasHeight <= 0) {
    return {
      items: input.proposed,
      issues: [],
      canPlace: false,
      blockingReason: "The map has no valid placement area right now.",
    };
  }

  const proposedIds = new Set(input.proposed.map((item) => item.id));
  const issues = validateEventLayout({
    furniture: [...input.existing, ...input.proposed],
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    blockedRegions: input.blockedRegions,
  }).filter((issue) => issue.itemIds.some((id) => proposedIds.has(id)));
  const blockingIssue = issues.find((issue) => issue.severity === "critical" || (input.blockOverlaps && issue.code === "overlap"));
  return {
    items: input.proposed,
    issues,
    canPlace: blockingIssue === undefined,
    blockingReason: blockingIssue?.message ?? null,
  };
}
