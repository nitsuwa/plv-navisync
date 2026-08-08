import { RouteOff, Compass } from "lucide-react";
import type { RouteMode } from "../../lib/routePlanner";

interface RouteErrorStateProps {
  fromCode: string;
  toCode: string;
  mode: RouteMode;
  onSwitchMode: (m: RouteMode) => void;
}

/**
 * Friendly "no available route" state — shown when a route cannot be
 * computed (disconnected graph, no accessible path, missing data).
 * Never crashes — it always offers a next action.
 */
export function RouteErrorState({ fromCode, toCode, mode, onSwitchMode }: RouteErrorStateProps) {
  // Accessible mode restricts the graph (avoids stairs), so the most useful
  // recovery is to retry in Standard mode. In Standard mode the graph itself
  // is disconnected — suggest picking a different destination instead.
  const canTryStandard = mode !== "standard";
  return (
    <div className="mt-1 p-3 rounded-xl border border-destructive/20 bg-destructive/5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
          <RouteOff className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold text-foreground">No available route</p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            We couldn't find a {mode === "accessible" ? "wheelchair-accessible " : ""}path from{" "}
            <span className="font-bold text-foreground">{fromCode}</span> to{" "}
            <span className="font-bold text-foreground">{toCode}</span>.
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {canTryStandard && (
          <button
            onClick={() => onSwitchMode("standard")}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            <Compass className="h-3 w-3" /> Try Standard mode
          </button>
        )}
        <span className="text-[10px] text-muted-foreground self-center ml-auto">
          Try a different destination
        </span>
      </div>
    </div>
  );
}
