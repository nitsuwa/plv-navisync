import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useUnsavedChangesContext } from "../components/map-builder/UnsavedChangesContext";
import { createCampusClone } from "../lib/campusHelpers";
import { campusService, CampusConflictError, CampusDeletionError, CampusServiceError, userFacingCampusMessage, type CampusCreateInput, type CampusUpdateInput } from "../services/campusService";
import { campusStructureService } from "../services/campusStructureService";
import { nextDefaultBuildingIdentity } from "../lib/buildingDefaults";
import { canPersistCampusStructure, clearCampusDraft, restoreCampusDraft, shouldPersistCampusDraft, writeCampusDraft } from "../lib/campusDraftPersistence";
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
  TestRouteSessionProvider,
  StudentPreview,
} from "../components/map-builder";
import { computeLiveValidationIssues } from "../lib/liveValidation";
import type { BulkDeleteFailure, BulkDeleteProgress, BulkDeleteResult } from "../components/map-builder";
import type { Campus, View, BuildingWizardData, FloorSelection } from "../components/map-builder/types";

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

function campusFloorCount(campus: Campus): number {
  return (campus.buildings ?? []).reduce((sum, building) => sum + (building.floors?.length ?? 0), 0);
}

function campusRoomCount(campus: Campus): number {
  return (campus.buildings ?? []).reduce(
    (sum, building) => sum + (building.floors ?? []).reduce((floorSum, floor) => floorSum + (floor.rooms?.length ?? 0), 0),
    0
  );
}

