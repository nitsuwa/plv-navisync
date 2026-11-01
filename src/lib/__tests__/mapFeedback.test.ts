import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_HAPTIC_PREFERENCE_KEY, MAP_SOUND_PREFERENCE_KEY, readMapFeedbackPreferences, saveMapFeedbackPreference, triggerMapHapticFeedback } from "../mapFeedback";

describe("map feedback preferences", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("defaults sound off and haptics on, then persists explicit preferences", () => {
    expect(readMapFeedbackPreferences()).toEqual({ soundEnabled: false, hapticsEnabled: true });
    saveMapFeedbackPreference("soundEnabled", true);
    saveMapFeedbackPreference("hapticsEnabled", false);
    expect(localStorage.getItem(MAP_SOUND_PREFERENCE_KEY)).toBe("on");
    expect(localStorage.getItem(MAP_HAPTIC_PREFERENCE_KEY)).toBe("off");
    expect(readMapFeedbackPreferences()).toEqual({ soundEnabled: true, hapticsEnabled: false });
  });

  it("uses a brief haptic cue when supported and quietly skips it when disabled", () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "vibrate");
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    try {
      triggerMapHapticFeedback("scan-success");
      expect(vibrate).toHaveBeenCalledWith([24]);
      saveMapFeedbackPreference("hapticsEnabled", false);
      triggerMapHapticFeedback("scan-success");
      expect(vibrate).toHaveBeenCalledOnce();
    } finally {
      if (previous) Object.defineProperty(navigator, "vibrate", previous);
      else Reflect.deleteProperty(navigator, "vibrate");
    }
  });
});
