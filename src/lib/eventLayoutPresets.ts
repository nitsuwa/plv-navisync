import { eventFurnitureFromTemplate, getEventFurnitureTemplate } from "../components/events/eventAssets";
import type { FloorFurniture } from "../components/map-builder/types";

export type EventLayoutPresetId = "chair-row" | "classroom-seating" | "booth-area" | "registration-area" | "stage-setup";

export interface EventLayoutPreset {
  id: EventLayoutPresetId;
  name: string;
  description: string;
  create: (origin: { x: number; y: number }, nextId: () => string) => FloorFurniture[];
}

function place(type: string, x: number, y: number, nextId: () => string): FloorFurniture {
  const template = getEventFurnitureTemplate(type);
  return eventFurnitureFromTemplate(template, x, y, nextId());
}

export const EVENT_LAYOUT_PRESETS: readonly EventLayoutPreset[] = [
  {
    id: "chair-row",
    name: "Chair Row",
    description: "Evenly spaced chairs in configurable rows.",
    create: ({ x, y }, nextId) => Array.from({ length: 6 }, (_, index) => place("chair", x + index * 34, y, nextId)),
  },
  {
    id: "classroom-seating",
    name: "Classroom Seating",
    description: "Three tables with one chair beside each table.",
    create: ({ x, y }, nextId) => [
      ...Array.from({ length: 3 }, (_, index) => place("table", x, y + index * 58, nextId)),
      ...Array.from({ length: 3 }, (_, index) => place("chair", x + 62, y + index * 58 + 3, nextId)),
    ],
  },
  {
    id: "booth-area",
    name: "Booth Area",
    description: "A booth with a table and two visitor chairs.",
    create: ({ x, y }, nextId) => [
      place("booth", x, y, nextId),
      place("table", x + 5, y + 48, nextId),
      place("chair", x - 32, y + 50, nextId),
      place("chair", x + 56, y + 50, nextId),
    ],
  },
  {
    id: "registration-area",
    name: "Registration Area",
    description: "A check-in desk with wayfinding and an orderly queue start.",
    create: ({ x, y }, nextId) => [
      place("registration-desk", x, y, nextId),
      place("signage", x + 20, y - 34, nextId),
      place("queue-post", x - 22, y + 48, nextId),
      place("queue-post", x + 74, y + 48, nextId),
    ],
  },
  {
    id: "stage-setup",
    name: "Stage Setup",
    description: "Stage, podium, microphone, and balanced PA speakers.",
    create: ({ x, y }, nextId) => [
      place("stage", x, y, nextId),
      place("speaker", x - 40, y + 19, nextId),
      place("speaker", x + 132, y + 19, nextId),
      place("podium", x + 48, y + 118, nextId),
      place("microphone", x + 53, y + 84, nextId),
    ],
  },
];

export function getEventLayoutPreset(id: EventLayoutPresetId): EventLayoutPreset {
  return EVENT_LAYOUT_PRESETS.find((preset) => preset.id === id) ?? EVENT_LAYOUT_PRESETS[0];
}

export interface EventPresetPlacementOptions {
  count: number;
  chairsPerRow?: number;
  spacing: number;
  rotation: number;
  /** Clear space between chair footprints; omitted fields keep legacy pitch behavior. */
  columnGap?: number;
  rowGap?: number;
  centerAisleGap?: number;
}

export interface EventPresetDraft {
  id: EventLayoutPresetId;
  count: string;
  chairsPerRow: string;
  columnGap: string;
  rowGap: string;
  centerAisle: boolean;
  centerAisleGap: string;
  rotation: string;
  spacing: string;
}

export type EventPresetDraftField = keyof Omit<EventPresetDraft, "id" | "centerAisle">;

export interface EventPresetDraftValidation {
  options: EventPresetPlacementOptions | null;
  errors: string[];
  fieldErrors: Partial<Record<EventPresetDraftField, string>>;
  rows: number | null;
  lastRowCount: number | null;
}

