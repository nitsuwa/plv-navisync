import { useMemo } from "react";

/**
 * Splits text into segments, highlighting portions that match a search query.
 * Returns an array of { text, isHighlight } objects for rendering.
 *
 * @example
 * ```tsx
 * const segments = highlightSearch("Computer Laboratory", "comp");
 * // [{ text: "Comp", isHighlight: true }, { text: "uter Laboratory", isHighlight: false }]
 * ```
 */
export function highlightSearch(text: string, query: string): { text: string; isHighlight: boolean }[] {
  if (!query || !text) return [{ text, isHighlight: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments: { text: string; isHighlight: boolean }[] = [];

  let lastIndex = 0;
  let matchIndex = lowerText.indexOf(lowerQuery);

  while (matchIndex !== -1) {
    // Text before the match
    if (matchIndex > lastIndex) {
      segments.push({ text: text.slice(lastIndex, matchIndex), isHighlight: false });
    }
    // The matching part
    segments.push({ text: text.slice(matchIndex, matchIndex + query.length), isHighlight: true });
    lastIndex = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
  }

  // Remaining text after the last match
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isHighlight: false });
  }

  return segments.length > 0 ? segments : [{ text, isHighlight: false }];
}

/**
 * React hook version — returns memoized highlight segments.
 */
export function useSearchHighlight(text: string, query: string) {
  return useMemo(() => highlightSearch(text, query), [text, query]);
}
