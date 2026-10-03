import { useEffect, useState } from "react";
import { BringToFront, ChevronDown, Eye, EyeOff, Lock, RotateCw, SendToBack, Unlock, Ungroup, X } from "lucide-react";
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
const labelSwatches = ["#1E3A8A", "#0F766E", "#7C3AED", "#B45309", "#BE123C", "#111827"];

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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [labelColorDraft, setLabelColorDraft] = useState(label?.color || "#1f2937");
  useEffect(() => {
    setAdvancedOpen(false);
    setLabelColorDraft(label?.color || "#1f2937");
  }, [label?.id, label?.color, furniture?.id]);

  const updateLabelColorDraft = (value: string) => {
    setLabelColorDraft(value);
    if (/^#[\da-fA-F]{6}$/.test(value)) onUpdateLabel({ color: value });
  };
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
          <p className="-mt-2 text-xs leading-5 text-muted-foreground">Fixed size: {furniture.width} × {furniture.height} map units. Move and rotate without resizing.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-muted-foreground">
              Rotation
              <input type="number" aria-label="Rotation" min={-360} value={Math.round(furniture.rotation || 0)} onChange={(event) => onUpdateFurniture({ rotation: ((Number(event.currentTarget.value) % 360) + 360) % 360 })} disabled={furniture.locked} title={furniture.locked ? "Unlock this item to edit its geometry" : undefined} className={fieldClass} />
            </label>
            <button type="button" aria-label={furniture.locked ? "Unlock selected item" : "Lock selected item"} onClick={onToggleFurnitureLock} className={`${actionButtonClass} self-end`}>
              {furniture.locked ? <Unlock aria-hidden="true" className="h-4 w-4" /> : <Lock aria-hidden="true" className="h-4 w-4" />}{furniture.locked ? "Unlock" : "Lock"}
            </button>
            <button type="button" aria-label="Rotate selected item" onClick={onRotate} disabled={furniture.locked} className={`${actionButtonClass} col-span-2`}>
              <RotateCw aria-hidden="true" className="h-4 w-4" /> Rotate 15°
            </button>
          </div>
          <button type="button" aria-expanded={advancedOpen} aria-controls="event-item-advanced" onClick={() => setAdvancedOpen((open) => !open)} className="flex min-h-10 items-center justify-between rounded-lg border border-border/70 px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Advanced <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </button>
          {advancedOpen && <div id="event-item-advanced" className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="grid grid-cols-2 gap-3">
              {([
                ["X", furniture.x, (value: number) => onUpdateFurniture({ x: Math.max(0, Math.min(canvasWidth - furniture.width, value)) })],
                ["Y", furniture.y, (value: number) => onUpdateFurniture({ y: Math.max(0, Math.min(canvasHeight - furniture.height, value)) })],
              ] as Array<[string, number, (value: number) => void]>).map(([field, value, update]) => (
                <label key={field} className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-muted-foreground">{field}
                  <input type="number" aria-label={field} min={0} value={value} onChange={(event) => update(Number(event.currentTarget.value) || 0)} disabled={furniture.locked} title={furniture.locked ? "Unlock this item to edit its geometry" : undefined} className={fieldClass} />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-label={furniture.visible === false ? "Show selected item" : "Hide selected item"} onClick={onToggleVisibility} className={actionButtonClass}>
                {furniture.visible === false ? <Eye aria-hidden="true" className="h-4 w-4" /> : <EyeOff aria-hidden="true" className="h-4 w-4" />}{furniture.visible === false ? "Show" : "Hide"}
              </button>
              <button type="button" aria-label="Bring selected item to front" onClick={() => onUpdateLayer("front")} className={actionButtonClass}><BringToFront aria-hidden="true" className="h-4 w-4" /> Front</button>
              <button type="button" aria-label="Send selected item to back" onClick={() => onUpdateLayer("back")} className={actionButtonClass}><SendToBack aria-hidden="true" className="h-4 w-4" /> Back</button>
              {furniture.groupId && <button type="button" aria-label="Ungroup selected item" onClick={onUngroup} className={actionButtonClass}><Ungroup aria-hidden="true" className="h-4 w-4" /> Ungroup</button>}
            </div>
          </div>}
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
            <button type="button" aria-label={label.locked ? "Unlock selected label" : "Lock selected label"} onClick={onToggleLabelLock} className={actionButtonClass}>
              {label.locked ? <Unlock aria-hidden="true" className="h-4 w-4" /> : <Lock aria-hidden="true" className="h-4 w-4" />}{label.locked ? "Unlock" : "Lock"}
            </button>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-muted-foreground">Label color</legend>
            <div className="flex flex-wrap gap-2">
              {labelSwatches.map((color) => <button key={color} type="button" aria-label={`Set label color ${color}`} aria-pressed={(label.color || "#1f2937").toLowerCase() === color.toLowerCase()} disabled={label.locked} onClick={() => { setLabelColorDraft(color); onUpdateLabel({ color }); }} className="h-9 w-9 rounded-full border-2 border-border p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" title={color}><span aria-hidden="true" className="block h-full w-full rounded-full" style={{ backgroundColor: color }} /></button>)}
            </div>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold text-muted-foreground">Hex value
              <input type="text" aria-label="Label color hex" value={labelColorDraft} aria-invalid={labelColorDraft.length > 0 && !/^#[\da-fA-F]{6}$/.test(labelColorDraft)} disabled={label.locked} onChange={(event) => updateLabelColorDraft(event.currentTarget.value)} className={fieldClass} />
            </label>
            {labelColorDraft.length > 0 && !/^#[\da-fA-F]{6}$/.test(labelColorDraft) && <p role="status" className="text-[11px] text-destructive">Enter a six-digit color such as #1E3A8A.</p>}
          </fieldset>
        </>
      ) : null}
    </section>
  );
}
