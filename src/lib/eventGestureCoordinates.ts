export interface ScreenPoint {
  x: number;
  y: number;
}

export interface GestureFrame {
  left: number;
  top: number;
  zoom: number;
  pan: ScreenPoint;
}

/** Convert a viewport client point into the event map's authored coordinates. */
export function clientToEventWorld(point: ScreenPoint, frame: GestureFrame): ScreenPoint {
  const zoom = Number.isFinite(frame.zoom) && frame.zoom > 0 ? frame.zoom : 1;
  return {
    x: (point.x - frame.left - frame.pan.x) / zoom,
    y: (point.y - frame.top - frame.pan.y) / zoom,
  };
}

/** Convert authored event coordinates back to browser client coordinates. */
export function eventWorldToClient(point: ScreenPoint, frame: GestureFrame): ScreenPoint {
  const zoom = Number.isFinite(frame.zoom) && frame.zoom > 0 ? frame.zoom : 1;
  return {
    x: frame.left + frame.pan.x + point.x * zoom,
    y: frame.top + frame.pan.y + point.y * zoom,
  };
}
