import { useRef } from "react";

/**
 * Keeps event callbacks stable across parent-only UI updates while always
 * invoking the latest supplied implementation. Use at memoized editor
 * boundaries where selection/inspector state lives in a much larger parent.
 */
export function useStableCallbackProps<T extends object>(props: T): T {
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;
  const callbacksRef = useRef<Record<string, (...args: unknown[]) => unknown>>({});
  const stableProps = { ...props } as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== "function") continue;
    if (!callbacksRef.current[key]) {
      callbacksRef.current[key] = (...args: unknown[]) => {
        const current = (latestPropsRef.current as Record<string, unknown>)[key];
        return typeof current === "function" ? current(...args) : undefined;
      };
    }
    stableProps[key] = callbacksRef.current[key];
  }

  return stableProps as T;
}
