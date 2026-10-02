/** Focused multi-location event map editor for active Student Org accounts. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Link, Navigate, useBlocker, useNavigate, useParams } from "react-router";
import { EventFloorEditor, type EventEditorDraftSnapshot } from "../components/events/EventFloorEditor";
import { EventLocationSwitcher } from "../components/events/EventLocationSwitcher";
import { UnsavedChangesDialog } from "../components/map-builder/UnsavedChangesDialog";
import { clearEventLayoutDraft } from "../lib/eventDraftPersistence";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useToast } from "../hooks/useToast";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { useEventAutosave } from "../hooks/useEventAutosave";
import { EventSubmissionReview } from "../components/events/EventSubmissionReview";
import { eventProtectedAccessRegions, validateEventLayout } from "../lib/eventLayoutValidation";
import { eventOverlayService } from "../services/eventOverlayService";
import { normalizeEventOverlayLocations, replaceEventOverlayLocation } from "../lib/eventOverlayModel";
import { CAMPUS_GROUNDS_ID, resolveFloorPlanForEvent } from "../lib/eventLocationData";
import type { Campus, CampusEventOverlay, EventOverlayLocation, EventLocationRef, FloorFurniture, FloorLabel } from "../components/map-builder/types";

function LoadingState() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Loading event map...</p></div></div>;
}
function ErrorState({ message }: { message: string }) {
  return <div className="min-h-screen bg-background flex items-center justify-center px-4"><div className="text-center max-w-sm"><AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><h2 className="text-lg font-extrabold text-foreground mb-2">Event map unavailable</h2><p className="text-sm text-muted-foreground mb-6">{message}</p><Link to="/student/events" className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"><ArrowLeft className="h-4 w-4" /> Back to My Events</Link></div></div>;
}

function resolveLocationBaseMap(locationRef: EventLocationRef, campus: Campus | null) {
  if (locationRef.type === "campus") {
    return resolveFloorPlanForEvent(CAMPUS_GROUNDS_ID, undefined, campus);
  }
  if (!locationRef.buildingId) return null;
  const floorNumber = locationRef.floorId
    ? Number(locationRef.floorId.split("-f").pop())
    : undefined;
  return resolveFloorPlanForEvent(locationRef.buildingId, floorNumber, campus);
}

function layoutsMatch(a: EventOverlayLocation[], b: EventOverlayLocation[]): boolean {
  return JSON.stringify(a.map(({ id, eventFurniture, eventLabels }) => ({ id, eventFurniture, eventLabels })))
    === JSON.stringify(b.map(({ id, eventFurniture, eventLabels }) => ({ id, eventFurniture, eventLabels })));
}

export function StudentEventEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { isStudentOrg, profile, loading: authLoading } = useStudentAuth();
  const { activeCampus, campuses, loading: campusLoading, error: campusError } = usePublishedCampus();
  const [overlay, setOverlay] = useState<CampusEventOverlay | null>(null);
  const [draftLocations, setDraftLocations] = useState<EventOverlayLocation[] | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submissionLocations, setSubmissionLocations] = useState<EventOverlayLocation[] | null>(null);
  const interactionCommitRef = useRef<(() => EventEditorDraftSnapshot) | null>(null);
  const finalizeDraftRef = useRef<(() => void) | null>(null);
  const allowNavigationRef = useRef(false);
  const latestLocationsRef = useRef<EventOverlayLocation[]>([]);
  const campusSnapshotRef = useRef<{ eventId: string; campus: Campus | null } | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No event ID provided.");
      setLoading(false);
      return;
    }
    eventOverlayService.getEventOverlay(id)
      .then((data) => {
        if (!data) {
          setError("The event does not exist or is no longer available.");
          return;
        }
        const normalizedLocations = normalizeEventOverlayLocations(data);
        setOverlay(data);
        setDraftLocations(normalizedLocations);
        setActiveLocationId(normalizedLocations[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load event."))
      .finally(() => setLoading(false));
  }, [id]);

  const persistedLocations = useMemo(() => overlay ? normalizeEventOverlayLocations(overlay) : [], [overlay]);
  const locations = draftLocations ?? persistedLocations;
  latestLocationsRef.current = locations;
  const activeLocation = locations.find((location) => location.id === activeLocationId) || locations[0];
  const captureLocations = useCallback(() => {
    const snapshot = interactionCommitRef.current?.();
    if (!snapshot || !activeLocation) return latestLocationsRef.current;
    const next = replaceEventOverlayLocation(latestLocationsRef.current, activeLocation.id, snapshot.eventFurniture, snapshot.eventLabels);
    if (layoutsMatch(next, latestLocationsRef.current)) return latestLocationsRef.current;
    latestLocationsRef.current = next;
    setDraftLocations(next);
    return next;
  }, [activeLocation]);
  const isDirty = !layoutsMatch(locations, persistedLocations);
  const blocker = useBlocker(() => {
    if (allowNavigationRef.current || !overlay) return false;
    return !layoutsMatch(captureLocations(), persistedLocations);
  });

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current || !overlay || layoutsMatch(captureLocations(), persistedLocations)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [captureLocations, overlay, persistedLocations]);
  const activeLocationRef = activeLocation?.locationRef;
  const eventCampus = useMemo(() => {
    if (!overlay) return null;
    if (campusSnapshotRef.current?.eventId === overlay.id) return campusSnapshotRef.current.campus;
    const campus = overlay.campusId
      ? campuses.find((entry) => entry.id === overlay.campusId) ?? null
      : activeCampus;
    if (!campusLoading && (!overlay.campusId || campus)) campusSnapshotRef.current = { eventId: overlay.id, campus };
    return campus;
  }, [activeCampus, campuses, campusLoading, overlay]);
  const eventCampusMissing = Boolean(overlay?.campusId && !eventCampus);
  const allLocationsResolvable = useMemo(() => {
    if (eventCampusMissing || persistedLocations.length === 0) return false;
    return persistedLocations.every(({ locationRef }) => resolveLocationBaseMap(locationRef, eventCampus) !== null);
  }, [eventCampus, eventCampusMissing, persistedLocations]);
  const floorPlan = useMemo(() => {
    if (!activeLocationRef || !allLocationsResolvable) return null;
    return resolveLocationBaseMap(activeLocationRef, eventCampus);
  }, [activeLocationRef, allLocationsResolvable, eventCampus]);

  const updateOverlay = useCallback((nextLocations: typeof locations) => {
    setOverlay((previous) => previous ? {
      ...previous,
      status: "draft",
      submittedAt: undefined,
      locations: nextLocations,
      locationRef: nextLocations[0]?.locationRef,
      eventFurniture: nextLocations[0]?.eventFurniture || [],
      eventLabels: nextLocations[0]?.eventLabels || [],
    } : previous);
  }, []);

  const handleDraftChange = useCallback((furniture: FloorFurniture[], labels: FloorLabel[]) => {
    if (!activeLocation) return;
    const next = replaceEventOverlayLocation(
      latestLocationsRef.current,
      activeLocation.id,
      furniture,
      labels,
    );
    latestLocationsRef.current = next;
    setDraftLocations(next);
  }, [activeLocation]);

  const handleLocationChange = useCallback((nextLocationId: string) => {
    if (nextLocationId === activeLocation?.id) return;
    const next = captureLocations();
    if (!layoutsMatch(next, persistedLocations)) {
      setPendingLocationId(nextLocationId);
      setDialogError(null);
      return;
    }
    setActiveLocationId(nextLocationId);
  }, [activeLocation, captureLocations, persistedLocations]);

  const clearRecoveryDrafts = useCallback(() => {
    finalizeDraftRef.current?.();
    if (!overlay) return;
    for (const location of persistedLocations) clearEventLayoutDraft(overlay.id, location.locationRef);
  }, [overlay, persistedLocations]);

  const saveLocations = useCallback(async (nextLocations: EventOverlayLocation[]) => {
    if (!overlay || !activeLocation) return false;
    setSaving(true);
    try {
      await eventOverlayService.updateEventOverlayLayout(overlay.id, nextLocations);
      const allCurrentEditsSaved = layoutsMatch(nextLocations, captureLocations());
      updateOverlay(nextLocations);
      if (allCurrentEditsSaved) clearRecoveryDrafts();
      toast.success("Draft saved", allCurrentEditsSaved ? `${activeLocation.locationRef.label} map changes were saved.` : "Earlier edits were saved. Newer changes remain in your draft.");
      return allCurrentEditsSaved;
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [activeLocation, captureLocations, clearRecoveryDrafts, overlay, toast, updateOverlay]);

  const handleSave = useCallback(async (furniture: FloorFurniture[], labels: FloorLabel[]) => {
    if (!activeLocation) return false;
    const nextLocations = replaceEventOverlayLocation(latestLocationsRef.current, activeLocation.id, furniture, labels);
    latestLocationsRef.current = nextLocations;
    return saveLocations(nextLocations);
  }, [activeLocation, saveLocations]);

  const autosave = useCallback(async () => {
    if (!overlay || saving || submitting) return false;
    const snapshot = captureLocations();
    setSaving(true);
    try {
      await eventOverlayService.updateEventOverlayLayout(overlay.id, snapshot);
      // Advance the persisted baseline without replacing edits made while saving.
      setOverlay((previous) => previous?.id === overlay.id ? {
        ...previous, status: "draft", submittedAt: undefined, locations: snapshot,
        locationRef: snapshot[0]?.locationRef,
        eventFurniture: snapshot[0]?.eventFurniture || [],
        eventLabels: snapshot[0]?.eventLabels || [],
      } : previous);
      if (layoutsMatch(snapshot, latestLocationsRef.current)) clearRecoveryDrafts();
      return true;
    } catch { return false; }
    finally { setSaving(false); }
  }, [captureLocations, clearRecoveryDrafts, overlay, saving, submitting]);
  const saveStatus = useEventAutosave(
    isDirty,
    Boolean(overlay && (overlay.status === "draft" || overlay.status === "disapproved") && !saving && !submitting && !pendingLocationId && !submissionLocations && blocker.state !== "blocked"),
    locations,
    autosave,
  );

  const handleSubmit = useCallback(async (furniture: FloorFurniture[], labels: FloorLabel[]) => {
    if (!overlay || !activeLocation) return false;
    const nextLocations = replaceEventOverlayLocation(latestLocationsRef.current, activeLocation.id, furniture, labels);
    latestLocationsRef.current = nextLocations;
    setDraftLocations(nextLocations);
    setSubmissionLocations(nextLocations);
    return false;
  }, [activeLocation, overlay]);

  const confirmSubmission = useCallback(async () => {
    if (!overlay || !submissionLocations || saving || submitting) return;
    setSubmitting(true);
    try {
      await eventOverlayService.submitEventOverlayLayout(overlay.id, submissionLocations);
      clearRecoveryDrafts();
      allowNavigationRef.current = true;
      toast.success("Submitted to GSO", "All requested locations and maps are now pending one combined review.");
      navigate("/student/events");
    } catch (err) {
      toast.error("Submit failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }, [submissionLocations, saving, submitting, clearRecoveryDrafts, navigate, overlay, toast]);

  const submissionChecks = useMemo(() => (submissionLocations ?? []).map((location) => {
    const floor = resolveLocationBaseMap(location.locationRef, eventCampus);
    const issues: Array<{ severity: "critical" | "warning" | "info"; message: string }> = !floor ? [{ severity: "critical" as const, message: "The published map is unavailable." }]
      : validateEventLayout({ furniture: location.eventFurniture, canvasWidth: floor.canvasW ?? 800, canvasHeight: floor.canvasH ?? 600, blockedRegions: eventProtectedAccessRegions(floor) });
    if (!location.eventFurniture.length && !location.eventLabels.length) issues.push({ severity: "critical", message: "Add the planned assets or labels to this map." });
    return { id: location.id, label: location.locationRef.label, furnitureCount: location.eventFurniture.length, labelCount: location.eventLabels.length, issues };
  }), [submissionLocations, eventCampus]);

  const closePrompt = useCallback(() => {
    setPendingLocationId(null);
    setDialogError(null);
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);

  const continuePendingAction = useCallback(() => {
    const nextLocationId = pendingLocationId;
    setPendingLocationId(null);
    setDialogError(null);
    if (nextLocationId) setActiveLocationId(nextLocationId);
    else if (blocker.state === "blocked") blocker.proceed();
  }, [blocker, pendingLocationId]);

  const discardAndContinue = useCallback(() => {
    clearRecoveryDrafts();
    latestLocationsRef.current = persistedLocations;
    setDraftLocations(persistedLocations);
    continuePendingAction();
  }, [clearRecoveryDrafts, continuePendingAction, persistedLocations]);

  const saveAndContinue = useCallback(async () => {
    const nextLocations = captureLocations();
    const saved = await saveLocations(nextLocations);
    if (saved) continuePendingAction();
    else setDialogError("Save failed. Your changes are still in the editor.");
  }, [captureLocations, continuePendingAction, saveLocations]);

  if (loading || ((authLoading || campusLoading) && !campusSnapshotRef.current)) return <LoadingState />;
  if (!authLoading && !isStudentOrg) return <Navigate to="/home" replace />;
  if (error || !overlay) return <ErrorState message={error || "The event does not exist."} />;
  if (!activeLocation) return <ErrorState message="This event has no requested locations. Return to My Events and add a location before designing the map." />;

  const locationRef = activeLocation.locationRef;
  if (eventCampusMissing) {
    return <ErrorState message={`The published campus for this event${campusError ? ` could not be loaded: ${campusError}` : " is no longer available"}. Please contact your administrator.`} />;
  }
  if (!allLocationsResolvable || !floorPlan) {
    return <ErrorState message={`There is no published map for ${locationRef.label} on this event's campus. Please contact your administrator.`} />;
  }

  const focusedOverlay: CampusEventOverlay = {
    ...overlay,
    locationRef,
    eventFurniture: activeLocation.eventFurniture,
    eventLabels: activeLocation.eventLabels,
  };

  return <div className="h-full min-h-0 flex flex-col overflow-hidden bg-background"><div className="flex-1 min-h-0 flex flex-col lg:flex-row"><EventLocationSwitcher locations={locations} activeLocationId={activeLocation.id} onChange={handleLocationChange} /><div className="flex-1 min-w-0 min-h-0"><EventFloorEditor key={activeLocation.id} floorPlan={floorPlan} overlay={focusedOverlay} activeCampus={eventCampus} onSave={handleSave} onSubmit={handleSubmit} onDraftChange={handleDraftChange} interactionCommitRef={interactionCommitRef} finalizeDraftRef={finalizeDraftRef} onBack={() => navigate("/student/events")} isSaving={saving} isSubmitting={submitting} saveStatus={saveStatus} tutorialAccountId={profile?.id} /></div></div><EventSubmissionReview open={Boolean(submissionLocations)} title={overlay.title} locations={submissionChecks} busy={submitting || saving} onClose={() => setSubmissionLocations(null)} onConfirm={() => void confirmSubmission()} onReviewLocation={(locationId) => { setSubmissionLocations(null); setActiveLocationId(locationId); }} /><UnsavedChangesDialog open={Boolean(pendingLocationId) || blocker.state === "blocked"} isDirty={isDirty || blocker.state === "blocked"} saving={saving} error={dialogError} description="Save your event map changes before leaving, or discard them." discardLabel="Don't Save" onCancel={closePrompt} onSave={() => void saveAndContinue()} onDiscard={discardAndContinue} /></div>;
}
