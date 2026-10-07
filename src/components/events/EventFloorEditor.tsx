/**
 * EventFloorEditor — A simplified, read-only version of the Floor Editor
 * for Student Organization users.
 *
 * Features:
 * - Read-only base map (walls, doors, windows, permanent furniture)
 * - Limited tool palette: select, furniture (event-specific only), text, pan
 * - Event furniture can be placed, moved, rotated, and deleted
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
  List,
  Pencil,
  Check,
  X,
  RotateCcw,
  SlidersHorizontal,
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
import { EVENT_ASSET_DRAG_TYPE } from "../canvas/CanvasAssetPalette";
import { EventPlacementDock } from "./EventPlacementDock";
import {
  EVENT_FURNITURE_TEMPLATES,
  EventAssetVisual,
  eventFurnitureFromTemplate,
  getEventFurnitureTemplate,
} from "./eventAssets";
import { resolveCanvasAssetKey } from "../canvas/canvasAssetCatalog";
import { applyLayoutAction, itemsIntersectingRect, nudgeItems, resolveLayoutMoveFromSnapshot, selectionBounds, snapLayoutPosition, type LayoutAction, type LayoutRect, type LayoutSnapGuide } from "../../lib/eventLayoutGeometry";
import { constrainFurnitureToFloor, resizeFurnitureWithinFloor } from "../../lib/floorGeometry";
import { transformControlMetrics } from "../../lib/campusSelection";
import { EVENT_LAYOUT_PRESETS, buildEventPreset, fitEventPresetToCanvas, validateEventPresetDraft, type EventLayoutPresetId, type EventPresetDraft } from "../../lib/eventLayoutPresets";
import { validateEventLayout, eventProtectedAccessRegions } from "../../lib/eventLayoutValidation";
import { assessEventPlacement } from "../../lib/eventPlacementCandidate";
import { useEventViewportMotion } from "./useEventViewportMotion";
import { EventLayoutIssues } from "./EventLayoutIssues";
import { EventEditorTutorial } from "./EventEditorTutorial";
import { EventItemInspector } from "./EventItemInspector";
import { EventSelectionOverlay } from "./EventSelectionOverlay";
import * as Dialog from "@radix-ui/react-dialog";
import { clientToEventWorld, type GestureFrame } from "../../lib/eventGestureCoordinates";
import { eventPlacementGuides } from "../../lib/eventPlacementGuides";

// ── Tool types ────────────────────────────────────────────────────────────

type EventTool = "select" | "furniture" | "text" | "pan";
const EVENT_EDITOR_WORKSPACE_PADDING = 64;
const EVENT_EDITOR_MIN_ZOOM = 0.25;
const EVENT_MAX_ZOOM = 4;
const MOBILE_EVENT_VIEWER_INSETS = { top: 12, right: 12, bottom: 12, left: 12 };

function getUniqueEventObjectName(baseName: string, usedNames: string[]): string {
  const candidate = baseName.trim() || "Item";
  const numberedCandidate = candidate.match(/^(.*)\s+(\d+)$/);
  const stem = numberedCandidate?.[1]?.trim() || candidate;
  const stemKey = stem.toLowerCase();
  const candidateKey = candidate.toLowerCase();
  const usedKeys = usedNames.map((name) => name.trim().toLowerCase()).filter(Boolean);

  const getSiblingSuffix = (name: string): number | null => {
    const key = name.trim().toLowerCase();
    if (key === stemKey) return 0;
    const prefix = `${stemKey} `;
    if (!key.startsWith(prefix)) return null;
    const suffix = key.slice(prefix.length);
    return /^\d+$/.test(suffix) ? Number(suffix) : null;
  };

  const siblingSuffixes = usedKeys
    .map(getSiblingSuffix)
    .filter((suffix): suffix is number => suffix !== null);
  const candidateSuffix = numberedCandidate ? Number(numberedCandidate[2]) : null;
  const hasCandidateCollision = usedKeys.includes(candidateKey);

  if (!hasCandidateCollision && (candidateSuffix !== null || siblingSuffixes.length === 0)) return candidate;

  let suffix = Math.max(candidateSuffix ?? 0, ...siblingSuffixes, 0) + 1;
  let uniqueName = `${stem} ${suffix}`;
  while (usedKeys.includes(uniqueName.toLowerCase())) {
    suffix += 1;
    uniqueName = `${stem} ${suffix}`;
  }
  return uniqueName;
}

interface EventToolDef {
  id: EventTool;
  label: string;
  icon: React.ElementType;
}

const EVENT_TOOLS: EventToolDef[] = [
  { id: "select", label: "Select", icon: Move },
  { id: "furniture", label: "Furniture", icon: () => <span aria-hidden="true" className="text-sm">🪑</span> },
  { id: "text", label: "Label", icon: Type },
  { id: "pan", label: "Pan", icon: Hand },
];

const EVENT_LAYOUT_ACTIONS: Array<{ action: LayoutAction; label: string; description: string }> = [
  { action: "align-left", label: "Align left", description: "Match visible left edges, including rotated items" },
  { action: "align-center", label: "Align center", description: "Center items on one vertical line" },
  { action: "align-top", label: "Align top", description: "Match visible top edges, including rotated items" },
  { action: "align-middle", label: "Align middle", description: "Center items on one horizontal line" },
  { action: "distribute-horizontal", label: "Distribute horizontally", description: "Space visible items evenly in a row" },
  { action: "distribute-vertical", label: "Distribute vertically", description: "Space visible items evenly in a column" },
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

type EventPointerGesture = "pan" | "drag" | "resize" | "rotate" | "pinch" | "marquee";

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

interface EventMoveHerePreview {
  sourceFurniture: FloorFurniture[];
  furniture: FloorFurniture[];
  targetIds: string[];
  canMove: boolean;
  blockingReason: string | null;
}

const EVENT_PLACEMENT_PREVIEW_ID = "event-placement-preview";

interface BuiltEventAssetCandidate {
  item: FloorFurniture;
  assessment: ReturnType<typeof assessEventPlacement>;
  guides: LayoutSnapGuide[];
}

function buildEventAssetCandidate(input: {
  template: (typeof EVENT_FURNITURE_TEMPLATES)[number];
  point: { x: number; y: number };
  existing: readonly FloorFurniture[];
  canvasWidth: number;
  canvasHeight: number;
  grid: number;
  zoom: number;
  snapEnabled: boolean;
  blockedRegions: ReturnType<typeof eventProtectedAccessRegions>;
}): BuiltEventAssetCandidate {
  const raw = eventFurnitureFromTemplate(
    input.template,
    input.point.x - input.template.width / 2,
    input.point.y - input.template.height / 2,
    EVENT_PLACEMENT_PREVIEW_ID,
  );
  const snapped = input.snapEnabled
    ? snapLayoutPosition({
      item: raw,
      x: raw.x,
      y: raw.y,
      items: input.existing,
      selectedIds: [],
      grid: input.grid,
      threshold: 6 / Math.max(0.25, input.zoom),
      snapToGrid: input.grid > 0,
    })
    : { x: raw.x, y: raw.y, guides: [] };
  const item = constrainFurnitureToFloor({ ...raw, x: snapped.x, y: snapped.y }, input.canvasWidth, input.canvasHeight);
  const assessment = assessEventPlacement({
    proposed: [item],
    existing: input.existing,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    blockedRegions: input.blockedRegions,
    blockOverlaps: false,
  });
  return { item, assessment, guides: snapped.guides };
}

function getPresetPlacementMessage(assessment: ReturnType<typeof assessEventPlacement> | null): string | null {
  if (!assessment || assessment.canPlace) return null;
  const issue = assessment.issues.find((item) => item.severity === "critical" || item.code === "overlap");
  if (issue?.code === "outside-boundary") return "This layout exceeds the map boundary. Reduce chairs or rows, or move the preview to a larger open area.";
  if (issue?.code === "building-overlap") return issue.message;
  if (issue?.code === "blocked-access") {
    const accessName = issue.message.match(/blocked access area: (.+)\.$/)?.[1] || "the entrance";
    return `Keep the layout clear of ${accessName}. Move the preview away from this access area.`;
  }
  if (issue?.code === "overlap") return "Some items overlap. Increase the gaps or move the preview to clear space.";
  return assessment.blockingReason;
}

// ── Main Component ────────────────────────────────────────────────────────

export interface EventFloorEditorProps {
  compactPreview?: boolean;
  draftFeedbackPoint?: { x: number; y: number } | null;
  feedbackPins?: Array<{ id: string; x: number; y: number; comment: string; addressed?: boolean }>;
  feedbackFocusRequest?: { pinId: string; requestKey: number } | null;
  onFeedbackPoint?: (point: { x: number; y: number }) => void;
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
  /** Clears the active browser recovery copy after a page-level save or discard. */
  finalizeDraftRef?: MutableRefObject<(() => void) | null>;
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
  saveStatus?: string;
  tutorialAccountId?: string;
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
  finalizeDraftRef,
  onBack,
  isSaving = false,
  isSubmitting = false,
  activeCampus,
  readOnly = false,
  saveStatus,
  tutorialAccountId,
  feedbackPins = [],
  feedbackFocusRequest,
  onFeedbackPoint,
  compactPreview = false,
  draftFeedbackPoint,
}: EventFloorEditorProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [initialEventLayout] = useState(() => getInitialEventLayout(overlay, readOnly));
  const [activeTool, setActiveTool] = useState<EventTool>("select");
  const tutorialPreviousToolRef = useRef<EventTool | null>(null);
  const [activeTemplate, setActiveTemplate] = useState(
    EVENT_FURNITURE_TEMPLATES[0]
  );
  const [eventFurniture, setEventFurniture] = useState<FloorFurniture[]>(
    initialEventLayout.eventFurniture
  );
  const [eventLabels, setEventLabels] = useState<FloorLabel[]>(
    initialEventLayout.eventLabels
  );
  const [inlineLabelEdit, setInlineLabelEdit] = useState<{ id: string; value: string } | null>(null);
  const inlineLabelEditRef = useRef<{ id: string; value: string } | null>(null);
  const lastLabelPressRef = useRef<{ id: string; clientX: number; clientY: number } | null>(null);
  const [draftRecovered, setDraftRecovered] = useState(initialEventLayout.recovered);
  const temporarySelectRef = useRef<{ previous: EventTool; startedAt: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"furniture" | "label" | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<EditorHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [layoutActionError, setLayoutActionError] = useState<string | null>(null);
  const [moveHereArmedIds, setMoveHereArmedIds] = useState<string[] | null>(null);
  const [moveHerePreview, setMoveHerePreview] = useState<EventMoveHerePreview | null>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [presetConfigurationOpen, setPresetConfigurationOpen] = useState(false);
  const [presetSheetViewport, setPresetSheetViewport] = useState({ height: typeof window === "undefined" ? 740 : window.innerHeight, bottom: 0 });
  const [presetConfigCompact, setPresetConfigCompact] = useState(() => (
    typeof window !== "undefined" && (window.matchMedia?.("(max-width: 1023px)").matches ?? window.innerWidth < 1024)
  ));
  const [assetCatalogOpen, setAssetCatalogOpen] = useState(false);
  const [objectListOpen, setObjectListOpen] = useState(false);
  const [objectQuery, setObjectQuery] = useState("");
  const [objectFilter, setObjectFilter] = useState<"all" | "furniture" | "labels">("all");
  const [editingObject, setEditingObject] = useState<{ id: string; value: string; kind: "furniture" | "labels" } | null>(null);
  const [presetPreview, setPresetPreview] = useState<(EventPresetDraft & { point: { x: number; y: number } }) | null>(null);
  const [placementPoint, setPlacementPoint] = useState<{ x: number; y: number } | null>(null);
  const [touchPlacementReady, setTouchPlacementReady] = useState(false);
  const lastCanvasPointerTypeRef = useRef<"mouse" | "touch" | "pen" | null>(null);
  const [repeatPlacement, setRepeatPlacement] = useState(true);
  const [selectionArrangeOpen, setSelectionArrangeOpen] = useState(false);
  const [marquee, setMarquee] = useState<LayoutRect | null>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    ids: string[];
    type: "furniture" | "label";
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingLocal, setSubmittingLocal] = useState(false);
  const { spaceHeld } = useSpacePan(true);
  const [previewPanMode, setPreviewPanMode] = useState(true);
  const [feedbackCursorPoint, setFeedbackCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const feedbackCursorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (readOnly) setPreviewPanMode(!onFeedbackPoint); }, [Boolean(onFeedbackPoint), readOnly]);
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
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const containWheel = (event: WheelEvent) => {
      // React wheel listeners can be passive; cancel native scrolling here,
      // while leaving the React handler to perform map pan/zoom.
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-event-editor-chrome]") || event.ctrlKey || event.metaKey) event.preventDefault();
    };
    canvas.addEventListener("wheel", containWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", containWheel);
  }, []);
  const objectListTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = useRef<HTMLElement | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const pointerGestureRef = useRef<EventPointerGesture | null>(null);
  const marqueeRef = useRef<{ start: { x: number; y: number }; current: { x: number; y: number }; baseIds: string[]; toggle: boolean } | null>(null);
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
  const skipDraftFlushRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const onDraftChangeRef = useRef(onDraftChange);
  const latestFurnitureRef = useRef(eventFurniture);
  const latestLabelsRef = useRef(eventLabels);
  const flushPendingPreviewRef = useRef<() => void>(() => {});

  const setFurniturePreview = useCallback((next: FloorFurniture[]) => {
    skipDraftFlushRef.current = false;
    latestFurnitureRef.current = next;
    draftDirtyRef.current = true;
    setEventFurniture(next);
  }, []);

  const setLabelsPreview = useCallback((next: FloorLabel[]) => {
    skipDraftFlushRef.current = false;
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

    skipDraftFlushRef.current = false;
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
      if (skipDraftFlushRef.current) return;
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

  useEffect(() => {
    if (!finalizeDraftRef) return;
    finalizeDraftRef.current = () => {
      skipDraftFlushRef.current = true;
      draftDirtyRef.current = false;
      if (draftLocation) clearEventLayoutDraft(overlay.id, draftLocation);
      setDraftRecovered(false);
    };
    return () => { finalizeDraftRef.current = null; };
  }, [draftLocation, finalizeDraftRef, overlay.id]);
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
  const selectedUnlockedFurnitureIds = useMemo(
    () => eventFurniture.filter((item) => selectedIds.includes(item.id) && !item.locked).map((item) => item.id),
    [eventFurniture, selectedIds],
  );
  const selectionAllFurniture = selectedIds.length > 0 && selectedFurnitureIds.length === selectedIds.length;
  const selectedFurniture = useMemo(
    () => selectedIds.length === 1 && selectedFurnitureIds.length === 1
      ? eventFurniture.find((item) => item.id === selectedFurnitureIds[0]) ?? null
      : null,
    [eventFurniture, selectedFurnitureIds, selectedIds.length],
  );
  const selectedLabel = useMemo(
    () => selectedIds.length === 1
      ? eventLabels.find((item) => item.id === selectedIds[0]) ?? null
      : null,
    [eventLabels, selectedIds],
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setPresetConfigCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const hasInspectorSelection = Boolean(selectedFurniture || selectedLabel);
  useEffect(() => {
    if (!presetConfigCompact || !presetConfigurationOpen) return;
    const viewport = window.visualViewport;
    const update = () => setPresetSheetViewport({
      height: viewport?.height || window.innerHeight,
      bottom: viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0,
    });
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [presetConfigCompact, presetConfigurationOpen]);
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
  const selectedFocusBounds = useMemo(() => {
    const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [];
    const visibleFurnitureIds = eventFurniture.filter((item) => (readOnly || selectedIds.includes(item.id)) && item.visible !== false).map((item) => item.id);
    const furnitureBounds = selectionBounds(eventFurniture, visibleFurnitureIds);
    if (furnitureBounds) rectangles.push(furnitureBounds);
    for (const label of eventLabels.filter((item) => readOnly || selectedIds.includes(item.id))) {
      const width = Math.max(10, label.text.length * (label.fontSize || 14) * 0.6);
      const height = (label.fontSize || 14) * 1.2;
      const radians = ((label.rotation || 0) * Math.PI) / 180;
      const visualWidth = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
      const visualHeight = Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height;
      rectangles.push({ x: label.x + width / 2 - visualWidth / 2, y: label.y + height / 2 - visualHeight / 2, width: visualWidth, height: visualHeight });
    }
    if (rectangles.length === 0) return null;
    const left = Math.min(...rectangles.map((rect) => rect.x));
    const top = Math.min(...rectangles.map((rect) => rect.y));
    const right = Math.max(...rectangles.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rectangles.map((rect) => rect.y + rect.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, [eventFurniture, eventLabels, selectedIds, readOnly]);
  const moveHereTarget = useMemo(() => {
    if (selectedIds.length === 0 || selectedFurnitureIds.length !== selectedIds.length) return { ids: [], blocked: false };
    const selected = eventFurniture.filter((item) => selectedFurnitureIds.includes(item.id));
    const groupId = selected.length === 1 ? selected[0]?.groupId : undefined;
    const targets = groupId
      ? eventFurniture.filter((item) => item.groupId === groupId)
      : selected;
    return { ids: targets.map((item) => item.id), blocked: targets.some((item) => item.locked) };
  }, [eventFurniture, selectedFurnitureIds, selectedIds.length]);
  const moveHereDisabledReason = moveHereTarget.blocked
    ? "This group contains a locked item. Unlock every group member before moving it."
    : moveHereTarget.ids.length === 0 ? "Select an unlocked event item to move it." : undefined;
  const protectedRegions = useMemo(() => eventProtectedAccessRegions(floorPlan), [floorPlan]);
  const presetValidation = useMemo(() => presetPreview ? validateEventPresetDraft(presetPreview) : null, [presetPreview]);
  const previewItems = useMemo(() => {
    if (!presetPreview || !presetValidation?.options) return [];
    let index = 0;
    const items = buildEventPreset(presetPreview.id, presetPreview.point, presetValidation.options, () => `preview-${++index}`);
    return fitEventPresetToCanvas(items, canvasW, canvasH);
  }, [canvasH, canvasW, presetPreview, presetValidation]);
  const presetAssessment = useMemo(() => {
    if (!presetPreview || !presetValidation?.options || previewItems.length === 0) return null;
    return assessEventPlacement({
      proposed: previewItems,
      existing: eventFurniture,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      blockedRegions: protectedRegions,
      blockOverlaps: true,
    });
  }, [canvasH, canvasW, eventFurniture, presetPreview, presetValidation, previewItems, protectedRegions]);
  const visibleObjectList = useMemo(() => {
    const query = objectQuery.trim().toLowerCase();
    const items = [
      ...eventFurniture.map((item) => ({ id: item.id, name: item.name, kind: "furniture" as const, locked: Boolean(item.locked), x: item.x, y: item.y, width: item.width, height: item.height })),
      ...eventLabels.map((item) => ({ id: item.id, name: item.text, kind: "labels" as const, locked: Boolean(item.locked), x: item.x, y: item.y, width: Math.max(10, item.text.length * (item.fontSize || 14) * 0.6), height: (item.fontSize || 14) * 1.2 })),
    ];
    return items.filter((item) => (objectFilter === "all" || item.kind === objectFilter) && (!query || item.name.toLowerCase().includes(query)));
  }, [eventFurniture, eventLabels, objectFilter, objectQuery]);
  const layoutWarnings = useMemo(() => validateEventLayout({
    furniture: validatedFurniture,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    blockedRegions: protectedRegions,
  }), [canvasH, canvasW, validatedFurniture, protectedRegions]);
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

  useEffect(() => {
    const pin = feedbackPins.find(item => item.id === feedbackFocusRequest?.pinId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!pin || !rect || !feedbackFocusRequest) return;
    const nextZoom = Math.max(viewportTargetRef.current.zoom, 1);
    animateViewportTo({ zoom: nextZoom, pan: clampEventPan({ x: rect.width / 2 - pin.x * nextZoom, y: rect.height / 2 - pin.y * nextZoom }, nextZoom) }, 180);
    // The request identifies a deliberate checklist action, not every map edit.
  }, [feedbackFocusRequest?.requestKey, animateViewportTo, clampEventPan, viewportTargetRef]);

  const placementCandidate = useMemo(() => {
    if (!placementPoint || activeTool !== "furniture" || presetPreview) return null;
    return buildEventAssetCandidate({
      template: activeTemplate,
      point: placementPoint,
      existing: eventFurniture,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      grid: floorPlan.gridSize || 0,
      zoom,
      snapEnabled,
      blockedRegions: protectedRegions,
    });
  }, [activeTemplate, activeTool, canvasH, canvasW, eventFurniture, floorPlan.gridSize, placementPoint, presetPreview, protectedRegions, snapEnabled, zoom]);

  const effectiveTool: EventTool = isPanning || pinchActive || (spaceHeld && !itemGestureActive) || (readOnly && previewPanMode) ? "pan" : activeTool;
  const feedbackPlacementActive = readOnly && Boolean(onFeedbackPoint) && effectiveTool !== "pan" && !draftFeedbackPoint;
  useEffect(() => {
    if (!feedbackPlacementActive) setFeedbackCursorPoint(null);
  }, [feedbackPlacementActive]);
  const placementGuides = useMemo(() => dragging?.type === "furniture" && dragging.ids.length === 1 && selectedFurniture
    ? eventPlacementGuides(selectedFurniture, eventFurniture, 3 / zoom)
    : null, [dragging, selectedFurniture, eventFurniture, zoom]);
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

  const focusSelection = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!selectedFocusBounds || !rect || rect.width <= 0 || rect.height <= 0) return false;
    const next = fitEventViewport({
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      contentBounds: selectedFocusBounds,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      padding: typeof window !== "undefined" && window.innerWidth < 768 ? 88 : 80,
      minZoom: getEventMinZoom(),
      maxZoom: EVENT_MAX_ZOOM,
    });
    animateViewportTo({ zoom: next.zoom, pan: clampEventPan(next.pan, next.zoom) }, 180);
    return true;
  }, [animateViewportTo, canvasH, canvasW, clampEventPan, getEventMinZoom, selectedFocusBounds]);

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
  const commitFurnitureCandidate = useCallback((candidate: FloorFurniture, assessment: ReturnType<typeof assessEventPlacement>) => {
    if (readOnly) return false;
    if (!assessment.canPlace) {
      setPlacementError(assessment.blockingReason || "This item cannot be placed here.");
      return false;
    }
    const usedNames = eventFurniture.map((item) => item.name);
    const placed = {
      ...candidate,
      id: genId(),
      name: getUniqueEventObjectName(candidate.name, usedNames),
    };
    const updated = [...eventFurniture, placed];
    setEventFurniture(updated);
    pushHistory(updated, eventLabels);
    setSelectedId(placed.id);
    setSelectedType("furniture");
    setSelectedIds([placed.id]);
    setPlacementPoint(null);
    setTouchPlacementReady(false);
    setPlacementError(null);
    setSnapGuides([]);
    if (!repeatPlacement) {
      setActiveTool("select");
      setPresetMenuOpen(false);
      setSelectionArrangeOpen(false);
    }
    return true;
  }, [eventFurniture, eventLabels, pushHistory, readOnly, repeatPlacement]);

  const placePreset = useCallback((
    preview: NonNullable<typeof presetPreview>,
    proposed: readonly FloorFurniture[],
    assessment: ReturnType<typeof assessEventPlacement> | null,
    validation: ReturnType<typeof validateEventPresetDraft> | null,
  ) => {
    if (readOnly) return;
    if (!validation?.options) {
      setPlacementError(validation?.errors[0] || "Correct the layout settings before placing this preset.");
      return;
    }
    if (!assessment?.canPlace) {
      setPlacementError(getPresetPlacementMessage(assessment) || "This layout cannot be placed here yet.");
      return;
    }
    setPlacementError(null);
    const usedNames = eventFurniture.map((item) => item.name);
    const placed = proposed.map((item) => {
      const name = getUniqueEventObjectName(item.name, usedNames);
      usedNames.push(name);
      return { ...item, id: genId("event-item"), name };
    });
    if (placed.length === 0) return;
    const nextFurniture = [...eventFurniture, ...placed];
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
    const ids = placed.map((item) => item.id);
    setSelectedIds(ids);
    setSelectedId(ids.at(-1) ?? null);
    setSelectedType("furniture");
    setPresetPreview(null);
    setPlacementPoint(null);
    setTouchPlacementReady(false);
    if (!repeatPlacement) setActiveTool("select");
  }, [eventFurniture, eventLabels, pushHistory, readOnly, repeatPlacement]);

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
      if (inlineLabelEditRef.current) return;
      if (readOnly) {
        if (effectiveTool === "pan" || panMovedRef.current || suppressCanvasClickRef.current) { suppressCanvasClickRef.current = false; panMovedRef.current = false; return; }
        if (onFeedbackPoint && !(e.target as Element).closest("[data-event-editor-chrome]")) {
          const rect = e.currentTarget.getBoundingClientRect();
          const point = { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom };
          if (point.x >= 0 && point.y >= 0 && point.x <= canvasW && point.y <= canvasH) {
            setFeedbackCursorPoint(null);
            onFeedbackPoint(point);
          }
        }
        return;
      }
      const pressOrigin = pointerPressOriginRef.current;
      pointerPressOriginRef.current = "none";
      if (pressOrigin !== "none" && pressOrigin !== "blank") return;
      const clickWasTouch = lastCanvasPointerTypeRef.current === "touch";
      lastCanvasPointerTypeRef.current = null;
      if (activeTool === "pan" || spaceHeld) return;
      if (dragging || resizing || rotating) return;
      if (suppressCanvasClickRef.current) {
        suppressCanvasClickRef.current = false;
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("[data-event-editor-chrome]")) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const worldPoint = {
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      };

      if (moveHereArmedIds) {
        if (target?.closest("[data-event-item]")) return;
        const bounds = selectionBounds(eventFurniture, moveHereArmedIds);
        if (!bounds) return;
        const dx = worldPoint.x - (bounds.x + bounds.width / 2);
        const dy = worldPoint.y - (bounds.y + bounds.height / 2);
        const nextFurniture = nudgeItems(eventFurniture, moveHereArmedIds, dx, dy, { width: canvasW, height: canvasH });
        const targetIds = new Set(moveHereArmedIds);
        const blocking = validateEventLayout({
          furniture: nextFurniture,
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          blockedRegions: protectedRegions,
        }).find((warning) => warning.severity === "critical" && warning.itemIds.some((id) => targetIds.has(id)));
        setMoveHerePreview({ sourceFurniture: eventFurniture, furniture: nextFurniture, targetIds: moveHereArmedIds, canMove: !blocking, blockingReason: blocking?.message ?? null });
        return;
      }

      if (activeTool === "furniture") {
        if (target?.closest("[data-event-item]")) return;
        if (presetPreview) {
          if (clickWasTouch) {
            setPresetPreview((current) => current ? { ...current, point: worldPoint } : null);
            setTouchPlacementReady(true);
            setPlacementError(null);
            return;
          }
          placePreset(presetPreview, previewItems, presetAssessment, presetValidation);
          return;
        }
        const candidate = buildEventAssetCandidate({
          template: activeTemplate,
          point: worldPoint,
          existing: eventFurniture,
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          grid: floorPlan.gridSize || 0,
          zoom,
          snapEnabled,
          blockedRegions: protectedRegions,
        });
        setPlacementPoint(worldPoint);
        setSnapGuides(candidate.guides);
        if (clickWasTouch) {
          setTouchPlacementReady(true);
          setPlacementError(candidate.assessment.blockingReason);
          return;
        }
        commitFurnitureCandidate(candidate.item, candidate.assessment);
      } else if (activeTool === "text") {
        if (target?.closest("[data-event-item]")) return;
        placeLabel(worldPoint.x, worldPoint.y);
      } else if (activeTool === "select") {
        if (!target?.closest("[data-event-item]")) {
          setSelectedId(null);
          setSelectedType(null);
          setSelectedIds([]);
        }
      }
    },
    [activeTool, zoom, pan, commitFurnitureCandidate, placeLabel, placePreset, presetPreview, previewItems, presetAssessment, presetValidation, dragging, resizing, rotating, activeTemplate, readOnly, spaceHeld, eventFurniture, canvasW, canvasH, floorPlan.gridSize, snapEnabled, protectedRegions, moveHereArmedIds, onFeedbackPoint, effectiveTool]
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
    const point = { x: (clientX - safeLeft - pan.x) / safeZoom, y: (clientY - safeTop - pan.y) / safeZoom };
    const template = getEventFurnitureTemplate(assetKey);
    const candidate = buildEventAssetCandidate({
      template,
      point,
      existing: eventFurniture,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      grid: floorPlan.gridSize || 0,
      zoom: safeZoom,
      snapEnabled,
      blockedRegions: protectedRegions,
    });
    setPlacementPoint(point);
    setSnapGuides(candidate.guides);
    commitFurnitureCandidate(candidate.item, candidate.assessment);
  }, [activeTool, canvasH, canvasW, commitFurnitureCandidate, eventFurniture, floorPlan.gridSize, pan, protectedRegions, readOnly, snapEnabled, zoom]);

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

  const handleMarqueeMove = useCallback((sample: Pick<PointerSample, "clientX" | "clientY">) => {
    const drag = marqueeRef.current;
    if (!drag) return;
    const point = getCanvasWorldPoint(sample.clientX, sample.clientY);
    if (!point) return;
    drag.current = point;
    if (!hasPassedGestureThreshold(sample.clientX, sample.clientY)) return;
    gestureMovedRef.current = true;
    suppressCanvasClickRef.current = true;
    setMarquee({ x: drag.start.x, y: drag.start.y, width: point.x - drag.start.x, height: point.y - drag.start.y });
  }, [getCanvasWorldPoint, hasPassedGestureThreshold]);

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
      if (moveHereArmedIds) return;
      if (activeTool !== "select" && activeTool !== "furniture" && activeTool !== "text") return;
      lastLabelPressRef.current = type === "label" ? { id, clientX: e.clientX, clientY: e.clientY } : null;
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
    [activeTool, beginTransformGesture, cancelViewportMotion, eventFurniture, eventLabels, pushHistory, readOnly, spaceHeld, selectedIds, viewportCurrentRef, moveHereArmedIds]
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

  const rotateSelection = useCallback((direction: "clockwise" | "counterclockwise" = "clockwise") => {
    if (readOnly || selectedFurnitureIds.length === 0) return;
    const selected = new Set(selectedFurnitureIds);
    const rotationDelta = direction === "clockwise" ? 15 : -15;
    const nextFurniture = eventFurniture.map((item) => selected.has(item.id)
      ? item.locked ? item : { ...item, rotation: ((item.rotation || 0) + rotationDelta + 360) % 360 }
      : item);
    if (nextFurniture.every((item, index) => item === eventFurniture[index])) return;
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly, selectedFurnitureIds]);
  const rotateClockwise = useCallback(() => rotateSelection("clockwise"), [rotateSelection]);

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

  const renameEventObject = useCallback((id: string, kind: "furniture" | "labels", proposedName: string) => {
    if (readOnly) return;
    const name = proposedName.trim();
    if (!name) return;

    if (kind === "furniture") {
      const current = eventFurniture.find((item) => item.id === id);
      if (!current || current.locked) return;
      const usedNames = eventFurniture.filter((item) => item.id !== id).map((item) => item.name);
      const uniqueName = getUniqueEventObjectName(name, usedNames);
      if (uniqueName === current.name) return;
      const nextFurniture = eventFurniture.map((item) => item.id === id ? { ...item, name: uniqueName } : item);
      setEventFurniture(nextFurniture);
      pushHistory(nextFurniture, eventLabels);
      return;
    }

    const current = eventLabels.find((item) => item.id === id);
    if (!current || current.locked || current.text === name) return;
    const nextLabels = eventLabels.map((item) => item.id === id ? { ...item, text: name } : item);
    setEventLabels(nextLabels);
    pushHistory(eventFurniture, nextLabels);
  }, [eventFurniture, eventLabels, pushHistory, readOnly]);

  const commitObjectRename = useCallback(() => {
    if (!editingObject) return;
    renameEventObject(editingObject.id, editingObject.kind, editingObject.value);
    setEditingObject(null);
  }, [editingObject, renameEventObject]);

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
    const usedNames = eventFurniture.map((item) => item.name);
    const duplicates = eventFurniture.filter((item) => selected.has(item.id)).map((item) => {
      const name = getUniqueEventObjectName(item.name, usedNames);
      usedNames.push(name);
      return { ...item, id: genId("event-item"), name, x: item.x + 24, y: item.y + 24, groupId: undefined };
    });
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
    setLayoutActionError(null);
    if (readOnly) return;
    if (selectedUnlockedFurnitureIds.length < 2) {
      setLayoutActionError("Select at least two unlocked items to arrange.");
      return;
    }
    const selected = new Set(selectedUnlockedFurnitureIds);
    const nextFurniture = applyLayoutAction(eventFurniture, selectedUnlockedFurnitureIds, action, { width: canvasW, height: canvasH });
    const blocking = validateEventLayout({
      furniture: nextFurniture,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      blockedRegions: protectedRegions,
    }).find((warning) => warning.severity === "critical" && warning.itemIds.some((id) => selected.has(id)));
    if (blocking) {
      setLayoutActionError(`${blocking.message} Adjust the selected items before applying this arrangement.`);
      return;
    }
    if (nextFurniture.every((item, index) => item.x === eventFurniture[index]?.x && item.y === eventFurniture[index]?.y)) return;
    setEventFurniture(nextFurniture);
    pushHistory(nextFurniture, eventLabels);
  }, [canvasH, canvasW, eventFurniture, eventLabels, protectedRegions, pushHistory, readOnly, selectedUnlockedFurnitureIds]);

  const confirmMoveHere = useCallback(() => {
    if (readOnly || !moveHerePreview?.canMove) return;
    if (moveHerePreview.sourceFurniture !== eventFurniture) {
      setMoveHereArmedIds(null);
      setMoveHerePreview(null);
      return;
    }
    const targets = new Set(moveHerePreview.targetIds);
    const changed = moveHerePreview.furniture.some((item, index) => targets.has(item.id)
      && (item.x !== eventFurniture[index]?.x || item.y !== eventFurniture[index]?.y));
    if (changed) {
      skipDraftFlushRef.current = false;
      draftDirtyRef.current = true;
      latestFurnitureRef.current = moveHerePreview.furniture;
      setEventFurniture(moveHerePreview.furniture);
      pushHistory(moveHerePreview.furniture, eventLabels);
    }
    setMoveHereArmedIds(null);
    setMoveHerePreview(null);
  }, [eventFurniture, eventLabels, moveHerePreview, pushHistory, readOnly]);

  useEffect(() => {
    if (moveHerePreview && moveHerePreview.sourceFurniture !== eventFurniture) {
      setMoveHereArmedIds(null);
      setMoveHerePreview(null);
    }
  }, [eventFurniture, moveHerePreview]);

  const selectTool = useCallback((tool: EventTool) => {
    temporarySelectRef.current = null;
    lastCanvasPointerTypeRef.current = null;
    setActiveTool(tool);
    setAssetCatalogOpen(false);
    setPresetMenuOpen(false);
    setPresetPreview(null);
    setObjectListOpen(false);
    setInspectorOpen(false);
    setPlacementPoint(null);
    setTouchPlacementReady(false);
    setPlacementError(null);
    setSnapGuides([]);
    setSelectionArrangeOpen(false);
    setLayoutActionError(null);
    setMoveHereArmedIds(null);
    setMoveHerePreview(null);
  }, []);

  const beginInlineLabelEdit = useCallback((label: FloorLabel) => {
    if (readOnly || label.locked || effectiveTool === "pan") return;
    finishInteractionRef.current("switch");
    selectTool("select");
    setSelectedId(label.id);
    setSelectedType("label");
    setSelectedIds([label.id]);
    const edit = { id: label.id, value: label.text };
    inlineLabelEditRef.current = edit;
    setInlineLabelEdit(edit);
  }, [effectiveTool, readOnly, selectTool]);

  const finishInlineLabelEdit = useCallback((cancel = false) => {
    const edit = inlineLabelEditRef.current;
    inlineLabelEditRef.current = null;
    setInlineLabelEdit(null);
    if (!edit || cancel || readOnly) return;
    const label = latestLabelsRef.current.find(item => item.id === edit.id);
    const value = edit.value.trim();
    if (!label || label.locked || !value || value === label.text) return;
    const next = latestLabelsRef.current.map(item => item.id === edit.id ? { ...item, text: value } : item);
    latestLabelsRef.current = next;
    setEventLabels(next);
    pushHistory(latestFurnitureRef.current, next);
  }, [pushHistory, readOnly]);

  const handleTutorialStepChange = useCallback((step: number | null) => {
    if (step === 1) {
      if (tutorialPreviousToolRef.current === null) tutorialPreviousToolRef.current = activeTool;
      selectTool("furniture");
      return;
    }
    if ((step === 0 || step === null) && tutorialPreviousToolRef.current !== null) {
      const previousTool = tutorialPreviousToolRef.current;
      tutorialPreviousToolRef.current = null;
      selectTool(previousTool);
    }
  }, [activeTool, selectTool]);

  useEffect(() => {
    if (!selectionAllFurniture || selectedFurnitureIds.length < 2) setSelectionArrangeOpen(false);
  }, [selectedFurnitureIds.length, selectionAllFurniture]);
  useEffect(() => setLayoutActionError(null), [selectedIds]);

  // ── Pan (middle mouse or pan tool) ─────────────────────────────────────
  const handlePanStart = useCallback(
    (e: React.PointerEvent, forceTouch = false) => {
      if (effectiveTool === "pan" || spaceHeld || e.button === 1 || forceTouch) {
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
    [effectiveTool, cancelViewportMotion, spaceHeld, viewportCurrentRef]
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
      if (["cancel", "lostcapture", "blur", "hidden", "escape", "resize", "switch", "save", "pinch-transfer"].includes(reason)) {
        lastCanvasPointerTypeRef.current = null;
        setPlacementPoint(null);
        setTouchPlacementReady(false);
        setPlacementError(null);
      }
      if (["cancel", "lostcapture", "blur", "hidden", "escape", "resize", "switch", "save"].includes(reason)) {
        setMoveHereArmedIds(null);
        setMoveHerePreview(null);
      }
      if (reason === "pinch-transfer") {
        const firstId = activePointerIdRef.current;
        const gesture = pointerGestureRef.current;
        if (gesture && gesture !== "pan" && gesture !== "pinch" && gesture !== "marquee" && firstId !== null) {
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
      else if (finalSample && gesture === "marquee") handleMarqueeMove(finalSample);
      else if (finalSample && gesture && gesture !== "pinch") handlePointerPreview(finalSample);
      if (gesture === "marquee") {
        const drag = marqueeRef.current;
        if (reason === "pointerup" && drag && gestureMovedRef.current) {
          const rect = { x: drag.start.x, y: drag.start.y, width: drag.current.x - drag.start.x, height: drag.current.y - drag.start.y };
          const candidates = [
            ...eventFurniture.filter((item) => item.visible !== false),
            ...eventLabels.map((label) => ({
              ...label,
              width: Math.max(10, label.text.length * (label.fontSize || 14) * 0.6),
              height: (label.fontSize || 14) * 1.2,
            })),
          ];
          const hits = itemsIntersectingRect(candidates, rect);
          const ids = drag.toggle
            ? [...drag.baseIds.filter((id) => !hits.includes(id)), ...hits.filter((id) => !drag.baseIds.includes(id))]
            : hits;
          setSelectedIds(ids);
          setSelectedId(ids.at(-1) ?? null);
          setSelectedType(ids.some((id) => eventFurniture.some((item) => item.id === id)) ? "furniture" : ids.length ? "label" : null);
          pointerPressOriginRef.current = "pan";
        }
        marqueeRef.current = null;
        setMarquee(null);
      }
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
      } else if (gesture && gesture !== "pan" && gesture !== "pinch" && gesture !== "marquee") {
        flushPendingPreview();
      }

      if (gesture === "pan" || gesture === "pinch") handlePanEnd();
      else if (gesture && gesture !== "marquee") handleMouseUp();
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
  }, [cancelPendingPreview, cancelViewportMotion, eventFurniture, eventLabels, flushPendingPreview, handleMouseUp, handleMarqueeMove, handlePanEnd, handlePanMove, handlePointerPreview, setFurniturePreview, setLabelsPreview]);

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
    pointerPressOriginRef.current = origin;
  }, [capturePointer]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const origin: PointerPressOrigin = target.closest("[data-event-editor-chrome]")
      ? "chrome"
      : target.closest("[data-event-item]") ? "item" : "blank";
    if (origin === "blank" || origin === "chrome") lastLabelPressRef.current = null;
    if (origin === "blank" && (effectiveTool === "furniture" || moveHereArmedIds) && activePointerIdsRef.current.size === 0) {
      lastCanvasPointerTypeRef.current = e.pointerType === "touch" ? "touch" : e.pointerType === "pen" ? "pen" : "mouse";
    }
    beginPointerGesture(e, () => {
      handlePanStart(e, e.pointerType === "touch");
      if (e.button === 1 || effectiveTool === "pan") return;
      if (moveHereArmedIds) return;
      if (!readOnly && effectiveTool === "select" && !dragging && origin === "blank" && e.pointerType !== "touch") {
        beginTransformGesture(e.clientX, e.clientY);
        const start = getCanvasWorldPoint(e.clientX, e.clientY);
        if (!start) return;
        marqueeRef.current = { start, current: start, baseIds: e.shiftKey ? selectedIds : [], toggle: e.shiftKey };
        pointerGestureRef.current = "marquee";
        if (!e.shiftKey) {
          setSelectedId(null);
          setSelectedType(null);
          setSelectedIds([]);
        }
      }
    }, origin);
  }, [beginPointerGesture, beginTransformGesture, dragging, effectiveTool, getCanvasWorldPoint, handlePanStart, selectedIds, moveHereArmedIds, readOnly]);

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
      else if (pointerGestureRef.current === "marquee") handleMarqueeMove(e);
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
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && objectListOpen && !editingObject) {
        e.preventDefault();
        setObjectListOpen(false);
        objectListTriggerRef.current?.focus();
        return;
      }
      if (isCanvasTextEditingTarget(e.target)) return;
      if (readOnly) {
        if (!canvasRef.current?.contains(e.target as Node)) return;
        if (e.key.toLowerCase() === "h") { e.preventDefault(); setPreviewPanMode(current => !current); }
        if (e.key === "0") { e.preventDefault(); resetViewport(); }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (!readOnly) {
          e.preventDefault();
          duplicateSelection();
        }
        return;
      }

      if (e.key === "Enter" && selectedLabel && selectedIds.length === 1 && canvasRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        beginInlineLabelEdit(selectedLabel);
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
        selectTool("select");
        setPresetMenuOpen(false);
        setPresetPreview(null);
        setSelectionArrangeOpen(false);
        setSelectedId(null);
        setSelectedType(null);
        setSelectedIds([]);
      }
      // Tool shortcuts
      if (!readOnly && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === "v" && !e.repeat) {
          const previous = activeTool;
          selectTool("select");
          temporarySelectRef.current = { previous, startedAt: performance.now() };
        } else if (e.key === "1") selectTool("select");
        else if (e.key === "f" || e.key === "F" || e.key === "2") selectTool("furniture");
        else if (e.key === "t" || e.key === "T" || e.key === "3") selectTool("text");
        else if (e.key === "h" || e.key === "H" || e.key === "4") selectTool("pan");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "v") return;
      const temporary = temporarySelectRef.current;
      temporarySelectRef.current = null;
      if (temporary && performance.now() - temporary.startedAt >= 180 && activeTool === "select") {
        selectTool(temporary.previous);
      }
    };
    const onBlur = () => {
      const temporary = temporarySelectRef.current;
      temporarySelectRef.current = null;
      if (temporary && performance.now() - temporary.startedAt >= 180 && activeTool === "select") {
        selectTool(temporary.previous);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [activeTool, deleteSelected, undo, redo, readOnly, duplicateSelection, nudgeSelection, resetViewport, rotateSelection, selectTool, selectedIds.length, selectedFurnitureIds.length, objectListOpen, editingObject, selectedLabel, beginInlineLabelEdit]);

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
    setAssetCatalogOpen(false);
    setPresetMenuOpen(false);
    setPresetPreview(null);
    setObjectListOpen(false);
    setSelectionArrangeOpen(false);
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
    onRotate: rotateClockwise,
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
  const presetConfigurationFields = presetPreview ? (
    <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
                    {presetPreview.id === "chair-row" ? "Total chairs" : "Copies"}
                    <input type="number" aria-label="Preset item count" min="1" max={presetPreview.id === "chair-row" ? 500 : 30} value={presetPreview.count} aria-invalid={Boolean(presetValidation?.fieldErrors.count)} onChange={(event) => setPresetPreview((current) => current ? { ...current, count: event.target.value } : null)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                    {presetValidation?.fieldErrors.count && <span className="mt-1 block font-medium text-destructive">{presetValidation.fieldErrors.count}</span>}
                  </label>
                  {presetPreview.id === "chair-row" && (
                    <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
                      Chairs per row
                      <input type="number" aria-label="Chairs per row" min="1" max="30" value={presetPreview.chairsPerRow} aria-invalid={Boolean(presetValidation?.fieldErrors.chairsPerRow)} onChange={(event) => setPresetPreview((current) => current ? { ...current, chairsPerRow: event.target.value } : null)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                      {presetValidation?.fieldErrors.chairsPerRow && <span className="mt-1 block font-medium text-destructive">{presetValidation.fieldErrors.chairsPerRow}</span>}
                    </label>
                  )}
                  {presetPreview.id === "chair-row" ? (
                    <>
                      <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
                        Column gap (map units)
                        <input type="number" aria-label="Column gap" min="0" max="240" value={presetPreview.columnGap} aria-invalid={Boolean(presetValidation?.fieldErrors.columnGap)} onChange={(event) => setPresetPreview((current) => current ? { ...current, columnGap: event.target.value } : null)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                        {presetValidation?.fieldErrors.columnGap && <span className="mt-1 block font-medium text-destructive">{presetValidation.fieldErrors.columnGap}</span>}
                      </label>
                      <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
                        Row gap (map units)
                        <input type="number" aria-label="Row gap" min="0" max="240" value={presetPreview.rowGap} aria-invalid={Boolean(presetValidation?.fieldErrors.rowGap)} onChange={(event) => setPresetPreview((current) => current ? { ...current, rowGap: event.target.value } : null)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                        {presetValidation?.fieldErrors.rowGap && <span className="mt-1 block font-medium text-destructive">{presetValidation.fieldErrors.rowGap}</span>}
                      </label>
                      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground">
                        <input type="checkbox" aria-label="Center aisle" checked={presetPreview.centerAisle} onChange={(event) => setPresetPreview((current) => current ? { ...current, centerAisle: event.target.checked } : null)} className="h-4 w-4 accent-primary" />
                        Center aisle
                      </label>
                      {presetPreview.centerAisle && (
                        <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
                          Aisle gap (map units)
                          <input type="number" aria-label="Center aisle gap" min="0" max="240" value={presetPreview.centerAisleGap} aria-invalid={Boolean(presetValidation?.fieldErrors.centerAisleGap)} onChange={(event) => setPresetPreview((current) => current ? { ...current, centerAisleGap: event.target.value } : null)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                          {presetValidation?.fieldErrors.centerAisleGap && <span className="mt-1 block font-medium text-destructive">{presetValidation.fieldErrors.centerAisleGap}</span>}
                        </label>
                      )}
                    </>
                  ) : (
                    <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
                      Spacing (map units)
                      <input type="number" aria-label="Preset spacing" min="20" max="240" step="5" value={presetPreview.spacing} aria-invalid={Boolean(presetValidation?.fieldErrors.spacing)} onChange={(event) => setPresetPreview((current) => current ? { ...current, spacing: event.target.value } : null)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                      {presetValidation?.fieldErrors.spacing && <span className="mt-1 block font-medium text-destructive">{presetValidation.fieldErrors.spacing}</span>}
                    </label>
                  )}
                  <label className="min-w-0 text-[10px] font-bold text-muted-foreground">
                    Rotation (degrees)
                    <input type="number" aria-label="Preset rotation" min="0" max="359" step="1" value={presetPreview.rotation} aria-invalid={Boolean(presetValidation?.fieldErrors.rotation)} onChange={(event) => setPresetPreview((current) => current ? { ...current, rotation: event.target.value } : null)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                    {presetValidation?.fieldErrors.rotation && <span className="mt-1 block font-medium text-destructive">{presetValidation.fieldErrors.rotation}</span>}
                  </label>
                </div>
                {presetPreview.id === "chair-row" && (
                  <div className="mt-3 rounded-xl border border-border/70 bg-muted/30 p-2">
                    {presetValidation?.options && presetValidation.rows !== null ? (
                      <>
                        <p className="text-[11px] font-semibold text-foreground">{presetValidation.options.count} chairs · {presetValidation.rows} rows · {presetValidation.options.chairsPerRow} per row · last row: {presetValidation.lastRowCount}</p>
                        <div aria-hidden="true" className="mt-2 grid w-fit gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(presetValidation.options.chairsPerRow || 1, 10)}, 0.5rem)` }}>
                          {Array.from({ length: Math.min(presetValidation.options.count, 30) }, (_, index) => {
                            const perRow = presetValidation.options!.chairsPerRow || 1;
                            const rowIndex = Math.floor(index / perRow);
                            const columnIndex = index % perRow;
                            const rowCount = Math.min(perRow, presetValidation.options!.count - rowIndex * perRow);
                            const hasAisle = Boolean(presetPreview.centerAisle && presetValidation.options!.centerAisleGap && Math.floor(perRow / 2) > 0 && rowCount > Math.floor(perRow / 2) && columnIndex === Math.floor(perRow / 2));
                            return <span key={index} className={cn("h-2.5 w-2 rounded-sm border border-primary/60 bg-primary/20", hasAisle && "ml-2")} />;
                          })}
                        </div>
                      </>
                    ) : <p className="text-[11px] font-medium text-destructive">Correct the highlighted layout values to preview the rows.</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground">Chairs stay at their fixed size. Spacing uses map units and does not certify real-world capacity.</p>
                  </div>
                )}
                {presetValidation?.options && presetAssessment && !presetAssessment.canPlace && (
                  <p role="alert" className="mt-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    {getPresetPlacementMessage(presetAssessment)}
                  </p>
                )}
    </>
  ) : null;

  return (
    <Dialog.Root open={mobileInspectorOpen} onOpenChange={(open) => { if (!open) setInspectorOpen(false); }}>
    <div className="flex min-w-0 flex-col h-full bg-background">
      {/* Top Bar */}
      <div className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-border bg-card shrink-0", compactPreview && "hidden")}>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            aria-label={readOnly ? "Back to event approvals" : "Back to My Events"}
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
          {tutorialAccountId && <EventEditorTutorial key={tutorialAccountId} accountId={tutorialAccountId} onStepChange={handleTutorialStepChange} />}
          {/* Undo/Redo */}
          <button
            type="button"
            aria-label="Undo"
            title="Undo"
            onClick={undo}
            disabled={historyIndex <= 0}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo"
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
            aria-label="Delete selected items"
            title="Delete selected items (Del)"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors text-muted-foreground disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {saveStatus && <span data-event-tour="save-status" role="status" className="text-[10px] text-muted-foreground">{saveStatus}</span>}
          {/* Save */}
          <button
            data-event-tour="save"
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-xl border border-border text-[11px] sm:text-xs font-bold text-foreground hover:bg-muted transition-all disabled:opacity-50"
          >
            {saving || isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Draft
          </button>
          {/* Submit */}
          <button
            data-event-tour="submit"
            onClick={handleSubmit}
            disabled={busy}
            className="flex items-center gap-1.5 h-8 px-3 sm:px-4 rounded-xl bg-primary text-primary-foreground text-[11px] sm:text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {submittingLocal || isSubmitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {overlay.status === "pending" ? "Review & update GSO" : "Review & submit"}
          </button>
        </div>}
      </div>

      {/* Toolbar */}
      {!readOnly && <div className="flex min-w-0 flex-wrap items-center gap-1 px-3 py-2 sm:px-4 border-b border-border bg-card/50 shrink-0">
        {EVENT_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              data-event-tour={tool.id === "furniture" ? "furniture" : undefined}
              onClick={() => selectTool(tool.id)}
              aria-pressed={effectiveTool === tool.id}
              title={tool.id === "select" ? "Select (V to switch; hold V for temporary Select)" : tool.id === "text" ? "Label (T)" : `${tool.label}${tool.id === "pan" ? " (Space or middle mouse also pans)" : ""}`}
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
        <button
          data-event-tour="objects"
          ref={objectListTriggerRef}
          type="button"
          aria-label={objectListOpen ? "Hide event objects" : "Show event objects"}
          aria-expanded={objectListOpen}
          onClick={() => {
            if (!objectListOpen) {
              setAssetCatalogOpen(false);
              setPresetMenuOpen(false);
              setPresetPreview(null);
              setInspectorOpen(false);
              setSelectionArrangeOpen(false);
            }
            setObjectListOpen(!objectListOpen);
          }}
          className={cn("ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold", objectListOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
        >
          <List className="h-3.5 w-3.5" /> Objects ({eventFurniture.length + eventLabels.length})
        </button>
        {inspectorViewportCompact && selectedIds.length === 1 && selectedFurniture && (
          <>
            <span className="max-w-28 truncate px-1 text-[10px] font-extrabold text-foreground" title={selectedFurniture.name}>{selectedFurniture.name}</span>
            {!selectedFurniture.locked && <button type="button" aria-label="Rotate selected item" onClick={rotateClockwise} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Rotate</button>}
            <button type="button" aria-label="Move here" disabled={!moveHereTarget.ids.length || moveHereTarget.blocked} title={moveHereDisabledReason} onClick={() => { selectTool("select"); pointerPressOriginRef.current = "none"; suppressCanvasClickRef.current = false; setInspectorOpen(false); setMoveHereArmedIds(moveHereTarget.ids); setMoveHerePreview(null); }} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Move here</button>
            <button type="button" aria-label="Duplicate selected item" onClick={duplicateSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Duplicate</button>
            <button type="button" aria-label="Open item details" aria-haspopup="dialog" onClick={(event) => openInspectorFrom(event.currentTarget)} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Details</button>
            <button type="button" aria-label={selectedFurniture.locked ? "Unlock selected item" : "Lock selected item"} onClick={toggleSelectedLock} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{selectedFurniture.locked ? "Unlock" : "Lock"}</button>
            <button type="button" aria-label="Delete selected item" title="Delete selected item (Del)" disabled={selectedFurniture.locked} onClick={deleteSelected} className="h-8 shrink-0 rounded-lg border border-destructive/30 px-3 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-40">Delete</button>
          </>
        )}
        {inspectorViewportCompact && !inlineLabelEdit && selectedLabel && selectedIds.length === 1 && (
          <>
            <span className="max-w-28 truncate px-1 text-[10px] font-extrabold text-foreground" title={selectedLabel.text}>{selectedLabel.text || "Untitled label"}</span>
            <button type="button" disabled={selectedLabel.locked} onClick={() => beginInlineLabelEdit(selectedLabel)} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary">Edit text</button>
            <button type="button" aria-label="Duplicate selected label" onClick={duplicateSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Duplicate</button>
            <button type="button" aria-label="Open label details" aria-haspopup="dialog" onClick={(event) => openInspectorFrom(event.currentTarget)} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Details</button>
            <button type="button" aria-label={selectedLabel.locked ? "Unlock selected label" : "Lock selected label"} onClick={toggleSelectedLabelLock} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{selectedLabel.locked ? "Unlock" : "Lock"}</button>
            <button type="button" aria-label="Delete selected label" title="Delete selected label (Del)" disabled={selectedLabel.locked} onClick={deleteSelected} className="h-8 shrink-0 rounded-lg border border-destructive/30 px-3 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-40">Delete</button>
          </>
        )}
        {inspectorViewportCompact && selectedIds.length > 1 && (
          <>
            <span className="shrink-0 px-1 text-[10px] font-extrabold text-muted-foreground">{selectedIds.length} selected</span>
            {selectionAllFurniture && <button type="button" aria-label="Rotate selected items" onClick={rotateClockwise} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Rotate</button>}
            {selectionAllFurniture && <button type="button" aria-label="Move here" disabled={!moveHereTarget.ids.length || moveHereTarget.blocked} title={moveHereDisabledReason} onClick={() => { selectTool("select"); pointerPressOriginRef.current = "none"; suppressCanvasClickRef.current = false; setInspectorOpen(false); setMoveHereArmedIds(moveHereTarget.ids); setMoveHerePreview(null); }} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Move here</button>}
            {selectionAllFurniture && selectedFurnitureIds.length > 1 && <button type="button" aria-label={selectionIsOneGroup ? "Ungroup selected items" : "Group selected items"} onClick={selectionIsOneGroup ? ungroupSelection : groupSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">{selectionIsOneGroup ? "Ungroup" : "Group"}</button>}
            {selectionAllFurniture && selectedFurnitureIds.length > 1 && <div className="relative shrink-0">
              <button type="button" aria-label="Arrange selected items" aria-expanded={selectionArrangeOpen} disabled={selectedUnlockedFurnitureIds.length < 2} title={selectedUnlockedFurnitureIds.length < 2 ? "Select at least two unlocked items to arrange." : "Arrange selection"} onClick={() => setSelectionArrangeOpen((current) => !current)} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Arrange</button>
              {selectionArrangeOpen && <div role="menu" aria-label="Arrange selected items" className="absolute left-0 top-[calc(100%+0.5rem)] z-50 grid w-[min(22rem,calc(100vw-1.5rem))] grid-cols-1 gap-1 rounded-2xl border border-border bg-card p-2 shadow-2xl sm:grid-cols-2">
                {EVENT_LAYOUT_ACTIONS.map(({ action, label, description }) => <button key={action} type="button" role="menuitem" aria-label={label} title={description} onClick={() => { applyFurnitureLayout(action); setSelectionArrangeOpen(false); }} className="flex min-h-11 flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="text-xs font-bold text-foreground">{label}</span><span className="text-[10px] text-muted-foreground">{description}</span></button>)}
               </div>}
               {layoutActionError && <p role="alert" className="absolute left-0 top-[calc(100%+0.5rem)] z-[51] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-destructive/30 bg-card p-3 text-xs text-destructive shadow-xl">{layoutActionError}</p>}
             </div>}
            <button type="button" aria-label="Duplicate selected items" onClick={duplicateSelection} className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Duplicate</button>
            <button type="button" aria-label="Delete selected items" onClick={deleteSelected} className="h-8 shrink-0 rounded-lg border border-destructive/30 px-3 text-xs font-bold text-destructive hover:bg-destructive/10">Delete</button>
          </>
        )}
        {!readOnly && <div className="ml-auto"><EventLayoutIssues compact warnings={layoutWarnings} onFocusItems={(ids) => {
          const furnitureIds = ids.filter((id) => eventFurniture.some((item) => item.id === id));
          if (furnitureIds.length === 0) return;
          setSelectedId(furnitureIds.at(-1) ?? null);
          setSelectedType("furniture");
          setSelectedIds(furnitureIds);
          setInspectorOpen(false);
        }} disabled={itemGestureActive} /></div>}
        </div>}

      {/* Canvas */}
      <div data-testid="event-editor-workspace" className="flex min-h-0 min-w-0 flex-1">
      <div
        ref={canvasRef}
        data-event-tour="canvas"
        tabIndex={0}
        aria-label="Event layout canvas"
        className="min-h-0 min-w-0 flex-1 overflow-hidden overscroll-contain relative select-none cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        style={{
          background: viewportBackground,
          touchAction: "none",
          cursor:
             isPanning || pinchActive
               ? "grabbing"
               : effectiveTool === "pan"
              ? "grab"
              : feedbackPlacementActive ? "crosshair"
              : activeTool === "select"
              ? "default"
              : "crosshair",
        }}
        onClick={handleCanvasClick}
        onDoubleClick={(event) => {
          // Capturing on the stable canvas also retargets the synthesized double-click.
          // Only a stationary press on an actual label may open its text editor.
          const press = lastLabelPressRef.current;
          if (!press || gestureMovedRef.current || (event.target as Element).closest("[data-event-editor-chrome]") || Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) > 3) return;
          const label = latestLabelsRef.current.find(item => item.id === press.id);
          if (label) beginInlineLabelEdit(label);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "touch" || event.button === 1) setFeedbackCursorPoint(null);
          handleCanvasPointerDown(event);
        }}
        onPointerMove={(event) => {
          if (activePointerIdsRef.current.size > 0 || (event.target as Element).closest("[data-event-editor-chrome]")) {
            setFeedbackCursorPoint(null);
            return;
          }
          const point = getCanvasWorldPoint(event.clientX, event.clientY);
          if (!point) return;
          if (feedbackPlacementActive && event.pointerType !== "touch" && point.x >= 0 && point.y >= 0 && point.x <= canvasW && point.y <= canvasH) {
            const rect = event.currentTarget.getBoundingClientRect();
            const cursorPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            // Move this decorative overlay without rerendering the whole map on every pointer sample.
            if (feedbackCursorRef.current) {
              feedbackCursorRef.current.style.left = `${cursorPoint.x}px`;
              feedbackCursorRef.current.style.top = `${cursorPoint.y}px`;
            } else setFeedbackCursorPoint(cursorPoint);
          } else setFeedbackCursorPoint(null);
          if (presetPreview) {
            setPresetPreview((current) => current ? { ...current, point } : null);
          } else if (activeTool === "furniture") {
            const candidate = buildEventAssetCandidate({
              template: activeTemplate,
              point,
              existing: eventFurniture,
              canvasWidth: canvasW,
              canvasHeight: canvasH,
              grid: floorPlan.gridSize || 0,
              zoom,
              snapEnabled,
              blockedRegions: protectedRegions,
            });
            setPlacementPoint(point);
            setSnapGuides(candidate.guides);
            setPlacementError(candidate.assessment.blockingReason);
          }
        }}
        onPointerLeave={() => setFeedbackCursorPoint(null)}
        onPointerCancel={() => setFeedbackCursorPoint(null)}
        onLostPointerCapture={handleCanvasLostPointerCapture}
        onWheelCapture={(e) => {
          // Capture browser pinch/page-zoom gestures even when the pointer is over the asset picker.
          if (e.ctrlKey || e.metaKey) e.preventDefault();
        }}
        onWheel={handleCanvasWheel}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        {feedbackPlacementActive && feedbackCursorPoint && <div ref={feedbackCursorRef} data-testid="feedback-pin-cursor-preview" aria-hidden="true" className="pointer-events-none absolute z-50 h-8 w-8 -translate-x-1/2 -translate-y-full" style={{ left: feedbackCursorPoint.x, top: feedbackCursorPoint.y }}>
          <MapPin className="h-full w-full fill-amber-500 stroke-white drop-shadow-md" strokeWidth={2} />
        </div>}
        {draftFeedbackPoint && <div aria-label="Unsaved feedback pin position" className="pointer-events-none absolute z-50 flex h-6 w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 border-dashed border-white bg-amber-600 text-xs font-bold text-white shadow-sm ring-2 ring-amber-500/25" style={{ left: draftFeedbackPoint.x * zoom + pan.x, top: draftFeedbackPoint.y * zoom + pan.y }}><span className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-amber-600" /><span className="relative">+</span></div>}
        {feedbackPins.map((pin, index) => <button key={pin.id} type="button" data-event-editor-chrome aria-label={`Feedback pin ${index + 1}: ${pin.comment}`} title={`${pin.addressed ? "Addressed" : "Open"}: ${pin.comment}`} onClick={event => { event.stopPropagation(); }} className="absolute z-40 flex h-6 w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 border-white bg-amber-600 text-[10px] font-bold text-white shadow-sm before:absolute before:-inset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" style={{ left: pin.x * zoom + pan.x, top: pin.y * zoom + pan.y, backgroundColor: pin.addressed ? "#047857" : undefined }}><span className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-inherit" /><span className="relative">{index + 1}</span></button>)}
        {feedbackPins.length > 0 && <details data-event-editor-chrome data-map-feedback className="absolute bottom-3 right-3 z-40 max-h-40 w-[min(18rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-lg"><summary className="cursor-pointer text-xs font-bold">GSO feedback &middot; {feedbackPins.length} {feedbackPins.length === 1 ? "pin" : "pins"}</summary>{feedbackPins.map((pin, index) => <button key={pin.id} type="button" onClick={event => { event.stopPropagation(); const rect = canvasRef.current?.getBoundingClientRect(); if (rect) animateViewportTo({ zoom: Math.max(zoom, 1), pan: { x: rect.width / 2 - pin.x * Math.max(zoom, 1), y: rect.height / 2 - pin.y * Math.max(zoom, 1) } }, 180); }} className="mb-1 block w-full rounded-lg p-2 text-left text-xs hover:bg-muted"><strong className="text-amber-700 dark:text-amber-400">Pin {index + 1}</strong> · {pin.addressed ? "Addressed · " : "Open · "}{pin.comment}</button>)}</details>}
        {!readOnly && activeTool === "furniture" && (
          <div
            data-testid="event-asset-dock"
            data-event-tour="asset-picker"
            className={cn("event-asset-dock absolute left-3 top-3 z-40", presetConfigCompact && "max-h-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl")}
          >
          <EventPlacementDock
            className="relative"
            layoutPreviewActive={presetConfigCompact && Boolean(presetPreview)}
            catalogOpen={assetCatalogOpen}
            activeAssetKey={activeTemplate.assetKey ?? activeTemplate.type}
            disabled={itemGestureActive}
            repeatPlacement={repeatPlacement}
            placementActive={Boolean(activeTool === "furniture")}
            touchPlacementReady={touchPlacementReady}
            canPlace={presetPreview
              ? Boolean(presetValidation?.options && presetAssessment?.canPlace)
              : Boolean(placementCandidate?.assessment.canPlace)}
            layoutsOpen={presetMenuOpen}
            onCatalogOpenChange={(open) => {
              if (open) {
                setPresetMenuOpen(false);
                setPresetPreview(null);
                setObjectListOpen(false);
                setInspectorOpen(false);
                setSelectionArrangeOpen(false);
              }
              setAssetCatalogOpen(open);
            }}
            onSelectAsset={(asset) => {
              setAssetCatalogOpen(false);
              setPresetMenuOpen(false);
              setObjectListOpen(false);
              setInspectorOpen(false);
              setActiveTemplate(getEventFurnitureTemplate(asset.key));
              setPresetPreview(null);
              setPlacementPoint(null);
              setTouchPlacementReady(false);
              setPlacementError(null);
            }}
            onRepeatPlacementChange={setRepeatPlacement}
            onOpenLayouts={() => {
              setAssetCatalogOpen(false);
              setObjectListOpen(false);
              setInspectorOpen(false);
              setSelectionArrangeOpen(false);
              setPresetMenuOpen(true);
            }}
            onCloseLayouts={() => setPresetMenuOpen(false)}
            onCancelPlacement={() => {
              selectTool("select");
            }}
            onPlaceHere={() => {
              if (presetPreview) {
                placePreset(presetPreview, previewItems, presetAssessment, presetValidation);
                return;
              }
              if (!placementCandidate) return;
              commitFurnitureCandidate(placementCandidate.item, placementCandidate.assessment);
            }}
          >
              {presetMenuOpen && (
                <div
                  role="menu"
                  aria-label="Ready-made event layouts"
                  className="mt-2 max-h-[min(35vh,16rem)] overflow-y-auto overscroll-contain border-t border-border/70 pt-2"
                >
                  <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">Choose a ready-made layout</p>
                  <div className="mt-1 flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {EVENT_LAYOUT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          const point = rect && rect.width > 0 && rect.height > 0
                            ? getCanvasWorldPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
                            : { x: canvasW / 2, y: canvasH / 2 };
                          setPresetConfigurationOpen(presetConfigCompact);
                          setPresetPreview({
                            id: preset.id,
                            count: preset.id === "chair-row" ? "10" : "1",
                            chairsPerRow: "5",
                            spacing: preset.id === "chair-row" ? "34" : "180",
                            rotation: "0",
                            columnGap: "18",
                            rowGap: "24",
                            centerAisle: false,
                            centerAisleGap: "24",
                            point: point ?? { x: canvasW / 2, y: canvasH / 2 },
                          });
                          setPlacementPoint(null);
                          setTouchPlacementReady(false);
                          setPlacementError(null);
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
            {placementError && !presetPreview && <p role="alert" className="mt-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{placementError}</p>}
            {presetPreview && (presetConfigCompact ? (
              <Dialog.Root open={presetConfigurationOpen} onOpenChange={setPresetConfigurationOpen}>
                <div className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-border/70 pt-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{EVENT_LAYOUT_PRESETS.find((preset) => preset.id === presetPreview.id)?.name} preview</p>
                    <p className="text-[10px] text-muted-foreground">Tap the map, then Place here.</p>
                  </div>
                  <Dialog.Trigger asChild><button type="button" aria-label="Edit layout settings" className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Edit layout</button></Dialog.Trigger>
                </div>
                {(!presetValidation?.options || (presetAssessment && !presetAssessment.canPlace)) && (
                  <p role="alert" className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    {!presetValidation?.options ? "Correct the highlighted values in Edit layout before placing." : getPresetPlacementMessage(presetAssessment)}
                  </p>
                )}
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-[79] bg-background/55 backdrop-blur-[2px]" />
                  <Dialog.Content
                    data-event-editor-chrome
                    data-testid="event-layout-settings-sheet"
                    style={{ maxHeight: Math.min(presetSheetViewport.height * 0.85, 672), bottom: presetSheetViewport.bottom }}
                    onEscapeKeyDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[min(85dvh,42rem)] min-h-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl outline-none"
                  >
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
                      <div className="min-w-0"><Dialog.Title className="text-sm font-extrabold">Layout settings</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Configure the layout, then preview its position on the map.</Dialog.Description></div>
                      <Dialog.Close asChild><button type="button" aria-label="Close layout settings" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-4 w-4" aria-hidden="true" /></button></Dialog.Close>
                    </div>
                    <div data-testid="event-preset-controls" className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4">{presetConfigurationFields}</div>
                    <div className="shrink-0 border-t border-border p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                      <Dialog.Close asChild><button type="button" disabled={!presetValidation?.options} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Preview on map</button></Dialog.Close>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : (
              <div data-testid="event-preset-controls" className="mt-2 max-h-[min(58vh,30rem)] max-w-full touch-pan-y overflow-y-auto overscroll-contain border-t border-border/70 pt-3" onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setPresetPreview(null);
                  setPlacementError(null);
                  setTouchPlacementReady(false);
                }
              }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-xs font-bold text-foreground">{EVENT_LAYOUT_PRESETS.find((preset) => preset.id === presetPreview.id)?.name} preview</p><p className="text-[10px] text-muted-foreground">Move the pointer or tap the map to position the layout.</p></div>
                  <button type="button" onClick={() => { setPresetPreview(null); setPlacementError(null); setTouchPlacementReady(false); }} aria-label="Cancel preset preview" className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Cancel</button>
                </div>
                {presetConfigurationFields}
              </div>
            ))}
          </EventPlacementDock>
          </div>
        )}

        {!readOnly && objectListOpen && (
          <section
            data-event-editor-chrome
            aria-label="Event objects"
            className="absolute right-3 top-[4.5rem] z-50 flex max-h-[calc(100%-5.25rem)] w-[min(19rem,calc(100%-1.5rem))] flex-col rounded-2xl border border-border/80 bg-card/95 p-3 shadow-2xl backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold text-foreground">Event objects</h3>
              <button type="button" aria-label="Close event objects" onClick={() => setObjectListOpen(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted">Close</button>
            </div>
            <input type="search" aria-label="Search event objects" placeholder="Search placed items" value={objectQuery} onChange={(event) => setObjectQuery(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" />
            <div className="my-2 flex gap-1" aria-label="Filter event objects">
              {(["all", "furniture", "labels"] as const).map((filter) => (
                <button key={filter} type="button" aria-pressed={objectFilter === filter} onClick={() => setObjectFilter(filter)} className={cn("rounded-lg px-2 py-1 text-[10px] font-bold capitalize", objectFilter === filter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{filter}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
              {visibleObjectList.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex min-h-10 items-center gap-1 rounded-xl border px-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
                    editingObject?.id === item.id
                      ? "border-primary bg-primary/5"
                      : selectedIds.includes(item.id)
                        ? "border-primary/70 bg-primary/5"
                        : "border-transparent hover:border-border/70 hover:bg-muted/70",
                  )}
                >
                  {editingObject?.id === item.id ? (
                    <>
                      <input
                        autoFocus
                        aria-label={`Rename ${item.kind === "labels" ? "label" : "item"}`}
                        value={editingObject.value}
                        onChange={(event) => setEditingObject((current) => current?.id === item.id ? { ...current, value: event.target.value } : current)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitObjectRename();
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            setEditingObject(null);
                          }
                        }}
                        className="h-8 min-w-0 flex-1 bg-transparent px-2 text-xs font-semibold text-foreground outline-none"
                      />
                      <button type="button" aria-label={`Save name for ${item.name}`} title="Save name" onClick={commitObjectRename} disabled={!editingObject.value.trim()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label={`Cancel renaming ${item.name}`} title="Cancel" onClick={() => setEditingObject(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label={`Select ${item.name}`}
                        onClick={() => {
                          setSelectedIds([item.id]);
                          setSelectedId(item.id);
                          setSelectedType(item.kind === "labels" ? "label" : "furniture");
                          selectTool("select");
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect?.width && rect.height) setImmediateViewport({ zoom, pan: clampEventPan({
                            x: rect.width / 2 - (item.x + item.width / 2) * zoom,
                            y: rect.height / 2 - (item.y + item.height / 2) * zoom,
                          }, zoom) });
                        }}
                        className="flex min-h-9 min-w-0 flex-1 items-center justify-between py-1.5 pl-1 text-left text-xs"
                      >
                        <span className="min-w-0 truncate font-bold text-foreground">{item.name}</span>
                        <span className="ml-2 shrink-0 text-[9px] capitalize text-muted-foreground">{item.kind === "labels" ? "Label" : "Item"}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Rename ${item.name}`}
                        title={item.locked ? "Unlock this item to rename it" : `Rename ${item.name}`}
                        disabled={item.locked}
                        onClick={() => setEditingObject({ id: item.id, value: item.name, kind: item.kind })}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {visibleObjectList.length === 0 && <p className="p-2 text-xs text-muted-foreground">No matching items</p>}
            </div>
          </section>
        )}

        {!readOnly && !inspectorViewportCompact && !transforming && !isPanning && !pinchActive && !placementCandidate && !presetPreview && selectedIds.length > 1 && (
          <div
            data-testid="event-layout-actions"
            data-event-editor-chrome
            aria-label="Multiple event items selected"
            className="pointer-events-none absolute z-50 max-w-[calc(100%-1.5rem)]"
            style={{
              left: Math.max(12, Math.min((eventSelectionBounds?.x ?? 12) * zoom + pan.x, (canvasRef.current?.clientWidth ?? Number.POSITIVE_INFINITY) - 520)),
              top: Math.max(12, (eventSelectionBounds?.y ?? 68) * zoom + pan.y - 56),
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="relative pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
              <span className="shrink-0 px-1 text-[10px] font-extrabold text-foreground">{selectedIds.length} items selected</span>
              {selectionAllFurniture && (
              <button
                type="button"
                aria-label="Rotate selected items"
                title="Rotate selected items 15°"
                onClick={rotateClockwise}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Rotate
              </button>
              )}
              {selectionAllFurniture && selectedFurnitureIds.length > 1 && (
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
              )}
              {selectionAllFurniture && selectedFurnitureIds.length > 1 && (
              <button
                type="button"
                aria-label="Arrange selected items"
                title={selectedUnlockedFurnitureIds.length < 2 ? "Select at least two unlocked items to arrange." : "Arrange selection"}
                aria-expanded={selectionArrangeOpen}
                disabled={selectedUnlockedFurnitureIds.length < 2}
                onClick={() => {
                  setPresetMenuOpen(false);
                  setSelectionArrangeOpen((current) => !current);
                }}
                className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 text-[10px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Arrange
                {selectionArrangeOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
              )}
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
              {layoutActionError && <p role="alert" className="absolute left-0 top-[calc(100%+0.5rem)] z-[51] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-destructive/30 bg-card p-3 text-xs text-destructive shadow-xl">{layoutActionError}</p>}
            </div>
          </div>
        )}

        <div
          data-event-editor-chrome
          className="absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-0.5 rounded-xl border border-border/70 bg-card/90 p-1 shadow-lg backdrop-blur-sm"
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
              aria-label="Fit map"
              title="Fit map to content"
              disabled={itemGestureActive}
            onClick={resetViewport}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          {readOnly && <button type="button" aria-label="Pan map" aria-pressed={previewPanMode} title="Pan: drag map · H toggles · hold Space temporarily" onClick={() => setPreviewPanMode(current => !current)} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-muted-foreground hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:text-primary"><Hand className="h-4 w-4" /><span>Pan</span></button>}
          {readOnly && <details className="relative text-xs text-muted-foreground"><summary className="cursor-pointer rounded-lg px-2 py-2">Shortcuts</summary><div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-card p-3 shadow-xl"><p>Drag: pan while Pan is on</p><p className="mt-1">Space + drag: temporary pan</p><p className="mt-1">H: toggle Pan · 0: fit map</p><p className="mt-1">Ctrl / ⌘ + scroll: zoom</p><p className="mt-1">Click the map first for shortcuts.</p></div></details>}
          <button
            type="button"
            aria-label={readOnly ? "Focus event items" : "Focus selection"}
            title={readOnly ? "Fit the requested event items into view" : selectedFocusBounds ? "Focus selection" : "Select a visible item to focus it"}
            disabled={!selectedFocusBounds || itemGestureActive}
            onClick={focusSelection}
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-extrabold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{readOnly ? "Focus items" : "Focus"}</span>
          </button>
        </div>

        {moveHereArmedIds && <div data-testid="event-move-here-controls" data-event-editor-chrome className="absolute bottom-3 left-1/2 z-[70] w-[min(24rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-3 text-foreground shadow-2xl backdrop-blur-sm" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <p className="text-xs font-bold">{moveHerePreview ? (moveHerePreview.canMove ? "Review the new position." : moveHerePreview.blockingReason) : "Tap a map destination. The preview will not move items until you confirm."}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" aria-label="Cancel move" onClick={() => { setMoveHereArmedIds(null); setMoveHerePreview(null); }} className="min-h-10 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted">Cancel</button>
            {moveHerePreview && <button type="button" aria-label="Confirm move here" disabled={!moveHerePreview.canMove} onClick={confirmMoveHere} className="min-h-10 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Move here</button>}
          </div>
        </div>}

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

          {placementGuides && <svg data-testid="event-placement-guides" aria-hidden="true" width={canvasW} height={canvasH} className="pointer-events-none absolute inset-0 z-40 overflow-visible" style={{ pointerEvents: "none" }}>
            {placementGuides.alignments.map((guide) => <line key={`alignment-${guide.axis}`} data-testid={`event-alignment-guide-${guide.axis}`} x1={guide.axis === "x" ? guide.value : guide.from} y1={guide.axis === "x" ? guide.from : guide.value} x2={guide.axis === "x" ? guide.value : guide.to} y2={guide.axis === "x" ? guide.to : guide.value} stroke="var(--primary, #153176)" strokeWidth={1.5 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />)}
            {placementGuides.gaps.map((guide) => <g key={`gap-${guide.axis}`}>
              <line x1={guide.axis === "x" ? guide.from : guide.cross} y1={guide.axis === "x" ? guide.cross : guide.from} x2={guide.axis === "x" ? guide.to : guide.cross} y2={guide.axis === "x" ? guide.cross : guide.to} stroke="#0369a1" strokeWidth={1 / zoom} />
              <text x={guide.axis === "x" ? (guide.from + guide.to) / 2 : guide.cross + 6 / zoom} y={guide.axis === "x" ? guide.cross - 6 / zoom : (guide.from + guide.to) / 2} textAnchor={guide.axis === "x" ? "middle" : "start"} fontSize={11 / zoom} fontWeight={600} fill="#0369a1" stroke="var(--card, white)" strokeWidth={3 / zoom} paintOrder="stroke">{Math.round(guide.distance * 10) / 10} map units</text>
            </g>)}
          </svg>}

          {marquee && (
            <div
              data-testid="event-selection-marquee"
              aria-hidden="true"
              className="pointer-events-none absolute z-40 border border-primary bg-primary/15"
              style={{
                left: Math.min(marquee.x, marquee.x + marquee.width),
                top: Math.min(marquee.y, marquee.y + marquee.height),
                width: Math.abs(marquee.width),
                height: Math.abs(marquee.height),
              }}
            />
          )}

          {/* Event Furniture (editable) */}
          {eventFurniture.map((f, index) => {
            return (
              <div
              key={f.id}
              data-event-item
              draggable={false}
              data-testid={`event-furniture-${f.id}`}
              className={cn(
                "absolute rounded",
                !readOnly && (effectiveTool === "pan"
                  ? isPanning || pinchActive ? "cursor-grabbing" : "cursor-grab"
                  : f.locked ? "cursor-default" : "cursor-move"),
              )}
                style={{
                left: f.x,
                top: f.y,
                width: f.width,
                height: f.height,
                transform: `rotate(${f.rotation || 0}deg)`,
                opacity: f.visible === false ? 0.45 : 1,
                zIndex: (f.zOrder ?? index) + 10,
              }}
              title={`${f.name} — ${f.locked ? "locked" : "drag to move"}`}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(e) => beginPointerGesture(e, () => {
                if (effectiveTool === "pan" || e.button === 1) handlePanStart(e);
                else handleItemMouseDown(e, f.id, "furniture");
              }, "item")}
            >
              <EventAssetVisual type={resolveCanvasAssetKey(f) ?? f.type} label={f.name} className="absolute inset-0 h-full w-full" />
              </div>
            );
          })}

          {moveHerePreview && <div data-testid="event-move-here-preview" aria-label={moveHerePreview.canMove ? "Move preview" : `Move preview blocked: ${moveHerePreview.blockingReason}`} aria-invalid={!moveHerePreview.canMove} className="pointer-events-none absolute inset-0 z-[150]">
            {moveHerePreview.furniture.filter((item) => moveHerePreview.targetIds.includes(item.id)).map((item) => <div key={item.id} aria-hidden="true" className={cn("absolute rounded border-2 border-dashed", moveHerePreview.canMove ? "border-primary bg-primary/15" : "border-destructive bg-destructive/15")} style={{ left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation || 0}deg)` }}><EventAssetVisual type={resolveCanvasAssetKey(item) ?? item.type} label={item.name} className="absolute inset-0 h-full w-full opacity-65" /></div>)}
          </div>}

          {placementCandidate && activeTool === "furniture" && (
            <div
              data-testid="event-placement-preview"
              aria-label={placementCandidate.assessment.canPlace
                ? `${placementCandidate.item.name} placement preview`
                : `${placementCandidate.item.name} placement preview blocked: ${placementCandidate.assessment.blockingReason}`}
              aria-invalid={!placementCandidate.assessment.canPlace}
              className={cn(
                "pointer-events-none absolute z-[150] rounded border-2 border-dashed",
                placementCandidate.assessment.canPlace ? "border-primary/80 bg-primary/5" : "border-destructive bg-destructive/10",
              )}
              style={{
                left: placementCandidate.item.x,
                top: placementCandidate.item.y,
                width: placementCandidate.item.width,
                height: placementCandidate.item.height,
                transform: `rotate(${placementCandidate.item.rotation || 0}deg)`,
              }}
            >
              <EventAssetVisual
                type={resolveCanvasAssetKey(placementCandidate.item) ?? placementCandidate.item.type}
                label={placementCandidate.item.name}
                className="absolute inset-0 h-full w-full opacity-60"
              />
            </div>
          )}

          <EventSelectionOverlay
            items={eventFurniture}
            selectedIds={selectedIds}
            zoom={zoom}
            readOnly={readOnly}
            panActive={effectiveTool === "pan" || isPanning || pinchActive}
            onRotatePointerDown={(event, item) => beginPointerGesture(event, () => {
              if (effectiveTool === "pan" || event.button === 1) handlePanStart(event);
              else handleRotateStart(event, item);
            }, "handle")}
          />

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
                  : l.locked ? "cursor-default" : inlineLabelEdit?.id === l.id ? "cursor-text" : "cursor-move"),
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
              title={readOnly || l.locked ? undefined : "Double-click to edit text · drag to move"}
              onDoubleClick={(event) => { event.stopPropagation(); beginInlineLabelEdit(l); }}
            >
              {inlineLabelEdit?.id === l.id ? <input
                data-event-editor-chrome
                aria-label="Edit label text"
                autoFocus
                value={inlineLabelEdit.value}
                style={{ width: `${Math.min(32, Math.max(12, inlineLabelEdit.value.length + 2))}ch`, font: "inherit", color: "inherit" }}
                className="rounded border border-primary bg-card px-1 py-0.5 text-foreground shadow-sm outline-none select-text"
                onFocus={(event) => event.currentTarget.select()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onChange={(event) => { const edit = { id: l.id, value: event.target.value }; inlineLabelEditRef.current = edit; setInlineLabelEdit(edit); }}
                onBlur={() => finishInlineLabelEdit()}
                onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); finishInlineLabelEdit(event.key === "Escape"); canvasRef.current?.focus(); } }}
              /> : l.text}
            </div>
          ))}
          {presetPreview && (
            <div data-testid="event-preset-preview" aria-label="Preset placement preview" className="pointer-events-none absolute inset-0 z-40">
              {previewItems.map((item) => (
                <div key={item.id} className="absolute rounded border-2 border-dashed border-primary bg-card/45 opacity-65" style={{ left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation || 0}deg)` }}>
                  <EventAssetVisual type={resolveCanvasAssetKey(item) ?? item.type} label={item.name} className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)]" />
                </div>
              ))}
            </div>
              )}
            </div>

        {!readOnly && !inlineLabelEdit && !inspectorViewportCompact && !transforming && !isPanning && !pinchActive && selectedLabel && selectedIds.length === 1 && (
          <div
            data-testid="event-label-actions"
            data-event-editor-chrome
            aria-label="Selected event label actions"
            className="pointer-events-none absolute z-50 max-w-[calc(100%-1.5rem)]"
            style={getSelectedActionsPosition(selectedLabel.x, selectedLabel.y, selectedLabel.y + (selectedLabel.fontSize || 14), 360)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
              <span className="max-w-28 truncate px-1 text-[10px] font-extrabold text-foreground">Label selected</span>
              <button type="button" disabled={selectedLabel.locked} onClick={() => beginInlineLabelEdit(selectedLabel)} className="min-h-10 shrink-0 rounded-xl border border-border/70 px-3 text-[10px] font-bold hover:bg-muted disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary">Edit text</button>
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
              <button
                type="button"
                aria-label="Delete selected label"
                title="Delete selected label (Del)"
                disabled={selectedLabel.locked}
                onClick={deleteSelected}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-destructive/30 px-3 text-[10px] font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>
        )}

        {!readOnly && !inspectorViewportCompact && !transforming && !isPanning && !pinchActive && !placementCandidate && !presetPreview && eventSelectionBounds && selectedIds.length === 1 && (
          <div
            data-testid="event-single-item-actions"
            data-event-editor-chrome
            aria-label="Selected event item actions"
            className="pointer-events-none absolute z-50 max-w-[calc(100%-1.5rem)]"
            style={getSelectedActionsPosition(eventSelectionBounds.x, eventSelectionBounds.y, eventSelectionBounds.y + eventSelectionBounds.height, 340)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
              <span className="shrink-0 px-1 text-[10px] font-extrabold text-foreground">1 item selected</span>
              {!selectedFurniture?.locked && (
                <>
                  <button
                    type="button"
                    aria-label="Rotate selected item counterclockwise"
                    title="Rotate counterclockwise by 15°"
                    onClick={() => rotateSelection("counterclockwise")}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Rotate selected item"
                    aria-description="Rotate clockwise by 15 degrees"
                    title="Rotate clockwise by 15°"
                    onClick={rotateClockwise}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <RotateCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label="Open item details"
                title="Open item details"
                onClick={(event) => openInspectorFrom(event.currentTarget)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={selectedFurniture?.locked ? "Unlock selected item" : "Lock selected item"}
                title={selectedFurniture?.locked ? "Unlock selected item" : "Lock selected item"}
                onClick={toggleSelectedLock}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {selectedFurniture?.locked ? <Unlock className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                aria-label="Delete selected item"
                title="Delete selected item (Del)"
                disabled={selectedFurniture?.locked}
                onClick={deleteSelected}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/30 text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
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
      {!readOnly && !inspectorViewportCompact && inspectorOpen && hasInspectorSelection && (
        <aside data-testid="event-item-inspector-rail" aria-label="Event item inspector rail" className="flex w-[17rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-card p-4">
          {selectedIds.length > 1 ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <h3 className="text-sm font-extrabold text-foreground">Bulk selection</h3>
              <p className="mt-1 text-xs text-muted-foreground">{selectedIds.length} event objects selected. Drag a selected item to move them together, or use the selection actions on the map.</p>
            </div>
          ) : inspectorPanel}
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
              className="max-w-[11rem] truncate rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary empty:hidden"
            >
              {panStatus}
            </span>
            {readOnly && <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 font-bold text-foreground">Read-only</span>}
            <span className="hidden sm:inline">{readOnly
              ? "Published base map and submitted additions"
              : "Hold V: Select · T: Label · Drag empty map: select · Del: delete · Space + drag: pan"}</span>
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
