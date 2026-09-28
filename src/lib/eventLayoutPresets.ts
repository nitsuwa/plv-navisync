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
    description: "Six evenly spaced chairs for a clean audience row.",
    create: ({ x, y }, nextId) => Array.from({ length: 6 }, (_, index) => place("chair", x + index * 34, y, nextId)),
  },
  {
    id: "classroom-seating",
    name: "Classroom Seating",
    description: "Three tables with two audience chairs per row.",
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
      place("podium", x + 48, y + 94, nextId),
      place("microphone", x + 53, y + 62, nextId),
    ],
  },
];

export function getEventLayoutPreset(id: EventLayoutPresetId): EventLayoutPreset {
  return EVENT_LAYOUT_PRESETS.find((preset) => preset.id === id) ?? EVENT_LAYOUT_PRESETS[0];
}

export interface EventPresetPlacementOptions {
  count: number;
  spacing: number;
  rotation: number;
}

/** Builds a centered, adjustable preview or final placement from a preset. */
export function buildEventPreset(
  id: EventLayoutPresetId,
  center: { x: number; y: number },
  options: EventPresetPlacementOptions,
  nextId: () => string,
): FloorFurniture[] {
  const count = Math.max(1, Math.min(30, Math.round(options.count) || 1));
  const spacing = Math.max(20, Math.min(240, Number(options.spacing) || 20));
  const base = id === "chair-row"
    ? Array.from({ length: count }, (_, index) => place("chair", index * spacing, 0, nextId))
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
