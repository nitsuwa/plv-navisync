import type { CampusEventOverlay } from '../components/map-builder/types';
import type { EventPhase } from '../types/eventPreview';
import { eventLocationKey, normalizeEventOverlayLocations } from './eventOverlayModel';

function validInstant(value?: string): number | null {
 if (typeof value !== 'string' || !value.trim()) return null;
 const datePrefix = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
 if (!datePrefix) return null;
 const [, yearText, monthText, dayText] = datePrefix;
 const year = Number(yearText), month = Number(monthText), day = Number(dayText);
 const date = new Date(Date.UTC(year, month - 1, day));
 if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
 const parsed = Date.parse(value);
 return Number.isFinite(parsed) ? parsed : null;
}

export function isValidEventInstant(value?: string): boolean {
 return validInstant(value) !== null;
}

export function getStudentEventPhase(
 event: Pick<CampusEventOverlay, 'status' | 'isActive' | 'publicationAt' | 'dateStart' | 'dateEnd'>,
 nowMs: number,
): EventPhase {
 if (event.status !== 'approved' || event.isActive !== true || !Number.isFinite(nowMs)) return 'hidden';
 const publication = validInstant(event.publicationAt);
 const start = validInstant(event.dateStart);
 const end = validInstant(event.dateEnd);
 if (publication === null || start === null || end === null || start >= end || publication >= end) return 'hidden';
 if (nowMs < publication) return 'scheduled';
 if (nowMs >= end) return 'ended';
 if (nowMs < start) return 'upcoming';
 return 'ongoing';
}

export function isEventPublished(event: CampusEventOverlay, now = new Date()): boolean {
 const phase = getStudentEventPhase(event, now.getTime());
 return phase === 'upcoming' || phase === 'ongoing';
}

export function manilaDateTimeToIso(value: string): string {
 const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
 if (!match) throw new Error('Enter a valid date and time (Asia/Manila).');
 const [, yearText, monthText, dayText, hourText, minuteText] = match;
 const year = Number(yearText), month = Number(monthText), day = Number(dayText);
 const hour = Number(hourText), minute = Number(minuteText);
 const calendarDate = new Date(Date.UTC(year, month - 1, day));
 if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day || hour > 23 || minute > 59) {
  throw new Error('Enter a valid date and time (Asia/Manila).');
 }
 const instant = new Date(`${value}:00+08:00`);
 if (!Number.isFinite(instant.getTime())) throw new Error('Enter a valid date and time (Asia/Manila).');
 return instant.toISOString();
}
export function formatEventDate(value?: string): string {
 if (!value || !Number.isFinite(Date.parse(value))) return 'Date not set';
 return new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
export function validateEventDates(start?: string, end?: string): void {
 if (!start && !end) return;
 if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) throw new Error('Event end must be later than its start.');
}
export function findEventConflicts(event: CampusEventOverlay, others: CampusEventOverlay[]): CampusEventOverlay[] {
 if (!event.dateStart || !event.dateEnd) return [];
 const keys = new Set(normalizeEventOverlayLocations(event).map(l=>eventLocationKey(l.locationRef)));
 return others.filter(other => other.id !== event.id && other.campusId === event.campusId && other.status === 'approved' && other.isActive && other.dateStart && other.dateEnd && Date.parse(other.dateStart) < Date.parse(event.dateEnd!) && Date.parse(other.dateEnd) > Date.parse(event.dateStart!) && normalizeEventOverlayLocations(other).some(l=>keys.has(eventLocationKey(l.locationRef))));
}
