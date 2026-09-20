import { Building2, MapPin } from "lucide-react";
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
    <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card p-3 lg:p-4">
      <div className="mb-3">
        <p className="text-xs font-extrabold text-foreground">Event locations</p>
        <p className="text-[11px] text-muted-foreground mt-1">Choose a map to edit. The published campus map stays locked.</p>
      </div>
      <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible no-scrollbar">
        {locations.map((location) => {
          const counts = countEventOverlayItems([location]);
          const active = activeLocationId === location.id;
          const Icon = location.locationRef.type === "campus" ? MapPin : Building2;
          return (
            <button
              type="button"
              key={location.id}
              aria-label={`Edit ${location.locationRef.label}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onChange(location.id)}
              className={cn(
                "min-w-[210px] lg:min-w-0 lg:w-full flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary/50 bg-primary/5 text-foreground" : "border-border hover:bg-muted/50 text-muted-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className="block text-xs font-bold truncate">{location.locationRef.label}</span>
                <span className="block text-[10px] mt-1 text-muted-foreground">{counts.furniture} furniture · {counts.labels} labels</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
