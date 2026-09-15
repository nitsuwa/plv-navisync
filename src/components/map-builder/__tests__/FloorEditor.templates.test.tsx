import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

function campusFixture(): Campus {
  return {
    id: "campus-1",
    name: "PLV Campus",
    code: "PLV",
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
      id: "building-1", name: "Main Building", code: "MAIN", category: "Academic", description: "",
      x: 20, y: 20, width: 300, height: 220, color: "#0e2a6e",
      floors: [{
        id: "floor-1", buildingId: "building-1", number: 1, label: "Ground Floor", canvasW: 900, canvasH: 680,
        rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
      }],
    }],
    markers: [], paths: [], navNodes: [], navEdges: [], createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

describe("FloorEditor Floor Templates", () => {
  it("exposes the user-created Floor Templates catalogue from the Object Library", () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    expect(screen.queryByTestId("room-template-button")).toBeNull();
    expect(screen.queryByText("Room Templates")).toBeNull();
    fireEvent.click(screen.getByTestId("floor-template-button"));
    expect(screen.getByTestId("floor-template-catalogue")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Floor Templates" })).toBeInTheDocument();
    expect(screen.queryByText("Built-in")).toBeNull();
  });

  it("provides a discoverable way to save the current Floor as a custom template", async () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    expect(screen.queryByTestId("floor-template-category-filter")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("floor-template-empty-state")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("save-floor-template-empty-state"));
    expect(screen.getByTestId("template-metadata-dialog")).toBeInTheDocument();
    expect(screen.getByText("Save Floor as Template")).toBeInTheDocument();
    expect(screen.queryByText("Category")).toBeNull();
    expect(screen.getByRole("button", { name: "Save Template" })).toBeDisabled();
    expect(screen.queryByTestId("save-floor-template-library")).toBeNull();
    expect(screen.queryByTestId("save-floor-template-settings")).toBeNull();
  });

  it("keeps catalogue and custom-template close actions read-only", async () => {
    const updates: Campus[] = [];
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("button", { name: "Close Floor Templates" }));
    expect(updates).toHaveLength(0);

    fireEvent.click(screen.getByTestId("floor-template-button"));
    await waitFor(() => expect(screen.getByTestId("floor-template-empty-state")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("save-floor-template-empty-state"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("floor-template-catalogue")).toBeInTheDocument();
    expect(updates).toHaveLength(0);
  });

  it("opens the Add Floor chooser without mutating, then preserves the blank-floor path", () => {
    const campus = campusFixture();
    const updates: Campus[] = [];
    const switches: string[] = [];
    render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={(id) => switches.push(id)} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(screen.getByTestId("floor-creation-chooser")).toBeInTheDocument();
    expect(updates).toHaveLength(0);
    fireEvent.click(screen.getByTestId("start-blank-floor"));
    expect(updates).toHaveLength(1);
    expect(updates[0].buildings[0].floors).toHaveLength(2);
    expect(switches).toHaveLength(1);
    expect(updates[0].buildings[0].floors[1].rooms).toEqual([]);
  });

  it("browses the empty user-created Floor catalogue through Add Floor without mutating", async () => {
    const campus = campusFixture();
    const updates: Campus[] = [];
    const switches: string[] = [];
    render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={(id) => switches.push(id)} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    fireEvent.click(screen.getByTestId("browse-floor-templates"));
    expect(screen.getByTestId("floor-template-catalogue")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("floor-template-empty-state")).toBeInTheDocument());
    expect(screen.queryByTestId(/floor-template-card-/)).toBeNull();
    expect(updates).toHaveLength(0);
    expect(switches).toHaveLength(0);
  });

  it("keeps the empty catalogue focused on user-authored physical layouts", async () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    await waitFor(() => expect(screen.getByTestId("floor-template-empty-state")).toBeInTheDocument());
    expect(screen.getByText(/Save a completed Floor as a reusable template/i)).toBeInTheDocument();
    expect(screen.queryByText(/Templates include physical layout only/i)).toBeNull();
  });

  it("explains availability and saved physical scope inside the active save form", async () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    await waitFor(() => expect(screen.getByTestId("floor-template-empty-state")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("save-floor-template-empty-state"));

    expect(screen.getByText("This Campus")).toBeInTheDocument();
    expect(screen.getByText("Only available in this campus.")).toBeInTheDocument();
    expect(screen.getByText("Shared")).toBeInTheDocument();
    expect(screen.getByText("Reusable across campuses.")).toBeInTheDocument();
    expect(screen.queryByText(/Custom templates unavailable/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /What gets saved with this template/i }));
    expect(screen.getByText("Included")).toBeInTheDocument();
    expect(screen.getByText("Not included")).toBeInTheDocument();
    expect(screen.getByText("Navigation is configured separately because each Floor may use different circulation and route connections.")).toBeInTheDocument();
  });
});
