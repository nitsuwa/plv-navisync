/** Focused multi-location event map editor for active Student Org accounts. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Link, Navigate, useBlocker, useLocation, useNavigate, useParams } from "react-router";
import { EventFloorEditor, type EventEditorDraftSnapshot } from "../components/events/EventFloorEditor";
import { feedbackPinsWithStatus, readEventFeedback } from "../lib/eventFeedbackPins";
import { countOpenFeedbackPins } from "../lib/eventFeedbackPins";
import { EventFeedbackChecklist } from "../components/events/EventFeedbackChecklist";
import { EventLocationSwitcher } from "../components/events/EventLocationSwitcher";
import { UnsavedChangesDialog } from "../components/map-builder/UnsavedChangesDialog";
import { clearEventLayoutDraft } from "../lib/eventDraftPersistence";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useToast } from "../hooks/useToast";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { useEventAutosave } from "../hooks/useEventAutosave";
import { stableEventJson } from "../lib/stableEventJson";
import { EventSubmissionReview } from "../components/events/EventSubmissionReview";
import { eventProtectedAccessRegions, validateEventLayout } from "../lib/eventLayoutValidation";
import { eventOverlayService } from "../services/eventOverlayService";
import { normalizeEventOverlayLocations, replaceEventOverlayLocation } from "../lib/eventOverlayModel";
import { CAMPUS_GROUNDS_ID, resolveFloorPlanForEvent } from "../lib/eventLocationData";
import { useEventOrganizationAccess } from "../hooks/useEventOrganizationAccess";
import type { EventOrganizationContext } from "../types/eventOrganization";
import type { Campus, CampusEventOverlay, EventOverlayLocation, EventLocationRef, FloorFurniture, FloorLabel } from "../components/map-builder/types";

function LoadingState() {
  return <div role="status" aria-live="polite" aria-busy="true" className="h-full min-h-0 bg-background flex items-center justify-center"><div className="flex flex-col items-center gap-3"><Loader2 aria-hidden="true" className="h-8 w-8 text-primary motion-safe:animate-spin" /><p className="text-sm text-muted-foreground">Loading event map...</p></div></div>;
}
function ErrorState({ message }: { message: string }) {
  return <div className="h-full min-h-0 overflow-y-auto bg-background flex items-center justify-center px-4 py-6"><div role="alert" className="text-center max-w-sm"><AlertCircle aria-hidden="true" className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><h2 className="text-lg font-extrabold text-foreground mb-2">Event map unavailable</h2><p className="text-sm text-muted-foreground mb-6">{message}</p><Link to="/student/events" className="inline-flex items-center gap-2 min-h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"><ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to My Events</Link></div></div>;
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
  return stableEventJson(a.map(({ id, eventFurniture, eventLabels }) => ({ id, eventFurniture, eventLabels })))
    === stableEventJson(b.map(({ id, eventFurniture, eventLabels }) => ({ id, eventFurniture, eventLabels })));
}

export function StudentEventEditPage() {
  const {id}=useParams<{id:string}>();
  const { search } = useLocation();
  const {isStudentOrg,profile,loading}=useStudentAuth();
  const historyRoute = new URLSearchParams(search).get("history") === "1";
  const access = useEventOrganizationAccess(profile?.id, isStudentOrg && !loading);
  if (loading) return <LoadingState/>;
  if (!isStudentOrg) return <Navigate to="/home" replace/>;
  if (!profile?.id) return <ErrorState message="Your session is unavailable. Sign in again to open your event maps."/>;
  if (access.loading) return <LoadingState/>;
  // Each actor, grant, and route owns its editor state; a handover clears the old session.
  const accessKey = access.organizations.map((organization) => `${organization.organizationId}:${organization.grantId}`).sort().join(",");
  return <StudentEventEditorSession key={`${profile.id}:${accessKey}:${id}:${historyRoute}`} ownerId={profile.id} organizations={access.organizations} historyRoute={historyRoute}/>;
}

function StudentEventEditorSession({ownerId,organizations,historyRoute}:{ownerId:string;organizations:EventOrganizationContext[];historyRoute:boolean}) {
  const reducedMotion = useReducedMotion();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { isStudentOrg, profile, loading: authLoading } = useStudentAuth();
  const { activeCampus, campuses, loading: campusLoading, error: campusError } = usePublishedCampus();
  const [overlay, setOverlay] = useState<CampusEventOverlay | null>(null);
  const [editAccess, setEditAccess] = useState<{organizationId:string|null;grantId:string|null;isArchived:boolean;canEditContent:boolean;canAddressFeedback:boolean}|null>(null);
  const [grantId, setGrantId] = useState<string | undefined>(undefined);
  const [draftLocations, setDraftLocations] = useState<EventOverlayLocation[] | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(null);
  const [pendingBack, setPendingBack] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submissionLocations, setSubmissionLocations] = useState<EventOverlayLocation[] | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackFocus, setFeedbackFocus] = useState<{ locationId: string; pinId: string; requestKey: number } | null>(null);
  const mutationRef = useRef(false);
  const interactionCommitRef = useRef<(() => EventEditorDraftSnapshot) | null>(null);
  const finalizeDraftRef = useRef<(() => void) | null>(null);
  const allowNavigationRef = useRef(false);
  const latestLocationsRef = useRef<EventOverlayLocation[]>([]);
  const activeEditorLocationIdRef = useRef<string | null>(null);
  const campusSnapshotRef = useRef<{ eventId: string; campus: Campus | null } | null>(null);
  const activeSession = useRef(true);
  useEffect(()=>{activeSession.current=true;return()=>{activeSession.current=false;};},[]);

  useEffect(() => {
    if (!id) {
      setError("No event ID provided.");
      setLoading(false);
      return;
    }
    Promise.all([eventOverlayService.getEventOverlay(id, historyRoute), eventOverlayService.getEventEditAccess(id)])
      .then(([data, serverAccess]) => {
        if (!activeSession.current) return;
        if (!data) {
          setError("The event does not exist or is no longer available.");
          return;
        }
        if (data.organizationId) {
          const organization = organizations.find((entry) => entry.organizationId === data.organizationId);
          if (!organization || serverAccess.organizationId !== organization.organizationId || !serverAccess.grantId || serverAccess.grantId !== organization.grantId) {
            setError("Your organization assignment changed or expired. Return to Organization Events and refresh access before opening this map.");
            return;
          }
          setGrantId(organization.grantId);
        } else if (data.createdByUserId !== ownerId) {
          setError('This event belongs to another student organization. Open one of your own events from My Events.');
          return;
        }
        if (historyRoute && (!serverAccess.isArchived || !data.archivedAt)) {
          setError("This archived layout is no longer available in organization history.");
          return;
        }
        if (!historyRoute && serverAccess.isArchived) {
          setError("This layout is archived. Open it from Event history to inspect the read-only copy.");
          return;
        }
        setEditAccess(serverAccess);
        const normalizedLocations = normalizeEventOverlayLocations(data);
        setOverlay(data);
        setDraftLocations(normalizedLocations);
        setActiveLocationId(normalizedLocations[0]?.id || "");
      })
      .catch((err) => {if(activeSession.current)setError(err instanceof Error ? err.message : "Failed to load event.");})
      .finally(() => {if(activeSession.current)setLoading(false);});
  }, [id,ownerId,organizations,historyRoute]);

  useEffect(() => {
    if (!overlay?.organizationId) return;
    const currentOrganization = organizations.find((entry) => entry.organizationId === overlay.organizationId);
    if (!currentOrganization || currentOrganization.grantId !== grantId) {
      activeSession.current = false;
      setOverlay(null);
      setDraftLocations(null);
      setEditAccess(null);
      setGrantId(undefined);
      setError("Organization access changed. Your saved work is safe; return to Organization Events to refresh your assignment.");
    }
  }, [grantId, organizations, overlay]);

  const persistedLocations = useMemo(() => overlay ? normalizeEventOverlayLocations(overlay) : [], [overlay]);
  const locations = draftLocations ?? persistedLocations;
  latestLocationsRef.current = locations;
  const activeLocation = locations.find((location) => location.id === activeLocationId) || locations[0];
  activeEditorLocationIdRef.current = activeLocation?.id ?? null;
  const captureLocations = useCallback(() => {
    const snapshot = interactionCommitRef.current?.();
    const locationId = activeEditorLocationIdRef.current;
    if (!snapshot || !locationId) return latestLocationsRef.current;
    // A delayed save callback may belong to a map that is no longer active.
    // The shared editor snapshot must always be applied to its current location.
    const next = replaceEventOverlayLocation(latestLocationsRef.current, locationId, snapshot.eventFurniture, snapshot.eventLabels);
    if (layoutsMatch(next, latestLocationsRef.current)) return latestLocationsRef.current;
    latestLocationsRef.current = next;
    setDraftLocations(next);
    return next;
  }, []);
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
      status: previous.status === "pending" ? "pending" : "draft",
      submittedAt: previous.status === "pending" ? previous.submittedAt : undefined,
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
    if (!activeSession.current || !overlay || !activeLocation || mutationRef.current) return false;
    mutationRef.current = true;
    setSaving(true);
    try {
      if (!editAccess?.canEditContent || editAccess.isArchived) return false;
      const saved = await eventOverlayService.updateEventOverlayLayout(overlay.id, nextLocations, overlay.updatedAt, grantId);
      if (!activeSession.current) return false;
      const allCurrentEditsSaved = layoutsMatch(nextLocations, captureLocations());
      updateOverlay(nextLocations);
      if (saved) setOverlay(saved);
      if (allCurrentEditsSaved) clearRecoveryDrafts();
      toast.success(overlay.status === "pending" ? "Submission maps saved" : "Draft saved", allCurrentEditsSaved ? `${activeLocation.locationRef.label} map changes were saved.` : "Earlier edits were saved. Newer changes remain in your draft.");
      return allCurrentEditsSaved;
    } catch (err) {
      if(activeSession.current)toast.error("Save failed", err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      mutationRef.current = false;
      if(activeSession.current)setSaving(false);
    }
  }, [activeLocation, captureLocations, clearRecoveryDrafts, editAccess, grantId, overlay, toast, updateOverlay]);

  const handleSave = useCallback(async (furniture: FloorFurniture[], labels: FloorLabel[]) => {
    if (!activeLocation) return false;
    const nextLocations = replaceEventOverlayLocation(latestLocationsRef.current, activeLocation.id, furniture, labels);
    latestLocationsRef.current = nextLocations;
    return saveLocations(nextLocations);
  }, [activeLocation, saveLocations]);

  const autosave = useCallback(async () => {
    if (!activeSession.current || !overlay || saving || submitting || mutationRef.current) return false;
    mutationRef.current = true;
    const snapshot = captureLocations();
    setSaving(true);
    try {
      if (!editAccess?.canEditContent || editAccess.isArchived) return false;
      const saved = await eventOverlayService.updateEventOverlayLayout(overlay.id, snapshot, overlay.updatedAt, grantId);
      if (!activeSession.current) return false;
      // Advance the persisted baseline without replacing edits made while saving.
      setOverlay((previous) => previous?.id === overlay.id ? {
        ...previous, ...(saved ?? {}), status: saved?.status ?? (previous.status === "pending" ? "pending" : "draft"), submittedAt: previous.status === "pending" ? previous.submittedAt : undefined, locations: snapshot,
        locationRef: snapshot[0]?.locationRef,
        eventFurniture: snapshot[0]?.eventFurniture || [],
        eventLabels: snapshot[0]?.eventLabels || [],
      } : previous);
      if (layoutsMatch(snapshot, latestLocationsRef.current)) clearRecoveryDrafts();
      return true;
    } catch { return false; }
    finally { mutationRef.current = false; if(activeSession.current)setSaving(false); }
  }, [captureLocations, clearRecoveryDrafts, editAccess, grantId, overlay, saving, submitting]);
  const saveStatus = useEventAutosave(
    isDirty,
    Boolean(overlay && editAccess?.canEditContent && !editAccess.isArchived && (overlay.status === "draft" || overlay.status === "disapproved" || overlay.status === "pending") && !saving && !feedbackSaving && !submitting && !pendingLocationId && !pendingBack && !submissionLocations && blocker.state !== "blocked"),
    locations,
    autosave,
  );

  const handleSubmit = useCallback(async (furniture: FloorFurniture[], labels: FloorLabel[]) => {
    if (!overlay || !editAccess?.canEditContent || editAccess.isArchived || !activeLocation || mutationRef.current) return false;
    if (countOpenFeedbackPins(overlay.locationFeedback, overlay.feedbackResolutions) > 0) {
      setFeedbackOpen(true);
      requestAnimationFrame(() => document.querySelector('[data-feedback-checklist]')?.scrollIntoView({ block: 'nearest' }));
      toast.error("Feedback needs attention", "Fix and mark every GSO pin as addressed in the feedback checklist before submitting.");
      return false;
    }
    const nextLocations = replaceEventOverlayLocation(latestLocationsRef.current, activeLocation.id, furniture, labels);
    latestLocationsRef.current = nextLocations;
    setDraftLocations(nextLocations);
    setSubmissionLocations(nextLocations);
    return false;
  }, [activeLocation, editAccess, overlay, toast]);

  const confirmSubmission = useCallback(async () => {
    if (!activeSession.current || !overlay || !editAccess?.canEditContent || editAccess.isArchived || !submissionLocations || saving || submitting || mutationRef.current) return;
    mutationRef.current = true;
    setSubmitting(true);
    try {
      if (overlay.status === "pending") {
        await eventOverlayService.updateEventOverlayLayout(overlay.id, submissionLocations, overlay.updatedAt, grantId);
      } else {
        await eventOverlayService.submitEventOverlayLayout(overlay.id, submissionLocations, overlay.updatedAt, grantId);
      }
      if (!activeSession.current) return;
      clearRecoveryDrafts();
      allowNavigationRef.current = true;
      toast.success(overlay.status === "pending" ? "Submission updated" : "Submitted to GSO", overlay.status === "pending" ? "Your saved changes are available to GSO. The proposal remains pending review." : "All requested locations and maps are now pending one combined review.");
      navigate("/student/events");
    } catch (err) {
      if(activeSession.current)toast.error("Submit failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      mutationRef.current = false;
      if(activeSession.current)setSubmitting(false);
    }
  }, [submissionLocations, saving, submitting, clearRecoveryDrafts, navigate, overlay, grantId, editAccess, toast]);

  const submissionChecks = useMemo(() => (submissionLocations ?? []).map((location) => {
    const floor = resolveLocationBaseMap(location.locationRef, eventCampus);
    const issues: Array<{ severity: "critical" | "warning" | "info"; message: string }> = !floor ? [{ severity: "critical" as const, message: "The published map is unavailable." }]
      : validateEventLayout({ furniture: location.eventFurniture, canvasWidth: floor.canvasW ?? 800, canvasHeight: floor.canvasH ?? 600, blockedRegions: eventProtectedAccessRegions(floor) });
    if (!location.eventFurniture.length && !location.eventLabels.length) issues.push({ severity: "critical", message: "Add the planned assets or labels to this map." });
    return { id: location.id, label: location.locationRef.label, furnitureCount: location.eventFurniture.length, labelCount: location.eventLabels.length, issues };
  }), [submissionLocations, eventCampus]);

  const closePrompt = useCallback(() => {
    setPendingBack(false);
    setPendingLocationId(null);
    setDialogError(null);
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);

  const continuePendingAction = useCallback(() => {
    const nextLocationId = pendingLocationId;
    setPendingLocationId(null);
    setDialogError(null);
    if (pendingBack) {
      setPendingBack(false);
      allowNavigationRef.current = true;
      navigate("/student/events");
    } else if (nextLocationId) setActiveLocationId(nextLocationId);
    else if (blocker.state === "blocked") blocker.proceed();
  }, [blocker, pendingLocationId, pendingBack, navigate]);

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

  const locateFeedback = useCallback((locationId: string, pinId: string) => {
    setFeedbackFocus({ locationId, pinId, requestKey: Date.now() });
    handleLocationChange(locationId);
  }, [handleLocationChange]);

  const changeFeedback = useCallback(async (locationId: string, pinId: string, addressed: boolean, note: string) => {
    if (!activeSession.current || !overlay || !editAccess?.canAddressFeedback || editAccess.isArchived || mutationRef.current) return;
    mutationRef.current = true;
    setFeedbackSaving(true);
    try {
      const saved = await eventOverlayService.setEventFeedbackPinAddressed(overlay, locationId, pinId, addressed, note, grantId);
      if (!activeSession.current) return;
      setOverlay(saved);
      toast.success(addressed ? 'Issue marked as addressed' : 'Issue reopened', 'Your checklist was saved for GSO review.');
    } catch (err) {
      if(activeSession.current)toast.error('Checklist not saved', err instanceof Error ? err.message : 'Please retry.');
    } finally { mutationRef.current = false; if(activeSession.current)setFeedbackSaving(false); }
  }, [editAccess, grantId, overlay, toast]);

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

  const archivedReadOnly = Boolean(editAccess?.isArchived);
  return <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="h-full min-h-0 flex flex-col overflow-hidden bg-background"><div className="shrink-0 px-3 py-2">{archivedReadOnly && <p role="status" className="mb-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Archived organization layout · read-only history</p>}<EventFeedbackChecklist overlay={overlay} busy={feedbackSaving || saving || submitting || !editAccess?.canAddressFeedback || archivedReadOnly} forceOpen={feedbackOpen} onLocatePin={locateFeedback} onChange={(...args) => void changeFeedback(...args)} /></div><div className="flex-1 min-h-0 flex flex-col lg:flex-row"><EventLocationSwitcher readOnly={!editAccess?.canEditContent || archivedReadOnly} presentation="responsive" locations={locations} activeLocationId={activeLocation.id} onChange={handleLocationChange} /><div className="flex-1 min-w-0 min-h-0"><EventFloorEditor key={activeLocation.id} readOnly={!editAccess?.canEditContent || archivedReadOnly} floorPlan={floorPlan} overlay={focusedOverlay} feedbackPins={feedbackPinsWithStatus(overlay.locationFeedback?.[activeLocation.id], overlay.feedbackResolutions?.[activeLocation.id]).filter(pin => !pin.addressed)} feedbackFocusRequest={feedbackFocus?.locationId === activeLocation.id ? feedbackFocus : null} activeCampus={eventCampus} onSave={handleSave} onSubmit={handleSubmit} onDraftChange={handleDraftChange} interactionCommitRef={interactionCommitRef} finalizeDraftRef={finalizeDraftRef} onBack={() => { if (archivedReadOnly) { navigate("/student/events"); return; } captureLocations(); setDialogError(null); setPendingBack(true); }} isSaving={saving || feedbackSaving} isSubmitting={submitting} saveStatus={saveStatus} tutorialAccountId={profile?.id} /></div></div><EventSubmissionReview feedbackTotal={Object.values(overlay.locationFeedback ?? {}).reduce((total, value) => total + readEventFeedback(value).pins.length, 0)} feedbackOpen={countOpenFeedbackPins(overlay.locationFeedback, overlay.feedbackResolutions)} updateMode={overlay.status === "pending"} open={Boolean(submissionLocations)} title={overlay.title} locations={submissionChecks} busy={submitting || saving || feedbackSaving} onClose={() => setSubmissionLocations(null)} onConfirm={() => void confirmSubmission()} onReviewLocation={(locationId) => { setSubmissionLocations(null); setActiveLocationId(locationId); }} /><UnsavedChangesDialog open={pendingBack || Boolean(pendingLocationId) || blocker.state === "blocked"} isDirty={isDirty || blocker.state === "blocked"} saving={saving} error={dialogError} description="Save your event map changes before leaving, or discard them." infoTitle="Leave event editor?" infoDescription="Your draft is saved. You can return to My Events and continue designing later." leaveLabel="Back to My Events" saveLabel={pendingBack ? "Save draft & leave" : "Save Draft"} discardLabel={pendingBack ? "Leave without saving" : "Don't Save"} onCancel={closePrompt} onSave={() => void saveAndContinue()} onDiscard={discardAndContinue} /></motion.div>;
}
