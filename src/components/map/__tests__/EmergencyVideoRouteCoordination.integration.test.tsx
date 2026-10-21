import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannedRoute } from "../../../lib/routePlanner";
import type { RoomDest } from "../../../lib/combinedPathfinding";
import type { Building } from "../../../types";
import { StudentEmergencyVideoOverlay } from "../StudentEmergencyVideoOverlay";
import { StudentSelectedPlaceCard } from "../StudentSelectedPlaceCard";
import { UnifiedRoutePlannerDialog } from "../UnifiedRoutePlannerDialog";

const mocks = vi.hoisted(() => ({ load: vi.fn(), play: vi.fn(), pause: vi.fn() }));

vi.mock("../../../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("../../../services/emergencyEvacuationVideoService", () => ({
  createPublishedEmergencyEvacuationVideoDownloadUrl: vi.fn(),
  formatEmergencyVideoSize: () => "214 KB",
  getPublishedRoomVideosForRoom: vi.fn().mockResolvedValue([]),
  getPublishedEmergencyEvacuationVideo: mocks.load,
}));

const room: RoomDest = {
  type: "room", buildingId: "demo-building", floorNumber: 2, roomId: "demo-room", roomName: "Demo Lecture Hall",
  buildingLabel: "TEST ONLY Building", buildingCode: "TEST",
};
const campusBuilding: Building = {
  id: "demo-building", code: "TEST", name: "TEST ONLY Building", description: "", category: "academic", floor_count: 2, created_at: "2026-10-14",
};
const route: PlannedRoute = {
  points: [{ x: 0, y: 0 }, { x: 20, y: 10 }], dist: 100, mins: 2,
  steps: [
    { id: "step-1", icon: "start", instruction: "Leave the Demo Lecture Hall through Door A." },
    { id: "step-2", icon: "walk", instruction: "Follow the corridor to the stairs." },
    { id: "step-3", icon: "stairs", instruction: "Descend to the ground floor." },
    { id: "step-4", icon: "arrive", instruction: "Continue along the outdoor path to TEST ONLY Main Assembly Point A." },
  ],
  isGraphBased: true, isAuthoredGraph: true, mode: "emergency", fromCode: "TEST", toCode: "TEST-AP", transitions: ["Ground Floor"],
  emergencyDestinationLabel: "TEST ONLY Main Assembly Point A", emergencyAssemblyPointId: "test-assembly-point",
};
const fingerprint = "test-only-current-route-fingerprint";
const guideConfig = {
  enabled: true, videoId: "test-video", title: "TEST ONLY evacuation demonstration", reviewStatus: "approved" as const,
  reviewedRouteFingerprint: fingerprint,
};
const publishedGuide = {
  id: "test-video", campus_id: "test-campus", building_id: "demo-building", floor_id: "floor-2", room_id: "demo-room",
  storage_path: "test/demo-room/test-video.mp4", captions_path: "test/demo-room/test-video.vtt", original_filename: "test-only.mp4",
  mime_type: "video/mp4" as const, file_size_bytes: 218624, title: guideConfig.title, duration_seconds: 16,
  updated_at: "2026-10-14T00:00:00Z", playbackUrl: "blob:test-video", downloadUrl: "blob:test-video-download", captionsUrl: "blob:test-captions",
};

