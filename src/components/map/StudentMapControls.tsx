import {
  ChevronLeft,
  Compass,
  MapPin,
  Navigation,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import type { SearchResult } from "../../hooks";
import { cn } from "../../lib/utils";
import type { DestinationFilter } from "../../lib/destinationSearch";
import { CampusDestinationSearch } from "./CampusDestinationSearch";

export interface StudentMapControlsProps {
  isFloorMode: boolean;
  floorLabel?: string;
  search: string;
  searchFocused: boolean;
  directionsMode: boolean;
  pinning: boolean;
  youAreHere: boolean;
  searchResults: readonly SearchResult[];
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onClearSearch: () => void;
  onSelectSearchResult: (result: SearchResult) => void;
  onOpenDirections: () => void;
  onTogglePin: () => void;
  onResetView: () => void;
  onBackToCampus?: () => void;
}

export function StudentMapControls({
  isFloorMode,
  floorLabel,
  search,
  searchFocused,
  directionsMode,
  pinning,
  youAreHere,
  searchResults,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onClearSearch,
  onSelectSearchResult,
  onOpenDirections,
  onTogglePin,
  onResetView,
  onBackToCampus,
}: StudentMapControlsProps) {
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>("all");
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

  const handleSearchChange = (value: string) => {
    setDestinationFilter("all");
    onSearchChange(value);
  };

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
            onQueryChange={handleSearchChange}
            onFocus={() => { setDestinationFilter("all"); onSearchFocus(); }}
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
          />
        </div>
      )}

      {!directionsMode && !searchFocused && (
        <div data-testid="student-map-utility-controls" data-no-drag className="absolute right-3 top-20 flex flex-col items-end gap-1.5 pointer-events-auto">
          <div className="overflow-hidden rounded-2xl border border-white/45 bg-card/95 shadow-[0_8px_24px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10">
            <button type="button" onClick={onOpenDirections} aria-label="Open directions" title="Open directions" className="flex h-12 w-12 items-center justify-center text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50">
              <Navigation className="h-5 w-5" />
            </button>
            <div className="h-px bg-border/60" />
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
