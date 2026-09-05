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
import { resolveActiveCampusId } from "./campusService";
import { logActivity } from "./activityLogService";
import type {
  CampusEventOverlay,
  FloorFurniture,
  FloorLabel,
} from "../components/map-builder/types";

// ── Types ───────────────────────────────────────────────────────────────────

export type EventOverlayStatus = "pending" | "approved" | "disapproved";

export interface EventOverlayInput {
  title: string;
  description?: string;
  dateStart: string;
  dateEnd: string;
  organizer: string;
  locationRef?: CampusEventOverlay["locationRef"];
  eventFurniture?: FloorFurniture[];
  eventLabels?: FloorLabel[];
  posterUrl?: string;
}

export interface EventOverlayFilters {
  status?: EventOverlayStatus | "all";
  search?: string;
  createdByUserId?: string;
}

// ── Mock fallback data ──────────────────────────────────────────────────────

const MOCK_OVERLAYS: CampusEventOverlay[] = [
  {
    id: "ev-mock-1",
    title: "Student Council Fair",
    description: "Annual student org fair with booths and activities",
    dateStart: new Date(Date.now() + 86400000 * 2).toISOString(),
    dateEnd: new Date(Date.now() + 86400000 * 2 + 14400000).toISOString(),
    organizer: "Student Council",
    markers: [{ x: 200, y: 150, color: "#f59e0b", label: "Main Stage" }],
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
  id: string
): CampusEventOverlay {
  return {
    id,
    title: (metadata.title as string) || "Untitled Event",
    description: (metadata.description as string) || "",
    dateStart: (metadata.dateStart as string) || "",
    dateEnd: (metadata.dateEnd as string) || "",
    organizer: (metadata.organizer as string) || "",
    markers: (metadata.markers as CampusEventOverlay["markers"]) || [],
    locationRef: metadata.locationRef as CampusEventOverlay["locationRef"],
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
}

// ── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Create a new event overlay (called by student org users).
 * Saves the overlay as a map_element with kind "event_overlay"
 * through the campus structure save flow.
 */
export async function createEventOverlay(
  input: EventOverlayInput,
  createdByUserId: string
): Promise<CampusEventOverlay> {
  const supabase = getSupabase();
  const campusId = await resolveActiveCampusId();
  if (!campusId) throw new Error("No active campus found.");

  const id = generateId();
  const overlay: CampusEventOverlay = {
    id,
    title: input.title,
    description: input.description || "",
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    organizer: input.organizer,
    markers: [],
    locationRef: input.locationRef,
    restrictedAreas: [],
    isActive: true,
    status: "pending",
    eventFurniture: input.eventFurniture || [],
    eventLabels: input.eventLabels || [],
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
      metadata: {
        kind: "event_overlay",
        ...overlay,
      },
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
    dateStart: string;
    dateEnd: string;
    organizer: string;
    buildingId: string;
    floorNumber: number;
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

  const metadata = existing.metadata as any;
  const updatedMetadata = {
    ...metadata,
    title: input.title,
    description: input.description,
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    organizer: input.organizer,
    locationRef: {
      ...(metadata.locationRef || {}),
      type: "building",
      buildingId: input.buildingId,
      floorId: `${input.buildingId}-f${input.floorNumber}`,
    },
  };

  if (input.posterUrl !== undefined) {
    updatedMetadata.posterUrl = input.posterUrl;
  }

  const { error } = await supabase
    .from("map_elements")
    .update({ 
      name: input.title,
      metadata: updatedMetadata, 
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
  eventFurniture: FloorFurniture[],
  eventLabels: FloorLabel[]
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
    eventFurniture,
    eventLabels,
  };

  const { error } = await supabase
    .from("map_elements")
    .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
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
  eventFurniture: FloorFurniture[],
  eventLabels: FloorLabel[]
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
    ...metadata,
    eventFurniture,
    eventLabels,
    status: "pending",
    adminComment: null,
  };

  const { error } = await supabase
    .from("map_elements")
    .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
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
  const campusId = await resolveActiveCampusId();
  if (!campusId) return [];

  try {
    let query = supabase
      .from("map_elements")
      .select("id, metadata, name")
      .eq("campus_id", campusId)
      .eq("element_type", "event_overlay")
      .order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    let overlays = (data ?? []).map((row) =>
      overlayFromMetadata(
        (row.metadata as Record<string, unknown>) || {},
        row.id
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
      .select("id, metadata")
      .eq("id", overlayId)
      .eq("element_type", "event_overlay")
      .single();

    if (error || !data) return null;
    return overlayFromMetadata(
      (data.metadata as Record<string, unknown>) || {},
      data.id
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
 * Filters by status=approved and checks date range.
 */
export async function getApprovedOverlaysForFloor(
  _floorId: string
): Promise<CampusEventOverlay[]> {
  const now = new Date().toISOString();
  const allOverlays = await listEventOverlays({ status: "approved" });

  return allOverlays.filter(
    (o) =>
      o.dateStart <= now &&
      o.dateEnd >= now &&
      o.locationRef?.floorId === _floorId
  );
}

/**
 * Get all active approved overlays (for campus-wide display).
 */
export async function getActiveApprovedOverlays(): Promise<
  CampusEventOverlay[]
> {
  const now = new Date().toISOString();
  const allOverlays = await listEventOverlays({ status: "approved" });

  return allOverlays.filter((o) => o.dateStart <= now && o.dateEnd >= now);
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
  getActiveApprovedOverlays,
};
