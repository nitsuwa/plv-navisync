import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Accessibility, Bookmark, Check, DoorOpen, MapPin, Navigation, Play, QrCode, Share2, X } from "lucide-react";
import type { CampusMarker } from "../map-builder/types";
import type { StudentAuthState } from "../../hooks/useStudentAuth";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { isCampusGate } from "../../lib/campusGates";
import { formatWeeklyOperatingHours } from "../../lib/buildingInformation";
import { campusPlaceDeepLink, shareCampusPlaceLink } from "../../lib/campusPlaceShare";
import { buildingCoverPublicUrl } from "../../services/buildingImageService";
import { useToast } from "../../hooks/useToast";
import { StudentReportAction } from "./StudentReportAction";
import { cn } from "../../lib/utils";
import { CampusGateQR } from "./CampusGateQR";

interface CampusPlaceDetailsProps {
  place: CampusMarker;
  campusId?: string;
  qrLocationId?: string;
  canRouteTo: boolean;
  canStartAt: boolean;
  saved: boolean;
  studentAuth: StudentAuthState;
  onClose: () => void;
  onDirections: () => void;
  onStartHere: () => void;
  onSave: () => void;
  onReport: () => void;
  onSignInPrompt: (message: string) => void;
}

const GATE_TYPE_LABELS: Record<string, string> = {
  main_entrance: "Main entrance", pedestrian: "Pedestrian gate", service: "Service gate", emergency: "Emergency gate", other: "Gate",
};

function placeKind(place: CampusMarker): string {
  const gateType = place.studentInfo?.gateType;
  if (place.type === "gate") return GATE_TYPE_LABELS[gateType ?? ""] ?? (place.purpose === "emergency_exit" ? "Emergency gate" : "Gate");
  return place.type.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Landmark";
}

function PlaceCover({ place, compact = false }: { place: CampusMarker; compact?: boolean }) {
  const imageUrl = place.studentInfo?.coverImagePath ? buildingCoverPublicUrl(place.studentInfo.coverImagePath) : undefined;
  const Icon = place.type === "gate" ? DoorOpen : MapPin;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [imageUrl]);
  return (
    <div className={`relative isolate w-full overflow-hidden bg-gradient-to-br from-[#0b1b35] via-[#173d68] to-[#287c95] ${compact ? "h-[94px]" : "aspect-[16/8]"}`}>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(116,214,220,0.25),transparent_36%),linear-gradient(135deg,transparent_42%,rgba(255,255,255,0.07)_42.2%,transparent_42.8%)]" />
      {imageUrl && !imageFailed ? <img src={imageUrl} alt={`${place.name} cover`} className="absolute inset-0 h-full w-full object-cover" onError={() => setImageFailed(true)} /> : null}
      <div className="absolute inset-0 flex items-center justify-center text-white/85" aria-hidden="true">
        {(!imageUrl || imageFailed) && <><span className="absolute right-[-8%] top-[-40%] h-[125%] aspect-square rounded-full border border-white/10" /><Icon className="h-9 w-9 stroke-[1.4]" /></>}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-slate-950/10" />
    </div>
  );
}

