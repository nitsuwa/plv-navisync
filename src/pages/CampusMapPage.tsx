import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { AnimatePresence } from "motion/react";

import {
  Search, Layers, ZoomIn, ZoomOut, LocateFixed, Building2, X,
  Accessibility, AlertTriangle, Navigation, Bookmark, Flag,
  Clock, ChevronRight, ChevronLeft, ChevronDown,
  Share2, CalendarDays, MapPin, Compass,
  Footprints, QrCode, Loader2, RefreshCw, AlertCircle, Crosshair,
} from "lucide-react";

import { useDebounce, usePublishedCampus, useCampusSearch, useReducedMotion, type SearchResult } from "../hooks";
import { MOCK_BUILDINGS as LEGACY_BUILDINGS } from "../data/mockData";
import { FLOOR_PLANS as LEGACY_FLOOR_PLANS, type RoomType } from "../data/floorPlans";
import type { Building } from "../types";
import { cn } from "../lib/utils";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useCampusData } from "../contexts/CampusDataContext";
import { eventOverlayService } from "../services/eventOverlayService";
import type { CampusEventOverlay } from "../components/map-builder/types";
import { buildingPositionsFromCampus, floorPlansFromCampus, buildingsFromCampus } from "../lib/mapDataAdapter";
import { findIndoorRoute, findIndoorRouteForFloor, type IndoorRoute } from "../lib/indoorPathfinding";
import { planBuildingRoute, planRouteFromPoint, type PlannedRoute } from "../lib/routePlanner";
import { latLngToMapPoint, snapToNearest } from "../lib/geo";
import { NODES as STATIC_NAV_NODES } from "../lib/pathfinding";
import { projectReadonlyOutdoorCampus } from "../lib/readonlyOutdoorCampus";
import {
  RoutePlannerDialog, RouteStepsPanel, RouteMapOverlay,
  ReportModal, SignInPrompt,
  BuildingInfoPanel, MobileBuildingSheet, RouteErrorState,
  EventInfoPanel, ActiveEventsList,
} from "../components/map";
import { studentAccountService } from "../services/studentAccountService";
import { usageAnalyticsService } from "../services/usageAnalyticsService";
import type { Campus as EditorCampus } from "../components/map-builder/types";
import { ReadonlyOutdoorCampusScene } from "../components/map-builder/ReadonlyOutdoorVisuals";

type MapMode  = "standard" | "accessible" | "emergency";

// ── Remember last viewed building (frozen-spec enhancement) ───────────────
const LAST_VIEWED_KEY = "plv-last-viewed";

function saveLastViewed(state: { buildingId: string; zoom: number }): void {
  try {
    localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify({ ...state, ts: Date.now() }));
  } catch {
    // Best-effort persistence.
  }
}

