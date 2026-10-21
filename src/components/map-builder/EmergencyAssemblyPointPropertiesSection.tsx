import { useEffect, useMemo, useState } from "react";
import { Flag, Link2, Search, Trash2, X } from "lucide-react";
import type { AssemblyPoint, Campus } from "./types";
import { analyzeEmergencyOutdoorConnectivity } from "../../lib/emergencyOutdoorConnectivity";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface EmergencyAssemblyPointPropertiesSectionProps {
  campus: Campus;
  point: AssemblyPoint;
  onUpdate: (id: string, changes: Partial<AssemblyPoint>) => void;
  onReassignPrimary?: (fromPointId: string, toPointId: string, buildingId: string) => void;
  onConnect: (id: string) => void;
  onInspectOutdoorNetwork?: (id: string) => void;
  onClearOutdoorNetworkInspection?: () => void;
  onDelete: (id: string) => void;
}

export function EmergencyAssemblyPointPropertiesSection({ campus, point, onUpdate, onReassignPrimary, onConnect, onInspectOutdoorNetwork, onClearOutdoorNetworkInspection, onDelete }: EmergencyAssemblyPointPropertiesSectionProps) {
  const [name, setName] = useState(point.name);
  const [search, setSearch] = useState("");
  const [networkInspectionOpen, setNetworkInspectionOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingPrimaryReassignment, setPendingPrimaryReassignment] = useState<{ buildingId: string; owner: AssemblyPoint } | null>(null);
  useEffect(() => { setName(point.name); }, [point.id, point.name]);

  const assignments = point.buildingAssignments ?? [];
  const primaryCount = assignments.filter((assignment) => assignment.designation === "primary").length;
  const alternateCount = assignments.filter((assignment) => assignment.designation === "alternate").length;
  const visibleBuildings = useMemo(() => campus.buildings.filter((building) => {
    const query = search.trim().toLowerCase();
    return !query || `${building.name} ${building.code}`.toLowerCase().includes(query);
  }), [campus.buildings, search]);
  const networkReport = useMemo(() => analyzeEmergencyOutdoorConnectivity(campus, point), [campus, point]);
  const networkConnected = networkReport.state === "connected";
  const sharedNetworkComponent = networkReport.assemblyComponent.nodeIds.length === networkReport.mainComponent.nodeIds.length
    && networkReport.assemblyComponent.nodeIds.every((id) => networkReport.mainComponent.nodeIds.includes(id));
  const networkStatusLabel = networkConnected ? "Connected to campus paths" : "Connection needed";
  const networkStatusColor = networkConnected ? "text-emerald-700 dark:text-emerald-300"
    : "text-amber-700 dark:text-amber-300";

  const setAssignment = (buildingId: string, designation?: "primary" | "alternate") => {
    const next = assignments.filter((assignment) => assignment.buildingId !== buildingId);
    if (designation) next.push({ buildingId, designation });
    onUpdate(point.id, { buildingAssignments: next });
  };
  const primaryOwnerFor = (buildingId: string) => campus.assemblyPoints?.find((other) => other.id !== point.id
    && other.buildingAssignments?.some((assignment) => assignment.buildingId === buildingId && assignment.designation === "primary"));
  const assignmentConflict = (buildingId: string, designation: "primary" | "alternate") => designation === "primary"
    && Boolean(primaryOwnerFor(buildingId));

  return <section data-testid="emergency-assembly-point-properties" className="space-y-3">
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Flag className="h-4 w-4" fill="currentColor" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Emergency Assembly Point</div>
        {point.campusWidePrimary && <div className="mt-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300" data-testid="assembly-campus-primary-status">Campus-wide Primary · buildings without a Primary override inherit this point.</div>}
      </div>
    </div>

    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground" htmlFor="assembly-point-name">Name</label>
      <input id="assembly-point-name" data-testid="assembly-point-name" value={name} maxLength={80}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => { const next = name.trim() || "Emergency Assembly Point"; setName(next); if (next !== point.name) onUpdate(point.id, { name: next }); }}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        className="h-10 w-full rounded-xl border border-border bg-input-background px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </div>

    <div className="rounded-xl border border-border bg-muted/20 p-2.5" data-testid="assembly-connection-status">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link2 className={`h-3.5 w-3.5 shrink-0 ${networkConnected ? "text-emerald-600" : networkReport.state === "invalid_anchor" ? "text-red-600" : "text-amber-600"}`} />
          <div className="min-w-0">
            <div className={`text-[10px] font-bold ${networkStatusColor}`} data-testid="assembly-outdoor-network-status">
              {networkStatusLabel}
            </div>
          </div>
        </div>
        <button type="button" data-testid="assembly-connect-pathway" onClick={() => onConnect(point.id)} className="min-h-9 shrink-0 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-2.5 text-[9px] font-bold text-emerald-800 hover:bg-emerald-600/15 dark:text-emerald-200">
          {networkConnected ? "Edit Connection" : networkReport.assemblyComponent.edgeIds.length > 0 ? "Edit Connection" : "Connect"}
        </button>
      </div>
      <button type="button" data-testid="assembly-inspect-connections" aria-expanded={networkInspectionOpen}
        onClick={() => {
          const nextOpen = !networkInspectionOpen;
          setNetworkInspectionOpen(nextOpen);
          if (nextOpen) onInspectOutdoorNetwork?.(point.id);
          else onClearOutdoorNetworkInspection?.();
        }}
        className="mt-2 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background/70 px-2 text-[9px] font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <Search className="h-3 w-3" />{networkInspectionOpen ? "Hide Connection Details" : "Inspect Connections"}
      </button>
      {networkInspectionOpen && <div className="mt-2 space-y-2 border-t border-border/70 pt-2" data-testid="assembly-outdoor-connectivity-report" aria-live="polite">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[9px] leading-relaxed text-foreground">{networkReport.summary}</p>
          <button type="button" aria-label="Clear outdoor network highlight" onClick={() => { setNetworkInspectionOpen(false); onClearOutdoorNetworkInspection?.(); }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
        <p className="text-[9px] leading-relaxed text-muted-foreground">{networkReport.nextAction}</p>
        {(networkReport.state === "connected" || networkReport.mainComponent.nodeIds.length > 0) && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[8px] font-semibold">
          {sharedNetworkComponent
            ? <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300" data-testid="assembly-main-network-legend"><i className="h-1.5 w-1.5 rounded-full bg-sky-500" />Assembly Point in main campus component</span>
            : <>
              <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300" data-testid="assembly-component-legend"><i className="h-1.5 w-1.5 rounded-full bg-violet-500" />Assembly Point component</span>
              <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300" data-testid="main-campus-component-legend"><i className="h-1.5 w-1.5 rounded-full bg-sky-500" />Main campus component</span>
            </>}
        </div>}
        {networkReport.blockedEdges.map((edge) => <div key={edge.edgeId} className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-[8px] leading-relaxed" data-testid="assembly-blocked-outdoor-edge">
          <span className="font-bold text-foreground">{edge.label} · {edge.edgeId}</span><span className="block text-muted-foreground">{edge.reason}</span>
        </div>)}
        {networkReport.nearestGap && <p className="text-[8px] leading-relaxed text-muted-foreground" data-testid="assembly-nearest-outdoor-gap">
          Nearest existing graph nodes: <span className="font-semibold text-foreground">{networkReport.nearestGap.assemblyLabel}</span> to <span className="font-semibold text-foreground">{networkReport.nearestGap.networkLabel}</span> ({networkReport.nearestGap.distance} map units). This is a diagnostic only; it does not create a connection.
        </p>}
      </div>}
    </div>

    <details className="rounded-xl border border-border bg-background/45" data-testid="assembly-assignment-details">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <span className="text-[10px] font-bold text-foreground">Assigned Buildings</span>
        <span className="text-right text-[9px] font-semibold text-muted-foreground">Primary for {primaryCount} · Alternate for {alternateCount}</span>
      </summary>
      <div className="space-y-2 border-t border-border px-2.5 py-2.5">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search buildings for assembly assignment" placeholder="Search buildings" className="h-9 w-full rounded-lg border border-border bg-input-background pl-8 pr-2 text-[10px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1" data-testid="assembly-building-assignments">
        {visibleBuildings.map((building) => {
          const assignment = assignments.find((item) => item.buildingId === building.id);
          const primaryBlocked = assignmentConflict(building.id, "primary") && assignment?.designation !== "primary";
          const alternateBlocked = assignmentConflict(building.id, "alternate") && assignment?.designation !== "alternate";
          const defaultDesignation = !primaryBlocked ? "primary" : !alternateBlocked ? "alternate" : undefined;
          return <div key={building.id} className="flex min-h-8 items-center gap-1.5 rounded-md px-1.5 hover:bg-muted/50">
            <button type="button" disabled={!assignment && !defaultDesignation} aria-pressed={Boolean(assignment)} aria-label={`${assignment ? "Remove" : "Assign"} ${building.code} ${building.name}`}
              title={!assignment && !defaultDesignation ? "This building already has a primary Assembly Point." : undefined}
              onClick={() => setAssignment(building.id, assignment ? undefined : defaultDesignation)}
              className={`min-w-0 flex-1 truncate text-left text-[10px] font-semibold ${assignment ? "text-foreground" : "text-muted-foreground"}`}>
              <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border align-[-1px] ${assignment ? "border-emerald-600 bg-emerald-600" : "border-muted-foreground/50"}`} />{building.code} · {building.name}
            </button>
            {assignment && <div className="flex shrink-0 gap-0.5">
              <button type="button" aria-pressed={assignment.designation === "primary"} title={primaryBlocked ? "Reassign this building's Primary Assembly Point" : "Set Primary Assembly Point"}
                onClick={() => {
                  const owner = primaryOwnerFor(building.id);
                  if (owner) setPendingPrimaryReassignment({ buildingId: building.id, owner });
                  else setAssignment(building.id, "primary");
                }} className={`rounded px-1.5 py-1 text-[8px] font-extrabold ${assignment.designation === "primary" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>Primary</button>
              <button type="button" disabled={alternateBlocked} aria-pressed={assignment.designation === "alternate"} title="Set Alternate Assembly Point"
                onClick={() => setAssignment(building.id, "alternate")} className={`rounded px-1.5 py-1 text-[8px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${assignment.designation === "alternate" ? "bg-slate-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>Alternate</button>
            </div>}
            {!assignment && primaryOwnerFor(building.id) && <button type="button" onClick={() => setPendingPrimaryReassignment({ buildingId: building.id, owner: primaryOwnerFor(building.id)! })}
              className="min-h-8 shrink-0 rounded-lg border border-amber-500/30 px-2 text-[8px] font-bold text-amber-800 hover:bg-amber-500/10 dark:text-amber-200">Reassign Primary</button>}
          </div>;
        })}
        {visibleBuildings.length === 0 && <div className="px-2 py-3 text-center text-[9px] text-muted-foreground">No matching buildings.</div>}
      </div>
      {assignments.length === 0 && !point.campusWidePrimary && <p className="text-[9px] text-amber-700 dark:text-amber-300">Assign a building or designate a campus-wide Primary to use this point for SOS.</p>}
      </div>
    </details>

    <button type="button" data-testid="assembly-point-delete" onClick={() => setConfirmDelete(true)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 text-[10px] font-bold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" />Delete Assembly Point</button>
    <ConfirmDialog open={Boolean(pendingPrimaryReassignment)} title="Reassign the Primary Assembly Point?"
      message={pendingPrimaryReassignment ? `${pendingPrimaryReassignment.owner.name} is currently Primary for ${campus.buildings.find((building) => building.id === pendingPrimaryReassignment.buildingId)?.name ?? "this building"}. Make ${point.name} the new Primary? The existing Primary assignment will move to this point.` : ""}
      confirmLabel="Reassign Primary" onConfirm={() => {
        if (!pendingPrimaryReassignment) return;
        const { buildingId } = pendingPrimaryReassignment;
        if (onReassignPrimary) {
          onReassignPrimary(pendingPrimaryReassignment.owner.id, point.id, buildingId);
        } else {
          const owner = campus.assemblyPoints?.find((candidate) => candidate.id === pendingPrimaryReassignment.owner.id);
          if (owner) onUpdate(owner.id, { buildingAssignments: (owner.buildingAssignments ?? []).filter((assignment) => assignment.buildingId !== buildingId) });
          setAssignment(buildingId, "primary");
        }
        setPendingPrimaryReassignment(null);
      }} onCancel={() => setPendingPrimaryReassignment(null)} />
    <ConfirmDialog open={confirmDelete} title="Delete Emergency Assembly Point?"
      message={`Delete “${point.name}” and remove its ${assignments.length} building assignment${assignments.length === 1 ? "" : "s"}? Its linked waypoint and authored connectors will be cleaned up, while shared Pathway geometry is preserved.`}
      confirmLabel="Delete Point" onConfirm={() => { setConfirmDelete(false); onDelete(point.id); }} onCancel={() => setConfirmDelete(false)} />
  </section>;
}
