/** Visual-only Room label layout shared by the editor and readonly renderer. */

export interface RoomLabelLayoutOptions {
  text: string;
  maxWidth: number;
  fontSize: number;
  minFontSize?: number;
  paddingX?: number;
  paddingY?: number;
}

export interface RoomLabelLayout {
  lines: string[];
  width: number;
  height: number;
  textBlockHeight: number;
  fontSize: number;
  lineHeight: number;
}

/** Return the vertical center of one line in a centered multi-line label block. */
export function roomLabelLineCenterY(centerY: number, lineIndex: number, lineCount: number, lineHeight: number) {
  return centerY + (lineIndex - (lineCount - 1) / 2) * lineHeight;
}

const NARROW_LABEL_GLYPHS = new Set("ijlrtfI");
const WIDE_LABEL_GLYPHS = new Set("MW@%&");

/** Deterministic, font-stack-friendly width estimate for SVG labels. */
export function estimateRoomLabelWidth(text: string, fontSize: number) {
  return Array.from(String(text ?? "")).reduce((total, glyph) => {
    if (glyph === " ") return total + fontSize * 0.28;
    if (NARROW_LABEL_GLYPHS.has(glyph)) return total + fontSize * 0.32;
    if (WIDE_LABEL_GLYPHS.has(glyph)) return total + fontSize * 0.86;
    if (/\d/.test(glyph)) return total + fontSize * 0.56;
    return total + fontSize * (glyph === glyph.toUpperCase() ? 0.64 : 0.55);
  }, 0);
}

/**
 * Word-wrap without dropping or splitting any words. Dynamic programming
 * chooses the fewest lines first, then the most balanced line widths.
 */
function balancedWordWrap(words: string[], maxWidth: number, fontSize: number) {
  if (words.length === 0) return [""];
  const memo = new Map<number, { lines: string[]; cost: number }>();

  const solve = (start: number): { lines: string[]; cost: number } => {
    if (start >= words.length) return { lines: [], cost: 0 };
    const cached = memo.get(start);
    if (cached) return cached;
    let best: { lines: string[]; cost: number } | null = null;

    for (let end = start + 1; end <= words.length; end += 1) {
      const line = words.slice(start, end).join(" ");
      const width = estimateRoomLabelWidth(line, fontSize);
      if (width > maxWidth && end > start + 1) break;
      const suffix = solve(end);
      // Over-wide single words stay intact. This is only relevant for
      // unusually narrow Rooms; preserving the complete word takes priority.
      const slack = Math.max(0, maxWidth - Math.min(width, maxWidth));
      const candidate = { lines: [line, ...suffix.lines], cost: slack * slack + suffix.cost };
      if (!best || candidate.lines.length < best.lines.length
        || (candidate.lines.length === best.lines.length && candidate.cost < best.cost)) best = candidate;
    }

    const result = best ?? { lines: [words[start]], cost: 0 };
    memo.set(start, result);
    return result;
  };

  return solve(0).lines;
}

/** Full-name layout. The label grows vertically instead of limiting line count. */
export function layoutRoomLabel(options: RoomLabelLayoutOptions): RoomLabelLayout {
  const maxWidth = Math.max(1, options.maxWidth);
  const paddingX = Math.min(Math.max(0, options.paddingX ?? 5), Math.max(0, (maxWidth - 1) / 2));
  const paddingY = Math.max(0, options.paddingY ?? 3.5);
  const innerWidth = Math.max(1, maxWidth - paddingX * 2);
  const initialFontSize = Math.max(1, options.fontSize);
  const minFontSize = Math.max(4, Math.min(initialFontSize, options.minFontSize ?? initialFontSize * 0.82));
  const words = String(options.text ?? "").trim().split(/\s+/).filter(Boolean);
  let fontSize = initialFontSize;
  let lines = balancedWordWrap(words, innerWidth, fontSize);

  // If one word is wider than the available line, reduce typography modestly
  // until it fits where possible; words remain intact and are never elided.
  while (fontSize > minFontSize + 0.01
    && words.some((word) => estimateRoomLabelWidth(word, fontSize) > innerWidth)) {
    fontSize = Math.max(minFontSize, fontSize - 0.5);
    lines = balancedWordWrap(words, innerWidth, fontSize);
  }

  const lineHeight = fontSize * 1.2;
  const textBlockHeight = lines.length * lineHeight;
  const longestLine = Math.max(fontSize, ...lines.map((line) => estimateRoomLabelWidth(line, fontSize)));
  const width = Math.min(maxWidth, Math.max(1, longestLine + paddingX * 2));
  return {
    lines,
    width,
    height: textBlockHeight + paddingY * 2,
    textBlockHeight,
    fontSize,
    lineHeight,
  };
}

/** Convenience wrapper for callers that express available width in characters. */
export function wrapRoomLabel(name: string, maxChars: number): string[] {
  const capacity = Math.max(1, maxChars);
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return balancedWordWrap(words, capacity, 1);
}
