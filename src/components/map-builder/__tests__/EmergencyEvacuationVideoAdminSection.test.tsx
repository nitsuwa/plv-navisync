import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campus, FloorRoom, RoomEmergencyEvacuationConfiguration } from "../types";

const mocks = vi.hoisted(() => ({
  getVideo: vi.fn(),
  getStorageReadiness: vi.fn(),
  uploadVideo: vi.fn(),
  uploadCaptions: vi.fn(),
  createVideoPreview: vi.fn(),
  createCaptionsPreview: vi.fn(),
  updateDuration: vi.fn(),
  publishVideo: vi.fn(),
  routeFingerprint: JSON.stringify({ testOnly: true }),
  EmergencyVideoStorageRequestError: class extends Error {
    diagnostic: { phase: "storage_upload"; service: "Storage"; status: number; method: "POST"; bucket?: string; objectPath: string; contentType: string; fileSizeBytes: number; code?: string; backendMessage?: string; requestId?: string };
    constructor(diagnostic: { phase: "storage_upload"; service: "Storage"; status: number; method: "POST"; bucket?: string; objectPath: string; contentType: string; fileSizeBytes: number; code?: string; backendMessage?: string; requestId?: string }) {
      super("Upload failed. Please retry.");
      this.name = "EmergencyVideoStorageRequestError";
      this.diagnostic = diagnostic;
    }
  },
  EmergencyVideoMetadataRequestError: class extends Error {
    diagnostic: { phase: "metadata_insert"; service: "PostgREST"; status: number; method: "POST"; table?: string; objectPath: string; contentType: string; fileSizeBytes: number; code?: string; backendMessage?: string; cleanupStatus?: "removed" | "failed"; cleanupMessage?: string };
    constructor(diagnostic: { phase: "metadata_insert"; service: "PostgREST"; status: number; method: "POST"; table?: string; objectPath: string; contentType: string; fileSizeBytes: number; code?: string; backendMessage?: string; cleanupStatus?: "removed" | "failed"; cleanupMessage?: string }) {
      super("Upload failed. Please retry.");
      this.name = "EmergencyVideoMetadataRequestError";
      this.diagnostic = diagnostic;
    }
  },
}));

vi.mock("../../../services/emergencyEvacuationVideoService", () => ({
  EmergencyVideoStorageRequestError: mocks.EmergencyVideoStorageRequestError,
  EmergencyVideoMetadataRequestError: mocks.EmergencyVideoMetadataRequestError,
  createAdminEmergencyCaptionsPreviewUrl: mocks.createCaptionsPreview,
  createAdminEmergencyVideoPreviewUrl: mocks.createVideoPreview,
  EMERGENCY_VIDEO_SETUP_MIGRATION: "20261014090000_emergency_evacuation_video_guides.sql",
  formatEmergencyVideoSize: () => "1 MB",
  getEmergencyVideoStorageReadiness: mocks.getStorageReadiness,
  getAdminEmergencyEvacuationVideo: mocks.getVideo,
  publishEmergencyEvacuationVideo: mocks.publishVideo,
  unpublishEmergencyEvacuationVideo: vi.fn(),
  updateEmergencyVideoDuration: mocks.updateDuration,
  updateAdminEmergencyVideoTitle: vi.fn(),
  uploadEmergencyEvacuationVideoDraft: mocks.uploadVideo,
  uploadEmergencyVideoCaptions: mocks.uploadCaptions,
}));

vi.mock("../../../lib/studentEmergencyEvacuation", () => ({
  currentStudentEmergencyRouteFingerprint: () => mocks.routeFingerprint,
}));

import { EmergencyEvacuationVideoAdminSection } from "../EmergencyEvacuationVideoAdminSection";
import { EmergencyVideoMetadataRequestError, EmergencyVideoStorageRequestError } from "../../../services/emergencyEvacuationVideoService";

const record = {
  id: "video-1", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: "room-1",
  storage_path: "campus-1/room-1/video-1.mp4", captions_path: null, captions_size_bytes: null,
  original_filename: "guide.mp4", mime_type: "video/mp4" as const, file_size_bytes: 1024,
  title: "Evacuation Guide", duration_seconds: 30, status: "draft" as const,
  approved_route_fingerprint: null, uploaded_by: "admin-1", approved_by: null,
  published_at: null, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z",
};

