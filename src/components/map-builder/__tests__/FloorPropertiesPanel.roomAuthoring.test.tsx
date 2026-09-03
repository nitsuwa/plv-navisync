import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FloorPropertiesPanel } from "../FloorPropertiesPanel";

const room = { id: "r1", name: "Room 101", type: "classroom", x: 20, y: 20, w: 80, h: 50, floorId: "f1", buildingId: "b1" };
const wall = { id: "w1", x1: 10, y1: 20, x2: 110, y2: 20, thickness: 4, color: "#64748b", material: "concrete", floorId: "f1", buildingId: "b1" };

function props(overrides: Record<string, unknown> = {}) {
  return {
    selected: { type: "room", id: "r1" },
    mode: "structure",
    rooms: [room], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    issueItems: [],
    onUpdateRoom: vi.fn(), onUpdateWall: vi.fn(), onUpdateDoor: vi.fn(), onUpdateWindow: vi.fn(),
    onUpdateFurniture: vi.fn(), onUpdateStairs: vi.fn(), onUpdateRamp: vi.fn(), onUpdateElevator: vi.fn(), onUpdateLabel: vi.fn(),
    onToggleNavConnection: vi.fn(), onAddPhysicalToNavigation: vi.fn(), onViewPhysicalInNavigation: vi.fn(), onRemovePhysicalFromNavigation: vi.fn(),
    onDeleteSelected: vi.fn(), onDuplicateSelected: vi.fn(), onSetSelectedState: vi.fn(), onLayerAction: vi.fn(), onClose: vi.fn(),
    physicalNavStatus: { kind: "room", linked: false, title: "Room", detail: "Add Room" },
    ...overrides,
  } as any;
}

