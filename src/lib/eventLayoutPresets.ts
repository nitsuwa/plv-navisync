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
