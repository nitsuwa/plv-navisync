// @ts-expect-error Vitest runs this integration harness in Node; the app tsconfig omits Node types.
import { readFileSync, existsSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { Campus, FloorRoom, RoomEmergencyEvacuationConfiguration } from "../../map-builder/types";
import type { RoomDest } from "../../../lib/combinedPathfinding";

const adapter = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  objects: new Map<string, Uint8Array>(),
  signedUrls: new Map<string, string>(),
  downloads: [] as Array<{ url: string; filename: string }>,
  routeFingerprint: JSON.stringify([
    ["test-route-a", "test-door-a", "test-exit-a", "test-exit-node-a", "test-signature-a"],
    ["test-route-b", "test-door-b", "test-exit-b", "test-exit-node-b", "test-signature-b"],
  ]),
  rpc: vi.fn(),
  failNextUpload: false,
  authorized: true,
  uploadGate: null as Promise<void> | null,
  userId: "test-admin-local-only",
  nextId: 0,
}));

vi.mock("../../../lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getUser: async () => ({ data: { user: adapter.authorized ? { id: adapter.userId } : null }, error: null }),
      getSession: async () => ({ data: { session: adapter.authorized ? { access_token: "local-test-token" } : null }, error: null }),
    },
    from: () => createVideoQuery(),
    rpc: adapter.rpc,
    storage: { from: (bucket: string) => createStorage(bucket) },
  }),
  supabaseKey_: "local-test-publishable-key",
  supabaseUrl_: "https://local-storage.invalid",
}));

vi.mock("../../../lib/studentEmergencyEvacuation", () => ({
  currentApprovedRoomEvacuationFingerprint: () => adapter.routeFingerprint,
  currentStudentEmergencyRouteFingerprint: () => adapter.routeFingerprint,
}));
vi.mock("../../../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));

import { EmergencyEvacuationVideoAdminSection } from "../../map-builder/EmergencyEvacuationVideoAdminSection";
import { StudentSelectedPlaceCard } from "../StudentSelectedPlaceCard";
import {
  EMERGENCY_EVACUATION_VIDEO_BUCKET,
  getEmergencyVideoStorageReadiness,
  getPublishedEmergencyEvacuationVideo,
} from "../../../services/emergencyEvacuationVideoService";

const TEST_ROUTE_FINGERPRINT = adapter.routeFingerprint;

function createVideoQuery() {
  let operation: "select" | "insert" | "update" = "select";
  let payload: Record<string, unknown> | null = null;
  const filters: Array<[string, unknown]> = [];
  const query: Record<string, (...args: any[]) => any> = {};
  const matchingRows = () => [...adapter.rows.values()].filter((row) => filters.every(([key, value]) => row[key] === value));
  query.select = () => query;
  query.limit = () => query;
  query.eq = (key: string, value: unknown) => { filters.push([key, value]); return query; };
  query.order = () => query;
  query.insert = (row: Record<string, unknown>) => { operation = "insert"; payload = row; return query; };
  query.update = (row: Record<string, unknown>) => { operation = "update"; payload = row; return query; };
  query.single = async () => {
    if (operation !== "insert" || !payload) return { data: null, error: null };
    const now = new Date().toISOString();
    const row: Record<string, unknown> = { ...payload, status: "draft", created_at: now, updated_at: now };
    adapter.rows.set(String(row.id), row);
    return { data: structuredClone(row), error: null };
  };
  query.maybeSingle = async () => {
    const row = matchingRows()[0];
    if (!row) return { data: null, error: null };
    if (operation === "update" && payload) {
      Object.assign(row, payload, { updated_at: new Date().toISOString() });
      adapter.rows.set(String(row.id), row);
    }
    return { data: structuredClone(row), error: null };
  };
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data: matchingRows().map((row) => structuredClone(row)), error: null }).then(resolve, reject);
  return query;
}

