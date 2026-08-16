import { describe, it, expect } from "vitest";
import {
  computeGroupTranslation,
  groupBBoxAfterTranslation,
  computeGroupAlignmentGuides,
} from "../campusGroupMove";
import type { GroupMoveMember } from "../campusGroupMove";

function bld(id: string, x: number, y: number, width = 120, height = 80): GroupMoveMember {
  return { kind: "building", id, x, y, width, height };
}

/** Decor assets are center-positioned; width/height are full world extents. */
function decor(id: string, x: number, y: number, width = 72, height = 84): GroupMoveMember {
  return { kind: "decorAsset", id, x, y, width, height };
}

function pathMember(id: string, x: number, y: number, width = 160, height = 40): GroupMoveMember {
  return { kind: "path", id, x, y, width, height };
}

const CANVAS = { canvasW: 900, canvasH: 680 };

describe("computeGroupTranslation — rigid multi-object movement", () => {
  it("moves multiple selected buildings by the same grid-snapped delta", () => {
    const members = [bld("b1", 100, 100), bld("b2", 260, 100)];
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "b1",
      rawDx: 10,
      rawDy: 10,
      ...CANVAS,
      snapGrid: true,
    });
    // anchor 100+10=110 → snap to 120 → delta +20
    expect(dx).toBe(20);
    expect(dy).toBe(20);
    // Both members get the exact same delta — spacing preserved.
    expect(members[0].x + dx).toBe(120);
    expect(members[0].y + dy).toBe(120);
    expect(members[1].x + dx).toBe(280);
    expect(members[1].y + dy).toBe(120);
  });

  it("moves a mixed selection of buildings and decorative assets together rigidly", () => {
    const members = [bld("b1", 100, 100), decor("da1", 450, 120)];
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "da1",
      rawDx: 10,
      rawDy: 0,
      ...CANVAS,
      snapGrid: true,
    });
    // decor center 450+10=460 (snap 460); y 120 (snap 120)
    expect(dx).toBe(10);
    expect(dy).toBe(0);
    // Relative positions preserved: b1 center vs decor center delta unchanged.
    const b1Center = { x: 100 + 60 + dx, y: 100 + 40 + dy };
    const daCenter = { x: 450 + dx, y: 120 + dy };
    expect(b1Center.x).toBe(170);
    expect(daCenter.x - b1Center.x).toBe(290); // same as 450 - 160
    expect(daCenter.y - b1Center.y).toBe(-20); // same as 120 - 140
  });

  it("moves multiple pathways by the same rigid delta using top-left path bounds", () => {
    const members = [pathMember("p1", 100, 100), pathMember("p2", 300, 160)];
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "p1",
      rawDx: 23,
      rawDy: 17,
      ...CANVAS,
      snapGrid: true,
    });

    expect(dx).toBe(20);
    expect(dy).toBe(20);
    expect(members[1].x + dx - (members[0].x + dx)).toBe(200);
    expect(members[1].y + dy - (members[0].y + dy)).toBe(60);
  });

  it("preserves internal spacing regardless of how far the group is dragged", () => {
    const members = [bld("b1", 100, 100), bld("b2", 300, 180), decor("da1", 200, 300, 60, 60)];
    const before = members.map((m) => (m.kind === "building" ? { x: m.x, y: m.y } : { x: m.x, y: m.y }));
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "b2",
      rawDx: 37,
      rawDy: 41,
      ...CANVAS,
      snapGrid: true,
    });
    const after = members.map((m) => (m.kind === "building" ? { x: m.x + dx, y: m.y + dy } : { x: m.x + dx, y: m.y + dy }));
    // Every member moved by the exact same delta — rigid group.
    for (let i = 0; i < members.length; i++) {
      expect(after[i].x - before[i].x).toBe(dx);
      expect(after[i].y - before[i].y).toBe(dy);
    }
  });

  it("grid-snaps the group as a rigid unit (single snapped anchor)", () => {
    const members = [bld("b1", 100, 100), bld("b2", 260, 100)];
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "b1",
      rawDx: 15,
      rawDy: 15,
      ...CANVAS,
      snapGrid: true,
    });
    // anchor 100+15=115 → snap 120 → +20 for EVERY member (not per-member snapping)
    expect(dx).toBe(20);
    expect(dy).toBe(20);
    expect(members[1].x + dx).toBe(280); // b2 moved by the SAME delta, not its own snap
  });

  it("clamps the whole group inside the canvas without distorting spacing", () => {
    const members = [bld("b1", 800, 600), decor("da1", 850, 620, 72, 84)];
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "b1",
      rawDx: 100,
      rawDy: 100,
      ...CANVAS,
      snapGrid: true,
    });
    // anchor 800+100=900 (snap 900) → dx=100; then bbox maxX=920+100=1020 > 900 → clamp to -20.
    // bbox minY=578, maxY=680 → dy=100 pushes maxY to 780 > 680 → clamp back to exactly 0.
    expect(dx).toBe(-20);
    expect(dy).toBe(0);
    // Assert every member stays fully inside the canvas.
    for (const m of members) {
      const left = m.kind === "building" ? m.x + dx : m.x + dx - m.width / 2;
      const top = m.kind === "building" ? m.y + dy : m.y + dy - m.height / 2;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + m.width).toBeLessThanOrEqual(CANVAS.canvasW);
      expect(top + m.height).toBeLessThanOrEqual(CANVAS.canvasH);
    }
    // Spacing still preserved after clamping.
    const b1x = 800 + dx;
    const da1x = 850 + dx;
    expect(da1x - b1x).toBe(50);
  });

  it("edge-snaps the group bounding box to a non-group building as one unit", () => {
    const members = [bld("b1", 100, 100), bld("b2", 260, 100)]; // bbox 100..380
    const otherBuildings = [{ x: 400, y: 100, width: 120, height: 80 }];
    const { dx } = computeGroupTranslation({
      members,
      draggedId: "b1",
      rawDx: 15,
      rawDy: 0,
      ...CANVAS,
      snapGrid: false,
      otherBuildings,
    });
    // Raw: bbox right edge 380+15=395, within 12 of other.x=400 → snaps to 400 → dx=20
    expect(dx).toBe(20);
    expect(100 + dx + 280).toBe(400); // bbox right edge aligned to other.x
  });

  it("moves a single member (unselected-object semantics) without touching anything else", () => {
    const members = [bld("b1", 100, 100)];
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "b1",
      rawDx: 15,
      rawDy: 0,
      ...CANVAS,
      snapGrid: true,
    });
    expect(dx).toBe(20);
    expect(dy).toBe(0);
  });

  it("returns zero translation for an empty group", () => {
    const { dx, dy } = computeGroupTranslation({
      members: [],
      draggedId: "x",
      rawDx: 50,
      rawDy: 50,
      ...CANVAS,
      snapGrid: true,
    });
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });
});

