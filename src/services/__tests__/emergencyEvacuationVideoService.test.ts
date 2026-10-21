import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  signedUrl: vi.fn(),
  getSupabase: vi.fn(),
  getUser: vi.fn(),
  mutationRow: vi.fn(),
  mutationPayload: vi.fn(),
  readinessQuery: vi.fn(),
  storageList: vi.fn(),
  metadataInsert: vi.fn(),
  storageRemove: vi.fn(),
  selectRow: vi.fn(),
  deleteRow: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  getSupabase: mocks.getSupabase,
  supabaseKey_: "test-publishable-key",
  supabaseUrl_: "https://example.supabase.co",
}));

import {
  EMERGENCY_VIDEO_MAX_BYTES,
  formatEmergencyVideoSize,
  getPublishedEmergencyEvacuationVideo,
  routeFingerprintJson,
  validateEmergencyCaptionsFile,
  validateEmergencyVideoFile,
} from "../emergencyEvacuationVideoService";

const approvedFingerprint = JSON.stringify([["route-a", "door-a", "exit-a", "node-a", "signature-a"]]);

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "video-1", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: "room-1",
    storage_path: "campus-1/room-1/video-1.mp4", captions_path: "campus-1/room-1/video-1.vtt",
    original_filename: "guide.mp4", mime_type: "video/mp4", file_size_bytes: 12000, title: "Evacuation Guide",
    duration_seconds: 42, approved_route_fingerprint: JSON.parse(approvedFingerprint), updated_at: "2026-10-14T00:00:00Z",
    ...overrides,
  };
}

