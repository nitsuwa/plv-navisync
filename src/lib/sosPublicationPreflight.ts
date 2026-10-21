import type { Campus, FloorRoom } from "../components/map-builder/types";
import {
  campusWidePrimaryAssemblyPoint,
  hasCampusWidePrimaryDesignation,
  isAssemblyPointAssignedForBuilding,
  resolvedAssemblyPointsForBuilding,
} from "./emergencyAssemblyPoints";
import { analyzeEmergencyOutdoorConnectivity } from "./emergencyOutdoorConnectivity";
import { evaluateRoomEmergencyEvacuation } from "./roomEmergencyEvacuation";
import { hydrateCampusStructure, serializeCampusStructure } from "../services/campusStructureService";

export interface SosPreflightCheck {
  id: string;
  state: "pass" | "attention" | "not_verified";
  detail: string;
}

export interface SosPublicationPreflight {
  checks: SosPreflightCheck[];
  assemblyPointCount: number;
  assignedBuildingCount: number;
  representativeRoomCount: number;
  serializationPassed: boolean;
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(Object.entries(candidate as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]));
  };
  return JSON.stringify(normalize(value));
}

function sosRelevantSnapshotSections(campus: Campus): Array<[string, unknown]> {
  const byId = <T extends { id: string }>(items: T[] | undefined): T[] => [...(items ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  return [
    ["Assembly Point entities, building assignments, campus Primary, and SOS destination policy", {
      assemblyPoints: byId(campus.assemblyPoints).map((point) => ({
        ...point,
        buildingAssignments: [...(point.buildingAssignments ?? [])].sort((left, right) =>
          left.buildingId.localeCompare(right.buildingId) || left.designation.localeCompare(right.designation)),
      })),
      campusWidePrimary: byId(campus.assemblyPoints).filter((point) => point.campusWidePrimary === true).map((point) => point.id),
      destinationPolicy: campus.settings?.emergencyDestinationPolicy ?? "fixed_primary",
    }],
    ["Doors, floor transitions, building exits, and emergency stairs", {
      buildings: byId(campus.buildings).map((building) => ({
        id: building.id,
        entrances: byId(building.entrances),
        exteriorEmergencyStairs: byId(building.exteriorEmergencyStairs),
        floors: byId(building.floors).map((floor) => ({
          id: floor.id,
          doors: byId(floor.doors),
          walls: byId(floor.walls),
          stairs: byId(floor.stairs),
          paths: byId(floor.paths),
          rooms: byId(floor.rooms).map((room) => ({
            id: room.id,
            accessNodeId: room.accessNodeId,
            accessDoorId: room.accessDoorId,
            accessDoorIds: room.accessDoorIds,
          })),
        })),
      })),
      campusGates: byId(campus.markers).filter((marker) => /gate/i.test(`${marker.name} ${marker.type}`)),
    }],
    ["Navigation anchors and graph connections", {
      navNodes: byId(campus.navNodes),
      navEdges: byId(campus.navEdges),
    }],
  ];
}

function publishedSnapshotDifference(campus: Campus, publishedSnapshot?: Campus | string): SosPreflightCheck {
  if (!publishedSnapshot) return {
    id: "published_snapshot_difference",
    state: "not_verified",
    detail: "The current published-version snapshot is unavailable, so SOS draft-to-published differences could not be checked.",
  };

  try {
    const published = typeof publishedSnapshot === "string" ? JSON.parse(publishedSnapshot) as Campus : publishedSnapshot;
    if (!published || published.id !== campus.id) throw new Error("Campus identity does not match.");
    const draftSections = sosRelevantSnapshotSections(campus);
    const publishedSections = new Map(sosRelevantSnapshotSections(published));
    const changed = draftSections.filter(([label, value]) => canonicalJson(value) !== canonicalJson(publishedSections.get(label)))
      .map(([label]) => label);
    return {
      id: "published_snapshot_difference",
      state: changed.length > 0 ? "attention" : "pass",
      detail: changed.length > 0
        ? `SOS-relevant draft data differs from the current published version in: ${changed.join("; ")}. These changes will reach students only after an authorized publication.`
        : "SOS-relevant destinations, assignments, exits, floor access, and graph connections match the current published version.",
    };
  } catch {
    return {
      id: "published_snapshot_difference",
      state: "attention",
      detail: "The stored published-version snapshot could not be compared with this draft. Reopen the campus after its published snapshot has loaded.",
    };
  }
}

function representativeRoom(campus: Campus, buildingId: string): { floorId: string; room: FloorRoom } | undefined {
  const building = campus.buildings.find((candidate) => candidate.id === buildingId);
  for (const floor of building?.floors ?? []) {
    const room = floor.rooms.find((candidate) => (candidate.accessDoorIds?.length ?? 0) > 0);
    if (room) return { floorId: floor.id, room };
  }
  return undefined;
}

/**
 * Evaluate a proposed publish snapshot in memory. This mirrors the immutable
 * `campus` JSON and structure payload written by publishCampusVersion without
 * performing a save, database query, approval, or publication.
 */
export function evaluateSosPublicationPreflight(campus: Campus, publishedSnapshot?: Campus | string): SosPublicationPreflight {
  const checks: SosPreflightCheck[] = [];
  const points = campus.assemblyPoints ?? [];
  const assignedBuildings = [...new Set(points.flatMap((point) => (point.buildingAssignments ?? []).map((assignment) => assignment.buildingId)))];
  let serializationPassed = false;
  let snapshotCampus: Campus | null = null;
  let hydratedCampus: Campus | null = null;

  try {
    const proposedStructure = serializeCampusStructure(campus);
    const snapshotCampusValue = JSON.parse(JSON.stringify({ ...campus, eventOverlays: [] })) as Campus;
    snapshotCampus = snapshotCampusValue;
    const serializedPointRows = new Map(proposedStructure.map_elements
      .filter((row) => row.element_type === "assembly_area")
      .map((row) => [String(row.id), row]));
    const pointRowsPreserved = points.every((point) => {
      const row = serializedPointRows.get(point.id);
      const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : undefined;
      const ui = metadata?.ui && typeof metadata.ui === "object" && !Array.isArray(metadata.ui)
        ? metadata.ui as Record<string, unknown>
        : undefined;
      return Boolean(row && ui?.id === point.id && ui.navNodeId === point.navNodeId
        && Array.isArray(ui.buildingAssignments)
        && JSON.stringify(ui.buildingAssignments) === JSON.stringify(point.buildingAssignments ?? [])
        && ui.campusWidePrimary === point.campusWidePrimary);
    });
    const pointIdsPreserved = points.length === serializedPointRows.size && pointRowsPreserved;
    const snapshotGraphPreserved = JSON.stringify(snapshotCampusValue.navNodes ?? []) === JSON.stringify(campus.navNodes ?? [])
      && JSON.stringify(snapshotCampusValue.navEdges ?? []) === JSON.stringify(campus.navEdges ?? [])
      && JSON.stringify(snapshotCampusValue.assemblyPoints ?? []) === JSON.stringify(points);

    // Mirror the existing structure save/load contract with the rows emitted
    // by the same serializer. Published Student Map hydration reads snapshot.campus;
    // Admin reloads rebuild the map from these relational row collections.
    hydratedCampus = hydrateCampusStructure(snapshotCampusValue, {
      buildings: proposedStructure.buildings.map((row) => ({ ...row, campus_id: campus.id }) as never),
      floors: proposedStructure.floors as never,
      mapElements: proposedStructure.map_elements as never,
      navigationNodes: proposedStructure.navigation_nodes.map((row) => ({ ...row, campus_id: campus.id }) as never),
      navigationEdges: proposedStructure.navigation_edges.map((row) => ({ ...row, campus_id: campus.id }) as never),
    });
    const hydratedPoints = hydratedCampus.assemblyPoints ?? [];
    const hydrationPreserved = points.length === hydratedPoints.length && points.every((point) => {
      const loadedPoint = hydratedPoints.find((candidate) => candidate.id === point.id);
      const loadedAnchor = loadedPoint && (hydratedCampus?.navNodes ?? []).find((node) =>
        node.id === loadedPoint.navNodeId && node.assemblyPointId === loadedPoint.id && node.type === "assembly");
      return Boolean(loadedPoint && loadedPoint.navNodeId === point.navNodeId
        && JSON.stringify(loadedPoint.buildingAssignments ?? []) === JSON.stringify(point.buildingAssignments ?? [])
        && loadedPoint.campusWidePrimary === point.campusWidePrimary
        && loadedAnchor);
    });
    serializationPassed = pointIdsPreserved && snapshotGraphPreserved && hydrationPreserved;
    checks.push({ id: "snapshot_round_trip", state: serializationPassed ? "pass" : "attention",
      detail: serializationPassed
        ? "Assembly Point entities, campus-wide designation, anchors, building assignments, and outdoor graph links survive both the published snapshot JSON path and the existing relational serialize/hydrate path."
        : "The proposed snapshot or relational hydration did not preserve every Assembly Point row, anchor, assignment, or graph identity." });
  } catch (error) {
    checks.push({ id: "snapshot_round_trip", state: "attention", detail: `The proposed SOS snapshot could not be serialized: ${error instanceof Error ? error.message : "unknown serialization error"}` });
  }

  checks.push(publishedSnapshotDifference(campus, publishedSnapshot));

  checks.push({
    id: "assembly_point_entities",
    state: points.length > 0 ? "pass" : "attention",
    detail: points.length > 0
      ? `${points.length} Assembly Point entr${points.length === 1 ? "y is" : "ies are"} included in the proposed snapshot.`
      : "No Assembly Point entity is included. Student SOS can only use the permitted Campus Gate fallback where no point is assigned.",
  });

  for (const point of points) {
    const proposedCampus = snapshotCampus ?? campus;
    const outdoorConnectivity = analyzeEmergencyOutdoorConnectivity(proposedCampus, point);
    const hasValidAssignment = (point.buildingAssignments ?? []).some((assignment) =>
      isAssemblyPointAssignedForBuilding(proposedCampus, point, assignment.buildingId))
      || (point.campusWidePrimary === true && campusWidePrimaryAssemblyPoint(proposedCampus)?.id === point.id);
    const pointCheckState = outdoorConnectivity.state === "connected" && hasValidAssignment ? "pass" : "attention";
    checks.push({
      id: `assembly_point:${point.id}`,
      state: pointCheckState,
      detail: `${point.name}: ${outdoorConnectivity.summary} ${hasValidAssignment ? "Its assigned outdoor anchor is valid." : "Check its outdoor anchor and building assignment."} ${outdoorConnectivity.nextAction}`.trim(),
    });
  }

  const policy = campus.settings?.emergencyDestinationPolicy ?? "fixed_primary";
  const resolvedBuildingIds = campus.buildings.flatMap((building) =>
    resolvedAssemblyPointsForBuilding(campus, building.id).length > 0 ? [building.id] : []);
  const assignedBuildingIds = resolvedBuildingIds.length > 0
    ? resolvedBuildingIds
    : assignedBuildings.filter((id) => campus.buildings.some((building) => building.id === id));
  const hasCampusPrimary = hasCampusWidePrimaryDesignation(campus);
  if (assignedBuildingIds.length === 0 && points.length > 0 && !hasCampusPrimary) {
    checks.push({ id: "building_assignments", state: "attention", detail: "No existing building assignment points to an Assembly Point in this snapshot." });
  } else if (assignedBuildingIds.length > 0) {
    checks.push({ id: "building_assignments", state: "pass", detail: `${assignedBuildingIds.length} building${assignedBuildingIds.length === 1 ? " resolves" : "s resolve"} to an Assembly Point; explicit building assignments and campus Primary inheritance follow ${policy === "nearest_eligible" ? "Nearest Eligible" : "Fixed Primary"} policy.` });
  } else if (hasCampusPrimary) {
    checks.push({ id: "building_assignments", state: "attention", detail: "A campus-wide Primary is designated but is not structurally valid; restore its Assembly Point anchor before publication." });
  }

  const representativeBuildingIds = points.flatMap((point) => (point.buildingAssignments ?? [])
    .filter((assignment) => assignment.designation === "primary" || policy === "nearest_eligible")
    .map((assignment) => assignment.buildingId));
  if (hasCampusPrimary && campusWidePrimaryAssemblyPoint(campus)) {
    representativeBuildingIds.push(...campus.buildings.map((building) => building.id));
  }
  let representativeRoomCount = 0;
  for (const buildingId of [...new Set(representativeBuildingIds)]) {
    const sample = representativeRoom(snapshotCampus ?? campus, buildingId);
    const building = campus.buildings.find((candidate) => candidate.id === buildingId);
    if (!sample) {
      checks.push({ id: `route:${buildingId}`, state: "not_verified", detail: `${building?.name ?? buildingId}: no Room with an authored Door access was available for the representative route check.` });
      continue;
    }
    representativeRoomCount += 1;
    try {
      const evaluation = evaluateRoomEmergencyEvacuation(snapshotCampus ?? campus, buildingId, sample.floorId, sample.room.id);
      const eligible = evaluation.candidates.filter((candidate) => candidate.completeAssemblyRoute
        && candidate.emergencyUseReviewRequired !== true
        && candidate.assemblyPointId);
      checks.push({ id: `route:${buildingId}`, state: eligible.length > 0 ? "pass" : "attention",
        detail: eligible.length > 0
          ? `${building?.name ?? buildingId} · ${sample.room.name}: ${eligible.length} complete emergency-eligible route${eligible.length === 1 ? "" : "s"} reach an assigned Assembly Point.`
          : `${building?.name ?? buildingId} · ${sample.room.name}: ${evaluation.message}` });
    } catch (error) {
      checks.push({ id: `route:${buildingId}`, state: "attention", detail: `${building?.name ?? buildingId} · ${sample.room.name}: route evaluation failed (${error instanceof Error ? error.message : "unknown error"}).` });
    }
  }
  if (assignedBuildingIds.length === 0 && points.length === 0) {
    checks.push({ id: "representative_routes", state: "not_verified", detail: "No assigned Assembly Point route can be checked; Campus Gate fallback is not Assembly Point readiness." });
  }

  return {
    checks,
    assemblyPointCount: points.length,
    assignedBuildingCount: assignedBuildingIds.length,
    representativeRoomCount,
    serializationPassed,
  };
}
