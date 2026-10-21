import { getSupabase, supabaseKey_, supabaseUrl_ } from "../lib/supabase";
import type { Json, Tables } from "../types/database.generated";

export const EMERGENCY_EVACUATION_VIDEO_BUCKET = "emergency-evacuation-videos";
export const EMERGENCY_VIDEO_SETUP_MIGRATION = "20261014090000_emergency_evacuation_video_guides.sql";
export const EMERGENCY_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const EMERGENCY_CAPTIONS_MAX_BYTES = 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export type EmergencyVideoStorageReadiness = "ready" | "not_configured" | "missing_table" | "missing_bucket" | "no_access" | "unavailable";

export type RoomVideoBackendStatus = "checking" | "ready" | "not_configured" | "missing_table" | "missing_bucket" | "unauthenticated" | "no_access" | "unavailable";
export type RoomVideoFailureKind = Exclude<RoomVideoBackendStatus, "checking" | "ready"> | "validation" | "network" | "storage";

export class RoomVideoServiceError extends Error {
  readonly kind: RoomVideoFailureKind;

  constructor(kind: RoomVideoFailureKind, message: string) {
    super(message);
    this.name = "RoomVideoServiceError";
    this.kind = kind;
  }
}

export function roomVideoBackendStatusMessage(status: RoomVideoBackendStatus): string | null {
  switch (status) {
    case "missing_table": return "Room Videos is not configured in the database yet. Please contact the administrator to complete setup.";
    case "missing_bucket": return "Room Videos storage is not configured yet. Please contact the administrator to complete setup.";
    case "unauthenticated": return "Sign in with an authorized Admin account to manage Room Videos.";
    case "no_access": return "Your account does not have permission to manage Room Videos. Contact an administrator if you need access.";
    case "not_configured": return "Room Videos is not configured for this environment. Please contact the administrator.";
    case "unavailable": return "Room Videos setup could not be checked. Check your connection and try again.";
    default: return null;
  }
}

export type EmergencyVideoUploadFailureDiagnostic = {
  phase: "storage_upload" | "metadata_insert";
  service: "Storage" | "PostgREST";
  status: number;
  code?: string;
  backendMessage?: string;
  requestId?: string;
  method: "POST";
  bucket?: string;
  table?: string;
  objectPath: string;
  contentType: string;
  fileSizeBytes: number;
  cleanupStatus?: "removed" | "failed";
  cleanupMessage?: string;
};

/** Kept as an alias for existing Admin consumers; diagnostics can describe
 * the Storage request or the follow-up metadata insert. */
export type EmergencyVideoStorageFailureDiagnostic = EmergencyVideoUploadFailureDiagnostic;

/** HTTP upload failures retain a short, sanitized Admin-only diagnostic while
 * the main Room Properties message stays concise. Never retain request or
 * response headers that could contain authorization material. */
export class EmergencyVideoStorageRequestError extends Error {
  readonly diagnostic: EmergencyVideoUploadFailureDiagnostic;

  constructor(diagnostic: EmergencyVideoUploadFailureDiagnostic) {
    super("Upload failed. Please retry.");
    this.name = "EmergencyVideoStorageRequestError";
    this.diagnostic = diagnostic;
  }
}

export class EmergencyVideoMetadataRequestError extends Error {
  readonly diagnostic: EmergencyVideoUploadFailureDiagnostic;

  constructor(diagnostic: EmergencyVideoUploadFailureDiagnostic) {
    super("Upload failed. Please retry.");
    this.name = "EmergencyVideoMetadataRequestError";
    this.diagnostic = diagnostic;
  }
}

function sanitizeStorageDiagnostic(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized ? sanitized.slice(0, 220) : undefined;
}

function storageResponseDiagnostic(request: XMLHttpRequest, context: {
  path: string;
  contentType: string;
  fileSizeBytes: number;
}): EmergencyVideoUploadFailureDiagnostic {
  let code: string | undefined;
  let backendMessage: string | undefined;
  try {
    const body = JSON.parse(request.responseText) as Record<string, unknown>;
    code = sanitizeStorageDiagnostic(body.statusCode ?? body.code ?? body.errorCode ?? body.error);
    backendMessage = sanitizeStorageDiagnostic(body.message ?? body.error_description ?? body.details);
  } catch {
    backendMessage = sanitizeStorageDiagnostic(request.responseText);
  }
  return {
    phase: "storage_upload",
    service: "Storage",
    status: request.status,
    method: "POST",
    bucket: EMERGENCY_EVACUATION_VIDEO_BUCKET,
    objectPath: context.path,
    contentType: context.contentType,
    fileSizeBytes: context.fileSizeBytes,
    ...(code ? { code } : {}),
    ...(backendMessage ? { backendMessage } : {}),
    ...((request.getResponseHeader("x-request-id")
      ?? request.getResponseHeader("x-kong-request-id")
      ?? request.getResponseHeader("cf-ray"))
      ? { requestId: sanitizeStorageDiagnostic(request.getResponseHeader("x-request-id")
        ?? request.getResponseHeader("x-kong-request-id")
        ?? request.getResponseHeader("cf-ray")) }
      : {}),
  };
}

