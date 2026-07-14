import { useState, useEffect } from "react";
import { Building2, Navigation, X, MapPin, Search, Bookmark, Heart, ChevronRight, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MOCK_BUILDINGS } from "../data/mockData";
import { Link, useNavigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { EmptyState } from "../components/ui/EmptyState";
import { cn } from "../lib/utils";

const INITIAL_SAVED = ["b2", "b3", "b5"];

export function StudentFavoritesPage() {
  const studentAuth = useStudentAuth();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const [savedIds, setSavedIds] = useState<string[]>(INITIAL_SAVED);
  const [search, setSearch] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (!studentAuth) {
    navigate("/admin");
    return null;
  }

  const savedBuildings = MOCK_BUILDINGS.filter(b => savedIds.includes(b.id));
  const filtered = search.trim()
    ? savedBuildings.filter(b =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.code.toLowerCase().includes(search.toLowerCase())
      )
    : savedBuildings;

  const remove = (id: string) => {
    setRemovingId(id);
    setTimeout(() => {
      setSavedIds(prev => prev.filter(x => x !== id));
      setRemovingId(null);
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
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative group"
            >
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-primary" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search saved locations…"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all bg-input-background"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </motion.div>
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
            <div className="text-center py-16 text-sm text-muted-foreground">
              <p>No results for &ldquo;{search}&rdquo;</p>
              <button onClick={() => setSearch("")} className="text-primary font-bold hover:underline mt-2">
                Clear search
              </button>
            </div>
          ) : (
            <AnimatePresence>
              <div className="space-y-2.5">
                {filtered.map(b => (
                  <motion.div
                    key={b.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{
                      opacity: removingId === b.id ? 0 : 1,
                      y: removingId === b.id ? -10 : 0,
                      scale: removingId === b.id ? 0.95 : 1,
                    }}
                    exit={{ opacity: 0, x: 100 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="surface-card surface-card-interactive flex items-center gap-4 px-4 py-4 rounded-2xl"
                  >
                    {b.image_url ? (
                      <img src={b.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 ring-1 ring-border" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-primary/10">
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
                        to="/map"
                        className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-border text-xs font-bold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline text-[10px]">Navigate</span>
                      </Link>
                      <button
                        onClick={() => remove(b.id)}
                        className="flex items-center justify-center h-9 w-9 rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
                        title="Remove from favorites"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}

                <Link
                  to="/map"
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed text-xs font-semibold transition-all hover:border-primary/30 hover:text-primary hover:bg-primary/5 text-muted-foreground mt-2"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Browse map to add more
                </Link>
              </div>
            </AnimatePresence>
          )}
        </div>
        {/* Safe area spacer for bottom nav */}
        <div className="h-6 md:hidden" />
      </div>
    </PageTransition>
  );
}
