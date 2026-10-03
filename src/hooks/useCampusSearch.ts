import { useState, useMemo, useCallback } from "react";
import type { Campus, CampusBuilding, CampusEventOverlay, FloorPlan } from "../components/map-builder/types";
import { useDebounce } from "./useDebounce";
import { ROOM_DOOR_EDGE_TYPE } from "../lib/indoorNavigationGraph";

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
  campusPlaceId?: string;
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
  /** Complete connected index, independent of the map search query/category. */
  destinations: SearchResult[];
  popularSearches: { label: string; buildingId: string; floorId?: string; name?: string }[];
  isSearching: boolean;
  clearSearch: () => void;
}

/** The public search index should advertise only destinations with a usable
 * published connection. A room center or its semantic Room→Door edge alone
 * is not a walkable route; the physical Door needs a path edge as well. */
export function connectedCampusDestinations(campus: Campus): {
  buildingIds: Set<string>;
  roomKeys: Set<string>;
} {
  const nodes = campus.navNodes ?? [];
  const edges = (campus.navEdges ?? []).filter((edge) => !edge.closed);
  const walkableNodeIds = new Set(edges
    .filter((edge) => edge.type !== ROOM_DOOR_EDGE_TYPE)
    .flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
  const buildingIds = new Set<string>();
  const roomKeys = new Set<string>();

  for (const building of campus.buildings ?? []) {
    const entranceIds = new Set((building.entrances ?? []).map((entrance) => entrance.id));
    const hasEntrance = nodes.some((node) => node.buildingId === building.id
      && !node.floorId
      && walkableNodeIds.has(node.id)
      && (node.id === building.entranceNodeId
        || (node.entranceId && (entranceIds.size === 0 || entranceIds.has(node.entranceId)))
        || (entranceIds.size === 0 && (node.type === "entrance" || node.type === "emergency_exit"))));
    if (hasEntrance) buildingIds.add(building.id);

    for (const floor of building.floors ?? []) {
      for (const room of floor.rooms ?? []) {
        const doorIds = new Set([room.accessDoorId, ...(room.accessDoorIds ?? [])].filter((id): id is string => !!id));
        const roomNodeIds = new Set(nodes.filter((node) => node.buildingId === building.id
          && node.floorId === floor.id && node.roomId === room.id).map((node) => node.id));
        const semanticDoorNodeIds = new Set(edges.filter((edge) => edge.type === ROOM_DOOR_EDGE_TYPE)
          .flatMap((edge) => roomNodeIds.has(edge.startNodeId) ? [edge.endNodeId]
            : roomNodeIds.has(edge.endNodeId) ? [edge.startNodeId] : []));
        const connectedDoor = nodes.some((node) => node.buildingId === building.id
          && node.floorId === floor.id
          && !!node.doorId
          && walkableNodeIds.has(node.id)
          && (node.id === room.accessNodeId || doorIds.has(node.doorId) || semanticDoorNodeIds.has(node.id)));
        if (connectedDoor) roomKeys.add(`${building.id}:${floor.id}:${room.id}`);
      }
    }
  }
  return { buildingIds, roomKeys };
}

/**
 * Search only the rooms on the floor the student is currently viewing.
 *
 * Campus-level search intentionally uses a small debounce so a large campus
 * index does not re-filter on every keystroke. That debounce is a poor fit for
 * an indoor search field, though: the old result can remain visible while a
 * student is typing and look like the field ignored the new query. The floor
 * is already a small, authored collection, so keep this lookup synchronous and
 * scoped to that floor.
 */
export function searchFloorRooms(
  floor: FloorPlan | undefined,
  building: Pick<CampusBuilding, "id" | "name" | "code"> | undefined,
  query: string,
): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!floor || !building || !normalizedQuery) return [];

  return (floor.rooms ?? [])
    .filter((room) => room.visible !== false)
    .map((room) => {
      const roomRecord = room as typeof room & { code?: string };
      const name = room.name || roomRecord.code || "Room";
      const roomType = (room.type || "room").toLowerCase();
      const kind: SearchResult["kind"] =
        roomType === "office"
          ? "office"
          : roomType === "laboratory"
            ? "laboratory"
            : roomType === "restroom" || roomType === "canteen" || roomType === "clinic"
              ? "facility"
              : "room";
      const keywords = [
        name,
        roomRecord.code || "",
        room.description || "",
        roomType,
        building.name,
        building.code,
        floor.label,
      ].map((value) => value.toLowerCase());

      return {
        id: room.id,
        name,
        code: roomRecord.code,
        kind,
        category: roomType,
        buildingId: building.id,
        buildingName: building.name,
        floorId: floor.id,
        floorNumber: floor.number,
        floorLabel: floor.label,
        description: room.description || `${floor.label} - ${building.name}`,
        accessible: Boolean(room.accessibility),
        keywords,
      } satisfies SearchResult;
    })
    .filter((room) => room.keywords.some((keyword) => keyword.includes(normalizedQuery)));
}

