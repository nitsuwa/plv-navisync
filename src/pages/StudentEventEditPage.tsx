/**
 * StudentEventEditPage — Wrapper page that loads a specific
 * CampusEventOverlay by ID and opens the EventFloorEditor.
 *
 * Route: /student/events/:id/edit
 *
 * The editor canvas resolves against the SAME campus data source as the
 * student map (CampusMapPage) so event furniture lands exactly where the
 * org placed it. When no live campus is available it falls back to the
 * legacy demo data, mirroring the map's own fallback.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { eventOverlayService } from "../services/eventOverlayService";
import { EventFloorEditor } from "../components/events/EventFloorEditor";
import { useToast } from "../hooks/useToast";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import { resolveFloorPlanForEvent } from "../lib/eventLocationData";
import type { CampusEventOverlay } from "../components/map-builder/types";

export function StudentEventEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { activeCampus, loading: campusLoading } = usePublishedCampus();
  const [overlay, setOverlay] = useState<CampusEventOverlay | null>(null);
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

    eventOverlayService
      .getEventOverlay(id)
      .then((data) => {
        if (!data) {
          setError("Event not found.");
        } else {
          setOverlay(data);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load event.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = useCallback(
    async (
      furniture: import("../components/map-builder/types").FloorFurniture[],
      labels: import("../components/map-builder/types").FloorLabel[]
    ) => {
      if (!overlay) return;
      setSaving(true);
      try {
        await eventOverlayService.updateEventOverlayLayout(
          overlay.id,
          furniture,
          labels
        );
        setOverlay((prev) =>
          prev
            ? { ...prev, eventFurniture: furniture, eventLabels: labels }
            : prev
        );
        toast.success("Draft saved", "Your layout changes were saved.");
      } catch (err) {
        toast.error(
          "Save failed",
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setSaving(false);
      }
    },
    [overlay, toast]
  );

  const handleSubmit = useCallback(
    async (
      furniture: import("../components/map-builder/types").FloorFurniture[],
      labels: import("../components/map-builder/types").FloorLabel[]
    ) => {
      if (!overlay) return;
      setSubmitting(true);
      try {
        // Save the layout and mark it "pending" for GSO review. Submitting
        // must never self-approve — only admins approve overlays.
        await eventOverlayService.submitEventOverlayLayout(
          overlay.id,
          furniture,
          labels
        );
        toast.success(
          "Submitted to GSO",
          "Your event layout is now pending review."
        );
        navigate("/student/events");
      } catch (err) {
        toast.error(
          "Submit failed",
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [overlay, navigate, toast]
  );

  const handleBack = useCallback(() => {
    navigate("/student/events");
  }, [navigate]);

  // Loading state (event or campus)
  if (loading || campusLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading event...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !overlay) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-extrabold text-foreground mb-2">
            Event Not Found
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {error || "The event you're looking for doesn't exist."}
          </p>
          <Link
            to="/student/events"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
          >
            <ArrowLeft className="h-4 w-4" /> Back to My Events
          </Link>
        </div>
      </div>
    );
  }

  // Resolve the correct floor plan from the overlay's locationRef using the
  // same campus source the student map renders.
  const floorNumber = overlay.locationRef?.floorId
    ? Number(overlay.locationRef.floorId.split("-f").pop())
    : undefined;
  const floorPlan = overlay.locationRef?.buildingId
    ? resolveFloorPlanForEvent(
        overlay.locationRef.buildingId,
        floorNumber,
        activeCampus
      )
    : null;

  if (!floorPlan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-extrabold text-foreground mb-2">
            No Floor Plan Available
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            There is no floor plan data available for this event's location.
            Please contact your administrator.
          </p>
          <Link
            to="/student/events"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
          >
            <ArrowLeft className="h-4 w-4" /> Back to My Events
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <EventFloorEditor
        floorPlan={floorPlan}
        overlay={overlay}
        onSave={handleSave}
        onSubmit={handleSubmit}
        onBack={handleBack}
        isSaving={saving}
        isSubmitting={submitting}
      />
    </div>
  );
}
