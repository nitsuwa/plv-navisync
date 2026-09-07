import { useCallback } from "react";
import type { Campus } from "./src/components/map-builder/types";

declare const building: Campus["buildings"][number] | undefined;
declare const buildingId: string;

export const ensureCirculationGroupName = useCallback((type: "stairs" | "elevator", sharedId: string, fallbackName: string) => {
  const kind = type === "stairs" ? "stair" : "elevator";
  const groups = building?.circulationGroups ?? [];
  if (groups.some((g) => g.id === sharedId && g.kind === kind)) return groups;
  return [...groups, { id: sharedId, buildingId, kind, name: fallbackName }];
}, [building?.circulationGroups, buildingId]);