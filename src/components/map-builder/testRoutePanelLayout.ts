export interface TestRoutePanelLayoutInput {
  viewportWidth: number;
  panelWidth: number;
  propertiesVisible: boolean;
  propertiesWidth: number;
  gutter?: number;
  collisionGap?: number;
}

export interface TestRoutePanelLayout {
  right: number;
  width: number;
  collidesWithProperties: boolean;
  overlaysProperties: boolean;
}

export const TEST_ROUTE_PANEL_DESKTOP_WIDTH = 420;
export const TEST_ROUTE_PANEL_GUTTER = 20;
export const TEST_ROUTE_PANEL_SIDEBAR_GAP = 14;
export const TEST_ROUTE_PANEL_MIN_ADJACENT_WIDTH = 280;

/**
 * Keep the desktop route panel pinned to one right gutter. When the visible
 * Properties drawer actually occupies that corner, place the route panel just
 * to its left and use only the width that remains in the editor viewport.
 */
export function resolveTestRoutePanelLayout({
  viewportWidth,
  panelWidth,
  propertiesVisible,
  propertiesWidth,
  gutter = TEST_ROUTE_PANEL_GUTTER,
  collisionGap = TEST_ROUTE_PANEL_SIDEBAR_GAP,
}: TestRoutePanelLayoutInput): TestRoutePanelLayout {
  const safeViewportWidth = Math.max(0, Number.isFinite(viewportWidth) ? viewportWidth : 0);
  const safePanelWidth = Math.max(0, Number.isFinite(panelWidth) ? panelWidth : 0);
  const safePropertiesWidth = Math.max(0, Number.isFinite(propertiesWidth) ? propertiesWidth : 0);
  const canonicalWidth = Math.min(safePanelWidth, Math.max(0, safeViewportWidth - gutter * 2));
  const hasPropertiesCollision = propertiesVisible && safePropertiesWidth > gutter;

  if (!hasPropertiesCollision) {
    return { right: gutter, width: canonicalWidth, collidesWithProperties: false, overlaysProperties: false };
  }

  const right = safePropertiesWidth + collisionGap;
  const availableWidth = Math.max(0, safeViewportWidth - right - gutter);
  const minimumAdjacentWidth = Math.min(TEST_ROUTE_PANEL_MIN_ADJACENT_WIDTH, canonicalWidth);

  // At phone widths there may not be enough room for the inspector and a
  // usable route panel side by side. Let the route panel temporarily sit over
  // the inspector rather than shrinking its controls to an unusable sliver.
  if (availableWidth < minimumAdjacentWidth) {
    return {
      right: gutter,
      width: canonicalWidth,
      collidesWithProperties: true,
      overlaysProperties: true,
    };
  }

  return {
    right,
    width: Math.min(safePanelWidth, availableWidth),
    collidesWithProperties: true,
    overlaysProperties: false,
  };
}
