import { useEffect, useRef, useState } from "react";

/** Saves committed event edits after a quiet interval; never retries in a loop. */
export function useEventAutosave(dirty: boolean, enabled: boolean, revision: unknown, save: () => Promise<boolean>): string {
  const latestSave = useRef(save);
  latestSave.current = save;
  const inFlight = useRef(false);
  const lastAttempt = useRef<{ revision: unknown; saved: boolean } | null>(null);
  const [settled, setSettled] = useState(0);
  const [status, setStatus] = useState("Saved");
  useEffect(() => {
    if (!dirty) { setStatus("Saved"); lastAttempt.current = null; return; }
    if (lastAttempt.current && lastAttempt.current.revision === revision) {
      setStatus(lastAttempt.current.saved ? "Saved" : "Autosave failed — use Save draft to retry");
      return;
    }
    if (inFlight.current) { setStatus("Saving…"); return; }
    if (!enabled) { setStatus("Unsaved changes"); return; }
    setStatus("Unsaved changes — autosave pending");
    const timer = window.setTimeout(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      setStatus("Saving…");
      let saved = false;
      try { saved = await latestSave.current(); } catch { /* preserve the draft */ }
      finally { inFlight.current = false; }
      lastAttempt.current = { revision, saved };
      setSettled((previous) => previous + 1);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [dirty, enabled, revision, settled]);
  return status;
}
