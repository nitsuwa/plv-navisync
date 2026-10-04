import type { Campus } from "../components/map-builder/types";

/** Stable key for a room's authored navigation membership in a campus. */
export function authoredRoomNavigationKey(buildingId: string, floorId: string, roomId: string): string {
  return `${buildingId}:${floorId}:${roomId}`;
}

/**
 * Floor Editor's Add to Navigation action creates a NavigationNode linked to
 * the physical room through roomId. This authored relationship is the Student
 * interactivity source of truth; connectivity/edges are intentionally not
 * required here because graph completeness is a separate routing concern.
 */
export function authoredNavigableRoomKeys(campus: Pick<Campus, "buildings" | "navNodes"> | null | undefined): Set<string> {
  const result = new Set<string>();
  if (!campus) return result;

  const roomIds = new Set<string>();
  for (const building of campus.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      for (const room of floor.rooms ?? []) {
        roomIds.add(authoredRoomNavigationKey(building.id, floor.id, room.id));
      }
    }
  }

  for (const node of campus.navNodes ?? []) {
    if (!node.roomId) continue;
    const owningBuilding = node.buildingId
      ? campus.buildings.find((building) => building.id === node.buildingId)
      : undefined;
    if (node.buildingId && !owningBuilding) continue;
    const candidateBuildings = owningBuilding ? [owningBuilding] : campus.buildings;
    for (const building of candidateBuildings) {
      const floor = (building.floors ?? []).find((candidate) =>
        (!node.floorId || candidate.id === node.floorId)
        && (candidate.rooms ?? []).some((room) => room.id === node.roomId),
      );
      if (!floor) continue;
      result.add(authoredRoomNavigationKey(building.id, floor.id, node.roomId));
      break;
    }
  }

  // Keep only keys that resolve to a current authored room. This prevents a
  // stale/orphaned navigation node from advertising a deleted room.
  return new Set([...result].filter((key) => roomIds.has(key)));
}
