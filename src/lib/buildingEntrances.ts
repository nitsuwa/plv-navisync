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
  general: "General Entrance",
  service: "Service Entrance",
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

export function defaultEntrance(building: CampusBuilding, id: string): CampusEntrance {
  const isFirstEntrance = (building.entrances ?? []).length === 0;
  return {
    id,
    buildingId: building.id,
    edge: "bottom",
    offset: 0.5,
    type: "general",
    isPrimary: isFirstEntrance,
    accessible: false,
  };
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
