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
  Clock,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { genId } from "../map-builder/constants";
import type {
  FloorPlan,
  FloorFurniture,
  FloorLabel,
  CampusEventOverlay,
  EventLocationRef,
} from "../map-builder/types";
import type { EventOverlayStatus } from "../../services/eventOverlayService";

// ── Event-specific furniture templates ────────────────────────────────────

const EVENT_FURNITURE_TEMPLATES: {
  type: string;
  name: string;
  category: string;
  width: number;
  height: number;
  color: string;
}[] = [
  { type: "booth", name: "Booth", category: "event", width: 60, height: 40, color: "#f59e0b" },
  { type: "tent", name: "Tent", category: "event", width: 80, height: 80, color: "#10b981" },
  { type: "stage", name: "Stage", category: "event", width: 120, height: 80, color: "#8b5cf6" },
  { type: "table", name: "Table", category: "event", width: 50, height: 30, color: "#6366f1" },
  { type: "barrier", name: "Barrier", category: "event", width: 40, height: 10, color: "#ef4444" },
  { type: "signage", name: "Signage", category: "event", width: 30, height: 20, color: "#06b6d4" },
];

// ── Tool types ────────────────────────────────────────────────────────────

type EventTool = "select" | "furniture" | "text" | "pan";

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

// ── Undo/Redo types ───────────────────────────────────────────────────────

interface EditorHistoryEntry {
  eventFurniture: FloorFurniture[];
  eventLabels: FloorLabel[];
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
}

