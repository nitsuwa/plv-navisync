import type { CampusEntrance, FloorDoor, FloorPlan, FloorWall, FloorWindow } from "../components/map-builder/types";

/**
 * Explicit physical dependencies on the managed perimeter wall set.
 *
 * This intentionally follows persisted ownership metadata (`wallId`) only.
 * Objects that merely touch a perimeter segment geometrically are not
 * considered dependants and therefore do not block a safe wall-set removal.
 */
export interface ManagedPerimeterDependencies {
  doors: FloorDoor[];
  windows: FloorWindow[];
  total: number;
}

export function formatManagedPerimeterDependencies(dependencies: ManagedPerimeterDependencies): string {
  const lines = ["These structural walls cannot be removed while authored objects are attached.", "", "Attached objects:"];
  if (dependencies.doors.length > 0) {
    lines.push(`• ${dependencies.doors.length} Door${dependencies.doors.length === 1 ? "" : "s"}`);
  }
  if (dependencies.windows.length > 0) {
    lines.push(`• ${dependencies.windows.length} Window${dependencies.windows.length === 1 ? "" : "s"}`);
  }
  lines.push("", "Remove or reassign these objects first, then try again.");
  return lines.join("\n");
}

export function getManagedPerimeterDependencies(
  floor: Pick<FloorPlan, "walls" | "doors" | "windows">,
  entrances: Pick<CampusEntrance, "id">[] = [],
): ManagedPerimeterDependencies {
  const perimeterIds = new Set(
    floor.walls
      .filter((wall: FloorWall) => wall.managedKind === "perimeter")
      .map((wall) => wall.id),
  );
  const entranceIds = new Set(entrances.map((entrance) => entrance.id));
  const doors = floor.doors.filter((door) =>
    (!!door.wallId && perimeterIds.has(door.wallId))
    // Generated entrance Doors are physical dependants even on legacy records
    // where the wallId was not persisted; the explicit Entrance relationship
    // is sufficient to conservatively block wall removal.
    || (!!door.buildingEntranceId && entranceIds.has(door.buildingEntranceId)),
  );
  const windows = floor.windows.filter((window) => !!window.wallId && perimeterIds.has(window.wallId));
  return { doors, windows, total: doors.length + windows.length };
}