function isMissingVideoTable(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === "42P01" || value?.code === "PGRST205"
    || /emergency_evacuation_videos.*(not found|does not exist)|could not find the table/i.test(value?.message ?? "");
}

function isMissingRoomVideoTable(error: unknown): boolean {
  const value = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const message = [value?.message, value?.details, value?.hint].filter(Boolean).join(" ");
  const namesRoomVideoTable = /(?:public\.)?room_videos/i.test(message);
  return namesRoomVideoTable && (
    value?.code === "42P01" || value?.code === "PGRST205"
      || /could not find|schema cache|not found|does not exist|undefined table/i.test(message)
  );
}

function isAccessError(error: unknown): boolean {
  const value = error as { code?: string; message?: string; status?: number; statusCode?: string } | null;
  return value?.code === "42501" || value?.status === 401 || value?.status === 403
    || value?.statusCode === "401" || value?.statusCode === "403"
    || /permission denied|not authorized|unauthorized|row-level security/i.test(value?.message ?? "");
}

function roomVideoFailureKind(error: unknown): RoomVideoFailureKind {
  if (error instanceof RoomVideoServiceError) return error.kind;
  const value = error as { code?: string; message?: string; status?: number; statusCode?: string } | null;
  if (isMissingRoomVideoTable(error)) return "missing_table";
  const status = Number(value?.status ?? value?.statusCode ?? 0);
  const message = value?.message ?? "";
  if (status === 404 || value?.statusCode === "404" || /bucket (?:not found|does not exist|could not be found)/i.test(message)) return "missing_bucket";
  if (status === 401 || /invalid jwt|jwt expired|not authenticated|authentication required|sign in as an authorized administrator|active administrator session is required/i.test(message)) return "unauthenticated";
  if (isAccessError(error)) return "no_access";
  if (status === 0 && /network|fetch|connection|failed to load/i.test(message)) return "network";
  return "unavailable";
}

function roomVideoBackendStatusForError(error: unknown): RoomVideoBackendStatus {
  const kind = roomVideoFailureKind(error);
  return kind === "missing_table" || kind === "missing_bucket" || kind === "unauthenticated" || kind === "no_access"
    ? kind
    : "unavailable";
}

function roomVideoFailure(error: unknown): RoomVideoServiceError {
  if (error instanceof RoomVideoServiceError) return error;
  if (error instanceof EmergencyVideoStorageRequestError) {
    const { status, backendMessage, code } = error.diagnostic;
    if (status === 401) return new RoomVideoServiceError("unauthenticated", "Sign in with an authorized Admin account to upload Room Videos.");
    if (status === 403 || /permission denied|not authorized|unauthorized|row-level security/i.test(`${code ?? ""} ${backendMessage ?? ""}`)) {
      return new RoomVideoServiceError("no_access", "Your account does not have permission to upload Room Videos.");
    }
    return new RoomVideoServiceError(status === 0 ? "network" : "storage", status === 0
      ? "The Room Video upload connection was interrupted. Check your connection and try again."
      : "Room Video storage rejected the upload. Check the file and storage configuration, then retry.");
  }
  const kind = roomVideoFailureKind(error);
  if (kind === "missing_table" || kind === "missing_bucket" || kind === "unauthenticated" || kind === "no_access") {
    const status = kind as RoomVideoBackendStatus;
    return new RoomVideoServiceError(kind, roomVideoBackendStatusMessage(status) ?? "Room Videos is unavailable.");
  }
  if (kind === "network") return new RoomVideoServiceError(kind, "The Room Videos connection failed. Check your connection and try again.");
  return new RoomVideoServiceError("unavailable", "Room Videos could not be saved. Check the database and storage setup, then retry.");
}

