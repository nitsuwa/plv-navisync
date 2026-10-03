import { getSupabase } from "../lib/supabase";

export const BUILDING_IMAGE_BUCKET = "building-images";
const ALLOWED_BUILDING_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BUILDING_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateBuildingCoverImage(file: Pick<File, "type" | "size">): void {
  if (!ALLOWED_BUILDING_IMAGE_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > MAX_BUILDING_IMAGE_BYTES) throw new Error("Building images must be 5 MB or smaller.");
}

export async function uploadBuildingCoverImage(buildingId: string, file: File): Promise<string> {
  return uploadPlaceCoverImage("buildings", buildingId, file);
}

export async function uploadCampusPlaceCoverImage(placeId: string, file: File): Promise<string> {
  return uploadPlaceCoverImage("campus-places", placeId, file);
}

async function uploadPlaceCoverImage(folder: "buildings" | "campus-places", entityId: string, file: File): Promise<string> {
  validateBuildingCoverImage(file);
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.slice("image/".length);
  const safeEntityId = entityId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${folder}/${safeEntityId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await getSupabase().storage.from(BUILDING_IMAGE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export function buildingCoverPublicUrl(path: string): string {
  return getSupabase().storage.from(BUILDING_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
