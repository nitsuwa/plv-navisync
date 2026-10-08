import { Accessibility, ArrowLeft, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, List, MapPin, Navigation, Pause, Play, Route as RouteIcon, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { SearchResult } from "../../hooks/useCampusSearch";
import { searchDestinationResults, type DestinationFilter } from "../../lib/destinationSearch";
import type { CampusPlaceDest, RoomDest } from "../../lib/combinedPathfinding";
import type { PlannedRoute, RouteMode, StandardRoutePreference } from "../../lib/routePlanner";
import { studentFacingRouteSteps, studentRouteFacts, type StudentCameraMode, type StudentRoutePhase } from "../../lib/studentRouteFlow";
import type { Building } from "../../types";
import { useEscToClose } from "../../hooks/useEscToClose";
import { cn } from "../../lib/utils";
import { CampusDestinationSearch } from "./CampusDestinationSearch";
import { RouteErrorState } from "./RouteErrorState";

export type RoutePlannerEndpoint = "start" | "destination";

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
  playbackPaused?: boolean;
  transitionBusy?: boolean;
  transitionAwaitingAction?: boolean;
  playbackSpeed?: 1 | 1.5 | 2;
  onPlaybackSpeedChange?: (speed: 1 | 1.5 | 2) => void;
  currentStepIndex?: number;
  navigationSteps?: readonly string[];
  onStartNavigation?: () => void;
  onEditRoute?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onPreviousStep?: () => void;
  onNextStep?: () => void;
  onEndNavigation?: () => void;
  onDone?: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  routeAttempted?: boolean;
  onClose: () => void;
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

const ROUTE_PLANNER_MIN_HEIGHT = 96;
const ROUTE_PLANNER_DEFAULT_HEIGHT = 374;
const ROUTE_PLANNER_MAX_HEIGHT = 760;
const MOBILE_SHEET_HEIGHTS = { collapsed: 140, normal: ROUTE_PLANNER_DEFAULT_HEIGHT } as const;

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
  from, to, fromCampusPlace = null, toCampusPlace = null, onFromChange, onToChange, mode, onModeChange, route, onClose, headerUtility, onClear, onFindRoute,
  youAreHere, youAreHereLabel, useMyLocation, onUseMyLocationChange, fromRoom = null, toRoom = null, roomOptions = [],
  onSwapEndpoints, destinationResults = [], onSelectFromDestination, onSelectToDestination,
  activeEndpoint: controlledEndpoint, onActiveEndpointChange,
  standardPreference = "best", onStandardPreferenceChange,
  mapSelectionEndpoint = null, mapSelectionCandidateLabel = null, onChooseOnMap, onConfirmMapSelection, onClearMapSelectionCandidate, selectionError = null,
  suspendedForBuilding = false, suspendedForFloorPicker = false,
  phase = "planning", cameraMode = "follow", onCameraModeChange, collapsed = false, playbackPaused = true, transitionBusy = false, transitionAwaitingAction = false,
  currentStepIndex = 0, navigationSteps = [], playbackSpeed = 1, onPlaybackSpeedChange, onStartNavigation, onEditRoute,
  onPause, onResume, onPreviousStep, onNextStep,
  onEndNavigation, onDone, onCollapse, onExpand, routeAttempted = false,
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
  useEscToClose(onClose, !isSuspendedForBuilding);
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
  const [failedRouteAttempt, setFailedRouteAttempt] = useState(false);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [mobileSheetState, setMobileSheetState] = useState<"collapsed" | "normal" | "expanded">("normal");
  const floorPickerRestoreRef = useRef<{ sheetState: "collapsed" | "normal" | "expanded"; panelHeight: number | null } | null>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const reducedMotion = useReducedMotion();

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
    if (mobileSheetState === "collapsed") return MOBILE_SHEET_HEIGHTS.collapsed;
    if (mobileSheetState === "expanded") return Math.min(ROUTE_PLANNER_MAX_HEIGHT, (typeof window !== "undefined" ? (window.visualViewport?.height || window.innerHeight) : 768) - 32);
    return panelHeight ?? ROUTE_PLANNER_DEFAULT_HEIGHT;
  };
  const resizeBounds = panelHeightBounds();

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = { y: event.clientY, height: currentPanelHeight() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    setPanelHeight(clampPanelHeight(start.height + start.y - event.clientY));
  };

  const handleResizePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const height = currentPanelHeight();
    resizeStartRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (height < 250) setMobileSheetState("collapsed");
    else if (height > 560) setMobileSheetState("expanded");
    else setMobileSheetState("normal");
    setPanelHeight(null);
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = currentPanelHeight();
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMobileSheetState(current < 250 ? "normal" : "expanded");
      setPanelHeight(null);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setMobileSheetState(current > 560 ? "normal" : "collapsed");
      setPanelHeight(null);
    } else if (event.key === "Home") {
      event.preventDefault();
      setMobileSheetState("collapsed");
      setPanelHeight(null);
    } else if (event.key === "End") {
      event.preventDefault();
      setMobileSheetState("expanded");
      setPanelHeight(null);
    }
  };

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && document.contains(previous)) previous.focus(); };
  }, []);

  useEffect(() => {
    const nextSheetState = mapSelectionEndpoint || (isMobileViewport && (phase === "preview" || phase === "navigating")) ? "collapsed" : "normal";
    setMobileSheetState((current) => current === nextSheetState ? current : nextSheetState);
    setPanelHeight((current) => current === null ? current : null);
    if (phase === "navigating") setShowAllSteps(false);
  }, [mapSelectionEndpoint, isMobileViewport, phase]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (suspendedForFloorPicker) {
      if (!floorPickerRestoreRef.current) {
        floorPickerRestoreRef.current = { sheetState: mobileSheetState, panelHeight };
        setMobileSheetState("collapsed");
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
    setMobileSheetState((current) => current === "normal" ? current : "normal");
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
    setMobileSheetState("collapsed");
    setActiveEndpoint(null);
    onChooseOnMap?.(endpoint);
  };
  const handleCancelMapSelection = () => {
    setMobileSheetState("normal");
    onChooseOnMap?.(null);
  };
  const swapEndpoints = () => {
    if (onSwapEndpoints) onSwapEndpoints();
    else { onFromChange(to); onToChange(from); }
  };
  const previewPhase = phase === "preview";
  const navigatingPhase = phase === "navigating";
  const floorPickerSuspended = isMobileViewport && suspendedForFloorPicker;
  const preferenceLabel = mode === "standard"
    ? standardPreference === "stairs" ? "Prefer stairs" : standardPreference === "elevator" ? "Prefer elevator" : "Best route"
    : MODES.find((item) => item.key === mode)?.label ?? "Route";
  const nextPlaybackSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
  const speedControl = (compact = false) => <button type="button" data-testid="route-playback-speed" title="Change playback speed" aria-label={`Playback speed ${playbackSpeed} times. Change speed`} onClick={() => onPlaybackSpeedChange?.(nextPlaybackSpeed)} className={cn("shrink-0 rounded-xl border border-border bg-card px-2 font-extrabold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", compact ? "h-10 min-w-11 text-[10px]" : "min-h-11 min-w-14 text-xs")}>{playbackSpeed}×</button>;
  const compactNavigation = navigatingPhase && (isMobileViewport ? mobileSheetState === "collapsed" : collapsed);
  const compactMobileHeight = floorPickerSuspended ? MOBILE_SHEET_HEIGHTS.collapsed
    : mapSelectionEndpoint ? (mapSelectionCandidateLabel ? 196 : 148)
      : navigatingPhase ? 224
        : previewPhase ? 208
          : MOBILE_SHEET_HEIGHTS.collapsed;
  const canShowMainForm = !floorPickerSuspended && activeEndpoint === null && !mapSelectionEndpoint
    && !(isMobileViewport && mobileSheetState === "collapsed") && !compactNavigation;
  const arrivedPhase = phase === "arrived";
  const phaseTitle = phase === "planning" ? "Plan your route"
    : previewPhase ? "Route preview"
      : arrivedPhase ? "You've arrived"
        : cameraMode === "explore" ? "Explore route" : "Guided navigation";
  const routeFacts = route ? studentRouteFacts(route, standardPreference) : [];
  const normalizedSteps = route ? studentFacingRouteSteps(route).map((step) => step.instruction) : [];
  const visibleNavigationSteps = navigationSteps.length > 0 ? navigationSteps : normalizedSteps;
  const safeStepIndex = Math.max(0, Math.min(currentStepIndex, Math.max(0, visibleNavigationSteps.length - 1)));
  const currentInstruction = visibleNavigationSteps[safeStepIndex] ?? "Follow the route to your destination.";
  const activeDestinationName = route?.emergencyDestinationLabel ?? toDisplay.label;
  const exploreMode = cameraMode === "explore";
  useEffect(() => {
    if (!showAllSteps) return;
    const list = stepListRef.current;
    const row = stepRowRefs.current.get(safeStepIndex);
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const top = rowRect.top - listRect.top + list.scrollTop;
    const bottom = top + rowRect.height;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [safeStepIndex, showAllSteps]);
  /** Obvious FOLLOW | EXPLORE segmented control with a clearly active state. */
  const cameraModeSegmented = (testid: string) => (
    <div role="group" aria-label="Route camera mode" data-testid={testid}
      className="flex shrink-0 items-center rounded-full border border-primary/20 bg-card p-0.5">
      <button type="button" aria-label={exploreMode ? "Return to Follow mode" : "Switch to Follow mode"} aria-pressed={!exploreMode}
        onClick={() => onCameraModeChange?.("follow")}
        className={cn("min-h-8 rounded-full px-2.5 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          !exploreMode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>FOLLOW</button>
      <button type="button" aria-label="Switch to Explore mode" aria-pressed={exploreMode}
        onClick={() => onCameraModeChange?.("explore")}
        className={cn("min-h-8 rounded-full px-2.5 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
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
            ? `${MOBILE_SHEET_HEIGHTS.collapsed}px`
          : mapSelectionEndpoint
            ? `${compactMobileHeight}px`
          : activeEndpoint
            ? "min(82dvh, var(--student-map-mobile-panel-max-height, calc(100dvh - 10rem - env(safe-area-inset-bottom, 0px))))"
          : mobileSheetState === "collapsed"
            ? `${compactMobileHeight}px`
            : mobileSheetState === "expanded" || (phase !== "planning" && mobileSheetState === "normal")
                  ? "min(82dvh, var(--student-map-mobile-panel-max-height, calc(100dvh - 10rem - env(safe-area-inset-bottom, 0px))))"
                  : phase === "planning" && panelHeight === null ? "fit-content" : `${panelHeight ?? ROUTE_PLANNER_DEFAULT_HEIGHT}px`,
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

      <header className={cn("shrink-0 border-b border-border/60 bg-card/95 backdrop-blur-xl", mapSelectionEndpoint ? "px-3 py-1" : (activeEndpoint || (isMobileViewport && mobileSheetState === "collapsed")) ? "px-3 pb-1 pt-1 xl:px-4 xl:pb-3 xl:pt-3" : "px-3.5 pb-1.5 pt-1.5 md:px-4 md:pb-3 md:pt-3")}>
        <div
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
        </div>
        <div className="flex items-center gap-2.5">
          {mapSelectionEndpoint ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><MapPin className="h-4 w-4" /></span>
          ) : activeEndpoint ? (
            <button type="button" onClick={closeSearch} aria-label="Back to route planner" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 xl:h-9 xl:w-9"><ArrowLeft className="h-3.5 w-3.5 xl:h-4 xl:w-4" /></button>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Navigation className="h-4 w-4" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("font-extrabold leading-tight", (activeEndpoint || mapSelectionEndpoint) ? "text-xs xl:text-[15px]" : "text-[15px]")}>{mapSelectionEndpoint ? `Choose ${mapSelectionEndpoint === "start" ? "start" : "destination"} on map` : activeEndpoint ? searchTitle : phaseTitle}</p>
            <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground md:block">{mapSelectionEndpoint ? "Tap a building or place; enter a building to choose a room" : activeEndpoint ? "Search buildings, rooms, and offices" : phase === "planning" ? "Choose a start, destination, and route preference" : `${fromDisplay.label} → ${activeDestinationName}`}</p>
          </div>
          {headerUtility}
          {mapSelectionEndpoint ? (
            <button type="button" onClick={handleCancelMapSelection} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-extrabold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Cancel</button>
          ) : activeEndpoint ? (
            <button type="button" onClick={onClose} aria-label="Close directions" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
          ) : compactNavigation || (isMobileViewport && mobileSheetState === "collapsed") ? (
            <button type="button" onClick={() => { setMobileSheetState("normal"); onExpand?.(); }} aria-label={navigatingPhase ? "Expand navigation panel" : "Expand route panel"} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-extrabold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Expand</button>
          ) : phase !== "planning" && !activeEndpoint && !mapSelectionEndpoint ? (
            <button type="button" onClick={onCollapse} aria-label={navigatingPhase ? "Collapse navigation panel" : "Collapse route preview"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ChevronDown className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={onClose} aria-label="Cancel route planning" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
          )}
        </div>
      </header>

      {floorPickerSuspended ? (
        <div data-testid="route-planner-floor-picker-suspended" className="flex min-h-0 flex-1 items-center px-3 pb-2 text-[11px] font-semibold text-muted-foreground">
          Floor selection is open
        </div>
      ) : <AnimatePresence mode="wait" initial={false}>
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
            <button type="button" onClick={chooseOnMap} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] px-3 text-xs font-extrabold text-primary transition-colors hover:border-primary/55 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-10 md:self-start">
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
        ) : compactNavigation || (isMobileViewport && mobileSheetState === "collapsed") ? (
          previewPhase && route ? (
            <div data-testid="mobile-route-preview-collapsed-summary" className="flex min-h-0 flex-1 flex-col justify-center gap-1 px-3 pb-2">
              <p className="truncate text-[9px] font-extrabold uppercase tracking-wider text-primary">Route Preview · Explore</p>
              <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-extrabold">{fromDisplay.label} → {activeDestinationName}</p><p className="text-[10px] text-muted-foreground">{preferenceLabel}</p></div>
              <button type="button" onClick={onStartNavigation} className="min-h-10 shrink-0 rounded-xl bg-primary px-3 text-[11px] font-extrabold text-primary-foreground">Start Navigation</button>
            </div>
          ) : navigatingPhase && route ? (
            <div data-testid={isMobileViewport ? "mobile-route-collapsed-summary" : "desktop-route-collapsed-summary"} className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-3 pb-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-extrabold">Step {safeStepIndex + 1} of {Math.max(1, visibleNavigationSteps.length)} · {activeDestinationName}</p>
                  <p data-testid="compact-current-route-instruction" className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{currentInstruction}</p>
                </div>
                {cameraModeSegmented("compact-camera-mode")}
              </div>
              <div className="flex items-center gap-1.5">
                {exploreMode ? (
                  <>
                    <button type="button" onClick={onPreviousStep} disabled={transitionBusy || safeStepIndex <= 0} className="min-h-10 flex-1 rounded-xl border border-border px-2 text-[10px] font-extrabold text-foreground disabled:opacity-40">Previous</button>
                    <button type="button" onClick={onNextStep} disabled={transitionBusy || safeStepIndex >= visibleNavigationSteps.length - 1} className="min-h-10 flex-1 rounded-xl border border-border px-2 text-[10px] font-extrabold text-foreground disabled:opacity-40">Next</button>
                    <button type="button" onClick={() => onCameraModeChange?.("follow")} aria-label="Return to Follow" className="min-h-10 flex-1 rounded-xl bg-primary px-2 text-[10px] font-extrabold text-primary-foreground">Return to Follow</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={onPreviousStep} disabled={transitionBusy || safeStepIndex <= 0} aria-label="Previous step" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" onClick={playbackPaused ? onResume : onPause} disabled={transitionBusy || (playbackPaused && transitionAwaitingAction)} aria-label={playbackPaused && transitionAwaitingAction ? "Tap the highlighted transition marker to continue" : playbackPaused ? "Resume navigation" : "Pause navigation"} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-[10px] font-extrabold text-primary-foreground disabled:opacity-45">{playbackPaused && transitionAwaitingAction ? "Tap marker" : playbackPaused ? <><Play className="h-3.5 w-3.5" />Resume</> : <><Pause className="h-3.5 w-3.5" />Pause</>}</button>
                    <button type="button" onClick={onNextStep} disabled={transitionBusy || safeStepIndex >= visibleNavigationSteps.length - 1} aria-label="Next step" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                    {speedControl(true)}
                  </>
                )}
              </div>
            </div>
          ) : null
        ) : (
          <motion.div
            key="route-planner-main"
            data-testid="route-planner-scroll-region"
            className={cn("min-h-0 flex-1 overscroll-contain px-3.5 py-1 md:max-h-[calc(100dvh-14rem)] md:px-4 md:py-4",
              navigatingPhase ? "flex flex-col overflow-hidden" : "space-y-1 overflow-y-auto md:flex-none md:space-y-3",
              isMobileViewport && phase === "planning" && !activeEndpoint && !mapSelectionEndpoint && mobileSheetState !== "expanded" && "hide-scrollbar-mobile")}
            style={isMobileViewport && phase === "planning" && !activeEndpoint && !mapSelectionEndpoint && mobileSheetState !== "expanded"
              ? { flex: "0 1 auto", maxHeight: "max(0px, calc(var(--student-map-mobile-panel-max-height, 60dvh) - 8rem))" }
              : undefined}
            initial={reducedMotion ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.19, ease: "easeOut" }}
          >
            {previewPhase && route ? (
              <div data-testid="route-summary" className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.055] p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground"><RouteIcon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-primary">{mode === "emergency" ? "Emergency route" : `${MODES.find((item) => item.key === mode)?.label} route`}</p><p className="truncate text-[13px] font-extrabold text-foreground">{fromDisplay.label} → {toDisplay.label}</p></div>
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                </div>
                <div data-testid="route-facts" className="flex flex-wrap gap-1.5">{routeFacts.map((fact) => <span key={fact} className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{fact}</span>)}</div>
                <div className="rounded-xl border border-border/70 bg-card/80 px-3 py-2.5">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Route highlights</p>
                  <ol className="mt-1.5 space-y-1">{normalizedSteps.map((instruction, index) => <li key={`${index}-${instruction}`} className="flex gap-2 text-[11px] leading-snug text-foreground"><span className="font-black text-primary">{index + 1}</span><span>{instruction}</span></li>)}</ol>
                </div>
              </div>
            ) : navigatingPhase && route ? (
              <div data-testid="guided-navigation-summary" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="shrink-0 rounded-2xl border border-primary/20 bg-primary/[0.055] p-3">
                  <div className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Navigation className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-extrabold uppercase tracking-wider text-primary">Step {safeStepIndex + 1} of {Math.max(1, visibleNavigationSteps.length)}</p><p data-testid="guided-destination" className="truncate text-[13px] font-extrabold">{activeDestinationName}</p></div>{cameraModeSegmented("camera-mode")}</div>
                  <p data-testid="current-route-instruction" role="status" aria-live="polite" className="mt-3 text-[14px] font-bold leading-snug text-foreground">{currentInstruction}</p>
                  {visibleNavigationSteps[safeStepIndex + 1] && <p className="mt-2 text-[11px] text-muted-foreground">Next: {visibleNavigationSteps[safeStepIndex + 1]}</p>}
                </div>
                {exploreMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={onPreviousStep} disabled={transitionBusy || safeStepIndex <= 0} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Previous</button>
                      <button type="button" onClick={onNextStep} disabled={transitionBusy || safeStepIndex >= visibleNavigationSteps.length - 1} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Next</button>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onCameraModeChange?.("follow")} aria-label="Return to Follow" className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary text-[11px] font-extrabold text-primary-foreground">Return to Follow</button>
                      <button type="button" onClick={() => setShowAllSteps((open) => !open)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-[11px] font-extrabold"><List className="h-3.5 w-3.5" />{showAllSteps ? "Hide steps" : "Steps"}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      <button type="button" onClick={onPreviousStep} disabled={transitionBusy || safeStepIndex <= 0} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Previous</button>
                      <button type="button" onClick={playbackPaused ? onResume : onPause} disabled={transitionBusy || (playbackPaused && transitionAwaitingAction)} aria-label={playbackPaused && transitionAwaitingAction ? "Tap the highlighted transition marker to continue" : playbackPaused ? "Resume navigation" : "Pause navigation"} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-[11px] font-extrabold text-primary-foreground disabled:opacity-45">{playbackPaused && transitionAwaitingAction ? "Tap marker" : playbackPaused ? <><Play className="h-3.5 w-3.5" />Resume</> : <><Pause className="h-3.5 w-3.5" />Pause</>}</button>
                      <button type="button" onClick={onNextStep} disabled={transitionBusy || safeStepIndex >= visibleNavigationSteps.length - 1} className="min-h-11 rounded-xl border border-border text-[11px] font-extrabold disabled:opacity-40">Next</button>
                      {speedControl()}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowAllSteps((open) => !open)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-[11px] font-extrabold"><List className="h-3.5 w-3.5" />{showAllSteps ? "Hide steps" : "Steps"}</button>
                    </div>
                  </>
                )}
                {showAllSteps && <ol ref={stepListRef} data-testid="guided-route-steps" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border/70 p-2">{visibleNavigationSteps.map((step, index) => <li ref={(node) => { if (node) stepRowRefs.current.set(index, node); else stepRowRefs.current.delete(index); }} key={`${index}-${step}`} aria-current={index === safeStepIndex ? "step" : undefined} data-testid={index === safeStepIndex ? "guided-active-step" : undefined} className={cn("rounded-lg px-2 py-1.5 text-[11px]", index === safeStepIndex ? "bg-primary/10 font-bold text-foreground" : "text-muted-foreground")}>{index + 1}. {step}</li>)}</ol>}
              </div>
            ) : arrivedPhase ? (
              <div data-testid="route-arrival-state" className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-center"><span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-6 w-6" /></span><p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">You've arrived</p><p className="mt-1 text-lg font-extrabold">{activeDestinationName}</p><div className="mt-4 flex w-full gap-2"><button type="button" onClick={onDone} className="min-h-11 flex-1 rounded-xl border border-border text-[11px] font-extrabold">Done</button><button type="button" onClick={onStartNavigation} className="min-h-11 flex-1 rounded-xl bg-primary text-[11px] font-extrabold text-primary-foreground">Restart Route</button></div></div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="group" aria-label="Route modes">
                  {MODES.map(({ key, label, icon }) => (
                    <button key={key} type="button" onClick={() => onModeChange(key)} aria-label={`${label} routing`} aria-pressed={mode === key} className={cn("flex min-h-11 items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", mode === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground", mode === key && key === "accessible" && "bg-emerald-700", mode === key && key === "emergency" && "bg-rose-700")}>
                      {icon}<span>{label}</span>
                    </button>
                  ))}
                </div>
                {mode === "accessible" && <p data-testid="accessible-route-note" className="rounded-lg bg-emerald-700/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-emerald-800 dark:text-emerald-200">Accessible route · Uses ramps and elevators where the authored path supports them.</p>}
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
                {canSwapEndpoints && (
                  <div data-testid="route-planner-swap-row" className="flex h-10 shrink-0 items-center justify-center">
                    <button type="button" onClick={swapEndpoints} disabled={sameEndpoint} aria-label="Swap start and destination" title="Swap start and destination" className="flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-muted/50 text-muted-foreground transition-[transform,background-color,color,border-color] duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"><ArrowUpDown className="h-4 w-4" /></button>
                  </div>
                )}
                {isEmergency ? (
                  <div data-testid="emergency-destination" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-3 py-2.5"><p className="text-[10px] font-extrabold text-rose-700 dark:text-rose-300">Automatic evacuation destination</p><p className="mt-0.5 truncate text-[12px] font-bold">{toDisplay.label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Uses valid emergency exits and excludes elevators.</p>{selectionError && <p role="status" className="mt-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300">{selectionError}</p>}</div>
                ) : (
                  <EndpointCard purpose="destination" building={to} campusPlace={toCampusPlace} room={toRoom} useMyLocation={false} onChange={() => openSearch("destination")} compact={isMobileViewport} />
                )}
                {sameEndpoint && <p role="alert" data-testid="same-route-endpoint-error" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">Choose two different places for your route.</p>}
                {(routeAttempted || failedRouteAttempt) && bothSet && !sameEndpoint && !route && <RouteErrorState fromCode={fromDisplay.label} toCode={toDisplay.label} mode={mode} onSwitchMode={onModeChange} />}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>}

      {canShowMainForm && <footer className="shrink-0 border-t border-border/60 bg-card/95 px-3.5 pb-2.5 pt-2.5 backdrop-blur-xl md:px-4 md:pb-3">
        {phase === "planning" ? <div className="flex gap-2">
        <button type="button" onClick={onClear} className="min-h-11 rounded-xl border border-border px-3 text-[12px] font-extrabold text-muted-foreground transition-colors hover:bg-muted">Clear</button>
          <button type="button" onClick={findRoute} disabled={!canStart} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground shadow-sm transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"><Navigation className="h-3.5 w-3.5" />{canStart ? "Find Route" : sameEndpoint ? "Choose a different place" : hasFrom ? "Choose a destination" : "Choose starting point"}</button>
        </div> : previewPhase ? <div className="flex gap-2">
          <button type="button" onClick={onEditRoute} className="min-h-11 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Edit Route</button>
          <button type="button" onClick={onStartNavigation} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground"><Navigation className="h-3.5 w-3.5" />Start Navigation</button>
          <button type="button" onClick={onClear} aria-label="Clear route" title="Clear route" className="min-h-11 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Clear</button>
        </div> : navigatingPhase ? <div className="flex gap-2">
          <button type="button" onClick={onEndNavigation} className="min-h-11 flex-1 rounded-xl border border-destructive/30 text-[11px] font-extrabold text-destructive hover:bg-destructive/5">End Navigation</button>
        </div> : null}
      </footer>}
    </motion.div>
  );
}
