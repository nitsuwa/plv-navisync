import { useEffect, useRef, useState } from "react";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";
import type { Event3DEditTool, Event3DPoint } from "../../lib/event3dEditing";
import { EVENT_FURNITURE_TEMPLATES } from "./eventAssets";

const buttonClass = "min-h-10 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
function GeometryField({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100)), [focused, setFocused] = useState(false);
  const cancelEdit = useRef(false);
  useEffect(() => { if (!focused) setText(String(Math.round(value * 100) / 100)); }, [value, focused]);
  return <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-muted-foreground">{label}
    <input type="number" aria-label={`${label} in 3D`} value={text} disabled={disabled} onFocus={() => { cancelEdit.current = false; setFocused(true); }} onChange={event => setText(event.target.value)} onBlur={() => { setFocused(false); if (!cancelEdit.current && text.trim() && Number.isFinite(Number(text))) onCommit(Number(text)); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.stopPropagation(); cancelEdit.current = true; setText(String(Math.round(value * 100) / 100)); event.currentTarget.blur(); } }} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" />
  </label>;
}

export function Event3DEditorControls({ tool, onToolChange, template, onTemplateChange, furniture, labels, selectedIds, onSelect, onFurnitureChange, onLabelChange, onToggleLock, onDuplicate, placementPoint, canPlace, onPlace, busy, snap, onSnapChange, error }: {
  tool: Event3DEditTool; onToolChange: (tool: Event3DEditTool) => void; template: string; onTemplateChange: (type: string) => void;
  furniture: readonly FloorFurniture[]; labels: readonly FloorLabel[]; selectedIds: readonly string[]; onSelect: (id: string) => void;
  onFurnitureChange: (changes: Partial<FloorFurniture>) => void; onLabelChange: (changes: Partial<FloorLabel>) => void;
  onToggleLock: () => void; onDuplicate: () => void; placementPoint: Event3DPoint | null; canPlace: boolean; onPlace: () => void;
  busy: boolean; snap: boolean; onSnapChange: () => void; error: string | null;
}) {
  const selected = selectedIds.length === 1 ? furniture.find(item => item.id === selectedIds[0]) : null;
  const label = selectedIds.length === 1 ? labels.find(item => item.id === selectedIds[0]) : null;
  const locked = Boolean(selected?.locked || label?.locked || furniture.some(item => selectedIds.includes(item.id) && item.locked));
  const tools = [{ id: "move", text: "Move", label: "Move items in 3D" }, { id: "rotate", text: "Rotate", label: "Rotate items in 3D" }, { id: "resize", text: "Resize", label: "Resize items in 3D" }, { id: "pan", text: "Pan", label: "Pan map in 3D" }, { id: "place-item", text: "Add item", label: "Add item in 3D" }, { id: "place-label", text: "Add label", label: "Add label in 3D" }] as const;
  return <div aria-label="3D editing controls" className="max-h-[40dvh] shrink-0 space-y-2 overflow-y-auto border-b border-border bg-card px-3 py-2">
    <div role="group" aria-label="3D edit tools" className="flex flex-wrap gap-1.5">{tools.map(({ id, text, label }) => <button key={id} type="button" aria-label={label} aria-pressed={tool === id} disabled={busy || ((id === "rotate" || id === "resize") && (!selected || Boolean(selected.groupId) || locked))} onClick={() => onToolChange(id)} className={`${buttonClass} ${tool === id ? "border-primary bg-primary/10 text-primary" : ""}`}>{text}</button>)}<button type="button" aria-label="Snap in 3D" aria-pressed={snap} disabled={busy} onClick={onSnapChange} className={buttonClass}>{snap ? "Snap on" : "Snap off"}</button></div>
    {(tool === "place-item" || tool === "place-label") ? <div className="flex flex-wrap items-center gap-2">
      {tool === "place-item" && <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold">Asset<select aria-label="3D event asset" value={template} disabled={busy} onChange={event => onTemplateChange(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2">{EVENT_FURNITURE_TEMPLATES.map(item => <option key={item.type} value={item.type}>{item.name}</option>)}</select></label>}
      <button type="button" aria-label="Place here in 3D" disabled={!placementPoint || !canPlace || busy} onClick={onPlace} className={`${buttonClass} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}>Place here</button>
      <p className="basis-full text-xs text-muted-foreground">Click or tap the map to preview a position, then choose Place here. Use Pan to move the camera.</p>
    </div> : <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold">Item<select aria-label="Selected 3D item" value={selectedIds[0] || ""} disabled={busy} onChange={event => onSelect(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2"><option value="">Choose an event item</option>{furniture.map(item => <option key={item.id} value={item.id}>{item.name}{item.visible === false ? " (hidden)" : ""}</option>)}{labels.map(label => <option key={label.id} value={label.id}>{label.text}</option>)}</select></label>
      {(selected || label) && <button type="button" aria-label={locked ? "Unlock item in 3D" : "Lock item in 3D"} disabled={busy} onClick={onToggleLock} className={buttonClass}>{locked ? "Unlock" : "Lock"}</button>}
      {selectedIds.length > 0 && <button type="button" aria-label="Duplicate items in 3D" disabled={busy || locked} onClick={onDuplicate} className={buttonClass}>Duplicate</button>}
      {selectedIds.length > 1 && <p className="basis-full text-xs text-muted-foreground">{selectedIds.length} grouped items selected. Move them together; ungroup in 2D to rotate or resize individual items.</p>}
      {selectedIds.length > 1 && locked && <p role="status" className="basis-full text-xs text-destructive">This group contains a locked item. Unlock its members in 2D before moving it.</p>}
    </div>}
    {selected && tool !== "place-item" && tool !== "place-label" && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      <GeometryField label="X" value={selected.x} disabled={busy || locked} onCommit={x => onFurnitureChange({ x })} />
      <GeometryField label="Y" value={selected.y} disabled={busy || locked} onCommit={y => onFurnitureChange({ y })} />
      <GeometryField label="Rotation" value={selected.rotation} disabled={busy || locked || Boolean(selected.groupId)} onCommit={rotation => onFurnitureChange({ rotation: ((rotation % 360) + 360) % 360 })} />
      <GeometryField label="Width" value={selected.width} disabled={busy || locked || Boolean(selected.groupId)} onCommit={width => onFurnitureChange({ width })} />
      <GeometryField label="Depth" value={selected.height} disabled={busy || locked || Boolean(selected.groupId)} onCommit={height => onFurnitureChange({ height })} />
    </div>}
    {label && tool !== "place-item" && tool !== "place-label" && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      <label className="col-span-3 flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground sm:col-span-2">Label text<input aria-label="Label text in 3D" value={label.text} disabled={busy || locked} onChange={event => onLabelChange({ text: event.target.value })} className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
      <GeometryField label="X" value={label.x} disabled={busy || locked} onCommit={x => onLabelChange({ x })} />
      <GeometryField label="Y" value={label.y} disabled={busy || locked} onCommit={y => onLabelChange({ y })} />
      <GeometryField label="Font size" value={label.fontSize} disabled={busy || locked} onCommit={fontSize => onLabelChange({ fontSize: Math.max(8, Math.min(96, fontSize)) })} />
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">Label color<input type="color" aria-label="Label color in 3D" value={label.color || "#1f2937"} disabled={busy || locked} onChange={event => onLabelChange({ color: event.target.value })} className="h-10 w-full rounded-lg border border-border bg-background" /></label>
    </div>}
    {error && <p role="status" className="text-xs font-semibold text-destructive">{error}</p>}
  </div>;
}
