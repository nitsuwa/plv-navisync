import { useState, useEffect, useMemo } from "react";
import { Building2, Navigation, MapPin, Search, Bookmark, Trash2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { SearchBar } from "../components/ui/SearchBar";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { usePublishedCampus } from "../hooks";
import { buildingsFromCampus } from "../lib/mapDataAdapter";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonList } from "../components/ui/Skeleton";
import { BuildingDetailModal } from "../components/ui/BuildingDetailModal";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useToast } from "../hooks/useToast";
import type { Building } from "../types";
import type { CampusMarker } from "../components/map-builder/types";

// ═════════════════════════════════════════════════════════════════════════════
// ── Scroll-reveal wrapper ───────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function Reveal({ children, className, delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? "translateY(0)" : "translateY(24px)",
      transition: visible
        ? `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`
        : "opacity 0.3s ease, transform 0.3s ease",
    }}>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Section label ───────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-extrabold uppercase tracking-widest mb-4">
      <Sparkles className="h-3 w-3" />
      {children}
    </div>
  );
}

import { studentAccountService } from "../services/studentAccountService";

export function StudentFavoritesPage() {
  const { loading: authLoading, isStudent } = useStudentAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { activeCampus } = usePublishedCampus();
  const campusBuildings: Building[] = useMemo(() => {
    if (activeCampus) return buildingsFromCampus(activeCampus) as Building[];
    return [];
  }, [activeCampus]);
  const buildingScope = campusBuildings.map((building) => building.id).join("|");
  const [savedBuildings, setSavedBuildings] = useState<Building[]>([]);
  const [savedCampusPlaceIds, setSavedCampusPlaceIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [search, setSearch] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const savedCampusPlaces: CampusMarker[] = useMemo(() => (activeCampus?.markers ?? [])
    .filter((place) => savedCampusPlaceIds.includes(place.id)), [activeCampus?.markers, savedCampusPlaceIds]);
  const savedCount = savedBuildings.length + savedCampusPlaces.length;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    let mounted = true;
    Promise.all([
      studentAccountService.getSavedBuildings(campusBuildings),
      studentAccountService.getSavedCampusPlaceIdsAsync(),
    ])
      .then(([res, placeIds]) => {
        if (mounted) {
          setSavedBuildings(res);
          setSavedCampusPlaceIds(placeIds);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadError("Favorites are temporarily unavailable.");
          toast.error("Favorites could not be loaded");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [buildingScope, activeCampus?.markers, retryNonce]);

  if (authLoading || loading) return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-5 py-6">
        <SkeletonList count={4} />
      </div>
    </PageTransition>
  );

  if (!isStudent) {
    navigate("/admin");
    return null;
  }

  const filtered = search.trim()
    ? savedBuildings.filter((b) =>
        `${b.name} ${b.code} ${b.category} ${activeCampus?.name ?? ""} building`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : savedBuildings;
  const filteredCampusPlaces = search.trim()
    ? savedCampusPlaces.filter((place) => `${place.name} ${place.type} ${place.studentInfo?.description ?? ""} ${activeCampus?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    : savedCampusPlaces;

  const remove = async (id: string) => {
    const building = savedBuildings.find((b) => b.id === id);
    setRemovingId(id);
    try {
      await studentAccountService.toggleSaveBuilding(id, activeCampus?.id);
      setTimeout(() => {
        setSavedBuildings((prev) => prev.filter((x) => x.id !== id));
        setRemovingId(null);
        toast.success(`${building?.name || "Location"} removed from Favorites`, {
          action: { label: "Undo", onClick: () => {
            void studentAccountService.toggleSaveBuilding(id, activeCampus?.id).then(() => {
              if (building) setSavedBuildings((prev) => prev.some((item) => item.id === id) ? prev : [building, ...prev]);
            }).catch(() => toast.error("Favorite could not be restored"));
          } },
        });
      }, 300);
    } catch {
      setRemovingId(null);
      toast.error("Favorite could not be removed");
    }
  };

  const removeCampusPlace = async (place: CampusMarker) => {
    setRemovingId(place.id);
    try {
      await studentAccountService.toggleSaveCampusPlace(place.id, activeCampus?.id ?? "");
      setSavedCampusPlaceIds((current) => current.filter((id) => id !== place.id));
      setRemovingId(null);
      toast.success(`${place.name || "Campus place"} removed from Favorites`, {
        action: { label: "Undo", onClick: () => {
          void studentAccountService.toggleSaveCampusPlace(place.id, activeCampus?.id ?? "").then(() => {
            setSavedCampusPlaceIds((current) => current.includes(place.id) ? current : [place.id, ...current]);
          }).catch(() => toast.error("Favorite could not be restored"));
        } },
      });
    } catch {
      setRemovingId(null);
      toast.error("Favorite could not be removed");
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen">
        <StudentPageHeader
          backTo="/student"
          title="Favorite Locations"
          subtitle={`${savedCount} saved ${savedCount === 1 ? "location" : "locations"}`}
          icon={Bookmark}
        />

        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 space-y-4">
          {savedCount > 0 && (
            <Reveal>
              <div className="space-y-4">
                {/* Section badge */}
                <SectionLabel>Saved Places</SectionLabel>

                <div className="max-w-sm">
                  <SearchBar
                    placeholder="Search saved locations…"
                    value={search}
                    onSearch={setSearch}
                    onClear={() => setSearch("")}
                    size="md"
                  />
                </div>
              </div>
            </Reveal>
          )}

          {loadError && savedCount === 0 ? (
            <Reveal>
              <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">Could not load favorites</p>
                <p className="text-sm text-muted-foreground max-w-sm mb-5">{loadError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoadError(null);
                    setLoading(true);
                    setRetryNonce((value) => value + 1);
                  }}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              </div>
            </Reveal>
          ) : filtered.length === 0 && filteredCampusPlaces.length === 0 && savedCount === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No favorite locations yet"
              description="Save buildings and campus places from the map and they will appear here for quick access."
              action={
                <Link
                  to="/map"
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.97] transition-all"
                >
                  <MapPin className="h-4 w-4" />
                  Open Map
                </Link>
              }
            />
          ) : filtered.length === 0 && filteredCampusPlaces.length === 0 ? (
            <Reveal>
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">No results for &ldquo;{search}&rdquo;</p>
                <button type="button" onClick={() => setSearch("")} className="text-xs font-bold text-primary hover:underline mt-1">
                  Clear search
                </button>
              </div>
            </Reveal>
          ) : (
            <AnimatePresence>
              <div className="space-y-2.5">
                {filteredCampusPlaces.map((place, i) => (
                  <Reveal key={place.id} delay={i * 30}>
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: removingId === place.id ? 0 : 1, y: removingId === place.id ? -10 : 0, scale: removingId === place.id ? 0.95 : 1 }}
                      exit={{ opacity: 0, x: 100 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="group flex flex-col items-stretch gap-3 px-4 py-4 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-primary/15 hover:shadow-sm transition-all duration-200 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="hidden sm:flex w-14 h-14 rounded-xl items-center justify-center shrink-0 bg-primary/10 group-hover:scale-105 transition-transform"><MapPin className="h-7 w-7 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="break-words text-sm font-bold text-foreground">{place.name || "Campus place"}</p>
                        <p className="mt-0.5 text-xs capitalize text-muted-foreground">{place.studentInfo?.gateType?.replaceAll("_", " ") || (place.type === "gate" ? "Gate" : "Landmark")} · {activeCampus?.name || "Campus"}</p>
                      </div>
                      <div className="flex w-full items-center justify-end gap-2 shrink-0 sm:w-auto">
                        <Link to={`/map?campusId=${encodeURIComponent(activeCampus?.id ?? "")}&destinationPlaceId=${encodeURIComponent(place.id)}`} className="inline-flex h-10 min-w-28 items-center justify-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground"><Navigation className="h-3.5 w-3.5" />Navigate</Link>
                        <button onClick={() => void removeCampusPlace(place)} aria-label={`Remove ${place.name} from favorites`} className="flex items-center justify-center h-9 w-9 rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all" title="Remove from favorites"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </motion.div>
                  </Reveal>
                ))}
                {filtered.map((b, i) => (
                  <Reveal key={b.id} delay={i * 30}>
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{
                        opacity: removingId === b.id ? 0 : 1,
                        y: removingId === b.id ? -10 : 0,
                        scale: removingId === b.id ? 0.95 : 1,
                      }}
                      exit={{ opacity: 0, x: 100 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a,button")) return;
                        setSelectedBuilding(b);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedBuilding(b);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open details for ${b.name}`}
                      className="group flex flex-col items-stretch gap-3 px-4 py-4 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-primary/15 hover:shadow-sm transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:flex-row sm:items-center sm:gap-4"
                    >
                      {b.image_url ? (
                        <img src={b.image_url} alt={`${b.name} thumbnail`} className="w-14 h-14 rounded-xl object-cover shrink-0 ring-1 ring-border" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 group-hover:scale-105 transition-transform">
                          <Building2 className="h-7 w-7 text-primary" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="break-words text-sm font-bold text-foreground">{b.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{b.category.replaceAll("_", " ")} · {activeCampus?.name || "Campus"}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{b.code}</p>
                        {b.operating_hours && (
                          <p className="text-[11px] text-muted-foreground mt-1">{b.operating_hours}</p>
                        )}
                      </div>

                      <div className="flex w-full items-center justify-end gap-2 shrink-0 sm:w-auto">
                        <Link
                          to={`/map?destinationBuildingId=${encodeURIComponent(b.id)}`}
                          className="inline-flex h-10 min-w-28 items-center justify-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          <span>Navigate</span>
                        </Link>
                        <button
                          onClick={() => remove(b.id)}
                          aria-label={`Remove ${b.name} from favorites`}
                          className="flex items-center justify-center h-9 w-9 rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
                          title="Remove from favorites"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  </Reveal>
                ))}

                <Link
                  to="/map"
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border text-xs font-semibold transition-all hover:border-primary/30 hover:text-primary hover:bg-primary/5 text-muted-foreground mt-2"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Browse map to add more
                </Link>
              </div>
            </AnimatePresence>
          )}
        </div>
        {/* ══ BUILDING DETAIL MODAL ══ */}
        <BuildingDetailModal
          building={selectedBuilding}
          onClose={() => setSelectedBuilding(null)}
          isSaved={true}
          onToggleSave={remove}
          campusId={activeCampus?.id}
        />

        {/* Safe area spacer */}
        <div className="h-6 md:hidden" />
      </div>
    </PageTransition>
  );
}
