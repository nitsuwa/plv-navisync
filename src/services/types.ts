// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE ENTITY TYPES
// ═══════════════════════════════════════════════════════════════════════════
// These mirror the expected Supabase schema. Use them when querying the DB.
// Map Builder types (map-builder/types.ts) are the authoring types; these
// are the persistence types.
// ═══════════════════════════════════════════════════════════════════════════

// ── User ──────────────────────────────────────────────────────────────────
export interface DbUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "faculty" | "staff" | "moderator";
  department: string;
  status: "active" | "inactive";
  last_login: string | null;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// ── Building ───────────────────────────────────────────────────────────────
export interface DbBuilding {
  id: string;
  campus_id: string;
  name: string;
  code: string;
  description: string;
  category: "academic" | "admin" | "facility" | "sports" | "dormitory";
  floor_count: number;
  image_url?: string;
  latitude?: number;
  longitude?: number;
  departments?: string[];
  operating_hours?: string;
  contact?: string;
  created_at: string;
  updated_at: string;
}

// ── Announcement ───────────────────────────────────────────────────────────
export interface DbAnnouncement {
  id: string;
  title: string;
  content: string;
  category: "general" | "academic" | "event" | "emergency" | "maintenance";
  priority: "low" | "normal" | "high" | "urgent";
  published_at: string;
  expires_at?: string;
  author: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Campus Location (Asset) ────────────────────────────────────────────────
export interface DbCampusLocation {
  id: string;
  name: string;
  type: "entrance" | "parking" | "landmark" | "restroom" | "canteen" | "atm" | "clinic";
  description?: string;
  latitude?: number;
  longitude?: number;
  building_id?: string;
  created_at: string;
  updated_at: string;
}

// ── Report ─────────────────────────────────────────────────────────────────
export interface DbReport {
  id: string;
  type: string;
  building: string;
  location_detail: string;
  description: string;
  reporter: string;
  status: "pending" | "investigating" | "approved" | "rejected" | "resolved";
  has_image: boolean;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

// ── Navigation Route ───────────────────────────────────────────────────────
export interface DbNavigationRoute {
  id: string;
  campus_id: string;
  name: string;
  description?: string;
  from_marker_id: string;
  to_marker_id: string;
  waypoints: { x: number; y: number }[];
  distance_m: number;
  duration_min: number;
  type: "walking" | "accessible" | "emergency";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Campus Event ───────────────────────────────────────────────────────────
export interface DbCampusEvent {
  id: string;
  campus_id: string;
  title: string;
  description: string;
  venue: string;
  date_start: string;
  date_end: string;
  status: "draft" | "scheduled" | "active" | "ended";
  marker_count: number;
  organizer: string;
  affected_areas: string[];
  temp_features: string[];
  created_at: string;
  updated_at: string;
}

// ── Settings ────────────────────────────────────────────────────────────────
export interface DbSetting {
  id: string;
  key: string;
  value: any;
  updated_at: string;
}

// ── Pagination ─────────────────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
