import type { CampusDecorAsset } from "../components/map-builder/types";

export type SurfaceCell = { x: number; y: number };

export const surfaceCellKey = (x: number, y: number) => `${x}:${y}`;

/** Enumerate every grid cell between two painter samples, including diagonals. */
export function surfaceCellsBetween(from: SurfaceCell, to: SurfaceCell): SurfaceCell[] {
  const cells: SurfaceCell[] = [];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const cell = { x: Math.round(from.x + dx * t), y: Math.round(from.y + dy * t) };
    if (!cells.some((candidate) => candidate.x === cell.x && candidate.y === cell.y)) cells.push(cell);
  }
  return cells;
}

/** Group adjacent painted cells into borderless horizontal SVG runs. */
export function surfaceCellRuns(cells: SurfaceCell[]): { x: number; y: number; width: number }[] {
  const byRow = new Map<number, number[]>();
  for (const cell of cells) {
    const row = byRow.get(cell.y) ?? [];
    if (!row.includes(cell.x)) row.push(cell.x);
    byRow.set(cell.y, row);
  }
  const runs: { x: number; y: number; width: number }[] = [];
  for (const [y, xs] of byRow) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let previous = xs[0];
    for (let index = 1; index <= xs.length; index += 1) {
      const current = xs[index];
      if (current !== undefined && current === previous + 1) { previous = current; continue; }
      if (start !== undefined && previous !== undefined) runs.push({ x: start, y, width: previous - start + 1 });
      start = current;
      previous = current;
    }
  }
  return runs;
}

/** Apply one atomic paint/erase stroke to sparse surface assets. */
export function applySurfaceStroke(
  assets: CampusDecorAsset[],
  touched: Iterable<string>,
  material: CampusDecorAsset["groundType"] = "grass",
  erase = false,
  cellSize = 20,
): CampusDecorAsset[] {
  const touchedSet = touched instanceof Set ? touched : new Set(touched);
  const next = assets.flatMap((asset) => {
    if (!(asset.surfaceCells?.length ?? 0)) return [asset];
    const remaining = asset.surfaceCells.filter((cell) => !touchedSet.has(surfaceCellKey(cell.x, cell.y)));
    return remaining.length > 0 ? [{ ...asset, surfaceCells: remaining }] : [];
  });
  if (erase) return next;
  const added = Array.from(touchedSet).map((key) => {
    const [x, y] = key.split(":").map(Number);
    return { x, y };
  });
  const existing = next.find((asset) => asset.type === "ground-area" && asset.groundType === material && (asset.surfaceCells?.length ?? 0) > 0);
  if (existing) {
    return next.map((asset) => asset.id === existing.id
      ? { ...asset, surfaceCells: [...(asset.surfaceCells ?? []), ...added], surfaceCellSize: cellSize }
      : asset);
  }
  return [...next, { id: crypto.randomUUID(), type: "ground-area", x: 0, y: 0, groundType: material, surfaceCells: added, surfaceCellSize: cellSize, zOrder: -1000, visible: true, locked: false }];
}
