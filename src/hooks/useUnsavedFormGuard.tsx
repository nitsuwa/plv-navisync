import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useBlocker } from 'react-router';
import { confirmAction } from '../lib/confirmAction';

const guards = new Set<() => Promise<boolean>>();
const rearmHandlers = new Set<() => void>();
const dirtyChecks = new Set<() => boolean>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const hasDirtyForms = () => [...dirtyChecks].some(check => check());
let resolving: Promise<boolean> | null = null;

/** Custom editor guards can participate before authentication is destroyed. */
export function registerUnsavedFormGuard(guard: () => Promise<boolean>, onRearm?: () => void): () => void {
  guards.add(guard);
  if (onRearm) rearmHandlers.add(onRearm);
  return () => { guards.delete(guard); if (onRearm) rearmHandlers.delete(onRearm); };
}

/** A cancelled or failed departure must not authorize a future departure. */
export function rearmUnsavedForms() {
  rearmHandlers.forEach(rearm => rearm());
  notify();
}

export function resolveUnsavedForms(): Promise<boolean> {
  if (resolving) return resolving;
  resolving = (async () => {
    try {
      for (const guard of [...guards]) {
        if (!(await guard())) { rearmUnsavedForms(); return false; }
      }
      return true;
    } catch {
      rearmUnsavedForms();
      return false;
    }
  })().finally(() => { resolving = null; });
  return resolving;
}

/** Mount once per route layout, rather than one router blocker per form. */
export function UnsavedFormsNavigationGuard() {
  const dirty = useSyncExternalStore(subscribe, hasDirtyForms, () => false);
  // Existing map editors own their blockers. Register ours only while one of
  // the ordinary forms actually has unfinished work.
  return dirty ? <ActiveFormsNavigationGuard /> : null;
}

function ActiveFormsNavigationGuard() {
  const blocker = useBlocker(hasDirtyForms);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void resolveUnsavedForms().then(allowed => {
      if (!active) return;
      if (allowed) blocker.proceed(); else blocker.reset();
    });
    return () => { active = false; };
  }, [blocker]);
  return null;
}

export function useUnsavedFormGuard(dirty: boolean, busy = false) {
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy };
  const cleared = useRef(false);
  if (!dirty) cleared.current = false;
  const markSaved = useCallback(() => { cleared.current = true; }, []);
  const requestDiscard = useCallback(async () => {
    if (current.current.busy) return false;
    if (!current.current.dirty || cleared.current) return true;
    const allowed = await confirmAction({
      title: 'Discard unsaved changes?',
      message: 'Your changes have not been saved. Discard them and leave?',
      cancelLabel: 'Keep editing', confirmLabel: 'Discard changes',
    });
    if (allowed) cleared.current = true;
    return allowed;
  }, []);
  useEffect(() => { notify(); }, [dirty, busy]);
  useEffect(() => {
    const check = () => current.current.busy || (current.current.dirty && !cleared.current);
    dirtyChecks.add(check);
    notify();
    const unregister = registerUnsavedFormGuard(requestDiscard, () => { cleared.current = false; });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (check()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister(); dirtyChecks.delete(check);
      notify();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [requestDiscard]);
  return { requestDiscard, markSaved };
}
