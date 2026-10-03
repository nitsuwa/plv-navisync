import { Accessibility, ArrowLeft, ArrowUpDown, Check, Compass, Navigation, Route as RouteIcon, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SearchResult } from "../../hooks/useCampusSearch";
import { searchDestinationResults, type DestinationFilter } from "../../lib/destinationSearch";
import type { RoomDest } from "../../lib/combinedPathfinding";
import type { PlannedRoute, RouteMode } from "../../lib/routePlanner";
import { formatDistance, formatMinutes } from "../../lib/routePlanner";
import type { Building } from "../../types";
import { useEscToClose } from "../../hooks/useEscToClose";
import { cn } from "../../lib/utils";
import { CampusDestinationSearch } from "./CampusDestinationSearch";
import { RouteErrorState } from "./RouteErrorState";
import { StudentReportAction } from "./StudentReportAction";

export type RoutePlannerEndpoint = "start" | "destination";

export interface UnifiedRoutePlannerDialogProps {
  from: Building | null;
  to: Building | null;
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
  selectedRoomForPlanner?: RoomDest | null;
  onUseSelectedRoomAsStart?: (room: RoomDest) => void;
  onUseSelectedRoomAsDestination?: (room: RoomDest) => void;
  onReportSelectedRoom?: (room: RoomDest) => void;
  /** Keep the planner mounted while a selected building is foregrounded on small screens. */
  suspendedForBuilding?: boolean;
}

