import type { CampusBuilding, FloorPlan } from "../components/map-builder/types";
import { normalizeBuildingEntrances } from "./buildingEntrances";
import { canonicalExteriorEmergencyStairsForBuilding } from "./exteriorEmergencyStairs";
import {
  assertFloorPhysicalReferences,
  createFloorDuplicateIdMaps,
  duplicateFloorForBuilding,
  normalizeFloor,
  type FloorDuplicateIdMaps,
  type FloorDuplicateRelationshipMaps,
} from "./floorPlanNormalization";
import { collectIdentityIds } from "./physicalFloorIntegrity";

export interface DuplicateBuildingOptions {
  id: string;
  name: string;
  code: string;
  x: number;
  y: number;
  idFactory?: (prefix: string) => string;
  reservedIds?: Iterable<string>;
}

const defaultIdFactory = () => crypto.randomUUID();

function requireMapped(map: Map<string, string>, id: string | undefined, context: string): string | undefined {
  if (!id) return undefined;
  const mapped = map.get(id);
  if (!mapped) throw new Error(`${context} refers to missing source identity "${id}".`);
  return mapped;
}

/**
 * Create a complete, physically independent Building copy. All identities are
 * allocated before Floor objects are cloned, then every physical relationship
 * is remapped before the result is returned to the caller for commit.
 * Navigation graphs are deliberately not copied; Room graph anchors are
 * cleared while their physical Room↔Door relationships remain intact.
 */
