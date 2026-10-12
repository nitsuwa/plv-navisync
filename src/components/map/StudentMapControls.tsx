import {
  Box,
  ChevronLeft,
  Crosshair,
  Map,
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
  navigationActive?: boolean;
  profileOpen?: boolean;
  eventMode?: boolean;
  notificationBellVisible?: boolean;
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
  campusViewMode?: "2d" | "3d";
  campusViewToggleVisible?: boolean;
  onToggleCampusViewMode?: () => void;
  mapOverlayOpen?: boolean;
  keepUtilityActionsVisible?: boolean;
}

export function StudentMapModeToggle({ mode, onToggle }: { mode: "2d" | "3d"; onToggle: () => void }) {
  const switchTo3D = mode === "2d";
  const label = switchTo3D ? "Switch to 3D view" : "Switch to 2D view";
  const Icon = switchTo3D ? Box : Map;

  return (
    <button
      type="button"
      data-testid="student-campus-view-mode-toggle"
      data-dock="map-control-bottom-right"
      data-view-mode-target={switchTo3D ? "3d" : "2d"}
      aria-label={label}
      title={switchTo3D ? "Switch to 3D" : "Switch to 2D"}
      onClick={onToggle}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/50 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/10 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10 md:h-10 md:w-10"
    >
      <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
    </button>
  );
}

export function StudentMapControls({
  isFloorMode,
  floorLabel,
  search,
  searchFocused,
  directionsMode,
  navigationActive = false,
  profileOpen = false,
  eventMode = false,
  notificationBellVisible = false,
  pinning = false,
  youAreHere = false,
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
  campusViewMode,
  campusViewToggleVisible = false,
  onToggleCampusViewMode,
  mapOverlayOpen = false,
  keepUtilityActionsVisible = false,
}: StudentMapControlsProps) {
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>("all");
  const searchPlaceholder = isFloorMode
    ? "Search rooms, offices, and labs"
    : "Search buildings, offices, and rooms";
  const pinLabel = pinning ? "Cancel drop pin" : youAreHere ? "Move dropped pin" : "Drop pin";
  // Info cards are overlays on the map, not modal blockers. Keep map actions
  // available in the remaining exposed map area and move the stack above the
  // card using mapOverlayOpen; only actual map modes/search focus suppress it.
  const utilityControlsVisible = !navigationActive && !directionsMode && !searchFocused && (!mapOverlayOpen || eventMode || keepUtilityActionsVisible);
  // Renderer switching must stay available while Route Planner / Event Map
  // owns the lower map surface. Other utility actions still yield to it.
  const mapModeToggleVisible = campusViewToggleVisible && Boolean(campusViewMode && onToggleCampusViewMode);
  const utilityPositionClass = "bottom-3 md:bottom-6";

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
      {!directionsMode && !eventMode && (
        <div
          data-testid="student-map-search-panel"
          data-no-drag
          className={cn(
            "absolute left-2 top-2 w-auto pointer-events-auto transition-[right] duration-200 ease-out motion-reduce:duration-0 md:left-3 md:!right-auto md:top-3 md:w-[min(360px,calc(100vw-24px))]",
            searchFocused ? "right-2" : notificationBellVisible ? "right-32" : "right-16",
          )}
          style={{
            top: "max(0.5rem, env(safe-area-inset-top, 0.5rem))",
            right: searchFocused
              ? "max(0.5rem, env(safe-area-inset-right, 0px))"
              : notificationBellVisible
                ? "calc(8rem + env(safe-area-inset-right, 0px))"
                : "calc(4rem + env(safe-area-inset-right, 0px))",
          }}
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

      {isFloorMode && eventMode && onBackToCampus && <button data-testid="student-event-back-campus" type="button" onClick={onBackToCampus} aria-label="Back to campus map" className="pointer-events-auto absolute left-3 top-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold text-primary shadow-md lg:left-auto lg:right-3"><ChevronLeft aria-hidden="true" className="h-4 w-4" />Campus map</button>}

      {(utilityControlsVisible || mapModeToggleVisible) && (
        <div
          data-testid="student-map-utility-controls"
          data-no-drag
          data-profile-open={profileOpen ? "true" : "false"}
          data-event-mode={eventMode ? "true" : "false"}
          data-map-overlay-open={mapOverlayOpen ? "true" : "false"}
          data-navigation-active={navigationActive ? "true" : "false"}
          data-floor-mode={isFloorMode ? "true" : "false"}
          aria-hidden={profileOpen}
          inert={profileOpen ? ("" as never) : undefined}
          className={cn(
            "student-map-utility-stack pointer-events-auto absolute right-3 flex flex-col items-end gap-1.5",
            utilityPositionClass,
          )}
          style={{
            right: "var(--student-map-utility-right-inset, calc(0.75rem + env(safe-area-inset-right, 0px)))",
            bottom: "var(--student-map-utility-bottom-inset, calc(0.75rem + env(safe-area-inset-bottom, 0px)))",
          }}
        >
          {mapModeToggleVisible && campusViewMode && onToggleCampusViewMode && <StudentMapModeToggle mode={campusViewMode} onToggle={onToggleCampusViewMode} />}
          {utilityControlsVisible && <div data-testid="student-map-utility-actions" className="flex flex-col items-end gap-1.5">{onResetView && (
            <button
              type="button"
              data-testid="student-map-recenter-button"
              data-dock="map-control-bottom-right"
              onClick={onResetView}
              aria-label="Recenter map"
              title="Recenter map"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/50 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/10 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10 md:h-10 md:w-10"
            >
              <Crosshair className="h-[18px] w-[18px]" />
            </button>
          )}
          {onScanLocation && !navigationActive && (
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
          {!navigationActive && (
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
          </div>}
        </div>
      )}
    </div>
  );
}
