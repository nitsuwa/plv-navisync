import { useEffect, useRef, type ReactNode } from "react";
import {
  Navigation, X, ArrowUpDown, Compass, Accessibility, AlertTriangle,
  MapPin, Route as RouteIcon, Crosshair,
} from "lucide-react";
import type { Building } from "../../types";
import { EndpointPicker } from "./EndpointPicker";
import { RouteErrorState } from "./RouteErrorState";
import { cn } from "../../lib/utils";
import type { PlannedRoute, RouteMode } from "../../lib/routePlanner";
import type { RoomDest } from "../../lib/combinedPathfinding";
import { useEscToClose } from "../../hooks/useEscToClose";

interface RoutePlannerDialogProps {
  from: Building | null;
  to: Building | null;
  onFromChange: (b: Building | null) => void;
  onToChange: (b: Building | null) => void;
  buildings: readonly Building[];
  mode: RouteMode;
  onModeChange: (m: RouteMode) => void;
  route: PlannedRoute | null;
  onClose: () => void;
  onClear: () => void;
  onFindRoute: () => void;
  /** "You are here" marker — when set, the user can start from it */
  youAreHere?: { x: number; y: number } | null;
  /** Route starts from the "You are here" marker instead of a building */
  useMyLocation: boolean;
  onUseMyLocationChange: (v: boolean) => void;
  /** Optional room-level endpoints selected from a published floor graph. */
  fromRoom?: RoomDest | null;
  toRoom?: RoomDest | null;
  /** Optional published room destinations for room-to-room planning. */
  roomOptions?: readonly RoomDest[];
  onFromRoomChange?: (room: RoomDest | null) => void;
  onToRoomChange?: (room: RoomDest | null) => void;
  onClearFromRoom?: () => void;
  onClearToRoom?: () => void;
  /** Atomically swaps complete endpoints, including their room metadata. */
  onSwapEndpoints?: () => void;
}

