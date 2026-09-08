import { describe, it, expect } from "vitest";
import {
  computeGroupTranslation,
  groupBBoxAfterTranslation,
  computeGroupAlignmentGuides,
  snapRectToVisibleBounds,
  rectVisibleBounds,
  computeGroupResizeBounds,
  resizeGroupMembers,
  clampMemberTranslation,
  memberVisibleBounds,
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

describe("physical group resize", () => {
  it("scales all selected members around the outer frame while preserving relative placement", () => {
    const members = [bld("b1", 100, 100, 100, 60), decor("tree", 300, 160, 40, 40)];
    const from = { x: 100, y: 100, width: 220, height: 100 };
    const to = computeGroupResizeBounds(from, "se", { x: 440, y: 200 }, 900, 680, false);
    expect(to.x).toBe(100);
    expect(to.y).toBe(100);
    expect(to.width).toBeCloseTo(340, 6);
    expect(to.height).toBeCloseTo(154.545, 3);
    const resized = resizeGroupMembers(members, from, to);
    expect(resized[0].x).toBeCloseTo(100, 6);
    expect(resized[0].width).toBeCloseTo(154.55, 1);
    expect(resized[0].height).toBeCloseTo(92.73, 1);
    expect(resized[1].x).toBeCloseTo(409.09, 1);
    expect(resized[1].y).toBeCloseTo(192.73, 1);
    expect(resized[1].width).toBeCloseTo(61.82, 1);
  });

  it("moves a Pathway with physical members as one rigid group", () => {
    const members = [pathMember("p1", 100, 100), decor("da1", 340, 120)];
    const { dx, dy } = computeGroupTranslation({
      members,
      draggedId: "da1",
      rawDx: 23,
      rawDy: 17,
      ...CANVAS,
      snapGrid: false,
      edgeSnap: false,
    });
    expect({ dx, dy }).toEqual({ dx: 23, dy: 17 });
    expect({ x: members[0].x + dx, y: members[0].y + dy }).toEqual({ x: 123, y: 117 });
    expect({ x: members[1].x + dx, y: members[1].y + dy }).toEqual({ x: 363, y: 137 });
  });

  it("keeps the opposite corner fixed and clamps the dragged frame to the canvas", () => {
    const from = { x: 80, y: 80, width: 180, height: 120 };
    const to = computeGroupResizeBounds(from, "nw", { x: -100, y: -100 }, 400, 300, true, 20);
    expect(to.x).toBe(0);
    expect(to.y).toBeCloseTo(26.667, 3);
    expect(to.x + to.width).toBe(from.x + from.width);
    expect(to.y + to.height).toBeCloseTo(from.y + from.height, 6);
  });

  it("clamps a rotated physical object by its visible bounds", () => {
    const member: GroupMoveMember = { kind: "decorAsset", id: "tree", x: 30, y: 30, width: 40, height: 80, rotation: 45 };
    const delta = clampMemberTranslation(member, -100, -100, 500, 400, 12);
    const bounds = memberVisibleBounds(member);
    expect(bounds.x + delta.dx).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(bounds.y + delta.dy).toBeGreaterThanOrEqual(12 - 1e-6);
  });

  it("uses the safe inset for rigid group movement while preserving spacing", () => {
    const members = [bld("b1", 100, 100), bld("b2", 260, 100)];
    const result = computeGroupTranslation({
      members, draggedId: "b1", rawDx: -200, rawDy: -200,
      ...CANVAS, snapGrid: false, boundsInset: 12,
    });
    expect(members[0].x + result.dx).toBe(12);
    expect(members[0].y + result.dy).toBe(12);
    expect(members[1].x + result.dx - (members[0].x + result.dx)).toBe(160);
  });

  it("keeps a physical group resize inside the safe frame", () => {
    const from = { x: 100, y: 80, width: 220, height: 120 };
    const to = computeGroupResizeBounds(from, "se", { x: 890, y: 690 }, 900, 700, false, 20, 20, 12);
    expect(to.x).toBeGreaterThanOrEqual(12);
    expect(to.y).toBeGreaterThanOrEqual(12);
    expect(to.x + to.width).toBeLessThanOrEqual(888);
    expect(to.y + to.height).toBeLessThanOrEqual(688);
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

  it("treats decor references as first-class physical alignment targets", () => {
    // A scanner-row-sized group whose center X/Y is within the shared world
    // tolerance of another decor asset should receive the same guide treatment
    // as a building reference.
    const guides = computeGroupAlignmentGuides(
      100, 100, 180, 60,
      [{ x: 288, y: 106, width: 180, height: 60 }],
      8,
    );
    expect(guides).toEqual(expect.arrayContaining([
      { type: "h", pos: 106 },
      { type: "v", pos: 288 },
    ]));
  });

  it("snaps a transformed decor bounds box to physical references without graph data", () => {
    const result = snapRectToVisibleBounds(
      { x: 188, y: 188, width: 60, height: 24 },
      [{ x: 200, y: 300, width: 60, height: 24 }],
      12,
    );
    expect(result.x).toBe(200); // left edges align exactly
    expect(result.guides).toContainEqual({ type: "v", pos: 200 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Issue 2B — rotated alignment uses visible world-space bounds
// ═══════════════════════════════════════════════════════════════════════════

describe("snapRectToVisibleBounds — rotated building alignment (Issue 2B)", () => {
  it("uses the rotated AABB, not the raw rect, for a 270-degree building", () => {
    // Building A rotated 270°: raw 100×60 becomes a 60×100 visible AABB.
    const aabb = rectVisibleBounds({ x: 0, y: 0, width: 100, height: 60, rotation: 270 });
    expect(aabb.width).toBeCloseTo(60, 5);
    expect(aabb.height).toBeCloseTo(100, 5);
  });

  it("rotated-vs-unrotated edge alignment produces a guide + snap (QA repro)", () => {
    // Building A (rotated 270°, raw 100×60 → visible 60×100 centered on the
    // rect center) is dragged so its visible BOTTOM lines up with the BOTTOM
    // of an unrotated building whose bottom edge sits at y=420.
    //
    // A at x=300,y=350: center = (350, 380) → visible AABB [320, 330, 60, 100]
    // → visible bottom = 430. Within 12 of 420 (|430-420| = 10) and closer than
    // every other Y target (top 330 vs 300/420/360 = 30/90/30) → snap to 420.
    const rotated = { x: 300, y: 350, width: 100, height: 60, rotation: 270 };
    const refs = [{ x: 0, y: 300, width: 240, height: 120, rotation: 0 }]; // bottom = 420
    const result = snapRectToVisibleBounds(rotated, refs, 12);
    expect(result.y).toBe(340); // bottom 430 → 420 (dy -10)
    expect(result.guides.some((g) => g.type === "h" && g.pos === 420)).toBe(true);
  });

  it("rotated visible right edge aligns to an unrotated building's right edge", () => {
    // Building A rotated 270° (visible 60×100) — its visible RIGHT edge must
    // participate in X alignment even though the raw rect is 100 wide.
    // A at x=300,y=500: center = (350, 530) → visible AABB [320, 480, 60, 100]
    // → visible right = 380, center X = 350. Ref right edge X = 260.
    const rotated = { x: 300, y: 500, width: 100, height: 60, rotation: 270 };
    const refs = [{ x: 0, y: 300, width: 260, height: 120, rotation: 0 }]; // right edge X=260
    const result = snapRectToVisibleBounds(rotated, refs, 12);
    // No X snap (|380-260| = 120, |350-260| = 90); Y: |480-420| = 60, |530-360| = 170 → no.
    expect(result.x).toBe(300);
    expect(result.y).toBe(500);
    expect(result.guides.length).toBe(0);

    // Now move A's visible right edge to within 12 of ref right (260).
    // Visible right = (x + 50) + 30 = x + 80 → x=178 gives 258 (within 12 of 260).
    const near = { x: 178, y: 500, width: 100, height: 60, rotation: 270 };
    const result2 = snapRectToVisibleBounds(near, refs, 12);
    expect(result2.x).toBe(180); // right 258 → 260 (dx +2)
    expect(result2.guides.some((g) => g.type === "v" && g.pos === 260)).toBe(true);
  });

  it("group bbox respects member rotations", () => {
    const members = [
      { kind: "building" as const, id: "b1", x: 0, y: 0, width: 100, height: 60, rotation: 270 },
      { kind: "building" as const, id: "b2", x: 200, y: 300, width: 100, height: 100, rotation: 0 },
    ];
    const box = groupBBoxAfterTranslation(members, 0, 0);
    // b1 visible AABB = [20, -20, 60, 100]; b2 = [200, 300, 100, 100]
    // → union x=20, y=-20, width=300-20=280, height=400-(-20)=420.
    expect(box.x).toBeCloseTo(20, 5);
    expect(box.y).toBeCloseTo(-20, 5);
    expect(box.width).toBeCloseTo(280, 5);
    expect(box.height).toBeCloseTo(420, 5);
  });
});
