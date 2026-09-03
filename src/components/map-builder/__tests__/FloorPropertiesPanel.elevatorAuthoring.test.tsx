import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { FloorPropertiesPanel } from "../FloorPropertiesPanel";

const currentElevator = { id: "el-f2", x: 40, y: 40, width: 20, height: 20, doorWidth: 6, label: "Left Elevator", sharedId: "lift-left", floors: [1, 2, 3] };
const baseProps = {
  selected: { type: "elevator", id: currentElevator.id }, mode: "structure",
  rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [currentElevator], labels: [], issueItems: [],
  floorId: "f2", buildingFloors: [{ id: "f1", label: "Ground Floor", number: 1 }, { id: "f2", label: "Floor 2", number: 2 }, { id: "f3", label: "Floor 3", number: 3 }],
  circulationGroups: { stairs: [], elevators: [{ id: "lift-left", name: "Left Elevator", usedFloors: [{ id: "f1", label: "Ground Floor", objectId: "el-f1", objectLabel: "Left Elevator" }, { id: "f2", label: "Floor 2", objectId: "el-f2", objectLabel: "Left Elevator" }] }, { id: "lift-right", name: "Right Elevator", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "el-f3r", objectLabel: "Right Elevator" }] }] },
  circulationNavStatus: { kind: "elevator", linked: true, connectedFloors: [{ id: "f1", label: "Ground Floor" }], waitingFloors: [], servedFloors: [], connectionCount: 1, detail: "Ready" },
  physicalNavStatus: undefined,
  onUpdateRoom: vi.fn(), onUpdateWall: vi.fn(), onUpdateDoor: vi.fn(), onUpdateWindow: vi.fn(), onUpdateFurniture: vi.fn(), onUpdateStairs: vi.fn(), onUpdateRamp: vi.fn(), onUpdateElevator: vi.fn(), onUpdateLabel: vi.fn(), onToggleNavConnection: vi.fn(),
  onAddPhysicalToNavigation: vi.fn(), onViewPhysicalInNavigation: vi.fn(), onRemovePhysicalFromNavigation: vi.fn(), onDeleteSelected: vi.fn(), onDuplicateSelected: vi.fn(), onSetSelectedState: vi.fn(), onLayerAction: vi.fn(), onClose: vi.fn(),
};

