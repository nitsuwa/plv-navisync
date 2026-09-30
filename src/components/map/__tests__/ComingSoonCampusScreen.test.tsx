import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Campus } from "../../map-builder/types";
import { ComingSoonCampusScreen } from "../ComingSoonCampusScreen";

function campus(overrides: Partial<Campus>): Campus {
  return {
    id: "annex", name: "PLV Annex", code: "ANNEX", description: "", address: "Lingayen", city: "Lingayen", province: "Pangasinan", postalCode: "",
    status: "active", publishStatus: "draft", lifecycleStatus: "coming_soon", visibleToStudents: true,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    canvasW: 900, canvasH: 680, settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings: [], markers: [], paths: [], navNodes: [], navEdges: [], routes: [], accessibilityFeatures: [], assemblyPoints: [], eventOverlays: [], decorAssets: [],
    createdAt: "", updatedAt: "", ...overrides,
  };
}

describe("ComingSoonCampusScreen", () => {
  it("shows the branded announcement without map or navigation controls", () => {
    render(<ComingSoonCampusScreen campus={campus({})} campuses={[campus({})]} onSelectCampus={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "PLV Annex" })).toBeInTheDocument();
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    expect(screen.getByText(/Campus navigation is being prepared/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plan route|search rooms|navigate/i })).not.toBeInTheDocument();
  });

  it("keeps published campuses available from the campus selector", () => {
    const onSelectCampus = vi.fn();
    const published = campus({ id: "main", name: "Main Campus", code: "MAIN", lifecycleStatus: "published", publishStatus: "published", isDefault: true });
    render(<ComingSoonCampusScreen campus={campus({})} campuses={[published, campus({})]} onSelectCampus={onSelectCampus} />);
    fireEvent.click(screen.getByRole("button", { name: /choose another campus/i }));
    fireEvent.click(screen.getByRole("button", { name: /Main Campus.*Published/i }));
    expect(onSelectCampus).toHaveBeenCalledWith("main");
  });
});
