import { BringToFront, Eye, EyeOff, Lock, RotateCw, SendToBack, Unlock, Ungroup, X } from "lucide-react";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";

interface EventItemInspectorProps {
  isOpen: boolean;
  furniture: FloorFurniture | null;
  label: FloorLabel | null;
  canvasWidth: number;
  canvasHeight: number;
  onClose: () => void;
  onUpdateFurniture: (changes: Partial<FloorFurniture>) => void;
  onUpdateLabel: (changes: Partial<FloorLabel>) => void;
  onToggleFurnitureLock: () => void;
  onToggleLabelLock: () => void;
  onToggleVisibility: () => void;
  onRotate: () => void;
  onUpdateLayer: (direction: "front" | "back") => void;
  onUngroup: () => void;
  showHeader?: boolean;
}
const actionButtonClass = "flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-2 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const fieldClass = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

export function EventItemInspector({
  isOpen,
  furniture,
  label,
  canvasWidth,
  canvasHeight,
  onClose,
  onUpdateFurniture,
  onUpdateLabel,
  onToggleFurnitureLock,
  onToggleLabelLock,
  onToggleVisibility,
  onRotate,
  onUpdateLayer,
  onUngroup,
  showHeader = true,
}: EventItemInspectorProps) {
  const hasSelection = isOpen && Boolean(furniture || label);
  return (
    <section role="region" aria-label="Item details" data-testid="event-item-inspector" className="flex min-h-0 flex-col gap-4 text-foreground">
      {showHeader && <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">Item details</p>
          {hasSelection && <p className="mt-0.5 break-words text-sm font-extrabold">{furniture?.name ?? label?.text ?? "Untitled label"}</p>}
        </div>
        {hasSelection && (
          <button type="button" aria-label="Close item details" title="Close item details" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>}

      {!isOpen || !hasSelection ? (
        <div className="flex min-h-36 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-foreground">Nothing selected</p>
          <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">Select a single furniture item or label, then open Details to edit it.</p>
        </div>
      ) : furniture ? (
        <>
          <p className="-mt-2 text-xs leading-5 text-muted-foreground">Adjust exact placement, size, and order without dragging.</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["X", furniture.x, (value: number) => onUpdateFurniture({ x: Math.max(0, Math.min(canvasWidth - furniture.width, value)) })],
              ["Y", furniture.y, (value: number) => onUpdateFurniture({ y: Math.max(0, Math.min(canvasHeight - furniture.height, value)) })],
              ["Width", furniture.width, (value: number) => onUpdateFurniture({ width: Math.max(4, Math.min(canvasWidth, value)) })],
              ["Height", furniture.height, (value: number) => onUpdateFurniture({ height: Math.max(4, Math.min(canvasHeight, value)) })],
              ["Rotation", Math.round(furniture.rotation || 0), (value: number) => onUpdateFurniture({ rotation: ((value % 360) + 360) % 360 })],
            ] as Array<[string, number, (value: number) => void]>).map(([field, value, update]) => (
              <label key={field} className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-muted-foreground">
                {field}
                <input
                  type="number"
                  aria-label={field}
                  min={field === "Rotation" ? -360 : 0}
                  value={value}
                  onChange={(event) => update(Number(event.currentTarget.value) || 0)}
                  disabled={furniture.locked}
                  title={furniture.locked ? "Unlock this item to edit its geometry" : undefined}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-label="Rotate selected item" onClick={onRotate} disabled={furniture.locked} className={actionButtonClass}>
              <RotateCw aria-hidden="true" className="h-4 w-4" /> Rotate
            </button>
            <button type="button" aria-label={furniture.locked ? "Unlock selected item" : "Lock selected item"} onClick={onToggleFurnitureLock} className={actionButtonClass}>
              {furniture.locked ? <Unlock aria-hidden="true" className="h-4 w-4" /> : <Lock aria-hidden="true" className="h-4 w-4" />}{furniture.locked ? "Unlock" : "Lock"}
            </button>
            <button type="button" aria-label={furniture.visible === false ? "Show selected item" : "Hide selected item"} onClick={onToggleVisibility} className={actionButtonClass}>
              {furniture.visible === false ? <Eye aria-hidden="true" className="h-4 w-4" /> : <EyeOff aria-hidden="true" className="h-4 w-4" />}{furniture.visible === false ? "Show" : "Hide"}
            </button>
            <button type="button" aria-label="Bring selected item to front" onClick={() => onUpdateLayer("front")} className={actionButtonClass}>
              <BringToFront aria-hidden="true" className="h-4 w-4" /> Front
            </button>
            <button type="button" aria-label="Send selected item to back" onClick={() => onUpdateLayer("back")} className={actionButtonClass}>
              <SendToBack aria-hidden="true" className="h-4 w-4" /> Back
            </button>
            {furniture.groupId && <button type="button" aria-label="Ungroup selected item" onClick={onUngroup} className={actionButtonClass}>
              <Ungroup aria-hidden="true" className="h-4 w-4" /> Ungroup
            </button>}
          </div>
        </>
      ) : label ? (
        <>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground">
            Label text
            <input aria-label="Label text" value={label.text} disabled={label.locked} onChange={(event) => onUpdateLabel({ text: event.currentTarget.value })} className={fieldClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-muted-foreground">
              Font size
              <input aria-label="Font size" type="number" value={label.fontSize} disabled={label.locked} onChange={(event) => onUpdateLabel({ fontSize: Math.max(8, Math.min(96, Number(event.currentTarget.value) || 8)) })} className={fieldClass} />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-muted-foreground">
              Rotation
              <input aria-label="Rotation" type="number" value={Math.round(label.rotation || 0)} disabled={label.locked} onChange={(event) => onUpdateLabel({ rotation: ((Number(event.currentTarget.value) % 360) + 360) % 360 })} className={fieldClass} />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-muted-foreground">
              Color
              <input aria-label="Label color" type="color" value={label.color || "#1f2937"} disabled={label.locked} onChange={(event) => onUpdateLabel({ color: event.currentTarget.value })} className="h-10 w-full rounded-lg border border-border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50" />
            </label>
            <button type="button" aria-label={label.locked ? "Unlock selected label" : "Lock selected label"} onClick={onToggleLabelLock} className={actionButtonClass}>
              {label.locked ? <Unlock aria-hidden="true" className="h-4 w-4" /> : <Lock aria-hidden="true" className="h-4 w-4" />}{label.locked ? "Unlock" : "Lock"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
