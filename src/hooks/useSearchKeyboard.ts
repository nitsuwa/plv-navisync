import { useEffect, useRef, useCallback, useState } from "react";

interface UseSearchKeyboardOptions {
  /** Called when the keyboard shortcut (/) is pressed and search should be focused */
  onFocus?: () => void;
  /** Called when Escape is pressed and search should be cleared */
  onClear?: () => void;
  /** Whether the search is currently active (has a value) */
  hasValue?: boolean;
  /** Additional key to use for focusing (default: "/") */
  focusKey?: string;
  /** Optional callback for arrow key navigation through results */
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  /** Called when Enter is pressed in the search (useful for submitting) */
  onEnter?: () => void;
}

interface UseSearchKeyboardReturn {
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Whether the user pressed `/` to focus — useful for showing a hint */
  showShortcutHint: boolean;
  /** Call to dismiss the shortcut hint */
  dismissHint: () => void;
}

/**
 * Adds keyboard shortcuts for search inputs:
 * - Press `/` to focus the search input (anywhere on the page)
 * - Press `Escape` to clear the search (when input is focused and has a value)
 * - Press `ArrowUp` / `ArrowDown` to navigate results (optional)
 * - Press `Enter` to submit/select (optional)
 */
export function useSearchKeyboard({
  onFocus,
  onClear,
  hasValue,
  focusKey = "/",
  onArrowUp,
  onArrowDown,
  onEnter,
}: UseSearchKeyboardOptions = {}): UseSearchKeyboardReturn {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showShortcutHint, setShowShortcutHint] = useState(false);

  const onFocusRef = useRef(onFocus);
  const onClearRef = useRef(onClear);
  const onArrowUpRef = useRef(onArrowUp);
  const onArrowDownRef = useRef(onArrowDown);
  const onEnterRef = useRef(onEnter);

  onFocusRef.current = onFocus;
  onClearRef.current = onClear;
  onArrowUpRef.current = onArrowUp;
  onArrowDownRef.current = onArrowDown;
  onEnterRef.current = onEnter;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";

      // `/` key: focus the search input (only when not already in an input)
      if (e.key === focusKey && !isInputFocused && !e.repeat) {
        // Check for keyboard shortcut hint — only on first use
        try {
          const hintSeen = localStorage.getItem("plv-search-hint-dismissed");
          if (!hintSeen) setShowShortcutHint(true);
        } catch {}

        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        onFocusRef.current?.();
      }

      // Escape key: clear search when input is focused
      if (e.key === "Escape" && isInputFocused && document.activeElement === inputRef.current) {
        if (hasValue) {
          e.preventDefault();
          onClearRef.current?.();
        } else {
          inputRef.current?.blur();
        }
      }

      // Arrow navigation through results
      if (isInputFocused && document.activeElement === inputRef.current) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onArrowDownRef.current?.();
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onArrowUpRef.current?.();
        }
        if (e.key === "Enter" && !e.shiftKey) {
          onEnterRef.current?.();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusKey, hasValue]);

  const dismissHint = useCallback(() => {
    setShowShortcutHint(false);
    try {
      localStorage.setItem("plv-search-hint-dismissed", "true");
    } catch {}
  }, []);

  return { inputRef, showShortcutHint, dismissHint };
}
