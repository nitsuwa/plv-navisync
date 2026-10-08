import type { CampusEventOverlay } from '../components/map-builder/types';

/** Only explicit submission/content revisions change the unread identity. */
export function eventSubmissionFingerprint(event: CampusEventOverlay): string {
  if (event.status !== 'pending') return '';
  return JSON.stringify([event.submittedAt ?? '', event.lastEditedAt ?? '', event.revision ?? 0]);
}

export function submissionUpdateLabel(event: CampusEventOverlay): string {
  const submitted = Date.parse(event.submittedAt ?? '');
  const edited = Date.parse(event.lastEditedAt ?? '');
  return Number.isFinite(submitted) && Number.isFinite(edited) && edited > submitted ? 'Maps updated' : 'Submitted for review';
}

export const ADMIN_SUBMISSION_READ_EVENT = 'plv-admin-submission-read';
export const adminSubmissionReceiptKey = (adminId: string) => `plv-admin-event-submissions:${adminId}`;

export function readAdminSubmissionReceipts(adminId: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(adminSubmissionReceiptKey(adminId)) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, fingerprint]) => !['__proto__', 'constructor', 'prototype'].includes(key) && typeof fingerprint === 'string'));
  } catch { return {}; }
}

export function markAdminSubmissionRead(adminId: string, eventId: string, fingerprint: string): boolean {
  if (!adminId || !eventId || !fingerprint) return false;
  try {
    window.localStorage.setItem(adminSubmissionReceiptKey(adminId), JSON.stringify({ ...readAdminSubmissionReceipts(adminId), [eventId]: fingerprint }));
    window.dispatchEvent(new CustomEvent(ADMIN_SUBMISSION_READ_EVENT, { detail: { adminId } }));
    return true;
  } catch { return false; }
}
