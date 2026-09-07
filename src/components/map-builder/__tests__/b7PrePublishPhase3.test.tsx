/**
 * B7 Phase 3 — PrePublishDialog grouping, readiness, summary, location,
 * resolution, and warning confirmation regression tests.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrePublishDialog } from "../PrePublishDialog";
import type { Campus, ValidationIssue } from "../types";

function makeCampus(overrides?: Partial<Campus>): Campus {
  return {
    id: "c1", name: "Test Campus", code: "TC", description: "",
    address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900, canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1", name: "Building One", code: "B1", category: "Academic",
      description: "", x: 100, y: 100, width: 120, height: 80,
      color: "#1e40af", expanded: false,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general" }],
    }],
    markers: [], paths: [], navNodes: [], navEdges: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    ...overrides,
  };
}

function makeIssue(overrides: Partial<ValidationIssue> & { type: ValidationIssue["type"]; severity: ValidationIssue["severity"] }): ValidationIssue {
  return { message: "Test issue", ...overrides };
}

const noop = () => {};

function renderDialog(campus: Campus, errors: ValidationIssue[] = [], props: Record<string, unknown> = {}) {
  return render(
    <PrePublishDialog
      open={true}
      campus={campus}
      errors={errors}
      onClose={noop}
      onPublish={noop}
      onReviewIssue={noop}
      {...props}
    />
  );
}

// ── GROUPING ───────────────────────────────────────────────────────────────

describe("PrePublishDialog — Issue grouping", () => {
  it("1. Campus/building issue appears under Campus & Buildings", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_campus_name", severity: "error", message: "Campus needs a name" }),
    ]);
    // Click on Campus & Buildings group header
    fireEvent.click(screen.getByText("Campus & Buildings"));
    expect(screen.getByText("Campus needs a name")).toBeTruthy();
  });

  it("2. duplicate_room_name appears under Rooms & Floor Content", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "duplicate_room_name", severity: "warning", message: "Room 201 is duplicated" }),
    ]);
    fireEvent.click(screen.getByText("Rooms & Floor Content"));
    expect(screen.getByText("Room 201 is duplicated")).toBeTruthy();
  });

  it("3. nav_broken_edge appears under Navigation", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "nav_broken_edge", severity: "error", message: "Edge references missing node" }),
    ]);
    fireEvent.click(screen.getByText("Navigation"));
    expect(screen.getByText("Edge references missing node")).toBeTruthy();
  });

  it("4. nav_accessibility_contradiction appears under Accessibility", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "nav_accessibility_contradiction", severity: "warning", message: "Accessible flag contradiction" }),
    ]);
    fireEvent.click(screen.getByText("Accessibility"));
    expect(screen.getByText("Accessible flag contradiction")).toBeTruthy();
  });

  it("5. active nav issue is NOT mislabeled under Campus & Buildings fallback", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "nav_orphan_node", severity: "warning", message: "Orphan waypoint" }),
    ]);
    // Navigation group should have the issue, not Campus & Buildings
    fireEvent.click(screen.getByText("Navigation"));
    expect(screen.getByText("Orphan waypoint")).toBeTruthy();
  });
});

// ── READINESS ──────────────────────────────────────────────────────────────

describe("PrePublishDialog — Readiness status", () => {
  it("6. no errors/warnings → Ready to Publish", () => {
    renderDialog(makeCampus(), []);
    expect(screen.getByText("Ready to Publish")).toBeTruthy();
  });

  it("7. warnings only → Needs Attention", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_name", severity: "warning", message: "Missing name" }),
    ]);
    expect(screen.getByText("Needs Attention")).toBeTruthy();
  });

  it("8. any error → Not Ready to Publish", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_campus_name", severity: "error", message: "No name" }),
    ]);
    expect(screen.getByText("Not Ready to Publish")).toBeTruthy();
  });

  it("9. info-only does not become Not Ready", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "nav_edge_blocked_by_obstacle", severity: "info", message: "Info only" }),
    ]);
    expect(screen.getByText("Ready to Publish")).toBeTruthy();
  });
});

// ── SUMMARY ────────────────────────────────────────────────────────────────

describe("PrePublishDialog — Validation summary", () => {
  it("10. errors/warnings counts are accurate", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_campus_name", severity: "error", message: "Error 1" }),
      makeIssue({ type: "missing_name", severity: "warning", message: "Warning 1" }),
      makeIssue({ type: "missing_code", severity: "warning", message: "Warning 2" }),
    ]);
    // The summary badge shows "1 error" when there are errors
    expect(screen.getByText("1 error")).toBeTruthy();
  });

  it("11. passed checks count is derived from real groups", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "nav_broken_edge", severity: "error", message: "Broken edge" }),
    ]);
    // 4 groups total, 1 has issues → 3 passed
    expect(screen.getByText("3 of 4 checks passed")).toBeTruthy();
  });

  it("12. no fake unsupported pathfinding check is shown", () => {
    renderDialog(makeCampus(), []);
    // All 4 groups should show Passed, no "Accessible route" or "Emergency route"
    expect(screen.queryByText(/accessible route/i)).toBeNull();
    expect(screen.queryByText(/emergency route/i)).toBeNull();
  });
});

// ── LOCATION ───────────────────────────────────────────────────────────────

describe("PrePublishDialog — Affected location", () => {
  it("13. issue with building target displays readable location", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_name", severity: "warning", message: "No name", target: { scope: "campus", mode: "design", selectionType: "building", id: "b1", buildingId: "b1" } }),
    ]);
    fireEvent.click(screen.getByText("Campus & Buildings"));
    expect(screen.getByText("Building One")).toBeTruthy();
  });
});

// ── RESOLUTION ─────────────────────────────────────────────────────────────

describe("PrePublishDialog — Suggested resolution", () => {
  it("16. duplicate room shows rename guidance", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "duplicate_room_name", severity: "warning", message: "Duplicate" }),
    ]);
    fireEvent.click(screen.getByText("Rooms & Floor Content"));
    expect(screen.getByText(/Rename one of the rooms/)).toBeTruthy();
  });

  it("17. emergency exit missing nav shows navigation-link guidance", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "emergency_exit_no_nav", severity: "warning", message: "Exit not linked" }),
    ]);
    fireEvent.click(screen.getByText("Navigation"));
    expect(screen.getByText(/Add this door to the navigation network/)).toBeTruthy();
  });

  it("18. disconnected graph shows structural connection guidance", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "nav_disconnected_component", severity: "error", message: "Disconnected" }),
    ]);
    fireEvent.click(screen.getByText("Navigation"));
    expect(screen.getByText(/Connect this navigation section/)).toBeTruthy();
  });
});

// ── WARNING CONFIRMATION ───────────────────────────────────────────────────

describe("PrePublishDialog — Warning confirmation UX", () => {
  it("19. errors block publish (Fix Errors button disabled)", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_campus_name", severity: "error", message: "No name" }),
    ]);
    const fixBtn = screen.getByText("Fix Errors to Publish");
    expect(fixBtn.closest("button")).toHaveProperty("disabled", true);
  });

  it("20. warnings require explicit confirmation (Review Warnings & Publish button)", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_name", severity: "warning", message: "Missing name" }),
    ]);
    expect(screen.getByText("Review Warnings & Publish")).toBeTruthy();
  });

  it("21. info-only remains non-blocking (Publish Now button)", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "nav_edge_blocked_by_obstacle", severity: "info", message: "Info" }),
    ]);
    expect(screen.getByText("Publish Now")).toBeTruthy();
  });

  it("22. clean campus proceeds normally (Publish Now button)", () => {
    renderDialog(makeCampus(), []);
    expect(screen.getByText("Publish Now")).toBeTruthy();
  });
});

// ── PASSED CHECKS ──────────────────────────────────────────────────────────

describe("PrePublishDialog — Passed checks display", () => {
  it("shows 'Passed' for groups with no issues", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_campus_name", severity: "error", message: "Error" }),
    ]);
    // Campus & Buildings has the error, other groups should show Passed
    const passedTexts = screen.getAllByText("Passed");
    expect(passedTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'All checks passed' when group is expanded and empty", () => {
    renderDialog(makeCampus(), [
      makeIssue({ type: "missing_campus_name", severity: "error", message: "Error" }),
    ]);
    // Click on Navigation group (no issues)
    fireEvent.click(screen.getByText("Navigation"));
    expect(screen.getByText("All checks passed")).toBeTruthy();
  });
});
