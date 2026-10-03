import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoutePlannerDialog } from "../RoutePlannerDialog";
import { BuildingPicker } from "../BuildingPicker";
import { RouteErrorState } from "../RouteErrorState";
import type { Building } from "../../../types";
import type { PlannedRoute } from "../../../lib/routePlanner";
import type { RoomDest } from "../../../lib/combinedPathfinding";
import type { SearchResult } from "../../../hooks/useCampusSearch";

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

const destinationResult = (overrides: Partial<SearchResult> & Pick<SearchResult, "id" | "name" | "kind">): SearchResult => ({
  accessible: false,
  keywords: [overrides.name.toLowerCase()],
  ...overrides,
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
  destinationResults: [],
  ...overrides,
});

const route = (overrides: Partial<PlannedRoute> = {}): PlannedRoute => ({
  points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  dist: 120,
  mins: 2,
  steps: [],
  isGraphBased: true,
  mode: "standard",
  fromCode: "SCI",
  toCode: "LIB",
  transitions: [],
  ...overrides,
});

describe("RoutePlannerDialog student accessibility", () => {
  it("collapses a ready route into a compact summary and keeps endpoint editing available", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("ceit", "CEIT", "CEIT Building"),
      to: building("gate", "GATE", "Main Gate"),
      mode: "accessible",
      route: route({ mode: "accessible", mins: 4 }),
    })} />);

    const summary = screen.getByTestId("route-summary");
    expect(summary).toHaveTextContent("CEIT Building");
    expect(summary).toHaveTextContent("Main Gate");
    expect(summary).toHaveTextContent("Accessible");
    expect(summary).toHaveTextContent("4 min");
    expect(screen.queryByTestId("route-endpoint-card-start")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change route" }));
    expect(screen.getByTestId("route-endpoint-card-start")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done editing route" }));
    expect(screen.queryByTestId("route-endpoint-card-start")).not.toBeInTheDocument();
  });

  it("SOS chooses an evacuation destination automatically from only a start", () => {
    const onFindRoute = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"), mode: "emergency",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Emergency Stair → Campus Gate" }), onFindRoute,
    })} />);
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Emergency Stair → Campus Gate");
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Uses valid emergency exits");
    expect(screen.queryByRole("button", { name: "Choose destination" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Swap start and destination" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
    expect(onFindRoute).toHaveBeenCalledOnce();
  });
  it("replaces the compact planner with a dedicated, grouped destination search", async () => {
    const destinations = [
      destinationResult({ id: "science", name: "Science Hall", code: "SCI", kind: "building", buildingId: "science" }),
      ...Array.from({ length: 35 }, (_, index) => destinationResult({
        id: `room-${index}`, name: `Science Room ${index}`, kind: "room", buildingId: "science", buildingName: "Science Hall", floorNumber: 2,
      })),
      destinationResult({ id: "library", name: "Library", code: "LIB", kind: "building", buildingId: "library" }),
      destinationResult({ id: "copy", name: "Copy Shop", kind: "room", buildingId: "library", buildingName: "Library", floorNumber: 1 }),
    ];
    const onSelectToDestination = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({ destinationResults: destinations, onSelectToDestination })} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    await screen.findByTestId("route-planner-search-subview");
    const startList = screen.getByRole("listbox", { name: "Campus destination results" });
    expect(screen.getByTestId("route-planner-search-subview")).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
    expect(startList).toHaveClass("min-h-0", "max-h-none", "flex-1", "overflow-y-auto");
    expect(within(startList).getAllByRole("option")).toHaveLength(38);
    expect(within(startList).getByRole("group", { name: "Science Hall (SCI)" })).toBeInTheDocument();
    expect(within(startList).getByRole("group", { name: "Library (LIB)" })).toBeInTheDocument();

    expect(screen.queryByTestId("route-planner-scroll-region")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to route planner" }));
    await waitFor(() => expect(screen.getByTestId("route-planner-scroll-region")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    await screen.findByTestId("route-planner-search-subview");
    const destinationList = screen.getByRole("listbox", { name: "Campus destination results" });
    expect(within(destinationList).getAllByRole("option")).toHaveLength(38);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search destination" }), { target: { value: "Science" } });
    expect(within(destinationList).getAllByRole("option")).toHaveLength(36);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search destination" }), { target: { value: "Copy" } });
    fireEvent.click(within(destinationList).getByRole("option", { name: /Copy Shop, Room, Library · Floor 1/ }));
    expect(onSelectToDestination).toHaveBeenCalledWith(expect.objectContaining({ id: "copy", buildingId: "library" }));
    await waitFor(() => expect(screen.queryByTestId("route-planner-search-subview")).not.toBeInTheDocument());
  });

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

  it("keeps the mobile planner compact with a dedicated scroll region and persistent actions", () => {
    render(<RoutePlannerDialog {...plannerProps()} />);

    const dialog = screen.getByRole("dialog", { name: "Route planner" });
    const scrollRegion = screen.getByTestId("route-planner-scroll-region");

    expect(dialog).toHaveClass("overflow-hidden", "flex");
    expect(scrollRegion).toHaveClass("min-h-0", "flex-none", "overflow-y-auto", "overscroll-contain");
    expect(screen.getByRole("button", { name: "Close directions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose starting point" })).toBeDisabled();
  });

  it("resizes the planner with the handle on pointer and keyboard input", () => {
    render(<RoutePlannerDialog {...plannerProps()} />);

    const handle = screen.getByRole("slider", { name: "Resize route planner" });
    const dialog = screen.getByRole("dialog", { name: "Route planner" });
    expect(handle).toHaveAttribute("aria-valuenow", "560");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle).toHaveAttribute("aria-valuenow", "608");
    expect(dialog).toHaveStyle({ height: "608px" });

    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "touch", clientY: 300 });
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: "touch", clientY: 220 });
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: "touch", clientY: 220 });
    expect(handle).toHaveAttribute("aria-valuenow", "664");
    expect(dialog).toHaveStyle({ height: "664px" });
  });

  it("uses one active unified destination search instead of parallel building and room controls", async () => {
    const onSelectToDestination = vi.fn();
    render(
      <RoutePlannerDialog
        {...plannerProps({
          destinationResults: [
            destinationResult({ id: "science", name: "Science Hall", kind: "building", buildingId: "science" }),
            destinationResult({ id: "205", name: "Room 205", kind: "room", buildingId: "science", buildingName: "Science Hall", floorLabel: "Floor 2", floorNumber: 2 }),
          ],
          onSelectToDestination,
        })}
      />,
    );

    expect(screen.getByTestId("route-endpoint-card-destination")).toBeInTheDocument();
    expect(screen.queryByText("Destination room (optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Or choose a destination building below.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    await screen.findByRole("searchbox", { name: "Search destination" });
    fireEvent.click(screen.getByRole("option", { name: /Room 205/ }));
    expect(onSelectToDestination).toHaveBeenCalledWith(expect.objectContaining({ id: "205", kind: "room" }));
    await waitFor(() => expect(screen.queryByRole("searchbox", { name: "Search destination" })).not.toBeInTheDocument());
  });

  it("shows a selected room as one destination with building and floor context", () => {
    render(
      <RoutePlannerDialog
        {...plannerProps({
          to: building("science", "SCI", "Science Hall"),
          toRoom: room("205", "Room 205"),
        })}
      />,
    );

    const card = screen.getByTestId("route-endpoint-card-destination");
    expect(card).toHaveTextContent("Room 205");
    expect(card).toHaveTextContent("Science Hall · Floor 2");
    expect(screen.queryByRole("searchbox", { name: "Search destination" })).not.toBeInTheDocument();
  });

  it("keeps a map-selected room in planner context with direct Start/Destination actions", () => {
    const onUseSelectedRoomAsStart = vi.fn();
    const onUseSelectedRoomAsDestination = vi.fn();
    const onReportSelectedRoom = vi.fn();
    render(
      <RoutePlannerDialog
        {...plannerProps({
          selectedRoomForPlanner: room("admin-office", "Administration Office"),
          onUseSelectedRoomAsStart,
          onUseSelectedRoomAsDestination,
          onReportSelectedRoom,
        })}
      />,
    );

    const context = screen.getByTestId("selected-room-planner-context");
    expect(context).toHaveTextContent("Administration Office");
    fireEvent.click(screen.getByRole("button", { name: "Use as Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Use as Destination" }));
    const report = screen.getByRole("button", { name: "Report this room" });
    expect(report).toHaveClass("text-destructive", "border-destructive/30");
    fireEvent.click(report);
    expect(onUseSelectedRoomAsStart).toHaveBeenCalledWith(expect.objectContaining({ roomId: "admin-office" }));
    expect(onUseSelectedRoomAsDestination).toHaveBeenCalledWith(expect.objectContaining({ roomId: "admin-office" }));
    expect(onReportSelectedRoom).toHaveBeenCalledWith(expect.objectContaining({ roomId: "admin-office" }));
  });

  it("keeps the planner mounted and marks selected-place expansion for layout motion", async () => {
    const propsWithoutRoom = plannerProps();
    const view = render(<RoutePlannerDialog {...propsWithoutRoom} />);
    const planner = screen.getByTestId("route-planner-dialog");
    expect(planner).toHaveAttribute("data-layout-animated", "true");

    view.rerender(
      <RoutePlannerDialog
        {...plannerProps({ selectedRoomForPlanner: room("admin-office", "Administration Office") })}
      />,
    );
    expect(screen.getByTestId("route-planner-dialog")).toBe(planner);
    expect(screen.getByTestId("selected-room-planner-context")).toHaveTextContent("Administration Office");

    view.rerender(<RoutePlannerDialog {...propsWithoutRoom} />);
    await waitFor(() => expect(screen.queryByTestId("selected-room-planner-context")).not.toBeInTheDocument());
    expect(screen.getByTestId("route-planner-dialog")).toBe(planner);
  });

  it("uses the dropped pin as the start and lets the user change it", async () => {
    render(<RoutePlannerDialog {...plannerProps({ useMyLocation: true })} />);

    expect(screen.getByTestId("route-endpoint-card-start")).toHaveTextContent("You are here");
    fireEvent.click(screen.getByRole("button", { name: "Change start" }));
    expect(await screen.findByRole("searchbox", { name: "Search start" })).toBeInTheDocument();
  });

  it("hides swap until both endpoints exist, then places it in its own row", () => {
    const onSwapEndpoints = vi.fn();
    const view = render(
      <RoutePlannerDialog
        {...plannerProps({ onSwapEndpoints })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Swap start and destination" })).not.toBeInTheDocument();
    view.rerender(
      <RoutePlannerDialog
        {...plannerProps({
          from: building("science", "SCI", "Science Hall"),
          to: building("library", "LIB", "Library"),
          onSwapEndpoints,
        })}
      />,
    );

    const swap = screen.getByRole("button", { name: "Swap start and destination" });
    expect(swap).not.toBeDisabled();
    expect(screen.getByTestId("route-planner-swap-row")).toContainElement(swap);
    expect(screen.getByTestId("route-planner-swap-row")).toHaveClass("h-9", "items-center", "justify-center");
    fireEvent.click(swap);
    expect(onSwapEndpoints).toHaveBeenCalledOnce();
  });

  it("keeps the desktop planner content-sized and preserves its search state when suspended", async () => {
    const view = render(<RoutePlannerDialog {...plannerProps({ destinationResults: [
      destinationResult({ id: "science", name: "Science Hall", kind: "building", buildingId: "science" }),
    ] })} />);
    const dialog = screen.getByTestId("route-planner-dialog");
    expect(dialog).toHaveClass("md:h-fit", "md:max-h-[calc(100dvh-1.5rem)]", "md:relative");
    expect(screen.getByTestId("route-planner-scroll-region")).toHaveClass("md:flex-none");

    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search start" }), { target: { value: "Science" } });
    view.rerender(<RoutePlannerDialog {...plannerProps({
      destinationResults: [destinationResult({ id: "science", name: "Science Hall", kind: "building", buildingId: "science" })],
      suspendedForBuilding: true,
    })} />);

    expect(screen.getByTestId("route-planner-dialog")).toHaveAttribute("data-suspended-for-building", "true");
    expect(screen.getByRole("searchbox", { name: "Search start" })).toHaveValue("Science");
  });

  it("does not offer a dead start action when no authored route exists", () => {
    render(
      <RoutePlannerDialog
        {...plannerProps({
          from: building("science", "SCI", "Science Hall"),
          to: building("library", "LIB", "Library"),
        })}
      />,
    );

    const unavailable = screen.getByRole("button", { name: "Route unavailable" });
    expect(unavailable).toBeDisabled();
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
    const buildings = Array.from({ length: 12 }, (_, index) => building(`building-${index}`, `B${index}`, `Building ${index}`));

    render(
      <div onWheel={onMapWheel}>
        <BuildingPicker badge="A" badgeColor="#16a34a" value={null} onSelect={vi.fn()} onClear={vi.fn()} placeholder="Starting point…" buildings={buildings} />
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
});
