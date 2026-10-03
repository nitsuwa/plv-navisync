import {
  ChevronLeft,
  Crosshair,
  MapPin,
  Navigation,
  QrCode,
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
  profileOpen?: boolean;
  pinning?: boolean;
  youAreHere?: boolean;
  hasSelectedRoom?: boolean;
  searchResults: readonly SearchResult[];
  onSearchChange: (value: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onClearSearch: () => void;
  onSelectSearchResult: (result: SearchResult) => void;
  onOpenDirections: () => void;
  onScanLocation?: () => void;
  onTogglePin?: () => void;
  onResetView?: () => void;
  onBackToCampus?: () => void;
}

export function StudentMapControls({
  isFloorMode,
  floorLabel,
  search,
  searchFocused,
  directionsMode,
  profileOpen = false,
  pinning = false,
  youAreHere = false,
  hasSelectedRoom = false,
  searchResults,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onClearSearch,
  onSelectSearchResult,
  onOpenDirections,
  onScanLocation,
  onTogglePin,
  onResetView,
  onBackToCampus,
}: StudentMapControlsProps) {
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>("all");
  const searchPlaceholder = isFloorMode
    ? "Search rooms, offices, and labs"
    : "Search buildings, offices, and rooms";
  const pinLabel = pinning ? "Cancel drop pin" : youAreHere ? "Move dropped pin" : "Drop pin";
  const utilityControlsVisible = !directionsMode && !searchFocused && (!isFloorMode || !hasSelectedRoom);

  const handleClearSearch = () => {
    setDestinationFilter("all");
    onClearSearch();
  };

  const handleSearchChange = (value: string) => {
    setDestinationFilter("all");
    onSearchChange(value);
  };

  return (
    <div data-testid="student-map-controls" className="map-layer-controls absolute inset-0 pointer-events-none">
      {!directionsMode && (
        <div
          data-testid="student-map-search-panel"
          data-no-drag
          className={cn(
            "absolute left-2 top-2 w-auto pointer-events-auto md:left-3 md:right-auto md:top-3 md:w-[min(360px,calc(100vw-24px))]",
            "right-16",
          )}
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
            groupByBuilding
            compact
            mapHeaderSafeZone
            leading={isFloorMode && onBackToCampus ? (
              <button type="button" onClick={onBackToCampus} className="flex h-11 w-10 shrink-0 items-center justify-center gap-1 rounded-2xl px-1 text-left text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:h-auto md:w-auto md:max-w-[118px] md:justify-start md:px-2" aria-label={`Back to campus map${floorLabel ? ` from ${floorLabel}` : ""}`} title={floorLabel ? `Back to campus map from ${floorLabel}` : "Back to campus map"}>
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="sr-only md:not-sr-only md:truncate md:text-[10px] md:font-extrabold md:leading-tight">{floorLabel ?? "Campus map"}</span>
              </button>
            ) : undefined}
          />
        </div>
      )}

      {utilityControlsVisible && (
        <div
          data-testid="student-map-utility-controls"
          data-no-drag
          data-profile-open={profileOpen ? "true" : "false"}
          aria-hidden={profileOpen}
          inert={profileOpen}
          className="student-map-utility-stack pointer-events-auto absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] right-3 flex flex-col items-end gap-1.5 md:bottom-auto md:top-20"
        >
          <button
            type="button"
            onClick={onOpenDirections}
            aria-label="Open directions"
            aria-expanded={directionsMode}
            title="Open directions"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/50 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/10 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10 md:h-10 md:w-10"
          >
            <Navigation className="h-[18px] w-[18px]" />
          </button>
          {onScanLocation && (
            <button
              type="button"
              onClick={onScanLocation}
              aria-label="Scan location QR"
              title="Scan location QR"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/50 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/10 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10 md:h-10 md:w-10"
            >
              <QrCode className="h-[18px] w-[18px]" />
            </button>
          )}
          {!isFloorMode && onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              aria-label={pinLabel}
              aria-pressed={pinning}
              title={pinLabel}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/50 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/10 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10 md:h-10 md:w-10"
            >
              <MapPin className="h-[18px] w-[18px]" />
            </button>
          )}
          {onResetView && (
            <button
              type="button"
              data-testid="student-map-recenter-button"
              data-dock="map-control-top-right"
              onClick={onResetView}
              aria-label="Recenter map"
              title="Recenter map"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/50 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/10 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10 md:h-10 md:w-10"
            >
              <Crosshair className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
