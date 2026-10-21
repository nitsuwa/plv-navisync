import * as React from "react";
import { Building2, MapPin, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { eventLocationKey } from "../../lib/eventOverlayModel";
import { floorLookupId, type EventBuildingOption } from "../../lib/eventLocationData";
import type { EventLocationRef } from "../map-builder/types";

interface EventLocationPickerProps {
  buildings: EventBuildingOption[];
  locations: EventLocationRef[];
  onChange: (locations: EventLocationRef[]) => void;
  disabled?: boolean;
}

export function EventLocationPicker({
  buildings,
  locations,
  onChange,
  disabled = false,
}: EventLocationPickerProps) {
  const [search, setSearch] = React.useState("");
  const hasCampus = locations.some((location) => location.type === "campus");

  const removeLocation = (location: EventLocationRef) => {
    onChange(locations.filter((current) => eventLocationKey(current) !== eventLocationKey(location)));
  };

  const campusLocations = locations.filter((location) => location.type === "campus");
  const buildingGroups = new Map<string, { buildingName: string; locations: EventLocationRef[] }>();
  locations.filter((location) => location.type !== "campus").forEach((location) => {
    const groupKey = location.buildingId ?? location.label;
    const buildingName = buildings.find((building) => building.buildingId === location.buildingId)?.buildingName
      ?? location.label.split(/\s+[—–-]\s+/)[0]
      ?? "Building";
    const group = buildingGroups.get(groupKey) ?? { buildingName, locations: [] };
    group.locations.push(location);
    buildingGroups.set(groupKey, group);
  });

  return (
    <div className="space-y-4" data-testid="event-location-picker">
      <div>
        <p className="text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">
          Requested locations
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose every campus area or building floor needed for this event. The admin reviews all locations and maps together.
        </p>
      </div>

      <label className={cn(
        "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
        hasCampus ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
        disabled && "opacity-60 cursor-not-allowed"
      )}>
        <input
          type="checkbox"
          aria-label="Campus Grounds"
          checked={hasCampus}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.checked) {
              if (!hasCampus) onChange([{ type: "campus", label: "Campus Grounds" }, ...locations]);
            } else {
              removeLocation({ type: "campus", label: "Campus Grounds" });
            }
          }}
          className="mt-1 accent-primary"
        />
        <span className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-primary mt-0.5" />
          <span>
            <span className="block text-sm font-bold text-foreground">Campus Grounds</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">Outdoor areas and the main campus map</span>
          </span>
        </span>
      </label>

      <div className="space-y-3">
        <label className="block text-xs font-bold">Search buildings<input aria-label="Search buildings" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a building…" className="mt-2 h-10 w-full rounded-xl border border-border bg-input-background px-3 text-sm" /></label>
        {buildings.length === 0 && <p role="status" className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">No published building floors are available for event requests.</p>}
        {buildings.filter((building) => building.buildingName.toLowerCase().includes(search.toLowerCase())).map((building) => <fieldset key={building.buildingId} aria-label={`Available floors in ${building.buildingName}`} className="rounded-xl border border-border p-3"><legend className="px-1 text-sm font-bold">{building.buildingName}</legend><div className="grid gap-2 sm:grid-cols-2">{building.floors.map((floor) => {
          const ref: EventLocationRef = { type: "building", buildingId: building.buildingId, floorId: floorLookupId(building.buildingId, floor.number), label: `${building.buildingName} — ${floor.label}` };
          const checked = locations.some((location) => eventLocationKey(location) === eventLocationKey(ref));
          return <label key={floor.number} className={cn("flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}><input type="checkbox" aria-label={ref.label} checked={checked} disabled={disabled} onChange={() => checked ? removeLocation(ref) : onChange([...locations, ref])} className="accent-primary" />{floor.label}</label>;
        })}</div></fieldset>)}
        {buildings.length > 0 && !buildings.some((building) => building.buildingName.toLowerCase().includes(search.toLowerCase())) && <p className="text-xs text-muted-foreground">No matching buildings.</p>}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-foreground">Selected ({locations.length})</p>
          {locations.length === 0 && <span className="text-[11px] text-destructive">Add at least one location</span>}
        </div>
        {locations.length > 0 ? (
          <div className="space-y-2" aria-label="Selected locations">
            {campusLocations.map((location, index) => (
              <div key={`${eventLocationKey(location)}-${index}`} className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 font-semibold">{location.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${location.label}`}
                  disabled={disabled}
                  onClick={() => removeLocation(location)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ))}
            {[...buildingGroups.entries()].map(([groupKey, group]) => (
              <div key={groupKey} role="group" aria-label={group.buildingName} className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="flex items-center gap-2 border-b border-border bg-muted/35 px-3 py-2 text-xs font-bold text-foreground">
                  <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 break-words">{group.buildingName}</span>
                  <span className="ml-auto shrink-0 text-[11px] font-medium text-muted-foreground">{group.locations.length} {group.locations.length === 1 ? "floor" : "floors"}</span>
                </h3>
                <ul className="divide-y divide-border">
                  {group.locations.map((location, index) => (
                    <li key={`${eventLocationKey(location)}-${index}`} className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm text-foreground">
                      <span className="min-w-0 flex-1 break-words">{location.label}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${location.label}`}
                        disabled={disabled}
                        onClick={() => removeLocation(location)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                      >
                        <X aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground rounded-xl border border-dashed border-border px-3 py-3">
            No locations selected yet.
          </p>
        )}
      </div>
    </div>
  );
}
