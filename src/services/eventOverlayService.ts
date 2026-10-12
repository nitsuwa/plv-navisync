/**
 * eventOverlayService — manages CampusEventOverlay documents.
 *
 * Event overlays allow student orgs to lay out event-specific items
 * (booths, tents, stages) on top of the existing campus map without
 * modifying the base map. Admins can approve or disapprove layouts.
 *
 * Data is persisted through the campus structure serialize/hydrate flow
 * (map_element kind "event_overlay") — no new DB tables required.
 */
import type { Json } from "../types/database.generated";
import { getSupabase } from "../lib/supabase";
import { countOpenFeedbackPins } from "../lib/eventFeedbackPins";
import { stableEventJson } from "../lib/stableEventJson";
import { genId } from "../components/map-builder/constants";
import { campusService, resolveActiveCampusId } from "./campusService";
import { logActivity } from "./activityLogService";
import type {
  CampusEventOverlay,
  EventLocationRef,
  EventOverlayLocation,
  FloorFurniture,
  FloorLabel,
} from "../components/map-builder/types";
import type { EventPublicationCommand, PublicEventFeed, PublicEventPreview } from "../types/eventPreview";
import {
  eventLocationKey,
  normalizeEventOverlayLocations,
} from "../lib/eventOverlayModel";
import { floorLookupId, publishedEventBuildingOptions } from "../lib/eventLocationData";
import { prepareEventReuseRequest } from "../lib/eventOrganizationReuse";
import type { EventOrganizationContext } from "../types/eventOrganization";

import { getStudentEventPhase, isValidEventInstant, validateEventDates } from "../lib/eventPublication";

// ── Types ───────────────────────────────────────────────────────────────────

export type EventOverlayStatus = "draft" | "pending" | "approved" | "disapproved";

export type EventOverlayLocationInput =
  | EventLocationRef
  | {
      id?: string;
      locationRef: EventLocationRef;
      eventFurniture?: FloorFurniture[];
      eventLabels?: FloorLabel[];
    };

export interface EventOverlayInput {
  requestId?: string;
  organization?: import('../types/eventOrganization').EventOrganizationContext;
  title: string;
  description?: string;
  organizer: string;
  locations: EventOverlayLocationInput[];
  posterUrl?: string;
}

export interface EventOverlayFilters {
  status?: EventOverlayStatus | "all";
  search?: string;
  createdByUserId?: string;
  campusId?: string;
  strict?: boolean;
  allCampuses?: boolean;
  organizationId?: string;
}

// ── Mock fallback data ──────────────────────────────────────────────────────

const MOCK_OVERLAYS: CampusEventOverlay[] = [
  {
    id: "ev-mock-1",
    title: "Student Council Fair",
    description: "Annual student org fair with booths and activities",
    organizer: "Student Council",
    markers: [{ x: 200, y: 150, color: "#f59e0b", label: "Main Stage" }],
    locations: [
      {
        id: "campus-grounds",
        locationRef: { type: "campus", label: "Campus Grounds" },
        eventFurniture: [],
        eventLabels: [],
      },
    ],
    restrictedAreas: [],
    isActive: true,
    status: "approved",
    eventFurniture: [],
    eventLabels: [],
    createdByUserId: "mock-user-1",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a Supabase campus event_overlay map_element row
 * (via metadata JSON) to a CampusEventOverlay object.
 * This is a client-side helper — the actual hydration happens
 * through the campusStructureService.
 */
function overlayFromMetadata(
  metadata: Record<string, unknown>,
  id: string,
  campusId?: string | null,
  updatedAt?: string | null,
  organizationId?: string | null,
  createdAt?: string | null,
): CampusEventOverlay {
  const legacyUi = isRecord(metadata.ui) ? metadata.ui : {};
  const field = (key: string): unknown => metadata[key] ?? legacyUi[key];
  const overlay: CampusEventOverlay = {
    id,
    organizationId: organizationId || undefined,
    createdAt: createdAt || undefined,
    academicYear: typeof field("academicYear")==='string'?field("academicYear") as string:undefined,
    updatedAt: updatedAt || undefined,
    campusId: campusId || undefined,
    title: typeof field("title")==='string'?field("title") as string:"Untitled Event",
    description: typeof field("description")==='string'?field("description") as string:"",
    dateStart: field("dateStart") as string | undefined,
    dateEnd: field("dateEnd") as string | undefined,
    organizer: typeof field("organizer")==='string'?field("organizer") as string:"",
    markers: (field("markers") as CampusEventOverlay["markers"]) || [],
    locationRef: field("locationRef") as CampusEventOverlay["locationRef"],
    locations: field("locations") as EventOverlayLocation[] | undefined,
    restrictedAreas:
      (field("restrictedAreas") as CampusEventOverlay["restrictedAreas"]) || [],
    isActive: (field("isActive") as boolean) ?? true,
    status: (["draft", "pending", "approved", "disapproved"].includes(String(field("status"))) ? field("status") : "draft") as EventOverlayStatus,
    lastEditedAt: typeof field("lastEditedAt") === "string" ? field("lastEditedAt") as string : undefined,
    revision: typeof field("revision") === "number" ? field("revision") as number : undefined,
    submittedAt: typeof field("submittedAt") === "string" ? field("submittedAt") as string : undefined,
    publicationAt: field("publicationAt") as string | undefined,
    locationFeedback: field("locationFeedback") as Record<string, string> | undefined,
    feedbackResolutions: field("feedbackResolutions") as CampusEventOverlay["feedbackResolutions"],
    adminComment: field("adminComment") as string | undefined,
    eventFurniture: (field("eventFurniture") as FloorFurniture[]) || [],
    eventLabels: (field("eventLabels") as FloorLabel[]) || [],
    posterUrl: field("posterUrl") as string | undefined,
    createdByUserId: field("createdByUserId") as string | undefined,
  };
  return {
    ...overlay,
    locations: normalizeEventOverlayLocations(overlay),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePublicLocations(value: unknown): EventOverlayLocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.locationRef)) return [];
    const ref = entry.locationRef;
    if (!(["campus", "building", "room"] as unknown[]).includes(ref.type) || typeof ref.label !== "string") return [];
    const locationRef: EventLocationRef = {
      type: ref.type as EventLocationRef["type"],
      label: ref.label,
      ...(typeof ref.buildingId === "string" ? { buildingId: ref.buildingId } : {}),
      ...(typeof ref.floorId === "string" ? { floorId: ref.floorId } : {}),
      ...(typeof ref.roomId === "string" ? { roomId: ref.roomId } : {}),
    };
    const eventFurniture: FloorFurniture[] = Array.isArray(entry.eventFurniture) ? entry.eventFurniture.flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.type !== "string" || typeof item.name !== "string" || typeof item.category !== "string") return [];
      const x = finiteNumber(item.x), y = finiteNumber(item.y), width = finiteNumber(item.width), height = finiteNumber(item.height), rotation = finiteNumber(item.rotation);
      if (x === null || y === null || width === null || height === null || rotation === null || typeof item.color !== "string") return [];
      const assetConfig = isRecord(item.assetConfig) && typeof item.assetConfig.style === "string"
        ? { style: item.assetConfig.style }
        : undefined;
      return [{
        id: item.id, type: item.type, name: item.name, category: item.category, x, y, width, height, rotation, color: item.color,
        ...(typeof item.assetKey === "string" ? { assetKey: item.assetKey } : {}),
        ...(typeof item.assetVariant === "string" ? { assetVariant: item.assetVariant } : {}),
        ...(assetConfig ? { assetConfig } : {}),
        ...(typeof item.flipX === "boolean" ? { flipX: item.flipX } : {}),
        ...(typeof item.flipY === "boolean" ? { flipY: item.flipY } : {}),
        ...(typeof item.layer === "string" ? { layer: item.layer } : {}),
        ...(finiteNumber(item.zOrder) !== null ? { zOrder: finiteNumber(item.zOrder)! } : {}),
        ...(typeof item.visible === "boolean" ? { visible: item.visible } : {}),
      }];
    }) : [];
    const eventLabels: FloorLabel[] = Array.isArray(entry.eventLabels) ? entry.eventLabels.flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.text !== "string" || typeof item.color !== "string") return [];
      const x = finiteNumber(item.x), y = finiteNumber(item.y), fontSize = finiteNumber(item.fontSize), rotation = finiteNumber(item.rotation);
      if (x === null || y === null || fontSize === null || rotation === null) return [];
      return [{
        id: item.id, text: item.text, color: item.color, x, y, fontSize, rotation,
        ...(item.align === "center" || item.align === "right" || item.align === "left" ? { align: item.align } : {}),
        ...(finiteNumber(item.zOrder) !== null ? { zOrder: finiteNumber(item.zOrder)! } : {}),
        ...(typeof item.visible === "boolean" ? { visible: item.visible } : {}),
      }];
    }) : [];
    return [{
      id: typeof entry.id === "string" && entry.id ? entry.id : `location-${index + 1}`,
      locationRef,
      eventFurniture,
      eventLabels,
    }];
  });
}

