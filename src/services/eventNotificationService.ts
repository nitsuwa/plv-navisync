import type { CampusEventOverlay } from '../components/map-builder/types';
import { getSupabase } from '../lib/supabase';
import { eventSubmissionFingerprint } from '../lib/adminEventSubmissions';
import { eventReviewFingerprint } from '../lib/studentEventUpdates';
import type { Json } from '../types/database.generated';
export type EventNotificationStream = 'admin_submission' | 'org_review';
export interface EventNotificationState { isCurrent: boolean; isRead: boolean }
export class EventNotificationSyncUnavailable extends Error {}
export class EventNotificationChanged extends Error {}
const unavailable = new WeakSet<object>();
const missingMessage = 'Read marks are saved in this browser only. Sync across devices is unavailable. Please retry later.';
function payload(actor: string, stream: EventNotificationStream, event: CampusEventOverlay): Json | null {
  if (stream === 'org_review' && event.createdByUserId !== actor) throw new Error('Only the event owner can read this review.');
  const fingerprint = stream === 'admin_submission' ? eventSubmissionFingerprint(event) : eventReviewFingerprint(event);
  if (!fingerprint) return null;
  const parts: Json[] = JSON.parse(fingerprint);
  if (stream === 'org_review') parts[3] = Object.fromEntries(parts[3] as [string, string][]);
  return parts;
}
function checkError(client: object, error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new EventNotificationChanged('Read the latest event update before marking it as read.');
  if ((error.code === 'PGRST202' || error.code === '42883') && /get_event_notification_states|ack_event_notification/.test(error.message ?? '')) {
    unavailable.add(client); throw new EventNotificationSyncUnavailable(missingMessage);
  }
  throw new Error(error.message || 'Read status could not sync. Please retry.');
}
export const eventNotificationService = {
  async getStates(actor: string, stream: EventNotificationStream, events: CampusEventOverlay[], retry = false): Promise<Map<string, EventNotificationState>> {
    const client = getSupabase();
    if (retry) unavailable.delete(client);
    if (unavailable.has(client)) throw new EventNotificationSyncUnavailable(missingMessage);
    const candidates = events.flatMap(event => { const value = payload(actor,stream,event); return value ? [{event_id:event.id,payload:value}] : []; });
    const result = new Map<string, EventNotificationState>();
    // Bound each request; a large historical Org list need not exceed the RPC limit.
    for (let offset = 0; offset < candidates.length; offset += 100) {
      const {data,error} = await client.rpc('get_event_notification_states', {p_expected_user_id:actor,p_stream:stream,p_candidates:candidates.slice(offset,offset+100)});
      checkError(client,error);
      for (const row of data ?? []) result.set(row.event_id, {isCurrent:row.is_current,isRead:row.is_read});
    }
    return result;
  },
  async acknowledge(actor: string, stream: EventNotificationStream, event: CampusEventOverlay): Promise<void> {
    const client = getSupabase();
    const value = payload(actor,stream,event);
    if (!value) throw new EventNotificationChanged('This event no longer has an unread update.');
    if (unavailable.has(client)) throw new EventNotificationSyncUnavailable(missingMessage);
    const {error} = await client.rpc('ack_event_notification',{p_expected_user_id:actor,p_stream:stream,p_event_id:event.id,p_payload:value});
    checkError(client,error);
  },
};
