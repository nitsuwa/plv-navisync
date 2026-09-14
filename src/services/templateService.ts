import { getSupabase } from "../lib/supabase";
import type { Json, Tables, TablesInsert } from "../types/database.generated";
import type { FloorPlan } from "../components/map-builder/types";
import type { FloorTemplateDefinition } from "../lib/floorTemplates";
import type { RoomTemplateDefinition, RoomTemplateCategory, TemplateSource } from "../lib/roomTemplates";
import { sanitizeFloorForTemplate, sanitizeRoomForTemplate, templatePayloadContainsNavigation, validateTemplateName, type TemplateMetadataInput } from "../lib/templateSanitizer";

export type MapTemplateRow = Tables<"map_templates">;
export type CustomTemplateSource = Exclude<TemplateSource, "builtin">;

export interface CustomTemplateRecord {
  id: string;
  name: string;
  description: string;
  scope: "room" | "floor";
  category: string;
  source: CustomTemplateSource;
  campusId: string | null;
  createdBy: string;
  templateData: RoomTemplateDefinition | FloorTemplateDefinition;
  previewMetadata: Record<string, unknown> | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function customRoomTemplateDefinition(record: CustomTemplateRecord): RoomTemplateDefinition | null {
  if (record.scope !== "room" || record.templateData.scope !== "room") return null;
  return {
    ...record.templateData,
    id: `custom-room-${record.id}`,
    source: record.source,
    persistedId: record.id,
    campusId: record.campusId,
    createdBy: record.createdBy,
    name: record.name,
    description: record.description,
    category: record.category as RoomTemplateCategory,
  } as RoomTemplateDefinition;
}

export function customFloorTemplateDefinition(record: CustomTemplateRecord): FloorTemplateDefinition | null {
  if (record.scope !== "floor" || record.templateData.scope !== "floor") return null;
  return {
    ...record.templateData,
    id: `custom-floor-${record.id}`,
    source: record.source,
    persistedId: record.id,
    campusId: record.campusId,
    createdBy: record.createdBy,
    name: record.name,
    description: record.description,
    category: record.category as FloorTemplateDefinition["category"],
  } as FloorTemplateDefinition;
}

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rowToRecord(row: MapTemplateRow): CustomTemplateRecord | null {
  if (row.source_scope !== "campus" && row.source_scope !== "shared") return null;
  const data = asRecord(row.template_data);
  if (row.scope !== "room" && row.scope !== "floor") return null;
  if (typeof data.id !== "string" || data.scope !== row.scope) return null;
  if (templatePayloadContainsNavigation(data)) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    scope: row.scope,
    category: row.category,
    source: row.source_scope,
    campusId: row.campus_id,
    createdBy: row.created_by,
    templateData: data as unknown as RoomTemplateDefinition | FloorTemplateDefinition,
    previewMetadata: row.preview_metadata && typeof row.preview_metadata === "object" && !Array.isArray(row.preview_metadata)
      ? row.preview_metadata as Record<string, unknown>
      : null,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("You must be signed in as an administrator to manage templates.");
  return id;
}

export async function listCustomTemplates(params: { campusId: string; scope?: "room" | "floor" }): Promise<CustomTemplateRecord[]> {
  const client = getSupabase();
  let query = client
    .from("map_templates")
    .select("*")
    .eq("is_archived", false)
    .or(`source_scope.eq.shared,campus_id.eq.${params.campusId}`)
    .order("created_at", { ascending: false });
  if (params.scope) query = query.eq("scope", params.scope);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load custom templates: ${error.message}`);
  return (data ?? []).map(rowToRecord).filter((record): record is CustomTemplateRecord => !!record);
}

async function insertTemplate(input: {
  campusId: string;
  metadata: TemplateMetadataInput;
  definition: RoomTemplateDefinition | FloorTemplateDefinition;
}): Promise<CustomTemplateRecord> {
  const createdBy = await currentUserId();
  const row: TablesInsert<"map_templates"> = {
    name: input.metadata.name.trim(),
    description: input.metadata.description?.trim() || null,
    scope: input.definition.scope,
    category: input.metadata.category,
    source_scope: input.metadata.source,
    campus_id: input.metadata.source === "campus" ? input.campusId : null,
    created_by: createdBy,
    template_data: input.definition as unknown as Json,
    preview_metadata: {
      width: input.definition.width,
      height: input.definition.height,
      scope: input.definition.scope,
    },
  };
  const { data, error } = await getSupabase().from("map_templates").insert(row).select("*").single();
  if (error || !data) throw new Error(`Unable to save template: ${error?.message ?? "No template was returned."}`);
  const record = rowToRecord(data);
  if (!record) throw new Error("Saved template payload was invalid.");
  return record;
}

export async function saveRoomTemplate(params: {
  campusId: string;
  room: FloorPlan["rooms"][number];
  floor: Pick<FloorPlan, "walls" | "furniture">;
  metadata: TemplateMetadataInput;
}): Promise<CustomTemplateRecord> {
  const definition = sanitizeRoomForTemplate(params.room, params.floor, params.metadata, params.campusId);
  return insertTemplate({ campusId: params.campusId, metadata: params.metadata, definition });
}

export async function saveFloorTemplate(params: {
  campusId: string;
  floor: FloorPlan;
  metadata: TemplateMetadataInput;
}): Promise<CustomTemplateRecord> {
  const definition = sanitizeFloorForTemplate(params.floor, params.metadata, params.campusId);
  return insertTemplate({ campusId: params.campusId, metadata: params.metadata, definition });
}

export async function updateCustomTemplateMetadata(params: {
  id: string;
  campusId: string;
  name: string;
  description?: string;
  category: string;
  source: CustomTemplateSource;
}): Promise<void> {
  const name = validateTemplateName(params.name);
  const userId = await currentUserId();
  const { error } = await getSupabase().from("map_templates").update({
    name,
    description: params.description?.trim() || null,
    category: params.category,
    source_scope: params.source,
    campus_id: params.source === "campus" ? params.campusId : null,
    updated_at: new Date().toISOString(),
  }).eq("id", params.id).eq("created_by", userId);
  if (error) throw new Error(`Unable to update template: ${error.message}`);
}

export async function archiveCustomTemplate(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await getSupabase().from("map_templates").update({
    is_archived: true,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("created_by", userId);
  if (error) throw new Error(`Unable to archive template: ${error.message}`);
}

export const templateService = {
  list: listCustomTemplates,
  saveRoom: saveRoomTemplate,
  saveFloor: saveFloorTemplate,
  updateMetadata: updateCustomTemplateMetadata,
  archive: archiveCustomTemplate,
};
