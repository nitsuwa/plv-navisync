import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { createCampusClone } from "../lib/campusHelpers";
import { campusService, CampusConflictError, userFacingCampusMessage, type CampusCreateInput, type CampusUpdateInput } from "../services/campusService";
import { campusStructureService } from "../services/campusStructureService";
import {
  CampusHome,
  CampusWizard,
  CampusCreationSuccess,
  CampusEditor,
  FloorEditor,
  BuildingWizardModal,
  CanvasSetupWizard,
  CanvasSettingsModal,
  genId,
  BUILDING_COLORS,
} from "../components/map-builder";
import type { Campus, View, BuildingWizardData } from "../components/map-builder/types";

const shouldLogCampusDiagnostics = import.meta.env.DEV && import.meta.env.MODE !== "test";

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
function campusInput(campus: Campus): CampusCreateInput {
  return {
    name: campus.name, code: campus.code, description: campus.description || null,
    address: campus.address || null, city: campus.city || null,
    province: campus.province || null, postal_code: campus.postalCode || null,
    latitude: campus.coordinates?.lat ?? null, longitude: campus.coordinates?.lng ?? null,
    logo_path: campus.logoPath ?? null, overview_image_path: campus.overviewImagePath ?? null,
    theme_color: campus.themeColor ?? "#1e3a5f", canvas_width: campus.canvasW || 1200,
    canvas_height: campus.canvasH || 800, canvas_configured: campus.canvasConfigured ?? false, map_scale_m_per_unit: 1,
    is_default: campus.isDefault ?? false,
  };
}

function preserveStructureIfMissing(next: Campus, previous?: Campus): Campus {
  if (!previous || (next.buildings?.length ?? 0) > 0 || next.previewBuildingCount !== undefined) return next;
  const hasPreviousPreview = previous.previewBuildingCount !== undefined || (previous.buildings?.length ?? 0) > 0;
  if (!hasPreviousPreview) return next;
  return {
    ...next,
    buildings: previous.buildings,
    previewBuildingCount: previous.previewBuildingCount,
    previewBuildingsLoaded: previous.previewBuildingsLoaded,
    markers: previous.markers,
    paths: previous.paths,
    routes: previous.routes,
    accessibilityFeatures: previous.accessibilityFeatures,
    assemblyPoints: previous.assemblyPoints,
    eventOverlays: previous.eventOverlays,
    decorAssets: previous.decorAssets,
    navNodes: previous.navNodes,
    navEdges: previous.navEdges,
  };
}

async function dataUrlToBlob(value?: string): Promise<Blob | null> {
  if (!value?.startsWith("data:")) return null;
  return (await fetch(value)).blob();
}

/**
 * AdminMapBuilderPage — orchestrates all campus management views
 */
