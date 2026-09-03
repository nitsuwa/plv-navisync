import type { BuildingEntranceEdge, BuildingEntranceType, CampusBuilding, CampusEntrance, LegacyBuildingEntranceType } from "../components/map-builder/types";

export interface Point {
  x: number;
  y: number;
}

export interface EntranceWorldPosition extends Point {
  angle: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));

export const BUILDING_ENTRANCE_TYPES: BuildingEntranceType[] = ["general", "service", "emergency_exit"];

export const BUILDING_ENTRANCE_TYPE_LABELS: Record<BuildingEntranceType, string> = {
  general: "General Access",
  service: "Service Access",
  emergency_exit: "Emergency Exit",
};

export const BUILDING_ENTRANCE_TYPE_COLORS: Record<BuildingEntranceType, string> = {
  general: "#0f766e",
  service: "#7c3aed",
  emergency_exit: "#dc2626",
};

export const BUILDING_ENTRANCE_EDGE_LABELS: Record<BuildingEntranceEdge, string> = {
  top: "North",
  right: "East",
  bottom: "South",
  left: "West",
};

export function normalizeEntranceOffset(offset: number): number {
  return clamp01(offset);
}

type EntranceTypeInput = BuildingEntranceType | LegacyBuildingEntranceType | undefined;

export function normalizeEntranceType(type: EntranceTypeInput): BuildingEntranceType {
  switch (type) {
    case "service":
      return "service";
    case "emergency":
    case "emergency_exit":
      return "emergency_exit";
    case "main":
    case "secondary":
    case "general":
    default:
      return "general";
  }
}

export function entranceTypeLabel(type: EntranceTypeInput): string {
  return BUILDING_ENTRANCE_TYPE_LABELS[normalizeEntranceType(type)];
}

export function entranceDisplayName(entrance: Pick<CampusEntrance, "name" | "type" | "isPrimary">, index = 0): string {
  const trimmed = entrance.name?.trim();
  if (trimmed) return trimmed;
  const type = normalizeEntranceType(entrance.type);
  if (entrance.isPrimary && type === "general") return "Primary Entrance";
  return type === "general" ? `Entrance ${index + 1}` : entranceTypeLabel(type);
}

export function entrancePurposeMeta(entrance: Pick<CampusEntrance, "type" | "isPrimary" | "accessible">): string {
  const type = normalizeEntranceType(entrance.type);
  const parts = [
    entrance.isPrimary && type === "general" ? "Primary" : undefined,
    entranceTypeLabel(type),
    entrance.accessible ? "Accessible" : undefined,
  ].filter(Boolean);
  return parts.join(" - ");
}

export function entranceDescription(entrance: Pick<CampusEntrance, "type" | "isPrimary" | "accessible">, buildingName: string): string {
  const type = normalizeEntranceType(entrance.type);
  const primary = entrance.isPrimary && type === "general" ? "Primary " : "";
  const accessible = entrance.accessible ? " (accessible)" : "";
  return `${primary}${entranceTypeLabel(type)} of ${buildingName}${accessible}`;
}

export function normalizeEntrance(entrance: CampusEntrance, buildingId: string): CampusEntrance {
  const type = normalizeEntranceType(entrance.type);
  return {
    ...entrance,
    buildingId,
    offset: normalizeEntranceOffset(entrance.offset),
    type,
    isPrimary: type === "general" && (entrance.isPrimary === true || entrance.type === "main"),
  };
}

export function normalizeBuildingEntrances(building: Pick<CampusBuilding, "id" | "entrances">): CampusEntrance[] {
  return (building.entrances ?? []).map((entrance) => normalizeEntrance(entrance, building.id));
}

export function primaryEligibleEntrances(entrances: Pick<CampusEntrance, "type" | "isPrimary">[]): Pick<CampusEntrance, "type" | "isPrimary">[] {
  return entrances.filter((entrance) => normalizeEntranceType(entrance.type) === "general" && entrance.isPrimary === true);
}

export function promotePrimaryEntrance(entrances: CampusEntrance[]): CampusEntrance[] {
  const hasPrimary = entrances.some((entrance) => normalizeEntranceType(entrance.type) === "general" && entrance.isPrimary === true);
  if (hasPrimary) return entrances;
  let promoted = false;
  return entrances.map((entrance) => {
    const type = normalizeEntranceType(entrance.type);
    if (!promoted && type === "general") {
      promoted = true;
      return { ...entrance, type, isPrimary: true };
    }
    return { ...entrance, type, isPrimary: false };
  });
}

function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function entranceLocalPoint(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height">,
  edge: BuildingEntranceEdge,
  offset: number,
): Point {
  const t = clamp01(offset);
  switch (edge) {
    case "top":
      return { x: building.x + building.width * t, y: building.y };
    case "right":
      return { x: building.x + building.width, y: building.y + building.height * t };
    case "bottom":
      return { x: building.x + building.width * t, y: building.y + building.height };
    case "left":
      return { x: building.x, y: building.y + building.height * t };
  }
}

