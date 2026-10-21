import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campus, FloorRoom } from "../types";
import { evaluateRoomEmergencyEvacuation, type EmergencyRouteReviewRequirement, type RoomEmergencyEvacuationEvaluation } from "../../../lib/roomEmergencyEvacuation";
import { RoomEmergencyEvacuationSection } from "../RoomEmergencyEvacuationSection";

vi.mock("../../../lib/roomEmergencyEvacuation", () => ({ evaluateRoomEmergencyEvacuation: vi.fn() }));

const room: FloorRoom = {
  id: "room-1", name: "TEST ONLY Assembly Hall", type: "hall", x: 0, y: 0, w: 100, h: 80,
  buildingId: "building-1", floorId: "floor-1",
};
const campus = {
  id: "campus-1",
  buildings: [{ id: "building-1", floors: [{ id: "floor-1", doors: [
    { id: "door-a", label: "Library Door", x: 10, y: 10 },
    { id: "door-b", label: "East Door", x: 90, y: 10 },
  ] }] }], navNodes: [], navEdges: [], markers: [], settings: {},
} as unknown as Campus;

const route = (overrides: Record<string, unknown> = {}) => ({
  id: "route-a", doorId: "door-a", doorLabel: "Library Door", exitId: "exit-a",
  exitLabel: "Library Door -> Main Assembly Point -> Exterior Stair 2", destinationNodeId: "node-a",
  kind: "exterior_stair", completeAssemblyRoute: true, graphCompleteAssemblyRoute: true,
  assemblyPointId: "assembly-a", assemblyPointName: "Main Assembly Point", assemblyPointDesignation: "primary",
  distanceM: 64, routeSignature: "fingerprint-a",
  route: { transitions: ["Take Exterior Stair 2 to Floor 1"], steps: [{ id: "step-a", instruction: "Take Exterior Stair 2 to Floor 1" }] },
  ...overrides,
});

const evaluation: RoomEmergencyEvacuationEvaluation = {
  roomId: "room-1",
  doorReadiness: [{ doorId: "door-a", label: "Library Door", state: "route_ready", detail: "Connected to the authored navigation graph.", routeCount: 1 }],
  candidates: [route()] as unknown as RoomEmergencyEvacuationEvaluation["candidates"],
  message: "A complete graph-connected Assembly Point route was found.",
};

function renderExpanded(inputRoom: FloorRoom = room, extras: {
  onInspectConnection?: (doorId?: string) => void;
  onInspectReviewRequirement?: (requirement: EmergencyRouteReviewRequirement) => void;
} = {}) {
  const view = render(<RoomEmergencyEvacuationSection campus={campus} buildingId="building-1" floorId="floor-1" room={inputRoom} onChange={vi.fn()} {...extras} />);
  fireEvent.click(screen.getByRole("button", { name: /Emergency Evacuation/ }));
  return view;
}

describe("RoomEmergencyEvacuationSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(evaluateRoomEmergencyEvacuation).mockReturnValue(evaluation);
  });

  it("calculates room readiness automatically without manual route creation or per-room approval", async () => {
    renderExpanded({ ...room, emergencyEvacuation: { enabled: false, routes: [] } });

    expect(await screen.findByTestId("room-emergency-validation-summary")).toHaveTextContent("Route available");
    expect(screen.getByTestId("room-emergency-validation-summary")).toHaveTextContent("Main Assembly Point");
    expect(evaluateRoomEmergencyEvacuation).toHaveBeenCalledWith(campus, "building-1", "floor-1", "room-1");
    expect(screen.queryByRole("button", { name: /Find Emergency Route|Preview Emergency Route|Approve/i })).not.toBeInTheDocument();
  });

  it("does not expose per-room Route A/B settings when multiple physical exits exist", async () => {
    vi.mocked(evaluateRoomEmergencyEvacuation).mockReturnValue({
      ...evaluation,
      candidates: [route(), route({ id: "route-b", doorId: "door-b", doorLabel: "East Door", exitId: "exit-b", routeSignature: "fingerprint-b" })] as unknown as RoomEmergencyEvacuationEvaluation["candidates"],
    });
    renderExpanded();

    expect(await screen.findByText("Route available")).toBeInTheDocument();
    expect(screen.queryByText(/Route A|Route B|Find Emergency Route/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("emergency-auto-route")).not.toBeInTheDocument();
  });

  it("shows one compact attention state and focuses a review-required asset from Inspect", async () => {
    const requirement = { kind: "stairs" as const, id: "stair-1", buildingId: "building-1", floorId: "floor-2", label: "TEST ONLY Stair A", detail: "Not designated for emergency use." };
    vi.mocked(evaluateRoomEmergencyEvacuation).mockReturnValue({
      ...evaluation,
      candidates: [route({ completeAssemblyRoute: false, emergencyUseReviewRequired: true, emergencyReviewRequirements: [requirement] })] as unknown as RoomEmergencyEvacuationEvaluation["candidates"],
      doorReadiness: [{ doorId: "door-a", label: "Library Door", state: "route_needs_review", detail: "Stair eligibility needs attention.", routeCount: 0 }],
    });
    const onInspectReviewRequirement = vi.fn();
    renderExpanded(room, { onInspectReviewRequirement });

    expect(await screen.findByText("Connection needs attention")).toBeInTheDocument();
    expect(screen.getByText("A connected path includes assets not designated for emergency use.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("room-emergency-validation-summary")).getByRole("button", { name: "Inspect" }));
    expect(onInspectReviewRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: "stair-1", kind: "stairs" }));
  });

  it("keeps detailed connection diagnostics collapsed until explicitly opened", async () => {
    vi.mocked(evaluateRoomEmergencyEvacuation).mockReturnValue({
      roomId: "room-1",
      doorReadiness: [{ doorId: "door-b", label: "East Door", state: "disconnected", detail: "The Door has no traversable emergency-safe Walking Network connection.", routeCount: 0 }],
      candidates: [],
      message: "Connect the missing emergency-safe path.",
    });
    const onInspectConnection = vi.fn();
    renderExpanded(room, { onInspectConnection });

    expect(await screen.findByText("Connection needs attention")).toBeInTheDocument();
    const diagnostics = screen.getByTestId("room-emergency-door-statuses");
    expect(diagnostics).not.toHaveAttribute("open");
    fireEvent.click(within(screen.getByTestId("room-emergency-validation-summary")).getByRole("button", { name: "Inspect" }));
    expect(onInspectConnection).toHaveBeenCalledWith("door-b");
    fireEvent.click(screen.getByText("Inspect Connections"));
    await waitFor(() => expect(diagnostics).toHaveAttribute("open"));
    expect(screen.getByText("Connect the missing emergency-safe path.")).toBeInTheDocument();
  });

  it("shows an available route without requiring destination review", async () => {
    vi.mocked(evaluateRoomEmergencyEvacuation).mockReturnValue({
      ...evaluation,
      candidates: [route()] as unknown as RoomEmergencyEvacuationEvaluation["candidates"],
      message: "The assigned Primary Assembly Point is connected.",
    });
    renderExpanded();

    expect(await screen.findByText("Route available")).toBeInTheDocument();
    expect(screen.queryByText(/review/i)).not.toBeInTheDocument();
  });

  it("recalculates readiness automatically after the campus graph changes", async () => {
    const view = renderExpanded();
    expect(await screen.findByText("Route available")).toBeInTheDocument();
    vi.mocked(evaluateRoomEmergencyEvacuation).mockReturnValue({
      roomId: "room-1", doorReadiness: [], candidates: [], message: "No eligible exit is connected.",
    });

    view.rerender(<RoomEmergencyEvacuationSection campus={{ ...campus, navEdges: [{ id: "edge-updated" }] } as unknown as Campus}
      buildingId="building-1" floorId="floor-1" room={room} onChange={vi.fn()} />);
    expect(await screen.findByText("No eligible exit found")).toBeInTheDocument();
    expect(evaluateRoomEmergencyEvacuation).toHaveBeenCalledTimes(2);
  });
});
