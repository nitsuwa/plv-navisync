import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

// ── Shared data types (subset of AdminMapBuilder's Campus type) ────────────

export interface SharedFloorRoom {
  id: string; name: string; type: string;
  x: number; y: number; w: number; h: number;
  description?: string; accessibility?: boolean;
}

export interface SharedFloorItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  floors?: number[];
}

export interface SharedFloorPlan {
  id: string; number: number; label: string;
  rooms: SharedFloorRoom[];
  elevators?: SharedFloorItem[];
  stairs?: SharedFloorItem[];
}

export interface SharedBuilding {
  id: string; name: string; code: string;
  category: string;
  description: string;
  x: number; y: number; width: number; height: number;
  color: string;
  floors: SharedFloorPlan[];
  facilities?: string[];
  accessibility?: string[];
  operating_hours?: string;
  contact?: string;
  image_url?: string;
}

export interface SharedMarker {
  id: string; name: string; type: string;
  x: number; y: number; color: string;
  building_id?: string;
}

export interface SharedPath {
  id: string;
  points: { x: number; y: number }[];
  type: string; color: string; width: number;
}

export interface SharedCampusData {
  id: string;
  name: string;
  code: string;
  canvasW: number;
  canvasH: number;
  buildings: SharedBuilding[];
  markers: SharedMarker[];
  paths: SharedPath[];
  publishStatus?: "draft" | "published";
  publishedAt?: string;
  /** @default "active" — archived campuses are hidden from students */
  status?: "active" | "archived";
}

// ── Context ────────────────────────────────────────────────────────────────

interface CampusDataContextValue {
  /** All published campuses from the Map Builder */
  campuses: SharedCampusData[];
  /** Publish (or update) a campus so the public map can see it */
  publishCampus: (data: SharedCampusData) => void;
  /** Remove a published campus */
  removeCampus: (id: string) => void;
  /** Get the latest published campus (most recently published) */
  latestPublished: SharedCampusData | null;
  /** True if any campus data is available from Map Builder */
  hasData: boolean;
}

const CampusDataContext = createContext<CampusDataContextValue | null>(null);

const STORAGE_KEY = "plv-published-campuses";

function loadFromStorage(): SharedCampusData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SharedCampusData[];
  } catch {
    return [];
  }
}

function saveToStorage(data: SharedCampusData[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

export function CampusDataProvider({ children }: { children: ReactNode }) {
  const [campuses, setCampuses] = useState<SharedCampusData[]>(() => loadFromStorage());

  // Persist to localStorage on change
  useEffect(() => {
    saveToStorage(campuses);
  }, [campuses]);

  const publishCampus = useCallback((data: SharedCampusData) => {
    setCampuses(prev => {
      const existing = prev.findIndex(c => c.id === data.id);
      const published = { ...data, publishedAt: data.publishedAt ?? new Date().toISOString() };
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = published;
        return next;
      }
      return [...prev, published];
    });
  }, []);

  const removeCampus = useCallback((id: string) => {
    setCampuses(prev => prev.filter(c => c.id !== id));
  }, []);

  const sorted = [...campuses].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  const value: CampusDataContextValue = {
    campuses,
    publishCampus,
    removeCampus,
    latestPublished: sorted[0] ?? null,
    hasData: campuses.length > 0,
  };

  return (
    <CampusDataContext.Provider value={value}>
      {children}
    </CampusDataContext.Provider>
  );
}

export function useCampusData(): CampusDataContextValue {
  const ctx = useContext(CampusDataContext);
  if (!ctx) throw new Error("useCampusData must be used within a <CampusDataProvider>");
  return ctx;
}
