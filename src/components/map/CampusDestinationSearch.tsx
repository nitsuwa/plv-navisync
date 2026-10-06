import { Building2, BriefcaseBusiness, FlaskConical, Landmark, MapPin, Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, type ReactNode } from "react";
import type { SearchResult } from "../../hooks/useCampusSearch";
import {
  destinationContextLabel,
  destinationKindLabel,
  destinationResultKey,
  filterDestinationResults,
  type DestinationFilter,
} from "../../lib/destinationSearch";
import { cn } from "../../lib/utils";

const FILTERS: Array<{ value: DestinationFilter; label: string; ariaLabel: string }> = [
  { value: "all", label: "All", ariaLabel: "All destinations" },
  { value: "building", label: "Buildings", ariaLabel: "Buildings" },
  { value: "room", label: "Rooms", ariaLabel: "Rooms" },
  { value: "office", label: "Offices", ariaLabel: "Offices" },
];

export interface CampusDestinationSearchProps {
  query: string;
  results: readonly SearchResult[];
  focused: boolean;
  filter: DestinationFilter;
  placeholder: string;
  ariaLabel: string;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onFilterChange: (filter: DestinationFilter) => void;
  onSelect: (result: SearchResult) => void;
  onClear: () => void;
  clearAriaLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  browseContent?: ReactNode;
  autoFocus?: boolean;
  compact?: boolean;
  /** Reduce fixed search chrome when results need to fill a compact route sheet. */
  dense?: boolean;
  /** Render inside a parent surface without introducing another nested card. */
  embedded?: boolean;
  /** Return a reason when a result duplicates the other route endpoint. */
  getDisabledReason?: (result: SearchResult) => string | undefined;
  /** Let a containing sheet allocate the remaining height to the result list. */
  fillResults?: boolean;
  listId?: string;
  groupByBuilding?: boolean;
  mapHeaderSafeZone?: boolean;
}

function destinationIcon(result: SearchResult) {
  if (result.kind === "building") return <Building2 className="h-4 w-4" />;
  if (result.kind === "office") return <BriefcaseBusiness className="h-4 w-4" />;
  if (result.kind === "laboratory") return <FlaskConical className="h-4 w-4" />;
  if (result.kind === "marker") return <Landmark className="h-4 w-4" />;
  return <MapPin className="h-4 w-4" />;
}