function IntegratedHarness() {
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [routeSelected, setRouteSelected] = useState(false);
  const [routePhase, setRoutePhase] = useState<"preview" | "navigating">("preview");
  const [routePlaying, setRoutePlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [renderMode, setRenderMode] = useState<"2d" | "3d">("2d");
  const [videoPlaybackState, setVideoPlaybackState] = useState({ currentTime: 0, muted: true, loop: true });

  const openVideo = () => {
    if (routePhase === "navigating" && routePlaying) setRoutePlaying(false);
    setOverlayOpen(true);
  };
  const choices = [
    { id: "route-a", label: "Left Exit", doorLabel: "Door A", exitLabel: "Exterior Stair A" },
    { id: "route-b", label: "Right Exit", doorLabel: "Door B", exitLabel: "Exterior Stair B" },
  ];

  return <>
    <button type="button" onClick={() => setRenderMode((mode) => mode === "2d" ? "3d" : "2d")}>Switch to {renderMode === "2d" ? "3D" : "2D"} view</button>
    <StudentSelectedPlaceCard
      room={room} campusId="test-campus" floorId="floor-2" emergencyVideoGuide={guideConfig}
      emergencyVideoRouteFingerprint={fingerprint} emergencyMode={emergencyMode}
      emergencyVideoPlaybackState={videoPlaybackState}
      emergencyVideoAutoplayEnabled={!emergencyMode}
      onEmergencyVideoPlaybackStateChange={setVideoPlaybackState}
      onWatchEmergencyVideo={openVideo}
      onDirections={vi.fn()} onStartHere={vi.fn()} onReport={vi.fn()} onClose={vi.fn()}
    />
    {!emergencyMode ? <button type="button" onClick={() => setEmergencyMode(true)}>Enter Emergency Mode</button> : <UnifiedRoutePlannerDialog
      from={campusBuilding} to={null} onFromChange={vi.fn()} onToChange={vi.fn()} buildings={[campusBuilding]}
      mode="emergency" onModeChange={vi.fn()} route={routeSelected ? route : null} onClose={vi.fn()} onClear={vi.fn()} onFindRoute={vi.fn()}
      useMyLocation={false} onUseMyLocationChange={vi.fn()} phase={routePhase} cameraMode="follow"
      emergencyRoutes={choices} emergencyRouteOverview={!routeSelected} activeEmergencyRouteId={routeSelected ? "route-a" : null}
      emergencyAvailability={{ state: "approved", destinationName: "TEST ONLY Main Assembly Point A", details: ["Assembly point: approved and connected.", "Complete emergency-safe route: available.", "Admin review: current."] }}
      onSelectEmergencyRoute={() => setRouteSelected(true)} onReturnToEmergencyOverview={() => { setRouteSelected(false); setRoutePhase("preview"); setRoutePlaying(false); }}
      onStartNavigation={() => { setRoutePhase("navigating"); setRoutePlaying(true); }}
      onPause={() => setRoutePlaying(false)} onResume={() => setRoutePlaying(true)}
      onPreviousStep={() => setStepIndex((value) => Math.max(0, value - 1))} onNextStep={() => setStepIndex((value) => Math.min(route.steps.length - 1, value + 1))}
      playbackPaused={!routePlaying} currentStepIndex={stepIndex} navigationSteps={route.steps.map((step) => step.instruction)}
      headerUtility={<button type="button" data-testid="watch-video-from-route" onClick={openVideo}>Watch video</button>}
    />}
    {overlayOpen && <StudentEmergencyVideoOverlay
      campusId="test-campus" roomId="demo-room" roomName={room.roomName} videoId="test-video" title={guideConfig.title}
      routeFingerprint={fingerprint} playbackState={videoPlaybackState} routePaused={routePhase === "navigating" && !routePlaying}
      hasActiveRoute={routeSelected} onPlaybackStateChange={setVideoPlaybackState} onClose={() => setOverlayOpen(false)}
      onResumeRoute={() => { setOverlayOpen(false); setRoutePlaying(true); }}
    />}
    <output data-testid="fixture-route-state">{JSON.stringify({ emergencyMode, routeSelected, routePhase, routePlaying, stepIndex, renderMode, videoPlaybackState })}</output>
  </>;
}

describe("integrated student video and emergency route handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(publishedGuide);
    mocks.play.mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: mocks.play });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: mocks.pause });
  });

  it("pauses route progress for video and requires explicit resume at the same route step", async () => {
    render(<IntegratedHarness />);
    const initialVideo = await screen.findByTestId("student-emergency-video");
    await waitFor(() => expect(mocks.play).toHaveBeenCalledOnce());
    expect((initialVideo as HTMLVideoElement).muted).toBe(true);
    expect((initialVideo as HTMLVideoElement).loop).toBe(true);
    Object.defineProperty(initialVideo, "currentTime", { configurable: true, writable: true, value: 8 });
    fireEvent.timeUpdate(initialVideo);

    fireEvent.click(screen.getByRole("button", { name: "Enter Emergency Mode" }));
    expect(screen.getByTestId("watch-emergency-video-compact")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-route-overview")).toBeInTheDocument();
    expect(screen.queryByTestId("student-emergency-video")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("emergency-route-choice-0"));
    fireEvent.click(within(screen.getByTestId("route-planner-dialog")).getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const instruction = screen.getByTestId("current-route-instruction").textContent;
    expect(instruction).toBe("Descend to the ground floor.");

    fireEvent.click(screen.getByTestId("watch-video-from-route"));
    expect(screen.getByRole("button", { name: "Resume navigation" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /TEST ONLY evacuation demonstration/i })).toBeInTheDocument();
    const overlayVideo = await screen.findByTestId("student-emergency-video");
    expect((overlayVideo as HTMLVideoElement).muted).toBe(true);
    expect((overlayVideo as HTMLVideoElement).loop).toBe(true);
    Object.defineProperty(overlayVideo, "duration", { configurable: true, value: 16 });
    Object.defineProperty(overlayVideo, "currentTime", { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(overlayVideo);
    expect((overlayVideo as HTMLVideoElement).currentTime).toBe(8);
    expect(mocks.play).toHaveBeenCalledOnce();
    expect(screen.getByText(instruction!)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume route" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to 3D view" }));
    expect(screen.getByTestId("student-emergency-video")).toBe(overlayVideo);
    fireEvent.click(screen.getByRole("button", { name: "Switch to 2D view" }));
    expect(screen.getByTestId("student-emergency-video")).toBe(overlayVideo);

    fireEvent.click(screen.getByRole("button", { name: "Return to route" }));
    expect(screen.queryByTestId("student-emergency-video-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume navigation" })).toBeInTheDocument();
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent(instruction!);

    fireEvent.click(screen.getByRole("button", { name: "Resume navigation" }));
    expect(screen.getByRole("button", { name: "Pause navigation" })).toBeInTheDocument();
    expect(screen.getByTestId("current-route-instruction")).toHaveTextContent(instruction!);
  });

  it("shows one compact exit-only status and distinguishes current approval from a stale route review", () => {
    const props = {
      from: campusBuilding, to: null, onFromChange: vi.fn(), onToChange: vi.fn(), buildings: [campusBuilding],
      mode: "emergency" as const, onModeChange: vi.fn(), route: { ...route, emergencyDestinationLabel: "Campus Gate", emergencyAssemblyPointId: undefined }, onClose: vi.fn(), onClear: vi.fn(), onFindRoute: vi.fn(),
      useMyLocation: false, onUseMyLocationChange: vi.fn(), phase: "preview" as const,
    };
    const view = render(<UnifiedRoutePlannerDialog {...props} emergencyRoutes={[]} />);
    const exitOnlyStatus = screen.getByTestId("emergency-route-status");
    expect(exitOnlyStatus).toHaveAttribute("data-status", "exit-only-preview");
    expect(exitOnlyStatus).toHaveTextContent("Exit-only preview");
    expect(exitOnlyStatus).toHaveTextContent("This route ends at a building exit.");
    expect(screen.getAllByTestId("emergency-route-status")).toHaveLength(1);
    expect(screen.queryByText(/choose a different destination above|switch to Standard mode/i)).not.toBeInTheDocument();
    expect(within(exitOnlyStatus).queryByText("Details")).not.toBeInTheDocument();
    expect(exitOnlyStatus).not.toHaveTextContent("Pathway connection:");

    const approvedChoice = { id: "current-route", label: "Main Exit", doorLabel: "Door A", exitLabel: "Exterior Stair A", approved: true };
    const approvedAvailability = { state: "approved" as const, destinationName: "Main Assembly Point A", details: ["Assembly point: approved and connected.", "Complete emergency-safe route: available.", "Admin review: current."] };
    view.rerender(<UnifiedRoutePlannerDialog {...props} route={route} emergencyAvailability={approvedAvailability} emergencyRoutes={[approvedChoice]} activeEmergencyRouteId={approvedChoice.id} />);
    expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Emergency route");
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Main Assembly Point A");

    const reviewAvailability = { state: "review-required" as const, destinationName: "Main Assembly Point A", details: ["The route is connected.", "Admin review: needs reapproval."] };
    view.rerender(<UnifiedRoutePlannerDialog {...props} route={route} emergencyAvailability={reviewAvailability} emergencyRoutes={[]} activeEmergencyRouteId="stale-route" />);
    const staleStatus = screen.getByTestId("emergency-route-status");
    expect(staleStatus).toHaveAttribute("data-status", "review-required");
    expect(staleStatus).toHaveTextContent("Evacuation route needs review");
    expect(screen.getAllByTestId("emergency-route-status")).toHaveLength(1);

    view.rerender(<UnifiedRoutePlannerDialog {...props} mode="accessible" route={{ ...route, mode: "accessible" }} emergencyAvailability={approvedAvailability} />);
    expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
  });

  it("keeps the compact mobile preview focused on the route and destination", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(<UnifiedRoutePlannerDialog
        from={campusBuilding} to={null} onFromChange={vi.fn()} onToChange={vi.fn()} buildings={[campusBuilding]}
        mode="emergency" onModeChange={vi.fn()} route={route} onClose={vi.fn()} onClear={vi.fn()} onFindRoute={vi.fn()}
        useMyLocation={false} onUseMyLocationChange={vi.fn()} phase="preview"
        emergencyRoutes={[{ id: "current-route", label: "Main Exit", doorLabel: "Door A", exitLabel: "Exterior Stair A", approved: true }]}
        activeEmergencyRouteId="current-route"
        emergencyAvailability={{ state: "approved", destinationName: "TEST ONLY Main Assembly Point A", details: ["Assembly point: approved and connected.", "Complete emergency-safe route: available.", "Admin review: current."] }}
      />);
      const dialog = screen.getByTestId("route-planner-dialog");
      await waitFor(() => expect(dialog).toHaveAttribute("data-mobile-sheet-state", "compact"));
      await screen.findByTestId("mobile-route-preview-collapsed-summary");
      expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
      expect(screen.getByTestId("mobile-route-preview-collapsed-summary")).toHaveTextContent(/route preview/i);
      expect(screen.getByTestId("mobile-route-preview-collapsed-summary")).toHaveTextContent("TEST ONLY Main Assembly Point A");
      expect(screen.queryByText("Assembly point: approved and connected.")).not.toBeInTheDocument();
      expect(screen.queryByText("Details")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      act(() => window.dispatchEvent(new Event("resize")));
    }
  });

  it("keeps a recommended route visible with a direct alternative selector", () => {
    const props = {
      from: campusBuilding, to: null, onFromChange: vi.fn(), onToChange: vi.fn(), buildings: [campusBuilding],
      onClose: vi.fn(), onClear: vi.fn(), onFindRoute: vi.fn(), useMyLocation: false, onUseMyLocationChange: vi.fn(),
      phase: "preview" as const, route,
    };
    const choices = [
      { id: "route-a", label: "Left Exit", doorLabel: "Door A", exitLabel: "Exterior Stair A" },
      { id: "route-b", label: "Right Exit", doorLabel: "Door B", exitLabel: "Exterior Stair B" },
    ];
    const view = render(<UnifiedRoutePlannerDialog
      {...props} mode="emergency" onModeChange={vi.fn()} emergencyRoutes={choices} activeEmergencyRouteId="route-a"
      emergencyAvailability={{ state: "approved", destinationName: "Main Assembly Point A", details: ["Both routes reach Main Assembly Point A.", "Admin review: current."] }}
    />);
    expect(screen.getByTestId("route-summary")).toHaveTextContent("Main Assembly Point A");
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route A");
    expect(screen.getByTestId("emergency-route-selector")).toHaveTextContent("Route B");
    expect(screen.queryByText("Both Routes")).not.toBeInTheDocument();

    view.rerender(<UnifiedRoutePlannerDialog
      {...props} mode="accessible" onModeChange={vi.fn()} emergencyRoutes={[]}
    />);
    expect(screen.queryByTestId("emergency-route-status")).not.toBeInTheDocument();
  });

  it("keeps route resume disabled until an atomic floor transition settles", async () => {
    const props = {
      campusId: "test-campus", roomId: "demo-room", roomName: room.roomName, videoId: "test-video", title: guideConfig.title,
      routeFingerprint: fingerprint, playbackState: { currentTime: 8, muted: true, loop: true }, routePaused: true,
      hasActiveRoute: true, onPlaybackStateChange: vi.fn(), onClose: vi.fn(), onResumeRoute: vi.fn(),
    };
    const view = render(<StudentEmergencyVideoOverlay {...props} routeTransitioning />);
    await screen.findByTestId("student-emergency-video");
    const waitingButton = screen.getByRole("button", { name: /wait for the floor transition/i });
    expect(waitingButton).toBeDisabled();
    expect(screen.getByText(/floor change to finish/i)).toBeInTheDocument();

    view.rerender(<StudentEmergencyVideoOverlay {...props} routeTransitioning={false} />);
    const resumeButton = screen.getByRole("button", { name: "Resume route" });
    expect(resumeButton).toBeEnabled();
  });
});
