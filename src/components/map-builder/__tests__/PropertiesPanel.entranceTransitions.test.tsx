import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PropertiesPanel } from "../PropertiesPanel";
import type { Campus, CampusBuilding, CampusEntrance, FloorPlan, NavigationEdge, NavigationNode } from "../types";
import type { DoorOption, EntranceIndoorLinkStatus } from "../../../lib/entranceTransitions";
import { ENTRANCE_TRANSITION_EDGE_TYPE } from "../../../lib/entranceTransitions";

const entrance: CampusEntrance = {
  id: "ent-main",
  buildingId: "b1",
  name: "Main Entrance",
  type: "general",
  edge: "bottom",
  offset: 0.5,
  accessible: true,
  isPrimary: true,
};

const building: CampusBuilding = {
  id: "b1",
  name: "Main Building",
  code: "MB",
  category: "Academic",
  description: "",
  x: 100,
  y: 100,
  width: 120,
  height: 80,
  color: "#1e40af",
  entrances: [entrance],
  floors: [],
};

const linkedOption: DoorOption = {
  floorId: "f1",
  floorLabel: "Ground Floor",
  floorNumber: 1,
  doorId: "door-main",
  doorLabel: "Main Lobby Door",
  nodeId: "door-node",
  linked: true,
  entryFloor: true,
  eligible: true,
};

const unlinkedOption: DoorOption = {
  floorId: "f1",
  floorLabel: "Ground Floor",
  floorNumber: 1,
  doorId: "door-side",
  doorLabel: "Side Door",
  linked: false,
  entryFloor: true,
  eligible: false,
  ineligibleReason: "not_linked",
};

const wrongFloorOption: DoorOption = {
  floorId: "f2",
  floorLabel: "Floor 2",
  floorNumber: 2,
  doorId: "door-f2",
  doorLabel: "Floor 2 Side Door",
  nodeId: "door-node-f2",
  linked: true,
  entryFloor: false,
  eligible: false,
  ineligibleReason: "wrong_floor",
};

const reorderedEntryFloorOption: DoorOption = {
  floorId: "f3",
  floorLabel: "Floor 3",
  floorNumber: 3,
  doorId: "door-f3",
  doorLabel: "Floor 3 Door",
  nodeId: "door-node-f3",
  linked: true,
  entryFloor: true,
  eligible: true,
};

const staleCurrentGroundOption: DoorOption = {
  ...linkedOption,
  entryFloor: false,
  eligible: false,
  ineligibleReason: "wrong_floor",
};

function renderEntrancePanel(overrides: Partial<React.ComponentProps<typeof PropertiesPanel>> = {}) {
  const callbacks = {
    onUpdateBuilding: vi.fn(),
    onAddEntrance: vi.fn(),
    onSelectEntrance: vi.fn(),
    onUpdateEntrance: vi.fn(),
    onDeleteEntrance: vi.fn(),
    onConnectEntranceToDoor: vi.fn(),
    onRemoveEntranceConnection: vi.fn(),
    onViewEntranceIndoorDoor: vi.fn(),
    onUpdateMarker: vi.fn(),
    onUpdateDecorAsset: vi.fn(),
    onDeleteDecorAsset: vi.fn(),
    onDuplicateDecorAsset: vi.fn(),
    onDeleteBuilding: vi.fn(),
    onDeleteMarker: vi.fn(),
    onClose: vi.fn(),
    onBatchUpdateBuildings: vi.fn(),
    onBatchDeleteBuildings: vi.fn(),
    onClearMultiSelect: vi.fn(),
  };
  const props: React.ComponentProps<typeof PropertiesPanel> = {
    selected: { type: "entrance", id: entrance.id, buildingId: building.id },
    selBldg: undefined,
    selEntrance: entrance,
    selEntranceParent: building,
    selMkr: undefined,
    selRoute: undefined,
    selDecorAsset: undefined,
    allDecorAssets: [],
    selNavNode: undefined,
    selNavEdge: undefined,
    selEventOverlay: undefined,
    allNavNodes: [],
    allNavEdges: [],
    entranceLinkStatus: { state: "not_linked" },
    entranceDoorOptions: [linkedOption, unlinkedOption],
    allBuildings: [building],
    layer: "campus",
    multiSelected: [],
    multiSelectedBuildings: [],
    selectedOutdoorCount: 0,
    ...callbacks,
    ...overrides,
  };
  return { ...render(<PropertiesPanel {...props} />), callbacks, props };
}

