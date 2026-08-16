import { describe, expect, it, vi } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import {
  compareCampusVersionSnapshots,
  createCampusVersionSnapshot,
  validateCampusForPublication,
} from "../campusPublishingService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

function campus(overrides: Partial<Campus> = {}): Campus {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "PLV Main Campus",
    code: "PLV",
    description: "Campus",
    address: "Maysan Road",
    city: "Valenzuela",
    province: "Metro Manila",
    postalCode: "1440",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 1200,
    canvasH: 800,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-08-01",
    updatedAt: "2026-08-16",
    databaseUpdatedAt: "2026-08-16T08:00:00.000Z",
    ...overrides,
  };
}

describe("A6 campus publication contract", () => {
  it("creates an immutable snapshot without private editor-only URLs or preview metadata", () => {
    const snapshot = createCampusVersionSnapshot(campus({
      logo: "https://signed.example/logo?token=secret",
      thumbnail: "https://signed.example/map?token=secret",
      logoPath: "11111111-1111-4111-8111-111111111111/logo.png",
      previewBuildingCount: 3,
      previewFloorCount: 5,
      previewRoomCount: 20,
      previewBuildingsLoaded: true,
    })) as Record<string, unknown>;

    expect(snapshot.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(snapshot.logo).toBeUndefined();
    expect(snapshot.thumbnail).toBeUndefined();
    expect(snapshot.databaseUpdatedAt).toBeUndefined();
    expect(snapshot.previewBuildingCount).toBeUndefined();
    expect(snapshot.logoPath).toBe("11111111-1111-4111-8111-111111111111/logo.png");
  });

  it("hands blocking B5/campus issues to A6 as a failed validation", () => {
    const result = validateCampusForPublication(campus({ name: "" }));

    expect(result.status).toBe("failed");
    expect(result.errorsCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.type === "missing_campus_name")).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it("ignores lifecycle timestamps but identifies changed authored sections", () => {
    const before = createCampusVersionSnapshot(campus({ updatedAt: "2026-08-15", publishStatus: "published" }));
    const timestampOnly = createCampusVersionSnapshot(campus({ updatedAt: "2026-08-16", publishedAt: "2026-08-16" }));
    expect(compareCampusVersionSnapshots(timestampOnly, before)).toMatchObject({ changed: false, changedSections: [] });

    const changed = createCampusVersionSnapshot(campus({ description: "Updated public description" }));
    expect(compareCampusVersionSnapshots(changed, before)).toMatchObject({
      changed: true,
      changedSections: ["description"],
    });
  });
});
