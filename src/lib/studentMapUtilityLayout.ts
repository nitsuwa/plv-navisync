export interface StudentMapUtilityRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface StudentMapUtilityRightInsetInput {
  surfaceRight: number;
  surfaceBottom: number;
  utilityBottomInset: number;
  utilityWidth: number;
  utilityHeight: number;
  defaultRightInset?: number;
  accountRect?: StudentMapUtilityRect | null;
}

/** Keep a compact horizontal control rail right-aligned unless it truly overlaps the account control. */
export function studentMapUtilityRightInset({
  surfaceRight,
  surfaceBottom,
  utilityBottomInset,
  utilityWidth,
  utilityHeight,
  defaultRightInset = 12,
  accountRect,
}: StudentMapUtilityRightInsetInput): number {
  if (!accountRect || utilityWidth <= 0 || utilityHeight <= 0) return defaultRightInset;

  const utilityBottom = surfaceBottom - utilityBottomInset;
  const utilityTop = utilityBottom - utilityHeight;
  const utilityRight = surfaceRight - defaultRightInset;
  const utilityLeft = utilityRight - utilityWidth;
  const overlapsAccount = utilityTop < accountRect.bottom
    && utilityBottom > accountRect.top
    && utilityRight > accountRect.left
    && utilityLeft < accountRect.right;

  return overlapsAccount
    ? Math.ceil(surfaceRight - accountRect.left + 8)
    : defaultRightInset;
}