export function entranceWorldPosition(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation">,
  entrance: Pick<CampusEntrance, "edge" | "offset">,
): EntranceWorldPosition {
  const local = entranceLocalPoint(building, entrance.edge, entrance.offset);
  const center = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
  const rotated = rotatePoint(local, center, building.rotation ?? 0);
  const outward: Record<BuildingEntranceEdge, number> = { top: -90, right: 0, bottom: 90, left: 180 };
  return {
    x: rotated.x,
    y: rotated.y,
    angle: ((outward[entrance.edge] + (building.rotation ?? 0)) % 360 + 360) % 360,
  };
}

export function pointerToEntranceAttachment(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation">,
  pointer: Point,
): Pick<CampusEntrance, "edge" | "offset"> {
  const center = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
  const unrotated = rotatePoint(pointer, center, -(building.rotation ?? 0));
  const leftDistance = Math.abs(unrotated.x - building.x);
  const rightDistance = Math.abs(unrotated.x - (building.x + building.width));
  const topDistance = Math.abs(unrotated.y - building.y);
  const bottomDistance = Math.abs(unrotated.y - (building.y + building.height));
  const nearest = Math.min(leftDistance, rightDistance, topDistance, bottomDistance);

  if (nearest === topDistance) {
    return { edge: "top", offset: clamp01((unrotated.x - building.x) / building.width) };
  }
  if (nearest === rightDistance) {
    return { edge: "right", offset: clamp01((unrotated.y - building.y) / building.height) };
  }
  if (nearest === bottomDistance) {
    return { edge: "bottom", offset: clamp01((unrotated.x - building.x) / building.width) };
  }
  return { edge: "left", offset: clamp01((unrotated.y - building.y) / building.height) };
}

export interface EntranceAlignmentReference extends Point {
  id?: string;
}

export interface EntranceAlignmentResult {
  attachment: Pick<CampusEntrance, "edge" | "offset">;
  point: EntranceWorldPosition;
  guides: { type: "h" | "v"; pos: number }[];
}

/**
 * Snap an Entrance's perimeter attachment to a nearby useful reference.  The
 * reference is projected onto the currently selected edge, so the Entrance
 * remains edge-attached even when the pointer is slightly outside the wall.
 * This deliberately snaps only along the edge (never by globally merging
 * coordinates) and returns the same lightweight guide format used elsewhere in
 * the editors.
 */
export function alignEntranceAttachment(
  building: Pick<CampusBuilding, "x" | "y" | "width" | "height" | "rotation">,
  pointer: Point,
  references: EntranceAlignmentReference[] = [],
  threshold = 12,
): EntranceAlignmentResult {
  const base = pointerToEntranceAttachment(building, pointer);
  const current = entranceWorldPosition(building, base);
  const centerOffset = 0.5;
  const candidates: { offset: number; distance: number; kind: "center" | "reference" }[] = [
    { offset: centerOffset, distance: Number.POSITIVE_INFINITY, kind: "center" },
  ];
  const centerPoint = entranceWorldPosition(building, { edge: base.edge, offset: centerOffset });
  const tangentLength = base.edge === "top" || base.edge === "bottom" ? building.width : building.height;
  const centerTangent = base.edge === "top" || base.edge === "bottom" ? current.x : current.y;
  const centerTarget = base.edge === "top" || base.edge === "bottom" ? centerPoint.x : centerPoint.y;
  candidates[0].distance = Math.abs(centerTangent - centerTarget);

  const center = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
  const rotation = building.rotation ?? 0;
  // Compare references in the building's local coordinate space so rotation
  // does not detach or skew the edge + offset attachment.
  for (const reference of references) {
    const local = rotatePoint(reference, center, -rotation);
    const along = base.edge === "top" || base.edge === "bottom"
      ? local.x - building.x
      : local.y - building.y;
    const offset = clamp01(along / Math.max(1, tangentLength));
    const candidate = entranceWorldPosition(building, { edge: base.edge, offset });
    // A reference only participates when the pointer is actually close to the
    // projected edge location.  Comparing the full world distance prevents a
    // far-away anchor that happens to share an x/y coordinate from pulling an
    // Entrance across the perimeter unexpectedly.
    const referenceDistance = Math.hypot(candidate.x - pointer.x, candidate.y - pointer.y);
    candidates.push({ offset, distance: referenceDistance, kind: "reference" });
  }

  const nearest = candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best, candidates[0]);
  if (!nearest || nearest.distance > threshold) {
    return { attachment: base, point: current, guides: [] };
  }
  const attachment = { edge: base.edge, offset: clamp01(nearest.offset) };
  const point = entranceWorldPosition(building, attachment);
  // For an unrotated building the edge tangent is exactly horizontal/vertical;
  // use the corresponding global guide. Rotated buildings still snap along
  // their edge but do not draw a misleading axis guide.
  const guides = rotation % 180 === 0
    ? (base.edge === "top" || base.edge === "bottom"
      ? [{ type: "v" as const, pos: point.x }]
      : [{ type: "h" as const, pos: point.y }])
    : [];
  return { attachment, point, guides };
}

