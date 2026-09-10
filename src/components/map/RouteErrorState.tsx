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
  // Accessibility routing is intentionally deferred until the admin can author
  // and publish an accessibility network. Keep that state explicit instead of
  // presenting ordinary walking edges as wheelchair-safe.
  const canTryStandard = mode !== "standard";
  const description = mode === "accessible"
      ? "Accessibility routing is not available yet. Ask an administrator to author accessible paths, then try again."
    : mode === "emergency"
      ? "No emergency-safe stair route is available for this destination. Follow posted emergency signage and contact campus emergency services if you are in danger. Do not use Standard mode as an emergency route."
      : `We couldn't find a path from ${fromCode} to ${toCode}.`;
  return (
    <div
      className="mt-1 p-3 rounded-xl border border-destructive/20 bg-destructive/5 animate-fade-in"
      role="alert"
      aria-label={`No route available from ${fromCode} to ${toCode}`}
      data-testid="route-error-state"
    >
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
          <RouteOff className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold text-foreground">No available route</p>
          <p className="text-[10px] text-muted-foreground leading-snug">{description}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {canTryStandard && mode !== "emergency" && (
          <button
            onClick={() => onSwitchMode("standard")}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            <Compass className="h-3 w-3" /> Try Standard mode
          </button>
        )}
        <p className="text-[10px] text-muted-foreground self-center ml-auto text-right">
          Choose a different destination above in the destination picker{mode === "standard" ? " and try another route" : " or switch to Standard mode"}.
        </p>
      </div>
    </div>
  );
}