describe("groupBBoxAfterTranslation", () => {
  it("computes the moved top-left bounding box for a mixed group", () => {
    const members = [bld("b1", 100, 100, 120, 80), decor("da1", 400, 300, 72, 84)];
    const box = groupBBoxAfterTranslation(members, 20, 20);
    // b1 spans [120,120,240,200]; da1 spans [400+20-36, 300+20-42, ...] = [384,278,456,362]
    expect(box.x).toBe(120);
    expect(box.y).toBe(120);
    expect(box.width).toBe(456 - 120);
    expect(box.height).toBe(362 - 120);
  });
});

describe("computeGroupAlignmentGuides", () => {
  it("emits h/v guides when the group bbox aligns with another building", () => {
    // Group bbox at [100,100,380,180]; other building top edge at y=100 → horizontal guide.
    const guides = computeGroupAlignmentGuides(100, 100, 280, 80, [{ x: 500, y: 100, width: 120, height: 80 }], 6);
    expect(guides.some((g) => g.type === "h" && g.pos === 100)).toBe(true);
  });

  it("emits no guides when nothing is aligned", () => {
    const guides = computeGroupAlignmentGuides(100, 100, 280, 80, [{ x: 500, y: 400, width: 120, height: 80 }], 6);
    expect(guides).toHaveLength(0);
  });
});
