// ── Supabase table names ─────────────────────────────────────────────────
export const TABLES = {
  CAMPUSES:       "campuses",
  BUILDINGS:      "buildings",
  FLOOR_PLANS:    "floor_plans",
  FLOOR_ROOMS:    "floor_rooms",
  MARKERS:        "markers",
  PATHS:          "paths",
  ANNOUNCEMENTS:  "announcements",
  USERS:          "users",
  REPORTS:        "reports",
  LOCATIONS:      "campus_locations",
  ROUTES:         "navigation_routes",
  EVENTS:         "campus_events",
  SETTINGS:       "settings",
} as const;

// ── App-wide defaults ────────────────────────────────────────────────────
export const DEFAULTS = {
  PAGE_SIZE:      20,
  MAX_HISTORY:    30,
  SNAP_DISTANCE:  20,
  CANVAS_W:       900,
  CANVAS_H:       680,
  FLOOR_PLAN_W:   580,
  FLOOR_PLAN_H:   380,
} as const;

// ── Storage keys ──────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  THEME:          "plv-theme",
  ADMIN_AUTH:     "plv-admin-auth",
  STUDENT_AUTH:   "plv-student-auth",
  CAMPUSES:       "plv-published-campuses",
} as const;

// ── Route labels for the admin breadcrumb ─────────────────────────────────
export const ROUTE_LABELS: Record<string, string> = {
  "/admin/dashboard":     "Dashboard",
  "/admin/buildings":     "Buildings",
  "/admin/announcements": "Announcements",
  "/admin/locations":     "Campus Assets",
  "/admin/users":         "Users",
  "/admin/settings":      "Settings",
  "/admin/map-builder":   "Map Builder",
  "/admin/floor-plans":   "Floor Plans",
  "/admin/routes":        "Routes & Pathfinding",
  "/admin/reports":       "Student Reports",
  "/admin/accessibility": "Accessibility Management",
  "/admin/events":        "Event Map Management",
};
