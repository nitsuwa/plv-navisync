import { useCallback, useEffect, useRef, useState } from "react";

export function isCanvasTextEditingTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined") return false;
  const element = target instanceof Element ? target : document.activeElement;
  if (!(element instanceof Element)) return false;
  const tag = element.tagName;
  return tag === "INPUT"
    || tag === "TEXTAREA"
    || tag === "SELECT"
    || element.closest("[contenteditable='true']") !== null;
}

/**
 * Shared temporary-pan modifier for canvas editors.
 *
 * The listener is scoped to the mounted editor (`enabled`) and deliberately
 * ignores editable controls so Space still types normally in labels/forms.
 * A window-level keyup/blur cleanup prevents a stuck pan when the pointer or
 * focus leaves the editor while Space is held.
 */
export function useSpacePan(enabled = true) {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);

  const reset = useCallback(() => {
    spaceHeldRef.current = false;
    setSpaceHeld(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isCanvasTextEditingTarget(event.target)) return;
      event.preventDefault();
      if (!spaceHeldRef.current) {
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") reset();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
      reset();
    };
  }, [enabled, reset]);

  return { spaceHeld, reset };
}