const MODES: { key: RouteMode; label: string; icon: ReactNode }[] = [
  { key: "standard", label: "Standard", icon: <Compass className="h-3.5 w-3.5" /> },
  { key: "accessible", label: "Accessible", icon: <Accessibility className="h-3.5 w-3.5" /> },
  { key: "emergency", label: "SOS", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
];

/**
 * Route planner dialog — pick start + destination, choose a travel mode,
 * and find a route. Desktop shows a floating panel; the same component is
 * used inside the map's floating UI (it is compact by design).
 */
export function RoutePlannerDialog({
  from, to, onFromChange, onToChange, buildings, mode, onModeChange,
  route, onClose, onClear, onFindRoute, youAreHere, useMyLocation, onUseMyLocationChange,
  fromRoom = null, toRoom = null, roomOptions = [], onFromRoomChange, onToRoomChange,
  onClearFromRoom, onClearToRoom, onSwapEndpoints,
}: RoutePlannerDialogProps) {
  useEscToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The planner is a non-modal dialog: focus the dialog itself on open so
  // keyboard users have a reliable starting point, then restore the control
  // that opened it when the dialog closes (including Escape).
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);
  const hasFrom = Boolean(fromRoom || from);
  const hasTo = Boolean(toRoom || to);
  const bothSet = useMyLocation ? hasTo : Boolean(hasFrom && hasTo);
  const canPlan = Boolean(bothSet && route);
  const swapEndpoints = () => {
    if (onSwapEndpoints) {
      onSwapEndpoints();
      return;
    }
    const previousFrom = from;
    onFromChange(to);
    onToChange(previousFrom);
  };
  const fromDisplay = useMyLocation
    ? "You are here"
    : fromRoom
      ? `${fromRoom.roomName} in ${fromRoom.buildingLabel} (${fromRoom.buildingCode})`
      : (from?.code ?? "A");
  const toDisplay = toRoom
    ? `${toRoom.roomName} in ${toRoom.buildingLabel} (${toRoom.buildingCode})`
    : (to?.code ?? "B");
  const clearFromRoom = () => {
    if (onClearFromRoom) {
      onClearFromRoom();
      return;
    }
    onFromRoomChange?.(null);
    onFromChange(null);
  };
  const clearToRoom = () => {
    if (onClearToRoom) {
      onClearToRoom();
      return;
    }
    onToRoomChange?.(null);
    onToChange(null);
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
      className="outline-none"
      onWheelCapture={(event) => event.stopPropagation()}
      onTouchMoveCapture={(event) => event.stopPropagation()}
    >
      <span id="route-planner-description" className="sr-only">
        Choose a starting point, destination, and travel mode to get walking directions.
      </span>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="route-planner-live-status"
        className="sr-only"
      >
        {route
          ? `Route ready from ${fromDisplay} to ${toDisplay}.`
          : bothSet
            ? `Planning from ${fromDisplay} to ${toDisplay}.`
            : "Choose a starting point and destination to plan a route."}
      </p>
    {/* Desktop: floating panel */}
    <div
      className="hidden md:block rounded-2xl border border-border shadow-xl overflow-y-auto max-h-[85dvh] animate-scale-in"
      style={{ background: "var(--card)", color: "var(--foreground)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Navigation className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-foreground leading-none" style={{ fontFamily: "var(--font-sans)" }}>
              Route Planner
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Plan your trip around campus</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all"
          aria-label="Close directions"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Mode chips */}
        <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              aria-pressed={mode === m.key}
              aria-label={`${m.label} routing${mode === m.key ? " (selected)" : ""}`}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all",
                mode === m.key
                  ? m.key === "accessible"
                    ? "bg-green-500/15 text-green-700 dark:text-green-400"
                    : m.key === "emergency"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Pickers */}
        {youAreHere && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUseMyLocationChange(!useMyLocation)}
              aria-pressed={useMyLocation}
              aria-label={`Use You are here as the starting point${useMyLocation ? " (selected)" : ""}`}
              className={cn(
                "flex flex-1 items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all",
                useMyLocation
                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 shadow-sm"
                  : "border border-border text-muted-foreground hover:bg-muted"
              )}
              title="Start from the 'You are here' marker"
            >
              <Crosshair className={cn("h-3.5 w-3.5", useMyLocation ? "animate-pulse" : "")} />
              <span>You are here</span>
              {useMyLocation && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto" />}
            </button>
          </div>
        )}
        {useMyLocation && youAreHere ? (
          /* From = "You are here" (no building picker) */
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/8"
            data-testid="from-you-are-here"
          >
            <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-black">A</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold text-foreground leading-tight">You are here</p>
              <p className="text-[9px] text-muted-foreground">Using your current location</p>
            </div>
            <button
              onClick={() => onUseMyLocationChange(false)}
              className="text-[9px] font-bold text-primary hover:underline"
              aria-label="Choose a building as starting point instead"
            >
              Change
            </button>
          </div>
        ) : (
          <EndpointPicker
            badge="A"
            badgeColor="#16a34a"
            building={from}
            room={fromRoom}
            onBuildingSelect={onFromChange}
            onBuildingClear={() => onFromChange(null)}
            onRoomSelect={onFromRoomChange}
            onRoomClear={clearFromRoom}
            placeholder="Starting point…"
            buildings={buildings}
            roomOptions={roomOptions}
          />
        )}
        {!useMyLocation && bothSet && (
          <div className="flex items-center justify-center">
            <button
              onClick={swapEndpoints}
              className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center hover:bg-muted active:scale-90 transition-all"
              aria-label="Swap start and destination"
            >
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}
        <EndpointPicker
          badge="B"
          badgeColor="#dc2626"
          building={to}
          room={toRoom}
          onBuildingSelect={onToChange}
          onBuildingClear={() => onToChange(null)}
          onRoomSelect={onToRoomChange}
          onRoomClear={clearToRoom}
          placeholder="Destination…"
          buildings={buildings}
          roomOptions={roomOptions}
        />

        {/* Route summary / error / empty */}
        {route ? (
          <div className="mt-1 p-3 rounded-xl bg-primary/8 border border-primary/20 animate-fade-in">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest flex items-center gap-1">
                <RouteIcon className="h-3 w-3" /> Route Ready
              </span>
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            </div>
            <p className="text-[10px] font-semibold text-foreground/80">
              Follow the highlighted path and turn-by-turn instructions below.
            </p>
            <p data-testid="route-source" className="mt-1 text-[9px] font-semibold text-muted-foreground">
              {route.isAuthoredGraph
                ? "Following the admin-authored map paths"
                : route.isGraphBased
                  ? "Following the built-in walkway graph"
                  : "Approximate route — map path not published"}
            </p>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/30">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {useMyLocation ? "You are here" : (fromRoom ? `${fromRoom.roomName} · ${fromRoom.buildingCode}` : (from?.code ?? "Start"))}
              </span>
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-destructive border border-red-200 dark:border-red-800/30">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {toRoom ? `${toRoom.roomName} · ${toRoom.buildingCode}` : (to?.code ?? "?")}
              </span>
              {route.transitions.length > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/30">
                  <Navigation className="h-2.5 w-2.5" /> {route.transitions.length} floor change{route.transitions.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        ) : bothSet ? (
          <RouteErrorState fromCode={fromDisplay} toCode={toDisplay} mode={mode} onSwitchMode={onModeChange} />
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/50 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[11px] font-semibold">Pick a starting point and destination above</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            onClick={onClear}
            className="h-9 px-3 rounded-xl border border-border text-muted-foreground text-[11px] font-bold hover:bg-muted transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onFindRoute}
            disabled={!canPlan}
            className={cn(
              "flex-1 h-9 rounded-xl text-[11px] font-bold transition-all",
              canPlan
                ? "bg-primary text-primary-foreground hover:brightness-110 shadow-md active:scale-[0.98]"
                : "bg-muted text-muted-foreground/75 cursor-not-allowed"
            )}
          >
            {route ? "Navigate" : bothSet ? "Route Unavailable" : "Find Route"}
          </button>
        </div>
      </div>
    </div>

    {/* Mobile: bottom sheet — sits above bottom nav */}
    <div
      className="md:hidden fixed inset-x-0 z-50 rounded-t-3xl border-t border-border/60 overflow-y-auto"
      style={{ background: "var(--card)", color: "var(--foreground)", maxHeight: 'calc(100vh - 100px)', bottom: '76px', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
    >
      {/* Drag handle */}
      <div className="flex items-center justify-center pt-3 pb-2">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
      </div>
      <div className="px-4 pb-6 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
              <Navigation className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground leading-none">Route Planner</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Plan your trip around campus</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center active:scale-90 transition-all" aria-label="Close directions">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Mode chips */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-muted/30 p-1">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => onModeChange(m.key)}
              aria-pressed={mode === m.key}
              aria-label={`${m.label} routing${mode === m.key ? " (selected)" : ""}`}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold transition-all",
                mode === m.key
                  ? m.key === "accessible" ? "bg-green-500 text-white shadow-lg shadow-green-500/30"
                    : m.key === "emergency" ? "bg-destructive text-white shadow-lg shadow-destructive/30"
                    : "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-white/5"
              )}>
              {m.icon}
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Pickers */}
        {youAreHere && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => onUseMyLocationChange(!useMyLocation)}
              aria-pressed={useMyLocation}
              aria-label={`Use You are here as the starting point${useMyLocation ? " (selected)" : ""}`}
              className={cn(
                "flex flex-1 items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all",
                useMyLocation
                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 shadow-sm"
                  : "border border-border text-muted-foreground hover:bg-muted"
              )}>
              <Crosshair className={cn("h-3.5 w-3.5", useMyLocation ? "animate-pulse" : "")} />
              <span>You are here</span>
            </button>
          </div>
        )}
        {useMyLocation && youAreHere ? (
          <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl border border-blue-500/30 bg-blue-500/8">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-black">A</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold text-foreground leading-tight">You are here</p>
              <p className="text-[9px] text-muted-foreground">Using your current location</p>
            </div>
            <button onClick={() => onUseMyLocationChange(false)} className="text-[10px] font-bold text-primary hover:underline" aria-label="Choose a building as starting point instead">Change</button>
          </div>
        ) : (
          <EndpointPicker
            badge="A"
            badgeColor="#16a34a"
            building={from}
            room={fromRoom}
            onBuildingSelect={onFromChange}
            onBuildingClear={() => onFromChange(null)}
            onRoomSelect={onFromRoomChange}
            onRoomClear={clearFromRoom}
            placeholder="Starting point…"
            buildings={buildings}
            roomOptions={roomOptions}
          />
        )}
        {!useMyLocation && bothSet && (
          <div className="flex items-center justify-center">
            <button onClick={swapEndpoints} className="w-9 h-9 rounded-full border border-border bg-card shadow-sm flex items-center justify-center active:scale-90 transition-all" aria-label="Swap start and destination">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        )}
        <EndpointPicker
          badge="B"
          badgeColor="#dc2626"
          building={to}
          room={toRoom}
          onBuildingSelect={onToChange}
          onBuildingClear={() => onToChange(null)}
          onRoomSelect={onToRoomChange}
          onRoomClear={clearToRoom}
          placeholder="Destination…"
          buildings={buildings}
          roomOptions={roomOptions}
        />

        {/* Route summary */}
        {route ? (
          <div className="p-3.5 rounded-xl bg-primary/8 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest flex items-center gap-1">
                <RouteIcon className="h-3 w-3" /> Route Ready
              </span>
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            </div>
            <p className="text-[11px] font-semibold text-foreground/80">
              Follow the highlighted path and turn-by-turn instructions below.
            </p>
            <p data-testid="route-source" className="mt-1 text-[9px] font-semibold text-muted-foreground">
              {route.isAuthoredGraph
                ? "Following the admin-authored map paths"
                : route.isGraphBased
                  ? "Following the built-in walkway graph"
                  : "Approximate route — map path not published"}
            </p>
          </div>
        ) : bothSet ? (
          <RouteErrorState fromCode={fromDisplay} toCode={toDisplay} mode={mode} onSwitchMode={onModeChange} />
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-muted/40 text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="text-[11px] font-semibold">Pick start and destination</span>
          </div>
        )}

        {/* Actions — extra bottom padding so nothing is hidden behind the nav */}
        <div className="flex items-center gap-2.5 pt-1">
          <button onClick={onClear} className="h-11 px-5 rounded-xl border border-border text-muted-foreground text-xs font-bold hover:bg-muted active:scale-[0.97] transition-all">Clear</button>
          <button onClick={onFindRoute} disabled={!canPlan}
            className={cn("flex-1 h-11 rounded-xl text-xs font-bold transition-all",
              canPlan ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-[0.97]" : "bg-muted text-muted-foreground/75 cursor-not-allowed")}>
            {route ? "Navigate" : bothSet ? "Route Unavailable" : "Find Route"}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
