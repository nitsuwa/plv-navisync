import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVideos = vi.hoisted(() => vi.fn());
const playMock = vi.hoisted(() => vi.fn());

vi.mock("../../../services/emergencyEvacuationVideoService", () => ({
  getPublishedRoomVideosForRoom: getVideos,
}));

import { StudentRoomVideoCard } from "../StudentRoomVideoCard";

const video = (id: string, title: string, roomId = "room-1") => ({
  id, campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: roomId,
  storage_path: `campus-1/${roomId}/${id}.mp4`, captions_path: null, original_filename: `${id}.mp4`,
  mime_type: "video/mp4" as const, file_size_bytes: 1024 * 1024, title, duration_seconds: 40,
  updated_at: "2026-10-17T00:00:00Z", playbackUrl: `https://signed.example/${id}.mp4`,
  downloadUrl: `https://signed.example/${id}.download`, captionsUrl: null,
});

describe("StudentRoomVideoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playMock.mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: playMock });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
    getVideos.mockImplementation(({ roomId }: { roomId: string }) => Promise.resolve([
      video("main", "Room welcome", roomId), video("older", "Earlier room tour", roomId),
    ]));
  });

  it("renders the published player immediately, preloads metadata only, and waits for Play", async () => {
    const onExpandedChange = vi.fn();
    const onVideoAvailabilityChange = vi.fn();
    render(<StudentRoomVideoCard campusId="campus-1" roomId="immediate-room" roomName="Test Room" onExpandedChange={onExpandedChange} onVideoAvailabilityChange={onVideoAvailabilityChange} />);

    expect(await screen.findByText("Room welcome")).toBeInTheDocument();
    const player = screen.getByTestId("student-room-video-main") as HTMLVideoElement;
    expect(player).toBeInTheDocument();
    expect(player).toHaveAttribute("preload", "metadata");
    expect(player).toHaveAttribute("src", "https://signed.example/main.mp4");
    expect(player.controls).toBe(false);
    expect(screen.queryByRole("button", { name: /watch/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onExpandedChange).toHaveBeenCalledWith(true);
      expect(onVideoAvailabilityChange).toHaveBeenCalledWith(true);
    });

    expect(playMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play Room welcome" }));
    expect(player.controls).toBe(true);
    expect(playMock).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Play Room welcome" })).not.toBeInTheDocument();
  });

  it("keeps additional published videos available without mounting them initially", async () => {
    render(<StudentRoomVideoCard campusId="campus-1" roomId="multiple-room" roomName="Test Room" />);

    expect(await screen.findByText("Room welcome")).toBeInTheDocument();
    expect(screen.queryByText("Earlier room tour")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-room-video-older")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More room videos (1)" }));
    const older = await screen.findByTestId("student-room-video-older");
    expect(older).toHaveAttribute("src", "https://signed.example/older.mp4");
    expect(older).toHaveAttribute("preload", "metadata");
  });

  it("does not render a player when no published videos are returned", async () => {
    getVideos.mockResolvedValueOnce([]);
    const onVideoAvailabilityChange = vi.fn();
    const { container } = render(<StudentRoomVideoCard campusId="campus-1" roomId="empty-room" roomName="Test Room" onVideoAvailabilityChange={onVideoAvailabilityChange} />);

    await waitFor(() => expect(getVideos).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Loading room video/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-room-videos")).not.toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(onVideoAvailabilityChange).toHaveBeenCalledWith(false);
  });

  it("offers recovery when published media cannot be loaded", async () => {
    getVideos.mockRejectedValueOnce(new Error("network failure"));
    render(<StudentRoomVideoCard campusId="campus-1" roomId="failed-room" roomName="Test Room" />);
    expect(await screen.findByTestId("student-room-video-unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(getVideos).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Room welcome")).toBeInTheDocument();
  });

  it("pauses the old media element when a student switches rooms", async () => {
    getVideos.mockImplementation(({ roomId }: { roomId: string }) => Promise.resolve([video(`video-${roomId}`, `${roomId} video`, roomId)]));
    const view = render(<StudentRoomVideoCard campusId="campus-1" roomId="switch-room-a" roomName="Room A" />);

    const first = await screen.findByTestId("student-room-video-video-switch-room-a") as HTMLVideoElement;
    fireEvent.click(screen.getByRole("button", { name: "Play switch-room-a video" }));
    const pause = HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>;
    view.rerender(<StudentRoomVideoCard campusId="campus-1" roomId="switch-room-b" roomName="Room B" />);
    await screen.findByText("switch-room-b video");

    expect(first).not.toBeInTheDocument();
    expect(pause).toHaveBeenCalled();
  });

  it("keeps Room Details usable with no visible placeholder while availability is pending", async () => {
    let resolveVideos!: (rows: ReturnType<typeof video>[]) => void;
    const onAvailability = vi.fn();
    getVideos.mockReturnValueOnce(new Promise((resolve) => { resolveVideos = resolve; }));
    render(<StudentRoomVideoCard campusId="campus-1" roomId="pending-empty-room" roomName="Room without video" onVideoAvailabilityChange={onAvailability} />);

    expect(screen.queryByTestId("student-room-videos-loading")).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading room video/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-room-videos")).not.toBeInTheDocument();
    resolveVideos([]);
    await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(false));
    expect(screen.queryByTestId("student-room-videos")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-room-video-unavailable")).not.toBeInTheDocument();
  });

  it("does not request availability again for unrelated rerenders of the same room", async () => {
    const props = { campusId: "campus-1", roomId: "stable-room", roomName: "Stable Room" };
    const view = render(<StudentRoomVideoCard {...props} />);
    await screen.findByText("Room welcome");
    view.rerender(<StudentRoomVideoCard {...props} roomName="Stable Room (updated label)" />);
    expect(getVideos).toHaveBeenCalledOnce();
  });

  it("reuses a brief settled lookup when the same room is reopened", async () => {
    const props = { campusId: "campus-1", roomId: "reopened-room", roomName: "Reopened Room" };
    const first = render(<StudentRoomVideoCard {...props} />);
    await screen.findByText("Room welcome");
    first.unmount();

    render(<StudentRoomVideoCard {...props} />);
    expect(await screen.findByText("Room welcome")).toBeInTheDocument();
    expect(getVideos).toHaveBeenCalledOnce();
  });

  it("ignores an older room response after the student switches selections", async () => {
    let resolveRoomA!: (rows: ReturnType<typeof video>[]) => void;
    getVideos.mockImplementation(({ roomId }: { roomId: string }) => roomId === "stale-room-a"
      ? new Promise((resolve) => { resolveRoomA = resolve; })
      : Promise.resolve([]));
    const view = render(<StudentRoomVideoCard campusId="campus-1" roomId="stale-room-a" roomName="Room A" />);
    view.rerender(<StudentRoomVideoCard campusId="campus-1" roomId="stale-room-b" roomName="Room B" />);
    await waitFor(() => expect(getVideos).toHaveBeenCalledTimes(2));
    resolveRoomA([video("stale-video", "Room A private title", "stale-room-a")]);
    await waitFor(() => expect(screen.queryByText("Room A private title")).not.toBeInTheDocument());
    expect(screen.queryByTestId("student-room-videos")).not.toBeInTheDocument();
  });
});
