import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Search, X } from "lucide-react";
import { EVENT_FURNITURE_TEMPLATES, EventAssetVisual, getEventFurnitureTemplate } from "./eventAssets";

const groups = [
  { name: "Furniture", types: ["chair", "table", "registration-desk", "podium"] },
  { name: "Structures", types: ["booth", "tent", "stage"] },
  { name: "Equipment", types: ["speaker", "projector", "monitor", "microphone"] },
  { name: "Access", types: ["barrier", "signage", "queue-post"] },
];

export function Event3DAssetPicker({ value, onChange, open, onOpenChange, disabled }: {
  value: string; onChange: (type: string) => void; open: boolean; onOpenChange: (open: boolean) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const selected = getEventFurnitureTemplate(value);
  const filtered = EVENT_FURNITURE_TEMPLATES.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <Dialog.Root open={open} onOpenChange={next => { setSearch(""); onOpenChange(next); }}>
    <Dialog.Trigger asChild><button type="button" aria-label="Choose 3D event asset" disabled={disabled} className="flex min-h-11 w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 text-left text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <EventAssetVisual type={selected.type} label="" className="h-7 w-7 shrink-0" /><span className="flex-1">{selected.name}</span><ChevronDown className="h-4 w-4" aria-hidden="true" />
    </button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
          <div><Dialog.Title className="text-lg font-bold">Choose event asset</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Choose an item, then click or tap the map to place it. Open Details after placement to adjust supported items.</Dialog.Description></div>
          <Dialog.Close aria-label="Close asset picker" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-5 w-5" /></Dialog.Close>
        </div>
        <label className="relative m-4 block shrink-0"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input type="search" aria-label="Search event assets" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search chairs, tents, equipment…" className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <div className="min-h-0 space-y-5 overflow-y-auto px-4 pb-4">
          {groups.map(group => {
            const items = filtered.filter(item => group.types.includes(item.type));
            return items.length ? <section key={group.name} aria-label={group.name}>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">{group.name}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{items.map(item => <button type="button" key={item.type} aria-label={`Choose ${item.name}`} onClick={() => { onChange(item.type); setSearch(""); onOpenChange(false); }} className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === item.type ? "border-primary bg-primary/5" : "border-border"}`}>
                <EventAssetVisual type={item.type} label="" className="h-10 w-14" /><span>{item.name}</span>
              </button>)}</div>
            </section> : null;
          })}
          {!filtered.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">No assets found. Try another name.</p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
