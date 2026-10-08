import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampusEventOverlay } from '../../components/map-builder/types';
import { eventPreviewFixture } from '../../test/eventFullPackFixtures';
const backend = vi.hoisted(() => ({ list: vi.fn(), preferences: vi.fn() }));
vi.mock('../../services/eventOverlayService', () => ({ eventOverlayService: { listEventOverlays: backend.list } }));
vi.mock('../../services/adminNotificationPreferencesService', () => ({ adminNotificationPreferencesService: { get: backend.preferences } }));
import { useAdminEventSubmissions } from '../useAdminEventSubmissions';
import { eventNotificationService, EventNotificationSyncUnavailable } from '../../services/eventNotificationService';
vi.mock('../../services/eventNotificationService',async(importOriginal)=>({...await importOriginal<typeof import('../../services/eventNotificationService')>(),eventNotificationService:{getStates:vi.fn(),acknowledge:vi.fn()}}));

const one = { ...eventPreviewFixture(), id: 'qa-one', status: 'pending', submittedAt: '2026-10-07T08:00:00Z', revision: 3 } as unknown as CampusEventOverlay;
const two = { ...one, id: 'qa-two', title: 'Another event' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks(); localStorage.clear();
  backend.list.mockResolvedValue([one, two, { ...one, id: 'draft', status: 'draft' }]);
  backend.preferences.mockResolvedValue({ events: true });
  vi.mocked(eventNotificationService.getStates).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only'));
  vi.mocked(eventNotificationService.acknowledge).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only'));
});
afterEach(() => { vi.useRealTimers(); });
describe('shared admin pending submissions', () => {
  it('reads server receipts on a device without browser-local storage',async()=>{
    vi.mocked(eventNotificationService.getStates).mockResolvedValue(new Map([['qa-one',{isCurrent:true,isRead:true}],['qa-two',{isCurrent:true,isRead:false}]]));
    const view=renderHook(()=>useAdminEventSubmissions('admin-server-device',true));
    await waitFor(()=>expect(view.result.current.pendingCount).toBe(2));
    expect(view.result.current.unreadIds.has('qa-one')).toBe(false);
    expect(view.result.current.unreadCount).toBe(1);
    act(()=>{localStorage.clear();window.dispatchEvent(new StorageEvent('storage',{key:null}));});
    await waitFor(()=>expect(view.result.current.unreadCount).toBe(1)); view.unmount();
  });
  it('keeps a failed server acknowledgement unread and exposes retry',async()=>{
    vi.mocked(eventNotificationService.getStates).mockResolvedValue(new Map());
    vi.mocked(eventNotificationService.acknowledge).mockRejectedValue(new Error('Offline'));
    const view=renderHook(()=>useAdminEventSubmissions('admin-server-fail',true));
    await waitFor(()=>expect(view.result.current.pendingCount).toBe(2));
    await act(async()=>{expect(await view.result.current.markRead(one)).toBe('failed');});
    expect(view.result.current.unreadCount).toBe(2);
    expect(view.result.current.receiptError).toMatch(/Offline/);view.unmount();
  });
  it('orders new notices by the latest submission or map edit rather than an older saved draft', async () => {
    backend.list.mockResolvedValue([
      { ...one, submittedAt: '2026-10-07T10:00:00Z', lastEditedAt: '2026-10-07T08:00:00Z' },
      { ...two, submittedAt: '2026-10-07T09:00:00Z', lastEditedAt: '2026-10-07T09:05:00Z' },
    ]);
    const view = renderHook(() => useAdminEventSubmissions('admin-order', true));
    await waitFor(() => expect(view.result.current.pendingCount).toBe(2));
    expect(view.result.current.events.map(event => event.id)).toEqual(['qa-one', 'qa-two']);
    view.unmount();
  });
  it('reading one submission updates both subscribers while pending work remains', async () => {
    const first = renderHook(() => useAdminEventSubmissions('admin-shared', true));
    const second = renderHook(() => useAdminEventSubmissions('admin-shared', true));
    await waitFor(() => expect(first.result.current.unreadCount).toBe(2));
    expect(first.result.current.pendingCount).toBe(2);
    await act(async () => { await first.result.current.markRead(one); });
    expect(first.result.current.unreadCount).toBe(1);
    expect(second.result.current.unreadIds.has('qa-two')).toBe(true);
    expect(second.result.current.unreadIds.has('qa-one')).toBe(false);
    expect(second.result.current.pendingCount).toBe(2);
    first.unmount(); second.unmount();
  });
  it('keeps unread state on save failure and does not acknowledge a newer revision using an old card', async () => {
    const view = renderHook(() => useAdminEventSubmissions('admin-failure', true));
    await waitFor(() => expect(view.result.current.unreadCount).toBe(2));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await act(async () => { await view.result.current.markRead(one); });
    expect(view.result.current.unreadIds.has('qa-one')).toBe(true);
    expect(view.result.current.receiptError).toMatch(/could not be saved/i);
    write.mockRestore();
    backend.list.mockResolvedValue([{ ...one, revision: 4 }, two]);
    await act(async () => { await view.result.current.refresh(); });
    await act(async () => { expect(await view.result.current.markRead(one)).toBe('changed'); });
    expect(view.result.current.unreadIds.has('qa-one')).toBe(true);
    view.unmount();
  });
  it('detects new submissions on its timer and retains loaded work on network failure', async () => {
    vi.useFakeTimers(); backend.list.mockResolvedValue([one]);
    const view = renderHook(() => useAdminEventSubmissions('admin-poll', true));
    await act(async () => {});
    expect(view.result.current.pendingCount).toBe(1);
    backend.list.mockResolvedValue([one, two]);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(view.result.current.pendingCount).toBe(2);
    backend.list.mockRejectedValue(new Error('Queue unavailable'));
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.pendingCount).toBe(2);
    expect(view.result.current.error).toBe('Queue unavailable');
    view.unmount();
  });
});
