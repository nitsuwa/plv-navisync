import { createContext, useState, useCallback, useMemo, useEffect, useRef, useContext } from "react";
import { createPortal } from "react-dom";
import { Route, ArrowRight, ArrowRightLeft, AlertTriangle, CheckCircle2, Loader2, X, Search, MapPin, Minimize2, Maximize2, Footprints, Accessibility, ShieldAlert, Eye, EyeOff, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { Tooltip } from "../ui/Tooltip";
import { findNavigationRoute, truncateGraphPathAtNode } from "../../lib/pathfinding";
import {
  reconcileRoomDoorEdges,
  roomDisplayName,
  isDoorEligibleForRoom,
  roomAccessDoorIds,
  ROOM_DOOR_EDGE_TYPE,
  normalizeNavigationEdges,
  normalizeBendPoints,
  navEdgePolylineDistance,
  navEdgeIsBlockedExtended,
  reconcileCrossFloorTransitions,
} from "../../lib/indoorNavigationGraph";
import {
  doorHasIndoorNavigationConnection,
  findEntranceTransitionForEntrance,
  entranceNodeForEdge,
  doorNodeForEdge,
  findEntranceOutdoorConnection,
} from "../../lib/entranceTransitions";
import { normalizeEntranceDirection, normalizeEntranceType } from "../../lib/buildingEntrances";
import { polylineCrossesBuilding } from "../../lib/editorPlacement";
import { canonicalExteriorEmergencyStairsForBuilding, exteriorEmergencyStairRouteReadiness } from "../../lib/exteriorEmergencyStairs";
import { campusWorldPointToExteriorFloor, exteriorApproachEntranceReadiness, exteriorApproachNodeId, exteriorFloorPointToCampusWorld, reconcileExteriorApproachNavigation } from "../../lib/exteriorApproachNavigation";
import { campusGates, campusGateNodeIds, outdoorNetworkReachesCampusGate } from "../../lib/campusGates";
import { validateNavigationGraph } from "../../lib/validateNavigationGraph";
import type { GraphPath } from "../../lib/pathfinding";
import type { Campus, CampusEntrance, FloorDoor, FloorPlan, FloorRoom, FloorWall, NavigationEdge, NavigationNode } from "./types";

export type RouteMode = "standard" | "accessible" | "emergency";
export type StandardRoutePreference = "best" | "stairs" | "elevator";
type EntranceDirectionRole = "inbound" | "outbound" | "any";

/** Keep route-mode color semantics in one presentation resolver so every
 * context (Outdoor and Floor) paints the same calculated route consistently. */
export function routeColorForMode(routeMode: RouteMode): string {
  if (routeMode === "emergency") return "#dc2626";
  // Keep the active Accessible route in the existing teal/emerald family,
  // distinct from the normal authored walking-network green.
  if (routeMode === "accessible") return "#0d9488";
  return "#3b82f6";
}

function entranceHasNavigationConnection(campus: Campus, buildingId: string, entrance: CampusEntrance): boolean {
  const entranceNode = (campus.navNodes ?? []).find((node) => node.buildingId === buildingId
    && node.entranceId === entrance.id
    && !node.floorId);
  if (!entranceNode) return false;
  return !!findEntranceTransitionForEntrance(campus.navNodes, campus.navEdges, buildingId, entrance.id)
    || (campus.navEdges ?? []).some((edge) => !edge.closed
      && (edge.startNodeId === entranceNode.id || edge.endNodeId === entranceNode.id));
}

function normalGeneralEntranceCount(campus: Campus, buildingId: string): number {
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingId);
  if (!building) return 0;
  return (building.entrances ?? []).filter((entrance) => normalizeEntranceType(entrance.type) === "general"
    && entranceHasNavigationConnection(campus, buildingId, entrance)).length;
}

function hasNormalOutboundGeneralEntrance(campus: Campus, buildingId: string): boolean {
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingId);
  if (!building) return false;
  return (building.entrances ?? []).some((entrance) => normalizeEntranceType(entrance.type) === "general"
    && normalizeEntranceDirection(entrance) !== "entrance_only"
    && entranceHasNavigationConnection(campus, buildingId, entrance));
}

function entranceDirectionAllowed(
  campus: Campus,
  buildingId: string,
  entrance: CampusEntrance,
  role: EntranceDirectionRole,
): boolean {
  if (role === "any") return true;
  if (normalizeEntranceType(entrance.type) !== "general") return true;
  const direction = normalizeEntranceDirection(entrance);
  const singleGeneralFallback = normalGeneralEntranceCount(campus, buildingId) === 1;
  if (role === "inbound") return singleGeneralFallback || direction !== "exit_only";
  // Keep the saved direction unchanged, but retain a safe compatibility route
  // when a building has no routine outbound-capable General Access entrance at
  // all. This is intentionally evaluated per building/candidate and does not
  // apply to Emergency or legacy Service Access entrances.
  return singleGeneralFallback || direction !== "entrance_only"
    || !hasNormalOutboundGeneralEntrance(campus, buildingId);
}

export type TestRouteContext = {
  kind: "outdoor" | "floor";
  buildingId?: string;
  floorId?: string;
};

export type TestRouteTransitionMarker = {
  id: string;
  x: number;
  y: number;
  kind: "entrance" | "stair" | "elevator" | "ramp";
  context: TestRouteContext;
  targetContext: TestRouteContext;
  /** Human-readable destination context for the marker's accessible label. */
  targetLabel?: string;
  /** Ordered floor movement for stair/elevator instructions. */
  direction?: "up" | "down";
  /** Presentation hint when the transition starts at the semantic Start node. */
  endpointRole?: "start" | "destination";
  /** Exact route node on the destination side of the transition.  Keeping
   * this with the marker prevents a floor switch from having to infer a
   * target from quick-navigation order or a display label. */
  targetNodeId?: string;
  /** Optional context-aware copy (for example, Exit Building 3). */
  instruction?: string;
};

export type TestRouteContinuationMarker = {
  /** Canonical node where the active route hands off to the next semantic
   * boundary. This is presentation-only; it never adds a graph portal. */
  nodeId: string;
  kind: "entrance" | "ramp" | "steps" | "waypoint";
  /** Context-projected cue position. Canonical node coordinates remain in the graph. */
  x?: number;
  y?: number;
  /** First node in the hidden continuation, when the marker is hosted by a
   * visible waypoint rather than the semantic boundary itself. */
  targetNodeId?: string;
  /** Optional copy for the display-only waypoint fallback. */
  instruction?: string;
};

/**
 * Resolve the one physical exterior access feature represented by a
 * calculated route.  The route node sequence is authoritative: alternatives
 * that are merely connected to the same Veranda are not active unless their
 * derived outer anchor is actually on this route.
 *
 * For the unusual case where a route crosses more than one exterior anchor,
 * choose the anchor at the current outdoor handoff: the last qualifying
 * feature for an indoor-to-outdoor route and the first for the reverse route.
 * This keeps the continuation cue attached to the feature the user actually
 * traverses at this context boundary.
 */
export function selectedExteriorAccessFeatureNode(
  campus: Campus,
  nodeIds: string[],
  routeMode: RouteMode = "standard",
): CampusNavNode | undefined {
  if (routeMode === "emergency") return undefined;
  const nodes = campus.navNodes ?? [];
  const routeNodes = routeDisplayNodeIds(nodeIds, campus)
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is CampusNavNode => !!node);
  const canonicalEdges = campus.navEdges ?? [];
  const features = routeNodes.filter((node, index) => {
    const isEligibleFeature = node.derivedRole === "outer"
      && (routeMode === "accessible"
        ? node.derivedOwnerType === "entrance_ramp"
        : node.derivedOwnerType === "entrance_ramp" || node.derivedOwnerType === "entrance_steps");
    if (!isEligibleFeature || !node.derivedOwnerId) return false;
    // An outer anchor is a continuation owner only when the actual route also
    // traverses its matching inner->outer transition edge.  Merely having an
    // outer helper on the route (or near a generic Veranda junction) is not
    // enough to make that junction a portal.
    return [routeNodes[index - 1], routeNodes[index + 1]].some((adjacent) => {
      if (!adjacent
        || adjacent.derivedOwnerType !== node.derivedOwnerType
        || adjacent.derivedOwnerId !== node.derivedOwnerId
        || adjacent.derivedRole !== "inner") return false;
      return canonicalEdges.some((edge) => {
        const forward = edge.startNodeId === adjacent.id && edge.endNodeId === node.id;
        const reverse = edge.bidirectional && edge.startNodeId === node.id && edge.endNodeId === adjacent.id;
        return (forward || reverse)
          && !edge.closed
          && edge.derivedOwnerType === node.derivedOwnerType
          && edge.derivedOwnerId === node.derivedOwnerId;
      });
    });
  });
  if (features.length === 0) return undefined;
  return routeNodes[0]?.floorId ? features[features.length - 1] : features[0];
}

export type TestRouteHighlight = {
  waypoints: { x: number; y: number }[];
  /** Separate visible route fragments. Hidden context segments never bridge these. */
  waypointFragments?: { x: number; y: number }[][];
  color: string;
  /** Canonical physical node IDs represented by the current visible segment. */
  routeNodeIds?: string[];
  endpointMarkers?: { x: number; y: number; kind: "start" | "destination" }[];
  transitionMarkers?: TestRouteTransitionMarker[];
  continuationMarkers?: TestRouteContinuationMarker[];
  semanticEndpoints?: { x: number; y: number; width: number; height: number; kind: "start" | "destination" }[];
};

export type TestRouteSession = {
  startValue: string;
  destValue: string;
  /** The automatically selected safe outdoor endpoint used by Emergency mode. */
  emergencyDestinationValue?: string;
  emergencyDestinationLabel?: string;
  routeMode: RouteMode;
  /** Standard-only preference for the intermediate cross-floor method. */
  routePreference?: StandardRoutePreference;
  result: GraphPath | null;
  error: string | null;
  hasCalculatedRoute: boolean;
  manualCollapsed: boolean;
  manualExpanded: boolean;
  liveRouteEnabled: boolean;
  /** Presentation-only admin route preview state; never persisted to campus data. */
  previewRoute?: boolean;
  /** One-shot focus request consumed by the editor that owns the route origin. */
  pendingFocus?: { nodeId: string; context: TestRouteContext };
};

type TestRouteSessionContextValue = {
  session: TestRouteSession | null;
  setSession: (session: TestRouteSession | null) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** User's transient Map Builder navigation preference.  This lives beside
   * the campus-scoped route session so Outdoor/Floor editor remounts do not
   * reset it, but it is never persisted as campus data. */
  navigationEnabled: boolean;
  setNavigationEnabled: (enabled: boolean) => void;
};

const defaultTestRouteSessionContext: TestRouteSessionContextValue = {
  session: null,
  setSession: () => undefined,
  open: false,
  setOpen: () => undefined,
  navigationEnabled: false,
  setNavigationEnabled: () => undefined,
};

const TestRouteSessionContext = createContext<TestRouteSessionContextValue>(defaultTestRouteSessionContext);

export function TestRouteSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<TestRouteSession | null>(null);
  const [open, setOpen] = useState(false);
  const [navigationEnabled, setNavigationEnabled] = useState(false);
  const value = useMemo(() => ({
    session,
    setSession,
    open,
    setOpen,
    navigationEnabled,
    setNavigationEnabled,
  }), [navigationEnabled, open, session]);
  return <TestRouteSessionContext.Provider value={value}>{children}</TestRouteSessionContext.Provider>;
}

export function useTestRouteSession() {
  return useContext(TestRouteSessionContext);
}

interface TestNavigationPanelProps {
  campus: Campus;
  onHighlightRoute: (route: TestRouteHighlight | null) => void;
  onFocusNode: (nodeId: string) => void;
  /** Focus/switch to the context containing the route origin after an explicit calculation. */
  onRouteStartFocus?: (nodeId: string, context: TestRouteContext) => void;
  /** Optional canvas integration for explicit endpoint picking. */
  onPickOnMap?: (kind: "start" | "destination") => void;
  mapPickResult?: { kind: "start" | "destination"; value: string } | null;
  onMapPickResultConsumed?: () => void;
  currentBuildingId?: string;
  currentFloorId?: string;
  inspectorVisible?: boolean;
  onCompactModeChange?: (compact: boolean) => void;
  /** Cancel any host-level transition presentation (for example an elevator ride). */
  onRouteTransitionCancel?: () => void;
  onClose?: () => void;
  currentContext?: TestRouteContext;
}

/* ── Helpers to build grouped options from campus data ── */

type OptionEntry = {
  value: string;
  label: string;
  group: string;
  subtitle?: string;
  kind?: "room" | "entrance" | "building" | "door" | "stair" | "elevator" | "ramp" | "other";
  nodeHint?: string;
  /** Presentation-only hierarchy for the route picker; never part of route state. */
  buildingLabel?: string;
  floorLabel?: string;
  kindLabel?: string;
};

/** Presentation-only labels for the small active-route HUD. Stored names and
 * the full picker remain unchanged; the compact endpoint spans use CSS
 * ellipsis while the Tooltip keeps the complete semantic label available. */
export function compactRouteLocationLabel(option: Pick<OptionEntry, "label" | "kind"> | undefined, fallback: string): string {
  let label = option?.label?.trim() || fallback;
  label = label.replace(/[.…]+$/u, "").trim();
  if (option?.kind === "room") label = label.replace(/\s+\([^)]*\)$/, "").trim();
  if (/^Engineering Laboratory(?:\s+\d+)?$/i.test(label)) label = label.replace(/Laboratory/i, "Lab");
  else if (/^Computer Laboratory(?:\s+\d+)?$/i.test(label)) label = label.replace(/Laboratory/i, "Lab");
  else if (/^Registrar Office$/i.test(label)) label = "Registrar";
  else if (option?.kind === "entrance") {
    const entranceMatch = label.match(/^(?:[A-Z0-9_-]+\s+)?((?:Main|North|South|East|West) Entrance)$/i);
    if (entranceMatch) label = entranceMatch[1];
  }
  return label || fallback;
}

function CompactRouteEndpointLabel({
  testId,
  displayLabel,
  fullLabel,
}: {
  testId: "test-route-start-summary" | "test-route-destination-summary";
  displayLabel: string;
  fullLabel: string;
}) {
  return (
    <Tooltip content={fullLabel} className="min-w-0 flex-1 basis-0">
      <span
        data-testid={testId}
        aria-label={fullLabel}
        className="block min-w-0 truncate whitespace-nowrap text-left"
      >
        {displayLabel}
      </span>
    </Tooltip>
  );
}

type CampusNavNode = NonNullable<Campus["navNodes"]>[number];
const NO_ROUTE_ERROR = "No route available between these locations.";
const NO_ACCESSIBLE_ROUTE_ERROR = "No accessible route available.";
const NO_ACCESSIBLE_ROUTE_HELP = "Check accessible entrances, paths, doors, or elevators.";
const NO_EMERGENCY_ROUTE_ERROR = "No emergency route available.";
const NO_EMERGENCY_ROUTE_HELP = "Check emergency exits, emergency-safe paths, closures, or connections.";

export type EmergencyExitReadiness = {
  ready: boolean;
  reason?: string;
  nodeId?: string;
  doorNodeId?: string;
  doorId?: string;
};

/** An Entrance's outdoor side must terminate in the campus-level graph.  The
 * canonical bridge helper intentionally returns any non-entrance edge so it
 * can support legacy authoring; Emergency readiness is stricter and rejects a
 * stray edge into an indoor floor as an outdoor connection. */
function emergencyOutdoorConnection(
  nodes: NavigationNode[],
  routeEdges: NavigationEdge[],
  buildingId: string,
  entranceId: string,
): NavigationEdge | undefined {
  const entranceNode = nodes.find((node) => node.buildingId === buildingId
    && node.entranceId === entranceId
    && !node.floorId);
  if (!entranceNode) return undefined;
  const edge = findEntranceOutdoorConnection(nodes, routeEdges, buildingId, entranceId);
  if (!edge) return undefined;
  const otherId = edge.startNodeId === entranceNode.id
    ? edge.endNodeId
    : edge.startNodeId;
  const other = nodes.find((node) => node.id === otherId);
  // A second Entrance node is still part of the building-side graph, not an
  // outdoor Walking Network target. Require a no-floor, non-Entrance node so
  // readiness cannot be satisfied by an accidental indoor/entrance edge.
  return other && !other.floorId && !other.entranceId ? edge : undefined;
}

function usableEmergencyOutdoorConnection(
  nodes: NavigationNode[],
  routeEdges: NavigationEdge[],
  buildingId: string,
  entranceId: string,
): NavigationEdge | undefined {
  const edge = emergencyOutdoorConnection(nodes, routeEdges, buildingId, entranceId);
  return edge && !edge.closed && edge.emergencySafe !== false ? edge : undefined;
}

/**
 * Validate the complete canonical egress chain for a designated Emergency
 * Exit.  This is an adapter/readiness check only: the persisted Door,
 * Entrance bridge, and graph remain the source of truth.
 */
export function emergencyExitReadiness(
  campus: Campus,
  building: Campus["buildings"][number],
  entrance: NonNullable<Campus["buildings"][number]["entrances"]>[number],
  routeEdges: NavigationEdge[] = buildTestRouteEdges(campus),
): EmergencyExitReadiness {
  if (normalizeEntranceType(entrance.type) !== "emergency_exit") return { ready: false, reason: "This Entrance is not designated as an Emergency Exit." };
  const nodes = campus.navNodes ?? [];
  const entranceNode = nodes.find((node) => node.buildingId === building.id && node.entranceId === entrance.id && !node.floorId);
  if (!entranceNode) return { ready: false, reason: "Connect this Emergency Exit to the Outdoor Walking Network." };

  const outdoorEdge = emergencyOutdoorConnection(nodes, routeEdges, building.id, entrance.id);
  if (!outdoorEdge) return { ready: false, nodeId: entranceNode.id, reason: "Connect this Emergency Exit to the Outdoor Walking Network." };
  if (outdoorEdge.closed || outdoorEdge.emergencySafe === false) {
    return { ready: false, nodeId: entranceNode.id, reason: "This Emergency Exit is closed or not emergency-safe." };
  }

  const indoorEdge = findEntranceTransitionForEntrance(nodes, routeEdges, building.id, entrance.id);
  if (!indoorEdge) return { ready: false, nodeId: entranceNode.id, reason: "Connect this Emergency Exit to an indoor Door." };
  if (indoorEdge.closed || indoorEdge.emergencySafe === false) {
    return { ready: false, nodeId: entranceNode.id, reason: "This Emergency Exit is closed or not emergency-safe." };
  }

  const doorNode = doorNodeForEdge(indoorEdge, nodes);
  if (!doorNode?.buildingId || !doorNode.floorId || !doorNode.doorId
    || doorNode.buildingId !== building.id) {
    return { ready: false, nodeId: entranceNode.id, reason: "Connect this Emergency Exit to an indoor Door." };
  }
  const floor = building.floors.find((candidate) => candidate.id === doorNode.floorId);
  const door = floor?.doors.find((candidate) => candidate.id === doorNode.doorId);
  if (!floor || !door) {
    return { ready: false, nodeId: entranceNode.id, doorNodeId: doorNode.id, reason: "Connect this Emergency Exit to an indoor Door." };
  }
  if (door.isEmergencyExit === false) {
    return { ready: false, nodeId: entranceNode.id, doorNodeId: doorNode.id, doorId: door.id, reason: "Designate the linked Door as an Emergency Exit." };
  }
  if (!doorHasIndoorNavigationConnection(nodes, routeEdges, doorNode)) {
    return { ready: false, nodeId: entranceNode.id, doorNodeId: doorNode.id, doorId: door.id, reason: "Connect the Emergency Exit Door to the Walking Network." };
  }
  const localSafeEdge = routeEdges.some((edge) => {
    if (edge.type === "entrance_transition" || edge.type === ROOM_DOOR_EDGE_TYPE || edge.closed || edge.emergencySafe === false) return false;
    if (edge.startNodeId !== doorNode.id && edge.endNodeId !== doorNode.id) return false;
    const otherId = edge.startNodeId === doorNode.id ? edge.endNodeId : edge.startNodeId;
    const other = nodes.find((node) => node.id === otherId);
    return !!other && other.buildingId === building.id && other.floorId === floor.id;
  });
  if (!localSafeEdge) {
    return { ready: false, nodeId: entranceNode.id, doorNodeId: doorNode.id, doorId: door.id, reason: "Connect the Emergency Exit Door to an emergency-safe Walking Path." };
  }
  return { ready: true, nodeId: entranceNode.id, doorNodeId: doorNode.id, doorId: door.id };
}

/**
 * Keep endpoint completeness, local endpoint readiness, and global route
 * reachability separate.  In particular, a selected Building with no usable
 * Entrance must never fall through to the generic "Select a destination"
 * copy just because its adapter cannot resolve a graph node.
 */
export function endpointReadinessMessage(
  value: string,
  campus: Campus,
  routeEdges: NavigationEdge[],
  role: "starting" | "destination",
  accessibleOnly = false,
  emergencyOnly = false,
  directionRole: EntranceDirectionRole = "any",
): string | null {
  const [type, id] = value.split(":");
  const noun = role === "starting" ? "start" : "destination";
  if (!value) return `Select a ${noun}.`;
  if (type === "building") {
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === id);
    if (!building) return `The selected Building no longer exists.`;
    const exteriorStairStatuses = canonicalExteriorEmergencyStairsForBuilding(building)
      .map((stair) => exteriorEmergencyStairRouteReadiness(building, stair, campus.navNodes ?? [], routeEdges));
    const gateReady = (status: typeof exteriorStairStatuses[number]) => campusGates(campus).length === 0
      || (!!status.outdoorNodeId
        && outdoorNetworkReachesCampusGate(status.outdoorNodeId, campus.navNodes ?? [], routeEdges));
    if (emergencyOnly && exteriorStairStatuses.some((status) => status.ready && gateReady(status))) return null;
    const entranceNodes = (building.entrances ?? [])
      .map((entrance) => ({ entrance, node: (campus.navNodes ?? []).find((node) =>
        node.buildingId === building.id && node.entranceId === entrance.id && !node.floorId,
      ) }))
      .filter((entry): entry is { entrance: NonNullable<typeof building.entrances>[number]; node: NavigationNode } =>
        !!entry.node
        && (emergencyOnly || entranceDirectionAllowed(campus, building.id, entry.entrance, directionRole))
        && (!accessibleOnly || (entry.entrance.accessible !== false && entry.node.accessible !== false)));
    if (entranceNodes.length === 0 && building.entranceNodeId) {
      const legacy = (campus.navNodes ?? []).find((node) => node.id === building.entranceNodeId);
      if (legacy && (!accessibleOnly || legacy.accessible !== false)) {
        const fallbackEntrance = (building.entrances ?? [])[0];
        entranceNodes.push({ entrance: fallbackEntrance ?? ({} as NonNullable<typeof building.entrances>[number]), node: legacy });
      }
    }
    if (entranceNodes.length === 0) {
      if (emergencyOnly) {
        const stairIssue = exteriorStairStatuses.find((status) => status.issue)?.issue;
        if (stairIssue) return stairIssue;
      }
      return accessibleOnly
        ? `${building.name || building.code} has no accessible Entrance.`
        : `${building.name || building.code} has no routable Entrance.`;
    }
    const connected = entranceNodes.some(({ node }) => routeEdges.some((edge) =>
      !edge.closed
      && (!accessibleOnly || edge.accessible)
      && (!emergencyOnly || edge.emergencySafe !== false)
      && (edge.startNodeId === node.id || edge.endNodeId === node.id),
    ));
    if (emergencyOnly) {
      const exitStatuses = (building.entrances ?? [])
        .filter((entrance) => normalizeEntranceType(entrance.type) === "emergency_exit")
        .map((entrance) => emergencyExitReadiness(campus, building, entrance, routeEdges));
      const hasReadyEmergencyExit = exitStatuses.some((status) => status.ready);
      const hasReadyExteriorStair = exteriorStairStatuses.some((status) => status.ready && gateReady(status));
      const hasSafeGeneralFallback = entranceNodes.some(({ entrance, node }) =>
        normalizeEntranceType(entrance.type) === "general"
        && !!usableEmergencyOutdoorConnection(campus.navNodes ?? [], routeEdges, building.id, entrance.id)
        && routeEdges.some((edge) => !edge.closed && edge.emergencySafe !== false
          && (edge.startNodeId === node.id || edge.endNodeId === node.id)),
      );
      if (hasReadyEmergencyExit || hasReadyExteriorStair || hasSafeGeneralFallback) return null;
      const specificReason = exitStatuses.find((status) => status.reason)?.reason
        ?? exteriorStairStatuses.find((status) => status.issue)?.issue;
      return specificReason ?? `${building.name || building.code} has no emergency-ready exit or safe General Access.`;
    }
    if (!connected) return accessibleOnly
      ? `${building.name || building.code} has no accessible Entrance connected to the Walking Network.`
      : `${building.name || building.code} is not connected to the Walking Network.`;
    return null;
  }
  if (type === "room") {
    const [, buildingId, roomId] = value.split(":");
    // A Room is an endpoint-ready semantic target when its canonical
    // Room↔Door↔Walking Network chain resolves.  Do not report readiness
    // failure merely because the endpoint is a Room; downstream reachability
    // belongs to the global route result and must become No Route instead.
    // A closed/obstacle-blocked local edge still proves that the Room has a
    // Door attached to the indoor network.  It must therefore become a global
    // No Route result, not an endpoint-readiness error.
    // Keep a semantically linked Room endpoint selectable even when the active
    // mode (Accessible/Emergency) has no permitted local edge.  That failure
    // belongs to global route reachability and must be reported as the
    // mode-specific No Route result, not as if the endpoint were missing.
    if (roomRouteInfo(campus, buildingId, roomId, routeEdges, true)) return null;
    return `${role === "starting" ? "The starting" : "The destination"} Room is not ready for routing. Link its Door and connect that Door to the Walking Network.`;
  }
  if (type === "node") {
    const node = (campus.navNodes ?? []).find((candidate) => candidate.id === id);
    if (!node) return `The selected ${noun} no longer exists.`;
    if (emergencyOnly && node.entranceId && !node.floorId) {
      const building = node.buildingId
        ? (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId)
        : undefined;
      const entrance = building?.entrances?.find((candidate) => candidate.id === node.entranceId);
      if (building && entrance && normalizeEntranceType(entrance.type) === "emergency_exit") {
        const status = emergencyExitReadiness(campus, building, entrance, routeEdges);
        if (!status.ready) return status.reason ?? "This Emergency Exit is not ready for routing.";
      }
    }
    if (emergencyOnly && node.doorId) {
      const building = node.buildingId
        ? (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId)
        : undefined;
      const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
      const door = floor?.doors.find((candidate) => candidate.id === node.doorId);
      if (door?.isEmergencyExit === true) {
        const safeLocalConnection = routeEdges.some((edge) => edge.type !== "entrance_transition"
          && edge.type !== ROOM_DOOR_EDGE_TYPE
          && !edge.closed
          && edge.emergencySafe !== false
          && (edge.startNodeId === node.id || edge.endNodeId === node.id));
        if (!safeLocalConnection) return "Connect the Emergency Exit Door to an emergency-safe Walking Path.";
      }
    }
    if (node.stairId || node.elevatorId) {
      const localConnected = routeEdges.some((edge) => edge.type !== "floor_transition" && edge.type !== "cross_floor" && !edge.closed
        && (edge.startNodeId === id || edge.endNodeId === id));
      const circulationLabel = node.elevatorId ? "Elevator" : "Stair";
      if (!localConnected) return `Connect this ${circulationLabel} to the Walking Network.`;
      // A locally linked Stair/Elevator is a valid endpoint on its current
      // Floor.  Cross-floor membership is validated by the actual route graph
      // only when the requested destination requires leaving this Floor; an
      // eager adjacent-transition check here made same-floor Stair starts fail
      // with a misleading "no matching Stair" message.  Legacy `cross_floor`
      // edges remain recognized by the route graph and do not need a second
      // readiness path.
    }
    if (!routeEdges.some((edge) => !edge.closed && (edge.startNodeId === id || edge.endNodeId === id))) {
      return `${role === "starting" ? "Starting point" : "Destination"} is disconnected — it has no walking paths. Use Connect to link it.`;
    }
  }
  return null;
}

