import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect, useReducer, lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";

import {
  Search, Building2, X, ArrowDown, ArrowUp, MoveVertical,
  Accessibility, AlertTriangle, Navigation, Bookmark,
  Clock, ChevronRight, ChevronLeft,
  Share2, CalendarDays, MapPin, Compass,
  Footprints, QrCode, Loader2, RefreshCw, AlertCircle, Crosshair, Play, Pause,
} from "lucide-react";

import { useDebounce, usePublishedCampus, useCampusSearch, useReducedMotion, type SearchResult } from "../hooks";
import { type RoomType } from "../data/floorPlans";
import type { Building } from "../types";
import { cn } from "../lib/utils";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useArrivalChime } from "../hooks/useArrivalChime";
import { useStudentOrgEventUpdates } from "../hooks/useStudentOrgEventUpdates";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../hooks/useTheme";

import { buildingPositionsFromCampus, floorPlansFromCampus, buildingsFromCampus, facilitiesFromCampus, accessibilityFromCampus } from "../lib/mapDataAdapter";
import {
  findIndoorRouteForFloor,
  findIndoorRouteFromNavigationGraph,
  type IndoorRoute,
  type RoomLike,
} from "../lib/indoorPathfinding";
import { hasNavigableRoute, planAuthoredDestinationRoutes, planBuildingRoute, planDestinationRoute, planPointToDestinationRoute, planRouteFromPoint, type PlannedRoute, type RouteIndoorSegment, type RouteStep, type StandardRoutePreference } from "../lib/routePlanner";
import type { CampusPlaceDest, Destination, RoomDest } from "../lib/combinedPathfinding";
import { pointAlongPolyline, snapToNearest } from "../lib/geo";
import { createRoutePointSampler } from "../lib/studentRoute3dPresentation";
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
  STUDENT_FLOOR_MAP_MAX_ZOOM,
  STUDENT_MAP_MAX_ZOOM,
  STUDENT_MAP_MIN_ZOOM,
  STUDENT_MAP_ZOOM_STEP,
} from "../lib/mapViewport";
import { campusGroundAppearance } from "../lib/campusCanvas";
import { isCampusGate } from "../lib/campusGates";
import { routeEndpointFromSearchResult, routeEndpointKey, routeEndpointLabel, type RouteEndpoint } from "../lib/routeEndpoints";
import { guidedRouteProgressDuration, navigationSeekDuration, navigationWalkDuration, outdoorWalkingDistance, reducedMotionWalkingDuration } from "../lib/walkingAnimation";
import { isStudentEmergencyRouteCurrentAndEligible, planStudentEmergencyRoute } from "../lib/studentEmergencyNavigation";
import { isAssemblyPointAssignedForBuilding } from "../lib/emergencyAssemblyPoints";
import { analyzeEmergencyOutdoorConnectivity } from "../lib/emergencyOutdoorConnectivity";
import { selectEmergencyRouteFailureReason, type EmergencyPlannerAvailability } from "../lib/emergencyRouteStatus";
import {
  resolveAutomaticStudentEvacuationRoutes,
  studentEmergencyCampusRouteSegments as buildStudentEmergencyCampusRouteSegments,
  studentEmergencyFloorRouteSegments as buildStudentEmergencyFloorRouteSegments,
  studentEmergencyRouteMapLabel,
  currentStudentEmergencyRouteFingerprint,
} from "../lib/studentEmergencyEvacuation";
import { doorEntranceLinkStatus, entryFloorForBuilding } from "../lib/entranceTransitions";
import { entranceWorldPosition, normalizeEntranceDirection, normalizeEntranceType } from "../lib/buildingEntrances";
import { mapBackAction, publishMapSurface, type MapSurface } from "../lib/mapSurface";
import { getStudentFloorInspectionSlack, getStudentOutdoorInspectionSlack, getStudentOverviewCamera, getStudentRoomFocusCamera, getStudentRoomFocusProgress } from "../lib/studentMapCamera";
import { getFloorShapeBounds, getFloorShapeRegions } from "../lib/floorShape";
import { studentMapOverlayIsBottomSheet } from "../lib/student3dCameraFocus";
import { roomOutlinePoints, roomShapeBounds } from "../lib/roomShape";
import { authoredNavigableRoomKeys, authoredRoomNavigationKey } from "../lib/roomNavigationMembership";
import {
  RoutePlannerDialog, RouteMapOverlay,
  ReportModal, SignInPrompt, LocationQRScanner,
  BuildingInfoPanel, MobileBuildingSheet, MobileMapAccountMenu, StudentFloorPicker, StudentSelectedPlaceCard, CampusPlaceDetails,
  DiscoverTourPanel,
  type DiscoverTourView,
  type MobileBuildingSheetState,
  StudentMapControls,
} from "../components/map";
import { authoredFloorTransitionPoint, groupStudentRouteExploreTransitions, initialStudentRouteUiState, panForRouteFocusPoint, routeProgressForStepIndex, routeStepIndexForAuthoredTransition, routeStepIndexForBuildingTransition, routeStepIndexForProgress, routeTransitionForStep, screenSpaceMarkerScale, canonicalActiveRouteStepIndex, studentDisplayedRouteProgress, studentFacingRouteSteps, studentIndoorSegmentForFloor, studentInstructionWithoutUncalibratedDistance, studentRoomFocusTargetId, studentRouteArrivalCameraPoint, studentRouteArrivalTarget, studentRouteCampusMarkerTarget, studentRouteExploreInspectionTarget, studentRouteExploreTransitionCues, studentRouteInspectionTransitionDisplayLabel, studentRouteExploreTransitionTarget, studentRouteFloorLabel, studentRouteFocusAtProgress, studentRouteInitialContext, studentRoutePlaybackTarget, studentRoutePositionForLeg, studentRouteProgressForIndoorSegment, studentRouteSeekDistanceM, studentRouteSeekGeometryDistance, studentRouteStepInstruction, studentRouteSeekTarget, studentRouteShouldPauseAtZeroWalkVerticalAccess, studentRouteStepSeekIndex, studentRouteTransitionCueStepIndex, studentRoutePreviewTransitionTarget, studentRouteTransitionCues as deriveStudentRouteTransitionCues, studentRouteVerticalTransitionContinuesRun, studentRouteVerticalTransitionGroupId, studentRouteVerticalTransitionRunId, studentRoutePrimaryAction, studentRouteCanResumeAfterTransition, studentRouteInitialPhysicalTransitionStepIndex, studentRouteReachedFinalEndpoint, studentRouteFollowNeedsCameraReacquisition, studentRouteUiReducer, studentTransitionMarkerLodScale } from "../lib/studentRouteFlow";
import { studentRoutePreferenceFallbackNotice } from "../lib/studentRouteFlow";
import { studentRoutePlaybackAfterCameraReacquisition } from "../lib/studentRouteFlow";
import { studentRoutePauseReasonAfterCameraReacquisition } from "../lib/studentRouteFlow";
import { studentRouteFollowOwnsCamera } from "../lib/studentRouteFlow";
import { student3dCameraFollowOffsetForContext, student3dCameraRecenterCompletionMatches, student3dCameraRecenterNonceForContext, type Student3dCameraRecenterRequest } from "../lib/student3dCameraRecenter";
import { studentAccountService } from "../services/studentAccountService";
import { studentMobilePanelAvailableHeight } from "../lib/studentMobilePanels";
import { studentMapUtilityRightInset } from "../lib/studentMapUtilityLayout";
import { DEFAULT_PUBLIC_PLATFORM_SETTINGS, settingsService, type PublicPlatformSettings } from "../services/settingsService";
import { usageAnalyticsService } from "../services/usageAnalyticsService";
import type {
  Campus as EditorCampus,
  AssemblyPoint,
  CampusMarker,
  FloorPlan,
  FloorRoom,
  NavigationNode,
} from "../components/map-builder/types";
import { canEnterOutdoorBuilding, ReadonlyOutdoorCampusScene } from "../components/map-builder/ReadonlyOutdoorVisuals";
import { readonlyFloorPlanViewport } from "../components/map-builder/readonlyFloorPlanViewport";
import { StudentRouteTransitionMarker, studentRouteTransitionViewportFromCamera } from "../components/map/StudentRouteTransitionMarker";
import { StudentMapModeToggle } from "../components/map/StudentMapControls";
import { EventPreviewLayer } from "../components/map/EventPreviewLayer";
import { EventMapPanel } from "../components/map/EventMapPanel";
import { EventVenueLayer } from "../components/map/EventVenueLayer";
import { StudentEmergencyVideoCard, type EmergencyVideoPlaybackState } from "../components/map/StudentEmergencyVideoCard";
import { StudentEmergencyVideoOverlay } from "../components/map/StudentEmergencyVideoOverlay";
import { ArrivalSoundToggle } from "../components/map/ArrivalSoundToggle";
import { StudentNotificationBellForCampus } from "../components/layout/StudentNotificationBell";
import { useEventMapPreviews } from "../hooks/useEventMapPreviews";
import { buildEventVenues, eventLocationOnMap, eventVenueCandidates, resolveEventLocation, selectedEventLocation, toEventOverlayPreview, visibleEventCards } from "../lib/eventMapView";
import type { EventMapFilter } from "../types/eventPreview";
import { ComingSoonCampusScreen } from "../components/map/ComingSoonCampusScreen";
import { StudentCampusSelector, computeStudentCampusSelectorMaxWidth } from "../components/map/StudentCampusSelector";
import { student3dCameraOffsetFromPose, type Student3dCameraOffset, type Student3dCameraPose } from "../lib/student3dCameraPose";

function studentRouteTargetPoints(route: PlannedRoute, target: ReturnType<typeof studentRouteSeekTarget>): Pt[] {
  const contextLeg = target.contextLegIndex === undefined ? undefined : route.contextLegs?.[target.contextLegIndex];
  return contextLeg?.waypoints ?? target.segment?.waypoints ?? (route.campusPoints?.length ? route.campusPoints : route.points);
}

const LazyStudentCampus3DRenderer = lazy(() => import("../components/map/StudentCampus3DRenderer"));
const LazyIndoorFloor3DRenderer = lazy(() => import("../components/map/IndoorFloor3DRenderer"));
const LazyReadonlyFloorPlanScene = lazy(() => import("../components/map-builder/ReadonlyFloorPlanVisuals").then((module) => ({ default: module.ReadonlyFloorPlanScene })));
const EMPTY_MAP_POINTS: Pt[] = [];
const EMPTY_FLOOR_FURNITURE: FloorPlan["furniture"] = [];
const EMPTY_FLOOR_LABELS: FloorPlan["labels"] = [];

type CampusLocationQrPayload = {
  locationId: string;
  campusId?: string;
  buildingId?: string;
  floorId?: string;
  floorNumber?: number;
  locationType?: "room";
};

type StudentArrivalCameraTarget = {
  key: string;
  context: "campus" | "floor";
  /** Canonical final point retained for the avatar marker. */
  avatarPoint: Pt;
  /** Last distinct point on the final indoor leg, used to face the arrival camera through its authored approach. */
  approachPoint?: Pt;
  /** Presentation focus may center a destination building/room around this point. */
  cameraPoint: Pt;
  buildingId?: string;
  floorNumber?: number;
  roomId?: string;
  campusPlaceId?: string;
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

  const gate = (campus.markers ?? []).find((candidate) => candidate.id === locationId && isCampusGate(candidate));
  if (gate) {
    return {
      kind: "outdoor",
      point: { x: gate.x, y: gate.y },
      label: gate.name || "Campus Gate",
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

function campusPlaceEntity(campus: EditorCampus | null | undefined, placeId: string | null | undefined): CampusMarker | null {
  if (!campus || !placeId) return null;
  const marker = campus.markers?.find((candidate) => candidate.id === placeId);
  if (marker) return marker;
  const point = campus.assemblyPoints?.find((candidate) => candidate.id === placeId);
  return point ? {
    id: point.id,
    name: point.name || "Emergency Assembly Point",
    type: "assembly_point",
    x: point.x,
    y: point.y,
    color: "#e11d48",
    navNodeId: point.navNodeId ?? campus.navNodes?.find((candidate) => candidate.assemblyPointId === point.id)?.id,
  } : null;
}

function campusPlaceDestination(place: CampusMarker | AssemblyPoint, campus: EditorCampus | null | undefined): CampusPlaceDest | null {
  if (!campus) return null;
  const isAssemblyPoint = Boolean(campus.assemblyPoints?.some((candidate) => candidate.id === place.id));
  const node = campus.navNodes?.find((candidate) => candidate.id === place.navNodeId
    || (isAssemblyPoint ? candidate.assemblyPointId === place.id : candidate.gateId === place.id));
  if (!node
    || (isAssemblyPoint && node.assemblyPointId !== place.id)
    || (!isAssemblyPoint && node.gateId && node.gateId !== place.id)) return null;
  return {
    type: "campus_place",
    campusPlaceId: place.id,
    label: place.name || "Campus place",
    code: place.name || "Campus place",
    nodeId: node.id,
    accessible: node.accessible,
  };
}

function campusPlaceCanRoute(place: CampusMarker | AssemblyPoint, campus: EditorCampus | null | undefined, direction: "inbound" | "outbound"): boolean {
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
const MOBILE_OUTDOOR_VIEWER_INSETS = { top: 150, right: 44, bottom: 144, left: 8 };
const MOBILE_FLOOR_VIEWER_INSETS = { top: 124, right: 8, bottom: 140, left: 8 };
interface Pt { x: number; y: number; }

/** Visible map region after accounting for the actual mobile sheets and header. */
function studentMapFocusViewport(surface: HTMLElement): { left: number; right: number; top: number; bottom: number } {
  const bounds = surface.getBoundingClientRect();
  const visible = { left: bounds.left + 12, right: bounds.right - 12, top: bounds.top + 12, bottom: bounds.bottom - 12 };
  const mobile = bounds.width < 768;
  const overlaps = (rect: DOMRect) => rect.right > bounds.left && rect.left < bounds.right
    && rect.bottom > bounds.top && rect.top < bounds.bottom;
  const header = surface.querySelector<HTMLElement>("[data-map-search-header='true']")?.getBoundingClientRect();
  if (header && overlaps(header)) visible.top = Math.max(visible.top, header.bottom + 12);

  const overlays = [
    ".map-layer-building-sheet",
    "[data-testid='building-details-desktop']",
    "[data-testid='route-planner-dialog']",
    "[data-testid='collapsed-route-card']",
    "[data-testid='mobile-active-route-dock']",
    "[data-testid='mobile-building-sheet']",
    "[data-testid='student-selected-place-card']",
    "[data-testid='student-floor-picker-menu']",
    "[data-testid='discover-tour-panel']",
  ].flatMap((selector) => {
    const element = surface.querySelector<HTMLElement>(selector)
      ?? document.querySelector<HTMLElement>(selector);
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && overlaps(rect) ? [rect] : [];
  });
  for (const rect of overlays) {
    // On short phones an expanded sheet can start well above the canvas
    // midpoint. Detect it by its width and bottom anchoring, not by its top
    // edge; otherwise it is mistaken for a left-side panel and the route gets
    // focused underneath it.
    const bottomSheet = mobile && studentMapOverlayIsBottomSheet(bounds, rect);
    if (bottomSheet) {
      visible.bottom = Math.min(visible.bottom, rect.top - 12);
    } else if (rect.top <= bounds.top + 24) {
      visible.top = Math.max(visible.top, rect.bottom + 12);
    } else if (rect.left <= bounds.left + 24) {
      visible.left = Math.max(visible.left, rect.right + 12);
    } else if (rect.right >= bounds.right - 24) {
      visible.right = Math.min(visible.right, rect.left - 12);
    } else if (rect.bottom >= bounds.bottom - 24) {
      visible.bottom = Math.min(visible.bottom, rect.top - 12);
    }
  }
  // A nearly full-height panel can leave a tiny strip. Keep focus stable in
  // that case rather than calculating a reversed or zero-sized rectangle.
  if (visible.right - visible.left < 48) {
    visible.left = bounds.left + 12;
    visible.right = bounds.right - 12;
  }
  if (visible.bottom - visible.top < 48) {
    visible.top = bounds.top + 12;
    visible.bottom = bounds.bottom - 12;
  }
  return visible;
}

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
        // This appended leg follows the outdoor route to the building door.
        // Mark it as destination-side so the existing indoor handoff renders
        // it after Enter Building instead of treating it as an origin leg.
        afterOutdoor: true,
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

function activeRouteSegmentsForBuilding(
  route: PlannedRoute | null | undefined,
  buildingId: string,
  navigationPhase: NavigationPhase,
  roomOriginBuildingId?: string,
): RouteIndoorSegment[] {
  if (roomOriginBuildingId === buildingId) {
    return indoorSegmentsForBuilding(route, buildingId, "before-outdoor");
  }
  if (route?.destinationRoom?.buildingId === buildingId) {
    return indoorSegmentsForBuilding(route, buildingId, "after-outdoor");
  }
  if (navigationPhase === "origin-indoor") {
    return indoorSegmentsForBuilding(route, buildingId, "before-outdoor");
  }
  if (navigationPhase === "destination-indoor") {
    return indoorSegmentsForBuilding(route, buildingId, "after-outdoor");
  }
  return indoorSegmentsForBuilding(route, buildingId);
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
  /** Optional initial target supplied by an admin report location preview. */
  initialCampusId?: string;
  initialBuildingId?: string;
  initialPlaceId?: string;
  /** Open on this room (within initialBuildingId) instead of just its building. */
  initialRoomId?: string;
  initialFloorId?: string;
  /** Remove the public-layout header offset when embedded full-screen. */
  fullScreen?: boolean;
  /** Allow an admin preview shell to reserve space for its own toolbar. */
  fullScreenHeight?: string;
  /** Optional details panel rendered beside a map location preview. */
  locationPreviewPanel?: ReactNode;
}

interface DiscoverTourState {
  active: boolean;
  navigationGuard: boolean;
  campusId: string | null;
  view: DiscoverTourView;
  stopIndex: number;
  mobileExpanded: boolean;
}

interface DiscoverMapSnapshot {
  campusId: string;
  selected: Building | null;
  selectedCampusPlaceId: string | null;
  floorView: { building: Building; floor: number } | null;
  selectedRoomContext: RoomDest | null;
  highlightedRoom: string | null;
  showBuildingDetailsDuringRoutePlanner: boolean;
  campusViewMode: "2d" | "3d";
  campus3DFallback: boolean;
  zoom: number;
  pan: Pt;
  search: string;
  directionsMode: boolean;
  campusCameraPose: Student3dCameraPose | null;
  indoorCameraPose: Student3dCameraPose | null;
}

export function CampusMapPage({ previewCampus = null, initialCampusId, initialBuildingId, initialPlaceId, initialRoomId, initialFloorId, fullScreen = false, fullScreenHeight, locationPreviewPanel }: CampusMapPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const darkMode = theme === "dark";
  const studentAuth = useStudentAuth();
  const mobileStudentNotificationRef = useRef<HTMLDivElement>(null);
  const studentEventUpdates = useStudentOrgEventUpdates(
    studentAuth.profile?.id,
    studentAuth.isStudentOrg && !studentAuth.loading,
  );
  const { error: showError, warning: showWarning, success: showSuccess, info: showInfo } = useToast();
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
  const discoverStops = useMemo(() => {
    if (!activeCampus) return [];
    const mapBuildingsById = new Map(MOCK_BUILDINGS.map((building) => [building.id, building]));
    return activeCampus.buildings
      .filter((building) => building.visible !== false
        && Number.isFinite(building.x) && Number.isFinite(building.y)
        && Number.isFinite(building.width) && building.width > 0
        && Number.isFinite(building.height) && building.height > 0)
      .flatMap((publishedBuilding) => {
        const mapBuilding = mapBuildingsById.get(publishedBuilding.id);
        if (!mapBuilding) return [];
        return [{
          published: publishedBuilding,
          map: mapBuilding,
          name: publishedBuilding.name || mapBuilding.name,
          code: publishedBuilding.code || mapBuilding.code,
          description: publishedBuilding.description,
          floorCount: publishedBuilding.floors?.length ?? 0,
        }];
      });
  }, [MOCK_BUILDINGS, activeCampus]);

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
  const [showBuildingDetailsDuringRoutePlanner, setShowBuildingDetailsDuringRoutePlanner] = useState(false);
  const [campusViewMode, setCampusViewMode] = useState<"2d" | "3d">("2d");
  const [campus3DLoaded, setCampus3DLoaded] = useState(false);
  const [indoor3DLoaded, setIndoor3DLoaded] = useState(false);
  const [campus3DFallback, setCampus3DFallback] = useState(false);
  const [discoverTour, setDiscoverTour] = useState<DiscoverTourState>({ active: false, navigationGuard: false, campusId: null, view: "showcase", stopIndex: 0, mobileExpanded: false });
  const discoverSnapshotRef = useRef<DiscoverMapSnapshot | null>(null);
  const discoverExitHandlerRef = useRef<(() => void) | null>(null);
  const discoverStopIndexRef = useRef(0);
  const campusCameraPoseRef = useRef<Student3dCameraPose | null>(null);
  const indoorCameraPoseRef = useRef<Student3dCameraPose | null>(null);
  const discoverExteriorCameraPoseRef = useRef<Student3dCameraPose | null>(null);
  const followCameraPoseCaptureEnabledRef = useRef(false);
  const followCameraPoseCaptureSuppressedRef = useRef(false);
  const activeFollowCameraContextKeyRef = useRef("campus");
  const followCameraOffsetsByContextRef = useRef(new Map<string, Student3dCameraOffset>());
  const cameraPoseRestoreNonceRef = useRef(0);
  const [cameraPoseRestore, setCameraPoseRestore] = useState<Student3dCameraPose | null>(null);
  const [cameraPoseRestoreNonce, setCameraPoseRestoreNonce] = useState(0);
  const rememberCampusCameraPose = useCallback((pose: Student3dCameraPose) => {
    campusCameraPoseRef.current = pose;
    if (followCameraPoseCaptureEnabledRef.current
      && !followCameraPoseCaptureSuppressedRef.current
      && activeFollowCameraContextKeyRef.current === "campus") {
      followCameraOffsetsByContextRef.current.set("campus", student3dCameraOffsetFromPose(pose));
    }
  }, []);
  const rememberIndoorCameraPose = useCallback((pose: Student3dCameraPose) => {
    indoorCameraPoseRef.current = pose;
    if (followCameraPoseCaptureEnabledRef.current
      && !followCameraPoseCaptureSuppressedRef.current
      && activeFollowCameraContextKeyRef.current !== "campus") {
      followCameraOffsetsByContextRef.current.set(activeFollowCameraContextKeyRef.current, student3dCameraOffsetFromPose(pose));
    }
  }, []);
  const queueCameraPoseRestore = useCallback((pose: Student3dCameraPose | null) => {
    if (!pose) return;
    const nonce = ++cameraPoseRestoreNonceRef.current;
    setCameraPoseRestore(pose);
    setCameraPoseRestoreNonce(nonce);
  }, []);
  const [campus3DCameraRecenterRequest, setCampus3DCameraRecenterRequest] = useState<Student3dCameraRecenterRequest | null>(null);
  const campus3DRecenterNonceRef = useRef(0);
  const pending3DCameraRecenterRef = useRef<(Student3dCameraRecenterRequest & { onComplete?: () => void }) | null>(null);
  const followRecenterRequestRef = useRef(0);
  const followRecenterIntentRef = useRef<{ resumePlayback?: "playing" | "paused"; afterRecenter?: () => void } | null>(null);
  const prepareRouteForContextInspectionRef = useRef<() => "normal" | "inspection" | "blocked">(() => "normal");
  const followCameraReacquiringRef = useRef(false);
  const requestCampus3DRecenter = useCallback((contextKey: string, onComplete?: () => void, followOffset?: Student3dCameraOffset | null) => {
    const nonce = campus3DRecenterNonceRef.current + 1;
    campus3DRecenterNonceRef.current = nonce;
    const previous = pending3DCameraRecenterRef.current;
    const retainedCompletion = onComplete ?? (previous?.contextKey === contextKey ? previous.onComplete : undefined);
    pending3DCameraRecenterRef.current = { nonce, contextKey, followOffset, onComplete: retainedCompletion };
    setCampus3DCameraRecenterRequest({ nonce, contextKey, followOffset });
    return nonce;
  }, []);
  const cancelPendingCampus3DCameraRecenter = useCallback(() => {
    pending3DCameraRecenterRef.current = null;
    setCampus3DCameraRecenterRequest(null);
  }, []);
  const on3DCameraRecenterComplete = useCallback((nonce: number, contextKey: string) => {
    const pending = pending3DCameraRecenterRef.current;
    if (!pending || !student3dCameraRecenterCompletionMatches(pending, nonce, contextKey)) return;
    pending3DCameraRecenterRef.current = null;
    setCampus3DCameraRecenterRequest(null);
    pending.onComplete?.();
  }, []);
  const onCampus3DCameraRecenterComplete = useCallback((nonce: number) => {
    on3DCameraRecenterComplete(nonce, "campus");
  }, [on3DCameraRecenterComplete]);
  const pending2DRendererReframeRef = useRef<null | { kind: "route"; point: Pt; floor: boolean }
    | { kind: "room"; buildingId: string; roomId: string; floorNumber: number }
    | { kind: "building"; buildingId: string }
    | { kind: "place"; campusPlaceId: string }
    | { kind: "overview"; floor: boolean }>(null);
  const [selectedCampusPlaceId, setSelectedCampusPlaceId] = useState<string | null>(null);
  const selectedCampusPlace = useMemo(() => campusPlaceEntity(activeCampus, selectedCampusPlaceId), [activeCampus, selectedCampusPlaceId]);
  const [mobileBuildingSheetState, setMobileBuildingSheetState] = useState<MobileBuildingSheetState>("default");
  const [floorPickerFallbackActive, setFloorPickerFallbackActive] = useState(false);
  const [mapMode,      setMapMode]      = useState<MapMode>("standard");
  const [emergencyVideoOverlayKey, setEmergencyVideoOverlayKey] = useState<string | null>(null);
  const emergencyVideoPauseLatchRef = useRef(false);
  const emergencyVideoPlaybackRef = useRef<{ key: string | null; state: EmergencyVideoPlaybackState }>({
    key: null,
    state: { currentTime: 0, muted: true, loop: true },
  });
  const emergencyVideoAutoplaySuppressedRef = useRef<{ key: string | null; suppressed: boolean }>({ key: null, suppressed: false });
  const [platformSettings, setPlatformSettings] = useState<PublicPlatformSettings>(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
  const [platformSettingsReady, setPlatformSettingsReady] = useState(false);
  const [zoom,         setZoom]         = useState(DEFAULT_OUTDOOR_ZOOM);
  const zoomRef = useRef(DEFAULT_OUTDOOR_ZOOM);
  const [displayZoom,  setDisplayZoom]  = useState(1);
  const displayZoomRef = useRef(1);
  const [pan,          setPan]          = useState<Pt>({ x:0, y:0 });
  const [saved,        setSaved]        = useState<Set<string>>(new Set());
  const [savedStateLoading, setSavedStateLoading] = useState(true);
  const [savedStateUnavailable, setSavedStateUnavailable] = useState(false);
  const animFrameRef   = useRef<number>(undefined);

  // Load favorites only after auth and campus resolution. Cancel stale reads so
  // an earlier empty-campus response cannot overwrite the selected campus's
  // saved state when a deep link opens a building from Home.
  useEffect(() => {
    let current = true;
    if (studentAuth.loading || isCampusLoading) {
      setSavedStateLoading(true);
      return () => { current = false; };
    }
    if (!activeCampus) {
      setSaved(new Set());
      setSavedStateUnavailable(false);
      setSavedStateLoading(false);
      return () => { current = false; };
    }

    setSavedStateLoading(true);
    setSavedStateUnavailable(false);
    void Promise.all([
      studentAccountService.getSavedBuildings(MOCK_BUILDINGS),
      studentAccountService.getSavedCampusPlaceIdsAsync(),
    ]).then(([buildings, campusPlaceIds]) => {
      if (!current) return;
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
    }).catch(() => {
      if (!current) return;
      setSaved(new Set());
      setSavedStateUnavailable(true);
    }).finally(() => {
      if (current) setSavedStateLoading(false);
    });
    return () => { current = false; };
  }, [MOCK_BUILDINGS, activeCampus, isCampusLoading, studentAuth.loading, studentAuth.profile?.id]);

  // Floor plan state (replaces buildingView — floor plans now render in the main SVG)
  const [floorView,       setFloorView]       = useState<{ building: Building; floor: number }|null>(null);
  const isFloorMode = floorView !== null;
  const campus3DActive = Boolean(activeCampus && !isFloorMode && campusViewMode === "3d" && campus3DLoaded && !campus3DFallback);
  const indoor3DActive = Boolean(activeCampus && isFloorMode && campusViewMode === "3d" && indoor3DLoaded && !campus3DFallback);
  const student3DActive = campus3DActive || indoor3DActive;
  const student3DActiveRef = useRef(student3DActive);
  student3DActiveRef.current = student3DActive;
  useEffect(() => {
    if (campusViewMode !== "3d" || campus3DFallback || !activeCampus) return;
    if (isFloorMode) setIndoor3DLoaded(true);
    else setCampus3DLoaded(true);
  }, [activeCampus, campus3DFallback, campusViewMode, isFloorMode]);
  const doorwayDiscoveryHintShownRef = useRef(false);
  useEffect(() => {
    if (previewCampus || isFloorMode || !readonlyOutdoorCampus?.entrances.some(canEnterOutdoorBuilding)
      || doorwayDiscoveryHintShownRef.current) return;
    const hintKey = "plv-student-map-doorway-actions-hint-seen";
    try {
      if (window.localStorage.getItem(hintKey)) {
        doorwayDiscoveryHintShownRef.current = true;
        return;
      }
      window.localStorage.setItem(hintKey, "true");
    } catch {
      // Storage is optional; the ref still prevents repeated hints this visit.
    }
    doorwayDiscoveryHintShownRef.current = true;
    showInfo("Tap entrance icons to enter or exit buildings.", { duration: 4800 });
  }, [isFloorMode, previewCampus, readonlyOutdoorCampus, showInfo]);
  const activeMapZoomMaxRef = useRef(isFloorMode ? STUDENT_FLOOR_MAP_MAX_ZOOM : STUDENT_MAP_MAX_ZOOM);
  activeMapZoomMaxRef.current = isFloorMode ? STUDENT_FLOOR_MAP_MAX_ZOOM : STUDENT_MAP_MAX_ZOOM;
  const clampActiveStudentZoom = useCallback(
    (value: number) => clampStudentMapZoom(value, activeMapZoomMaxRef.current),
    [],
  );
  const [hoveredRoom,     setHoveredRoom]     = useState<string|null>(null);
  const [highlightedRoom, setHighlightedRoom] = useState<string|null>(null);
  const [selectedRoomContext, setSelectedRoomContext] = useState<RoomDest | null>(null);
  const [routePlannerEndpoint, setRoutePlannerEndpoint] = useState<"start" | "destination" | null>(null);
  const [qrRouteStartNotice, setQrRouteStartNotice] = useState<string | null>(null);
  const [routePlannerMapPick, setRoutePlannerMapPick] = useState<"start" | "destination" | null>(null);
  const [routePlannerMapPickCandidate, setRoutePlannerMapPickCandidate] = useState<{ endpoint: RouteEndpoint; purpose: "start" | "destination" } | null>(null);
  const [routePlannerSelectionError, setRoutePlannerSelectionError] = useState<string | null>(null);
  const [stairLoading,    setStairLoading]    = useState<{
    dir: "up" | "down";
    label: string;
    fromFloorLabel?: string;
    toFloorLabel?: string;
    transitionName?: string;
  } | null>(null);
  const [stairChoice,     setStairChoice]     = useState<{
    roomType: RoomType; upFloor: number|null; dnFloor: number|null; upLabel: string; dnLabel: string;
  }|null>(null);
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
  const [campusSelectorTop, setCampusSelectorTop] = useState<number | null>(null);
  const [campusSelectorMaxWidth, setCampusSelectorMaxWidth] = useState<number | null>(null);
  const [studentRouteUi, dispatchStudentRouteUi] = useReducer(studentRouteUiReducer, initialStudentRouteUiState);
  const studentRouteUiRef = useRef(studentRouteUi);
  studentRouteUiRef.current = studentRouteUi;
  const [mobileRoutePreviewExpanded, setMobileRoutePreviewExpanded] = useState(false);
  const routePreviewFocusFrameRef = useRef<number | null>(null);
  const arrivalSound = useArrivalChime(studentRouteUi.phase, studentRouteUi.camera);
  // Route Preview owns an inspection cursor separate from Follow playback.
  const [routePreviewStepIndex, setRoutePreviewStepIndex] = useState(0);
  const [followCameraDetached, setFollowCameraDetached] = useState(false);
  followCameraPoseCaptureEnabledRef.current = studentRouteUi.phase === "navigating"
    && studentRouteUi.camera === "follow"
    && !followCameraDetached
    && !followCameraReacquiringRef.current;
  const [followCameraRecoveryFailed, setFollowCameraRecoveryFailed] = useState(false);
  const followCameraRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navigationPauseReason, setNavigationPauseReason] = useState<"manual" | "transition" | "pan" | null>(null);
  const [verticalRunPausePending, setVerticalRunPausePending] = useState(false);
  const recenterCurrentRouteStepRef = useRef<(resumePlayback?: "playing" | "paused", afterRecenter?: () => void) => void>(() => {});
  const routeContextIsElsewhereRef = useRef(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const playbackCursorRef = useRef(0);
  const [playbackCursor, setPlaybackCursor] = useState(0);
  const routeTransitionActivationRef = useRef<number | null>(null);
  const autoVerticalTraversalSharedIdRef = useRef<string | null>(null);
  const verticalRunEndsAfterTransitionRef = useRef(false);
  const pauseAfterVerticalTransitionRef = useRef(false);
  const activateCurrentRouteTransitionRef = useRef<() => void>(() => {});
  const inspectGuidedRouteTransitionRef = useRef<(stepIndex?: number) => void>(() => {});
  // A physical route transition pauses at its source. Resume only when the
  // student was walking when they reached that transition; an explicit Pause
  // at the marker remains paused after activation.
  const transitionResumePlaybackRef = useRef(false);
  const routeEntryTransitionCompleteRef = useRef(false);
  const [routeTransitionActivationNonce, setRouteTransitionActivationNonce] = useState(0);
  const stepSeekAnimRef = useRef<number | null>(null);
  const stepSeekTargetRef = useRef<number | null>(null);
  const stepSeekTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTransitionSeekRef = useRef(false);
  useEffect(() => () => {
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
  }, []);
  const detachFollowCamera = useCallback(() => {
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow") {
      followCameraPoseCaptureSuppressedRef.current = true;
      setFollowCameraDetached(true);
    }
  }, [studentRouteUi.camera, studentRouteUi.phase]);
  const clearFollowCameraRecoveryTimer = useCallback(() => {
    if (followCameraRecoveryTimerRef.current !== null) clearTimeout(followCameraRecoveryTimerRef.current);
    followCameraRecoveryTimerRef.current = null;
  }, []);
  useEffect(() => () => {
    if (followCameraRecoveryTimerRef.current !== null) clearTimeout(followCameraRecoveryTimerRef.current);
  }, []);
  const directionsWasOpenRef = useRef(false);
  const routeModeTouchedRef = useRef(false);
  const completedRouteEditOpeningRef = useRef(false);
  const routeStartFocusPendingRef = useRef(false);
  const pendingRouteStartFocusRef = useRef<{ point: { x: number; y: number }; floor: boolean } | null>(null);
  const pendingRouteRecenterRef = useRef<{
    contextKey: string;
    point: { x: number; y: number };
    floor: boolean;
    source?: "route-inspection";
    onComplete?: () => void;
    forceRecenter3D?: boolean;
    followOffset?: Student3dCameraOffset | null;
  } | null>(null);
  // Explore-mode step inspection index. Presentation only: playback progress
  // refs are never mutated by it, so Return to Follow resumes real progress.
  const [inspectedRouteStepIndex, setInspectedRouteStepIndex] = useState<number | null>(null);
  const inspectedRouteStepIndexRef = useRef<number | null>(null);
  inspectedRouteStepIndexRef.current = inspectedRouteStepIndex;
  // Direction of the last authored elevator/stairs floor change so the next
  // floor scene can slide in with matching vertical motion.
  const floorShiftDirectionRef = useRef<"up" | "down" | null>(null);
  const [standardRoutePreference, setStandardRoutePreference] = useState<StandardRoutePreference>("best");
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
  const walkProgressRef = useRef(0);
  const outdoorRouteLineProgressWriterRef = useRef<((progress: number) => void) | null>(null);
  const outdoorRouteMarkerProgressWriterRef = useRef<((progress: number) => void) | null>(null);
  const [walkNonce,     setWalkNonce]     = useState(0);
  const walkAnimRef = useRef<number | null>(null);
  const indoorWalkAnimRef = useRef<number | null>(null);
  const navigationTransitionAnimRef = useRef<number | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showQR,         setShowQR]         = useState(false);
  const [locationScannerOpen, setLocationScannerOpen] = useState(false);
  const [pendingLocationScan, setPendingLocationScan] = useState<(CampusLocationQrPayload & { campusId: string }) | null>(null);
  // A "view on map" link to a room (Building details → Rooms). Resolved once
  // the search-selection handler exists so it reuses the exact search flow.
  const [pendingRoomLink, setPendingRoomLink] = useState<{ buildingId: string; floorId?: string; roomId: string } | null>(null);

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
    completedRouteEditOpeningRef.current = false;
    if (directionsMode && platformSettingsReady && !routeModeTouchedRef.current) {
      setMapMode(platformSettings.defaultRouteMode);
    }
    directionsWasOpenRef.current = directionsMode;
  }, [directionsMode, platformSettingsReady, platformSettings.defaultRouteMode]);

  // Unified Search Engine Hook for C3
  const campusSearch = useCampusSearch(activeCampus);
  const campusSearchQuery = campusSearch.query;
  const setCampusSearchQuery = campusSearch.setQuery;

  const [showEventMaps, setShowEventMaps] = useState(false);
  const [eventOverlaysEnabled, setEventOverlaysEnabled] = useState(false);
  const eventMapTriggerRef = useRef<HTMLButtonElement>(null);
  const eventMapWasOpenRef = useRef(false);
  const eventMapDeepLink = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const eventId = params.get("eventId");
    if (!eventId) return null;
    const campusId = params.get("eventCampusId");
    const locationId = params.get("eventLocationId");
    return {
      eventId,
      campusId,
      locationId,
      key: JSON.stringify([eventId, campusId, locationId]),
    };
  }, [location.search]);
  const clearEventMapDeepLinkQuery = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete("eventId");
    params.delete("eventCampusId");
    params.delete("eventLocationId");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, { replace: true });
  }, [location, navigate]);
  const startedEventMapDeepLinkRef = useRef<string | null>(null);
  const completedEventMapDeepLinkRef = useRef<string | null>(null);

  // Modals
  const [reportModal,   setReportModal]   = useState<Building|null>(null);
  const [reportCampusPlace, setReportCampusPlace] = useState<CampusMarker | null>(null);
  const [reportRoomContext, setReportRoomContext] = useState<{ floorId: string; roomId: string } | null>(null);
  const [signInPrompt,  setSignInPrompt]  = useState<string|null>(null);
  const wasCampusCachedRef = useRef(false);
  const lastCampusRefreshWarningAtRef = useRef(0);

  useEffect(() => {
    const warningCooldownMs = 5 * 60_000;
    const warningIsDue = Date.now() - lastCampusRefreshWarningAtRef.current >= warningCooldownMs;
    if (isCampusCached && !wasCampusCachedRef.current && warningIsDue) {
      lastCampusRefreshWarningAtRef.current = Date.now();
      showWarning("Campus map refresh unavailable", {
        description: "Using the latest available campus map.",
        duration: 4000,
        action: { label: "Refresh", onClick: () => { void refetchCampus(); } },
      });
    }
    wasCampusCachedRef.current = isCampusCached;
  }, [isCampusCached, refetchCampus, showWarning]);

  useEffect(() => {
    setMobileBuildingSheetState((current) => current === "default" ? current : "default");
  }, [selected?.id]);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const svgRef          = useRef<SVGSVGElement>(null);
  const cameraGroupRef  = useRef<SVGGElement>(null);
  const studentMarkerRootsRef = useRef<SVGGElement[]>([]);
  const markerPresentationKeyRef = useRef("");
  const cameraStatesByContextRef = useRef(new Map<string, { pan: Pt; zoom: number }>());
  const cameraContextKeyRef = useRef("");
  const lastFittedCameraContextRef = useRef<string | null>(null);
  cameraContextKeyRef.current = floorView
    ? `floor:${floorView.building.id}:${floorView.floor}`
    : `campus:${activeCampus?.id ?? "default"}`;
  const applyStudentMarkerPresentation = useCallback((nextZoom: number, force = false) => {
    const worldUnitsPerCssPixel = markerWorldUnitsPerCssPixelRef.current;
    const inverseZoom = screenSpaceMarkerScale(worldUnitsPerCssPixel, nextZoom);
    const visualZoom = nextZoom / worldUnitsPerCssPixel;
    const lod = studentTransitionMarkerLodScale(visualZoom);
    const pulse = visualZoom < 0.34 ? "0.12" : visualZoom < 0.5 ? "0.5" : "1";
    const activePulse = visualZoom < 0.34 ? "0.48" : visualZoom < 0.5 ? "0.72" : "1";
    const callout = visualZoom < 0.34 ? "0" : "1";
    // Fade through a narrow zoom band instead of flickering at one threshold.
    const passiveLabelOpacity = String(Math.max(0, Math.min(1, (visualZoom - 0.42) / 0.16)));
    const duplicateOpacity = Math.max(0, Math.min(1, (visualZoom - 0.34) / 0.2));
    const duplicatePointerEvents = visualZoom <= 0.35 ? "none" : "auto";
    const key = `${inverseZoom}:${lod}:${pulse}:${activePulse}:${callout}:${passiveLabelOpacity}:${duplicateOpacity}:${duplicatePointerEvents}`;
    if (!force && markerPresentationKeyRef.current === key) return;
    markerPresentationKeyRef.current = key;
    for (const root of studentMarkerRootsRef.current) {
      root.style.setProperty("--student-map-inverse-zoom", String(inverseZoom));
      root.style.setProperty("--student-map-transition-marker-scale", String(lod));
      root.style.setProperty("--student-map-transition-pulse-opacity", pulse);
      root.style.setProperty("--student-map-transition-active-pulse-opacity", activePulse);
      root.style.setProperty("--student-map-transition-callout-opacity", callout);
      root.style.setProperty("--student-map-passive-label-opacity", passiveLabelOpacity);
      root.style.setProperty("--student-map-overview-duplicate-opacity", String(duplicateOpacity));
      root.style.setProperty("--student-map-overview-duplicate-pointer-events", duplicatePointerEvents);
    }
  }, []);
  const setCameraGroupRef = useCallback((group: SVGGElement | null) => {
    cameraGroupRef.current = group;
  }, []);
  const dragRef         = useRef<{ sx:number; sy:number; lx:number; ly:number; px:number; py:number; moved:boolean; vx:number; vy:number; lastTime:number }|null>(null);
  const inertiaRef      = useRef<number>(0);
  const panFrameRef     = useRef<number | null>(null);
  const pendingPanRef   = useRef<{ x: number; y: number; drag: NonNullable<typeof dragRef.current> } | null>(null);
  const zoomFrameRef    = useRef<number | null>(null);
  const pendingZoomRef  = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const cameraScreenScaleRef = useRef(1);
  // Marker compensation follows the actual preserveAspectRatio meet scale.
  // Camera coordinate conversion keeps its existing width-based semantics.
  const markerWorldUnitsPerCssPixelRef = useRef(1);
  const cameraViewportRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const cameraAnimationFrameRef = useRef<number | null>(null);
  const cameraAnimationCompletionRef = useRef<(() => void) | null>(null);
  const cameraGenerationRef = useRef(0);
  const cameraAnimationModeRef = useRef<"programmatic" | "manual-wheel">("programmatic");
  const targetLogZoomRef = useRef(0);
  const manualWheelAnchorRef = useRef<{ viewPoint: Pt; worldPoint: Pt } | null>(null);
  const timedCameraMotionRef = useRef<{ fromPan: Pt; fromZoom: number; startedAt: number; durationMs: number } | null>(null);
  const roomFocusAnimationRef = useRef(false);
  const lastRoomFocusKeyRef = useRef<string | null>(null);
  const pendingBuildingClickFocusRef = useRef<string | null>(null);
  const lastDestinationBuildingFocusKeyRef = useRef<string | null>(null);
  const targetCameraRef = useRef<{ pan: Pt; zoom: number }>({ pan: { x: 0, y: 0 }, zoom: 1 });
  const followZoomTargetRef = useRef(DEFAULT_OUTDOOR_ZOOM);
  const followZoomStateTimerRef = useRef<number | null>(null);
  const followCameraWasActiveRef = useRef(false);
  const followHumanWorldPointRef = useRef<Pt | null>(null);
  const overviewCameraRef = useRef<{ pan: Pt; zoom: number }>({ pan: { x: 0, y: 0 }, zoom: 1 });
  const fittedCampusIdRef = useRef<string | null>(null);
  const fittedFloorIdRef = useRef<string | null>(null);
  const writeCameraTransformRef = useRef<(nextPan?: Pt, nextZoom?: number) => void>(() => {});
  const animateCameraToRef = useRef<(nextPan: Pt, nextZoom: number, source?: "room-focus" | "manual-wheel" | "route-inspection" | "route-preview" | "arrival") => void>(() => {});
  const animateZoomAtRef = useRef<(clientX: number, clientY: number, nextZoom: number, source?: "manual-wheel") => void>(() => {});
  const searchFocusRef = useRef<{ buildingId?: string; roomId?: string; floorNumber?: number; campusPlaceId?: string } | null>(null);
  const [searchFocusNonce, setSearchFocusNonce] = useState(0);
  const [studentMapFitScale, setStudentMapFitScale] = useState(1);
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
    const followCameraOwns = studentRouteUi.phase === "navigating"
      && studentRouteUi.camera === "follow" && !followCameraDetached;
    if (anchor) {
      if (followCameraOwns) applyZoomAtRef.current(anchor.clientX, anchor.clientY, nextZoom, true);
      else animateZoomAtRef.current(anchor.clientX, anchor.clientY, nextZoom);
    } else if (el) {
      const r = el.getBoundingClientRect();
      if (followCameraOwns) applyZoomAtRef.current(r.left + r.width / 2, r.top + r.height / 2, nextZoom, true);
      else animateZoomAtRef.current(r.left + r.width / 2, r.top + r.height / 2, nextZoom);
    } else {
      setZoom(clampActiveStudentZoom(nextZoom));
    }
  }, [clampActiveStudentZoom, followCameraDetached, studentRouteUi.camera, studentRouteUi.phase]);

  const resetMapCamera = useCallback(() => {
    if (campusViewMode === "3d") {
      const contextKey = isFloorMode && floorView ? `${floorView.building.id}:${floorView.floor}` : "campus";
      requestCampus3DRecenter(contextKey);
      setFollowCameraDetached(false);
      return;
    }
    detachFollowCamera();
    const overview = overviewCameraRef.current;
    animateCameraToRef.current(overview.pan, overview.zoom);
  }, [animateCameraToRef, campusViewMode, detachFollowCamera, floorView, isFloorMode, requestCampus3DRecenter]);

  // React values mirror controls/layout. Follow's live transform refs remain
  // authoritative while its RAF owns the camera, preventing a render snapshot
  // from replacing the in-flight pan/zoom.
  useEffect(() => { zoomStateRef.current = zoom; }, [zoom]);
  useEffect(() => {
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && !followCameraDetached) return;
    zoomRef.current = zoom;
  }, [followCameraDetached, studentRouteUi.camera, studentRouteUi.phase, zoom]);
  useEffect(() => {
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && !followCameraDetached) return;
    panRef.current = pan;
  }, [followCameraDetached, pan, studentRouteUi.camera, studentRouteUi.phase]);

  const floorViewRef    = useRef(floorView);
  useEffect(() => { floorViewRef.current = floorView; }, [floorView]);

  const reducedMotion = useReducedMotion();

  useEffect(() => () => {
    [panFrameRef.current, zoomFrameRef.current, inertiaRef.current, cameraAnimationFrameRef.current]
      .forEach((frame) => { if (frame !== null && frame !== 0) cancelAnimationFrame(frame); });
    if (followZoomStateTimerRef.current !== null) window.clearTimeout(followZoomStateTimerRef.current);
  }, []);

  // Renderer handoff stops only 2D camera/gesture work. The route progress
  // clocks remain above both renderers and continue to feed the active view.
  useEffect(() => {
    if (!student3DActive) return;
    cameraGenerationRef.current += 1;
    [panFrameRef.current, zoomFrameRef.current, inertiaRef.current, cameraAnimationFrameRef.current]
      .forEach((frame) => { if (frame !== null && frame !== 0) cancelAnimationFrame(frame); });
    panFrameRef.current = null;
    zoomFrameRef.current = null;
    inertiaRef.current = 0;
    cameraAnimationFrameRef.current = null;
    pendingPanRef.current = null;
    pendingZoomRef.current = null;
    dragRef.current = null;
    timedCameraMotionRef.current = null;
    manualWheelAnchorRef.current = null;
    roomFocusAnimationRef.current = false;
  }, [student3DActive]);

  // Sync search input with campusSearch query
  useEffect(() => {
    if (campusSearchQuery !== search) setCampusSearchQuery(search);
  }, [campusSearchQuery, search, setCampusSearchQuery]);

  // Anonymous page-view tracking for usage analytics
  useEffect(() => {
    usageAnalyticsService.track("page_view", "map");
  }, []);

  // ── Computed floor plan values ─────────────────────────────────────────
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
      if (target.closest("[data-map-search-shell='true']")) return;
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
      if (!(target instanceof Element) || target.closest("[data-map-search-shell='true']")) return;
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
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const headerBottom = searchHeaderRect
        ? Math.max(0, searchHeaderRect.bottom - surfaceRect.top)
        : Math.max(52, viewportTop + 52 - surfaceRect.top);
      const safeTop = headerBottom + 16;
      const searchSafeTop = `${Math.round(Math.max(0, searchHeaderRect?.bottom ?? surfaceRect.top + headerBottom))}px`;
      const controlsSafeTop = `${Math.round(Math.max(0, surfaceRect.top + safeTop))}px`;
      const panelTop = Math.max(0, Math.max(viewportTop + 48, (searchHeaderRect?.bottom ?? surfaceRect.top + headerBottom) + 12) - viewportTop);
      const safeAreaBottom = Number.parseFloat(window.getComputedStyle(surface).getPropertyValue("--student-map-safe-area-bottom")) || 0;
      const panelMaxHeight = `${Math.round(studentMobilePanelAvailableHeight(viewportHeight, panelTop, safeAreaBottom))}px`;
      const setStyleIfChanged = (name: string, value: string) => {
        if (surface.style.getPropertyValue(name) !== value) surface.style.setProperty(name, value);
      };
      setStyleIfChanged("--student-map-search-safe-top", searchSafeTop);
      setStyleIfChanged("--student-map-controls-safe-top", controlsSafeTop);
      setStyleIfChanged("--student-map-mobile-panel-max-height", panelMaxHeight);
      if (surfaceRect.width < 768) {
        // Keep the mobile campus pill directly under the measured search/header
        // bounds; the fallback above adapts when that header is collapsed.
        const nextCampusTop = Math.max(0, Math.round(headerBottom + 14));
        setCampusSelectorTop((current) => current === nextCampusTop ? current : nextCampusTop);
        const floorPickerRect = surface.querySelector<HTMLElement>("[data-testid='student-floor-picker']")?.getBoundingClientRect();
        const nextCampusMaxWidth = computeStudentCampusSelectorMaxWidth(
          surfaceRect.width,
          floorPickerRect?.left,
          surfaceRect.left,
        );
        setCampusSelectorMaxWidth((current) => current === nextCampusMaxWidth ? current : nextCampusMaxWidth);
        const accountRect = surface.querySelector<HTMLElement>("[data-map-layer='account-trigger']")?.getBoundingClientRect();
        if (accountRect) {
          const pickerTop = Math.max(accountRect.bottom, searchHeaderRect?.bottom ?? accountRect.bottom)
            - accountRect.top + 14;
          setStyleIfChanged("--student-map-floor-picker-top", `${Math.max(0, Math.round(pickerTop))}px`);
        }
      }

      // The whole renderer/action rail shares one lower-right anchor. On
      // narrow screens, lift it only when a real bottom sheet needs space.
      const utilityAnchorBottom = surfaceRect.width >= 768 ? 24 : Math.max(12, safeAreaBottom + 12);
      setStyleIfChanged("--student-map-utility-anchor-bottom", `${Math.round(utilityAnchorBottom)}px`);
      let utilityBottomInset = utilityAnchorBottom;
      let utilityAnchorRight = 12;
      if (surfaceRect.width < 768) {
        const bottomSheetSelectors = [
          "[data-testid='student-room-and-video-stack']",
          "[data-testid='student-selected-place-card']",
          "[data-testid='mobile-building-sheet']",
          "[data-testid='route-planner-dialog']",
          "[data-testid='collapsed-route-card']",
          "[data-testid='mobile-active-route-dock']",
          "[data-testid='event-map-panel']",
        ];
        const sheetTop = bottomSheetSelectors
          .flatMap((selector) => Array.from(surface.querySelectorAll<HTMLElement>(selector)))
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ element, rect }) => {
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden"
              && rect.width >= surfaceRect.width * 0.58
              && rect.height > 0 && rect.top < surfaceRect.bottom
              && rect.bottom > surfaceRect.top;
          })
          .reduce((top, { rect }) => Math.min(top, rect.top), surfaceRect.bottom);
        const utilityRail = surface.querySelector<HTMLElement>(".student-map-utility-stack");
        const visibleUtilityButtons = Array.from(utilityRail?.querySelectorAll("button") ?? [])
          .map((button) => ({ button, rect: button.getBoundingClientRect() }))
          .filter(({ button, rect }) => {
            const style = getComputedStyle(button);
            return style.display !== "none" && style.visibility !== "hidden"
              && rect.width > 0 && rect.height > 0;
          });
        const utilityGap = utilityRail ? Number.parseFloat(getComputedStyle(utilityRail).rowGap) || 0 : 0;
        const verticalUtilityHeight = visibleUtilityButtons.reduce((height, { rect }) => height + rect.height, 0)
          + Math.max(0, visibleUtilityButtons.length - 1) * utilityGap;
        const verticalRoom = sheetTop - (surfaceRect.top + safeTop) - 12;
        const compactUtility = sheetTop < surfaceRect.bottom && verticalUtilityHeight > verticalRoom;
        if (surface.dataset.utilityCompact !== String(compactUtility)) {
          surface.dataset.utilityCompact = String(compactUtility);
        }
        if (sheetTop < surfaceRect.bottom) {
          utilityBottomInset = Math.max(utilityBottomInset, Math.round(surfaceRect.bottom - sheetTop + 12));
        }
        // A very tall route sheet can push the floating map-view toggle into
        // the top safe area. Keep it clear of the mobile account/notification
        // trigger when the remaining map strip is too short for the normal
        // lower-right anchor.
        if (compactUtility && utilityRail) {
          const utilityRect = utilityRail.getBoundingClientRect();
          const accountRect = surface.querySelector<HTMLElement>("[data-map-layer='account-trigger']")?.getBoundingClientRect();
          utilityAnchorRight = studentMapUtilityRightInset({
            surfaceRight: surfaceRect.right,
            surfaceBottom: surfaceRect.bottom,
            utilityBottomInset,
            utilityWidth: utilityRect.width,
            utilityHeight: utilityRect.height,
            defaultRightInset: 12,
            accountRect: accountRect ? {
              left: accountRect.left,
              right: accountRect.right,
              top: accountRect.top,
              bottom: accountRect.bottom,
            } : null,
          });
        }
      } else if (surface.dataset.utilityCompact !== "false") {
        surface.dataset.utilityCompact = "false";
      }
      if (surfaceRect.width >= 768) {
        setCampusSelectorTop((current) => current === null ? current : null);
        setCampusSelectorMaxWidth((current) => current === null ? current : null);
      }
      setStyleIfChanged("--student-map-utility-anchor-right", `${Math.round(utilityAnchorRight)}px`);
      setStyleIfChanged("--student-map-utility-bottom-inset", `${Math.round(utilityBottomInset)}px`);

    };

    let layoutFrame = 0;
    const scheduleOverlayLayout = () => {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0;
        updateOverlayLayout();
      });
    };
    // The initial layout values need to be ready before the first paint. Later
    // ResizeObserver notifications (including card/sheet transitions) are
    // coalesced into one read/write pass per frame.
    updateOverlayLayout();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleOverlayLayout);
    observer?.observe(surface);
    const searchHeader = surface.querySelector<HTMLElement>("[data-map-search-header='true']");
    if (searchHeader) observer?.observe(searchHeader);
    const accountControls = surface.querySelector<HTMLElement>("[data-map-layer='account-trigger']");
    if (accountControls) observer?.observe(accountControls);
    const overlaySelectors = [
      "[data-testid='student-room-and-video-stack']",
      "[data-testid='student-selected-place-card']",
      "[data-testid='student-floor-picker']",
      "[data-testid='event-map-panel']",
      "[data-testid='route-planner-dialog']",
      "[data-testid='mobile-building-sheet']",
      "[data-testid='collapsed-route-card']",
      "[data-testid='mobile-active-route-dock']",
    ];
    overlaySelectors.forEach((selector) => {
      surface.querySelectorAll<HTMLElement>(selector).forEach((element) => observer?.observe(element));
    });
    window.addEventListener("resize", scheduleOverlayLayout);
    window.visualViewport?.addEventListener("resize", scheduleOverlayLayout);
    window.visualViewport?.addEventListener("scroll", scheduleOverlayLayout);
    return () => {
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleOverlayLayout);
      window.visualViewport?.removeEventListener("resize", scheduleOverlayLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleOverlayLayout);
    };
  }, [directionsMode, floorPickerFallbackActive, isCampusLoading, isFloorMode, navigationPhase, navigationTransitioning, searchFocused, selected?.id, selectedCampusPlaceId, selectedRoomContext?.roomId, showEventMaps, studentRouteUi.phase]);
  const mapSurface: MapSurface = directionsMode
    ? "route-planner"
    : (studentRouteUi.phase !== "idle" || navigationPhase !== "idle" || navigationTransitioning)
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
      if (discoverTour.active) {
        discoverExitHandlerRef.current?.();
        if (window.location.pathname !== "/map") navigate("/map", { replace: true });
        return;
      }
      if (discoverTour.navigationGuard) {
        setDiscoverTour((current) => ({ ...current, navigationGuard: false }));
        if (window.location.pathname !== "/map") navigate("/map", { replace: true });
        return;
      }
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
        const routeContextAction = prepareRouteForContextInspectionRef.current();
        if (routeContextAction === "blocked") return;
        setFloorView(null);
        setHighlightedRoom(null);
        if (routeContextAction !== "inspection") setIndoorRoute(null);
        return;
      }
      setSelected(null);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [directionsMode, discoverTour.active, discoverTour.navigationGuard, isFloorMode, mapSurface, navigate, searchFocused, studentAuth.isStudent]);
  // Use the actual FloorPlan from the published campus (authored in Map Builder)
  const activeFloorPlan   = useMemo(() => {
    if (!floorView || !activeCampus) return null;
    const building = activeCampus.buildings.find(b => b.id === floorView.building.id);
    if (!building) return null;
    return building.floors.find(f => f.number === floorView.floor) ?? building.floors[0] ?? null;
  }, [floorView, activeCampus]);
  const emergencyVideoRoomContext = mapMode === "emergency" ? roomOrigin ?? selectedRoomContext : selectedRoomContext;
  const emergencyVideoRoomSource = useMemo(() => {
    if (!activeCampus || emergencyVideoRoomContext?.type !== "room") return null;
    const building = activeCampus.buildings.find((candidate) => candidate.id === emergencyVideoRoomContext.buildingId);
    const floor = building?.floors.find((candidate) => candidate.number === emergencyVideoRoomContext.floorNumber);
    const room = floor?.rooms.find((candidate) => candidate.id === emergencyVideoRoomContext.roomId);
    return building && floor && room ? { building, floor, room } : null;
  }, [activeCampus, emergencyVideoRoomContext]);
  const selectedEmergencyVideo = useMemo(() => {
    const guide = emergencyVideoRoomSource?.room.emergencyEvacuation?.videoGuide;
    if (!activeCampus || !emergencyVideoRoomSource || !guide?.enabled || !guide.videoId
      || guide.reviewStatus !== "approved" || !guide.reviewedRouteFingerprint) return null;
    const routeFingerprint = currentStudentEmergencyRouteFingerprint(
      activeCampus,
      emergencyVideoRoomSource.building.id,
      emergencyVideoRoomSource.floor.id,
      emergencyVideoRoomSource.room.id,
    );
    if (!routeFingerprint || routeFingerprint !== guide.reviewedRouteFingerprint) return null;
    return { guide, routeFingerprint, room: emergencyVideoRoomSource.room, building: emergencyVideoRoomSource.building, floor: emergencyVideoRoomSource.floor };
  }, [activeCampus, emergencyVideoRoomSource]);
  const emergencyVideoSessionKey = selectedEmergencyVideo && activeCampus
    ? `${activeCampus.id}:${selectedEmergencyVideo.room.id}:${selectedEmergencyVideo.guide.videoId}:${selectedEmergencyVideo.routeFingerprint}`
    : null;
  if (emergencyVideoSessionKey && emergencyVideoPlaybackRef.current.key !== emergencyVideoSessionKey) {
    emergencyVideoPlaybackRef.current = { key: emergencyVideoSessionKey, state: { currentTime: 0, muted: true, loop: true } };
  }
  if (emergencyVideoSessionKey && emergencyVideoAutoplaySuppressedRef.current.key !== emergencyVideoSessionKey) {
    emergencyVideoAutoplaySuppressedRef.current = { key: emergencyVideoSessionKey, suppressed: false };
  }
  const emergencyVideoPlaybackState = emergencyVideoSessionKey && emergencyVideoPlaybackRef.current.key === emergencyVideoSessionKey
    ? emergencyVideoPlaybackRef.current.state : { currentTime: 0, muted: true, loop: true };
  const emergencyVideoAutoplayEnabled = Boolean(emergencyVideoSessionKey && !emergencyVideoAutoplaySuppressedRef.current.suppressed);
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
  // Student Preview renders the published floor object. Use that same source
  // for labels and floor-derived UI so switching floors cannot leave the
  // selector describing a stale mock/legacy floor.
  const currentFloor      = activeFloorPlan ?? currentFloorData?.floors.find(f => f.number === floorView?.floor) ?? currentFloorData?.floors[0];
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
  const [inspectedEventVenueId, setInspectedEventVenueId] = useState<string | null>(null);
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
  const visibleEvents = useMemo(() => visibleEventCards(eventFeed.events, eventFeed.nowMs, "all"), [eventFeed.events, eventFeed.nowMs]);
  const venueEvents = useMemo(() => eventVenueCandidates(eventFeed.events, eventFeed.nowMs, eventFilter, selectedEventId), [eventFeed.events, eventFeed.nowMs, eventFilter, selectedEventId]);
  const inspectedEventVenue = useMemo(() => activeCampus && inspectedEventVenueId ? buildEventVenues(activeCampus, venueEvents).find(venue => venue.id === inspectedEventVenueId) ?? null : null, [activeCampus, venueEvents, inspectedEventVenueId]);
  useEffect(() => { if (!showEventMaps || isFloorMode) setInspectedEventVenueId(null); }, [showEventMaps, isFloorMode]);
  useEffect(() => { setInspectedEventVenueId(null); }, [activeCampus?.id]);
  const currentEventLocationId = eventLocationOnMap(visibleEvents.find(event => event.id === selectedEventId), isFloorMode ? floorLookupId ?? null : null, selectedLocationId)?.id ?? null;
  const selectedEventLocationData = selectedEventLocation(visibleEvents, selectedEventId, currentEventLocationId);
  const selectedEventOverlay = selectedEventLocationData
    ? toEventOverlayPreview(selectedEventLocationData.event, selectedEventLocationData.location)
    : null;

  useEffect(() => {
    if (selectedEventId && !visibleEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
      setSelectedLocationId(null);
    } else if (selectedEventId && selectedLocationId && !selectedEventLocation(visibleEvents, selectedEventId, selectedLocationId)) {
      setSelectedEventId(null);
      setSelectedLocationId(null);
    }
  }, [visibleEvents, selectedEventId, selectedLocationId]);

  const viewEventLocation = useCallback((eventId: string, locationId: string) => {
    if (!activeCampus) return;
    const event = visibleEvents.find((item) => item.id === eventId);
    const location = event?.locations.find((item) => item.id === locationId);
    if (!event || !location) return;
    if (prepareRouteForContextInspectionRef.current() === "blocked") return;
    setInspectedEventVenueId(null);
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
  }, [activeCampus, visibleEvents, MOCK_BUILDINGS]);

  const selectedLocationIsVisible = Boolean(selectedEventLocationData && (
    (!isFloorMode && selectedEventLocationData.location.locationRef.type === "campus") ||
    (isFloorMode && selectedEventLocationData.location.locationRef.floorId === floorLookupId)
  ));
  const indoor3DEventMarker = useMemo(() => {
    const roomId = selectedEventLocationData?.location.locationRef.roomId;
    if (!showEventMaps || !selectedLocationIsVisible || !activeFloorPlan || !roomId) return null;
    const room = activeFloorPlan.rooms.find((candidate) => candidate.id === roomId);
    if (!room) return null;
    const points = roomOutlinePoints(room);
    const point = points.reduce((sum, item) => ({ x: sum.x + item.x / points.length, y: sum.y + item.y / points.length }), { x: 0, y: 0 });
    return { point, label: selectedEventLocationData.event.title };
  }, [activeFloorPlan, selectedEventLocationData, selectedLocationIsVisible, showEventMaps]);

  // SVG center shifts with mode (floor plan uses authored canvas, campus uses campus canvas)
  const outdoorCanvasW = activeCampus?.canvasW || SVG_W;
  const outdoorCanvasH = activeCampus?.canvasH || SVG_H;
  const viewCX = isFloorMode ? floorViewport.width / 2 : outdoorCanvasW / 2;
  const viewCY = isFloorMode ? floorViewport.height / 2 : outdoorCanvasH / 2;
  const followCameraFocusRef = useRef({ x: viewCX, y: viewCY });

  const writeCameraTransform = useCallback((nextPan = panRef.current, nextZoom = displayZoomRef.current) => {
    if (cameraContextKeyRef.current) cameraStatesByContextRef.current.set(cameraContextKeyRef.current, { pan: { ...nextPan }, zoom: nextZoom });
    const group = cameraGroupRef.current;
    if (group) {
      const x = viewCX * (1 - nextZoom) + nextPan.x;
      const y = viewCY * (1 - nextZoom) + nextPan.y;
      // Use a transient CSS transform during active camera movement so pointer,
      // wheel, and pinch updates remain independent of React rendering.
      // The settled camera is baked back into the SVG transform attribute below
      // so Chromium does not keep a low-resolution composited texture for text.
      group.removeAttribute("transform");
      group.style.transform = `translate(${x}px, ${y}px) scale(${nextZoom})`;
      applyStudentMarkerPresentation(nextZoom);
    }
  }, [applyStudentMarkerPresentation, viewCX, viewCY]);

  const settleCameraTransform = useCallback((nextPan = panRef.current, nextZoom = displayZoomRef.current) => {
    if (cameraContextKeyRef.current) cameraStatesByContextRef.current.set(cameraContextKeyRef.current, { pan: { ...nextPan }, zoom: nextZoom });
    const group = cameraGroupRef.current;
    if (group) {
      const x = viewCX * (1 - nextZoom) + nextPan.x;
      const y = viewCY * (1 - nextZoom) + nextPan.y;
      group.style.removeProperty("transform");
      group.setAttribute("transform", `translate(${x} ${y}) scale(${nextZoom})`);
      applyStudentMarkerPresentation(nextZoom);
    }
  }, [applyStudentMarkerPresentation, viewCX, viewCY]);

  // Follow owns a renderer-ref zoom while playback runs. Mirror it into React
  // once when that ownership ends, rather than on each high-frequency wheel
  // event; this keeps the next paused/Explore camera commit in sync.
  useEffect(() => {
    const ownsFollowCamera = studentRouteUi.phase === "navigating"
      && studentRouteUi.camera === "follow" && !followCameraDetached;
    if (followCameraWasActiveRef.current && !ownsFollowCamera) {
      if (followZoomStateTimerRef.current !== null) {
        window.clearTimeout(followZoomStateTimerRef.current);
        followZoomStateTimerRef.current = null;
      }
      // Follow playback can leave a desired zoom target that has not yet
      // reached the rendered frame. When ownership ends, keep the exact
      // on-screen camera pose instead of snapping forward to that target.
      const settledZoom = displayZoomRef.current;
      followZoomTargetRef.current = settledZoom;
      zoomRef.current = settledZoom;
      zoomStateRef.current = settledZoom;
      displayZoomRef.current = settledZoom;
      setZoom(settledZoom);
      setDisplayZoom(settledZoom);
      settleCameraTransform(panRef.current, settledZoom);
    }
    followCameraWasActiveRef.current = ownsFollowCamera;
  }, [followCameraDetached, settleCameraTransform, studentRouteUi.camera, studentRouteUi.phase]);

  const commitCameraState = useCallback(() => {
    const currentPan = panRef.current;
    const currentZoom = displayZoomRef.current;
    settleCameraTransform(currentPan, currentZoom);
    targetCameraRef.current = { pan: { ...currentPan }, zoom: currentZoom };
    targetLogZoomRef.current = Math.log(currentZoom);
    manualWheelAnchorRef.current = null;
    zoomStateRef.current = currentZoom;
    zoomRef.current = currentZoom;
    setPan(currentPan);
    setDisplayZoom(currentZoom);
    setZoom(currentZoom);
  }, [settleCameraTransform]);

  const cancelCameraAnimation = useCallback((commitCurrent = true) => {
    cameraGenerationRef.current += 1;
    const frame = cameraAnimationFrameRef.current;
    const wasAnimating = frame !== null;
    if (frame !== null) {
      cancelAnimationFrame(frame);
      cameraAnimationFrameRef.current = null;
    }
    timedCameraMotionRef.current = null;
    cameraAnimationCompletionRef.current = null;
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
  const studentRouteTransitionViewport = useMemo(
    () => studentRouteTransitionViewportFromCamera({
      width: viewportCanvasW,
      height: viewportCanvasH,
      zoom: displayZoom,
      center: { x: viewCX, y: viewCY },
      pan,
      contentOffset: isFloorMode ? { x: floorViewport.offsetX, y: floorViewport.offsetY } : undefined,
      screenSpaceScale: 1 / Math.max(0.001, studentMapFitScale),
    }),
    [displayZoom, floorViewport.offsetX, floorViewport.offsetY, isFloorMode, pan.x, pan.y, studentMapFitScale, viewCX, viewCY, viewportCanvasH, viewportCanvasW],
  );
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

  // Convert screen coordinates into the SVG's authored viewBox. On tall
  // phones preserveAspectRatio="meet" leaves vertical letterboxing; treating
  // the screen origin as viewBox y=0 sends focused route points under sheets.
  const focusViewPointFromScreen = useCallback((screenPoint: Pt, fallback: Pt): Pt => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    const unitsPerPixel = cameraScreenScaleRef.current || 1;
    if (!svgRect || svgRect.width <= 0 || svgRect.height <= 0) return fallback;
    const contentWidth = viewportCanvasW / unitsPerPixel;
    const contentHeight = viewportCanvasH / unitsPerPixel;
    const contentLeft = svgRect.left + (svgRect.width - contentWidth) / 2;
    const contentTop = svgRect.top + (svgRect.height - contentHeight) / 2;
    return {
      x: (screenPoint.x - contentLeft) * unitsPerPixel,
      y: (screenPoint.y - contentTop) * unitsPerPixel,
    };
  }, [viewportCanvasH, viewportCanvasW]);

  writeCameraTransformRef.current = writeCameraTransform;

  const commitCameraFrame = useCallback((nextPan: Pt, nextZoom: number) => {
    if (student3DActive) return false;
    const currentPan = panRef.current;
    const currentZoom = displayZoomRef.current;
    if (Math.abs(nextPan.x - currentPan.x) < 0.25
      && Math.abs(nextPan.y - currentPan.y) < 0.25
      && Math.abs(nextZoom - currentZoom) < 0.0005) return false;
    panRef.current = nextPan;
    displayZoomRef.current = nextZoom;
    zoomRef.current = nextZoom;
    targetCameraRef.current = { pan: { ...nextPan }, zoom: nextZoom };
    writeCameraTransformRef.current(nextPan, nextZoom);
    return true;
  }, [student3DActive]);
  const commitCameraFrameRef = useRef(commitCameraFrame);
  commitCameraFrameRef.current = commitCameraFrame;

  /** One retargetable, time-based RAF loop for every animated camera move. */
  const animateCameraTo = useCallback((targetPan: Pt, targetZoom = zoomStateRef.current, source?: "room-focus" | "manual-wheel" | "route-inspection" | "route-preview" | "arrival", onComplete?: () => void) => {
    if (student3DActive) return;
    if (cameraAnimationFrameRef.current !== null) cancelAnimationFrame(cameraAnimationFrameRef.current);
    cameraAnimationFrameRef.current = null;
    const generation = ++cameraGenerationRef.current;
    cameraAnimationCompletionRef.current = onComplete ?? null;
    const toZoom = clampActiveStudentZoom(targetZoom);
    followZoomTargetRef.current = toZoom;
    // An authored arrival waypoint owns the final frame. Campus-edge Assembly
    // Points can sit beyond the ordinary browsing pan bounds; clamping those
    // bounds would leave the destination under the map edge or route sheet.
    // Keep normal browsing/inspection camera movement constrained.
    const toPan = source === "arrival" || source === "route-preview" ? targetPan : clampMapPan(targetPan, toZoom);
    cameraAnimationModeRef.current = source === "manual-wheel" ? "manual-wheel" : "programmatic";
    roomFocusAnimationRef.current = source === "room-focus";
    timedCameraMotionRef.current = source === "room-focus" || source === "route-inspection" || source === "route-preview" || source === "arrival"
      ? { fromPan: { ...panRef.current }, fromZoom: displayZoomRef.current, startedAt: performance.now(), durationMs: source === "route-inspection" ? 380 : source === "route-preview" ? 480 : source === "arrival" ? 400 : 820 }
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
      const completed = cameraAnimationCompletionRef.current;
      cameraAnimationCompletionRef.current = null;
      completed?.();
    };

    if (reducedMotion && source !== "manual-wheel") {
      if (cameraAnimationFrameRef.current !== null) cancelAnimationFrame(cameraAnimationFrameRef.current);
      finishAtTarget();
      return;
    }
    let previousTime = performance.now();
    const tick = (now: number) => {
      if (generation !== cameraGenerationRef.current) return;
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
          const completed = cameraAnimationCompletionRef.current;
          cameraAnimationCompletionRef.current = null;
          completed?.();
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
        const completed = cameraAnimationCompletionRef.current;
        cameraAnimationCompletionRef.current = null;
        completed?.();
        return;
      }

      panRef.current = nextPan;
      displayZoomRef.current = nextZoom;
      zoomRef.current = nextZoom;
      writeCameraTransformRef.current(nextPan, nextZoom);
      cameraAnimationFrameRef.current = requestAnimationFrame(tick);
    };
    cameraAnimationFrameRef.current = requestAnimationFrame(tick);
  }, [clampActiveStudentZoom, clampMapPan, commitCameraState, reducedMotion, student3DActive, viewCX, viewCY]);

  useEffect(() => { animateCameraToRef.current = animateCameraTo; }, [animateCameraTo]);
  const applyOverviewCamera = useCallback((camera: { pan: Pt; zoom: number }) => {
    if (student3DActive) return;
    cancelCameraAnimation(false);
    const nextZoom = clampActiveStudentZoom(camera.zoom);
    const nextPan = clampMapPan(camera.pan, nextZoom);
    overviewCameraRef.current = { pan: nextPan, zoom: nextZoom };
    timedCameraMotionRef.current = null;
    panRef.current = nextPan;
    displayZoomRef.current = nextZoom;
    zoomRef.current = nextZoom;
    zoomStateRef.current = nextZoom;
    followZoomTargetRef.current = nextZoom;
    targetCameraRef.current = { pan: { ...nextPan }, zoom: nextZoom };
    targetLogZoomRef.current = Math.log(nextZoom);
    manualWheelAnchorRef.current = null;
    roomFocusAnimationRef.current = false;
    setPan(nextPan);
    setDisplayZoom(nextZoom);
    setZoom(nextZoom);
    settleCameraTransform(nextPan, nextZoom);
  }, [cancelCameraAnimation, clampActiveStudentZoom, clampMapPan, settleCameraTransform, student3DActive]);

  const fitEventMap = useCallback(() => {
    const surface = mapContainerRef.current;
    const viewport = surface?.getBoundingClientRect();
    const panel = surface?.querySelector<HTMLElement>('[data-testid="event-map-panel"]');
    const panelRect = panel?.getBoundingClientRect();
    const headerRect = panel?.querySelector<HTMLElement>('[data-event-context-header]')?.getBoundingClientRect();
    const errorHeight = panel?.querySelector<HTMLElement>('[data-event-refresh-error]')?.getBoundingClientRect().height ?? 0;
    if (!viewport || !panelRect || !headerRect || viewport.width <= 0 || viewport.height <= 0) return;
    const sidePanel = window.innerWidth >= 1024 || (window.innerWidth >= 640 && window.innerHeight <= 500);
    const topControls = [...(surface?.querySelectorAll<HTMLElement>('[data-testid="student-floor-picker"] > button, [data-testid="student-event-back-campus"]') ?? [])];
    const controlsBottom = Math.max(viewport.top + 64, ...topControls.map(control => control.getBoundingClientRect()).filter(rect=>rect.top<viewport.top+viewport.height*.4).map(rect=>rect.bottom));
    const insets = sidePanel
      ? {left:panelRect.right - viewport.left + 16,right:16,top:Math.max(16,controlsBottom-viewport.top+12),bottom:isFloorMode?80:16}
      : {left:12,right:60,top:controlsBottom-viewport.top+12,bottom:headerRect.height+errorHeight+viewport.bottom-panelRect.bottom+(isFloorMode?16:64)};
    const buildings = Object.values(B_POS);
    const floorScene = surface?.querySelector<SVGGraphicsElement>('[data-testid="readonly-floor-plan-scene"]');
    const floorSceneBounds = floorScene && typeof floorScene.getBBox === 'function' ? floorScene.getBBox() : null;
    const completeFloorBounds = floorSceneBounds && [floorSceneBounds.x,floorSceneBounds.y,floorSceneBounds.width,floorSceneBounds.height].every(Number.isFinite) && floorSceneBounds.width > 0 && floorSceneBounds.height > 0 ? floorSceneBounds : null;
    const content = isFloorMode && activeFloorPlan
      ? completeFloorBounds ?? getFloorShapeBounds(getFloorShapeRegions(activeFloorPlan,{canvasW:activeFloorPlan.canvasW||440,canvasH:activeFloorPlan.canvasH||290}))
      : buildings.length ? {
        x:Math.min(...buildings.map(b=>b.x)),y:Math.min(...buildings.map(b=>b.y)),
        width:Math.max(...buildings.map(b=>b.x+b.w))-Math.min(...buildings.map(b=>b.x)),
        height:Math.max(...buildings.map(b=>b.y+b.h))-Math.min(...buildings.map(b=>b.y)),
      } : {x:0,y:0,width:outdoorCanvasW,height:outdoorCanvasH};
    const camera = getStudentOverviewCamera({
      mapWidth:viewportCanvasW,mapHeight:viewportCanvasH,viewportWidth:viewport.width,viewportHeight:viewport.height,
      content,contentOffset:isFloorMode?{x:floorViewport.offsetX,y:floorViewport.offsetY}:undefined,insets,fillRatio:0.94,
    });
    cancelCameraAnimation(false);
    applyOverviewCamera(camera);
  }, [B_POS,activeFloorPlan,applyOverviewCamera,cancelCameraAnimation,floorViewport,isFloorMode,outdoorCanvasH,outdoorCanvasW,viewportCanvasH,viewportCanvasW]);

  const fitEventMapRef = useRef(fitEventMap);
  fitEventMapRef.current = fitEventMap;
  const eventFitFrameRef = useRef<number | null>(null);
  const requestEventMapFit = useCallback(() => {
    if (student3DActive) return;
    if (eventFitFrameRef.current !== null) cancelAnimationFrame(eventFitFrameRef.current);
    eventFitFrameRef.current = requestAnimationFrame(() => {
      eventFitFrameRef.current = null;
      fitEventMapRef.current();
    });
  }, [student3DActive]);
  useEffect(() => {
    if (showEventMaps) requestEventMapFit();
    return () => {
      if (eventFitFrameRef.current !== null) cancelAnimationFrame(eventFitFrameRef.current);
    };
  }, [showEventMaps, selectedEventId, floorLookupId, activeCampus?.id, requestEventMapFit, student3DActive]);

  useLayoutEffect(() => {
    if (!activeCampus || isFloorMode || student3DActive) return;
    const contextKey = `campus:${activeCampus.id}`;
    if (lastFittedCameraContextRef.current === contextKey) return;
    if (pendingRouteRecenterRef.current?.contextKey === "campus") {
      lastFittedCameraContextRef.current = contextKey;
      fittedCampusIdRef.current = activeCampus.id;
      return;
    }
    const remembered = cameraStatesByContextRef.current.get(contextKey);
    if (remembered) {
      applyOverviewCamera(remembered);
      lastFittedCameraContextRef.current = contextKey;
      fittedCampusIdRef.current = activeCampus.id;
      return;
    }
    if (fittedCampusIdRef.current === activeCampus.id) return;
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
      // Keep the authored Campus readable on portrait screens while still
      // fitting the full Building footprint inside the usable viewport.
      fillRatio: 0.78,
    });
    applyOverviewCamera(camera);
    lastFittedCameraContextRef.current = contextKey;
    fittedCampusIdRef.current = activeCampus.id;
  }, [activeCampus?.id, applyOverviewCamera, B_POS, isFloorMode, outdoorCanvasH, outdoorCanvasW]);

  useLayoutEffect(() => {
    if (!isFloorMode || !activeFloorPlan || student3DActive) return;
    const contextKey = `floor:${floorView?.building.id ?? activeFloorPlan.id}:${floorView?.floor ?? 0}`;
    if (lastFittedCameraContextRef.current === contextKey) return;
    if (pendingRouteRecenterRef.current?.contextKey === `${floorView?.building.id ?? activeFloorPlan.id}:${floorView?.floor ?? 0}`) {
      lastFittedCameraContextRef.current = contextKey;
      fittedFloorIdRef.current = activeFloorPlan.id;
      return;
    }
    const remembered = cameraStatesByContextRef.current.get(contextKey);
    if (remembered) {
      applyOverviewCamera(remembered);
      lastFittedCameraContextRef.current = contextKey;
      fittedFloorIdRef.current = activeFloorPlan.id;
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
      fillRatio: isMobileViewport && isPortrait ? 1 : 0.9,
      maxZoom: activeMapZoomMaxRef.current,
    });
    applyOverviewCamera(camera);
    lastFittedCameraContextRef.current = contextKey;
    fittedFloorIdRef.current = activeFloorPlan.id;
  }, [activeFloorPlan, applyOverviewCamera, floorViewport, isFloorMode]);

  const viewportBackground = isFloorMode
    ? activeFloorPlan?.backgroundColor || "var(--map-floor-corridor)"
    : activeCampus
      ? campusGroundAppearance(activeCampus).color
      : "var(--map-bg)";

  // ── Smooth zoom lerp ───────────────────────────────────────────────────
  useEffect(() => {
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && !followCameraDetached) return;
    const targetPan = clampMapPan(panRef.current, zoom);
    if (Math.abs(displayZoomRef.current - zoom) < 0.005
      && Math.abs(panRef.current.x - targetPan.x) < 0.1
      && Math.abs(panRef.current.y - targetPan.y) < 0.1) return;
    animateCameraTo(targetPan, zoom);
  }, [animateCameraTo, clampMapPan, followCameraDetached, studentRouteUi.camera, studentRouteUi.phase, zoom]);

  // ── Smooth pan lerp ───────────────────────────────────────────────────
  // Reconcile the current camera whenever the authored surface, viewport, or
  // zoom changes. This also catches a resize from desktop to mobile without
  // letting the map remain stranded beyond its new edge.
  useEffect(() => {
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && !followCameraDetached) return;
    const current = panRef.current;
    const clamped = clampMapPan(current, zoom);
    if (clamped.x !== current.x || clamped.y !== current.y) {
      panRef.current = clamped;
      setPan(clamped);
    }
  }, [clampMapPan, followCameraDetached, studentRouteUi.camera, studentRouteUi.phase, zoom]);

  useEffect(() => {
    const element = mapContainerRef.current;
    if (!element || student3DActive) return;

    const reconcileViewport = () => {
      const rect = element.getBoundingClientRect();
      cameraViewportRectRef.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (svgRect && svgRect.width > 0 && svgRect.height > 0) {
        const fitScale = Math.min(svgRect.width / Math.max(1, viewportCanvasW), svgRect.height / Math.max(1, viewportCanvasH));
        if (Number.isFinite(fitScale) && fitScale > 0) {
          cameraScreenScaleRef.current = 1 / fitScale;
          markerWorldUnitsPerCssPixelRef.current = 1 / fitScale;
          applyStudentMarkerPresentation(displayZoomRef.current, true);
          setStudentMapFitScale((currentScale) => Math.abs(currentScale - fitScale) < 0.001 ? currentScale : fitScale);
        }
      }
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
  }, [clampMapPan, viewportCanvasW, viewportCanvasH, student3DActive]);

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

  const scheduleFollowZoomStateCommit = useCallback(() => {
    if (followZoomStateTimerRef.current !== null) window.clearTimeout(followZoomStateTimerRef.current);
    followZoomStateTimerRef.current = window.setTimeout(() => {
      followZoomStateTimerRef.current = null;
      setZoom(followZoomTargetRef.current);
    }, 140);
  }, []);

  // ── Wheel zoom ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || student3DActive) return;
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
      const followCameraOwns = studentRouteUi.phase === "navigating"
        && studentRouteUi.camera === "follow" && !followCameraDetached;
      const baseLogZoom = followCameraOwns
        ? Math.log(followZoomTargetRef.current)
        : continuingWheel ? targetLogZoomRef.current : Math.log(displayZoomRef.current);
      const nextZoom = clampActiveStudentZoom(Math.exp(baseLogZoom - step));
      if (Math.abs(Math.log(nextZoom) - baseLogZoom) < 1e-9) return;
      const followPlaybackOwnsFrame = followCameraOwns && studentRouteUi.playback === "playing" && !navigationTransitioning;
      if (followPlaybackOwnsFrame) {
        // Coalesce trackpad/wheel bursts to one visual write per frame. Keep
        // the camera immediate; mirror its React state once the burst settles.
        queueZoomUpdate(e.clientX, e.clientY, nextZoom);
        scheduleFollowZoomStateCommit();
      } else if (followCameraOwns) applyZoomAtRef.current(e.clientX, e.clientY, nextZoom, true);
      else animateZoomAtRef.current(e.clientX, e.clientY, nextZoom, "manual-wheel");
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [activeCampus?.id, cancelCameraAnimation, clampActiveStudentZoom, followCameraDetached, isCampusLoading, navigationTransitioning, queueZoomUpdate, scheduleFollowZoomStateCommit, student3DActive, studentRouteUi.camera, studentRouteUi.phase, studentRouteUi.playback]);

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
        if (floorViewRef.current) {
          const routeContextAction = prepareRouteForContextInspectionRef.current();
          if (routeContextAction !== "blocked") {
            setFloorView(null);
            if (routeContextAction !== "inspection") setIndoorRoute(null);
            setZoom(1);
            setPan({x:0,y:0});
          }
        }
      }
      const PAN = 30;
      if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
        detachFollowCamera();
        cancelCameraAnimation();
      }
      if (e.key === "ArrowRight") { setPan(p => clampMapPan({...p, x:p.x-PAN})); }
      if (e.key === "ArrowLeft")  { setPan(p => clampMapPan({...p, x:p.x+PAN})); }
      if (e.key === "ArrowDown")  { setPan(p => clampMapPan({...p, y:p.y-PAN})); }
      if (e.key === "ArrowUp")    { setPan(p => clampMapPan({...p, y:p.y+PAN})); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelCameraAnimation, clampMapPan, detachFollowCamera, resetMapCamera, zoomAtCursor]);

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
    const clamped = clampActiveStudentZoom(nextZoom);
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
  }, [animateCameraTo, cancelCameraAnimation, clampActiveStudentZoom, clampMapPan, svgCameraPointFromClient, viewportCanvasH, viewportCanvasW]);

  useEffect(() => { animateZoomAtRef.current = animateZoomAt; }, [animateZoomAt]);

  /** Cursor-anchored zoom with the same center-origin transform as the map. */
  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number, commitState = true) => {
    const followCameraOwns = studentRouteUi.phase === "navigating"
      && studentRouteUi.camera === "follow" && !followCameraDetached;
    if (followCameraOwns) {
      // During Follow, zoom input changes only the desired scale. The active
      // Follow frame computes its pan against the same next scale and human
      // point, so cursor anchoring cannot fight avatar tracking.
      if (cameraAnimationFrameRef.current !== null) cancelCameraAnimation(false);
      const clamped = clampActiveStudentZoom(nextZoom);
      const followFrameOwnsTransform = studentRouteUi.playback === "playing"
        && !navigationTransitioning && !roomFocusAnimationRef.current;
      const humanPoint = followHumanWorldPointRef.current;
      const nextPan = humanPoint
        ? clampMapPan(panForRouteFocusPoint(humanPoint, followCameraFocusRef.current, { x: viewCX, y: viewCY }, clamped), clamped)
        : clampMapPan(panRef.current, clamped);
      followZoomTargetRef.current = clamped;
      zoomStateRef.current = clamped;
      targetCameraRef.current = { pan: nextPan, zoom: clamped };
      targetLogZoomRef.current = Math.log(clamped);
      if (commitState) {
        setZoom(clamped);
        // Changing the React `displayZoom` prop during active Follow makes
        // React rewrite the SVG transform with its last rendered pan. That
        // stale center then fights the Follow RAF for a frame on every wheel
        // or pinch event. The Follow frame owns the live DOM transform; React
        // only mirrors camera state once playback is paused/settled.
        if (!followFrameOwnsTransform && !navigationTransitioning && !roomFocusAnimationRef.current) {
          setDisplayZoom(clamped);
        }
      }
      if (!followFrameOwnsTransform && !navigationTransitioning && !roomFocusAnimationRef.current) {
        commitCameraFrameRef.current(nextPan, clamped);
        if (commitState) commitCameraState();
      }
      return;
    }
    // User zoom takes over from scripted movement without an intermediate
    // React-state commit. The final camera is committed once the gesture ends.
    cancelCameraAnimation(false);
    const clamped = clampActiveStudentZoom(nextZoom);
    followZoomTargetRef.current = clamped;
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
  }, [cancelCameraAnimation, clampActiveStudentZoom, clampMapPan, commitCameraState, followCameraDetached, navigationTransitioning, panForRouteFocusPoint, roomFocusAnimationRef, studentRouteUi.camera, studentRouteUi.phase, studentRouteUi.playback, viewCX, viewCY, svgPointFromClient, viewportCanvasW, viewportCanvasH, writeCameraTransform]);

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
      setSelectedCampusPlaceId(null);
      setShowQR(false);
      setSearch("");
      setSearchFocused(false);
      routeModeTouchedRef.current = false;
      setMapMode(platformSettings.defaultRouteMode);
      setDirectionsMode(true);
      setRoutePlannerEndpoint(null);
      setRoutePlannerMapPick(null);
      setRoutePlannerSelectionError(null);
      setQrRouteStartNotice(`${location.label} is set as your starting point. Choose a destination to continue.`);
      setFromBuilding(building);
      setToBuilding(null);
      setFromCampusPlace(null);
      setToCampusPlace(null);
      setRoomOrigin(room ?? null);
      setRoomDestination(null);
      floorShiftDirectionRef.current = null;
      setFloorView({ building, floor: floor.number });
      setZoom(DEFAULT_OUTDOOR_ZOOM);
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
      return true;
    }

    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === location.buildingId) ?? null;
    setCurrentLocationLabel(location.label);
    setYouAreHere(building ? null : location.point);
    setIndoorQrLocation(null);
    setUseMyLocation(!building);
    setPinning(false);
    setSelected(null);
    setSelectedCampusPlaceId(null);
    setSelectedRoomContext(null);
    setShowQR(false);
    setSearch("");
    setSearchFocused(false);
    routeModeTouchedRef.current = false;
    setMapMode(platformSettings.defaultRouteMode);
    setDirectionsMode(true);
    setRoutePlannerEndpoint(null);
    setRoutePlannerMapPick(null);
    setRoutePlannerSelectionError(null);
    setQrRouteStartNotice(`${location.label} is set as your starting point. Choose a destination to continue.`);
    setFromBuilding(building);
    setToBuilding(null);
    setFromCampusPlace(null);
    setToCampusPlace(null);
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
    return true;
  }, [MOCK_BUILDINGS, platformSettings.defaultRouteMode, showError]);

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
    pendingTransitionSeekRef.current = false;
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
    followRecenterRequestRef.current += 1;
    followRecenterIntentRef.current = null;
    followCameraReacquiringRef.current = false;
    cancelPendingCampus3DCameraRecenter();
    pendingRouteRecenterRef.current = null;
    cancelCameraAnimation(false);
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    stepSeekAnimRef.current = null;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    stepSeekTransitionTimerRef.current = null;
    stepSeekTargetRef.current = null;
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    walkAnimRef.current = null;
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
    pendingTransitionSeekRef.current = false;
    setNavigationPhase("idle");
    setRouteFading(false);
    setShowArrival(false);
    dispatchStudentRouteUi({ type: "END_NAVIGATION" });
    emergencyVideoPauseLatchRef.current = false;
    setFollowCameraDetached(false);
    setInspectedRouteStepIndex(null);
    routeTransitionActivationRef.current = null;
    transitionResumePlaybackRef.current = false;
    verticalRunEndsAfterTransitionRef.current = false;
    pauseAfterVerticalTransitionRef.current = false;
    setVerticalRunPausePending(false);
    setArrivalCameraTarget(null);
    setNavigationPauseReason(null);
    routeEntryTransitionCompleteRef.current = false;
    setDirectionsMode(false);
    enteredRoomRef.current = null;
  }, [cancelCameraAnimation, cancelPendingCampus3DCameraRecenter, clampActiveStudentZoom]);

  // Stop every playback clock synchronously with the Pause action. Effect
  // cleanup also cancels them after commit, but cancelling here prevents an
  // already queued RAF/transition timeout from advancing one more frame.
  const pauseNavigation = useCallback((reason: "manual" | "pan" = "manual") => {
    const seekingRouteStep = stepSeekTargetRef.current !== null;
    // Transition handoffs are atomic. Their controls are disabled until the
    // brief Floor/Building change settles, so Pause cannot cancel half a handoff.
    // A manual seek owns its own short Floor cue and is safe to stop in place.
    if ((navigationTransitioning || stairLoading) && !seekingRouteStep) {
      // A same-shaft traversal is one user action, but each authored Floor
      // handoff remains atomic. Honor Pause after the current handoff finishes
      // so the canonical cursor and visible Floor are never left half-switched.
      if (autoVerticalTraversalSharedIdRef.current && !pauseAfterVerticalTransitionRef.current) {
        pauseAfterVerticalTransitionRef.current = true;
        setVerticalRunPausePending(true);
      }
      return;
    }
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    stepSeekAnimRef.current = null;
    stepSeekTargetRef.current = null;
    pendingTransitionSeekRef.current = false;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    stepSeekTransitionTimerRef.current = null;
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    walkAnimRef.current = null;
    indoorWalkAnimRef.current = null;
    navigationTransitionAnimRef.current = null;
    if (originIndoorTransitionRef.current) clearTimeout(originIndoorTransitionRef.current);
    if (destinationIndoorTransitionRef.current) clearTimeout(destinationIndoorTransitionRef.current);
    originIndoorTransitionRef.current = null;
    destinationIndoorTransitionRef.current = null;
    followRecenterRequestRef.current += 1;
    followRecenterIntentRef.current = null;
    followCameraReacquiringRef.current = false;
    cancelPendingCampus3DCameraRecenter();
    cancelCameraAnimation(true);
    setStairLoading(null);
    transitionResumePlaybackRef.current = false;
    setVerticalRunPausePending(false);
    const activeRoute = routeRef.current;
    const activeSteps = activeRoute ? studentFacingRouteSteps(activeRoute) : [];
    const activeStepIndex = Math.floor(playbackCursorRef.current + 0.000001);
    const pausedAtAuthoredHandoff = Boolean(activeRoute
      && routeTransitionForStep(activeRoute, activeSteps, activeStepIndex));
    // A manual pause can land on the exact frame that completes an ordinary
    // walk. In that case the new canonical cursor is already at its physical
    // handoff; keep the Continue action available instead of rendering Resume
    // for a step that Resume is intentionally forbidden to cross.
    setNavigationPauseReason(pausedAtAuthoredHandoff ? "transition" : reason);
    dispatchStudentRouteUi({ type: "PAUSE" });
  }, [cancelCameraAnimation, cancelPendingCampus3DCameraRecenter, navigationTransitioning, stairLoading]);

  const beginFollowPan = useCallback(() => {
    detachFollowCamera();
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow"
      && studentRouteUi.playback === "playing") pauseNavigation("pan");
  }, [detachFollowCamera, pauseNavigation, studentRouteUi.camera, studentRouteUi.phase, studentRouteUi.playback]);

  const resumeNavigation = useCallback(() => {
    if (studentRouteUi.phase !== "navigating" || navigationTransitioning || stairLoading) return;
    emergencyVideoPauseLatchRef.current = false;
    // Explore pauses Follow but retains the playback state it should restore.
    // Return to the canonical live cursor/context first; the renderer resumes
    // the saved playback state only after camera reacquisition completes.
    if (studentRouteUi.camera === "explore") {
      recenterCurrentRouteStepRef.current("playing");
      return;
    }
    const activeRoute = routeRef.current;
    const currentSteps = activeRoute ? studentFacingRouteSteps(activeRoute) : [];
    const currentStepIndex = Math.floor(playbackCursorRef.current + 0.000001);
    const currentTransition = activeRoute
      ? routeTransitionForStep(activeRoute, currentSteps, currentStepIndex)
      : null;
    const authorizedVerticalResume = Boolean(activeRoute && autoVerticalTraversalSharedIdRef.current
      && currentTransition
      && studentRouteVerticalTransitionContinuesRun(activeRoute, currentSteps, currentStepIndex, autoVerticalTraversalSharedIdRef.current));
    if (studentRouteFollowNeedsCameraReacquisition({
      routeContextIsElsewhere: routeContextIsElsewhereRef.current,
      cameraDetached: followCameraDetached,
      cameraReacquiring: followCameraReacquiringRef.current,
    })) {
      // A paused floor picker is only an inspection view. Restore the canonical
      // route floor before movement or a pending same-shaft transition resumes.
      const resumeTransitionAfterReacquire = authorizedVerticalResume && activeRoute
        ? () => {
            if (routeRef.current !== activeRoute
              || Math.floor(playbackCursorRef.current + 0.000001) !== currentStepIndex
              || routeContextIsElsewhereRef.current) return;
            activateCurrentRouteTransitionRef.current();
          }
        : undefined;
      recenterCurrentRouteStepRef.current(studentRoutePlaybackAfterCameraReacquisition(Boolean(currentTransition)), resumeTransitionAfterReacquire);
      return;
    }
    if (activeRoute && currentTransition) {
      // A paused, already-authorized vertical run resumes by activating its
      // exact current authored transition. Other physical transitions still
      // require Continue, including transitions reached by manual seeking.
      if (autoVerticalTraversalSharedIdRef.current
        && studentRouteVerticalTransitionContinuesRun(activeRoute, currentSteps, currentStepIndex, autoVerticalTraversalSharedIdRef.current)) {
        activateCurrentRouteTransitionRef.current();
      }
      return;
    }
    // Resume is also the explicit return from Explore/free-look. Restore the
    // camera from the canonical live cursor before playback continues, even
    // when the user has panned far away and no longer sees the avatar.
    if (navigationPauseReason === "pan" || followCameraDetached || followCameraReacquiringRef.current) {
      recenterCurrentRouteStepRef.current("playing");
      return;
    }
    setNavigationPauseReason(null);
    dispatchStudentRouteUi({ type: "RESUME" });
  }, [followCameraDetached, navigationPauseReason, navigationTransitioning, stairLoading, studentRouteUi.camera, studentRouteUi.phase]);

  // A viewed floor is presentation state. During a route session, changing it
  // must pause Follow and leave the canonical indoor segment/cursor intact so
  // Resume can return to the simulated marker instead of rebuilding progress
  // from whichever map context happens to be visible.
  const prepareRouteForContextInspection = useCallback((): "normal" | "inspection" | "blocked" => {
    const ui = studentRouteUiRef.current;
    if (ui.phase !== "navigating" || !routeRef.current) return "normal";
    // Authored handoffs are atomic. Let the existing stair/entrance lifecycle
    // finish before changing the viewed context; a pending Continue handoff is
    // already paused and remains inspectable.
    if (navigationTransitioning || stairLoading) return "blocked";

    clearFollowCameraRecoveryTimer();
    setFollowCameraRecoveryFailed(false);
    if (ui.camera === "follow" && ui.playback === "playing") pauseNavigation("manual");
    followRecenterRequestRef.current += 1;
    followRecenterIntentRef.current = null;
    followCameraReacquiringRef.current = false;
    cancelPendingCampus3DCameraRecenter();
    pendingRouteRecenterRef.current = null;
    cancelCameraAnimation(false);
    detachFollowCamera();
    return "inspection";
  }, [cancelCameraAnimation, cancelPendingCampus3DCameraRecenter, clearFollowCameraRecoveryTimer, detachFollowCamera, navigationTransitioning, pauseNavigation, stairLoading]);
  prepareRouteForContextInspectionRef.current = prepareRouteForContextInspection;

  const clearStudentRoute = useCallback(() => {
    followCameraOffsetsByContextRef.current.clear();
    followCameraPoseCaptureSuppressedRef.current = false;
    clearFollowCameraRecoveryTimer();
    setFollowCameraRecoveryFailed(false);
    followRecenterRequestRef.current += 1;
    followRecenterIntentRef.current = null;
    followCameraReacquiringRef.current = false;
    cancelPendingCampus3DCameraRecenter();
    cancelCameraAnimation(false);
    completedRouteEditSnapshotRef.current = null;
    emergencyVideoPauseLatchRef.current = false;
    setArrivalCameraTarget(null);
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    stepSeekAnimRef.current = null;
    stepSeekTargetRef.current = null;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    stepSeekTransitionTimerRef.current = null;
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    walkAnimRef.current = null;
    indoorWalkAnimRef.current = null;
    navigationTransitionAnimRef.current = null;
    pendingTransitionSeekRef.current = false;
    pendingRouteRecenterRef.current = null;
    routeStartFocusPendingRef.current = false;
    pendingRouteStartFocusRef.current = null;
    setStairLoading(null);
    setRouteFading(false);
    if (destinationIndoorTransitionRef.current) {
      clearTimeout(destinationIndoorTransitionRef.current);
      destinationIndoorTransitionRef.current = null;
    }
    if (originIndoorTransitionRef.current) {
      clearTimeout(originIndoorTransitionRef.current);
      originIndoorTransitionRef.current = null;
    }
    setRoute(null);
    setAutomaticRouteChoices([]);
    setActiveAutomaticRouteId(null);
    routeRef.current = null;
    setActiveEmergencyRouteId(null);
    setEmergencyRouteOverview(false);
    setNavigationPhase("idle");
    setNavigationTransitioning(false);
    setWalkProgress(0);
    walkProgressRef.current = 0;
    setIndoorWalkProgress(0);
    indoorWalkProgressRef.current = 0;
    playbackCursorRef.current = 0;
    setPlaybackCursor(0);
    indoorWalkSegmentKeyRef.current = null;
    setIndoorRoute(null);
    setDestinationIndoorSegments([]);
    setDestinationIndoorSegmentIndex(-1);
    setOriginIndoorSegments([]);
    setOriginIndoorSegmentIndex(-1);
    routeTransitionActivationRef.current = null;
    transitionResumePlaybackRef.current = false;
    setNavigationPauseReason(null);
    routeEntryTransitionCompleteRef.current = false;
    setFromBuilding(null);
    setToBuilding(null);
    setFromCampusPlace(null);
    setToCampusPlace(null);
    setRoomOrigin(null);
    setRoomDestination(null);
    setUseMyLocation(false);
    setRoutePlannerEndpoint(null);
    setRoutePlannerMapPick(null);
    setRoutePlannerSelectionError(null);
    setDirectionsMode(false);
    setShowArrival(false);
    routeModeTouchedRef.current = false;
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
    dispatchStudentRouteUi({ type: "CLEAR_ROUTE" });
    setFollowCameraDetached(false);
    setInspectedRouteStepIndex(null);
    setMobileRoutePreviewExpanded(false);
  }, [cancelCameraAnimation, cancelPendingCampus3DCameraRecenter, clearFollowCameraRecoveryTimer]);

  /**
   * Drop route-specific state as soon as a planner selection is being changed.
   * The selected endpoints and routing mode remain owned by the planner, while
   * the old geometry, playback cursor, transition timers and Route A/B state are
   * invalidated together so an older path cannot sit behind the planner.
   */
  const invalidateRouteForPlannerChange = useCallback(() => {
    completedRouteEditSnapshotRef.current = null;
    emergencyVideoPauseLatchRef.current = false;
    stopEmergencyRouteClocks();
    cancelCameraAnimation(false);
    pendingRouteRecenterRef.current = null;
    pendingRouteStartFocusRef.current = null;
    routeStartFocusPendingRef.current = false;
    setArrivalCameraTarget(null);
    setRouteFading(false);
    setRoute(null);
    routeRef.current = null;
    setAutomaticRouteChoices([]);
    setActiveAutomaticRouteId(null);
    setActiveEmergencyRouteId(null);
    setEmergencyRouteOverview(false);
    setNavigationPhase("idle");
    setNavigationPauseReason(null);
    setNavigationTransitioning(false);
    setShowArrival(false);
    setWalkProgress(0);
    walkProgressRef.current = 0;
    setIndoorWalkProgress(0);
    indoorWalkProgressRef.current = 0;
    playbackCursorRef.current = 0;
    setPlaybackCursor(0);
    setRoutePreviewStepIndex(0);
    setInspectedRouteStepIndex(null);
    setIndoorRoute(null);
    setDestinationIndoorSegments([]);
    setDestinationIndoorSegmentIndex(-1);
    setOriginIndoorSegments([]);
    setOriginIndoorSegmentIndex(-1);
    setActiveRouteRoom(null);
    setFollowCameraDetached(false);
    setMobileRoutePreviewExpanded(false);
    dispatchStudentRouteUi({ type: "OPEN_PLAN" });
    setDirectionsMode(true);
  }, []);

  useEffect(() => {
    if (!eventMapDeepLink) {
      startedEventMapDeepLinkRef.current = null;
      completedEventMapDeepLinkRef.current = null;
      return;
    }
    if (completedEventMapDeepLinkRef.current === eventMapDeepLink.key || startedEventMapDeepLinkRef.current === eventMapDeepLink.key) return;
    if (isCampusLoading || availableCampuses.length === 0 || !platformSettingsReady) return;

    const targetCampus = eventMapDeepLink.campusId
      ? availableCampuses.find((campus) => campus.id === eventMapDeepLink.campusId)
      : activeCampus;
    if (!targetCampus) {
      completedEventMapDeepLinkRef.current = eventMapDeepLink.key;
      showWarning("Event unavailable", { description: "This event is not available on the selected campus." });
      clearEventMapDeepLinkQuery();
      return;
    }
    if (activeCampus?.id !== targetCampus.id) {
      setSelectedCampusId(targetCampus.id);
      return;
    }
    if (!platformSettings.showApprovedEventOverlays) {
      completedEventMapDeepLinkRef.current = eventMapDeepLink.key;
      showWarning("Event map unavailable", { description: "Campus event maps are currently disabled." });
      clearEventMapDeepLinkQuery();
      return;
    }

    startedEventMapDeepLinkRef.current = eventMapDeepLink.key;
    dismissSearch();
    if (directionsMode || navigationTransitioning || navigationPhase !== "idle") endNavigation();
    setDirectionsMode(false);
    setNavigationTransitioning(false);
    setNavigationPhase("idle");
    setFromBuilding(null);
    setToBuilding(null);
    setFromCampusPlace(null);
    setToCampusPlace(null);
    setRoomOrigin(null);
    setRoomDestination(null);
    setUseMyLocation(false);
    setSelected(null);
    setSelectedCampusPlaceId(null);
    setFloorView(null);
    setIndoorRoute(null);
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
    setSelectedRoomContext(null);
    setEventFilter("all");
    setSelectedEventId(null);
    setSelectedLocationId(null);
    setShowEventMaps(true);
  }, [
    eventMapDeepLink, isCampusLoading, availableCampuses, platformSettingsReady, activeCampus?.id,
    platformSettings.showApprovedEventOverlays, setSelectedCampusId, showWarning, directionsMode, navigationTransitioning,
    navigationPhase, endNavigation, dismissSearch, clearEventMapDeepLinkQuery,
  ]);

  useEffect(() => {
    if (!eventMapDeepLink || startedEventMapDeepLinkRef.current !== eventMapDeepLink.key
      || completedEventMapDeepLinkRef.current === eventMapDeepLink.key || !showEventMaps) return;
    const event = visibleEvents.find((candidate) => candidate.id === eventMapDeepLink.eventId && candidate.campusId === activeCampus?.id);
    if (!event) return;
    const eventLocation = eventMapDeepLink.locationId
      ? event.locations.find((candidate) => candidate.id === eventMapDeepLink.locationId) ?? event.locations[0]
      : event.locations[0];

    setSelectedEventId(event.id);
    if (eventLocation) viewEventLocation(event.id, eventLocation.id);
    else setSelectedLocationId(null);
    completedEventMapDeepLinkRef.current = eventMapDeepLink.key;
    startedEventMapDeepLinkRef.current = null;
    clearEventMapDeepLinkQuery();
  }, [eventMapDeepLink, activeCampus?.id, visibleEvents, showEventMaps, viewEventLocation, clearEventMapDeepLinkQuery]);

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
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    beginFollowPan();
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grabbing";
    queuePanUpdate(e.clientX, e.clientY, drag);
    // Per-frame velocity from last cursor position
    trackVelocity(drag, e.clientX - drag.lx, e.clientY - drag.ly, 0.5);
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  }, [beginFollowPan, queuePanUpdate, trackVelocity]);

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
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    const t = e.touches[0];
    dragRef.current = { sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, px: pan.x, py: pan.y, moved: false, vx: 0, vy: 0, lastTime: performance.now() };
  }, [cancelCameraAnimation, flushPanUpdate, commitCameraState]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pointerGestureActiveRef.current) return;
    // Pinch-to-zoom: 2 fingers
    if (e.touches.length === 2 && pinchRef.current) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const curDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = curDist / pinchRef.current.dist;
      const next = clampActiveStudentZoom(pinchRef.current.initZoom * ratio);
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
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    beginFollowPan();
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grabbing";
    queuePanUpdate(t.clientX, t.clientY, drag);
    // Per-frame velocity with EMA smoothing (lower alpha = smoother)
    trackVelocity(drag, t.clientX - drag.lx, t.clientY - drag.ly, 0.35);
    drag.lx = t.clientX;
    drag.ly = t.clientY;
  }, [beginFollowPan, clampActiveStudentZoom, queuePanUpdate, queueZoomUpdate, trackVelocity]);

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
      const next = clampActiveStudentZoom(pointerPinchRef.current.initZoom * ratio);
      queueZoomUpdate((first.x + second.x) / 2, (first.y + second.y) / 2, next);
      return;
    }

    if (pointerPointsRef.current.size !== 1) return;
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    beginFollowPan();
    if (mapContainerRef.current) mapContainerRef.current.style.cursor = "grabbing";
    queuePanUpdate(e.clientX, e.clientY, drag);
    trackVelocity(drag, e.clientX - drag.lx, e.clientY - drag.ly, 0.35);
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  }, [beginFollowPan, clampActiveStudentZoom, queuePanUpdate, queueZoomUpdate, trackVelocity]);

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
    const activeRoute = routeRef.current;
    const routeSegments = activeRouteSegmentsForBuilding(
      activeRoute,
      building.id,
      navigationPhase,
      roomOrigin?.buildingId,
    );
    const currentIndoorSegment = navigationPhase === "origin-indoor"
      ? originIndoorSegments[originIndoorSegmentIndex]
      : navigationPhase === "destination-indoor"
        ? destinationIndoorSegments[destinationIndoorSegmentIndex]
        : undefined;
    const routeSegment = currentIndoorSegment?.buildingId === building.id
      ? currentIndoorSegment
      : routeSegments[0];
    const routeFloor = routeSegment
      ? indoorSegmentFloorNumber(routeSegment, publishedBuilding)
      : undefined;
    const initialFloor = floor ?? routeFloor ?? entryFloor?.number ?? FLOOR_PLANS[building.id]?.floors[0]?.number ?? 1;
    setFloorView({ building, floor: initialFloor });
    // The details sheet otherwise covers the floor picker on the right.
    setSelected(null);
    setZoom(1); setPan({ x:0, y:0 });
    setSearch(""); setSearchFocused(false);
    setHighlightedRoom(null); setHoveredRoom(null);
    setSelectedRoomContext(null);
  }, [FLOOR_PLANS, activeCampus, navigationPhase, roomOrigin?.buildingId, originIndoorSegments, originIndoorSegmentIndex, destinationIndoorSegments, destinationIndoorSegmentIndex]);

  const focusDiscoverStop = useCallback((stopIndex: number) => {
    const stop = discoverStops[stopIndex];
    if (!stop) return;
    pendingBuildingClickFocusRef.current = stop.map.id;
    setSelected(stop.map);
    setSelectedCampusPlaceId(null);
    setShowBuildingDetailsDuringRoutePlanner(false);
    setSelectedRoomContext(null);
    setHighlightedRoom(null);
    setHoveredRoom(null);
    setFloorView(null);
    setSearchFocusNonce((nonce) => nonce + 1);
  }, [discoverStops]);

  const beginDiscoverTour = useCallback((navigationEnded = false) => {
    if (!activeCampus) {
      setDiscoverTour({ active: true, navigationGuard: false, campusId: null, view: "showcase", stopIndex: 0, mobileExpanded: false });
      return;
    }
    if (!navigationEnded && (studentRouteUi.phase === "navigating" || studentRouteUi.phase === "arrived")) {
      setDiscoverTour((current) => ({ ...current, navigationGuard: true }));
      return;
    }

    discoverSnapshotRef.current = {
      campusId: activeCampus.id,
      selected,
      selectedCampusPlaceId,
      floorView,
      selectedRoomContext,
      highlightedRoom,
      showBuildingDetailsDuringRoutePlanner,
      campusViewMode,
      campus3DFallback,
      zoom: zoomRef.current,
      pan: { ...panRef.current },
      search,
      directionsMode: navigationEnded ? false : directionsMode,
      campusCameraPose: campusCameraPoseRef.current,
      indoorCameraPose: indoorCameraPoseRef.current,
    };
    const stopIndex = discoverStops.length ? 0 : 0;
    discoverStopIndexRef.current = stopIndex;
    setDiscoverTour({ active: true, navigationGuard: false, campusId: activeCampus.id, view: "showcase", stopIndex, mobileExpanded: false });
    setCampus3DFallback(false);
    setCampus3DLoaded(true);
    setCampusViewMode("3d");
    setCameraPoseRestore(null);
    setSelectedCampusPlaceId(null);
    setSelectedRoomContext(null);
    setHighlightedRoom(null);
    setHoveredRoom(null);
    setFloorView(null);
    setSearchFocused(false);
    setProfileMenuOpen(false);
    setShowQR(false);
    setLocationScannerOpen(false);
    setShowEventMaps(false);
    if (discoverStops[0]) focusDiscoverStop(0);
    else setSelected(null);
  }, [activeCampus, campus3DFallback, campusViewMode, directionsMode, discoverStops, focusDiscoverStop, floorView, highlightedRoom, search, selected, selectedCampusPlaceId, selectedRoomContext, showBuildingDetailsDuringRoutePlanner, studentRouteUi.phase]);

  const exitDiscoverTour = useCallback(() => {
    if (!discoverTour.active) {
      setDiscoverTour((current) => ({ ...current, navigationGuard: false }));
      return;
    }
    const snapshot = discoverSnapshotRef.current;
    setDiscoverTour({ active: false, navigationGuard: false, campusId: null, view: "showcase", stopIndex: 0, mobileExpanded: false });
    discoverSnapshotRef.current = null;
    discoverExteriorCameraPoseRef.current = null;
    pending2DRendererReframeRef.current = null;
    cancelCameraAnimation(false);
    if (snapshot && snapshot.campusId === activeCampus?.id) {
      setSelected(snapshot.selected);
      setSelectedCampusPlaceId(snapshot.selectedCampusPlaceId);
      setFloorView(snapshot.floorView);
      setSelectedRoomContext(snapshot.selectedRoomContext);
      setHighlightedRoom(snapshot.highlightedRoom);
      setShowBuildingDetailsDuringRoutePlanner(snapshot.showBuildingDetailsDuringRoutePlanner);
      setCampus3DFallback(snapshot.campus3DFallback);
      setCampusViewMode(snapshot.campusViewMode);
      setZoom(snapshot.zoom);
      setPan(snapshot.pan);
      setSearch(snapshot.search);
      setDirectionsMode(snapshot.directionsMode);
      if (snapshot.campusViewMode === "3d") {
        queueCameraPoseRestore(snapshot.floorView ? snapshot.indoorCameraPose : snapshot.campusCameraPose);
      }
    } else {
      setSelected(null);
      setSelectedCampusPlaceId(null);
      setFloorView(null);
      setSelectedRoomContext(null);
      setHighlightedRoom(null);
      setCampusViewMode("2d");
    }
  }, [activeCampus?.id, cancelCameraAnimation, discoverTour.active, queueCameraPoseRestore]);
  discoverExitHandlerRef.current = exitDiscoverTour;

  const requestDiscoverTour = useCallback(() => {
    beginDiscoverTour();
  }, [beginDiscoverTour]);
  const confirmDiscoverTourAfterEndingNavigation = useCallback(() => {
    clearStudentRoute();
    beginDiscoverTour(true);
  }, [beginDiscoverTour, clearStudentRoute]);
  const moveDiscoverStop = useCallback((delta: -1 | 1) => {
    if (!discoverStops.length) return;
    const nextIndex = (discoverStopIndexRef.current + delta + discoverStops.length) % discoverStops.length;
    discoverStopIndexRef.current = nextIndex;
    setDiscoverTour((current) => ({ ...current, stopIndex: nextIndex, view: "showcase" }));
    focusDiscoverStop(nextIndex);
  }, [discoverStops, focusDiscoverStop]);
  const enterDiscoverBuilding = useCallback(() => {
    const stop = discoverStops[discoverTour.stopIndex];
    if (!stop?.published.floors?.length) return;
    discoverExteriorCameraPoseRef.current = campusCameraPoseRef.current;
    setDiscoverTour((current) => ({ ...current, view: "inside" }));
    openFloorPlan(stop.map, stop.published.floors[0]?.number);
  }, [discoverStops, discoverTour.stopIndex, openFloorPlan]);
  const backToDiscoverBuilding = useCallback(() => {
    const stop = discoverStops[discoverStopIndexRef.current];
    if (!stop) return;
    setFloorView(null);
    setSelectedRoomContext(null);
    setHighlightedRoom(null);
    setHoveredRoom(null);
    setSelected(stop.map);
    pendingBuildingClickFocusRef.current = stop.map.id;
    setSearchFocusNonce((nonce) => nonce + 1);
    queueCameraPoseRestore(discoverExteriorCameraPoseRef.current);
    setDiscoverTour((current) => ({ ...current, view: "showcase" }));
  }, [discoverStops, queueCameraPoseRestore]);

  useEffect(() => {
    if (!discoverTour.active) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      discoverExitHandlerRef.current?.();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [discoverTour.active]);

  useEffect(() => {
    if (!discoverTour.active || discoverTour.campusId === activeCampus?.id) return;
    discoverSnapshotRef.current = null;
    setDiscoverTour({ active: false, navigationGuard: false, campusId: null, view: "showcase", stopIndex: 0, mobileExpanded: false });
  }, [activeCampus?.id, discoverTour.active, discoverTour.campusId]);

  const changeStudentFloor = useCallback((floorNumber: number) => {
    if (!floorView || floorView.floor === floorNumber) return;
    const buildingData = activeCampus?.buildings.find((building) => building.id === floorView.building.id);
    const targetFloor = buildingData?.floors.find((floor) => floor.number === floorNumber);
    if (!targetFloor) return;

    const routeContextAction = prepareRouteForContextInspection();
    if (routeContextAction === "blocked") return;
    // A manually chosen floor is the visible context. Clear any room selection
    // from the previous floor so it cannot leave stale card/highlight/focus
    // state behind or be mistaken for a room on the newly rendered floor.
    const buildingId = floorView.building.id;
    setFloorView((view) => view && view.building.id === buildingId
      ? { ...view, floor: targetFloor.number }
      : view);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setHighlightedRoom(null);
    setHoveredRoom(null);
    setActiveRouteRoom(null);
    setSelectedRoomContext(null);
  }, [activeCampus, floorView, prepareRouteForContextInspection]);

  const closeFloorPlan = useCallback(() => {
    const routeContextAction = prepareRouteForContextInspection();
    if (routeContextAction === "blocked") return;
    setSelectedLocationId(null);
    if (routeContextAction === "inspection") {
      // Keep the route's active segment, floor index, animation progress and
      // transition guards. Only the visible map context changes here.
      setFloorView(null);
      setZoom(1); setPan({ x: 0, y: 0 });
      setHighlightedRoom(null); setHoveredRoom(null);
      setSelectedRoomContext(null);
      setActiveRouteRoom(null);
      setSelected(null);
      return;
    }
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
  }, [prepareRouteForContextInspection]);

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
  const fromRouteEndpointKey = useMemo(() => {
    if (useMyLocation && youAreHere) return `pin:${youAreHere.x}:${youAreHere.y}`;
    if (roomOrigin) return `room:${roomOrigin.buildingId}:${roomOrigin.floorNumber}:${roomOrigin.roomId}`;
    if (fromCampusPlace) return `campus-place:${fromCampusPlace.campusPlaceId}`;
    return fromBuilding ? `building:${fromBuilding.id}` : null;
  }, [fromBuilding, fromCampusPlace, roomOrigin, useMyLocation, youAreHere]);
  const toRouteEndpointKey = useMemo(() => {
    if (roomDestination) return `room:${roomDestination.buildingId}:${roomDestination.floorNumber}:${roomDestination.roomId}`;
    if (toCampusPlace) return `campus-place:${toCampusPlace.campusPlaceId}`;
    return toBuilding ? `building:${toBuilding.id}` : null;
  }, [roomDestination, toBuilding, toCampusPlace]);
  const [route, setRoute] = useState<PlannedRoute | null>(null);
  const [automaticRouteChoices, setAutomaticRouteChoices] = useState<Array<{ id: string; label: string; route: PlannedRoute }>>([]);
  const [activeAutomaticRouteId, setActiveAutomaticRouteId] = useState<string | null>(null);
  const [activeEmergencyRouteId, setActiveEmergencyRouteId] = useState<string | null>(null);
  const [emergencyRouteOverview, setEmergencyRouteOverview] = useState(false);
  const emergencyOverviewCameraRequestRef = useRef(0);
  const emergencyOverviewCameraFramedRef = useRef(0);
  const studentEmergencyRouteResolution = useMemo(
    () => mapMode === "emergency" && roomOrigin
      ? resolveAutomaticStudentEvacuationRoutes(activeCampus, roomOrigin)
      : { configured: false, routes: [], message: null, evaluation: undefined },
    [activeCampus, mapMode, roomOrigin],
  );
  const approvedStudentEmergencyRoutes = studentEmergencyRouteResolution.routes;
  const emergencyPlannerAvailability = useMemo<EmergencyPlannerAvailability | null>(() => {
    if (mapMode !== "emergency" || !activeCampus) return null;
    const origin = fromCampusPlace ?? roomOrigin ?? (useMyLocation && youAreHere
      ? { type: "point" as const, ...youAreHere }
      : fromBuilding ? {
          type: "building" as const,
          buildingId: fromBuilding.id,
          label: fromBuilding.name,
          code: fromBuilding.code,
        } : null);
    if (!origin) return null;

    const buildingId = origin.type === "room" || origin.type === "building" ? origin.buildingId : undefined;
    const assignedPoints = buildingId
      ? (activeCampus.assemblyPoints ?? []).filter((point) =>
          point.buildingAssignments?.some((assignment) => assignment.buildingId === buildingId))
      : [];
    const pointStates = assignedPoints.map((point) => ({ point, connectivity: analyzeEmergencyOutdoorConnectivity(activeCampus, point) }));
    const connectedPoints = pointStates.filter(({ connectivity }) => connectivity.state === "connected");
    const nearestEligible = activeCampus.settings?.emergencyDestinationPolicy === "nearest_eligible";
    const eligibleAssignedPoints = pointStates.filter(({ point }) =>
      isAssemblyPointAssignedForBuilding(activeCampus, point, buildingId ?? "")
      && (nearestEligible || point.buildingAssignments?.some((assignment) =>
        assignment.buildingId === buildingId && assignment.designation === "primary")));
    const room = origin.type === "room"
      ? activeCampus.buildings.find((building) => building.id === origin.buildingId)?.floors
          .find((floor) => floor.number === origin.floorNumber)?.rooms.find((candidate) => candidate.id === origin.roomId)
      : undefined;
    const roomGraphCandidates = origin.type === "room"
      ? studentEmergencyRouteResolution.evaluation?.candidates ?? []
      : [];
    const graphRoute = origin.type === "room"
      ? approvedStudentEmergencyRoutes[0]?.candidate.route ?? null
      : planStudentEmergencyRoute(activeCampus, origin);
    const emergencySafeEgressAvailable = origin.type === "room" && studentEmergencyRouteResolution.evaluation
      ? roomGraphCandidates.some((candidate) => candidate.graphCompleteAssemblyRoute
        && !candidate.emergencyUseReviewRequired)
      : undefined;
    const reason = graphRoute?.emergencyDestinationFallback ? null : selectEmergencyRouteFailureReason({
      assignedAssemblyPointCount: buildingId ? assignedPoints.length : graphRoute ? 1 : 0,
      connectedAssemblyPointCount: buildingId ? connectedPoints.length : graphRoute ? 1 : 0,
      eligibleAssignedAssemblyPointCount: buildingId ? eligibleAssignedPoints.length : graphRoute?.emergencyAssemblyPointId ? 1 : 0,
      completeGraphRouteCount: graphRoute ? 1 : 0,
      emergencySafeEgressAvailable,
    });
    const details = [
      `Assembly point: ${assignedPoints.length ? `${eligibleAssignedPoints.length} assigned point${eligibleAssignedPoints.length === 1 ? " is" : "s are"} available under this building's destination policy` : graphRoute?.emergencyDestinationFallback ? "No point is assigned; Campus Gate is used as a labeled fallback" : graphRoute?.emergencyDestinationLabel ? `${graphRoute.emergencyDestinationLabel} is reachable` : "No Assembly Point is assigned to this start"}.`,
      `Pathway connection: ${connectedPoints.length ? `${connectedPoints.length} assigned point${connectedPoints.length === 1 ? " is" : "s are"} connected to the outdoor walking network` : assignedPoints.length ? "No assigned point has a valid outdoor pathway connection" : "No assigned Assembly Point is available to check"}.`,
      `Complete emergency-safe route: ${graphRoute ? "Available from this start" : "Not found from this start"}.`,
      ...(emergencySafeEgressAvailable === undefined ? [] : [`Emergency-safe egress: ${emergencySafeEgressAvailable ? "A room-door route to a building exit is connected" : "No room-door route to a building exit was found"}.`]),
    ];
    const guidanceDetail = "This map does not include live hazard conditions. Follow posted emergency instructions and campus personnel.";

    if (reason) return { state: "unavailable", reason, details };
    return graphRoute
      ? { state: "available", destinationName: graphRoute.emergencyDestinationLabel, details: [...details, guidanceDetail] }
      : { state: "unavailable", reason: "no_safe_route", details };
  }, [activeCampus, approvedStudentEmergencyRoutes, fromBuilding, fromCampusPlace, mapMode, roomOrigin, studentEmergencyRouteResolution.evaluation, useMyLocation, youAreHere]);
  const studentEmergencyAssemblyPointIds = useMemo(() => {
    const ids = new Set<string>();
    if (mapMode !== "emergency" || !activeCampus) return ids;
    for (const option of approvedStudentEmergencyRoutes) {
      if (option.candidate.assemblyPointId) ids.add(option.candidate.assemblyPointId);
    }
    if (route?.emergencyAssemblyPointId) {
      const point = activeCampus.assemblyPoints?.find((candidate) => candidate.id === route.emergencyAssemblyPointId);
      if (point && point.navNodeId && activeCampus.navNodes?.some((node) => node.id === point.navNodeId && node.assemblyPointId === point.id)) {
        ids.add(point.id);
      }
    }
    return ids;
  }, [activeCampus, approvedStudentEmergencyRoutes, mapMode, route?.emergencyAssemblyPointId]);
  const activeStudentEmergencyAssemblyPointId = emergencyRouteOverview
    ? null
    : activeEmergencyRouteId
      ? approvedStudentEmergencyRoutes.find((option) => option.id === activeEmergencyRouteId)?.candidate.assemblyPointId ?? null
      : route?.emergencyAssemblyPointId ?? null;
  const smartEmergencyRouteChoices = useMemo(() => approvedStudentEmergencyRoutes.map((item) => ({
    id: item.id,
    label: item.label,
    doorLabel: item.candidate.doorLabel,
    exitLabel: item.candidate.exitLabel,
  })), [approvedStudentEmergencyRoutes]);
  // One automatically discovered route still owns the SOS lifecycle. The
  // resolver's `configured` flag describes whether meaningful A/B choices
  // exist, so do not use it as the route-validity gate.
  const smartEmergencyRouteMode = mapMode === "emergency" && approvedStudentEmergencyRoutes.length > 0;
  const [arrivalCameraTarget, setArrivalCameraTarget] = useState<StudentArrivalCameraTarget | null>(null);
  const completedRouteEditSnapshotRef = useRef<{
    ui: typeof studentRouteUi;
    fromBuilding: typeof fromBuilding;
    toBuilding: typeof toBuilding;
    fromCampusPlace: typeof fromCampusPlace;
    toCampusPlace: typeof toCampusPlace;
    roomOrigin: typeof roomOrigin;
    roomDestination: typeof roomDestination;
    mapMode: typeof mapMode;
    standardRoutePreference: typeof standardRoutePreference;
    useMyLocation: typeof useMyLocation;
    youAreHere: typeof youAreHere;
    currentLocationLabel: typeof currentLocationLabel;
    navigationPhase: typeof navigationPhase;
    floorView: typeof floorView;
    indoorRoute: typeof indoorRoute;
    destinationIndoorSegments: typeof destinationIndoorSegments;
    destinationIndoorSegmentIndex: typeof destinationIndoorSegmentIndex;
    originIndoorSegments: typeof originIndoorSegments;
    originIndoorSegmentIndex: typeof originIndoorSegmentIndex;
    activeRouteRoom: typeof activeRouteRoom;
    highlightedRoom: typeof highlightedRoom;
    walkProgress: typeof walkProgress;
    indoorWalkProgress: typeof indoorWalkProgress;
    playbackCursor: typeof playbackCursor;
    routePreviewStepIndex: typeof routePreviewStepIndex;
    showArrival: typeof showArrival;
    selected: typeof selected;
    selectedCampusPlaceId: typeof selectedCampusPlaceId;
    selectedRoomContext: typeof selectedRoomContext;
    arrivalCameraTarget: typeof arrivalCameraTarget;
  } | null>(null);
  const calculateRoute = useCallback((): PlannedRoute | null => {
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
        planned = planPointToDestinationRoute(youAreHere, placeAwareTo, mapMode, activeCampus, B_POS, standardRoutePreference);
      } else if (placeAwareFrom && placeAwareTo) {
        planned = planDestinationRoute(placeAwareFrom, placeAwareTo, mapMode, activeCampus, standardRoutePreference);
      }
    } else if (roomOrigin && toBuilding) {
      const destination = roomDestination ?? {
        type: "building" as const,
        buildingId: toBuilding.id,
        label: toBuilding.name,
        code: toBuilding.code,
        entranceNodeId: activeCampus?.buildings.find((building) => building.id === toBuilding.id)?.entranceNodeId,
      };
      planned = planDestinationRoute(roomOrigin, destination, mapMode, activeCampus, standardRoutePreference);
    } else if (useMyLocation && youAreHere && toBuilding) {
      // Kiosk-style: start from the "You are here" marker.
      if (roomDestination) {
        planned = planPointToDestinationRoute(
          youAreHere,
          roomDestination,
          mapMode,
          activeCampus,
          B_POS,
          standardRoutePreference,
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
          B_POS,
          standardRoutePreference,
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
        standardRoutePreference,
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
        activeCampus,
        standardRoutePreference
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
  }, [fromBuilding, toBuilding, fromCampusPlace, toCampusPlace, roomOrigin, useMyLocation, youAreHere, mapMode, B_POS, activeCampus, roomDestination, standardRoutePreference]);

  const calculateAutomaticRouteAlternatives = useCallback((): PlannedRoute[] => {
    if (!activeCampus || mapMode === "emergency" || (useMyLocation && youAreHere)) return [];
    const from: Destination | null = roomOrigin ?? fromCampusPlace ?? (fromBuilding ? {
      type: "building",
      buildingId: fromBuilding.id,
      label: fromBuilding.name,
      code: fromBuilding.code,
      entranceNodeId: activeCampus.buildings.find((building) => building.id === fromBuilding.id)?.entranceNodeId,
    } : null);
    const to: Destination | null = roomDestination ?? toCampusPlace ?? (toBuilding ? {
      type: "building",
      buildingId: toBuilding.id,
      label: toBuilding.name,
      code: toBuilding.code,
      entranceNodeId: activeCampus.buildings.find((building) => building.id === toBuilding.id)?.entranceNodeId,
    } : null);
    if (!from || !to) return [];
    return planAuthoredDestinationRoutes(from, to, mapMode, activeCampus, standardRoutePreference, 2);
  }, [activeCampus, fromBuilding, fromCampusPlace, mapMode, roomDestination, roomOrigin, standardRoutePreference, toBuilding, toCampusPlace, useMyLocation, youAreHere]);

  const resumeEmergencyNavigation = useCallback(() => {
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "explore") {
      emergencyVideoPauseLatchRef.current = false;
      setNavigationPauseReason(null);
      dispatchStudentRouteUi({ type: "RESUME_EXPLORE" });
      return;
    }
    resumeNavigation();
  }, [dispatchStudentRouteUi, resumeNavigation, studentRouteUi.camera, studentRouteUi.phase]);

  const saveEmergencyVideoPlaybackState = useCallback((state: EmergencyVideoPlaybackState) => {
    if (!emergencyVideoSessionKey) return;
    emergencyVideoPlaybackRef.current = { key: emergencyVideoSessionKey, state };
  }, [emergencyVideoSessionKey]);

  const closeEmergencyVideo = useCallback(() => {
    setEmergencyVideoOverlayKey(null);
  }, []);

  const openEmergencyVideo = useCallback(() => {
    if (!emergencyVideoSessionKey || !selectedEmergencyVideo) return;
    emergencyVideoPauseLatchRef.current = studentRouteUi.phase === "navigating";
    emergencyVideoAutoplaySuppressedRef.current = { key: emergencyVideoSessionKey, suppressed: true };
    // The route clock is paused synchronously before the video is mounted, so
    // route progress and camera ownership cannot continue behind the viewer.
    if (studentRouteUi.phase === "navigating" && studentRouteUi.playback === "playing") {
      if (navigationTransitioning || stairLoading) {
        // A floor/building handoff is atomic and must finish, but its completion
        // callback must not resume route playback underneath the video viewer.
        // Suppress the transition's one-shot resume before mounting the player.
        transitionResumePlaybackRef.current = false;
        setNavigationPauseReason("manual");
        setVerticalRunPausePending(false);
        dispatchStudentRouteUi({ type: "PAUSE" });
      } else {
        pauseNavigation("manual");
      }
    }
    setEmergencyVideoOverlayKey(emergencyVideoSessionKey);
  }, [dispatchStudentRouteUi, emergencyVideoSessionKey, navigationTransitioning, pauseNavigation, selectedEmergencyVideo, stairLoading, studentRouteUi.phase, studentRouteUi.playback]);

  const resumeRouteFromEmergencyVideo = useCallback(() => {
    // Closing unmounts the player (and pauses its media element) in the same
    // React commit before the resumed route can advance its next frame.
    emergencyVideoPauseLatchRef.current = false;
    setEmergencyVideoOverlayKey(null);
    if (smartEmergencyRouteMode) resumeEmergencyNavigation();
    else resumeNavigation();
  }, [resumeEmergencyNavigation, resumeNavigation, smartEmergencyRouteMode]);

  useEffect(() => {
    if (mapMode === "emergency" && emergencyVideoSessionKey) {
      emergencyVideoAutoplaySuppressedRef.current = { key: emergencyVideoSessionKey, suppressed: true };
    }
    if (emergencyVideoOverlayKey && emergencyVideoOverlayKey !== emergencyVideoSessionKey) {
      setEmergencyVideoOverlayKey(null);
    }
  }, [emergencyVideoOverlayKey, emergencyVideoSessionKey, mapMode]);

  useEffect(() => {
    if (!route || !isFloorMode || directionsMode || navigationTransitioning) {
      setFloorPickerFallbackActive(false);
    }
  }, [directionsMode, isFloorMode, navigationTransitioning, route]);

  // ── Auto-close planner when the route becomes ready ────────────────────
  // The unified Route Planner owns plan, preview, and guided-navigation UI.
  // Room routes stay there until the user explicitly starts navigation.
  const previousCampusIdRef = useRef<string | null>(null);

  // A campus switch invalidates every coordinate-bearing navigation state.
  // Clear it as one transaction so a route, floor plan, pin, or room endpoint
  // from the previous campus cannot be rendered against the new map.
  useEffect(() => {
    const nextCampusId = activeCampus?.id ?? null;
    if (previousCampusIdRef.current === nextCampusId) return;
    previousCampusIdRef.current = nextCampusId;
    routeModeTouchedRef.current = false;
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
    pendingTransitionSeekRef.current = false;
    setWalkProgress(0);
    setIndoorWalkProgress(0);
    setShowArrival(false);
    setRoute(null);
    setAutomaticRouteChoices([]);
    setActiveAutomaticRouteId(null);
    setZoom(DEFAULT_OUTDOOR_ZOOM);
    setPan({ x: 0, y: 0 });
    routeRef.current = null;
    enteredRoomRef.current = null;
    dispatchStudentRouteUi({ type: "DONE" });
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
    // A room target from props (admin report preview) or a ?roomId= link.
    const roomLinkId = initialRoomId ?? params.get("roomId");
    const roomLinkFloorId = initialRoomId ? initialFloorId : params.get("floorId") ?? undefined;
    const hasExplicitTarget = Boolean(initialBuildingId || initialPlaceId);
    const campusHint = initialCampusId ?? locationPayload?.campusId ?? params.get("campusId");
    const targetPlaceId = initialPlaceId ?? (destinationPlaceId || placeId);
    const targetId = initialBuildingId || locationId || params.get("buildingId") || targetPlaceId || destinationBuildingId || params.get("select");
    if (!targetId) {
      initialSelectionRef.current = true;
      return;
    }
    const campusCandidates = campusHint
      ? availableCampuses.filter((campus) => campus.id === campusHint)
      : availableCampuses;
    const matchesTarget = (campus: EditorCampus) => locationId
      ? resolveCampusLocationQr(campus, targetId, locationPayload ?? undefined) !== null
      : targetPlaceId
        ? campus.markers.some((marker) => marker.id === targetPlaceId)
        : campus.buildings.some((building) =>
          building.id === targetId || building.code.toLowerCase() === targetId.toLowerCase(),
        );
    const targetCampus = (activeCampus && campusCandidates.includes(activeCampus) && matchesTarget(activeCampus)
      ? activeCampus
      : campusCandidates.find(matchesTarget));
    if (!targetCampus) {
      if (locationId) {
        showError("Location QR not recognized", { description: "This code does not match a published campus location." });
        if (!hasExplicitTarget) window.history.replaceState(window.history.state, "", window.location.pathname);
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
      if (!hasExplicitTarget) window.history.replaceState(window.history.state, "", window.location.pathname);
      return;
    }
    if (targetPlaceId) {
      const place = targetCampus.markers.find((marker) => marker.id === targetPlaceId);
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
          dispatchStudentRouteUi({ type: "OPEN_PLAN" });
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
      if (!hasExplicitTarget) window.history.replaceState(window.history.state, "", window.location.pathname);
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
      dispatchStudentRouteUi({ type: "OPEN_PLAN" });
      setDirectionsMode(true);
      setUseMyLocation(Boolean(youAreHere));
    } else if (roomLinkId) {
      setPendingRoomLink({ buildingId: building.id, floorId: roomLinkFloorId, roomId: roomLinkId });
    } else {
      searchFocusRef.current = { buildingId: building.id };
      setSearchFocusNonce((nonce) => nonce + 1);
      setSelected(building);
    }
    initialSelectionRef.current = true;
    if (!initialBuildingId) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [isCampusLoading, availableCampuses, activeCampus, MOCK_BUILDINGS, setSelectedCampusId, applyCampusLocationQr, showError, youAreHere, initialCampusId, initialBuildingId, initialPlaceId, initialRoomId, initialFloorId]);

  useEffect(() => {
    if (!pendingLocationScan || isCampusLoading || !activeCampus || activeCampus.id !== pendingLocationScan.campusId) return;
    applyCampusLocationQr(activeCampus, pendingLocationScan.locationId, pendingLocationScan);
    setPendingLocationScan(null);
  }, [pendingLocationScan, isCampusLoading, activeCampus, applyCampusLocationQr]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    autoVerticalTraversalSharedIdRef.current = null;
    verticalRunEndsAfterTransitionRef.current = false;
    pauseAfterVerticalTransitionRef.current = false;
    setVerticalRunPausePending(false);
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
        studentFacingRouteSteps(route).length,
        route.points.map(({ x, y }) => [x, y]),
        (route.indoorSegments ?? []).map((segment) => [
          segment.buildingId,
          segment.floorNumber,
          segment.waypoints.map(({ x, y }) => [x, y]),
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
    if (!activeRoute || studentRouteUi.phase !== "navigating" || studentRouteUi.playback !== "playing" || directionsMode || navigationTransitioning || navigationPhase === "origin-indoor"
      || navigationPhase === "destination-indoor") {
      if (!activeRoute || navigationTransitioning) {
        walkProgressRef.current = 0;
        setWalkProgress(0);
      }
      return;
    }
    if (pendingTransitionSeekRef.current) return;

    const initialProgress = Math.max(0, Math.min(0.999, walkProgressRef.current));
    const steps = studentFacingRouteSteps(activeRoute);
    const activeLegTarget = studentRoutePlaybackTarget(activeRoute, steps, playbackCursorRef.current);
    const activeCampusLeg = activeLegTarget.contextLegIndex === undefined
      ? undefined
      : activeRoute.contextLegs?.[activeLegTarget.contextLegIndex];
    const activeCampusLegIndex = activeCampusLeg?.kind === "campus" ? activeLegTarget.contextLegIndex : undefined;
    const outdoorPoints = activeCampusLeg?.kind === "campus"
      ? activeCampusLeg.waypoints
      : activeRoute.campusPoints?.length ? activeRoute.campusPoints : activeRoute.points;
    const sampleOutdoorPoint = createRoutePointSampler(outdoorPoints);
    if (reducedMotion) {
      walkProgressRef.current = 1;
      setWalkProgress(1);
      const cursor = studentRoutePositionForLeg(activeRoute, steps, "outdoor", null, 1, playbackCursorRef.current, activeCampusLegIndex);
      playbackCursorRef.current = cursor;
      setPlaybackCursor(cursor);
      if (studentRouteUi.camera === "follow" && !emergencyVideoPauseLatchRef.current
        && routeTransitionForStep(activeRoute, steps, Math.floor(cursor + 0.000001))) {
        transitionResumePlaybackRef.current = true;
        setNavigationPauseReason("transition");
        dispatchStudentRouteUi({ type: "PAUSE" });
      }
      return;
    }
    // Each canonical Campus leg gets its proportional share of the whole
    // outdoor journey pace. Do not restart a route-sized timer for every
    // context handoff: a short connector must stay short in both renderers.
    const campusJourneyDistance = (activeRoute.contextLegs ?? [])
      .filter((leg) => leg.kind === "campus")
      .reduce((sum, leg) => sum + (Number.isFinite(leg.distanceM) ? Math.max(0, leg.distanceM) : 0), 0)
      || outdoorWalkingDistance(activeRoute);
    const activeStepIndex = Math.max(0, Math.min(steps.length - 1, Math.floor(playbackCursorRef.current + 0.000001)));
    const activeStepDistance = steps[activeStepIndex]?.icon === "walk" ? steps[activeStepIndex]?.distanceM ?? 0 : 0;
    const activeCampusDistance = activeCampusLeg?.distanceM ?? 0;
    const campusLegDistance = activeCampusDistance > 0 ? activeCampusDistance : activeStepDistance;
    const duration = campusLegDistance > 0 && campusJourneyDistance > 0
      ? navigationWalkDuration(campusLegDistance, campusJourneyDistance, playbackSpeed)
      : guidedRouteProgressDuration(steps.length) / playbackSpeed;
    const start = performance.now();
    const remainingDuration = Math.max(1, duration * (1 - initialProgress));
    const tick = (now: number) => {
      const t = Math.min(1, initialProgress + (now - start) / remainingDuration * (1 - initialProgress));
      walkProgressRef.current = t;
      const cursor = studentRoutePositionForLeg(activeRoute, steps, "outdoor", null, t, playbackCursorRef.current, activeCampusLegIndex);
      const previousCursor = playbackCursorRef.current;
      playbackCursorRef.current = cursor;
      const crossedStepBoundary = Math.floor(cursor + 0.000001) !== Math.floor(previousCursor + 0.000001);
      // Canonical React state changes only when the human-facing step changes
      // or the leg finishes. The moving avatar/route segment is written into
      // stable SVG nodes below, so 2D Follow does not reconcile the full map
      // tree on every frame (the 3D renderer has always read this stable ref).
      if (crossedStepBoundary || t >= 1) {
        setWalkProgress(t);
        setPlaybackCursor(cursor);
      }
      const inspectedIndex = inspectedRouteStepIndexRef.current;
      const visualRouteProgress = studentRouteUi.camera === "explore" && inspectedIndex !== null
        ? routeProgressForStepIndex(steps, inspectedIndex)
        : t;
      outdoorRouteLineProgressWriterRef.current?.(visualRouteProgress);
      outdoorRouteMarkerProgressWriterRef.current?.(visualRouteProgress);
      if (!student3DActive && studentRouteUi.camera === "follow" && !followCameraDetached && !roomFocusAnimationRef.current) {
        const point = sampleOutdoorPoint(t);
        if (!point) return;
        followHumanWorldPointRef.current = point;
        const currentZoom = displayZoomRef.current;
        const nextZoom = currentZoom + (followZoomTargetRef.current - currentZoom) * 0.2;
        const targetPan = panForRouteFocusPoint(point, followCameraFocusRef.current, { x: viewCX, y: viewCY }, nextZoom);
        const currentPan = panRef.current;
        const nextPan = clampMapPan({ x: currentPan.x + (targetPan.x - currentPan.x) * 0.2, y: currentPan.y + (targetPan.y - currentPan.y) * 0.2 }, nextZoom);
        commitCameraFrameRef.current(nextPan, nextZoom);
      }
      if (t >= 1 && studentRouteUi.camera === "follow" && !emergencyVideoPauseLatchRef.current
        && routeTransitionForStep(activeRoute, steps, Math.floor(cursor + 0.000001))) {
        transitionResumePlaybackRef.current = true;
        setNavigationPauseReason("transition");
        dispatchStudentRouteUi({ type: "PAUSE" });
      }
      if (t < 1) walkAnimRef.current = requestAnimationFrame(tick);
    };
    walkAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(walkAnimRef.current ?? 0);
  }, [walkAnimationKey, walkNonce, reducedMotion, directionsMode, navigationTransitioning, navigationPhase, playbackSpeed, studentRouteUi.camera, studentRouteUi.phase, studentRouteUi.playback, followCameraDetached, clampMapPan, student3DActive, viewCX, viewCY]);
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
  const frameRouteView = useCallback((routeToFrame: PlannedRoute | null = route) => {
    if (student3DActive) return;
    if (!routeToFrame || routeToFrame.points.length === 0) return;
    const xs = routeToFrame.points.map(p => p.x);
    const ys = routeToFrame.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const routeW = maxX - minX, routeH = maxY - minY;
    const surface = mapContainerRef.current;
    const viewportRect = surface?.getBoundingClientRect();
    const viewportUnitsPerPixel = cameraScreenScaleRef.current || 1;
    const usableRect = surface ? studentMapFocusViewport(surface) : null;
    const availableWidth = usableRect ? Math.max(1, (usableRect.right - usableRect.left) * viewportUnitsPerPixel) : outdoorCanvasW;
    const availableHeight = usableRect ? Math.max(1, (usableRect.bottom - usableRect.top) * viewportUnitsPerPixel) : outdoorCanvasH;
    const focusCenter = usableRect && viewportRect
      ? focusViewPointFromScreen({
          x: (usableRect.left + usableRect.right) / 2,
          y: (usableRect.top + usableRect.bottom) / 2,
        }, { x: outdoorCanvasW / 2, y: outdoorCanvasH / 2 })
      : { x: outdoorCanvasW / 2, y: outdoorCanvasH / 2 };
    const centerX = focusCenter.x;
    const centerY = focusCenter.y;
    const fitZoom = Math.min(availableWidth / (routeW + 120), availableHeight / (routeH + 120), 2.0);
    const z = clampActiveStudentZoom(fitZoom);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const targetPan = clampMapPan({
      x: z * (centerX - midX),
      y: z * (centerY - midY),
    }, z);
    animateCameraTo(targetPan, z);
  }, [animateCameraTo, clampActiveStudentZoom, clampMapPan, focusViewPointFromScreen, route, outdoorCanvasW, outdoorCanvasH, student3DActive]);
  const frameCurrentRouteView = useCallback(() => {
    if (student3DActive) return;
    if (isFloorMode) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    frameRouteView();
  }, [frameRouteView, isFloorMode, student3DActive]);

  const focusRouteStartView = useCallback((
    point: { x: number; y: number },
    floorContext: boolean,
    source: "room-focus" | "route-inspection" | "route-preview" | "arrival" = "room-focus",
    onComplete?: () => void,
    forceRecenter3D = false,
    followOffset?: Student3dCameraOffset | null,
  ) => {
    if (student3DActive) {
      if (!forceRecenter3D) return;
      const contextKey = floorContext && floorView ? `${floorView.building.id}:${floorView.floor}` : "campus";
      requestCampus3DRecenter(contextKey, onComplete, followOffset);
      return;
    }
    const surface = mapContainerRef.current;
    const safe = surface ? studentMapFocusViewport(surface) : null;
    const target = safe ? focusViewPointFromScreen({
      x: (safe.left + safe.right) / 2,
      y: (safe.top + safe.bottom) / 2,
    }, { x: viewCX, y: viewCY }) : { x: viewCX, y: viewCY };
    const worldPoint = floorContext
      ? { x: point.x + floorViewport.offsetX, y: point.y + floorViewport.offsetY }
      : point;
    if (source === "room-focus") followHumanWorldPointRef.current = worldPoint;
    const nextZoom = clampActiveStudentZoom(Math.max(1.05, displayZoomRef.current));
    const nextPan = clampMapPan(panForRouteFocusPoint(worldPoint, target, { x: viewCX, y: viewCY }, nextZoom), nextZoom);
    animateCameraTo(nextPan, nextZoom, source, onComplete);
  }, [animateCameraTo, clampActiveStudentZoom, clampMapPan, floorView, floorViewport.offsetX, floorViewport.offsetY, focusViewPointFromScreen, requestCampus3DRecenter, student3DActive, viewCX, viewCY]);

  // Wait for the route sheet's measured height to settle before calculating
  // the visible map region. A fixed delay can focus against the middle of the
  // sheet's height animation and leave the route hidden behind it.
  const scheduleRouteStartFocusAfterPanelLayout = useCallback((point: { x: number; y: number }, floorContext: boolean, requireExpanded = false) => {
    if (routePreviewFocusFrameRef.current !== null) cancelAnimationFrame(routePreviewFocusFrameRef.current);
    let previousHeight = -1;
    let stableFrames = 0;
    const startedAt = performance.now();
    const measure = () => {
      const panel = document.querySelector<HTMLElement>("[data-testid='route-planner-dialog']");
      const height = panel?.getBoundingClientRect().height ?? 0;
      if (height > 0) {
        stableFrames = Math.abs(height - previousHeight) < 0.5 ? stableFrames + 1 : 0;
        previousHeight = height;
      }
      const expanded = !requireExpanded
        || window.innerWidth >= 768
        || panel?.getAttribute("data-mobile-sheet-state") === "expanded";
      const layoutStable = stableFrames >= 3 || performance.now() - startedAt >= 900;
      if (expanded && layoutStable) {
        routePreviewFocusFrameRef.current = null;
        focusRouteStartView(point, floorContext, "route-preview");
        return;
      }
      if (performance.now() - startedAt >= 1200) {
        routePreviewFocusFrameRef.current = null;
        return;
      }
      routePreviewFocusFrameRef.current = requestAnimationFrame(measure);
    };
    routePreviewFocusFrameRef.current = requestAnimationFrame(measure);
    return () => {
      if (routePreviewFocusFrameRef.current !== null) cancelAnimationFrame(routePreviewFocusFrameRef.current);
      routePreviewFocusFrameRef.current = null;
    };
  }, [focusRouteStartView]);

  // A room can be selected while its floor plan is still on screen. When the
  // user confirms a route whose origin is inside a building, zoom the floor
  // plan out first so the change of context is visible, then switch to the
  // campus route view.
  useEffect(() => {
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    navigationTransitionAnimRef.current = null;

    if (!navigationTransitioning || !isFloorMode || !route || navigationPhase !== "outdoor") return;

    cancelCameraAnimation();
    const cameraGeneration = cameraGenerationRef.current;
    const startZoom = zoomRef.current;
    const startPan = panRef.current;
    const targetZoom = 1;
    const duration = reducedMotion ? 0 : 650;
    const startedAt = performance.now();

    const finish = () => {
      const followOwnsCamera = studentRouteUiRef.current.camera === "follow";
      if (followOwnsCamera) setPan({ x: 0, y: 0 });
      setFloorView(null);
      setIndoorRoute(null);
      setActiveRouteRoom(null);
      setHighlightedRoom(null);
      setStairLoading(null);

      if (followOwnsCamera && route.points.length > 0) {
        if (platformSettingsReady && platformSettings.autoFocusRoute) frameRouteView();
      } else if (followOwnsCamera) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      setNavigationTransitioning(false);
    };

    // This animation only frames the SVG renderer. In 3D, complete the shared
    // context handoff immediately and leave camera ownership to the renderer.
    if (student3DActive) {
      finish();
      return;
    }

    if (duration === 0) {
      finish();
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const nextZoom = startZoom + (targetZoom - startZoom) * eased;
      const nextPan = {
        x: startPan.x * (1 - eased),
        y: startPan.y * (1 - eased),
      };
      // Apply the context-transition camera on the existing transform layer;
      // React only commits once when the floor/campus context changes.
      if (cameraGeneration === cameraGenerationRef.current) {
        commitCameraFrameRef.current(nextPan, nextZoom);
      }

      if (progress < 1) {
        navigationTransitionAnimRef.current = requestAnimationFrame(tick);
      } else {
        navigationTransitionAnimRef.current = null;
        finish();
      }
    };

    navigationTransitionAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
  }, [cancelCameraAnimation, navigationTransitioning, isFloorMode, navigationPhase, route, frameRouteView, reducedMotion, platformSettingsReady, platformSettings.autoFocusRoute, student3DActive, studentRouteUi.phase]);

  // When a route is computed (navigation starts), zoom in so BOTH the
  // starting point and the end point are in focus — the viewport centers
  // on the route midpoint and the whole route stays on screen.
  useEffect(() => {
    if (student3DActive) {
      setShowArrival(false);
      return;
    }
    if (emergencyRouteOverview) {
      setShowArrival(false);
      return;
    }
    if (studentRouteUi.phase === "navigating") return;
    // The final waypoint has its own arrival focus. A generic full-route fit
    // here would run after that focus and move the camera back toward the
    // building/stair instead of the actual destination.
    if (studentRouteUi.phase === "arrived") return;
    // Keep route preparation from pulling the camera away from the endpoint
    // the student just selected. On Start Navigation, the origin focus is
    // applied first and this flag prevents the generic full-route frame from
    // immediately replacing it.
    if (directionsMode) {
      setShowArrival(false);
      return;
    }
    if (routeStartFocusPendingRef.current) {
      routeStartFocusPendingRef.current = false;
      setShowArrival(false);
      const pendingFocus = pendingRouteStartFocusRef.current;
      pendingRouteStartFocusRef.current = null;
      if (pendingFocus) {
        return scheduleRouteStartFocusAfterPanelLayout(pendingFocus.point, pendingFocus.floor);
      }
      return;
    }
    // Room routes are previewed in the planner. Their campus framing is
    // applied by the transition above only after Navigate is confirmed.
    if (platformSettingsReady && platformSettings.autoFocusRoute && route && route.points.length > 0 && !route.destinationRoom) {
      frameRouteView();
      setShowArrival(false);
    } else {
      setShowArrival(false);
    }
  }, [directionsMode, emergencyRouteOverview, route, routeStartFocusPendingRef, frameRouteView, focusRouteStartView, scheduleRouteStartFocusAfterPanelLayout, platformSettingsReady, platformSettings.autoFocusRoute, reducedMotion, student3DActive, studentRouteUi.phase]);

  // ── Pan to selected building on click (smooth animated lerp) ──────
  useEffect(() => {
    const requestId = emergencyOverviewCameraRequestRef.current;
    if (!requestId || emergencyOverviewCameraFramedRef.current === requestId
      || !emergencyRouteOverview || !smartEmergencyRouteMode || student3DActive) return;
    if (!isFloorMode) {
      const points = approvedStudentEmergencyRoutes.flatMap((option) => {
        const legs = option.candidate.route.contextLegs?.filter((leg) => leg.kind === "campus" && leg.waypoints.length > 1);
        return legs?.length ? legs.flatMap((leg) => leg.waypoints)
          : option.candidate.route.campusPoints?.length ? option.candidate.route.campusPoints
            : option.candidate.route.points;
      });
      if (points.length < 2 || !route) return;
      emergencyOverviewCameraFramedRef.current = requestId;
      frameRouteView({ ...route, points });
      return;
    }
    if (!floorView) return;
    const points = approvedStudentEmergencyRoutes.flatMap((option) => {
      const segment = option.candidate.route.indoorSegments?.find((candidate) =>
        candidate.buildingId === floorView.building.id && candidate.floorNumber === floorView.floor,
      );
      return segment?.waypoints ?? [];
    });
    if (points.length < 2) return;
    emergencyOverviewCameraFramedRef.current = requestId;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const surface = mapContainerRef.current;
    const rect = surface?.getBoundingClientRect();
    const safe = surface ? studentMapFocusViewport(surface) : null;
    const viewportScale = cameraScreenScaleRef.current || 1;
    const availableWidth = safe ? Math.max(1, (safe.right - safe.left) * viewportScale) : floorViewport.width;
    const availableHeight = safe ? Math.max(1, (safe.bottom - safe.top) * viewportScale) : floorViewport.height;
    const focusCenter = safe && rect ? focusViewPointFromScreen({
      x: (safe.left + safe.right) / 2,
      y: (safe.top + safe.bottom) / 2,
    }, { x: viewCX, y: viewCY }) : { x: viewCX, y: viewCY };
    const worldMidX = (minX + maxX) / 2 + floorViewport.offsetX;
    const worldMidY = (minY + maxY) / 2 + floorViewport.offsetY;
    const fittedZoom = clampActiveStudentZoom(Math.min(
      availableWidth / (Math.max(1, maxX - minX) + 100),
      availableHeight / (Math.max(1, maxY - minY) + 100),
      1.65,
    ));
    animateCameraTo(clampMapPan({
      x: fittedZoom * (focusCenter.x - worldMidX),
      y: fittedZoom * (focusCenter.y - worldMidY),
    }, fittedZoom), fittedZoom);
  }, [activeCampus?.id, animateCameraTo, approvedStudentEmergencyRoutes, clampActiveStudentZoom, clampMapPan, emergencyRouteOverview, floorView, floorViewport, focusViewPointFromScreen, frameRouteView, isFloorMode, route, smartEmergencyRouteMode, student3DActive, viewCX, viewCY]);

  useLayoutEffect(() => {
    const isSearchFocus = Boolean(selected && searchFocusRef.current
      && searchFocusRef.current.buildingId === selected.id
      && !searchFocusRef.current.roomId);
    const isClickFocus = Boolean(selected && pendingBuildingClickFocusRef.current === selected.id);
    if (studentRouteFollowOwnsCamera({
      phase: studentRouteUi.phase,
      camera: studentRouteUi.camera,
      cameraDetached: followCameraDetached,
    })) {
      // A stale map selection from before route start must not replace Follow's
      // live marker framing when the canonical outdoor context is restored.
      if (isSearchFocus) searchFocusRef.current = null;
      if (isClickFocus) pendingBuildingClickFocusRef.current = null;
      return;
    }
    const surface = mapContainerRef.current;
    const mobile = (surface?.getBoundingClientRect().width ?? window.innerWidth) < 768;
    if (isClickFocus && mobile && !isSearchFocus) pendingBuildingClickFocusRef.current = null;
    if (!student3DActive && selected && !isFloorMode && (isSearchFocus || isClickFocus)
      && (!mobile || isSearchFocus)) {
      const isRouteEndpoint = directionsMode && (fromBuilding?.id === selected.id || toBuilding?.id === selected.id);
      if (isRouteEndpoint) {
        if (isClickFocus) pendingBuildingClickFocusRef.current = null;
        return;
      }
      const pos = B_POS[selected.id];
      if (!pos || !surface) return;
      const cx = pos.x + pos.w / 2;
      const cy = pos.y + pos.h / 2;
      const currentZoom = zoomRef.current;
      const targetZoom = clampActiveStudentZoom(Math.max(currentZoom, 1.65));
      let targetPan: Pt;
      if (mobile) {
        const mapRect = surface.getBoundingClientRect();
        targetPan = clampMapPan(getBuildingFocusPan({
          buildingCenter: { x: cx, y: cy }, canvasW: outdoorCanvasW, canvasH: outdoorCanvasH,
          zoom: targetZoom, mapWidth: mapRect.width, mapHeight: mapRect.height, isMobile: true,
        }), targetZoom);
      } else {
        const visible = studentMapFocusViewport(surface);
        const focusPoint = focusViewPointFromScreen({
          x: (visible.left + visible.right) / 2,
          y: (visible.top + visible.bottom) / 2,
        }, { x: viewCX, y: viewCY });
        targetPan = clampMapPan(panForRouteFocusPoint(
          { x: cx, y: cy }, focusPoint, { x: viewCX, y: viewCY }, targetZoom,
        ), targetZoom);
      }
      animateCameraTo(targetPan, targetZoom);
      if (isSearchFocus) searchFocusRef.current = null;
      if (isClickFocus) pendingBuildingClickFocusRef.current = null;
    }
  }, [animateCameraTo, clampActiveStudentZoom, clampMapPan, directionsMode, focusViewPointFromScreen, fromBuilding?.id, selected?.id, B_POS, followCameraDetached, isFloorMode, outdoorCanvasH, outdoorCanvasW, searchFocusNonce, student3DActive, studentRouteUi.camera, studentRouteUi.phase, toBuilding?.id, viewCX, viewCY]);

  useLayoutEffect(() => {
    const target = searchFocusRef.current;
    const isRouteEndpointFocus = Boolean(directionsMode
      && !isFloorMode
      && target?.buildingId
      && !target.roomId
      && (fromBuilding?.id === target.buildingId || toBuilding?.id === target.buildingId));
    if (student3DActive || !isRouteEndpointFocus || !target?.buildingId) return;
    const position = B_POS[target.buildingId];
    const surface = mapContainerRef.current;
    const svg = svgRef.current;
    const surfaceRect = surface?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    if (!position || !surface || !surfaceRect || !svgRect || svgRect.width <= 0 || svgRect.height <= 0) return;

    const mapScale = Math.min(svgRect.width / outdoorCanvasW, svgRect.height / outdoorCanvasH);
    if (!Number.isFinite(mapScale) || mapScale <= 0) return;
    const viewportOffset = {
      x: Math.max(0, (svgRect.width - outdoorCanvasW * mapScale) / (2 * mapScale)),
      y: Math.max(0, (svgRect.height - outdoorCanvasH * mapScale) / (2 * mapScale)),
    };
    const safePx = { left: 12, right: 12, top: 12, bottom: 12 };
    const plannerRect = surface.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")?.getBoundingClientRect()
      ?? document.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")?.getBoundingClientRect();
    if (plannerRect && plannerRect.width > 0 && plannerRect.height > 0) {
      const mobileMap = surfaceRect.width < 768;
      if (mobileMap && plannerRect.width >= surfaceRect.width * 0.72) {
        safePx.bottom = Math.max(safePx.bottom, surfaceRect.bottom - plannerRect.top + 12);
      } else if (!mobileMap && plannerRect.left <= surfaceRect.left + 24) {
        safePx.left = Math.max(safePx.left, plannerRect.right - surfaceRect.left + 12);
      }
    }
    const focus = getStudentRoomFocusCamera({
      mapWidth: outdoorCanvasW,
      mapHeight: outdoorCanvasH,
      roomBounds: { x: position.x, y: position.y, width: position.w, height: position.h },
      currentPan: panRef.current,
      zoom: zoomRef.current,
      maxZoom: activeMapZoomMaxRef.current,
      insets: {
        left: safePx.left / mapScale,
        right: safePx.right / mapScale,
        top: safePx.top / mapScale,
        bottom: safePx.bottom / mapScale,
      },
      viewportOffset,
    });
    if (focus.shouldMove) animateCameraTo(focus.pan, focus.zoom, "room-focus");
    searchFocusRef.current = null;
  }, [activeCampus, animateCameraTo, B_POS, directionsMode, fromBuilding?.id, isFloorMode, outdoorCanvasH, outdoorCanvasW, searchFocusNonce, student3DActive, toBuilding?.id]);

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
      && Boolean(toBuilding)
      && !student3DActive;
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
      maxZoom: activeMapZoomMaxRef.current,
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
  }, [animateCameraTo, B_POS, cancelCameraAnimation, clampMapPan, directionsMode, isFloorMode, navigationPhase, navigationTransitioning, outdoorCanvasH, outdoorCanvasW, roomDestination, student3DActive, toBuilding]);

  useEffect(() => {
    const target = searchFocusRef.current;
    if (!target?.campusPlaceId || isFloorMode || student3DActive) return;
    if (studentRouteFollowOwnsCamera({
      phase: studentRouteUi.phase,
      camera: studentRouteUi.camera,
      cameraDetached: followCameraDetached,
    })) {
      searchFocusRef.current = null;
      return;
    }
    const place = selectedCampusPlace?.id === target.campusPlaceId
      ? selectedCampusPlace
      : directionsMode && (fromCampusPlace?.campusPlaceId === target.campusPlaceId || toCampusPlace?.campusPlaceId === target.campusPlaceId)
        ? campusPlaceEntity(activeCampus, target.campusPlaceId)
        : null;
    if (!place) return;
    const mapRect = mapContainerRef.current?.getBoundingClientRect();
    if (!mapRect) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const plannerRect = mapContainerRef.current?.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")?.getBoundingClientRect();
    const leftInset = !isMobile && plannerRect && plannerRect.left <= mapRect.left + 24
      ? plannerRect.right - mapRect.left + 16
      : 20;
    const rightEdge = mapRect.width - 20;
    const usableWidth = Math.max(120, rightEdge - leftInset);
    const currentZoom = zoomRef.current;
    const screenX = viewCX * (1 - currentZoom) + panRef.current.x + place.x * currentZoom;
    const screenY = viewCY * (1 - currentZoom) + panRef.current.y + place.y * currentZoom;
    const minY = isMobile ? 84 : 24;
    const maxY = plannerRect && isMobile ? Math.max(minY + 40, plannerRect.top - mapRect.top - 16) : mapRect.height - 24;
    if (screenX >= leftInset && screenX <= rightEdge && screenY >= minY && screenY <= maxY) {
      searchFocusRef.current = null;
      return;
    }
    const nextPan = clampMapPan({
      x: leftInset + usableWidth * 0.5 - viewCX * (1 - currentZoom) - place.x * currentZoom,
      y: Math.max(minY + 20, maxY * 0.5) - viewCY * (1 - currentZoom) - place.y * currentZoom,
    }, currentZoom);
    animateCameraTo(nextPan, currentZoom);
    searchFocusRef.current = null;
  }, [activeCampus, directionsMode, fromCampusPlace?.campusPlaceId, selectedCampusPlace, searchFocusNonce, isFloorMode, student3DActive, studentRouteUi.camera, studentRouteUi.phase, followCameraDetached, toCampusPlace?.campusPlaceId, viewCX, viewCY, clampMapPan, animateCameraTo]);

  // Room focus is shared by direct taps and search selection. Measure the
  // visible overlays after they commit, then pan only if the actual room shape
  // is outside that safe viewport. Keep current zoom and soft floor bounds.
  useLayoutEffect(() => {
    if (student3DActive) {
      if (arrivalCameraTarget
        && (studentRouteUi.phase === "arrived" || directionsMode && completedRouteEditSnapshotRef.current)) {
        lastRoomFocusKeyRef.current = null;
      }
      return;
    }
    if (studentRouteFollowOwnsCamera({
      phase: studentRouteUi.phase,
      camera: studentRouteUi.camera,
      cameraDetached: followCameraDetached,
    })) {
      // Floor room selection is presentation state. During attached Follow,
      // the canonical route cursor owns this camera, including on recovery.
      searchFocusRef.current = null;
      lastRoomFocusKeyRef.current = null;
      return;
    }
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
    const arrivalMatchesFloor = Boolean(
      arrivalCameraTarget
      && (studentRouteUi.phase === "arrived" || directionsMode && completedRouteEditSnapshotRef.current)
      && arrivalCameraTarget.context === "floor"
      && arrivalCameraTarget.buildingId === floorView.building.id
      && arrivalCameraTarget.floorNumber === floorView.floor,
    );
    if (!searchMatchesFloor && !contextMatchesFloor && !destinationMatchesFloor && !arrivalMatchesFloor) {
      lastRoomFocusKeyRef.current = null;
      if (roomFocusAnimationRef.current) cancelCameraAnimation();
      return;
    }
    // An explicit tap/search focus is stronger than the pre-existing route
    // endpoint. Inspecting a room must not snap the camera back to the old
    // destination just because the planner remains open.
    const roomId = arrivalMatchesFloor
      ? arrivalCameraTarget?.roomId
      : studentRoomFocusTargetId(
          searchMatchesFloor ? searchTarget?.roomId : null,
          contextMatchesFloor ? selectedRoomContext?.roomId : null,
          destinationMatchesFloor ? roomDestination?.roomId : null,
        ) ?? undefined;
    if (!roomId) return;
    const room = activeFloorPlan.rooms.find((candidate) => candidate.id === roomId);
    if (!room) return;
    if (!arrivalMatchesFloor && !interactiveFloorRoomIds.has(roomId)) {
      if (searchMatchesFloor) searchFocusRef.current = null;
      lastRoomFocusKeyRef.current = null;
      return;
    }
    // Opening the planner changes the room's safe viewport even if the same
    // room was focused moments earlier from its selection card.
    const focusKey = `${floorView.building.id}:${floorView.floor}:${room.id}:${arrivalMatchesFloor ? "arrival" : directionsMode ? "planner" : "map"}:${studentRouteUi.collapsed ? "compact" : "expanded"}`;
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
    const utilityRect = getRect(".student-map-utility-stack");
    const mobileMap = surfaceRect.width < 768;

    if (headerRect && overlapsMapX(headerRect)) {
      safePx.top = Math.max(safePx.top, headerRect.bottom - mapRect.top + 12);
    }
    if (cardRect && overlapsMapX(cardRect)) {
      if (mobileMap) {
        // On mobile the room card is a bottom sheet. Keep the focus region
        // above its top edge; treating its bottom edge as a top inset pushes
        // the selected room down underneath the sheet.
        if (cardRect.top > (mapRect.top + mapRect.bottom) / 2) {
          safePx.bottom = Math.max(safePx.bottom, mapRect.bottom - cardRect.top + 12);
        } else {
          safePx.top = Math.max(safePx.top, cardRect.bottom - mapRect.top + 12);
        }
      } else if (cardRect.width >= (mapRect.right - mapRect.left) * 0.55) {
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
      maxZoom: activeMapZoomMaxRef.current,
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
      animateCameraTo(clampMapPan(focus.pan, focus.zoom), focus.zoom, arrivalMatchesFloor ? "arrival" : "room-focus");
    } else if (roomFocusAnimationRef.current) {
      // A newly selected room is already safe at the live camera position, so
      // stop the previous room's unfinished focus instead of finishing stale motion.
      cancelCameraAnimation();
    }
    if (searchMatchesFloor) searchFocusRef.current = null;
  }, [activeFloorPlan, animateCameraTo, arrivalCameraTarget, cancelCameraAnimation, clampMapPan, directionsMode, followCameraDetached, floorView, floorViewport, interactiveFloorRoomIds, isFloorMode, navigationPhase, navigationTransitioning, roomDestination?.buildingId, roomDestination?.floorNumber, roomDestination?.roomId, searchFocusNonce, selectedRoomContext?.buildingId, selectedRoomContext?.floorNumber, selectedRoomContext?.roomId, student3DActive, studentRouteUi.camera, studentRouteUi.collapsed, studentRouteUi.phase, viewportCanvasH, viewportCanvasW]);

  const selectBuilding = useCallback((b: Building|null) => {
    cancelCameraAnimation();
    setShowBuildingDetailsDuringRoutePlanner(Boolean(b && directionsMode));
    if (b?.id !== selected?.id) pendingBuildingClickFocusRef.current = b?.id ?? null;
    setMobileBuildingSheetState("default");
    setSelectedCampusPlaceId(null);
    setSelected(b);
    // A closed building card clears the selection; do not leave its previous
    // search result as a hidden 3D camera target for the next Recenter.
    if (!b) searchFocusRef.current = null;
    setSearchFocused(false); setSearch(""); setShowQR(false);
    if (b) {
      if (!recentSearches.includes(b.name))
        setRecentSearches(prev => [b.name, ...prev].slice(0, 5));
      saveLastViewed({ buildingId: b.id, zoom });
    }
  }, [cancelCameraAnimation, directionsMode, recentSearches, selected?.id, zoom]);

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
    if (!routeModeTouchedRef.current) setMapMode(platformSettings.defaultRouteMode);
  }, [directionsMode, platformSettings.defaultRouteMode]);

  /** Open the route planner as the only active mobile map sheet. */
  const openDirections = useCallback(() => {
    prepareFreshRoutePlannerMode();
    setQrRouteStartNotice(null);
    setSelected(null);
    setSelectedCampusPlaceId(null);
    setShowQR(false);
    setSearch("");
    setSearchFocused(false);
    setRoutePlannerEndpoint(null);
    setRoutePlannerMapPick(null);
    setRoutePlannerSelectionError(null);
    if (!directionsMode) setUseMyLocation(Boolean(youAreHere));
    dispatchStudentRouteUi({ type: "OPEN_PLAN" });
    setDirectionsMode(true);
  }, [directionsMode, prepareFreshRoutePlannerMode, youAreHere]);

  const handleSelectSearchResult = useCallback((item: SearchResult) => {
    usageAnalyticsService.track("search", item.name);
    const routeContextAction = prepareRouteForContextInspection();
    if (routeContextAction === "blocked") return;
    if (item.campusPlaceId) {
      const place = campusPlaceEntity(activeCampus, item.campusPlaceId);
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
      let selectedRoom: RoomDest | null = null;
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
        const publishedRoom = publishedFloor.rooms.find((room) => room.id === item.id);
        const roomBuilding = MOCK_BUILDINGS.find((building) => building.id === item.buildingId);
        if (publishedRoom && roomBuilding) {
          selectedRoom = {
            type: "room",
            buildingId: campusBuilding.id,
            floorNumber: publishedFloor.number,
            roomId: publishedRoom.id,
            roomName: publishedRoom.name || item.name,
            buildingLabel: roomBuilding.name,
            buildingCode: roomBuilding.code,
            floorLabel: publishedFloor.label,
            accessNodeId: publishedRoom.accessNodeId,
            accessDoorId: publishedRoom.accessDoorId,
            accessDoorIds: publishedRoom.accessDoorIds,
          };
        }
      }
      const b = MOCK_BUILDINGS.find((building) => building.id === item.buildingId);
      if (b) {
        searchFocusRef.current = selectedRoom
          ? { buildingId: b.id, roomId: selectedRoom.roomId, floorNumber: selectedRoom.floorNumber }
          : { buildingId: b.id };
        if (selectedRoom) lastRoomFocusKeyRef.current = null;
        // Inspecting a search result during Preview/Follow must not discard the
        // canonical route or its endpoint. Outside navigation, a room search
        // remains a passive selection and clears only the stale room preview.
        if (!route || studentRouteUi.phase === "idle") {
          setRoomDestination(null);
          setIndoorRoute(null);
        }
        selectBuilding(b);
        if (item.floorNumber !== undefined) {
          setFloorView({ building: b, floor: item.floorNumber });
        } else {
          setFloorView({ building: b, floor: 1 });
        }
        setSelectedRoomContext(selectedRoom);
        setHighlightedRoom(selectedRoom?.roomId ?? null);
        setSearchFocusNonce((nonce) => nonce + 1);
      }
    }
    setSearch(item.name);
    dismissSearch();
  }, [activeCampus, MOCK_BUILDINGS, dismissSearch, navigableRoomKeys, prepareRouteForContextInspection, route, selectBuilding, selectCampusPlace, studentRouteUi.phase]);

  useEffect(() => {
    if (!pendingRoomLink || !activeCampus) return;
    const { buildingId, floorId, roomId } = pendingRoomLink;
    setPendingRoomLink(null);
    const campusBuilding = activeCampus.buildings.find((candidate) => candidate.id === buildingId);
    const floor = campusBuilding?.floors.find((candidate) => candidate.id === floorId)
      ?? campusBuilding?.floors.find((candidate) => candidate.rooms?.some((room) => room.id === roomId));
    const room = floor?.rooms?.find((candidate) => candidate.id === roomId);
    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === buildingId);
    if (!campusBuilding || !floor || !room || !building) {
      if (building) handleSelectSearchResult({ id: building.id, name: building.name, kind: "building", buildingId: building.id, accessible: false, keywords: [] });
      return;
    }
    if (navigableRoomKeys.has(authoredRoomNavigationKey(campusBuilding.id, floor.id, room.id))) {
      handleSelectSearchResult({
        id: room.id,
        name: room.name,
        kind: "room",
        buildingId: campusBuilding.id,
        buildingName: building.name,
        floorId: floor.id,
        floorNumber: floor.number,
        floorLabel: floor.label,
        accessible: false,
        keywords: [],
      });
      return;
    }
    // Rooms outside the navigation graph can't be selected like search
    // results; still open their building on the right floor.
    handleSelectSearchResult({ id: building.id, name: building.name, kind: "building", buildingId: building.id, accessible: false, keywords: [] });
    setFloorView({ building, floor: floor.number });
  }, [pendingRoomLink, activeCampus, MOCK_BUILDINGS, handleSelectSearchResult, navigableRoomKeys]);

  const startDirectionsTo = useCallback((b: Building) => {
    setShowBuildingDetailsDuringRoutePlanner(false);
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
  const indoorWalkProgressRef = useRef(0);
  const indoorRouteLineProgressWriterRef = useRef<((progress: number) => void) | null>(null);
  const indoorRouteMarkerProgressWriterRef = useRef<((progress: number) => void) | null>(null);
  const [indoorWalkNonce, setIndoorWalkNonce] = useState(0);
  const indoorWalkSegmentKeyRef = useRef<string | null>(null);
  // Continue the journey inside the destination floor after the outdoor
  // walking animation has handed off to the floor plan.
  useEffect(() => {
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    indoorWalkAnimRef.current = null;

    const canonicalIndoorSegment = navigationPhase === "origin-indoor"
      ? originIndoorSegments[originIndoorSegmentIndex]
      : navigationPhase === "destination-indoor"
        ? destinationIndoorSegments[destinationIndoorSegmentIndex]
        : undefined;
    const preserveCanonicalIndoorProgress = Boolean(route
      && studentRouteUi.phase === "navigating"
      && canonicalIndoorSegment);
    if ((!isFloorMode && studentRouteUi.camera !== "explore") || !indoorRoute || indoorRoute.waypoints.length === 0) {
      // Leaving the floor is a view change, not an indoor route reset. Keep
      // the ref-driven progress while the active canonical segment is hidden;
      // Resume uses it to reacquire the same point on the correct floor.
      if (!preserveCanonicalIndoorProgress) {
        indoorWalkProgressRef.current = 0;
        setIndoorWalkProgress(0);
      }
      return;
    }

    const segmentKey = `${indoorWalkNonce}:${indoorRoute.waypoints[0]?.x}:${indoorRoute.waypoints[0]?.y}:${indoorRoute.waypoints.at(-1)?.x}:${indoorRoute.waypoints.at(-1)?.y}`;
    if (indoorWalkSegmentKeyRef.current !== segmentKey) {
      indoorWalkSegmentKeyRef.current = segmentKey;
      indoorWalkProgressRef.current = 0;
      setIndoorWalkProgress(0);
    }
    if (pendingTransitionSeekRef.current) return;
    if (studentRouteUi.phase !== "navigating" || studentRouteUi.playback !== "playing") return;

    const activePlaybackSteps = route ? studentFacingRouteSteps(route) : [];
    const sampleIndoorPoint = createRoutePointSampler(indoorRoute.waypoints);
    const sampledIndoorPoint = { x: 0, y: 0 };

    const syncRouteCursor = (progress: number) => {
      const activeSegment = navigationPhase === "origin-indoor"
        ? originIndoorSegments[originIndoorSegmentIndex]
        : destinationIndoorSegments[destinationIndoorSegmentIndex];
      if (!route || !activeSegment) return null;
      const currentStepTarget = studentRouteSeekTarget(route, activePlaybackSteps,
        Math.floor(playbackCursorRef.current + 0.000001));
      const contextLegIndex = currentStepTarget.segment === activeSegment ? currentStepTarget.contextLegIndex : undefined;
      const cursor = studentRoutePositionForLeg(route, activePlaybackSteps, navigationPhase, activeSegment, progress, playbackCursorRef.current, contextLegIndex);
      const previousCursor = playbackCursorRef.current;
      playbackCursorRef.current = cursor;
      const crossedStepBoundary = Math.floor(cursor + 0.000001) !== Math.floor(previousCursor + 0.000001);
      if (crossedStepBoundary || progress >= 1) {
        setPlaybackCursor(cursor);
        // Keep 3D interpolation ref-driven during the leg, but commit the
        // endpoint once so the canonical arrival resolver observes completion.
        if (!student3DActive || progress >= 1) setIndoorWalkProgress(progress);
      }
      if (studentRouteUi.camera !== "explore") {
        indoorRouteLineProgressWriterRef.current?.(progress);
        indoorRouteMarkerProgressWriterRef.current?.(progress);
      }
      if (!student3DActive && studentRouteUi.camera === "follow" && !followCameraDetached && !roomFocusAnimationRef.current) {
        const point = sampleIndoorPoint(progress, sampledIndoorPoint);
        if (!point) return null;
        const worldPoint = { x: point.x + floorViewport.offsetX, y: point.y + floorViewport.offsetY };
        followHumanWorldPointRef.current = worldPoint;
        const currentZoom = displayZoomRef.current;
        const nextZoom = currentZoom + (followZoomTargetRef.current - currentZoom) * 0.2;
        const targetPan = panForRouteFocusPoint(worldPoint, followCameraFocusRef.current, { x: viewCX, y: viewCY }, nextZoom);
        const currentPan = panRef.current;
        const nextPan = clampMapPan({ x: currentPan.x + (targetPan.x - currentPan.x) * 0.2, y: currentPan.y + (targetPan.y - currentPan.y) * 0.2 }, nextZoom);
        commitCameraFrameRef.current(nextPan, nextZoom);
      }
      if (progress >= 1 && studentRouteUi.camera === "follow" && !emergencyVideoPauseLatchRef.current
        && routeTransitionForStep(route, activePlaybackSteps, Math.floor(cursor + 0.000001))) {
        transitionResumePlaybackRef.current = true;
        setNavigationPauseReason("transition");
        dispatchStudentRouteUi({ type: "PAUSE" });
      }
      return cursor;
    };

    if (indoorRoute.waypoints.length <= 1) {
      indoorWalkProgressRef.current = 1;
      setIndoorWalkProgress(1);
      syncRouteCursor(1);
      return;
    }

    const initialProgress = Math.max(0, Math.min(0.999, indoorWalkProgressRef.current));
    syncRouteCursor(initialProgress);
    // Indoor route segments use the same distance-proportional pacing as
    // Campus legs. Their existing geometry is sampled as one continuous leg,
    // so authored bends do not each incur a separate minimum delay.
    const indoorJourneyDistance = (route?.indoorSegments ?? [])
      .filter((segment) => Boolean(segment.afterOutdoor) === (navigationPhase === "destination-indoor"))
      .reduce((sum, segment) => sum + (Number.isFinite(segment.distanceM) ? Math.max(0, segment.distanceM) : 0), 0);
    const duration = indoorRoute.distanceMeters > 0 && indoorJourneyDistance > 0
      ? navigationWalkDuration(indoorRoute.distanceMeters, indoorJourneyDistance, playbackSpeed)
      : guidedRouteProgressDuration(indoorRoute.steps.length || activePlaybackSteps.length || 1) / playbackSpeed;
    const indoorGeometryDistance = indoorRoute.waypoints.slice(1).reduce((distance, point, index) => {
      const previous = indoorRoute.waypoints[index]!;
      return distance + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
    const playbackDuration = reducedMotion
      ? reducedMotionWalkingDuration(duration, indoorGeometryDistance)
      : duration;
    if (indoorGeometryDistance <= 0.1 || playbackDuration <= 0) {
      indoorWalkProgressRef.current = 1;
      setIndoorWalkProgress(1);
      syncRouteCursor(1);
      return;
    }
    const start = performance.now();
    const remainingDuration = Math.max(1, playbackDuration * (1 - initialProgress));
    const tick = (now: number) => {
      const progress = Math.min(1, initialProgress + (now - start) / remainingDuration * (1 - initialProgress));
      indoorWalkProgressRef.current = progress;
      syncRouteCursor(progress);
      if (progress < 1) indoorWalkAnimRef.current = requestAnimationFrame(tick);
    };
    indoorWalkAnimRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
  }, [isFloorMode, indoorRoute, indoorWalkNonce, reducedMotion, route, navigationPhase, originIndoorSegments, originIndoorSegmentIndex, destinationIndoorSegments, destinationIndoorSegmentIndex, playbackSpeed, studentRouteUi.phase, studentRouteUi.playback, studentRouteUi.camera, followCameraDetached, floorViewport.offsetX, floorViewport.offsetY, clampMapPan, student3DActive, viewCX, viewCY]);

  // Finish every authored source-building floor leg before handing off to the
  // campus. Otherwise an upper-floor origin jumps outdoors after its first leg.
  useEffect(() => {
    if (!platformSettingsReady || studentRouteUi.phase !== "navigating"
      || navigationPhase !== "origin-indoor" || indoorWalkProgress < 1 || !route || !roomOrigin) return;
    const steps = studentFacingRouteSteps(route);
    const activeIndex = Math.floor(playbackCursorRef.current + 0.000001);
    const transitionAuthorized = routeTransitionActivationRef.current === activeIndex;
    if (studentRouteUi.playback !== "playing" && !transitionAuthorized) return;
    const nextStepIndex = Math.min(steps.length - 1, activeIndex + 1);
    const canonicalNext = studentRouteSeekTarget(route, steps, nextStepIndex);
    const nextSegment = canonicalNext.context === "floor" && canonicalNext.phase === "origin-indoor"
      ? canonicalNext.segment
      : null;
    const nextIndex = nextSegment ? originIndoorSegments.indexOf(nextSegment) : -1;
    if (nextSegment && nextIndex > originIndoorSegmentIndex) {
      if (originIndoorTransitionRef.current) return;
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === roomOrigin.buildingId);
      if (!building) return;
      const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === roomOrigin.buildingId);
      const currentSegment = originIndoorSegments[originIndoorSegmentIndex];
      const currentFloor = indoorSegmentFloorNumber(currentSegment, campusBuilding, roomOrigin.floorNumber);
      const nextFloor = indoorSegmentFloorNumber(nextSegment, campusBuilding, roomOrigin.floorNumber);
      if (nextFloor === undefined) return;
      const floorChanges = nextFloor !== currentFloor;
      const routeTransition = routeTransitionForStep(route, steps, activeIndex);
      let transition = routeTransition?.detail;
      if (floorChanges) {
        // Vertical movement is never guessed. The exact route step must own
        // an authored elevator/stair connection between these two Floors,
        // and the student must activate it before the context can change.
        if ((routeTransition?.kind !== "stairs" && routeTransition?.kind !== "elevator")
          || !transition
          || transition.kind !== routeTransition.kind
          || transition.fromFloorId && currentSegment?.floorId && transition.fromFloorId !== currentSegment.floorId
          || transition.toFloorId && transition.toFloorId !== nextSegment.floorId
          || currentSegment?.buildingId !== nextSegment.buildingId
          || !transitionAuthorized) return;
        routeTransitionActivationRef.current = null;
      }
      const kind = transition?.kind;
      if (floorChanges && canonicalNext.segment !== nextSegment) return;
      const direction = nextFloor >= (currentFloor ?? nextFloor) ? "up" : "down";
      const label = studentRouteFloorLabel(nextSegment, nextFloor === 1 ? "Ground Floor" : `Floor ${nextFloor}`);
      const pauseAtZeroWalkAccess = studentRouteShouldPauseAtZeroWalkVerticalAccess(
        route, steps, nextStepIndex, autoVerticalTraversalSharedIdRef.current,
      );
      if (pauseAtZeroWalkAccess) autoVerticalTraversalSharedIdRef.current = null;
      const advance = () => {
        originIndoorTransitionRef.current = null;
        if (routeRef.current !== route || studentRouteUiRef.current.phase !== "navigating") return;
        floorShiftDirectionRef.current = direction;
        setOriginIndoorSegmentIndex(nextIndex);
        setFloorView({ building, floor: nextFloor });
        setHighlightedRoom(null);
        setIndoorRoute(indoorRouteFromSegment(nextSegment));
        setIndoorWalkProgress(0);
        playbackCursorRef.current = nextStepIndex;
        setPlaybackCursor(nextStepIndex);
        setIndoorWalkNonce((nonce) => nonce + 1);
        setStairLoading(null);
        setNavigationTransitioning(false);
        if (verticalRunEndsAfterTransitionRef.current) {
          verticalRunEndsAfterTransitionRef.current = false;
          autoVerticalTraversalSharedIdRef.current = null;
        }
        if (pauseAfterVerticalTransitionRef.current) {
          pauseAfterVerticalTransitionRef.current = false;
          setVerticalRunPausePending(false);
          transitionResumePlaybackRef.current = false;
          setNavigationPauseReason("manual");
          dispatchStudentRouteUi({ type: "PAUSE" });
        } else if (transitionResumePlaybackRef.current) {
          const canResume = studentRouteCanResumeAfterTransition(
            transitionResumePlaybackRef.current,
            emergencyVideoPauseLatchRef.current,
          );
          transitionResumePlaybackRef.current = false;
          if (!canResume) {
            setNavigationPauseReason("manual");
          } else if (pauseAtZeroWalkAccess) {
            setNavigationPauseReason("transition");
          } else {
            setNavigationPauseReason(null);
            dispatchStudentRouteUi({ type: "RESUME" });
          }
        }
      };
      if (!floorChanges) {
        advance();
        return;
      }
      const transitionName = transition?.label.trim() || kind || "vertical connection";
      const currentFloorLabel = studentRouteFloorLabel(currentSegment, currentFloor === 1 ? "Ground Floor" : `Floor ${currentFloor}`);
      setNavigationTransitioning(true);
      setStairLoading({ dir: direction, label: `${label} via ${transitionName}`, fromFloorLabel: currentFloorLabel, toFloorLabel: label, transitionName });
      originIndoorTransitionRef.current = setTimeout(advance, 700);
      return () => {
        if (routeRef.current === route && studentRouteUiRef.current.phase === "navigating") return;
        if (originIndoorTransitionRef.current) {
          clearTimeout(originIndoorTransitionRef.current);
          originIndoorTransitionRef.current = null;
        }
      };
    }
    const exitTransition = routeTransitionForStep(route, steps, activeIndex);
    const exitStepIndex = activeIndex;
    if (exitTransition?.kind === "exit_building") {
      // A physical exit remains pending even when the outdoor route is a
      // single point or immediately reaches its final step. Do not let the
      // short-route completion fallback clear the indoor context before the
      // student can authorize this authored Floor → Campus handoff.
      if (!transitionAuthorized) return;
      routeTransitionActivationRef.current = null;
      const exitLabel = steps[exitStepIndex]?.instruction ?? "Exit to Campus";
      const finishExit = () => {
        originIndoorTransitionRef.current = null;
        if (routeRef.current !== route || studentRouteUiRef.current.phase !== "navigating") return;
        const nextTarget = studentRouteSeekTarget(route, steps, Math.min(steps.length - 1, exitStepIndex + 1));
        const nextLeg = nextTarget.contextLegIndex === undefined ? undefined : route.contextLegs?.[nextTarget.contextLegIndex];
        const startPoint = nextLeg?.waypoints[0] ?? route.campusPoints?.[0] ?? route.points[0];
        if (startPoint) pendingRouteRecenterRef.current = { contextKey: "campus", point: startPoint, floor: false };
        setFloorView(null);
        setNavigationPhase("outdoor");
        setIndoorRoute(null);
        floorShiftDirectionRef.current = null;
        setWalkProgress(0);
        walkProgressRef.current = 0;
        const nextStepIndex = Math.min(steps.length - 1, exitStepIndex + 1);
        playbackCursorRef.current = nextStepIndex;
        setPlaybackCursor(nextStepIndex);
        setWalkNonce((nonce) => nonce + 1);
        setNavigationTransitioning(false);
        setStairLoading(null);
        if (transitionResumePlaybackRef.current) {
          const canResume = studentRouteCanResumeAfterTransition(
            transitionResumePlaybackRef.current,
            emergencyVideoPauseLatchRef.current,
          );
          transitionResumePlaybackRef.current = false;
          if (canResume) {
            setNavigationPauseReason(null);
            dispatchStudentRouteUi({ type: "RESUME" });
          } else {
            setNavigationPauseReason("manual");
          }
        }
      };
      if (reducedMotion) {
        finishExit();
        return;
      }
      setNavigationTransitioning(true);
      setStairLoading({ dir: "down", label: exitLabel });
      originIndoorTransitionRef.current = setTimeout(finishExit, 420);
      return () => {
        if (routeRef.current === route && studentRouteUiRef.current.phase === "navigating") return;
        if (originIndoorTransitionRef.current) {
          clearTimeout(originIndoorTransitionRef.current);
          originIndoorTransitionRef.current = null;
        }
      };
    }
    if (route.points.length < 2 && !route.emergencyDestinationLabel) {
      setNavigationPhase("idle");
    }
  }, [navigationPhase, indoorWalkProgress, route, roomOrigin, originIndoorSegments, originIndoorSegmentIndex, MOCK_BUILDINGS, activeCampus, reducedMotion, platformSettingsReady, studentRouteUi.phase, studentRouteUi.playback, routeTransitionActivationNonce]);

  // A destination-room route may contain multiple floor-local segments in
  // the destination building. Do not jump from the outdoor entrance directly
  // to the target floor: finish the current segment, show the authored stair
  // or elevator transition, then mount the next floor segment.
  useEffect(() => {
    const destination = route?.destinationRoom;
    if (
      !platformSettingsReady
      || studentRouteUi.phase !== "navigating"
      || navigationPhase !== "destination-indoor"
      || indoorWalkProgress < 1
      || !route
      || !destination
      || destinationIndoorSegmentIndex < 0
    ) return;
    const steps = studentFacingRouteSteps(route);
    const activeIndex = Math.floor(playbackCursorRef.current + 0.000001);
    const transitionAuthorized = routeTransitionActivationRef.current === activeIndex;
    if (studentRouteUi.playback !== "playing" && !transitionAuthorized) return;

    const nextStepIndex = Math.min(steps.length - 1, activeIndex + 1);
    const canonicalNext = studentRouteSeekTarget(route, steps, nextStepIndex);
    const activeTransition = routeTransitionForStep(route, steps, activeIndex);
    if (canonicalNext.context === "campus" && activeTransition?.kind === "exit_building" && transitionAuthorized) {
      routeTransitionActivationRef.current = null;
      const nextContextLeg = canonicalNext.contextLegIndex === undefined
        ? undefined
        : route.contextLegs?.[canonicalNext.contextLegIndex];
      const campusPoint = nextContextLeg?.waypoints[0] ?? route.campusPoints?.[0] ?? route.points[0];
      if (campusPoint) pendingRouteRecenterRef.current = { contextKey: "campus", point: campusPoint, floor: false };
      setFloorView(null);
      setIndoorRoute(null);
      setActiveRouteRoom(null);
      setHighlightedRoom(null);
      setNavigationPhase("outdoor");
      setWalkProgress(0);
      walkProgressRef.current = 0;
      playbackCursorRef.current = nextStepIndex;
      setPlaybackCursor(nextStepIndex);
      setWalkNonce((nonce) => nonce + 1);
      setNavigationTransitioning(false);
      setStairLoading(null);
      if (transitionResumePlaybackRef.current) {
        const canResume = studentRouteCanResumeAfterTransition(
          transitionResumePlaybackRef.current,
          emergencyVideoPauseLatchRef.current,
        );
        transitionResumePlaybackRef.current = false;
        if (canResume) {
          setNavigationPauseReason(null);
          dispatchStudentRouteUi({ type: "RESUME" });
        } else {
          setNavigationPauseReason("manual");
        }
      }
      return;
    }
    const nextSegment = canonicalNext.context === "floor" && canonicalNext.phase === "destination-indoor"
      ? canonicalNext.segment
      : null;
    const nextIndex = nextSegment ? destinationIndoorSegments.indexOf(nextSegment) : -1;
    if (!nextSegment || nextIndex <= destinationIndoorSegmentIndex || destinationIndoorTransitionRef.current) return;

    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === destination.buildingId);
    if (!building) return;
    const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === destination.buildingId);
    const currentSegment = destinationIndoorSegments[destinationIndoorSegmentIndex];
    const currentFloor = floorView?.floor
      ?? indoorSegmentFloorNumber(currentSegment, campusBuilding, destination.floorNumber);
    const nextFloor = indoorSegmentFloorNumber(nextSegment, campusBuilding, destination.floorNumber);
    if (nextFloor === undefined) return;
    const floorChanges = nextFloor !== currentFloor;
    const routeTransition = routeTransitionForStep(route, steps, activeIndex);
    const transition = routeTransition?.detail;
    if (floorChanges) {
      if ((routeTransition?.kind !== "stairs" && routeTransition?.kind !== "elevator")
        || !transition
        || transition.kind !== routeTransition.kind
        || transition.fromFloorId && currentSegment?.floorId && transition.fromFloorId !== currentSegment.floorId
        || transition.toFloorId && transition.toFloorId !== nextSegment.floorId
        || currentSegment?.buildingId !== nextSegment.buildingId
        || !transitionAuthorized) return;
      routeTransitionActivationRef.current = null;
    }
    const transitionKind = transition?.kind;
    if (floorChanges && canonicalNext.segment !== nextSegment) return;
    const direction = nextFloor >= (currentFloor ?? nextFloor) ? "up" : "down";
    const nextFloorLabel = studentRouteFloorLabel(nextSegment, nextFloor === 1 ? "Ground Floor" : `Floor ${nextFloor}`);
    const pauseAtZeroWalkAccess = studentRouteShouldPauseAtZeroWalkVerticalAccess(
      route, steps, nextStepIndex, autoVerticalTraversalSharedIdRef.current,
    );
    if (pauseAtZeroWalkAccess) autoVerticalTraversalSharedIdRef.current = null;

    const advanceToNextFloor = () => {
      destinationIndoorTransitionRef.current = null;
      if (routeRef.current !== route || studentRouteUiRef.current.phase !== "navigating") return;
      floorShiftDirectionRef.current = direction;
      setDestinationIndoorSegmentIndex(nextIndex);
      setFloorView({ building, floor: nextFloor });
      setHighlightedRoom(nextFloor === destination.floorNumber ? destination.roomId : null);
      setActiveRouteRoom(destination.roomId);
      setIndoorRoute(indoorRouteFromSegment(nextSegment));
      setIndoorWalkProgress(0);
      playbackCursorRef.current = nextStepIndex;
      setPlaybackCursor(nextStepIndex);
      setIndoorWalkNonce((nonce) => nonce + 1);
      setStairLoading(null);
      setNavigationTransitioning(false);
      if (verticalRunEndsAfterTransitionRef.current) {
        verticalRunEndsAfterTransitionRef.current = false;
        autoVerticalTraversalSharedIdRef.current = null;
      }
      if (pauseAfterVerticalTransitionRef.current) {
        pauseAfterVerticalTransitionRef.current = false;
        setVerticalRunPausePending(false);
        transitionResumePlaybackRef.current = false;
        setNavigationPauseReason("manual");
        dispatchStudentRouteUi({ type: "PAUSE" });
      } else if (transitionResumePlaybackRef.current) {
        const canResume = studentRouteCanResumeAfterTransition(
          transitionResumePlaybackRef.current,
          emergencyVideoPauseLatchRef.current,
        );
        transitionResumePlaybackRef.current = false;
        if (!canResume) {
          setNavigationPauseReason("manual");
        } else if (pauseAtZeroWalkAccess) {
          setNavigationPauseReason("transition");
        } else {
          setNavigationPauseReason(null);
          dispatchStudentRouteUi({ type: "RESUME" });
        }
      }
    };

    if (!floorChanges || reducedMotion) {
      advanceToNextFloor();
      return;
    }

    const transitionName = transition?.label.trim() || transitionKind || "vertical connection";
    const currentFloorLabel = studentRouteFloorLabel(currentSegment, currentFloor === 1 ? "Ground Floor" : `Floor ${currentFloor}`);
    setNavigationTransitioning(true);
    setStairLoading({ dir: direction, label: `${nextFloorLabel} via ${transitionName}`, fromFloorLabel: currentFloorLabel, toFloorLabel: nextFloorLabel, transitionName });
    destinationIndoorTransitionRef.current = setTimeout(advanceToNextFloor, 700);
    return () => {
      if (routeRef.current === route && studentRouteUiRef.current.phase === "navigating") return;
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
    studentRouteUi.phase,
    studentRouteUi.playback,
    routeTransitionActivationNonce,
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

  const setRoutePlannerMapSelection = useCallback((endpoint: "start" | "destination" | null) => {
    // The planner may be temporarily hidden while the map owns the pick. Keep
    // the mode the student deliberately selected when that panel returns.
    if (endpoint) {
      routeModeTouchedRef.current = true;
      invalidateRouteForPlannerChange();
    }
    setRoutePlannerSelectionError(null);
    setRoutePlannerMapPickCandidate(null);
    setRoutePlannerMapPick(endpoint);
    setRoutePlannerEndpoint(null);
  }, [invalidateRouteForPlannerChange]);

  const applyRoutePlannerEndpoint = useCallback((endpoint: RouteEndpoint, purpose: "start" | "destination", stageForConfirmation = false) => {
    if (endpoint.kind === "manual-pin") {
      setRoutePlannerSelectionError("Choose a building, room, or campus place on the map.");
      return false;
    }
    const endpointKey = routeEndpointKey(endpoint);
    const oppositeKey = purpose === "start" ? toRouteEndpointKey : fromRouteEndpointKey;
    if (oppositeKey && endpointKey === oppositeKey) {
      setRoutePlannerSelectionError(`That place is already selected as ${purpose === "start" ? "the destination" : "the start"}. Choose a different place.`);
      return false;
    }
    if (endpoint.kind === "campus-place") {
      const marker = campusPlaceEntity(activeCampus, endpoint.place.campusPlaceId);
      if (mapMode === "emergency" && marker?.type === "gate") {
        setRoutePlannerSelectionError("Campus Gate is not available for Emergency routing.");
        return false;
      }
      if (!marker || !campusPlaceCanRoute(marker, activeCampus, purpose === "start" ? "outbound" : "inbound")) {
        setRoutePlannerSelectionError("This campus place is not connected to a route in that direction.");
        return false;
      }
    }

    if (stageForConfirmation) {
      setRoutePlannerSelectionError(null);
      setRoutePlannerMapPickCandidate({ endpoint, purpose });
      if (endpoint.kind === "room") {
        // The candidate remains a staged endpoint until confirmation, but it
        // should already be visible and framed while the planner stays open.
        setHighlightedRoom(endpoint.room.roomId);
        lastRoomFocusKeyRef.current = null;
        searchFocusRef.current = {
          buildingId: endpoint.building.id,
          roomId: endpoint.room.roomId,
          floorNumber: endpoint.room.floorNumber,
        };
        setSearchFocusNonce((nonce) => nonce + 1);
      }
      return true;
    }

    invalidateRouteForPlannerChange();
    setRoutePlannerSelectionError(null);
    setRoutePlannerMapPickCandidate(null);
    setRoutePlannerMapPick(null);
    setRoutePlannerEndpoint(null);
    setArrivalCameraTarget(null);
    setSelected(null);
    setSelectedCampusPlaceId(null);
    setSelectedRoomContext(null);
    setNavigationPhase("idle");
    setNavigationTransitioning(false);

    if (purpose === "start") {
      setUseMyLocation(false);
      if (endpoint.kind === "building") {
        setRoomOrigin(null);
        setFromCampusPlace(null);
        setFromBuilding(endpoint.building);
        setFloorView(null);
        searchFocusRef.current = { buildingId: endpoint.building.id };
      } else if (endpoint.kind === "room") {
        setRoomOrigin(endpoint.room);
        setFromCampusPlace(null);
        setFromBuilding(endpoint.building);
        setFloorView({ building: endpoint.building, floor: endpoint.room.floorNumber });
        setHighlightedRoom(endpoint.room.roomId);
        setActiveRouteRoom(endpoint.room.roomId);
        lastRoomFocusKeyRef.current = null;
        searchFocusRef.current = { buildingId: endpoint.building.id, roomId: endpoint.room.roomId, floorNumber: endpoint.room.floorNumber };
      } else {
        setRoomOrigin(null);
        setFromBuilding(null);
        setFromCampusPlace(endpoint.place);
        setFloorView(null);
        searchFocusRef.current = { campusPlaceId: endpoint.place.campusPlaceId };
      }
    } else if (endpoint.kind === "building") {
      setRoomDestination(null);
      setToCampusPlace(null);
      setToBuilding(endpoint.building);
      setFloorView(null);
      searchFocusRef.current = { buildingId: endpoint.building.id };
      lastDestinationBuildingFocusKeyRef.current = null;
    } else if (endpoint.kind === "room") {
      setRoomDestination(endpoint.room);
      setToCampusPlace(null);
      setToBuilding(endpoint.building);
      setFloorView({ building: endpoint.building, floor: endpoint.room.floorNumber });
      setHighlightedRoom(endpoint.room.roomId);
      setActiveRouteRoom(endpoint.room.roomId);
      lastRoomFocusKeyRef.current = null;
      searchFocusRef.current = { buildingId: endpoint.building.id, roomId: endpoint.room.roomId, floorNumber: endpoint.room.floorNumber };
    } else {
      setRoomDestination(null);
      setToBuilding(null);
      setToCampusPlace(endpoint.place);
      setFloorView(null);
      searchFocusRef.current = { campusPlaceId: endpoint.place.campusPlaceId };
    }

    setSearchFocusNonce((nonce) => nonce + 1);
    return true;
  }, [activeCampus, fromRouteEndpointKey, invalidateRouteForPlannerChange, mapMode, toRouteEndpointKey]);

  const confirmRoutePlannerMapSelection = useCallback(() => {
    if (routePlannerMapPickCandidate) {
      applyRoutePlannerEndpoint(routePlannerMapPickCandidate.endpoint, routePlannerMapPickCandidate.purpose);
    }
  }, [applyRoutePlannerEndpoint, routePlannerMapPickCandidate]);
  const clearRoutePlannerMapPickCandidate = useCallback(() => setRoutePlannerMapPickCandidate(null), []);

  const handleOutdoorBuildingSelect = useCallback((buildingId: string) => {
    const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
    if (!building) return;
    if (routePlannerMapPick) {
      applyRoutePlannerEndpoint({ kind: "building", building }, routePlannerMapPick, true);
      return;
    }
    selectBuilding(selected?.id === buildingId ? null : building);
  }, [MOCK_BUILDINGS, applyRoutePlannerEndpoint, routePlannerMapPick, selectBuilding, selected?.id]);

  const handleOutdoorCampusPlaceSelect = useCallback((placeId: string) => {
    const place = campusPlaceEntity(activeCampus, placeId);
    if (!place) return;
    if (routePlannerMapPick) {
      const destination = campusPlaceDestination(place, activeCampus);
      if (destination) applyRoutePlannerEndpoint({ kind: "campus-place", place: destination }, routePlannerMapPick, true);
      else setRoutePlannerSelectionError("This campus place is not connected to a route.");
      return;
    }
    selectCampusPlace(selectedCampusPlaceId === placeId ? null : place);
  }, [activeCampus, applyRoutePlannerEndpoint, routePlannerMapPick, selectCampusPlace, selectedCampusPlaceId]);

  const handleOutdoorBuildingDoubleClick = useCallback((buildingId: string) => {
    const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
    if (!building || routePlannerMapPick) return;
    if (prepareRouteForContextInspection() === "blocked") return;
    openFloorPlan(building);
  }, [MOCK_BUILDINGS, openFloorPlan, prepareRouteForContextInspection, routePlannerMapPick]);

  const handleStudentEnterBuilding = useCallback((building: Building) => {
    if (prepareRouteForContextInspection() === "blocked") return;
    openFloorPlan(building);
  }, [openFloorPlan, prepareRouteForContextInspection]);

  const handleOutdoorEntranceClick = useCallback((buildingId: string) => {
    const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
    if (!building) return;
    if (prepareRouteForContextInspection() === "blocked") return;
    openFloorPlan(building);
  }, [MOCK_BUILDINGS, openFloorPlan, prepareRouteForContextInspection]);

  const focusRoutePlannerOrigin = () => {
    if (roomOrigin || isFloorMode) return false;
    const buildingBounds = fromBuilding ? B_POS[fromBuilding.id] : undefined;
    const placeMarker = fromCampusPlace
      ? campusPlaceEntity(activeCampus, fromCampusPlace.campusPlaceId)
      : undefined;
    const originPoint = placeMarker
      ? { x: placeMarker.x, y: placeMarker.y }
      : useMyLocation && youAreHere
        ? youAreHere
        : null;
    const roomBounds = buildingBounds
      ? { x: buildingBounds.x, y: buildingBounds.y, width: buildingBounds.w, height: buildingBounds.h }
      : originPoint ? {
          x: originPoint.x - 20,
          y: originPoint.y - 20,
          width: 40,
          height: 40,
        } : undefined;
    if (!roomBounds) return false;

    const surface = mapContainerRef.current;
    const svg = svgRef.current;
    const surfaceRect = surface?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    if (!surface || !surfaceRect || !svgRect || svgRect.width <= 0 || svgRect.height <= 0) return false;

    const mapScale = Math.min(svgRect.width / outdoorCanvasW, svgRect.height / outdoorCanvasH);
    if (!Number.isFinite(mapScale) || mapScale <= 0) return false;
    const viewportOffset = {
      x: Math.max(0, (svgRect.width - outdoorCanvasW * mapScale) / (2 * mapScale)),
      y: Math.max(0, (svgRect.height - outdoorCanvasH * mapScale) / (2 * mapScale)),
    };
    const safePx = { left: 12, right: 12, top: 12, bottom: 12 };
    const plannerRect = surface.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")?.getBoundingClientRect()
      ?? document.querySelector<HTMLElement>("[data-testid='route-planner-dialog']")?.getBoundingClientRect();
    const mobileMap = surfaceRect.width < 768;
    if (plannerRect && plannerRect.width > 0 && plannerRect.height > 0) {
      if (mobileMap && plannerRect.width >= surfaceRect.width * 0.72) {
        safePx.bottom = Math.max(safePx.bottom, surfaceRect.bottom - plannerRect.top + 12);
      } else if (plannerRect.left <= surfaceRect.left + 24) {
        safePx.left = Math.max(safePx.left, plannerRect.right - surfaceRect.left + 12);
      }
    }
    const headerRect = surface.querySelector<HTMLElement>("[data-map-search-header='true']")?.getBoundingClientRect();
    if (headerRect && headerRect.bottom > surfaceRect.top) {
      safePx.top = Math.max(safePx.top, headerRect.bottom - surfaceRect.top + 12);
    }

    const focus = getStudentRoomFocusCamera({
      mapWidth: outdoorCanvasW,
      mapHeight: outdoorCanvasH,
      roomBounds,
      currentPan: panRef.current,
      zoom: zoomRef.current,
      maxZoom: activeMapZoomMaxRef.current,
      insets: {
        left: safePx.left / mapScale,
        right: safePx.right / mapScale,
        top: safePx.top / mapScale,
        bottom: safePx.bottom / mapScale,
      },
      viewportOffset,
    });
    routeStartFocusPendingRef.current = true;
    if (focus.shouldMove) animateCameraTo(clampMapPan(focus.pan, focus.zoom), focus.zoom);
    return true;
  };

  const selectRoomDestination = useCallback((catalogKey: string) => {
    const target = roomDestinationCatalog.find((room) =>
      `${room.buildingId}:${room.floorNumber}:${room.roomId}` === catalogKey,
    );
    invalidateRouteForPlannerChange();
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
  }, [MOCK_BUILDINGS, invalidateRouteForPlannerChange, roomDestinationCatalog]);

  const useRoomAsStart = useCallback((origin: RoomDest) => {
    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === origin.buildingId);
    if (!building) return;

    invalidateRouteForPlannerChange();
    setRoomOrigin(origin);
    setRoomDestination(null);
    setFromBuilding(building);
    setToBuilding(null);
    setUseMyLocation(false);
    dispatchStudentRouteUi({ type: "OPEN_PLAN" });
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
  }, [MOCK_BUILDINGS, invalidateRouteForPlannerChange]);

  const useRoomAsDestination = useCallback((target: RoomDest) => {
    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === target.buildingId);
    if (!building) return;
    invalidateRouteForPlannerChange();
    prepareFreshRoutePlannerMode();
    setRoomDestination(target);
    setToBuilding(building);
    dispatchStudentRouteUi({ type: "OPEN_PLAN" });
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
  }, [MOCK_BUILDINGS, invalidateRouteForPlannerChange, prepareFreshRoutePlannerMode]);

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
    if (discoverTour.active) {
      searchFocusRef.current = null;
      lastRoomFocusKeyRef.current = null;
      setHighlightedRoom(roomId);
      setSelectedRoomContext(room);
      setSearchFocusNonce((nonce) => nonce + 1);
      return;
    }
    if (routePlannerMapPick) {
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === room.buildingId);
      if (building) applyRoutePlannerEndpoint({ kind: "room", room, building }, routePlannerMapPick, true);
      return;
    }
    searchFocusRef.current = null;
    lastRoomFocusKeyRef.current = null;
    setHighlightedRoom(roomId);
    setSelectedRoomContext(room);
    setSearchFocusNonce((nonce) => nonce + 1);
  }, [applyRoutePlannerEndpoint, discoverTour.active, MOCK_BUILDINGS, roomEndpointFromFloor, routePlannerMapPick]);

  const enterDestinationRouteFloor = useCallback((destination: NonNullable<PlannedRoute["destinationRoom"]>) => {
    if (!route) return;
    const building = MOCK_BUILDINGS.find((candidate) => candidate.id === destination.buildingId);
    if (!building) return;
    const campusBuilding = activeCampus?.buildings.find((candidate) => candidate.id === destination.buildingId);
    const destinationSegments = indoorSegmentsForBuilding(route, destination.buildingId, "after-outdoor");
    const firstDestinationSegment = destinationSegments[0];
    const firstDestinationFloor = indoorSegmentFloorNumber(firstDestinationSegment, campusBuilding, destination.floorNumber)
      ?? destination.floorNumber;
    enteredRoomRef.current = `${destination.buildingId}:${destination.floorNumber}:${destination.roomId}`;
    setDestinationIndoorSegments(destinationSegments);
    setDestinationIndoorSegmentIndex(firstDestinationSegment ? 0 : -1);
    if (studentRouteUi.camera === "follow") {
      cancelCameraAnimation();
      setZoom(1);
      setPan({ x: 0, y: 0 });
      floorShiftDirectionRef.current = null;
      setFloorView({ building, floor: firstDestinationFloor });
      setHighlightedRoom(firstDestinationFloor === destination.floorNumber ? destination.roomId : null);
    }
    setActiveRouteRoom(destination.roomId);
    setIndoorWalkProgress(0);
    setIndoorWalkNonce((nonce) => nonce + 1);
    setNavigationTransitioning(false);
    setNavigationPhase("destination-indoor");
    setIndoorRoute(firstDestinationSegment ? indoorRouteFromSegment(firstDestinationSegment) : null);
  }, [activeCampus, cancelCameraAnimation, MOCK_BUILDINGS, route, studentRouteUi.camera]);

  // ── Walk arrival → enter the destination building's floor plan ────────
  // When the walking dot reaches the end of an outdoor route that targets a
  // specific room (route.destinationRoom), automatically open that building's
  // floor at the destination floor, highlight the room and draw the final
  // indoor leg from the entrance to the room.
  // The destination indoor segment is entered by activating the authored
  // doorway control after the player reaches it. Progress alone must not
  // switch context or move the instruction ahead of the human.

  // Resolve the indoor route after the destination floor is mounted. This is
  // important for published campuses because the rendered floor can contain
  // authored room data that is not available in the legacy adapter yet.
  useEffect(() => {
    const dest = route?.destinationRoom;
    if (!dest || !isFloorMode || !floorView || floorView.building.id !== dest.buildingId || floorView.floor !== dest.floorNumber) return;
    // Same-building journeys are already represented by the source indoor
    // itinerary, including its destination Floor. Rebuilding a second
    // destination itinerary here races that canonical sequence and repeatedly
    // resets the active segment as each Floor comes into view.
    if (navigationPhase === "origin-indoor" && roomOrigin?.buildingId === dest.buildingId) return;
    if (navigationPhase !== "destination-indoor") return;
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
    setActiveRouteRoom(dest.roomId);
  }, [route, isFloorMode, floorView, activeFloorPlan, currentFloor, mapMode, indoorRoute, activeRouteRoom, navigationPhase, roomOrigin?.buildingId]);

  // ── Map skeleton loading ──
  const loadingCampusScreen = isCampusLoading && !activeCampus ? (
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
  ) : null;

  const emptyCampusScreen = isCampusEmpty && !activeCampus && !campusError ? (
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
  ) : null;

  const campusErrorScreen = campusError && !activeCampus ? (
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
  ) : null;

  // ── Render ─────────────────────────────────────────────────────────────
  const comingSoonCampusScreen = activeCampus?.lifecycleStatus === "coming_soon" ? (
      <ComingSoonCampusScreen
        campus={activeCampus}
        campuses={availableCampuses}
        onSelectCampus={setSelectedCampusId}
        fullScreen={fullScreen}
      />
  ) : null;

  useEffect(() => {
    if (studentRouteUi.phase !== "navigating" || studentRouteUi.camera !== "follow" || !route) return;
    const canonicalSteps = studentFacingRouteSteps(route);
    const currentSegment = navigationPhase === "origin-indoor"
      ? originIndoorSegments[originIndoorSegmentIndex] ?? null
      : navigationPhase === "destination-indoor"
        ? destinationIndoorSegments[destinationIndoorSegmentIndex] ?? null
        : null;
    const isCampusContext = navigationPhase === "outdoor";
    const arrived = studentRouteReachedFinalEndpoint({
      route,
      steps: canonicalSteps,
      cursor: playbackCursor,
      context: isCampusContext ? "campus" : "floor",
      phase: navigationPhase,
      segment: currentSegment,
      progress: isCampusContext ? walkProgress : indoorWalkProgress,
      pendingTransition: navigationTransitioning
        || stepSeekTargetRef.current !== null
        || pendingTransitionSeekRef.current
        || routeTransitionActivationRef.current !== null,
    });
    if (!arrived) return;
    const endpoint = studentRouteArrivalTarget(route, canonicalSteps);
    if (!endpoint) return;

    // Arrival is the final owner of player position and camera intent. Cancel
    // any stale route RAF/timer before committing the endpoint so no delayed
    // Follow or transition callback can pull the map back to an earlier leg.
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    walkAnimRef.current = null;
    indoorWalkAnimRef.current = null;
    stepSeekAnimRef.current = null;
    stepSeekTargetRef.current = null;
    pendingTransitionSeekRef.current = false;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    stepSeekTransitionTimerRef.current = null;
    if (destinationIndoorTransitionRef.current) clearTimeout(destinationIndoorTransitionRef.current);
    if (originIndoorTransitionRef.current) clearTimeout(originIndoorTransitionRef.current);
    destinationIndoorTransitionRef.current = null;
    originIndoorTransitionRef.current = null;
    cancelCameraAnimation(false);

    const endpointPoints = endpoint.context === "floor"
      ? endpoint.segment?.waypoints ?? []
      : studentRouteTargetPoints(route, endpoint);
    const avatarPoint = endpointPoints.length > 0
      ? pointAlongPolyline(endpointPoints, endpoint.context === "floor" ? endpoint.segmentProgress : endpoint.routeProgress)
      : null;
    if (endpoint.context === "campus") {
      walkProgressRef.current = 1;
      setWalkProgress(1);
    } else {
      indoorWalkProgressRef.current = 1;
      setIndoorWalkProgress(1);
    }
    if (avatarPoint) {
      const approachPoint = endpoint.context === "floor"
        ? [...endpointPoints].reverse().find((point) => Math.hypot(avatarPoint.x - point.x, avatarPoint.y - point.y) > 0.001)
        : undefined;
      let buildingCenterPoint: { x: number; y: number } | null = null;
      let campusPlacePoint: { x: number; y: number } | null = null;
      let buildingId = endpoint.context === "floor" ? endpoint.segment?.buildingId : undefined;
      let floorNumber = endpoint.context === "floor" ? endpoint.segment?.floorNumber : undefined;
      let roomId = endpoint.context === "floor" ? route.destinationRoom?.roomId : undefined;
      let campusPlaceId: string | undefined;
      if (endpoint.context === "campus" && toBuilding) {
        const building = activeCampus?.buildings.find((candidate) => candidate.id === toBuilding.id);
        if (building) buildingCenterPoint = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
        buildingId = toBuilding.id;
      } else if (endpoint.context === "campus" && toCampusPlace) {
        const place = campusPlaceEntity(activeCampus, toCampusPlace.campusPlaceId);
        if (place) campusPlacePoint = { x: place.x, y: place.y };
        campusPlaceId = toCampusPlace.campusPlaceId;
      }
      // SOS may retain the selected origin building/place in planner state
      // while its real endpoint is an outdoor Assembly Point. That approved
      // destination owns the arrival frame.
      const cameraPoint = studentRouteArrivalCameraPoint(route, avatarPoint, buildingCenterPoint, campusPlacePoint);
      const assemblyArrival = Boolean(route.emergencyAssemblyPointId && endpoint.context === "campus");
      const targetKey = [
        routeKey,
        endpoint.context,
        buildingId ?? "",
        floorNumber ?? "",
        roomId ?? "",
        campusPlaceId ?? "",
        avatarPoint.x.toFixed(3),
        avatarPoint.y.toFixed(3),
      ].join(":");
      setArrivalCameraTarget({
        key: targetKey,
        context: endpoint.context,
        avatarPoint,
        cameraPoint,
        ...(approachPoint ? { approachPoint } : {}),
        ...(!assemblyArrival && buildingId ? { buildingId } : {}),
        ...(floorNumber !== undefined ? { floorNumber } : {}),
        ...(roomId ? { roomId } : {}),
        ...(!assemblyArrival && campusPlaceId ? { campusPlaceId } : {}),
      });
      if (roomId) {
        setHighlightedRoom(roomId);
        setActiveRouteRoom(roomId);
      }
    }
    playbackCursorRef.current = Math.max(0, canonicalSteps.length - 1);
    setPlaybackCursor(playbackCursorRef.current);
    setNavigationPauseReason(null);
    dispatchStudentRouteUi({ type: "ARRIVE" });
  }, [activeCampus?.buildings, activeCampus?.markers, cancelCameraAnimation, destinationIndoorSegmentIndex, destinationIndoorSegments, indoorWalkProgress, navigationPhase, navigationTransitioning, originIndoorSegmentIndex, originIndoorSegments, playbackCursor, route, routeKey, studentRouteUi.camera, studentRouteUi.phase, toBuilding, toCampusPlace, walkProgress]);

  const phaseIndoorSegment = navigationPhase === "origin-indoor"
    ? originIndoorSegments[originIndoorSegmentIndex]
    : navigationPhase === "destination-indoor"
      ? destinationIndoorSegments[destinationIndoorSegmentIndex]
      : route?.indoorSegments?.find((segment) => Boolean(
          indoorRoute
          && segment.waypoints.length === indoorRoute.waypoints.length
          && segment.waypoints.every((point, index) =>
            point.x === indoorRoute.waypoints[index]?.x
            && point.y === indoorRoute.waypoints[index]?.y,
          ),
        )) ?? null;
  const routePanelPhase = directionsMode ? "planning" : studentRouteUi.phase;
  const routePanelVisible = directionsMode
    || (studentRouteUi.phase !== "idle" && !studentRouteUi.collapsed);
  const expandRoutePanel = useCallback(() => {
    const previewRoute = studentRouteUi.phase === "preview" ? route : null;
    setMobileRoutePreviewExpanded(Boolean(previewRoute));
    dispatchStudentRouteUi({ type: "EXPAND" });
    if (!previewRoute || student3DActive) return;
    const startIndoorSegment = previewRoute.indoorSegments?.find((segment) => !segment.afterOutdoor)
      ?? (previewRoute.points.length < 2 ? previewRoute.indoorSegments?.[0] : undefined);
    const startIsIndoor = Boolean(startIndoorSegment
      && studentRouteInitialContext(previewRoute, studentFacingRouteSteps(previewRoute), Boolean(roomOrigin)) === "floor");
    const point = startIsIndoor
      ? startIndoorSegment?.waypoints[0]
      : previewRoute.campusPoints?.[0] ?? previewRoute.points[0] ?? startIndoorSegment?.waypoints[0];
    if (point) scheduleRouteStartFocusAfterPanelLayout(point, startIsIndoor, true);
  }, [roomOrigin, route, scheduleRouteStartFocusAfterPanelLayout, student3DActive, studentRouteUi.phase]);
  const routePanelOwnsRendererToggle = routePanelVisible;
  const beginCompletedRouteEdit = useCallback(() => {
    if (!route || studentRouteUi.phase !== "arrived") return;
    completedRouteEditSnapshotRef.current = {
      ui: studentRouteUi,
      fromBuilding, toBuilding, fromCampusPlace, toCampusPlace, roomOrigin, roomDestination,
      mapMode, standardRoutePreference, useMyLocation, youAreHere, currentLocationLabel,
      navigationPhase, floorView, indoorRoute, destinationIndoorSegments, destinationIndoorSegmentIndex,
      originIndoorSegments, originIndoorSegmentIndex, activeRouteRoom, highlightedRoom,
      walkProgress, indoorWalkProgress, playbackCursor, routePreviewStepIndex, showArrival,
      selected, selectedCampusPlaceId, selectedRoomContext,
      arrivalCameraTarget,
    };
    completedRouteEditOpeningRef.current = true;
    routeModeTouchedRef.current = true;
    setRoutePlannerEndpoint(null);
    setRoutePlannerMapPick(null);
    setRoutePlannerMapPickCandidate(null);
    setRoutePlannerSelectionError(null);
    dispatchStudentRouteUi({ type: "EDIT_ROUTE" });
    setDirectionsMode(true);
  }, [activeRouteRoom, arrivalCameraTarget, currentLocationLabel, destinationIndoorSegmentIndex, destinationIndoorSegments, dispatchStudentRouteUi, floorView, fromBuilding, fromCampusPlace, highlightedRoom, indoorRoute, indoorWalkProgress, mapMode, navigationPhase, originIndoorSegmentIndex, originIndoorSegments, playbackCursor, route, routePreviewStepIndex, roomDestination, roomOrigin, selected, selectedCampusPlaceId, selectedRoomContext, showArrival, standardRoutePreference, studentRouteUi, toBuilding, toCampusPlace, useMyLocation, walkProgress, youAreHere]);
  const cancelCompletedRouteEdit = useCallback(() => {
    const snapshot = completedRouteEditSnapshotRef.current;
    if (!snapshot) {
      setDirectionsMode(false);
      return;
    }
    completedRouteEditSnapshotRef.current = null;
    routeModeTouchedRef.current = true;
    setFromBuilding(snapshot.fromBuilding);
    setToBuilding(snapshot.toBuilding);
    setFromCampusPlace(snapshot.fromCampusPlace);
    setToCampusPlace(snapshot.toCampusPlace);
    setRoomOrigin(snapshot.roomOrigin);
    setRoomDestination(snapshot.roomDestination);
    setMapMode(snapshot.mapMode);
    setStandardRoutePreference(snapshot.standardRoutePreference);
    setUseMyLocation(snapshot.useMyLocation);
    setYouAreHere(snapshot.youAreHere);
    setCurrentLocationLabel(snapshot.currentLocationLabel);
    setNavigationPhase(snapshot.navigationPhase);
    setFloorView(snapshot.floorView);
    setIndoorRoute(snapshot.indoorRoute);
    setDestinationIndoorSegments(snapshot.destinationIndoorSegments);
    setDestinationIndoorSegmentIndex(snapshot.destinationIndoorSegmentIndex);
    setOriginIndoorSegments(snapshot.originIndoorSegments);
    setOriginIndoorSegmentIndex(snapshot.originIndoorSegmentIndex);
    setActiveRouteRoom(snapshot.activeRouteRoom);
    setHighlightedRoom(snapshot.highlightedRoom);
    setWalkProgress(snapshot.walkProgress);
    walkProgressRef.current = snapshot.walkProgress;
    setIndoorWalkProgress(snapshot.indoorWalkProgress);
    indoorWalkProgressRef.current = snapshot.indoorWalkProgress;
    playbackCursorRef.current = snapshot.playbackCursor;
    setPlaybackCursor(snapshot.playbackCursor);
    setRoutePreviewStepIndex(snapshot.routePreviewStepIndex);
    setShowArrival(snapshot.showArrival);
    setSelected(snapshot.selected);
    setSelectedCampusPlaceId(snapshot.selectedCampusPlaceId);
    setSelectedRoomContext(snapshot.selectedRoomContext);
    setArrivalCameraTarget(snapshot.arrivalCameraTarget);
    setRoutePlannerEndpoint(null);
    setRoutePlannerMapPick(null);
    setRoutePlannerMapPickCandidate(null);
    setRoutePlannerSelectionError(null);
    setDirectionsMode(false);
    dispatchStudentRouteUi({ type: "CANCEL_ROUTE_EDIT", restore: snapshot.ui });
  }, [dispatchStudentRouteUi]);
  useLayoutEffect(() => {
    if (student3DActive) return;
    const surface = mapContainerRef.current;
    if (!surface) return;
    const updateFocus = () => {
      const visible = studentMapFocusViewport(surface);
      followCameraFocusRef.current = focusViewPointFromScreen({
        x: (visible.left + visible.right) / 2,
        y: (visible.top + visible.bottom) / 2,
      }, { x: viewCX, y: viewCY });
    };
    updateFocus();
    // Sheet animations emit many ResizeObserver notifications. Coalesce them
    // so Follow sees one stable safe viewport after the panel settles instead
    // of chasing a moving midpoint frame-by-frame.
    let focusUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFocusUpdate = () => {
      if (focusUpdateTimer) clearTimeout(focusUpdateTimer);
      focusUpdateTimer = setTimeout(() => {
        focusUpdateTimer = null;
        updateFocus();
      }, 140);
    };
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleFocusUpdate) : null;
    resizeObserver?.observe(surface);
    const overlays = surface.querySelectorAll<HTMLElement>("[data-testid='route-planner-dialog'], [data-testid='collapsed-route-card'], [data-testid='mobile-active-route-dock'], [data-testid='mobile-building-sheet'], [data-testid='student-selected-place-card']");
    overlays.forEach((overlay) => resizeObserver?.observe(overlay));
    window.addEventListener("resize", scheduleFocusUpdate);
    window.visualViewport?.addEventListener("resize", scheduleFocusUpdate);
    return () => {
      if (focusUpdateTimer) clearTimeout(focusUpdateTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleFocusUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleFocusUpdate);
    };
  }, [directionsMode, floorPickerFallbackActive, focusViewPointFromScreen, isFloorMode, mobileBuildingSheetState, routePanelVisible, selected?.id, student3DActive, studentRouteUi.collapsed, studentRouteUi.phase, viewCX, viewCY]);
  const routeContextRecoveryPending = studentRouteUi.phase === "navigating"
    && studentRouteUi.camera === "follow"
    && followCameraReacquiringRef.current
    && !followCameraRecoveryFailed;
  const routeContextRecoveryFailed = studentRouteUi.phase === "navigating"
    && studentRouteUi.camera === "follow"
    && followCameraRecoveryFailed;
  const routePausedForInspection = studentRouteUi.phase === "navigating"
    && studentRouteUi.camera === "follow"
    && studentRouteUi.playback === "paused"
    && followCameraDetached
    && !routeContextRecoveryPending
    && !routeContextRecoveryFailed;
  const routeTransitionBusy = navigationTransitioning || Boolean(stairLoading) || routeContextRecoveryPending || routeContextRecoveryFailed;
  const routeNavigationSteps = useMemo(() => route ? studentFacingRouteSteps(route) : [], [route]);
  const arrivalCameraActive = Boolean(arrivalCameraTarget
    && (studentRouteUi.phase === "arrived" || directionsMode && completedRouteEditSnapshotRef.current));
  const routePlaybackMarkerTarget = route && studentRouteUi.phase === "navigating"
    // Walking RAFs keep the exact cursor in the ref between instruction
    // boundaries to avoid reconciling the whole map every frame. Use that same
    // live cursor when an Explore/renderer context remounts the marker layer;
    // the React step snapshot can be one walk segment behind mid-instruction.
    ? studentRoutePlaybackTarget(route, routeNavigationSteps, playbackCursorRef.current)
    : null;
  const activeInspectedStepIndex = studentRouteUi.phase === "navigating"
    && studentRouteUi.camera === "explore" ? inspectedRouteStepIndex : null;
  const routeInspectionTarget = useMemo(() => {
    if (!route || activeInspectedStepIndex === null) return null;
    return studentRouteExploreInspectionTarget(route, routeNavigationSteps, activeInspectedStepIndex);
  }, [activeInspectedStepIndex, route, routeNavigationSteps]);
  const studentRouteTransitionCues = useMemo(() => {
    if (!route) return [];
    if (isFloorMode && activeFloorPlan && floorView) {
      return deriveStudentRouteTransitionCues(route, routeNavigationSteps, {
        kind: "floor",
        buildingId: floorView.building.id,
        floor: activeFloorPlan,
        floorNumber: floorView.floor,
      }, activeCampus?.navNodes ?? [], activeCampus?.navEdges ?? [], mapMode);
    }
    return deriveStudentRouteTransitionCues(route, routeNavigationSteps, { kind: "campus" });
  }, [activeCampus?.navEdges, activeCampus?.navNodes, activeFloorPlan, floorView, isFloorMode, mapMode, route, routeNavigationSteps]);
  // A/B ENDPOINT SEMANTICS: A is only the true route Start and B is only the
  // true final destination. Intermediate building entrances/floor changes use
  // Test Route transition markers instead of B.
  const activeIndoorSegment = navigationPhase === "origin-indoor"
    ? originIndoorSegments[originIndoorSegmentIndex]
    : navigationPhase === "destination-indoor"
      ? destinationIndoorSegments[destinationIndoorSegmentIndex]
      : undefined;
  const routeIndoorSegments = route?.indoorSegments ?? [];
  const visibleIndoorRouteSegment = useMemo(() => {
    if (floorView && activeFloorPlan && studentRouteUi.phase === "navigating"
      && studentRouteUi.camera === "explore" && routeInspectionTarget?.context === "floor"
      && routeInspectionTarget.segment?.buildingId === floorView.building.id
      && (routeInspectionTarget.segment.floorId
        ? routeInspectionTarget.segment.floorId === activeFloorPlan.id
        : routeInspectionTarget.segment.floorNumber === floorView.floor)) {
      return routeInspectionTarget.segment;
    }
    return floorView && activeFloorPlan
      ? studentIndoorSegmentForFloor(route, floorView.building.id, activeFloorPlan.id, floorView.floor)
      : null;
  }, [activeFloorPlan?.id, floorView, route, routeInspectionTarget, studentRouteUi.camera, studentRouteUi.phase]);
  // During Follow, draw the active authored segment. During Preview/Explore,
  // resolve against the Floor currently on screen so lower/origin Floors in
  // the same planned journey remain inspectable without changing route state.
  const visibleIndoorRoute = useMemo(() => {
    if (visibleIndoorRouteSegment) return indoorRouteFromSegment(visibleIndoorRouteSegment);
    if (routeIndoorSegments.length > 0) return null;
    if (!route) return indoorRoute;
    const legacyRoomContextMatches = Boolean(floorView && (
      (roomOrigin?.buildingId === floorView.building.id && roomOrigin.floorNumber === floorView.floor)
      || (roomDestination?.buildingId === floorView.building.id && roomDestination.floorNumber === floorView.floor)
      || (route.destinationRoom?.buildingId === floorView.building.id && route.destinationRoom.floorNumber === floorView.floor)
    ));
    return legacyRoomContextMatches ? indoorRoute : null;
  }, [floorView, indoorRoute, roomDestination, roomOrigin, route, routeIndoorSegments.length, visibleIndoorRouteSegment]);
  const visibleIndoorRouteIsActive = Boolean(
    visibleIndoorRouteSegment && visibleIndoorRouteSegment === activeIndoorSegment,
  );
  const arrivalIndoorContextActive = Boolean(
    arrivalCameraActive
    && arrivalCameraTarget?.context === "floor"
    && arrivalCameraTarget.buildingId === floorView?.building.id
    && arrivalCameraTarget.floorNumber === floorView?.floor
    && visibleIndoorRouteIsActive,
  );
  const routeStartsIndoors = routeIndoorSegments.some((segment) => !segment.afterOutdoor);
  const routeEndsIndoors = Boolean(route?.destinationRoom)
    || routeIndoorSegments.some((segment) => segment.afterOutdoor);
  const isRouteExplore = studentRouteUi.phase === "navigating" && studentRouteUi.camera === "explore";
  const routePlaybackMarkerVisibleOnCampus = Boolean(routePlaybackMarkerTarget?.context === "campus"
    && (!isRouteExplore || routeInspectionTarget?.context === "campus"));
  const routePlaybackMarkerVisibleOnViewedFloor = Boolean(routePlaybackMarkerTarget?.context === "floor"
    && routePlaybackMarkerTarget.segment
    && floorView
    && routePlaybackMarkerTarget.segment.buildingId === floorView.building.id
    && (routePlaybackMarkerTarget.segment.floorId
      ? routePlaybackMarkerTarget.segment.floorId === activeFloorPlan?.id
      : routePlaybackMarkerTarget.segment.floorNumber === floorView.floor));
  const routePlaybackMarkerVisibleOnActiveIndoorSegment = Boolean(routePlaybackMarkerVisibleOnViewedFloor
    && routePlaybackMarkerTarget?.segment === visibleIndoorRouteSegment);
  const inspectedContextLegIndex = routeInspectionTarget?.contextLegIndex;
  const firstContextLegIndex = route?.contextLegs?.length ? 0 : undefined;
  const lastContextLegIndex = route?.contextLegs?.length ? route.contextLegs.length - 1 : undefined;
  const waypointsMatchRoute = (segment: { waypoints: readonly { x: number; y: number }[] } | undefined) => Boolean(
    segment && visibleIndoorRoute
    && segment.waypoints.length === visibleIndoorRoute.waypoints.length
    && segment.waypoints.every((point, index) => point.x === visibleIndoorRoute.waypoints[index]?.x && point.y === visibleIndoorRoute.waypoints[index]?.y),
  );
  // The campus layer only carries endpoints that truly live on campus; the
  // floor layer only carries endpoints that truly live inside on this segment.
  const campusShowsStartMarker = !routeStartsIndoors && (!isRouteExplore
    || (inspectedContextLegIndex !== undefined ? inspectedContextLegIndex === firstContextLegIndex : activeInspectedStepIndex === 0));
  const campusShowsEndMarker = !routeEndsIndoors && (!isRouteExplore
    || (inspectedContextLegIndex !== undefined ? inspectedContextLegIndex === lastContextLegIndex : activeInspectedStepIndex === routeNavigationSteps.length - 1));
  const firstIndoorSegment = routeIndoorSegments.find((segment) => !segment.afterOutdoor);
  const indoorShowsStartMarker = routeStartsIndoors && waypointsMatchRoute(firstIndoorSegment)
    && (!isRouteExplore || visibleIndoorRouteSegment === firstIndoorSegment);
  // The final indoor leg of a same-building multi-floor route may not be
  // tagged afterOutdoor. Resolve the endpoint from its authored destination
  // Floor first, then use the final post-campus leg for building-to-building.
  const indoorDestinationSegment = route?.destinationRoom
    ? [...routeIndoorSegments].reverse().find((segment) => segment.buildingId === route.destinationRoom?.buildingId
      && segment.floorNumber === route.destinationRoom?.floorNumber)
    : undefined;
  const finalIndoorSegment = indoorDestinationSegment
    ?? [...routeIndoorSegments].reverse().find((segment) => segment.afterOutdoor);
  const indoorShowsEndMarker = routeEndsIndoors && waypointsMatchRoute(finalIndoorSegment)
    && (!isRouteExplore || visibleIndoorRouteSegment === finalIndoorSegment);
  const activeRouteContextLegIndex = route && activeIndoorSegment
    ? (() => {
        const stepIndex = studentRouteUi.phase === "preview"
          ? routePreviewStepIndex
          : Math.floor(playbackCursor + 0.000001);
        const target = studentRouteSeekTarget(route, routeNavigationSteps, stepIndex);
        return target.segment === activeIndoorSegment ? target.contextLegIndex : undefined;
      })()
    : undefined;
  const activeRouteProgress = isFloorMode && route && activeIndoorSegment
    ? studentRouteProgressForIndoorSegment(route, routeNavigationSteps, activeIndoorSegment, indoorWalkProgress, activeRouteContextLegIndex)
    : walkProgress;
  // Explore step inspection renders the inspected step's position without
  // ever mutating real playback progress (Return to Follow resumes from the
  // actual preserved progress). Null outside Explore inspection.
  const routeInspectionContextLabel = useMemo(() => {
    if (!routeInspectionTarget) return "Route context";
    if (routeInspectionTarget.context === "campus") return "Campus";
    const segment = routeInspectionTarget.segment;
    const contextLeg = route?.contextLegs?.[routeInspectionTarget.contextLegIndex ?? -1];
    const buildingId = segment?.buildingId ?? contextLeg?.buildingId;
    const building = buildingId
      ? activeCampus?.buildings.find((candidate) => candidate.id === buildingId)
        ?? MOCK_BUILDINGS.find((candidate) => candidate.id === buildingId)
      : undefined;
    return `${building?.code ?? building?.name ?? "Building"} · ${studentRouteFloorLabel(segment ?? contextLeg)}`;
  }, [activeCampus?.buildings, route, routeInspectionTarget]);
  const routeInspectionFocus = useMemo(() => {
    if (!route || !routeInspectionTarget || activeInspectedStepIndex === null) return null;
    return {
      target: routeInspectionTarget,
      point: pointAlongPolyline(
        studentRouteTargetPoints(route, routeInspectionTarget),
        routeInspectionTarget.context === "floor" ? routeInspectionTarget.segmentProgress : routeInspectionTarget.routeProgress,
      ),
      key: `${routeKey}:${activeInspectedStepIndex}:${routeInspectionTarget.context}:${routeInspectionTarget.contextLegIndex ?? routeInspectionTarget.segmentIndex}`,
    };
  }, [activeInspectedStepIndex, route, routeInspectionTarget, routeKey]);
  const arrivalCameraFocusAppliedRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!arrivalCameraTarget) {
      arrivalCameraFocusAppliedRef.current = null;
      return;
    }
    if (student3DActive) {
      // The inactive 2D renderer can lose its exposed-map framing while 3D is
      // mounted. Reapply the canonical destination when 2D becomes active.
      arrivalCameraFocusAppliedRef.current = null;
      return;
    }
    if (!arrivalCameraActive) return;
    // Room destinations use the room-bounds focus below so the doorway and
    // nearby corridor remain visible. Other destinations focus their exact
    // authored Campus/Floor point here.
    if (arrivalCameraTarget.context === "floor" && arrivalCameraTarget.roomId) return;
    if (arrivalCameraFocusAppliedRef.current === arrivalCameraTarget.key) return;
    arrivalCameraFocusAppliedRef.current = arrivalCameraTarget.key;
    focusRouteStartView(arrivalCameraTarget.cameraPoint, arrivalCameraTarget.context === "floor", "arrival");
  }, [arrivalCameraActive, arrivalCameraTarget, focusRouteStartView, student3DActive]);
  const displayedWalkProgress = studentRouteUi.camera === "explore"
    && !(smartEmergencyRouteMode && activeEmergencyRouteId && studentRouteUi.phase === "navigating")
    ? undefined
    : studentDisplayedRouteProgress(routeNavigationSteps, walkProgress, studentRouteUi.camera, activeInspectedStepIndex);
  // Explore can inspect any authored Floor segment; keep the full path visible
  // there instead of applying the active segment's position to an unrelated
  // local polyline.
  const canonicalProgressOnVisibleIndoorRoute = routePlaybackMarkerTarget?.context === "floor"
    && routePlaybackMarkerTarget.segment === visibleIndoorRouteSegment
    ? routePlaybackMarkerTarget.segmentProgress
    : undefined;
  const displayedIndoorWalkProgress = studentRouteUi.phase === "navigating"
    && (studentRouteUi.camera !== "explore" || Boolean(smartEmergencyRouteMode && activeEmergencyRouteId))
    ? canonicalProgressOnVisibleIndoorRoute
    : undefined;
  const displayedRouteProgress = studentDisplayedRouteProgress(routeNavigationSteps, activeRouteProgress, studentRouteUi.camera, activeInspectedStepIndex);
  const activeFloorTransitionSegments = navigationPhase === "origin-indoor"
    ? originIndoorSegments
    : navigationPhase === "destination-indoor"
      ? destinationIndoorSegments
      : [];
  const progressResolvedStepIndex = route ? routeStepIndexForProgress(routeNavigationSteps, displayedRouteProgress) : 0;
  const baseRouteStepIndex = studentRouteUi.phase === "arrived"
    ? Math.max(0, routeNavigationSteps.length - 1)
    : studentRouteUi.phase === "preview"
      ? Math.min(Math.max(0, routeNavigationSteps.length - 1), routePreviewStepIndex)
    : studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow"
      ? Math.min(Math.max(0, routeNavigationSteps.length - 1), Math.floor(playbackCursor + 0.000001))
      : progressResolvedStepIndex;
  // ONE canonical active step drives instruction, highlighted step, route
  // segment, transition marker, Building/Floor context, and camera target.
  const activeRouteStepIndex = canonicalActiveRouteStepIndex({
    playbackIndex: baseRouteStepIndex,
    camera: studentRouteUi.camera,
    inspectedIndex: activeInspectedStepIndex,
    totalSteps: routeNavigationSteps.length,
  });
  // In Preview, choose the next planned transition whose authored source is
  // the context currently being inspected. This keeps one useful active cue
  // without tying Preview exploration to the Follow playback cursor.
  const previewActiveTransitionCue = useMemo(() => {
    if (!route || studentRouteUi.phase !== "preview") return null;
    return studentRouteTransitionCues
      .map((cue) => ({ cue, stepIndex: studentRouteTransitionCueStepIndex(route, routeNavigationSteps, cue.id) }))
      .filter(({ cue, stepIndex }) => {
        if (stepIndex < routePreviewStepIndex) return false;
        const source = studentRouteSeekTarget(route, routeNavigationSteps, stepIndex);
        if (source.context === "campus") return !isFloorMode;
        const segment = source.segment;
        return Boolean(segment && floorView
          && segment.buildingId === floorView.building.id
          && (segment.floorId
            ? segment.floorId === activeFloorPlan?.id
            : segment.floorNumber === floorView.floor));
      })
      .sort((left, right) => left.stepIndex - right.stepIndex)[0] ?? null;
  }, [activeFloorPlan?.id, floorView, isFloorMode, route, routeNavigationSteps, routePreviewStepIndex, studentRouteTransitionCues, studentRouteUi.phase]);
  const exploreTransitionCues = useMemo(() => {
    if (!route || studentRouteUi.phase !== "navigating" || studentRouteUi.camera !== "explore"
      || activeInspectedStepIndex === null) return [];
    return studentRouteExploreTransitionCues(
      route,
      routeNavigationSteps,
      studentRouteTransitionCues,
      activeInspectedStepIndex,
    );
  }, [activeInspectedStepIndex, route, routeNavigationSteps, studentRouteTransitionCues, studentRouteUi.camera, studentRouteUi.phase]);
  const exploreActiveTransitionCue = exploreTransitionCues[0] ?? null;
  const activeTransitionStepIndex = studentRouteUi.phase === "preview"
    ? previewActiveTransitionCue?.stepIndex ?? -1
    : studentRouteUi.phase === "navigating" && studentRouteUi.camera === "explore"
      ? exploreActiveTransitionCue?.transitionStepIndex ?? -1
      : studentRouteUi.phase === "navigating" ? activeRouteStepIndex : -1;
  const activeRouteTransition = useMemo(() => route && activeTransitionStepIndex >= 0
    ? routeTransitionForStep(route, routeNavigationSteps, activeTransitionStepIndex)
    : null, [activeTransitionStepIndex, route, routeNavigationSteps]);
  const activeRouteTransitionDisplayLabel = activeRouteTransition?.detail
    ? studentRouteTransitionCues.find((cue) => cue.id === activeRouteTransition.detail?.nodeId)?.displayLabel
    : undefined;
  const verticalRunHandoffBusy = Boolean(autoVerticalTraversalSharedIdRef.current
    && routeTransitionBusy
    && (activeRouteTransition?.kind === "stairs" || activeRouteTransition?.kind === "elevator"));
  const verticalRunPauseAvailable = verticalRunHandoffBusy && !verticalRunPausePending;
  const authorizedVerticalRunPaused = Boolean(autoVerticalTraversalSharedIdRef.current
    && studentRouteUi.phase === "navigating"
    && studentRouteUi.camera === "follow"
    && studentRouteUi.playback === "paused"
    && navigationPauseReason === "manual"
    && route
    && studentRouteVerticalTransitionContinuesRun(route, routeNavigationSteps, activeRouteStepIndex, autoVerticalTraversalSharedIdRef.current));
  const routeStepSeeking = stepSeekTargetRef.current !== null;
  const routeControlStepIndex = stepSeekTargetRef.current ?? activeRouteStepIndex;
  // Transition actions belong to the real playback cursor, never to the step
  // currently being inspected in Explore. A stair preview several steps ahead
  // is not a handoff the student has reached yet.
  const routePlaybackStepIndex = routeNavigationSteps.length > 0
    ? Math.max(0, Math.min(routeNavigationSteps.length - 1, Math.floor(playbackCursor + 0.000001)))
    : 0;
  const pendingTransitionSource = route && studentRouteUi.phase === "navigating"
    ? studentRouteSeekTarget(route, routeNavigationSteps, routePlaybackStepIndex)
    : null;
  const pendingTransitionSourceIsVisible = pendingTransitionSource?.context === "floor"
    ? Boolean(isFloorMode && floorView
      && pendingTransitionSource.segment?.buildingId === floorView.building.id
      && (pendingTransitionSource.segment.floorNumber === undefined
        || pendingTransitionSource.segment.floorNumber === floorView.floor))
    : Boolean(pendingTransitionSource && !isFloorMode);
  const pendingRouteTransition = route
    && studentRouteUi.phase === "navigating"
    && studentRouteUi.playback === "paused"
    && navigationPauseReason === "transition"
    && !routeTransitionBusy
    && !routeStepSeeking
    && pendingTransitionSourceIsVisible
    ? routeTransitionForStep(route, routeNavigationSteps, routePlaybackStepIndex)
    : null;
  const activeRoutePrimaryAction = routeStepSeeking || verticalRunHandoffBusy ? "pause" : studentRoutePrimaryAction({
    phase: studentRouteUi.phase,
    playback: studentRouteUi.playback,
    hasAuthoredTransition: Boolean(pendingRouteTransition),
    isArrival: studentRouteUi.phase === "arrived",
    hasAuthorizedVerticalRun: authorizedVerticalRunPaused,
  });
  const transitionAwaitingAction = Boolean(studentRouteUi.phase === "navigating"
    && activeRoutePrimaryAction === "continue-transition"
    && !routeStepSeeking
    && !routeTransitionBusy);
  const guidedAccessTransitionCue = useMemo(() => {
    if (!route || studentRouteUi.phase !== "navigating" || studentRouteUi.camera !== "follow"
      || studentRouteUi.playback !== "paused" || navigationPauseReason !== "transition" || routeStepSeeking
      || !studentRouteShouldPauseAtZeroWalkVerticalAccess(route, routeNavigationSteps, activeRouteStepIndex)) return null;
    const transitionStepIndex = activeRouteStepIndex + 1;
    const transition = routeTransitionForStep(route, routeNavigationSteps, transitionStepIndex);
    if ((transition?.kind !== "stairs" && transition?.kind !== "elevator") || !transition.detail) return null;
    const cue = studentRouteTransitionCues.find((candidate) => candidate.id === transition.detail?.nodeId);
    return cue ? { cue, transitionStepIndex } : null;
  }, [activeRouteStepIndex, navigationPauseReason, route, routeNavigationSteps, routeStepSeeking, studentRouteTransitionCues, studentRouteUi.camera, studentRouteUi.phase, studentRouteUi.playback]);
  const transitionPrompt = useMemo(() => {
    if (!transitionAwaitingAction || !route || !pendingRouteTransition) return null;
    const detail = pendingRouteTransition.detail;
    const transitionName = detail?.label?.trim();
    const nextTarget = studentRouteSeekTarget(route, routeNavigationSteps, routePlaybackStepIndex + 1);
    switch (pendingRouteTransition.kind) {
      case "enter_building": {
        const name = activeCampus?.buildings.find((building) => building.id === nextTarget.segment?.buildingId)?.code
          ?? "the building";
        return `You’re at the ${name} entrance. Tap Enter ${name} on the map or press Continue.`;
      }
      case "exit_building":
        return "You’re at the building exit. Tap Exit to Campus on the map or press Continue.";
      case "elevator":
        return `Tap the ${transitionName || "elevator"} or press Continue.`;
      case "stairs":
        return `Tap the ${transitionName || "stairs"} or press Continue.`;
      default:
        return "You’re at the route transition. Tap its marker or press Continue.";
    }
  }, [activeCampus?.buildings, pendingRouteTransition, route, routeNavigationSteps, routePlaybackStepIndex, transitionAwaitingAction]);
  const transitionActionLabel = useMemo(() => {
    if (!transitionAwaitingAction || !route || !pendingRouteTransition) return "Continue";
    const nextTarget = studentRouteSeekTarget(route, routeNavigationSteps, routePlaybackStepIndex + 1);
    switch (pendingRouteTransition.kind) {
      case "enter_building": return "Enter Building";
      case "exit_building": return "Continue Outside";
      case "stairs":
      case "elevator":
        return `Continue to ${studentRouteFloorLabel(nextTarget.segment, nextTarget.segment?.floorNumber === 1 ? "Ground Floor" : "the next Floor")}`;
      default: return "Continue";
    }
  }, [pendingRouteTransition, route, routeNavigationSteps, routePlaybackStepIndex, transitionAwaitingAction]);
  const activeRouteSegmentBuilding = activeIndoorSegment
    ? activeCampus?.buildings.find((building) => building.id === activeIndoorSegment.buildingId)
    : undefined;
  const activeRouteSegmentFloor = activeIndoorSegment
    ? indoorSegmentFloorNumber(activeIndoorSegment, activeRouteSegmentBuilding, roomDestination?.floorNumber ?? roomOrigin?.floorNumber)
    : undefined;
  const inspectedRouteSeekTarget = route && studentRouteUi.phase === "navigating"
    && studentRouteUi.camera === "explore" && activeInspectedStepIndex !== null
    ? studentRouteSeekTarget(route, routeNavigationSteps, activeInspectedStepIndex)
    : null;
  const previewTransitionSeekTarget = route && studentRouteUi.phase === "preview" && activeTransitionStepIndex >= 0
    ? studentRouteSeekTarget(route, routeNavigationSteps, activeTransitionStepIndex)
    : null;
  const transitionIndoorSegment = studentRouteUi.phase === "preview"
    ? previewTransitionSeekTarget?.segment ?? null
    : inspectedRouteSeekTarget?.segment ?? activeIndoorSegment;
  const transitionIndoorFloor = transitionIndoorSegment
    ? indoorSegmentFloorNumber(transitionIndoorSegment,
        activeCampus?.buildings.find((building) => building.id === transitionIndoorSegment.buildingId),
        transitionIndoorSegment.afterOutdoor ? roomDestination?.floorNumber : roomOrigin?.floorNumber)
    : undefined;
  const activeRouteTransitionPoint = useMemo(() => {
    if (!route || !activeRouteTransition) return null;
    if (activeRouteTransition.handoff) {
      const source = studentRouteSeekTarget(route, routeNavigationSteps, activeTransitionStepIndex);
      const sourceIsVisible = source.context === "campus"
        ? !isFloorMode
        : Boolean(source.segment && floorView && activeFloorPlan
          && source.segment.buildingId === floorView.building.id
          && (source.segment.floorId
            ? source.segment.floorId === activeFloorPlan.id
            : source.segment.floorNumber === floorView.floor));
      return sourceIsVisible ? activeRouteTransition.handoff.sourcePoint : null;
    }
    const routeSegmentMatchesVisibleFloor = Boolean(
      transitionIndoorSegment
      && floorView
      && activeFloorPlan
      && transitionIndoorSegment.buildingId === floorView.building.id
      && (transitionIndoorSegment.floorId
        ? transitionIndoorSegment.floorId === activeFloorPlan.id
        : transitionIndoorFloor === floorView.floor),
    );
    if (activeRouteTransition.kind === "enter_building" && !isFloorMode) {
      const campusPoints = route.campusPoints?.length ? route.campusPoints : route.points;
      return campusPoints.at(-1) ?? null;
    }
    if (activeRouteTransition.kind === "exit_building" && isFloorMode) {
      return routeSegmentMatchesVisibleFloor ? transitionIndoorSegment?.waypoints.at(-1) ?? null : null;
    }
    if ((activeRouteTransition.kind === "stairs" || activeRouteTransition.kind === "elevator") && isFloorMode && activeFloorPlan) {
      if (!routeSegmentMatchesVisibleFloor) return null;
      return (activeRouteTransition.detail && authoredFloorTransitionPoint(activeFloorPlan, activeCampus?.navNodes ?? [], activeRouteTransition.detail))
        ?? transitionIndoorSegment?.waypoints.at(-1)
        ?? null;
    }
    return null;
  }, [activeCampus?.navNodes, activeFloorPlan, activeRouteTransition, activeTransitionStepIndex, floorView, isFloorMode, route, routeNavigationSteps, transitionIndoorFloor, transitionIndoorSegment]);
  // Presentation-only matching: authored route waypoints already include the
  // selected entrance/exit connection point. Use that existing geometry to
  // softly mark relevant physical transition controls without changing route
  // selection or graph semantics.
  const routeRelevantEntranceIds = useMemo(() => {
    if (!route || !activeCampus) return new Set<string>();
    const routePoints = route.campusPoints?.length ? route.campusPoints : route.points;
    const relevant = new Set<string>();
    for (const building of activeCampus.buildings) {
      for (const entrance of building.entrances ?? []) {
        if (normalizeEntranceType(entrance.type) === "emergency_exit") continue;
        const point = entranceWorldPosition(building, entrance);
        if (routePoints.some((routePoint) => Math.hypot(routePoint.x - point.x, routePoint.y - point.y) <= 3)) {
          relevant.add(entrance.id);
        }
      }
    }
    return relevant;
  }, [activeCampus, route]);
  const activeOutdoorEntranceId = useMemo(() => {
    if (!activeCampus || activeRouteTransition?.kind !== "enter_building" || !activeRouteTransitionPoint) return null;
    let closest: { id: string; distance: number } | null = null;
    for (const building of activeCampus.buildings) {
      for (const entrance of building.entrances ?? []) {
        if (normalizeEntranceType(entrance.type) === "emergency_exit" || normalizeEntranceDirection(entrance) === "exit_only") continue;
        const point = entranceWorldPosition(building, entrance);
        const distance = Math.hypot(point.x - activeRouteTransitionPoint.x, point.y - activeRouteTransitionPoint.y);
        if (!closest || distance < closest.distance) closest = { id: entrance.id, distance };
      }
    }
    return closest && closest.distance <= 8 ? closest.id : null;
  }, [activeCampus, activeRouteTransition, activeRouteTransitionPoint]);
  // Keep this derived ID adjacent to its source and before callbacks that use
  // it. In particular, activateCurrentRouteTransition closes over the owning
  // Building ID during render, so declaring it below that callback hits the
  // JavaScript temporal dead zone on initial Student Map render.
  const activeOutdoorEntranceBuildingId = useMemo(
    () => activeCampus?.entrances?.find((entrance) => entrance.id === activeOutdoorEntranceId)?.buildingId ?? null,
    [activeCampus?.entrances, activeOutdoorEntranceId],
  );
  const activeRouteEnterBuildingId = activeRouteTransition?.kind === "enter_building" && route
    ? studentRouteSeekTarget(route, routeNavigationSteps, activeTransitionStepIndex + 1).segment?.buildingId
      ?? previewTransitionSeekTarget?.segment?.buildingId
      ?? route.destinationRoom?.buildingId
      ?? activeOutdoorEntranceBuildingId
    : null;
  const routeRelevantExitDoorIds = useMemo(() => {
    if (!route || !floorView || !activeFloorPlan) return new Set<string>();
    const routePoints = (route.indoorSegments ?? [])
      .filter((segment) => segment.buildingId === floorView.building.id
        && (segment.floorId ? segment.floorId === activeFloorPlan.id : segment.floorNumber === floorView.floor))
      .flatMap((segment) => segment.waypoints);
    return new Set((activeFloorPlan.doors ?? []).filter((door) =>
      interactiveExitDoorIds.has(door.id)
      && routePoints.some((point) => Math.hypot(point.x - door.x, point.y - door.y) <= 3),
    ).map((door) => door.id));
  }, [activeFloorPlan, floorView, interactiveExitDoorIds, route]);
  const activeExitDoorId = useMemo(() => {
    if (!isFloorMode || !floorView || !activeFloorPlan || activeRouteTransition?.kind !== "exit_building" || !activeRouteTransitionPoint) return null;
    let closest: { id: string; distance: number } | null = null;
    for (const door of activeFloorPlan.doors ?? []) {
      if (!interactiveExitDoorIds.has(door.id)) continue;
      const distance = Math.hypot(door.x - activeRouteTransitionPoint.x, door.y - activeRouteTransitionPoint.y);
      if (!closest || distance < closest.distance) closest = { id: door.id, distance };
    }
    return closest && closest.distance <= 8 ? closest.id : null;
  }, [activeFloorPlan, activeRouteTransition, activeRouteTransitionPoint, floorView, interactiveExitDoorIds, isFloorMode]);
  const inspectRoutePreviewTransition = useCallback((cueId: string) => {
    if (!route || studentRouteUi.phase !== "preview"
      || previewActiveTransitionCue?.cue.id !== cueId) return;
    const target = studentRoutePreviewTransitionTarget(route, routeNavigationSteps, cueId);
    if (!target) return;

    const point = pointAlongPolyline(studentRouteTargetPoints(route, target), target.context === "floor" ? target.segmentProgress : target.routeProgress);

    if (target.context === "floor" && target.segment) {
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === target.segment!.buildingId);
      const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === target.segment!.buildingId);
      const floor = indoorSegmentFloorNumber(
        target.segment,
        publishedBuilding,
        target.phase === "origin-indoor" ? roomOrigin?.floorNumber : roomDestination?.floorNumber,
      );
      if (!building || floor === undefined) return;
      setRoutePreviewStepIndex(target.targetStepIndex);
      setIndoorRoute(indoorRouteFromSegment(target.segment));
      setHighlightedRoom(route.destinationRoom?.buildingId === building.id
        && route.destinationRoom.floorNumber === floor ? route.destinationRoom.roomId : null);
      const contextKey = `${building.id}:${floor}`;
      if (!floorView || floorView.building.id !== building.id || floorView.floor !== floor) {
        pendingRouteRecenterRef.current = { contextKey, point, floor: true };
        setFloorView({ building, floor });
      } else {
        focusRouteStartView(point, true);
      }
      return;
    }

    // A route to a Building (without a selected Room) may have no indoor
    // segment. Still let its authored Enter action take the student inside.
    if (target.context === "campus" && previewActiveTransitionCue.cue.kind === "enter_building") {
      const buildingId = route.destinationRoom?.buildingId ?? activeOutdoorEntranceBuildingId;
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === buildingId);
      if (building) {
        setRoutePreviewStepIndex(target.targetStepIndex);
        setIndoorRoute(null);
        openFloorPlan(building);
        return;
      }
    }

    setRoutePreviewStepIndex(target.targetStepIndex);
    if (floorView) {
      pendingRouteRecenterRef.current = { contextKey: "campus", point, floor: false };
      setFloorView(null);
      setIndoorRoute(null);
    } else {
      focusRouteStartView(point, false);
    }
  }, [activeCampus?.buildings, activeOutdoorEntranceBuildingId, floorView, focusRouteStartView, openFloorPlan, previewActiveTransitionCue, roomDestination?.floorNumber, roomOrigin?.floorNumber, route, routeNavigationSteps, studentRouteUi.phase]);
  const activateCurrentRouteTransition = useCallback(() => {
    if (studentRouteUi.phase !== "navigating" || studentRouteUi.playback !== "paused"
      || navigationPauseReason !== "transition" || !route) return;
    if (routeContextIsElsewhereRef.current) {
      // Explore can temporarily display another floor. Do not turn its
      // contextual Continue action into an implicit Follow/recenter command.
      if (studentRouteUi.camera === "explore") return;
      if (followCameraReacquiringRef.current) return;
      const routeAtRequest = route;
      const cursorAtRequest = playbackCursorRef.current;
      recenterCurrentRouteStepRef.current("paused", () => {
        const stale = routeRef.current !== routeAtRequest
          || playbackCursorRef.current !== cursorAtRequest
          || routeContextIsElsewhereRef.current;
        if (stale) return;
        activateCurrentRouteTransitionRef.current();
      });
      return;
    }
    const transitionStepIndex = Math.max(0, Math.min(routeNavigationSteps.length - 1,
      Math.floor(playbackCursorRef.current + 0.000001)));
    const activeTransition = routeTransitionForStep(route, routeNavigationSteps, transitionStepIndex);
    if (!activeTransition || routeTransitionBusy
      || followCameraReacquiringRef.current
      || stepSeekTargetRef.current !== null || routeTransitionActivationRef.current === transitionStepIndex) return;
    const transition = routeTransitionForStep(route, routeNavigationSteps, transitionStepIndex);
    if (transition?.kind !== activeTransition.kind) return;
    // A student who explicitly presses Continue after closing the video is
    // taking ownership of the next transition and may resume its following leg.
    // Auto-continuation cannot clear this latch because its effect is gated
    // while the video remains open.
    emergencyVideoPauseLatchRef.current = false;
    // A route seek deliberately parks at a transition and leaves the leg
    // clock gated. Once the student activates that transition, the new leg
    // owns playback and the stale seek gate must be released.
    pendingTransitionSeekRef.current = false;
    const nextStepIndex = Math.min(routeNavigationSteps.length - 1, transitionStepIndex + 1);
    const sourceTarget = studentRouteSeekTarget(route, routeNavigationSteps, transitionStepIndex);
    const nextTarget = studentRouteSeekTarget(route, routeNavigationSteps, nextStepIndex);
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    stepSeekAnimRef.current = null;
    stepSeekTargetRef.current = null;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    stepSeekTransitionTimerRef.current = null;

    if (activeTransition.kind === "enter_building" && navigationPhase === "outdoor") {
      const targetBuildingId = nextTarget.segment?.buildingId ?? route.destinationRoom?.buildingId ?? activeOutdoorEntranceBuildingId;
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === targetBuildingId);
      if (!building) return;
      transitionResumePlaybackRef.current = true;
      autoVerticalTraversalSharedIdRef.current = null;
      routeTransitionActivationRef.current = transitionStepIndex;
      const pauseAtZeroWalkAccess = studentRouteShouldPauseAtZeroWalkVerticalAccess(
        route, routeNavigationSteps, nextStepIndex,
      );
      setStairLoading({ dir: "up", label: `Entering ${building.name}` });
      setNavigationTransitioning(true);
      stepSeekTransitionTimerRef.current = setTimeout(() => {
        stepSeekTransitionTimerRef.current = null;
        setStairLoading(null);
        if (nextTarget.segment && nextTarget.segment.buildingId === building.id) {
          const segments = indoorSegmentsForBuilding(route, building.id, "after-outdoor");
          const segmentIndex = segments.indexOf(nextTarget.segment);
          const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === building.id);
          const floor = indoorSegmentFloorNumber(nextTarget.segment, publishedBuilding,
            roomDestination?.floorNumber ?? building.floors?.[0]?.number ?? 1);
          if (segmentIndex < 0 || floor === undefined) {
            setNavigationTransitioning(false);
            routeTransitionActivationRef.current = null;
            return;
          }
          setDestinationIndoorSegments(segments);
          setDestinationIndoorSegmentIndex(segmentIndex);
          setFloorView({ building, floor });
          setIndoorRoute(indoorRouteFromSegment(nextTarget.segment));
          setIndoorWalkProgress(0);
          indoorWalkProgressRef.current = 0;
          setIndoorWalkNonce((nonce) => nonce + 1);
          const targetRoomId = route.destinationRoom?.buildingId === building.id
            && route.destinationRoom.floorNumber === floor ? route.destinationRoom.roomId : null;
          setActiveRouteRoom(targetRoomId);
          setHighlightedRoom(targetRoomId);
          setNavigationPhase("destination-indoor");
          routeEntryTransitionCompleteRef.current = true;
          playbackCursorRef.current = nextStepIndex;
          setPlaybackCursor(nextStepIndex);
        } else if (route.destinationRoom && route.destinationRoom.buildingId === building.id) {
          enterDestinationRouteFloor(route.destinationRoom);
          routeEntryTransitionCompleteRef.current = true;
          playbackCursorRef.current = nextStepIndex;
          setPlaybackCursor(nextStepIndex);
        } else {
          const segments = indoorSegmentsForBuilding(route, building.id, "after-outdoor");
          const segment = nextTarget.segment ?? segments[0];
          const segmentIndex = segment ? segments.indexOf(segment) : -1;
          if (segment && segmentIndex >= 0) {
            const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === building.id);
            const floor = indoorSegmentFloorNumber(segment, publishedBuilding, roomDestination?.floorNumber ?? building.floors?.[0]?.number ?? 1);
            if (floor === undefined) {
              setNavigationTransitioning(false);
              routeTransitionActivationRef.current = null;
              return;
            }
            setDestinationIndoorSegments(segments);
            setDestinationIndoorSegmentIndex(segmentIndex);
            setFloorView({ building, floor });
            setIndoorRoute(indoorRouteFromSegment(segment));
            setIndoorWalkProgress(0);
            setIndoorWalkNonce((nonce) => nonce + 1);
            setNavigationPhase("destination-indoor");
          } else {
            openFloorPlan(building);
            setIndoorRoute(null);
            setNavigationPhase("destination-indoor");
          }
          routeEntryTransitionCompleteRef.current = true;
          playbackCursorRef.current = nextStepIndex;
          setPlaybackCursor(nextStepIndex);
        }
        setNavigationTransitioning(false);
        if (transitionResumePlaybackRef.current) {
          const canResume = studentRouteCanResumeAfterTransition(
            transitionResumePlaybackRef.current,
            emergencyVideoPauseLatchRef.current,
          );
          transitionResumePlaybackRef.current = false;
          if (!canResume) {
            setNavigationPauseReason("manual");
          } else if (pauseAtZeroWalkAccess) {
            setNavigationPauseReason("transition");
          } else {
            setNavigationPauseReason(null);
            dispatchStudentRouteUi({ type: "RESUME" });
          }
        }
        routeTransitionActivationRef.current = null;
      }, reducedMotion ? 0 : 420);
      return;
    }

    const isFloorHandoff = activeTransition.kind === "stairs" || activeTransition.kind === "elevator";
    const isBuildingExit = activeTransition.kind === "exit_building"
      && sourceTarget.context === "floor" && nextTarget.context === "campus";
    if (!isFloorHandoff && !isBuildingExit) return;
    if (isFloorHandoff) {
      const detail = transition.detail;
      if (!detail || !sourceTarget.segment || !nextTarget.segment
        || sourceTarget.context !== "floor" || nextTarget.context !== "floor"
        || sourceTarget.segment.buildingId !== nextTarget.segment.buildingId
        || detail.kind !== transition.kind
        || detail.fromFloorId && sourceTarget.segment.floorId && detail.fromFloorId !== sourceTarget.segment.floorId
        || detail.toFloorId && detail.toFloorId !== nextTarget.segment.floorId) return;
    } else if (!sourceTarget.segment || nextTarget.context !== "campus") {
      return;
    }
    // Continue authorizes the handoff and the following walk. This also makes
    // a transition reached by Previous/Next flow into Follow without a second
    // Resume action.
    const continueInFollow = studentRouteUi.camera === "follow";
    transitionResumePlaybackRef.current = continueInFollow;
    if (!continueInFollow) {
      // Complete the authored handoff while retaining Explore and its paused
      // canonical marker. A newly reached zero-walk access can set this back
      // to "transition" after the floor context has changed.
      setNavigationPauseReason("manual");
      setInspectedRouteStepIndex(nextStepIndex);
    }
    if (isFloorHandoff) {
      const runId = studentRouteVerticalTransitionRunId(route, routeNavigationSteps, transitionStepIndex);
      const nextGroupId = studentRouteVerticalTransitionGroupId(route, routeNavigationSteps, transitionStepIndex);
      const continuingCurrentRun = Boolean(runId && autoVerticalTraversalSharedIdRef.current === runId);
      // Keep the run identity through its final handoff. That lets Pause land
      // safely at the newly reached Floor, and the following callback clears
      // the run after it has completed.
      autoVerticalTraversalSharedIdRef.current = nextGroupId ?? (continuingCurrentRun ? runId : null);
      verticalRunEndsAfterTransitionRef.current = continuingCurrentRun && !nextGroupId;
    } else {
      autoVerticalTraversalSharedIdRef.current = null;
      verticalRunEndsAfterTransitionRef.current = false;
    }
    // The authored step is now active at the human's exact segment boundary.
    // The route leg effect consumes this one-shot request and performs the
    // single Floor/Building handoff, including when playback is paused.
    routeTransitionActivationRef.current = transitionStepIndex;
    setNavigationTransitioning(true);
    setRouteTransitionActivationNonce((value) => value + 1);
    if (activeTransition.kind === "stairs" || activeTransition.kind === "elevator") {
      indoorWalkProgressRef.current = 1;
      setIndoorWalkProgress(1);
    } else if (isBuildingExit) {
      indoorWalkProgressRef.current = 1;
      setIndoorWalkProgress(1);
    }
  }, [activeCampus?.buildings, activeOutdoorEntranceBuildingId, enterDestinationRouteFloor, navigationPauseReason, navigationPhase, openFloorPlan, reducedMotion, roomDestination?.floorNumber, route, routeNavigationSteps, routeTransitionBusy, studentRouteUi.camera, studentRouteUi.phase, studentRouteUi.playback]);
  activateCurrentRouteTransitionRef.current = activateCurrentRouteTransition;
  useEffect(() => {
    if (!transitionAwaitingAction || !route || studentRouteUi.phase !== "navigating"
      || emergencyVideoPauseLatchRef.current || emergencyVideoOverlayKey
      || studentRouteUi.camera !== "follow") return;
    const continuingGroup = autoVerticalTraversalSharedIdRef.current;
    if (!continuingGroup) return;
    if (!studentRouteVerticalTransitionContinuesRun(route, routeNavigationSteps, activeRouteStepIndex, continuingGroup)) {
      autoVerticalTraversalSharedIdRef.current = null;
      return;
    }
    // A same-shaft zero-walk floor is a continuous traversal, not a new
    // decision point. The transition callback still performs the authored
    // handoff and keeps the ordinary boundary animation/camera behavior.
    activateCurrentRouteTransitionRef.current();
  }, [activeRouteStepIndex, emergencyVideoOverlayKey, route, routeNavigationSteps, studentRouteUi.camera, studentRouteUi.phase, transitionAwaitingAction]);
  const handleStudentFloorDoorClick = useCallback((doorId: string) => {
    const exploring = studentRouteUi.phase === "navigating" && studentRouteUi.camera === "explore";
    if (exploring) {
      if (doorId === activeExitDoorId && activeRouteTransition?.kind === "exit_building") {
        inspectGuidedRouteTransitionRef.current(activeTransitionStepIndex);
        return;
      }
      // Keep generic authored doors inspectable without touching Follow. 3D's
      // campus/floor presentation is controlled by the active scene layer.
      if (campusViewMode === "3d") {
        setFloorView(null);
        setIndoorRoute(null);
        return;
      }
      handleFloorDoorClick(doorId);
      return;
    }
    if (doorId === activeExitDoorId && activeRouteTransition?.kind === "exit_building") {
      activateCurrentRouteTransition();
    } else {
      handleFloorDoorClick(doorId);
    }
  }, [activeExitDoorId, activeRouteTransition?.kind, activeTransitionStepIndex, activateCurrentRouteTransition, campusViewMode, handleFloorDoorClick, studentRouteUi.camera, studentRouteUi.phase]);
  const handleStudentOutdoorEntranceClick = useCallback((buildingId: string) => {
    const exploring = studentRouteUi.phase === "navigating" && studentRouteUi.camera === "explore";
    if (exploring) {
      const routeEntryIndex = route
        ? routeNavigationSteps.findIndex((_, index) => {
            const transition = routeTransitionForStep(route, routeNavigationSteps, index);
            return transition?.kind === "enter_building"
              && (transition.handoff?.buildingId ?? transition.detail?.buildingId) === buildingId;
          })
        : -1;
      if (routeEntryIndex >= 0) {
        inspectGuidedRouteTransitionRef.current(routeEntryIndex);
        return;
      }
      if (buildingId === activeOutdoorEntranceBuildingId && activeRouteTransition?.kind === "enter_building") {
        inspectGuidedRouteTransitionRef.current(activeTransitionStepIndex);
        return;
      }
      handleOutdoorEntranceClick(buildingId);
      return;
    }
    if (buildingId === activeOutdoorEntranceBuildingId && activeRouteTransition?.kind === "enter_building") {
      activateCurrentRouteTransition();
    } else {
      handleOutdoorEntranceClick(buildingId);
    }
  }, [activeOutdoorEntranceBuildingId, activeRouteTransition?.kind, activeTransitionStepIndex, activateCurrentRouteTransition, handleOutdoorEntranceClick, route, routeNavigationSteps, studentRouteUi.camera, studentRouteUi.phase]);
  const routeContextIsElsewhere = navigationPhase === "outdoor" && isFloorMode
    || Boolean(activeIndoorSegment && (!floorView
      || floorView.building.id !== activeIndoorSegment.buildingId || floorView.floor !== activeRouteSegmentFloor));
  routeContextIsElsewhereRef.current = routeContextIsElsewhere;
  const routeContextKey = isFloorMode && floorView ? `${floorView.building.id}:${floorView.floor}` : "campus";
  activeFollowCameraContextKeyRef.current = routeContextKey;
  const onIndoor3DCameraRecenterComplete = useCallback((nonce: number) => {
    on3DCameraRecenterComplete(nonce, routeContextKey);
  }, [on3DCameraRecenterComplete, routeContextKey]);
  useLayoutEffect(() => {
    const pending = pendingRouteRecenterRef.current;
    if (!pending || pending.contextKey !== routeContextKey) return;
    pendingRouteRecenterRef.current = null;
    focusRouteStartView(pending.point, pending.floor, pending.source, pending.onComplete, pending.forceRecenter3D, pending.followOffset);
  }, [activeFloorPlan, floorViewport.offsetX, floorViewport.offsetY, focusRouteStartView, routeContextKey]);

  const recenterCurrentRouteStep = useCallback((resumePlayback?: "playing" | "paused", afterRecenter?: () => void) => {
    if (!route || studentRouteUi.phase !== "navigating") return;
    // Recenter changes only camera/context state. Playback and both progress
    // refs remain untouched until the active renderer finishes reacquiring.
    const requestId = ++followRecenterRequestRef.current;
    followRecenterIntentRef.current = { resumePlayback, afterRecenter };
    followCameraReacquiringRef.current = true;
    followCameraPoseCaptureSuppressedRef.current = true;
    const routeAtRequest = routeRef.current;
    setFollowCameraRecoveryFailed(false);
    clearFollowCameraRecoveryTimer();
    const failRecovery = () => {
      if (requestId !== followRecenterRequestRef.current || !followCameraReacquiringRef.current) return;
      clearFollowCameraRecoveryTimer();
      followRecenterRequestRef.current += 1;
      followRecenterIntentRef.current = null;
      followCameraReacquiringRef.current = false;
      pendingRouteRecenterRef.current = null;
      cancelPendingCampus3DCameraRecenter();
      cancelCameraAnimation(false);
      setFollowCameraDetached(true);
      setNavigationPauseReason("pan");
      setFollowCameraRecoveryFailed(true);
      dispatchStudentRouteUi({ type: "PAUSE" });
    };
    const onComplete = () => {
      if (requestId !== followRecenterRequestRef.current || routeRef.current !== routeAtRequest) return;
      clearFollowCameraRecoveryTimer();
      followRecenterIntentRef.current = null;
      followCameraReacquiringRef.current = false;
      setFollowCameraRecoveryFailed(false);
      followCameraPoseCaptureSuppressedRef.current = false;
      const currentRoute = routeRef.current;
      const currentSteps = currentRoute ? studentFacingRouteSteps(currentRoute) : [];
      const currentStepIndex = Math.floor(playbackCursorRef.current + 0.000001);
      const handoffStillPending = Boolean(currentRoute
        && routeTransitionForStep(currentRoute, currentSteps, currentStepIndex));
      // Reacquiring at an authored handoff must keep its Continue state. If
      // this reason is cleared, playback correctly stays paused but the UI
      // offers Resume, which correctly refuses to cross that handoff.
      setNavigationPauseReason(studentRoutePauseReasonAfterCameraReacquisition(resumePlayback, handoffStillPending));
      dispatchStudentRouteUi({ type: "RECENTER_COMPLETE", pauseAtTransition: handoffStillPending });
      afterRecenter?.();
    };
    setInspectedRouteStepIndex(null);
    setFollowCameraDetached(false);
    dispatchStudentRouteUi({ type: "RECENTER", resumePlayback });
    // A successful renderer callback clears this watchdog. If a scene never
    // mounts or a stale context loses the completion, leave an actionable
    // failure state instead of briefly exposing Retry during normal movement.
    followCameraRecoveryTimerRef.current = setTimeout(failRecovery, 8000);

    const focusTarget = studentRouteFocusAtProgress(
      navigationPhase,
      route.points,
      walkProgressRef.current,
      activeIndoorSegment,
      indoorWalkProgressRef.current,
    );
    if (focusTarget.context === "floor" && activeIndoorSegment) {
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === activeIndoorSegment.buildingId);
      if (!building) { failRecovery(); return; }
      const floor = indoorSegmentFloorNumber(
        activeIndoorSegment,
        activeCampus?.buildings.find((candidate) => candidate.id === activeIndoorSegment.buildingId),
        roomDestination?.floorNumber ?? roomOrigin?.floorNumber,
      );
      if (floor === undefined) { failRecovery(); return; }
      const point = focusTarget.point;
      const contextKey = `${building.id}:${floor}`;
      const followOffset = followCameraOffsetsByContextRef.current.get(contextKey) ?? null;
      setIndoorRoute(indoorRouteFromSegment(activeIndoorSegment));
      if (route.destinationRoom?.buildingId === building.id) {
        setHighlightedRoom(floor === route.destinationRoom.floorNumber ? route.destinationRoom.roomId : null);
      }
      if (routeContextKey === contextKey) {
        focusRouteStartView(point, true, "route-inspection", onComplete, true, followOffset);
      } else {
        pendingRouteRecenterRef.current = { contextKey, point, floor: true, source: "route-inspection", onComplete, forceRecenter3D: true, followOffset };
        setFloorView({ building, floor });
      }
      return;
    }

    const point = focusTarget.point;
    const followOffset = followCameraOffsetsByContextRef.current.get("campus") ?? null;
    if (routeContextKey !== "campus") {
      pendingRouteRecenterRef.current = { contextKey: "campus", point, floor: false, source: "route-inspection", onComplete, forceRecenter3D: true, followOffset };
      setFloorView(null);
      setIndoorRoute(null);
    } else {
      focusRouteStartView(point, false, "route-inspection", onComplete, true, followOffset);
    }
  }, [activeCampus, activeIndoorSegment, cancelCameraAnimation, cancelPendingCampus3DCameraRecenter, clearFollowCameraRecoveryTimer, dispatchStudentRouteUi, focusRouteStartView, indoorWalkProgressRef, isFloorMode, navigationPhase, route, routeContextKey, roomDestination?.floorNumber, roomOrigin?.floorNumber, studentRouteUi.phase, walkProgressRef]);
  recenterCurrentRouteStepRef.current = recenterCurrentRouteStep;

  const previousRecenterRendererModeRef = useRef(student3DActive);
  useEffect(() => {
    const rendererModeChanged = previousRecenterRendererModeRef.current !== student3DActive;
    previousRecenterRendererModeRef.current = student3DActive;
    if (!rendererModeChanged || studentRouteUi.phase !== "navigating" || !followCameraReacquiringRef.current) return;
    const intent = followRecenterIntentRef.current;
    if (!intent) return;
    // A renderer switch cancels its in-flight camera tween. Transfer the same
    // canonical recovery intent to the newly active renderer instead of
    // waiting for a completion callback from a scene that has been removed.
    cancelPendingCampus3DCameraRecenter();
    cancelCameraAnimation(false);
    recenterCurrentRouteStepRef.current(intent.resumePlayback, intent.afterRecenter);
  }, [cancelCameraAnimation, cancelPendingCampus3DCameraRecenter, student3DActive, studentRouteUi.phase]);

  const stopEmergencyRouteClocks = useCallback(() => {
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    stepSeekAnimRef.current = null;
    walkAnimRef.current = null;
    indoorWalkAnimRef.current = null;
    navigationTransitionAnimRef.current = null;
    stepSeekTargetRef.current = null;
    pendingTransitionSeekRef.current = false;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    if (originIndoorTransitionRef.current) clearTimeout(originIndoorTransitionRef.current);
    if (destinationIndoorTransitionRef.current) clearTimeout(destinationIndoorTransitionRef.current);
    stepSeekTransitionTimerRef.current = null;
    originIndoorTransitionRef.current = null;
    destinationIndoorTransitionRef.current = null;
    transitionResumePlaybackRef.current = false;
    routeTransitionActivationRef.current = null;
    autoVerticalTraversalSharedIdRef.current = null;
    verticalRunEndsAfterTransitionRef.current = false;
    pauseAfterVerticalTransitionRef.current = false;
    setVerticalRunPausePending(false);
    setNavigationTransitioning(false);
    setStairLoading(null);
  }, []);

  const selectAutomaticRouteAlternative = useCallback((routeId: string) => {
    const option = automaticRouteChoices.find((candidate) => candidate.id === routeId);
    if (!option || routeId === activeAutomaticRouteId) return;
    followCameraOffsetsByContextRef.current.clear();
    followCameraPoseCaptureSuppressedRef.current = false;
    stopEmergencyRouteClocks();
    cancelCameraAnimation(false);
    pendingRouteRecenterRef.current = null;
    pendingRouteStartFocusRef.current = null;
    routeStartFocusPendingRef.current = false;
    setArrivalCameraTarget(null);
    setRouteFading(false);
    setShowArrival(false);
    setNavigationPhase("idle");
    setNavigationPauseReason(null);
    setInspectedRouteStepIndex(null);
    setFollowCameraDetached(true);
    setWalkProgress(0);
    walkProgressRef.current = 0;
    setIndoorWalkProgress(0);
    indoorWalkProgressRef.current = 0;
    playbackCursorRef.current = 0;
    setPlaybackCursor(0);
    setRoutePreviewStepIndex(0);
    setRoute(option.route);
    routeRef.current = option.route;
    setActiveAutomaticRouteId(routeId);
    setActiveEmergencyRouteId(null);
    setEmergencyRouteOverview(false);
    setRoutePlannerSelectionError(null);
    const originSegment = roomOrigin
      ? option.route.indoorSegments?.find((segment) => segment.buildingId === roomOrigin.buildingId
        && segment.floorNumber === roomOrigin.floorNumber && !segment.afterOutdoor)
      : undefined;
    if (originSegment) {
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === originSegment.buildingId);
      const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === originSegment.buildingId);
      const floor = indoorSegmentFloorNumber(originSegment, publishedBuilding, roomOrigin?.floorNumber);
      if (building && floor !== undefined) {
        setFloorView({ building, floor });
        setIndoorRoute(indoorRouteFromSegment(originSegment));
        routeStartFocusPendingRef.current = true;
        pendingRouteStartFocusRef.current = { point: originSegment.waypoints[0], floor: true };
      }
    } else {
      setFloorView(null);
      setIndoorRoute(null);
      const startPoint = option.route.campusPoints?.[0] ?? option.route.points[0];
      if (startPoint) {
        routeStartFocusPendingRef.current = true;
        pendingRouteStartFocusRef.current = { point: startPoint, floor: false };
      }
    }
    dispatchStudentRouteUi({ type: "END_NAVIGATION" });
    dispatchStudentRouteUi({ type: "FOUND_ROUTE", preserveCamera: true });
    setDirectionsMode(false);
  }, [MOCK_BUILDINGS, activeAutomaticRouteId, activeCampus?.buildings, automaticRouteChoices, cancelCameraAnimation, dispatchStudentRouteUi, indoorSegmentFloorNumber, roomOrigin, stopEmergencyRouteClocks, walkProgressRef, indoorWalkProgressRef]);

  const selectApprovedEmergencyRoute = useCallback((routeId: string) => {
    const selectedOption = approvedStudentEmergencyRoutes.find((option) => option.id === routeId);
    if (!selectedOption || !activeCampus
      || !isStudentEmergencyRouteCurrentAndEligible(activeCampus, selectedOption.candidate.route, roomOrigin)) {
      setRoutePlannerSelectionError("This emergency route is no longer available. Follow posted campus instructions.");
      return;
    }
    if (routeId === activeEmergencyRouteId) {
      setEmergencyRouteOverview(false);
      return;
    }

    followCameraOffsetsByContextRef.current.clear();
    followCameraPoseCaptureSuppressedRef.current = false;

    stopEmergencyRouteClocks();
    cancelCameraAnimation(false);
    pendingRouteRecenterRef.current = null;
    pendingRouteStartFocusRef.current = null;
    routeStartFocusPendingRef.current = false;
    setArrivalCameraTarget(null);
    setRouteFading(false);
    setShowArrival(false);
    setNavigationPhase("idle");
    setNavigationPauseReason(null);
    setInspectedRouteStepIndex(null);
    setFollowCameraDetached(true);
    setWalkProgress(0);
    walkProgressRef.current = 0;
    setIndoorWalkProgress(0);
    indoorWalkProgressRef.current = 0;
    playbackCursorRef.current = 0;
    setPlaybackCursor(0);
    setRoutePreviewStepIndex(0);
    setRoute(selectedOption.candidate.route);
    routeRef.current = selectedOption.candidate.route;
    setActiveEmergencyRouteId(routeId);
    setEmergencyRouteOverview(false);
    setRoutePlannerSelectionError(null);

    const originSegment = selectedOption.candidate.route.indoorSegments?.find((segment) =>
      segment.buildingId === roomOrigin?.buildingId && segment.floorNumber === roomOrigin.floorNumber && !segment.afterOutdoor,
    );
    if (originSegment) {
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === originSegment.buildingId);
      const originFloorNumber = originSegment.floorNumber ?? roomOrigin?.floorNumber;
      if (building && typeof originFloorNumber === "number" && Number.isFinite(originFloorNumber)) {
        setFloorView({ building, floor: originFloorNumber });
        setIndoorRoute(indoorRouteFromSegment(originSegment));
        if (roomOrigin) {
          setHighlightedRoom(roomOrigin.roomId);
          setActiveRouteRoom(roomOrigin.roomId);
        }
        routeStartFocusPendingRef.current = true;
        pendingRouteStartFocusRef.current = { point: originSegment.waypoints[0], floor: true };
      }
    }
    dispatchStudentRouteUi({ type: "END_NAVIGATION" });
    dispatchStudentRouteUi({ type: "FOUND_ROUTE", preserveCamera: true });
    setDirectionsMode(false);
  }, [MOCK_BUILDINGS, activeCampus, activeEmergencyRouteId, approvedStudentEmergencyRoutes, cancelCameraAnimation, dispatchStudentRouteUi, roomOrigin, stopEmergencyRouteClocks, studentRouteUi.phase, walkProgressRef, indoorWalkProgressRef]);

  const returnToEmergencyRouteOverview = useCallback(() => {
    if (studentRouteUi.phase === "navigating") {
      stopEmergencyRouteClocks();
      dispatchStudentRouteUi({ type: "PAUSE" });
      setNavigationPauseReason("manual");
    } else if (studentRouteUi.phase === "arrived") {
      dispatchStudentRouteUi({ type: "END_NAVIGATION" });
      dispatchStudentRouteUi({ type: "FOUND_ROUTE", preserveCamera: true });
      setShowArrival(false);
    }
    cancelCameraAnimation(false);
    setFollowCameraDetached(true);
    emergencyOverviewCameraRequestRef.current += 1;
    setEmergencyRouteOverview(true);
  }, [cancelCameraAnimation, dispatchStudentRouteUi, stopEmergencyRouteClocks, studentRouteUi.phase]);

  useEffect(() => {
    const multiExitSession = Boolean(activeEmergencyRouteId || emergencyRouteOverview);
    if (!multiExitSession || mapMode !== "emergency" || !roomOrigin) return;
    const selectedStillApproved = activeEmergencyRouteId
      ? smartEmergencyRouteMode && approvedStudentEmergencyRoutes.some((option) => option.id === activeEmergencyRouteId)
      : false;
    if (selectedStillApproved || emergencyRouteOverview && smartEmergencyRouteMode && approvedStudentEmergencyRoutes.length > 1) return;
    if (emergencyRouteOverview && smartEmergencyRouteMode && approvedStudentEmergencyRoutes.length === 1) {
      selectApprovedEmergencyRoute(approvedStudentEmergencyRoutes[0].id);
      return;
    }
    stopEmergencyRouteClocks();
    cancelCameraAnimation(false);
    setRoute(null);
    setAutomaticRouteChoices([]);
    setActiveAutomaticRouteId(null);
    routeRef.current = null;
    setActiveEmergencyRouteId(null);
    setEmergencyRouteOverview(false);
    setNavigationPhase("idle");
    setNavigationTransitioning(false);
    setShowArrival(false);
    setDirectionsMode(true);
    setRoutePlannerSelectionError(studentEmergencyRouteResolution.message
      ?? "The emergency route changed. Follow posted campus instructions while the route is recalculated.");
    dispatchStudentRouteUi({ type: "OPEN_PLAN" });
  }, [activeEmergencyRouteId, approvedStudentEmergencyRoutes, cancelCameraAnimation, dispatchStudentRouteUi, emergencyRouteOverview, mapMode, roomOrigin, selectApprovedEmergencyRoute, smartEmergencyRouteMode, stopEmergencyRouteClocks, studentEmergencyRouteResolution.message]);

  // Building-origin SOS routes have no Route A/B selector state, but their
  // destination assignment or graph can still change while a preview or
  // playback is active. Re-resolve those routes whenever their authored
  // inputs change and stop immediately if the current path is no longer safe.
  useEffect(() => {
    if (mapMode !== "emergency" || roomOrigin || !route
      || !(fromBuilding || fromCampusPlace || (useMyLocation && youAreHere))) return;
    const origin = fromCampusPlace ?? (useMyLocation && youAreHere
      ? { type: "point" as const, ...youAreHere }
      : fromBuilding ? {
          type: "building" as const,
          buildingId: fromBuilding.id,
          label: fromBuilding.name,
          code: fromBuilding.code,
        } : null);
    if (activeCampus && isStudentEmergencyRouteCurrentAndEligible(activeCampus, route, origin)) return;
    stopEmergencyRouteClocks();
    cancelCameraAnimation(false);
    setRoute(null);
    routeRef.current = null;
    setActiveEmergencyRouteId(null);
    setEmergencyRouteOverview(false);
    setNavigationPhase("idle");
    setShowArrival(false);
    setDirectionsMode(true);
    setRoutePlannerSelectionError("The emergency route changed and is no longer eligible. Recalculate or follow posted campus instructions.");
    dispatchStudentRouteUi({ type: "OPEN_PLAN" });
  }, [activeCampus, cancelCameraAnimation, dispatchStudentRouteUi, fromBuilding, fromCampusPlace, mapMode, route, roomOrigin, stopEmergencyRouteClocks, useMyLocation, youAreHere]);

  const seekRouteStep = useCallback((stepIndex: number, options: { selectProgress?: boolean; animate?: boolean } = {}) => {
    if (!route || routeNavigationSteps.length === 0) return;
    const exploreInspection = studentRouteUi.camera === "explore" && !options.selectProgress;
    const replacingSeek = stepSeekTargetRef.current !== null;
    if (!exploreInspection && (studentRouteUi.playback !== "paused" && studentRouteUi.playback !== "playing"
      || (navigationTransitioning || stairLoading) && !replacingSeek)) return;
    const safeIndex = Math.max(0, Math.min(routeNavigationSteps.length - 1, stepIndex));
    if (exploreInspection) {
      // Explore changes only the inspected row and visible map context. The
      // playback cursor, human position, and pause state remain untouched.
      setInspectedRouteStepIndex(safeIndex);
      const target = studentRouteExploreInspectionTarget(route, routeNavigationSteps, safeIndex);
    const point = pointAlongPolyline(studentRouteTargetPoints(route, target), target.context === "floor" ? target.segmentProgress : target.routeProgress);
      if (target.context === "floor" && target.segment) {
        const building = MOCK_BUILDINGS.find((candidate) => candidate.id === target.segment!.buildingId);
        const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === target.segment!.buildingId);
        const floor = indoorSegmentFloorNumber(target.segment, publishedBuilding,
          target.phase === "origin-indoor" ? roomOrigin?.floorNumber : roomDestination?.floorNumber);
        if (!building || floor === undefined) return;
        setIndoorRoute(indoorRouteFromSegment(target.segment));
        const contextKey = `${building.id}:${floor}`;
        if (routeContextKey !== contextKey) {
          pendingRouteRecenterRef.current = { contextKey, point, floor: true };
          setFloorView({ building, floor });
        } else focusRouteStartView(point, true, "route-inspection");
      } else if (routeContextKey !== "campus") {
        pendingRouteRecenterRef.current = { contextKey: "campus", point, floor: false, source: "route-inspection" };
        setFloorView(null);
        setIndoorRoute(null);
      } else focusRouteStartView(point, false, "route-inspection");
      return;
    }

    // Retarget the one seek clock from the human's live cursor. Repeated taps
    // replace the destination while preserving the current visual position.
    // A user initiated seek supersedes any old auto-resume request left by a
    // transition the human reached before pressing Previous / Next.
    transitionResumePlaybackRef.current = false;
    verticalRunEndsAfterTransitionRef.current = false;
    pauseAfterVerticalTransitionRef.current = false;
    setVerticalRunPausePending(false);
    // A seek selects a new canonical step. Do not carry one-shot transition
    // ownership or same-shaft auto-advance state across that boundary.
    routeTransitionActivationRef.current = null;
    autoVerticalTraversalSharedIdRef.current = null;
    const destinationHasTransition = Boolean(routeTransitionForStep(route, routeNavigationSteps, safeIndex));
    const destinationWaitsAtVerticalAccess = studentRouteShouldPauseAtZeroWalkVerticalAccess(
      route, routeNavigationSteps, safeIndex,
    );
    const selectingInstructionInExplore = options.selectProgress === true && studentRouteUi.camera === "explore";
    setNavigationPauseReason(destinationHasTransition || destinationWaitsAtVerticalAccess ? "transition" : "manual");
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    stepSeekAnimRef.current = null;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    stepSeekTransitionTimerRef.current = null;
    // A manual seek owns the cursor from this point on. Pause even if playback
    // was already paused, clearing any stale Explore resume state as well.
    dispatchStudentRouteUi({ type: "SEEK_STEP" });
    const fromPosition = playbackCursorRef.current;
    stepSeekTargetRef.current = safeIndex;
    setInspectedRouteStepIndex(selectingInstructionInExplore ? safeIndex : null);
    if (!selectingInstructionInExplore) setFollowCameraDetached(false);
    pendingTransitionSeekRef.current = true;
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    walkAnimRef.current = null;
    indoorWalkAnimRef.current = null;
    navigationTransitionAnimRef.current = null;
    if (originIndoorTransitionRef.current) clearTimeout(originIndoorTransitionRef.current);
    if (destinationIndoorTransitionRef.current) clearTimeout(destinationIndoorTransitionRef.current);
    originIndoorTransitionRef.current = null;
    destinationIndoorTransitionRef.current = null;
    setNavigationTransitioning(false);
    setStairLoading(null);

    let appliedContext = "";
    let appliedSegment: RouteIndoorSegment | null = null;
    let previousTarget: ReturnType<typeof studentRoutePlaybackTarget> | null = null;
    const applyPosition = (position: number) => {
      const target = studentRoutePlaybackTarget(route, routeNavigationSteps, position);
      const points = studentRouteTargetPoints(route, target);
      const point = pointAlongPolyline(points, target.context === "floor" ? target.segmentProgress : target.routeProgress);
      const isFloorTarget = target.context === "floor" && target.segment;
      followHumanWorldPointRef.current = isFloorTarget
        ? { x: point.x + floorViewport.offsetX, y: point.y + floorViewport.offsetY }
        : point;
      if (isFloorTarget && target.segment) {
        const segments = (route.indoorSegments ?? []).filter((segment) => Boolean(segment.afterOutdoor) === Boolean(target.segment?.afterOutdoor));
        const segmentIndex = segments.indexOf(target.segment);
        const building = MOCK_BUILDINGS.find((candidate) => candidate.id === target.segment!.buildingId);
        const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === target.segment!.buildingId);
        const floor = indoorSegmentFloorNumber(target.segment, publishedBuilding,
          target.phase === "origin-indoor" ? roomOrigin?.floorNumber : roomDestination?.floorNumber);
        if (!building || floor === undefined) return;
        const contextKey = `${building.id}:${floor}`;
        if (contextKey !== appliedContext) {
          if (previousTarget && previousTarget.segmentIndex !== target.segmentIndex) {
            const transitionIndex = Math.min(routeNavigationSteps.length - 1, Math.floor(position));
            const transition = routeTransitionForStep(route, routeNavigationSteps, transitionIndex);
            if (transition?.kind === "stairs" || transition?.kind === "elevator") {
              const direction = /\bdown\b/i.test(routeNavigationSteps[transitionIndex]?.instruction ?? "") ? "down" : "up";
              setStairLoading({ dir: direction, label: routeNavigationSteps[transitionIndex]?.instruction ?? "Changing Floor" });
              stepSeekTransitionTimerRef.current = setTimeout(() => {
                stepSeekTransitionTimerRef.current = null;
                setStairLoading(null);
              }, reducedMotion ? 60 : 180);
            }
          }
          if (previousTarget?.context === "floor" && previousTarget.segment) {
            const previousBuilding = activeCampus?.buildings.find((candidate) => candidate.id === previousTarget!.segment!.buildingId);
            const previousFloor = indoorSegmentFloorNumber(previousTarget.segment, previousBuilding,
              previousTarget.phase === "origin-indoor" ? roomOrigin?.floorNumber : roomDestination?.floorNumber);
            if (previousFloor !== undefined && previousFloor !== floor) floorShiftDirectionRef.current = floor > previousFloor ? "up" : "down";
          }
          appliedContext = contextKey;
          setFloorView({ building, floor });
          setNavigationPhase(target.phase);
          if (target.phase === "origin-indoor") {
            setOriginIndoorSegments(segments);
            setOriginIndoorSegmentIndex(segmentIndex);
          } else {
            setDestinationIndoorSegments(segments);
            setDestinationIndoorSegmentIndex(segmentIndex);
          }
        const endpointRoom = target.phase === "destination-indoor" ? route.destinationRoom : roomOrigin;
        const visibleEndpointRoom = endpointRoom?.buildingId === target.segment?.buildingId
          && endpointRoom.floorNumber === floor ? endpointRoom : null;
        setActiveRouteRoom(visibleEndpointRoom?.roomId ?? null);
        setHighlightedRoom(visibleEndpointRoom?.roomId ?? null);
        } else if (target.phase !== navigationPhase) {
          setNavigationPhase(target.phase);
        }
        if (target.segment !== appliedSegment) {
          appliedSegment = target.segment;
          setIndoorRoute(indoorRouteFromSegment(target.segment));
          indoorWalkSegmentKeyRef.current = `${indoorWalkNonce}:${target.segment.waypoints[0]?.x}:${target.segment.waypoints[0]?.y}:${target.segment.waypoints.at(-1)?.x}:${target.segment.waypoints.at(-1)?.y}`;
        }
        indoorWalkProgressRef.current = target.segmentProgress;
        setIndoorWalkProgress(target.segmentProgress);
        walkProgressRef.current = target.routeProgress;
        setWalkProgress(target.routeProgress);
      } else {
        if (appliedContext !== "campus") {
          appliedContext = "campus";
          setFloorView(null);
          setIndoorRoute(null);
          setNavigationPhase("outdoor");
          setActiveRouteRoom(null);
          setHighlightedRoom(null);
        }
        walkProgressRef.current = target.routeProgress;
        setWalkProgress(target.routeProgress);
      }
      playbackCursorRef.current = position;
      setPlaybackCursor(position);
      previousTarget = target;

    };

    const destination = safeIndex;
    const seekDistanceM = studentRouteSeekDistanceM(route, routeNavigationSteps, fromPosition, destination);
    const seekGeometryDistance = studentRouteSeekGeometryDistance(route, routeNavigationSteps, fromPosition, destination);
    const journeyDistanceM = Math.max(seekDistanceM, Number.isFinite(route.dist) ? route.dist : 0,
      (route.contextLegs ?? []).reduce((sum, leg) => sum + (Number.isFinite(leg.distanceM) ? Math.max(0, leg.distanceM) : 0), 0));
    const durationForSpeed = (speed: number) => navigationSeekDuration(
      seekDistanceM,
      seekGeometryDistance,
      journeyDistanceM,
      speed,
      reducedMotion,
    );
    const targetStep = routeNavigationSteps[safeIndex];
    const targetIsTransition = targetStep?.icon === "enter" || targetStep?.icon === "stairs" || targetStep?.icon === "elevator";
    const duration = options.animate === false
      ? 0
      : durationForSpeed(playbackSpeedRef.current);
    const finish = () => {
      applyPosition(destination);
      stepSeekAnimRef.current = null;
      stepSeekTargetRef.current = null;
      playbackCursorRef.current = destination;
      setPlaybackCursor(destination);
      if (selectingInstructionInExplore) {
        setInspectedRouteStepIndex(safeIndex);
        if (!student3DActiveRef.current && appliedContext === routeContextKey) {
          const finalTarget = studentRoutePlaybackTarget(route, routeNavigationSteps, destination);
          const finalPoints = studentRouteTargetPoints(route, finalTarget);
          const finalPoint = pointAlongPolyline(finalPoints, finalTarget.context === "floor" ? finalTarget.segmentProgress : finalTarget.routeProgress);
          focusRouteStartView(finalPoint, finalTarget.context === "floor", "route-inspection");
        }
      } else if (studentRouteUi.camera === "follow" && !followCameraDetached) {
        const finalTarget = studentRoutePlaybackTarget(route, routeNavigationSteps, destination);
        const finalPoints = studentRouteTargetPoints(route, finalTarget);
        const finalPoint = pointAlongPolyline(finalPoints, finalTarget.context === "floor" ? finalTarget.segmentProgress : finalTarget.routeProgress);
        const finalFloor = finalTarget.context === "floor" && finalTarget.segment
          ? indoorSegmentFloorNumber(finalTarget.segment,
            activeCampus?.buildings.find((building) => building.id === finalTarget.segment?.buildingId),
            finalTarget.phase === "origin-indoor" ? roomOrigin?.floorNumber : roomDestination?.floorNumber)
          : undefined;
        const finalContextKey = finalTarget.context === "floor"
          ? finalTarget.segment && finalFloor !== undefined ? `${finalTarget.segment.buildingId}:${finalFloor}` : null
          : "campus";
        if (finalContextKey === routeContextKey) {
          focusRouteStartView(finalPoint, finalTarget.context === "floor", "route-inspection", undefined, true);
        } else if (finalContextKey) {
          pendingRouteRecenterRef.current = {
            contextKey: finalContextKey,
            point: finalPoint,
            floor: finalTarget.context === "floor",
            source: "route-inspection",
            forceRecenter3D: true,
          };
        }
      }
      pendingTransitionSeekRef.current = targetIsTransition;
    };
    if (duration <= 0 || fromPosition === destination) {
      applyPosition(destination);
      finish();
    } else {
      let startedAt = performance.now();
      let segmentStartPosition = fromPosition;
      let activeDuration = duration;
      let activeSpeed = playbackSpeedRef.current;
      const tick = (now: number) => {
        const nextSpeed = playbackSpeedRef.current;
        if (nextSpeed !== activeSpeed) {
          const elapsed = Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, activeDuration)));
          segmentStartPosition += (destination - segmentStartPosition) * elapsed;
          activeDuration = durationForSpeed(nextSpeed) * (1 - elapsed);
          startedAt = now;
          activeSpeed = nextSpeed;
        }
        const t = Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, activeDuration)));
        // Linear cursor movement samples only authored leg geometry; context
        // handoffs switch at their route boundary and never draw through walls.
        const position = segmentStartPosition + (destination - segmentStartPosition) * t;
        applyPosition(position);
        if (t < 1) stepSeekAnimRef.current = requestAnimationFrame(tick);
        else finish();
      };
      stepSeekAnimRef.current = requestAnimationFrame(tick);
    }
  }, [activeCampus?.buildings, clampMapPan, floorViewport.offsetX, floorViewport.offsetY, followCameraDetached, focusRouteStartView, indoorWalkNonce, mapContainerRef, navigationTransitioning, panForRouteFocusPoint, reducedMotion, route, routeContextKey, routeNavigationSteps, roomDestination?.floorNumber, roomDestination?.roomId, roomOrigin?.floorNumber, roomOrigin?.roomId, stairLoading, studentRouteUi.camera, studentRouteUi.playback, viewCX, viewCY]);

  const inspectGuidedRouteLocation = useCallback((stepIndex: number) => {
    if (!route || studentRouteUi.phase !== "navigating" || studentRouteUi.camera !== "explore") return;
    const safeIndex = Math.max(0, Math.min(routeNavigationSteps.length - 1, stepIndex));
    const target = studentRouteSeekTarget(route, routeNavigationSteps, safeIndex);
    const point = pointAlongPolyline(
      studentRouteTargetPoints(route, target),
      target.context === "floor" ? target.segmentProgress : target.routeProgress,
    );
    setInspectedRouteStepIndex(safeIndex);
    setSelected(null);

    if (target.context === "floor" && target.segment) {
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === target.segment?.buildingId);
      if (!building) return;
      const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === building.id);
      const floor = indoorSegmentFloorNumber(target.segment, publishedBuilding,
        target.phase === "origin-indoor" ? roomOrigin?.floorNumber : roomDestination?.floorNumber);
      if (floor === undefined) return;
      const contextKey = `${building.id}:${floor}`;
      if (routeContextKey !== contextKey) {
        pendingRouteRecenterRef.current = { contextKey, point, floor: true, source: "route-inspection" };
        setFloorView({ building, floor });
      } else if (!student3DActiveRef.current) {
        focusRouteStartView(point, true, "route-inspection");
      }
      return;
    }

    if (routeContextKey !== "campus") {
      pendingRouteRecenterRef.current = { contextKey: "campus", point, floor: false, source: "route-inspection" };
      setFloorView(null);
    } else if (!student3DActiveRef.current) {
      focusRouteStartView(point, false, "route-inspection");
    }
  }, [activeCampus?.buildings, focusRouteStartView, route, routeContextKey, routeNavigationSteps, roomDestination?.floorNumber, roomOrigin?.floorNumber, studentRouteUi.camera, studentRouteUi.phase]);

  const inspectGuidedRouteTransition = useCallback((transitionStepIndex = activeTransitionStepIndex) => {
    if (!route || studentRouteUi.phase !== "navigating" || studentRouteUi.camera !== "explore") return;
    const inspection = studentRouteExploreTransitionTarget(route, routeNavigationSteps, transitionStepIndex);
    if (!inspection) return;
    const { transition, target, targetStepIndex } = inspection;
    // A Building-only destination can end on an Enter instruction without an
    // indoor route segment. Preserve its authored entry-floor inspection while
    // leaving the actual Follow cursor and active context untouched.
    if (transition.kind === "enter_building" && !target.segment) {
      const targetLeg = route.contextLegs?.[transition.handoff?.toContextLegIndex ?? target.contextLegIndex ?? -1];
      const buildingId = transition.handoff?.buildingId ?? targetLeg?.buildingId ?? activeOutdoorEntranceBuildingId;
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === buildingId);
      if (building) {
        setInspectedRouteStepIndex(targetStepIndex);
        setSelected(null);
        const publishedBuilding = activeCampus?.buildings.find((candidate) => candidate.id === building.id);
        const entryFloor = entryFloorForBuilding(publishedBuilding);
        const floorBySegment = targetLeg?.segmentIndex === undefined
          ? undefined
          : route.indoorSegments?.[targetLeg.segmentIndex]?.floorNumber;
        const floor = targetLeg?.floorNumber ?? floorBySegment ?? entryFloor?.number ?? 1;
        const point = transition.handoff?.targetPoint ?? targetLeg?.waypoints[0] ?? null;
        if (point) {
          const contextKey = `${building.id}:${floor}`;
          if (routeContextKey !== contextKey) pendingRouteRecenterRef.current = { contextKey, point, floor: true, source: "route-inspection" };
          else if (!student3DActiveRef.current) focusRouteStartView(point, true, "route-inspection");
        }
        setFloorView({ building, floor });
      }
      return;
    }
    // This marker changes only the inspected map view. Explicit instruction-row
    // selection continues to use seekRouteStep and retains its seek semantics.
    inspectGuidedRouteLocation(targetStepIndex);
  }, [activeCampus?.buildings, activeOutdoorEntranceBuildingId, activeTransitionStepIndex, focusRouteStartView, inspectGuidedRouteLocation, route, routeContextKey, routeNavigationSteps, studentRouteUi.camera, studentRouteUi.phase]);
  const inspectGuidedRouteInstruction = useCallback((stepIndex: number) => {
    if (!route || studentRouteUi.phase !== "navigating" || studentRouteUi.camera !== "explore") return;
    // A row click is an explicit route seek: stop playback and move the shared
    // simulated cursor to that instruction. Map transition cues use the
    // separate view-only inspection handler above.
    seekRouteStep(stepIndex, { selectProgress: true, animate: false });
  }, [route, seekRouteStep, studentRouteUi.camera, studentRouteUi.phase]);
  inspectGuidedRouteTransitionRef.current = inspectGuidedRouteTransition;
  const exploreTransitionMergeDistance = student3DActive
    ? 34
    : Math.min(136, 34 / Math.max(0.25, displayZoom));
  const exploreRouteTransitionMarkers = useMemo(() => groupStudentRouteExploreTransitions(
    exploreTransitionCues.map(({ cue, transitionStepIndex }) => {
      const inspectionLabel = studentRouteInspectionTransitionDisplayLabel(cue.kind, cue.label);
      return {
        id: cue.id,
        kind: cue.kind,
        groupId: cue.groupId,
        point: cue.point,
        label: inspectionLabel,
        displayLabel: inspectionLabel,
        onActivate: () => cue.returnToStepIndex !== undefined
          ? inspectGuidedRouteLocation(cue.returnToStepIndex)
          : inspectGuidedRouteTransition(transitionStepIndex),
      };
    }),
    exploreTransitionMergeDistance,
  ), [exploreTransitionCues, exploreTransitionMergeDistance, inspectGuidedRouteLocation, inspectGuidedRouteTransition]);
  const campus3DExploreTransitionCues = isRouteExplore && routeInspectionTarget?.context === "campus"
    ? exploreRouteTransitionMarkers
    : [];
  const indoor3DExploreTransitionCues = isRouteExplore && routeInspectionTarget?.context === "floor"
    && Boolean(routeInspectionTarget.segment
      && routeInspectionTarget.segment.buildingId === floorView?.building.id
      && (routeInspectionTarget.segment.floorId
        ? routeInspectionTarget.segment.floorId === activeFloorPlan?.id
        : routeInspectionTarget.segment.floorNumber === floorView?.floor))
    ? exploreRouteTransitionMarkers
    : [];
  const followContextSwitchRef = useRef<string | null>(null);
  // FOLLOW must actually follow: when playback moves the route into another
  // Campus / Building / Floor context, switch automatically and settle the
  // camera on the current step. Free Look keeps a single Recenter action.
  useEffect(() => {
    if (studentRouteUi.phase !== "navigating" || studentRouteUi.playback !== "playing"
      || studentRouteUi.camera !== "follow" || followCameraDetached) return;
    if (!routeContextIsElsewhere) {
      followContextSwitchRef.current = null;
      return;
    }
    // Let a committed building/floor transition finish its lifecycle first.
    if (navigationTransitioning || stairLoading || pendingRouteRecenterRef.current) return;
    const targetKey = navigationPhase === "outdoor" && isFloorMode
      ? "campus"
      : activeIndoorSegment ? `${activeIndoorSegment.buildingId}:${activeRouteSegmentFloor ?? "unknown"}` : null;
    if (!targetKey || followContextSwitchRef.current === targetKey) return;
    followContextSwitchRef.current = targetKey;
    recenterCurrentRouteStep();
  }, [activeIndoorSegment, activeRouteSegmentFloor, followCameraDetached, isFloorMode, navigationPhase, navigationTransitioning, recenterCurrentRouteStep, routeContextIsElsewhere, stairLoading, studentRouteUi.camera, studentRouteUi.phase, studentRouteUi.playback]);
  const indoorRouteMatchesVisibleFloor = Boolean(isFloorMode && floorView && visibleIndoorRoute);
  const routeFloorsInCurrentBuilding = useMemo(() => [...new Set(
    (route?.indoorSegments ?? [])
      .filter((segment) => segment.buildingId === floorView?.building.id)
      .map((segment) => segment.floorNumber)
      .filter((floorNumber): floorNumber is number => Number.isFinite(floorNumber)),
  )], [floorView?.building.id, route]);
  // Direction chevrons show route direction independently from simulated
  // walking in Explore. Follow pauses their phase with the canonical player.
  const routeFlowAnimated = (isRouteExplore || mapMode === "emergency" || platformSettings.animatedRouteArrows)
    && !emergencyRouteOverview
    && !discoverTour.active
    && (studentRouteUi.phase === "preview" || studentRouteUi.phase === "navigating");
  const routeFlowPaused = studentRouteUi.phase === "navigating"
    && studentRouteUi.camera !== "explore"
    && studentRouteUi.playback !== "playing";
  const activeEmergencyRouteMapIndex = approvedStudentEmergencyRoutes.findIndex((option) => option.id === activeEmergencyRouteId);
  const activeEmergencyRouteMapLabel = activeEmergencyRouteMapIndex >= 0
    ? studentEmergencyRouteMapLabel(activeEmergencyRouteMapIndex)
    : undefined;
  const activeEmergencyRouteMapColor = activeEmergencyRouteMapIndex === 0
    ? "#dc2626"
    : activeEmergencyRouteMapIndex > 0 ? "#c2410c" : undefined;
  const outdoorRouteLineOverlay = useMemo(() => {
    if (!route || discoverTour.active) return null;
    if (smartEmergencyRouteMode && approvedStudentEmergencyRoutes.length > 1 && emergencyRouteOverview) {
      // Keep the chosen alternative visible during navigation. The previous
      // filter showed only the unselected route, leaving the student's active
      // outdoor path absent from the 2D map after selecting Route A or B.
      const displayedOptions = approvedStudentEmergencyRoutes;
      return <g data-testid="approved-emergency-campus-overview" style={{ pointerEvents: "none" }}>
        {displayedOptions.flatMap((option) => {
          const optionIndex = approvedStudentEmergencyRoutes.findIndex((candidate) => candidate.id === option.id);
          const legs = option.candidate.route.contextLegs?.filter((leg) => leg.kind === "campus" && leg.waypoints.length > 1)
            .map((leg) => leg.waypoints)
            ?? (option.candidate.route.campusPoints && option.candidate.route.campusPoints.length > 1
              ? [option.candidate.route.campusPoints]
              : option.candidate.route.points.length > 1 ? [option.candidate.route.points] : []);
          return legs.map((points, legIndex) => <RouteMapOverlay
            key={`${option.id}-campus-${legIndex}`}
            points={points}
            mode="emergency"
            routeColor={optionIndex === 0 ? "#dc2626" : "#c2410c"}
            routeDashArray={optionIndex === 1 ? "10 6" : undefined}
            routeLabel={studentEmergencyRouteMapLabel(optionIndex)}
          opacity={1}
            animated={false}
            layer="all"
          />);
        })}
      </g>;
    }
    // A campus SVG can display several campus legs from one itinerary, but
    // must never join them across a building's floor-local coordinates. Keep
    // each authored campus context as its own stroke.
    const campusLegs = route.contextLegs
      ?.map((leg, contextLegIndex) => ({ leg, contextLegIndex }))
      .filter(({ leg }) => leg.kind === "campus" && leg.waypoints.length >= 2);
    const renderLegs = campusLegs?.length
      ? campusLegs
      : route.points.length >= 2
        ? [{ leg: { kind: "campus" as const, waypoints: route.points, distanceM: route.dist }, contextLegIndex: -1 }]
        : [];
    if (!renderLegs.length) return null;
    const activeStepTarget = studentRouteUi.phase === "navigating"
      ? isRouteExplore
        ? studentRouteExploreInspectionTarget(route, routeNavigationSteps, activeRouteStepIndex)
        : studentRouteSeekTarget(route, routeNavigationSteps, activeRouteStepIndex)
      : null;
    const activeCampusLegIndex = activeStepTarget?.context === "campus" ? activeStepTarget.contextLegIndex : undefined;
    const visibleLegs = isRouteExplore && activeCampusLegIndex !== undefined
      ? renderLegs.filter(({ contextLegIndex }) => contextLegIndex === activeCampusLegIndex)
      : renderLegs;
    return <g data-testid="campus-route-context-legs" style={{ pointerEvents: "none" }}>
      {visibleLegs.map(({ leg, contextLegIndex }) => {
        const isActiveLeg = contextLegIndex >= 0 && contextLegIndex === activeCampusLegIndex;
        const legProgress = studentRouteUi.phase !== "navigating"
          ? undefined
          : isActiveLeg ? displayedWalkProgress
            : activeCampusLegIndex !== undefined && contextLegIndex < activeCampusLegIndex ? 1 : 0;
        return <RouteMapOverlay
          key={`campus-route-context-${contextLegIndex}`}
          points={leg.waypoints}
          mode={mapMode}
          routeColor={smartEmergencyRouteMode && activeEmergencyRouteId
            ? approvedStudentEmergencyRoutes.findIndex((option) => option.id === activeEmergencyRouteId) === 0 ? "#dc2626" : "#c2410c"
            : undefined}
          routeLabel={smartEmergencyRouteMode && activeEmergencyRouteId
            ? activeEmergencyRouteMapLabel
            : undefined}
          fading={routeFading}
          walkProgress={legProgress}
          animated={routeFlowAnimated}
          flowPaused={routeFlowPaused}
          layer="line"
          progressFrameWriterRef={isActiveLeg ? outdoorRouteLineProgressWriterRef : undefined}
        />;
      })}
    </g>;
  }, [activeEmergencyRouteId, activeEmergencyRouteMapLabel, activeRouteStepIndex, approvedStudentEmergencyRoutes, discoverTour.active, displayedWalkProgress, emergencyRouteOverview, isRouteExplore, mapMode, route, routeFading, routeFlowAnimated, routeFlowPaused, routeNavigationSteps, smartEmergencyRouteMode, studentRouteUi.phase]);
  const showEmergencyFloorProgressMarker = Boolean(
    !discoverTour.active
    &&
    smartEmergencyRouteMode
    && activeEmergencyRouteId
    && visibleIndoorRoute
    && indoorRouteMatchesVisibleFloor
    && (studentRouteUi.phase === "preview" || studentRouteUi.phase === "navigating" && visibleIndoorRouteIsActive),
  );
  const emergencyFloorProgress = studentRouteUi.phase === "preview" ? 0 : indoorWalkProgress;
  // The emergency floor overlay owns the selected route's single preview
  // marker. Once playback starts, the normal indoor marker layer takes over
  // with canonical route progress; rendering both layers duplicated the
  // simulated position on every active indoor SOS step.
  const emergencyFloorProgressMarker = showEmergencyFloorProgressMarker
    && studentRouteUi.phase === "preview"
    && visibleIndoorRoute
    ? <g data-testid="student-emergency-floor-progress-marker" style={{ pointerEvents: "none" }}>
        <RouteMapOverlay
          points={visibleIndoorRoute.waypoints}
          mode="emergency"
          routeColor={approvedStudentEmergencyRoutes.findIndex((option) => option.id === activeEmergencyRouteId) === 0 ? "#dc2626" : "#c2410c"}
          walkProgress={emergencyFloorProgress}
          layer="markers"
          showStartMarker={false}
          showEndMarker={false}
        />
      </g>
    : null;
  const indoorRouteLineOverlay = useMemo(() => {
    if (discoverTour.active) return null;
    if (smartEmergencyRouteMode && approvedStudentEmergencyRoutes.length > 1 && isFloorMode && floorView) {
      const displayedOptions = emergencyRouteOverview ? approvedStudentEmergencyRoutes : [];
      return <g data-testid="approved-emergency-floor-overview" style={{ pointerEvents: "none" }}>
        {displayedOptions.flatMap((option) => {
          const segment = option.candidate.route.indoorSegments?.find((candidate) =>
            candidate.buildingId === floorView.building.id && candidate.floorNumber === floorView.floor,
          );
          if (!segment || segment.waypoints.length < 2) return [];
          const optionIndex = approvedStudentEmergencyRoutes.findIndex((candidate) => candidate.id === option.id);
          return [<RouteMapOverlay
            key={`${option.id}-floor-${segment.floorId ?? segment.floorNumber}`}
            points={segment.waypoints}
            mode="emergency"
            routeColor={optionIndex === 0 ? "#dc2626" : "#c2410c"}
            routeDashArray={optionIndex === 1 ? "10 6" : undefined}
            routeLabel={studentEmergencyRouteMapLabel(optionIndex)}
            opacity={emergencyRouteOverview ? 1 : 0.32}
            animated={false}
            layer="all"
          />];
        })}
        {!emergencyRouteOverview && visibleIndoorRoute && indoorRouteMatchesVisibleFloor && <RouteMapOverlay
          points={visibleIndoorRoute.waypoints}
          mode="emergency"
          routeColor={approvedStudentEmergencyRoutes.findIndex((option) => option.id === activeEmergencyRouteId) === 0 ? "#dc2626" : "#c2410c"}
          fading={routeFading}
          walkProgress={studentRouteUi.phase === "navigating" && visibleIndoorRouteIsActive ? displayedIndoorWalkProgress : undefined}
          animated={routeFlowAnimated}
          flowPaused={routeFlowPaused}
          layer="line"
          progressFrameWriterRef={indoorRouteLineProgressWriterRef}
        />}
        {!emergencyRouteOverview && indoorRouteMatchesVisibleFloor && emergencyFloorProgressMarker}
      </g>;
    }
    return visibleIndoorRoute && visibleIndoorRoute.waypoints.length >= 2 && indoorRouteMatchesVisibleFloor ? (
    <g data-testid="floor-indoor-route-line" style={{ pointerEvents: "none" }}>
      <RouteMapOverlay
        points={visibleIndoorRoute.waypoints}
        mode={mapMode}
        routeColor={smartEmergencyRouteMode && activeEmergencyRouteId
          ? approvedStudentEmergencyRoutes.findIndex((option) => option.id === activeEmergencyRouteId) === 0 ? "#dc2626" : "#c2410c"
          : undefined}
        routeLabel={smartEmergencyRouteMode && activeEmergencyRouteId
          ? activeEmergencyRouteMapLabel
          : undefined}
        animated={routeFlowAnimated}
        flowPaused={routeFlowPaused}
        walkProgress={studentRouteUi.phase === "navigating" && visibleIndoorRouteIsActive ? displayedIndoorWalkProgress : undefined}
        layer="line"
        progressFrameWriterRef={indoorRouteLineProgressWriterRef}
      />
      {emergencyFloorProgressMarker}
    </g>
  ) : null;
  }, [activeEmergencyRouteId, activeEmergencyRouteMapLabel, approvedStudentEmergencyRoutes, discoverTour.active, displayedIndoorWalkProgress, emergencyFloorProgressMarker, emergencyRouteOverview, floorView, indoorRouteMatchesVisibleFloor, isFloorMode, mapMode, routeFading, routeFlowAnimated, routeFlowPaused, smartEmergencyRouteMode, studentRouteUi.phase, visibleIndoorRoute, visibleIndoorRouteIsActive]);
  const studentEmergencyFloorRouteSegments = useMemo(() => {
    if (!smartEmergencyRouteMode || approvedStudentEmergencyRoutes.length < 2 || !floorView || !emergencyRouteOverview) return [];
    return buildStudentEmergencyFloorRouteSegments(approvedStudentEmergencyRoutes, floorView.building.id, floorView.floor);
  }, [approvedStudentEmergencyRoutes, emergencyRouteOverview, floorView, smartEmergencyRouteMode]);
  useLayoutEffect(() => {
    studentMarkerRootsRef.current = Array.from(cameraGroupRef.current?.querySelectorAll<SVGGElement>("[data-student-marker-layer]") ?? []);
    markerPresentationKeyRef.current = "";
    applyStudentMarkerPresentation(displayZoomRef.current, true);
  }, [activeFloorPlan?.id, activeRouteStepIndex, applyStudentMarkerPresentation, isFloorMode, route, routeContextKey, studentRouteTransitionCues]);
  const moveGuidedStep = (delta: -1 | 1) => {
    if (!route || routeNavigationSteps.length < 2) return;
    // Step buttons represent one instruction at a time. Do not let rapid taps
    // retarget an unfinished seek and accidentally queue multiple steps.
    if (stepSeekTargetRef.current !== null) return;
    if (studentRouteUi.phase === "arrived") {
      if (delta !== -1) return;
      const previousIndex = routeNavigationSteps.length - 2;
      setArrivalCameraTarget(null);
      setShowArrival(false);
      setRouteFading(false);
      setNavigationPauseReason("manual");
      dispatchStudentRouteUi({ type: "START_NAVIGATION", camera: "follow" });
      seekRouteStep(previousIndex);
      return;
    }
    if (routeTransitionBusy && stepSeekTargetRef.current === null) return;
    const followCursorIndex = Math.max(0, Math.floor(playbackCursorRef.current + 0.000001));
    const baseIndex = stepSeekTargetRef.current ?? (studentRouteUi.camera === "follow" ? followCursorIndex : activeRouteStepIndex);
    const nextIndex = studentRouteStepSeekIndex(baseIndex, delta, routeNavigationSteps.length);
    seekRouteStep(nextIndex);
  };
  const continueGuidedNavigation = () => {
    // Next is always a manual +1 canonical seek. Physical handoffs are
    // activated only by Continue or the authored map cue.
    moveGuidedStep(1);
  };
  const campus3DRoutePoints = route?.campusPoints?.length ? route.campusPoints : route?.points ?? EMPTY_MAP_POINTS;
  const campus3DRouteSegments = useMemo(() => {
    const authoredCampusLegs = route?.contextLegs?.flatMap((leg, contextLegIndex) =>
      leg.kind === "campus" && leg.waypoints.length > 1 ? [{ leg, contextLegIndex }] : []);
    if (isRouteExplore && routeInspectionTarget?.context === "campus"
      && routeInspectionTarget.contextLegIndex !== undefined) {
      const inspectedLeg = authoredCampusLegs?.find(({ contextLegIndex }) => contextLegIndex === routeInspectionTarget.contextLegIndex);
      return inspectedLeg ? [inspectedLeg.leg.waypoints] : [];
    }
    const authoredPoints = authoredCampusLegs?.map(({ leg }) => leg.waypoints);
    return authoredPoints?.length ? authoredPoints
      : campus3DRoutePoints.length > 1 ? [campus3DRoutePoints] : [];
  }, [campus3DRoutePoints, isRouteExplore, route, routeInspectionTarget]);
  const studentEmergencyCampusRouteSegments = useMemo(() => {
    if (!smartEmergencyRouteMode || approvedStudentEmergencyRoutes.length < 2 || !emergencyRouteOverview) return [];
    return buildStudentEmergencyCampusRouteSegments(approvedStudentEmergencyRoutes);
  }, [approvedStudentEmergencyRoutes, emergencyRouteOverview, smartEmergencyRouteMode]);
  const campus3DFollowTarget = routePlaybackMarkerVisibleOnCampus && routePlaybackMarkerTarget?.context === "campus"
    ? routePlaybackMarkerTarget
    : null;
  const campus3DFollowLeg = campus3DFollowTarget?.context === "campus" && campus3DFollowTarget.contextLegIndex !== undefined
    ? route?.contextLegs?.[campus3DFollowTarget.contextLegIndex]
    : undefined;
  const campus3DFollowRoutePoints = campus3DFollowLeg?.kind === "campus"
    ? campus3DFollowLeg.waypoints
    : campus3DRoutePoints;
  const campus2DFollowMarkerTarget = routePlaybackMarkerVisibleOnCampus
    && routePlaybackMarkerTarget?.context === "campus"
    && routePlaybackMarkerTarget.contextLegIndex !== undefined
    ? route?.contextLegs?.[routePlaybackMarkerTarget.contextLegIndex]
    : undefined;
  const campus2DFollowMarkerPoints = campus2DFollowMarkerTarget?.kind === "campus"
    ? campus2DFollowMarkerTarget.waypoints
    : routePlaybackMarkerVisibleOnCampus && routePlaybackMarkerTarget?.context === "campus"
      ? routePlaybackMarkerTarget.contextLegIndex === undefined
        ? route?.campusPoints?.length ? route.campusPoints : route?.points ?? null
        : null
      : null;
  const campus2DProgressMarkerProgress = routePlaybackMarkerTarget?.context === "campus"
    ? routePlaybackMarkerTarget.routeProgress
    : undefined;
  const campus3DHumanPoint = studentRouteUi.phase === "navigating"
    && routePlaybackMarkerVisibleOnCampus
    && navigationPhase === "outdoor"
    && campus3DFollowRoutePoints.length > 0
    ? pointAlongPolyline(campus3DFollowRoutePoints, routePlaybackMarkerTarget?.context === "campus" ? routePlaybackMarkerTarget.routeProgress : walkProgress)
    : null;
  const campus3DFocusPoint = useMemo(() => {
    const buildingId = selected?.id ?? searchFocusRef.current?.buildingId;
    const building = activeCampus?.buildings.find((item) => item.id === buildingId);
    if (building) return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
    const placeId = selectedCampusPlaceId ?? searchFocusRef.current?.campusPlaceId;
    const place = campusPlaceEntity(activeCampus, placeId);
    if (place) return { x: place.x, y: place.y };
    return null;
  }, [activeCampus, campus3DRoutePoints, route, searchFocusNonce, selected?.id, selectedCampusPlaceId, studentRouteUi.phase]);
  const campus3DActiveTransition = useMemo(() => {
    if (!campus3DActive || !activeRouteTransitionPoint) return null;
    if (studentRouteUi.phase === "preview" && previewActiveTransitionCue?.cue.kind === "enter_building") {
      return {
        point: activeRouteTransitionPoint,
        label: studentRouteInspectionTransitionDisplayLabel(previewActiveTransitionCue.cue.kind, previewActiveTransitionCue.cue.label),
        buildingId: activeOutdoorEntranceBuildingId,
        entranceId: activeOutdoorEntranceId,
        onActivate: () => inspectRoutePreviewTransition(previewActiveTransitionCue.cue.id),
      };
    }
    // Mirror the 2D route marker whenever this authored transition is the
    // canonical Follow step. The system-wait state still controls Continue /
    // auto-resume; the map cue itself remains available while manually paused.
    if (studentRouteUi.phase === "navigating"
      && studentRouteUi.camera === "follow"
      && navigationPhase === "outdoor"
      && activeRouteTransition?.kind === "enter_building") {
      return {
        point: activeRouteTransitionPoint,
        label: routeNavigationSteps[activeRouteStepIndex]?.instruction ?? "Enter building",
        buildingId: activeOutdoorEntranceBuildingId,
        entranceId: activeOutdoorEntranceId,
        onActivate: activateCurrentRouteTransition,
      };
    }
    return null;
  }, [activateCurrentRouteTransition, activeOutdoorEntranceBuildingId, activeOutdoorEntranceId, activeRouteStepIndex, activeRouteTransition?.kind, activeRouteTransitionPoint, campus3DActive, inspectRoutePreviewTransition, previewActiveTransitionCue, routeNavigationSteps, studentRouteUi.camera, studentRouteUi.phase]);
  const indoor3DActiveTransition = useMemo(() => {
    if (!indoor3DActive || !isFloorMode) return null;
    if (guidedAccessTransitionCue) {
      return {
        point: guidedAccessTransitionCue.cue.point,
        label: guidedAccessTransitionCue.cue.label,
        onActivate: () => seekRouteStep(guidedAccessTransitionCue.transitionStepIndex),
      };
    }
    if (!activeRouteTransitionPoint) return null;
    if (studentRouteUi.phase === "preview" && previewActiveTransitionCue) {
      const inspectionLabel = studentRouteInspectionTransitionDisplayLabel(previewActiveTransitionCue.cue.kind, previewActiveTransitionCue.cue.label);
      return {
        point: activeRouteTransitionPoint,
        label: inspectionLabel,
        displayLabel: inspectionLabel,
        onActivate: () => inspectRoutePreviewTransition(previewActiveTransitionCue.cue.id),
      };
    }
    // A paused, already-authorized vertical run is resumed from the planner.
    // Do not leave a second map-level Continue action for the same handoff.
    if (authorizedVerticalRunPaused) return null;
    // Keep the visual transition affordance in sync with the 2D renderer at
    // the active canonical step, including a user-paused Follow session.
    if (studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow") {
      return {
        point: activeRouteTransitionPoint,
        label: routeNavigationSteps[activeRouteStepIndex]?.instruction ?? "Continue route",
        displayLabel: activeRouteTransitionDisplayLabel,
        onActivate: activateCurrentRouteTransition,
      };
    }
    return null;
  }, [activateCurrentRouteTransition, activeRouteStepIndex, activeTransitionStepIndex, activeRouteTransitionDisplayLabel, activeRouteTransitionPoint, authorizedVerticalRunPaused, guidedAccessTransitionCue, indoor3DActive, inspectRoutePreviewTransition, isFloorMode, previewActiveTransitionCue, routeNavigationSteps, seekRouteStep, studentRouteUi.camera, studentRouteUi.phase]);
  const routePlannerMapPickRoom = routePlannerMapPickCandidate?.endpoint.kind === "room"
    ? routePlannerMapPickCandidate.endpoint.room
    : null;
  const routePlannerMapPickRoomOnFloor = routePlannerMapPickRoom
    && routePlannerMapPickRoom.buildingId === floorView?.building.id
    && routePlannerMapPickRoom.floorNumber === floorView.floor
    ? routePlannerMapPickRoom
    : null;
  const campus3DEventVenues = useMemo(() => activeCampus ? buildEventVenues(activeCampus, venueEvents) : [], [activeCampus, venueEvents]);
  const handleCampus3DFallback = useCallback(() => {
    setCampus3DFallback(true);
    setCampusViewMode("2d");
    showInfo("3D view isn't available on this device. Using 2D map.");
  }, [showInfo]);
  const toggleStudentMapView = useCallback(() => {
    if (discoverTour.active) {
      if (campusViewMode === "3d") {
        setCampusViewMode("2d");
      } else {
        setCampus3DFallback(false);
        if (isFloorMode) setIndoor3DLoaded(true);
        else setCampus3DLoaded(true);
        setCampusViewMode("3d");
      }
      return;
    }
    if (campusViewMode === "3d") {
      const activeRoute = routeRef.current;
      if (activeRoute && studentRouteUi.phase === "navigating") {
        const target = studentRouteFocusAtProgress(
          navigationPhase,
          activeRoute.points,
          walkProgressRef.current,
          activeIndoorSegment,
          indoorWalkProgressRef.current,
        );
        pending2DRendererReframeRef.current = { kind: "route", point: target.point, floor: target.context === "floor" };
      } else if (activeRoute && studentRouteUi.phase === "preview") {
        const inspectedIndex = inspectedRouteStepIndex ?? routePreviewStepIndex;
        const target = studentRouteSeekTarget(activeRoute, routeNavigationSteps, inspectedIndex);
        const point = target.segment
          ? pointAlongPolyline(target.segment.waypoints, target.segmentProgress)
          : pointAlongPolyline(activeRoute.campusPoints?.length ? activeRoute.campusPoints : activeRoute.points, target.routeProgress);
        pending2DRendererReframeRef.current = { kind: "route", point, floor: target.context === "floor" };
      } else if (selectedRoomContext) {
        pending2DRendererReframeRef.current = {
          kind: "room", buildingId: selectedRoomContext.buildingId,
          roomId: selectedRoomContext.roomId, floorNumber: selectedRoomContext.floorNumber,
        };
      } else if (selected) {
        pending2DRendererReframeRef.current = { kind: "building", buildingId: selected.id };
      } else if (selectedCampusPlaceId) {
        pending2DRendererReframeRef.current = { kind: "place", campusPlaceId: selectedCampusPlaceId };
      } else {
        pending2DRendererReframeRef.current = { kind: "overview", floor: isFloorMode };
      }
      setCampusViewMode("2d");
      return;
    }
    // One display preference applies across campus and indoor contexts. Only
    // the renderer changes here; the canonical route/cursor/floor state stays.
    setCampus3DFallback(false);
    if (isFloorMode) setIndoor3DLoaded(true);
    else setCampus3DLoaded(true);
    setCampusViewMode("3d");
  }, [activeIndoorSegment, campusViewMode, discoverTour.active, inspectedRouteStepIndex, indoorWalkProgressRef, isFloorMode, navigationPhase, routeNavigationSteps, routePreviewStepIndex, selected, selectedCampusPlaceId, selectedRoomContext, studentRouteUi.phase, walkProgressRef]);

  useLayoutEffect(() => {
    if (student3DActive) return;
    const pending = pending2DRendererReframeRef.current;
    if (!pending) return;
    pending2DRendererReframeRef.current = null;
    if (pending.kind === "route") {
      focusRouteStartView(pending.point, pending.floor);
    } else if (pending.kind === "room") {
      searchFocusRef.current = { buildingId: pending.buildingId, roomId: pending.roomId, floorNumber: pending.floorNumber };
      lastRoomFocusKeyRef.current = null;
      setSearchFocusNonce((nonce) => nonce + 1);
    } else if (pending.kind === "building") {
      searchFocusRef.current = { buildingId: pending.buildingId };
      setSearchFocusNonce((nonce) => nonce + 1);
    } else if (pending.kind === "place") {
      searchFocusRef.current = { campusPlaceId: pending.campusPlaceId };
      setSearchFocusNonce((nonce) => nonce + 1);
    } else if (pending.floor) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
    } else {
      const overview = overviewCameraRef.current;
      setPan(overview.pan);
      setZoom(overview.zoom);
    }
  }, [focusRouteStartView, student3DActive]);
  const enterRouteExplore = () => {
    followRecenterRequestRef.current += 1;
    followRecenterIntentRef.current = null;
    followCameraReacquiringRef.current = false;
    cancelPendingCampus3DCameraRecenter();
    cancelCameraAnimation(false);
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    walkAnimRef.current = null;
    indoorWalkAnimRef.current = null;
    if (stepSeekTargetRef.current !== null) {
      cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
      stepSeekAnimRef.current = null;
      stepSeekTargetRef.current = null;
      pendingTransitionSeekRef.current = false;
      setPlaybackCursor(playbackCursorRef.current);
    }
    // Starting from a visible Floor can own a short Floor-to-Campus camera
    // fit. Once Explore is selected, complete that renderer handoff without
    // continuing to animate or recenter the camera.
    if (navigationTransitioning && navigationPhase === "outdoor" && isFloorMode) {
      cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
      navigationTransitionAnimRef.current = null;
      setFloorView(null);
      setIndoorRoute(null);
      setActiveRouteRoom(null);
      setHighlightedRoom(null);
      setStairLoading(null);
      setNavigationTransitioning(false);
    }
    setFollowCameraDetached(false);
    // Explore begins by inspecting the exact canonical Follow step that was
    // active when the user detached. Without this seed, its local map progress
    // can be stale (for example, the completed CABA leg can resolve to the
    // final route step while waiting at the Canteen entrance).
    if (studentRouteUi.phase === "navigating") setInspectedRouteStepIndex(activeRouteStepIndex);
    // Keep any already-authorized stair / building handoff alive. It owns the
    // canonical floor context until completion; SET_CAMERA_MODE pauses only
    // simulated walking and preserves that transition's current cursor.
    dispatchStudentRouteUi({ type: "SET_CAMERA_MODE", camera: "explore" });
  };
  const beginFollowAtInitialEntry = (activeRoute: PlannedRoute): boolean => {
    const steps = studentFacingRouteSteps(activeRoute);
    const transitionStepIndex = studentRouteInitialPhysicalTransitionStepIndex(activeRoute, steps);
    if (transitionStepIndex === null
      || routeTransitionForStep(activeRoute, steps, transitionStepIndex)?.kind !== "enter_building") return false;
    const target = studentRouteSeekTarget(activeRoute, steps, transitionStepIndex);
    if (target.context !== "campus") return false;

    const point = pointAlongPolyline(studentRouteTargetPoints(activeRoute, target), target.routeProgress);
    cancelCameraAnimation(false);
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    cancelAnimationFrame(indoorWalkAnimRef.current ?? 0);
    cancelAnimationFrame(navigationTransitionAnimRef.current ?? 0);
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    walkAnimRef.current = null;
    indoorWalkAnimRef.current = null;
    navigationTransitionAnimRef.current = null;
    stepSeekAnimRef.current = null;
    stepSeekTargetRef.current = null;
    if (stepSeekTransitionTimerRef.current) clearTimeout(stepSeekTransitionTimerRef.current);
    stepSeekTransitionTimerRef.current = null;
    if (originIndoorTransitionRef.current) clearTimeout(originIndoorTransitionRef.current);
    if (destinationIndoorTransitionRef.current) clearTimeout(destinationIndoorTransitionRef.current);
    originIndoorTransitionRef.current = null;
    destinationIndoorTransitionRef.current = null;
    pendingTransitionSeekRef.current = false;
    routeTransitionActivationRef.current = null;
    transitionResumePlaybackRef.current = false;
    routeEntryTransitionCompleteRef.current = false;
    autoVerticalTraversalSharedIdRef.current = null;
    verticalRunEndsAfterTransitionRef.current = false;
    pauseAfterVerticalTransitionRef.current = false;
    setVerticalRunPausePending(false);
    setNavigationTransitioning(false);
    setStairLoading(null);
    setFollowCameraDetached(false);
    setInspectedRouteStepIndex(null);
    setShowArrival(false);
    playbackCursorRef.current = transitionStepIndex;
    setPlaybackCursor(transitionStepIndex);
    walkProgressRef.current = target.routeProgress;
    setWalkProgress(target.routeProgress);
    indoorWalkProgressRef.current = 0;
    setIndoorWalkProgress(0);
    followHumanWorldPointRef.current = point;
    setNavigationPauseReason("transition");
    setNavigationPhase("outdoor");
    setFloorView(null);
    setIndoorRoute(null);
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
    setDirectionsMode(false);
    pendingRouteRecenterRef.current = null;
    dispatchStudentRouteUi({ type: "START_NAVIGATION", waitAtTransition: true });
    focusRouteStartView(point, false);
    return true;
  };

  const startGuidedFromCollapsedPreview = () => {
    if (!route) return;
    const emergencyOrigin = fromCampusPlace ?? roomOrigin ?? (useMyLocation && youAreHere
      ? { type: "point" as const, ...youAreHere }
      : fromBuilding ? {
          type: "building" as const,
          buildingId: fromBuilding.id,
          label: fromBuilding.name,
          code: fromBuilding.code,
        } : null);
    if (mapMode === "emergency" && (!activeCampus
      || !isStudentEmergencyRouteCurrentAndEligible(activeCampus, route, emergencyOrigin))) {
      setRoutePlannerSelectionError("This emergency route is no longer eligible. Recalculate the route or follow posted campus instructions.");
      return;
    }
    setArrivalCameraTarget(null);
    const selectedCamera = studentRouteUi.camera;
    followCameraOffsetsByContextRef.current.clear();
    followCameraPoseCaptureSuppressedRef.current = false;
    if (selectedCamera === "follow" && beginFollowAtInitialEntry(route)) return;
    // End Preview ownership before Follow starts. Follow's RAF will take over
    // from the rendered transform and converge on the human; starting a
    // second focus animation here would compete with that first Follow frame.
    cancelCameraAnimation(false);
    const sourceSegments = roomOrigin ? indoorSegmentsForBuilding(route, roomOrigin.buildingId, "before-outdoor") : [];
    const indoorOnlyDestination = !roomOrigin && route.destinationRoom
      && studentRouteInitialContext(route, studentFacingRouteSteps(route)) === "floor";
    const startSegments = sourceSegments.length > 0
      ? sourceSegments
      : indoorOnlyDestination && route.destinationRoom
        ? indoorSegmentsForBuilding(route, route.destinationRoom.buildingId, "after-outdoor")
        : [];
    const firstSegment = startSegments[0];
    cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
    stepSeekAnimRef.current = null;
    stepSeekTargetRef.current = null;
    pendingTransitionSeekRef.current = false;
    playbackCursorRef.current = 0;
    setPlaybackCursor(0);
    setInspectedRouteStepIndex(null);
    setFollowCameraDetached(false);
    setShowArrival(false);
    setNavigationTransitioning(false);
    walkProgressRef.current = 0;
    indoorWalkProgressRef.current = 0;
    setWalkProgress(0);
    setIndoorWalkProgress(0);
    transitionResumePlaybackRef.current = false;
    verticalRunEndsAfterTransitionRef.current = false;
    pauseAfterVerticalTransitionRef.current = false;
    setVerticalRunPausePending(false);
    setNavigationPauseReason(null);
    dispatchStudentRouteUi({ type: "START_NAVIGATION", camera: selectedCamera });
    routeTransitionActivationRef.current = null;
    routeEntryTransitionCompleteRef.current = false;
    if (firstSegment) {
      const isOrigin = sourceSegments.length > 0;
      const buildingId = firstSegment.buildingId;
      const building = MOCK_BUILDINGS.find((candidate) => candidate.id === buildingId);
      const published = activeCampus?.buildings.find((candidate) => candidate.id === buildingId);
      const floor = indoorSegmentFloorNumber(firstSegment, published,
        isOrigin ? roomOrigin?.floorNumber : route.destinationRoom?.floorNumber);
      if (building && floor !== undefined) {
        if (isOrigin) {
          setOriginIndoorSegments(startSegments);
          setOriginIndoorSegmentIndex(0);
          setNavigationPhase("origin-indoor");
        } else {
          setDestinationIndoorSegments(startSegments);
          setDestinationIndoorSegmentIndex(0);
          setNavigationPhase("destination-indoor");
        }
        setFloorView({ building, floor });
        setIndoorRoute(indoorRouteFromSegment(firstSegment));
        setIndoorWalkNonce((nonce) => nonce + 1);
        return;
      }
    }
    setNavigationPhase("outdoor");
    setIndoorRoute(null);
    setActiveRouteRoom(null);
    setFloorView(null);
    setWalkNonce((nonce) => nonce + 1);
  };

  // Keep all hooks above these presentation-only screen branches. The page can
  // transition from loading to resolved campus data without changing its hook
  // order, while retaining the same loading/empty/error/coming-soon priority.
  const currentDiscoverStop = discoverTour.active && discoverTour.campusId === activeCampus?.id
    ? discoverStops[discoverTour.stopIndex]
    : undefined;
  if (loadingCampusScreen) return loadingCampusScreen;
  if (emptyCampusScreen) return emptyCampusScreen;
  if (campusErrorScreen) return campusErrorScreen;
  if (comingSoonCampusScreen) return comingSoonCampusScreen;

  return (
    <div
      ref={mapContainerRef}
      data-testid="student-map-surface"
      data-route-phase={studentRouteUi.phase}
      data-discover-mode={String(discoverTour.active)}
      data-route-collapsed={String(studentRouteUi.collapsed)}
      data-arrival-camera-active={String(arrivalCameraActive)}
      data-arrival-camera-context={arrivalCameraTarget?.context ?? ""}
      data-arrival-camera-x={arrivalCameraTarget?.cameraPoint.x ?? ""}
      data-arrival-camera-y={arrivalCameraTarget?.cameraPoint.y ?? ""}
      role="region"
      aria-label={discoverTour.active ? "Discover PLV interactive campus tour" : locationPreviewPanel ? "Report location map preview" : "Interactive campus map"}
      className={cn(
        "student-map-surface relative h-full min-h-0 w-full overflow-hidden overscroll-none animate-fade-in",
        fullScreen
          ? fullScreenHeight ? "h-full" : "h-[100dvh]"
          : "h-full",
      )}
      style={{
        height: fullScreen ? fullScreenHeight ?? "100dvh" : undefined,
        "--student-map-utility-bottom": fullScreen ? "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))" : "1rem",
        "--student-map-safe-area-bottom": "env(safe-area-inset-bottom, 0px)",
        background: viewportBackground,
        animationDuration: reducedMotion ? "0ms" : "200ms",
        cursor: "grab",
        // Building/report panels contain native vertical scroll regions. Let
        // those regions receive touch scrolling; the map renderers retain
        // touch-action:none locally so their custom pan gestures stay intact.
        touchAction: discoverTour.active || locationPreviewPanel || selected ? "pan-y" : "none",
        ...(student3DActive ? { cursor: "default" } : {}),
      } as CSSProperties}
      onMouseDown={student3DActive ? undefined : onMouseDown} onMouseMove={student3DActive ? undefined : onMouseMove}
      onMouseUp={student3DActive ? undefined : onMouseUp} onMouseLeave={student3DActive ? undefined : onMouseUp}
      onTouchStart={student3DActive ? undefined : onTouchStart} onTouchMove={student3DActive ? undefined : onTouchMove}
      onTouchEnd={student3DActive ? undefined : onTouchEnd}
      onPointerDown={student3DActive ? undefined : onPointerDown} onPointerMove={student3DActive ? undefined : onPointerMove}
      onPointerUp={student3DActive ? undefined : onPointerEnd} onPointerCancel={student3DActive ? undefined : onPointerEnd}>

      {activeCampus && readonlyOutdoorCampus && campus3DActive && (
        <div className="student-map-renderer-crossfade absolute inset-0 z-0" style={{ animationDuration: reducedMotion ? "0.01ms" : "150ms" }}>
          <Suspense fallback={null}>
            <LazyStudentCampus3DRenderer
              campus={readonlyOutdoorCampus}
              routeMode={mapMode}
              routeColor={activeEmergencyRouteMapColor}
              animateRouteArrows={routeFlowAnimated && !routeFlowPaused && !discoverTour.active}
              routePoints={discoverTour.active ? EMPTY_MAP_POINTS : campus3DRoutePoints}
              routeSegments={discoverTour.active ? [] : campus3DRouteSegments}
              emergencyRouteSegments={discoverTour.active ? [] : studentEmergencyCampusRouteSegments}
              activeEmergencyRouteId={discoverTour.active ? null : activeEmergencyRouteId}
              emergencyRouteOverview={discoverTour.active ? false : emergencyRouteOverview}
              emergencyRouteOverviewNonce={discoverTour.active ? 0 : emergencyOverviewCameraRequestRef.current}
              emergencyAssemblyPointIds={discoverTour.active ? new Set<string>() : studentEmergencyAssemblyPointIds}
              activeEmergencyAssemblyPointId={discoverTour.active ? null : activeStudentEmergencyAssemblyPointId}
              followRoutePoints={discoverTour.active ? EMPTY_MAP_POINTS : campus3DFollowRoutePoints}
              routePreview={!discoverTour.active && Boolean(route && studentRouteUi.phase === "preview")}
              startPoint={discoverTour.active ? null : campus3DRoutePoints[0] ?? null}
              destinationPoint={discoverTour.active ? null : campus3DRoutePoints.at(-1) ?? null}
              showStartMarker={!discoverTour.active && campusShowsStartMarker}
              showDestinationMarker={!discoverTour.active && campusShowsEndMarker && !route?.emergencyAssemblyPointId}
              humanPoint={discoverTour.active ? null : campus3DHumanPoint}
              walkProgressRef={discoverTour.active || arrivalCameraActive ? undefined : walkProgressRef}
              activeTransition={discoverTour.active ? null : campus3DActiveTransition}
              exploreTransitionCues={discoverTour.active ? [] : campus3DExploreTransitionCues}
              focusPoint={campus3DFocusPoint}
              focusNonce={searchFocusNonce}
              focusOnViewportChange={discoverTour.active}
              showcaseBuildingId={discoverTour.active && discoverTour.view === "showcase" ? currentDiscoverStop?.published.id ?? null : null}
              arrivalFocusPoint={!discoverTour.active && arrivalCameraActive && arrivalCameraTarget?.context === "campus" ? arrivalCameraTarget.cameraPoint : null}
              arrivalFocusKey={!discoverTour.active && arrivalCameraActive && arrivalCameraTarget?.context === "campus" ? arrivalCameraTarget.key : null}
              arrivalFocusBuildingId={!discoverTour.active && arrivalCameraActive && arrivalCameraTarget?.context === "campus" ? arrivalCameraTarget.buildingId ?? null : null}
              arrivalFocusPlaceId={!discoverTour.active && arrivalCameraActive && arrivalCameraTarget?.context === "campus" ? arrivalCameraTarget.campusPlaceId ?? null : null}
              routeInspectionFocusPoint={!discoverTour.active && routeInspectionFocus?.target.context === "campus" ? routeInspectionFocus.point : null}
              routeInspectionFocusKey={!discoverTour.active && routeInspectionFocus?.target.context === "campus" ? routeInspectionFocus.key : undefined}
              recenterNonce={student3dCameraRecenterNonceForContext(campus3DCameraRecenterRequest, "campus")}
              onRecenterComplete={onCampus3DCameraRecenterComplete}
              selectedBuildingId={selected?.id}
              selectedPlaceId={discoverTour.active ? null : selectedCampusPlaceId}
              showEvents={!discoverTour.active && showEventMaps}
              eventVenues={discoverTour.active ? [] : campus3DEventVenues}
              eventFurniture={!discoverTour.active && showEventMaps && selectedLocationIsVisible && selectedEventLocationData?.location.locationRef.type === "campus"
                ? selectedEventLocationData.location.eventFurniture
                : EMPTY_FLOOR_FURNITURE}
              eventLabels={!discoverTour.active && showEventMaps && selectedLocationIsVisible && selectedEventLocationData?.location.locationRef.type === "campus"
                ? selectedEventLocationData.location.eventLabels
                : EMPTY_FLOOR_LABELS}
              selectedEventLocationId={discoverTour.active ? null : currentEventLocationId}
              darkMode={darkMode}
              reducedMotion={reducedMotion}
              followPlaying={!discoverTour.active && studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && studentRouteUi.playback === "playing" && !followCameraDetached && navigationPhase === "outdoor"}
              followMode={!discoverTour.active && studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && navigationPhase === "outdoor"}
              freeLook={!discoverTour.active && followCameraDetached}
              exploreTransitionsEnabled={!discoverTour.active && isRouteExplore}
              followSessionKey={route ? `${route.fromCode}:${route.toCode}:${route.mode}` : "idle"}
              onSelectBuilding={discoverTour.active ? undefined : handleOutdoorBuildingSelect}
              onSelectPlace={discoverTour.active ? undefined : handleOutdoorCampusPlaceSelect}
              onEnterBuilding={discoverTour.active ? undefined : handleStudentOutdoorEntranceClick}
              onInspectEventVenue={discoverTour.active ? undefined : setInspectedEventVenueId}
              onIntentionalPan={discoverTour.active ? undefined : beginFollowPan}
              onCameraPoseChange={rememberCampusCameraPose}
              recenterFollowOffset={student3dCameraFollowOffsetForContext(campus3DCameraRecenterRequest, "campus")}
              cameraPoseRestore={cameraPoseRestore}
              cameraPoseRestoreNonce={cameraPoseRestoreNonce}
              onFallback={handleCampus3DFallback}
            />
          </Suspense>
        </div>
      )}

      {isFloorMode && activeFloorPlan && indoor3DActive && (
        <div className="student-map-renderer-crossfade absolute inset-0 z-0" style={{ animationDuration: reducedMotion ? "0.01ms" : "150ms" }} aria-label={`${floorView?.building.name ?? "Building"} ${currentFloor?.label ?? "Floor"} 3D map`}>
          <Suspense fallback={null}>
            <LazyIndoorFloor3DRenderer
              floor={activeFloorPlan}
              routeMode={mapMode}
              routeColor={activeEmergencyRouteMapColor}
              animateRouteArrows={routeFlowAnimated && !routeFlowPaused && !discoverTour.active}
              hasLowerServedFloor={activeFloorOrdinal.index > 0}
              darkMode={darkMode}
              floorLabel={`${floorView?.building.name ?? "Building"} · ${currentFloor?.label ?? "Floor"}`}
              viewport={floorViewport}
              routePoints={!discoverTour.active && indoorRouteMatchesVisibleFloor ? visibleIndoorRoute?.waypoints ?? EMPTY_MAP_POINTS : EMPTY_MAP_POINTS}
              emergencyRouteSegments={discoverTour.active ? [] : studentEmergencyFloorRouteSegments}
              emergencyRouteOverview={!discoverTour.active && emergencyRouteOverview}
              routePreviewFocusKey={!discoverTour.active && route && studentRouteUi.phase === "preview"
                ? `${route.fromCode}:${route.toCode}:${route.mode}:${routeIndoorSegments.map((segment) => `${segment.buildingId}:${segment.floorId ?? segment.floorNumber}`).join("|")}`
                : undefined}
              discoverCamera={discoverTour.active && discoverTour.view === "inside"}
              activeEmergencyRouteId={discoverTour.active ? null : activeEmergencyRouteId}
              walkProgress={discoverTour.active ? undefined : arrivalIndoorContextActive ? 1
                : studentRouteUi.phase === "preview" && showEmergencyFloorProgressMarker ? emergencyFloorProgress
                  : routePlaybackMarkerVisibleOnActiveIndoorSegment && routePlaybackMarkerTarget?.context === "floor" ? routePlaybackMarkerTarget.segmentProgress : undefined}
              walkProgressRef={discoverTour.active || arrivalIndoorContextActive || studentRouteUi.phase === "preview" || !routePlaybackMarkerVisibleOnActiveIndoorSegment ? undefined : indoorWalkProgressRef}
              showStartMarker={!discoverTour.active && indoorShowsStartMarker && indoorRouteMatchesVisibleFloor}
              showDestinationMarker={!discoverTour.active && indoorShowsEndMarker && indoorRouteMatchesVisibleFloor}
              humanVisible={!discoverTour.active && ((studentRouteUi.phase === "preview" && showEmergencyFloorProgressMarker)
                || (studentRouteUi.phase === "navigating" && routePlaybackMarkerVisibleOnActiveIndoorSegment))}
              selectedRoomId={discoverTour.active ? selectedRoomContext?.roomId ?? highlightedRoom : arrivalIndoorContextActive && arrivalCameraTarget?.roomId ? arrivalCameraTarget.roomId : routePlannerMapPickRoomOnFloor?.roomId ?? selectedRoomContext?.roomId ?? highlightedRoom}
              interactiveExitDoorIds={discoverTour.active ? new Set<string>() : interactiveExitDoorIds}
              routeRelevantExitDoorIds={discoverTour.active ? new Set<string>() : routeRelevantExitDoorIds}
              activeExitDoorId={discoverTour.active ? null : activeExitDoorId}
              onExitDoorClick={discoverTour.active ? undefined : handleStudentFloorDoorClick}
              focusRoomId={discoverTour.active
                ? selectedRoomContext?.buildingId === floorView?.building.id && selectedRoomContext.floorNumber === floorView.floor ? selectedRoomContext.roomId : null
                : arrivalIndoorContextActive && arrivalCameraTarget?.roomId
                  ? arrivalCameraTarget.roomId
                  : routePlannerMapPickRoomOnFloor?.roomId
                    ?? (selectedRoomContext?.buildingId === floorView?.building.id && selectedRoomContext.floorNumber === floorView.floor
                      ? selectedRoomContext.roomId
                      : searchFocusRef.current?.buildingId === floorView?.building.id
                        && searchFocusRef.current.floorNumber === floorView.floor ? searchFocusRef.current.roomId ?? null : null)}
              focusNonce={searchFocusNonce}
              arrivalFocusKey={!discoverTour.active && arrivalIndoorContextActive ? arrivalCameraTarget?.key : undefined}
              arrivalFocusPoint={!discoverTour.active && arrivalIndoorContextActive ? arrivalCameraTarget?.avatarPoint ?? null : null}
              arrivalApproachPoint={!discoverTour.active && arrivalIndoorContextActive ? arrivalCameraTarget?.approachPoint ?? null : null}
              routeInspectionFocusPoint={!discoverTour.active && routeInspectionFocus?.target.context === "floor"
                && routeInspectionFocus.target.segment?.buildingId === floorView?.building.id
                && (routeInspectionFocus.target.segment?.floorId
                  ? routeInspectionFocus.target.segment?.floorId === activeFloorPlan.id
                  : routeInspectionFocus.target.segment?.floorNumber === floorView.floor)
                ? routeInspectionFocus.point : null}
              routeInspectionFocusKey={!discoverTour.active && routeInspectionFocus?.target.context === "floor"
                && routeInspectionFocus.target.segment?.buildingId === floorView?.building.id
                && (routeInspectionFocus.target.segment?.floorId
                  ? routeInspectionFocus.target.segment?.floorId === activeFloorPlan.id
                  : routeInspectionFocus.target.segment?.floorNumber === floorView.floor)
                ? routeInspectionFocus.key : undefined}
              destinationRoomId={!discoverTour.active && route?.destinationRoom && route.destinationRoom.buildingId === floorView?.building.id && route.destinationRoom.floorNumber === floorView.floor ? route.destinationRoom.roomId : null}
              eventFurniture={!discoverTour.active && showEventMaps && selectedLocationIsVisible ? selectedEventLocationData?.location.eventFurniture ?? EMPTY_FLOOR_FURNITURE : EMPTY_FLOOR_FURNITURE}
              showDiningFurniture={Boolean(floorView && (/canteen/i.test(floorView.building.name) || /^can$/i.test(floorView.building.code)))}
              eventLabels={!discoverTour.active && showEventMaps && selectedLocationIsVisible ? selectedEventLocationData?.location.eventLabels ?? EMPTY_FLOOR_LABELS : EMPTY_FLOOR_LABELS}
              eventMarker={discoverTour.active ? null : indoor3DEventMarker}
              activeTransition={discoverTour.active ? null : indoor3DActiveTransition}
              exploreTransitionCues={discoverTour.active ? [] : indoor3DExploreTransitionCues}
              followMode={!discoverTour.active && studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && visibleIndoorRouteIsActive}
              followPlaying={!discoverTour.active && studentRouteUi.phase === "navigating" && studentRouteUi.camera === "follow" && studentRouteUi.playback === "playing" && visibleIndoorRouteIsActive}
              freeLook={!discoverTour.active && followCameraDetached}
              recenterNonce={student3dCameraRecenterNonceForContext(campus3DCameraRecenterRequest, routeContextKey)}
              recenterFollowOffset={student3dCameraFollowOffsetForContext(campus3DCameraRecenterRequest, routeContextKey)}
              onRecenterComplete={onIndoor3DCameraRecenterComplete}
              reducedMotion={reducedMotion}
              onCameraPoseChange={rememberIndoorCameraPose}
              cameraPoseRestore={cameraPoseRestore}
              cameraPoseRestoreNonce={cameraPoseRestoreNonce}
              onRoomClick={selectIndoorRoom}
              onIntentionalPan={discoverTour.active ? undefined : beginFollowPan}
              onFallback={handleCampus3DFallback}
            />
          </Suspense>
        </div>
      )}

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
      {youAreHere && !qrRouteStartNotice && !pinning && !searchFocused && !isFloorMode && !directionsMode && (
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

      {isFloorMode && selectedRoomContext
        && selectedRoomContext.buildingId === floorView?.building.id
        && selectedRoomContext.floorNumber === floorView?.floor
        && (!directionsMode || discoverTour.active) && !stairLoading && navigationPhase === "idle"
        // The admin report preview panel already describes the room; the highlight on the plan is enough.
        && !locationPreviewPanel && (
        <StudentSelectedPlaceCard
          key={`${selectedRoomContext.buildingId}:${selectedRoomContext.floorNumber}:${selectedRoomContext.roomId}`}
          room={selectedRoomContext}
          campusId={activeCampus?.id}
          floorId={activeFloorPlan?.id}
          buildingId={selectedRoomContext.buildingId}
          description={activeFloorPlan?.rooms.find((room) => room.id === selectedRoomContext.roomId)?.description}
          roomPhotoPath={activeFloorPlan?.rooms.find((room) => room.id === selectedRoomContext.roomId)?.roomPhotoPath}
          hideRouteActions={discoverTour.active}
          suspendedForFloorPicker={floorPickerFallbackActive}
          suspendedForSearch={searchFocused}
          emergencyVideoGuide={!discoverTour.active && selectedEmergencyVideo?.room.id === selectedRoomContext.roomId
            && selectedEmergencyVideo.room.buildingId === selectedRoomContext.buildingId
            && selectedEmergencyVideo.room.floorId === activeFloorPlan?.id
            ? selectedEmergencyVideo.guide : undefined}
          emergencyVideoRouteFingerprint={!discoverTour.active && selectedEmergencyVideo?.room.id === selectedRoomContext.roomId
            && selectedEmergencyVideo.room.buildingId === selectedRoomContext.buildingId
            && selectedEmergencyVideo.room.floorId === activeFloorPlan?.id
            ? selectedEmergencyVideo.routeFingerprint : undefined}
          emergencyMode={!discoverTour.active && mapMode === "emergency"}
          emergencyVideoPlaybackState={emergencyVideoPlaybackState}
          emergencyVideoAutoplayEnabled={emergencyVideoAutoplayEnabled}
          onWatchEmergencyVideo={openEmergencyVideo}
          onEmergencyVideoPlaybackStateChange={saveEmergencyVideoPlaybackState}
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

      {navigationTransitioning && isFloorMode && !stairLoading && (
        <div data-no-drag className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+8rem)] z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground/90 px-3 py-1.5 text-[11px] font-bold text-background shadow-xl animate-fade-in md:top-16">
          <Navigation className="h-3.5 w-3.5 animate-pulse" />
          <span>{stairLoading?.label ?? "Changing route context…"}</span>
        </div>
      )}

      {/* ══════════════════════════ MAP SVG ══════════════════════════ */}
      {!student3DActive && <svg ref={svgRef}
        viewBox={`0 0 ${viewportCanvasW} ${viewportCanvasH}`}
        className="student-map-renderer-crossfade absolute inset-0 w-full h-full select-none touch-none"
        style={{ animationDuration: reducedMotion ? "0.01ms" : "150ms" }}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
        onDoubleClick={e => {
          e.preventDefault();
          if (!isFloorMode && (e.target as Element).closest("[data-bldg]")) return;
          detachFollowCamera();
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
          ref={setCameraGroupRef}
          data-testid="student-map-camera-transform"
          transform={`translate(${viewCX * (1 - displayZoom) + pan.x} ${viewCY * (1 - displayZoom) + pan.y}) scale(${displayZoom})`}
          style={{ transformBox: "view-box", transformOrigin: "0 0" }}
        >

          {/* ════════ FLOOR PLAN mode ════════ */}
          {isFloorMode ? (() => {
            if (!activeFloorPlan) return null;
            return (
              <g transform={`translate(${floorViewport.offsetX},${floorViewport.offsetY})`}>
                <g
                  key={activeFloorPlan.id}
                  data-testid="student-floor-scene"
                  data-floor-id={activeFloorPlan.id}
                  data-floor-number={floorView?.floor}
                  className="student-floor-scene-transition"
                  style={reducedMotion ? undefined : {
                    animation: floorShiftDirectionRef.current === "up"
                      ? "student-floor-scene-enter-up 140ms ease-out both"
                      : floorShiftDirectionRef.current === "down"
                        ? "student-floor-scene-enter-down 140ms ease-out both"
                        : "student-floor-scene-enter 140ms ease-out both",
                    transformBox: "fill-box",
                    transformOrigin: "center",
                  }}
                >
                <Suspense fallback={<text data-testid="student-floor-scene-loading" role="status" aria-label="Loading floor map" x={viewCX} y={viewCY} textAnchor="middle" dominantBaseline="middle" fill="currentColor" fontSize={14}>Loading floor map…</text>}>
                <LazyReadonlyFloorPlanScene
                  floor={activeFloorPlan}
                  routeOverlay={indoorRouteLineOverlay}
                  floorIndex={activeFloorOrdinal.index}
                  floorCount={activeFloorOrdinal.count}
                  entrances={activeFloorEntrances}
                  exteriorEmergencyStairs={activeFloorExteriorStairs}
                  interactiveExitDoorIds={interactiveExitDoorIds}
                  compactExitActions
                  routeRelevantExitDoorIds={routeRelevantExitDoorIds}
                  activeExitDoorId={activeExitDoorId}
                  suppressActiveExitDoorId={activeRouteTransition?.kind === "exit_building" ? activeExitDoorId : undefined}
                  reducedMotion={reducedMotion}
                  mapPickActive={Boolean(routePlannerMapPick)}
                  mapMode={mapMode}
                  showLabels={platformSettings.showMapLabels}
                  highlightedRoomId={routePlannerMapPickCandidate?.endpoint.kind === "room" ? routePlannerMapPickCandidate.endpoint.room.roomId : highlightedRoom}
                  interactiveRoomIds={interactiveFloorRoomIds}
                  hoveredRoomId={hoveredRoom}
                  onRoomClick={selectIndoorRoom}
                  onRoomHover={handleFloorRoomHover}
                  onRoomHoverEnd={handleFloorRoomHoverEnd}
                  onDoorClick={handleStudentFloorDoorClick}
                />
                </Suspense>
                {showEventMaps && isFloorMode && selectedLocationIsVisible && selectedEventOverlay && <EventPreviewLayer events={[selectedEventOverlay]} onSelect={() => {}} />}
                {/* Indoor navigation path (entrance → active room) */}
                {visibleIndoorRoute && visibleIndoorRoute.waypoints.length >= 2 && indoorRouteMatchesVisibleFloor && (
                  <g data-testid="floor-indoor-route-markers" style={{ pointerEvents: "none" }}>
                    <RouteMapOverlay
                      points={visibleIndoorRoute.waypoints}
                      mode={mapMode}
                      animated={routeFlowAnimated}
                      flowPaused={routeFlowPaused}
                  walkProgress={arrivalIndoorContextActive ? 1 : routePlaybackMarkerVisibleOnActiveIndoorSegment && routePlaybackMarkerTarget?.context === "floor" ? routePlaybackMarkerTarget.segmentProgress : undefined}
                      layer="markers"
                      showStartMarker={indoorShowsStartMarker}
                      showEndMarker={indoorShowsEndMarker}
                      progressFrameWriterRef={indoorRouteMarkerProgressWriterRef}
                    />
                  </g>
                )}
                {!discoverTour.active && studentRouteUi.phase === "preview" && studentRouteTransitionCues.filter((cue) => cue.id === previewActiveTransitionCue?.cue.id).map((cue) => {
                  const active = previewActiveTransitionCue?.cue.id === cue.id;
                  const inspectionLabel = studentRouteInspectionTransitionDisplayLabel(cue.kind, cue.label);
                  return (
                  <StudentRouteTransitionMarker
                    key={`preview-${cue.id}`}
                    x={cue.point.x}
                    y={cue.point.y}
                    kind={cue.kind}
                    label={inspectionLabel}
                    displayLabel={inspectionLabel}
                    markerId={cue.id}
                    active={active}
                    reducedMotion={reducedMotion}
                    zoom={displayZoom}
                    viewport={studentRouteTransitionViewport}
                    context={{ kind: "floor", buildingId: floorView.building.id, floorId: activeFloorPlan.id }}
                    onActivate={active ? () => inspectRoutePreviewTransition(cue.id) : undefined}
                  />
                  );
                })}
                {!discoverTour.active && isRouteExplore && routeInspectionTarget?.context === "floor" && exploreRouteTransitionMarkers.map((cue) => (
                  <StudentRouteTransitionMarker
                    key={`explore-${cue.id}`}
                    x={cue.point.x}
                    y={cue.point.y}
                    kind={cue.kind}
                    label={cue.label}
                    displayLabel={cue.displayLabel}
                    markerId={cue.id}
                    choices={cue.choices}
                    active
                    reducedMotion={reducedMotion}
                    zoom={displayZoom}
                    viewport={studentRouteTransitionViewport}
                    context={{ kind: "floor", buildingId: floorView.building.id, floorId: activeFloorPlan.id }}
                  />
                ))}
                {guidedAccessTransitionCue && isFloorMode && (
                  <StudentRouteTransitionMarker
                    key={`guided-access-${guidedAccessTransitionCue.cue.id}`}
                    x={guidedAccessTransitionCue.cue.point.x}
                    y={guidedAccessTransitionCue.cue.point.y}
                    kind={guidedAccessTransitionCue.cue.kind}
                    label={guidedAccessTransitionCue.cue.label}
                    markerId={guidedAccessTransitionCue.cue.id}
                    reducedMotion={reducedMotion}
                    zoom={displayZoom}
                    viewport={studentRouteTransitionViewport}
                    context={{ kind: "floor", buildingId: floorView.building.id, floorId: activeFloorPlan.id }}
                    onActivate={() => seekRouteStep(guidedAccessTransitionCue.transitionStepIndex)}
                  />
                )}
                {!discoverTour.active && studentRouteUi.phase === "navigating" && studentRouteUi.camera !== "explore" && activeRouteTransition && activeRouteTransitionPoint && isFloorMode && (
                  <StudentRouteTransitionMarker
                    x={activeRouteTransitionPoint.x}
                    y={activeRouteTransitionPoint.y}
                    kind={activeRouteTransition.kind}
                    label={routeNavigationSteps[activeTransitionStepIndex]?.instruction ?? "Current route transition"}
                    displayLabel={activeRouteTransitionDisplayLabel}
                    markerId={activeRouteTransition.detail?.nodeId}
                    reducedMotion={reducedMotion}
                    active={!authorizedVerticalRunPaused}
                    zoom={displayZoom}
                    viewport={studentRouteTransitionViewport}
                    context={{ kind: "floor", buildingId: floorView?.building.id, floorId: activeFloorPlan?.id }}
                    onActivate={activateCurrentRouteTransition}
                  />
                )}
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
                routeOverlay={outdoorRouteLineOverlay}
                zoom={displayZoom > 0.7 ? 1 : 0.5}
                studentZoom={displayZoom}
                studentPixelScale={studentMapFitScale}
                showBuildings={true}
                showLabels={platformSettings.showMapLabels}
                compactEntryActions
                routeRelevantEntranceIds={routeRelevantEntranceIds}
                activeEntranceId={activeOutdoorEntranceId}
                suppressActiveEntranceId={activeRouteTransition?.kind === "enter_building" ? activeOutdoorEntranceId : undefined}
                suppressActiveEntranceBuildingId={!isFloorMode ? activeRouteEnterBuildingId : null}
                reducedMotion={reducedMotion}
                mapPickActive={Boolean(routePlannerMapPick)}
                studentSuhayHusayLandmark
                emergencyMode={mapMode === "emergency"}
                emergencyAssemblyPointIds={studentEmergencyAssemblyPointIds}
                activeEmergencyAssemblyPointId={activeStudentEmergencyAssemblyPointId}
                selectedBuildingId={selected?.id ?? (routePlannerMapPickCandidate?.endpoint.kind === "building" || routePlannerMapPickCandidate?.endpoint.kind === "room" ? routePlannerMapPickCandidate.endpoint.building.id : null)}
                selectedCampusPlaceId={selectedCampusPlaceId ?? (routePlannerMapPickCandidate?.endpoint.kind === "campus-place" ? routePlannerMapPickCandidate.endpoint.place.campusPlaceId : null)}
                onSelectBuilding={handleOutdoorBuildingSelect}
                onSelectCampusPlace={handleOutdoorCampusPlaceSelect}
                onDoubleClickBuilding={handleOutdoorBuildingDoubleClick}
                onClickEntrance={handleStudentOutdoorEntranceClick}
              />
            )}
            {!discoverTour.active && showEventMaps && !isFloorMode && activeCampus && <EventVenueLayer campus={activeCampus} events={venueEvents} zoom={displayZoom} selectedLocationId={currentEventLocationId} onInspectVenue={setInspectedEventVenueId} onSelect={viewEventLocation} />}
            {!discoverTour.active && showEventMaps && !isFloorMode && selectedLocationIsVisible && selectedEventOverlay && <EventPreviewLayer events={[selectedEventOverlay]} onSelect={() => {}} />}
            {/* Route */}
            {route && !discoverTour.active && (
              <>
                <RouteMapOverlay points={route.points} mode={mapMode} fading={routeFading} animated={routeFlowAnimated} flowPaused={routeFlowPaused} layer="markers" showStartMarker={campusShowsStartMarker} showEndMarker={campusShowsEndMarker && !route.emergencyAssemblyPointId} />
                {campus2DFollowMarkerPoints && campus2DProgressMarkerProgress !== undefined && (
                  <RouteMapOverlay
                    points={campus2DFollowMarkerPoints}
                    mode={mapMode}
                    fading={routeFading}
                    walkProgress={campus2DProgressMarkerProgress}
                    animated={routeFlowAnimated}
                    flowPaused={routeFlowPaused}
                    layer="markers"
                    showStartMarker={false}
                    showEndMarker={false}
                    progressFrameWriterRef={outdoorRouteMarkerProgressWriterRef}
                  />
                )}
              </>
            )}
            {!discoverTour.active && studentRouteUi.phase === "preview" && studentRouteTransitionCues.filter((cue) => cue.id === previewActiveTransitionCue?.cue.id).map((cue) => {
              const active = previewActiveTransitionCue?.cue.id === cue.id;
              const inspectionLabel = studentRouteInspectionTransitionDisplayLabel(cue.kind, cue.label);
              return (
              <StudentRouteTransitionMarker
                key={`preview-${cue.id}`}
                x={cue.point.x}
                y={cue.point.y}
                kind={cue.kind}
                label={inspectionLabel}
                displayLabel={inspectionLabel}
                markerId={cue.id}
                active={active}
                reducedMotion={reducedMotion}
                zoom={displayZoom}
                viewport={studentRouteTransitionViewport}
                context={{ kind: "outdoor" }}
                onActivate={active ? () => inspectRoutePreviewTransition(cue.id) : undefined}
              />
              );
            })}
            {!discoverTour.active && isRouteExplore && routeInspectionTarget?.context === "campus" && exploreRouteTransitionMarkers.map((cue) => (
              <StudentRouteTransitionMarker
                key={`explore-${cue.id}`}
                x={cue.point.x}
                y={cue.point.y}
                kind={cue.kind}
                label={cue.label}
                displayLabel={cue.displayLabel}
                markerId={cue.id}
                choices={cue.choices}
                active
                reducedMotion={reducedMotion}
                zoom={displayZoom}
                viewport={studentRouteTransitionViewport}
                context={{ kind: "outdoor" }}
              />
            ))}
            {!discoverTour.active && studentRouteUi.phase === "navigating" && studentRouteUi.camera !== "explore" && activeRouteTransition && activeRouteTransitionPoint && !isFloorMode && (
              <StudentRouteTransitionMarker
                x={activeRouteTransitionPoint.x}
                y={activeRouteTransitionPoint.y}
                kind={activeRouteTransition.kind}
                label={routeNavigationSteps[activeTransitionStepIndex]?.instruction ?? "Current route transition"}
                displayLabel={activeRouteTransitionDisplayLabel}
                markerId={activeRouteTransition.detail?.nodeId}
                reducedMotion={reducedMotion}
                zoom={displayZoom}
                viewport={studentRouteTransitionViewport}
                context={{ kind: "outdoor" }}
                onActivate={activateCurrentRouteTransition}
              />
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
      </svg>}

      {/* ══════════════ FLOATING SEARCH / DIRECTIONS — same for both modes ══════════════ */}
      {!discoverTour.active && routePanelVisible ? (
        <motion.div
          key="route-planner-container"
          data-no-drag
          className="pointer-events-none absolute inset-0 z-30 md:inset-auto md:left-3 md:top-3 md:w-[clamp(380px,34vw,460px)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: "easeOut" }}
        >
          <RoutePlannerDialog
              from={fromBuilding}
              to={toBuilding}
              fromCampusPlace={fromCampusPlace}
              toCampusPlace={toCampusPlace}
              qrStartNotice={qrRouteStartNotice}
              onFromChange={(building) => {
                invalidateRouteForPlannerChange();
                setArrivalCameraTarget(null);
                setNavigationPhase("idle");
                setQrRouteStartNotice(null);
                setRoomOrigin(null);
                setFromCampusPlace(null);
                setFromBuilding(building);
                setSelectedRoomContext(null);
              }}
              onFromRoomChange={(room) => {
                invalidateRouteForPlannerChange();
                setArrivalCameraTarget(null);
                if (!room) {
                  setNavigationPhase("idle");
                  setQrRouteStartNotice(null);
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
                setQrRouteStartNotice(null);
                setRoomOrigin(room);
                setFromCampusPlace(null);
                setFromBuilding(building);
                setUseMyLocation(false);
                setHighlightedRoom(room.roomId);
                setActiveRouteRoom(room.roomId);
              }}
              onToChange={(building) => {
                invalidateRouteForPlannerChange();
                setArrivalCameraTarget(null);
                setNavigationPhase("idle");
                setQrRouteStartNotice(null);
                setRoomDestination(null);
                setToCampusPlace(null);
                setToBuilding(building);
                setSelectedRoomContext(null);
              }}
              buildings={MOCK_BUILDINGS}
              mode={mapMode}
              onModeChange={(mode) => {
                routeModeTouchedRef.current = true;
                if (mode !== mapMode) invalidateRouteForPlannerChange();
                if (mode === "emergency") {
                  if (emergencyVideoSessionKey) {
                    emergencyVideoAutoplaySuppressedRef.current = { key: emergencyVideoSessionKey, suppressed: true };
                  }
                  setEmergencyVideoOverlayKey(null);
                  const gateIds = new Set((activeCampus?.markers ?? []).filter((marker) => marker.type === "gate").map((marker) => marker.id));
                  const invalidFrom = Boolean(fromCampusPlace && gateIds.has(fromCampusPlace.campusPlaceId));
                  const invalidTo = Boolean(toCampusPlace && gateIds.has(toCampusPlace.campusPlaceId));
                  const invalidCandidate = routePlannerMapPickCandidate?.endpoint.kind === "campus-place"
                    && gateIds.has(routePlannerMapPickCandidate.endpoint.place.campusPlaceId);
                  if (invalidFrom) setFromCampusPlace(null);
                  if (invalidTo) setToCampusPlace(null);
                  if (invalidCandidate) setRoutePlannerMapPickCandidate(null);
                  // SOS supplies its own safe destination. Clear the normal
                  // route's hidden destination too, otherwise that stale
                  // endpoint is still excluded from the Start search results.
                  setRoomDestination(null);
                  setToCampusPlace(null);
                  setToBuilding(null);
                  if (invalidFrom || invalidTo || invalidCandidate) {
                    setRoutePlannerSelectionError("Campus Gate is not available for Emergency routing.");
                  } else setRoutePlannerSelectionError(null);
                } else {
                  setRoutePlannerSelectionError(null);
                  setActiveEmergencyRouteId(null);
                  setEmergencyRouteOverview(false);
                  setEmergencyVideoOverlayKey(null);
                }
                setMapMode(mode);
              }}
              route={routePanelPhase === "planning" ? null : route}
              phase={routePanelPhase}
              cameraMode={studentRouteUi.camera}
              collapsed={studentRouteUi.collapsed}
              mobilePreviewExpanded={mobileRoutePreviewExpanded}
              suspendedForFloorPicker={floorPickerFallbackActive}
              emergencyRoutes={smartEmergencyRouteChoices}
              automaticRouteChoices={automaticRouteChoices}
              activeAutomaticRouteId={activeAutomaticRouteId}
              onSelectAutomaticRoute={selectAutomaticRouteAlternative}
              emergencyAvailability={emergencyPlannerAvailability}
              activeEmergencyRouteId={activeEmergencyRouteId}
              emergencyRouteOverview={emergencyRouteOverview}
              onSelectEmergencyRoute={selectApprovedEmergencyRoute}
              onReturnToEmergencyOverview={returnToEmergencyRouteOverview}
              onCameraModeChange={(cameraMode) => {
                if (cameraMode === "explore") {
                  enterRouteExplore();
                  return;
                }
                setFollowCameraDetached(false);
                if (studentRouteUi.phase === "navigating") {
                  if (routeTransitionBusy) {
                    dispatchStudentRouteUi({ type: "SET_CAMERA_MODE", camera: "follow" });
                  } else {
                    recenterCurrentRouteStep();
                  }
                  return;
                }
                dispatchStudentRouteUi({ type: "SET_CAMERA_MODE", camera: "follow" });
                const firstSegment = route?.indoorSegments?.find((segment) =>
                  segment.buildingId === roomOrigin?.buildingId && segment.floorNumber === roomOrigin.floorNumber,
                );
                if (firstSegment) focusRouteStartView(firstSegment.waypoints[0], true);
              }}
              playbackPaused={studentRouteUi.playback === "paused"}
              inspectionPaused={routePausedForInspection}
              primaryAction={activeRoutePrimaryAction}
              primaryActionDisabled={routeContextRecoveryPending || routeContextRecoveryFailed || routeStepSeeking && activeRoutePrimaryAction !== "pause"}
              transitionBusy={routeTransitionBusy && !routeStepSeeking}
              contextRecoveryPending={routeContextRecoveryPending}
              contextRecoveryFailed={routeContextRecoveryFailed}
              onRetryContextRecovery={resumeNavigation}
              pauseDuringVerticalRun={verticalRunPauseAvailable}
              verticalRunPausePending={verticalRunPausePending}
              transitionAwaitingAction={transitionAwaitingAction}
              transitionActionLabel={transitionActionLabel}
              transitionPrompt={transitionPrompt}
              onContinueTransition={activateCurrentRouteTransition}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
              navigationSteps={route ? studentFacingRouteSteps(route).map((step) => step.instruction) : []}
              currentStepIndex={activeRouteStepIndex}
              seekTargetIndex={routeStepSeeking ? routeControlStepIndex : null}
              followStepIndex={Math.floor(playbackCursor + 0.000001)}
              onInspectStep={inspectGuidedRouteInstruction}
              inspectionContextLabel={routeInspectionContextLabel}
              editingCompletedRoute={completedRouteEditSnapshotRef.current !== null}
              onEditRoute={studentRouteUi.phase === "arrived" ? beginCompletedRouteEdit : invalidateRouteForPlannerChange}
              onCancelEditRoute={cancelCompletedRouteEdit}
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
                if (!endpointsSet) return false;
                // Every room-origin SOS uses the automatic emergency graph
                // resolver, even when it finds zero candidates. Falling back
                // to the generic planner here could make an unreviewed stair
                // path look startable merely because there is no Route A/B
                // selector to render.
                const useAutomaticEmergencyRoomRoutes = mapMode === "emergency" && Boolean(roomOrigin);
                if (useAutomaticEmergencyRoomRoutes && approvedStudentEmergencyRoutes.length === 0) {
                  setRoutePlannerSelectionError(studentEmergencyRouteResolution.message
                    ?? "No connected eligible emergency route is available. Follow posted campus instructions.");
                  return false;
                }
                const planned = useAutomaticEmergencyRoomRoutes
                  ? approvedStudentEmergencyRoutes[0]?.candidate.route ?? null
                  : calculateRoute();
                const emergencyOrigin = fromCampusPlace ?? roomOrigin ?? (useMyLocation && youAreHere
                  ? { type: "point" as const, ...youAreHere }
                  : fromBuilding ? {
                      type: "building" as const,
                      buildingId: fromBuilding.id,
                      label: fromBuilding.name,
                      code: fromBuilding.code,
                    } : null);
                if (mapMode === "emergency" && (!activeCampus
                  || !isStudentEmergencyRouteCurrentAndEligible(activeCampus, planned, emergencyOrigin))) {
                  setRoutePlannerSelectionError(studentEmergencyRouteResolution.message
                    ?? "No complete eligible emergency route is available. Follow posted campus instructions.");
                  return false;
                }
                if (!hasNavigableRoute(planned)) {
                  setAutomaticRouteChoices([]);
                  setActiveAutomaticRouteId(null);
                  if (mapMode === "emergency") setRoutePlannerSelectionError(studentEmergencyRouteResolution.message
                    ?? "No eligible connected Assembly Point or Campus Gate fallback is available. Follow posted campus guidance and instructions from campus emergency personnel.");
                  return false;
                }
                const emergencyRoutesForPlan = useAutomaticEmergencyRoomRoutes ? approvedStudentEmergencyRoutes : [];
                // Standard and Accessible use one preference-aware route.
                // Distinct route choices are reserved for eligible SOS exits.
                setAutomaticRouteChoices([]);
                setActiveAutomaticRouteId(null);
                // Start with the resolver's best eligible candidate. Route B
                // remains available only when the resolver found a distinct,
                // independently eligible physical exit.
                setActiveEmergencyRouteId(emergencyRoutesForPlan[0]?.id ?? null);
                setEmergencyRouteOverview(false);
                setRoutePlannerSelectionError(null);
                cancelCameraAnimation(false);
                const startIndoorSegment = planned.indoorSegments?.find((segment) => !segment.afterOutdoor)
                  ?? (planned.points.length < 2 ? planned.indoorSegments?.[0] : undefined);
                // HARD REQUIREMENT: Find Route returns to the TRUE selected
                // Start context (Campus / Building / Floor) and focuses camera
                // on Start A — without starting navigation.
                const startIsIndoor = Boolean(startIndoorSegment
                  && studentRouteInitialContext(planned, studentFacingRouteSteps(planned), Boolean(roomOrigin)) === "floor");
                const routeStartPoint = startIsIndoor
                  ? startIndoorSegment?.waypoints[0]
                  : planned.campusPoints?.[0] ?? planned.points[0] ?? startIndoorSegment?.waypoints[0];
                const startBuilding = startIsIndoor && startIndoorSegment
                  ? MOCK_BUILDINGS.find((building) => building.id === startIndoorSegment.buildingId)
                  : undefined;
                const startPublishedBuilding = startIsIndoor && startIndoorSegment
                  ? activeCampus?.buildings.find((building) => building.id === startIndoorSegment.buildingId)
                  : undefined;
                const startFloor = startIsIndoor && startIndoorSegment
                  ? indoorSegmentFloorNumber(startIndoorSegment, startPublishedBuilding, roomOrigin?.floorNumber ?? planned.destinationRoom?.floorNumber)
                  : undefined;
                const startContextKey = startBuilding && startFloor !== undefined
                  ? `${startBuilding.id}:${startFloor}`
                  : "campus";
                if (routeStartPoint) {
                  // Route Preview focus is applied once after its panel has
                  // reached its final layout. Do not focus now and then let
                  // Preview/layout effects retarget the camera a second time.
                  routeStartFocusPendingRef.current = true;
                  if (startContextKey === routeContextKey) {
                    pendingRouteStartFocusRef.current = {
                      point: routeStartPoint,
                      floor: startContextKey !== "campus",
                    };
                  } else {
                    pendingRouteStartFocusRef.current = null;
                    // Switch context first; focus when the new context commits
                    // (same pending machinery as Return to Follow).
                    pendingRouteRecenterRef.current = {
                      contextKey: startContextKey,
                      point: routeStartPoint,
                      floor: startContextKey !== "campus",
                    };
                  }
                }
                if (startIsIndoor && startBuilding && startFloor !== undefined) {
                  setFloorView({ building: startBuilding, floor: startFloor });
                  if (startIndoorSegment) setIndoorRoute(indoorRouteFromSegment(startIndoorSegment));
                } else {
                  // Campus start: never leave the camera stranded on a Floor.
                  setFloorView(null);
                  setIndoorRoute(null);
                }
                pendingTransitionSeekRef.current = false;
                routeTransitionActivationRef.current = null;
                transitionResumePlaybackRef.current = false;
                routeEntryTransitionCompleteRef.current = false;
                setRoute(planned);
                routeRef.current = planned;
                setArrivalCameraTarget(null);
                completedRouteEditSnapshotRef.current = null;
                setRoutePreviewStepIndex(0);
                setShowArrival(false);
                setNavigationTransitioning(false);
                setNavigationPhase("idle");
                setWalkProgress(0);
                walkProgressRef.current = 0;
                setIndoorWalkProgress(0);
                indoorWalkProgressRef.current = 0;
                playbackCursorRef.current = 0;
                setPlaybackCursor(0);
                setMobileRoutePreviewExpanded(false);
                dispatchStudentRouteUi({ type: "FOUND_ROUTE" });
                setDirectionsMode(false);
                // Preview renders from the Start context established above;
                // route lines come from route.points / the start indoor segment.
                return true;
              }}
              onPause={pauseNavigation}
              onResume={smartEmergencyRouteMode ? resumeEmergencyNavigation : resumeNavigation}
              onPreviousStep={() => moveGuidedStep(-1)}
              onNextStep={continueGuidedNavigation}
              onEndNavigation={() => {
                setMobileRoutePreviewExpanded(false);
                stopEmergencyRouteClocks();
                cancelCameraAnimation(false);
                clearStudentRoute();
              }}
              onDone={clearStudentRoute}
              onCollapse={() => {
                setMobileRoutePreviewExpanded(false);
                if (studentRouteUi.phase !== "preview") dispatchStudentRouteUi({ type: "COLLAPSE" });
              }}
              onExpand={expandRoutePanel}
              youAreHere={youAreHere}
              youAreHereLabel={currentLocationLabel}
              useMyLocation={useMyLocation}
              onUseMyLocationChange={(useLocation) => {
                if (useLocation !== useMyLocation) invalidateRouteForPlannerChange();
                setArrivalCameraTarget(null);
                setNavigationPhase("idle");
                setUseMyLocation(useLocation);
                if (useLocation) {
                  setQrRouteStartNotice(null);
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
              onActiveEndpointChange={(endpoint) => {
                // Opening either endpoint picker means the current preview is
                // no longer authoritative. Clear its geometry immediately,
                // before the replacement selection arrives, so an old SOS
                // path cannot remain visible behind the picker.
                if (endpoint) invalidateRouteForPlannerChange();
                setRoutePlannerEndpoint(endpoint);
              }}
              standardPreference={standardRoutePreference}
              onStandardPreferenceChange={setStandardRoutePreference}
              mapSelectionEndpoint={routePlannerMapPick}
              mapSelectionCandidateLabel={routePlannerMapPickCandidate ? routeEndpointLabel(routePlannerMapPickCandidate.endpoint) : null}
              onChooseOnMap={setRoutePlannerMapSelection}
              onConfirmMapSelection={confirmRoutePlannerMapSelection}
              onClearMapSelectionCandidate={clearRoutePlannerMapPickCandidate}
              selectionError={routePlannerSelectionError}
              suspendedForBuilding={Boolean(showBuildingDetailsDuringRoutePlanner && selected && !isFloorMode)}
              onSelectFromDestination={(result) => {
                const endpoint = routeEndpointFromSearchResult(result, MOCK_BUILDINGS, roomDestinationCatalog, activeCampus?.markers, activeCampus?.assemblyPoints);
                if (endpoint) applyRoutePlannerEndpoint(endpoint, "start");
              }}
              onSelectToDestination={(result) => {
                const endpoint = routeEndpointFromSearchResult(result, MOCK_BUILDINGS, roomDestinationCatalog, activeCampus?.markers, activeCampus?.assemblyPoints);
                if (endpoint) {
                  setQrRouteStartNotice(null);
                  applyRoutePlannerEndpoint(endpoint, "destination");
                }
              }}
              onToRoomChange={(room) => {
                setArrivalCameraTarget(null);
                setQrRouteStartNotice(null);
                if (!room) {
                  invalidateRouteForPlannerChange();
                  setNavigationPhase("idle");
                  setRoomDestination(null);
                  setToCampusPlace(null);
                  setToBuilding(null);
                  return;
                }
                setNavigationPhase("idle");
                selectRoomDestination(`${room.buildingId}:${room.floorNumber}:${room.roomId}`);
              }}
              onClearFromRoom={() => { invalidateRouteForPlannerChange(); setArrivalCameraTarget(null); setNavigationPhase("idle"); setQrRouteStartNotice(null); setRoomOrigin(null); setFromCampusPlace(null); setFromBuilding(null); }}
              onClearToRoom={() => { invalidateRouteForPlannerChange(); setArrivalCameraTarget(null); setNavigationPhase("idle"); setQrRouteStartNotice(null); setRoomDestination(null); setToCampusPlace(null); setToBuilding(null); }}
              onSwapEndpoints={() => {
                invalidateRouteForPlannerChange();
                setArrivalCameraTarget(null);
                const previousFromBuilding = fromBuilding;
                const previousToBuilding = toBuilding;
                const previousFromRoom = roomOrigin;
                const previousToRoom = roomDestination;
                const previousFromPlace = fromCampusPlace;
                const previousToPlace = toCampusPlace;
                setNavigationPhase("idle");
                setNavigationTransitioning(false);
                setRoutePlannerMapPick(null);
                setRoutePlannerSelectionError(null);
                setUseMyLocation(false);
                setRoomOrigin(previousToRoom);
                setRoomDestination(previousFromRoom);
                setFromCampusPlace(previousToPlace);
                setToCampusPlace(previousFromPlace);
                setFromBuilding(previousToRoom
                  ? MOCK_BUILDINGS.find((building) => building.id === previousToRoom.buildingId) ?? null
                  : previousToPlace ? null : previousToBuilding);
                setToBuilding(previousFromRoom
                  ? MOCK_BUILDINGS.find((building) => building.id === previousFromRoom.buildingId) ?? null
                  : previousFromPlace ? null : previousFromBuilding);
              }}
              onClose={() => {
                if (routePanelPhase === "planning") {
                  if (completedRouteEditSnapshotRef.current) cancelCompletedRouteEdit();
                  else if (route) { dispatchStudentRouteUi({ type: "END_NAVIGATION" }); setDirectionsMode(false); }
                  else clearStudentRoute();
                } else dispatchStudentRouteUi({ type: "COLLAPSE" });
              }}
              headerModeToggle={routePanelVisible && activeCampus ? <StudentMapModeToggle
                compact
                mode={campusViewMode}
                onToggle={toggleStudentMapView}
              /> : undefined}
              headerUtility={((routePanelVisible && route)
                || (mapMode === "emergency" && selectedEmergencyVideo)) ? (
                <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5">
                  {routePanelVisible && route && <ArrivalSoundToggle enabled={arrivalSound.enabled} onChange={arrivalSound.setEnabled} />}
                  {mapMode === "emergency" && selectedEmergencyVideo && <button
                    type="button"
                    data-testid="route-watch-emergency-video"
                    aria-label="Watch evacuation video"
                    onClick={openEmergencyVideo}
                    className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-primary/20 bg-card px-2 text-[10px] font-extrabold text-primary shadow-sm transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  ><Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /><span className="hidden sm:inline">Watch video</span><span className="sm:hidden">Video</span></button>}
                </div>
              ) : undefined}
              onClear={clearStudentRoute}
              onStartNavigation={() => {
              setMobileRoutePreviewExpanded(false);
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
              if (!endpointsSet || !hasNavigableRoute(route) || emergencyRouteOverview) return;
              // Emergency routes can be automatically calculated from current
              // eligible graph data without a per-room Route A/B approval.
              // Destination and emergency-use checks remain mandatory.
              if (mapMode === "emergency" && emergencyPlannerAvailability?.state !== "approved"
                && emergencyPlannerAvailability?.state !== "available") return;
              const emergencyOrigin = fromCampusPlace ?? roomOrigin ?? (useMyLocation && youAreHere
                ? { type: "point" as const, ...youAreHere }
                : fromBuilding ? {
                    type: "building" as const,
                    buildingId: fromBuilding.id,
                    label: fromBuilding.name,
                    code: fromBuilding.code,
                  } : null);
              if (mapMode === "emergency" && (!activeCampus
                || !isStudentEmergencyRouteCurrentAndEligible(activeCampus, route, emergencyOrigin))) {
                setRoutePlannerSelectionError("This emergency route is no longer eligible. Recalculate the route or follow posted campus instructions.");
                return;
              }
              setArrivalCameraTarget(null);
              const selectedCamera = studentRouteUi.camera;
              if (selectedCamera === "follow" && beginFollowAtInitialEntry(route)) return;
              pendingTransitionSeekRef.current = false;
              routeTransitionActivationRef.current = null;
              transitionResumePlaybackRef.current = false;
              setNavigationPauseReason(null);
              routeEntryTransitionCompleteRef.current = false;
              cancelAnimationFrame(stepSeekAnimRef.current ?? 0);
              stepSeekAnimRef.current = null;
              stepSeekTargetRef.current = null;
              setFollowCameraDetached(false);
              setInspectedRouteStepIndex(null);
              dispatchStudentRouteUi({ type: "START_NAVIGATION", camera: selectedCamera });
              walkProgressRef.current = 0;
              indoorWalkProgressRef.current = 0;
              setWalkProgress(0);
              setIndoorWalkProgress(0);
              playbackCursorRef.current = 0;
              setPlaybackCursor(0);
              setWalkNonce((nonce) => nonce + 1);

              if (selectedCamera === "follow" && roomOrigin) {
                routeStartFocusPendingRef.current = true;
                searchFocusRef.current = {
                  buildingId: roomOrigin.buildingId,
                  roomId: roomOrigin.roomId,
                  floorNumber: roomOrigin.floorNumber,
                };
                lastRoomFocusKeyRef.current = null;
                setSearchFocusNonce((nonce) => nonce + 1);
              } else if (selectedCamera === "follow") {
                focusRoutePlannerOrigin();
              }

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
                    && roomOrigin?.buildingId === route.destinationRoom.buildingId,
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
                  const startsAtRoom = Boolean(roomOrigin && roomOrigin.buildingId === destination.buildingId);
                  const authoredSegments = indoorSegmentsForBuilding(route, destination.buildingId,
                    startsAtRoom ? "before-outdoor" : "all");
                  const targetSegment = route.indoorSegments?.find((candidate) =>
                    candidate.buildingId === destination.buildingId
                    && candidate.floorNumber === destination.floorNumber,
                  );
                  const journeySegments = authoredSegments.length > 0
                    ? authoredSegments
                      : targetSegment
                        ? [targetSegment]
                        : [];
                  const firstSegment = startsAtRoom
                    ? journeySegments.find((segment) => segment.floorNumber === roomOrigin?.floorNumber) ?? journeySegments[0]
                    : journeySegments[0];
                  const firstSegmentIndex = firstSegment ? journeySegments.indexOf(firstSegment) : -1;
                  const firstFloor = indoorSegmentFloorNumber(
                    firstSegment,
                    campusBuilding,
                    startsAtRoom ? roomOrigin?.floorNumber : destination.floorNumber,
                  ) ?? destination.floorNumber;
                  setNavigationTransitioning(false);
                  if (startsAtRoom) {
                    // A same-Building room route has no Campus handoff. Its
                    // authored segments are the origin-side itinerary even
                    // though the final endpoint is also an indoor room.
                    // Keep its phase aligned with the canonical step resolver
                    // so the human cursor and elevator transition stay in sync.
                    setOriginIndoorSegments(journeySegments);
                    setOriginIndoorSegmentIndex(firstSegmentIndex);
                    setNavigationPhase("origin-indoor");
                  } else {
                    setDestinationIndoorSegments(journeySegments);
                    setDestinationIndoorSegmentIndex(firstSegment ? firstSegmentIndex : -1);
                    setNavigationPhase("destination-indoor");
                  }
                  floorShiftDirectionRef.current = null;
                  setFloorView({ building, floor: firstFloor });
                  setHighlightedRoom(startsAtRoom
                    ? (firstFloor === roomOrigin?.floorNumber ? roomOrigin.roomId : null)
                    : (firstFloor === destination.floorNumber ? destination.roomId : null));
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
                studentRouteInitialContext(route, studentFacingRouteSteps(route), Boolean(roomOrigin)) === "campus" ||
                // Room origins begin on their authored Floor even when the
                // itinerary later exits to Campus. Preserve that fallback
                // when an indoor source segment is unavailable.
                (!!roomOrigin && hasOutdoorLeg);
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
                  floorShiftDirectionRef.current = null;
                  setFloorView({ building: originBuilding, floor: indoorSegmentFloorNumber(originIndoorSegment, publishedBuilding, roomOrigin.floorNumber) ?? roomOrigin.floorNumber });
                  if (selectedCamera === "follow") {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }
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
                  if (selectedCamera === "follow") {
                    setNavigationTransitioning(true);
                  } else {
                    setFloorView(null);
                    setNavigationTransitioning(false);
                  }
                } else {
                  if (platformSettingsReady && platformSettings.autoFocusRoute && !routeStartFocusPendingRef.current) frameRouteView();
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
      {/* Keep shared controls mounted while planner/navigation panels change.
          The renderer toggle and utility actions share one stable lower-right
          anchor; only the mobile sheet inset may adjust its vertical offset. */}
      <div
        className="absolute inset-0 pointer-events-none"
      >
        <StudentMapControls
          isFloorMode={isFloorMode}
          campusViewMode={campusViewMode}
          campusViewToggleVisible={Boolean(activeCampus) && !discoverTour.active && !routePanelOwnsRendererToggle}
          discoverMode={discoverTour.active}
          onOpenDiscover={activeCampus ? requestDiscoverTour : undefined}
          mapOverlayOpen={Boolean(selected || selectedCampusPlace || directionsMode || routePanelOwnsRendererToggle || showEventMaps)}
          keepUtilityActionsVisible={Boolean(selected || selectedCampusPlace)}
          onToggleCampusViewMode={toggleStudentMapView}
          eventMode={showEventMaps}
          notificationBellVisible={studentAuth.isStudent && !studentAuth.loading && Boolean(studentAuth.profile?.id)}
          floorLabel={floorView ? `${floorView.building.code} · ${currentFloor?.label ?? `Floor ${floorView.floor}`}` : undefined}
          search={search}
          searchFocused={searchFocused}
          directionsMode={discoverTour.active ? false : directionsMode || routePanelOwnsRendererToggle}
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
      </div>

      <div
        data-no-drag
        data-map-layer="account-trigger"
        data-testid="student-map-floating-account-controls"
        aria-hidden={searchFocused}
        inert={searchFocused ? ("" as never) : undefined}
        className={cn(
          "student-map-floating-account-controls absolute right-2 map-layer-controls pointer-events-auto flex items-start gap-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:duration-0 md:right-4 md:w-[min(360px,calc(100vw-2rem))] md:justify-end",
          searchFocused && "pointer-events-none translate-x-1 scale-95 opacity-0",
        )}
      >
        {activeCampus && isFloorMode && availableFloorOptions.length > 1 && !showEventMaps && !profileMenuOpen && <StudentFloorPicker
          accountAnchor
          belowAccount={!directionsMode && !routePanelOwnsRendererToggle}
          buildingName={activeFloorBuilding?.name ?? floorView?.building.name ?? "Building"}
          buildingCode={activeFloorBuilding?.code ?? floorView?.building.code}
          floors={availableFloorOptions}
          activeFloor={floorView?.floor ?? availableFloorOptions[0].number}
          routeFloors={routeFloorsInCurrentBuilding}
          routePanelOpen={routePanelVisible}
          onFallbackOpenChange={setFloorPickerFallbackActive}
          onSelect={changeStudentFloor}
        />}
        <div
          className={cn("relative flex shrink-0 items-center gap-2 md:hidden", searchFocused && "pointer-events-none opacity-0")}
          aria-hidden={searchFocused}
          inert={searchFocused ? ("" as never) : undefined}
        >
          {!discoverTour.active && studentAuth.isStudent && !studentAuth.loading && studentAuth.profile?.id && (
            <div data-testid="student-map-notification-trigger" data-no-drag>
              <StudentNotificationBellForCampus
                key={studentAuth.profile.id}
                containerRef={mobileStudentNotificationRef}
                ownerId={studentAuth.profile.id}
                isStudentOrg={studentAuth.isStudentOrg}
                eventUpdates={studentEventUpdates.events}
                unreadEventIds={studentEventUpdates.unreadIds}
                markEventRead={studentEventUpdates.markRead}
                eventUpdatesError={studentEventUpdates.error}
                refreshEventUpdates={studentEventUpdates.refresh}
                handoverUpdates={studentEventUpdates.handoverUpdates}
                markHandoverRead={studentEventUpdates.markHandoverRead}
                campusId={activeCampus?.id ?? null}
              />
            </div>
          )}
          {!discoverTour.active && <MobileMapAccountMenu open={profileMenuOpen} onOpenChange={handleProfileMenuOpenChange} />}
        </div>
      </div>

      {/* ══════════════ FLOOR SELECTOR (floor plan mode — always visible when in floor view) ══════════════ */}

      {/* ══════════════ MAP ZOOM / RESET CONTROLS ══════════════ */}
      {!discoverTour.active && route && studentRouteUi.phase !== "idle" && studentRouteUi.collapsed && (() => {
        const navigating = studentRouteUi.phase === "navigating";
        const arrived = studentRouteUi.phase === "arrived";
        const exploring = navigating && studentRouteUi.camera === "explore";
        const destinationLabel = route.emergencyDestinationLabel ?? roomDestination?.roomName ?? toBuilding?.name ?? route.toCode;
        const assemblyArrival = Boolean(route.emergencyAssemblyPointId);
        const arrivalLabel = assemblyArrival
          ? route.emergencyDestinationLabel ?? "Emergency Assembly Point"
          : roomDestination?.roomName ?? toBuilding?.name ?? route.toCode;
        const totalSteps = Math.max(1, routeNavigationSteps.length);
        const currentInstruction = studentRouteStepInstruction(routeNavigationSteps, activeRouteStepIndex, destinationLabel);
        const routePreferenceFallback = studentRoutePreferenceFallbackNotice(route, standardRoutePreference);
        return (
        <div data-no-drag data-testid="collapsed-route-card" className="absolute bottom-2 left-3 right-3 z-40 flex max-h-[var(--student-map-mobile-panel-max-height,calc(100dvh-10rem-env(safe-area-inset-bottom,0px)))] flex-col gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-card/95 p-2.5 text-foreground shadow-lg backdrop-blur md:bottom-4 md:left-3 md:right-auto md:w-[420px] md:overflow-visible">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              {!arrived && <p className="truncate text-[10px] font-extrabold uppercase tracking-wider text-primary">{exploring ? "Explore route" : navigating ? "Guided navigation" : "Route preview"}</p>}
              {navigating && <p className="truncate text-[11px] font-extrabold">{exploring ? routeInspectionContextLabel : `Step ${activeRouteStepIndex + 1} of ${totalSteps} · ${destinationLabel}`}</p>}
              {!navigating && !arrived && <p className="truncate text-[12px] font-extrabold">{roomOrigin?.roomName ?? fromCampusPlace?.label ?? fromBuilding?.name ?? route.fromCode} → {destinationLabel}</p>}
              {arrived && <p data-testid="compact-arrival-destination" className="truncate text-[12px] font-extrabold text-emerald-800">{assemblyArrival ? `Arrived at ${arrivalLabel}` : "You've arrived"}</p>}
              {arrived && !assemblyArrival && <p className="truncate text-[10px] text-muted-foreground">{arrivalLabel}</p>}
              {arrived && assemblyArrival && <p className="text-[9px] leading-snug text-muted-foreground">Follow instructions from campus emergency personnel.</p>}
              {!navigating && studentRouteUi.phase === "preview" && <p className="truncate text-[10px] font-semibold text-muted-foreground">{standardRoutePreference === "stairs" ? "Prefer stairs" : standardRoutePreference === "elevator" ? "Prefer elevator" : "Best route"} · Explore</p>}
            </div>
            {arrived && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white" aria-hidden="true">✓</span>}
            <ArrivalSoundToggle enabled={arrivalSound.enabled} onChange={arrivalSound.setEnabled} />
            {navigating && <div role="group" aria-label="Route mode" className="flex shrink-0 rounded-full border border-primary/20 bg-muted/40 p-0.5">
              <button type="button" aria-label={exploring ? "Return to Follow" : "Follow mode"} aria-pressed={!exploring} onClick={() => { setFollowCameraDetached(false); if (exploring) recenterCurrentRouteStep(); }} className={cn("min-h-11 rounded-full px-1.5 text-[10px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:min-h-8 lg:px-2 lg:text-[9px]", !exploring ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>FOLLOW</button>
              <button type="button" aria-label="Explore route" aria-pressed={exploring} onClick={enterRouteExplore} className={cn("min-h-11 rounded-full px-1.5 text-[10px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:min-h-8 lg:px-2 lg:text-[9px]", exploring ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>EXPLORE</button>
            </div>}
          </div>
          {navigating && (exploring
            ? <p data-testid="collapsed-explore-guidance" className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">Move the map to explore this route.</p>
            : <p data-testid="collapsed-current-instruction" className="line-clamp-2 text-[12px] font-bold leading-snug">{currentInstruction}</p>)}
          {routePausedForInspection && <p data-testid="route-paused-for-inspection-dock" role="status" className="rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[10px] font-semibold">Paused for map inspection. Resume to return the map to your route.</p>}
          {navigating && routeContextRecoveryPending && <div data-testid="route-context-recovery-status-dock" role="status" className="flex items-center justify-between gap-2 rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5 animate-pulse" />Returning to the current route position…</span>
          </div>}
          {navigating && routeContextRecoveryFailed && <div data-testid="route-context-recovery-failed-dock" role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-destructive/[0.08] px-2.5 py-1.5 text-[10px] font-semibold">
            <span>Could not return to the route position.</span>
            <button type="button" onClick={resumeNavigation} className="min-h-8 shrink-0 rounded-lg border border-destructive/30 px-2.5 font-extrabold text-destructive">Retry</button>
          </div>}
          {!arrived && routePreferenceFallback && <p data-testid="collapsed-route-preference-fallback" role="status" className="text-[10px] font-semibold leading-snug text-amber-700 dark:text-amber-300">{routePreferenceFallback}</p>}
          {navigating && !exploring && transitionAwaitingAction && transitionPrompt && <p data-testid="collapsed-transition-prompt" className="rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[11px] font-semibold leading-snug">{transitionPrompt}</p>}
          <div className="flex items-center gap-1.5">
            {arrived ? (
              <div className="grid w-full grid-cols-2 gap-1.5">
                <button type="button" data-testid="collapsed-arrival-previous" onClick={() => moveGuidedStep(-1)} disabled={routeStepSeeking || routeNavigationSteps.length < 2} className="min-h-11 rounded-xl border border-border px-3 text-[10px] font-bold text-primary disabled:opacity-40">Previous step</button>
                <button type="button" data-testid="collapsed-arrival-restart" onClick={startGuidedFromCollapsedPreview} className="min-h-11 w-full rounded-xl bg-primary px-3 text-[11px] font-extrabold text-primary-foreground">Restart Route</button>
                <button type="button" data-testid="collapsed-arrival-edit" onClick={beginCompletedRouteEdit} className="min-h-11 rounded-xl border border-border px-3 text-[10px] font-bold text-foreground">Edit Route</button>
                <button type="button" data-testid="collapsed-arrival-done" onClick={clearStudentRoute} className="min-h-11 rounded-xl border border-border px-3 text-[10px] font-bold text-muted-foreground">Done</button>
              </div>
            ) : !navigating && studentRouteUi.phase === "preview" ? (
              <button type="button" data-testid="collapsed-preview-start-navigation" onClick={startGuidedFromCollapsedPreview} className="min-h-10 flex-1 rounded-xl bg-primary px-3 text-[11px] font-extrabold text-primary-foreground">Start Navigation</button>
            ) : navigating && <>
              {exploring && activeRoutePrimaryAction === "continue-transition" && <button type="button" onClick={activateCurrentRouteTransition} disabled={routeTransitionBusy || routeStepSeeking} aria-label={transitionActionLabel} className="min-h-11 flex-1 rounded-xl bg-primary px-2 text-[10px] font-extrabold text-primary-foreground disabled:opacity-45">{transitionActionLabel}</button>}
              {!exploring && <button type="button" onClick={() => moveGuidedStep(-1)} disabled={routeTransitionBusy || routeStepSeeking || routeControlStepIndex <= 0} aria-label="Previous step" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>}
              {!exploring && (activeRoutePrimaryAction === "continue-transition"
                ? <button type="button" onClick={activateCurrentRouteTransition} disabled={routeTransitionBusy || routeStepSeeking} aria-label={transitionActionLabel} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-2 text-[11px] font-extrabold text-primary-foreground disabled:opacity-45">{transitionActionLabel}</button>
              : activeRoutePrimaryAction === "done"
                  ? <button type="button" onClick={clearStudentRoute} disabled={routeTransitionBusy || routeStepSeeking} className="flex h-10 min-w-16 flex-1 items-center justify-center rounded-xl bg-primary px-2 text-[10px] font-extrabold text-primary-foreground disabled:opacity-45">Done</button>
                  : <button type="button" onClick={() => activeRoutePrimaryAction === "resume" ? resumeNavigation() : pauseNavigation()} disabled={routeContextRecoveryPending || (routeTransitionBusy && !verticalRunPauseAvailable && !routeStepSeeking) || verticalRunPausePending} aria-label={routeContextRecoveryPending ? "Returning to route" : verticalRunPausePending ? "Pausing navigation" : activeRoutePrimaryAction === "resume" ? "Resume navigation" : "Pause navigation"} className="flex h-10 min-w-16 flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-2 text-[10px] font-extrabold text-primary-foreground disabled:opacity-45">{routeContextRecoveryPending ? <><Navigation className="h-3.5 w-3.5 animate-pulse" />Returning…</> : activeRoutePrimaryAction === "resume" ? <><Play className="h-3.5 w-3.5" />Resume</> : verticalRunPausePending ? "Pausing…" : <><Pause className="h-3.5 w-3.5" />Pause</>}</button>)}
              {!exploring && activeRoutePrimaryAction !== "continue-transition" && activeRoutePrimaryAction !== "done" && <button type="button" onClick={continueGuidedNavigation} disabled={routeTransitionBusy || routeStepSeeking || routeControlStepIndex >= routeNavigationSteps.length - 1} aria-label="Next step" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>}
              {!exploring && <button type="button" data-testid="collapsed-playback-speed" aria-label={`Playback speed ${playbackSpeed} times. Change speed`} title="Change playback speed" onClick={() => setPlaybackSpeed((speed) => speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1)} className="h-10 min-w-11 shrink-0 rounded-xl border border-border bg-card px-2 text-[10px] font-extrabold text-primary">{playbackSpeed}×</button>}
            </>}
            <button type="button" onClick={expandRoutePanel} aria-label={arrived ? "Expand arrival details" : "Expand route panel"} className="min-h-10 shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-3 text-[10px] font-extrabold text-primary">Expand</button>
          </div>
        </div>
        );
      })()}

      {/* ══════════════ DESKTOP BUILDING INFO PANEL ══════════════ */}
      <AnimatePresence initial={false}>
        {locationPreviewPanel ? (
          <motion.aside
            key="location-preview-panel"
            data-no-drag
            data-testid="report-location-preview-panel"
            aria-label="Report location preview"
            className="absolute inset-x-0 bottom-0 z-[55] flex max-h-[min(46dvh,24rem)] min-h-0 flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-border/80 bg-card shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:z-30 md:max-h-none md:w-[clamp(340px,32vw,390px)] md:rounded-none md:border-y-0 md:border-r-0 md:border-l"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
          >
            {locationPreviewPanel}
          </motion.aside>
        ) : selected && !discoverTour.active && !isFloorMode && (!routePanelVisible || showBuildingDetailsDuringRoutePlanner) ? (
          <BuildingInfoPanel
            key={selected.id}
            selected={selected}
            campusId={activeCampus?.id}
            onClose={() => selectBuilding(null)}
            onDirections={startDirectionsTo}
            onEnterBuilding={handleStudentEnterBuilding}
            saved={saved}
            savedStateLoading={savedStateLoading}
            savedStateUnavailable={savedStateUnavailable}
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
            suspendedForSearch={searchFocused}
          />
      ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {selectedCampusPlace && !discoverTour.active && !isFloorMode && !locationPreviewPanel && !routePanelVisible && (
          <CampusPlaceDetails
            key={`campus-place-${selectedCampusPlace.id}`}
            place={selectedCampusPlace}
            campusId={activeCampus?.id}
            qrLocationId={activeCampus?.navNodes?.find((node) => node.id === selectedCampusPlace.navNodeId
              || node.gateId === selectedCampusPlace.id || node.assemblyPointId === selectedCampusPlace.id)?.id}
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
            suspendedForSearch={searchFocused}
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
              <h3 className="text-xl font-extrabold text-foreground">{route?.emergencyAssemblyPointId ? `Arrived at ${route.emergencyDestinationLabel ?? "Emergency Assembly Point"}` : "You Have Arrived"}</h3>
              <p className="text-sm text-muted-foreground mt-1">{route?.emergencyAssemblyPointId ? "Follow instructions from campus emergency personnel." : toBuilding?.name ?? "Destination"}</p>
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
      {stairLoading && (() => {
        const elevator = /elevator/i.test(stairLoading.label);
        const DirectionIcon = elevator ? MoveVertical : stairLoading.dir === "up" ? ArrowUp : ArrowDown;
        const targetFloor = stairLoading.toFloorLabel ?? stairLoading.label.match(/\b(?:ground floor|floor\s+\d+)\b/i)?.[0];
        const via = stairLoading.transitionName ?? stairLoading.label.match(/\bvia\s+(.+)$/i)?.[1];
        const floorProgress = stairLoading.fromFloorLabel && targetFloor
          ? `${stairLoading.fromFloorLabel} → ${targetFloor}`
          : targetFloor ? `To ${targetFloor}` : stairLoading.label;
        return (
          <motion.div
            data-testid="route-floor-transition-status"
            data-no-drag
            role="status"
            aria-live="polite"
            aria-atomic="true"
            initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.18, ease: "easeOut" }}
            className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+8rem)] z-[65] flex w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-primary/25 bg-card/95 px-3.5 py-3 text-left shadow-[0_10px_30px_rgba(15,23,42,0.22)] backdrop-blur-xl md:top-16"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <DirectionIcon className={cn("h-5 w-5", !reducedMotion && !elevator && "animate-pulse")} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary">{stairLoading.dir === "up" ? "Going up" : "Going down"}</span>
              <span className="block truncate text-[13px] font-extrabold leading-tight text-foreground">{floorProgress}</span>
              {via && <span className="block truncate text-[10px] font-semibold text-muted-foreground">via {via}</span>}
              {!via && elevator && <span className="block text-[10px] font-semibold text-muted-foreground">Elevator transition</span>}
            </span>
          </motion.div>
        );
      })()}

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
              <span className={cn("w-1.5 h-1.5 rounded-full bg-green-300 shrink-0", !reducedMotion && "animate-pulse")}/>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <span className="rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-bold text-primary">Indoor route</span>
              <span className="text-[10px] text-muted-foreground">Step-by-step directions</span>
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
                    <p className="text-[10px] leading-snug pt-0.5 text-foreground ml-1" style={{ fontFamily:"var(--font-body)" }}>{studentInstructionWithoutUncalibratedDistance(step)}</p>
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
      {!discoverTour.active && !route && !directionsMode && !searchFocused && !search && !showEventMaps && !showArrival && !locationPreviewPanel && !profileMenuOpen && (
        <StudentCampusSelector
          campuses={availableCampuses}
          activeCampusId={activeCampus?.id}
          activeCampusName={activeCampus?.name}
          mobileTop={campusSelectorTop}
          mobileMaxWidth={campusSelectorMaxWidth}
          onSelect={(campusId) => {
            if (campusId === activeCampus?.id) return true;
            const hasActiveRouteSession = Boolean(route || directionsMode || studentRouteUi.phase !== "idle");
            if (hasActiveRouteSession && !window.confirm("Switching campuses will end the current route session. Continue?")) return false;
            if (hasActiveRouteSession) clearStudentRoute();
            setSelectedCampusId(campusId);
            return true;
          }}
        />
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
                <button key={m} onClick={e => { e.stopPropagation(); routeModeTouchedRef.current = true; setMapMode(m); }}
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
        {!discoverTour.active && !isFloorMode && !searchFocused && !search && mapMode === "standard" && !directionsMode && !selected && (
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
        {selected && !discoverTour.active && !isFloorMode && !locationPreviewPanel && (!routePanelVisible || showBuildingDetailsDuringRoutePlanner) && (
          <MobileBuildingSheet
            key={selected.id}
            selected={selected}
            campusId={activeCampus?.id}
            onClose={() => selectBuilding(null)}
            onDirections={startDirectionsTo}
            onEnterBuilding={handleStudentEnterBuilding}
            onSave={toggleSave}
            onReport={building => { setReportCampusPlace(null); setReportRoomContext(null); setReportModal(building); }}
            onSignInPrompt={setSignInPrompt}
            saved={saved}
            savedStateLoading={savedStateLoading}
            savedStateUnavailable={savedStateUnavailable}
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
            suspendedForSearch={searchFocused}
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
      {locationScannerOpen && !discoverTour.active && (
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
      {emergencyVideoOverlayKey && !discoverTour.active && emergencyVideoOverlayKey === emergencyVideoSessionKey && selectedEmergencyVideo && activeCampus && <StudentEmergencyVideoOverlay
        campusId={activeCampus.id}
        roomId={selectedEmergencyVideo.room.id}
        roomName={selectedEmergencyVideo.room.name}
        videoId={selectedEmergencyVideo.guide.videoId!}
        title={selectedEmergencyVideo.guide.title}
        routeFingerprint={selectedEmergencyVideo.routeFingerprint}
        playbackState={emergencyVideoPlaybackState}
        routePaused={studentRouteUi.phase === "navigating" && studentRouteUi.playback !== "playing"}
        routeTransitioning={routeTransitionBusy}
        hasActiveRoute={smartEmergencyRouteMode && Boolean(activeEmergencyRouteId) && !emergencyRouteOverview}
        onPlaybackStateChange={saveEmergencyVideoPlaybackState}
        onClose={closeEmergencyVideo}
        onResumeRoute={resumeRouteFromEmergencyVideo}
      />}
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
      {!discoverTour.active && activeCampus && (
        <div data-testid="student-map-action-row" data-no-drag className="map-layer-controls absolute left-3 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] z-20 flex items-center gap-2 md:bottom-5">
          {!directionsMode && studentRouteUi.phase === "idle" && !route && !navigationTransitioning && !showEventMaps && (
            <button type="button" data-testid="discover-plv-mobile-entry" onClick={requestDiscoverTour} className="pointer-events-auto inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-card/95 px-3 text-[11px] font-extrabold text-primary shadow-md shadow-slate-950/10 backdrop-blur-xl transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:hidden">
              <Compass className="h-4 w-4" aria-hidden="true" />Discover PLV
            </button>
          )}
          {eventOverlaysEnabled && <button ref={eventMapTriggerRef} type="button" data-testid="student-event-map-button" data-indoor={isFloorMode ? "true" : "false"} data-dock="event-map-bottom-left" data-suppressed={Boolean(directionsMode || navigationTransitioning || route || selected || selectedCampusPlace)} aria-label="Open event map" title="Open event map" aria-hidden={Boolean(directionsMode || navigationTransitioning || route || selected || selectedCampusPlace || showEventMaps)} disabled={Boolean(directionsMode || navigationTransitioning || route || selected || selectedCampusPlace || showEventMaps)} tabIndex={directionsMode || navigationTransitioning || route || selected || selectedCampusPlace || showEventMaps ? -1 : 0} aria-expanded={showEventMaps} onClick={() => {
            const nextOpen = !showEventMaps;
            if (nextOpen) { dismissSearch(); setSelectedRoomContext(null); setSelectedEventId(null); setSelectedLocationId(null); }
            setShowEventMaps(nextOpen);
            if (!nextOpen) { setSelectedEventId(null); setSelectedLocationId(null); }
          }} style={{ bottom: "auto" }} className="student-map-event-control pointer-events-auto relative inline-flex h-11 shrink-0 items-center rounded-full border border-primary/20 bg-card/95 px-3 text-[11px] font-extrabold text-primary shadow-md shadow-slate-950/10 backdrop-blur-xl transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" data-no-drag>
            <CalendarDays className="mr-1.5 h-4 w-4" /><span className="max-[359px]:hidden">Event map</span>
          </button>}
        </div>
      )}
      {!discoverTour.active && eventOverlaysEnabled && <EventMapPanel
        open={showEventMaps}
        loading={eventFeed.loading}
        error={eventFeed.error}
        events={eventFeed.events}
        nowMs={eventFeed.nowMs}
        filter={eventFilter}
        selectedEventId={selectedEventId}
        selectedLocationId={selectedLocationId}
        currentMap={{label:isFloorMode ? `${activeFloorBuilding?.name ?? floorView?.building.name ?? 'Building'} · ${currentFloor?.label ?? 'Floor'}` : 'Campus Grounds',locationId:currentEventLocationId,isFloor:isFloorMode}}
        onFitMap={requestEventMapFit}
        inspectedVenue={inspectedEventVenue}
        onClose={() => { setShowEventMaps(false); setSelectedEventId(null); setSelectedLocationId(null); }}
        onRetry={eventFeed.refresh}
        onFilterChange={setEventFilter}
        onSelectEvent={(eventId) => { setInspectedEventVenueId(null); setSelectedEventId(eventId); setSelectedLocationId(null); }}
        onViewLocation={viewEventLocation}
        onBackToEvents={() => { setInspectedEventVenueId(null); setSelectedEventId(null); setSelectedLocationId(null); }}
      />}
      <DiscoverTourPanel
        open={discoverTour.active || discoverTour.navigationGuard}
        view={discoverTour.view}
        building={currentDiscoverStop ? {
          name: currentDiscoverStop.name,
          code: currentDiscoverStop.code,
          description: currentDiscoverStop.description,
          coverImageUrl: currentDiscoverStop.map.image_url,
          floorCount: currentDiscoverStop.floorCount,
        } : undefined}
        adjacentCoverImageUrls={discoverStops.length > 1 ? [
          discoverStops[(discoverTour.stopIndex - 1 + discoverStops.length) % discoverStops.length]?.map.image_url,
          discoverStops[(discoverTour.stopIndex + 1) % discoverStops.length]?.map.image_url,
        ] : []}
        stopIndex={discoverTour.stopIndex}
        stopCount={discoverStops.length}
        mobileExpanded={discoverTour.mobileExpanded}
        onMobileExpandedChange={(mobileExpanded) => setDiscoverTour((current) => ({ ...current, mobileExpanded }))}
        unavailable={discoverTour.active && discoverStops.length === 0}
        roomSelected={discoverTour.view === "inside" && Boolean(selectedRoomContext)}
        reducedMotion={reducedMotion}
        navigationGuard={discoverTour.navigationGuard}
        onPrevious={() => moveDiscoverStop(-1)}
        onNext={() => moveDiscoverStop(1)}
        onEnter={enterDiscoverBuilding}
        onBack={backToDiscoverBuilding}
        onExit={exitDiscoverTour}
        onEndNavigationAndStart={confirmDiscoverTourAfterEndingNavigation}
        onCancelNavigationGuard={() => setDiscoverTour((current) => ({ ...current, navigationGuard: false }))}
      />
    </div>
  );
}
