import type { Campus } from "../components/map-builder/types";

export type CampusLocation = Pick<Campus, "id" | "name" | "address" | "city" | "province" | "postalCode" | "coordinates"> & {
  googleMapsUrl?: string | null;
};

export function validatedGoogleMapsUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"].includes(url.hostname.toLowerCase())) return null;
    if (!url.hostname.includes("google") && url.hostname !== "maps.app.goo.gl") return null;
    return url.toString();
  } catch { return null; }
}

export function campusLocationQuery(campus: CampusLocation): string | null {
  const { lat, lng } = campus.coordinates ?? { lat: NaN, lng: NaN };
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return `${lat},${lng}`;
  const address = [campus.address, campus.city, campus.province, campus.postalCode].filter((part) => part?.trim()).join(", ");
  return address || null;
}

export function googleCampusDirectionsUrl(destination: CampusLocation, origin?: CampusLocation): string | null {
  const destinationQuery = campusLocationQuery(destination);
  if (!destinationQuery) return null;
  const originQuery = origin ? campusLocationQuery(origin) : null;
  const url = new URL("https://www.google.com/maps/dir/");
  if (origin && !originQuery) return null;
  if (originQuery) url.searchParams.set("origin", originQuery);
  url.searchParams.set("destination", destinationQuery);
  url.searchParams.set("api", "1");
  return url.toString();
}

/** Opens the selected campus location/search in Google Maps without starting route planning. */
export function googleCampusPlaceUrl(campus: CampusLocation): string | null {
  const query = campusLocationQuery(campus);
  if (!query) return null;
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", campus.coordinates ? query : `${campus.name}, ${query}`);
  return url.toString();
}
