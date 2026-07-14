import { useState, useCallback, useRef } from "react";

/**
 * Generic undo/redo hook with deep-snapshot history.
 * Stores up to `maxHistory` snapshots.
 * Returns the current value, a setter that records history,
 * undo/redo functions, and whether each action is available.
 */
export function useUndoRedo<T>(initial: T, maxHistory = 30) {
  const [current, setCurrent] = useState<T>(initial);
  const historyRef  = useRef<T[]>([structuredClone(initial)]);
  const indexRef    = useRef(0);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setCurrent(prev => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      const history  = historyRef.current;
      const idx      = indexRef.current;

      // Discard any future redo branches
      const pruned = history.slice(0, idx + 1);
      pruned.push(structuredClone(resolved));
      if (pruned.length > maxHistory) pruned.shift();
      historyRef.current = pruned;
      indexRef.current   = pruned.length - 1;

      return resolved;
    });
  }, [maxHistory]);

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    setCurrent(structuredClone(historyRef.current[indexRef.current]));
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    setCurrent(structuredClone(historyRef.current[indexRef.current]));
  }, []);

  const reset = useCallback((val: T) => {
    historyRef.current = [structuredClone(val)];
    indexRef.current   = 0;
    setCurrent(val);
  }, []);

  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;
  const step    = indexRef.current;
  const steps   = historyRef.current.length;

  return { current, set, undo, redo, reset, canUndo, canRedo, step, steps };
}
