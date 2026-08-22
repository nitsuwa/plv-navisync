import { useState, useCallback, useMemo } from "react";
import { Route, Navigation, ArrowRight, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { findNavigationRoute } from "../../lib/pathfinding";
import type { GraphPath } from "../../lib/pathfinding";
import type { Campus } from "./types";

interface TestNavigationPanelProps {
  campus: Campus;
  onHighlightRoute: (route: { waypoints: { x: number; y: number }[]; color: string } | null) => void;
  onFocusNode: (nodeId: string) => void;
  onClose?: () => void;
}

/* ── Helpers to build grouped options from campus data ── */

type OptionEntry = { value: string; label: string; group: string; nodeHint?: string };

type CampusNavNode = NonNullable<Campus["navNodes"]>[number];

function linkedNodeKind(node: CampusNavNode): "room" | "door" | "stair" | "elevator" | "ramp" | null {
  if (node.roomId) return "room";
  if (node.doorId) return "door";
  if (node.stairId) return "stair";
  if (node.elevatorId) return "elevator";
  if (node.rampId) return "ramp";
  return null;
}

function linkedNodeLabel(node: CampusNavNode): string {
  const kind = linkedNodeKind(node);
  const fallback = kind === "door" ? "Door"
    : kind === "stair" ? "Stair"
    : kind === "elevator" ? "Elevator"
    : kind === "ramp" ? "Ramp"
    : "Walking Point";
  return node.name || fallback;
}

function buildStartOptions(campus: Campus): OptionEntry[] {
  const opts: OptionEntry[] = [];
  const buildings = campus.buildings ?? [];
  const nodes = campus.navNodes ?? [];

  for (const b of buildings) {
    opts.push({ value: `building:${b.id}`, label: `${b.code} — ${b.name}`, group: "Buildings", nodeHint: b.entranceNodeId ?? undefined });
  }
  // Entrances that have an outdoor nav node
  for (const b of buildings) {
    for (const ent of b.entrances ?? []) {
      // Find the nav node linked to this entrance
      const linkedNode = nodes.find(n => n.entranceId === ent.id);
      if (linkedNode) {
        const entLabel = ent.name || `${b.code} Entrance`;
        opts.push({ value: `node:${linkedNode.id}`, label: entLabel, group: "Entrances" });
      }
    }
  }
  // Linked Rooms are first-class starting locations as well as destinations.
  // Only expose Rooms that already have a canonical linked node so choosing a
  // Start cannot silently resolve to an unrelated nearby node.
  for (const b of buildings) {
    for (const floor of b.floors ?? []) {
      for (const room of floor.rooms ?? []) {
        const linkedRoom = nodes.find((node) => node.roomId === room.id && node.buildingId === b.id);
        const accessNode = room.accessNodeId
          ? nodes.find((node) => node.id === room.accessNodeId && node.buildingId === b.id)
          : undefined;
        const resolvedRoomNode = linkedRoom ?? accessNode;
        if (!resolvedRoomNode) continue;
        opts.push({
          value: `room:${b.id}:${room.id}`,
          label: `${room.name} (${floor.label})`,
          group: `Rooms · ${b.code}`,
          nodeHint: resolvedRoomNode.id,
        });
      }
    }
  }
  // Linked Doors/Stairs/Elevators/Ramps are usable starts too; keep them in a
  // physical, non-technical group rather than exposing generated node IDs.
  for (const node of nodes) {
    if (node.entranceId || !linkedNodeKind(node) || linkedNodeKind(node) === "room") continue;
    opts.push({ value: `node:${node.id}`, label: linkedNodeLabel(node), group: "Circulation" });
  }
  // Anonymous walking points only (linked physical locations are listed above).
  for (const n of nodes) {
    if (!n.entranceId && !linkedNodeKind(n)) {
      opts.push({ value: `node:${n.id}`, label: n.name || "Walking Point", group: "Walking Points" });
    }
  }
  return opts;
}

function buildDestinationOptions(campus: Campus): OptionEntry[] {
  const opts: OptionEntry[] = [];
  const buildings = campus.buildings ?? [];
  const nodes = campus.navNodes ?? [];
  const assemblyPoints = campus.assemblyPoints ?? [];
  const eventOverlays = (campus.eventOverlays ?? []).filter(e => !!e.locationRef);

  // Rooms (grouped by building)
  for (const b of buildings) {
    for (const floor of b.floors ?? []) {
      for (const room of floor.rooms ?? []) {
        opts.push({
          value: `room:${b.id}:${room.id}`,
          label: `${room.name} (${floor.label})`,
          group: `Rooms · ${b.code}`,
        });
      }
    }
  }
  // Buildings
  for (const b of buildings) {
    opts.push({ value: `building:${b.id}`, label: `${b.code} — ${b.name}`, group: "Buildings" });
  }
  // Entrances
  for (const b of buildings) {
    for (const ent of b.entrances ?? []) {
      const linkedNode = nodes.find(n => n.entranceId === ent.id);
      if (linkedNode) {
        opts.push({ value: `node:${linkedNode.id}`, label: ent.name || `${b.code} Entrance`, group: "Entrances" });
      }
    }
  }
  // Linked physical circulation locations get a real-world label instead of
  // appearing as anonymous Walking Points.
  for (const node of nodes) {
    if (node.entranceId || !linkedNodeKind(node) || linkedNodeKind(node) === "room") continue;
    opts.push({ value: `node:${node.id}`, label: linkedNodeLabel(node), group: "Circulation" });
  }
  // Anonymous walking points only.
  for (const n of nodes) {
    if (!n.entranceId && !linkedNodeKind(n)) {
      opts.push({ value: `node:${n.id}`, label: n.name || "Walking Point", group: "Walking Points" });
    }
  }
  // Assembly areas
  for (const ap of assemblyPoints) {
    opts.push({ value: `assembly:${ap.id}`, label: ap.name || "Assembly Area", group: "Special Locations" });
  }
  // Events
  for (const ev of eventOverlays) {
    opts.push({ value: `event:${ev.id}`, label: ev.title || "Event", group: "Events" });
  }
  return opts;
}

/* ── Resolve a combined value to a nav node ID ── */

function resolveNodeId(
  value: string,
  campus: Campus,
): string | null {
  if (!value) return null;
  const [type, id] = value.split(":");
  const buildings = campus.buildings ?? [];
  const nodes = campus.navNodes ?? [];
  const assemblyPoints = campus.assemblyPoints ?? [];

  if (type === "node") return id;
  if (type === "building") {
    const b = buildings.find(x => x.id === id);
    if (!b) return null;
    if (b.entranceNodeId) return b.entranceNodeId;
    // Fallback: nearest node to building center
    if (nodes.length === 0) return null;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    let best = nodes[0], bestDist = Infinity;
    for (const n of nodes) { const d = Math.hypot(n.x - cx, n.y - cy); if (d < bestDist) { bestDist = d; best = n; } }
    return bestDist < 100 ? best.id : null;
  }
  if (type === "room") {
    const [, bId, rId] = value.split(":");
    const b = buildings.find(x => x.id === bId);
    if (!b) return null;
    for (const floor of b.floors ?? []) {
      const room = floor.rooms.find(r => r.id === rId);
      if (room) {
        // Prefer the canonical linked Room node created by Floor Editor. The
        // legacy accessNodeId remains supported when it points at a real node.
        const linkedRoom = nodes.find((node) => node.roomId === room.id && node.buildingId === b.id);
        if (linkedRoom) return linkedRoom.id;
        if (room.accessNodeId && nodes.some((node) => node.id === room.accessNodeId)) return room.accessNodeId;
        const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
        if (nodes.length === 0) return null;
        let best = nodes[0], bestDist = Infinity;
        for (const n of nodes) { const d = Math.hypot(n.x - cx, n.y - cy); if (d < bestDist) { bestDist = d; best = n; } }
        return bestDist < 100 ? best.id : null;
      }
    }
    return null;
  }
  if (type === "assembly") {
    const ap = assemblyPoints.find(a => a.id === id);
    if (!ap) return null;
    if (ap.navNodeId) return ap.navNodeId;
    if (nodes.length === 0) return null;
    let best = nodes[0], bestDist = Infinity;
    for (const n of nodes) { const d = Math.hypot(n.x - ap.x, n.y - ap.y); if (d < bestDist) { bestDist = d; best = n; } }
    return bestDist < 100 ? best.id : null;
  }
  if (type === "event") {
    const ev = (campus.eventOverlays ?? []).find(e => e.id === id);
    if (!ev || !ev.locationRef) return null;
    const b = buildings.find(x => x.id === ev.locationRef!.buildingId);
    if (!b) return null;
    if (ev.locationRef.type === "room" && ev.locationRef.roomId) {
      for (const floor of b.floors ?? []) {
        const room = floor.rooms.find(r => r.id === ev.locationRef!.roomId);
        if (room && room.accessNodeId) return room.accessNodeId;
      }
    }
    if (b.entranceNodeId) return b.entranceNodeId;
    if (nodes.length === 0) return null;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    let best = nodes[0], bestDist = Infinity;
    for (const n of nodes) { const d = Math.hypot(n.x - cx, n.y - cy); if (d < bestDist) { bestDist = d; best = n; } }
    return bestDist < 100 ? best.id : null;
  }
  return null;
}

/**
 * PART 4: Build a continuous display polyline from the routed node sequence
 * by looking up the actual NavigationEdge geometry (including bendPoints) for
 * each consecutive pair. If an edge is traversed backwards, its bendPoints
 * are reversed. Duplicate coordinates at edge junctions are avoided.
 */
function buildRoutePolyline(
  nodeIds: string[],
  edges: { id: string; startNodeId: string; endNodeId: string; bidirectional: boolean; bendPoints?: { x: number; y: number }[] }[],
  nodes: { id: string; x: number; y: number }[],
): { x: number; y: number }[] {
  if (nodeIds.length < 2) {
    // Single node — return just its position
    const n = nodes.find(nd => nd.id === nodeIds[0]);
    return n ? [{ x: n.x, y: n.y }] : [];
  }

  const nodePos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) nodePos.set(n.id, { x: n.x, y: n.y });

  // Build edge lookup: key = "id_a>id_b" or "id_b>id_a" for bidirectional
  const edgeLookup = new Map<string, typeof edges[0]>();
  for (const edge of edges) {
    edgeLookup.set(`${edge.startNodeId}>${edge.endNodeId}`, edge);
    if (edge.bidirectional) {
      edgeLookup.set(`${edge.endNodeId}>${edge.startNodeId}`, edge);
    }
  }

  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const fromId = nodeIds[i];
    const toId = nodeIds[i + 1];
    const edge = edgeLookup.get(`${fromId}>${toId}`);
    const fromPos = nodePos.get(fromId);
    const toPos = nodePos.get(toId);

    if (!edge || !fromPos || !toPos) {
      // Fallback: straight line between nodes
      if (points.length === 0 || !lastPointMatches(points, fromPos)) {
        if (fromPos) points.push({ ...fromPos });
      }
      if (toPos) points.push({ ...toPos });
      continue;
    }

    // Determine traversal direction
    const isForward = edge.startNodeId === fromId && edge.endNodeId === toId;
    const bends = edge.bendPoints ?? [];

    // Add start node (avoid duplicate if last point already matches)
    if (points.length === 0 || !lastPointMatches(points, fromPos)) {
      points.push({ ...fromPos });
    }

    // Add bend points in correct traversal order
    if (bends.length > 0) {
      const orderedBends = isForward ? bends : [...bends].reverse();
      for (const bend of orderedBends) {
        points.push({ x: bend.x, y: bend.y });
      }
    }

    // Add end node (avoid duplicate)
    if (!lastPointMatches(points, toPos)) {
      points.push({ ...toPos });
    }
  }

  return points;
}

