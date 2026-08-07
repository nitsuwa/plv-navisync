import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFloorHistory } from "../useFloorHistory";
import type { FloorUndoEntry } from "../types";

function entry(overrides: Partial<FloorUndoEntry> = {}): FloorUndoEntry {
  return {
    rooms: [{ id: "r1", buildingId: "b1", floorId: "f1", name: "Room 1", type: "classroom", x: 10, y: 10, w: 50, h: 30 }],
    paths: [],
    walls: [{ id: "w1", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4, color: "#000" }],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
    ...overrides,
  };
}

/** Run an action inside act() and return its captured value (act returns a thenable). */
function actResult<T>(fn: () => T): T {
  let out!: T;
  act(() => { out = fn(); });
  return out;
}

describe("useFloorHistory (full-floor undo/redo)", () => {
  it("snapshots and restores walls, not just rooms/paths", () => {
    const { result } = renderHook(() => useFloorHistory(entry()));

    const pre = entry();
    actResult(() => result.current.pushHistory(pre));
    actResult(() => result.current.pushHistory(entry({ walls: [{ id: "w1", x1: 40, y1: 0, x2: 140, y2: 0, thickness: 4, color: "#000" }] })));

    const undone = actResult(() => result.current.undo());
    expect(undone?.walls[0].x1).toBe(0);
    expect(undone?.rooms[0].id).toBe("r1");

    const redone = actResult(() => result.current.redo());
    expect(redone?.walls[0].x1).toBe(40);
  });

  it("exposes accurate canUndo/canRedo as history changes", () => {
    const { result } = renderHook(() => useFloorHistory(entry()));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    actResult(() => result.current.pushHistory(entry({ labels: [{ id: "l1", x: 5, y: 5, text: "A", fontSize: 12, color: "#000", rotation: 0 }] })));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    actResult(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    actResult(() => result.current.redo());
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo returns null at the boundary and never rewinds below the first snapshot", () => {
    const { result } = renderHook(() => useFloorHistory(entry()));
    expect(actResult(() => result.current.undo())).toBeNull();
    actResult(() => result.current.pushHistory(entry({ labels: [] })));
    actResult(() => result.current.undo());
    expect(actResult(() => result.current.undo())).toBeNull();
  });

  it("discards the redo branch when a new push happens after undo", () => {
    const { result } = renderHook(() => useFloorHistory(entry()));
    actResult(() => result.current.pushHistory(entry({ walls: [] })));      // edit A
    actResult(() => result.current.pushHistory(entry({ rooms: [] })));      // edit B
    actResult(() => result.current.undo());                                  // back to A
    expect(result.current.canRedo).toBe(true);
    actResult(() => result.current.pushHistory(entry({ doors: [{ id: "d1", x: 5, y: 5, width: 8, direction: "left", color: "#000" }] }))); // new branch
    expect(result.current.canRedo).toBe(false);
  });

  it("resetHistory isolates the floor (switching floors clears history)", () => {
    const { result } = renderHook(() => useFloorHistory(entry()));
    actResult(() => result.current.pushHistory(entry({ walls: [] })));
    expect(result.current.canUndo).toBe(true);
    actResult(() => result.current.resetHistory(entry({ rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] })));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(actResult(() => result.current.undo())).toBeNull();
  });

  it("caps history at MAX_HISTORY (oldest pruned)", () => {
    const { result } = renderHook(() => useFloorHistory(entry()));
    // 31 pushes → entries = initial + 30 pushes (31 total, oldest pruned)
    for (let i = 0; i < 31; i++) actResult(() => result.current.pushHistory(entry()));
    let undoCount = 0;
    for (let i = 0; i < 40; i++) {
      const e = actResult(() => result.current.undo());
      if (!e) break;
      undoCount++;
    }
    expect(undoCount).toBeLessThanOrEqual(30);
  });
});
