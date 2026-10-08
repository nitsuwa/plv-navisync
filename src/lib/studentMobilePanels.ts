export const STUDENT_MOBILE_BOTTOM_NAV_HEIGHT = 76;
export const STUDENT_MOBILE_PANEL_EDGE_GAP = 12;

/** Height available to a Student Map sheet above its header and fixed navigation. */
export function studentMobilePanelAvailableHeight(
  viewportHeight: number,
  reservedTop: number,
  safeAreaBottom = 0,
  bottomNavigationHeight = STUDENT_MOBILE_BOTTOM_NAV_HEIGHT,
  edgeGap = STUDENT_MOBILE_PANEL_EDGE_GAP,
): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  const top = Number.isFinite(reservedTop) ? Math.max(0, reservedTop) : 0;
  const safeBottom = Number.isFinite(safeAreaBottom) ? Math.max(0, safeAreaBottom) : 0;
  return Math.max(0, viewportHeight - top - safeBottom - bottomNavigationHeight - edgeGap);
}
