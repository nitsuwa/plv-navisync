import { useMemo, useSyncExternalStore } from 'react';
import type { CampusEventOverlay } from '../components/map-builder/types';
import { eventOverlayService } from '../services/eventOverlayService';
import { adminNotificationPreferencesService } from '../services/adminNotificationPreferencesService';
import { ADMIN_SUBMISSION_READ_EVENT, adminSubmissionReceiptKey, eventSubmissionFingerprint, markAdminSubmissionRead, readAdminSubmissionReceipts } from '../lib/adminEventSubmissions';
import { eventNotificationService, EventNotificationChanged, EventNotificationSyncUnavailable } from '../services/eventNotificationService';

interface Snapshot {
  events: CampusEventOverlay[];
  unreadIds: ReadonlySet<string>;
  unreadCount: number;
  pendingCount: number;
  loading: boolean;
  error: string;
  receiptError: string;
  eventsEnabled: boolean;
}
const EMPTY: Snapshot = { events: [], unreadIds: new Set(), unreadCount: 0, pendingCount: 0, loading: false, error: '', receiptError: '', eventsEnabled: true };
const latestSubmissionTime = (event: CampusEventOverlay) => Math.max(Date.parse(event.submittedAt ?? '') || 0, Date.parse(event.lastEditedAt ?? '') || 0);

function createStore(adminId: string) {
  let snapshot: Snapshot = { ...EMPTY, loading: true };
  let generation = 0;
  let lifecycle = 0;
  let serverReceipts: Map<string, string> | undefined;
  const readRequests = new Map<string, Promise<'saved' | 'local' | 'changed' | 'failed'>>();
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<Snapshot> = {}) => {
    const events = patch.events ?? snapshot.events;
    const receipts = readAdminSubmissionReceipts(adminId);
    const unreadIds = new Set(events.filter(event => (serverReceipts ? serverReceipts.get(event.id) : receipts[event.id]) !== eventSubmissionFingerprint(event)).map(event => event.id));
    snapshot = { ...snapshot, ...patch, events, unreadIds, unreadCount: unreadIds.size, pendingCount: events.length };
    listeners.forEach(listener => listener());
  };
  const refresh = async (retrySync = true) => {
    if (!listeners.size) return;
    const request = ++generation;
    try {
      const events = await eventOverlayService.listEventOverlays({ allCampuses: true, status: 'pending', strict: true });
      if (request !== generation || !listeners.size) return;
      const pending = events.filter(event => event.status === 'pending').sort((a, b) => latestSubmissionTime(b) - latestSubmissionTime(a));
      let receiptError = '';
      try {
        const states = await eventNotificationService.getStates(adminId, 'admin_submission', pending, retrySync);
        if (request !== generation || !listeners.size) return;
        serverReceipts = new Map(pending.filter(event => { const state = states.get(event.id); return state?.isCurrent && state.isRead; }).map(event => [event.id, eventSubmissionFingerprint(event)!]));
      } catch (cause) {
        if (request !== generation || !listeners.size) return;
        if (cause instanceof EventNotificationSyncUnavailable) serverReceipts = undefined;
        receiptError = cause instanceof Error ? cause.message : 'Read status could not sync. Please retry.';
      }
      publish({ events: pending, loading: false, error: '', receiptError });
    } catch (error) {
      if (request === generation && listeners.size) publish({ loading: false, error: error instanceof Error ? error.message : 'Could not load event submissions. Please retry.' });
    }
  };
  const refreshPreferences = async () => {
    try {
      const preferences = await adminNotificationPreferencesService.get();
      if (listeners.size) publish({ eventsEnabled: preferences.events });
    } catch { /* Retain existing preferences while offline. Queue errors have their own visible retry. */ }
  };
  const onFocus = () => { if (document.visibilityState !== 'hidden') void refresh(false); };
  const updateRead = () => { if (serverReceipts) void refresh(false); else publish(); };
  const onRead = (event: Event) => { if ((event as CustomEvent<{ adminId: string }>).detail?.adminId === adminId) updateRead(); };
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === adminSubmissionReceiptKey(adminId)) updateRead(); };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      void refresh(false); void refreshPreferences();
      timer = setInterval(onFocus, 15000);
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onFocus);
      window.addEventListener(ADMIN_SUBMISSION_READ_EVENT, onRead);
      window.addEventListener('storage', onStorage);
      window.addEventListener('plv-admin-notification-preferences-updated', refreshPreferences);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      ++generation; ++lifecycle; clearInterval(timer); readRequests.clear(); serverReceipts = undefined;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener(ADMIN_SUBMISSION_READ_EVENT, onRead);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('plv-admin-notification-preferences-updated', refreshPreferences);
      snapshot = { ...EMPTY, loading: true };
    };
  };
  const markRead = (displayed: CampusEventOverlay): Promise<'saved' | 'local' | 'changed' | 'failed'> => {
    const current = snapshot.events.find(event => event.id === displayed.id);
    const fingerprint = eventSubmissionFingerprint(displayed);
    if (!current || !fingerprint || eventSubmissionFingerprint(current) !== fingerprint) return Promise.resolve('changed');
    const key = `${displayed.id}:${fingerprint}`;
    const pending = readRequests.get(key);
    if (pending) return pending;
    const session = lifecycle;
    const task = (async (): Promise<'saved' | 'local' | 'changed' | 'failed'> => {
      try {
        await eventNotificationService.acknowledge(adminId,'admin_submission',displayed);
        if (session !== lifecycle || !listeners.size) return 'changed';
        if (eventSubmissionFingerprint(snapshot.events.find(event=>event.id===displayed.id) ?? displayed) !== fingerprint) return 'changed';
        ++generation;
        serverReceipts ??= new Map(); serverReceipts.set(displayed.id,fingerprint);
        markAdminSubmissionRead(adminId,displayed.id,fingerprint);
        publish({loading:false,receiptError:''}); return 'saved';
      } catch (cause) {
        if (session !== lifecycle || !listeners.size) return 'changed';
        if (cause instanceof EventNotificationChanged) { void refresh(false); return 'changed'; }
        if (cause instanceof EventNotificationSyncUnavailable) {
          serverReceipts = undefined;
          if (markAdminSubmissionRead(adminId,displayed.id,fingerprint)) { publish({receiptError:cause.message}); return 'local'; }
          publish({receiptError:'Read status could not be saved in this browser. This submission stays unread; reopen it to retry.'});
        } else publish({receiptError:cause instanceof Error ? cause.message : 'Read status could not sync. Please retry.'});
        return 'failed';
      }
    })();
    readRequests.set(key,task); void task.finally(()=>{if(readRequests.get(key)===task) readRequests.delete(key);}); return task;
  };
  return { subscribe, getSnapshot: () => snapshot, refresh, markRead };
}
const stores = new Map<string, ReturnType<typeof createStore>>();
const noSubscribe = () => () => {};
const getEmpty = () => EMPTY;
const noRefresh = async () => {};
const noRead = async () => 'changed' as const;

export function useAdminEventSubmissions(adminId: string | undefined, enabled: boolean) {
  const store = useMemo(() => {
    if (!adminId || !enabled) return undefined;
    let value = stores.get(adminId);
    if (!value) { value = createStore(adminId); stores.set(adminId, value); }
    return value;
  }, [adminId, enabled]);
  const snapshot = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getSnapshot ?? getEmpty, getEmpty);
  return { ...snapshot, refresh: store?.refresh ?? noRefresh, markRead: store?.markRead ?? noRead };
}