type RoomRouteInfo = {
  building: Campus["buildings"][number];
  floor: FloorPlan;
  room: FloorRoom;
  roomNode: NavigationNode;
  door: FloorDoor;
  doorNode: NavigationNode;
};

/** Resolve effective accessibility for a physical navigation anchor.  The
 * canonical node flag remains authoritative for authored waypoints, while
 * linked objects can carry a more recent accessibility value in their floor or
 * entrance record. */
function testRouteNodeAccessible(campus: Campus, node: NavigationNode | undefined): boolean {
  if (!node || node.accessible === false || node.type === "stair" || node.stairId) return false;
  const building = node.buildingId
    ? (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId)
    : undefined;
  const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
  if (node.elevatorId) return floor?.elevators.find((item) => item.id === node.elevatorId)?.accessible !== false;
  if (node.rampId) return floor?.ramps.find((item) => item.id === node.rampId)?.accessible !== false;
  if (node.doorId) {
    const door = floor?.doors.find((item) => item.id === node.doorId) as (FloorDoor & { accessible?: boolean }) | undefined;
    return door?.accessible !== false;
  }
  if (node.entranceId) return building?.entrances?.find((item) => item.id === node.entranceId)?.accessible !== false;
  return true;
}

/** Emergency evacuation deliberately opts Elevators out unless their
 * persisted physical/transition metadata explicitly opts them in.  This is
 * kept in the Test Route adapter so Standard and Accessible route contracts
 * remain unchanged. */
function testRouteElevatorEmergencySafe(campus: Campus, node: NavigationNode | undefined): boolean {
  if (!node || (!node.elevatorId && node.type !== "elevator")) return true;
  if (node.emergencySafe === true) return true;
  const building = node.buildingId
    ? (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId)
    : undefined;
  const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
  const owner = node.elevatorId ? floor?.elevators.find((item) => item.id === node.elevatorId) : undefined;
  const metadata = owner as (NonNullable<typeof owner> & { emergencySafe?: boolean; emergencySafeForEvacuation?: boolean }) | undefined;
  return metadata?.emergencySafe === true || metadata?.emergencySafeForEvacuation === true;
}

function testRouteEdgeEmergencySafe(campus: Campus, edge: NavigationEdge): boolean {
  if (edge.emergencySafe === false) return false;
  if (edge.type !== "floor_transition") return true;
  const nodes = campus.navNodes ?? [];
  const start = nodes.find((node) => node.id === edge.startNodeId);
  const end = nodes.find((node) => node.id === edge.endNodeId);
  const elevatorTransition = [start, end].some((node) => !!node && (node.elevatorId || node.type === "elevator"));
  if (!elevatorTransition) return true;
  const transitionMetadata = edge as NavigationEdge & { emergencySafeExplicit?: boolean; emergencySafeOverride?: boolean };
  if (transitionMetadata.emergencySafeExplicit === true || transitionMetadata.emergencySafeOverride === true) return true;
  return testRouteElevatorEmergencySafe(campus, start) && testRouteElevatorEmergencySafe(campus, end);
}

/** Build the graph consumed by Test Route without exposing or requiring any
 * direct Room-to-Walking-Point geometry.  Room↔Door edges are semantic and
 * derived from the persisted accessDoorId relationship, so a freshly loaded
 * campus still routes correctly even before an editor write reconciles them. */
export function buildTestRouteEdges(campus: Campus): NavigationEdge[] {
  // Hydrated campuses may not have gone through an editor write after the
  // Veranda/access-feature records were loaded. Reconcile the small derived
  // exterior projection here so Test Route sees the same continuous graph as
  // the editor without changing the persisted Campus or the pathfinder.
  campus = reconcileExteriorApproachNavigation(campus);
  const rooms: FloorRoom[] = [];
  const doors: FloorDoor[] = [];
  const walls: FloorWall[] = [];
  const nodeContexts = new Map<string, { walls: FloorWall[]; doors: FloorDoor[]; furniture: NonNullable<FloorPlan["furniture"]> }>();
  for (const building of campus.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      rooms.push(...(floor.rooms ?? []));
      doors.push(...(floor.doors ?? []));
      walls.push(...(floor.walls ?? []));
      const context = { walls: floor.walls ?? [], doors: floor.doors ?? [], furniture: floor.furniture ?? [] };
      for (const node of campus.navNodes ?? []) {
        if (node.buildingId === building.id && node.floorId === floor.id) nodeContexts.set(node.id, context);
      }
    }
  }
  const roomNodeIds = new Set((campus.navNodes ?? [])
    .filter((node) => node.roomId || node.type === "room_access")
    .map((node) => node.id));
  // Legacy maps may still contain a generic Room→Walking Point edge from the
  // old direct-authoring workflow.  Keep that persisted data intact, but do
  // not let Test Route bypass the linked physical Door.  Only the canonical
  // semantic Room↔Door edge is allowed to touch a Room node in this adapter.
  const routeEdges = (campus.navEdges ?? []).filter((edge) => {
    if (edge.type === ROOM_DOOR_EDGE_TYPE) return true;
    if (roomNodeIds.has(edge.startNodeId) || roomNodeIds.has(edge.endNodeId)) return false;
    // An ordinary Floor Walking Point is never an indoor/outdoor portal. Keep
    // canonical entrance transitions, derived physical approaches, and the
    // dedicated emergency-stair boundary intact, but ignore stale/manual
    // cross-context shortcuts from a Veranda waypoint directly to Outdoor.
    const nodes = campus.navNodes ?? [];
    const start = nodes.find((node) => node.id === edge.startNodeId);
    const end = nodes.find((node) => node.id === edge.endNodeId);
    // A hosted Veranda Walking Point is a floor-local graph vertex, never an
    // outdoor portal.  Reject both stale derived zone-owned boundary edges and
    // legacy unowned shortcuts here so a malformed snapshot cannot make the
    // middle junction the transition owner.
    const genericVerandaNode = [start, end].find((node) => Boolean(node?.floorId && node.exteriorZoneId && !node.derivedOwnerType));
    const otherNode = genericVerandaNode === start ? end : genericVerandaNode === end ? start : undefined;
    if (genericVerandaNode && otherNode && !otherNode.floorId && !otherNode.entranceId && !otherNode.exteriorEmergencyStairId) return false;
    const crossesFloorBoundary = Boolean(start?.floorId) !== Boolean(end?.floorId);
    if (!crossesFloorBoundary) return true;
    if (edge.derivedOwnerType || edge.type === "entrance_transition" || edge.type === "floor_transition" || edge.type === "cross_floor") return true;
    // Canonical direct Entrance handoffs are valid boundary edges even in
    // legacy snapshots where the campus-side endpoint was authored with a
    // Floor id. The portal guard below is for ordinary Walking Points, which
    // have no Entrance identity at all.
    if (start?.entranceId || end?.entranceId) return true;
    // A physical Building Entrance may be authored directly to a Walking
    // Point hosted by its linked Veranda. That is the valid boundary leg;
    // only a generic Veranda-point -> Outdoor shortcut is a portal mistake.
    if (start?.entranceId && !start.floorId && end?.exteriorZoneId
      && end.buildingId === start.buildingId) return true;
    if (end?.entranceId && !end.floorId && start?.exteriorZoneId
      && start.buildingId === end.buildingId) return true;
    return Boolean(start?.exteriorEmergencyStairId || end?.exteriorEmergencyStairId);
  });
  // Cross-floor transition edges are derived from the current Stair/Elevator
  // owners. Reconcile them while building the route graph as well as on
  // editor writes, so a freshly hydrated/legacy campus cannot lose its Stair
  // transitions simply because no editor mutation has happened yet.
  let reconciledEdges = reconcileRoomDoorEdges(campus.navNodes ?? [], routeEdges, rooms, doors, walls);
  for (const building of campus.buildings ?? []) {
    reconciledEdges = reconcileCrossFloorTransitions(
      campus.navNodes ?? [],
      reconciledEdges,
      building.floors ?? [],
      building.id,
    );
  }
  // Exterior reconciliation deliberately keeps a direct Entrance shortcut as
  // a very expensive compatibility fallback while a complete authored
  // Veranda/Ramp/Steps approach exists.  Normalization recomputes ordinary
  // polyline distances, which would accidentally turn that fallback back
  // into the cheapest edge and make Test Route skip the physical approach.
  // Preserve the canonical adapter cost while still normalizing every other
  // edge's current geometry.
  const exteriorFallbackDistances = new Map(
    reconciledEdges
      .filter((edge) => edge.exteriorApproachFallbackEntranceId)
      .map((edge) => [edge.id, edge.distance]),
  );
  const normalized = normalizeNavigationEdges(reconciledEdges, campus.navNodes ?? []).map((edge) => {
    const fallbackDistance = exteriorFallbackDistances.get(edge.id);
    return fallbackDistance === undefined ? edge : { ...edge, distance: fallbackDistance };
  });
  // Test Route must consume the same current obstacle validation as the Floor
  // Editor.  Otherwise a stale/blocked authored edge can still be traversed by
  // the preview even though the editor marks it invalid.  Semantic Room↔Door
  // and cross-context transitions are exempt; their physical passage is
  // validated by the linked Door/walking edge instead.
  const invalidEdgeIds = new Set<string>();
  const canonicalObstacleEdgeIds = new Set(
    validateNavigationGraph(campus).issues
      .filter((issue) => issue.type === "nav_edge_blocked_by_obstacle" && issue.edgeId)
      .map((issue) => issue.edgeId as string),
  );
  const validEdges = normalized.filter((edge) => {
    if (edge.type === ROOM_DOOR_EDGE_TYPE || edge.type === "entrance_transition" || edge.type === "floor_transition" || edge.type === "cross_floor") return true;
    const startContext = nodeContexts.get(edge.startNodeId);
    const endContext = nodeContexts.get(edge.endNodeId);
    if (!startContext || startContext !== endContext) return true;
    // A generated Exterior Emergency Stair landing is intentionally anchored
    // on the perimeter. Its authored connector is the legal passage through
    // that boundary, so do not let the generic indoor wall check discard it
    // before the outdoor-specific validation below gets a chance to inspect it.
    const startNode = (campus.navNodes ?? []).find((node) => node.id === edge.startNodeId);
    const endNode = (campus.navNodes ?? []).find((node) => node.id === edge.endNodeId);
    if (startNode?.exteriorEmergencyStairId || endNode?.exteriorEmergencyStairId) return true;
    if (canonicalObstacleEdgeIds.has(edge.id)) {
      invalidEdgeIds.add(edge.id);
      return false;
    }
    const blocked = navEdgeIsBlockedExtended(edge, campus.navNodes ?? [], startContext.walls, startContext.doors, startContext.furniture);
    if (blocked) invalidEdgeIds.add(edge.id);
    return !blocked;
  }).filter((edge) => {
    // Outdoor route edges use the same canonical building/decor obstacle
    // validation as the editor. Entrance-transition edges are exempted above
    // because the canonical connector is the legitimate boundary crossing
    // into the building at its actual access point.
    const start = (campus.navNodes ?? []).find((node) => node.id === edge.startNodeId);
    const end = (campus.navNodes ?? []).find((node) => node.id === edge.endNodeId);
    if (edge.type === ROOM_DOOR_EDGE_TYPE || edge.type === "entrance_transition" || edge.type === "floor_transition" || edge.type === "cross_floor"
      || (!!start?.entranceId && !start.floorId) || (!!end?.entranceId && !end.floorId)) return true;
    // A generated Exterior Emergency Stair landing is deliberately placed on
    // the building perimeter. Its authored indoor connector is the legal
    // passage through that boundary, so the generic wall-crossing validator
    // must not discard it from the Test Route graph.
    if (start?.exteriorEmergencyStairId || end?.exteriorEmergencyStairId) return true;
    if (canonicalObstacleEdgeIds.has(edge.id)) {
      invalidEdgeIds.add(edge.id);
      return false;
    }
    if (!start || !end || start.floorId || end.floorId) return true;
    const points = [
      { x: start.x, y: start.y },
      ...(edge.bendPoints ?? []),
      { x: end.x, y: end.y },
    ];
    const blocked = polylineCrossesBuilding(points, campus.buildings ?? []);
    if (blocked) invalidEdgeIds.add(edge.id);
    return !blocked;
  }).map((edge) => {
    if (!edge.exteriorApproachFallbackEntranceId) return edge;
    const entranceId = edge.exteriorApproachFallbackEntranceId;
    const ready = (campus.buildings ?? []).some((building) =>
      (building.entrances ?? []).some((entrance) => {
        if (entrance.id !== entranceId) return false;
        return building.floors.some((floor) => (floor.exteriorZones ?? []).some((zone) =>
          exteriorApproachEntranceReadiness(campus, building.id, floor.id, zone.id, entranceId, invalidEdgeIds).standardReady,
        ));
      }),
    );
    if (ready) return edge;
    const restored = { ...edge, distance: edge.exteriorApproachFallbackOriginalDistance ?? edge.distance };
    if (edge.exteriorApproachFallbackOriginalClosed === undefined) delete restored.closed;
    else restored.closed = edge.exteriorApproachFallbackOriginalClosed;
    return restored;
  });
  // Linked-object accessibility can be stale in older persisted campuses.
  // Keep the authored node/edge records intact, but expose an effective route
  // edge flag so Accessible mode cannot enter an inaccessible physical anchor.
  const nodeById = new Map((campus.navNodes ?? []).map((node) => [node.id, node]));
  return validEdges.map((edge) => {
    const start = nodeById.get(edge.startNodeId);
    const end = nodeById.get(edge.endNodeId);
    const accessible = testRouteNodeAccessible(campus, start) && testRouteNodeAccessible(campus, end);
    const emergencySafe = testRouteEdgeEmergencySafe(campus, edge);
    return accessible && emergencySafe === (edge.emergencySafe !== false)
      ? edge
      : { ...edge, ...(accessible ? {} : { accessible: false }), ...(emergencySafe ? {} : { emergencySafe: false }) };
  });
}

/**
 * Routine (Standard/Accessible) route searches must not use infrastructure
 * that is reserved for evacuation.  Keeping this at the Test Route adapter
 * boundary is intentional: the persisted graph and the global pathfinder
 * still retain the emergency stair/exit nodes for Emergency mode, while a
 * normal route cannot opportunistically take a nearby fire exit simply
 * because it is geometrically shorter.
 */
function isEmergencyOnlyNavigationNode(campus: Campus, node: NavigationNode | undefined): boolean {
  if (!node) return false;
  if (node.exteriorEmergencyStairId || node.emergencyStair || node.type === "emergency_exit") return true;
  // Older hydrated Exterior Emergency Stair occurrences may retain only the
  // Floor Stair reference. Resolve that owner here so routine searches cannot
  // re-introduce the emergency-only transition through a legacy node shape.
  if (node.stairId && node.buildingId && node.floorId) {
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
    const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
    const stair = floor?.stairs?.find((candidate) => candidate.id === node.stairId);
    if (stair?.exteriorEmergencyStairId) return true;
  }
  if (node.doorId && node.buildingId && node.floorId) {
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
    const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
    const door = floor?.doors.find((candidate) => candidate.id === node.doorId);
    if ((door as (FloorDoor & { isEmergencyExit?: boolean }) | undefined)?.isEmergencyExit === true) return true;
  }
  if (node.entranceId && node.buildingId && !node.floorId) {
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
    const entrance = building?.entrances?.find((candidate) => candidate.id === node.entranceId);
    if (entrance && normalizeEntranceType(entrance.type) === "emergency_exit") return true;
  }
  return false;
}

/** Return the graph view used by routine route modes.  Filtering nodes as well
 * as edges prevents pathfinding's virtual shared-stair transition expansion
 * from reintroducing an emergency-only stair after the authored edges have
 * been filtered.
 */
export function routineRouteGraph(
  campus: Campus,
  nodes: NavigationNode[] = campus.navNodes ?? [],
  routeEdges: NavigationEdge[] = buildTestRouteEdges(campus),
  routeMode: RouteMode = "standard",
): { nodes: NavigationNode[]; edges: NavigationEdge[] } {
  const graphCampus = reconcileExteriorApproachNavigation(campus);
  const graphNodes = graphCampus.navNodes ?? nodes;
  const routineNodes = graphNodes.filter((node) => !isEmergencyOnlyNavigationNode(graphCampus, node));
  const routineNodeIds = new Set(routineNodes.map((node) => node.id));
  return {
    nodes: routineNodes,
    edges: filterCompleteExteriorFallbackEdges(
      graphCampus,
      filterRoutineEntranceDirectionEdges(graphCampus, routeEdges.filter((edge) => routineNodeIds.has(edge.startNodeId) && routineNodeIds.has(edge.endNodeId))),
      routeMode,
    ),
  };
}

/**
 * Keep direction semantics at the route adapter boundary. Persisted Entrance
 * transitions remain a physical relationship, while routine routing receives
 * a directed view of that relationship: inbound uses Entrance→Door and
 * outbound uses Door→Entrance. A single normal General Access doorway, or a
 * building with no outbound-capable General Access doorway, keeps the safe
 * compatibility fallback for older/incomplete authoring.
 */
export function filterRoutineEntranceDirectionEdges(
  campus: Campus,
  routeEdges: NavigationEdge[],
): NavigationEdge[] {
  const nodes = campus.navNodes ?? [];
  return routeEdges.flatMap((edge) => {
    const start = nodes.find((node) => node.id === edge.startNodeId);
    const end = nodes.find((node) => node.id === edge.endNodeId);
    const entranceNode = [start, end].find((node) => !!node && !!node.entranceId && !node.floorId);
    if (!entranceNode) return [edge];
    const otherNode = entranceNode === start ? end : start;
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === entranceNode.buildingId);
    const entrance = building?.entrances?.find((candidate) => candidate.id === entranceNode.entranceId);
    if (!building || !entrance || normalizeEntranceType(entrance.type) !== "general") return [edge];
    // Direct Entrance↔Outdoor handoffs are physical fallback connections, not
    // semantic role bridges. Give them the same directed routine view as the
    // Entrance↔Door edge so an Entrance Only door cannot leave through a
    // direct shortcut unless the no-routine-exit compatibility rule applies.
    if (edge.type !== "entrance_transition") {
      if (!otherNode) return [edge];
      const direction = normalizeEntranceDirection(entrance);
      const singleGeneralFallback = normalGeneralEntranceCount(campus, building.id) === 1;
      const allowInbound = singleGeneralFallback || direction !== "exit_only";
      const allowOutbound = singleGeneralFallback || direction !== "entrance_only"
        || !hasNormalOutboundGeneralEntrance(campus, building.id);
      if (allowInbound && allowOutbound) return [{ ...edge, bidirectional: true }];
      if (allowInbound) return [{ ...edge, startNodeId: otherNode.id, endNodeId: entranceNode.id, bidirectional: false }];
      if (allowOutbound) return [{ ...edge, startNodeId: entranceNode.id, endNodeId: otherNode.id, bidirectional: false }];
      return [];
    }
    const doorNode = [start, end].find((node) => !!node && !!node.floorId && !!node.doorId);
    if (!entranceNode || !doorNode || !entranceNode.buildingId || !entranceNode.entranceId) return [edge];
    const direction = normalizeEntranceDirection(entrance);
    const singleGeneralFallback = normalGeneralEntranceCount(campus, building.id) === 1;
    const allowInbound = singleGeneralFallback || direction !== "exit_only";
    const allowOutbound = singleGeneralFallback || direction !== "entrance_only"
      || !hasNormalOutboundGeneralEntrance(campus, building.id);
    if (allowInbound && allowOutbound) return [{ ...edge, startNodeId: entranceNode.id, endNodeId: doorNode.id, bidirectional: true }];
    if (allowInbound) return [{ ...edge, startNodeId: entranceNode.id, endNodeId: doorNode.id, bidirectional: false }];
    if (allowOutbound) return [{ ...edge, startNodeId: doorNode.id, endNodeId: entranceNode.id, bidirectional: false }];
    return [];
  });
}

/**
 * A direct Entrance-to-Outdoor edge is a compatibility fallback only while
 * the same Entrance has no complete physical Veranda approach. Older/pathway
 * generated edges do not carry the reconciliation fallback metadata, so this
 * routine adapter also resolves the semantic pair from its endpoint IDs.
 * Keep the edge in the canonical graph and Emergency graph; suppress it only
 * for the routine mode whose complete approach makes it inapplicable.
 */
export function filterCompleteExteriorFallbackEdges(
  campus: Campus,
  routeEdges: NavigationEdge[],
  routeMode: RouteMode = "standard",
): NavigationEdge[] {
  if (routeMode === "emergency") return routeEdges;
  const nodes = campus.navNodes ?? [];
  const completeByEntrance = new Map<string, boolean>();
  for (const building of campus.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      for (const zone of floor.exteriorZones ?? []) {
        const entranceIds = new Set([
          ...(zone.linkedEntranceIds ?? []),
          ...(zone.linkedEntranceId ? [zone.linkedEntranceId] : []),
          ...(floor.entranceSteps ?? []).filter((feature) => feature.parentZoneId === zone.id && feature.linkedEntranceId).map((feature) => feature.linkedEntranceId as string),
          ...(floor.entranceRamps ?? []).filter((feature) => feature.parentZoneId === zone.id && feature.linkedEntranceId).map((feature) => feature.linkedEntranceId as string),
        ]);
        for (const entranceId of entranceIds) {
          const readiness = exteriorApproachEntranceReadiness(campus, building.id, floor.id, zone.id, entranceId);
          const noRoutineOutbound = !hasNormalOutboundGeneralEntrance(campus, building.id);
          // Directional readiness remains honest (an Entrance Only branch is
          // inbound-ready), while the route adapter may use that same complete
          // physical branch for outbound compatibility when this building has
          // no routine Exit/Both entrance. The persisted direction is never
          // changed by this exception.
          const compatibilityComplete = noRoutineOutbound
            && normalizeEntranceType((building.entrances ?? []).find((entrance) => entrance.id === entranceId)?.type) === "general"
            && (routeMode === "accessible" ? readiness.accessibleInboundReady : readiness.inboundReady);
          const complete = (routeMode === "accessible" ? readiness.accessibleReady : readiness.standardReady)
            || compatibilityComplete;
          completeByEntrance.set(entranceId, (completeByEntrance.get(entranceId) ?? false) || complete);
        }
      }
    }
  }
  if (completeByEntrance.size === 0) return routeEdges;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return routeEdges.filter((edge) => {
    if (edge.type === "entrance_transition" || edge.derivedOwnerType) return true;
    const start = nodeById.get(edge.startNodeId);
    const end = nodeById.get(edge.endNodeId);
    const entranceNode = [start, end].find((node) => !!node?.entranceId && !node.floorId);
    if (!entranceNode?.entranceId || !completeByEntrance.get(entranceNode.entranceId)) return true;
    const other = start === entranceNode ? end : start;
    const isCanonicalOutdoorTarget = !!other
      // A few legacy snapshots persisted the campus-side outdoor node with a
      // floorId. Its semantic type is still authoritative for this adapter.
      && (other.type === "outdoor" || !other.floorId)
      && !other.entranceId
      && !other.derivedOwnerType
      && !other.exteriorEmergencyStairId;
    return !isCanonicalOutdoorTarget;
  });
}

export function roomRouteInfo(
  campus: Campus,
  buildingId: string,
  roomId: string,
  routeEdges: NavigationEdge[] = buildTestRouteEdges(campus),
  includeClosedLocalEdges = false,
  accessibleOnly = false,
  emergencyOnly = false,
): RoomRouteInfo | null {
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingId);
  if (!building) return null;
  for (const floor of building.floors ?? []) {
    const room = (floor.rooms ?? []).find((candidate) => candidate.id === roomId);
    if (!room) continue;
    const nodes = campus.navNodes ?? [];
    const roomNode = nodes.find((node) =>
      node.roomId === room.id && node.buildingId === building.id && node.floorId === floor.id,
    ) ?? (room.accessNodeId
      ? nodes.find((node) =>
          node.id === room.accessNodeId && node.roomId === room.id
          && node.buildingId === building.id && node.floorId === floor.id,
        )
      : undefined);
    if (!roomNode) return null;
    if (accessibleOnly && roomNode.accessible === false) return null;
    // Room readiness is local to each linked Door.  Keep this check on the
    // canonical authored graph rather than the obstacle-filtered route graph:
    // a downstream wall/closure can make a route impossible without making the
    // Room itself unready.
    const canonicalEdges = campus.navEdges ?? [];
    const candidates = roomAccessDoorIds(room)
      .map((doorId) => (floor.doors ?? []).find((candidate) => candidate.id === doorId))
      .filter((door): door is NonNullable<typeof door> => !!door)
      .filter((door) => isDoorEligibleForRoom(room, door, floor.walls, nodes, { rooms: floor.rooms ?? [] }))
      .filter((door) => !accessibleOnly || (door as FloorDoor & { accessible?: boolean }).accessible !== false)
      .map((door) => ({ door, doorNode: nodes.find((node) => node.doorId === door.id && node.buildingId === building.id && node.floorId === floor.id) }))
      .filter((entry): entry is { door: FloorDoor; doorNode: NavigationNode } => !!entry.doorNode)
      .filter(({ doorNode }) => !accessibleOnly || doorNode.accessible !== false)
      .filter(({ doorNode }) => doorHasIndoorNavigationConnection(nodes, canonicalEdges, doorNode, includeClosedLocalEdges))
      // Local readiness is evaluated from the authored canonical graph. The
      // obstacle-filtered route graph is intentionally not consulted here:
      // downstream walls/closures determine No Route, not Room readiness.
      .filter(({ doorNode }) => canonicalEdges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE
        && (includeClosedLocalEdges || !edge.closed)
        && (edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id)))
      .filter(({ doorNode }) => !accessibleOnly || canonicalEdges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE
        && !edge.closed
        && edge.accessible
        && (edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id)))
      .filter(({ doorNode }) => !emergencyOnly || canonicalEdges.some((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE
        && !edge.closed
        && edge.emergencySafe !== false
        && (edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id)))
      // The adapter may synthesize the semantic Room↔Door edge for legacy
      // campuses, so use the resolved route edge list for that relationship
      // only; local Door connectivity above remains canonical-authored data.
      .filter(({ doorNode }) => routeEdges.some((edge) => edge.type === ROOM_DOOR_EDGE_TYPE
        && ((edge.startNodeId === roomNode.id && edge.endNodeId === doorNode.id)
          || (edge.startNodeId === doorNode.id && edge.endNodeId === roomNode.id))));
    const chosen = candidates[0];
    return chosen ? { building, floor, room, roomNode, door: chosen.door, doorNode: chosen.doorNode } : null;
  }
  return null;
}

