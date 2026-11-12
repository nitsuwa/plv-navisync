import { describe, expect, it, vi, beforeEach } from 'vitest';
import { confirmSignOut } from '../confirmSignOut';
import { confirmAction } from '../confirmAction';
import { resolveUnsavedForms } from '../../hooks/useUnsavedFormGuard';
vi.mock('../confirmAction', () => ({ confirmAction: vi.fn() }));
vi.mock('../../hooks/useUnsavedFormGuard', () => ({ resolveUnsavedForms: vi.fn() }));
describe('sign-out protection', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not resolve drafts when sign-out is cancelled', async () => {
    vi.mocked(confirmAction).mockResolvedValue(false);
    expect(await confirmSignOut()).toBe(false);
    expect(resolveUnsavedForms).not.toHaveBeenCalled();
  });
  it('keeps the session when draft resolution is cancelled', async () => {
    vi.mocked(confirmAction).mockResolvedValue(true);
    vi.mocked(resolveUnsavedForms).mockResolvedValue(false);
    expect(await confirmSignOut()).toBe(false);
  });
  it('allows logout only after confirmation and draft resolution', async () => {
    vi.mocked(confirmAction).mockResolvedValue(true);
    vi.mocked(resolveUnsavedForms).mockResolvedValue(true);
    expect(await confirmSignOut()).toBe(true);
  });
});
