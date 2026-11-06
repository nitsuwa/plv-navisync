import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_SOUND_PREFERENCE_KEY, triggerMapFeedbackSound } from "../mapFeedback";

describe("NaviBuddy save confirmation sound", () => {
  const originalAudioContext = window.AudioContext;
  afterEach(() => {
    localStorage.clear();
    if (originalAudioContext) Object.defineProperty(window, "AudioContext", { configurable: true, value: originalAudioContext });
    else Reflect.deleteProperty(window, "AudioContext");
  });

  it("does not construct audio when Sound Effects is disabled", () => {
    const construct = vi.fn();
    Object.defineProperty(window, "AudioContext", { configurable: true, value: construct });
    localStorage.setItem(MAP_SOUND_PREFERENCE_KEY, "off");
    triggerMapFeedbackSound("save-success");
    expect(construct).not.toHaveBeenCalled();
  });

  it("plays a quiet 240 ms rising confirmation when Sound Effects is enabled", () => {
    const oscillator = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null,
    };
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    const close = vi.fn().mockResolvedValue(undefined);
    const AudioContextMock = vi.fn(function () {
      return { currentTime: 2, state: "running", destination: {}, createOscillator: () => oscillator, createGain: () => gain, close };
    });
    Object.defineProperty(window, "AudioContext", { configurable: true, value: AudioContextMock });
    localStorage.setItem(MAP_SOUND_PREFERENCE_KEY, "on");

    triggerMapFeedbackSound("save-success");

    expect(AudioContextMock).toHaveBeenCalledOnce();
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(740, 2);
    expect(oscillator.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(988, 2.11);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.028, 2.012);
    expect(oscillator.start).toHaveBeenCalledWith(2);
    expect(oscillator.stop).toHaveBeenCalledWith(2.24);
    expect(oscillator.onended).toBeTypeOf("function");
  });
});