function parsePublicPreview(value: unknown, requestedCampusId: string, serverNowMs: number): PublicEventPreview | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || value.campusId !== requestedCampusId ||
      typeof value.title !== "string" || typeof value.organizer !== "string" ||
      value.status !== "approved" || value.isActive !== true ||
      typeof value.dateStart !== "string" || typeof value.dateEnd !== "string" || typeof value.publicationAt !== "string") return null;
  const locations = parsePublicLocations(value.locations);
  if (locations.length === 0) return null;
  const markers = Array.isArray(value.markers) ? value.markers.flatMap((marker) => {
    if (!isRecord(marker) || typeof marker.label !== "string" || typeof marker.color !== "string") return [];
    const x = finiteNumber(marker.x), y = finiteNumber(marker.y);
    return x === null || y === null ? [] : [{ x, y, label: marker.label, color: marker.color }];
  }) : [];
  const preview: PublicEventPreview = {
    id: value.id,
    campusId: requestedCampusId,
    title: value.title,
    description: typeof value.description === "string" ? value.description : "",
    organizer: value.organizer,
    posterUrl: typeof value.posterUrl === "string" ? value.posterUrl : undefined,
    markers,
    status: "approved",
    isActive: true,
    dateStart: value.dateStart,
    dateEnd: value.dateEnd,
    publicationAt: value.publicationAt,
    locations,
  };
  const phase = getStudentEventPhase(preview, serverNowMs);
  return phase === "upcoming" || phase === "ongoing" ? preview : null;
}

function compatibilityPreview(event: PublicEventPreview, location: EventOverlayLocation): CampusEventOverlay {
  return {
    id: event.id,
    campusId: event.campusId,
    title: event.title,
    description: event.description,
    organizer: event.organizer,
    markers: event.markers,
    locationRef: location.locationRef,
    locations: [location],
    restrictedAreas: [],
    status: "approved",
    isActive: true,
    dateStart: event.dateStart,
    dateEnd: event.dateEnd,
    publicationAt: event.publicationAt,
    eventFurniture: location.eventFurniture,
    eventLabels: location.eventLabels,
    posterUrl: event.posterUrl,
  };
}

function createLocationEntries(
  locations: EventOverlayInput["locations"]
): EventOverlayLocation[] {
  const seen = new Set<string>();
  return locations.map((locationInput) => {
    const location = "locationRef" in locationInput ? locationInput : { locationRef: locationInput };
    const key = eventLocationKey(location.locationRef);
    if (seen.has(key)) throw new Error("Each requested event location must be unique.");
    seen.add(key);
    return {
      id: location.id || `location-${key}`,
      locationRef: location.locationRef,
      eventFurniture: [...(location.eventFurniture || [])],
      eventLabels: [...(location.eventLabels || [])],
    };
  });
}

function stripLegacyDateAndLayoutFields(metadata: Record<string, unknown>) {
  const {
    locationRef: _locationRef,
    eventFurniture: _eventFurniture,
    eventLabels: _eventLabels,
    ...rest
  } = metadata;
  return rest;
}

function applyLocationCompatibilityFields(
  metadata: Record<string, unknown>,
  locations: EventOverlayLocation[]
): Record<string, unknown> {
  const first = locations[0];
  return {
    ...stripLegacyDateAndLayoutFields(metadata),
    locations,
    locationRef: first?.locationRef,
    eventFurniture: first?.eventFurniture || [],
    eventLabels: first?.eventLabels || [],
  };
}

