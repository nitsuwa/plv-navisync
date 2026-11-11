import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  download: vi.fn(),
  getOfflineVideo: vi.fn(),
}));

vi.mock("../../../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("../../../services/emergencyEvacuationVideoService", () => ({
  createPublishedEmergencyEvacuationVideoDownloadUrl: mocks.download,
  formatEmergencyVideoSize: () => "1 MB",
  getPublishedEmergencyEvacuationVideo: mocks.load,
}));
vi.mock("../../../lib/offlineCampusStore", () => ({
  getOfflineVideo: mocks.getOfflineVideo,
  offlineVideoKey: (campusId: string, videoId: string) => `${campusId}:${videoId}`,
  removeOfflineVideo: vi.fn(),
  saveOfflineVideo: vi.fn(),
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
    mocks.getOfflineVideo.mockResolvedValue(null);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
  });

  it("plays the previously saved published guide without making a network request while offline", async () => {
    const previousOnline = navigator.onLine;
    const createObjectURL = URL.createObjectURL;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    URL.createObjectURL = vi.fn(() => "blob:offline-video") as typeof URL.createObjectURL;
    mocks.getOfflineVideo.mockResolvedValue({
      key: "campus-1:video-1", campusId: "campus-1", videoId: "video-1", roomId: "room-1",
      routeFingerprint: '[ ["route-1","door-1","exit-1","node-1","signature-1"] ]',
      updatedAt: guide.updated_at, sizeBytes: 1024, mimeType: "video/mp4", fileName: guide.original_filename,
      video: new Blob(["fixture video"]), captions: null, captionsMimeType: null,
      metadata: {
        id: guide.id, campus_id: guide.campus_id, building_id: guide.building_id, floor_id: guide.floor_id,
        room_id: guide.room_id, storage_path: guide.storage_path, captions_path: null,
        original_filename: guide.original_filename, mime_type: "video/mp4", file_size_bytes: guide.file_size_bytes,
        title: guide.title, duration_seconds: guide.duration_seconds, updated_at: guide.updated_at,
      },
    });

    try {
      render(<StudentEmergencyVideoCard
        campusId="campus-1" roomId="room-1" roomName="Auditorium" videoId="video-1"
        routeFingerprint='[ ["route-1","door-1","exit-1","node-1","signature-1"] ]'
      />);
      const video = await screen.findByTestId("student-emergency-video");
      expect(video.querySelector("source")?.getAttribute("src")).toBe("blob:offline-video");
      fireEvent.click(screen.getByRole("button", { name: "Expand emergency video guide" }));
      expect(screen.getByRole("button", { name: /Available offline/ })).toBeInTheDocument();
      expect(mocks.load).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: previousOnline });
      URL.createObjectURL = createObjectURL;
    }
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
