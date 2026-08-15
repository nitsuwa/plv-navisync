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