async function validateSavedLocations(campusId: string | null | undefined, locations: EventOverlayLocation[]): Promise<void> {
  if (!campusId) return;
  if (!locations.length) throw new Error("At least one event location is required.");
  const campus = (await campusService.listPublishedSnapshots()).find(snapshot => snapshot.id === campusId);
  if (!campus) throw new Error("The event campus is no longer published. Refresh before saving.");
  const buildings = publishedEventBuildingOptions(campus);
  const keys = new Set<string>();
  for (const location of locations) {
    const key = eventLocationKey(location.locationRef);
    if (keys.has(key)) throw new Error("Each requested event location must be unique.");
    keys.add(key);
    if (location.locationRef.type === "campus") continue;
    const building = buildings.find(b => b.buildingId === location.locationRef.buildingId);
    if (!building?.floors.some(f => floorLookupId(building.buildingId, f.number) === location.locationRef.floorId)) throw new Error(`Location “${location.locationRef.label}” is no longer published.`);
  }
}

// ── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Create a new event overlay (called by student org users).
 * Saves the overlay as a map_element with kind "event_overlay"
 * through the campus structure save flow.
 */
export async function createEventOverlay(
  input: EventOverlayInput,
  createdByUserId: string,
  campusId: string
): Promise<CampusEventOverlay> {
  const supabase = getSupabase();
  if (!campusId.trim()) throw new Error("A published campus must be selected.");

  const locations = createLocationEntries(input.locations);
  if (locations.length === 0) throw new Error("At least one event location is required.");

  // Revalidate against a fresh published snapshot so an outdated modal cannot
  // create a proposal for a campus or floor that has since been unpublished.
  const publishedCampus = (await campusService.listPublishedSnapshots())
    .find((campus) => campus.id === campusId);
  if (!publishedCampus) {
    throw new Error("The selected published campus is no longer available. Refresh the campus map and try again.");
  }

  const availableBuildings = publishedEventBuildingOptions(publishedCampus);
  for (const { locationRef } of locations) {
    if (locationRef.type === "campus") continue;
    const building = availableBuildings.find((option) => option.buildingId === locationRef.buildingId);
    const floor = building?.floors.find((option) =>
      floorLookupId(building.buildingId, option.number) === locationRef.floorId
    );
    if (!building || !floor) {
      throw new Error(`The requested event location “${locationRef.label}” is no longer available on the published campus. Refresh locations and try again.`);
    }
  }

  // Use the shared Map Builder UUID identity source for the event and its row.
  const id = input.requestId ?? genId("event-overlay");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid creation attempt. Close and reopen the proposal.');
  if(input.organization){
    const organization=input.organization;
    const {data,error}=await supabase.rpc('create_organization_event',{
      p_event_id:id,p_organization_id:organization.organizationId,p_expected_grant_id:organization.grantId,
      p_campus_id:campusId,p_academic_year:organization.academicYear,
      p_metadata:{title:input.title,description:input.description??'',locations,...(input.posterUrl?{posterUrl:input.posterUrl}:{})} as unknown as Json,
    });
    if(error)throw eventCommandError(error);
    const created=overlayFromAdminResult(data);
    if(created.id!==id||created.organizationId!==organization.organizationId||created.createdByUserId!==createdByUserId)throw new Error('The proposal assignment could not be confirmed. Refresh your organization events before retrying.');
    return created;
  }
  const overlay: CampusEventOverlay = {
    id,
    title: input.title,
    description: input.description || "",
    organizer: input.organizer,
    markers: [],
    locationRef: locations[0].locationRef,
    locations,
    restrictedAreas: [],
    isActive: true,
    status: "draft",
    campusId,
    eventFurniture: locations[0].eventFurniture,
    eventLabels: locations[0].eventLabels,
    posterUrl: input.posterUrl,
    createdByUserId,
  };

  // Older records generated an `eo-...` metadata ID while PostgreSQL
  // generated a separate UUID row ID. Persist one canonical ID in both places.
  const { data: inserted, error } = await supabase
    .from("map_elements")
    .insert({
      id,
      campus_id: campusId,
      element_type: "event_overlay",
      name: input.title,
      x: 0,
      y: 0,
      metadata: ({
        kind: "event_overlay",
        ...overlay,
      } as unknown) as never,
      is_visible: true,
      is_searchable: false,
      is_accessible: false,
      is_emergency_asset: false,
      z_index: 0,
      rotation: 0,
      search_keywords: [],
      style: {},
    })
    .select("id")
    .single();

  if (error) {
    // The insert may have committed before its response was lost. A stable
    // request UUID prevents a second draft; recover only the exact owned attempt.
    if (input.requestId) {
      const recovered = await supabase.from('map_elements').select('id,campus_id,metadata,updated_at').eq('id', id).maybeSingle();
      const saved = recovered.data?.metadata as Record<string, unknown> | undefined;
      if (!recovered.error && recovered.data && saved?.createdByUserId === createdByUserId && recovered.data.campus_id === campusId && saved.status === 'draft') {
        if (saved.title !== input.title || saved.organizer !== input.organizer || (saved.description ?? '') !== (input.description ?? '') || (saved.posterUrl ?? '') !== (input.posterUrl ?? '') || stableEventJson((saved.locations as EventOverlayLocation[] ?? []).map(({locationRef,eventFurniture,eventLabels}) => ({locationRef,eventFurniture,eventLabels}))) !== stableEventJson(locations.map(({locationRef,eventFurniture,eventLabels}) => ({locationRef,eventFurniture,eventLabels})))) throw new Error('This attempt already created a draft with your earlier details. Close this form and continue it from My Events.');
        return overlayFromMetadata(saved, recovered.data.id, recovered.data.campus_id, recovered.data.updated_at);
      }
    }
    throw error;
  }

  const persistedId = inserted?.id;
  if (!persistedId) throw new Error("Event overlay was not persisted.");

  const persistedOverlay: CampusEventOverlay = { ...overlay, id: persistedId };

  await logActivity({
    action: "event_overlay.create",
    entityType: "event_overlay",
    entityId: persistedId,
    metadata: { title: input.title, createdByUserId },
  });

  return persistedOverlay;
}

