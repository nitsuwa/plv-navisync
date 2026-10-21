import {
  Box,
  ChevronLeft,
  Crosshair,
  Compass,
  Map,
  MapPin,
  Navigation,
  QrCode,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
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
  discoverMode?: boolean;
  onOpenDiscover?: () => void;
}

export function StudentMapModeToggle({ mode, onToggle, compact = false }: { mode: "2d" | "3d"; onToggle: () => void; compact?: boolean }) {
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
      className={cn("flex shrink-0 items-center justify-center rounded-xl border border-white/50 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/10 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10", compact ? "h-9 w-9" : "h-11 w-11 md:h-10 md:w-10")}
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
  discoverMode = false,
  onOpenDiscover,
}: StudentMapControlsProps) {
  const [destinationFilter, setDestinationFilter] = useState<DestinationFilter>("all");
  const [compactSearchPlaceholder, setCompactSearchPlaceholder] = useState(false);
  const headerSlotRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const slot = headerSlotRef.current;
    if (!slot) return;
    const updatePlaceholder = () => setCompactSearchPlaceholder(slot.getBoundingClientRect().width < 280);
    updatePlaceholder();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updatePlaceholder);
      return () => window.removeEventListener("resize", updatePlaceholder);
    }
    const observer = new ResizeObserver(updatePlaceholder);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [notificationBellVisible]);
  const searchPlaceholder = isFloorMode
    ? compactSearchPlaceholder ? "Search rooms…" : "Search rooms, offices, and labs"
    : compactSearchPlaceholder ? "Search campus…" : "Search buildings, offices, and rooms";
  const pinLabel = pinning ? "Cancel drop pin" : youAreHere ? "Move dropped pin" : "Drop pin";
  // Info cards are overlays on the map. Keep desktop actions at their fixed
  // lower-right anchor; on narrow screens the surface layout lifts the rail
  // above an actual bottom sheet when needed.
  const utilityControlsVisible = !discoverMode && !navigationActive && !directionsMode && !searchFocused && (!mapOverlayOpen || eventMode || keepUtilityActionsVisible);
  // The open route planner owns the renderer switch in its header. Suppress
  // the floating copy for the whole planner context, including tablet/desktop.
  const mapModeToggleVisible = campusViewToggleVisible && !directionsMode
    && Boolean(campusViewMode && onToggleCampusViewMode);
  const utilityPositionClass = discoverMode
    ? "left-3 right-auto top-[max(0.75rem,env(safe-area-inset-top,0px))] bottom-auto items-start"
    : "right-3 bottom-3 items-end md:bottom-6";
  const searchVisible = !discoverMode && !directionsMode && !eventMode;
  const headerSlotClass = "absolute left-2 top-2 w-auto pointer-events-none md:left-3 md:!right-auto md:top-3 md:w-[min(360px,calc(100vw-24px))]";
  const headerSlotStyle = {
    top: "max(0.5rem, env(safe-area-inset-top, 0.5rem))",
    right: notificationBellVisible
      ? "calc(7.5rem + env(safe-area-inset-right, 0px))"
      : "calc(4rem + env(safe-area-inset-right, 0px))",
  };

  const handleClearSearch = () => {
    setDestinationFilter("all");
    onClearSearch();
  };

  const handleSearchChange = (value: string) => {
    setDestinationFilter("all");
    onSearchChange(value);
  };

  return (
    <div data-testid="student-map-controls" className="absolute inset-0 pointer-events-none">
      {(searchVisible || (onOpenDiscover && !discoverMode && !eventMode && !directionsMode && !navigationActive)) && (
        <div
          data-testid="student-map-header-slot"
          ref={headerSlotRef}
          data-map-search-shell="true"
          data-no-drag
          data-map-layer={searchFocused ? "transient" : "controls"}
          data-right-reservation={notificationBellVisible ? "notification-and-profile" : "profile"}
          className={cn(headerSlotClass, searchFocused ? "map-layer-transient" : "map-layer-controls")}
          style={headerSlotStyle}
        >
          {searchVisible && (
            <div data-testid="student-map-search-panel" className="pointer-events-none">
              <div data-testid="student-map-search-content" className="pointer-events-auto">
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
                    <button
                      type="button"
                      onClick={onBackToCampus}
                      className="flex h-11 w-10 shrink-0 items-center justify-center gap-1 rounded-2xl px-1 text-left text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:h-auto md:w-auto md:max-w-[118px] md:justify-start md:px-2"
                      aria-label={`Back to campus map${floorLabel ? ` from ${floorLabel}` : ""}`}
                      title={floorLabel ? `Back to campus map from ${floorLabel}` : "Back to campus map"}
                    >
                      <ChevronLeft className="h-4 w-4 shrink-0" />
                      <span className="sr-only md:not-sr-only md:truncate md:text-[10px] md:font-extrabold md:leading-tight">
                        {floorLabel ?? "Campus map"}
                      </span>
                    </button>
                  ) : undefined}
                />
              </div>
            </div>
          )}
          {onOpenDiscover && !discoverMode && !eventMode && !directionsMode && !navigationActive && (
            <button type="button" data-testid="discover-plv-entry" onClick={onOpenDiscover} className={cn("pointer-events-auto mt-1.5 inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/15 bg-card/95 px-3 text-[11px] font-extrabold text-primary shadow-md shadow-slate-950/5 backdrop-blur-xl transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", !searchVisible && "mt-0", !directionsMode && "hidden md:inline-flex")}>
              <Compass className="h-3.5 w-3.5" aria-hidden="true" />Discover PLV
            </button>
          )}
        </div>
      )}

      {isFloorMode && eventMode && onBackToCampus && <button data-testid="student-event-back-campus" type="button" onClick={onBackToCampus} aria-label="Back to campus map" className="map-layer-controls pointer-events-auto absolute left-3 top-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold text-primary shadow-md lg:left-auto lg:right-3"><ChevronLeft aria-hidden="true" className="h-4 w-4" />Campus map</button>}

      {(utilityControlsVisible || mapModeToggleVisible) && (
        <div
          data-testid="student-map-utility-controls"
          data-anchor="map-bottom-right"
          data-no-drag
          data-profile-open={profileOpen ? "true" : "false"}
          data-event-mode={eventMode ? "true" : "false"}
          data-map-overlay-open={mapOverlayOpen ? "true" : "false"}
          data-route-panel-open={directionsMode ? "true" : "false"}
          data-navigation-active={navigationActive ? "true" : "false"}
          data-floor-mode={isFloorMode ? "true" : "false"}
          aria-hidden={profileOpen}
          inert={profileOpen ? ("" as never) : undefined}
          className={cn(
            "map-layer-controls student-map-utility-stack pointer-events-auto absolute flex flex-col gap-1.5",
            utilityPositionClass,
          )}
          style={{
            ...(discoverMode ? {
              left: "max(0.75rem, env(safe-area-inset-left, 0.75rem))",
              right: "auto",
              top: "max(0.75rem, env(safe-area-inset-top, 0.75rem))",
              bottom: "auto",
            } : {
              left: "auto",
              right: "var(--student-map-utility-anchor-right, calc(0.75rem + env(safe-area-inset-right, 0px)))",
              top: "auto",
              bottom: "var(--student-map-utility-anchor-bottom, calc(0.75rem + env(safe-area-inset-bottom, 0px)))",
            }),
          }}
        >
          {mapModeToggleVisible && campusViewMode && onToggleCampusViewMode && (
            <div data-testid="student-map-mode-toggle-anchor" className="pointer-events-auto map-layer-mode-toggle">
              <StudentMapModeToggle mode={campusViewMode} onToggle={onToggleCampusViewMode} />
            </div>
          )}
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
          </div>
          }
        </div>
      )}
    </div>
  );
}
