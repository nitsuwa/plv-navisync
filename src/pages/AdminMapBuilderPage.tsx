import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useCampusData } from "../contexts/CampusDataContext";
import { buildSharedCampus, createCampusClone, resolvePublishTarget, sanitizeCampus } from "../lib/campusHelpers";
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
  }),
  center: {
    x: "0%",
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-30%" : "30%",
    opacity: 0,
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
      // Normalize legacy shapes (old versions may lack floors/markers/paths
      // and the status flags) so the page never crashes on stale data.
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(sanitizeCampus);
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
    const clone = createCampusClone(
      source,
      new Set(campuses.map((c) => c.name)),
      new Set(campuses.map((c) => c.code).filter(Boolean)),
      genId
    );
    setCampuses((p) => [...p, clone]);
    toast.success("Campus Duplicated", `"${source.name}" has been copied as "${clone.name}".`);
  }, [campuses]);

  const togglePublish = useCallback((id: string, force?: "publish" | "unpublish") => {
    const campus = campuses.find((c) => c.id === id);
    const wasPublished = campus?.publishStatus === "published";
    // Direction-aware: force lets retry/confirm re-run the exact same action instead of toggling
    const targetPublished = resolvePublishTarget(wasPublished, force);
    const now = new Date().toISOString().slice(0, 10);

    setCampuses((p) =>
      p.map((c) =>
        c.id !== id
          ? c
          : {
              ...c,
              publishStatus: targetPublished ? "published" as const : "draft" as const,
              visibleToStudents: targetPublished,
              updatedAt: now,
              publishedAt: targetPublished ? (c.publishedAt ?? now) : undefined,
            }
      )
    );

    if (targetPublished && campus) {
      // Publish to shared context so students can see it
      ctxPublish(buildSharedCampus(campus, now));
      toast.success("Campus Published", `"${campus.name}" is now visible to students.`);
    } else if (!targetPublished) {
      // Unpublish — remove from shared context so students can no longer see it
      ctxRemove(id);
      toast.success("Campus Unpublished", campus ? `"${campus.name}" has been taken down.` : "The campus has been taken down.");
    }
  }, [campuses, ctxPublish, ctxRemove]);

  const archiveCampus = useCallback((id: string) => {
    const campus = campuses.find((c) => c.id === id);
    setCampuses((p) =>
      p.map((c) => (c.id === id ? { ...c, status: "archived" as const, visibleToStudents: false } : c))
    );
    // Remove from shared context so students can no longer see it
    ctxRemove(id);
    if (campus) {
      toast.success(
        "Campus Archived",
        campus.publishStatus === "published"
          ? `"${campus.name}" is now hidden from students. It stays in the archive until you restore it.`
          : `"${campus.name}" moved to the archive. Restore it anytime to edit or publish.`
      );
    }
  }, [campuses, ctxRemove]);

  const restoreCampus = useCallback((id: string) => {
    const campus = campuses.find((c) => c.id === id);
    setCampuses((p) =>
      p.map((c) => (c.id === id ? { ...c, status: "active" as const } : c))
    );
    // If the campus was published before archiving, re-publish to shared context
    if (campus?.publishStatus === "published") {
      ctxPublish(buildSharedCampus(campus, campus.publishedAt ?? new Date().toISOString()));
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
      // Pass the whole campus as the draft so the wizard's save preserves
      // everything (buildings, markers, paths, canvas size, features,
      // settings, nav/decor data) instead of resetting them to defaults.
      draft: campus,
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
              visibleToStudents: true,
              publishedAt: now,
              updatedAt: now,
            }
          : c
      )
    );
    ctxPublish(buildSharedCampus({ ...updated, publishStatus: "published", publishedAt: now }, now));
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
    const now = new Date().toISOString().slice(0, 10);
    if (existingId) {
      // Edit mode — preserve existing buildings, markers, paths while updating metadata
      const existing = campuses.find((c) => c.id === existingId);
      if (!existing) { goHome(); return; }
      const wasPublished = existing.publishStatus === "published";
      const nextPublished = campus.publishStatus === "published";
      const merged: Campus = {
        ...existing,
        ...campus,
        id: existingId,
        buildings: existing.buildings,
        markers: existing.markers,
        paths: existing.paths,
        routes: existing.routes,
        accessibilityFeatures: existing.accessibilityFeatures,
        eventOverlays: existing.eventOverlays,
        canvasW: existing.canvasW,
        canvasH: existing.canvasH,
        updatedAt: now,
        publishedAt: nextPublished ? (existing.publishedAt ?? now) : undefined,
        visibleToStudents: campus.visibleToStudents,
      };
      setCampuses((p) => p.map((c) => (c.id === existingId ? merged : c)));
      // Keep the shared student-facing copy in sync with the wizard's publish status,
      // so toggling visibility from the wizard actually takes effect.
      if (nextPublished) {
        ctxPublish(buildSharedCampus(merged, merged.publishedAt));
      } else if (wasPublished) {
        ctxRemove(existingId);
      }
      toast.success("Campus Details Updated", campus.name ? `"${campus.name}" has been updated.` : undefined);
      goHome();
    } else {
      // Create mode — add new campus and show success screen
      const fresh: Campus = {
        ...campus,
        updatedAt: now,
        publishedAt: campus.publishStatus === "published" ? now : undefined,
      };
      setCampuses((p) => [...p, fresh]);
      if (campus.publishStatus === "published") {
        ctxPublish(buildSharedCampus(fresh, now));
      }
      toast.success("Campus Created", `"${campus.name}" is ready for editing.`);
      goToSuccess(campus.id);
    }
  }, [campuses, ctxPublish, ctxRemove, goHome, goToSuccess]);

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