describe("emergency evacuation video service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.getSupabase.mockReturnValue({
      rpc: mocks.rpc,
      auth: {
        getUser: mocks.getUser,
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "TEST_ONLY_ACCESS_TOKEN" } }, error: null }),
      },
      from: () => ({
        select: () => ({ limit: mocks.readinessQuery, eq: () => ({ maybeSingle: mocks.selectRow }) }),
        update: (payload: unknown) => { mocks.mutationPayload(payload); return { eq: () => ({ select: () => ({ maybeSingle: mocks.mutationRow }) }) }; },
        insert: () => ({ select: () => ({ single: mocks.metadataInsert }) }),
        delete: () => ({ eq: () => ({ select: () => ({ maybeSingle: mocks.deleteRow }) }) }),
      }),
      storage: { from: () => ({ createSignedUrl: mocks.signedUrl, list: mocks.storageList, remove: mocks.storageRemove }) },
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.mutationRow.mockResolvedValue({ data: { id: "video-1" }, error: null });
    mocks.readinessQuery.mockResolvedValue({ data: [], error: null });
    mocks.storageList.mockResolvedValue({ data: [], error: null });
    mocks.metadataInsert.mockResolvedValue({ data: null, error: null, status: 201 });
    mocks.storageRemove.mockResolvedValue({ data: [], error: null });
    mocks.selectRow.mockResolvedValue({ data: {
      storage_path: "campus-1/room-1/video-1.mp4", captions_path: "campus-1/room-1/video-1.vtt",
    }, error: null });
    mocks.deleteRow.mockResolvedValue({ data: { id: "video-1" }, error: null });
    mocks.signedUrl.mockImplementation(async (path: string, _ttl: number, options?: { download?: string }) => ({
      data: { signedUrl: `https://signed.example/${path}${options?.download ? `?download=${options.download}` : ""}` }, error: null,
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("validates MP4 and WebVTT types, size, and stable upload limits", () => {
    expect(EMERGENCY_VIDEO_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(validateEmergencyVideoFile({ name: "guide.mp4", type: "video/mp4", size: 1 })).toBeNull();
    expect(validateEmergencyVideoFile({ name: "guide.mov", type: "video/quicktime", size: 1 })).toMatch(/MP4/);
    expect(validateEmergencyVideoFile({ name: "guide.mp4", type: "video/mp4", size: EMERGENCY_VIDEO_MAX_BYTES + 1 })).toMatch(/100 MB/);
    expect(validateEmergencyCaptionsFile({ name: "guide.vtt", type: "text/vtt", size: 12 })).toBeNull();
    expect(validateEmergencyCaptionsFile({ name: "guide.srt", type: "text/plain", size: 12 })).toMatch(/WebVTT/);
  });

  it("preserves the sanitized Storage 400 response and confirms the canonical private upload request", async () => {
    const { EmergencyVideoStorageRequestError, uploadEmergencyEvacuationVideoDraft } = await import("../emergencyEvacuationVideoService");
    const testVideoId = "00000000-0000-4000-8000-000000000001";
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(testVideoId);
    const requests: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }> = [];
    class TestXHR {
      status = 400;
      responseText = JSON.stringify({
        statusCode: "InvalidMimeType",
        message: "Storage rejected the file. Bearer leaked-value should be hidden.",
        details: "See https://private.example/storage/request",
      });
      upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      private method = "";
      private url = "";
      private headers: Record<string, string> = {};
      open(method: string, url: string) { this.method = method; this.url = url; }
      setRequestHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; }
      getResponseHeader(name: string) { return name.toLowerCase() === "x-request-id" ? "storage-test-request-1" : null; }
      send(body: unknown) {
        requests.push({ method: this.method, url: this.url, headers: this.headers, body });
        this.onload?.();
      }
      abort() { this.onabort?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", TestXHR);
    const bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const file = new File([bytes], "TEST_ONLY guide.mp4", { type: "video/mp4" });

    await expect(uploadEmergencyEvacuationVideoDraft({
      campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", roomId: "room-1", file, title: "TEST ONLY",
    })).rejects.toMatchObject({
      name: "EmergencyVideoStorageRequestError",
      message: "Upload failed. Please retry.",
      diagnostic: {
        status: 400,
        method: "POST",
        bucket: "emergency-evacuation-videos",
        objectPath: `campus-1/room-1/${testVideoId}.mp4`,
        contentType: "video/mp4",
        fileSizeBytes: file.size,
        code: "InvalidMimeType",
        backendMessage: "Storage rejected the file. Bearer [redacted] should be hidden.",
        requestId: "storage-test-request-1",
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain(`/storage/v1/object/emergency-evacuation-videos/campus-1/room-1/${testVideoId}.mp4`);
    expect(requests[0].headers).toMatchObject({
      "content-type": "video/mp4",
      "x-upsert": "false",
      apikey: "test-publishable-key",
    });
    expect(JSON.stringify(requests[0])).not.toContain("leaked-value");
    expect(JSON.stringify(requests[0])).not.toContain("private.example");
    expect(mocks.getSupabase).toHaveBeenCalled();
    randomUUID.mockRestore();
  });

  it("identifies a metadata insert 400 separately and removes the just-uploaded object", async () => {
    const { EmergencyVideoMetadataRequestError, uploadEmergencyEvacuationVideoDraft } = await import("../emergencyEvacuationVideoService");
    const testVideoId = "00000000-0000-4000-8000-000000000002";
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(testVideoId);
    class SuccessfulStorageXHR {
      status = 200;
      responseText = "";
      upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      getResponseHeader() { return null; }
      send() { this.onload?.(); }
      abort() { this.onabort?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", SuccessfulStorageXHR);
    mocks.metadataInsert.mockResolvedValueOnce({
      data: null,
      status: 400,
      error: { code: "23514", message: "new row violates check constraint", details: "Invalid status value" },
    });
    const file = new File([
      new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    ], "TEST_ONLY guide.mp4", { type: "video/mp4" });

    await expect(uploadEmergencyEvacuationVideoDraft({
      campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", roomId: "room-1", file, title: "TEST ONLY",
    })).rejects.toMatchObject({
      name: "EmergencyVideoMetadataRequestError",
      message: "Upload failed. Please retry.",
      diagnostic: {
        phase: "metadata_insert",
        service: "PostgREST",
        status: 400,
        method: "POST",
        table: "public.emergency_evacuation_videos",
        objectPath: `campus-1/room-1/${testVideoId}.mp4`,
        contentType: "video/mp4",
        fileSizeBytes: file.size,
        code: "23514",
        backendMessage: "new row violates check constraint",
        cleanupStatus: "removed",
      },
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith([`campus-1/room-1/${testVideoId}.mp4`]);
    expect(mocks.metadataInsert).toHaveBeenCalledTimes(1);
    randomUUID.mockRestore();
  });

  it("accepts only canonical approved route fingerprints", () => {
    expect(routeFingerprintJson(approvedFingerprint)).toEqual(JSON.parse(approvedFingerprint));
    expect(() => routeFingerprintJson("[]")).toThrow(/review data is incomplete/i);
    expect(() => routeFingerprintJson(JSON.stringify([[], [], []]))).toThrow(/review data is incomplete/i);
    expect(() => routeFingerprintJson("{}" )).toThrow(/review data is incomplete/i);
    expect(() => routeFingerprintJson("not-json")).toThrow();
  });

  it("does not request media URLs when the RPC row belongs to another room or route revision", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcRow({ room_id: "other-room" }), error: null });
    await expect(getPublishedEmergencyEvacuationVideo({
      videoId: "video-1", roomId: "room-1", campusId: "campus-1", routeFingerprint: approvedFingerprint,
    })).resolves.toBeNull();
    expect(mocks.signedUrl).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValue({ data: rpcRow(), error: null });
    await expect(getPublishedEmergencyEvacuationVideo({
      videoId: "video-1", roomId: "room-1", campusId: "campus-1", routeFingerprint: "[]",
    })).resolves.toBeNull();
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("issues short-lived playback, download, and caption URLs only for a matching published guide", async () => {
    mocks.rpc.mockResolvedValue({ data: rpcRow(), error: null });
    const result = await getPublishedEmergencyEvacuationVideo({
      videoId: "video-1", roomId: "room-1", campusId: "campus-1", routeFingerprint: approvedFingerprint,
    });
    expect(result?.playbackUrl).toContain("video-1.mp4");
    expect(result?.downloadUrl).toContain("download=guide.mp4");
    expect(result?.captionsUrl).toContain("video-1.vtt");
    expect(mocks.signedUrl).toHaveBeenCalledTimes(3);
    expect(mocks.signedUrl).toHaveBeenCalledWith("campus-1/room-1/video-1.mp4", 15 * 60);
  });

  it("does not report a successful Admin publication when RLS matched no video row", async () => {
    const { publishEmergencyEvacuationVideo } = await import("../emergencyEvacuationVideoService");
    mocks.mutationRow.mockResolvedValueOnce({ data: null, error: null });
    await expect(publishEmergencyEvacuationVideo("video-1", approvedFingerprint)).rejects.toThrow(/not saved/i);
    expect(mocks.mutationRow).toHaveBeenCalledTimes(1);
  });

  it("formats file metadata for the Admin panel", () => {
    expect(formatEmergencyVideoSize(1024)).toBe("1 KB");
    expect(formatEmergencyVideoSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("reports missing schema, missing bucket, access denial, and a ready private store separately", async () => {
    const { getEmergencyVideoStorageReadiness } = await import("../emergencyEvacuationVideoService");
    await expect(getEmergencyVideoStorageReadiness()).resolves.toBe("ready");

    mocks.readinessQuery.mockResolvedValueOnce({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    await expect(getEmergencyVideoStorageReadiness()).resolves.toBe("missing_table");

    mocks.storageList.mockResolvedValueOnce({ data: null, error: { statusCode: "404", message: "Bucket not found" } });
    await expect(getEmergencyVideoStorageReadiness()).resolves.toBe("missing_bucket");

    mocks.readinessQuery.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(getEmergencyVideoStorageReadiness()).resolves.toBe("no_access");
  });

  it("identifies the pending Room Videos table as setup, not an Admin permission failure", async () => {
    const { getRoomVideoBackendReadiness } = await import("../emergencyEvacuationVideoService");
    mocks.readinessQuery.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.room_videos' in the schema cache" },
    });

    await expect(getRoomVideoBackendReadiness()).resolves.toBe("missing_table");
    expect(mocks.storageList).not.toHaveBeenCalled();
  });

  it("does not mislabel an unrelated missing table as the Room Videos setup issue", async () => {
    const { getRoomVideoBackendReadiness } = await import("../emergencyEvacuationVideoService");
    mocks.readinessQuery.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.campuses' in the schema cache" },
    });
    await expect(getRoomVideoBackendReadiness()).resolves.toBe("unavailable");
    expect(mocks.storageList).not.toHaveBeenCalled();
  });

  it("checks Admin membership because authenticated Storage listings are RLS filtered", async () => {
    const { getRoomVideoBackendReadiness } = await import("../emergencyEvacuationVideoService");
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });

    await expect(getRoomVideoBackendReadiness()).resolves.toBe("no_access");
    expect(mocks.rpc).toHaveBeenCalledWith("is_admin");
    expect(mocks.readinessQuery).not.toHaveBeenCalled();
    expect(mocks.storageList).not.toHaveBeenCalled();
  });

  it("prevents Room Video Storage writes when the metadata table is missing", async () => {
    const { RoomVideoServiceError, uploadRoomVideoDraft } = await import("../emergencyEvacuationVideoService");
    const xhr = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhr);
    mocks.readinessQuery.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.room_videos' in the schema cache" },
    });
    const file = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], "TEST_ONLY room.mp4", { type: "video/mp4" });

    await expect(uploadRoomVideoDraft({
      campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", roomId: "room-1", file, title: "TEST ONLY",
    })).rejects.toMatchObject({
      name: "RoomVideoServiceError",
      kind: "missing_table",
      message: "Room Videos is not configured in the database yet. Please contact the administrator to complete setup.",
    });
    expect(xhr).not.toHaveBeenCalled();
    expect(mocks.storageList).not.toHaveBeenCalled();
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it("distinguishes Room Video RLS permission errors from missing schema", async () => {
    const { getRoomVideoBackendReadiness, uploadRoomVideoDraft } = await import("../emergencyEvacuationVideoService");
    const permissionFailure = { data: null, error: { code: "42501", message: "permission denied for table room_videos" } };
    mocks.readinessQuery.mockResolvedValueOnce(permissionFailure).mockResolvedValueOnce(permissionFailure);
    await expect(getRoomVideoBackendReadiness()).resolves.toBe("no_access");

    const file = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], "TEST_ONLY room.mp4", { type: "video/mp4" });
    await expect(uploadRoomVideoDraft({
      campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", roomId: "room-1", file, title: "TEST ONLY",
    })).rejects.toMatchObject({ kind: "no_access" });
    expect(mocks.storageList).not.toHaveBeenCalled();
    expect(mocks.metadataInsert).not.toHaveBeenCalled();
  });

  it("uploads a supported Room Video only after the schema and private bucket preflight succeeds", async () => {
    const { uploadRoomVideoDraft } = await import("../emergencyEvacuationVideoService");
    const testVideoId = "00000000-0000-4000-8000-000000000003";
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(testVideoId);
    class SuccessfulStorageXHR {
      status = 200;
      responseText = "";
      upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      getResponseHeader() { return null; }
      send() { this.onload?.(); }
      abort() { this.onabort?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", SuccessfulStorageXHR);
    const row = {
      id: testVideoId, campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: "room-1",
      storage_path: `campus-1/room-1/${testVideoId}.mp4`, original_filename: "TEST_ONLY room.mp4",
      mime_type: "video/mp4", file_size_bytes: 12, title: "TEST ONLY", status: "draft",
    };
    mocks.metadataInsert.mockResolvedValueOnce({ data: row, error: null, status: 201 });
    const file = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], "TEST_ONLY room.mp4", { type: "video/mp4" });

    await expect(uploadRoomVideoDraft({
      campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", roomId: "room-1", file, title: "TEST ONLY",
    })).resolves.toEqual(row);
    expect(mocks.storageList).toHaveBeenCalledTimes(1);
    expect(mocks.metadataInsert).toHaveBeenCalledTimes(1);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    randomUUID.mockRestore();
  });

  it("withdraws prior publication when an Admin edits the student-facing title", async () => {
    const { updateAdminRoomVideoTitle } = await import("../emergencyEvacuationVideoService");
    await updateAdminRoomVideoTitle("video-1", "Updated title");

    expect(mocks.mutationPayload).toHaveBeenCalledWith({
      title: "Updated title", status: "draft", approved_by: null, published_at: null,
    });
  });

  it("uploads captions through the Admin workflow and withdraws a published video for fresh review", async () => {
    const { uploadRoomVideoCaptions } = await import("../emergencyEvacuationVideoService");
    const testCaptionId = "00000000-0000-4000-8000-000000000004";
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(testCaptionId);
    class SuccessfulStorageXHR {
      status = 200;
      responseText = "";
      upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      getResponseHeader() { return null; }
      send() { this.onload?.(); }
      abort() { this.onabort?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", SuccessfulStorageXHR);
    mocks.selectRow.mockResolvedValueOnce({ data: {
      id: "video-1", campus_id: "campus-1", room_id: "room-1", storage_path: "campus-1/room-1/video-1.mp4",
      captions_path: "campus-1/room-1/video-1-old.vtt", status: "published",
    }, error: null });
    const captions = new File(["WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nTEST ONLY\n"], "TEST ONLY captions.vtt", { type: "text/vtt" });

    await expect(uploadRoomVideoCaptions("video-1", captions)).resolves.toBeUndefined();
    expect(mocks.mutationPayload).toHaveBeenCalledWith({
      captions_path: `campus-1/room-1/video-1-${testCaptionId}.vtt`,
      captions_size_bytes: captions.size,
      status: "draft",
      approved_by: null,
      published_at: null,
    });
    expect(mocks.storageRemove).toHaveBeenCalledWith(["campus-1/room-1/video-1-old.vtt"]);
    randomUUID.mockRestore();
  });

  it("publishes and unpublishes with the signed-in Admin identity and classifies RLS denials", async () => {
    const { publishRoomVideo, unpublishRoomVideo } = await import("../emergencyEvacuationVideoService");
    await publishRoomVideo("video-1");
    expect(mocks.mutationPayload).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "published", approved_by: "admin-1", published_at: expect.any(String),
    }));

    await unpublishRoomVideo("video-1");
    expect(mocks.mutationPayload).toHaveBeenLastCalledWith({ status: "draft", approved_by: null, published_at: null });

    mocks.mutationRow.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied for table room_videos" } });
    await expect(publishRoomVideo("video-1")).rejects.toMatchObject({
      name: "RoomVideoServiceError", kind: "no_access",
    });
  });

  it("archives before Storage cleanup and retains a retryable record if cleanup fails", async () => {
    const { deleteAdminRoomVideo } = await import("../emergencyEvacuationVideoService");
    mocks.storageRemove.mockResolvedValueOnce({ data: null, error: { message: "Storage cleanup denied" } });

    await expect(deleteAdminRoomVideo("video-1")).rejects.toThrow(/archived and no longer visible to students/);
    expect(mocks.mutationPayload).toHaveBeenCalledWith({ status: "archived", approved_by: null, published_at: null });
    expect(mocks.storageRemove).toHaveBeenCalledWith(["campus-1/room-1/video-1.mp4", "campus-1/room-1/video-1.vtt"]);
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });
});
