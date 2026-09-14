/**
 * Combined pathfinding — connects outdoor building-to-building routes
 * with indoor floor-plan room routing.
 *
 * This lets users search for and navigate to specific rooms inside
 * buildings, not just building entrances.
 *
 * The route is computed in segments:
 *   1. Indoor exit (room → lobby/entrance) — uses indoorPathfinding
 *   2. Outdoor walk (building → building) — uses pathfinding
 *   3. Indoor entry (entrance → room on target floor) — uses indoorPathfinding
 */

import { findBuildingPath } from "./pathfinding";
import { findIndoorRoute, findIndoorRouteForFloor, findMultiFloorIndoorRoute } from "./indoorPathfinding";
import { FLOOR_PLANS, type Room } from "../data/floorPlans";
import { MOCK_BUILDINGS } from "../data/mockData";
import type { IndoorRoute } from "./indoorPathfinding";
import type { GraphPath } from "./pathfinding";

// ── Destination types ──────────────────────────────────────────────────────

export interface BuildingDest {
  type: "building";
  buildingId: string;
  label: string;
  code: string;
  entranceNodeId?: string;
}

export interface RoomDest {
  type: "room";
  buildingId: string;
  floorNumber: number;
  roomId: string;
  roomName: string;
  buildingLabel: string;
  buildingCode: string;
  accessNodeId?: string;
  accessDoorId?: string;
  accessDoorIds?: string[];
}

export type Destination = BuildingDest | RoomDest;

// ── Combined result ────────────────────────────────────────────────────────

export interface RouteSegment {
  /** Human-readable label for this segment (e.g. "Indoor: Lobby → Room 305") */
  label: string;
  /** SVG waypoints for this segment */
  waypoints: { x: number; y: number }[];
  /** Distance in meters */
  distanceM: number;
  /** Estimated time in seconds */
  seconds: number;
  /** Step-by-step directions */
  steps: string[];
  /** The building whose floor plan this segment belongs to (null = outdoor) */
  buildingId: string | null;
  /** Floor number this segment is on (null = outdoor) */
  floorNumber: number | null;
  /** Whether this segment is indoor */
  isIndoor: boolean;
}

