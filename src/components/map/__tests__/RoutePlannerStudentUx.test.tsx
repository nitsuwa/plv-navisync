import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoutePlannerDialog } from "../RoutePlannerDialog";
import { BuildingPicker } from "../BuildingPicker";
import { RouteErrorState } from "../RouteErrorState";
import { RouteStepsPanel } from "../RouteStepsPanel";
import type { Building } from "../../../types";
import type { PlannedRoute } from "../../../lib/routePlanner";
import type { RoomDest } from "../../../lib/combinedPathfinding";

const building = (id: string, code: string, name: string): Building => ({
  id,
  code,
  name,
  description: "",
  category: "academic",
  floor_count: 3,
  created_at: "2026-01-01",
});

const room = (roomId: string, roomName: string, buildingId = "science"): RoomDest => ({
  type: "room",
  buildingId,
  floorNumber: 2,
  roomId,
  roomName,
  buildingLabel: "Science Hall",
  buildingCode: "SCI",
});

const plannerProps = (overrides: Partial<React.ComponentProps<typeof RoutePlannerDialog>> = {}) => ({
  from: null,
  to: null,
  onFromChange: vi.fn(),
  onToChange: vi.fn(),
  buildings: [building("science", "SCI", "Science Hall")],
  mode: "standard" as const,
  onModeChange: vi.fn(),
  route: null,
  onClose: vi.fn(),
  onClear: vi.fn(),
  onFindRoute: vi.fn(),
  youAreHere: { x: 5, y: 5 },
  useMyLocation: false,
  onUseMyLocationChange: vi.fn(),
  ...overrides,
});

