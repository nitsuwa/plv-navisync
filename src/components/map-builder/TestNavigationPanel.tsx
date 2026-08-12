import { useState, useCallback, useMemo } from "react";
import { Route, MapPin, Navigation, ArrowRight, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { findNavigationRoute } from "../../lib/pathfinding";
import { outdoorNavNodes, outdoorNavEdges } from "../../lib/navigationGraph";
import type { GraphPath } from "../../lib/pathfinding";
import type { Campus, NavigationNode, CampusBuilding, CampusEventOverlay } from "./types";
import { genId } from "./constants";

interface TestNavigationPanelProps {
  campus: Campus;
  /** Callback to highlight a route on the canvas (waypoints + color) */
  onHighlightRoute: (route: { waypoints: { x: number; y: number }[]; color: string } | null) => void;
  /** Callback to pan/zoom to a specific nav node */
  onFocusNode: (nodeId: string) => void;
}

export function TestNavigationPanel({
  campus,
  onHighlightRoute,
  onFocusNode,
}: TestNavigationPanelProps) {
  const [fromType, setFromType] = useState<"building" | "node">("building");
  const [toType, setToType] = useState<"building" | "room" | "node" | "assembly" | "event">("room");
  const [fromBuildingId, setFromBuildingId] = useState("");
  const [fromNodeId, setFromNodeId] = useState("");
  const [toBuildingId, setToBuildingId] = useState("");
  const [toRoomId, setToRoomId] = useState("");
  const [toNodeId, setToNodeId] = useState("");
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [result, setResult] = useState<GraphPath | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buildings = campus.buildings;
  // B5 Phase 2.9: outdoor-scope graph only — indoor floor nodes/edges never
  // enter the outdoor route-testing panel.
  const navNodes = outdoorNavNodes(campus.navNodes);
  const navEdges = outdoorNavEdges(campus.navEdges, navNodes);
  const assemblyPoints = campus.assemblyPoints ?? [];

  // Resolve assembly point and event overlay
  const [toAssemblyId, setToAssemblyId] = useState("");
  const [toEventId, setToEventId] = useState("");
  const eventOverlays = (campus.eventOverlays ?? []).filter(e => !!e.locationRef);

  // Resolve the actual nav node ID for the "from" selection
  const resolveFromNodeId = useCallback((): string | null => {
    if (fromType === "node") return fromNodeId || null;
    // Building: use entranceNodeId if set, otherwise find the nearest node
    const b = buildings.find(b => b.id === fromBuildingId);
    if (!b) return null;
    if (b.entranceNodeId) return b.entranceNodeId;
    // Fallback: find nearest node to building center
    if (navNodes.length === 0) return null;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    let best = navNodes[0];
    let bestDist = Infinity;
    for (const n of navNodes) {
      const d = Math.hypot(n.x - cx, n.y - cy);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    return bestDist < 100 ? best.id : null;
  }, [fromType, fromNodeId, fromBuildingId, buildings, navNodes]);

  // Resolve the actual nav node ID for the "to" selection
  const resolveToNodeId = useCallback((): string | null => {
    if (toType === "node") return toNodeId || null;
    if (toType === "assembly") {
      const ap = assemblyPoints.find(a => a.id === toAssemblyId);
      if (!ap) return null;
      if (ap.navNodeId) return ap.navNodeId;
      // Fallback: find nearest nav node
      if (navNodes.length === 0) return null;
      let best = navNodes[0];
      let bestDist = Infinity;
      for (const n of navNodes) {
        const d = Math.hypot(n.x - ap.x, n.y - ap.y);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      return bestDist < 100 ? best.id : null;
    }
    if (toType === "building") {
      const b = buildings.find(b => b.id === toBuildingId);
      if (!b) return null;
      if (b.entranceNodeId) return b.entranceNodeId;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (navNodes.length === 0) return null;
      let best = navNodes[0];
      let bestDist = Infinity;
      for (const n of navNodes) {
        const d = Math.hypot(n.x - cx, n.y - cy);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      return bestDist < 100 ? best.id : null;
    }
    // Event: resolve from the event's locationRef to a nav node
    if (toType === "event") {
      if (!toEventId) return null;
      const ev = eventOverlays.find(e => e.id === toEventId);
      if (!ev || !ev.locationRef) return null;
      const b = buildings.find(x => x.id === ev.locationRef!.buildingId);
      if (!b) return null;
      if (ev.locationRef.type === "room" && ev.locationRef.roomId) {
        // Room-level event: use room's accessNodeId
        for (const floor of b.floors) {
          const room = floor.rooms.find(r => r.id === ev.locationRef!.roomId);
          if (room && room.accessNodeId) return room.accessNodeId;
        }
      }
      // Building-level event or room without accessNodeId: use building entrance
      if (b.entranceNodeId) return b.entranceNodeId;
      // Fallback: find nearest nav node to building center
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (navNodes.length === 0) return null;
      let best = navNodes[0];
      let bestDist = Infinity;
      for (const n of navNodes) {
        const d = Math.hypot(n.x - cx, n.y - cy);
        if (d < bestDist) { bestDist = d; best = n; }
      }
      return bestDist < 100 ? best.id : null;
    }
    // Room
    if (!toBuildingId || !toRoomId) return null;
    const b = buildings.find(b => b.id === toBuildingId);
    if (!b) return null;
    for (const floor of b.floors) {
      const room = floor.rooms.find(r => r.id === toRoomId);
      if (room) {
        // Try accessNodeId first, then fallback to nearest nav node
        if (room.accessNodeId) return room.accessNodeId;
        // Fallback: find nearest nav node to room center
        const cx = room.x + room.w / 2;
        const cy = room.y + room.h / 2;
        if (navNodes.length === 0) return null;
        let best = navNodes[0];
        let bestDist = Infinity;
        for (const n of navNodes) {
          const d = Math.hypot(n.x - cx, n.y - cy);
          if (d < bestDist) { bestDist = d; best = n; }
        }
        return bestDist < 100 ? best.id : null;
      }
    }
    return null;
  }, [toType, toNodeId, toBuildingId, toRoomId, toEventId, buildings, navNodes, eventOverlays]);

  const handleCalculate = useCallback(() => {
    setLoading(true);
    setError(null);
    setResult(null);
    onHighlightRoute(null);

    const fromId = resolveFromNodeId();
    const toId = resolveToNodeId();

    if (!fromId) {
      setError("Please select a valid starting point (building or waypoint).");
      setLoading(false);
      return;
    }
    if (!toId) {
      setError("Please select a valid destination (building, room, or waypoint).");
      setLoading(false);
      return;
    }

    // Check if both node IDs exist in the nav graph
    const fromExists = navNodes.some(n => n.id === fromId);
    const toExists = navNodes.some(n => n.id === toId);
    if (!fromExists) {
      setError("Starting point has no navigation node assigned. Set an entrance node on the building or connect it to a waypoint.");
      setLoading(false);
      return;
    }
    if (!toExists) {
      setError("Destination has no navigation node assigned. Assign an access node to the room or building.");
      setLoading(false);
      return;
    }

    const routeColor = emergencyMode ? "#dc2626" : (accessibleOnly ? "#2563eb" : "#3b82f6");
    const path = findNavigationRoute(navNodes, navEdges, fromId, toId, accessibleOnly, emergencyMode);

    if (!path) {
      // ── Diagnose the failure reason ──
      const modeMsg = emergencyMode ? "evacuation" : accessibleOnly ? "accessible" : "navigation";

      // Check common failure scenarios
      const fromNode = navNodes.find(n => n.id === fromId);
      const toNode = navNodes.find(n => n.id === toId);

      // Check 1: Destination is isolated?
      if (toNode && !navEdges.some(e => e.startNodeId === toId || e.endNodeId === toId)) {
        setError("Destination disconnected — the destination waypoint has no connections to the navigation graph. Use the Path tool to connect it.");
      }
      // Check 2: Source is isolated?
      else if (fromNode && !navEdges.some(e => e.startNodeId === fromId || e.endNodeId === fromId)) {
        setError("Starting point disconnected — the starting waypoint has no connections to the navigation graph. Use the Path tool to connect it.");
      }
      // Check 3: Inaccessible path (accessible mode but edges blocked)?
      else if (accessibleOnly && toNode && fromNode) {
        // Check if the destination is only reachable through inaccessible edges
        const accessibleEdges = navEdges.filter(e => e.accessible);
        if (accessibleEdges.length === 0) {
          setError("No accessible routes available — no paths are marked as accessible. Edit navigation edges to enable accessibility.");
        } else {
          setError(`No accessible ${modeMsg} route found. The destination may only be reachable through stairs or other inaccessible paths. Check accessibility settings on navigation edges.`);
        }
      }
      // Check 4: Emergency route blocked?
      else if (emergencyMode && toNode && fromNode) {
        const safeEdges = navEdges.filter(e => e.emergencySafe !== false);
        if (safeEdges.length === 0) {
          setError("No emergency-safe routes available — all paths are marked unsafe for emergencies. Mark at least one connecting path as emergency-safe.");
        } else {
          setError(`No ${modeMsg} route found. The destination may be behind blocked or hazardous paths. Check emergency safety settings on navigation edges.`);
        }
      }
      // Check 5: Floor transition needed but unavailable?
      else if (fromNode && toNode && fromNode.floorId !== toNode.floorId) {
        setError(`Floor transition unavailable — the start and destination are on different floors but no connected stair or elevator transition links them. Add shared stair/elevator connections between floors.`);
      }
      // Generic failure
      else {
        setError(`No ${modeMsg} route found. The selected waypoints may not be connected or the path may be blocked. Check the navigation graph for missing edges, disconnected nodes, or restricted paths.`);
      }
      setLoading(false);
      return;
    }

    setResult(path);
    onHighlightRoute({ waypoints: path.waypoints, color: routeColor });
    setLoading(false);
  }, [navNodes, navEdges, accessibleOnly, emergencyMode, resolveFromNodeId, resolveToNodeId, onHighlightRoute]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    onHighlightRoute(null);
  }, [onHighlightRoute]);

  // Get rooms for a selected building
  const roomsForBuilding = useMemo(() => {
    const b = buildings.find(b => b.id === toBuildingId);
    if (!b) return [];
    return b.floors.flatMap(f => f.rooms.map(r => ({
      ...r,
      floorLabel: f.label,
    })));
  }, [toBuildingId, buildings]);

  return (
    <div className="border-t border-border">
      <div className="px-3 py-2 flex items-center gap-1.5 border-b border-border">
        <Navigation className="h-3 w-3 text-blue-500" />
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Test Navigation</span>
      </div>
      {/* Brief intro for first-time admins */}
      <div className="px-3 py-1.5 border-b border-border/50">
        <p className="text-[9px] text-muted-foreground leading-relaxed">
          Pick a starting point and a destination, then click <strong>Calculate Route</strong> to test the walking network.
          The route will be highlighted on the canvas above.
        </p>
      </div>
      <div className="p-3 space-y-2">
        {/* FROM */}
        <div>
          <label className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-1">From</label>
          <div className="flex gap-1 mb-1.5">
            <button
              onClick={() => setFromType("building")}
              className={cn(
                "flex-1 h-6 rounded-lg text-[9px] font-bold transition-all border",
                fromType === "building"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >Building</button>
            <button
              onClick={() => setFromType("node")}
              className={cn(
                "flex-1 h-6 rounded-lg text-[9px] font-bold transition-all border",
                fromType === "node"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >Waypoint</button>
          </div>
          {fromType === "building" ? (
            <select
              value={fromBuildingId}
              onChange={(e) => setFromBuildingId(e.target.value)}
              className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2"
            >
              <option value="">Select building...</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
              ))}
            </select>
          ) : (
            <select
              value={fromNodeId}
              onChange={(e) => setFromNodeId(e.target.value)}
              className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2"
            >
              <option value="">Select waypoint...</option>
              {navNodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name || n.id}</option>
              ))}
            </select>
          )}
        </div>

        {/* TO */}
        <div>
          <label className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-1">To</label>
          <div className="flex gap-1 mb-1.5">
            <button
              onClick={() => setToType("room")}
              className={cn(
                "flex-1 h-6 rounded-lg text-[9px] font-bold transition-all border",
                toType === "room"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >Room</button>
            <button
              onClick={() => setToType("building")}
              className={cn(
                "flex-1 h-6 rounded-lg text-[9px] font-bold transition-all border",
                toType === "building"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >Building</button>
            <button
              onClick={() => setToType("node")}
              className={cn(
                "flex-1 h-6 rounded-lg text-[9px] font-bold transition-all border",
                toType === "node"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >Waypoint</button>
            <button
              onClick={() => setToType("assembly")}
              className={cn(
                "flex-1 h-6 rounded-lg text-[9px] font-bold transition-all border",
                toType === "assembly"
                  ? "bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-700/40 text-red-600 dark:text-red-400"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >Assembly</button>
            <button
              onClick={() => setToType("event")}
              className={cn(
                "flex-1 h-6 rounded-lg text-[9px] font-bold transition-all border",
                toType === "event"
                  ? "bg-amber-100 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/40 text-amber-600 dark:text-amber-400"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >Event</button>
          </div>
          {toType === "room" && (
            <>
              <select
                value={toBuildingId}
                onChange={(e) => { setToBuildingId(e.target.value); setToRoomId(""); }}
                className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2 mb-1"
              >
                <option value="">Select building...</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                ))}
              </select>
              <select
                value={toRoomId}
                onChange={(e) => setToRoomId(e.target.value)}
                className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2"
              >
                <option value="">Select room...</option>
                {roomsForBuilding.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.floorLabel})</option>
                ))}
              </select>
            </>
          )}
          {toType === "building" && (
            <select
              value={toBuildingId}
              onChange={(e) => setToBuildingId(e.target.value)}
              className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2"
            >
              <option value="">Select building...</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
              ))}
            </select>
          )}
          {toType === "node" && (
            <select
              value={toNodeId}
              onChange={(e) => setToNodeId(e.target.value)}
              className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2"
            >
              <option value="">Select waypoint...</option>
              {navNodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name || n.id}</option>
              ))}
            </select>
          )}
          {toType === "assembly" && (
            <select
              value={toAssemblyId}
              onChange={(e) => setToAssemblyId(e.target.value)}
              className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2"
            >
              <option value="">Select assembly point...</option>
              {assemblyPoints.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.navNodeId ? ' 🔗' : ' ⚠'}</option>
              ))}
            </select>
          )}
          {toType === "event" && (
            <select
              value={toEventId}
              onChange={(e) => setToEventId(e.target.value)}
              className="w-full h-7 rounded-lg border border-border bg-input-background text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-primary/20 custom-select px-2"
            >
              <option value="">Select event...</option>
              {(campus.eventOverlays ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}{ev.locationRef ? ` @ ${ev.locationRef.label}` : ' ⚠ No location'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Options */}
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={accessibleOnly}
              onChange={(e) => { setAccessibleOnly(e.target.checked); if (e.target.checked) setEmergencyMode(false); }}
              className="accent-primary h-3 w-3 rounded"
            />
            <span className="text-[9px] text-muted-foreground">Accessible</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emergencyMode}
              onChange={(e) => { setEmergencyMode(e.target.checked); if (e.target.checked) setAccessibleOnly(false); }}
              className="accent-red-500 h-3 w-3 rounded"
            />
            <span className={cn("text-[9px]", emergencyMode ? "text-red-500 font-bold" : "text-muted-foreground")}>Emergency</span>
          </label>
        </div>

        {/* Calculate / Clear buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="flex-1 h-7 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-[10px] font-bold transition-all flex items-center justify-center gap-1"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Route className="h-3 w-3" />
            )}
            {loading ? "Calculating..." : "Calculate Route"}
          </button>
          {(result || error) && (
            <button
              onClick={clear}
              className="h-7 px-3 rounded-lg border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground transition-all"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        {error && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
            <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
            <span className="text-[10px] text-destructive">{error}</span>
          </div>
        )}
        {result && (
          <div className={cn(
            "space-y-1.5 px-2.5 py-2 rounded-lg border",
            emergencyMode
              ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700/20"
              : accessibleOnly
                ? "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-700/20"
                : "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/20"
          )}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={cn("h-3 w-3",
                emergencyMode ? "text-red-500" : accessibleOnly ? "text-blue-500" : "text-green-500"
              )} />
              <span className={cn("text-[10px] font-bold",
                emergencyMode ? "text-red-600 dark:text-red-400" : accessibleOnly ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"
              )}>
                {emergencyMode ? "Evacuation Route" : accessibleOnly ? "Accessible Route" : "Route Found"}
              </span>
              {emergencyMode && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 ml-auto">
                  Emergency
                </span>
              )}
              {accessibleOnly && !emergencyMode && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ml-auto">
                  Accessible
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span><strong>{result.distanceM}m</strong> distance</span>
              <span className="opacity-50">·</span>
              <span><strong>{result.minutes} min</strong> walk</span>
              <span className="opacity-50">·</span>
              <span><strong>{result.nodeIds.length}</strong> waypoints</span>
            </div>
            {result.steps.length > 0 && (
              <div className="space-y-0.5 pt-1 border-t border-blue-200 dark:border-blue-700/20">
                {result.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <ArrowRight className="h-2.5 w-2.5 text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-[9px] text-muted-foreground">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
