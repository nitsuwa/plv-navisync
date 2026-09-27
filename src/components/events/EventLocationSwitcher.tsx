import { Building2, Check, ChevronRight, LockKeyhole, MapPin } from "lucide-react";
import { cn } from "../../lib/utils";
import { countEventOverlayItems } from "../../lib/eventOverlayModel";
import type { EventOverlayLocation } from "../map-builder/types";

export function EventLocationSwitcher({
  locations,
  activeLocationId,
  onChange,
}: {
  locations: EventOverlayLocation[];
  activeLocationId: string;
  onChange: (locationId: string) => void;
}) {
  return (
    <aside
      aria-label="Event locations"
      className="w-full shrink-0 border-b border-border bg-card lg:w-64 lg:border-b-0 lg:border-r"
    >
      <div className="border-b border-border px-3 py-3 lg:px-4 lg:py-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-foreground">Event locations</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Choose a map to edit your event setup.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>Published map stays locked</span>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto p-3 no-scrollbar lg:flex-col lg:overflow-visible lg:p-4">
        {locations.map((location) => {
          const counts = countEventOverlayItems([location]);
          const active = activeLocationId === location.id;
          const Icon = location.locationRef.type === "campus" ? MapPin : Building2;
          const floorNumber = location.locationRef.floorId?.split("-f").pop();
          const context = location.locationRef.type === "campus"
            ? "Campus map"
            : `Building · Floor ${floorNumber || "—"}`;
          return (
            <button
              type="button"
              key={location.id}
              aria-label={`Edit ${location.locationRef.label}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onChange(location.id)}
              className={cn(
                "group relative flex min-h-[72px] min-w-[224px] items-start gap-2.5 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:min-w-0 lg:w-full",
                active
                  ? "border-primary/60 bg-primary/[0.07] text-foreground shadow-sm"
                  : "border-border/80 text-muted-foreground hover:border-primary/30 hover:bg-muted/50",
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />}
              <span className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{location.locationRef.label}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-muted-foreground">{context}</span>
                <span className="mt-1 block text-[10px] text-muted-foreground">{counts.furniture} furniture · {counts.labels} labels</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-[9px] font-extrabold uppercase tracking-wide">
                {active ? <Check className="h-3.5 w-3.5 text-primary" aria-label="Active location" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />}
                <span className={cn(active ? "text-primary" : "text-muted-foreground/70")}>{active ? "Editing" : "Switch map"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