export async function updateEventOverlayDetails(
  overlayId: string,
  input: {
    title: string;
    description: string;
    organizer: string;
    locations: EventLocationRef[];
    posterUrl?: string;
  },
  expectedUpdatedAt?: string,
  expectedGrantId?: string,
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("*")
    .eq("id", overlayId)
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  if (expectedUpdatedAt && existing.updated_at && Date.parse(expectedUpdatedAt) !== Date.parse(existing.updated_at)) {
    throw new Error('This event changed in another session. Your form inputs are still here; reload the latest details before saving again.');
  }
  const metadata = existing.metadata as Record<string, unknown>;
  const existingStatus = (metadata.status || "draft") as EventOverlayStatus;
  if (existingStatus !== "draft" && existingStatus !== "disapproved") {
    throw new Error("This event is locked while it is awaiting or has received administrator approval.");
  }
  const previousLocations = normalizeEventOverlayLocations({
    locations: metadata.locations as EventOverlayLocation[] | undefined,
    locationRef: metadata.locationRef as EventLocationRef | undefined,
    eventFurniture: metadata.eventFurniture as FloorFurniture[] | undefined,
    eventLabels: metadata.eventLabels as FloorLabel[] | undefined,
  });
  const updatedLocations = createLocationEntries(
    input.locations.map((locationRef) => {
      const previous = previousLocations.find(
        (entry) => eventLocationKey(entry.locationRef) === eventLocationKey(locationRef)
      );
      return {
        id: previous?.id,
        locationRef,
        eventFurniture: previous?.eventFurniture,
        eventLabels: previous?.eventLabels,
      };
    })
  );
  if (updatedLocations.length === 0) throw new Error("At least one event location is required.");

  const updatedMetadata: Record<string, unknown> = {
    ...applyLocationCompatibilityFields(metadata, updatedLocations),
    title: input.title,
    description: input.description,
    organizer: input.organizer,
    status: "draft",
    submittedAt: null,
    adminComment: metadata.adminComment ?? null,
    locationFeedback: metadata.locationFeedback ?? {},
  };

  if (input.posterUrl !== undefined) {
    updatedMetadata.posterUrl = input.posterUrl;
  }

  if(existing.organization_id){
    await mutateOrganizationEvent(overlayId,expectedUpdatedAt??existing.updated_at,expectedGrantId,'details',{
      title:input.title,description:input.description,organizer:input.organizer,locations:updatedLocations,
      ...(input.posterUrl!==undefined?{posterUrl:input.posterUrl}:{}),
    } as unknown as Json);
    return;
  }

  let detailsWrite = supabase.from("map_elements")
    .update({
      name: input.title,
      metadata: updatedMetadata as never,
      updated_at: new Date().toISOString()
    })
    .eq("id", overlayId)
    .or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay");
  if (existing.updated_at) detailsWrite = detailsWrite.eq('updated_at', expectedUpdatedAt ?? existing.updated_at);
  const {data: savedDetails, error} = await detailsWrite.select('id').maybeSingle();
  if (error) throw error;
  if (!savedDetails) throw new Error('This event changed. Reload its latest details before saving again. Your form inputs are still here.');

  await logActivity({
    action: "event_overlay.update_details",
    entityType: "event_overlay",
    entityId: overlayId,
    metadata: { title: input.title },
  });
}

/**
 * Update an event overlay's event furniture and labels
 * (called by student org users when editing their layout).
 */
export async function updateEventOverlayLayout(
  overlayId: string,
  locations: EventOverlayLocation[],
  expectedUpdatedAt?: string,
  expectedGrantId?: string,
): Promise<CampusEventOverlay | undefined> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("*")
    .eq("id", overlayId)
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  if (expectedUpdatedAt && existing.updated_at && Date.parse(expectedUpdatedAt) !== Date.parse(existing.updated_at)) {
    throw new Error('This event changed in another session. Your local edits are still here; reload to review the latest saved map before saving again.');
  }

  const existingMetadata = existing.metadata as Record<string, unknown>;
  const existingStatus = (existingMetadata.status || "draft") as EventOverlayStatus;
  if(existing.organization_id){
    if(!['draft','disapproved','pending'].includes(existingStatus))throw new Error('Approved event layouts remain locked.');
    await validateSavedLocations(existing.campus_id,locations);
    return mutateOrganizationEvent(overlayId,expectedUpdatedAt??existing.updated_at,expectedGrantId,'layout',{locations} as unknown as Json);
  }
  if (existingStatus === "pending") {
    await validateSavedLocations(existing.campus_id, locations);
    const { data, error } = await supabase.rpc("save_pending_event_layout", {
      p_overlay_id: overlayId, p_expected_updated_at: expectedUpdatedAt ?? existing.updated_at, p_locations: locations as unknown as Json,
    });
    if (error) throw eventCommandError(error);
    return overlayFromAdminResult(data);
  }
  if (existingStatus !== "draft" && existingStatus !== "disapproved") {
    throw new Error("This event is locked while it is awaiting or has received administrator approval.");
  }

  await validateSavedLocations(existing.campus_id, locations);
  const metadata = existingMetadata;
  const updatedMetadata = {
    ...applyLocationCompatibilityFields(metadata, locations),
    status: "draft",
    submittedAt: null,
    adminComment: metadata.adminComment ?? null,
    locationFeedback: metadata.locationFeedback ?? {},
  };

  let write = supabase.from("map_elements")
    .update({ metadata: updatedMetadata as never, updated_at: new Date().toISOString() })
    .eq("id", overlayId).or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay");
  if (existing.updated_at) write = write.eq('updated_at', expectedUpdatedAt ?? existing.updated_at);
  const { data: savedRow, error } = await write.select('id,campus_id,metadata,updated_at').maybeSingle();
  if (error) throw error;
  if (!savedRow) throw new Error('This event changed. Retry the save to preserve your local edits.');

  await logActivity({
    action: "event_overlay.update_layout",
    campusId: existing.campus_id,
    entityType: "event_overlay",
    entityId: overlayId,
    metadata: { title: typeof metadata.title === "string" ? metadata.title : existing.name },
  });
  return overlayFromMetadata(savedRow.metadata as Record<string, unknown>, savedRow.id, savedRow.campus_id, savedRow.updated_at);
}

/**
 * Save the layout AND (re)submit it to GSO for approval.
 * Sets status back to "pending" and clears any previous admin comment.
 * Student orgs call this from the editor's "Submit to GSO" button — it must
 * never flip the overlay to "approved" (that decision belongs to the admin).
 */
