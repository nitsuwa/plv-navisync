import type { CampusEventOverlay } from "../components/map-builder/types";

export const EVENT_REVIEW_READ_EVENT = "plv-event-review-read";
const PREFIX = "plv-navisync:event-review-seen:v1:";
export function eventReviewSeenPrefix(ownerId: string): string { return `${PREFIX}${encodeURIComponent(ownerId)}:`; }
export function eventReviewFingerprint(event: CampusEventOverlay): string | null {
  if (event.status !== "approved" && event.status !== "disapproved") return null;
  return JSON.stringify([event.submittedAt ?? null, event.status, event.adminComment ?? "", Object.entries(event.locationFeedback ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
}
export function isEventReviewUnread(ownerId: string, event: CampusEventOverlay): boolean {
  const fingerprint = eventReviewFingerprint(event);
  if (event.createdByUserId !== ownerId || !fingerprint) return false;
  try {
    const raw = window.localStorage.getItem(`${eventReviewSeenPrefix(ownerId)}${encodeURIComponent(event.id)}`);
    if (!raw) return true;
    const seen = JSON.parse(raw);
    return seen?.version !== 1 || seen.fingerprint !== fingerprint;
  } catch { return true; }
}
export function markEventReviewRead(ownerId: string, event: CampusEventOverlay): boolean {
  const fingerprint = eventReviewFingerprint(event);
  if (event.createdByUserId !== ownerId || !fingerprint) return false;
  try {
    window.localStorage.setItem(`${eventReviewSeenPrefix(ownerId)}${encodeURIComponent(event.id)}`, JSON.stringify({ version: 1, fingerprint }));
    window.dispatchEvent(new CustomEvent(EVENT_REVIEW_READ_EVENT, { detail: { ownerId, eventId: event.id } }));
    return true;
  } catch { return false; }
}
