import { snapValue } from "./eventLayoutGeometry";

export function eventSnapPoint(point: { x: number; y: number }, bounds: { width: number; height: number }, grid: number, enabled: boolean, bottomInset = 0) {
  return { x: Math.max(0, Math.min(bounds.width, enabled ? snapValue(point.x, grid) : point.x)), y: Math.max(0, Math.min(Math.max(0, bounds.height - bottomInset), enabled ? snapValue(point.y, grid) : point.y)) };
}
export function eventSnapDelta(value: number, grid: number, enabled: boolean) { return enabled ? snapValue(value, grid) : value; }
export function eventSnapRotation(value: number, enabled: boolean) {
  const normalized = ((value % 360) + 360) % 360;
  return (enabled ? Math.round(normalized / 15) * 15 : Math.round(normalized * 100) / 100) % 360;
}
