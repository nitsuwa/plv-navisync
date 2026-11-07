/**
 * Run a timeout only while its document is visible. Animation-driven work such
 * as map camera recovery may be suspended by the browser while a tab is
 * hidden, so its watchdog must not report a false failure during that pause.
 */
export function scheduleVisibleTimeout(
  callback: () => void,
  delayMs: number,
  documentRef: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> = document,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const handleVisibilityChange = () => {
    clearTimer();
    if (disposed || documentRef.visibilityState === "hidden") return;
    timer = setTimeout(() => {
      timer = null;
      if (disposed || documentRef.visibilityState === "hidden") return;
      disposed = true;
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      callback();
    }, delayMs);
  };

  documentRef.addEventListener("visibilitychange", handleVisibilityChange);
  handleVisibilityChange();

  return () => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
