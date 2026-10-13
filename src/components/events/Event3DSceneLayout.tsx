import { Html } from "@react-three/drei";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";
import type { Event3DEditing, Event3DManipulation } from "../../lib/event3dEditing";
import type { Event3DFrame } from "../../lib/event3dLayout";
import { EventAsset3DLayer } from "./EventAsset3DLayer";
import { useEvent3DInteraction } from "./useEvent3DInteraction";

export function Event3DSceneLayout({ furniture = [], labels = [], frame, editing }: { furniture?: readonly FloorFurniture[]; labels?: readonly FloorLabel[]; frame: Event3DFrame; editing?: Event3DEditing }) {
  const { preview, start } = useEvent3DInteraction({ furniture, labels, frame, editing });
  const shownFurniture = preview?.furniture || furniture, shownLabels = preview?.labels || labels;
  const selected = editing?.selectedIds.length === 1 ? shownFurniture.find(item => item.id === editing.selectedIds[0]) : null;
  const handlePoint = (item: FloorFurniture, tool: "rotate" | "resize") => {
    const angle = item.rotation * Math.PI / 180, cx = item.x + item.width / 2, cy = item.y + item.height / 2;
    const dx = tool === "resize" ? item.width / 2 : 0, dy = tool === "resize" ? item.height / 2 : -item.height / 2 - 18;
    return [(cx + dx * Math.cos(angle) - dy * Math.sin(angle) - frame.originX) * frame.scale, 0.09, (cy + dx * Math.sin(angle) + dy * Math.cos(angle) - frame.originY) * frame.scale] as [number, number, number];
  };
  return <>
    <EventAsset3DLayer furniture={shownFurniture} labels={shownLabels} frame={frame} selectedIds={editing?.selectedIds} onItemPointerDown={editing && editing.tool !== "pan" ? (id, event) => start(id, event) : undefined} />
    {editing && <mesh position={[(editing.bounds.width / 2 - frame.originX) * frame.scale, 0.03, (editing.bounds.height / 2 - frame.originY) * frame.scale]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={event => { if (editing.tool === "place-item" || editing.tool === "place-label") { event.stopPropagation(); start(null, event.nativeEvent); } }}><planeGeometry args={[editing.bounds.width * frame.scale, editing.bounds.height * frame.scale]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
    {editing?.placement && <group><EventAsset3DLayer furniture={editing.placement.furniture} labels={editing.placement.labels} frame={frame} preview /></group>}
    {selected && !selected.locked && !selected.groupId && (editing?.tool === "rotate" || editing?.tool === "resize") && <Html position={handlePoint(selected, editing.tool)} center zIndexRange={[30, 0]}><button type="button" aria-label={`${editing.tool === "rotate" ? "Rotate" : "Resize"} ${selected.name} handle in 3D`} onPointerDown={event => start(selected.id, event, editing.tool as Event3DManipulation)} className="flex h-11 w-11 touch-none items-center justify-center rounded-full border-2 border-white bg-primary text-xl font-bold text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{editing.tool === "rotate" ? "↻" : "↘"}</button></Html>}
  </>;
}
