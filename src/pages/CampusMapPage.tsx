import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Search, Layers, ZoomIn, ZoomOut, LocateFixed, Building2, X,
  Accessibility, AlertTriangle, Navigation, Bookmark, Flag,
  Clock, ChevronRight, ChevronLeft, ChevronDown,
  Share2, CalendarDays, MapPin, ArrowUpDown, Compass, Loader2,
} from "lucide-react";

import { MOCK_BUILDINGS as LEGACY_BUILDINGS } from "../data/mockData";
import { FLOOR_PLANS as LEGACY_FLOOR_PLANS, type RoomType } from "../data/floorPlans";
import type { Building } from "../types";
import { cn } from "../lib/utils";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { useCampusData } from "../contexts/CampusDataContext";
import { buildingPositionsFromCampus, floorPlansFromCampus, buildingsFromCampus } from "../lib/mapDataAdapter";
import {
  BuildingPicker, ReportModal, EventPopup, SignInPrompt,
  BuildingInfoPanel, MobileBuildingSheet, type PanelTab,
} from "../components/map";

type MapMode  = "standard" | "accessible" | "emergency";

// ── Map constants ──────────────────────────────────────────────────────────
const MAIN_H = 289;
const MAIN_V = 401;
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

const EVENT_MARKERS = [
  { id:"ev1", title:"STEM Fair 2025",  x:401, y:232, color:"#7c3aed", date:"Jan 15", venue:"Main Plaza", org:"COED Student Gov.",   desc:"Annual STEM exhibition featuring student projects across all programs." },
  { id:"ev2", title:"Sports Day",      x:378, y:476, color:"#db2777", date:"Jan 18", venue:"Gymnasium",  org:"SSC Sports Committee", desc:"Inter-program sports competition open to all enrolled students." },
  { id:"ev3", title:"Career Fair",     x:447, y:151, color:"#0891b2", date:"Jan 22", venue:"ADM Lobby",  org:"Placement Office",     desc:"Meet industry partners and explore internship and job opportunities." },
];
const POPULAR = [
  { label:"Registrar",        buildingId:"b2" },
  { label:"Cashier",          buildingId:"b2" },
  { label:"Library",          buildingId:"b3" },
  { label:"Gymnasium",        buildingId:"b5" },
  { label:"Admissions",       buildingId:"b2" },
  { label:"Student Services", buildingId:"b6" },
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

function computeRoute(from: typeof B_POS[string], to: typeof B_POS[string]): Pt[] {
  const fCx = from.x + from.w/2, fCy = from.y + from.h/2;
  const tCx = to.x   + to.w/2,   tCy = to.y   + to.h/2;
  const pts: Pt[] = [{ x:fCx, y:fCy }];
  if ((fCx < MAIN_V) === (tCx < MAIN_V) && (fCy < MAIN_H) === (tCy < MAIN_H)) {
    pts.push({ x:fCx, y:MAIN_H }, { x:tCx, y:MAIN_H });
  } else {
    pts.push({ x:fCx, y:MAIN_H }, { x:MAIN_V, y:MAIN_H }, { x:tCx, y:MAIN_H });
  }
  pts.push({ x:tCx, y:tCy });
  return pts;
}
function calcDist(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++)
    d += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
  return Math.round(d * 0.45);
}

