import { useRef, useCallback } from "react";
import type { FloorRoom, FloorPath, FloorUndoEntry } from "./types";

const MAX_HISTORY = 30;

/**
 * Hook that provides undo/redo history for a floor's rooms and paths.
 * Works alongside FloorEditor's updFloor to snapshot before changes.
 */
export function useFloorHistory(initialRooms: FloorRoom[], initialPaths: FloorPath[]) {
  const historyRef = useRef<{ entries: FloorUndoEntry[]; idx: number }>({
    entries: [{ rooms: structuredClone(initialRooms), paths: structuredClone(initialPaths) }],
    idx: 0,
  });

  const pushHistory = useCallback((rooms: FloorRoom[], paths: FloorPath[]) => {
    const h = historyRef.current;
    const pruned = h.entries.slice(0, h.idx + 1);
    pruned.push({ rooms: structuredClone(rooms), paths: structuredClone(paths) });
    if (pruned.length > MAX_HISTORY) pruned.shift();
    historyRef.current = { entries: pruned, idx: pruned.length - 1 };
  }, []);

  const undo = useCallback((): FloorUndoEntry | null => {
    const h = historyRef.current;
    if (h.idx <= 0) return null;
    const newIdx = h.idx - 1;
    historyRef.current = { ...h, idx: newIdx };
    return h.entries[newIdx];
  }, []);

  const redo = useCallback((): FloorUndoEntry | null => {
    const h = historyRef.current;
    if (h.idx >= h.entries.length - 1) return null;
    const newIdx = h.idx + 1;
    historyRef.current = { ...h, idx: newIdx };
    return h.entries[newIdx];
  }, []);

  /** Reset history when switching floors */
  const resetHistory = useCallback((rooms: FloorRoom[], paths: FloorPath[]) => {
    historyRef.current = {
      entries: [{ rooms: structuredClone(rooms), paths: structuredClone(paths) }],
      idx: 0,
    };
  }, []);

  return { pushHistory, undo, redo, resetHistory };
}