function roomOptionLabel(room: FloorRoom, floor: FloorPlan, index: number): string {
  return `${roomDisplayName(room, index)} (${floor.label})`;
}

function floorContext(building: Campus["buildings"][number], floor?: FloorPlan): string {
  return floor ? `${building.code} · ${floor.label}` : building.code;
}

/** Resolve the routable Entrance candidates for a semantic Building endpoint.
 * Keep all direction-eligible candidates here; the route adapter can then let
 * the existing path cost choose among multiple doors instead of treating the
 * primary/index ordering as a routing decision. */
function resolveBuildingEntranceNodeIds(
  campus: Campus,
  building: Campus["buildings"][number],
  routeEdges = buildTestRouteEdges(campus),
  accessibleOnly = false,
  emergencyOnly = false,
  directionRole: EntranceDirectionRole = "any",
): string[] {
  const nodes = campus.navNodes ?? [];
  const candidates = (building.entrances ?? []).map((entrance, index) => {
    const node = nodes.find((candidate) => candidate.buildingId === building.id
      && candidate.entranceId === entrance.id
      && !candidate.floorId);
    if (!node) return null;
    const connected = routeEdges.some((edge) => !edge.closed
      && (!accessibleOnly || edge.accessible)
      && (!emergencyOnly || edge.emergencySafe !== false)
      && (edge.startNodeId === node.id || edge.endNodeId === node.id));
    const type = normalizeEntranceType(entrance.type);
    if (!emergencyOnly && type !== "general") return null;
    if (!emergencyOnly && !entranceDirectionAllowed(campus, building.id, entrance, directionRole)) return null;
    const priority = type === "general" ? (entrance.isPrimary ? 0 : 1) : type === "service" ? 2 : 3;
    if (accessibleOnly && (entrance.accessible === false || node.accessible === false)) return null;
    const emergencyStatus = emergencyOnly && type === "emergency_exit"
      ? emergencyExitReadiness(campus, building, entrance, routeEdges)
      : undefined;
    return { entrance, node, connected, priority, index, type, emergencyStatus };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate);
  let pool = candidates.filter((candidate) => candidate.connected);
  if (emergencyOnly) {
    const emergencyExits = pool.filter((candidate) => candidate.type === "emergency_exit" && candidate.emergencyStatus?.ready);
    const generalFallbacks = pool.filter((candidate) => candidate.type === "general"
      && !!usableEmergencyOutdoorConnection(nodes, routeEdges, building.id, candidate.entrance.id));
    // Emergency Exits are the preferred egress when a complete, safe chain
    // exists. General Access remains a valid fallback when no such exit is
    // available; Service Access is never silently promoted.
    pool = emergencyExits.length > 0 ? emergencyExits : generalFallbacks;
  }
  if (pool.length === 0 && !emergencyOnly) pool = candidates;
  pool.sort((left, right) => left.priority - right.priority || left.index - right.index);
  if (pool.length > 0) return pool.map((candidate) => candidate.node.id);
  const legacy = building.entranceNodeId ? nodes.find((node) => node.id === building.entranceNodeId) : undefined;
  if (legacy && !(building.entrances ?? []).length
    && (!accessibleOnly || legacy.accessible !== false)
    && (!accessibleOnly || routeEdges.some((edge) => !edge.closed && edge.accessible
      && (edge.startNodeId === legacy.id || edge.endNodeId === legacy.id)))
    && (!emergencyOnly || routeEdges.some((edge) => !edge.closed && edge.emergencySafe !== false
      && (edge.startNodeId === legacy.id || edge.endNodeId === legacy.id)))) return [legacy.id];
  return [];
}

/** Resolve a semantic Building endpoint through one of its actual outdoor
 * Entrance nodes. The picker exposes the Building; callers that need a route
 * endpoint may evaluate the returned candidates by the existing path cost. */
export function resolveBuildingEntranceNodeId(
  campus: Campus,
  building: Campus["buildings"][number],
  routeEdges = buildTestRouteEdges(campus),
  accessibleOnly = false,
  emergencyOnly = false,
  directionRole: EntranceDirectionRole = "any",
): string | null {
  return resolveBuildingEntranceNodeIds(campus, building, routeEdges, accessibleOnly, emergencyOnly, directionRole)[0] ?? null;
}

function resolveBuildingRouteTerminalNodeId(
  campus: Campus,
  building: Campus["buildings"][number],
  nodeIds: string[],
  routeEdges: NavigationEdge[],
  accessibleOnly: boolean,
  directionRole: EntranceDirectionRole,
): string | null {
  const candidates = resolveBuildingEntranceNodeIds(campus, building, routeEdges, accessibleOnly, false, directionRole);
  const routedTerminal = nodeIds.at(-1);
  return routedTerminal && candidates.includes(routedTerminal) ? routedTerminal : candidates[0] ?? null;
}

/** Resolve the indoor side of a Building Entrance for callers whose semantic
 * destination is actually a Room/indoor POI.  Building-only route requests do
 * not use this helper: they terminate at resolveBuildingEntranceNodeId's
 * exterior node and must never append this Door transition. */
export function resolveBuildingIndoorEntranceNodeId(
  campus: Campus,
  building: Campus["buildings"][number],
  routeEdges = buildTestRouteEdges(campus),
  accessibleOnly = false,
): string | null {
  const nodes = campus.navNodes ?? [];
  const candidates = (building.entrances ?? []).map((entrance, index) => {
    const entranceNode = nodes.find((node) => node.buildingId === building.id
      && node.entranceId === entrance.id
      && !node.floorId);
    if (!entranceNode || (accessibleOnly && (entrance.accessible === false || entranceNode.accessible === false))) return null;
    // A Room destination is reached from outside through the Entrance→Door
    // boundary, so an Exit Only Entrance cannot be selected for this inbound
    // leg. The transition edge itself remains canonical and directed.
    if (!entranceDirectionAllowed(campus, building.id, entrance, "inbound")) return null;
    const outdoorEdge = findEntranceOutdoorConnection(nodes, routeEdges, building.id, entrance.id);
    if (!outdoorEdge || outdoorEdge.closed || (accessibleOnly && outdoorEdge.accessible === false)) return null;
    const transition = findEntranceTransitionForEntrance(nodes, routeEdges, building.id, entrance.id);
    if (!transition || transition.closed || (accessibleOnly && transition.accessible === false)) return null;
    const doorNode = doorNodeForEdge(transition, nodes);
    if (!doorNode?.floorId || !doorNode.doorId || doorNode.buildingId !== building.id) return null;
    const priority = normalizeEntranceType(entrance.type) === "general"
      ? (entrance.isPrimary ? 0 : 1)
      : normalizeEntranceType(entrance.type) === "service" ? 2 : 3;
    return { doorNode, priority, index };
  }).filter((candidate): candidate is { doorNode: NavigationNode; priority: number; index: number } => !!candidate);
  candidates.sort((left, right) => left.priority - right.priority || left.index - right.index);
  return candidates[0]?.doorNode.id ?? null;
}

export type EmergencyDestinationCandidate = {
  value: string;
  nodeId: string;
  /** The entrance node the evacuation must actually traverse before reaching
   * its outdoor-side target. This prevents a shared outdoor junction from
   * making an unreachable Emergency Exit appear usable via another entrance. */
  entranceNodeId: string;
  label: string;
  /** Lower values are higher-priority emergency tiers. */
  priority: 0 | 1 | 2;
  kind: "emergency_exit" | "exterior_stair" | "general";
  /** Nodes that must occur in the calculated path for this egress. */
  requiredNodeIds?: string[];
  /** Generated stair occurrences used to verify the route leaves the start
   * Floor through this physical stair rather than reaching its outdoor node by
   * an unrelated graph branch. */
  stairNodeIds?: string[];
  stairBuildingId?: string;
  stairId?: string;
  /** Exterior stair candidates finish at a Campus Gate after crossing the
   * outdoor network; keep this separate from the stair discharge node. */
  outdoorDischargeNodeId?: string;
  campusGatePurpose?: "general" | "emergency_exit";
};

/** Return the outdoor-side node for a complete Entrance bridge. */
function emergencyOutdoorTarget(
  campus: Campus,
  routeEdges: NavigationEdge[],
  buildingId: string,
  entranceId: string,
): NavigationNode | undefined {
  const nodes = campus.navNodes ?? [];
  const entranceNode = nodes.find((node) => node.buildingId === buildingId
    && node.entranceId === entranceId
    && !node.floorId);
  const edge = usableEmergencyOutdoorConnection(nodes, routeEdges, buildingId, entranceId);
  if (!entranceNode || !edge) return undefined;
  const otherId = edge.startNodeId === entranceNode.id ? edge.endNodeId : edge.startNodeId;
  const other = nodes.find((node) => node.id === otherId);
  return other && !other.floorId && !other.entranceId ? other : undefined;
}

/** Build Emergency's automatic exit pools. Designated Emergency Exits are
 * tried before Emergency Exit entrances; safe General Entrances are retained
 * as the final fallback when every dedicated egress is unreachable from the
 * selected start. Service Entrances are intentionally excluded. */
export function emergencyDestinationCandidatePools(
  campus: Campus,
  routeEdges: NavigationEdge[],
): { emergency: EmergencyDestinationCandidate[]; general: EmergencyDestinationCandidate[] } {
  const emergency: EmergencyDestinationCandidate[] = [];
  const general: EmergencyDestinationCandidate[] = [];
  const nodes = campus.navNodes ?? [];
  const campusGateNodes = campusGateNodeIds(campus)
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is NavigationNode => !!node);
  const gatesByNodeId = new Map(campusGateNodes.map((node) => [node.id, campusGates(campus).find((gate) => gate.id === node.gateId)]));
  const expandToCampusGates = (pool: EmergencyDestinationCandidate[]) => campusGateNodes.length === 0
    ? (campusGates(campus).length === 0 ? pool : [])
    : pool.flatMap((candidate) => {
      const discharge = nodes.find((node) => node.id === candidate.nodeId);
      if (!discharge) return [];
      return campusGateNodes.map((target) => {
        const gate = gatesByNodeId.get(target.id);
        return {
          ...candidate,
          value: `node:${target.id}`,
          nodeId: target.id,
          outdoorDischargeNodeId: discharge.id,
          campusGatePurpose: gate?.purpose,
          label: `${candidate.label} -> ${gate?.name?.trim() || "Campus Gate"}`,
        };
      });
    });
  for (const building of campus.buildings ?? []) {
    const buildingLabel = building.name?.trim() || building.code?.trim() || "Building";
    for (const entrance of building.entrances ?? []) {
      const type = normalizeEntranceType(entrance.type);
      const target = emergencyOutdoorTarget(campus, routeEdges, building.id, entrance.id);
      if (!target) continue;
      if (type === "emergency_exit") {
        const readiness = emergencyExitReadiness(campus, building, entrance, routeEdges);
        if (!readiness.ready) continue;
        emergency.push({
          value: `node:${target.id}`,
          nodeId: target.id,
          entranceNodeId: (campus.navNodes ?? []).find((node) => node.buildingId === building.id
            && node.entranceId === entrance.id && !node.floorId)?.id ?? "",
          label: `${buildingLabel} · ${entrance.name?.trim() || "Emergency Exit"}`,
          // A complete Exterior Emergency Stair is the dedicated evacuation
          // chain and outranks an Emergency Exit entrance.  The latter remains
          // a valid designated fallback before a General entrance.
          priority: 1,
          kind: "emergency_exit",
        });
      } else if (type === "general") {
        general.push({
          value: `node:${target.id}`,
          nodeId: target.id,
          entranceNodeId: (campus.navNodes ?? []).find((node) => node.buildingId === building.id
            && node.entranceId === entrance.id && !node.floorId)?.id ?? "",
          label: `${buildingLabel} · ${entrance.name?.trim() || "General Entrance"}`,
          priority: 2,
          kind: "general",
        });
      }
    }
    // A complete Building-owned Exterior Emergency Stair is itself a
    // designated Emergency egress. It competes with Emergency Exit entrances
    // before any General Entrance fallback is considered.
    for (const stair of canonicalExteriorEmergencyStairsForBuilding(building)) {
      const readiness = exteriorEmergencyStairRouteReadiness(building, stair, nodes, routeEdges);
      if (!readiness.ready || !readiness.outdoorNodeId) continue;
      emergency.push({
        value: `node:${readiness.outdoorNodeId}`,
        nodeId: readiness.outdoorNodeId,
        entranceNodeId: "",
        label: `${buildingLabel} · Exterior Emergency Stair`,
        priority: 0,
        kind: "exterior_stair",
        requiredNodeIds: readiness.groundNodeId ? [readiness.groundNodeId] : undefined,
        stairNodeIds: Object.values(readiness.occurrenceNodeIds ?? {}),
        stairBuildingId: building.id,
        stairId: stair.id,
      });
    }
  }
  return { emergency: expandToCampusGates(emergency), general: expandToCampusGates(general) };
}

/** An ordinary Elevator may be the person's starting location, but it is not
 * itself an emergency-safe transition. Treat only that endpoint as a neutral
 * local anchor so its local Walking Network can lead to a Stair/exit while
 * preserving all emergency edge filtering. */
function emergencySearchNodes(nodes: NavigationNode[], startNodeId: string): NavigationNode[] {
  const start = nodes.find((node) => node.id === startNodeId);
  if (!start || start.emergencySafe === true || (!start.elevatorId && start.type !== "elevator")) return nodes;
  return nodes.map((node) => node.id === startNodeId
    ? { ...node, type: "hallway", elevatorId: undefined, transitionSharedId: undefined }
    : node);
}

/**
 * Route a start to a designated Exterior Emergency Stair through the stair's
 * own evacuation chain: walk to the generated landing on the CURRENT Floor,
 * descend through the canonical landing chain to the Ground landing, then
 * cross the Ground discharge into the outdoor node.  Plain A* to the outdoor
 * discharge node is deliberately NOT used: readiness requires that discharge
 * node to sit on the Outdoor Walking Network, so the cheapest route can walk
 * OUT of a General Entrance and approach the discharge from outside — which
 * would silently disqualify a complete designated stair even though the
 * indoor evacuation exists.  Each leg is therefore searched independently and
 * must stay indoors (no outdoor discharge node on either leg), and the Ground
 * leg always starts on the CURRENT Floor landing, which enforces the
 * floor-by-floor descent without any route-level teleport.
 */
function exteriorEmergencyStairRoute(
  campus: Campus,
  routeEdges: NavigationEdge[],
  searchNodes: NavigationNode[],
  startNodeId: string,
  candidate: EmergencyDestinationCandidate,
): GraphPath | null {
  const nodes = campus.navNodes ?? [];
  const startNode = nodes.find((node) => node.id === startNodeId);
  if (!startNode || !startNode.floorId) return null;
  const groundNodeId = candidate.requiredNodeIds?.[0];
  const ownerStairNodeIds = candidate.stairNodeIds?.length
    ? candidate.stairNodeIds
    : nodes
      .filter((node) => node.exteriorEmergencyStairId === candidate.stairId
        && node.buildingId === candidate.stairBuildingId
        && !!node.floorId)
      .map((node) => node.id);
  const startFloorLandingId = ownerStairNodeIds
    .find((stairNodeId) => nodes.find((node) => node.id === stairNodeId)?.floorId === startNode.floorId);
  const dischargeNodeId = candidate.outdoorDischargeNodeId ?? candidate.nodeId;
  const dischargeNode = nodes.find((node) => node.id === dischargeNodeId);
  const finalNode = nodes.find((node) => node.id === candidate.nodeId);
  if (!groundNodeId || !startFloorLandingId || !dischargeNode || !finalNode) return null;
  const allIndoorNodes = indoorEmergencyNodes(searchNodes);
  // Candidate evaluation must not let the generic pathfinder introduce a
  // virtual transition through a different stair/elevator while it is merely
  // trying to reach this stair's landing.  Restrict the approach leg to the
  // current Floor, then restrict the descent leg below to this stair's own
  // generated landings.  This keeps a Ground-floor start from climbing to an
  // unrelated upper-floor occurrence just because that branch is geometrically
  // shorter.
  const startFloorNodes = allIndoorNodes.filter((node) => node.floorId === startNode.floorId);
  const startFloorNodeIds = new Set(startFloorNodes.map((node) => node.id));
  const startFloorEdges = routeEdges.filter((edge) => startFloorNodeIds.has(edge.startNodeId) && startFloorNodeIds.has(edge.endNodeId));
  const outdoorNodes = outdoorEmergencyNodes(searchNodes);
  const outdoorNodeIds = new Set(outdoorNodes.map((node) => node.id));
  const outdoorEdges = routeEdges.filter((edge) => outdoorNodeIds.has(edge.startNodeId) && outdoorNodeIds.has(edge.endNodeId));
  const staysIndoors = (path: GraphPath | null) => !!path
    && !path.nodeIds.includes(dischargeNodeId)
    && !path.nodeIds.includes(candidate.nodeId);
  const finishAtCampusGate = (basePath: GraphPath): GraphPath | null => {
    if (dischargeNodeId === candidate.nodeId) return basePath;
    const outdoorLeg = findNavigationRoute(outdoorNodes, outdoorEdges, dischargeNodeId, candidate.nodeId, false, true);
    if (!outdoorLeg) return null;
    const nodeIds = [...basePath.nodeIds, ...outdoorLeg.nodeIds.slice(1)];
    const waypoints = nodeIds.map((nodeId) => {
      const node = nodes.find((candidateNode) => candidateNode.id === nodeId);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    });
    const distanceM = basePath.distanceM + outdoorLeg.distanceM;
    return { ...outdoorLeg, nodeIds, waypoints, distanceM, minutes: Math.max(1, Math.round(distanceM / 80)), steps: basePath.steps };
  };
  // Leg 1 — current Floor: start -> the generated landing on the start Floor.
  const startLeg = findNavigationRoute(startFloorNodes, startFloorEdges, startNodeId, startFloorLandingId, false, true);
  if (!staysIndoors(startLeg)) return null;
  if (startFloorLandingId === groundNodeId) {
    // The start IS the Ground landing (Ground Floor evacuation): walk to the
    // landing, then cross the validated discharge edge.
    const basePath: GraphPath = {
      ...startLeg,
      nodeIds: [...startLeg.nodeIds, dischargeNodeId],
      waypoints: [...startLeg.waypoints, { x: dischargeNode.x, y: dischargeNode.y }],
      distanceM: startLeg.distanceM + 1,
      minutes: Math.max(1, Math.round((startLeg.distanceM + 1) / 80)),
    };
    return finishAtCampusGate(basePath);
  }
  // Leg 2 — descent: generated landing on the start Floor -> Ground landing,
  // inside the stair (its own landing-to-landing transitions).
  const stairLandingNodes = indoorEmergencyNodes(searchNodes)
    .filter((node) => ownerStairNodeIds.includes(node.id));
  const stairLandingNodeIds = new Set(stairLandingNodes.map((node) => node.id));
  const stairTransitionEdges = routeEdges.filter((edge) =>
    stairLandingNodeIds.has(edge.startNodeId) && stairLandingNodeIds.has(edge.endNodeId),
  );
  const descentLeg = findNavigationRoute(stairLandingNodes, stairTransitionEdges, startFloorLandingId, groundNodeId, false, true);
  if (!staysIndoors(descentLeg)) return null;
  const nodeIds = [...startLeg.nodeIds, ...descentLeg.nodeIds.slice(1), dischargeNodeId];
  const waypoints = nodeIds.map((nodeId) => {
    const node = nodes.find((candidateNode) => candidateNode.id === nodeId);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
  });
  const basePath: GraphPath = {
    ...descentLeg,
    nodeIds,
    waypoints,
    distanceM: startLeg.distanceM + descentLeg.distanceM + 1,
    minutes: Math.max(1, Math.round((startLeg.distanceM + descentLeg.distanceM + 1) / 80)),
    steps: startLeg.steps,
  };
  return finishAtCampusGate(basePath);
}

/** Re-enable a complete physical Veranda only for Emergency's final General
 * fallback tier. Normal Veranda edges are intentionally marked non-emergency
 * safe so they cannot outrank a dedicated Emergency Stair/Exit; once the
 * resolver has selected this specific General Entrance as the fallback, its
 * own canonical approach is the physical route that must be traversed. */
function emergencyGeneralFallbackEdges(
  campus: Campus,
  routeEdges: NavigationEdge[],
  entranceId: string,
  outdoorTargetId: string,
): { edges: NavigationEdge[]; nodeIds: ReadonlySet<string> } {
  const nodes = campus.navNodes ?? [];
  const building = (campus.buildings ?? []).find((candidate) => (candidate.entrances ?? []).some((entrance) => entrance.id === entranceId));
  if (!building) return { edges: routeEdges, nodeIds: new Set() };
  const approachNodeIds = new Set<string>();
  const approachFeatureIds = new Set<string>();
  const approachZoneIds = new Set<string>();
  let hasCompleteApproach = false;
  for (const floor of building.floors ?? []) {
    for (const zone of floor.exteriorZones ?? []) {
      const readiness = exteriorApproachEntranceReadiness(campus, building.id, floor.id, zone.id, entranceId);
      if (!readiness.standardReady) continue;
      hasCompleteApproach = true;
      approachZoneIds.add(zone.id);
      approachNodeIds.add(exteriorApproachNodeId(campus.id, building.id, floor.id, "entrance_threshold", entranceId, "threshold"));
      const approachFeatures = [
        ...(floor.entranceSteps ?? []).filter((item) => item.parentZoneId === zone.id).map((feature) => ({ feature, featureType: "entrance_steps" as const })),
        ...(floor.entranceRamps ?? []).filter((item) => item.parentZoneId === zone.id).map((feature) => ({ feature, featureType: "entrance_ramp" as const })),
      ];
      const zoneServesEntrance = [
        ...(zone.linkedEntranceIds ?? []),
        ...(zone.linkedEntranceId ? [zone.linkedEntranceId] : []),
      ].includes(entranceId);
      const linkedFeatures = approachFeatures.filter(({ feature }) => feature.linkedEntranceId
        ? feature.linkedEntranceId === entranceId
        : zoneServesEntrance);
      for (const { feature, featureType } of linkedFeatures) {
        approachFeatureIds.add(feature.id);
        approachNodeIds.add(exteriorApproachNodeId(campus.id, building.id, floor.id, featureType, feature.id, "inner"));
        approachNodeIds.add(exteriorApproachNodeId(campus.id, building.id, floor.id, featureType, feature.id, "outer"));
      }
      for (const node of nodes) {
        if (node.floorId !== floor.id) continue;
        if (node.exteriorZoneId === zone.id || (node.derivedOwnerType === "exterior_zone" && node.derivedOwnerId === zone.id)) {
          approachNodeIds.add(node.id);
        }
      }
      for (const node of nodes) {
        if (node.floorId !== floor.id || !node.derivedOwnerType) continue;
        if ((node.derivedOwnerType === "entrance_ramp" || node.derivedOwnerType === "entrance_steps")
          && approachFeatureIds.has(node.derivedOwnerId ?? "")) approachNodeIds.add(node.id);
        if (node.derivedOwnerType === "entrance_threshold" && node.derivedOwnerId === entranceId) approachNodeIds.add(node.id);
      }
    }
  }
  if (!hasCompleteApproach) return { edges: routeEdges, nodeIds: new Set() };
  // The existing Building Outdoor handoff may be an authored edge from the
  // campus target to the derived outer anchor (rather than the newer derived
  // auto-handoff form). Include that semantic target so this specific edge is
  // re-enabled with the rest of the selected General approach.
  approachNodeIds.add(outdoorTargetId);
  const edges = routeEdges.map((edge) => {
    const approachOwned = edge.derivedOwnerType === "entrance_threshold"
      ? edge.derivedOwnerId === entranceId
      : edge.derivedOwnerType === "exterior_zone"
        ? approachZoneIds.has(edge.derivedOwnerId ?? "")
        : (edge.derivedOwnerType === "entrance_ramp" || edge.derivedOwnerType === "entrance_steps")
          ? approachFeatureIds.has(edge.derivedOwnerId ?? "")
          : false;
    const sharedHandoff = edge.exteriorApproachAutoHandoffTargetId === outdoorTargetId;
    const authoredVerandaEdge = !edge.derivedOwnerType
      && approachNodeIds.has(edge.startNodeId)
      && approachNodeIds.has(edge.endNodeId);
    return edge.emergencySafe === false && (approachOwned || sharedHandoff || authoredVerandaEdge)
      ? { ...edge, emergencySafe: true }
      : edge;
  });
  return { edges, nodeIds: approachNodeIds };
}

/** An Entrance egress (Emergency Exit or General fallback) must be reached
 * through its own indoor/outdoor bridge: the route has to pass the Entrance
 * node, not reach its outdoor target by walking outside from another exit. */