function preserveStructureIfMissing(next: Campus, previous?: Campus): Campus {
  if (!previous || (next.buildings?.length ?? 0) > 0 || next.previewBuildingCount !== undefined) return next;
  const hasPreviousPreview = previous.previewBuildingCount !== undefined || (previous.buildings?.length ?? 0) > 0;
  if (!hasPreviousPreview) return next;
  return {
    ...next,
    buildings: previous.buildings,
    previewBuildingCount: previous.previewBuildingCount,
    previewFloorCount: previous.previewFloorCount,
    previewRoomCount: previous.previewRoomCount,
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
  const [studentPreviewCampus, setStudentPreviewCampus] = useState<Campus | null>(null);
  const [previewSaveCampus, setPreviewSaveCampus] = useState<Campus | null>(null);
  const [previewSaving, setPreviewSaving] = useState(false);
  const directionRef = useRef(1);
  // Keep codes allocated during this editing session reserved even when a
  // draft Building is deleted. The structure-save RPC archives removed rows,
  // while buildings_campus_code_uq still covers those rows.
  const buildingCodeReservationsRef = useRef<Map<string, Set<string>>>(new Map());

  // ── Single dirty-state source of truth ──
  // JSON snapshot of the last PERSISTED campus per campus id. The outdoor
  // CampusEditor derives `isDirty` by comparing its current campus against this
  // baseline (via the `savedSnapshot` prop). Because the CampusEditor unmounts
  // while the Floor Editor is open, the baseline must live here at the page
  // level so Floor Editor mutations (which update the same campus draft through
  // onUpdate) still enable the outer Save when the user returns.
  const savedSnapshotsRef = useRef<Record<string, string>>({});
  // Campus cards are lightweight until the structure load completes. Never
  // allow a structure write against that pre-hydration state.
  const hydratedCampusIdsRef = useRef<Set<string>>(new Set());
  const campusesRef = useRef<Campus[]>([]);
  campusesRef.current = campuses;

  // Keep in-progress edits recoverable if a browser suspends this tab or a
  // transient auth/layout remount occurs. Canvas gestures can update the draft
  // many times per second, so writes are throttled; lifecycle events flush the
  // latest value synchronously.
  const pendingDraftsRef = useRef<Map<string, Campus>>(new Map());
  const draftWriteTimersRef = useRef<Map<string, number>>(new Map());
  const clearDraft = useCallback((campusId: string) => {
    const timer = draftWriteTimersRef.current.get(campusId);
    if (timer !== undefined && typeof window !== "undefined") window.clearTimeout(timer);
    draftWriteTimersRef.current.delete(campusId);
    pendingDraftsRef.current.delete(campusId);
    clearCampusDraft(campusId);
  }, []);
  const flushDraft = useCallback((campusId: string) => {
    const draft = pendingDraftsRef.current.get(campusId);
    if (!draft) return;
    const timer = draftWriteTimersRef.current.get(campusId);
    if (timer !== undefined && typeof window !== "undefined") window.clearTimeout(timer);
    draftWriteTimersRef.current.delete(campusId);
    pendingDraftsRef.current.delete(campusId);
    const baselineRaw = savedSnapshotsRef.current[campusId];
    if (!shouldPersistCampusDraft(draft, baselineRaw)) {
      clearCampusDraft(campusId);
      return;
    }
    let baseline: Campus | undefined;
    try { baseline = JSON.parse(baselineRaw) as Campus; } catch { /* best-effort recovery */ }
    writeCampusDraft(draft, baseline);
  }, []);
  const queueDraft = useCallback((draft: Campus) => {
    const baselineRaw = savedSnapshotsRef.current[draft.id];
    // A campus card can be present before its structure has hydrated. Never
    // queue/save that temporary empty state as a draft; only a changed campus
    // with a known persisted baseline is eligible for draft recovery.
    if (!shouldPersistCampusDraft(draft, baselineRaw)) {
      clearDraft(draft.id);
      return;
    }
    pendingDraftsRef.current.set(draft.id, draft);
    if (typeof window === "undefined" || draftWriteTimersRef.current.has(draft.id)) return;
    const timer = window.setTimeout(() => flushDraft(draft.id), 250);
    draftWriteTimersRef.current.set(draft.id, timer);
  }, [clearDraft, flushDraft]);

  useEffect(() => {
    const flushAll = () => {
      for (const campusId of pendingDraftsRef.current.keys()) flushDraft(campusId);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", handleVisibility);
      flushAll();
    };
  }, [flushDraft]);

  useEffect(() => {
    let active = true;
    campusService.list().then((rows) => { if (active) setCampuses(rows); }).catch((error: Error) => {
      toast.error("Could not load campuses", { description: error.message });
    });
    return () => { active = false; };
  }, []);

  // Re-read the authoritative Supabase campus list after lifecycle writes.
  // Cards must never claim success from local React state alone.
  const refreshCampuses = useCallback(async () => {
    const rows = await campusService.list();
    setCampuses(rows);
    return rows;
  }, []);

  const activeCampus =
    view.type === "campus" || view.type === "floor"
      ? campuses.find((c) => c.id === view.campusId) ?? null
      : null;

  // ── Campus CRUD ──────────────────────────────────────────────────────────

  const updateCampus = useCallback((updated: Campus) => {
    // Editor callbacks normally carry the complete hydrated structure. Keep a
    // defensive boundary here for startup/remount races where a lightweight
    // campus card or partial reconciliation could briefly emit empty arrays.
    // Do not let that transient value replace an already-loaded map (or queue
    // a destructive draft); intentional deletions retain previewBuildingCount
    // and therefore continue through unchanged.
    const previous = campusesRef.current.find((campus) => campus.id === updated.id);
    const safeUpdated = preserveStructureIfMissing(updated, previous);
    const reserved = buildingCodeReservationsRef.current.get(updated.id) ?? new Set<string>();
    for (const building of safeUpdated.buildings ?? []) {
      const code = typeof building.code === "string" ? building.code.trim().toUpperCase() : "";
      if (code) reserved.add(code);
    }
    buildingCodeReservationsRef.current.set(updated.id, reserved);
    setCampuses((p) => p.map((c) => (c.id === safeUpdated.id ? safeUpdated : c)));
    queueDraft(safeUpdated);
  }, [queueDraft]);

  const updateCampusMetadata = useCallback((updated: Campus) => {
    setCampuses((p) => p.map((c) => (c.id === updated.id ? preserveStructureIfMissing(updated, c) : c)));
    // Metadata persistence (details, canvas settings, archive/restore) is a
    // completed write — the stored campus becomes the new dirty baseline.
    // Compute from the closure (not inside the state updater) so the updater
    // stays pure; all callers pass a campus already present in `campuses`.
    const previous = campuses.find((c) => c.id === updated.id);
    if (previous) {
      const stored = preserveStructureIfMissing(updated, previous);
      savedSnapshotsRef.current = { ...savedSnapshotsRef.current, [stored.id]: JSON.stringify(stored) };
      clearDraft(stored.id);
    }
  }, [campuses, clearDraft]);

  const duplicateCampus = useCallback(async (id: string) => {
    const source = campuses.find((c) => c.id === id);
    if (!source) throw new Error("Campus not found.");
    let created: Campus | null = null;
    try {
      // The list intentionally carries lightweight preview buildings. Hydrate
      // the authoritative structure before cloning so duplication includes the
      // complete authored map/navigation tree rather than just card metadata.
      const loaded = await campusStructureService.load(source);
      const clone = createCampusClone(
        loaded ?? source,
        new Set(campuses.map((c) => c.name)),
        new Set(campuses.map((c) => c.code).filter(Boolean)),
        genId,
      );
      created = await campusService.create({ ...campusInput(clone), logo_path: null, overview_image_path: null, is_default: false });
      // The database assigns the campus id. Keep all freshly generated child
      // ids, but bind the cloned structure to that persisted campus id.
      const cloneForSave: Campus = {
        ...clone,
        ...created,
        id: created.id,
        name: clone.name,
        code: clone.code,
        status: "active",
        publishStatus: "draft",
        lifecycleStatus: "draft",
        visibleToStudents: false,
        publishedAt: undefined,
        buildings: clone.buildings,
        markers: clone.markers,
        paths: clone.paths,
        routes: clone.routes,
        accessibilityFeatures: clone.accessibilityFeatures,
        assemblyPoints: clone.assemblyPoints,
        eventOverlays: clone.eventOverlays,
        decorAssets: clone.decorAssets,
        navNodes: clone.navNodes?.map((node) => ({ ...node, campusId: created!.id })),
        navEdges: clone.navEdges,
      };
      const saved = await campusStructureService.save(cloneForSave);
      const complete = saved ?? cloneForSave;
      const withPreview = {
        ...complete,
        previewBuildingCount: complete.buildings.length,
        previewFloorCount: campusFloorCount(complete),
        previewRoomCount: campusRoomCount(complete),
        previewBuildingsLoaded: true,
      };
      await refreshCampuses();
      toast.success("Campus Duplicated", { description: `"${source.name}" has been copied as "${withPreview.name}".` });
    } catch (error) {
      // If structure saving fails after the metadata row is created, quarantine
      // that incomplete row in the archive instead of leaving a misleading
      // active campus. Permanent deletion remains an explicit admin action.
      if (created?.databaseUpdatedAt) {
        try {
          await campusService.archive(created.id, created.databaseUpdatedAt);
        } catch {
          // The original failure is the actionable error shown to the admin.
        }
      }
      await refreshCampuses().catch(() => undefined);
      toast.error("Could not duplicate campus", { description: userFacingCampusMessage(error) });
      throw error;
    }
  }, [campuses, refreshCampuses]);

  const archiveCampus = useCallback(async (id: string) => {
    const campus = campuses.find((c) => c.id === id);
    if (!campus) throw new Error("Campus not found.");
    if (!campus.databaseUpdatedAt) throw new Error("Refresh before archiving this campus.");
    if (campus.publishStatus === "published" && campus.status !== "archived") {
      toast.error("Unpublish First", { description: `"${campus.name}" is currently available to students. Unpublish it before archiving.` });
      return;
    }
    try {
      const updated = await campusService.archive(id, campus.databaseUpdatedAt);
      updateCampusMetadata(updated);
      await refreshCampuses();
      toast.success("Campus Archived", { description: `"${campus.name}" is private until restored.` });
    } catch (error) {
      toast.error("Could not archive campus", { description: userFacingCampusMessage(error) });
      throw error;
    }
  }, [campuses, refreshCampuses, updateCampusMetadata]);

  const restoreCampus = useCallback(async (id: string) => {
    const campus = campuses.find((c) => c.id === id);
    if (!campus) throw new Error("Campus not found.");
    if (!campus.databaseUpdatedAt) throw new Error("Refresh before restoring this campus.");
    try {
      const updated = await campusService.restore(id, campus.databaseUpdatedAt);
      updateCampusMetadata(updated);
      await refreshCampuses();
      toast.success("Campus Restored", { description: `"${campus.name}" was restored as a private draft.` });
    } catch (error) {
      toast.error("Could not restore campus", { description: userFacingCampusMessage(error) });
      throw error;
    }
  }, [campuses, refreshCampuses, updateCampusMetadata]);

  const unpublishCampus = useCallback(async (id: string) => {
    const campus = campuses.find((c) => c.id === id);
    if (!campus) throw new Error("Campus not found.");
    if (!campus.databaseUpdatedAt) throw new Error("Refresh before unpublishing this campus.");
    if (campus.publishStatus !== "published" || campus.status === "archived") return;
    try {
      const updated = await campusService.unpublish(id, campus.databaseUpdatedAt);
      updateCampusMetadata(updated);
      await refreshCampuses();
      toast.success("Campus Unpublished", { description: `"${campus.name}" is no longer visible to students.` });
    } catch (error) {
      toast.error("Could not unpublish campus", { description: userFacingCampusMessage(error) });
      throw error;
    }
  }, [campuses, refreshCampuses, updateCampusMetadata]);

  const bulkRestoreCampuses = useCallback(async (ids: string[]) => {
    const selected = ids
      .map((id) => campuses.find((campus) => campus.id === id))
      .filter((campus): campus is Campus => Boolean(campus));
    try {
      for (const campus of selected) {
        if (!campus.databaseUpdatedAt) throw new Error(`Refresh before restoring "${campus.name}".`);
        await campusService.restore(campus.id, campus.databaseUpdatedAt);
      }
      await refreshCampuses();
      toast.success("Campuses Restored", { description: `${selected.length} campus${selected.length === 1 ? "" : "es"} returned as private drafts.` });
    } catch (error) {
      await refreshCampuses().catch(() => undefined);
      toast.error("Could not restore all campuses", { description: userFacingCampusMessage(error) });
      throw error;
    }
  }, [campuses, refreshCampuses]);

  const permanentlyDeleteCampus = useCallback(async (id: string) => {
    const campus = campuses.find((candidate) => candidate.id === id);
    if (!campus) throw new Error("Campus not found.");
    if (campus.status !== "archived") {
      throw new Error("Only archived campuses can be permanently deleted.");
    }
    try {
      await campusService.permanentlyDelete(id);
      await refreshCampuses();
      toast.success("Campus Permanently Deleted", { description: `"${campus.name}" and its authored map data were removed.` });
    } catch (error) {
      await refreshCampuses().catch(() => undefined);
      toast.error("Could not permanently delete campus", { description: userFacingCampusMessage(error) });
      throw error;
    }
  }, [campuses, refreshCampuses]);

  const bulkPermanentlyDeleteCampuses = useCallback(async (
    ids: string[],
    onProgress?: (progress: BulkDeleteProgress) => void,
  ): Promise<BulkDeleteResult> => {
    const selected = ids.map((id) => campuses.find((campus) => campus.id === id));
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    const failures: BulkDeleteFailure[] = [];

    const recordFailure = (id: string, name: string, error: unknown) => {
      const serviceError = error instanceof CampusServiceError ? error : undefined;
      const deletionError = error instanceof CampusDeletionError ? error : undefined;
      const failure: BulkDeleteFailure = {
        id,
        name,
        stage: deletionError?.stage,
        code: serviceError?.dbCode,
        message: error instanceof Error ? error.message : "Permanent deletion failed.",
        details: serviceError?.dbDetails,
        hint: serviceError?.dbHint,
        userMessage: userFacingCampusMessage(error),
      };
      failures.push(failure);
      if (import.meta.env.DEV) {
        console.error("[campusService] bulk permanent delete failed", failure);
      }
    };

    for (let index = 0; index < selected.length; index += 1) {
      const campus = selected[index];
      if (!campus) {
        failedIds.push(ids[index]);
        recordFailure(ids[index], ids[index], new Error("Campus not found. Refresh the campus list."));
      } else if (campus.status !== "archived") {
        failedIds.push(campus.id);
        recordFailure(campus.id, campus.name, new Error(`Only archived campuses can be permanently deleted ("${campus.name}" is not archived).`));
      } else {
        try {
          await campusService.permanentlyDelete(campus.id);
          succeededIds.push(campus.id);
        } catch (error) {
          failedIds.push(campus.id);
          recordFailure(campus.id, campus.name, error);
        }
      }
      onProgress?.({ completed: index + 1, total: selected.length, currentName: campus?.name });
    }

    await refreshCampuses();
    if (failedIds.length > 0) {
      const failureMessage = failures.length > 0 ? failures[0].userMessage : "Some campuses could not be deleted.";
      toast.error("Some campuses could not be deleted", {
        description: `${succeededIds.length} deleted; ${failedIds.length} could not be deleted. ${failureMessage}`,
      });
    } else {
      toast.success("Campuses Permanently Deleted", { description: `${succeededIds.length} campus${succeededIds.length === 1 ? "" : "es"} removed.` });
    }
    return {
      succeededIds,
      failedIds,
      failureMessage: failures.length > 0 ? `${failedIds.length} campus${failedIds.length === 1 ? "" : "es"} could not be deleted. ${failures[0].userMessage}` : undefined,
      failures,
    };
  }, [campuses, refreshCampuses]);

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

  const handleOpenFloor = useCallback((buildingId: string, floorId: string, initialSelection?: FloorSelection) => {
    if (!activeCampus) return;
    directionRef.current = 1;
    setView({ type: "floor", campusId: activeCampus.id, buildingId, floorId, initialSelection });
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
        const hydratedWithPreview = {
          ...hydrated,
          previewBuildingCount: campus?.previewBuildingCount ?? hydrated.previewBuildingCount ?? hydrated.buildings.length,
          previewFloorCount: campusFloorCount(hydrated),
          previewRoomCount: campusRoomCount(hydrated),
          previewBuildingsLoaded: true,
        };
        const restored = restoreCampusDraft(hydratedWithPreview);
        // Hydration is a read of the persisted state — it becomes the baseline.
        savedSnapshotsRef.current = { ...savedSnapshotsRef.current, [campusId]: JSON.stringify(hydratedWithPreview) };
        hydratedCampusIdsRef.current.add(campusId);
        updateCampus(restored);
      } catch (error) {
        toast.error("Could not load map", { description: (error as Error).message });
        return;
      }
      setView({ type: "campus", campusId });
    }
  }, [campuses, updateCampus]);

  const saveCampusStructure = useCallback(async (campus: Campus) => {
    const baseline = savedSnapshotsRef.current[campus.id];
    if (!canPersistCampusStructure(campus, baseline, hydratedCampusIdsRef.current.has(campus.id))) {
      throw new Error("Map data is still loading. Refresh the map before saving.");
    }
    const saved = await campusStructureService.save(campus);
    const savedWithPreviewCount = {
      ...saved,
      previewBuildingCount: saved.buildings.length,
      previewFloorCount: campusFloorCount(saved),
      previewRoomCount: campusRoomCount(saved),
      previewBuildingsLoaded: true,
    };
    // A successful save is the canonical baseline for the outer dirty check.
    savedSnapshotsRef.current = { ...savedSnapshotsRef.current, [saved.id]: JSON.stringify(savedWithPreviewCount) };
    updateCampus(savedWithPreviewCount);
    clearDraft(saved.id);
    return savedWithPreviewCount;
  }, [clearDraft, updateCampus]);

  const openStudentPreview = useCallback((campus: Campus, isDirty: boolean) => {
    if (isDirty) {
      setPreviewSaveCampus(campus);
      return;
    }
    setStudentPreviewCampus(campus);
  }, []);

  const saveAndOpenStudentPreview = useCallback(async () => {
    if (!previewSaveCampus) return;
    setPreviewSaving(true);
    try {
      const saved = await saveCampusStructure(previewSaveCampus);
      setPreviewSaveCampus(null);
      setStudentPreviewCampus(saved);
    } catch (error) {
      toast.error("Could not save before preview", { description: userFacingCampusMessage(error) });
    } finally {
      setPreviewSaving(false);
    }
  }, [previewSaveCampus, saveCampusStructure]);

  const publishStudentPreview = useCallback(async () => {
    const candidate = studentPreviewCampus;
    if (!candidate) return;
    const issues = computeLiveValidationIssues(candidate);
    const errors = issues.filter((issue) => issue.severity === "error").length;
    const warnings = issues.filter((issue) => issue.severity === "warning").length;
    if (errors > 0) throw new Error("Fix the blocking validation issues before publishing this campus.");
    const total = Math.max(1, issues.length);
    const published = await campusService.publishVersion(candidate, {
      errors,
      warnings,
      passed: Math.max(0, total - errors - warnings),
      total,
    });
    const rows = await refreshCampuses();
    // `campusService.list()` intentionally returns lightweight card rows. Keep
    // the complete candidate structure mounted after the publish refresh so
    // returning from the preview cannot replace the editor's authored map
    // with a preview-only campus shell, while adopting the database timestamps
    // and lifecycle fields returned by the refresh.
    const refreshedRow = rows.find((row) => row.id === candidate.id);
    const refreshed = refreshedRow ? {
      ...published,
      status: refreshedRow.status,
      publishStatus: refreshedRow.publishStatus,
      lifecycleStatus: refreshedRow.lifecycleStatus,
      visibleToStudents: refreshedRow.visibleToStudents,
      updatedAt: refreshedRow.updatedAt,
      publishedAt: refreshedRow.publishedAt ?? published.publishedAt,
      databaseUpdatedAt: refreshedRow.databaseUpdatedAt,
    } : published;
    savedSnapshotsRef.current = { ...savedSnapshotsRef.current, [refreshed.id]: JSON.stringify(refreshed) };
    updateCampus(refreshed);
    clearDraft(refreshed.id);
    setStudentPreviewCampus(refreshed);
    toast.success("Campus Published", { description: `${refreshed.name} is now available to students.` });
  }, [clearDraft, studentPreviewCampus, refreshCampuses, updateCampus]);

  const closeStudentPreview = useCallback(() => setStudentPreviewCampus(null), []);

  // ── Page-level unsaved-changes handler for the shared guard ──────────────
  // The editors guard their OWN internal exits (back, floor switch, add floor);
  // this registration arms the SAME shared modal for anything that would
  // UNMOUNT the page and discard the draft: sidebar sections, sign out, and
  // browser back. Dirty = the active campus draft differs from its persisted
  // snapshot (the same baseline the editors receive via `savedSnapshot`).
  const { registerHandler } = useUnsavedChangesContext();
  const activeCampusRef = useRef(activeCampus);
  activeCampusRef.current = activeCampus;
  const activeCampusIsDirty =
    activeCampus !== null && JSON.stringify(activeCampus) !== savedSnapshotsRef.current[activeCampus.id];
  useEffect(() => {
    if (!activeCampus || !activeCampusIsDirty) {
      registerHandler(null);
      return () => registerHandler(null);
    }
    const campusId = activeCampus.id;
    registerHandler({
      isDirty: () => true,
      onSave: async () => {
        const current = activeCampusRef.current;
        if (!current) return true;
        try {
          await saveCampusStructure(current);
          return true;
        } catch {
          return false;
        }
      },
      onDiscard: () => {
        const snapshot = savedSnapshotsRef.current[campusId];
        if (snapshot) {
          try {
            updateCampus(JSON.parse(snapshot) as Campus);
          } catch {
            // Baseline unavailable — keep the current draft untouched.
          }
        }
      },
    });
    return () => registerHandler(null);
  }, [activeCampus, activeCampusIsDirty, registerHandler, saveCampusStructure, updateCampus]);

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
      // Appearance is stored in the existing structure JSON channel; the
      // campus row continues to own only dimensions/configuration.
      const saved = await campusStructureService.save({ ...updated, ...updates, canvasConfigured: true });
      updateCampusMetadata({ ...saved, canvasConfigured: true });
      setView({ type: "campus", campusId: canvasSetupCampus.id });
    } catch (error) { toast.error("Could not save canvas", { description: (error as Error).message }); }
  }, [canvasSetupCampus, updateCampusMetadata]);

  const [showCanvasSettings, setShowCanvasSettings] = useState(false);

  const handleCanvasSettingsSave = useCallback(async (updates: Partial<Campus>) => {
    if (!activeCampus) return;
    try {
      const current = activeCampus;
      const nextWidth = updates.canvasW ?? current.canvasW;
      const nextHeight = updates.canvasH ?? current.canvasH;
      const dimensionsChanged = nextWidth !== current.canvasW || nextHeight !== current.canvasH;

      // Appearance-only changes belong to the same canonical structure-save
      // transaction as the rest of the editor. The old path always performed
      // a separate campus-row update first, which called auth.getUser() and
      // could surface Supabase's transient "Auth session missing!" error even
      // though the editor was authenticated and fully hydrated.
      let candidate = preserveStructureIfMissing(
        { ...current, ...updates, canvasW: nextWidth, canvasH: nextHeight, canvasConfigured: true },
        current,
      );

      // Keep the campus row as the source of truth for dimensions, but only
      // use that metadata update when dimensions actually changed. Ground
      // material/color/texture therefore never take a second auth-sensitive
      // write, and all authored structure remains in the full save payload.
      if (dimensionsChanged) {
        if (!current.databaseUpdatedAt) throw new Error("Refresh the campus before changing canvas dimensions.");
        const updated = await campusService.update(current.id, {
          canvas_width: nextWidth, canvas_height: nextHeight, canvas_configured: true,
        }, current.databaseUpdatedAt);
        candidate = preserveStructureIfMissing(
          { ...current, ...updated, ...updates, canvasW: nextWidth, canvasH: nextHeight, canvasConfigured: true },
          current,
        );
      }

      await saveCampusStructure(candidate);
    } catch (error) {
      toast.error("Could not update canvas", { description: userFacingCampusMessage(error) });
      // CanvasSettingsModal awaits this rejection and keeps its local draft
      // open for retry. Do not turn a persistence failure into a logout.
      throw error;
    }
  }, [activeCampus, saveCampusStructure]);

  return (
    <div className="flex flex-col w-full flex-1" style={{ minHeight: 0 }}>
      {/* ── Main views with animated transitions ── */}
      <TestRouteSessionProvider key={activeCampus?.id ?? "none"}>
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
                onUnpublish={unpublishCampus}
                onArchive={archiveCampus}
                onRestore={restoreCampus}
                onBulkRestore={bulkRestoreCampuses}
                onPermanentDelete={permanentlyDeleteCampus}
                onBulkPermanentDelete={bulkPermanentlyDeleteCampuses}
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
                  onPublish={() => undefined}
                  onPreviewStudent={openStudentPreview}
                  publishingEnabled
                  onOpenFloor={handleOpenFloor}
                  onAddBuilding={() => setShowBuildingWizard(true)}
                  onOpenCanvasSettings={() => setShowCanvasSettings(true)}
                  lastSavedAt={activeCampus.updatedAt}
                  savedSnapshot={savedSnapshotsRef.current[activeCampus.id]}
                />
                {showBuildingWizard && (
                  <BuildingWizardModal
                    onClose={() => setShowBuildingWizard(false)}
                    onSave={(bldg: BuildingWizardData) => {
                      const requestedCode = bldg.code.trim().toUpperCase();
                      const reservedCodes = buildingCodeReservationsRef.current.get(activeCampus.id) ?? new Set<string>();
                      const codeTaken = reservedCodes.has(requestedCode)
                        || activeCampus.buildings.some((building) => building.code?.trim().toUpperCase() === requestedCode);
                      const fallbackIdentity = codeTaken
                        ? nextDefaultBuildingIdentity(
                          activeCampus.buildings,
                          [...reservedCodes].map((code) => ({ code })),
                        )
                        : null;
                      if (fallbackIdentity) {
                        toast.info("Building code already in use", {
                          description: `Using ${fallbackIdentity.code} for this new building.`,
                        });
                      }
                      const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
                      const nb: Campus["buildings"][0] = {
                        id: genId("bld"),
                        ...bldg,
                        code: fallbackIdentity?.code ?? requestedCode,
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
                onOpenFloor={handleOpenFloor}
                onSwitchFloor={(fId, selection) => setView({ ...view, floorId: fId, initialSelection: selection })}
                onUpdate={updateCampus}
                onSave={saveCampusStructure}
                onPublish={() => undefined}
                onPreviewStudent={openStudentPreview}
                publishingEnabled
                savedSnapshot={savedSnapshotsRef.current[activeCampus.id]}
                initialSelection={view.initialSelection}
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
      </TestRouteSessionProvider>

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

      {previewSaveCampus && (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Save before preview">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h2 className="text-base font-extrabold text-foreground">You have unsaved changes</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Save this campus before opening Student Preview so the preview is coherent.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPreviewSaveCampus(null)} disabled={previewSaving} className="h-9 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Cancel</button>
              <button onClick={saveAndOpenStudentPreview} disabled={previewSaving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground disabled:opacity-60">
                {previewSaving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
                Save &amp; Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {studentPreviewCampus && (
        <StudentPreview
          campus={studentPreviewCampus}
          validationIssues={computeLiveValidationIssues(studentPreviewCampus)}
          onBack={closeStudentPreview}
          onPublish={publishStudentPreview}
          onViewPublished={() => { setStudentPreviewCampus(null); window.location.assign("/map"); }}
        />
      )}
    </div>
  );
}
