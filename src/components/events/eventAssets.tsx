import type { FloorFurniture } from "../map-builder/types";
import { CanvasAssetVisual } from "../canvas/CanvasAssetVisual";

export interface EventFurnitureTemplate {
  type: string;
  /** Stable visual identity; defaults to the legacy type for compatibility. */
  assetKey?: string;
  name: string;
  category: "event";
  width: number;
  height: number;
  color: string;
}

export const EVENT_FURNITURE_TEMPLATES: EventFurnitureTemplate[] = [
  { type: "booth", name: "Booth", category: "event", width: 60, height: 40, color: "#f59e0b" },
  { type: "chair", name: "Chair", category: "event", width: 24, height: 24, color: "#0ea5e9" },
  { type: "stage", name: "Stage", category: "event", width: 120, height: 80, color: "#8b5cf6" },
  { type: "speaker", name: "Speaker", category: "event", width: 28, height: 42, color: "#334155" },
  { type: "projector", name: "Projector", category: "event", width: 36, height: 24, color: "#64748b" },
  { type: "monitor", name: "Monitor", category: "event", width: 42, height: 30, color: "#14b8a6" },
  { type: "tent", name: "Tent", category: "event", width: 80, height: 80, color: "#10b981" },
  { type: "table", name: "Table", category: "event", width: 50, height: 30, color: "#6366f1" },
  { type: "barrier", name: "Barrier", category: "event", width: 40, height: 10, color: "#ef4444" },
  { type: "signage", name: "Signage", category: "event", width: 30, height: 20, color: "#06b6d4" },
  { type: "registration-desk", name: "Registration Desk", category: "event", width: 70, height: 28, color: "#a16207" },
  { type: "podium", name: "Podium", category: "event", width: 24, height: 24, color: "#92400e" },
  { type: "microphone", name: "Microphone", category: "event", width: 14, height: 28, color: "#475569" },
  { type: "queue-post", name: "Queue Post", category: "event", width: 16, height: 16, color: "#be123c" },
];

export function getEventFurnitureTemplate(type: string): EventFurnitureTemplate {
  return EVENT_FURNITURE_TEMPLATES.find((template) => template.type === type)
    || EVENT_FURNITURE_TEMPLATES[0];
}

export function EventAssetVisual({ type, label, className = "" }: { type: string; label: string; className?: string }) {
  return <CanvasAssetVisual assetKey={type} label={label} className={className} />;
}

export function eventFurnitureFromTemplate(template: EventFurnitureTemplate, x: number, y: number, id: string): FloorFurniture {
  return {
    id,
    type: template.type,
    name: template.name,
    category: template.category,
    x,
    y,
    width: template.width,
    height: template.height,
    rotation: 0,
    color: template.color,
    assetKey: template.assetKey ?? template.type,
    layer: "events",
  };
}