async function inspectRoomVideoBackend(client: ReturnType<typeof getSupabase>): Promise<{
  status: RoomVideoBackendStatus;
  userId?: string;
}> {
  if (!supabaseUrl_ || !supabaseKey_) return { status: "not_configured" };
  let userResult: Awaited<ReturnType<typeof client.auth.getUser>>;
  try {
    userResult = await client.auth.getUser();
  } catch (error) {
    return { status: roomVideoFailureKind(error) === "network" ? "unavailable" : "unauthenticated" };
  }
  if (userResult.error) {
    const kind = roomVideoFailureKind(userResult.error);
    return { status: kind === "network" ? "unavailable" : kind === "no_access" ? "no_access" : "unauthenticated" };
  }
  if (!userResult.data.user) return { status: "unauthenticated" };

  try {
    // RLS-filtered SELECTs and Storage listings can succeed with zero rows for
    // a signed-in non-Admin. Check the same Admin predicate used by both write
    // policies before presenting the feature as available.
    const { data: isAdmin, error } = await client.rpc("is_admin");
    if (error) return { status: isAccessError(error) ? "no_access" : "unavailable" };
    if (isAdmin !== true) return { status: "no_access" };
  } catch (error) {
    return { status: roomVideoFailureKind(error) === "network" ? "unavailable" : "no_access" };
  }

  try {
    const { error } = await client.from("room_videos").select("id").limit(0);
    if (error) return { status: roomVideoBackendStatusForError(error) };
  } catch (error) {
    return { status: roomVideoBackendStatusForError(error) };
  }

  try {
    const { error } = await client.storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).list("", { limit: 1 });
    if (!error) return { status: "ready", userId: userResult.data.user.id };
    const value = error as { message?: string; status?: number; statusCode?: string };
    if (value.status === 404 || value.statusCode === "404" || /bucket not found|bucket does not exist/i.test(value.message ?? "")) {
      return { status: "missing_bucket" };
    }
    return { status: isAccessError(error) ? "no_access" : "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/** Checks the Admin session, metadata table, and existing private media bucket without creating or changing backend resources. */
export async function getRoomVideoBackendReadiness(): Promise<RoomVideoBackendStatus> {
  if (!supabaseUrl_ || !supabaseKey_) return "not_configured";
  try {
    return (await inspectRoomVideoBackend(getSupabase())).status;
  } catch {
    return "unavailable";
  }
}

/** Readiness probe only. It never creates a bucket/table or changes Storage policy. */
export async function getEmergencyVideoStorageReadiness(): Promise<EmergencyVideoStorageReadiness> {
  if (!supabaseUrl_ || !supabaseKey_) return "not_configured";
  const client = getSupabase();
  const { error: tableError } = await client.from("emergency_evacuation_videos").select("id").limit(1);
  if (tableError) {
    if (isMissingVideoTable(tableError)) return "missing_table";
    if (isAccessError(tableError)) return "no_access";
    return "unavailable";
  }
  const { error: bucketError } = await client.storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).list("", { limit: 1 });
  if (!bucketError) return "ready";
  const bucketErrorValue = bucketError as { message?: string; status?: number; statusCode?: string };
  if (bucketErrorValue.status === 404 || bucketErrorValue.statusCode === "404"
    || /bucket not found|bucket does not exist/i.test(bucketErrorValue.message ?? "")) return "missing_bucket";
  if (isAccessError(bucketError)) return "no_access";
  return "unavailable";
}

export type EmergencyEvacuationVideoRow = Tables<"emergency_evacuation_videos">;
export type RoomVideoRow = Tables<"room_videos">;

export type PublishedEmergencyVideo = Pick<
  EmergencyEvacuationVideoRow,
  "id" | "campus_id" | "building_id" | "floor_id" | "room_id" | "storage_path" | "captions_path"
  | "original_filename" | "mime_type" | "file_size_bytes" | "title" | "duration_seconds" | "updated_at"
> & {
  playbackUrl: string;
  downloadUrl: string;
  captionsUrl: string | null;
};

export type PublishedRoomVideo = Pick<RoomVideoRow,
  "id" | "campus_id" | "building_id" | "floor_id" | "room_id" | "storage_path" | "captions_path"
  | "original_filename" | "mime_type" | "file_size_bytes" | "title" | "duration_seconds" | "updated_at"
> & { playbackUrl: string; downloadUrl: string; captionsUrl: string | null };

export type EmergencyVideoUploadContext = {
  campusId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  file: File;
  title: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

export function validateEmergencyVideoFile(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!file.name.toLowerCase().endsWith(".mp4")) return "Choose an MP4 video file.";
  if (file.type && file.type.toLowerCase() !== "video/mp4") return "This file is not identified as an MP4 video.";
  if (file.size <= 0) return "The selected video is empty.";
  if (file.size > EMERGENCY_VIDEO_MAX_BYTES) return "The video must be 100 MB or smaller.";
  return null;
}

export function validateEmergencyCaptionsFile(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!file.name.toLowerCase().endsWith(".vtt")) return "Choose a WebVTT (.vtt) captions file.";
  if (file.type && file.type.toLowerCase() !== "text/vtt") return "This file is not identified as WebVTT captions.";
  if (file.size <= 0 || file.size > EMERGENCY_CAPTIONS_MAX_BYTES) return "Captions must be between 1 byte and 1 MB.";
  return null;
}