export function duplicateBuildingForCampus(source: CampusBuilding, options: DuplicateBuildingOptions): CampusBuilding {
  const sourceSnapshot = structuredClone(source);
  const rawIdFactory = options.idFactory ?? defaultIdFactory;
  const usedIds = new Set<string>([
    ...collectIdentityIds(sourceSnapshot),
    ...(options.reservedIds ?? []),
    options.id,
  ]);
  const makeId = (prefix: string) => {
    let id = rawIdFactory(prefix);
    if (usedIds.has(id)) id = defaultIdFactory();
    while (usedIds.has(id)) id = defaultIdFactory();
    usedIds.add(id);
    return id;
  };
  const newFloorIdBySource = new Map<string, string>();
  const entrances = normalizeBuildingEntrances(sourceSnapshot);
  const sourceExteriorStairs = canonicalExteriorEmergencyStairsForBuilding(sourceSnapshot);
  if (new Set(entrances.map((entrance) => entrance.id)).size !== entrances.length) {
    throw new Error("Source Building contains duplicate Entrance identity values.");
  }
  const entranceIds = new Map(entrances.map((entrance) => [entrance.id, makeId("entrance")]));
  const sourceFloors = (sourceSnapshot.floors ?? []).map((rawFloor) => {
    const floor = normalizeFloor(rawFloor, { buildingId: sourceSnapshot.id });
    // Exterior Emergency Stair occurrences are system-owned. Only retain one
    // when its canonical Building owner explicitly serves this Floor; stale
    // generated records must never become ordinary copied Stairs.
    const stairs = floor.stairs.filter((stair) => {
      if (!stair.exteriorEmergencyStairId) return true;
      const owner = sourceExteriorStairs.find((candidate) => candidate.id === stair.exteriorEmergencyStairId);
      return Boolean(owner?.servedFloorIds?.includes(floor.id));
    });
    return stairs.length === floor.stairs.length ? floor : { ...floor, stairs };
  });
  const seenFloorIds = new Set<string>();
  for (const floor of sourceFloors) {
    if (seenFloorIds.has(floor.id)) throw new Error(`Source Building contains duplicate Floor identity "${floor.id}".`);
    seenFloorIds.add(floor.id);
    const objectIds = [
      ...floor.rooms.map((item) => item.id), ...floor.paths.map((item) => item.id),
      ...floor.walls.map((item) => item.id), ...floor.doors.map((item) => item.id),
      ...floor.windows.map((item) => item.id), ...floor.furniture.map((item) => item.id),
      ...floor.stairs.map((item) => item.id), ...floor.ramps.map((item) => item.id),
      ...floor.elevators.map((item) => item.id), ...floor.labels.map((item) => item.id),
      ...(floor.exteriorZones ?? []).map((item) => item.id),
      ...(floor.entranceSteps ?? []).map((item) => item.id), ...(floor.entranceRamps ?? []).map((item) => item.id),
    ];
    if (new Set(objectIds).size !== objectIds.length) throw new Error(`Source Floor "${floor.label}" contains duplicate physical object IDs.`);
  }
  const floorMaps = new Map<string, FloorDuplicateIdMaps>();
  const relationshipMaps: FloorDuplicateRelationshipMaps = {
    sharedIds: new Map(),
    entranceIds,
    exteriorEmergencyStairs: new Map(),
    furnitureGroups: new Map(),
  };

  // Pass 1: reserve every Floor and physical-object identity before references
  // are restored. IDs on managed perimeter Walls are already canonical here.
  sourceFloors.forEach((floor) => {
    newFloorIdBySource.set(floor.id, makeId("floor"));
    floorMaps.set(floor.id, createFloorDuplicateIdMaps(floor, () => makeId("physical"), {
      includeExteriorEmergencyStairOccurrences: true,
    }));
  });
  if ((sourceSnapshot.exteriorEmergencyStairs ?? []).length !== sourceExteriorStairs.length) {
    throw new Error("Source Building contains duplicate Exterior Emergency Stair identity values.");
  }
  sourceExteriorStairs.forEach((stair) => {
    relationshipMaps.exteriorEmergencyStairs.set(stair.id, makeId("exterior-stair"));
    if (stair.sharedId && !relationshipMaps.sharedIds.has(stair.sharedId)) {
      relationshipMaps.sharedIds.set(stair.sharedId, makeId("stair-shaft"));
    }
  });
  (sourceSnapshot.circulationGroups ?? []).forEach((group) => {
    if (!relationshipMaps.sharedIds.has(group.id)) relationshipMaps.sharedIds.set(group.id, makeId("circulation-group"));
  });
  sourceFloors.forEach((floor) => {
    floor.furniture.forEach((item) => {
      if (item.groupId && !relationshipMaps.furnitureGroups.has(item.groupId)) {
        relationshipMaps.furnitureGroups.set(item.groupId, makeId("furniture-group"));
      }
    });
    [...floor.stairs, ...floor.ramps, ...floor.elevators].forEach((item) => {
      if (item.sharedId && !relationshipMaps.sharedIds.has(item.sharedId)) {
        relationshipMaps.sharedIds.set(item.sharedId, makeId("vertical-shaft"));
      }
    });
  });

  // Preflight source relationships so malformed source data cannot silently
  // lose an anchored Wall, opening, or room/access relationship in the copy.
  for (const floor of sourceFloors) {
    assertFloorPhysicalReferences(floor);
    const roomIds = new Set(floor.rooms.map((room) => room.id));
    const wallIds = new Set(floor.walls.map((wall) => wall.id));
    const doorIds = new Set(floor.doors.map((door) => door.id));
    const zoneIds = new Set((floor.exteriorZones ?? []).map((zone) => zone.id));
    for (const room of floor.rooms) {
      for (const doorId of new Set([...(room.accessDoorId ? [room.accessDoorId] : []), ...(room.accessDoorIds ?? [])])) {
        if (!doorIds.has(doorId)) throw new Error(`Room "${room.name}" links to missing same-Floor Door "${doorId}".`);
      }
    }
    for (const wall of floor.walls) {
      if (wall.startAnchor?.targetType === "room" && !roomIds.has(wall.startAnchor.roomId)) throw new Error(`Wall "${wall.id}" start anchor refers to missing Room "${wall.startAnchor.roomId}".`);
      if (wall.endAnchor?.targetType === "room" && !roomIds.has(wall.endAnchor.roomId)) throw new Error(`Wall "${wall.id}" end anchor refers to missing Room "${wall.endAnchor.roomId}".`);
    }
    for (const door of floor.doors) {
      if (door.wallId && !wallIds.has(door.wallId)) throw new Error(`Door "${door.id}" refers to missing Wall "${door.wallId}".`);
    }
    for (const window of floor.windows) {
      if (window.wallId && !wallIds.has(window.wallId)) throw new Error(`Window "${window.id}" refers to missing Wall "${window.wallId}".`);
    }
    // Entrance attachments are optional. Legacy Floors sometimes retain an
    // Entrance UUID after that Building Entrance was deleted; the cloner
    // clears only that stale attachment while preserving the Zone geometry.
    for (const item of [...(floor.entranceSteps ?? []), ...(floor.entranceRamps ?? [])]) {
      if (item.parentZoneId && !zoneIds.has(item.parentZoneId)) throw new Error(`Entrance feature "${item.id}" refers to missing Exterior Zone "${item.parentZoneId}".`);
    }
    for (const item of floor.furniture) if (item.exteriorZoneId && !zoneIds.has(item.exteriorZoneId)) {
      throw new Error(`Furniture "${item.id}" refers to missing Exterior Zone "${item.exteriorZoneId}".`);
    }
    // A Floor Stair may outlive its optional Building-owned Exterior Stair
    // record in legacy data. The cloner clears only that stale owner reference
    // and retains the copied physical Stair itself.
  }

  // Pass 2: clone geometry and restore only references into the duplicate.
  const floors = sourceFloors.map((floor) => duplicateFloorForBuilding(
    floor,
    {
      id: newFloorIdBySource.get(floor.id)!,
      buildingId: options.id,
      number: floor.number,
      label: floor.label,
    },
    floorMaps.get(floor.id)!,
    relationshipMaps,
    () => makeId("physical"),
    { includeExteriorEmergencyStairOccurrences: true },
  ));

  const copiedExteriorStairs = sourceExteriorStairs.map((stair) => {
    const servedFloorIds = (stair.servedFloorIds ?? [])
      .map((floorId) => newFloorIdBySource.get(floorId))
      .filter((floorId): floorId is string => Boolean(floorId));
    const occurrenceIds: Record<string, string> = {};
    for (const [sourceFloorId, sourceStairId] of Object.entries(stair.occurrenceIds ?? {})) {
      if (!stair.servedFloorIds.includes(sourceFloorId)) continue;
      const targetFloorId = newFloorIdBySource.get(sourceFloorId);
      if (!targetFloorId) continue;
      const targetStairId = floorMaps.get(sourceFloorId)?.stairs.get(sourceStairId);
      if (!targetStairId) continue;
      occurrenceIds[targetFloorId] = targetStairId;
    }
    return {
      ...structuredClone(stair),
      id: relationshipMaps.exteriorEmergencyStairs.get(stair.id)!,
      buildingId: options.id,
      sharedId: relationshipMaps.sharedIds.get(stair.sharedId) ?? makeId("stair-shaft"),
      servedFloorIds,
      occurrenceIds: stair.occurrenceIds ? occurrenceIds : undefined,
      // The Building duplicate is physical-only; source graph identifiers and
      // cached transition snapshots must not be shared with the original.
      occurrenceNodeIds: undefined,
      outdoorNodeId: undefined,
      floorConnectionSnapshots: undefined,
    };
  });

  const copied: CampusBuilding = {
    ...structuredClone(sourceSnapshot),
    id: options.id,
    name: options.name,
    code: options.code,
    x: options.x,
    y: options.y,
    floors,
    entrances: entrances.map((entrance) => ({
      ...structuredClone(entrance),
      id: entranceIds.get(entrance.id)!,
      buildingId: options.id,
    })),
    entranceNodeId: undefined,
    circulationGroups: (sourceSnapshot.circulationGroups ?? []).map((group) => ({
      ...structuredClone(group),
      id: relationshipMaps.sharedIds.get(group.id)!,
      buildingId: options.id,
    })),
    exteriorEmergencyStairs: copiedExteriorStairs,
  };

  // Pass 3: verify the completed physical graph before it can be committed.
  validateBuildingDuplicate(copied, sourceSnapshot);
  const expectedPhysical = { ...sourceSnapshot, entrances, floors: sourceFloors };
  const actualSnapshot = buildingPhysicalSnapshot(copied);
  const expectedSnapshot = buildingPhysicalSnapshot(expectedPhysical);
  if (JSON.stringify(actualSnapshot) !== JSON.stringify(expectedSnapshot)) {
    throw new Error("The Building copy did not preserve all source Floor geometry and visual settings.");
  }
  return copied;
}

