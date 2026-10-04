import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardList, X } from "lucide-react";
import { normalizeEventOverlayLocations, countEventOverlayItems } from "../../lib/eventOverlayModel";
import type { CampusEventOverlay } from "../map-builder/types";

export function EventFurnitureSummary({ overlay }: { overlay: CampusEventOverlay }) {
  const [open, setOpen] = useState(false);
  const locations = normalizeEventOverlayLocations(overlay);
  const totals = countEventOverlayItems(locations);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold text-foreground hover:bg-muted"><ClipboardList aria-hidden className="h-4 w-4" />Furniture summary</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[130] bg-black/45 backdrop-blur-sm" /><Dialog.Content className="fixed left-1/2 top-1/2 z-[131] flex max-h-[85dvh] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><Dialog.Title className="text-lg font-extrabold">Event furniture summary</Dialog.Title><Dialog.Description className="mt-1 text-sm text-muted-foreground">Requested event items only; permanent campus furniture is excluded.</Dialog.Description></div><Dialog.Close aria-label="Close furniture summary" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border"><X className="h-4 w-4" /></Dialog.Close></div>
      <p className="my-4 rounded-xl bg-primary/5 p-3 text-sm font-bold text-primary">{totals.furniture} furniture · {totals.labels} labels · {locations.length} locations</p>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">{locations.map(location => {
        const breakdown = location.eventFurniture.reduce<Record<string, number>>((counts, item) => { const type = item.assetKey || item.type || "Other"; counts[type] = (counts[type] || 0) + 1; return counts; }, {});
        return <section key={location.id} className="rounded-xl border border-border p-4"><h3 className="font-bold">{location.locationRef.label}</h3><p className="mt-1 text-xs text-muted-foreground">{location.eventFurniture.length} furniture · {location.eventLabels.length} labels</p><div className="mt-3 flex flex-wrap gap-2">{Object.entries(breakdown).map(([type, count]) => <span key={type} className="rounded-lg bg-muted px-2 py-1 text-xs capitalize">{type.replace(/[_-]/g, " ")} <strong>× {count}</strong></span>)}</div>{location.eventFurniture.length ? <ul className="mt-3 divide-y divide-border">{location.eventFurniture.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span className="font-semibold">{item.name || item.type}</span><span className="capitalize text-muted-foreground">{(item.assetKey || item.type).replace(/[_-]/g, " ")}{item.visible === false ? " · Hidden" : ""}</span></li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">No event furniture on this map.</p>}</section>;
      })}</div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
