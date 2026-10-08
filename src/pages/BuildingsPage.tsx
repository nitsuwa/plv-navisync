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
import type { Campus } from "../components/map-builder/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../app/components/ui/select";

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
  campusId: string;
  campusName: string;
}

interface CampusDirectoryBuilding {
  building: Building;
  campus: Campus;
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
  const [campusId, setCampusId] = useState("all");

  const { campuses = [], loading: isCampusLoading } = usePublishedCampus();

  // The student directory includes every published campus, while draft and
  // coming-soon campuses remain out of the public building list.
  const publishedCampuses = useMemo(
    () => campuses.filter((campus) => campus.lifecycleStatus === "published" || campus.publishStatus === "published"),
    [campuses],
  );

  const buildings = useMemo<CampusDirectoryBuilding[]>(
    () => publishedCampuses.flatMap((campus) =>
      (buildingsFromCampus(campus) as Building[]).map((building) => ({ building, campus })),
    ),
    [publishedCampuses],
  );

  const rooms = useMemo<DirectoryRoom[]>(() => {
    return publishedCampuses.flatMap((campus) =>
      campus.buildings
        .filter((building) => building.visible !== false)
        .flatMap((building) =>
          (building.floors ?? []).flatMap((floor) =>
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
                campusId: campus.id,
                campusName: campus.name,
              })),
          ),
        ),
    );
  }, [publishedCampuses]);

  const isLoading = isCampusLoading;

  // Debounce search for smoother filtering
  const debouncedSearch = useDebounce(search, 150);

  const campusBuildings = campusId === "all"
    ? buildings
    : buildings.filter(({ campus }) => campus.id === campusId);
  const campusRooms = campusId === "all"
    ? rooms
    : rooms.filter((room) => room.campusId === campusId);

  const filtered = campusBuildings
    .filter(({ building, campus }) => {
      const matchCat = matchesCategory(category, building.category, building.code, building.name);
      const q = debouncedSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        building.name.toLowerCase().includes(q) ||
        building.code.toLowerCase().includes(q) ||
        building.description.toLowerCase().includes(q) ||
        building.category.toLowerCase().includes(q) ||
        campus.name.toLowerCase().includes(q);
      return matchCat && matchSearch;
    })
    .sort((a, b) => a.building.name.localeCompare(b.building.name) || a.campus.name.localeCompare(b.campus.name));

  const normalizedSearch = debouncedSearch.toLocaleLowerCase().trim();
  const filteredRooms = normalizedSearch
    ? campusRooms.filter((room) => {
        if (!matchesCategory(category, room.buildingCategory, room.buildingCode, room.buildingName)) return false;
        return [room.name, room.type, room.buildingName, room.buildingCode, room.floorLabel, room.campusName]
          .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
      }).sort((a, b) =>
        a.name.localeCompare(b.name) || a.buildingName.localeCompare(b.buildingName) || a.floorNumber - b.floorNumber,
      )
    : [];

  const selectedCampusName = publishedCampuses.find((campus) => campus.id === campusId)?.name;
  const activeFilters = [category !== "all" && category, campusId !== "all" && campusId, search].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setCampusId("all");
  };

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
                  Browse {buildings.length} buildings and {rooms.length} rooms, facilities, and services across {publishedCampuses.length} campuses.
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
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)]">
            <div className="min-w-0">
              <SearchBar
                placeholder="Search buildings, rooms, campuses, codes, or categories..."
                value={search}
                onSearch={setSearch}
                onClear={() => setSearch("")}
                showShortcutHint
                size="md"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="campus-filter" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Campus
              </label>
              <Select value={campusId} onValueChange={setCampusId}>
                <SelectTrigger
                  id="campus-filter"
                  aria-label="Filter buildings by campus"
                  title={selectedCampusName ?? "All campuses"}
                  className="h-11 w-full min-w-0 rounded-xl border-border bg-card px-3.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/35 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 data-[state=open]:border-primary/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/10"
                >
                  <SelectValue placeholder="All campuses" className="min-w-0 truncate" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={6}
                  style={{ maxHeight: "min(18rem, var(--radix-select-content-available-height))" }}
                  className="max-h-[min(18rem,var(--radix-select-content-available-height))] rounded-xl border-border/90 bg-popover p-1.5 shadow-xl"
                >
                  <SelectItem value="all" className="min-h-10 rounded-lg px-3 py-2 text-sm focus:bg-primary/10 focus:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary">
                    All campuses
                  </SelectItem>
                  {publishedCampuses.map((campus) => (
                    <SelectItem
                      key={campus.id}
                      value={campus.id}
                      title={campus.name}
                      className="min-h-10 rounded-lg px-3 py-2 text-sm focus:bg-primary/10 focus:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
                    >
                      <span className="block min-w-0 truncate">{campus.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category filters */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
              <span>Filter by category</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORIES.map(({ value, label, icon: CatIcon }) => (
                <button
                  key={value}
                  onClick={() => setCategory(value)}
                  aria-pressed={category === value}
                  className={cn(
                    "flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-bold transition-all duration-150 sm:px-3.5 sm:text-xs",
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
                  {selectedCampusName && (
                    <span> at <span className="font-extrabold text-foreground">{selectedCampusName}</span></span>
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
                  {selectedCampusName && (
                    <span> at <span className="font-extrabold text-foreground">{selectedCampusName}</span></span>
                  )}
                </>
              )}
            </p>
            {activeFilters > 0 && !isLoading && (
              <button
                onClick={clearFilters}
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
                        key={`${room.campusId}:${room.buildingId}:${room.id}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.025 }}
                      >
                        <Link
                          to={`/map?campusId=${encodeURIComponent(room.campusId)}&buildingId=${encodeURIComponent(room.buildingId)}`}
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
                              {room.buildingName} · {room.floorLabel} · {room.campusName}
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
                {filtered.map(({ building, campus }, i) => (
                  <motion.div
                    key={`${campus.id}:${building.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <BuildingCard building={building} campusId={campus.id} campusName={campus.name} />
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
                  onClick={clearFilters}
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