function createStorage(bucket: string) {
  if (bucket !== EMERGENCY_EVACUATION_VIDEO_BUCKET) throw new Error(`Unexpected test bucket: ${bucket}`);
  return {
    list: async () => ({ data: [], error: null }),
    createSignedUrl: async (path: string, ttl: number, options?: { download?: string }) => {
      if (!adapter.objects.has(path)) return { data: null, error: new Error("Object not found") };
      const suffix = options?.download ? `&download=${encodeURIComponent(options.download)}` : "";
      const url = `https://local-storage.invalid/object/${encodeURIComponent(path)}?ttl=${ttl}${suffix}`;
      adapter.signedUrls.set(url, path);
      return { data: { signedUrl: url }, error: null };
    },
    remove: async (paths: string[]) => {
      paths.forEach((path) => adapter.objects.delete(path));
      return { data: paths.map((name) => ({ name })), error: null };
    },
  };
}

class LocalStorageUploadRequest {
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private requestUrl = "";

  open(_method: string, url: string) { this.requestUrl = url; }
  setRequestHeader() { /* The isolated adapter records only payload and path. */ }
  abort() { this.onabort?.(); }
  send(body: Blob) {
    if (adapter.failNextUpload) {
      adapter.failNextUpload = false;
      this.onerror?.();
      return;
    }
    void (async () => {
      if (adapter.uploadGate) await adapter.uploadGate;
      const buffer = await body.arrayBuffer();
      const url = new URL(this.requestUrl);
      const marker = `/storage/v1/object/${EMERGENCY_EVACUATION_VIDEO_BUCKET}/`;
      const encodedPath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
      const path = encodedPath.split("/").map(decodeURIComponent).join("/");
      const bytes = new Uint8Array(buffer);
      adapter.objects.set(path, bytes);
      this.upload.onprogress?.({ lengthComputable: true, loaded: bytes.byteLength, total: bytes.byteLength } as ProgressEvent);
      this.status = 200;
      this.onload?.();
    })().catch(() => this.onerror?.());
  }
}

const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;
const TEST_MP4 = runtimeEnv?.PLVSYNC_TEST_MP4;
const TEST_VTT = runtimeEnv?.PLVSYNC_TEST_VTT;
const SAMPLE_AVAILABLE = Boolean(TEST_MP4 && existsSync(TEST_MP4));
const SAMPLE_CAPTIONS_AVAILABLE = Boolean(TEST_VTT && existsSync(TEST_VTT));

function makeFile(path: string | undefined, fallback: Uint8Array, name: string, type: string): File {
  const bytes = path && existsSync(path) ? new Uint8Array(readFileSync(path)) : fallback;
  return new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], name, { type });
}

const sampleMp4 = () => makeFile(TEST_MP4, Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]), "PLV_NaviSync_Emergency_Video_TEST_ONLY.mp4", "video/mp4");
const sampleVtt = () => makeFile(TEST_VTT, new TextEncoder().encode("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nTest-only captions.\n"), "PLV_NaviSync_Emergency_Video_TEST_ONLY.vtt", "text/vtt");

const demoRoom: FloorRoom = {
  id: "test-room-demo", name: "TEST ONLY · Demo Lecture Hall", type: "hall",
  x: 0, y: 0, w: 120, h: 90, buildingId: "test-building-demo", floorId: "test-floor-2",
};
const demoCampus = { id: "test-campus-demo", buildings: [] } as unknown as Campus;
const demoRoomDest: RoomDest = {
  type: "room", buildingId: demoRoom.buildingId, floorNumber: 2, roomId: demoRoom.id,
  roomName: demoRoom.name, buildingLabel: "TEST ONLY · Demo Building", buildingCode: "TEST",
};
const initialConfiguration: RoomEmergencyEvacuationConfiguration = {
  enabled: true,
  routes: [
    { id: "test-route-a", label: "Route A · TEST ONLY", doorId: "test-door-a", exitId: "test-exit-a", destinationNodeId: "test-exit-node-a", approved: true, approvedRouteSignature: "test-signature-a" },
    { id: "test-route-b", label: "Route B · TEST ONLY", doorId: "test-door-b", exitId: "test-exit-b", destinationNodeId: "test-exit-node-b", approved: true, approvedRouteSignature: "test-signature-b" },
  ],
  videoGuide: { enabled: true, title: "TEST ONLY · Emergency video guide" },
};

