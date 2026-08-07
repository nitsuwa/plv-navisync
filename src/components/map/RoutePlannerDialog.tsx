import type { ReactNode } from "react";
import {
  Navigation, X, ArrowUpDown, Compass, Accessibility, AlertTriangle,
  MapPin, Route as RouteIcon,
} from "lucide-react";
import type { Building } from "../../types";
import { BuildingPicker } from "./BuildingPicker";
import { RouteErrorState } from "./RouteErrorState";
import { cn } from "../../lib/utils";
import type { PlannedRoute, RouteMode } from "../../lib/routePlanner";
import { formatDistance, formatMinutes } from "../../lib/routePlanner";

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
  route, onClose, onClear, onFindRoute,
}: RoutePlannerDialogProps) {
  const bothSet = Boolean(from && to);
  const canPlan = bothSet;

  return (
    <div
      className="rounded-2xl border border-border shadow-xl overflow-visible animate-scale-in"
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
        <BuildingPicker
          badge="A"
          badgeColor="#16a34a"
          value={from}
          onSelect={onFromChange}
          onClear={() => onFromChange(null)}
          placeholder="Starting point…"
          buildings={buildings}
        />
        <div className="flex items-center justify-center">
          <button
            onClick={() => { const tmp = from; onFromChange(to); onToChange(tmp); }}
            className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center hover:bg-muted active:scale-90 transition-all"
            aria-label="Swap start and destination"
          >
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <BuildingPicker
          badge="B"
          badgeColor="#dc2626"
          value={to}
          onSelect={onToChange}
          onClear={() => onToChange(null)}
          placeholder="Destination…"
          buildings={buildings}
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
            <div className="flex items-end gap-3">
              <p className="text-lg font-extrabold text-foreground">{formatDistance(route.dist)}</p>
              <p className="text-sm font-semibold text-muted-foreground pb-0.5">
                · {formatMinutes(route.mins)}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/30">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {from?.code ?? "Start"}
              </span>
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-destructive border border-red-200 dark:border-red-800/30">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {to?.code ?? "?"}
              </span>
              {route.transitions.length > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/30">
                  <Navigation className="h-2.5 w-2.5" /> {route.transitions.length} floor change{route.transitions.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        ) : bothSet ? (
          <RouteErrorState fromCode={from?.code ?? "A"} toCode={to?.code ?? "B"} mode={mode} onSwitchMode={onModeChange} />
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
                : "bg-muted text-muted-foreground/60 cursor-not-allowed"
            )}
          >
            {route ? "Navigate" : "Find Route"}
          </button>
        </div>
      </div>
    </div>
  );
}
