import { useParams, Link, useNavigate, useSearchParams } from "react-router";
import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, MapPin, Clock, Phone, Building2, Navigation, Layers, Users,
  ChevronRight, ChevronDown, Bookmark, Share2, Flag, Info, CheckCircle2,
  Accessibility, DoorOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { usePublishedCampus } from "../hooks";
import { buildingsFromCampus, facilitiesFromCampus, accessibilityFromCampus } from "../lib/mapDataAdapter";
import { BuildingCategoryBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { BuildingCard } from "../components/ui/BuildingCard";
import { EmptyState } from "../components/ui/EmptyState";
import { PageTransition } from "../components/ui/PageTransition";
import { Skeleton } from "../components/ui/Skeleton";
import { cn } from "../lib/utils";
import { Reveal } from "../components/ui/Reveal";
import { getOpenStatus } from "../lib/buildingHours";
import type { Building } from "../types";
import { studentAccountService } from "../services/studentAccountService";
import { ReportModal } from "../components/map/ReportModal";
import { useToast } from "../hooks/useToast";

type Tab = "about" | "rooms" | "departments";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "about", label: "About", icon: Info },
  { key: "rooms", label: "Rooms", icon: DoorOpen },
  { key: "departments", label: "Departments", icon: Users },
];

export function BuildingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [expandedRoomFloors, setExpandedRoomFloors] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [saving, setSaving] = useState(false);
  // Resolve the campus from the link so building IDs remain unambiguous across campuses.
  const [searchParams] = useSearchParams();
  const requestedCampusId = searchParams.get("campusId");
  const { campuses = [], activeCampus = null, loading: campusesLoading = false } = usePublishedCampus();
  const publishedCampuses = useMemo(
    () => campuses.filter((campus) => campus.lifecycleStatus === "published" || campus.publishStatus === "published"),
    [campuses],
  );

  const buildingCampus = useMemo(() => {
    const containsBuilding = (campus: typeof publishedCampuses[number]) => campus.buildings.some((item) => item.id === id);
    return (requestedCampusId
      ? publishedCampuses.find((campus) => campus.id === requestedCampusId && containsBuilding(campus))
      : undefined)
      ?? publishedCampuses.find((campus) => campus.id === activeCampus?.id && containsBuilding(campus))
      ?? publishedCampuses.find(containsBuilding)
      ?? null;
  }, [activeCampus?.id, id, publishedCampuses, requestedCampusId]);

  // Resolve the building and its related details from the campus in the link.
  const buildings: Building[] = useMemo(() => {
    if (buildingCampus) {
      return buildingsFromCampus(buildingCampus) as Building[];
    }
    return [];
  }, [buildingCampus]);

  const buildingFacilities: Record<string, string[]> = useMemo(() => {
    if (buildingCampus) {
      return facilitiesFromCampus(buildingCampus);
    }
    return {};
  }, [buildingCampus]);

  const buildingAccessibility: Record<string, string[]> = useMemo(() => {
    if (buildingCampus) {
      return accessibilityFromCampus(buildingCampus);
    }
    return {};
  }, [buildingCampus]);

  useEffect(() => {
    setIsLoading(true);
    setExpandedRoomFloors(new Set());
    const timer = setTimeout(() => setIsLoading(false), 300);
    window.scrollTo({ top: 0, behavior: "instant" });
    return () => clearTimeout(timer);
  }, [id]);

  const building = buildings.find((b) => b.id === id);
  const roomGroups = useMemo(() => {
    const campusBuilding = buildingCampus?.buildings.find((item) => item.id === id);
    return (campusBuilding?.floors ?? [])
      .map((floor) => ({
        id: floor.id,
        number: floor.number,
        label: floor.label || `Floor ${floor.number}`,
        rooms: (floor.rooms ?? [])
          .filter((room) => room.visible !== false && room.name.trim().length > 0)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((floor) => floor.rooms.length > 0)
      .sort((a, b) => a.number - b.number);
  }, [buildingCampus, id]);
  const roomCount = roomGroups.reduce((total, floor) => total + floor.rooms.length, 0);
  const related = buildings.filter(
    (b) => b.id !== id && b.category === building?.category
  ).slice(0, 3);
  const bHours = building ? getOpenStatus(building) : null;
  const campusQuery = buildingCampus ? `campusId=${encodeURIComponent(buildingCampus.id)}&` : "";
  const campusSearch = buildingCampus ? `?campusId=${encodeURIComponent(buildingCampus.id)}` : "";
  const mapHref = building
    ? `/map?${campusQuery}buildingId=${encodeURIComponent(building.id)}`
    : "/map";
  const campusLocationLabel = [buildingCampus?.name, buildingCampus?.address, buildingCampus?.city]
    .filter(Boolean)
    .join(", ") || "Campus";

  useEffect(() => {
    if (!building) return;
    let mounted = true;
    void studentAccountService.getSavedBuildings([building])
      .then((saved) => {
        if (mounted) setIsSaved(saved.length > 0);
      })
      .catch(() => {
        if (mounted) setIsSaved(false);
      });
    return () => {
      mounted = false;
    };
  }, [building, buildingCampus?.id]);

  const handleToggleSave = async () => {
    if (!building || saving) return;
    const next = !isSaved;
    setIsSaved(next);
    setSaving(true);
    try {
      await studentAccountService.toggleSaveBuilding(building.id, buildingCampus?.id);
      success(next ? "Saved to favorites" : "Removed from favorites");
    } catch {
      setIsSaved(!next);
      showError("Favorite could not be updated");
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!building) return;
    const shareText = `${building.name} (${building.code}) — PLV NaviSync`;
    try {
      if (navigator.share) {
        await navigator.share({ title: building.name, text: shareText, url: `${window.location.origin}/buildings/${encodeURIComponent(building.id)}${campusSearch}` });
      } else {
        await navigator.clipboard?.writeText(shareText);
      }
      success("Building link ready");
    } catch {
      showError("Building link could not be shared");
    }
  };


  if (!isLoading && !campusesLoading && !building) {
    return (
      <PageTransition>
        <EmptyState
          icon={Building2}
          title="Building Not Found"
          description="The building you are looking for doesn't exist or may have been removed from the campus directory."
          action={
            <Link to="/buildings">
              <Button variant="primary">Back to Buildings</Button>
            </Link>
          }
        />
      </PageTransition>
    );
  }

  // ── Loading skeleton ──
  if (isLoading || campusesLoading) {
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
        <nav
          aria-label="Breadcrumb"
          className="mb-5 w-full min-w-0 overflow-x-auto text-xs text-muted-foreground no-scrollbar"
        >
          <ol className="m-0 flex w-max min-w-full list-none flex-nowrap items-center gap-1.5 whitespace-nowrap p-0">
            <li className="flex shrink-0 items-center gap-1.5">
              <Link to="/" className="transition-colors hover:text-primary">Home</Link>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            </li>
            <li className="flex shrink-0 items-center gap-1.5">
              <Link to="/buildings" className="transition-colors hover:text-primary">Buildings</Link>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            </li>
            <li aria-current="page" className="max-w-[40vw] truncate font-bold text-foreground sm:max-w-64">
              {building!.code}
            </li>
          </ol>
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
                <MapPin className="h-3.5 w-3.5" /> {buildingCampus?.name ?? "Campus"}
              </span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span>{building!.floor_count} floor{building!.floor_count !== 1 ? "s" : ""}</span>
              {bHours?.status && (
                <>
                  <span className="w-1 h-1 rounded-full bg-white/40" />
                  <span
                    className={cn(
                      "flex items-center gap-1.5 font-bold",
                      bHours.status === "Open" && "text-green-300",
                      bHours.status === "Busy" && "text-amber-300",
                      bHours.status === "Closed" && "text-red-300"
                    )}
                    title={bHours.label}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        bHours.status === "Open" && "bg-green-400",
                        bHours.status === "Busy" && "bg-amber-400",
                        bHours.status === "Closed" && "bg-red-400"
                      )}
                    />
                    {bHours.status}
                  </span>
                </>
              )}
              {bHours?.hoursLabel && (
                <>
                  <span className="w-1 h-1 rounded-full bg-white/40" />
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> {bHours.hoursLabel}
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
          <Button variant="primary" size="md" onClick={() => navigate(mapHref)}>
            <Navigation className="h-4 w-4" /> Get Directions
          </Button>
          <Link to={mapHref}>
            <Button variant="outline" size="md">
              <MapPin className="h-4 w-4" /> View on Map
            </Button>
          </Link>
          <Button
            variant="outline"
            size="md"
            onClick={() => void handleToggleSave()}
            disabled={saving}
            className={cn(isSaved && "border-accent/50 text-accent bg-accent/5")}
          >
            <Bookmark className={cn("h-4 w-4", isSaved && "fill-current")} />
            {isSaved ? "Saved" : "Save"}
          </Button>
          <Button variant="outline" size="md" onClick={() => void handleShare()}>
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
            <div role="tablist" aria-label="Building information" className="flex gap-1 p-1 rounded-2xl bg-muted/60 border border-border">
              {TABS.map(({ key, label, icon: TabIcon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  aria-label={label}
                  tabIndex={activeTab === key ? 0 : -1}
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
                  <div className="surface-card p-5 sm:p-6 space-y-5">
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
                    <section className="border-t border-border pt-4" aria-labelledby="building-facilities-title">
                      <h3 id="building-facilities-title" className="mb-3 flex items-center gap-2 text-sm font-extrabold text-foreground">
                        <Layers className="h-4 w-4 text-primary" /> Facilities
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(buildingFacilities[building!.id] ?? ["General Facilities", "Study Areas"]).map((facility) => (
                          <span
                            key={facility}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                          >
                            <CheckCircle2 className="h-3 w-3 text-primary/70" />
                            {facility}
                          </span>
                        ))}
                      </div>
                    </section>
                    <section className="border-t border-border pt-4" aria-labelledby="building-accessibility-title">
                      <h3 id="building-accessibility-title" className="mb-3 flex items-center gap-2 text-sm font-extrabold text-foreground">
                        <Accessibility className="h-4 w-4 text-green-500" /> Accessibility
                      </h3>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {(buildingAccessibility[building!.id] ?? ["Standard Access"]).map((feature) => (
                          <li
                            key={feature}
                            className="flex items-center gap-2.5 rounded-xl border border-green-200/60 bg-green-50/60 px-3.5 py-3 text-sm text-foreground dark:border-green-800/20 dark:bg-green-900/10"
                          >
                            <Accessibility className="h-4 w-4 shrink-0 text-green-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                )}

                {activeTab === "rooms" && (
                  <div className="surface-card p-4 sm:p-6">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="flex items-center gap-2 font-extrabold text-foreground">
                        <DoorOpen className="h-4 w-4 text-primary" /> Rooms & Spaces
                      </h2>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                        {roomCount} {roomCount === 1 ? "room" : "rooms"}
                      </span>
                    </div>
                    {roomGroups.length > 0 ? (
                      <div className="space-y-5">
                        {roomGroups.map((floor) => (
                          <section key={floor.id} aria-labelledby={`rooms-floor-${floor.id}`}>
                            <div className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-2">
                              <div className="min-w-0">
                                <h3 id={`rooms-floor-${floor.id}`} className="text-sm font-bold text-foreground">
                                  {floor.label}
                                </h3>
                                <span className="text-xs text-muted-foreground">
                                  {floor.rooms.length} {floor.rooms.length === 1 ? "space" : "spaces"}
                                </span>
                              </div>
                              <button
                                type="button"
                                aria-expanded={expandedRoomFloors.has(floor.id)}
                                aria-controls={`floor-rooms-${floor.id}`}
                                aria-label={`${expandedRoomFloors.has(floor.id) ? "Hide" : "Show"} rooms on ${floor.label}`}
                                onClick={() => setExpandedRoomFloors((current) => {
                                  const next = new Set(current);
                                  if (next.has(floor.id)) next.delete(floor.id);
                                  else next.add(floor.id);
                                  return next;
                                })}
                                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              >
                                {expandedRoomFloors.has(floor.id) ? "Hide" : "Show"}
                                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expandedRoomFloors.has(floor.id) && "rotate-180")} />
                              </button>
                            </div>
                            <ul
                              id={`floor-rooms-${floor.id}`}
                              aria-labelledby={`rooms-floor-${floor.id}`}
                              className={cn("gap-2 sm:grid-cols-2", expandedRoomFloors.has(floor.id) ? "grid" : "hidden")}
                            >
                              {floor.rooms.map((room) => (
                                <li
                                  key={room.id}
                                  className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-background/50 px-3 py-2.5"
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <MapPin className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-foreground">
                                      {room.name}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs capitalize text-muted-foreground">
                                      {room.type.replace(/[_-]+/g, " ")}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        No rooms are listed for this building yet.
                      </p>
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

              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            <div className="surface-card p-5 space-y-4">
              <h3 className="font-extrabold text-foreground text-sm">Building Information</h3>
              <div className="space-y-3 text-sm">
                {[
                  { icon: MapPin, label: "Location", value: campusLocationLabel },
                  { icon: Layers, label: "Floors", value: `${building!.floor_count} ${building!.floor_count === 1 ? "floor" : "floors"}` },
                  ...((bHours?.hoursLabel || building!.operating_hours) ? [{ icon: Clock, label: "Hours", value: bHours?.hoursLabel ?? building!.operating_hours! }] : []),
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
                to={mapHref}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                <Navigation className="h-4 w-4" /> Get Directions
              </Link>
              <Link
                to={mapHref}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted transition-all"
              >
                <MapPin className="h-4 w-4" /> View on Map
              </Link>
              <button type="button" onClick={() => setShowReport(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20 transition-all">
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
                  <BuildingCard building={b} campusId={buildingCampus?.id} campusName={buildingCampus?.name} />
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>
        )}
        {showReport && building && <ReportModal building={building} campusId={buildingCampus?.id} floors={buildingCampus?.buildings.find(item => item.id === building.id)?.floors} onClose={() => setShowReport(false)} />}
      </div>
    </PageTransition>
  );
}
