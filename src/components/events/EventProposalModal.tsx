import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImageIcon, Loader2, Plus, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { getSupabase } from "../../lib/supabase";
import { normalizeEventOverlayLocations } from "../../lib/eventOverlayModel";
import type { CampusEventOverlay, EventLocationRef } from "../map-builder/types";
import type { EventBuildingOption } from "../../lib/eventLocationData";
import { EventLocationPicker } from "./EventLocationPicker";
import { useToast } from "../../hooks/useToast";

const inputClass =
  "w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

async function uploadPoster(file: File | null): Promise<string | undefined> {
  if (!file) return undefined;
  const supabase = getSupabase();
  const extension = file.name.split(".").pop() || "jpg";
  const path = `posters/${Math.random().toString(36).slice(2)}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("event_posters").upload(path, file);
  if (error) throw new Error(`Failed to upload poster: ${error.message}`);
  return supabase.storage.from("event_posters").getPublicUrl(path).data.publicUrl;
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary text-muted-foreground">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">{footer}</div>
      </motion.div>
    </div>
  );
}

function DetailsFields({
  title,
  description,
  organizer,
  onChange,
  posterFile,
  onPosterChange,
  showPoster = true,
}: {
  title: string;
  description: string;
  organizer: string;
  onChange: (field: "title" | "description" | "organizer", value: string) => void;
  posterFile: File | null;
  onPosterChange: (file: File | null) => void;
  showPoster?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-foreground leading-relaxed">
        Start with the event information. Dates are not required for this proposal; the administrator reviews the requested locations and maps together.
      </div>
      <div>
        <label htmlFor="event-title" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Event title *</label>
        <input id="event-title" value={title} onChange={(event) => onChange("title", event.target.value)} placeholder="e.g. Student Org Fair" className={inputClass} />
      </div>
      <div>
        <label htmlFor="event-description" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Description</label>
        <textarea id="event-description" value={description} onChange={(event) => onChange("description", event.target.value)} rows={4} placeholder="What is the event about?" className={cn(inputClass, "h-auto min-h-[96px] py-2.5 resize-y")} />
      </div>
      <div>
        <label htmlFor="event-organizer" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Organization name</label>
        <input id="event-organizer" value={organizer} onChange={(event) => onChange("organizer", event.target.value)} placeholder="Your student organization" className={inputClass} />
      </div>
      {showPoster && (
        <div>
          <label htmlFor="event-poster" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Event poster (optional)</label>
          <label htmlFor="event-poster" className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{posterFile?.name || "Choose an image to help identify the event"}</span>
          </label>
          <input id="event-poster" type="file" accept="image/*" className="sr-only" onChange={(event) => onPosterChange(event.target.files?.[0] || null)} />
        </div>
      )}
    </div>
  );
}

export function EventProposalModal({
  buildings,
  onClose,
  onCreate,
}: {
  buildings: EventBuildingOption[];
  onClose: () => void;
  onCreate: (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string }) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [locations, setLocations] = useState<EventLocationRef[]>([]);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const submit = async () => {
    if (!title.trim()) {
      setStep(1);
      setError("Event title is required.");
      return;
    }
    if (locations.length === 0) {
      setError("Select at least one requested location.");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        organizer: organizer.trim() || "Student Organization",
        locations,
        posterUrl: await uploadPoster(posterFile),
      });
      toast.success("Event created", "Choose a location and start designing its map.");
      onClose();
    } catch (err) {
      toast.error("Create failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Create event proposal"
      subtitle={step === 1 ? "Step 1 of 2 · Event information" : "Step 2 of 2 · Requested locations"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={step === 1 ? onClose : () => { setStep(1); setError(""); }} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">
            {step === 1 ? "Cancel" : <><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</>}
          </button>
          {step === 1 ? (
            <button type="button" onClick={() => { if (!title.trim()) setError("Event title is required."); else { setError(""); setStep(2); } }} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors">
              Continue <ArrowRight className="inline h-4 w-4 ml-1" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={saving || locations.length === 0} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create & design maps
            </button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <>
          <DetailsFields title={title} description={description} organizer={organizer} posterFile={posterFile} onPosterChange={setPosterFile} onChange={(field, value) => { if (field === "title") setTitle(value); if (field === "description") setDescription(value); if (field === "organizer") setOrganizer(value); setError(""); }} />
          {error && <p className="text-xs text-destructive mt-3">{error}</p>}
        </>
      ) : (
        <>
          <EventLocationPicker buildings={buildings} locations={locations} onChange={(next) => { setLocations(next); setError(""); }} />
          {error && <p className="text-xs text-destructive mt-3">{error}</p>}
        </>
      )}
    </ModalShell>
  );
}

export function EventDetailsModal({
  overlay,
  buildings,
  onClose,
  onSave,
}: {
  overlay: CampusEventOverlay;
  buildings: EventBuildingOption[];
  onClose: () => void;
  onSave: (data: { title: string; description: string; organizer: string; locations: EventLocationRef[]; posterUrl?: string }) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const existingLocations = normalizeEventOverlayLocations(overlay);
  const [title, setTitle] = useState(overlay.title);
  const [description, setDescription] = useState(overlay.description);
  const [organizer, setOrganizer] = useState(overlay.organizer);
  const [locations, setLocations] = useState<EventLocationRef[]>(existingLocations.map((location) => location.locationRef));
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState(overlay.posterUrl || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handlePoster = (file: File | null) => {
    if (!file) return;
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    if (!title.trim()) { setError("Event title is required."); return; }
    if (!locations.length) { setError("Select at least one requested location."); return; }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        organizer: organizer.trim() || "Student Organization",
        locations,
        posterUrl: posterFile ? await uploadPoster(posterFile) : undefined,
      });
      onClose();
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Edit event proposal" subtitle="Keep the information clear, then update the requested locations if needed." onClose={onClose} footer={<><button type="button" onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">Cancel</button><button type="button" onClick={save} disabled={saving} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes</button></>}>
      <div className="space-y-5">
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-3 w-full rounded-xl border border-dashed border-border px-4 py-3 text-left hover:border-primary/50 hover:bg-muted/30 transition-colors">
            {posterPreview ? <img src={posterPreview} alt="Event poster preview" className="w-12 h-12 rounded-lg object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">{posterPreview ? "Change poster" : "Add event poster (optional)"}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => handlePoster(event.target.files?.[0] || null)} />
        </div>
        <DetailsFields title={title} description={description} organizer={organizer} posterFile={posterFile} onPosterChange={handlePoster} showPoster={false} onChange={(field, value) => { if (field === "title") setTitle(value); if (field === "description") setDescription(value); if (field === "organizer") setOrganizer(value); setError(""); }} />
        <EventLocationPicker buildings={buildings} locations={locations} onChange={(next) => { setLocations(next); setError(""); }} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </ModalShell>
  );
}