export async function submitEventOverlayLayout(
  overlayId: string,
  locations: EventOverlayLocation[],
  expectedUpdatedAt?: string,
  expectedGrantId?: string,
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("*")
    .eq("id", overlayId)
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  const metadata = existing.metadata as Record<string, unknown>;
  if (!(["draft", "disapproved"] as unknown[]).includes(metadata.status || "draft")) {
    throw new Error("Only drafts or disapproved event maps can be submitted.");
  }
  if (expectedUpdatedAt && existing.updated_at && Date.parse(expectedUpdatedAt) !== Date.parse(existing.updated_at)) {
    throw new Error('This event changed in another session. Your local edits are still here; reload the latest map and feedback before submitting again.');
  }
  if (countOpenFeedbackPins(metadata.locationFeedback as Record<string, string>, metadata.feedbackResolutions as CampusEventOverlay["feedbackResolutions"]) > 0) {
    throw new Error("Address every GSO feedback pin before resubmitting.");
  }

  await validateSavedLocations(existing.campus_id, locations);
  if(existing.organization_id){
    await mutateOrganizationEvent(overlayId,expectedUpdatedAt??existing.updated_at,expectedGrantId,'submit',{locations} as unknown as Json);
    return;
  }
  const updatedMetadata = {
    ...applyLocationCompatibilityFields(metadata, locations),
    status: "pending",
    submittedAt: new Date().toISOString(),
    adminComment: null,
    locationFeedback: metadata.locationFeedback ?? {},
  };

  let write = supabase.from("map_elements")
    .update({ metadata: updatedMetadata as never, updated_at: new Date().toISOString() })
    .eq("id", overlayId).or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay");
  if (existing.updated_at) write = write.eq('updated_at', expectedUpdatedAt ?? existing.updated_at);
  const { data: submittedRow, error } = await write.select('id').maybeSingle();
  if (error) throw error;
  if (!submittedRow) throw new Error('This event changed. Review the latest feedback before submitting again.');

  await logActivity({
    action: "event_overlay.submit",
    campusId: existing.campus_id,
    entityType: "event_overlay",
    entityId: overlayId,
    metadata: { title: typeof metadata.title === "string" ? metadata.title : existing.name },
  });
}

/**
 * List event overlays with optional filters.
 * Returns all overlays for the active campus.
 */
export async function setEventFeedbackPinAddressed(overlay: CampusEventOverlay, locationId: string, pinId: string, addressed: boolean, note: string, expectedGrantId?: string): Promise<CampusEventOverlay> {
  const latest = await getEventOverlay(overlay.id);
  if (!latest || !latest.updatedAt || latest.locationFeedback?.[locationId] !== overlay.locationFeedback?.[locationId]) throw new Error("Feedback changed. Refresh before updating the checklist.");
  if(latest.organizationId&&!expectedGrantId)throw new Error('Your representative assignment is missing. Refresh the organization workspace before updating feedback.');
  const { data, error } = await getSupabase().rpc(latest.organizationId?'set_organization_event_feedback_pin_addressed':"set_event_feedback_pin_addressed", {
    p_overlay_id: overlay.id, p_expected_updated_at: latest.updatedAt, ...(latest.organizationId?{p_expected_grant_id:expectedGrantId}:{}), p_location_id: locationId,
    p_pin_id: pinId, p_addressed: addressed, p_note: note,
  });
  if (error) throw eventCommandError(error);
  return overlayFromAdminResult(data);
}

/** Admin-only identity enrichment; never added to the public event feed or saved metadata. */
export async function listEventSubmitterNames(ownerIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(ownerIds.filter(Boolean))];
  if (!ids.length) return {};
  try {
    const { data, error } = await getSupabase().from("profiles").select("id, first_name, last_name").in("id", ids);
    if (error) return {};
    return Object.fromEntries((data ?? []).flatMap(profile => {
      const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
      return name ? [[profile.id, name]] : [];
    }));
  } catch {
    return {};
  }
}

export async function listEventOverlays(
  filters: EventOverlayFilters = {}
): Promise<CampusEventOverlay[]> {
  const supabase = getSupabase();
  const campusId = filters.allCampuses ? filters.campusId : filters.campusId ?? await resolveActiveCampusId();
  if (!campusId && !filters.allCampuses) return [];

  try {
    let query = supabase
      .from("map_elements")
      .select("*")
      .or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay")
      .is("archived_at", null);
    if (campusId) query = query.eq("campus_id", campusId);
    if(filters.organizationId)query=query.eq('organization_id',filters.organizationId);
    else if (filters.createdByUserId) query = query.eq("metadata->>createdByUserId", filters.createdByUserId);
    const result = query.order("created_at", { ascending: false });

    const { data, error } = await result;
    if (error) throw error;

    let overlays = (data ?? []).map((row) =>
      overlayFromMetadata(
        (row.metadata as Record<string, unknown>) || {},
        row.id,
        row.campus_id,
        row.updated_at,
        row.organization_id,
        row.created_at,
      )
    );

    // Apply filters
    if (filters.status && filters.status !== "all") {
      overlays = overlays.filter((o) => o.status === filters.status);
    }
    if (filters.createdByUserId && !filters.organizationId) {
      overlays = overlays.filter(
        (o) => o.createdByUserId === filters.createdByUserId
      );
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      overlays = overlays.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q) ||
          o.organizer.toLowerCase().includes(q)
      );
    }

    return overlays;
  } catch (error) {
    if (filters.strict || filters.organizationId) throw error;
    if (filters.campusId) return [];
    // Fallback to mock data when not connected
    let overlays = [...MOCK_OVERLAYS];
    if (filters.status && filters.status !== "all") {
      overlays = overlays.filter((o) => o.status === filters.status);
    }
    if (filters.createdByUserId) {
      overlays = overlays.filter(
        (o) => o.createdByUserId === filters.createdByUserId
      );
    }
    return overlays;
  }
}

/**
 * Get a single event overlay by ID.
 */
