import { useState, useCallback, useMemo, useRef, useEffect } from "react";

import {
  Search, Layers, ZoomIn, ZoomOut, LocateFixed, Building2, X,
  Accessibility, AlertTriangle, Navigation, Bookmark, Flag,
  Clock, ChevronRight, ChevronLeft, ChevronDown,
  Share2, CalendarDays, MapPin, Compass,
  Footprints, QrCode, Loader2, RefreshCw, AlertCircle, Crosshair,
} from "lucide-react";

import { useDebounce, usePublishedCampus, useCampusSearch, useReducedMotion, type SearchResult } from "../hooks";
import { type RoomType } from "../data/floorPlans";
import type { Building } from "../types";
import { cn } from "../lib/utils";
import { useStudentAuth } from "../hooks/useStudentAuth";

import { buildingPositionsFromCampus, floorPlansFromCampus, buildingsFromCampus, facilitiesFromCampus, accessibilityFromCampus } from "../lib/mapDataAdapter";
import { findIndoorRoute, findIndoorRouteForFloor, type IndoorRoute, type RoomLike } from "../lib/indoorPathfinding";
import { planBuildingRoute, planRouteFromPoint, type PlannedRoute, type RouteStep } from "../lib/routePlanner";
import type { RoomDest } from "../lib/combinedPathfinding";
import { latLngToMapPoint, snapToNearest } from "../lib/geo";
import { NODES as STATIC_NAV_NODES } from "../lib/pathfinding";
import { projectReadonlyOutdoorCampus } from "../lib/readonlyOutdoorCampus";
import {
  RoutePlannerDialog, RouteStepsPanel, RouteMapOverlay,
  ReportModal, SignInPrompt,
  BuildingInfoPanel, MobileBuildingSheet,
} from "../components/map";
import { studentAccountService } from "../services/studentAccountService";
import { usageAnalyticsService } from "../services/usageAnalyticsService";
import type { Campus as EditorCampus } from "../components/map-builder/types";
import { ReadonlyOutdoorCampusScene } from "../components/map-builder/ReadonlyOutdoorVisuals";
import { ReadonlyFloorPlanScene } from "../components/map-builder/ReadonlyFloorPlanVisuals";

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

/**
 * Append the indoor "enter building → room" leg to a planned outdoor route
 * that ends at the destination building. Used when the student navigates to
 * a specific room/floor inside a building: the outdoor walk plays first,
 * then the map auto-enters the floor plan (see the walk-arrival effect).
 */