export function validateBuildingDuplicate(copy: CampusBuilding, source: CampusBuilding): void {
  const sourceBuildingId = source.id;
  if (copy.id === sourceBuildingId) throw new Error("The duplicate Building must receive a fresh Building ID.");
  if (copy.floors.length !== source.floors.length) throw new Error("The Building copy is missing one or more source Floors.");
  if (copy.entranceNodeId) throw new Error("The duplicate retained the source Building navigation anchor.");
  const entranceIds = new Set((copy.entrances ?? []).map((entrance) => entrance.id));
  const exteriorStairIds = new Set((copy.exteriorEmergencyStairs ?? []).map((stair) => stair.id));
  const floorIds = new Set(copy.floors.map((floor) => floor.id));
  for (const floor of copy.floors) {
    if (floor.buildingId !== copy.id) throw new Error(`Floor "${floor.label}" has the wrong Building ID.`);
    assertFloorPhysicalReferences(floor);
    const roomIds = new Set(floor.rooms.map((room) => room.id));
    const wallIds = new Set(floor.walls.map((wall) => wall.id));
    const doorIds = new Set(floor.doors.map((door) => door.id));
    const zoneIds = new Set((floor.exteriorZones ?? []).map((zone) => zone.id));
    for (const room of floor.rooms) {
      if (room.buildingId !== copy.id || room.floorId !== floor.id) throw new Error(`Room "${room.name}" has the wrong Building/Floor identity.`);
      if (room.accessNodeId || room.navConnection) throw new Error(`Room "${room.name}" retained a source navigation link.`);
      for (const doorId of new Set([...(room.accessDoorId ? [room.accessDoorId] : []), ...(room.accessDoorIds ?? [])])) {
        if (!doorIds.has(doorId)) throw new Error(`Room "${room.name}" links outside its copied Floor to Door "${doorId}".`);
      }
    }
    for (const wall of floor.walls) for (const anchor of [wall.startAnchor, wall.endAnchor]) {
      if (anchor?.targetType === "room" && !roomIds.has(anchor.roomId)) throw new Error(`Wall "${wall.id}" has a Room anchor outside its copied Floor.`);
    }
    for (const door of floor.doors) {
      if (door.wallId && !wallIds.has(door.wallId)) throw new Error(`Door "${door.id}" points outside its copied Floor.`);
      if (door.buildingEntranceId && !entranceIds.has(door.buildingEntranceId)) throw new Error(`Door "${door.id}" points to a source or missing Building Entrance.`);
    }
    for (const window of floor.windows) if (window.wallId && !wallIds.has(window.wallId)) throw new Error(`Window "${window.id}" points outside its copied Floor.`);
    for (const zone of floor.exteriorZones ?? []) {
      if (zone.linkedEntranceId && !entranceIds.has(zone.linkedEntranceId)) throw new Error(`Exterior Zone "${zone.id}" points to a source or missing Building Entrance.`);
      if ((zone.linkedEntranceIds ?? []).some((id) => !entranceIds.has(id))) throw new Error(`Exterior Zone "${zone.id}" points to a source or missing Building Entrance.`);
    }
    for (const feature of [...(floor.entranceSteps ?? []), ...(floor.entranceRamps ?? [])]) {
      if (feature.parentZoneId && !zoneIds.has(feature.parentZoneId)) throw new Error(`Entrance feature "${feature.id}" points outside its copied Floor.`);
      if (feature.linkedEntranceId && !entranceIds.has(feature.linkedEntranceId)) throw new Error(`Entrance feature "${feature.id}" points to a source or missing Building Entrance.`);
    }
    for (const item of floor.furniture) if (item.exteriorZoneId && !zoneIds.has(item.exteriorZoneId)) {
      throw new Error(`Furniture "${item.id}" points outside its copied Floor.`);
    }
    for (const stair of floor.stairs) if (stair.exteriorEmergencyStairId && !exteriorStairIds.has(stair.exteriorEmergencyStairId)) {
      throw new Error(`Floor Stair "${stair.id}" points to a source or missing Exterior Emergency Stair.`);
    }
  }
  for (const entrance of copy.entrances ?? []) if (entrance.buildingId !== copy.id) throw new Error(`Building Entrance "${entrance.id}" has the wrong Building ID.`);
  for (const stair of copy.exteriorEmergencyStairs ?? []) {
    if (stair.buildingId !== copy.id) throw new Error(`Exterior Emergency Stair "${stair.id}" has the wrong Building ID.`);
    if (stair.servedFloorIds.some((floorId) => !floorIds.has(floorId))) throw new Error(`Exterior Emergency Stair "${stair.id}" serves a source or missing Floor.`);
    if (stair.occurrenceNodeIds || stair.outdoorNodeId || stair.floorConnectionSnapshots) throw new Error(`Exterior Emergency Stair "${stair.id}" retained source navigation data.`);
    for (const [floorId, stairId] of Object.entries(stair.occurrenceIds ?? {})) {
      if (!copy.floors.find((floor) => floor.id === floorId)?.stairs.some((item) => item.id === stairId && item.exteriorEmergencyStairId === stair.id)) {
        throw new Error(`Exterior Emergency Stair "${stair.id}" has an invalid copied occurrence.`);
      }
    }
  }

  // IDs must be independent even if malformed source data reused a physical ID.
  const originalIds = new Set<string>([
    sourceBuildingId,
    ...(source.entrances ?? []).map((item) => item.id),
    ...(source.circulationGroups ?? []).map((item) => item.id),
    ...canonicalExteriorEmergencyStairsForBuilding(source).map((item) => item.id),
    ...(source.floors ?? []).flatMap((floor) => [
      floor.id,
      ...floor.rooms.map((item) => item.id), ...floor.walls.map((item) => item.id),
      ...floor.doors.map((item) => item.id), ...floor.windows.map((item) => item.id),
      ...floor.furniture.map((item) => item.id), ...floor.stairs.map((item) => item.id),
      ...floor.ramps.map((item) => item.id), ...floor.elevators.map((item) => item.id),
      ...floor.paths.map((item) => item.id), ...floor.labels.map((item) => item.id),
      ...(floor.exteriorZones ?? []).map((item) => item.id),
      ...(floor.entranceSteps ?? []).map((item) => item.id), ...(floor.entranceRamps ?? []).map((item) => item.id),
      ...(floor.extensions ?? []).map((item) => item.id),
    ]),
  ]);
  const originalSharedIds = new Set<string>([
    ...(source.circulationGroups ?? []).map((item) => item.id),
    ...(source.floors ?? []).flatMap((floor) => [
      ...floor.stairs.map((item) => item.sharedId), ...floor.ramps.map((item) => item.sharedId),
      ...floor.elevators.map((item) => item.sharedId),
    ].filter((item): item is string => !!item)),
    ...canonicalExteriorEmergencyStairsForBuilding(source).map((item) => item.sharedId),
  ]);
  for (const group of copy.circulationGroups ?? []) {
    if (group.buildingId !== copy.id) throw new Error(`Circulation group "${group.id}" has the wrong Building ID.`);
    if (originalSharedIds.has(group.id)) throw new Error(`Copied Building retained source circulation identity "${group.id}".`);
  }
  const originalFurnitureGroupIds = new Set<string>((source.floors ?? []).flatMap((floor) => floor.furniture.map((item) => item.groupId).filter((id): id is string => !!id)));
  const copiedIdentities = [
    copy.id,
    ...(copy.entrances ?? []).map((item) => item.id),
    ...(copy.circulationGroups ?? []).map((item) => item.id),
    ...(copy.exteriorEmergencyStairs ?? []).map((item) => item.id),
    ...copy.floors.flatMap((floor) => [
      floor.id,
      ...floor.rooms.map((item) => item.id), ...floor.paths.map((item) => item.id),
      ...floor.walls.map((item) => item.id), ...floor.doors.map((item) => item.id),
      ...floor.windows.map((item) => item.id), ...floor.furniture.map((item) => item.id),
      ...floor.stairs.map((item) => item.id), ...floor.ramps.map((item) => item.id),
      ...floor.elevators.map((item) => item.id), ...floor.labels.map((item) => item.id),
      ...(floor.exteriorZones ?? []).map((item) => item.id),
      ...(floor.entranceSteps ?? []).map((item) => item.id), ...(floor.entranceRamps ?? []).map((item) => item.id),
      ...(floor.extensions ?? []).map((item) => item.id),
    ]),
  ];
  if (new Set(copiedIdentities).size !== copiedIdentities.length) throw new Error("The Building copy contains duplicate physical identity values.");
  for (const id of copiedIdentities) {
    if (originalIds.has(id)) throw new Error(`Copied Building retained source identity "${id}".`);
  }
  for (const floor of copy.floors) {
    for (const sharedId of [
      ...floor.stairs.map((item) => item.sharedId), ...floor.ramps.map((item) => item.sharedId),
      ...floor.elevators.map((item) => item.sharedId),
    ]) if (sharedId && originalSharedIds.has(sharedId)) throw new Error(`Copied Floor retained source vertical identity "${sharedId}".`);
    for (const groupId of floor.furniture.map((item) => item.groupId)) {
      if (groupId && originalFurnitureGroupIds.has(groupId)) throw new Error(`Copied Floor retained source Furniture group identity "${groupId}".`);
    }
  }
  for (const entrance of copy.entrances ?? []) if (originalIds.has(entrance.id)) throw new Error(`Copied Building retained source Entrance identity "${entrance.id}".`);
}

