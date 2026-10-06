import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";
import type { CustomTemplateRecord } from "../../../services/templateService";
import { sanitizeFloorForTemplate } from "../../../lib/templateSanitizer";

vi.mock("../../../services/templateService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../services/templateService")>();
  return { ...actual, listCustomTemplates: vi.fn().mockResolvedValue([]) };
});

import { listCustomTemplates } from "../../../services/templateService";

afterEach(() => {
  vi.mocked(listCustomTemplates).mockResolvedValue([]);
});

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
  it("moves the Room Template preview directly and places at the same world anchor", async () => {
    const templateData = {
      id: "room-template-live", scope: "room", name: "Clinic", category: "Office", description: "", width: 120, height: 80, tags: [],
      boundary: [],
      objects: [{ kind: "room", x: 0, y: 0, width: 120, height: 80, type: "clinic", name: "Clinic" }],
    } as unknown as CustomTemplateRecord["templateData"];
    vi.mocked(listCustomTemplates).mockResolvedValue([{
      id: "room-template-live", name: "Clinic", description: "", scope: "room", category: "Other", source: "campus", campusId: "campus-1", createdBy: "admin",
      templateData, previewMetadata: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }]);
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("tab", { name: "Room Templates" }));
    fireEvent.click(await screen.findByTestId("room-template-place-custom-room-room-template-live"));

    const svg = screen.getByTestId("floor-canvas-boundary").closest("svg")!;
    Object.defineProperty(svg, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 900, height: 680, right: 900, bottom: 680 }),
    });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 180 });
    await waitFor(() => expect(screen.getByTestId("room-template-placement-ghost")).toHaveAttribute("transform", "translate(260 180)"));
    expect(updates).toHaveLength(0);

    fireEvent.mouseDown(svg, { button: 0, clientX: 260, clientY: 180 });
    expect(updates).toHaveLength(1);
    expect(updates[0].buildings[0].floors[0].rooms.at(-1)).toMatchObject({ x: 260, y: 180, w: 120, h: 80 });
    expect(screen.queryByTestId("room-template-placement-ghost")).toBeNull();
  });

  it("cancels a React-owned Room Template preview without removing a React sibling", async () => {
    const templateData = {
      id: "room-template-cancel", scope: "room", name: "Clinic", category: "Office", description: "", width: 120, height: 80, tags: [],
      boundary: [], objects: [{ kind: "room", x: 0, y: 0, width: 120, height: 80, type: "clinic", name: "Clinic" }],
    } as unknown as CustomTemplateRecord["templateData"];
    vi.mocked(listCustomTemplates).mockResolvedValue([{
      id: "room-template-cancel", name: "Clinic", description: "", scope: "room", category: "Other", source: "campus", campusId: "campus-1", createdBy: "admin",
      templateData, previewMetadata: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }]);
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("tab", { name: "Room Templates" }));
    fireEvent.click(await screen.findByTestId("room-template-place-custom-room-room-template-cancel"));
    expect(screen.getByTestId("room-template-placement-ghost")).toBeInTheDocument();
    expect(() => fireEvent.keyDown(window, { key: "Escape" })).not.toThrow();
    expect(screen.queryByTestId("room-template-placement-ghost")).toBeNull();
  });

  it("shows an empty Room Templates library when no user templates exist", async () => {
    vi.mocked(listCustomTemplates).mockResolvedValue([]);
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("tab", { name: "Room Templates" }));
    await waitFor(() => expect(screen.getByTestId("room-template-empty-state")).toBeInTheDocument());
    expect(screen.getByText("No Room Templates yet.")).toBeInTheDocument();
    expect(screen.getByText("Select a Room and choose Save Room as Template.")).toBeInTheDocument();
    expect(screen.queryByTestId(/room-template-card-/)).toBeNull();
  });

  it("arms a legacy user template as Room+Furniture ghost, cancels cleanly, and places without openings or navigation changes", async () => {
    const legacyTemplate = {
      id: "room-template-1", scope: "room", name: "Clinic", category: "Office", description: "", width: 120, height: 80, tags: [],
      boundary: [{ wallKey: "old-wall", x1: 0, y1: 0, x2: 120, y2: 0 }],
      objects: [
        { kind: "room", x: 0, y: 0, width: 120, height: 80, type: "clinic", name: "Clinic", accessNodeId: "old-node" },
        { kind: "wall", wallKey: "old-wall", x1: 0, y1: 0, x2: 120, y2: 0 },
        { kind: "door", wallKey: "old-wall", x: 30, y: 0, width: 12, direction: "left", color: "#92400e" },
        { kind: "window", wallKey: "old-wall", x: 80, y: 0, width: 20, height: 4, color: "#38bdf8" },
        { kind: "furniture", x: 16, y: 24, width: 24, height: 18, type: "clinic-bed", name: "Clinic Bed", category: "medical", color: "#bfdbfe", groupKey: "old-group" },
      ],
    } as unknown as CustomTemplateRecord["templateData"];
    vi.mocked(listCustomTemplates).mockResolvedValue([{
      id: "room-template-1", name: "Clinic", description: "", scope: "room", category: "Other", source: "campus", campusId: "campus-1", createdBy: "admin",
      templateData: legacyTemplate, previewMetadata: null, isArchived: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }]);
    const campus = campusFixture();
    campus.buildings[0].floors[0].rooms = [{
      id: "linked-room", name: "Existing Room", type: "office", x: 0, y: 0, w: 70, h: 60,
      floorId: "floor-1", buildingId: "building-1", accessNodeId: "node-existing", accessDoorId: "door-existing", accessDoorIds: ["door-existing"],
    }];
    campus.navNodes = [{ id: "outdoor-node", x: 80, y: 90 } as never];
    campus.navEdges = [{ id: "outdoor-edge", startNodeId: "outdoor-node", endNodeId: "outdoor-node" } as never];
    const beforeNodes = structuredClone(campus.navNodes);
    const beforeEdges = structuredClone(campus.navEdges);
    const updates: Campus[] = [];
    render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);

    fireEvent.click(screen.getByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("tab", { name: "Room Templates" }));
    fireEvent.click(await screen.findByTestId("room-template-place-custom-room-room-template-1"));
    expect(screen.getByTestId("room-template-placement-ghost")).toHaveAttribute("data-valid", "true");
    expect(updates).toHaveLength(0);
    expect(screen.getByTestId("room-template-placement-instruction")).toHaveTextContent("Esc/right-click to cancel");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("room-template-placement-ghost")).toBeNull();
    expect(updates).toHaveLength(0);

    fireEvent.click(await screen.findByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("tab", { name: "Room Templates" }));
    fireEvent.click(await screen.findByTestId("room-template-place-custom-room-room-template-1"));
    const canvas = screen.getByTestId("floor-canvas-boundary").closest("svg")!;
    fireEvent.contextMenu(canvas, { button: 2 });
    expect(screen.queryByTestId("room-template-placement-ghost")).toBeNull();
    expect(updates).toHaveLength(0);

    fireEvent.click(await screen.findByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("tab", { name: "Room Templates" }));
    fireEvent.click(await screen.findByTestId("room-template-place-custom-room-room-template-1"));
    fireEvent.click(screen.getByTestId("room-library-tool"));
    expect(screen.queryByTestId("room-template-placement-ghost")).toBeNull();
    expect(updates).toHaveLength(0);

    fireEvent.click(await screen.findByTestId("floor-template-button"));
    fireEvent.click(screen.getByRole("tab", { name: "Room Templates" }));
    fireEvent.click(await screen.findByTestId("room-template-place-custom-room-room-template-1"));
    fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: 160 });
    await waitFor(() => expect(updates).toHaveLength(1));
    const placedFloor = updates[0].buildings[0].floors[0];
    expect(placedFloor.rooms).toHaveLength(2);
    expect(placedFloor.furniture).toHaveLength(1);
    expect(placedFloor.walls).toHaveLength(0);
    expect(placedFloor.doors).toHaveLength(0);
    expect(placedFloor.windows).toHaveLength(0);
    expect(placedFloor.rooms[0]).toMatchObject({ accessNodeId: "node-existing", accessDoorId: "door-existing", accessDoorIds: ["door-existing"] });
    expect(placedFloor.rooms[1].accessNodeId).toBeUndefined();
    expect(placedFloor.furniture[0].groupId).not.toBe("old-group");
    expect(updates[0].navNodes).toEqual(beforeNodes);
    expect(updates[0].navEdges).toEqual(beforeEdges);
    expect(screen.queryByTestId("room-template-placement-ghost")).toBeNull();

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1].buildings[0].floors[0].rooms).toHaveLength(1);
    expect(updates[1].buildings[0].floors[0].furniture).toHaveLength(0);
    expect(updates[1].navNodes).toEqual(beforeNodes);
    expect(updates[1].navEdges).toEqual(beforeEdges);
  });

  it("exposes only Floor and Room Templates in the Object Library", () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    expect(screen.queryByTestId("furniture-template-button")).toBeNull();
    fireEvent.click(screen.getByTestId("floor-template-button"));
    expect(screen.getByTestId("floor-template-catalogue")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Floor Templates" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Floor Templates" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Room Templates" })).toBeInTheDocument();
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

  it("opens metadata editing from the Floor Template Edit Template menu", async () => {
    const campus = campusFixture();
    const floor = campus.buildings[0].floors[0];
    const templateData = {
      ...sanitizeFloorForTemplate(floor, { name: "Saved Layout", source: "campus" }, campus.id),
      persistedId: "template-row-1",
    };
    vi.mocked(listCustomTemplates).mockResolvedValue([{
      id: "template-row-1", name: "Saved Layout", description: "", scope: "floor", category: "Other", source: "campus",
      campusId: campus.id, createdBy: "admin", templateData, previewMetadata: null, isArchived: false,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as CustomTemplateRecord]);
    const updates: Campus[] = [];
    render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByTestId("floor-template-button"));
    await waitFor(() => expect(screen.getByTestId("floor-template-card-custom-floor-template-row-1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Manage Saved Layout" }));
    fireEvent.click(screen.getByTestId("floor-template-edit-custom-floor-template-row-1"));
    expect(await screen.findByRole("heading", { name: "Edit Floor Template" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Saved Layout")).toBeInTheDocument();
    expect(updates).toHaveLength(0);
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
    expect(screen.getByText(/Save the current Floor to reuse its layout/i)).toBeInTheDocument();
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