export async function getEventOverlay(
  overlayId: string,
  includeArchived=false,
): Promise<CampusEventOverlay | null> {
  const supabase = getSupabase();

  if(includeArchived){
    const {data,error}=await supabase.rpc('get_organization_event',{p_event_id:overlayId});
    if(error)throw eventCommandError(error);
    return overlayFromAdminResult(data);
  }

  const { data, error } = await supabase
    .from("map_elements")
    .select("*")
    .eq("id", overlayId)
    .or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay")
    .is("archived_at", null)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) {
    if (['PGRST301','PGRST302','PGRST303'].includes(error.code) || /(?:jwt|session|token).*expired/i.test(error.message)) {
      throw new Error('Your session has expired or is no longer valid. Sign in again, then reopen this event from My Events.');
    }
    throw new Error(error.message || 'This event could not be loaded. Check your connection and try again.');
  }
  if (!data) return null;
  return overlayFromMetadata(
    (data.metadata as Record<string, unknown>) || {},
    data.id,
    data.campus_id,
    data.updated_at,
    data.organization_id,
    data.created_at,
  );
}

/**
 * Approve or disapprove an event overlay (called by admin).
 */
export async function reviewEventOverlay(
  overlayId: string,
  decision: "approved" | "disapproved",
  adminComment?: string,
  publication?: {
    expectedUpdatedAt?: string;
    dateStart?: string;
    dateEnd?: string;
    publicationMode?: "now" | "schedule";
    publicationAt?: string;
    locationFeedback?: Record<string, string>;
  }
): Promise<CampusEventOverlay> {
  if (decision !== "approved" && decision !== "disapproved") throw new Error("Invalid review decision.");
  const supabase = getSupabase();
  if (!publication?.expectedUpdatedAt) throw new Error("Refresh this event before reviewing it.");
  const dateStart = publication?.dateStart;
  const dateEnd = publication?.dateEnd;
  const publicationMode = publication.publicationMode ?? (publication.publicationAt ? "schedule" : "now");
  if (decision === "approved") {
    validateEventDates(dateStart, dateEnd);
    if (!dateStart || !dateEnd) throw new Error("Set the event start and end before approving publication.");
    if (Date.parse(dateEnd) <= Date.now()) throw new Error("The event end must be in the future.");
    if (publicationMode === "schedule" && (!publication.publicationAt || !Number.isFinite(Date.parse(publication.publicationAt)) || Date.parse(publication.publicationAt) <= Date.now())) {
      throw new Error("Choose a future publication time.");
    }
    if (publicationMode === "schedule" && publication.publicationAt && Date.parse(publication.publicationAt) >= Date.parse(dateEnd)) throw new Error("Publication must be before the event ends.");
  }
  if (decision === "disapproved" && !adminComment?.trim()) throw new Error("Add feedback before disapproving this event.");
  const { data, error } = await supabase.rpc("review_event_layout", {
    p_overlay_id: overlayId,
    p_expected_updated_at: publication.expectedUpdatedAt,
    p_decision: decision,
    p_date_start: decision === "approved" ? dateStart! : null,
    p_date_end: decision === "approved" ? dateEnd! : null,
    p_publication_mode: decision === "approved" ? publicationMode : null,
    p_publication_at: decision === "approved" && publicationMode === "schedule" ? publication.publicationAt ?? null : null,
    p_admin_comment: adminComment ?? null,
    p_location_feedback: publication?.locationFeedback ?? null,
  });
  if (error) throw eventCommandError(error);
  return overlayFromAdminResult(data);
}

function eventCommandError(error: { code?: string; message?: string }): Error {
  if (error.code === "PGRST202" || error.code === "42883" || /function.*(schema cache|does not exist)/i.test(error.message ?? "")) {
    return new Error("The event database migration is not installed. Ask the administrator to apply the event publication and revision migrations, then refresh. Your map has not been changed.");
  }
  return new Error(error.message || "The event change could not be saved. Refresh and try again.");
}

export interface EventRevision {
  id: string;
  action: string;
  createdAt: string;
  actorId: string | null;
  before: Partial<CampusEventOverlay>;
  after: Partial<CampusEventOverlay>;
}

export async function listEventRevisions(overlayId: string): Promise<EventRevision[]> {
  const { data, error } = await getSupabase().rpc("list_event_revisions", { p_overlay_id: overlayId });
  if (error) throw eventCommandError(error);
  return Array.isArray(data) ? data as unknown as EventRevision[] : [];
}

