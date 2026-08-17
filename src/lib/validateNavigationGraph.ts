/**
 * B5 Phase 6 — Pure navigation graph readiness validation.
 *
 * Inspects the canonical Campus.navNodes / Campus.navEdges and reports
 * structural issues that would block end-to-end routing. Does NOT calculate
 * routes — graph readiness only.
 *
 * Reusable by B6/B7 later.
 *
 * B5 Final: every locatable issue now carries a structured `target` (see
 * ValidationIssue.target) so the editor can jump straight to the object —
 * including indoor issues that live on a building floor.
 */

import type { Campus, NavigationNode, NavigationEdge, CampusBuilding } from "../components/map-builder/types";
import type { ValidationIssue, IssueTarget } from "../components/map-builder/ValidationErrorsDialog";

// ── Types ──────────────────────────────────────────────────────────────────

export type NavGraphReadinessStatus = "ready" | "needs_attention" | "not_ready";

export interface NavGraphReadinessResult {
  status: NavGraphReadinessStatus;
  issues: ValidationIssue[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function nodeById(nodes: NavigationNode[]): Map<string, NavigationNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

function edgeKey(e: NavigationEdge): string {
  const [a, b] = [e.startNodeId, e.endNodeId].sort();
  return `${a}::${b}`;
}

/** Simple BFS to find connected components in an undirected graph. */
function connectedComponents(
  nodeIds: Set<string>,
  adjacency: Map<string, Set<string>>,
): Set<string>[] {
  const visited = new Set<string>();
  const components: Set<string>[] = [];
  for (const start of nodeIds) {
    if (visited.has(start)) continue;
    const component = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.add(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

/**
 * Derive the building/floor an edge lives on from its endpoint nodes.
 * Indoor edges report the floor they belong to; outdoor edges report nothing.
 */
function edgeLocation(edge: NavigationEdge, nodeMap: Map<string, NavigationNode>): { buildingId?: string; floorId?: string } {
  const indoor = [nodeMap.get(edge.startNodeId), nodeMap.get(edge.endNodeId)].find(
    (n) => n && n.floorId,
  );
  return indoor
    ? { buildingId: indoor.buildingId, floorId: indoor.floorId }
    : {};
}

/** Campus-scope target for an outdoor navigation edge issue. */
function outdoorEdgeTarget(edge: NavigationEdge): IssueTarget {
  return { scope: "campus", mode: "navigation", selectionType: "navEdge", id: edge.id };
}

/** Floor-or-campus target for a nav edge, honoring an indoor location. */
function navEdgeTarget(edge: NavigationEdge, nodeMap: Map<string, NavigationNode>): IssueTarget {
  const loc = edgeLocation(edge, nodeMap);
  if (loc.floorId) {
    return {
      scope: "floor",
      mode: "navigation",
      buildingId: loc.buildingId,
      floorId: loc.floorId,
      selectionType: "navEdge",
      id: edge.id,
    };
  }
  return outdoorEdgeTarget(edge);
}

/** Floor-or-campus target for a nav node. */
function navNodeTarget(node: NavigationNode | undefined, id: string): IssueTarget {
  return {
    scope: node?.floorId ? "floor" : "campus",
    mode: "navigation",
    buildingId: node?.buildingId,
    floorId: node?.floorId,
    selectionType: "navNode",
    id,
  };
}

/**
 * Target for a floor-transition issue. When the transition node references a
 * physical Stair/Elevator/Ramp, prefer that physical object in Design mode
 * (where the Stair Connection / Elevator Shaft shared ID is edited); fall
 * back to the nav node itself.
 */
function transitionTarget(node: NavigationNode | undefined, fallbackId: string): IssueTarget {
  if (node?.stairId) {
    return {
      scope: "floor",
      mode: "design",
      buildingId: node.buildingId,
      floorId: node.floorId,
      selectionType: "stairs",
      id: node.stairId,
    };
  }
  if (node?.elevatorId) {
    return {
      scope: "floor",
      mode: "design",
      buildingId: node.buildingId,
      floorId: node.floorId,
      selectionType: "elevator",
      id: node.elevatorId,
    };
  }
  if (node?.rampId) {
    return {
      scope: "floor",
      mode: "design",
      buildingId: node.buildingId,
      floorId: node.floorId,
      selectionType: "ramp",
      id: node.rampId,
    };
  }
  return navNodeTarget(node, fallbackId);
}

/**
 * Pick a meaningful representative node for a connected component so a
 * disconnected-graph issue can be located. Prefers an outdoor/entrance node
 * (visible on the campus canvas) and falls back to any surviving node of the
 * component — never invents nodes or IDs.
 */
function representativeNodeForComponent(
  component: Set<string>,
  nodeMap: Map<string, NavigationNode>,
): NavigationNode | undefined {
  const nodes = [...component]
    .map((id) => nodeMap.get(id))
    .filter((n): n is NavigationNode => !!n);
  return nodes.find((n) => n.type === "outdoor" || n.type === "entrance") ?? nodes[0];
}

// ── Main validation ────────────────────────────────────────────────────────

export function validateNavigationGraph(campus: Campus): NavGraphReadinessResult {
  const issues: ValidationIssue[] = [];
  const nodes = campus.navNodes ?? [];
  const edges = campus.navEdges ?? [];
  const buildings = campus.buildings ?? [];

  const nodeMap = nodeById(nodes);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // ── A. Broken edge references ──────────────────────────────────────────
  const activeEdges = edges.filter((e) => !e.closed);
  for (const edge of activeEdges) {
    if (!edge.startNodeId || !edge.endNodeId) {
      issues.push({
        type: "nav_broken_edge",
        severity: "error",
        message: "A navigation edge is missing a start or end node reference.",
        edgeId: edge.id,
        target: outdoorEdgeTarget(edge),
      });
      continue;
    }
    if (!nodeMap.has(edge.startNodeId)) {
      issues.push({
        type: "nav_broken_edge",
        severity: "error",
        message: `Navigation edge references a missing start node.`,
        edgeId: edge.id,
        target: navEdgeTarget(edge, nodeMap),
      });
    }
    if (!nodeMap.has(edge.endNodeId)) {
      issues.push({
        type: "nav_broken_edge",
        severity: "error",
        message: `Navigation edge references a missing end node.`,
        edgeId: edge.id,
        target: navEdgeTarget(edge, nodeMap),
      });
    }
    if (edge.startNodeId === edge.endNodeId) {
      issues.push({
        type: "nav_broken_edge",
        severity: "warning",
        message: `Navigation edge connects a node to itself.`,
        edgeId: edge.id,
        nodeId: edge.startNodeId,
        target: navEdgeTarget(edge, nodeMap),
      });
    }
  }

  // ── B. Duplicate edges ─────────────────────────────────────────────────
  const seenEdgeKeys = new Map<string, string>(); // edgeKey → first edge id
  for (const edge of activeEdges) {
    if (!edge.startNodeId || !edge.endNodeId) continue;
    const key = edgeKey(edge);
    if (seenEdgeKeys.has(key)) {
      issues.push({
        type: "nav_duplicate_edge",
        severity: "warning",
        message: `Duplicate navigation connection between the same two nodes.`,
        edgeId: edge.id,
        target: navEdgeTarget(edge, nodeMap),
      });
    } else {
      seenEdgeKeys.set(key, edge.id);
    }
  }

  // ── C. Orphan navigation nodes ─────────────────────────────────────────
  const connectedNodeIds = new Set<string>();
  for (const edge of activeEdges) {
    if (edge.startNodeId) connectedNodeIds.add(edge.startNodeId);
    if (edge.endNodeId) connectedNodeIds.add(edge.endNodeId);
  }
  for (const node of nodes) {
    if (connectedNodeIds.has(node.id)) continue;
    // Entrance nodes that are unlinked are warnings, not errors
    const severity = node.type === "entrance" ? "warning" : "warning";
    const label = node.name || node.type;
    issues.push({
      type: "nav_orphan_node",
      severity,
      message: `"${label}" has no navigation connections.`,
      nodeId: node.id,
      buildingId: node.buildingId,
      floorId: node.floorId,
      target: navNodeTarget(node, node.id),
    });
  }

  // ── D. Entrance bridge validation ──────────────────────────────────────
  for (const building of buildings) {
    const entrances = building.entrances ?? [];
    for (const entrance of entrances) {
      // Find the outdoor entrance nav node for this entrance
      const entranceNode = nodes.find(
        (n) => n.type === "entrance" && n.buildingId === building.id && n.entranceId === entrance.id,
      );
      if (!entranceNode) {
        // No nav node for this entrance — only flag if building has indoor floors
        if (building.floors.length > 0) {
          issues.push({
            type: "nav_entrance_bridge_missing",
            severity: "warning",
            message: `Building entrance "${entrance.name || entrance.type}" has no navigation waypoint. Add one to connect outdoor and indoor navigation.`,
            buildingId: building.id,
            target: {
              scope: "campus",
              mode: "navigation",
              buildingId: building.id,
              selectionType: "entrance",
              id: entrance.id,
            },
          });
        }
        continue;
      }
      // Check for entrance_transition edge from this entrance node
      const hasTransition = activeEdges.some(
        (e) =>
          (e.startNodeId === entranceNode.id || e.endNodeId === entranceNode.id) &&
          e.type === "entrance_transition",
      );
      if (!hasTransition && building.floors.length > 0) {
        issues.push({
          type: "nav_entrance_door_missing",
          severity: "warning",
          message: `Building entrance "${entrance.name || entrance.type}" is linked but has no entrance transition to an indoor door.`,
          buildingId: building.id,
          nodeId: entranceNode.id,
          target: navNodeTarget(entranceNode, entranceNode.id),
        });
      }
    }
  }

  // ── E. Indoor node validation ──────────────────────────────────────────
  for (const node of nodes) {
    if (node.type === "outdoor" || node.type === "entrance") continue;
    // Indoor nodes should have a floorId
    if (!node.floorId) {
      issues.push({
        type: "nav_broken_edge",
        severity: "warning",
        message: `Indoor navigation node "${node.name}" has no floor assignment.`,
        nodeId: node.id,
        buildingId: node.buildingId,
        target: navNodeTarget(node, node.id),
      });
    }
    // Check linked physical objects still exist
    if (node.doorId && node.buildingId && node.floorId) {
      const building = buildings.find((b) => b.id === node.buildingId);
      const floor = building?.floors.find((f) => f.id === node.floorId);
      const door = floor?.doors?.find((d) => d.id === node.doorId);
      if (!door) {
        issues.push({
          type: "nav_broken_edge",
          severity: "error",
          message: `Navigation node "${node.name}" references a door that no longer exists.`,
          nodeId: node.id,
          buildingId: node.buildingId,
          floorId: node.floorId,
          // The physical door is gone — select the broken nav node itself.
          target: navNodeTarget(node, node.id),
        });
      }
    }
    if (node.roomId && node.buildingId && node.floorId) {
      const building = buildings.find((b) => b.id === node.buildingId);
      const floor = building?.floors.find((f) => f.id === node.floorId);
      const room = floor?.rooms?.find((r) => r.id === node.roomId);
      if (!room) {
        issues.push({
          type: "nav_broken_edge",
          severity: "error",
          message: `Navigation node "${node.name}" references a room that no longer exists.`,
          nodeId: node.id,
          buildingId: node.buildingId,
          floorId: node.floorId,
          // The physical room is gone — select the broken nav node itself.
          target: navNodeTarget(node, node.id),
        });
      }
    }
  }

  // ── E.5 Emergency exits must be present in the navigation graph (B7 P1) ─
  // Structural only: a door marked isEmergencyExit must have a canonical
  // NavigationNode linked through node.doorId. This does NOT prove an
  // evacuation route exists — route verification is B8.
  for (const building of buildings) {
    for (const floor of building.floors ?? []) {
      for (const door of floor.doors ?? []) {
        if (door.isEmergencyExit !== true) continue;
        const linked = nodes.some((n) => n.doorId === door.id);
        if (linked) continue;
        issues.push({
          type: "emergency_exit_no_nav",
          severity: "warning",
          message: `Emergency exit door "${door.label || door.id}" has no navigation waypoint. Add one linked to this door so the exit participates in the navigation graph.`,
          buildingId: building.id,
          floorId: floor.id,
          target: {
            scope: "floor",
            mode: "design",
            buildingId: building.id,
            floorId: floor.id,
            selectionType: "door",
            id: door.id,
          },
        });
      }
    }
  }

  // ── F. Floor transition validation ─────────────────────────────────────
  const transitionEdges = activeEdges.filter((e) => e.type === "floor_transition");
  for (const edge of transitionEdges) {
    const startNode = nodeMap.get(edge.startNodeId);
    const endNode = nodeMap.get(edge.endNodeId);
    if (!startNode || !endNode) continue;
    // Both nodes should be stair/elevator type
    if (startNode.type !== "stair" && startNode.type !== "elevator" && startNode.type !== "ramp") {
      issues.push({
        type: "nav_floor_transition_invalid",
        severity: "error",
        message: `Floor transition edge starts from a non-transition node "${startNode.name}".`,
        edgeId: edge.id,
        nodeId: startNode.id,
        floorId: startNode.floorId,
        target: navNodeTarget(startNode, startNode.id),
      });
    }
    if (endNode.type !== "stair" && endNode.type !== "elevator" && endNode.type !== "ramp") {
      issues.push({
        type: "nav_floor_transition_invalid",
        severity: "error",
        message: `Floor transition edge ends at a non-transition node "${endNode.name}".`,
        edgeId: edge.id,
        nodeId: endNode.id,
        floorId: endNode.floorId,
        target: navNodeTarget(endNode, endNode.id),
      });
    }
    // Transition nodes should have transitionSharedId
    if (!startNode.transitionSharedId || !endNode.transitionSharedId) {
      issues.push({
        type: "nav_floor_transition_invalid",
        severity: "warning",
        message: `Floor transition is missing a shared transition ID.`,
        edgeId: edge.id,
        nodeId: startNode.id,
        floorId: startNode.floorId,
        buildingId: startNode.buildingId,
        // Design mode + the physical stair/elevator so the shared ID can be fixed.
        target: transitionTarget(startNode, startNode.id),
      });
    } else if (startNode.transitionSharedId !== endNode.transitionSharedId) {
      issues.push({
        type: "nav_floor_transition_invalid",
        severity: "error",
        message: `Floor transition links nodes from different transition groups.`,
        edgeId: edge.id,
        nodeId: startNode.id,
        floorId: startNode.floorId,
        buildingId: startNode.buildingId,
        target: transitionTarget(startNode, startNode.id),
      });
    }
    // Adjacent floors should be connected
    if (startNode.floorId && endNode.floorId && startNode.floorId === endNode.floorId) {
      issues.push({
        type: "nav_floor_transition_invalid",
        severity: "warning",
        message: `Floor transition connects two nodes on the same floor.`,
        edgeId: edge.id,
        floorId: startNode.floorId,
        buildingId: startNode.buildingId,
        target: navEdgeTarget(edge, nodeMap),
      });
    }
  }

  // ── G. Accessibility contradictions ────────────────────────────────────
  for (const edge of activeEdges) {
    const startNode = nodeMap.get(edge.startNodeId);
    const endNode = nodeMap.get(edge.endNodeId);
    if (!startNode || !endNode) continue;
    // Stair transitions should not be marked accessible
    if (
      edge.type === "floor_transition" &&
      edge.accessible &&
      (startNode.type === "stair" || endNode.type === "stair")
    ) {
      issues.push({
        type: "nav_accessibility_contradiction",
        severity: "warning",
        message: `Stair floor transition is marked accessible, but stairs are typically non-accessible.`,
        edgeId: edge.id,
        nodeId: startNode.id,
        target: navEdgeTarget(edge, nodeMap),
      });
    }
    // Elevator/ramp transitions should be accessible
    if (
      edge.type === "floor_transition" &&
      !edge.accessible &&
      (startNode.type === "elevator" || startNode.type === "ramp" || endNode.type === "elevator" || endNode.type === "ramp")
    ) {
      issues.push({
        type: "nav_accessibility_contradiction",
        severity: "warning",
        message: `Elevator/Ramp floor transition is marked non-accessible.`,
        edgeId: edge.id,
        nodeId: startNode.id,
        target: navEdgeTarget(edge, nodeMap),
      });
    }
  }

  // ── H. Disconnected component analysis ─────────────────────────────────
  // Build adjacency for active edges
  const adjacency = new Map<string, Set<string>>();
  for (const id of nodeIds) adjacency.set(id, new Set());
  for (const edge of activeEdges) {
    if (!edge.startNodeId || !edge.endNodeId) continue;
    adjacency.get(edge.startNodeId)?.add(edge.endNodeId);
    adjacency.get(edge.endNodeId)?.add(edge.startNodeId);
  }
  const components = connectedComponents(nodeIds, adjacency);

  // If there are 2+ components with2+ nodes each, flag disconnected
  const significantComponents = components.filter((c) => c.size >= 2);
  if (significantComponents.length >= 2) {
    // Check if any component contains an entrance node (outdoor) and another contains indoor nodes
    for (const comp of significantComponents) {
      const hasEntrance = [...comp].some((id) => {
        const n = nodeMap.get(id);
        return n?.type === "entrance" || n?.type === "outdoor";
      });
      const hasIndoor = [...comp].some((id) => {
        const n = nodeMap.get(id);
        return n && n.type !== "outdoor" && n.type !== "entrance";
      });
      if (hasEntrance && hasIndoor) {
        // This component bridges outdoor and indoor — good
      } else if (hasEntrance && !hasIndoor) {
        // Target a representative outdoor/entrance node of THIS component so
        // the admin can locate the stranded outdoor network and rejoin it.
        const rep = representativeNodeForComponent(comp, nodeMap);
        issues.push({
          type: "nav_disconnected_component",
          severity: "warning",
          message: `Outdoor navigation network has no connection to any indoor floor.`,
          nodeId: rep?.id,
          buildingId: rep?.buildingId,
          floorId: rep?.floorId,
          target: rep ? navNodeTarget(rep, rep.id) : undefined,
        });
      }
    }
    // If there are 2+ significant components, flag it
    if (significantComponents.length >= 2) {
      const totalNodes = significantComponents.reduce((sum, c) => sum + c.size, 0);
      if (totalNodes >= 3) {
        // Target a representative node of the LARGEST component — the natural
        // anchor the admin should rejoin the other components to.
        let rep: NavigationNode | undefined;
        let repSize = 0;
        for (const comp of significantComponents) {
          if (comp.size > repSize) {
            const candidate = representativeNodeForComponent(comp, nodeMap);
            if (candidate) {
              rep = candidate;
              repSize = comp.size;
            }
          }
        }
        issues.push({
          type: "nav_disconnected_component",
          severity: "info",
          message: `Navigation graph has ${significantComponents.length} disconnected components. Consider connecting them for end-to-end routing.`,
          nodeId: rep?.id,
          buildingId: rep?.buildingId,
          floorId: rep?.floorId,
          target: rep ? navNodeTarget(rep, rep.id) : undefined,
        });
      }
    }
  }

  // ── I. Obstacle-blocked edges (B5 Phase 6.10) ───────────────────────
  // Check outdoor edges against building footprints and indoor edges
  // against walls + blocking furniture. These are LIVE visual states that
  // also surface as readiness issues. The indicator rule matches the editors:
  // ANY placed non-background decor asset (ground-area is background terrain)
  // and ANY visible indoor furniture blocks an edge.
  {
    const NON_BLOCKING_ASSET_TYPES = new Set(["ground-area"]);
    const pointInBuildingRect = (
      bldg: { x: number; y: number; width: number; height: number; rotation?: number },
      px: number, py: number
    ): boolean => {
      const rotation = bldg.rotation ?? 0;
      const cx = bldg.x + bldg.width / 2;
      const cy = bldg.y + bldg.height / 2;
      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = px - cx;
      const dy = py - cy;
      const ux = dx * cos - dy * sin;
      const uy = dx * sin + dy * cos;
      return ux >= -bldg.width / 2 && ux <= bldg.width / 2 && uy >= -bldg.height / 2 && uy <= bldg.height / 2;
    };
    const polylineBlockedByBuilding = (
      pts: { x: number; y: number }[],
      bldgs: { x: number; y: number; width: number; height: number; rotation?: number }[],
      decorAssets?: { x: number; y: number; width: number; height: number; type: string; rotation?: number; scale?: number }[],
    ): boolean => {
      for (let i = 0; i < pts.length - 1; i++) {
        for (let t = 0.15; t <= 0.85; t += 0.175) {
          const px = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
          const py = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
          if (bldgs.some((b) => pointInBuildingRect(b, px, py))) return true;
          if (decorAssets) {
            for (const a of decorAssets.filter((a) => a.visible !== false && !NON_BLOCKING_ASSET_TYPES.has(a.type))) {
              const sc = a.scale ?? 1;
              if (pointInBuildingRect({ x: a.x, y: a.y, width: a.width * sc, height: a.height * sc, rotation: a.rotation }, px, py)) return true;
            }
          }
        }
      }
      return false;
    };
    const allDecorAssets = campus.decorAssets ?? [];
    // Outdoor edges: check against buildings and solid decor assets
    const outdoorNodeMap = new Map(nodes.filter((n) => n.type === "outdoor" || n.type === "entrance").map((n) => [n.id, n]));
    for (const edge of activeEdges) {
      if (edge.type === "floor_transition" || edge.type === "entrance_transition") continue;
      const a = outdoorNodeMap.get(edge.startNodeId);
      const b = outdoorNodeMap.get(edge.endNodeId);
      if (!a || !b) continue;
      const pts = [{ x: a.x, y: a.y }, ...(edge.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })), { x: b.x, y: b.y }];
      if (polylineBlockedByBuilding(pts, buildings, allDecorAssets)) {
        issues.push({
          type: "nav_edge_blocked_by_obstacle",
          severity: "warning",
          message: "Navigation connection intersects a blocking obstacle.",
          edgeId: edge.id,
          target: outdoorEdgeTarget(edge),
        });
      }
    }
    // Indoor edges: check against walls (simplified — full wall model is in
    // the editor; here we do a basic polyline-vs-wall-centerline check)
    for (const building of buildings) {
      for (const floor of building.floors ?? []) {
        const walls = floor.walls ?? [];
        const doors = floor.doors ?? [];
        const furniture = floor.furniture ?? [];
        const floorNodes = nodes.filter((n) => n.buildingId === building.id && n.floorId === floor.id);
        const floorNodeMap = new Map(floorNodes.map((n) => [n.id, n]));
        for (const edge of activeEdges) {
          if (edge.type === "floor_transition") continue;
          const a = floorNodeMap.get(edge.startNodeId);
          const b = floorNodeMap.get(edge.endNodeId);
          if (!a || !b) continue;
          const pts = [{ x: a.x, y: a.y }, ...(edge.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })), { x: b.x, y: b.y }];
          const blockedTarget: IssueTarget = {
            scope: "floor",
            mode: "navigation",
            buildingId: building.id,
            floorId: floor.id,
            selectionType: "navEdge",
            id: edge.id,
          };
          // Simplified wall check: perpendicular distance from segment to wall centerline
          const WALL_CLEARANCE = 6;
          for (const wall of walls) {
            if (wall.visible === false) continue;
            const wx = wall.x2 - wall.x1;
            const wy = wall.y2 - wall.y1;
            const wallLen = Math.hypot(wx, wy);
            if (wallLen === 0) continue;
            const r = wall.thickness / 2 + WALL_CLEARANCE;
            let blocked = false;
            for (let i = 0; i < pts.length - 1 && !blocked; i++) {
              const ax = pts[i + 1].x - pts[i].x;
              const ay = pts[i + 1].y - pts[i].y;
              const ux = wx / wallLen;
              const uy = wy / wallLen;
              const c0 = (pts[i].x - wall.x1) * uy - (pts[i].y - wall.y1) * ux;
              const c1 = ax * uy - ay * ux;
              const t0 = c1 === 0 ? (Math.abs(c0) <= r ? 0 : 1) : Math.max(0, Math.min(1, (-r - c0) / c1));
              const t1 = c1 === 0 ? (Math.abs(c0) <= r ? 1 : 0) : Math.max(0, Math.min(1, (r - c0) / c1));
              const lo = Math.min(t0, t1);
              const hi = Math.max(t0, t1);
              if (lo <= hi) {
                // Check if overlap falls within wall span
                const p0 = (pts[i].x - wall.x1) * ux + (pts[i].y - wall.y1) * uy;
                const p1 = ax * ux + ay * uy;
                const projLo = p0 + p1 * lo;
                const projHi = p0 + p1 * hi;
                if (projHi >= 0 && projLo <= wallLen) {
                  // Check if NOT within a door opening
                  const inDoor = doors.some((d) => {
                    if (d.visible === false) return false;
                    if (d.wallId && d.wallId !== wall.id) return false;
                    const doorPos = ((d.x - wall.x1) * wx + (d.y - wall.y1) * wy) / wallLen;
                    return projLo >= doorPos - d.width / 2 && projHi <= doorPos + d.width / 2;
                  });
                  if (!inDoor) blocked = true;
                }
              }
            }
            if (blocked) {
              issues.push({
                type: "nav_edge_blocked_by_obstacle",
                severity: "warning",
                message: "Navigation connection intersects a blocking obstacle.",
                edgeId: edge.id,
                target: blockedTarget,
              });
              break;
            }
          }
          // Check blocking furniture (any visible furniture blocks)
          const blockers = furniture.filter((f) => f.visible !== false);
          if (blockers.length > 0) {
            for (let i = 0; i < pts.length - 1; i++) {
              for (let t = 0.1; t <= 0.9; t += 0.2) {
                const px = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
                const py = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
                for (const fb of blockers) {
                  if (pointInBuildingRect({ x: fb.x, y: fb.y, width: fb.width, height: fb.height, rotation: fb.rotation }, px, py)) {
                    issues.push({
                      type: "nav_edge_blocked_by_obstacle",
                      severity: "warning",
                      message: "Navigation connection intersects a blocking obstacle.",
                      edgeId: edge.id,
                      target: blockedTarget,
                    });
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // ── Aggregate status ───────────────────────────────────────────────────
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasSignificantWarnings = issues.some(
    (i) => i.severity === "warning" && i.type !== "nav_orphan_node",
  );
  const status: NavGraphReadinessStatus = hasErrors
    ? "not_ready"
    : hasSignificantWarnings
      ? "needs_attention"
      : "ready";

  return { status, issues };
}