export interface EntranceHitResult extends EntranceWorldPosition {
  buildingId: string;
  entranceId: string;
}

/**
 * Find the building entrance nearest to a world point within the threshold.
 * Used by the Navigation layer so Add Waypoint / Connect Path can recognize
 * entrances as special routing targets instead of dropping a generic point
 * underneath them.
 */
export function findEntranceAtPoint(
  buildings: Pick<CampusBuilding, "id" | "x" | "y" | "width" | "height" | "rotation" | "entrances">[],
  point: Point,
  threshold = 16
): EntranceHitResult | undefined {
  let best: EntranceHitResult | undefined;
  let bestD = threshold;
  for (const building of buildings) {
    for (const entrance of building.entrances ?? []) {
      const pos = entranceWorldPosition(building, entrance);
      const d = Math.hypot(point.x - pos.x, point.y - pos.y);
      if (d <= bestD) {
        best = { ...pos, buildingId: building.id, entranceId: entrance.id };
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Deterministic default placement for a NEW building entrance (B7 Phase 1).
 *
 * The first entrance keeps the historical default (bottom-center). Additional
 * entrances pick the next sensible FREE perimeter position so a second
 * entrance never spawns exactly on top of an existing one: spaced offsets on
 * the same side first, then the other sides, choosing the first candidate
 * whose world-space distance to EVERY existing entrance clears a separation
 * threshold (rotation-aware, so it stays valid after building rotation). When
 * no candidate clears the threshold (tiny buildings), the most-separated
 * candidate wins. Existing entrances are never moved, and the result is still
 * plain `edge + offset` geometry, so resize/rotation-safe attachment and
 * manual repositioning are unchanged.
 */
export function defaultEntrance(building: CampusBuilding, id: string): CampusEntrance {
  const existing = building.entrances ?? [];
  const isFirstEntrance = existing.length === 0;
  const base: CampusEntrance = {
    id,
    buildingId: building.id,
    edge: "bottom",
    offset: 0.5,
    type: "general",
    isPrimary: isFirstEntrance,
    // General entrances are accessible by default.  Existing saved values are
    // never rewritten by normalization; this only affects new authoring.
    accessible: true,
  };
  if (isFirstEntrance) return base;

  const existingPositions = existing.map((en) => entranceWorldPosition(building, en));
  const separation = Math.max(16, Math.min(building.width, building.height) * 0.25);
  // Same side (bottom — the default) first with evenly spaced offsets, then
  // the other sides. Deterministic, never random.
  const edgeOrder: BuildingEntranceEdge[] = ["bottom", "top", "right", "left"];
  const spread = Array.from({ length: 7 }, (_, i) => (2 * i + 1) / 14);
  let best: { edge: BuildingEntranceEdge; offset: number; minD: number } | null = null;
  for (const edge of edgeOrder) {
    for (const offset of spread) {
      const pos = entranceWorldPosition(building, { edge, offset });
      const minD = Math.min(...existingPositions.map((p) => Math.hypot(p.x - pos.x, p.y - pos.y)));
      if (minD >= separation) {
        return { ...base, edge, offset };
      }
      if (!best || minD > best.minD) best = { edge, offset, minD };
    }
  }
  return { ...base, edge: best!.edge, offset: best!.offset };
}

export function updateBuildingEntrance(
  building: CampusBuilding,
  entranceId: string,
  changes: Partial<CampusEntrance>,
): { building: CampusBuilding; changed: boolean } {
  let changed = false;
  const entrances = (building.entrances ?? []).map((entrance) => {
    const isTarget = entrance.id === entranceId;
    const requestedType = Object.prototype.hasOwnProperty.call(changes, "type") ? normalizeEntranceType(changes.type) : normalizeEntranceType(entrance.type);
    const requestedPrimary = Object.prototype.hasOwnProperty.call(changes, "isPrimary") ? changes.isPrimary === true : entrance.isPrimary === true;
    const nextPrimary = requestedType === "general" && requestedPrimary;
    const nextEntrance = isTarget
      ? {
          ...entrance,
          ...changes,
          buildingId: building.id,
          offset: changes.offset !== undefined ? normalizeEntranceOffset(changes.offset) : entrance.offset,
          name: Object.prototype.hasOwnProperty.call(changes, "name") ? (changes.name === "" ? undefined : changes.name) : entrance.name,
          type: requestedType,
          isPrimary: nextPrimary,
        }
      : changes.isPrimary === true && nextPrimary && normalizeEntranceType(entrance.type) === "general" && entrance.isPrimary
        ? { ...entrance, type: "general" as const, isPrimary: false }
        : normalizeEntrance(entrance, building.id);
    if (nextEntrance !== entrance && JSON.stringify(nextEntrance) !== JSON.stringify(entrance)) changed = true;
    return nextEntrance;
  });
  return changed ? { building: { ...building, entrances }, changed } : { building, changed };
}