const MODES: Array<{ key: RouteMode; label: string; icon: ReactNode }> = [
  { key: "standard", label: "Standard", icon: <Compass className="h-3.5 w-3.5" /> },
  { key: "accessible", label: "Accessible", icon: <Accessibility className="h-3.5 w-3.5" /> },
  { key: "emergency", label: "SOS", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
];

function endpointText(
  purpose: RoutePlannerEndpoint,
  building: Building | null,
  room: RoomDest | null | undefined,
  useMyLocation: boolean,
  youAreHere: { x: number; y: number } | null | undefined,
  youAreHereLabel?: string | null,
) {
  if (purpose === "start" && useMyLocation && youAreHere) {
    return { label: "You are here", context: youAreHereLabel ?? "Current map location" };
  }
  if (room) return { label: room.roomName, context: `${room.buildingLabel} · ${room.floorLabel ?? `Floor ${room.floorNumber}`}` };
  if (building) return { label: building.name, context: `${building.code} · Building` };
  return { label: purpose === "start" ? "Choose starting point" : "Choose destination", context: "Search buildings, rooms, and offices" };
}

function EndpointCard({
  purpose, building, room, useMyLocation, youAreHere, youAreHereLabel, onChange,
}: {
  purpose: RoutePlannerEndpoint;
  building: Building | null;
  room: RoomDest | null | undefined;
  useMyLocation: boolean;
  youAreHere?: { x: number; y: number } | null;
  youAreHereLabel?: string | null;
  onChange: () => void;
}) {
  const isStart = purpose === "start";
  const text = endpointText(purpose, building, room, useMyLocation, youAreHere, youAreHereLabel);
  const selected = Boolean((isStart && useMyLocation && youAreHere) || room || building);
  return (
    <div data-testid={`route-endpoint-card-${isStart ? "start" : "destination"}`} className={cn(
      "flex min-h-[62px] items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors",
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
  from, to, onFromChange, onToChange, mode, onModeChange, route, onClose, onClear, onFindRoute,
  youAreHere, youAreHereLabel, useMyLocation, onUseMyLocationChange, fromRoom = null, toRoom = null,
  onSwapEndpoints, destinationResults = [], onSelectFromDestination, onSelectToDestination,
  activeEndpoint: controlledEndpoint, onActiveEndpointChange, selectedRoomForPlanner,
  onUseSelectedRoomAsStart, onUseSelectedRoomAsDestination, onReportSelectedRoom,
  suspendedForBuilding = false,
}: UnifiedRoutePlannerDialogProps) {
  const [compactPanelLayout, setCompactPanelLayout] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 1280,
  );
  useEffect(() => {
    const updateLayout = () => setCompactPanelLayout(window.innerWidth < 1280);
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
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && document.contains(previous)) previous.focus(); };
  }, []);

  const hasFrom = Boolean(fromRoom || from || (useMyLocation && youAreHere));
  const isEmergency = mode === "emergency";
  const hasTo = isEmergency || Boolean(toRoom || to);
  const bothSet = hasFrom && hasTo;
  const canStart = Boolean(bothSet && route);
  const fromDisplay = endpointText("start", from, fromRoom, useMyLocation, youAreHere, youAreHereLabel);
  const toDisplay = isEmergency
    ? { label: route?.emergencyDestinationLabel ?? "Safe evacuation exit", context: "Selected automatically from emergency paths" }
    : endpointText("destination", to, toRoom, false, null);
  const selectedSearchRoom = selectedRoomForPlanner;
  const searchTitle = activeEndpoint === "start" ? "Choose starting point" : "Choose destination";
  const endpointResults = useMemo(
    () => searchDestinationResults(destinationResults, query, filter),
    [destinationResults, filter, query],
  );

  const openSearch = (endpoint: RoutePlannerEndpoint) => {
    if (endpoint === "start" && useMyLocation) onUseMyLocationChange(false);
    setQuery("");
    setFilter("all");
    setActiveEndpoint(endpoint);
  };
  const closeSearch = () => {
    setQuery("");
    setActiveEndpoint(null);
  };
  const chooseResult = (result: SearchResult) => {
    if (activeEndpoint === "start") onSelectFromDestination?.(result);
    if (activeEndpoint === "destination") onSelectToDestination?.(result);
    closeSearch();
  };
  const swapEndpoints = () => {
    if (onSwapEndpoints) onSwapEndpoints();
    else { onFromChange(to); onToChange(from); }
  };
  const canShowMainForm = activeEndpoint === null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-label="Route planner"
      aria-describedby="route-planner-description"
      tabIndex={-1}
      data-testid="route-planner-dialog"
      data-map-surface="route-planner"
      data-suspended-for-building={isSuspendedForBuilding ? "true" : "false"}
      data-search-open={activeEndpoint ? "true" : "false"}
      className="route-planner-dialog pointer-events-auto fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-50 flex max-h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden rounded-[24px] border border-border/70 bg-card text-foreground shadow-[0_-16px_42px_rgba(15,23,42,0.18)] outline-none md:relative md:inset-auto md:h-fit md:max-h-[calc(100dvh-1.5rem)] md:w-full md:rounded-3xl md:shadow-2xl"
      style={{
        paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))",
        ...(activeEndpoint ? { height: "min(72dvh, calc(100dvh - 7rem - env(safe-area-inset-bottom, 0px)))" } : {}),
      }}
      onWheelCapture={(event) => event.stopPropagation()}
      onTouchMoveCapture={(event) => event.stopPropagation()}
    >
      <span id="route-planner-description" className="sr-only">Choose a starting point, destination, and travel mode to get walking directions.</span>
      <p role="status" aria-live="polite" aria-atomic="true" data-testid="route-planner-live-status" className="sr-only">
        {route ? `Route ready from ${fromDisplay.label} to ${toDisplay.label}.` : "Choose a starting point and destination to plan a route."}
      </p>

      <header className="shrink-0 border-b border-border/60 bg-card/95 px-3.5 pb-2.5 pt-2.5 backdrop-blur-xl md:px-4 md:pb-3 md:pt-3">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border md:hidden" aria-hidden="true" />
        <div className="flex items-center gap-2.5">
          {activeEndpoint ? (
            <button type="button" onClick={closeSearch} aria-label="Back to route planner" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ArrowLeft className="h-4 w-4" /></button>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Navigation className="h-4 w-4" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold leading-tight">{activeEndpoint ? searchTitle : "Route Planner"}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{activeEndpoint ? "Search buildings, rooms, and offices" : "Choose your start and destination"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close directions" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {activeEndpoint ? (
          <motion.div
            key={`search-${activeEndpoint}`}
            data-testid="route-planner-search-subview"
            className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:p-4"
            initial={reducedMotion ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.19, ease: "easeOut" }}
          >
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
              listId={activeEndpoint === "start" ? "route-start-destination-results" : "route-destination-results"}
              groupByBuilding
            />
            <p className="mt-2 shrink-0 text-[10px] text-muted-foreground">Choose a result to return to your route.</p>
          </motion.div>
        ) : (
          <motion.div
            key="route-planner-main"
            data-testid="route-planner-scroll-region"
            className="min-h-0 flex-none space-y-2.5 overflow-y-auto overscroll-contain px-3.5 py-3 md:max-h-[calc(100dvh-14rem)] md:flex-none md:space-y-3 md:px-4 md:py-4"
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
                <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="rounded-lg bg-card/80 px-2 py-1 font-bold">{formatDistance(route.dist)}</span><span className="rounded-lg bg-card/80 px-2 py-1 font-bold">{formatMinutes(route.mins)}</span><span className="min-w-0 flex-1 truncate">{mode === "accessible" ? "Uses accessible paths where available" : mode === "emergency" ? "Uses valid emergency exits" : "Walking route"}</span></div>
              </div>
            ) : (
              <>
                {route && editingRoute && <div className="flex justify-end"><button type="button" onClick={() => setEditingRoute(false)} className="min-h-7 rounded-lg px-2 text-[10px] font-extrabold text-primary hover:bg-primary/10">Done editing route</button></div>}
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="group" aria-label="Route modes">
                  {MODES.map(({ key, label, icon }) => (
                    <button key={key} type="button" onClick={() => onModeChange(key)} aria-label={`${label} routing`} aria-pressed={mode === key} className={cn("flex min-h-9 items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", mode === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground", mode === key && key === "accessible" && "bg-emerald-700", mode === key && key === "emergency" && "bg-rose-700")}>
                      {icon}<span>{label}</span>
                    </button>
                  ))}
                </div>
                {mode === "accessible" && <p data-testid="accessible-route-note" className="rounded-lg bg-emerald-700/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-emerald-800 dark:text-emerald-200">Accessible route · Uses ramps and elevators where the authored path supports them.</p>}
                <EndpointCard purpose="start" building={from} room={fromRoom} useMyLocation={useMyLocation} youAreHere={youAreHere} onChange={() => openSearch("start")} />
                {!isEmergency && bothSet && (
                  <div data-testid="route-planner-swap-row" className="flex h-9 items-center justify-center">
                    <button type="button" onClick={swapEndpoints} aria-label="Swap start and destination" title="Swap start and destination" className="flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-muted/50 text-muted-foreground transition-[transform,background-color,color,border-color] duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"><ArrowUpDown className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                {isEmergency ? (
                  <div data-testid="emergency-destination" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-3 py-2.5"><p className="text-[10px] font-extrabold text-rose-700 dark:text-rose-300">Automatic evacuation destination</p><p className="mt-0.5 truncate text-[12px] font-bold">{toDisplay.label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Uses valid emergency exits and excludes elevators.</p></div>
                ) : (
                  <EndpointCard purpose="destination" building={to} room={toRoom} useMyLocation={false} onChange={() => openSearch("destination")} />
                )}
                {selectedSearchRoom && (
                  <div data-testid="selected-room-planner-context" className="rounded-xl border border-primary/15 bg-primary/[0.035] p-2.5">
                    <p className="truncate text-[11px] font-bold">{selectedSearchRoom.roomName}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{selectedSearchRoom.buildingLabel} · {selectedSearchRoom.floorLabel ?? `Floor ${selectedSearchRoom.floorNumber}`}</p>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      <button type="button" onClick={() => onUseSelectedRoomAsStart?.(selectedSearchRoom)} className="min-h-8 rounded-lg bg-card px-2.5 text-[10px] font-extrabold text-primary hover:bg-primary/10">Use as Start</button>
                      <button type="button" onClick={() => onUseSelectedRoomAsDestination?.(selectedSearchRoom)} className="min-h-8 rounded-lg bg-card px-2.5 text-[10px] font-extrabold text-primary hover:bg-primary/10">Use as Destination</button>
                      {onReportSelectedRoom && <StudentReportAction ariaLabel="Report this room" onClick={() => onReportSelectedRoom(selectedSearchRoom)} className="min-h-8 gap-1 px-1.5 text-[9px]" />}
                    </div>
                  </div>
                )}
                {bothSet && !route && <RouteErrorState fromCode={fromDisplay.label} toCode={toDisplay.label} mode={mode} onSwitchMode={onModeChange} />}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {canShowMainForm && (
        <footer className="shrink-0 border-t border-border/60 bg-card/95 px-3.5 pb-2.5 pt-2.5 backdrop-blur-xl md:px-4 md:pb-3">
          {route && !editingRoute ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingRoute(true)} className="min-h-10 rounded-xl border border-border px-3 text-[11px] font-extrabold text-muted-foreground hover:bg-muted">Change route</button>
              <button type="button" onClick={onFindRoute} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground shadow-sm hover:brightness-110"><Navigation className="h-3.5 w-3.5" />Start navigation</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingRoute(false); onClear(); }} className="min-h-10 rounded-xl border border-border px-3 text-[12px] font-extrabold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Clear</button>
              <button type="button" onClick={onFindRoute} disabled={!canStart} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-extrabold text-primary-foreground shadow-[0_8px_20px_rgba(14,42,110,0.2)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><Navigation className="h-3.5 w-3.5" />{canStart ? "Find Route" : bothSet ? "Route unavailable" : hasFrom ? "Choose a destination" : "Choose starting point"}</button>
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
