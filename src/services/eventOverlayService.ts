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
import { getSupabase } from "../lib/supabase";
import { campusService, resolveActiveCampusId } from "./campusService";
import { logActivity } from "./activityLogService";
import type {
  CampusEventOverlay,
  EventLocationRef,
  EventOverlayLocation,
  FloorFurniture,
  FloorLabel,
} from "../components/map-builder/types";
import {
  eventLocationKey,
  normalizeEventOverlayLocations,
} from "../lib/eventOverlayModel";
import { floorLookupId, publishedEventBuildingOptions } from "../lib/eventLocationData";

// ── Types ───────────────────────────────────────────────────────────────────

export type EventOverlayStatus = "pending" | "approved" | "disapproved";

export type EventOverlayLocationInput =
  | EventLocationRef
  | {
      id?: string;
      locationRef: EventLocationRef;
      eventFurniture?: FloorFurniture[];
      eventLabels?: FloorLabel[];
    };

export interface EventOverlayInput {
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

function generateId(): string {
  return `eo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Convert a Supabase campus event_overlay map_element row
 * (via metadata JSON) to a CampusEventOverlay object.
 * This is a client-side helper — the actual hydration happens
 * through the campusStructureService.
 */
function overlayFromMetadata(
  metadata: Record<string, unknown>,
  id: string,
  campusId?: string | null
): CampusEventOverlay {
  const overlay: CampusEventOverlay = {
    id,
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
    status: (metadata.status as EventOverlayStatus) || "pending",
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
    dateStart: _dateStart,
    dateEnd: _dateEnd,
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

function overlayForLocation(
  overlay: CampusEventOverlay,
  location: EventOverlayLocation
): CampusEventOverlay {
  return {
    ...overlay,
    locationRef: location.locationRef,
    eventFurniture: location.eventFurniture,
    eventLabels: location.eventLabels,
    locations: [location],
  };
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

  const id = generateId();
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
    status: "pending",
    campusId,
    eventFurniture: locations[0].eventFurniture,
    eventLabels: locations[0].eventLabels,
    posterUrl: input.posterUrl,
    createdByUserId,
  };

  // Save as a map_element with kind "event_overlay". The database generates
  // the authoritative row id — we must return it (not the temp client id)
  // so the editor route /student/events/:id/edit can find the overlay.
  const { data: inserted, error } = await supabase
    .from("map_elements")
    .insert({
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

  if (error) throw error;

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
  }
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, metadata, name")
    .eq("id", overlayId)
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  const metadata = existing.metadata as Record<string, unknown>;
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
  };

  if (input.posterUrl !== undefined) {
    updatedMetadata.posterUrl = input.posterUrl;
  }

  const { error } = await supabase
    .from("map_elements")
    .update({
      name: input.title,
      metadata: updatedMetadata as never,
      updated_at: new Date().toISOString()
    })
    .eq("id", overlayId)
    .eq("element_type", "event_overlay");

  if (error) throw error;

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
  locations: EventOverlayLocation[]
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, metadata")
    .eq("id", overlayId)
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  const metadata = existing.metadata as Record<string, unknown>;
  const updatedMetadata = applyLocationCompatibilityFields(metadata, locations);

  const { error } = await supabase
    .from("map_elements")
    .update({ metadata: updatedMetadata as never, updated_at: new Date().toISOString() })
    .eq("id", overlayId)
    .eq("element_type", "event_overlay");

  if (error) throw error;

  await logActivity({
    action: "event_overlay.update_layout",
    entityType: "event_overlay",
    entityId: overlayId,
  });
}

/**
 * Save the layout AND (re)submit it to GSO for approval.
 * Sets status back to "pending" and clears any previous admin comment.
 * Student orgs call this from the editor's "Submit to GSO" button — it must
 * never flip the overlay to "approved" (that decision belongs to the admin).
 */
export async function submitEventOverlayLayout(
  overlayId: string,
  locations: EventOverlayLocation[]
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, metadata")
    .eq("id", overlayId)
    .eq("element_type", "event_overlay")
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  const metadata = existing.metadata as Record<string, unknown>;
  const updatedMetadata = {
    ...applyLocationCompatibilityFields(metadata, locations),
    status: "pending",
    adminComment: null,
  };

  const { error } = await supabase
    .from("map_elements")
    .update({ metadata: updatedMetadata as never, updated_at: new Date().toISOString() })
    .eq("id", overlayId)
    .eq("element_type", "event_overlay");

  if (error) throw error;

  await logActivity({
    action: "event_overlay.submit",
    entityType: "event_overlay",
    entityId: overlayId,
  });
}

/**
 * List event overlays with optional filters.
 * Returns all overlays for the active campus.
 */
export async function listEventOverlays(
  filters: EventOverlayFilters = {}
): Promise<CampusEventOverlay[]> {
  const supabase = getSupabase();
  const campusId = filters.campusId ?? await resolveActiveCampusId();
  if (!campusId) return [];

  try {
    let query = supabase
      .from("map_elements")
      .select("id, campus_id, metadata, name")
      .eq("element_type", "event_overlay")
      .eq("campus_id", campusId)
      .order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    let overlays = (data ?? []).map((row) =>
      overlayFromMetadata(
        (row.metadata as Record<string, unknown>) || {},
        row.id,
        row.campus_id
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
  } catch {
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
      .select("id, campus_id, metadata")
      .eq("id", overlayId)
      .eq("element_type", "event_overlay")
      .single();

    if (error || !data) return null;
    return overlayFromMetadata(
      (data.metadata as Record<string, unknown>) || {},
      data.id,
      data.campus_id
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
  adminComment?: string
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("map_elements")
    .select("id, metadata")
    .eq("id", overlayId)
    .single();

  if (fetchError || !existing) throw new Error("Event overlay not found.");

  const metadata = existing.metadata as Record<string, unknown>;
  const updatedMetadata = {
    ...metadata,
    status: decision,
    adminComment: adminComment || undefined,
  };

  const { error } = await supabase
    .from("map_elements")
    .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
    .eq("id", overlayId)
    .eq("element_type", "event_overlay");

  if (error) throw error;

  await logActivity({
    action: `event_overlay.${decision}`,
    entityType: "event_overlay",
    entityId: overlayId,
    metadata: { status: decision, adminComment },
  });
}

/**
 * Delete an event overlay (called by admin or the creator).
 */
export async function deleteEventOverlay(overlayId: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("map_elements")
    .delete()
    .eq("id", overlayId)
    .eq("element_type", "event_overlay");

  if (error) throw error;

  await logActivity({
    action: "event_overlay.delete",
    entityType: "event_overlay",
    entityId: overlayId,
  });
}

/**
 * Get approved event overlays for a specific floor (for student map view).
 * Filters by status=approved and matches the requested floor.
 */
export async function getApprovedOverlaysForFloor(
  _floorId: string
): Promise<CampusEventOverlay[]> {
  const allOverlays = await listEventOverlays({ status: "approved" });
  return allOverlays.flatMap((overlay) =>
    normalizeEventOverlayLocations(overlay)
      .filter((location) => location.locationRef.floorId === _floorId)
      .map((location) => overlayForLocation(overlay, location))
  );
}

/**
 * Get all active approved overlays for the campus grounds.
 */
export async function getApprovedOverlaysForCampus(): Promise<
  CampusEventOverlay[]
> {
  const allOverlays = await listEventOverlays({ status: "approved" });
  return allOverlays.flatMap((overlay) =>
    normalizeEventOverlayLocations(overlay)
      .filter((location) => location.locationRef.type === "campus")
      .map((location) => overlayForLocation(overlay, location))
  );
}

/**
 * Get all active approved overlays (for campus-wide display).
 */
export async function getActiveApprovedOverlays(): Promise<
  CampusEventOverlay[]
> {
  const allOverlays = await listEventOverlays({ status: "approved" });
  return allOverlays.flatMap((overlay) =>
    normalizeEventOverlayLocations(overlay).map((location) =>
      overlayForLocation(overlay, location)
    )
  );
}

// ── Service export ──────────────────────────────────────────────────────────

export const eventOverlayService = {
  createEventOverlay,
  updateEventOverlayDetails,
  updateEventOverlayLayout,
  submitEventOverlayLayout,
  listEventOverlays,
  getEventOverlay,
  reviewEventOverlay,
  deleteEventOverlay,
  getApprovedOverlaysForFloor,
  getApprovedOverlaysForCampus,
  getActiveApprovedOverlays,
};
