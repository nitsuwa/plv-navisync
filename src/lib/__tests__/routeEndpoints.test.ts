import { describe, expect, it } from "vitest";
import type { AssemblyPoint, CampusMarker } from "../../components/map-builder/types";
import type { SearchResult } from "../../hooks/useCampusSearch";
import { routeEndpointFromSearchResult } from "../routeEndpoints";

const gate: CampusMarker = {
  id: "gate-main",
  name: "Campus Gate",
  type: "gate",
  purpose: "general",
  navNodeId: "gate-node",
  x: 20,
  y: 40,
  color: "#2563eb",
};

const gateSearchResult: SearchResult = {
  id: gate.id,
  campusPlaceId: gate.id,
  name: gate.name,
  kind: "marker",
  category: "gate",
  accessible: true,
  keywords: ["campus gate"],
};

describe("campus place route search endpoints", () => {
  it("resolves the selected Campus Gate to its authored campus-place endpoint", () => {
    expect(routeEndpointFromSearchResult(gateSearchResult, [], [], [gate])).toEqual({
      kind: "campus-place",
      place: {
        type: "campus_place",
        campusPlaceId: "gate-main",
        label: "Campus Gate",
        code: "Campus Gate",
        nodeId: "gate-node",
        accessible: undefined,
      },
    });
  });

  it("keeps a place selectable for inspection when it has no routing anchor", () => {
    expect(routeEndpointFromSearchResult(gateSearchResult, [], [], [{ ...gate, navNodeId: undefined }])).toBeNull();
  });

  it("resolves an Assembly Point without conflating it with Campus Gate", () => {
    const point: AssemblyPoint = {
      id: "assembly-east",
      name: "East Assembly Point",
      x: 64,
      y: 80,
      navNodeId: "assembly-node",
      accessible: true,
    };
    const result: SearchResult = {
      id: point.id,
      campusPlaceId: point.id,
      name: point.name,
      kind: "destination",
      category: "assembly_point",
      accessible: true,
      keywords: ["assembly point"],
    };
    expect(routeEndpointFromSearchResult(result, [], [], [gate], [point])).toEqual({
      kind: "campus-place",
      place: {
        type: "campus_place",
        campusPlaceId: "assembly-east",
        label: "East Assembly Point",
        code: "East Assembly Point",
        nodeId: "assembly-node",
        accessible: true,
      },
    });
    expect(routeEndpointFromSearchResult(gateSearchResult, [], [], [gate], [point])?.kind).toBe("campus-place");
  });
});