function entranceEgressRoute(
  campus: Campus,
  routeEdges: NavigationEdge[],
  searchNodes: NavigationNode[],
  startNodeId: string,
  candidate: EmergencyDestinationCandidate,
): GraphPath | null {
  if (!candidate.entranceNodeId) return null;
  const dischargeNodeId = candidate.outdoorDischargeNodeId ?? candidate.nodeId;
  const fallbackApproach = candidate.kind === "general"
    ? emergencyGeneralFallbackEdges(campus, routeEdges, (searchNodes.find((node) => node.id === candidate.entranceNodeId)?.entranceId) ?? "", dischargeNodeId)
    : undefined;
  const candidateEdges = fallbackApproach?.edges ?? routeEdges;
  const approachNodes = entranceEmergencyNodes(searchNodes, startNodeId, candidate.entranceNodeId, dischargeNodeId, fallbackApproach?.nodeIds)
    .map((node) => fallbackApproach?.nodeIds.has(node.id) ? { ...node, emergencySafe: true } : node);
  const approachNodeIds = new Set(approachNodes.map((node) => node.id));
  const approachEdges = candidateEdges.filter((edge) => approachNodeIds.has(edge.startNodeId) && approachNodeIds.has(edge.endNodeId));
  const path = findNavigationRoute(approachNodes, approachEdges, startNodeId, dischargeNodeId, false, true);
  if (!path || !path.nodeIds.includes(candidate.entranceNodeId)) return null;
  if (dischargeNodeId === candidate.nodeId) return path;
  const outdoorNodes = outdoorEmergencyNodes(searchNodes);
  const outdoorNodeIds = new Set(outdoorNodes.map((node) => node.id));
  const outdoorEdges = routeEdges.filter((edge) => outdoorNodeIds.has(edge.startNodeId) && outdoorNodeIds.has(edge.endNodeId));
  const outdoorLeg = findNavigationRoute(outdoorNodes, outdoorEdges, dischargeNodeId, candidate.nodeId, false, true);
  if (!outdoorLeg) return null;
  return {
    ...outdoorLeg,
    nodeIds: [...path.nodeIds, ...outdoorLeg.nodeIds.slice(1)],
    waypoints: [...path.waypoints, ...outdoorLeg.waypoints.slice(1)],
    distanceM: path.distanceM + outdoorLeg.distanceM,
    minutes: Math.max(1, Math.round((path.distanceM + outdoorLeg.distanceM) / 80)),
    steps: path.steps,
  };
}

/**
 * Choose the best reachable dedicated emergency stair first, then a reachable
 * Emergency Exit entrance, and finally a safe General Entrance fallback. A
 * lower-priority candidate is never ranked against a higher-priority egress by
 * distance, so a short General route can never beat a longer designated
 * evacuation. Service Entrances are never candidates. This deliberately lives
 * beside the Test Route adapter so candidate qualification does not alter the
 * global A* implementation or Standard/Accessible routing.
 */
export function chooseEmergencyDestinationCandidate(
  campus: Campus,
  routeEdges: NavigationEdge[],
  startNodeId: string,
): { candidate: EmergencyDestinationCandidate; path: GraphPath } | null {
  const nodes = campus.navNodes ?? [];
  const searchNodes = emergencySearchNodes(nodes, startNodeId);
  const pools = emergencyDestinationCandidatePools(campus, routeEdges);
  const reachableCandidates = (pool: EmergencyDestinationCandidate[]) => pool
    .map((candidate) => ({
      candidate,
      path: candidate.kind === "exterior_stair"
        ? exteriorEmergencyStairRoute(campus, routeEdges, searchNodes, startNodeId, candidate)
        : entranceEgressRoute(campus, routeEdges, searchNodes, startNodeId, candidate),
    }))
    .filter((entry): entry is { candidate: EmergencyDestinationCandidate; path: GraphPath } => !!entry.path)
    .sort((left, right) => left.candidate.priority - right.candidate.priority
      || (left.candidate.campusGatePurpose === "emergency_exit" ? 0 : 1) - (right.candidate.campusGatePurpose === "emergency_exit" ? 0 : 1)
      || left.path.distanceM - right.path.distanceM);
  return reachableCandidates(pools.emergency)[0] ?? reachableCandidates(pools.general)[0] ?? null;
}

function linkedNodeKind(node: CampusNavNode): "room" | "door" | "stair" | "elevator" | "ramp" | null {
  if (node.roomId) return "room";
  if (node.doorId) return "door";
  if (node.stairId) return "stair";
  if (node.elevatorId) return "elevator";
  if (node.rampId) return "ramp";
  return null;
}

/** Resolve a Door label for admin-facing route controls without exposing IDs. */
export function semanticDoorDisplayName(campus: Campus, node: CampusNavNode): string {
  if (!node.doorId) return node.name || "Door";
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
  const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
  const door = floor?.doors.find((candidate) => candidate.id === node.doorId);
  if (!door) return node.name || "Door";
  // A Room access Door is the most useful semantic name in Test Route.
  for (const candidateFloor of building?.floors ?? []) {
    const room = (candidateFloor.rooms ?? []).find((candidate) => roomAccessDoorIds(candidate).includes(door.id));
    if (room) return `${roomDisplayName(room, candidateFloor.rooms.findIndex((item) => item.id === room.id))} Door`;
  }
  // Entrance transitions identify an exterior-facing Door without changing the
  // physical Door record or its canonical graph identity.
  const entranceEdge = (campus.navEdges ?? []).find((edge) =>
    edge.type === "entrance_transition" && (edge.startNodeId === node.id || edge.endNodeId === node.id),
  );
  if (entranceEdge) {
    const entranceNode = (campus.navNodes ?? []).find((candidate) =>
      candidate.id === (entranceEdge.startNodeId === node.id ? entranceEdge.endNodeId : entranceEdge.startNodeId)
      && candidate.entranceId,
    );
    const entrance = entranceNode && building?.entrances?.find((candidate) => candidate.id === entranceNode.entranceId);
    if (entrance) return `${entrance.name?.trim() || `${building?.code ?? "Building"} Entrance`} Door`;
  }
  if (door.label?.trim()) return door.label.trim();
  const index = floor?.doors.findIndex((candidate) => candidate.id === door.id) ?? -1;
  return index >= 0 ? `Door ${index + 1}` : "Door";
}

function linkedNodeLabel(node: CampusNavNode, campus?: Campus): string {
  const kind = linkedNodeKind(node);
  if (campus && node.doorId) {
    return semanticDoorDisplayName(campus, node);
  }
  const fallback = kind === "door" ? "Door"
    : kind === "stair" ? "Stair"
    : kind === "elevator" ? "Elevator"
    : kind === "ramp" ? "Ramp"
    : "Walking Point";
  return node.name || fallback;
}

function routeLocationLabel(campus: Campus, node: CampusNavNode): { label: string; kind: string } {
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
  if (node.roomId && building) {
    for (const floor of building.floors ?? []) {
      const room = floor.rooms.find((candidate) => candidate.id === node.roomId);
      if (room) return { label: roomDisplayName(room, floor.rooms.findIndex((candidate) => candidate.id === room.id)), kind: "room" };
    }
  }
  if (node.doorId && building) {
    for (const floor of building.floors ?? []) {
      const door = floor.doors.find((candidate) => candidate.id === node.doorId);
      if (door) return { label: semanticDoorDisplayName(campus, node), kind: "door" };
    }
  }
  if (node.entranceId && building) {
    const entrance = (building.entrances ?? []).find((candidate) => candidate.id === node.entranceId);
    if (entrance) return { label: entrance.name || `${building.code} Entrance`, kind: "entrance" };
  }
  if (node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "outer") {
    return { label: "Ramp", kind: "exterior_ramp" };
  }
  if (node.derivedOwnerType === "entrance_steps" && node.derivedRole === "outer") {
    return { label: "Stairs", kind: "exterior_stairs" };
  }
  if (node.stairId && building) {
    const floor = building.floors.find((candidate) => candidate.id === node.floorId);
    const index = floor?.stairs.findIndex((candidate) => candidate.id === node.stairId) ?? -1;
    return { label: node.name || (index >= 0 ? `Stair ${index + 1}` : "Stair"), kind: "stair" };
  }
  if (node.elevatorId && building) {
    const floor = building.floors.find((candidate) => candidate.id === node.floorId);
    const index = floor?.elevators.findIndex((candidate) => candidate.id === node.elevatorId) ?? -1;
    return { label: node.name || (index >= 0 ? `Elevator ${index + 1}` : "Elevator"), kind: "elevator" };
  }
  if (node.rampId && building) {
    const floor = building.floors.find((candidate) => candidate.id === node.floorId);
    const index = floor?.ramps.findIndex((candidate) => candidate.id === node.rampId) ?? -1;
    return { label: node.name || (index >= 0 ? `Ramp ${index + 1}` : "Ramp"), kind: "ramp" };
  }
  if (node.gateId) {
    const gate = campusGates(campus).find((candidate) => candidate.id === node.gateId);
    return { label: gate?.name?.trim() || node.name || "Campus Gate", kind: "gate" };
  }
  return { label: "the hallway", kind: "walking" };
}

/** Keep emergency stair legs on the correct side of the building boundary.
 * The route adapter must not leave through a normal Entrance and re-enter at
 * a stair, nor let an outdoor leg loop back through an indoor graph. */
function indoorEmergencyNodes(nodes: NavigationNode[]): NavigationNode[] {
  return nodes.filter((node) => !!node.floorId);
}

function outdoorEmergencyNodes(nodes: NavigationNode[]): NavigationNode[] {
  return nodes.filter((node) => !node.floorId && !node.entranceId);
}

function entranceEmergencyNodes(
  nodes: NavigationNode[],
  startNodeId: string,
  entranceNodeId: string,
  dischargeNodeId: string,
  additionalNodeIds: ReadonlySet<string> = new Set(),
): NavigationNode[] {
  const allowed = new Set([startNodeId, entranceNodeId, dischargeNodeId, ...additionalNodeIds]);
  return nodes.filter((node) => !!node.floorId || allowed.has(node.id));
}

export function humanRouteSteps(campus: Campus, nodeIds: string[], destinationValue?: string): string[] {
  if (nodeIds.length === 0) return [];
  const nodes = campus.navNodes ?? [];
  const locations = nodeIds.map((id) => {
    const node = nodes.find((candidate) => candidate.id === id);
    return node ? routeLocationLabel(campus, node) : { label: "the hallway", kind: "walking" };
  });
  const steps = [`Start at ${locations[0].label}`];
  for (let i = 1; i < locations.length - 1; i += 1) {
    const location = locations[i];
    if (i === locations.length - 2 && locations[locations.length - 1]?.kind === "room" && location.kind === "door") continue;
    if (location.kind === "door") {
      steps.push(locations[i - 1]?.kind === "room" ? `Exit through ${location.label}` : `Enter through ${location.label}`);
    }
    else if (location.kind === "entrance") steps.push(`Pass ${location.label}`);
    else if (location.kind === "exterior_ramp") steps.push("Continue outside via ramp");
    else if (location.kind === "exterior_stairs") steps.push("Continue outside via stairs");
    else if (location.kind !== "walking") steps.push(`Continue to ${location.label}`);
    else if (steps[steps.length - 1] !== "Continue along the hallway") steps.push("Continue along the hallway");
  }
  if (locations.length > 1) {
    const final = locations[locations.length - 1];
    const before = locations[locations.length - 2];
    if (final.kind === "room" && before?.kind === "door") steps.push(`Enter through ${before.label}`);
    if (destinationValue?.startsWith("building:") && final.kind === "entrance") {
      const buildingId = destinationValue.slice("building:".length);
      const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingId);
      const buildingLabel = building?.name?.trim() || building?.code?.trim() || "the building";
      steps.push(`Arrive at ${buildingLabel} via ${final.label}`);
    } else if (destinationValue?.startsWith("building:")) {
      const buildingId = destinationValue.slice("building:".length);
      const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingId);
      steps.push(`Arrive at ${building?.name?.trim() || building?.code?.trim() || final.label}`);
    } else {
      steps.push(`Arrive at ${final.label}`);
    }
  }
  return steps;
}

function routeContextLabel(campus: Campus, node: CampusNavNode): string {
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
  if (node.floorId && building) {
    const floor = building.floors.find((candidate) => candidate.id === node.floorId);
    return `${building.code} · ${floor?.label ?? "Floor"}`;
  }
  if (building) return building.code;
  return "Outdoor";
}

function routeSegments(campus: Campus, nodeIds: string[]): { context: string; from: string; to: string }[] {
  const nodes = campus.navNodes ?? [];
  const locations = nodeIds.map((id) => {
    const node = nodes.find((candidate) => candidate.id === id);
    return node ? { node, location: routeLocationLabel(campus, node) } : null;
  }).filter(Boolean) as { node: CampusNavNode; location: { label: string; kind: string } }[];
  const segments: { context: string; from: string; to: string }[] = [];
  let start = 0;
  while (start < locations.length) {
    let end = start;
    const context = routeContextLabel(campus, locations[start].node);
    while (end + 1 < locations.length && routeContextLabel(campus, locations[end + 1].node) === context) end += 1;
    if (end > start) segments.push({ context, from: locations[start].location.label, to: locations[end].location.label });
    start = end + 1;
  }
  return segments;
}

function roomSemanticEndpoint(campus: Campus, value: string, currentFloorId?: string): { x: number; y: number; width: number; height: number } | null {
  const [type, buildingId, roomId] = value.split(":");
  if (type !== "room") return null;
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingId);
  const floor = building?.floors.find((candidate) => candidate.id === currentFloorId);
  const room = floor?.rooms.find((candidate) => candidate.id === roomId);
  return room ? { x: room.x, y: room.y, width: room.w, height: room.h } : null;
}

export function buildStartOptions(campus: Campus, routeEdges = buildTestRouteEdges(campus)): OptionEntry[] {
  const opts: OptionEntry[] = [];
  const buildings = campus.buildings ?? [];
  const nodes = campus.navNodes ?? [];

  for (const b of buildings) {
    opts.push({ value: `building:${b.id}`, label: b.name || b.code, subtitle: b.code, group: "Buildings", kind: "building", kindLabel: "Building", buildingLabel: b.name || b.code, nodeHint: resolveBuildingEntranceNodeId(campus, b, routeEdges) ?? undefined });
  }
  // Entrances that have an outdoor nav node
  for (const b of buildings) {
    for (const ent of b.entrances ?? []) {
      // Find the nav node linked to this entrance
      const linkedNode = nodes.find(n => n.entranceId === ent.id);
      if (linkedNode) {
        const entLabel = ent.name || `${b.code} Entrance`;
        opts.push({ value: `node:${linkedNode.id}`, label: entLabel, subtitle: b.code, group: "Entrances", kind: "entrance", kindLabel: "Entrances", floorLabel: "Outdoor", buildingLabel: b.name || b.code });
      }
    }
  }
  for (const gate of campusGates(campus)) {
    const node = nodes.find((candidate) => candidate.gateId === gate.id);
    if (node) opts.push({
      value: `node:${node.id}`,
      label: gate.name || "Campus Gate",
      subtitle: gate.purpose === "emergency_exit" ? "Emergency Exit Gate" : "Campus Gate",
      group: "Campus Gates",
      kind: "other",
      kindLabel: "Campus Gate",
    });
  }
  // Ready Rooms are first-class starting locations as well as destinations.
  // Require the complete Room → Door → Walking Network chain so choosing a
  // Start cannot silently resolve to an unrelated nearby node.
  for (const b of buildings) {
    for (const floor of b.floors ?? []) {
      for (const [index, room] of (floor.rooms ?? []).entries()) {
        const resolvedRoom = roomRouteInfo(campus, b.id, room.id, routeEdges);
        if (!resolvedRoom) continue;
        opts.push({
          value: `room:${b.id}:${room.id}`,
          label: roomOptionLabel(room, floor, index),
          subtitle: floorContext(b, floor),
          group: `Rooms · ${b.code}`,
          kind: "room",
          kindLabel: "Rooms",
          floorLabel: floor.label,
          buildingLabel: b.name || b.code,
          nodeHint: resolvedRoom.roomNode.id,
        });
      }
    }
  }
  // Direct infrastructure endpoints remain available for diagnostics, but are
  // secondary to semantic Rooms and Entrances in the normal picker.
  for (const node of nodes) {
    // A Ground Exterior Emergency Stair discharge is generated route
    // infrastructure, not a semantic Start/Destination. It remains visible
    // to Navigation authoring, but must not leak into this picker.
    if (node.exteriorEmergencyStairId && !node.floorId) continue;
    if (node.entranceId || node.gateId || !linkedNodeKind(node) || linkedNodeKind(node) === "room") continue;
    const building = buildings.find((candidate) => candidate.id === node.buildingId);
    const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
    const kind = linkedNodeKind(node);
    opts.push({ value: `node:${node.id}`, label: linkedNodeLabel(node, campus), subtitle: building ? floorContext(building, floor) : undefined, group: kind === "door" ? "Advanced · Infrastructure" : "Circulation", kind: kind ?? "other", kindLabel: kind ? `${kind[0].toUpperCase()}${kind.slice(1)}s` : "Other", floorLabel: floor?.label, buildingLabel: building?.name || building?.code });
  }
  return opts;
}

export function buildDestinationOptions(campus: Campus, routeEdges = buildTestRouteEdges(campus)): OptionEntry[] {
  const opts: OptionEntry[] = [];
  const buildings = campus.buildings ?? [];
  const nodes = campus.navNodes ?? [];
  const assemblyPoints = campus.assemblyPoints ?? [];
  const eventOverlays = (campus.eventOverlays ?? []).filter(e => !!e.locationRef);

  // Rooms (grouped by building)
  for (const b of buildings) {
    for (const floor of b.floors ?? []) {
      for (const [index, room] of (floor.rooms ?? []).entries()) {
        const resolvedRoom = roomRouteInfo(campus, b.id, room.id, routeEdges);
        if (!resolvedRoom) continue;
        opts.push({
          value: `room:${b.id}:${room.id}`,
          label: roomOptionLabel(room, floor, index),
          subtitle: floorContext(b, floor),
          group: `Rooms · ${b.code}`,
          kind: "room",
          kindLabel: "Rooms",
          floorLabel: floor.label,
          buildingLabel: b.name || b.code,
          nodeHint: resolvedRoom.roomNode.id,
        });
      }
    }
  }
  // Buildings
  for (const b of buildings) {
    opts.push({ value: `building:${b.id}`, label: b.name || b.code, subtitle: b.code, group: "Buildings", kind: "building", kindLabel: "Building", buildingLabel: b.name || b.code, nodeHint: resolveBuildingEntranceNodeId(campus, b, routeEdges) ?? undefined });
  }
  // Entrances
  for (const b of buildings) {
    for (const ent of b.entrances ?? []) {
      const linkedNode = nodes.find(n => n.entranceId === ent.id);
      if (linkedNode) {
        opts.push({ value: `node:${linkedNode.id}`, label: ent.name || `${b.code} Entrance`, subtitle: b.code, group: "Entrances", kind: "entrance", kindLabel: "Entrances", floorLabel: "Outdoor", buildingLabel: b.name || b.code });
      }
    }
  }
  for (const gate of campusGates(campus)) {
    const node = nodes.find((candidate) => candidate.gateId === gate.id);
    if (node) opts.push({
      value: `node:${node.id}`,
      label: gate.name || "Campus Gate",
      subtitle: gate.purpose === "emergency_exit" ? "Emergency Exit Gate" : "Campus Gate",
      group: "Campus Gates",
      kind: "other",
      kindLabel: "Campus Gate",
    });
  }
  // Linked physical circulation locations get a real-world label instead of
  // appearing as anonymous Walking Points.
  for (const node of nodes) {
    if (node.exteriorEmergencyStairId && !node.floorId) continue;
    if (node.entranceId || node.gateId || !linkedNodeKind(node) || linkedNodeKind(node) === "room") continue;
    const building = buildings.find((candidate) => candidate.id === node.buildingId);
    const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
    const kind = linkedNodeKind(node);
    opts.push({ value: `node:${node.id}`, label: linkedNodeLabel(node, campus), subtitle: building ? floorContext(building, floor) : undefined, group: kind === "door" ? "Advanced · Infrastructure" : "Circulation", kind: kind ?? "other", kindLabel: kind ? `${kind[0].toUpperCase()}${kind.slice(1)}s` : "Other", floorLabel: floor?.label, buildingLabel: building?.name || building?.code });
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

export function resolveNodeId(
  value: string,
  campus: Campus,
  routeEdges = buildTestRouteEdges(campus),
  accessibleOnly = false,
  emergencyOnly = false,
): string | null {
  if (!value) return null;
  const [type, id] = value.split(":");
  const buildings = campus.buildings ?? [];
  const nodes = campus.navNodes ?? [];
  const assemblyPoints = campus.assemblyPoints ?? [];

  if (type === "node") {
    const node = nodes.find((candidate) => candidate.id === id);
    return node?.exteriorEmergencyStairId && !node.floorId ? null : id;
  }
  if (type === "building") {
    const b = buildings.find(x => x.id === id);
    if (!b) return null;
    return resolveBuildingEntranceNodeId(campus, b, routeEdges, accessibleOnly, emergencyOnly);
  }
  if (type === "room") {
    const [, bId, rId] = value.split(":");
    return roomRouteInfo(campus, bId, rId, routeEdges, false, accessibleOnly, emergencyOnly)?.roomNode.id ?? null;
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
    return resolveBuildingEntranceNodeId(campus, b, routeEdges, accessibleOnly, emergencyOnly);
  }
  return null;
}

/**
 * PART 4: Build a continuous display polyline from the routed node sequence
 * by looking up the actual NavigationEdge geometry (including bendPoints) for
 * each consecutive pair. If an edge is traversed backwards, its bendPoints
 * are reversed. Duplicate coordinates at edge junctions are avoided.
 */
function buildRoutePolylineContinuous(
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

  // Build edge lookup: keep all candidates for a canonical pair.  Generated
  // and legacy/manual edges can legitimately share a node pair; the renderer
  // must choose the shortest CURRENT geometry rather than whichever stale edge
  // happened to be first in persisted order.
  const edgeLookup = new Map<string, (typeof edges[0])[]>();
  for (const edge of edges) {
    // Keep every candidate: pathfinding receives the canonical normalized set,
    // while the display builder resolves duplicate legacy/generated geometry
    // from current coordinates below.
    const forwardKey = `${edge.startNodeId}>${edge.endNodeId}`;
    const forward = edgeLookup.get(forwardKey) ?? [];
    forward.push(edge);
    edgeLookup.set(forwardKey, forward);
    if (edge.bidirectional) {
      const reverseKey = `${edge.endNodeId}>${edge.startNodeId}`;
      const reverse = edgeLookup.get(reverseKey) ?? [];
      reverse.push(edge);
      edgeLookup.set(reverseKey, reverse);
    }
  }

  const routeEdgePoints = (edge: (typeof edges[0]), fromId: string, toId: string, fromPos: { x: number; y: number }, toPos: { x: number; y: number }) => {
    const reverse = edge.startNodeId !== fromId || edge.endNodeId !== toId;
    const orderedBends = reverse ? [...(edge.bendPoints ?? [])].reverse() : [...(edge.bendPoints ?? [])];
    const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 3) => Math.hypot(a.x - b.x, a.y - b.y) <= eps;
    const bends = normalizeBendPoints(orderedBends.filter((bend) => !near(bend, fromPos) && !near(bend, toPos)));
    const result: { x: number; y: number }[] = [{ ...fromPos }];
    for (const bend of bends) {
      const previous = result[result.length - 1];
      if (!near(previous, bend)) result.push({ x: bend.x, y: bend.y });
    }
    const last = result[result.length - 1];
    if (!near(last, toPos)) result.push({ ...toPos });
    return result;
  };

  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const fromId = nodeIds[i];
    const toId = nodeIds[i + 1];
    const candidates = edgeLookup.get(`${fromId}>${toId}`) ?? [];
    const fromPos = nodePos.get(fromId);
    const toPos = nodePos.get(toId);

    if (candidates.length === 0 || !fromPos || !toPos) {
      // Fallback: straight line between nodes
      if (points.length === 0 || !lastPointMatches(points, fromPos)) {
        if (fromPos) points.push({ ...fromPos });
      }
      if (toPos && !lastPointMatches(points, toPos)) points.push({ ...toPos });
      continue;
    }

    const edge = candidates
      .map((candidate) => ({ candidate, geometry: routeEdgePoints(candidate, fromId, toId, fromPos, toPos) }))
      .sort((a, b) => navEdgePolylineDistance(a.geometry) - navEdgePolylineDistance(b.geometry))[0];
    const geometry = edge.geometry;

    // Add start node (avoid duplicate if last point already matches)
    if (points.length === 0 || !lastPointMatches(points, fromPos)) {
      points.push({ ...fromPos });
    }

    for (const point of geometry.slice(1)) {
      if (!lastPointMatches(points, point)) {
        points.push({ ...point });
      }
    }
  }

  // Authored bend data can outlive a moved/split endpoint.  A malformed edge
  // may therefore contain an immediate out-and-back coordinate trip even
  // though the canonical A* node sequence is acyclic.  Remove only that
  // display artifact (and exact duplicate coordinates); canonical node/edge
  // topology is intentionally untouched.
  const normalized: { x: number; y: number }[] = [];
  for (const point of points) {
    const previous = normalized[normalized.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    const beforePrevious = normalized[normalized.length - 2];
    if (beforePrevious && beforePrevious.x === point.x && beforePrevious.y === point.y) {
      normalized.pop();
      continue;
    }
    normalized.push(point);
  }
  return normalized;
}

/**
 * Build route geometry without manufacturing a segment for a missing
 * canonical edge.  Context filtering and legacy display projection can leave
 * an endpoint pair without a drawable edge; keep the two runs separate rather
 * than letting SVG connect them through empty space.
 */
export function buildRoutePolylineFragments(
  nodeIds: string[],
  edges: { id: string; startNodeId: string; endNodeId: string; bidirectional: boolean; bendPoints?: { x: number; y: number }[] }[],
  nodes: { id: string; x: number; y: number }[],
): { x: number; y: number }[][] {
  if (nodeIds.length === 0) return [];
  const hasEdge = (fromId: string, toId: string) => edges.some((edge) =>
    (edge.startNodeId === fromId && edge.endNodeId === toId)
      || (edge.bidirectional && edge.startNodeId === toId && edge.endNodeId === fromId),
  );
  const idFragments: string[][] = [];
  let current = [nodeIds[0]];
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const fromId = nodeIds[index];
    const toId = nodeIds[index + 1];
    if (hasEdge(fromId, toId)) {
      current.push(toId);
    } else {
      idFragments.push(current);
      current = [toId];
    }
  }
  idFragments.push(current);
  return idFragments
    .map((fragment) => buildRoutePolylineContinuous(fragment, edges, nodes))
    .filter((fragment) => fragment.length > 0);
}

/** Backwards-compatible single-polyline helper for callers that already know
 * their route is contiguous. Rendering callers should use the fragment form
 * above so a missing edge can never be drawn as a straight-line bridge. */