export async function withdrawEventSubmission(overlayId: string, expectedUpdatedAt: string, expectedGrantId?:string): Promise<CampusEventOverlay> {
  const supabase=getSupabase();
  const {data:existing,error:readError}=await supabase.from('map_elements').select('organization_id,updated_at').eq('id',overlayId).or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay').maybeSingle();
  if(readError)throw eventCommandError(readError);
  if(!existing)throw new Error('This event is unavailable or your access changed. Refresh the event list.');
  if(existing.organization_id){
    if(!expectedGrantId)throw new Error('Your representative assignment is missing. Refresh the organization workspace before withdrawing.');
    if(!existing.updated_at||Date.parse(existing.updated_at)!==Date.parse(expectedUpdatedAt))throw new Error('This event changed. Refresh before withdrawing the latest submission.');
    return mutateOrganizationEvent(overlayId,expectedUpdatedAt,expectedGrantId,'withdraw',{} as Json);
  }
  const { data, error } = await supabase.rpc("withdraw_event_submission", {
    p_overlay_id: overlayId, p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw eventCommandError(error);
  return overlayFromAdminResult(data);
}

function overlayFromAdminResult(value: unknown): CampusEventOverlay {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.campusId !== "string" ||
      typeof value.updatedAt !== "string" || !isRecord(value.metadata)) {
    throw new Error("The event change was not confirmed. Refresh the event list before continuing.");
  }
  return {
    ...overlayFromMetadata(value.metadata,value.id,value.campusId,value.updatedAt,
      typeof value.organizationId==='string'?value.organizationId:null,
      typeof value.createdAt==='string'?value.createdAt:null),
    creatorName:typeof value.creatorName==='string'?value.creatorName:undefined,
    archivedAt:typeof value.archivedAt==='string'?value.archivedAt:undefined,
    reusedFromEventId:typeof value.reusedFromEventId==='string'?value.reusedFromEventId:undefined,
  };
}

export interface LegacyEventReconciliationItem {
  eventId: string;
  campusId: string;
  title: string;
  status: string;
  creatorUserId: string | null;
  creatorName: string | null;
  organizerLabel: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  academicYear: string | null;
  suggestedOrganizationId: string | null;
  suggestedOrganizationName: string | null;
  validation: "academic_year_required" | "suggestion_requires_confirmation" | "ambiguous_organizer_label" | "choose_verified_organization";
}

export async function listLegacyEventReconciliation(): Promise<LegacyEventReconciliationItem[]> {
  const {data,error}=await getSupabase().rpc("admin_preview_event_organization_reconciliation");
  if(error)throw eventCommandError(error);
  if(!Array.isArray(data))throw new Error("Legacy event reconciliation could not be confirmed. Refresh and retry.");
  return data.map(value=>{
    if(!isRecord(value)||typeof value.eventId!=="string"||typeof value.campusId!=="string"||typeof value.title!=="string"||
      typeof value.status!=="string"||typeof value.createdAt!=="string"||typeof value.updatedAt!=="string"||
      !["academic_year_required","suggestion_requires_confirmation","ambiguous_organizer_label","choose_verified_organization"].includes(String(value.validation))) {
      throw new Error("Legacy event reconciliation contains an invalid row. Refresh and retry.");
    }
    return {
      eventId:value.eventId,campusId:value.campusId,title:value.title,status:value.status,
      creatorUserId:typeof value.creatorUserId==="string"?value.creatorUserId:null,
      creatorName:typeof value.creatorName==="string"?value.creatorName:null,
      organizerLabel:typeof value.organizerLabel==="string"?value.organizerLabel:null,
      createdAt:value.createdAt,updatedAt:value.updatedAt,archivedAt:typeof value.archivedAt==="string"?value.archivedAt:null,
      academicYear:typeof value.academicYear==="string"?value.academicYear:null,
      suggestedOrganizationId:typeof value.suggestedOrganizationId==="string"?value.suggestedOrganizationId:null,
      suggestedOrganizationName:typeof value.suggestedOrganizationName==="string"?value.suggestedOrganizationName:null,
      validation:value.validation as LegacyEventReconciliationItem["validation"],
    };
  });
}

export async function bindLegacyEventOrganization(input:{eventId:string;organizationId:string;academicYear:string;expectedUpdatedAt:string}):Promise<CampusEventOverlay>{
  const {data,error}=await getSupabase().rpc("admin_bind_event_organization",{
    p_event_id:input.eventId,p_organization_id:input.organizationId,p_academic_year:input.academicYear,p_expected_updated_at:input.expectedUpdatedAt,
  });
  if(error)throw eventCommandError(error);
  return overlayFromAdminResult(data);
}

export async function correctEventOrganization(input:{eventId:string;organizationId:string;academicYear:string;expectedOrganizationId:string;expectedUpdatedAt:string;reason:string}):Promise<CampusEventOverlay>{
  const {data,error}=await getSupabase().rpc("admin_correct_event_organization",{
    p_event_id:input.eventId,p_organization_id:input.organizationId,p_academic_year:input.academicYear,
    p_expected_organization_id:input.expectedOrganizationId,p_expected_updated_at:input.expectedUpdatedAt,p_reason:input.reason,
  });
  if(error)throw eventCommandError(error);
  return overlayFromAdminResult(data);
}

async function mutateOrganizationEvent(eventId:string,expectedUpdatedAt:string|undefined,expectedGrantId:string|undefined,command:string,changes:Json):Promise<CampusEventOverlay>{
  if(!expectedGrantId||!expectedUpdatedAt)throw new Error('Your representative assignment is missing or changed. Refresh the organization workspace before saving.');
  const {data,error}=await getSupabase().rpc('mutate_organization_event',{p_event_id:eventId,p_expected_updated_at:expectedUpdatedAt,p_expected_grant_id:expectedGrantId,p_command:command,p_changes:changes});
  if(error)throw eventCommandError(error);
  return overlayFromAdminResult(data);
}

export interface EventEditAccess {
  organizationId:string|null;
  grantId:string|null;
  isArchived:boolean;
  canEditContent:boolean;
  canAddressFeedback:boolean;
}
export async function getEventEditAccess(eventId:string):Promise<EventEditAccess>{
  const {data,error}=await getSupabase().rpc('get_event_edit_access',{p_event_id:eventId});
  if(error)throw eventCommandError(error);
  if(!isRecord(data)||typeof data.canEditContent!=='boolean'||typeof data.canAddressFeedback!=='boolean'||typeof data.isArchived!=='boolean')throw new Error('Event access could not be confirmed. Refresh and retry.');
  return {organizationId:typeof data.organizationId==='string'?data.organizationId:null,grantId:typeof data.grantId==='string'?data.grantId:null,isArchived:data.isArchived,canEditContent:data.canEditContent,canAddressFeedback:data.canAddressFeedback};
}
export async function listOrganizationEvents(organizationId:string,options:{academicYear?:string;search?:string;limit?:number;offset?:number;includeArchived?:boolean}={}):Promise<{events:CampusEventOverlay[];total:number}>{
  const {data,error}=await getSupabase().rpc('list_organization_events',{p_organization_id:organizationId,p_academic_year:options.academicYear??null,p_search:options.search??'',p_limit:options.limit??50,p_offset:options.offset??0,p_include_archived:options.includeArchived??false});
  if(error)throw eventCommandError(error);
  if(!isRecord(data)||!Array.isArray(data.events)||typeof data.total!=='number'||!Number.isInteger(data.total)||data.total<0)throw new Error('Event history could not be confirmed. Please retry.');
  return {events:data.events.map(overlayFromAdminResult),total:data.total};
}

export async function reuseOrganizationEvent(
  source: CampusEventOverlay,
  organization: EventOrganizationContext,
  title: string,
  requestId: string,
): Promise<CampusEventOverlay> {
  const request = prepareEventReuseRequest(source, organization, title, requestId);
  const client = getSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error("Sign in again before reusing this event layout.");
  const { data, error } = await client.rpc("reuse_organization_event", {
    p_source_id: request.sourceId,
    p_expected_source_updated_at: request.expectedSourceUpdatedAt,
    p_organization_id: request.organizationId,
    p_expected_grant_id: request.expectedGrantId,
    p_title: request.title,
    p_academic_year: request.academicYear,
    p_request_id: request.requestId,
  });
  if (error) throw eventCommandError(error);
  const created = overlayFromAdminResult(data);
  if (created.organizationId !== organization.organizationId || created.createdByUserId !== authData.user.id ||
      created.reusedFromEventId !== source.id || created.status !== "draft" || created.title !== request.title ||
      created.academicYear !== request.academicYear || created.campusId !== source.campusId ||
      created.dateStart || created.dateEnd || created.publicationAt || created.submittedAt || created.adminComment ||
      created.locationFeedback || created.feedbackResolutions) {
    throw new Error("The new draft could not be confirmed. Retry this same request safely.");
  }
  return created;
}

export async function manageEventPublication(
  overlayId: string,
  expectedUpdatedAt: string,
  command: EventPublicationCommand,
): Promise<CampusEventOverlay> {
  if (!expectedUpdatedAt) throw new Error("Refresh this event before changing publication.");
  if (command.action === "schedule" && (!isValidEventInstant(command.publicationAt) || Date.parse(command.publicationAt) <= Date.now())) {
    throw new Error("Choose a future publication time.");
  }
  const { data, error } = await getSupabase().rpc("manage_event_publication", {
    p_overlay_id: overlayId,
    p_expected_updated_at: expectedUpdatedAt,
    p_action: command.action,
    p_publication_at: command.action === "schedule" ? command.publicationAt : null,
  });
  if (error) throw eventCommandError(error);
  return overlayFromAdminResult(data);
}

const publishedPreviewRequests = new Map<string, Promise<PublicEventFeed>>();

export function listPublishedEventPreviews(campusId: string): Promise<PublicEventFeed> {
  const key = campusId.trim();
  if (!key) return Promise.reject(new Error("A published campus must be selected."));
  const existing = publishedPreviewRequests.get(key);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await getSupabase().rpc("list_published_event_previews", { p_campus_id: key });
    if (error) throw error;
    if (!isRecord(data) || typeof data.serverNow !== "string" || !isValidEventInstant(data.serverNow) || !Array.isArray(data.events)) {
      throw new Error("The event preview response is invalid. Retry to refresh the map.");
    }
    const serverNow = data.serverNow;
    const serverNowMs = Date.parse(serverNow);
    const seen = new Set<string>();
    const events = data.events.flatMap((candidate) => {
      const event = parsePublicPreview(candidate, key, serverNowMs);
      if (!event || seen.has(event.id)) return [];
      seen.add(event.id);
      return [event];
    });
    return { serverNow, events };
  })();
  publishedPreviewRequests.set(key, request);
  void request.then(
    () => { if (publishedPreviewRequests.get(key) === request) publishedPreviewRequests.delete(key); },
    () => { if (publishedPreviewRequests.get(key) === request) publishedPreviewRequests.delete(key); },
  );
  return request;
}

