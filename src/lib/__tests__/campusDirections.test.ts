import { describe, expect, it } from "vitest";
import { campusLocationQuery, googleCampusDirectionsUrl, googleCampusPlaceUrl, validatedGoogleMapsUrl, type CampusLocation } from "../campusDirections";

const campus = (overrides: Partial<CampusLocation> = {}): CampusLocation => ({
  id: "a", name: "Campus A", address: "123 Main Road", city: "Valenzuela", province: "Metro Manila", postalCode: "1440", ...overrides,
});

describe("published campus directions", () => {
  it("prefers valid coordinates and falls back to a published address", () => {
    expect(campusLocationQuery(campus({ coordinates: { lat: 14.7, lng: 120.9 } }))).toBe("14.7,120.9");
    expect(campusLocationQuery(campus())).toBe("123 Main Road, Valenzuela, Metro Manila, 1440");
    expect(campusLocationQuery(campus({ address: "", city: "", province: "", postalCode: "" }))).toBeNull();
  });

  it("builds directions to a campus or between two campuses", () => {
    const destination = campus({ id: "b", coordinates: { lat: 14.71, lng: 120.97 } });
    const one = new URL(googleCampusDirectionsUrl(destination)!);
    expect(one.searchParams.get("destination")).toBe("14.71,120.97");
    expect(one.searchParams.get("api")).toBe("1");
    const interCampus = new URL(googleCampusDirectionsUrl(destination, campus({ coordinates: { lat: 14.6, lng: 120.8 } }))!);
    expect(interCampus.searchParams.get("origin")).toBe("14.6,120.8");
    expect(interCampus.searchParams.get("destination")).toBe("14.71,120.97");
    expect(googleCampusDirectionsUrl(campus({ address: "", city: "", province: "", postalCode: "" }))).toBeNull();
  });

  it("opens a campus place separately from route planning", () => {
    const place = new URL(googleCampusPlaceUrl(campus({ coordinates: { lat: 14.7, lng: 120.9 } }))!);
    expect(place.pathname).toBe("/maps/search/");
    expect(place.searchParams.get("query")).toBe("14.7,120.9");
    expect(place.searchParams.has("destination")).toBe(false);
    const address = new URL(googleCampusPlaceUrl(campus())!);
    expect(address.searchParams.get("query")).toBe("Campus A, 123 Main Road, Valenzuela, Metro Manila, 1440");
  });

  it("uses a campus name and address when published coordinates are invalid", () => {
    const url = new URL(googleCampusPlaceUrl(campus({ coordinates: { lat: 95, lng: 500 } }))!);
    expect(url.searchParams.get("query")).toBe("Campus A, 123 Main Road, Valenzuela, Metro Manila, 1440");
  });

  it("accepts only HTTPS Google Maps links", () => {
    expect(validatedGoogleMapsUrl("https://www.google.com/maps/place/example")).toContain("google.com/maps");
    expect(validatedGoogleMapsUrl("javascript:alert(1)")).toBeNull();
    expect(validatedGoogleMapsUrl("https://google.com.attacker.example/maps")).toBeNull();
    expect(validatedGoogleMapsUrl("http://maps.google.com/...")).toBeNull();
  });
});
