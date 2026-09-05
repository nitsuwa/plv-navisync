/**
 * StudentMyEventsPage — Student org event management page.
 *
 * Lists the student org's event overlays with status indicators.
 * Allows creating new events, editing layouts, and viewing feedback.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router";
import {
  CalendarDays,
  MapPin,
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Loader2,
  ArrowLeft,
  Pencil,
  ImageIcon,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { getSupabase } from "../lib/supabase";
import { EmptyState } from "../components/ui/EmptyState";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useToast } from "../hooks/useToast";
import { usePublishedCampus } from "../hooks/usePublishedCampus";
import {
  eventBuildingOptions,
  floorLookupId,
  type EventBuildingOption,
} from "../lib/eventLocationData";
import {
  eventOverlayService,
  type EventOverlayStatus,
} from "../services/eventOverlayService";
import type { CampusEventOverlay } from "../components/map-builder/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Status Config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EventOverlayStatus,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  pending: {
    label: "Pending Review",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30",
    icon: CheckCircle2,
  },
  disapproved: {
    label: "Needs Revision",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30",
    icon: XCircle,
  },
};

// ── Create Event Modal ─────────────────────────────────────────────────────

function CreateEventModal({
  buildings,
  onClose,
  onCreate,
}: {
  buildings: EventBuildingOption[];
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description: string;
    dateStart: string;
    dateEnd: string;
    organizer: string;
    buildingId: string;
    floorNumber: number;
    posterUrl?: string;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    dateStart: "",
    dateEnd: "",
    organizer: "",
    buildingId: buildings[0]?.buildingId ?? "",
    floorNumber: buildings[0]?.floors[0]?.number ?? 1,
    posterFile: null as File | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const building = buildings.find((b) => b.buildingId === form.buildingId);
  const floor =
    building?.floors.find((f) => f.number === form.floorNumber) ??
    building?.floors[0];

  const inputCls =
    "w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  const handleCreate = async () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Event title is required";
    if (!form.dateStart) errs.dateStart = "Start date is required";
    if (form.dateStart && form.dateEnd && form.dateEnd < form.dateStart)
      errs.dateEnd = "End must be after start";
    if (!building || !floor) errs.location = "Please choose an event location";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const startMs = new Date(form.dateStart).getTime();
    // When no end date is given, the event lasts a full day from the start.
    // (End === start would make the approved overlay invisible immediately.)
    const endDate = form.dateEnd
      ? new Date(form.dateEnd)
      : new Date(startMs + 24 * 60 * 60 * 1000);

    setSaving(true);
    try {
      let posterUrl: string | undefined = undefined;
      if (form.posterFile) {
        const supabase = getSupabase();
        const fileExt = form.posterFile.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `posters/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("event_posters")
          .upload(filePath, form.posterFile);

        if (uploadError) {
          throw new Error("Failed to upload poster: " + uploadError.message);
        }

        const { data: publicUrlData } = supabase.storage
          .from("event_posters")
          .getPublicUrl(filePath);

        posterUrl = publicUrlData.publicUrl;
      }

      await onCreate({
        title: form.title.trim(),
        description: form.description.trim(),
        dateStart: new Date(form.dateStart).toISOString(),
        dateEnd: endDate.toISOString(),
        organizer: form.organizer.trim() || "Student Organization",
        buildingId: building.buildingId,
        floorNumber: floor.number,
        posterUrl,
      });
      toast.success("Event created", "You can now design your event layout.");
      onClose();
    } catch (err) {
      toast.error(
        "Create failed",
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-extrabold text-foreground text-sm">
            Create Event Space
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary text-muted-foreground"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label
              htmlFor="ev-title"
              className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
            >
              Event Title *
            </label>
            <input
              id="ev-title"
              type="text"
              value={form.title}
              onChange={(e) => {
                setForm((p) => ({ ...p, title: e.target.value }));
                if (errors.title)
                  setErrors((p) => {
                    const n = { ...p };
                    delete n.title;
                    return n;
                  });
              }}
              placeholder="e.g. Student Org Fair 2026"
              className={
                inputCls +
                (errors.title ? " border-destructive focus:ring-destructive/30" : "")
              }
            />
            {errors.title && (
              <p className="text-[10px] text-destructive mt-1 font-medium">
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="ev-desc"
              className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
            >
              Description
            </label>
            <textarea
              id="ev-desc"
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              rows={2}
              placeholder="Brief event description..."
              className={cn(inputCls, "resize-y min-h-[44px] pt-2.5")}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="ev-start"
                className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
              >
                Start Date & Time *
              </label>
              <input
                id="ev-start"
                type="datetime-local"
                value={form.dateStart}
                onChange={(e) => {
                  setForm((p) => ({ ...p, dateStart: e.target.value }));
                  if (errors.dateStart)
                    setErrors((p) => {
                      const n = { ...p };
                      delete n.dateStart;
                      return n;
                    });
                }}
                className={
                  inputCls +
                  (errors.dateStart
                    ? " border-destructive focus:ring-destructive/30"
                    : "")
                }
              />
              {errors.dateStart && (
                <p className="text-[10px] text-destructive mt-1 font-medium">
                  {errors.dateStart}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="ev-end"
                className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
              >
                End Date & Time
              </label>
              <input
                id="ev-end"
                type="datetime-local"
                value={form.dateEnd}
                onChange={(e) => {
                  setForm((p) => ({ ...p, dateEnd: e.target.value }));
                  if (errors.dateEnd)
                    setErrors((p) => {
                      const n = { ...p };
                      delete n.dateEnd;
                      return n;
                    });
                }}
                className={
                  inputCls +
                  (errors.dateEnd
                    ? " border-destructive focus:ring-destructive/30"
                    : "")
                }
              />
              {errors.dateEnd && (
                <p className="text-[10px] text-destructive mt-1 font-medium">
                  {errors.dateEnd}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="ev-org"
              className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
            >
              Organization Name
            </label>
            <input
              id="ev-org"
              type="text"
              value={form.organizer}
              onChange={(e) =>
                setForm((p) => ({ ...p, organizer: e.target.value }))
              }
              placeholder="Your organization name"
              className={inputCls}
            />
          </div>

          <div>
            <label
              htmlFor="ev-poster"
              className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
            >
              Event Poster (Optional)
            </label>
            <input
              id="ev-poster"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setForm((p) => ({ ...p, posterFile: file || null }));
              }}
              className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
            />
          </div>

          <div>
            <label
              htmlFor="ev-location"
              className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
            >
              Event Location *
            </label>
            {buildings.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-xl px-4 py-3">
                No event locations are available. Please contact your
                administrator.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    id="ev-building"
                    value={form.buildingId}
                    onChange={(e) => {
                      const bid = e.target.value;
                      const next = buildings.find((b) => b.buildingId === bid);
                      setForm((p) => ({
                        ...p,
                        buildingId: bid,
                        floorNumber: next?.floors[0]?.number ?? 1,
                      }));
                      if (errors.location)
                        setErrors((p) => {
                          const n = { ...p };
                          delete n.location;
                          return n;
                        });
                    }}
                    className={
                      inputCls +
                      (errors.location
                        ? " border-destructive focus:ring-destructive/30"
                        : "")
                    }
                  >
                    {buildings.map((b) => (
                      <option key={b.buildingId} value={b.buildingId}>
                        {b.buildingName}
                      </option>
                    ))}
                  </select>
                  <select
                    id="ev-floor"
                    value={form.floorNumber}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        floorNumber: Number(e.target.value),
                      }))
                    }
                    className={
                      inputCls +
                      (errors.location
                        ? " border-destructive focus:ring-destructive/30"
                        : "")
                    }
                  >
                    {(building?.floors ?? []).map((f) => (
                      <option key={f.number} value={f.number}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.location && (
                  <p className="text-[10px] text-destructive mt-1 font-medium">
                    {errors.location}
                  </p>
                )}
                {building && floor && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {building.buildingName} — {floor.label}. Students will see
                    your approved layout on this floor's map.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !form.title.trim() || buildings.length === 0}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create & Design Layout
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Edit Event Details Modal ────────────────────────────────────────────────

function EditEventDetailsModal({
  overlay,
  buildings,
  onClose,
  onSave,
}: {
  overlay: CampusEventOverlay;
  buildings: EventBuildingOption[];
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    dateStart: string;
    dateEnd: string;
    organizer: string;
    buildingId: string;
    floorNumber: number;
    posterUrl?: string;
  }) => Promise<void>;
}) {
  const toDatetimeLocal = (iso: string) => {
    try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
  };

  const [form, setForm] = useState({
    title: overlay.title ?? "",
    description: overlay.description ?? "",
    dateStart: toDatetimeLocal(overlay.dateStart ?? ""),
    dateEnd: toDatetimeLocal(overlay.dateEnd ?? ""),
    organizer: overlay.organizer ?? "",
    buildingId: overlay.locationRef?.buildingId ?? (buildings[0]?.buildingId ?? ""),
    floorNumber: (() => {
      const match = overlay.locationRef?.floorId?.match(/-f(\d+)$/);
      return match ? parseInt(match[1], 10) : (buildings[0]?.floors[0]?.number ?? 1);
    })(),
    posterFile: null as File | null,
    posterPreview: overlay.posterUrl ?? null as string | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const building = buildings.find((b) => b.buildingId === form.buildingId);
  const floor = building?.floors.find((f) => f.number === form.floorNumber) ?? building?.floors[0];

  const inputCls =
    "w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, posterFile: file, posterPreview: URL.createObjectURL(file) }));
  };

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Event title is required";
    if (!form.dateStart) errs.dateStart = "Start date is required";
    if (form.dateStart && form.dateEnd && form.dateEnd < form.dateStart)
      errs.dateEnd = "End must be after start";
    if (!building || !floor) errs.location = "Please choose an event location";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const startMs = new Date(form.dateStart).getTime();
    const endDate = form.dateEnd
      ? new Date(form.dateEnd)
      : new Date(startMs + 24 * 60 * 60 * 1000);

    setSaving(true);
    try {
      let posterUrl: string | undefined = undefined;
      if (form.posterFile) {
        const supabase = getSupabase();
        const fileExt = form.posterFile.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `posters/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("event_posters")
          .upload(filePath, form.posterFile);
        if (uploadError) throw new Error("Failed to upload poster: " + uploadError.message);
        const { data: publicUrlData } = supabase.storage.from("event_posters").getPublicUrl(filePath);
        posterUrl = publicUrlData.publicUrl;
      }

      await onSave({
        title: form.title.trim(),
        description: form.description.trim(),
        dateStart: new Date(form.dateStart).toISOString(),
        dateEnd: endDate.toISOString(),
        organizer: form.organizer.trim() || "Student Organization",
        buildingId: building!.buildingId,
        floorNumber: floor!.number,
        posterUrl,
      });
      onClose();
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-foreground">Edit Event Details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Update title, dates, poster, and location</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Poster */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-2">Event Poster</label>
            <div
              className="relative w-full h-36 rounded-xl border-2 border-dashed border-border overflow-hidden cursor-pointer group hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {form.posterPreview ? (
                <img src={form.posterPreview} alt="Poster" className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <p className="text-xs font-semibold">Click to upload poster</p>
                </div>
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full">
                  {form.posterPreview ? "Change poster" : "Upload poster"}
                </span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePosterChange} />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">Event Title <span className="text-destructive">*</span></label>
            <input
              className={cn(inputCls, errors.title && "border-destructive ring-2 ring-destructive/20")}
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Foundation Week 2025"
            />
            {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">Description</label>
            <textarea
              className="w-full min-h-[72px] px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of the event…"
            />
          </div>

          {/* Organizer */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">Organizer</label>
            <input
              className={inputCls}
              value={form.organizer}
              onChange={(e) => setForm(f => ({ ...f, organizer: e.target.value }))}
              placeholder="Your organization name"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">Start <span className="text-destructive">*</span></label>
              <input
                type="datetime-local"
                className={cn(inputCls, errors.dateStart && "border-destructive")}
                value={form.dateStart}
                onChange={(e) => setForm(f => ({ ...f, dateStart: e.target.value }))}
              />
              {errors.dateStart && <p className="text-xs text-destructive mt-1">{errors.dateStart}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">End</label>
              <input
                type="datetime-local"
                className={cn(inputCls, errors.dateEnd && "border-destructive")}
                value={form.dateEnd}
                onChange={(e) => setForm(f => ({ ...f, dateEnd: e.target.value }))}
              />
              {errors.dateEnd && <p className="text-xs text-destructive mt-1">{errors.dateEnd}</p>}
            </div>
          </div>

          {/* Location */}
          {buildings.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Building</label>
                <select
                  className={inputCls}
                  value={form.buildingId}
                  onChange={(e) => {
                    const b = buildings.find(b => b.buildingId === e.target.value);
                    setForm(f => ({ ...f, buildingId: e.target.value, floorNumber: b?.floors[0]?.number ?? 1 }));
                  }}
                >
                  {buildings.map((b) => (
                    <option key={b.buildingId} value={b.buildingId}>{b.buildingName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Floor</label>
                <select
                  className={inputCls}
                  value={form.floorNumber}
                  onChange={(e) => setForm(f => ({ ...f, floorNumber: parseInt(e.target.value) }))}
                >
                  {(buildings.find(b => b.buildingId === form.buildingId)?.floors ?? []).map((fl) => (
                    <option key={fl.number} value={fl.number}>{fl.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function StudentMyEventsPage() {
  const navigate = useNavigate();
  const { isStudentOrg, profile } = useStudentAuth();
  const { activeCampus } = usePublishedCampus();
  const [overlays, setOverlays] = useState<CampusEventOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CampusEventOverlay | null>(null);
  const [editTarget, setEditTarget] = useState<CampusEventOverlay | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const buildings = useMemo(
    () => eventBuildingOptions(activeCampus),
    [activeCampus]
  );

  const loadOverlays = useCallback(async () => {
    setLoading(true);
    try {
      const data = await eventOverlayService.listEventOverlays({
        createdByUserId: profile?.id,
      });
      setOverlays(data);
    } catch {
      setOverlays([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadOverlays();
  }, [loadOverlays]);

  const handleCreate = async (data: {
    title: string;
    description: string;
    dateStart: string;
    dateEnd: string;
    organizer: string;
    buildingId: string;
    floorNumber: number;
    posterUrl?: string;
  }) => {
    const building = buildings.find((b) => b.buildingId === data.buildingId);
    const floor = building?.floors.find(
      (f) => f.number === data.floorNumber
    );
    const overlay = await eventOverlayService.createEventOverlay(
      {
        ...data,
        locationRef:
          building && floor
            ? {
                type: "building" as const,
                buildingId: building.buildingId,
                floorId: floorLookupId(building.buildingId, floor.number),
                label: `${building.buildingName} — ${floor.label}`,
              }
            : undefined,
      },
      profile?.id || "unknown"
    );
    loadOverlays();
    // Navigate to the event editor
    navigate(`/student/events/${overlay.id}/edit`);
  };

  const handleEditDetails = async (data: {
    title: string;
    description: string;
    dateStart: string;
    dateEnd: string;
    organizer: string;
    buildingId: string;
    floorNumber: number;
    posterUrl?: string;
  }) => {
    if (!editTarget) return;
    await eventOverlayService.updateEventOverlayDetails(editTarget.id, data);
    toast.success("Event updated", `"${data.title}" has been updated.`);
    setEditTarget(null);
    loadOverlays();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await eventOverlayService.deleteEventOverlay(deleteTarget.id);
      toast.success("Event deleted", `"${deleteTarget.title}" has been removed.`);
      setDeleteTarget(null);
      loadOverlays();
    } catch (err) {
      toast.error(
        "Delete failed",
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  };

  // Access control
  if (!isStudentOrg) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-extrabold text-foreground mb-2">
            Student Org Access Only
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            This page is only available to Student Organization accounts. If you
            believe this is an error, please contact your administrator.
          </p>
          <Link
            to="/home"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              to="/home"
              className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Home
            </Link>
            <h1 className="text-2xl font-extrabold text-foreground">
              My Events
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create and manage your event map layouts for GSO approval.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shrink-0 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> New Event
          </button>
        </div>

        {/* Event List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-2xl bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : overlays.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No events yet"
            description="Create your first event to start designing your event map layout."
            action={
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" /> Create Event
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {overlays.map((overlay) => {
              const status = overlay.status || "pending";
              const cfg = STATUS_CONFIG[status];
              const StatusIcon = cfg.icon;

              return (
                <motion.div
                  key={overlay.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-extrabold text-foreground text-sm">
                        {overlay.title}
                      </h3>
                      <div
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0",
                          cfg.bg,
                          cfg.color
                        )}
                      >
                        <StatusIcon className="h-3 w-3" /> {cfg.label}
                      </div>
                    </div>
                    {overlay.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {overlay.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(overlay.dateStart)} –{" "}
                        {formatDate(overlay.dateEnd)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {overlay.locationRef?.label || "No location set"}
                      </span>
                    </div>
                    {/* Layout stats */}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                        {overlay.eventFurniture?.length ?? 0} furniture
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                        {overlay.eventLabels?.length ?? 0} labels
                      </span>
                    </div>
                  </div>

                  {/* Admin Comment (if disapproved) */}
                  {status === "disapproved" && overlay.adminComment && (
                    <div className="px-5 py-3 border-t border-border bg-red-50/50 dark:bg-red-900/10">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase mb-0.5">
                            GSO Feedback
                          </p>
                          <p className="text-xs text-red-700 dark:text-red-300">
                            {overlay.adminComment}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-muted/20">
                    <button
                      onClick={() => setEditTarget(overlay)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-primary/30 text-xs font-bold text-primary hover:bg-primary/10 active:scale-[0.97] transition-all"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Details
                    </button>
                    <Link
                      to={`/student/events/${overlay.id}/edit`}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
                    >
                      <Edit2 className="h-3.5 w-3.5" />{" "}
                      {status === "disapproved" ? "Revise Layout" : "Edit Layout"}
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(overlay)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 active:scale-[0.97] transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateEventModal
          buildings={buildings}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Edit Details Modal */}
      {editTarget && (
        <EditEventDetailsModal
          overlay={editTarget}
          buildings={buildings}
          onClose={() => setEditTarget(null)}
          onSave={handleEditDetails}
        />
      )}

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            key="delete-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-extrabold text-foreground mb-1">
                Delete Event?
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                "{deleteTarget.title}" will be permanently removed. This action
                cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-bold hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {busy ? "Deleting..." : "Delete Event"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
