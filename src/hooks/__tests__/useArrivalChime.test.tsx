import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentCameraMode, StudentRoutePhase } from "../../lib/studentRouteFlow";
import { ARRIVAL_CHIME_VOLUME, ARRIVAL_SOUND_PREFERENCE_KEY, useArrivalChime } from "../useArrivalChime";

class MockAudio {
  static instances: MockAudio[] = [];
  static rejectNextPlay = false;
  preload = "";
  volume = 1;
  currentTime = 0;
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn(() => {
    if (MockAudio.rejectNextPlay) {
      MockAudio.rejectNextPlay = false;
      return Promise.reject(new Error("NotAllowedError"));
    }
    return Promise.resolve();
  });
  constructor(public src: string) { MockAudio.instances.push(this); }
}

describe("useArrivalChime", () => {
  beforeEach(() => {
    localStorage.clear();
    MockAudio.instances = [];
    MockAudio.rejectNextPlay = false;
    vi.stubGlobal("Audio", MockAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("plays once for a completed Follow arrival and ignores rerenders and view changes", () => {
    const { rerender } = renderHook<ReturnType<typeof useArrivalChime>, { phase: StudentRoutePhase; camera: StudentCameraMode }>(({ phase, camera }) => useArrivalChime(phase, camera), {
      initialProps: { phase: "preview" as const, camera: "explore" as const },
    });

    rerender({ phase: "navigating", camera: "follow" });
    rerender({ phase: "arrived", camera: "follow" });
    const audio = MockAudio.instances[0]!;
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(ARRIVAL_CHIME_VOLUME);

    rerender({ phase: "arrived", camera: "explore" });
    rerender({ phase: "arrived", camera: "follow" });
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("does not play in preview or for Explore-only arrival state", () => {
    const { rerender } = renderHook<ReturnType<typeof useArrivalChime>, { phase: StudentRoutePhase; camera: StudentCameraMode }>(({ phase, camera }) => useArrivalChime(phase, camera), {
      initialProps: { phase: "preview" as const, camera: "explore" as const },
    });
    rerender({ phase: "arrived", camera: "explore" });
    expect(MockAudio.instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);

    rerender({ phase: "navigating", camera: "explore" });
    rerender({ phase: "arrived", camera: "explore" });
    expect(MockAudio.instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it("allows one new chime after a new navigation run", () => {
    const { rerender } = renderHook<ReturnType<typeof useArrivalChime>, { phase: StudentRoutePhase }>(({ phase }) => useArrivalChime(phase, "follow"), {
      initialProps: { phase: "navigating" as const },
    });
    rerender({ phase: "arrived" });
    rerender({ phase: "navigating" });
    rerender({ phase: "arrived" });

    const audio = MockAudio.instances[0]!;
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("persists the off preference and never replays when it is changed after arrival", () => {
    const { result, rerender } = renderHook<ReturnType<typeof useArrivalChime>, { phase: StudentRoutePhase }>(({ phase }) => useArrivalChime(phase, "follow"), {
      initialProps: { phase: "navigating" as const },
    });
    act(() => result.current.setEnabled(false));
    expect(localStorage.getItem(ARRIVAL_SOUND_PREFERENCE_KEY)).toBe("off");
    rerender({ phase: "arrived" });
    expect(MockAudio.instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
    act(() => result.current.setEnabled(true));
    expect(localStorage.getItem(ARRIVAL_SOUND_PREFERENCE_KEY)).toBe("on");
    expect(MockAudio.instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it("reads a saved muted preference and gracefully absorbs autoplay rejection", async () => {
    localStorage.setItem(ARRIVAL_SOUND_PREFERENCE_KEY, "off");
    const muted = renderHook<ReturnType<typeof useArrivalChime>, { phase: StudentRoutePhase }>(({ phase }) => useArrivalChime(phase, "follow"), {
      initialProps: { phase: "navigating" as const },
    });
    expect(muted.result.current.enabled).toBe(false);
    muted.unmount();
    expect(MockAudio.instances).toHaveLength(0);

    localStorage.setItem(ARRIVAL_SOUND_PREFERENCE_KEY, "on");
    MockAudio.rejectNextPlay = true;
    const { rerender } = renderHook<ReturnType<typeof useArrivalChime>, { phase: StudentRoutePhase }>(({ phase }) => useArrivalChime(phase, "follow"), {
      initialProps: { phase: "navigating" as const },
    });
    expect(() => rerender({ phase: "arrived" })).not.toThrow();
    await act(async () => { await Promise.resolve(); });
    const audio = MockAudio.instances[0]!;
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
