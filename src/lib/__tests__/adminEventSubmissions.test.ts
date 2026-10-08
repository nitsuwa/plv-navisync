import { describe, expect, it } from 'vitest';
import { eventPreviewFixture } from '../../test/eventFullPackFixtures';
import type { CampusEventOverlay } from '../../components/map-builder/types';
import { eventSubmissionFingerprint, submissionUpdateLabel } from '../adminEventSubmissions';

const pending = { ...eventPreviewFixture(), status: 'pending', submittedAt: '2026-10-07T08:00:00Z', lastEditedAt: '2026-10-07T07:59:00Z', revision: 3 } as unknown as CampusEventOverlay;
describe('admin event submission identity', () => {
  it('recognizes a resubmission or changed layout as a new unread revision', () => {
    const first = eventSubmissionFingerprint(pending);
    expect(first).not.toBe('');
    expect(eventSubmissionFingerprint({ ...pending, submittedAt: '2026-10-07T10:00:00Z' })).not.toBe(first);
    expect(eventSubmissionFingerprint({ ...pending, revision: 4, lastEditedAt: '2026-10-07T09:00:00Z' })).not.toBe(first);
    expect(eventSubmissionFingerprint({ ...pending, updatedAt: '2026-10-07T10:00:00Z' })).toBe(first);
  });
  it('excludes work that is not pending review and identifies pending map updates', () => {
    expect(eventSubmissionFingerprint({ ...pending, status: 'draft' })).toBe('');
    expect(eventSubmissionFingerprint({ ...pending, status: 'approved' })).toBe('');
    expect(submissionUpdateLabel(pending)).toBe('Submitted for review');
    expect(submissionUpdateLabel({ ...pending, lastEditedAt: '2026-10-07T09:00:00Z' })).toBe('Maps updated');
  });
});
