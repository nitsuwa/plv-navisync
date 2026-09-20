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
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  BringToFront,
  SendToBack,
  Eye,
  EyeOff,
  Group,
  Ungroup,
  X,
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
import { applyLayoutAction, nudgeItems, selectionBounds, snapLayoutPosition, type LayoutAction, type LayoutSnapGuide } from "../../lib/eventLayoutGeometry";
import { resizeFurnitureWithinFloor } from "../../lib/floorGeometry";
import { EVENT_LAYOUT_PRESETS, getEventLayoutPreset, type EventLayoutPresetId } from "../../lib/eventLayoutPresets";
import { validateEventLayout } from "../../lib/eventLayoutValidation";

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
  nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
  n: "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize",
  ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
  e: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "-bottom-1.5 -right-1.5 cursor-nwse-resize",
  s: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  w: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize",
};

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
  ) => Promise<void>;
  /** Called when the user submits for approval */
  onSubmit: (
    furniture: FloorFurniture[],
    labels: FloorLabel[]
  ) => Promise<void>;
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

export function EventFloorEditor({
  floorPlan,
  overlay,
  onSave,
  onSubmit,
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

  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const draftLocation = overlay.locationRef;
  const draftStorageKey = draftLocation ? eventLayoutDraftStorageKey(overlay.id, draftLocation) : null;
  const draftStateRef = useRef({ eventFurniture, eventLabels });
  const draftDirtyRef = useRef(false);
  const draftHydratedRef = useRef(false);

  useEffect(() => {
    draftStateRef.current = { eventFurniture, eventLabels };
  }, [eventFurniture, eventLabels]);

  useEffect(() => {
    if (!draftStorageKey) return;
    if (!draftHydratedRef.current) {
      draftHydratedRef.current = true;
      return;
    }
    if (readOnly) return;

    draftDirtyRef.current = true;
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
  }, [draftLocation, draftStorageKey, eventFurniture, eventLabels, overlay.id, readOnly]);

  useEffect(() => {
    if (!draftStorageKey || !draftLocation || readOnly) return;
    const flushDraft = () => {
      if (!draftDirtyRef.current) return;
      writeEventLayoutDraft(
        overlay.id,
        draftLocation,
        draftStateRef.current.eventFurniture,
        draftStateRef.current.eventLabels,
      );
      draftDirtyRef.current = false;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDraft();
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
    furniture: eventFurniture,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
  }), [canvasH, canvasW, eventFurniture]);
  const viewportBackground = floorPlan.id === "campus" && activeCampus
    ? campusGroundAppearance(activeCampus).color
    : floorPlan.backgroundColor || "var(--map-floor-corridor, #f3f4f6)";

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

  const fitViewportToContent = useCallback(() => {
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
    setZoom(next.zoom);
    setPan(clampEventPan(next.pan, next.zoom));
    fittedViewportKeyRef.current = viewportLocationKey;
    return true;
  }, [canvasH, canvasW, clampEventPan, eventContentBounds, getEventMinZoom, viewportLocationKey]);

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
      const newFurniture = eventFurnitureFromTemplate(template, x, y, genId());
      const updated = [...eventFurniture, newFurniture];
      setEventFurniture(updated);
      pushHistory(updated, eventLabels);
      setSelectedId(newFurniture.id);
      setSelectedType("furniture");
      setSelectedIds([newFurniture.id]);
    },
    [eventFurniture, eventLabels, pushHistory, readOnly]
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
      if (activeTool === "pan" || spaceHeld) return;
      if (dragging || resizing || rotating) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom - pan.x / zoom;
      const y = (e.clientY - rect.top) / zoom - pan.y / zoom;

      if (activeTool === "furniture") {
        if ((e.target as HTMLElement).closest("[data-event-item]")) return;
        // Place the currently selected event template centered on the click
        placeFurniture(activeTemplate, x - activeTemplate.width / 2, y - activeTemplate.height / 2);
      } else if (activeTool === "text") {
        placeLabel(x, y);
      } else if (activeTool === "select") {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-event-item]")) {
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
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return {
      x: (clientX - rect.left - pan.x) / safeZoom,
      y: (clientY - rect.top - pan.y) / safeZoom,
    };
  }, [pan, zoom]);

  // ── Mouse drag for moving items ────────────────────────────────────────
  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent, id: string, type: "furniture" | "label") => {
      e.stopPropagation();
      if (readOnly) return;
      if (spaceHeld) {
        e.preventDefault();
        panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
        return;
      }
      if (activeTool !== "select" && activeTool !== "furniture") return;

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

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = (e.clientX - rect.left) / zoom - pan.x / zoom;
      const mouseY = (e.clientY - rect.top) / zoom - pan.y / zoom;

      const groupId = type === "furniture" ? (item as FloorFurniture).groupId : undefined;
      const unlockedSelectedIds = selectedIds.filter((selected) => {
        const selectedFurniture = eventFurniture.find((candidate) => candidate.id === selected);
        const selectedLabel = eventLabels.find((candidate) => candidate.id === selected);
        return !selectedFurniture?.locked && !selectedLabel?.locked;
      });
      let dragIds = type === "furniture" && groupId
        ? eventFurniture.filter((candidate) => candidate.groupId === groupId && !candidate.locked).map((candidate) => candidate.id)
        : selectedIds.includes(id) ? unlockedSelectedIds : [id];

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
        setEventFurniture(nextFurniture);
        pushHistory(nextFurniture, eventLabels);
        dragIds = duplicates.map((duplicate) => duplicate.id);
        item = duplicates[sourceItems.findIndex((source) => source.id === id)] ?? duplicates[0];
      }

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
    },
    [activeTool, zoom, pan, eventFurniture, eventLabels, pushHistory, readOnly, spaceHeld, selectedIds]
  );

  const handleMouseMove = useCallback(
    (e: Pick<React.MouseEvent, "clientX" | "clientY" | "shiftKey">) => {
      if (readOnly) return;
      if (panRef.current) return;

      const point = getCanvasWorldPoint(e.clientX, e.clientY);
      if (!point) return;
      const { x: mouseX, y: mouseY } = point;
      if (rotating) {
        setSnapGuides([]);
        const currentAngle = Math.atan2(mouseY - rotating.centerY, mouseX - rotating.centerX);
        let deltaDegrees = (currentAngle - rotating.startAngle) * (180 / Math.PI);
        if (deltaDegrees > 180) deltaDegrees -= 360;
        if (deltaDegrees < -180) deltaDegrees += 360;
        const rawRotation = rotating.startRotation + deltaDegrees;
        const normalizedRotation = ((rawRotation % 360) + 360) % 360;
        const nextRotation = e.shiftKey
          ? Math.round(normalizedRotation / 15) * 15
          : Math.round(normalizedRotation * 100) / 100;
        setEventFurniture((prev) => prev.map((item) => item.id === rotating.id
          ? { ...item, rotation: nextRotation % 360 }
          : item));
        return;
      }
      if (resizing) {
        setSnapGuides([]);
        setEventFurniture((prev) => prev.map((item) => item.id === resizing.id
          ? resizeFurnitureWithinFloor(
            item,
            resizing.handle,
            mouseX - resizing.startMouseX,
            mouseY - resizing.startMouseY,
            canvasW,
            canvasH,
            e.shiftKey,
          )
          : item));
        return;
      }
      if (!dragging) return;
      const requestedX = mouseX - dragging.offsetX;
      const requestedY = mouseY - dragging.offsetY;
      const draggedItem = dragging.type === "furniture"
        ? eventFurniture.find((item) => item.id === dragging.id)
        : null;
      const snappedPosition = draggedItem && dragging.ids.length === 1
        ? snapLayoutPosition({
          item: draggedItem,
          x: requestedX,
          y: requestedY,
          items: eventFurniture,
          selectedIds: dragging.ids,
          grid: floorPlan.gridSize || 0,
          threshold: Math.max(5, 8 / Math.max(0.25, zoom)),
          snapToGrid: snapEnabled,
        })
        : { x: requestedX, y: requestedY, guides: [] };
      const newX = snappedPosition.x;
      const newY = snappedPosition.y;
      setSnapGuides(snappedPosition.guides);
      const selectedFurniture = eventFurniture.filter((item) => dragging.ids.includes(item.id));
      const selectedLabels = eventLabels.filter((item) => dragging.ids.includes(item.id));
      const movingItems = [
        ...selectedFurniture.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height })),
        ...selectedLabels.map((item) => ({ x: item.x, y: item.y, width: 0, height: item.fontSize || 14 })),
      ];
      if (movingItems.length === 0) return;

      const currentX = dragging.type === "furniture"
        ? eventFurniture.find((item) => item.id === dragging.id)?.x ?? newX
        : eventLabels.find((item) => item.id === dragging.id)?.x ?? newX;
      const currentY = dragging.type === "furniture"
        ? eventFurniture.find((item) => item.id === dragging.id)?.y ?? newY
        : eventLabels.find((item) => item.id === dragging.id)?.y ?? newY;
      const minDeltaX = Math.max(...movingItems.map((item) => -item.x));
      const maxDeltaX = Math.min(...movingItems.map((item) => canvasW - item.width - item.x));
      const minDeltaY = Math.max(...movingItems.map((item) => -item.y));
      const maxDeltaY = Math.min(...movingItems.map((item) => canvasH - item.height - item.y));
      const deltaX = Math.min(maxDeltaX, Math.max(minDeltaX, newX - currentX));
      const deltaY = Math.min(maxDeltaY, Math.max(minDeltaY, newY - currentY));
      setEventFurniture((prev) => prev.map((item) => dragging.ids.includes(item.id)
        ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
        : item));
      setEventLabels((prev) => prev.map((item) => dragging.ids.includes(item.id)
        ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
        : item));
    },
    [dragging, floorPlan.gridSize, getCanvasWorldPoint, readOnly, eventFurniture, eventLabels, canvasW, canvasH, resizing, rotating, snapEnabled, zoom]
  );

  const handleMouseUp = useCallback(() => {
    if (!readOnly && (dragging || resizing || rotating)) {
      pushHistory(eventFurniture, eventLabels);
    }
    setDragging(null);
    setResizing(null);
    setRotating(null);
    setSnapGuides([]);
  }, [dragging, resizing, rotating, eventFurniture, eventLabels, pushHistory, readOnly]);

  useEffect(() => {
    const isInsideCanvas = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return Boolean(canvasRef.current?.contains(target));
    };
    const handleWindowMouseMove = (e: MouseEvent) => {
      if ((!dragging && !resizing && !rotating) || isInsideCanvas(e.target)) return;
      handleMouseMove(e);
    };
    const handleWindowMouseUp = (e: MouseEvent) => {
      if ((!dragging && !resizing && !rotating) || isInsideCanvas(e.target)) return;
      handleMouseUp();
    };
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp, resizing, rotating]);

  const handleResizeStart = useCallback((e: React.MouseEvent, item: FloorFurniture, handle: ResizeHandleDirection) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || item.locked || (activeTool !== "select" && activeTool !== "furniture") || spaceHeld) return;
    const point = getCanvasWorldPoint(e.clientX, e.clientY);
    if (!point) return;
    setSelectedId(item.id);
    setSelectedType("furniture");
    setSelectedIds([item.id]);
    setResizing({
      id: item.id,
      handle,
      startMouseX: point.x,
      startMouseY: point.y,
    });
  }, [activeTool, getCanvasWorldPoint, readOnly, spaceHeld]);

  const handleRotateStart = useCallback((e: React.MouseEvent, item: FloorFurniture) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || item.locked || (activeTool !== "select" && activeTool !== "furniture") || spaceHeld) return;
    const point = getCanvasWorldPoint(e.clientX, e.clientY);
    if (!point) return;
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    setSelectedId(item.id);
    setSelectedType("furniture");
    setSelectedIds([item.id]);
    setRotating({
      id: item.id,
      centerX,
      centerY,
      startAngle: Math.atan2(point.y - centerY, point.x - centerX),
      startRotation: item.rotation || 0,
    });
  }, [activeTool, getCanvasWorldPoint, readOnly, spaceHeld]);

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

  const toggleSelectedLock = useCallback(() => {
    if (!selectedFurniture) return;
    updateSelectedFurniture({ locked: !selectedFurniture.locked }, { allowLocked: true });
  }, [selectedFurniture, updateSelectedFurniture]);

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
    (e: React.MouseEvent) => {
      if (activeTool === "pan" || spaceHeld || e.button === 1) {
        e.preventDefault();
        panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
      }
    },
    [activeTool, pan, spaceHeld]
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!panRef.current) return;
      setPan(clampEventPan({
        x: panRef.current.px + (e.clientX - panRef.current.sx),
        y: panRef.current.py + (e.clientY - panRef.current.sy),
      }, zoom));
    },
    [clampEventPan, zoom]
  );

  const handlePanEnd = useCallback(() => {
    panRef.current = null;
  }, []);

  const handleZoomAt = useCallback((clientX: number, clientY: number, nextZoom: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clampedZoom = Math.min(EVENT_MAX_ZOOM, Math.max(getEventMinZoom(), nextZoom));
    const safeZoom = Math.max(0.01, zoom);
    const worldX = (clientX - rect.left - pan.x) / safeZoom;
    const worldY = (clientY - rect.top - pan.y) / safeZoom;
    setPan(clampEventPan(getPanToKeepWorldPoint({
      mapWidth: canvasW,
      mapHeight: canvasH,
      worldPoint: { x: worldX, y: worldY },
      pan,
      zoom: safeZoom,
      nextZoom: clampedZoom,
      zoomOrigin: "top-left",
    }), clampedZoom));
    setZoom(clampedZoom);
  }, [canvasH, canvasW, clampEventPan, getEventMinZoom, pan, zoom]);

  const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
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
        getSmoothZoomTarget(zoom, e.deltaY, getEventMinZoom(), EVENT_MAX_ZOOM, e.deltaMode, canvasRef.current?.clientHeight),
      );
      return;
    }
    if (delta.x === 0 && delta.y === 0) return;
    e.preventDefault();
    setPan((current) => clampEventPan({ x: current.x + delta.x, y: current.y + delta.y }, zoom));
  }, [clampEventPan, getEventMinZoom, handleZoomAt, zoom]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const first = e.touches[0];
      const second = e.touches[1];
      pinchRef.current = {
        distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
        zoom,
      };
      panRef.current = null;
      return;
    }
    if (e.touches.length !== 1 || (!readOnly && activeTool !== "pan")) return;
    e.preventDefault();
    const touch = e.touches[0];
    panRef.current = { sx: touch.clientX, sy: touch.clientY, px: pan.x, py: pan.y };
  }, [activeTool, pan, readOnly, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const first = e.touches[0];
      const second = e.touches[1];
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      const midpointX = (first.clientX + second.clientX) / 2;
      const midpointY = (first.clientY + second.clientY) / 2;
      handleZoomAt(midpointX, midpointY, pinchRef.current.zoom * (distance / Math.max(1, pinchRef.current.distance)));
      return;
    }
    if (e.touches.length !== 1 || !panRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    setPan(clampEventPan({
      x: panRef.current.px + touch.clientX - panRef.current.sx,
      y: panRef.current.py + touch.clientY - panRef.current.sy,
    }, zoom));
  }, [clampEventPan, handleZoomAt, zoom]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
    handlePanEnd();
  }, [handlePanEnd]);

  const resetViewport = useCallback(() => {
    fitViewportToContent();
  }, [fitViewportToContent]);

  const zoomViewportCenter = useCallback((direction: "in" | "out") => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const nextZoom = direction === "in" ? zoom * 1.2 : zoom / 1.2;
    handleZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextZoom);
  }, [handleZoomAt, zoom]);

  useEffect(() => {
    const onResize = () => {
      panRef.current = null;
      fitViewportToContent();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitViewportToContent]);

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
        panRef.current = null;
        setDragging(null);
        setRotating(null);
        setPresetMenuOpen(false);
        setSelectionArrangeOpen(false);
        setSelectedId(null);
        setSelectedType(null);
        setSelectedIds([]);
        setResizing(null);
        setSnapGuides([]);
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
    setSaving(true);
    try {
      await onSave(eventFurniture, eventLabels);
      if (draftLocation) {
        draftDirtyRef.current = false;
        clearEventLayoutDraft(overlay.id, draftLocation);
        setDraftRecovered(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmittingLocal(true);
    try {
      await onSubmit(eventFurniture, eventLabels);
      if (draftLocation) {
        draftDirtyRef.current = false;
        clearEventLayoutDraft(overlay.id, draftLocation);
        setDraftRecovered(false);
      }
    } finally {
      setSubmittingLocal(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col h-full bg-background">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-border bg-card shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            onClick={onBack}
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
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition-all",
                activeTool === tool.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tool.label}
            </button>
          );
        })}

        </div>}

      {!readOnly && layoutWarnings.length > 0 && (
        <div data-testid="event-layout-warnings" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-900 sm:px-4">
          <span className="shrink-0 font-extrabold">{layoutWarnings.length} layout note{layoutWarnings.length === 1 ? "" : "s"}</span>
          {layoutWarnings.slice(0, 3).map((warning, index) => (
            <button
              key={`${warning.code}-${warning.itemIds.join("-")}-${index}`}
              type="button"
              className="min-h-8 shrink-0 rounded-full border border-amber-300 bg-white/70 px-2.5 font-semibold transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
              onClick={() => {
                const id = warning.itemIds[0];
                const item = eventFurniture.find((candidate) => candidate.id === id);
                if (!item) return;
                setSelectedId(id);
                setSelectedType("furniture");
                setSelectedIds([id]);
              }}
            >
              Focus: {warning.message}
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        tabIndex={0}
        aria-label="Event layout canvas"
        className="min-h-0 flex-1 overflow-hidden relative cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        style={{
          background: viewportBackground,
          touchAction: "none",
          cursor:
            activeTool === "pan" || spaceHeld
              ? "grab"
              : activeTool === "select"
              ? "default"
              : "crosshair",
        }}
        onClick={handleCanvasClick}
        onMouseDown={(e) => {
          handlePanStart(e);
          if (spaceHeld) return;
          if (activeTool === "select" && !dragging) {
            // Check if we clicked on an item
            const target = e.target as HTMLElement;
            if (!target.closest("[data-event-item]")) {
              setSelectedId(null);
              setSelectedType(null);
              setSelectedIds([]);
            }
          }
        }}
        onMouseMove={(e) => {
          handlePanMove(e);
          handleMouseMove(e);
        }}
        onMouseUp={() => {
          handlePanEnd();
          handleMouseUp();
        }}
        onMouseLeave={() => {
          handlePanEnd();
        }}
        onWheelCapture={(e) => {
          // Capture browser pinch/page-zoom gestures even when the pointer is over the asset picker.
          if (e.ctrlKey || e.metaKey) e.preventDefault();
        }}
        onWheel={handleCanvasWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        {!readOnly && activeTool === "furniture" && (
          <div
            data-testid="event-asset-dock"
            className="event-asset-dock absolute left-3 top-3 z-40 max-w-[calc(100%-1.5rem)]"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CanvasAssetPalette
              surface="event"
              activeKey={activeTemplate.assetKey ?? activeTemplate.type}
              onSelect={(asset) => setActiveTemplate(getEventFurnitureTemplate(asset.key))}
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

        {!readOnly && eventSelectionBounds && selectedFurnitureIds.length > 1 && (
          <div
            data-testid="event-layout-actions"
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

        <div className="absolute right-3 top-3 z-30 flex items-center gap-0.5 rounded-xl border border-border/70 bg-card/90 p-1 shadow-lg backdrop-blur-sm">
          {!readOnly && (
            <button
              type="button"
              aria-label="Toggle snapping"
              aria-pressed={snapEnabled}
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
            disabled={zoom <= getEventMinZoom()}
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
            disabled={zoom >= EVENT_MAX_ZOOM}
            onClick={() => zoomViewportCenter("in")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Reset map view"
            title="Fit map to content"
            onClick={resetViewport}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom + Pan container */}
        <div
          data-testid="event-canvas-content"
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

            {floorPlan.id === "campus" && activeCampus ? (
              <ReadonlyOutdoorCampusScene
                campus={projectReadonlyOutdoorCampus(activeCampus)}
                showBuildings={true}
              />
            ) : (
              <>

            {/* Grid */}
            {floorPlan.showGrid !== false && (
              <g opacity={0.15}>
                {Array.from(
                  { length: Math.ceil(canvasW / (floorPlan.gridSize || 20)) + 1 },
                  (_, i) => i * (floorPlan.gridSize || 20)
                ).map((x) => (
                  <line
                    key={`gv-${x}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={canvasH}
                    stroke="#9ca3af"
                    strokeWidth={0.5}
                  />
                ))}
                {Array.from(
                  { length: Math.ceil(canvasH / (floorPlan.gridSize || 20)) + 1 },
                  (_, i) => i * (floorPlan.gridSize || 20)
                ).map((y) => (
                  <line
                    key={`gh-${y}`}
                    x1={0}
                    y1={y}
                    x2={canvasW}
                    y2={y}
                    stroke="#9ca3af"
                    strokeWidth={0.5}
                  />
                ))}
              </g>
            )}

            {/* Rooms (read-only) */}
            {floorPlan.rooms.map((room) => (
              <g key={room.id}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={room.color || "#e5e7eb"}
                  stroke="#9ca3af"
                  strokeWidth={1}
                  opacity={0.6}
                />
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="#6b7280"
                  pointerEvents="none"
                >
                  {room.name}
                </text>
              </g>
            ))}

            {/* Walls (read-only) */}
            {floorPlan.walls.map((wall) => (
              <line
                key={wall.id}
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke={wall.color || "#374151"}
                strokeWidth={wall.thickness || 4}
                opacity={0.5}
              />
            ))}

            {/* Doors (read-only) */}
            {floorPlan.doors.map((door) => (
              <rect
                key={door.id}
                x={door.x}
                y={door.y}
                width={door.width}
                height={4}
                fill={door.color || "#92400e"}
                opacity={0.5}
              />
            ))}

            {/* Windows (read-only) */}
            {floorPlan.windows.map((win) => (
              <rect
                key={win.id}
                x={win.x}
                y={win.y}
                width={win.width}
                height={win.height || 3}
                fill={win.color || "#60a5fa"}
                opacity={0.4}
              />
            ))}

            {/* Permanent Furniture (read-only) */}
            {floorPlan.furniture.map((f) => (
              <rect
                key={f.id}
                x={f.x}
                y={f.y}
                width={f.width}
                height={f.height}
                fill={f.color || "#9ca3af"}
                opacity={0.3}
                rx={2}
              />
            ))}
            </>
            )}
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
          {eventFurniture.map((f, index) => (
            <div
              key={f.id}
              data-event-item
              data-testid={`event-furniture-${f.id}`}
              className={cn(
                "absolute border-2 rounded transition-shadow",
                !readOnly && (f.locked ? "cursor-default" : "cursor-move"),
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
              onMouseDown={(e) => handleItemMouseDown(e, f.id, "furniture")}
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
                    className="absolute left-1/2 -top-12 z-40 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-card text-primary shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onMouseDown={(e) => handleRotateStart(e, f)}
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
                        "absolute z-30 h-3.5 w-3.5 rounded-full border-2 border-primary bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        RESIZE_HANDLE_POSITION[handle],
                      )}
                      onMouseDown={(e) => handleResizeStart(e, f, handle)}
                    />
                  ))}
                </>
              )}
            </div>
          ))}

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
              data-testid={`event-label-${l.id}`}
              className={cn(
                "absolute select-none",
                !readOnly && "cursor-move",
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
              onMouseDown={(e) => handleItemMouseDown(e, l.id, "label")}
            >
              {l.text}
            </div>
          ))}
        </div>

        {!readOnly && eventSelectionBounds && selectedFurnitureIds.length === 1 && (
          <div
            data-testid="event-single-item-actions"
            aria-label="Selected event item actions"
            className="pointer-events-none absolute z-50 max-w-[calc(100%-1.5rem)]"
            style={{
              left: Math.max(12, eventSelectionBounds.x * zoom + pan.x),
              top: Math.max(12, eventSelectionBounds.y * zoom + pan.y - 56),
            }}
            onClick={(event) => event.stopPropagation()}
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
                onClick={() => setInspectorOpen((current) => !current)}
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

        {!readOnly && inspectorOpen && selectedFurniture && (
          <div
            role="dialog"
            aria-label="Item details"
            data-testid="event-item-inspector"
            className="absolute right-3 top-16 z-50 max-h-[calc(100%-5rem)] w-[min(21rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-border/80 bg-card/95 p-3 shadow-2xl backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">Item details</p>
                <p className="truncate text-sm font-extrabold text-foreground">{selectedFurniture.name}</p>
              </div>
              <button
                type="button"
                aria-label="Close item details"
                title="Close item details"
                onClick={() => setInspectorOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Adjust exact placement, size, and order without dragging.</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {([
                ["X", selectedFurniture.x, (value: number) => updateSelectedFurniture({ x: Math.max(0, Math.min(canvasW - selectedFurniture.width, value)) })],
                ["Y", selectedFurniture.y, (value: number) => updateSelectedFurniture({ y: Math.max(0, Math.min(canvasH - selectedFurniture.height, value)) })],
                ["Width", selectedFurniture.width, (value: number) => updateSelectedFurniture({ width: Math.max(4, Math.min(canvasW, value)) })],
                ["Height", selectedFurniture.height, (value: number) => updateSelectedFurniture({ height: Math.max(4, Math.min(canvasH, value)) })],
                ["Rotation", Math.round(selectedFurniture.rotation || 0), (value: number) => updateSelectedFurniture({ rotation: ((value % 360) + 360) % 360 })],
              ] as Array<[string, number, (value: number) => void]>).map(([label, value, update]) => (
                <label key={label} className="flex min-w-0 flex-col gap-1 text-[10px] font-bold text-muted-foreground">
                  {label}
                  <input
                    type="number"
                    aria-label={label}
                    min={label === "Rotation" ? -360 : 0}
                    value={value}
                    onChange={(event) => update(Number(event.currentTarget.value) || 0)}
                    disabled={selectedFurniture.locked}
                    title={selectedFurniture.locked ? "Unlock this item to edit its geometry" : undefined}
                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs font-bold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-label={selectedFurniture.locked ? "Unlock selected item" : "Lock selected item"}
                onClick={toggleSelectedLock}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-2 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {selectedFurniture.locked ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                {selectedFurniture.locked ? "Unlock" : "Lock"}
              </button>
              <button
                type="button"
                aria-label={selectedFurniture.visible === false ? "Show selected item" : "Hide selected item"}
                onClick={toggleSelectedVisibility}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-2 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {selectedFurniture.visible === false ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                {selectedFurniture.visible === false ? "Show" : "Hide"}
              </button>
              <button
                type="button"
                aria-label="Bring selected item to front"
                onClick={() => updateSelectedLayer("front")}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-2 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <BringToFront className="h-3.5 w-3.5" aria-hidden="true" />
                Front
              </button>
              <button
                type="button"
                aria-label="Send selected item to back"
                onClick={() => updateSelectedLayer("back")}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-2 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <SendToBack className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            </div>

            {selectedFurniture.groupId && (
              <button
                type="button"
                aria-label="Ungroup selected item"
                onClick={ungroupSelection}
                className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border/70 px-2 text-[10px] font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Ungroup className="h-3.5 w-3.5" aria-hidden="true" />
                Ungroup item
              </button>
            )}
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

      {/* Bottom Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 sm:px-4 border-t border-border bg-card text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span>
            {eventFurniture.length} furniture · {eventLabels.length} labels
          </span>
          <span className="capitalize">Tool: {activeTool}</span>
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
          <span>
            {readOnly
              ? "Published base map and submitted additions"
              : "Drag to move · Del to delete · Wheel to pan · Ctrl/Cmd + wheel to zoom · Space + drag"}
          </span>
        </div>
      </div>
    </div>
  );
}
