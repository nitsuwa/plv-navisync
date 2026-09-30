import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { studentCampusListing } from "../studentCampusListing";

function campus(id: string, lifecycleStatus: Campus["lifecycleStatus"], isDefault = false): Campus {
  return {
    id, name: id, code: id.toUpperCase(), description: "", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: lifecycleStatus === "published" ? "published" : "draft", lifecycleStatus,
    visibleToStudents: lifecycleStatus === "published" || lifecycleStatus === "coming_soon", isDefault,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    canvasW: 900, canvasH: 680, settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings: [], markers: [], paths: [], navNodes: [], navEdges: [], routes: [], accessibilityFeatures: [], assemblyPoints: [], eventOverlays: [], decorAssets: [],
    createdAt: "", updatedAt: "",
  };
}

describe("studentCampusListing", () => {
  it("keeps the default published map first, followed by other published maps and Coming Soon entries", () => {
    const listing = studentCampusListing(
      [campus("secondary", "published"), campus("main", "published", true)],
      [campus("zeta", "coming_soon"), campus("alpha", "coming_soon"), campus("draft", "draft")],
    );
    expect(listing.map((item) => item.id)).toEqual(["main", "secondary", "alpha", "zeta"]);
  });
});
