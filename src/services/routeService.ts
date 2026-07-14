import { createCrudService, seedMockData } from "./crud";
import type { DbNavigationRoute } from "./types";

const mockRoutes: DbNavigationRoute[] = [
  { id: "r1", campus_id: "campus_plv", name: "Main Gate → MAB", description: "Primary route from main entrance", from_marker_id: "m1", to_marker_id: "m2", waypoints: [{ x: 50, y: 300 }, { x: 200, y: 100 }], distance_m: 150, duration_min: 2, type: "walking", is_active: true, created_at: "2025-01-01", updated_at: "2025-01-15" },
  { id: "r2", campus_id: "campus_plv", name: "MAB → Library", description: "Quickest path between academic buildings", from_marker_id: "m2", to_marker_id: "m3", waypoints: [{ x: 200, y: 100 }, { x: 550, y: 300 }], distance_m: 200, duration_min: 3, type: "walking", is_active: true, created_at: "2025-01-01", updated_at: "2025-01-15" },
  { id: "r3", campus_id: "campus_plv", name: "Parking → ADM Accessible", description: "Accessible route from visitor parking to admin", from_marker_id: "m4", to_marker_id: "m5", waypoints: [{ x: 380, y: 200 }, { x: 400, y: 120 }], distance_m: 80, duration_min: 1, type: "accessible", is_active: true, created_at: "2025-01-01", updated_at: "2025-01-15" },
  { id: "r4", campus_id: "campus_plv", name: "Evacuation Route A", description: "Emergency evacuation from MAB to assembly area", from_marker_id: "m2", to_marker_id: "m6", waypoints: [{ x: 200, y: 100 }, { x: 300, y: 450 }], distance_m: 300, duration_min: 4, type: "emergency", is_active: true, created_at: "2025-01-01", updated_at: "2025-01-15" },
  { id: "r5", campus_id: "campus_plv", name: "Library → SSC Accessible", description: "Accessible route from Library to Student Center", from_marker_id: "m3", to_marker_id: "m7", waypoints: [{ x: 550, y: 300 }, { x: 600, y: 420 }], distance_m: 180, duration_min: 3, type: "accessible", is_active: false, created_at: "2025-01-01", updated_at: "2025-01-15" },
];

seedMockData("navigation_routes", mockRoutes);

export const routeService = createCrudService<DbNavigationRoute>("navigation_routes");
