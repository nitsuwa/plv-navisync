/** 60px navigation content plus its 1px top border; the device safe area is separate. */
export const STUDENT_MOBILE_BOTTOM_NAV_HEIGHT = 61;
export const STUDENT_MOBILE_PANEL_EDGE_GAP = 12;
export const STUDENT_MOBILE_MIN_VISIBLE_MAP_FRACTION = 0.25;

export interface StudentRouteRestorePillBlockers {
  scannerOpen?: boolean;
  buildingDetailsOpen?: boolean;
  roomDetailsOpen?: boolean;
  campusPlaceDetailsOpen?: boolean;
  locationPreviewOpen?: boolean;
  arrivalOverlayOpen?: boolean;
  reportDialogOpen?: boolean;
  mediaDialogOpen?: boolean;
}

/** A minimized route can remain stored while a higher-priority map surface is open. */
export function shouldShowStudentRouteRestorePill(
  minimized: boolean,
  blockers: StudentRouteRestorePillBlockers = {},
): boolean {
  return minimized && !Object.values(blockers).some(Boolean);
}

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
  // The sheet sits above the bottom navigation. Keep at least a quarter of the
  // live viewport visible as map, while respecting a taller measured header.
  const mapAreaReserve = Math.max(
    top + edgeGap,
    viewportHeight * STUDENT_MOBILE_MIN_VISIBLE_MAP_FRACTION,
  );
  return Math.max(0, viewportHeight - safeBottom - bottomNavigationHeight - mapAreaReserve);
}
