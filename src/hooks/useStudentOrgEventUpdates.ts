import { useMemo, useSyncExternalStore } from "react";
import type { CampusEventOverlay } from "../components/map-builder/types";
import { eventOverlayService } from "../services/eventOverlayService";
import { EVENT_REVIEW_READ_EVENT, eventReviewFingerprint, eventReviewSeenPrefix, isEventReviewUnread, markEventReviewRead } from "../lib/studentEventUpdates";

interface Snapshot {
  events: CampusEventOverlay[];
  loading: boolean;
  error: string;
  unreadIds: ReadonlySet<string>;
  unreadCount: number;
}
const EMPTY: Snapshot = { events: [], loading: false, error: "", unreadIds: new Set(), unreadCount: 0 };
type ReadResult = "saved" | "memory" | "changed";

function createStore(ownerId: string) {
  let snapshot: Snapshot = { ...EMPTY, loading: true };
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const memoryRead = new Map<string, string>();
  const publish = (patch: Partial<Snapshot> = {}) => {
    const events = patch.events ?? snapshot.events;
    const unreadIds = new Set(events.filter(event => {
      const fingerprint = eventReviewFingerprint(event);
      return isEventReviewUnread(ownerId, event) && memoryRead.get(event.id) !== fingerprint;
    }).map(event => event.id));
    snapshot = { ...snapshot, ...patch, events, unreadIds, unreadCount: unreadIds.size };
    listeners.forEach(listener => listener());
  };
  const refresh = async () => {
    if (!listeners.size) return;
    const request = ++generation;
    if (!snapshot.events.length && !snapshot.error) publish({ loading: true });
    try {
      const events = await eventOverlayService.listEventOverlays({ allCampuses: true, createdByUserId: ownerId, strict: true });
      if (request !== generation || !listeners.size) return;
      publish({ events: events.filter(event => event.createdByUserId === ownerId), loading: false, error: "" });
    } catch (error) {
      if (request !== generation || !listeners.size) return;
      publish({ loading: false, error: error instanceof Error ? error.message : "Could not load event updates. Please retry." });
    }
  };
  const onFocus = () => { if (document.visibilityState !== "hidden") void refresh(); };
  const onRead = (event: Event) => {
    if ((event as CustomEvent<{ ownerId: string }>).detail?.ownerId === ownerId) publish();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(eventReviewSeenPrefix(ownerId))) publish();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      void refresh();
      timer = setInterval(onFocus, 15000);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      window.addEventListener(EVENT_REVIEW_READ_EVENT, onRead);
      window.addEventListener("storage", onStorage);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      ++generation;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(EVENT_REVIEW_READ_EVENT, onRead);
      window.removeEventListener("storage", onStorage);
      snapshot = { ...EMPTY, loading: true };
    };
  };
  const markRead = (displayed: CampusEventOverlay): ReadResult => {
    const current = snapshot.events.find(event => event.id === displayed.id);
    const fingerprint = eventReviewFingerprint(displayed);
    if (!current || current.createdByUserId !== ownerId || !fingerprint || fingerprint !== eventReviewFingerprint(current)) return "changed";
    if (markEventReviewRead(ownerId, displayed)) { memoryRead.delete(displayed.id); publish(); return "saved"; }
    memoryRead.set(displayed.id, fingerprint);
    publish();
    return "memory";
  };
  return { subscribe, getSnapshot: () => snapshot, refresh, markRead };
}

const stores = new Map<string, ReturnType<typeof createStore>>();
const noSubscribe = () => () => {};
const getEmpty = () => EMPTY;
const noopRefresh = async () => {};
const noopRead = (): ReadResult => "changed";

export function useStudentOrgEventUpdates(ownerId: string | undefined, enabled: boolean) {
  const store = useMemo(() => {
    if (!ownerId || !enabled) return undefined;
    let value = stores.get(ownerId);
    if (!value) { value = createStore(ownerId); stores.set(ownerId, value); }
    return value;
  }, [ownerId, enabled]);
  const snapshot = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getSnapshot ?? getEmpty, getEmpty);
  return { ...snapshot, refresh: store?.refresh ?? noopRefresh, markRead: store?.markRead ?? noopRead };
}
