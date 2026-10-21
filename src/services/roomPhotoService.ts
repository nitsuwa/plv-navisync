import { getSupabase } from "../lib/supabase";

export const ROOM_PHOTO_BUCKET = "room-photos";
export const MAX_ROOM_PHOTO_BYTES = 5 * 1024 * 1024;
const ROOM_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const PUBLISHED_PHOTO_URL_CACHE_MS = 5 * 60 * 1000;
const PUBLISHED_PHOTO_URL_CACHE_LIMIT = 80;
const publishedPhotoUrls = new Map<string, { url: string; expiresAt: number }>();
const publishedPhotoUrlRequests = new Map<string, Promise<string | null>>();

function publishedRoomPhotoKey(input: {
  campusId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  path: string;
}): string {
  // Reuse a signed URL only for the exact published Room reference that passed
  // the scope check below. Keep this cache in memory and well inside its TTL.
  return JSON.stringify([input.campusId, input.buildingId, input.floorId, input.roomId, input.path]);
}

export function validateRoomPhotoFile(file: Pick<File, "type" | "size">): void {
  if (!ROOM_PHOTO_TYPES.has(file.type)) throw new Error("Choose a JPG, PNG, or WebP photo.");
  if (file.size < 1 || file.size > MAX_ROOM_PHOTO_BYTES) throw new Error("Room photos must be 5 MB or smaller.");
}

async function validateRoomPhotoContents(file: File): Promise<void> {
  validateRoomPhotoFile(file);
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png = header.length >= 8 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e
    && header[3] === 0x47 && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a;
  const webp = header.length >= 12 && String.fromCharCode(...header.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if ((file.type === "image/jpeg" && !jpeg) || (file.type === "image/png" && !png) || (file.type === "image/webp" && !webp)) {
    throw new Error("The selected file does not contain a valid image of the declared type.");
  }
}

function extensionForType(type: string): string {
  return type === "image/jpeg" ? "jpg" : type.slice("image/".length);
}

/** Uploads one immutable, campus and Room-scoped file to private Storage. */
export async function uploadRoomPhoto(input: {
  campusId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  file: File;
}): Promise<string> {
  await validateRoomPhotoContents(input.file);
  const path = [input.campusId, input.buildingId, input.floorId, input.roomId,
    `${crypto.randomUUID()}.${extensionForType(input.file.type)}`].join("/");
  const { error } = await getSupabase().storage.from(ROOM_PHOTO_BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (error) throw new Error("The Room photo could not be uploaded. Check Admin access and Storage setup, then try again.");
  return path;
}

/** Admin previews are signed against the private bucket's Admin read policy. */
export async function createRoomPhotoPreviewUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from(ROOM_PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("The Room photo preview is unavailable.");
  return data.signedUrl;
}

/** Student previews only work for a path referenced by the active published map. */
export async function getPublishedRoomPhotoUrl(input: {
  campusId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  path: string;
}): Promise<string | null> {
  const [campusId, buildingId, floorId, roomId] = input.path.split("/");
  if (campusId !== input.campusId || buildingId !== input.buildingId || floorId !== input.floorId || roomId !== input.roomId) return null;
  const key = publishedRoomPhotoKey(input);
  const cached = publishedPhotoUrls.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    publishedPhotoUrls.delete(key);
    publishedPhotoUrls.set(key, cached);
    return cached.url;
  }
  publishedPhotoUrls.delete(key);

  const pending = publishedPhotoUrlRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    const { data, error } = await getSupabase().storage.from(ROOM_PHOTO_BUCKET).createSignedUrl(input.path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    publishedPhotoUrls.set(key, { url: data.signedUrl, expiresAt: Date.now() + PUBLISHED_PHOTO_URL_CACHE_MS });
    if (publishedPhotoUrls.size > PUBLISHED_PHOTO_URL_CACHE_LIMIT) {
      const oldestKey = publishedPhotoUrls.keys().next().value;
      if (oldestKey) publishedPhotoUrls.delete(oldestKey);
    }
    return data.signedUrl;
  })();
  publishedPhotoUrlRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (publishedPhotoUrlRequests.get(key) === request) publishedPhotoUrlRequests.delete(key);
  }
}

/** Drop one in-memory URL after the browser reports that its image cannot load. */
export function invalidatePublishedRoomPhotoUrl(input: {
  campusId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  path: string;
}): void {
  publishedPhotoUrls.delete(publishedRoomPhotoKey(input));
}

/**
 * Removes a replaced or cleared file only when no saved draft or published
 * snapshot references it. Storage RLS is the final guard and may retain it.
 */
export async function deleteRoomPhotoIfUnreferenced(path: string): Promise<boolean> {
  try {
    const { error } = await getSupabase().storage.from(ROOM_PHOTO_BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
}
