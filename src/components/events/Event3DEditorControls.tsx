import { useState, type ReactNode } from "react";
import { Move, RotateCw, Scaling, Hand, Plus, Type, Magnet, SlidersHorizontal } from "lucide-react";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";
import type { Event3DEditTool, Event3DPoint } from "../../lib/event3dEditing";
import { eventAssetAllowsResize } from "../../lib/eventAssetSizing";
import { Event3DAssetPicker } from "./Event3DAssetPicker";

const buttonClass = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
export function Event3DEditorControls({ tool, onToolChange, template, onTemplateChange, furniture, labels, selectedIds, onSelect, onOpenDetails, onToggleLock, onDuplicate, placementPoint, canPlace, onPlace, busy, snap, onSnapChange, error, notice, repeatPlacement, onRepeatChange, layoutChecks }: {
  tool: Event3DEditTool; onToolChange: (tool: Event3DEditTool) => void; template: string; onTemplateChange: (type: string) => void;
  furniture: readonly FloorFurniture[]; labels: readonly FloorLabel[]; selectedIds: readonly string[]; onSelect: (id: string) => void;
  onOpenDetails: (trigger: HTMLElement) => void; onToggleLock: () => void; onDuplicate: () => void;
  placementPoint: Event3DPoint | null; canPlace: boolean; onPlace: () => void; busy: boolean;
  snap: boolean; onSnapChange: () => void; error: string | null; notice?: string | null;
  repeatPlacement: boolean; onRepeatChange: () => void;
  layoutChecks?: ReactNode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = selectedIds.length === 1 ? furniture.find(item => item.id === selectedIds[0]) : null;
  const label = selectedIds.length === 1 ? labels.find(item => item.id === selectedIds[0]) : null;
  const locked = Boolean(selected?.locked || label?.locked || furniture.some(item => selectedIds.includes(item.id) && item.locked));
  const placing = tool === "place-item" || tool === "place-label";
  const tools = [{ id: "move", text: "Move", Icon: Move }, { id: "rotate", text: "Rotate", Icon: RotateCw }, { id: "resize", text: "Resize", Icon: Scaling }, { id: "pan", text: "Pan", Icon: Hand }, { id: "place-item", text: "Add item", Icon: Plus }, { id: "place-label", text: "Add label", Icon: Type }] as const;
  const names = { move: "Move items in 3D", rotate: "Rotate items in 3D", resize: "Resize items in 3D", pan: "Pan map in 3D", "place-item": "Add item in 3D", "place-label": "Add label in 3D" };
  return <div aria-label="3D editing controls" className="max-h-[32dvh] shrink-0 space-y-2 overflow-y-auto border-b border-border bg-card p-2 sm:px-3">
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="3D edit tools" className="flex w-full flex-nowrap gap-1 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
        {tools.map(({ id, text, Icon }) => <button key={id} type="button" aria-label={names[id]} aria-pressed={tool === id}
          disabled={busy || ((id === "rotate" || id === "resize") && (!selected || Boolean(selected.groupId) || locked || (id === "resize" && !eventAssetAllowsResize(selected))))}
          onClick={() => { onToolChange(id); if (id === "place-item") setPickerOpen(true); }}
          className={buttonClass + " shrink-0 whitespace-nowrap" + (tool === id ? " border-primary bg-primary/10 text-primary" : "")}><Icon className="h-4 w-4" aria-hidden="true" />{text}</button>)}
        <button type="button" aria-label="Snap in 3D" aria-pressed={snap} disabled={busy} onClick={onSnapChange} className={buttonClass}><Magnet className="h-4 w-4" />Snap</button>
      </div>
      {!placing && <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:flex-wrap">
        <label className="flex min-w-0 items-center gap-2 text-xs font-semibold"><span className="sr-only">Item</span><select aria-label="Selected 3D item" value={selectedIds[0] || ""} disabled={busy} onChange={event => { onSelect(event.target.value); if (event.target.value) onOpenDetails(event.currentTarget); }} className="h-11 w-44 max-w-full rounded-xl border border-border bg-background px-2 text-xs"><option value="">Select an event item</option>{furniture.map(item => <option key={item.id} value={item.id}>{item.name + (item.visible === false ? " (hidden)" : "")}</option>)}{labels.map(label => <option key={label.id} value={label.id}>{label.text}</option>)}</select></label>
        <button type="button" aria-label="Item details in 3D" disabled={busy || !(selected || label)} onClick={event => onOpenDetails(event.currentTarget)} className={buttonClass}><SlidersHorizontal className="h-4 w-4" />Details</button>
        {selectedIds.length > 0 && <button type="button" aria-label="Duplicate items in 3D" disabled={busy || locked} onClick={onDuplicate} className={buttonClass.replace("inline-flex", "hidden sm:inline-flex")}>Duplicate</button>}
        {selectedIds.length > 0 && <button type="button" aria-label={locked ? "Unlock item in 3D" : "Lock item in 3D"} disabled={busy || selectedIds.length > 1} onClick={onToggleLock} className={buttonClass.replace("inline-flex", "hidden sm:inline-flex")}>{locked ? "Unlock" : "Lock"}</button>}
      </div>}
      {layoutChecks && <div className="ml-auto">{layoutChecks}</div>}
    </div>
    {placing && <div className="flex flex-wrap items-center gap-2">
      {tool === "place-item" && <Event3DAssetPicker value={template} onChange={onTemplateChange} open={pickerOpen} onOpenChange={setPickerOpen} disabled={busy} />}
      <button type="button" aria-label="Place here in 3D" disabled={!placementPoint || !canPlace || busy} onClick={onPlace} className={buttonClass + " bg-primary text-primary-foreground hover:bg-primary/90"}>Place here</button>
      <label className="flex min-h-11 items-center gap-2 text-xs font-semibold"><input type="checkbox" aria-label="Keep placing" checked={repeatPlacement} disabled={busy} onChange={onRepeatChange} />Keep placing</label>
      <button type="button" aria-label="Cancel placement in 3D" disabled={busy} onClick={() => onToolChange("move")} className={buttonClass}>Cancel</button>
    </div>}
    {selectedIds.length > 1 && <p className="text-xs text-muted-foreground">Move the selected group together. Ungroup in 2D to edit individual sizes.</p>}
    {error ? <p role="status" className="text-xs font-semibold text-destructive">{error}</p> : notice && <p role="status" className="text-xs font-semibold text-primary">{notice}</p>}
  </div>;
}
