import { describe, it, expect } from "vitest";
import { screenToWorld, panToKeepWorldPoint, getSvgContentBox, computeBuildingPlacement } from "../editorPlacement";

const CANVAS = { canvasW: 900, canvasH: 680 };

/**
 * Regression tests for the manual-test coordinate bugs:
 *  - the rubber-band box was shifted right of the cursor, and
 *  - freshly-created campuses could place objects toward the top-left.
 * Root cause: the conversion assumed the SVG viewBox spans the whole element,
 * ignoring preserveAspectRatio="xMidYMid meet" letterboxing, and had no guard
 * for degenerate rects.
 */

function rect(x: number, y: number, w: number, h: number) {
  return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h };
}

describe("getSvgContentBox — letterbox math", () => {
  it("exact aspect ratio → no offsets, element-box scale", () => {
    const box = getSvgContentBox(rect(0, 0, 900, 680), 900, 680);
    expect(box.offsetX).toBe(0);
    expect(box.offsetY).toBe(0);
    expect(box.scale).toBeCloseTo(1, 6);
  });

  it("wider container → horizontal letterbox (content centered, margins on the sides)", () => {
    // Container 1200x680 for a 900x680 canvas: content fills height, width 900,
    // with 150px margins left and right.
    const box = getSvgContentBox(rect(0, 0, 1200, 680), 900, 680);
    expect(box.scale).toBeCloseTo(1, 6);
    expect(box.offsetX).toBeCloseTo(150, 6);
    expect(box.offsetY).toBeCloseTo(0, 6);
  });

  it("taller container → vertical letterbox", () => {
    const box = getSvgContentBox(rect(0, 0, 900, 900), 900, 680);
    expect(box.offsetY).toBeCloseTo(110, 6);
    expect(box.offsetX).toBeCloseTo(0, 6);
  });

  it("both dimensions letterboxed (container smaller in one axis, larger in the other)", () => {
    const box = getSvgContentBox(rect(0, 0, 1200, 600), 900, 680);
    // scale = min(1200/900, 600/680) = 0.8823…
    expect(box.scale).toBeCloseTo(0.8823529, 4);
    expect(box.offsetX).toBeCloseTo((1200 - 900 * box.scale) / 2, 4);
    expect(box.offsetY).toBeCloseTo(0, 4);
  });

  it("degenerate rect (0 size — fresh/not-yet-laid-out canvas) returns a safe fallback", () => {
    const box = getSvgContentBox(rect(0, 0, 0, 0), 900, 680);
    expect(box.offsetX).toBe(0);
    expect(box.offsetY).toBe(0);
    expect(box.scale).toBe(1);
  });
});

describe("screenToWorld — single shared pointer→world conversion", () => {
  it("1:1 stub rect (tests' mock) maps client coords directly to world coords at zoom 1", () => {
    const pt = screenToWorld(450, 340, rect(0, 0, 900, 680), 900, 680, { x: 0, y: 0 }, 1);
    expect(pt.x).toBeCloseTo(450, 6);
    expect(pt.y).toBeCloseTo(340, 6);
  });

  it("letterboxed container: content left edge is world x=0, center is canvasW/2 — NO right-shift", () => {
    const r = rect(0, 0, 1200, 680);
    // Content left edge sits at clientX = 150 (the letterbox margin).
    const left = screenToWorld(150, 340, r, 900, 680, { x: 0, y: 0 }, 1);
    expect(left.x).toBeCloseTo(0, 4);
    // Content center is at clientX = 150 + 450 = 600.
    const center = screenToWorld(600, 340, r, 900, 680, { x: 0, y: 0 }, 1);
    expect(center.x).toBeCloseTo(450, 4);
    // Content right edge is at clientX = 150 + 900 = 1050.
    const right = screenToWorld(1050, 340, r, 900, 680, { x: 0, y: 0 }, 1);
    expect(right.x).toBeCloseTo(900, 4);
  });

  it("cursor coordinate EXACTLY under the pointer at zoom + pan (round-trip)", () => {
    const r = rect(20, 40, 1200, 680);
    const pan = { x: 100, y: 50 };
    const zoom = 1.5;
    // World point (500, 300) → screen: clientX = 20 + 150 + (500*1.5 + 100) = 1020
    const sx = 20 + 150 + (500 * zoom + pan.x);
    const sy = 40 + (300 * zoom + pan.y);
    const pt = screenToWorld(sx, sy, r, 900, 680, pan, zoom);
    expect(pt.x).toBeCloseTo(500, 4);
    expect(pt.y).toBeCloseTo(300, 4);
  });

  it("vertical letterbox round-trips too", () => {
    const r = rect(0, 0, 900, 900); // 110px top/bottom margins
    const pt = screenToWorld(450, 110 + 340, r, 900, 680, { x: 0, y: 0 }, 1);
    expect(pt.x).toBeCloseTo(450, 4);
    expect(pt.y).toBeCloseTo(340, 4);
  });

  it("degenerate rect never collapses to (0,0)", () => {
    const pt = screenToWorld(500, 300, rect(0, 0, 0, 0), 900, 680, { x: 0, y: 0 }, 1);
    expect(pt.x).toBe(500);
    expect(pt.y).toBe(300);
  });

  it("zero/negative zoom is guarded (defaults to 1)", () => {
    const pt = screenToWorld(450, 340, rect(0, 0, 900, 680), 900, 680, { x: 0, y: 0 }, 0);
    expect(pt.x).toBeCloseTo(450, 6);
  });
});

describe("panToKeepWorldPoint — zoom-to-cursor keeps the cursor point fixed", () => {
  it("the returned pan places the world point exactly at the client point", () => {
    const r = rect(0, 0, 1200, 680);
    const world = { x: 300, y: 200 };
    const zoom = 2;
    const pan = panToKeepWorldPoint(600, 400, r, 900, 680, world.x, world.y, zoom);
    // Re-run the forward conversion and verify it lands on the world point.
    const back = screenToWorld(600, 400, r, 900, 680, pan, zoom);
    expect(back.x).toBeCloseTo(world.x, 4);
    expect(back.y).toBeCloseTo(world.y, 4);
  });
});

describe("computeBuildingPlacement — click never lands at (0,0) unless clicked there", () => {
  it("a center click yields a center placement (no top-left stick)", () => {
    const r = computeBuildingPlacement(450, 340, 450, 340, 900, 680);
    expect(r.x).toBe(450);
    expect(r.y).toBe(340);
    expect(r.width).toBe(40); // minimum footprint for a click
    expect(r.height).toBe(30);
  });

  it("clamps inside the canvas", () => {
    const r = computeBuildingPlacement(900, 680, 900, 680, 900, 680);
    expect(r.x + r.width).toBeLessThanOrEqual(900);
    expect(r.y + r.height).toBeLessThanOrEqual(680);
  });
});
