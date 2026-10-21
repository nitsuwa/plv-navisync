import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ShieldAlert } from "lucide-react";
import type { Campus, FloorRoom, RoomEmergencyEvacuationConfiguration } from "./types";
import {
  evaluateRoomEmergencyEvacuation,
  type EmergencyRouteReviewRequirement,
  type RoomEmergencyEvacuationEvaluation,
  type RoomEmergencyRouteCandidate,
} from "../../lib/roomEmergencyEvacuation";
import { cn } from "../../lib/utils";
import { EmergencyEvacuationVideoAdminSection } from "./EmergencyEvacuationVideoAdminSection";
import { assignedPrimaryAssemblyPoint } from "../../lib/emergencyAssemblyPoints";

interface RoomEmergencyEvacuationSectionProps {
  campus: Campus;
  buildingId: string;
  floorId: string;
  room: FloorRoom;
  onChange: (configuration: RoomEmergencyEvacuationConfiguration) => void;
  onInspectConnection?: (doorId?: string) => void;
  onInspectReviewRequirement?: (requirement: EmergencyRouteReviewRequirement) => void;
}

type RouteStatus = { title: string; detail: string; tone: "ready" | "attention" | "blocked" };

function shortAssemblyPointProblem(message: string | undefined): string | null {
  if (!message) return null;
  if (/conflicting primary/i.test(message)) return "Resolve the conflicting Primary Assembly Point assignment.";
  if (/assign an assembly point/i.test(message)) return "Assign an Assembly Point to this building.";
  if (/designate a campus-wide primary/i.test(message)) return "Designate a campus-wide Primary or assign a Primary to this building.";
  if (/restore the designated campus-wide primary/i.test(message)) return "Restore the campus-wide Primary Assembly Point and its outdoor anchor.";
  if (/assign one primary/i.test(message)) return "Assign a Primary Assembly Point to this building.";
  if (/connect an assigned assembly point/i.test(message)) return "Connect an assigned Assembly Point to the outdoor Walking Network.";
  if (/connect the assigned primary/i.test(message)) return "Connect the assigned Primary Assembly Point to the outdoor Walking Network.";
  if (/connect the resolved (?:primary )?assembly point/i.test(message)) return "Connect the resolved Assembly Point to the outdoor Walking Network.";
  if (/needs an authorized (?:location )?review/i.test(message)) return "The assigned Assembly Point needs an authorized location review.";
  return null;
}

function shortDoorConnectionProblem(detail: string): string {
  if (/no valid navigation node/i.test(detail)) return "has no valid navigation node.";
  if (/physical access opening|valid physical/i.test(detail)) return "is not a valid physical opening for this Room.";
  if (/room-side door transition|room-side.*transition/i.test(detail)) return "is missing its Room-to-Door navigation link.";
  if (/walking network/i.test(detail)) return "has no traversable Walking Network link.";
  if (/closed|non-traversable/i.test(detail)) return "connects only to a closed or non-traversable path.";
  return "has a missing or disconnected navigation link.";
}

function routeStatus(evaluation: RoomEmergencyEvacuationEvaluation | null): RouteStatus {
  if (!evaluation) return { title: "Checking route readiness", detail: "Evaluating connected campus assets.", tone: "attention" };

  const eligibleCandidate = evaluation.candidates.find((candidate) =>
    candidate.completeAssemblyRoute === true
    && candidate.emergencyUseReviewRequired !== true
    );
  if (eligibleCandidate) {
    const destination = eligibleCandidate.campusGatePurpose && !eligibleCandidate.assemblyPointId
      ? "Campus Gate · Fallback"
      : eligibleCandidate.assemblyPointName || "assigned Assembly Point";
    return { title: "Route available", detail: `Eligible route to ${destination}.`, tone: "ready" };
  }

  const connectedCandidate = evaluation.candidates.find((candidate) => candidate.graphCompleteAssemblyRoute);
  if (connectedCandidate) {
    return {
      title: "Connection needs attention",
      detail: connectedCandidate.emergencyUseReviewRequired
        ? "A connected path includes assets not designated for emergency use."
        : "The connected destination or one of its assets needs attention.",
      tone: "attention",
    };
  }

  const disconnectedDoor = evaluation.doorReadiness.find((door) => door.state === "disconnected");
  if (disconnectedDoor) return {
    title: "Connection needs attention",
    detail: `${disconnectedDoor.label} ${shortDoorConnectionProblem(disconnectedDoor.detail)}`,
    tone: "attention",
  };

  const incompleteDoor = evaluation.doorReadiness.find((door) => door.state === "connected_without_route");
  const destinationProblem = shortAssemblyPointProblem(evaluation.message);
  if (incompleteDoor && destinationProblem) return { title: "No eligible exit found", detail: destinationProblem, tone: "blocked" };
  if (incompleteDoor) return {
    title: "No eligible exit found",
    detail: `${incompleteDoor.label} does not reach a complete safe exit and assigned destination.`,
    tone: "blocked",
  };
  if (destinationProblem) return { title: "No eligible exit found", detail: destinationProblem, tone: "blocked" };
  return { title: "No eligible exit found", detail: "No complete emergency-safe route is connected to this Room.", tone: "blocked" };
}

