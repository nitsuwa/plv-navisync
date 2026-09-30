import type { Campus } from "../components/map-builder/types";

/** Keep usable published maps ahead of metadata-only Coming Soon entries. */
export function studentCampusListing(published: Campus[], comingSoon: Campus[]): Campus[] {
  const activeMaps = published.filter((campus) =>
    campus.lifecycleStatus === "published" || campus.publishStatus === "published",
  );
  const sortedPublished = activeMaps
    .map((campus, index) => ({ campus, index }))
    .sort((a, b) => Number(Boolean(b.campus.isDefault)) - Number(Boolean(a.campus.isDefault)) || a.index - b.index)
    .map(({ campus }) => campus);
  const publishedIds = new Set(sortedPublished.map((campus) => campus.id));
  const upcoming = comingSoon
    .filter((campus) => campus.lifecycleStatus === "coming_soon" && !publishedIds.has(campus.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...sortedPublished, ...upcoming];
}
