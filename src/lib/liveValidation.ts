/**
 * B7 Phase 1 — Shared live-issue derivation.
 *
 * Both editors (CampusEditor global Issues and FloorEditor per-floor Issues)
 * must show the SAME logical issues for the SAME campus draft. This module is
 * the single canonical source: it runs the campus validators once and exposes
 *
 *  1. `computeLiveValidationIssues(campus, overlaps?)` — the full live issue
 *     list (campus + navigation graph), deduplicated. This is exactly what the
 *     Campus Editor's global Issues control shows.
 *  2. `validationIssuesForFloor(campus, floorId)` — the subset of the same
 *     list that applies to ONE floor (resolved target is floor-scoped and
 *     matches the floor id). Used by the Floor Editor so its Issues panel is
 *     the canonical list filtered to the current floor — never a second,
 *     independent validator.
 *  3. `mergeFloorIssueLists(local, campus, blockedEdgeIds?)` — merges the
 *     FloorEditor-local live checks (floor geometry, stair direction, door/
 *     entrance relationship, blocked nav edges) with the canonical floor
 *     issues without duplicating the same logical issue twice.
 */

import type { Campus, FloorSelection } from "../components/map-builder/types";
import type { ValidationIssue } from "../components/map-builder/ValidationErrorsDialog";
import type { FloorIssue } from "./floorGeometry";
import { validateCampusData } from "./campusValidation";
import { validateNavigationGraph } from "./validateNavigationGraph";
import { dedupeValidationIssues, issueKey, resolveIssueTarget, floorSelectionForTarget } from "./issueLocate";

/**
 * Legacy campus-issue severity mapping for issue types produced without an
 * explicit severity. Validator-attached severities (e.g. B7 duplicate_room_name
 * warnings) always win.
 */
function legacySeverity(type: string): "error" | "warning" | "info" {
  if (type === "overlap" || type === "boundary" || type === "missing_campus_name") return "error";
  if (type === "multiple_primary_entrances") return "error";
  if (type === "missing_name" || type === "missing_code" || type === "no_floors") return "warning";
  if (type === "no_building_entrance" || type === "no_primary_entrance") return "warning";
  return "info";
}

/**
 * THE canonical live issue list for a campus draft — the same list the Campus
 * Editor's global Issues control shows. `overlaps` is the editor's live
 * overlap set when available; when omitted the overlap is derived from the
 * building geometry (identical derivation).
 */
export function computeLiveValidationIssues(campus: Campus, overlaps?: Set<string>): ValidationIssue[] {
  const errs = validateCampusData(campus, overlaps);
  const campusIssues = errs.map((e) => ({
    ...e,
    severity: (e.severity ?? legacySeverity(e.type)) as "error" | "warning" | "info",
  }));
  const navResult = validateNavigationGraph(campus);
  return dedupeValidationIssues([...campusIssues, ...navResult.issues]);
}

/**
 * The canonical issues that apply to ONE floor: every issue whose resolved
 * locate target is floor-scoped and matches `floorId`. Issues belonging to
 * another floor (or to the campus canvas) are excluded.
 */
export function validationIssuesForFloor(campus: Campus, floorId: string): ValidationIssue[] {
  return computeLiveValidationIssues(campus).filter((issue) => {
    const target = resolveIssueTarget(issue);
    return target?.scope === "floor" && target.floorId === floorId;
  });
}

/**
 * The canonical issues that target ONE campus object (building, entrance, nav
 * node or nav edge). Used by the Campus Editor's Properties panel so selecting
 * an object with a live marker explains exactly what is wrong with it — the
 * SAME canonical list the global Issues control and on-canvas markers use.
 */
export function validationIssuesForCampusSelection(
  issues: ValidationIssue[],
  selectionType: "building" | "entrance" | "navNode" | "navEdge",
  id: string,
): ValidationIssue[] {
  return issues.filter((issue) => {
    const target = resolveIssueTarget(issue);
    return target?.scope === "campus" && target.selectionType === selectionType && target.id === id;
  });
}

/**
 * The floor issues (canonical + floor-local live checks) that target ONE floor
 * object selection. Used by the Floor Editor's Properties panels so the
 * selected object's contextual guidance matches the Issues panel + markers.
 */
export function floorIssuesForSelection(floorIssues: FloorIssue[], selection: FloorSelection): FloorIssue[] {
  return floorIssues.filter(
    (issue) => issue.selection?.type === selection.type && issue.selection?.id === selection.id,
  );
}

/**
 * Convert a canonical ValidationIssue into the FloorIssue row the Floor
 * Editor's Issues panel renders. The row keeps the canonical message and
 * severity and derives a clickable FloorSelection from the structured target.
 */
export function validationIssueToFloorIssue(issue: ValidationIssue): FloorIssue | null {
  const selection = floorSelectionForTarget(resolveIssueTarget(issue));
  return {
    id: `campus:${issueKey(issue)}`,
    severity: issue.severity,
    message: issue.message,
    selection: selection ?? undefined,
  };
}

/**
 * Merge FloorEditor-local live issues with the canonical floor issues.
 *
 * - Local issues keep first-seen order (they are the editor's most specific
 *   live checks).
 * - Canonical issues are appended unless the same logical issue already
 *   exists (deduped by severity + selection + stable id, so a canonical row
 *   and a local row that describe the same object problem never stack).
 * - `locallyTrackedBlockedEdgeIds`: the editor already renders blocked nav
 *   edges as dedicated local rows; canonical `nav_edge_blocked_by_obstacle`
 *   rows for those exact edges are dropped so the same warning never appears
 *   twice in one panel.
 */
export function mergeFloorIssueLists(
  localIssues: FloorIssue[],
  campusIssues: ValidationIssue[],
  locallyTrackedBlockedEdgeIds?: Set<string>,
): FloorIssue[] {
  const seen = new Set<string>();
  const out: FloorIssue[] = [];
  const push = (issue: FloorIssue) => {
    const selection = issue.selection ? `${issue.selection.type}|${issue.selection.id}` : "";
    const key = `${issue.severity}|${selection}|${issue.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(issue);
  };
  for (const issue of localIssues) push(issue);
  for (const issue of campusIssues) {
    if (
      issue.type === "nav_edge_blocked_by_obstacle" &&
      issue.edgeId &&
      locallyTrackedBlockedEdgeIds?.has(issue.edgeId)
    ) {
      // The editor's exact blocked-edge model already renders this row.
      continue;
    }
    const row = validationIssueToFloorIssue(issue);
    if (row) push(row);
  }
  return out;
}
