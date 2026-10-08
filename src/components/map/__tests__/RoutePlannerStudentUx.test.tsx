import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("does not offer navigation playback during Plan Route", () => {
    const onFindRoute = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("ceit", "CEIT", "CEIT Building"),
      to: building("gate", "GATE", "Main Gate"),
      onFindRoute,
    })} />);
    expect(screen.getByRole("button", { name: "Find Route" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Navigation/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find Route" }));
    expect(onFindRoute).toHaveBeenCalledOnce();
  });

  it("shows a separate route preview after planning and offers edit/start actions", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("ceit", "CEIT", "CEIT Building"),
      to: building("gate", "GATE", "Main Gate"),
      mode: "accessible",
      phase: "preview",
      route: route({ mode: "accessible", mins: 4 }),
    })} />);

    const summary = screen.getByTestId("route-summary");
    expect(summary).toHaveTextContent("CEIT Building");
    expect(summary).toHaveTextContent("Main Gate");
    expect(summary).toHaveTextContent("Accessible");
    expect(summary).not.toHaveTextContent("4 min");
    expect(summary).not.toHaveTextContent("120 m");
    expect(screen.queryByTestId("route-endpoint-card-start")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Edit Route" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Navigation" })).toBeInTheDocument();
    expect(screen.queryByText("Done editing route")).not.toBeInTheDocument();
  });

  it("shows the complete planned itinerary in the expanded route preview", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: room("caba-101", "CABA-101", "caba"),
      phase: "preview",
      route: route({ steps: [
        { id: "start", icon: "start", instruction: "Start at Campus Gate." },
        { id: "campus", icon: "walk", instruction: "Follow the campus path to CABA." },
        { id: "enter", icon: "enter", instruction: "Enter CABA building." },
        { id: "indoor", icon: "walk", instruction: "Follow the indoor path to CABA-101." },
        { id: "arrive", icon: "arrive", instruction: "Arrive at CABA-101." },
      ] }),
    })} />);

    const summary = screen.getByTestId("route-summary");
    expect(summary).toHaveTextContent("Enter CABA building.");
    expect(summary).toHaveTextContent("Follow the indoor path to CABA-101.");
    expect(summary).toHaveTextContent("Arrive at CABA-101.");
  });

  it("exposes guided step and end controls in Follow without a duplicate Overview", () => {
    const onPreviousStep = vi.fn();
    const onPause = vi.fn();
    const onNextStep = vi.fn();
    const onEndNavigation = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "follow",
      playbackPaused: false,
      currentStepIndex: 1,
      navigationSteps: ["Start at Campus Gate.", "Follow the campus path toward the Canteen.", "Your destination is on the right."],
      onPreviousStep, onPause, onNextStep, onEndNavigation,
    })} />);

    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent("Follow the campus path toward the Canteen.");
    expect(screen.queryByRole("button", { name: /Replay|Fullscreen|Done editing route/i })).not.toBeInTheDocument();
    // The separate Overview control duplicated Explore and is removed.
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    // Obvious FOLLOW | EXPLORE segmented control with a clearly active state.
    expect(screen.getByRole("button", { name: "Switch to Follow mode" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Switch to Explore mode" })).toHaveAttribute("aria-pressed", "false");
    // Seeking while playing is allowed; the page pauses and retargets its
    // canonical playback cursor atomically in the seek handler.
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "End Navigation" }));
    expect(onPreviousStep).toHaveBeenCalledOnce();
    expect(onPause).toHaveBeenCalledOnce();
    expect(onNextStep).toHaveBeenCalledOnce();
    expect(onEndNavigation).toHaveBeenCalledOnce();
  });

  it("enables deterministic Follow step seeking only while paused and outside transitions", () => {
    const onPreviousStep = vi.fn();
    const onNextStep = vi.fn();
    const props = plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "follow",
      playbackPaused: true,
      transitionBusy: true,
      currentStepIndex: 1,
      navigationSteps: ["Start at Campus Gate.", "Follow the campus path toward the Canteen.", "Your destination is on the right."],
      onPreviousStep, onNextStep,
    });
    const view = render(<RoutePlannerDialog {...props} />);

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    view.rerender(<RoutePlannerDialog {...props} transitionBusy={false} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPreviousStep).toHaveBeenCalledOnce();
    expect(onNextStep).toHaveBeenCalledOnce();
  });

  it("suspends playback in Explore with Previous/Next and Return to Follow only", () => {
    const onCameraModeChange = vi.fn();
    const onPreviousStep = vi.fn();
    const onNextStep = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "explore",
      currentStepIndex: 1,
      navigationSteps: ["Start at Campus Gate.", "Follow the campus path toward the Canteen.", "Your destination is on the right."],
      onCameraModeChange, onPreviousStep, onNextStep, onPause, onResume,
    })} />);
    // Explore has no automatic playback: there is no Pause/Resume control.
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to Explore mode" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPreviousStep).toHaveBeenCalledOnce();
    expect(onNextStep).toHaveBeenCalledOnce();
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Return to Follow" }));
    expect(onCameraModeChange).toHaveBeenCalledWith("follow");
  });

  it("provides a direct Follow/Explore switch without changing playback controls", () => {
    const onCameraModeChange = vi.fn();
    const view = render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "follow",
      onCameraModeChange,
    })} />);

    const toggle = screen.getByRole("button", { name: "Switch to Explore mode" });
    expect(screen.getByRole("button", { name: "Switch to Follow mode" })).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(onCameraModeChange).toHaveBeenCalledWith("explore");
    expect(screen.getByRole("button", { name: "Resume navigation" })).toBeInTheDocument();

    view.rerender(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "explore",
      onCameraModeChange,
    })} />);
    // Explore suspends automatic playback: no Pause/Resume control remains.
    expect(screen.queryByRole("button", { name: "Resume navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to Follow" })).toBeInTheDocument();
  });

  it("keeps desktop guided navigation compact by default when requested and exposes the mode switch", () => {
    const onCameraModeChange = vi.fn();
    const onExpand = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "explore",
      collapsed: true,
      onCameraModeChange,
      onExpand,
    })} />);

    expect(screen.getByTestId("desktop-route-collapsed-summary")).toHaveTextContent("Step 1 of");
    fireEvent.click(screen.getByRole("button", { name: "Return to Follow mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand navigation panel" }));
    expect(onCameraModeChange).toHaveBeenCalledWith("follow");
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("starts guided navigation with a collapsed mobile sheet and expands on request", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("gate", "GATE", "Campus Gate"),
        to: building("canteen", "CANT", "Canteen"),
        route: route(),
        phase: "navigating",
        navigationSteps: ["Start at Campus Gate.", "Follow the campus path toward the Canteen."],
      })} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "collapsed"));
      await waitFor(() => expect(screen.getByTestId("mobile-route-collapsed-summary")).toBeInTheDocument());
      expect(screen.queryByTestId("guided-navigation-summary")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Expand navigation panel" }));
      await waitFor(() => expect(screen.getByTestId("guided-navigation-summary")).toBeInTheDocument());
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("keeps mobile route preview compact while retaining an explicit Start Navigation action", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const onStartNavigation = vi.fn();
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("gate", "GATE", "Campus Gate"),
        to: building("canteen", "CANT", "Canteen"),
        route: route(),
        phase: "preview",
        onStartNavigation,
      })} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "collapsed"));
      await waitFor(() => expect(screen.getByTestId("mobile-route-preview-collapsed-summary")).toBeInTheDocument());
      expect(dialog.style.height).toBe("208px");
      expect(screen.queryByTestId("route-summary")).not.toBeInTheDocument();
      const startNavigation = screen.getByRole("button", { name: "Start Navigation" });
      expect(startNavigation).toBeVisible();
      fireEvent.click(startNavigation);
      expect(onStartNavigation).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("temporarily minimizes the mobile route panel for the Floor Picker and restores its prior presentation", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      const props = plannerProps({
        from: building("science", "SCI", "Science Hall"),
        to: building("library", "LIB", "Library"),
        suspendedForFloorPicker: false,
      });
      const view = render(<RoutePlannerDialog {...props} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "normal"));
      view.rerender(<RoutePlannerDialog {...props} suspendedForFloorPicker />);
      await waitFor(() => expect(dialog).toHaveAttribute("data-suspended-for-floor-picker", "true"));
      expect(screen.getByTestId("route-planner-floor-picker-suspended")).toBeInTheDocument();
      expect(dialog).toHaveStyle({ height: "140px" });
      view.rerender(<RoutePlannerDialog {...props} suspendedForFloorPicker={false} />);
      await waitFor(() => expect(dialog).toHaveAttribute("data-suspended-for-floor-picker", "false"));
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "normal"));
      expect(screen.getByTestId("route-endpoint-card-start")).toBeInTheDocument();
      expect(screen.getByTestId("route-endpoint-card-destination")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("retains an open destination search query while the fallback Floor Picker owns the mobile panel", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      const props = plannerProps({ suspendedForFloorPicker: false });
      const view = render(<RoutePlannerDialog {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
      const search = await screen.findByRole("searchbox", { name: "Search destination" });
      fireEvent.change(search, { target: { value: "Student Center" } });

      view.rerender(<RoutePlannerDialog {...props} suspendedForFloorPicker />);
      await waitFor(() => expect(screen.getByTestId("route-planner-floor-picker-suspended")).toBeInTheDocument());
      view.rerender(<RoutePlannerDialog {...props} suspendedForFloorPicker={false} />);
      expect(await screen.findByRole("searchbox", { name: "Search destination" })).toHaveValue("Student Center");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("shows a compact mobile map-pick confirmation before applying the endpoint", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const onConfirmMapSelection = vi.fn();
    try {
      render(<RoutePlannerDialog {...plannerProps({
        mapSelectionEndpoint: "destination",
        mapSelectionCandidateLabel: "Journal Room",
        onConfirmMapSelection,
      })} />);
      expect(screen.getByTestId("route-planner-dialog").style.height).toContain("196px");
      expect(screen.getByTestId("route-planner-map-pick-hint")).toHaveClass("overflow-y-auto");
      expect(screen.getByTestId("route-planner-map-pick-confirmation")).toHaveTextContent("Journal Room");
      expect(screen.getByRole("button", { name: "Use as destination" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Choose another" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Use as destination" }));
      expect(onConfirmMapSelection).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("keeps arrival actions distinct from clearing or starting a new route", () => {
    const onDone = vi.fn();
    const onStartNavigation = vi.fn();
    const onClear = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "arrived",
      onDone, onStartNavigation, onClear,
    })} />);

    expect(screen.getByTestId("route-arrival-state")).toHaveTextContent("You've arrived");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart Route" }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(onStartNavigation).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("SOS chooses an evacuation destination automatically from only a start", () => {
    const onFindRoute = vi.fn();
    const onStartNavigation = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"), mode: "emergency",
      phase: "preview",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Emergency Stair → Campus Gate" }), onFindRoute, onStartNavigation,
    })} />);
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Emergency Stair → Campus Gate");
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Emergency route");
    expect(screen.queryByRole("button", { name: "Choose destination" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Swap start and destination" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Navigation" }));
    expect(onStartNavigation).toHaveBeenCalledOnce();
    expect(onFindRoute).not.toHaveBeenCalled();
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

  it("disables only the exact endpoint already selected in the opposite slot", async () => {
    const destinations = [
      destinationResult({ id: "science", name: "Science Hall", kind: "building", buildingId: "science" }),
      destinationResult({ id: "205", name: "Room 205", kind: "room", buildingId: "science", floorNumber: 2 }),
    ];
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      destinationResults: destinations,
    })} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    const list = await screen.findByRole("listbox", { name: "Campus destination results" });
    expect(within(list).getByRole("option", { name: /Science Hall, Building, Campus place, Already selected as start/ })).toBeDisabled();
    expect(within(list).getByRole("option", { name: /Room 205, Room/ })).toBeEnabled();
  });

  it("opens choose-on-map as a compact endpoint prompt and supports cancel", async () => {
    const onChooseOnMap = vi.fn();
    const onActiveEndpointChange = vi.fn();
    const view = render(<RoutePlannerDialog {...plannerProps({ onChooseOnMap, onActiveEndpointChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    await screen.findByRole("searchbox", { name: "Search start" });
    fireEvent.click(screen.getByRole("button", { name: "Choose on map" }));
    expect(onChooseOnMap).toHaveBeenCalledWith("start");

    view.rerender(<RoutePlannerDialog {...plannerProps({
      activeEndpoint: null,
      mapSelectionEndpoint: "start",
      onChooseOnMap,
      onActiveEndpointChange,
    })} />);
    expect(await screen.findByTestId("route-planner-map-pick-hint")).toHaveTextContent("Tap a building or campus place");
    expect(screen.queryByTestId("route-planner-scroll-region")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChooseOnMap).toHaveBeenLastCalledWith(null);
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
    expect(scrollRegion).toHaveClass("min-h-0", "overflow-y-auto", "overscroll-contain", "md:flex-none");
    expect(screen.getByRole("button", { name: "Cancel route planning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose starting point" })).toBeDisabled();
  });

  it("uses a content-sized mobile planning form with the complete primary workflow available", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      to: building("library", "LIB", "Library"),
    })} />);
    const dialog = screen.getByTestId("route-planner-dialog");
    expect(dialog.style.height).toBe("fit-content");
    expect(dialog).toHaveAttribute("data-route-mode", "standard");
    expect(screen.getByRole("group", { name: "Route modes" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Standard route preference" })).toBeInTheDocument();
    expect(screen.getByTestId("route-endpoint-card-start")).toBeInTheDocument();
    expect(screen.getByTestId("route-planner-swap-row")).toBeInTheDocument();
    expect(screen.getByTestId("route-endpoint-card-destination")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find Route" })).toBeInTheDocument();
    expect(screen.getByTestId("route-planner-scroll-region").style.maxHeight).toContain("--student-map-mobile-panel-max-height");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("keeps SOS compact with an automatic destination and no swap or destination card", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<RoutePlannerDialog {...plannerProps({ from: building("science", "SCI", "Science Hall"), mode: "emergency" })} />);
    expect(screen.getByTestId("emergency-destination")).toBeInTheDocument();
    expect(screen.queryByTestId("route-endpoint-card-destination")).not.toBeInTheDocument();
    expect(screen.queryByTestId("route-planner-swap-row")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find Route" })).toBeEnabled();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("snaps the mobile sheet between collapsed, normal, and expanded states", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<RoutePlannerDialog {...plannerProps()} />);
    fireEvent(window, new Event("resize"));

    const handle = screen.getByRole("slider", { name: "Resize route planner" });
    const dialog = screen.getByRole("dialog", { name: "Route planner" });
    expect(handle).toHaveAttribute("aria-valuenow", "374");
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "normal");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded");
    expect(handle).toHaveAttribute("aria-valuenow", "736");

    fireEvent.keyDown(handle, { key: "Home" });
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "collapsed");
    expect(handle).toHaveAttribute("aria-valuenow", "140");
    await waitFor(() => expect(screen.queryByTestId("route-planner-scroll-region")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "normal");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    fireEvent(window, new Event("resize"));
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

  it("does not render a second selected-room action panel inside the planner", () => {
    render(<RoutePlannerDialog {...plannerProps({ toRoom: room("admin-office", "Administration Office") })} />);
    expect(screen.getByTestId("route-endpoint-card-destination")).toHaveTextContent("Administration Office");
    expect(screen.queryByTestId("selected-room-planner-context")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use as Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use as Destination" })).not.toBeInTheDocument();
  });

  it("keeps Standard preferences separate from Accessible and SOS modes", () => {
    const onStandardPreferenceChange = vi.fn();
    const view = render(<RoutePlannerDialog {...plannerProps({ onStandardPreferenceChange })} />);
    const preferences = screen.getByRole("group", { name: "Standard route preference" });
    expect(within(preferences).getByRole("button", { name: "Best" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(preferences).getByRole("button", { name: "Prefer stairs" }));
    expect(onStandardPreferenceChange).toHaveBeenCalledWith("stairs");

    view.rerender(<RoutePlannerDialog {...plannerProps({ mode: "accessible", onStandardPreferenceChange })} />);
    expect(screen.queryByRole("group", { name: "Standard route preference" })).not.toBeInTheDocument();
    expect(screen.getByTestId("accessible-route-note")).toBeInTheDocument();
    view.rerender(<RoutePlannerDialog {...plannerProps({ mode: "emergency", onStandardPreferenceChange })} />);
    expect(screen.getByTestId("emergency-destination")).toBeInTheDocument();
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
    expect(screen.getByTestId("route-planner-swap-row")).toHaveClass("h-10", "shrink-0", "items-center", "justify-center");
    fireEvent.click(swap);
    expect(onSwapEndpoints).toHaveBeenCalledOnce();
  });

  it("keeps the desktop planner content-sized and preserves its search state when suspended", async () => {
    const view = render(<RoutePlannerDialog {...plannerProps({ destinationResults: [
      destinationResult({ id: "science", name: "Science Hall", kind: "building", buildingId: "science" }),
    ] })} />);
    const dialog = screen.getByTestId("route-planner-dialog");
    expect(dialog).toHaveClass("md:h-fit", "md:max-h-[75dvh]", "md:relative");
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

  it("calculates a route on Find Route instead of requiring a precomputed route", () => {
    const onFindRoute = vi.fn(() => false);
    render(
      <RoutePlannerDialog
        {...plannerProps({
          from: building("science", "SCI", "Science Hall"),
          to: building("library", "LIB", "Library"),
          onFindRoute,
        })}
      />,
    );

    const findRoute = screen.getByRole("button", { name: "Find Route" });
    expect(findRoute).toBeEnabled();
    fireEvent.click(findRoute);
    expect(onFindRoute).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Start Navigation/i })).not.toBeInTheDocument();
  });

  it("does not offer Campus Gate as a selectable endpoint in Emergency mode", async () => {
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      destinationResults: [
        destinationResult({ id: "gate-main", name: "Campus Gate", kind: "marker", category: "gate", campusPlaceId: "gate-main" }),
        destinationResult({ id: "science", name: "Science Hall", kind: "building", buildingId: "science" }),
      ],
    })} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    const results = await screen.findByRole("listbox", { name: "Campus destination results" });
    expect(within(results).queryByRole("option", { name: /Campus Gate/ })).not.toBeInTheDocument();
    expect(within(results).getByRole("option", { name: /Science Hall/ })).toBeInTheDocument();
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
