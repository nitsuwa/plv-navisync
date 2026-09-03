import { useState, useEffect } from "react";
import { Building2, Navigation, MapPin, Search, Bookmark, Trash2, Sparkles } from "lucide-react";
import { SearchBar } from "../components/ui/SearchBar";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonList } from "../components/ui/Skeleton";
import { BuildingDetailModal } from "../components/ui/BuildingDetailModal";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useToast } from "../hooks/useToast";
import type { Building } from "../types";

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savedBuildings, setSavedBuildings] = useState<Building[]>([]);
  const [search, setSearch] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    let mounted = true;
    studentAccountService.getSavedBuildings().then((res) => {
      if (mounted) {
        setSavedBuildings(res);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

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
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.code.toLowerCase().includes(search.toLowerCase())
      )
    : savedBuildings;

  const toast = useToast();

  const remove = async (id: string) => {
    const building = savedBuildings.find((b) => b.id === id);
    setRemovingId(id);
    await studentAccountService.toggleSaveBuilding(id);
    setTimeout(() => {
      setSavedBuildings((prev) => prev.filter((x) => x.id !== id));
      setRemovingId(null);
      toast.success(`${building?.name || "Location"} removed from favorites`);
    }, 300);
  };

  return (
    <PageTransition>
      <div className="min-h-screen">
        <StudentPageHeader
          backTo="/student"
          title="Favorite Locations"
          subtitle={`${savedBuildings.length} saved ${savedBuildings.length === 1 ? "location" : "locations"}`}
          icon={Bookmark}
        />

        <div className="max-w-2xl mx-auto px-5 py-6 space-y-4">
          {savedBuildings.length > 0 && (
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

          {filtered.length === 0 && savedBuildings.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No favorite locations yet"
              description="Save buildings from the map and they will appear here for quick access."
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
          ) : filtered.length === 0 ? (
            <Reveal>
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">No results for &ldquo;{search}&rdquo;</p>
                <button onClick={() => setSearch("")} className="text-xs font-bold text-primary hover:underline mt-1">
                  Clear search
                </button>
              </div>
            </Reveal>
          ) : (
            <AnimatePresence>
              <div className="space-y-2.5">
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
                      onClick={() => setSelectedBuilding(b)}
                      className="group flex items-center gap-4 px-4 py-4 rounded-2xl border border-border/60 bg-card/50 hover:bg-card hover:border-primary/15 hover:shadow-sm transition-all duration-200 cursor-pointer"
                    >
                      {b.image_url ? (
                        <img src={b.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 ring-1 ring-border" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 group-hover:scale-105 transition-transform">
                          <Building2 className="h-7 w-7 text-primary" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{b.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{b.code}</p>
                        {b.operating_hours && (
                          <p className="text-[11px] text-muted-foreground mt-1">{b.operating_hours}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          to={`/map?buildingId=${b.id}`}
                          className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-border text-xs font-bold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline text-[10px]">Navigate</span>
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
        />

        {/* Safe area spacer */}
        <div className="h-6 md:hidden" />
      </div>
    </PageTransition>
  );
}
