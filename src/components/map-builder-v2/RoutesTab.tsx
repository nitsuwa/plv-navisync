import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  GitBranch, Trash2, Play, CheckCircle2, XCircle,
  MousePointer2, Plus, Navigation, Route, Compass,
  Building2, Layers, ArrowUpDown,
  MapIcon, Split,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { genId } from "../map-builder/constants";
import { createCampusPathfinder } from "../../lib/pathfinding";
import { findCompleteRouteFromCampus } from "../../lib/combinedPathfinding";
import type { Campus, CampusBuilding } from "../map-builder/types";
import type { GraphPath } from "../../lib/pathfinding";
import type { CombinedRoute, RouteSegment, Destination, } from "../../lib/combinedPathfinding";

// ── Props ────────────────────────────────────────────────────────────────────

interface RoutesTabProps {
  campus: Campus;
  onUpdate: (campus: Campus) => void;
}

// ── Node type for navigation graph ───────────────────────────────────────────

interface NavNode {
  id: string;
  x: number;
  y: number;
  label: string;
  buildingId?: string;
  type: "hallway" | "room" | "entrance" | "stairs" | "elevator" | "ramp";
}

interface NavConnection {
  id: string;
  fromId: string;
  toId: string;
  weight: number;
  bidirectional: boolean;
}

// ── Segment color palette ────────────────────────────────────────────────────
const SEGMENT_COLORS = [
  { stroke: "#3b82f6", fill: "#3b82f620", label: "Outdoor walk" },
  { stroke: "#10b981", fill: "#10b98120", label: "Indoor entrance" },
  { stroke: "#f59e0b", fill: "#f59e0b20", label: "Indoor exit" },
  { stroke: "#8b5cf6", fill: "#8b5cf620", label: "Floor change" },
  { stroke: "#ec4899", fill: "#ec489920", label: "Indoor navigation" },
];

// ══════════════════════════════════════════════════════════════════════════════

