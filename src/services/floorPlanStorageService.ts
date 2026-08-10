import { getSupabase } from "../lib/supabase";
import { validateFloorPlanImage } from "../lib/floorPlanBackground";

export function floorPlanFileExtension(file: Pick<File, "name" | "type">) {
  if (file.type === "image/jpeg") return "jpg";
  return file.name.split(".").pop()?.toLowerCase() || file.type.split("/")[1] || "png";
}

export async function uploadFloorPlanImage(params: {
  campusId: string;
  buildingId: string;
  floorId: string;
  file: File;
}): Promise<string> {
  validateFloorPlanImage(params.file);
  const ext = floorPlanFileExtension(params.file);
  const path = `${params.campusId}/${params.buildingId}/${params.floorId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabase()
    .storage
    .from("floor-plans")
    .upload(path, params.file, { contentType: params.file.type, upsert: false });
  if (error) throw new Error(`Floor plan upload failed: ${error.message}`);
  return path;
}

export async function createFloorPlanSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from("floor-plans").createSignedUrl(storagePath, 60 * 60);
  if (error) throw new Error(`Floor plan preview failed: ${error.message}`);
  return data.signedUrl;
}

export const floorPlanStorageService = {
  validate: validateFloorPlanImage,
  upload: uploadFloorPlanImage,
  signedUrl: createFloorPlanSignedUrl,
};
