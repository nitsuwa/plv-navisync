import { createContext, memo, useContext, useMemo } from "react";
import { Html } from "@react-three/drei";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";
import { eventAsset3DTransform, type Event3DFrame } from "../../lib/event3dLayout";

const PreviewMaterial = createContext(false);
function Material({ color, metal = false }: { color: string; metal?: boolean }) {
  const preview = useContext(PreviewMaterial);
  return <meshStandardMaterial color={color} roughness={metal ? 0.38 : 0.72} metalness={metal ? 0.45 : 0.05} transparent={preview} opacity={preview ? 0.42 : 1} depthWrite={!preview} />;
}
function Box({ w, h, d, y = 0, x = 0, z = 0, color, metal = false }: { w: number; h: number; d: number; y?: number; x?: number; z?: number; color: string; metal?: boolean }) {
  return <mesh position={[x, y + h / 2, z]} castShadow receiveShadow><boxGeometry args={[w, h, d]} /><Material color={color} metal={metal} /></mesh>;
}

function AssetModel({ item, w, d, height }: { item: FloorFurniture; w: number; d: number; height: number }) {
  const color = item.color || "#3b82f6";
  const type = item.assetKey || item.type;
  const unit = Math.min(w, d);
  const leg = Math.max(0.004, Math.min(unit * 0.08, height * 0.06));
  const legs = (length: number) => [-1, 1].flatMap(x => [-1, 1].map(z => <Box key={`${x}:${z}`} w={leg} h={length} d={leg} x={x * (w - leg * 2) / 2} z={z * (d - leg * 2) / 2} color="#52606d" metal />));
  switch (type) {
    case "chair": return <>{legs(height * 0.5)}<Box w={w} h={height * 0.06} d={d} y={height * 0.5} color={color} /><Box w={w * 0.9} h={height * 0.48} d={Math.min(d * 0.12, height * 0.1)} z={-d * 0.42} y={height * 0.52} color={color} />{[-1, 1].map(side => <Box key={side} w={w - leg * 2} h={leg * 0.6} d={leg * 0.6} y={height * 0.22} z={side * (d - leg * 2) / 2} color="#52606d" metal />)}</>;
    case "table":
    case "registration-desk": return <>{legs(height * 0.94)}<Box w={w} h={height * 0.06} d={d} y={height * 0.94} color={color} />{type === "registration-desk" && <Box w={w * 0.94} h={height * 0.7} d={leg} y={height * 0.18} z={-d * 0.42} color={color} />}{[-1, 1].map(side => <Box key={side} w={w - leg * 2} h={leg} d={leg} y={height * 0.12} z={side * (d - leg * 2) / 2} color="#52606d" metal />)}</>;
    case "stage": return <><Box w={w} h={height * 0.88} d={d} color="#39434f" /><Box w={w} h={height * 0.12} d={d} y={height * 0.88} color={color} /><Box w={w * 0.3} h={height / 2} d={d * 0.12} z={d * 0.44} color="#64707a" /></>;
    case "tent":
    case "booth": {
      const roof = height * 0.24, top = height - roof;
      return <>{legs(top)}<group position={[0, top + roof / 2, 0]} scale={[w, 1, d]}><mesh rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow><coneGeometry args={[Math.SQRT1_2, roof, 4]} /><Material color={color} /></mesh></group>{type === "booth" && <><Box w={w * 0.9} h={height * 0.035} d={d * 0.32} y={height * 0.35} z={d * 0.3} color="#bd986c" /><Box w={w * 0.86} h={height * 0.28} d={leg} y={height * 0.07} z={d * 0.44} color={color} /></>}</>;
    }
    case "barrier": return <><Box w={w} h={height * 0.2} d={Math.min(d * 0.3, height * 0.06)} y={height * 0.8} color={color} /><Box w={w} h={height * 0.13} d={Math.min(d * 0.3, height * 0.06)} y={height * 0.4} color={color} />{[-1, 1].map(side => <group key={side}><Box w={leg} h={height * 0.9} d={leg} x={side * w * 0.38} color="#52606d" metal /><Box w={w * 0.24} h={height * 0.04} d={d} x={side * w * 0.38} color="#52606d" metal /></group>)}</>;
    case "signage": return <><Box w={w * 0.5} h={height * 0.04} d={d} color="#52606d" metal /><Box w={leg} h={height * 0.75} d={leg} color="#52606d" metal /><Box w={w} h={height * 0.38} d={Math.min(d * 0.1, height * 0.035)} y={height * 0.62} color={color} /></>;
    case "podium": return <><Box w={w * 0.8} h={height * 0.07} d={d * 0.8} color="#735438" /><Box w={w * 0.65} h={height * 0.95} d={d * 0.65} color={color} /><Box w={w} h={height * 0.05} d={d} y={height * 0.95} color={color} /></>;
    case "queue-post":
    case "microphone": {
      const radius = height * (type === "microphone" ? 0.035 : 0.045), baseHeight = height * 0.035;
      return <><mesh position={[0, baseHeight / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[unit * 0.42, unit * 0.42, baseHeight, 16]} /><Material color="#52606d" metal /></mesh><Box w={height * 0.025} h={height - radius} d={height * 0.025} color="#52606d" metal /><mesh position={[0, height - radius, 0]} castShadow><sphereGeometry args={[radius, 12, 10]} /><Material color={type === "microphone" ? "#202934" : color} metal={type !== "microphone"} /></mesh></>;
    }
    case "speaker": { const radius = Math.min(w * 0.34, height * 0.2), thickness = Math.min(d * 0.03, height * 0.01); return <><Box w={w} h={height} d={d} color={color} />{[0.3, 0.72].map(y => <mesh key={y} position={[0, height * y, d / 2 - thickness / 2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[radius, radius, thickness, 20]} /><Material color="#151c25" /></mesh>)}</>; }
    case "monitor": return <><Box w={w * 0.45} h={height * 0.055} d={d} color="#52606d" metal /><Box w={height * 0.07} h={height * 0.5} d={height * 0.05} color="#52606d" metal /><Box w={w} h={height * 0.73} d={Math.min(d * 0.12, height * 0.055)} y={height * 0.27} color={color} /><Box w={w * 0.9} h={height * 0.65} d={height * 0.012} y={height * 0.31} z={height * 0.03} color="#162936" /></>;
    case "projector": return <><Box w={w} h={height} d={d} color={color} /><mesh position={[w * 0.2, height * 0.5, d / 2 - height * 0.025]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[height * 0.22, height * 0.22, height * 0.05, 16]} /><Material color="#102634" /></mesh>{[-1,0,1].map(index => <Box key={index} w={w * 0.16} h={height * 0.04} d={height * 0.02} x={-w * 0.2} y={height * (0.4 + index * 0.12)} z={d / 2 - height * 0.012} color="#364653" />)}</>;
    default: return <Box w={w} h={height} d={d} color={color} />;
  }
}

export const EventAsset3DLayer = memo(function EventAsset3DLayer({ furniture = [], labels = [], frame, selectedIds = [], onItemPointerDown, preview = false }: { furniture?: readonly FloorFurniture[]; labels?: readonly FloorLabel[]; frame: Event3DFrame; selectedIds?: readonly string[]; onItemPointerDown?: (id: string, event: PointerEvent | React.PointerEvent) => void; preview?: boolean }) {
  const models = useMemo(() => furniture.map(item => ({ item, transform: eventAsset3DTransform(item, frame) })).filter(entry => entry.transform), [furniture, frame]);
  return <PreviewMaterial.Provider value={preview}><group name="event-layout-additions">
    {models.map(({ item, transform }) => <group key={item.id} name={`event-asset-${item.id}`} position={transform!.position} rotation={[0, transform!.rotation, 0]} onPointerDown={onItemPointerDown ? event => { event.stopPropagation(); onItemPointerDown(item.id, event.nativeEvent); } : undefined}>
      <group scale={[item.flipX ? -1 : 1, 1, item.flipY ? -1 : 1]}><AssetModel item={item} w={transform!.width} d={transform!.depth} height={transform!.height} /></group>
      {selectedIds.includes(item.id) && <><mesh position={[0, 0.025, 0]}><boxGeometry args={[transform!.width + 0.04, 0.03, transform!.depth + 0.04]} /><meshBasicMaterial color={item.locked ? "#d97706" : "#2563eb"} wireframe depthTest={false} /></mesh>{onItemPointerDown && <Html position={[0, transform!.height + 0.15, 0]} center zIndexRange={[25, 0]}><button type="button" aria-label={`${item.name} in 3D`} onPointerDown={event => onItemPointerDown(item.id, event)} className="max-w-44 touch-none truncate rounded-md border border-primary bg-card px-2 py-1 text-xs font-bold text-primary shadow">{item.name}</button></Html>}</>}
    </group>)}
    {labels.filter(label => label.visible !== false && Number.isFinite(label.x) && Number.isFinite(label.y)).map(label => <Html key={label.id} position={[(label.x - frame.originX) * frame.scale, 0.12, (label.y - frame.originY) * frame.scale]} center zIndexRange={[20, 0]} style={{ pointerEvents: onItemPointerDown ? "auto" : "none", userSelect: "none" }}>{onItemPointerDown ? <button type="button" aria-label={`${label.text} in 3D`} onPointerDown={event => onItemPointerDown(label.id, event)} className={`block max-w-52 touch-none whitespace-normal break-words rounded-md bg-white/90 px-2 py-1 text-center text-xs font-semibold shadow-sm ${selectedIds.includes(label.id) ? "ring-2 ring-primary" : ""}`} style={{ color: label.color || "#1e293b", fontSize: Math.max(8, Math.min(96, label.fontSize || 14)) }}>{label.text}</button> : <span className="block max-w-52 whitespace-normal break-words rounded-md bg-white/90 px-2 py-1 text-center text-xs font-semibold shadow-sm" style={{ color: label.color || "#1e293b", fontSize: Math.max(8, Math.min(96, label.fontSize || 14)) }}>{label.text}</span>}</Html>)}
  </group></PreviewMaterial.Provider>;
});