describe("RoutePlannerDialog student accessibility", () => {
  it("exposes a named non-modal dialog and restores focus when it unmounts", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open directions";
    document.body.appendChild(opener);
    opener.focus();

    const view = render(<RoutePlannerDialog {...plannerProps()} />);
    const dialog = screen.getByRole("dialog", { name: "Route planner" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toHaveAttribute("aria-describedby", "route-planner-description");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(dialog);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("gives modes, You Are Here, and room endpoint changes clear states and names", () => {
    render(
      <RoutePlannerDialog
        {...plannerProps({
          fromRoom: room("201", "Room 201"),
          toRoom: room("205", "Room 205"),
          onClearFromRoom: vi.fn(),
          onClearToRoom: vi.fn(),
        })}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Standard routing/ })[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /Accessible routing/ })[0]).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: /SOS routing/ })[0]).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: /Use You are here as the starting point/ })[0]).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: "Change starting room" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Change destination room" })).toHaveLength(2);
    expect(screen.getAllByTestId("route-planner-live-status")[0]).toHaveTextContent(
      "Planning from Room 201 in Science Hall (SCI) to Room 205 in Science Hall (SCI)",
    );
  });

  it("offers published room destinations from a room origin while retaining building navigation", () => {
    const onToRoomChange = vi.fn();
    const destination = room("205", "Room 205");
    const view = render(
      <RoutePlannerDialog
        {...plannerProps({
          fromRoom: room("201", "Room 201"),
          roomOptions: [destination],
          onToRoomChange,
        })}
      />,
    );

    expect(screen.getAllByTestId("room-destination-selector")).toHaveLength(2);
    expect(screen.getAllByRole("combobox", { name: "Destination room (optional)" })).toHaveLength(2);
    expect(screen.getAllByText("Or choose a destination building below.")).toHaveLength(2);

    fireEvent.change(screen.getAllByTestId("room-destination-selector")[0], {
      target: { value: "science:2:205" },
    });
    expect(onToRoomChange).toHaveBeenCalledWith(destination);

    view.rerender(
      <RoutePlannerDialog
        {...plannerProps({
          fromRoom: room("201", "Room 201"),
          toRoom: destination,
          roomOptions: [destination],
          onToRoomChange,
          onClearToRoom: vi.fn(),
        })}
      />,
    );
    expect(screen.getAllByTestId("to-room-endpoint")).toHaveLength(2);
    expect(screen.getAllByTestId("to-room-endpoint")[0]).toHaveTextContent("Room 205");
    expect(screen.queryByTestId("room-destination-selector")).not.toBeInTheDocument();
  });

  it("offers published rooms as starting points and returns the selected room", () => {
    const onFromRoomChange = vi.fn();
    const start = room("201", "Room 201");
    render(
      <RoutePlannerDialog
        {...plannerProps({
          roomOptions: [start],
          onFromRoomChange,
        })}
      />,
    );

    expect(screen.getAllByTestId("room-start-selector")).toHaveLength(2);
    expect(screen.getAllByRole("combobox", { name: "Starting room (optional)" })).toHaveLength(2);
    expect(screen.getAllByText("Or choose a starting building above.")).toHaveLength(2);

    fireEvent.change(screen.getAllByTestId("room-start-selector")[0], {
      target: { value: "science:2:201" },
    });
    expect(onFromRoomChange).toHaveBeenCalledWith(start);
  });

  it("offers a room destination even when the origin is a building", () => {
    const onToRoomChange = vi.fn();
    const destination = room("205", "Room 205");
    render(
      <RoutePlannerDialog
        {...plannerProps({
          from: building("science", "SCI", "Science Hall"),
          roomOptions: [destination],
          onToRoomChange,
        })}
      />,
    );

    expect(screen.getAllByTestId("room-destination-selector")).toHaveLength(2);
    fireEvent.change(screen.getAllByTestId("room-destination-selector")[0], {
      target: { value: "science:2:205" },
    });
    expect(onToRoomChange).toHaveBeenCalledWith(destination);
  });

  it("swaps complete room endpoints instead of hiding the swap action", () => {
    const onSwapEndpoints = vi.fn();
    render(
      <RoutePlannerDialog
        {...plannerProps({
          from: building("science", "SCI", "Science Hall"),
          to: building("library", "LIB", "Library"),
          fromRoom: room("201", "Room 201"),
          toRoom: { ...room("105", "Reading Room", "library"), buildingLabel: "Library", buildingCode: "LIB" },
          onSwapEndpoints,
        })}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Swap start and destination" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Swap start and destination" })[0]);
    expect(onSwapEndpoints).toHaveBeenCalledOnce();
  });

  it("does not offer a dead Find Route action when no authored route exists", () => {
    render(
      <RoutePlannerDialog
        {...plannerProps({
          from: building("science", "SCI", "Science Hall"),
          to: building("library", "LIB", "Library"),
          route: null,
        })}
      />,
    );

    const unavailableActions = screen.getAllByRole("button", { name: "Route Unavailable" });
    expect(unavailableActions).toHaveLength(2);
    unavailableActions.forEach((action) => expect(action).toBeDisabled());
  });

  it("closes on Escape from the dialog surface", () => {
    const onClose = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({ onClose })} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("BuildingPicker map interaction", () => {
  it("keeps wheel and touch scrolling inside the endpoint list", () => {
    const onMapWheel = vi.fn();
    const buildings = Array.from({ length: 12 }, (_, index) =>
      building(`building-${index}`, `B${index}`, `Building ${index}`),
    );

    render(
      <div onWheel={onMapWheel}>
        <BuildingPicker
          badge="A"
          badgeColor="#16a34a"
          value={null}
          onSelect={vi.fn()}
          onClear={vi.fn()}
          placeholder="Starting point…"
          buildings={buildings}
        />
      </div>,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "Starting point…" }));
    const listbox = screen.getByRole("listbox");
    fireEvent.wheel(listbox, { deltaY: 120 });
    fireEvent.touchMove(listbox, { touches: [{ clientY: 100 }] });

    expect(onMapWheel).not.toHaveBeenCalled();
  });
});

