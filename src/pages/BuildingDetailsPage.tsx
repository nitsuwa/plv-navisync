import { useParams, Link } from "react-router";
import { useState, useEffect } from "react";
import {
  ArrowLeft, MapPin, Clock, Phone, Building2, Navigation, Layers, Users,
  ChevronRight, Bookmark, Share2, Flag, Info, CheckCircle2, Map,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MOCK_BUILDINGS } from "../data/mockData";
import { BuildingCategoryBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { BuildingCard } from "../components/ui/BuildingCard";
import { PageTransition } from "../components/ui/PageTransition";
import { Skeleton } from "../components/ui/Skeleton";
import { cn } from "../lib/utils";
import { Reveal } from "../components/ui/Reveal";

type Tab = "about" | "departments" | "facilities" | "accessibility";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "about", label: "About", icon: Info },
  { key: "departments", label: "Departments", icon: Users },
  { key: "facilities", label: "Facilities", icon: Layers },
  { key: "accessibility", label: "Accessibility", icon: Map },
];

export function BuildingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    window.scrollTo({ top: 0, behavior: "instant" });
    return () => clearTimeout(timer);
  }, [id]);

  const building = MOCK_BUILDINGS.find((b) => b.id === id);
  const related = MOCK_BUILDINGS.filter(
    (b) => b.id !== id && b.category === building?.category
  ).slice(0, 3);

  if (!isLoading && !building) {
    return (
      <PageTransition>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 px-5 text-center">
          <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center border border-border">
            <Building2 className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-foreground mb-1">Building Not Found</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              The building you are looking for doesn't exist or may have been removed.
            </p>
          </div>
          <Link to="/buildings">
            <Button variant="primary">Back to Buildings</Button>
          </Link>
        </div>
      </PageTransition>
    );
  }

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <PageTransition>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <Skeleton className="h-4 w-32 mb-8" />
          <Skeleton variant="rectangular" className="h-64 sm:h-80 mb-8 w-full" />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <Skeleton variant="rectangular" className="h-48 w-full" />
              <Skeleton variant="rectangular" className="h-32 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton variant="rectangular" className="h-64 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-5 flex-wrap">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/buildings" className="hover:text-primary transition-colors">Buildings</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-bold">{building!.code}</span>
        </nav>

        <Link
          to="/buildings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Buildings
        </Link>

        {/* ── Hero Image ── */}
        <Reveal>
          <div className="relative rounded-3xl overflow-hidden h-64 sm:h-80 mb-8 shadow-lg"
        >
          {building!.image_url ? (
            <>
              <img
                src={building!.image_url}
                alt={building!.name}
                className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-muted">
              <Building2 className="h-20 w-20 text-muted-foreground/30" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-4 left-4 flex flex-wrap gap-2">
            <span className="bg-primary/90 backdrop-blur-sm text-primary-foreground font-mono font-extrabold px-3 py-1.5 rounded-xl text-sm shadow-sm">
              {building!.code}
            </span>
            <BuildingCategoryBadge category={building!.category} />
          </div>

          {/* Bottom content */}
          <div className="absolute bottom-5 left-5 right-5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-2 drop-shadow-lg">
              {building!.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> PLV Campus
              </span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span>{building!.floor_count} floor{building!.floor_count !== 1 ? "s" : ""}</span>
              {building!.operating_hours && (
                <>
                  <span className="w-1 h-1 rounded-full bg-white/40" />
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> {building!.operating_hours}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        </Reveal>

        {/* ── Action bar ── */}
        <Reveal delay={80}>
          <div className="flex flex-wrap gap-2 mb-6"
        >
          <Button variant="primary" size="md">
            <Navigation className="h-4 w-4" /> Get Directions
          </Button>
          <Link to="/map">
            <Button variant="outline" size="md">
              <MapPin className="h-4 w-4" /> View on Map
            </Button>
          </Link>
          <Button
            variant="outline"
            size="md"
            onClick={() => setIsSaved(!isSaved)}
            className={cn(isSaved && "border-accent/50 text-accent bg-accent/5")}
          >
            <Bookmark className={cn("h-4 w-4", isSaved && "fill-current")} />
            {isSaved ? "Saved" : "Save"}
          </Button>
          <Button variant="outline" size="md">
            <Share2 className="h-4 w-4" /> Share
          </Button>
        </div>
        </Reveal>

        {/* ── Main content ── */}
        <Reveal delay={120}>
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Tabs */}
          <div className="lg:col-span-2 space-y-5">
            {/* Tab navigation */}
            <div className="flex gap-1 p-1 rounded-2xl bg-muted/60 border border-border">
              {TABS.map(({ key, label, icon: TabIcon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-1 justify-center",
                    activeTab === key
                      ? "bg-card text-primary shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "about" && (
                  <div className="surface-card p-6 space-y-4">
                    <h2 className="font-extrabold text-foreground flex items-center gap-2">
                      <span className="w-1 h-5 rounded-full bg-primary inline-block" />
                      About This Building
                    </h2>
                    <p className="text-muted-foreground leading-relaxed text-sm">
                      {building!.description}
                    </p>
                    {building!.contact && (
                      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-muted/60 border border-border">
                        <Phone className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground font-semibold">{building!.contact}</span>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "departments" && (
                  <div className="surface-card p-6">
                    <h2 className="font-extrabold text-foreground mb-4 flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Departments & Offices
                    </h2>
                    {building!.departments?.length ? (
                      <div className="space-y-1">
                        {building!.departments.map((dept, i) => (
                          <motion.div
                            key={dept}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
                          >
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Building2 className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-sm font-semibold text-foreground">{dept}</span>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">No departments listed.</p>
                    )}
                  </div>
                )}

                {activeTab === "facilities" && (
                  <div className="surface-card p-6">
                    <h2 className="font-extrabold text-foreground mb-4 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" /> Facilities
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {["Lecture Rooms", "Computer Labs", "Faculty Offices", "Study Rooms", "Conference Rooms"].map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-muted border border-border text-muted-foreground hover:border-primary/20 hover:text-foreground transition-colors"
                        >
                          <CheckCircle2 className="h-3 w-3 text-primary/60" />
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "accessibility" && (
                  <div className="surface-card p-6">
                    <h2 className="font-extrabold text-foreground mb-4 flex items-center gap-2">
                      <Map className="h-4 w-4 text-primary" /> Accessibility Features
                    </h2>
                    <div className="space-y-2">
                      {["Wheelchair Ramp", "Elevator Access", "Accessible Restroom", "Wide Corridors"].map((a) => (
                        <div
                          key={a}
                          className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-green-50/60 dark:bg-green-900/10 border border-green-200/60 dark:border-green-800/20 text-sm text-foreground"
                        >
                          <span className="text-green-500 text-base">♿</span>
                          {a}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            <div className="surface-card p-5 space-y-4">
              <h3 className="font-extrabold text-foreground text-sm">Building Information</h3>
              <div className="space-y-3 text-sm">
                {[
                  { icon: MapPin, label: "Location", value: "PLV Campus, Tongco St., Valenzuela City" },
                  { icon: Layers, label: "Floors", value: `${building!.floor_count} ${building!.floor_count === 1 ? "floor" : "floors"}` },
                  ...(building!.operating_hours ? [{ icon: Clock, label: "Hours", value: building!.operating_hours }] : []),
                  ...(building!.contact ? [{ icon: Phone, label: "Contact", value: building!.contact }] : []),
                ].map(({ icon: InfoIcon, label, value }) => (
                  <div key={label} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <InfoIcon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-xs uppercase tracking-wide mb-0.5">{label}</p>
                      <p className="text-muted-foreground leading-snug">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="surface-card p-4 space-y-2">
              <Link
                to="/map"
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                <Navigation className="h-4 w-4" /> Get Directions
              </Link>
              <Link
                to="/map"
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted transition-all"
              >
                <MapPin className="h-4 w-4" /> View on Map
              </Link>
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20 transition-all">
                <Flag className="h-4 w-4" /> Report Issue
              </button>
            </div>
          </div>
        </div>
        </Reveal>

        {/* ── Related Buildings ── */}
        {related.length > 0 && (
          <Reveal delay={160}>
            <div className="mt-12"
          >
            <div className="flex items-center gap-2.5 mb-6">
              <span className="w-1 h-6 rounded-full bg-accent inline-block" />
              <h2 className="text-xl font-extrabold text-foreground">Related Buildings</h2>
              <span className="text-xs text-muted-foreground font-medium">— Similar {building!.category} buildings</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {related.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  <BuildingCard building={b} />
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>
        )}
      </div>
    </PageTransition>
  );
}