export function buildRoutePolyline(
  nodeIds: string[],
  edges: { id: string; startNodeId: string; endNodeId: string; bidirectional: boolean; bendPoints?: { x: number; y: number }[] }[],
  nodes: { id: string; x: number; y: number }[],
): { x: number; y: number }[] {
  return buildRoutePolylineFragments(nodeIds, edges, nodes).flat();
}

/**
 * Trim only the rendered endpoint of a route fragment when it terminates at a
 * transition/waypoint marker. Route strokes and marker glyphs are siblings in
 * the same zoomed SVG world group, so the marker boundary is already expressed
 * in the route's coordinate space. Dividing this world-space radius by zoom
 * would double-convert it and make the route visibly too short when zoomed
 * out. This is presentation-only: graph coordinates, edge distances, and
 * authored bends are untouched.
 */
export function trimRouteFragmentAtMarkerBoundary(
  points: { x: number; y: number }[],
  markerPoints: { x: number; y: number }[],
  zoom = 1,
  markerRadiusWorld = 10,
): { x: number; y: number }[] {
  if (points.length < 2 || markerPoints.length === 0) return points;
  // Keep the zoom argument for the existing renderer call sites and API
  // compatibility. The path and marker are transformed together, therefore
  // no zoom conversion belongs in this helper.
  void zoom;
  const radius = Math.max(0, markerRadiusWorld);
  if (radius === 0) return points;
  const trimmed = points.map((point) => ({ ...point }));

  const trimEnd = (atStart: boolean, marker: { x: number; y: number }) => {
    const endpoint = atStart ? trimmed[0] : trimmed[trimmed.length - 1];
    if (!endpoint || Math.hypot(endpoint.x - marker.x, endpoint.y - marker.y) > radius * 2.5) return;
    const neighbor = atStart ? trimmed[1] : trimmed[trimmed.length - 2];
    if (!neighbor) return;
    const dx = neighbor.x - endpoint.x;
    const dy = neighbor.y - endpoint.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const distance = Math.min(radius, length * 0.75);
    const replacement = {
      x: endpoint.x + (dx / length) * distance,
      y: endpoint.y + (dy / length) * distance,
    };
    if (atStart) trimmed[0] = replacement;
    else trimmed[trimmed.length - 1] = replacement;
  };

  for (const marker of markerPoints) {
    const start = trimmed[0];
    const end = trimmed[trimmed.length - 1];
    if (!start || !end) break;
    const startDistance = Math.hypot(start.x - marker.x, start.y - marker.y);
    const endDistance = Math.hypot(end.x - marker.x, end.y - marker.y);
    if (endDistance <= startDistance) trimEnd(false, marker);
    else trimEnd(true, marker);
  }
  return trimmed;
}

/** Replace semantic Room endpoints with their linked physical Door for route
 * presentation. Canonical pathfinding still uses the Room node; this helper is
 * display-only and deliberately leaves the graph data untouched. */
export function physicalRouteNodeIds(nodeIds: string[], campus: Campus): string[] {
  const nodes = campus.navNodes ?? [];
  const resolved = nodeIds.map((id, index) => {
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node?.roomId || !node.buildingId || !node.floorId) return id;
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
    const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
    const room = floor?.rooms.find((candidate) => candidate.id === node.roomId);
    if (!room) return id;
    const accessIds = new Set(roomAccessDoorIds(room));
    // The adjacent canonical Door is authoritative when a Room has multiple
    // access Doors; falling back to the legacy primary keeps old routes stable.
    const adjacent = [nodeIds[index - 1], nodeIds[index + 1]]
      .map((candidateId) => nodes.find((candidate) => candidate.id === candidateId))
      .find((candidate) => !!candidate?.doorId && accessIds.has(candidate.doorId)
        && candidate.buildingId === node.buildingId && candidate.floorId === node.floorId);
    if (adjacent) return adjacent.id;
    return nodes.find((candidate) => candidate.doorId && accessIds.has(candidate.doorId)
      && candidate.buildingId === node.buildingId && candidate.floorId === node.floorId)?.id ?? id;
  });
  return resolved.filter((id, index) => index === 0 || id !== resolved[index - 1]);
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }, epsilon = 1): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= epsilon;
}

function splitVisibleRouteIds(nodeIds: string[], isVisible: (id: string) => boolean): string[][] {
  const fragments: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) fragments.push(current);
    current = [];
  };
  for (const id of nodeIds) {
    if (isVisible(id)) current.push(id);
    else flush();
  }
  flush();
  return fragments;
}

/** Display-only route identity. Keep semantic Room endpoints in the polyline
 * so the active route begins/ends at the selected location, while interior
 * Room nodes still project to their physical Door as before. */
export function routeDisplayNodeIds(nodeIds: string[], campus: Campus): string[] {
  const physicalIds = physicalRouteNodeIds(nodeIds, campus);
  if (physicalIds.length === 0) return physicalIds;
  const nodes = campus.navNodes ?? [];
  const first = nodes.find((node) => node.id === nodeIds[0]);
  const last = nodes.find((node) => node.id === nodeIds[nodeIds.length - 1]);
  const display = [...physicalIds];
  if (first?.roomId && first.id !== display[0]) display.unshift(first.id);
  if (last?.roomId && last.id !== display[display.length - 1]) display.push(last.id);
  return display.filter((id, index) => index === 0 || id !== display[index - 1]);
}

export function buildPhysicalRoutePolyline(
  nodeIds: string[],
  campus: Campus,
  edges: { id: string; startNodeId: string; endNodeId: string; bidirectional: boolean; bendPoints?: { x: number; y: number }[] }[],
  nodes: { id: string; x: number; y: number }[],
): { x: number; y: number }[] {
  return buildRoutePolyline(physicalRouteNodeIds(nodeIds, campus), edges, nodes);
}

function isExteriorRouteNode(node: CampusNavNode | undefined): boolean {
  if (!node) return false;
  // Veranda Walking Points are floor-scoped because they are authored in a
  // Floor Editor, while their route is physically part of the outdoor
  // approach.  Derived approach anchors are the same kind of boundary
  // geometry. Keep both in the Outdoor projection; ordinary floor-local
  // Walking Points/Doors remain private to their Floor projection.
  return !node.floorId || Boolean(node.exteriorZoneId) || Boolean(node.derivedOwnerType);
}

function isOutdoorPresentationNode(node: CampusNavNode | undefined): boolean {
  return Boolean(node && !node.floorId && !node.exteriorZoneId && !node.derivedOwnerType);
}

function isFloorPresentationNode(node: CampusNavNode | undefined, currentContext: Extract<TestRouteContext, { kind: "floor" }>): boolean {
  if (!node || node.buildingId !== currentContext.buildingId) return false;
  if (node.floorId === currentContext.floorId) return true;
  // Entrance nodes and derived threshold/access anchors are canonical
  // building-handoff nodes. They are shown in the selected Floor view after
  // being projected back into the Floor coordinate space.
  return !node.floorId && (node.entranceId !== undefined || node.derivedOwnerType !== undefined);
}

/**
 * Convert only the Floor-authored portion of an exterior route into the
 * Outdoor canvas coordinate space. Floor Veranda points and inner/threshold
 * anchors are stored in their Floor frame; their Outdoor route is still the
 * same canonical node/edge sequence, but the overlay must use the Building
 * frame to avoid drawing a stale local-coordinate jump. Authored Veranda
 * bends are projected unchanged in shape, while derived approach bends are
 * recomputed from their projected endpoints.
 */
function exteriorRouteDisplayGeometry(
  campus: Campus,
  nodeIds: string[],
  edges: NavigationEdge[],
  nodes: CampusNavNode[],
  currentContext?: TestRouteContext,
): { nodes: CampusNavNode[]; edges: NavigationEdge[] } {
  if (!currentContext) return { nodes, edges };
  const displayNodeIds = new Set(nodeIds);
  const projectNode = (node: CampusNavNode): CampusNavNode => {
    if (!displayNodeIds.has(node.id)) return node;
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === node.buildingId);
    if (currentContext.kind === "outdoor") {
      const floor = building?.floors.find((candidate) => candidate.id === node.floorId);
      if (!node.floorId || (!node.exteriorZoneId && !node.derivedOwnerType) || !building || !floor) return node;
      return { ...node, ...exteriorFloorPointToCampusWorld(building, floor, node) };
    }
    if (node.buildingId !== currentContext.buildingId || node.floorId === currentContext.floorId) return node;
    const floor = building?.floors.find((candidate) => candidate.id === currentContext.floorId);
    if (!building || !floor || node.floorId || (!node.entranceId && !node.derivedOwnerType)) return node;
    return { ...node, ...campusWorldPointToExteriorFloor(building, floor, node) };
  };
  const projectedNodes = nodes.map(projectNode);
  const projectedNodeById = new Map(projectedNodes.map((node) => [node.id, node]));
  const projectEdge = (edge: NavigationEdge): NavigationEdge => {
    const start = nodes.find((node) => node.id === edge.startNodeId);
    const end = nodes.find((node) => node.id === edge.endNodeId);
    if (!start || !end || !isExteriorRouteNode(start) || !isExteriorRouteNode(end)) return edge;
    const floorNode = [start, end].find((node) => node.floorId && isExteriorRouteNode(node));
    if (!floorNode) return edge;
    const projectedStart = projectedNodeById.get(start.id);
    const projectedEnd = projectedNodeById.get(end.id);
    if (!projectedStart || !projectedEnd) return edge;
    const building = (campus.buildings ?? []).find((candidate) => candidate.id === floorNode.buildingId);
    const floor = currentContext.kind === "floor"
      ? building?.floors.find((candidate) => candidate.id === currentContext.floorId)
      : building?.floors.find((candidate) => candidate.id === floorNode.floorId);
    if (!building || !floor) return edge;
    if (edge.derivedOwnerType) {
      const bendPoints = projectedStart.x !== projectedEnd.x && projectedStart.y !== projectedEnd.y
        ? [{ x: projectedEnd.x, y: projectedStart.y }]
        : undefined;
      return bendPoints ? { ...edge, bendPoints } : { ...edge, bendPoints: undefined };
    }
    if (!edge.bendPoints?.length) return edge;
    if (currentContext.kind === "floor") return edge;
    return {
      ...edge,
      bendPoints: edge.bendPoints.map((point) => exteriorFloorPointToCampusWorld(building, floor, point)),
    };
  };
  return { nodes: projectedNodes, edges: edges.map(projectEdge) };
}

export function visibleContextRouteNodeIds(
  nodeIds: string[],
  campus: Campus,
  currentContext?: TestRouteContext,
): string[] {
  return visibleContextRouteNodeFragments(nodeIds, campus, currentContext).flat();
}

/**
 * Return context-visible route runs without ever bridging over hidden route
 * nodes. A renderer may draw each returned fragment independently; it must not
 * flatten these runs before constructing geometry.
 */
export function visibleContextRouteNodeFragments(
  nodeIds: string[],
  campus: Campus,
  currentContext?: TestRouteContext,
): string[][] {
  const physicalIds = routeDisplayNodeIds(nodeIds, campus);
  const nodes = campus.navNodes ?? [];
  const contextKey = (id: string) => {
    const node = nodes.find((candidate) => candidate.id === id);
    return node ? `${node.buildingId ?? "outdoor"}:${node.floorId ?? "outdoor"}` : "unknown";
  };
  if (!currentContext) {
    let exteriorRun: string[] = [];
    let bestExteriorRun: string[] = [];
    for (const id of physicalIds) {
      if (isExteriorRouteNode(nodes.find((candidate) => candidate.id === id))) {
        exteriorRun.push(id);
      } else {
        if (exteriorRun.length > bestExteriorRun.length) bestExteriorRun = exteriorRun;
        exteriorRun = [];
      }
    }
    if (exteriorRun.length > bestExteriorRun.length) bestExteriorRun = exteriorRun;
    if (bestExteriorRun.length > 0) return [bestExteriorRun];
    const contexts = new Set(physicalIds.map(contextKey));
    if (contexts.size <= 1) return [physicalIds];
    let best: string[] = [];
    let run: string[] = [];
    let previousContext = "";
    for (const id of physicalIds) {
      const context = contextKey(id);
      if (context !== previousContext) {
        if (run.length > best.length) best = run;
        run = [];
        previousContext = context;
      }
      run.push(id);
    }
    if (run.length > best.length) best = run;
    return [best.length > 0 ? best : physicalIds];
  }
  const matches = currentContext.kind === "outdoor"
    ? (id: string) => isOutdoorPresentationNode(nodes.find((candidate) => candidate.id === id))
    : (id: string) => isFloorPresentationNode(nodes.find((candidate) => candidate.id === id), currentContext);
  return splitVisibleRouteIds(physicalIds, matches);
}

/**
 * Collapse only a hidden exterior approach section in the Outdoor
 * presentation when the canonical graph also contains the Building's actual
 * Outdoor handoff edge.  The Veranda/Ramp/Steps nodes remain in the routed
 * graph; this is strictly a display projection.  Requiring the existing
 * Entrance<->Outdoor edge is important: it prevents filtering hidden nodes
 * from inventing a straight line between unrelated visible fragments.
 */
export function collapseOutdoorHandoffFragments(
  fragments: string[][],
  campus: Campus,
  edges: NavigationEdge[],
  currentContext?: TestRouteContext,
  routeNodeIds?: string[],
): string[][] {
  if (currentContext?.kind !== "outdoor" || fragments.length < 2) return fragments;
  const nodes = campus.navNodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const displayRouteIds = routeNodeIds ? routeDisplayNodeIds(routeNodeIds, campus) : [];
  const hasCanonicalHandoff = (fromId: string, toId: string): boolean => {
    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    if (!from || !to) return false;
    const entrance = from.entranceId && !from.floorId ? from : to.entranceId && !to.floorId ? to : undefined;
    const outdoor = entrance === from ? to : entrance === to ? from : undefined;
    if (!entrance || !outdoor || !isOutdoorPresentationNode(outdoor)) return false;
    if (edges.some((edge) => {
      const forward = edge.startNodeId === fromId && edge.endNodeId === toId;
      const reverse = edge.bidirectional && edge.startNodeId === toId && edge.endNodeId === fromId;
      return (forward || reverse) && !edge.closed;
    })) return true;
    // A complete Veranda intentionally suppresses the direct Entrance->Outdoor
    // fallback in the routine route graph.  In that case Outdoor still needs a
    // display-only collapse, but only when the raw route proves that it crossed
    // the physical feature transition; never infer it from the nearest node.
    const fromIndex = displayRouteIds.indexOf(fromId);
    const toIndex = displayRouteIds.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0 || Math.abs(toIndex - fromIndex) < 2) return false;
    const low = Math.min(fromIndex, toIndex);
    const high = Math.max(fromIndex, toIndex);
    for (let index = low; index < high; index += 1) {
      const left = nodeById.get(displayRouteIds[index]);
      const right = nodeById.get(displayRouteIds[index + 1]);
      const inner = left.derivedRole === "inner" && right.derivedRole === "outer" ? left : right.derivedRole === "inner" && left.derivedRole === "outer" ? right : undefined;
      const outer = inner === left ? right : inner === right ? left : undefined;
      if (!inner || !outer
        || inner.derivedOwnerId !== outer.derivedOwnerId
        || (inner.derivedOwnerType !== "entrance_ramp" && inner.derivedOwnerType !== "entrance_steps")
        || inner.derivedOwnerType !== outer.derivedOwnerType) continue;
      const forward = edges.some((edge) => edge.startNodeId === inner.id && edge.endNodeId === outer.id && !edge.closed);
      const reverse = edges.some((edge) => edge.bidirectional && edge.startNodeId === outer.id && edge.endNodeId === inner.id && !edge.closed);
      if (forward || reverse) return true;
    }
    return false;
  };
  const collapsed: string[][] = [];
  for (const fragment of fragments) {
    const previous = collapsed[collapsed.length - 1];
    const previousEnd = previous?.[previous.length - 1];
    const nextStart = fragment[0];
    if (previous && previousEnd && nextStart && hasCanonicalHandoff(previousEnd, nextStart)) {
      previous.push(...fragment);
    } else {
      collapsed.push([...fragment]);
    }
  }
  return collapsed;
}

/**
 * Add only the canonical physical Entrance<->Outdoor handoff as a
 * display-only projection edge when Outdoor hides a complete Veranda approach.
 * The persisted/routed graph is never changed and generic Veranda nodes are
 * never projected as endpoints.
 */
export function outdoorRouteProjectionEdges(
  campus: Campus,
  routeEdges: NavigationEdge[],
  routeNodeIds: string[],
  currentContext?: TestRouteContext,
): NavigationEdge[] {
  if (currentContext?.kind !== "outdoor") return routeEdges;
  const routeIds = new Set(routeDisplayNodeIds(routeNodeIds, campus));
  const nodes = campus.navNodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const projected = (campus.navEdges ?? []).filter((edge) => {
    if (edge.closed || edge.derivedOwnerType) return false;
    const start = nodeById.get(edge.startNodeId);
    const end = nodeById.get(edge.endNodeId);
    const entrance = start?.entranceId && !start.floorId ? start : end?.entranceId && !end.floorId ? end : undefined;
    const outdoor = entrance === start ? end : entrance === end ? start : undefined;
    return !!entrance && !!outdoor && isOutdoorPresentationNode(outdoor)
      && routeIds.has(entrance.id) && routeIds.has(outdoor.id);
  });
  const existing = new Set(routeEdges.map((edge) => edge.id));
  return [...routeEdges, ...projected.filter((edge) => !existing.has(edge.id))];
}

function contextForNode(node: CampusNavNode): TestRouteContext {
  return node.floorId
    ? { kind: "floor", buildingId: node.buildingId, floorId: node.floorId }
    : { kind: "outdoor", buildingId: node.buildingId };
}

function sameRouteContext(left: TestRouteContext, right: TestRouteContext): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "outdoor") return true;
  return left.buildingId === right.buildingId && left.floorId === right.floorId;
}

function routeContextDisplayLabel(campus: Campus, context: TestRouteContext): string {
  if (context.kind === "outdoor") return "Outdoor map";
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === context.buildingId);
  const floor = building?.floors.find((candidate) => candidate.id === context.floorId);
  return floor?.label ?? "the next floor";
}

function routeContextFloorIndex(campus: Campus, context: TestRouteContext): number | null {
  if (context.kind !== "floor" || !context.buildingId || !context.floorId) return null;
  const floors = (campus.buildings ?? []).find((building) => building.id === context.buildingId)?.floors ?? [];
  const index = floors.findIndex((floor) => floor.id === context.floorId);
  return index >= 0 ? index : null;
}

function transitionDirection(campus: Campus, from: TestRouteContext, to: TestRouteContext): "up" | "down" | undefined {
  const fromIndex = routeContextFloorIndex(campus, from);
  const toIndex = routeContextFloorIndex(campus, to);
  if (fromIndex === null || toIndex === null || fromIndex === toIndex) return undefined;
  return toIndex > fromIndex ? "up" : "down";
}

function transitionKind(node: CampusNavNode, next: CampusNavNode): TestRouteTransitionMarker["kind"] {
  if (node.elevatorId || next.elevatorId) return "elevator";
  if (node.stairId || next.stairId || node.exteriorEmergencyStairId || next.exteriorEmergencyStairId) return "stair";
  if (node.rampId || next.rampId) return "ramp";
  if (node.derivedOwnerType === "entrance_ramp" || next.derivedOwnerType === "entrance_ramp") return "ramp";
  if (node.derivedOwnerType === "entrance_steps" || next.derivedOwnerType === "entrance_steps") return "stair";
  return "entrance";
}

/** Resolve the one active admin continuation cue from the actual calculated
 * route. A complete physical approach points at its selected access feature;
 * a compatibility/direct route points at the canonical Entrance boundary.
 * Emergency routes intentionally use their existing egress presentation. */
export function routeContinuationMarkers(
  campus: Campus,
  nodeIds: string[],
  routeMode: RouteMode = "standard",
  currentContext?: TestRouteContext,
  destinationValue?: string,
  startValue?: string,
): TestRouteContinuationMarker[] {
  // A Building is the semantic endpoint. Its route is complete at the
  // physical Entrance, so neither the hidden exterior approach nor an
  // "Continue inside" cue belongs in that presentation.
  if (routeMode === "emergency"
    || destinationValue?.startsWith("building:")
    || (currentContext?.kind === "outdoor" && startValue?.startsWith("building:"))) return [];
  const nodes = campus.navNodes ?? [];
  const physicalIds = routeDisplayNodeIds(nodeIds, campus);
  const routeNodes = physicalIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is CampusNavNode => !!node);
  // A continuation cue is only applicable when this editor is showing one
  // fragment of a route that has a real fragment in another context. A route
  // that ends at its destination must not gain a clickable-looking marker.
  const hiddenContextBoundary = currentContext ? (() => {
    const isVisible = currentContext.kind === "outdoor"
      ? (id: string) => isOutdoorPresentationNode(nodes.find((node) => node.id === id))
      : (id: string) => isFloorPresentationNode(nodes.find((node) => node.id === id), currentContext);
    const visibleIndices = physicalIds
      .map((id, index) => isVisible(id) ? index : -1)
      .filter((index) => index >= 0);
    if (visibleIndices.length === 0) return undefined;
    const first = visibleIndices[0];
    const last = visibleIndices[visibleIndices.length - 1];
    return {
      before: first > 0,
      after: last < physicalIds.length - 1,
      visibleIds: visibleIndices.map((index) => physicalIds[index]),
    };
  })() : undefined;
  if (currentContext && !hiddenContextBoundary?.before && !hiddenContextBoundary?.after) return [];
  const feature = selectedExteriorAccessFeatureNode(campus, nodeIds, routeMode);
  // Floor presentation owns the actionable access-feature cue. Outdoor
  // presentation deliberately abstracts Veranda internals and falls through
  // to the physical Building Entrance handoff below.
  if (feature && currentContext?.kind !== "outdoor") {
    const featurePosition = currentContext?.kind === "floor"
      ? (() => {
        const building = (campus.buildings ?? []).find((candidate) => candidate.id === feature.buildingId);
        const floor = building?.floors.find((candidate) => candidate.id === currentContext.floorId);
        return building && floor && feature.buildingId === currentContext.buildingId && !feature.floorId
          ? campusWorldPointToExteriorFloor(building, floor, feature)
          : { x: feature.x, y: feature.y };
      })()
      : { x: feature.x, y: feature.y };
    return [{
      nodeId: feature.id,
      kind: feature.derivedOwnerType === "entrance_ramp" ? "ramp" : "steps",
      x: featurePosition.x,
      y: featurePosition.y,
    }];
  }
  const entrance = routeNodes.find((node) => node.entranceId && !node.floorId)
    ?? routeNodes.find((node) => node.doorId);
  if (!entrance) {
    // Last-resort presentation host: the visible endpoint is clickable only
    // because the actual route has a hidden continuation after this fragment.
    // It is deliberately not treated as an Entrance and never changes graph
    // topology or route eligibility.
    const visibleEndpointId = hiddenContextBoundary?.after
      ? hiddenContextBoundary.visibleIds[hiddenContextBoundary.visibleIds.length - 1]
      : undefined;
    const visibleEndpoint = visibleEndpointId
      ? nodes.find((node) => node.id === visibleEndpointId)
      : undefined;
    if (!visibleEndpoint) return [];
    const endpointIndex = physicalIds.indexOf(visibleEndpoint.id);
    const targetNodeId = endpointIndex >= 0
      ? physicalIds.slice(endpointIndex + 1).find((id) => id !== visibleEndpoint.id)
      : undefined;
    return [{
      nodeId: visibleEndpoint.id,
      kind: "waypoint",
      x: visibleEndpoint.x,
      y: visibleEndpoint.y,
      instruction: "Continue outside",
      targetNodeId,
    }];
  }
  const entrancePosition = currentContext?.kind === "floor"
    ? (() => {
      const building = (campus.buildings ?? []).find((candidate) => candidate.id === entrance.buildingId);
      const floor = building?.floors.find((candidate) => candidate.id === currentContext.floorId);
      return building && floor && entrance.buildingId === currentContext.buildingId && !entrance.floorId
        ? campusWorldPointToExteriorFloor(building, floor, entrance)
        : { x: entrance.x, y: entrance.y };
    })()
    : { x: entrance.x, y: entrance.y };
  return [{ nodeId: entrance.id, kind: "entrance", x: entrancePosition.x, y: entrancePosition.y }];
}

/** Remove route-transition cues that are internal to the other presentation
 * context. The canonical transition list remains unchanged for routing. */
export function presentationRouteTransitionMarkers(
  markers: TestRouteTransitionMarker[],
  campus: Campus,
  currentContext: TestRouteContext | undefined,
  continuationMarkers: TestRouteContinuationMarker[],
  destinationValue?: string,
): TestRouteTransitionMarker[] {
  const buildingDestination = destinationValue?.startsWith("building:");
  // Keep cross-floor circulation cues available if an upper-floor route still
  // has to descend, but never show an entrance continuation for a Building
  // destination whose semantic endpoint is already that Entrance.
  const withoutBuildingEntranceCue = buildingDestination
    ? markers.filter((marker) => marker.kind !== "entrance")
    : markers;
  if (!currentContext) return withoutBuildingEntranceCue;
  if (currentContext.kind === "outdoor"
    && continuationMarkers.some((marker) => marker.kind === "entrance")) {
    return withoutBuildingEntranceCue.filter((marker) => marker.kind !== "ramp" && marker.kind !== "stair");
  }
  const continuationPoints = continuationMarkers
    .map((marker) => marker.x !== undefined && marker.y !== undefined
      ? { x: marker.x, y: marker.y }
      : campus.navNodes?.find((node) => node.id === marker.nodeId))
    .filter((point): point is { x: number; y: number } => !!point);
  const continuationNodeIds = new Set(continuationMarkers.map((marker) => marker.nodeId));
  if (continuationPoints.length === 0) return withoutBuildingEntranceCue;
  return withoutBuildingEntranceCue.filter((marker) => {
    if (currentContext.kind === "floor" && marker.kind === "entrance") return false;
    if (marker.kind !== "ramp" && marker.kind !== "stair") return true;
    if (marker.targetNodeId && continuationNodeIds.has(marker.targetNodeId)) return false;
    return !continuationPoints.some((point) => samePoint(point, marker));
  });
}

/** Identify the cross-floor circulation method used by a calculated route.
 * This is presentation-only; the canonical route node sequence remains the
 * source of truth and no alternate graph is created. */
export function routeTransitionMethod(campus: Campus, nodeIds: string[]): "Stairs" | "Elevator" | null {
  const nodes = campus.navNodes ?? [];
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const from = nodes.find((node) => node.id === nodeIds[index]);
    const to = nodes.find((node) => node.id === nodeIds[index + 1]);
    if (!from || !to || sameRouteContext(contextForNode(from), contextForNode(to)) === true) continue;
    if (transitionKind(from, to) === "elevator") return "Elevator";
    if (transitionKind(from, to) === "stair") return "Stairs";
  }
  return null;
}

