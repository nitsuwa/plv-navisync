import { describe, expect, it } from "vitest";
import type { CampusPath } from "../../components/map-builder/types";
import {
  attachVisualPathEndpoint,
  detachVisualPathEndpoint,
  syncVisualPathAttachments,
  visualPathAttachmentForPoint,
  visualPathAttachmentFromTarget,
} from "../visualPathAttachments";

const path = (id: string, points: { x: number; y: number }[]): CampusPath => ({
  id,
  points,
  type: "walkway",
  color: "#b4535a",
  width: 12,
});

describe("visual path attachments", () => {
  it("attaches an endpoint to an existing path segment and follows target edits", () => {
    const base = path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const branch = path("b", [{ x: 40, y: 40 }, { x: 40, y: 80 }]);
    const target = visualPathAttachmentFromTarget(0, {
      pathId: "a",
      point: { x: 40, y: 0 },
      segmentIndex: 0,
      t: 0.4,
    });
    const attached = attachVisualPathEndpoint([base, branch], "b", 0, {
      pathId: "a",
      point: { x: 40, y: 0 },
      segmentIndex: 0,
      t: 0.4,
    });

    expect(attached[1].points[0]).toEqual({ x: 40, y: 0 });
    expect(attached[1].visualAttachments).toEqual([target]);

    const movedTarget = attached.map((candidate) => candidate.id === "a"
      ? { ...candidate, points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] }
      : candidate);
    expect(syncVisualPathAttachments(movedTarget)[1].points[0]).toEqual({ x: 40, y: 20 });
  });

  it("keeps a path-specific detach independent", () => {
    const base = path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const branch = attachVisualPathEndpoint(
      [base, path("b", [{ x: 50, y: 50 }, { x: 50, y: 90 }])],
      "b",
      0,
      { pathId: "a", point: { x: 50, y: 0 }, segmentIndex: 0, t: 0.5 },
    );
    const detached = detachVisualPathEndpoint(branch, "b", 0);

    expect(detached[0].points).toEqual(base.points);
    expect(detached[1].visualAttachments).toBeUndefined();
    expect(detached[1].points[0]).toEqual({ x: 50, y: 0 });
    expect(visualPathAttachmentForPoint(branch, "b", 0)?.targetPathId).toBe("a");
  });

  it("drops an attachment safely when its target path is deleted", () => {
    const attached = attachVisualPathEndpoint(
      [path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]), path("b", [{ x: 50, y: 50 }, { x: 50, y: 90 }])],
      "b",
      0,
      { pathId: "a", point: { x: 50, y: 0 }, segmentIndex: 0, t: 0.5 },
    );

    const remaining = syncVisualPathAttachments(attached.filter((candidate) => candidate.id !== "a"));
    expect(remaining[0].visualAttachments).toBeUndefined();
    expect(remaining[0].points[0]).toEqual({ x: 50, y: 0 });
  });
});