function withDestinationRoomLeg(
  planned: PlannedRoute,
  target: RoomDest,
  floorRooms: RoomLike[] | undefined,
  accessibleOnly: boolean
): PlannedRoute {
  const indoor = floorRooms && floorRooms.length > 0
    ? findIndoorRouteForFloor(target.buildingId, target.floorNumber, target.roomId, floorRooms, accessibleOnly)
    : null;

  const extraSteps: RouteStep[] = [
    { id: "enter-bldg", icon: "enter", instruction: `Enter ${target.buildingLabel} (${target.buildingCode})` },
  ];
  if (target.floorNumber > 1) {
    extraSteps.push({
      id: "change-floor",
      icon: "stairs",
      instruction: `Take the stairs/elevator to Floor ${target.floorNumber}`,
    });
  }
  if (indoor) {
    indoor.steps.forEach((step, i) => {
      extraSteps.push({ id: `indoor-${i}`, icon: "walk", instruction: step });
    });
  } else {
    extraSteps.push({ id: "arrive-room", icon: "arrive", instruction: `Arrive at ${target.roomName}` });
  }

  const extraDist = indoor?.distanceMeters ?? 0;
  const extraSeconds = indoor?.estimatedSeconds ?? 0;
  return {
    ...planned,
    dist: Math.round(planned.dist + extraDist),
    mins: Math.max(1, Math.round((planned.mins * 60 + extraSeconds) / 60)),
    steps: [...planned.steps, ...extraSteps],
    transitions:
      target.floorNumber > 1
        ? [...(planned.transitions ?? []), `Take the stairs/elevator to Floor ${target.floorNumber}`]
        : planned.transitions,
    destinationRoom: {
      buildingId: target.buildingId,
      floorNumber: target.floorNumber,
      roomId: target.roomId,
    },
  };
}



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

  // ── Buildings derived exclusively from the published campus ──
  const MOCK_BUILDINGS = useMemo(() => {
    if (activeCampus) {
      return buildingsFromCampus(activeCampus);
    }
    return [];
  }, [activeCampus]);

  const B_POS = useMemo<Record<string, {x:number;y:number;w:number;h:number;color:string}>>(() => {
    if (activeCampus) {
      return buildingPositionsFromCampus(activeCampus);
    }
    return {};
  }, [activeCampus]);

  const FLOOR_PLANS = useMemo(() => {
    if (activeCampus) {
      return floorPlansFromCampus(activeCampus);
    }
    return {};
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
      return facilitiesFromCampus(activeCampus);
    }
    return {};
  }, [activeCampus]);

  const BUILDING_ACCESSIBILITY: Record<string, string[]> = useMemo(() => {
    if (activeCampus) {
      return accessibilityFromCampus(activeCampus);
    }
    return {};
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
  const animFrameRef   = useRef<number>(undefined);

  // Load initial bookmarked buildings from studentAccountService
  useEffect(() => {
    studentAccountService.getSavedBuildings(MOCK_BUILDINGS).then((buildings) => {
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
  const transitioningRef = useRef<ReturnType<typeof setTimeout>>(undefined);
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
  // When set, the destination is a specific room/floor inside toBuilding.
  const [roomDestination, setRoomDestination] = useState<RoomDest | null>(null);

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

  // Unified Search Engine Hook for C3
  const campusSearch = useCampusSearch(activeCampus);

  // Modals
  const [reportModal,   setReportModal]   = useState<Building|null>(null);
  const [signInPrompt,  setSignInPrompt]  = useState<string|null>(null);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const svgRef          = useRef<SVGSVGElement>(null);
  const dragRef         = useRef<{ sx:number; sy:number; lx:number; ly:number; px:number; py:number; moved:boolean; vx:number; vy:number; lastTime:number }|null>(null);
  const inertiaRef      = useRef<number>(0);
  const panTargetRef    = useRef<Pt | null>(null);
  const panAnimRef     = useRef<number>(0);
  // Latest route (kept in a ref so early callbacks like replayWalk can read it).
  const routeRef = useRef<PlannedRoute | null>(null);
  // Destination room the walk already entered (prevents re-opening the floor).
  const enteredRoomRef = useRef<string | null>(null);
  // ── Pinch-to-zoom ref ──
  const pinchRef       = useRef<{ dist: number; initZoom: number } | null>(null);
  // ── Cursor-anchored zoom refs ──
  // Last known pointer position over the map (anchors +/- and keyboard zoom
  // when there's no live cursor event to read).
  const zoomAnchorRef  = useRef<{ clientX: number; clientY: number } | null>(null);
  // Latest target zoom, so stable listeners (wheel / keyboard) can step from it.
  const zoomStateRef   = useRef(1);
  // Latest applyZoomAt — stable listeners always anchor against fresh zoom/pan.
  const applyZoomAtRef = useRef<(clientX: number, clientY: number, nextZoom: number) => void>(() => {});

  /** Resolve the zoom anchor: last known cursor position over the map, falling
   *  back to the container center when the pointer never touched the map. */
  const zoomAtCursor = useCallback((nextZoom: number) => {
    const anchor = zoomAnchorRef.current;
    const el = mapContainerRef.current;
    if (anchor) {
      applyZoomAtRef.current(anchor.clientX, anchor.clientY, nextZoom);
    } else if (el) {
      const r = el.getBoundingClientRect();
      applyZoomAtRef.current(r.left + r.width / 2, r.top + r.height / 2, nextZoom);
    } else {
      setZoom(nextZoom);
    }
  }, []);

  // Keep the latest target zoom readable by stable listeners.
  useEffect(() => { zoomStateRef.current = zoom; });

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
  // Use the actual FloorPlan from the published campus (authored in Map Builder)
  const activeFloorPlan   = useMemo(() => {
    if (!floorView || !activeCampus) return null;
    const building = activeCampus.buildings.find(b => b.id === floorView.building.id);
    if (!building) return null;
    return building.floors.find(f => f.number === floorView.floor) ?? building.floors[0] ?? null;
  }, [floorView, activeCampus]);
  // Legacy floor data for stair navigation UI
  const currentFloorData  = floorView ? FLOOR_PLANS[floorView.building.id] : null;
  const currentFloor      = currentFloorData?.floors.find(f => f.number === floorView?.floor) ?? currentFloorData?.floors[0];
  const floorNums         = currentFloorData?.floors.map(f => f.number) ?? [];
  // Use actual floor canvas dimensions if available
  const floorCanvasW = activeFloorPlan?.canvasW || FP_W;
  const floorCanvasH = activeFloorPlan?.canvasH || FP_H;

  // SVG center shifts with mode (floor plan uses authored canvas, campus uses campus canvas)
  const outdoorCanvasW = activeCampus?.canvasW || SVG_W;
  const outdoorCanvasH = activeCampus?.canvasH || SVG_H;
  const viewCX = isFloorMode ? floorCanvasW / 2 : outdoorCanvasW / 2;
  const viewCY = isFloorMode ? floorCanvasH / 2 : outdoorCanvasH / 2;
  const tx = viewCX * (1 - displayZoom) + pan.x;
  const ty = viewCY * (1 - displayZoom) + pan.y;

  // Dynamic viewBox: expands with zoom so scaled content is never clipped.
  const vbW = (isFloorMode ? floorCanvasW : outdoorCanvasW) / displayZoom;
  const vbH = (isFloorMode ? floorCanvasH : outdoorCanvasH) / displayZoom;
  const vbX = (isFloorMode ? floorCanvasW : outdoorCanvasW) / 2 - vbW / 2;
  const vbY = (isFloorMode ? floorCanvasH : outdoorCanvasH) / 2 - vbH / 2;

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
      // Zoom toward the cursor: keep the world point under the pointer fixed.
      applyZoomAtRef.current(e.clientX, e.clientY, zoomStateRef.current - step);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isLoading]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "+"||e.key === "=") { e.preventDefault(); zoomAtCursor(zoomStateRef.current + 0.2); }
      if (e.key === "-")                { e.preventDefault(); zoomAtCursor(zoomStateRef.current - 0.2); }
      if (e.key === "0")                { e.preventDefault(); setZoom(1); setPan({x:0,y:0}); }
      if (e.key === "Escape") {
        setSelected(null); setSearchFocused(false);
        setReportModal(null); setSignInPrompt(null);
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
        setRoomDestination(null);
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

  /**
   * Cursor-anchored zoom: change the zoom level while keeping the world point
   * under (clientX, clientY) pinned to the same screen position.
   *
   * With the center-based viewBox model the screen position of a world point is
   *   screen_x ∝ (Wx·z + Cx·(1/z − z) + pan.x) · z     (Cx = canvasW/2)
   * so the pan that keeps it fixed when z → z′ is
   *   pan′.x = A/z′ − Wx·z′ − Cx·(1/z′ − z′),   A = (Wx·z + Cx·(1/z − z) + pan.x)·z
   */
  const applyZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    const clamped = parseFloat(Math.max(0.35, Math.min(3.5, nextZoom)).toFixed(2));
    const pt = svgPointFromClient(clientX, clientY);
    if (!pt) {
      setZoom(clamped);
      return;
    }
    const canvasW = isFloorMode ? floorCanvasW : outdoorCanvasW;
    const canvasH = isFloorMode ? floorCanvasH : outdoorCanvasH;
    const z = displayZoom;
    const Cx = canvasW / 2;
    const Cy = canvasH / 2;
    const ax = (pt.x * z + Cx * (1 / z - z) + pan.x) * z;
    const ay = (pt.y * z + Cy * (1 / z - z) + pan.y) * z;
    // Don't let the auto-pan-to-selected-building animation fight the anchor.
    panTargetRef.current = null;
    setPan({
      x: ax / clamped - pt.x * clamped - Cx * (1 / clamped - clamped),
      y: ay / clamped - pt.y * clamped - Cy * (1 / clamped - clamped),
    });
    setZoom(clamped);
  }, [displayZoom, pan, svgPointFromClient, isFloorMode, floorCanvasW, floorCanvasH, outdoorCanvasW, outdoorCanvasH]);

  // Keep stable listeners (wheel, keys, pinch) anchored against the latest zoom/pan.
  useEffect(() => {
    applyZoomAtRef.current = applyZoomAt;
  });

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
    setRoomDestination(null);
    // No auto-open of the Route Planner here either — the "You are here"
    // chip with its "Plan route" button is the single, clear next step.
  }, [svgPointFromClient, snapPointToGraph]);

  /** Clear the marker + any point-based route. */
  const clearYouAreHere = useCallback(() => {
    setYouAreHere(null);
    setUseMyLocation(false);
    setPinning(false);
    setFromBuilding(null);
    setRoomDestination(null);
  }, []);

  /** Restart the walk animation from the start. */
  const replayWalk = useCallback(() => {
    cancelAnimationFrame(walkAnimRef.current ?? 0);
    walkAnimRef.current = null;
    setWalkProgress(0);
    setWalkNonce((n) => n + 1);
    // If the previous walk finished inside a destination building, return to
    // the campus map so the whole journey (outdoor walk → enter) replays.
    if (routeRef.current?.destinationRoom && floorViewRef.current) {
      setFloorView(null);
      setIndoorRoute(null);
      setActiveRouteRoom(null);
      setHighlightedRoom(null);
      enteredRoomRef.current = null;
    }
  }, []);

  /** End the active navigation and return the map to its normal state. */
  const endNavigation = useCallback(() => {
    setRouteFading(true);
    setTimeout(() => {
      setFromBuilding(null);
      setToBuilding(null);
      setRoomDestination(null);
      setDirectionsMode(false);
      setRouteFading(false);
      // Exit the destination floor plan if the walk had auto-entered it.
      if (routeRef.current?.destinationRoom && floorViewRef.current) {
        setFloorView(null);
        setIndoorRoute(null);
        setActiveRouteRoom(null);
        setHighlightedRoom(null);
      }
      enteredRoomRef.current = null;
    }, 300);
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
    // Track the pointer so +/- and keyboard zoom can anchor to the cursor.
    zoomAnchorRef.current = { clientX: e.clientX, clientY: e.clientY };
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
      const next = parseFloat(Math.max(0.35, Math.min(3.5, pinchRef.current.initZoom * ratio)).toFixed(2));
      // Pinch zooms toward the midpoint of the two fingers.
      applyZoomAtRef.current((t1.clientX + t2.clientX) / 2, (t1.clientY + t2.clientY) / 2, next);
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
    setIndoorRoute(null);
    setActiveRouteRoom(null);
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
  // Computes the outdoor leg (point/building → destination building). When
  // the destination is a specific room/floor (roomDestination), the indoor
  // "enter → room" leg is appended so the steps cover the full journey.
  const route = useMemo<PlannedRoute | null>(() => {
    let planned: PlannedRoute | null = null;
    if (useMyLocation && youAreHere && toBuilding) {
      // Kiosk-style: start from the "You are here" marker.
      planned = planRouteFromPoint(
        youAreHere,
        { id: toBuilding.id, code: toBuilding.code, name: toBuilding.name },
        mapMode,
        activeCampus,
        B_POS
      );
    } else if (fromBuilding && toBuilding) {
      // Use the route planner: real graph stats in ALL modes, with an SVG
      // estimate fallback when the buildings are not on the walkway graph.
      planned = planBuildingRoute(
        { id: fromBuilding.id, code: fromBuilding.code, name: fromBuilding.name },
        { id: toBuilding.id, code: toBuilding.code, name: toBuilding.name },
        mapMode,
        B_POS,
        activeCampus
      );
    }

    if (planned && roomDestination) {
      const destFloor = activeCampus?.buildings
        .find((b) => b.id === roomDestination.buildingId)
        ?.floors.find((f) => f.number === roomDestination.floorNumber);
      planned = withDestinationRoomLeg(
        planned,
        roomDestination,
        destFloor?.rooms as RoomLike[] | undefined,
        mapMode === "accessible"
      );
    }
    return planned;
  }, [fromBuilding, toBuilding, useMyLocation, youAreHere, mapMode, B_POS, activeCampus, roomDestination]);

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
    routeRef.current = route;
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

  // ── Zoom to route (start + end both in focus) + arrival simulation ────
  /**
   * Frame the active route in the viewport when navigation starts so BOTH
   * endpoints are in focus:
   *   • zoom fits the whole route (padding included), so the destination can
   *     never leave the screen, and
   *   • the viewport centers on the route midpoint — the starting point and
   *     the arrival point are both visible and equally framed.
   * The pan glides smoothly to the target (via panTargetRef, which wheel,
   * drag and pinch cancel) together with the zoom lerp, so the camera
   * visibly moves instead of jumping. Pan keeps world point (midX, midY) at
   * the canvas center: pan = z·(center − p).
   */
  const frameRouteView = useCallback((zoomOverride?: number) => {
    if (!route || route.points.length === 0) return;
    const xs = route.points.map(p => p.x);
    const ys = route.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const routeW = maxX - minX, routeH = maxY - minY;
    const fitZoom = Math.min(outdoorCanvasW / (routeW + 200), outdoorCanvasH / (routeH + 200), 2.0);
    // Manual "zoom to route" may zoom in deeper (e.g. ≥ 1.5) but never past
    // the fit zoom, so the whole route — including the end point — always
    // stays inside the viewport.
    const z = parseFloat(Math.max(0.5, Math.min(zoomOverride ?? fitZoom, fitZoom)).toFixed(2));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    // Animate the pan smoothly toward the route midpoint (the existing pan
    // lerp drives it; wheel/drag/pinch cancel it via panTargetRef = null).
    panTargetRef.current = {
      x: z * (outdoorCanvasW / 2 - midX),
      y: z * (outdoorCanvasH / 2 - midY),
    };
    setZoom(z);
  }, [route, outdoorCanvasW, outdoorCanvasH]);

  // When a route is computed (navigation starts), zoom in so BOTH the
  // starting point and the end point are in focus — the viewport centers
  // on the route midpoint and the whole route stays on screen.
  useEffect(() => {
    if (route && route.points.length > 0) {
      frameRouteView();
      setShowArrival(false);
    } else {
      setShowArrival(false);
    }
  }, [route, frameRouteView]);

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
      setRoomDestination(null);
    }
    if (b) {
      if (!recentSearches.includes(b.name))
        setRecentSearches(prev => [b.name, ...prev].slice(0, 5));
      saveLastViewed({ buildingId: b.id, zoom });
    }
  }, [recentSearches, zoom]);

  const handleSelectSearchResult = useCallback((item: SearchResult) => {
    usageAnalyticsService.track("search", item.name);
    if (item.kind === "building" || !item.buildingId) {
      const b = MOCK_BUILDINGS.find((building) => building.id === item.buildingId || building.name.toLowerCase() === item.name.toLowerCase());
      if (b) selectBuilding(b);
    } else {
      const b = MOCK_BUILDINGS.find((building) => building.id === item.buildingId);
      if (b) {
        // Selecting a fresh room target cancels any previous room destination
        // (the floor plan opens with the room highlighted; the "Directions to
        // room" chip offers full navigation).
        setRoomDestination(null);
        setIndoorRoute(null);
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
  }, [MOCK_BUILDINGS, selectBuilding]);

  const startDirectionsTo = useCallback((b: Building) => {
    setToBuilding(b); setFromBuilding(null);
    setRoomDestination(null); // building directions, not room directions
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

    // Track the active room even when no indoor path exists, so the
    // "Directions to room" flow stays available.
    setActiveRouteRoom(roomId);
    setHighlightedRoom(roomId);
    if (route) setIndoorRoute(route);
  }, [floorView, activeCampus, currentFloor]);

  const clearIndoorRoute = useCallback(() => {
    setIndoorRoute(null);
    setActiveRouteRoom(null);
    setHighlightedRoom(null);
  }, []);

  // ── Indoor walk animation state ────────────────────────────────────────
  // Separate from the outdoor walk animation. Starts when the floor plan
  // opens after the outdoor walk arrives at the building, and reuses the same
  // animated avatar style from RouteMapOverlay.
  const [indoorWalkProgress, setIndoorWalkProgress] = useState(0);
  const indoorWalkAnimRef = useRef<number | null>(null);
  const [indoorWalkNonce, setIndoorWalkNonce] = useState(0);
  // The indoor walk start point: the building door/waypoint the outdoor walk
  // arrives at. Set when the floor plan opens. Falls back to the first indoor
  // waypoint if the outdoor walk didn't carry an explicit entrance position.
  const [indoorWalkStart, setIndoorWalkStart] = useState<{ x: number; y: number } | null>(null);

  /**
   * Start full navigation to a room/floor the student clicked inside the
   * floor plan. With an outdoor start ("You are here" or a different from
   * building) the journey plays on the campus map and auto-enters the
   * building when the walking dot arrives. Without one, the destination
   * building itself is the start and the indoor leg is shown right away.
   */
  const startRoomDirections = useCallback((roomId: string) => {
    const fv = floorViewRef.current;
    if (!fv) return;
    const room =
      currentFloor?.rooms.find((r) => r.id === roomId) ??
      activeFloorPlan?.rooms.find((r) => r.id === roomId);
    if (!room) return;

    const building = fv.building;
    const target: RoomDest = {
      type: "room",
      buildingId: building.id,
      floorNumber: fv.floor,
      roomId,
      roomName: room.name,
      buildingLabel: building.name,
      buildingCode: building.code,
    };

    setRoomDestination(target);
    setToBuilding(building);
    setDirectionsMode(false);
    setSelected(null);
    setSearch("");
    setSearchFocused(false);

    // Always start the normal navigation flow when a room's Directions button is
    // pressed. The outdoor->indoor journey (or indoor-only if already at the
    // building) is handled by the `route` memo + walk animation, exactly like
    // the building-to-building flow. Do NOT create a separate indoor-only flow
    // here.
    if (!fromBuilding) setFromBuilding(building);
    setHighlightedRoom(roomId);
    setActiveRouteRoom(roomId);

    const startsOutside =
      (useMyLocation && youAreHere) ||
      (fromBuilding !== null && fromBuilding.id !== building.id);
    if (startsOutside) {
      // Outdoor walk first: leave the floor plan, walk to the building, then
      // the map auto-enters the destination floor (walk-arrival effect).
      setFloorView(null);
      setIndoorRoute(null);
      setActiveRouteRoom(null);
      setHighlightedRoom(null);
      setStairLoading(null);
    }
  }, [
    floorViewRef, currentFloor, activeFloorPlan,
    fromBuilding, youAreHere, useMyLocation,
  ]);

  // ── Walk arrival → enter the destination building's floor plan ────────
  // When the walking dot reaches the end of an outdoor route that targets a
  // specific room (route.destinationRoom), automatically open that building's
  // floor at the destination floor, highlight the room and draw the final
  // indoor leg from the entrance to the room.
  useEffect(() => {
    const dest = route?.destinationRoom;
    if (!dest) {
      enteredRoomRef.current = null;
      return;
    }
    const key = `${dest.buildingId}:${dest.floorNumber}:${dest.roomId}`;
    if (walkProgress < 1) {
      if (enteredRoomRef.current === key) enteredRoomRef.current = null;
      return;
    }
    if (enteredRoomRef.current === key || isFloorMode) return;
    enteredRoomRef.current = key;

    const building = MOCK_BUILDINGS.find((b) => b.id === dest.buildingId);
    if (!building) return;
    const destFloorData = activeCampus?.buildings
      .find((b) => b.id === dest.buildingId)
      ?.floors.find((f) => f.number === dest.floorNumber);

    // Enter the floor plan at its default framing (fresh zoom/pan).
    panTargetRef.current = null;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFloorView({ building, floor: dest.floorNumber });
    setHighlightedRoom(dest.roomId);
    setActiveRouteRoom(dest.roomId);
    const indoor = destFloorData
      ? findIndoorRouteForFloor(
          dest.buildingId,
          dest.floorNumber,
          dest.roomId,
          destFloorData.rooms as RoomLike[],
          mapMode === "accessible"
        )
      : null;
    setIndoorRoute(indoor);
  }, [walkProgress, route, isFloorMode, MOCK_BUILDINGS, activeCampus, mapMode]);

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

      {/* "Directions to this room" chip — starts full outdoor → indoor nav.
          Shown when a room is active in the floor plan (from search or a
          click). Hidden while the standalone indoor-route panel is open,
          because that panel carries its own Directions button. */}
      {isFloorMode && !directionsMode && !stairLoading && (() => {
        const activeRoomId = activeRouteRoom ?? highlightedRoom;
        if (!activeRoomId) return null;
        const room =
          currentFloor?.rooms.find((r) => r.id === activeRoomId) ??
          activeFloorPlan?.rooms.find((r) => r.id === activeRoomId);
        if (!room) return null;
        const alreadyTargeted =
          !!route?.destinationRoom &&
          route.destinationRoom.buildingId === floorView?.building.id &&
          route.destinationRoom.floorNumber === floorView?.floor &&
          route.destinationRoom.roomId === activeRoomId;
        // The indoor panel already offers directions; avoid a duplicate chip.
        const indoorPanelOpen = !!indoorRoute && !route?.destinationRoom;
        if (alreadyTargeted || indoorPanelOpen || walkProgress >= 1) return null;
        return (
          <div
            data-no-drag
            className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full border border-border shadow-xl animate-fade-in"
            style={{ background: "var(--card)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          >
            <Navigation className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
            <span className="text-[11px] font-bold max-w-[170px] truncate" style={{ color: "var(--foreground)" }}>
              {room.name}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); startRoomDirections(room.id); }}
              className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold hover:brightness-110 transition-all active:scale-95"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
              aria-label={`Get directions to ${room.name}`}
            >
              Directions
            </button>
          </div>
        );
      })()}

      {/* ══════════════════════════ MAP SVG ══════════════════════════ */}
      <svg ref={svgRef}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="absolute inset-0 w-full h-full select-none"
        preserveAspectRatio="xMidYMid meet"
        onDoubleClick={e => {
          e.preventDefault();
          if (!isFloorMode && (e.target as Element).closest("[data-bldg]")) return;
          applyZoomAt(e.clientX, e.clientY, zoom + 0.35);
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
            if (!activeFloorPlan) return null;
            return (
              <>
                <ReadonlyFloorPlanScene
                  floor={activeFloorPlan}
                  mapMode={mapMode}
                  highlightedRoomId={highlightedRoom}
                  hoveredRoomId={hoveredRoom}
                  onRoomClick={(roomId) => showIndoorRoute(roomId)}
                  onRoomHover={(roomId) => setHoveredRoom(roomId)}
                  onRoomHoverEnd={() => setHoveredRoom(null)}
                  onDoorClick={() => closeFloorPlan()}
                />
                {/* Indoor navigation path (entrance → active room) */}
                {indoorRoute && indoorRoute.waypoints.length >= 2 && (() => {
                  const wps = indoorRoute.waypoints;
                  const pts = wps.map((p) => `${p.x},${p.y}`).join(" ");
                  const last = wps[wps.length - 1];
                  return (
                    <g data-testid="floor-indoor-route" style={{ pointerEvents: "none" }}>
                      <polyline points={pts} fill="none" stroke="#1e40af" strokeOpacity={0.18} strokeWidth={8}
                        strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={pts} fill="none" stroke="#1e40af" strokeWidth={3.5}
                        strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx={last.x} cy={last.y} r={6.5} fill="#dc2626" stroke="white" strokeWidth={2} />
                    </g>
                  );
                })()}
              </>
            );
          })() : (
          /* ════════ CAMPUS MAP mode ════════ */
          <>
            <rect data-bg="true" width={outdoorCanvasW} height={outdoorCanvasH} fill="var(--map-bg)" style={{ cursor: pinning ? "crosshair" : undefined }}/>
            <rect x={6} y={6} width={Math.max(0, outdoorCanvasW - 12)} height={Math.max(0, outdoorCanvasH - 12)} fill="none" stroke="var(--map-boundary)" strokeWidth={3} rx={4} opacity={0.5} strokeDasharray="8 4"/>

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
                onClickEntrance={(buildingId) => {
                  const building = MOCK_BUILDINGS.find((item) => item.id === buildingId);
                  if (building) openFloorPlan(building);
                }}
              />
            )}
            {/* Route */}
            {route && (
              <RouteMapOverlay points={route.points} mode={mapMode} fading={routeFading} walkProgress={walkProgress} />
            )}
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
            onClose={() => { setDirectionsMode(false); setFromBuilding(null); setToBuilding(null); setRoomDestination(null); }}
            onClear={() => { setFromBuilding(null); setToBuilding(null); setRoomDestination(null); }}
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
                {/* Quick access buildings (campus mode, no query) */}
                {!isFloorMode && !search && MOCK_BUILDINGS.length > 0 && (
                  <div className="px-4 py-3 border-t border-border">
                    <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Quick Access</p>
                    <div className="grid grid-cols-2 gap-1">
                      {MOCK_BUILDINGS.slice(0, 6).map(b => (
                        <button key={b.id} onMouseDown={e => { e.preventDefault(); selectBuilding(b); }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-muted transition-colors text-left">
                          <MapPin className="h-3 w-3 text-primary shrink-0"/>
                          <span className="text-xs font-semibold text-foreground">{b.name}</span>
                        </button>
                      ))}
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
      <div data-no-drag className="absolute bottom-20 md:bottom-5 right-3 z-20 hidden md:flex flex-col gap-1">
        <button onClick={e => { e.stopPropagation(); setShowLayers(v => !v); }} title="Layers"
          className={cn("w-9 h-9 rounded-xl border shadow-md flex items-center justify-center transition-all",
            showLayers ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border/60 text-muted-foreground hover:border-primary/30")}>
          <Layers className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); zoomAtCursor(zoom + 0.4); }} title="Zoom in"
          className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 active:scale-95 transition-all" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); zoomAtCursor(zoom - 0.4); }} title="Zoom out"
          className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 active:scale-95 transition-all" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); handleLocate(); }} title={youAreHere ? "Re-locate your position" : "You are here — set your location"}
          className={cn("flex w-10 h-10 md:w-9 md:h-9 rounded-xl border shadow-md items-center justify-center transition-all",
            youAreHere
              ? "bg-blue-500 border-blue-500 text-white shadow-blue-500/30"
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
                toName={roomDestination?.roomName ?? toBuilding?.name ?? "Destination"}
                walkProgress={walkProgress}
                onReplay={replayWalk}
                onEnd={endNavigation}
                onZoom={() => frameRouteView(Math.max(zoomRef.current, 1.5))}
              />
            </div>
          </div>
          {/* Mobile: bottom sheet with steps (above the app's bottom nav) */}
          <div data-no-drag className="absolute inset-x-0 bottom-[84px] z-30 md:hidden animate-slide-up px-3">
            <RouteStepsPanel
              route={route}
              mode={mapMode}
              toName={roomDestination?.roomName ?? toBuilding?.name ?? "Destination"}
              walkProgress={walkProgress}
              onReplay={replayWalk}
              onEnd={endNavigation}
              onZoom={() => frameRouteView(Math.max(zoomRef.current, 1.5))}
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
                onClick={() => { setShowArrival(false); setFromBuilding(null); setToBuilding(null); setRoomDestination(null); setDirectionsMode(false); }}
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
      {/* Hidden when a full outdoor→indoor route already shows the same leg. */}
      {indoorRoute && isFloorMode && !stairLoading && !route?.destinationRoom && (
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
            <div className="flex gap-1.5 px-3 pb-2.5">
              {activeRouteRoom && (
                <button
                  onClick={() => startRoomDirections(activeRouteRoom)}
                  className="flex-1 h-7 rounded-lg text-[10px] font-bold inline-flex items-center justify-center gap-1 hover:brightness-110 transition-all active:scale-[0.98]"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  <Navigation className="h-3 w-3" />
                  Directions to room
                </button>
              )}
              <button onClick={clearIndoorRoute}
                className={cn("h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors", activeRouteRoom ? "px-2.5" : "w-full")}>
                Clear
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

      {/* ══════════════ MOBILE: mode chips ══════════════ */}
      <div data-no-drag className="absolute top-3 right-3 z-20 md:hidden flex flex-col gap-1">
        {(["standard","accessible","emergency"] as MapMode[]).map(m => {
          const Icon = m === "standard" ? Compass : m === "accessible" ? Accessibility : AlertTriangle;
          const label = m === "standard" ? "Std" : m === "accessible" ? "Acc" : "SOS";
          return (
            <button key={m} onClick={e => { e.stopPropagation(); setMapMode(m); }}
              className={cn("flex items-center gap-1 h-9 px-2 rounded-xl shadow-md border transition-all backdrop-blur-sm",
                mapMode === m
                  ? m === "accessible" ? "bg-green-500 text-white border-green-500"
                    : m === "emergency" ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-card/90 border-border/60 text-muted-foreground")}>
              <Icon className="h-4 w-4 shrink-0"/>
              <span className="text-[10px] font-extrabold leading-none">{label}</span>
            </button>
          );
        })}
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
      )}      {/* ══════════════ MODALS ══════════════ */}
      {reportModal   && <ReportModal building={reportModal} onClose={() => setReportModal(null)}/>}
      {signInPrompt  && <SignInPrompt message={signInPrompt} onClose={() => setSignInPrompt(null)}/>}

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
