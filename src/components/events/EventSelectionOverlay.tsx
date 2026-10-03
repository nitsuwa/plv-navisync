import { RotateCw } from "lucide-react";
import { Fragment } from "react";
import type { FloorFurniture } from "../map-builder/types";

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
}

/** Selection affordances live above the map artwork without changing item stacking order. */
export function EventSelectionOverlay({
  items,
  selectedIds,
  zoom,
  readOnly,
  panActive,
  onRotatePointerDown,
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
                  style={{ left: item.x + item.width / 2, top: item.y - 28, transform: `scale(${1 / Math.max(0.25, zoom)})` }}
                />
                <button
                  type="button"
                  data-testid="event-furniture-rotate-handle"
                  aria-label={`Rotate ${item.name}`}
                  title={`Rotate ${item.name}. Hold Shift to snap to 15°.`}
                  className={`pointer-events-auto absolute -translate-x-1/2 flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary bg-card text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${panActive ? "cursor-grab" : "cursor-pointer"}`}
                  style={{ left: item.x + item.width / 2, top: item.y - 48, transform: `translateX(-50%) scale(${1 / Math.max(0.25, zoom)})` }}
                  onPointerDown={event => onRotatePointerDown(event, item)}
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
