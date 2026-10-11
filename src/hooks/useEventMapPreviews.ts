import { useCallback, useEffect, useState } from "react";
import type { PublicEventPreview } from "../types/eventPreview";
import { usePublishedEventPreviews } from "./usePublishedEventPreviews";

export function useEventMapPreviews(input: {
  campusId?: string;
  enabled: boolean;
  open: boolean;
  /** Retained for existing call sites; public preview data is keyed by campus. */
  identityKey?: string;
}): {
  events: PublicEventPreview[];
  loading: boolean;
  error: string | null;
  nowMs: number;
  refresh: () => Promise<void>;
} {
  const feed = usePublishedEventPreviews({
    campusId: input.campusId,
    enabled: input.enabled && input.open,
  });
  const [wallClockMs, setWallClockMs] = useState(() => Date.now());
  const enabled = input.enabled && input.open;

  useEffect(() => {
    if (!enabled) return;
    const clock = window.setInterval(() => setWallClockMs(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, [enabled]);

  const refresh = useCallback(() => feed.refresh(true), [feed.refresh]);
  return {
    events: feed.events,
    loading: feed.loading,
    error: feed.error,
    nowMs: wallClockMs + feed.serverOffsetMs,
    refresh,
  };
}
