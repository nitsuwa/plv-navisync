import { Accessibility, ArrowLeft, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, List, MapPin, Navigation, Pause, Play, Route as RouteIcon, ShieldAlert, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { SearchResult } from "../../hooks/useCampusSearch";
import { searchDestinationResults, type DestinationFilter } from "../../lib/destinationSearch";
import type { CampusPlaceDest, RoomDest } from "../../lib/combinedPathfinding";
import type { PlannedRoute, RouteMode, StandardRoutePreference } from "../../lib/routePlanner";
import { studentFacingRouteSteps, studentRouteFacts, studentRoutePreferenceFallbackNotice, type StudentCameraMode, type StudentRoutePhase, type StudentRoutePrimaryAction } from "../../lib/studentRouteFlow";
import type { Building } from "../../types";
import { useEscToClose } from "../../hooks/useEscToClose";
import { cn } from "../../lib/utils";
import { CampusDestinationSearch } from "./CampusDestinationSearch";
import { RouteErrorState } from "./RouteErrorState";
import { EmergencyRouteStatus, type EmergencyRouteStatusCardModel } from "./EmergencyRouteStatus";
import type { EmergencyPlannerAvailability } from "../../lib/emergencyRouteStatus";

export type RoutePlannerEndpoint = "start" | "destination";
export type StudentEmergencyRouteChoice = { id: string; label: string; doorLabel: string; exitLabel: string; approved?: boolean };
export type StudentAutomaticRouteChoice = { id: string; label: string };

function emergencyRouteOptionLabel(index: number): string {
  return `Route ${String.fromCharCode(65 + index)}`;
}

function conciseEmergencyExitLabel(label: string): string {
  const finalLeg = label.trim().split(/\s*(?:->|→)\s*/).at(-1)?.trim() ?? label.trim();
  return finalLeg.split(/\s*[·•]\s*/).filter(Boolean).at(-1)?.trim() || finalLeg;
}

export interface UnifiedRoutePlannerDialogProps {
  from: Building | null;
  to: Building | null;
  fromCampusPlace?: CampusPlaceDest | null;
  toCampusPlace?: CampusPlaceDest | null;
  onFromChange: (building: Building | null) => void;
  onToChange: (building: Building | null) => void;
  buildings: readonly Building[];
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  route: PlannedRoute | null;
  phase?: StudentRoutePhase;
  cameraMode?: StudentCameraMode;
  onCameraModeChange?: (mode: StudentCameraMode) => void;
  collapsed?: boolean;
  /** Parent-owned expansion state for a mobile preview reopened from its dock. */
  mobilePreviewExpanded?: boolean;
  playbackPaused?: boolean;
  primaryAction?: StudentRoutePrimaryAction;
  primaryActionDisabled?: boolean;
  transitionBusy?: boolean;
  pauseDuringVerticalRun?: boolean;
  verticalRunPausePending?: boolean;
  transitionAwaitingAction?: boolean;
  transitionActionLabel?: string;
  transitionPrompt?: string | null;
  onContinueTransition?: () => void;
  contextRecoveryPending?: boolean;
  contextRecoveryFailed?: boolean;
  onRetryContextRecovery?: () => void;
  /** Follow is paused because the student is viewing a different map context. */
  inspectionPaused?: boolean;
  playbackSpeed?: 1 | 1.5 | 2;
  onPlaybackSpeedChange?: (speed: 1 | 1.5 | 2) => void;
  currentStepIndex?: number;
  /** Destination of the active seek, so Previous/Next can retarget before it settles. */
  seekTargetIndex?: number | null;
  followStepIndex?: number;
  navigationSteps?: readonly string[];
  onInspectStep?: (stepIndex: number) => void;
  inspectionContextLabel?: string;
  editingCompletedRoute?: boolean;
  onStartNavigation?: () => void;
  emergencyRoutes?: readonly StudentEmergencyRouteChoice[];
  automaticRouteChoices?: readonly StudentAutomaticRouteChoice[];
  activeAutomaticRouteId?: string | null;
  onSelectAutomaticRoute?: (routeId: string) => void;
  activeEmergencyRouteId?: string | null;
  emergencyRouteOverview?: boolean;
  onSelectEmergencyRoute?: (routeId: string) => void;
  onReturnToEmergencyOverview?: () => void;
  onEditRoute?: () => void;
  onCancelEditRoute?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onPreviousStep?: () => void;
  onNextStep?: () => void;
  onEndNavigation?: () => void;
  onDone?: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  routeAttempted?: boolean;
  emergencyAvailability?: EmergencyPlannerAvailability | null;
  onClose: () => void;
  /** Keep the active map renderer switch beside the route panel's trailing action. */
  headerModeToggle?: ReactNode;
  headerUtility?: ReactNode;
  onClear: () => void;
  onFindRoute: () => boolean | void;
  youAreHere?: { x: number; y: number } | null;
  youAreHereLabel?: string | null;
  useMyLocation: boolean;
  onUseMyLocationChange: (value: boolean) => void;
  fromRoom?: RoomDest | null;
  toRoom?: RoomDest | null;
  roomOptions?: readonly RoomDest[];
  onFromRoomChange?: (room: RoomDest | null) => void;
  onToRoomChange?: (room: RoomDest | null) => void;
  onClearFromRoom?: () => void;
  onClearToRoom?: () => void;
  onSwapEndpoints?: () => void;
  destinationResults?: readonly SearchResult[];
  onSelectFromDestination?: (result: SearchResult) => void;
  onSelectToDestination?: (result: SearchResult) => void;
  activeEndpoint?: RoutePlannerEndpoint | null;
  onActiveEndpointChange?: (endpoint: RoutePlannerEndpoint | null) => void;
  standardPreference?: StandardRoutePreference;
  onStandardPreferenceChange?: (preference: StandardRoutePreference) => void;
  mapSelectionEndpoint?: RoutePlannerEndpoint | null;
  mapSelectionCandidateLabel?: string | null;
  onChooseOnMap?: (endpoint: RoutePlannerEndpoint | null) => void;
  onConfirmMapSelection?: () => void;
  onClearMapSelectionCandidate?: () => void;
  selectionError?: string | null;
  /** Explain that a location QR code prefilled the route start and prompt for a destination. */
  qrStartNotice?: string | null;
  /** Keep the planner mounted while a selected building is foregrounded on small screens. */
  suspendedForBuilding?: boolean;
  /** Temporarily collapse the mobile planner while a constrained-screen Floor Picker owns focus. */
  suspendedForFloorPicker?: boolean;
}

const MODES: Array<{ key: RouteMode; label: string; icon: ReactNode }> = [
  { key: "standard", label: "Standard", icon: <Compass className="h-3.5 w-3.5" /> },
  { key: "accessible", label: "Accessible", icon: <Accessibility className="h-3.5 w-3.5" /> },
  { key: "emergency", label: "SOS", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
];

function RouteInstructionRow({
  index,
  instruction,
  onInspect,
  inspected = false,
  followPosition = false,
  stepStatus = "upcoming",
  testId,
}: {
  index: number;
  instruction: string;
  onInspect?: () => void;
  inspected?: boolean;
  followPosition?: boolean;
  stepStatus?: "completed" | "active" | "upcoming";
  testId?: string;
}) {
  const statusLabel = stepStatus === "completed" ? "Completed" : stepStatus === "active" ? "Current step" : "Upcoming";
  const content = <>
    <span aria-hidden="true" className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black", stepStatus === "active" ? "bg-primary text-primary-foreground" : stepStatus === "completed" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{index + 1}</span>
    <span className="min-w-0 flex-1">{instruction}</span>
    {followPosition && <span data-testid="explore-follow-current-marker" className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">Current</span>}
    {inspected && <span className="sr-only">Inspected context</span>}
    <span className="sr-only">{statusLabel}</span>
  </>;
  const typography = "flex gap-2 text-xs leading-snug md:text-[13px]";

  return onInspect ? (
    <button
      type="button"
      data-testid={testId}
      onClick={onInspect}
      aria-current={inspected ? "location" : undefined}
      className={cn(
        typography,
        "w-full items-start rounded-lg px-1.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        inspected ? "bg-primary/10 font-semibold text-foreground ring-1 ring-primary/20" : stepStatus === "active" ? "bg-primary/[0.07] font-semibold text-foreground" : stepStatus === "completed" ? "text-muted-foreground" : followPosition ? "bg-muted/60 font-medium text-foreground" : "text-foreground hover:bg-muted/40",
      )}
    >{content}</button>
  ) : <div className={cn(typography, "items-start rounded-lg px-1.5 py-1.5", stepStatus === "active" ? "bg-primary/[0.07] font-semibold text-foreground" : stepStatus === "completed" ? "text-muted-foreground" : "text-foreground")}>{content}</div>;
}

const ROUTE_PLANNER_MIN_HEIGHT = 96;
const ROUTE_PLANNER_DEFAULT_HEIGHT = 374;
const ROUTE_PLANNER_MAX_HEIGHT = 760;
const MOBILE_SHEET_HEIGHTS = { compact: 140, preview: 236, previewWithAlternatives: 268 } as const;

function searchResultEndpointKey(result: SearchResult, roomOptions: readonly RoomDest[] = []): string | null {
  if (result.kind === "building") return `building:${result.buildingId ?? result.id}`;
  if (result.campusPlaceId) return `campus-place:${result.campusPlaceId}`;
  const room = result.buildingId
    ? roomOptions.find((candidate) => candidate.buildingId === result.buildingId && candidate.roomId === result.id
      && (result.floorNumber === undefined || candidate.floorNumber === result.floorNumber))
    : undefined;
  if (room) return `room:${room.buildingId}:${room.floorNumber}:${room.roomId}`;
  if (result.buildingId && result.floorNumber !== undefined) {
    return `room:${result.buildingId}:${result.floorNumber}:${result.id}`;
  }
  return null;
}

function endpointText(
  purpose: RoutePlannerEndpoint,
  building: Building | null,
  campusPlace: CampusPlaceDest | null | undefined,
  room: RoomDest | null | undefined,
  useMyLocation: boolean,
  youAreHere: { x: number; y: number } | null | undefined,
  youAreHereLabel?: string | null,
) {
  if (purpose === "start" && useMyLocation && youAreHere) {
    return { label: "You are here", context: youAreHereLabel ?? "Current map location" };
  }
  if (room) return { label: room.roomName, context: `${room.buildingLabel} · ${room.floorLabel ?? `Floor ${room.floorNumber}`}` };
  if (campusPlace) return { label: campusPlace.label, context: "Campus place" };
  if (building) return { label: building.name, context: `${building.code} · Building` };
  return { label: purpose === "start" ? "Choose starting point" : "Choose destination", context: "Search buildings, rooms, and offices" };
}

function EndpointCard({
  purpose, building, campusPlace, room, useMyLocation, youAreHere, youAreHereLabel, onChange, compact = false,
}: {
  purpose: RoutePlannerEndpoint;
  building: Building | null;
  campusPlace?: CampusPlaceDest | null;
  room: RoomDest | null | undefined;
  useMyLocation: boolean;
  youAreHere?: { x: number; y: number } | null;
  youAreHereLabel?: string | null;
  onChange: () => void;
  compact?: boolean;
}) {
  const isStart = purpose === "start";
  const text = endpointText(purpose, building, campusPlace, room, useMyLocation, youAreHere, youAreHereLabel);
  const selected = Boolean((isStart && useMyLocation && youAreHere) || room || building || campusPlace);
  return (
    <div data-testid={`route-endpoint-card-${isStart ? "start" : "destination"}`} className={cn(
      "flex min-h-[56px] items-center gap-2.5 rounded-2xl border px-3 py-2 md:min-h-[62px] md:py-2.5 transition-colors",
      selected ? "border-primary/25 bg-primary/[0.045]" : "border-border/70 bg-muted/30",
    )}>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black", isStart ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground")}>{isStart ? "A" : "B"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{isStart ? "Start" : "Destination"}</p>
        <p className={cn("truncate text-[13px] font-extrabold", selected ? "text-foreground" : "text-muted-foreground")}>{text.label}</p>
        {selected && <p className="truncate text-[10px] text-muted-foreground">{text.context}</p>}
      </div>
      <button type="button" onClick={onChange} className="min-h-9 shrink-0 rounded-xl px-2.5 text-[11px] font-extrabold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label={`${selected ? "Change" : "Choose"} ${isStart ? "start" : "destination"}`}>
        {selected ? "Change" : "Choose"}
      </button>
    </div>
  );
}

/** Shared compact route workflow for the live Student Map and Student Preview. */
export function UnifiedRoutePlannerDialog({
  from, to, fromCampusPlace = null, toCampusPlace = null, onFromChange, onToChange, mode, onModeChange, route, onClose, headerModeToggle, headerUtility, onClear, onFindRoute,
  youAreHere, youAreHereLabel, useMyLocation, onUseMyLocationChange, fromRoom = null, toRoom = null, roomOptions = [],
  onSwapEndpoints, destinationResults = [], onSelectFromDestination, onSelectToDestination,
  activeEndpoint: controlledEndpoint, onActiveEndpointChange,
  standardPreference = "best", onStandardPreferenceChange,
  mapSelectionEndpoint = null, mapSelectionCandidateLabel = null, onChooseOnMap, onConfirmMapSelection, onClearMapSelectionCandidate, selectionError = null,
  suspendedForBuilding = false, suspendedForFloorPicker = false,
  phase = "planning", cameraMode = "follow", onCameraModeChange, collapsed = false, mobilePreviewExpanded = false, playbackPaused = true, transitionBusy = false, pauseDuringVerticalRun = false, verticalRunPausePending = false, transitionAwaitingAction = false, transitionActionLabel = "Continue", primaryAction = transitionAwaitingAction ? "continue-transition" : playbackPaused ? "resume" : "pause", primaryActionDisabled = false,
  transitionPrompt = null, onContinueTransition, contextRecoveryPending = false, contextRecoveryFailed = false, onRetryContextRecovery, inspectionPaused = false,
  currentStepIndex = 0, seekTargetIndex = null, followStepIndex = currentStepIndex, navigationSteps = [], inspectionContextLabel = "Route context", editingCompletedRoute = false,
  playbackSpeed = 1, onPlaybackSpeedChange, onStartNavigation, onEditRoute, onCancelEditRoute,
  emergencyRoutes = [], automaticRouteChoices = [], activeAutomaticRouteId = null, onSelectAutomaticRoute,
  activeEmergencyRouteId = null, emergencyRouteOverview = false,
  onSelectEmergencyRoute, onReturnToEmergencyOverview,
  onPause, onResume, onPreviousStep, onNextStep, onInspectStep,
  onEndNavigation, onDone, onCollapse, onExpand, routeAttempted = false, emergencyAvailability = null,
}: UnifiedRoutePlannerDialogProps) {
  const [compactPanelLayout, setCompactPanelLayout] = useState(() => typeof window !== "undefined" && window.innerWidth < 1280);
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const updateLayout = () => {
      setCompactPanelLayout(window.innerWidth < 1280);
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);
  const isSuspendedForBuilding = suspendedForBuilding && compactPanelLayout;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [uncontrolledEndpoint, setUncontrolledEndpoint] = useState<RoutePlannerEndpoint | null>(null);
  const activeEndpoint = controlledEndpoint === undefined ? uncontrolledEndpoint : controlledEndpoint;
  const setActiveEndpoint = (endpoint: RoutePlannerEndpoint | null) => {
    setUncontrolledEndpoint(endpoint);
    onActiveEndpointChange?.(endpoint);
  };
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DestinationFilter>("all");
  const [showAllSteps, setShowAllSteps] = useState(false);
  const stepListRef = useRef<HTMLOListElement | null>(null);
  const stepRowRefs = useRef(new Map<number, HTMLLIElement>());
  const [pendingEmergencyRouteId, setPendingEmergencyRouteId] = useState<string | null>(null);
  const routeSwitchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const routeSwitchCancelRef = useRef<HTMLButtonElement | null>(null);
  const routeSwitchConfirmationRef = useRef<HTMLElement | null>(null);
  const hadPendingEmergencyRouteRef = useRef(false);
  const [failedRouteAttempt, setFailedRouteAttempt] = useState(false);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [mobileSheetState, setMobileSheetState] = useState<"compact" | "expanded">("expanded");
  const floorPickerRestoreRef = useRef<{ sheetState: "compact" | "expanded"; panelHeight: number | null } | null>(null);
  const resizeStartRef = useRef<{ y: number; state: "compact" | "expanded" } | null>(null);
  const reducedMotion = useReducedMotion();
  useEscToClose(onClose, !isSuspendedForBuilding && pendingEmergencyRouteId === null);

  useEffect(() => {
    if (pendingEmergencyRouteId) {
      routeSwitchCancelRef.current?.focus();
      const confirmation = routeSwitchConfirmationRef.current;
      const scrollRegion = confirmation?.closest<HTMLElement>('[data-testid="route-planner-scroll-region"]');
      const footer = dialogRef.current?.querySelector<HTMLElement>('[data-testid="route-planner-footer"]');
      if (confirmation && scrollRegion) {
        const confirmationRect = confirmation.getBoundingClientRect();
        const scrollRect = scrollRegion.getBoundingClientRect();
        const visibleBottom = Math.min(scrollRect.bottom, footer?.getBoundingClientRect().top ?? scrollRect.bottom);
        if (confirmationRect.bottom > visibleBottom) {
          scrollRegion.scrollTop += confirmationRect.bottom - visibleBottom + 8;
        } else if (confirmationRect.top < scrollRect.top) {
          scrollRegion.scrollTop -= scrollRect.top - confirmationRect.top + 8;
        }
      }
      hadPendingEmergencyRouteRef.current = true;
    } else if (hadPendingEmergencyRouteRef.current) {
      routeSwitchTriggerRef.current?.focus();
      routeSwitchTriggerRef.current = null;
      hadPendingEmergencyRouteRef.current = false;
    }
  }, [pendingEmergencyRouteId]);

  useEffect(() => {
    if (pendingEmergencyRouteId && (phase !== "navigating" || !emergencyRoutes.some((choice) => choice.id === pendingEmergencyRouteId))) {
      setPendingEmergencyRouteId(null);
    }
  }, [pendingEmergencyRouteId, phase, emergencyRoutes]);

  useEffect(() => {
    if (!pendingEmergencyRouteId) return;
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingEmergencyRouteId(null);
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => window.removeEventListener("keydown", cancelOnEscape, true);
  }, [pendingEmergencyRouteId]);

  const panelHeightBounds = () => {
    const viewportHeight = typeof window !== "undefined" && (window.visualViewport?.height || window.innerHeight) > 0
      ? window.visualViewport?.height || window.innerHeight
      : 768;
    const parentHeight = dialogRef.current?.parentElement?.getBoundingClientRect().height ?? 0;
    const safePanelHeight = Number.parseFloat(dialogRef.current?.parentElement
      ? window.getComputedStyle(dialogRef.current.parentElement).getPropertyValue("--student-map-mobile-panel-max-height")
      : "") || 0;
    const availableHeight = Math.min(
      ROUTE_PLANNER_MAX_HEIGHT,
      safePanelHeight || viewportHeight - 104,
      parentHeight > 0 ? parentHeight : ROUTE_PLANNER_MAX_HEIGHT,
    );
    return {
      min: ROUTE_PLANNER_MIN_HEIGHT,
      max: Math.max(ROUTE_PLANNER_MIN_HEIGHT, availableHeight),
    };
  };

  const clampPanelHeight = (height: number) => {
    const bounds = panelHeightBounds();
    return Math.min(bounds.max, Math.max(bounds.min, height));
  };

  const currentPanelHeight = () => {
    if (panelHeight !== null) return panelHeight;
    const measured = dialogRef.current?.getBoundingClientRect().height ?? 0;
    if (measured > 0) return measured;
    if (mobileSheetState === "compact") return MOBILE_SHEET_HEIGHTS.compact;
    if (mobileSheetState === "expanded") return Math.min(ROUTE_PLANNER_MAX_HEIGHT, (typeof window !== "undefined" ? (window.visualViewport?.height || window.innerHeight) : 768) - 32);
    return panelHeight ?? ROUTE_PLANNER_DEFAULT_HEIGHT;
  };
  const resizeBounds = panelHeightBounds();

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = { y: event.clientY, state: mobileSheetState };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleResizePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    const deltaY = start.y - event.clientY;
    resizeStartRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const nextState = deltaY <= -36 ? "compact" : deltaY >= 36 ? "expanded" : start.state;
    setMobileSheetState(nextState);
    setPanelHeight(null);
    if (nextState !== start.state) {
      if (nextState === "expanded") onExpand?.();
      else onCollapse?.();
    }
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMobileSheetState("expanded");
      setPanelHeight(null);
      onExpand?.();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setMobileSheetState("compact");
      setPanelHeight(null);
      onCollapse?.();
    } else if (event.key === "Home") {
      event.preventDefault();
      setMobileSheetState("compact");
      setPanelHeight(null);
      onCollapse?.();
    } else if (event.key === "End") {
      event.preventDefault();
      setMobileSheetState("expanded");
      setPanelHeight(null);
      onExpand?.();
    }
  };

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && document.contains(previous)) previous.focus(); };
  }, []);

  useEffect(() => {
    const nextSheetState = mapSelectionEndpoint
      || (isMobileViewport && phase === "preview" && !mobilePreviewExpanded)
      || (isMobileViewport && phase === "navigating")
      ? "compact"
      : "expanded";
    setMobileSheetState((current) => current === nextSheetState ? current : nextSheetState);
    setPanelHeight((current) => current === null ? current : null);
  }, [mapSelectionEndpoint, isMobileViewport, mobilePreviewExpanded, phase]);

  useEffect(() => {
    setShowAllSteps(phase === "navigating" && cameraMode === "explore");
  }, [cameraMode, phase]);

  // The compact Follow dock lives in CampusMapPage, outside this dialog. Keep
  // its Expand/Collapse actions in sync with the dialog's one-step sheet state.
  useEffect(() => {
    if (!isMobileViewport || phase !== "navigating") return;
    const next = collapsed ? "compact" : "expanded";
    setMobileSheetState((current) => current === next ? current : next);
    setPanelHeight(null);
  }, [collapsed, isMobileViewport, phase]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (suspendedForFloorPicker) {
      if (!floorPickerRestoreRef.current) {
        floorPickerRestoreRef.current = { sheetState: mobileSheetState, panelHeight };
        setMobileSheetState("compact");
        setPanelHeight(null);
      }
      return;
    }
    const previous = floorPickerRestoreRef.current;
    if (previous) {
      floorPickerRestoreRef.current = null;
      setMobileSheetState(previous.sheetState);
      setPanelHeight(previous.panelHeight);
    }
  }, [isMobileViewport, mobileSheetState, panelHeight, suspendedForFloorPicker]);

  const fromKey = useMyLocation && youAreHere
    ? `pin:${youAreHere.x}:${youAreHere.y}`
    : fromRoom
      ? `room:${fromRoom.buildingId}:${fromRoom.floorNumber}:${fromRoom.roomId}`
      : fromCampusPlace
        ? `campus-place:${fromCampusPlace.campusPlaceId}`
        : from ? `building:${from.id}` : null;
  const toKey = toRoom
    ? `room:${toRoom.buildingId}:${toRoom.floorNumber}:${toRoom.roomId}`
    : toCampusPlace
      ? `campus-place:${toCampusPlace.campusPlaceId}`
      : to ? `building:${to.id}` : null;
  const hasFrom = Boolean(fromKey);
  const isEmergency = mode === "emergency";
  const hasTo = isEmergency || Boolean(toRoom || toCampusPlace || to);
  const bothSet = hasFrom && hasTo;
  const sameEndpoint = Boolean(!isEmergency && fromKey && toKey && fromKey === toKey);
  const canStart = Boolean(bothSet && !sameEndpoint);
  const canSwapEndpoints = Boolean(bothSet && !isEmergency && !sameEndpoint && !(useMyLocation && youAreHere));
  const fromDisplay = endpointText("start", from, fromCampusPlace, fromRoom, useMyLocation, youAreHere, youAreHereLabel);
  const toDisplay = isEmergency
    ? { label: route?.emergencyDestinationLabel ?? "Safe evacuation exit", context: "Selected automatically from emergency paths" }
    : endpointText("destination", to, toCampusPlace, toRoom, false, null);
  const searchTitle = activeEndpoint === "start" ? "Choose starting point" : "Choose destination";
  const endpointResults = useMemo(
    () => searchDestinationResults(
      mode === "emergency"
        ? destinationResults.filter((result) => !(result.kind === "marker" && result.category === "gate"))
        : destinationResults,
      query,
      filter,
    ),
    [destinationResults, filter, mode, query],
  );

  const openSearch = (endpoint: RoutePlannerEndpoint) => {
    if (endpoint === "start" && useMyLocation) onUseMyLocationChange(false);
    setQuery("");
    setFilter("all");
    setMobileSheetState("expanded");
    setPanelHeight(null);
    setActiveEndpoint(endpoint);
  };
  const closeSearch = () => {
    setQuery("");
    setActiveEndpoint(null);
    setMobileSheetState("expanded");
  };
  const chooseResult = (result: SearchResult) => {
    const oppositeEndpointKey = activeEndpoint === "start" ? toKey : fromKey;
    if (oppositeEndpointKey && searchResultEndpointKey(result, roomOptions) === oppositeEndpointKey) return;
    if (activeEndpoint === "start") onSelectFromDestination?.(result);
    if (activeEndpoint === "destination") onSelectToDestination?.(result);
    closeSearch();
  };
  const chooseOnMap = () => {
    if (!activeEndpoint) return;
    const endpoint = activeEndpoint;
    setQuery("");
    setPanelHeight(null);
    setMobileSheetState("compact");
    setActiveEndpoint(null);
    onChooseOnMap?.(endpoint);
  };
  const handleCancelMapSelection = () => {
    setMobileSheetState("expanded");
    onChooseOnMap?.(null);
  };
  const swapEndpoints = () => {
    if (onSwapEndpoints) onSwapEndpoints();
    else { onFromChange(to); onToChange(from); }
  };
  const previewPhase = phase === "preview";
  const navigatingPhase = phase === "navigating";
  const routeResultPhase = previewPhase || navigatingPhase || phase === "arrived";
  const availabilityDestinationName = emergencyAvailability && "destinationName" in emergencyAvailability
    ? emergencyAvailability.destinationName
    : undefined;
  const emergencyStatusModel: EmergencyRouteStatusCardModel | null = (() => {
    if (mode !== "emergency") return null;
    const details = emergencyAvailability?.details ?? [
      "Assembly point: Check the published campus destination.",
      "Emergency-safe route: Check the authored room, egress, and outdoor path connections.",
      "Guidance: Follow posted evacuation instructions and campus personnel.",
    ];
    if (routeResultPhase && route) {
      // Keep any explicit non-route-ready state supplied by the resolver.
      if (emergencyAvailability?.state === "review-required") {
        return {
          state: "review-required",
          destinationName: route.emergencyDestinationLabel ?? availabilityDestinationName,
          details: emergencyAvailability.details,
        };
      }
      if (route.emergencyDestinationFallback) {
        return { state: "campus-gate-fallback", destinationName: "Campus Gate · Fallback", details };
      }
      if (!route.emergencyAssemblyPointId) {
        return { state: "exit-only-preview", destinationName: route.emergencyDestinationLabel ?? toDisplay.label, details };
      }
      return {
        state: "auto-calculated",
        destinationName: route.emergencyDestinationLabel ?? availabilityDestinationName,
        details,
      };
    }
    if (emergencyAvailability?.state === "unavailable") {
      return { state: "unavailable", reason: emergencyAvailability.reason, details: emergencyAvailability.details };
    }
    if (emergencyAvailability?.state === "approved") {
      return { state: "approved", destinationName: emergencyAvailability.destinationName, details: emergencyAvailability.details };
    }
    if (emergencyAvailability?.state === "review-required") {
      return { state: "review-required", destinationName: emergencyAvailability.destinationName, details: emergencyAvailability.details };
    }
    if (failedRouteAttempt || routeAttempted) {
      return { state: "unavailable", reason: "no_safe_route", details };
    }
    return emergencyAvailability && emergencyAvailability.state === "available"
      ? { state: "not-calculated", destinationName: availabilityDestinationName, details: emergencyAvailability.details }
      : null;
  })();
  const emergencyPreviewNeedsReview = mode === "emergency"
    && (emergencyStatusModel?.state === "review-required" || emergencyStatusModel?.state === "unapproved-preview");
  const emergencyRouteBlocked = mode === "emergency" && !route
    && (emergencyAvailability?.state === "unavailable" || failedRouteAttempt || routeAttempted);
  const canCalculateRoute = canStart && !emergencyRouteBlocked;
  const floorPickerSuspended = isMobileViewport && suspendedForFloorPicker;
  const preferenceLabel = mode === "standard"
    ? standardPreference === "stairs" ? "Prefer stairs" : standardPreference === "elevator" ? "Prefer elevator" : "Best route"
    : MODES.find((item) => item.key === mode)?.label ?? "Route";
  const nextPlaybackSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
  const speedControl = (compact = false) => <button type="button" data-testid="route-playback-speed" title="Change playback speed" aria-label={`Playback speed ${playbackSpeed} times. Change speed`} onClick={() => onPlaybackSpeedChange?.(nextPlaybackSpeed)} className={cn("shrink-0 rounded-xl border border-border bg-card px-2 font-extrabold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", compact ? "h-10 min-w-11 text-[10px]" : "min-h-11 min-w-14 text-xs")}>{playbackSpeed}×</button>;
  const compactNavigation = navigatingPhase && (isMobileViewport ? mobileSheetState === "compact" : collapsed);
  const compactMobileHeight = floorPickerSuspended ? MOBILE_SHEET_HEIGHTS.compact
    : mapSelectionEndpoint ? (mapSelectionCandidateLabel ? 196 : 148)
      : navigatingPhase ? (transitionAwaitingAction ? 252 : 224)
        : previewPhase ? mode === "emergency" && emergencyRoutes.length > 1
          ? MOBILE_SHEET_HEIGHTS.previewWithAlternatives
          : MOBILE_SHEET_HEIGHTS.preview
          : phase === "arrived" ? 192
          : MOBILE_SHEET_HEIGHTS.compact;
  const canShowMainForm = !floorPickerSuspended && activeEndpoint === null && !mapSelectionEndpoint
    && !(isMobileViewport && mobileSheetState === "compact") && !compactNavigation;
  const arrivedPhase = phase === "arrived";
  const phaseTitle = phase === "planning" ? "Plan your route"
    : previewPhase ? "Route preview"
      : arrivedPhase ? "Arrival"
        : cameraMode === "explore" ? "Explore route" : "Guided navigation";
  const routeFacts = route ? studentRouteFacts(route, standardPreference) : [];
  const routePreferenceFallbackNotice = studentRoutePreferenceFallbackNotice(route, standardPreference);
  const normalizedSteps = route ? studentFacingRouteSteps(route).map((step) => step.instruction) : [];
  const visibleNavigationSteps = navigationSteps.length > 0 ? navigationSteps : normalizedSteps;
  const safeStepIndex = Math.max(0, Math.min(currentStepIndex, Math.max(0, visibleNavigationSteps.length - 1)));
  const seekControlStepIndex = Math.max(0, Math.min(seekTargetIndex ?? safeStepIndex, Math.max(0, visibleNavigationSteps.length - 1)));
  const seekInProgress = navigatingPhase && seekTargetIndex !== null;
  const safeFollowStepIndex = Math.max(0, Math.min(followStepIndex, Math.max(0, visibleNavigationSteps.length - 1)));
  const currentInstruction = visibleNavigationSteps[safeStepIndex] ?? "Follow the route to your destination.";
  const activeDestinationName = route?.emergencyDestinationLabel ?? toDisplay.label;
  const exploreMode = cameraMode === "explore";
  const hasEmergencyRoutes = mode === "emergency" && emergencyRoutes.length > 0;
  const emergencyExploreActive = exploreMode && navigatingPhase && hasEmergencyRoutes;
  // A permitted Campus Gate fallback is already named in the route summary
  // and guided-navigation header. Repeating its warning card above the live
  // instruction consumes mobile space without changing the routing decision.
  const emergencyRouteStatus = emergencyStatusModel
    && emergencyStatusModel.state !== "campus-gate-fallback"
    ? <EmergencyRouteStatus model={emergencyStatusModel} />
    : null;
  const emergencyResultStatus = emergencyStatusModel
    && (!routeResultPhase || ["unavailable", "review-required", "unapproved-preview", "exit-only-preview"].includes(emergencyStatusModel.state))
    ? emergencyRouteStatus
    : null;
  const showEmergencyRouteChoices = hasEmergencyRoutes && emergencyRoutes.length > 1 && phase !== "planning";
  const pendingEmergencyRoute = emergencyRoutes.find((choice) => choice.id === pendingEmergencyRouteId) ?? null;
  const pendingEmergencyRouteIndex = pendingEmergencyRouteId
    ? emergencyRoutes.findIndex((choice) => choice.id === pendingEmergencyRouteId)
    : -1;
  const activeEmergencyRouteIndex = activeEmergencyRouteId
    ? emergencyRoutes.findIndex((choice) => choice.id === activeEmergencyRouteId)
    : -1;
  const currentEmergencyRouteLabel = activeEmergencyRouteIndex >= 0
    ? emergencyRouteOptionLabel(activeEmergencyRouteIndex)
    : "current route";
  const selectEmergencyRoute = (routeId: string, trigger: HTMLButtonElement) => {
    if (navigatingPhase && routeId !== activeEmergencyRouteId) {
      routeSwitchTriggerRef.current = trigger;
      setShowAllSteps(false);
      if (isMobileViewport) setMobileSheetState("expanded");
      if (collapsed || isMobileViewport && mobileSheetState === "compact") onExpand?.();
      if (!playbackPaused || transitionBusy || transitionAwaitingAction) onPause?.();
      setPendingEmergencyRouteId(routeId);
      return;
    }
    onSelectEmergencyRoute?.(routeId);
  };
  const cancelEmergencyRouteSwitch = () => setPendingEmergencyRouteId(null);
  const confirmEmergencyRouteSwitch = () => {
    if (!pendingEmergencyRoute) return;
    const nextRouteId = pendingEmergencyRoute.id;
    setPendingEmergencyRouteId(null);
    onSelectEmergencyRoute?.(nextRouteId);
  };
  const editStartBeforeSwitch = () => {
    setPendingEmergencyRouteId(null);
    onEditRoute?.();
    setActiveEndpoint("start");
  };
  // Normal navigation has one preference-aware route. Route alternatives are
  // presented only by the separate, eligibility-gated emergency selector.
  const showAutomaticRouteChoices = false;
  const emergencyRouteChoiceButtons = (compactEmergencyChoices = false) => showEmergencyRouteChoices ? (
    <div data-testid="emergency-route-selector" role="group" aria-label="Emergency route alternatives" className="grid grid-cols-2 gap-1 rounded-xl border border-rose-500/15 bg-rose-500/[0.035] p-1">
      {emergencyRoutes.map((choice, index) => <button key={choice.id} type="button" data-testid={`emergency-route-tab-${index}`} aria-label={`${emergencyRouteOptionLabel(index)}: ${choice.doorLabel} to ${conciseEmergencyExitLabel(choice.exitLabel)}`} aria-pressed={!emergencyRouteOverview && activeEmergencyRouteId === choice.id} onClick={(event) => selectEmergencyRoute(choice.id, event.currentTarget)} className={cn("min-h-10 min-w-0 rounded-lg px-2 text-[10px] font-extrabold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50", compactEmergencyChoices ? "flex flex-col gap-0.5 py-1" : "", !emergencyRouteOverview && activeEmergencyRouteId === choice.id ? "bg-rose-700 text-white" : "text-muted-foreground hover:bg-card")}>{compactEmergencyChoices ? <><span>{emergencyRouteOptionLabel(index)}</span><span className="w-full truncate text-[9px] font-semibold opacity-80">{conciseEmergencyExitLabel(choice.exitLabel)}</span></> : emergencyRouteOptionLabel(index)}</button>)}
    </div>
  ) : null;
  const emergencyRouteSwitchConfirmation = pendingEmergencyRoute ? (
    <section ref={routeSwitchConfirmationRef} data-testid="emergency-route-switch-confirmation" role="group" aria-label="Confirm emergency route switch" className="space-y-1 rounded-xl border border-rose-500/25 bg-rose-500/[0.055] p-2 shadow-sm">
      <div>
        <h3 className="text-[13px] font-extrabold text-foreground">Switch to {emergencyRouteOptionLabel(pendingEmergencyRouteIndex)}?</h3>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Guidance restarts from the selected start.</p>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">The marker is simulated. Edit Start if you’ve moved.</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button ref={routeSwitchCancelRef} type="button" onClick={cancelEmergencyRouteSwitch} className="min-h-10 min-w-0 rounded-lg border border-border bg-card px-2 text-[10px] font-extrabold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Keep {currentEmergencyRouteLabel === "current route" ? "current route" : currentEmergencyRouteLabel}</button>
        <button type="button" onClick={confirmEmergencyRouteSwitch} className="min-h-10 min-w-0 rounded-lg bg-rose-700 px-2 text-[10px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50">Switch to {emergencyRouteOptionLabel(pendingEmergencyRouteIndex)}</button>
        <button type="button" onClick={editStartBeforeSwitch} className="col-span-2 min-h-8 rounded-lg px-2 text-[10px] font-extrabold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Edit Start</button>
      </div>
    </section>
  ) : null;
  const automaticRouteChoiceButtons = () => showAutomaticRouteChoices ? (
    <div data-testid="automatic-route-selector" role="group" aria-label="Alternative routes" className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-2">
      <p className="text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">Alternative routes</p>
      <div className="grid grid-cols-2 gap-1.5">
        {automaticRouteChoices.map((choice) => <button key={choice.id} type="button"
          aria-pressed={activeAutomaticRouteId === choice.id}
          data-testid={`automatic-route-choice-${choice.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          onClick={() => onSelectAutomaticRoute?.(choice.id)}
          className={cn("min-h-9 rounded-lg px-2 text-[10px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            activeAutomaticRouteId === choice.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>{choice.label}</button>)}
      </div>
      <p className="text-[9px] leading-snug text-muted-foreground">Changing the route restarts this demonstration at its start.</p>
    </div>
  ) : null;
  useEffect(() => {
    if (!showAllSteps && !exploreMode) return;
    const list = stepListRef.current;
    const stepIndex = exploreMode ? safeFollowStepIndex : safeStepIndex;
    const row = stepRowRefs.current.get(stepIndex);
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const top = rowRect.top - listRect.top + list.scrollTop;
    const bottom = top + rowRect.height;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [exploreMode, safeFollowStepIndex, safeStepIndex, showAllSteps, visibleNavigationSteps.length, visibleNavigationSteps[exploreMode ? safeFollowStepIndex : safeStepIndex]]);
  /** Obvious FOLLOW | EXPLORE segmented control with a clearly active state. */
  const cameraModeSegmented = (testid: string) => (
    <div role="group" aria-label="Route camera mode" data-testid={testid}
      className="flex shrink-0 items-center rounded-full border border-primary/20 bg-card p-0.5">
      <button type="button" aria-label={exploreMode ? "Return to Follow mode" : "Switch to Follow mode"} aria-pressed={!exploreMode}
        onClick={() => onCameraModeChange?.("follow")}
        className={cn("min-h-11 rounded-full px-2.5 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:min-h-8",
          !exploreMode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>FOLLOW</button>
      <button type="button" aria-label="Switch to Explore mode" aria-pressed={exploreMode}
        onClick={() => onCameraModeChange?.("explore")}
        className={cn("min-h-11 rounded-full px-2.5 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:min-h-8",
          exploreMode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>EXPLORE</button>
    </div>
  );
  useEffect(() => setFailedRouteAttempt(false), [fromKey, toKey, mode, standardPreference]);
  const findRoute = () => {
    const found = onFindRoute();
    if (found === false) setFailedRouteAttempt(true);
  };
  const selectionDisabledReason = (result: SearchResult) => {
    if (mode === "emergency" && result.kind === "marker" && result.category === "gate") {
      return "Campus Gate is not available for Emergency routing";
    }
    // SOS chooses its destination from the emergency network, so an old
    // standard destination must not disable that same location as a start.
    const oppositeEndpointKey = mode === "emergency" ? null : activeEndpoint === "start" ? toKey : fromKey;
    return oppositeEndpointKey && searchResultEndpointKey(result, roomOptions) === oppositeEndpointKey
      ? `Already selected as ${activeEndpoint === "start" ? "destination" : "start"}`
      : undefined;
  };

  return (
    <motion.div
      layout
      transition={reducedMotion
        ? { layout: { duration: 0.01 } }
        : { layout: { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] } }}
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-label="Route planner"
      aria-describedby="route-planner-description"
      tabIndex={-1}
      data-testid="route-planner-dialog"
      data-layout-animated="true"
      data-map-surface="route-planner"
      data-suspended-for-building={isSuspendedForBuilding ? "true" : "false"}
      data-suspended-for-floor-picker={floorPickerSuspended ? "true" : "false"}
      data-search-open={activeEndpoint ? "true" : "false"}
      data-map-picking={mapSelectionEndpoint ? "true" : "false"}
      data-route-mode={mode}
      data-navigation-compact={compactNavigation ? "true" : undefined}
      data-mobile-sheet-state={isMobileViewport ? mobileSheetState : undefined}
      className="route-planner-dialog pointer-events-auto fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-50 flex h-fit max-h-[var(--student-map-mobile-panel-max-height,calc(100dvh-10rem-env(safe-area-inset-bottom,0px)))] flex-col overflow-hidden rounded-[24px] border border-border/70 bg-card text-foreground shadow-[0_-16px_42px_rgba(15,23,42,0.18)] outline-none md:relative md:inset-auto md:h-fit md:max-h-[75dvh] md:w-full md:max-w-[460px] md:rounded-3xl md:shadow-2xl"
      style={{
        ...(isMobileViewport ? {
          height: floorPickerSuspended
            ? `${MOBILE_SHEET_HEIGHTS.compact}px`
          : mapSelectionEndpoint
            ? `${compactMobileHeight}px`
          : activeEndpoint
            ? "min(82dvh, var(--student-map-mobile-panel-max-height, calc(100dvh - 10rem - env(safe-area-inset-bottom, 0px))))"
          : mobileSheetState === "compact"
            ? `${compactMobileHeight}px`
            : panelHeight !== null ? `${panelHeight}px`
              : previewPhase
                ? "fit-content"
                : navigatingPhase
                  ? "min(var(--student-map-mobile-panel-max-height, calc(100dvh - 10rem - env(safe-area-inset-bottom, 0px))), 72dvh)"
                : "fit-content",
        } : {}),
        ...(isMobileViewport && panelHeight !== null && !activeEndpoint && !mapSelectionEndpoint ? { height: `${panelHeight}px` } : {}),
      }}
      onWheelCapture={(event) => event.stopPropagation()}
      onTouchMoveCapture={(event) => event.stopPropagation()}
    >
      <span id="route-planner-description" className="sr-only">Choose a starting point, destination, and travel mode to get walking directions.</span>
      <p role="status" aria-live="polite" aria-atomic="true" data-testid="route-planner-live-status" className="sr-only">
        {route ? `Route ready from ${fromDisplay.label} to ${toDisplay.label}.` : "Choose a starting point and destination to plan a route."}
      </p>

      <header className={cn("shrink-0 border-b border-border/60 bg-card/95 backdrop-blur-xl", mapSelectionEndpoint ? "px-3 py-1" : (activeEndpoint || (isMobileViewport && mobileSheetState === "compact")) ? "px-3 pb-1 pt-1 xl:px-4 xl:pb-3 xl:pt-3" : "px-3.5 pb-1.5 pt-1.5 md:px-4 md:pb-3 md:pt-3")}>
        {isMobileViewport && <div
          role="slider"
          tabIndex={0}
          aria-label="Resize route planner"
          aria-orientation="vertical"
          aria-valuemin={ROUTE_PLANNER_MIN_HEIGHT}
          aria-valuemax={resizeBounds.max}
          aria-valuenow={currentPanelHeight()}
          data-testid="route-planner-resize-handle"
          className={cn("mx-auto flex w-full touch-none cursor-row-resize items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", isMobileViewport ? mapSelectionEndpoint ? "h-4" : "h-6" : "h-11")}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          onKeyDown={handleResizeKeyDown}
        >
          <span aria-hidden="true" className="h-1 w-8 rounded-full bg-border md:w-9" />
        </div>}
        <div data-testid="route-planner-header-primary-row" className="flex min-w-0 items-center gap-2 md:gap-2.5">
          {mapSelectionEndpoint ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><MapPin className="h-4 w-4" /></span>
          ) : activeEndpoint ? (
            <button type="button" onClick={closeSearch} aria-label="Back to route planner" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 xl:h-9 xl:w-9"><ArrowLeft className="h-3.5 w-3.5 xl:h-4 xl:w-4" /></button>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Navigation className="h-4 w-4" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("truncate whitespace-nowrap font-extrabold leading-tight", (activeEndpoint || mapSelectionEndpoint) ? "text-xs xl:text-[15px]" : "text-[13px] md:text-[15px]")}>{mapSelectionEndpoint ? `Choose ${mapSelectionEndpoint === "start" ? "start" : "destination"} on map` : activeEndpoint ? searchTitle : phaseTitle}</p>
            {(mapSelectionEndpoint || activeEndpoint || phase === "planning") && <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground md:block">{mapSelectionEndpoint ? "Tap a place or search for a room" : activeEndpoint ? "Search buildings, rooms, and offices" : "Choose a start and destination"}</p>}
          </div>
          {!compactPanelLayout && headerUtility && <div data-testid="route-planner-header-controls" className="flex min-w-0 shrink-0 items-center gap-1.5">{headerUtility}</div>}
          <div data-testid="route-planner-header-actions" className="flex shrink-0 items-center gap-1.5">
            {headerModeToggle}
            {compactPanelLayout && headerUtility && !(isMobileViewport && previewPhase && mobileSheetState === "compact") && <div data-testid="route-planner-responsive-header-controls" className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
              {headerUtility}
            </div>}
            {mapSelectionEndpoint ? (
              <button type="button" onClick={handleCancelMapSelection} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-extrabold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Cancel</button>
            ) : activeEndpoint ? (
              <button type="button" onClick={onClose} aria-label="Close directions" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
            ) : compactNavigation || (isMobileViewport && mobileSheetState === "compact") ? (
              <button type="button" onClick={() => { setPanelHeight(null); setMobileSheetState("expanded"); onExpand?.(); }} aria-label={navigatingPhase ? "Expand navigation panel" : "Expand route panel"} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-extrabold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Expand</button>
            ) : phase !== "planning" && !activeEndpoint && !mapSelectionEndpoint ? (
              <button type="button" onClick={() => { if (isMobileViewport) setMobileSheetState("compact"); onCollapse?.(); }} aria-label={navigatingPhase ? "Collapse navigation panel" : "Collapse route preview"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ChevronDown className="h-4 w-4" /></button>
            ) : (
              <button type="button" onClick={onClose} aria-label={editingCompletedRoute ? "Cancel editing route" : "Cancel route planning"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
            )}
          </div>
        </div>
      </header>

      {floorPickerSuspended ? (
        <div data-testid="route-planner-floor-picker-suspended" className="flex min-h-0 flex-1 items-center px-3 pb-2 text-[11px] font-semibold text-muted-foreground">
          Floor selection is open
        </div>
      ) : <>
        {mapSelectionEndpoint ? (
          <motion.div
            key="route-planner-map-pick-hint"
            data-testid="route-planner-map-pick-hint"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1.5"
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: "easeOut" }}
          >
            {mapSelectionCandidateLabel ? (
              <div data-testid="route-planner-map-pick-confirmation" className="flex min-h-0 flex-col justify-center gap-1.5">
                <div className="min-w-0"><p className="line-clamp-2 text-[13px] font-extrabold leading-tight text-foreground">{mapSelectionCandidateLabel}</p><p className="text-[10px] leading-tight text-muted-foreground">Use this as your {mapSelectionEndpoint === "start" ? "starting point" : "destination"}?</p></div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={onClearMapSelectionCandidate} className="min-h-10 shrink-0 rounded-xl border border-border px-2.5 text-[10px] font-bold text-muted-foreground">Choose another</button>
                  <button type="button" onClick={onConfirmMapSelection} className="min-h-10 min-w-0 flex-1 rounded-xl bg-primary px-2 text-[10px] font-extrabold text-primary-foreground">Use as {mapSelectionEndpoint === "start" ? "starting point" : "destination"}</button>
                </div>
              </div>
            ) : <p role="status" aria-live="polite" className="py-1 text-center text-[11px] font-bold leading-snug text-muted-foreground">Tap a building or campus place, or enter a building to choose a room.</p>}
            {selectionError && <p role="alert" className="mt-1 text-center text-[10px] font-bold leading-tight text-destructive">{selectionError}</p>}
          </motion.div>
        ) : activeEndpoint ? (
          <motion.div
            key={`search-${activeEndpoint}`}
            data-testid="route-planner-search-subview"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 xl:p-4"
            initial={reducedMotion ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.19, ease: "easeOut" }}
          >
            <button type="button" onClick={chooseOnMap} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] px-3 text-xs font-extrabold text-primary transition-colors hover:border-primary/55 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-10">
              <MapPin className="h-4 w-4 text-primary" />Choose on map
            </button>
            <CampusDestinationSearch
              query={query}
              results={endpointResults}
              focused
              filter={filter}
              placeholder={activeEndpoint === "start" ? "Search a starting building or room" : "Search buildings, rooms, and offices"}
              ariaLabel={activeEndpoint === "start" ? "Search start" : "Search destination"}
              onQueryChange={setQuery}
              onFocus={() => undefined}
              onBlur={() => undefined}
              onFilterChange={setFilter}
              onSelect={chooseResult}
              onClear={() => setQuery("")}
              autoFocus
              compact={isMobileViewport}
              fillResults
              embedded
              getDisabledReason={selectionDisabledReason}
              listId={activeEndpoint === "start" ? "route-start-destination-results" : "route-destination-results"}
              groupByBuilding
              dense={isMobileViewport}
            />
          </motion.div>
        ) : compactNavigation || (isMobileViewport && mobileSheetState === "compact") ? (
          previewPhase ? (
            <div data-testid="mobile-route-preview-collapsed-summary" className="flex min-h-0 flex-1 flex-col justify-center gap-1 px-3 pb-2">
              {emergencyRouteOverview ? (
                <>
                  <p className="shrink-0 truncate text-[9px] font-extrabold uppercase tracking-wider text-primary">SOS · Emergency route preview</p>
                  <p className="shrink-0 truncate text-[10px] font-extrabold text-foreground">From {fromDisplay.label}</p>
                  <p className="shrink-0 truncate text-[10px] font-semibold text-muted-foreground">Destination · {activeDestinationName}</p>
                  {emergencyRoutes.length > 1 && <div data-testid="mobile-emergency-route-overview-choices" className="min-h-0">{emergencyRouteChoiceButtons(true)}</div>}
                </>
              ) : (
                <>
                  {mode === "emergency" ? <>
                    <p className="shrink-0 truncate text-[9px] font-extrabold uppercase tracking-wider text-primary">SOS · Emergency route preview</p>
                    <p className="shrink-0 truncate text-[10px] font-semibold text-muted-foreground">From {fromDisplay.label}</p>
                    <p title={activeDestinationName} className="shrink-0 truncate text-[11px] font-extrabold">{activeDestinationName}</p>
                    {showEmergencyRouteChoices && emergencyRouteChoiceButtons(true)}
                  </> : <>
                    <p title={`${fromDisplay.label} → ${activeDestinationName}`} className="shrink-0 line-clamp-2 break-words text-[11px] font-extrabold">{fromDisplay.label} → {activeDestinationName}</p>
                    <p className="shrink-0 truncate text-[10px] text-muted-foreground">{preferenceLabel}</p>
                  </>}
                </>
              )}
              {emergencyPreviewNeedsReview && <p role="status" className="truncate text-[9px] font-semibold text-amber-700 dark:text-amber-300">Route needs review · Start is disabled</p>}
              {mode !== "emergency" && routePreferenceFallbackNotice && <p data-testid="route-preference-fallback-note" role="status" className="truncate text-[9px] font-semibold text-amber-700 dark:text-amber-300">{routePreferenceFallbackNotice}</p>}
              {!emergencyRouteOverview && <button type="button" data-testid="mobile-route-preview-start-navigation" onClick={onStartNavigation} disabled={emergencyPreviewNeedsReview} aria-describedby={emergencyPreviewNeedsReview ? "emergency-route-status" : undefined} className="min-h-10 w-full rounded-xl bg-primary px-3 text-[11px] font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">Start Navigation</button>}
            </div>
          ) : navigatingPhase && route ? (
            <div data-testid={isMobileViewport ? "mobile-route-collapsed-summary" : "desktop-route-collapsed-summary"} className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-3 pb-2">
              {showEmergencyRouteChoices && emergencyRouteChoiceButtons()}
              {emergencyRouteSwitchConfirmation}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {exploreMode ? <>
                    <p data-testid="collapsed-explore-route" className="truncate text-[11px] font-extrabold">{fromDisplay.label} → {activeDestinationName}</p>
                    <p data-testid="explore-context-label" className="truncate text-[10px] font-bold text-muted-foreground">{inspectionContextLabel} · {mode === "emergency" ? "SOS" : preferenceLabel}</p>
                    {emergencyExploreActive ? <>
                      <p className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Step {safeStepIndex + 1} of {Math.max(1, visibleNavigationSteps.length)}</p>
                      <motion.p key={`compact-emergency-explore-${safeStepIndex}-${currentInstruction}`} data-testid="compact-current-route-instruction" role="status" aria-live="polite" aria-atomic="true" className="line-clamp-2 text-[11px] leading-snug text-foreground"
                        initial={reducedMotion ? false : { opacity: 0.35, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0.01 : 0.16, ease: "easeOut" }}>{currentInstruction}</motion.p>
                    </> : <p data-testid="compact-explore-guidance" className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">Move the map to explore this route.</p>}
                  </> : <>
                    <p className="truncate text-[11px] font-extrabold">Step {safeStepIndex + 1} of {Math.max(1, visibleNavigationSteps.length)} · {activeDestinationName}</p>
                    <p data-testid="compact-current-route-instruction" className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{currentInstruction}</p>
                  </>}
                </div>
                {cameraModeSegmented("compact-camera-mode")}
              </div>
              {!exploreMode && inspectionPaused && <p data-testid="route-paused-for-inspection" role="status" className="rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[10px] font-semibold text-foreground">Paused for map inspection. Resume to return the map to your route.</p>}
              {transitionAwaitingAction && transitionPrompt && <p data-testid="compact-transition-prompt" className="rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-foreground">{transitionPrompt}</p>}
              {contextRecoveryPending && <div data-testid="route-context-recovery-status" role="status" className="flex items-center gap-1.5 rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[10px] font-semibold text-foreground">
                <Navigation className="h-3.5 w-3.5 animate-pulse" /><span>Returning to the current route position…</span>
              </div>}
              {contextRecoveryFailed && <div data-testid="route-context-recovery-failed" role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-destructive/[0.08] px-2.5 py-1.5 text-[10px] font-semibold text-foreground">
                <span>Could not return to the route position.</span>
                <button type="button" onClick={onRetryContextRecovery} disabled={!onRetryContextRecovery} className="min-h-8 shrink-0 rounded-lg border border-destructive/30 px-2.5 font-extrabold text-destructive disabled:opacity-50">Retry</button>
              </div>}
              <div className="flex items-center gap-1.5">
                {exploreMode ? (
                  <div className="flex w-full gap-1.5">
                    {primaryAction === "continue-transition" && <button type="button" onClick={onContinueTransition} disabled={transitionBusy || primaryActionDisabled} aria-label={transitionActionLabel} className="min-h-10 flex-1 rounded-xl bg-primary px-2 text-[10px] font-extrabold text-primary-foreground disabled:opacity-45">{transitionActionLabel}</button>}
                    <button type="button" onClick={() => { setShowAllSteps(true); setPanelHeight(null); setMobileSheetState("expanded"); onExpand?.(); }} className="min-h-10 flex-1 rounded-xl border border-border px-2 text-[10px] font-extrabold text-foreground">Route details</button>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={onPreviousStep} disabled={transitionBusy || seekInProgress || seekControlStepIndex <= 0} aria-label="Previous step" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                    {primaryAction === "continue-transition" ? <button type="button" onClick={onContinueTransition} disabled={transitionBusy || primaryActionDisabled} aria-label={transitionActionLabel} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-primary text-[11px] font-extrabold text-primary-foreground disabled:opacity-45">{transitionActionLabel}</button> : primaryAction === "done" ? <button type="button" onClick={onDone} disabled={transitionBusy || primaryActionDisabled} className="flex h-10 flex-1 items-center justify-center rounded-xl bg-primary text-[10px] font-extrabold text-primary-foreground disabled:opacity-45">Done</button> : <button type="button" onClick={primaryAction === "resume" ? onResume : onPause} disabled={(transitionBusy && !pauseDuringVerticalRun) || primaryActionDisabled || verticalRunPausePending} aria-label={contextRecoveryPending ? "Returning to route" : primaryAction === "resume" ? "Resume navigation" : "Pause navigation"} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-[10px] font-extrabold text-primary-foreground disabled:opacity-45">{contextRecoveryPending ? <><Navigation className="h-3.5 w-3.5 animate-pulse" />Returning…</> : primaryAction === "resume" ? <><Play className="h-3.5 w-3.5" />Resume</> : verticalRunPausePending ? "Pausing…" : <><Pause className="h-3.5 w-3.5" />Pause</>}</button>}
                    {primaryAction !== "continue-transition" && primaryAction !== "done" && <button type="button" onClick={onNextStep} disabled={transitionBusy || seekInProgress || seekControlStepIndex >= visibleNavigationSteps.length - 1} aria-label="Next step" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>}
                    {speedControl(true)}
                  </>
                )}
              </div>
            </div>
          ) : arrivedPhase ? (
            <div data-testid="mobile-route-arrival-compact" className="flex min-h-0 flex-col gap-2 px-3 pb-2">
              <p className="truncate text-[12px] font-extrabold">{activeDestinationName}</p>
              <button type="button" onClick={onPreviousStep} disabled={transitionBusy || seekInProgress || seekControlStepIndex <= 0} aria-label="Previous step from arrival" className="min-h-11 w-full rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Previous step</button>
              <button type="button" onClick={onStartNavigation} className="min-h-11 w-full rounded-xl bg-primary text-[11px] font-extrabold text-primary-foreground">Restart Route</button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onEditRoute} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold">Edit Route</button>
                <button type="button" onClick={onDone} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold">Done</button>
              </div>
            </div>
          ) : null
        ) : (
          <motion.div
            key="route-planner-main"
            data-testid="route-planner-scroll-region"
            className={cn("min-h-0 overscroll-contain px-3.5 py-2 md:max-h-[calc(100dvh-14rem)] md:px-4 md:py-4",
              navigatingPhase || previewPhase
                ? cn("flex flex-1 flex-col gap-2", isMobileViewport && navigatingPhase ? "overflow-hidden" : "overflow-y-auto")
                : "flex-none space-y-2 overflow-y-auto md:flex-none md:space-y-3",
              isMobileViewport && phase === "planning" && !activeEndpoint && !mapSelectionEndpoint && mobileSheetState !== "expanded" && "hide-scrollbar-mobile")}
            style={isMobileViewport && !activeEndpoint && !mapSelectionEndpoint
              ? previewPhase
                ? { flex: "0 1 auto", maxHeight: "min(44dvh, 24rem)" }
                : navigatingPhase
                ? { flex: "1 1 0%", maxHeight: "none" }
                : { flex: "0 1 auto", maxHeight: `max(0px, calc(var(--student-map-mobile-panel-max-height, 60dvh) - 8rem))` }
              : undefined}
            initial={reducedMotion ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.19, ease: "easeOut" }}
          >
            {showEmergencyRouteChoices && emergencyRouteChoiceButtons()}
            {emergencyRouteSwitchConfirmation}
            {automaticRouteChoiceButtons()}
            {(previewPhase || navigatingPhase) && emergencyResultStatus}
            {emergencyRouteOverview && emergencyRoutes.length > 1 ? (
              <div data-testid="emergency-route-overview" className="space-y-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.045] p-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300">Choose a route</p>
                  <p data-testid="emergency-overview-destination" title={`Destination · ${activeDestinationName}`} className="mt-0.5 line-clamp-2 break-words text-[10px] font-semibold text-muted-foreground">Destination · {activeDestinationName}</p>
                </div>
                <div className="space-y-2">{emergencyRoutes.map((choice, index) => <button key={choice.id} type="button" data-testid={`emergency-route-choice-${index}`} aria-label={`${emergencyRouteOptionLabel(index)}: ${choice.doorLabel} to ${conciseEmergencyExitLabel(choice.exitLabel)}`} title={choice.exitLabel} onClick={() => onSelectEmergencyRoute?.(choice.id)} className="flex min-h-14 w-full items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-left transition-colors hover:border-rose-500/45 hover:bg-rose-500/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: index === 0 ? "#2563eb" : "#c2410c" }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-extrabold">{emergencyRouteOptionLabel(index)}</span><span className="block truncate text-[10px] text-muted-foreground">{choice.doorLabel} → {conciseEmergencyExitLabel(choice.exitLabel)}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>)}</div>
                <p className="rounded-lg bg-card/75 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">Follow posted instructions and campus personnel.</p>
              </div>
            ) : previewPhase && route ? (
              <div data-testid="route-summary" className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.055] p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground"><RouteIcon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-primary">{mode === "emergency" ? "Emergency route" : `${MODES.find((item) => item.key === mode)?.label} route`}</p>
                    {mode === "emergency" ? <>
                      <p className="truncate text-[10px] font-semibold text-muted-foreground">From {fromDisplay.label}</p>
                      <p data-testid="emergency-route-summary-destination" title={activeDestinationName} className="line-clamp-2 break-words text-[13px] font-extrabold text-foreground">{activeDestinationName}</p>
                    </> : <p className="truncate text-[13px] font-extrabold text-foreground">{fromDisplay.label} → {toDisplay.label}</p>}
                  </div>
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                </div>
                <div data-testid="route-facts" className="hidden flex-wrap gap-1.5 md:flex">{routeFacts.map((fact) => <span key={fact} className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{fact}</span>)}</div>
                {!emergencyRouteOverview && <>
                  <div className="flex justify-end">{cameraModeSegmented("route-preview-camera-mode")}</div>
                </>}
                {routePreferenceFallbackNotice && <p data-testid="route-preference-fallback-note" role="status" className="rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-2 text-[10px] font-semibold leading-snug text-amber-800 dark:text-amber-200">{routePreferenceFallbackNotice}</p>}
                <details data-testid="route-preview-steps" className="group rounded-xl border border-border/70 bg-card/80 px-3 py-2">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-[10px] font-extrabold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 [&::-webkit-details-marker]:hidden"><span className="flex-1">Steps</span><span className="text-muted-foreground">{normalizedSteps.length}</span><ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
                  <ol className="mt-2 max-h-[min(32dvh,18rem)] space-y-1 overflow-y-auto overscroll-y-auto touch-pan-y">{normalizedSteps.map((instruction, index) => <li key={`${index}-${instruction}`}><RouteInstructionRow index={index} instruction={instruction} /></li>)}</ol>
                </details>
              </div>
            ) : navigatingPhase && route ? (
              <div data-testid="guided-navigation-summary" className="flex min-h-0 flex-1 flex-col gap-2">
                {exploreMode && <div data-testid="explore-route-summary" className="shrink-0 rounded-2xl border border-primary/20 bg-primary/[0.055] p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><RouteIcon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-extrabold uppercase tracking-wider text-primary">{mode === "emergency" ? "Emergency route" : `${MODES.find((item) => item.key === mode)?.label} route`}</p>
                      {mode === "emergency" ? <>
                        <p className="truncate text-[10px] font-semibold text-muted-foreground">From {fromDisplay.label}</p>
                        <p data-testid="guided-destination" title={activeDestinationName} className="line-clamp-2 break-words text-[11px] font-extrabold leading-tight">{activeDestinationName}</p>
                      </> : <p className="truncate text-[12px] font-extrabold">{fromDisplay.label} → {activeDestinationName}</p>}
                      <p data-testid="guided-inspection-context" className="truncate text-[11px] font-bold text-muted-foreground"><span data-testid="explore-context-label">{inspectionContextLabel}</span></p>
                    </div>
                    {cameraModeSegmented("camera-mode")}
                  </div>
                  <div data-testid="explore-route-facts" className="mt-2 hidden flex-wrap gap-1.5 md:flex">{routeFacts.map((fact) => <span key={fact} className="rounded-full border border-border/70 bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground">{fact}</span>)}</div>
                  {routePreferenceFallbackNotice && <p data-testid="route-preference-fallback-note" role="status" className="mt-2 text-[10px] font-semibold leading-snug text-amber-700 dark:text-amber-300">{routePreferenceFallbackNotice}</p>}
                  {emergencyExploreActive ? <div className="mt-2 min-h-[3.25rem] rounded-xl bg-card/85 px-3 py-2">
                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Step {safeStepIndex + 1} of {Math.max(1, visibleNavigationSteps.length)}</p>
                    <motion.p key={`emergency-explore-step-${safeStepIndex}-${currentInstruction}`} data-testid="current-route-instruction" role="status" aria-live="polite" aria-atomic="true" className="mt-0.5 text-[13px] font-bold leading-snug text-foreground"
                      initial={reducedMotion ? false : { opacity: 0.35, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0.01 : 0.16, ease: "easeOut" }}>{currentInstruction}</motion.p>
                    {routePreferenceFallbackNotice && <p data-testid="route-preference-fallback-note" role="status" className="mt-1 text-[10px] font-semibold leading-snug text-amber-700 dark:text-amber-300">{routePreferenceFallbackNotice}</p>}
                  </div> : <p data-testid="explore-route-guidance" className="mt-2 text-[11px] font-medium leading-snug text-muted-foreground">Move the map or select a step.</p>}
                  {transitionAwaitingAction && transitionPrompt && <p data-testid="transition-wait-prompt" className="mt-2 rounded-lg bg-primary/[0.07] px-2.5 py-2 text-[11px] font-semibold leading-snug text-foreground">{transitionPrompt}</p>}
                  <button type="button" data-testid="guided-explore-steps-toggle" onClick={() => setShowAllSteps((open) => !open)} className="mt-2 min-h-9 rounded-lg border border-border px-3 text-[10px] font-extrabold text-foreground">{showAllSteps ? "Hide steps" : "Show steps"}</button>
                </div>}
                {!exploreMode && <div className="shrink-0 rounded-2xl border border-primary/20 bg-primary/[0.055] p-3">
                  <div className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Navigation className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-extrabold uppercase tracking-wider text-primary">Step {safeStepIndex + 1} of {Math.max(1, visibleNavigationSteps.length)}</p><p data-testid="guided-destination" title={activeDestinationName} className={cn("font-extrabold", mode === "emergency" ? "line-clamp-2 break-words text-[11px] leading-tight" : "truncate text-[13px]")}>{activeDestinationName}</p></div>{cameraModeSegmented("camera-mode")}</div>
                  <>
                    <motion.p key={`guided-step-${safeStepIndex}-${currentInstruction}`} data-testid="current-route-instruction" role="status" aria-live="polite" aria-atomic="true" className="mt-3 min-h-[2.5rem] text-[14px] font-bold leading-snug text-foreground"
                      initial={reducedMotion ? false : { opacity: 0.35, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0.01 : 0.16, ease: "easeOut" }}>{currentInstruction}</motion.p>
                    {inspectionPaused && <p data-testid="route-paused-for-inspection" role="status" className="mt-2 rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[10px] font-semibold text-foreground">Paused for map inspection. Resume to return the map to your route.</p>}
                    {contextRecoveryPending && <div data-testid="route-context-recovery-status" role="status" className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[10px] font-semibold text-foreground">
                      <span>Returning to the current route position…</span>
                    </div>}
                    {contextRecoveryFailed && <div data-testid="route-context-recovery-failed" role="alert" className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-destructive/[0.08] px-2.5 py-1.5 text-[10px] font-semibold text-foreground">
                      <span>Could not return to the route position.</span>
                      <button type="button" onClick={onRetryContextRecovery} disabled={!onRetryContextRecovery} className="min-h-8 shrink-0 rounded-lg border border-destructive/30 px-2.5 font-extrabold text-destructive disabled:opacity-50">Retry</button>
                    </div>}
                    {routePreferenceFallbackNotice && <p data-testid="route-preference-fallback-note" role="status" className="mt-1 text-[10px] font-semibold leading-snug text-amber-700 dark:text-amber-300">{routePreferenceFallbackNotice}</p>}
                    {transitionAwaitingAction && transitionPrompt && <p data-testid="transition-wait-prompt" className="mt-2 rounded-lg bg-primary/[0.07] px-2.5 py-2 text-[11px] font-semibold leading-snug text-foreground">{transitionPrompt}</p>}
                    {visibleNavigationSteps[safeStepIndex + 1] && <p className="mt-2 text-[11px] text-muted-foreground">Next: {visibleNavigationSteps[safeStepIndex + 1]}</p>}
                  </>
                </div>}
                {!exploreMode && (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      <button type="button" onClick={onPreviousStep} disabled={transitionBusy || seekInProgress || seekControlStepIndex <= 0} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Previous</button>
                      {primaryAction === "continue-transition" ? <button type="button" onClick={onContinueTransition} disabled={transitionBusy || primaryActionDisabled} className="min-h-11 rounded-xl bg-primary px-2 text-[11px] font-extrabold text-primary-foreground disabled:opacity-45">{transitionActionLabel}</button> : primaryAction === "done" ? <button type="button" onClick={onDone} disabled={transitionBusy || primaryActionDisabled} className="min-h-11 rounded-xl bg-primary px-2 text-[11px] font-extrabold text-primary-foreground disabled:opacity-45">Done</button> : <button type="button" onClick={primaryAction === "resume" ? onResume : onPause} disabled={(transitionBusy && !pauseDuringVerticalRun) || primaryActionDisabled || verticalRunPausePending} aria-label={contextRecoveryPending ? "Returning to route" : primaryAction === "resume" ? "Resume navigation" : "Pause navigation"} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-[11px] font-extrabold text-primary-foreground disabled:opacity-45">{contextRecoveryPending ? <><Navigation className="h-3.5 w-3.5 animate-pulse" />Returning…</> : primaryAction === "resume" ? <><Play className="h-3.5 w-3.5" />Resume</> : verticalRunPausePending ? "Pausing…" : <><Pause className="h-3.5 w-3.5" />Pause</>}</button>}
                      {primaryAction !== "continue-transition" && primaryAction !== "done" && <button type="button" onClick={onNextStep} disabled={transitionBusy || seekInProgress || seekControlStepIndex >= visibleNavigationSteps.length - 1} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Next</button>}
                      {speedControl()}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowAllSteps((open) => !open)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-[11px] font-extrabold"><List className="h-3.5 w-3.5" />{showAllSteps ? "Hide steps" : "Steps"}</button>
                    </div>
                  </>
                )}
                {exploreMode && primaryAction === "continue-transition" && <button type="button" data-testid="explore-continue-transition" onClick={onContinueTransition} disabled={transitionBusy || primaryActionDisabled} className="min-h-11 w-full rounded-xl bg-primary px-3 text-[11px] font-extrabold text-primary-foreground disabled:opacity-45">{transitionActionLabel}</button>}
                {showAllSteps && <ol ref={stepListRef} data-testid="guided-route-steps" aria-label="Route steps" className={cn("min-h-[9rem] max-h-[min(38dvh,24rem)] space-y-0.5 overflow-y-auto overscroll-y-auto touch-pan-y rounded-xl border border-border/70 p-2", isMobileViewport && navigatingPhase ? "flex-1" : "shrink-0")}>
                  {visibleNavigationSteps.map((step, index) => {
                    const inspected = exploreMode && index === safeStepIndex;
                    const actualFollow = exploreMode && index === safeFollowStepIndex;
                    const progressIndex = exploreMode ? safeFollowStepIndex : safeStepIndex;
                    const stepStatus = index < progressIndex ? "completed" : index === progressIndex ? "active" : "upcoming";
                    return <li ref={(node) => { if (node) stepRowRefs.current.set(index, node); else stepRowRefs.current.delete(index); }} key={`${index}-${step}`} aria-current={index === progressIndex ? "step" : undefined} data-step-state={stepStatus} data-testid={inspected ? "explore-inspected-step" : !exploreMode && index === safeStepIndex ? "guided-active-step" : undefined} className={cn("ml-1 border-l-2 pl-2", stepStatus === "active" ? "border-primary" : stepStatus === "completed" ? "border-emerald-500/35" : "border-border/70")}>
                      <RouteInstructionRow
                        index={index}
                        instruction={step}
                        stepStatus={stepStatus}
                        {...(exploreMode ? { onInspect: () => onInspectStep?.(index), inspected, followPosition: actualFollow, testId: `explore-instruction-${index}` } : {})}
                      />
                    </li>;
                  })}
                </ol>}
              </div>
            ) : arrivedPhase ? (
              <motion.div data-testid="route-arrival-state" className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-center" initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reducedMotion ? { duration: 0.01 } : { duration: 0.24, ease: "easeOut" }}>
                <motion.span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white" initial={reducedMotion ? false : { scale: 0.78 }} animate={{ scale: 1 }} transition={reducedMotion ? { duration: 0.01 } : { type: "spring", stiffness: 360, damping: 24 }}><Check className="h-6 w-6" /></motion.span>
                <p data-testid="route-arrival-title" className="text-base font-extrabold text-emerald-800">{mode === "emergency" ? `Arrived at ${activeDestinationName}` : "You've arrived"}</p>
                {mode !== "emergency" && <p className="mt-1 text-lg font-extrabold">{activeDestinationName}</p>}
                {mode === "emergency" && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Follow campus personnel's instructions.</p>}
                <div className="mt-4 flex w-full flex-col gap-2"><button type="button" onClick={onPreviousStep} disabled={transitionBusy || seekInProgress || seekControlStepIndex <= 0} aria-label="Previous step from arrival" className="min-h-11 w-full rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Previous step</button><button type="button" onClick={onStartNavigation} className="min-h-11 w-full rounded-xl bg-primary text-[11px] font-extrabold text-primary-foreground">Restart Route</button><div className="grid w-full grid-cols-2 gap-2"><button type="button" onClick={onEditRoute} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold">Edit Route</button><button type="button" onClick={onDone} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold">Done</button></div></div>
              </motion.div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="group" aria-label="Route modes">
                  {MODES.map(({ key, label, icon }) => (
                    <button key={key} type="button" onClick={() => onModeChange(key)} aria-label={`${label} routing`} aria-pressed={mode === key} className={cn("flex min-h-11 items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", mode === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground", mode === key && key === "accessible" && "bg-emerald-700", mode === key && key === "emergency" && "bg-rose-700")}>
                      {icon}<span>{label}</span>
                    </button>
                  ))}
                </div>
                {mode === "accessible" && <p data-testid="accessible-route-note" className="rounded-lg bg-emerald-700/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-emerald-800 dark:text-emerald-200">Uses accessible paths where available.</p>}
                {mode === "standard" && (
                  <div data-testid="standard-route-preferences" className="grid grid-cols-3 gap-0.5 rounded-xl border border-border/70 bg-muted/25 p-0.5 md:gap-1 md:p-1" role="group" aria-label="Standard route preference">
                    {([
                      ["best", "Best"],
                      ["stairs", "Prefer stairs"],
                      ["elevator", "Prefer elevator"],
                    ] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => onStandardPreferenceChange?.(value)} aria-pressed={standardPreference === value} className={cn("min-h-11 rounded-lg px-1.5 text-[11px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", standardPreference === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <EndpointCard purpose="start" building={from} campusPlace={fromCampusPlace} room={fromRoom} useMyLocation={useMyLocation} youAreHere={youAreHere} onChange={() => openSearch("start")} compact={isMobileViewport} />
                {isEmergency && emergencyRouteStatus}
                {canSwapEndpoints && (
                  <div data-testid="route-planner-swap-row" className="flex h-10 shrink-0 items-center justify-center">
                    <button type="button" onClick={swapEndpoints} disabled={sameEndpoint} aria-label="Swap start and destination" title="Swap start and destination" className="flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-muted/50 text-muted-foreground transition-[transform,background-color,color,border-color] duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"><ArrowUpDown className="h-4 w-4" /></button>
                  </div>
                )}
                {isEmergency ? (
                  selectionError && !emergencyRouteStatus && <p role="status" className="rounded-lg bg-muted/50 px-2.5 py-2 text-[10px] text-muted-foreground">{selectionError}</p>
                ) : (
                  <EndpointCard purpose="destination" building={to} campusPlace={toCampusPlace} room={toRoom} useMyLocation={false} onChange={() => openSearch("destination")} compact={isMobileViewport} />
                )}
                {sameEndpoint && <p role="alert" data-testid="same-route-endpoint-error" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">Choose two different places for your route.</p>}
                {(routeAttempted || failedRouteAttempt) && bothSet && !sameEndpoint && !route && mode !== "emergency" && <RouteErrorState fromCode={fromDisplay.label} toCode={toDisplay.label} mode={mode} onSwitchMode={onModeChange} />}
              </>
            )}
          </motion.div>
        )}
      </>}

      {canShowMainForm && <footer data-testid="route-planner-footer" className="shrink-0 border-t border-border/60 bg-card/95 px-3.5 pb-2.5 pt-2.5 backdrop-blur-xl md:px-4 md:pb-3">
        {phase === "planning" ? <div className="flex gap-2">
        {editingCompletedRoute
          ? <button type="button" onClick={onCancelEditRoute ?? onClose} className="min-h-11 rounded-xl border border-border px-3 text-[12px] font-extrabold text-muted-foreground transition-colors hover:bg-muted">Cancel</button>
          : <button type="button" onClick={onClear} className="min-h-11 rounded-xl border border-border px-3 text-[12px] font-extrabold text-muted-foreground transition-colors hover:bg-muted">Clear</button>}
          <button type="button" onClick={findRoute} disabled={!canCalculateRoute} aria-describedby={emergencyRouteBlocked ? "emergency-route-status" : undefined} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground shadow-sm transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"><Navigation className="h-3.5 w-3.5" />{emergencyRouteBlocked ? "Find Route" : canStart ? "Find Route" : sameEndpoint ? "Choose a different place" : hasFrom ? "Choose a destination" : "Choose starting point"}</button>
        </div> : previewPhase ? <div className="flex gap-2">
          {emergencyRouteOverview && emergencyRoutes.length > 1 ? <>
            <button type="button" onClick={onEditRoute} className="min-h-11 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Edit Route</button>
            <button type="button" onClick={onClear} aria-label="Close Preview" title="Close Preview" className="min-h-11 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Close Preview</button>
          </> : <>
            <button type="button" onClick={onEditRoute} className="min-h-11 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Edit Route</button>
            <button type="button" onClick={onStartNavigation} disabled={emergencyPreviewNeedsReview} aria-describedby={emergencyPreviewNeedsReview ? "emergency-route-status" : undefined} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"><Navigation className="h-3.5 w-3.5" />{mode === "emergency" ? "Start" : "Start Navigation"}</button>
            <button type="button" onClick={onClear} aria-label="Close Preview" title="Close Preview" className="min-h-11 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Close Preview</button>
          </>}
        </div> : navigatingPhase ? <div className="flex gap-2">
          <button type="button" onClick={onEndNavigation} className="min-h-11 flex-1 rounded-xl border border-destructive/30 text-[11px] font-extrabold text-destructive hover:bg-destructive/5">End Navigation</button>
        </div> : null}
      </footer>}
    </motion.div>
  );
}
