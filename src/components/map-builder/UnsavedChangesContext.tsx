import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

/**
 * Page-level unsaved-changes guard.
 *
 * The active editor page (AdminMapBuilderPage) registers a handler exposing its
 * live dirty state and its real save/discard implementations. Any navigation
 * that would UNMOUNT the page (sidebar sections, sign out, browser back) goes
 * through `requestGuarded` so it passes through the SAME shared modal flow as
 * the editors' internal exits — one guard path everywhere.
 *
 * Browser back is intercepted via `popstate`: the pending pop is cancelled
 * with a same-URL pushState and shown in the modal; proceeding runs
 * `window.history.back()` again (now clean after save/discard) which resolves
 * normally because the handler is no longer dirty.
 */
export interface UnsavedChangesHandler {
  isDirty: () => boolean;
  /** Saved draft differs from the currently live/published campus. */
  hasUnpublishedChanges?: () => boolean;
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
}

interface UnsavedChangesContextValue {
  registerHandler: (handler: UnsavedChangesHandler | null) => void;
  requestGuarded: (run: () => void, opts?: { description?: string }) => void;
}

const noop = () => {};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  registerHandler: noop,
  requestGuarded: noop,
});

export function useUnsavedChangesContext(): UnsavedChangesContextValue {
  return useContext(UnsavedChangesContext);
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<UnsavedChangesHandler | null>(null);
  const pendingRef = useRef<{ run: () => void; description?: string } | null>(null);
  const [pending, setPending] = useState<{ description?: string; isDirty: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const registerHandler = useCallback((handler: UnsavedChangesHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const requestGuarded = useCallback((run: () => void, opts?: { description?: string }) => {
    const handler = handlerRef.current;
    const isDirty = Boolean(handler?.isDirty());
    const hasUnpublishedChanges = Boolean(handler?.hasUnpublishedChanges?.());
    if (!isDirty && !hasUnpublishedChanges) {
      run();
      return;
    }
    pendingRef.current = { run, description: opts?.description };
    setPending({ description: opts?.description, isDirty });
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
    setError(null);
  }, []);

  const discard = useCallback(() => {
    const pendingAction = pendingRef.current;
    if (!pendingAction) return;
    handlerRef.current?.onDiscard();
    pendingRef.current = null;
    setPending(null);
    setError(null);
    pendingAction.run();
  }, []);

  const saveAndContinue = useCallback(async () => {
    const pendingAction = pendingRef.current;
    if (!pendingAction || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const ok = await handlerRef.current?.onSave();
      if (!ok) {
        setError((prev) => prev ?? "Save failed. Your changes were not saved.");
        return;
      }
      pendingRef.current = null;
      setPending(null);
      setError(null);
      pendingAction.run();
    } catch {
      setError((prev) => prev ?? "Save failed. Your changes were not saved.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  // Browser back / forward while the map builder has unsaved changes.
  useEffect(() => {
    const onPopState = () => {
      const handler = handlerRef.current;
      const isDirty = Boolean(handler?.isDirty());
      const hasUnpublishedChanges = Boolean(handler?.hasUnpublishedChanges?.());
      if (!isDirty && !hasUnpublishedChanges) return;
      // Cancel the pop and re-assert the current URL; the pending action
      // replays history.back() once the user resolves the modal.
      window.history.pushState(null, "", window.location.href);
      pendingRef.current = { run: () => window.history.back() };
      setPending({
        isDirty,
        description: isDirty
          ? "Your unsaved changes would be lost if you leave this page."
          : "Your saved changes have not been published yet.",
      });
      setError(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <UnsavedChangesContext.Provider value={{ registerHandler, requestGuarded }}>
      {children}
      <UnsavedChangesDialog
        open={!!pending}
        isDirty={pending?.isDirty ?? true}
        saving={saving}
        error={error}
        description={pending?.description ?? "Your latest edits haven't been saved yet."}
        onCancel={cancel}
        onSave={saveAndContinue}
        onDiscard={discard}
      />
    </UnsavedChangesContext.Provider>
  );
}