function uniqueRequirements(candidates: RoomEmergencyRouteCandidate[]): EmergencyRouteReviewRequirement[] {
  return candidates.flatMap((candidate) => candidate.emergencyReviewRequirements ?? [])
    .filter((requirement, index, all) => all.findIndex((item) => item.kind === requirement.kind && item.id === requirement.id) === index);
}

export function RoomEmergencyEvacuationSection({ campus, buildingId, floorId, room, onChange, onInspectConnection, onInspectReviewRequirement }: RoomEmergencyEvacuationSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [inspectingConnections, setInspectingConnections] = useState(false);
  const [evaluation, setEvaluation] = useState<RoomEmergencyEvacuationEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = room.emergencyEvacuation ?? { enabled: false, routes: [] };
  const building = campus.buildings.find((item) => item.id === buildingId);
  const floor = building?.floors.find((item) => item.id === floorId);

  // Room readiness is derived from the authored campus graph on mount and
  // recalculated after physical assets, links, or destination policy change.
  // No per-room route generation or approval action is part of Student SOS.
  useEffect(() => {
    try {
      setEvaluation(evaluateRoomEmergencyEvacuation(campus, buildingId, floorId, room.id));
      setError(null);
    } catch {
      setEvaluation({ roomId: room.id, doorReadiness: [], candidates: [], message: "Route readiness could not be calculated after the map changed." });
      setError("Route readiness could not be calculated.");
    }
  }, [campus.buildings, campus.markers, campus.navNodes, campus.navEdges, campus.assemblyPoints, campus.settings?.emergencyDestinationPolicy, building?.entrances, building?.floors, floor?.doors, floor?.walls, floor?.rooms, buildingId, floorId, room.id, room.name]);

  const status = routeStatus(evaluation);
  const resolvedPrimary = campus.settings?.emergencyDestinationPolicy === "nearest_eligible"
    ? null
    : assignedPrimaryAssemblyPoint(campus, buildingId);
  const resolvedPrimaryIsExplicit = Boolean(resolvedPrimary?.buildingAssignments?.some((assignment) =>
    assignment.buildingId === buildingId && assignment.designation === "primary"));
  const inspectableDoor = evaluation?.doorReadiness.find((door) => door.state === "disconnected" || door.state === "connected_without_route");
  const requirements = uniqueRequirements(evaluation?.candidates ?? []);
  const firstRequirement = requirements[0];
  const canInspect = Boolean(inspectableDoor?.doorId || firstRequirement);
  const inspectProblem = () => {
    if (inspectableDoor?.doorId) onInspectConnection?.(inspectableDoor.doorId);
    else if (firstRequirement) onInspectReviewRequirement?.(firstRequirement);
  };

  return (
    <section className="space-y-2 border-t border-border pt-3" data-testid="room-emergency-evacuation-section">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="text-[10px] font-extrabold text-foreground">Emergency Evacuation</span>
        </span>
        {!expanded && evaluation && <span data-testid="room-emergency-readiness-chip" aria-label={`${status.title}. ${status.detail}`}
          className={cn("min-w-0 flex-1 truncate text-right text-[9px] font-semibold", status.tone === "ready"
            ? "text-emerald-700 dark:text-emerald-300"
            : status.tone === "attention" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {status.title}
        </span>}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && <div className="min-w-0 space-y-2" data-testid="room-emergency-evacuation-content">
        <div className={cn("flex items-start gap-2 rounded-xl border p-2.5", status.tone === "ready"
          ? "border-emerald-500/25 bg-emerald-500/5"
          : status.tone === "attention" ? "border-amber-500/25 bg-amber-500/5" : "border-border bg-background/60")}
          role="status" aria-live="polite" data-testid="room-emergency-validation-summary">
          {status.tone === "ready" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
            : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold leading-snug text-foreground">{status.title}</p>
            <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">{status.detail}</p>
            {resolvedPrimary && <p className="mt-1 text-[9px] font-semibold text-foreground" data-testid="room-resolved-assembly-point">
              Resolved Assembly Point: {resolvedPrimary.name}{resolvedPrimaryIsExplicit ? " · Building Primary" : " · Campus-wide Primary"}
            </p>}
          </div>
          {canInspect && <button type="button" onClick={inspectProblem}
            disabled={Boolean(inspectableDoor && !onInspectConnection) || Boolean(!inspectableDoor && firstRequirement && !onInspectReviewRequirement)}
            className="min-h-8 shrink-0 rounded-lg px-2 text-[9px] font-bold text-primary hover:bg-primary/10 disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            Inspect
          </button>}
        </div>
        {error && <p role="alert" className="text-[9px] leading-relaxed text-destructive">{error}</p>}

        <details className="rounded-lg border border-border/70 bg-background/45 px-2.5 py-2" data-testid="room-emergency-door-statuses"
          open={inspectingConnections} onToggle={(event) => setInspectingConnections(event.currentTarget.open)}>
          <summary className="min-h-8 cursor-pointer select-none py-1 text-[9px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Inspect Connections</summary>
          <div className="mt-1.5 space-y-1.5 border-t border-border pt-2">
            {!evaluation ? <p className="text-[9px] leading-relaxed text-muted-foreground">Route readiness is being calculated.</p> : <>
              {evaluation.doorReadiness.length === 0
                ? <p className="text-[9px] leading-relaxed text-muted-foreground">No physical access doors are assigned. Add a Room Door, then connect it to the Walking Network.</p>
                : evaluation.doorReadiness.map((door) => <div key={`${door.doorId}:${door.state}`} className="flex items-start gap-1.5">
                  {door.state === "route_ready" ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />}
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <p className="min-w-0 text-[9px] leading-relaxed"><span className="font-bold text-foreground">{door.label}: </span><span className="text-muted-foreground">{door.detail}</span></p>
                    {door.state !== "route_ready" && <button type="button" onClick={() => onInspectConnection?.(door.doorId)} disabled={!onInspectConnection}
                      className="min-h-7 shrink-0 rounded-md px-1.5 text-[8px] font-bold text-primary hover:bg-primary/10 disabled:opacity-50">Inspect</button>}
                  </div>
                </div>)}
              {requirements.map((requirement) => <div key={`${requirement.kind}:${requirement.id}`} className="flex items-start justify-between gap-2 border-t border-border/60 pt-1.5">
                <p className="min-w-0 text-[9px] leading-relaxed"><span className="font-bold text-foreground">{requirement.label}: </span><span className="text-muted-foreground">{requirement.detail}</span></p>
                <button type="button" onClick={() => onInspectReviewRequirement?.(requirement)} disabled={!onInspectReviewRequirement}
                  className="min-h-7 shrink-0 rounded-md px-1.5 text-[8px] font-bold text-primary hover:bg-primary/10 disabled:opacity-50">Inspect</button>
              </div>)}
              {evaluation.message && <p className="border-t border-border pt-1.5 text-[9px] leading-relaxed text-muted-foreground">{evaluation.message}</p>}
            </>}
          </div>
        </details>

        {/* Fingerprint and approval checks remain in this separate video flow. */}
        <EmergencyEvacuationVideoAdminSection campus={campus} buildingId={buildingId} floorId={floorId} room={room} configuration={config} onChange={onChange} />
      </div>}
    </section>
  );
}
