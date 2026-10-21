import { useCallback, useEffect, useRef, useState } from "react";
import type { StudentCameraMode, StudentRoutePhase } from "../lib/studentRouteFlow";

export const ARRIVAL_SOUND_PREFERENCE_KEY = "plv-navsync-arrival-sound-enabled";
export const ARRIVAL_CHIME_VOLUME = 0.28;
const ARRIVAL_CHIME_SRC = `${import.meta.env.BASE_URL}audio/plv_navsync_arrival_chime.mp3`;

function readArrivalSoundPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ARRIVAL_SOUND_PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Plays one gentle confirmation when Follow reaches its committed arrival
 * state. The route UI phase is committed only after the shared player reaches
 * the canonical endpoint, so presentation-only rerenders cannot trigger it.
 */
export function useArrivalChime(phase: StudentRoutePhase, camera: StudentCameraMode) {
  const [enabled, setEnabledState] = useState(readArrivalSoundPreference);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const followWasActiveRef = useRef(false);
  const arrivalHandledRef = useRef(false);

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    if (!nextEnabled) {
      try { audioRef.current?.pause(); } catch { /* Muting must not affect navigation controls. */ }
    }
    try {
      window.localStorage.setItem(ARRIVAL_SOUND_PREFERENCE_KEY, nextEnabled ? "on" : "off");
    } catch {
      // Storage can be blocked by browser privacy settings. Sound remains
      // usable for the current session even when the preference cannot persist.
    }
  }, []);

  // Warm the small public asset before a route finishes so playback can begin
  // alongside the arrival card animation rather than waiting on a new request.
  useEffect(() => {
    if (!enabled || typeof Audio === "undefined") return;
    try {
      const audio = audioRef.current ?? new Audio(ARRIVAL_CHIME_SRC);
      audioRef.current = audio;
      audio.preload = "auto";
      audio.load();
    } catch {
      // Preloading is opportunistic; the arrival itself remains unaffected.
    }
  }, [enabled]);

  useEffect(() => {
    if (phase === "navigating") {
      followWasActiveRef.current = true;
      arrivalHandledRef.current = false;
      return;
    }

    if (phase !== "arrived") {
      followWasActiveRef.current = false;
      return;
    }

    if (!followWasActiveRef.current || arrivalHandledRef.current) return;
    // Mark the event handled before touching browser audio APIs. A rejected
    // autoplay promise or duplicate React effect must never stack/retry it.
    arrivalHandledRef.current = true;
    followWasActiveRef.current = false;
    if (!enabled || camera !== "follow" || typeof Audio === "undefined") return;

    try {
      const audio = audioRef.current ?? new Audio(ARRIVAL_CHIME_SRC);
      audioRef.current = audio;
      try { audio.volume = ARRIVAL_CHIME_VOLUME; } catch { /* The platform may use its system volume. */ }
      try { audio.pause(); } catch { /* Keep unsupported audio controls non-fatal. */ }
      try { audio.currentTime = 0; } catch { /* Continue from the media element's current position. */ }
      void audio.play().catch(() => {
        // Browsers may reject playback until the user has interacted with the
        // page. Navigation and arrival continue without surfacing an error.
      });
    } catch {
      // Audio construction and seeking are also allowed to fail silently.
    }
  }, [camera, enabled, phase]);

  return { enabled, setEnabled };
}
