import type { CampusEventOverlay } from "../components/map-builder/types";

export interface EventReviewDraftFields {
  comment: string;
  locationFeedback: Record<string, string>;
  eventStartDate: string;
  eventStartTime: string;
  eventEndDate: string;
  eventEndTime: string;
  publicationMode: "now" | "schedule";
  publicationDate: string;
  publicationTime: string;
  scheduleTouched: boolean;
}
type DraftReadResult = { status: "restored"; draft: EventReviewDraftFields } | { status: "missing" | "stale" | "invalid" | "unavailable" };
const PREFIX = "plv-navisync:event-review-draft:v1:";
const MAX_BYTES = 256 * 1024;

export function eventReviewDraftKey(reviewerId: string, overlayId: string): string {
  return `${PREFIX}${encodeURIComponent(reviewerId)}:${encodeURIComponent(overlayId)}`;
}
function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
function validFields(value: unknown): value is EventReviewDraftFields {
  if (!value || typeof value !== "object") return false;
  const fields = value as EventReviewDraftFields;
  const strings = [fields.comment, fields.eventStartDate, fields.eventStartTime, fields.eventEndDate, fields.eventEndTime, fields.publicationDate, fields.publicationTime];
  return strings.every(field => typeof field === "string") && (fields.publicationMode === "now" || fields.publicationMode === "schedule")
    && typeof fields.scheduleTouched === "boolean" && Boolean(fields.locationFeedback) && typeof fields.locationFeedback === "object"
    && !Array.isArray(fields.locationFeedback) && Object.values(fields.locationFeedback).every(feedback => typeof feedback === "string");
}
export function readEventReviewDraft(reviewerId: string | undefined, overlay: CampusEventOverlay): DraftReadResult {
  const target = storage();
  if (!target || !reviewerId || !overlay.updatedAt) return { status: "unavailable" };
  let raw: string | null;
  try { raw = target.getItem(eventReviewDraftKey(reviewerId, overlay.id)); } catch { return { status: "unavailable" }; }
  try {
    if (!raw) return { status: "missing" };
    if (raw.length > MAX_BYTES) return { status: "invalid" };
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || saved.reviewerId !== reviewerId || saved.overlayId !== overlay.id || !validFields(saved.fields) || !Number.isFinite(saved.savedAt)) return { status: "invalid" };
    if (overlay.status !== "pending" || saved.updatedAt !== overlay.updatedAt || saved.revision !== (overlay.revision ?? null)
      || saved.submittedAt !== (overlay.submittedAt ?? null)) return { status: "stale" };
    return { status: "restored", draft: saved.fields };
  } catch { return { status: "invalid" }; }
}
export function writeEventReviewDraft(reviewerId: string | undefined, overlay: CampusEventOverlay, fields: EventReviewDraftFields): boolean {
  const target = storage();
  if (!target || !reviewerId || !overlay.updatedAt || overlay.status !== "pending" || !validFields(fields)) return false;
  try {
    const raw = JSON.stringify({ version: 1, reviewerId, overlayId: overlay.id, updatedAt: overlay.updatedAt, revision: overlay.revision ?? null, submittedAt: overlay.submittedAt ?? null, savedAt: Date.now(), fields });
    if (raw.length > MAX_BYTES) return false;
    target.setItem(eventReviewDraftKey(reviewerId, overlay.id), raw);
    return true;
  } catch { return false; }
}
export function clearEventReviewDraft(reviewerId: string | undefined, overlayId: string): boolean {
  const target = storage();
  if (!target || !reviewerId) return false;
  try { target.removeItem(eventReviewDraftKey(reviewerId, overlayId)); return true; } catch { return false; }
}