describe("Elevator authoring connections", () => {
  it("opens a stable floor-aware manager instead of a flat shaft picker", () => {
    render(<FloorPropertiesPanel {...baseProps as any} />);
    expect(screen.queryByTestId("elevator-connections-side-panel")).toBeNull();
    expect(screen.getByRole("button", { name: "Manage Elevator Connections" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    const manager = screen.getByTestId("elevator-connections-manager");
    expect(manager).toHaveTextContent("Elevator Connections");
    expect(manager).toHaveTextContent("Floor 2 · Current");
    expect(manager).toHaveTextContent("Ground Floor");
    expect(manager).toHaveTextContent("Floor 3");
    expect(manager).not.toHaveTextContent("Above");
    expect(manager).not.toHaveTextContent("Below");
    expect(screen.queryByPlaceholderText(/Rename/i)).toBeNull();
  });

  it("requires explicit confirmation for a matching target occurrence", async () => {
    const onConnect = vi.fn();
    render(<FloorPropertiesPanel {...baseProps as any} onElevatorConnectionChange={onConnect} circulationGroups={{ ...baseProps.circulationGroups, elevators: [
      ...baseProps.circulationGroups.elevators,
      { id: "lift-upper", name: "Upper Elevator", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "el-f3", objectLabel: "Left Elevator" }] },
    ]}} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    const row = screen.getByTestId("elevator-floor-f3");
    fireEvent.click(within(row).getByTestId("elevator-floor-toggle-f3"));
    const expandedRow = await screen.findByTestId("elevator-floor-f3");
    fireEvent.click(within(expandedRow).getByRole("button", { name: /Choose Elevator/ }));
    await waitFor(() => expect(within(screen.getByTestId("elevator-floor-f3")).getAllByRole("button", { name: /Left Elevator/ }).length).toBeGreaterThan(0));
    fireEvent.click(within(screen.getByTestId("elevator-floor-f3")).getAllByRole("button", { name: /Left Elevator/ })[0]);
    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByText(/Connect this Elevator to Left Elevator on Floor 3/)).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("elevator-floor-f3")).getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledWith("el-f2", "f3", "el-f3");
  });

  it("offers an unambiguous same-name match without connecting until confirmed", () => {
    const onConnect = vi.fn();
    render(<FloorPropertiesPanel {...baseProps as any} onElevatorConnectionChange={onConnect} circulationGroups={{
      stairs: [],
      elevators: [
        { id: "lift-current", name: "Elevator 1", usedFloors: [{ id: "f2", label: "Floor 2", objectId: "el-f2", objectLabel: "Elevator 1" }] },
        { id: "lift-target", name: "Elevator 1", usedFloors: [
          { id: "f1", label: "Ground Floor", objectId: "el-f1", objectLabel: "Elevator 1" },
          { id: "f3", label: "Floor 3", objectId: "el-f3", objectLabel: "Elevator 1" },
        ] },
      ],
    }} selected={{ type: "elevator", id: "el-f2" }} elevators={[{ ...currentElevator, label: "Elevator 1", sharedId: "lift-current", floors: [2, 3] }]} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    expect(screen.getByTestId("elevator-matching-shortcut")).toBeInTheDocument();
    expect(onConnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Connect Matching Elevators" }));
    const confirmation = screen.getByTestId("elevator-matching-confirmation");
    expect(confirmation).toHaveTextContent("Floor 3");
    expect(onConnect).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledWith("el-f2", "f3", "el-f3");
  });

  it("offers an established shaft as one recommended join target", async () => {
    const onConnect = vi.fn();
    render(<FloorPropertiesPanel {...baseProps as any} onElevatorConnectionChange={onConnect} circulationGroups={{
      stairs: [],
      elevators: [
        { id: "lift-current", name: "Elevator 1", usedFloors: [{ id: "f2", label: "Floor 2", objectId: "el-f2", objectLabel: "Elevator 1" }] },
        { id: "lift-shaft", name: "Elevator 1", usedFloors: [
          { id: "f1", label: "Ground Floor", objectId: "el-f1", objectLabel: "Elevator 1" },
          { id: "f3", label: "Floor 3", objectId: "el-f3", objectLabel: "Elevator 1" },
        ] },
      ],
    }} selected={{ type: "elevator", id: "el-f2" }} elevators={[{ ...currentElevator, label: "Elevator 1", sharedId: "lift-current", floors: [1, 2, 3] }]} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    const row = screen.getByTestId("elevator-floor-f3");
    fireEvent.click(within(row).getByTestId("elevator-floor-toggle-f3"));
    const expandedRow = await screen.findByTestId("elevator-floor-f3");
    fireEvent.click(within(expandedRow).getByRole("button", { name: /Choose Elevator/ }));
    const shaft = await within(screen.getByTestId("elevator-floor-f3")).findByRole("button", { name: /Elevator 1/ });
    expect(shaft).not.toBeDisabled();
    expect(shaft).toHaveTextContent("Connected floors: Ground Floor, Floor 3");
    fireEvent.click(shaft);
    expect(screen.getByText(/Connect this Elevator to Elevator 1 on Floor 3/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("elevator-floor-f3")).getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledWith("el-f2", "f3", "el-f3");
  });

  it("disables an occurrence already owned by another Elevator identity when changing an established shaft", async () => {
    const groups = {
      stairs: [],
      elevators: [
        { id: "lift-current", name: "Elevator 2", usedFloors: [
          { id: "f1", label: "Ground Floor", objectId: "el-current-f1", objectLabel: "Elevator 2" },
          { id: "f2", label: "Floor 2", objectId: "el-f2", objectLabel: "Elevator 2" },
        ] },
        { id: "lift-owned", name: "Elevator 1", usedFloors: [
          { id: "f1", label: "Ground Floor", objectId: "el-f1", objectLabel: "Elevator 1" },
          { id: "f3", label: "Floor 3", objectId: "el-f3", objectLabel: "Elevator 1" },
        ] },
      ],
    };
    render(<FloorPropertiesPanel {...baseProps as any} circulationGroups={groups} selected={{ type: "elevator", id: "el-f2" }} elevators={[{ ...currentElevator, label: "Elevator 2", sharedId: "lift-current", floors: [1, 2, 3] }]} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    const row = screen.getByTestId("elevator-floor-f3");
    fireEvent.click(within(row).getByTestId("elevator-floor-toggle-f3"));
    const expandedRow = await screen.findByTestId("elevator-floor-f3");
    fireEvent.click(within(expandedRow).getByRole("button", { name: /Choose Elevator/ }));
    const updatedRow = await screen.findByTestId("elevator-floor-f3");
    const reason = await within(updatedRow).findByText("Already connected to another Elevator");
    const owned = reason.closest("button");
    expect(owned).not.toBeNull();
    expect(owned).toBeDisabled();
  });

  it("keeps an explicit non-recommended Elevator target exact", async () => {
    const onConnect = vi.fn();
    render(<FloorPropertiesPanel {...baseProps as any} onElevatorConnectionChange={onConnect} selected={{ type: "elevator", id: "el-f2" }} elevators={[{ ...currentElevator, label: "Elevator 1", systemNumber: 1, floors: [1, 2, 3] }]} circulationGroups={{
      stairs: [],
      elevators: [
        { id: "lift-current", name: "Elevator 1", usedFloors: [{ id: "f2", label: "Floor 2", objectId: "el-f2", objectLabel: "Elevator 1" }] },
        { id: "lift-one", name: "Elevator 1", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "el-f3-one", objectLabel: "Elevator 1" }] },
        { id: "lift-two", name: "Elevator 2", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "el-f3-two", objectLabel: "Elevator 2" }] },
      ],
    }} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    const row = screen.getByTestId("elevator-floor-f3");
    fireEvent.click(within(row).getByTestId("elevator-floor-toggle-f3"));
    const expandedRow = await screen.findByTestId("elevator-floor-f3");
    fireEvent.click(within(expandedRow).getByRole("button", { name: /Choose Elevator/ }));
    const explicitTarget = await within(screen.getByTestId("elevator-floor-f3")).findByTestId("elevator-candidate-f3-el-f3-two");
    expect(explicitTarget).not.toBeDisabled();
    fireEvent.click(explicitTarget);
    expect(screen.getByText(/Connect this Elevator to Elevator 2 on Floor 3/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("elevator-floor-f3")).getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledWith("el-f2", "f3", "el-f3-two");
  });

  it("shows the same canonical shaft membership from either selected Floor", () => {
    const { rerender } = render(<FloorPropertiesPanel {...baseProps as any} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    expect(screen.getByTestId("elevator-floor-f1")).toHaveTextContent("Connected");
    expect(screen.getByTestId("elevator-floor-f2")).toHaveTextContent("Current");
    expect(screen.getByTestId("elevator-floor-f2")).toHaveTextContent("Connected");

    rerender(<FloorPropertiesPanel {...baseProps as any}
      selected={{ type: "elevator", id: "el-f1" }}
      floorId="f1"
      elevators={[{ ...currentElevator, id: "el-f1", label: "Left Elevator", sharedId: "lift-left", floors: [1, 2, 3] }]}
    />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    expect(screen.getByTestId("elevator-floor-f1")).toHaveTextContent("Current");
    expect(screen.getByTestId("elevator-floor-f1")).toHaveTextContent("Connected");
    expect(screen.getByTestId("elevator-floor-f2")).toHaveTextContent("Connected");
  });

  it("keeps each Floor row independently collapsible", () => {
    render(<FloorPropertiesPanel {...baseProps as any} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    const ground = screen.getByTestId("elevator-floor-f1");
    expect(within(ground).getByTestId("elevator-floor-toggle-f1")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(ground).getByTestId("elevator-floor-toggle-f1"));
    const expandedGround = screen.getByTestId("elevator-floor-f1");
    expect(within(expandedGround).getByTestId("elevator-floor-toggle-f1")).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByTestId("elevator-floor-f3")).getByTestId("elevator-floor-toggle-f3")).toHaveAttribute("aria-expanded", "false");
  });

  it("quick-connects only missing exact-system-number Floors after confirmation", () => {
    const onConnections = vi.fn();
    render(<FloorPropertiesPanel {...baseProps as any}
      selected={{ type: "elevator", id: "el-f1" }}
      floorId="f1"
      elevators={[{ ...currentElevator, id: "el-f1", label: "Elevator 2", systemNumber: 2, sharedId: "shaft-2", floors: [1, 2, 3] }]}
      circulationGroups={{ stairs: [], elevators: [
        { id: "shaft-2", name: "Elevator 2", usedFloors: [{ id: "f1", label: "Ground Floor", objectId: "el-f1", objectLabel: "Elevator 2" }] },
        { id: "provisional-f2", name: "Elevator 2", usedFloors: [{ id: "f2", label: "Floor 2", objectId: "el-f2", objectLabel: "Elevator 2" }] },
        { id: "provisional-f3", name: "Elevator 2", usedFloors: [{ id: "f3", label: "Floor 3", objectId: "el-f3", objectLabel: "Elevator 2" }] },
        { id: "other", name: "Elevator 1", usedFloors: [{ id: "f2", label: "Floor 2", objectId: "el-f2-other", objectLabel: "Elevator 1" }] },
      ]}}
      onElevatorConnectionsChange={onConnections}
    />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    fireEvent.click(screen.getByRole("button", { name: "Connect Matching Elevators" }));
    const confirmation = screen.getByTestId("elevator-matching-confirmation");
    expect(confirmation).toHaveTextContent("Ground Floor");
    expect(confirmation).toHaveTextContent("Floor 2");
    expect(confirmation).toHaveTextContent("Floor 3");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Connect" }));
    expect(onConnections).toHaveBeenCalledWith("el-f1", [
      { targetFloorId: "f2", targetElevatorId: "el-f2" },
      { targetFloorId: "f3", targetElevatorId: "el-f3" },
    ]);
  });

  it("requires confirmation before Disconnect All and targets only the selected shaft", () => {
    const onDisconnectAll = vi.fn();
    render(<FloorPropertiesPanel {...baseProps as any} onElevatorConnectionsDisconnectAll={onDisconnectAll} />);
    fireEvent.click(screen.getByTestId("circulation-group-trigger-elevator"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect All Floors" }));
    const confirmation = screen.getByTestId("elevator-disconnect-all-confirmation");
    expect(confirmation).toHaveTextContent("Left Elevator");
    expect(onDisconnectAll).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Disconnect All" }));
    expect(onDisconnectAll).toHaveBeenCalledWith("el-f2");
  });
});
