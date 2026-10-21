import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Campus } from "../types";

vi.mock("../../../pages/CampusMapPage", async () => {
  const React = await import("react");
  const { StudentFloorPicker } = await import("../../map/StudentFloorPicker");
  return {
    CampusMapPage: ({ previewCampus, fullScreenHeight }: { previewCampus: Campus; fullScreenHeight?: string }) => {
      const [floor, setFloor] = React.useState(1);
      const floors = [
        { number: 1, label: "Ground Floor" },
        { number: 2, label: "Floor 2" },
      ];
      return React.createElement("div", {
        "data-testid": "student-map-surface",
        "data-fullscreen-height": fullScreenHeight,
        "data-campus-name": previewCampus.name,
      }, React.createElement(StudentFloorPicker, {
        buildingName: "Science Hall",
        buildingCode: "SCI",
        floors,
        activeFloor: floor,
        onSelect: setFloor,
      }));
    },
  };
});

import { StudentPreview } from "../StudentPreview";

const campus: Campus = {
  id: "preview-picker-campus", name: "Preview Campus", code: "PREVIEW", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "draft", visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  canvasW: 900, canvasH: 680, settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  buildings: [], markers: [], paths: [], navNodes: [], navEdges: [], routes: [], accessibilityFeatures: [], assemblyPoints: [], eventOverlays: [], decorAssets: [],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("Student Preview floor picker integration", () => {
  it("keeps the floor menu inside Preview's stacking layer and switches the active floor", async () => {
    render(<StudentPreview campus={campus} validationIssues={[]} onBack={vi.fn()} onPublish={vi.fn()} />);

    const previewRoot = screen.getByTestId("student-preview-root");
    const trigger = screen.getByRole("button", { name: "Choose floor. Current floor: Ground Floor" });
    fireEvent.click(trigger);

    const menu = await screen.findByTestId("student-floor-picker-menu");
    expect(menu.closest("[data-student-preview-root]")).toBe(previewRoot);
    expect(previewRoot).toHaveAttribute("data-student-preview-root", "true");
    expect(previewRoot.className).toContain("z-[300]");
    expect(within(menu).getByRole("option", { name: /Floor 2/ })).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("option", { name: /Floor 2/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose floor. Current floor: Floor 2" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByTestId("student-floor-picker-menu")).not.toBeInTheDocument();
  });
});