export function RoutesTab({ campus, onUpdate }: RoutesTabProps) {
  const [mode, setMode] = useState<"edit" | "test">("edit");
  const [tool, setTool] = useState<"select" | "node" | "connect" | "erase">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [startNode, setStartNode] = useState<string | null>(null);
  const [endNode, setEndNode] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<string[]>([]);
  const [routeFound, setRouteFound] = useState<boolean | null>(null);
  const [pathfinderRoute, setPathfinderRoute] = useState<GraphPath | null>(null);
  const [usePathfinder, setUsePathfinder] = useState(false);
  const [zoom, setZoom] = useState(1);

  // ── Combined route state ──────────────────────────────────────────────────
  const [routeType, setRouteType] = useState<"outdoor" | "combined">("outdoor");
  const [fromFloor, setFromFloor] = useState<number | null>(null);
  const [fromRoom, setFromRoom] = useState<string | null>(null);
  const [toFloor, setToFloor] = useState<number | null>(null);
  const [toRoom, setToRoom] = useState<string | null>(null);
  const [combinedRoute, setCombinedRoute] = useState<CombinedRoute | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Derive from selected nodes ────────────────────────────────────────────
  const selectedFromBldg = useMemo(() => {
    if (!startNode) return null;
    const bid = startNode.replace(/^node-bldg-/, "").replace(/^node-/, "");
    return campus.buildings.find((b) => b.id === bid) ?? null;
  }, [startNode, campus.buildings]);

  const selectedToBldg = useMemo(() => {
    if (!endNode) return null;
    const bid = endNode.replace(/^node-bldg-/, "").replace(/^node-/, "");
    return campus.buildings.find((b) => b.id === bid) ?? null;
  }, [endNode, campus.buildings]);

  // Floors available for each selected building
  const fromFloors = selectedFromBldg?.floors ?? [];
  const toFloors = selectedToBldg?.floors ?? [];

  // Rooms on the selected floor
  const fromFloorData = fromFloors.find((f) => f.number === fromFloor);
  const toFloorData = toFloors.find((f) => f.number === toFloor);
  const fromRooms = fromFloorData?.rooms ?? [];
  const toRooms = toFloorData?.rooms ?? [];

  // ── Build Destination objects ─────────────────────────────────────────────
  const buildDest = useCallback((): { from: Destination | null; to: Destination | null } => {
    if (!startNode || !endNode) return { from: null, to: null };
    const fromBid = startNode.replace(/^node-bldg-/, "").replace(/^node-/, "");
    const toBid = endNode.replace(/^node-bldg-/, "").replace(/^node-/, "");
    const fromB = campus.buildings.find((b) => b.id === fromBid);
    const toB = campus.buildings.find((b) => b.id === toBid);
    if (!fromB || !toB) return { from: null, to: null };

    // Build from destination
    let from: Destination;
    if (routeType === "combined" && fromRoom && fromFloor !== null) {
      const room = fromRooms.find((r) => r.id === fromRoom);
      from = {
        type: "room",
        buildingId: fromBid,
        floorNumber: fromFloor,
        roomId: fromRoom,
        roomName: room?.name ?? "Selected Room",
        buildingLabel: fromB.name,
        buildingCode: fromB.code,
      };
    } else {
      from = { type: "building", buildingId: fromBid, label: fromB.name, code: fromB.code };
    }

    // Build to destination
    let to: Destination;
    if (routeType === "combined" && toRoom && toFloor !== null) {
      const room = toRooms.find((r) => r.id === toRoom);
      to = {
        type: "room",
        buildingId: toBid,
        floorNumber: toFloor,
        roomId: toRoom,
        roomName: room?.name ?? "Selected Room",
        buildingLabel: toB.name,
        buildingCode: toB.code,
      };
    } else {
      to = { type: "building", buildingId: toBid, label: toB.name, code: toB.code };
    }

    return { from, to };
  }, [startNode, endNode, routeType, fromFloor, fromRoom, toFloor, toRoom, campus.buildings, fromRooms, toRooms]);

  // ── Local nodes/connections (edit mode) ──────────────────────────────────
  const [localNodes, setLocalNodes] = useState<NavNode[]>(() =>
    campus.buildings.map((b) => ({
      id: `node-${b.id}`,
      x: b.x + b.width / 2,
      y: b.y + b.height,
      label: b.code,
      buildingId: b.id,
      type: "entrance" as const,
    }))
  );
  const [localConnections, setLocalConnections] = useState<NavConnection[]>(
    () => (campus.routes ?? []).map((r) => ({
      id: genId("conn"),
      fromId: r.fromBuildingId,
      toId: r.toBuildingId,
      weight: r.distanceM || 100,
      bidirectional: true,
    }))
  );

  // Sync local nodes with buildings
  useEffect(() => {
    setLocalNodes(
      campus.buildings.map((b) => ({
        id: `node-${b.id}`,
        x: b.x + b.width / 2,
        y: b.y + b.height,
        label: b.code,
        buildingId: b.id,
        type: "entrance" as const,
      }))
    );
  }, [campus.buildings]);

  // ── SVG point ────────────────────────────────────────────────────────────
  const getPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = campus.canvasW / rect.width;
    const scaleY = campus.canvasH / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX / zoom,
      y: (e.clientY - rect.top) * scaleY / zoom,
    };
  }, [campus.canvasW, campus.canvasH, zoom]);

  // ── Routing algorithm (simple Dijkstra) ──────────────────────────────────
  const findRoute = useCallback(() => {
    if (!startNode || !endNode) return;
    setRouteFound(null);
    setRoutePath([]);
    setPathfinderRoute(null);
    setCombinedRoute(null);

    // Build adjacency list
    const adj = new Map<string, { node: string; weight: number }[]>();
    for (const node of localNodes) {
      adj.set(node.id, []);
    }
    for (const conn of localConnections) {
      adj.get(conn.fromId)?.push({ node: conn.toId, weight: conn.weight });
      if (conn.bidirectional) {
        adj.get(conn.toId)?.push({ node: conn.fromId, weight: conn.weight });
      }
    }

    // Dijkstra
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>();

    for (const node of localNodes) {
      distances.set(node.id, Infinity);
      previous.set(node.id, null);
      unvisited.add(node.id);
    }
    distances.set(startNode, 0);

    while (unvisited.size > 0) {
      let current: string | null = null;
      let minDist = Infinity;
      for (const id of unvisited) {
        const dist = distances.get(id)!;
        if (dist < minDist) {
          minDist = dist;
          current = id;
        }
      }
      if (!current || current === endNode) break;
      unvisited.delete(current);
      const neighbors = adj.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!unvisited.has(neighbor.node)) continue;
        const alt = distances.get(current)! + neighbor.weight;
        if (alt < (distances.get(neighbor.node) ?? Infinity)) {
          distances.set(neighbor.node, alt);
          previous.set(neighbor.node, current);
        }
      }
    }

    // Reconstruct path
    const path: string[] = [];
    let current: string | null = endNode;
    while (current) {
      path.unshift(current);
      current = previous.get(current) ?? null;
    }

    if (path.length >= 2 && path[0] === startNode) {
      setRoutePath(path);
      setRouteFound(true);
    } else {
      setRoutePath([]);
      setRouteFound(false);
    }
  }, [startNode, endNode, localNodes, localConnections]);

  // ── Find combined route ──────────────────────────────────────────────────
  const findCombinedRoute = useCallback(() => {
    const { from, to } = buildDest();
    if (!from || !to) return;

    setCombinedRoute(null);
    setRouteFound(null);
    setRoutePath([]);
    setPathfinderRoute(null);
    setSelectedSegment(null);

    // Cast campus to the shared type for the pathfinder
    // (all accessed fields are structurally compatible)
    const result = findCompleteRouteFromCampus(
      campus as unknown as Parameters<typeof findCompleteRouteFromCampus>[0],
      from,
      to
    );

    if (result) {
      setCombinedRoute(result);
      setRouteFound(true);
    } else {
      setCombinedRoute(null);
      setRouteFound(false);
    }
  }, [buildDest, campus]);

  // ── SVG handlers ─────────────────────────────────────────────────────────
  const handleSvgDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getPoint(e);
    const target = e.target as SVGElement;
    const isBg = target === svgRef.current || target.dataset.bg === "true";

    if (mode === "test") {
      if (isBg) return;
      const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
      if (!nodeId) return;
      if (!startNode) {
        setStartNode(nodeId);
        setFromFloor(null);
        setFromRoom(null);
      } else if (!endNode && nodeId !== startNode) {
        setEndNode(nodeId);
        setToFloor(null);
        setToRoom(null);
      } else {
        // Both selected — restart selection
        setStartNode(nodeId);
        setEndNode(null);
        setFromFloor(null);
        setFromRoom(null);
        setToFloor(null);
        setToRoom(null);
        setCombinedRoute(null);
        setPathfinderRoute(null);
        setRoutePath([]);
        setRouteFound(null);
      }
      return;
    }

    if (!isBg && tool === "select") return;

    if (tool === "node") {
      const newNode: NavNode = {
        id: genId("node"),
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        label: "Waypoint",
        type: "hallway",
      };
      setLocalNodes((prev) => [...prev, newNode]);
      setSelectedId(newNode.id);
      return;
    }

    if (isBg && tool === "select") {
      setSelectedId(null);
    }
  }, [getPoint, mode, tool, startNode, endNode]);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (mode === "test") {
      if (!startNode) {
        setStartNode(nodeId);
        setFromFloor(null);
        setFromRoom(null);
      } else if (!endNode && nodeId !== startNode) {
        setEndNode(nodeId);
        setToFloor(null);
        setToRoom(null);
      }
      return;
    }
    if (tool === "connect") {
      if (!connectFrom) {
        setConnectFrom(nodeId);
      } else if (nodeId !== connectFrom) {
        setLocalConnections((prev) => [
          ...prev,
          {
            id: genId("conn"),
            fromId: connectFrom,
            toId: nodeId,
            weight: 100,
            bidirectional: true,
          },
        ]);
        setConnectFrom(null);
      }
      return;
    }
    if (tool === "erase") {
      setLocalNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setLocalConnections((prev) => prev.filter((c) => c.fromId !== nodeId && c.toId !== nodeId));
      if (selectedId === nodeId) setSelectedId(null);
      return;
    }
    setSelectedId(nodeId);
  }, [mode, tool, connectFrom, selectedId, startNode, endNode]);

  // ── Update campus routes when connections change ─────────────────────────
  const routesRef = useRef(localConnections.length);
  useEffect(() => {
    if (localConnections.length === routesRef.current) return;
    routesRef.current = localConnections.length;
    const routes = localConnections.map((c) => {
      const fromNode = localNodes.find((n) => n.id === c.fromId);
      const toNode = localNodes.find((n) => n.id === c.toId);
      return {
        id: c.id,
        name: `${fromNode?.label ?? "Start"} → ${toNode?.label ?? "End"}`,
        fromBuildingId: c.fromId,
        toBuildingId: c.toId,
        waypoints: [{ x: fromNode?.x ?? 0, y: fromNode?.y ?? 0 }, { x: toNode?.x ?? 0, y: toNode?.y ?? 0 }],
        type: "walking" as const,
        distanceM: c.weight,
        durationMin: Math.round(c.weight / 80),
        color: "#16a34a",
        isActive: true,
      };
    });
    onUpdate({ ...campus, routes });
  }, [localConnections, localNodes, campus, onUpdate]);

  // ── Reset everything ──────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    setStartNode(null);
    setEndNode(null);
    setRoutePath([]);
    setRouteFound(null);
    setPathfinderRoute(null);
    setCombinedRoute(null);
    setFromFloor(null);
    setFromRoom(null);
    setToFloor(null);
    setToRoom(null);
    setSelectedSegment(null);
  }, []);

  // ── Segment label with badges ────────────────────────────────────────────
  const SegmentLabel = ({ seg }: { seg: RouteSegment }) => {
    const hasFloorChange = seg.steps.some(s => s.toLowerCase().includes("stair") || s.toLowerCase().includes("elevator") || s.toLowerCase().includes("floor"));
    return (
      <span className="flex items-center gap-1.5 text-[10px]">
        {seg.label}
        {seg.buildingId && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[8px] font-bold">
            <Building2 className="h-2.5 w-2.5" />
            {campus.buildings.find(b => b.id === seg.buildingId)?.code ?? "??"}
          </span>
        )}
        {seg.floorNumber && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[8px] font-bold">
            <Layers className="h-2.5 w-2.5" />
            F{seg.floorNumber}
          </span>
        )}
        {hasFloorChange && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[8px] font-bold">
            <ArrowUpDown className="h-2.5 w-2.5" />
            Transit
          </span>
        )}
      </span>
    );
  };

  // ── Derive waypoints for combined route SVG drawing ─────────────────────
  const combinedWaypoints = useMemo(() => {
    if (!combinedRoute) return [];
    return combinedRoute.segments.map((seg, idx) => ({
      segmentIndex: idx,
      waypoints: seg.waypoints,
      color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length].stroke,
      label: SEGMENT_COLORS[idx % SEGMENT_COLORS.length].label,
      isIndoor: seg.isIndoor,
      dasharray: seg.isIndoor ? "6 4" : seg.waypoints.length === 0 ? "3 3" : "none",
      lineWidth: seg.waypoints.length === 0 ? 1 : 3,
      distanceM: seg.distanceM,
      seconds: seg.seconds,
    }));
  }, [combinedRoute]);

  // ── Hovered waypoint state ────────────────────────────────────────────────
  const [hoveredWaypoint, setHoveredWaypoint] = useState<{ x: number; y: number; label: string } | null>(null);

  // ── Generate direction arrow points along a polyline ──────────────────────
  function getArrowPoints(pts: { x: number; y: number }[], spacing = 60): { x: number; y: number; angle: number }[] {
    if (pts.length < 2) return [];
    const arrows: { x: number; y: number; angle: number }[] = [];
    let accumulated = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const segLen = Math.hypot(dx, dy);
      if (segLen === 0) continue;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      let placed = accumulated;
      while (placed + spacing < accumulated + segLen) {
        placed += spacing;
        const t = (placed - accumulated) / segLen;
        arrows.push({
          x: pts[i - 1].x + dx * t,
          y: pts[i - 1].y + dy * t,
          angle,
        });
      }
      accumulated += segLen;
    }
    return arrows;
  }

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* ── Left panel - Info ──────────────────────────────────────────────── */}
      <div className="w-60 border-r border-border bg-card p-4 space-y-4 shrink-0 overflow-y-auto">
        <div>
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Navigation className="h-4 w-4 text-primary" />
            Navigation Graph
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">
            Connect buildings and test full indoor+outdoor routes.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-muted/50 p-0.5">
          {(["edit", "test"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); resetAll(); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "edit" ? <GitBranch className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {m}
            </button>
          ))}
        </div>

        {mode === "edit" ? (
          <>
            {/* Tools */}
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Tools</p>
              <button onClick={() => setTool("select")} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all", tool === "select" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                <MousePointer2 className="h-3.5 w-3.5" /> Select
              </button>
              <button onClick={() => setTool("node")} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all", tool === "node" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                <Plus className="h-3.5 w-3.5" /> Add Node
              </button>
              <button onClick={() => setTool("connect")} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all", tool === "connect" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                <GitBranch className="h-3.5 w-3.5" /> Connect Nodes
              </button>
              <button onClick={() => setTool("erase")} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all", tool === "erase" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>

            {/* Stats */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-foreground">{localNodes.length}</p>
                  <p className="text-[9px] text-muted-foreground">Nodes</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{localConnections.length}</p>
                  <p className="text-[9px] text-muted-foreground">Connections</p>
                </div>
              </div>
            </div>

            {/* Nodes list */}
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Nodes</p>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {localNodes.map((node) => (
                  <div key={node.id}
                    onClick={() => setSelectedId(node.id)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer transition-all",
                      selectedId === node.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", node.type === "entrance" ? "bg-emerald-500" : "bg-blue-500")} />
                    <span className="truncate">{node.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* ── Test mode ─────────────────────────────────────────────────── */
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Click a start building, then a destination. Toggle "Combined" for room-to-room routing with floor transitions.
            </p>

            {/* Route type selector */}
            <div className="flex rounded-lg bg-muted/50 p-0.5">
              {(["outdoor", "combined"] as const).map((rt) => (
                <button
                  key={rt}
                  onClick={() => { setRouteType(rt); setCombinedRoute(null); setPathfinderRoute(null); setSelectedSegment(null); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                    routeType === rt ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {rt === "outdoor" ? <MapIcon className="h-3 w-3" /> : <Split className="h-3 w-3" />}
                  {rt}
                </button>
              ))}
            </div>

            {/* Start node info */}
            <div className={cn("p-3 rounded-xl border text-xs font-semibold space-y-1", startNode ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400" : "bg-muted/30 border-border/50 text-muted-foreground")}>
              {startNode
                ? <span>From: {localNodes.find((n) => n.id === startNode)?.label ?? "Building"}</span>
                : "Click a building to set start"}

              {/* Floor & Room picker (combined mode only) */}
              {routeType === "combined" && selectedFromBldg && (
                <div className="mt-2 space-y-1.5">
                  <select
                    value={fromFloor ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setFromFloor(val);
                      setFromRoom(null);
                    }}
                    className="w-full h-7 px-2 rounded-md border border-border bg-background text-[10px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                  >
                    <option value="">Ground floor (entrance)</option>
                    {fromFloors.map((f) => (
                      <option key={f.number} value={f.number}>
                        {f.label} (Floor {f.number})
                      </option>
                    ))}
                  </select>

                  {fromFloor !== null && fromRooms.length > 0 && (
                    <select
                      value={fromRoom ?? ""}
                      onChange={(e) => setFromRoom(e.target.value || null)}
                      className="w-full h-7 px-2 rounded-md border border-border bg-background text-[10px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="">Building entrance (no room)</option>
                      {fromRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.type})
                        </option>
                      ))}
                    </select>
                  )}
                  {fromFloor !== null && fromRooms.length === 0 && (
                    <p className="text-[8px] text-muted-foreground italic">No rooms on this floor</p>
                  )}
                </div>
              )}
            </div>

            {/* End node info */}
            <div className={cn("p-3 rounded-xl border text-xs font-semibold space-y-1", endNode ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" : "bg-muted/30 border-border/50 text-muted-foreground")}>
              {endNode
                ? <span>To: {localNodes.find((n) => n.id === endNode)?.label ?? "Building"}</span>
                : "Click a building to set destination"}

              {/* Floor & Room picker (combined mode only) */}
              {routeType === "combined" && selectedToBldg && (
                <div className="mt-2 space-y-1.5">
                  <select
                    value={toFloor ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setToFloor(val);
                      setToRoom(null);
                    }}
                    className="w-full h-7 px-2 rounded-md border border-border bg-background text-[10px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                  >
                    <option value="">Ground floor (entrance)</option>
                    {toFloors.map((f) => (
                      <option key={f.number} value={f.number}>
                        {f.label} (Floor {f.number})
                      </option>
                    ))}
                  </select>

                  {toFloor !== null && toRooms.length > 0 && (
                    <select
                      value={toRoom ?? ""}
                      onChange={(e) => setToRoom(e.target.value || null)}
                      className="w-full h-7 px-2 rounded-md border border-border bg-background text-[10px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="">Building entrance (no room)</option>
                      {toRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.type})
                        </option>
                      ))}
                    </select>
                  )}
                  {toFloor !== null && toRooms.length === 0 && (
                    <p className="text-[8px] text-muted-foreground italic">No rooms on this floor</p>
                  )}
                </div>
              )}
            </div>

            {/* Routing method options */}
            <div className="space-y-1.5">
              <label className={cn(
                "flex items-center gap-2 text-[10px] font-medium rounded-lg border px-2.5 py-2 cursor-pointer transition-all",
                routeType === "outdoor" && usePathfinder
                  ? "border-primary/30 bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}>
                <input
                  type="checkbox"
                  checked={routeType === "outdoor" && usePathfinder}
                  onChange={(e) => {
                    if (routeType === "combined") {
                      // Switching to outdoor pathfinder
                      setRouteType("outdoor");
                      setUsePathfinder(e.target.checked);
                    } else {
                      setUsePathfinder(e.target.checked);
                    }
                    setCombinedRoute(null);
                    setPathfinderRoute(null);
                  }}
                  className="rounded border-border text-primary focus:ring-primary/30"
                />
                <Compass className="h-3 w-3 shrink-0" />
                <span className="truncate">A* Outdoor Engine</span>
              </label>

              {routeType === "combined" && (
                <label className="flex items-center gap-2 text-[10px] font-medium rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-foreground cursor-pointer">
                  <Split className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate">Combined Indoor+Outdoor Route</span>
                  <span className="ml-auto px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[7px] font-bold uppercase">active</span>
                </label>
              )}
            </div>

            {/* Find Route button */}
            <button
              onClick={() => {
                if (routeType === "combined") {
                  findCombinedRoute();
                } else if (usePathfinder && startNode && endNode) {
                  const startNodeData = localNodes.find(n => n.id === startNode);
                  const endNodeData = localNodes.find(n => n.id === endNode);
                  if (startNodeData?.type === 'entrance' && endNodeData?.type === 'entrance') {
                    const fromBuildingId = startNode.replace("node-bldg-", "").replace("node-", "");
                    const toBuildingId = endNode.replace("node-bldg-", "").replace("node-", "");
                    const pf = createCampusPathfinder(
                      campus.canvasW,
                      campus.canvasH,
                      campus.buildings,
                      campus.paths,
                      campus.markers
                    );
                    const result = pf.findBuildingPath(fromBuildingId, toBuildingId);
                    if (result) {
                      setPathfinderRoute(result);
                      setRouteFound(true);
                    } else {
                      setPathfinderRoute(null);
                      setRouteFound(false);
                    }
                  } else {
                    findRoute();
                  }
                } else {
                  findRoute();
                }
              }}
              disabled={!startNode || !endNode}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40 transition-all"
            >
              {routeType === "combined" ? (
                <><Split className="h-3.5 w-3.5" /> Find Combined Route</>
              ) : usePathfinder ? (
                <><Route className="h-3.5 w-3.5" /> Test A* Engine</>
              ) : (
                <><Route className="h-3.5 w-3.5" /> Find Route</>
              )}
            </button>

            {/* ── Results ────────────────────────────────────────────────── */}

            {/* Simple Dijkstra result */}
            {routeFound === true && !pathfinderRoute && !combinedRoute && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4 mb-1" />
                <p className="text-xs font-bold">Route Found!</p>
                <p className="text-[10px] mt-0.5">{routePath.length} nodes in path</p>
              </motion.div>
            )}

            {/* A* Pathfinder result */}
            {pathfinderRoute && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4 mb-1" />
                <p className="text-xs font-bold">A* Pathfinding Result</p>
                <div className="mt-1.5 space-y-0.5 text-[10px]">
                  <p>Distance: <strong>{pathfinderRoute.distanceM}m</strong></p>
                  <p>Est. time: <strong>{pathfinderRoute.minutes} min</strong></p>
                  <p>Waypoints: <strong>{pathfinderRoute.waypoints.length}</strong></p>
                  <details className="mt-1">
                    <summary className="cursor-pointer font-semibold text-[10px]">Directions</summary>
                    <ol className="mt-1 space-y-0.5 list-decimal list-inside">
                      {pathfinderRoute.steps.map((step, i) => (
                        <li key={i} className="leading-tight text-[10px]">{step}</li>
                      ))}
                    </ol>
                  </details>
                </div>
              </motion.div>
            )}

            {/* ── Combined Route result ─────────────────────────────────── */}
            {combinedRoute && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  {/* Summary card */}
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-950/20 dark:to-blue-950/20 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="h-4 w-4 mb-1 text-emerald-600" />
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Combined Route Found!</p>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="px-2 py-1.5 rounded-lg bg-background/60">
                        <p className="text-muted-foreground">Total Distance</p>
                        <p className="font-bold text-foreground">{combinedRoute.totalDistanceM}m</p>
                      </div>
                      <div className="px-2 py-1.5 rounded-lg bg-background/60">
                        <p className="text-muted-foreground">Est. Time</p>
                        <p className="font-bold text-foreground">{combinedRoute.totalMinutes} min</p>
                      </div>
                      <div className="px-2 py-1.5 rounded-lg bg-background/60">
                        <p className="text-muted-foreground">Segments</p>
                        <p className="font-bold text-foreground">{combinedRoute.segments.length}</p>
                      </div>
                      <div className="px-2 py-1.5 rounded-lg bg-background/60">
                        <p className="text-muted-foreground">Steps</p>
                        <p className="font-bold text-foreground">{combinedRoute.allSteps.length}</p>
                      </div>
                    </div>
                  </div>

                  {/* Segments breakdown */}
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Split className="h-3 w-3" /> Route Segments
                    </p>
                    {combinedRoute.segments.map((seg, idx) => (
                      <motion.button
                        key={idx}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        onClick={() => setSelectedSegment(selectedSegment === idx ? null : idx)}
                        className={cn(
                          "w-full text-left p-2.5 rounded-xl border transition-all",
                          selectedSegment === idx
                            ? "border-primary/40 bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/20 hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {/* Color dot */}
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white dark:ring-gray-800"
                            style={{ backgroundColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length].stroke }}
                          />
                          <SegmentLabel seg={seg} />
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                          <span>{seg.distanceM}m</span>
                          <span>·</span>
                          <span>{Math.max(1, Math.round(seg.seconds / 60))} min</span>
                          <span>·</span>
                          <span>{seg.waypoints.length} pts</span>
                        </div>

                        {/* Expanded steps */}
                        <AnimatePresence>
                          {selectedSegment === idx && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-2 pt-2 border-t border-border/50 overflow-hidden"
                            >
                              <ol className="space-y-0.5">
                                {seg.steps.map((step, si) => (
                                  <li key={si} className="flex items-start gap-1.5 text-[9px] leading-tight">
                                    <span className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center text-[7px] font-bold text-muted-foreground">{si + 1}</span>
                                    <span className="text-muted-foreground">{step}</span>
                                  </li>
                                ))}
                              </ol>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    ))}
                  </div>

                  {/* All steps summary */}
                  {combinedRoute.allSteps.length > 0 && (
                    <details className="p-2.5 rounded-xl border border-border bg-muted/20">
                      <summary className="text-[10px] font-semibold cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                        View All {combinedRoute.allSteps.length} Steps
                      </summary>
                      <ol className="mt-2 space-y-0.5">
                        {combinedRoute.allSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[9px] leading-tight text-muted-foreground">
                            <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[7px] font-bold">{i + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {/* No route found */}
            {routeFound === false && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
              >
                <XCircle className="h-4 w-4 mb-1" />
                <p className="text-xs font-bold">No Route Found</p>
                <p className="text-[10px] mt-0.5">
                  {routeType === "combined"
                    ? "Could not compute a combined route. Make sure buildings have floor plans with rooms, and outdoor paths are connected."
                    : "These nodes are not connected. Try connecting them first or enable A* Pathfinding Engine."}
                </p>
              </motion.div>
            )}

            {/* Reset button */}
            <button
              onClick={resetAll}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-foreground hover:bg-muted transition-all"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* ── SVG Canvas ──────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 relative bg-[#f8f9fc] dark:bg-[#0f1117]">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${campus.canvasW} ${campus.canvasH}`}
          preserveAspectRatio="xMidYMid meet"
          className={cn(mode === "test" ? "cursor-pointer" : "cursor-crosshair")}
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          onMouseDown={handleSvgDown}
        >
          {/* Background */}
          <rect data-bg="true" width={campus.canvasW} height={campus.canvasH} fill="var(--background)" />

          {/* ── Defs: arrowheads, gradients, markers ──────────────────────── */}
          <defs>
            {/* Arrowhead marker for direction arrows */}
            <marker id="arrowhead-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#10b981" />
            </marker>
            <marker id="arrowhead-blue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#3b82f6" />
            </marker>
            <marker id="arrowhead-amber" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#f59e0b" />
            </marker>
            <marker id="arrowhead-purple" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#8b5cf6" />
            </marker>
            <marker id="arrowhead-pink" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#ec4899" />
            </marker>
            <marker id="arrowhead-white" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="#ffffff" />
            </marker>
            {/* Gradients for route glow */}
            <linearGradient id="route-glow-green" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="route-glow-blue" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
            </linearGradient>
            {/* Filter for waypoint glow on hover */}
            <filter id="waypoint-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Building outlines (reference) */}
          {campus.buildings.map((b) => (
            <rect key={b.id} x={b.x} y={b.y} width={b.width} height={b.height}
              fill={b.color + "08"} stroke={b.color + "30"} strokeWidth="1" rx="4" />
          ))}

          {/* Building code labels */}
          {campus.buildings.map((b) => (
            <text
              key={`lbl-${b.id}`}
              x={b.x + b.width / 2}
              y={b.y + b.height / 2 + 3}
              textAnchor="middle"
              fill={b.color + "50"}
              fontSize="10"
              fontWeight="700"
              fontFamily="var(--font-body)"
              pointerEvents="none"
            >
              {b.code}
            </text>
          ))}

          {/* ── Outdoor connections (Dijkstra / local routes) ────────────── */}
          {localConnections.map((conn) => {
            const from = localNodes.find((n) => n.id === conn.fromId);
            const to = localNodes.find((n) => n.id === conn.toId);
            if (!from || !to) return null;
            const isInRoute = routePath.includes(conn.fromId) && routePath.includes(conn.toId);
            return (
              <g key={conn.id}>
                <line
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={isInRoute ? "#10b981" : "#94a3b8"}
                  strokeWidth={isInRoute ? 3 : 1.5}
                  strokeDasharray={isInRoute ? "none" : "6 3"}
                  className="cursor-pointer"
                  onClick={() => setLocalConnections((prev) => prev.filter((c) => c.id !== conn.id))}
                />
                <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r="2"
                  fill={isInRoute ? "#10b981" : "#94a3b8"} />
              </g>
            );
          })}

          {/* ── Combined route segments (enhanced preview overlay) ──────── */}
          {combinedWaypoints.map((cw) => {
            const pts = cw.waypoints;
            if (pts.length === 0) return null;
            const polylineStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
            const totalLen = (() => {
              let len = 0;
              for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
              return len;
            })();
            const arrows = getArrowPoints(pts, 50);
            const isDimmed = selectedSegment !== null && selectedSegment !== cw.segmentIndex;
            return (
              <g key={`seg-${cw.segmentIndex}`} opacity={isDimmed ? 0.12 : 1}>
                {/* Glow layer */}
                <polyline
                  points={polylineStr}
                  fill="none"
                  stroke={cw.color}
                  strokeWidth={cw.lineWidth + 6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.15"
                />
                {/* Animated draw-in main line */}
                <polyline
                  points={polylineStr}
                  fill="none"
                  stroke={cw.color}
                  strokeWidth={cw.lineWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={cw.isIndoor ? "6 4" : totalLen}
                  strokeDashoffset={cw.isIndoor ? 0 : totalLen}
                >
                  {!cw.isIndoor && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from={totalLen}
                      to="0"
                      dur={`${0.6 + cw.segmentIndex * 0.2}s`}
                      fill="freeze"
                      calcMode="spline"
                      keySplines="0.25 0.1 0.25 1"
                    />
                  )}
                </polyline>
                {/* Direction arrows along the path */}
                {arrows.map((arr, i) => (
                  <polygon
                    key={`sa-${cw.segmentIndex}-${i}`}
                    points="-4,-2.5 4,0 -4,2.5"
                    fill={cw.color}
                    opacity="0.5"
                    transform={`translate(${arr.x},${arr.y}) rotate(${arr.angle})`}
                  />
                ))}
                {/* Segment distance label at midpoint */}
                {(pts.length >= 2) && (() => {
                  const midIdx = Math.floor(pts.length / 2);
                  const mx = pts[midIdx].x;
                  const my = pts[midIdx].y - 14;
                  return (
                    <g opacity={0.9}>
                      <rect x={mx - 18} y={my - 7} width={36} height={14} rx="5" fill={cw.color} />
                      <text
                        x={mx} y={my + 4}
                        textAnchor="middle" fill="white" fontSize="7" fontWeight="700"
                        fontFamily="var(--font-body)"
                        pointerEvents="none"
                      >
                        {cw.distanceM}m · {Math.max(1, Math.round(cw.seconds / 60))}m
                      </text>
                    </g>
                  );
                })()}
                {/* Segment label at offset from midpoint */}
                {(pts.length >= 2) && (() => {
                  const midIdx = Math.floor(pts.length / 2);
                  const mx = pts[midIdx].x;
                  const my = pts[midIdx].y + 16;
                  const seg = combinedRoute?.segments[cw.segmentIndex];
                  return (
                    <text
                      x={mx} y={my}
                      textAnchor="middle" fill={cw.color} fontSize="6" fontWeight="700"
                      fontFamily="var(--font-body)"
                      pointerEvents="none"
                      opacity="0.7"
                      letterSpacing="0.5"
                    >
                      {seg?.label ?? cw.label}
                    </text>
                  );
                })()}
                {/* Waypoint dots */}
                {pts.map((p, pi) => (
                  <g key={`swp-${cw.segmentIndex}-${pi}`}
                    onMouseEnter={() => setHoveredWaypoint({ x: p.x, y: p.y, label: `${cw.label} · pt ${pi + 1}` })}
                    onMouseLeave={() => setHoveredWaypoint(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={p.x} cy={p.y}
                      r={pi === 0 || pi === pts.length - 1 ? 4 : 2}
                      fill={pi === 0 ? "#3b82f6" : pi === pts.length - 1 ? "#10b981" : cw.color}
                      stroke="white" strokeWidth="1.5"
                      opacity={pi === 0 || pi === pts.length - 1 ? 1 : 0.7}
                    />
                  </g>
                ))}
              </g>
            );
          })}

          {/* ── Combined route: enhanced start/end markers ──────────────── */}
          {combinedRoute && combinedRoute.campusWaypoints.length >= 2 && (() => {
            const first = combinedRoute.campusWaypoints[0];
            const last = combinedRoute.campusWaypoints[combinedRoute.campusWaypoints.length - 1];
            return (
              <g>
                {/* Start */}
                <circle cx={first.x} cy={first.y} r="12" fill="#3b82f620" stroke="#3b82f6" strokeWidth="1.5" />
                <circle cx={first.x} cy={first.y} r="7" fill="#3b82f6" />
                <text x={first.x} y={first.y + 20} textAnchor="middle" fill="#3b82f6" fontSize="6" fontWeight="800" fontFamily="var(--font-body)" pointerEvents="none" letterSpacing="1">START</text>
                {/* End */}
                <circle cx={last.x} cy={last.y} r="12" fill="#10b98120" stroke="#10b981" strokeWidth="1.5" />
                <rect x={last.x - 6} y={last.y - 6} width={12} height={12} rx="3" fill="#10b981" />
                <text x={last.x} y={last.y + 1} textAnchor="middle" fill="white" fontSize="8" fontWeight="700" fontFamily="var(--font-body)" pointerEvents="none">🏁</text>
                <text x={last.x} y={last.y + 20} textAnchor="middle" fill="#10b981" fontSize="6" fontWeight="800" fontFamily="var(--font-body)" pointerEvents="none" letterSpacing="1">END</text>
              </g>
            );
          })()}

          {/* ── A* Pathfinder route (enhanced preview overlay) ─────────── */}
          {pathfinderRoute && pathfinderRoute.waypoints.length > 0 && (() => {
            const pts = pathfinderRoute.waypoints;
            const polylineStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
            const totalLength = (() => {
              let len = 0;
              for (let i = 1; i < pts.length; i++) {
                len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
              }
              return len;
            })();
            const arrows = getArrowPoints(pts, 80);
            return (
              <g className="route-preview-group">
                {/* Broad glow layer */}
                <polyline
                  points={polylineStr}
                  fill="none"
                  stroke="url(#route-glow-green)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.4"
                />
                {/* Intermediate glow */}
                <polyline
                  points={polylineStr}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.2"
                />
                {/* Main animated draw-in line */}
                <polyline
                  points={polylineStr}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={totalLength}
                  strokeDashoffset={totalLength}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from={totalLength}
                    to="0"
                    dur="1.2s"
                    fill="freeze"
                    calcMode="spline"
                    keySplines="0.25 0.1 0.25 1"
                  />
                </polyline>
                {/* Direction arrows along the path */}
                {arrows.map((arr, i) => (
                  <g key={`arr-${i}`}>
                    <polygon
                      points="-5,-3 5,0 -5,3"
                      fill="#10b981"
                      opacity="0.6"
                      transform={`translate(${arr.x},${arr.y}) rotate(${arr.angle})`}
                    />
                  </g>
                ))}
                {/* Distance labels at midpoint of each edge */}
                {pts.slice(0, -1).map((p, i) => {
                  const next = pts[i + 1];
                  const mx = (p.x + next.x) / 2;
                  const my = (p.y + next.y) / 2 - 10;
                  const segDist = Math.round(Math.hypot(next.x - p.x, next.y - p.y) * 0.22);
                  if (segDist < 5) return null;
                  return (
                    <g key={`dist-${i}`}>
                      <rect
                        x={mx - 12} y={my - 6} width={24} height={12} rx="4"
                        fill="#10b981" opacity="0.85"
                      />
                      <text
                        x={mx} y={my + 3}
                        textAnchor="middle" fill="white" fontSize="7" fontWeight="700"
                        fontFamily="var(--font-body)"
                        pointerEvents="none"
                      >
                        {segDist}m
                      </text>
                    </g>
                  );
                })}
                {/* Waypoints with hover tooltips */}
                {pts.map((p, i) => (
                  <g key={`wp-${i}`}
                    onMouseEnter={() => setHoveredWaypoint({ x: p.x, y: p.y, label: pathfinderRoute.steps[i] ?? `Waypoint ${i + 1}` })}
                    onMouseLeave={() => setHoveredWaypoint(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={p.x} cy={p.y} r="4"
                      fill={i === 0 ? "#3b82f6" : i === pts.length - 1 ? "#10b981" : "#ffffff"}
                      stroke="#10b981" strokeWidth="2"
                      filter={hoveredWaypoint?.x === p.x && hoveredWaypoint?.y === p.y ? "url(#waypoint-glow)" : undefined}
                    >
                      <animate attributeName="r" values="4;5;4" dur="2s" repeatCount="indefinite" begin={`${i * 0.15}s`} />
                    </circle>
                    {/* Waypoint index label */}
                    <text
                      x={p.x} y={p.y - 10}
                      textAnchor="middle" fill="#10b981" fontSize="7" fontWeight="700"
                      fontFamily="var(--font-body)"
                      pointerEvents="none"
                      opacity="0.6"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
                {/* Start marker */}
                {pts[0] && (
                  <g>
                    <circle cx={pts[0].x} cy={pts[0].y} r="14" fill="#3b82f620" stroke="#3b82f6" strokeWidth="1.5" />
                    <circle cx={pts[0].x} cy={pts[0].y} r="8" fill="#3b82f6" />
                    <text
                      x={pts[0].x} y={pts[0].y + 22}
                      textAnchor="middle" fill="#3b82f6" fontSize="7" fontWeight="800"
                      fontFamily="var(--font-body)"
                      pointerEvents="none"
                      letterSpacing="1"
                    >
                      START
                    </text>
                  </g>
                )}
                {/* End marker */}
                {pts[pts.length - 1] && (
                  <g>
                    <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="14" fill="#10b98120" stroke="#10b981" strokeWidth="1.5" />
                    <rect x={pts[pts.length - 1].x - 7} y={pts[pts.length - 1].y - 7} width={14} height={14} rx="3" fill="#10b981" />
                    <text
                      x={pts[pts.length - 1].x} y={pts[pts.length - 1].y + 2}
                      textAnchor="middle" fill="white" fontSize="9" fontWeight="700"
                      fontFamily="var(--font-body)"
                      pointerEvents="none"
                    >
                      🏁
                    </text>
                    <text
                      x={pts[pts.length - 1].x} y={pts[pts.length - 1].y + 22}
                      textAnchor="middle" fill="#10b981" fontSize="7" fontWeight="800"
                      fontFamily="var(--font-body)"
                      pointerEvents="none"
                      letterSpacing="1"
                    >
                      END
                    </text>
                  </g>
                )}
              </g>
            );
          })()}

          {/* ── Hover tooltip on waypoints ──────────────────────────────── */}
          {hoveredWaypoint && (
            <g pointerEvents="none">
              <rect
                x={hoveredWaypoint.x - 80}
                y={Math.max(0, hoveredWaypoint.y - 40)}
                width={160}
                height={28}
                rx="6"
                fill="var(--popover)"
                stroke="var(--border)"
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x={hoveredWaypoint.x}
                y={Math.max(24, hoveredWaypoint.y - 24)}
                textAnchor="middle"
                fill="var(--popover-foreground)"
                fontSize="8"
                fontWeight="600"
                fontFamily="var(--font-body)"
              >
                {hoveredWaypoint.label.length > 50
                  ? hoveredWaypoint.label.slice(0, 50) + "…"
                  : hoveredWaypoint.label}
              </text>
              <text
                x={hoveredWaypoint.x}
                y={Math.max(36, hoveredWaypoint.y - 14)}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="6"
                fontWeight="500"
                fontFamily="var(--font-body)"
              >
                ({Math.round(hoveredWaypoint.x)}, {Math.round(hoveredWaypoint.y)})
              </text>
            </g>
          )}

          {/* Connection preview */}
          {connectFrom && (() => {
            const from = localNodes.find((n) => n.id === connectFrom);
            if (!from) return null;
            return (
              <circle cx={from.x} cy={from.y} r="16" fill="none" stroke="#3b82f6" strokeWidth="2"
                strokeDasharray="4 3" opacity="0.6" />
            );
          })()}

          {/* Nodes */}
          {localNodes.map((node) => {
            const isSelected = selectedId === node.id;
            const isStart = startNode === node.id;
            const isEnd = endNode === node.id;
            const isInRoute = routePath.includes(node.id);
            const isConnectFrom = connectFrom === node.id;
            return (
              <g key={node.id} data-node-id={node.id} onClick={() => handleNodeClick(node.id)} className="cursor-pointer">
                {/* Glow */}
                {(isSelected || isStart || isEnd || isInRoute) && (
                  <circle cx={node.x} cy={node.y} r="10" fill={isStart ? "#3b82f6" : isEnd ? "#10b981" : isInRoute ? "#10b981" : "#3b82f6"} opacity="0.2" />
                )}
                {/* Node circle */}
                <circle
                  cx={node.x} cy={node.y}
                  r={isConnectFrom ? 10 : 7}
                  fill={isStart ? "#3b82f6" : isEnd ? "#10b981" : isInRoute ? "#10b981" : isSelected ? "#3b82f6" : node.type === "entrance" ? "#059669" : "#6366f1"}
                  stroke="white"
                  strokeWidth="2.5"
                  className="drop-shadow-sm transition-all"
                />
                {/* Label */}
                <text
                  x={node.x} y={node.y + 18}
                  textAnchor="middle"
                  fill="#374151"
                  className="dark:fill-gray-300"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="var(--font-body)"
                  pointerEvents="none"
                >
                  {node.label}
                </text>
              </g>
            );
          })}

          {/* ── Combined route destination room highlight ──────────────── */}
          {combinedRoute?.destinationRoom && (() => {
            const b = campus.buildings.find((b) => b.id === combinedRoute.destinationRoom!.buildingId);
            if (!b) return null;
            const floor = b.floors.find((f) => f.number === combinedRoute.destinationRoom!.floorNumber);
            if (!floor) return null;
            const room = floor.rooms.find((r) => r.id === combinedRoute.destinationRoom!.roomId);
            if (!room) return null;
            return (
              <g>
                <rect
                  x={room.x - 2} y={room.y - 2}
                  width={room.w + 4} height={room.h + 4}
                  fill="#10b98120" stroke="#10b981" strokeWidth="2" rx="3"
                  strokeDasharray="5 3"
                >
                  <animate attributeName="strokeDashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
                </rect>
                <text
                  x={room.x + room.w / 2} y={room.y + room.h / 2 + 3}
                  textAnchor="middle" fill="#10b981" fontSize="8" fontWeight="700"
                  fontFamily="var(--font-body)" pointerEvents="none"
                >
                  ★ {room.name}
                </text>
              </g>
            );
          })()}
        </svg>

        {/* ── Route legend overlay (top-right of canvas) ──────────────────── */}
        {combinedRoute && combinedRoute.segments.length > 0 && (
          <div className="absolute top-3 right-3 max-w-[160px] rounded-xl border border-border bg-background/85 backdrop-blur-md p-2.5 shadow-lg">
            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Route Segments</p>
            <div className="space-y-1">
              {combinedRoute.segments.map((seg, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/50"
                    style={{ backgroundColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length].stroke }}
                  />
                  <span className="text-[8px] font-medium text-foreground truncate">
                    {seg.label.length > 22 ? seg.label.slice(0, 22) + "…" : seg.label}
                  </span>
                  <span className="ml-auto text-[7px] font-bold text-muted-foreground">
                    {seg.distanceM}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Floating info panel (bottom-left of canvas) ──────────────────── */}
        {(pathfinderRoute || combinedRoute) && (
          <div className="absolute bottom-3 left-3 max-w-[240px] rounded-xl border border-border bg-background/85 backdrop-blur-md p-2.5 shadow-lg">
            {pathfinderRoute && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-bold text-foreground">A* Route</span>
                </div>
                <span className="text-[8px] text-muted-foreground">{pathfinderRoute.distanceM}m</span>
                <span className="text-[8px] text-muted-foreground">{pathfinderRoute.minutes} min</span>
                <span className="text-[8px] text-muted-foreground">{pathfinderRoute.waypoints.length} pts</span>
              </div>
            )}
            {combinedRoute && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-foreground">Combined Route</span>
                  <span className="text-[8px] font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ {combinedRoute.totalDistanceM}m
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[8px] text-muted-foreground">
                  <span>{combinedRoute.totalMinutes} min</span>
                  <span>·</span>
                  <span>{combinedRoute.segments.length} segments</span>
                  <span>·</span>
                  <span>{combinedRoute.allSteps.length} steps</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {combinedRoute.segments.slice(0, 5).map((seg, idx) => (
                    <span
                      key={idx}
                      className="w-1.5 h-3 rounded-sm"
                      style={{ backgroundColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length].stroke }}
                      title={seg.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Zoom controls ──────────────────────────────────────────────── */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="w-7 h-7 rounded-lg bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center hover:bg-muted transition-all text-xs font-bold text-foreground"
          >
            −
          </button>
          <span className="w-10 text-center text-[10px] font-bold text-muted-foreground select-none">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            className="w-7 h-7 rounded-lg bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center hover:bg-muted transition-all text-xs font-bold text-foreground"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
