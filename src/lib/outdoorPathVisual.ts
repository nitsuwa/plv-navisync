import type { CampusPath } from "../components/map-builder/types";

export type OutdoorPathRenderStyle = {
  kind: "road" | "accessible" | "walkway";
  baseWidth: number;
  surface: string;
  edge: string;
};

/**
 * Shared authored Pathway presentation semantics.  The editor may add hit
 * surfaces, selection strokes, and joined-chain geometry around this style;
 * read-only scenes use the same physical surface/edge treatment without
 * importing any of those interactions.
 */
export function pathRenderStyle(path: CampusPath): OutdoorPathRenderStyle {
  const kind = path.type === "road" || path.type === "driveway" ? "road" : path.type === "accessible" ? "accessible" : "walkway";
  const baseWidth = Math.max(3, path.width ?? (kind === "road" ? 18 : 10));
  return {
    kind,
    baseWidth,
    surface: kind === "road" ? "#cbd5e1" : kind === "accessible" ? "#a7f3d0" : path.color || "#b8aea2",
    edge: kind === "road" ? "#64748b" : kind === "accessible" ? "#059669" : "#776f67",
  };
}
