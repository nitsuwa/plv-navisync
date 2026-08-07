import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoRedo } from "../useUndoRedo";

describe("useUndoRedo", () => {
  it("starts at the initial value with no history available", () => {
    const { result } = renderHook(() => useUndoRedo(0));
    expect(result.current.current).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.step).toBe(0);
  });

  it("records every set as a history snapshot and supports undo/redo", () => {
    const { result } = renderHook(() => useUndoRedo(0));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    expect(result.current.current).toBe(2);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.current).toBe(1);
    act(() => result.current.undo());
    expect(result.current.current).toBe(0);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    expect(result.current.current).toBe(1);
    act(() => result.current.redo());
    expect(result.current.current).toBe(2);
    expect(result.current.canRedo).toBe(false);
  });

  it("supports functional updates against the latest value", () => {
    const { result } = renderHook(() => useUndoRedo(10));
    act(() => result.current.set((prev) => prev + 5));
    expect(result.current.current).toBe(15);
  });

  it("discards the redo branch when a new set happens after undo", () => {
    const { result } = renderHook(() => useUndoRedo("a"));
    act(() => result.current.set("b"));
    act(() => result.current.set("c"));
    act(() => result.current.undo()); // back to "b"
    expect(result.current.current).toBe("b");
    act(() => result.current.set("d")); // replaces "c" branch
    expect(result.current.current).toBe("d");
    expect(result.current.canRedo).toBe(false);
    act(() => result.current.undo());
    expect(result.current.current).toBe("b");
  });

  it("caps history at maxHistory snapshots (oldest pruned)", () => {
    const { result } = renderHook(() => useUndoRedo(0, 3));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.set(3));
    expect(result.current.steps).toBe(3); // [1, 2, 3] — initial 0 pruned
    act(() => result.current.undo());
    expect(result.current.current).toBe(2);
    act(() => result.current.undo());
    expect(result.current.current).toBe(1);
    expect(result.current.canUndo).toBe(false); // initial 0 is no longer reachable
  });

  it("reset clears history and re-seeds the value", () => {
    const { result } = renderHook(() => useUndoRedo(0));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.reset(99));
    expect(result.current.current).toBe(99);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
