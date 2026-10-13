import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Focus, Loader2, Maximize2, ZoomIn, ZoomOut, MousePointer2, Type } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { projectReadonlyOutdoorCampus } from "../../lib/readonlyOutdoorCampus";
import { eventAsset3DTransform, event3DLayoutBounds, type Event3DCameraRequest, type Event3DCameraSession } from "../../lib/event3dLayout";
import type { Campus, FloorFurniture, FloorLabel, FloorPlan } from "../map-builder/types";
import type { Event3DEditing } from "../../lib/event3dEditing";
import { readonlyFloorPlanViewport } from "../map-builder/ReadonlyFloorPlanVisuals";
import { getFloorPlanContentBounds } from "../../lib/eventViewport";

const Indoor3D = lazy(() => import("../map/IndoorFloor3DRenderer"));
const Outdoor3D = lazy(() => import("../map/StudentCampus3DRenderer"));
class PreviewBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function supports3D() {
  if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch { return false; }
}

export function EventLayout3DPreview({ floorPlan, campus, furniture, labels, selectedIds = [], onReturnTo2D, editing, editorTools, editingBusy = false, placementLabel = "Item", placementValid = true, focusRequest = 0, cameraSession }: {
  floorPlan: FloorPlan; campus?: Campus | null; furniture: readonly FloorFurniture[]; labels: readonly FloorLabel[]; selectedIds?: readonly string[]; onReturnTo2D: () => void;
  editing?: Event3DEditing; editorTools?: ReactNode; editingBusy?: boolean;
  cameraSession?: Event3DCameraSession;
  placementLabel?: string; placementValid?: boolean; focusRequest?: number;
}) {
  const [available] = useState(supports3D);
  const [failed, setFailed] = useState(false);
  const fallback = useCallback(() => setFailed(true), []);
  const surface = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = surface.current;
    const lost = (event: Event) => { event.preventDefault(); fallback(); };
    element?.addEventListener("webglcontextlost", lost, true);
    return () => element?.removeEventListener("webglcontextlost", lost, true);
  }, [fallback]);
  const { theme } = useTheme();
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media?.matches ?? false);
    update(); media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);
  const outdoor = floorPlan.buildingId === "campus";
  const projection = useMemo(() => campus ? projectReadonlyOutdoorCampus(campus) : null, [campus]);
  const viewport = useMemo(() => {
    if (outdoor) return { width: floorPlan.canvasW || 800, height: floorPlan.canvasH || 600, offsetX: 0, offsetY: 0 };
    const building = campus?.buildings?.find(building => building.id === floorPlan.buildingId);
    const presentation = readonlyFloorPlanViewport(floorPlan, building?.exteriorEmergencyStairs);
    const content = getFloorPlanContentBounds(floorPlan);
    const x = Math.min(content.x, -presentation.offsetX), y = Math.min(content.y, -presentation.offsetY);
    return { width: Math.max(content.x + content.width, presentation.width - presentation.offsetX) - x,
      height: Math.max(content.y + content.height, presentation.height - presentation.offsetY) - y, offsetX: -x, offsetY: -y };
  }, [floorPlan, campus, outdoor]);
  const mapBounds = useMemo(() => ({ x: -viewport.offsetX, y: -viewport.offsetY, width: viewport.width, height: viewport.height }), [viewport]);
  const focusBounds = useMemo(() => event3DLayoutBounds(
    selectedIds.length ? furniture.filter(item => selectedIds.includes(item.id)) : furniture,
    selectedIds.length ? labels.filter(item => selectedIds.includes(item.id)) : labels,
  ), [furniture, labels, selectedIds]);
  const heightFor = (selected: boolean) => furniture.reduce((height, item) => selected && selectedIds.length && !selectedIds.includes(item.id) ? height : Math.max(height, eventAsset3DTransform(item, { scale: outdoor ? 0.01 : 0.025, originX: 0, originY: 0 })?.height || 0), 0);
  const [camera, setCamera] = useState<Event3DCameraRequest>(() => ({ nonce: 0, kind: "fit", bounds: mapBounds, maxHeight: heightFor(false) }));
  const [pointerBadge, setPointerBadge] = useState<{ x: number; y: number } | null>(null);
  const request = (kind: Event3DCameraRequest["kind"]) => setCamera(current => ({ nonce: current.nonce + 1, kind, bounds: kind === "focus" ? focusBounds || mapBounds : mapBounds, maxHeight: heightFor(kind === "focus") }));
  const lastFocusRequest = useRef(focusRequest);
  useEffect(() => { if (focusRequest !== lastFocusRequest.current) { lastFocusRequest.current = focusRequest; if (focusRequest) request("focus"); } }, [focusRequest]);
  const placing = editing?.tool === "place-item" || editing?.tool === "place-label";
  const unavailable = !available || failed || (outdoor && !projection);
  return <section ref={surface} aria-label={editing ? "Event 3D editor" : "Event 3D preview"} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
    {!unavailable && editorTools}
    <div data-event-3d-tool={editing?.tool || "view"} className="relative isolate min-h-40 flex-1 overflow-hidden"
      onPointerMove={event => { if (!placing || event.pointerType === "touch" || (event.target as Element).closest?.("[data-event-editor-chrome]")) { setPointerBadge(null); return; } const box = event.currentTarget.getBoundingClientRect(); setPointerBadge({ x: Math.max(8, Math.min(box.width - 140, event.clientX - box.left + 16)), y: Math.max(8, Math.min(box.height - 40, event.clientY - box.top + 18)) }); }} onPointerLeave={() => setPointerBadge(null)}>
    <div data-event-editor-chrome className="absolute right-2 top-2 z-[60] rounded-xl border border-border bg-card/95 p-1 shadow-sm">
      {!unavailable && <div aria-label="3D camera controls" className="flex flex-wrap gap-1">
        {([{ kind: "zoom-out", label: "Zoom out in 3D", Icon: ZoomOut }, { kind: "zoom-in", label: "Zoom in in 3D", Icon: ZoomIn }, { kind: "fit", label: "Fit map in 3D", Icon: Maximize2 }, { kind: "focus", label: selectedIds.length ? "Focus selection in 3D" : "Focus event items in 3D", Icon: Focus }] as const).map(({ kind, label, Icon }) => <button key={kind} type="button" aria-label={label} title={label} disabled={editingBusy || (kind === "focus" && !focusBounds)} onClick={() => request(kind)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon className="h-4 w-4" aria-hidden="true" /></button>)}
      </div>}
    </div>
    {placing && !unavailable && <div data-testid="event-3d-placement-mode" role="status" className="pointer-events-none absolute left-2 top-16 z-[60] max-w-[calc(100%-1rem)] rounded-xl border border-primary/30 bg-card/95 px-3 py-2 text-xs shadow-sm sm:top-2 sm:max-w-[calc(100%-13rem)]"><strong className="block text-primary">Placing {placementLabel}</strong><span className="text-muted-foreground">{placementValid ? "Preview · Click or tap to place" : "Blocked position · Choose open space"}</span></div>}
    {placing && pointerBadge && <div data-testid="event-3d-pointer-badge" aria-hidden="true" className="pointer-events-none absolute z-[60] flex max-w-36 items-center gap-1.5 rounded-lg border border-primary bg-card px-2 py-1 text-xs font-semibold text-primary shadow-sm" style={{ left: pointerBadge.x, top: pointerBadge.y }}>{editing?.tool === "place-label" ? <Type className="h-3.5 w-3.5" /> : <MousePointer2 className="h-3.5 w-3.5" />}<span className="truncate">{placementLabel}</span></div>}
      {unavailable ? <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"><p className="text-sm font-semibold">3D preview is unavailable on this device.</p><p className="text-xs text-muted-foreground">Your layout is preserved. You can continue in 2D.</p><button type="button" onClick={onReturnTo2D} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Return to 2D</button></div>
        : <PreviewBoundary onError={fallback}><Suspense fallback={<div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-sm"><Loader2 className="h-5 w-5 animate-spin" />Loading 3D preview…</div>}>
          {outdoor && projection ? <Outdoor3D campus={projection} eventFurniture={furniture} eventLabels={labels} eventEditing={editing} previewCamera={camera} previewCameraSession={cameraSession} darkMode={theme === "dark"} reducedMotion={reducedMotion} onFallback={fallback} />
            : <Indoor3D floor={floorPlan} floorLabel={floorPlan.label} viewport={viewport} eventFurniture={furniture} eventLabels={labels} eventEditing={editing} previewCamera={camera} previewCameraSession={cameraSession} darkMode={theme === "dark"} reducedMotion={reducedMotion} onFallback={fallback} />}
        </Suspense></PreviewBoundary>}
    </div>
    {!unavailable && <p className="shrink-0 border-t border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground"><span className="sm:hidden">Two fingers: rotate · Pinch: zoom · Pan to move the map</span><span className="hidden sm:inline">{editing ? "Move: drag items · Escape cancels · " : ""}Drag background to pan · Right-drag to rotate · Scroll to zoom</span></p>}
    <ul aria-label="Event items in 3D preview" className="sr-only">{furniture.filter(item => item.visible !== false).map(item => <li key={item.id}>{item.name}</li>)}{labels.filter(label => label.visible !== false).map(label => <li key={label.id}>{label.text}</li>)}</ul>
  </section>;
}
