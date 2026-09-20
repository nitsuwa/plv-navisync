import type { FloorFurniture } from "../map-builder/types";

export type CanvasAssetSurface = "map" | "event";
export type CanvasAssetCategory = "essentials" | "seating" | "production" | "outdoor" | "safety" | "signage";

export interface CanvasAssetDescriptor {
  key: string;
  name: string;
  category: CanvasAssetCategory;
  surfaces: readonly CanvasAssetSurface[];
  legacyTypes: readonly string[];
  defaultWidth: number;
  defaultHeight: number;
  color: string;
  keywords: readonly string[];
  description: string;
  artKind: string;
}

const CANVAS_ASSET_CATALOG: readonly CanvasAssetDescriptor[] = [
  {
    key: "chair",
    name: "Chair",
    category: "seating",
    surfaces: ["map", "event"],
    legacyTypes: ["chair"],
    defaultWidth: 24,
    defaultHeight: 24,
    color: "#8b6f4e",
    keywords: ["seat", "seating", "audience"],
    description: "Single chair with seat, back, and legs",
    artKind: "chair",
  },
  {
    key: "table",
    name: "Table",
    category: "essentials",
    surfaces: ["map", "event"],
    legacyTypes: ["table"],
    defaultWidth: 50,
    defaultHeight: 30,
    color: "#8b6f4e",
    keywords: ["desk", "booth", "work"],
    description: "Rectangular event table",
    artKind: "table",
  },
  {
    key: "booth",
    name: "Booth",
    category: "essentials",
    surfaces: ["event"],
    legacyTypes: ["booth"],
    defaultWidth: 60,
    defaultHeight: 40,
    color: "#d97706",
    keywords: ["exhibit", "stall", "registration", "counter"],
    description: "Exhibition booth with counter and canopy",
    artKind: "booth",
  },
  {
    key: "stage",
    name: "Stage",
    category: "production",
    surfaces: ["event"],
    legacyTypes: ["stage"],
    defaultWidth: 120,
    defaultHeight: 80,
    color: "#7c3aed",
    keywords: ["platform", "program", "performance"],
    description: "Raised stage with front edge and legs",
    artKind: "stage",
  },
  {
    key: "speaker",
    name: "Speaker",
    category: "production",
    surfaces: ["event"],
    legacyTypes: ["speaker"],
    defaultWidth: 28,
    defaultHeight: 42,
    color: "#334155",
    keywords: ["audio", "sound", "pa"],
    description: "PA speaker with visible drivers",
    artKind: "speaker",
  },
  {
    key: "projector",
    name: "Projector",
    category: "production",
    surfaces: ["event"],
    legacyTypes: ["projector"],
    defaultWidth: 36,
    defaultHeight: 24,
    color: "#64748b",
    keywords: ["presentation", "av", "display"],
    description: "Projector with lens and projection direction",
    artKind: "projector",
  },
  {
    key: "monitor",
    name: "Monitor",
    category: "production",
    surfaces: ["event"],
    legacyTypes: ["monitor", "screen"],
    defaultWidth: 42,
    defaultHeight: 30,
    color: "#0f9f94",
    keywords: ["screen", "display", "led"],
    description: "Display monitor with stand",
    artKind: "monitor",
  },
  {
    key: "tent",
    name: "Tent",
    category: "outdoor",
    surfaces: ["event"],
    legacyTypes: ["tent", "canopy"],
    defaultWidth: 80,
    defaultHeight: 80,
    color: "#059669",
    keywords: ["canopy", "outdoor", "covered"],
    description: "Outdoor tent with canopy seams",
    artKind: "tent",
  },
  {
    key: "barrier",
    name: "Barrier",
    category: "safety",
    surfaces: ["event"],
    legacyTypes: ["barrier", "queue-barrier"],
    defaultWidth: 40,
    defaultHeight: 10,
    color: "#dc2626",
    keywords: ["queue", "crowd", "control"],
    description: "Crowd-control barrier",
    artKind: "barrier",
  },
  {
    key: "signage",
    name: "Signage",
    category: "signage",
    surfaces: ["event"],
    legacyTypes: ["signage", "directional-sign"],
    defaultWidth: 30,
    defaultHeight: 20,
    color: "#0891b2",
    keywords: ["wayfinding", "direction", "information"],
    description: "Freestanding event sign",
    artKind: "signage",
  },
  {
    key: "registration-desk",
    name: "Registration Desk",
    category: "essentials",
    surfaces: ["event"],
    legacyTypes: ["registration-desk"],
    defaultWidth: 70,
    defaultHeight: 28,
    color: "#a16207",
    keywords: ["check-in", "welcome", "desk"],
    description: "Registration desk with front counter",
    artKind: "registration-desk",
  },
  {
    key: "podium",
    name: "Podium",
    category: "production",
    surfaces: ["event"],
    legacyTypes: ["podium", "lectern"],
    defaultWidth: 24,
    defaultHeight: 24,
    color: "#92400e",
    keywords: ["lectern", "speaker", "program"],
    description: "Presentation podium",
    artKind: "podium",
  },
  {
    key: "microphone",
    name: "Microphone",
    category: "production",
    surfaces: ["event"],
    legacyTypes: ["microphone", "mic-stand"],
    defaultWidth: 14,
    defaultHeight: 28,
    color: "#475569",
    keywords: ["audio", "speaker", "stage"],
    description: "Microphone on a stand",
    artKind: "microphone",
  },
  {
    key: "queue-post",
    name: "Queue Post",
    category: "safety",
    surfaces: ["event"],
    legacyTypes: ["queue-post"],
    defaultWidth: 16,
    defaultHeight: 16,
    color: "#be123c",
    keywords: ["line", "queue", "stanchion"],
    description: "Queue stanchion post",
    artKind: "queue-post",
  },
  {
    key: "whiteboard",
    name: "Whiteboard / Teaching Board",
    category: "production",
    surfaces: ["map"],
    legacyTypes: ["whiteboard"],
    defaultWidth: 40,
    defaultHeight: 6,
    color: "#f8fafc",
    keywords: ["classroom", "teaching", "board"],
    description: "Permanent teaching board",
    artKind: "whiteboard",
  },
];