/** Validates draft strings without clamping away a user's requested count or spacing. */
export function validateEventPresetDraft(draft: EventPresetDraft): EventPresetDraftValidation {
  const fieldErrors: EventPresetDraftValidation["fieldErrors"] = {};
  const readNumber = (field: EventPresetDraftField, value: string, label: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      fieldErrors[field] = `Enter ${label}.`;
      return null;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      fieldErrors[field] = `Enter a valid ${label}.`;
      return null;
    }
    return numeric;
  };
  const count = readNumber("count", draft.count, draft.id === "chair-row" ? "a chair count" : "a copy count");
  const maximumCount = draft.id === "chair-row" ? 500 : 30;
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > maximumCount)) {
    fieldErrors.count = `Enter a whole number between 1 and ${maximumCount}.`;
  }

  const rotation = readNumber("rotation", draft.rotation, "a rotation");
  if (rotation !== null && (rotation < 0 || rotation > 359)) fieldErrors.rotation = "Rotation must be between 0 and 359 degrees.";

  let chairsPerRow = 1;
  let columnGap: number | undefined;
  let rowGap: number | undefined;
  let centerAisleGap: number | undefined;
  let spacing = 180;
  if (draft.id === "chair-row") {
    const perRow = readNumber("chairsPerRow", draft.chairsPerRow, "a chairs-per-row value");
    if (perRow !== null && (perRow < 1 || perRow > 30 || !Number.isInteger(perRow))) {
      fieldErrors.chairsPerRow = "Chairs per row must be a whole number between 1 and 30.";
    } else if (perRow !== null) {
      chairsPerRow = perRow;
    }
    if (count !== null && Number.isInteger(count) && count >= 1 && perRow !== null && Number.isInteger(perRow) && perRow > count) {
      fieldErrors.chairsPerRow = "Chairs per row cannot exceed the chair count.";
    }
    const column = readNumber("columnGap", draft.columnGap, "a column gap");
    const row = readNumber("rowGap", draft.rowGap, "a row gap");
    const aisle = draft.centerAisle ? readNumber("centerAisleGap", draft.centerAisleGap, "a center aisle gap") : 0;
    if (column !== null && (column < 0 || column > 240)) fieldErrors.columnGap = "Column gap must be between 0 and 240 map units.";
    if (row !== null && (row < 0 || row > 240)) fieldErrors.rowGap = "Row gap must be between 0 and 240 map units.";
    if (aisle !== null && (aisle < 0 || aisle > 240)) fieldErrors.centerAisleGap = "Center aisle gap must be between 0 and 240 map units.";
    columnGap = column ?? undefined;
    rowGap = row ?? undefined;
    centerAisleGap = aisle ?? undefined;
  } else {
    const draftSpacing = readNumber("spacing", draft.spacing, "a spacing value");
    if (draftSpacing !== null && (draftSpacing < 20 || draftSpacing > 240)) fieldErrors.spacing = "Spacing must be between 20 and 240 map units.";
    spacing = draftSpacing ?? spacing;
  }

  const errors = Object.values(fieldErrors).filter((message): message is string => Boolean(message));
  const valid = errors.length === 0 && count !== null && rotation !== null;
  const safeCount = valid ? count! : null;
  const rows = draft.id === "chair-row" && safeCount !== null ? Math.ceil(safeCount / chairsPerRow) : null;
  const lastRowCount = draft.id === "chair-row" && safeCount !== null ? safeCount % chairsPerRow || Math.min(safeCount, chairsPerRow) : null;
  return {
    options: valid ? {
      count: safeCount!,
      chairsPerRow: draft.id === "chair-row" ? chairsPerRow : undefined,
      spacing: draft.id === "chair-row" ? 34 : spacing,
      rotation: rotation!,
      columnGap,
      rowGap,
      centerAisleGap,
    } : null,
    errors,
    fieldErrors,
    rows,
    lastRowCount,
  };
}

/** Builds a centered, adjustable preview or final placement from a preset. */
export function buildEventPreset(
  id: EventLayoutPresetId,
  center: { x: number; y: number },
  options: EventPresetPlacementOptions,
  nextId: () => string,
): FloorFurniture[] {
  const count = Math.max(1, Math.min(id === "chair-row" ? 500 : 30, Math.round(options.count) || 1));
  const spacing = Math.max(20, Math.min(240, Number(options.spacing) || 20));
  const chairsPerRow = Math.max(1, Math.min(count, Math.round(options.chairsPerRow ?? count)));
  const chairTemplate = getEventFurnitureTemplate("chair");
  const base = id === "chair-row"
    ? Array.from({ length: count }, (_, index) => {
      const rowIndex = Math.floor(index / chairsPerRow);
      const columnIndex = index % chairsPerRow;
      const itemsInRow = Math.min(chairsPerRow, count - rowIndex * chairsPerRow);
      const aisleSplit = Math.floor(chairsPerRow / 2);
      const addAisle = options.centerAisleGap && aisleSplit > 0 && itemsInRow > aisleSplit && columnIndex >= aisleSplit
        ? options.centerAisleGap
        : 0;
      const horizontalPitch = options.columnGap === undefined ? spacing : chairTemplate.width + Math.max(0, Number(options.columnGap) || 0);
      const verticalPitch = options.rowGap === undefined ? Math.max(40, spacing) : chairTemplate.height + Math.max(0, Number(options.rowGap) || 0);
      return place("chair", columnIndex * horizontalPitch + addAisle, rowIndex * verticalPitch, nextId);
    })
    : Array.from({ length: count }, (_, index) => getEventLayoutPreset(id).create({ x: index * spacing, y: 0 }, nextId)).flat();
  if (base.length === 0) return base;
  const left = Math.min(...base.map((item) => item.x));
  const right = Math.max(...base.map((item) => item.x + item.width));
  const top = Math.min(...base.map((item) => item.y));
  const bottom = Math.max(...base.map((item) => item.y + item.height));
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const rotation = Number.isFinite(options.rotation) ? options.rotation : 0;
  const angle = rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return base.map((item) => {
    const dx = item.x + item.width / 2 - midX;
    const dy = item.y + item.height / 2 - midY;
    return {
      ...item,
      x: center.x + dx * cos - dy * sin - item.width / 2,
      y: center.y + dx * sin + dy * cos - item.height / 2,
      rotation: ((item.rotation || 0) + rotation) % 360,
    };
  });
}

/** Shifts a preset as one unit so its rotated visual bounds fit the map when possible. */
export function fitEventPresetToCanvas(items: FloorFurniture[], width: number, height: number): FloorFurniture[] {
  if (items.length === 0) return items;
  const bounds = items.map((item) => {
    const radians = (item.rotation || 0) * Math.PI / 180;
    const halfW = (Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height) / 2;
    const halfH = (Math.abs(Math.sin(radians)) * item.width + Math.abs(Math.cos(radians)) * item.height) / 2;
    const midX = item.x + item.width / 2;
    const midY = item.y + item.height / 2;
    return { left: midX - halfW, right: midX + halfW, top: midY - halfH, bottom: midY + halfH };
  });
  const left = Math.min(...bounds.map((box) => box.left));
  const right = Math.max(...bounds.map((box) => box.right));
  const top = Math.min(...bounds.map((box) => box.top));
  const bottom = Math.max(...bounds.map((box) => box.bottom));
  const dx = right - left > width || left < 0 ? -left : right > width ? width - right : 0;
  const dy = bottom - top > height || top < 0 ? -top : bottom > height ? height - bottom : 0;
  return items.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy }));
}