/**
 * Delete an event overlay (called by admin or the creator).
 */
export async function deleteEventOverlay(overlayId: string,expectedGrantId?:string): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("*")
    .eq("id", overlayId)
    .or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay")
    .maybeSingle();
  if (fetchError) throw fetchError;
  if(!existing)throw new Error('This event is unavailable or your access changed. Refresh the event list.');

  if(existing.organization_id && !expectedGrantId)throw new Error('Your representative assignment is missing. Refresh the organization workspace before deleting this event.');
  if(existing.organization_id && expectedGrantId){
    const {data,error}=await supabase.rpc('mutate_organization_event',{p_event_id:overlayId,p_expected_updated_at:existing.updated_at,p_expected_grant_id:expectedGrantId,p_command:'delete',p_changes:{}});
    if(error)throw eventCommandError(error);
    if(!isRecord(data)||data.id!==overlayId||data.deleted!==true)throw new Error('Event deletion could not be confirmed. Refresh before retrying.');
    return;
  }

  const { data:deleted,error } = await supabase
    .from("map_elements")
    .delete()
    .eq("id", overlayId)
    .or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay")
    .select('id').maybeSingle();

  if (error) throw error;
  if(!deleted)throw new Error('The event was not deleted. Your access may have changed; refresh before retrying.');

  await logActivity({
    action: "event_overlay.delete",
    campusId: existing?.campus_id,
    entityType: "event_overlay",
    entityId: overlayId,
    metadata: existing ? {
      title: typeof (existing.metadata as Record<string, unknown> | null)?.title === "string"
        ? (existing.metadata as Record<string, unknown>).title
        : existing.name,
    } : undefined,
  });
}

/**
 * Get approved event overlays for a specific floor (for student map view).
 * Filters by status=approved and matches the requested floor.
 */
export async function getApprovedOverlaysForFloor(
  floorId: string,
  campusId?: string
): Promise<CampusEventOverlay[]> {
  if (!campusId) return [];
  const feed = await listPublishedEventPreviews(campusId);
  return feed.events.flatMap((event) => event.locations
    .filter((location) => location.locationRef.floorId === floorId)
    .map((location) => compatibilityPreview(event, location)));
}

/**
 * Get all active approved overlays for the campus grounds.
 */
export async function getApprovedOverlaysForCampus(campusId?: string): Promise<
  CampusEventOverlay[]
> {
  if (!campusId) return [];
  const feed = await listPublishedEventPreviews(campusId);
  return feed.events.flatMap((event) => event.locations
    .filter((location) => location.locationRef.type === "campus")
    .map((location) => compatibilityPreview(event, location)));
}

/**
 * Get all active approved overlays (for campus-wide display).
 */
export async function getActiveApprovedOverlays(): Promise<
  CampusEventOverlay[]
> {
  const campusId = await resolveActiveCampusId();
  if (!campusId) return [];
  const feed = await listPublishedEventPreviews(campusId);
  return feed.events.flatMap((event) => event.locations.map((location) => compatibilityPreview(event, location)));
}

// ── Service export ──────────────────────────────────────────────────────────

export const eventOverlayService = {
  getEventEditAccess,
  listOrganizationEvents,
  reuseOrganizationEvent,
  listLegacyEventReconciliation,
  bindLegacyEventOrganization,
  correctEventOrganization,
  createEventOverlay,
  listEventRevisions,
  withdrawEventSubmission,
  updateEventOverlayDetails,
  updateEventOverlayLayout,
  submitEventOverlayLayout,
  setEventFeedbackPinAddressed,
  listEventOverlays,
  listEventSubmitterNames,
  getEventOverlay,
  reviewEventOverlay,
  manageEventPublication,
  listPublishedEventPreviews,
  deleteEventOverlay,
  getApprovedOverlaysForFloor,
  getApprovedOverlaysForCampus,
  getActiveApprovedOverlays,
};
