import type { CampusEventOverlay } from "../map-builder/types";
import { CanvasAssetVisual } from "../canvas/CanvasAssetVisual";
import { resolveCanvasAssetKey } from "../canvas/canvasAssetCatalog";

/** The public event view uses the same artwork and top-left coordinates as admin review. */
export function EventPreviewLayer({ events, onSelect }: { events: CampusEventOverlay[]; onSelect: (event: CampusEventOverlay) => void }) {
  return <g data-testid="event-preview-layer">{events.map(event => (
    <g key={`${event.id}:${event.locationRef?.floorId || event.locationRef?.type || ""}`} onClick={click => { click.stopPropagation(); onSelect(event); }} className="cursor-pointer">
      {(event.eventFurniture || []).filter(item => item.visible !== false).sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)).map(item => (
        <g key={item.id} data-event-item-id={item.id} transform={`translate(${item.x},${item.y}) rotate(${item.rotation || 0},${item.width / 2},${item.height / 2})`}>
          <CanvasAssetVisual assetKey={resolveCanvasAssetKey(item) ?? item.type} label={item.name} width={item.width} height={item.height} />
          <title>{event.title}: {item.name}</title>
        </g>
      ))}
      {(event.eventLabels || []).filter(label => label.visible !== false).map(label => (
        <text key={label.id} data-event-label-id={label.id} x={label.x} y={label.y} dominantBaseline="text-before-edge" fontWeight="700" transform={`rotate(${label.rotation || 0},${label.x},${label.y})`} fontSize={label.fontSize || 14} fill={label.color || "#1f2937"}>{label.text}</text>
      ))}
    </g>
  ))}</g>;
}
