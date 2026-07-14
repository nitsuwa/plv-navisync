export interface Building {
  id: string;
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
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: "general" | "academic" | "event" | "emergency" | "maintenance";
  priority: "low" | "normal" | "high" | "urgent";
  published_at: string;
  expires_at?: string;
  author: string;
  is_active: boolean;
}

export interface CampusLocation {
  id: string;
  name: string;
  type: "entrance" | "parking" | "landmark" | "restroom" | "canteen" | "atm" | "clinic";
  description?: string;
  latitude?: number;
  longitude?: number;
  building_id?: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
}

export interface DashboardStats {
  total_buildings: number;
  total_announcements: number;
  total_locations: number;
  active_announcements: number;
}
