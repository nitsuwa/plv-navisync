import { useState, useMemo, useCallback } from "react";
import type { Campus, CampusBuilding, FloorPlan } from "../components/map-builder/types";
import { useDebounce } from "./useDebounce";

export interface SearchResult {
  id: string;
  name: string;
  code?: string;
  kind: "building" | "room" | "office" | "laboratory" | "facility" | "destination" | "marker";
  category?: string;
  buildingId?: string;
  buildingName?: string;
  floorId?: string;
  floorNumber?: number;
  floorLabel?: string;
  description?: string;
  accessible: boolean;
  keywords: string[];
}

export interface UseCampusSearchResult {
  query: string;
  setQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  results: SearchResult[];
  popularSearches: { label: string; buildingId: string; floorId?: string; name?: string }[];
  isSearching: boolean;
  clearSearch: () => void;
}

export function useCampusSearch(campus: Campus | null, initialCategory: string = "all"): UseCampusSearchResult {
  const [query, setQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  
  const debouncedQuery = useDebounce(query.trim().toLowerCase(), 150);

  // Extract searchable elements from active campus
  const allSearchableEntries = useMemo<SearchResult[]>(() => {
    if (!campus) return [];

    const entries: SearchResult[] = [];

    // 1. Index Buildings
    (campus.buildings ?? []).forEach((b: CampusBuilding) => {
      if (b.visible === false) return;

      const keywords = [
        b.name.toLowerCase(),
        (b.code || "").toLowerCase(),
        (b.category || "").toLowerCase(),
        ...(b.description ? [b.description.toLowerCase()] : []),
      ];

      entries.push({
        id: b.id,
        name: b.name,
        code: b.code,
        kind: "building",
        category: b.category || "academic",
        buildingId: b.id,
        buildingName: b.name,
        description: b.description,
        accessible: Boolean(b.accessibility?.wheelchairAccessible),
        keywords,
      });

      // 2. Index Rooms/Elements inside building floors
      (b.floors ?? []).forEach((floor: FloorPlan) => {
        (floor.rooms ?? []).forEach((room) => {
          if (room.visible === false) return;

          const rName = room.name || room.code || "Room";
          const rType = room.type || "room";
          const rKind = rType === "office" ? "office" : rType === "laboratory" ? "laboratory" : rType === "restroom" || rType === "canteen" || rType === "clinic" ? "facility" : "room";

          const roomKeywords = [
            rName.toLowerCase(),
            (room.code || "").toLowerCase(),
            (room.description || "").toLowerCase(),
            b.name.toLowerCase(),
            (b.code || "").toLowerCase(),
            floor.label.toLowerCase(),
          ];

          entries.push({
            id: room.id,
            name: rName,
            code: room.code,
            kind: rKind,
            category: rType,
            buildingId: b.id,
            buildingName: b.name,
            floorId: floor.id,
            floorNumber: floor.number,
            floorLabel: floor.label,
            description: room.description || `${floor.label} - ${b.name}`,
            accessible: Boolean(room.accessible || room.accessibility),
            keywords: roomKeywords,
          });
        });
      });
    });

    // 3. Index Markers & Facilities
    (campus.markers ?? []).forEach((m) => {
      const mName = m.name || m.label || "Landmark";
      entries.push({
        id: m.id,
        name: mName,
        kind: "marker",
        category: "facility",
        description: m.description || "Campus Landmark",
        accessible: true,
        keywords: [mName.toLowerCase(), (m.description || "").toLowerCase(), "landmark"],
      });
    });

    return entries;
  }, [campus]);

  // Filtered search results
  const results = useMemo(() => {
    let filtered = allSearchableEntries;

    // Filter by Category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((item) => {
        const cat = (item.category || "").toLowerCase();
        const kind = item.kind.toLowerCase();
        if (selectedCategory === "academic") return cat === "academic" || kind === "room";
        if (selectedCategory === "admin" || selectedCategory === "administration") return cat === "administration" || cat === "admin" || kind === "office";
        if (selectedCategory === "laboratory") return cat === "laboratory" || kind === "laboratory";
        if (selectedCategory === "library") return cat === "library";
        if (selectedCategory === "facility" || selectedCategory === "facilities") return cat === "facility" || kind === "facility" || kind === "marker";
        return cat === selectedCategory || kind === selectedCategory;
      });
    }

    // Filter by Search Query
    if (debouncedQuery) {
      filtered = filtered.filter((item) => {
        return item.keywords.some((kw) => kw.includes(debouncedQuery));
      });
    }

    return filtered;
  }, [allSearchableEntries, selectedCategory, debouncedQuery]);

  // Popular searches shortcut
  const popularSearches = useMemo(() => {
    if (!campus || !campus.buildings.length) {
      return [
        { label: "Registrar", buildingId: "b2" },
        { label: "Cashier", buildingId: "b2" },
        { label: "Library", buildingId: "b3" },
        { label: "Gymnasium", buildingId: "b5" },
        { label: "Student Services", buildingId: "b6" },
      ];
    }

    return campus.buildings.slice(0, 5).map((b) => ({
      label: b.name,
      buildingId: b.id,
    }));
  }, [campus]);

  const clearSearch = useCallback(() => {
    setQuery("");
  }, []);

  return {
    query,
    setQuery,
    selectedCategory,
    setSelectedCategory,
    results,
    popularSearches,
    isSearching: Boolean(debouncedQuery),
    clearSearch,
  };
}
