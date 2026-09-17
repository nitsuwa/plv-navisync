import * as React from "react";
import { Building2, MapPin, Plus, X } from "lucide-react";
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

const inputClass =
  "w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

export function EventLocationPicker({
  buildings,
  locations,
  onChange,
  disabled = false,
}: EventLocationPickerProps) {
  const [buildingId, setBuildingId] = React.useState(buildings[0]?.buildingId ?? "");
  const selectedBuilding = buildings.find((building) => building.buildingId === buildingId);
  const [floorNumber, setFloorNumber] = React.useState(selectedBuilding?.floors[0]?.number ?? 1);
  const hasCampus = locations.some((location) => location.type === "campus");
  const selectedFloor = selectedBuilding?.floors.find((floor) => floor.number === floorNumber)
    ?? selectedBuilding?.floors[0];
  const buildingLocation = selectedBuilding && selectedFloor
    ? {
        type: "building" as const,
        buildingId: selectedBuilding.buildingId,
        floorId: floorLookupId(selectedBuilding.buildingId, selectedFloor.number),
        label: `${selectedBuilding.buildingName} — ${selectedFloor.label}`,
      }
    : null;
  const alreadyAdded = buildingLocation
    ? locations.some((location) => eventLocationKey(location) === eventLocationKey(buildingLocation))
    : false;

  const addLocation = () => {
    if (!buildingLocation || alreadyAdded) return;
    onChange([...locations, buildingLocation]);
  };

  const removeLocation = (location: EventLocationRef) => {
    onChange(locations.filter((current) => eventLocationKey(current) !== eventLocationKey(location)));
  };

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

      <div className="rounded-xl border border-border p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Building2 className="h-4 w-4 text-primary" />
          Add a building floor
        </div>
        {buildings.length === 0 ? (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            No published building floors are available for event requests.
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Building</span>
                <select
                  aria-label="Building"
                  value={buildingId}
                  disabled={disabled}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextBuilding = buildings.find((building) => building.buildingId === nextId);
                    setBuildingId(nextId);
                    setFloorNumber(nextBuilding?.floors[0]?.number ?? 1);
                  }}
                  className={inputClass}
                >
                  {buildings.map((building) => (
                    <option key={building.buildingId} value={building.buildingId}>{building.buildingName}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Floor</span>
                <select
                  aria-label="Floor"
                  value={floorNumber}
                  disabled={disabled || !selectedBuilding}
                  onChange={(event) => setFloorNumber(Number(event.target.value))}
                  className={inputClass}
                >
                  {(selectedBuilding?.floors ?? []).map((floor) => (
                    <option key={floor.number} value={floor.number}>{floor.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={addLocation}
              disabled={disabled || !buildingLocation || alreadyAdded}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add building location
            </button>
            {alreadyAdded && (
              <p className="text-[11px] text-muted-foreground">This floor is already requested.</p>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-foreground">Selected ({locations.length})</p>
          {locations.length === 0 && <span className="text-[11px] text-destructive">Add at least one location</span>}
        </div>
        {locations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {locations.map((location) => (
              <div key={eventLocationKey(location)} className="inline-flex items-center gap-2 max-w-full rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground">
                {location.type === "campus" ? <MapPin className="h-3 w-3 text-primary shrink-0" /> : <Building2 className="h-3 w-3 text-primary shrink-0" />}
                <span className="truncate">{location.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${location.label}`}
                  disabled={disabled}
                  onClick={() => removeLocation(location)}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                >
                  <X className="h-3 w-3" />
                </button>
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