// ═════════════════════════════════════════════════════════════════════════════
export function CampusMapPage() {
  const studentAuth = useStudentAuth();
  const campusData = useCampusData();

  // ── Use Map Builder data if available, fall back to legacy data ──
  const MOCK_BUILDINGS = useMemo(() => {
    if (campusData.hasData && campusData.latestPublished) {
      return buildingsFromCampus(campusData.latestPublished);
    }
    return LEGACY_BUILDINGS;
  }, [campusData.hasData, campusData.latestPublished]);

  const B_POS = useMemo<Record<string, {x:number;y:number;w:number;h:number;color:string}>>(() => {
    if (campusData.hasData && campusData.latestPublished) {
      return buildingPositionsFromCampus(campusData.latestPublished);
    }
    return {
      b1: { x:155, y:130, w:125, h:80,  color:"#1e40af" },
      b2: { x:395, y:115, w:105, h:72,  color:"#1e3a8a" },
      b3: { x:545, y:295, w:115, h:78,  color:"#1d4ed8" },
      b4: { x:165, y:305, w:105, h:62,  color:"#1e40af" },
      b5: { x:305, y:435, w:145, h:82,  color:"#2563eb" },
      b6: { x:605, y:415, w:112, h:72,  color:"#1d4ed8" },
    };
  }, [campusData.hasData, campusData.latestPublished]);

  const FLOOR_PLANS = useMemo(() => {
    if (campusData.hasData && campusData.latestPublished) {
      return floorPlansFromCampus(campusData.latestPublished);
    }
    return LEGACY_FLOOR_PLANS;
  }, [campusData.hasData, campusData.latestPublished]);

  const BUILDING_FACILITIES: Record<string, string[]> = useMemo(() => {
    if (campusData.hasData && campusData.latestPublished) {
      const result: Record<string, string[]> = {};
      for (const b of campusData.latestPublished.buildings) {
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
  }, [campusData.hasData, campusData.latestPublished]);

  const BUILDING_ACCESSIBILITY: Record<string, string[]> = useMemo(() => {
    if (campusData.hasData && campusData.latestPublished) {
      const result: Record<string, string[]> = {};
      for (const b of campusData.latestPublished.buildings) {
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
  }, [campusData.hasData, campusData.latestPublished]);

  // Core map state
  const [selected,     setSelected]     = useState<Building|null>(null);
  const [panelTab,     setPanelTab]     = useState<PanelTab>("overview");
  const [mapMode,      setMapMode]      = useState<MapMode>("standard");
  const [zoom,         setZoom]         = useState(1);
  const [displayZoom,  setDisplayZoom]  = useState(1);
  const [pan,          setPan]          = useState<Pt>({ x:0, y:0 });
  const [saved,        setSaved]        = useState<Set<string>>(new Set());
  const [layers,       setLayers]       = useState({ buildings:true, accessibility:false, emergency:false });
  const animFrameRef   = useRef<number>();

  // Floor plan state (replaces buildingView — floor plans now render in the main SVG)
  const [floorView,       setFloorView]       = useState<{ building: Building; floor: number }|null>(null);
  const [hoveredRoom,     setHoveredRoom]     = useState<string|null>(null);
  const [highlightedRoom, setHighlightedRoom] = useState<string|null>(null);
  const [stairLoading,    setStairLoading]    = useState<{ dir:"up"|"down"; label:string }|null>(null);
  const [stairChoice,     setStairChoice]     = useState<{
    roomType: RoomType; upFloor: number|null; dnFloor: number|null; upLabel: string; dnLabel: string;
  }|null>(null);
  const [showCampusSelector, setShowCampusSelector] = useState(false);

  // Floating UI state
  const [search,         setSearch]         = useState("");
  const [searchFocused,  setSearchFocused]  = useState(false);
  const [directionsMode, setDirectionsMode] = useState(false);
  const [fromBuilding,   setFromBuilding]   = useState<Building|null>(null);
  const [toBuilding,     setToBuilding]     = useState<Building|null>(null);
  const [showLayers,     setShowLayers]     = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showQR,         setShowQR]         = useState(false);

  // Modals
  const [reportModal,   setReportModal]   = useState<Building|null>(null);
  const [selectedEvent, setSelectedEvent] = useState<typeof EVENT_MARKERS[0]|null>(null);
  const [signInPrompt,  setSignInPrompt]  = useState<string|null>(null);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const svgRef          = useRef<SVGSVGElement>(null);
  const dragRef         = useRef<{ sx:number; sy:number; lx:number; ly:number; px:number; py:number; moved:boolean; vx:number; vy:number; lastTime:number }|null>(null);
  const inertiaRef      = useRef<number>(0);
  const getScale = useCallback(() => {
    const svg = svgRef.current;
    const vw = floorViewRef.current !== null ? FP_W : SVG_W;
    return svg ? vw / svg.getBoundingClientRect().width : 1;
  }, []);
  const floorViewRef    = useRef(floorView);
  useEffect(() => { floorViewRef.current = floorView; }, [floorView]);

  // ── Computed floor plan values ─────────────────────────────────────────
  const isFloorMode       = floorView !== null;
  const currentFloorData  = floorView ? FLOOR_PLANS[floorView.building.id] : null;
  const currentFloor      = currentFloorData?.floors.find(f => f.number === floorView?.floor) ?? currentFloorData?.floors[0];
  const floorNums         = currentFloorData?.floors.map(f => f.number) ?? [];

  // SVG center shifts with mode (floor plan is 440×290, campus 900×680)
  const viewCX = isFloorMode ? FP_W / 2 : SVG_CX;
  const viewCY = isFloorMode ? FP_H / 2 : SVG_CY;
  const tx = viewCX * (1 - displayZoom) + pan.x;
  const ty = viewCY * (1 - displayZoom) + pan.y;

  // ── Smooth zoom lerp ───────────────────────────────────────────────────
  useEffect(() => {
    const lerp = () => {
      setDisplayZoom(cur => {
        const diff = zoom - cur;
        if (Math.abs(diff) < 0.001) return zoom;
        animFrameRef.current = requestAnimationFrame(lerp);
        return cur + diff * 0.12;
      });
    };
    animFrameRef.current = requestAnimationFrame(lerp);
    return () => cancelAnimationFrame(animFrameRef.current!);
  }, [zoom]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaMode === 1 ? e.deltaY * 0.05 : e.deltaY * 0.0012;
      setZoom(z => parseFloat(Math.max(0.35, Math.min(3.5, z - step)).toFixed(2)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
      if (e.key === "ArrowRight") setPan(p => ({...p, x:p.x-PAN}));
      if (e.key === "ArrowLeft")  setPan(p => ({...p, x:p.x+PAN}));
      if (e.key === "ArrowDown")  setPan(p => ({...p, y:p.y-PAN}));
      if (e.key === "ArrowUp")    setPan(p => ({...p, y:p.y+PAN}));
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
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("[data-no-drag]")) return;
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

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) {
      if (drag.moved) {
        const speed = Math.hypot(drag.vx, drag.vy);
        if (speed > 1) startInertia(drag.vx * 0.85, drag.vy * 0.85);
      } else {
        if (!isFloorMode) { setSelected(null); setSearchFocused(false); }
      }
    }
  }, [isFloorMode, startInertia]);

  // ── Touch drag-to-pan with inertia ───────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as Element).closest("[data-no-drag]")) return;
    if (e.touches.length !== 1) return;
    // Prevent synthesized mouse events on touch devices
    e.preventDefault();
    cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = 0;
    const t = e.touches[0];
    dragRef.current = { sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, px: pan.x, py: pan.y, moved: false, vx: 0, vy: 0, lastTime: performance.now() };
  }, [pan]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
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

  const onTouchEnd = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && drag.moved) {
      const speed = Math.hypot(drag.vx, drag.vy);
      if (speed > 1) startInertia(drag.vx * 0.85, drag.vy * 0.85);
    }
  }, [startInertia]);

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
  const route = useMemo(() => {
    if (!fromBuilding || !toBuilding) return null;
    const fp = B_POS[fromBuilding.id], tp = B_POS[toBuilding.id];
    if (!fp || !tp) return null;
    const points = computeRoute(fp, tp);
    return { points, dist: calcDist(points), mins: Math.max(1, Math.round(calcDist(points)/80)) };
  }, [fromBuilding, toBuilding]);

  const selectBuilding = useCallback((b: Building|null) => {
    setSelected(b); setPanelTab("overview");
    setSearchFocused(false); setSearch(""); setShowQR(false);
    if (b && !recentSearches.includes(b.name))
      setRecentSearches(prev => [b.name, ...prev].slice(0, 5));
  }, [recentSearches]);

  const startDirectionsTo = useCallback((b: Building) => {
    setToBuilding(b); setFromBuilding(null);
    setDirectionsMode(true); setPanelTab("route");
  }, []);

  const toggleSave = (id: string) =>
    setSaved(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // ── Search results (buildings on campus, rooms on floor plan) ──────────
  const buildingResults = !isFloorMode && search
    ? MOCK_BUILDINGS.filter(b =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.code.toLowerCase().includes(search.toLowerCase()))
    : [];
  const roomResults = isFloorMode && search
    ? (currentFloor?.rooms ?? []).filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.type.toLowerCase().includes(search.toLowerCase()))
    : [];

  const isDragging = dragRef.current?.moved ?? false;
  const buildingFill = (id: string) =>
    mapMode === "emergency" ? "#991b1b" : mapMode === "accessible" ? "#14532d" : B_POS[id]?.color ?? "#1e40af";

  const [isLoading, setIsLoading] = useState(true);

  // Simulate initial map load
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // ── Skeleton loading ──
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center animate-fade-in"
        style={{ height:"calc(100dvh - 56px)", background:"#f2efe9" }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm font-semibold text-muted-foreground">Loading campus map…</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={mapContainerRef}
      className="relative overflow-hidden animate-fade-in"
      style={{ height:"calc(100dvh - 56px)", background: isFloorMode ? "#f0eff0" : "#f2efe9", cursor: isDragging ? "grabbing" : "grab", touchAction:"none" }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}>

      {/* ══════════════════════════ MAP SVG ══════════════════════════ */}
      <svg ref={svgRef}
        viewBox={isFloorMode ? `0 0 ${FP_W} ${FP_H}` : `0 0 ${SVG_W} ${SVG_H}`}
        className="absolute inset-0 w-full h-full select-none"
        preserveAspectRatio="xMidYMid meet"
        onDoubleClick={e => {
          e.preventDefault();
          if (!isFloorMode && (e.target as Element).closest("[data-bldg]")) return;
          setZoom(z => Math.min(3.5, +(z+0.35).toFixed(2)));
        }}>
        <defs>
          <filter id="bldg-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.18)"/>
          </filter>
          <pattern id="grass" patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="6" height="6" fill="#d4edda"/>
            <circle cx="1.5" cy="1.5" r="0.8" fill="#c0e6c8" opacity="0.6"/>
            <circle cx="4.5" cy="4.5" r="0.7" fill="#c0e6c8" opacity="0.5"/>
          </pattern>
        </defs>

        <g transform={`translate(${tx},${ty}) scale(${displayZoom})`}>

          {/* ════════ FLOOR PLAN mode ════════ */}
          {isFloorMode ? (() => {
            if (!currentFloor) return null;
            return (
              <>
                {/* ── Architectural wall background ── */}
                <rect width={FP_W} height={FP_H} fill="#b0ada8"/>
                {/* Grid for scale reference */}
                {[...Array(22)].map((_,i) => <line key={`gv${i}`} x1={i*20} y1={0} x2={i*20} y2={FP_H} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5}/>)}
                {[...Array(15)].map((_,i) => <line key={`gh${i}`} x1={0} y1={i*20} x2={FP_W} y2={i*20} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5}/>)}
                {/* Outer building wall — thick */}
                <rect x={8} y={8} width={FP_W-16} height={FP_H-16} rx={2}
                  fill="#e0dcd6" stroke="#706d68" strokeWidth={5}/>
                {/* Corridor floor */}
                <rect x={13} y={13} width={FP_W-26} height={FP_H-26} fill="#cdc9c3"/>
                {/* Mode tints */}
                {mapMode === "emergency" && <rect x={8} y={8} width={FP_W-16} height={FP_H-16} fill="rgba(220,38,38,0.10)"/>}
                {mapMode === "accessible" && <rect x={8} y={8} width={FP_W-16} height={FP_H-16} fill="rgba(22,163,74,0.08)"/>}

                {/* ── Rooms ── */}
                {(() => {
                  const hasUp = floorNums.some(n => n > (floorView?.floor ?? 1));
                  const hasDn = floorNums.some(n => n < (floorView?.floor ?? 1));
                  const archFills: Record<string,string> = {
                    classroom:"#dfe8f5", office:"#e3ede6", lab:"#f2eed6",
                    lobby:"#ece9e4", restroom:"#d8edf8", stairs:"#c2beba",
                    storage:"#ece3f5", elevator:"#d4ecdc",
                  };
                  return currentFloor.rooms.map(room => {
                    const isNav  = room.type === "stairs" || room.type === "elevator";
                    const isHov  = hoveredRoom === room.id;
                    const isHigh = highlightedRoom === room.id;
                    const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
                    const navColor = room.type === "elevator"
                      ? (hasUp && hasDn ? "#7c3aed" : hasUp ? "#16a34a" : "#f97316")
                      : (hasUp && hasDn ? "#2563eb" : hasUp ? "#2563eb" : "#f97316");
                    const roomFill = isHigh ? "rgba(14,42,110,0.18)" :
                      isHov && isNav ? navColor :
                      isHov ? (archFills[room.type] ?? "#d0cdc8") :
                      (mapMode === "accessible" && (room.type === "elevator" || room.name.toLowerCase().includes("restroom")))
                        ? "rgba(22,163,74,0.25)" :
                      archFills[room.type] ?? "#dddad5";

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
                          stroke={isHigh ? "#0e2a6e" : isHov ? navColor : isNav ? navColor : "#8a8580"}
                          strokeWidth={isHigh || isHov ? 2.5 : isNav ? 1.5 : 1}/>

                        {/* Interior shadow edges (gives depth) */}
                        {!isNav && !isHigh && <>
                          <line x1={room.x+1} y1={room.y+1} x2={room.x+room.w-1} y2={room.y+1} stroke="rgba(0,0,0,0.10)" strokeWidth={1.5}/>
                          <line x1={room.x+1} y1={room.y+1} x2={room.x+1} y2={room.y+room.h-1} stroke="rgba(0,0,0,0.10)" strokeWidth={1.5}/>
                          <line x1={room.x} y1={room.y+room.h} x2={room.x+room.w} y2={room.y+room.h} stroke="rgba(255,255,255,0.4)" strokeWidth={1}/>
                          <line x1={room.x+room.w} y1={room.y} x2={room.x+room.w} y2={room.y+room.h} stroke="rgba(255,255,255,0.4)" strokeWidth={1}/>
                        </>}

                        {/* Room name */}
                        {room.w >= 44 && room.h >= 18 && !isNav && (
                          <text x={cx} y={cy+3} textAnchor="middle"
                            fill={isHov ? "#1a1714" : "#3a3630"}
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
                                fill={isHov ? "white" : "#4a4642"} className="pointer-events-none select-none">
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

                {/* ── Compass rose ── */}
                <g transform={`translate(${FP_W-22},20)`}>
                  <circle r={12} fill="white" stroke="#8a8580" strokeWidth={1}/>
                  <text textAnchor="middle" y={-2} fontSize={7} fontWeight="900" fill="#1e40af">N</text>
                  <line y1={0} y2={-8} stroke="#1e40af" strokeWidth={2} strokeLinecap="round"/>
                  <line y1={0} y2={7} stroke="#9ca3af" strokeWidth={1} strokeLinecap="round"/>
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
            <rect data-bg="true" width={SVG_W} height={SVG_H} fill="#f2efe9"/>
            <rect x={6} y={6} width={SVG_W-12} height={SVG_H-12} fill="none" stroke="#c8b89a" strokeWidth={3} rx={4} opacity={0.5} strokeDasharray="8 4"/>
            {/* Green areas */}
            <ellipse cx={401} cy={285} rx={55} ry={42} fill="url(#grass)" opacity={0.9}/>
            <ellipse cx={188} cy={385} rx={82} ry={55} fill="url(#grass)" opacity={0.85}/>
            <ellipse cx={590} cy={155} rx={58} ry={42} fill="url(#grass)" opacity={0.85}/>
            <rect x={25} y={490} width={200} height={80} rx={8} fill="url(#grass)" opacity={0.8}/>
            <rect x={35} y={500} width={180} height={60} rx={4} fill="none" stroke="#86c98a" strokeWidth={1.5} strokeDasharray="4 3"/>
            <rect x={472} y={338} width={118} height={62} rx={6} fill="url(#grass)" opacity={0.85}/>
            {[[175,380],[188,392],[202,380],[215,392],[580,148],[596,160],[612,148],[595,136],[395,258],[407,258],[419,258],[395,312],[407,312],[419,312],[40,510],[70,510],[100,510],[130,510],[160,510]].map(([cx,cy],i) => (
              <g key={`t${i}`}>
                <circle cx={cx} cy={cy} r={8} fill="#5a9e6a" opacity={0.55}/>
                <circle cx={cx} cy={cy} r={5} fill="#4a8a58" opacity={0.7}/>
                <circle cx={cx} cy={cy} r={2} fill="#3a7448" opacity={0.8}/>
              </g>
            ))}
            {/* Roads */}
            <rect x={0} y={272} width={SVG_W} height={26} fill="#e8e0d2"/>
            <rect x={0} y={272} width={SVG_W} height={26} fill="none" stroke="#cec4b4" strokeWidth={1}/>
            <line x1={0} y1={285} x2={SVG_W} y2={285} stroke="white" strokeWidth={1.5} strokeDasharray="18 10" opacity={0.7}/>
            <text x={62} y={268} fontSize={8} fill="#8a7a6a" fontWeight="700" letterSpacing="0.05em" className="select-none">TONGCO STREET</text>
            <rect x={388} y={0} width={26} height={SVG_H} fill="#e8e0d2"/>
            <rect x={388} y={0} width={26} height={SVG_H} fill="none" stroke="#cec4b4" strokeWidth={1}/>
            <line x1={401} y1={0} x2={401} y2={SVG_H} stroke="white" strokeWidth={1.5} strokeDasharray="18 10" opacity={0.7}/>
            <text x={403} y={200} fontSize={8} fill="#8a7a6a" fontWeight="700" transform="rotate(90,403,200)" className="select-none">MAIN ROAD</text>
            <rect x={104} y={0} width={15} height={SVG_H} fill="#ede8df" opacity={0.8}/>
            <rect x={0} y={455} width={SVG_W} height={14} fill="#ede8df" opacity={0.8}/>
            <path d="M 120 290 L 155 290 L 155 210" fill="none" stroke="#e0d8cc" strokeWidth={10} strokeLinecap="round"/>
            <path d="M 414 290 L 540 290 L 540 373" fill="none" stroke="#e0d8cc" strokeWidth={10} strokeLinecap="round"/>
            <path d="M 414 290 L 414 435 L 305 435" fill="none" stroke="#e0d8cc" strokeWidth={10} strokeLinecap="round"/>
            <path d="M 414 435 L 605 435" fill="none" stroke="#e0d8cc" strokeWidth={10} strokeLinecap="round"/>
            <path d="M 414 200 L 395 200 L 395 115" fill="none" stroke="#e0d8cc" strokeWidth={8} strokeLinecap="round"/>
            {[272,277,282,287,292].map((y,i) => <rect key={i} x={395} y={y} width={16} height={3} fill="white" opacity={0.8}/>)}
            {[388,393,398,403].map((x,i) => <rect key={i} x={x} y={276} width={3} height={14} fill="white" opacity={0.8}/>)}
            {/* Parking */}
            <rect x={240} y={460} width={70} height={36} rx={3} fill="#e4ddd2" stroke="#cec6b8" strokeWidth={1}/>
            <text x={275} y={482} textAnchor="middle" fill="#8a7a6a" fontSize={7} fontWeight="700" className="select-none">PARKING</text>
            {[252,264,276,288,300].map((x,i) => <line key={i} x1={x} y1={462} x2={x} y2={494} stroke="#cec6b8" strokeWidth={0.8}/>)}
            <rect x={738} y={98} width={60} height={45} rx={3} fill="#e4ddd2" stroke="#cec6b8" strokeWidth={1}/>
            <text x={768} y={124} textAnchor="middle" fill="#8a7a6a" fontSize={7} fontWeight="700" className="select-none">PARKING</text>
            {[750,760,770,780,790].map((x,i) => <line key={i} x1={x} y1={100} x2={x} y2={141} stroke="#cec6b8" strokeWidth={0.8}/>)}
            {/* Accessible overlay */}
            {mapMode === "accessible" && <>
              <path d="M 119,289 L 155,289 L 155,170" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              <path d="M 414,289 L 540,289 L 540,373" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              <path d="M 414,289 L 414,435 L 305,435" fill="none" stroke="#16a34a" strokeWidth={7} opacity={0.5} strokeDasharray="12,6" strokeLinecap="round"/>
              {([[155,290],[414,373],[414,435]] as [number,number][]).map(([cx,cy],i) => (
                <g key={i}><circle cx={cx} cy={cy} r={10} fill="white" stroke="#16a34a" strokeWidth={2}/><text x={cx} y={cy+4} textAnchor="middle" fill="#16a34a" fontSize={11} fontWeight="900" className="select-none">♿</text></g>
              ))}
            </>}
            {/* Emergency overlay */}
            {mapMode === "emergency" && <>
              <rect x={0} y={272} width={SVG_W} height={26} fill="rgba(220,38,38,0.15)"/>
              {([[119,285,"EXIT"],[680,285,"EXIT"],[401,285,"RALLY"]] as [number,number,string][]).map(([cx,cy,lbl],i) => (
                <g key={i}><circle cx={cx} cy={cy} r={16} fill="#dc2626" stroke="white" strokeWidth={2.5}/><text x={cx} y={cy+4} textAnchor="middle" fill="white" fontSize={7} fontWeight="900" className="select-none">{lbl}</text></g>
              ))}
            </>}
            {/* Route */}
            {route && (() => {
              const pathStr = route.points.map(p => `${p.x},${p.y}`).join(" ");
              const color = mapMode === "accessible" ? "#16a34a" : mapMode === "emergency" ? "#dc2626" : "#1e40af";
              const pathId = "plv-route-path";
              return (
                <g>
                  <defs><path id={pathId} d={`M ${route.points.map(p => `${p.x} ${p.y}`).join(" L ")}`}/></defs>
                  <polyline points={pathStr} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points={pathStr} fill="none" stroke="white" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points={pathStr} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="900" strokeDashoffset="900"
                    style={{ animation:"draw-route 1.4s cubic-bezier(0.4,0,0.2,1) forwards" }}/>
                  <polyline points={pathStr} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2}
                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 14"
                    style={{ animation:"draw-route 1.4s 0.4s ease forwards, dash-flow 1.2s 1.8s linear infinite" }}/>
                  <circle r="8" fill={color} stroke="white" strokeWidth={2.5} style={{ filter:`drop-shadow(0 2px 8px ${color}aa)` }}>
                    <animateMotion dur="5s" repeatCount="indefinite" rotate="auto"><mpath href={`#${pathId}`}/></animateMotion>
                  </circle>
                  <circle cx={route.points[0].x} cy={route.points[0].y} r={12} fill="#16a34a" stroke="white" strokeWidth={2.5}/>
                  <text x={route.points[0].x} y={route.points[0].y+4} textAnchor="middle" fill="white" fontSize={9} fontWeight="900" className="select-none">A</text>
                  <circle cx={route.points[route.points.length-1].x} cy={route.points[route.points.length-1].y} r={12} fill="#dc2626" stroke="white" strokeWidth={2.5}/>
                  <text x={route.points[route.points.length-1].x} y={route.points[route.points.length-1].y+4} textAnchor="middle" fill="white" fontSize={9} fontWeight="900" className="select-none">B</text>
                  <circle cx={route.points[route.points.length-1].x} cy={route.points[route.points.length-1].y} r={12} fill="none" stroke="#dc2626" strokeWidth={2} opacity="0.5">
                    <animate attributeName="r" from="12" to="24" dur="1.8s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" repeatCount="indefinite"/>
                  </circle>
                </g>
              );
            })()}
            {/* Gates */}
            {[{x:100,y:272,w:22,lbl:"Main"},{x:672,y:272,w:22,lbl:"East"}].map((g,i) => (
              <g key={i}>
                <rect x={g.x} y={g.y} width={g.w} height={26} fill="#0e2a6e" rx={3}/>
                <text x={g.x+g.w/2} y={g.y+10} textAnchor="middle" fill="white" fontSize={6} fontWeight="900" className="select-none">GATE</text>
                <text x={g.x+g.w/2} y={g.y+18} textAnchor="middle" fill="#c8960c" fontSize={5} fontWeight="700" className="select-none">{g.lbl.toUpperCase()}</text>
              </g>
            ))}
            {/* Buildings */}
            {layers.buildings && MOCK_BUILDINGS.map(b => {
              const pos = B_POS[b.id]; if (!pos) return null;
              const isSel = selected?.id === b.id;
              const googleFill = mapMode === "standard"
                ? (b.category === "sports" ? "#d4e8c2" : b.category === "library" || b.category === "facility" ? "#c8dff5" : "#d4c9b8")
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
                    stroke={isSel ? "#1e40af" : mapMode === "standard" ? "#b0a090" : "rgba(255,255,255,0.5)"}
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
                    fill={mapMode === "standard" ? "#4a3c2c" : "white"}
                    fontSize={10} fontWeight="800" letterSpacing="-0.3"
                    className="pointer-events-none select-none">{b.code}</text>
                  {/* Building name label */}
                  {displayZoom > 0.7 && <text x={pos.x+pos.w/2} y={pos.y+pos.h+13}
                    textAnchor="middle" fill={mapMode === "standard" ? "#3a3028" : "rgba(255,255,255,0.9)"}
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
            {/* Event markers — star pins */}
            {EVENT_MARKERS.map(ev => (
              <g key={ev.id} style={{ cursor:"pointer" }}
                onClick={e => { e.stopPropagation(); if (!dragRef.current?.moved) setSelectedEvent(ev); }}>
                {/* Pulse ring */}
                <circle cx={ev.x} cy={ev.y-2} r={15} fill="none" stroke={ev.color} strokeWidth={1.5} opacity={0.4}>
                  <animate attributeName="r" from="15" to="26" dur="2.2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" from="0.4" to="0" dur="2.2s" repeatCount="indefinite"/>
                </circle>
                {/* Pin drop shadow */}
                <ellipse cx={ev.x} cy={ev.y+14} rx={5} ry={2} fill="rgba(0,0,0,0.18)"/>
                {/* Pin body (teardrop) */}
                <path d={`M${ev.x},${ev.y+14} C${ev.x-7},${ev.y+5} ${ev.x-13},${ev.y-4} ${ev.x-13},${ev.y-10} A13,13 0 1,1 ${ev.x+13},${ev.y-10} C${ev.x+13},${ev.y-4} ${ev.x+7},${ev.y+5} ${ev.x},${ev.y+14}Z`}
                  fill={ev.color} stroke="white" strokeWidth={2}/>
                {/* Star icon inside pin */}
                <text x={ev.x} y={ev.y-6} textAnchor="middle" fill="white" fontSize={11} fontWeight="900" className="select-none pointer-events-none">★</text>
              </g>
            ))}
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
      <div data-no-drag className="absolute top-3 left-3 z-20" style={{ width:300, maxWidth:"calc(100vw - 100px)" }}>

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
          /* ── Directions panel ── */
          <div className="rounded-2xl border border-border shadow-xl overflow-visible"
            style={{ background:"var(--card)", color:"var(--foreground)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary"/>
                <span className="text-sm font-extrabold text-foreground" style={{ fontFamily:"var(--font-sans)" }}>Directions</span>
              </div>
              <button onClick={() => { setDirectionsMode(false); setFromBuilding(null); setToBuilding(null); }}
                className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-secondary transition-colors">
                <X className="h-3.5 w-3.5 text-muted-foreground"/>
              </button>
            </div>
            <div className="p-3 space-y-2">
              <BuildingPicker badge="A" badgeColor="#16a34a" value={fromBuilding}
                onSelect={setFromBuilding} onClear={() => setFromBuilding(null)} placeholder="Starting point…"
                buildings={MOCK_BUILDINGS}/>
              <div className="flex items-center justify-center">
                <button onClick={() => { const tmp = fromBuilding; setFromBuilding(toBuilding); setToBuilding(tmp); }}
                  className="w-7 h-7 rounded-full border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors">
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground"/>
                </button>
              </div>
              <BuildingPicker badge="B" badgeColor="#dc2626" value={toBuilding}
                onSelect={setToBuilding} onClear={() => setToBuilding(null)} placeholder="Destination…"
                buildings={MOCK_BUILDINGS}/>
              {route && (
                <div className="mt-1 p-3 rounded-xl bg-primary/8 border border-primary/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest">Route Active</span>
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse"/>
                  </div>
                  <p className="text-lg font-extrabold text-foreground">{route.dist} m</p>
                  <p className="text-[10px] text-muted-foreground">{route.mins} min walking · Animated on map</p>
                </div>
              )}
            </div>
          </div>
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
                {/* Building search results */}
                {!isFloorMode && search && (
                  <div className="max-h-48 overflow-y-auto">
                    {buildingResults.length > 0 ? buildingResults.map(b => (
                      <button key={b.id} onMouseDown={e => { e.preventDefault(); selectBuilding(b); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Building2 className="h-4 w-4 text-primary"/></div>
                        <div><p className="text-sm font-bold text-foreground">{b.name}</p><p className="text-xs text-muted-foreground">{b.code} · {b.category}</p></div>
                      </button>
                    )) : <p className="text-sm text-muted-foreground px-4 py-3">No results for "{search}"</p>}
                  </div>
                )}
                {/* Room search results (floor plan mode) */}
                {isFloorMode && (
                  <div className="max-h-48 overflow-y-auto">
                    {!search && (
                      <p className="text-xs text-muted-foreground px-4 py-3">
                        Search rooms, offices, labs, restrooms, stairs…
                      </p>
                    )}
                    {search && roomResults.length > 0 ? roomResults.map(r => (
                      <button key={r.id} onMouseDown={e => {
                        e.preventDefault();
                        setHighlightedRoom(r.id);
                        setSearch("");
                        setSearchFocused(false);
                      }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">{r.type === "stairs" ? "↕" : r.type === "elevator" ? "▲" : "⬜"}</div>
                        <div><p className="text-sm font-bold text-foreground">{r.name}</p><p className="text-xs text-muted-foreground capitalize">{r.type}</p></div>
                      </button>
                    )) : search ? (
                      <p className="text-sm text-muted-foreground px-4 py-3">No rooms found for "{search}"</p>
                    ) : null}
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

      {/* ══════════════ ZOOM CONTROLS — always visible ══════════════ */}
      <div data-no-drag className="absolute bottom-20 md:bottom-5 right-3 z-20 flex flex-col gap-1">
        <button onClick={e => { e.stopPropagation(); setShowLayers(v => !v); }} title="Layers"
          className={cn("w-9 h-9 rounded-xl border shadow-md flex items-center justify-center transition-all",
            showLayers ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border/60 text-muted-foreground hover:border-primary/30")}>
          <Layers className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); setZoom(z => Math.min(3.5,+(z+0.4).toFixed(2))); }} title="Zoom in"
          className="w-9 h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all">
          <ZoomIn className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); setZoom(z => Math.max(0.35,+(z-0.4).toFixed(2))); }} title="Zoom out"
          className="w-9 h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all">
          <ZoomOut className="h-4 w-4"/>
        </button>
        <button onClick={e => { e.stopPropagation(); setZoom(1); setPan({x:0,y:0}); }} title="Reset view"
          className="w-9 h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all">
          <LocateFixed className="h-4 w-4"/>
        </button>
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

      {/* ══════════════ COMPACT NAVIGATION CARD (only when route active) ══════════════ */}
      {route && (
        <div data-no-drag className="absolute bottom-5 left-3 z-20 hidden md:block animate-slide-up">
          <div className="rounded-2xl border border-border/60 shadow-xl overflow-hidden"
            style={{ background:"var(--card)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)", width:200 }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border" style={{ background:"var(--primary)" }}>
              <Navigation className="h-3.5 w-3.5 text-white shrink-0"/>
              <span className="text-[11px] font-extrabold text-white truncate flex-1">{toBuilding?.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0"/>
            </div>
            <div className="px-3 py-3 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 px-2 py-1.5 rounded-lg bg-muted text-center">
                  <p className="text-[10px] text-muted-foreground">Distance</p>
                  <p className="text-sm font-extrabold text-foreground">{route.dist} m</p>
                </div>
                <div className="flex-1 px-2 py-1.5 rounded-lg bg-muted text-center">
                  <p className="text-[10px] text-muted-foreground">Time</p>
                  <p className="text-sm font-extrabold text-foreground">{route.mins} min</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug" style={{ fontFamily:"var(--font-body)" }}>
                Follow the animated route on the map.
              </p>
              <button onClick={() => { setFromBuilding(null); setToBuilding(null); setDirectionsMode(false); }}
                className="w-full h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors">
                End Navigation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ SMART INFO PANEL — 5 tabs, slides from right ══════════════ */}
      <div data-no-drag className="absolute top-0 right-0 bottom-0 z-30 hidden md:flex flex-col border-l border-border bg-card shadow-2xl"
        style={{
          width: 280,
          transform: selected ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        }}>
        {selected && (
          <>
            {/* Photo header */}
            <div className="relative h-28 shrink-0 overflow-hidden bg-muted">
              {selected.image_url && <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover"/>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"/>
              <button onClick={() => selectBuilding(null)}
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors">
                <X className="h-3.5 w-3.5"/>
              </button>
              <div className="absolute bottom-3 left-3 right-10">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="bg-primary/90 text-primary-foreground text-[10px] font-mono font-extrabold px-2 py-0.5 rounded">{selected.code}</span>
                  <span className={cn("flex items-center gap-1 text-[10px] font-bold", STATUS_COLOR[STATUS[selected.id] ?? "Open"])}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[STATUS[selected.id] ?? "Open"])}/>
                    {STATUS[selected.id] ?? "Open"}
                  </span>
                </div>
                <h2 className="text-white font-extrabold text-sm leading-tight" style={{ fontFamily:"var(--font-sans)" }}>{selected.name}</h2>
              </div>
            </div>

            {/* 2×2 action buttons */}
            <div className="grid grid-cols-2 gap-1.5 px-3 py-2.5 border-b border-border shrink-0">
              <button onClick={() => startDirectionsTo(selected)}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-extrabold hover:bg-primary/90 transition-colors">
                <Navigation className="h-3.5 w-3.5"/> Directions
              </button>
              <button onClick={() => { try { navigator.clipboard?.writeText(selected.name + " — PLV NaviSync"); } catch {} }}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border hover:bg-secondary transition-colors">
                <Share2 className="h-3.5 w-3.5"/> Share
              </button>
              {studentAuth ? (
                <button onClick={() => toggleSave(selected.id)}
                  className={cn("flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-extrabold border transition-colors",
                    saved.has(selected.id) ? "bg-accent/15 text-accent border-accent/30" : "bg-muted text-muted-foreground border-border hover:bg-secondary")}>
                  <Bookmark className={cn("h-3.5 w-3.5", saved.has(selected.id) && "fill-current")}/>
                  {saved.has(selected.id) ? "Saved" : "Save"}
                </button>
              ) : (
                <button onClick={() => setSignInPrompt("save locations")}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60">
                  <Bookmark className="h-3.5 w-3.5"/> Save
                </button>
              )}
              {studentAuth ? (
                <button onClick={() => setReportModal(selected)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <Flag className="h-3.5 w-3.5"/> Report
                </button>
              ) : (
                <button onClick={() => setSignInPrompt("report issues")}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60">
                  <Flag className="h-3.5 w-3.5"/> Report
                </button>
              )}
            </div>

            {/* 5-tab navigation */}
            <div className="flex border-b border-border shrink-0 overflow-x-auto no-scrollbar">
              {(["overview","departments","facilities","accessibility","route"] as PanelTab[]).map(t => (
                <button key={t} onClick={() => setPanelTab(t)}
                  className={cn("flex-1 py-2 text-[10px] font-extrabold whitespace-nowrap px-1 transition-all border-b-2 shrink-0",
                    panelTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {t === "overview" ? "Overview" : t === "departments" ? "Depts" : t === "facilities" ? "Facilities" : t === "accessibility" ? "Access." : "Route"}
                  {t === "route" && route && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent ml-1 align-middle animate-pulse"/>}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {panelTab === "overview" && (
                <div className="h-full overflow-y-auto p-4 space-y-3 scrollbar-show-on-hover">
                  <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 border border-primary/15">
                    <span className="text-[10px] font-bold text-primary capitalize">{selected.category}</span>
                  </div>
                  {selected.operating_hours && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary shrink-0"/> {selected.operating_hours}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily:"var(--font-body)" }}>{selected.description}</p>
                  {/* Floor plan button (only if has floor plan and not already in floor view of this building) */}
                  {FLOOR_PLANS[selected.id] && (!isFloorMode || floorView?.building.id !== selected.id) && (
                    <button onClick={() => openFloorPlan(selected, 1)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-colors group">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary shrink-0"/>
                        <div className="text-left">
                          <p className="text-xs font-extrabold text-primary">View Floor Plan</p>
                          <p className="text-[10px] text-muted-foreground">{FLOOR_PLANS[selected.id].floors.length} floors</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform"/>
                    </button>
                  )}
                  {isFloorMode && floorView?.building.id === selected.id && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20">
                      <Layers className="h-3.5 w-3.5 text-primary shrink-0"/>
                      <span className="text-xs font-semibold text-primary">Viewing floor plan — use the floor selector →</span>
                    </div>
                  )}
                  {/* QR */}
                  <div>
                    <button onClick={() => setShowQR(v => !v)}
                      className="flex items-center gap-2 text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest hover:text-primary transition-colors w-full">
                      <QrCode className="h-3.5 w-3.5"/> QR Code
                      <ChevronRight className={cn("h-3.5 w-3.5 ml-auto transition-transform", showQR && "rotate-90")}/>
                    </button>
                    {showQR && (
                      <div className="mt-3 flex flex-col items-center gap-2 p-4 rounded-xl bg-muted border border-border animate-scale-in">
                        <div className="text-foreground"><QRPlaceholder/></div>
                        <p className="text-[10px] text-muted-foreground text-center">Scan to view {selected.name} on mobile</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {panelTab === "departments" && (
                <div className="h-full overflow-y-auto p-4 scrollbar-show-on-hover">
                  {selected.departments?.length ? (
                    <div className="space-y-0">
                      <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-3">Departments</p>
                      {selected.departments.map(d => (
                        <div key={d} className="flex items-center gap-2 py-2 border-b border-border last:border-0 text-xs text-foreground">
                          <Building2 className="h-3.5 w-3.5 text-primary shrink-0"/> {d}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center pt-8">No departments listed.</p>
                  )}
                </div>
              )}
              {panelTab === "facilities" && (
                <div className="h-full overflow-y-auto p-4 scrollbar-show-on-hover">
                  <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-3">Facilities</p>
                  {BUILDING_FACILITIES[selected.id] ? (
                    <div className="flex flex-wrap gap-1.5">
                      {BUILDING_FACILITIES[selected.id].map(f => (
                        <span key={f} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground">{f}</span>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No facilities data.</p>}
                </div>
              )}
              {panelTab === "accessibility" && (
                <div className="h-full overflow-y-auto p-4 scrollbar-show-on-hover">
                  <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-3">Accessibility Features</p>
                  {BUILDING_ACCESSIBILITY[selected.id] ? (
                    <div className="space-y-2">
                      {BUILDING_ACCESSIBILITY[selected.id].map(a => (
                        <div key={a} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 text-xs text-foreground">
                          <span className="text-green-500 text-sm">♿</span> {a}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No accessibility data.</p>}
                </div>
              )}
              {panelTab === "route" && (
                <div className="h-full flex flex-col items-center justify-center gap-3 px-5 py-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Navigation className="h-6 w-6 text-primary"/>
                  </div>
                  <p className="text-sm font-bold text-foreground">Get Directions</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">Use the Directions panel to plan a route to or from this building.</p>
                  <button onClick={() => startDirectionsTo(selected)}
                    className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-2">
                    <Navigation className="h-3.5 w-3.5"/> Directions to here
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══════════════ STAIR LOADING OVERLAY ══════════════ */}
      {stairLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <div className="text-3xl animate-bounce">{stairLoading.dir === "up" ? "↑" : "↓"}</div>
            <p className="text-sm font-extrabold text-foreground">{stairLoading.dir === "up" ? "Going up to" : "Going down to"}</p>
            <p className="text-xs text-muted-foreground">{stairLoading.label}</p>
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary"
                  style={{ animation:`loading-bounce 1s ease-in-out ${i*0.2}s infinite` }}/>
              ))}
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
      <div data-no-drag className="absolute bottom-[76px] md:bottom-3 left-1/2 -translate-x-1/2 z-20">
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
              <span className="font-semibold">PLV Main Campus</span>
              <ChevronDown className="h-3 w-3 shrink-0" style={{ color:"var(--muted-foreground)", transform: showCampusSelector ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}/>
            </button>
            {showCampusSelector && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-2xl border border-border shadow-2xl overflow-hidden animate-scale-in"
                style={{ background:"var(--card)", width:220 }}>
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>Select Campus</p>
                </div>
                {/* Active campus */}
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left border-l-2" style={{ borderColor:"var(--primary)", background:"color-mix(in srgb, var(--primary) 8%, transparent)" }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background:"var(--primary)" }}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color:"var(--primary)", fontFamily:"var(--font-sans)" }}>PLV Main Campus</p>
                    <p className="text-[10px]" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>Tongco St., Valenzuela</p>
                  </div>
                  <span className="text-[10px] font-extrabold shrink-0" style={{ color:"var(--primary)" }}>Active</span>
                </button>
                {/* Future campus */}
                <div className="flex items-center gap-3 px-4 py-3 opacity-45 cursor-not-allowed">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background:"var(--muted-foreground)" }}/>
                  <div>
                    <p className="text-xs font-bold" style={{ color:"var(--foreground)", fontFamily:"var(--font-sans)" }}>PLV North Campus</p>
                    <p className="text-[10px]" style={{ color:"var(--muted-foreground)", fontFamily:"var(--font-body)" }}>Coming soon</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════ MOBILE: top search ══════════════ */}
      <div data-no-drag className="absolute top-3 left-3 right-14 z-20 md:hidden">
        <div className="flex items-center gap-2 h-10 px-3.5 rounded-2xl border border-border/60 shadow-lg"
          style={{ background:"var(--card)", backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)" }}>
          {isFloorMode && (
            <button onClick={closeFloorPlan} className="text-primary shrink-0"><ChevronLeft className="h-4 w-4"/></button>
          )}
          <Search className="h-4 w-4 text-muted-foreground shrink-0"/>
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder={isFloorMode ? "Search rooms…" : "Search buildings…"}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            style={{ fontFamily:"var(--font-body)" }}/>
          {search && <button onClick={() => setSearch("")}><X className="h-3.5 w-3.5 text-muted-foreground"/></button>}
        </div>
      </div>

      {/* ══════════════ MOBILE: mode chips ══════════════ */}
      <div data-no-drag className="absolute top-3 right-3 z-20 md:hidden flex flex-col gap-1">
        {(["standard","accessible","emergency"] as MapMode[]).map(m => {
          const Icon = m === "standard" ? Compass : m === "accessible" ? Accessibility : AlertTriangle;
          return (
            <button key={m} onClick={e => { e.stopPropagation(); setMapMode(m); }}
              className={cn("w-9 h-9 rounded-xl shadow-md border flex items-center justify-center transition-all backdrop-blur-sm",
                mapMode === m ? "bg-primary text-primary-foreground border-primary" : "bg-card/90 border-border/60 text-muted-foreground")}>
              <Icon className="h-4 w-4"/>
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

      {/* ══════════════ MOBILE: building bottom sheet ══════════════ */}
      {selected && !isFloorMode && (
        <div data-no-drag
          className="md:hidden fixed inset-x-0 z-40 bg-card/96 backdrop-blur-2xl rounded-t-3xl border-t border-border shadow-2xl animate-slide-up overflow-hidden flex flex-col"
          style={{ bottom:"72px", maxHeight:"55vh" }}>
          <div className="flex justify-center pt-3 shrink-0"><div className="w-10 h-1 rounded-full bg-muted-foreground/25"/></div>
          <div className="flex items-start justify-between px-4 pt-2 pb-2 shrink-0">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="bg-primary/90 text-primary-foreground text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded">{selected.code}</span>
                <span className={cn("text-[10px] font-bold flex items-center gap-1", STATUS_COLOR[STATUS[selected.id] ?? "Open"])}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[STATUS[selected.id] ?? "Open"])}/>
                  {STATUS[selected.id] ?? "Open"}
                </span>
              </div>
              <h3 className="font-extrabold text-foreground text-base leading-tight" style={{ fontFamily:"var(--font-sans)" }}>{selected.name}</h3>
            </div>
            <button onClick={() => selectBuilding(null)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 ml-2"><X className="h-4 w-4 text-muted-foreground"/></button>
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 pb-3 border-b border-border shrink-0">
            <button onClick={() => startDirectionsTo(selected)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-primary text-primary-foreground text-[10px] font-extrabold">
              <Navigation className="h-4 w-4"/> Dir.
            </button>
            {FLOOR_PLANS[selected.id] && (
              <button onClick={() => openFloorPlan(selected)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border">
                <Layers className="h-4 w-4"/> Floors
              </button>
            )}
            {studentAuth ? (
              <button onClick={() => toggleSave(selected.id)}
                className={cn("flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[10px] font-extrabold border",
                  saved.has(selected.id) ? "bg-accent/15 text-accent border-accent/30" : "bg-muted text-muted-foreground border-border")}>
                <Bookmark className={cn("h-4 w-4", saved.has(selected.id) && "fill-current")}/>
                {saved.has(selected.id) ? "Saved" : "Save"}
              </button>
            ) : (
              <button onClick={() => setSignInPrompt("save locations")}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60">
                <Bookmark className="h-4 w-4"/> Save
              </button>
            )}
            {studentAuth ? (
              <button onClick={() => setReportModal(selected)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border">
                <Flag className="h-4 w-4"/> Report
              </button>
            ) : (
              <button onClick={() => setSignInPrompt("report issues")}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60">
                <Flag className="h-4 w-4"/> Report
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 p-4 scrollbar-show-on-hover">
            <p className="text-sm text-muted-foreground leading-relaxed" style={{ fontFamily:"var(--font-body)" }}>{selected.description}</p>
          </div>
        </div>
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
      )}

      {/* ══════════════ MODALS ══════════════ */}
      {reportModal   && <ReportModal building={reportModal} onClose={() => setReportModal(null)}/>}
      {selectedEvent && <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} onNavigate={() => { const t = MOCK_BUILDINGS.find(b => b.id === "b5"); if (t) { selectBuilding(t); startDirectionsTo(t); } setSelectedEvent(null); }}/>}
      {signInPrompt  && <SignInPrompt message={signInPrompt} onClose={() => setSignInPrompt(null)}/>}
    </div>
  );
}
