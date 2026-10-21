import { Check, Info, MapPin, ShieldAlert } from "lucide-react";
import type { EmergencyRouteFailureReason } from "../../lib/emergencyRouteStatus";

export type EmergencyRouteStatusCardState =
  | "unavailable"
  | "not-calculated"
  | "review-required"
  | "approved"
  | "auto-calculated"
  | "campus-gate-fallback"
  | "unapproved-preview"
  | "exit-only-preview";

export type EmergencyRouteStatusCardModel = {
  state: EmergencyRouteStatusCardState;
  reason?: EmergencyRouteFailureReason;
  destinationName?: string;
  /** Kept for resolver and Admin diagnostics; never shown in the Student status card. */
  details: readonly string[];
};

const FAILURE_COPY: Record<EmergencyRouteFailureReason, string> = {
  no_assigned_assembly_point: "No usable Assembly Point is assigned to this building.",
  assembly_point_disconnected: "No route reaches the assembly point.",
  no_safe_route: "No emergency route found.",
};

function statusCopy(model: EmergencyRouteStatusCardModel): { title: string; description?: string; guidance?: string; tone: "warning" | "neutral" | "approved" } {
  if (model.state === "unavailable") {
    return {
      title: "SOS route unavailable",
      description: FAILURE_COPY[model.reason ?? "no_safe_route"],
      guidance: "Follow posted evacuation instructions.",
      tone: "warning",
    };
  }
  if (model.state === "approved") {
    return { title: "Emergency route ready", tone: "approved" };
  }
  if (model.state === "auto-calculated") {
    return { title: "Recommended emergency route", guidance: "Follow posted instructions and campus personnel.", tone: "neutral" };
  }
  if (model.state === "campus-gate-fallback") {
    return { title: "Campus Gate · Fallback", description: "No Assembly Point is assigned to this building.", guidance: "Follow posted evacuation instructions and campus personnel.", tone: "warning" };
  }
  if (model.state === "review-required") {
    return { title: "Evacuation route needs review", guidance: "Follow posted evacuation instructions.", tone: "warning" };
  }
  if (model.state === "unapproved-preview") {
    return { title: "Route preview only", description: "This route isn't approved for evacuation.", guidance: "Follow posted evacuation instructions.", tone: "warning" };
  }
  if (model.state === "exit-only-preview") {
    return { title: "Exit-only preview", description: "This route ends at a building exit.", guidance: "Follow posted evacuation instructions.", tone: "warning" };
  }
  return { title: "", tone: "neutral" };
}

export function EmergencyRouteStatus({ model }: { model: EmergencyRouteStatusCardModel }) {
  const copy = statusCopy(model);
  const unavailable = model.state === "unavailable";
  const Icon = model.state === "approved" ? Check : unavailable || model.state === "review-required" ? ShieldAlert : Info;
  const tone = copy.tone === "warning"
    ? "border-amber-500/25 bg-amber-500/[0.055] text-amber-900 dark:text-amber-200"
    : copy.tone === "approved"
      ? "border-emerald-500/20 bg-emerald-500/[0.045] text-emerald-900 dark:text-emerald-200"
      : "border-border/70 bg-muted/35 text-foreground";

  return (
    <section
      id="emergency-route-status"
      data-testid="emergency-route-status"
      data-status={model.state}
      role={unavailable ? "alert" : "status"}
      aria-live={unavailable ? "assertive" : "polite"}
      className={`min-w-0 rounded-xl border px-3 py-2 ${tone}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {copy.title && <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-current/10">
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        </span>}
        <div className="min-w-0 flex-1">
          {copy.title && <h3 className="text-[11px] font-extrabold leading-snug">{copy.title}</h3>}
          {copy.description && <p className={`${copy.title ? "mt-0.5 " : ""}text-[10px] leading-snug text-muted-foreground`}>{copy.description}</p>}
          {model.destinationName && model.state !== "unavailable" && (
            <p data-testid="emergency-destination-summary" className={`${copy.title ? "mt-1 " : ""}flex min-w-0 items-center gap-1 text-[10px] font-bold leading-snug text-foreground`}>
              <MapPin aria-hidden="true" className="h-3 w-3 shrink-0 text-emerald-700 dark:text-emerald-300" />
              <span className="min-w-0 truncate">Destination · {model.destinationName}</span>
            </p>
          )}
          {copy.guidance && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{copy.guidance}</p>}
        </div>
      </div>
    </section>
  );
}

export { FAILURE_COPY as EMERGENCY_ROUTE_FAILURE_COPY };
