/** Focused multi-location event map editor for active Student Org accounts. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { EventFloorEditor } from "../components/events/EventFloorEditor";
import { EventLocationSwitcher } from "../components/events/EventLocationSwitcher";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useToast } from "../hooks/useToast";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { eventOverlayService } from "../services/eventOverlayService";
import { normalizeEventOverlayLocations, replaceEventOverlayLocation } from "../lib/eventOverlayModel";
import { CAMPUS_GROUNDS_ID, resolveFloorPlanForEvent } from "../lib/eventLocationData";
import type { CampusEventOverlay, FloorFurniture, FloorLabel } from "../components/map-builder/types";

function LoadingState() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Loading event map...</p></div></div>;
}
function ErrorState({ message }: { message: string }) {
  return <div className="min-h-screen bg-background flex items-center justify-center px-4"><div className="text-center max-w-sm"><AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><h2 className="text-lg font-extrabold text-foreground mb-2">Event map unavailable</h2><p className="text-sm text-muted-foreground mb-6">{message}</p><Link to="/student/events" className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"><ArrowLeft className="h-4 w-4" /> Back to My Events</Link></div></div>;
}

export function StudentEventEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { isStudentOrg, loading: authLoading } = useStudentAuth();
  const { activeCampus, loading: campusLoading } = usePublishedCampus();
  const [overlay, setOverlay] = useState<CampusEventOverlay | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        setOverlay(data);
        setActiveLocationId(normalizeEventOverlayLocations(data)[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load event."))
      .finally(() => setLoading(false));
  }, [id]);

  const locations = useMemo(() => overlay ? normalizeEventOverlayLocations(overlay) : [], [overlay]);
  const activeLocation = locations.find((location) => location.id === activeLocationId) || locations[0];

  const updateOverlay = useCallback((nextLocations: typeof locations) => {
    setOverlay((previous) => previous ? {
      ...previous,
      locations: nextLocations,
      locationRef: nextLocations[0]?.locationRef,
      eventFurniture: nextLocations[0]?.eventFurniture || [],
      eventLabels: nextLocations[0]?.eventLabels || [],
    } : previous);
  }, []);

  const handleSave = useCallback(async (furniture: FloorFurniture[], labels: FloorLabel[]) => {
    if (!overlay || !activeLocation) return;
    const nextLocations = replaceEventOverlayLocation(locations, activeLocation.id, furniture, labels);
    setSaving(true);
    try {
      await eventOverlayService.updateEventOverlayLayout(overlay.id, nextLocations);
      updateOverlay(nextLocations);
      toast.success("Draft saved", `${activeLocation.locationRef.label} map changes were saved.`);
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }, [activeLocation, locations, overlay, toast, updateOverlay]);

  const handleSubmit = useCallback(async (furniture: FloorFurniture[], labels: FloorLabel[]) => {
    if (!overlay || !activeLocation) return;
    const nextLocations = replaceEventOverlayLocation(locations, activeLocation.id, furniture, labels);
    setSubmitting(true);
    try {
      await eventOverlayService.submitEventOverlayLayout(overlay.id, nextLocations);
      toast.success("Submitted to GSO", "All requested locations and maps are now pending one combined review.");
      navigate("/student/events");
    } catch (err) {
      toast.error("Submit failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }, [activeLocation, locations, navigate, overlay, toast]);

  if (authLoading || loading || campusLoading) return <LoadingState />;
  if (!isStudentOrg) return <Navigate to="/home" replace />;
  if (error || !overlay) return <ErrorState message={error || "The event does not exist."} />;
  if (!activeLocation) return <ErrorState message="This event has no requested locations. Return to My Events and add a location before designing the map." />;

  const locationRef = activeLocation.locationRef;
  const floorNumber = locationRef.floorId ? Number(locationRef.floorId.split("-f").pop()) : undefined;
  const floorPlan = locationRef.type === "campus"
    ? resolveFloorPlanForEvent(CAMPUS_GROUNDS_ID, undefined, activeCampus)
    : locationRef.buildingId ? resolveFloorPlanForEvent(locationRef.buildingId, floorNumber, activeCampus) : null;
  if (!floorPlan) return <ErrorState message={`There is no published map for ${locationRef.label}. Please contact your administrator.`} />;

  const focusedOverlay: CampusEventOverlay = {
    ...overlay,
    locationRef,
    eventFurniture: activeLocation.eventFurniture,
    eventLabels: activeLocation.eventLabels,
  };

  return <div className="h-screen flex flex-col bg-background"><div className="flex-1 min-h-0 flex flex-col lg:flex-row"><EventLocationSwitcher locations={locations} activeLocationId={activeLocation.id} onChange={setActiveLocationId} /><div className="flex-1 min-w-0 min-h-0"><EventFloorEditor key={activeLocation.id} floorPlan={floorPlan} overlay={focusedOverlay} activeCampus={activeCampus} onSave={handleSave} onSubmit={handleSubmit} onBack={() => navigate("/student/events")} isSaving={saving} isSubmitting={submitting} /></div></div></div>;
}
