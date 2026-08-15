import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useCallback, useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

const STAIR = { id: "s1", x: 40, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs" };

function campusWithFloors(count: number, withStair = false): Campus {
  return {
    id: "c1", name: "Test Campus", code: "TC", description: "", address: "", city: "",
    province: "", postalCode: "", status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 220, canvasH: 160,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1", name: "Main Building", code: "MB", category: "Academic", description: "",
      x: 100, y: 100, width: 120, height: 80, color: "#0e2a6e",
      floors: Array.from({ length: count }, (_, i) => ({
        id: `f${i + 1}`, buildingId: "b1", number: i + 1, label: i === 0 ? "Ground Floor" : `Floor ${i + 1}`,
        canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [],
        stairs: withStair && i === 0 ? [STAIR] : [], ramps: [], elevators: [], labels: [], paths: [],
      })),
    }],
    markers: [], paths: [], navNodes: [], navEdges: [], createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

function Harness({
  initialCampus,
  initialSnapshot,
  onSave,
}: {
  initialCampus: Campus;
  initialSnapshot?: Campus;
  onSave?: (campus: Campus) => Promise<Campus>;
}) {
  const [campus, setCampus] = useState(initialCampus);
  const [floorId, setFloorId] = useState("f1");
  const [snapshot, setSnapshot] = useState(JSON.stringify(initialSnapshot ?? initialCampus));
  const save = useCallback(async (next: Campus) => {
    const saved = onSave ? await onSave(next) : next;
    setSnapshot(JSON.stringify(saved));
    setCampus(saved);
    return saved;
  }, [onSave]);
  return (
    <FloorEditor
      key={floorId}
      campus={campus}
      buildingId="b1"
      floorId={floorId}
      onBack={() => {}}
      onSwitchFloor={setFloorId}
      onUpdate={setCampus}
      onSave={save}
      savedSnapshot={snapshot}
    />
  );
}

function saveButton(): HTMLButtonElement {
  return screen.getByTitle(/save floor draft changes|no floor changes to save/i) as HTMLButtonElement;
}

describe("Floor save baseline and selector navigation", () => {
  afterEach(() => cleanup());

  it("successful Save refreshes the persisted baseline, disables Save, and Add Floor does not show a stale prompt", async () => {
    render(<Harness initialCampus={campusWithFloors(1, true)} initialSnapshot={campusWithFloors(1, false)} />);

    expect(saveButton()).not.toBeDisabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(screen.queryByText("Unsaved Floor Changes")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Select floor" })).toHaveTextContent("Floor 2"));
  });

  it("failed Save preserves dirty state and the Add Floor warning", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("database rejected save");
    });
    render(<Harness initialCampus={campusWithFloors(1, true)} initialSnapshot={campusWithFloors(1, false)} onSave={onSave} />);

    expect(saveButton()).not.toBeDisabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(saveButton()).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(screen.getByText("Unsaved Floor Changes")).toBeInTheDocument();
  });

  it("selector lists every floor, marks the active floor, and switches through the normal dirty-state flow", () => {
    render(<Harness initialCampus={campusWithFloors(20)} />);

    fireEvent.click(screen.getByRole("button", { name: "Select floor" }));
    const popover = screen.getByTestId("floor-selector-popover");
    const options = within(popover).getAllByTestId("floor-selector-option");
    expect(options).toHaveLength(20);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(popover).getByRole("option", { name: /Floor 20/ }));
    expect(screen.getByRole("button", { name: "Select floor" })).toHaveTextContent("Floor 20");
  });

  it("+ and floor actions remain rendered outside the selector list", () => {
    render(<Harness initialCampus={campusWithFloors(20)} />);

    fireEvent.click(screen.getByRole("button", { name: "Select floor" }));
    const popover = screen.getByTestId("floor-selector-popover");
    const addFloor = screen.getByRole("button", { name: "Add Floor" });
    const floorActions = screen.getByRole("button", { name: "Floor actions" });

    expect(addFloor).toBeInTheDocument();
    expect(floorActions).toBeInTheDocument();
    expect(popover.contains(addFloor)).toBe(false);
    expect(popover.contains(floorActions)).toBe(false);
  });

  it("floor actions use vertical wording and Move Down immediately updates selector order", () => {
    render(<Harness initialCampus={campusWithFloors(4)} />);

    fireEvent.click(screen.getByRole("button", { name: "Floor actions" }));
    const menu = screen.getByTestId("floor-actions-menu");
    expect(within(menu).getByRole("button", { name: "Move Up" })).toBeDisabled();
    fireEvent.click(within(menu).getByRole("button", { name: "Move Down" }));

    fireEvent.click(screen.getByRole("button", { name: "Select floor" }));
    const labels = within(screen.getByTestId("floor-selector-popover"))
      .getAllByTestId("floor-selector-option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["Floor 2#2", "Ground Floor#1", "Floor 3#3", "Floor 4#4"]);
  });
});
