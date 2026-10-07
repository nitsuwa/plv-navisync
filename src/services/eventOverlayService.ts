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
): CampusEventOverlay {
  const overlay: CampusEventOverlay = {
    id,
    updatedAt: updatedAt || undefined,
    campusId: campusId || undefined,
    title: (metadata.title as string) || "Untitled Event",
    description: (metadata.description as string) || "",
    dateStart: metadata.dateStart as string | undefined,
    dateEnd: metadata.dateEnd as string | undefined,
    organizer: (metadata.organizer as string) || "",
    markers: (metadata.markers as CampusEventOverlay["markers"]) || [],
    locationRef: metadata.locationRef as CampusEventOverlay["locationRef"],
    locations: metadata.locations as EventOverlayLocation[] | undefined,
    restrictedAreas:
      (metadata.restrictedAreas as CampusEventOverlay["restrictedAreas"]) || [],
    isActive: (metadata.isActive as boolean) ?? true,
    status: (["draft", "pending", "approved", "disapproved"].includes(String(metadata.status)) ? metadata.status : "draft") as EventOverlayStatus,
    lastEditedAt: typeof metadata.lastEditedAt === "string" ? metadata.lastEditedAt : undefined,
    revision: typeof metadata.revision === "number" ? metadata.revision : undefined,
    submittedAt: typeof metadata.submittedAt === "string" ? metadata.submittedAt : undefined,
    publicationAt: metadata.publicationAt as string | undefined,
    locationFeedback: metadata.locationFeedback as Record<string, string> | undefined,
    feedbackResolutions: metadata.feedbackResolutions as CampusEventOverlay["feedbackResolutions"],
    adminComment: metadata.adminComment as string | undefined,
    eventFurniture: (metadata.eventFurniture as FloorFurniture[]) || [],
    eventLabels: (metadata.eventLabels as FloorLabel[]) || [],
    posterUrl: metadata.posterUrl as string | undefined,
    createdByUserId: metadata.createdByUserId as string | undefined,
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
  expectedUpdatedAt?: string
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, campus_id, metadata, name, updated_at")
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
  expectedUpdatedAt?: string
): Promise<CampusEventOverlay | undefined> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, campus_id, name, metadata, updated_at")
    .eq("id", overlayId)
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  if (expectedUpdatedAt && existing.updated_at && Date.parse(expectedUpdatedAt) !== Date.parse(existing.updated_at)) {
    throw new Error('This event changed in another session. Your local edits are still here; reload to review the latest saved map before saving again.');
  }

  const existingMetadata = existing.metadata as Record<string, unknown>;
  const existingStatus = (existingMetadata.status || "draft") as EventOverlayStatus;
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
  expectedUpdatedAt?: string
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, campus_id, name, metadata, updated_at")
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
export async function setEventFeedbackPinAddressed(overlay: CampusEventOverlay, locationId: string, pinId: string, addressed: boolean, note: string): Promise<CampusEventOverlay> {
  const latest = await getEventOverlay(overlay.id);
  if (!latest || !latest.updatedAt || latest.locationFeedback?.[locationId] !== overlay.locationFeedback?.[locationId]) throw new Error("Feedback changed. Refresh before updating the checklist.");
  const { data, error } = await getSupabase().rpc("set_event_feedback_pin_addressed", {
    p_overlay_id: overlay.id, p_expected_updated_at: latest.updatedAt, p_location_id: locationId,
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
      .select("id, campus_id, metadata, name, updated_at")
      .or("element_type.eq.event_overlay,metadata->>kind.eq.event_overlay");
    if (campusId) query = query.eq("campus_id", campusId);
    if (filters.createdByUserId) query = query.eq("metadata->>createdByUserId", filters.createdByUserId);
    const result = query.order("created_at", { ascending: false });

    const { data, error } = await result;
    if (error) throw error;

    let overlays = (data ?? []).map((row) =>
      overlayFromMetadata(
        (row.metadata as Record<string, unknown>) || {},
        row.id,
        row.campus_id,
        row.updated_at
      )
    );

    // Apply filters
    if (filters.status && filters.status !== "all") {
      overlays = overlays.filter((o) => o.status === filters.status);
    }
    if (filters.createdByUserId) {
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
    if (filters.strict) throw error;
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
  overlayId: string
): Promise<CampusEventOverlay | null> {
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from("map_elements")
      .select("id, campus_id, metadata, updated_at")
      .eq("id", overlayId)
      .eq("element_type", "event_overlay")
      .single();

    if (error || !data) return null;
    return overlayFromMetadata(
      (data.metadata as Record<string, unknown>) || {},
      data.id,
      data.campus_id,
      data.updated_at
    );
  } catch {
    return MOCK_OVERLAYS.find((o) => o.id === overlayId) || null;
  }
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

export async function withdrawEventSubmission(overlayId: string, expectedUpdatedAt: string): Promise<CampusEventOverlay> {
  const { data, error } = await getSupabase().rpc("withdraw_event_submission", {
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
  return overlayFromMetadata(value.metadata, value.id, value.campusId, value.updatedAt);
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
  if (error) throw error;
  return overlayFromAdminResult(data);
}

export async function listPublishedEventPreviews(campusId: string): Promise<PublicEventFeed> {
  if (!campusId.trim()) throw new Error("A published campus must be selected.");
  const { data, error } = await getSupabase().rpc("list_published_event_previews", { p_campus_id: campusId });
  if (error) throw error;
  if (!isRecord(data) || typeof data.serverNow !== "string" || !isValidEventInstant(data.serverNow) || !Array.isArray(data.events)) {
    throw new Error("The event preview response is invalid. Retry to refresh the map.");
  }
  const serverNow = data.serverNow;
  const serverNowMs = Date.parse(serverNow);
  const seen = new Set<string>();
  const events = data.events.flatMap((candidate) => {
    const event = parsePublicPreview(candidate, campusId, serverNowMs);
    if (!event || seen.has(event.id)) return [];
    seen.add(event.id);
    return [event];
  });
  return { serverNow, events };
}

/**
 * Delete an event overlay (called by admin or the creator).
 */
export async function deleteEventOverlay(overlayId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, campus_id, name, metadata")
    .eq("id", overlayId)
    .eq("element_type", "event_overlay")
    .maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("map_elements")
    .delete()
    .eq("id", overlayId)
    .eq("element_type", "event_overlay");

  if (error) throw error;

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
