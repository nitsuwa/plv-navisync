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
  it("blocks a zero-distance route when the selected origin and destination are the same place", () => {
    const onFindRoute = vi.fn();
    const selectedPlace = building("science", "SCI", "Science Hall");
    render(<RoutePlannerDialog {...plannerProps({
      from: selectedPlace,
      to: selectedPlace,
      onFindRoute,
    })} />);

    expect(screen.getByTestId("same-route-endpoint-error")).toHaveTextContent("Choose two different places");
    const findRoute = screen.getByRole("button", { name: "Choose a different place" });
    expect(findRoute).toBeDisabled();
    fireEvent.click(findRoute);
    expect(onFindRoute).not.toHaveBeenCalled();
  });

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
      to: building("caba", "CABA", "College of Accountancy and Business Administration"),
      toRoom: room("caba-101", "CABA-101", "caba"),
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

  it("disables Previous and Next while a seek is settling but keeps Pause available", () => {
    const onPreviousStep = vi.fn();
    const onNextStep = vi.fn();
    const onPause = vi.fn();
    const base = plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "follow",
      playbackPaused: true,
      currentStepIndex: 0,
      seekTargetIndex: 1,
      primaryAction: "pause",
      navigationSteps: ["Start at Campus Gate.", "Follow the campus path.", "Arrive at Canteen."],
      onPreviousStep,
      onNextStep,
      onPause,
    });
    const view = render(<RoutePlannerDialog {...base} />);

    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent("Start at Campus Gate.");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause navigation" })).toBeEnabled();
    // Repeated same-direction clicks and an opposite-direction retarget are
    // ignored until this single authoritative seek has settled.
    for (const direction of ["Next", "Next", "Previous", "Previous", "Next", "Previous"]) {
      fireEvent.click(screen.getByRole("button", { name: direction }));
    }
    expect(onPreviousStep).not.toHaveBeenCalled();
    expect(onNextStep).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause navigation" }));
    expect(onPause).toHaveBeenCalledOnce();

    view.rerender(<RoutePlannerDialog {...base} currentStepIndex={1} seekTargetIndex={2} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("suppresses normal Route A/B choices even when automatic candidates are supplied", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "preview",
      mode: "standard",
      automaticRouteChoices: [
        { id: "route-a", label: "Route A" },
        { id: "route-b", label: "Route B" },
      ],
    })} />);
    expect(screen.queryByTestId("automatic-route-selector")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Route A" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Route B" })).not.toBeInTheDocument();
  });

  it("explains when the selected Standard preference is unavailable in preview and active navigation", () => {
    const routeUsingElevator = route({
      transitionDetails: [{ kind: "elevator", nodeId: "elevator-1", label: "Elevator 1" }],
      transitions: ["Take the elevator to Floor 4"],
    });
    const base = plannerProps({
      from: building("canteen", "CANT", "Canteen"),
      to: building("caba", "CABA", "CABA"),
      route: routeUsingElevator,
      mode: "standard",
      standardPreference: "stairs",
      phase: "preview",
    });
    const view = render(<RoutePlannerDialog {...base} />);

    expect(screen.getByTestId("route-preference-fallback-note")).toHaveTextContent(
      "No connected route using stairs is available; this route uses the elevator.",
    );

    view.rerender(<RoutePlannerDialog {...base} phase="navigating" cameraMode="follow" currentStepIndex={0} navigationSteps={["Take the elevator to Floor 4.", "Arrive at CABA."]} primaryAction="pause" />);
    expect(screen.getByTestId("route-preference-fallback-note")).toHaveTextContent("this route uses the elevator");
  });

  it("presents Explore as a route-preview itinerary without a Previous/Next stepper", () => {
    const onCameraModeChange = vi.fn();
    const onPreviousStep = vi.fn();
    const onNextStep = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onInspectStep = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "navigating",
      cameraMode: "explore",
      inspectionContextLabel: "Science Hall · Floor 4",
      currentStepIndex: 1,
      followStepIndex: 0,
      navigationSteps: ["Start at Campus Gate.", "Follow the campus path toward the Canteen.", "Your destination is on the right."],
      onCameraModeChange, onPreviousStep, onNextStep, onPause, onResume, onInspectStep,
    })} />);
    // Explore has no automatic playback: there is no Pause/Resume control.
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to Explore mode" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("guided-inspection-context")).toHaveTextContent("Science Hall · Floor 4");
    expect(screen.getByTestId("explore-route-guidance")).toHaveTextContent("Move the map");
    expect(screen.getByTestId("explore-route-summary")).toHaveTextContent("Standard route");
    expect(screen.getByTestId("explore-route-summary")).toHaveTextContent("Campus Gate → Canteen");
    expect(screen.getByTestId("guided-route-steps").children).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Route details" })).not.toBeInTheDocument();
    expect(screen.getByTestId("explore-inspected-step")).toHaveTextContent("Follow the campus path toward the Canteen.");
    expect(screen.getByTestId("explore-follow-current-marker")).toHaveTextContent("Current");
    expect(screen.getByTestId("explore-instruction-1")).toHaveClass("text-xs", "leading-snug", "md:text-[13px]");
    expect(screen.getByTestId("explore-instruction-1")).not.toHaveClass("min-h-11");
    fireEvent.click(screen.getByTestId("explore-instruction-2"));
    expect(onInspectStep).toHaveBeenCalledWith(2);
    expect(onPreviousStep).not.toHaveBeenCalled();
    expect(onNextStep).not.toHaveBeenCalled();
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Return to Follow mode" }));
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
    expect(screen.getByRole("button", { name: "Return to Follow mode" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to Follow" })).not.toBeInTheDocument();
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

    expect(screen.getByTestId("desktop-route-collapsed-summary")).toHaveTextContent("Route context");
    expect(screen.queryByRole("button", { name: "Previous step" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next step" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to Follow mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand navigation panel" }));
    expect(onCameraModeChange).toHaveBeenCalledWith("follow");
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("starts guided navigation compact and opens the full panel in one tap", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("gate", "GATE", "Campus Gate"),
        to: building("canteen", "CANT", "Canteen"),
        route: route(),
        phase: "navigating",
        collapsed: true,
        navigationSteps: ["Start at Campus Gate.", "Follow the campus path toward the Canteen."],
      })} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      await waitFor(() => expect(screen.getByTestId("mobile-route-collapsed-summary")).toBeInTheDocument());
      expect(screen.queryByTestId("guided-navigation-summary")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Expand navigation panel" }));
      await waitFor(() => expect(screen.getByTestId("guided-navigation-summary")).toBeInTheDocument());
      expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("clearly marks Follow playback paused for map inspection in compact and expanded navigation", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("caba", "CABA", "CABA"),
        to: building("assembly", "AP", "Assembly Point"),
        route: route({ fromCode: "CABA", toCode: "AP" }),
        phase: "navigating",
        cameraMode: "follow",
        collapsed: true,
        inspectionPaused: true,
        playbackPaused: true,
        primaryAction: "resume",
        navigationSteps: ["Walk to the stair.", "Continue to Ground Floor."],
      })} />);

      await waitFor(() => expect(screen.getByTestId("mobile-route-collapsed-summary")).toBeInTheDocument());
      expect(screen.getByTestId("route-paused-for-inspection")).toHaveTextContent("Paused for map inspection");
      fireEvent.click(screen.getByRole("button", { name: "Expand navigation panel" }));
      await waitFor(() => expect(screen.getByTestId("guided-navigation-summary")).toBeInTheDocument());
      expect(screen.getByTestId("route-paused-for-inspection")).toHaveTextContent("Resume to return the map to your route");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("does not show the Follow inspection pause notice in Explore", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("caba", "CABA", "CABA"),
      to: building("assembly", "AP", "Assembly Point"),
      route: route({ fromCode: "CABA", toCode: "AP" }),
      phase: "navigating",
      cameraMode: "explore",
      inspectionPaused: true,
      playbackPaused: true,
      navigationSteps: ["Walk to the stair.", "Continue to Ground Floor."],
    })} />);

    expect(screen.queryByTestId("route-paused-for-inspection")).not.toBeInTheDocument();
  });

  it("shows only progress while Follow is reacquiring, then keeps Retry actionable after failure", () => {
    const onRetryContextRecovery = vi.fn();
    const { rerender } = render(<RoutePlannerDialog {...plannerProps({
      from: building("caba", "CABA", "CABA"),
      to: building("assembly", "AP", "Assembly Point"),
      route: route({ fromCode: "CABA", toCode: "AP" }),
      phase: "navigating",
      cameraMode: "follow",
      playbackPaused: true,
      contextRecoveryPending: true,
      onRetryContextRecovery,
      navigationSteps: ["Walk to the stair.", "Continue to Ground Floor."],
    })} />);

    expect(screen.getByTestId("route-context-recovery-status")).toHaveTextContent("Returning to the current route position");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

    rerender(<RoutePlannerDialog {...plannerProps({
      from: building("caba", "CABA", "CABA"),
      to: building("assembly", "AP", "Assembly Point"),
      route: route({ fromCode: "CABA", toCode: "AP" }),
      phase: "navigating",
      cameraMode: "follow",
      playbackPaused: true,
      contextRecoveryFailed: true,
      onRetryContextRecovery,
      navigationSteps: ["Walk to the stair.", "Continue to Ground Floor."],
    })} />);

    expect(screen.getByTestId("route-context-recovery-failed")).toHaveTextContent("Could not return to the route position");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryContextRecovery).toHaveBeenCalledOnce();
  });

  it("keeps Start Navigation visible in the first collapsed mobile route preview", async () => {
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
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      await waitFor(() => expect(screen.getByTestId("mobile-route-preview-collapsed-summary")).toBeInTheDocument());
      expect(dialog.style.height).toBe("236px");
      expect(screen.queryByTestId("route-summary")).not.toBeInTheDocument();
      const compactStart = screen.getByTestId("mobile-route-preview-start-navigation");
      expect(compactStart).toBeVisible();
      expect(screen.getByRole("button", { name: "Expand route panel" })).toBeVisible();
      expect(screen.queryByTestId("route-planner-responsive-header-controls")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));
      await waitFor(() => expect(screen.getByTestId("route-summary")).toBeInTheDocument());
      const scrollRegion = screen.getByTestId("route-planner-scroll-region");
      expect(scrollRegion).toHaveClass("min-h-0", "overflow-y-auto", "overscroll-contain");
      expect(scrollRegion.style.flex).toBe("0 1 auto");
      expect(screen.getByTestId("route-planner-footer")).toHaveClass("shrink-0");
      const startNavigation = screen.getByRole("button", { name: "Start Navigation" });
      expect(startNavigation).toBeVisible();
      fireEvent.click(startNavigation);
      expect(onStartNavigation).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it.each(["standard", "accessible", "emergency"] as const)("shows the selected Follow/Explore mode in a %s route preview", (mode) => {
    render(<RoutePlannerDialog {...plannerProps({
      mode,
      from: building("caba", "CABA", "CABA"),
      to: building("assembly", "AP", "Assembly Point"),
      route: route({ mode }),
      phase: "preview",
      cameraMode: "follow",
    })} />);

    const selector = screen.getByTestId("route-preview-camera-mode");
    expect(within(selector).getByRole("button", { name: "Switch to Follow mode" })).toHaveAttribute("aria-pressed", "true");
    expect(within(selector).getByRole("button", { name: "Switch to Explore mode" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows Start immediately and eligible SOS alternatives after expanding the mobile preview", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const emergencyRoutes = [
      { id: "left", label: "Left Exit", doorLabel: "Door 2", exitLabel: "Emergency Stair 1" },
      { id: "right", label: "Right Exit", doorLabel: "Door 1", exitLabel: "Emergency Stair 2" },
    ];
    try {
      render(<RoutePlannerDialog {...plannerProps({
        mode: "emergency",
        phase: "preview",
        route: route({ mode: "emergency", emergencyDestinationLabel: "Main Assembly Point", emergencyAssemblyPointId: "assembly-a" }),
        emergencyRoutes,
        activeEmergencyRouteId: "left",
        headerModeToggle: <button type="button" data-testid="header-renderer-toggle">2D/3D</button>,
        headerUtility: <div data-testid="preview-tools"><button type="button">Floor 4</button><button type="button">Sound On</button></div>,
      })} />);

      await screen.findByTestId("mobile-route-preview-collapsed-summary");
      expect(screen.getByTestId("emergency-route-selector")).toBeVisible();
      expect(screen.getByTestId("mobile-route-preview-start-navigation")).toBeVisible();
      expect(screen.queryByTestId("route-planner-responsive-header-controls")).not.toBeInTheDocument();
      expect(screen.getByTestId("header-renderer-toggle")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));
      await waitFor(() => expect(screen.getByTestId("route-planner-dialog")).toHaveAttribute("data-mobile-sheet-state", "expanded"));
      expect(await screen.findByTestId("emergency-route-selector")).toHaveTextContent("Route B");
      expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
      expect(screen.getByTestId("route-planner-responsive-header-controls")).toContainElement(screen.getByTestId("preview-tools"));
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("keeps a longer Assembly Point name readable in the compact and expanded mobile preview", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    const destinationName = "North Campus Emergency Assembly Point";
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("caba", "CABA", "CABA-201"),
        mode: "emergency",
        phase: "preview",
        route: route({ mode: "emergency", emergencyDestinationLabel: destinationName, emergencyAssemblyPointId: "assembly-a" }),
        emergencyRoutes: [{ id: "exit-a", label: "Route A", doorLabel: "Door 1", exitLabel: "Exterior Stair" }],
        activeEmergencyRouteId: "exit-a",
        emergencyAvailability: { state: "approved", destinationName, details: [] },
      })} />);

      const collapsed = await screen.findByTestId("mobile-route-preview-collapsed-summary");
      expect(collapsed).toHaveTextContent(destinationName);
      expect(collapsed.querySelector("[title]")).toHaveAttribute("title", destinationName);
      fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));

      const destination = await screen.findByTestId("emergency-route-summary-destination");
      expect(destination).toHaveTextContent(destinationName);
      expect(destination).toHaveAttribute("title", destinationName);
      expect(destination).toHaveClass("line-clamp-2", "break-words");
      expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("opens the content-sized mobile Route Preview in one tap", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("gate", "GATE", "Campus Gate"),
        to: building("caba", "CABA", "College of Accountancy and Business Administration"),
        toRoom: room("caba-101", "CABA-101", "caba"),
        route: route(),
        phase: "preview",
      })} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));
      expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded");
      expect(screen.getByTestId("route-summary")).toBeInTheDocument();
      expect(dialog.style.height).toBe("fit-content");
      expect(screen.getByTestId("route-planner-scroll-region").getAttribute("style")).toContain("44dvh");
      expect(screen.getByRole("button", { name: "Start Navigation" })).toBeVisible();
      expect(screen.getByTestId("route-facts")).toHaveClass("hidden", "md:flex");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("keeps the CABA SOS origin, destination, Route A/B, and Start visible in the collapsed preview", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const onStartNavigation = vi.fn();
    const onSelectEmergencyRoute = vi.fn();
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("caba", "CABA", "CABA"),
        fromRoom: room("caba-403", "CABA-403", "caba"),
        mode: "emergency",
        phase: "preview",
        route: route({ mode: "emergency", fromCode: "CABA-403", toCode: "ASSEMBLY", emergencyDestinationLabel: "PLV Assembly Point" }),
        emergencyRoutes: [
          { id: "route-a", label: "Route A", doorLabel: "Room door", exitLabel: "Left Stair" },
          { id: "route-b", label: "Route B", doorLabel: "Room door 2", exitLabel: "Right Stair" },
        ],
        activeEmergencyRouteId: "route-a",
        onSelectEmergencyRoute,
        onStartNavigation,
      })} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      const summary = await screen.findByTestId("mobile-route-preview-collapsed-summary");
      expect(summary).toHaveTextContent("CABA-403");
      expect(summary).toHaveTextContent("PLV Assembly Point");
      expect(summary).toHaveTextContent("SOS · Emergency route");
      expect(within(summary).getByTestId("emergency-route-tab-0")).toBeVisible();
      expect(within(summary).getByTestId("emergency-route-tab-1")).toBeVisible();
      expect(within(summary).getByRole("button", { name: "Start Navigation" })).toBeVisible();
      fireEvent.click(within(summary).getByTestId("emergency-route-tab-1"));
      expect(onSelectEmergencyRoute).toHaveBeenCalledWith("route-b");
      fireEvent.click(within(summary).getByRole("button", { name: "Start Navigation" }));
      expect(onStartNavigation).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("gives a compact SOS preview room for Route A/B and synchronizes handle snaps", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    const onExpand = vi.fn();
    const onCollapse = vi.fn();
    const onSelectEmergencyRoute = vi.fn();
    const onCameraModeChange = vi.fn();
    const props = plannerProps({
      from: building("caba", "CABA", "CABA"),
      fromRoom: room("caba-201", "CABA-201", "caba"),
      mode: "emergency",
      phase: "preview",
      cameraMode: "explore",
      route: route({ mode: "emergency", fromCode: "CABA-201", emergencyDestinationLabel: "PLV Assembly Point" }),
      emergencyRoutes: [
        { id: "route-a", label: "Route A", doorLabel: "Room door", exitLabel: "Exterior Stair 1" },
        { id: "route-b", label: "Route B", doorLabel: "Room door 2", exitLabel: "Exterior Stair 2" },
      ],
      activeEmergencyRouteId: "route-a",
      onSelectEmergencyRoute,
      onCameraModeChange,
      onExpand,
      onCollapse,
    });

    try {
      const view = render(<RoutePlannerDialog {...props} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      const summary = await screen.findByTestId("mobile-route-preview-collapsed-summary");
      expect(dialog.style.height).toBe("268px");
      expect(summary).toHaveTextContent("Emergency route");
      expect(summary).toHaveTextContent("CABA-201");
      expect(summary).toHaveTextContent("PLV Assembly Point");
      expect(within(summary).getByTestId("emergency-route-tab-0")).toBeVisible();
      expect(within(summary).getByTestId("emergency-route-tab-1")).toBeVisible();
      expect(within(summary).getByRole("button", { name: "Start Navigation" })).toBeVisible();

      fireEvent.click(within(summary).getByTestId("emergency-route-tab-1"));
      expect(onSelectEmergencyRoute).toHaveBeenCalledWith("route-b");
      view.rerender(<RoutePlannerDialog {...props} activeEmergencyRouteId="route-b" />);

      const handle = screen.getByTestId("route-planner-resize-handle");
      fireEvent.pointerDown(handle, { pointerId: 31, pointerType: "touch", clientY: 250 });
      fireEvent.pointerMove(handle, { pointerId: 31, pointerType: "touch", clientY: 180 });
      fireEvent.pointerUp(handle, { pointerId: 31, pointerType: "touch", clientY: 180 });
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded"));
      expect(onExpand).toHaveBeenCalledOnce();
      expect(screen.getByTestId("emergency-route-tab-1")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Switch to Explore mode" })).toHaveAttribute("aria-pressed", "true");

      fireEvent.pointerDown(handle, { pointerId: 32, pointerType: "touch", clientY: 180 });
      fireEvent.pointerMove(handle, { pointerId: 32, pointerType: "touch", clientY: 250 });
      fireEvent.pointerUp(handle, { pointerId: 32, pointerType: "touch", clientY: 250 });
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      expect(onCollapse).toHaveBeenCalledOnce();
      expect(within(screen.getByTestId("mobile-route-preview-collapsed-summary")).getByTestId("emergency-route-tab-1")).toHaveAttribute("aria-pressed", "true");
      expect(within(screen.getByTestId("mobile-route-preview-collapsed-summary")).getByRole("button", { name: "Start Navigation" })).toBeVisible();
      expect(onCameraModeChange).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("shows eligible SOS choices from the collapsed overview", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const onSelectEmergencyRoute = vi.fn();
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("caba", "CABA", "CABA"),
        fromRoom: room("caba-403", "CABA-403", "caba"),
        mode: "emergency",
        phase: "preview",
        route: route({ mode: "emergency", fromCode: "CABA-403", emergencyDestinationLabel: "PLV Assembly Point" }),
        emergencyRoutes: [
          { id: "route-a", label: "Route A", doorLabel: "Room door", exitLabel: "Left Stair" },
          { id: "route-b", label: "Route B", doorLabel: "Room door 2", exitLabel: "Right Stair" },
        ],
        emergencyRouteOverview: true,
        onSelectEmergencyRoute,
      })} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      expect(await screen.findByTestId("mobile-emergency-route-overview-choices")).toBeVisible();
      fireEvent.click(screen.getByTestId("emergency-route-tab-0"));
      expect(onSelectEmergencyRoute).toHaveBeenCalledWith("route-a");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("centers the choose-on-map sheet handle on mobile and removes it on desktop", () => {
    const originalWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
      const mobile = render(<RoutePlannerDialog {...plannerProps()} />);
      const handle = screen.getByTestId("route-planner-resize-handle");
      expect(handle).toHaveClass("mx-auto", "w-full", "items-center", "justify-center");
      mobile.unmount();

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
      render(<RoutePlannerDialog {...plannerProps()} />);
      expect(screen.queryByTestId("route-planner-resize-handle")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("reopens a minimized mobile preview in the expanded state when the parent route dock requests it", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const baseProps = plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("caba", "CABA", "College of Accountancy and Business Administration"),
      toRoom: room("caba-101", "CABA-101", "caba"),
      route: route(),
      phase: "preview",
    });
    const view = render(<RoutePlannerDialog {...baseProps} />);
    const dialog = screen.getByTestId("route-planner-dialog");
    try {
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded"));
      fireEvent.click(screen.getByRole("button", { name: "Collapse route preview" }));
      view.rerender(<RoutePlannerDialog {...baseProps} collapsed mobilePreviewExpanded={false} />);
      view.rerender(<RoutePlannerDialog {...baseProps} collapsed={false} mobilePreviewExpanded />);

      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded"));
      expect(screen.getByTestId("route-planner-footer")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start Navigation" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("snaps the mobile route sheet only to Compact or Expanded from handle drags", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("gate", "GATE", "Campus Gate"),
        to: building("caba", "CABA", "College of Accountancy and Business Administration"),
        route: route(),
        phase: "preview",
      })} />);
      const dialog = screen.getByTestId("route-planner-dialog");
      const handle = screen.getByTestId("route-planner-resize-handle");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));

      fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "touch", clientY: 250 });
      fireEvent.pointerMove(handle, { pointerId: 1, pointerType: "touch", clientY: 180 });
      fireEvent.pointerUp(handle, { pointerId: 1, pointerType: "touch", clientY: 180 });
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded"));
      expect(dialog.style.height).toBe("fit-content");

      fireEvent.pointerDown(handle, { pointerId: 2, pointerType: "touch", clientY: 180 });
      fireEvent.pointerMove(handle, { pointerId: 2, pointerType: "touch", clientY: 250 });
      fireEvent.pointerUp(handle, { pointerId: 2, pointerType: "touch", clientY: 250 });
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      expect(dialog.style.height).toBe("236px");
      await waitFor(() => expect(screen.getByTestId("mobile-route-preview-start-navigation")).toBeVisible());
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("shows contextual transition instructions and routes Continue to canonical activation", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const onContinueTransition = vi.fn();
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("gate", "GATE", "Campus Gate"),
        to: building("caba", "CABA", "College of Accountancy and Business Administration"),
        toRoom: room("caba-101", "CABA-101", "caba"),
        route: route(),
        phase: "navigating",
        playbackPaused: true,
        transitionAwaitingAction: true,
        transitionPrompt: "Tap the Elevator 1 or press Continue.",
        onContinueTransition,
      })} />);
      expect(screen.getByTestId("transition-wait-prompt")).toHaveTextContent("Tap the Elevator 1 or press Continue.");
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(onContinueTransition).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("allows one Pause request during an automatic vertical handoff and reflects the pending stop", () => {
    const onPause = vi.fn();
    const props = plannerProps({
      from: building("science", "SCI", "Science Hall"),
      to: building("caba", "CABA", "College of Accountancy and Business Administration"),
      toRoom: room("caba-101", "CABA-101", "caba"),
      route: route(),
      phase: "navigating",
      playbackPaused: false,
      primaryAction: "pause",
      transitionBusy: true,
      pauseDuringVerticalRun: true,
      onPause,
    });
    const view = render(<RoutePlannerDialog {...props} />);
    const pause = screen.getByRole("button", { name: "Pause navigation" });
    expect(pause).toBeEnabled();
    fireEvent.click(pause);
    expect(onPause).toHaveBeenCalledOnce();

    view.rerender(<RoutePlannerDialog {...props} verticalRunPausePending />);
    expect(screen.getByRole("button", { name: "Pause navigation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pause navigation" })).toHaveTextContent("Pausing");
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
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded"));
      view.rerender(<RoutePlannerDialog {...props} suspendedForFloorPicker />);
      await waitFor(() => expect(dialog).toHaveAttribute("data-suspended-for-floor-picker", "true"));
      expect(screen.getByTestId("route-planner-floor-picker-suspended")).toBeInTheDocument();
      expect(dialog).toHaveStyle({ height: "140px" });
      view.rerender(<RoutePlannerDialog {...props} suspendedForFloorPicker={false} />);
      await waitFor(() => expect(dialog).toHaveAttribute("data-suspended-for-floor-picker", "false"));
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded"));
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

  it("offers Edit Route from Arrived without clearing or restarting the completed route", () => {
    const onDone = vi.fn();
    const onStartNavigation = vi.fn();
    const onEditRoute = vi.fn();
    const onPreviousStep = vi.fn();
    const onClear = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("gate", "GATE", "Campus Gate"),
      to: building("canteen", "CANT", "Canteen"),
      route: route(),
      phase: "arrived",
      currentStepIndex: 2,
      navigationSteps: ["Start at Campus Gate.", "Follow the route.", "Arrive at Canteen."],
      onDone, onStartNavigation, onEditRoute, onPreviousStep, onClear,
    })} />);

    expect(screen.getByTestId("route-arrival-state")).toHaveTextContent("You've arrived");
    expect(screen.getByRole("button", { name: "Previous step from arrival" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit Route" })).toBeInTheDocument();
    expect(screen.getByTestId("route-arrival-state").querySelector(".grid.grid-cols-2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Route" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart Route" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous step from arrival" }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(onStartNavigation).toHaveBeenCalledOnce();
    expect(onEditRoute).toHaveBeenCalledOnce();
    expect(onPreviousStep).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("keeps collapsed mobile arrival actions in a full-width primary row and a separate secondary row", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const onPreviousStep = vi.fn();
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("science", "SCI", "Science Hall"),
        to: building("canteen", "CANT", "Canteen"),
        route: route(),
        phase: "arrived",
        collapsed: true,
        currentStepIndex: 2,
        navigationSteps: ["Start at Campus Gate.", "Follow the route.", "Arrive at Canteen."],
        onPreviousStep,
      })} />);
      fireEvent.click(screen.getByRole("button", { name: "Collapse route preview" }));
      const arrival = await screen.findByTestId("mobile-route-arrival-compact");
      expect(within(arrival).getByRole("button", { name: "Restart Route" })).toHaveClass("w-full");
      expect(within(arrival).getByRole("button", { name: "Edit Route" })).toHaveClass("min-h-11");
      expect(within(arrival).getByRole("button", { name: "Done" })).toHaveClass("min-h-11");
      fireEvent.click(within(arrival).getByRole("button", { name: "Previous step from arrival" }));
      expect(onPreviousStep).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("uses the existing prefilled planner when editing an arrived route and Cancel restores instead of clearing", () => {
    const onCancelEditRoute = vi.fn();
    const onClear = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      to: building("canteen", "CANT", "Canteen"),
      route: null,
      phase: "planning",
      editingCompletedRoute: true,
      mode: "accessible",
      onCancelEditRoute,
      onClear,
    })} />);

    expect(screen.getByTestId("route-endpoint-card-start")).toHaveTextContent("Science Hall");
    expect(screen.getByTestId("route-endpoint-card-destination")).toHaveTextContent("Canteen");
    expect(screen.getByRole("button", { name: "Accessible routing" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelEditRoute).toHaveBeenCalledOnce();
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
    expect(screen.getByTestId("emergency-route-status")).toHaveAttribute("data-status", "exit-only-preview");
    expect(screen.getByTestId("emergency-route-status")).toHaveTextContent("This route ends at a building exit.");
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Emergency Stair → Campus Gate");
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Emergency route");
    expect(screen.queryByRole("button", { name: "Choose destination" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Swap start and destination" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onStartNavigation).toHaveBeenCalledOnce();
    expect(onFindRoute).not.toHaveBeenCalled();
  });

  it("starts on the recommended emergency route and keeps only meaningful Route A/B choices", () => {
    const onSelectEmergencyRoute = vi.fn();
    const onStartNavigation = vi.fn();
    const emergencyRoutes = [
      { id: "left", label: "Left Exit", doorLabel: "Room Door A", exitLabel: "CABA Building ? Exterior Emergency Stair -> TEST ONLY - Main Assembly Point A ? Exterior Stair 2" },
      { id: "right", label: "Right Exit", doorLabel: "Room Door B", exitLabel: "East Exit" },
    ];
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "preview",
      route: route({ mode: "emergency", emergencyDestinationLabel: "West Exit" }),
      emergencyRoutes,
      activeEmergencyRouteId: "left",
      emergencyRouteOverview: false,
      onSelectEmergencyRoute,
      onStartNavigation,
    })} />);

    expect(screen.getByTestId("route-summary")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route A");
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route B");
    expect(screen.getByTestId("emergency-route-tab-0")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Both Routes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("emergency-route-overview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("emergency-route-tab-1"));
    expect(onSelectEmergencyRoute).toHaveBeenCalledWith("right");
    expect(onStartNavigation).not.toHaveBeenCalled();
  });

  it("pauses active SOS guidance and uses an inline, cancellable Route A/B confirmation", () => {
    const onSelectEmergencyRoute = vi.fn();
    const onPause = vi.fn();
    const onClose = vi.fn();
    const onEditRoute = vi.fn();
    const onActiveEndpointChange = vi.fn();
    const emergencyRoutes = [
      { id: "left", label: "Left Exit", doorLabel: "Room Door A", exitLabel: "Left Stair" },
      { id: "right", label: "Right Exit", doorLabel: "Room Door B", exitLabel: "Right Stair" },
    ];
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "navigating",
      playbackPaused: false,
      route: route({ mode: "emergency", emergencyDestinationLabel: "Test Assembly Point" }),
      emergencyRoutes,
      activeEmergencyRouteId: "left",
      onSelectEmergencyRoute,
      onPause,
      onClose,
      onEditRoute,
      onActiveEndpointChange,
    })} />);

    fireEvent.click(screen.getByTestId("emergency-route-tab-1"));
    expect(onPause).toHaveBeenCalledOnce();
    expect(screen.getByTestId("emergency-route-switch-confirmation")).toHaveTextContent("Switch to Route B?");
    expect(screen.getByTestId("emergency-route-switch-confirmation")).toHaveTextContent("The marker is simulated. Edit Start if you’ve moved.");
    expect(screen.getByRole("button", { name: "Keep Route A" })).toHaveFocus();
    expect(onSelectEmergencyRoute).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("emergency-route-switch-confirmation")).not.toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-tab-1")).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSelectEmergencyRoute).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("emergency-route-tab-1"));
    fireEvent.click(screen.getByRole("button", { name: "Keep Route A" }));
    expect(screen.queryByTestId("emergency-route-switch-confirmation")).not.toBeInTheDocument();
    expect(onSelectEmergencyRoute).not.toHaveBeenCalled();
    expect(screen.getByTestId("emergency-route-tab-0")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTestId("emergency-route-tab-1"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Start" }));
    expect(onEditRoute).toHaveBeenCalledOnce();
    expect(onActiveEndpointChange).toHaveBeenCalledWith("start");
    expect(onSelectEmergencyRoute).not.toHaveBeenCalled();
  });

  it("commits the chosen route only after confirmation and supports switching back", () => {
    const onSelectEmergencyRoute = vi.fn();
    const emergencyRoutes = [
      { id: "left", label: "Left Exit", doorLabel: "Room Door A", exitLabel: "Left Stair" },
      { id: "right", label: "Right Exit", doorLabel: "Room Door B", exitLabel: "Right Stair" },
    ];
    const props = plannerProps({
      mode: "emergency",
      phase: "navigating",
      playbackPaused: false,
      route: route({ mode: "emergency", emergencyDestinationLabel: "Test Assembly Point" }),
      emergencyRoutes,
      activeEmergencyRouteId: "left",
      onSelectEmergencyRoute,
    });
    const view = render(<RoutePlannerDialog {...props} />);

    fireEvent.click(screen.getByTestId("emergency-route-tab-1"));
    fireEvent.click(screen.getByRole("button", { name: "Switch to Route B" }));
    expect(onSelectEmergencyRoute).toHaveBeenCalledOnce();
    expect(onSelectEmergencyRoute).toHaveBeenCalledWith("right");
    expect(screen.queryByTestId("emergency-route-switch-confirmation")).not.toBeInTheDocument();

    view.rerender(<RoutePlannerDialog {...props} phase="preview" playbackPaused activeEmergencyRouteId="right" />);
    expect(screen.getByTestId("emergency-route-tab-1")).toHaveAttribute("aria-pressed", "true");
    view.rerender(<RoutePlannerDialog {...props} phase="navigating" playbackPaused activeEmergencyRouteId="right" />);
    fireEvent.click(screen.getByTestId("emergency-route-tab-0"));
    expect(screen.getByTestId("emergency-route-switch-confirmation")).toHaveTextContent("Switch to Route A?");
    fireEvent.click(screen.getByRole("button", { name: "Switch to Route A" }));
    expect(onSelectEmergencyRoute).toHaveBeenLastCalledWith("left");
  });

  it("allows replacing a pending floor handoff only after an explicit route confirmation", () => {
    const onSelectEmergencyRoute = vi.fn();
    const onPause = vi.fn();
    const emergencyRoutes = [
      { id: "left", label: "Left Exit", doorLabel: "Room Door A", exitLabel: "Left Stair" },
      { id: "right", label: "Right Exit", doorLabel: "Room Door B", exitLabel: "Right Stair" },
    ];
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "navigating",
      playbackPaused: true,
      transitionBusy: true,
      transitionAwaitingAction: true,
      route: route({ mode: "emergency", emergencyDestinationLabel: "Test Assembly Point" }),
      emergencyRoutes,
      activeEmergencyRouteId: "left",
      onSelectEmergencyRoute,
      onPause,
    })} />);

    fireEvent.click(screen.getByTestId("emergency-route-tab-1"));
    expect(onPause).toHaveBeenCalledOnce();
    expect(screen.getByTestId("emergency-route-switch-confirmation")).toBeInTheDocument();
    expect(onSelectEmergencyRoute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Route B" }));
    expect(onSelectEmergencyRoute).toHaveBeenCalledWith("right");
  });

  it("marks completed, active, and upcoming guided steps and labels route actions by phase", () => {
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "navigating",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Test Assembly Point" }),
      currentStepIndex: 1,
      navigationSteps: ["Leave the room.", "Take Left Stair to Floor 1.", "Exit to the assembly point."],
      onEndNavigation: vi.fn(),
    })} />);

    fireEvent.click(screen.getByRole("button", { name: "Steps" }));
    const steps = screen.getByTestId("guided-route-steps");
    expect(steps.children).toHaveLength(3);
    expect(steps.children[0]).toHaveAttribute("data-step-state", "completed");
    expect(steps.children[1]).toHaveAttribute("data-step-state", "active");
    expect(steps.children[2]).toHaveAttribute("data-step-state", "upcoming");
    expect(screen.getByRole("button", { name: "End Navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End Route Preview" })).not.toBeInTheDocument();
  });

  it("gives mobile Guided Navigation a bounded independent step scroller while keeping the panel actions available", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const view = render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "navigating",
      cameraMode: "explore",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Test Assembly Point" }),
      navigationSteps: ["Follow the indoor path to the Left Stair.", "Take the Left Stair down to Floor 2.", "Exit to the campus path.", "Follow the outdoor path to the Assembly Point."],
      onEndNavigation: vi.fn(),
    })} />);

    const scrollRegion = screen.getByTestId("route-planner-scroll-region");
    const steps = await screen.findByTestId("guided-route-steps");
    expect(scrollRegion).toHaveClass("overflow-hidden");
    expect(steps).toHaveClass("flex-1", "overflow-y-auto", "touch-pan-y");
    expect(steps).not.toHaveClass("shrink-0");
    expect(screen.getByTestId("guided-navigation-summary")).toHaveClass("flex-1", "min-h-0");
    expect(screen.getByTestId("explore-route-facts")).toHaveClass("hidden", "md:flex");
    expect(screen.getByRole("button", { name: "End Navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause navigation" })).not.toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    act(() => fireEvent(window, new Event("resize")));
    await waitFor(() => expect(scrollRegion).toHaveClass("overflow-y-auto"));
    expect(steps).toHaveClass("shrink-0");

    view.unmount();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });

  it("labels preview cleanup as Close Preview", () => {
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "preview",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Test Assembly Point" }),
    })} />);
    expect(screen.getByRole("button", { name: "Close Preview" })).toBeInTheDocument();
  });

  it("gives SOS alternatives distinct Route A/B labels even when they share a fallback destination label", () => {
    const emergencyRoutes = [
      { id: "stair-a", label: "Campus Gate · Fallback", doorLabel: "Room door 2", exitLabel: "Building · Exterior Stair -> Campus Gate · Exterior Stair 1" },
      { id: "stair-b", label: "Campus Gate · Fallback", doorLabel: "Room door 1", exitLabel: "Building · Exterior Stair -> Campus Gate · Exterior Stair 2" },
    ];
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "navigating",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Campus Gate · Fallback" }),
      emergencyRoutes,
      activeEmergencyRouteId: "stair-a",
      emergencyRouteOverview: false,
    })} />);

    expect(screen.getByTestId("emergency-route-tab-0")).toHaveTextContent("Route A");
    expect(screen.getByTestId("emergency-route-tab-1")).toHaveTextContent("Route B");
    expect(screen.getByTestId("emergency-route-tab-0")).toHaveAttribute("aria-label", "Route A: Room door 2 to Exterior Stair 1");
    expect(screen.getByTestId("emergency-route-tab-1")).toHaveAttribute("aria-label", "Route B: Room door 1 to Exterior Stair 2");
  });

  it.each(["standard", "accessible", "emergency"] as const)("keeps the %s renderer switch beside the primary header action at mobile through desktop widths", async (mode) => {
    const originalWidth = window.innerWidth;
    const setWidth = (width: number) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      fireEvent(window, new Event("resize"));
    };
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const onCollapse = vi.fn();
    const view = render(<RoutePlannerDialog {...plannerProps({
      mode,
      phase: "navigating",
      route: route({ mode }),
      cameraMode: "follow",
      onCollapse,
      headerModeToggle: <button type="button" data-testid="header-renderer-toggle">2D/3D</button>,
      headerUtility: <div data-testid="map-controls"><button type="button">Floor 4</button></div>,
    })} />);

    expect(screen.getByTestId("route-planner-responsive-header-controls")).toContainElement(screen.getByTestId("map-controls"));
    expect(screen.getByRole("button", { name: "Floor 4" })).toBeInTheDocument();
    const headerActions = screen.getByTestId("route-planner-header-actions");
    expect(headerActions).toContainElement(screen.getByTestId("header-renderer-toggle"));
    expect(headerActions).toContainElement(screen.getByRole("button", { name: "Collapse navigation panel" }));
    expect(screen.getByTestId("route-planner-responsive-header-controls")).not.toContainElement(screen.getByTestId("header-renderer-toggle"));
    expect(screen.getAllByTestId("header-renderer-toggle")).toHaveLength(1);
    expect(screen.getByTestId("route-planner-header-primary-row").querySelector("p")?.className).toContain("whitespace-nowrap");

    for (const width of [320, 360, 390, 768, 1024]) {
      act(() => setWidth(width));
      await waitFor(() => expect(screen.getByTestId("route-planner-header-actions")).toContainElement(screen.getByTestId("header-renderer-toggle")));
      expect(screen.getAllByTestId("header-renderer-toggle")).toHaveLength(1);
      expect(screen.getByTestId("route-planner-responsive-header-controls")).not.toContainElement(screen.getByTestId("header-renderer-toggle"));
    }
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation panel" }));
    expect(onCollapse).toHaveBeenCalledOnce();
    act(() => setWidth(1440));
    await waitFor(() => expect(screen.queryByTestId("route-planner-responsive-header-controls")).not.toBeInTheDocument());
    expect(screen.getByTestId("route-planner-header-controls")).toContainElement(screen.getByTestId("map-controls"));
    expect(screen.getByTestId("route-planner-header-actions")).toContainElement(screen.getByTestId("header-renderer-toggle"));
    expect(screen.getAllByTestId("header-renderer-toggle")).toHaveLength(1);
    view.unmount();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  });

  it("keeps Explore free of redundant playback controls and exposes only required handoffs", () => {
    const onPause = vi.fn();
    const onPreviousStep = vi.fn();
    const onNextStep = vi.fn();
    const onContinueTransition = vi.fn();
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "navigating",
      route: route({ mode: "emergency", emergencyDestinationLabel: "West Exit" }),
      currentStepIndex: 1,
      cameraMode: "explore",
      emergencyRoutes: [{ id: "left", label: "Left Exit", doorLabel: "Room Door A", exitLabel: "West Exit" }],
      activeEmergencyRouteId: "left",
      navigationSteps: ["Leave the room", "Reach the lobby", "Reach the west exit"],
      onPause,
      onPreviousStep,
      onNextStep,
      transitionAwaitingAction: true,
      transitionActionLabel: "Continue to Floor 5",
      primaryAction: "continue-transition",
      onContinueTransition,
    })} />);
    expect(screen.queryByTestId("emergency-explore-playback-controls")).not.toBeInTheDocument();
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent("Reach the lobby");
    expect(screen.queryByRole("button", { name: /Pause|Resume/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Floor 5" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Floor 5" }));
    expect(onContinueTransition).toHaveBeenCalledOnce();
    expect(onPause).not.toHaveBeenCalled();
    expect(onPreviousStep).not.toHaveBeenCalled();
    expect(onNextStep).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("guided-explore-steps-toggle"));
    expect(screen.queryByTestId("guided-route-steps")).not.toBeInTheDocument();
  });

  it("does not render a Continue action for an Explore walking step", () => {
    render(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      phase: "navigating",
      route: route({ mode: "emergency", emergencyDestinationLabel: "West Exit" }),
      cameraMode: "explore",
      navigationSteps: ["Follow the indoor path to the Left Stair", "Take the Left Stair down"],
      emergencyRoutes: [{ id: "left", label: "Left Exit", doorLabel: "Door A", exitLabel: "Left Stair" }],
      primaryAction: "resume",
      transitionAwaitingAction: false,
    })} />);

    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent("Follow the indoor path to the Left Stair");
    expect(screen.queryByTestId("explore-continue-transition")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause|Resume/ })).not.toBeInTheDocument();
  });

  it("shows the sheet resize affordance only on mobile", () => {
    const originalWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
      const view = render(<RoutePlannerDialog {...plannerProps({ route: route(), phase: "preview" })} />);
      fireEvent(window, new Event("resize"));
      expect(screen.queryByRole("slider", { name: "Resize route planner" })).not.toBeInTheDocument();
      view.unmount();

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
      render(<RoutePlannerDialog {...plannerProps({ route: route(), phase: "preview" })} />);
      fireEvent(window, new Event("resize"));
      expect(screen.getByRole("slider", { name: "Resize route planner" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      fireEvent(window, new Event("resize"));
    }
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
    const chooseOnMap = screen.getByRole("button", { name: "Choose on map" });
    expect(chooseOnMap).toHaveClass("w-full");
    fireEvent.click(chooseOnMap);
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

  it("keeps SOS compact with one route status and no separate destination card", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      emergencyAvailability: {
        state: "available",
        destinationName: "Main Assembly Point A",
        details: ["Emergency-safe route: Available from this start."],
      },
    })} />);
    expect(screen.getByTestId("emergency-route-status")).toHaveAttribute("data-status", "not-calculated");
    expect(screen.getByTestId("emergency-destination-summary")).toHaveTextContent("Destination · Main Assembly Point A");
    expect(screen.queryByTestId("emergency-destination")).not.toBeInTheDocument();
    expect(screen.queryByTestId("route-error-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("route-endpoint-card-destination")).not.toBeInTheDocument();
    expect(screen.queryByTestId("route-planner-swap-row")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find Route" })).toBeEnabled();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("shows one concise unavailable SOS status without student diagnostics or duplicate action copy", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      emergencyAvailability: {
        state: "unavailable",
      reason: "assembly_point_disconnected",
        details: ["Pathway connection: No assigned point has a valid outdoor pathway connection."],
      },
    })} />);

    const status = screen.getByTestId("emergency-route-status");
    expect(screen.getAllByTestId("emergency-route-status")).toHaveLength(1);
    expect(status).toHaveAttribute("data-status", "unavailable");
    expect(status).toHaveTextContent("SOS route unavailable");
    expect(status).toHaveTextContent("No route reaches the assembly point.");
    expect(status).toHaveTextContent("Follow posted evacuation instructions.");
    expect(status).not.toHaveTextContent("No approved assembly point is available");
    expect(status).not.toHaveTextContent("switch to Standard mode");
    expect(status).not.toHaveTextContent("Pathway connection:");
    expect(status).not.toHaveTextContent("Emergency-safe route:");
    expect(screen.queryByTestId("route-error-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("emergency-destination")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find Route" })).toBeDisabled();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("emergency-route-status")).toHaveLength(1);
  });

  it.each([
    ["no_assigned_assembly_point", "No usable Assembly Point is assigned to this building."],
    ["assembly_point_disconnected", "No route reaches the assembly point."],
    ["no_safe_route", "No emergency route found."],
  ] as const)("shows only the confirmed %s blocker", (reason, message) => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      emergencyAvailability: {
        state: "unavailable",
        reason,
        details: ["Assembly point assignment: internal diagnostic.", "Outdoor path connection: internal diagnostic."],
      },
    })} />);

    const status = screen.getByTestId("emergency-route-status");
    expect(status).toHaveTextContent("SOS route unavailable");
    expect(status).toHaveTextContent(message);
    expect(status).toHaveTextContent("Follow posted evacuation instructions.");
    expect(status).not.toHaveTextContent("internal diagnostic");
    expect(status.querySelector("details")).toBeNull();
    expect(screen.getByRole("button", { name: "Find Route" })).toBeDisabled();
  });

  it("keeps an automatically discovered eligible Assembly Point route navigable", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      phase: "preview",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Main Assembly Point A", emergencyAssemblyPointId: "assembly-a" }),
      emergencyAvailability: {
        state: "available",
        destinationName: "Main Assembly Point A",
        details: ["Admin review: This graph preview is not approved."],
      },
    })} />);

    expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-summary-destination")).toHaveTextContent("Main Assembly Point A");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("keeps a Campus Gate fallback identifiable without the expanded warning card", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      phase: "preview",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Campus Gate · Fallback", emergencyDestinationFallback: true }),
      emergencyAvailability: {
        state: "available",
        destinationName: "Campus Gate · Fallback",
        details: ["No Assembly Point is assigned to this building."],
      },
    })} />);

    expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-summary-destination")).toHaveTextContent("Campus Gate · Fallback");
    expect(screen.queryByText("No Assembly Point is assigned to this building.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("keeps the SOS destination and active instruction visible without a fallback warning card", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      phase: "navigating",
      cameraMode: "follow",
      playbackPaused: false,
      route: route({ mode: "emergency", emergencyDestinationLabel: "Campus Gate · Fallback", emergencyDestinationFallback: true }),
      navigationSteps: ["Follow the path toward Campus Gate."],
      currentStepIndex: 0,
    })} />);

    expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("guided-destination")).toHaveTextContent("Campus Gate · Fallback");
    expect(screen.getByTestId("guided-destination")).toHaveClass("line-clamp-2");
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent("Follow the path toward Campus Gate.");
    expect(screen.getByRole("button", { name: "Pause navigation" })).toBeInTheDocument();
  });

  it("keeps route calculation available when a graph route exists but current approval needs review", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      emergencyAvailability: {
        state: "review-required",
        destinationName: "Main Assembly Point A",
        details: ["Admin review: The current approval needs review."],
      },
    })} />);

    expect(screen.getAllByTestId("emergency-route-status")).toHaveLength(1);
    expect(screen.getByTestId("emergency-route-status")).toHaveAttribute("data-status", "review-required");
    expect(screen.getByText("Evacuation route needs review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find Route" })).toBeEnabled();
  });

  it("shows a stale emergency graph route as preview only and blocks Start", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      phase: "preview",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Main Assembly Point A", emergencyAssemblyPointId: "assembly-a" }),
      emergencyAvailability: {
        state: "review-required",
        destinationName: "Main Assembly Point A",
        details: ["Admin review: The current approval needs review."],
      },
    })} />);

    expect(screen.getByTestId("emergency-route-status")).toHaveAttribute("data-status", "review-required");
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("keeps unresolved SOS eligibility blocked after expanding the mobile preview", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(<RoutePlannerDialog {...plannerProps({
        from: building("caba", "CABA", "CABA-201"),
        mode: "emergency",
        phase: "preview",
        route: route({ mode: "emergency", emergencyDestinationLabel: "Campus Gate · Fallback", emergencyDestinationFallback: true }),
        emergencyAvailability: {
          state: "review-required",
          destinationName: "Campus Gate · Fallback",
          details: ["Emergency stair connection still requires review."],
        },
      })} />);

      await waitFor(() => expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument());
      expect(await screen.findByTestId("mobile-route-preview-collapsed-summary")).toHaveTextContent("Route needs review");
      fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));
      const start = await screen.findByRole("button", { name: "Start" });
      expect(start).toBeDisabled();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("disables route calculation when no complete emergency-safe graph route exists", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      emergencyAvailability: {
        state: "unavailable",
        reason: "no_safe_route",
        details: ["Admin review: No current complete route is available."],
      },
    })} />);

    expect(screen.getByTestId("emergency-route-status")).toHaveAttribute("data-status", "unavailable");
    expect(screen.getByRole("button", { name: "Find Route" })).toBeDisabled();
  });

  it("shows a recommended Assembly Point route once without a redundant status card", () => {
    render(<RoutePlannerDialog {...plannerProps({
      from: building("science", "SCI", "Science Hall"),
      mode: "emergency",
      phase: "preview",
      route: route({ mode: "emergency", emergencyDestinationLabel: "Main Assembly Point A", emergencyAssemblyPointId: "assembly-a" }),
      activeEmergencyRouteId: "exit-a",
      emergencyRouteOverview: false,
      emergencyRoutes: [
        { id: "exit-a", label: "Route A", doorLabel: "Door 1", exitLabel: "Exterior Stair 2", approved: true },
        { id: "exit-b", label: "Route B", doorLabel: "Door 2", exitLabel: "Exterior Stair 1", approved: true },
      ],
      emergencyAvailability: {
        state: "approved",
        destinationName: "Main Assembly Point A",
        details: ["Assembly Point review is current."],
      },
    })} />);

    expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-summary-destination")).toHaveTextContent("Main Assembly Point A");
    expect(screen.queryByTestId("emergency-route-overview")).not.toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route A");
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route B");
  });

  it("snaps the mobile sheet between compact and expanded states", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<RoutePlannerDialog {...plannerProps()} />);
    fireEvent(window, new Event("resize"));

    const handle = screen.getByRole("slider", { name: "Resize route planner" });
    const dialog = screen.getByRole("dialog", { name: "Route planner" });
    expect(handle).toHaveAttribute("aria-valuenow", "736");
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded");
    expect(handle).toHaveAttribute("aria-valuenow", "736");

    fireEvent.keyDown(handle, { key: "Home" });
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact");
    expect(handle).toHaveAttribute("aria-valuenow", "140");
    await waitFor(() => expect(screen.queryByTestId("route-planner-scroll-region")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Expand route panel" }));
    expect(dialog).toHaveAttribute("data-mobile-sheet-state", "expanded");
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
    view.rerender(<RoutePlannerDialog {...plannerProps({
      mode: "emergency",
      onStandardPreferenceChange,
      emergencyAvailability: { state: "available", destinationName: "Main Assembly Point A", details: [] },
    })} />);
    expect(screen.getByTestId("emergency-route-status")).toBeInTheDocument();
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
    expect(alert).toHaveTextContent("No accessible route was found");
    expect(alert).toHaveTextContent("Choose another destination.");
    expect(screen.queryByText("Try a different destination")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try Standard mode/ }));
    expect(switchMode).toHaveBeenCalledWith("standard");

    render(<RouteErrorState fromCode="SCI" toCode="LIB" mode="emergency" onSwitchMode={switchMode} />);
    const emergencyAlert = screen.getAllByRole("alert")[1];
    expect(emergencyAlert).toHaveTextContent("No emergency route found");
    expect(emergencyAlert).toHaveTextContent("Follow posted evacuation instructions");
    expect(emergencyAlert).not.toHaveTextContent("Choose a different destination");
    expect(emergencyAlert).not.toHaveTextContent("Standard mode");
    expect(within(emergencyAlert).queryByRole("button", { name: /Try Standard/ })).not.toBeInTheDocument();
  });
});