const assetByKey = new Map(CANVAS_ASSET_CATALOG.map((asset) => [asset.key, asset]));
const keyByLegacyType = new Map(
  CANVAS_ASSET_CATALOG.flatMap((asset) => asset.legacyTypes.map((type) => [type, asset.key] as const)),
);

export function getCanvasAsset(keyOrLegacyType: string): CanvasAssetDescriptor | undefined {
  const key = assetByKey.has(keyOrLegacyType) ? keyOrLegacyType : keyByLegacyType.get(keyOrLegacyType);
  return key ? assetByKey.get(key) : undefined;
}

export function listCanvasAssets(surface: CanvasAssetSurface): readonly CanvasAssetDescriptor[] {
  return CANVAS_ASSET_CATALOG.filter((asset) => asset.surfaces.includes(surface));
}

export function resolveCanvasAssetKey(item: Pick<FloorFurniture, "type" | "assetKey">): string | undefined {
  if (item.assetKey && assetByKey.has(item.assetKey)) return item.assetKey;
  return getCanvasAsset(item.type)?.key;
}

export function createFurnitureFromCanvasAsset(
  asset: CanvasAssetDescriptor,
  x: number,
  y: number,
  id: string,
  overrides: Partial<FloorFurniture> = {},
): FloorFurniture {
  return {
    id,
    type: asset.legacyTypes[0] ?? asset.key,
    name: asset.name,
    category: asset.category,
    x,
    y,
    width: asset.defaultWidth,
    height: asset.defaultHeight,
    rotation: 0,
    color: asset.color,
    layer: "events",
    assetKey: asset.key,
    ...overrides,
  };
}

export { CANVAS_ASSET_CATALOG };
