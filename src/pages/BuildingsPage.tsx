import { useState, useMemo } from "react";
import { Link } from "react-router";
import {
  Building2, SlidersHorizontal, ArrowLeft, MapPin, Search,
  X, ArrowUpRight,
} from "lucide-react";
import { motion } from "motion/react";
import { BuildingCard } from "../components/ui/BuildingCard";

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
];

interface DirectoryRoom {
  id: string;
  name: string;
  type: string;
  buildingId: string;
  buildingName: string;
  buildingCode: string;
  buildingCategory: string;
  floorLabel: string;
  floorNumber: number;
}

function matchesCategory(
  categoryFilter: string,
  buildingCategory: string,
  buildingCode = "",
  buildingName = "",
): boolean {
  const normalized = buildingCategory.toLowerCase();
  const isStudentCenter = buildingCode.trim().toLowerCase() === "sc" ||
    buildingName.toLowerCase().includes("student center");
  if (categoryFilter === "all") return true;
  if (categoryFilter === "admin") return normalized.startsWith("admin") || isStudentCenter;
  if (categoryFilter === "facility") return normalized.startsWith("facil") || normalized.includes("service");
  return normalized === categoryFilter.toLowerCase();
}

export function BuildingsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const { activeCampus, loading: isCampusLoading } = usePublishedCampus();

  // Derive buildings exclusively from the published campus
  const buildings: Building[] = useMemo(() => {
    if (activeCampus) {
      return buildingsFromCampus(activeCampus) as Building[];
    }
    return [];
  }, [activeCampus]);

  const rooms = useMemo<DirectoryRoom[]>(() => {
    if (!activeCampus) return [];
    return activeCampus.buildings
      .filter((building) => building.visible !== false)
      .flatMap((building) => (building.floors ?? []).flatMap((floor) =>
        (floor.rooms ?? [])
          .filter((room) => room.visible !== false && room.name.trim().length > 0)
          .map((room) => ({
            id: room.id,
            name: room.name,
            type: room.type || "Room",
            buildingId: building.id,
            buildingName: building.name,
            buildingCode: building.code,
            buildingCategory: building.category,
            floorLabel: floor.label || `Floor ${floor.number}`,
            floorNumber: floor.number,
          })),
      ));
  }, [activeCampus]);

  const isLoading = isCampusLoading;

  // Debounce search for smoother filtering
  const debouncedSearch = useDebounce(search, 150);

  const filtered = buildings
    .filter((b) => {
      const matchCat = matchesCategory(category, b.category, b.code, b.name);
      const q = debouncedSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    })
    .sort((a: Building, b: Building) => a.name.localeCompare(b.name));

  const normalizedSearch = debouncedSearch.toLocaleLowerCase().trim();
  const filteredRooms = normalizedSearch
    ? rooms.filter((room) => {
        if (!matchesCategory(category, room.buildingCategory, room.buildingCode, room.buildingName)) return false;
        return [room.name, room.type, room.buildingName, room.buildingCode, room.floorLabel]
          .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
      }).sort((a, b) =>
        a.name.localeCompare(b.name) || a.buildingName.localeCompare(b.buildingName) || a.floorNumber - b.floorNumber,
      )
    : [];

  const activeFilters = [category !== "all" && category, search].filter(Boolean).length;

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-5 sm:px-7 py-10 lg:py-14">
        {/* ── Header ── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Reveal>
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm ring-1 ring-primary/5">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Buildings Directory</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Browse {buildings.length} buildings and {rooms.length} rooms, facilities, and services on PLV campus.
                </p>
              </div>
            </div>
          </Reveal>
          <Link
            to="/home"
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-bold text-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>

        {/* ── Search & Filters ── */}
        <Reveal delay={80}>
          <div className="surface-card rounded-2xl p-3.5 sm:p-5 mb-8 space-y-4">
          <div className="max-w-md">
            <SearchBar
              placeholder="Search buildings, rooms, codes, or categories..."
              value={search}
              onSearch={setSearch}
              onClear={() => setSearch("")}
              showShortcutHint
              size="md"
            />
          </div>

          {/* Category filters */}
          <div>
            <div className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-1.5 pb-0.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-0.5" />
              {CATEGORIES.map(({ value, label, icon: CatIcon }) => (
                <button
                  key={value}
                  onClick={() => setCategory(value)}
                  aria-pressed={category === value}
                  className={cn(
                    "shrink-0 flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-150",
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
          </div>
        </div>
        </Reveal>

        {/* ── Results info ── */}
        <Reveal delay={120}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                <span className="inline-block w-24 h-4 animate-pulse bg-muted-foreground/10 rounded" />
              ) : normalizedSearch ? (
                <>
                  Showing <span className="font-extrabold text-foreground">{filtered.length}</span>
                  {" "}building{filtered.length !== 1 ? "s" : ""} and{" "}
                  <span className="font-extrabold text-foreground">{filteredRooms.length}</span>
                  {" "}matching room{filteredRooms.length !== 1 ? "s" : ""}
                  {category !== "all" && (
                    <span> in <span className="font-extrabold text-foreground capitalize">{category}</span></span>
                  )}
                </>
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

        {/* ── Building and Room Results ── */}
        {isLoading ? (
          <Reveal delay={160}>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </Reveal>
        ) : filtered.length > 0 || filteredRooms.length > 0 ? (
          <div className="space-y-8">
            {filteredRooms.length > 0 && (
              <Reveal delay={140}>
                <section aria-label="Matching rooms">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-extrabold text-foreground">
                      Rooms <span className="text-muted-foreground">({filteredRooms.length})</span>
                    </h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredRooms.map((room, i) => (
                      <motion.div
                        key={`${room.buildingId}:${room.id}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.025 }}
                      >
                        <Link
                          to={`/map?buildingId=${encodeURIComponent(room.buildingId)}`}
                          className="flex h-full min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-card/70 p-3.5 transition-all hover:border-primary/25 hover:bg-primary/[0.03] hover:shadow-sm"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-sm font-bold text-foreground">{room.name}</p>
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                                Room
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {room.buildingName} · {room.floorLabel}
                            </p>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            {filtered.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
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
            )}
          </div>
        ) : (
          <Reveal delay={160}>
            <EmptyState
              icon={Search}
              title="No buildings or rooms found"
              description={
                search
                  ? `We couldn't find any buildings or rooms matching "${search}". Try a different search term or category.`
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
