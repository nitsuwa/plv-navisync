import { afterEach, describe, expect, it } from "vitest";
import {
  clearDiagnosticEventsForTests,
  createDiagnosticReport,
  diagnosticReportFilename,
  formatDiagnosticSummary,
  getRecentDiagnosticEvents,
  isDiagnosticsAuthorized,
  recordDiagnosticEvent,
  setMapDiagnosticContext,
} from "../diagnostics";

afterEach(() => clearDiagnosticEventsForTests());

const context = {
  mapMode: "3D" as const,
  navigationState: "navigating",
  cameraMode: "follow",
  cameraRecovery: "failed" as const,
  campus: "Main Campus",
  selectedBuilding: "Canteen",
  floor: null,
  route: { start: "Campus Gate", destination: "Canteen", type: "standard", currentStep: 2, stepCount: 5 },
  routeStatus: "paused" as const,
  mapDataStatus: "ready" as const,
  context: "outdoor" as const,
  outdoorTransparency: "enabled" as const,
};

describe("Diagnostics report capture", () => {
  it("captures allowlisted navigation and renderer information in a readable summary", () => {
    setMapDiagnosticContext(context);
    recordDiagnosticEvent({ category: "camera-recovery", severity: "error", summary: "Could not return to the route position." });
    const report = createDiagnosticReport({
      capturedAt: "2026-11-04T08:00:00.000Z",
      pathname: "/map?access_token=private",
      userAgent: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
      width: 390,
      height: 844,
      context,
      events: getRecentDiagnosticEvents(),
      rendererMounted: true,
      webgl: "ready",
      issue: "Recovery failed on Canteen route",
    });
    const summary = formatDiagnosticSummary(report);
    expect(report.page).toBe("/map");
    expect(report.environment).toMatchObject({ browser: "Chrome", device: "mobile", viewport: "390x844" });
    expect(report.renderer).toMatchObject({ expected: true, mounted: true, webgl: "ready" });
    expect(summary).toContain("Campus Gate → Canteen (standard)");
    expect(summary).toContain("Camera recovery: failed");
    expect(summary).toContain("Could not return to the route position.");
  });

  it("redacts credentials and personal identifiers before either export format", () => {
    const unsafeContext = {
      ...context,
      campus: "Admin admin@example.test token=secret123",
      route: { ...context.route, start: "Bearer abc123", destination: "https://private.example/path?key=x" },
    };
    const report = createDiagnosticReport({
      pathname: "/map?session=private",
      userAgent: "Safari/1.0",
      width: 1280,
      height: 800,
      context: unsafeContext,
      events: [{ timestamp: "2026-11-04T08:00:00Z", category: "runtime", severity: "error", summary: "failed for owner@example.test token=secret" }],
      rendererMounted: false,
      webgl: "unavailable",
      issue: "Please contact owner@example.test with Bearer private-token",
    });
    const output = JSON.stringify(report) + formatDiagnosticSummary(report);
    expect(output).not.toContain("owner@example.test");
    expect(output).not.toContain("admin@example.test");
    expect(output).not.toContain("secret123");
    expect(output).not.toContain("private-token");
    expect(output).not.toContain("session=private");
    expect(report.page).toBe("/map");
    expect(diagnosticReportFilename(report.capturedAt)).toMatch(/^PLV-NaviSync-Diagnostics-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("keeps only the newest 30 diagnostic events", () => {
    for (let index = 0; index < 36; index += 1) {
      recordDiagnosticEvent({ category: "navigation", severity: "info", summary: `Transition ${index}` });
    }
    const recent = getRecentDiagnosticEvents();
    expect(recent).toHaveLength(30);
    expect(recent[0].summary).toBe("Transition 6");
    expect(recent.at(-1)?.summary).toBe("Transition 35");
  });
});

describe("Diagnostics authorization", () => {
  it("requires an authenticated session and an active existing administrator role", () => {
    const base = { status: "authenticated", hasSession: true };
    expect(isDiagnosticsAuthorized({ ...base, profile: { role: "admin", is_active: true } })).toBe(true);
    expect(isDiagnosticsAuthorized({ ...base, profile: { role: "super_admin", is_active: true } })).toBe(true);
    expect(isDiagnosticsAuthorized({ ...base, profile: { role: "student", is_active: true } })).toBe(false);
    expect(isDiagnosticsAuthorized({ ...base, profile: { role: "admin", is_active: false } })).toBe(false);
    expect(isDiagnosticsAuthorized({ ...base, hasSession: false, profile: { role: "admin", is_active: true } })).toBe(false);
    expect(isDiagnosticsAuthorized({ status: "initializing", hasSession: true, profile: { role: "admin", is_active: true } })).toBe(false);
  });
});