export function CampusPlaceDetails({ place, campusId = "", qrLocationId, canRouteTo, canStartAt, saved, studentAuth, onClose, onDirections, onStartHere, onSave, onReport, onSignInPrompt }: CampusPlaceDetailsProps) {
  const reducedMotion = useReducedMotion();
  const toast = useToast();
  const [showGateQR, setShowGateQR] = useState(false);
  const isGate = isCampusGate(place);
  const info = place.studentInfo;
  const kind = placeKind(place);
  const schedule = useMemo(() => formatWeeklyOperatingHours(info?.operatingHoursSchedule), [info?.operatingHoursSchedule]);
  const features = [
    info?.pedestrianAccess && "Pedestrian access",
    info?.vehicleAccess && "Vehicle access",
    info?.securityCheckpoint && "Security checkpoint",
    info?.accessibleEntrance && "Accessible entrance",
  ].filter((value): value is string => Boolean(value));

  useEffect(() => { setShowGateQR(false); }, [place.id]);

  const share = async () => {
    try {
      const result = await shareCampusPlaceLink(place.name || "Campus place", campusPlaceDeepLink(place.id, campusId));
      if (result === "copied") toast.success("Link copied.");
    } catch { toast.error("Link could not be shared", "Please try again."); }
  };

  const [mobileSheetState, setMobileSheetState] = useState<"peek" | "default" | "expanded">("default");
  const mobileSheetStateRef = useRef<"peek" | "default" | "expanded">("default");
  const sheetGestureRef = useRef<{ pointerId: number; startY: number; moved: boolean } | null>(null);
  const sheetHandleMovedRef = useRef(false);
  const previousPlaceIdRef = useRef(place.id);
  useEffect(() => {
    if (previousPlaceIdRef.current === place.id) return;
    previousPlaceIdRef.current = place.id;
    mobileSheetStateRef.current = "default";
    setMobileSheetState("default");
  }, [place.id]);

  const actions = (mobile = false, showSecondary = true) => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!canRouteTo} onClick={onDirections} title={canRouteTo ? "Plan directions to this place" : "Directions are unavailable because this place is not connected to the walking network"} data-testid="campus-place-directions" className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          <Navigation className="h-3.5 w-3.5 shrink-0" />Directions
        </button>
        <button type="button" disabled={!canStartAt} onClick={onStartHere} title={canStartAt ? "Use this place as your route starting point" : "Start here is unavailable because this place is not connected to the walking network"} data-testid="campus-place-start-here" className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-2 text-xs font-extrabold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
          <Play className="h-3 w-3 shrink-0 fill-current" />Start here
        </button>
      </div>
      {showSecondary && <div className="grid grid-cols-3 gap-1.5">
      <div className={`grid ${isGate ? "grid-cols-4" : "grid-cols-3"} gap-1.5`}>
        <button type="button" aria-label={saved ? `Remove ${place.name} from saved places` : `Save ${place.name}`} onClick={() => studentAuth.isStudent ? onSave() : onSignInPrompt("save locations")} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-1 text-[10px] font-bold text-foreground">
          {saved ? <Check className="h-3.5 w-3.5 text-primary" /> : <Bookmark className="h-3.5 w-3.5" />}{saved ? "Saved" : "Save"}
        </button>
        {isGate && <button type="button" aria-label={showGateQR ? `Hide ${place.name} QR code` : `Show ${place.name} QR code`} aria-pressed={showGateQR} onClick={() => setShowGateQR((visible) => !visible)} className={`inline-flex h-9 items-center justify-center gap-1 rounded-xl border px-1 text-[10px] font-bold transition-colors ${showGateQR ? "border-primary/25 bg-primary/5 text-primary" : "border-border bg-card text-foreground"}`}>
          <QrCode className="h-3.5 w-3.5" />QR
        </button>}
        <button type="button" onClick={() => void share()} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-1 text-[10px] font-bold text-foreground"><Share2 className="h-3.5 w-3.5" />Share</button>
        <StudentReportAction testId="campus-place-report" ariaLabel={`Report an issue with ${place.name}`} onClick={() => studentAuth.isStudent ? onReport() : onSignInPrompt("report issues")} className="h-9 gap-1 px-1 text-[10px]" />
      </div>}
      {!canRouteTo && !canStartAt && showSecondary && <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">This place is not connected to the walking network yet.</p>}
      </div>
      {isGate && showGateQR && <CampusGateQR gate={place} campusId={campusId} locationId={qrLocationId || place.navNodeId || place.id} />}
      {!canRouteTo && !canStartAt && <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">This place is not connected to the walking network yet.</p>}
      {!mobile && schedule && <p className="text-[11px] text-muted-foreground"><span className="font-bold text-foreground">Hours</span> · {schedule}</p>}
    </div>
  );

  const handleSheetPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    sheetGestureRef.current = { pointerId: event.pointerId, startY: event.clientY, moved: false };
    sheetHandleMovedRef.current = false;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable. */ }
  };
  const handleSheetPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = sheetGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientY - gesture.startY) > 8) gesture.moved = true;
    if (gesture.moved) event.preventDefault();
  };
  const finishSheetPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const gesture = sheetGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    sheetGestureRef.current = null;
    sheetHandleMovedRef.current = !cancelled && gesture.moved;
    if (!cancelled && gesture.moved) {
      const delta = event.clientY - gesture.startY;
      const states = ["peek", "default", "expanded"] as const;
      const index = states.indexOf(mobileSheetState);
      if (delta < -24) {
        const next = states[Math.min(states.length - 1, index + 1)];
        mobileSheetStateRef.current = next;
        setMobileSheetState(next);
      } else if (delta > 24) {
        const next = states[Math.max(0, index - 1)];
        mobileSheetStateRef.current = next;
        setMobileSheetState(next);
      }
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* Pointer capture may already have been released. */ }
  };
  const cycleMobileSheet = () => {
    if (sheetHandleMovedRef.current) { sheetHandleMovedRef.current = false; return; }
    const next = mobileSheetStateRef.current === "peek" ? "default" : mobileSheetStateRef.current === "default" ? "expanded" : "default";
    mobileSheetStateRef.current = next;
    setMobileSheetState(next);
  };

  return (
    <>
      <motion.aside data-testid="campus-place-details-desktop" data-no-drag aria-label={`${place.name} campus place details`} className="map-layer-building-sheet absolute inset-y-0 right-0 z-30 hidden min-h-0 w-[min(370px,32vw)] flex-col overflow-y-auto border-l border-border/80 bg-card shadow-2xl md:flex" initial={reducedMotion ? false : { x: 18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reducedMotion ? { opacity: 0 } : { x: 12, opacity: 0 }} transition={{ duration: reducedMotion ? 0.01 : 0.22 }}>
        <div className="relative shrink-0 p-3 pb-0"><PlaceCover place={place} /><button type="button" onClick={onClose} aria-label={`Close ${place.name} details`} className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-slate-950/50 text-white"><X className="h-4 w-4" /></button></div>
        <div className="space-y-3 p-5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{kind} · Campus place</span><h2 className="mt-1 break-words text-xl font-extrabold leading-tight">{place.name || "Campus place"}</h2></div><button type="button" onClick={onClose} aria-label={`Close ${place.name} details`} className="sr-only md:not-sr-only md:flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button></div>
          {info?.description && <p className="text-sm leading-relaxed text-muted-foreground">{info.description}</p>}{actions()}
          {features.length > 0 && <section className="space-y-1.5"><h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Information</h3>{features.map((feature) => <p key={feature} className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-xs font-semibold"><Accessibility className="h-3.5 w-3.5 text-emerald-600" />{feature}</p>)}</section>}
        </div>
      </motion.aside>
      <motion.section data-testid="campus-place-details-mobile" data-no-drag data-sheet-state={mobileSheetState} aria-label={`${place.name} campus place details`} className="map-layer-building-sheet fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-40 flex flex-col overflow-hidden rounded-3xl border border-border/80 bg-card shadow-[0_12px_42px_rgba(15,23,42,0.22)] md:hidden" initial={reducedMotion ? false : { y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reducedMotion ? { y: 12, opacity: 0 } : { y: 18, opacity: 0 }} transition={{ duration: reducedMotion ? 0.01 : 0.21 }} style={{ height: mobileSheetState === "peek" ? "clamp(166px, 22dvh, 180px)" : mobileSheetState === "default" ? "clamp(250px, 42dvh, 330px)" : "min(76dvh, 620px)", maxHeight: "var(--student-map-mobile-panel-max-height, calc(100dvh - 10rem - env(safe-area-inset-bottom, 0px)))" }}>
        <div className="grid h-11 shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center border-b border-border/50 bg-card/95 px-2">
          <span aria-hidden="true" />
          <button type="button" data-testid="campus-place-sheet-handle" aria-label={mobileSheetState === "expanded" ? "Collapse place details" : mobileSheetState === "peek" ? "Show place details" : "Expand place details"} aria-expanded={mobileSheetState === "expanded"} className="flex h-11 min-w-0 touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50" onPointerDown={handleSheetPointerDown} onPointerMove={handleSheetPointerMove} onPointerUp={(event) => finishSheetPointer(event)} onPointerCancel={(event) => finishSheetPointer(event, true)} onLostPointerCapture={(event) => finishSheetPointer(event, true)} onClick={cycleMobileSheet}>
            <span className="h-1 w-9 rounded-full bg-muted-foreground/25" />
          </button>
          <button type="button" onClick={onClose} aria-label={`Close ${place.name} details`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          {mobileSheetState !== "peek" && <div className="px-3 pt-2"><PlaceCover place={place} compact /></div>}
          <div className="space-y-2.5 p-3">
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary"><MapPin className="h-3 w-3 shrink-0" />{kind} · Campus place</span>
            <h2 className="line-clamp-2 break-words text-base font-extrabold leading-tight text-foreground" title={place.name}>{place.name || "Campus place"}</h2>
            {mobileSheetState !== "peek" && info?.description && <p className={cn("text-[11px] leading-relaxed text-muted-foreground", mobileSheetState === "default" && "line-clamp-3")}>{info.description}</p>}
            {mobileSheetState === "expanded" && <>
              {features.length > 0 && <section className="space-y-1.5 border-t border-border/70 pt-2"><h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Quick information</h3>{features.map((feature) => <p key={feature} className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-xs font-semibold"><Accessibility className="h-3.5 w-3.5 text-emerald-600" />{feature}</p>)}</section>}
              {schedule && <p className="text-[10px] leading-relaxed text-muted-foreground"><span className="font-bold text-foreground">Operating hours</span> · {schedule}</p>}
            </>}
          </div>
        </div>
        <div className="shrink-0 border-t border-border/50 bg-card/95 px-3 pb-[max(.5rem,env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur-xl">{actions(true, mobileSheetState !== "peek")}</div>
      </motion.section>
    </>
  );
}
