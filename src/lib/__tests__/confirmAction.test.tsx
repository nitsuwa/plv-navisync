import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { confirmAction } from '../confirmAction';

describe('confirmAction', () => {
  it('rejects a second request while a decision is pending', async () => {
    let first!: Promise<boolean>;
    await act(async () => { first = confirmAction({ title: 'First action?', message: 'Review first.' }); });
    expect(await confirmAction({ title: 'Second action?', message: 'Review second.' })).toBe(false);
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(await first).toBe(false);
  });
  it('retains failed actions for retry without executing on cancel', async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined);
    let result!: Promise<boolean>;
    await act(async () => { result = confirmAction({ title: 'Archive?', message: 'Archive this report.', action }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); });
    expect(screen.getByText(/Offline/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); });
    expect(await result).toBe(true);
    expect(action).toHaveBeenCalledTimes(2);
  });
  it('waits for an explicit decision and cancels safely', async () => {
    let result!: Promise<boolean>;
    await act(async () => { result = confirmAction({ title: 'Publish event?', message: 'Students will see this event.' }); });
    expect(screen.getByRole('dialog', { name: 'Publish event?' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    expect(await result).toBe(false);
  });
  it('confirms once and removes its dialog', async () => {
    let result!: Promise<boolean>;
    await act(async () => { result = confirmAction({ title: 'Sign out?', message: 'End this session.', confirmLabel: 'Sign out' }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
    expect(await result).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
