import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  download: vi.fn(),
}));

vi.mock("../../../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("../../../services/emergencyEvacuationVideoService", () => ({
  createPublishedEmergencyEvacuationVideoDownloadUrl: mocks.download,
  formatEmergencyVideoSize: () => "1 MB",
  getPublishedEmergencyEvacuationVideo: mocks.load,
}));

import { StudentEmergencyVideoCard } from "../StudentEmergencyVideoCard";

const guide = {
  id: "video-1", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: "room-1",
  storage_path: "campus-1/room-1/video-1.mp4", captions_path: null, original_filename: "guide.mp4",
  mime_type: "video/mp4" as const, file_size_bytes: 1024 * 1024, title: "Evacuation Guide", duration_seconds: 30,
  updated_at: "2026-10-14T00:00:00Z", playbackUrl: "https://signed.example/play?first", downloadUrl: "https://signed.example/download",
  captionsUrl: null,
};

describe("StudentEmergencyVideoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(guide);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
  });

  it("lets a student refresh an expired or failed signed playback link", async () => {
    render(<StudentEmergencyVideoCard
      campusId="campus-1" roomId="room-1" roomName="Auditorium" videoId="video-1"
      routeFingerprint='[["route-1","door-1","exit-1","node-1","signature-1"]]'
    />);
    const video = await screen.findByTestId("student-emergency-video");
    fireEvent.click(screen.getByRole("button", { name: "Expand emergency video guide" }));
    fireEvent.error(video);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    fireEvent.error(screen.getByTestId("student-emergency-video"));
    expect(screen.getByRole("status")).toHaveTextContent(/link may have expired/i);
    fireEvent.click(screen.getByRole("button", { name: "Reload guide" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
    await screen.findByTestId("student-emergency-video");
  });

  it("uses one browser-native control bar when expanded and compact custom controls when collapsed", async () => {
    render(<StudentEmergencyVideoCard
      campusId="campus-1" roomId="room-1" roomName="Auditorium" videoId="video-1"
      routeFingerprint='[["route-1","door-1","exit-1","node-1","signature-1"]]'
    />);

    const video = await screen.findByTestId("student-emergency-video") as HTMLVideoElement;
    expect(video.controls).toBe(false);
    expect(screen.getByRole("button", { name: "Show video guide controls" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play video guide|Pause video guide/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /video voiceover/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show video guide controls" }));
    expect(video.controls).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(screen.queryByRole("button", { name: /Play video guide|Pause video guide/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /video voiceover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View video guide fullscreen" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replay video guide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse emergency video guide" }));
    expect(video.controls).toBe(false);
    expect(screen.getByRole("button", { name: /Play video guide|Pause video guide/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /video voiceover/ })).toBeInTheDocument();
  });

  it("exits the fullscreen video guide when Escape is pressed", async () => {
    render(<StudentEmergencyVideoCard
      campusId="campus-1" roomId="room-1" roomName="Auditorium" videoId="video-1"
      routeFingerprint='[["route-1","door-1","exit-1","node-1","signature-1"]]'
      initialExpanded
    />);
    const video = await screen.findByTestId("student-emergency-video");
    const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: video });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });

    try {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(exitFullscreen).toHaveBeenCalledOnce();
    } finally {
      if (fullscreenDescriptor) Object.defineProperty(document, "fullscreenElement", fullscreenDescriptor);
      else Reflect.deleteProperty(document, "fullscreenElement");
      if (exitFullscreenDescriptor) Object.defineProperty(document, "exitFullscreen", exitFullscreenDescriptor);
      else Reflect.deleteProperty(document, "exitFullscreen");
    }
  });
});
