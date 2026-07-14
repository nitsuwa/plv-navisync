import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useCampusData } from "../contexts/CampusDataContext";
import {
  CampusHome,
  CampusWizard,
  CampusEditor,
  FloorEditor,
  BuildingWizardModal,
  PublishDialog,
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

/**
 * AdminMapBuilderPage — thin orchestrator that wires the modular
 * map-builder components together and manages top-level state.
 */
export function AdminMapBuilderPage() {
  const [campuses, setCampuses] = useState<Campus[]>(SEED_CAMPUSES);
  const [view, setView] = useState<View>({ type: "home" });
  const [showBuildingWizard, setShowBuildingWizard] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const directionRef = useRef(1); // 1 = deeper, -1 = back
  const { publishCampus: ctxPublish } = useCampusData();

  const activeCampus =
    view.type === "campus" || view.type === "floor"
      ? campuses.find((c) => c.id === view.campusId) ?? null
      : null;

  const updateCampus = useCallback((updated: Campus) =>
    setCampuses((p) => p.map((c) => (c.id === updated.id ? updated : c))),
  []);

  const publishCampus = useCallback((updated: Campus) => {
    setCampuses((p) =>
      p.map((c) =>
        c.id === updated.id
          ? { ...updated, publishStatus: "published" as const, updatedAt: new Date().toISOString().slice(0, 10) }
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
      publishedAt: new Date().toISOString(),
    });
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
    directionRef.current = 1;
    setView({ type: "campus", campusId });
  }, []);

  const goToCampusFromFloor = useCallback((campusId: string) => {
    directionRef.current = -1;
    setView({ type: "campus", campusId });
  }, []);

  const nextWizardStep = useCallback((viewStep: 1 | 2 | 3 | 4 | 5, data: Partial<Campus>) => {
    const next = (viewStep + 1) as 1 | 2 | 3 | 4 | 5;
    setView({ type: "wizard", step: next, draft: { ...(view.type === "wizard" ? view.draft : {}), ...data } });
  }, [view]);

  const prevWizardStep = useCallback(() => {
    if (view.type !== "wizard") return;
    if (view.step === 1) {
      goHome();
    } else {
      const prev = (view.step - 1) as 1 | 2 | 3 | 4 | 5;
      setView({ type: "wizard", step: prev, draft: view.draft });
    }
  }, [view, goHome]);

  const finishWizard = useCallback((campus: Campus) => {
    setCampuses((p) => [...p, campus]);
    directionRef.current = 1;
    setView({ type: "campus", campusId: campus.id });
  }, []);

  // Determine the current view key for AnimatePresence
  const viewKey = view.type === "home" ? "home"
    : view.type === "wizard" ? "wizard"
    : view.type === "campus" ? `campus-${view.campusId}`
    : `floor-${view.campusId}-${view.floorId}`;

  // Only show AnimatePresence transitions for main views (not wizard which is an overlay)
  const isOverlay = view.type === "wizard";

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
            {/* ── Home — campus list / empty state ── */}
            {view.type === "home" && (
              <CampusHome
                campuses={campuses}
                onOpen={goToCampus}
                onCreate={() => setView({ type: "wizard", step: 1, draft: {} })}
                onDelete={(id) => setCampuses((p) => p.filter((c) => c.id !== id))}
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
                      publishCampus(activeCampus);
                      setShowPublishDialog(false);
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Wizard — campus creation wizard (renders as overlay outside AnimatePresence) ── */}
      {view.type === "wizard" && (
        <CampusWizard
          draft={view.draft}
          step={view.step}
          onNext={(data) => nextWizardStep(view.step, data)}
          onBack={prevWizardStep}
          onFinish={finishWizard}
          onClose={goHome}
        />
      )}
    </div>
  );
}
