import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared unsaved-changes guard controller used by BOTH editors.
 *
 * - `guard(run)` — run a navigation/exit action, prompting with the shared
 *   modal first whenever the editor is dirty (or `force` is set for the
 *   clean-but-unpublished info state). The pending action is stored so it can
 *   be resumed after Save Draft / Discard Changes or cancelled by Continue
 *   Editing. Repeated guard() calls while a prompt is open replace the single
 *   pending action — never stack modals.
 * - Registers the NATIVE `beforeunload` protection while dirty so refresh /
 *   tab-close / window-close always warn (custom modals are impossible there).
 * - `saveAndContinue` runs the editor's real save flow; on failure the modal
 *   stays open (work is preserved) with an inline error.
 * - `discard` restores the editor's saved baseline, then resumes the pending
 *   action. `cancel` (Continue Editing) keeps the current state untouched.
 */
export interface PendingNavigationOptions {
  /** Shown as the modal body text (e.g. "...before switching floors."). */
  description?: string;
  /** Open the modal even when clean (used for the "Unpublished Changes" info state). */
  force?: boolean;
}

export interface UnsavedChangesGuardController {
  guard: (run: () => void, opts?: PendingNavigationOptions) => void;
  open: boolean;
  saving: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  pendingDescription?: string;
  cancel: () => void;
  discard: () => void;
  saveAndContinue: () => Promise<void>;
}

interface UseUnsavedChangesGuardOptions {
  isDirty: boolean;
  /** Real save flow — must return true only when the changes were persisted. */
  onSave: () => Promise<boolean>;
  /** Restore the last saved baseline (only invoked on explicit Discard). */
  onDiscard: () => void;
}

export function useUnsavedChangesGuard({
  isDirty,
  onSave,
  onDiscard,
}: UseUnsavedChangesGuardOptions): UnsavedChangesGuardController {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;

  const pendingRef = useRef<{ run: () => void; description?: string } | null>(null);
  const [pendingDescription, setPendingDescription] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NATIVE browser confirmation for refresh / tab close / window close.
  // A custom modal is not allowed there, so only the browser dialog is used —
  // and only when there are actual unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const guard = useCallback((run: () => void, opts?: PendingNavigationOptions) => {
    if (!isDirtyRef.current && !opts?.force) {
      run();
      return;
    }
    pendingRef.current = { run, description: opts?.description };
    setPendingDescription(opts?.description);
    setError(null);
    setOpen(true);
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPendingDescription(undefined);
    setError(null);
    setOpen(false);
  }, []);

  const discard = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    onDiscardRef.current();
    pendingRef.current = null;
    setPendingDescription(undefined);
    setError(null);
    setOpen(false);
    pending.run();
  }, []);

  const saveAndContinue = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    setSaving(true);
    setError(null);
    const ok = await onSaveRef.current();
    if (!ok) {
      // Keep the user in place on a failed save — never discard on failure.
      setSaving(false);
      setError((prev) => prev ?? "Save failed. Your changes were not saved.");
      return;
    }
    setSaving(false);
    pendingRef.current = null;
    setPendingDescription(undefined);
    setOpen(false);
    pending.run();
  }, []);

  return {
    guard,
    open,
    saving,
    error,
    setError,
    pendingDescription,
    cancel,
    discard,
    saveAndContinue,
  };
}
