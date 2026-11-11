import type { Campus } from "../components/map-builder/types";
import { currentStudentEmergencyRouteFingerprint } from "./studentEmergencyEvacuation";
import { getOfflineVideo, getOfflineVideoUsageForCampus, offlineVideoKey, saveOfflineVideo, type OfflineVideoPackage } from "./offlineCampusStore";
import {
  EMERGENCY_CAPTIONS_MAX_BYTES,
  EMERGENCY_VIDEO_MAX_BYTES,
  getPublishedEmergencyEvacuationVideo,
  type PublishedEmergencyVideo,
  type PublishedRoomVideo,
} from "../services/emergencyEvacuationVideoService";

const CAMPUS_AUTOMATIC_VIDEO_BUDGET_BYTES = 150 * 1024 * 1024;
const activeVideoWrites = new Set<string>();

function isConstrainedConnection(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return connection?.saveData === true || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";
}

function offlineVideoRecord(
  video: PublishedEmergencyVideo | PublishedRoomVideo,
  routeFingerprint: string,
  bytes: Blob,
  captions: Blob | null,
): OfflineVideoPackage {
  const { playbackUrl: _playbackUrl, downloadUrl: _downloadUrl, captionsUrl: _captionsUrl, ...metadata } = video;
  const totalSize = bytes.size + (captions?.size ?? 0);
  return {
    key: offlineVideoKey(video.campus_id, video.id),
    campusId: video.campus_id,
    videoId: video.id,
    roomId: video.room_id,
    routeFingerprint,
    updatedAt: video.updated_at,
    sizeBytes: totalSize,
    mimeType: "video/mp4",
    fileName: video.original_filename,
    video: bytes,
    captions,
    captionsMimeType: captions ? "text/vtt" : null,
    metadata,
  };
}

async function fetchCompleteMedia(url: string, expectedSize: number, maxSize: number, typePrefix: string): Promise<Blob> {
  const response = await fetch(url, { cache: "no-store", credentials: "omit" });
  if (response.status !== 200 || !response.ok || response.headers.has("content-range")) {
    throw new Error("The media response was partial or unavailable.");
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType && contentType !== typePrefix && contentType !== "application/octet-stream") {
    throw new Error("The published media type is not supported for offline playback.");
  }
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > maxSize || (expectedSize > 0 && blob.size !== expectedSize)) {
    throw new Error("The complete media file could not be verified.");
  }
  return new Blob([blob], { type: typePrefix });
}

/** Stores a currently authorized published video only after a complete body is verified. */
export async function cachePublishedVideoForOffline(
  video: PublishedEmergencyVideo | PublishedRoomVideo,
  routeFingerprint: string,
  remainingBudgetBytes = CAMPUS_AUTOMATIC_VIDEO_BUDGET_BYTES,
): Promise<OfflineVideoPackage | null> {
  if (!navigator.onLine || isConstrainedConnection() || video.mime_type !== "video/mp4"
    || video.file_size_bytes <= 0 || video.file_size_bytes > EMERGENCY_VIDEO_MAX_BYTES) return null;
  const key = offlineVideoKey(video.campus_id, video.id);
  if (activeVideoWrites.has(key)) return null;
  activeVideoWrites.add(key);
  try {
    const existing = await getOfflineVideo(key);
    if (existing?.routeFingerprint === routeFingerprint && existing.updatedAt === video.updated_at) return existing;
    const campusUsage = await getOfflineVideoUsageForCampus(video.campus_id);
    const campusUsageWithoutReplacement = Math.max(0, campusUsage - (existing?.sizeBytes ?? 0));
    const campusBudgetRemaining = Math.max(0, CAMPUS_AUTOMATIC_VIDEO_BUDGET_BYTES - campusUsageWithoutReplacement);
    const expected = video.file_size_bytes + Math.max(0, Number((video as { captions_size_bytes?: number }).captions_size_bytes ?? 0));
    if (expected > Math.min(remainingBudgetBytes, campusBudgetRemaining)) return null;
    const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
    const replaceable = existing?.sizeBytes ?? 0;
    if (estimate?.quota !== undefined && estimate.usage !== undefined
      && expected > Math.min(remainingBudgetBytes, estimate.quota - estimate.usage + replaceable)) return null;
    const bytes = await fetchCompleteMedia(video.playbackUrl, video.file_size_bytes, EMERGENCY_VIDEO_MAX_BYTES, "video/mp4");
    let captions: Blob | null = null;
    if (video.captions_path && video.captionsUrl) {
      captions = await fetchCompleteMedia(video.captionsUrl, 0, EMERGENCY_CAPTIONS_MAX_BYTES, "text/vtt");
    }
    const record = offlineVideoRecord(video, routeFingerprint, bytes, captions);
    if (record.sizeBytes > Math.min(remainingBudgetBytes, campusBudgetRemaining)) return null;
    await navigator.storage?.persist?.().catch(() => false);
    await saveOfflineVideo(record);
    return record;
  } finally {
    activeVideoWrites.delete(key);
  }
}

/** Prepare approved guides explicitly present in the saved published snapshot, sequentially. */
export async function prepareCampusEmergencyVideosOffline(campus: Campus): Promise<{ saved: number; bytes: number }> {
  if (!navigator.onLine || isConstrainedConnection()) return { saved: 0, bytes: 0 };
  const candidates = campus.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.flatMap((room) => {
    const guide = room.emergencyEvacuation?.videoGuide;
    if (!guide?.enabled || !guide.videoId || guide.reviewStatus !== "approved" || !guide.reviewedRouteFingerprint) return [];
    const fingerprint = currentStudentEmergencyRouteFingerprint(campus, building.id, floor.id, room.id);
    if (!fingerprint || fingerprint !== guide.reviewedRouteFingerprint) return [];
    return [{ buildingId: building.id, floorId: floor.id, roomId: room.id, videoId: guide.videoId, fingerprint }];
  })));
  let bytes = 0;
  let saved = 0;
  for (const candidate of candidates) {
    if (bytes >= CAMPUS_AUTOMATIC_VIDEO_BUDGET_BYTES || !navigator.onLine) break;
    try {
      const published = await getPublishedEmergencyEvacuationVideo({
        videoId: candidate.videoId,
        roomId: candidate.roomId,
        campusId: campus.id,
        routeFingerprint: candidate.fingerprint,
      });
      if (!published) continue;
      const existing = await getOfflineVideo(offlineVideoKey(campus.id, published.id));
      if (existing?.routeFingerprint === candidate.fingerprint && existing.updatedAt === published.updated_at) continue;
      const record = await cachePublishedVideoForOffline(published, candidate.fingerprint, CAMPUS_AUTOMATIC_VIDEO_BUDGET_BYTES - bytes);
      if (record) {
        bytes += record.sizeBytes;
        saved += 1;
      }
    } catch {
      // Map availability is independent of media. Keep the last complete file
      // and continue preparing other approved guides.
    }
  }
  return { saved, bytes };
}
