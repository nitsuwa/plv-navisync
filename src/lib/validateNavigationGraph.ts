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
import { doorDisplayName, doorHasIndoorNavigationConnection, doorNodeForEdge } from "./entranceTransitions";
import { edgePolylinePoints, roomDisplayName, isDoorEligibleForRoom, roomAccessDoorIds, segmentBlockedByWall } from "./indoorNavigationGraph";

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
 * Disconnected-component findings are intentionally network-level and do not
 * identify an arbitrary representative node for the admin.
 * component — never invents nodes or IDs.
 */
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
  // A closed edge is unavailable for routing, but it is still a persisted
  // connection. Treating only active edges as structural connections made
  // otherwise healthy pathway-generated endpoint nodes look orphaned (and
  // produced misleading warning badges) as soon as an edge was closed.
  for (const edge of edges) {
    if (edge.startNodeId) connectedNodeIds.add(edge.startNodeId);
    if (edge.endNodeId) connectedNodeIds.add(edge.endNodeId);
  }
  for (const node of nodes) {
    const linkedDoorContext = node.doorId && node.buildingId && node.floorId
      ? (() => {
          const building = buildings.find((candidate) => candidate.id === node.buildingId);
          const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
          const door = floor?.doors?.find((candidate) => candidate.id === node.doorId);
          return building && floor && door ? { floor, door } : undefined;
        })()
      : undefined;
    const linkedDoor = linkedDoorContext?.door;
    const linkedRoomContext = node.roomId && node.buildingId && node.floorId
      ? (() => {
          const building = buildings.find((candidate) => candidate.id === node.buildingId);
          const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
          const roomIndex = floor?.rooms?.findIndex((candidate) => candidate.id === node.roomId) ?? -1;
          const room = roomIndex >= 0 ? floor?.rooms?.[roomIndex] : undefined;
          return building && floor && room ? { floor, room, roomIndex } : undefined;
        })()
      : undefined;
    const linkedRoom = linkedRoomContext?.room;
    const linkedRoomTarget = linkedRoom && node.roomId && node.buildingId && node.floorId
      ? {
          scope: "floor" as const,
          mode: "design" as const,
          buildingId: node.buildingId,
          floorId: node.floorId,
          selectionType: "room" as const,
          id: node.roomId,
        }
      : undefined;
    // An entrance_transition is a semantic bridge, not an indoor Walking Path.
    // A Door connected only to an Entrance is therefore still an object-level
    // navigation issue and must be surfaced in Door Properties.
    const doorNeedsIndoorConnection = Boolean(
      linkedDoor && !doorHasIndoorNavigationConnection(nodes, edges, node),
    );
    // Rooms are destinations reached through their physical Door.  Keep the
    // canonical room_access node for routing compatibility, but surface the
    // incomplete relationship on the Room rather than asking admins to wire a
    // hidden point through a wall.
    if (linkedRoom && linkedRoomContext) {
      const linkedRoomDoors = roomAccessDoorIds(linkedRoom)
        .map((doorId) => linkedRoomContext.floor.doors?.find((door) => door.id === doorId))
        .filter((door): door is NonNullable<typeof door> => Boolean(door));
      const validRoomDoors = linkedRoomDoors.filter((door) => isDoorEligibleForRoom(linkedRoom, door, linkedRoomContext.floor.walls, nodes, { rooms: linkedRoomContext.floor.rooms ?? [] }));
      const roomDoorIssue = validRoomDoors.length === 0
        ? {
            message: `Room "${roomDisplayName(linkedRoom, linkedRoomContext.roomIndex)}" needs an entrance Door. Link a Door to this Room so routes know where to enter.`,
          }
        : !(() => {
            return validRoomDoors.some((door) => {
              const doorNode = nodes.find((candidate) => candidate.doorId === door.id);
              return doorNode && doorHasIndoorNavigationConnection(nodes, edges, doorNode);
            });
          })()
            ? {
                message: `The Door linked to Room "${roomDisplayName(linkedRoom, linkedRoomContext.roomIndex)}" is not connected to the Walking Network.`,
              }
            : null;
      if (roomDoorIssue) {
        issues.push({
          type: "nav_orphan_node",
          severity: "warning",
          message: roomDoorIssue.message,
          nodeId: node.id,
          buildingId: node.buildingId,
          floorId: node.floorId,
          target: linkedRoomTarget!,
        });
        continue;
      }
    }
    if (!doorNeedsIndoorConnection && connectedNodeIds.has(node.id)) continue;
    // Entrance nodes that are unlinked are warnings, not errors
    const severity = node.type === "entrance" ? "warning" : "warning";
    const label = node.name || node.type;
    // A linked Door's orphaned navigation anchor is an issue on the physical
    // Door, not an anonymous graph point.  Targeting the Door keeps the global
    // Issues locate action and the Floor Editor's Door Properties inspector on
    // the same object; the canonical node remains available in the graph.
    const linkedDoorTarget = linkedDoor && node.doorId && node.buildingId && node.floorId
      ? {
          scope: "floor" as const,
          mode: "design" as const,
          buildingId: node.buildingId,
          floorId: node.floorId,
          selectionType: "door" as const,
          id: node.doorId,
        }
      : undefined;
    const orphanMessage = linkedDoorTarget
      ? `Door "${doorDisplayName(linkedDoor, linkedDoorContext!.floor)}" is not connected to the indoor Walking Network. Connect this Door to a Walking Point so routes can enter or leave through it.`
      : linkedRoomTarget
        ? `Room "${roomDisplayName(linkedRoom, linkedRoomContext!.roomIndex)}" is not connected to the Walking Network. Connect this Room to a Walking Point so routes can reach it.`
      : `"${label}" has no navigation connections.`;
    issues.push({
      type: "nav_orphan_node",
      severity,
      message: orphanMessage,
      nodeId: node.id,
      buildingId: node.buildingId,
      floorId: node.floorId,
      target: linkedDoorTarget ?? linkedRoomTarget ?? navNodeTarget(node, node.id),
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
      const transition = activeEdges.find(
        (e) =>
          (e.startNodeId === entranceNode.id || e.endNodeId === entranceNode.id) &&
          e.type === "entrance_transition",
      );
      if (!transition && building.floors.length > 0) {
        issues.push({
          type: "nav_entrance_door_missing",
          severity: "warning",
          message: `Building entrance "${entrance.name || entrance.type}" is not linked to an indoor Door.`,
          buildingId: building.id,
          nodeId: entranceNode.id,
          // This is an incomplete relationship on the physical Entrance, not
          // an orphaned generic navigation node. Targeting the Entrance keeps
          // the global issue, canvas badge, and Entrance Properties inspector
          // on the same user-facing object.
          target: {
            scope: "campus",
            mode: "navigation",
            buildingId: building.id,
            selectionType: "entrance",
            id: entrance.id,
          },
        });
      } else if (transition && building.floors.length > 0) {
        const doorNode = doorNodeForEdge(transition, nodes);
        if (doorNode && !doorHasIndoorNavigationConnection(nodes, edges, doorNode)) {
          issues.push({
            type: "nav_entrance_door_not_connected",
            severity: "warning",
            message: "The linked indoor Door is not connected to the Walking Network.",
            buildingId: building.id,
            nodeId: entranceNode.id,
            target: {
              scope: "campus",
              mode: "navigation",
              buildingId: building.id,
              selectionType: "entrance",
              id: entrance.id,
            },
          });
        }
      }
    }
  }

  // ── E. Indoor node validation ──────────────────────────────────────────
  for (const node of nodes) {
    // Building-owned Exterior Emergency Stair discharge anchors are generated
    // outdoor infrastructure. They intentionally have no floorId, remain
    // connectable in the outdoor editor, and must not be reported as broken
    // indoor nodes merely because their type is `stair`.
    if (node.type === "outdoor" || node.type === "entrance" || (node.exteriorEmergencyStairId && !node.floorId)) continue;
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
          message: `Emergency exit ${doorDisplayName(door, floor)} has no navigation waypoint. Add one linked to this door so the exit participates in the navigation graph.`,
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
        // This is a campus/network-level readiness finding. It intentionally
        // has no object target: no individual generated node is defective.
        issues.push({
          type: "nav_disconnected_component",
          severity: "warning",
          message: `Outdoor navigation network has no connection to any indoor floor.`,
        });
      }
    }
    // If there are 2+ significant components, flag it
    if (significantComponents.length >= 2) {
      const totalNodes = significantComponents.reduce((sum, c) => sum + c.size, 0);
      if (totalNodes >= 3) {
        // This is a campus/network-level summary, not an issue owned by one
        // arbitrarily selected node.
        issues.push({
          type: "nav_disconnected_component",
          severity: "info",
          message: `Navigation graph has ${significantComponents.length} disconnected components. Consider connecting them for end-to-end routing.`,
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
        for (const edge of activeEdges) {
          if (edge.type === "floor_transition") continue;
          const pts = edgePolylinePoints(edge, floorNodes);
          if (!pts) continue;
          const blockedTarget: IssueTarget = {
            scope: "floor",
            mode: "navigation",
            buildingId: building.id,
            floorId: floor.id,
            selectionType: "navEdge",
            id: edge.id,
          };
          // Use the same thick-wall + local Door-aperture primitive as the
          // Floor Editor. The previous validator duplicated a centerline
          // approximation here, so valid Door crossings could be reported as
          // blocked even while the editor considered the edge clear.
          let blocked = pts.some((point, index) =>
            index < pts.length - 1 && walls.some((wall) =>
              segmentBlockedByWall(point, pts[index + 1], wall, doors) !== null
            )
          );
          // Check blocking furniture (any visible furniture blocks)
          const blockers = furniture.filter((f) => f.visible !== false);
          if (!blocked && blockers.length > 0) {
            for (let i = 0; i < pts.length - 1; i++) {
              for (let t = 0.1; t <= 0.9; t += 0.2) {
                const px = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
                const py = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
                for (const fb of blockers) {
                  if (pointInBuildingRect({ x: fb.x, y: fb.y, width: fb.width, height: fb.height, rotation: fb.rotation }, px, py)) {
                    blocked = true;
                    break;
                  }
                }
                if (blocked) break;
              }
              if (blocked) break;
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
