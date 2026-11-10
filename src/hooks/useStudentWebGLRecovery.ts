import { useEffect, type RefObject } from "react";
import { recordDiagnosticEvent } from "../lib/diagnostics";

export function useStudentWebGLRecovery(
  surfaceRef: RefObject<HTMLDivElement>,
  invalidateRef: RefObject<(() => void) | null>,
  source: string,
  onFallback?: () => void,
) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let recoveryTimeout: number | undefined;
    const contextLost = (event: Event) => {
      // Cancelling context loss allows the browser to restore it on the same canvas.
      event.preventDefault();
      if (recoveryTimeout !== undefined) return;
      recordDiagnosticEvent({ category: "renderer", severity: "warning", summary: "Waiting for the 3D WebGL context to recover.", source });
      recoveryTimeout = window.setTimeout(() => {
        recordDiagnosticEvent({ category: "renderer", severity: "error", summary: "The 3D WebGL context did not recover.", source });
        onFallback?.();
      }, 3000);
    };
    const contextRestored = () => {
      window.clearTimeout(recoveryTimeout);
      recoveryTimeout = undefined;
      invalidateRef.current?.();
    };

    // These events do not bubble. Capture them even if Canvas initializes later.
    surface.addEventListener("webglcontextlost", contextLost, true);
    surface.addEventListener("webglcontextrestored", contextRestored, true);
    return () => {
      window.clearTimeout(recoveryTimeout);
      surface.removeEventListener("webglcontextlost", contextLost, true);
      surface.removeEventListener("webglcontextrestored", contextRestored, true);
    };
  }, [surfaceRef, invalidateRef, source, onFallback]);
}
