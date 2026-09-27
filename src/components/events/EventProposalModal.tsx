import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
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
  onRequestClose,
  dismissDisabled = false,
  step,
  footerClassName,
  discardConfirmationOpen = false,
  onDiscardConfirmationChange,
  onDiscard,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onRequestClose?: () => void;
  dismissDisabled?: boolean;
  step?: 1 | 2;
  footerClassName?: string;
  discardConfirmationOpen?: boolean;
  onDiscardConfirmationChange?: (open: boolean) => void;
  onDiscard?: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const focusBeforeConfirmationRef = useRef<HTMLElement | null>(null);
  const requestClose = () => {
    if (dismissDisabled) return;
    if (document.activeElement instanceof HTMLElement) focusBeforeConfirmationRef.current = document.activeElement;
    (onRequestClose ?? onClose)();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => { if (!open) requestClose(); }}
    >
      <Dialog.Portal>
        <Dialog.Overlay data-testid="proposal-modal-backdrop" className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!discardConfirmationOpen) focusBeforeConfirmationRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => { if (dismissDisabled) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (dismissDisabled) event.preventDefault(); }}
          className="fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden border border-border bg-card text-foreground shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92dvh] sm:w-[min(92vw,48rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.985, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.12 }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-5">
              <div className="min-w-0">
                <Dialog.Title ref={titleRef} tabIndex={-1} className="text-base font-extrabold text-foreground outline-none">{title}</Dialog.Title>
                {subtitle && <Dialog.Description className="mt-1 text-xs text-muted-foreground">{subtitle}</Dialog.Description>}
              </div>
              <button ref={closeButtonRef} type="button" aria-label="Close" onClick={requestClose} disabled={dismissDisabled} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">
                <XCircle aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            {step && (
              <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6" aria-label={`Proposal progress, step ${step} of 2`}>
                <ol className="grid grid-cols-2 gap-3">
                  {["Event information", "Requested locations"].map((label, index) => {
                    const stepNumber = (index + 1) as 1 | 2;
                    const current = step === stepNumber;
                    const complete = step > stepNumber;
                    return (
                      <li key={label} aria-current={current ? "step" : undefined} className="min-w-0">
                        <div className={cn("mb-2 h-1 rounded-full", complete || current ? "bg-primary" : "bg-muted")} />
                        <span className={cn("text-[11px]", current ? "font-bold text-foreground" : "text-muted-foreground")}>
                          <span className="mr-1.5">{complete ? "✓" : stepNumber}</span>{label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">{children}</div>
            <div data-testid="proposal-modal-footer" className={cn("flex shrink-0 gap-3 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4", footerClassName)}>{footer}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
      {onDiscardConfirmationChange && (
        <AlertDialog.Root open={discardConfirmationOpen} onOpenChange={onDiscardConfirmationChange}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm" />
            <AlertDialog.Content
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (document.activeElement === document.body) focusBeforeConfirmationRef.current?.focus();
                else if (!discardConfirmationOpen) focusBeforeConfirmationRef.current?.focus();
              }}
              className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl outline-none"
            >
              <AlertDialog.Title className="text-base font-bold">Discard this proposal?</AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">Your event details, poster, and requested locations will be lost.</AlertDialog.Description>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Cancel asChild>
                  <button type="button" className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Keep editing</button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button type="button" onClick={onDiscard} className="h-10 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive">Discard changes</button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </Dialog.Root>
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
  disabled = false,
}: {
  title: string;
  description: string;
  organizer: string;
  onChange: (field: "title" | "description" | "organizer", value: string) => void;
  posterFile: File | null;
  onPosterChange: (file: File | null) => void;
  showPoster?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-foreground leading-relaxed">
        Start with the event information. Dates are not required for this proposal; the administrator reviews the requested locations and maps together.
      </div>
      <div>
        <label htmlFor="event-title" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Event title *</label>
        <input id="event-title" value={title} disabled={disabled} onChange={(event) => onChange("title", event.target.value)} placeholder="e.g. Student Org Fair" className={inputClass} />
      </div>
      <div>
        <label htmlFor="event-description" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Description</label>
        <textarea id="event-description" value={description} disabled={disabled} onChange={(event) => onChange("description", event.target.value)} rows={4} placeholder="What is the event about?" className={cn(inputClass, "h-auto min-h-[96px] py-2.5 resize-y")} />
      </div>
      <div>
        <label htmlFor="event-organizer" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Organization name</label>
        <input id="event-organizer" value={organizer} disabled={disabled} onChange={(event) => onChange("organizer", event.target.value)} placeholder="Your student organization" className={inputClass} />
      </div>
      {showPoster && (
        <div>
          <label htmlFor="event-poster" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">Event poster (optional)</label>
          <label htmlFor="event-poster" className={cn("flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 transition-colors", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/50 hover:bg-muted/30")}>
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{posterFile?.name || "Choose an image to help identify the event"}</span>
          </label>
          <input id="event-poster" type="file" accept="image/*" disabled={disabled} className="sr-only" onChange={(event) => onPosterChange(event.target.files?.[0] || null)} />
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
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const submissionInFlightRef = useRef(false);
  const toast = useToast();
  const dirty = Boolean(title.trim() || description.trim() || organizer.trim() || posterFile || locations.length > 0);

  const requestClose = () => {
    if (submissionInFlightRef.current) return;
    if (dirty) setDiscardConfirmationOpen(true);
    else onClose();
  };

  const submit = async () => {
    if (submissionInFlightRef.current) return;
    if (!title.trim()) {
      setStep(1);
      setError("Event title is required.");
      return;
    }
    if (locations.length === 0) {
      setError("Select at least one requested location.");
      return;
    }
    submissionInFlightRef.current = true;
    setSaving(true);
    setError("");
    try {
      const posterUrl = await uploadPoster(posterFile);
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        organizer: organizer.trim() || "Student Organization",
        locations,
        posterUrl,
      });
      toast.success("Event created", "Choose a location and start designing its map.");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      toast.error("Create failed", message);
    } finally {
      submissionInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Create event proposal"
      subtitle={step === 1 ? "Step 1 of 2 · Event information" : "Step 2 of 2 · Requested locations"}
      onClose={onClose}
      onRequestClose={requestClose}
      dismissDisabled={saving}
      step={step}
      footerClassName="flex-col gap-2"
      discardConfirmationOpen={discardConfirmationOpen}
      onDiscardConfirmationChange={setDiscardConfirmationOpen}
      onDiscard={onClose}
      footer={
        <>
          {step === 2 && (
            <p id="event-create-help" role={error ? "alert" : "status"} aria-live="polite" className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
              {error || (locations.length === 0 ? "Select at least one requested location to continue." : "Your selected locations will be sent to the administrator for review.")}
            </p>
          )}
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row">
            <button type="button" onClick={step === 1 ? requestClose : () => { setStep(1); setError(""); }} disabled={saving} className="flex-1 h-11 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              {step === 1 ? "Cancel" : <><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</>}
            </button>
            {step === 1 ? (
              <button type="button" onClick={() => { if (!title.trim()) setError("Event title is required."); else { setError(""); setStep(2); } }} disabled={saving} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-50">
                Continue <ArrowRight className="inline h-4 w-4 ml-1" />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={saving || locations.length === 0} aria-describedby="event-create-help" className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create & design maps
              </button>
            )}
          </div>
        </>
      }
    >
      {step === 1 ? (
        <>
          <DetailsFields title={title} description={description} organizer={organizer} posterFile={posterFile} onPosterChange={setPosterFile} disabled={saving} onChange={(field, value) => { if (field === "title") setTitle(value); if (field === "description") setDescription(value); if (field === "organizer") setOrganizer(value); setError(""); }} />
          {error && <p role="alert" className="text-xs text-destructive mt-3">{error}</p>}
        </>
      ) : (
        <>
          <EventLocationPicker buildings={buildings} locations={locations} disabled={saving} onChange={(next) => { setLocations(next); setError(""); }} />
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
