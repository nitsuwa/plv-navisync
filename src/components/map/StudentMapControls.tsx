import {
  Accessibility,
  AlertTriangle,
  ChevronLeft,
  Compass,
  MapPin,
  Navigation,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import type { SearchResult } from "../../hooks";
import type { Building } from "../../types";
import { cn } from "../../lib/utils";
import type { DestinationFilter } from "../../lib/destinationSearch";
import { CampusDestinationSearch } from "./CampusDestinationSearch";

export type StudentMapMode = "standard" | "accessible" | "emergency";

export interface StudentMapControlsProps {
  isFloorMode: boolean;
  floorLabel?: string;
  search: string;
  searchFocused: boolean;
  mapMode: StudentMapMode;
  directionsMode: boolean;
  pinning: boolean;
  youAreHere: boolean;
  buildings: readonly Building[];
  selectedBuildingId?: string | null;
  searchResults: readonly SearchResult[];
  recentSearches: readonly string[];
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onClearSearch: () => void;
  onSelectSearchResult: (result: SearchResult) => void;
  onClearRecentSearches: () => void;
  onSelectRecentSearch?: (name: string) => void;
  onSelectBuilding: (building: Building) => void;
  onMapModeChange: (mode: StudentMapMode) => void;
  onOpenDirections: () => void;
  onTogglePin: () => void;
  onResetView: () => void;
  onBackToCampus?: () => void;
}

const MODE_OPTIONS: Array<{
  mode: StudentMapMode;
  label: string;
  shortLabel: string;
  icon: typeof Compass;
}> = [
  { mode: "standard", label: "All buildings", shortLabel: "All", icon: Compass },
  { mode: "accessible", label: "Accessible routes", shortLabel: "Accessible", icon: Accessibility },
  { mode: "emergency", label: "Emergency routes", shortLabel: "Emergency", icon: AlertTriangle },
];

function modeClass(mode: StudentMapMode, active: boolean): string {
  if (!active) return "border-border/70 bg-card/85 text-muted-foreground hover:bg-muted hover:text-foreground";
  if (mode === "accessible") return "border-green-500/35 bg-green-500/12 text-green-700 dark:text-green-300";
  if (mode === "emergency") return "border-red-500/35 bg-red-500/12 text-red-700 dark:text-red-300";
  return "border-primary/35 bg-primary/10 text-primary";
}

export function StudentMapControls({
  isFloorMode,
  floorLabel,
  search,
  searchFocused,
  mapMode,
  directionsMode,
  pinning,
  youAreHere,
  buildings,
  selectedBuildingId = null,
  searchResults,
  recentSearches,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onClearSearch,
  onSelectSearchResult,
  onClearRecentSearches,
  onSelectRecentSearch,
  onSelectBuilding,
  onMapModeChange,
  onOpenDirections,
  onTogglePin,
  onResetView,
  onBackToCampus,
}: StudentMapControlsProps) {
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>("all");
  const showBrowseControls = !isFloorMode && !directionsMode && !selectedBuildingId && !search && !searchFocused;
  const searchPlaceholder = isFloorMode
    ? "Search rooms, offices, and labs"
    : "Search buildings, offices, and rooms";
  const pinLabel = pinning
    ? "Cancel drop pin"
    : youAreHere
      ? "Move dropped pin"
      : "Drop pin";

  const handleClearSearch = () => {
    setDestinationFilter("all");
    onClearSearch();
  };

  const browseContent = (
    <>
      {!isFloorMode && !search && recentSearches.length > 0 && (
        <div className="border-b border-border/60 px-3.5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Recent places</p>
            <button type="button" onClick={onClearRecentSearches} className="rounded px-1 text-[10px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Clear</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recentSearches.map((name) => (
              <button key={name} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelectRecentSearch?.(name)} className="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-muted/70 px-3 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <RotateCcw className="h-3 w-3" />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
      {!isFloorMode && !search && buildings.length > 0 && (
        <div className="px-3.5 py-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Explore campus</p>
          <div className="grid grid-cols-2 gap-1">
            {buildings.slice(0, 6).map((building) => (
              <button key={building.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelectBuilding(building)} className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label={`Open ${building.name} (${building.code})`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block truncate text-xs font-bold text-foreground">{building.name}</span><span className="block text-[10px] font-semibold text-muted-foreground">{building.code}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div data-testid="student-map-controls" className="absolute inset-0 z-20 pointer-events-none">
      {!directionsMode && (
        <div
          data-testid="student-map-search-panel"
          data-no-drag
          className="absolute left-2 right-2 top-2 md:left-3 md:right-auto md:top-3 w-auto md:w-[min(420px,calc(100vw-24px))] pointer-events-auto"
          style={{ top: "max(0.5rem, env(safe-area-inset-top, 0.5rem))" }}
        >
          <CampusDestinationSearch
            query={search}
            results={searchResults}
            focused={searchFocused}
            filter={destinationFilter}
            placeholder={searchPlaceholder}
            ariaLabel="Search campus map"
            clearAriaLabel="Clear map search"
            onQueryChange={onSearchChange}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            onFilterChange={setDestinationFilter}
            onSelect={onSelectSearchResult}
            onClear={handleClearSearch}
            listId="student-map-search-results"
            leading={isFloorMode && onBackToCampus ? (
              <button type="button" onClick={onBackToCampus} className="flex min-h-11 max-w-[118px] shrink-0 items-center gap-1 rounded-2xl px-2 text-left text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Back to campus map">
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="truncate text-[10px] font-extrabold leading-tight">{floorLabel ?? "Campus map"}</span>
              </button>
            ) : (
              <div className="flex h-11 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
                <Compass className="h-5 w-5" strokeWidth={2.4} />
              </div>
            )}
            trailing={(
              <button type="button" onClick={onOpenDirections} className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 text-primary-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95" aria-label="Open directions" title="Open directions">
                <Navigation className="h-4 w-4" />
                <span className="hidden text-[11px] font-extrabold sm:inline">Directions</span>
              </button>
            )}
            browseContent={browseContent}
          />

          {showBrowseControls && (
            <div data-testid="student-map-quick-filters" className="mt-2 space-y-2">
              <div className="flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 no-scrollbar" role="group" aria-label="Map display filters">
                {MODE_OPTIONS.map(({ mode, label, shortLabel, icon: Icon }) => (
                  <button key={mode} type="button" onClick={() => onMapModeChange(mode)} aria-label={label} aria-pressed={mapMode === mode} className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95", modeClass(mode, mapMode === mode))}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="sm:hidden">{shortLabel}</span>
                    <span className="hidden sm:inline">{mode === "standard" ? "All Buildings" : mode === "accessible" ? "PWD Routes" : "Emergency"}</span>
                  </button>
                ))}
              </div>
              {mapMode === "standard" && buildings.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 no-scrollbar" aria-label="Popular campus buildings">
                  {buildings.map((building) => (
                    <button key={building.id} type="button" onClick={() => onSelectBuilding(building)} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card/85 px-3 text-[11px] font-bold text-muted-foreground shadow-sm transition-all hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95" aria-label={`Open ${building.name} (${building.code})`}>
                      <MapPin className="h-3.5 w-3.5 text-primary/70" />
                      {building.code}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!directionsMode && (
        <div data-testid="student-map-utility-controls" data-no-drag className={cn("absolute right-3 flex flex-col items-end gap-1.5 pointer-events-auto", isFloorMode ? "top-20" : "top-[11.5rem] md:top-20")}>
          <div className="overflow-hidden rounded-2xl border border-white/45 bg-card/95 shadow-[0_8px_24px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10">
            {!isFloorMode && (
              <>
                <button type="button" onClick={onTogglePin} aria-label={pinLabel} aria-pressed={pinning} title={pinLabel} className={cn("flex h-12 w-12 items-center justify-center text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50", pinning && "bg-primary/10")}>
                  <MapPin className="h-5 w-5" />
                </button>
                <div className="h-px bg-border/60" />
              </>
            )}
            <button type="button" onClick={onResetView} aria-label="Reset map view" title="Reset map view" className="flex h-12 w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50">
              <RotateCcw className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
