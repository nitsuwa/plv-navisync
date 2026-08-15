/**
 * B5 Final — Issue live-ness + locate helpers.
 *
 * Pure, framework-free helpers that keep the Issues system consistent:
 *
 *  1. `issueKey` / `dedupeValidationIssues` — stable identity + dedupe so a
 *     re-validated issue list never shows the same logical issue twice.
 *  2. `resolveIssueTarget` — turns a ValidationIssue into a structured
 *     IssueTarget, preferring the validator-attached `target` and falling back
 *     to the flat fields (buildingId/floorId/nodeId/edgeId/roomId) so legacy
 *     issue producers still locate correctly.
 *
 * These are unit-tested in src/lib/__tests__/issueLocate.test.ts.
 */

import type { ValidationIssue, IssueTarget } from "../components/map-builder/ValidationErrorsDialog";
import type { FloorSelection, Campus, NavigationNode } from "../components/map-builder/types";

// ── Dedup ──────────────────────────────────────────────────────────────────

/**
 * Stable identity for one logical issue. Two issues are the same logical
 * problem when their type and all of their location/reference fields match —
 * so repeated validation runs (or a validator that fires the same check for
 * multiple walls on one edge) collapse into a single row.
 */
export function issueKey(issue: ValidationIssue): string {
  const t = issue.target;
  return [
    issue.type,
    issue.severity,
    issue.buildingId ?? "",
    issue.floorId ?? "",
    issue.roomId ?? "",
    issue.nodeId ?? "",
    issue.edgeId ?? "",
    t ? `${t.scope}|${t.mode}|${t.selectionType}|${t.id}|${t.buildingId ?? ""}|${t.floorId ?? ""}` : "",
  ].join("::");
}

/**
 * Dedupe a validation result while preserving first-seen order. The first
 * occurrence wins; identical duplicates are dropped.
 */
export function dedupeValidationIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = issueKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

// ── Locate target resolution ───────────────────────────────────────────────

/** The campus-level selection type for an IssueTarget.selectionType. */
export type CampusSelectionType =
  | "navNode"
  | "navEdge"
  | "entrance"
  | "building"
  | "path"
  | "decorAsset"
  | "marker"
  | "groundArea";

/** Is this selection type handled on the outdoor campus canvas? */
export function isCampusSelectionType(type: IssueTarget["selectionType"]): type is CampusSelectionType {
  return (
    type === "navNode" ||
    type === "navEdge" ||
    type === "entrance" ||
    type === "building" ||
    type === "path" ||
    type === "decorAsset" ||
    type === "marker" ||
    type === "groundArea"
  );
}

/**
 * Resolve the structured locate target for an issue.
 *
 * Prefers the validator-attached `target`; otherwise derives one from the
 * flat fields so every locatable issue still navigates correctly even if a
 * future validator forgets to attach metadata.
 */
export function resolveIssueTarget(issue: ValidationIssue): IssueTarget | null {
  if (issue.target) return issue.target;

  // Building-scoped issue → campus scope, select the building.
  if (issue.buildingId && !issue.floorId) {
    if (issue.nodeId) {
      return {
        scope: "campus",
        mode: "navigation",
        buildingId: issue.buildingId,
        selectionType: "navNode",
        id: issue.nodeId,
      };
    }
    return {
      scope: "campus",
      mode: "design",
      buildingId: issue.buildingId,
      selectionType: "building",
      id: issue.buildingId,
    };
  }

  // Node-specific issue.
  if (issue.nodeId) {
    return {
      scope: issue.floorId ? "floor" : "campus",
      mode: "navigation",
      buildingId: issue.buildingId,
      floorId: issue.floorId,
      selectionType: "navNode",
      id: issue.nodeId,
    };
  }

  // Edge-specific issue.
  if (issue.edgeId) {
    return {
      scope: issue.floorId ? "floor" : "campus",
      mode: "navigation",
      buildingId: issue.buildingId,
      floorId: issue.floorId,
      selectionType: "navEdge",
      id: issue.edgeId,
    };
  }

  // Room-specific issue.
  if (issue.roomId) {
    return {
      scope: issue.floorId ? "floor" : "campus",
      mode: "design",
      buildingId: issue.buildingId,
      floorId: issue.floorId,
      selectionType: "room",
      id: issue.roomId,
    };
  }

  return null;
}

