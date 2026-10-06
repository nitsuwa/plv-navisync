import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";

import {
  Search, Building2, X,
  Accessibility, AlertTriangle, Navigation, Bookmark,
  Clock, ChevronRight, ChevronLeft, ChevronDown,
  Share2, CalendarDays, MapPin, Compass,
  Footprints, QrCode, Loader2, RefreshCw, AlertCircle, Crosshair,
} from "lucide-react";

import { useDebounce, usePublishedCampus, useCampusSearch, useReducedMotion, type SearchResult } from "../hooks";
import { type RoomType } from "../data/floorPlans";
import type { Building } from "../types";
import { cn } from "../lib/utils";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useToast } from "../hooks/useToast";

import { buildingPositionsFromCampus, floorPlansFromCampus, buildingsFromCampus, facilitiesFromCampus, accessibilityFromCampus } from "../lib/mapDataAdapter";
import {
  findIndoorRouteForFloor,
  findIndoorRouteFromNavigationGraph,
  type IndoorRoute,
  type RoomLike,
} from "../lib/indoorPathfinding";
import { hasNavigableRoute, planBuildingRoute, planDestinationRoute, planPointToDestinationRoute, planRouteFromPoint, type PlannedRoute, type RouteIndoorSegment, type RouteStep } from "../lib/routePlanner";
import type { CampusPlaceDest, RoomDest } from "../lib/combinedPathfinding";
import { snapToNearest } from "../lib/geo";
import { NODES as STATIC_NAV_NODES } from "../lib/pathfinding";
import { projectReadonlyOutdoorCampus } from "../lib/readonlyOutdoorCampus";
import {
  clampStudentMapZoom,
  clampViewportPan,
  dampCameraZoomLogarithm,
  getBuildingFocusPan,
  getCameraSmoothingFactor,
  getPanToKeepWorldPoint,
  getSoftBoundedPan,
  getViewportPanBounds,
  normalizeStudentMapWheelDelta,
  STUDENT_MAP_MIN_ZOOM,
  STUDENT_MAP_ZOOM_STEP,
} from "../lib/mapViewport";
import { campusGroundAppearance } from "../lib/campusCanvas";
import { routeEndpointFromSearchResult } from "../lib/routeEndpoints";
import { outdoorWalkingDistance, walkingAnimationDuration } from "../lib/walkingAnimation";
import { planStudentEmergencyRoute } from "../lib/studentEmergencyNavigation";
import { doorEntranceLinkStatus, entryFloorForBuilding } from "../lib/entranceTransitions";
import { entranceWorldPosition, normalizeEntranceDirection } from "../lib/buildingEntrances";
import { mapBackAction, publishMapSurface, type MapSurface } from "../lib/mapSurface";
import { getStudentFloorInspectionSlack, getStudentOutdoorInspectionSlack, getStudentOverviewCamera, getStudentRoomFocusCamera, getStudentRoomFocusProgress } from "../lib/studentMapCamera";
import { getFloorShapeBounds, getFloorShapeRegions } from "../lib/floorShape";
import { roomOutlinePoints, roomShapeBounds } from "../lib/roomShape";
import { authoredNavigableRoomKeys, authoredRoomNavigationKey } from "../lib/roomNavigationMembership";
import {
  RoutePlannerDialog, RouteStepsPanel, RouteMapOverlay,
  ReportModal, SignInPrompt, LocationQRScanner,
  BuildingInfoPanel, MobileBuildingSheet, MobileMapAccountMenu, StudentFloorPicker, StudentSelectedPlaceCard, CampusPlaceDetails,
  type MobileBuildingSheetState,
  StudentMapControls,
} from "../components/map";
import { studentAccountService } from "../services/studentAccountService";
import { DEFAULT_PUBLIC_PLATFORM_SETTINGS, settingsService, type PublicPlatformSettings } from "../services/settingsService";
import { usageAnalyticsService } from "../services/usageAnalyticsService";
import type {
  Campus as EditorCampus,
  CampusMarker,
  FloorPlan,
  FloorRoom,
  NavigationNode,
} from "../components/map-builder/types";
import { ReadonlyOutdoorCampusScene } from "../components/map-builder/ReadonlyOutdoorVisuals";
import { ReadonlyFloorPlanScene, readonlyFloorPlanViewport } from "../components/map-builder/ReadonlyFloorPlanVisuals";
import { EventPreviewLayer } from "../components/map/EventPreviewLayer";
import { EventMapPanel } from "../components/map/EventMapPanel";
import { EventVenueLayer } from "../components/map/EventVenueLayer";
import { useEventMapPreviews } from "../hooks/useEventMapPreviews";
import { resolveEventLocation, selectedEventLocation, toEventOverlayPreview } from "../lib/eventMapView";
import type { EventMapFilter } from "../types/eventPreview";
import { ComingSoonCampusScreen } from "../components/map/ComingSoonCampusScreen";

type CampusLocationQrPayload = {
  locationId: string;
  campusId?: string;
  buildingId?: string;
  floorId?: string;
  floorNumber?: number;
  locationType?: "room";
};

type CampusLocationQrResolution =
  | { kind: "outdoor"; point: Pt; label: string; buildingId?: string }
  | {
      kind: "indoor";
      point: Pt;
      label: string;
      buildingId?: string;
      floorId?: string;
      floorNumber?: number;
      roomId?: string;
      room?: RoomDest;
    };

function roomDestinationFromLocationQr(
  building: EditorCampus["buildings"][number],
  floor: FloorPlan,
  room: FloorRoom,
): RoomDest {
  return {
    type: "room",
    buildingId: building.id,
    floorNumber: floor.number,
    roomId: room.id,
    roomName: room.name,
    buildingLabel: building.name,
    buildingCode: building.code,
    floorLabel: floor.label,
    accessNodeId: room.accessNodeId,
    accessDoorId: room.accessDoorId,
    accessDoorIds: room.accessDoorIds,
  };
}

function resolveRoomLocationQr(
  campus: EditorCampus,
  locationId: string,
  context?: Pick<CampusLocationQrPayload, "buildingId" | "floorId" | "floorNumber">,
): CampusLocationQrResolution | null {
  for (const building of campus.buildings) {
    if (context?.buildingId && context.buildingId !== building.id) continue;
    for (const floor of building.floors) {
      if (context?.floorId && context.floorId !== floor.id) continue;
      if (context?.floorNumber !== undefined && context.floorNumber !== floor.number) continue;
      const room = floor.rooms.find((candidate) => candidate.id === locationId);
      if (!room) continue;
      const roomDestination = roomDestinationFromLocationQr(building, floor, room);
      return {
        kind: "indoor",
        point: { x: room.x + room.w / 2, y: room.y + room.h / 2 },
        label: `${building.name} · ${floor.label || `Floor ${floor.number}`} · ${room.name}`,
        buildingId: building.id,
        floorId: floor.id,
        floorNumber: floor.number,
        roomId: room.id,
        room: roomDestination,
      };
    }
  }
  return null;
}

function resolveCampusLocationQr(
  campus: EditorCampus,
  locationId: string,
  context?: Pick<CampusLocationQrPayload, "buildingId" | "floorId" | "floorNumber" | "locationType">,
): CampusLocationQrResolution | null {
  if (context?.locationType === "room") {
    return resolveRoomLocationQr(campus, locationId, context);
  }

  const node = campus.navNodes?.find((candidate) => candidate.id === locationId);
  if (node) {
    if (node.floorId) {
      const building = campus.buildings.find((candidate) => candidate.id === node.buildingId);
      const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
      const room = node.roomId ? floor?.rooms.find((candidate) => candidate.id === node.roomId) : undefined;
      const roomDestination = building && floor && room
        ? roomDestinationFromLocationQr(building, floor, room)
        : undefined;
      return {
        kind: "indoor",
        point: { x: node.x, y: node.y },
        label: [building?.name, floor?.label ?? (floor ? `Floor ${floor.number}` : undefined), room?.name ?? node.name].filter(Boolean).join(" · ") || node.name,
        buildingId: building?.id,
        floorId: floor?.id ?? node.floorId,
        floorNumber: floor?.number,
        roomId: room?.id,
        room: roomDestination,
      };
    }
    const building = campus.buildings.find((candidate) => candidate.id === node.buildingId);
    return {
      kind: "outdoor",
      point: { x: node.x, y: node.y },
      label: [building?.name, node.name].filter(Boolean).join(" · ") || node.name,
      buildingId: building?.id,
    };
  }

  const entranceMatch = campus.buildings.flatMap((building) =>
    (building.entrances ?? []).map((entrance) => ({ building, entrance })),
  ).find(({ entrance }) => entrance.id === locationId);
  if (entranceMatch) {
    const { building, entrance } = entranceMatch;
    const entranceNode = campus.navNodes?.find((candidate) =>
      !candidate.floorId && (candidate.entranceId === entrance.id || candidate.buildingEntranceId === entrance.id),
    ) ?? campus.navNodes?.find((candidate) =>
      candidate.entranceId === entrance.id || candidate.buildingEntranceId === entrance.id,
    );
    if (entranceNode?.floorId) {
      const floor = building.floors.find((candidate) => candidate.id === entranceNode.floorId);
      const room = entranceNode.roomId ? floor?.rooms.find((candidate) => candidate.id === entranceNode.roomId) : undefined;
      const roomDestination = floor && room ? roomDestinationFromLocationQr(building, floor, room) : undefined;
      return {
        kind: "indoor",
        point: { x: entranceNode.x, y: entranceNode.y },
        label: [building.name, floor?.label ?? (floor ? `Floor ${floor.number}` : undefined), room?.name ?? entrance.name].filter(Boolean).join(" · "),
        buildingId: building.id,
        floorId: floor?.id ?? entranceNode.floorId,
        floorNumber: floor?.number,
        roomId: room?.id,
        room: roomDestination,
      };
    }
    const worldEntrance = entranceWorldPosition(building, entrance);
    const point = entranceNode ? { x: entranceNode.x, y: entranceNode.y } : { x: worldEntrance.x, y: worldEntrance.y };
    return {
      kind: "outdoor",
      point,
      label: `${building.name} · ${entrance.name ?? (entrance.isPrimary ? "Main Entrance" : "Entrance")}`,
      buildingId: building.id,
    };
  }

  const roomLocation = resolveRoomLocationQr(campus, locationId, context);
  if (roomLocation) return roomLocation;

  const normalizedId = locationId.toLowerCase();
  const building = campus.buildings.find((candidate) =>
    candidate.id === locationId || candidate.code.toLowerCase() === normalizedId,
  );
  if (!building) return null;

  const primaryEntrance = building.entrances?.find((entrance) => entrance.isPrimary) ?? building.entrances?.[0];
  const entranceNode = building.entranceNodeId
    ? campus.navNodes?.find((candidate) => candidate.id === building.entranceNodeId && !candidate.floorId)
    : primaryEntrance
      ? campus.navNodes?.find((candidate) =>
          !candidate.floorId && (candidate.entranceId === primaryEntrance.id || candidate.buildingEntranceId === primaryEntrance.id),
        )
      : undefined;
  const point = entranceNode
    ? { x: entranceNode.x, y: entranceNode.y }
    : building.entrance
      ? { x: building.entrance.x, y: building.entrance.y }
      : { x: building.x + building.width / 2, y: building.y + building.height / 2 };
  const entranceLabel = entranceNode?.name ?? primaryEntrance?.name ?? building.entrance?.label;
  return {
    kind: "outdoor",
    point,
    label: entranceLabel ? `${building.name} · ${entranceLabel}` : building.name,
    buildingId: building.id,
  };
}

function campusPlaceDestination(place: CampusMarker, campus: EditorCampus | null | undefined): CampusPlaceDest | null {
  if (!campus) return null;
  const node = campus.navNodes?.find((candidate) => candidate.id === place.navNodeId || candidate.gateId === place.id);
  if (!node || (node.gateId && node.gateId !== place.id)) return null;
  return {
    type: "campus_place",
    campusPlaceId: place.id,
    label: place.name || "Campus place",
    code: place.name || "Campus place",
    nodeId: node.id,
    accessible: node.accessible,
  };
}

function campusPlaceCanRoute(place: CampusMarker, campus: EditorCampus | null | undefined, direction: "inbound" | "outbound"): boolean {
  const destination = campusPlaceDestination(place, campus);
  if (!destination || !campus) return false;
  const nodeIds = new Set((campus.navNodes ?? []).map((node) => node.id));
  return (campus.navEdges ?? []).some((edge) => !edge.closed
    && nodeIds.has(edge.startNodeId)
    && nodeIds.has(edge.endNodeId)
    && (direction === "outbound"
      ? edge.startNodeId === destination.nodeId || (edge.bidirectional && edge.endNodeId === destination.nodeId)
      : edge.endNodeId === destination.nodeId || (edge.bidirectional && edge.startNodeId === destination.nodeId)));
}

function parseLocationQrPayload(value: string): CampusLocationQrPayload | null {
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw, window.location.origin);
    const isAbsoluteWebUrl = /^https?:\/\//i.test(raw);
    const isMapLink = /(?:^|\/)map\/?$/.test(url.pathname);
    // QR codes may be printed from localhost or another LAN hostname while
    // the student opens NaviSync through a different host. We only consume
    // location identifiers from a map link; this does not navigate to its host.
    if (isAbsoluteWebUrl && !isMapLink) return null;
    const locationId = url.searchParams.get("locationId")
      ?? url.searchParams.get("buildingId");
    if (locationId) {
      const floorNumberValue = url.searchParams.get("floorNumber");
      const floorNumber = floorNumberValue === null ? undefined : Number(floorNumberValue);
      return {
        locationId: locationId.trim(),
        campusId: url.searchParams.get("campusId") ?? undefined,
        buildingId: url.searchParams.get("buildingId") ?? undefined,
        floorId: url.searchParams.get("floorId") ?? undefined,
        floorNumber: Number.isFinite(floorNumber) ? floorNumber : undefined,
        locationType: url.searchParams.get("locationType") === "room" ? "room" : undefined,
      };
    }
    if (isAbsoluteWebUrl) return null;
  } catch {
    // Printed markers may contain the opaque location ID directly.
  }

  return { locationId: raw };
}

type MapMode  = "standard" | "accessible" | "emergency";
type NavigationPhase = "idle" | "origin-indoor" | "outdoor" | "destination-indoor";

// ── Remember last viewed building (frozen-spec enhancement) ───────────────
const LAST_VIEWED_KEY = "plv-last-viewed";
const PLATFORM_SETTINGS_TIMEOUT_MS = 500;

function saveLastViewed(state: { buildingId: string; zoom: number }): void {
  try {
    localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify({ ...state, ts: Date.now() }));
  } catch {
    // Best-effort persistence.
  }
}