function lastPointMatches(points: { x: number; y: number }[], target?: { x: number; y: number }): boolean {
  if (!target || points.length === 0) return false;
  const last = points[points.length - 1];
  return last.x === target.x && last.y === target.y;
}

export function TestNavigationPanel({
  campus,
  onHighlightRoute,
  onFocusNode,
  onClose,
}: TestNavigationPanelProps) {
  const [startValue, setStartValue] = useState("");
  const [destValue, setDestValue] = useState("");
  const [routeMode, setRouteMode] = useState<"standard" | "accessible" | "emergency">("standard");
  const [result, setResult] = useState<GraphPath | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buildings = campus.buildings ?? [];
  const nodes = campus.navNodes ?? [];
  const edges = campus.navEdges ?? [];

  const startOptions = useMemo(() => buildStartOptions(campus), [campus]);
  const destOptions = useMemo(() => buildDestinationOptions(campus), [campus]);

  const canCalculate = startValue !== "" && destValue !== "" && !loading;

  const handleCalculate = useCallback(() => {
    setLoading(true);
    setError(null);
    setResult(null);
    onHighlightRoute(null);

    const fromId = resolveNodeId(startValue, campus);
    const toId = resolveNodeId(destValue, campus);

    if (!fromId) {
      setError("Select a starting location.");
      setLoading(false);
      return;
    }
    if (!toId) {
      setError("Select a destination.");
      setLoading(false);
      return;
    }
    if (fromId === toId) {
      setError("__SAME_LOCATION__");
      setLoading(false);
      return;
    }

    const fromExists = nodes.some(n => n.id === fromId);
    const toExists = nodes.some(n => n.id === toId);
    if (!fromExists) {
      setError("The starting point has no navigation connection. Connect it to the walking network first.");
      setLoading(false);
      return;
    }
    if (!toExists) {
      setError("The destination has no navigation connection. Assign a walking point or link it to the network.");
      setLoading(false);
      return;
    }

    const accessibleOnly = routeMode === "accessible";
    const emergencyMode = routeMode === "emergency";
    const routeColor = emergencyMode ? "#dc2626" : accessibleOnly ? "#2563eb" : "#3b82f6";
    const path = findNavigationRoute(nodes, edges, fromId, toId, accessibleOnly, emergencyMode);

    if (!path) {
      const fromNode = nodes.find(n => n.id === fromId);
      const toNode = nodes.find(n => n.id === toId);

      if (toNode && !edges.some(e => e.startNodeId === toId || e.endNodeId === toId)) {
        setError("Destination is disconnected — it has no walking paths. Use Connect to link it.");
      } else if (fromNode && !edges.some(e => e.startNodeId === fromId || e.endNodeId === fromId)) {
        setError("Starting point is disconnected — it has no walking paths. Use Connect to link it.");
      } else if (accessibleOnly) {
        const accessibleEdges = edges.filter(e => e.accessible);
        if (accessibleEdges.length === 0) {
          setError("No accessible routes available — no paths are marked as accessible.");
        } else {
          setError("No accessible route found. The destination may only be reachable through stairs or inaccessible paths.");
        }
      } else if (emergencyMode) {
        const safeEdges = edges.filter(e => e.emergencySafe !== false);
        if (safeEdges.length === 0) {
          setError("No emergency-safe routes available — all paths are marked unsafe.");
        } else {
          setError("No emergency route found. The destination may be behind restricted or hazardous paths.");
        }
      } else if (fromNode && toNode && fromNode.floorId !== toNode.floorId) {
        setError("Floor transition unavailable — no stair or elevator links these floors.");
      } else {
        setError("No route found. The locations may not be connected in the walking network.");
      }
      setLoading(false);
      return;
    }

    // PART 4: Reconstruct the display polyline using actual edge geometry
    // (bendPoints) so the highlight follows the authored walking network
    // instead of drawing a misleading diagonal between node positions.
    const displayWaypoints = buildRoutePolyline(path.nodeIds, edges, nodes);
    setResult(path);
    onHighlightRoute({ waypoints: displayWaypoints, color: routeColor });
    setLoading(false);
  }, [startValue, destValue, routeMode, nodes, edges, campus, onHighlightRoute]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    onHighlightRoute(null);
  }, [onHighlightRoute]);

  // Group options by their group label
  const groupOptions = (options: OptionEntry[]) => {
    const groups: { label: string; items: OptionEntry[] }[] = [];
    let current = "";
    for (const opt of options) {
      if (opt.group !== current) {
        current = opt.group;
        groups.push({ label: opt.group, items: [] });
      }
      groups[groups.length - 1].items.push(opt);
    }
    return groups;
  };

  const startGroups = useMemo(() => groupOptions(startOptions), [startOptions]);
  const destGroups = useMemo(() => groupOptions(destOptions), [destOptions]);

  const routeModeOptions = [
    { key: "standard" as const, label: "Standard", tip: "Normal walking route" },
    { key: "accessible" as const, label: "Accessible", tip: "Avoid inaccessible paths" },
    { key: "emergency" as const, label: "Emergency", tip: "Use emergency-safe routes" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border shrink-0">
        <Route className="h-4 w-4 text-blue-500" />
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Test Route</span>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Intro */}
      <div className="px-4 py-2.5 border-b border-border/50 shrink-0">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Choose a start and destination to verify the walking network.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* START */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Start</label>
          <select
            value={startValue}
            onChange={(e) => { setStartValue(e.target.value); setError(null); setResult(null); onHighlightRoute(null); }}
            className="w-full h-9 px-2.5 rounded-lg border border-border bg-input-background text-foreground text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select"
          >
            <option value="">Select starting location…</option>
            {startGroups.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* DESTINATION */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Destination</label>
          <select
            value={destValue}
            onChange={(e) => { setDestValue(e.target.value); setError(null); setResult(null); onHighlightRoute(null); }}
            className="w-full h-9 px-2.5 rounded-lg border border-border bg-input-background text-foreground text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select"
          >
            <option value="">Select destination…</option>
            {destGroups.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* ROUTE MODE */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Route Mode</label>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-border bg-muted/30">
            {routeModeOptions.map((m) => (
              <button
                key={m.key}
                title={m.tip}
                onClick={() => setRouteMode(m.key)}
                className={cn(
                  "h-8 rounded-md text-[11px] font-bold transition-all",
                  routeMode === m.key
                    ? m.key === "emergency" ? "bg-red-500 text-white shadow-sm"
                    : m.key === "accessible" ? "bg-blue-500 text-white shadow-sm"
                    : "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >{m.label}</button>
            ))}
          </div>
        </div>

        {/* CALCULATE */}
        <button
          onClick={handleCalculate}
          disabled={!canCalculate}
          title={canCalculate ? undefined : "Choose a start and destination first."}
          className={cn(
            "w-full h-10 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-2",
            canCalculate
              ? "bg-blue-500 hover:bg-blue-600 text-white shadow-sm"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Route className="h-3.5 w-3.5" />
          )}
          {loading ? "Calculating…" : "Calculate Route"}
        </button>

        {/* RESULTS */}
        {error === "__SAME_LOCATION__" && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Already at destination</span>
              <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">You selected the same start and destination.</p>
            </div>
          </div>
        )}

        {error && error !== "__SAME_LOCATION__" && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <span className="text-[11px] text-destructive leading-relaxed">{error}</span>
          </div>
        )}

        {result && (
          <div className={cn(
            "space-y-2 px-3 py-2.5 rounded-lg border",
            routeMode === "emergency"
              ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700/20"
              : routeMode === "accessible"
                ? "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-700/20"
                : "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/20"
          )}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={cn("h-3.5 w-3.5",
                routeMode === "emergency" ? "text-red-500" : routeMode === "accessible" ? "text-blue-500" : "text-green-500"
              )} />
              <span className={cn("text-[11px] font-bold",
                routeMode === "emergency" ? "text-red-600 dark:text-red-400" : routeMode === "accessible" ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"
              )}>
                {routeMode === "emergency" ? "Emergency Route" : routeMode === "accessible" ? "Accessible Route" : "Route Found"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span><strong>{result.distanceM}m</strong> distance</span>
              <span className="opacity-50">·</span>
              <span><strong>{result.minutes} min</strong> estimated walk</span>
            </div>
            {result.steps.length > 0 && (
              <div className="space-y-0.5 pt-1.5 border-t border-current/10">
                {result.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <ArrowRight className="h-2.5 w-2.5 text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-[10px] text-muted-foreground leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(result || (error && error !== "__SAME_LOCATION__")) && (
          <button
            onClick={clear}
            className="w-full h-8 rounded-lg border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