export function AdminMapBuilderPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [view, setView] = useState<View>({ type: "home" });
  const [showBuildingWizard, setShowBuildingWizard] = useState(false);
  const directionRef = useRef(1);

  useEffect(() => {
    let active = true;
    campusService.list().then((rows) => { if (active) setCampuses(rows); }).catch((error: Error) => {
      toast.error("Could not load campuses", { description: error.message });
    });
    return () => { active = false; };
  }, []);

  const activeCampus =
    view.type === "campus" || view.type === "floor"
      ? campuses.find((c) => c.id === view.campusId) ?? null
      : null;

  // ── Campus CRUD ──────────────────────────────────────────────────────────

  const updateCampus = useCallback((updated: Campus) =>
    setCampuses((p) => p.map((c) => (c.id === updated.id ? updated : c))),
  []);

  const updateCampusMetadata = useCallback((updated: Campus) =>
    setCampuses((p) => p.map((c) => (c.id === updated.id ? preserveStructureIfMissing(updated, c) : c))),
  []);

  const duplicateCampus = useCallback(async (id: string) => {
    const source = campuses.find((c) => c.id === id);
    if (!source) return;
    const clone = createCampusClone(
      source,
      new Set(campuses.map((c) => c.name)),
      new Set(campuses.map((c) => c.code).filter(Boolean)),
      genId
    );
    try {
      const created = await campusService.create({ ...campusInput(clone), logo_path: null, overview_image_path: null, is_default: false });
      setCampuses((p) => [...p, created]);
      toast.success("Campus Duplicated", { description: `"${source.name}" has been copied as "${created.name}".` });
    } catch (error) { toast.error("Could not duplicate campus", { description: userFacingCampusMessage(error) }); }
  }, [campuses]);

  const archiveCampus = useCallback(async (id: string) => {
    const campus = campuses.find((c) => c.id === id);
    if (!campus?.databaseUpdatedAt) return;
    try {
      const updated = await campusService.archive(id, campus.databaseUpdatedAt);
      updateCampusMetadata(updated);
      toast.success("Campus Archived", { description: `"${campus.name}" is private until restored.` });
    } catch (error) { toast.error("Could not archive campus", { description: userFacingCampusMessage(error) }); }
  }, [campuses, updateCampusMetadata]);

  const restoreCampus = useCallback(async (id: string) => {
    const campus = campuses.find((c) => c.id === id);
    if (!campus?.databaseUpdatedAt) return;
    try {
      const updated = await campusService.restore(id, campus.databaseUpdatedAt);
      updateCampusMetadata(updated);
      toast.success("Campus Restored", { description: `"${campus.name}" was restored as a private draft.` });
    } catch (error) { toast.error("Could not restore campus", { description: userFacingCampusMessage(error) }); }
  }, [campuses, updateCampusMetadata]);

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

  const handleOpenFloor = useCallback((buildingId: string, floorId: string) => {
    if (!activeCampus) return;
    directionRef.current = 1;
    setView({ type: "floor", campusId: activeCampus.id, buildingId, floorId });
  }, [activeCampus]);

  const goHome = useCallback(() => {
    directionRef.current = -1;
    setView({ type: "home" });
  }, []);

  const goToCampus = useCallback(async (campusId: string) => {
    const campus = campuses.find((c) => c.id === campusId);
    directionRef.current = 1;
    // If the campus has no canvas configured yet, redirect to canvas setup
    if (campus && !campus.canvasConfigured) {
      setView({ type: "create-map", campusId });
    } else {
      try {
        const hydrated = await campusStructureService.load(campus!);
        updateCampus({
          ...hydrated,
          previewBuildingCount: campus?.previewBuildingCount ?? hydrated.previewBuildingCount ?? hydrated.buildings.length,
        });
      } catch (error) {
        toast.error("Could not load map", { description: (error as Error).message });
        return;
      }
      setView({ type: "campus", campusId });
    }
  }, [campuses, updateCampus]);

  const saveCampusStructure = useCallback(async (campus: Campus) => {
    const saved = await campusStructureService.save(campus);
    const savedWithPreviewCount = { ...saved, previewBuildingCount: saved.buildings.length, previewBuildingsLoaded: true };
    updateCampus(savedWithPreviewCount);
    return savedWithPreviewCount;
  }, [updateCampus]);

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

  const finishWizard = useCallback(async (campus: Campus, existingId?: string) => {
    try {
      if (shouldLogCampusDiagnostics) {
        console.debug("[AdminMapBuilderPage] finishWizard start", {
          mode: existingId ? "edit" : "create",
          id: existingId ?? campus.id,
          code: campus.code,
        });
      }
      const requestedLogo = await dataUrlToBlob(campus.logo);
      const requestedOverview = await dataUrlToBlob(campus.thumbnail);
      if (requestedLogo) campusService.validateImage(requestedLogo);
      if (requestedOverview) campusService.validateImage(requestedOverview);

      if (existingId) {
        const existing = campuses.find((item) => item.id === existingId);
        if (!existing?.databaseUpdatedAt) throw new Error("Refresh before editing this campus.");
        const input = campusInput({ ...existing, ...campus }) as CampusUpdateInput;
        if (shouldLogCampusDiagnostics) console.debug("[AdminMapBuilderPage] campusService.update start", { id: existingId });
        let updated = await campusService.update(existingId, input, existing.databaseUpdatedAt);
        if (requestedLogo || requestedOverview) {
          const [logoPath, overviewPath] = await Promise.all([
            requestedLogo ? campusService.uploadImage(existingId, "logo", requestedLogo) : Promise.resolve(updated.logoPath),
            requestedOverview ? campusService.uploadImage(existingId, "overview", requestedOverview) : Promise.resolve(updated.overviewImagePath),
          ]);
          updated = await campusService.update(existingId, { logo_path: logoPath ?? null, overview_image_path: overviewPath ?? null }, updated.databaseUpdatedAt!);
        }
        updateCampusMetadata(updated);
        toast.success("Campus Details Updated", { description: `"${updated.name}" has been saved.` });
        goHome();
        return true;
      }

      // Fail fast on a duplicate campus code instead of surfacing a cryptic
      // PostgREST unique-violation toast. The DB `code` column is unique, so
      // the server remains the backstop; this just gives a clear message first.
      const normalizedCode = campus.code.trim().toUpperCase();
      if (campuses.some((c) => c.code?.toUpperCase() === normalizedCode)) {
        throw new Error(`A campus with code "${normalizedCode}" already exists. Choose a different code.`);
      }
      if (shouldLogCampusDiagnostics) console.debug("[AdminMapBuilderPage] campusService.create start", { code: normalizedCode });
      let created = await campusService.create({ ...campusInput(campus), logo_path: null, overview_image_path: null });
      if (requestedLogo || requestedOverview) {
        const [logoPath, overviewPath] = await Promise.all([
          requestedLogo ? campusService.uploadImage(created.id, "logo", requestedLogo) : Promise.resolve(undefined),
          requestedOverview ? campusService.uploadImage(created.id, "overview", requestedOverview) : Promise.resolve(undefined),
        ]);
        created = await campusService.update(created.id, { logo_path: logoPath ?? null, overview_image_path: overviewPath ?? null }, created.databaseUpdatedAt!);
      }
      setCampuses((items) => [...items, created]);
      toast.success("Campus Created", { description: `"${created.name}" was saved as a private draft.` });
      goToSuccess(created.id);
      return true;
    } catch (error) {
      toast.error(error instanceof CampusConflictError ? "Campus changed elsewhere" : "Could not save campus", { description: userFacingCampusMessage(error) });
      if (shouldLogCampusDiagnostics) {
        console.error("[AdminMapBuilderPage] finishWizard failed", error);
      }
      return false;
    }
  }, [campuses, goHome, goToSuccess, updateCampusMetadata]);

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

  const handleCanvasSetupComplete = useCallback(async (updates: Partial<Campus>) => {
    if (!canvasSetupCampus) return;
    try {
      const updated = await campusService.update(canvasSetupCampus.id, {
        canvas_width: updates.canvasW, canvas_height: updates.canvasH, canvas_configured: true,
      }, canvasSetupCampus.databaseUpdatedAt!);
      updateCampusMetadata({ ...updated, canvasConfigured: true });
      setView({ type: "campus", campusId: canvasSetupCampus.id });
    } catch (error) { toast.error("Could not save canvas", { description: (error as Error).message }); }
  }, [canvasSetupCampus, updateCampusMetadata]);

  const [showCanvasSettings, setShowCanvasSettings] = useState(false);

  const handleCanvasSettingsSave = useCallback(async (updates: Partial<Campus>) => {
    if (!activeCampus) return;
    try {
      const updated = await campusService.update(activeCampus.id, {
        canvas_width: updates.canvasW, canvas_height: updates.canvasH, canvas_configured: true,
      }, activeCampus.databaseUpdatedAt!);
      updateCampusMetadata({ ...updated, canvasConfigured: true });
    } catch (error) { toast.error("Could not update canvas", { description: (error as Error).message }); }
  }, [activeCampus, updateCampusMetadata]);

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
                onDuplicate={duplicateCampus}
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
                  onSave={saveCampusStructure}
                  onPublish={() => toast.info("Publishing is implemented in A6.")}
                  publishingEnabled={false}
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
                onSave={saveCampusStructure}
                onPublish={() => toast.info("Publishing is implemented in A6.")}
                publishingEnabled={false}
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
          publishingEnabled={false}
        />
      )}

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
