import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { FloorSettingsDialog, floorSettingsEqual, normalizeFloorSettings } from "../FloorSettingsDialog";
import type { FloorSettingsDraft } from "../FloorSettingsDialog";
import type { FloorPlan } from "../types";

// Keep this suite focused on settings state. The production picker has its own
// interaction/portal coverage; a plain input makes the persisted hex value
// directly observable here.
vi.mock("../../ui/ColorPicker", () => ({
  ColorPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Floor color" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

function makeFloor(over: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: "floor-settings-test",
    buildingId: "building-settings-test",
    number: 1,
    label: "Ground Floor",
    canvasW: 600,
    canvasH: 450,
    backgroundColor: "#E5E7EB",
    appearance: { material: "ceramic_tile", texture: "subtle", color: "#E5E7EB" },
    // Deliberately exercise the eligibility normalization: textured floors
    // cannot have the authoring grid enabled in the settings draft.
    showGrid: true,
    gridSize: 20,
    rooms: [],
    paths: [],
    walls: [
      {
        id: "perimeter-right",
        x1: 600,
        y1: 0,
        x2: 600,
        y2: 450,
        thickness: 6,
        color: "#64748B",
        material: "concrete",
        managedKind: "perimeter",
        perimeterSide: "right",
        locked: true,
      },
    ],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
    ...over,
  };
}

function renderDialog(floor = makeFloor(), onApply = vi.fn(() => true), onRequestDisablePerimeter?: () => boolean) {
  return render(
    <FloorSettingsDialog
      open
      floor={floor}
      onApply={onApply}
      onClose={vi.fn()}
      onRequestDisablePerimeter={onRequestDisablePerimeter}
    />,
  );
}

function RoundTripHarness() {
  const [open, setOpen] = useState(true);
  const [floor, setFloor] = useState(makeFloor());
  const apply = (draft: FloorSettingsDraft) => {
    setFloor((current) => ({
      ...current,
      label: draft.label,
      canvasW: draft.canvasW,
      canvasH: draft.canvasH,
      backgroundColor: draft.backgroundColor,
      appearance: { material: draft.material, texture: draft.texture, color: draft.color },
      showGrid: draft.showGrid,
      gridSize: draft.gridSize,
    }));
    return true;
  };
  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)}>Toggle settings</button>
      <FloorSettingsDialog open={open} floor={floor} onApply={apply} onClose={() => setOpen(false)} />
    </>
  );
}

describe("Floor Settings persistence baseline", () => {
  afterEach(() => cleanup());

  it("normalizes the saved floor once so ineligible grid state is clean", () => {
    const baseline = normalizeFloorSettings(makeFloor());

    expect(baseline).toMatchObject({
      material: "ceramic_tile",
      texture: "subtle",
      color: "#E5E7EB",
      backgroundColor: "#E5E7EB",
      showGrid: false,
      gridSize: 20,
      perimeterEnabled: true,
      perimeterThickness: 6,
      perimeterMaterial: "concrete",
      perimeterColor: "#64748B",
    });
    expect(floorSettingsEqual(baseline, { ...baseline })).toBe(true);
  });

  it("uses the same canonical fallback for legacy appearance values", () => {
    const baseline = normalizeFloorSettings(makeFloor({
      appearance: undefined,
      backgroundColor: "#d1d5db",
      showGrid: true,
    }));

    expect(baseline).toMatchObject({
      material: "neutral",
      texture: "subtle",
      color: "#d1d5db",
      backgroundColor: "#d1d5db",
      showGrid: false,
    });
    expect(floorSettingsEqual(baseline, { ...baseline })).toBe(true);
  });

  it("opens with the exact saved values and a disabled Save Changes button", () => {
    const onApply = vi.fn(() => true);
    renderDialog(makeFloor(), onApply);

    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Floor canvas width")).toHaveValue(600);
    expect(screen.getByLabelText("Floor canvas height")).toHaveValue(450);
    expect(screen.getByRole("combobox", { name: "Floor material" })).toHaveTextContent("Ceramic Tile");
    expect(screen.getByRole("combobox", { name: "Floor texture" })).toHaveTextContent("Subtle");
    expect(screen.getAllByLabelText("Floor color")[0]).toHaveValue("#E5E7EB");
    expect(screen.getByRole("button", { name: "Thick (6px)" })).toHaveClass("border-primary");
    expect(screen.getByRole("button", { name: "Concrete" })).toHaveClass("border-primary");
    expect(screen.getByTestId("floor-grid-disabled-help")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid size 20" })).toBeDisabled();
  });

  it("re-enables grid controls for the eligible Neutral + None appearance", () => {
    renderDialog(makeFloor({
      backgroundColor: "#e8e1d7",
      appearance: { material: "neutral", texture: "none", color: "#e8e1d7" },
      showGrid: true,
    }));

    expect(screen.queryByTestId("floor-grid-disabled-help")).toBeNull();
    expect(screen.getByRole("button", { name: "Grid size 20" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Show canvas grid (authoring grid)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });

  it("uses value-based dirty detection and becomes clean when a value is restored", () => {
    renderDialog();
    const width = screen.getByLabelText("Floor canvas width");
    const save = screen.getByRole("button", { name: "Save Changes" });

    fireEvent.change(width, { target: { value: "640" } });
    expect(save).toBeEnabled();

    fireEvent.change(width, { target: { value: "600" } });
    expect(save).toBeDisabled();
  });

  it("rebases the draft after a successful save without requiring a reopen", () => {
    const onApply = vi.fn(() => true);
    renderDialog(makeFloor(), onApply);
    fireEvent.change(screen.getByLabelText("Floor canvas width"), { target: { value: "640" } });
    const save = screen.getByRole("button", { name: "Save Changes" });
    expect(save).toBeEnabled();

    fireEvent.click(save);

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining<Partial<FloorSettingsDraft>>({
      canvasW: 640,
      canvasH: 450,
      material: "ceramic_tile",
      texture: "subtle",
      color: "#E5E7EB",
      showGrid: false,
    }));
    expect(save).toBeDisabled();
    expect(screen.getByLabelText("Floor canvas width")).toHaveValue(640);
  });

  it("round-trips an explicitly saved appearance instead of reapplying a material default", () => {
    render(<RoundTripHarness />);
    const color = screen.getAllByLabelText("Floor color")[0];
    fireEvent.change(color, { target: { value: "#ABCDEF" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle settings" }));

    expect(screen.getAllByLabelText("Floor color")[0]).toHaveValue("#ABCDEF");
    expect(screen.getByRole("combobox", { name: "Floor material" })).toHaveTextContent("Ceramic Tile");
    expect(screen.getByRole("combobox", { name: "Floor texture" })).toHaveTextContent("Subtle");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });

  it("keeps managed perimeter walls enabled when removal is blocked", () => {
    const requestDisable = vi.fn(() => false);
    renderDialog(makeFloor(), vi.fn(() => true), requestDisable);

    fireEvent.click(screen.getByRole("button", { name: /Enable structural perimeter walls/ }));

    expect(requestDisable).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Enable structural perimeter walls/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });
});