describe("Emergency Evacuation Video Guide sample workflow (local-only adapter)", () => {
  beforeEach(() => {
    adapter.rows.clear(); adapter.objects.clear(); adapter.signedUrls.clear(); adapter.downloads.length = 0; adapter.nextId = 0;
    adapter.failNextUpload = false; adapter.authorized = true; adapter.uploadGate = null;
    adapter.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name !== "get_published_emergency_evacuation_video") return { data: null, error: null };
      const row = adapter.rows.get(String(args?.p_video_id));
      return { data: row?.status === "published" ? structuredClone(row) : null, error: null };
    });
    vi.stubGlobal("crypto", { randomUUID: () => `test-video-id-${++adapter.nextId}` });
    vi.stubGlobal("XMLHttpRequest", LocalStorageUploadRequest);
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: false });
        return Promise.resolve();
      }),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn().mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: true });
      }),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      adapter.downloads.push({ url: this.href, filename: this.download });
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports the local test Storage adapter as ready", async () => {
    await expect(getEmergencyVideoStorageReadiness()).resolves.toBe("ready");
  });

  it("uploads the supplied MP4/VTT, reviews and publishes locally, then plays/downloads the same bytes for students", async () => {
    function AdminHarness() {
      const [configuration, setConfiguration] = useState(initialConfiguration);
      return <EmergencyEvacuationVideoAdminSection
        campus={demoCampus} buildingId={demoRoom.buildingId} floorId={demoRoom.floorId} room={demoRoom}
        configuration={configuration} onChange={setConfiguration}
      />;
    }

    const adminView = render(<AdminHarness />);
    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /upload MP4 video/i })).toBeEnabled());
    const mp4Input = adminView.container.querySelector<HTMLInputElement>('input[accept="video/mp4,.mp4"]');
    expect(mp4Input).not.toBeNull();
    let finishUpload!: () => void;
    adapter.uploadGate = new Promise<void>((resolve) => { finishUpload = resolve; });
    fireEvent.change(mp4Input!, { target: { files: [sampleMp4()] } });
    expect(await screen.findByText("Uploading private video")).toBeInTheDocument();
    expect(adminView.container.querySelector("progress")).toHaveValue(0);
    finishUpload();
    adapter.uploadGate = null;

    await screen.findByTestId("emergency-video-admin-record");
    expect(screen.getByText("PLV_NaviSync_Emergency_Video_TEST_ONLY.mp4")).toBeInTheDocument();
    expect(screen.getByText("Uploaded · awaiting review")).toBeInTheDocument();
    const videoRow = [...adapter.rows.values()][0];
    const videoId = String(videoRow.id);
    const videoPath = String(videoRow.storage_path);
    const sourceBytes = new Uint8Array(readFileSync(TEST_MP4!));
    expect(adapter.objects.get(videoPath)).toEqual(sourceBytes);
    const signedCountBeforeDraftLookup = adapter.signedUrls.size;
    await expect(getPublishedEmergencyEvacuationVideo({
      videoId, roomId: demoRoom.id, campusId: demoCampus.id, routeFingerprint: TEST_ROUTE_FINGERPRINT,
    })).resolves.toBeNull();
    expect(adapter.signedUrls.size).toBe(signedCountBeforeDraftLookup);

    const vttInput = adminView.container.querySelector<HTMLInputElement>('input[accept="text/vtt,.vtt"]');
    expect(vttInput).not.toBeNull();
    fireEvent.change(vttInput!, { target: { files: [sampleVtt()] } });
    await screen.findByText("Captions attached. Re-review the guide after changing subtitles.");
    const uploadedRow = adapter.rows.get(videoId)!;
    const captionsPath = String(uploadedRow.captions_path);
    expect(adapter.objects.has(captionsPath)).toBe(true);
    expect(adapter.objects.get(captionsPath)).toEqual(new Uint8Array(readFileSync(TEST_VTT!)));

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(adminView.container.querySelector("video")).toBeTruthy());
    const previewVideo = adminView.container.querySelector("video")!;
    expect(previewVideo.controls).toBe(true);
    expect(previewVideo.playsInline).toBe(true);
    Object.defineProperty(previewVideo, "duration", { configurable: true, value: 16 });
    expect(previewVideo.querySelector("track[kind='captions']")).toHaveAttribute("src");
    fireEvent.loadedMetadata(previewVideo);
    const reviewCheckbox = adminView.container.querySelector<HTMLInputElement>('input[type="checkbox"]:not([aria-label])');
    expect(reviewCheckbox).not.toBeNull();
    await waitFor(() => expect(reviewCheckbox).toBeEnabled());
    fireEvent.click(reviewCheckbox!);
    fireEvent.click(screen.getByRole("button", { name: /review & publish/i }));
    await waitFor(() => expect(adapter.rows.get(videoId)?.status).toBe("published"));
    expect(screen.getByText(/Save and publish the campus map to make this approved guide available to students/i)).toBeInTheDocument();
    const signedCountBeforeStaleLookup = adapter.signedUrls.size;
    await expect(getPublishedEmergencyEvacuationVideo({
      videoId, roomId: demoRoom.id, campusId: demoCampus.id,
      routeFingerprint: JSON.stringify([["stale", "door", "exit", "node", "signature"]]),
    })).resolves.toBeNull();
    expect(adapter.signedUrls.size).toBe(signedCountBeforeStaleLookup);
    const savedPublishedGuide = {
      enabled: true,
      videoId,
      title: "TEST ONLY · Emergency video guide",
      reviewStatus: "approved" as const,
      reviewedRouteFingerprint: TEST_ROUTE_FINGERPRINT,
    };
    const oldPublishedPath = String(adapter.rows.get(videoId)?.storage_path);
    fireEvent.click(screen.getByRole("button", { name: "Replace video" }));
    const replacementInput = adminView.container.querySelector<HTMLInputElement>('input[accept="video/mp4,.mp4"]');
    fireEvent.change(replacementInput!, { target: { files: [sampleMp4()] } });
    await waitFor(() => expect(adapter.rows.size).toBe(2));
    expect(adapter.rows.get(videoId)?.status).toBe("published");
    expect(adapter.objects.has(oldPublishedPath)).toBe(true);
    expect([...adapter.rows.values()].some((row) => row.status === "draft" && row.id !== videoId)).toBe(true);

    adminView.unmount();

    const studentView = render(<StudentSelectedPlaceCard
      room={demoRoomDest}
      campusId={demoCampus.id}
      floorId={demoRoom.floorId}
      emergencyVideoGuide={savedPublishedGuide}
      emergencyVideoRouteFingerprint={TEST_ROUTE_FINGERPRINT}
      onDirections={vi.fn()} onStartHere={vi.fn()} onReport={vi.fn()} onClose={vi.fn()}
    />);

    const studentVideo = await screen.findByTestId("student-emergency-video");
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect((studentVideo as HTMLVideoElement).muted).toBe(true);
    expect((studentVideo as HTMLVideoElement).loop).toBe(true);
    expect(studentVideo.querySelector("source")).toHaveAttribute("src", expect.stringContaining("local-storage.invalid"));

    const stack = screen.getByTestId("student-room-and-video-stack");
    expect(stack).toHaveClass("flex-col-reverse", "md:flex-col");
    expect(within(stack).getByTestId("student-selected-place-card")).toBeInTheDocument();

    const rpcCallsBeforeLayoutUpdate = adapter.rpc.mock.calls.length;
    studentView.rerender(<StudentSelectedPlaceCard
      room={demoRoomDest} campusId={demoCampus.id} floorId={demoRoom.floorId}
      description="Local-only presentation update representing a 2D/3D and Follow/Explore state change."
      emergencyVideoGuide={savedPublishedGuide} emergencyVideoRouteFingerprint={TEST_ROUTE_FINGERPRINT}
      onDirections={vi.fn()} onStartHere={vi.fn()} onReport={vi.fn()} onClose={vi.fn()}
    />);
    expect(adapter.rpc).toHaveBeenCalledTimes(rpcCallsBeforeLayoutUpdate);
    expect(screen.getByTestId("student-emergency-video")).toBe(studentVideo);

    fireEvent.click(screen.getByRole("button", { name: "Enable video voiceover" }));
    await waitFor(() => expect((studentVideo as HTMLVideoElement).muted).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Pause video guide" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Play video guide" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Play video guide" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause video guide" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Show video guide controls" }));
    expect(studentVideo).toHaveAttribute("controls");
    expect(studentVideo.querySelector("track[kind='captions']")).toHaveAttribute("src");
    expect(screen.queryByRole("button", { name: /video voiceover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause video guide|Play video guide/ })).not.toBeInTheDocument();

    const loopToggle = screen.getByRole("button", { name: "Turn video loop off" });
    fireEvent.click(loopToggle);
    await waitFor(() => expect((studentVideo as HTMLVideoElement).loop).toBe(false));
    // Expanded playback uses the browser control bar for native seeking, volume,
    // captions, and fullscreen instead of drawing a duplicate custom bar.
    expect((studentVideo as HTMLVideoElement).controls).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
    const downloadUrl = adapter.downloads.at(-1)?.url;
    expect(downloadUrl).toBeTruthy();
    expect(adapter.downloads.at(-1)?.filename).toBe("PLV_NaviSync_Emergency_Video_TEST_ONLY.mp4");
    const downloadedPath = adapter.signedUrls.get(downloadUrl!)!;
    expect(adapter.objects.get(downloadedPath)).toEqual(sourceBytes);

    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause);
    const otherRoom: RoomDest = { ...demoRoomDest, roomId: "test-room-other", roomName: "TEST ONLY · Other Room" };
    studentView.rerender(<StudentSelectedPlaceCard
      room={otherRoom} campusId={demoCampus.id} floorId={demoRoom.floorId}
      emergencyVideoGuide={savedPublishedGuide} emergencyVideoRouteFingerprint={TEST_ROUTE_FINGERPRINT}
      onDirections={vi.fn()} onStartHere={vi.fn()} onReport={vi.fn()} onClose={vi.fn()}
    />);
    await waitFor(() => expect(pauseSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("student-emergency-video")).not.toBeInTheDocument());
    expect(await screen.findByText("Approved video unavailable")).toBeInTheDocument();
    studentView.unmount();
  });

  it("uses the attached sample files in this run", () => {
    expect(SAMPLE_AVAILABLE, "set PLVSYNC_TEST_MP4 to the attached TEST_ONLY MP4").toBe(true);
    expect(SAMPLE_CAPTIONS_AVAILABLE, "set PLVSYNC_TEST_VTT to the attached TEST_ONLY VTT").toBe(true);
  });

  it("keeps room configuration unchanged for invalid, interrupted, and unauthorized uploads", async () => {
    const onChange = vi.fn();
    const view = render(<EmergencyEvacuationVideoAdminSection
      campus={demoCampus} buildingId={demoRoom.buildingId} floorId={demoRoom.floorId} room={demoRoom}
      configuration={initialConfiguration} onChange={onChange}
    />);
    fireEvent.click(screen.getByRole("button", { name: /emergency evacuation video guide/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /upload MP4 video/i })).toBeEnabled());
    const input = view.container.querySelector<HTMLInputElement>('input[accept="video/mp4,.mp4"]')!;

    fireEvent.change(input, { target: { files: [new File(["bad"], "not-a-video.mov", { type: "video/quicktime" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/choose an MP4/i);
    expect(adapter.objects.size).toBe(0);
    expect(onChange).not.toHaveBeenCalled();

    adapter.failNextUpload = true;
    fireEvent.change(input, { target: { files: [sampleMp4()] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/upload connection was interrupted/i);
    expect(adapter.objects.size).toBe(0);
    expect(onChange).not.toHaveBeenCalled();

    adapter.authorized = false;
    fireEvent.change(input, { target: { files: [sampleMp4()] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/authorized administrator/i);
    expect(adapter.objects.size).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
