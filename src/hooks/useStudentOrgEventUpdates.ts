import { useMemo, useSyncExternalStore } from "react";
import type { CampusEventOverlay } from "../components/map-builder/types";
import { eventOverlayService } from "../services/eventOverlayService";
import { eventOrganizationService } from "../services/eventOrganizationService";
import type { EventOrganizationContext, EventOrganizationHandoverSummary } from "../types/eventOrganization";
import { EVENT_REVIEW_READ_EVENT, eventReviewFingerprint, eventReviewSeenPrefix, hasEventHandoverWork, isEventReviewUnread, markEventReviewRead } from "../lib/studentEventUpdates";
import { eventNotificationService, EventNotificationChanged, EventNotificationSyncUnavailable } from '../services/eventNotificationService';

interface Snapshot {
  events: CampusEventOverlay[];
  handoverUpdates: EventOrganizationHandoverSummary[];
  loading: boolean;
  error: string;
  receiptError: string;
  unreadIds: ReadonlySet<string>;
  unreadCount: number;
}
const EMPTY: Snapshot = { events: [], handoverUpdates: [], loading: false, error: "", receiptError: '', unreadIds: new Set(), unreadCount: 0 };
type ReadResult = "saved" | "local" | "memory" | "changed" | "failed";
const HANDOVER_READ_PREFIX = "plv-navisync:event-handover-read:v1:";
const eventKey = (event: CampusEventOverlay) => `${event.organizationId ?? 'legacy'}:${event.id}`;

function handoverReadKey(ownerId: string, grantId: string) {
  return `${HANDOVER_READ_PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(grantId)}`;
}
function localHandoverRead(ownerId: string, grantId: string) {
  try { return window.localStorage.getItem(handoverReadKey(ownerId, grantId)) === 'read'; } catch { return false; }
}
function saveLocalHandoverRead(ownerId: string, grantId: string) {
  try { window.localStorage.setItem(handoverReadKey(ownerId, grantId), 'read'); return true; } catch { return false; }
}

