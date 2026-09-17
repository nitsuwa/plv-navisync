import type { ExteriorZoneType, FloorExteriorZone, BuildingEntranceEdge, FloorEntranceSteps, FloorEntranceRamp } from "../components/map-builder/types";

export type ExteriorZoneAccessAttachmentEdge = "outer" | "start" | "end";

export const EXTERIOR_ZONE_MIN_SPAN = 48;
export const EXTERIOR_ZONE_MIN_DEPTH = 32;
/** Read-only drawing margin used when existing navigation tools target a zone. */
export const EXTERIOR_ZONE_WORKSPACE_MARGIN = 280;

export function isExteriorAccessParent(zone: Pick<FloorExteriorZone, "type"> | undefined): boolean {
  return zone?.type === "veranda" || zone?.type === "entrance_landing";
}

export function exteriorZoneTypeLabel(type: ExteriorZoneType): string {
  switch (type) {
    case "veranda": return "Veranda";
    case "entrance_landing": return "Entrance Landing";
    case "covered_walkway": return "Covered Walkway";
    case "exterior_platform": return "Exterior Platform";
  }
}

export function exteriorZoneSideLabel(side: BuildingEntranceEdge): string {
  return side === "top" ? "North" : side === "right" ? "East" : side === "bottom" ? "South" : "West";
}

/** Return the rendered rectangle. Coordinates deliberately extend beyond the
 * indoor floor rectangle; the FloorEditor SVG already supports overflow. */
export function exteriorZoneGeometry(zone: Pick<FloorExteriorZone, "side" | "offset" | "width" | "depth">, canvasW: number, canvasH: number) {
  const width = Math.max(EXTERIOR_ZONE_MIN_SPAN, Number(zone.width) || EXTERIOR_ZONE_MIN_SPAN);
  const depth = Math.max(EXTERIOR_ZONE_MIN_DEPTH, Number(zone.depth) || EXTERIOR_ZONE_MIN_DEPTH);
  const offset = Math.max(0, Math.min(1, Number(zone.offset) || 0.5));
  if (zone.side === "top") return { x: offset * canvasW - width / 2, y: -depth, width, height: depth, rotation: 0 };
  if (zone.side === "bottom") return { x: offset * canvasW - width / 2, y: canvasH, width, height: depth, rotation: 0 };
  if (zone.side === "left") return { x: -depth, y: offset * canvasH - width / 2, width: depth, height: width, rotation: 0 };
  return { x: canvasW, y: offset * canvasH - width / 2, width: depth, height: width, rotation: 0 };
}

export function exteriorZoneSafeOffsetRange(zone: Pick<FloorExteriorZone, "side" | "width">, canvasW: number, canvasH: number) {
  const span = zone.side === "top" || zone.side === "bottom" ? canvasW : canvasH;
  const width = Math.max(EXTERIOR_ZONE_MIN_SPAN, Number(zone.width) || EXTERIOR_ZONE_MIN_SPAN);
  return { min: Math.min(0.49, width / (2 * Math.max(1, span))), max: Math.max(0.51, 1 - width / (2 * Math.max(1, span))) };
}

export function clampExteriorZone(zone: FloorExteriorZone, canvasW: number, canvasH: number): FloorExteriorZone {
  const range = exteriorZoneSafeOffsetRange(zone, canvasW, canvasH);
  // A wall-attached zone cannot be wider than the side it belongs to.  Cap
  // inspector-driven edits here as well as pointer resizes so a large value
  // never crosses a building corner or becomes an impossible attachment.
  const wallSpan = zone.side === "top" || zone.side === "bottom" ? Math.max(1, canvasW) : Math.max(1, canvasH);
  const width = Math.min(wallSpan, Math.max(EXTERIOR_ZONE_MIN_SPAN, Number(zone.width) || EXTERIOR_ZONE_MIN_SPAN));
  return { ...zone, offset: Math.max(range.min, Math.min(range.max, Number(zone.offset) || 0.5)), width, depth: Math.max(EXTERIOR_ZONE_MIN_DEPTH, Number(zone.depth) || EXTERIOR_ZONE_MIN_DEPTH) };
}

