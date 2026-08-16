import { useEffect } from "react";

/**
 * Closes a modal/dialog when the user presses Escape.
 * Deliberately ignores the key when focus is inside a text input, textarea,
 * or content-editable element (e.g. a search box), so typing in a nested
 * picker does not dismiss the whole dialog.
 */
export function useEscToClose(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, enabled]);
}