function loadLastViewed(): { buildingId: string; zoom: number } | null {
  try {
    const raw = localStorage.getItem(LAST_VIEWED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.buildingId === "string") {
      return {
        buildingId: parsed.buildingId,
        zoom: typeof parsed.zoom === "number" ? parsed.zoom : 1,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Map constants ──────────────────────────────────────────────────────────
const SVG_W  = 900;
const SVG_H  = 680;
const SVG_CX = SVG_W / 2;
const SVG_CY = SVG_H / 2;
const FP_W   = 440;  // floor plan viewBox width
const FP_H   = 290;  // floor plan viewBox height
interface Pt { x: number; y: number; }

const B_POS: Record<string, { x:number; y:number; w:number; h:number; color:string }> = {
  b1: { x:155, y:130, w:125, h:80,  color:"#1e40af" },
  b2: { x:395, y:115, w:105, h:72,  color:"#1e3a8a" },
  b3: { x:545, y:295, w:115, h:78,  color:"#1d4ed8" },
  b4: { x:165, y:305, w:105, h:62,  color:"#1e40af" },
  b5: { x:305, y:435, w:145, h:82,  color:"#2563eb" },
  b6: { x:605, y:415, w:112, h:72,  color:"#1d4ed8" },
};
const STATUS: Record<string, "Open"|"Busy"|"Closed"> = {
  b1:"Open", b2:"Open", b3:"Open", b4:"Open", b5:"Busy", b6:"Open",
};
const STATUS_COLOR = { Open:"text-green-500", Busy:"text-amber-500", Closed:"text-red-500" };
const STATUS_DOT   = { Open:"bg-green-500",   Busy:"bg-amber-500",   Closed:"bg-red-500"   };

const EVENT_MARKERS: { id:string; title:string; x:number; y:number; color:string; date:string; venue:string; org:string; desc:string }[] = [];
const POPULAR = [
  { label:"Student Center",   buildingId:"b_scb" },
  { label:"Canteen",          buildingId:"b_canteen" },
  { label:"CABA",             buildingId:"b_caba" },
  { label:"COED",             buildingId:"b_coed" },
  { label:"CEIT",             buildingId:"b_ceit" },
  { label:"Guard House",      buildingId:"b_guard" },
];
const BUILDING_FACILITIES: Record<string, string[]> = {
  b1: ["Lecture Rooms", "Computer Labs", "Faculty Offices", "Study Rooms"],
  b2: ["Admin Offices", "Registrar", "Cashier", "Conference Rooms", "VP Office"],
  b3: ["Main Library", "Reading Rooms", "Computer Access", "Study Booths", "Media Section"],
  b4: ["Engineering Labs", "Workshops", "Drawing Rooms", "Project Rooms"],
  b5: ["Main Gymnasium", "Bleachers", "Locker Rooms", "Equipment Storage"],
  b6: ["Student Council Office", "Canteen", "Student Lounge", "Organization Rooms"],
};
const BUILDING_ACCESSIBILITY: Record<string, string[]> = {
  b1: ["Wheelchair Ramp (G/F)", "Accessible Restroom", "Wide Corridors"],
  b2: ["Elevator (all floors)", "Wheelchair Ramp", "Accessible Parking", "Accessible Restroom"],
  b3: ["Ground Floor Access", "Wide Doorways", "Accessible Restroom"],
  b4: ["Ramp at Main Entrance", "Accessible Lab Benches"],
  b5: ["Level Entry", "Accessible Seating", "Accessible Restroom"],
  b6: ["Ground Floor Access", "Wide Corridors"],
};

// ═════════════════════════════════════════════════════════════════════════════
export interface CampusMapPageProps {
  /** Candidate campus supplied by Admin Student Preview. */
  previewCampus?: EditorCampus | null;
  /** Remove the public-layout header offset when embedded full-screen. */
  fullScreen?: boolean;
}

export function CampusMapPage({ previewCampus = null, fullScreen = false }: CampusMapPageProps = {}) {
  const studentAuth = useStudentAuth();
  const publishedCampusState = usePublishedCampus(previewCampus);

  const {
    campuses: availableCampuses,
    activeCampus,
    selectedCampusId,
    setSelectedCampusId,
    loading: isCampusLoading,
    error: campusError,
    isEmpty: isCampusEmpty,
    isCached: isCampusCached,
    refetch: refetchCampus,
  } = publishedCampusState;

  // ── Use Map Builder data if available, fall back to legacy data ──
  const MOCK_BUILDINGS = useMemo(() => {
    if (activeCampus) {
      return buildingsFromCampus(activeCampus);
    }
    return LEGACY_BUILDINGS;
  }, [activeCampus]);

  const B_POS = useMemo<Record<string, {x:number;y:number;w:number;h:number;color:string}>>(() => {
    if (activeCampus) {
      return buildingPositionsFromCampus(activeCampus);
    }
    return {
      b1: { x:155, y:130, w:125, h:80,  color:"#1e40af" },
      b2: { x:395, y:115, w:105, h:72,  color:"#1e3a8a" },
      b3: { x:545, y:295, w:115, h:78,  color:"#1d4ed8" },
      b4: { x:165, y:305, w:105, h:62,  color:"#1e40af" },
      b5: { x:305, y:435, w:145, h:82,  color:"#2563eb" },
      b6: { x:605, y:415, w:112, h:72,  color:"#1d4ed8" },
    };
  }, [activeCampus]);

  const FLOOR_PLANS = useMemo(() => {
    if (activeCampus) {
      return floorPlansFromCampus(activeCampus);
    }
    return LEGACY_FLOOR_PLANS;
  }, [activeCampus]);

  // Canonical authored outdoor data is the source of truth whenever a saved
  // Campus (or Preview candidate) is available.  The legacy adapter above is
  // retained for the existing Student route/search contracts and for the
  // no-campus compatibility fallback, but it no longer owns the physical
  // outdoor rendering.
  const readonlyOutdoorCampus = useMemo(
    () => activeCampus ? projectReadonlyOutdoorCampus(activeCampus) : null,
    [activeCampus],
  );

  const BUILDING_FACILITIES: Record<string, string[]> = useMemo(() => {
    if (activeCampus) {
      const result: Record<string, string[]> = {};
      for (const b of activeCampus.buildings) {
        result[b.id] = b.facilities || [];
      }
      return result;
    }
    return {
      b1: ["Lecture Rooms", "Computer Labs", "Faculty Offices", "Study Rooms"],
      b2: ["Admin Offices", "Registrar", "Cashier", "Conference Rooms", "VP Office"],
      b3: ["Main Library", "Reading Rooms", "Computer Access", "Study Booths", "Media Section"],
      b4: ["Engineering Labs", "Workshops", "Drawing Rooms", "Project Rooms"],
      b5: ["Main Gymnasium", "Bleachers", "Locker Rooms", "Equipment Storage"],
      b6: ["Student Council Office", "Canteen", "Student Lounge", "Organization Rooms"],
    };
  }, [activeCampus]);

  const BUILDING_ACCESSIBILITY: Record<string, string[]> = useMemo(() => {
    if (activeCampus) {
      const result: Record<string, string[]> = {};
      for (const b of activeCampus.buildings) {
        result[b.id] = b.accessibility || [];
      }
      return result;
    }
    return {
      b1: ["Wheelchair Ramp (G/F)", "Accessible Restroom", "Wide Corridors"],
      b2: ["Elevator (all floors)", "Wheelchair Ramp", "Accessible Parking", "Accessible Restroom"],
      b3: ["Ground Floor Access", "Wide Doorways", "Accessible Restroom"],
      b4: ["Ramp at Main Entrance", "Accessible Lab Benches"],
      b5: ["Level Entry", "Accessible Seating", "Accessible Restroom"],
      b6: ["Ground Floor Access", "Wide Corridors"],
    };
  }, [activeCampus]);

  // Core map state
  const [selected,     setSelected]     = useState<Building|null>(null);
  const [mapMode,      setMapMode]      = useState<MapMode>("standard");
  const [zoom,         setZoom]         = useState(1);
  const zoomRef = useRef(1);
  const [displayZoom,  setDisplayZoom]  = useState(1);
  const [pan,          setPan]          = useState<Pt>({ x:0, y:0 });
  const [saved,        setSaved]        = useState<Set<string>>(new Set());
  const [layers,       setLayers]       = useState({ buildings:true, accessibility:false, emergency:false });
  const animFrameRef   = useRef<number>();

  // Load initial bookmarked buildings from studentAccountService
  useEffect(() => {
    studentAccountService.getSavedBuildings().then((buildings) => {
      const idSet = new Set<string>();
      buildings.forEach((b) => {
        idSet.add(b.id);
        if (b.code) {
          idSet.add(b.code);
          idSet.add(b.code.toLowerCase());
        }
      });
      setSaved(idSet);
    });
  }, []);

  // Floor plan state (replaces buildingView — floor plans now render in the main SVG)
  const [floorView,       setFloorView]       = useState<{ building: Building; floor: number }|null>(null);
  const [hoveredRoom,     setHoveredRoom]     = useState<string|null>(null);
  const [highlightedRoom, setHighlightedRoom] = useState<string|null>(null);
  const [stairLoading,    setStairLoading]    = useState<{ dir:"up"|"down"; label:string }|null>(null);
  const [stairChoice,     setStairChoice]     = useState<{
    roomType: RoomType; upFloor: number|null; dnFloor: number|null; upLabel: string; dnLabel: string;
  }|null>(null);
  const [showCampusSelector, setShowCampusSelector] = useState(false);
  const [campusTransitioning, setCampusTransitioning] = useState(false);
  const transitioningRef = useRef<ReturnType<typeof setTimeout>>();
  const initialSelectionRef = useRef(false);
  const [indoorRoute, setIndoorRoute] = useState<IndoorRoute | null>(null);
  const [activeRouteRoom, setActiveRouteRoom] = useState<string | null>(null);
  const [showArrival, setShowArrival] = useState(false);
  const [routeFading, setRouteFading] = useState(false);

  // Floating UI state
  const [search,         setSearch]         = useState("");
  const debouncedSearch = useDebounce(search, 150);
  const [searchFocused,  setSearchFocused]  = useState(false);
  const [directionsMode, setDirectionsMode] = useState(false);
  const [fromBuilding,   setFromBuilding]   = useState<Building|null>(null);
  const [toBuilding,     setToBuilding]     = useState<Building|null>(null);

  // "You are here" (kiosk-style start) state
  const [youAreHere,    setYouAreHere]    = useState<{ x: number; y: number } | null>(null);
  const [locating,      setLocating]      = useState(false);
  const [pinning,       setPinning]       = useState(false);
  const [useMyLocation, setUseMyLocation] = useState(false);
  // Walk animation progress 0..1
  const [walkProgress,  setWalkProgress]  = useState(0);
  const [walkNonce,     setWalkNonce]     = useState(0);
  const walkAnimRef = useRef<number | null>(null);
  const [showLayers,     setShowLayers]     = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showQR,         setShowQR]         = useState(false);

  // Modals
  const [reportModal,   setReportModal]   = useState<Building|null>(null);
  const [signInPrompt,  setSignInPrompt]  = useState<string|null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CampusEventOverlay|null>(null);
  const [showEventsList, setShowEventsList] = useState(false);

  const [allActiveEvents, setAllActiveEvents] = useState<CampusEventOverlay[]>([]);
  useEffect(() => {
    eventOverlayService.getActiveApprovedOverlays().then(setAllActiveEvents).catch(() => setAllActiveEvents([]));
  }, []);

  // Unified Search Engine Hook for C3
  const campusSearch = useCampusSearch(activeCampus, "all", allActiveEvents);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const svgRef          = useRef<SVGSVGElement>(null);
  const dragRef         = useRef<{ sx:number; sy:number; lx:number; ly:number; px:number; py:number; moved:boolean; vx:number; vy:number; lastTime:number }|null>(null);
  const inertiaRef      = useRef<number>(0);
  const panTargetRef    = useRef<Pt | null>(null);
  const panAnimRef     = useRef<number>(0);
  // ── Pinch-to-zoom ref ──
  const pinchRef       = useRef<{ dist: number; initZoom: number } | null>(null);
  const getScale = useCallback(() => {
    const svg = svgRef.current;
    const vw = floorViewRef.current !== null ? FP_W : activeCampus?.canvasW || SVG_W;
    return svg ? vw / svg.getBoundingClientRect().width : 1;
  }, [activeCampus]);
  const floorViewRef    = useRef(floorView);
  useEffect(() => { floorViewRef.current = floorView; }, [floorView]);

  const [isLoading, setIsLoading] = useState(true);
  const reducedMotion = useReducedMotion();

  // Simulate initial map load
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Sync search input with campusSearch query
  useEffect(() => {
    campusSearch.setQuery(search);
  }, [search, campusSearch]);

  // Anonymous page-view tracking for usage analytics
  useEffect(() => {
    usageAnalyticsService.track("page_view", "map");
  }, []);

  // Auto-select building from URL query parameters (e.g. /map?buildingId=b3),
  // or restore the last viewed building when no explicit target is given.
  // Waits for the campus data so the lookup runs against the real seeded ids.
  useEffect(() => {
    if (isCampusLoading) return;
    if (!initialSelectionRef.current && MOCK_BUILDINGS.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get("buildingId") || params.get("select");
      if (targetId) {
        const b = MOCK_BUILDINGS.find(
          (building) => building.id === targetId || building.code.toLowerCase() === targetId.toLowerCase()
        );
        if (b) {
          setSelected(b);
          initialSelectionRef.current = true;
          // Clean the URL to prevent stale query params on subsequent navigations
          window.history.replaceState({}, "", window.location.pathname);
        }      } else {
        // Don't auto-restore last building — start with a clean map
        initialSelectionRef.current = true;
      }
    }
  }, [MOCK_BUILDINGS, isCampusLoading]);

  // ── Computed floor plan values ─────────────────────────────────────────
  const isFloorMode       = floorView !== null;
  const currentFloorData  = floorView ? FLOOR_PLANS[floorView.building.id] : null;
  const currentFloor      = currentFloorData?.floors.find(f => f.number === floorView?.floor) ?? currentFloorData?.floors[0];
  const floorNums         = currentFloorData?.floors.map(f => f.number) ?? [];

  // ── Event Overlays (approved events for current floor) ───────────────
  // The demo floor plans are keyed by building id + floor number, so the
  // canonical floor id used by event overlays is `${buildingId}-f${number}`
  // (this must match the locationRef.floorId saved by the event editor).
  const [activeOverlays, setActiveOverlays] = useState<CampusEventOverlay[]>([]);

  const floorLookupId =
    isFloorMode && floorView && currentFloor
      ? `${floorView.building.id}-f${currentFloor.number}`
      : null;
  useEffect(() => {
    if (!floorLookupId) {
      setActiveOverlays([]);
      return;
    }
    eventOverlayService
      .getApprovedOverlaysForFloor(floorLookupId)
      .then(setActiveOverlays)
      .catch(() => setActiveOverlays([]));
  }, [floorLookupId]);

  // SVG center shifts with mode (floor plan is 440×290, campus 900×680)
  const outdoorCanvasW = activeCampus?.canvasW || SVG_W;
  const outdoorCanvasH = activeCampus?.canvasH || SVG_H;
  const viewCX = isFloorMode ? FP_W / 2 : outdoorCanvasW / 2;
  const viewCY = isFloorMode ? FP_H / 2 : outdoorCanvasH / 2;
  const tx = viewCX * (1 - displayZoom) + pan.x;
  const ty = viewCY * (1 - displayZoom) + pan.y;

  // ── Smooth zoom lerp ───────────────────────────────────────────────────
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    let animId: number;
    const lerp = () => {
      setDisplayZoom((cur) => {
        const diff = zoom - cur;
        if (Math.abs(diff) < 0.001) return zoom;
        return cur + diff * 0.12;
      });
      animId = requestAnimationFrame(lerp);
    };
    animId = requestAnimationFrame(lerp);
    return () => cancelAnimationFrame(animId);
  }, [zoom]);

  // ── Smooth pan lerp ───────────────────────────────────────────────────
  useEffect(() => {
    let animId: number;
    const lerpPan = () => {
      const target = panTargetRef.current;
      if (target) {
        setPan((prev) => {
          const dx = target.x - prev.x;
          const dy = target.y - prev.y;
          if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) {
            panTargetRef.current = null;
            return target;
          }
          return {
            x: prev.x + dx * 0.1,
            y: prev.y + dy * 0.1,
          };
        });
      }
      animId = requestAnimationFrame(lerpPan);
    };
    animId = requestAnimationFrame(lerpPan);
    return () => cancelAnimationFrame(animId);
  }, []);

  // ── Wheel zoom ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaMode === 1 ? e.deltaY * 0.08 : e.deltaY * 0.003;
      setZoom(z => parseFloat(Math.max(0.35, Math.min(3.5, z - step)).toFixed(2)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isLoading]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "+"||e.key === "=") { e.preventDefault(); setZoom(z => Math.min(3.5,+(z+0.2).toFixed(2))); }
      if (e.key === "-")                { e.preventDefault(); setZoom(z => Math.max(0.35,+(z-0.2).toFixed(2))); }
      if (e.key === "0")                { e.preventDefault(); setZoom(1); setPan({x:0,y:0}); }
      if (e.key === "Escape") {
        setSelected(null); setSearchFocused(false);
        setReportModal(null); setSelectedEvent(null); setSignInPrompt(null);
        if (floorViewRef.current) { setFloorView(null); setZoom(1); setPan({x:0,y:0}); }
      }
      const PAN = 30;
      if (e.key === "ArrowRight") { panTargetRef.current = null; setPan(p => ({...p, x:p.x-PAN})); }
      if (e.key === "ArrowLeft")  { panTargetRef.current = null; setPan(p => ({...p, x:p.x+PAN})); }
      if (e.key === "ArrowDown")  { panTargetRef.current = null; setPan(p => ({...p, y:p.y-PAN})); }
      if (e.key === "ArrowUp")    { panTargetRef.current = null; setPan(p => ({...p, y:p.y+PAN})); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Drag-to-pan ────────────────────────────────────────────────────────
  // ── Inertia decay ────────────────────────────────────────────────────
  const startInertia = useCallback((vx: number, vy: number) => {
    cancelAnimationFrame(inertiaRef.current);
    const friction = 0.92;
    const minVelocity = 0.2;
    const decay = () => {
      const speed = Math.hypot(vx, vy);
      if (speed < minVelocity) { inertiaRef.current = 0; return; }
      vx *= friction;
      vy *= friction;
      setPan(prev => ({ x: prev.x + vx, y: prev.y + vy }));
      inertiaRef.current = requestAnimationFrame(decay);
    };
    inertiaRef.current = requestAnimationFrame(decay);
  }, []);

  // ── Shared pan logic ─────────────────────────────────────────────────
  const applyPanDelta = useCallback((dx: number, dy: number, drag: NonNullable<typeof dragRef.current>) => {
    const scale = getScale();
    setPan({ x: drag.px + dx * scale, y: drag.py + dy * scale });
  }, [getScale]);

  // ── Per-frame velocity tracking helper ───────────────────────────────
  const trackVelocity = useCallback((drag: NonNullable<typeof dragRef.current>, newDx: number, newDy: number, smoothing: number) => {
    const scale = getScale();
    const frameVx = newDx * scale;
    const frameVy = newDy * scale;
    const alpha = smoothing;
    drag.vx = drag.vx * (1 - alpha) + frameVx * alpha;
    drag.vy = drag.vy * (1 - alpha) + frameVy * alpha;
    drag.lastTime = performance.now();
  }, [getScale]);

  // ── Mouse drag-to-pan ────────────────────────────────────────────────
  // ── "You are here" helpers ──────────────────────────────────────────────

  /** Snap an SVG point to the nearest walkway node (campus graph or static). */
  const snapPointToGraph = useCallback((pt: { x: number; y: number }): { x: number; y: number } => {
    const campusNodes = activeCampus?.navNodes?.map((n) => ({ x: n.x, y: n.y })) ?? [];
    const candidates = campusNodes.length > 0
      ? campusNodes
      : STATIC_NAV_NODES.map((n) => ({ x: n.x, y: n.y }));
    const snapped = snapToNearest(pt, candidates);
    return snapped ? snapped.point : pt;
  }, [activeCampus]);

  const startPinning = useCallback(() => {
    setPinning(true);
    setLocating(false);
  }, []);

  /**
   * "You are here" button: tries browser GPS; if unavailable or denied,
   * switches to tap-on-map mode so the demo still works anywhere.
   */
  const handleLocate = useCallback(() => {
    if (pinning) { setPinning(false); return; }
    if (!navigator.geolocation) { startPinning(); return; }
    setLocating(true);
    // Safety net: if the browser never answers (e.g. blocked in a demo
    // environment), fall back to tap-on-map after a few seconds.
    const safety = window.setTimeout(() => {
      setLocating(false);
      startPinning();
    }, 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(safety);
        setLocating(false);
        const anchor = activeCampus?.coordinates ?? { lat: 14.7062, lng: 120.9813 };
        const raw = latLngToMapPoint(
          pos.coords.latitude,
          pos.coords.longitude,
          anchor,
          activeCampus?.canvasW || SVG_W,
          activeCampus?.canvasH || SVG_H,
        );
        const snapped = snapPointToGraph(raw);
        setYouAreHere(snapped);
        setUseMyLocation(true);
        setFromBuilding(null);
        setToBuilding(null);
        // Deliberately do NOT auto-open the Route Planner: dropping a pin
        // should just place the marker. The user taps "Plan route" on the
        // "You are here" chip when they are ready (kiosk-style flow).
      },
      () => {
        clearTimeout(safety);
        setLocating(false);
        startPinning();
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, [activeCampus, pinning, snapPointToGraph, startPinning]);

  /** Convert a client-space point to SVG content coordinates (inverse of pan/zoom). */
  const svgPointFromClient = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: (p.x - tx) / displayZoom, y: (p.y - ty) / displayZoom };
  }, [tx, ty, displayZoom]);

  /** Tap-on-map handler while pinning — places the "You are here" marker. */
  const handleMapPinTap = useCallback((clientX: number, clientY: number) => {
    if (dragRef.current?.moved) return;
    const pt = svgPointFromClient(clientX, clientY);
    if (!pt) return;
    const snapped = snapPointToGraph(pt);
    setYouAreHere(snapped);
    setPinning(false);
    setUseMyLocation(true);
    setFromBuilding(null);
    setToBuilding(null);
    // No auto-open of the Route Planner here either — the "You are here"
    // chip with its "Plan route" button is the single, clear next step.
  }, [svgPointFromClient, snapPointToGraph]);

  /** Clear the marker + any point-based route. */
  const clearYouAreHere = useCallback(() => {
    setYouAreHere(null);
    setUseMyLocation(false);
    setPinning(false);
    setFromBuilding(null);
  }, []);

  /** Restart the walk animation from the start. */
  const replayWalk = useCallback(() => {
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    walkAnimRef.current = null;
    setWalkProgress(0);
    setWalkNonce((n) => n + 1);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("[data-no-drag]")) return;
    panTargetRef.current = null;
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    const x = e.clientX, y = e.clientY;
    dragRef.current = { sx: x, sy: y, lx: x, ly: y, px: pan.x, py: pan.y, moved: false, vx: 0, vy: 0, lastTime: performance.now() };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    applyPanDelta(dx, dy, drag);
    // Per-frame velocity from last cursor position
    trackVelocity(drag, e.clientX - drag.lx, e.clientY - drag.ly, 0.5);
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  }, [applyPanDelta, trackVelocity]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) {
      if (drag.moved) {
        const speed = Math.hypot(drag.vx, drag.vy);
        if (speed > 1) startInertia(drag.vx * 0.85, drag.vy * 0.85);
      } else if (!isFloorMode) {
        if (pinning && !(e.target as Element).closest("[data-bldg],[data-no-drag]")) {
          // Tap-on-map: place the "You are here" marker on empty map / walkways.
          handleMapPinTap(e.clientX, e.clientY);
        } else {
          setSelected(null); setSearchFocused(false);
        }
      }
    }
  }, [isFloorMode, startInertia, pinning, handleMapPinTap]);

  // ── Touch drag-to-pan with inertia ───────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as Element).closest("[data-no-drag]")) return;
    // Two fingers → pinch-to-zoom
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      pinchRef.current = {
        dist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
        initZoom: zoom,
      };
      return;
    }
    if (e.touches.length !== 1) return;
    // Prevent synthesized mouse events on touch devices
    e.preventDefault();
    panTargetRef.current = null;
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    const t = e.touches[0];
    dragRef.current = { sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, px: pan.x, py: pan.y, moved: false, vx: 0, vy: 0, lastTime: performance.now() };
  }, [pan, zoom]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    // Pinch-to-zoom: 2 fingers
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const curDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = curDist / pinchRef.current.dist;
      setZoom(z => parseFloat(Math.max(0.35, Math.min(3.5, pinchRef.current!.initZoom * ratio)).toFixed(2)));
      return;
    }
    // Single-finger drag-to-pan
    if (e.touches.length !== 1) return;
    const drag = dragRef.current;
    if (!drag) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.sx, dy = t.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    applyPanDelta(dx, dy, drag);
    // Per-frame velocity with EMA smoothing (lower alpha = smoother)
    trackVelocity(drag, t.clientX - drag.lx, t.clientY - drag.ly, 0.35);
    drag.lx = t.clientX;
    drag.ly = t.clientY;
  }, [applyPanDelta, trackVelocity]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    pinchRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && drag.moved) {
      const speed = Math.hypot(drag.vx, drag.vy);
      if (speed > 1) startInertia(drag.vx * 0.85, drag.vy * 0.85);
    } else if (!isFloorMode && pinning && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      const target = e.target as Element;
      if (!target.closest("[data-bldg],[data-no-drag]")) {
        handleMapPinTap(t.clientX, t.clientY);
      }
    }
  }, [startInertia, isFloorMode, pinning, handleMapPinTap]);

  // ── Floor plan handlers ────────────────────────────────────────────────
  const openFloorPlan = useCallback((building: Building, floor: number = 1) => {
    setFloorView({ building, floor });
    setZoom(1); setPan({ x:0, y:0 });
    setSearch(""); setSearchFocused(false);
    setHighlightedRoom(null); setHoveredRoom(null);
  }, []);

  const closeFloorPlan = useCallback(() => {
    setFloorView(null);
    setZoom(1); setPan({ x:0, y:0 });
    setHighlightedRoom(null); setHoveredRoom(null); setStairLoading(null);
  }, []);

  const navigateStair = useCallback((roomType: RoomType) => {
    const fv = floorViewRef.current;
    const fd = fv ? FLOOR_PLANS[fv.building.id] : null;
    if (!fv || !fd) return;
    const nums     = fd.floors.map(f => f.number);
    const upFloor  = nums.find(n => n > fv.floor);
    const dnFloor  = [...nums].reverse().find(n => n < fv.floor);
    const target   = upFloor ?? dnFloor;
    if (!target) return;
    const dir   = target > fv.floor ? "up" : "down";
    const label = fd.floors.find(f => f.number === target)?.label ?? `Floor ${target}`;
    setStairLoading({ dir, label });
    setTimeout(() => {
      setFloorView(v => v ? {...v, floor: target} : v);
      setStairLoading(null);
    }, 750);
  }, []);

  // ── Route ──────────────────────────────────────────────────────────────
  const route = useMemo<PlannedRoute | null>(() => {
    if (useMyLocation && youAreHere && toBuilding) {
      // Kiosk-style: start from the "You are here" marker.
      return planRouteFromPoint(
        youAreHere,
        { id: toBuilding.id, code: toBuilding.code, name: toBuilding.name },
        mapMode,
        activeCampus,
        B_POS
      );
    }
    if (!fromBuilding || !toBuilding) return null;

    // Use the route planner: real graph stats in ALL modes, with an SVG
    // estimate fallback when the buildings are not on the walkway graph.
    return planBuildingRoute(
      { id: fromBuilding.id, code: fromBuilding.code, name: fromBuilding.name },
      { id: toBuilding.id, code: toBuilding.code, name: toBuilding.name },
      mapMode,
      B_POS,
      activeCampus
    );
  }, [fromBuilding, toBuilding, useMyLocation, youAreHere, mapMode, B_POS, activeCampus]);

  // ── Auto-close planner when the route becomes ready ────────────────────
  // The compact RouteStepsPanel (bottom-left) takes over, so the full
  // planner never renders on top of it. Only fires on the null → route
  // transition, so re-opening the planner to edit keeps it open.
  const prevRouteRef = useRef<PlannedRoute | null>(null);
  useEffect(() => {
    if (route && !prevRouteRef.current) {
      setDirectionsMode(false);
    }
    prevRouteRef.current = route;
  }, [route]);

  // ── Route recalculation transition ─────────────────────────────────────
  // Briefly fade out the old route when from/to building changes
  const routeKey = `${useMyLocation ? "here" : fromBuilding?.id ?? ""}-${toBuilding?.id ?? ""}-${mapMode}`;

  // ── Walk animation (kiosk-style walking dot + step highlight) ──────────
  useEffect(() => {
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    walkAnimRef.current = null;
    setWalkProgress(0);
    if (!route || reducedMotion) return;
    // Visual pace ~40 m/s → 231 m ≈ 6 s; clamp 4-12 s so demos read well.
    const duration = Math.max(4000, Math.min(12000, Math.round(route.dist / 40) * 1000));
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setWalkProgress(t);
      if (t < 1) walkAnimRef.current = requestAnimationFrame(tick);
    };
    walkAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(walkAnimRef.current ?? 0);
  }, [route, routeKey, walkNonce, reducedMotion]);
  useEffect(() => {
    if (fromBuilding && toBuilding && route) {
      setRouteFading(true);
      const timer = setTimeout(() => setRouteFading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [routeKey]);

  // ── Zoom to route + arrival simulation ────────────────────────────────
  useEffect(() => {
    if (route) {
      // Automatically zoom to show the full route
      const xs = route.points.map(p => p.x);
      const ys = route.points.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const routeW = maxX - minX, routeH = maxY - minY;
      const fitZoom = Math.min(outdoorCanvasW / (routeW + 200), outdoorCanvasH / (routeH + 200), 2.0);
      setZoom(parseFloat(Math.max(0.5, Math.min(fitZoom, 2.0)).toFixed(2)));
      setPan({
        x: outdoorCanvasW / 2 - (minX + routeW / 2) * fitZoom,
        y: outdoorCanvasH / 2 - (minY + routeH / 2) * fitZoom,
      });
      
      setShowArrival(false);
    } else {
      setShowArrival(false);
    }
  }, [route]);

  // ── Pan to selected building on click (smooth animated lerp) ──────
  useEffect(() => {
    if (selected && !isFloorMode && !route) {
      const pos = B_POS[selected.id];
      if (!pos) return;
      const cx = pos.x + pos.w / 2;
      const cy = pos.y + pos.h / 2;
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
      const currentZoom = zoomRef.current;
      const targetZoom = isMobile && currentZoom < 1.4 ? 1.4 : currentZoom;
      const sidePanelOffset = isMobile ? 0 : -80;
      let mobileYOffset = 0;
      if (isMobile) {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const svgRenderScale = Math.min(vw / SVG_W, vh / SVG_H);
        mobileYOffset = -(vh * 0.18) / svgRenderScale;
      }
      panTargetRef.current = {
        x: (SVG_CX - cx) * targetZoom + sidePanelOffset,
        y: (SVG_CY - cy) * targetZoom + mobileYOffset,
      };
      if (isMobile && currentZoom < 1.4) {
        setZoom(1.4);
      }
    }
  }, [selected?.id, B_POS, isFloorMode, route]);

  const selectBuilding = useCallback((b: Building|null) => {
    setSelected(b);
    setSearchFocused(false); setSearch(""); setShowQR(false);
    // Close route planner when selecting a building
    if (b && directionsMode) {
      setDirectionsMode(false);
      setFromBuilding(null);
      setToBuilding(null);
    }
    if (b) {
      if (!recentSearches.includes(b.name))
        setRecentSearches(prev => [b.name, ...prev].slice(0, 5));
      saveLastViewed({ buildingId: b.id, zoom });
    }
  }, [recentSearches, zoom]);

  const handleSelectSearchResult = useCallback((item: SearchResult) => {
    usageAnalyticsService.track("search", item.name);
    if (item.category === "event") {
      const evt = allActiveEvents.find(e => e.id === item.id);
      if (evt && evt.locationRef?.buildingId) {
        const b = MOCK_BUILDINGS.find((building) => building.id === evt.locationRef!.buildingId);
        if (b) {
          selectBuilding(b);
          if (evt.locationRef.floorId) {
            const match = evt.locationRef.floorId.match(/-f(\d+)$/);
            const floorNum = match ? parseInt(match[1], 10) : 1;
            setFloorView({ building: b, floor: floorNum });
          }
          // We need a slight delay to allow the floor view to open before showing the event modal
          setTimeout(() => setSelectedEvent(evt), 50);
        }
      }
    } else if (item.kind === "building" || !item.buildingId) {
      const b = MOCK_BUILDINGS.find((building) => building.id === item.buildingId || building.name.toLowerCase() === item.name.toLowerCase());
      if (b) selectBuilding(b);
    } else {
      const b = MOCK_BUILDINGS.find((building) => building.id === item.buildingId);
      if (b) {
        selectBuilding(b);
        if (item.floorNumber !== undefined) {
          setFloorView({ building: b, floor: item.floorNumber });
        } else {
          setFloorView({ building: b, floor: 1 });
        }
        setHighlightedRoom(item.id);
      }
    }
    setSearch(item.name);
    setSearchFocused(false);
  }, [MOCK_BUILDINGS, selectBuilding, allActiveEvents]);

  const startDirectionsTo = useCallback((b: Building) => {
    setToBuilding(b); setFromBuilding(null);
    setSelected(null); // Close building info panel to avoid overlap with route planner
    setDirectionsMode(true);
  }, []);

  // ── Save recent destination once a route is successfully computed ──
  const lastSavedDestRef = useRef<string | null>(null);
  useEffect(() => {
    if (route && toBuilding && lastSavedDestRef.current !== toBuilding.id) {
      lastSavedDestRef.current = toBuilding.id;
      studentAccountService.addRecentDestination({
        id: toBuilding.id,
        name: toBuilding.name,
        code: toBuilding.code,
      });
      // Track the planned route for usage analytics (from → to).
      const fromName = useMyLocation ? "You are here" : (fromBuilding?.name ?? "?");
      usageAnalyticsService.track("route", `${fromName} → ${toBuilding.name}`);
    }
    if (!toBuilding) lastSavedDestRef.current = null;
  }, [route, toBuilding, fromBuilding, useMyLocation]);

  const toggleSave = useCallback((id: string) => {
    const b = selected?.id === id ? selected : MOCK_BUILDINGS.find((item) => item.id === id || item.code.toLowerCase() === id.toLowerCase());
    const targetCode = b?.code;

    setSaved((prev) => {
      const next = new Set(prev);
      const isSaved = next.has(id) || (targetCode ? next.has(targetCode) || next.has(targetCode.toLowerCase()) : false);

      if (isSaved) {
        next.delete(id);
        if (targetCode) {
          next.delete(targetCode);
          next.delete(targetCode.toLowerCase());
        }
        studentAccountService.toggleSaveBuilding(id);
        if (targetCode && targetCode !== id) {
          studentAccountService.toggleSaveBuilding(targetCode);
        }
      } else {
        next.add(id);
        if (targetCode) {
          next.add(targetCode);
          next.add(targetCode.toLowerCase());
        }
        studentAccountService.toggleSaveBuilding(id);
        if (targetCode && targetCode !== id) {
          studentAccountService.toggleSaveBuilding(targetCode);
        }
      }
      return next;
    });
  }, [selected]);

  // ── Search results (buildings on campus, rooms on floor plan) ──────────
  const buildingResults = !isFloorMode && debouncedSearch
    ? MOCK_BUILDINGS.filter(b =>
        b.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        b.code.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : [];
  const roomResults = isFloorMode && debouncedSearch
    ? (currentFloor?.rooms ?? []).filter(r =>
        r.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        r.type.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : [];

  const isDragging = dragRef.current?.moved ?? false;
const buildingFill = (id: string) =>
  mapMode === "emergency" ? "#991b1b" : mapMode === "accessible" ? "#14532d" : B_POS[id]?.color ?? "var(--map-route)";

  // Campus switching transition — shows a loading overlay when switching between campuses
  useEffect(() => {
    // Skip on initial load (first auto-selection) to avoid double loading screens
    if (!availableCampuses.length || isLoading || !initialSelectionRef.current) return;
    setCampusTransitioning(true);
    clearTimeout(transitioningRef.current);
    transitioningRef.current = setTimeout(() => setCampusTransitioning(false), 450);
    return () => clearTimeout(transitioningRef.current);
  }, [selectedCampusId, isLoading]);

  // ── Indoor route handler ────────────────────────────────────────────
  const showIndoorRoute = useCallback((roomId: string) => {
    if (!floorView) return;

    // When campus data is available, use data-aware indoor routing so that
    // rooms created in the Map Builder become real pathfinding destinations.
    // In accessible mode, avoid stairs and prefer elevator routes.
    const accessibleOnly = mapMode === "accessible";
    const route = activeCampus
      ? findIndoorRouteForFloor(
          floorView.building.id,
          floorView.floor,
          roomId,
          currentFloor?.rooms ?? [],
          accessibleOnly
        )
      : findIndoorRoute(floorView.building.id, floorView.floor, roomId);

    if (route) {
      setIndoorRoute(route);
      setActiveRouteRoom(roomId);
      setHighlightedRoom(roomId);
    }
  }, [floorView, activeCampus, currentFloor]);

  const clearIndoorRoute = useCallback(() => {
    setIndoorRoute(null);
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
  }, []);

  // ── Map skeleton loading ──
  if (isLoading) {
    return (        <div
          className="relative overflow-hidden"
          style={{ height:"calc(100dvh - 56px)", background:"var(--map-bg)" }}
      >
        {/* Map background skeleton with staggered pulse */}
        <svg viewBox="0 0 900 680" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <style>{`@keyframes skel-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.7; } }`}</style>
          </defs>
          <rect width={900} height={680} fill="var(--map-bg)"/>
          {/* Road skeletons */}
          <rect x={0} y={272} width={900} height={26} fill="var(--map-road)" opacity={0.3} rx={2}/>
          <rect x={388} y={0} width={26} height={680} fill="var(--map-road)" opacity={0.3} rx={2}/>
          {/* Building skeletons with staggered pulse */}
          <rect x={155} y={130} width={125} height={80} rx={6} fill="var(--map-bg)" opacity={0.5} style={{ animation: "skel-pulse 1.8s ease-in-out infinite" }}/>
          <rect x={395} y={115} width={105} height={72} rx={6} fill="var(--map-bg)" opacity={0.5} style={{ animation: "skel-pulse 1.8s ease-in-out infinite", animationDelay: "0.15s" }}/>
          <rect x={545} y={295} width={115} height={78} rx={6} fill="var(--map-bg)" opacity={0.5} style={{ animation: "skel-pulse 2s ease-in-out infinite", animationDelay: "0.3s" }}/>
          <rect x={165} y={305} width={105} height={62} rx={6} fill="var(--map-bg)" opacity={0.5} style={{ animation: "skel-pulse 1.8s ease-in-out infinite", animationDelay: "0.45s" }}/>
          <rect x={305} y={435} width={145} height={82} rx={6} fill="var(--map-bg)" opacity={0.5} style={{ animation: "skel-pulse 1.5s ease-in-out infinite", animationDelay: "0.6s" }}/>
          <rect x={605} y={415} width={112} height={72} rx={6} fill="var(--map-bg)" opacity={0.5} style={{ animation: "skel-pulse 1.8s ease-in-out infinite", animationDelay: "0.75s" }}/>

        </svg>
        {/* Loading label — branded card */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-lg border border-border/50 animate-scale-in" style={{ transformOrigin: "center" }}>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Compass className="h-5 w-5 text-primary" />
            </div>
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary/60" style={{
                  animation: `loading-bounce 0.8s ease-in-out ${i * 0.18}s infinite`
                }}/>
              ))}
            </div>
            <p className="text-xs font-semibold text-muted-foreground">Loading campus map</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Data States: Loading, Empty, Error ─────────────────────────────────
  if (isCampusLoading && !activeCampus) {
    return (
      <div className="relative flex flex-col items-center justify-center w-full" style={{ height: "calc(100dvh - 56px)", background: "var(--map-bg)" }}>
        <div className="flex flex-col items-center gap-3.5 p-8 rounded-3xl bg-card/90 border border-border/80 shadow-2xl backdrop-blur-md text-center max-w-xs">
          <Loader2 className="h-9 w-9 text-primary animate-spin" />
          <div>
            <p className="text-base font-extrabold text-foreground mb-1">Loading Campus Map</p>
            <p className="text-xs text-muted-foreground">Fetching published campus from Supabase...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isCampusEmpty && !activeCampus) {
    return (
      <div className="relative flex flex-col items-center justify-center w-full p-6" style={{ height: "calc(100dvh - 56px)", background: "var(--map-bg)" }}>
        <div className="flex flex-col items-center text-center max-w-sm p-8 rounded-3xl bg-card border border-border shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
            <Building2 className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-extrabold text-foreground mb-2">No Published Campus Map</h3>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            The administrator has not published a campus map version yet. Please check back later.
          </p>
          <button
            onClick={() => refetchCampus()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 transition-all shadow-md cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check Again
          </button>
        </div>
      </div>
    );
  }

  if (campusError && !activeCampus) {
    return (
      <div className="relative flex flex-col items-center justify-center w-full p-6" style={{ height: "calc(100dvh - 56px)", background: "var(--map-bg)" }}>
        <div className="flex flex-col items-center text-center max-w-sm p-8 rounded-3xl bg-card border border-destructive/20 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-extrabold text-foreground mb-2">Unable to Load Campus Map</h3>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            {campusError}
          </p>
          <button
            onClick={() => refetchCampus()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 transition-all shadow-md cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={mapContainerRef}
      className="relative overflow-hidden animate-fade-in"
      style={{
        height: fullScreen ? "100dvh" : "calc(100dvh - 76px)",
        background: isFloorMode ? "var(--map-floor-corridor)" : "var(--map-bg)",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none"
      }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>

      {/* Cached Offline Banner — small inline toast */}
      {isCampusCached && (
        <div data-no-drag className="absolute top-2 left-2 right-2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/90 text-white text-[10px] font-bold shadow-md backdrop-blur-md border border-amber-400/20 md:top-4 md:left-auto md:right-auto md:left-1/2 md:-translate-x-1/2 md:w-auto md:px-4 md:py-2 md:rounded-xl md:text-xs">
          <AlertTriangle className="h-3 w-3 md:h-4 md:w-4 shrink-0" />
          <span>Offline — cached map</span>
          <button onClick={() => refetchCampus()} className="underline ml-1 hover:opacity-80">
            Refresh
          </button>
        </div>
      )}

      {/* Pinning hint (tap-on-map mode) */}
      {pinning && !isFloorMode && (
        <div data-no-drag className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/90 text-white text-xs font-bold shadow-xl border border-blue-400/30 animate-fade-in">
          <Crosshair className="h-3.5 w-3.5 animate-pulse shrink-0" />
          <span>Tap anywhere on the map to set your location</span>
          <button onClick={() => setPinning(false)} className="underline ml-1 hover:opacity-80">
            Cancel
          </button>
        </div>
      )}

      {/* "You are here" chip — single clear action (Plan route / Clear) */}
      {youAreHere && !isFloorMode && !directionsMode && (
        <div data-no-drag className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-blue-500 text-white text-[11px] font-bold shadow-xl border border-blue-400/40">
          <Crosshair className="h-3 w-3 animate-pulse" />
          <span>You are here</span>
          <button
            onClick={(e) => { e.stopPropagation(); setDirectionsMode(true); }}
            className="ml-1 px-2 py-0.5 rounded-full bg-white text-blue-700 text-[10px] font-extrabold hover:bg-blue-50 transition-colors"
            aria-label="Plan a route from your location"
          >
            Plan route
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearYouAreHere(); }}
            className="ml-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            aria-label="Clear your location"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ══════════════════════════ MAP SVG ══════════════════════════ */}
      <svg ref={svgRef}
        viewBox={isFloorMode ? `0 0 ${FP_W} ${FP_H}` : `0 0 ${outdoorCanvasW} ${outdoorCanvasH}`}
        className="absolute inset-0 w-full h-full select-none"
        preserveAspectRatio="xMidYMid meet"
        onDoubleClick={e => {
          e.preventDefault();
          if (!isFloorMode && (e.target as Element).closest("[data-bldg]")) return;
          setZoom(z => Math.min(3.5, +(z+0.35).toFixed(2)));
        }}>
        <defs>
          <filter id="bldg-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.25)"/>
          </filter>
          <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feFlood floodColor="var(--map-route)" floodOpacity="0.35" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <marker id="route-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--map-route)" fillOpacity="0.6"/>
          </marker>

        </defs>

        <g transform={`translate(${tx},${ty}) scale(${displayZoom})`}>

          {/* ════════ FLOOR PLAN mode ════════ */}
          {isFloorMode ? (() => {
            if (!currentFloor) return null;
            return (
              <>
                {/* ── Architectural wall background ── */}
                <rect width={FP_W} height={FP_H} fill="var(--map-floor-bg)"/>
                {/* Grid for scale reference */}
                {[...Array(22)].map((_,i) => <line key={`gv${i}`} x1={i*20} y1={0} x2={i*20} y2={FP_H} stroke="var(--map-boundary)" strokeWidth={0.5} opacity={0.15}/>)}
                {[...Array(15)].map((_,i) => <line key={`gh${i}`} x1={0} y1={i*20} x2={FP_W} y2={i*20} stroke="var(--map-boundary)" strokeWidth={0.5} opacity={0.15}/>)}
                {/* Outer building wall — thick */}
                <rect x={8} y={8} width={FP_W-16} height={FP_H-16} rx={2}
                  fill="var(--map-floor-wall)" stroke="var(--map-floor-wall-stroke)" strokeWidth={5}/>
                {/* Corridor floor */}
                <rect x={13} y={13} width={FP_W-26} height={FP_H-26} fill="var(--map-floor-corridor)"/>
                {/* Mode tints */}
                {mapMode === "emergency" && <rect x={8} y={8} width={FP_W-16} height={FP_H-16} fill="var(--map-route)" opacity={0.08}/>}
                {mapMode === "accessible" && <rect x={8} y={8} width={FP_W-16} height={FP_H-16} fill="var(--map-route-start)" opacity={0.08}/>}

                {/* ── Rooms ── */}
                {(() => {
                  const hasUp = floorNums.some(n => n > (floorView?.floor ?? 1));
                  const hasDn = floorNums.some(n => n < (floorView?.floor ?? 1));
                  const archFills: Record<string,string> = {
                    classroom:"var(--map-room-classroom)", office:"var(--map-room-office)", lab:"var(--map-room-lab)",
                    lobby:"var(--map-room-default)", restroom:"var(--map-room-restroom)", stairs:"var(--map-room-stairs)",
                    storage:"var(--map-room-storage)", elevator:"var(--map-room-elevator)",
                  };
                  return currentFloor.rooms.map(room => {
                    const isNav  = room.type === "stairs" || room.type === "elevator";
                    const isHov  = hoveredRoom === room.id;
                    const isHigh = highlightedRoom === room.id;
                    const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
                    const navColor = room.type === "elevator"
                      ? (hasUp && hasDn ? "#7c3aed" : hasUp ? "#16a34a" : "#f97316")
                      : (hasUp && hasDn ? "#2563eb" : hasUp ? "#2563eb" : "#f97316");
                    const roomFill = isHigh ? "var(--map-route)" :
                      isHov && isNav ? "var(--map-route)" :
                      isHov ? (archFills[room.type] ?? "var(--map-room-default)") :
                      (mapMode === "accessible" && (room.type === "elevator" || room.name.toLowerCase().includes("restroom")))
                        ? "var(--map-route-start)" :
                      archFills[room.type] ?? "var(--map-room-default)";
                    const roomFillOpacity = isHigh ? 0.15 : (mapMode === "accessible" && (room.type === "elevator" || room.name.toLowerCase().includes("restroom"))) ? 0.25 : 1;

                    return (
                      <g key={room.id} data-room
                        onMouseEnter={() => setHoveredRoom(room.id)}
                        onMouseLeave={() => setHoveredRoom(null)}
                        onClick={e => {
                          e.stopPropagation();
                          if (dragRef.current?.moved || !isNav) return;
                          const fv = floorViewRef.current;
                          const fd = fv ? FLOOR_PLANS[fv.building.id] : null;
                          if (!fv || !fd) return;
                          const nums = fd.floors.map(f => f.number);
                          const upF = nums.find(n => n > fv.floor) ?? null;
                          const dnF = [...nums].reverse().find(n => n < fv.floor) ?? null;
                          if (upF && dnF) {
                            setStairChoice({
                              roomType: room.type as RoomType, upFloor: upF, dnFloor: dnF,
                              upLabel: fd.floors.find(f => f.number === upF)?.label ?? `Floor ${upF}`,
                              dnLabel: fd.floors.find(f => f.number === dnF)?.label ?? `Floor ${dnF}`,
                            });
                          } else { navigateStair(room.type as RoomType); }
                        }}
                        style={{ cursor: isNav ? "pointer" : "default" }}>

                        {/* Search highlight */}
                        {isHigh && <rect x={room.x-3} y={room.y-3} width={room.w+6} height={room.h+6} rx={2}
                          fill="none" stroke="#0e2a6e" strokeWidth={2.5}
                          style={{ animation:"border-glow 2s ease-in-out infinite" }}/>}

                        {/* Room slab */}
                        <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
                          fill={roomFill}
                          fillOpacity={roomFillOpacity}
                          stroke={isHigh ? "var(--map-route)" : isHov ? navColor : isNav ? navColor : "var(--map-floor-wall-stroke)"}
                          strokeWidth={isHigh || isHov ? 2.5 : isNav ? 1.5 : 1}/>

                        {/* Interior shadow edges (gives depth) */}
                        {!isNav && !isHigh && <>
                          <line x1={room.x+1} y1={room.y+1} x2={room.x+room.w-1} y2={room.y+1} stroke="var(--map-room-text)" strokeWidth={1.5} opacity={0.08}/>
                          <line x1={room.x+1} y1={room.y+1} x2={room.x+1} y2={room.y+room.h-1} stroke="var(--map-room-text)" strokeWidth={1.5} opacity={0.08}/>
                          <line x1={room.x} y1={room.y+room.h} x2={room.x+room.w} y2={room.y+room.h} stroke="var(--map-room-text)" strokeWidth={1} opacity={0.06}/>
                          <line x1={room.x+room.w} y1={room.y} x2={room.x+room.w} y2={room.y+room.h} stroke="var(--map-room-text)" strokeWidth={1} opacity={0.06}/>
                        </>}

                        {/* Room name */}
                        {room.w >= 44 && room.h >= 18 && !isNav && (
                          <text x={cx} y={cy+3} textAnchor="middle"
                            fill={isHov ? "var(--map-route)" : "var(--map-room-text)"}
                            fontSize={room.w > 90 ? 8 : 6.5} fontWeight="600"
                            className="pointer-events-none select-none">
                            {room.name.length > 14 ? room.name.slice(0,13)+"…" : room.name}
                          </text>
                        )}

                        {/* Nav room: colored disc + icon */}
                        {isNav && (() => {
                          const r = Math.min(room.w, room.h) * 0.24;
                          return (
                            <>
                              <circle cx={cx} cy={cy} r={r} fill={isHov ? "white" : navColor} opacity={0.95}/>
                              {room.type === "stairs" ? (
                                <g fill="none" stroke={isHov ? navColor : "white"} strokeWidth={1.4} strokeLinecap="round" className="pointer-events-none">
                                  <path d={`M${cx-r*.6},${cy+r*.5} h${r*.5} v-${r*.5} h${r*.5} v-${r*.5}`}/>
                                </g>
                              ) : (
                                <g fill="none" stroke={isHov ? navColor : "white"} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none">
                                  <path d={`M${cx-r*.5},${cy-r*.2} L${cx},${cy-r*.7} L${cx+r*.5},${cy-r*.2}`}/>
                                  <path d={`M${cx-r*.5},${cy+r*.2} L${cx},${cy+r*.7} L${cx+r*.5},${cy+r*.2}`}/>
                                </g>
                              )}
                              {/* Direction arrows outside disc */}
                              {hasUp && <text x={cx} y={room.y+7} textAnchor="middle" fontSize={8} fontWeight="900"
                                fill={isHov ? "white" : navColor} className="pointer-events-none select-none">↑</text>}
                              {hasDn && <text x={cx} y={room.y+room.h-1} textAnchor="middle" fontSize={8} fontWeight="900"
                                fill={isHov ? "white" : navColor} className="pointer-events-none select-none">↓</text>}
                              {/* Type label */}
                              {room.h >= 28 && <text x={cx} y={room.y+room.h-8} textAnchor="middle" fontSize={5.5} fontWeight="700"
                                fill={isHov ? "white" : "var(--map-room-text)"} className="pointer-events-none select-none">
                                {room.type === "elevator" ? "ELEV" : "STAIR"}
                              </text>}
                            </>
                          );
                        })()}

                        {/* Emergency exit label */}
                        {mapMode === "emergency" && isNav && (
                          <text x={cx} y={room.y-5} textAnchor="middle" fontSize={6} fontWeight="900"
                            fill="#dc2626" className="pointer-events-none select-none">EXIT</text>
                        )}
                      </g>
                    );
                  });
                })()}

                {/* ── Indoor route path ── */}
                {indoorRoute && indoorRoute.waypoints.length >= 2 && (
                  <g>
                    {/* Shadow path */}
                    <polyline
                      points={indoorRoute.waypoints.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none" stroke="rgba(0,0,0,0.20)"
                      strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
                    />
                    {/* Solid path */}
                    <polyline
                      points={indoorRoute.waypoints.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none" stroke="var(--map-route)"
                      strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray="1200" strokeDashoffset="1200"
                      style={{ animation:"draw-route 1s cubic-bezier(0.4,0,0.2,1) forwards" }}
                    />
                    {/* Dashed marching ants overlay */}
                    <polyline
                      points={indoorRoute.waypoints.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none" stroke="rgba(255,255,255,0.6)"
                      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray="6 10"
                      style={{ animation:"draw-route 1s 0.3s ease forwards, dash-flow 1s 1.5s linear infinite" }}
                    />
                    {/* Start marker */}
                    <circle cx={indoorRoute.waypoints[0].x} cy={indoorRoute.waypoints[0].y} r={6}
                      fill="#16a34a" stroke="white" strokeWidth={2}
                      style={{ animation:"scale-in 0.3s 0.5s ease both" }}/>
                    {/* End marker (pulsing) */}
                    <circle cx={indoorRoute.waypoints[indoorRoute.waypoints.length - 1].x}
                      cy={indoorRoute.waypoints[indoorRoute.waypoints.length - 1].y}
                      r={7} fill="var(--map-route)" stroke="white" strokeWidth={2.5}
                      style={{ animation:"scale-in 0.3s 0.7s ease both" }}/>
                    <circle cx={indoorRoute.waypoints[indoorRoute.waypoints.length - 1].x}
                      cy={indoorRoute.waypoints[indoorRoute.waypoints.length - 1].y}
                      r={12} fill="none" stroke="var(--map-route)" strokeWidth={2} opacity={0.4}
                      style={{ animation:"pulse-ring 1.8s ease-in-out infinite" }}/>
                  </g>
                )}

                {/* ── Event Overlay (approved events for this floor) ── */}
                {activeOverlays.map((overlay) => (
                  <g 
                    key={overlay.id} 
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!dragRef.current?.moved) setSelectedEvent(overlay);
                    }}
                  >
                    {/* Event furniture */}
                    {(overlay.eventFurniture ?? []).map((f) => (
                      <g key={f.id} transform={`translate(${f.x},${f.y}) rotate(${f.rotation || 0},${f.width / 2},${f.height / 2})`}>
                        <rect
                          width={f.width}
                          height={f.height}
                          fill={f.color}
                          fillOpacity={0.75}
                          rx={2}
                          stroke="white"
                          strokeWidth={1.5}
                        />
                        <text
                          x={f.width / 2}
                          y={f.height / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={8}
                          fontWeight="bold"
                          fill="white"
                          className="select-none pointer-events-none"
                        >
                          {f.name}
                        </text>
                      </g>
                    ))}
                    {/* Event labels */}
                    {(overlay.eventLabels ?? []).map((l) => (
                      <text
                        key={l.id}
                        x={l.x}
                        y={l.y}
                        fontSize={l.fontSize || 10}
                        fontWeight="bold"
                        fill={l.color || '#1f2937'}
                        transform={l.rotation ? `rotate(${l.rotation},${l.x},${l.y})` : undefined}
                        className="select-none pointer-events-none"
                      >
                        {l.text}
                      </text>
                    ))}
                    {/* Event overlay indicator */}
                    <text
                      x={10}
                      y={FP_H - 20}
                      fontSize={7}
                      fontWeight="bold"
                      fill="#8b5cf6"
                      className="select-none pointer-events-none"
                    >
                      🎪 {overlay.title}
                    </text>
                  </g>
                ))}

                {/* ── Compass rose ── */}
                <g transform={`translate(${FP_W-22},20)`}>
                  <circle r={12} fill="var(--map-compass-bg)" stroke="var(--map-floor-wall-stroke)" strokeWidth={1}/>
                  <text textAnchor="middle" y={-2} fontSize={7} fontWeight="900" fill="var(--map-compass-n)">N</text>
                  <line y1={0} y2={-8} stroke="var(--map-compass-n)" strokeWidth={2} strokeLinecap="round"/>
                  <line y1={0} y2={7} stroke="var(--map-compass-n)" strokeWidth={1} strokeLinecap="round" opacity={0.5}/>
                </g>
                {/* Floor watermark */}
                <text x={FP_W/2} y={FP_H-5} textAnchor="middle" fontSize={7} fontWeight="600"
                  fill="#7a7672" opacity={0.8} className="select-none pointer-events-none">
                  {currentFloor.label} — {floorView?.building.code}
                </text>
              </>
            );
          })() : (
          /* ════════ CAMPUS MAP mode ════════ */
          <>
            <rect data-bg="true" width={outdoorCanvasW} height={outdoorCanvasH} fill="var(--map-bg)" style={{ cursor: pinning ? "crosshair" : undefined }}/>
            <rect x={6} y={6} width={Math.max(0, outdoorCanvasW - 12)} height={Math.max(0, outdoorCanvasH - 12)} fill="none" stroke="var(--map-boundary)" strokeWidth={3} rx={4} opacity={0.5} strokeDasharray="8 4"/>

            {/* Legacy overlays remain only for the compatibility/demo map. */}
            {!activeCampus && mapMode === "accessible" && <>
              <path d="M 119,289 L 155,289 L 155,170" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              <path d="M 414,289 L 540,289 L 540,373" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              <path d="M 414,289 L 414,435 L 305,435" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              {([[155,290,"#16a34a"],[414,373,"#16a34a"],[414,435,"#16a34a"]] as [number,number,string][]).map(([cx,cy,clr],i) => (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={12} fill="white" stroke={clr} strokeWidth={2.5} style={{ animation:"scale-in 0.3s ease both" }}/>
                  <svg x={cx-8} y={cy-8} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="select-none">
                    <circle cx="16" cy="4" r="1"/>
                    <path d="m18 19 1-7-6 1"/>
                    <path d="m5 8 3-3 5.5 3-2.36 3.5"/>
                    <path d="M4.24 14.5a5 5 0 0 0 6.88 6"/>
                    <path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>
                  </svg>
                  {!reducedMotion && (
                    <circle cx={cx} cy={cy} r={12} fill="none" stroke={clr} strokeWidth={2} opacity={0.3}>
                      <animate attributeName="r" from="12" to="20" dur="1.5s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                  )}
                </g>
              ))}
              {/* Building entrance accessibility markers */}
              {([[155,170,"MAB - Ramp Access"],[395,115,"ADM - Elevator"],[540,295,"LRC - Ground"],[165,305,"ELB - Ramp"],[305,435,"GYM - Level"],[605,415,"SSC - Ground"]] as [number,number,string][]).map(([ex,ey,label],i) => (
                <g key={`acc${i}`}>
                  <rect x={ex-10} y={ey-10} width={20} height={10} rx={4} fill="#16a34a" fillOpacity={0.85} stroke="white" strokeWidth={1}/>
                  <text x={ex} y={ey-3} textAnchor="middle" fill="white" fontSize={5.5} fontWeight="900" className="select-none pointer-events-none">{label}</text>
                </g>
              ))}
            </>}
            {/* Emergency overlay */}
            {!activeCampus && mapMode === "emergency" && <>
              <rect x={0} y={272} width={SVG_W} height={26} fill="rgba(220,38,38,0.15)"/>
              {([[119,285,"EXIT"],[680,285,"EXIT"],[401,285,"RALLY"]] as [number,number,string][]).map(([cx,cy,lbl],i) => (
                <g key={i}><circle cx={cx} cy={cy} r={16} fill="#dc2626" stroke="white" strokeWidth={2.5}/><text x={cx} y={cy+4} textAnchor="middle" fill="white" fontSize={7} fontWeight="900" className="select-none">{lbl}</text></g>
              ))}
            </>}
            {readonlyOutdoorCampus && (
              <ReadonlyOutdoorCampusScene
                campus={readonlyOutdoorCampus}
                showBuildings={layers.buildings}
                selectedBuildingId={selected?.id ?? null}
                onSelectBuilding={(buildingId) => {
                  const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
                  if (building) selectBuilding(selected?.id === buildingId ? null : building);
                }}
                onDoubleClickBuilding={(buildingId) => {
                  const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
                  if (building) openFloorPlan(building);
                }}
              />
            )}
            {/* Route */}
            {route && (
              <RouteMapOverlay points={route.points} mode={mapMode} fading={routeFading} walkProgress={walkProgress} />
            )}
            {/* Legacy demo buildings are used only when no canonical campus is available. */}
            {!activeCampus && layers.buildings && MOCK_BUILDINGS.map(b => {
              const pos = B_POS[b.id]; if (!pos) return null;
              const isSel = selected?.id === b.id;
              const googleFill = mapMode === "standard"
                ? (b.category === "sports" ? "var(--map-building-sports-fill)" : b.category === "library" || b.category === "facility" ? "var(--map-building-library-fill)" : "var(--map-building-default-fill)")
                : buildingFill(b.id);
              return (
                <g key={b.id} data-bldg style={{ cursor: isDragging ? "grabbing" : "pointer" }}
                  onClick={e => { e.stopPropagation(); if (!dragRef.current?.moved) selectBuilding(isSel ? null : b); }}
                  onDoubleClick={e => { e.stopPropagation(); openFloorPlan(b); }}>
                  {isSel && <rect x={pos.x-7} y={pos.y-7} width={pos.w+14} height={pos.h+14} rx={10}
                    fill="none" stroke="#1e40af" strokeWidth={3} opacity={0.9}
                    style={{ animation:"border-glow 1.5s ease-in-out infinite" }}/>}
                  <rect x={pos.x+3} y={pos.y+4} width={pos.w} height={pos.h} rx={5} fill="rgba(0,0,0,0.10)" filter="url(#bldg-shadow)"/>
                  {/* Building body */}
                  <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx={4}
                    fill={mapMode === "standard" ? googleFill : buildingFill(b.id)}
                    stroke={isSel ? "#1e40af" : mapMode === "standard" ? "var(--map-building-stroke)" : "rgba(255,255,255,0.5)"}
                    strokeWidth={isSel ? 2.5 : 1} opacity={isSel ? 1 : 0.94}/>
                  {/* Roof band */}
                  <rect x={pos.x} y={pos.y} width={pos.w} height={6} rx={4}
                    fill={mapMode === "standard" ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.18)"}/>
                  {/* Windows (standard mode only, when big enough) */}
                  {mapMode === "standard" && pos.w >= 60 && pos.h >= 40 && (
                    <>
                      {[...Array(Math.min(4, Math.floor(pos.w/22)))].map((_,wi) =>
                        [0,1].map(ri => {
                          const wx = pos.x + 8 + wi*((pos.w-16)/Math.min(4,Math.floor(pos.w/22)));
                          const wy = pos.y + 14 + ri*12;
                          if (wy + 7 > pos.y + pos.h - 4) return null;
                          return <rect key={`w${wi}-${ri}`} x={wx} y={wy} width={8} height={6} rx={1}
                            fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.08)" strokeWidth={0.5}/>;
                        })
                      )}
                    </>
                  )}
                  {/* Building code */}
                  <text x={pos.x+pos.w/2} y={pos.y+pos.h/2+3} textAnchor="middle"
                    fill={mapMode === "standard" ? "var(--map-building-text)" : "white"}
                    fontSize={10} fontWeight="800" letterSpacing="-0.3"
                    className="pointer-events-none select-none">{b.code}</text>
                  {/* Building name label */}
                  {displayZoom > 0.7 && <text x={pos.x+pos.w/2} y={pos.y+pos.h+13}
                    textAnchor="middle" fill={mapMode === "standard" ? "var(--map-building-name)" : "rgba(255,255,255,0.9)"}
                    fontSize={7} fontWeight="600"
                    style={{ textShadow: mapMode === "standard" ? "0 1px 3px rgba(255,255,255,0.95)" : "none" }}
                    className="pointer-events-none select-none">
                    {b.name.length > 20 ? b.name.slice(0,18)+"…" : b.name}
                  </text>}
                  {/* Floor plan indicator */}
                  {FLOOR_PLANS[b.id] && <circle cx={pos.x+pos.w-6} cy={pos.y+6} r={4} fill="#16a34a" stroke="white" strokeWidth={1.5}/>}
                </g>
              );
            })}
            {/* "You are here" marker (kiosk-style start) */}
            {youAreHere && !isFloorMode && (
              <g data-you-are-here style={{ pointerEvents: "none" }}>
                {!reducedMotion && (
                  <circle cx={youAreHere.x} cy={youAreHere.y} r={13} fill="none" stroke="#2563eb" strokeWidth={2.5} opacity={0.5}>
                    <animate attributeName="r" from="12" to="28" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={youAreHere.x} cy={youAreHere.y} r={9} fill="#2563eb" stroke="white" strokeWidth={3}
                  style={{ filter: "drop-shadow(0 2px 6px rgba(37,99,235,0.5))" }} />
                <circle cx={youAreHere.x} cy={youAreHere.y} r={3.5} fill="white" />
                <g transform={`translate(${youAreHere.x},${youAreHere.y + 24})`}>
                  <rect x={-36} y={-11} width={72} height={20} rx={9} fill="rgba(15,23,42,0.88)" />
                  <text x={0} y={2} textAnchor="middle" fill="white" fontSize={8.5} fontWeight={800} className="select-none" letterSpacing="0.5">
                    YOU ARE HERE
                  </text>
                </g>
              </g>
            )}
            {/* Event markers — star pins */}


            {/* Scale bar */}
            <g>
              <rect x={16} y={652} width={120} height={4} fill="none" stroke="#8a7a6a" strokeWidth={1}/>
              <line x1={16} y1={648} x2={16} y2={656} stroke="#8a7a6a" strokeWidth={1.5}/>
              <line x1={76} y1={650} x2={76} y2={656} stroke="#8a7a6a" strokeWidth={1}/>
              <line x1={136} y1={648} x2={136} y2={656} stroke="#8a7a6a" strokeWidth={1.5}/>
              <text x={16} y={645} fontSize={8} fill="#8a7a6a" className="select-none">0</text>
              <text x={70} y={645} fontSize={8} fill="#8a7a6a" className="select-none">50m</text>
              <text x={126} y={645} fontSize={8} fill="#8a7a6a" className="select-none">100m</text>
            </g>
          </>
          )}
        </g>
      </svg>

      {/* ══════════════ FLOATING SEARCH / DIRECTIONS — same for both modes ══════════════ */}
      <div
        data-no-drag
        className={cn(
          "absolute z-20",
          directionsMode
            ? // Mobile: dialog handles its own fixed positioning; desktop: floating panel
              "md:inset-x-auto md:bottom-auto md:top-3 md:left-3 md:w-[350px]"
            : "top-3 left-3 hidden md:block"
        )}
        style={directionsMode ? undefined : { width: 300, maxWidth: "min(300px, calc(50vw - 160px))" }}
      >

        {/* Breadcrumb strip (floor plan mode only) */}
        {isFloorMode && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <button onClick={closeFloorPlan}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border border-white/20 transition-all hover:bg-white/20"
              style={{ background:"rgba(0,0,0,0.35)", color:"rgba(255,255,255,0.9)", backdropFilter:"blur(8px)" }}>
              <ChevronLeft className="h-3 w-3"/> Main Campus
            </button>
            <span style={{ color:"rgba(255,255,255,0.35)" }}>›</span>
            <span className="text-[11px] font-semibold truncate max-w-[110px]"
              style={{ color:"rgba(255,255,255,0.75)" }}>
              {floorView?.building.code}
            </span>
          </div>
        )}

        {directionsMode ? (
          <RoutePlannerDialog
            from={fromBuilding}
            to={toBuilding}
            onFromChange={setFromBuilding}
            onToChange={setToBuilding}
            buildings={MOCK_BUILDINGS}
            mode={mapMode}
            onModeChange={setMapMode}
            route={route}
            youAreHere={youAreHere}
            useMyLocation={useMyLocation}
            onUseMyLocationChange={setUseMyLocation}
            onClose={() => { setDirectionsMode(false); setFromBuilding(null); setToBuilding(null); }}
            onClear={() => { setFromBuilding(null); setToBuilding(null); }}
            onFindRoute={() => { if ((useMyLocation && toBuilding) || (fromBuilding && toBuilding)) setDirectionsMode(false); }}
          />
        ) : (
          /* ── Search bar ── */
          <>
            <div className="flex items-center gap-2">
              <div className={cn("flex-1 flex items-center gap-2 h-11 px-3.5 rounded-2xl border shadow-lg transition-all",
                searchFocused ? "border-primary/40 ring-2 ring-primary/10" : "border-border")}
                style={{ background:"var(--card)", color:"var(--foreground)" }}>
                <Search className="h-4 w-4 shrink-0" style={{ color:"var(--muted-foreground)" }}/>
                <input type="text" value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder={isFloorMode ? "Search rooms, offices, labs…" : "Search buildings, offices…"}
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                  style={{ fontFamily:"var(--font-body)", color:"var(--foreground)" }}/>
                {search && <button onClick={() => setSearch("")} style={{ color:"var(--muted-foreground)" }} className="hover:opacity-70 shrink-0"><X className="h-3.5 w-3.5"/></button>}
              </div>
              <button onClick={e => { e.stopPropagation(); setDirectionsMode(true); }} title="Directions"
                className="w-11 h-11 rounded-2xl border border-border shadow-lg flex items-center justify-center transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary"
                style={{ background:"var(--card)", color:"var(--muted-foreground)" }}>
                <Navigation className="h-4 w-4"/>
              </button>
            </div>

            {/* Search dropdown */}
            {searchFocused && (
              <div className="mt-1.5 rounded-2xl border border-border shadow-xl overflow-hidden"
                style={{ background:"var(--card)", color:"var(--foreground)" }}>
                {/* Recent (campus mode) */}
                {!isFloorMode && !search && recentSearches.length > 0 && (
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Recent</p>
                      <button onClick={() => setRecentSearches([])} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentSearches.map(name => {
                        const b = MOCK_BUILDINGS.find(b => b.name === name);
                        return b ? (
                          <button key={name} onMouseDown={e => { e.preventDefault(); selectBuilding(b); }}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground hover:text-primary transition-colors">
                            <Clock className="h-3 w-3"/> {b.code}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                {/* Popular (campus mode, no query) */}
                {!isFloorMode && !search && (
                  <div className="px-4 py-3 border-t border-border">
                    <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Popular</p>
                    <div className="grid grid-cols-2 gap-1">
                      {POPULAR.map(p => {
                        const b = MOCK_BUILDINGS.find(bld => bld.id === p.buildingId);
                        if (!b) return null;
                        return (
                          <button key={p.label} onMouseDown={e => { e.preventDefault(); selectBuilding(b); }}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-muted transition-colors text-left">
                            <MapPin className="h-3 w-3 text-primary shrink-0"/>
                            <span className="text-xs font-semibold text-foreground">{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Unified Search Results (C3) */}
                {search && (
                  <div className="max-h-60 overflow-y-auto divide-y divide-border/40">
                    {campusSearch.results.length > 0 ? (
                      campusSearch.results.map((item) => (
                        <button
                          key={item.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSearchResult(item);
                          }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/80 transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                              {item.kind === "building" ? (
                                <Building2 className="h-4 w-4" />
                              ) : (
                                <MapPin className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {item.buildingName ? `${item.buildingName} ${item.floorLabel ? `· ${item.floorLabel}` : ""}` : item.code || item.category || "Building"}
                              </p>
                            </div>
                          </div>
                          {item.accessible && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 shrink-0">
                              Accessible
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="flex flex-col items-center py-6 px-4 text-center">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-2.5">
                          <Search className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-bold text-foreground mb-0.5">No results found</p>
                        <p className="text-xs text-muted-foreground max-w-[200px]">
                          We couldn&apos;t find anything matching &ldquo;{search}&rdquo;. Try a different building or room name.
                        </p>
                        <button
                          onClick={() => setSearch("")}
                          className="mt-3 text-xs font-bold text-primary hover:underline cursor-pointer"
                        >
                          Clear search
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════ MODE CHIPS — always visible, same position ══════════════ */}
      <div data-no-drag className="absolute top-3 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-1 rounded-2xl border border-border/60 px-2 py-1.5 shadow-lg"
        style={{ background:"var(--card)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)" }}>
        {([
          ["standard",   "Standard",   <Compass className="h-3.5 w-3.5"/>],
          ["accessible", "Accessible", <Accessibility className="h-3.5 w-3.5"/>],
          ["emergency",  "SOS",        <AlertTriangle className="h-3.5 w-3.5"/>],
        ] as const).map(([m, lbl, icon]) => (
          <button key={m} onClick={e => { e.stopPropagation(); setMapMode(m as MapMode); }}
            className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all",
              mapMode === m
                ? m === "accessible" ? "bg-green-500/15 text-green-700 dark:text-green-400"
                  : m === "emergency" ? "bg-destructive/15 text-destructive"
                  : "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
            {icon}{lbl}
          </button>
        ))}
      </div>

      {/* Accessibility / SOS Legend (visible only in special modes) */}
      {mapMode !== "standard" && (
        <div data-no-drag className="absolute top-14 left-1/2 -translate-x-1/2 z-20 animate-slide-up">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-lg"
            style={{
              background: mapMode === "accessible" ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderColor: mapMode === "accessible" ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)",
            }}>
            {mapMode === "accessible" ? (
              <>
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400">
                  <Accessibility className="h-3 w-3" /> Accessible Route
                </span>
                <span className="w-px h-3 bg-green-500/20"/>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600/70 dark:text-green-500/70">■ Ramp</span>
                <span className="text-[10px] font-semibold text-green-600/70 dark:text-green-500/70">■ Elevator</span>
                <span className="text-[10px] font-semibold text-green-600/70 dark:text-green-500/70">— Wide Paths</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3"/> Emergency Mode
                </span>
                <span className="w-px h-3 bg-red-500/20"/>
                <span className="text-[10px] font-semibold text-red-500/80">■ EXIT Points</span>
                <span className="text-[10px] font-semibold text-red-500/80">■ Assembly Area</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ FLOOR SELECTOR (floor plan mode — always visible when in floor view) ══════════════ */}
      {isFloorMode && currentFloorData && (
        <div data-no-drag className="absolute right-14 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 p-1.5 rounded-2xl border border-border/60 shadow-xl"
          style={{ background:"var(--card)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)" }}>
          <p className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest text-center px-1 pb-0.5">Floor</p>
          {[...currentFloorData.floors].reverse().map(f => (
            <button key={f.number}
              onClick={e => { e.stopPropagation(); setFloorView(v => v ? {...v, floor:f.number} : v); setZoom(1); setPan({x:0,y:0}); setHighlightedRoom(null); }}
              className={cn("w-9 h-9 rounded-xl text-[11px] font-extrabold transition-all",
                floorView?.floor === f.number
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-secondary")}>
              {f.number === 1 ? "G" : `${f.number}`}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════ ZOOM CONTROLS — desktop only ══════════════ */}
      <div data-no-drag className={cn("absolute bottom-20 md:bottom-5 right-3 z-20 flex flex-col gap-1", route && "hidden")}>
        {allActiveEvents.length > 0 && (
          <div className="relative mb-2">
            <button
              onClick={() => setShowEventsList(v => !v)}
              className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-card border border-border/60 shadow-lg flex flex-col items-center justify-center gap-0.5 hover:bg-muted transition-colors relative group"
            >
              <CalendarDays className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 rounded-full border border-background px-1 text-[8px] font-bold text-white flex items-center justify-center shadow-sm">
                {allActiveEvents.length}
              </span>
            </button>
            <AnimatePresence>
              {showEventsList && (
                <ActiveEventsList
                  events={allActiveEvents}
                  onSelectEvent={(evt) => {
                    handleSelectSearchResult({
                      id: evt.id,
                      name: evt.title,
                      kind: "marker",
                      category: "event"
                    });
                  }}
                  onClose={() => setShowEventsList(false)}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        <button onClick={e => { e.stopPropagation(); setShowLayers(v => !v); }} title="Layers"
          className={cn("w-9 h-9 rounded-xl border shadow-md flex items-center justify-center transition-all",
            showLayers ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border/60 text-muted-foreground hover:border-primary/30")}>
          <Layers className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); setZoom(z => Math.min(3.5,+(z+0.4).toFixed(2))); }} title="Zoom in"
          className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 active:scale-95 transition-all" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); setZoom(z => Math.max(0.35,+(z-0.4).toFixed(2))); }} title="Zoom out"
          className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 active:scale-95 transition-all" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); handleLocate(); }} title={youAreHere ? "Re-locate your position" : "You are here — set your location"}
          className={cn("w-10 h-10 md:w-9 md:h-9 rounded-xl border shadow-md flex items-center justify-center transition-all",
            youAreHere
              ? "bg-blue-500 border-blue-500 text-white"
              : pinning
                ? "bg-blue-500/15 border-blue-500/40 text-blue-500"
                : "bg-card border-border/60 text-muted-foreground hover:text-primary hover:border-primary/30")}
          aria-label={youAreHere ? "Re-locate your position" : "Set your location"}>
          {locating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Crosshair className="h-4 w-4"/>}
        </button>
        <button onClick={e => { e.stopPropagation(); setZoom(1); setPan({x:0,y:0}); }} title="Reset view"
          className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 active:scale-95 transition-all" aria-label="Reset view">
          <LocateFixed className="h-4 w-4"/>
        </button>
        {/* Zoom level indicator */}
        <div className="text-center text-[9px] font-semibold text-muted-foreground/60 select-none mt-0.5">
          {Math.round(displayZoom * 100)}%
        </div>
      </div>

      {/* Layers panel */}
      {showLayers && (
        <div data-no-drag className="absolute bottom-6 right-14 bg-card border border-border rounded-2xl shadow-xl w-48 overflow-hidden animate-scale-in z-20">
          <div className="px-4 py-3 border-b border-border"><p className="text-xs font-extrabold text-foreground uppercase tracking-widest">Layers</p></div>
          {(Object.keys(layers) as (keyof typeof layers)[]).map(key => (
            <button key={key} onClick={() => setLayers(p => ({...p, [key]:!p[key]}))}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors">
              <div className={cn("w-9 h-5 rounded-full relative shrink-0 transition-colors", layers[key] ? "bg-primary" : "bg-muted-foreground/25")}>
                <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all", layers[key] ? "left-4" : "left-0.5")}/>
              </div>
              <span className="text-sm font-medium text-foreground capitalize">{key}</span>
            </button>
          ))}
        </div>
      )}

      {/* ══════════════ NAVIGATION PANEL (only when route active & planner closed) ══════════════ */}
      {route && !directionsMode && (
        <>
          {/* Desktop: compact card, bottom-left */}
          <div data-no-drag className="absolute bottom-5 left-3 z-20 hidden md:block animate-slide-up">
            <div style={{ width: 230 }}>
              <RouteStepsPanel
                route={route}
                mode={mapMode}
                toName={toBuilding?.name ?? "Destination"}
                walkProgress={walkProgress}
                onReplay={replayWalk}
                onEnd={() => {
                  setRouteFading(true);
                  setTimeout(() => {
                    setFromBuilding(null);
                    setToBuilding(null);
                    setDirectionsMode(false);
                    setRouteFading(false);
                  }, 300);
                }}
                onZoom={() => setZoom(1.5)}
              />
            </div>
          </div>
          {/* Mobile: bottom sheet with steps (above the app's bottom nav) */}
          <div data-no-drag className="absolute inset-x-0 bottom-[84px] z-30 md:hidden animate-slide-up px-3">
            <RouteStepsPanel
              route={route}
              mode={mapMode}
              toName={toBuilding?.name ?? "Destination"}
              walkProgress={walkProgress}
              onReplay={replayWalk}
              onEnd={() => {
                setRouteFading(true);
                setTimeout(() => {
                  setFromBuilding(null);
                  setToBuilding(null);
                  setDirectionsMode(false);
                  setRouteFading(false);
                }, 300);
              }}
              onZoom={() => setZoom(1.5)}
            />
          </div>
        </>
      )}

      {/* ══════════════ DESKTOP BUILDING INFO PANEL ══════════════ */}
      {selected && (
        <BuildingInfoPanel
          selected={selected}
          onClose={() => selectBuilding(null)}
          onDirections={startDirectionsTo}
          onFloorPlan={(b) => openFloorPlan(b)}
          isFloorMode={isFloorMode}
          floorBuildingId={floorView?.building?.id}
          saved={saved}
          studentAuth={studentAuth}
          onToggleSave={toggleSave}
          onReport={setReportModal}
          onSignInPrompt={setSignInPrompt}
          showQR={showQR}
          onToggleQR={() => setShowQR(v => !v)}
          hasFloorPlans={Boolean(FLOOR_PLANS[selected.id])}
          floorPlanCount={FLOOR_PLANS[selected.id]?.floors?.length ?? 0}
          facilities={BUILDING_FACILITIES[selected.id] ?? []}
          accessibility={BUILDING_ACCESSIBILITY[selected.id] ?? []}
          route={route ? { dist: route.dist, mins: route.mins } : null}
        />
      )}

      {/* ══════════════ ARRIVAL OVERLAY ══════════════ */}
      {showArrival && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowArrival(false)}>
          <div className="flex flex-col items-center gap-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            {/* Celebration ring */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-green-500/10 animate-scale-in flex items-center justify-center"
                style={{ animation:"scale-in 0.5s cubic-bezier(0.16,1,0.3,1) both" }}>
                <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
              {/* Decorative sparkles */}
              <div className="absolute -top-2 -right-2 text-xl animate-scale-in" style={{ animationDelay: "0.3s" }}>✨</div>
              <div className="absolute -bottom-1 -left-3 text-lg animate-scale-in" style={{ animationDelay: "0.5s" }}>🌟</div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-extrabold text-foreground">You Have Arrived</h3>
              <p className="text-sm text-muted-foreground mt-1">{toBuilding?.name ?? "Destination"}</p>
              <div className="flex items-center justify-center gap-3 mt-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                  ✓ Arrived
                </span>
                <span className="text-[10px] text-muted-foreground">Route complete</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowArrival(false); }}
                className="h-9 px-4 rounded-xl border border-border text-muted-foreground text-xs font-bold hover:bg-muted transition-colors">
                Dismiss
              </button>
              <button
                onClick={() => { setShowArrival(false); setFromBuilding(null); setToBuilding(null); setDirectionsMode(false); }}
                className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
                End Navigation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ STAIR LOADING OVERLAY ══════════════ */}
      {stairLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 animate-scale-in"
            style={{ transformOrigin: "center" }}>
            {/* Direction indicator */}
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg",
              stairLoading.dir === "up" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" : "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
            )}>
              {stairLoading.dir === "up" ? "↑" : "↓"}
            </div>
            <div className="text-center">
              <p className="text-sm font-extrabold text-foreground">
                {stairLoading.dir === "up" ? "Going up to" : "Going down to"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{stairLoading.label}</p>
            </div>
            <div className="flex gap-1.5 mt-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full"
                  style={{
                    background: stairLoading.dir === "up" ? "var(--map-route)" : "#f97316",
                    animation: `loading-bounce 1s ease-in-out ${i*0.2}s infinite`
                  }}/>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Changing floor…</p>
          </div>
        </div>
      )}

      {/* ══════════════ INDOOR ROUTE DIRECTIONS PANEL ══════════════ */}
      {indoorRoute && isFloorMode && !stairLoading && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 animate-slide-up">
          <div className="rounded-2xl border border-border/60 shadow-xl overflow-hidden"
            style={{ background:"var(--card)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)", width:280, maxWidth:"calc(100vw - 40px)" }}>
            <div className="flex items-center gap-2 px-3 py-2" style={{ background:"linear-gradient(135deg, var(--primary), var(--map-route))" }}>
              <Footprints className="h-3.5 w-3.5 text-white shrink-0"/>
              <span className="text-[11px] font-extrabold text-white truncate flex-1">Route to {currentFloor?.rooms.find(r => r.id === activeRouteRoom)?.name ?? "room"}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse shrink-0"/>
            </div>
            <div className="flex gap-2 px-3 pt-2.5 pb-2 border-b border-border">
              <div className="flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Distance</p>
                <p className="text-sm font-extrabold text-foreground">{indoorRoute.distanceMeters} m</p>
              </div>
              <div className="flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Est. Time</p>
                <p className="text-sm font-extrabold text-foreground">{indoorRoute.estimatedSeconds < 60 ? `${indoorRoute.estimatedSeconds}s` : `${Math.round(indoorRoute.estimatedSeconds / 60)} min`}</p>
              </div>
            </div>
            <div className="px-3 py-2 max-h-36 overflow-y-auto scrollbar-show-on-hover">
              <div className="relative pl-4 border-l-2 border-primary/30 space-y-2">
                {indoorRoute.steps.map((step, i) => (
                  <div key={i} className="relative flex items-start gap-2">
                    <div className={cn(
                      "absolute -left-[11px] w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      i === 0 ? "bg-green-500 border-green-500" :
                      i === indoorRoute.steps.length - 1 ? "bg-primary border-primary" :
                      "bg-card border-primary/50"
                    )}>
                    </div>
                    <p className="text-[10px] leading-snug pt-0.5 text-foreground ml-1" style={{ fontFamily:"var(--font-body)" }}>{step}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-3 pb-2.5">
              <button onClick={clearIndoorRoute}
                className="w-full h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors">
                Clear Route
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ ROOM HOVER TOOLTIP (floor plan) ══════════════ */}
      {hoveredRoom && isFloorMode && !stairLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in">
          <div className="bg-foreground/90 text-background text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            {currentFloor?.rooms.find(r => r.id === hoveredRoom)?.name}
          </div>
        </div>
      )}

      {/* ══════════════ CAMPUS SELECTOR / MAP LABEL ══════════════ */}
      <div data-no-drag className={cn("absolute bottom-[76px] md:bottom-6 left-1/2 -translate-x-1/2 z-20 hidden md:block", (route || directionsMode) && "hidden")}>
        {isFloorMode ? (
          /* Floor plan: breadcrumb label */
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border shadow-sm"
            style={{ background:"var(--card)", color:"var(--muted-foreground)", fontSize:"10px", fontWeight:600, fontFamily:"var(--font-body)", pointerEvents:"none" }}>
            <MapPin className="h-3 w-3 shrink-0" style={{ color:"var(--primary)" }}/>
            <span style={{ color:"var(--foreground)" }}>{floorView?.building.name}</span>
            <span style={{ color:"var(--border)" }}>·</span>
            <span>{currentFloor?.label ?? "Floor " + floorView?.floor}</span>
          </div>
        ) : (
          /* Campus map: tappable campus selector */
          <div className="relative">
            <button
              onClick={() => setShowCampusSelector(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border shadow-sm hover:shadow-md transition-all"
              style={{ background:"var(--card)", color:"var(--foreground)", fontSize:"11px", fontFamily:"var(--font-body)" }}>
              <MapPin className="h-3 w-3 shrink-0" style={{ color:"var(--primary)" }}/>
              <span className="font-semibold">{activeCampus?.name ?? 'Select Campus'}</span>
              <ChevronDown className="h-3 w-3 shrink-0" style={{ color:"var(--muted-foreground)", transform: showCampusSelector ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}/>
            </button>
            {showCampusSelector && availableCampuses.length > 0 && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-2xl border border-border shadow-2xl overflow-hidden animate-scale-in"
                style={{ background:"var(--card)", width:220 }}>
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>Select Campus</p>
                </div>
                {availableCampuses.map(campus => {
                  const isActive = campus.id === activeCampus?.id;
                  return (
                    <button
                      key={campus.id}
                      onClick={() => { setSelectedCampusId(campus.id); setShowCampusSelector(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-muted/50"
                      style={{
                        borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                        background: isActive ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                      }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isActive ? 'var(--primary)' : 'var(--muted-foreground)' }}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold" style={{ color: isActive ? 'var(--primary)' : 'var(--foreground)', fontFamily:"var(--font-sans)" }}>{campus.name}</p>
                        {campus.code && <p className="text-[10px]" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>{campus.code}</p>}
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-extrabold shrink-0" style={{ color:"var(--primary)" }}>Active</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════ MOBILE: immersive floating UI ══════════════ */}
      <div data-no-drag className="absolute top-2 left-2 right-2 z-20 md:hidden space-y-1.5">
        {/* Search bar — floating glass pill */}
        <div className="flex items-center gap-2 h-10 px-3.5 rounded-full border border-white/20 shadow-xl"
          style={{ background:"rgba(255,255,255,0.85)", backdropFilter:"blur(20px) saturate(180%)", WebkitBackdropFilter:"blur(20px) saturate(180%)" }}>
          {isFloorMode ? (
            <button onClick={closeFloorPlan} className="text-primary shrink-0 flex items-center gap-1" aria-label="Back to campus map">
              <ChevronLeft className="h-4 w-4"/>
              <span className="text-[10px] font-bold text-foreground truncate max-w-[110px]">
                {floorView?.building.code} · {currentFloor?.label ?? `Floor ${floorView?.floor}`}
              </span>
            </button>
          ) : (
            <Search className="h-4 w-4 text-muted-foreground shrink-0"/>
          )}
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder={isFloorMode ? "Search rooms…" : "Search buildings…"}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            style={{ fontFamily:"var(--font-body)" }}/>
          {search && <button onClick={() => setSearch("")}><X className="h-4 w-4 text-muted-foreground"/></button>}
          <div className="w-px h-5 bg-border/60 shrink-0"/>
          <button onClick={e => { e.stopPropagation(); setDirectionsMode(true); }}
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors shrink-0">
            <Navigation className="h-3.5 w-3.5"/>
            <span className="hidden sm:inline">Directions</span>
          </button>
        </div>

        {/* Filter chips — floating glass (hidden when building selected or route planner active) */}
        {!isFloorMode && !searchFocused && !search && !directionsMode && !selected && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {(["standard","accessible","emergency"] as MapMode[]).map(m => {
              const Icon = m === "standard" ? Compass : m === "accessible" ? Accessibility : AlertTriangle;
              const label = m === "standard" ? "All Buildings" : m === "accessible" ? "PWD Routes" : "Emergency";
              return (
                <button key={m} onClick={e => { e.stopPropagation(); setMapMode(m); }}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all shrink-0",
                    mapMode === m
                      ? m === "accessible" ? "border-green-400/40 text-green-700 dark:text-green-300"
                        : m === "emergency" ? "border-red-400/40 text-red-600 dark:text-red-300"
                        : "border-primary/40 text-primary"
                      : "border-white/30 text-foreground/70")}
                  style={{ background: mapMode === m ? undefined : "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
                  <Icon className="h-3 w-3"/>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Building list — floating glass chips (hidden when building selected or route planner active) */}
        {!isFloorMode && !searchFocused && !search && mapMode === "standard" && !directionsMode && !selected && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {MOCK_BUILDINGS.map(b => (
              <button key={b.id} onClick={e => { e.stopPropagation(); selectBuilding(b); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border border-white/30 text-foreground/70 hover:text-primary hover:border-primary/30 transition-all shrink-0"
                style={{ background:"rgba(255,255,255,0.7)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)" }}>
                <MapPin className="h-3 w-3 text-primary/60"/>
                {b.code}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════ MOBILE: floor selector ══════════════ */}
      {isFloorMode && currentFloorData && (
        <div data-no-drag className="absolute left-3 bottom-24 z-20 md:hidden flex gap-1 p-1.5 rounded-2xl border border-border/60 shadow-lg"
          style={{ background:"var(--card)" }}>
          {currentFloorData.floors.map(f => (
            <button key={f.number}
              onClick={e => { e.stopPropagation(); setFloorView(v => v ? {...v, floor:f.number} : v); }}
              className={cn("h-9 px-2.5 rounded-xl text-[11px] font-extrabold transition-all",
                floorView?.floor === f.number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {f.number === 1 ? "G/F" : `${f.number}F`}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════ MOBILE BUILDING SHEET ══════════════ */}
      {selected && !isFloorMode && (
        <MobileBuildingSheet
          selected={selected}
          onClose={() => selectBuilding(null)}
          onDirections={startDirectionsTo}
          onFloorPlan={(b) => openFloorPlan(b)}
          onSave={toggleSave}
          onReport={setReportModal}
          onSignInPrompt={setSignInPrompt}
          saved={saved}
          studentAuth={studentAuth}
          hasFloorPlans={Boolean(FLOOR_PLANS[selected.id])}
        />
      )}

      {/* ══════════════ STAIR UP/DOWN CHOICE ══════════════ */}
      {stairChoice && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setStairChoice(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-[240px] w-full mx-4 animate-scale-in"
            onClick={e => e.stopPropagation()}>
            <p className="text-xs font-extrabold text-center mb-1" style={{ fontFamily:"var(--font-sans)", color:"var(--foreground)" }}>
              {stairChoice.roomType === "elevator" ? "Use Elevator" : "Use Staircase"}
            </p>
            <p className="text-[11px] text-center mb-4" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>
              Where would you like to go?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const fv = floorViewRef.current;
                  const fd = fv ? FLOOR_PLANS[fv.building.id] : null;
                  if (!fd || !stairChoice.upFloor) return;
                  const label = fd.floors.find(f => f.number === stairChoice.upFloor)?.label ?? `Floor ${stairChoice.upFloor}`;
                  setStairChoice(null);
                  setStairLoading({ dir:"up", label });
                  setTimeout(() => { setFloorView(v => v ? {...v, floor: stairChoice.upFloor!} : v); setStairLoading(null); }, 750);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:opacity-90"
                style={{ background:"rgba(37,99,235,0.08)", borderColor:"rgba(37,99,235,0.25)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ background:"#2563eb" }}>↑</div>
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color:"var(--foreground)", fontFamily:"var(--font-sans)" }}>Go Up</p>
                  <p className="text-xs" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>{stairChoice.upLabel}</p>
                </div>
              </button>
              <button
                onClick={() => {
                  const fv = floorViewRef.current;
                  const fd = fv ? FLOOR_PLANS[fv.building.id] : null;
                  if (!fd || !stairChoice.dnFloor) return;
                  const label = fd.floors.find(f => f.number === stairChoice.dnFloor)?.label ?? `Floor ${stairChoice.dnFloor}`;
                  setStairChoice(null);
                  setStairLoading({ dir:"down", label });
                  setTimeout(() => { setFloorView(v => v ? {...v, floor: stairChoice.dnFloor!} : v); setStairLoading(null); }, 750);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:opacity-90"
                style={{ background:"rgba(249,115,22,0.08)", borderColor:"rgba(249,115,22,0.25)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ background:"#f97316" }}>↓</div>
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color:"var(--foreground)", fontFamily:"var(--font-sans)" }}>Go Down</p>
                  <p className="text-xs" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>{stairChoice.dnLabel}</p>
                </div>
              </button>
            </div>
            <button onClick={() => setStairChoice(null)}
              className="w-full mt-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-70"
              style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}      {reportModal   && <ReportModal building={reportModal} onClose={() => setReportModal(null)}/>}
      {signInPrompt  && <SignInPrompt message={signInPrompt} onClose={() => setSignInPrompt(null)}/>}
      {selectedEvent && (
        <EventInfoPanel 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)}
          onNavigate={() => {
            if (selectedEvent.locationRef?.buildingId) {
              const b = MOCK_BUILDINGS[selectedEvent.locationRef.buildingId] ||
                        Object.values(MOCK_BUILDINGS).find((b: any) => b.id === selectedEvent.locationRef?.buildingId);
              if (b) {
                startDirectionsTo(b);
                setSelectedEvent(null);
              }
            }
          }}
        />
      )}
      {/* Campus switching loading overlay */}
      {campusTransitioning && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-sm" style={{ animation:"fadeIn 0.15s ease-out both" }}>
          <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-card/90 backdrop-blur-xl shadow-xl border border-border/50" style={{ animation:"scaleIn 0.25s cubic-bezier(0.16,1,0.3,1) both" }}>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-foreground">Loading campus…</p>
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60" style={{ animation:`loading-bounce 0.8s ease-in-out ${i * 0.18}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
