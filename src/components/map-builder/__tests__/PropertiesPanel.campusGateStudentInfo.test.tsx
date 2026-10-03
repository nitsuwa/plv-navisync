import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PropertiesPanel } from "../PropertiesPanel";
import type { CampusMarker } from "../types";

const gate: CampusMarker = {
  id: "gate-main", name: "Campus Gate", type: "gate", purpose: "general",
  navNodeId: "gate-node", x: 10, y: 20, color: "#2563eb",
};

function renderGatePanel() {
  const onUpdateMarker = vi.fn();
  render(<PropertiesPanel
    selected={{ type: "marker", id: gate.id }}
    selBldg={undefined}
    selEntrance={undefined}
    selEntranceParent={undefined}
    selMkr={gate}
    selPath={undefined}
    allDecorAssets={[]}
    selRoute={undefined}
    selNavNode={undefined}
    selNavEdge={undefined}
    selEventOverlay={undefined}
    allNavNodes={[]}
    allNavEdges={[]}
    allBuildings={[]}
    layer="campus"
    multiSelected={[]}
    multiSelectedBuildings={[]}
    selectedOutdoorCount={0}
    onBatchUpdateBuildings={vi.fn()}
    onBatchDeleteBuildings={vi.fn()}
    onClearMultiSelect={vi.fn()}
    onUpdateBuilding={vi.fn()}
    onAddEntrance={vi.fn()}
    onSelectEntrance={vi.fn()}
    onUpdateEntrance={vi.fn()}
    onDeleteEntrance={vi.fn()}
    onUpdateMarker={onUpdateMarker}
    onDeleteBuilding={vi.fn()}
    onDeleteMarker={vi.fn()}
    onUpdateDecorAsset={vi.fn()}
    onDeleteDecorAsset={vi.fn()}
    onDuplicateDecorAsset={vi.fn()}
    onClose={vi.fn()}
  />);
  return { onUpdateMarker };
}

describe("PropertiesPanel campus gate student information", () => {
  it("offers optional description, cover photo, structured type, and weekly hours fields", () => {
    renderGatePanel();
    expect(screen.getByTestId("campus-gate-student-information")).toBeInTheDocument();
    expect(screen.getByLabelText("Student description")).toHaveAttribute("maxLength", "400");
    expect(screen.getByLabelText("Upload gate cover photo")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(screen.getByText("Gate type")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weekdays 8–5" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Operating hours" })).toBeInTheDocument();
  });

  it("stores the student description in the selected gate metadata", () => {
    const { onUpdateMarker } = renderGatePanel();
    fireEvent.change(screen.getByLabelText("Student description"), { target: { value: "Main pedestrian entrance." } });
    expect(onUpdateMarker).toHaveBeenCalledWith("gate-main", { studentInfo: { description: "Main pedestrian entrance." } });
  });
});