function entranceTransitionInstruction(campus: Campus, from: TestRouteContext, to: TestRouteContext): string | undefined {
  const buildingId = from.kind === "floor" ? from.buildingId : to.kind === "floor" ? to.buildingId : undefined;
  if (!buildingId) return undefined;
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingId);
  const label = building?.name?.trim() || building?.code?.trim() || "Building";
  if (from.kind === "floor" && to.kind === "outdoor") return `Exit ${label}`;
  if (from.kind === "outdoor" && to.kind === "floor") return `Enter ${label}`;
  return undefined;
}

function exteriorEmergencyStairInstruction(
  campus: Campus,
  stairNode: CampusNavNode,
  targetContext: TestRouteContext,
): string {
  const building = (campus.buildings ?? []).find((candidate) => candidate.id === stairNode.buildingId);
  const stair = building?.exteriorEmergencyStairs?.find((candidate) => candidate.id === stairNode.exteriorEmergencyStairId);
  const authoredLabel = stair?.label?.trim();
  const label = authoredLabel && /emergency\s+stair/i.test(authoredLabel)
    ? authoredLabel
    : "Exterior Emergency Stair";
  const ground = building?.floors?.find((floor) => floor.number === 1 || /ground/i.test(floor.label ?? ""));
  const destination = targetContext.kind === "outdoor" ? (ground?.label || "Ground") : routeContextDisplayLabel(campus, targetContext);
  return `Use ${label} to ${destination}`;
}

export function routeTransitionMarkers(
  nodeIds: string[],
  campus: Campus,
  currentContext?: TestRouteContext,
  destinationValue?: string,
  routeMode?: RouteMode,
  startValue?: string,
): TestRouteTransitionMarker[] {
  const nodes = campus.navNodes ?? [];
  const physicalIds = physicalRouteNodeIds(nodeIds, campus);
  const markers: TestRouteTransitionMarker[] = [];
  let skipThroughIndex = -1;
  for (let index = 0; index < physicalIds.length - 1; index += 1) {
    if (index <= skipThroughIndex) continue;
    const from = nodes.find((node) => node.id === physicalIds[index]);
    const to = nodes.find((node) => node.id === physicalIds[index + 1]);
    if (!from || !to) continue;
    const fromContext = contextForNode(from);
    const physicalToContext = contextForNode(to);
    if (sameRouteContext(fromContext, physicalToContext)) continue;
    const kind = transitionKind(from, to);
    // Reconciled Elevator transitions may be represented as adjacent served
    // stops in the canonical graph.  Keep that graph untouched, but present
    // one direct admin transition for the contiguous same-shaft portion of
    // the calculated route.  The target is still taken from the route node
    // sequence (never from quick-nav ordering).
    let chainStartIndex = index;
    let chainEndIndex = index + 1;
    const chainIdentity = kind === "elevator" ? from.transitionSharedId : undefined;
    if (kind === "elevator" && chainIdentity) {
      while (chainStartIndex > 0) {
        const previous = nodes.find((node) => node.id === physicalIds[chainStartIndex - 1]);
        const current = nodes.find((node) => node.id === physicalIds[chainStartIndex]);
        if (!previous || !current
          || previous.transitionSharedId !== chainIdentity
          || current.transitionSharedId !== chainIdentity
          || transitionKind(previous, current) !== "elevator"
          || sameRouteContext(contextForNode(previous), contextForNode(current))) break;
        chainStartIndex -= 1;
      }
      while (chainEndIndex < physicalIds.length - 1) {
        const current = nodes.find((node) => node.id === physicalIds[chainEndIndex]);
        const next = nodes.find((node) => node.id === physicalIds[chainEndIndex + 1]);
        if (!current || !next
          || current.transitionSharedId !== chainIdentity
          || next.transitionSharedId !== chainIdentity
          || transitionKind(current, next) !== "elevator"
          || sameRouteContext(contextForNode(current), contextForNode(next))) break;
        chainEndIndex += 1;
      }
    }
    const exteriorIdentity = routeMode === "emergency"
      && kind === "stair"
      && (from.exteriorEmergencyStairId || to.exteriorEmergencyStairId);
    if (exteriorIdentity) {
      const identity = from.exteriorEmergencyStairId || to.exteriorEmergencyStairId;
      while (chainStartIndex > 0) {
        const previous = nodes.find((node) => node.id === physicalIds[chainStartIndex - 1]);
        const current = nodes.find((node) => node.id === physicalIds[chainStartIndex]);
        if (!previous || !current
          || previous.exteriorEmergencyStairId !== identity
          || current.exteriorEmergencyStairId !== identity
          || transitionKind(previous, current) !== "stair"
          || sameRouteContext(contextForNode(previous), contextForNode(current))) break;
        chainStartIndex -= 1;
      }
      while (chainEndIndex < physicalIds.length - 1) {
        const current = nodes.find((node) => node.id === physicalIds[chainEndIndex]);
        const next = nodes.find((node) => node.id === physicalIds[chainEndIndex + 1]);
        if (!current || !next
          || current.exteriorEmergencyStairId !== identity
          || next.exteriorEmergencyStairId !== identity
          || transitionKind(current, next) !== "stair"
          || sameRouteContext(contextForNode(current), contextForNode(next))) break;
        chainEndIndex += 1;
      }
      // All intermediate floor-to-floor transitions belong to this one
      // physical Exterior Emergency Stair. They remain in the canonical route
      // graph, but the presentation exposes one actionable descent cue.
      skipThroughIndex = chainEndIndex - 1;
    }
    const chainStart = nodes.find((node) => node.id === physicalIds[chainStartIndex]) ?? from;
    const chainEnd = nodes.find((node) => node.id === physicalIds[chainEndIndex]) ?? to;
    const outgoingTargetContext = contextForNode(chainEnd);
    const incomingTargetContext = contextForNode(chainStart);
    // A transition icon means the route continues into another context.  When
    // the destination is the terminal node on the far side of this boundary,
    // the endpoint marker owns that location instead; showing both made a
    // Building destination look like an instruction to continue indoors.
    const destinationIsTerminal = chainEndIndex === physicalIds.length - 1;
    const destinationIsAccessPoint = destinationIsTerminal && Boolean(chainEnd.entranceId)
      && (destinationValue?.startsWith("building:") || destinationValue?.startsWith("entrance:"));
    // The terminal semantic endpoint owns its presentation on the destination
    // context. A Stair or Elevator selected as the destination therefore gets
    // the red endpoint pin there; the source context still keeps one actionable
    // transition cue so the admin can open that destination floor. A Building
    // destination is different: its route may still cross an indoor/outdoor
    // Entrance bridge on the way out. Preserve that real boundary cue instead
    // of letting the semantic Building endpoint hide it.
    const terminalCirculationDestination = destinationIsTerminal && (Boolean(chainEnd.stairId) || Boolean(chainEnd.elevatorId));
    // Keep the outgoing cue on the current Floor so an admin can move to the
    // Floor that owns a terminal Stair/Elevator destination. The destination
    // side is suppressed because its red endpoint marker owns that location.
    const hasEntranceContextBoundary = kind === "entrance" && !sameRouteContext(fromContext, physicalToContext);
    const buildingStartsAtThisBoundary = startValue?.startsWith("building:")
      && index === 0
      && kind === "entrance";
    const terminalAccessPointOwnsMarker = destinationIsAccessPoint && !hasEntranceContextBoundary;
    const suppressOutgoingMarker = terminalAccessPointOwnsMarker;
    const suppressIncomingMarker = terminalAccessPointOwnsMarker || terminalCirculationDestination || (destinationIsTerminal && Boolean(to.entranceId) && !hasEntranceContextBoundary);
    if (!suppressOutgoingMarker && !buildingStartsAtThisBoundary && (!currentContext || sameRouteContext(currentContext, fromContext))) {
      markers.push({
        id: `${from.id}->${to.id}:out`,
        x: from.x,
        y: from.y,
        kind,
        context: fromContext,
        targetContext: outgoingTargetContext,
        targetLabel: routeContextDisplayLabel(campus, outgoingTargetContext),
        direction: transitionDirection(campus, fromContext, outgoingTargetContext),
        targetNodeId: chainEnd.id,
        ...(kind === "entrance" ? { instruction: entranceTransitionInstruction(campus, fromContext, outgoingTargetContext) } : {}),
        ...(exteriorIdentity ? { instruction: exteriorEmergencyStairInstruction(campus, chainStart, outgoingTargetContext) } : {}),
        ...(index === 0 && kind === "stair" ? { endpointRole: "start" as const } : {}),
      });
    }
    if (!suppressIncomingMarker && !buildingStartsAtThisBoundary && (!currentContext || sameRouteContext(currentContext, physicalToContext))) {
      markers.push({
        id: `${from.id}->${to.id}:in`,
        x: to.x,
        y: to.y,
        kind,
        context: physicalToContext,
        targetContext: incomingTargetContext,
        targetLabel: routeContextDisplayLabel(campus, incomingTargetContext),
        direction: transitionDirection(campus, physicalToContext, incomingTargetContext),
        targetNodeId: chainStart.id,
        ...(kind === "entrance" ? { instruction: entranceTransitionInstruction(campus, physicalToContext, incomingTargetContext) } : {}),
        ...(exteriorIdentity ? { instruction: exteriorEmergencyStairInstruction(campus, chainStart, incomingTargetContext) } : {}),
      });
    }
  }
  return markers;
}

function routeEndpointMarkers(
  nodeIds: string[],
  campus: Campus,
  currentContext?: TestRouteContext,
  destinationValue?: string,
  routeMode: RouteMode = "standard",
): { x: number; y: number; kind: "start" | "destination" }[] {
  const nodes = campus.navNodes ?? [];
  const physicalIds = routeDisplayNodeIds(nodeIds, campus);
  if (physicalIds.length === 0) return [];
  // A Building picker value is a building-level destination, not an indoor
  // Room. Keep the marker anchored to the same canonical exterior Entrance
  // chosen by route resolution, even if the route was calculated while a
  // different context was mounted.
  const buildingDestinationId = routeMode !== "emergency" && destinationValue?.startsWith("building:")
    ? destinationValue.slice("building:".length)
    : undefined;
  const buildingDestinationNodeId = buildingDestinationId
    ? (() => {
      const building = (campus.buildings ?? []).find((candidate) => candidate.id === buildingDestinationId);
      const startNode = nodes.find((node) => node.id === physicalIds[0]);
      const directionRole: EntranceDirectionRole = startNode?.floorId ? "outbound" : "inbound";
      return building
        ? resolveBuildingRouteTerminalNodeId(campus, building, nodeIds, buildTestRouteEdges(campus), routeMode === "accessible", directionRole)
        : null;
    })()
    : null;
  const candidates = [
    { id: physicalIds[0], kind: "start" as const },
    { id: buildingDestinationNodeId ?? physicalIds[physicalIds.length - 1], kind: "destination" as const },
  ];
  return candidates.flatMap(({ id, kind }) => {
    const node = nodes.find((candidate) => candidate.id === id);
    const contextMatches = !currentContext || sameRouteContext(currentContext, contextForNode(node));
    const buildingDestinationVisible = kind === "destination" && !!buildingDestinationNodeId
      && currentContext?.kind === "outdoor";
    if (!node || (!contextMatches && !buildingDestinationVisible)) return [];
    return [{ x: node.x, y: node.y, kind }];
  });
}

function lastPointMatches(points: { x: number; y: number }[], target?: { x: number; y: number }): boolean {
  if (!target || points.length === 0) return false;
  const last = points[points.length - 1];
  return last.x === target.x && last.y === target.y;
}

function LocationPicker({
  label,
  value,
  options,
  onChange,
  onPickOnMap,
}: {
  label: string;
  value: string;
  options: OptionEntry[];
  onChange: (value: string) => void;
  onPickOnMap?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerScrollRef = useRef<HTMLDivElement | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const selected = options.find((option) => option.value === value);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter((option) => `${option.label} ${option.subtitle ?? ""} ${option.group} ${option.buildingLabel ?? ""} ${option.floorLabel ?? ""} ${option.kindLabel ?? ""}`.toLowerCase().includes(normalized))
    : options;
  const pickerBuildings = filtered.reduce<{ label: string; floors: { label: string; kinds: { label: string; items: OptionEntry[] }[] }[] }[]>((acc, option) => {
    const buildingLabel = option.buildingLabel ?? option.group;
    const floorLabel = option.floorLabel ?? "General";
    const kindLabel = option.kindLabel ?? option.group;
    let building = acc.find((candidate) => candidate.label === buildingLabel);
    if (!building) { building = { label: buildingLabel, floors: [] }; acc.push(building); }
    let floor = building.floors.find((candidate) => candidate.label === floorLabel);
    if (!floor) { floor = { label: floorLabel, kinds: [] }; building.floors.push(floor); }
    let kind = floor.kinds.find((candidate) => candidate.label === kindLabel);
    if (!kind) { kind = { label: kindLabel, items: [] }; floor.kinds.push(kind); }
    kind.items.push(option);
    return acc;
  }, []);

  const scrollPickerTarget = useCallback((target: HTMLElement | null) => {
    const container = pickerScrollRef.current;
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const margin = 6;
    let delta = 0;
    if (targetRect.top < containerRect.top + margin) delta = targetRect.top - containerRect.top - margin;
    else if (targetRect.bottom > containerRect.bottom - margin) delta = targetRect.bottom - containerRect.bottom + margin;
    if (!delta) return;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextTop = Math.max(0, Math.min(maxScroll, container.scrollTop + delta));
    const reduceMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      container.scrollTo({ top: nextTop, behavior: reduceMotion ? "auto" : "smooth" });
    } catch {
      // jsdom and older embedded browsers may not implement the options form.
      container.scrollTop = nextTop;
    }
  }, []);

  const groupOpen = useCallback((key: string, defaultOpen: boolean) => (
    normalized ? true : (openGroups[key] ?? defaultOpen)
  ), [normalized, openGroups]);

  const handleGroupToggle = useCallback((key: string, event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const element = event.currentTarget;
    if (!normalized) setOpenGroups((current) => ({ ...current, [key]: element.open }));
    if (element.open) {
      window.requestAnimationFrame(() => {
        scrollPickerTarget(element.querySelector<HTMLElement>("[data-picker-option]") ?? element);
      });
    }
  }, [normalized, scrollPickerTarget]);

  // Search filters on every keystroke and temporarily reveals only the
  // matching hierarchy.  The first matching option is kept inside the
  // picker viewport, without moving the surrounding page.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (normalized) scrollPickerTarget(pickerRef.current?.querySelector<HTMLElement>("[data-picker-option]") ?? null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filtered.length, normalized, open, pickerBuildings.length, scrollPickerTarget]);
  return (
    <div className="space-y-1.5 relative" ref={pickerRef}>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      {selected && !open ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => { setQuery(""); setOpen(true); }}
            className="min-w-0 flex-1 min-h-9 px-2.5 py-1.5 rounded-lg border border-primary/40 bg-primary/5 text-left hover:bg-primary/10 transition-colors"
          >
            <span className="block text-[11px] font-semibold text-foreground truncate">{selected.label}</span>
            {selected.subtitle && <span className="block text-[9px] text-muted-foreground truncate">{selected.subtitle}</span>}
          </button>
          {onPickOnMap && (
            <button type="button" onClick={onPickOnMap} className="h-9 px-2 rounded-lg border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex items-center gap-1" title={`Pick ${label.toLowerCase()} on map`}>
              <MapPin className="h-3 w-3" /> Pick on Map
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              autoFocus={open}
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
              placeholder="Search/select location…"
              className="w-full h-9 pl-7 pr-2 rounded-lg border border-border bg-input-background text-foreground text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {onPickOnMap && (
            <button type="button" onClick={onPickOnMap} className="h-9 px-2 rounded-lg border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 inline-flex items-center gap-1" title={`Pick ${label.toLowerCase()} on map`}>
              <MapPin className="h-3 w-3" /> Pick on Map
            </button>
          )}
        </div>
      )}
      {open && (
        <>
          <button type="button" aria-label="Close location list" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div ref={pickerScrollRef} className="absolute left-0 right-0 top-full mt-1 z-20 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl p-1">
            {pickerBuildings.length === 0 && <div className="px-2 py-3 text-[10px] text-muted-foreground">No matching locations</div>}
            {pickerBuildings.map((building) => {
              // Label-based hierarchy keys keep a user's manual collapse
              // state stable when a temporary search filter removes sibling
              // buildings/floors and then is cleared.
              const buildingKey = `building:${building.label}`;
              const buildingDefaultOpen = building.floors.some((floor) => floor.kinds.some((kind) => kind.items.some((option) => option.value === value)));
              return <details key={buildingKey} open={groupOpen(buildingKey, buildingDefaultOpen)} onToggle={(event) => handleGroupToggle(buildingKey, event)} className="rounded-md border border-border/60 mb-1" data-testid="route-picker-building-group" data-picker-group data-default-open={buildingDefaultOpen ? "true" : "false"}>
                <summary className="cursor-pointer px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground/80">{building.label} locations</summary>
                <div className="space-y-1 px-1 pb-1">
                  {building.floors.map((floor) => {
                    const floorKey = `${buildingKey}:floor:${floor.label}`;
                    const floorDefaultOpen = floor.kinds.some((kind) => kind.items.some((option) => option.value === value));
                    return <details key={floorKey} open={groupOpen(floorKey, floorDefaultOpen)} onToggle={(event) => handleGroupToggle(floorKey, event)} className="rounded-md bg-muted/20 px-1.5 py-1" data-testid="route-picker-floor-group" data-picker-group data-default-open={floorDefaultOpen ? "true" : "false"}>
                      <summary className="cursor-pointer px-1 py-0.5 text-[9px] font-bold text-muted-foreground">{floor.label}</summary>
                      <div className="space-y-0.5 pt-0.5">
                        {floor.kinds.map((kind) => {
                          const kindKey = `${floorKey}:kind:${kind.label}`;
                          const kindDefaultOpen = kind.items.some((option) => option.value === value);
                          return <details key={kindKey} open={groupOpen(kindKey, kindDefaultOpen)} onToggle={(event) => handleGroupToggle(kindKey, event)} data-testid="route-picker-kind-group" data-picker-group data-default-open={kindDefaultOpen ? "true" : "false"}>
                            <summary className="cursor-pointer px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-muted-foreground/70">Type · {kind.label} <span className="font-semibold normal-case">({kind.items.length})</span></summary>
                            <div>
                              {kind.items.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  data-picker-option
                                  onClick={() => { onChange(option.value); setQuery(""); setOpen(false); }}
                                  className={cn("w-full text-left px-2 py-1.5 rounded-md hover:bg-primary/10", option.value === value && "bg-primary/10")}
                                >
                                  <span className="block text-[11px] font-semibold text-foreground truncate">{option.label}</span>
                                  {option.subtitle && <span className="block text-[9px] text-muted-foreground truncate">{option.subtitle}</span>}
                                </button>
                              ))}
                            </div>
                          </details>;
                        })}
                      </div>
                    </details>;
                  })}
                </div>
              </details>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

const standardRoutePreferenceOptions: { value: StandardRoutePreference; label: string; description: string }[] = [
  { value: "best", label: "Best Route", description: "Fastest valid route" },
  { value: "stairs", label: "Prefer Stairs", description: "Use stairs if valid" },
  { value: "elevator", label: "Prefer Elevator", description: "Use elevator if valid" },
];

function standardRoutePreferenceLabel(value: StandardRoutePreference): string {
  return standardRoutePreferenceOptions.find((option) => option.value === value)?.label ?? "Best Route";
}

function RoutePreferencePopover({
  draftValue,
  onDraftChange,
  onCancel,
  onApply,
  placement = "below",
  anchorRect,
  avoidRightInset = 0,
}: {
  draftValue: StandardRoutePreference;
  onDraftChange: (value: StandardRoutePreference) => void;
  onCancel: () => void;
  onApply: () => void;
  placement?: "above" | "below";
  anchorRect?: { left: number; top: number; width: number; height: number } | null;
  avoidRightInset?: number;
}) {
  const content = (
    <div
      role="dialog"
      aria-label="Route preference options"
      data-testid="test-route-preference-popover"
      className={cn(
        "z-[100] w-56 rounded-lg border border-border bg-popover p-2 shadow-xl",
        anchorRect ? "fixed" : "absolute",
        !anchorRect && (placement === "above" ? "bottom-full mb-1 right-0" : "top-full mt-1 right-0"),
      )}
      style={anchorRect ? (() => {
        const width = 224;
        const height = 190;
        const margin = 8;
        const viewportWidth = typeof window === "undefined" ? width + margin * 2 : window.innerWidth;
        const viewportHeight = typeof window === "undefined" ? height + margin * 2 : window.innerHeight;
        const rightBoundary = Math.max(margin, viewportWidth - avoidRightInset - margin);
        const preferredLeft = anchorRect.left + anchorRect.width - width;
        const left = Math.min(
          Math.max(margin, anchorRect.left + width <= rightBoundary ? anchorRect.left : preferredLeft),
          Math.max(margin, rightBoundary - width),
        );
        const preferredTop = placement === "above"
          ? anchorRect.top - height - 4
          : anchorRect.top + anchorRect.height + 4;
        const top = preferredTop < margin || preferredTop + height > viewportHeight - margin
          ? (placement === "above" ? anchorRect.top + anchorRect.height + 4 : anchorRect.top - height - 4)
          : preferredTop;
        const clampedTop = Math.min(
          Math.max(margin, top),
          Math.max(margin, viewportHeight - height - margin),
        );
        return { left, top: clampedTop, maxHeight: Math.max(160, viewportHeight - margin * 2) };
      })() : undefined}
    >
      <div className="space-y-0.5">
        {standardRoutePreferenceOptions.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-primary/5",
              draftValue === option.value && "bg-primary/10",
            )}
          >
            <input
              type="radio"
              name="test-route-preference-draft"
              value={option.value}
              aria-label={option.label}
              checked={draftValue === option.value}
              onChange={() => onDraftChange(option.value)}
              className="mt-0.5 h-3.5 w-3.5 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold text-foreground">{option.label}</span>
              <span className="block text-[9px] leading-snug text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-end gap-1.5 border-t border-border/60 pt-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-md px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          className="h-7 rounded-md bg-primary px-2.5 text-[10px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Apply
        </button>
      </div>
    </div>
  );
  return anchorRect && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

function RoutePreferenceControl({
  value,
  draftValue,
  open,
  onOpen,
  onDraftChange,
  onCancel,
  onApply,
  compact = false,
  avoidRightInset = 0,
}: {
  value: StandardRoutePreference;
  draftValue: StandardRoutePreference;
  open: boolean;
  onOpen: () => void;
  onDraftChange: (value: StandardRoutePreference) => void;
  onCancel: () => void;
  onApply: () => void;
  compact?: boolean;
  avoidRightInset?: number;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const handleOpen = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    onOpen();
  }, [onOpen]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && triggerRef.current?.contains(target)) return;
      const popover = document.querySelector<HTMLElement>('[data-testid="test-route-preference-popover"]');
      if (target && popover?.contains(target)) return;
      onCancel();
    };
    const closeForViewportChange = () => onCancel();
    document.addEventListener("pointerdown", handleOutsidePointer);
    window.addEventListener("resize", closeForViewportChange);
    window.addEventListener("scroll", closeForViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      window.removeEventListener("resize", closeForViewportChange);
      window.removeEventListener("scroll", closeForViewportChange, true);
    };
  }, [onCancel, open]);
  return (
    <div data-testid="test-route-preference" className={cn("relative", compact ? "inline-flex" : "flex items-center justify-between gap-3")}>
      {!compact && <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Route Preference</span>}
      <button
        type="button"
        data-testid="test-route-preference-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Route preference: ${standardRoutePreferenceLabel(value)}`}
        title="Choose route preference"
        onClick={handleOpen}
        ref={triggerRef}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          compact && "h-7 px-2 text-[9px]",
        )}
      >
        {standardRoutePreferenceLabel(value)}
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <RoutePreferencePopover
          draftValue={draftValue}
          onDraftChange={onDraftChange}
          onCancel={onCancel}
          onApply={onApply}
          placement="below"
          anchorRect={anchorRect}
          avoidRightInset={avoidRightInset}
        />
      )}
    </div>
  );
}