export interface CombinedRoute {
  /** All segments that make up the complete route */
  segments: RouteSegment[];
  /** Total distance in meters */
  totalDistanceM: number;
  /** Total estimated time in minutes */
  totalMinutes: number;
  /** Flattened waypoints for drawing on the main campus map */
  campusWaypoints: { x: number; y: number }[];
  /** Step-by-step directions combining all segments */
  allSteps: string[];
  /** If the destination is a room, automatically open this floor plan */
  destinationRoom?: { buildingId: string; floorNumber: number; roomId: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────



/** Get building center (used when building has no floor plan) */
function getBuildingCenter(buildingId: string): { x: number; y: number } | null {
  // Use the B_POS data from the campus map
  const B_POS: Record<string, { x: number; y: number; w: number; h: number }> = {
    b1: { x: 155, y: 130, w: 125, h: 80 },
    b2: { x: 395, y: 115, w: 105, h: 72 },
    b3: { x: 545, y: 295, w: 115, h: 78 },
    b4: { x: 165, y: 305, w: 105, h: 62 },
    b5: { x: 305, y: 435, w: 145, h: 82 },
    b6: { x: 605, y: 415, w: 112, h: 72 },
  };
  const pos = B_POS[buildingId];
  if (!pos) return null;
  return { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 };
}

/** Estimate indoor route from entrance/lobby to a specific room on a floor */
function getIndoorEntryRoute(
  buildingId: string,
  targetFloor: number,
  targetRoomId: string
): IndoorRoute | null {
  return findIndoorRoute(buildingId, targetFloor, targetRoomId);
}

/** 
 * Reverse an indoor route so waypoints and steps go from room → stair/elevator 
 * (for exit segments) instead of the default stair → room direction.
 */
function reverseIndoorRoute(route: IndoorRoute, roomName: string): IndoorRoute {
  return {
    waypoints: [...route.waypoints].reverse(),
    steps: [
      `Start from ${roomName}`,
      ...route.steps
        .filter(s => !s.startsWith("Start from") && !s.startsWith("Arrive at"))
        .reverse()
        .map(s => s.replace(/Walk (.*?) (left|right|up|down)$/, (_, d, dir) => {
          const opposite: Record<string, string> = { left: "right", right: "left", up: "down", down: "up" };
          return `Walk ${d} ${opposite[dir] ?? dir}`;
        })),
      `Exit toward the building entrance`,
    ],
    distanceMeters: route.distanceMeters,
    estimatedSeconds: route.estimatedSeconds,
  };
}

// ── Main pathfinding function ──────────────────────────────────────────────

/**
 * Find a complete route between two destinations, which can be buildings or rooms.
 *
 * @param from - Starting destination (building or room)
 * @param to - Target destination (building or room)
 * @param accessibleOnly - Whether to use only wheelchair-accessible paths
 * @returns Combined route with segments, or null if no path exists
 */
export function findCompleteRoute(
  from: Destination,
  to: Destination,
  accessibleOnly = false
): CombinedRoute | null {
  const fromBuildingId = from.buildingId;
  const toBuildingId = to.buildingId;
  const segments: RouteSegment[] = [];

  // ── CASE 1: Both are buildings (simplest) ───────────────────────────
  if (from.type === "building" && to.type === "building") {
    const path = findBuildingPath(fromBuildingId, toBuildingId, accessibleOnly);
    if (!path) return null;

    segments.push({
      label: `Walk from ${from.label} to ${to.label}`,
      waypoints: path.waypoints,
      distanceM: path.distanceM,
      seconds: path.minutes * 60,
      steps: path.steps,
      buildingId: null,
      floorNumber: null,
      isIndoor: false,
    });

    return {
      segments,
      totalDistanceM: path.distanceM,
      totalMinutes: path.minutes,
      campusWaypoints: path.waypoints,
      allSteps: path.steps,
    };
  }

  // ── CASE 2: Building → Room ─────────────────────────────────────────
  if (from.type === "building" && to.type === "room") {
    // Walk from source building to destination building entrance
    const path = findBuildingPath(fromBuildingId, toBuildingId, accessibleOnly);
    if (!path) return null;

    segments.push({
      label: `Walk from ${from.label} to ${to.buildingLabel}`,
      waypoints: path.waypoints,
      distanceM: path.distanceM,
      seconds: path.minutes * 60,
      steps: path.steps,
      buildingId: null,
      floorNumber: null,
      isIndoor: false,
    });

    // If destination has a floor plan, add indoor route to the room
    const floorPlan = FLOOR_PLANS[toBuildingId];
    if (floorPlan) {
      const indoorRoute = findIndoorRoute(toBuildingId, to.floorNumber, to.roomId);
      if (indoorRoute) {
        // Add "Enter building" step
        const enterSteps = [`Enter ${to.buildingLabel} (${to.buildingCode})`];
        
        // If not on ground floor, add floor change
        if (to.floorNumber > 1) {
          const floorData = floorPlan.floors.find(f => f.number === to.floorNumber);
          enterSteps.push(`Take stairs/elevator to ${floorData?.label ?? `Floor ${to.floorNumber}`}`);
        }
        
        segments.push({
          label: `Navigate to ${to.roomName} (${to.buildingCode})`,
          waypoints: indoorRoute.waypoints,
          distanceM: indoorRoute.distanceMeters,
          seconds: indoorRoute.estimatedSeconds,
          steps: [...enterSteps, ...indoorRoute.steps],
          buildingId: toBuildingId,
          floorNumber: to.floorNumber,
          isIndoor: true,
        });
      }
    }

    const totalDist = segments.reduce((s, seg) => s + seg.distanceM, 0);
    const totalSec = segments.reduce((s, seg) => s + seg.seconds, 0);
    const allSteps = segments.flatMap(seg => seg.steps);
    const allWps = segments.flatMap(seg => seg.waypoints);

    return {
      segments,
      totalDistanceM: Math.round(totalDist),
      totalMinutes: Math.max(1, Math.round(totalSec / 60)),
      campusWaypoints: allWps,
      allSteps,
      destinationRoom: { buildingId: toBuildingId, floorNumber: to.floorNumber, roomId: to.roomId },
    };
  }

  // ── CASE 3: Room → Building ─────────────────────────────────────────
  if (from.type === "room" && to.type === "building") {
    // Indoor exit from source room (reverse route: room → stairs)
    const floorPlan = FLOOR_PLANS[fromBuildingId];
    let exitRoute: IndoorRoute | null = null;
    if (floorPlan) {
      const routeToRoom = findIndoorRoute(fromBuildingId, from.floorNumber, from.roomId);
      if (routeToRoom) {
        exitRoute = reverseIndoorRoute(routeToRoom, from.roomName);
      }
    }

    if (exitRoute) {
      const exitLabel = `Exit ${from.roomName} to lobby`;
      segments.push({
        label: exitLabel,
        waypoints: exitRoute.waypoints,
        distanceM: exitRoute.distanceMeters,
        seconds: exitRoute.estimatedSeconds,
        steps: exitRoute.steps,
        buildingId: fromBuildingId,
        floorNumber: from.floorNumber,
        isIndoor: true,
      });
    }

    // Walk from source to destination building
    const path = findBuildingPath(fromBuildingId, toBuildingId, accessibleOnly);
    if (!path) return null;

    segments.push({
      label: `Walk from ${from.buildingLabel} to ${to.label}`,
      waypoints: path.waypoints,
      distanceM: path.distanceM,
      seconds: path.minutes * 60,
      steps: path.steps,
      buildingId: null,
      floorNumber: null,
      isIndoor: false,
    });

    const totalDist = segments.reduce((s, seg) => s + seg.distanceM, 0);
    const totalSec = segments.reduce((s, seg) => s + seg.seconds, 0);
    const allSteps = segments.flatMap(seg => seg.steps);
    const allWps = segments.flatMap(seg => seg.waypoints);

    return {
      segments,
      totalDistanceM: Math.round(totalDist),
      totalMinutes: Math.max(1, Math.round(totalSec / 60)),
      campusWaypoints: allWps,
      allSteps,
    };
  }

  // ── CASE 4: Room → Room ─────────────────────────────────────────────
  if (from.type === "room" && to.type === "room") {
    // Same building?
    if (fromBuildingId === toBuildingId) {
      // Same floor?
      if (from.floorNumber === to.floorNumber) {
        // Direct indoor route on the same floor
        const indoorRoute = findIndoorRoute(fromBuildingId, from.floorNumber, to.roomId);
        if (!indoorRoute) return null;

        segments.push({
          label: `Navigate from ${from.roomName} to ${to.roomName}`,
          waypoints: indoorRoute.waypoints,
          distanceM: indoorRoute.distanceMeters,
          seconds: indoorRoute.estimatedSeconds,
          steps: indoorRoute.steps,
          buildingId: fromBuildingId,
          floorNumber: from.floorNumber,
          isIndoor: true,
        });

        return {
          segments,
          totalDistanceM: Math.round(indoorRoute.distanceMeters),
          totalMinutes: Math.max(1, Math.round(indoorRoute.estimatedSeconds / 60)),
          campusWaypoints: indoorRoute.waypoints,
          allSteps: indoorRoute.steps,
          destinationRoom: { buildingId: toBuildingId, floorNumber: to.floorNumber, roomId: to.roomId },
        };
      }

      // Different floors in same building — use stairs/elevator transit
      const routeToStairs = FLOOR_PLANS[fromBuildingId]
        ? findIndoorRoute(fromBuildingId, from.floorNumber, from.roomId)
        : null;
      const exitRoute = routeToStairs ? reverseIndoorRoute(routeToStairs, from.roomName) : null;
      const entryRoute = FLOOR_PLANS[toBuildingId]
        ? findIndoorRoute(toBuildingId, to.floorNumber, to.roomId)
        : null;
      
      if (exitRoute) {
        segments.push({
          label: `Exit ${from.roomName}`,
          waypoints: exitRoute.waypoints,
          distanceM: exitRoute.distanceMeters,
          seconds: exitRoute.estimatedSeconds,
          steps: exitRoute.steps,
          buildingId: fromBuildingId,
          floorNumber: from.floorNumber,
          isIndoor: true,
        });
      }

      // Add floor change step
      const floorDiff = Math.abs(to.floorNumber - from.floorNumber);
      const transitSteps = [
        `Take stairs/elevator from Floor ${from.floorNumber} to Floor ${to.floorNumber}`,
      ];

      segments.push({
        label: `Change floor: ${from.floorNumber} → ${to.floorNumber}`,
        waypoints: [],
        distanceM: 0,
        seconds: floorDiff * 15, // ~15 sec per floor via stairs
        steps: transitSteps,
        buildingId: fromBuildingId,
        floorNumber: null,
        isIndoor: true,
      });

      if (entryRoute) {
        let entrySteps: string[] = [];
        const floorData = FLOOR_PLANS[toBuildingId]?.floors.find(f => f.number === to.floorNumber);
        entrySteps.push(`Arrived at ${floorData?.label ?? `Floor ${to.floorNumber}`}`);
        entrySteps = [...entrySteps, ...entryRoute.steps];
        
        segments.push({
          label: `Navigate to ${to.roomName}`,
          waypoints: entryRoute.waypoints,
          distanceM: entryRoute.distanceMeters,
          seconds: entryRoute.estimatedSeconds,
          steps: entrySteps,
          buildingId: toBuildingId,
          floorNumber: to.floorNumber,
          isIndoor: true,
        });
      }

      const totalDist = segments.reduce((s, seg) => s + seg.distanceM, 0);
      const totalSec = segments.reduce((s, seg) => s + seg.seconds, 0);
      const allSteps = segments.flatMap(seg => seg.steps);
      const allWps = segments.flatMap(seg => seg.waypoints);

      return {
        segments,
        totalDistanceM: Math.round(totalDist),
        totalMinutes: Math.max(1, Math.round(totalSec / 60)),
        campusWaypoints: allWps,
        allSteps,
        destinationRoom: { buildingId: toBuildingId, floorNumber: to.floorNumber, roomId: to.roomId },
      };
    }

    // Different buildings
    // 1. Exit source building (reverse route: room → stairs)
    const routeToExit = FLOOR_PLANS[fromBuildingId]
      ? findIndoorRoute(fromBuildingId, from.floorNumber, from.roomId)
      : null;
    const exitRoute = routeToExit ? reverseIndoorRoute(routeToExit, from.roomName) : null;
    if (exitRoute) {
      segments.push({
        label: `Exit ${from.roomName} (${from.buildingCode})`,
        waypoints: exitRoute.waypoints,
        distanceM: exitRoute.distanceMeters,
        seconds: exitRoute.estimatedSeconds,
        steps: exitRoute.steps,
        buildingId: fromBuildingId,
        floorNumber: from.floorNumber,
        isIndoor: true,
      });
    }

    // 2. Walk between buildings
    const path = findBuildingPath(fromBuildingId, toBuildingId, accessibleOnly);
    if (!path) return null;

    segments.push({
      label: `Walk from ${from.buildingLabel} to ${to.buildingLabel}`,
      waypoints: path.waypoints,
      distanceM: path.distanceM,
      seconds: path.minutes * 60,
      steps: path.steps,
      buildingId: null,
      floorNumber: null,
      isIndoor: false,
    });

    // 3. Enter destination building and navigate to room
    const entryRoute = FLOOR_PLANS[toBuildingId]
      ? findIndoorRoute(toBuildingId, to.floorNumber, to.roomId)
      : null;
    if (entryRoute) {
      let entrySteps = [`Enter ${to.buildingLabel} (${to.buildingCode})`];
      if (to.floorNumber > 1) {
        entrySteps.push(`Take stairs/elevator to Floor ${to.floorNumber}`);
      }
      segments.push({
        label: `Navigate to ${to.roomName}`,
        waypoints: entryRoute.waypoints,
        distanceM: entryRoute.distanceMeters,
        seconds: entryRoute.estimatedSeconds,
        steps: [...entrySteps, ...entryRoute.steps],
        buildingId: toBuildingId,
        floorNumber: to.floorNumber,
        isIndoor: true,
      });
    }

    const totalDist = segments.reduce((s, seg) => s + seg.distanceM, 0);
    const totalSec = segments.reduce((s, seg) => s + seg.seconds, 0);
    const allSteps = segments.flatMap(seg => seg.steps);
    const allWps = segments.flatMap(seg => seg.waypoints);

    return {
      segments,
      totalDistanceM: Math.round(totalDist),
      totalMinutes: Math.max(1, Math.round(totalSec / 60)),
      campusWaypoints: allWps,
      allSteps,
      destinationRoom: { buildingId: toBuildingId, floorNumber: to.floorNumber, roomId: to.roomId },
    };
  }

  return null;
}

// ── Multi-floor combined routing for a published campus ───────────────

/**
 * Find a complete route from a start location to a destination room
 * working entirely from published campus data (no hardcoded FLOOR_PLANS).
 *
 * Handles same-floor, same-building-multi-floor, and cross-building routes.
 */
export function findCompleteRouteInCampus(
  campus: {
    buildings: {
      id: string; name: string; code: string;
      floors?: { number: number; label: string; rooms: { id: string; name: string; x: number; y: number; w: number; h: number; type: string; accessibility?: boolean }[] }[];
    }[];
  },
  target: { buildingId: string; floorNumber: number; roomId: string } | null,
  start?: { buildingId?: string; floorNumber?: number } | null,
  accessibleOnly = false
): { segments: RouteSegment[]; totalDistanceM: number; totalMinutes: number; allSteps: string[] } | null {
  if (!target) return null;

  const segments: RouteSegment[] = [];

  const targetBuilding = campus.buildings.find(b => b.id === target.buildingId);
  if (!targetBuilding) return null;

  const fromBuilding = start?.buildingId
    ? campus.buildings.find(b => b.id === start.buildingId)
    : null;

  // Same building routing (may involve multiple floors)
  if (fromBuilding && fromBuilding.id === target.buildingId) {
    const fromFloor = start?.floorNumber ?? 1;
    if (fromFloor === target.floorNumber) {
      // Same floor — use indoor route directly
      const floorData = targetBuilding.floors?.find(f => f.number === target.floorNumber);
      if (!floorData) return null;

      const indoorRoute = findIndoorRouteForFloor(
        target.buildingId, target.floorNumber, target.roomId, floorData.rooms as any, accessibleOnly
      );
      if (!indoorRoute) return null;

      segments.push({
        label: `Navigate to room on ${targetBuilding.name}`,
        waypoints: indoorRoute.waypoints,
        distanceM: indoorRoute.distanceMeters,
        seconds: indoorRoute.estimatedSeconds,
        steps: indoorRoute.steps,
        buildingId: target.buildingId,
        floorNumber: target.floorNumber,
        isIndoor: true,
      });
    } else {
      // Different floors in same building — multi-floor indoor
      const floorDataMap: Record<number, { id: string; name: string; x: number; y: number; w: number; h: number; type: string }[]> = {};
      for (const f of targetBuilding.floors ?? []) {
        floorDataMap[f.number] = f.rooms as any;
      }

      const multiRoute = findMultiFloorIndoorRoute(
        target.buildingId,
        target.floorNumber,
        target.roomId,
        fromFloor,
        floorDataMap,
        accessibleOnly
      );

      if (!multiRoute) return null;

      for (const seg of multiRoute.segments) {
        segments.push({
          label: seg.label,
          waypoints: seg.waypoints,
          distanceM: seg.distanceM,
          seconds: seg.seconds,
          steps: seg.steps,
          buildingId: seg.floorNumber !== null ? target.buildingId : null,
          floorNumber: seg.floorNumber,
          isIndoor: true,
        });
      }
    }
  } else {
    // Different buildings or just navigating to a room
    const floorTargetData = targetBuilding.floors?.find(f => f.number === target.floorNumber);
    if (!floorTargetData) return null;

    const indoorRoute = findIndoorRouteForFloor(
      target.buildingId, target.floorNumber, target.roomId, floorTargetData.rooms as any, accessibleOnly
    );

    if (indoorRoute) {
      let entrySteps: string[] = [];
      if (fromBuilding && fromBuilding.id !== target.buildingId) {
        entrySteps.push(`Walk from ${fromBuilding.name} to ${targetBuilding.name}`);
      }
      entrySteps.push(`Enter ${targetBuilding.name}`);
      if (target.floorNumber > 1) {
        entrySteps.push(`Take stairs/elevator to ${describeFloorLabel(target.floorNumber)}`);
      }

      segments.push({
        label: `Navigate to room in ${targetBuilding.name}`,
        waypoints: indoorRoute.waypoints,
        distanceM: indoorRoute.distanceMeters,
        seconds: indoorRoute.estimatedSeconds,
        steps: [...entrySteps, ...indoorRoute.steps],
        buildingId: target.buildingId,
        floorNumber: target.floorNumber,
        isIndoor: true,
      });
    }

    if (!segments.length) return null;
  }

  const totalDistanceM = Math.round(segments.reduce((s, seg) => s + seg.distanceM, 0));
  const totalSeconds = segments.reduce((s, seg) => s + seg.seconds, 0);
  const allSteps = segments.flatMap(seg => seg.steps);

  return {
    segments,
    totalDistanceM,
    totalMinutes: Math.max(1, Math.round(totalSeconds / 60)),
    allSteps,
  };
}

function describeFloorLabel(floorNumber: number): string {
  if (floorNumber === 1) return "Ground Floor";
  if (floorNumber === 2) return "2nd Floor";
  if (floorNumber === 3) return "3rd Floor";
  return `${floorNumber}th Floor`;
}

/**
 * Search rooms inside a published campus's buildings and floors.
 * Returns rooms whose name, type, or parent building name matches the query.
 */
export function searchDestinationsInCampus(
  campus: { buildings: { id: string; name: string; code: string; floors?: { number: number; label: string; rooms: { id: string; name: string; type: string }[] }[] }[] },
  query: string
): { rooms: RoomDest[] } {
  if (!query.trim()) return { rooms: [] };
  const q = query.toLowerCase();
  const rooms: RoomDest[] = [];

  for (const building of campus.buildings) {
    for (const floor of building.floors || []) {
      for (const room of floor.rooms || []) {
        const nameMatch = room.name.toLowerCase().includes(q);
        const typeMatch = room.type?.toLowerCase().includes(q) ?? false;
        const buildingMatch = building.name?.toLowerCase().includes(q) ?? false;
        const codeMatch = building.code?.toLowerCase().includes(q) ?? false;

        if (nameMatch || typeMatch || buildingMatch || codeMatch) {
          rooms.push({
            type: "room",
            buildingId: building.id,
            floorNumber: floor.number,
            roomId: room.id,
            roomName: room.name,
            buildingLabel: building.name,
            buildingCode: building.code,
          });
        }
      }
    }
  }

  return { rooms };
}

// ── Search helper ──────────────────────────────────────────────────────────

/**
 * Search both buildings and rooms matching a query string.
 */
export function searchDestinations(query: string) {
  if (!query.trim()) return { buildings: [] as BuildingDest[], rooms: [] as RoomDest[] };

  const q = query.toLowerCase();
  // Search buildings
  const buildings: BuildingDest[] = MOCK_BUILDINGS
    .filter((b) =>
      b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)
    )
    .map((b) => ({
      type: "building" as const,
      buildingId: b.id,
      label: b.name,
      code: b.code,
    }));

  // Search rooms across all floor plans
  const rooms: RoomDest[] = [];
  for (const [buildingId, plan] of Object.entries(FLOOR_PLANS)) {
    const bld = MOCK_BUILDINGS.find((b) => b.id === buildingId);
    for (const floor of plan.floors) {
      for (const room of floor.rooms) {
        if (
          room.name.toLowerCase().includes(q) ||
          room.type.toLowerCase().includes(q) ||
          (plan.buildingName && plan.buildingName.toLowerCase().includes(q))
        ) {
          rooms.push({
            type: "room",
            buildingId,
            floorNumber: floor.number,
            roomId: room.id,
            roomName: room.name,
            buildingLabel: plan.buildingName,
            buildingCode: bld?.code ?? buildingId.toUpperCase(),
          });
        }
      }
    }
  }

  return { buildings, rooms };
}
