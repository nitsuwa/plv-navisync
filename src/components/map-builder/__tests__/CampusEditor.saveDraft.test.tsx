import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

function makeCampus(): Campus {
  return {
    id: "c1",
    name: "Test Campus",
    code: "TC",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1",
      name: "Building One",
      code: "B1",
      category: "Academic",
      description: "",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      color: "#1e40af",
      entrances: [{ id: "ent-main", name: "Main Entrance", type: "general", edge: "bottom", offset: 0.5, accessible: true, isPrimary: true }],
      floors: [{
        id: "f1",
        buildingId: "b1",
        number: 1,
        label: "Ground Floor",
        rooms: [],
        paths: [],
        walls: [],
        doors: [{ id: "door-a", label: "Door A", x: 20, y: 20, width: 20, direction: "left", color: "#b45309" }],
        windows: [],
        furniture: [],
        stairs: [],
        ramps: [],
        elevators: [],
        labels: [],
      }],
    }],
    markers: [],
    paths: [],
    navNodes: [
      { id: "entrance-node", campusId: "c1", buildingId: "b1", entranceId: "ent-main", name: "Main Entrance", type: "entrance", x: 150, y: 180, accessible: true },
      { id: "door-node", campusId: "c1", buildingId: "b1", floorId: "f1", doorId: "door-a", name: "Door A", type: "hallway", x: 20, y: 20, accessible: true },
    ],
    navEdges: [{
      id: "edge-current",
      startNodeId: "entrance-node",
      endNodeId: "door-node",
      distance: 1,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      type: "entrance_transition",
    }],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as Campus;
}

function Harness({
  initialCampus,
  savedSnapshot,
  onSave,
  onBack,
}: {
  initialCampus: Campus;
  savedSnapshot: string;
  onSave: (campus: Campus) => Promise<Campus>;
  onBack: () => void;
}) {
  const [campus, setCampus] = useState(initialCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={onBack}
      onUpdate={setCampus}
      onSave={onSave}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={savedSnapshot}
    />
  );
}

function clickBack() {
  fireEvent.click(screen.getByRole("button", { name: /Back to campus list/i }));
}

describe("B5 Phase 4.5 - Save Draft persistence flow", () => {
  it("saves the current campus nav graph before leaving", async () => {
    const current = makeCampus();
    const saved = { ...current, navEdges: [] };
    const onSave = vi.fn(async (campus: Campus) => campus);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].navEdges).toEqual(current.navEdges);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it("does not leave when Save Draft persistence fails", async () => {
    const current = makeCampus();
    const saved = { ...current, navEdges: [] };
    const onSave = vi.fn(async () => {
      throw new Error("database rejected navigation_edges");
    });
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByText("database rejected navigation_edges")).toBeInTheDocument();
    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
  });
});

describe("B7 Phase 2 — Save Draft is never blocked by validation", () => {
  it("saves a draft that has validation WARNINGS", async () => {
    // Orphan nav node → nav_orphan_node warning. Saving must NOT be blocked.
    const current = makeCampus();
    current.navNodes!.push({ id: "orphan", campusId: "c1", name: "Orphan", type: "outdoor", x: 500, y: 500, accessible: true } as Campus["navNodes"][number]);
    const saved = { ...current, navEdges: [] };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    // The warning is live in the global Issues control BEFORE saving.
    expect(screen.getByTestId("issues-popover").getAttribute("data-count")).toBe("1");

    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it("saves a draft that has validation ERRORS", async () => {
    // Building pushed beyond the canvas → boundary error. Saving must NOT be blocked.
    const current = makeCampus();
    current.buildings[0] = { ...current.buildings[0], x: 850 };
    const saved = { ...current, navEdges: [] };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    expect(screen.getByTestId("issues-popover").getAttribute("data-count")).toBe("1");

    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it("successful save does NOT remove validation issues and clears dirty state", async () => {
    const current = makeCampus();
    current.navNodes!.push({ id: "orphan", campusId: "c1", name: "Orphan", type: "outdoor", x: 500, y: 500, accessible: true } as Campus["navNodes"][number]);
    const saved = { ...current, navEdges: [] };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    // Save via the toolbar button directly (no back-guard needed).
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // Validation issues legitimately remain after the save.
    expect(screen.getByTestId("issues-popover").getAttribute("data-count")).toBe("1");
    // Dirty state is cleared normally → the toolbar button flips to Saved.
    const saveBtn = screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("a real save failure preserves dirty edits and reports the failure", async () => {
    const current = makeCampus();
    const saved = { ...current, navEdges: [] };
    const onSave = vi.fn(async () => {
      throw new Error("database offline");
    });
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Failure surfaces inside the save screen with a retry — dirty state stays.
    expect(await screen.findByText("Unable to Save Campus Map")).toBeInTheDocument();
    // The toolbar Save button is still enabled (draft still dirty).
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });
});
