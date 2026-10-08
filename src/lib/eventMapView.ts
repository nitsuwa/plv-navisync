import type { Campus, CampusBuilding, CampusEventOverlay, EventOverlayLocation, FloorPlan } from "../components/map-builder/types";
import { floorLookupId } from "./eventLocationData";
import { getStudentEventPhase } from "./eventPublication";
import type { EventMapFilter, PublicEventPreview } from "../types/eventPreview";

export type VisibleEventCard = PublicEventPreview & { phase: "upcoming" | "ongoing" };

export type ResolvedEventLocation =
  | { kind: "campus"; canvasW: number; canvasH: number }
  | { kind: "floor"; buildingId: string; floorNumber: number; floor: FloorPlan; roomId?: string };

export interface EventVenue {
  id: string;
  type: "campus" | "building";
  x: number;
  y: number;
  label: string;
  eventIds: string[];
  locations: Array<{ eventId: string; locationId: string }>;
}

export function visibleEventCards(
  events: PublicEventPreview[],
  nowMs: number,
  filter: EventMapFilter,
): VisibleEventCard[] {
  return events.flatMap((event) => {
    const phase = getStudentEventPhase(event, nowMs);
    if ((phase !== "upcoming" && phase !== "ongoing") || (filter !== "all" && filter !== phase)) return [];
    return [{ ...event, phase }];
  }).sort((a, b) => {
    if (a.phase !== b.phase) return a.phase === "ongoing" ? -1 : 1;
    if (a.phase === "upcoming" && b.phase === "upcoming") {
      const startOrder = Date.parse(a.dateStart) - Date.parse(b.dateStart);
      if (startOrder) return startOrder;
    }
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}

export function eventVenueCandidates(events: PublicEventPreview[], nowMs: number, filter: EventMapFilter, selectedEventId: string | null): VisibleEventCard[] {
  if (selectedEventId) return visibleEventCards(events, nowMs, 'all').filter(event => event.id === selectedEventId);
  return visibleEventCards(events, nowMs, filter);
}

export function resolveEventLocation(
  campus: Campus,
  locationRef: PublicEventPreview["locations"][number]["locationRef"],
): ResolvedEventLocation | null {
  if (locationRef.type === "campus") return { kind: "campus", canvasW: campus.canvasW, canvasH: campus.canvasH };
  if (!locationRef.buildingId || !locationRef.floorId) return null;
  const building = campus.buildings.find((item) => item.id === locationRef.buildingId && item.visible !== false);
  if (!building) return null;
  const floor = building.floors.find((item) => floorLookupId(building.id, item.number) === locationRef.floorId);
  if (!floor) return null;
  if (locationRef.roomId && !floor.rooms.some((room) => room.id === locationRef.roomId)) return null;
  return { kind: "floor", buildingId: building.id, floorNumber: floor.number, floor, roomId: locationRef.roomId };
}

function buildingAt(campus: Campus, building: CampusBuilding): { x: number; y: number } {
  return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
}

export function buildEventVenues(campus: Campus, events: PublicEventPreview[]): EventVenue[] {
  const venues = new Map<string, EventVenue>();
  for (const event of events) {
    for (const location of event.locations) {
      const resolved = resolveEventLocation(campus, location.locationRef);
      if (!resolved) continue;
      let id: string, type: EventVenue["type"], x: number, y: number, label: string;
      if (resolved.kind === "campus") {
        id = "campus"; type = "campus";
        const centralMonument = campus.decorAssets?.find((asset) => asset.type === "monument" && asset.visible !== false && Number.isFinite(asset.x) && Number.isFinite(asset.y));
        const authoredMarker = campus.markers.find((marker) => /grounds|plaza|quad/i.test(`${marker.type} ${marker.name}`) && Number.isFinite(marker.x) && Number.isFinite(marker.y));
        const plaza = campus.decorAssets?.find((asset) => asset.visible !== false && (asset.type === "plaza-area" || asset.groundType === "plaza") && Number.isFinite(asset.x) && Number.isFinite(asset.y));
        // Grounds is a shared campus venue, not the first event-specific stage/booth marker.
        const center = centralMonument ?? authoredMarker ?? plaza;
        x = center?.x ?? campus.canvasW / 2;
        y = center?.y ?? campus.canvasH / 2;
        label = centralMonument || plaza ? "Campus Grounds" : authoredMarker?.name || "Campus Grounds (approximate)";
      } else {
        const building = campus.buildings.find((item) => item.id === resolved.buildingId)!;
        id = `building:${building.id}`; type = "building";
        ({ x, y } = buildingAt(campus, building));
        label = building.name;
      }
      const venue = venues.get(id) ?? { id, type, x, y, label, eventIds: [], locations: [] };
      if (!venue.eventIds.includes(event.id)) venue.eventIds.push(event.id);
      venue.locations.push({ eventId: event.id, locationId: location.id });
      venues.set(id, venue);
    }
  }
  return [...venues.values()];
}

export function selectedEventLocation(
  events: PublicEventPreview[],
  eventId: string | null,
  locationId: string | null,
): { event: PublicEventPreview; location: PublicEventPreview["locations"][number] } | null {
  if (!eventId || !locationId) return null;
  const event = events.find((item) => item.id === eventId);
  const location = event?.locations.find((item) => item.id === locationId);
  return event && location ? { event, location } : null;
}

/** Follow the actual map while retaining a chosen room when several layouts share a floor. */
export function eventLocationOnMap(event: PublicEventPreview | undefined, floorId: string | null, selectedLocationId: string | null): EventOverlayLocation | null {
  const matches = (location: EventOverlayLocation) => floorId
    ? location.locationRef.type !== 'campus' && location.locationRef.floorId === floorId
    : location.locationRef.type === 'campus';
  return event?.locations.find(location => location.id === selectedLocationId && matches(location))
    ?? event?.locations.find(matches) ?? null;
}

export function toEventOverlayPreview(
  event: PublicEventPreview,
  location: EventOverlayLocation,
): CampusEventOverlay {
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
