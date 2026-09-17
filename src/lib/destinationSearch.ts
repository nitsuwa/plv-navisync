import type { SearchResult } from "../hooks/useCampusSearch";

export type DestinationFilter = "all" | "building" | "room" | "office";

const ROOM_KINDS = new Set<SearchResult["kind"]>(["room"]);

export function filterDestinationResults(
  results: readonly SearchResult[],
  filter: DestinationFilter,
): SearchResult[] {
  if (filter === "all") return [...results];
  if (filter === "building") return results.filter((result) => result.kind === "building");
  if (filter === "office") return results.filter((result) => result.kind === "office");
  return results.filter((result) => ROOM_KINDS.has(result.kind));
}

export function searchDestinationResults(
  results: readonly SearchResult[],
  query: string,
  filter: DestinationFilter = "all",
): SearchResult[] {
  const filtered = filterDestinationResults(results, filter);
  const needle = query.trim().toLowerCase();
  if (!needle) return filtered;

  return filtered.filter((result) => [
    result.name,
    result.code,
    result.buildingName,
    result.floorLabel,
    result.description,
    result.category,
    ...result.keywords,
  ].some((value) => value?.toLowerCase().includes(needle)));
}

export function destinationKindLabel(result: SearchResult): string {
  switch (result.kind) {
    case "building":
      return "Building";
    case "room":
      return "Room";
    case "office":
      return "Office";
    case "laboratory":
      return "Laboratory";
    case "facility":
      return "Facility";
    case "marker":
      return result.category === "event" ? "Event" : "Landmark";
    default:
      return "Campus place";
  }
}

export function destinationContextLabel(result: SearchResult): string {
  const context = [result.buildingName, result.floorLabel ?? (result.floorNumber !== undefined ? `Floor ${result.floorNumber}` : undefined)]
    .filter(Boolean)
    .join(" · ");
  return context || result.code || result.description || "Campus place";
}

export function destinationResultKey(result: SearchResult): string {
  return [result.kind, result.buildingId ?? "campus", result.floorId ?? result.floorNumber ?? "ground", result.id]
    .join(":");
}