export function CampusDestinationSearch({
  query,
  results,
  focused,
  filter,
  placeholder,
  ariaLabel,
  onQueryChange,
  onFocus,
  onBlur,
  onFilterChange,
  onSelect,
  onClear,
  clearAriaLabel = "Clear search",
  leading,
  trailing,
  browseContent,
  autoFocus = false,
  compact = false,
  dense = false,
  embedded = false,
  getDisabledReason,
  fillResults = false,
  listId = "campus-destination-results",
  groupByBuilding = false,
  mapHeaderSafeZone = false,
}: CampusDestinationSearchProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const filteredResults = useMemo(
    () => filterDestinationResults(results, filter),
    [filter, results],
  );
  const resultGroups = useMemo(() => {
    if (!groupByBuilding) return [{ id: "all", label: "", entries: filteredResults }];
    const groups = new Map<string, { id: string; label: string; entries: SearchResult[] }>();
    for (const result of filteredResults) {
      const id = result.buildingId ?? (result.kind === "building" ? result.id : "campus");
      const building = results.find((entry) => entry.kind === "building" && (entry.buildingId ?? entry.id) === id);
      const name = building?.name ?? result.buildingName ?? (result.kind === "building" ? result.name : "Campus places");
      const label = building?.code ? `${name} (${building.code})` : name;
      const group = groups.get(id) ?? { id, label, entries: [] };
      group.entries.push(result);
      groups.set(id, group);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map((group) => ({
      ...group,
      entries: [...group.entries].sort((a, b) =>
        Number(b.kind === "building") - Number(a.kind === "building")
        || (a.floorNumber ?? 0) - (b.floorNumber ?? 0)
        || a.name.localeCompare(b.name, undefined, { numeric: true })),
    }));
  }, [filteredResults, groupByBuilding, results]);

  return (
    <div ref={panelRef} className={cn("min-w-0", fillResults && "flex min-h-0 min-w-0 flex-1 flex-col")}>
      <div className={cn(
        "rounded-[18px] border border-white/50 bg-card/95 backdrop-blur-xl dark:border-white/10",
        compact ? "shadow-[0_6px_18px_rgba(15,23,42,0.14)]" : "rounded-[20px] shadow-[0_10px_30px_rgba(15,23,42,0.14)]",
        dense ? "p-2" : compact ? "p-1" : "p-1.5",
        fillResults && "flex min-h-0 flex-1 flex-col",
        embedded && "rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none",
      )}>
        <div className="flex items-center gap-1.5" data-map-search-header={mapHeaderSafeZone ? "true" : undefined}>
          {leading}
          <div className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 transition-colors",
            focused && "ring-2 ring-primary/15",
          )}>
            <Search className={cn("shrink-0 text-muted-foreground", dense ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />
            <input
              type="text"
              role="searchbox"
              inputMode="search"
              enterKeyHint="search"
              aria-label={ariaLabel}
              aria-controls={focused ? listId : undefined}
              aria-expanded={focused}
              autoComplete="off"
              autoFocus={autoFocus}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onFocus={onFocus}
              onKeyDown={(event) => {
                if (event.key === "Escape") onBlur();
                if (event.key === "Enter" && query.trim()) {
                  const exact = filteredResults.find((result) =>
                    result.name.trim().toLowerCase() === query.trim().toLowerCase()
                    || result.code?.trim().toLowerCase() === query.trim().toLowerCase());
                  const selectableResults = filteredResults.filter((result) => !getDisabledReason?.(result));
                  const result = exact
                    ? (getDisabledReason?.(exact) ? undefined : exact)
                    : selectableResults[0];
                  if (result) {
                    event.preventDefault();
                    onSelect(result);
                  }
                }
              }}
              onBlur={(event) => {
                if (event.relatedTarget instanceof Node && panelRef.current?.contains(event.relatedTarget)) return;
                onBlur();
              }}
              placeholder={placeholder}
              className={cn(
                "min-w-0 min-h-11 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground",
                compact && "min-h-10",
                compact && "text-xs sm:text-[13px]",
                dense && "min-h-9 text-[11px]",
              )}
            />
            {query && (
              <button
                type="button"
                onClick={onClear}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label={clearAriaLabel}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {trailing}
        </div>

        <AnimatePresence initial={false}>
          {focused && (
            <motion.div
              key="destination-search-results"
              initial={reducedMotion ? false : { opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -3 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.17, ease: "easeOut" }}
              className={cn("overflow-hidden", fillResults && "flex min-h-0 flex-1 flex-col")}
            >
            <div className="mt-1.5 flex shrink-0 gap-1 overflow-x-auto px-0.5 pb-0.5 no-scrollbar" role="group" aria-label="Destination type filters">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-label={item.ariaLabel}
                  aria-pressed={filter === item.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onFilterChange(item.value)}
                  className={cn(
                    "shrink-0 rounded-full border text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    "min-h-9 px-3",
                    filter === item.value
                      ? "border-primary/30 bg-primary text-primary-foreground"
                      : "border-border/70 bg-muted/55 text-muted-foreground hover:border-primary/30 hover:text-primary",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div
              id={listId}
              role="listbox"
              data-map-layer={mapHeaderSafeZone ? "transient" : undefined}
              aria-label="Campus destination results"
              className={cn(
                "max-h-[min(22rem,55dvh)] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-xl no-scrollbar",
                dense ? "mt-2" : "mt-1.5",
                fillResults && "min-h-0 max-h-none flex-1",
              )}
              style={compact && !fillResults ? { maxHeight: "min(22rem, calc(100dvh - var(--student-map-search-safe-top, 4rem) - 6.5rem - env(safe-area-inset-bottom, 0px)))" } : undefined}
              onWheelCapture={(event) => event.stopPropagation()}
              onTouchMoveCapture={(event) => event.stopPropagation()}
            >
              {!query && browseContent ? (
                browseContent
              ) : filteredResults.length > 0 ? (
                resultGroups.map((group) => (
                  <div key={group.id} role={groupByBuilding ? "group" : undefined} aria-label={groupByBuilding ? group.label : undefined}>
                    {groupByBuilding && (
                      <p className={cn("sticky top-0 z-10 flex min-w-0 items-center gap-1 border-b border-border/60 bg-muted font-extrabold text-foreground", dense ? "px-4 py-2 text-[11px]" : "px-3.5 py-2 text-xs")}>
                        <span className="min-w-0 truncate">{group.label}</span>
                        <span className="shrink-0 font-normal text-muted-foreground">· {group.entries.length} places</span>
                      </p>
                    )}
                    {group.entries.map((result) => (
                      (() => {
                        const disabledReason = getDisabledReason?.(result);
                        return (
                          <button
                            key={destinationResultKey(result)}
                            type="button"
                            role="option"
                            aria-selected="false"
                            aria-disabled={disabledReason ? "true" : undefined}
                            aria-label={`${result.name}, ${destinationKindLabel(result)}${destinationContextLabel(result) ? `, ${destinationContextLabel(result)}` : ""}${disabledReason ? `, ${disabledReason}` : ""}`}
                            disabled={Boolean(disabledReason)}
                            title={disabledReason}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onSelect(result)}
                            className={cn("flex w-full items-center border-b border-border/40 text-left transition-colors last:border-b-0 hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent", dense ? "min-h-[60px] gap-2.5 px-3.5 py-2.5" : "min-h-16 gap-3 px-3.5 py-2.5")}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              {destinationIcon(result)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className={cn("min-w-0 truncate font-bold text-foreground", dense ? "text-[13px]" : "text-sm")}>{result.name}</span>
                                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">
                                  {destinationKindLabel(result)}
                                </span>
                              </span>
                              <span className={cn("mt-0.5 block truncate text-muted-foreground", dense ? "text-[11px]" : "text-xs")}>{disabledReason ?? destinationContextLabel(result)}</span>
                            </span>
                            {result.accessible && (
                              <span className="shrink-0 rounded-md bg-green-500/10 px-2 py-1 text-[10px] font-extrabold text-green-700 dark:text-green-300">Accessible</span>
                            )}
                          </button>
                        );
                      })()
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center px-5 py-8 text-center">
                  <Search className="mb-2 h-6 w-6 text-muted-foreground/50" />
                  <p className="text-sm font-bold text-foreground">No matching places</p>
                  <p className="mt-1 max-w-[230px] text-xs leading-relaxed text-muted-foreground">Try a building name, room number, or facility.</p>
                  {query && (
                    <button type="button" onClick={onClear} className="mt-3 text-xs font-extrabold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
