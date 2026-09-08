import type { CampusBuilding, CampusDecorAsset, CampusMarker, CampusSelection } from "../components/map-builder/types";
import { isCampusGate } from "./campusGates";

/** Objects that can be copied without cloning graph-owned relationships. */
export type OutdoorClipboardEntry = {
  type: "building" | "marker" | "decorAsset";
  id: string;
};

export interface OutdoorClipboardSelection {
  entries: OutdoorClipboardEntry[];
  excluded: string[];
}

/**
 * Collect the physical outdoor objects eligible for the editor-local
 * clipboard.  Campus Gates and Pathways are deliberately excluded: Gates own
 * a derived navigation anchor and Pathways own generated graph vertices.
 * Buildings remain eligible because the existing explicit building-copy path
 * already remaps their floors/entrances safely.
 */
export function collectOutdoorClipboardSelection(
  selectionIds: string[],
  selected: CampusSelection | null | undefined,
  buildings: CampusBuilding[],
  markers: CampusMarker[],
  decorAssets: CampusDecorAsset[],
): OutdoorClipboardSelection {
  const ids = selectionIds.length > 0
    ? selectionIds
    : selected && ["building", "marker", "gate", "decorAsset", "path"].includes(selected.type)
      ? [selected.id]
      : [];
  const entries: OutdoorClipboardEntry[] = [];
  const excluded: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const building = buildings.find((item) => item.id === id);
    if (building) {
      const key = `building:${building.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ type: "building", id: building.id });
      }
      continue;
    }

    const marker = markers.find((item) => item.id === id);
    if (marker) {
      if (isCampusGate(marker)) {
        excluded.push("Campus Gate owns a linked navigation anchor and cannot be copied.");
      } else {
        const key = `marker:${marker.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ type: "marker", id: marker.id });
        }
      }
      continue;
    }

    const decorAsset = decorAssets.find((item) => item.id === id);
    if (decorAsset) {
      const key = `decorAsset:${decorAsset.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ type: "decorAsset", id: decorAsset.id });
      }
      continue;
    }

    // Paths and navigation nodes are intentionally not inferred as copyable
    // objects here; their graph ownership must remain canonical.
    excluded.push("This navigation-linked item cannot be copied.");
  }

  return { entries, excluded };
}

/** Navigation nodes that are safe to duplicate are free outdoor waypoints. */
export function isFreeOutdoorWaypoint(node: {
  entranceId?: string;
  buildingEntranceId?: string;
  gateId?: string;
  roomId?: string;
  doorId?: string;
  stairId?: string;
  elevatorId?: string;
  rampId?: string;
  transitionSharedId?: string;
  generatedFromPathVertices?: unknown[];
  exteriorEmergencyStairId?: string;
}): boolean {
  return !node.entranceId
    && !node.buildingEntranceId
    && !node.gateId
    && !node.roomId
    && !node.doorId
    && !node.stairId
    && !node.elevatorId
    && !node.rampId
    && !node.transitionSharedId
    && !(node.generatedFromPathVertices?.length)
    && !node.exteriorEmergencyStairId;
}
