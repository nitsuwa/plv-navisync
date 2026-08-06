import { useState, useRef, useCallback, useEffect, useId, lazy, Suspense, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, Eye, EyeOff, CheckCircle2, ChevronRight, ChevronLeft, Palette, Image, Building2, Shield, Pencil, Loader2, AlertCircle, TriangleAlert, ChevronDown, Save, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";
import { genId, THEME_COLORS } from "./constants";
import { MapPicker } from "../ui/MapPicker";
import { PLVLogo } from "../ui/PLVLogo";

const ColorPickerImpl = lazy(() => import("../ui/ColorPicker"));
function ColorPicker(props: { value: string; onChange: (c: string) => void }) {
  return (
    <Suspense fallback={<div className="h-10 rounded-xl border border-border bg-muted/30 animate-pulse" />}>
      <ColorPickerImpl {...props} />
    </Suspense>
  );
}
import type { Campus } from "./types";

// ── Tooltip that renders via portal to escape overflow / transform containers ──

// ── Inline toast notification ──────────────────────────────────────────────

function ValidationToast({ message, visible, onHide }: { message: string; visible: boolean; onHide: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, 4000);
    return () => clearTimeout(timer);
  }, [visible, onHide]);

  if (!visible) return null;

  return createPortal(
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-destructive/30 bg-destructive/10 backdrop-blur-md shadow-lg shadow-destructive/10">
        <TriangleAlert className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-xs font-bold text-destructive">{message}</span>
      </div>
    </div>,
    document.body
  );
}

// ── Shake animation CSS ────────────────────────────────────────────────────

const SHAKE_KEYFRAMES = `
@keyframes wizard-shake {
  0%, 100% { transform: translateX(0); }
  10%, 50%, 90% { transform: translateX(-4px); }
  30%, 70% { transform: translateX(4px); }
}
`;

// ── Tooltip that renders via portal to escape overflow / transform containers ──

function FieldTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean }>({ x: 0, y: 0, above: true });

  const showTooltip = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Show above if there's enough room, otherwise below
      const above = rect.top > 160;
      setPos({
        x: rect.left + rect.width / 2,
        y: above ? rect.top : rect.bottom,
        above,
      });
    }
    setShow(true);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const scheduleHide = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setShow(false), 200);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  return (
    <span className="inline-flex items-center">
      <span
        ref={triggerRef}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/15 text-muted-foreground/60 text-[9px] font-extrabold flex-shrink-0 cursor-help hover:bg-primary/15 hover:text-primary transition-colors align-middle select-none"
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleHide}
      >
        ?
      </span>
      {/* Render tooltip at document body via portal to escape overflow / transform ancestors */}
      {show && createPortal(
        <div
          ref={tooltipRef}
          onMouseEnter={cancelHide}
          onMouseLeave={() => setShow(false)}
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: pos.above ? 'translate(-50%, -100%) translateY(-10px)' : 'translate(-50%, 0) translateY(10px)',
            zIndex: 9999,
          }}
          className="w-64 px-3.5 py-2.5 rounded-xl bg-foreground text-background text-[11px] font-medium leading-relaxed shadow-xl text-center"
        >
          {text}
          {/* Arrow pointing toward the trigger */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              ...(pos.above ? { top: '100%' } : { bottom: '100%' }),
            }}
          >
            <div
              style={{
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                ...(pos.above
                  ? { borderTop: '6px solid var(--foreground)' }
                  : { borderBottom: '6px solid var(--foreground)' }
                ),
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

function FieldLabel({ label, tooltip, required, htmlFor }: { label: string; tooltip?: string; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
      {label}
      <span className={cn(
        "text-[9px] font-medium",
        required ? "text-red-400" : "text-muted-foreground/40"
      )}>
        {required ? "(required)" : "(optional)"}
      </span>
      {tooltip && <FieldTooltip text={tooltip} />}
    </label>
  );
}

// ── Editable summary card ───────────────────────────────────────────────────

function SummaryCard({ icon: Icon, title, children, onEdit }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div            className="rounded-xl border border-border bg-muted/20 p-4 relative">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Icon className="h-3 w-3" /> {title}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Validation helpers ─────────────────────────────────────────────────────

interface FieldError {
  field: string;
  message: string;
}

const VALIDATIONS: Record<number, (values: Record<string, string>) => FieldError[]> = {
  1: (v) => {
    const errs: FieldError[] = [];
    if (!v.name?.trim()) errs.push({ field: "name", message: "Campus name is required" });
    if (v.code?.trim() && !/^[A-Z0-9 _-]+$/.test(v.code.trim())) {
      errs.push({ field: "code", message: "Only letters, numbers, spaces, hyphens, and underscores allowed" });
    }
    return errs;
  },
  2: (v) => {
    const errs: FieldError[] = [];
    if (v.postalCode?.trim() && !/^\d{4}$/.test(v.postalCode.trim())) {
      errs.push({ field: "postalCode", message: "Enter a valid 4-digit postal code" });
    }
    return errs;
  },
  3: () => [],
  4: () => [], // No form fields in Review step
};

// ── Step config ─────────────────────────────────────────────────────────────

const STEP_CONFIG = [
  { title: "Campus Identity",   icon: Building2,     description: "Give your campus a name and short code" },
  { title: "Campus Location",   icon: MapPin,        description: "Search for your campus on the map or click to place a pin" },
  { title: "Campus Appearance", icon: Palette,       description: "Upload a thumbnail, logo, and pick a theme color" },
  { title: "Review & Create",   icon: CheckCircle2,  description: "Review everything before creating" },
];

interface CampusWizardProps {
  draft: Partial<Campus>;
  step: 1 | 2 | 3 | 4;
  onNext: (data: Partial<Campus>) => void;
  onBack: () => void;
  onFinish: (campus: Campus) => void;
  onClose: () => void;
  onJumpToStep?: (step: 1 | 2 | 3 | 4) => void;
  publishingEnabled?: boolean;
}

// ── Saving overlay (mimics LoadingScreen style) ──────────────────────────────
function SavingOverlay({ campusName }: { campusName: string }) {
  const [phase, setPhase] = useState<"entering" | "visible" | "done">("entering");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("visible"), 50);
    return () => clearTimeout(t1);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)",
        opacity: phase === "entering" ? 0 : 1,
        transition: "opacity 0.4s ease",
      }}
    >
      <div className="flex flex-col items-center gap-6">
        <div
          style={{
            animation: phase === "visible" ? "hero-breathe 2s ease-in-out infinite" : "none",
            opacity: phase === "entering" ? 0 : 1,
            transform: phase === "entering" ? "scale(0.8)" : "scale(1)",
            transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <PLVLogo size={80} />
        </div>
        <div
          className="text-center"
          style={{
            opacity: phase === "entering" ? 0 : 1,
            transform: phase === "entering" ? "translateY(12px)" : "translateY(0)",
            transition: "opacity 0.5s ease 0.2s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
          }}
        >
          <h1 className="text-lg font-extrabold text-white tracking-tight">Saving Changes</h1>
          <p className="text-white/40 text-xs font-semibold tracking-widest uppercase mt-1">{campusName}</p>
        </div>
        <div className="flex gap-2 mt-2" style={{ opacity: phase === "entering" ? 0 : 1, transition: "opacity 0.4s ease 0.4s" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-accent/80"
              style={{ animation: `loading-bounce 1s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Confirmation dialog for editing ─────────────────────────────────────────
function SaveConfirmDialog({ open, campusName, onConfirm, onCancel }: {
  open: boolean;
  campusName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4 p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-sm font-extrabold text-foreground">Save Changes?</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              You are about to save changes to <span className="font-bold text-foreground">{campusName}</span>. Do you want to continue?
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onCancel} className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 shadow-sm transition-all">
            Yes, Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function CampusWizard({ draft, step, onNext, onBack, onFinish, onClose, onJumpToStep, publishingEnabled = true }: CampusWizardProps) {
  const uid = useId();

  // ── Step 1: Identity ──────────────────────────────────────────────────────
  const [name, setName] = useState(draft.name ?? "");
  const [code, setCode] = useState(draft.code ?? "");
  const [desc, setDesc] = useState(draft.description ?? "");

  // ── Step 2: Location ──────────────────────────────────────────────────────
  const [address, setAddress] = useState(draft.address ?? "");
  const [city, setCity] = useState(draft.city ?? "");
  const [province, setProvince] = useState(draft.province ?? "");
  const [postalCode, setPostalCode] = useState(draft.postalCode ?? "");
  const [latStr, setLatStr] = useState(draft.coordinates?.lat?.toString() ?? "");
  const [lngStr, setLngStr] = useState(draft.coordinates?.lng?.toString() ?? "");

  // ── Step 3: Appearance ────────────────────────────────────────────────────
  const [thumbnail, setThumbnail] = useState<string | null>(draft.thumbnail ?? null);
  const [logo, setLogo] = useState<string | null>(draft.logo ?? null);
  const [themeColor, setThemeColor] = useState(draft.themeColor ?? "#1e3a5f");
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Visibility (shown on Review page) ────────────────────────────────────
  const [publishStatus, setPublishStatus] = useState<"draft" | "published">(draft.publishStatus ?? "draft");
  const [visibleToStudents, setVisibleToStudents] = useState(draft.visibleToStudents ?? false);

  // ── Track which steps have actually been completed (user clicked Continue) ──
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // ── Edit mode detection ────────────────────────────────────────────────────
  const isEditing = !!draft.id;

  // ── Confirmation & saving state ────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSaving, setShowSaving] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);

  // ── Track if user has made any changes from the initial draft ────────────
  const draftLat = draft.coordinates?.lat?.toString() ?? "";
  const draftLng = draft.coordinates?.lng?.toString() ?? "";
  const hasChanges = name !== (draft.name ?? "") || code !== (draft.code ?? "") || desc !== (draft.description ?? "") ||
    address !== (draft.address ?? "") || city !== (draft.city ?? "") || province !== (draft.province ?? "") ||
    postalCode !== (draft.postalCode ?? "") || latStr !== draftLat || lngStr !== draftLng ||
    thumbnail !== (draft.thumbnail ?? null) || logo !== (draft.logo ?? null) ||
    themeColor !== (draft.themeColor ?? "#1e3a5f") ||
    publishStatus !== (draft.publishStatus ?? "draft") || visibleToStudents !== (draft.visibleToStudents ?? false);

  const handleClose = useCallback(() => {
    if (isEditing && hasChanges) {
      setShowUnsaved(true);
    } else {
      onClose();
    }
  }, [isEditing, hasChanges, onClose]);

  // ── Validation state ──────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Expandable address details ────────────────────────────────────────────
  const [addressExpanded, setAddressExpanded] = useState(false);
  const userCollapsedRef = useRef(false);

  // Auto-expand if draft has pre-existing address data on first mount
  useEffect(() => {
    if (draft.address || draft.city || draft.province) {
      setAddressExpanded(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Locate Campus trigger removed — the My Location button in MapPicker is sufficient

  // ── Input class names ─────────────────────────────────────────────────────

  const inputCls =
    "w-full h-10 px-3.5 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow";
  const errorInputCls =
    "w-full h-10 px-3.5 rounded-xl border border-destructive bg-destructive/5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-destructive/30 transition-shadow";

  // ── Helper: build field values object for the current step ─────────────────

  const getStepValues = useCallback((s: number): Record<string, string> => {
    switch (s) {
      case 1: return { name, code };
      case 2: return { address, city, province, postalCode };
      case 3: return {};
      default: return {};
    }
  }, [name, code, address, city, province, postalCode]);

  // ── Helper: run validation for a step ─────────────────────────────────────

  const validateStep = useCallback((s: number): FieldError[] => {
    const fn = VALIDATIONS[s];
    if (!fn) return [];
    return fn(getStepValues(s));
  }, [getStepValues]);

  // ── Helper: convert errors array to map ───────────────────────────────────

  const errorsToMap = (errs: FieldError[]): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const e of errs) map[e.field] = e.message;
    return map;
  };

  // ── Trigger shake animation ───────────────────────────────────────────────

  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }, []);

  // ── Show toast ────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  }, []);

  const hideToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  // ── Scroll to the first invalid field ─────────────────────────────────────

  const scrollToFirstError = useCallback((errs: FieldError[]) => {
    if (errs.length === 0) return;
    const first = errs[0];
    const id = `${uid}-${first.field}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.focus(), 350);
    }
  }, [uid]);

  // ── Validate current step and show errors / toast / shake ─────────────────

  const attemptProceed = useCallback((targetStep?: number): boolean => {
    const currentStep = targetStep ?? step;
    // Don't validate the review step when proceeding from it (it's the final step)
    if (currentStep >= 4) return true;
    const errs = validateStep(currentStep);
    if (errs.length > 0) {
      setErrors(prev => ({ ...prev, ...errorsToMap(errs) }));
      // Mark all fields as touched so errors show
      const newTouched = { ...touched };
      errs.forEach(e => { newTouched[e.field] = true; });
      setTouched(newTouched);
      triggerShake();
      showToast("Please complete all required fields before continuing.");
      scrollToFirstError(errs);
      return false;
    }
    return true;
  }, [step, validateStep, touched, triggerShake, showToast, scrollToFirstError]);

  // ── Mark a field as edited (flag for onBlur validation) ───────────────────

  const markEdited = useCallback((field: string) => {
    setEditedFields(prev => new Set(prev).add(field));
  }, []);

  // ── Validate field on blur (only if it has been edited) ───────────────────

  const handleBlur = useCallback((field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    if (!editedFields.has(field)) return;
    const vals = getStepValues(step);
    const errs = validateStep(step);
    const fieldErr = errs.find(e => e.field === field);
    setErrors(prev => ({
      ...prev,
      [field]: fieldErr ? fieldErr.message : "",
    }));
  }, [editedFields, getStepValues, validateStep, step]);

  // ── Helper to get error for a field ───────────────────────────────────────

  const getError = useCallback((field: string): string | undefined => {
    return touched[field] ? errors[field] : undefined;
  }, [touched, errors]);

  // ── Step icon ──────────────────────────────────────────────────────────────

  const StepIcon = STEP_CONFIG[step - 1].icon;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFinish = () => {
    setShowConfirm(true);
  };

  const handleDiscardClose = () => {
    setShowUnsaved(false);
    onClose();
  };

  const handleConfirmSave = () => {
    setShowConfirm(false);
    setShowSaving(true);
    const now = new Date().toISOString().slice(0, 10);
    const newCampus: Campus = {
      id: draft.id ?? genId("campus"),
      name: name,
      code: code ?? "",
      description: desc ?? "",
      address: address ?? "",
      city: city ?? "",
      province: province ?? "",
      postalCode: postalCode ?? "",
      coordinates: (latStr && lngStr) ? { lat: parseFloat(latStr), lng: parseFloat(lngStr) } : draft.coordinates,
      thumbnail: thumbnail ?? undefined,
      logo: logo ?? undefined,
      themeColor: themeColor ?? undefined,
      status: "active",
      publishStatus: publishStatus,
      visibleToStudents: visibleToStudents,
      features: draft.features ?? { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
      canvasW: isEditing ? (draft.canvasW ?? 900) : 900,
      canvasH: isEditing ? (draft.canvasH ?? 680) : 680,
      settings: draft.settings ?? { accessibility: false, emergency: false, eventLayer: false, gps: false },
      buildings: isEditing ? (draft.buildings ?? []) : [],
      markers: isEditing ? (draft.markers ?? []) : [],
      paths: isEditing ? (draft.paths ?? []) : [],
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
      createdBy: draft.createdBy ?? "Admin",
    };
    // Show loading overlay for a short duration, then finish
    setTimeout(() => {
      onFinish(newCampus);
      setShowSaving(false);
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in flex flex-col"
        style={{ maxHeight: "92vh" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
              <StepIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-extrabold text-foreground text-base" style={{ fontFamily: "var(--font-sans)" }}>
                {step === 4 && isEditing ? "Review & Save" : STEP_CONFIG[step - 1].title}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
                {step === 4 && isEditing ? "Review your changes before saving" : STEP_CONFIG[step - 1].description}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Step indicator with labels ── */}
        <div className="flex items-center justify-center gap-0 px-6 pt-3 pb-1 shrink-0">
          {[1, 2, 3, 4].map((s) => {                const isActive = s === step;
            const isDone = completedSteps.has(s) || s < step;
            const label = STEP_CONFIG[s - 1].title;
            return (
              <div key={s} className="flex items-center">
                {/* Step dot + label — validate before allowing navigation */}
                <div
                  onClick={() => {
                    if (s !== step && !attemptProceed(step)) return;
                    onJumpToStep?.(s as 1 | 2 | 3 | 4);
                  }}
                  className="flex flex-col items-center gap-1 cursor-pointer"
                >
                  <div
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-extrabold transition-all duration-300",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-110"
                        : isDone
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-muted text-muted-foreground/50 border border-border"
                    )}
                  >
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
                  </div>
                  <span className={cn(
                    "text-[8px] font-bold whitespace-nowrap transition-colors duration-300",
                    isActive ? "text-primary" : isDone ? "text-primary/60" : "text-muted-foreground/30"
                  )}>
                    {label}
                  </span>
                </div>
                {/* Connector line */}
                {s < 4 && (
                  <div className={cn(
                    "w-8 h-px mx-1.5 mt-0 transition-colors duration-300",
                    s < step ? "bg-primary/40" : "bg-border"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step content ── */}
        <div
          ref={contentRef}
          className={cn(
            "flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth px-6 py-4 space-y-5 transition-transform duration-200",
            shaking && "animate-wizard-shake"
          )}
          style={shaking ? { animation: "wizard-shake 0.5s ease-in-out" } : undefined}
        >
          {/* Inject shake keyframes */}
          <style>{SHAKE_KEYFRAMES}</style>

          {/* ── Inline validation toast ── */}
          <ValidationToast
            message={toastMessage ?? ""}
            visible={toastVisible}
            onHide={hideToast}
          />

          {/* ══════ Step 1: Campus Identity ══════ */}
          {step === 1 && (
            <>
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/30 border border-border">
                <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                  Define your campus identity. The name and code will appear throughout the system — on student maps, building labels, and the campus selector.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel label="Campus Name" required htmlFor={`${uid}-name`} tooltip="The full name displayed to students and staff. Example: Main Campus, Annex Campus, Engineering Campus." />
                  <div className="relative">
                    <input
                      id={`${uid}-name`}
                      value={name}
                      onChange={(e) => { setName(e.target.value); markEdited("name"); }}
                      onBlur={() => handleBlur("name")}
                      placeholder="e.g. PLV Main Campus"
                      className={getError("name") ? errorInputCls : inputCls}
                      autoFocus
                      aria-invalid={!!getError("name")}
                      aria-describedby={getError("name") ? `${uid}-name-err` : undefined}
                    />
                    {getError("name") && (
                      <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
                    )}
                  </div>
                  {getError("name") && (
                    <p id={`${uid}-name-err`} className="flex items-center gap-1 text-[10px] text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-left-1 duration-200">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.name}
                    </p>
                  )}
                </div>
                <div>
                  <FieldLabel label="Campus Code" htmlFor={`${uid}-code`} tooltip="A short identifier shown on building labels. Example: MAIN, ANNEX, ENG." />
                  <div className="relative">
                    <input
                      id={`${uid}-code`}
                      value={code}
                      onChange={(e) => { setCode(e.target.value.toUpperCase()); markEdited("code"); }}
                      onBlur={() => handleBlur("code")}
                      placeholder="e.g. MAIN"
                      className={getError("code") ? errorInputCls : inputCls}
                      aria-invalid={!!getError("code")}
                      aria-describedby={getError("code") ? `${uid}-code-err` : undefined}
                    />
                    {getError("code") && (
                      <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
                    )}
                  </div>
                  {getError("code") && (
                    <p id={`${uid}-code-err`} className="flex items-center gap-1 text-[10px] text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-left-1 duration-200">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.code}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <FieldLabel label="Description" htmlFor={`${uid}-desc`} tooltip="Describe the campus — its location, facilities, and what makes it unique." />
                <textarea id={`${uid}-desc`}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  placeholder="Describe the campus, its history, and notable features... (optional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                />
                {desc.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/50 mt-1 text-right">{desc.length} characters</p>
                )}
              </div>
            </>
          )}

          {/* ══════ Step 2: Campus Location ══════ */}
          {step === 2 && (
            <>
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/30 border border-border">
                <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                  Pinpoint your campus location on the map. Search by name, address, or landmark — or click anywhere to place the marker.
                </p>
              </div>

              {/* ── Campus Location section ── */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-4 pb-0">
                  {/* Section header with Locate Campus action */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground/50 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      Campus Location
                    </p>

                  </div>

                  <MapPicker
                    lat={latStr}
                    lng={lngStr}
                    onLatChange={setLatStr}
                    onLngChange={setLngStr}
                    onAddressUpdate={(data) => {
                      // Always update address fields when the pin moves
                      if (data.address) setAddress(data.address);
                      if (data.city) setCity(data.city);
                      if (data.province) setProvince(data.province);
                      if (data.postalCode) setPostalCode(data.postalCode);
                      // Auto-expand address fields when data arrives (unless user collapsed it)
                      if (!addressExpanded && !userCollapsedRef.current && (data.address || data.city || data.province)) {
                        setAddressExpanded(true);
                      }
                    }}
                  />
                </div>

                {/* ── Optional expandable address section ── */}
                <div className="border-t border-border mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !addressExpanded;
                      setAddressExpanded(next);
                      userCollapsedRef.current = !next;
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground/50" />
                      <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">
                        Additional Address Details
                      </span>
                      <span className="text-[9px] text-muted-foreground/40 font-medium">(optional)</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200",
                        addressExpanded && "rotate-180"
                      )}
                    />
                  </button>

                  {addressExpanded && (
                    <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <FieldLabel label="Campus Address" htmlFor={`${uid}-address`} tooltip="Street address of your campus. Auto-populated from the map selection." />
                          <div className="relative">
                            <input
                              id={`${uid}-address`}
                              value={address}
                              onChange={(e) => { setAddress(e.target.value); markEdited("address"); }}
                              onBlur={() => handleBlur("address")}
                              placeholder="Street, Building, Barangay"
                              className={getError("address") ? errorInputCls : inputCls}
                              aria-invalid={!!getError("address")}
                              aria-describedby={getError("address") ? `${uid}-address-err` : undefined}
                            />
                            {getError("address") && (
                              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
                            )}
                          </div>
                          {getError("address") && (
                            <p id={`${uid}-address-err`} className="flex items-center gap-1 text-[10px] text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-left-1 duration-200">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {errors.address}
                            </p>
                          )}
                        </div>
                        <div>
                          <FieldLabel label="City" htmlFor={`${uid}-city`} />
                          <div className="relative">
                            <input
                              id={`${uid}-city`}
                              value={city}
                              onChange={(e) => { setCity(e.target.value); markEdited("city"); }}
                              onBlur={() => handleBlur("city")}
                              placeholder="e.g. Valenzuela"
                              className={getError("city") ? errorInputCls : inputCls}
                              aria-invalid={!!getError("city")}
                              aria-describedby={getError("city") ? `${uid}-city-err` : undefined}
                            />
                            {getError("city") && (
                              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
                            )}
                          </div>
                          {getError("city") && (
                            <p id={`${uid}-city-err`} className="flex items-center gap-1 text-[10px] text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-left-1 duration-200">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {errors.city}
                            </p>
                          )}
                        </div>
                        <div>
                          <FieldLabel label="Province" htmlFor={`${uid}-province`} />
                          <div className="relative">
                            <input
                              id={`${uid}-province`}
                              value={province}
                              onChange={(e) => { setProvince(e.target.value); markEdited("province"); }}
                              onBlur={() => handleBlur("province")}
                              placeholder="e.g. Metro Manila"
                              className={getError("province") ? errorInputCls : inputCls}
                              aria-invalid={!!getError("province")}
                              aria-describedby={getError("province") ? `${uid}-province-err` : undefined}
                            />
                            {getError("province") && (
                              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
                            )}
                          </div>
                          {getError("province") && (
                            <p id={`${uid}-province-err`} className="flex items-center gap-1 text-[10px] text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-left-1 duration-200">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {errors.province}
                            </p>
                          )}
                        </div>
                        <div>
                          <FieldLabel label="Postal Code" htmlFor={`${uid}-postalCode`} tooltip="Philippine 4-digit postal code." />
                          <div className="relative">
                            <input
                              id={`${uid}-postalCode`}
                              value={postalCode}
                              onChange={(e) => { setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 4)); markEdited("postalCode"); }}
                              onBlur={() => handleBlur("postalCode")}
                              placeholder="e.g. 1442"
                              maxLength={4}
                              className={getError("postalCode") ? errorInputCls : inputCls}
                              aria-invalid={!!getError("postalCode")}
                              aria-describedby={getError("postalCode") ? `${uid}-postalCode-err` : undefined}
                            />
                            {getError("postalCode") && (
                              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
                            )}
                          </div>
                          {getError("postalCode") && (
                            <p id={`${uid}-postalCode-err`} className="flex items-center gap-1 text-[10px] text-destructive mt-1 ml-1 animate-in fade-in slide-in-from-left-1 duration-200">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {errors.postalCode}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ══════ Step 3: Campus Appearance ══════ */}
          {step === 3 && (
            <>
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/30 border border-border">
                <Palette className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                  Customize how your campus looks throughout the system. The thumbnail appears on the campus management list and the student campus selector.
                </p>
              </div>

              {/* Campus Thumbnail */}
              <div>
                <FieldLabel label="Campus Thumbnail" tooltip="A photo, aerial image, or illustration of your campus. Appears on the campus selection screen. Recommended: 1200×600px." />
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileChange(e, setThumbnail)}
                  className="hidden"
                />
                <div
                  onClick={() => thumbInputRef.current?.click()}
                  className={cn(
                    "flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed transition-all cursor-pointer group",
                    thumbnail
                      ? "border-primary/30 bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  {thumbnail ? (
                    <div className="flex items-center gap-3 w-full">
                      <img src={thumbnail} alt="Thumbnail preview" className="w-16 h-10 rounded-lg object-cover shrink-0 ring-1 ring-black/5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground">Thumbnail uploaded</p>
                        <p className="text-[10px] text-muted-foreground truncate">Click to replace</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setThumbnail(null); if (thumbInputRef.current) thumbInputRef.current.value = ""; }}
                        className="text-[11px] font-bold text-destructive hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                        <Image className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground">Upload campus image</p>
                        <p className="text-[10px] text-muted-foreground leading-tight" style={{ fontFamily: "var(--font-body)" }}>
                          PNG, JPG, or WEBP · 1200×600px recommended
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Campus Logo */}
              <div>
                <FieldLabel label="Campus Logo (optional)" tooltip="An optional logo or crest for this campus. Displayed in the header." />
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileChange(e, setLogo)}
                  className="hidden"
                />
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className={cn(
                    "flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed transition-all cursor-pointer group",
                    logo
                      ? "border-primary/30 bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  {logo ? (
                    <div className="flex items-center gap-3 w-full">
                      <img src={logo} alt="Logo preview" className="w-10 h-10 rounded-lg object-contain shrink-0 ring-1 ring-black/5 bg-white p-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground">Logo uploaded</p>
                        <p className="text-[10px] text-muted-foreground truncate">Click to replace</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLogo(null); if (logoInputRef.current) logoInputRef.current.value = ""; }}
                        className="text-[11px] font-bold text-destructive hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                        <Image className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground">Upload campus logo</p>
                        <p className="text-[10px] text-muted-foreground leading-tight" style={{ fontFamily: "var(--font-body)" }}>
                          PNG, JPG, or WEBP · Square aspect ratio recommended
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Theme Color */}
              <div>
                <FieldLabel label="Primary Theme Color" tooltip="This color will be used throughout the system for this campus — on cards, buttons, and the campus selector." />
                <div className="flex flex-wrap items-end gap-4">
                  {/* Preset swatches */}
                  <div className="flex flex-wrap gap-2">
                    {THEME_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setThemeColor(c.value)}
                        className={cn(
                          "w-9 h-9 rounded-xl transition-all border-2",
                          themeColor === c.value
                            ? "border-foreground scale-110 shadow-md ring-2 ring-foreground/20"
                            : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: c.value }}
                        title={c.name}
                      />
                    ))}
                  </div>
                  {/* Custom color picker */}
                  <ColorPicker value={themeColor} onChange={setThemeColor} />
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-3">Preview</p>
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{ backgroundColor: themeColor + "15", border: `1px solid ${themeColor}30` }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-extrabold text-sm"
                    style={{ backgroundColor: themeColor }}>
                    {code ? code.slice(0, 2) : "PL"}
                  </div>
                  <div>
                    <p className="text-sm font-extrabold" style={{ color: themeColor }}>{name || "Campus Name"}</p>
                    <p className="text-[10px] text-muted-foreground">{city || "City"} · {province || "Province"}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ══════ Step 4: Review & Create ══════ */}
          {step === 4 && (
            <>
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/30 border border-border">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                  {isEditing
                    ? "Review all the information before saving your changes. Click the Edit button on any section to make changes."
                    : "Review all the information before creating your campus. Click the Edit button on any section to make changes."
                  }
                </p>
              </div>

              <div className="space-y-3">
                {/* Identity summary */}
                <SummaryCard icon={Building2} title="Campus Identity" onEdit={() => onJumpToStep?.(1)}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Campus Name</p>
                      <p className="text-sm font-bold text-foreground">{name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Campus Code</p>
                      <p className="text-sm font-bold text-foreground font-mono">{code || "—"}</p>
                    </div>
                    {desc && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-muted-foreground">Description</p>
                        <p className="text-xs text-foreground leading-relaxed mt-0.5">{desc}</p>
                      </div>
                    )}
                  </div>
                </SummaryCard>

                {/* Location summary */}
                <SummaryCard icon={MapPin} title="Location" onEdit={() => onJumpToStep?.(2)}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground">Address</p>
                      <p className="text-sm font-bold text-foreground">{address || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">City</p>
                      <p className="text-sm font-bold text-foreground">{city || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Province</p>
                      <p className="text-sm font-bold text-foreground">{province || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Postal Code</p>
                      <p className="text-sm font-bold text-foreground">{postalCode || "—"}</p>
                    </div>
                    {(latStr || lngStr) && (
                      <div>
                        <p className="text-[10px] text-muted-foreground">Coordinates</p>
                        <p className="text-sm font-bold text-foreground font-mono">{latStr}°N, {lngStr}°E</p>
                      </div>
                    )}
                  </div>
                </SummaryCard>

                {/* Appearance summary */}
                <SummaryCard icon={Palette} title="Appearance" onEdit={() => onJumpToStep?.(3)}>
                  <div className="flex flex-wrap items-center gap-4">
                    {thumbnail && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Thumbnail</p>
                        <img src={thumbnail} alt="Campus thumbnail" className="w-20 h-12 rounded-lg object-cover ring-1 ring-black/5" />
                      </div>
                    )}
                    {logo && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Logo</p>
                        <img src={logo} alt="Campus logo" className="w-10 h-10 rounded-lg object-contain ring-1 ring-black/5 bg-white p-1" />
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">Theme Color</p>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg border border-border" style={{ backgroundColor: themeColor }} />
                        <span className="text-sm font-bold text-foreground">{THEME_COLORS.find(c => c.value === themeColor)?.name || "Custom"}</span>
                      </div>
                    </div>
                  </div>
                </SummaryCard>

                {/* Visibility section — inline on review page */}
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
                      <Shield className="h-3 w-3" /> Visibility
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-2">Publication Status</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setPublishStatus("draft"); setVisibleToStudents(false); }}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all text-sm",
                          publishStatus === "draft"
                            ? "border-amber-400 bg-amber-50 dark:bg-amber-900/15 ring-1 ring-amber-400/30"
                            : "border-border hover:border-amber-400/30"
                        )}
                      >
                        <EyeOff className={cn("h-4 w-4", publishStatus === "draft" ? "text-amber-600" : "text-muted-foreground")} />
                        <div>
                          <p className={cn("text-xs font-extrabold", publishStatus === "draft" ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>Draft</p>
                          <p className="text-[9px] text-muted-foreground leading-tight">Hidden from students</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={!publishingEnabled}
                        onClick={() => { setPublishStatus("published"); setVisibleToStudents(true); }}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all text-sm",
                          !publishingEnabled && "opacity-50 cursor-not-allowed",
                          publishStatus === "published"
                            ? "border-green-400 bg-green-50 dark:bg-green-900/15 ring-1 ring-green-400/30"
                            : "border-border hover:border-green-400/30"
                        )}
                      >
                        <Eye className={cn("h-4 w-4", publishStatus === "published" ? "text-green-600" : "text-muted-foreground")} />
                        <div>
                          <p className={cn("text-xs font-extrabold", publishStatus === "published" ? "text-green-700 dark:text-green-400" : "text-foreground")}>Published</p>
                          <p className="text-[9px] text-muted-foreground leading-tight">Available in A6</p>
                        </div>
                      </button>
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mt-2">
                      {publishStatus === "published"
                        ? "Published campuses are visible to all students on the map."
                        : "Draft campuses are hidden from students until published."}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 px-6 pb-5 pt-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 h-11 px-5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            {step > 1 && <ChevronLeft className="h-4 w-4" />}
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => {
                if (!attemptProceed(step)) return;
                // Mark this step as completed so checkmark shows
                setCompletedSteps(prev => new Set(prev).add(step));
                const data: Partial<Campus> =
                  step === 1 ? { name, code, description: desc } :
                  step === 2 ? { address, city, province, postalCode, coordinates: (latStr && lngStr) ? { lat: parseFloat(latStr), lng: parseFloat(lngStr) } : undefined } :
                  { thumbnail: thumbnail ?? undefined, logo: logo ?? undefined, themeColor };
                onNext({ ...draft, ...data });
              }}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={showSaving}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {showSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {isEditing ? <Save className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {isEditing ? "Save Changes" : "Create Campus"}
                </>
              )}
            </button>
          )}

          {/* ── Confirmation dialog ── */}
          <SaveConfirmDialog
            open={showConfirm}
            campusName={name || "this campus"}
            onConfirm={handleConfirmSave}
            onCancel={() => setShowConfirm(false)}
          />

          {/* ── Unsaved changes dialog ── */}
          {showUnsaved && createPortal(
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={() => setShowUnsaved(false)}>
              <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-4 p-5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="text-sm font-extrabold text-foreground">Discard Changes?</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      You have unsaved changes to <span className="font-bold text-foreground">{name || "this campus"}</span>. If you close now, these changes will be lost.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 px-5 pb-5">
                  <button onClick={() => setShowUnsaved(false)} className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors">
                    Keep Editing
                  </button>
                  <button onClick={handleDiscardClose} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-xs font-extrabold hover:bg-destructive/90 shadow-sm transition-all">
                    Discard
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ── Saving overlay ── */}
          {showSaving && <SavingOverlay campusName={name || "Campus"} />}
        </div>
      </div>
    </div>
  );
}
