import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RoomDest } from "../../../lib/combinedPathfinding";
import { StudentSelectedPlaceCard } from "../StudentSelectedPlaceCard";

vi.mock("../StudentEmergencyVideoCard", () => ({
  StudentEmergencyVideoCard: ({ title }: { title?: string }) => <div data-testid="mock-student-video-card">{title}</div>,
}));
vi.mock("../../../services/emergencyEvacuationVideoService", () => ({
  formatEmergencyVideoSize: () => "1 MB",
  getPublishedRoomVideosForRoom: vi.fn().mockResolvedValue([{
    id: "room-video-1", campus_id: "campus-a", building_id: "building-a", floor_id: "floor-a", room_id: "room-a",
    storage_path: "private/room-video-1.mp4", captions_path: null, original_filename: "room.mp4", mime_type: "video/mp4",
    file_size_bytes: 1024, title: "Auditorium welcome", duration_seconds: 30, updated_at: "2026-10-17T00:00:00Z",
    playbackUrl: "https://signed.example/room.mp4", downloadUrl: "https://signed.example/room-download", captionsUrl: null,
  }]),
}));

const room: RoomDest = {
  type: "room", buildingId: "building-a", floorNumber: 2, roomId: "room-a", roomName: "Auditorium",
  buildingLabel: "Student Center", buildingCode: "SC",
};
const fingerprint = JSON.stringify([["route-a", "door-a", "exit-a", "node-a", "signature-a"]]);
const approvedVideoGuide = {
  enabled: true,
  videoId: "video-a",
  title: "Auditorium exits",
  reviewStatus: "approved" as const,
  reviewedRouteFingerprint: fingerprint,
};

describe("StudentSelectedPlaceCard emergency video placement", () => {
  it("places the published guide in the coordinated stack and rejects stale review fingerprints", async () => {
    const callbacks = { onDirections: vi.fn(), onStartHere: vi.fn(), onReport: vi.fn(), onClose: vi.fn() };
    const view = render(<StudentSelectedPlaceCard
      room={room}
      campusId="campus-a"
      emergencyVideoGuide={approvedVideoGuide}
      emergencyVideoRouteFingerprint={fingerprint}
      {...callbacks}
    />);
    const stack = screen.getByTestId("student-room-and-video-stack");
    const video = within(stack).getByTestId("mock-student-video-card");
    const roomVideo = await screen.findByTestId("student-room-videos");
    expect(stack).toHaveClass("flex-col-reverse", "md:flex-col", "md:right-3");
    expect(screen.getByTestId("student-selected-place-card")).toContainElement(roomVideo);
    expect(screen.getByTestId("student-selected-place-card")).toHaveTextContent("Auditorium welcome");
    expect(video).toHaveTextContent("Auditorium exits");
    expect(stack.lastElementChild).toBe(video);

    view.rerender(<StudentSelectedPlaceCard
      room={room}
      campusId="campus-a"
      emergencyVideoGuide={approvedVideoGuide}
      emergencyVideoRouteFingerprint="stale-route-fingerprint"
      {...callbacks}
    />);
    expect(screen.queryByTestId("mock-student-video-card")).not.toBeInTheDocument();
  });
});
