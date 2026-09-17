export type MapSurface = "browse" | "building-details" | "floor-plan" | "route-planner" | "route-active";

export const MAP_SURFACE_EVENT = "map-surface-toggle";

export type MapBackAction = "close-search" | "close-surface" | "leave";

export function isFocusedMapSurface(surface: MapSurface): boolean {
  return surface !== "browse";
}

export function mapBackAction(surface: MapSurface, searchOpen: boolean): MapBackAction {
  if (searchOpen) return "close-search";
  return isFocusedMapSurface(surface) ? "close-surface" : "leave";
}

export function publishMapSurface(surface: MapSurface): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MAP_SURFACE_EVENT, {
    detail: { surface, open: isFocusedMapSurface(surface) },
  }));
}