export function routeFingerprintJson(value: string): Json {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 2
    || parsed.some((entry) => !Array.isArray(entry) || entry.length !== 5 || entry.some((part) => typeof part !== "string" || !part))) {
    throw new Error("The approved route review data is incomplete. Validate the evacuation routes again.");
  }
  return parsed as Json;
}

async function validateFileHeader(file: File, kind: "video" | "captions"): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 16)).arrayBuffer());
  if (kind === "video") {
    if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") {
      throw new Error("This file does not contain a valid MP4 file header.");
    }
    return;
  }
  if (new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trimStart().slice(0, 6) !== "WEBVTT") {
    throw new Error("This file does not contain a valid WebVTT captions header.");
  }
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure video storage requires a browser with UUID support.");
  }
  return globalThis.crypto.randomUUID();
}

function safeMp4Filename(value: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 251);
  return `${cleaned.toLowerCase().endsWith(".mp4") ? cleaned.slice(0, -4) : cleaned}.mp4`;
}

function storageObjectUrl(path: string): string {
  if (!supabaseUrl_) throw new Error("Emergency video storage is not configured for this environment.");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl_.replace(/\/$/, "")}/storage/v1/object/${EMERGENCY_EVACUATION_VIDEO_BUCKET}/${encoded}`;
}

/** Upload bytes using Storage's authenticated object endpoint so the Admin UI can report real transfer progress. */
function uploadStorageObject(
  path: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return (async () => {
    const { data: sessionData, error: sessionError } = await getSupabase().auth.getSession();
    if (sessionError) throw new Error("Sign in as an authorized administrator before uploading a video.");
    const accessToken = sessionData.session?.access_token;
    const apiKey = supabaseKey_;
    if (!accessToken || !apiKey) throw new Error("An active administrator session is required to upload media.");
    if (signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
    return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    request.open("POST", storageObjectUrl(path));
    request.setRequestHeader("apikey", apiKey);
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    request.setRequestHeader("Content-Type", contentType);
    request.setRequestHeader("Cache-Control", "max-age=3600");
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        const diagnostic = storageResponseDiagnostic(request, { path, contentType, fileSizeBytes: file.size });
        if (/bucket not found/i.test(diagnostic.backendMessage ?? diagnostic.code ?? "")) {
          reject(new Error("The emergency video bucket could not be found. Check the configured private bucket."));
        } else {
          reject(new EmergencyVideoStorageRequestError(diagnostic));
        }
      }
    };
    request.onerror = () => {
      cleanup();
      reject(new Error("The upload connection was interrupted. Check your connection and try again."));
    };
    request.onabort = () => {
      cleanup();
      reject(new DOMException("Upload cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    request.send(file);
    });
  })();
}

export async function uploadEmergencyEvacuationVideoDraft(input: EmergencyVideoUploadContext): Promise<EmergencyEvacuationVideoRow> {
  const validationMessage = validateEmergencyVideoFile(input.file);
  if (validationMessage) throw new Error(validationMessage);
  await validateFileHeader(input.file, "video");
  const client = getSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in as an authorized administrator before uploading a video.");

  const videoId = randomId();
  const storagePath = `${input.campusId}/${input.roomId}/${videoId}.mp4`;
  await uploadStorageObject(storagePath, input.file, "video/mp4", input.onProgress, input.signal);
  const title = input.title.trim().slice(0, 120) || input.file.name.replace(/\.mp4$/i, "").slice(0, 120) || "Evacuation Video Guide";
  const { data, error, status } = await client.from("emergency_evacuation_videos").insert({
    id: videoId,
    campus_id: input.campusId,
    building_id: input.buildingId,
    floor_id: input.floorId,
    room_id: input.roomId,
    storage_path: storagePath,
    original_filename: safeMp4Filename(input.file.name),
    mime_type: "video/mp4",
    file_size_bytes: input.file.size,
    title,
    uploaded_by: userData.user.id,
  }).select("*").single();
  if (error) {
    let cleanupStatus: EmergencyVideoUploadFailureDiagnostic["cleanupStatus"] = "failed";
    let cleanupMessage: string | undefined;
    try {
      const { error: cleanupError } = await client.storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).remove([storagePath]);
      cleanupStatus = cleanupError ? "failed" : "removed";
      cleanupMessage = cleanupError ? sanitizeStorageDiagnostic(cleanupError.message) : undefined;
    } catch (cleanupError) {
      cleanupStatus = "failed";
      cleanupMessage = cleanupError instanceof Error ? sanitizeStorageDiagnostic(cleanupError.message) : undefined;
    }
    const diagnostic: EmergencyVideoUploadFailureDiagnostic = {
      phase: "metadata_insert",
      service: "PostgREST",
      status: Number.isFinite(status) ? status : 0,
      method: "POST",
      table: "public.emergency_evacuation_videos",
      objectPath: storagePath,
      contentType: "video/mp4",
      fileSizeBytes: input.file.size,
      cleanupStatus,
      ...(cleanupMessage ? { cleanupMessage } : {}),
      ...("code" in error && typeof error.code === "string"
        ? { code: sanitizeStorageDiagnostic(error.code) }
        : {}),
      ...(typeof error.message === "string" ? { backendMessage: sanitizeStorageDiagnostic(error.message) } : {}),
    };
    throw new EmergencyVideoMetadataRequestError(diagnostic);
  }
  return data;
}

/** General room videos use the same private MP4/VTT bucket but a separate
 * metadata table and publication rule. They never read or write emergency
 * route configuration or route fingerprints. */
export async function uploadRoomVideoDraft(input: EmergencyVideoUploadContext): Promise<RoomVideoRow> {
  const validationMessage = validateEmergencyVideoFile(input.file);
  if (validationMessage) throw new RoomVideoServiceError("validation", validationMessage);
  try {
    await validateFileHeader(input.file, "video");
  } catch (error) {
    throw new RoomVideoServiceError("validation", error instanceof Error ? error.message : "This file does not contain a valid MP4 file header.");
  }
  if (!supabaseUrl_ || !supabaseKey_) {
    throw new RoomVideoServiceError("not_configured", roomVideoBackendStatusMessage("not_configured") ?? "Room Videos is not configured.");
  }
  const client = getSupabase();
  const backend = await inspectRoomVideoBackend(client);
  if (backend.status !== "ready" || !backend.userId) {
    const status = backend.status === "checking" || backend.status === "ready" ? "unauthenticated" : backend.status;
    throw new RoomVideoServiceError(status, roomVideoBackendStatusMessage(status) ?? "Room Videos is not available.");
  }
  const videoId = randomId();
  const storagePath = `${input.campusId}/${input.roomId}/${videoId}.mp4`;
  try {
    await uploadStorageObject(storagePath, input.file, "video/mp4", input.onProgress, input.signal);
  } catch (error) {
    throw roomVideoFailure(error);
  }
  const title = input.title.trim().slice(0, 120)
    || input.file.name.replace(/\.mp4$/i, "").slice(0, 120)
    || "Room Video";
  const { data, error } = await client.from("room_videos").insert({
    id: videoId,
    campus_id: input.campusId,
    building_id: input.buildingId,
    floor_id: input.floorId,
    room_id: input.roomId,
    storage_path: storagePath,
    original_filename: safeMp4Filename(input.file.name),
    mime_type: "video/mp4",
    file_size_bytes: input.file.size,
    title,
    uploaded_by: backend.userId,
  }).select("*").single();
  if (error) {
    let cleanupError: unknown;
    try {
      const { error: removeError } = await client.storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).remove([storagePath]);
      cleanupError = removeError;
    } catch (cause) {
      cleanupError = cause;
    }
    const failure = roomVideoFailure(error);
    if (cleanupError) {
      throw new RoomVideoServiceError(failure.kind,
        `${failure.message} The uploaded object could not be removed and may need administrator cleanup.`);
    }
    throw failure;
  }
  return data;
}

export async function getAdminRoomVideosForRoom(roomId: string): Promise<RoomVideoRow[]> {
  const { data, error } = await getSupabase().from("room_videos").select("*")
    .eq("room_id", roomId).order("created_at", { ascending: false });
  if (error) throw roomVideoFailure(error);
  return data ?? [];
}

export async function createAdminRoomVideoPreviewUrl(videoId: string): Promise<string> {
  const { data: row, error: rowError } = await getSupabase().from("room_videos")
    .select("storage_path").eq("id", videoId).maybeSingle();
  if (rowError) throw roomVideoFailure(rowError);
  if (!row) throw new Error("This room video is no longer available.");
  const { data, error } = await getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error) throw roomVideoFailure(error);
  if (!data?.signedUrl) throw new Error("The private room video preview could not be opened.");
  return data.signedUrl;
}

export async function updateAdminRoomVideoTitle(videoId: string, title: string): Promise<void> {
  const value = title.trim().slice(0, 120);
  if (!value) throw new Error("Enter a title for this room video.");
  const { data, error } = await getSupabase().from("room_videos")
    // A title is student-facing metadata. Require a fresh explicit Publish
    // action after changing it instead of leaving the prior review live.
    .update({ title: value, status: "draft", approved_by: null, published_at: null }).eq("id", videoId).select("id").maybeSingle();
  if (error) throw roomVideoFailure(error);
  if (!data) throw new Error("The room video title could not be saved.");
}

export async function uploadRoomVideoCaptions(videoId: string, file: File, onProgress?: (percent: number) => void): Promise<void> {
  const validationMessage = validateEmergencyCaptionsFile(file);
  if (validationMessage) throw new Error(validationMessage);
  await validateFileHeader(file, "captions");
  const client = getSupabase();
  const { data: row, error: rowError } = await client.from("room_videos").select("*").eq("id", videoId).maybeSingle();
  if (rowError) throw roomVideoFailure(rowError);
  if (!row) throw new Error("This room video draft is no longer available.");
  const path = `${row.campus_id}/${row.room_id}/${row.id}-${randomId()}.vtt`;
  try {
    await uploadStorageObject(path, file, "text/vtt", onProgress);
  } catch (cause) {
    throw roomVideoFailure(cause);
  }
  const { data, error } = await client.from("room_videos").update({
    captions_path: path,
    captions_size_bytes: file.size,
    ...(row.status === "published" ? { status: "draft", approved_by: null, published_at: null } : {}),
  }).eq("id", videoId).select("id").maybeSingle();
  if (error || !data) {
    let cleanupError: unknown;
    try {
      const { error: removeError } = await client.storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).remove([path]);
      cleanupError = removeError;
    } catch (cause) {
      cleanupError = cause;
    }
    const failure = error
      ? roomVideoFailure(error)
      : new RoomVideoServiceError("unavailable", "Captions could not be linked to this room video.");
    if (cleanupError) {
      throw new RoomVideoServiceError(failure.kind,
        `${failure.message} The uploaded caption file could not be removed and may need administrator cleanup.`);
    }
    throw failure;
  }
  if (row.captions_path) {
    const { error: cleanupError } = await client.storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).remove([row.captions_path]);
    if (cleanupError) {
      throw new RoomVideoServiceError("storage", "Captions were updated, but the previous private caption file could not be removed. Ask an administrator to inspect private video Storage.");
    }
  }
}

export async function publishRoomVideo(videoId: string): Promise<void> {
  const { data: userData, error: userError } = await getSupabase().auth.getUser();
  if (userError) throw roomVideoFailure(userError);
  if (!userData.user) throw new RoomVideoServiceError("unauthenticated", "An active administrator session is required to publish this room video.");
  const { data, error } = await getSupabase().from("room_videos").update({
    status: "published", approved_by: userData.user.id, published_at: new Date().toISOString(),
  }).eq("id", videoId).select("id").maybeSingle();
  if (error) throw roomVideoFailure(error);
  if (!data) throw new Error("The room video could not be published.");
}

export async function unpublishRoomVideo(videoId: string): Promise<void> {
  const { data, error } = await getSupabase().from("room_videos").update({
    status: "draft", approved_by: null, published_at: null,
  }).eq("id", videoId).select("id").maybeSingle();
  if (error) throw roomVideoFailure(error);
  if (!data) throw new Error("The room video could not be unpublished.");
}

export async function deleteAdminRoomVideo(videoId: string): Promise<void> {
  const client = getSupabase();
  const { data: row, error: readError } = await client.from("room_videos")
    .select("storage_path,captions_path").eq("id", videoId).maybeSingle();
  if (readError) throw roomVideoFailure(readError);
  if (!row) throw new Error("This room video is no longer available.");
  // Archive first so a Storage deletion failure leaves a private, retryable
  // metadata row instead of an untracked object or a published video.
  const { data: archived, error: archiveError } = await client.from("room_videos").update({
    status: "archived", approved_by: null, published_at: null,
  }).eq("id", videoId).select("id").maybeSingle();
  if (archiveError) throw roomVideoFailure(archiveError);
  if (!archived) throw new Error("The room video could not be prepared for removal.");
  const paths = [row.storage_path, row.captions_path].filter((path): path is string => Boolean(path));
  const { error: storageError } = await client.storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).remove(paths);
  if (storageError) {
    const failure = roomVideoFailure(storageError);
    throw new RoomVideoServiceError(failure.kind,
      `${failure.message} The video is archived and no longer visible to students, but its private Storage files could not be removed. Retry Delete or ask an administrator to inspect Storage.`);
  }
  const { data, error } = await client.from("room_videos").delete().eq("id", videoId).select("id").maybeSingle();
  if (error) throw roomVideoFailure(error);
  if (!data) throw new Error("The private files were removed, but the archived video record could not be removed.");
}

type PublishedRoomVideoRpcRow = Omit<PublishedRoomVideo, "playbackUrl" | "downloadUrl" | "captionsUrl">;

export async function getPublishedRoomVideosForRoom(input: { campusId: string; roomId: string }): Promise<PublishedRoomVideo[]> {
  const { data, error } = await getSupabase().rpc("get_published_room_videos_for_room", {
    p_campus_id: input.campusId,
    p_room_id: input.roomId,
  });
  if (error) throw new Error("Published room videos could not be loaded.");
  if (!Array.isArray(data)) return [];
  const rows = data.filter((value): value is PublishedRoomVideoRpcRow => Boolean(value && typeof value === "object"
    && !Array.isArray(value) && "id" in value && "storage_path" in value))
    .filter((row) => row.campus_id === input.campusId && row.room_id === input.roomId && row.mime_type === "video/mp4");
  return Promise.all(rows.map(async (row) => {
    const storage = getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET);
    const [playback, download, captions] = await Promise.all([
      storage.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS),
      storage.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: row.original_filename }),
      row.captions_path ? storage.createSignedUrl(row.captions_path, SIGNED_URL_TTL_SECONDS) : Promise.resolve({ data: null, error: null }),
    ]);
    if (playback.error || download.error || !playback.data?.signedUrl || !download.data?.signedUrl) return null;
    return {
      ...row,
      playbackUrl: playback.data.signedUrl,
      downloadUrl: download.data.signedUrl,
      captionsUrl: captions.data?.signedUrl ?? null,
    };
  })).then((videos) => videos.filter((video): video is PublishedRoomVideo => video !== null));
}

export async function getAdminEmergencyEvacuationVideo(videoId: string): Promise<EmergencyEvacuationVideoRow | null> {
  const { data, error } = await getSupabase().from("emergency_evacuation_videos").select("*").eq("id", videoId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getAdminEmergencyEvacuationVideosForRoom(roomId: string): Promise<EmergencyEvacuationVideoRow[]> {
  const { data, error } = await getSupabase().from("emergency_evacuation_videos").select("*").eq("room_id", roomId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAdminEmergencyVideoPreviewUrl(videoId: string): Promise<string> {
  const row = await getAdminEmergencyEvacuationVideo(videoId);
  if (!row) throw new Error("This video record is no longer available.");
  const { data, error } = await getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("The private video preview could not be opened.");
  return data.signedUrl;
}

export async function createAdminEmergencyCaptionsPreviewUrl(videoId: string): Promise<string | null> {
  const row = await getAdminEmergencyEvacuationVideo(videoId);
  if (!row?.captions_path) return null;
  const { data, error } = await getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET)
    .createSignedUrl(row.captions_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("The private captions preview could not be opened.");
  return data.signedUrl;
}

export async function updateAdminEmergencyVideoTitle(videoId: string, title: string): Promise<void> {
  const value = title.trim().slice(0, 120);
  if (!value) throw new Error("Enter a title for this video guide.");
  const { data, error } = await getSupabase().from("emergency_evacuation_videos")
    .update({ title: value }).eq("id", videoId).select("id").maybeSingle();
  if (error || !data) throw new Error("The video title could not be saved. Check Admin access and try again.");
}

export async function uploadEmergencyVideoCaptions(videoId: string, file: File, onProgress?: (percent: number) => void): Promise<string> {
  const validationMessage = validateEmergencyCaptionsFile(file);
  if (validationMessage) throw new Error(validationMessage);
  await validateFileHeader(file, "captions");
  const row = await getAdminEmergencyEvacuationVideo(videoId);
  if (!row) throw new Error("The video guide is no longer available.");
  const path = `${row.campus_id}/${row.room_id}/${row.id}-${randomId()}.vtt`;
  await uploadStorageObject(path, file, "text/vtt", onProgress);
  const { data, error } = await getSupabase().from("emergency_evacuation_videos").update({
    captions_path: path,
    captions_size_bytes: file.size,
    status: row.status === "published" ? "needs_review" : row.status,
    approved_route_fingerprint: row.status === "published" ? null : row.approved_route_fingerprint,
    approved_by: row.status === "published" ? null : row.approved_by,
    published_at: row.status === "published" ? null : row.published_at,
  }).eq("id", videoId).select("id").maybeSingle();
  if (error || !data) {
    await getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).remove([path]);
    throw new Error("Captions could not be linked to the video. Try again.");
  }
  if (row.captions_path) await getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET).remove([row.captions_path]);
  return path;
}

export async function updateEmergencyVideoDuration(videoId: string, durationSeconds: number): Promise<void> {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
  const { data, error } = await getSupabase().from("emergency_evacuation_videos")
    .update({ duration_seconds: Math.round(durationSeconds * 100) / 100 }).eq("id", videoId).select("id").maybeSingle();
  if (error || !data) throw new Error("The video duration could not be saved.");
}

export async function publishEmergencyEvacuationVideo(videoId: string, routeFingerprint: string): Promise<void> {
  const fingerprint = routeFingerprintJson(routeFingerprint);
  const { data: userData, error: userError } = await getSupabase().auth.getUser();
  if (userError || !userData.user) throw new Error("An active administrator session is required to approve this video.");
  const { data, error } = await getSupabase().from("emergency_evacuation_videos").update({
    status: "published",
    approved_route_fingerprint: fingerprint,
    approved_by: userData.user.id,
    published_at: new Date().toISOString(),
  }).eq("id", videoId).select("id").maybeSingle();
  if (error || !data) throw new Error("Video approval was not saved. Check Admin access and try again.");
}

export async function unpublishEmergencyEvacuationVideo(videoId: string): Promise<void> {
  const { data, error } = await getSupabase().from("emergency_evacuation_videos").update({
    status: "draft", approved_route_fingerprint: null, approved_by: null, published_at: null,
  }).eq("id", videoId).select("id").maybeSingle();
  if (error || !data) throw new Error("The video could not be unpublished. Check Admin access and try again.");
}

type PublishedVideoRpcRow = {
  id: string;
  campus_id: string;
  building_id: string;
  floor_id: string;
  room_id: string;
  storage_path: string;
  captions_path: string | null;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  title: string;
  duration_seconds: number | null;
  approved_route_fingerprint: unknown;
  updated_at: string;
};

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

export async function getPublishedEmergencyEvacuationVideo(input: {
  videoId: string;
  roomId: string;
  campusId: string;
  routeFingerprint: string;
}): Promise<PublishedEmergencyVideo | null> {
  const { data, error } = await getSupabase().rpc("get_published_emergency_evacuation_video", { p_video_id: input.videoId });
  if (error) throw new Error("The published video guide could not be loaded.");
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as unknown as PublishedVideoRpcRow;
  if (row.id !== input.videoId || row.room_id !== input.roomId || row.campus_id !== input.campusId || row.mime_type !== "video/mp4") return null;
  let expected: unknown;
  try { expected = JSON.parse(input.routeFingerprint); } catch { return null; }
  if (canonicalJson(row.approved_route_fingerprint) !== canonicalJson(expected)) return null;
  const storage = getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET);
  const [playback, download, captions] = await Promise.all([
    storage.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS),
    storage.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: row.original_filename }),
    row.captions_path ? storage.createSignedUrl(row.captions_path, SIGNED_URL_TTL_SECONDS) : Promise.resolve({ data: null, error: null }),
  ]);
  if (playback.error || download.error || !playback.data?.signedUrl || !download.data?.signedUrl) {
    throw new Error("The published video is temporarily unavailable.");
  }
  return {
    id: row.id,
    campus_id: row.campus_id,
    building_id: row.building_id,
    floor_id: row.floor_id,
    room_id: row.room_id,
    storage_path: row.storage_path,
    captions_path: row.captions_path,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    title: row.title,
    duration_seconds: row.duration_seconds,
    updated_at: row.updated_at,
    playbackUrl: playback.data.signedUrl,
    downloadUrl: download.data.signedUrl,
    captionsUrl: captions.data?.signedUrl ?? null,
  };
}

export async function createPublishedEmergencyEvacuationVideoDownloadUrl(input: {
  videoId: string;
  roomId: string;
  campusId: string;
  routeFingerprint: string;
}): Promise<{ url: string; filename: string } | null> {
  const { data, error } = await getSupabase().rpc("get_published_emergency_evacuation_video", { p_video_id: input.videoId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as unknown as PublishedVideoRpcRow;
  let expected: unknown;
  try { expected = JSON.parse(input.routeFingerprint); } catch { return null; }
  if (row.id !== input.videoId || row.room_id !== input.roomId || row.campus_id !== input.campusId
    || row.mime_type !== "video/mp4" || canonicalJson(row.approved_route_fingerprint) !== canonicalJson(expected)) return null;
  const { data: signed, error: signedError } = await getSupabase().storage.from(EMERGENCY_EVACUATION_VIDEO_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: row.original_filename });
  if (signedError || !signed?.signedUrl) return null;
  return { url: signed.signedUrl, filename: row.original_filename };
}

export function formatEmergencyVideoSize(sizeBytes: number): string {
  return sizeBytes >= 1024 * 1024
    ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}
