import { RotateCw, Scaling } from "lucide-react";
import { Fragment } from "react";
import type { FloorFurniture } from "../map-builder/types";
import { eventAssetAllowsResize } from "../../lib/eventAssetSizing";

export interface EventSelectionOverlayProps {
  items: readonly FloorFurniture[];
  selectedIds: readonly string[];
  zoom: number;
  readOnly: boolean;
  panActive: boolean;
  onRotatePointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    item: FloorFurniture,
  ) => void;
  onResizePointerDown?: (event: React.PointerEvent<HTMLButtonElement>, item: FloorFurniture) => void;
}

/** Selection affordances live above the map artwork without changing item stacking order. */
export function EventSelectionOverlay({
  items,
  selectedIds,
  zoom,
  readOnly,
  panActive,
  onRotatePointerDown,
  onResizePointerDown,
}: EventSelectionOverlayProps) {
  const selectedItems = items.filter(item => selectedIds.includes(item.id));
  if (selectedItems.length === 0) return null;

  return (
    <div
      data-testid="event-selection-overlay"
      className="pointer-events-none absolute inset-0 z-[200] overflow-visible"
      aria-label="Selected event furniture"
    >
      {selectedItems.map(item => {
        const showRotate = !readOnly && selectedIds.length === 1 && selectedItems.length === 1 && !item.locked;
        const inverseZoom = 1 / Math.max(0.25, zoom);
        const angle = (item.rotation || 0) * Math.PI / 180;
        const halfWidth = (Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.height) / 2;
        const halfDepth = (Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.height) / 2;
        return (
          <Fragment key={item.id}>
            <div
              data-testid={`event-item-selection-${item.id}`}
              aria-hidden="true"
              className="pointer-events-none absolute box-border rounded border-2 border-primary"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                transform: `rotate(${item.rotation || 0}deg)`,
              }}
            />
            {showRotate && (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute h-5 border-l-2 border-primary/70"
                  style={{ left: item.x + item.width / 2, top: item.y - 18 * inverseZoom, transformOrigin: "top left", transform: `scale(${inverseZoom})` }}
                />
                <button
                  type="button"
                  data-testid="event-furniture-rotate-handle"
                  aria-label={`Rotate ${item.name}`}
                  title={`Rotate ${item.name}. Hold Shift to snap to 15°.`}
                  className={`pointer-events-auto absolute flex h-11 w-11 items-center justify-center rounded-full text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${panActive ? "cursor-grab" : "cursor-pointer"}`}
                  style={{ left: item.x + item.width / 2, top: item.y - halfDepth + item.height / 2 - 52 * inverseZoom, transformOrigin: "top left", transform: `scale(${inverseZoom}) translateX(-50%)` }}
                  onPointerDown={event => onRotatePointerDown(event, item)}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-primary bg-card shadow-sm"><RotateCw className="h-3.5 w-3.5" aria-hidden="true" /></span>
                </button>
              </>
            )}
            {showRotate && !item.groupId && eventAssetAllowsResize(item) && onResizePointerDown && <button type="button" aria-label={`Resize ${item.name}`} data-testid="event-furniture-resize-handle"
              onPointerDown={event => onResizePointerDown(event, item)} className="pointer-events-auto absolute grid h-11 w-11 cursor-nwse-resize place-items-center rounded-full text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ left: item.x + item.width / 2 + halfWidth + 8 * inverseZoom, top: item.y + item.height / 2 + halfDepth + 8 * inverseZoom, transformOrigin: "top left", transform: `scale(${inverseZoom})` }}>
              <span className="grid h-6 w-6 place-items-center rounded-md border border-primary bg-card shadow-sm"><Scaling className="h-3.5 w-3.5" /></span>
            </button>}
          </Fragment>
        );
      })}
    </div>
  );
}