function loadLastViewed(): { buildingId: string; zoom: number } | null {
  try {
    const raw = localStorage.getItem(LAST_VIEWED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.buildingId === "string") {
      return {
        buildingId: parsed.buildingId,
        zoom: typeof parsed.zoom === "number" ? parsed.zoom : 1,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Map constants ──────────────────────────────────────────────────────────
const SVG_W  = 900;
const SVG_H  = 680;
const FP_W   = 440;  // floor plan viewBox width
const FP_H   = 290;  // floor plan viewBox height
const DEFAULT_OUTDOOR_ZOOM = 1;
const MOBILE_OUTDOOR_VIEWER_INSETS = { top: 176, right: 64, bottom: 132, left: 8 };
const MOBILE_FLOOR_VIEWER_INSETS = { top: 88, right: 8, bottom: 112, left: 8 };
interface Pt { x: number; y: number; }

/**
 * Append the indoor "enter building → room" leg to a planned outdoor route
 * that ends at the destination building. Used when the student navigates to
 * a specific room/floor inside a building: the outdoor walk plays first,
 * then the map auto-enters the floor plan (see the walk-arrival effect).
 */
function withDestinationRoomLeg(
  planned: PlannedRoute,
  target: RoomDest,
  targetFloor: FloorPlan | undefined,
  activeCampus: EditorCampus | null,
  floorRooms: RoomLike[] | undefined,
  accessibleOnly: boolean,
  emergencyOnly = false,
): PlannedRoute | null {
  // Once an admin has authored any navigation graph data, that graph is the
  // contract for student routing. A disconnected room must stay disconnected
  // so the UI can explain what the map builder needs to connect; a synthetic
  // line through a room would look like a valid route and bypass authoring.
  const hasAuthoredNavigationGraph = Boolean(
    activeCampus
    && ((activeCampus.navNodes?.length ?? 0) > 0 || (activeCampus.navEdges?.length ?? 0) > 0),
  );
  const adminIndoor = targetFloor && activeCampus
    ? findPublishedIndoorRoute(activeCampus, target.buildingId, targetFloor, target.roomId, accessibleOnly, emergencyOnly)
    : null;
  const entryFloor = activeCampus?.buildings
    .find((building) => building.id === target.buildingId)
    ?.floors[0];
  const indoor = adminIndoor ?? (!hasAuthoredNavigationGraph && floorRooms && floorRooms.length > 0
    ? findIndoorRouteForFloor(
        target.buildingId,
        target.floorNumber,
        target.roomId,
        floorRooms,
        accessibleOnly,
        targetFloor?.id === entryFloor?.id || target.floorNumber === 1 ? "lobby" : "vertical",
        targetFloor ? mainIndoorDoorPoint(targetFloor) : undefined,
      )
    : null);

  if (hasAuthoredNavigationGraph && !indoor) return null;

  const buildingName = target.buildingCode || target.buildingLabel;
  const extraSteps: RouteStep[] = [
    { id: "enter-bldg", icon: "enter", instruction: `Enter ${buildingName} building.` },
  ];
  if (target.floorNumber > 1) {
    extraSteps.push({
      id: "change-floor",
      icon: "stairs",
      instruction: emergencyOnly
        ? `Take the emergency stairs to Floor ${target.floorNumber}.`
        : `Go to the stairs or elevator and continue to Floor ${target.floorNumber}.`,
    });
  }
  if (indoor) {
    extraSteps.push({
      id: "indoor-room-door",
      icon: "walk",
      instruction: `Follow the indoor path to the door of ${target.roomName}.`,
    });
  } else {
    extraSteps.push({ id: "arrive-room", icon: "arrive", instruction: `Arrive at ${target.roomName}` });
  }

  const extraDist = indoor?.distanceMeters ?? 0;
  const extraSeconds = indoor?.estimatedSeconds ?? 0;
  const indoorSegment = indoor
    ? {
        buildingId: target.buildingId,
        floorId: targetFloor?.id,
        floorNumber: target.floorNumber,
        waypoints: indoor.waypoints.map(({ x, y }) => ({ x, y })),
        distanceM: indoor.distanceMeters,
        seconds: indoor.estimatedSeconds,
        steps: [{
          id: "legacy-indoor-room-door",
          icon: "walk" as const,
          instruction: `Follow the indoor path to the door of ${target.roomName}.`,
          distanceM: indoor.distanceMeters,
        }],
      }
    : null;
  return {
    ...planned,
    campusPoints: planned.campusPoints ?? planned.points,
    indoorSegments: indoorSegment
      ? [...(planned.indoorSegments ?? []), indoorSegment]
      : planned.indoorSegments,
    dist: Math.round(planned.dist + extraDist),
    mins: Math.max(1, Math.round((planned.mins * 60 + extraSeconds) / 60)),
    steps: [...planned.steps, ...extraSteps],
    transitions:
      target.floorNumber > 1
        ? [...(planned.transitions ?? []), `Take the stairs/elevator to Floor ${target.floorNumber}`]
        : planned.transitions,
    destinationRoom: {
      buildingId: target.buildingId,
      floorNumber: target.floorNumber,
      roomId: target.roomId,
    },
  };
}

function indoorRouteFromSegment(segment: RouteIndoorSegment): IndoorRoute | null {
  if (segment.waypoints.length === 0) return null;
  return {
    waypoints: segment.waypoints.map((point) => ({ ...point })),
    steps: segment.steps.map((step) => step.instruction),
    distanceMeters: segment.distanceM,
    estimatedSeconds: Math.max(1, segment.seconds),
  };
}

type PublishedBuildingFloorLookup = {
  floors?: Array<{ id: string; number?: number }>;
};

/** Keep destination-building floor legs in the exact order authored by the
 * graph. A room on Floor 2 normally produces [Ground Floor, Floor 2]; taking
 * only the target-floor segment would visually teleport the student past the
 * connected stairs. */
function indoorSegmentsForBuilding(
  route: PlannedRoute | null | undefined,
  buildingId: string | undefined,
  phase: "all" | "before-outdoor" | "after-outdoor" = "all",
): RouteIndoorSegment[] {
  if (!route || !buildingId) return [];
  return (route.indoorSegments ?? []).filter((segment) =>
    segment.buildingId === buildingId && segment.waypoints.length >= 1
    && (phase === "all" || (phase === "after-outdoor") === Boolean(segment.afterOutdoor)),
  );
}

function indoorSegmentFloorNumber(
  segment: RouteIndoorSegment | undefined,
  building: PublishedBuildingFloorLookup | undefined,
  fallback?: number,
): number | undefined {
  if (!segment) return fallback;
  if (typeof segment.floorNumber === "number") return segment.floorNumber;
  if (segment.floorId) {
    const floor = building?.floors?.find((candidate) => candidate.id === segment.floorId);
    if (typeof floor?.number === "number") return floor.number;
  }
  return fallback;
}

/**
 * Append the admin-authored indoor leg. Legacy floor-layout routing is only
 * retained for campuses that have no navigation graph at all; once an admin
 * starts authoring nav data, missing room connectivity is reported as no route.
 */
function mainIndoorDoorPoint(floor: { doors?: Array<{ x: number; y: number; label?: string }> } | null | undefined) {
  const door = floor?.doors?.find((candidate) => {
    const label = candidate.label?.toLowerCase() ?? "";
    return label.includes("lobby entrance")
      || label.includes("main entrance")
      || label.includes("main door")
      || label.includes("main gate")
      || label.includes("primary")
      || label === "entrance";
  });
  return door ? { x: door.x, y: door.y } : undefined;
}

/**
 * Resolve the admin-authored indoor Door connected to the building's primary
 * outdoor Entrance. This is intentionally a Door node, not the room center or
 * a nearest service room: the floor route must begin at the actual building
 * entrance used by the outdoor route.
 */
function mainIndoorEntryNode(campus: EditorCampus, buildingId: string): NavigationNode | null {
  const building = campus.buildings.find((candidate) => candidate.id === buildingId);
  const entryFloor = building?.floors?.[0];
  const nodes = campus.navNodes ?? [];
  const edges = campus.navEdges ?? [];
  if (!building || !entryFloor) return null;

  const entranceMetadata = new Map((building.entrances ?? []).map((entrance) => [entrance.id, entrance]));
  const transitionCandidates = edges.flatMap((edge) => {
    if (edge.type !== "entrance_transition") return [];
    const start = nodes.find((node) => node.id === edge.startNodeId);
    const end = nodes.find((node) => node.id === edge.endNodeId);
    const entrance = start?.buildingId === buildingId
      && !start.floorId
      && (start.id === building.entranceNodeId || start.entranceId)
      ? start
      : end?.buildingId === buildingId
        && !end.floorId
        && (end.id === building.entranceNodeId || end.entranceId)
        ? end
        : undefined;
    const door = start?.doorId && start.floorId
      ? start
      : end?.doorId && end.floorId
        ? end
        : undefined;
    if (
      !entrance
      || !door
      || entrance.buildingId !== buildingId
      || door.buildingId !== buildingId
      || door.floorId !== entryFloor.id
    ) return [];
    const metadata = entrance.entranceId ? entranceMetadata.get(entrance.entranceId) : undefined;
    const label = `${entrance.name} ${metadata?.name ?? ""}`.toLowerCase();
    const score =
      (entrance.id === building.entranceNodeId ? 2000 : 0)
      + (metadata?.isPrimary ? 1000 : 0)
      + (metadata?.type === "general" || metadata?.type === "main" ? 250 : 0)
      + (label.includes("main") || label.includes("primary") || label.includes("lobby") ? 100 : 0)
      - (metadata?.type === "service" ? 50 : 0)
      - (metadata?.type === "emergency_exit" || metadata?.type === "emergency" ? 500 : 0);
    return [{ door, score }];
  });
  if (transitionCandidates.length > 0) {
    transitionCandidates.sort((a, b) => b.score - a.score);
    return transitionCandidates[0].door;
  }

  // Older maps may have linked Door nodes but no explicit Entrance transition
  // yet. Prefer a clearly labelled main/lobby door before using any generic
  // floor node, and let the legacy layout fallback handle incomplete graphs.
  const mainDoor = entryFloor.doors?.find((door) => {
    const label = door.label?.toLowerCase() ?? "";
    return label.includes("lobby entrance")
      || label.includes("main entrance")
      || label.includes("main door")
      || label.includes("main gate")
      || label.includes("primary")
      || label === "entrance";
  });
  if (mainDoor) {
    const linkedDoor = nodes.find((node) =>
      node.buildingId === buildingId
      && node.floorId === entryFloor.id
      && node.doorId === mainDoor.id
    );
    if (linkedDoor) return linkedDoor;
  }

  return nodes.find((node) =>
    node.buildingId === buildingId
    && node.floorId === entryFloor.id
    && node.type === "entrance"
  ) ?? null;
}

function findPublishedIndoorRoute(
  campus: EditorCampus,
  buildingId: string,
  targetFloor: FloorPlan,
  roomId: string,
  accessibleOnly: boolean,
  emergencyOnly = false,
): IndoorRoute | null {
  const entryNode = mainIndoorEntryNode(campus, buildingId);
  const targetRoom = targetFloor.rooms.find((room) => room.id === roomId);
  if (!entryNode || !targetRoom) return null;

  return findIndoorRouteFromNavigationGraph(
    campus.navNodes,
    campus.navEdges,
    {
      buildingId,
      floorId: targetFloor.id,
      roomId,
      roomName: targetRoom.name,
      accessNodeId: targetRoom.accessNodeId,
      accessDoorIds: [
        ...(targetRoom.accessDoorId ? [targetRoom.accessDoorId] : []),
        ...(targetRoom.accessDoorIds ?? []),
      ],
    },
    entryNode.id,
    accessibleOnly,
    targetFloor.calibration?.metersPerUnit,
    emergencyOnly,
  );
}

function fallbackIndoorRoute(
  targetRoomId: string,
  rooms: RoomLike[],
  entryPoint?: { x: number; y: number }
): IndoorRoute | null {
  const target = rooms.find((room) => room.id === targetRoomId);
  if (!target) return null;

  const targetPoint = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const entry = rooms.find((room) => room.type === "lobby")
    ?? rooms.find((room) => room.type === "elevator" || room.type === "stairs");
  const startPoint = entryPoint
    ?? (entry
      ? { x: entry.x + entry.w / 2, y: entry.y + entry.h }
      : { x: targetPoint.x, y: Math.max(0, target.y - 35) }
  );
  const bendPoint = { x: targetPoint.x, y: startPoint.y };
  const waypoints = [startPoint, bendPoint, targetPoint].filter((point, index, all) =>
    index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y
  );
  const distance = waypoints.slice(1).reduce((sum, point, index) => {
    const previous = waypoints[index];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);

  return {
    waypoints,
    steps: [`Walk to ${target.name}`],
    distanceMeters: Number(distance.toFixed(1)),
    estimatedSeconds: Math.max(1, Math.round(distance / 1.2)),
  };
}



// ═════════════════════════════════════════════════════════════════════════════
export interface CampusMapPageProps {
  /** Candidate campus supplied by Admin Student Preview. */
  previewCampus?: EditorCampus | null;
  /** Remove the public-layout header offset when embedded full-screen. */
  fullScreen?: boolean;
  /** Allow an admin preview shell to reserve space for its own toolbar. */
  fullScreenHeight?: string;
}

export function CampusMapPage({ previewCampus = null, fullScreen = false, fullScreenHeight }: CampusMapPageProps = {}) {
  const navigate = useNavigate();
  const studentAuth = useStudentAuth();
  const { error: showError, warning: showWarning, success: showSuccess } = useToast();
  const publishedCampusState = usePublishedCampus(previewCampus);

  const {
    campuses: availableCampuses,
    activeCampus,
    selectedCampusId,
    setSelectedCampusId,
    loading: isCampusLoading,
    error: campusError,
    isEmpty: isCampusEmpty,
    isCached: isCampusCached,
    refetch: refetchCampus,
  } = publishedCampusState;

  // ── Buildings derived exclusively from the published campus ──
  const MOCK_BUILDINGS = useMemo(() => {
    if (activeCampus) {
      return buildingsFromCampus(activeCampus);
    }
    return [];
  }, [activeCampus]);

  const B_POS = useMemo<Record<string, {x:number;y:number;w:number;h:number;color:string}>>(() => {
    if (activeCampus) {
      return buildingPositionsFromCampus(activeCampus);
    }
    return {};
  }, [activeCampus]);

  const FLOOR_PLANS = useMemo(() => {
    if (activeCampus) {
      return floorPlansFromCampus(activeCampus);
    }
    return {};
  }, [activeCampus]);

  // Canonical authored outdoor data is the source of truth whenever a saved
  // Campus (or Preview candidate) is available.  The legacy adapter above is
  // retained for the existing Student route/search contracts and for the
  // no-campus compatibility fallback, but it no longer owns the physical
  // outdoor rendering.
  const readonlyOutdoorCampus = useMemo(
    () => activeCampus ? projectReadonlyOutdoorCampus(activeCampus) : null,
    [activeCampus],
  );

  const BUILDING_FACILITIES: Record<string, string[]> = useMemo(() => {
    if (activeCampus) {
      return facilitiesFromCampus(activeCampus);
    }
    return {};
  }, [activeCampus]);

  const BUILDING_ACCESSIBILITY: Record<string, string[]> = useMemo(() => {
    if (activeCampus) {
      return accessibilityFromCampus(activeCampus);
    }
    return {};
  }, [activeCampus]);

  // Core map state
  const [selected,     setSelected]     = useState<Building|null>(null);
  const [selectedCampusPlaceId, setSelectedCampusPlaceId] = useState<string | null>(null);
  const selectedCampusPlace = useMemo(() => activeCampus?.markers.find((marker) => marker.id === selectedCampusPlaceId) ?? null, [activeCampus, selectedCampusPlaceId]);
  const [mobileBuildingSheetState, setMobileBuildingSheetState] = useState<MobileBuildingSheetState>("default");
  const [mapMode,      setMapMode]      = useState<MapMode>("standard");
  const [platformSettings, setPlatformSettings] = useState<PublicPlatformSettings>(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
  const [platformSettingsReady, setPlatformSettingsReady] = useState(false);
  const [zoom,         setZoom]         = useState(DEFAULT_OUTDOOR_ZOOM);
  const zoomRef = useRef(DEFAULT_OUTDOOR_ZOOM);
  const [displayZoom,  setDisplayZoom]  = useState(1);
  const displayZoomRef = useRef(1);
  const [pan,          setPan]          = useState<Pt>({ x:0, y:0 });
  const [saved,        setSaved]        = useState<Set<string>>(new Set());
  const animFrameRef   = useRef<number>(undefined);

  // Load initial bookmarked buildings from studentAccountService
  useEffect(() => {
    Promise.all([
      studentAccountService.getSavedBuildings(MOCK_BUILDINGS),
      studentAccountService.getSavedCampusPlaceIdsAsync(),
    ]).then(([buildings, campusPlaceIds]) => {
      const idSet = new Set<string>();
      buildings.forEach((b) => {
        idSet.add(b.id);
        if (b.code) {
          idSet.add(b.code);
          idSet.add(b.code.toLowerCase());
        }
      });
      campusPlaceIds.forEach((id) => idSet.add(`campus-place:${id}`));
      setSaved(idSet);
    });
  }, [MOCK_BUILDINGS]);

  // Floor plan state (replaces buildingView — floor plans now render in the main SVG)
  const [floorView,       setFloorView]       = useState<{ building: Building; floor: number }|null>(null);
  const [hoveredRoom,     setHoveredRoom]     = useState<string|null>(null);
  const [highlightedRoom, setHighlightedRoom] = useState<string|null>(null);
  const [selectedRoomContext, setSelectedRoomContext] = useState<RoomDest | null>(null);
  const [routePlannerEndpoint, setRoutePlannerEndpoint] = useState<"start" | "destination" | null>(null);
  const [stairLoading,    setStairLoading]    = useState<{ dir:"up"|"down"; label:string }|null>(null);
  const [stairChoice,     setStairChoice]     = useState<{
    roomType: RoomType; upFloor: number|null; dnFloor: number|null; upLabel: string; dnLabel: string;
  }|null>(null);
  const [showCampusSelector, setShowCampusSelector] = useState(false);
  const [campusTransitioning, setCampusTransitioning] = useState(false);
  const transitioningRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initialSelectionRef = useRef(false);
  const previousCampusSelectionRef = useRef<string | null>(null);
  const [indoorRoute, setIndoorRoute] = useState<IndoorRoute | null>(null);
  // Destination-room routes can contain several floor-local legs in one
  // building. Keep the active leg explicit so a floor-2 destination starts
  // on the ground-floor entrance segment and advances through the authored
  // stairs/transition before rendering the upper-floor segment.
  const [destinationIndoorSegments, setDestinationIndoorSegments] = useState<RouteIndoorSegment[]>([]);
  const [destinationIndoorSegmentIndex, setDestinationIndoorSegmentIndex] = useState(-1);
  const destinationIndoorTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [originIndoorSegments, setOriginIndoorSegments] = useState<RouteIndoorSegment[]>([]);
  const [originIndoorSegmentIndex, setOriginIndoorSegmentIndex] = useState(-1);
  const originIndoorTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeRouteRoom, setActiveRouteRoom] = useState<string | null>(null);
  const [showArrival, setShowArrival] = useState(false);
  const [routeFading, setRouteFading] = useState(false);
  const [navigationTransitioning, setNavigationTransitioning] = useState(false);
  // Explicitly track which leg owns the animated walking icon. This prevents
  // a room-origin route from jumping straight to the outdoor campus leg.
  const [navigationPhase, setNavigationPhase] = useState<NavigationPhase>("idle");

  // Floating UI state
  const [search,         setSearch]         = useState("");
  const debouncedSearch = useDebounce(search, 150);
  const [searchFocused,  setSearchFocused]  = useState(false);
  const searchFocusedRef = useRef(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const suppressSearchDismissClickRef = useRef(false);
  const searchDismissClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [directionsMode, setDirectionsMode] = useState(false);
  const directionsWasOpenRef = useRef(false);
  const routeModeTouchedRef = useRef(false);
  const [fromBuilding,   setFromBuilding]   = useState<Building|null>(null);
  const [toBuilding,     setToBuilding]     = useState<Building|null>(null);
  const [fromCampusPlace, setFromCampusPlace] = useState<CampusPlaceDest | null>(null);
  const [toCampusPlace, setToCampusPlace] = useState<CampusPlaceDest | null>(null);
  // A room can be the true origin just as a room can be the destination.
  // The building picker still carries the containing building for compatibility
  // with the planner UI, while route computation uses this authored endpoint.
  const [roomOrigin, setRoomOrigin] = useState<RoomDest | null>(null);
  // When set, the destination is a specific room/floor inside toBuilding.
  const [roomDestination, setRoomDestination] = useState<RoomDest | null>(null);

  // Manual dropped-pin start state
  const [youAreHere,    setYouAreHere]    = useState<{ x: number; y: number } | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null);
  const [indoorQrLocation, setIndoorQrLocation] = useState<Extract<CampusLocationQrResolution, { kind: "indoor" }> | null>(null);
  const [pinning,       setPinning]       = useState(false);
  const [useMyLocation, setUseMyLocation] = useState(false);
  // Walk animation progress 0..1
  const [walkProgress,  setWalkProgress]  = useState(0);
  const [walkNonce,     setWalkNonce]     = useState(0);
  const walkAnimRef = useRef<number | null>(null);
  const indoorWalkAnimRef = useRef<number | null>(null);
  const navigationTransitionAnimRef = useRef<number | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showQR,         setShowQR]         = useState(false);
  const [locationScannerOpen, setLocationScannerOpen] = useState(false);
  const [pendingLocationScan, setPendingLocationScan] = useState<(CampusLocationQrPayload & { campusId: string }) | null>(null);

  useEffect(() => {
    let mounted = true;
    const fallbackTimer = window.setTimeout(() => {
      if (mounted) setPlatformSettingsReady(true);
    }, PLATFORM_SETTINGS_TIMEOUT_MS);
    void settingsService.getPublicPlatformSettings().then((settings) => {
      if (!mounted) return;
      window.clearTimeout(fallbackTimer);
      setPlatformSettings(settings);
      setPlatformSettingsReady(true);
    }).catch(() => {
      if (mounted) {
        window.clearTimeout(fallbackTimer);
        setPlatformSettingsReady(true);
      }
    });
    return () => {
      mounted = false;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (directionsMode && !directionsWasOpenRef.current) routeModeTouchedRef.current = false;
    if (directionsMode && platformSettingsReady && !routeModeTouchedRef.current) {
      setMapMode(platformSettings.defaultRouteMode);
    }
    directionsWasOpenRef.current = directionsMode;
  }, [directionsMode, platformSettingsReady, platformSettings.defaultRouteMode]);

  // Unified Search Engine Hook for C3
  const campusSearch = useCampusSearch(activeCampus);

  const [showEventMaps, setShowEventMaps] = useState(false);
  const [eventOverlaysEnabled, setEventOverlaysEnabled] = useState(false);
  const eventMapTriggerRef = useRef<HTMLButtonElement>(null);
  const eventMapWasOpenRef = useRef(false);

  // Modals
  const [reportModal,   setReportModal]   = useState<Building|null>(null);
  const [reportCampusPlace, setReportCampusPlace] = useState<CampusMarker | null>(null);
  const [reportRoomContext, setReportRoomContext] = useState<{ floorId: string; roomId: string } | null>(null);
  const [signInPrompt,  setSignInPrompt]  = useState<string|null>(null);
  const wasCampusCachedRef = useRef(false);

  useEffect(() => {
    if (isCampusCached && !wasCampusCachedRef.current) {
      showWarning("Campus map refresh unavailable", {
        description: "Campus map could not refresh. Showing the latest available map.",
        duration: 6000,
        action: { label: "Refresh", onClick: () => { void refetchCampus(); } },
      });
    }
    wasCampusCachedRef.current = isCampusCached;
  }, [isCampusCached, refetchCampus, showWarning]);

  useEffect(() => { setMobileBuildingSheetState("default"); }, [selected?.id]);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const svgRef          = useRef<SVGSVGElement>(null);
  const cameraGroupRef  = useRef<SVGGElement>(null);
  const dragRef         = useRef<{ sx:number; sy:number; lx:number; ly:number; px:number; py:number; moved:boolean; vx:number; vy:number; lastTime:number }|null>(null);
  const inertiaRef      = useRef<number>(0);
  const panFrameRef     = useRef<number | null>(null);
  const pendingPanRef   = useRef<{ x: number; y: number; drag: NonNullable<typeof dragRef.current> } | null>(null);
  const zoomFrameRef    = useRef<number | null>(null);
  const pendingZoomRef  = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const cameraScreenScaleRef = useRef(1);
  const cameraViewportRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const cameraAnimationFrameRef = useRef<number | null>(null);
  const cameraAnimationModeRef = useRef<"programmatic" | "manual-wheel">("programmatic");
  const targetLogZoomRef = useRef(0);
  const manualWheelAnchorRef = useRef<{ viewPoint: Pt; worldPoint: Pt } | null>(null);
  const timedCameraMotionRef = useRef<{ fromPan: Pt; fromZoom: number; startedAt: number; durationMs: number } | null>(null);
  const roomFocusAnimationRef = useRef(false);
  const lastRoomFocusKeyRef = useRef<string | null>(null);
  const lastDestinationBuildingFocusKeyRef = useRef<string | null>(null);
  const targetCameraRef = useRef<{ pan: Pt; zoom: number }>({ pan: { x: 0, y: 0 }, zoom: 1 });
  const overviewCameraRef = useRef<{ pan: Pt; zoom: number }>({ pan: { x: 0, y: 0 }, zoom: 1 });
  const fittedCampusIdRef = useRef<string | null>(null);
  const fittedFloorIdRef = useRef<string | null>(null);
  const writeCameraTransformRef = useRef<(nextPan?: Pt, nextZoom?: number) => void>(() => {});
  const animateCameraToRef = useRef<(nextPan: Pt, nextZoom: number, source?: "room-focus" | "manual-wheel") => void>(() => {});
  const animateZoomAtRef = useRef<(clientX: number, clientY: number, nextZoom: number, source?: "manual-wheel") => void>(() => {});
  const searchFocusRef = useRef<{ buildingId?: string; roomId?: string; floorNumber?: number; campusPlaceId?: string } | null>(null);
  const [searchFocusNonce, setSearchFocusNonce] = useState(0);
  const panRef         = useRef<Pt>({ x: 0, y: 0 });
  // Latest route (kept in a ref so early callbacks like replayWalk can read it).
  const routeRef = useRef<PlannedRoute | null>(null);
  // Destination room the walk already entered (prevents re-opening the floor).
  const enteredRoomRef = useRef<string | null>(null);
  // ── Pinch-to-zoom ref ──
  const pinchRef       = useRef<{ dist: number; initZoom: number } | null>(null);
  // Pointer Events are the primary gesture path on modern mobile browsers.
  // Keep the touch handlers below as a fallback for older WebKit browsers.
  const pointerPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pointerPinchRef = useRef<{ dist: number; initZoom: number } | null>(null);
  const pointerGestureActiveRef = useRef(false);
  // ── Cursor-anchored zoom refs ──
  // Last known pointer position over the map (anchors keyboard zoom shortcuts
  // when there's no live cursor event to read).
  const zoomAnchorRef  = useRef<{ clientX: number; clientY: number } | null>(null);
  // Latest target zoom so repeated wheel/buttons input retargets one camera loop.
  const zoomStateRef   = useRef(DEFAULT_OUTDOOR_ZOOM);
  // Direct zoom is reserved for active pinch input; programmatic input animates.
  const applyZoomAtRef = useRef<(clientX: number, clientY: number, nextZoom: number, commitState?: boolean) => void>(() => {});

  /** Resolve the zoom anchor: last known cursor position over the map, falling
   *  back to the container center when the pointer never touched the map. */
  const zoomAtCursor = useCallback((nextZoom: number) => {
    const anchor = zoomAnchorRef.current;
    const el = mapContainerRef.current;
    if (anchor) {
      animateZoomAtRef.current(anchor.clientX, anchor.clientY, nextZoom);
    } else if (el) {
      const r = el.getBoundingClientRect();
      animateZoomAtRef.current(r.left + r.width / 2, r.top + r.height / 2, nextZoom);
    } else {
      setZoom(clampStudentMapZoom(nextZoom));
    }
  }, []);

  const resetMapCamera = useCallback(() => {
    const overview = overviewCameraRef.current;
    animateCameraToRef.current(overview.pan, overview.zoom);
  }, []);

  // Keep the latest target zoom readable by stable listeners.
  useEffect(() => { zoomStateRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const floorViewRef    = useRef(floorView);
  useEffect(() => { floorViewRef.current = floorView; }, [floorView]);

  const reducedMotion = useReducedMotion();

  useEffect(() => () => {
    [panFrameRef.current, zoomFrameRef.current, inertiaRef.current, cameraAnimationFrameRef.current]
      .forEach((frame) => { if (frame !== null && frame !== 0) cancelAnimationFrame(frame); });
  }, []);

  // Sync search input with campusSearch query
  useEffect(() => {
    campusSearch.setQuery(search);
  }, [search, campusSearch]);

  // Anonymous page-view tracking for usage analytics
  useEffect(() => {
    usageAnalyticsService.track("page_view", "map");
  }, []);

  // ── Computed floor plan values ─────────────────────────────────────────
  const isFloorMode       = floorView !== null;

  const dismissSearch = useCallback(() => {
    searchFocusedRef.current = false;
    setSearchFocused(false);
    mapContainerRef.current?.querySelector<HTMLInputElement>("[data-testid='student-map-search-panel'] input[role='searchbox']")?.blur();
  }, []);

  useEffect(() => {
    searchFocusedRef.current = searchFocused;
  }, [searchFocused]);

  const handleProfileMenuOpenChange = useCallback((open: boolean) => {
    setProfileMenuOpen(open);
    if (open) dismissSearch();
  }, [dismissSearch]);

  useEffect(() => {
    if (!searchFocused) return;
    const onOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-testid='student-map-search-panel']")) return;
      dismissSearch();
      // Tapping the profile trigger is an intentional handoff: close search,
      // then allow the trigger to open its anchored menu.
      if (target.closest("[data-testid='student-map-profile-trigger']")) return;
      suppressSearchDismissClickRef.current = true;
      if (searchDismissClickTimerRef.current) clearTimeout(searchDismissClickTimerRef.current);
      searchDismissClickTimerRef.current = setTimeout(() => { suppressSearchDismissClickRef.current = false; }, 700);
      event.preventDefault();
      event.stopPropagation();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dismissSearch();
    };
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", onOutsidePointer, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [dismissSearch, searchFocused]);

  useEffect(() => {
    const swallowDismissClick = (event: MouseEvent) => {
      if (suppressSearchDismissClickRef.current) {
        suppressSearchDismissClickRef.current = false;
        if (searchDismissClickTimerRef.current) clearTimeout(searchDismissClickTimerRef.current);
        searchDismissClickTimerRef.current = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Some embedded browsers and automated input paths deliver a click
      // without a paired pointerdown. Preserve the same safe dismissal rule.
      if (!searchFocusedRef.current) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-testid='student-map-search-panel']")) return;
      dismissSearch();
      if (target.closest("[data-testid='student-map-profile-trigger']")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", swallowDismissClick, true);
    return () => {
      document.removeEventListener("click", swallowDismissClick, true);
      if (searchDismissClickTimerRef.current) clearTimeout(searchDismissClickTimerRef.current);
    };
  }, [dismissSearch]);

  useLayoutEffect(() => {
    const surface = mapContainerRef.current;
    if (!surface) return;

    const updateOverlayLayout = () => {
      const surfaceRect = surface.getBoundingClientRect();
      const searchHeader = surface.querySelector<HTMLElement>("[data-map-search-header='true']");
      const searchHeaderRect = searchHeader?.getBoundingClientRect();
      const headerBottom = searchHeaderRect
        ? Math.max(0, searchHeaderRect.bottom - surfaceRect.top)
        : Math.max(52, (window.visualViewport?.offsetTop ?? 0) + 52 - surfaceRect.top);
      const safeTop = headerBottom + 16;
      surface.style.setProperty("--student-map-search-safe-top", `${Math.max(0, searchHeaderRect?.bottom ?? surfaceRect.top + headerBottom)}px`);
      surface.style.setProperty("--student-map-controls-safe-top", `${Math.max(0, surfaceRect.top + safeTop)}px`);
      surface.style.setProperty("--student-map-room-card-top", `${headerBottom + 10}px`);

      const roomCard = surface.querySelector<HTMLElement>("[data-testid='student-selected-place-card']");
      const roomCardRect = roomCard?.getBoundingClientRect();
      const roomCardBottom = roomCardRect ? roomCardRect.bottom - surfaceRect.top + 12 : safeTop;
      const floorPicker = surface.querySelector<HTMLElement>("[data-testid='student-floor-picker']");
      const floorTrigger = floorPicker?.querySelector<HTMLElement>("button[aria-haspopup='listbox']");
      if (floorTrigger && window.innerWidth < 768) {
        const menuBottom = floorTrigger.getBoundingClientRect().top - surfaceRect.top - 8;
        const menuTop = Math.max(safeTop, roomCardBottom);
        const maxMenuHeight = Math.max(64, Math.min(352, menuBottom - menuTop));
        surface.style.setProperty("--student-map-floor-menu-max-height", `${maxMenuHeight}px`);
      }
    };

    updateOverlayLayout();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverlayLayout);
    observer?.observe(surface);
    const searchHeader = surface.querySelector<HTMLElement>("[data-map-search-header='true']");
    if (searchHeader) observer?.observe(searchHeader);
    const roomCard = surface.querySelector<HTMLElement>("[data-testid='student-selected-place-card']");
    if (roomCard) observer?.observe(roomCard);
    const floorPicker = surface.querySelector<HTMLElement>("[data-testid='student-floor-picker']");
    if (floorPicker) observer?.observe(floorPicker);
    window.addEventListener("resize", updateOverlayLayout);
    window.visualViewport?.addEventListener("resize", updateOverlayLayout);
    window.visualViewport?.addEventListener("scroll", updateOverlayLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateOverlayLayout);
      window.visualViewport?.removeEventListener("resize", updateOverlayLayout);
      window.visualViewport?.removeEventListener("scroll", updateOverlayLayout);
    };
  }, [isFloorMode, selectedRoomContext?.roomId, searchFocused]);
  const mapSurface: MapSurface = directionsMode
    ? "route-planner"
    : (navigationPhase !== "idle" || navigationTransitioning)
      ? "route-active"
      : isFloorMode
        ? "floor-plan"
        : selected
          ? "building-details"
          : "browse";

  useEffect(() => {
    publishMapSurface(mapSurface);
    return () => {
      if (mapSurface !== "browse") publishMapSurface("browse");
    };
  }, [mapSurface]);

  useEffect(() => {
    const onPopState = () => {
      const action = mapBackAction(mapSurface, searchFocused);
      if (action === "leave") {
        if (window.location.pathname === "/" && studentAuth.isStudent) {
          navigate("/home", { replace: true });
        }
        return;
      }

      // React Router processes the browser pop before this listener can react.
      // Reconcile the route first so Back never leaves the map surface rendered
      // at a different URL (for example, Home content at /map).
      if (window.location.pathname !== "/map") {
        navigate("/map", { replace: true });
      }

      if (action === "close-search") {
        setSearchFocused(false);
        return;
      }

      if (directionsMode) {
        setDirectionsMode(false);
        setNavigationPhase("idle");
        setNavigationTransitioning(false);
        return;
      }
      if (isFloorMode) {
        setFloorView(null);
        setHighlightedRoom(null);
        setIndoorRoute(null);
        return;
      }
      setSelected(null);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [directionsMode, isFloorMode, mapSurface, navigate, searchFocused, studentAuth.isStudent]);
  // Use the actual FloorPlan from the published campus (authored in Map Builder)
  const activeFloorPlan   = useMemo(() => {
    if (!floorView || !activeCampus) return null;
    const building = activeCampus.buildings.find(b => b.id === floorView.building.id);
    if (!building) return null;
    return building.floors.find(f => f.number === floorView.floor) ?? building.floors[0] ?? null;
  }, [floorView, activeCampus]);
  const navigableRoomKeys = useMemo(() => authoredNavigableRoomKeys(activeCampus), [activeCampus]);
  const activeFloorOrdinal = useMemo(() => {
    if (!floorView || !activeCampus || !activeFloorPlan) return { index: 0, count: 1 };
    const building = activeCampus.buildings.find((candidate) => candidate.id === floorView.building.id);
    const floors = building?.floors ?? [];
    const index = floors.findIndex((candidate) => candidate.id === activeFloorPlan.id);
    return { index: Math.max(0, index), count: Math.max(1, floors.length) };
  }, [activeCampus, activeFloorPlan, floorView]);
  const interactiveExitDoorIds = useMemo(() => {
    if (!floorView || !activeCampus || !activeFloorPlan) return new Set<string>();
    const building = activeCampus.buildings.find((candidate) => candidate.id === floorView.building.id);
    if (!building) return new Set<string>();
    const entranceById = new Map((building.entrances ?? []).map((entrance) => [entrance.id, entrance]));
    return new Set((activeFloorPlan.doors ?? []).filter((door) => {
      if (door.visible === false || !door.buildingEntranceId) return false;
      const entrance = entranceById.get(door.buildingEntranceId);
      if (!entrance || normalizeEntranceDirection(entrance) === "entrance_only") return false;
      const link = doorEntranceLinkStatus(activeCampus, building.id, activeFloorPlan.id, door.id);
      return link.state === "linked" && link.entryFloor === true && link.hidden !== true;
    }).map((door) => door.id));
  }, [activeCampus, activeFloorPlan, floorView]);
  // Legacy floor data for stair navigation UI
  const currentFloorData  = floorView ? FLOOR_PLANS[floorView.building.id] : null;
  const currentFloor      = currentFloorData?.floors.find(f => f.number === floorView?.floor) ?? currentFloorData?.floors[0];
  const activeFloorBuilding = useMemo(
    () => floorView && activeCampus
      ? activeCampus.buildings.find((building) => building.id === floorView.building.id)
      : undefined,
    [activeCampus, floorView],
  );
  const interactiveFloorRoomIds = useMemo(() => new Set((activeFloorPlan?.rooms ?? [])
    .filter((room) => navigableRoomKeys.has(authoredRoomNavigationKey(
      activeFloorBuilding?.id ?? floorView?.building.id ?? "",
      activeFloorPlan?.id ?? "",
      room.id,
    )))
    .map((room) => room.id)), [activeFloorBuilding?.id, activeFloorPlan, floorView?.building.id, navigableRoomKeys]);
  useEffect(() => {
    if (!activeCampus || !selectedRoomContext) return;
    const building = activeCampus.buildings.find((candidate) => candidate.id === selectedRoomContext.buildingId);
    const floor = building?.floors.find((candidate) => candidate.number === selectedRoomContext.floorNumber);
    if (building && floor && navigableRoomKeys.has(authoredRoomNavigationKey(building.id, floor.id, selectedRoomContext.roomId))) return;
    setSelectedRoomContext(null);
    if (highlightedRoom === selectedRoomContext.roomId) setHighlightedRoom(null);
  }, [activeCampus, highlightedRoom, navigableRoomKeys, selectedRoomContext]);
  const activeFloorEntrances = useMemo(() => activeFloorBuilding?.entrances ?? [], [activeFloorBuilding]);
  const activeFloorExteriorStairs = useMemo(
    () => activeFloorBuilding?.exteriorEmergencyStairs ?? [],
    [activeFloorBuilding],
  );
  const availableFloorOptions = useMemo(() => {
    const publishedFloors = activeFloorBuilding?.floors ?? [];
    if (publishedFloors.length > 0) return publishedFloors.map((floor) => ({ number: floor.number, label: floor.label }));
    return currentFloorData?.floors.map((floor) => ({ number: floor.number, label: floor.label })) ?? [];
  }, [activeFloorBuilding, currentFloorData]);
  // The authored floor canvas can have semi-outdoor content (for example a
  // veranda) outside its 0..canvasW/H rectangle. Keep that content in the
  // student viewBox without changing any published object coordinates.
  const floorViewport = useMemo(
    () => readonlyFloorPlanViewport(activeFloorPlan, activeFloorExteriorStairs),
    [activeFloorPlan, activeFloorExteriorStairs],
  );

  // ── Student event map preview ─────────────────────────────────────────
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<EventMapFilter>("all");
  useEffect(() => {
    const foregroundOwnsMap = directionsMode || navigationTransitioning || navigationPhase !== "idle" || Boolean((selected || selectedCampusPlace) && !isFloorMode);
    if (showEventMaps && foregroundOwnsMap) {
      eventMapWasOpenRef.current = false;
      setShowEventMaps(false);
      return;
    }
    if (showEventMaps) eventMapWasOpenRef.current = true;
    else if (eventMapWasOpenRef.current) {
      eventMapWasOpenRef.current = false;
      eventMapTriggerRef.current?.focus();
    }
  }, [showEventMaps, directionsMode, navigationTransitioning, navigationPhase, selected?.id, selectedCampusPlace?.id, isFloorMode]);

  const floorLookupId =
    isFloorMode && floorView && currentFloor
      ? `${floorView.building.id}-f${currentFloor.number}`
      : null;

  useEffect(() => {
    if (!platformSettingsReady) return;
    setEventOverlaysEnabled(platformSettings.showApprovedEventOverlays);
  }, [platformSettingsReady, platformSettings.showApprovedEventOverlays]);

  const eventFeed = useEventMapPreviews({
    campusId: activeCampus?.id,
    enabled: eventOverlaysEnabled,
    open: showEventMaps,
    identityKey: studentAuth.profile?.id ?? "guest",
  });
  const selectedEventLocationData = selectedEventLocation(eventFeed.events, selectedEventId, selectedLocationId);
  const selectedEventOverlay = selectedEventLocationData
    ? toEventOverlayPreview(selectedEventLocationData.event, selectedEventLocationData.location)
    : null;

  useEffect(() => {
    if (selectedEventId && !eventFeed.events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
      setSelectedLocationId(null);
    } else if (selectedEventId && selectedLocationId && !selectedEventLocation(eventFeed.events, selectedEventId, selectedLocationId)) {
      setSelectedEventId(null);
      setSelectedLocationId(null);
    }
  }, [eventFeed.events, selectedEventId, selectedLocationId]);

  const selectEventLocation = useCallback((eventId: string, locationId: string) => {
    setSelectedEventId(eventId);
    setSelectedLocationId(locationId);
  }, []);

  const viewEventLocation = useCallback((eventId: string, locationId: string) => {
    if (!activeCampus) return;
    const event = eventFeed.events.find((item) => item.id === eventId);
    const location = event?.locations.find((item) => item.id === locationId);
    if (!event || !location) return;
    const resolved = resolveEventLocation(activeCampus, location.locationRef);
    if (!resolved) return;
    setSelectedEventId(eventId);
    setSelectedLocationId(locationId);
    if (resolved.kind === "campus") {
      setFloorView(null);
      return;
    }
    const building = MOCK_BUILDINGS.find((item) => item.id === resolved.buildingId);
    if (building) setFloorView({ building, floor: resolved.floorNumber });
  }, [activeCampus, eventFeed.events, MOCK_BUILDINGS]);

  const selectedLocationIsVisible = Boolean(selectedEventLocationData && (
    (!isFloorMode && selectedEventLocationData.location.locationRef.type === "campus") ||
    (isFloorMode && selectedEventLocationData.location.locationRef.floorId === floorLookupId)
  ));

  // SVG center shifts with mode (floor plan uses authored canvas, campus uses campus canvas)
  const outdoorCanvasW = activeCampus?.canvasW || SVG_W;
  const outdoorCanvasH = activeCampus?.canvasH || SVG_H;
  const viewCX = isFloorMode ? floorViewport.width / 2 : outdoorCanvasW / 2;
  const viewCY = isFloorMode ? floorViewport.height / 2 : outdoorCanvasH / 2;
  const tx = viewCX * (1 - displayZoom) + pan.x;
  const ty = viewCY * (1 - displayZoom) + pan.y;

  const writeCameraTransform = useCallback((nextPan = panRef.current, nextZoom = displayZoomRef.current) => {
    const group = cameraGroupRef.current;
    if (group) {
      const x = viewCX * (1 - nextZoom) + nextPan.x;
      const y = viewCY * (1 - nextZoom) + nextPan.y;
      if (isFloorMode) {
        // A CSS transform lets the browser composite the dense, static floor
        // scene as one camera layer instead of repainting every SVG node for
        // each zoom frame. Keep the same SVG user-space matrix as Outdoor.
        group.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${nextZoom})`;
      } else {
        group.setAttribute("transform", `translate(${x},${y}) scale(${nextZoom})`);
      }
    }
  }, [isFloorMode, viewCX, viewCY]);

  const commitCameraState = useCallback(() => {
    const currentPan = panRef.current;
    const currentZoom = displayZoomRef.current;
    targetCameraRef.current = { pan: { ...currentPan }, zoom: currentZoom };
    targetLogZoomRef.current = Math.log(currentZoom);
    manualWheelAnchorRef.current = null;
    zoomStateRef.current = currentZoom;
    zoomRef.current = currentZoom;
    setPan(currentPan);
    setDisplayZoom(currentZoom);
    setZoom(currentZoom);
  }, []);

  const cancelCameraAnimation = useCallback((commitCurrent = true) => {
    const frame = cameraAnimationFrameRef.current;
    const wasAnimating = frame !== null;
    if (frame !== null) {
      cancelAnimationFrame(frame);
      cameraAnimationFrameRef.current = null;
    }
    timedCameraMotionRef.current = null;
    manualWheelAnchorRef.current = null;
    cameraAnimationModeRef.current = "programmatic";
    targetCameraRef.current = { pan: { ...panRef.current }, zoom: displayZoomRef.current };
    targetLogZoomRef.current = Math.log(displayZoomRef.current);
    zoomStateRef.current = displayZoomRef.current;
    roomFocusAnimationRef.current = false;
    if (commitCurrent && wasAnimating) commitCameraState();
  }, [commitCameraState]);

  // Keep one authored coordinate system for every zoom level. The group
  // transform owns zoom and pan, which makes boundary clamping predictable
  // and keeps pointer coordinates aligned with the rendered map.
  const viewportCanvasW = isFloorMode ? floorViewport.width : outdoorCanvasW;
  const viewportCanvasH = isFloorMode ? floorViewport.height : outdoorCanvasH;
  const getScale = useCallback(() => {
    return cameraScreenScaleRef.current || 1;
  }, [viewportCanvasW]);
  const getMapPanBounds = useCallback((zoomValue = zoomRef.current) => {
    const rect = cameraViewportRectRef.current;
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
    const focusingMobileBuildingDestination = isMobileViewport
      && directionsMode
      && !isFloorMode
      && !roomDestination
      && Boolean(toBuilding);
    return getViewportPanBounds({
      mapWidth: viewportCanvasW,
      mapHeight: viewportCanvasH,
      viewportWidth: rect?.width || viewportCanvasW,
      viewportHeight: rect?.height || viewportCanvasH,
      zoom: zoomValue,
      zoomOrigin: "center",
      insets: isMobileViewport
        ? (isFloorMode ? MOBILE_FLOOR_VIEWER_INSETS : MOBILE_OUTDOOR_VIEWER_INSETS)
        : undefined,
      inspectionSlack: isFloorMode || focusingMobileBuildingDestination
        ? getStudentFloorInspectionSlack(
            rect?.width || viewportCanvasW,
            rect?.height || viewportCanvasH,
            isMobileViewport,
          )
        : getStudentOutdoorInspectionSlack(
            rect?.width || viewportCanvasW,
            rect?.height || viewportCanvasH,
            isMobileViewport,
          ),
    });
  }, [directionsMode, isFloorMode, roomDestination, toBuilding, viewportCanvasH, viewportCanvasW]);
  const clampMapPan = useCallback((candidate: Pt, zoomValue = zoomRef.current) =>
    clampViewportPan(candidate, getMapPanBounds(zoomValue)), [getMapPanBounds]);

  writeCameraTransformRef.current = writeCameraTransform;

  /** One retargetable, time-based RAF loop for every animated camera move. */
  const animateCameraTo = useCallback((targetPan: Pt, targetZoom = zoomStateRef.current, source?: "room-focus" | "manual-wheel") => {
    const toZoom = clampStudentMapZoom(targetZoom);
    // Every camera move settles inside the active map pan bounds. Destination
    // bounds include inspection slack on mobile while a building route is open.
    const toPan = clampMapPan(targetPan, toZoom);
    cameraAnimationModeRef.current = source === "manual-wheel" ? "manual-wheel" : "programmatic";
    roomFocusAnimationRef.current = source === "room-focus";
    timedCameraMotionRef.current = source === "room-focus"
      ? { fromPan: { ...panRef.current }, fromZoom: displayZoomRef.current, startedAt: performance.now(), durationMs: 330 }
      : null;
    targetCameraRef.current = { pan: toPan, zoom: toZoom };
    targetLogZoomRef.current = Math.log(toZoom);
    if (source !== "manual-wheel") manualWheelAnchorRef.current = null;
    zoomStateRef.current = toZoom;

    const finishAtTarget = () => {
      panRef.current = { ...toPan };
      displayZoomRef.current = toZoom;
      zoomRef.current = toZoom;
      zoomStateRef.current = toZoom;
      targetCameraRef.current = { pan: { ...toPan }, zoom: toZoom };
      targetLogZoomRef.current = Math.log(toZoom);
      writeCameraTransformRef.current(toPan, toZoom);
      cameraAnimationFrameRef.current = null;
      timedCameraMotionRef.current = null;
      roomFocusAnimationRef.current = false;
      manualWheelAnchorRef.current = null;
      commitCameraState();
    };

    if (reducedMotion && source !== "manual-wheel") {
      if (cameraAnimationFrameRef.current !== null) cancelAnimationFrame(cameraAnimationFrameRef.current);
      finishAtTarget();
      return;
    }
    if (cameraAnimationFrameRef.current !== null) return;

    let previousTime = performance.now();
    const tick = (now: number) => {
      const target = targetCameraRef.current;
      const timedMotion = timedCameraMotionRef.current;
      if (timedMotion) {
        const progress = getStudentRoomFocusProgress(now - timedMotion.startedAt, timedMotion.durationMs);
        const nextPan = {
          x: timedMotion.fromPan.x + (target.pan.x - timedMotion.fromPan.x) * progress,
          y: timedMotion.fromPan.y + (target.pan.y - timedMotion.fromPan.y) * progress,
        };
        const nextZoom = timedMotion.fromZoom + (target.zoom - timedMotion.fromZoom) * progress;
        if (progress >= 1) {
          panRef.current = { ...target.pan };
          displayZoomRef.current = target.zoom;
          zoomRef.current = target.zoom;
          zoomStateRef.current = target.zoom;
          targetCameraRef.current = { pan: { ...target.pan }, zoom: target.zoom };
          targetLogZoomRef.current = Math.log(target.zoom);
          writeCameraTransformRef.current(target.pan, target.zoom);
          cameraAnimationFrameRef.current = null;
          timedCameraMotionRef.current = null;
          roomFocusAnimationRef.current = false;
          manualWheelAnchorRef.current = null;
          commitCameraState();
          return;
        }
        panRef.current = nextPan;
        displayZoomRef.current = nextZoom;
        zoomRef.current = nextZoom;
        writeCameraTransformRef.current(nextPan, nextZoom);
        cameraAnimationFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const isManualWheel = cameraAnimationModeRef.current === "manual-wheel";
      const deltaMs = now - previousTime;
      const factor = getCameraSmoothingFactor(deltaMs, 56);
      previousTime = now;
      const currentPan = panRef.current;
      const currentZoom = displayZoomRef.current;
      const dampedZoom = isManualWheel
        ? dampCameraZoomLogarithm(currentZoom, target.zoom, deltaMs, 34)
        : currentZoom + (target.zoom - currentZoom) * factor;
      const nextZoom = isManualWheel && Math.abs(Math.log(target.zoom) - Math.log(dampedZoom)) < 0.0005
        ? target.zoom
        : dampedZoom;
      const anchor = isManualWheel ? manualWheelAnchorRef.current : null;
      const proposedPan = anchor
        ? {
            x: anchor.viewPoint.x - viewCX * (1 - nextZoom) - anchor.worldPoint.x * nextZoom,
            y: anchor.viewPoint.y - viewCY * (1 - nextZoom) - anchor.worldPoint.y * nextZoom,
          }
        : {
            x: currentPan.x + (target.pan.x - currentPan.x) * factor,
            y: currentPan.y + (target.pan.y - currentPan.y) * factor,
          };
      const nextPan = isManualWheel ? clampMapPan(proposedPan, nextZoom) : proposedPan;
      const settled = isManualWheel
        ? Math.abs(Math.log(target.zoom) - Math.log(nextZoom)) < 0.0005
          && Math.abs(target.pan.x - nextPan.x) < 0.5
          && Math.abs(target.pan.y - nextPan.y) < 0.5
        : Math.abs(target.pan.x - nextPan.x) < 0.25
          && Math.abs(target.pan.y - nextPan.y) < 0.25
          && Math.abs(target.zoom - nextZoom) < 0.001;

      if (settled) {
        panRef.current = { ...target.pan };
        displayZoomRef.current = target.zoom;
        zoomRef.current = target.zoom;
        zoomStateRef.current = target.zoom;
        targetCameraRef.current = { pan: { ...target.pan }, zoom: target.zoom };
        targetLogZoomRef.current = Math.log(target.zoom);
        writeCameraTransformRef.current(target.pan, target.zoom);
        cameraAnimationFrameRef.current = null;
        timedCameraMotionRef.current = null;
        roomFocusAnimationRef.current = false;
        manualWheelAnchorRef.current = null;
        commitCameraState();
        return;
      }

      panRef.current = nextPan;
      displayZoomRef.current = nextZoom;
      zoomRef.current = nextZoom;
      writeCameraTransformRef.current(nextPan, nextZoom);
      cameraAnimationFrameRef.current = requestAnimationFrame(tick);
    };
    cameraAnimationFrameRef.current = requestAnimationFrame(tick);
  }, [clampMapPan, commitCameraState, reducedMotion, viewCX, viewCY]);

  useEffect(() => { animateCameraToRef.current = animateCameraTo; }, [animateCameraTo]);
  const applyOverviewCamera = useCallback((camera: { pan: Pt; zoom: number }) => {
    const nextZoom = clampStudentMapZoom(camera.zoom);
    const nextPan = clampMapPan(camera.pan, nextZoom);
    overviewCameraRef.current = { pan: nextPan, zoom: nextZoom };
    timedCameraMotionRef.current = null;
    panRef.current = nextPan;
    displayZoomRef.current = nextZoom;
    zoomRef.current = nextZoom;
    zoomStateRef.current = nextZoom;
    targetCameraRef.current = { pan: { ...nextPan }, zoom: nextZoom };
    targetLogZoomRef.current = Math.log(nextZoom);
    manualWheelAnchorRef.current = null;
    roomFocusAnimationRef.current = false;
    setPan(nextPan);
    setDisplayZoom(nextZoom);
    setZoom(nextZoom);
    writeCameraTransform(nextPan, nextZoom);
  }, [clampMapPan, writeCameraTransform]);

  useLayoutEffect(() => {
    if (!activeCampus || isFloorMode || fittedCampusIdRef.current === activeCampus.id) return;
    const viewport = mapContainerRef.current?.getBoundingClientRect();
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) return;
    const structuralBuildings = Object.values(B_POS).filter((building) =>
      [building.x, building.y, building.w, building.h].every(Number.isFinite)
      && building.w > 0 && building.h > 0,
    );
    const content = structuralBuildings.length > 0
      ? {
          x: Math.min(...structuralBuildings.map((building) => building.x)),
          y: Math.min(...structuralBuildings.map((building) => building.y)),
          width: Math.max(...structuralBuildings.map((building) => building.x + building.w))
            - Math.min(...structuralBuildings.map((building) => building.x)),
          height: Math.max(...structuralBuildings.map((building) => building.y + building.h))
            - Math.min(...structuralBuildings.map((building) => building.y)),
        }
      : { x: 0, y: 0, width: outdoorCanvasW, height: outdoorCanvasH };
    const isMobileViewport = window.innerWidth < 768;
    const camera = getStudentOverviewCamera({
      mapWidth: outdoorCanvasW,
      mapHeight: outdoorCanvasH,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      content,
      insets: isMobileViewport ? MOBILE_OUTDOOR_VIEWER_INSETS : undefined,
      fillRatio: isMobileViewport ? 0.82 : 0.9,
    });
    applyOverviewCamera(camera);
    fittedCampusIdRef.current = activeCampus.id;
  }, [activeCampus?.id, applyOverviewCamera, B_POS, isFloorMode, outdoorCanvasH, outdoorCanvasW]);

  useLayoutEffect(() => {
    if (!isFloorMode || !activeFloorPlan) {
      fittedFloorIdRef.current = null;
      return;
    }
    if (fittedFloorIdRef.current === activeFloorPlan.id) return;
    const viewport = mapContainerRef.current?.getBoundingClientRect();
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) return;
    const structuralBounds = getFloorShapeBounds(getFloorShapeRegions(activeFloorPlan, {
      canvasW: activeFloorPlan.canvasW || 440,
      canvasH: activeFloorPlan.canvasH || 290,
    }));
    const isMobileViewport = window.innerWidth < 768;
    const isPortrait = typeof window.matchMedia === "function"
      && window.matchMedia("(orientation: portrait)").matches;
    const camera = getStudentOverviewCamera({
      mapWidth: floorViewport.width,
      mapHeight: floorViewport.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      content: structuralBounds,
      contentOffset: { x: floorViewport.offsetX, y: floorViewport.offsetY },
      insets: isMobileViewport ? MOBILE_FLOOR_VIEWER_INSETS : undefined,
      fillRatio: isMobileViewport && isPortrait ? 1.35 : 0.9,
    });
    applyOverviewCamera(camera);
    fittedFloorIdRef.current = activeFloorPlan.id;
  }, [activeFloorPlan, applyOverviewCamera, floorViewport, isFloorMode]);

  const viewportBackground = isFloorMode
    ? activeFloorPlan?.backgroundColor || "var(--map-floor-corridor)"
    : activeCampus
      ? campusGroundAppearance(activeCampus).color
      : "var(--map-bg)";

  // ── Smooth zoom lerp ───────────────────────────────────────────────────
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    const targetPan = clampMapPan(panRef.current, zoom);
    if (Math.abs(displayZoomRef.current - zoom) < 0.005
      && Math.abs(panRef.current.x - targetPan.x) < 0.1
      && Math.abs(panRef.current.y - targetPan.y) < 0.1) return;
    animateCameraTo(targetPan, zoom);
  }, [animateCameraTo, clampMapPan, zoom]);

  // ── Smooth pan lerp ───────────────────────────────────────────────────
  // Reconcile the current camera whenever the authored surface, viewport, or
  // zoom changes. This also catches a resize from desktop to mobile without
  // letting the map remain stranded beyond its new edge.
  useEffect(() => {
    const current = panRef.current;
    const clamped = clampMapPan(current, zoom);
    if (clamped.x !== current.x || clamped.y !== current.y) {
      panRef.current = clamped;
      setPan(clamped);
    }
  }, [clampMapPan, zoom]);

  useEffect(() => {
    const element = mapContainerRef.current;
    if (!element) return;

    const reconcileViewport = () => {
      const rect = element.getBoundingClientRect();
      cameraViewportRectRef.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      const svgWidth = svgRef.current?.getBoundingClientRect().width;
      if (svgWidth && svgWidth > 0) cameraScreenScaleRef.current = viewportCanvasW / svgWidth;
      const current = panRef.current;
      const clamped = clampMapPan(current, zoomRef.current);
      if (clamped.x !== current.x || clamped.y !== current.y) {
        panRef.current = clamped;
        setPan(clamped);
      }
    };

    if (typeof ResizeObserver === "undefined") {
      reconcileViewport();
      window.addEventListener("resize", reconcileViewport);
      window.addEventListener("scroll", reconcileViewport, true);
      return () => {
        window.removeEventListener("resize", reconcileViewport);
        window.removeEventListener("scroll", reconcileViewport, true);
      };
    }
    const observer = new ResizeObserver(reconcileViewport);
    observer.observe(element);
    reconcileViewport();
    window.addEventListener("resize", reconcileViewport);
    window.addEventListener("scroll", reconcileViewport, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reconcileViewport);
      window.removeEventListener("scroll", reconcileViewport, true);
    };
  }, [clampMapPan, viewportCanvasW, viewportCanvasH]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Floating controls own their scrolling; only the map surface zooms.
      if (e.target instanceof Element && e.target.closest("[data-no-drag], input, textarea, select, button, [role='dialog'], [role='listbox']")) return;
      e.preventDefault();
      const step = normalizeStudentMapWheelDelta(e.deltaY, e.deltaMode, el.clientHeight);
      if (step === 0) return;
      // Wheel/trackpad input retargets a single live RAF camera loop. Stop a
      // programmatic move at its current rendered frame; successive wheel
      // events update the target without queueing separate animations.
      const interruptsProgrammaticMove = cameraAnimationFrameRef.current !== null && cameraAnimationModeRef.current !== "manual-wheel";
      if (interruptsProgrammaticMove) {
        cancelCameraAnimation(false);
      }
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = 0;
      const continuingWheel = !interruptsProgrammaticMove
        && cameraAnimationFrameRef.current !== null
        && cameraAnimationModeRef.current === "manual-wheel";
      const baseLogZoom = continuingWheel ? targetLogZoomRef.current : Math.log(displayZoomRef.current);
      const nextZoom = clampStudentMapZoom(Math.exp(baseLogZoom - step));
      if (Math.abs(Math.log(nextZoom) - baseLogZoom) < 1e-9) return;
      animateZoomAtRef.current(e.clientX, e.clientY, nextZoom, "manual-wheel");
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [activeCampus?.id, cancelCameraAnimation, isCampusLoading]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement?.matches("input, textarea, select, [contenteditable='true']")
        || document.querySelector("[role='dialog'], [role='menu'], [role='listbox']")
      ) return;
      if (e.key === "+"||e.key === "=") { e.preventDefault(); zoomAtCursor(zoomStateRef.current + STUDENT_MAP_ZOOM_STEP); }
      if (e.key === "-")                { e.preventDefault(); zoomAtCursor(zoomStateRef.current - STUDENT_MAP_ZOOM_STEP); }
      if (e.key === "0")                { e.preventDefault(); resetMapCamera(); }
      if (e.key === "Escape") {
        setSelected(null); setSearchFocused(false);
        setReportModal(null); setSignInPrompt(null);
        if (floorViewRef.current) { setFloorView(null); setZoom(1); setPan({x:0,y:0}); }
      }
      const PAN = 30;
      if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) cancelCameraAnimation();
      if (e.key === "ArrowRight") { setPan(p => clampMapPan({...p, x:p.x-PAN})); }
      if (e.key === "ArrowLeft")  { setPan(p => clampMapPan({...p, x:p.x+PAN})); }
      if (e.key === "ArrowDown")  { setPan(p => clampMapPan({...p, y:p.y-PAN})); }
      if (e.key === "ArrowUp")    { setPan(p => clampMapPan({...p, y:p.y+PAN})); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelCameraAnimation, clampMapPan, resetMapCamera]);

  // ── Drag-to-pan ────────────────────────────────────────────────────────
  // ── Inertia decay ────────────────────────────────────────────────────
  const startInertia = useCallback((vx: number, vy: number) => {
    cancelAnimationFrame(inertiaRef.current);
    const friction = 0.92;
    const minVelocity = 0.2;
    const decay = () => {
      const speed = Math.hypot(vx, vy);
      if (speed < minVelocity) {
        inertiaRef.current = 0;
        const zoomValue = displayZoomRef.current;
        const settled = clampMapPan(panRef.current, zoomValue);
        if (Math.abs(settled.x - panRef.current.x) > 0.1 || Math.abs(settled.y - panRef.current.y) > 0.1) {
          animateCameraTo(settled, zoomValue);
        } else {
          commitCameraState();
        }
        return;
      }
      vx *= friction;
      vy *= friction;
      const current = panRef.current;
      const zoomValue = displayZoomRef.current;
      const next = getSoftBoundedPan(
        { x: current.x + vx, y: current.y + vy },
        getMapPanBounds(zoomValue),
        getScale(),
      );
      panRef.current = next;
      targetCameraRef.current = { pan: { ...next }, zoom: zoomValue };
      writeCameraTransform(next, zoomValue);
      if (next.x === current.x && next.y === current.y) {
        inertiaRef.current = 0;
        const settled = clampMapPan(next, zoomValue);
        if (Math.abs(settled.x - next.x) > 0.1 || Math.abs(settled.y - next.y) > 0.1) animateCameraTo(settled, zoomValue);
        else commitCameraState();
        return;
      }
      inertiaRef.current = requestAnimationFrame(decay);
    };
    inertiaRef.current = requestAnimationFrame(decay);
  }, [animateCameraTo, clampMapPan, commitCameraState, getMapPanBounds, getScale, writeCameraTransform]);

  const settlePanToBounds = useCallback(() => {
    const zoomValue = displayZoomRef.current;
    const settled = clampMapPan(panRef.current, zoomValue);
    if (Math.abs(settled.x - panRef.current.x) > 0.1 || Math.abs(settled.y - panRef.current.y) > 0.1) {
      animateCameraTo(settled, zoomValue);
    } else {
      commitCameraState();
    }
  }, [animateCameraTo, clampMapPan, commitCameraState]);

  // ── Shared pan logic ─────────────────────────────────────────────────
  const applyPanDelta = useCallback((dx: number, dy: number, drag: NonNullable<typeof dragRef.current>) => {
    const scale = getScale();
    const zoomValue = displayZoomRef.current;
    const next = getSoftBoundedPan(
      { x: drag.px + dx * scale, y: drag.py + dy * scale },
      getMapPanBounds(zoomValue),
      scale,
    );
    panRef.current = next;
    targetCameraRef.current = { pan: { ...next }, zoom: zoomValue };
    writeCameraTransform(next, zoomValue);
  }, [getMapPanBounds, getScale, writeCameraTransform]);

  const queuePanUpdate = useCallback((clientX: number, clientY: number, drag: NonNullable<typeof dragRef.current>) => {
    pendingPanRef.current = { x: clientX, y: clientY, drag };
    if (panFrameRef.current !== null) return;
    panFrameRef.current = requestAnimationFrame(() => {
      panFrameRef.current = null;
      const pending = pendingPanRef.current;
      pendingPanRef.current = null;
      if (!pending) return;
      applyPanDelta(pending.x - pending.drag.sx, pending.y - pending.drag.sy, pending.drag);
    });
  }, [applyPanDelta]);

  const flushPanUpdate = useCallback((clientX: number, clientY: number, drag: NonNullable<typeof dragRef.current>) => {
    pendingPanRef.current = null;
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    applyPanDelta(clientX - drag.sx, clientY - drag.sy, drag);
  }, [applyPanDelta]);

  const queueZoomUpdate = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    pendingZoomRef.current = { x: clientX, y: clientY, zoom: nextZoom };
    if (zoomFrameRef.current !== null) return;
    zoomFrameRef.current = requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      const pending = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (pending) applyZoomAtRef.current(pending.x, pending.y, pending.zoom, false);
    });
  }, []);

  const flushZoomUpdate = useCallback(() => {
    if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current);
    zoomFrameRef.current = null;
    const pending = pendingZoomRef.current;
    pendingZoomRef.current = null;
    if (pending) applyZoomAtRef.current(pending.x, pending.y, pending.zoom, false);
  }, []);

  // ── Per-frame velocity tracking helper ───────────────────────────────
  const trackVelocity = useCallback((drag: NonNullable<typeof dragRef.current>, newDx: number, newDy: number, smoothing: number) => {
    const scale = getScale();
    const frameVx = newDx * scale;
    const frameVy = newDy * scale;
    const alpha = smoothing;
    drag.vx = drag.vx * (1 - alpha) + frameVx * alpha;
    drag.vy = drag.vy * (1 - alpha) + frameVy * alpha;
    drag.lastTime = performance.now();
  }, [getScale]);

  // ── Mouse drag-to-pan ────────────────────────────────────────────────
  // ── Dropped-pin helpers ─────────────────────────────────────────────────

  /** Snap an SVG point to the nearest walkway node (campus graph or static). */
  const snapPointToGraph = useCallback((pt: { x: number; y: number }): { x: number; y: number } => {
    const campusNodes = activeCampus?.navNodes?.map((n) => ({ x: n.x, y: n.y })) ?? [];
    const candidates = campusNodes.length > 0
      ? campusNodes
      : STATIC_NAV_NODES.map((n) => ({ x: n.x, y: n.y }));
    const snapped = snapToNearest(pt, candidates);
    return snapped ? snapped.point : pt;
  }, [activeCampus]);

  /** Convert to both SVG view coordinates and live world coordinates from one matrix read. */
  const svgCameraPointFromClient = useCallback((clientX: number, clientY: number): { viewPoint: Pt; worldPoint: Pt } | null => {
    const svg = svgRef.current;
    if (!svg?.createSVGPoint || !svg.getScreenCTM) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const viewPoint = pt.matrixTransform(ctm.inverse());
    const z = displayZoomRef.current;
    return {
      viewPoint: { x: viewPoint.x, y: viewPoint.y },
      worldPoint: {
        x: (viewPoint.x - viewCX * (1 - z) - panRef.current.x) / z,
        y: (viewPoint.y - viewCY * (1 - z) - panRef.current.y) / z,
      },
    };
  }, [viewCX, viewCY]);

  /** Convert a client-space point to SVG content coordinates (inverse of pan/zoom). */
  const svgPointFromClient = useCallback((clientX: number, clientY: number): Pt | null =>
    svgCameraPointFromClient(clientX, clientY)?.worldPoint ?? null,
  [svgCameraPointFromClient]);

  const animateZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number, source?: "manual-wheel") => {
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    // Manual wheel input owns the camera immediately and preserves the live
    // transform as its origin. Other callers keep the existing programmatic
    // behavior and duration.
    if (source === "manual-wheel" && cameraAnimationFrameRef.current !== null && cameraAnimationModeRef.current !== "manual-wheel") {
      cancelCameraAnimation(false);
    } else if (roomFocusAnimationRef.current) {
      cancelCameraAnimation();
    }
    const clamped = clampStudentMapZoom(nextZoom);
    const cameraPoint = svgCameraPointFromClient(clientX, clientY);
    if (!cameraPoint) {
      manualWheelAnchorRef.current = null;
      animateCameraTo(panRef.current, clamped, source);
      return;
    }
    const worldPoint = cameraPoint.worldPoint;
    if (source === "manual-wheel") manualWheelAnchorRef.current = cameraPoint;
    const nextPan = getPanToKeepWorldPoint({
      mapWidth: viewportCanvasW,
      mapHeight: viewportCanvasH,
      worldPoint,
      pan: panRef.current,
      zoom: displayZoomRef.current,
      nextZoom: clamped,
      zoomOrigin: "center",
    });
    animateCameraTo(clampMapPan(nextPan, clamped), clamped, source);
  }, [animateCameraTo, cancelCameraAnimation, clampMapPan, svgCameraPointFromClient, viewportCanvasH, viewportCanvasW]);

  useEffect(() => { animateZoomAtRef.current = animateZoomAt; }, [animateZoomAt]);

  /** Cursor-anchored zoom with the same center-origin transform as the map. */
  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number, commitState = true) => {
    // User zoom takes over from scripted movement without an intermediate
    // React-state commit. The final camera is committed once the gesture ends.
    cancelCameraAnimation(false);
    const clamped = clampStudentMapZoom(nextZoom);
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    zoomStateRef.current = clamped;
    zoomRef.current = clamped;
    targetLogZoomRef.current = Math.log(clamped);
    const pt = svgPointFromClient(clientX, clientY);
    if (!pt) {
      displayZoomRef.current = clamped;
      targetCameraRef.current = { pan: { ...panRef.current }, zoom: clamped };
      targetLogZoomRef.current = Math.log(clamped);
      writeCameraTransform(panRef.current, clamped);
      if (commitState) commitCameraState();
      return;
    }
    const canvasW = viewportCanvasW;
    const canvasH = viewportCanvasH;
    const z = displayZoomRef.current;
    const nextPan = clampMapPan(getPanToKeepWorldPoint({
      mapWidth: canvasW,
      mapHeight: canvasH,
      worldPoint: pt,
      pan: panRef.current,
      zoom: z,
      nextZoom: clamped,
      zoomOrigin: "center",
    }), clamped);
    panRef.current = nextPan;
    // Apply manual zoom and its anchored pan in the same frame; independent
    // interpolation used to make the map jump away from the pointer.
    displayZoomRef.current = clamped;
    targetCameraRef.current = { pan: { ...nextPan }, zoom: clamped };
    targetLogZoomRef.current = Math.log(clamped);
    writeCameraTransform(nextPan, clamped);
    if (commitState) commitCameraState();
  }, [cancelCameraAnimation, clampMapPan, commitCameraState, svgPointFromClient, viewportCanvasW, viewportCanvasH, writeCameraTransform]);

  // Keep stable listeners (wheel, keys, pinch) anchored against the latest zoom/pan.
  useEffect(() => {
    applyZoomAtRef.current = applyZoomAt;
  });

  /** Tap-on-map handler while pinning — places the manual dropped pin. */
  const handleMapPinTap = useCallback((clientX: number, clientY: number) => {
    if (dragRef.current?.moved) return;
    const pt = svgPointFromClient(clientX, clientY);
    if (!pt) return;
    const snapped = snapPointToGraph(pt);
    setYouAreHere(snapped);
    setCurrentLocationLabel(null);
    setPinning(false);
    setUseMyLocation(true);
    setFromBuilding(null);
    setToBuilding(null);
    setRoomOrigin(null);
    setRoomDestination(null);
    setNavigationPhase("idle");
    // No auto-open of the Route Planner here either — the dropped pin
    // chip with its "Plan route" button is the single, clear next step.
  }, [svgPointFromClient, snapPointToGraph]);

  /** Clear the marker + any point-based route. */
  const clearYouAreHere = useCallback(() => {
    setYouAreHere(null);
    setCurrentLocationLabel(null);
    setIndoorQrLocation(null);
    setUseMyLocation(false);
    setPinning(false);
    setFromBuilding(null);
    setRoomOrigin(null);
    setRoomDestination(null);
    setNavigationPhase("idle");
  }, []);

  const applyCampusLocationQr = useCallback((campus: EditorCampus, locationId: string, payload?: CampusLocationQrPayload): boolean => {
    const location = resolveCampusLocationQr(campus, locationId, payload);
    if (!location) {
      showError("Location QR not recognized", { description: "This code does not match a published campus location." });
      return false;
    }
    if (location.kind === "indoor") {
      const building = location.buildingId
        ? MOCK_BUILDINGS.find((candidate) => candidate.id === location.buildingId)
        : undefined;
      const floor = building && location.floorNumber !== undefined
        ? campus.buildings.find((candidate) => candidate.id === building.id)?.floors.find((candidate) =>
            candidate.id === location.floorId || candidate.number === location.floorNumber,
          )
        : undefined;
      if (!building || !floor || location.floorNumber === undefined) {
        showError("Indoor location unavailable", {
          description: `${location.label} could not be matched to a published building floor.`,
        });
        return false;
      }

      const campusBuilding = campus.buildings.find((candidate) => candidate.id === building.id);
      const roomRecord = location.roomId
        ? floor.rooms.find((candidate) => candidate.id === location.roomId)
        : undefined;
      const room = location.room ?? (campusBuilding && roomRecord
        ? roomDestinationFromLocationQr(campusBuilding, floor, roomRecord)
        : undefined);
      setCurrentLocationLabel(location.label);
      setYouAreHere(null);
      setIndoorQrLocation({ ...location, buildingId: building.id, floorId: floor.id, floorNumber: floor.number, room: room ?? undefined });
      setUseMyLocation(false);
      setPinning(false);
      setSelected(null);
      setShowQR(false);
      setSearch("");
      setSearchFocused(false);
      setDirectionsMode(false);
      setRoutePlannerEndpoint(null);
      setFromBuilding(room ? building : null);
      setToBuilding(null);
      setRoomOrigin(room ?? null);
      setRoomDestination(null);
      setFloorView({ building, floor: floor.number });
      setZoom(getInitialFloorZoom());
      setPan({ x: 0, y: 0 });
      setIndoorRoute(null);
      setDestinationIndoorSegments([]);
      setDestinationIndoorSegmentIndex(-1);
      setOriginIndoorSegments([]);
      setOriginIndoorSegmentIndex(-1);
      setActiveRouteRoom(room?.roomId ?? location.roomId ?? null);
      setHighlightedRoom(room?.roomId ?? location.roomId ?? null);
      setHoveredRoom(null);
      setSelectedRoomContext(null);
      setNavigationPhase("idle");
      setNavigationTransitioning(false);
      setWalkProgress(0);
      setIndoorWalkProgress(0);
      setShowArrival(false);
      showSuccess("Current location set", { description: location.label });
      return true;
    }

    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === location.buildingId) ?? null;
    setCurrentLocationLabel(location.label);
    setYouAreHere(location.point);
    setIndoorQrLocation(null);
    setUseMyLocation(true);
    setPinning(false);
    setSelected(building);
    setShowQR(false);
    setSearch("");
    setSearchFocused(false);
    setDirectionsMode(false);
    setFromBuilding(null);
    setToBuilding(null);
    setRoomOrigin(null);
    setRoomDestination(null);
    setFloorView(null);
    setIndoorRoute(null);
    setDestinationIndoorSegments([]);
    setDestinationIndoorSegmentIndex(-1);
    setOriginIndoorSegments([]);
    setOriginIndoorSegmentIndex(-1);
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
    setNavigationPhase("idle");
    setNavigationTransitioning(false);
    setWalkProgress(0);
    setIndoorWalkProgress(0);
    setShowArrival(false);
    showSuccess("Current location set", { description: location.label });
    return true;
  }, [MOCK_BUILDINGS, showError, showSuccess]);

  const openLocationScanner = useCallback(() => {
    setSearchFocused(false);
    setSelected(null);
    setShowQR(false);
    setLocationScannerOpen(true);
  }, []);

  const handleLocationQrScan = useCallback((value: string) => {
    const payload = parseLocationQrPayload(value);
    setLocationScannerOpen(false);
    if (!payload) {
      showError("QR code not recognized", { description: "Scan a NaviSync campus location marker." });
      return;
    }

    const campusCandidates = payload.campusId
      ? availableCampuses.filter((campus) => campus.id === payload.campusId)
      : availableCampuses;
    const targetCampus = (activeCampus && campusCandidates.includes(activeCampus)
      && resolveCampusLocationQr(activeCampus, payload.locationId, payload) !== null
      ? activeCampus
      : campusCandidates.find((campus) => resolveCampusLocationQr(campus, payload.locationId, payload) !== null));
    if (!targetCampus) {
      showError("Location QR not recognized", { description: "This code does not match a published location on this campus." });
      return;
    }
    if (targetCampus.id !== activeCampus?.id) {
      setPendingLocationScan({ ...payload, campusId: targetCampus.id });
      setSelectedCampusId(targetCampus.id);
      return;
    }
    applyCampusLocationQr(targetCampus, payload.locationId, payload);
  }, [activeCampus?.id, applyCampusLocationQr, availableCampuses, setSelectedCampusId, showError]);

  /** Restart the walk animation from the start. */
  const replayWalk = useCallback(() => {
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    walkAnimRef.current = null;
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    navigationTransitionAnimRef.current = null;
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    indoorWalkAnimRef.current = null;
    setNavigationTransitioning(false);
    setWalkProgress(0);
    setWalkNonce((n) => n + 1);

    const activeRoute = routeRef.current;
    const originSegments = indoorSegmentsForBuilding(activeRoute, roomOrigin?.buildingId);
    const originSegment = originSegments[0];
    const originBuilding = roomOrigin
      ? MOCK_BUILDINGS.find((building) => building.id === roomOrigin.buildingId)
      : null;

    // Replay means the complete journey. A cross-building room-origin route
    // therefore remounts its source floor and replays the exact authored
    // room-to-exit segment before handing off to the outdoor leg.
    if (activeRoute && activeRoute.points.length >= 2 && roomOrigin && originSegment && originBuilding) {
      enteredRoomRef.current = null;
      setOriginIndoorSegments(originSegments);
      setOriginIndoorSegmentIndex(0);
      setIndoorRoute(indoorRouteFromSegment(originSegment));
      const publishedBuilding = activeCampus?.buildings.find((building) => building.id === roomOrigin.buildingId);
      setFloorView({ building: originBuilding, floor: indoorSegmentFloorNumber(originSegment, publishedBuilding, roomOrigin.floorNumber) ?? roomOrigin.floorNumber });
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setHighlightedRoom(roomOrigin.roomId);
      setActiveRouteRoom(roomOrigin.roomId);
      setStairLoading(null);
      setNavigationPhase("origin-indoor");
      return;
    }

    setNavigationPhase(activeRoute ? "outdoor" : "idle");
    // Routes without an indoor origin replay from the campus map. If the
    // previous walk finished inside a destination building, leave that floor
    // before restarting the outdoor animation.
    if (activeRoute?.destinationRoom && floorViewRef.current) {
      setFloorView(null);
      setIndoorRoute(null);
      setActiveRouteRoom(null);
      setHighlightedRoom(null);
      enteredRoomRef.current = null;
    }
  }, [MOCK_BUILDINGS, activeCampus, roomOrigin]);

  /** End the active navigation and return the map to its normal state. */
  const endNavigation = useCallback(() => {
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    navigationTransitionAnimRef.current = null;
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    indoorWalkAnimRef.current = null;
    if (destinationIndoorTransitionRef.current) {
      clearTimeout(destinationIndoorTransitionRef.current);
      destinationIndoorTransitionRef.current = null;
    }
    if (originIndoorTransitionRef.current) {
      clearTimeout(originIndoorTransitionRef.current);
      originIndoorTransitionRef.current = null;
    }
    setDestinationIndoorSegments([]);
    setDestinationIndoorSegmentIndex(-1);
    setOriginIndoorSegments([]);
    setOriginIndoorSegmentIndex(-1);
    setNavigationTransitioning(false);
    setNavigationPhase("idle");
    setRouteFading(true);
    setTimeout(() => {
      setFromBuilding(null);
      setToBuilding(null);
      setRoomOrigin(null);
      setRoomDestination(null);
      setNavigationPhase("idle");
      setDirectionsMode(false);
      setRouteFading(false);
      // Exit the destination floor plan if the walk had auto-entered it.
      if (routeRef.current?.destinationRoom && floorViewRef.current) {
        setFloorView(null);
        setIndoorRoute(null);
        setActiveRouteRoom(null);
        setHighlightedRoom(null);
      }
      enteredRoomRef.current = null;
    }, 300);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("[data-no-drag]")) return;
    cancelCameraAnimation();
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    const x = e.clientX, y = e.clientY;
    dragRef.current = { sx: x, sy: y, lx: x, ly: y, px: panRef.current.x, py: panRef.current.y, moved: false, vx: 0, vy: 0, lastTime: performance.now() };
  }, [cancelCameraAnimation]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Track the pointer so +/- and keyboard zoom can anchor to the cursor.
    if (!(e.target as Element).closest("[data-no-drag]")) {
      zoomAnchorRef.current = { clientX: e.clientX, clientY: e.clientY };
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grabbing";
    queuePanUpdate(e.clientX, e.clientY, drag);
    // Per-frame velocity from last cursor position
    trackVelocity(drag, e.clientX - drag.lx, e.clientY - drag.ly, 0.5);
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  }, [queuePanUpdate, trackVelocity]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) {
      if (drag.moved) {
        flushPanUpdate(e.clientX, e.clientY, drag);
        commitCameraState();
        const speed = Math.hypot(drag.vx, drag.vy);
        if (speed > 1) startInertia(drag.vx * 0.85, drag.vy * 0.85);
      } else if (!isFloorMode) {
        if (pinning && !(e.target as Element).closest("[data-bldg],[data-no-drag]")) {
          // Tap-on-map: place the dropped pin on empty map / walkways.
          handleMapPinTap(e.clientX, e.clientY);
        } else {
          setSelected(null); setSearchFocused(false);
        }
      }
    }
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grab";
  }, [isFloorMode, startInertia, pinning, handleMapPinTap, flushPanUpdate, commitCameraState]);

  // ── Touch drag-to-pan with inertia ───────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (pointerGestureActiveRef.current) return;
    if ((e.target as Element).closest("[data-no-drag]")) return;
    cancelCameraAnimation();
    // Two fingers → pinch-to-zoom
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const activeDrag = dragRef.current;
      if (activeDrag?.moved) {
        flushPanUpdate(t1.clientX, t1.clientY, activeDrag);
        commitCameraState();
      }
      dragRef.current = null;
      pinchRef.current = {
        dist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
        initZoom: zoomRef.current,
      };
      return;
    }
    if (e.touches.length !== 1) return;
    // Prevent synthesized mouse events on touch devices
    e.preventDefault();
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    const t = e.touches[0];
    dragRef.current = { sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, px: pan.x, py: pan.y, moved: false, vx: 0, vy: 0, lastTime: performance.now() };
  }, [cancelCameraAnimation, flushPanUpdate, commitCameraState]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pointerGestureActiveRef.current) return;
    // Pinch-to-zoom: 2 fingers
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const curDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = curDist / pinchRef.current.dist;
      const next = clampStudentMapZoom(pinchRef.current.initZoom * ratio);
      // Pinch zooms toward the midpoint of the two fingers.
      queueZoomUpdate((t1.clientX + t2.clientX) / 2, (t1.clientY + t2.clientY) / 2, next);
      return;
    }
    // Single-finger drag-to-pan
    if (e.touches.length !== 1) return;
    const drag = dragRef.current;
    if (!drag) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.sx, dy = t.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grabbing";
    queuePanUpdate(t.clientX, t.clientY, drag);
    // Per-frame velocity with EMA smoothing (lower alpha = smoother)
    trackVelocity(drag, t.clientX - drag.lx, t.clientY - drag.ly, 0.35);
    drag.lx = t.clientX;
    drag.ly = t.clientY;
  }, [queuePanUpdate, queueZoomUpdate, trackVelocity]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (pointerGestureActiveRef.current) return;
    const wasPinching = Boolean(pinchRef.current);
    if (wasPinching && e.touches.length === 1) {
      flushZoomUpdate();
      pinchRef.current = null;
      commitCameraState();
      const remaining = e.touches[0];
      dragRef.current = {
        sx: remaining.clientX,
        sy: remaining.clientY,
        lx: remaining.clientX,
        ly: remaining.clientY,
        px: panRef.current.x,
        py: panRef.current.y,
        moved: false,
        vx: 0,
        vy: 0,
        lastTime: performance.now(),
      };
      return;
    }
    pinchRef.current = null;
    const drag = dragRef.current;
    if (drag?.moved) {
      const point = e.changedTouches[0];
      flushPanUpdate(point?.clientX ?? drag.lx, point?.clientY ?? drag.ly, drag);
      commitCameraState();
    } else if (wasPinching) {
      flushZoomUpdate();
      commitCameraState();
    }
    dragRef.current = null;
    if (drag && drag.moved) {
      const speed = Math.hypot(drag.vx, drag.vy);
      if (speed > 1) startInertia(drag.vx * 0.85, drag.vy * 0.85);
      else settlePanToBounds();
    } else if (!isFloorMode && pinning && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      const target = e.target as Element;
      if (!target.closest("[data-bldg],[data-no-drag]")) {
        handleMapPinTap(t.clientX, t.clientY);
      }
    }
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grab";
  }, [startInertia, settlePanToBounds, isFloorMode, pinning, handleMapPinTap, flushPanUpdate, flushZoomUpdate, commitCameraState]);

  // ── Pointer gesture fallback/primary path for mobile pinch ─────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    if ((e.target as Element).closest("[data-no-drag]")) return;
    cancelCameraAnimation();

    pointerGestureActiveRef.current = true;
    pointerPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is not available in a few embedded WebViews.
    }

    if (pointerPointsRef.current.size === 2) {
      e.preventDefault();
      flushZoomUpdate();
      const [first, second] = [...pointerPointsRef.current.values()];
      const previousDrag = dragRef.current;
      if (previousDrag?.moved) {
        const firstPoint = [...pointerPointsRef.current.values()][0];
        flushPanUpdate(firstPoint.x, firstPoint.y, previousDrag);
        commitCameraState();
      }
      pointerPinchRef.current = {
        dist: Math.hypot(first.x - second.x, first.y - second.y),
        initZoom: zoomRef.current,
      };
      dragRef.current = null;
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = 0;
      return;
    }

    e.preventDefault();
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      px: panRef.current.x,
      py: panRef.current.y,
      moved: false,
      vx: 0,
      vy: 0,
      lastTime: performance.now(),
    };
  }, [cancelCameraAnimation, commitCameraState, flushPanUpdate, flushZoomUpdate]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerGestureActiveRef.current || e.pointerType === "mouse") return;
    if (!pointerPointsRef.current.has(e.pointerId)) return;

    pointerPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointerPointsRef.current.size === 2 && pointerPinchRef.current) {
      e.preventDefault();
      const [first, second] = [...pointerPointsRef.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const ratio = distance / Math.max(1, pointerPinchRef.current.dist);
      const next = clampStudentMapZoom(pointerPinchRef.current.initZoom * ratio);
      queueZoomUpdate((first.x + second.x) / 2, (first.y + second.y) / 2, next);
      return;
    }

    if (pointerPointsRef.current.size !== 1) return;
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grabbing";
    queuePanUpdate(e.clientX, e.clientY, drag);
    trackVelocity(drag, e.clientX - drag.lx, e.clientY - drag.ly, 0.35);
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  }, [queuePanUpdate, queueZoomUpdate, trackVelocity]);

  const onPointerEnd = useCallback((e: React.PointerEvent) => {
    if (!pointerGestureActiveRef.current || e.pointerType === "mouse") return;
    pointerPointsRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }

    if (pointerPointsRef.current.size > 0) {
      // When one finger leaves a pinch, keep the current transform and begin a
      // fresh one-finger pan from the remaining finger's current location.
      flushZoomUpdate();
      commitCameraState();
      pointerPinchRef.current = null;
      const remaining = [...pointerPointsRef.current.values()][0];
      dragRef.current = {
        sx: remaining.x,
        sy: remaining.y,
        lx: remaining.x,
        ly: remaining.y,
        px: panRef.current.x,
        py: panRef.current.y,
        moved: false,
        vx: 0,
        vy: 0,
        lastTime: performance.now(),
      };
      return;
    }

    const wasPinching = Boolean(pointerPinchRef.current);
    flushZoomUpdate();
    pointerPinchRef.current = null;
    pointerGestureActiveRef.current = false;
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      flushPanUpdate(e.clientX, e.clientY, drag);
      commitCameraState();
      const speed = Math.hypot(drag.vx, drag.vy);
      if (speed > 1) startInertia(drag.vx * 0.85, drag.vy * 0.85);
      else settlePanToBounds();
    } else if (wasPinching) {
      commitCameraState();
    }
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grab";
  }, [startInertia, settlePanToBounds, commitCameraState, flushPanUpdate, flushZoomUpdate]);

  // ── Floor plan handlers ────────────────────────────────────────────────
  const openFloorPlan = useCallback((building: Building, floor?: number) => {
    const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === building.id);
    const entryFloor = entryFloorForBuilding(publishedBuilding);
    const initialFloor = floor ?? entryFloor?.number ?? FLOOR_PLANS[building.id]?.floors[0]?.number ?? 1;
    setFloorView({ building, floor: initialFloor });
    // The details sheet otherwise covers the floor picker on the right.
    setSelected(null);
    setZoom(1); setPan({ x:0, y:0 });
    setSearch(""); setSearchFocused(false);
    setHighlightedRoom(null); setHoveredRoom(null);
    setSelectedRoomContext(null);
  }, [FLOOR_PLANS, activeCampus]);

  const changeStudentFloor = useCallback((floorNumber: number) => {
    const selectedRoom = selectedRoomContext;
    const buildingData = floorView && activeCampus?.buildings.find((building) => building.id === floorView.building.id);
    const nextFloor = buildingData?.floors.find((floor) => floor.number === floorNumber);
    const retainedRoom = selectedRoom
      && selectedRoom.buildingId === floorView?.building.id
      && nextFloor?.rooms.some((room) => room.id === selectedRoom.roomId)
      ? { ...selectedRoom, floorNumber, floorLabel: nextFloor.label }
      : null;

    setFloorView((view) => view ? { ...view, floor: floorNumber } : view);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setHighlightedRoom(retainedRoom?.roomId ?? null);
    setHoveredRoom(null);
    setActiveRouteRoom(null);
    setSelectedRoomContext(retainedRoom);
  }, [activeCampus, floorView, selectedRoomContext]);

  const closeFloorPlan = useCallback(() => {
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    navigationTransitionAnimRef.current = null;
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    indoorWalkAnimRef.current = null;
    if (destinationIndoorTransitionRef.current) {
      clearTimeout(destinationIndoorTransitionRef.current);
      destinationIndoorTransitionRef.current = null;
    }
    if (originIndoorTransitionRef.current) {
      clearTimeout(originIndoorTransitionRef.current);
      originIndoorTransitionRef.current = null;
    }
    setNavigationTransitioning(false);
    setFloorView(null);
    setZoom(1); setPan({ x:0, y:0 });
    setHighlightedRoom(null); setHoveredRoom(null); setStairLoading(null);
    setSelectedRoomContext(null);
    setRoutePlannerEndpoint(null);
    setIndoorRoute(null);
    setDestinationIndoorSegments([]);
    setDestinationIndoorSegmentIndex(-1);
    setOriginIndoorSegments([]);
    setOriginIndoorSegmentIndex(-1);
    setActiveRouteRoom(null);
    setIndoorWalkProgress(0);
  }, []);

  const handleFloorRoomHover = useCallback((roomId: string) => setHoveredRoom(roomId), []);
  const handleFloorRoomHoverEnd = useCallback(() => setHoveredRoom(null), []);
  const handleFloorDoorClick = useCallback((_doorId: string) => closeFloorPlan(), [closeFloorPlan]);

  const navigateStair = useCallback((roomType: RoomType) => {
    const fv = floorViewRef.current;
    const fd = fv ? FLOOR_PLANS[fv.building.id] : null;
    if (!fv || !fd) return;
    const nums     = fd.floors.map(f => f.number);
    const upFloor  = nums.find(n => n > fv.floor);
    const dnFloor  = [...nums].reverse().find(n => n < fv.floor);
    const target   = upFloor ?? dnFloor;
    if (!target) return;
    const dir   = target > fv.floor ? "up" : "down";
    const label = fd.floors.find(f => f.number === target)?.label ?? `Floor ${target}`;
    setStairLoading({ dir, label });
    setTimeout(() => {
      setFloorView(v => v ? {...v, floor: target} : v);
      setStairLoading(null);
    }, 750);
  }, []);

  // ── Route ──────────────────────────────────────────────────────────────
  // Computes the outdoor leg (point/building → destination building). When
  // the destination is a specific room/floor (roomDestination), the indoor
  // "enter → room" leg is appended so the steps cover the full journey.
  const route = useMemo<PlannedRoute | null>(() => {
    if (mapMode === "emergency") {
      const origin = fromCampusPlace ?? roomOrigin ?? (useMyLocation && youAreHere
        ? { type: "point" as const, ...youAreHere }
        : fromBuilding ? {
            type: "building" as const, buildingId: fromBuilding.id,
            label: fromBuilding.name, code: fromBuilding.code,
          } : null);
      return planStudentEmergencyRoute(activeCampus, origin);
    }
    let planned: PlannedRoute | null = null;
    const placeAwareFrom = roomOrigin ?? fromCampusPlace ?? (fromBuilding ? {
      type: "building" as const, buildingId: fromBuilding.id, label: fromBuilding.name, code: fromBuilding.code,
      entranceNodeId: activeCampus?.buildings.find((building) => building.id === fromBuilding.id)?.entranceNodeId,
    } : null);
    const placeAwareTo = roomDestination ?? toCampusPlace ?? (toBuilding ? {
      type: "building" as const, buildingId: toBuilding.id, label: toBuilding.name, code: toBuilding.code,
      entranceNodeId: activeCampus?.buildings.find((building) => building.id === toBuilding.id)?.entranceNodeId,
    } : null);
    if (fromCampusPlace || toCampusPlace) {
      if (useMyLocation && youAreHere && placeAwareTo) {
        planned = planPointToDestinationRoute(youAreHere, placeAwareTo, mapMode, activeCampus, B_POS);
      } else if (placeAwareFrom && placeAwareTo) {
        planned = planDestinationRoute(placeAwareFrom, placeAwareTo, mapMode, activeCampus);
      }
    } else if (roomOrigin && toBuilding) {
      const destination = roomDestination ?? {
        type: "building" as const,
        buildingId: toBuilding.id,
        label: toBuilding.name,
        code: toBuilding.code,
        entranceNodeId: activeCampus?.buildings.find((building) => building.id === toBuilding.id)?.entranceNodeId,
      };
      planned = planDestinationRoute(roomOrigin, destination, mapMode, activeCampus);
    } else if (useMyLocation && youAreHere && toBuilding) {
      // Kiosk-style: start from the "You are here" marker.
      if (roomDestination) {
        planned = planPointToDestinationRoute(
          youAreHere,
          roomDestination,
          mapMode,
          activeCampus,
          B_POS,
        );
      }
      if (!planned) {
        planned = planRouteFromPoint(
          youAreHere,
          {
            id: toBuilding.id,
            code: toBuilding.code,
            name: toBuilding.name,
            entranceNodeId: activeCampus?.buildings.find((building) => building.id === toBuilding.id)?.entranceNodeId,
          },
          mapMode,
          activeCampus,
          B_POS
        );
      }
    } else if (roomDestination && fromBuilding) {
      // A room is a first-class endpoint. Route the complete building/room
      // pair through the authored graph so the selected entrance, corridor
      // connections, bends, and shortest-path cost stay in one calculation.
      planned = planDestinationRoute(
        {
          type: "building",
          buildingId: fromBuilding.id,
          label: fromBuilding.name,
          code: fromBuilding.code,
          entranceNodeId: activeCampus?.buildings.find((building) => building.id === fromBuilding.id)?.entranceNodeId,
        },
        roomDestination,
        mapMode,
        activeCampus,
      );
    } else if (fromBuilding && toBuilding) {
      // Use the route planner: real graph stats in ALL modes, with an SVG
      // estimate fallback when the buildings are not on the walkway graph.
      planned = planBuildingRoute(
        {
          id: fromBuilding.id,
          code: fromBuilding.code,
          name: fromBuilding.name,
          entranceNodeId: activeCampus?.buildings.find((building) => building.id === fromBuilding.id)?.entranceNodeId,
        },
        {
          id: toBuilding.id,
          code: toBuilding.code,
          name: toBuilding.name,
          entranceNodeId: activeCampus?.buildings.find((building) => building.id === toBuilding.id)?.entranceNodeId,
        },
        mapMode,
        B_POS,
        activeCampus
      );
    }

    if (planned && roomDestination && !roomOrigin && useMyLocation && !planned.destinationRoom) {
      const destFloor = activeCampus?.buildings
        .find((b) => b.id === roomDestination.buildingId)
        ?.floors.find((f) => f.number === roomDestination.floorNumber);
      planned = withDestinationRoomLeg(
        planned,
        roomDestination,
        destFloor,
        activeCampus,
        destFloor?.rooms as RoomLike[] | undefined,
        mapMode === "accessible",
        false,
      );
    }
    return planned;
  }, [fromBuilding, toBuilding, fromCampusPlace, toCampusPlace, roomOrigin, useMyLocation, youAreHere, mapMode, B_POS, activeCampus, roomDestination]);

  // ── Auto-close planner when the route becomes ready ────────────────────
  // The compact RouteStepsPanel (bottom-left) takes over for ordinary
  // building routes. Room routes stay in the planner until the user presses
  // Navigate, because that confirmation starts the indoor-to-outdoor camera
  // transition and the walking animation.
  const previousCampusIdRef = useRef<string | null>(null);

  // A campus switch invalidates every coordinate-bearing navigation state.
  // Clear it as one transaction so a route, floor plan, pin, or room endpoint
  // from the previous campus cannot be rendered against the new map.
  useEffect(() => {
    const nextCampusId = activeCampus?.id ?? null;
    if (previousCampusIdRef.current === nextCampusId) return;
    previousCampusIdRef.current = nextCampusId;
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    if (destinationIndoorTransitionRef.current) {
      clearTimeout(destinationIndoorTransitionRef.current);
      destinationIndoorTransitionRef.current = null;
    }
    if (originIndoorTransitionRef.current) {
      clearTimeout(originIndoorTransitionRef.current);
      originIndoorTransitionRef.current = null;
    }
    walkAnimRef.current = null;
    navigationTransitionAnimRef.current = null;
    setSelected(null);
    setDirectionsMode(false);
    setRoutePlannerEndpoint(null);
    setSelectedRoomContext(null);
    setFromBuilding(null);
    setToBuilding(null);
    setRoomOrigin(null);
    setRoomDestination(null);
    setFloorView(null);
    setIndoorRoute(null);
    setDestinationIndoorSegments([]);
    setDestinationIndoorSegmentIndex(-1);
    setOriginIndoorSegments([]);
    setOriginIndoorSegmentIndex(-1);
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
    setHoveredRoom(null);
    setYouAreHere(null);
    setCurrentLocationLabel(null);
    setIndoorQrLocation(null);
    setUseMyLocation(false);
    setPinning(false);
    setMapMode("standard");
    setNavigationTransitioning(false);
    setNavigationPhase("idle");
    setWalkProgress(0);
    setIndoorWalkProgress(0);
    setShowArrival(false);
    setZoom(DEFAULT_OUTDOOR_ZOOM);
    setPan({ x: 0, y: 0 });
    routeRef.current = null;
    enteredRoomRef.current = null;
  }, [activeCampus?.id]);

  // Resolve QR/deep links only after the campus-switch reset above. Otherwise
  // that reset clears the selected location during the same render.
  useEffect(() => {
    if (isCampusLoading || initialSelectionRef.current || availableCampuses.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const locationId = params.get("locationId");
    const locationPayload = locationId ? parseLocationQrPayload(window.location.href) : null;
    const placeId = params.get("placeId");
    const destinationPlaceId = params.get("destinationPlaceId");
    const destinationBuildingId = params.get("destinationBuildingId");
    const campusHint = locationPayload?.campusId ?? params.get("campusId");
    const targetId = locationId || params.get("buildingId") || placeId || destinationPlaceId || destinationBuildingId || params.get("select");
    if (!targetId) {
      initialSelectionRef.current = true;
      return;
    }
    const campusCandidates = campusHint
      ? availableCampuses.filter((campus) => campus.id === campusHint)
      : availableCampuses;
    const matchesTarget = (campus: EditorCampus) => locationId
      ? resolveCampusLocationQr(campus, targetId, locationPayload ?? undefined) !== null
      : placeId || destinationPlaceId
        ? campus.markers.some((marker) => marker.id === (placeId || destinationPlaceId))
        : campus.buildings.some((building) =>
          building.id === targetId || building.code.toLowerCase() === targetId.toLowerCase(),
        );
    const targetCampus = (activeCampus && campusCandidates.includes(activeCampus) && matchesTarget(activeCampus)
      ? activeCampus
      : campusCandidates.find(matchesTarget));
    if (!targetCampus) {
      if (locationId) {
        showError("Location QR not recognized", { description: "This code does not match a published campus location." });
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
      initialSelectionRef.current = true;
      return;
    }
    if (activeCampus?.id !== targetCampus.id) {
      setSelectedCampusId(targetCampus.id);
      return;
    }
    if (locationId) {
      applyCampusLocationQr(targetCampus, locationId, locationPayload ?? undefined);
      initialSelectionRef.current = true;
      window.history.replaceState(window.history.state, "", window.location.pathname);
      return;
    }
    if (placeId || destinationPlaceId) {
      const place = targetCampus.markers.find((marker) => marker.id === (placeId || destinationPlaceId));
      if (place) {
        const routeDestination = destinationPlaceId ? campusPlaceDestination(place, targetCampus) : null;
        if (routeDestination && campusPlaceCanRoute(place, targetCampus, "inbound")) {
          setSelected(null);
          setSelectedCampusPlaceId(null);
          setToCampusPlace(routeDestination);
          setToBuilding(null);
          setFromCampusPlace(null);
          setFromBuilding(null);
          setRoomOrigin(null);
          setRoomDestination(null);
          setFloorView(null);
          setDirectionsMode(true);
          setUseMyLocation(Boolean(youAreHere));
        } else {
          setSelected(null);
          setSelectedCampusPlaceId(place.id);
          setFloorView(null);
          setSelectedRoomContext(null);
          setHighlightedRoom(null);
          setSearch(place.name);
          setSearchFocused(false);
          searchFocusRef.current = { campusPlaceId: place.id };
          setSearchFocusNonce((nonce) => nonce + 1);
        }
      }
      initialSelectionRef.current = true;
      window.history.replaceState(window.history.state, "", window.location.pathname);
      return;
    }
    const building = MOCK_BUILDINGS.find((candidate) =>
      candidate.id === targetId || candidate.code.toLowerCase() === targetId.toLowerCase(),
    );
    if (!building) return;
    if (destinationBuildingId) {
      setSelected(null);
      setToBuilding(building);
      setFromBuilding(null);
      setToCampusPlace(null);
      setFromCampusPlace(null);
      setRoomOrigin(null);
      setRoomDestination(null);
      setFloorView(null);
      setDirectionsMode(true);
      setUseMyLocation(Boolean(youAreHere));
    } else {
      setSelected(building);
    }
    initialSelectionRef.current = true;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [isCampusLoading, availableCampuses, activeCampus, MOCK_BUILDINGS, setSelectedCampusId, applyCampusLocationQr, showError, youAreHere]);

  useEffect(() => {
    if (!pendingLocationScan || isCampusLoading || !activeCampus || activeCampus.id !== pendingLocationScan.campusId) return;
    applyCampusLocationQr(activeCampus, pendingLocationScan.locationId, pendingLocationScan);
    setPendingLocationScan(null);
  }, [pendingLocationScan, isCampusLoading, activeCampus, applyCampusLocationQr]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if (!route || !showEventMaps) return;
    eventMapWasOpenRef.current = false;
    setShowEventMaps(false);
  }, [route, showEventMaps]);

  // ── Route recalculation transition ─────────────────────────────────────
  // Briefly fade out the old route when from/to building changes
  const routeKey = `${useMyLocation ? "here" : fromCampusPlace?.campusPlaceId ?? fromBuilding?.id ?? ""}-${toCampusPlace?.campusPlaceId ?? toBuilding?.id ?? ""}-${mapMode}`;
  // The route planner may refresh the PlannedRoute object without changing
  // the route itself (for example when a published campus snapshot refreshes).
  // Animation effects must follow route meaning, not object identity, or each
  // progress render can restart the RAF loop and reset the walking indicator.
  const walkAnimationKey = route
    ? JSON.stringify([
        routeKey,
        route.dist,
        outdoorWalkingDistance(route),
        route.points.map(({ x, y }) => [x, y]),
        (route.indoorSegments ?? []).map((segment) => [
          segment.buildingId,
          segment.floorNumber,
          segment.distanceM,
        ]),
        route.destinationRoom?.buildingId ?? null,
        route.destinationRoom?.floorNumber ?? null,
        route.destinationRoom?.roomId ?? null,
      ])
    : `${routeKey}:no-route`;

  // ── Walk animation (kiosk-style walking dot + step highlight) ──────────
  useEffect(() => {
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    walkAnimRef.current = null;
    const activeRoute = routeRef.current;
    // Room routes are previewed in the planner while the user is choosing a
    // start. Do not consume that time or begin walking behind the planner;
    // the explicit Navigate action starts the outdoor leg.
    // The indoor-origin and destination-indoor phases own the animated icon
    // while their floor plan is visible. Do not reset the outdoor progress
    // when either phase changes, otherwise the destination floor can reopen
    // the campus animation from zero.
    if (!activeRoute || directionsMode || navigationTransitioning || navigationPhase === "origin-indoor"
      || navigationPhase === "destination-indoor") {
      if (!activeRoute || navigationTransitioning) {
        setWalkProgress(0);
      }
      return;
    }

    setWalkProgress(0);
    if (reducedMotion) {
      setWalkProgress(1);
      return;
    }
    // Use the same distance-proportional visual pace for every journey leg.
    const duration = walkingAnimationDuration(outdoorWalkingDistance(activeRoute), activeRoute.dist);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setWalkProgress(t);
      if (t < 1) walkAnimRef.current = requestAnimationFrame(tick);
    };
    walkAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(walkAnimRef.current ?? 0);
  }, [walkAnimationKey, walkNonce, reducedMotion, directionsMode, navigationTransitioning, navigationPhase]);
  useEffect(() => {
    if (fromBuilding && toBuilding && route) {
      setRouteFading(true);
      const timer = setTimeout(() => setRouteFading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [routeKey]);

  // ── Zoom to route (start + end both in focus) + arrival simulation ────
  /**
   * Frame the active route in the viewport when navigation starts so BOTH
   * endpoints are in focus:
   *   • zoom fits the whole route (padding included), so the destination can
   *     never leave the screen, and
   *   • the viewport centers on the route midpoint — the starting point and
   *     the arrival point are both visible and equally framed.
   * The camera glides to the target through the isolated viewport transform.
   * Pan keeps world point (midX, midY) at
   * the canvas center: pan = z·(center − p).
   */
  const frameRouteView = useCallback((zoomOverride?: number) => {
    if (!route || route.points.length === 0) return;
    const xs = route.points.map(p => p.x);
    const ys = route.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const routeW = maxX - minX, routeH = maxY - minY;
    const fitZoom = Math.min(outdoorCanvasW / (routeW + 200), outdoorCanvasH / (routeH + 200), 2.0);
    // Manual "zoom to route" may zoom in deeper (e.g. ≥ 1.5) but never past
    // the fit zoom, so the whole route — including the end point — always
    // stays inside the viewport.
    const z = clampStudentMapZoom(Math.min(zoomOverride ?? fitZoom, fitZoom));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    // Keep the existing route framing target; only its visual interpolation changes.
    const targetPan = clampMapPan({
      x: z * (outdoorCanvasW / 2 - midX),
      y: z * (outdoorCanvasH / 2 - midY),
    }, z);
    animateCameraTo(targetPan, z);
  }, [animateCameraTo, clampMapPan, route, outdoorCanvasW, outdoorCanvasH]);

  // A room can be selected while its floor plan is still on screen. When the
  // user confirms a route whose origin is inside a building, zoom the floor
  // plan out first so the change of context is visible, then switch to the
  // campus route view.
  useEffect(() => {
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    navigationTransitionAnimRef.current = null;

    if (!navigationTransitioning || !isFloorMode || !route) return;

    cancelCameraAnimation();
    const startZoom = zoomRef.current;
    const startPan = panRef.current;
    const targetZoom = 1;
    const duration = reducedMotion ? 0 : 650;
    const startedAt = performance.now();

    const finish = () => {
      setPan({ x: 0, y: 0 });
      setFloorView(null);
      setIndoorRoute(null);
      setActiveRouteRoom(null);
      setHighlightedRoom(null);
      setStairLoading(null);

      if (route.points.length > 0) {
        if (platformSettingsReady && platformSettings.autoFocusRoute) frameRouteView();
      } else {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      setNavigationTransitioning(false);
    };

    if (duration === 0) {
      finish();
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setZoom(startZoom + (targetZoom - startZoom) * eased);
      setPan({
        x: startPan.x * (1 - eased),
        y: startPan.y * (1 - eased),
      });

      if (progress < 1) {
        navigationTransitionAnimRef.current = requestAnimationFrame(tick);
      } else {
        navigationTransitionAnimRef.current = null;
        finish();
      }
    };

    navigationTransitionAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
  }, [cancelCameraAnimation, navigationTransitioning, isFloorMode, route, frameRouteView, reducedMotion, platformSettingsReady, platformSettings.autoFocusRoute]);

  // When a route is computed (navigation starts), zoom in so BOTH the
  // starting point and the end point are in focus — the viewport centers
  // on the route midpoint and the whole route stays on screen.
  useEffect(() => {
    // Room routes are previewed in the planner. Their campus framing is
    // applied by the transition above only after Navigate is confirmed.
    if (platformSettingsReady && platformSettings.autoFocusRoute && route && route.points.length > 0 && !route.destinationRoom) {
      frameRouteView();
      setShowArrival(false);
    } else {
      setShowArrival(false);
    }
  }, [route, frameRouteView, platformSettingsReady, platformSettings.autoFocusRoute]);

  // ── Pan to selected building on click (smooth animated lerp) ──────
  useEffect(() => {
    const isSearchFocus = Boolean(selected && searchFocusRef.current
      && searchFocusRef.current.buildingId === selected.id
      && !searchFocusRef.current.roomId);
    if (selected && !isFloorMode && isSearchFocus) {
      const pos = B_POS[selected.id];
      if (!pos) return;
      const cx = pos.x + pos.w / 2;
      const cy = pos.y + pos.h / 2;
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
      const currentZoom = zoomRef.current;
      const targetZoom = clampStudentMapZoom(Math.max(currentZoom, 1.65));
      const mapRect = mapContainerRef.current?.getBoundingClientRect();
      const detailsPanelWidth = !isMobile
        ? Math.min(390, Math.max(340, window.innerWidth * 0.32))
        : 0;
      const targetPan = clampMapPan(getBuildingFocusPan({
        buildingCenter: { x: cx, y: cy },
        canvasW: outdoorCanvasW,
        canvasH: outdoorCanvasH,
        zoom: targetZoom,
        mapWidth: Math.max(320, (mapRect?.width || window.innerWidth) - detailsPanelWidth),
        mapHeight: mapRect?.height || window.innerHeight,
        isMobile,
      }), targetZoom);
      animateCameraTo(targetPan, targetZoom);
      searchFocusRef.current = null;
    }
  }, [animateCameraTo, clampMapPan, selected?.id, B_POS, isFloorMode, outdoorCanvasH, outdoorCanvasW, searchFocusNonce]);

  // Keep mobile building destinations in the usable area above the route
  // planner, just as indoor room destinations are focused above the sheet.
  useLayoutEffect(() => {
    const mobileMap = (mapContainerRef.current?.clientWidth ?? 0) < 768;
    const shouldFocusDestination = mobileMap
      && directionsMode
      && navigationPhase === "idle"
      && !navigationTransitioning
      && !isFloorMode
      && !roomDestination
      && Boolean(toBuilding);
    if (!shouldFocusDestination || !toBuilding) {
      lastDestinationBuildingFocusKeyRef.current = null;
      if (roomFocusAnimationRef.current) cancelCameraAnimation();
      return;
    }

    const position = B_POS[toBuilding.id];
    if (!position) return;
    const focusKey = `${toBuilding.id}:route-planner`;
    if (lastDestinationBuildingFocusKeyRef.current === focusKey) return;

    const surface = mapContainerRef.current;
    const svg = svgRef.current;
    const surfaceRect = surface?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    if (!surface || !surfaceRect || !svgRect || svgRect.width <= 0 || svgRect.height <= 0) return;

    const mapScale = Math.min(svgRect.width / outdoorCanvasW, svgRect.height / outdoorCanvasH);
    if (!Number.isFinite(mapScale) || mapScale <= 0) return;
    const viewportOffset = {
      x: Math.max(0, (svgRect.width - outdoorCanvasW * mapScale) / (2 * mapScale)),
      y: Math.max(0, (svgRect.height - outdoorCanvasH * mapScale) / (2 * mapScale)),
    };
    const safePx = { left: 12, right: 12, top: 12, bottom: 12 };
    const plannerRect = surface.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")
      ?.getBoundingClientRect()
      ?? document.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")?.getBoundingClientRect();
    if (plannerRect && plannerRect.width > 0 && plannerRect.height > 0) {
      const plannerCoversMobileWidth = plannerRect.width >= surfaceRect.width * 0.72;
      if (plannerCoversMobileWidth || plannerRect.top > (surfaceRect.top + surfaceRect.bottom) / 2) {
        safePx.bottom = Math.max(safePx.bottom, surfaceRect.bottom - plannerRect.top + 12);
      } else if (plannerRect.left <= surfaceRect.left + 24) {
        safePx.left = Math.max(safePx.left, plannerRect.right - surfaceRect.left + 12);
      } else if (plannerRect.right >= surfaceRect.right - 24) {
        safePx.right = Math.max(safePx.right, surfaceRect.right - plannerRect.left + 12);
      }
    }

    const focus = getStudentRoomFocusCamera({
      mapWidth: outdoorCanvasW,
      mapHeight: outdoorCanvasH,
      roomBounds: { x: position.x, y: position.y, width: position.w, height: position.h },
      currentPan: panRef.current,
      zoom: zoomRef.current,
      insets: {
        left: safePx.left / mapScale,
        right: safePx.right / mapScale,
        top: safePx.top / mapScale,
        bottom: safePx.bottom / mapScale,
      },
      viewportOffset,
    });
    lastDestinationBuildingFocusKeyRef.current = focusKey;
    if (focus.shouldMove) {
      animateCameraTo(focus.pan, focus.zoom, "room-focus");
    } else if (roomFocusAnimationRef.current) {
      cancelCameraAnimation();
    }
  }, [animateCameraTo, B_POS, cancelCameraAnimation, clampMapPan, directionsMode, isFloorMode, navigationPhase, navigationTransitioning, outdoorCanvasH, outdoorCanvasW, roomDestination, toBuilding]);

  useEffect(() => {
    const target = searchFocusRef.current;
    if (!selectedCampusPlace || !target?.campusPlaceId || target.campusPlaceId !== selectedCampusPlace.id || isFloorMode) return;
    const mapRect = mapContainerRef.current?.getBoundingClientRect();
    if (!mapRect) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const usableWidth = !isMobile ? mapRect.width - Math.min(390, Math.max(340, window.innerWidth * 0.32)) : mapRect.width;
    const currentZoom = zoomRef.current;
    const screenX = viewCX * (1 - currentZoom) + panRef.current.x + selectedCampusPlace.x * currentZoom;
    const screenY = viewCY * (1 - currentZoom) + panRef.current.y + selectedCampusPlace.y * currentZoom;
    const minY = isMobile ? 84 : 24;
    const maxY = mapRect.height - (isMobile ? 230 : 24);
    if (screenX >= 20 && screenX <= usableWidth - 20 && screenY >= minY && screenY <= maxY) {
      searchFocusRef.current = null;
      return;
    }
    const nextPan = clampMapPan({
      x: usableWidth * 0.5 - viewCX * (1 - currentZoom) - selectedCampusPlace.x * currentZoom,
      y: Math.max(minY + 20, maxY * 0.5) - viewCY * (1 - currentZoom) - selectedCampusPlace.y * currentZoom,
    }, currentZoom);
    animateCameraTo(nextPan, currentZoom);
    searchFocusRef.current = null;
  }, [selectedCampusPlace, searchFocusNonce, isFloorMode, viewCX, viewCY, clampMapPan, animateCameraTo]);

  // Room focus is shared by direct taps and search selection. Measure the
  // visible overlays after they commit, then pan only if the actual room shape
  // is outside that safe viewport. Keep current zoom and soft floor bounds.
  useLayoutEffect(() => {
    if (!isFloorMode || !floorView || !activeFloorPlan) return;
    const searchTarget = searchFocusRef.current;
    const searchMatchesFloor = Boolean(searchTarget?.roomId
      && searchTarget.buildingId === floorView.building.id
      && searchTarget.floorNumber === floorView.floor);
    const contextMatchesFloor = Boolean(selectedRoomContext
      && selectedRoomContext.buildingId === floorView.building.id
      && selectedRoomContext.floorNumber === floorView.floor);
    // While choosing a room destination, keep that room in the visible map
    // area above the route planner. The planner remains the same size; its
    // measured bounds are already included in the safe viewport below.
    const destinationMatchesFloor = Boolean(directionsMode
      && navigationPhase === "idle"
      && !navigationTransitioning
      && roomDestination
      && roomDestination.buildingId === floorView.building.id
      && roomDestination.floorNumber === floorView.floor);
    if (!searchMatchesFloor && !contextMatchesFloor && !destinationMatchesFloor) {
      lastRoomFocusKeyRef.current = null;
      if (roomFocusAnimationRef.current) cancelCameraAnimation();
      return;
    }
    const roomId = searchMatchesFloor
      ? searchTarget?.roomId
      : destinationMatchesFloor
        ? roomDestination?.roomId
        : contextMatchesFloor
          ? selectedRoomContext?.roomId
          : undefined;
    if (!roomId) return;
    const room = activeFloorPlan.rooms.find((candidate) => candidate.id === roomId);
    if (!room) return;
    if (!interactiveFloorRoomIds.has(roomId)) {
      if (searchMatchesFloor) searchFocusRef.current = null;
      lastRoomFocusKeyRef.current = null;
      return;
    }
    // Opening the planner changes the room's safe viewport even if the same
    // room was focused moments earlier from its selection card.
    const focusKey = `${floorView.building.id}:${floorView.floor}:${room.id}:${directionsMode ? "planner" : "map"}`;
    if (lastRoomFocusKeyRef.current === focusKey) {
      if (searchMatchesFloor) searchFocusRef.current = null;
      return;
    }

    const surface = mapContainerRef.current;
    const svg = svgRef.current;
    const surfaceRect = surface?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    if (!surface || !surfaceRect || !svgRect) return;
    const hasMeasuredSvg = svgRect.width > 0 && svgRect.height > 0;
    const mapScale = hasMeasuredSvg
      ? Math.min(svgRect.width / Math.max(1, viewportCanvasW), svgRect.height / Math.max(1, viewportCanvasH))
      : 1;
    if (!Number.isFinite(mapScale) || mapScale <= 0) return;
    const mapRect = hasMeasuredSvg ? {
      left: svgRect.left,
      top: svgRect.top,
      right: svgRect.right,
      bottom: svgRect.bottom,
    } : {
      left: surfaceRect.left,
      top: surfaceRect.top,
      right: surfaceRect.left + viewportCanvasW,
      bottom: surfaceRect.top + viewportCanvasH,
    };
    // The floor SVG uses xMidYMid meet. On a portrait phone that leaves large
    // letterbox bands above and below the viewBox; camera panning can still
    // move a room into those bands, so include them in the focus viewport.
    const viewportOffset = hasMeasuredSvg ? {
      x: Math.max(0, (svgRect.width - viewportCanvasW * mapScale) / (2 * mapScale)),
      y: Math.max(0, (svgRect.height - viewportCanvasH * mapScale) / (2 * mapScale)),
    } : { x: 0, y: 0 };
    const safePx = { left: 12, right: 12, top: 12, bottom: 12 };
    const getRect = (selector: string) => surface.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const overlapsMapX = (rect: DOMRect) => rect.right > mapRect.left && rect.left < mapRect.right;
    const cardRect = getRect("[data-testid='student-selected-place-card']");
    const headerRect = getRect("[data-map-search-header='true']");
    const plannerRect = getRect("[data-testid='route-planner-dialog']")
      ?? document.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")?.getBoundingClientRect()
      ?? null;
    const floorPickerRect = getRect("[data-testid='student-floor-picker']");
    const utilityRect = getRect(".student-map-utility-stack, .student-map-zoom-controls");
    const mobileMap = surfaceRect.width < 768;

    if (headerRect && overlapsMapX(headerRect)) {
      safePx.top = Math.max(safePx.top, headerRect.bottom - mapRect.top + 12);
    }
    if (cardRect && overlapsMapX(cardRect)) {
      if (mobileMap || cardRect.width >= (mapRect.right - mapRect.left) * 0.55) {
        safePx.top = Math.max(safePx.top, cardRect.bottom - mapRect.top + 12);
      } else if (cardRect.left > (mapRect.left + mapRect.right) / 2) {
        safePx.right = Math.max(safePx.right, mapRect.right - cardRect.left + 12);
      } else {
        safePx.left = Math.max(safePx.left, cardRect.right - mapRect.left + 12);
      }
    }
    if (plannerRect && plannerRect.width > 0 && plannerRect.height > 0) {
      const plannerCoversMobileWidth = mobileMap
        && plannerRect.width >= (mapRect.right - mapRect.left) * 0.72;
      if (mobileMap && (plannerCoversMobileWidth || plannerRect.top > (mapRect.top + mapRect.bottom) / 2)) {
        safePx.bottom = Math.max(safePx.bottom, mapRect.bottom - plannerRect.top + 12);
      } else if (plannerRect.left <= mapRect.left + 24) {
        safePx.left = Math.max(safePx.left, plannerRect.right - mapRect.left + 12);
      } else if (plannerRect.right >= mapRect.right - 24) {
        safePx.right = Math.max(safePx.right, mapRect.right - plannerRect.left + 12);
      }
    }
    if (floorPickerRect && floorPickerRect.top > (mapRect.top + mapRect.bottom) / 2) {
      safePx.bottom = Math.max(safePx.bottom, mapRect.bottom - floorPickerRect.top + 12);
    }
    if (utilityRect && utilityRect.right >= mapRect.right - 24) {
      safePx.right = Math.max(safePx.right, mapRect.right - utilityRect.left + 12);
    } else if (utilityRect && utilityRect.top > (mapRect.top + mapRect.bottom) / 2) {
      safePx.bottom = Math.max(safePx.bottom, mapRect.bottom - utilityRect.top + 12);
    }

    const points = roomOutlinePoints(room);
    const bounds = roomShapeBounds(points);
    const focus = getStudentRoomFocusCamera({
      mapWidth: viewportCanvasW,
      mapHeight: viewportCanvasH,
      roomBounds: { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h },
      currentPan: panRef.current,
      zoom: zoomRef.current,
      insets: {
        left: safePx.left / mapScale,
        right: safePx.right / mapScale,
        top: safePx.top / mapScale,
        bottom: safePx.bottom / mapScale,
      },
      viewportOffset,
      contentOffset: { x: floorViewport.offsetX, y: floorViewport.offsetY },
    });
    lastRoomFocusKeyRef.current = focusKey;
    if (focus.shouldMove) {
      animateCameraTo(clampMapPan(focus.pan, focus.zoom), focus.zoom, "room-focus");
    } else if (roomFocusAnimationRef.current) {
      // A newly selected room is already safe at the live camera position, so
      // stop the previous room's unfinished focus instead of finishing stale motion.
      cancelCameraAnimation();
    }
    if (searchMatchesFloor) searchFocusRef.current = null;
  }, [activeFloorPlan, animateCameraTo, cancelCameraAnimation, clampMapPan, directionsMode, floorView, floorViewport, interactiveFloorRoomIds, isFloorMode, navigationPhase, navigationTransitioning, roomDestination?.buildingId, roomDestination?.floorNumber, roomDestination?.roomId, searchFocusNonce, selectedRoomContext?.buildingId, selectedRoomContext?.floorNumber, selectedRoomContext?.roomId, viewportCanvasH, viewportCanvasW]);

  const selectBuilding = useCallback((b: Building|null) => {
    cancelCameraAnimation();
    setMobileBuildingSheetState("default");
    setSelectedCampusPlaceId(null);
    setSelected(b);
    setSearchFocused(false); setSearch(""); setShowQR(false);
    if (b) {
      if (!recentSearches.includes(b.name))
        setRecentSearches(prev => [b.name, ...prev].slice(0, 5));
      saveLastViewed({ buildingId: b.id, zoom });
    }
  }, [cancelCameraAnimation, recentSearches, zoom]);

  const selectCampusPlace = useCallback((place: CampusMarker | null) => {
    cancelCameraAnimation();
    setSelected(null);
    setSelectedCampusPlaceId(place?.id ?? null);
    setShowQR(false);
    if (!place) {
      searchFocusRef.current = null;
      return;
    }
    setFloorView(null);
    setSelectedRoomContext(null);
    setHighlightedRoom(null);
    setSearch(place.name);
    dismissSearch();
    searchFocusRef.current = { campusPlaceId: place.id };
    setSearchFocusNonce((nonce) => nonce + 1);
  }, [cancelCameraAnimation, dismissSearch]);

  /**
   * Start a fresh route-planning session in the configured default mode.
   * The global map can retain a previous SOS selection after navigation ends;
   * do not let that evacuate mode silently replace a new room destination.
   * If the planner is already open, retain the mode the user deliberately
   * selected there.
   */
  const prepareFreshRoutePlannerMode = useCallback(() => {
    if (directionsMode) return;
    routeModeTouchedRef.current = false;
    setMapMode(platformSettings.defaultRouteMode);
  }, [directionsMode, platformSettings.defaultRouteMode]);

  /** Open the route planner as the only active mobile map sheet. */
  const openDirections = useCallback(() => {
    prepareFreshRoutePlannerMode();
    setSelected(null);
    setSelectedCampusPlaceId(null);
    setShowQR(false);
    setSearch("");
    setSearchFocused(false);
    setShowCampusSelector(false);
    setRoutePlannerEndpoint(null);
    if (!directionsMode) setUseMyLocation(Boolean(youAreHere));
    setDirectionsMode(true);
  }, [directionsMode, prepareFreshRoutePlannerMode, youAreHere]);

  const handleSelectSearchResult = useCallback((item: SearchResult) => {
    usageAnalyticsService.track("search", item.name);
    if (item.campusPlaceId) {
      const place = activeCampus?.markers.find((marker) => marker.id === item.campusPlaceId);
      if (place) selectCampusPlace(place);
    } else if (item.kind === "building" || !item.buildingId) {
      const b = MOCK_BUILDINGS.find((building) => building.id === item.buildingId || building.name.toLowerCase() === item.name.toLowerCase());
      if (b) {
        searchFocusRef.current = { buildingId: b.id };
        setFloorView(null);
        selectBuilding(b);
        setSearchFocusNonce((nonce) => nonce + 1);
      }
    } else {
      const isRoomResult = item.kind === "room" || item.kind === "office" || item.kind === "laboratory" || item.kind === "facility";
      if (isRoomResult) {
        const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === item.buildingId);
        const publishedFloor = campusBuilding?.floors.find((floor) =>
          (item.floorId ? floor.id === item.floorId : false)
          || (item.floorNumber !== undefined && floor.number === item.floorNumber),
        );
        if (!campusBuilding || !publishedFloor
          || !navigableRoomKeys.has(authoredRoomNavigationKey(campusBuilding.id, publishedFloor.id, item.id))) {
          // Ignore stale/non-navigable room results without selecting or focusing
          // the underlying visual-only room.
          setSearch(item.name);
          dismissSearch();
          return;
        }
      }
      const b = MOCK_BUILDINGS.find((building) => building.id === item.buildingId);
      if (b) {
        searchFocusRef.current = { buildingId: b.id, roomId: item.id, floorNumber: item.floorNumber ?? 1 };
        lastRoomFocusKeyRef.current = null;
        // Selecting a fresh room target cancels any previous room destination
        // (the floor plan opens with the room highlighted; the "Directions to
        // room" chip offers full navigation).
        setRoomDestination(null);
        setIndoorRoute(null);
        selectBuilding(b);
        if (item.floorNumber !== undefined) {
          setFloorView({ building: b, floor: item.floorNumber });
        } else {
          setFloorView({ building: b, floor: 1 });
        }
        setHighlightedRoom(item.id);
        setSearchFocusNonce((nonce) => nonce + 1);
      }
    }
    setSearch(item.name);
    dismissSearch();
  }, [activeCampus, MOCK_BUILDINGS, dismissSearch, navigableRoomKeys, selectBuilding, selectCampusPlace]);

  const startDirectionsTo = useCallback((b: Building) => {
    setToBuilding(b); setFromBuilding(null);
    setToCampusPlace(null); setFromCampusPlace(null);
    setRoomOrigin(null);
    setRoomDestination(null); // building directions, not room directions
    setNavigationPhase("idle");
    openDirections();
  }, [openDirections]);

  const routeToCampusPlace = useCallback((place: CampusMarker) => {
    const destination = campusPlaceDestination(place, activeCampus);
    if (!destination || !campusPlaceCanRoute(place, activeCampus, "inbound")) {
      showWarning("Directions unavailable", { description: "This campus place is not connected to the walking network yet." });
      return;
    }
    setToCampusPlace(destination);
    setToBuilding(null);
    setRoomDestination(null);
    if (!directionsMode) {
      setFromCampusPlace(null);
      setFromBuilding(null);
      setRoomOrigin(null);
    }
    setNavigationPhase("idle");
    setSelectedCampusPlaceId(null);
    openDirections();
  }, [activeCampus, directionsMode, openDirections, showWarning]);

  const routeFromCampusPlace = useCallback((place: CampusMarker) => {
    const origin = campusPlaceDestination(place, activeCampus);
    if (!origin || !campusPlaceCanRoute(place, activeCampus, "outbound")) {
      showWarning("Directions unavailable", { description: "This campus place is not connected to the walking network yet." });
      return;
    }
    setFromCampusPlace(origin);
    setFromBuilding(null);
    setRoomOrigin(null);
    if (!directionsMode) {
      setToCampusPlace(null);
      setToBuilding(null);
      setRoomDestination(null);
    }
    setUseMyLocation(false);
    setNavigationPhase("idle");
    setSelectedCampusPlaceId(null);
    openDirections();
    setUseMyLocation(false);
  }, [activeCampus, directionsMode, openDirections, showWarning]);

  // ── Save recent destination once a route is successfully computed ──
  const lastSavedDestRef = useRef<string | null>(null);
  useEffect(() => {
    const destinationId = toCampusPlace?.campusPlaceId ?? toBuilding?.id;
    const destinationName = toCampusPlace?.label ?? toBuilding?.name;
    if (route && destinationId && destinationName && lastSavedDestRef.current !== destinationId) {
      lastSavedDestRef.current = destinationId;
      studentAccountService.addRecentDestination({
        id: destinationId,
        name: destinationName,
        code: toCampusPlace?.code ?? toBuilding?.code,
      });
      // Track the planned route for usage analytics (from → to).
      const fromName = useMyLocation ? "You are here" : (fromCampusPlace?.label ?? fromBuilding?.name ?? "?");
      usageAnalyticsService.track("route", `${fromName} → ${destinationName}`);
    }
    if (!destinationId) lastSavedDestRef.current = null;
  }, [route, toBuilding, toCampusPlace, fromBuilding, fromCampusPlace, useMyLocation]);

  const toggleSave = useCallback((id: string) => {
    const b = selected?.id === id ? selected : MOCK_BUILDINGS.find((item) => item.id === id || item.code.toLowerCase() === id.toLowerCase());
    const canonicalId = b?.id ?? id;
    const aliases = [canonicalId, b?.code, b?.code?.toLowerCase()].filter((value): value is string => Boolean(value));
    const wasSaved = aliases.some((alias) => saved.has(alias));
    const previous = saved;
    const next = new Set(saved);
    aliases.forEach((alias) => (wasSaved ? next.delete(alias) : next.add(alias)));
    setSaved(next);
    void studentAccountService.toggleSaveBuilding(canonicalId, activeCampus?.id).catch(() => {
      setSaved(previous);
      showError("Favorite could not be updated");
    });
  }, [activeCampus?.id, MOCK_BUILDINGS, saved, selected, showError]);

  // ── Search results (buildings on campus, rooms on floor plan) ──────────
  const buildingResults = !isFloorMode && debouncedSearch
    ? MOCK_BUILDINGS.filter(b =>
        b.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        b.code.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : [];
  const roomResults = isFloorMode && debouncedSearch
    ? (currentFloor?.rooms ?? []).filter(r =>
        r.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        r.type.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : [];

const buildingFill = (id: string) =>
  mapMode === "emergency" ? "#991b1b" : mapMode === "accessible" ? "#14532d" : B_POS[id]?.color ?? "var(--map-route)";

  // Only show a transition when the active campus selection actually changes.
  // Background snapshot refreshes used to toggle isCampusLoading and trigger
  // this overlay even when the student stayed on the same campus.
  useEffect(() => {
    if (!selectedCampusId) {
      previousCampusSelectionRef.current = null;
      return;
    }
    const previousCampusId = previousCampusSelectionRef.current;
    previousCampusSelectionRef.current = selectedCampusId;
    // Initial selection is data resolution, not a user-visible campus switch.
    if (!previousCampusId || previousCampusId === selectedCampusId) return;
    setCampusTransitioning(true);
    clearTimeout(transitioningRef.current);
    transitioningRef.current = setTimeout(() => setCampusTransitioning(false), reducedMotion ? 120 : 360);
    return () => clearTimeout(transitioningRef.current);
  }, [selectedCampusId, reducedMotion]);

  // ── Indoor room selection ───────────────────────────────────────────
  // Selecting a room is passive. It only highlights the room and exposes the
  // Directions action; route computation starts from startRoomDirections.
  const clearIndoorRoute = useCallback(() => {
    setIndoorRoute(null);
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
    setIndoorWalkProgress(0);
  }, []);

  // ── Indoor walk animation state ────────────────────────────────────────
  // Separate from the outdoor walk animation. It is used for both the
  // source-room → exit leg and the destination entrance → room leg, reusing
  // the same animated avatar style from RouteMapOverlay.
  const [indoorWalkProgress, setIndoorWalkProgress] = useState(0);
  const [indoorWalkNonce, setIndoorWalkNonce] = useState(0);
  // Continue the journey inside the destination floor after the outdoor
  // walking animation has handed off to the floor plan.
  useEffect(() => {
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    indoorWalkAnimRef.current = null;

    if (!isFloorMode || !indoorRoute || indoorRoute.waypoints.length === 0) {
      setIndoorWalkProgress(0);
      return;
    }

    if (reducedMotion || indoorRoute.waypoints.length === 1) {
      setIndoorWalkProgress(1);
      return;
    }

    setIndoorWalkProgress(0);
    const duration = walkingAnimationDuration(indoorRoute.distanceMeters, route?.dist ?? indoorRoute.distanceMeters);
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setIndoorWalkProgress(progress);
      if (progress < 1) indoorWalkAnimRef.current = requestAnimationFrame(tick);
    };
    indoorWalkAnimRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
  }, [isFloorMode, indoorRoute, indoorWalkNonce, reducedMotion, route?.dist]);

  // Finish every authored source-building floor leg before handing off to the
  // campus. Otherwise an upper-floor origin jumps outdoors after its first leg.
  useEffect(() => {
    if (!platformSettingsReady || navigationPhase !== "origin-indoor" || indoorWalkProgress < 1 || !route || !roomOrigin) return;
    const nextIndex = originIndoorSegmentIndex + 1;
    const nextSegment = originIndoorSegments[nextIndex];
    if (nextSegment) {
      if (originIndoorTransitionRef.current) return;
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === roomOrigin.buildingId);
      if (!building) return;
      const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === roomOrigin.buildingId);
      const currentSegment = originIndoorSegments[originIndoorSegmentIndex];
      const currentFloor = indoorSegmentFloorNumber(currentSegment, campusBuilding, roomOrigin.floorNumber);
      const nextFloor = indoorSegmentFloorNumber(nextSegment, campusBuilding, roomOrigin.floorNumber);
      if (nextFloor === undefined) return;
      if (nextFloor !== currentFloor && !platformSettings.autoFollowFloors) return;
      const transition = route.transitionDetails?.find((candidate) =>
        candidate.fromFloorId === currentSegment?.floorId && candidate.toFloorId === nextSegment.floorId,
      );
      const kind = transition?.kind === "elevator" ? "elevator" : "stairs";
      const direction = nextFloor >= (currentFloor ?? nextFloor) ? "up" : "down";
      const label = nextFloor === 1 ? "Ground Floor" : `Floor ${nextFloor}`;
      const advance = () => {
        originIndoorTransitionRef.current = null;
        setOriginIndoorSegmentIndex(nextIndex);
        setFloorView({ building, floor: nextFloor });
        setHighlightedRoom(null);
        setIndoorRoute(indoorRouteFromSegment(nextSegment));
        setIndoorWalkProgress(0);
        setIndoorWalkNonce((nonce) => nonce + 1);
        setStairLoading(null);
      };
      if (nextFloor === currentFloor || reducedMotion) {
        advance();
        return;
      }
      const transitionName = transition?.label.trim() || kind;
      setStairLoading({ dir: direction, label: `${label} via ${transitionName}` });
      originIndoorTransitionRef.current = setTimeout(advance, 750);
      return () => {
        if (originIndoorTransitionRef.current) {
          clearTimeout(originIndoorTransitionRef.current);
          originIndoorTransitionRef.current = null;
        }
      };
    }
    if (route.points.length < 2 && !route.emergencyDestinationLabel) {
      setNavigationPhase("idle");
      return;
    }
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    indoorWalkAnimRef.current = null;
    setNavigationPhase("outdoor");
    setNavigationTransitioning(true);
  }, [navigationPhase, indoorWalkProgress, route, roomOrigin, originIndoorSegments, originIndoorSegmentIndex, MOCK_BUILDINGS, activeCampus, reducedMotion, platformSettingsReady, platformSettings.autoFollowFloors]);

  // A destination-room route may contain multiple floor-local segments in
  // the destination building. Do not jump from the outdoor entrance directly
  // to the target floor: finish the current segment, show the authored stair
  // or elevator transition, then mount the next floor segment.
  useEffect(() => {
    const destination = route?.destinationRoom;
    if (
      !platformSettingsReady
      || navigationPhase !== "destination-indoor"
      || indoorWalkProgress < 1
      || !destination
      || destinationIndoorSegmentIndex < 0
    ) return;

    const nextIndex = destinationIndoorSegmentIndex + 1;
    const nextSegment = destinationIndoorSegments[nextIndex];
    if (!nextSegment || destinationIndoorTransitionRef.current) return;

    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === destination.buildingId);
    if (!building) return;
    const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === destination.buildingId);
    const currentSegment = destinationIndoorSegments[destinationIndoorSegmentIndex];
    const currentFloor = floorView?.floor
      ?? indoorSegmentFloorNumber(currentSegment, campusBuilding, destination.floorNumber);
    const nextFloor = indoorSegmentFloorNumber(nextSegment, campusBuilding, destination.floorNumber);
    if (nextFloor === undefined) return;
    if (nextFloor !== currentFloor && !platformSettings.autoFollowFloors) return;

    const transition = route.transitionDetails?.find((candidate) =>
      candidate.fromFloorId === currentSegment?.floorId && candidate.toFloorId === nextSegment.floorId,
    );
    const transitionKind = transition?.kind === "elevator" ? "elevator" : "stairs";
    const direction = nextFloor >= (currentFloor ?? nextFloor) ? "up" : "down";
    const nextFloorLabel = nextFloor === 1 ? "Ground Floor" : `Floor ${nextFloor}`;
    const shouldAnimateTransition = nextFloor !== currentFloor && !reducedMotion;

    const advanceToNextFloor = () => {
      destinationIndoorTransitionRef.current = null;
      setDestinationIndoorSegmentIndex(nextIndex);
      setFloorView({ building, floor: nextFloor });
      setHighlightedRoom(nextFloor === destination.floorNumber ? destination.roomId : null);
      setActiveRouteRoom(destination.roomId);
      setIndoorRoute(indoorRouteFromSegment(nextSegment));
      setIndoorWalkProgress(0);
      setIndoorWalkNonce((nonce) => nonce + 1);
      setStairLoading(null);
    };

    if (!shouldAnimateTransition) {
      advanceToNextFloor();
      return;
    }

    const transitionName = transition?.label.trim() || transitionKind;
    setStairLoading({ dir: direction, label: `${nextFloorLabel} via ${transitionName}` });
    destinationIndoorTransitionRef.current = setTimeout(advanceToNextFloor, 750);
    return () => {
      if (destinationIndoorTransitionRef.current) {
        clearTimeout(destinationIndoorTransitionRef.current);
        destinationIndoorTransitionRef.current = null;
      }
    };
  }, [
    navigationPhase,
    indoorWalkProgress,
    route,
    destinationIndoorSegments,
    destinationIndoorSegmentIndex,
    floorView,
    activeCampus,
    MOCK_BUILDINGS,
    reducedMotion,
    platformSettingsReady,
    platformSettings.autoFollowFloors,
  ]);

  /**
   * Start full navigation to a room/floor the student clicked inside the
   * floor plan. With an outdoor start ("You are here" or a different from
   * building) the journey plays on the campus map and auto-enters the
   * building when the walking dot arrives. Without one, the destination
   * building itself is the start and the indoor leg is shown right away.
   */
  const roomEndpointFromFloor = useCallback((roomId: string): RoomDest | null => {
    const fv = floorViewRef.current;
    if (!fv) return null;
    const room =
      activeFloorPlan?.rooms.find((candidate) => candidate.id === roomId) ??
      currentFloor?.rooms.find((candidate) => candidate.id === roomId);
    if (!room) return null;
    const publishedFloor = activeCampus?.buildings
      .find((building) => building.id === fv.building.id)
      ?.floors.find((floor) => floor.number === fv.floor);
    const floorId = activeFloorPlan?.id ?? publishedFloor?.id;
    if (!floorId || !navigableRoomKeys.has(authoredRoomNavigationKey(fv.building.id, floorId, roomId))) return null;
    const publishedRoom = publishedFloor?.rooms.find((candidate) => candidate.id === roomId);
    return {
      type: "room",
      buildingId: fv.building.id,
      floorNumber: fv.floor,
      roomId,
      roomName: room.name,
      buildingLabel: fv.building.name,
      buildingCode: fv.building.code,
      floorLabel: publishedFloor?.label ?? currentFloor?.label ?? `Floor ${fv.floor}`,
      accessNodeId: publishedRoom?.accessNodeId,
      accessDoorId: publishedRoom?.accessDoorId,
      accessDoorIds: publishedRoom?.accessDoorIds,
    };
  }, [activeCampus, activeFloorPlan, currentFloor, navigableRoomKeys]);

  // Both planner endpoints use the active published campus catalog rather
  // than legacy floor-plan data. Floor Editor's authored room/access-node
  // membership is the source of truth for which physical rooms may be chosen.
  const roomDestinationCatalog = useMemo<RoomDest[]>(() => {
    if (!activeCampus) return [];
    const buildingsById = new Map(MOCK_BUILDINGS.map((building) => [building.id, building]));
    return activeCampus.buildings.flatMap((campusBuilding) => {
      const building = buildingsById.get(campusBuilding.id);
      if (!building) return [];
      return campusBuilding.floors.flatMap((floor) => floor.rooms
        .filter((room) => {
          const isAuthoredDestination = navigableRoomKeys.has(authoredRoomNavigationKey(campusBuilding.id, floor.id, room.id));
          return room.visible !== false && isAuthoredDestination;
        })
        .map((room) => ({
          type: "room" as const,
          buildingId: campusBuilding.id,
          floorNumber: floor.number,
          roomId: room.id,
          roomName: room.name,
          buildingLabel: building.name,
          buildingCode: building.code,
          floorLabel: floor.label,
          accessNodeId: room.accessNodeId,
          accessDoorId: room.accessDoorId,
          accessDoorIds: room.accessDoorIds,
        })));
    });
  }, [activeCampus, MOCK_BUILDINGS, navigableRoomKeys]);

  const selectRoomDestination = useCallback((catalogKey: string) => {
    const target = roomDestinationCatalog.find((room) =>
      `${room.buildingId}:${room.floorNumber}:${room.roomId}` === catalogKey,
    );
    if (!target) {
      setRoomDestination(null);
      setToBuilding(null);
      setSelectedRoomContext(null);
      return;
    }
    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === target.buildingId);
    if (!building) return;
    // Deliberately preserve roomOrigin so same-building room→room planning
    // remains available from the visible planner.
    setRoomDestination(target);
    setToBuilding(building);
    setActiveRouteRoom(target.roomId);
    setHighlightedRoom(target.roomId);
    setSelectedRoomContext(null);
  }, [MOCK_BUILDINGS, roomDestinationCatalog]);

  const useRoomAsStart = useCallback((origin: RoomDest) => {
    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === origin.buildingId);
    if (!building) return;

    setRoomOrigin(origin);
    setRoomDestination(null);
    setFromBuilding(building);
    setToBuilding(null);
    setUseMyLocation(false);
    setDirectionsMode(true);
    setRoutePlannerEndpoint(null);
    setSelectedRoomContext(null);
    setNavigationTransitioning(false);
    setNavigationPhase("idle");
    setSearch("");
    setSearchFocused(false);
    setHighlightedRoom(origin.roomId);
    setActiveRouteRoom(origin.roomId);
    setIndoorRoute(null);
    setIndoorWalkProgress(0);
    setWalkProgress(0);
  }, [MOCK_BUILDINGS]);

  const useRoomAsDestination = useCallback((target: RoomDest) => {
    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === target.buildingId);
    if (!building) return;
    prepareFreshRoutePlannerMode();
    setRoomDestination(target);
    setToBuilding(building);
    setDirectionsMode(true);
    setRoutePlannerEndpoint(null);
    setSelectedRoomContext(null);
    setNavigationPhase("idle");
    setNavigationTransitioning(false);
    setSearch("");
    setSearchFocused(false);
    setHighlightedRoom(target.roomId);
    setActiveRouteRoom(target.roomId);
    setIndoorRoute(null);
    setIndoorWalkProgress(0);
    setWalkProgress(0);
  }, [MOCK_BUILDINGS, prepareFreshRoutePlannerMode]);

  const startRoomDirections = useCallback((roomId: string) => {
    const target = roomEndpointFromFloor(roomId);
    if (!target) return;
    useRoomAsDestination(target);
  }, [roomEndpointFromFloor, useRoomAsDestination]);

  // A map-tapped room is inspection only. Route endpoints change through the
  // explicit Directions / Start here actions or the planner search workflow.
  const selectIndoorRoom = useCallback((roomId: string) => {
    const room = roomEndpointFromFloor(roomId);
    if (!room) return;
    searchFocusRef.current = null;
    lastRoomFocusKeyRef.current = null;
    setHighlightedRoom(roomId);
    setSelectedRoomContext(room);
  }, [roomEndpointFromFloor]);

  // ── Walk arrival → enter the destination building's floor plan ────────
  // When the walking dot reaches the end of an outdoor route that targets a
  // specific room (route.destinationRoom), automatically open that building's
  // floor at the destination floor, highlight the room and draw the final
  // indoor leg from the entrance to the room.
  useEffect(() => {
    const dest = route?.destinationRoom;
    if (!dest) {
      enteredRoomRef.current = null;
      return;
    }
    const key = `${dest.buildingId}:${dest.floorNumber}:${dest.roomId}`;
    if (walkProgress < 1) {
      if (enteredRoomRef.current === key) enteredRoomRef.current = null;
      return;
    }
    if (enteredRoomRef.current === key || isFloorMode) return;
    enteredRoomRef.current = key;

    const building = MOCK_BUILDINGS.find((b) => b.id === dest.buildingId);
    if (!building) return;
    const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === dest.buildingId);
    const destinationSegments = indoorSegmentsForBuilding(route, dest.buildingId, "after-outdoor");
    const firstDestinationSegment = destinationSegments[0];
    const firstDestinationFloor = indoorSegmentFloorNumber(
      firstDestinationSegment,
      campusBuilding,
      dest.floorNumber,
    ) ?? dest.floorNumber;
    // Enter the floor plan at its default framing (fresh zoom/pan).
    cancelCameraAnimation();
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDestinationIndoorSegments(destinationSegments);
    setDestinationIndoorSegmentIndex(firstDestinationSegment ? 0 : -1);
    setFloorView({ building, floor: firstDestinationFloor });
    setHighlightedRoom(firstDestinationFloor === dest.floorNumber ? dest.roomId : null);
    setActiveRouteRoom(dest.roomId);
    setIndoorWalkProgress(0);
    setIndoorWalkNonce((nonce) => nonce + 1);
    setNavigationPhase("destination-indoor");
    setIndoorRoute(firstDestinationSegment ? indoorRouteFromSegment(firstDestinationSegment) : null);
  }, [cancelCameraAnimation, walkProgress, route, isFloorMode, MOCK_BUILDINGS, activeCampus]);

  // Resolve the indoor route after the destination floor is mounted. This is
  // important for published campuses because the rendered floor can contain
  // authored room data that is not available in the legacy adapter yet.
  useEffect(() => {
    const dest = route?.destinationRoom;
    if (!dest || !isFloorMode || !floorView || floorView.building.id !== dest.buildingId || floorView.floor !== dest.floorNumber) return;
    if (indoorRoute && activeRouteRoom === dest.roomId) return;

    const rooms = (activeFloorPlan?.rooms ?? currentFloor?.rooms ?? []) as RoomLike[];
    if (rooms.length === 0) return;
    const entryPoint = mainIndoorDoorPoint(activeFloorPlan);
    const hasAuthoredNavigationGraph = Boolean(
      activeCampus
      && ((activeCampus.navNodes?.length ?? 0) > 0 || (activeCampus.navEdges?.length ?? 0) > 0),
    );
    const authoredFloorSegment = route.indoorSegments?.find((segment) =>
      segment.buildingId === dest.buildingId
      && segment.floorNumber === dest.floorNumber,
    );
    // An authored journey must never acquire an independently calculated
    // final leg that was not part of the selected published graph path.
    if (route.isAuthoredGraph && !authoredFloorSegment) return;
    const plannedIndoor = authoredFloorSegment ? indoorRouteFromSegment(authoredFloorSegment) : null;

    const graphIndoor = plannedIndoor
      ?? (!route.isAuthoredGraph && activeCampus && activeFloorPlan
      ? findPublishedIndoorRoute(
          activeCampus,
          dest.buildingId,
          activeFloorPlan,
          dest.roomId,
          mapMode === "accessible",
          mapMode === "emergency",
        )
      : null)
      ?? (!hasAuthoredNavigationGraph && mapMode === "standard"
        ? findIndoorRouteForFloor(
            dest.buildingId,
            dest.floorNumber,
            dest.roomId,
            rooms,
            false,
            dest.floorNumber === 1 ? "lobby" : "vertical",
            entryPoint
          )
        : null);
    const indoor = graphIndoor && graphIndoor.waypoints.length >= 2
      ? graphIndoor
      : (!hasAuthoredNavigationGraph && mapMode === "standard"
        ? fallbackIndoorRoute(dest.roomId, rooms, entryPoint)
        : null);

    setIndoorWalkProgress(0);
    setIndoorWalkNonce((nonce) => nonce + 1);
    setIndoorRoute(indoor);
  }, [route, isFloorMode, floorView, activeFloorPlan, currentFloor, mapMode, indoorRoute, activeRouteRoom]);

  // ── Map skeleton loading ──
  if (isCampusLoading && !activeCampus) {
    return (
      <div role="status" aria-live="polite" data-testid="student-map-loading" className={cn("relative flex w-full items-center justify-center overflow-hidden", fullScreen && fullScreenHeight ? "h-full" : "")} style={{ height: fullScreen ? fullScreenHeight ?? "100dvh" : "calc(100dvh - 56px)", background: "var(--map-bg)" }}>
        <div className={cn("flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-lg border border-border/50", !reducedMotion && "animate-scale-in")}>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary/60" style={reducedMotion ? undefined : {
                animation: `loading-bounce 0.8s ease-in-out ${i * 0.18}s infinite`,
              }} />
            ))}
          </div>
          <p className="text-xs font-semibold text-muted-foreground">Loading campus map</p>
        </div>
      </div>
    );
  }

  if (isCampusEmpty && !activeCampus && !campusError) {
    return (
      <div className={cn("relative flex w-full flex-col items-center justify-center p-6", fullScreen && fullScreenHeight ? "h-full" : "")} style={{ height: fullScreen ? fullScreenHeight ?? "100dvh" : "calc(100dvh - 56px)", background: "var(--map-bg)" }}>
        <div className="flex flex-col items-center text-center max-w-sm p-8 rounded-3xl bg-card border border-border shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
            <Building2 className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-extrabold text-foreground mb-2">No Published Campus Map</h3>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            The administrator has not published a campus map version yet. Please check back later.
          </p>
          <button
            onClick={() => refetchCampus()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 transition-all shadow-md cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check Again
          </button>
        </div>
      </div>
    );
  }

  if (campusError && !activeCampus) {
    return (
      <div className={cn("relative flex w-full flex-col items-center justify-center p-6", fullScreen && fullScreenHeight ? "h-full" : "")} style={{ height: fullScreen ? fullScreenHeight ?? "100dvh" : "calc(100dvh - 56px)", background: "var(--map-bg)" }}>
        <div className="flex flex-col items-center text-center max-w-sm p-8 rounded-3xl bg-card border border-destructive/20 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-extrabold text-foreground mb-2">Unable to refresh campus map</h3>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">We couldn&apos;t retrieve campus data right now.</p>
          <button
            onClick={() => refetchCampus()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 transition-all shadow-md cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (activeCampus?.lifecycleStatus === "coming_soon") {
    return (
      <ComingSoonCampusScreen
        campus={activeCampus}
        campuses={availableCampuses}
        onSelectCampus={setSelectedCampusId}
        fullScreen={fullScreen}
      />
    );
  }

  const activeIndoorSegment = navigationPhase === "origin-indoor"
    ? originIndoorSegments[originIndoorSegmentIndex]
    : navigationPhase === "destination-indoor"
      ? destinationIndoorSegments[destinationIndoorSegmentIndex]
      : null;
  const activeIndoorSegmentIndex = navigationPhase === "origin-indoor"
    ? originIndoorSegmentIndex
    : destinationIndoorSegmentIndex;
  const activeIndoorSegments = navigationPhase === "origin-indoor"
    ? originIndoorSegments
    : destinationIndoorSegments;
  const nextIndoorSegment = activeIndoorSegments[activeIndoorSegmentIndex + 1];
  const activeFloorTransition = activeIndoorSegment && nextIndoorSegment
    ? route?.transitionDetails?.find((transition) =>
        transition.fromFloorId === activeIndoorSegment.floorId
        && transition.toFloorId === nextIndoorSegment.floorId,
      )
    : undefined;
  const transitionPlace = activeFloorTransition?.label.trim() || "floor transition";
  const transitionPlaceWithArticle = /^(the|a|an)\s/i.test(transitionPlace) ? transitionPlace : `the ${transitionPlace}`;
  const activeIndoorInstruction = navigationPhase === "origin-indoor"
    ? nextIndoorSegment
      ? `Follow the indoor path to ${transitionPlaceWithArticle}.`
      : roomDestination && roomDestination.buildingId === roomOrigin?.buildingId
        ? `Follow the indoor path to the door of ${roomDestination.roomName}.`
        : "Follow the indoor path to the building exit door."
    : nextIndoorSegment
      ? `Follow the indoor path to ${transitionPlaceWithArticle}.`
      : `Follow the indoor path to the door of ${roomDestination?.roomName ?? "your destination"}.`;
  const activeIndoorSteps: RouteStep[] = activeIndoorSegment
    ? [
        ...(navigationPhase === "origin-indoor" && activeIndoorSegmentIndex === 0 && roomOrigin
          ? [{ id: "active-indoor-start", icon: "start" as const, instruction: `Start at the door of ${roomOrigin.roomName}.` }]
          : []),
        ...(navigationPhase === "destination-indoor" && activeIndoorSegmentIndex === 0 && roomDestination
          ? [{ id: "active-indoor-enter", icon: "enter" as const, instruction: `Enter ${roomDestination.buildingCode || roomDestination.buildingLabel} building.` }]
          : []),
        {
          id: `active-indoor-leg-${activeIndoorSegmentIndex}`,
          icon: activeFloorTransition?.kind === "elevator" ? "elevator" : "walk",
          instruction: activeIndoorInstruction,
          distanceM: activeIndoorSegment.distanceM,
        },
      ]
    : [];
  const activeIndoorLeg = activeIndoorSegment
    ? {
        steps: activeIndoorSteps,
        distanceM: activeIndoorSegment.distanceM,
        progress: indoorWalkProgress,
        statusInstruction: stairLoading
          ? `${stairLoading.dir === "up" ? "Going up" : "Going down"} to ${stairLoading.label}`
          : activeIndoorInstruction,
      }
    : undefined;

  return (
    <div
      ref={mapContainerRef}
      data-testid="student-map-surface"
      role="region"
      aria-label="Interactive campus map"
      className={cn(
        "student-map-surface relative overflow-hidden animate-fade-in",
        fullScreen
          ? fullScreenHeight ? "h-full" : "h-[100dvh]"
          : "h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-76px)]",
      )}
      style={{
        height: fullScreen ? fullScreenHeight ?? "100dvh" : undefined,
        "--student-map-utility-bottom": fullScreen ? "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" : "1rem",
        background: viewportBackground,
        animationDuration: reducedMotion ? "0ms" : "200ms",
        cursor: "grab",
        touchAction: "none"
      } as CSSProperties}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>

      {/* Pinning hint (tap-on-map mode) */}
      {pinning && !isFloorMode && (
        <div data-no-drag className="absolute left-2 top-[calc(env(safe-area-inset-top,0px)_+_4.5rem)] z-40 flex max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-2xl border border-blue-400/30 bg-blue-500/95 px-3 py-2 text-[11px] font-bold text-white shadow-xl animate-fade-in md:left-1/2 md:top-14 md:max-w-none md:-translate-x-1/2 md:gap-2 md:rounded-xl md:px-4 md:text-xs">
          <Crosshair className="h-3.5 w-3.5 animate-pulse shrink-0" />
          <span className="whitespace-nowrap md:hidden">Tap map to drop pin</span>
          <span className="hidden whitespace-nowrap md:inline">Tap anywhere on the map to drop a pin</span>
          <button onClick={() => setPinning(false)} className="ml-0.5 shrink-0 whitespace-nowrap rounded-lg px-2 py-1 underline hover:bg-white/10 hover:opacity-100">
            Cancel
          </button>
        </div>
      )}

      {/* Scanned QR or dropped-pin chip — plan from the identified map point. */}
      {youAreHere && !pinning && !searchFocused && !isFloorMode && !directionsMode && (
        <div data-no-drag className="absolute left-2 top-[calc(env(safe-area-inset-top,0px)_+_4.5rem)] z-40 flex max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-2xl border border-blue-400/40 bg-blue-500 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xl md:left-1/2 md:top-14 md:max-w-none md:-translate-x-1/2 md:rounded-full">
          <Crosshair className="h-3 w-3 shrink-0 animate-pulse" />
          <span className="max-w-[38vw] truncate whitespace-nowrap md:max-w-[220px]" title={currentLocationLabel ?? "Dropped pin"}>
            {currentLocationLabel ?? "Dropped pin"}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); openDirections(); }}
            className="ml-1 inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-white px-2.5 text-[10px] font-extrabold text-blue-700 transition-colors hover:bg-blue-50"
            aria-label={`Plan a route from ${currentLocationLabel ?? "the dropped pin"}`}
          >
            Plan route
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearYouAreHere(); }}
            className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
            aria-label="Clear dropped pin"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
      {isFloorMode && selectedRoomContext && !directionsMode && !stairLoading && navigationPhase === "idle" && (
        <StudentSelectedPlaceCard
          key={`${selectedRoomContext.buildingId}:${selectedRoomContext.floorNumber}:${selectedRoomContext.roomId}`}
          room={selectedRoomContext}
          campusId={activeCampus?.id}
          floorId={activeFloorPlan?.id}
          onDirections={() => useRoomAsDestination(selectedRoomContext)}
          onStartHere={() => useRoomAsStart(selectedRoomContext)}
          onReport={() => {
            if (!floorView || !activeFloorPlan) return;
            setReportRoomContext({ floorId: activeFloorPlan.id, roomId: selectedRoomContext.roomId });
            setReportModal(floorView.building);
          }}
          onClose={() => {
            setSelectedRoomContext(null);
            setActiveRouteRoom(null);
            setHighlightedRoom(null);
          }}
        />
      )}
      </AnimatePresence>

      {navigationPhase === "origin-indoor" && isFloorMode && roomOrigin && !navigationTransitioning && (
        <div data-no-drag className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/90 text-background text-[11px] font-bold shadow-xl animate-fade-in">
          <Footprints className="h-3.5 w-3.5 animate-pulse" />
          <span>Walking from {roomOrigin.roomName} to the building exit…</span>
        </div>
      )}

      {navigationTransitioning && isFloorMode && (
        <div data-no-drag className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/90 text-background text-[11px] font-bold shadow-xl animate-fade-in">
          <Navigation className="h-3.5 w-3.5 animate-pulse" />
          <span>Exiting building…</span>
        </div>
      )}

      {/* ══════════════════════════ MAP SVG ══════════════════════════ */}
      <svg ref={svgRef}
        viewBox={`0 0 ${viewportCanvasW} ${viewportCanvasH}`}
        className="absolute inset-0 w-full h-full select-none"
        preserveAspectRatio="xMidYMid meet"
        onDoubleClick={e => {
          e.preventDefault();
          if (!isFloorMode && (e.target as Element).closest("[data-bldg]")) return;
          animateZoomAtRef.current(e.clientX, e.clientY, zoomStateRef.current + 0.35);
        }}>
        <defs>
          <filter id="bldg-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.25)"/>
          </filter>
          <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feFlood floodColor="var(--map-route)" floodOpacity="0.35" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <marker id="route-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--map-route)" fillOpacity="0.6"/>
          </marker>

        </defs>

        <g
          ref={cameraGroupRef}
          transform={isFloorMode ? undefined : `translate(${tx},${ty}) scale(${displayZoom})`}
          style={isFloorMode ? {
            willChange: "transform",
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${displayZoom})`,
            transformBox: "view-box",
            transformOrigin: "0 0",
          } : undefined}
        >

          {/* ════════ FLOOR PLAN mode ════════ */}
          {isFloorMode ? (() => {
            if (!activeFloorPlan) return null;
            return (
              <g transform={`translate(${floorViewport.offsetX},${floorViewport.offsetY})`}>
                <g
                  key={activeFloorPlan.id}
                  className="student-floor-scene-transition"
                  style={reducedMotion ? undefined : { animation: "student-floor-scene-enter 200ms ease-out both", transformBox: "fill-box", transformOrigin: "center" }}
                >
                <ReadonlyFloorPlanScene
                  floor={activeFloorPlan}
                  floorIndex={activeFloorOrdinal.index}
                  floorCount={activeFloorOrdinal.count}
                  entrances={activeFloorEntrances}
                  exteriorEmergencyStairs={activeFloorExteriorStairs}
                  interactiveExitDoorIds={interactiveExitDoorIds}
                  mapMode={mapMode}
                  showLabels={platformSettings.showMapLabels}
                  highlightedRoomId={highlightedRoom}
                  interactiveRoomIds={interactiveFloorRoomIds}
                  hoveredRoomId={hoveredRoom}
                  onRoomClick={selectIndoorRoom}
                  onRoomHover={handleFloorRoomHover}
                  onRoomHoverEnd={handleFloorRoomHoverEnd}
                  onDoorClick={handleFloorDoorClick}
                />
                {showEventMaps && isFloorMode && selectedLocationIsVisible && selectedEventOverlay && <EventPreviewLayer events={[selectedEventOverlay]} onSelect={() => {}} />}
                {/* Indoor navigation path (entrance → active room) */}
                {indoorRoute && indoorRoute.waypoints.length >= 2 && (() => {
                  return (
                    <g data-testid="floor-indoor-route" style={{ pointerEvents: "none" }}>
                      <RouteMapOverlay
                        points={indoorRoute.waypoints}
                        mode={mapMode}
                        animated={platformSettings.animatedRouteArrows}
                        walkProgress={indoorWalkProgress}
                      />
                    </g>
                  );
                })()}
                {indoorQrLocation
                  && floorView?.building.id === indoorQrLocation.buildingId
                  && activeFloorPlan.id === indoorQrLocation.floorId && (
                    <g data-testid="student-indoor-current-location" pointerEvents="none"
                      aria-label={`You are here: ${indoorQrLocation.label}`}
                      transform={`translate(${indoorQrLocation.point.x},${indoorQrLocation.point.y})`}>
                      {!reducedMotion && (
                        <circle r={12} fill="none" stroke="#2563eb" strokeWidth={2} opacity={0.48}>
                          <animate attributeName="r" from="11" to="25" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.48" to="0" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle r={8} fill="#2563eb" stroke="white" strokeWidth={2.5}
                        style={{ filter: "drop-shadow(0 2px 5px rgba(37,99,235,0.45))" }} />
                      <circle r={2.8} fill="white" />
                      <g transform="translate(0,15)">
                        <rect x={-35} y={-1} width={70} height={15} rx={7.5} fill="rgba(15,23,42,0.9)" />
                        <text x={0} y={9.5} textAnchor="middle" fill="white" fontSize={6.7} fontWeight={800}
                          letterSpacing="0.35" className="select-none">YOU ARE HERE</text>
                      </g>
                      <title>{indoorQrLocation.label}</title>
                    </g>
                  )}
                </g>
              </g>
            );
          })() : (
          /* ════════ CAMPUS MAP mode ════════ */
          <>
            <rect data-bg="true" width={outdoorCanvasW} height={outdoorCanvasH} fill={viewportBackground} style={{ cursor: pinning ? "crosshair" : undefined }}/>
            <rect x={6} y={6} width={Math.max(0, outdoorCanvasW - 12)} height={Math.max(0, outdoorCanvasH - 12)} fill="none" stroke="var(--map-boundary)" strokeWidth={3} rx={4} opacity={0.5} strokeDasharray="8 4"/>

            {/* Legacy overlays remain only for the compatibility/demo map. */}
            {!activeCampus && mapMode === "accessible" && <>
              <path d="M 119,289 L 155,289 L 155,170" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              <path d="M 414,289 L 540,289 L 540,373" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              <path d="M 414,289 L 414,435 L 305,435" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              {([[155,290,"#16a34a"],[414,373,"#16a34a"],[414,435,"#16a34a"]] as [number,number,string][]).map(([cx,cy,clr],i) => (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={12} fill="white" stroke={clr} strokeWidth={2.5} style={{ animation:"scale-in 0.3s ease both" }}/>
                  <svg x={cx-8} y={cy-8} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="select-none">
                    <circle cx="16" cy="4" r="1"/>
                    <path d="m18 19 1-7-6 1"/>
                    <path d="m5 8 3-3 5.5 3-2.36 3.5"/>
                    <path d="M4.24 14.5a5 5 0 0 0 6.88 6"/>
                    <path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>
                  </svg>
                  {!reducedMotion && (
                    <circle cx={cx} cy={cy} r={12} fill="none" stroke={clr} strokeWidth={2} opacity={0.3}>
                      <animate attributeName="r" from="12" to="20" dur="1.5s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                  )}
                </g>
              ))}
              {/* Building entrance accessibility markers */}
              {([[155,170,"MAB - Ramp Access"],[395,115,"ADM - Elevator"],[540,295,"LRC - Ground"],[165,305,"ELB - Ramp"],[305,435,"GYM - Level"],[605,415,"SSC - Ground"]] as [number,number,string][]).map(([ex,ey,label],i) => (
                <g key={`acc${i}`}>
                  <rect x={ex-10} y={ey-10} width={20} height={10} rx={4} fill="#16a34a" fillOpacity={0.85} stroke="white" strokeWidth={1}/>
                  <text x={ex} y={ey-3} textAnchor="middle" fill="white" fontSize={5.5} fontWeight="900" className="select-none pointer-events-none">{label}</text>
                </g>
              ))}
            </>}
            {/* Emergency overlay */}
            {!activeCampus && mapMode === "emergency" && <>
              <rect x={0} y={272} width={SVG_W} height={26} fill="rgba(220,38,38,0.15)"/>
              {([[119,285,"EXIT"],[680,285,"EXIT"],[401,285,"RALLY"]] as [number,number,string][]).map(([cx,cy,lbl],i) => (
                <g key={i}><circle cx={cx} cy={cy} r={16} fill="#dc2626" stroke="white" strokeWidth={2.5}/><text x={cx} y={cy+4} textAnchor="middle" fill="white" fontSize={7} fontWeight="900" className="select-none">{lbl}</text></g>
              ))}
            </>}

            {readonlyOutdoorCampus && (
              <ReadonlyOutdoorCampusScene
                campus={readonlyOutdoorCampus}
                zoom={displayZoom}
                showBuildings={true}
                showLabels={platformSettings.showMapLabels}
                showEntryPills={false}
                selectedBuildingId={selected?.id ?? null}
                selectedCampusPlaceId={selectedCampusPlaceId}
                onSelectBuilding={(buildingId) => {
                  const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
                  if (building) selectBuilding(selected?.id === buildingId ? null : building);
                }}
                onSelectCampusPlace={(placeId) => {
                  const place = activeCampus?.markers.find((marker) => marker.id === placeId);
                  if (place) selectCampusPlace(selectedCampusPlaceId === placeId ? null : place);
                }}
                onDoubleClickBuilding={(buildingId) => {
                  const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
                  if (building) openFloorPlan(building);
                }}
                onClickEntrance={(buildingId) => {
                  const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
                  if (building) openFloorPlan(building);
                }}
              />
            )}
            {showEventMaps && !isFloorMode && activeCampus && <EventVenueLayer campus={activeCampus} events={eventFeed.events} zoom={displayZoom} onSelect={selectEventLocation} />}
            {showEventMaps && !isFloorMode && selectedLocationIsVisible && selectedEventOverlay && <EventPreviewLayer events={[selectedEventOverlay]} onSelect={() => {}} />}
            {/* Route */}
            {route && (
              <RouteMapOverlay points={route.points} mode={mapMode} fading={routeFading} walkProgress={walkProgress} animated={platformSettings.animatedRouteArrows} />
            )}
            {/* Manual dropped-pin marker */}
            {youAreHere && !isFloorMode && (
              <g data-you-are-here style={{ pointerEvents: "none" }}>
                {!reducedMotion && (
                  <circle cx={youAreHere.x} cy={youAreHere.y} r={13} fill="none" stroke="#2563eb" strokeWidth={2.5} opacity={0.5}>
                    <animate attributeName="r" from="12" to="28" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={youAreHere.x} cy={youAreHere.y} r={9} fill="#2563eb" stroke="white" strokeWidth={3}
                  style={{ filter: "drop-shadow(0 2px 6px rgba(37,99,235,0.5))" }} />
                <circle cx={youAreHere.x} cy={youAreHere.y} r={3.5} fill="white" />
                <g transform={`translate(${youAreHere.x},${youAreHere.y + 24})`}>
                  <rect x={-36} y={-11} width={72} height={20} rx={9} fill="rgba(15,23,42,0.88)" />
                  <text x={0} y={2} textAnchor="middle" fill="white" fontSize={8.5} fontWeight={800} className="select-none" letterSpacing="0.5">
                    DROPPED PIN
                  </text>
                </g>
              </g>
            )}
            {/* Event markers — star pins */}

          </>
          )}
        </g>
      </svg>

      {/* ══════════════ FLOATING SEARCH / DIRECTIONS — same for both modes ══════════════ */}
      <AnimatePresence initial={false} mode="sync">
      {directionsMode ? (
        <motion.div
          key="route-planner-container"
          data-no-drag
          className="pointer-events-none absolute inset-0 z-30 md:inset-auto md:left-3 md:top-3 md:w-[clamp(340px,25vw,390px)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: "easeOut" }}
        >
          <RoutePlannerDialog
              from={fromBuilding}
              to={toBuilding}
              fromCampusPlace={fromCampusPlace}
              toCampusPlace={toCampusPlace}
              onFromChange={(building) => {
                setNavigationPhase("idle");
                setRoomOrigin(null);
                setFromCampusPlace(null);
                setFromBuilding(building);
                setSelectedRoomContext(null);
              }}
              onFromRoomChange={(room) => {
                if (!room) {
                  setNavigationPhase("idle");
                  setRoomOrigin(null);
                  setFromCampusPlace(null);
                  setFromBuilding(null);
                  return;
                }
                const building = MOCK_BUILDINGS.find((candidate) => candidate.id === room.buildingId);
                if (!building) return;
                // Keep the containing building in state for outdoor routing,
                // while the authored room remains the true indoor origin.
                setNavigationPhase("idle");
                setRoomOrigin(room);
                setFromCampusPlace(null);
                setFromBuilding(building);
                setUseMyLocation(false);
                setHighlightedRoom(room.roomId);
                setActiveRouteRoom(room.roomId);
              }}
              onToChange={(building) => {
                setNavigationPhase("idle");
                setRoomDestination(null);
                setToCampusPlace(null);
                setToBuilding(building);
                setSelectedRoomContext(null);
              }}
              buildings={MOCK_BUILDINGS}
              mode={mapMode}
              onModeChange={(mode) => { routeModeTouchedRef.current = true; setMapMode(mode); }}
              route={route}
              youAreHere={youAreHere}
              youAreHereLabel={currentLocationLabel}
              useMyLocation={useMyLocation}
              onUseMyLocationChange={(useLocation) => {
                setNavigationPhase("idle");
                setUseMyLocation(useLocation);
                if (useLocation) {
                  setRoomOrigin(null);
                  setFromCampusPlace(null);
                  setFromBuilding(null);
                }
              }}
              fromRoom={roomOrigin}
              toRoom={roomDestination}
              roomOptions={roomDestinationCatalog}
              destinationResults={campusSearch.destinations}
              activeEndpoint={routePlannerEndpoint}
              onActiveEndpointChange={setRoutePlannerEndpoint}
              suspendedForBuilding={Boolean(selected || selectedCampusPlace)}
              selectedRoomForPlanner={selectedRoomContext}
              onUseSelectedRoomAsStart={useRoomAsStart}
              onUseSelectedRoomAsDestination={useRoomAsDestination}
              onReportSelectedRoom={room => {
                if (!floorView || !activeFloorPlan) return;
                setReportRoomContext({ floorId: activeFloorPlan.id, roomId: room.roomId });
                setReportCampusPlace(null);
                setReportModal(floorView.building);
              }}
              onSelectFromDestination={(result) => {
                const endpoint = routeEndpointFromSearchResult(result, MOCK_BUILDINGS, roomDestinationCatalog, activeCampus?.markers);
                if (!endpoint) return;
                setNavigationPhase("idle");
                setSelectedRoomContext(null);
                if (endpoint.kind === "building") {
                  setRoomOrigin(null);
                  setFromCampusPlace(null);
                  setFromBuilding(endpoint.building);
                  setUseMyLocation(false);
                } else if (endpoint.kind === "room") {
                  setFromCampusPlace(null);
                  setRoomOrigin(endpoint.room);
                  setFromBuilding(endpoint.building);
                  setUseMyLocation(false);
                  setHighlightedRoom(endpoint.room.roomId);
                  setActiveRouteRoom(endpoint.room.roomId);
                } else if (endpoint.kind === "campus-place") {
                  setRoomOrigin(null);
                  setFromBuilding(null);
                  setFromCampusPlace(endpoint.place);
                  setUseMyLocation(false);
                }
              }}
              onSelectToDestination={(result) => {
                const endpoint = routeEndpointFromSearchResult(result, MOCK_BUILDINGS, roomDestinationCatalog, activeCampus?.markers);
                if (!endpoint) return;
                setNavigationPhase("idle");
                setSelectedRoomContext(null);
                if (endpoint.kind === "building") {
                  setRoomDestination(null);
                  setToCampusPlace(null);
                  setToBuilding(endpoint.building);
                } else if (endpoint.kind === "room") {
                  setToCampusPlace(null);
                  setRoomDestination(endpoint.room);
                  setToBuilding(endpoint.building);
                  setHighlightedRoom(endpoint.room.roomId);
                  setActiveRouteRoom(endpoint.room.roomId);
                } else if (endpoint.kind === "campus-place") {
                  setRoomDestination(null);
                  setToBuilding(null);
                  setToCampusPlace(endpoint.place);
                }
              }}
              onToRoomChange={(room) => {
                if (!room) {
                  setNavigationPhase("idle");
                  setRoomDestination(null);
                  setToCampusPlace(null);
                  setToBuilding(null);
                  return;
                }
                setNavigationPhase("idle");
                selectRoomDestination(`${room.buildingId}:${room.floorNumber}:${room.roomId}`);
              }}
              onClearFromRoom={() => { setNavigationPhase("idle"); setRoomOrigin(null); setFromCampusPlace(null); setFromBuilding(null); }}
              onClearToRoom={() => { setNavigationPhase("idle"); setRoomDestination(null); setToCampusPlace(null); setToBuilding(null); }}
              onSwapEndpoints={() => {
                const previousFromBuilding = fromBuilding;
                const previousToBuilding = toBuilding;
                const previousFromRoom = roomOrigin;
                const previousToRoom = roomDestination;
                const previousFromPlace = fromCampusPlace;
                const previousToPlace = toCampusPlace;
                setNavigationPhase("idle");
                setNavigationTransitioning(false);
                setRoomOrigin(previousToRoom);
                setRoomDestination(previousFromRoom);
                setFromCampusPlace(previousToPlace);
                setToCampusPlace(previousFromPlace);
                setFromBuilding(previousToRoom
                  ? MOCK_BUILDINGS.find((building) => building.id === previousToRoom.buildingId) ?? null
                  : previousToBuilding);
                setToBuilding(previousFromRoom
                  ? MOCK_BUILDINGS.find((building) => building.id === previousFromRoom.buildingId) ?? null
                  : previousFromBuilding);
              }}
              onClose={() => { setNavigationPhase("idle"); setNavigationTransitioning(false); setDirectionsMode(false); setRoutePlannerEndpoint(null); setSelectedRoomContext(null); setFromBuilding(null); setToBuilding(null); setFromCampusPlace(null); setToCampusPlace(null); setRoomOrigin(null); setRoomDestination(null); }}
              onClear={() => { setNavigationPhase("idle"); setNavigationTransitioning(false); setRoutePlannerEndpoint(null); setSelectedRoomContext(null); setFromBuilding(null); setToBuilding(null); setFromCampusPlace(null); setToCampusPlace(null); setRoomOrigin(null); setRoomDestination(null); }}
              onFindRoute={() => {
              const endpointsSet = Boolean(
                (mapMode === "emergency" && (roomOrigin || fromCampusPlace || fromBuilding || (useMyLocation && youAreHere)))
                || (useMyLocation && (toBuilding || toCampusPlace))
                || (roomOrigin && (toBuilding || toCampusPlace))
                || (roomDestination && (fromBuilding || fromCampusPlace))
                || (fromCampusPlace && (toCampusPlace || toBuilding || roomDestination))
                || (toCampusPlace && (fromBuilding || roomOrigin))
                || (fromBuilding && toBuilding),
              );
              // The dialog already renders its no-route state when endpoints
              // are set but planning returns null. Keep it open; closing here
              // would hide the only actionable feedback from the student.
              if (!endpointsSet || !hasNavigableRoute(route)) return;

              const hasOutdoorLeg = route.points.length >= 2;
              const sameBuildingRoomExit = Boolean(
                roomOrigin
                && toBuilding
                && roomOrigin.buildingId === toBuilding.id
                && !route.destinationRoom
                && !hasOutdoorLeg,
              );
              const sameBuildingIndoorRoute = Boolean(
                mapMode !== "emergency" && !hasOutdoorLeg
                && (
                  Boolean(
                    route.destinationRoom
                    && (
                      roomOrigin?.buildingId === route.destinationRoom.buildingId
                      || fromBuilding?.id === route.destinationRoom.buildingId
                    ),
                  )
                  || sameBuildingRoomExit
                ),
              );
              if (sameBuildingIndoorRoute) {
                const destination = route.destinationRoom ?? (roomOrigin && toBuilding
                  ? {
                      buildingId: roomOrigin.buildingId,
                      floorNumber: roomOrigin.floorNumber,
                      roomId: roomOrigin.roomId,
                    }
                  : null);
                if (!destination) return;
                const building = MOCK_BUILDINGS.find((candidate) => candidate.id === destination.buildingId);
                if (building) {
                  const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === destination.buildingId);
                  const authoredSegments = indoorSegmentsForBuilding(route, destination.buildingId);
                  const targetSegment = route.indoorSegments?.find((candidate) =>
                    candidate.buildingId === destination.buildingId
                    && candidate.floorNumber === destination.floorNumber,
                  );
                  const journeySegments = authoredSegments.length > 0
                    ? authoredSegments
                    : targetSegment
                      ? [targetSegment]
                      : [];
                  const firstSegment = journeySegments[0];
                  const firstFloor = indoorSegmentFloorNumber(
                    firstSegment,
                    campusBuilding,
                    destination.floorNumber,
                  ) ?? destination.floorNumber;
                  setNavigationTransitioning(false);
                  setNavigationPhase("destination-indoor");
                  setDestinationIndoorSegments(journeySegments);
                  setDestinationIndoorSegmentIndex(firstSegment ? 0 : -1);
                  setFloorView({ building, floor: firstFloor });
                  setHighlightedRoom(firstFloor === destination.floorNumber ? destination.roomId : null);
                  setActiveRouteRoom(destination.roomId);
                  setIndoorRoute(firstSegment ? indoorRouteFromSegment(firstSegment) : null);
                  setIndoorWalkProgress(0);
                  setIndoorWalkNonce((nonce) => nonce + 1);
                  setDirectionsMode(false);
                }
                return;
              }

              // A room is selected from inside its floor plan, but a route
              // that starts outside must return to the campus view before the
              // outdoor walking animation begins. The planner stays open until
              // this explicit confirmation, matching building navigation.
              const startsOutside =
                mapMode === "emergency" ||
                (useMyLocation && !!youAreHere) ||
                (!!fromCampusPlace && hasOutdoorLeg) ||
                (!!roomOrigin && hasOutdoorLeg) ||
                (!!fromBuilding && !!roomDestination && fromBuilding.id !== roomDestination.buildingId);
              const sourceSegments = roomOrigin && (hasOutdoorLeg || mapMode === "emergency")
                ? indoorSegmentsForBuilding(route, roomOrigin.buildingId, "before-outdoor")
                : [];
              const originIndoorSegment = sourceSegments[0];

              // A room-origin route must visibly leave the selected room
              // before the camera returns to the campus. The authored graph
              // already contains this floor-local segment; mount that floor
              // first and let the indoor animation hand off to the existing
              // building-exit transition when it reaches the door.
              if (roomOrigin && originIndoorSegment) {
                const originBuilding = MOCK_BUILDINGS.find((candidate) => candidate.id === roomOrigin.buildingId);
                if (originBuilding) {
                  cancelAnimationFrame(walkAnimRef.current ?? 0);
                  walkAnimRef.current = null;
                  cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
                  indoorWalkAnimRef.current = null;
                  cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
                  navigationTransitionAnimRef.current = null;
                  setWalkProgress(0);
                  setIndoorWalkProgress(0);
                  enteredRoomRef.current = null;
                  setOriginIndoorSegments(sourceSegments);
                  setOriginIndoorSegmentIndex(0);
                  setIndoorRoute(indoorRouteFromSegment(originIndoorSegment));
                  setIndoorWalkNonce((nonce) => nonce + 1);
                  const publishedBuilding = activeCampus?.buildings.find((building) => building.id === roomOrigin.buildingId);
                  setFloorView({ building: originBuilding, floor: indoorSegmentFloorNumber(originIndoorSegment, publishedBuilding, roomOrigin.floorNumber) ?? roomOrigin.floorNumber });
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setHighlightedRoom(roomOrigin.roomId);
                  setActiveRouteRoom(roomOrigin.roomId);
                  setStairLoading(null);
                  setNavigationTransitioning(false);
                  setNavigationPhase("origin-indoor");
                  setDirectionsMode(false);
                  return;
                }
              }

              if (startsOutside) {
                cancelAnimationFrame(walkAnimRef.current ?? 0);
                walkAnimRef.current = null;
                setWalkProgress(0);
                enteredRoomRef.current = null;
                setIndoorRoute(null);
                setActiveRouteRoom(null);
                setHighlightedRoom(null);
                setStairLoading(null);
                setNavigationPhase("outdoor");
                if (isFloorMode) {
                  setNavigationTransitioning(true);
                } else {
                  if (platformSettingsReady && platformSettings.autoFocusRoute) frameRouteView();
                  setNavigationTransitioning(false);
                }
              }
              setDirectionsMode(false);
              }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="map-controls-container"
          className={cn("absolute inset-0 map-layer-controls pointer-events-none", searchFocused && "map-layer-transient")}
          data-map-layer={searchFocused ? "transient" : "controls"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: "easeOut" }}
        >
        <>
          <StudentMapControls
            isFloorMode={isFloorMode}
            floorLabel={floorView ? `${floorView.building.code} · ${currentFloor?.label ?? `Floor ${floorView.floor}`}` : undefined}
            search={search}
            searchFocused={searchFocused}
            directionsMode={directionsMode}
            navigationActive={navigationTransitioning || navigationPhase !== "idle"}
            profileOpen={profileMenuOpen}
            searchResults={campusSearch.results}
            onSearchChange={setSearch}
            onSearchFocus={() => { searchFocusedRef.current = true; setProfileMenuOpen(false); setSearchFocused(true); }}
            onSearchBlur={dismissSearch}
            onClearSearch={() => setSearch("")}
            onSelectSearchResult={handleSelectSearchResult}
            onOpenDirections={openDirections}
            onScanLocation={openLocationScanner}
            onResetView={resetMapCamera}
            onBackToCampus={closeFloorPlan}
          />
          <div hidden aria-hidden="true">
          /* ── Search bar ── */
          <>
            <div className="flex items-center gap-2">
              <div className={cn("flex-1 flex items-center gap-2 h-11 px-3.5 rounded-2xl border shadow-lg transition-all",
                searchFocused ? "border-primary/40 ring-2 ring-primary/10" : "border-border")}
                style={{ background:"var(--card)", color:"var(--foreground)" }}>
                <Search className="h-4 w-4 shrink-0" style={{ color:"var(--muted-foreground)" }}/>
                <input type="text" value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder={isFloorMode ? "Search rooms, offices, labs…" : "Search buildings, offices…"}
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                  style={{ fontFamily:"var(--font-body)", color:"var(--foreground)" }}/>
                {search && <button onClick={() => setSearch("")} style={{ color:"var(--muted-foreground)" }} className="hover:opacity-70 shrink-0"><X className="h-3.5 w-3.5"/></button>}
              </div>
              <button onClick={e => { e.stopPropagation(); openDirections(); }} title="Directions"
                className="w-11 h-11 rounded-2xl border border-border shadow-lg flex items-center justify-center transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary"
                style={{ background:"var(--card)", color:"var(--muted-foreground)" }}>
                <Navigation className="h-4 w-4"/>
              </button>
            </div>

            {/* Search dropdown */}
            {searchFocused && (
              <div className="mt-1.5 rounded-2xl border border-border shadow-xl overflow-hidden"
                style={{ background:"var(--card)", color:"var(--foreground)" }}>
                {/* Recent (campus mode) */}
                {!isFloorMode && !search && recentSearches.length > 0 && (
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Recent</p>
                      <button onClick={() => setRecentSearches([])} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentSearches.map(name => {
                        const b = MOCK_BUILDINGS.find(b => b.name === name);
                        return b ? (
                          <button key={name} onMouseDown={e => { e.preventDefault(); selectBuilding(b); }}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground hover:text-primary transition-colors">
                            <Clock className="h-3 w-3"/> {b.code}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                {/* Quick access buildings (campus mode, no query) */}
                {!isFloorMode && !search && MOCK_BUILDINGS.length > 0 && (
                  <div className="px-4 py-3 border-t border-border">
                    <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Quick Access</p>
                    <div className="grid grid-cols-2 gap-1">
                      {MOCK_BUILDINGS.slice(0, 6).map(b => (
                        <button key={b.id} onMouseDown={e => { e.preventDefault(); selectBuilding(b); }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-muted transition-colors text-left">
                          <MapPin className="h-3 w-3 text-primary shrink-0"/>
                          <span className="text-xs font-semibold text-foreground">{b.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Unified Search Results (C3) */}
                {search && (
                  <div className="max-h-60 overflow-y-auto divide-y divide-border/40">
                    {campusSearch.results.length > 0 ? (
                      campusSearch.results.map((item) => (
                        <button
                          key={item.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSearchResult(item);
                          }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/80 transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                              {item.kind === "building" ? (
                                <Building2 className="h-4 w-4" />
                              ) : (
                                <MapPin className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {item.buildingName ? `${item.buildingName} ${item.floorLabel ? `· ${item.floorLabel}` : ""}` : item.code || item.category || "Building"}
                              </p>
                            </div>
                          </div>
                          {item.accessible && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 shrink-0">
                              Accessible
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="flex flex-col items-center py-6 px-4 text-center">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-2.5">
                          <Search className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-bold text-foreground mb-0.5">No results found</p>
                        <p className="text-xs text-muted-foreground max-w-[200px]">
                          We couldn&apos;t find anything matching &ldquo;{search}&rdquo;. Try a different building or room name.
                        </p>
                        <button
                          onClick={() => setSearch("")}
                          className="mt-3 text-xs font-bold text-primary hover:underline cursor-pointer"
                        >
                          Clear search
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
          </div>
        </>
        </motion.div>
      )}
      </AnimatePresence>

      <div
        data-no-drag
        data-map-layer="account-trigger"
        aria-hidden={searchFocused}
        inert={searchFocused ? ("" as never) : undefined}
        className={cn(
          "absolute right-2 map-layer-controls pointer-events-auto transition-[opacity,transform] duration-200 ease-out motion-reduce:duration-0 md:hidden",
          searchFocused && "pointer-events-none translate-x-1 scale-95 opacity-0",
        )}
        style={{ top: "max(0.5rem, env(safe-area-inset-top, 0.5rem))" }}
      >
        <MobileMapAccountMenu open={profileMenuOpen} onOpenChange={handleProfileMenuOpenChange} />
      </div>

      {/* ══════════════ FLOOR SELECTOR (floor plan mode — always visible when in floor view) ══════════════ */}

      {/* ══════════════ MAP ZOOM / RESET CONTROLS ══════════════ */}
      {isFloorMode && availableFloorOptions.length > 1 && !directionsMode && !showEventMaps && !stairLoading && !navigationTransitioning && navigationPhase === "idle" && (
        <StudentFloorPicker
          buildingName={activeFloorBuilding?.name ?? floorView?.building.name ?? "Building"}
          floors={availableFloorOptions}
          activeFloor={floorView?.floor ?? availableFloorOptions[0].number}
          onSelect={changeStudentFloor}
        />
      )}

      {/* ══════════════ NAVIGATION PANEL (only when route active & planner closed) ══════════════ */}
      {route && !directionsMode && !navigationTransitioning && (
        <>
          {/* Desktop: compact card, bottom-left */}
          <div data-no-drag className="absolute bottom-5 left-3 z-20 hidden md:block animate-slide-up">
            <div style={{ width: 230 }}>
              <RouteStepsPanel
                route={route}
                mode={mapMode}
                toName={route.emergencyDestinationLabel ?? roomDestination?.roomName ?? toBuilding?.name ?? "Destination"}
                walkProgress={isFloorMode && route.destinationRoom ? indoorWalkProgress : walkProgress}
                activeLeg={activeIndoorLeg}
                onReplay={replayWalk}
                onEnd={endNavigation}
                onZoom={() => frameRouteView(Math.max(zoomRef.current, 1.5))}
              />
            </div>
          </div>
          {/* Mobile: full-width resizable navigation sheet, docked above Home / Map. */}
          <div data-testid="mobile-active-route-dock" data-no-drag className="absolute inset-x-0 bottom-0 z-30 max-h-full md:hidden animate-slide-up">
            <RouteStepsPanel
              route={route}
              mode={mapMode}
              toName={route.emergencyDestinationLabel ?? roomDestination?.roomName ?? toBuilding?.name ?? "Destination"}
              walkProgress={isFloorMode && route.destinationRoom ? indoorWalkProgress : walkProgress}
              activeLeg={activeIndoorLeg}
              compact
              onReplay={replayWalk}
              onEnd={endNavigation}
              onZoom={() => frameRouteView(Math.max(zoomRef.current, 1.5))}
            />
          </div>
        </>
      )}

      {/* ══════════════ DESKTOP BUILDING INFO PANEL ══════════════ */}
      <AnimatePresence initial={false}>
        {selected && !isFloorMode && (
          <BuildingInfoPanel
            key={selected.id}
            selected={selected}
            campusId={activeCampus?.id}
            onClose={() => selectBuilding(null)}
            onDirections={startDirectionsTo}
            onEnterBuilding={(building) => openFloorPlan(building)}
            saved={saved}
            studentAuth={studentAuth}
            onToggleSave={toggleSave}
            onReport={building => { setReportCampusPlace(null); setReportRoomContext(null); setReportModal(building); }}
            onSignInPrompt={setSignInPrompt}
            showQR={showQR}
            onToggleQR={() => setShowQR(v => !v)}
            hasFloorPlans={Boolean(FLOOR_PLANS[selected.id])}
            floorPlanCount={FLOOR_PLANS[selected.id]?.floors?.length ?? 0}
            facilities={BUILDING_FACILITIES[selected.id] ?? []}
            accessibility={BUILDING_ACCESSIBILITY[selected.id] ?? []}
            onBackToRoutePlanner={directionsMode ? () => selectBuilding(null) : undefined}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {selectedCampusPlace && !isFloorMode && (
          <CampusPlaceDetails
            key={`campus-place-${selectedCampusPlace.id}`}
            place={selectedCampusPlace}
            campusId={activeCampus?.id}
            canRouteTo={campusPlaceCanRoute(selectedCampusPlace, activeCampus, "inbound")}
            canStartAt={campusPlaceCanRoute(selectedCampusPlace, activeCampus, "outbound")}
            saved={saved.has(`campus-place:${selectedCampusPlace.id}`)}
            studentAuth={studentAuth}
            onClose={() => selectCampusPlace(null)}
            onDirections={() => routeToCampusPlace(selectedCampusPlace)}
            onStartHere={() => routeFromCampusPlace(selectedCampusPlace)}
            onSave={() => {
              const key = `campus-place:${selectedCampusPlace.id}`;
              const next = new Set(saved);
              if (next.has(key)) next.delete(key); else next.add(key);
              setSaved(next);
              void studentAccountService.toggleSaveCampusPlace(selectedCampusPlace.id, activeCampus?.id ?? "").catch(() => {
                setSaved(saved);
                showError("Saved place could not be updated");
              });
            }}
            onReport={() => { setReportModal(null); setReportCampusPlace(selectedCampusPlace); setReportRoomContext(null); }}
            onSignInPrompt={setSignInPrompt}
          />
        )}
      </AnimatePresence>

      {/* ══════════════ ARRIVAL OVERLAY ══════════════ */}
      {showArrival && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowArrival(false)}>
          <div className="flex flex-col items-center gap-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            {/* Celebration ring */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-green-500/10 animate-scale-in flex items-center justify-center"
                style={{ animation:"scale-in 0.5s cubic-bezier(0.16,1,0.3,1) both" }}>
                <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
              {/* Decorative sparkles */}
              <div className="absolute -top-2 -right-2 text-xl animate-scale-in" style={{ animationDelay: "0.3s" }}>✨</div>
              <div className="absolute -bottom-1 -left-3 text-lg animate-scale-in" style={{ animationDelay: "0.5s" }}>🌟</div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-extrabold text-foreground">You Have Arrived</h3>
              <p className="text-sm text-muted-foreground mt-1">{toBuilding?.name ?? "Destination"}</p>
              <div className="flex items-center justify-center gap-3 mt-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                  ✓ Arrived
                </span>
                <span className="text-[10px] text-muted-foreground">Route complete</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowArrival(false); }}
                className="h-9 px-4 rounded-xl border border-border text-muted-foreground text-xs font-bold hover:bg-muted transition-colors">
                Dismiss
              </button>
              <button
                onClick={() => { setShowArrival(false); setFromBuilding(null); setToBuilding(null); setRoomOrigin(null); setRoomDestination(null); setDirectionsMode(false); }}
                className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
                End Navigation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ STAIR LOADING OVERLAY ══════════════ */}
      {stairLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 animate-scale-in"
            style={{ transformOrigin: "center" }}>
            {/* Direction indicator */}
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg",
              stairLoading.dir === "up" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" : "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
            )}>
              {stairLoading.dir === "up" ? "↑" : "↓"}
            </div>
            <div className="text-center">
              <p className="text-sm font-extrabold text-foreground">
                {stairLoading.dir === "up" ? "Going up to" : "Going down to"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{stairLoading.label}</p>
            </div>
            <div className="flex gap-1.5 mt-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full"
                  style={{
                    background: stairLoading.dir === "up" ? "var(--map-route)" : "#f97316",
                    animation: `loading-bounce 1s ease-in-out ${i*0.2}s infinite`
                  }}/>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Changing floor…</p>
          </div>
        </div>
      )}

      {/* ══════════════ INDOOR ROUTE DIRECTIONS PANEL ══════════════ */}
      {/* A full journey owns all indoor/outdoor instructions, including room
          origins that end at a building rather than a destination room. */}
      {indoorRoute && isFloorMode && !stairLoading && !route && !directionsMode && (
        <div data-testid="indoor-route-preview" className="absolute top-16 left-1/2 -translate-x-1/2 z-20 animate-slide-up">
          <div className="rounded-2xl border border-border/60 shadow-xl overflow-hidden"
            style={{ background:"var(--card)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)", width:280, maxWidth:"calc(100vw - 40px)" }}>
            <div className="flex items-center gap-2 px-3 py-2" style={{ background:"linear-gradient(135deg, var(--primary), var(--map-route))" }}>
              <Footprints className="h-3.5 w-3.5 text-white shrink-0"/>
              <span className="text-[11px] font-extrabold text-white truncate flex-1">Route to {currentFloor?.rooms.find(r => r.id === activeRouteRoom)?.name ?? "room"}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse shrink-0"/>
            </div>
            <div className="flex gap-2 px-3 pt-2.5 pb-2 border-b border-border">
              <div className="flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Distance</p>
                <p className="text-sm font-extrabold text-foreground">{indoorRoute.distanceMeters} m</p>
              </div>
              <div className="flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Est. Time</p>
                <p className="text-sm font-extrabold text-foreground">{indoorRoute.estimatedSeconds < 60 ? `${indoorRoute.estimatedSeconds}s` : `${Math.round(indoorRoute.estimatedSeconds / 60)} min`}</p>
              </div>
            </div>
            <div className="px-3 py-2 max-h-36 overflow-y-auto scrollbar-show-on-hover">
              <div className="relative pl-4 border-l-2 border-primary/30 space-y-2">
                {indoorRoute.steps.map((step, i) => (
                  <div key={i} className="relative flex items-start gap-2">
                    <div className={cn(
                      "absolute -left-[11px] w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      i === 0 ? "bg-green-500 border-green-500" :
                      i === indoorRoute.steps.length - 1 ? "bg-primary border-primary" :
                      "bg-card border-primary/50"
                    )}>
                    </div>
                    <p className="text-[10px] leading-snug pt-0.5 text-foreground ml-1" style={{ fontFamily:"var(--font-body)" }}>{step}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5 px-3 pb-2.5">
              {activeRouteRoom && (
                <button
                  onClick={() => startRoomDirections(activeRouteRoom)}
                  className="flex-1 h-7 rounded-lg text-[10px] font-bold inline-flex items-center justify-center gap-1 hover:brightness-110 transition-all active:scale-[0.98]"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  <Navigation className="h-3 w-3" />
                  Directions to room
                </button>
              )}
              <button onClick={clearIndoorRoute}
                className={cn("h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors", activeRouteRoom ? "px-2.5" : "w-full")}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ ROOM HOVER TOOLTIP (floor plan) ══════════════ */}
      {hoveredRoom && isFloorMode && !stairLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in">
          <div className="bg-foreground/90 text-background text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            {currentFloor?.rooms.find(r => r.id === hoveredRoom)?.name}
          </div>
        </div>
      )}

      {/* ══════════════ CAMPUS SELECTOR ══════════════ */}
      {!route && !directionsMode && !isFloorMode && (
        <div data-testid="student-campus-selector" data-no-drag className="absolute bottom-[76px] md:bottom-6 left-1/2 -translate-x-1/2 z-20 hidden md:block">
          <div className="relative">
            <button
              onClick={() => setShowCampusSelector(v => !v)}
              aria-expanded={showCampusSelector}
              className="flex min-h-11 max-w-[min(360px,calc(100vw-1.5rem))] items-center gap-2 rounded-2xl border border-white/45 bg-card/95 px-4 text-xs font-semibold text-foreground shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-muted hover:shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10"
              style={{ fontFamily:"var(--font-body)" }}>
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span className="max-w-[260px] truncate">{activeCampus?.name ?? 'Select Campus'}</span>
              <ChevronDown className="h-3 w-3 shrink-0" style={{ color:"var(--muted-foreground)", transform: showCampusSelector ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}/>
            </button>
            {showCampusSelector && availableCampuses.length > 0 && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-2xl border border-border shadow-2xl overflow-hidden animate-scale-in"
                style={{ background:"var(--card)", width:220 }}>
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>Select Campus</p>
                </div>
                {availableCampuses.map(campus => {
                  const isActive = campus.id === activeCampus?.id;
                  return (
                    <button
                      key={campus.id}
                      onClick={() => { setSelectedCampusId(campus.id); setShowCampusSelector(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-muted/50"
                      style={{
                        borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                        background: isActive ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                      }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isActive ? 'var(--primary)' : 'var(--muted-foreground)' }}/>
                      <div className="flex-1 min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-xs font-bold" style={{ color: isActive ? 'var(--primary)' : 'var(--foreground)', fontFamily:"var(--font-sans)" }}>
                          <span className="truncate">{campus.name}</span>
                          {campus.lifecycleStatus === "coming_soon" && <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[8px] font-extrabold text-sky-700">Coming Soon</span>}
                        </p>
                        {campus.code && <p className="text-[10px]" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>{campus.code}</p>}
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-extrabold shrink-0" style={{ color:"var(--primary)" }}>Active</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ MOBILE: immersive floating UI ══════════════ */}
      <div data-no-drag className="hidden" aria-hidden="true">
        {/* Search bar — floating glass pill */}
        <div className="flex items-center gap-2 h-10 px-3.5 rounded-full border border-white/20 shadow-xl"
          style={{ background:"rgba(255,255,255,0.85)", backdropFilter:"blur(20px) saturate(180%)", WebkitBackdropFilter:"blur(20px) saturate(180%)" }}>
          {isFloorMode ? (
            <button onClick={closeFloorPlan} className="text-primary shrink-0 flex items-center gap-1" aria-label="Back to campus map">
              <ChevronLeft className="h-4 w-4"/>
              <span className="text-[10px] font-bold text-foreground truncate max-w-[110px]">
                {floorView?.building.code} · {currentFloor?.label ?? `Floor ${floorView?.floor}`}
              </span>
            </button>
          ) : (
            <Search className="h-4 w-4 text-muted-foreground shrink-0"/>
          )}
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder={isFloorMode ? "Search rooms…" : "Search buildings…"}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            style={{ fontFamily:"var(--font-body)" }}/>
          {search && <button onClick={() => setSearch("")}><X className="h-4 w-4 text-muted-foreground"/></button>}
          <div className="w-px h-5 bg-border/60 shrink-0"/>
          <button onClick={e => { e.stopPropagation(); openDirections(); }}
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors shrink-0">
            <Navigation className="h-3.5 w-3.5"/>
            <span className="hidden sm:inline">Directions</span>
          </button>
        </div>

        {/* Filter chips — floating glass (hidden when building selected or route planner active) */}
        {!isFloorMode && !searchFocused && !search && !directionsMode && !selected && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {(["standard","accessible","emergency"] as MapMode[]).map(m => {
              const Icon = m === "standard" ? Compass : m === "accessible" ? Accessibility : AlertTriangle;
              const label = m === "standard" ? "All Buildings" : m === "accessible" ? "PWD Routes" : "Emergency";
              return (
                <button key={m} onClick={e => { e.stopPropagation(); setMapMode(m); }}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all shrink-0",
                    mapMode === m
                      ? m === "accessible" ? "border-green-400/40 text-green-700 dark:text-green-300"
                        : m === "emergency" ? "border-red-400/40 text-red-600 dark:text-red-300"
                        : "border-primary/40 text-primary"
                      : "border-white/30 text-foreground/70")}
                  style={{ background: mapMode === m ? undefined : "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
                  <Icon className="h-3 w-3"/>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Building list — floating glass chips (hidden when building selected or route planner active) */}
        {!isFloorMode && !searchFocused && !search && mapMode === "standard" && !directionsMode && !selected && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {MOCK_BUILDINGS.map(b => (
              <button key={b.id} onClick={e => { e.stopPropagation(); selectBuilding(b); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border border-white/30 text-foreground/70 hover:text-primary hover:border-primary/30 transition-all shrink-0"
                style={{ background:"rgba(255,255,255,0.7)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)" }}>
                <MapPin className="h-3 w-3 text-primary/60"/>
                {b.code}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════ MOBILE: floor selector ══════════════ */}

      {/* ══════════════ MOBILE BUILDING SHEET ══════════════ */}
      <AnimatePresence initial={false}>
        {selected && !isFloorMode && (
          <MobileBuildingSheet
            key={selected.id}
            selected={selected}
            campusId={activeCampus?.id}
            onClose={() => selectBuilding(null)}
            onDirections={startDirectionsTo}
            onEnterBuilding={(building) => openFloorPlan(building)}
            onSave={toggleSave}
            onReport={building => { setReportCampusPlace(null); setReportRoomContext(null); setReportModal(building); }}
            onSignInPrompt={setSignInPrompt}
            saved={saved}
            studentAuth={studentAuth}
            hasFloorPlans={Boolean(FLOOR_PLANS[selected.id])}
            floorPlanCount={FLOOR_PLANS[selected.id]?.floors?.length ?? 0}
            facilities={BUILDING_FACILITIES[selected.id] ?? []}
            accessibility={BUILDING_ACCESSIBILITY[selected.id] ?? []}
            showQR={showQR}
            onToggleQR={() => setShowQR(v => !v)}
            interactionPaused={searchFocused || profileMenuOpen || Boolean(reportModal) || Boolean(signInPrompt)}
            onStateChange={setMobileBuildingSheetState}
            onBackToRoutePlanner={directionsMode ? () => selectBuilding(null) : undefined}
          />
        )}
      </AnimatePresence>

      {/* ══════════════ STAIR UP/DOWN CHOICE ══════════════ */}
      {stairChoice && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setStairChoice(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-[240px] w-full mx-4 animate-scale-in"
            onClick={e => e.stopPropagation()}>
            <p className="text-xs font-extrabold text-center mb-1" style={{ fontFamily:"var(--font-sans)", color:"var(--foreground)" }}>
              {stairChoice.roomType === "elevator" ? "Use Elevator" : "Use Staircase"}
            </p>
            <p className="text-[11px] text-center mb-4" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>
              Where would you like to go?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const fv = floorViewRef.current;
                  const fd = fv ? FLOOR_PLANS[fv.building.id] : null;
                  if (!fd || !stairChoice.upFloor) return;
                  const label = fd.floors.find(f => f.number === stairChoice.upFloor)?.label ?? `Floor ${stairChoice.upFloor}`;
                  setStairChoice(null);
                  setStairLoading({ dir:"up", label });
                  setTimeout(() => { setFloorView(v => v ? {...v, floor: stairChoice.upFloor!} : v); setStairLoading(null); }, 750);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:opacity-90"
                style={{ background:"rgba(37,99,235,0.08)", borderColor:"rgba(37,99,235,0.25)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ background:"#2563eb" }}>↑</div>
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color:"var(--foreground)", fontFamily:"var(--font-sans)" }}>Go Up</p>
                  <p className="text-xs" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>{stairChoice.upLabel}</p>
                </div>
              </button>
              <button
                onClick={() => {
                  const fv = floorViewRef.current;
                  const fd = fv ? FLOOR_PLANS[fv.building.id] : null;
                  if (!fd || !stairChoice.dnFloor) return;
                  const label = fd.floors.find(f => f.number === stairChoice.dnFloor)?.label ?? `Floor ${stairChoice.dnFloor}`;
                  setStairChoice(null);
                  setStairLoading({ dir:"down", label });
                  setTimeout(() => { setFloorView(v => v ? {...v, floor: stairChoice.dnFloor!} : v); setStairLoading(null); }, 750);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:opacity-90"
                style={{ background:"rgba(249,115,22,0.08)", borderColor:"rgba(249,115,22,0.25)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ background:"#f97316" }}>↓</div>
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color:"var(--foreground)", fontFamily:"var(--font-sans)" }}>Go Down</p>
                  <p className="text-xs" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>{stairChoice.dnLabel}</p>
                </div>
              </button>
            </div>
            <button onClick={() => setStairChoice(null)}
              className="w-full mt-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-70"
              style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}      {/* ══════════════ MODALS ══════════════ */}
      {locationScannerOpen && (
        <LocationQRScanner
          onClose={() => setLocationScannerOpen(false)}
          onScan={handleLocationQrScan}
          onSearchInstead={() => {
            setLocationScannerOpen(false);
            setSearch("");
            setSearchFocused(true);
          }}
        />
      )}
      {(reportModal || reportCampusPlace) && <ReportModal building={reportModal ?? undefined} campusPlace={reportCampusPlace ?? undefined} campusId={activeCampus?.id} floors={reportModal ? activeCampus?.buildings.find(building => building.id === reportModal.id)?.floors : undefined} initialFloorId={reportRoomContext?.floorId} initialRoomId={reportRoomContext?.roomId} onClose={() => { setReportModal(null); setReportCampusPlace(null); setReportRoomContext(null); }}/>}
      {signInPrompt  && <SignInPrompt message={signInPrompt} onClose={() => setSignInPrompt(null)}/>}

      {/* Campus switching loading overlay */}
      {campusTransitioning && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-sm" style={{ animation:"fadeIn 0.15s ease-out both" }}>
          <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-card/90 backdrop-blur-xl shadow-xl border border-border/50" style={{ animation:"scaleIn 0.25s cubic-bezier(0.16,1,0.3,1) both" }}>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className={cn("h-5 w-5 text-primary", !reducedMotion && "animate-spin")} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-foreground">Loading campus…</p>
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60" style={reducedMotion ? undefined : { animation:`loading-bounce 0.8s ease-in-out ${i * 0.18}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      )}
      {eventOverlaysEnabled && !isFloorMode && <button ref={eventMapTriggerRef} type="button" data-testid="student-event-map-button" data-dock="event-map-bottom-left" data-suppressed={Boolean(directionsMode || navigationTransitioning || route || selected || selectedCampusPlace)} aria-label="Open event map" aria-hidden={Boolean(directionsMode || navigationTransitioning || route || selected || selectedCampusPlace || showEventMaps)} disabled={Boolean(directionsMode || navigationTransitioning || route || selected || selectedCampusPlace || showEventMaps)} tabIndex={directionsMode || navigationTransitioning || route || selected || selectedCampusPlace || showEventMaps ? -1 : 0} aria-expanded={showEventMaps} onClick={() => {
        const nextOpen = !showEventMaps;
        setShowEventMaps(nextOpen);
        if (!nextOpen) { setSelectedEventId(null); setSelectedLocationId(null); }
      }} className="student-map-event-control map-layer-controls absolute left-3 bottom-24 z-20 inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-3 text-sm font-bold text-primary shadow-md md:bottom-5" data-no-drag>
        <CalendarDays className="mr-2 h-4 w-4" />Event map
      </button>}
      {eventOverlaysEnabled && <EventMapPanel
        open={showEventMaps}
        loading={eventFeed.loading}
        error={eventFeed.error}
        events={eventFeed.events}
        nowMs={eventFeed.nowMs}
        filter={eventFilter}
        selectedEventId={selectedEventId}
        selectedLocationId={selectedLocationId}
        onClose={() => { setShowEventMaps(false); setSelectedEventId(null); setSelectedLocationId(null); }}
        onRetry={eventFeed.refresh}
        onFilterChange={setEventFilter}
        onSelectEvent={(eventId) => { setSelectedEventId(eventId); setSelectedLocationId(null); }}
        onViewLocation={viewEventLocation}
        onBackToEvents={() => { setSelectedEventId(null); setSelectedLocationId(null); }}
      />}
    </div>
  );
}
