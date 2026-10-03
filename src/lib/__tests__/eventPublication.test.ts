import { describe, expect, it } from 'vitest';
import { getStudentEventPhase, isEventPublished, manilaDateTimeToIso, findEventConflicts } from '../eventPublication';
import { eventPreviewFixture } from '../../test/eventFullPackFixtures';
const event = { id: 'a', status: 'approved', isActive: true, publicationAt: '2026-09-30T01:00:00Z', dateStart: '2026-10-01T01:00:00Z', dateEnd: '2026-10-01T03:00:00Z', campusId:'c', locations:[{id:'campus', locationRef:{type:'campus', label:'Grounds'}, eventFurniture:[],eventLabels:[]}] } as any;
describe('event publication', () => {
 it('reveals upcoming events at publication time and expires at event end', () => {
  expect(isEventPublished(event, new Date('2026-09-30T00:59:59Z'))).toBe(false);
  expect(isEventPublished(event, new Date('2026-09-30T01:00:00Z'))).toBe(true);
  expect(isEventPublished(event, new Date('2026-10-01T03:00:00Z'))).toBe(false);
  expect(isEventPublished({...event,status:'pending'}, new Date('2026-09-30T02:00:00Z'))).toBe(false);
 });
 it('converts entered Manila time independently of machine timezone', () => expect(manilaDateTimeToIso('2026-09-30T09:00')).toBe('2026-09-30T01:00:00.000Z'));
 it('warns only for overlapping approved events at the same campus and location', () => {
 expect(findEventConflicts(event,[{...event,id:'b'}, {...event,id:'c',campusId:'other'}, {...event,id:'d',dateStart:event.dateEnd,dateEnd:'2026-10-01T04:00:00Z'}]).map(e=>e.id)).toEqual(['b']);
 });
 it.each([
  ['2026-10-05T00:59:59.999Z', 'scheduled'],
  ['2026-10-05T01:00:00.000Z', 'upcoming'],
  ['2026-10-08T00:59:59.999Z', 'upcoming'],
  ['2026-10-08T01:00:00.000Z', 'ongoing'],
  ['2026-10-08T09:00:00.000Z', 'ended'],
 ] as const)('classifies %s as %s', (instant, expected) => {
  expect(getStudentEventPhase(eventPreviewFixture(), Date.parse(instant))).toBe(expected);
 });
 it.each([
  { status: 'pending' as const },
  { status: 'disapproved' as const },
  { isActive: false },
  { publicationAt: 'not-a-date' },
  { publicationAt: '2026-10-08T09:00:00.000Z' },
  { dateStart: '2026-10-08T09:00:00.000Z' },
  { dateStart: 'not-a-date' },
  { dateEnd: '2026-02-30T09:00:00.000Z' },
 ] as const)('hides invalid or ineligible events %#', overrides => {
  expect(getStudentEventPhase({ ...eventPreviewFixture(), ...overrides }, Date.parse('2026-10-08T02:00:00Z'))).toBe('hidden');
 });
 it('requires a valid publication instant instead of exposing legacy undated events', () => {
  expect(getStudentEventPhase({ ...eventPreviewFixture(), publicationAt: undefined as never }, Date.parse('2026-10-08T02:00:00Z'))).toBe('hidden');
  expect(isEventPublished({ ...event, publicationAt: undefined }, new Date('2026-10-01T02:00:00Z'))).toBe(false);
 });
 it('rejects impossible Manila calendar dates rather than rolling them into another month', () => {
  expect(() => manilaDateTimeToIso('2026-02-30T09:00')).toThrow(/valid date and time/i);
 });
});
