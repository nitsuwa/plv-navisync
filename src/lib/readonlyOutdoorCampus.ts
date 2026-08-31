import type {
  Campus,
  CampusBuilding,
  CampusDecorAsset,
  CampusEntrance,
  CampusMarker,
  CampusPath,
  ExteriorEmergencyStair,
} from "../components/map-builder/types";

/**
 * The public map only needs the authored physical campus scene.  Keeping this
 * projection separate from the editor Campus object makes the read-only
 * boundary explicit: navigation nodes/edges and editor-only state never leak
 * into a Student/Preview renderer.
 */
export interface ReadonlyOutdoorEntrance extends CampusEntrance {
  /** Legacy campuses may have one point instead of a typed entrance record. */
  legacyPosition?: { x: number; y: number };
}

export interface ReadonlyOutdoorCampus {
  id: string;
  canvasW: number;
  canvasH: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundOpacity?: number;
  backgroundFit?: Campus["backgroundFit"];
  buildings: readonly CampusBuilding[];
  paths: readonly CampusPath[];
  entrances: readonly ReadonlyOutdoorEntrance[];
  exteriorEmergencyStairs: readonly ExteriorEmergencyStair[];
  markers: readonly CampusMarker[];
  decorAssets: readonly CampusDecorAsset[];
}

/**
 * Project canonical Campus data to the physical, read-only outdoor scene.
 * Arrays intentionally retain authored objects (rather than normalising them
 * into a second schema), so geometry/style changes made by the admin flow
 * naturally reach Preview and the published Student renderer.
 */
export function projectReadonlyOutdoorCampus(campus: Campus): ReadonlyOutdoorCampus {
  const buildings = (campus.buildings ?? []).filter((building) => building.visible !== false);
  const entrances: ReadonlyOutdoorEntrance[] = [];
  const exteriorEmergencyStairs: ExteriorEmergencyStair[] = [];

  for (const building of buildings) {
    for (const entrance of building.entrances ?? []) {
      entrances.push({ ...entrance, buildingId: building.id });
    }
    // A few older saved campuses still have the original single entrance
    // point. Keep it visible without making that compatibility shape canonical.
    if (!building.entrances?.length && building.entrance) {
      entrances.push({
        id: `${building.id}-entrance`,
        buildingId: building.id,
        edge: "bottom",
        offset: 0.5,
        type: "general",
        name: building.entrance.label,
        accessible: building.accessibility?.accessibleEntrance ?? true,
        legacyPosition: { x: building.entrance.x, y: building.entrance.y },
      });
    }
    for (const stair of building.exteriorEmergencyStairs ?? []) {
      exteriorEmergencyStairs.push({ ...stair, buildingId: building.id });
    }
  }

  return {
    id: campus.id,
    canvasW: campus.canvasW || 900,
    canvasH: campus.canvasH || 680,
    backgroundColor: campus.backgroundColor,
    backgroundImage: campus.backgroundImage,
    backgroundOpacity: campus.backgroundOpacity,
    backgroundFit: campus.backgroundFit,
    buildings,
    paths: (campus.paths ?? []).filter((path) => path.visible !== false),
    entrances,
    exteriorEmergencyStairs,
    markers: campus.markers ?? [],
    decorAssets: (campus.decorAssets ?? []).filter((asset) => asset.visible !== false),
  };
}
