import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useCampusData } from "../contexts/CampusDataContext";
import {
  CampusHome,
  CampusWizard,
  CampusCreationSuccess,
  CampusEditor,
  FloorEditor,
  BuildingWizardModal,
  PublishDialog,
  PublishScreen,
  CanvasSetupWizard,
  CanvasSettingsModal,
  genId,
  SEED_CAMPUSES,
  BUILDING_COLORS,
} from "../components/map-builder";
import type { Campus, View, BuildingWizardData } from "../components/map-builder/types";

// ── Directional slide variants ──────────────────────────────────────────────
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "30%" : "-30%",
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: "0%",
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-30%" : "30%",
    opacity: 0,
    scale: 0.98,
  }),
};

const slideTransition = {
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1],
};

// ── localStorage persistence key ────────────────────────────────────────────
const STORAGE_KEY = "plv-admin-campuses";

/**
 * Load campuses from localStorage, falling back to seed data.
 */
function loadCampuses(): Campus[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Campus[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    if (import.meta.env.DEV) {
      console.warn("[AdminMapBuilder] Failed to load campuses from localStorage — using seed data");
    }
  }
  return SEED_CAMPUSES;
}

/**
 * AdminMapBuilderPage — orchestrates all campus management views
 */
export function AdminMapBuilderPage() {
  const [campuses, setCampuses] = useState<Campus[]>(loadCampuses);
  const [view, setView] = useState<View>({ type: "home" });
  const [showBuildingWizard, setShowBuildingWizard] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishScreen, setPublishScreen] = useState<{ open: boolean; state: "publishing" | "success" | "error" }>({ open: false, state: "publishing" });
  // ── Processing guard — prevents duplicate publish clicks ──
  const [isPublishing, setIsPublishing] = useState(false);
  const directionRef = useRef(1);
  const { publishCampus: ctxPublish, removeCampus: ctxRemove } = useCampusData();

  // ── Persist campuses to localStorage on every change ────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(campuses));
    } catch {
      if (import.meta.env.DEV) {
        console.warn("[AdminMapBuilder] Failed to persist campuses to localStorage");
      }
    }
  }, [campuses]);

  const activeCampus =
    view.type === "campus" || view.type === "floor"
      ? campuses.find((c) => c.id === view.campusId) ?? null
      : null;

  // ── Campus CRUD ──────────────────────────────────────────────────────────

  const updateCampus = useCallback((updated: Campus) =>
    setCampuses((p) => p.map((c) => (c.id === updated.id ? updated : c))),
  []);

  const deleteCampus = useCallback((id: string) => {
    setCampuses((p) => p.filter((c) => c.id !== id));
    // Also remove from shared context if it was published
    ctxRemove(id);
    const deleted = campuses.find(c => c.id === id);
    toast.success("Campus Deleted", deleted ? `"${deleted.name}" has been removed.` : undefined);
  }, [ctxRemove]);

  const duplicateCampus = useCallback((id: string) => {
    const source = campuses.find((c) => c.id === id);
    if (!source) return;
    const now = new Date().toISOString().slice(0, 10);
    const clone: Campus = {
      ...structuredClone(source),
      id: genId("campus"),
      name: `${source.name} (Copy)`,
      code: source.code ? `${source.code}-CP` : "",
      publishStatus: "draft",
      visibleToStudents: false,
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
      buildings: source.buildings.map((b) => ({
        ...structuredClone(b),
        id: genId("bld"),
        floors: b.floors.map((f) => ({
          ...structuredClone(f),
          id: genId("fl"),
          rooms: f.rooms.map((r) => ({ ...structuredClone(r), id: genId("rm") })),
          paths: f.paths.map((p) => ({ ...structuredClone(p), id: genId("fp") })),
        })),
      })),
      markers: source.markers.map((m) => ({ ...structuredClone(m), id: genId("mk") })),
      paths: source.paths.map((p) => ({ ...structuredClone(p), id: genId("pt") })),
    };
    setCampuses((p) => [...p, clone]);
    const src = campuses.find(c => c.id === id);
    toast.success("Campus Duplicated", src ? `"${src.name}" has been copied.` : undefined);
  }, [campuses]);

  const togglePublish = useCallback((id: string) => {
    const campus = campuses.find((c) => c.id === id);
    const wasPublished = campus?.publishStatus === "published";
    const now = new Date().toISOString().slice(0, 10);

    setCampuses((p) =>
      p.map((c) =>
        c.id !== id
          ? c
          : {
              ...c,
              publishStatus: wasPublished ? "draft" as const : "published" as const,
              updatedAt: now,
              publishedAt: wasPublished ? undefined : now,
            }
      )
    );

    if (!wasPublished && campus) {
      // Publish to shared context so students can see it
      ctxPublish({
        id: campus.id,
        name: campus.name,
        code: campus.code,
        canvasW: campus.canvasW,
        canvasH: campus.canvasH,
        buildings: campus.buildings.map((b) => ({
          id: b.id, name: b.name, code: b.code,
          category: b.category, description: b.description,
          x: b.x, y: b.y, width: b.width, height: b.height,
          color: b.color, floors: b.floors,
        })),
        markers: campus.markers,
        paths: campus.paths,
        publishedAt: now,
      });
      toast.success("Campus Published", `"${campus.name}" is now visible to students.`);
    } else if (wasPublished) {
      // Unpublish — remove from shared context so students can no longer see it
      ctxRemove(id);
      toast.success("Campus Unpublished", `"${campus?.name}" has been taken down.`);
    }
  }, [campuses, ctxPublish, ctxRemove]);

  const archiveCampus = useCallback((id: string) => {
    const campus = campuses.find((c) => c.id === id);
    setCampuses((p) =>
      p.map((c) => (c.id === id ? { ...c, status: "archived" as const } : c))
    );
    // Remove from shared context so students can no longer see it
    ctxRemove(id);
    toast.success("Campus Archived", campus ? `"${campus.name}" moved to archive and hidden from students.` : undefined);
  }, [campuses, ctxRemove]);

  const restoreCampus = useCallback((id: string) => {
    const campus = campuses.find((c) => c.id === id);
    setCampuses((p) =>
      p.map((c) => (c.id === id ? { ...c, status: "active" as const } : c))
    );
    // If the campus was published before archiving, re-publish to shared context
    if (campus?.publishStatus === "published" && campus) {
      ctxPublish({
        id: campus.id,
        name: campus.name,
        code: campus.code,
        canvasW: campus.canvasW,
        canvasH: campus.canvasH,
        buildings: campus.buildings.map((b) => ({
          id: b.id, name: b.name, code: b.code,
          category: b.category, description: b.description,
          x: b.x, y: b.y, width: b.width, height: b.height,
          color: b.color, floors: b.floors,
        })),
        markers: campus.markers,
        paths: campus.paths,
        publishedAt: campus.publishedAt ?? new Date().toISOString(),
      });
    }
    toast.success("Campus Restored", campus ? `"${campus.name}" is active and ${campus.publishStatus === "published" ? "visible to students again." : "available for editing."}` : undefined);
  }, [campuses, ctxPublish]);

  const editDetails = useCallback((id: string) => {
    const campus = campuses.find((c) => c.id === id);
    if (!campus) return;
    directionRef.current = 1;
    setView({
      type: "wizard",
      step: 1,
      draft: {
        id: campus.id, // Include id to signal edit mode
        name: campus.name,
        code: campus.code,
        description: campus.description,
        address: campus.address,
        city: campus.city,
        province: campus.province,
        postalCode: campus.postalCode,
        coordinates: campus.coordinates,
        thumbnail: campus.thumbnail,
        logo: campus.logo,
        themeColor: campus.themeColor,
        publishStatus: campus.publishStatus,
        visibleToStudents: campus.visibleToStudents,
        features: campus.features,
        settings: campus.settings,
      },
    });
  }, [campuses]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const publishCampus = useCallback((updated: Campus) => {
    const now = new Date().toISOString().slice(0, 10);
    setCampuses((p) =>
      p.map((c) =>
        c.id === updated.id
          ? {
              ...updated,
              publishStatus: "published" as const,
              publishedAt: now,
              updatedAt: now,
            }
          : c
      )
    );
    ctxPublish({
      id: updated.id,
      name: updated.name,
      code: updated.code,
      canvasW: updated.canvasW,
      canvasH: updated.canvasH,
      buildings: updated.buildings.map((b) => ({
        id: b.id, name: b.name, code: b.code,
        category: b.category, description: b.description,
        x: b.x, y: b.y, width: b.width, height: b.height,
        color: b.color, floors: b.floors,
      })),
      markers: updated.markers,
      paths: updated.paths,
      publishedAt: now,
    });
    toast.success("Campus Map Published", `"${updated.name}" is now available to students.`);
  }, [ctxPublish]);

  const handleOpenFloor = useCallback((buildingId: string, floorId: string) => {
    if (!activeCampus) return;
    directionRef.current = 1;
    setView({ type: "floor", campusId: activeCampus.id, buildingId, floorId });
  }, [activeCampus]);

  const goHome = useCallback(() => {
    directionRef.current = -1;
    setView({ type: "home" });
  }, []);

  const goToCampus = useCallback((campusId: string) => {
    const campus = campuses.find((c) => c.id === campusId);
    directionRef.current = 1;
    // If the campus has no canvas configured yet, redirect to canvas setup
    if (campus && !campus.canvasConfigured) {
      setView({ type: "create-map", campusId });
    } else {
      setView({ type: "campus", campusId });
    }
  }, [campuses]);

  const goToCampusFromFloor = useCallback((campusId: string) => {
    directionRef.current = -1;
    setView({ type: "campus", campusId });
  }, []);

  // ── Wizard flow ───────────────────────────────────────────────────────────

  const nextWizardStep = useCallback((viewStep: 1 | 2 | 3 | 4, data: Partial<Campus>) => {
    const next = (viewStep + 1) as 1 | 2 | 3 | 4;
    setView({ type: "wizard", step: next, draft: { ...(view.type === "wizard" ? view.draft : {}), ...data } });
  }, [view]);

  const prevWizardStep = useCallback(() => {
    if (view.type !== "wizard") return;
    if (view.step === 1) {
      goHome();
    } else {
      const prev = (view.step - 1) as 1 | 2 | 3 | 4;
      setView({ type: "wizard", step: prev, draft: view.draft });
    }
  }, [view, goHome]);

  const jumpToStep = useCallback((targetStep: 1 | 2 | 3 | 4) => {
    setView((prev) => {
      if (prev.type !== "wizard") return prev;
      return { type: "wizard", step: targetStep, draft: prev.draft };
    });
  }, []);

  const goToSuccess = useCallback((campusId: string) => {
    directionRef.current = 1;
    setView({ type: "success", campusId });
  }, []);

  const finishWizard = useCallback((campus: Campus, existingId?: string) => {
    if (existingId) {
      // Edit mode — preserve existing buildings, markers, paths while updating metadata
      setCampuses((p) => p.map((c) =>
        c.id === existingId
          ? {
              ...c,
              ...campus,
              id: existingId,
              buildings: c.buildings,
              markers: c.markers,
              paths: c.paths,
              routes: c.routes,
              accessibilityFeatures: c.accessibilityFeatures,
              eventOverlays: c.eventOverlays,
              canvasW: c.canvasW,
              canvasH: c.canvasH,
            }
          : c
      ));
      toast.success("Campus Details Updated", campus.name ? `"${campus.name}" has been updated.` : undefined);
      goHome();
    } else {
      // Create mode — add new campus and show success screen
      setCampuses((p) => [...p, campus]);
      toast.success("Campus Created", `"${campus.name}" is ready for editing.`);
      goToSuccess(campus.id);
    }
  }, [goHome, goToSuccess]);

  // ── View key for AnimatePresence ──────────────────────────────────────────

  const viewKey = view.type === "home" ? "home"
    : view.type === "wizard" ? "wizard"
    : view.type === "success" ? `success-${view.campusId}`
    : view.type === "campus" ? `campus-${view.campusId}`
    : view.type === "create-map" ? `create-map-${view.campusId}`
    : `floor-${view.campusId}-${view.floorId}`;

  const isOverlay = view.type === "wizard";

  // ── Canvas setup & settings helpers ────────────────────────────────────────

  const canvasSetupCampus =
    view.type === "create-map"
      ? campuses.find((c) => c.id === view.campusId) ?? null
      : null;

  const handleCanvasSetupComplete = useCallback((updates: Partial<Campus>) => {
    if (!canvasSetupCampus) return;
    const updated: Campus = { ...canvasSetupCampus, ...updates, canvasConfigured: true };
    updateCampus(updated);
    setView({ type: "campus", campusId: canvasSetupCampus.id });
  }, [canvasSetupCampus, updateCampus]);

  const [showCanvasSettings, setShowCanvasSettings] = useState(false);

  const handleCanvasSettingsSave = useCallback((updates: Partial<Campus>) => {
    if (!activeCampus) return;
    updateCampus({ ...activeCampus, ...updates, canvasConfigured: true });
  }, [activeCampus, updateCampus]);

  return (
    <div className="flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      {/* ── Main views with animated transitions ── */}
      <AnimatePresence mode="wait" custom={directionRef.current}>
        {!isOverlay && (
          <motion.div
            key={viewKey}
            custom={directionRef.current}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* ── Home — campus management list ── */}
            {view.type === "home" && (
              <CampusHome
                campuses={campuses}
                onOpen={goToCampus}
                onCreate={() => setView({ type: "wizard", step: 1, draft: {} })}
                onDelete={deleteCampus}
                onDuplicate={duplicateCampus}
                onTogglePublish={togglePublish}
                onArchive={archiveCampus}
                onRestore={restoreCampus}
                onEditDetails={editDetails}
              />
            )}

            {/* ── Campus editor ── */}
            {view.type === "campus" && activeCampus && (
              <>
                <CampusEditor
                  campus={activeCampus}
                  onBack={goHome}
                  onUpdate={updateCampus}
                  onPublish={() => setShowPublishDialog(true)}
                  onOpenFloor={handleOpenFloor}
                  onAddBuilding={() => setShowBuildingWizard(true)}
                  onOpenCanvasSettings={() => setShowCanvasSettings(true)}
                  lastSavedAt={activeCampus.updatedAt}
                />
                {showBuildingWizard && (
                  <BuildingWizardModal
                    onClose={() => setShowBuildingWizard(false)}
                    onSave={(bldg: BuildingWizardData) => {
                      const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
                      const nb: Campus["buildings"][0] = {
                        id: genId("bld"),
                        ...bldg,
                        x: 80 + Math.random() * (activeCampus.canvasW - 200),
                        y: 80 + Math.random() * (activeCampus.canvasH - 160),
                        width: 110,
                        height: 70,
                        color,
                        expanded: false,
                      };
                      updateCampus({ ...activeCampus, buildings: [...activeCampus.buildings, nb] });
                      setShowBuildingWizard(false);
                    }}
                  />
                )}
                {showPublishDialog && activeCampus && (
                  <PublishDialog
                    campus={activeCampus}
                    onClose={() => setShowPublishDialog(false)}
                    onPublish={() => {
                      if (isPublishing) return;
                      setIsPublishing(true);
                      setShowPublishDialog(false);
                      // Directly show publish progress screen
                      setPublishScreen({ open: true, state: "publishing" });
                      // Cache the campus to publish so closure is stable
                      const campusToPublish = activeCampus;
                      // Use setTimeout for predictable timing
                      setTimeout(() => {
                        try {
                          publishCampus(campusToPublish);
                          setPublishScreen({ open: true, state: "success" });
                        } catch (err) {
                          console.error("[Publish] Failed:", err);
                          setPublishScreen({ open: true, state: "error" });
                        }
                        setIsPublishing(false);
                      }, 600);
                    }}
                  />
                )}
              </>
            )}

            {/* ── Floor editor ── */}
            {view.type === "floor" && activeCampus && (
              <FloorEditor
                campus={activeCampus}
                buildingId={view.buildingId}
                floorId={view.floorId}
                onBack={() => goToCampusFromFloor(activeCampus.id)}
                onSwitchFloor={(fId) => setView({ ...view, floorId: fId })}
                onUpdate={updateCampus}
              />
            )}

            {/* ── Campus creation success ── */}
            {view.type === "success" && (() => {
              const created = campuses.find((c) => c.id === view.campusId);
              if (!created) return null;
              return (
                <CampusCreationSuccess
                  campusName={created.name}
                  campusCode={created.code}
                  onOpenMapBuilder={() => goToCampus(created.id)}
                  onAddBuildings={() => goToCampus(created.id)}
                  onReturnToManagement={goHome}
                />
              );
            })()}

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Wizard — campus creation wizard (renders as overlay) ── */}
      {view.type === "wizard" && (
        <CampusWizard
          draft={view.draft}
          step={view.step}
          onNext={(data) => nextWizardStep(view.step, data)}
          onBack={prevWizardStep}
          onFinish={(campus) => finishWizard(campus, view.draft.id)}
          onClose={goHome}
          onJumpToStep={jumpToStep}
        />
      )}

      {/* Publish screen overlay */}
      <PublishScreen
        open={publishScreen.open}
        state={publishScreen.state}
        campusName={activeCampus?.name}
        onClose={() => setPublishScreen({ open: false, state: "publishing" })}
        onRetry={() => {
          setPublishScreen({ open: true, state: "publishing" });
          setTimeout(() => {
            try {
              if (activeCampus) {
                publishCampus(activeCampus);
                setPublishScreen({ open: true, state: "success" });
              } else {
                setPublishScreen({ open: true, state: "error" });
              }
            } catch {
              setPublishScreen({ open: true, state: "error" });
            }
          }, 2000);
        }}
      />

      {/* ── Canvas Setup Wizard — shown for new campuses with no canvas configured ── */}
      {canvasSetupCampus && (
        <CanvasSetupWizard
          open={view.type === "create-map"}
          campus={canvasSetupCampus}
          onComplete={handleCanvasSetupComplete}
          onClose={goHome}
        />
      )}

      {/* ── Canvas Settings Modal — accessible from the editor toolbar ── */}
      {activeCampus && (
        <CanvasSettingsModal
          open={showCanvasSettings}
          campus={activeCampus}
          onSave={handleCanvasSettingsSave}
          onClose={() => setShowCanvasSettings(false)}
        />
      )}
    </div>
  );
}
