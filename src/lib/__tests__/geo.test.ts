import { describe, expect, it } from "vitest";
import {
  latLngToMapPoint,
  snapToNearest,
  pointAlongPolyline,
  polylineLength,
  dist,
} from "../geo";

const PLV_ANCHOR = { lat: 14.7062, lng: 120.9813 };

describe("latLngToMapPoint (GPS → SVG)", () => {
  it("maps the anchor to the canvas center", () => {
    const p = latLngToMapPoint(PLV_ANCHOR.lat, PLV_ANCHOR.lng, PLV_ANCHOR, 900, 680);
    expect(p.x).toBeCloseTo(450, 0);
    expect(p.y).toBeCloseTo(340, 0);
  });

  it("moves the point east (+x) when lng increases", () => {
    const p = latLngToMapPoint(PLV_ANCHOR.lat, PLV_ANCHOR.lng + 0.001, PLV_ANCHOR, 900, 680);
    expect(p.x).toBeGreaterThan(450);
  });

  it("moves the point north (−y) when lat increases", () => {
    const p = latLngToMapPoint(PLV_ANCHOR.lat + 0.001, PLV_ANCHOR.lng, PLV_ANCHOR, 900, 680);
    expect(p.y).toBeLessThan(340);
  });

  it("clamps far-away coordinates to the canvas", () => {
    const p = latLngToMapPoint(PLV_ANCHOR.lat + 1, PLV_ANCHOR.lng + 1, PLV_ANCHOR, 900, 680);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(900);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(680);
  });
});

describe("snapToNearest", () => {
  it("returns the closest candidate and its distance", () => {
    const result = snapToNearest(
      { x: 10, y: 10 },
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 12, y: 8 },
      ]
    );
    expect(result).not.toBeNull();
    expect(result!.point).toEqual({ x: 12, y: 8 });
    expect(result!.distance).toBeCloseTo(Math.hypot(2, 2));
  });

  it("returns null when there are no candidates", () => {
    expect(snapToNearest({ x: 0, y: 0 }, [])).toBeNull();
  });
});

describe("pointAlongPolyline / polylineLength", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("computes total length as the sum of segment lengths", () => {
    expect(polylineLength(line)).toBeCloseTo(200);
  });

  it("returns the start at t=0 and the end at t=1", () => {
    expect(pointAlongPolyline(line, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlongPolyline(line, 1)).toEqual({ x: 100, y: 100 });
  });

  it("interpolates at constant speed across segments", () => {
    // Half the total length (100 units) lands exactly at the corner.
    const mid = pointAlongPolyline(line, 0.5);
    expect(mid.x).toBeCloseTo(100, 5);
    expect(mid.y).toBeCloseTo(0, 5);
    // Quarter length (50 units) is midway along the first segment.
    const q = pointAlongPolyline(line, 0.25);
    expect(q.x).toBeCloseTo(50, 5);
    expect(q.y).toBeCloseTo(0, 5);
  });

  it("handles a single-point polyline", () => {
    expect(pointAlongPolyline([{ x: 5, y: 5 }], 0.5)).toEqual({ x: 5, y: 5 });
  });
});

describe("dist", () => {
  it("computes Euclidean distance", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });
});
