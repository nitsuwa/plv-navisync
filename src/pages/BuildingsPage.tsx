import { useState, useEffect, useMemo } from "react";
import {
  Building2, SlidersHorizontal, ArrowUpDown,
  Grid3X3, List,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BuildingCard } from "../components/ui/BuildingCard";
import { MOCK_BUILDINGS } from "../data/mockData";
import { useCampusData } from "../contexts/CampusDataContext";
import { buildingsFromCampus } from "../lib/mapDataAdapter";
import { cn } from "../lib/utils";
import { PageTransition } from "../components/ui/PageTransition";
import { SkeletonCard } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { Reveal } from "../components/ui/Reveal";
import { useDebounce, usePublishedCampus } from "../hooks";
import { SearchBar } from "../components/ui/SearchBar";
import type { Building } from "../types";

const CATEGORIES = [
  { value: "all",       label: "All Buildings", icon: Building2 },
  { value: "academic",  label: "Academic",       icon: Building2 },
  { value: "admin",     label: "Administration", icon: Building2 },
  { value: "facility",  label: "Facilities",     icon: Building2 },
  { value: "sports",    label: "Sports",         icon: Building2 },
  { value: "dormitory", label: "Dormitory",      icon: Building2 },
];

type SortKey = "name" | "floors" | "category" | "alphabetical";
type ViewMode = "grid" | "list";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "name",        label: "Name A–Z" },
  { value: "alphabetical",label: "Name Z–A" },
  { value: "floors",      label: "Most Floors" },
  { value: "category",    label: "Category" },
];

export function BuildingsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const { activeCampus, loading: isCampusLoading } = usePublishedCampus();

  // Derive buildings from published campus data, fall back to hardcoded data
  const buildings: Building[] = useMemo(() => {
    if (activeCampus) {
      return buildingsFromCampus(activeCampus) as Building[];
    }
    return MOCK_BUILDINGS;
  }, [activeCampus]);

  const isLoading = isCampusLoading;

  // Debounce search for smoother filtering
  const debouncedSearch = useDebounce(search, 150);

  // Simulate initial load
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const filtered = buildings
    .filter((b) => {
      const matchCat = category === "all" || b.category === category;
      const q = debouncedSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    })
    .sort((a: Building, b: Building) => {
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name);
        case "alphabetical": return b.name.localeCompare(a.name);
        case "floors": return b.floor_count - a.floor_count;
        case "category": return a.category.localeCompare(b.category);
        default: return 0;
      }
    });

  const activeFilters = [category !== "all" && category, search].filter(Boolean).length;

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-5 sm:px-7 py-10 lg:py-14">
        {/* ── Header ── */}
        <Reveal>
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm ring-1 ring-primary/5">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Buildings Directory</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Browse all {buildings.length} buildings, facilities, and services on PLV campus.
              </p>
            </div>
          </div>
        </Reveal>

        {/* ── Search & Filters ── */}
        <Reveal delay={80}>
          <div className="surface-card rounded-2xl p-5 mb-8 space-y-4">
          <div className="max-w-md">
            <SearchBar
              placeholder="Search by name, code, description, or category..."
              value={search}
              onSearch={setSearch}
              onClear={() => setSearch("")}
              showShortcutHint
              size="md"
            />
          </div>

          {/* Category pills + Sort + View toggle */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full min-w-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 w-full min-w-0 max-w-full pb-0.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-0.5" />
              {CATEGORIES.map(({ value, label, icon: CatIcon }) => (
                <button
                  key={value}
                  onClick={() => setCategory(value)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150",
                    category === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {category === value && <CatIcon className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* View toggle */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/50">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    viewMode === "grid" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-label="Grid view"
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    viewMode === "list" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-label="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1">
                <label htmlFor="building-sort" className="sr-only">Sort buildings</label>
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  id="building-sort"
                  name="building-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="h-9 pl-2.5 pr-7 rounded-xl border border-border bg-card text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: "right 0.5rem center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "1.25rem",
                  }}
                >
                  {SORTS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        </Reveal>

        {/* ── Results info ── */}
        <Reveal delay={120}>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                <span className="inline-block w-24 h-4 animate-pulse bg-muted-foreground/10 rounded" />
              ) : (
                <>
                  Showing{" "}
                  <span className="font-extrabold text-foreground">{filtered.length}</span>
                  {" "}building{filtered.length !== 1 ? "s" : ""}
                  {category !== "all" && (
                    <span> in <span className="font-extrabold text-foreground capitalize">{category}</span></span>
                  )}
                </>
              )}
            </p>
            {activeFilters > 0 && !isLoading && (
              <button
                onClick={() => { setSearch(""); setCategory("all"); }}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>
        </Reveal>

        {/* ── Building Grid / List ── */}
        {isLoading ? (
          <Reveal delay={160}>
            <div className={cn(
              viewMode === "grid" ? "grid sm:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"
            )}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </Reveal>
        ) : filtered.length > 0 ? (
          <AnimatePresence mode="wait">
            {viewMode === "grid" ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {filtered.map((b, i) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <BuildingCard building={b} />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {filtered.map((b, i) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                  >
                    <BuildingCard building={b} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <Reveal delay={160}>
            <EmptyState
              icon={Building2}
              title="No buildings found"
              description={
                search
                  ? `We couldn't find any buildings matching "${search}". Try a different search term or category.`
                  : "Try adjusting your search or filter criteria."
              }
              action={
                <button
                  onClick={() => { setSearch(""); setCategory("all"); }}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-sm active:scale-[0.97]"
                >
                  Clear all filters
                </button>
              }
            />
          </Reveal>
        )}
      </div>
    </PageTransition>
  );
}