describe("B5 Phase 4.1 - entrance linking PropertiesPanel UI", () => {
  it("opens the indoor Door picker without rendering browser globals as components", () => {
    const { callbacks } = renderEntrancePanel();

    fireEvent.click(screen.getByRole("button", { name: /Connect to Indoor Door/i }));

    expect(screen.getByTestId("entrance-door-picker")).toBeInTheDocument();
    expect(screen.getByText("Ground Floor")).toBeInTheDocument();
    expect(screen.getByText("Main Lobby Door")).toBeInTheDocument();
    expect(screen.getByText("Side Door")).toBeInTheDocument();
    expect(screen.getByText("Choose the navigation-linked indoor Door that represents where this exterior Entrance leads.")).toBeInTheDocument();
    expect(screen.getByText("Add this Door to navigation first")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Select/i }).find((button) => !button.hasAttribute("disabled"))!);
    expect(callbacks.onConnectEntranceToDoor).toHaveBeenCalledWith("b1", "ent-main", "door-node");
  });

  it("renders a safe empty picker state when the building has no Doors", () => {
    renderEntrancePanel({ entranceDoorOptions: [] });

    fireEvent.click(screen.getByRole("button", { name: /Connect to Indoor Door/i }));

    expect(screen.getByTestId("entrance-door-picker")).toBeInTheDocument();
    expect(screen.getByText("No indoor Doors yet")).toBeInTheDocument();
    expect(screen.getByText("Add a Door to navigation on the building entry floor before connecting this Entrance.")).toBeInTheDocument();
    expect(screen.getByText("Open the entry floor, select the Door, then choose Add to Navigation.")).toBeInTheDocument();
  });

  it("renders wrong-floor doors as ineligible and explains when no eligible entry-floor door exists", () => {
    renderEntrancePanel({ entranceDoorOptions: [wrongFloorOption] });

    fireEvent.click(screen.getByRole("button", { name: /Connect to Indoor Door/i }));

    expect(screen.getByText("No eligible navigation-linked Doors found on the building entry floor.")).toBeInTheDocument();
    expect(screen.getByText("Floor 2 Side Door")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select/i })).toBeDisabled();
    expect(screen.getByText("Not on the building entry floor")).toBeInTheDocument();
  });

  it("renders linked Change, Remove, and View Indoor Door actions safely", () => {
    const status: EntranceIndoorLinkStatus = {
      state: "linked",
      floorId: "f1",
      floorLabel: "Ground Floor",
      doorId: "door-main",
      doorLabel: "Main Lobby Door",
      nodeId: "door-node",
      edgeId: "edge-1",
      entryFloor: true,
    };
    const { callbacks } = renderEntrancePanel({ entranceLinkStatus: status });

    expect(screen.getByText("Connected indoors")).toBeInTheDocument();
    expect(screen.getByText("Ground Floor - Main Lobby Door")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View Indoor Door/i }));
    expect(callbacks.onViewEntranceIndoorDoor).toHaveBeenCalledWith("b1", "f1", "door-main");

    fireEvent.click(screen.getByRole("button", { name: /Change/i }));
    expect(screen.getByTestId("entrance-door-picker")).toBeInTheDocument();
    expect(screen.getByText("Current connection: Ground Floor - Main Lobby Door")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Remove Connection/i }));
    expect(callbacks.onRemoveEntranceConnection).toHaveBeenCalledWith("b1", "ent-main");
  });

  it("renders the missing relationship state without dereferencing stale floor or Door data", () => {
    renderEntrancePanel({ entranceLinkStatus: { state: "missing", edgeId: "edge-1" } });

    expect(screen.getByText("Indoor connection missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Connect to Indoor Door/i }));
    expect(screen.getByTestId("entrance-door-picker")).toBeInTheDocument();
  });

  it("renders stale linked entrance status as a warning with the linked Door name", () => {
    renderEntrancePanel({
      entranceLinkStatus: {
        state: "linked",
        floorId: "f2",
        floorLabel: "Floor 2",
        doorId: "door-f2",
        doorLabel: "Floor 2 Side Door",
        nodeId: "door-node-f2",
        edgeId: "edge-1",
        entryFloor: false,
        warning: "Connected door is no longer on the building entry floor.",
      },
    });

    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Floor 2 - Floor 2 Side Door")).toBeInTheDocument();
    expect(screen.getByText("Connected door is no longer on the building entry floor.")).toBeInTheDocument();
  });

  it("keeps a reordered current Door marked current but invalid while new entry-floor Doors are selectable", () => {
    const { callbacks } = renderEntrancePanel({
      entranceDoorOptions: [reorderedEntryFloorOption, staleCurrentGroundOption],
      entranceLinkStatus: {
        state: "linked",
        floorId: "f1",
        floorLabel: "Ground Floor",
        doorId: "door-main",
        doorLabel: "Main Lobby Door",
        nodeId: "door-node",
        edgeId: "edge-1",
        entryFloor: false,
        warning: "Connected door is no longer on the building entry floor.",
      },
    });

    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Connected door is no longer on the building entry floor.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Change/i }));

    const floor3Header = screen.getByText("Floor 3");
    const groundHeader = screen.getByText("Ground Floor");
    expect(floor3Header.compareDocumentPosition(groundHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Current - Not on the building entry floor")).toBeInTheDocument();
    expect(screen.getByText("Floor 3 Door")).toBeInTheDocument();
    expect(screen.getByText("Main Lobby Door")).toBeInTheDocument();
    expect(screen.getByText("Current connection: Ground Floor - Main Lobby Door")).toBeInTheDocument();

    const floor3Group = floor3Header.closest(".rounded-xl")!;
    const groundGroup = groundHeader.closest(".rounded-xl")!;
    expect(within(floor3Group as HTMLElement).getByRole("button", { name: /Select/i })).toBeEnabled();
    expect(within(groundGroup as HTMLElement).getByText("Needs review")).toBeInTheDocument();

    fireEvent.click(within(floor3Group as HTMLElement).getByRole("button", { name: /Select/i }));
    expect(callbacks.onConnectEntranceToDoor).toHaveBeenCalledWith("b1", "ent-main", "door-node-f3");
  });
});

