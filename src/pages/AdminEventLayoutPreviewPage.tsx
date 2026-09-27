import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Eye, Loader2, MapPin } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { EventFloorEditor } from "../components/events/EventFloorEditor";
import { EventLocationSwitcher } from "../components/events/EventLocationSwitcher";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { eventOverlayService } from "../services/eventOverlayService";
import { normalizeEventOverlayLocations } from "../lib/eventOverlayModel";
import { CAMPUS_GROUNDS_ID, resolveFloorPlanForEvent } from "../lib/eventLocationData";
import type { Campus, CampusEventOverlay, EventLocationRef } from "../components/map-builder/types";

function PreviewError({ message }: { message: string }) {
  return <div className="min-h-[60vh] flex items-center justify-center px-4"><div className="text-center max-w-md"><AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" /><h2 className="text-lg font-extrabold text-foreground mb-2">Preview unavailable</h2><p className="text-sm text-muted-foreground mb-5">{message}</p><Link to="/admin-dashboard/event-layouts" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Back to event approvals</Link></div></div>;
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

export function AdminEventLayoutPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAdminAuth();
  const { activeCampus, campuses, loading: campusLoading, error: campusError } = usePublishedCampus();
  const [overlay, setOverlay] = useState<CampusEventOverlay | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No event ID provided.");
      setLoading(false);
      return;
    }
    eventOverlayService.getEventOverlay(id)
      .then((data) => {
        if (!data) {
          setError("The event overlay could not be found.");
          return;
        }
        setOverlay(data);
        setActiveLocationId(normalizeEventOverlayLocations(data)[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the preview."))
      .finally(() => setLoading(false));
  }, [id]);

  const locations = useMemo(() => overlay ? normalizeEventOverlayLocations(overlay) : [], [overlay]);
  const activeLocation = locations.find((location) => location.id === activeLocationId) || locations[0];
  const eventCampus = useMemo(() => {
    if (!overlay?.campusId) return activeCampus;
    return campuses.find((campus) => campus.id === overlay.campusId) ?? null;
  }, [activeCampus, campuses, overlay?.campusId]);
  const eventCampusMissing = Boolean(overlay?.campusId && !eventCampus);
  const allLocationsResolvable = useMemo(() => {
    if (eventCampusMissing || locations.length === 0) return false;
    return locations.every(({ locationRef }) => resolveLocationBaseMap(locationRef, eventCampus) !== null);
  }, [eventCampus, eventCampusMissing, locations]);
  const floorPlan = useMemo(() => {
    if (!activeLocation || !allLocationsResolvable) return null;
    return resolveLocationBaseMap(activeLocation.locationRef, eventCampus);
  }, [activeLocation, allLocationsResolvable, eventCampus]);

  if (authLoading || loading || campusLoading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <PreviewError message="Only administrators can inspect submitted event maps." />;
  if (error || !overlay) return <PreviewError message={error || "The event overlay could not be found."} />;
  if (!activeLocation) return <PreviewError message="This event has no requested locations to preview." />;
  if (eventCampusMissing) return <PreviewError message={`The published campus for this event${campusError ? ` could not be loaded: ${campusError}` : " is no longer available"}. Return to the event approvals list and contact the campus administrator.`} />;
  if (!allLocationsResolvable) return <PreviewError message="One or more requested locations no longer have a published map on this event's campus." />;

  const locationRef = activeLocation.locationRef;
  if (!floorPlan) return <PreviewError message={`There is no published map for ${locationRef.label}.`} />;

  const focusedOverlay = { ...overlay, locationRef, eventFurniture: activeLocation.eventFurniture, eventLabels: activeLocation.eventLabels };
  return <div className="space-y-4"><div className="flex items-start justify-between gap-4"><div><Link to="/admin-dashboard/event-layouts" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground mb-2"><ArrowLeft className="h-3 w-3" /> Event approvals</Link><h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2"><Eye className="h-6 w-6 text-primary" /> {overlay.title}</h1><p className="text-sm text-muted-foreground mt-1">Read-only inspection of {locations.length} requested location{locations.length === 1 ? "" : "s"}. Approval covers all maps together.</p></div><button type="button" onClick={() => navigate("/admin-dashboard/event-layouts")} className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted">Close preview</button></div><div className="h-[calc(100vh-13rem)] min-h-[520px] flex flex-col lg:flex-row bg-card border border-border rounded-2xl overflow-hidden"><EventLocationSwitcher locations={locations} activeLocationId={activeLocation.id} onChange={setActiveLocationId} /><div className="flex-1 min-w-0 min-h-0"><EventFloorEditor key={activeLocation.id} floorPlan={floorPlan} overlay={focusedOverlay} activeCampus={eventCampus} readOnly onSave={async () => {}} onSubmit={async () => {}} onBack={() => navigate("/admin-dashboard/event-layouts")} /></div></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-primary" /> The base map is administrator-published. Student additions are shown for review only.</div></div>;
}
