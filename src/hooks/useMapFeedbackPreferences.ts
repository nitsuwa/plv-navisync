import { useCallback, useEffect, useState } from "react";
import { MAP_FEEDBACK_PREFERENCE_EVENT, readMapFeedbackPreferences, saveMapFeedbackPreference } from "../lib/mapFeedback";

export function useMapFeedbackPreferences() {
  const [preferences, setPreferences] = useState(readMapFeedbackPreferences);

  useEffect(() => {
    const refresh = () => setPreferences(readMapFeedbackPreferences());
    window.addEventListener(MAP_FEEDBACK_PREFERENCE_EVENT, refresh);
    return () => window.removeEventListener(MAP_FEEDBACK_PREFERENCE_EVENT, refresh);
  }, []);

  const setSoundEnabled = useCallback((soundEnabled: boolean) => {
    setPreferences((current) => ({ ...current, soundEnabled }));
    saveMapFeedbackPreference("soundEnabled", soundEnabled);
  }, []);
  const setHapticsEnabled = useCallback((hapticsEnabled: boolean) => {
    setPreferences((current) => ({ ...current, hapticsEnabled }));
    saveMapFeedbackPreference("hapticsEnabled", hapticsEnabled);
  }, []);

  return { ...preferences, setSoundEnabled, setHapticsEnabled };
}
