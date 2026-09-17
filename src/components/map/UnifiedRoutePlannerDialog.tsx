import { Accessibility, ArrowUpDown, Check, Compass, MapPin, Navigation, Route as RouteIcon, X } from "lucide-react";
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
}

const MODES: Array<{ key: RouteMode; label: string; icon: ReactNode }> = [
  { key: "standard", label: "Standard", icon: <Compass className="h-4 w-4" /> },
  { key: "accessible", label: "Accessible", icon: <Accessibility className="h-4 w-4" /> },
  { key: "emergency", label: "SOS", icon: <RouteIcon className="h-4 w-4" /> },
];

function endpointText(
  purpose: "start" | "destination",
  building: Building | null,
  room: RoomDest | null | undefined,
  useMyLocation: boolean,
  youAreHere: { x: number; y: number } | null | undefined,
) {
  if (purpose === "start" && useMyLocation && youAreHere) {
    return { label: "You are here", context: "Dropped pin" };
  }
  if (room) {
    return { label: room.roomName, context: `${room.buildingLabel} · Floor ${room.floorNumber}` };
  }
  if (building) {
    return { label: building.name, context: `${building.code} · Building` };
  }
  return { label: purpose === "start" ? "Choose a starting point" : "Choose a destination", context: "Search campus places" };
}

function EndpointCard({
  purpose,
  building,
  room,
  useMyLocation,
  youAreHere,
  onChange,
}: {
  purpose: "start" | "destination";
  building: Building | null;
  room: RoomDest | null | undefined;
  useMyLocation: boolean;
  youAreHere?: { x: number; y: number } | null;
  onChange: () => void;
}) {
  const isStart = purpose === "start";
  const text = endpointText(purpose, building, room, useMyLocation, youAreHere);
  const selected = Boolean((isStart && useMyLocation && youAreHere) || room || building);
  return (
    <div
      data-testid={`route-endpoint-card-${purpose === "start" ? "start" : "destination"}`}
      className={cn(
        "flex min-h-[74px] items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors",
        selected ? "border-primary/25 bg-primary/[0.045]" : "border-border/70 bg-muted/35",
      )}
    >
      <span className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black",
        isStart ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
      )}>
        {isStart ? "A" : "B"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{isStart ? "Start" : "Destination"}</p>
        <p className={cn("truncate text-sm font-extrabold", selected ? "text-foreground" : "text-muted-foreground")}>{text.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{text.context}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-xl px-2.5 py-2 text-[11px] font-extrabold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={`${selected ? "Change" : "Choose"} ${isStart ? "start" : "destination"}`}
      >
        {selected ? "Change" : "Choose"}
      </button>
    </div>
  );
}

/**
 * A single responsive route-planning surface. Building and room destinations
 * share one search so selecting an indoor destination never requires choosing
 * its parent building a second time.
 */