export function TestNavigationPanel({
  campus,
  onHighlightRoute,
  onFocusNode,
  onRouteStartFocus,
  onPickOnMap,
  mapPickResult,
  onMapPickResultConsumed,
  currentBuildingId,
  currentFloorId,
  inspectorVisible = false,
  onCompactModeChange,
  onRouteTransitionCancel,
  onClose,
  currentContext,
}: TestNavigationPanelProps) {
  const { session: persistedSession, setSession: setRouteSession } = useTestRouteSession();
  const [startValue, setStartValue] = useState(persistedSession?.startValue ?? "");
  const [destValue, setDestValue] = useState(persistedSession?.destValue ?? "");
  const [emergencyDestinationValue, setEmergencyDestinationValue] = useState(persistedSession?.emergencyDestinationValue ?? "");
  const [emergencyDestinationLabel, setEmergencyDestinationLabel] = useState(persistedSession?.emergencyDestinationLabel ?? "");
  const [routeMode, setRouteMode] = useState<RouteMode>(persistedSession?.routeMode ?? "standard");
  const [routePreference, setRoutePreference] = useState<StandardRoutePreference>(persistedSession?.routePreference ?? "best");
  const [draftRoutePreference, setDraftRoutePreference] = useState<StandardRoutePreference>(persistedSession?.routePreference ?? "best");
  const [routePreferenceOpen, setRoutePreferenceOpen] = useState(false);
  const [result, setResult] = useState<GraphPath | null>(persistedSession?.result ?? null);
  const [error, setError] = useState<string | null>(persistedSession?.error ?? null);
  const [loading, setLoading] = useState(false);
  const [hasCalculatedRoute, setHasCalculatedRoute] = useState(persistedSession?.hasCalculatedRoute ?? false);
  const [manualCollapsed, setManualCollapsed] = useState(persistedSession?.manualCollapsed ?? false);
  const [manualExpanded, setManualExpanded] = useState(persistedSession?.manualExpanded ?? false);
  const [previewRoute, setPreviewRoute] = useState(persistedSession?.previewRoute ?? false);
  const [pendingFocus, setPendingFocus] = useState(persistedSession?.pendingFocus);
  // Emergency mode hides the point-to-point destination picker. Remember the
  // last distinct destination so returning to Standard/Accessible cannot
  // hydrate an empty (or same-as-start) endpoint and produce a misleading
  // "Already at destination" result.
  const lastDistinctDestinationRef = useRef(persistedSession?.destValue ?? "");
  const liveRouteEnabledRef = useRef(persistedSession?.liveRouteEnabled ?? false);
  // The responsive desktop/mobile variants both mount, but only explicit user
  // actions are allowed to write back to the page-level session. Hydration from
  // that session must never echo stale hidden-panel state into the active panel.
  const sessionInteractionRef = useRef(false);
  const markSessionInteraction = useCallback(() => {
    sessionInteractionRef.current = true;
  }, []);
  // Campus and Floor editors render desktop/mobile panel variants together.
  // Keep both views synchronized from the page-level session so a hidden
  // responsive variant can never overwrite the active route with stale form
  // state during a context switch or Clear action.
  useEffect(() => {
    if (!persistedSession) {
      setStartValue("");
      setDestValue("");
      setEmergencyDestinationValue("");
      setEmergencyDestinationLabel("");
      setRouteMode("standard");
      setRoutePreference("best");
      setDraftRoutePreference("best");
      setRoutePreferenceOpen(false);
      setResult(null);
      setError(null);
      setHasCalculatedRoute(false);
      setManualCollapsed(false);
      setManualExpanded(false);
      setPreviewRoute(false);
      setPendingFocus(undefined);
      liveRouteEnabledRef.current = false;
      lastDistinctDestinationRef.current = "";
      return;
    }
    setStartValue((value) => value === persistedSession.startValue ? value : persistedSession.startValue);
    setDestValue((value) => value === persistedSession.destValue ? value : persistedSession.destValue);
    setEmergencyDestinationValue((value) => value === (persistedSession.emergencyDestinationValue ?? "") ? value : (persistedSession.emergencyDestinationValue ?? ""));
    setEmergencyDestinationLabel((value) => value === (persistedSession.emergencyDestinationLabel ?? "") ? value : (persistedSession.emergencyDestinationLabel ?? ""));
    setRouteMode((value) => value === persistedSession.routeMode ? value : persistedSession.routeMode);
    const hydratedPreference = persistedSession.routeMode === "standard"
      ? (persistedSession.routePreference ?? "best")
      : "best";
    setRoutePreference((value) => value === hydratedPreference ? value : hydratedPreference);
    setResult((value) => value === persistedSession.result ? value : persistedSession.result);
    setError((value) => value === persistedSession.error ? value : persistedSession.error);
    setHasCalculatedRoute((value) => value === persistedSession.hasCalculatedRoute ? value : persistedSession.hasCalculatedRoute);
    setManualCollapsed((value) => value === persistedSession.manualCollapsed ? value : persistedSession.manualCollapsed);
    setManualExpanded((value) => value === persistedSession.manualExpanded ? value : persistedSession.manualExpanded);
    setPreviewRoute((value) => value === Boolean(persistedSession.previewRoute) ? value : Boolean(persistedSession.previewRoute));
    setPendingFocus((value) => value === persistedSession.pendingFocus ? value : persistedSession.pendingFocus);
    liveRouteEnabledRef.current = persistedSession.liveRouteEnabled;
  }, [persistedSession]);
  useEffect(() => {
    if (!routePreferenceOpen) setDraftRoutePreference(routePreference);
  }, [routePreference, routePreferenceOpen]);
  const graphRevisionRef = useRef<string | null>(null);
  const calculateRouteRef = useRef<((isLiveRecalculation?: boolean) => void) | null>(null);

  const buildings = campus.buildings ?? [];
  const routeCampus = useMemo(() => reconcileExteriorApproachNavigation(campus), [campus]);
  const nodes = routeCampus.navNodes ?? [];
  const edges = useMemo(() => buildTestRouteEdges(routeCampus), [routeCampus]);
  const routineGraph = useMemo(() => routineRouteGraph(routeCampus, nodes, edges, routeMode), [routeCampus, edges, nodes, routeMode]);
  const graphRevision = useMemo(() => JSON.stringify({
    nodes: nodes.map((node) => [node.id, node.x, node.y, node.floorId, node.buildingId, node.doorId, node.roomId]),
    edges: edges.map((edge) => [edge.id, edge.startNodeId, edge.endNodeId, edge.bidirectional, edge.closed, edge.accessible, edge.emergencySafe, edge.bendPoints ?? []]),
    rooms: buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) => (floor.rooms ?? []).map((room) => [room.id, room.accessDoorId, room.accessDoorIds ?? []]))),
    doors: buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) => (floor.doors ?? []).map((door) => [door.id, door.x, door.y, door.offset, door.width, door.wallId]))),
    walls: buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) => (floor.walls ?? []).map((wall) => [wall.id, wall.x1, wall.y1, wall.x2, wall.y2, wall.thickness]))),
    // Outdoor Building footprints are authoritative route obstacles. Include
    // their geometry in the live revision so moving a Building revalidates an
    // active route just like moving an indoor Wall or Walking Point does.
    buildingObstacles: buildings.map((building) => [building.id, building.x, building.y, building.width, building.height, building.rotation ?? 0]),
  }), [buildings, edges, nodes]);

  const prioritizeContext = useCallback((options: OptionEntry[]) => {
    if (!currentBuildingId && !currentFloorId) return options;
    const contextNodeIds = new Set(nodes.filter((node) =>
      (!currentBuildingId || node.buildingId === currentBuildingId)
      && (!currentFloorId || node.floorId === currentFloorId),
    ).map((node) => node.id));
    const score = (option: OptionEntry) => option.nodeHint && contextNodeIds.has(option.nodeHint) ? 0 : 1;
    return [...options].sort((a, b) => score(a) - score(b));
  }, [currentBuildingId, currentFloorId, nodes]);
  const startOptions = useMemo(() => prioritizeContext(buildStartOptions(campus, edges)), [campus, edges, prioritizeContext]);
  const destOptions = useMemo(() => prioritizeContext(buildDestinationOptions(campus, edges)), [campus, edges, prioritizeContext]);
  useEffect(() => {
    if (!destValue || destValue === startValue) return;
    if (destOptions.some((option) => option.value === destValue)) {
      lastDistinctDestinationRef.current = destValue;
    }
  }, [destOptions, destValue, startValue]);

  const canCalculate = startValue !== "" && (routeMode === "emergency" || destValue !== "") && !loading;
  // An active route is always represented by the small floating monitor.  It
  // must not depend on the Properties inspector: opening/closing an inspector
  // is an editing concern and should never make the route bar jump, resize, or
  // re-open the large setup form.  Manual Expand is the explicit opt-out.
  const compact = manualCollapsed || (hasCalculatedRoute && !manualExpanded);
  useEffect(() => {
    if (!sessionInteractionRef.current) return;
    sessionInteractionRef.current = false;
    setRouteSession({
      startValue,
      destValue,
      emergencyDestinationValue,
      emergencyDestinationLabel,
      routeMode,
      routePreference,
      result,
      error,
      hasCalculatedRoute,
      manualCollapsed,
      manualExpanded,
      liveRouteEnabled: liveRouteEnabledRef.current,
      previewRoute,
      pendingFocus,
    });
  }, [destValue, emergencyDestinationLabel, emergencyDestinationValue, error, hasCalculatedRoute, manualCollapsed, manualExpanded, pendingFocus, previewRoute, routeMode, routePreference, result, setRouteSession, startValue]);
  useEffect(() => {
    onCompactModeChange?.(compact);
  }, [compact, onCompactModeChange]);
  useEffect(() => {
    // Route sessions can outlive a responsive editor remount. Normalize a
    // legacy/stale Building result at hydration too, so an old Room route can
    // never reappear as an indoor destination leg after the picker now says
    // Building. This only trims the presentation/result object at the
    // resolved exterior terminal; it does not mutate the navigation graph.
    if (!result || !hasCalculatedRoute || routeMode === "emergency" || !destValue.startsWith("building:")) return;
    const buildingId = destValue.slice("building:".length);
    const building = buildings.find((candidate) => candidate.id === buildingId);
    if (!building) return;
    const routeEdges = routineGraph.edges;
    const firstRouteNode = routineGraph.nodes.find((node) => node.id === result?.nodeIds[0]);
    const destinationDirectionRole: EntranceDirectionRole = firstRouteNode?.floorId ? "outbound" : "inbound";
    const terminalId = resolveBuildingRouteTerminalNodeId(campus, building, result.nodeIds, routeEdges, routeMode === "accessible", destinationDirectionRole);
    if (!terminalId) return;
    // A pre-fix persisted session may contain only the old indoor Door/Room
    // tail and no exterior terminal at all. Do not publish that stale route to
    // the editor; force a clean calculation instead of showing an indoor leg
    // under a Building-only destination.
    if (!result.nodeIds.includes(terminalId)) {
      setResult(null);
      setHasCalculatedRoute(false);
      setPreviewRoute(false);
      onHighlightRoute(null);
      markSessionInteraction();
      return;
    }
    if (result.nodeIds.at(-1) === terminalId) return;
    const normalized = truncateGraphPathAtNode(result, terminalId, routineGraph.nodes, routeEdges);
    setResult(normalized);
    markSessionInteraction();
  }, [buildings, campus, destValue, hasCalculatedRoute, markSessionInteraction, onHighlightRoute, result, routeMode, routineGraph.edges, routineGraph.nodes]);
  const displaySteps = useMemo(() => result ? humanRouteSteps(routeCampus, result.nodeIds, destValue) : [], [destValue, result, routeCampus]);
  const displaySegments = useMemo(() => result ? routeSegments(routeCampus, result.nodeIds) : [], [result, routeCampus]);
  const routeMethod = useMemo(() => result && routeMode === "standard" ? routeTransitionMethod(routeCampus, result.nodeIds) : null, [result, routeCampus, routeMode]);
  useEffect(() => {
    if (!mapPickResult) return;
    markSessionInteraction();
    const setter = mapPickResult.kind === "start" ? setStartValue : setDestValue;
    setter(mapPickResult.value);
    setEmergencyDestinationValue("");
    setEmergencyDestinationLabel("");
    setError(null);
    setResult(null);
    setHasCalculatedRoute(false);
    setManualCollapsed(false);
    setManualExpanded(false);
    setPreviewRoute(false);
    setPendingFocus(undefined);
    liveRouteEnabledRef.current = false;
    onHighlightRoute(null);
    onMapPickResultConsumed?.();
  }, [mapPickResult, markSessionInteraction, onHighlightRoute, onMapPickResultConsumed]);

  const handleCalculate = useCallback((
    isLiveRecalculation = false,
    modeOverride?: RouteMode,
    endpointOverride?: { startValue: string; destValue: string },
    preferenceOverride?: StandardRoutePreference,
    focusStartOnSuccess = false,
  ) => {
    markSessionInteraction();
    onRouteTransitionCancel?.();
    setLoading(true);
    setError(null);
    setResult(null);
    onHighlightRoute(null);

    const activeRouteMode = modeOverride ?? routeMode;
    // Reverse Route can recalculate in the same event that swaps the two
    // selectors.  Use the explicit values supplied by that action instead of
    // waiting for React state to settle or re-resolving from a stale render.
    const activeStartValue = endpointOverride?.startValue ?? startValue;
    let activeDestValue = activeRouteMode === "emergency"
      ? ""
      : endpointOverride?.destValue ?? destValue;
    let activeEmergencyDestinationLabel = emergencyDestinationLabel;
    const accessibleOnly = activeRouteMode === "accessible";
    const emergencyMode = activeRouteMode === "emergency";
    const activeRoutePreference = activeRouteMode === "standard"
      ? (preferenceOverride ?? routePreference)
      : "best";
    const activeGraph = emergencyMode ? { nodes, edges } : routineGraph;
    const activeEdges = activeGraph.edges;
    const activeNodes = activeGraph.nodes;
    // A Building selected as the start is an outbound semantic endpoint: the
    // route leaves through an Exit Only/Both door. A Building destination is
    // resolved separately below using the inbound/outbound role implied by
    // the other endpoint.
    const startDirectionRole: EntranceDirectionRole = activeStartValue.startsWith("building:") ? "outbound" : "any";
    const startReadiness = endpointReadinessMessage(activeStartValue, campus, activeEdges, "starting", accessibleOnly, emergencyMode, startDirectionRole);
    // Keep a selected Room resolvable even when its local edge is currently
    // closed.  The closed edge must produce No Route below, not erase the
    // semantic endpoint and fall back to endpoint-selection copy.
    const resolveRouteEndpoint = (value: string, directionRole: EntranceDirectionRole = "any"): string | null => {
      const [type, id] = value.split(":");
      if (!emergencyMode && type === "building") {
        const building = buildings.find((candidate) => candidate.id === id);
        if (building) {
          return resolveBuildingEntranceNodeId(campus, building, activeEdges, accessibleOnly, false, directionRole);
        }
      }
      return resolveNodeId(value, campus, activeEdges, accessibleOnly, emergencyMode);
    };
    const startBuildingCandidateIds = !emergencyMode && activeStartValue.startsWith("building:")
      ? (() => {
        const building = buildings.find((candidate) => candidate.id === activeStartValue.slice("building:".length));
        return building ? resolveBuildingEntranceNodeIds(campus, building, activeEdges, accessibleOnly, false, startDirectionRole) : [];
      })()
      : [];
    let fromId = startBuildingCandidateIds[0] ?? resolveRouteEndpoint(activeStartValue, startDirectionRole);
    const fromNodeForDirection = fromId ? activeNodes.find((node) => node.id === fromId) : undefined;
    const destinationDirectionRole: EntranceDirectionRole = activeDestValue.startsWith("building:")
      ? (fromNodeForDirection?.floorId ? "outbound" : "inbound")
      : "any";
    const destinationReadiness = emergencyMode
      ? null
      : endpointReadinessMessage(activeDestValue, campus, activeEdges, "destination", accessibleOnly, emergencyMode, destinationDirectionRole);
    const destinationBuildingCandidateIds = !emergencyMode && activeDestValue.startsWith("building:")
      ? (() => {
        const building = buildings.find((candidate) => candidate.id === activeDestValue.slice("building:".length));
        return building ? resolveBuildingEntranceNodeIds(campus, building, activeEdges, accessibleOnly, false, destinationDirectionRole) : [];
      })()
      : [];
    let toId = emergencyMode ? null : destinationBuildingCandidateIds[0] ?? resolveRouteEndpoint(activeDestValue, destinationDirectionRole);
    // A directly selected emergency-only node is still a valid Emergency
    // endpoint, but it must not leak back into routine searches through the
    // generic `node:<id>` picker value.
    if (!emergencyMode && fromId && !activeNodes.some((node) => node.id === fromId)) fromId = null;
    if (!emergencyMode && toId && !activeNodes.some((node) => node.id === toId)) toId = null;
    if (!fromId && !startReadiness && activeStartValue.startsWith("room:")) {
      const [, buildingId, roomId] = activeStartValue.split(":");
      fromId = roomRouteInfo(campus, buildingId, roomId, activeEdges, true)?.roomNode.id ?? null;
    }
    if (!toId && !destinationReadiness && activeDestValue.startsWith("room:")) {
      const [, buildingId, roomId] = activeDestValue.split(":");
      toId = roomRouteInfo(campus, buildingId, roomId, activeEdges, true)?.roomNode.id ?? null;
    }

    if (startReadiness || !fromId) {
      setError(startReadiness ?? "The selected starting location is not ready for routing.");
      setHasCalculatedRoute(false);
      setLoading(false);
      return;
    }
    let emergencyPath: GraphPath | null = null;
    if (emergencyMode) {
      // Prefer a reachable designated Emergency Exit or complete Exterior
      // Emergency Stair. Only when every designated egress is unreachable do
      // we consider a safe General Entrance fallback.
      const selected = chooseEmergencyDestinationCandidate(campus, edges, fromId);
      if (!selected) {
        setError(NO_EMERGENCY_ROUTE_ERROR);
        setEmergencyDestinationValue("");
        setEmergencyDestinationLabel("");
        setHasCalculatedRoute(false);
        setLoading(false);
        return;
      }
      activeDestValue = selected.candidate.value;
      toId = selected.candidate.nodeId;
      activeEmergencyDestinationLabel = selected.candidate.label;
      setEmergencyDestinationValue(activeDestValue);
      setEmergencyDestinationLabel(activeEmergencyDestinationLabel);
      // The chosen egress path is authoritative (an exterior stair route must
      // descend its own landing chain and cross its Ground discharge).  Do not
      // re-run the free search below, which could re-resolve the same outdoor
      // destination through a cheaper unrelated outdoor route.
      emergencyPath = selected.path;
    }
    if (destinationReadiness || !toId) {
      setError(destinationReadiness ?? "The selected destination is not ready for routing.");
      setHasCalculatedRoute(false);
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
      setError(startReadiness ?? "The starting point has no navigation connection. Connect it to the walking network first.");
      setHasCalculatedRoute(false);
      setLoading(false);
      return;
    }
    if (!toExists) {
      setError(destinationReadiness ?? "The destination has no navigation connection. Assign a walking point or link it to the network.");
      setHasCalculatedRoute(false);
      setLoading(false);
      return;
    }

    const routeColor = routeColorForMode(activeRouteMode);
    const fromNode = nodes.find((node) => node.id === fromId);
    const toNode = nodes.find((node) => node.id === toId);
    // A selected Elevator remains the authoritative cross-floor endpoint. If
    // it has an authored shaft identity, keep unrelated Elevator transitions
    // out of this search so geometry cannot silently substitute a nearby lift.
    // Apply this even when the destination is on the same Floor: a route must
    // never leave the selected Floor through another Elevator and then appear
    // to have started at that nearby lift.
    const selectedElevatorSharedIds = [fromNode, toNode]
      .filter((node) => node?.elevatorId && node.transitionSharedId)
      .map((node) => node!.transitionSharedId as string);
    const routeOptions = {
      ...(activeRoutePreference !== "best" ? { transitionPreference: activeRoutePreference } : {}),
      ...(selectedElevatorSharedIds.length > 0 ? { preferredElevatorSharedIds: [...new Set(selectedElevatorSharedIds)] } : {}),
    };
    const routeSearchNodes = emergencyMode ? emergencySearchNodes(nodes, fromId) : activeNodes;
    let path = emergencyPath;
    if (!emergencyPath) {
      const startCandidates = startBuildingCandidateIds.length > 0 ? startBuildingCandidateIds : [fromId];
      const destinationCandidates = destinationBuildingCandidateIds.length > 0 ? destinationBuildingCandidateIds : [toId];
      let selectedCandidate: { fromId: string; toId: string; path: GraphPath; preferredExterior: boolean } | null = null;
      for (const candidateFromId of startCandidates) {
        for (const candidateToId of destinationCandidates) {
          if (candidateFromId === candidateToId) continue;
          const candidatePath = findNavigationRoute(routeSearchNodes, activeEdges, candidateFromId, candidateToId, accessibleOnly, emergencyMode, routeOptions);
          if (!candidatePath) continue;
          const preferredExterior = activeRouteMode === "standard"
            && activeRoutePreference === "stairs"
            && candidatePath.nodeIds.some((id) => {
              const node = activeNodes.find((item) => item.id === id);
              return node?.derivedOwnerType === "entrance_steps";
            });
          if (!selectedCandidate
            || Number(preferredExterior) > Number(selectedCandidate.preferredExterior)
            || (preferredExterior === selectedCandidate.preferredExterior && candidatePath.distanceM < selectedCandidate.path.distanceM)) {
            selectedCandidate = { fromId: candidateFromId, toId: candidateToId, path: candidatePath, preferredExterior };
          }
        }
      }
      if (selectedCandidate) {
        fromId = selectedCandidate.fromId;
        toId = selectedCandidate.toId;
        path = selectedCandidate.path;
      }
    }
    // A designated Emergency Exit is preferred for a semantic Building
    // destination, but that preference must not strand a route when the first
    // ready exit is unreachable from this particular starting location. Try
    // other ready Emergency Exits first, then safe General Access candidates;
    // A* and all graph costs remain unchanged.
    if (!path && emergencyMode && activeDestValue.startsWith("building:")) {
      const [, destinationBuildingId] = activeDestValue.split(":");
      const destinationBuilding = buildings.find((building) => building.id === destinationBuildingId);
      const fallbackCandidates = (destinationBuilding?.entrances ?? []).flatMap((entrance) => {
        const type = normalizeEntranceType(entrance.type);
        if (type !== "emergency_exit" && type !== "general") return [];
        const candidate = nodes.find((node) => node.buildingId === destinationBuilding?.id
          && node.entranceId === entrance.id
          && !node.floorId);
        if (!candidate || !usableEmergencyOutdoorConnection(nodes, edges, destinationBuilding!.id, entrance.id)) return [];
        if (type === "emergency_exit") {
          const status = emergencyExitReadiness(campus, destinationBuilding!, entrance, edges);
          if (!status.ready) return [];
        }
        return [{ candidate, priority: type === "emergency_exit" ? 0 : 1 }];
      });
      fallbackCandidates.sort((left, right) => left.priority - right.priority);
      for (const { candidate } of fallbackCandidates) {
        if (candidate.id === toId) continue;
        const fallbackPath = findNavigationRoute(routeSearchNodes, activeEdges, fromId, candidate.id, accessibleOnly, emergencyMode);
        if (!fallbackPath) continue;
        toId = candidate.id;
        path = fallbackPath;
        break;
      }
    }

    // A Building picker value is an explicit building-level intent: the
    // selected exterior Entrance is the terminal, never the linked Door or
    // indoor floor graph.  Keep this invariant at the route-result boundary
    // as well as endpoint resolution so a stale/legacy route session cannot
    // append a destination-building indoor tail after the correct outdoor
    // endpoint has been reached.
    if (path && !emergencyMode && activeDestValue.startsWith("building:") && toId) {
      path = truncateGraphPathAtNode(path, toId, activeNodes, activeEdges);
    }

    if (!path) {
      // An explicit Calculate establishes an active Test Route session even
      // when no path exists, so the user gets the same compact No Route
      // monitor instead of a tall error card. Live recalculation keeps that
      // compact session armed while the graph is temporarily blocked.
      if (!isLiveRecalculation || liveRouteEnabledRef.current) setHasCalculatedRoute(true);
      setPreviewRoute(false);
      setPendingFocus(undefined);
      const fromNode = nodes.find(n => n.id === fromId);
      const toNode = nodes.find(n => n.id === toId);

      // Once both semantic endpoints resolve, a failed search is a global
      // route failure regardless of whether the contexts match. Keep this
      // classification ahead of the legacy endpoint guidance branches below.
      if (fromNode && toNode) {
        if (accessibleOnly) {
          const accessibleEdges = activeEdges.filter(e => e.accessible);
          setError(accessibleEdges.length === 0
            ? NO_ACCESSIBLE_ROUTE_ERROR
            : NO_ACCESSIBLE_ROUTE_ERROR);
        } else if (emergencyMode) {
          setError(NO_EMERGENCY_ROUTE_ERROR);
        } else {
          setError(NO_ROUTE_ERROR);
        }
        setLoading(false);
        return;
      }

      // Endpoint readiness was resolved above. Once both semantic endpoints
      // resolve to graph nodes on the same floor, a failed search is a route
      // failure (wall/closure/direction/disconnection), never a false Room
      // readiness warning.
      if (!accessibleOnly && !emergencyMode && fromNode && toNode && fromNode.floorId === toNode.floorId) {
        setError(NO_ROUTE_ERROR);
      } else if (toNode && !activeEdges.some(e => e.startNodeId === toId || e.endNodeId === toId)) {
        setError("Destination is disconnected — it has no walking paths. Use Connect to link it.");
      } else if (fromNode && !activeEdges.some(e => e.startNodeId === fromId || e.endNodeId === fromId)) {
        setError("Starting point is disconnected — it has no walking paths. Use Connect to link it.");
      } else if (accessibleOnly) {
        const accessibleEdges = activeEdges.filter(e => e.accessible);
        if (accessibleEdges.length === 0) {
          setError(NO_ACCESSIBLE_ROUTE_ERROR);
        } else {
          setError(NO_ACCESSIBLE_ROUTE_ERROR);
        }
      } else if (emergencyMode) {
        setError(NO_EMERGENCY_ROUTE_ERROR);
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
    const displayEdges = activeEdges.filter((edge) =>
      !edge.closed
      && (!accessibleOnly || edge.accessible)
      && (!emergencyMode || edge.emergencySafe !== false)
    );
    const projectedDisplayEdges = emergencyMode
      ? displayEdges
      : outdoorRouteProjectionEdges(routeCampus, displayEdges, path.nodeIds, currentContext);
    const displayNodeFragments = collapseOutdoorHandoffFragments(
      visibleContextRouteNodeFragments(path.nodeIds, routeCampus, currentContext),
      routeCampus,
      projectedDisplayEdges,
      currentContext,
      path.nodeIds,
    );
    const displayNodeIds = displayNodeFragments.flat();
    const displayGeometry = exteriorRouteDisplayGeometry(routeCampus, displayNodeIds, projectedDisplayEdges, nodes, currentContext);
    const displayWaypointFragments = displayNodeFragments
      .flatMap((fragment) => buildRoutePolylineFragments(fragment, displayGeometry.edges, displayGeometry.nodes));
    const displayWaypoints = displayWaypointFragments.flat();
    // Keep the existing focus behavior on the physical Door connector. The
    // display polyline itself includes the semantic Room endpoint, so focus
    // and geometry can serve their distinct purposes without a jump.
    const physicalStartId = physicalRouteNodeIds(path.nodeIds, routeCampus)[0] ?? fromId;
    const physicalStart = nodes.find((node) => node.id === physicalStartId);
    const focusRequest = !isLiveRecalculation && physicalStart && (modeOverride === undefined || focusStartOnSuccess)
      ? { nodeId: physicalStart.id, context: contextForNode(physicalStart) }
      : pendingFocus;
    const semanticEndpoints = currentContext?.floorId
      ? ([
        { kind: "start" as const, room: roomSemanticEndpoint(campus, activeStartValue, currentContext.floorId) },
        { kind: "destination" as const, room: roomSemanticEndpoint(campus, activeDestValue, currentContext.floorId) },
      ].filter((endpoint) => endpoint.room).map((endpoint) => ({ ...endpoint.room!, kind: endpoint.kind })))
      : undefined;
    setResult(path);
    setHasCalculatedRoute(true);
    // Live recalculation begins only after a successful explicit Calculate.
    // Once enabled, a temporary blocked edit keeps the live mode armed so a
    // later edit can restore the route without another button press.
    liveRouteEnabledRef.current = true;
    setPendingFocus(focusRequest);
    // Persist the successful result before any start-context focus callback can
    // unmount this editor (for example Outdoor -> Floor). The normal effect
    // below will reconcile the same state after React renders, but the page
    // session is already safe for the context switch.
    setRouteSession({
      startValue: activeStartValue,
      destValue: activeRouteMode === "emergency" ? destValue : activeDestValue,
      routeMode: activeRouteMode,
      routePreference: activeRoutePreference,
      emergencyDestinationValue: emergencyMode ? activeDestValue : emergencyDestinationValue,
      emergencyDestinationLabel: activeEmergencyDestinationLabel,
      result: path,
      error: null,
      hasCalculatedRoute: true,
      manualCollapsed,
      manualExpanded,
      liveRouteEnabled: true,
      previewRoute,
      pendingFocus: focusRequest,
    });
    const continuationMarkers = routeContinuationMarkers(routeCampus, path.nodeIds, activeRouteMode, currentContext, activeDestValue, activeStartValue);
    onHighlightRoute({
      waypoints: displayWaypoints,
      waypointFragments: displayWaypointFragments,
      color: routeColor,
      routeNodeIds: displayNodeIds,
      semanticEndpoints,
      endpointMarkers: routeEndpointMarkers(path.nodeIds, routeCampus, currentContext, activeDestValue, activeRouteMode),
      transitionMarkers: presentationRouteTransitionMarkers(
        routeTransitionMarkers(path.nodeIds, routeCampus, currentContext, activeDestValue, activeRouteMode, activeStartValue),
        routeCampus,
        currentContext,
        continuationMarkers,
        activeDestValue,
      ),
      continuationMarkers,
    });
    if (!isLiveRecalculation && (modeOverride === undefined || focusStartOnSuccess)) {
      if (physicalStart) {
        const focus = () => {
          if (onRouteStartFocus) onRouteStartFocus(physicalStart.id, contextForNode(physicalStart));
          else onFocusNode(physicalStart.id);
        };
        // Let the result/session render commit before changing editor context.
        if (onRouteStartFocus) window.setTimeout(focus, 0);
        else focus();
      }
    }
    setLoading(false);
  }, [startValue, destValue, emergencyDestinationLabel, emergencyDestinationValue, routeMode, routePreference, nodes, edges, routineGraph, campus, routeCampus, currentContext, manualCollapsed, manualExpanded, markSessionInteraction, onHighlightRoute, onFocusNode, onRouteStartFocus, onRouteTransitionCancel, pendingFocus, previewRoute, setRouteSession]);

  calculateRouteRef.current = handleCalculate;
    useEffect(() => {
     if (!result || !hasCalculatedRoute) return;
     const routeColor = routeColorForMode(routeMode);
      // Apply the same Building-only terminal invariant before publishing a
      // hydrated route highlight. This prevents one stale render from
      // painting the destination-building indoor tail while the normalization
      // effect above clears/trims the persisted result.
      let highlightResult = result;
      if (routeMode !== "emergency" && destValue.startsWith("building:")) {
        const buildingId = destValue.slice("building:".length);
        const building = buildings.find((candidate) => candidate.id === buildingId);
        const firstRouteNode = routineGraph.nodes.find((node) => node.id === result?.nodeIds[0]);
        const destinationDirectionRole: EntranceDirectionRole = firstRouteNode?.floorId ? "outbound" : "inbound";
        const terminalId = building
          ? resolveBuildingRouteTerminalNodeId(campus, building, result.nodeIds, routineGraph.edges, routeMode === "accessible", destinationDirectionRole)
          : null;
        if (!terminalId || !result.nodeIds.includes(terminalId)) {
          onHighlightRoute(null);
          return;
        }
        highlightResult = truncateGraphPathAtNode(result, terminalId, routineGraph.nodes, routineGraph.edges);
      }
       const displayEdges = (routeMode === "emergency" ? edges : routineGraph.edges).filter((edge) =>
         !edge.closed
         && (routeMode !== "accessible" || edge.accessible)
         && (routeMode !== "emergency" || edge.emergencySafe !== false)
       );
       const projectedDisplayEdges = routeMode === "emergency"
         ? displayEdges
         : outdoorRouteProjectionEdges(routeCampus, displayEdges, highlightResult.nodeIds, currentContext);
       const displayNodeFragments = collapseOutdoorHandoffFragments(
         visibleContextRouteNodeFragments(highlightResult.nodeIds, routeCampus, currentContext),
         routeCampus,
         projectedDisplayEdges,
         currentContext,
         highlightResult.nodeIds,
       );
       const displayNodeIds = displayNodeFragments.flat();
       const displayGeometry = exteriorRouteDisplayGeometry(routeCampus, displayNodeIds, projectedDisplayEdges, nodes, currentContext);
     const semanticEndpoints = currentContext?.floorId
      ? ([
        { kind: "start" as const, room: roomSemanticEndpoint(campus, startValue, currentContext.floorId) },
        { kind: "destination" as const, room: roomSemanticEndpoint(campus, destValue, currentContext.floorId) },
      ].filter((endpoint) => endpoint.room).map((endpoint) => ({ ...endpoint.room!, kind: endpoint.kind })))
      : undefined;
      const displayWaypointFragments = displayNodeFragments
        .flatMap((fragment) => buildRoutePolylineFragments(fragment, displayGeometry.edges, displayGeometry.nodes));
       const continuationMarkers = routeContinuationMarkers(routeCampus, highlightResult.nodeIds, routeMode, currentContext, destValue, startValue);
      onHighlightRoute({
      waypoints: displayWaypointFragments.flat(),
      waypointFragments: displayWaypointFragments,
      color: routeColor,
      routeNodeIds: displayNodeIds,
       semanticEndpoints,
       endpointMarkers: routeEndpointMarkers(highlightResult.nodeIds, routeCampus, currentContext, routeMode === "emergency" ? emergencyDestinationValue : destValue, routeMode),
       transitionMarkers: presentationRouteTransitionMarkers(
         routeTransitionMarkers(highlightResult.nodeIds, routeCampus, currentContext, routeMode === "emergency" ? emergencyDestinationValue : destValue, routeMode, startValue),
         routeCampus,
         currentContext,
         continuationMarkers,
         destValue,
       ),
       continuationMarkers,
     });
   }, [buildings, campus, currentContext, destValue, emergencyDestinationValue, edges, hasCalculatedRoute, nodes, onHighlightRoute, result, routeCampus, routeMode, routineGraph.edges, routineGraph.nodes, startValue]);
  useEffect(() => {
    const previousRevision = graphRevisionRef.current;
    graphRevisionRef.current = graphRevision;
    if (previousRevision === null || previousRevision === graphRevision || !liveRouteEnabledRef.current) return;
    // Keep canonical validation debounced, but short enough that a dragged
    // junction feels attached to the live route preview.
    const timer = window.setTimeout(() => calculateRouteRef.current?.(true), 70);
    return () => window.clearTimeout(timer);
  }, [graphRevision]);

  const clear = useCallback(() => {
    onRouteTransitionCancel?.();
    setResult(null);
    setError(null);
    setHasCalculatedRoute(false);
    setManualCollapsed(false);
    setManualExpanded(false);
    setPreviewRoute(false);
    setPendingFocus(undefined);
    setEmergencyDestinationValue("");
    setEmergencyDestinationLabel("");
    liveRouteEnabledRef.current = false;
    onHighlightRoute(null);
    sessionInteractionRef.current = false;
    setRouteSession(null);
  }, [onHighlightRoute, onRouteTransitionCancel, setRouteSession]);

  const routeModeOptions: { key: RouteMode; label: string; tip: string }[] = [
    { key: "standard" as const, label: "Standard", tip: "Normal walking route" },
    { key: "accessible" as const, label: "Accessible", tip: "Avoid inaccessible paths" },
    { key: "emergency" as const, label: "Emergency", tip: "Use emergency-safe routes" },
  ];
  const handleRouteModeChange = useCallback((nextMode: RouteMode) => {
    markSessionInteraction();
    setEmergencyDestinationValue("");
    setEmergencyDestinationLabel("");
    if (nextMode !== "standard") {
      // Standard preferences are deliberately transient to Standard mode.
      // Leaving it resets the applied and draft values so a later return
      // cannot silently reuse a hidden Stairs/Elevator preference.
      setRoutePreference("best");
      setDraftRoutePreference("best");
      setRoutePreferenceOpen(false);
    }
    setRouteMode(nextMode);
    const needsPointToPointDestination = nextMode !== "emergency"
      && (!destValue || destValue === startValue);
    const rememberedDestination = lastDistinctDestinationRef.current;
    const replacementDestination = needsPointToPointDestination
      ? (rememberedDestination && rememberedDestination !== startValue && destOptions.some((option) => option.value === rememberedDestination)
        ? rememberedDestination
        : destOptions.find((option) => option.value !== startValue)?.value ?? "")
      : destValue;
    if (replacementDestination !== destValue) setDestValue(replacementDestination);
    // Once the admin has entered an active route session, changing mode is an
    // explicit request to recalculate. The existing endpoints and compact
    // presentation are retained even when the new mode has no route.
    const endpointsReady = !!startValue && (nextMode === "emergency" || (!!replacementDestination && replacementDestination !== startValue));
    if (hasCalculatedRoute && endpointsReady) {
      handleCalculate(false, nextMode, { startValue, destValue: replacementDestination }, undefined, true);
    } else if (hasCalculatedRoute) {
      // Emergency is start-only. If there is no destination to carry into a
      // point-to-point mode, drop the old evacuation result instead of showing
      // a stale route under the new mode.
      setResult(null);
      setError(null);
      setHasCalculatedRoute(false);
      setManualCollapsed(false);
      setManualExpanded(false);
      setPreviewRoute(false);
      setPendingFocus(undefined);
      liveRouteEnabledRef.current = false;
      onHighlightRoute(null);
    }
  }, [destOptions, destValue, handleCalculate, hasCalculatedRoute, markSessionInteraction, onHighlightRoute, startValue]);
  const openRoutePreference = useCallback(() => {
    setDraftRoutePreference(routePreference);
    setRoutePreferenceOpen(true);
  }, [routePreference]);
  const cancelRoutePreference = useCallback(() => {
    setDraftRoutePreference(routePreference);
    setRoutePreferenceOpen(false);
  }, [routePreference]);
  const applyRoutePreference = useCallback(() => {
    markSessionInteraction();
    const nextPreference = draftRoutePreference;
    setRoutePreferenceOpen(false);
    if (nextPreference === routePreference) return;
    setRoutePreference(nextPreference);
    if (hasCalculatedRoute && startValue && destValue) {
      handleCalculate(false, "standard", undefined, nextPreference);
    }
  }, [destValue, draftRoutePreference, handleCalculate, hasCalculatedRoute, markSessionInteraction, routePreference, startValue]);
  const handleMinimize = useCallback(() => {
    markSessionInteraction();
    cancelRoutePreference();
    setManualCollapsed(true);
    setManualExpanded(false);
  }, [cancelRoutePreference, markSessionInteraction]);
  const handleExpand = useCallback(() => {
    markSessionInteraction();
    cancelRoutePreference();
    setManualExpanded(true);
    setManualCollapsed(false);
  }, [cancelRoutePreference, markSessionInteraction]);
  const layoutOwnerKey = [
    inspectorVisible ? "properties-open" : "properties-closed",
    currentBuildingId ?? "",
    currentFloorId ?? "",
    currentContext?.kind ?? "",
    currentContext?.buildingId ?? "",
    currentContext?.floorId ?? "",
    compact ? "compact" : "full",
  ].join("|");
  const previousLayoutOwnerKeyRef = useRef(layoutOwnerKey);
  useEffect(() => {
    if (previousLayoutOwnerKeyRef.current === layoutOwnerKey) return;
    previousLayoutOwnerKeyRef.current = layoutOwnerKey;
    if (routePreferenceOpen) cancelRoutePreference();
  }, [cancelRoutePreference, layoutOwnerKey, routePreferenceOpen]);
  const preferenceAvoidRightInset = inspectorVisible ? 268 : 0;
  const handleReverseRoute = useCallback(() => {
    if (!startValue && !destValue) return;
    const nextStartValue = destValue;
    const nextDestValue = startValue;
    const shouldRecalculate = hasCalculatedRoute && Boolean(startValue && destValue);
    markSessionInteraction();
    setStartValue(nextStartValue);
    setDestValue(nextDestValue);
    setError(null);
    setPendingFocus(undefined);
    setPreviewRoute(false);
    if (shouldRecalculate) {
      // Keep the existing route/session machinery, but pass the swapped
      // endpoint values explicitly so this click cannot calculate with the
      // pre-swap closure values.
      handleCalculate(false, undefined, { startValue: nextStartValue, destValue: nextDestValue });
      return;
    }
    onRouteTransitionCancel?.();
    setResult(null);
    setHasCalculatedRoute(false);
    liveRouteEnabledRef.current = false;
    onHighlightRoute(null);
  }, [destValue, handleCalculate, hasCalculatedRoute, markSessionInteraction, onHighlightRoute, onRouteTransitionCancel, startValue]);
  const togglePreviewRoute = useCallback(() => {
    if (!result) return;
    markSessionInteraction();
    setPreviewRoute((value) => !value);
  }, [markSessionInteraction, result]);

  if (compact) {
    const startOption = startOptions.find((option) => option.value === startValue);
    const destinationOption = destOptions.find((option) => option.value === destValue);
    const startLabel = compactRouteLocationLabel(startOption, "Start");
    const destinationLabel = routeMode === "emergency"
      ? (emergencyDestinationLabel || "Safest exit")
      : compactRouteLocationLabel(destinationOption, "Destination");
    const fullLocationName = (option: OptionEntry | undefined, fallback: string) =>
      option ? `${option.label}${option.subtitle ? ` · ${option.subtitle}` : ""}` : fallback;
    const fullStartLabel = fullLocationName(startOption, "Start");
    const fullDestinationLabel = routeMode === "emergency"
      ? (emergencyDestinationLabel || "Safest exit")
      : fullLocationName(destinationOption, "Destination");
    const modeLabel = routeModeOptions.find((option) => option.key === routeMode)?.label ?? "Standard";
    const statusLabel = result ? "Route Found" : routeMode === "standard" ? "No Route" : `No ${modeLabel} Route`;
    const StatusIcon = result ? CheckCircle2 : routeMode === "accessible" ? Accessibility : routeMode === "emergency" ? ShieldAlert : AlertTriangle;
    const routeSummary = (
      <div className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-foreground">
        <CompactRouteEndpointLabel testId="test-route-start-summary" displayLabel={startLabel} fullLabel={fullStartLabel} />
        <span aria-hidden="true" className="shrink-0 px-1 text-muted-foreground">→</span>
        <CompactRouteEndpointLabel testId="test-route-destination-summary" displayLabel={destinationLabel} fullLabel={fullDestinationLabel} />
      </div>
    );
    const modeButtons = (
      <div data-testid="test-route-mode-group" className="flex shrink-0 items-center gap-1">
        {routeModeOptions.map((option) => {
          const ModeIcon = option.key === "standard" ? Footprints : option.key === "accessible" ? Accessibility : ShieldAlert;
          const active = routeMode === option.key;
          const activeStyle = option.key === "standard"
            ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/20"
               : option.key === "accessible"
               ? "border-teal-500/50 bg-teal-500/10 text-teal-700 ring-1 ring-teal-500/20"
              : "border-red-500/50 bg-red-500/10 text-red-600 ring-1 ring-red-500/20";
          return (
            <button
              key={option.key}
              type="button"
              aria-label={`Use ${option.label} route mode`}
              aria-pressed={active}
              title={`${option.label} Route`}
              onClick={() => handleRouteModeChange(option.key)}
              className={cn(
                "h-7 w-7 rounded-md border flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active ? activeStyle : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <ModeIcon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>
    );
    const actionButtons = (
      <div data-testid="test-route-action-group" className="flex shrink-0 items-center gap-1 border-l border-border/60 pl-1">
        {routeMode !== "emergency" && (
          <button
            type="button"
            data-testid="test-route-reverse"
            aria-label="Reverse route"
            title="Reverse route"
            disabled={!startValue || !destValue}
            onClick={handleReverseRoute}
            className={cn(
              "h-6 w-6 rounded-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "text-muted-foreground hover:text-foreground hover:bg-muted",
              (!startValue || !destValue) && "cursor-not-allowed opacity-40",
            )}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          data-testid="test-route-compact-preview-toggle"
          aria-label={previewRoute ? "Exit Route Preview" : "Preview Route"}
          aria-pressed={previewRoute}
          title={previewRoute ? "Exit Route Preview" : "Preview Route"}
          disabled={!result}
          onClick={togglePreviewRoute}
          className={cn(
            "h-6 w-6 rounded-md flex items-center justify-center transition-colors",
            previewRoute ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-muted-foreground hover:text-foreground hover:bg-muted",
            !result && "cursor-not-allowed opacity-40",
          )}
        >
          {previewRoute ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Expand Test Route"
          title="Expand Test Route"
          onClick={handleExpand}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={clear} aria-label="Clear route" title="Clear route" className="h-6 rounded-md px-1.5 text-[9px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          Clear
        </button>
        {onClose && (
          <button onClick={onClose} aria-label="Close" title="Close Test Route" className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
    const compactPreferenceControl = routeMode === "standard" ? (
      <div data-testid="test-route-compact-preference-row" className="relative flex justify-end px-2.5 pb-1.5 pt-1.5 transition-opacity duration-150 motion-reduce:transition-none">
        <RoutePreferenceControl
          value={routePreference}
          draftValue={draftRoutePreference}
          open={routePreferenceOpen}
          onOpen={openRoutePreference}
          onDraftChange={setDraftRoutePreference}
          onCancel={cancelRoutePreference}
          onApply={applyRoutePreference}
          avoidRightInset={preferenceAvoidRightInset}
          compact
        />
      </div>
    ) : null;
    return (
      <div data-testid="test-route-compact-group" className="w-full overflow-visible">
        <div
          data-testid="test-route-compact"
          data-layout="horizontal-monitor"
          data-route-state={result ? "found" : "no-route"}
          className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-xl border border-border bg-card px-2.5 shadow-xl", result ? "min-h-[42px] py-1" : "min-h-[54px] py-1")}
        >
        <div className="flex min-w-0 items-center gap-1.5 overflow-visible">
          <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", result ? routeMode === "accessible" ? "text-teal-600" : routeMode === "emergency" ? "text-red-500" : "text-green-500" : routeMode === "accessible" ? "text-teal-600" : routeMode === "emergency" ? "text-red-500" : "text-destructive")} />
          <div className="min-w-0 flex-1 overflow-hidden leading-tight">
            {result ? (
            <>
            <div className="flex min-w-0 items-center gap-1.5">
               <span className={cn("shrink-0 text-[10px] font-extrabold", result ? routeMode === "accessible" ? "text-teal-700 dark:text-teal-300" : routeMode === "emergency" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400" : "text-destructive")}>
                {statusLabel}
              </span>
              {result && <span data-testid="test-route-time-summary" className="shrink-0 text-[9px] text-muted-foreground"><strong>{result.minutes} min</strong></span>}
            </div>
            {routeSummary}
            </>
            ) : (
              <div className="space-y-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-[10px] font-extrabold text-destructive">{statusLabel}</span>
                  {routeSummary}
                </div>
                <div
                  className="text-[9px] leading-snug text-muted-foreground"
                  title={routeMode === "accessible" ? NO_ACCESSIBLE_ROUTE_HELP : routeMode === "emergency" ? NO_EMERGENCY_ROUTE_HELP : "Check paths, closures, direction, mode, or obstacles."}
                >
                  {routeMode === "accessible" ? NO_ACCESSIBLE_ROUTE_HELP : routeMode === "emergency" ? NO_EMERGENCY_ROUTE_HELP : "Check paths, closures, direction, mode, or obstacles."}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {modeButtons}
          {actionButtons}
        </div>
        </div>
        {compactPreferenceControl}
      </div>
    );
  }

  return (
    <div data-testid="test-route-full" className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border shrink-0">
        <Route className="h-4 w-4 text-blue-500" />
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Test Route</span>
        <button
          type="button"
          aria-label="Collapse Test Route"
          title="Collapse Test Route"
          onClick={handleMinimize}
          className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Intro */}
      <div className="px-4 py-2.5 border-b border-border/50 shrink-0">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {routeMode === "emergency"
            ? "Choose a starting location to find a safe evacuation route."
            : "Choose a start and destination to verify the walking network."}
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* START */}
        <LocationPicker
          label="Start"
          value={startValue}
          options={startOptions}
          onChange={(value) => { markSessionInteraction(); setStartValue(value); setEmergencyDestinationValue(""); setEmergencyDestinationLabel(""); setError(null); setResult(null); setHasCalculatedRoute(false); setManualCollapsed(false); setManualExpanded(false); setPreviewRoute(false); setPendingFocus(undefined); liveRouteEnabledRef.current = false; onHighlightRoute(null); }}
          onPickOnMap={onPickOnMap ? () => onPickOnMap("start") : undefined}
        />

        {routeMode !== "emergency" && (
          <div className="flex justify-center -my-2">
            <button
              type="button"
              data-testid="test-route-reverse"
              aria-label="Reverse route"
              title="Reverse route"
              disabled={!startValue || !destValue}
              onClick={handleReverseRoute}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-[10px] font-bold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                "hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                (!startValue || !destValue) && "cursor-not-allowed opacity-40",
              )}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Reverse
            </button>
          </div>
        )}

        {/* DESTINATION */}
        {routeMode === "emergency" ? (
          <div data-testid="test-route-emergency-destination" className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Destination</label>
            <div className="rounded-lg border border-red-200 bg-red-50/60 px-2.5 py-2 dark:border-red-800/40 dark:bg-red-950/20">
              <div className="text-[11px] font-semibold text-red-700 dark:text-red-300">Safest available exit</div>
              <div className="mt-0.5 text-[9px] leading-snug text-red-700/75 dark:text-red-300/75">
                Selected automatically from emergency-safe routes.
              </div>
            </div>
          </div>
        ) : (
          <LocationPicker
            label="Destination"
            value={destValue}
            options={destOptions}
            onChange={(value) => { markSessionInteraction(); setDestValue(value); setEmergencyDestinationValue(""); setEmergencyDestinationLabel(""); setError(null); setResult(null); setHasCalculatedRoute(false); setManualCollapsed(false); setManualExpanded(false); setPreviewRoute(false); setPendingFocus(undefined); liveRouteEnabledRef.current = false; onHighlightRoute(null); }}
            onPickOnMap={onPickOnMap ? () => onPickOnMap("destination") : undefined}
          />
        )}

        {/* ROUTE MODE */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Route Mode</label>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-border bg-muted/30">
            {routeModeOptions.map((m) => (
              <button
                key={m.key}
                title={m.tip}
                onClick={() => handleRouteModeChange(m.key)}
                className={cn(
                  "h-8 rounded-md text-[11px] font-bold transition-all",
                  routeMode === m.key
                    ? m.key === "emergency" ? "bg-red-500 text-white shadow-sm"
                    : m.key === "accessible" ? "bg-teal-600 text-white shadow-sm"
                    : "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >{m.label}</button>
            ))}
          </div>
        </div>

        {routeMode === "standard" && (
          <RoutePreferenceControl
            value={routePreference}
            draftValue={draftRoutePreference}
            open={routePreferenceOpen}
            onOpen={openRoutePreference}
            onDraftChange={setDraftRoutePreference}
            onCancel={cancelRoutePreference}
            onApply={applyRoutePreference}
            avoidRightInset={preferenceAvoidRightInset}
          />
        )}

        {/* CALCULATE */}
        <button
          onClick={() => handleCalculate()}
          disabled={!canCalculate}
          title={canCalculate ? undefined : routeMode === "emergency" ? "Choose a starting location first." : "Choose a start and destination first."}
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

        <button
          type="button"
          data-testid="test-route-preview-toggle"
          aria-pressed={previewRoute}
          disabled={!result}
          onClick={togglePreviewRoute}
          title={previewRoute ? "Show editing controls" : "Hide navigation editing controls"}
          className={cn(
            "w-full h-8 rounded-lg border text-[10px] font-bold transition-all flex items-center justify-center gap-1.5",
            previewRoute
              ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            !result && "cursor-not-allowed opacity-50",
          )}
        >
          {previewRoute ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {previewRoute ? "Exit Preview" : "Preview Route"}
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
            <div>
              <span className="text-[11px] font-semibold text-destructive leading-relaxed">{error}</span>
              {error === NO_ROUTE_ERROR && (
                <p className="mt-0.5 text-[10px] text-destructive/75 leading-relaxed">Check Walking Paths, closures, direction, or obstacles.</p>
              )}
              {error === NO_ACCESSIBLE_ROUTE_ERROR && (
                <p className="mt-0.5 text-[10px] text-destructive/75 leading-relaxed">{NO_ACCESSIBLE_ROUTE_HELP}</p>
              )}
              {error === NO_EMERGENCY_ROUTE_ERROR && (
                <p className="mt-0.5 text-[10px] text-destructive/75 leading-relaxed">{NO_EMERGENCY_ROUTE_HELP}</p>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className={cn(
            "space-y-2 px-3 py-2.5 rounded-lg border",
            routeMode === "emergency"
              ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700/20"
              : routeMode === "accessible"
                ? "bg-teal-50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-700/20"
                : "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/20"
          )}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={cn("h-3.5 w-3.5",
                routeMode === "emergency" ? "text-red-500" : routeMode === "accessible" ? "text-teal-600" : "text-green-500"
              )} />
              <span className={cn("text-[11px] font-bold",
                routeMode === "emergency" ? "text-red-600 dark:text-red-400" : routeMode === "accessible" ? "text-teal-700 dark:text-teal-300" : "text-green-600 dark:text-green-400"
              )}>
                {routeMode === "emergency" ? "Emergency Route" : routeMode === "accessible" ? "Accessible Route" : "Route Found"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span><strong>{result.minutes} min</strong> estimated walk</span>
              {routeMethod && <><span className="opacity-50">·</span><span data-testid="test-route-transition-method"><strong>Via {routeMethod}</strong></span></>}
            </div>
            {routeMode === "emergency" && emergencyDestinationLabel && (
              <div data-testid="test-route-emergency-exit" className="border-t border-current/10 pt-1.5 text-[10px] text-red-700 dark:text-red-300">
                <span className="font-bold uppercase tracking-wide">Safe exit</span>
                <span className="ml-1.5">{emergencyDestinationLabel}</span>
              </div>
            )}
            {displaySteps.length > 0 && (
              <div className="space-y-0.5 pt-1.5 border-t border-current/10">
                {displaySteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <ArrowRight className="h-2.5 w-2.5 text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-[10px] text-muted-foreground leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            )}
            {displaySegments.length > 1 && (
              <div className="space-y-1 pt-1.5 border-t border-current/10">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Route stages</span>
                {displaySegments.map((segment, index) => (
                  <div key={`${segment.context}-${index}`} className="text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{index + 1}. {segment.context}</span>
                    <span className="block pl-3">{segment.from} → {segment.to}</span>
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