// ── Locate target validation against the CURRENT campus ───────────────────
//
// B5 Final correction: issue locate must NEVER navigate into a building/floor
// that no longer exists (the "Floor unavailable" browser failure). The resolver
// below checks the structured target against the live `campus` before the
// editor decides where to go, and degrades gracefully when the reference is
// stale.

/** Result of resolving an issue's locate action against the current campus. */
export type IssueLocateResolution =
  /** The building + floor exist right now — safe to open the Floor Editor. */
  | { kind: "floor"; target: IssueTarget }
  /** Campus-scope target (outdoor building / navNode / navEdge / entrance…). */
  | { kind: "campus"; target: IssueTarget }
  /**
   * The target points at a deleted floor/building, but the referenced nav
   * node still exists on the campus arrays with usable coordinates — select
   * it in Campus Navigation and warn instead of opening a dead floor.
   */
  | { kind: "staleNavNode"; target: IssueTarget; node: NavigationNode }
  /** No spatial target can be derived — show a toast, never navigate. */
  | { kind: "unlocatable"; target: IssueTarget | null };

/**
 * Resolve an issue's locate action against the CURRENT campus.
 *
 * 1. Derives the structured target (attached metadata or flat-field fallback).
 * 2. Campus scope → locatable in place.
 * 3. Floor scope → verifies the building AND the floor actually exist in the
 *    current campus before allowing the Floor Editor hop. When the building or
 *    floor is gone but the referenced nav node survives with usable
 *    coordinates, the node is returned as a `staleNavNode` fallback so the
 *    editor can still surface the broken reference for repair — it never
 *    fabricates a route to a deleted floor.
 * 4. Nothing usable → `unlocatable`.
 */
export function resolveIssueLocateTarget(
  issue: ValidationIssue,
  campus: Campus,
): IssueLocateResolution {
  const target = resolveIssueTarget(issue);
  if (!target) return { kind: "unlocatable", target: null };
  if (target.scope === "campus") return { kind: "campus", target };

  const building = campus.buildings.find((b) => b.id === target.buildingId);
  const floorExists = !!building?.floors.some((f) => f.id === target.floorId);
  if (building && floorExists) return { kind: "floor", target };

  // Building/floor gone. If the issue names a nav node that still exists with
  // usable coordinates, hand it back so the editor can select it + warn.
  const nodeId = target.selectionType === "navNode" ? target.id : issue.nodeId;
  const node = nodeId
    ? (campus.navNodes ?? []).find((n) => n.id === nodeId)
    : undefined;
  if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
    return { kind: "staleNavNode", target, node };
  }
  return { kind: "unlocatable", target };
}

/**
 * Convert a floor-scoped target into the FloorSelection the Floor Editor
 * understands (used with onOpenFloor's initialSelection).
 */
export function floorSelectionForTarget(target: IssueTarget): FloorSelection | null {
  if (target.scope !== "floor") return null;
  switch (target.selectionType) {
    case "navNode":
      return { type: "navNode", id: target.id };
    case "navEdge":
      return { type: "navEdge", id: target.id };
    case "room":
      return { type: "room", id: target.id };
    case "door":
      return { type: "door", id: target.id };
    case "stairs":
      return { type: "stairs", id: target.id };
    case "elevator":
      return { type: "elevator", id: target.id };
    case "ramp":
      return { type: "ramp", id: target.id };
    case "wall":
      return { type: "wall", id: target.id };
    case "window":
      return { type: "window", id: target.id };
    case "furniture":
      return { type: "furniture", id: target.id };
    case "label":
      return { type: "label", id: target.id };
    case "path":
      return { type: "path", id: target.id };
    default:
      return null;
  }
}
