import { useMemo, useSyncExternalStore } from "react";
import type { CampusEventOverlay } from "../components/map-builder/types";
import { eventOverlayService } from "../services/eventOverlayService";
import { EVENT_REVIEW_READ_EVENT, eventReviewFingerprint, eventReviewSeenPrefix, isEventReviewUnread, markEventReviewRead } from "../lib/studentEventUpdates";
import { eventNotificationService, EventNotificationChanged, EventNotificationSyncUnavailable } from '../services/eventNotificationService';

interface Snapshot {
  events: CampusEventOverlay[];
  loading: boolean;
  error: string;
  receiptError: string;
  unreadIds: ReadonlySet<string>;
  unreadCount: number;
}
const EMPTY: Snapshot = { events: [], loading: false, error: "", receiptError: '', unreadIds: new Set(), unreadCount: 0 };
type ReadResult = "saved" | "local" | "memory" | "changed" | "failed";

function createStore(ownerId: string) {
  let snapshot: Snapshot = { ...EMPTY, loading: true };
  let generation = 0;
  let lifecycle = 0;
  let serverReceipts: Map<string,string> | undefined;
  const readRequests = new Map<string,Promise<ReadResult>>();
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const memoryRead = new Map<string, string>();
  const publish = (patch: Partial<Snapshot> = {}) => {
    const events = patch.events ?? snapshot.events;
    const unreadIds = new Set(events.filter(event => {
      const fingerprint = eventReviewFingerprint(event);
      if (serverReceipts) return Boolean(fingerprint && serverReceipts.get(event.id) !== fingerprint);
      return isEventReviewUnread(ownerId, event) && memoryRead.get(event.id) !== fingerprint;
    }).map(event => event.id));
    snapshot = { ...snapshot, ...patch, events, unreadIds, unreadCount: unreadIds.size };
    listeners.forEach(listener => listener());
  };
  const refresh = async (retrySync = true) => {
    if (!listeners.size) return;
    const request = ++generation;
    if (!snapshot.events.length && !snapshot.error) publish({ loading: true });
    try {
      const events = await eventOverlayService.listEventOverlays({ allCampuses: true, createdByUserId: ownerId, strict: true });
      if (request !== generation || !listeners.size) return;
      const owned = events.filter(event => event.createdByUserId === ownerId);
      let receiptError = '';
      try {
        const states = await eventNotificationService.getStates(ownerId,'org_review',owned,retrySync);
        if (request !== generation || !listeners.size) return;
        serverReceipts = new Map(owned.filter(event=>{const state=states.get(event.id);return state?.isCurrent && state.isRead;}).map(event=>[event.id,eventReviewFingerprint(event)!]));
      } catch (cause) {
        if (request !== generation || !listeners.size) return;
        if (cause instanceof EventNotificationSyncUnavailable) serverReceipts = undefined;
        receiptError = cause instanceof Error ? cause.message : 'Read status could not sync. Please retry.';
      }
      publish({ events: owned, loading: false, error: "", receiptError });
    } catch (error) {
      if (request !== generation || !listeners.size) return;
      publish({ loading: false, error: error instanceof Error ? error.message : "Could not load event updates. Please retry." });
    }
  };
  const onFocus = () => { if (document.visibilityState !== "hidden") void refresh(false); };
  const updateRead = () => { if(serverReceipts) void refresh(false); else publish(); };
  const onRead = (event: Event) => {
    if ((event as CustomEvent<{ ownerId: string }>).detail?.ownerId === ownerId) updateRead();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(eventReviewSeenPrefix(ownerId))) updateRead();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      void refresh(false);
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
      // Actor-scoped fallback receipts survive ordinary route changes, like the
      // browser receipt cache. They hold no event list and expire on reload.
      ++lifecycle; readRequests.clear(); serverReceipts = undefined;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(EVENT_REVIEW_READ_EVENT, onRead);
      window.removeEventListener("storage", onStorage);
      snapshot = { ...EMPTY, loading: true };
    };
  };
  const markRead = (displayed: CampusEventOverlay): Promise<ReadResult> => {
    const current = snapshot.events.find(event => event.id === displayed.id);
    const fingerprint = eventReviewFingerprint(displayed);
    if (!current || current.createdByUserId !== ownerId || !fingerprint || fingerprint !== eventReviewFingerprint(current)) return Promise.resolve("changed");
    const key = `${displayed.id}:${fingerprint}`;
    const pending = readRequests.get(key); if (pending) return pending;
    const session = lifecycle;
    const task = (async (): Promise<ReadResult> => {
      try {
        await eventNotificationService.acknowledge(ownerId,'org_review',displayed);
        if(session !== lifecycle || !listeners.size) return 'changed';
        const latest=snapshot.events.find(event=>event.id===displayed.id);
        if(!latest || eventReviewFingerprint(latest)!==fingerprint) return 'changed';
        ++generation;
        serverReceipts ??= new Map(); serverReceipts.set(displayed.id,fingerprint);
        memoryRead.delete(displayed.id); markEventReviewRead(ownerId,displayed);
        publish({loading:false,receiptError:''}); return 'saved';
      } catch(cause) {
        if(session !== lifecycle || !listeners.size) return 'changed';
        if(cause instanceof EventNotificationChanged) {void refresh(false);return 'changed';}
        if(cause instanceof EventNotificationSyncUnavailable) {
          serverReceipts=undefined;
          if(markEventReviewRead(ownerId,displayed)) {memoryRead.delete(displayed.id);publish({receiptError:cause.message});return 'local';}
          memoryRead.set(displayed.id,fingerprint);publish({receiptError:'Read for this visit only. Storage and cross-device sync are unavailable.'});return 'memory';
        }
        publish({receiptError:cause instanceof Error ? cause.message : 'Read status could not sync. Please retry.'});return 'failed';
      }
    })();
    readRequests.set(key,task);void task.finally(()=>{if(readRequests.get(key)===task) readRequests.delete(key);});return task;
  };
  return { subscribe, getSnapshot: () => snapshot, refresh, markRead };
}

const stores = new Map<string, ReturnType<typeof createStore>>();
const noSubscribe = () => () => {};
const getEmpty = () => EMPTY;
const noopRefresh = async () => {};
const noopRead = async (): Promise<ReadResult> => "changed";

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
