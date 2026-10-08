import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSubmissionReceiptKey, markAdminSubmissionRead, readAdminSubmissionReceipts } from '../adminEventSubmissions';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe('admin browser read receipts', () => {
  it('restores only this admin’s receipts and preserves other events when reading one', () => {
    markAdminSubmissionRead('admin-one', 'qa-one', 'revision-one');
    markAdminSubmissionRead('admin-one', 'qa-two', 'revision-two');
    expect(readAdminSubmissionReceipts('admin-one')).toEqual({ 'qa-one': 'revision-one', 'qa-two': 'revision-two' });
    expect(readAdminSubmissionReceipts('admin-two')).toEqual({});
  });
  it('treats malformed storage as unread and reports failed persistence', () => {
    localStorage.setItem(adminSubmissionReceiptKey('admin-one'), 'invalid json');
    expect(readAdminSubmissionReceipts('admin-one')).toEqual({});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(markAdminSubmissionRead('admin-one', 'qa-one', 'revision')).toBe(false);
    expect(readAdminSubmissionReceipts('admin-one')).toEqual({});
  });
});