/** Wall-span overlap for two attached zones. Zones on different sides do not collide. */
export function exteriorZoneSpansOverlap(a: Pick<FloorExteriorZone, "side" | "offset" | "width">, b: Pick<FloorExteriorZone, "side" | "offset" | "width">, canvasW: number, canvasH: number, clearance = 4): boolean {
  if (a.side !== b.side) return false;
  const span = a.side === "top" || a.side === "bottom" ? canvasW : canvasH;
  const aHalf = Math.max(EXTERIOR_ZONE_MIN_SPAN, Number(a.width) || EXTERIOR_ZONE_MIN_SPAN) / (2 * Math.max(1, span));
  const bHalf = Math.max(EXTERIOR_ZONE_MIN_SPAN, Number(b.width) || EXTERIOR_ZONE_MIN_SPAN) / (2 * Math.max(1, span));
  const gap = clearance / Math.max(1, span);
  return Math.abs((Number(a.offset) || 0.5) - (Number(b.offset) || 0.5)) < aHalf + bHalf + gap;
}

export function exteriorZoneSideForPoint(point: { x: number; y: number }, canvasW: number, canvasH: number): BuildingEntranceEdge {
  const distances: [BuildingEntranceEdge, number][] = [["top", Math.abs(point.y)], ["right", Math.abs(canvasW - point.x)], ["bottom", Math.abs(canvasH - point.y)], ["left", Math.abs(point.x)]];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

/**
 * Resolve a wall for an in-progress Exterior Zone gesture without letting the
 * candidate oscillate when the pointer is near a corner.  The current side is
 * sticky until another side is clearly closer by the dead-zone distance.  A
 * pure helper keeps Floor Editor pointer handling deterministic and makes the
 * same rule available to future read-only placement surfaces.
 */
export function exteriorZoneSideForPointStable(
  point: { x: number; y: number },
  canvasW: number,
  canvasH: number,
  currentSide?: BuildingEntranceEdge,
  deadZone = 24,
): BuildingEntranceEdge {
  const distances: Record<BuildingEntranceEdge, number> = {
    top: Math.abs(point.y),
    right: Math.abs(canvasW - point.x),
    bottom: Math.abs(canvasH - point.y),
    left: Math.abs(point.x),
  };
  const nearest = (Object.keys(distances) as BuildingEntranceEdge[])
    .sort((a, b) => distances[a] - distances[b])[0];
  if (!currentSide || currentSide === nearest) return nearest;
  // At an exact/ambiguous corner retain the current wall.  Switching only
  // after a meaningful improvement prevents North/East (etc.) flicker.
  return distances[nearest] + Math.max(0, deadZone) < distances[currentSide]
    ? nearest
    : currentSide;
}

// Naming parallel to the Emergency Stair pointer helper keeps placement code
// discoverable for future editor surfaces without introducing another model.
export const exteriorZoneSideForPointer = exteriorZoneSideForPointStable;

export type ExteriorZoneResizeHandle = "span-start" | "span-end" | "depth";

/** Compute a wall-constrained Exterior Zone resize candidate from a pointer. */
export function resizeExteriorZoneAtPoint(
  zone: FloorExteriorZone,
  handle: ExteriorZoneResizeHandle,
  point: { x: number; y: number },
  canvasW: number,
  canvasH: number,
): FloorExteriorZone {
  const horizontal = zone.side === "top" || zone.side === "bottom";
  const span = horizontal ? Math.max(1, canvasW) : Math.max(1, canvasH);
  const minSpan = EXTERIOR_ZONE_MIN_SPAN;
  const center = Math.max(0, Math.min(1, Number(zone.offset) || 0.5)) * span;
  const currentWidth = Math.max(minSpan, Number(zone.width) || minSpan);
  let start = center - currentWidth / 2;
  let end = center + currentWidth / 2;
  let depth = Math.max(EXTERIOR_ZONE_MIN_DEPTH, Number(zone.depth) || EXTERIOR_ZONE_MIN_DEPTH);

  if (handle === "depth") {
    if (zone.side === "top") depth = Math.max(EXTERIOR_ZONE_MIN_DEPTH, zone.side === "top" ? -point.y : depth);
    else if (zone.side === "bottom") depth = Math.max(EXTERIOR_ZONE_MIN_DEPTH, point.y - canvasH);
    else if (zone.side === "left") depth = Math.max(EXTERIOR_ZONE_MIN_DEPTH, -point.x);
    else depth = Math.max(EXTERIOR_ZONE_MIN_DEPTH, point.x - canvasW);
    depth = Math.min(320, depth);
  } else {
    const coordinate = horizontal ? point.x : point.y;
    if (handle === "span-start") start = Math.min(coordinate, end - minSpan);
    else end = Math.max(coordinate, start + minSpan);
    start = Math.max(0, start);
    end = Math.min(span, end);
    // Re-apply the minimum after clamping at a corner while keeping the
    // opposite edge anchored as much as possible.
    if (end - start < minSpan) {
      if (handle === "span-start") start = Math.max(0, end - minSpan);
      else end = Math.min(span, start + minSpan);
    }
  }
  const width = Math.max(minSpan, end - start);
  return clampExteriorZone({
    ...zone,
    offset: (start + end) / 2 / span,
    width,
    depth,
  }, canvasW, canvasH);
}

/** Compute a parent-edge resize candidate for Entrance Steps/Ramp. */
export function resizeExteriorAccessFeatureAtPoint(
  parent: Pick<FloorExteriorZone, "side" | "offset" | "width" | "depth">,
  feature: FloorEntranceSteps | FloorEntranceRamp,
  handle: ExteriorZoneResizeHandle,
  point: { x: number; y: number },
  canvasW: number,
  canvasH: number,
): FloorEntranceSteps | FloorEntranceRamp {
  const zone = exteriorZoneGeometry(parent, canvasW, canvasH);
  const attachmentEdge: ExteriorZoneAccessAttachmentEdge = feature.attachmentEdge === "start" || feature.attachmentEdge === "end" ? feature.attachmentEdge : "outer";
  const actualSide: BuildingEntranceEdge = attachmentEdge === "outer"
    ? parent.side
    : parent.side === "top" || parent.side === "bottom"
      ? attachmentEdge === "start" ? "left" : "right"
      : attachmentEdge === "start" ? "top" : "bottom";
  const horizontal = actualSide === "top" || actualSide === "bottom";
  const span = Math.max(1, Number(attachmentEdge === "outer" ? (parent.side === "top" || parent.side === "bottom" ? zone.width : zone.height) : (parent.side === "top" || parent.side === "bottom" ? zone.height : zone.width)) || EXTERIOR_ZONE_MIN_SPAN);
  const currentWidth = Math.max(16, Number(feature.width) || 16);
  const center = Math.max(0, Math.min(1, Number(feature.attachmentOffset) || 0.5)) * span;
  let start = center - currentWidth / 2;
  let end = center + currentWidth / 2;
  let height = Math.max(12, Number(feature.height) || 12);
  if (handle === "depth") {
    if (actualSide === "top") height = Math.max(12, zone.y - point.y);
    else if (actualSide === "bottom") height = Math.max(12, point.y - (zone.y + zone.height));
    else if (actualSide === "left") height = Math.max(12, zone.x - point.x);
    else height = Math.max(12, point.x - (zone.x + zone.width));
    height = Math.min(180, height);
  } else {
    const coordinate = horizontal ? point.x - zone.x : point.y - zone.y;
    if (handle === "span-start") start = Math.min(coordinate, end - 16);
    else end = Math.max(coordinate, start + 16);
    start = Math.max(0, start);
    end = Math.min(span, end);
    if (end - start < 16) {
      if (handle === "span-start") start = Math.max(0, end - 16);
      else end = Math.min(span, start + 16);
    }
  }
  return {
    ...feature,
    width: Math.max(16, end - start),
    height,
    attachmentOffset: (start + end) / 2 / span,
  };
}

/** Geometry for a local entrance feature attached to a zone's outside edge.
 * Parent/attachment metadata is authoritative; x/y remains a legacy fallback. */
export function exteriorZoneAccessFeatureGeometry(
  parent: Pick<FloorExteriorZone, "side" | "offset" | "width" | "depth"> | undefined,
  feature: Pick<FloorEntranceSteps | FloorEntranceRamp, "width" | "height" | "attachmentOffset" | "attachmentEdge">,
  canvasW: number,
  canvasH: number,
) {
  if (!parent) return null;
  const zone = exteriorZoneGeometry(parent, canvasW, canvasH);
  const along = Math.max(0, Math.min(1, Number(feature.attachmentOffset) || 0.5));
  const featureWidth = Math.max(16, Number(feature.width) || 16);
  const featureDepth = Math.max(12, Number(feature.height) || 12);
  const attachmentEdge: ExteriorZoneAccessAttachmentEdge = feature.attachmentEdge === "start" || feature.attachmentEdge === "end" ? feature.attachmentEdge : "outer";
  const wallFacing: BuildingEntranceEdge = parent.side === "top" ? "bottom" : parent.side === "bottom" ? "top" : parent.side === "left" ? "right" : "left";
  const side: BuildingEntranceEdge = attachmentEdge === "outer"
    ? parent.side
    : parent.side === "top" || parent.side === "bottom"
      ? attachmentEdge === "start" ? "left" : "right"
      : attachmentEdge === "start" ? "top" : "bottom";
  if (side === wallFacing) return null;
  const span = attachmentEdge === "outer" ? (parent.side === "top" || parent.side === "bottom" ? zone.width : zone.height) : (parent.side === "top" || parent.side === "bottom" ? zone.height : zone.width);
  const clampedAlong = Math.max(0, Math.min(1, along));
  if (side === "top") return { x: zone.x + clampedAlong * span - featureWidth / 2, y: zone.y - featureDepth, width: featureWidth, height: featureDepth, rotation: 0, edge: attachmentEdge, side };
  if (side === "bottom") return { x: zone.x + clampedAlong * span - featureWidth / 2, y: zone.y + zone.height, width: featureWidth, height: featureDepth, rotation: 0, edge: attachmentEdge, side };
  if (side === "left") return { x: zone.x - featureDepth, y: zone.y + clampedAlong * span - featureWidth / 2, width: featureDepth, height: featureWidth, rotation: 0, edge: attachmentEdge, side };
  return { x: zone.x + zone.width, y: zone.y + clampedAlong * span - featureWidth / 2, width: featureDepth, height: featureWidth, rotation: 0, edge: attachmentEdge, side };
}

/** Return the nearest exposed edge of a parent zone for intentional child placement. */
export function exteriorZoneAccessFeatureEdgeForPoint(
  point: { x: number; y: number },
  parent: Pick<FloorExteriorZone, "side" | "offset" | "width" | "depth">,
  canvasW: number,
  canvasH: number,
): { edge: ExteriorZoneAccessAttachmentEdge; distance: number; blocked?: boolean } {
  const zone = exteriorZoneGeometry(parent, canvasW, canvasH);
  const wallFacing: BuildingEntranceEdge = parent.side === "top" ? "bottom" : parent.side === "bottom" ? "top" : parent.side === "left" ? "right" : "left";
  const candidates: { edge: ExteriorZoneAccessAttachmentEdge; side: BuildingEntranceEdge; distance: number }[] = [
    { edge: "outer", side: parent.side, distance: parent.side === "top" ? Math.abs(point.y - zone.y) : parent.side === "bottom" ? Math.abs(point.y - (zone.y + zone.height)) : parent.side === "left" ? Math.abs(point.x - zone.x) : Math.abs(point.x - (zone.x + zone.width)) },
    { edge: "start", side: parent.side === "top" || parent.side === "bottom" ? "left" : "top", distance: parent.side === "top" || parent.side === "bottom" ? Math.abs(point.x - zone.x) : Math.abs(point.y - zone.y) },
    { edge: "end", side: parent.side === "top" || parent.side === "bottom" ? "right" : "bottom", distance: parent.side === "top" || parent.side === "bottom" ? Math.abs(point.x - (zone.x + zone.width)) : Math.abs(point.y - (zone.y + zone.height)) },
  ];
  const exposedCandidates = candidates.filter((item) => item.side !== wallFacing);
  // Prefer an edge whose outward half-plane actually contains the pointer.
  // Pure nearest-edge distance is ambiguous at corners and can select the
  // wall-facing edge for a pointer that is visibly outside a valid side run.
  const hitTolerance = Math.max(8, Math.min(20, Math.min(zone.width, zone.height) * 0.2));
  const within = (value: number, min: number, max: number) => value >= min - hitTolerance && value <= max + hitTolerance;
  const outwardHit = (edge: ExteriorZoneAccessAttachmentEdge) => {
    if (edge === "start") {
      return parent.side === "top" || parent.side === "bottom"
        ? point.x <= zone.x + hitTolerance && within(point.y, zone.y, zone.y + zone.height)
        : point.y <= zone.y + hitTolerance && within(point.x, zone.x, zone.x + zone.width);
    }
    if (edge === "end") {
      return parent.side === "top" || parent.side === "bottom"
        ? point.x >= zone.x + zone.width - hitTolerance && within(point.y, zone.y, zone.y + zone.height)
        : point.y >= zone.y + zone.height - hitTolerance && within(point.x, zone.x, zone.x + zone.width);
    }
    if (parent.side === "top") return point.y <= zone.y + hitTolerance && within(point.x, zone.x, zone.x + zone.width);
    if (parent.side === "bottom") return point.y >= zone.y + zone.height - hitTolerance && within(point.x, zone.x, zone.x + zone.width);
    if (parent.side === "left") return point.x <= zone.x + hitTolerance && within(point.y, zone.y, zone.y + zone.height);
    return point.x >= zone.x + zone.width - hitTolerance && within(point.y, zone.y, zone.y + zone.height);
  };
  const nearestExposed = [...exposedCandidates].sort((a, b) => {
    const aOutward = outwardHit(a.edge);
    const bOutward = outwardHit(b.edge);
    if (aOutward !== bOutward) return aOutward ? -1 : 1;
    return a.distance - b.distance;
  })[0] ?? candidates[0];
  // At a zone corner the pointer is often equally close to the wall-facing
  // edge and a legitimate exposed side. Treat that short corner band as an
  // exposed-edge target so a left/right (or top/bottom) feature is not marked
  // invalid merely because the cursor is a few pixels inside the corner.
  const cornerAllowance = hitTolerance;
  const tangentWithin = nearestExposed.edge === "start" || nearestExposed.edge === "end"
    ? parent.side === "top" || parent.side === "bottom"
      ? within(point.y, zone.y, zone.y + zone.height)
      : within(point.x, zone.x, zone.x + zone.width)
    : parent.side === "top" || parent.side === "bottom"
      ? within(point.x, zone.x, zone.x + zone.width)
      : within(point.y, zone.y, zone.y + zone.height);
  const nearExposedCorner = (nearestExposed.edge === "start" || nearestExposed.edge === "end")
    && nearestExposed.distance <= cornerAllowance
    && tangentWithin;
  return { edge: nearestExposed.edge, distance: nearestExposed.distance, blocked: !outwardHit(nearestExposed.edge) && !nearExposedCorner };
}

export function exteriorZoneAccessFeatureSafeOffsetRange(
  parent: Pick<FloorExteriorZone, "side" | "width" | "depth">,
  feature: Pick<FloorEntranceSteps | FloorEntranceRamp, "width" | "attachmentEdge">,
) {
  const edge = feature.attachmentEdge === "start" || feature.attachmentEdge === "end" ? feature.attachmentEdge : "outer";
  const span = edge === "start" || edge === "end" ? parent.depth : parent.width;
  const half = Math.max(16, Number(feature.width) || 16) / (2 * Math.max(1, Number(span) || EXTERIOR_ZONE_MIN_SPAN));
  return { min: Math.min(0.49, half), max: Math.max(0.51, 1 - half) };
}

export function exteriorZoneAccessFeaturesOverlap(
  a: Pick<FloorEntranceSteps | FloorEntranceRamp, "width" | "attachmentOffset" | "attachmentEdge"> & { height?: number },
  b: Pick<FloorEntranceSteps | FloorEntranceRamp, "width" | "attachmentOffset" | "attachmentEdge"> & { height?: number },
  parent: Pick<FloorExteriorZone, "side" | "width" | "depth">,
  clearance = 4,
) {
  const edgeA = a.attachmentEdge === "start" || a.attachmentEdge === "end" ? a.attachmentEdge : "outer";
  const edgeB = b.attachmentEdge === "start" || b.attachmentEdge === "end" ? b.attachmentEdge : "outer";
  const parentSpan = Math.max(EXTERIOR_ZONE_MIN_SPAN, Number(parent.width) || EXTERIOR_ZONE_MIN_SPAN);
  const parentDepth = Math.max(EXTERIOR_ZONE_MIN_DEPTH, Number(parent.depth) || EXTERIOR_ZONE_MIN_DEPTH);
  const parentW = parent.side === "top" || parent.side === "bottom" ? parentSpan : parentDepth;
  const parentH = parent.side === "top" || parent.side === "bottom" ? parentDepth : parentSpan;

  // Compare the actual local occupied rectangles, rather than a padded
  // interaction box or a same-edge-only span.  The local parent rectangle is
  // [0,parentW] × [0,parentH]; access features extend outward from one of its
  // exposed boundaries.  This keeps separated features on one edge valid and
  // avoids false corner collisions when features use different edges.
  const featureRect = (feature: typeof a, edge: ExteriorZoneAccessAttachmentEdge) => {
    const offset = Number.isFinite(Number(feature.attachmentOffset)) ? Number(feature.attachmentOffset) : 0.5;
    const span = edge === "outer"
      ? (parent.side === "top" || parent.side === "bottom" ? parentW : parentH)
      : (parent.side === "top" || parent.side === "bottom" ? parentH : parentW);
    const along = Math.max(0, Math.min(1, offset)) * span;
    const width = Math.max(16, Number(feature.width) || 16);
    const depth = Math.max(12, Number(feature.height) || 12);

    if (parent.side === "top" || parent.side === "bottom") {
      if (edge === "outer") return {
        x: along - width / 2,
        y: parent.side === "bottom" ? parentH : -depth,
        w: width,
        h: depth,
      };
      return {
        x: edge === "start" ? -depth : parentW,
        y: along - width / 2,
        w: depth,
        h: width,
      };
    }

    if (edge === "outer") return {
      x: parent.side === "right" ? parentW : -depth,
      y: along - width / 2,
      w: depth,
      h: width,
    };
    return {
      x: along - width / 2,
      y: edge === "start" ? -depth : parentH,
      w: width,
      h: depth,
    };
  };

  const rectA = featureRect(a, edgeA);
  const rectB = featureRect(b, edgeB);
  const overlapWidth = Math.min(rectA.x + rectA.w, rectB.x + rectB.w) - Math.max(rectA.x, rectB.x);
  const overlapHeight = Math.min(rectA.y + rectA.h, rectB.y + rectB.h) - Math.max(rectA.y, rectB.y);
  return overlapWidth > Math.max(0, clearance) && overlapHeight > Math.max(0, clearance);
}

/** Return a parent-relative mirrored attachment for a local access feature.
 * Outer runs stay on the outer edge; start/end runs swap to the opposite side
 * and every edge mirrors its normalized offset around the parent centre. */
export function mirrorExteriorZoneAccessAttachment(
  feature: Pick<FloorEntranceSteps | FloorEntranceRamp, "attachmentEdge" | "attachmentOffset">,
): { attachmentEdge: ExteriorZoneAccessAttachmentEdge; attachmentOffset: number } {
  const edge: ExteriorZoneAccessAttachmentEdge = feature.attachmentEdge === "start" || feature.attachmentEdge === "end" ? feature.attachmentEdge : "outer";
  const offset = Number.isFinite(Number(feature.attachmentOffset)) ? Number(feature.attachmentOffset) : 0.5;
  return {
    attachmentEdge: edge === "start" ? "end" : edge === "end" ? "start" : "outer",
    // Keep mirrored values stable in persisted JSON and inspector labels;
    // avoiding binary floating-point tails also makes opposite-side copies
    // line up exactly with the source feature when it is reloaded.
    attachmentOffset: Math.round(Math.max(0, Math.min(1, 1 - offset)) * 1000) / 1000,
  };
}

export function exteriorZoneAccessFeatureFits(
  parent: Pick<FloorExteriorZone, "side" | "width" | "depth"> | undefined,
  feature: Pick<FloorEntranceSteps | FloorEntranceRamp, "width" | "attachmentOffset" | "attachmentEdge">,
) {
  if (!parent) return false;
  // Attachment offsets are persisted at three decimal places by the editor.
  // Accept that quantization at a parent-edge boundary so a clamped feature
  // does not become invalid merely because 0.23636 was stored as 0.236.
  const offsetTolerance = 1e-3;
  const edge = feature.attachmentEdge === "start" || feature.attachmentEdge === "end" ? feature.attachmentEdge : "outer";
  const parentWidth = Math.max(EXTERIOR_ZONE_MIN_SPAN, Number(edge === "outer" ? parent.width : parent.depth) || EXTERIOR_ZONE_MIN_SPAN);
  const featureWidth = Math.max(16, Number(feature.width) || 16);
  if (featureWidth > parentWidth + 1e-6) return false;
  const range = exteriorZoneAccessFeatureSafeOffsetRange(parent, feature);
  const offset = Number(feature.attachmentOffset);
  return Number.isFinite(offset) && offset >= range.min - offsetTolerance && offset <= range.max + offsetTolerance;
}