export function useCampusSearch(
  campus: Campus | null,
  initialCategory: string = "all",
  events: CampusEventOverlay[] = [],
): UseCampusSearchResult {
  const [query, setQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  
  const debouncedQuery = useDebounce(query.trim().toLowerCase(), 150);

  // Extract searchable elements from active campus
  const allSearchableEntries = useMemo<SearchResult[]>(() => {
    if (!campus) return [];

    const entries: SearchResult[] = [];
    const hasPublishedGraph = Boolean((campus.navNodes?.length ?? 0) || (campus.navEdges?.length ?? 0));
    const connected = hasPublishedGraph ? connectedCampusDestinations(campus) : null;

    // 1. Index Buildings
    (campus.buildings ?? []).forEach((b: CampusBuilding) => {
      if (b.visible === false) return;

      const keywords = [
        b.name.toLowerCase(),
        (b.code || "").toLowerCase(),
        (b.category || "").toLowerCase(),
        ...(b.description ? [b.description.toLowerCase()] : []),
      ];

      if (!connected || connected.buildingIds.has(b.id)) entries.push({
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
          if (connected && !connected.roomKeys.has(`${b.id}:${floor.id}:${room.id}`)) return;

          const roomCode = (room as typeof room & { code?: string }).code;
          const rName = room.name || roomCode || "Room";
          const rType = (room.type || "room").toLowerCase();
          const rKind = rType === "office" ? "office" : rType === "laboratory" ? "laboratory" : rType === "restroom" || rType === "canteen" || rType === "clinic" ? "facility" : "room";

          const roomKeywords = [
            rName.toLowerCase(),
            (roomCode || "").toLowerCase(),
            (room.description || "").toLowerCase(),
            b.name.toLowerCase(),
            (b.code || "").toLowerCase(),
            floor.label.toLowerCase(),
          ];

          entries.push({
            id: room.id,
            name: rName,
            code: roomCode,
            kind: rKind,
            category: rType,
            buildingId: b.id,
            buildingName: b.name,
            floorId: floor.id,
            floorNumber: floor.number,
            floorLabel: floor.label,
            description: room.description || `${floor.label} - ${b.name}`,
            accessible: Boolean(room.accessibility),
            keywords: roomKeywords,
          });
        });
      });
    });

    // 3. Index Markers & Facilities
    (campus.markers ?? []).forEach((m) => {
      const mName = m.name || "Landmark";
      entries.push({
        id: m.id,
        name: mName,
        kind: "marker",
        category: m.type === "gate" ? "gate" : "landmark",
        campusPlaceId: m.id,
        description: m.studentInfo?.description || (m.type === "gate" ? "Campus Gate" : "Campus Landmark"),
        accessible: Boolean(m.studentInfo?.accessibleEntrance),
        keywords: [mName.toLowerCase(), "landmark", m.type.toLowerCase(), ...(m.studentInfo?.description ? [m.studentInfo.description.toLowerCase()] : [])],
      });
    });

    // 4. Index active event overlays so campus search and event discovery share
    // one destination model.
    events.forEach((event) => {
      const eventName = event.title;
      entries.push({
        id: event.id,
        name: eventName,
        kind: "marker",
        category: "event",
        buildingId: event.locationRef?.buildingId,
        buildingName: event.locationRef?.label,
        floorId: event.locationRef?.floorId,
        description: event.description || "Campus Event",
        accessible: true,
        keywords: [eventName.toLowerCase(), (event.organizer || "").toLowerCase(), "event", "fair", "org"],
      });
    });

    return entries;
  }, [campus, events]);

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
    destinations: allSearchableEntries,
    popularSearches,
    isSearching: Boolean(debouncedQuery),
    clearSearch,
  };
}
