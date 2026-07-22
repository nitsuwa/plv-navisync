import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Debounces a value — useful for delaying search queries until the user stops typing.
 *
 * @param value The value to debounce
 * @param delay Delay in milliseconds (default: 250)
 * @returns The debounced value that updates only after the delay
 *
 * @example
 * ```ts
 * const [search, setSearch] = useState("");
 * const debouncedSearch = useDebounce(search, 300);
 * // use debouncedSearch for filtering — results update only after 300ms of inactivity
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 250): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Returns a debounced version of a callback function.
 * Unlike useDebounce (which debounces a value), this debounces function calls.
 *
 * @param fn The function to debounce
 * @param delay Delay in milliseconds
 * @returns A debounced version of fn
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number = 250
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    ((...args: unknown[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}
