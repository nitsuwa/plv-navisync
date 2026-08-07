import { useRef, useCallback, useState } from "react";
import type { FloorUndoEntry } from "./types";

const MAX_HISTORY = 30;

/**
 * Hook that provides undo/redo history for a floor's complete editing state —
 * rooms, paths, walls, doors, windows, furniture, stairs, ramps, elevators and
 * labels. Call `pushHistory(entry)` with the FULL state that existed BEFORE a
 * change began; `undo()`/`redo()` return the restored entry.
 *
 * A version state is bumped on every mutation so canUndo/canRedo (derived from
 * the history ref) recompute on re-render, keeping disabled button states and
 * shortcut availability accurate even when no floor update follows (e.g. the
 * history reset that happens when switching floors).
 */
export function useFloorHistory(initial: FloorUndoEntry) {
  const historyRef = useRef<{ entries: FloorUndoEntry[]; idx: number }>({
    entries: [structuredClone(initial)],
    idx: 0,
  });
  // Bumped on every mutation purely to recompute canUndo/canRedo below.
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const pushHistory = useCallback((entry: FloorUndoEntry) => {
    const h = historyRef.current;
    const pruned = h.entries.slice(0, h.idx + 1);
    pruned.push(structuredClone(entry));
    if (pruned.length > MAX_HISTORY) pruned.shift();
    historyRef.current = { entries: pruned, idx: pruned.length - 1 };
    bump();
  }, [bump]);

  const undo = useCallback((): FloorUndoEntry | null => {
    const h = historyRef.current;
    if (h.idx <= 0) return null;
    const newIdx = h.idx - 1;
    historyRef.current = { ...h, idx: newIdx };
    bump();
    return h.entries[newIdx];
  }, [bump]);

  const redo = useCallback((): FloorUndoEntry | null => {
    const h = historyRef.current;
    if (h.idx >= h.entries.length - 1) return null;
    const newIdx = h.idx + 1;
    historyRef.current = { ...h, idx: newIdx };
    bump();
    return h.entries[newIdx];
  }, [bump]);

  /** Reset history when switching floors */
  const resetHistory = useCallback((entry: FloorUndoEntry) => {
    historyRef.current = { entries: [structuredClone(entry)], idx: 0 };
    bump();
  }, [bump]);

  return {
    pushHistory,
    undo,
    redo,
    resetHistory,
    canUndo: historyRef.current.idx > 0,
    canRedo: historyRef.current.idx < historyRef.current.entries.length - 1,
  };
}
