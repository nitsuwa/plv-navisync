import { useCallback, useEffect, useState } from "react";
import { eventOverlayService } from "../services/eventOverlayService";
import type { PublicEventFeed, PublicEventPreview } from "../types/eventPreview";

const EVENT_PREVIEW_FRESH_MS = 60_000;
const EVENT_PREVIEW_RETRY_BASE_MS = 15_000;
const EVENT_PREVIEW_RETRY_MAX_MS = 5 * 60_000;

export interface PublishedEventPreviewSnapshot {
  campusId: string | null;
  events: PublicEventPreview[];
  serverNow: string | null;
  serverOffsetMs: number;
  receivedAt: number | null;
  loading: boolean;
  error: string | null;
}

interface CampusEventPreviewFeed {
  snapshot: PublishedEventPreviewSnapshot;
  listeners: Set<(snapshot: PublishedEventPreviewSnapshot) => void>;
  inFlight: Promise<void> | null;
  pollTimer: number | null;
  failures: number;
  retryAt: number;
}

const feeds = new Map<string, CampusEventPreviewFeed>();
let activeSubscriberCount = 0;
let lifecycleListenersAttached = false;

function emptySnapshot(campusId: string | null): PublishedEventPreviewSnapshot {
  return {
    campusId,
    events: [],
    serverNow: null,
    serverOffsetMs: 0,
    receivedAt: null,
    loading: false,
    error: null,
  };
}

function getFeed(campusId: string): CampusEventPreviewFeed {
  let feed = feeds.get(campusId);
  if (!feed) {
    feed = {
      snapshot: emptySnapshot(campusId),
      listeners: new Set(),
      inFlight: null,
      pollTimer: null,
      failures: 0,
      retryAt: 0,
    };
    feeds.set(campusId, feed);
  }
  return feed;
}

function publish(feed: CampusEventPreviewFeed) {
  for (const listener of feed.listeners) listener(feed.snapshot);
}

function clearPoll(feed: CampusEventPreviewFeed) {
  if (feed.pollTimer === null) return;
  window.clearTimeout(feed.pollTimer);
  feed.pollTimer = null;
}

function schedulePoll(campusId: string, feed: CampusEventPreviewFeed) {
  clearPoll(feed);
  if (feed.listeners.size === 0 || feed.inFlight) return;

  const now = Date.now();
  const nextAt = feed.snapshot.error
    ? Math.max(feed.retryAt, now)
    : feed.snapshot.receivedAt === null
      ? Math.max(feed.retryAt, now)
      : feed.snapshot.receivedAt + EVENT_PREVIEW_FRESH_MS;
  const visibleAt = document.visibilityState === "hidden"
    ? Math.max(nextAt, now + EVENT_PREVIEW_FRESH_MS)
    : nextAt;
  feed.pollTimer = window.setTimeout(() => {
    feed.pollTimer = null;
    if (document.visibilityState !== "hidden") void refreshFeed(campusId, feed, false);
    else schedulePoll(campusId, feed);
  }, Math.max(0, visibleAt - now));
}

function retryDelay(failures: number) {
  return Math.min(EVENT_PREVIEW_RETRY_MAX_MS, EVENT_PREVIEW_RETRY_BASE_MS * (2 ** Math.max(0, failures - 1)));
}

