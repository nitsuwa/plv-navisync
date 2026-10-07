import { Accessibility, ArrowLeft, ArrowUpDown, Check, Compass, MapPin, Navigation, Route as RouteIcon, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { SearchResult } from "../../hooks/useCampusSearch";
import { searchDestinationResults, type DestinationFilter } from "../../lib/destinationSearch";
import type { CampusPlaceDest, RoomDest } from "../../lib/combinedPathfinding";
import type { PlannedRoute, RouteMode, StandardRoutePreference } from "../../lib/routePlanner";
import { formatDistance, formatMinutes } from "../../lib/routePlanner";
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
  onClose: () => void;
  onClear: () => void;
  onFindRoute: () => void;
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
  onChooseOnMap?: (endpoint: RoutePlannerEndpoint | null) => void;
  selectionError?: string | null;
  /** Keep the planner mounted while a selected building is foregrounded on small screens. */
  suspendedForBuilding?: boolean;
}

const MODES: Array<{ key: RouteMode; label: string; icon: ReactNode }> = [
  { key: "standard", label: "Standard", icon: <Compass className="h-3.5 w-3.5" /> },
  { key: "accessible", label: "Accessible", icon: <Accessibility className="h-3.5 w-3.5" /> },
  { key: "emergency", label: "SOS", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
];

const ROUTE_PLANNER_MIN_HEIGHT = 96;
const ROUTE_PLANNER_DEFAULT_HEIGHT = 420;
const ROUTE_PLANNER_MAX_HEIGHT = 760;
const MOBILE_SHEET_HEIGHTS = { collapsed: 96, normal: ROUTE_PLANNER_DEFAULT_HEIGHT } as const;

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
      "flex items-center gap-2.5 rounded-2xl border transition-colors",
      compact ? "min-h-[52px] px-2.5 py-1.5" : "min-h-[62px] px-3 py-2.5",
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
  from, to, fromCampusPlace = null, toCampusPlace = null, onFromChange, onToChange, mode, onModeChange, route, onClose, onClear, onFindRoute,
  youAreHere, youAreHereLabel, useMyLocation, onUseMyLocationChange, fromRoom = null, toRoom = null, roomOptions = [],
  onSwapEndpoints, destinationResults = [], onSelectFromDestination, onSelectToDestination,
  activeEndpoint: controlledEndpoint, onActiveEndpointChange,
  standardPreference = "best", onStandardPreferenceChange,
  mapSelectionEndpoint = null, onChooseOnMap, selectionError = null,
  suspendedForBuilding = false,
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
  const [editingRoute, setEditingRoute] = useState(false);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [mobileSheetState, setMobileSheetState] = useState<"collapsed" | "normal" | "expanded">("normal");
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const reducedMotion = useReducedMotion();

  const panelHeightBounds = () => {
    const viewportHeight = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 768;
    const parentHeight = dialogRef.current?.parentElement?.getBoundingClientRect().height ?? 0;
    const availableHeight = Math.min(
      ROUTE_PLANNER_MAX_HEIGHT,
      viewportHeight - 104,
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
    if (mobileSheetState === "expanded") return Math.min(ROUTE_PLANNER_MAX_HEIGHT, (typeof window !== "undefined" ? window.innerHeight : 768) - 32);
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
    setMobileSheetState(mapSelectionEndpoint ? "collapsed" : "normal");
    setPanelHeight(null);
  }, [mapSelectionEndpoint]);

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
  const canStart = Boolean(bothSet && !sameEndpoint && route);
  const canSwapEndpoints = Boolean(bothSet && !isEmergency && !sameEndpoint && !(useMyLocation && youAreHere));
  const fromDisplay = endpointText("start", from, fromCampusPlace, fromRoom, useMyLocation, youAreHere, youAreHereLabel);
  const toDisplay = isEmergency
    ? { label: route?.emergencyDestinationLabel ?? "Safe evacuation exit", context: "Selected automatically from emergency paths" }
    : endpointText("destination", to, toCampusPlace, toRoom, false, null);
  const searchTitle = activeEndpoint === "start" ? "Choose starting point" : "Choose destination";
  const endpointResults = useMemo(
    () => searchDestinationResults(destinationResults, query, filter),
    [destinationResults, filter, query],
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
    setMobileSheetState("normal");
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
  const canShowMainForm = activeEndpoint === null && !mapSelectionEndpoint && !(isMobileViewport && mobileSheetState === "collapsed");
  const selectionDisabledReason = (result: SearchResult) => {
    const oppositeEndpointKey = activeEndpoint === "start" ? toKey : fromKey;
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
      data-search-open={activeEndpoint ? "true" : "false"}
      data-map-picking={mapSelectionEndpoint ? "true" : "false"}
      data-mobile-sheet-state={isMobileViewport ? mobileSheetState : undefined}
      className="route-planner-dialog pointer-events-auto fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-50 flex h-[420px] max-h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden rounded-[24px] border border-border/70 bg-card text-foreground shadow-[0_-16px_42px_rgba(15,23,42,0.18)] outline-none md:relative md:inset-auto md:h-fit md:max-h-[calc(100dvh-1.5rem)] md:w-full md:rounded-3xl md:shadow-2xl"
      style={{
        paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))",
        ...(isMobileViewport ? {
          height: mapSelectionEndpoint
            ? "96px"
            : activeEndpoint
              ? "min(82dvh, calc(100dvh - 2rem - env(safe-area-inset-bottom, 0px)))"
              : mobileSheetState === "collapsed"
                ? `${MOBILE_SHEET_HEIGHTS.collapsed}px`
                : mobileSheetState === "expanded"
                  ? "min(82dvh, calc(100dvh - 2rem - env(safe-area-inset-bottom, 0px)))"
                  : `${panelHeight ?? ROUTE_PLANNER_DEFAULT_HEIGHT}px`,
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

      <header className={cn("shrink-0 border-b border-border/60 bg-card/95 backdrop-blur-xl", (activeEndpoint || mapSelectionEndpoint || (isMobileViewport && mobileSheetState === "collapsed")) ? "px-3 pb-1 pt-1 xl:px-4 xl:pb-3 xl:pt-3" : "px-3.5 pb-2.5 pt-2.5 md:px-4 md:pb-3 md:pt-3")}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Resize route planner"
          aria-orientation="vertical"
          aria-valuemin={ROUTE_PLANNER_MIN_HEIGHT}
          aria-valuemax={resizeBounds.max}
          aria-valuenow={currentPanelHeight()}
          data-testid="route-planner-resize-handle"
          className="mx-auto flex h-7 w-full touch-none cursor-row-resize items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:h-11"
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
            <p className={cn("font-extrabold leading-tight", (activeEndpoint || mapSelectionEndpoint) ? "text-xs xl:text-[15px]" : "text-[15px]")}>{mapSelectionEndpoint ? `Choose ${mapSelectionEndpoint === "start" ? "start" : "destination"} on map` : activeEndpoint ? searchTitle : "Route Planner"}</p>
            <p className={cn("mt-0.5 truncate text-[11px] text-muted-foreground", (activeEndpoint || mapSelectionEndpoint) && "hidden xl:block")}>{mapSelectionEndpoint ? "Tap a building or place; enter a building to choose a room" : activeEndpoint ? "Search buildings, rooms, and offices" : "Choose your start and destination"}</p>
          </div>
          {mapSelectionEndpoint ? (
            <button type="button" onClick={handleCancelMapSelection} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-extrabold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Cancel</button>
          ) : activeEndpoint ? (
            <button type="button" onClick={onClose} aria-label="Close directions" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
          ) : isMobileViewport && mobileSheetState === "collapsed" ? (
            <button type="button" onClick={() => setMobileSheetState("normal")} aria-label="Expand route planner" className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-extrabold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Expand</button>
          ) : (
            <button type="button" onClick={onClose} aria-label="Close directions" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {mapSelectionEndpoint ? (
          <motion.div
            key="route-planner-map-pick-hint"
            data-testid="route-planner-map-pick-hint"
            className="flex min-h-0 flex-1 flex-col justify-center px-4 py-2"
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: "easeOut" }}
          >
            <p role="status" aria-live="polite" className="text-center text-xs font-bold text-muted-foreground">Tap a building or campus place, or enter a building to choose a room.</p>
            {selectionError && <p role="alert" className="mt-1 text-center text-xs font-bold text-destructive">{selectionError}</p>}
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
            <button type="button" onClick={chooseOnMap} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-muted/60 px-3 text-xs font-extrabold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
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
              compact
              fillResults
              embedded
              getDisabledReason={selectionDisabledReason}
              listId={activeEndpoint === "start" ? "route-start-destination-results" : "route-destination-results"}
              groupByBuilding
              dense
            />
          </motion.div>
        ) : isMobileViewport && mobileSheetState === "collapsed" ? null : (
          <motion.div
            key="route-planner-main"
            data-testid="route-planner-scroll-region"
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain md:max-h-[calc(100dvh-14rem)] md:flex-none md:space-y-3 md:px-4 md:py-4",
              isMobileViewport ? "space-y-1.5 px-3 py-2" : "space-y-2.5 px-3.5 py-3",
            )}
            initial={reducedMotion ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.19, ease: "easeOut" }}
          >
            {route && !editingRoute ? (
              <div data-testid="route-summary" className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground"><RouteIcon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-primary">{mode === "emergency" ? "Emergency route" : `${MODES.find((item) => item.key === mode)?.label} route`}</p><p className="truncate text-[13px] font-extrabold text-foreground">{fromDisplay.label} → {toDisplay.label}</p></div>
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                </div>
                <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="rounded-lg bg-card/80 px-2 py-1 font-bold">{formatDistance(route.dist)}</span><span className="rounded-lg bg-card/80 px-2 py-1 font-bold">{formatMinutes(route.mins)}</span><span className="min-w-0 flex-1 truncate">{mode === "accessible" ? "Uses accessible paths where available" : mode === "emergency" ? "Uses valid emergency exits" : standardPreference === "stairs" ? "Prefers stairs when available" : standardPreference === "elevator" ? "Prefers elevators when available" : "Best available walking route"}</span></div>
              </div>
            ) : (
              <>
                {route && editingRoute && <div className="flex justify-end"><button type="button" onClick={() => setEditingRoute(false)} className="min-h-7 rounded-lg px-2 text-[10px] font-extrabold text-primary hover:bg-primary/10">Done editing route</button></div>}
                <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-muted/60 p-0.5 md:gap-1 md:p-1" role="group" aria-label="Route modes">
                  {MODES.map(({ key, label, icon }) => (
                    <button key={key} type="button" onClick={() => onModeChange(key)} aria-label={`${label} routing`} aria-pressed={mode === key} className={cn("flex min-h-9 items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-11", mode === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground", mode === key && key === "accessible" && "bg-emerald-700", mode === key && key === "emergency" && "bg-rose-700")}>
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
                      <button key={value} type="button" onClick={() => onStandardPreferenceChange?.(value)} aria-pressed={standardPreference === value} className={cn("min-h-9 rounded-lg px-1.5 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-11", standardPreference === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <EndpointCard purpose="start" building={from} campusPlace={fromCampusPlace} room={fromRoom} useMyLocation={useMyLocation} youAreHere={youAreHere} onChange={() => openSearch("start")} compact={isMobileViewport} />
                {canSwapEndpoints && (
                  <div data-testid="route-planner-swap-row" className="flex h-11 items-center justify-center">
                    <button type="button" onClick={swapEndpoints} disabled={sameEndpoint} aria-label="Swap start and destination" title="Swap start and destination" className="flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-muted/50 text-muted-foreground transition-[transform,background-color,color,border-color] duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"><ArrowUpDown className="h-4 w-4" /></button>
                  </div>
                )}
                {isEmergency ? (
                  <div data-testid="emergency-destination" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-3 py-2.5"><p className="text-[10px] font-extrabold text-rose-700 dark:text-rose-300">Automatic evacuation destination</p><p className="mt-0.5 truncate text-[12px] font-bold">{toDisplay.label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Uses valid emergency exits and excludes elevators.</p></div>
                ) : (
                  <EndpointCard purpose="destination" building={to} campusPlace={toCampusPlace} room={toRoom} useMyLocation={false} onChange={() => openSearch("destination")} compact={isMobileViewport} />
                )}
                {sameEndpoint && <p role="alert" data-testid="same-route-endpoint-error" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">Choose two different places for your route.</p>}
                {bothSet && !sameEndpoint && !route && <RouteErrorState fromCode={fromDisplay.label} toCode={toDisplay.label} mode={mode} onSwitchMode={onModeChange} />}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {canShowMainForm && (
        <footer className={cn(
          "shrink-0 border-t border-border/60 bg-card/95 backdrop-blur-xl md:px-4 md:pb-3",
          isMobileViewport ? "px-3 pb-1.5 pt-1.5" : "px-3.5 pb-2.5 pt-2.5",
        )}>
          {route && !editingRoute ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingRoute(true)} className="min-h-11 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Change route</button>
              <button type="button" onClick={onFindRoute} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground shadow-sm hover:brightness-110"><Navigation className="h-3.5 w-3.5" />Start navigation</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingRoute(false); onClear(); }} className="min-h-11 rounded-xl border border-border px-3 text-[12px] font-extrabold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Clear</button>
              <button type="button" onClick={onFindRoute} disabled={!canStart} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground shadow-[0_8px_20px_rgba(14,42,110,0.2)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><Navigation className="h-3.5 w-3.5" />{canStart ? "Find Route" : sameEndpoint ? "Choose a different place" : bothSet ? "Route unavailable" : hasFrom ? "Choose a destination" : "Choose starting point"}</button>
            </div>
          )}
        </footer>
      )}
    </motion.div>
  );
}