function createStore(ownerId: string) {
  let snapshot: Snapshot = { ...EMPTY, loading: true };
  let generation = 0;
  let lifecycle = 0;
  let scopeKey = '';
  let contexts: EventOrganizationContext[] = [];
  let serverStates: Map<string, { isCurrent: boolean; isRead: boolean }> | undefined;
  let serverReceipts: Map<string, string> | undefined;
  const readRequests = new Map<string, Promise<ReadResult>>();
  let refreshInFlight: Promise<void> | null = null;
  let lastAutomaticRefreshAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const memoryRead = new Map<string, string>();
  const memoryHandoverRead = new Set<string>();
  const publish = (patch: Partial<Snapshot> = {}) => {
    const events = patch.events ?? snapshot.events;
    const unreadIds = new Set(events.filter(event => {
      const fingerprint = eventReviewFingerprint(event);
      if (!fingerprint) return false;
      if (event.organizationId) {
        // Organization review notifications require a grant-scoped server
        // eligibility result. Without it, old approvals must not look new.
        const state = serverStates?.get(event.id);
        return state?.isCurrent === true && state.isRead === false;
      }
      if (serverReceipts) return Boolean(serverStates?.get(event.id)?.isCurrent && !serverStates.get(event.id)?.isRead);
      return isEventReviewUnread(ownerId, event) && memoryRead.get(eventKey(event)) !== fingerprint;
    }).map(event => event.id));
    snapshot = { ...snapshot, ...patch, events, unreadIds, unreadCount: unreadIds.size + (patch.handoverUpdates ?? snapshot.handoverUpdates).filter(item => !item.isRead && hasEventHandoverWork(item)).length };
    listeners.forEach(listener => listener());
  };
  const refresh = (retrySync = true): Promise<void> => {
    if (!listeners.size) return Promise.resolve();
    if (refreshInFlight) return refreshInFlight;
    const now = Date.now();
    if (!retrySync && !snapshot.loading && now - lastAutomaticRefreshAt < 5_000) return Promise.resolve();
    if (!retrySync) lastAutomaticRefreshAt = now;
    const request = ++generation;
    const task = (async () => {
      if (!snapshot.events.length && !snapshot.error) publish({ loading: true });
      try {
        const nextContexts = await eventOrganizationService.listMyEventOrganizations();
        if (request !== generation || !listeners.size) return;
        const nextScope = nextContexts.map(item => `${item.organizationId}:${item.grantId}`).sort().join('|');
        if (scopeKey !== nextScope) {
          scopeKey = nextScope;
          contexts = nextContexts;
          serverStates = undefined;
          serverReceipts = undefined;
          memoryRead.clear();
          readRequests.clear();
          ++lifecycle;
          publish({ events: [], handoverUpdates: [], loading: true, receiptError: '' });
        } else contexts = nextContexts;

        const [organizationResults, legacyEvents] = await Promise.all([
          Promise.all(nextContexts.map(async context => {
            const result = await eventOverlayService.listOrganizationEvents(context.organizationId, { limit: 500, offset: 0, includeArchived: false });
            return result.events.filter(event => event.organizationId === context.organizationId);
          })),
          eventOverlayService.listEventOverlays({ allCampuses: true, createdByUserId: ownerId, strict: true }),
        ]);
        if (request !== generation || !listeners.size) return;
        const accessibleBoundEvents = organizationResults.flat();
        const ownLegacyEvents = legacyEvents.filter(event => !event.organizationId && event.createdByUserId === ownerId);
        const events = [...accessibleBoundEvents, ...ownLegacyEvents];
        let receiptError = '';
        serverStates = undefined;
        serverReceipts = undefined;
        try {
          const states = await eventNotificationService.getStates(ownerId, 'org_review', events, retrySync);
          if (request !== generation || !listeners.size) return;
          serverStates = states;
          serverReceipts = new Map(events.filter(event => { const state = states.get(event.id); return state?.isCurrent && state.isRead; }).map(event => [eventKey(event), eventReviewFingerprint(event)!]));
        } catch (cause) {
          if (request !== generation || !listeners.size) return;
          serverStates = undefined;
          serverReceipts = undefined;
          if (cause instanceof EventNotificationSyncUnavailable) {
            // Legacy creator-owned reads can still fall back to this browser.
            // Bound-event eligibility is server-only to avoid resurrecting old approvals.
            receiptError = cause.message;
          } else receiptError = cause instanceof Error ? cause.message : 'Read status could not sync. Please retry.';
        }

        let handoverUpdates: EventOrganizationHandoverSummary[] = [];
        try {
          handoverUpdates = await Promise.all(nextContexts.map(async context => {
            const summary = await eventOrganizationService.getHandoverSummary(context.grantId);
            return { ...summary, isRead: summary.isRead || memoryHandoverRead.has(context.grantId) || localHandoverRead(ownerId, context.grantId) };
          }));
        } catch (cause) {
          if (request !== generation || !listeners.size) return;
          receiptError ||= cause instanceof Error ? cause.message : 'Handover status could not sync. Please retry.';
        }
        if (request !== generation || !listeners.size) return;
        publish({ events, handoverUpdates, loading: false, error: '', receiptError });
      } catch (error) {
        if (request !== generation || !listeners.size) return;
        serverStates = undefined;
        serverReceipts = undefined;
        publish({ events: [], handoverUpdates: [], loading: false, error: error instanceof Error ? error.message : "Could not load event updates. Please retry." });
      }
    })();
    refreshInFlight = task;
    void task.then(
      () => { if (refreshInFlight === task) refreshInFlight = null; },
      () => { if (refreshInFlight === task) refreshInFlight = null; },
    );
    return task;
  };
  const onFocus = () => { if (document.visibilityState !== "hidden") void refresh(false); };
  const updateRead = () => { if (serverReceipts) void refresh(false); else publish(); };
  const onRead = (event: Event) => {
    if ((event as CustomEvent<{ ownerId: string }>).detail?.ownerId === ownerId) updateRead();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(eventReviewSeenPrefix(ownerId)) || event.key?.startsWith(`${HANDOVER_READ_PREFIX}${encodeURIComponent(ownerId)}:`)) updateRead();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      void refresh(false);
      timer = setInterval(onFocus, 60000);
      window.addEventListener("focus", onFocus);
      window.addEventListener("online", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      window.addEventListener(EVENT_REVIEW_READ_EVENT, onRead);
      window.addEventListener("storage", onStorage);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      ++generation;
      ++lifecycle; readRequests.clear(); serverReceipts = undefined; serverStates = undefined;
      refreshInFlight = null;
      // Actor-scoped fallback receipts survive ordinary route changes, like the
      // browser receipt cache. They hold no event list and expire on reload.
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(EVENT_REVIEW_READ_EVENT, onRead);
      window.removeEventListener("storage", onStorage);
      contexts = [];
      snapshot = { ...EMPTY, loading: true };
    };
  };
  const markRead = (displayed: CampusEventOverlay): Promise<ReadResult> => {
    if (!displayed || typeof displayed !== 'object') return Promise.resolve('changed');
    const current = snapshot.events.find(event => event.id === displayed.id && event.organizationId === displayed.organizationId);
    const fingerprint = eventReviewFingerprint(displayed);
    if (!current || !fingerprint || fingerprint !== eventReviewFingerprint(current)) return Promise.resolve("changed");
    if (current.organizationId && !contexts.some(context => context.organizationId === current.organizationId)) return Promise.resolve("changed");
    const key = `${eventKey(displayed)}:${fingerprint}`;
    const pending = readRequests.get(key); if (pending) return pending;
    const session = lifecycle;
    const task = (async (): Promise<ReadResult> => {
      try {
        await eventNotificationService.acknowledge(ownerId, 'org_review', displayed);
        if (session !== lifecycle || !listeners.size) return 'changed';
        const latest = snapshot.events.find(event => event.id === displayed.id);
        if (!latest || eventReviewFingerprint(latest) !== fingerprint) return 'changed';
        ++generation;
        serverReceipts ??= new Map(); serverReceipts.set(key, fingerprint);
        serverStates ??= new Map(); serverStates.set(displayed.id, { isCurrent: true, isRead: true });
        if (!displayed.organizationId) { memoryRead.delete(eventKey(displayed)); markEventReviewRead(ownerId, displayed); }
        publish({ loading: false, receiptError: '' }); return 'saved';
      } catch (cause) {
        if (session !== lifecycle || !listeners.size) return 'changed';
        if (cause instanceof EventNotificationChanged) { void refresh(false); return 'changed'; }
        if (cause instanceof EventNotificationSyncUnavailable && !displayed.organizationId) {
          serverReceipts = undefined; serverStates = undefined;
          if (markEventReviewRead(ownerId, displayed)) { memoryRead.delete(eventKey(displayed)); publish({ receiptError: cause.message }); return 'local'; }
          memoryRead.set(eventKey(displayed), fingerprint); publish({ receiptError: 'Read for this visit only. Browser storage and server sync are unavailable.' }); return 'memory';
        }
        publish({ receiptError: cause instanceof Error ? cause.message : 'Read status could not sync. Please retry.' }); return 'failed';
      }
    })();
    readRequests.set(key, task); void task.finally(() => { if (readRequests.get(key) === task) readRequests.delete(key); }); return task;
  };
  const markHandoverRead = async (grantId: string): Promise<ReadResult> => {
    const displayed = snapshot.handoverUpdates.find(item => item.grantId === grantId);
    if (!displayed || !contexts.some(context => context.organizationId === displayed.organizationId && context.grantId === grantId)) return 'changed';
    try {
      await eventOrganizationService.acknowledgeHandover(grantId);
      memoryHandoverRead.add(grantId);
      snapshot = { ...snapshot, handoverUpdates: snapshot.handoverUpdates.map(item => item.grantId === grantId ? { ...item, isRead: true } : item) };
      publish(); return 'saved';
    } catch (cause) {
      if (cause instanceof EventNotificationSyncUnavailable) {
        memoryHandoverRead.add(grantId);
        if (saveLocalHandoverRead(ownerId, grantId)) {
          snapshot = { ...snapshot, handoverUpdates: snapshot.handoverUpdates.map(item => item.grantId === grantId ? { ...item, isRead: true } : item) };
          publish({ receiptError: cause.message }); return 'local';
        }
        publish({ receiptError: 'Handover read for this visit only. Browser storage and server sync are unavailable.' }); return 'memory';
      }
      publish({ receiptError: cause instanceof Error ? cause.message : 'Handover status could not sync. Please retry.' }); return 'failed';
    }
  };
  return { subscribe, getSnapshot: () => snapshot, refresh, markRead, markHandoverRead };
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
  return { ...snapshot, refresh: store?.refresh ?? noopRefresh, markRead: store?.markRead ?? noopRead, markHandoverRead: store?.markHandoverRead ?? (async () => 'changed' as ReadResult) };
}