export function EventFloorEditor({
  floorPlan,
  overlay,
  onSave,
  onSubmit,
  onBack,
  isSaving = false,
  isSubmitting = false,
}: EventFloorEditorProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<EventTool>("select");
  const [activeTemplate, setActiveTemplate] = useState(
    EVENT_FURNITURE_TEMPLATES[0]
  );
  const [eventFurniture, setEventFurniture] = useState<FloorFurniture[]>(
    overlay.eventFurniture || []
  );
  const [eventLabels, setEventLabels] = useState<FloorLabel[]>(
    overlay.eventLabels || []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"furniture" | "label" | null>(null);
  const [history, setHistory] = useState<EditorHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [dragging, setDragging] = useState<{
    id: string;
    type: "furniture" | "label";
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingLocal, setSubmittingLocal] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  // ── Canvas dimensions ──────────────────────────────────────────────────
  const canvasW = floorPlan.canvasW || 800;
  const canvasH = floorPlan.canvasH || 600;

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
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setEventFurniture(next.eventFurniture);
    setEventLabels(next.eventLabels);
    setHistoryIndex((prev) => prev + 1);
    setSelectedId(null);
    setSelectedType(null);
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
      const newFurniture: FloorFurniture = {
        id: genId(),
        type: template.type,
        name: template.name,
        category: template.category,
        x,
        y,
        width: template.width,
        height: template.height,
        rotation: 0,
        color: template.color,
        layer: "events",
      };
      const updated = [...eventFurniture, newFurniture];
      setEventFurniture(updated);
      pushHistory(updated, eventLabels);
      setSelectedId(newFurniture.id);
      setSelectedType("furniture");
    },
    [eventFurniture, eventLabels, pushHistory]
  );

  // ── Label placement ────────────────────────────────────────────────────
  const placeLabel = useCallback(
    (x: number, y: number) => {
      const newLabel: FloorLabel = {
        id: genId(),
        x,
        y,
        text: "Event Label",
        fontSize: 14,
        color: "#1f2937",
        rotation: 0,
        align: "left",
        layer: "events",
      };
      const updated = [...eventLabels, newLabel];
      setEventLabels(updated);
      pushHistory(eventFurniture, updated);
      setSelectedId(newLabel.id);
      setSelectedType("label");
    },
    [eventFurniture, eventLabels, pushHistory]
  );

  // ── Delete selected ────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (!selectedId || !selectedType) return;
    if (selectedType === "furniture") {
      const updated = eventFurniture.filter((f) => f.id !== selectedId);
      setEventFurniture(updated);
      pushHistory(updated, eventLabels);
    } else {
      const updated = eventLabels.filter((l) => l.id !== selectedId);
      setEventLabels(updated);
      pushHistory(eventFurniture, updated);
    }
    setSelectedId(null);
    setSelectedType(null);
  }, [selectedId, selectedType, eventFurniture, eventLabels, pushHistory]);

  // ── Canvas click handler ───────────────────────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (activeTool === "pan") return;
      if (dragging) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom - pan.x / zoom;
      const y = (e.clientY - rect.top) / zoom - pan.y / zoom;

      if (activeTool === "furniture") {
        // Place the currently selected event template centered on the click
        placeFurniture(activeTemplate, x - activeTemplate.width / 2, y - activeTemplate.height / 2);
      } else if (activeTool === "text") {
        placeLabel(x, y);
      } else if (activeTool === "select") {
        setSelectedId(null);
        setSelectedType(null);
      }
    },
    [activeTool, zoom, pan, placeFurniture, placeLabel, dragging, activeTemplate]
  );

  // ── Mouse drag for moving items ────────────────────────────────────────
  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent, id: string, type: "furniture" | "label") => {
      e.stopPropagation();
      if (activeTool !== "select") return;

      const item =
        type === "furniture"
          ? eventFurniture.find((f) => f.id === id)
          : eventLabels.find((l) => l.id === id);
      if (!item) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = (e.clientX - rect.left) / zoom - pan.x / zoom;
      const mouseY = (e.clientY - rect.top) / zoom - pan.y / zoom;

      setDragging({
        id,
        type,
        offsetX: mouseX - item.x,
        offsetY: mouseY - item.y,
      });
      setSelectedId(id);
      setSelectedType(type);
    },
    [activeTool, zoom, pan, eventFurniture, eventLabels]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = (e.clientX - rect.left) / zoom - pan.x / zoom;
      const mouseY = (e.clientY - rect.top) / zoom - pan.y / zoom;
      const newX = mouseX - dragging.offsetX;
      const newY = mouseY - dragging.offsetY;

      if (dragging.type === "furniture") {
        setEventFurniture((prev) =>
          prev.map((f) =>
            f.id === dragging.id ? { ...f, x: newX, y: newY } : f
          )
        );
      } else {
        setEventLabels((prev) =>
          prev.map((l) =>
            l.id === dragging.id ? { ...l, x: newX, y: newY } : l
          )
        );
      }
    },
    [dragging, zoom, pan]
  );

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      pushHistory(eventFurniture, eventLabels);
    }
    setDragging(null);
  }, [dragging, eventFurniture, eventLabels, pushHistory]);

  // ── Pan (middle mouse or pan tool) ─────────────────────────────────────
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === "pan" || e.button === 1) {
        e.preventDefault();
        panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
      }
    },
    [activeTool, pan]
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!panRef.current) return;
      setPan({
        x: panRef.current.px + (e.clientX - panRef.current.sx),
        y: panRef.current.py + (e.clientY - panRef.current.sy),
      });
    },
    []
  );

  const handlePanEnd = useCallback(() => {
    panRef.current = null;
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;

      if (e.key === "Delete" || e.key === "Backspace") {
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
        setSelectedId(null);
        setSelectedType(null);
      }
      // Tool shortcuts
      if (e.key === "v" || e.key === "1") setActiveTool("select");
      if (e.key === "f" || e.key === "2") setActiveTool("furniture");
      if (e.key === "t" || e.key === "3") setActiveTool("text");
      if (e.key === "h" || e.key === "4") setActiveTool("pan");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, undo, redo]);

  // ── Save / Submit handlers ─────────────────────────────────────────────
  const busy = saving || submittingLocal || isSaving || isSubmitting;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(eventFurniture, eventLabels);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmittingLocal(true);
    try {
      await onSubmit(eventFurniture, eventLabels);
    } finally {
      setSubmittingLocal(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-sm font-extrabold text-foreground">
              {overlay.title}
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {overlay.locationRef?.label || "No location"}
              <Clock className="h-3 w-3 ml-1" />
              {new Date(overlay.dateStart).toLocaleDateString()} –{" "}
              {new Date(overlay.dateEnd).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-all disabled:opacity-50"
          >
            {saving || isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Draft
          </button>
          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex items-center gap-1.5 h-8 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {submittingLocal || isSubmitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Submit to GSO
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card/50 shrink-0">
        {EVENT_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
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

        {/* Furniture palette (when furniture tool is active) */}
        {activeTool === "furniture" && (
          <div className="flex items-center gap-1 ml-4 pl-4 border-l border-border overflow-x-auto no-scrollbar">
            {EVENT_FURNITURE_TEMPLATES.map((template) => (
              <button
                key={template.type}
                type="button"
                onClick={() => setActiveTemplate(template)}
                title={`Place ${template.name} — click on the canvas`}
                className={cn(
                  "flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-bold border transition-all shrink-0",
                  activeTemplate.type === template.type
                    ? "bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-muted"
                )}
                style={{ borderColor: template.color + "60" }}
              >
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: template.color }}
                />
                {template.name}
              </button>
            ))}
            <span className="text-[10px] text-muted-foreground ml-1 shrink-0">
              Select an item, then click the map to place it
            </span>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden relative cursor-crosshair"
        style={{
          background: "var(--map-floor-corridor, #f3f4f6)",
          cursor:
            activeTool === "pan"
              ? "grab"
              : activeTool === "select"
              ? "default"
              : "crosshair",
        }}
        onClick={handleCanvasClick}
        onMouseDown={(e) => {
          handlePanStart(e);
          if (activeTool === "select" && !dragging) {
            // Check if we clicked on an item
            const target = e.target as HTMLElement;
            if (!target.closest("[data-event-item]")) {
              setSelectedId(null);
              setSelectedType(null);
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
          handleMouseUp();
        }}
      >
        {/* Zoom + Pan container */}
        <div
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
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
              fill={floorPlan.backgroundColor || "#f8f9fa"}
              rx={4}
            />

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
          </svg>

          {/* Event Furniture (editable) */}
          {eventFurniture.map((f) => (
            <div
              key={f.id}
              data-event-item
              data-testid={`event-furniture-${f.id}`}
              className={cn(
                "absolute cursor-move border-2 rounded transition-shadow",
                selectedId === f.id
                  ? "border-primary shadow-lg z-20"
                  : "border-transparent hover:shadow-md z-10"
              )}
              style={{
                left: f.x,
                top: f.y,
                width: f.width,
                height: f.height,
                backgroundColor: f.color,
                transform: `rotate(${f.rotation || 0}deg)`,
                opacity: 0.85,
              }}
              onMouseDown={(e) => handleItemMouseDown(e, f.id, "furniture")}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white pointer-events-none">
                {f.name}
              </span>
            </div>
          ))}

          {/* Event Labels (editable) */}
          {eventLabels.map((l) => (
            <div
              key={l.id}
              data-event-item
              data-testid={`event-label-${l.id}`}
              className={cn(
                "absolute cursor-move select-none",
                selectedId === l.id
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

        {/* Instructions overlay */}
        {eventFurniture.length === 0 && eventLabels.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <p className="text-sm font-bold mb-1">
                Click to place event items
              </p>
              <p className="text-xs">
                Use the Furniture or Label tool to add items to your event layout
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-card text-[10px] text-muted-foreground shrink-0">
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
          <span>Drag to move · Del to delete</span>
        </div>
      </div>
    </div>
  );
}
