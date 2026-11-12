import { act, renderHook, render, fireEvent, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveUnsavedForms, useUnsavedFormGuard, UnsavedFormsNavigationGuard, rearmUnsavedForms, registerUnsavedFormGuard } from '../useUnsavedFormGuard';

const confirm = vi.hoisted(() => vi.fn());
vi.mock('../../lib/confirmAction', () => ({ confirmAction: confirm }));

describe('unsaved form protection', () => {
  beforeEach(() => confirm.mockReset());
  it('retains dirty work on cancellation and permits confirmed discard', async () => {
    const { unmount } = renderHook(() => useUnsavedFormGuard(true));
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await resolveUnsavedForms()).toBe(false);
    expect(await resolveUnsavedForms()).toBe(true);
    expect(await resolveUnsavedForms()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    unmount();
  });
  it('does not prompt for unchanged forms, or permit exit during saving', async () => {
    const { rerender, unmount } = renderHook(({dirty, busy}) => useUnsavedFormGuard(dirty, busy), {initialProps:{dirty:false,busy:false}});
    expect(await resolveUnsavedForms()).toBe(true);
    rerender({dirty:true,busy:true});
    expect(await resolveUnsavedForms()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    unmount();
  });
  it('protects reload only while there is unsaved work', () => {
    const { rerender, unmount } = renderHook(({dirty}) => useUnsavedFormGuard(dirty), {initialProps:{dirty:true}});
    const dirtyUnload = new Event('beforeunload', {cancelable:true});
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);
    rerender({dirty:false});
    const cleanUnload = new Event('beforeunload', {cancelable:true});
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
    unmount();
  });
  it('rearms an accepted discard when departure fails', async () => {
    const { unmount } = renderHook(() => useUnsavedFormGuard(true));
    confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await resolveUnsavedForms()).toBe(true);
    act(() => rearmUnsavedForms());
    expect(await resolveUnsavedForms()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
    unmount();
  });
  it('rolls back all accepted guards when a later guard cancels', async () => {
    const { unmount } = renderHook(() => useUnsavedFormGuard(true));
    const resetEditor = vi.fn();
    const unregister = registerUnsavedFormGuard(async () => false, resetEditor);
    confirm.mockResolvedValue(true);
    expect(await resolveUnsavedForms()).toBe(false);
    expect(resetEditor).toHaveBeenCalledOnce();
    unregister();
    confirm.mockResolvedValueOnce(false);
    expect(await resolveUnsavedForms()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
    unmount();
  });
  it('successful save clears protection and new edits restore it', async () => {
    const { result, rerender, unmount } = renderHook(({dirty}) => useUnsavedFormGuard(dirty), {initialProps:{dirty:true}});
    act(() => result.current.markSaved());
    expect(await resolveUnsavedForms()).toBe(true);
    rerender({dirty:false});
    rerender({dirty:true});
    confirm.mockResolvedValueOnce(false);
    expect(await resolveUnsavedForms()).toBe(false);
    unmount();
  });
  it('blocks route departure until discard is confirmed', async () => {
    function Form() {
      useUnsavedFormGuard(true);
      return <><UnsavedFormsNavigationGuard /><Link to="/next">Leave</Link></>;
    }
    const router = createMemoryRouter([{path:'/',element:<Form />},{path:'/next',element:<p>Destination</p>}]);
    const { unmount } = render(<RouterProvider router={router} />);
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('link', {name:'Leave'}));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(router.state.location.pathname).toBe('/');
    fireEvent.click(screen.getByRole('link', {name:'Leave'}));
    await screen.findByText('Destination');
    expect(router.state.location.pathname).toBe('/next');
    unmount();
  });
});
