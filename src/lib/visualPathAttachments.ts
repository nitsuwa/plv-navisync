import type { CampusPath, CampusPathAttachment } from "../components/map-builder/types";

export type VisualPathPoint = { x: number; y: number };

export type VisualPathAttachmentTarget = {
  pathId: string;
  point: VisualPathPoint;
  pointIndex?: number;
  segmentIndex?: number;
  t?: number;
};

const visualPointKey = (point: VisualPathPoint) => `${Number(point.x.toFixed(3))}:${Number(point.y.toFixed(3))}`;

/** Convert the existing path hit-test result into persisted visual metadata. */
export function visualPathAttachmentFromTarget(
  pointIndex: number,
  target: VisualPathAttachmentTarget,
): CampusPathAttachment {
  return {
    pointIndex,
    targetPathId: target.pathId,
    ...(target.pointIndex !== undefined ? { targetPointIndex: target.pointIndex } : {}),
    ...(target.segmentIndex !== undefined ? { targetSegmentIndex: target.segmentIndex, targetT: Math.max(0, Math.min(1, target.t ?? 0)) } : {}),
  };
}

function pointForAttachment(pathsById: Map<string, CampusPath>, attachment: CampusPathAttachment): VisualPathPoint | null {
  const target = pathsById.get(attachment.targetPathId);
  if (!target) return null;

  if (attachment.targetPointIndex !== undefined) {
    const point = target.points[attachment.targetPointIndex];
    return point ? { x: point.x, y: point.y } : null;
  }

  const segmentIndex = attachment.targetSegmentIndex;
  if (segmentIndex === undefined || segmentIndex < 0 || segmentIndex >= target.points.length - 1) return null;
  const a = target.points[segmentIndex];
  const b = target.points[segmentIndex + 1];
  if (!a || !b) return null;
  const t = Math.max(0, Math.min(1, attachment.targetT ?? 0));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/** Find the visual attachment owned by one path point, if any. */
export function visualPathAttachmentForPoint(
  paths: CampusPath[],
  pathId: string,
  pointIndex: number,
): CampusPathAttachment | null {
  return paths.find((path) => path.id === pathId)?.visualAttachments?.find((attachment) => attachment.pointIndex === pointIndex) ?? null;
}

/**
 * Re-resolve visual attachments after a path edit. Invalid target references
 * are removed, while the source point keeps its last valid coordinate so a
 * deleted target cannot corrupt the remaining path.
 */
export function syncVisualPathAttachments(paths: CampusPath[]): CampusPath[] {
  const pathsById = new Map(paths.map((path) => [path.id, path]));
  return paths.map((path) => {
    if (!path.visualAttachments?.length) return path;
    const points = path.points.map((point) => ({ x: point.x, y: point.y }));
    const retained: CampusPathAttachment[] = [];
    let changed = false;

    for (const attachment of path.visualAttachments) {
      if (attachment.pointIndex < 0 || attachment.pointIndex >= points.length) {
        changed = true;
        continue;
      }
      const targetPoint = pointForAttachment(pathsById, attachment);
      if (!targetPoint) {
        changed = true;
        continue;
      }
      retained.push(attachment);
      const current = points[attachment.pointIndex];
      if (current.x !== targetPoint.x || current.y !== targetPoint.y) {
        points[attachment.pointIndex] = targetPoint;
        changed = true;
      }
    }

    if (!changed) return path;
    if (retained.length === 0) {
      const { visualAttachments: _visualAttachments, ...withoutAttachments } = path;
      return withoutAttachments;
    }
    return { ...path, points, visualAttachments: retained };
  });
}

/** Attach one source endpoint to a point or segment on another visual path. */
export function attachVisualPathEndpoint(
  paths: CampusPath[],
  sourcePathId: string,
  pointIndex: number,
  target: VisualPathAttachmentTarget,
): CampusPath[] {
  if (sourcePathId === target.pathId) return paths;
  const source = paths.find((path) => path.id === sourcePathId);
  if (!source || !source.points[pointIndex]) return paths;
  const attachment = visualPathAttachmentFromTarget(pointIndex, target);
  const next = paths.map((path) => path.id === sourcePathId
    ? {
        ...path,
        points: path.points.map((point, index) => index === pointIndex ? { ...target.point } : point),
        disconnectedJunctionKeys: (path.disconnectedJunctionKeys ?? []).filter((key) => key !== visualPointKey(target.point)),
        visualAttachments: [
          ...(path.visualAttachments ?? []).filter((item) => item.pointIndex !== pointIndex),
          attachment,
        ],
      }
    : path);
  return syncVisualPathAttachments(next);
}

/** Detach one source endpoint without moving the target path. */
export function detachVisualPathEndpoint(
  paths: CampusPath[],
  sourcePathId: string,
  pointIndex: number,
): CampusPath[] {
  return paths.map((path) => {
    if (path.id !== sourcePathId || !path.visualAttachments?.some((item) => item.pointIndex === pointIndex)) return path;
    const remaining = path.visualAttachments.filter((item) => item.pointIndex !== pointIndex);
    if (remaining.length === 0) {
      const { visualAttachments: _visualAttachments, ...withoutAttachments } = path;
      const point = path.points[pointIndex];
      return point
        ? {
            ...withoutAttachments,
            disconnectedJunctionKeys: Array.from(new Set([...(path.disconnectedJunctionKeys ?? []), visualPointKey(point)])),
          }
        : withoutAttachments;
    }
    return { ...path, visualAttachments: remaining };
  });
}
