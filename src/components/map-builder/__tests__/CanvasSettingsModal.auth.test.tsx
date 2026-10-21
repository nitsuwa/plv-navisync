import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Campus } from "../types";

// Keep this test focused on the settings transaction rather than the color
// picker's portal geometry. The production modal still uses the shared picker.
vi.mock("../../ui/ColorPicker", () => ({
  ColorPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Ground color" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { CanvasSettingsModal } from "../CanvasSettingsModal";

function makeCampus(over: Partial<Campus> = {}): Campus {
  return {
    id: "campus-appearance",
    name: "Appearance Test Campus",
    code: "APPEAR",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    themeColor: "#1e3a5f",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    canvasW: 900,
    canvasH: 680,
    canvasConfigured: true,
    settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    routes: [],
    accessibilityFeatures: [],
    assemblyPoints: [],
    eventOverlays: [],
    decorAssets: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    databaseUpdatedAt: "2026-01-01T00:00:00.000Z",
    isDefault: false,
    lifecycleStatus: "draft",
    ...over,
  };
}

async function confirmSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
}

function chooseDropdown(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("CanvasSettingsModal authenticated save behavior", () => {
  it("submits material, color, and texture together through the awaited save callback", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CanvasSettingsModal open campus={makeCampus()} onSave={onSave} onClose={onClose} />);

    chooseDropdown("Ground material", "Grass");
    chooseDropdown("Ground texture", "None");
    fireEvent.change(screen.getByRole("textbox", { name: "Ground color" }), { target: { value: "#365c32" } });
    await confirmSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      canvasGroundMaterial: "grass",
      canvasGroundColor: "#365c32",
      canvasGroundTexture: "none",
      canvasConfigured: true,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the local appearance draft open when persistence rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Auth session missing!"));
    const onClose = vi.fn();
    render(<CanvasSettingsModal open campus={makeCampus()} onSave={onSave} onClose={onClose} />);

    chooseDropdown("Ground material", "Grass");
    await confirmSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Ground material" })).toHaveValue("grass"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Settings" })).toBeInTheDocument();
  });

  it("keeps Nearest Eligible configurable in authorized campus settings and persists it", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CanvasSettingsModal open campus={makeCampus()} onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByTestId("canvas-settings-sos-policy"), { target: { value: "nearest_eligible" } });
    await confirmSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        accessibility: false,
        emergency: false,
        eventLayer: false,
        gps: false,
        emergencyDestinationPolicy: "nearest_eligible",
      }),
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not designate a campus Primary implicitly and saves an explicit choice without changing building assignments", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const point = {
      id: "assembly-main", name: "Main Assembly Point", x: 300, y: 240, navNodeId: "assembly-node",
      buildingAssignments: [{ buildingId: "building-a", designation: "primary" as const }],
    };
    const campus = makeCampus({ assemblyPoints: [point] });
    render(<CanvasSettingsModal open campus={campus} onSave={onSave} onClose={onClose} />);

    const primaryPicker = screen.getByTestId("canvas-settings-campus-primary-assembly");
    expect(primaryPicker).toHaveValue("");
    fireEvent.change(primaryPicker, { target: { value: point.id } });
    await confirmSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      assemblyPoints: [expect.objectContaining({
        id: point.id,
        campusWidePrimary: true,
        buildingAssignments: point.buildingAssignments,
      })],
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