const campus = { id: "campus-1", buildings: [] } as unknown as Campus;
const room: FloorRoom = { id: "room-1", name: "Auditorium", type: "hall", x: 0, y: 0, w: 100, h: 100, buildingId: "building-1", floorId: "floor-1" };
const configuration: RoomEmergencyEvacuationConfiguration = {
  enabled: false,
  routes: [],
  videoGuide: { enabled: true, videoId: "video-1", title: "Evacuation Guide", reviewStatus: "draft" },
};

describe("EmergencyEvacuationVideoAdminSection", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.getStorageReadiness.mockResolvedValue("ready"); });
  afterEach(() => vi.restoreAllMocks());

  it("uploads a TEST ONLY MP4 draft, reports progress, and makes the review status clear", async () => {
    let finishUpload: ((value: typeof record) => void) | undefined;
    mocks.uploadVideo.mockImplementation(({ onProgress }) => {
      onProgress(42);
      return new Promise((resolve) => { finishUpload = resolve; });
    });
    const onChange = vi.fn();
    const { container } = render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={{ enabled: false, routes: [] }} onChange={onChange}
    />);

    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /upload mp4 video/i })).toBeEnabled());
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept="video/mp4,.mp4"]');
    expect(input).not.toBeNull();
    const file = new File(["test-only mp4 bytes"], "TEST_ONLY evacuation.mp4", { type: "video/mp4" });
    fireEvent.change(input!, { target: { files: [file] } });

    expect(await screen.findByText("Uploading private video")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveValue(42);
    await act(async () => { finishUpload?.(record); });

    await screen.findByTestId("emergency-video-admin-record");
    expect(screen.getByText("Uploaded · awaiting review")).toBeInTheDocument();
    expect(mocks.uploadVideo).toHaveBeenCalledWith(expect.objectContaining({
      campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", roomId: "room-1", file,
      onProgress: expect.any(Function),
    }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      routes: [],
      videoGuide: expect.objectContaining({ videoId: record.id, reviewStatus: "draft" }),
    }));
  });

  it("shows an upload validation error and recovers on a valid retry", async () => {
    mocks.uploadVideo
      .mockRejectedValueOnce(new Error("Choose an MP4 video file under 100 MB."))
      .mockResolvedValueOnce(record);
    const { container } = render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={{ enabled: false, routes: [] }} onChange={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /upload mp4 video/i })).toBeEnabled());
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept="video/mp4,.mp4"]')!;
    fireEvent.change(input, { target: { files: [new File(["not an mp4"], "guide.webm", { type: "video/webm" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose an MP4 video file under 100 MB.");

    fireEvent.change(input, { target: { files: [new File(["valid test mp4"], "TEST_ONLY guide.mp4", { type: "video/mp4" })] } });
    expect(await screen.findByTestId("emergency-video-admin-record")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a Storage 400 concise while exposing the sanitized response for retry diagnostics", async () => {
    mocks.uploadVideo
      .mockRejectedValueOnce(new EmergencyVideoStorageRequestError({
        phase: "storage_upload",
        service: "Storage",
        status: 400,
        method: "POST",
        bucket: "emergency-evacuation-videos",
        objectPath: "campus-1/room-1/video-id.mp4",
        contentType: "video/mp4",
        fileSizeBytes: 9,
        code: "InvalidMimeType",
        backendMessage: "The bucket does not allow this media type.",
        requestId: "request-test-400",
      }))
      .mockResolvedValueOnce(record);
    const { container } = render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={{ enabled: false, routes: [] }} onChange={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept="video/mp4,.mp4"]')!;
    await waitFor(() => expect(screen.getByRole("button", { name: /upload mp4 video/i })).toBeEnabled());
    fireEvent.change(input, { target: { files: [new File(["TEST ONLY"], "guide.mp4", { type: "video/mp4" })] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed. Please retry.");
    expect(screen.getByTestId("emergency-video-upload-diagnostics")).toHaveTextContent("400");
    expect(screen.getByTestId("emergency-video-upload-diagnostics")).toHaveTextContent("InvalidMimeType");
    expect(screen.getByTestId("emergency-video-upload-diagnostics")).toHaveTextContent("request-test-400");
    expect(screen.getByTestId("emergency-video-upload-diagnostics")).toHaveTextContent("POST emergency-evacuation-videos/campus-1/room-1/video-id.mp4");
    expect(screen.getByTestId("emergency-video-upload-diagnostics")).toHaveTextContent("video/mp4");
    expect(screen.getByTestId("emergency-video-upload-diagnostics")).toHaveTextContent("100 MB");
    expect(screen.getByTestId("emergency-video-upload-diagnostics")).not.toHaveAttribute("open");

    fireEvent.change(input, { target: { files: [new File(["TEST ONLY"], "guide.mp4", { type: "video/mp4" })] } });
    expect(await screen.findByTestId("emergency-video-admin-record")).toBeInTheDocument();
    expect(screen.queryByTestId("emergency-video-upload-diagnostics")).not.toBeInTheDocument();
  });

  it("shows metadata-insert failures separately and confirms partial object cleanup", async () => {
    mocks.uploadVideo
      .mockRejectedValueOnce(new EmergencyVideoMetadataRequestError({
        phase: "metadata_insert",
        service: "PostgREST",
        status: 400,
        method: "POST",
        table: "public.emergency_evacuation_videos",
        objectPath: "campus-1/room-1/video-id.mp4",
        contentType: "video/mp4",
        fileSizeBytes: 9,
        code: "23514",
        backendMessage: "The metadata row failed validation.",
        cleanupStatus: "removed",
      }))
      .mockResolvedValueOnce(record);
    const { container } = render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={{ enabled: false, routes: [] }} onChange={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept="video/mp4,.mp4"]')!;
    await waitFor(() => expect(screen.getByRole("button", { name: /upload mp4 video/i })).toBeEnabled());
    fireEvent.change(input, { target: { files: [new File(["TEST ONLY"], "guide.mp4", { type: "video/mp4" })] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed. Please retry.");
    const diagnostics = screen.getByTestId("emergency-video-upload-diagnostics");
    expect(diagnostics).toHaveTextContent("PostgREST response");
    expect(diagnostics).toHaveTextContent("POST public.emergency_evacuation_videos");
    expect(diagnostics).toHaveTextContent("23514");
    expect(diagnostics).toHaveTextContent("Uploaded object removed.");
    expect(diagnostics).not.toHaveTextContent("Bucket limit");

    fireEvent.change(input, { target: { files: [new File(["TEST ONLY"], "guide.mp4", { type: "video/mp4" })] } });
    expect(await screen.findByTestId("emergency-video-admin-record")).toBeInTheDocument();
  });

  it("previews the video and captions before enabling the explicit review action without a saved Route A approval", async () => {
    const publishedRecord = { ...record, status: "published" as const, approved_route_fingerprint: { testOnly: true } };
    mocks.getVideo.mockResolvedValueOnce(record).mockResolvedValueOnce(record).mockResolvedValueOnce(publishedRecord);
    mocks.createVideoPreview.mockResolvedValue("blob:test-only-video");
    mocks.createCaptionsPreview.mockResolvedValue("blob:test-only-captions");
    mocks.updateDuration.mockResolvedValue(undefined);
    mocks.publishVideo.mockResolvedValue(undefined);
    const onChange = vi.fn();
    const approvedConfiguration = {
      ...configuration,
      enabled: false,
      routes: [],
      videoGuide: { ...configuration.videoGuide!, reviewStatus: "draft" as const },
    };
    const { container } = render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={approvedConfiguration} onChange={onChange}
    />);

    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await screen.findByTestId("emergency-video-admin-record");
    await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled());
    const confirmReview = screen.getByLabelText(/i previewed this video against the current eligible SOS route/i);
    expect(confirmReview).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = await waitFor(() => {
      const player = container.querySelector("video");
      expect(player).not.toBeNull();
      return player as HTMLVideoElement;
    });
    expect(preview).toHaveAttribute("controls");
    expect(preview).toHaveAttribute("playsinline");
    expect(preview.querySelector("track[kind='captions']")).toHaveAttribute("src", "blob:test-only-captions");
    Object.defineProperty(preview, "duration", { configurable: true, value: 30 });
    fireEvent.loadedMetadata(preview);
    await waitFor(() => expect(confirmReview).toBeEnabled());

    fireEvent.click(confirmReview);
    const publish = screen.getByRole("button", { name: /review & publish/i });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    await waitFor(() => expect(mocks.publishVideo).toHaveBeenCalledWith(record.id, mocks.routeFingerprint));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      videoGuide: expect.objectContaining({ reviewStatus: "approved", reviewedRouteFingerprint: mocks.routeFingerprint }),
    })));
  });

  it("keeps a published guide current for approved Route A when Smart Multi-Exit is off", async () => {
    const publishedRecord = {
      ...record,
      status: "published" as const,
      approved_route_fingerprint: JSON.parse(mocks.routeFingerprint),
    };
    mocks.getVideo.mockResolvedValue(publishedRecord);
    const singleRouteConfiguration: RoomEmergencyEvacuationConfiguration = {
      enabled: false,
      routes: [{
        id: "door-left::exit-west",
        doorId: "door-left",
        exitId: "exit-west",
        destinationNodeId: "assembly-primary",
        label: "Left Exit",
        approved: true,
        approvedRouteSignature: "current-test-signature",
      }],
      videoGuide: {
        enabled: true,
        videoId: record.id,
        title: "Evacuation Guide",
        reviewStatus: "approved",
        reviewedRouteFingerprint: mocks.routeFingerprint,
      },
    };
    render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={singleRouteConfiguration} onChange={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await screen.findByTestId("emergency-video-admin-record");
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("removes the guide reference from the room draft without deleting potentially referenced private media", async () => {
    mocks.getVideo.mockResolvedValue(record);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChange = vi.fn();
    render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={configuration} onChange={onChange}
    />);

    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await screen.findByTestId("emergency-video-admin-record");
    fireEvent.click(screen.getByRole("button", { name: /remove from room/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ enabled: false, routes: [], videoGuide: undefined }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/retained until no saved or published map snapshot references it/i));
  });

  it("attaches TEST ONLY WebVTT captions and replaces the room video", async () => {
    const withCaptions = { ...record, captions_path: "campus-1/room-1/video-1-test.vtt", captions_size_bytes: 28 };
    const replacement = { ...record, id: "video-2", storage_path: "campus-1/room-1/video-2.mp4", original_filename: "TEST_ONLY replacement.mp4" };
    mocks.getVideo.mockResolvedValueOnce(record).mockResolvedValueOnce(withCaptions);
    mocks.uploadCaptions.mockResolvedValue(withCaptions.captions_path);
    mocks.uploadVideo.mockResolvedValue(replacement);
    const onChange = vi.fn();
    const { container } = render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={configuration} onChange={onChange}
    />);
    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await screen.findByTestId("emergency-video-admin-record");
    await waitFor(() => expect(screen.getByRole("button", { name: /attach captions/i })).toBeEnabled());
    const captionInput = container.querySelector<HTMLInputElement>('input[type="file"][accept="text/vtt,.vtt"]')!;
    const captions = new File(["WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nExit left.\n"], "TEST_ONLY guide.vtt", { type: "text/vtt" });
    fireEvent.change(captionInput, { target: { files: [captions] } });
    await screen.findByRole("button", { name: /replace captions/i });
    expect(mocks.uploadCaptions).toHaveBeenCalledWith(record.id, captions, expect.any(Function));

    fireEvent.click(screen.getByRole("button", { name: /replace video/i }));
    const videoInput = container.querySelector<HTMLInputElement>('input[type="file"][accept="video/mp4,.mp4"]')!;
    const replacementFile = new File(["TEST ONLY"], "TEST_ONLY replacement.mp4", { type: "video/mp4" });
    fireEvent.change(videoInput, { target: { files: [replacementFile] } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      videoGuide: expect.objectContaining({ videoId: replacement.id, reviewStatus: "draft" }),
    })));
    expect(mocks.uploadVideo).toHaveBeenCalledWith(expect.objectContaining({ file: replacementFile }));
  });

  it("blocks upload when the Storage bucket is missing and enables it after setup is rechecked", async () => {
    mocks.getStorageReadiness.mockResolvedValueOnce("missing_bucket").mockResolvedValueOnce("ready");
    mocks.uploadVideo.mockResolvedValue(record);
    const { container } = render(<EmergencyEvacuationVideoAdminSection
      campus={campus} buildingId="building-1" floorId="floor-1" room={room}
      configuration={{ enabled: false, routes: [] }} onChange={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));

    const upload = await screen.findByRole("button", { name: /upload mp4 video/i });
    expect(upload).toBeDisabled();
    expect(screen.getByTestId("emergency-video-storage-setup")).toHaveTextContent("20261014090000_emergency_evacuation_video_guides.sql");
    fireEvent.click(screen.getByRole("button", { name: "Check setup again" }));
    await waitFor(() => expect(upload).toBeEnabled());

    const file = new File(["TEST ONLY"], "TEST_ONLY guide.mp4", { type: "video/mp4" });
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept="video/mp4,.mp4"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByTestId("emergency-video-admin-record");
    expect(mocks.uploadVideo).toHaveBeenCalled();
  });
});
