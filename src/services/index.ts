// ── Core ─────────────────────────────────────────────────────────────────
export { createCrudService, seedMockData, getCrudService } from "./crud";
export { validateSupabaseConfig, supabaseUrl, supabaseAnonKey, isSupabaseConnected } from "./supabase";
export type * from "./types";

// ── Entity services ───────────────────────────────────────────────────────
export { buildingService } from "./buildingService";
export { userService } from "./userService";
export { announcementService } from "./announcementService";
export { reportService } from "./reportService";
export { locationService } from "./locationService";
export { routeService } from "./routeService";
export { eventService } from "./eventService";
export { settingsService } from "./settingsService";
export { campusService } from "./campusService";