describe("student route feedback", () => {
  it("makes deferred and missing routes actionable without unsafe emergency fallback", () => {
    const switchMode = vi.fn();
    render(<RouteErrorState fromCode="SCI" toCode="LIB" mode="accessible" onSwitchMode={switchMode} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Accessibility routing is not available yet");
    expect(alert).toHaveTextContent("Choose a different destination above");
    expect(screen.queryByText("Try a different destination")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try Standard mode/ }));
    expect(switchMode).toHaveBeenCalledWith("standard");

    render(<RouteErrorState fromCode="SCI" toCode="LIB" mode="emergency" onSwitchMode={switchMode} />);
    const emergencyAlert = screen.getAllByRole("alert")[1];
    expect(emergencyAlert).toHaveTextContent("Do not use Standard mode as an emergency route");
    expect(within(emergencyAlert).queryByRole("button", { name: /Try Standard/ })).not.toBeInTheDocument();
  });

  it("identifies the destination and exposes one stable current-step status", () => {
    const route: PlannedRoute = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      dist: 10,
      mins: 1,
      steps: [
        { id: "start", icon: "start", instruction: "Start from SCI", distanceM: 5 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at Room 205", distanceM: 5 },
      ],
      isGraphBased: true,
      mode: "standard",
      fromCode: "SCI",
      toCode: "Room 205",
      transitions: [],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="Room 205 · Science Hall"
        walkProgress={0.1}
        onEnd={vi.fn()}
        onZoom={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Active route to Room 205 · Science Hall" })).toBeInTheDocument();
    expect(screen.getByTestId("route-destination")).toHaveTextContent("To Room 205 · Science Hall");
    expect(screen.getByRole("status")).toHaveTextContent("Current step: Start from SCI");
    expect(screen.getByTestId("active-route-step")).toHaveAttribute("aria-current", "step");
  });

  it("keeps the first step active when route steps have no distances", () => {
    const route: PlannedRoute = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      dist: 10,
      mins: 1,
      steps: [
        { id: "start", icon: "start", instruction: "Start from SCI" },
        { id: "arrive", icon: "arrive", instruction: "Arrive at Room 205" },
      ],
      isGraphBased: true,
      mode: "standard",
      fromCode: "SCI",
      toCode: "Room 205",
      transitions: [],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="Room 205 · Science Hall"
        walkProgress={0.1}
        onEnd={vi.fn()}
        onZoom={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Current step: Start from SCI");
  });

  it("distributes missing mixed-route distances instead of announcing arrival early", () => {
    const route: PlannedRoute = {
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      dist: 20,
      mins: 2,
      steps: [
        { id: "start", icon: "start", instruction: "Start from SCI" },
        { id: "walk", icon: "walk", instruction: "Walk along the path", distanceM: 10 },
        { id: "enter", icon: "enter", instruction: "Enter Science Hall" },
        { id: "arrive", icon: "arrive", instruction: "Arrive at Room 205" },
      ],
      isGraphBased: true,
      mode: "standard",
      fromCode: "SCI",
      toCode: "Room 205",
      transitions: [],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="Room 205 · Science Hall"
        walkProgress={0.5}
        onEnd={vi.fn()}
        onZoom={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).not.toHaveTextContent("Arrive at Room 205");
    expect(screen.getByRole("status")).toHaveTextContent("Current step: Walk along the path");
  });

  it("scopes source-room progress to the authored indoor exit leg", () => {
    const route: PlannedRoute = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      dist: 120,
      mins: 4,
      steps: [
        { id: "start", icon: "start", instruction: "Start from Room 101" },
        { id: "outdoor", icon: "walk", instruction: "Walk across campus", distanceM: 100 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at Room 205" },
      ],
      isGraphBased: true,
      isAuthoredGraph: true,
      mode: "standard",
      fromCode: "Room 101",
      toCode: "Room 205",
      transitions: [],
    };

    render(
      <RouteStepsPanel
        route={route}
        mode="standard"
        toName="Room 205"
        walkProgress={0}
        activeLeg={{
          steps: [
            { id: "source-corridor", icon: "walk", instruction: "Continue along the source corridor", distanceM: 20 },
          ],
          distanceM: 20,
          progress: 1,
          statusInstruction: "Follow the indoor path from Room 101 to the building exit",
        }}
        onEnd={vi.fn()}
        onZoom={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Current step: Follow the indoor path from Room 101 to the building exit",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Arrive at Room 205");
    expect(screen.getByTestId("active-route-step")).toHaveTextContent("Continue along the source corridor");
  });
});
