import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PropertiesPanel } from "../PropertiesPanel";
import type { CampusBuilding, CampusEntrance } from "../types";
import type { DoorOption, EntranceIndoorLinkStatus } from "../../../lib/entranceTransitions";

const entrance: CampusEntrance = {
  id: "ent-main",
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
  return { ...render(<PropertiesPanel {...props} />), callbacks };
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
