import type {
  CampusEventOverlay,
  EventLocationRef,
  EventOverlayLocation,
  FloorFurniture,
  FloorLabel,
} from "../components/map-builder/types";

/** A stable key for de-duplicating location requests and matching saves. */
export function eventLocationKey(locationRef: EventLocationRef): string {
  if (locationRef.type === "campus") return "campus";
  return [locationRef.buildingId, locationRef.floorId, locationRef.roomId]
    .filter(Boolean)
    .join("-") || locationRef.label.trim().toLowerCase().replace(/\s+/g, "-");
}

function locationId(locationRef: EventLocationRef): string {
  return `location-${eventLocationKey(locationRef)}`;
}

/**
 * Reads both the current multi-location shape and the legacy one-location
 * shape. The returned arrays are safe for the editor to update independently.
 */
export function normalizeEventOverlayLocations(
  overlay: Pick<CampusEventOverlay, "locations" | "locationRef" | "eventFurniture" | "eventLabels">
): EventOverlayLocation[] {
  if (overlay.locations?.length) {
    return overlay.locations.map((location) => ({
      ...location,
      eventFurniture: [...(location.eventFurniture || [])],
      eventLabels: [...(location.eventLabels || [])],
    }));
  }

  if (!overlay.locationRef) return [];

  return [{
    id: locationId(overlay.locationRef),
    locationRef: overlay.locationRef,
    eventFurniture: [...(overlay.eventFurniture || [])],
    eventLabels: [...(overlay.eventLabels || [])],
  }];
}

export function countEventOverlayItems(
  locations: EventOverlayLocation[]
): { furniture: number; labels: number } {
  return locations.reduce(
    (total, location) => ({
      furniture: total.furniture + location.eventFurniture.length,
      labels: total.labels + location.eventLabels.length,
    }),
    { furniture: 0, labels: 0 }
  );
}

export function replaceEventOverlayLocation(
  locations: EventOverlayLocation[],
  locationId: string,
  eventFurniture: FloorFurniture[],
  eventLabels: FloorLabel[]
): EventOverlayLocation[] {
  return locations.map((location) => location.id === locationId
    ? { ...location, eventFurniture: [...eventFurniture], eventLabels: [...eventLabels] }
    : location
  );
}
