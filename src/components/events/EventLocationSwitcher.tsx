import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Building2, Check, ChevronRight, ChevronsLeft, ChevronsRight, LockKeyhole, MapPin, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { countEventOverlayItems } from "../../lib/eventOverlayModel";
import type { EventOverlayLocation } from "../map-builder/types";

interface EventLocationSwitcherProps {
  locations: EventOverlayLocation[];
  activeLocationId: string;
  onChange: (locationId: string) => void;
  /** The read-only approval preview keeps its expanded rail unless explicitly made responsive. */
  presentation?: "rail" | "responsive";
}

export function EventLocationSwitcher({ locations, activeLocationId, onChange, presentation = "rail" }: EventLocationSwitcherProps) {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(min-width: 1024px)").matches ?? window.innerWidth >= 1024));
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeLocation = locations.find((location) => location.id === activeLocationId) ?? locations[0];
  const responsive = presentation === "responsive";

  useEffect(() => {
    if (!responsive || typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [responsive]);

  const locationButtons = (sheet = false) => locations.map((location) => {
    const counts = countEventOverlayItems([location]);
    const active = activeLocationId === location.id;
    const Icon = location.locationRef.type === "campus" ? MapPin : Building2;
    const authoredFloorLabel = location.locationRef.label.split("—").at(-1)?.trim();
    return (
      <button
        type="button"
        key={location.id}
        aria-label={`Edit ${location.locationRef.label}`}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          onChange(location.id);
          if (sheet) setSheetOpen(false);
        }}
        className={cn(
          "group relative flex min-h-[68px] min-w-0 items-start gap-2.5 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          sheet ? "w-full" : "w-full",
          active ? "border-primary/60 bg-primary/[0.07] text-foreground shadow-sm" : "border-border/80 text-muted-foreground hover:border-primary/30 hover:bg-muted/50",
        )}
      >
        {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />}
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block whitespace-normal break-words text-xs font-bold leading-4">{location.locationRef.label}</span>
          <span className="mt-1 block text-[10px] font-semibold text-muted-foreground">{location.locationRef.type === "campus" ? "Campus map" : `Building · ${authoredFloorLabel || "Floor map"}`}</span>
          <span className="mt-1 block text-[10px] text-muted-foreground">{counts.furniture} furniture · {counts.labels} labels</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-[9px] font-extrabold uppercase tracking-wide">
          {active ? <Check className="h-3.5 w-3.5 text-primary" aria-label="Active location" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />}
          <span className={active ? "text-primary" : "text-muted-foreground/70"}>{active ? "Editing" : "Switch map"}</span>
        </span>
      </button>
    );
  });

  if (responsive && !desktop) {
    return (
      <div className="relative z-40 shrink-0 border-b border-border bg-card px-3 py-2">
        <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Dialog.Trigger asChild>
            <button type="button" data-event-tour="locations" aria-label={`Choose event location. Current: ${activeLocation?.locationRef.label ?? "none"}`} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 text-left text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">Event location</span>
                <span className="block truncate text-xs font-bold">{activeLocation?.locationRef.label ?? "No requested locations"}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground" aria-hidden="true" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[79] bg-background/55 backdrop-blur-[2px]" />
            <Dialog.Content data-testid="event-locations-sheet" onOpenAutoFocus={(event) => event.preventDefault()} className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[min(76dvh,42rem)] min-h-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl outline-none">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4">
                <div className="min-w-0"><Dialog.Title className="text-sm font-extrabold">Event locations</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Choose one of the locations requested for this event.</Dialog.Description></div>
                <Dialog.Close asChild><button type="button" aria-label="Close event locations" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-4 w-4" aria-hidden="true" /></button></Dialog.Close>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>{locationButtons(true)}</div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  const isCollapsed = responsive && collapsed;
  return (
    <aside aria-label="Event locations" className={cn("flex min-h-0 shrink-0 flex-col border-border bg-card motion-safe:transition-[width] motion-safe:duration-200", responsive ? (isCollapsed ? "w-16 border-r" : "w-60 border-r") : "w-full border-b lg:w-64 lg:border-b-0 lg:border-r")}>
      {isCollapsed ? (
        <div className="flex h-full flex-col items-center gap-3 py-3">
          <button type="button" data-event-tour="locations" aria-label="Expand locations" title="Expand locations" aria-expanded="false" onClick={() => setCollapsed(false)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronsRight className="h-4 w-4" aria-hidden="true" /></button>
          <Tooltip.Provider delayDuration={180}><div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto overscroll-contain border-t border-border px-2 pt-3">
            {locations.map((location, index) => {
              const active = location.id === activeLocationId;
              const Icon = location.locationRef.type === "campus" ? MapPin : Building2;
              return <Tooltip.Root key={location.id}><Tooltip.Trigger asChild><button type="button" aria-label={`Edit ${location.locationRef.label}`} aria-current={active ? "page" : undefined} onClick={() => onChange(location.id)} className={cn("relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", active ? "border-primary/50 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted")}><Icon className="h-4 w-4" aria-hidden="true" /><span aria-hidden="true" className="absolute bottom-0.5 right-1 text-[8px] font-bold">{index + 1}</span></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="right" sideOffset={8} className="z-[90] max-w-60 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-lg">{location.locationRef.label}{active && <span className="mt-1 block text-[10px] text-primary">Currently editing</span>}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
            })}
          </div></Tooltip.Provider>
        </div>
      ) : <>
        <div className={cn("shrink-0 border-b border-border px-3 py-3", responsive ? "lg:px-3" : "lg:px-4 lg:py-4")}>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-foreground">Event locations</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Choose a map to edit your event setup.</p>
            </div>
            {responsive && <button type="button" aria-label="Collapse locations" title="Collapse locations" aria-expanded="true" onClick={() => setCollapsed(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronsLeft className="h-4 w-4" aria-hidden="true" /></button>}
          </div>
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /><span>Published map stays locked</span></div>
        </div>
        <div data-event-tour="locations" className={cn("flex min-h-0 gap-2 overflow-y-auto p-3", responsive ? "flex-col" : "overflow-x-auto lg:flex-col lg:overflow-visible lg:p-4")}>
          {locationButtons()}
        </div>
      </>}
    </aside>
  );
}
