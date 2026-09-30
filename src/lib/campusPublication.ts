import type { Campus } from "../components/map-builder/types";
import type { ValidationIssue } from "../components/map-builder/ValidationErrorsDialog";
import { computeLiveValidationIssues } from "./liveValidation";

/** One publication gate shared by the Admin review UI and the persistence boundary. */
export function validateCampusForPublish(campus: Campus): {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const issues = computeLiveValidationIssues(campus);
  const visibleBuildings = (campus.buildings ?? []).filter((building) => building.visible !== false);

  if (visibleBuildings.length === 0) {
    issues.push({
      type: "publish_readiness",
      severity: "error",
      message: "Add at least one student-visible building before publishing.",
    });
  } else {
    const hasNamedRoom = visibleBuildings.some((building) =>
      (building.floors ?? []).some((floor) =>
        (floor.rooms ?? []).some((room) => room.visible !== false && room.name.trim().length > 0),
      ),
    );
    if (!hasNamedRoom) {
      issues.push({
        type: "publish_readiness",
        severity: "error",
        message: "Add at least one named room to a visible building before publishing.",
      });
    }
  }

  if (!Number.isFinite(campus.canvasW) || campus.canvasW < 320 || !Number.isFinite(campus.canvasH) || campus.canvasH < 240) {
    issues.push({
      type: "publish_readiness",
      severity: "error",
      message: "Set a valid campus map canvas before publishing.",
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, issues, errors, warnings };
}