export function UnifiedRoutePlannerDialog({
  from,
  to,
  onFromChange,
  onToChange,
  buildings: _buildings,
  mode,
  onModeChange,
  route,
  onClose,
  onClear,
  onFindRoute,
  youAreHere,
  useMyLocation,
  onUseMyLocationChange,
  fromRoom = null,
  toRoom = null,
  roomOptions: _roomOptions = [],
  onFromRoomChange: _onFromRoomChange,
  onToRoomChange: _onToRoomChange,
  onClearFromRoom,
  onClearToRoom,
  onSwapEndpoints,
  destinationResults = [],
  onSelectFromDestination,
  onSelectToDestination,
}: UnifiedRoutePlannerDialogProps) {
  useEscToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [activeEndpoint, setActiveEndpoint] = useState<"start" | "destination" | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DestinationFilter>("all");

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);

  const hasFrom = Boolean(fromRoom || from || (useMyLocation && youAreHere));
  const hasTo = Boolean(toRoom || to);
  const bothSet = Boolean(hasFrom && hasTo);
  const canStart = Boolean(bothSet && route);
  const endpointResults = useMemo(
    () => searchDestinationResults(destinationResults, query, filter).slice(0, query.trim() ? 30 : 12),
    [destinationResults, filter, query],
  );
  const fromDisplay = endpointText("start", from, fromRoom, useMyLocation, youAreHere);
  const toDisplay = endpointText("destination", to, toRoom, false, null);

  const openEndpointSearch = (endpoint: "start" | "destination") => {
    if (endpoint === "start" && useMyLocation) onUseMyLocationChange(false);
    setQuery("");
    setFilter("all");
    setActiveEndpoint(endpoint);
  };

  const closeEndpointSearch = () => {
    setQuery("");
    setActiveEndpoint(null);
  };

  const selectEndpoint = (result: SearchResult) => {
    if (activeEndpoint === "start") onSelectFromDestination?.(result);
    if (activeEndpoint === "destination") onSelectToDestination?.(result);
    closeEndpointSearch();
  };

  const swapEndpoints = () => {
    if (onSwapEndpoints) {
      onSwapEndpoints();
      return;
    }
    const previousFrom = from;
    onFromChange(to);
    onToChange(previousFrom);
  };

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
      className="fixed inset-x-0 bottom-0 z-50 max-h-[min(90dvh,760px)] overflow-y-auto rounded-t-[28px] border-t border-border/70 bg-card text-foreground shadow-[0_-16px_42px_rgba(15,23,42,0.18)] outline-none md:absolute md:inset-x-auto md:bottom-auto md:left-3 md:top-3 md:w-[min(400px,calc(100vw-24px))] md:max-h-[calc(100dvh-1.5rem)] md:rounded-3xl md:border md:shadow-2xl"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      onWheelCapture={(event) => event.stopPropagation()}
      onTouchMoveCapture={(event) => event.stopPropagation()}
    >
      <span id="route-planner-description" className="sr-only">Choose a starting point, destination, and travel mode to get walking directions.</span>
      <p role="status" aria-live="polite" aria-atomic="true" data-testid="route-planner-live-status" className="sr-only">
        {route ? `Route ready from ${fromDisplay.label} to ${toDisplay.label}.` : bothSet ? `Planning from ${fromDisplay.label} to ${toDisplay.label}.` : "Choose a starting point and destination to plan a route."}
      </p>

      <div className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-4 pb-3 pt-3 backdrop-blur-xl md:rounded-t-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_18px_rgba(14,42,110,0.22)]"><Navigation className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-[var(--font-sans)] text-base font-extrabold leading-tight">Route Planner</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose one place to start walking</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close directions" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1" role="group" aria-label="Route modes">
          {MODES.map(({ key, label, icon }) => (
            <button key={key} type="button" onClick={() => onModeChange(key)} aria-label={`${label} routing`} aria-pressed={mode === key} className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", mode === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </div>

        {useMyLocation && youAreHere ? (
          <EndpointCard purpose="start" building={null} room={null} useMyLocation={useMyLocation} youAreHere={youAreHere} onChange={() => openEndpointSearch("start")} />
        ) : (
          <>
            <EndpointCard purpose="start" building={from} room={fromRoom} useMyLocation={useMyLocation} youAreHere={youAreHere} onChange={() => openEndpointSearch("start")} />
            {activeEndpoint === "start" && (
              <CampusDestinationSearch
                query={query}
                results={endpointResults}
                focused
                filter={filter}
                placeholder="Search a starting building or room..."
                ariaLabel="Search start"
                onQueryChange={setQuery}
                onFocus={() => undefined}
                onBlur={closeEndpointSearch}
                onFilterChange={setFilter}
                onSelect={selectEndpoint}
                onClear={() => setQuery("")}
                autoFocus
                compact
                listId="route-start-destination-results"
              />
            )}
          </>
        )}

        {useMyLocation && youAreHere && activeEndpoint === "start" && (
          <CampusDestinationSearch
            query={query}
            results={endpointResults}
            focused
            filter={filter}
            placeholder="Search a starting building or room..."
            ariaLabel="Search start"
            onQueryChange={setQuery}
            onFocus={() => undefined}
            onBlur={closeEndpointSearch}
            onFilterChange={setFilter}
            onSelect={selectEndpoint}
            onClear={() => setQuery("")}
            autoFocus
            compact
            listId="route-start-destination-results"
          />
        )}

        <div className="flex items-center justify-center" aria-hidden={!hasFrom || !hasTo}>
          <button type="button" onClick={swapEndpoints} disabled={!hasFrom || !hasTo} aria-label="Swap start and destination" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ArrowUpDown className="h-4 w-4" /></button>
        </div>

        <EndpointCard purpose="destination" building={to} room={toRoom} useMyLocation={false} onChange={() => openEndpointSearch("destination")} />
        {activeEndpoint === "destination" && (
          <CampusDestinationSearch
            query={query}
            results={endpointResults}
            focused
            filter={filter}
            placeholder="Search buildings, rooms, and offices..."
            ariaLabel="Search destination"
            onQueryChange={setQuery}
            onFocus={() => undefined}
            onBlur={closeEndpointSearch}
            onFilterChange={setFilter}
            onSelect={selectEndpoint}
            onClear={() => setQuery("")}
            autoFocus
            compact
            listId="route-destination-results"
          />
        )}

        {bothSet && route && (
          <div data-testid="route-summary" className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><RouteIcon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-primary">Route ready</p><p className="truncate text-sm font-extrabold text-foreground">{fromDisplay.label} → {toDisplay.label}</p></div>
              <Check className="h-5 w-5 shrink-0 text-emerald-600" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-card/75 px-2 py-2"><p className="text-lg font-extrabold text-foreground">{formatDistance(route.dist)}</p><p className="text-[10px] font-semibold text-muted-foreground">walking distance</p></div><div className="rounded-xl bg-card/75 px-2 py-2"><p className="text-lg font-extrabold text-foreground">{formatMinutes(route.mins)}</p><p className="text-[10px] font-semibold text-muted-foreground">estimated time</p></div></div>
          </div>
        )}

        {bothSet && !route && <RouteErrorState fromCode={fromDisplay.label} toCode={toDisplay.label} mode={mode} onSwitchMode={onModeChange} />}
      </div>

      <div className="sticky bottom-0 border-t border-border/60 bg-card/95 px-4 pb-4 pt-3 backdrop-blur-xl">
        <div className="flex gap-2">
          <button type="button" onClick={onClear} className="min-h-12 rounded-2xl border border-border px-4 text-sm font-extrabold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Clear</button>
          <button type="button" onClick={onFindRoute} disabled={!canStart} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-[0_8px_20px_rgba(14,42,110,0.2)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <Navigation className="h-4 w-4" />
            {canStart ? "Start navigation" : bothSet ? "Route unavailable" : "Choose a destination"}
          </button>
        </div>
      </div>
    </div>
  );
}