describe("Building Navigation summary and identity drafts", () => {
  const makeNode = (id: string, type: NavigationNode["type"], refs: Partial<NavigationNode> = {}): NavigationNode => ({
    id,
    name: id,
    type,
    x: 10,
    y: 20,
    accessible: true,
    color: "#2563eb",
    ...refs,
  });
  const makeEdge = (id: string, startNodeId: string, endNodeId: string, type = "walkway"): NavigationEdge => ({
    id,
    startNodeId,
    endNodeId,
    distance: 10,
    bidirectional: true,
    accessible: true,
    type,
    color: "#2563eb",
    width: 3,
  });
  const threeEntranceBuilding: CampusBuilding = {
    ...building,
    entrances: [
      { ...entrance, id: "ent-a", name: "North Entrance", isPrimary: false },
      { ...entrance, id: "ent-b", name: "South Entrance", isPrimary: false },
      { ...entrance, id: "ent-c", name: "Service Entrance", isPrimary: false },
    ],
    floors: [{
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      rooms: [],
      paths: [],
      walls: [],
      doors: [{ id: "door-a", x: 20, y: 20, width: 24, direction: "left", color: "#fff", label: "Lobby Door" }],
      windows: [],
      furniture: [],
      stairs: [],
      ramps: [],
      elevators: [],
      labels: [],
    } as FloorPlan],
  };
  const linkedCampus = (outdoorConnectionCount = 2): Campus => ({
    id: "campus-1",
    buildings: [threeEntranceBuilding],
    navNodes: [
      makeNode("ent-a-node", "entrance", { buildingId: "b1", entranceId: "ent-a" }),
      makeNode("ent-b-node", "entrance", { buildingId: "b1", entranceId: "ent-b" }),
      makeNode("ent-c-node", "entrance", { buildingId: "b1", entranceId: "ent-c" }),
      makeNode("walk-a", "outdoor"),
      makeNode("walk-b", "outdoor"),
      makeNode("door-a-node", "hallway", { buildingId: "b1", floorId: "f1", doorId: "door-a" }),
    ],
    navEdges: [
      ...[
        makeEdge("out-a", "ent-a-node", "walk-a"),
        makeEdge("out-b", "ent-b-node", "walk-b"),
      ].slice(0, outdoorConnectionCount),
      makeEdge("indoor-a", "ent-a-node", "door-a-node", ENTRANCE_TRANSITION_EDGE_TYPE),
    ],
  } as unknown as Campus);
  const openAdvancedBuilding = (campus: Campus) => {
    const view = renderEntrancePanel({
      selected: { type: "building", id: threeEntranceBuilding.id },
      selBldg: threeEntranceBuilding,
      selEntrance: undefined,
      selEntranceParent: undefined,
      navigationCampus: campus,
      allBuildings: [threeEntranceBuilding],
    });
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    return view;
  };

  it("aggregates authored outdoor links independently from Primary Entrance and counts indoor links", () => {
    openAdvancedBuilding(linkedCampus());

    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("Connected · 2 entrances")).toBeInTheDocument();
    expect(screen.getByText("1 linked entrance")).toBeInTheDocument();
  });

  it("shows a single valid entrance link as connected", () => {
    openAdvancedBuilding(linkedCampus(1));

    expect(screen.getByText("Connected · 1 entrance")).toBeInTheDocument();
  });

  it("updates the outdoor summary when the final authored entrance link is removed", () => {
    const campus = linkedCampus();
    const view = openAdvancedBuilding(campus);
    expect(screen.getByText("Connected · 2 entrances")).toBeInTheDocument();

    view.rerender(<PropertiesPanel {...view.props} navigationCampus={linkedCampus(0)} />);

    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("1 linked entrance")).toBeInTheDocument();
  });

  it("keeps Name and Code keystrokes local, then commits one edit on blur", () => {
    const { callbacks } = renderEntrancePanel({
      selected: { type: "building", id: building.id },
      selBldg: building,
      selEntrance: undefined,
      selEntranceParent: undefined,
    });
    const name = screen.getByLabelText("Name") as HTMLTextAreaElement;
    fireEvent.change(name, { target: { value: "College of Engineering" } });
    expect(name).toHaveValue("College of Engineering");
    expect(callbacks.onUpdateBuilding).not.toHaveBeenCalled();
    fireEvent.blur(name);
    expect(callbacks.onUpdateBuilding).toHaveBeenCalledTimes(1);
    expect(callbacks.onUpdateBuilding).toHaveBeenLastCalledWith("b1", { name: "College of Engineering" });

    const code = screen.getByLabelText("Code") as HTMLInputElement;
    fireEvent.change(code, { target: { value: "ceit" } });
    expect(code).toHaveValue("CEIT");
    expect(callbacks.onUpdateBuilding).toHaveBeenCalledTimes(1);
    fireEvent.blur(code);
    expect(callbacks.onUpdateBuilding).toHaveBeenCalledTimes(2);
    expect(callbacks.onUpdateBuilding).toHaveBeenLastCalledWith("b1", { code: "CEIT" });
  });

  it("flushes an uncommitted Name draft when the selected Building changes", () => {
    const view = renderEntrancePanel({
      selected: { type: "building", id: building.id },
      selBldg: building,
      selEntrance: undefined,
      selEntranceParent: undefined,
    });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pending Building Name" } });
    const nextBuilding: CampusBuilding = { ...building, id: "b2", name: "Second Building", code: "SB" };

    view.rerender(<PropertiesPanel
      {...view.props}
      selected={{ type: "building", id: nextBuilding.id }}
      selBldg={nextBuilding}
      allBuildings={[building, nextBuilding]}
    />);

    expect(view.callbacks.onUpdateBuilding).toHaveBeenCalledTimes(1);
    expect(view.callbacks.onUpdateBuilding).toHaveBeenCalledWith("b1", { name: "Pending Building Name" });
  });
});
