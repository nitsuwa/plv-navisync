import { useCallback, useEffect, useRef, useState } from "react";
import { eventOverlayService } from "../services/eventOverlayService";
import type { PublicEventPreview } from "../types/eventPreview";

interface FeedResult {
  serverNow: string;
  events: PublicEventPreview[];
}

export function useEventMapPreviews(input: {
  campusId?: string;
  enabled: boolean;
  open: boolean;
  identityKey: string;
}): {
  events: PublicEventPreview[];
  loading: boolean;
  error: string | null;
  nowMs: number;
  refresh: () => Promise<void>;
} {
  const { campusId, enabled, open, identityKey } = input;
  const [events, setEvents] = useState<PublicEventPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [wallClockMs, setWallClockMs] = useState(() => Date.now());
  const generation = useRef(0);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const eventsKey = `${campusId ?? ""}:${identityKey}:${enabled ? "1" : "0"}`;

  const refresh = useCallback(async () => {
    if (!enabled || !open || !campusId) return;
    const requestGeneration = ++generation.current;
    setError(null);
    setLoading((current) => current || eventsRef.current.length === 0);
    try {
      const feed: FeedResult = await eventOverlayService.listPublishedEventPreviews(campusId);
      if (requestGeneration !== generation.current) return;
      const receivedAt = Date.now();
      setEvents(feed.events);
      setServerOffsetMs(Date.parse(feed.serverNow) - receivedAt);
      setWallClockMs(receivedAt);
      setError(null);
    } catch (cause) {
      if (requestGeneration !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "Event previews could not be loaded.");
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }, [campusId, enabled, open]);

  useEffect(() => {
    generation.current += 1;
    setEvents([]);
    setError(null);
    setLoading(false);
    setServerOffsetMs(0);
    setWallClockMs(Date.now());
    if (!enabled || !open || !campusId) return;

    void refresh();
    const poll = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      generation.current += 1;
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // `eventsKey` intentionally invalidates responses and restarts polling when
    // campus/account/settings change; `refresh` is stable for the open session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey, open, campusId, enabled]);

  useEffect(() => {
    if (!enabled || !open) return;
    const clock = window.setInterval(() => setWallClockMs(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, [enabled, open]);

  return { events, loading, error, nowMs: wallClockMs + serverOffsetMs, refresh };
}
