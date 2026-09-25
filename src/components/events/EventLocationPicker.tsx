import * as React from "react";
import { Building2, MapPin, Plus, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { eventLocationKey } from "../../lib/eventOverlayModel";
import { floorLookupId, type EventBuildingOption } from "../../lib/eventLocationData";
import type { EventLocationRef } from "../map-builder/types";
import { EventLocationSelect } from "./EventLocationSelect";

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
  const [buildingId, setBuildingId] = React.useState(buildings[0]?.buildingId ?? "");
  const selectedBuilding = buildings.find((building) => building.buildingId === buildingId);
  const [floorNumber, setFloorNumber] = React.useState<number | null>(selectedBuilding?.floors[0]?.number ?? null);
  React.useEffect(() => {
    const buildingStillExists = buildings.some((building) => building.buildingId === buildingId);
    if (buildingId && !buildingStillExists) {
      setBuildingId("");
      setFloorNumber(null);
      return;
    }
    if (selectedBuilding && floorNumber !== null && !selectedBuilding.floors.some((floor) => floor.number === floorNumber)) {
      setFloorNumber(null);
    }
  }, [buildings, buildingId, floorNumber, selectedBuilding]);
  const hasCampus = locations.some((location) => location.type === "campus");
  const selectedFloor = selectedBuilding?.floors.find((floor) => floor.number === floorNumber);
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
  const buildingOptions = buildings.map((building) => ({
    value: building.buildingId,
    label: building.buildingName,
  }));
  const floorOptions = (selectedBuilding?.floors ?? []).map((floor) => {
    const floorRef: EventLocationRef = {
      type: "building",
      buildingId: selectedBuilding!.buildingId,
      floorId: floorLookupId(selectedBuilding!.buildingId, floor.number),
      label: `${selectedBuilding!.buildingName} — ${floor.label}`,
    };
    const isRequested = locations.some((location) => eventLocationKey(location) === eventLocationKey(floorRef));
    return {
      value: String(floor.number),
      label: floor.label,
      disabled: isRequested,
      description: isRequested ? "Already requested" : undefined,
    };
  });
  const allSelectedBuildingFloorsRequested = Boolean(
    selectedBuilding && selectedBuilding.floors.length > 0 && floorOptions.every((floor) => floor.disabled),
  );

  const addLocation = () => {
    if (!buildingLocation || alreadyAdded) return;
    onChange([...locations, buildingLocation]);
    if (!selectedBuilding || !selectedFloor) return;

    const requestedKeys = new Set(locations.map(eventLocationKey));
    requestedKeys.add(eventLocationKey(buildingLocation));
    const currentFloorIndex = selectedBuilding.floors.findIndex((floor) => floor.number === selectedFloor.number);
    const orderedFloors = [
      ...selectedBuilding.floors.slice(currentFloorIndex + 1),
      ...selectedBuilding.floors.slice(0, currentFloorIndex),
    ];
    const nextAvailableFloor = orderedFloors.find((floor) => !requestedKeys.has(eventLocationKey({
      type: "building",
      buildingId: selectedBuilding.buildingId,
      floorId: floorLookupId(selectedBuilding.buildingId, floor.number),
      label: "",
    })));
    setFloorNumber(nextAvailableFloor?.number ?? null);
  };

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
                <EventLocationSelect
                  label="Building"
                  value={buildingId}
                  options={buildingOptions}
                  searchable
                  disabled={disabled}
                  onChange={(nextId) => {
                    const nextBuilding = buildings.find((building) => building.buildingId === nextId);
                    setBuildingId(nextId);
                    const firstNotRequested = nextBuilding?.floors.find((floor) => {
                      const key = eventLocationKey({
                        type: "building",
                        buildingId: nextId,
                        floorId: floorLookupId(nextId, floor.number),
                        label: `${nextBuilding?.buildingName ?? ""} — ${floor.label}`,
                      });
                      return !locations.some((location) => eventLocationKey(location) === key);
                    });
                    setFloorNumber(firstNotRequested?.number ?? nextBuilding?.floors[0]?.number ?? null);
                  }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Floor</span>
                <EventLocationSelect
                  label="Floor"
                  value={floorNumber === null ? "" : String(floorNumber)}
                  options={floorOptions}
                  searchable={(selectedBuilding?.floors.length ?? 0) > 8}
                  disabled={disabled || !selectedBuilding}
                  onChange={(nextFloor) => setFloorNumber(nextFloor ? Number(nextFloor) : null)}
                />
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
            {allSelectedBuildingFloorsRequested && (
              <p role="status" className="text-[11px] text-muted-foreground">
                All published floors for {selectedBuilding?.buildingName} are already requested.
              </p>
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