/** Stable physical snapshot helper used by duplication regression tests. */
export function buildingPhysicalSnapshot(building: CampusBuilding) {
  const stripIds = <T extends { id: string }>(items: T[] | undefined) => (items ?? []).map(({ id: _id, ...item }) => item);
  const entrances = building.entrances ?? [];
  const floorIndex = new Map(building.floors.map((floor, index) => [floor.id, index]));
  const exteriorStairs = building.exteriorEmergencyStairs ?? [];
  const sharedIndex = new Map<string, number>();
  const sharedRef = (id: string | undefined) => {
    if (!id) return undefined;
    if (!sharedIndex.has(id)) sharedIndex.set(id, sharedIndex.size);
    return sharedIndex.get(id);
  };
  const ordinal = <T>(items: T[], id: string | undefined, getId: (item: T) => string) => {
    if (!id) return undefined;
    const index = items.findIndex((item) => getId(item) === id);
    return index < 0 ? undefined : index;
  };
  const entranceIndex = (id: string | undefined) => ordinal(entrances, id, (entrance) => entrance.id);
  const zoneIndex = (floor: FloorPlan, id: string | undefined) => ordinal(floor.exteriorZones ?? [], id, (zone) => zone.id);
  const roomIndex = (floor: FloorPlan, id: string | undefined) => ordinal(floor.rooms, id, (room) => room.id);
  const doorIndex = (floor: FloorPlan, id: string | undefined) => ordinal(floor.doors, id, (door) => door.id);
  const wallIndex = (floor: FloorPlan, id: string | undefined) => ordinal(floor.walls, id, (wall) => wall.id);
  const exteriorStairIndex = (floor: FloorPlan, id: string | undefined) => {
    const owner = exteriorStairs.find((stair) => stair.id === id && stair.servedFloorIds.includes(floor.id));
    return owner ? exteriorStairs.indexOf(owner) : undefined;
  };

  // Seed the relationship ordinals in stable source-array order, then use the
  // same identity normalizer across all Floors and vertical circulation types.
  (building.circulationGroups ?? []).forEach((group) => sharedRef(group.id));
  exteriorStairs.forEach((stair) => sharedRef(stair.sharedId));
  building.floors.forEach((floor) => {
    floor.stairs.forEach((item) => sharedRef(item.sharedId));
    floor.ramps.forEach((item) => sharedRef(item.sharedId));
    floor.elevators.forEach((item) => sharedRef(item.sharedId));
  });
  const furnitureGroupIndex = new Map<string, number>();
  building.floors.forEach((floor) => floor.furniture.forEach((item) => {
    if (item.groupId && !furnitureGroupIndex.has(item.groupId)) furnitureGroupIndex.set(item.groupId, furnitureGroupIndex.size);
  }));

  return {
    geometry: { width: building.width, height: building.height, rotation: building.rotation },
    entrances: entrances.map(({ id: _id, buildingId: _buildingId, ...entrance }) => entrance),
    circulationGroups: (building.circulationGroups ?? []).map((group) => ({ kind: group.kind, name: group.name, shared: sharedRef(group.id) })),
    exteriorEmergencyStairs: exteriorStairs.map((stair) => ({
      label: stair.label,
      state: stair.state,
      width: stair.width,
      height: stair.height,
      attachment: stair.attachment,
      servedFloors: stair.servedFloorIds.map((id) => floorIndex.get(id)).sort((a, b) => (a ?? -1) - (b ?? -1)),
      shared: sharedRef(stair.sharedId),
      emergencySafe: stair.emergencySafe,
      visualSize: stair.visualSize,
      zOrder: stair.zOrder,
      visible: stair.visible,
      occurrences: building.floors.flatMap((floor, index) => {
        if (!stair.servedFloorIds.includes(floor.id)) return [];
        const occurrenceIndex = floor.stairs.findIndex((item) => item.exteriorEmergencyStairId === stair.id);
        return occurrenceIndex < 0 ? [] : [[index, occurrenceIndex]];
      }),
    })),
    floors: building.floors.map((floor) => ({
      number: floor.number,
      label: floor.label,
      canvasW: floor.canvasW,
      canvasH: floor.canvasH,
      extensions: (floor.extensions ?? []).map(({ id: _id, ...extension }) => extension),
      backgroundColor: floor.backgroundColor,
      appearance: floor.appearance,
      showGrid: floor.showGrid,
      showWallJunctions: floor.showWallJunctions,
      gridSize: floor.gridSize,
      backgroundImage: floor.backgroundImage,
      calibration: floor.calibration,
      rooms: floor.rooms.map(({ id: _id, buildingId: _buildingId, floorId: _floorId, accessNodeId: _accessNodeId, navConnection: _navConnection, accessType: _accessType, accessDoorId, accessDoorIds, ...room }) => ({
        ...room,
        accessDoor: doorIndex(floor, accessDoorId),
        accessDoors: accessDoorIds?.map((doorId) => doorIndex(floor, doorId)),
      })),
      paths: stripIds(floor.paths),
      walls: stripIds(floor.walls).map(({ startAnchor, endAnchor, ...wall }) => ({
        ...wall,
        startAnchor: startAnchor ? { ...startAnchor, roomId: roomIndex(floor, startAnchor.roomId) } : undefined,
        endAnchor: endAnchor ? { ...endAnchor, roomId: roomIndex(floor, endAnchor.roomId) } : undefined,
      })),
      doors: stripIds(floor.doors).map(({ wallId, buildingEntranceId, ...door }) => ({
        ...door,
        wall: wallIndex(floor, wallId),
        entrance: entranceIndex(buildingEntranceId),
      })),
      windows: stripIds(floor.windows).map(({ wallId, ...window }) => ({ ...window, wall: wallIndex(floor, wallId) })),
      furniture: stripIds(floor.furniture).map(({ exteriorZoneId, groupId, ...item }) => ({ ...item, group: groupId ? furnitureGroupIndex.get(groupId) : undefined, zone: zoneIndex(floor, exteriorZoneId) })),
      stairs: stripIds(floor.stairs).map(({ exteriorEmergencyStairId, sharedId, ...item }) => ({
        ...item,
        shared: sharedRef(sharedId),
        exterior: exteriorStairIndex(floor, exteriorEmergencyStairId),
      })),
      ramps: stripIds(floor.ramps).map(({ sharedId, ...item }) => ({ ...item, shared: sharedRef(sharedId) })),
      elevators: stripIds(floor.elevators).map(({ sharedId, ...item }) => ({ ...item, shared: sharedRef(sharedId) })),
      labels: stripIds(floor.labels),
      exteriorZones: stripIds(floor.exteriorZones).map(({ linkedEntranceId, linkedEntranceIds, ...zone }) => ({
        ...zone,
        entrance: entranceIndex(linkedEntranceId),
        entrances: linkedEntranceIds?.map(entranceIndex).filter((index): index is number => index !== undefined),
      })),
      entranceSteps: stripIds(floor.entranceSteps).map(({ parentZoneId, linkedEntranceId, ...item }) => ({ ...item, parent: zoneIndex(floor, parentZoneId), entrance: entranceIndex(linkedEntranceId) })),
      entranceRamps: stripIds(floor.entranceRamps).map(({ parentZoneId, linkedEntranceId, ...item }) => ({ ...item, parent: zoneIndex(floor, parentZoneId), entrance: entranceIndex(linkedEntranceId) })),
    })),
  };
}