describe("Room authoring properties", () => {
  it("keeps common Room controls in one inspector and offers Add to Navigation", () => {
    const onAdd = vi.fn();
    render(<FloorPropertiesPanel {...props({ onAddPhysicalToNavigation: onAdd })} />);
    expect(screen.getByTestId("room-primary-properties")).toBeTruthy();
    expect(screen.getByTestId("room-layout-section")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Info" })).toBeNull();
    expect(screen.queryByText("Room Type (optional)")).toBeNull();
    expect(screen.queryByText("Wheelchair accessible")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add to Navigation" }));
    expect(onAdd).toHaveBeenCalledWith("room", "r1");
  });

  it("shows the Door-needed state and starts Room Door linking", () => {
    const onLink = vi.fn();
    render(<FloorPropertiesPanel {...props({
      onLinkRoomDoor: onLink,
      physicalNavStatus: { kind: "room", linked: true, title: "Room", detail: "Room destination" },
      roomDoorStatus: { state: "door_needed", connectionCount: 0 },
    })} />);
    expect(screen.getByText("Room entrance needed")).toBeTruthy();
    fireEvent.click(screen.getByTestId("link-room-door"));
    expect(onLink).toHaveBeenCalledWith("r1");
  });

  it("renders two linked Room Doors and removes only the selected relationship", () => {
    const onRemove = vi.fn();
    render(<FloorPropertiesPanel {...props({
      physicalNavStatus: { kind: "room", linked: true, title: "Room", detail: "Room destination" },
      roomDoorStatus: {
        state: "door_not_connected", connectionCount: 0,
        doorIds: ["door-a", "door-b"], doorNames: ["Room 101 · West Door", "Room 101 · East Door"],
      },
      onRemoveRoomDoor: onRemove,
    })} />);
    expect(screen.getByText("Room 101 · West Door")).toBeTruthy();
    expect(screen.getByText("Room 101 · East Door")).toBeTruthy();
    const removeButtons = screen.getAllByRole("button", { name: /Remove Room 101/ });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith("r1", "door-a");
  });

  it("keeps Wall color prominent and confirms floor-wide color application", () => {
    const onApply = vi.fn();
    render(<FloorPropertiesPanel {...props({
      selected: { type: "wall", id: "w1" },
      rooms: [],
      walls: [wall, { ...wall, id: "w2", color: "#fff" }],
      onApplyWallColorToFloor: onApply,
    })} />);
    expect(screen.getByText("Color")).toBeTruthy();
    expect(screen.getByText("More settings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply color to all Walls on this Floor" }));
    expect(screen.getByTestId("wall-color-confirmation")).toHaveTextContent("all 2 Walls");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith("#64748b");
  });

  it("filters Stair continuation candidates by the selected direction", () => {
    const current = { id: "s-current", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "up", label: "Left Stair", sharedId: "stair-core" };
    const groups = {
      stairs: [{
        id: "stair-core",
        name: "Left Stair",
        usedFloors: [
          { id: "f1", label: "Ground Floor", objectId: "s-current", objectLabel: "Left Stair" },
          { id: "f2", label: "Floor 2", objectId: "s-upper", objectLabel: "Left Stair" },
          { id: "f0", label: "Basement", objectId: "s-lower", objectLabel: "Left Stair" },
        ],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id },
      stairs: [current],
      floorId: "f1",
      buildingFloors: [
        { id: "f0", label: "Basement", number: 0 },
        { id: "f1", label: "Ground Floor", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
      ],
      circulationGroups: groups,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [], waitingFloors: [], directionBlockedFloors: [], connectionCount: 1, detail: "Ready" },
    })} />);
    expect(screen.queryByTestId("circulation-group-picker")).toBeNull();
    expect(screen.getByTestId("circulation-group-trigger-stairs")).toHaveTextContent("Manage Connections");
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const picker = screen.getByTestId("circulation-group-picker");
    expect(picker).toHaveTextContent("Floor 2");
    expect(picker).toHaveTextContent("Basement");
    expect(within(picker).getByTestId("stair-picker-direction-blocked")).toHaveTextContent("Direction is Up");
    expect(within(picker).getByTestId("stair-picker-direction-blocked")).not.toHaveTextContent("Choose intentionally");
  });

  it("does not show a false continuation warning when the usable adjacent side is connected", () => {
    const current = { id: "s-current", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "up", label: "Left Stair", sharedId: "stair-core" };
    const groups = {
      stairs: [{
        id: "stair-core",
        name: "Left Stair",
        usedFloors: [
          { id: "f1", label: "Floor 1", objectId: "s-lower", objectLabel: "Left Stair" },
          { id: "f2", label: "Floor 2", objectId: "s-current", objectLabel: "Left Stair" },
          { id: "f3", label: "Floor 3", objectId: "s-upper", objectLabel: "Left Stair" },
        ],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id }, stairs: [current], floorId: "f2",
      buildingFloors: [
        { id: "f1", label: "Floor 1", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
        { id: "f3", label: "Floor 3", number: 3 },
      ],
      circulationGroups: groups,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [{ id: "f3", label: "Floor 3" }], waitingFloors: [], directionBlockedFloors: [], connectionCount: 1, detail: "Ready" },
    })} />);
    expect(screen.queryByTestId("stair-invalid-continuation")).toBeNull();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    expect(screen.queryByText(/Some connected Stairs are not available/i)).toBeNull();
    expect(screen.getByTestId("stair-picker-floor-f3")).toHaveTextContent("Connected");
  });

  it("shows an explicit Left-to-Right continuation without repairing its identity", () => {
    const current = { id: "s-left-1", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "up", label: "Left Stair", sharedId: "stair-core" };
    const groups = {
      stairs: [{
        id: "stair-core",
        name: "Stair core",
        usedFloors: [
          { id: "f1", label: "Ground Floor", objectId: "s-left-1", objectLabel: "Left Stair" },
          { id: "f2", label: "Floor 2", objectId: "s-left-2", objectLabel: "Left Stair" },
        ],
      }, {
        id: "right-stair-core",
        name: "Right Stair",
        usedFloors: [
          { id: "f2", label: "Floor 2", objectId: "s-right-2", objectLabel: "Right Stair" },
        ],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id },
      stairs: [current],
      floorId: "f1",
      buildingFloors: [
        { id: "f1", label: "Ground Floor", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
      ],
      circulationGroups: groups,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [{ id: "f2", label: "Floor 2" }], waitingFloors: [], directionBlockedFloors: [], connectionCount: 1, detail: "Ready" },
    })} />);
    expect(screen.getByText("Left Stair")).toBeTruthy();
    expect(screen.getByText("Floor 2")).toBeTruthy();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const picker = screen.getByTestId("circulation-group-picker");
    expect(screen.getByRole("dialog")).toHaveTextContent("Stair Connections");
    expect(screen.getByTestId("stair-picker-current-floor")).toHaveTextContent("Ground Floor");
    fireEvent.click(screen.getByTestId("stair-change-floor-f2"));
    expect(screen.getByTestId("circulation-group-picker")).toHaveTextContent("Left Stair");
    expect(screen.getByTestId("circulation-group-picker")).toHaveTextContent("Right Stair");
  });

  it("recommends the matching Stair and confirms an explicit cross-pair", () => {
    const onChange = vi.fn();
    const current = { id: "s-left-1", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "up", label: "Left Stair" };
    const groups = {
      stairs: [{
        id: "left-stair-core",
        name: "Left Stair",
        usedFloors: [{ id: "f2", label: "Floor 2", objectId: "s-left-2", objectLabel: "Left Stair" }],
      }, {
        id: "right-stair-core",
        name: "Right Stair",
        usedFloors: [{ id: "f2", label: "Floor 2", objectId: "s-right-2", objectLabel: "Right Stair" }],
      }],
      elevators: [],
    };
    const panelProps = props({
      selected: { type: "stairs", id: current.id }, stairs: [current], floorId: "f1",
      buildingFloors: [{ id: "f1", label: "Ground Floor", number: 1 }, { id: "f2", label: "Floor 2", number: 2 }],
      circulationGroups: groups, onCirculationGroupChange: onChange,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [], waitingFloors: [], directionBlockedFloors: [], connectionCount: 0, detail: "Ready" },
    });
    const panel = render(<FloorPropertiesPanel {...panelProps} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const picker = screen.getByTestId("circulation-group-picker");
    expect(within(picker).getByTestId("stair-picker-recommended")).toHaveTextContent("Left Stair");
    expect(within(picker).getByTestId("stair-picker-other")).toHaveTextContent("Right Stair");

    const recommended = within(picker).getByTestId("stair-picker-recommended");
    fireEvent.click(within(recommended).getByRole("button", { name: /Left Stair/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("stair-cross-pair-confirmation")).toHaveTextContent("Connect Left Stair to Left Stair on Floor 2?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(within(screen.getByTestId("circulation-group-picker")).getByRole("button", { name: /Right Stair/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("stair-cross-pair-confirmation")).toHaveTextContent("Connect Left Stair to Right Stair on Floor 2?");
    panel.rerender(<FloorPropertiesPanel {...panelProps} />);
    expect(screen.getByTestId("stair-cross-pair-confirmation")).toHaveTextContent("Connect Left Stair to Right Stair on Floor 2?");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("stairs", "s-left-1", "right-stair-core");
  });

  it("keeps an established shared identity recommended after a target is renamed", () => {
    const current = { id: "s-left-1", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "up", label: "Left Stair", sharedId: "left-stair-core" };
    const groups = {
      stairs: [{
        id: "left-stair-core",
        name: "Left Stair",
        usedFloors: [{ id: "f2", label: "Floor 2", objectId: "s-left-2", objectLabel: "West Stair" }],
      }, {
        id: "matching-label-core",
        name: "Left Stair",
        usedFloors: [{ id: "f2", label: "Floor 2", objectId: "s-other-2", objectLabel: "Left Stair" }],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id }, stairs: [current], floorId: "f1",
      buildingFloors: [{ id: "f1", label: "Ground Floor", number: 1 }, { id: "f2", label: "Floor 2", number: 2 }],
      circulationGroups: groups,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [{ id: "f2", label: "Floor 2" }], waitingFloors: [], directionBlockedFloors: [], connectionCount: 1, detail: "Ready" },
    })} />);
    expect(screen.getByText("West Stair")).toBeTruthy();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    expect(within(screen.getByTestId("circulation-group-picker")).getByTestId("stair-picker-connected")).toHaveTextContent("West Stair");
    fireEvent.click(screen.getByTestId("stair-change-floor-f2"));
    expect(within(screen.getByTestId("circulation-group-picker")).getByTestId("stair-picker-other")).toHaveTextContent("Left Stair");
  });

  it("keeps duplicate labels as explicit choices instead of auto-selecting one", () => {
    const onChange = vi.fn();
    const current = { id: "s-current", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "up", label: "Left Stair" };
    const groups = {
      stairs: [{
        id: "left-a",
        name: "Left Stair",
        usedFloors: [{ id: "f2", label: "Floor 2", objectId: "s-a", objectLabel: "Left Stair" }],
      }, {
        id: "left-b",
        name: "Left Stair",
        usedFloors: [{ id: "f2", label: "Floor 2", objectId: "s-b", objectLabel: "Left Stair" }],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id }, stairs: [current], floorId: "f1",
      buildingFloors: [{ id: "f1", label: "Ground Floor", number: 1 }, { id: "f2", label: "Floor 2", number: 2 }],
      circulationGroups: groups, onCirculationGroupChange: onChange,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [], waitingFloors: [], directionBlockedFloors: [], connectionCount: 0, detail: "Ready" },
    })} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const picker = screen.getByTestId("circulation-group-picker");
    expect(within(picker).getAllByRole("button", { name: /Left Stair/ })).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens one right-side connection panel with current Floor highlighted and targets in floor order", () => {
    const current = { id: "s-left-2", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "both", label: "Left Stair", sharedId: "left-stair-core" };
    const groups = {
      stairs: [{
        id: "left-stair-core",
        name: "Left Stair",
        usedFloors: [
          { id: "f1", label: "Floor 1", objectId: "s-left-1", objectLabel: "Left Stair" },
          { id: "f3", label: "Floor 3", objectId: "s-left-3", objectLabel: "Left Stair" },
        ],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id }, stairs: [current], floorId: "f2",
      buildingFloors: [
        { id: "f1", label: "Floor 1", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
        { id: "f3", label: "Floor 3", number: 3 },
      ],
      circulationGroups: groups,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [{ id: "f1", label: "Floor 1" }, { id: "f3", label: "Floor 3" }], waitingFloors: [], directionBlockedFloors: [], connectionCount: 2, detail: "Ready" },
    })} />);
    expect(screen.queryByTestId("circulation-group-picker")).toBeNull();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    const content = screen.getByTestId("stair-connections-dialog-content");
    expect(screen.getByTestId("stair-connections-side-panel")).toBeTruthy();
    expect(screen.queryByTestId("stair-connections-dialog-backdrop")).toBeNull();
    const targetSections = within(content).getAllByTestId(/^stair-picker-floor-/);
    expect(targetSections[0]).toHaveTextContent("Floor 3");
    expect(targetSections[1]).toHaveTextContent("Floor 1");
    expect(within(content).getByTestId("stair-picker-current-floor")).toHaveTextContent("Floor 2");
  });

  it("disconnects an established Stair continuation without deleting the Stair", () => {
    const onChange = vi.fn();
    const current = { id: "s-left-1", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "up", label: "Left Stair", sharedId: "left-stair-core" };
    const groups = {
      stairs: [{
        id: "left-stair-core",
        name: "Left Stair",
        usedFloors: [{ id: "f2", label: "Floor 2", objectId: "s-left-2", objectLabel: "Left Stair" }],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id }, stairs: [current], floorId: "f1",
      buildingFloors: [{ id: "f1", label: "Floor 1", number: 1 }, { id: "f2", label: "Floor 2", number: 2 }],
      circulationGroups: groups, onCirculationGroupChange: onChange,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [{ id: "f2", label: "Floor 2" }], waitingFloors: [], directionBlockedFloors: [], connectionCount: 1, detail: "Ready" },
    })} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    fireEvent.click(screen.getByTestId("stair-disconnect-floor-f2"));
    expect(onChange).toHaveBeenCalledWith("stairs", "s-left-1", undefined);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("routes Stair Change/Disconnect to the exact target occurrence", () => {
    const onChange = vi.fn();
    const onDisconnect = vi.fn();
    const current = { id: "s-middle", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "both", label: "Left Stair", sharedId: "left-chain" };
    const groups = {
      stairs: [{
        id: "left-chain",
        name: "Left Stair",
        usedFloors: [
          { id: "f1", label: "Floor 1", objectId: "s-lower", objectLabel: "Left Stair" },
          { id: "f2", label: "Floor 2", objectId: "s-middle", objectLabel: "Left Stair" },
          { id: "f3", label: "Floor 3", objectId: "s-upper", objectLabel: "Left Stair" },
        ],
      }],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id }, stairs: [current], floorId: "f2",
      buildingFloors: [
        { id: "f1", label: "Floor 1", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
        { id: "f3", label: "Floor 3", number: 3 },
      ],
      circulationGroups: groups,
      onCirculationGroupChange: onChange,
      onStairConnectionChange: onChange,
      onStairConnectionDisconnect: onDisconnect,
      circulationNavStatus: { kind: "stairs", linked: true, connectedFloors: [{ id: "f1", label: "Floor 1" }, { id: "f3", label: "Floor 3" }], waitingFloors: [], directionBlockedFloors: [], connectionCount: 2, detail: "Ready" },
    })} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    fireEvent.click(screen.getByTestId("stair-disconnect-floor-f3"));
    expect(onDisconnect).toHaveBeenCalledWith("s-middle", "f3", "s-upper");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the Stair connection manager open for panel clicks and closes on Escape", () => {
    const current = { id: "s-current", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "both", label: "Left Stair" };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id },
      stairs: [current],
      floorId: "f1",
      buildingFloors: [
        { id: "f1", label: "Floor 1", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
      ],
      circulationGroups: { stairs: [], elevators: [] },
      circulationNavStatus: {
        kind: "stairs", linked: false, connectedFloors: [], waitingFloors: [],
        directionBlockedFloors: [], connectionCount: 0,
        detail: "Connect this Stair to the local Walking Network.",
      },
    })} />);
    expect(screen.queryByText("More settings (optional)")).toBeNull();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    expect(screen.getByTestId("stair-manager-issues")).toHaveTextContent("Navigation unavailable");
    fireEvent.mouseLeave(screen.getByTestId("circulation-group-picker"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("stair-connections-side-panel"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers an explicit matching-Stairs shortcut for unambiguous adjacent labels", () => {
    const onMatching = vi.fn();
    const current = { id: "s-left-2", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "both", label: "Left Stair" };
    const groups = {
      stairs: [
        { id: "left-f1", name: "Left Stair", usedFloors: [{ id: "f1", label: "Floor 1", objectId: "s-left-1", objectLabel: "Left Stair" }] },
        { id: "left-f3", name: "Left Stair", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "s-left-3", objectLabel: "Left Stair" }] },
      ],
      elevators: [],
    };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id },
      stairs: [current],
      floorId: "f2",
      buildingFloors: [
        { id: "f1", label: "Floor 1", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
        { id: "f3", label: "Floor 3", number: 3 },
      ],
      circulationGroups: groups,
      onStairConnectionsChange: onMatching,
    })} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    fireEvent.click(screen.getByRole("button", { name: "Connect Matching Stairs" }));
    const confirmation = screen.getByTestId("stair-matching-confirmation");
    expect(confirmation).toHaveTextContent("Above");
    expect(confirmation).toHaveTextContent("Floor 3 · Left Stair");
    expect(confirmation).toHaveTextContent("Below");
    expect(confirmation).toHaveTextContent("Floor 1 · Left Stair");
    expect(onMatching).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Connect" }));
    expect(onMatching).toHaveBeenCalledTimes(1);
    expect(onMatching).toHaveBeenCalledWith("s-left-2", [
      { targetFloorId: "f3", targetStairId: "s-left-3" },
      { targetFloorId: "f1", targetStairId: "s-left-1" },
    ]);
  });

  it("suppresses the matching-Stairs shortcut when a target label is ambiguous", () => {
    const current = { id: "s-left-2", x: 20, y: 20, width: 24, height: 30, rotation: 0, flip: false, direction: "both", label: "Left Stair" };
    render(<FloorPropertiesPanel {...props({
      selected: { type: "stairs", id: current.id },
      stairs: [current],
      floorId: "f2",
      buildingFloors: [
        { id: "f1", label: "Floor 1", number: 1 },
        { id: "f2", label: "Floor 2", number: 2 },
        { id: "f3", label: "Floor 3", number: 3 },
      ],
      circulationGroups: {
        stairs: [
          { id: "left-a", name: "Left Stair", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "s-left-a", objectLabel: "Left Stair" }] },
          { id: "left-b", name: "Left Stair", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "s-left-b", objectLabel: "Left Stair" }] },
        ],
        elevators: [],
      },
    })} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-stairs"));
    expect(screen.queryByRole("button", { name: "Connect Matching Stairs" })).toBeNull();
  });
});