function refreshFeed(campusId: string, feed: CampusEventPreviewFeed, force: boolean): Promise<void> {
  if (feed.inFlight) return feed.inFlight;

  const now = Date.now();
  if (feed.snapshot.error && now < feed.retryAt) {
    schedulePoll(campusId, feed);
    return Promise.resolve();
  }
  if (!force && now < feed.retryAt) {
    schedulePoll(campusId, feed);
    return Promise.resolve();
  }
  if (!force && !feed.snapshot.error && feed.snapshot.receivedAt !== null && now - feed.snapshot.receivedAt < EVENT_PREVIEW_FRESH_MS) {
    schedulePoll(campusId, feed);
    return Promise.resolve();
  }

  clearPoll(feed);
  feed.snapshot = {
    ...feed.snapshot,
    loading: feed.snapshot.receivedAt === null,
    error: null,
  };
  publish(feed);

  const request = (async () => {
    try {
      const result: PublicEventFeed = await eventOverlayService.listPublishedEventPreviews(campusId);
      const receivedAt = Date.now();
      const serverTime = Date.parse(result.serverNow);
      feed.failures = 0;
      feed.retryAt = receivedAt + EVENT_PREVIEW_FRESH_MS;
      feed.snapshot = {
        campusId,
        events: result.events,
        serverNow: result.serverNow,
        serverOffsetMs: Number.isFinite(serverTime) ? serverTime - receivedAt : 0,
        receivedAt,
        loading: false,
        error: null,
      };
    } catch (cause) {
      feed.failures += 1;
      feed.retryAt = Date.now() + retryDelay(feed.failures);
      feed.snapshot = {
        ...feed.snapshot,
        loading: false,
        error: cause instanceof Error ? cause.message : "Event previews could not be loaded.",
      };
    } finally {
      feed.inFlight = null;
      publish(feed);
      schedulePoll(campusId, feed);
    }
  })();

  feed.inFlight = request;
  return request;
}

function refreshActiveFeeds() {
  if (document.visibilityState === "hidden") return;
  feeds.forEach((feed, campusId) => {
    if (feed.listeners.size > 0) void refreshFeed(campusId, feed, false);
  });
}

function attachLifecycleListeners() {
  if (lifecycleListenersAttached || typeof window === "undefined") return;
  window.addEventListener("focus", refreshActiveFeeds);
  window.addEventListener("online", refreshActiveFeeds);
  document.addEventListener("visibilitychange", refreshActiveFeeds);
  lifecycleListenersAttached = true;
}

function detachLifecycleListeners() {
  if (!lifecycleListenersAttached || activeSubscriberCount > 0) return;
  window.removeEventListener("focus", refreshActiveFeeds);
  window.removeEventListener("online", refreshActiveFeeds);
  document.removeEventListener("visibilitychange", refreshActiveFeeds);
  lifecycleListenersAttached = false;
}

function subscribeToFeed(campusId: string, listener: (snapshot: PublishedEventPreviewSnapshot) => void) {
  const feed = getFeed(campusId);
  feed.listeners.add(listener);
  activeSubscriberCount += 1;
  attachLifecycleListeners();
  listener(feed.snapshot);
  void refreshFeed(campusId, feed, false);
  schedulePoll(campusId, feed);

  return () => {
    if (!feed.listeners.delete(listener)) return;
    activeSubscriberCount = Math.max(0, activeSubscriberCount - 1);
    if (feed.listeners.size === 0) clearPoll(feed);
    detachLifecycleListeners();
  };
}

export function usePublishedEventPreviews(input: {
  campusId?: string | null;
  enabled: boolean;
}): PublishedEventPreviewSnapshot & { refresh: (force?: boolean) => Promise<void> } {
  const campusId = input.campusId?.trim() || null;
  const [snapshot, setSnapshot] = useState(() => campusId ? getFeed(campusId).snapshot : emptySnapshot(null));

  useEffect(() => {
    if (!input.enabled || !campusId) {
      setSnapshot(emptySnapshot(campusId));
      return;
    }
    return subscribeToFeed(campusId, setSnapshot);
  }, [campusId, input.enabled]);

  const refresh = useCallback((force = true) => {
    if (!input.enabled || !campusId) return Promise.resolve();
    return refreshFeed(campusId, getFeed(campusId), force);
  }, [campusId, input.enabled]);

  const currentSnapshot = input.enabled && snapshot.campusId === campusId
    ? snapshot
    : emptySnapshot(campusId);
  return { ...currentSnapshot, refresh };
}
