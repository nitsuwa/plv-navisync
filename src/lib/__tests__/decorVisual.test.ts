import { describe, it, expect } from "vitest";
import { DECOR_ASSET_TYPES } from "../../components/map-builder/constants";
import {
  DECOR_RENDER_SCALE,
  DECOR_SELECTION_OUTLINE_PADDING,
  decorSelectionOutlineBox,
  decorRenderScale,
  decorWorldSize,
  getDecorParts,
} from "../decorVisual";

interface Pt {
  x: number;
  y: number;
}

/**
 * Coarse, conservative bounding box of an SVG path string.
 *
 * Supports the command subset used by the asset artwork (M/L/Q/C/Z, their
 * relative lowercase forms, and `a`/`A` arcs). Curves are bounded by their
 * control points (the curve lies inside the convex hull) and arcs by the
 * full-ellipse bbox, so the returned box always CONTAINS the drawn geometry.
 * Any unsupported command fails loudly so the helper is extended deliberately.
 */
function parsePathBounds(d: string): { minX: number; minY: number; maxX: number; maxY: number } {
  let cur: Pt = { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const track = (x: number, y: number) => {
    // Fail loudly on malformed numbers: a NaN coordinate would otherwise be
    // silently ignored and leave Infinity/-Infinity bounds that pass the
    // range assertions vacuously.
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Non-finite coordinate in path: ${d}`);
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  const num = () => Number(tokens[i++]);

  // Track an arc's full-ellipse bbox (x-rotation 0 for all authored arcs).
  const arcBBox = (p: Pt, rx: number, ry: number, sweep: number, end: Pt) => {
    const x1p = (p.x - end.x) / 2;
    const y1p = (p.y - end.y) / 2;
    const denom = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let cx = (p.x + end.x) / 2;
    let cy = (p.y + end.y) / 2;
    if (denom > 0 && rx > 0 && ry > 0) {
      const coef =
        (sweep === 1 ? -1 : 1) *
        Math.sqrt(
          Math.max(0, (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) / denom)
        );
      cx += coef * ((rx * y1p) / ry);
      cy += coef * ((-ry * x1p) / rx);
    }
    track(cx - rx, cy - ry);
    track(cx + rx, cy + ry);
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case "M":
        cur = { x: num(), y: num() };
        track(cur.x, cur.y);
        break;
      case "m":
        cur = { x: cur.x + num(), y: cur.y + num() };
        track(cur.x, cur.y);
        break;
      case "L":
        cur = { x: num(), y: num() };
        track(cur.x, cur.y);
        break;
      case "l":
        cur = { x: cur.x + num(), y: cur.y + num() };
        track(cur.x, cur.y);
        break;
      case "Q": {
        const cx = num();
        const cy = num();
        track(cx, cy);
        cur = { x: num(), y: num() };
        track(cur.x, cur.y);
        break;
      }
      case "q": {
        const cx = cur.x + num();
        const cy = cur.y + num();
        track(cx, cy);
        cur = { x: cur.x + num(), y: cur.y + num() };
        track(cur.x, cur.y);
        break;
      }
      case "C": {
        const c1x = num();
        const c1y = num();
        const c2x = num();
        const c2y = num();
        track(c1x, c1y);
        track(c2x, c2y);
        cur = { x: num(), y: num() };
        track(cur.x, cur.y);
        break;
      }
      case "c": {
        const c1x = cur.x + num();
        const c1y = cur.y + num();
        const c2x = cur.x + num();
        const c2y = cur.y + num();
        track(c1x, c1y);
        track(c2x, c2y);
        cur = { x: cur.x + num(), y: cur.y + num() };
        track(cur.x, cur.y);
        break;
      }
      case "a": {
        const rx = num();
        const ry = num();
        num(); // x-axis rotation (always 0 in authored artwork)
        num(); // large-arc flag
        const sweep = num();
        const end = { x: cur.x + num(), y: cur.y + num() };
        track(cur.x, cur.y);
        track(end.x, end.y);
        arcBBox(cur, rx, ry, sweep, end);
        cur = end;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        num();
        num();
        const sweep = num();
        const end = { x: num(), y: num() };
        track(cur.x, cur.y);
        track(end.x, end.y);
        arcBBox(cur, rx, ry, sweep, end);
        cur = end;
        break;
      }
      case "Z":
      case "z":
        break;
      default:
        throw new Error(`Unsupported path command "${cmd}" in ${d}`);
    }
  }
  return { minX, minY, maxX, maxY };
}

describe("decorRenderScale", () => {
  it("applies the fixed 3× display factor", () => {
    expect(DECOR_RENDER_SCALE).toBe(3);
    expect(decorRenderScale()).toBe(3);
    expect(decorRenderScale(1)).toBe(3);
    expect(decorRenderScale(2)).toBe(6);
    expect(decorRenderScale(0.5)).toBe(1.5);
    expect(decorRenderScale(0)).toBe(0);
  });
});

describe("decorWorldSize", () => {
  it("returns width/height in world units at the given scale", () => {
    expect(decorWorldSize({ defaultWidth: 24, defaultHeight: 28 }, 1)).toEqual({ width: 72, height: 84 });
    expect(decorWorldSize({ defaultWidth: 24, defaultHeight: 28 }, 2)).toEqual({ width: 144, height: 168 });
    expect(decorWorldSize({ defaultWidth: 36, defaultHeight: 18 })).toEqual({ width: 108, height: 54 });
  });

  it("defaults to scale 1 when scale is undefined", () => {
    expect(decorWorldSize({ defaultWidth: 10, defaultHeight: 10 })).toEqual({ width: 30, height: 30 });
  });
});

describe("decorSelectionOutlineBox", () => {
  it("adds a small visual-only padding around the rendered decor size", () => {
    const box = decorSelectionOutlineBox({ defaultWidth: 24, defaultHeight: 28 }, 1);

    expect(DECOR_SELECTION_OUTLINE_PADDING).toBe(6);
    expect(box.width).toBe(72 + 12);
    expect(box.height).toBe(84 + 12);
    expect(box.rx).toBeGreaterThanOrEqual(4);
  });
});

describe("getDecorParts", () => {
  it("returns the multi-part artwork when defined", () => {
    const t = DECOR_ASSET_TYPES[0];
    const parts = getDecorParts(t);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].d).toBe(t.parts![0].d);
  });

  it("falls back to the legacy single path + color", () => {
    const parts = getDecorParts({
      type: "tree", label: "T", category: "C", color: "#fff",
      svgPath: "M0 0 Z", defaultWidth: 10, defaultHeight: 10,
    });
    expect(parts).toEqual([{ d: "M0 0 Z", fill: "#fff" }]);
  });

  it("handles an unknown descriptor", () => {
    expect(getDecorParts(undefined)).toEqual([]);
  });
});

describe("DECOR_ASSET_TYPES artwork contract", () => {
  it("every supported type has multi-part artwork with non-empty paths", () => {
    for (const t of DECOR_ASSET_TYPES) {
      expect(t.parts, `${t.type} should define parts`).toBeDefined();
      expect(t.parts!.length, `${t.type} should use at least 2 parts`).toBeGreaterThanOrEqual(2);
      for (const p of t.parts!) {
        expect(p.d.trim().length, `${t.type} part path should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it("every part's artwork stays inside the asset's declared bounds", () => {
    // The canvas renders parts in local 0..defaultWidth × 0..defaultHeight space
    // (translated by -w/2,-h/2). Artwork poking outside that box would render
    // larger than the selection/hitbox, breaking rubber-band and group bounds.
    const MARGIN = 2; // coarse parser tolerance; authored art stays ~1+ unit inside
    for (const t of DECOR_ASSET_TYPES) {
      for (const p of t.parts!) {
        const b = parsePathBounds(p.d);
        expect(b.minX, `${t.type} part minX`).toBeGreaterThanOrEqual(-MARGIN);
        expect(b.maxX, `${t.type} part maxX`).toBeLessThanOrEqual(t.defaultWidth + MARGIN);
        expect(b.minY, `${t.type} part minY`).toBeGreaterThanOrEqual(-MARGIN);
        expect(b.maxY, `${t.type} part maxY`).toBeLessThanOrEqual(t.defaultHeight + MARGIN);
      }
    }
  });

  it("every part is visible and no identical part is redefined in another type", () => {
    // Every part must have a fill or stroke so it renders visibly, and a part
    // (path + colors) must not be accidentally copy-pasted across types.
    const seen = new Map<string, string>();
    for (const t of DECOR_ASSET_TYPES) {
      for (const p of t.parts!) {
        expect(p.fill || p.stroke, `${t.type} part should be visible`).toBeTruthy();
        const key = `${p.d.replace(/\s+/g, " ")}|${p.fill ?? ""}|${p.stroke ?? ""}|${p.strokeWidth ?? ""}`;
        if (seen.has(key)) {
          expect(seen.get(key), `identical part reused by ${t.type}`).toBe(t.type);
        } else {
          seen.set(key, t.type);
        }
      }
    }
  });
});
