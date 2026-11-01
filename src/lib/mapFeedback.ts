export const MAP_SOUND_PREFERENCE_KEY = "plv-navsync-arrival-sound-enabled";
export const MAP_HAPTIC_PREFERENCE_KEY = "plv-navsync-haptic-feedback-enabled";
export const MAP_FEEDBACK_PREFERENCE_EVENT = "plv-navsync-map-feedback-preferences-changed";

export interface MapFeedbackPreferences {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

export function readMapFeedbackPreferences(): MapFeedbackPreferences {
  if (typeof window === "undefined") return { soundEnabled: false, hapticsEnabled: true };
  try {
    return {
      soundEnabled: window.localStorage.getItem(MAP_SOUND_PREFERENCE_KEY) === "on",
      hapticsEnabled: window.localStorage.getItem(MAP_HAPTIC_PREFERENCE_KEY) !== "off",
    };
  } catch {
    return { soundEnabled: false, hapticsEnabled: true };
  }
}

export function saveMapFeedbackPreference(key: keyof MapFeedbackPreferences, enabled: boolean): void {
  if (typeof window === "undefined") return;
  const storageKey = key === "soundEnabled" ? MAP_SOUND_PREFERENCE_KEY : MAP_HAPTIC_PREFERENCE_KEY;
  try {
    window.localStorage.setItem(storageKey, enabled ? "on" : "off");
    window.dispatchEvent(new Event(MAP_FEEDBACK_PREFERENCE_EVENT));
  } catch {
    // Preferences remain available for this view even when storage is blocked.
  }
}

export type MapFeedbackEvent = "scan-success" | "scan-error" | "arrival";

export function triggerMapHapticFeedback(event: MapFeedbackEvent): void {
  if (!readMapFeedbackPreferences().hapticsEnabled || typeof navigator === "undefined") return;
  const vibrate = navigator.vibrate;
  if (typeof vibrate !== "function") return;
  try {
    vibrate.call(navigator, event === "scan-error" ? [14, 24, 14] : event === "arrival" ? [18, 28, 24] : [24]);
  } catch {
    // Haptics are optional and must never block map interactions.
  }
}

/** A tiny synthesized cue avoids loading a large audio dependency or asset. */
export function triggerMapFeedbackSound(event: MapFeedbackEvent): void {
  if (!readMapFeedbackPreferences().soundEnabled || typeof window === "undefined" || !window.AudioContext) return;
  let context: AudioContext;
  try {
    context = new window.AudioContext();
  } catch {
    return;
  }

  const play = () => {
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(event === "scan-error" ? 440 : event === "arrival" ? 660 : 880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (event === "arrival" ? 0.19 : 0.105));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { void context.close().catch(() => undefined); };
      oscillator.start(now);
      oscillator.stop(now + (event === "arrival" ? 0.2 : 0.115));
    } catch {
      void context.close().catch(() => undefined);
    }
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => { void context.close().catch(() => undefined); });
  } else play();
}

export function triggerMapFeedback(event: MapFeedbackEvent): void {
  triggerMapHapticFeedback(event);
  triggerMapFeedbackSound(event);
}
