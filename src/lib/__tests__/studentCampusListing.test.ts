import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { explorablePublishedCampuses, studentCampusListing } from "../studentCampusListing";

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

  it("includes every published map regardless of location metadata or which status field is populated", () => {
    const lifecyclePublished = campus("lifecycle", "published");
    const publishStatusOnly = { ...campus("publish-status", "draft"), publishStatus: "published" as const, lifecycleStatus: "draft" as const };
    const archived = { ...campus("archived", "published"), status: "archived" as const };
    expect(explorablePublishedCampuses([lifecyclePublished, publishStatusOnly, archived]).map((item) => item.id))
      .toEqual(["lifecycle", "publish-status"]);
  });
});
