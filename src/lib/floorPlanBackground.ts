import type { FloorPlanBackground, FloorScaleCalibration } from "../components/map-builder/types";

export const FLOOR_PLAN_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const FLOOR_PLAN_MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const ALLOWED_MIME_TYPES = new Set<string>(FLOOR_PLAN_IMAGE_TYPES);

function finiteNumber(value: unknown, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function validateFloorPlanImage(file: Pick<File, "name" | "size" | "type">): void {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_MIME_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Use a PNG, JPG, JPEG, or WebP floor-plan image.");
  }
  if (file.size > FLOOR_PLAN_MAX_BYTES) {
    throw new Error("Floor-plan images must be 15 MB or smaller.");
  }
}

export function normalizeFloorPlanBackground(
  input: Partial<FloorPlanBackground> | null | undefined,
  canvasW: number,
  canvasH: number
): FloorPlanBackground | undefined {
  if (!input?.storagePath) return undefined;
  const width = Math.max(1, finiteNumber(input.width, canvasW));
  const height = Math.max(1, finiteNumber(input.height, canvasH));
  return {
    storagePath: String(input.storagePath),
    fileName: String(input.fileName ?? "Floor plan"),
    mimeType: ALLOWED_MIME_TYPES.has(String(input.mimeType)) ? String(input.mimeType) : "image/png",
    size: Math.max(0, finiteNumber(input.size, 0)),
    visible: input.visible !== false,
    opacity: clamp(finiteNumber(input.opacity, 0.55), 0.05, 1),
    locked: input.locked !== false,
    x: finiteNumber(input.x, 0),
    y: finiteNumber(input.y, 0),
    width,
    height,
    rotation: finiteNumber(input.rotation, 0),
    naturalWidth: input.naturalWidth ? Math.max(1, finiteNumber(input.naturalWidth, width)) : undefined,
    naturalHeight: input.naturalHeight ? Math.max(1, finiteNumber(input.naturalHeight, height)) : undefined,
    uploadedAt: typeof input.uploadedAt === "string" ? input.uploadedAt : undefined,
  };
}

export function createFittedFloorPlanBackground(params: {
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  canvasW: number;
  canvasH: number;
  naturalWidth?: number;
  naturalHeight?: number;
}): FloorPlanBackground {
  return normalizeFloorPlanBackground({
    storagePath: params.storagePath,
    fileName: params.fileName,
    mimeType: params.mimeType,
    size: params.size,
    visible: true,
    opacity: 0.55,
    locked: true,
    x: 0,
    y: 0,
    width: params.canvasW,
    height: params.canvasH,
    rotation: 0,
    naturalWidth: params.naturalWidth,
    naturalHeight: params.naturalHeight,
    uploadedAt: new Date().toISOString(),
  }, params.canvasW, params.canvasH)!;
}

export function fitFloorPlanBackgroundToFloor(
  background: FloorPlanBackground | undefined,
  canvasW: number,
  canvasH: number
): FloorPlanBackground | undefined {
  if (!background) return undefined;
  return { ...background, x: 0, y: 0, width: canvasW, height: canvasH, rotation: 0 };
}

export function resetFloorPlanBackgroundPosition(background: FloorPlanBackground | undefined): FloorPlanBackground | undefined {
  if (!background) return undefined;
  return { ...background, x: 0, y: 0, rotation: 0 };
}

export function editorDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function createFloorScaleCalibration(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  realDistanceM: number
): FloorScaleCalibration {
  const editorDistanceValue = editorDistance(p1, p2);
  if (editorDistanceValue <= 0) throw new Error("Pick two different calibration points.");
  if (!Number.isFinite(realDistanceM) || realDistanceM <= 0) throw new Error("Enter a real-world distance greater than zero.");
  return {
    metersPerUnit: realDistanceM / editorDistanceValue,
    points: [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }],
    editorDistance: editorDistanceValue,
    realDistanceM,
    calibratedAt: new Date().toISOString(),
  };
}

export function measureDistanceMeters(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  calibration: FloorScaleCalibration | null | undefined
) {
  return calibration ? editorDistance(p1, p2) * calibration.metersPerUnit : null;
}
