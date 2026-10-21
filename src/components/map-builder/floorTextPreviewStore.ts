import { useCallback, useSyncExternalStore } from "react";

/** A tiny keyed store for text that should preview in one canvas label without
 * publishing a Floor/Campus update on every keystroke. */
export interface FloorTextPreviewStore {
  get: (key: string) => string | undefined;
  subscribe: (key: string, listener: () => void) => () => void;
  set: (key: string, value: string | undefined) => void;
}

export type FloorTextDraftTarget =
  | { type: "room"; id: string; field: "name" | "description" }
  | { type: "door"; id: string; field: "label" }
  | { type: "furniture"; id: string; field: "name" }
  | { type: "stairs" | "ramp" | "elevator"; id: string; field: "label" }
  | { type: "label"; id: string; field: "text" };

export function createFloorTextPreviewStore(): FloorTextPreviewStore {
  const values = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (key) => values.get(key),
    subscribe: (key, listener) => {
      const subscribers = listeners.get(key) ?? new Set<() => void>();
      subscribers.add(listener);
      listeners.set(key, subscribers);
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(key);
      };
    },
    set: (key, value) => {
      if (values.get(key) === value) return;
      if (value === undefined) values.delete(key);
      else values.set(key, value);
      listeners.get(key)?.forEach((listener) => listener());
    },
  };
}

export function useFloorTextPreview(
  store: FloorTextPreviewStore | undefined,
  key: string | undefined,
  fallback: string,
): string {
  const subscribe = useCallback((listener: () => void) => (
    store && key ? store.subscribe(key, listener) : () => undefined
  ), [key, store]);
  const getSnapshot = useCallback(() => (
    store && key ? store.get(key) : undefined
  ), [key, store]);
  const preview = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return preview ?? fallback;
}

export function floorRoomNamePreviewKey(floorId: string, roomId: string): string {
  return floorTextPreviewKey(floorId, "room", roomId, "name");
}

export function floorTextPreviewKey(floorId: string, type: string, id: string, field: string): string {
  return `${floorId}\u0000${type}\u0000${id}\u0000${field}`;
}
