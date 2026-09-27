/**
 * EventFloorEditor — A simplified, read-only version of the Floor Editor
 * for Student Organization users.
 *
 * Features:
 * - Read-only base map (walls, doors, windows, permanent furniture)
 * - Limited tool palette: select, furniture (event-specific only), text, pan
 * - Event furniture can be placed, moved, resized, and deleted
 * - Event labels can be placed and edited
 * - Saves ONLY to the CampusEventOverlay document, not the base map
 */
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, type CSSProperties, type MutableRefObject } from "react";
import {
  ArrowLeft,
  Save,
  Send,
  Move,
  Type,
  Hand,
  Trash2,
  Undo2,
  Redo2,
  Loader2,
  MapPin,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Magnet,
  Lock,
  Unlock,
  Group,
  Ungroup,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { genId } from "../map-builder/constants";
import type {
  FloorPlan,
  FloorFurniture,
  FloorLabel,
  CampusEventOverlay,
  EventLocationRef,
  Campus,
} from "../map-builder/types";
import { projectReadonlyOutdoorCampus } from "../../lib/readonlyOutdoorCampus";
import { campusGroundAppearance } from "../../lib/campusCanvas";
import { clampViewportPan, getPanToKeepWorldPoint, getViewportFitZoom, getViewportPanBounds } from "../../lib/mapViewport";
import { fitEventViewport, getContentPanBounds, getFloorPlanContentBounds, getSmoothZoomTarget, normalizeWheelDelta } from "../../lib/eventViewport";
import { clearEventLayoutDraft, eventLayoutDraftStorageKey, readEventLayoutDraft, writeEventLayoutDraft } from "../../lib/eventDraftPersistence";
import { ReadonlyOutdoorCampusScene } from "../map-builder/ReadonlyOutdoorVisuals";
import { ReadonlyFloorPlanScene } from "../map-builder/ReadonlyFloorPlanVisuals";
import type { EventOverlayStatus } from "../../services/eventOverlayService";
import { isCanvasTextEditingTarget, useSpacePan } from "../canvas/useSpacePan";
import { CanvasAssetPalette, EVENT_ASSET_DRAG_TYPE } from "../canvas/CanvasAssetPalette";
import {
  EVENT_FURNITURE_TEMPLATES,
  EventAssetVisual,
  eventFurnitureFromTemplate,
  getEventFurnitureTemplate,
} from "./eventAssets";
import { resolveCanvasAssetKey } from "../canvas/canvasAssetCatalog";
import { applyLayoutAction, nudgeItems, resolveLayoutMoveFromSnapshot, selectionBounds, type LayoutAction, type LayoutSnapGuide } from "../../lib/eventLayoutGeometry";
import { constrainFurnitureToFloor, resizeFurnitureWithinFloor } from "../../lib/floorGeometry";
import { transformControlMetrics } from "../../lib/campusSelection";
import { EVENT_LAYOUT_PRESETS, getEventLayoutPreset, type EventLayoutPresetId } from "../../lib/eventLayoutPresets";
import { validateEventLayout } from "../../lib/eventLayoutValidation";
import { useEventViewportMotion } from "./useEventViewportMotion";
import { EventLayoutIssues } from "./EventLayoutIssues";
import { EventItemInspector } from "./EventItemInspector";
import * as Dialog from "@radix-ui/react-dialog";
import { clientToEventWorld, type GestureFrame } from "../../lib/eventGestureCoordinates";

// ── Tool types ────────────────────────────────────────────────────────────

type EventTool = "select" | "furniture" | "text" | "pan";
const EVENT_EDITOR_WORKSPACE_PADDING = 64;
const EVENT_EDITOR_MIN_ZOOM = 0.25;
const EVENT_MAX_ZOOM = 4;
const MOBILE_EVENT_VIEWER_INSETS = { top: 12, right: 12, bottom: 12, left: 12 };

interface EventToolDef {
  id: EventTool;
  label: string;
  icon: React.ElementType;
}

const EVENT_TOOLS: EventToolDef[] = [
  { id: "select", label: "Select", icon: Move },
  { id: "furniture", label: "Furniture", icon: () => <span className="text-sm">🪑</span> },
  { id: "text", label: "Label", icon: Type },
  { id: "pan", label: "Pan", icon: Hand },
];

const EVENT_LAYOUT_ACTIONS: Array<{ action: LayoutAction; label: string; description: string }> = [
  { action: "align-left", label: "Align left", description: "Line up the left edges" },
  { action: "align-center", label: "Align center", description: "Line up the horizontal centers" },
  { action: "align-top", label: "Align top", description: "Line up the top edges" },
  { action: "align-middle", label: "Align middle", description: "Line up the vertical centers" },
  { action: "distribute-horizontal", label: "Distribute horizontally", description: "Space items evenly left to right" },
  { action: "distribute-vertical", label: "Distribute vertically", description: "Space items evenly top to bottom" },
];

type ResizeHandleDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const RESIZE_HANDLE_DIRECTIONS: ResizeHandleDirection[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const RESIZE_HANDLE_POSITION: Record<ResizeHandleDirection, string> = {
  nw: "cursor-nwse-resize",
  n: "cursor-ns-resize",
  ne: "cursor-nesw-resize",
  e: "cursor-ew-resize",
  se: "cursor-nwse-resize",
  s: "cursor-ns-resize",
  sw: "cursor-nesw-resize",
  w: "cursor-ew-resize",
};

function getEventResizeHandleStyle(handle: ResizeHandleDirection, hitSize: number): CSSProperties {
  const halfHitSize = hitSize / 2;
  const base: CSSProperties = {
    width: hitSize,
    height: hitSize,
    minWidth: 0,
    minHeight: 0,
    padding: 0,
  };
  switch (handle) {
    case "nw": return { ...base, left: -halfHitSize, top: -halfHitSize };
    case "n": return { ...base, left: "50%", top: -halfHitSize, transform: "translateX(-50%)" };
    case "ne": return { ...base, right: -halfHitSize, top: -halfHitSize };
    case "e": return { ...base, right: -halfHitSize, top: "50%", transform: "translateY(-50%)" };
    case "se": return { ...base, right: -halfHitSize, bottom: -halfHitSize };
    case "s": return { ...base, left: "50%", bottom: -halfHitSize, transform: "translateX(-50%)" };
    case "sw": return { ...base, left: -halfHitSize, bottom: -halfHitSize };
    case "w": return { ...base, left: -halfHitSize, top: "50%", transform: "translateY(-50%)" };
  }
}

type EventPointerGesture = "pan" | "drag" | "resize" | "rotate" | "pinch";

interface EventResizeGesture {
  id: string;
  handle: ResizeHandleDirection;
  startMouseX: number;
  startMouseY: number;
  origin: FloorFurniture;
}

interface EventMoveGesture {
  anchorId: string;
  anchorType: "furniture" | "label";
  ids: string[];
  startPointer: { x: number; y: number };
  furnitureOrigins: FloorFurniture[];
  labelOrigins: FloorLabel[];
  allFurnitureAtStart: FloorFurniture[];
  frame: GestureFrame;
}

interface EventRotateGesture {
  id: string;
  centerX: number;
  centerY: number;
  startAngle: number;
  startRotation: number;
}

interface PointerSample {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
}

type FinishReason = "pointerup" | "cancel" | "lostcapture" | "blur" | "hidden" | "escape" | "resize" | "pinch-transfer" | "save" | "switch";
type PointerPressOrigin = "none" | "blank" | "item" | "handle" | "chrome" | "pan";

interface PinchGesture {
  ids: [number, number];
  frame: GestureFrame;
  startDistance: number;
  startZoom: number;
  worldAnchor: { x: number; y: number };
  points: Map<number, { x: number; y: number }>;
}

// ── Undo/Redo types ───────────────────────────────────────────────────────

interface EditorHistoryEntry {
  eventFurniture: FloorFurniture[];
  eventLabels: FloorLabel[];
}

interface InitialEventLayout {
  eventFurniture: FloorFurniture[];
  eventLabels: FloorLabel[];
  recovered: boolean;
}

function getInitialEventLayout(overlay: CampusEventOverlay, readOnly: boolean): InitialEventLayout {
  const uniqueById = <T extends { id: string }>(items: readonly T[]) => items.filter((item, index, all) => (
    all.findIndex((candidate) => candidate.id === item.id) === index
  ));
  const eventFurniture = uniqueById(overlay.eventFurniture || []);
  const eventLabels = uniqueById(overlay.eventLabels || []);
  if (readOnly || !overlay.locationRef) return { eventFurniture, eventLabels, recovered: false };

  const draft = readEventLayoutDraft(overlay.id, overlay.locationRef);
  if (!draft) return { eventFurniture, eventLabels, recovered: false };
  return {
    eventFurniture: uniqueById(draft.eventFurniture),
    eventLabels: uniqueById(draft.eventLabels),
    recovered: true,
  };
}

// ── Main Component ────────────────────────────────────────────────────────

export interface EventFloorEditorProps {
  /** The base floor plan data (read-only) */
  floorPlan: FloorPlan;
  /** The event overlay being edited */
  overlay: CampusEventOverlay;
  /** Called when the user saves changes */
  onSave: (
    furniture: FloorFurniture[],
    labels: FloorLabel[]
  ) => Promise<void | boolean>;
  /** Called when the user submits for approval */
  onSubmit: (
    furniture: FloorFurniture[],
    labels: FloorLabel[]
  ) => Promise<void | boolean>;
  /** Reports the current unsaved location draft to the page coordinator. */
  onDraftChange?: (furniture: FloorFurniture[], labels: FloorLabel[]) => void;
  /** Synchronously completes an active gesture before a page boundary changes location. */
  interactionCommitRef?: MutableRefObject<(() => EventEditorDraftSnapshot) | null>;
  /** Called when the user clicks back */
  onBack: () => void;
  /** Whether the overlay is currently being saved */
  isSaving?: boolean;
  /** Whether the overlay is currently being submitted */
  isSubmitting?: boolean;
  /** The full campus data for rendering the outdoor map (only when editing campus grounds) */
  activeCampus?: Campus | null;
  /** Admin review mode: show the submitted map without edit controls. */
  readOnly?: boolean;
}

export interface EventEditorDraftSnapshot {
  eventFurniture: FloorFurniture[];
  eventLabels: FloorLabel[];
}

export function EventFloorEditor({
  floorPlan,
  overlay,
  onSave,
  onSubmit,
  onDraftChange,
  interactionCommitRef,
  onBack,
  isSaving = false,
  isSubmitting = false,
  activeCampus,
  readOnly = false,
}: EventFloorEditorProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [initialEventLayout] = useState(() => getInitialEventLayout(overlay, readOnly));
  const [activeTool, setActiveTool] = useState<EventTool>("select");
  const [activeTemplate, setActiveTemplate] = useState(
    EVENT_FURNITURE_TEMPLATES[0]
  );
  const [eventFurniture, setEventFurniture] = useState<FloorFurniture[]>(
    initialEventLayout.eventFurniture
  );
  const [eventLabels, setEventLabels] = useState<FloorLabel[]>(
    initialEventLayout.eventLabels
  );
  const [draftRecovered, setDraftRecovered] = useState(initialEventLayout.recovered);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"furniture" | "label" | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<EditorHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [selectionArrangeOpen, setSelectionArrangeOpen] = useState(false);
  const [dragging, setDragging] = useState<{
    id: string;
    ids: string[];
    type: "furniture" | "label";
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingLocal, setSubmittingLocal] = useState(false);
  const { spaceHeld } = useSpacePan(!readOnly);
  const [presetId, setPresetId] = useState<EventLayoutPresetId>("chair-row");
  const [resizing, setResizing] = useState<{
    id: string;
    handle: ResizeHandleDirection;
    startMouseX: number;
    startMouseY: number;
  } | null>(null);
  const [rotating, setRotating] = useState<{
    id: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuides, setSnapGuides] = useState<LayoutSnapGuide[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorViewportCompact, setInspectorViewportCompact] = useState(() => (
    typeof window !== "undefined" && (window.matchMedia?.("(max-width: 1279px)").matches ?? window.innerWidth < 1280)
  ));
  const [isPanning, setIsPanning] = useState(false);
  const [pinchActive, setPinchActive] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const panMovedRef = useRef(false);
  const itemGestureActive = Boolean(dragging || resizing || rotating);
  const [validatedFurniture, setValidatedFurniture] = useState(eventFurniture);

  const canvasRef = useRef<HTMLDivElement>(null);
  const inspectorTriggerRef = useRef<HTMLElement | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const pointerGestureRef = useRef<EventPointerGesture | null>(null);
  const moveGestureRef = useRef<EventMoveGesture | null>(null);
  const gestureFrameRef = useRef<GestureFrame | null>(null);
  const gestureStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const gestureMovedRef = useRef(false);
  const suppressCanvasClickRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerIdsRef = useRef<Set<number>>(new Set());
  const resizeGestureRef = useRef<EventResizeGesture | null>(null);
  const rotateGestureRef = useRef<EventRotateGesture | null>(null);
  const pointerCaptureTargetRef = useRef<HTMLElement | null>(null);
  const intentionalCaptureReleaseIdsRef = useRef<Set<number>>(new Set());
  const pointerPressOriginRef = useRef<PointerPressOrigin>("none");
  const interactionFinishingRef = useRef(false);
  const finishInteractionRef = useRef<(reason: FinishReason, finalSample?: PointerSample) => void>(() => {});
  const pointerMoveRef = useRef<(event: PointerEvent) => void>(() => {});
  const activePointerTypeRef = useRef<string | null>(null);
  const pointerPositionsRef = useRef(new Map<number, { x: number; y: number }>());
  const pendingPreviewRef = useRef<PointerSample | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const pinchRef = useRef<PinchGesture | null>(null);
  const startPinchRef = useRef<(event: React.PointerEvent<HTMLDivElement>) => void>(() => {});
  const draftLocation = overlay.locationRef;
  const draftStorageKey = draftLocation ? eventLayoutDraftStorageKey(overlay.id, draftLocation) : null;
  const draftStateRef = useRef({ eventFurniture, eventLabels });
  const draftDirtyRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const onDraftChangeRef = useRef(onDraftChange);
  const latestFurnitureRef = useRef(eventFurniture);
  const latestLabelsRef = useRef(eventLabels);
  const flushPendingPreviewRef = useRef<() => void>(() => {});

  const setFurniturePreview = useCallback((next: FloorFurniture[]) => {
    latestFurnitureRef.current = next;
    draftDirtyRef.current = true;
    setEventFurniture(next);
  }, []);

  const setLabelsPreview = useCallback((next: FloorLabel[]) => {
    latestLabelsRef.current = next;
    draftDirtyRef.current = true;
    setEventLabels(next);
  }, []);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    draftStateRef.current = { eventFurniture, eventLabels };
    latestFurnitureRef.current = eventFurniture;
    latestLabelsRef.current = eventLabels;
  }, [eventFurniture, eventLabels]);

  useEffect(() => {
    if (!itemGestureActive) setValidatedFurniture(eventFurniture);
  }, [eventFurniture, itemGestureActive]);

  useEffect(() => {
    if (!readOnly && !itemGestureActive) onDraftChangeRef.current?.(eventFurniture, eventLabels);
  }, [eventFurniture, eventLabels, itemGestureActive, readOnly]);

  useEffect(() => {
    if (!draftStorageKey) return;
    if (!draftHydratedRef.current) {
      draftHydratedRef.current = true;
      return;
    }
    if (readOnly) return;

    draftDirtyRef.current = true;
    if (itemGestureActive) return;
    const timer = window.setTimeout(() => {
      if (!draftDirtyRef.current || !draftLocation) return;
      writeEventLayoutDraft(
        overlay.id,
        draftLocation,
        draftStateRef.current.eventFurniture,
        draftStateRef.current.eventLabels,
      );
      draftDirtyRef.current = false;
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftLocation, draftStorageKey, eventFurniture, eventLabels, itemGestureActive, overlay.id, readOnly]);

  useEffect(() => {
    if (!draftStorageKey || !draftLocation || readOnly) return;
    const flushDraft = () => {
      flushPendingPreviewRef.current();
      if (!draftDirtyRef.current) return;
      writeEventLayoutDraft(
        overlay.id,
        draftLocation,
        latestFurnitureRef.current,
        latestLabelsRef.current,
      );
      draftDirtyRef.current = false;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        finishInteractionRef.current("hidden");
        flushDraft();
      }
    };
    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("beforeunload", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("beforeunload", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushDraft();
    };
  }, [draftLocation, draftStorageKey, overlay.id, readOnly]);
  const fittedViewportKeyRef = useRef<string | null>(null);
  // ── Canvas dimensions ──────────────────────────────────────────────────
  const canvasW = floorPlan.canvasW || 800;
  const canvasH = floorPlan.canvasH || 600;
  const viewportLocationKey = `${floorPlan.buildingId}:${floorPlan.id}:${canvasW}:${canvasH}`;
  const eventContentBounds = useMemo(
    () => getFloorPlanContentBounds(floorPlan, eventFurniture, eventLabels),
    [eventFurniture, eventLabels, floorPlan],
  );
  const selectedFurnitureIds = useMemo(
    () => eventFurniture.filter((item) => selectedIds.includes(item.id)).map((item) => item.id),
    [eventFurniture, selectedIds],
  );
  const selectedFurniture = useMemo(
    () => selectedFurnitureIds.length === 1
      ? eventFurniture.find((item) => item.id === selectedFurnitureIds[0]) ?? null
      : null,
    [eventFurniture, selectedFurnitureIds],
  );
  const selectedLabel = useMemo(
    () => selectedIds.length === 1
      ? eventLabels.find((item) => item.id === selectedIds[0]) ?? null
      : null,
    [eventLabels, selectedIds],
  );
  const hasInspectorSelection = Boolean(selectedFurniture || selectedLabel);
  const mobileInspectorOpen = !readOnly && inspectorViewportCompact && inspectorOpen && hasInspectorSelection;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setInspectorViewportCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!hasInspectorSelection) setInspectorOpen(false);
  }, [hasInspectorSelection]);
  const selectionIsOneGroup = useMemo(() => {
    if (selectedFurnitureIds.length < 2) return false;
    const selectedItems = eventFurniture.filter((item) => selectedFurnitureIds.includes(item.id));
    const groupId = selectedItems[0]?.groupId;
    return Boolean(groupId && selectedItems.every((item) => item.groupId === groupId));
  }, [eventFurniture, selectedFurnitureIds]);
  const eventSelectionBounds = useMemo(
    () => selectionBounds(eventFurniture, selectedFurnitureIds),
    [eventFurniture, selectedFurnitureIds],
  );
  const layoutWarnings = useMemo(() => validateEventLayout({
    furniture: validatedFurniture,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
  }), [canvasH, canvasW, validatedFurniture]);
  const viewportBackground = floorPlan.id === "campus" && activeCampus
    ? campusGroundAppearance(activeCampus).color
    : floorPlan.backgroundColor || "var(--map-floor-corridor, #f3f4f6)";
  const baseMapScene = useMemo(() => (
    floorPlan.id === "campus" && activeCampus
      ? <ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(activeCampus)} showBuildings />
      : <ReadonlyFloorPlanScene floor={floorPlan} />
  ), [activeCampus, floorPlan]);

  const getEventPanBounds = useCallback((zoomValue: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
    const viewportWidth = rect?.width || canvasW;
    const viewportHeight = rect?.height || canvasH;
    const authoredBounds = getViewportPanBounds({
      mapWidth: canvasW,
      mapHeight: canvasH,
      viewportWidth,
      viewportHeight,
      zoom: zoomValue,
      padding: readOnly ? 0 : EVENT_EDITOR_WORKSPACE_PADDING,
      insets: readOnly && isMobileViewport ? MOBILE_EVENT_VIEWER_INSETS : undefined,
      baseScale: 1,
      zoomOrigin: "top-left",
    });
    const contentBounds = getContentPanBounds({
      contentBounds: eventContentBounds,
      viewportWidth,
      viewportHeight,
      zoom: zoomValue,
      padding: readOnly ? 12 : EVENT_EDITOR_WORKSPACE_PADDING,
    });
    return {
      minX: Math.min(authoredBounds.minX, contentBounds.minX),
      maxX: Math.max(authoredBounds.maxX, contentBounds.maxX),
      minY: Math.min(authoredBounds.minY, contentBounds.minY),
      maxY: Math.max(authoredBounds.maxY, contentBounds.maxY),
    };
  }, [canvasH, canvasW, eventContentBounds, readOnly]);

  const clampEventPan = useCallback((point: { x: number; y: number }, zoomValue: number) =>
    clampViewportPan(point, getEventPanBounds(zoomValue)), [getEventPanBounds]);

  const {
    zoom,
    pan,
    currentRef: viewportCurrentRef,
    targetRef: viewportTargetRef,
    animateTo: animateViewportTo,
    setImmediateTransform: setImmediateViewport,
    cancelMotion: cancelViewportMotion,
  } = useEventViewportMotion({
    initialZoom: 1,
    initialPan: { x: 0, y: 0 },
    clampPan: clampEventPan,
  });

  const effectiveTool: EventTool = isPanning || pinchActive || (spaceHeld && !itemGestureActive) ? "pan" : activeTool;
  const panStatus = isPanning || pinchActive
    ? "Panning"
    : effectiveTool === "pan"
      ? spaceHeld ? "Pan · Space held" : "Pan"
      : "";

  const beginTransformGesture = useCallback((clientX?: number, clientY?: number) => {
    cancelViewportMotion();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const displayed = viewportCurrentRef.current;
    setImmediateViewport(displayed);
    const frame: GestureFrame = {
      left: rect.left,
      top: rect.top,
      zoom: displayed.zoom,
      pan: { ...displayed.pan },
    };
    gestureFrameRef.current = frame;
    gestureStartClientRef.current = Number.isFinite(clientX) && Number.isFinite(clientY)
      ? { x: clientX as number, y: clientY as number }
      : null;
    gestureMovedRef.current = false;
    return frame;
  }, [cancelViewportMotion, setImmediateViewport, viewportCurrentRef]);

  const getEventMinZoom = useCallback(() => {
    if (!readOnly) return EVENT_EDITOR_MIN_ZOOM;
    const rect = canvasRef.current?.getBoundingClientRect();
    return getViewportFitZoom({
      mapWidth: canvasW,
      mapHeight: canvasH,
      viewportWidth: rect?.width || canvasW,
      viewportHeight: rect?.height || canvasH,
    });
  }, [canvasH, canvasW, readOnly]);

  const fitViewportToContent = useCallback((animated = false) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    const next = fitEventViewport({
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      contentBounds: eventContentBounds,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      padding: typeof window !== "undefined" && window.innerWidth < 768 ? 24 : 48,
      minZoom: getEventMinZoom(),
      maxZoom: EVENT_MAX_ZOOM,
    });
    const transform = { zoom: next.zoom, pan: clampEventPan(next.pan, next.zoom) };
    if (animated) animateViewportTo(transform, 180);
    else setImmediateViewport(transform);
    fittedViewportKeyRef.current = viewportLocationKey;
    return true;
  }, [animateViewportTo, canvasH, canvasW, clampEventPan, eventContentBounds, getEventMinZoom, setImmediateViewport, viewportLocationKey]);

  useEffect(() => {
    if (fittedViewportKeyRef.current === viewportLocationKey) return;
    fitViewportToContent();
  }, [fitViewportToContent, viewportLocationKey]);

  // ── History management ─────────────────────────────────────────────────
  const pushHistory = useCallback(
    (furniture: FloorFurniture[], labels: FloorLabel[]) => {
      const entry: EditorHistoryEntry = { eventFurniture: furniture, eventLabels: labels };
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        return [...trimmed, entry];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setEventFurniture(prev.eventFurniture);
    setEventLabels(prev.eventLabels);
    setHistoryIndex((prev) => prev - 1);
    setSelectedId(null);
    setSelectedType(null);
    setSelectedIds([]);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setEventFurniture(next.eventFurniture);
    setEventLabels(next.eventLabels);
    setHistoryIndex((prev) => prev + 1);
    setSelectedId(null);
    setSelectedType(null);
    setSelectedIds([]);
  }, [history, historyIndex]);

  // Initialize history
  useEffect(() => {
    if (history.length === 0) {
      pushHistory(eventFurniture, eventLabels);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Furniture placement ────────────────────────────────────────────────
  const placeFurniture = useCallback(
    (template: (typeof EVENT_FURNITURE_TEMPLATES)[number], x: number, y: number) => {
      if (readOnly) return;
      const newFurniture = constrainFurnitureToFloor(
        eventFurnitureFromTemplate(template, x, y, genId()),
        canvasW,
        canvasH,
      );
      const updated = [...eventFurniture, newFurniture];
      setEventFurniture(updated);
      pushHistory(updated, eventLabels);
      setSelectedId(newFurniture.id);
      setSelectedType("furniture");
      setSelectedIds([newFurniture.id]);
    },
    [canvasH, canvasW, eventFurniture, eventLabels, pushHistory, readOnly]
  );

  // ── Label placement ────────────────────────────────────────────────────
  const placeLabel = useCallback(
    (x: number, y: number) => {
      if (readOnly) return;
      const newLabel: FloorLabel = {
        id: genId(),
        x,
        y,
        text: "Event Label",
        fontSize: 14,
        color: "#1f2937",
        rotation: 0,
        align: "left",
      };
      const updated = [...eventLabels, newLabel];
      setEventLabels(updated);
      pushHistory(eventFurniture, updated);
      setSelectedId(newLabel.id);
      setSelectedType("label");
      setSelectedIds([newLabel.id]);
    },
    [eventFurniture, eventLabels, pushHistory, readOnly]
  );

  // ── Delete selected ────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (readOnly) return;
    const ids = selectedIds.length > 0 ? new Set(selectedIds) : selectedId ? new Set([selectedId]) : new Set<string>();
    if (ids.size === 0) return;
    const deletableFurnitureIds = new Set(eventFurniture
      .filter((item) => ids.has(item.id) && !item.locked)
      .map((item) => item.id));
    const deletableLabelIds = new Set(eventLabels
      .filter((label) => ids.has(label.id) && !label.locked)
      .map((label) => label.id));
    if (deletableFurnitureIds.size === 0 && deletableLabelIds.size === 0) return;
    const updated = eventFurniture.filter((item) => !deletableFurnitureIds.has(item.id));
    const updatedLabels = eventLabels.filter((label) => !deletableLabelIds.has(label.id));
    setEventFurniture(updated);
    setEventLabels(updatedLabels);
    pushHistory(updated, updatedLabels);
    setSelectedId(null);
    setSelectedType(null);
    setSelectedIds([]);
  }, [selectedId, selectedType, selectedIds, eventFurniture, eventLabels, pushHistory, readOnly]);

  // ── Canvas click handler ───────────────────────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const pressOrigin = pointerPressOriginRef.current;
      pointerPressOriginRef.current = "none";
      if (pressOrigin !== "none" && pressOrigin !== "blank") return;
      if (activeTool === "pan" || spaceHeld) return;
      if (dragging || resizing || rotating) return;
      if (suppressCanvasClickRef.current) {
        suppressCanvasClickRef.current = false;
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("[data-event-editor-chrome]")) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom - pan.x / zoom;
      const y = (e.clientY - rect.top) / zoom - pan.y / zoom;

      if (activeTool === "furniture") {
        if (target?.closest("[data-event-item]")) return;
        // Place the currently selected event template centered on the click
        placeFurniture(activeTemplate, x - activeTemplate.width / 2, y - activeTemplate.height / 2);
      } else if (activeTool === "text") {
        if (target?.closest("[data-event-item]")) return;
        placeLabel(x, y);
      } else if (activeTool === "select") {
        if (!target?.closest("[data-event-item]")) {
          setSelectedId(null);
          setSelectedType(null);
          setSelectedIds([]);
        }
      }
    },
    [activeTool, zoom, pan, placeFurniture, placeLabel, dragging, resizing, rotating, activeTemplate, readOnly, spaceHeld]
  );

  const handleCanvasDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly || activeTool !== "furniture") return;
    if (Array.from(e.dataTransfer.types).includes(EVENT_ASSET_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, [activeTool, readOnly]);

  const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly || activeTool !== "furniture") return;
    const assetKey = e.dataTransfer.getData(EVENT_ASSET_DRAG_TYPE) || e.dataTransfer.getData("text/plain");
    if (!assetKey || !EVENT_FURNITURE_TEMPLATES.some((template) => template.type === assetKey || template.assetKey === assetKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const safeLeft = Number.isFinite(rect.left) ? rect.left : 0;
    const safeTop = Number.isFinite(rect.top) ? rect.top : 0;
    const clientX = Number.isFinite(e.clientX) ? e.clientX : safeLeft + (Number.isFinite(rect.width) ? rect.width / 2 : canvasW / 2);
    const clientY = Number.isFinite(e.clientY) ? e.clientY : safeTop + (Number.isFinite(rect.height) ? rect.height / 2 : canvasH / 2);
    const x = (clientX - safeLeft) / safeZoom - pan.x / safeZoom;
    const y = (clientY - safeTop) / safeZoom - pan.y / safeZoom;
    const template = getEventFurnitureTemplate(assetKey);
    placeFurniture(template, x - template.width / 2, y - template.height / 2);
  }, [activeTool, pan, placeFurniture, readOnly, zoom]);

  const getCanvasWorldPoint = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const gestureFrame = gestureFrameRef.current;
    if (gestureFrame) return clientToEventWorld({ x: clientX, y: clientY }, gestureFrame);
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return {
      x: (clientX - rect.left - pan.x) / safeZoom,
      y: (clientY - rect.top - pan.y) / safeZoom,
    };
  }, [pan, zoom]);

  const hasPassedGestureThreshold = useCallback((clientX: number, clientY: number) => {
    const start = gestureStartClientRef.current;
    return !start || Math.hypot(clientX - start.x, clientY - start.y) >= 3;
  }, []);

  // ── Mouse drag for moving items ────────────────────────────────────────
  const handleItemMouseDown = useCallback(
    (e: React.PointerEvent, id: string, type: "furniture" | "label") => {
      e.stopPropagation();
      if (readOnly) return;
      if (e.button === 2) return;
      if (e.button === 1) {
        e.preventDefault();
        cancelViewportMotion();
        const currentPan = viewportCurrentRef.current.pan;
        panRef.current = { sx: e.clientX, sy: e.clientY, px: currentPan.x, py: currentPan.y };
        gestureStartClientRef.current = { x: e.clientX, y: e.clientY };
        gestureMovedRef.current = false;
        pointerGestureRef.current = "pan";
        pointerPressOriginRef.current = "pan";
        panMovedRef.current = false;
        setIsPanning(false);
        return;
      }
      if (activeTool === "pan" || spaceHeld) {
        e.preventDefault();
        cancelViewportMotion();
        gestureFrameRef.current = null;
        const currentPan = viewportCurrentRef.current.pan;
        panRef.current = { sx: e.clientX, sy: e.clientY, px: currentPan.x, py: currentPan.y };
        gestureStartClientRef.current = { x: e.clientX, y: e.clientY };
        gestureMovedRef.current = false;
        panMovedRef.current = false;
        pointerPressOriginRef.current = "pan";
        pointerGestureRef.current = "pan";
        setIsPanning(false);
        return;
      }
      if (activeTool !== "select" && activeTool !== "furniture" && !(activeTool === "text" && type === "label")) return;
      e.preventDefault();

      if (e.shiftKey) {
        const nextIds = selectedIds.includes(id)
          ? selectedIds.filter((selected) => selected !== id)
          : [...selectedIds, id];
        setSelectedIds(nextIds);
        setSelectedId(nextIds.at(-1) ?? null);
        setSelectedType(nextIds.length > 0 ? type : null);
        return;
      }

      let item =
        type === "furniture"
          ? eventFurniture.find((f) => f.id === id)
          : eventLabels.find((l) => l.id === id);
      if (!item) return;

      if (item.locked) {
        setSelectedId(id);
        setSelectedType(type);
        setSelectedIds([id]);
        setInspectorOpen(false);
        return;
      }

      const frame = beginTransformGesture(e.clientX, e.clientY);
      if (!frame) return;

      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const pointer = clientToEventWorld({ x: e.clientX, y: e.clientY }, frame);
      const mouseX = pointer.x;
      const mouseY = pointer.y;

      const groupId = type === "furniture" ? (item as FloorFurniture).groupId : undefined;
      const unlockedSelectedIds = selectedIds.filter((selected) => {
        const selectedFurniture = eventFurniture.find((candidate) => candidate.id === selected);
        const selectedLabel = eventLabels.find((candidate) => candidate.id === selected);
        return !selectedFurniture?.locked && !selectedLabel?.locked;
      });
      let dragIds = type === "furniture" && groupId
        ? eventFurniture.filter((candidate) => candidate.groupId === groupId && !candidate.locked).map((candidate) => candidate.id)
        : selectedIds.includes(id) ? unlockedSelectedIds : [id];

      let furnitureAtStart = eventFurniture;
      if (e.altKey && type === "furniture") {
        const sourceItems = eventFurniture.filter((candidate) => dragIds.includes(candidate.id) && !candidate.locked);
        if (sourceItems.length === 0) return;
        const duplicates = sourceItems.map((source) => ({
          ...source,
          id: genId("event-item"),
          x: source.x + 24,
          y: source.y + 24,
          groupId: undefined,
        }));
        const nextFurniture = [...eventFurniture, ...duplicates];
        latestFurnitureRef.current = nextFurniture;
        setEventFurniture(nextFurniture);
        pushHistory(nextFurniture, eventLabels);
        furnitureAtStart = nextFurniture;
        dragIds = duplicates.map((duplicate) => duplicate.id);
        item = duplicates[sourceItems.findIndex((source) => source.id === id)] ?? duplicates[0];
      }

      moveGestureRef.current = {
        anchorId: item.id,
        anchorType: type,
        ids: dragIds,
        startPointer: { x: mouseX, y: mouseY },
        furnitureOrigins: furnitureAtStart.filter((candidate) => dragIds.includes(candidate.id)).map((candidate) => ({ ...candidate })),
        labelOrigins: eventLabels.filter((candidate) => dragIds.includes(candidate.id)).map((candidate) => ({ ...candidate })),
        allFurnitureAtStart: furnitureAtStart.map((candidate) => ({ ...candidate })),
        frame,
      };

      setDragging({
        id,
        ids: dragIds,
        type,
        offsetX: mouseX - item.x,
        offsetY: mouseY - item.y,
      });
      setSelectedId(id);
      setSelectedType(type);
      setSelectedIds(dragIds);
      setInspectorOpen(false);
      setSnapGuides([]);
      pointerGestureRef.current = "drag";
    },
    [activeTool, beginTransformGesture, cancelViewportMotion, eventFurniture, eventLabels, pushHistory, readOnly, spaceHeld, selectedIds, viewportCurrentRef]
  );

  const applyItemPreview = useCallback(
    (e: PointerSample) => {
      if (readOnly) return;
      if (panRef.current) return;

      const point = gestureFrameRef.current
        ? clientToEventWorld({ x: e.clientX, y: e.clientY }, gestureFrameRef.current)
        : getCanvasWorldPoint(e.clientX, e.clientY);
      if (!point) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const { x: mouseX, y: mouseY } = point;
      const pastThreshold = hasPassedGestureThreshold(e.clientX, e.clientY);
      const rotateGesture = rotateGestureRef.current;
      if (rotateGesture) {
        if (!pastThreshold) return;
        setTransforming(true);
        gestureMovedRef.current = true;
        suppressCanvasClickRef.current = true;
        setSnapGuides([]);
        const currentAngle = Math.atan2(mouseY - rotateGesture.centerY, mouseX - rotateGesture.centerX);
        let deltaDegrees = (currentAngle - rotateGesture.startAngle) * (180 / Math.PI);
        if (deltaDegrees > 180) deltaDegrees -= 360;
        if (deltaDegrees < -180) deltaDegrees += 360;
        const rawRotation = rotateGesture.startRotation + deltaDegrees;
        const normalizedRotation = ((rawRotation % 360) + 360) % 360;
        const nextRotation = e.shiftKey
          ? Math.round(normalizedRotation / 15) * 15
          : Math.round(normalizedRotation * 100) / 100;
        const nextFurniture = latestFurnitureRef.current.map((item) => item.id === rotateGesture.id
          ? { ...item, rotation: nextRotation % 360 }
          : item);
        setFurniturePreview(nextFurniture);
        return;
      }
      const resizeGesture = resizeGestureRef.current;
      if (resizeGesture) {
        if (!pastThreshold) return;
        setTransforming(true);
        gestureMovedRef.current = true;
        suppressCanvasClickRef.current = true;
        setSnapGuides([]);
        const nextFurniture = latestFurnitureRef.current.map((item) => item.id === resizeGesture.id
          ? resizeFurnitureWithinFloor(
            resizeGesture.origin,
            resizeGesture.handle,
            mouseX - resizeGesture.startMouseX,
            mouseY - resizeGesture.startMouseY,
            canvasW,
            canvasH,
            e.shiftKey,
          )
          : item);
        setFurniturePreview(nextFurniture);
        return;
      }
      const gesture = moveGestureRef.current;
      if (!gesture) return;
      if (!pastThreshold) return;
      setTransforming(true);
      const anchorFurniture = gesture.furnitureOrigins.find((item) => item.id === gesture.anchorId);
      const anchorLabel = gesture.labelOrigins.find((item) => item.id === gesture.anchorId);
      const anchor = anchorFurniture ?? (anchorLabel ? {
        id: anchorLabel.id,
        x: anchorLabel.x,
        y: anchorLabel.y,
        width: 0,
        height: anchorLabel.fontSize || 14,
      } : null);
      if (!anchor) return;
      const movingItems = [
        ...gesture.furnitureOrigins,
        ...gesture.labelOrigins.map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
          width: 0,
          height: item.fontSize || 14,
        })),
      ];
      const movement = resolveLayoutMoveFromSnapshot({
        anchor,
        movingItems,
        furnitureItems: gesture.anchorType === "furniture" ? gesture.allFurnitureAtStart : [anchor],
        selectedIds: gesture.ids,
        startPointer: gesture.startPointer,
        bounds: { width: canvasW, height: canvasH },
        grid: floorPlan.gridSize || 0,
        threshold: gesture.anchorType === "furniture"
          ? 6 / Math.max(0.25, gesture.frame.zoom)
          : 0,
        snapToGrid: gesture.anchorType === "furniture" && snapEnabled,
        snapEnabled,
      }, { x: mouseX, y: mouseY });
      gestureMovedRef.current = true;
      suppressCanvasClickRef.current = true;
      setSnapGuides(movement.guides);
      const nextFurniture = latestFurnitureRef.current.map((item) => {
        const origin = gesture.furnitureOrigins.find((candidate) => candidate.id === item.id);
        return origin ? { ...item, x: origin.x + movement.delta.x, y: origin.y + movement.delta.y } : item;
      });
      const nextLabels = latestLabelsRef.current.map((item) => {
        const origin = gesture.labelOrigins.find((candidate) => candidate.id === item.id);
        return origin ? { ...item, x: origin.x + movement.delta.x, y: origin.y + movement.delta.y } : item;
      });
      setFurniturePreview(nextFurniture);
      setLabelsPreview(nextLabels);
    },
    [floorPlan.gridSize, getCanvasWorldPoint, hasPassedGestureThreshold, readOnly, canvasW, canvasH, setFurniturePreview, setLabelsPreview, snapEnabled]
  );

  const cancelPendingPreview = useCallback(() => {
    if (previewFrameRef.current !== null) {
      if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(previewFrameRef.current);
      } else if (typeof window !== "undefined") {
        window.clearTimeout(previewFrameRef.current);
      }
      previewFrameRef.current = null;
    }
    pendingPreviewRef.current = null;
  }, []);

  const flushPendingPreview = useCallback(() => {
    const pending = pendingPreviewRef.current;
    cancelPendingPreview();
    if (pending) applyItemPreview(pending);
  }, [applyItemPreview, cancelPendingPreview]);

  const handlePointerPreview = useCallback((e: PointerSample) => {
    const sample: PointerSample = {
      clientX: e.clientX,
      clientY: e.clientY,
      shiftKey: Boolean(e.shiftKey),
    };
    lastPointerRef.current = { x: sample.clientX, y: sample.clientY };
    pendingPreviewRef.current = sample;
    if (previewFrameRef.current !== null) return;

    // Apply the leading sample immediately so the grabbed item never feels
    // delayed. Coalesce any additional pointer samples until the next frame.
    pendingPreviewRef.current = null;
    applyItemPreview(sample);
    if (typeof window === "undefined") return;
    const flush = () => {
      previewFrameRef.current = null;
      const latest = pendingPreviewRef.current;
      pendingPreviewRef.current = null;
      if (latest) applyItemPreview(latest);
    };
    previewFrameRef.current = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(flush)
      : window.setTimeout(flush, 16);
  }, [applyItemPreview]);

  const handleMouseUp = useCallback(() => {
    flushPendingPreview();
    const activeGesture = pointerGestureRef.current;
    const currentFurniture = latestFurnitureRef.current;
    const currentLabels = latestLabelsRef.current;
    let geometryChanged = false;
    const moveGesture = moveGestureRef.current;
    if (activeGesture === "drag" && moveGesture) {
      geometryChanged = moveGesture.furnitureOrigins.some((origin) => {
        const current = currentFurniture.find((item) => item.id === origin.id);
        return Boolean(current && (current.x !== origin.x || current.y !== origin.y));
      }) || moveGesture.labelOrigins.some((origin) => {
        const current = currentLabels.find((label) => label.id === origin.id);
        return Boolean(current && (current.x !== origin.x || current.y !== origin.y));
      });
    } else if (activeGesture === "resize" && resizeGestureRef.current) {
      const origin = resizeGestureRef.current.origin;
      const current = currentFurniture.find((item) => item.id === origin.id);
      geometryChanged = Boolean(current && (
        current.x !== origin.x
        || current.y !== origin.y
        || current.width !== origin.width
        || current.height !== origin.height
      ));
    } else if (activeGesture === "rotate" && rotateGestureRef.current) {
      const current = currentFurniture.find((item) => item.id === rotateGestureRef.current?.id);
      geometryChanged = Boolean(current && current.rotation !== rotateGestureRef.current.startRotation);
    }
    if (!readOnly && gestureMovedRef.current && geometryChanged) {
      pushHistory(currentFurniture, currentLabels);
    }
    resizeGestureRef.current = null;
    rotateGestureRef.current = null;
    moveGestureRef.current = null;
    pointerGestureRef.current = null;
    gestureFrameRef.current = null;
    gestureStartClientRef.current = null;
    gestureMovedRef.current = false;
    lastPointerRef.current = null;
    setDragging(null);
    setResizing(null);
    setRotating(null);
    setTransforming(false);
    setSnapGuides([]);
  }, [flushPendingPreview, pushHistory, readOnly]);

  useEffect(() => cancelPendingPreview, [cancelPendingPreview]);

  useEffect(() => {
    flushPendingPreviewRef.current = flushPendingPreview;
    return () => {
      flushPendingPreviewRef.current = () => {};
    };
  }, [flushPendingPreview]);

  const handleResizeStart = useCallback((e: React.PointerEvent, item: FloorFurniture, handle: ResizeHandleDirection) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || item.locked || (activeTool !== "select" && activeTool !== "furniture") || spaceHeld) return;
    const frame = beginTransformGesture(e.clientX, e.clientY);
    if (!frame) return;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    const point = getCanvasWorldPoint(e.clientX, e.clientY);
    if (!point) return;
    const gesture: EventResizeGesture = {
      id: item.id,
      handle,
      startMouseX: point.x,
      startMouseY: point.y,
      origin: { ...item },
    };
    setSelectedId(item.id);
    setSelectedType("furniture");
    setSelectedIds([item.id]);
    setResizing({
      id: item.id,
      handle,
      startMouseX: point.x,
      startMouseY: point.y,
    });
    resizeGestureRef.current = gesture;
    pointerGestureRef.current = "resize";
  }, [activeTool, beginTransformGesture, getCanvasWorldPoint, readOnly, spaceHeld]);

  const handleRotateStart = useCallback((e: React.PointerEvent, item: FloorFurniture) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || item.locked || (activeTool !== "select" && activeTool !== "furniture") || spaceHeld) return;
    const frame = beginTransformGesture(e.clientX, e.clientY);
    if (!frame) return;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    const point = getCanvasWorldPoint(e.clientX, e.clientY);
    if (!point) return;
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    setSelectedId(item.id);
    setSelectedType("furniture");
    setSelectedIds([item.id]);
    const gesture: EventRotateGesture = {
      id: item.id,
      centerX,
      centerY,
      startAngle: Math.atan2(point.y - centerY, point.x - centerX),
      startRotation: item.rotation || 0,
    };
    rotateGestureRef.current = gesture;
    setRotating(gesture);
    pointerGestureRef.current = "rotate";
  }, [activeTool, beginTransformGesture, getCanvasWorldPoint, readOnly, spaceHeld]);

  const nudgeSelection = useCallback((dx: number, dy: number) => {
    if (readOnly || selectedIds.length === 0) return;
    const movableFurnitureIds = eventFurniture
      .filter((item) => selectedFurnitureIds.includes(item.id) && !item.locked)
      .map((item) => item.id);
    const nextFurniture = nudgeItems(eventFurniture, movableFurnitureIds, dx, dy, { width: canvasW, height: canvasH });
    const labelLayouts = eventLabels.map((label) => ({ ...label, width: 0, height: label.fontSize || 14 }));
    const nextLabelLayouts = nudgeItems(labelLayouts, selectedIds, dx, dy, { width: canvasW, height: canvasH });
    const nextLabels = nextLabelLayouts.map(({ width: _width, height: _height, ...label }) => label);
    setEventFurniture(nextFurniture);
    setEventLabels(nextLabels);
    pushHistory(nextFurniture, nextLabels);
  }, [canvasH, canvasW, eventFurniture, eventLabels, pushHistory, readOnly, selectedFurnitureIds, selectedIds]);

  const rotateSelection = useCallback(() => {
    if (readOnly || selectedFurnitureIds.length === 0) return;
    const selected = new Set(selectedFurnitureIds);
    const nextFurniture = eventFurniture.map((item) => selected.has(item.id)
      ? item.locked ? item : { ...item, rotation: ((item.rotation || 0) + 15) % 360 }
      : item);
    if (nextFurniture.every((item, index) => item === eventFurniture[index])) return;
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedFurnitureIds]);

  const updateSelectedFurniture = useCallback((changes: Partial<FloorFurniture>, options?: { allowLocked?: boolean }) => {
    if (readOnly || selectedFurnitureIds.length !== 1) return;
    if (selectedFurniture?.locked && !options?.allowLocked) return;
    const selected = new Set(selectedFurnitureIds);
    const nextFurniture = eventFurniture.map((item) => selected.has(item.id)
      ? { ...item, ...changes }
      : item);
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedFurniture, selectedFurnitureIds]);

  const updateSelectedLabel = useCallback((changes: Partial<FloorLabel>, options?: { allowLocked?: boolean }) => {
    if (readOnly || !selectedLabel) return;
    if (selectedLabel.locked && !options?.allowLocked) return;
    const nextLabels = eventLabels.map((item) => item.id === selectedLabel.id ? { ...item, ...changes } : item);
    setEventLabels(nextLabels);
    pushHistory(eventFurniture, nextLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedLabel]);

  const toggleSelectedLock = useCallback(() => {
    if (!selectedFurniture) return;
    updateSelectedFurniture({ locked: !selectedFurniture.locked }, { allowLocked: true });
  }, [selectedFurniture, updateSelectedFurniture]);

  const toggleSelectedLabelLock = useCallback(() => {
    if (!selectedLabel) return;
    updateSelectedLabel({ locked: !selectedLabel.locked }, { allowLocked: true });
  }, [selectedLabel, updateSelectedLabel]);

  const toggleSelectedVisibility = useCallback(() => {
    if (!selectedFurniture) return;
    updateSelectedFurniture({ visible: selectedFurniture.visible === false }, { allowLocked: true });
  }, [selectedFurniture, updateSelectedFurniture]);

  const updateSelectedLayer = useCallback((direction: "front" | "back") => {
    if (readOnly || selectedFurnitureIds.length === 0) return;
    const selected = new Set(selectedFurnitureIds);
    const orderValues = eventFurniture.map((item, index) => item.zOrder ?? index);
    const edge = direction === "front" ? Math.max(...orderValues, 0) + 1 : Math.min(...orderValues, 0) - selectedFurnitureIds.length;
    const nextFurniture = eventFurniture.map((item) => selected.has(item.id)
      ? { ...item, zOrder: edge + selectedFurnitureIds.indexOf(item.id) }
      : item);
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedFurnitureIds]);

  const groupSelection = useCallback(() => {
    if (readOnly || selectedFurnitureIds.length < 2) return;
    const groupId = genId("event-group");
    const selected = new Set(selectedFurnitureIds);
    const nextFurniture = eventFurniture.map((item) => selected.has(item.id)
      ? { ...item, groupId }
      : item);
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedFurnitureIds]);

  const ungroupSelection = useCallback(() => {
    if (readOnly || selectedFurnitureIds.length === 0) return;
    const selected = new Set(selectedFurnitureIds);
    const nextFurniture = eventFurniture.map((item) => selected.has(item.id)
      ? { ...item, groupId: undefined }
      : item);
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedFurnitureIds]);

  const duplicateSelection = useCallback(() => {
    if (readOnly || selectedIds.length === 0) return;
    const selected = new Set(selectedIds);
    const duplicates = [
      ...eventFurniture.filter((item) => selected.has(item.id)).map((item) => ({ ...item, id: genId("event-item"), x: item.x + 24, y: item.y + 24, groupId: undefined })),
    ];
    const labelDuplicates = eventLabels.filter((label) => selected.has(label.id)).map((label) => ({ ...label, id: genId("event-label"), x: label.x + 24, y: label.y + 24 }));
    if (duplicates.length === 0 && labelDuplicates.length === 0) return;
    const nextFurniture = [...eventFurniture, ...duplicates];
    const nextLabels = [...eventLabels, ...labelDuplicates];
    setEventFurniture(nextFurniture);
    setEventLabels(nextLabels);
    pushHistory(nextFurniture, nextLabels);
    const ids = [...duplicates.map((item) => item.id), ...labelDuplicates.map((label) => label.id)];
    setSelectedIds(ids);
    setSelectedId(ids[0] ?? null);
    setSelectedType(duplicates.length > 0 ? "furniture" : "label");
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedIds]);

  const applyFurnitureLayout = useCallback((action: LayoutAction) => {
    if (readOnly || selectedFurnitureIds.length < 2) return;
    const nextFurniture = applyLayoutAction(eventFurniture, selectedFurnitureIds, action);
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedFurnitureIds]);

  const addPreset = useCallback((requestedPresetId: EventLayoutPresetId = presetId) => {
    if (readOnly) return;
    const preset = getEventLayoutPreset(requestedPresetId);
    const created = preset.create({ x: Math.max(20, (canvasW - 180) / 2), y: Math.max(20, (canvasH - 150) / 2) }, () => genId("event-item"));
    const nextFurniture = [...eventFurniture, ...created];
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
    const ids = created.map((item) => item.id);
    setSelectedIds(ids);
    setSelectedId(ids[0] ?? null);
    setSelectedType("furniture");
  }, [canvasH, canvasW, eventFurniture, eventLabels, presetId, pushHistory, readOnly]);

  const selectTool = useCallback((tool: EventTool) => {
    setActiveTool(tool);
    setPresetMenuOpen(false);
    setSelectionArrangeOpen(false);
  }, []);

  useEffect(() => {
    if (selectedFurnitureIds.length < 2) setSelectionArrangeOpen(false);
  }, [selectedFurnitureIds.length]);

  // ── Pan (middle mouse or pan tool) ─────────────────────────────────────
  const handlePanStart = useCallback(
    (e: React.PointerEvent, forceTouch = false) => {
      if (activeTool === "pan" || spaceHeld || e.button === 1 || forceTouch) {
        e.preventDefault();
        cancelViewportMotion();
        const currentPan = viewportCurrentRef.current.pan;
        panRef.current = { sx: e.clientX, sy: e.clientY, px: currentPan.x, py: currentPan.y };
        gestureStartClientRef.current = { x: e.clientX, y: e.clientY };
        gestureMovedRef.current = false;
        panMovedRef.current = false;
        pointerGestureRef.current = "pan";
        setIsPanning(false);
      }
    },
    [activeTool, cancelViewportMotion, spaceHeld, viewportCurrentRef]
  );

  const handlePanMove = useCallback(
    (e: Pick<PointerEvent, "clientX" | "clientY">) => {
      if (!panRef.current) return;
      if (gestureStartClientRef.current && Math.hypot(
        e.clientX - gestureStartClientRef.current.x,
        e.clientY - gestureStartClientRef.current.y,
      ) >= 3) {
        gestureMovedRef.current = true;
        panMovedRef.current = true;
        setIsPanning(true);
        suppressCanvasClickRef.current = true;
        pointerPressOriginRef.current = "pan";
      }
      setImmediateViewport({ zoom, pan: clampEventPan({
        x: panRef.current.px + (e.clientX - panRef.current.sx),
        y: panRef.current.py + (e.clientY - panRef.current.sy),
      }, zoom) });
    },
    [clampEventPan, setImmediateViewport, zoom]
  );

  const handlePanEnd = useCallback(() => {
    panRef.current = null;
    if (pointerGestureRef.current === "pan") pointerGestureRef.current = null;
    panMovedRef.current = false;
    setIsPanning(false);
  }, []);

  const capturePointer = useCallback((pointerId: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    canvas.setPointerCapture?.(pointerId);
    pointerCaptureTargetRef.current = canvas;
    activePointerIdsRef.current.add(pointerId);
    if (activePointerIdRef.current === null) activePointerIdRef.current = pointerId;
    return true;
  }, []);

  const finishInteraction = useCallback((reason: FinishReason, finalSample?: PointerSample) => {
    if (interactionFinishingRef.current) return;
    interactionFinishingRef.current = true;
    try {
      if (reason === "pinch-transfer") {
        const firstId = activePointerIdRef.current;
        const gesture = pointerGestureRef.current;
        if (gesture && gesture !== "pan" && gesture !== "pinch" && firstId !== null) {
          const point = pointerPositionsRef.current.get(firstId);
          if (point) handlePointerPreview({ clientX: point.x, clientY: point.y, shiftKey: false });
          flushPendingPreview();
          handleMouseUp();
        } else if (gesture === "pan") {
          handlePanEnd();
        }
        panRef.current = null;
        pointerGestureRef.current = null;
        cancelViewportMotion();
        return;
      }

      const gesture = pointerGestureRef.current;
      if (finalSample && gesture === "pan") handlePanMove(finalSample);
      else if (finalSample && gesture && gesture !== "pinch") handlePointerPreview(finalSample);
      if (reason === "escape") {
        const moveGesture = moveGestureRef.current;
        if (moveGesture) {
          setFurniturePreview(latestFurnitureRef.current.map((item) => moveGesture.furnitureOrigins.find((origin) => origin.id === item.id) ?? item));
          setLabelsPreview(latestLabelsRef.current.map((label) => moveGesture.labelOrigins.find((origin) => origin.id === label.id) ?? label));
        }
        const resizeGesture = resizeGestureRef.current;
        if (resizeGesture) setFurniturePreview(latestFurnitureRef.current.map((item) => item.id === resizeGesture.id ? resizeGesture.origin : item));
        const rotateGesture = rotateGestureRef.current;
        if (rotateGesture) setFurniturePreview(latestFurnitureRef.current.map((item) => item.id === rotateGesture.id ? { ...item, rotation: rotateGesture.startRotation } : item));
        cancelPendingPreview();
      } else if (reason === "resize" || reason === "cancel" || reason === "lostcapture" || reason === "blur" || reason === "hidden") {
        cancelPendingPreview();
      } else if (gesture && gesture !== "pan" && gesture !== "pinch") {
        flushPendingPreview();
      }

      if (gesture === "pan" || gesture === "pinch") handlePanEnd();
      else if (gesture) handleMouseUp();
      pinchRef.current = null;
      pointerGestureRef.current = null;
      panRef.current = null;
      activePointerTypeRef.current = null;
      pointerPositionsRef.current.clear();
      const pointerIds = [...activePointerIdsRef.current];
      const captureTarget = pointerCaptureTargetRef.current;
      activePointerIdsRef.current.clear();
      activePointerIdRef.current = null;
      pointerCaptureTargetRef.current = null;
      for (const pointerId of pointerIds) {
        if (!captureTarget?.hasPointerCapture?.(pointerId)) continue;
        intentionalCaptureReleaseIdsRef.current.add(pointerId);
        try {
          captureTarget.releasePointerCapture?.(pointerId);
        } catch {
          // Browsers may already have ended capture between the check and release.
        }
      }
      gestureFrameRef.current = null;
      gestureStartClientRef.current = null;
      setIsPanning(false);
      setPinchActive(false);
      panMovedRef.current = false;
      if (reason === "escape" || reason === "cancel" || reason === "lostcapture" || reason === "blur" || reason === "hidden" || reason === "resize") {
        pointerPressOriginRef.current = "none";
        suppressCanvasClickRef.current = false;
      }
    } finally {
      interactionFinishingRef.current = false;
    }
  }, [cancelPendingPreview, cancelViewportMotion, flushPendingPreview, handleMouseUp, handlePanEnd, handlePanMove, handlePointerPreview, setFurniturePreview, setLabelsPreview]);

  useLayoutEffect(() => {
    finishInteractionRef.current = finishInteraction;
    return () => {
      finishInteractionRef.current = () => {};
    };
  }, [finishInteraction]);

  useEffect(() => {
    if (!interactionCommitRef) return;
    interactionCommitRef.current = () => {
      finishInteractionRef.current("switch");
      return {
        eventFurniture: latestFurnitureRef.current,
        eventLabels: latestLabelsRef.current,
      };
    };
    return () => {
      if (interactionCommitRef.current) interactionCommitRef.current = null;
    };
  }, [interactionCommitRef]);

  const beginPointerGesture = useCallback((e: React.PointerEvent<HTMLElement>, start: () => void, origin: PointerPressOrigin) => {
    if (origin === "chrome" || (e.pointerType !== "touch" && e.button !== 0 && e.button !== 1)) return;
    if (activePointerIdsRef.current.has(e.pointerId)) return;
    if (activePointerIdsRef.current.size > 0 && activePointerTypeRef.current !== "touch") return;
    if (e.pointerType !== "touch" && activePointerIdsRef.current.size > 0) return;
    if (e.pointerType === "touch" && activePointerIdsRef.current.size >= 2) return;
    suppressCanvasClickRef.current = false;
    pointerPressOriginRef.current = origin;
    pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (e.pointerType === "touch" && activePointerIdsRef.current.size === 1) {
      capturePointer(e.pointerId);
      startPinchRef.current(e as React.PointerEvent<HTMLDivElement>);
      return;
    }

    start();
    if (pointerGestureRef.current && capturePointer(e.pointerId)) {
      activePointerTypeRef.current = e.pointerType;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    pointerPositionsRef.current.delete(e.pointerId);
    pointerPressOriginRef.current = origin === "blank" ? "blank" : "none";
  }, [capturePointer]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const origin: PointerPressOrigin = target.closest("[data-event-editor-chrome]")
      ? "chrome"
      : target.closest("[data-event-item]") ? "item" : "blank";
    beginPointerGesture(e, () => {
      handlePanStart(e, e.pointerType === "touch");
      if (e.button === 1 || effectiveTool === "pan") return;
      if (effectiveTool === "select" && !dragging && origin === "blank") {
        setSelectedId(null);
        setSelectedType(null);
        setSelectedIds([]);
      }
    }, origin);
  }, [beginPointerGesture, dragging, effectiveTool, handlePanStart]);

  useLayoutEffect(() => {
    pointerMoveRef.current = (e: PointerEvent) => {
      if (!activePointerIdsRef.current.has(e.pointerId)) return;
      e.preventDefault();
      pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current) {
        pinchRef.current.points.set(e.pointerId, pointerPositionsRef.current.get(e.pointerId)!);
        applyPinchViewport();
        return;
      }
      if (pointerGestureRef.current === "pan") handlePanMove(e);
      else if (pointerGestureRef.current) handlePointerPreview({ clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey });
    };
  });

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => pointerMoveRef.current(e);
    const handleWindowPointerUp = (e: PointerEvent) => {
      if (!activePointerIdsRef.current.has(e.pointerId)) return;
      if (pinchRef.current) {
        finishInteractionRef.current("pointerup");
        return;
      }
      finishInteractionRef.current("pointerup", { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey });
    };
    const handleWindowPointerCancel = (e: PointerEvent) => {
      if (activePointerIdsRef.current.has(e.pointerId)) finishInteractionRef.current("cancel");
    };
    const handleWindowBlur = () => finishInteractionRef.current("blur");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") finishInteractionRef.current("hidden");
    };
    window.addEventListener("pointermove", handleWindowPointerMove, true);
    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerCancel, true);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleCanvasLostPointerCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (intentionalCaptureReleaseIdsRef.current.delete(e.pointerId)) return;
    // Some browsers can deliver a stale lostpointercapture notification after
    // a pinch handoff has already recaptured the same pointer on the stable
    // canvas surface. The active capture is authoritative in that case.
    if (pointerCaptureTargetRef.current?.hasPointerCapture?.(e.pointerId)) return;
    if (activePointerIdsRef.current.has(e.pointerId)) finishInteractionRef.current("lostcapture");
  }, []);

  const handleZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number, animated = true) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clampedZoom = Math.min(EVENT_MAX_ZOOM, Math.max(getEventMinZoom(), nextZoom));
    const base = viewportTargetRef.current;
    const safeZoom = Math.max(0.01, base.zoom);
    const worldX = (clientX - rect.left - base.pan.x) / safeZoom;
    const worldY = (clientY - rect.top - base.pan.y) / safeZoom;
    const next = { zoom: clampedZoom, pan: clampEventPan(getPanToKeepWorldPoint({
      mapWidth: canvasW,
      mapHeight: canvasH,
      worldPoint: { x: worldX, y: worldY },
      pan: base.pan,
      zoom: safeZoom,
      nextZoom: clampedZoom,
      zoomOrigin: "top-left",
    }), clampedZoom) };
    if (animated) animateViewportTo(next, 160);
    else setImmediateViewport(next);
  }, [animateViewportTo, canvasH, canvasW, clampEventPan, getEventMinZoom, setImmediateViewport, viewportTargetRef]);

  const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (itemGestureActive) {
      e.preventDefault();
      return;
    }
    const delta = normalizeWheelDelta({
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      shiftKey: e.shiftKey,
      viewportHeight: canvasRef.current?.clientHeight,
    });
    if (e.ctrlKey || e.metaKey) {
      if (e.deltaY === 0) return;
      e.preventDefault();
      handleZoomAt(
        e.clientX,
        e.clientY,
        getSmoothZoomTarget(viewportTargetRef.current.zoom, e.deltaY, getEventMinZoom(), EVENT_MAX_ZOOM, e.deltaMode, canvasRef.current?.clientHeight),
      );
      return;
    }
    if (delta.x === 0 && delta.y === 0) return;
    e.preventDefault();
    const target = viewportTargetRef.current;
    animateViewportTo({
      zoom: target.zoom,
      pan: clampEventPan({ x: target.pan.x + delta.x, y: target.pan.y + delta.y }, target.zoom),
    }, 120);
  }, [animateViewportTo, clampEventPan, getEventMinZoom, handleZoomAt, itemGestureActive, viewportTargetRef]);

  const applyPinchViewport = useCallback(() => {
    const pinch = pinchRef.current;
    if (!pinch) return;
    const first = pinch.points.get(pinch.ids[0]);
    const second = pinch.points.get(pinch.ids[1]);
    if (!first || !second) return;
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    if (pinch.startDistance < 1) {
      if (distance < 1) return;
      pinch.startDistance = distance;
      pinch.worldAnchor = clientToEventWorld(midpoint, pinch.frame);
    }
    const nextZoom = Math.min(EVENT_MAX_ZOOM, Math.max(getEventMinZoom(), pinch.startZoom * distance / pinch.startDistance));
    const nextPan = {
      x: midpoint.x - pinch.frame.left - pinch.worldAnchor.x * nextZoom,
      y: midpoint.y - pinch.frame.top - pinch.worldAnchor.y * nextZoom,
    };
    setImmediateViewport({ zoom: nextZoom, pan: clampEventPan(nextPan, nextZoom) });
  }, [clampEventPan, getEventMinZoom, setImmediateViewport]);

  const startPinchGesture = useCallback((second: React.PointerEvent<HTMLDivElement>) => {
    const firstId = activePointerIdRef.current;
    if (firstId === null) return;
    const firstPoint = pointerPositionsRef.current.get(firstId);
    const secondPoint = pointerPositionsRef.current.get(second.pointerId);
    if (!firstPoint || !secondPoint) return;
    finishInteractionRef.current("pinch-transfer");
    const captureTarget = canvasRef.current;
    if (captureTarget) {
      // Re-establish ownership for both pointers after committing the item
      // gesture. This prevents a delayed loss event from ending the new pinch.
      for (const pointerId of [firstId, second.pointerId]) {
        if (!captureTarget.hasPointerCapture?.(pointerId)) continue;
        intentionalCaptureReleaseIdsRef.current.add(pointerId);
        try {
          captureTarget.releasePointerCapture?.(pointerId);
        } catch {
          // The browser may have already released this pointer during handoff.
        }
      }
      pointerCaptureTargetRef.current = null;
      capturePointer(firstId);
      capturePointer(second.pointerId);
    }
    cancelViewportMotion();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const displayed = viewportCurrentRef.current;
    setImmediateViewport(displayed);
    const frame: GestureFrame = { left: rect.left, top: rect.top, zoom: displayed.zoom, pan: { ...displayed.pan } };
    const midpoint = { x: (firstPoint.x + secondPoint.x) / 2, y: (firstPoint.y + secondPoint.y) / 2 };
    pinchRef.current = {
      ids: [firstId, second.pointerId],
      frame,
      startDistance: Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y),
      startZoom: displayed.zoom,
      worldAnchor: clientToEventWorld(midpoint, frame),
      points: new Map([[firstId, firstPoint], [second.pointerId, secondPoint]]),
    };
    pointerGestureRef.current = "pinch";
    setIsPanning(true);
    setPinchActive(true);
    setTransforming(false);
    // A second touch turns a blank press into navigation. Consume the
    // browser's synthesized click so Furniture/Label tools cannot place an
    // asset after the pinch ends.
    suppressCanvasClickRef.current = true;
  }, [cancelViewportMotion, capturePointer, setImmediateViewport, viewportCurrentRef]);

  useEffect(() => {
    startPinchRef.current = startPinchGesture;
    return () => {
      startPinchRef.current = () => {};
    };
  }, [startPinchGesture]);

  const resetViewport = useCallback(() => {
    fitViewportToContent(true);
  }, [fitViewportToContent]);

  const zoomViewportCenter = useCallback((direction: "in" | "out") => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const targetZoom = viewportTargetRef.current.zoom;
    const nextZoom = direction === "in" ? targetZoom * 1.2 : targetZoom / 1.2;
    handleZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextZoom);
  }, [handleZoomAt, viewportTargetRef]);

  useEffect(() => {
    const onResize = () => {
      finishInteractionRef.current("resize");
      cancelViewportMotion();
      fitViewportToContent();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cancelViewportMotion, fitViewportToContent]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isCanvasTextEditingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (!readOnly) {
          e.preventDefault();
          duplicateSelection();
        }
        return;
      }

      if (e.key.startsWith("Arrow") && selectedIds.length > 0) {
        const distance = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -distance : e.key === "ArrowRight" ? distance : 0;
        const dy = e.key === "ArrowUp" ? -distance : e.key === "ArrowDown" ? distance : 0;
        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          nudgeSelection(dx, dy);
        }
        return;
      }

      if (e.key.toLowerCase() === "r" && selectedFurnitureIds.length > 0) {
        if (!readOnly) {
          e.preventDefault();
          rotateSelection();
        }
        return;
      }

      if (e.key === "0") {
        if (!readOnly) {
          e.preventDefault();
          resetViewport();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (readOnly) return;
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape") {
        finishInteractionRef.current("escape");
        setPresetMenuOpen(false);
        setSelectionArrangeOpen(false);
        setSelectedId(null);
        setSelectedType(null);
        setSelectedIds([]);
      }
      // Tool shortcuts
      if (!readOnly) {
        if (e.key === "v" || e.key === "1") selectTool("select");
        if (e.key === "f" || e.key === "2") selectTool("furniture");
        if (e.key === "t" || e.key === "3") selectTool("text");
        if (e.key === "h" || e.key === "4") selectTool("pan");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, undo, redo, readOnly, duplicateSelection, nudgeSelection, resetViewport, rotateSelection, selectTool, selectedIds.length, selectedFurnitureIds.length]);

  // ── Save / Submit handlers ─────────────────────────────────────────────
  const busy = saving || submittingLocal || isSaving || isSubmitting;

  const handleSave = async () => {
    finishInteractionRef.current("save");
    const currentFurniture = latestFurnitureRef.current;
    const currentLabels = latestLabelsRef.current;
    setSaving(true);
    try {
      const saved = await onSave(currentFurniture, currentLabels);
      if (saved !== false && draftLocation) {
        draftDirtyRef.current = false;
        clearEventLayoutDraft(overlay.id, draftLocation);
        setDraftRecovered(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    finishInteractionRef.current("save");
    const currentFurniture = latestFurnitureRef.current;
    const currentLabels = latestLabelsRef.current;
    setSubmittingLocal(true);
    try {
      const submitted = await onSubmit(currentFurniture, currentLabels);
      if (submitted !== false && draftLocation) {
        draftDirtyRef.current = false;
        clearEventLayoutDraft(overlay.id, draftLocation);
        setDraftRecovered(false);
      }
    } finally {
      setSubmittingLocal(false);
    }
  };

  const openInspectorFrom = (trigger: HTMLElement) => {
    inspectorTriggerRef.current = trigger;
    setInspectorOpen(true);
  };
  const closeInspector = () => setInspectorOpen(false);
  const inspectorProps = {
    isOpen: inspectorOpen,
    furniture: selectedFurniture,
    label: selectedLabel,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    onClose: closeInspector,
    onUpdateFurniture: (changes: Partial<FloorFurniture>) => updateSelectedFurniture(changes),
    onUpdateLabel: (changes: Partial<FloorLabel>) => updateSelectedLabel(changes),
    onToggleFurnitureLock: toggleSelectedLock,
    onToggleLabelLock: toggleSelectedLabelLock,
    onToggleVisibility: toggleSelectedVisibility,
    onRotate: rotateSelection,
    onUpdateLayer: updateSelectedLayer,
    onUngroup: ungroupSelection,
  };
  const inspectorPanel = <EventItemInspector {...inspectorProps} />;
  const getSelectedActionsPosition = (
    worldX: number,
    worldTop: number,
    worldBottom: number,
    estimatedWidth: number,
  ): CSSProperties => {
    const viewportWidth = canvasRef.current?.clientWidth || Number.POSITIVE_INFINITY;
    const viewportHeight = canvasRef.current?.clientHeight || Number.POSITIVE_INFINITY;
    const left = Math.max(12, Math.min(worldX * zoom + pan.x, viewportWidth - estimatedWidth - 12));
    const below = worldBottom * zoom + pan.y + 12;
    const above = worldTop * zoom + pan.y - 68;
    return {
      left,
      top: below + 56 <= viewportHeight - 12 ? below : Math.max(12, above),
    };
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Dialog.Root open={mobileInspectorOpen} onOpenChange={(open) => { if (!open) setInspectorOpen(false); }}>
    <div className="flex min-w-0 flex-col h-full bg-background">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-border bg-card shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              finishInteractionRef.current("switch");
              onBack();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-extrabold text-foreground">
              {overlay.title}
            </h2>
            <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{overlay.locationRef?.label || "No location"}</span>
              {readOnly && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-bold">Read-only review</span>}
              {!readOnly && <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">Event map</span>}
              {draftRecovered && !readOnly && <span className="ml-1 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">Recovered unsaved changes</span>}
            </div>
          </div>
        </div>
        {!readOnly && <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:gap-2">
          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground disabled:opacity-30"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          {/* Delete */}
          <button
            onClick={deleteSelected}
            disabled={!selectedId}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors text-muted-foreground disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-xl border border-border text-[11px] sm:text-xs font-bold text-foreground hover:bg-muted transition-all disabled:opacity-50"
          >
            {saving || isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Draft
          </button>
          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex items-center gap-1.5 h-8 px-3 sm:px-4 rounded-xl bg-primary text-primary-foreground text-[11px] sm:text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {submittingLocal || isSubmitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Submit to GSO
          </button>
        </div>}
      </div>

      {/* Toolbar */}
      {!readOnly && <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar px-3 py-2 sm:px-4 border-b border-border bg-card/50 shrink-0">
        {EVENT_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => selectTool(tool.id)}
              aria-pressed={effectiveTool === tool.id}
              title={`${tool.label}${tool.id === "pan" ? " (Space or middle mouse also pans)" : ""}`}
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-all",
                effectiveTool === tool.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tool.label}
            </button>
          );
        })}
        {inspectorViewportCompact && selectedFurnitureIds.length === 1 && selectedFurniture && (
          <>
            {!selectedFurniture.locked && <button type="button" aria-label="Rotate selected item" onClick={rotateSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Rotate</button>}
            <button type="button" aria-label="Open item details" aria-haspopup="dialog" onClick={(event) => openInspectorFrom(event.currentTarget)} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Details</button>
            <button type="button" aria-label={selectedFurniture.locked ? "Unlock selected item" : "Lock selected item"} onClick={toggleSelectedLock} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{selectedFurniture.locked ? "Unlock" : "Lock"}</button>
          </>
        )}
        {inspectorViewportCompact && selectedLabel && selectedIds.length === 1 && (
          <>
            <button type="button" aria-label="Open label details" aria-haspopup="dialog" onClick={(event) => openInspectorFrom(event.currentTarget)} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Details</button>
            <button type="button" aria-label={selectedLabel.locked ? "Unlock selected label" : "Lock selected label"} onClick={toggleSelectedLabelLock} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{selectedLabel.locked ? "Unlock" : "Lock"}</button>
          </>
        )}
        {inspectorViewportCompact && selectedFurnitureIds.length > 1 && (
          <>
            <span className="shrink-0 px-1 text-[10px] font-extrabold text-muted-foreground">{selectedFurnitureIds.length} selected</span>
            <button type="button" aria-label="Rotate selected items" onClick={rotateSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Rotate</button>
            <button type="button" aria-label={selectionIsOneGroup ? "Ungroup selected items" : "Group selected items"} onClick={selectionIsOneGroup ? ungroupSelection : groupSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">{selectionIsOneGroup ? "Ungroup" : "Group"}</button>
            <div className="relative shrink-0">
              <button type="button" aria-label="Arrange selected items" aria-expanded={selectionArrangeOpen} onClick={() => setSelectionArrangeOpen((current) => !current)} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Arrange</button>
              {selectionArrangeOpen && <div role="menu" aria-label="Arrange selected items" className="absolute left-0 top-[calc(100%+0.5rem)] z-50 grid w-[min(22rem,calc(100vw-1.5rem))] grid-cols-1 gap-1 rounded-2xl border border-border bg-card p-2 shadow-2xl sm:grid-cols-2">
                {EVENT_LAYOUT_ACTIONS.map(({ action, label, description }) => <button key={action} type="button" role="menuitem" aria-label={label} title={description} onClick={() => { applyFurnitureLayout(action); setSelectionArrangeOpen(false); }} className="flex min-h-11 flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="text-xs font-bold text-foreground">{label}</span><span className="text-[10px] text-muted-foreground">{description}</span></button>)}
              </div>}
            </div>
            <button type="button" aria-label="Duplicate selected items" onClick={duplicateSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Duplicate</button>
            <button type="button" aria-label="Delete selected items" onClick={deleteSelected} className="h-8 shrink-0 rounded-lg border border-destructive/30 px-3 text-xs font-bold text-destructive hover:bg-destructive/10">Delete</button>
          </>
        )}
        </div>}

      {!readOnly && (
        <EventLayoutIssues
          warnings={layoutWarnings}
          onFocusItems={(ids) => {
            const furnitureIds = ids.filter((id) => eventFurniture.some((item) => item.id === id));
            if (furnitureIds.length === 0) return;
            setSelectedId(furnitureIds.at(-1) ?? null);
            setSelectedType("furniture");
            setSelectedIds(furnitureIds);
            setInspectorOpen(false);
          }}
          disabled={itemGestureActive}
        />
      )}

      {/* Canvas */}
      <div data-testid="event-editor-workspace" className="flex min-h-0 min-w-0 flex-1">
      <div
        ref={canvasRef}
        tabIndex={0}
        aria-label="Event layout canvas"
        className="min-h-0 min-w-0 flex-1 overflow-hidden relative select-none cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        style={{
          background: viewportBackground,
          touchAction: "none",
          cursor:
             isPanning || pinchActive
               ? "grabbing"
               : effectiveTool === "pan"
              ? "grab"
              : activeTool === "select"
              ? "default"
              : "crosshair",
        }}
        onClick={handleCanvasClick}
        onPointerDown={handleCanvasPointerDown}
        onLostPointerCapture={handleCanvasLostPointerCapture}
        onWheelCapture={(e) => {
          // Capture browser pinch/page-zoom gestures even when the pointer is over the asset picker.
          if (e.ctrlKey || e.metaKey) e.preventDefault();
        }}
        onWheel={handleCanvasWheel}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        {!readOnly && activeTool === "furniture" && (
          <div
            data-testid="event-asset-dock"
            data-event-editor-chrome
            className="event-asset-dock absolute left-3 top-3 z-40 max-w-[calc(100%-1.5rem)]"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CanvasAssetPalette
              surface="event"
              activeKey={activeTemplate.assetKey ?? activeTemplate.type}
              onSelect={(asset) => setActiveTemplate(getEventFurnitureTemplate(asset.key))}
              compact
              floating
            />
            <div className="relative mt-2 max-w-full">
              <div className="flex max-w-full items-center gap-2 rounded-2xl border border-border/80 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
                <button
                  type="button"
                  aria-expanded={presetMenuOpen}
                  aria-label="Arrange event layout"
                  onClick={() => setPresetMenuOpen((current) => !current)}
                  className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-[10px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span aria-hidden="true">✦</span>
                  Arrange
                  {presetMenuOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
                <span className="hidden min-w-0 truncate text-[10px] text-muted-foreground sm:block">Start with a ready-made layout</span>
              </div>
              {presetMenuOpen && (
                <div
                  role="menu"
                  aria-label="Ready-made event layouts"
                  className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-1.5rem))] max-w-full rounded-2xl border border-border/80 bg-card p-2 shadow-2xl"
                >
                  <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">Start with a ready-made layout</p>
                  <div className="mt-1 flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {EVENT_LAYOUT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPresetId(preset.id);
                          addPreset(preset.id);
                          setPresetMenuOpen(false);
                        }}
                        className="flex min-h-12 flex-col items-start rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="text-xs font-bold text-foreground">{preset.name}</span>
                        <span className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{preset.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!readOnly && !inspectorViewportCompact && !transforming && !isPanning && !pinchActive && eventSelectionBounds && selectedFurnitureIds.length > 1 && (
          <div
            data-testid="event-layout-actions"
            data-event-editor-chrome
            aria-label="Multiple event items selected"
            className="pointer-events-none absolute z-50 max-w-[calc(100%-1.5rem)]"
            style={{
              left: Math.max(12, eventSelectionBounds.x * zoom + pan.x),
              top: Math.max(12, eventSelectionBounds.y * zoom + pan.y - 56),
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="relative pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
              <span className="shrink-0 px-1 text-[10px] font-extrabold text-foreground">{selectedFurnitureIds.length} items selected</span>
              <button
                type="button"
                aria-label="Rotate selected items"
                title="Rotate selected items 15°"
                onClick={rotateSelection}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Rotate
              </button>
              <button
                type="button"
                aria-label={selectionIsOneGroup ? "Ungroup selected items" : "Group selected items"}
                title={selectionIsOneGroup ? "Ungroup selected items" : "Group selected items"}
                onClick={selectionIsOneGroup ? ungroupSelection : groupSelection}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {selectionIsOneGroup ? <Ungroup className="h-3.5 w-3.5" aria-hidden="true" /> : <Group className="h-3.5 w-3.5" aria-hidden="true" />}
                {selectionIsOneGroup ? "Ungroup" : "Group"}
              </button>
              <button
                type="button"
                aria-label="Arrange selected items"
                aria-expanded={selectionArrangeOpen}
                onClick={() => {
                  setPresetMenuOpen(false);
                  setSelectionArrangeOpen((current) => !current);
                }}
                className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 text-[10px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Arrange
                {selectionArrangeOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
              <button
                type="button"
                aria-label="Duplicate selected items"
                title="Duplicate selected items"
                onClick={duplicateSelection}
                className="min-h-10 shrink-0 rounded-xl border border-border/70 px-2.5 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Duplicate
              </button>
              <button
                type="button"
                aria-label="Delete selected items"
                title="Delete selected items"
                onClick={deleteSelected}
                className="min-h-10 shrink-0 rounded-xl border border-destructive/30 px-2.5 text-[10px] font-bold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              >
                Delete
              </button>
              {selectionArrangeOpen && (
                <div
                  role="menu"
                  aria-label="Arrange selected items"
                  className="absolute left-0 top-[calc(100%+0.5rem)] z-50 grid w-[min(22rem,calc(100vw-1.5rem))] max-w-full grid-cols-1 gap-1 rounded-2xl border border-border/80 bg-card p-2 shadow-2xl sm:grid-cols-2"
                >
                  {EVENT_LAYOUT_ACTIONS.map(({ action, label, description }) => (
                    <button
                      key={action}
                      type="button"
                      aria-label={label}
                      title={description}
                      onClick={() => {
                        applyFurnitureLayout(action);
                        setSelectionArrangeOpen(false);
                      }}
                      className="flex min-h-11 flex-col items-start rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="text-[10px] font-bold text-foreground">{label}</span>
                      <span className="text-[9px] leading-4 text-muted-foreground">{description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          data-event-editor-chrome
          className="absolute right-3 top-3 z-30 flex items-center gap-0.5 rounded-xl border border-border/70 bg-card/90 p-1 shadow-lg backdrop-blur-sm"
        >
          {!readOnly && (
            <button
              type="button"
              aria-label="Toggle snapping"
              aria-pressed={snapEnabled}
              disabled={itemGestureActive}
              title={snapEnabled ? "Snap: On — align items to the grid and nearby items" : "Snap: Off — place items freely"}
              onClick={() => {
                setSnapEnabled((current) => !current);
                setSnapGuides([]);
              }}
              className={cn(
                "flex h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                snapEnabled
                  ? "bg-primary/10 text-primary hover:bg-primary/15"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Magnet className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Snap</span>
            </button>
          )}
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={itemGestureActive || zoom <= getEventMinZoom()}
            onClick={() => zoomViewportCenter("out")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span
            data-testid="event-zoom-level"
            aria-live="polite"
            className="min-w-12 px-1 text-center text-[11px] font-extrabold tabular-nums text-foreground"
          >
            {Math.round(zoom * 100)}%
          </span>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={itemGestureActive || zoom >= EVENT_MAX_ZOOM}
            onClick={() => zoomViewportCenter("in")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
            <button
              type="button"
              aria-label="Reset map view — Fit map to content"
              title="Fit map to content"
              disabled={itemGestureActive}
            onClick={resetViewport}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom + Pan container */}
        <div
          data-testid="event-canvas-content"
          data-event-placement-surface
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: canvasW,
            height: canvasH,
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {/* Base Floor Plan (read-only rendering) */}
          <svg width={canvasW} height={canvasH} className="absolute inset-0">
            {/* Background */}
            <rect
              width={canvasW}
              height={canvasH}
              fill={viewportBackground}
              rx={4}
            />

            {baseMapScene}
          </svg>

          {snapGuides.map((guide) => (
            <span
              key={`${guide.axis}-${guide.value}`}
              data-testid={`event-snap-guide-${guide.axis}`}
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute z-[5] border-dashed border-primary/80",
                guide.axis === "x"
                  ? "bottom-0 top-0 border-l-2"
                  : "left-0 right-0 border-t-2",
              )}
              style={guide.axis === "x" ? { left: guide.value } : { top: guide.value }}
            />
          ))}

          {/* Event Furniture (editable) */}
          {eventFurniture.map((f, index) => {
            const resizeMetrics = transformControlMetrics(f.width, f.height, zoom);
            return (
              <div
              key={f.id}
              data-event-item
              draggable={false}
              data-testid={`event-furniture-${f.id}`}
              className={cn(
                "absolute border-2 rounded transition-shadow",
                !readOnly && (effectiveTool === "pan"
                  ? isPanning || pinchActive ? "cursor-grabbing" : "cursor-grab"
                  : f.locked ? "cursor-default" : "cursor-move"),
                selectedIds.includes(f.id)
                  ? "border-primary shadow-lg z-20"
                  : "border-transparent hover:shadow-md z-10"
              )}
              style={{
                left: f.x,
                top: f.y,
                width: f.width,
                height: f.height,
                backgroundColor: selectedIds.includes(f.id) ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.42)",
                transform: `rotate(${f.rotation || 0}deg)`,
                opacity: f.visible === false ? 0.45 : 1,
                zIndex: (f.zOrder ?? index) + 10 + (selectedIds.includes(f.id) ? 100 : 0),
              }}
              title={`${f.name} — ${f.locked ? "locked" : "drag to move"}`}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(e) => beginPointerGesture(e, () => {
                if (effectiveTool === "pan" || e.button === 1) handlePanStart(e);
                else handleItemMouseDown(e, f.id, "furniture");
              }, "item")}
            >
              <EventAssetVisual type={resolveCanvasAssetKey(f) ?? f.type} label={f.name} className="absolute inset-1 w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)]" />
              {!readOnly && selectedIds.length === 1 && selectedIds.includes(f.id) && !f.locked && (
                <>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 -top-8 z-30 h-5 -translate-x-1/2 border-l-2 border-primary/70"
                  />
                  <button
                    type="button"
                    data-testid="event-furniture-rotate-handle"
                    aria-label={`Rotate ${f.name}`}
                    title={`Rotate ${f.name}. Hold Shift to snap to 15°.`}
                    className={cn(
                      "absolute left-1/2 -top-12 z-40 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-card text-primary shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      effectiveTool === "pan" && (isPanning || pinchActive ? "cursor-grabbing" : "cursor-grab"),
                    )}
                    onPointerDown={(e) => beginPointerGesture(e, () => {
                      if (effectiveTool === "pan" || e.button === 1) handlePanStart(e);
                      else handleRotateStart(e, f);
                    }, "handle")}
                  >
                    <RotateCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {RESIZE_HANDLE_DIRECTIONS.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      data-testid={handle === "se" ? "event-furniture-resize-handle" : `event-furniture-resize-handle-${handle}`}
                      aria-label={`Resize ${f.name} from ${handle}`}
                      title={`Resize ${f.name}`}
                      className={cn(
                        "absolute z-30 flex items-center justify-center rounded-full bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        RESIZE_HANDLE_POSITION[handle],
                        effectiveTool === "pan" && (isPanning || pinchActive ? "cursor-grabbing" : "cursor-grab"),
                      )}
                      style={getEventResizeHandleStyle(handle, resizeMetrics.hitSize)}
                      onPointerDown={(e) => beginPointerGesture(e, () => {
                        if (effectiveTool === "pan" || e.button === 1) handlePanStart(e);
                        else handleResizeStart(e, f, handle);
                      }, "handle")}
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none block rounded-full border-2 border-primary bg-card shadow-sm"
                        style={{ width: resizeMetrics.handleSize, height: resizeMetrics.handleSize }}
                      />
                    </button>
                  ))}
                </>
              )}
              </div>
            );
          })}

          {eventSelectionBounds && selectedFurnitureIds.length > 1 && !readOnly && (
            <div
              data-testid="event-selection-bounds"
              aria-label="Multiple event items selected"
              className="pointer-events-none absolute z-30 rounded border border-dashed border-primary/80"
              style={{ left: eventSelectionBounds.x - 4, top: eventSelectionBounds.y - 4, width: eventSelectionBounds.width + 8, height: eventSelectionBounds.height + 8 }}
            />
          )}

          {/* Event Labels (editable) */}
          {eventLabels.map((l) => (
            <div
              key={l.id}
              data-event-item
              draggable={false}
              data-testid={`event-label-${l.id}`}
              className={cn(
                "absolute select-none",
                !readOnly && (effectiveTool === "pan"
                  ? isPanning || pinchActive ? "cursor-grabbing" : "cursor-grab"
                  : "cursor-move"),
                selectedIds.includes(l.id)
                  ? "ring-2 ring-primary ring-offset-1 z-20"
                  : "z-10"
              )}
              style={{
                left: l.x,
                top: l.y,
                fontSize: l.fontSize || 14,
                color: l.color || "#1f2937",
                fontWeight: "bold",
                transform: `rotate(${l.rotation || 0}deg)`,
                whiteSpace: "nowrap",
              }}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(e) => beginPointerGesture(e, () => {
                if (effectiveTool === "pan" || e.button === 1) handlePanStart(e);
                else handleItemMouseDown(e, l.id, "label");
              }, "item")}
            >
              {l.text}
            </div>
          ))}
        </div>

        {!readOnly && !inspectorViewportCompact && !transforming && !isPanning && !pinchActive && selectedLabel && selectedIds.length === 1 && (
          <div
            data-testid="event-label-actions"
            data-event-editor-chrome
            aria-label="Selected event label actions"
            className="pointer-events-none absolute z-50 max-w-[calc(100%-1.5rem)]"
            style={getSelectedActionsPosition(selectedLabel.x, selectedLabel.y, selectedLabel.y + (selectedLabel.fontSize || 14), 280)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
              <span className="max-w-28 truncate px-1 text-[10px] font-extrabold text-foreground">Label selected</span>
              <button
                type="button"
                aria-label="Open label details"
                title="Open label details"
                onClick={(event) => openInspectorFrom(event.currentTarget)}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Details
              </button>
              <button
                type="button"
                aria-label={selectedLabel.locked ? "Unlock selected label" : "Lock selected label"}
                title={selectedLabel.locked ? "Unlock selected label" : "Lock selected label"}
                onClick={toggleSelectedLabelLock}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {selectedLabel.locked ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                {selectedLabel.locked ? "Unlock" : "Lock"}
              </button>
            </div>
          </div>
        )}

        {!readOnly && !inspectorViewportCompact && !transforming && !isPanning && !pinchActive && eventSelectionBounds && selectedFurnitureIds.length === 1 && (
          <div
            data-testid="event-single-item-actions"
            data-event-editor-chrome
            aria-label="Selected event item actions"
            className="pointer-events-none absolute z-50 max-w-[calc(100%-1.5rem)]"
            style={getSelectedActionsPosition(eventSelectionBounds.x, eventSelectionBounds.y, eventSelectionBounds.y + eventSelectionBounds.height, 360)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
              <span className="shrink-0 px-1 text-[10px] font-extrabold text-foreground">1 item selected</span>
              {!selectedFurniture?.locked && (
                <button
                  type="button"
                  aria-label="Rotate selected item"
                  title="Rotate selected item 15°"
                  onClick={rotateSelection}
                  className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Rotate
                </button>
              )}
              <button
                type="button"
                aria-label="Open item details"
                title="Open item details"
                onClick={(event) => openInspectorFrom(event.currentTarget)}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Details
              </button>
              <button
                type="button"
                aria-label={selectedFurniture?.locked ? "Unlock selected item" : "Lock selected item"}
                title={selectedFurniture?.locked ? "Unlock selected item" : "Lock selected item"}
                onClick={toggleSelectedLock}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {selectedFurniture?.locked ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                {selectedFurniture?.locked ? "Unlock" : "Lock"}
              </button>
            </div>
          </div>
        )}

        {/* Instructions overlay */}
        {eventFurniture.length === 0 && eventLabels.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <p className="text-sm font-bold mb-1">
                {readOnly ? "No event additions yet" : "Click to place event items"}
              </p>
              <p className="text-xs">
                {readOnly
                  ? "This is a read-only review of the submitted map"
                  : "Choose Furniture, then pick an item from Add event item"}
              </p>
            </div>
          </div>
        )}
      </div>
      {!readOnly && !inspectorViewportCompact && (
        <aside data-testid="event-item-inspector-rail" aria-label="Event item inspector rail" className="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-card p-4">
          {inspectorPanel}
        </aside>
      )}
      </div>

      {/* Bottom Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 sm:px-4 border-t border-border bg-card text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span>
            {eventFurniture.length} furniture · {eventLabels.length} labels
          </span>
          <span className="capitalize">Tool: {effectiveTool}</span>
        </div>
        <div className="flex items-center gap-2">
          {overlay.status && (
            <span
              className={cn(
                "px-2 py-0.5 rounded-full font-bold capitalize",
                overlay.status === "approved"
                  ? "bg-green-100 text-green-700"
                  : overlay.status === "disapproved"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              )}
            >
              {overlay.status}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-x-2 gap-y-1">
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="event-pan-status"
              className="min-w-[7rem] max-w-[11rem] truncate rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary"
            >
              {panStatus}
            </span>
            {readOnly && <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-foreground">Published map locked</span>}
            {readOnly
              ? "Published base map and submitted additions"
              : "Drag to move · Del to delete · Wheel to pan · Ctrl/Cmd + wheel to zoom · Space + drag"}
          </span>
        </div>
      </div>
    </div>
    {mobileInspectorOpen && (
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[79] bg-background/55 backdrop-blur-[2px]" />
        <Dialog.Content
          data-testid="event-item-inspector-sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            inspectorTriggerRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[min(82dvh,42rem)] min-h-[min(22rem,70dvh)] flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl outline-none"
        >
          <div className="shrink-0 border-b border-border px-4 py-4">
            <Dialog.Title className="text-base font-extrabold">Item details</Dialog.Title>
            <Dialog.Description className="mt-1 truncate text-xs text-muted-foreground">{selectedFurniture?.name ?? selectedLabel?.text ?? "Selected item"}. Edit properties without covering the map.</Dialog.Description>
          </div>
          <div data-testid="event-item-inspector-sheet-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <EventItemInspector {...inspectorProps} showHeader={false} />
          </div>
          <div className="shrink-0 border-t border-border px-4 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            <button type="button" aria-label="Close item details" onClick={closeInspector} className="h-11 w-full rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Done</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    )}
    </Dialog.Root>
  );
}
