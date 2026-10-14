import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Lock, Search, Type, X } from "lucide-react";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";
import { EventAssetVisual } from "./eventAssets";

export function Event3DItemPicker({ furniture, labels, selectedIds, onSelect, disabled }: {
  furniture: readonly FloorFurniture[]; labels: readonly FloorLabel[]; selectedIds: readonly string[]; onSelect: (id: string) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const items = [...furniture.map(item => ({ id: item.id, name: item.name, kind: item.assetKey || item.type, locked: item.locked, hidden: item.visible === false, label: false })), ...labels.map(item => ({ id: item.id, name: item.text || "Untitled label", kind: "Label", locked: item.locked, hidden: item.visible === false, label: true }))];
  const selected = items.find(item => selectedIds.includes(item.id));
  const filtered = items.filter(item => `${item.name} ${item.kind}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <Dialog.Root open={open} onOpenChange={next => { setOpen(next); setSearch(""); }}>
    <Dialog.Trigger asChild><button type="button" aria-label="Selected 3D item" disabled={disabled || !items.length} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 text-left text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {selected?.label ? <Type className="h-4 w-4 shrink-0"/> : selected ? <EventAssetVisual type={selected.kind} label="" className="h-6 w-6 shrink-0"/> : <Search className="h-4 w-4 shrink-0"/>}
      <span className="min-w-0 flex-1 truncate">{selectedIds.length > 1 ? `${selectedIds.length} items selected` : selected?.name || (items.length ? "Select an event item" : "No event items yet")}</span><ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true"/>
    </button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45"/>
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] flex max-h-[min(85dvh,36rem)] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4"><div><Dialog.Title className="text-base font-extrabold">Choose event item</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Find a placed item, then use Move or Details to edit it.</Dialog.Description></div><Dialog.Close aria-label="Close item picker" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"><X className="h-4 w-4"/></Dialog.Close></header>
        <label className="relative m-3 shrink-0"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true"/><input type="search" aria-label="Search event items" placeholder="Search by name or type…" value={search} onChange={event => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"/></label>
        <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {filtered.map(item => <button type="button" key={item.id} data-event-object-id={item.id} aria-label={`Select ${item.name}`} aria-pressed={selectedIds.includes(item.id)} onClick={() => { onSelect(item.id); setOpen(false); setSearch(""); }} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selectedIds.includes(item.id) ? "border-primary bg-primary/5" : "border-transparent"}`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">{item.label ? <Type className="h-5 w-5"/> : <EventAssetVisual type={item.kind} label="" className="h-7 w-7"/>}</span>
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.name}</span><span className="block text-[11px] capitalize text-muted-foreground">{item.kind.replaceAll("-", " ")}{item.hidden && <span className="ml-2">Hidden</span>}</span></span>
            {item.locked && <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3.5 w-3.5"/>Locked</span>}{selectedIds.includes(item.id) && <Check className="h-4 w-4 shrink-0 text-primary"/>}
          </button>)}
          {!filtered.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">No matching items. Try another name.</p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
