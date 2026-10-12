import { memo, useMemo } from "react";
import { Html } from "@react-three/drei";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";
import { eventAsset3DTransform, type Event3DFrame } from "../../lib/event3dLayout";

function Box({ w, h, d, y = 0, x = 0, z = 0, color }: { w: number; h: number; d: number; y?: number; x?: number; z?: number; color: string }) {
  return <mesh position={[x, y + h / 2, z]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>;
}

function AssetModel({ item, w, d, height }: { item: FloorFurniture; w: number; d: number; height: number }) {
  const color = item.color || "#3b82f6";
  const type = item.assetKey || item.type;
  const unit = Math.min(w, d);
  const leg = Math.max(0.008, unit * 0.08);
  const legs = (height: number) => [-1, 1].flatMap(x => [-1, 1].map(z => <Box key={`${x}:${z}`} w={leg} h={height} d={leg} x={x * (w - leg) / 2} z={z * (d - leg) / 2} color="#475569" />));
  switch (type) {
    case "chair": return <>{legs(unit)}<Box w={w} h={unit * 0.12} d={d} y={unit} color={color} /><Box w={w} h={height - unit} d={d * 0.12} z={-d * 0.44} y={unit} color={color} /></>;
    case "table":
    case "registration-desk": return <>{legs(height - unit * 0.12)}<Box w={w} h={unit * 0.12} d={d} y={height - unit * 0.12} color={color} />{type === "registration-desk" && <Box w={w} h={unit * 0.7} d={leg} y={unit * 0.2} z={-d * 0.42} color={color} />}</>;
    case "stage": return <><Box w={w} h={height} d={d} color={color} /><Box w={w * 0.3} h={height / 2} d={d * 0.12} z={d * 0.44} color="#475569" /></>;
    case "tent":
    case "booth": {
      const roof = unit * 0.4, top = height - roof;
      return <>{legs(top)}<group position={[0, top + roof / 2, 0]} scale={[w, 1, d]}><mesh rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[Math.SQRT1_2, roof, 4]} /><meshStandardMaterial color={color} side={2} roughness={0.9} /></mesh></group>{type === "booth" && <Box w={w * 0.9} h={unit * 0.12} d={d * 0.3} y={unit * 0.65} z={d * 0.3} color={color} />}</>;
    }
    case "barrier": return <><Box w={w} h={w * 0.35} d={d * 0.35} y={height - w * 0.35} color={color} /><Box w={w} h={w * 0.06} d={d} color="#475569" /></>;
    case "signage": return <><Box w={w * 0.5} h={unit * 0.08} d={d} color="#475569" /><Box w={w * 0.08} h={unit * 1.4} d={d * 0.1} color="#475569" /><Box w={w} h={unit} d={d * 0.1} y={height - unit} color={color} /></>;
    case "podium": return <><Box w={w * 0.65} h={height - unit * 0.12} d={d * 0.65} color={color} /><Box w={w} h={unit * 0.12} d={d} y={height - unit * 0.12} color={color} /></>;
    case "queue-post":
    case "microphone": {
      const radius = unit * (type === "microphone" ? 0.2 : 0.15);
      return <><mesh position={[0, unit * 0.04, 0]}><cylinderGeometry args={[unit * 0.45, unit * 0.45, unit * 0.08, 12]} /><meshStandardMaterial color="#475569" /></mesh><Box w={unit * 0.12} h={height - radius} d={unit * 0.12} color={color} /><mesh position={[0, height - radius, 0]}><sphereGeometry args={[radius, 10, 8]} /><meshStandardMaterial color={color} /></mesh></>;
    }
    case "speaker": return <><Box w={w} h={height} d={d} color={color} />{[0.45, 1.2].map(y => <mesh key={y} position={[0, unit * y, d / 2 + 0.001]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[unit * 0.3, unit * 0.3, 0.01, 16]} /><meshStandardMaterial color="#111827" /></mesh>)}</>;
    case "monitor": return <><Box w={w * 0.45} h={unit * 0.06} d={d} color="#475569" /><Box w={w * 0.1} h={unit * 0.6} d={d * 0.1} color="#475569" /><Box w={w} h={unit} d={d * 0.12} y={height - unit} color={color} /><Box w={w * 0.9} h={unit * 0.85} d={d * 0.02} y={height - unit * 0.93} z={d * 0.07} color="#1e293b" /></>;
    case "projector": return <><Box w={w} h={height} d={d} color={color} /><mesh position={[0, unit * 0.22, d / 2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[unit * 0.15, unit * 0.15, unit * 0.08, 12]} /><meshStandardMaterial color="#0f172a" /></mesh></>;
    default: return <Box w={w} h={height} d={d} color={color} />;
  }
}

export const EventAsset3DLayer = memo(function EventAsset3DLayer({ furniture = [], labels = [], frame }: { furniture?: readonly FloorFurniture[]; labels?: readonly FloorLabel[]; frame: Event3DFrame }) {
  const models = useMemo(() => furniture.map(item => ({ item, transform: eventAsset3DTransform(item, frame) })).filter(entry => entry.transform), [furniture, frame]);
  return <group name="event-layout-additions">
    {models.map(({ item, transform }) => <group key={item.id} name={`event-asset-${item.id}`} position={transform!.position} rotation={[0, transform!.rotation, 0]} scale={[item.flipX ? -1 : 1, 1, item.flipY ? -1 : 1]}><AssetModel item={item} w={transform!.width} d={transform!.depth} height={transform!.height} /></group>)}
    {labels.filter(label => label.visible !== false && Number.isFinite(label.x) && Number.isFinite(label.y)).map(label => <Html key={label.id} position={[(label.x - frame.originX) * frame.scale, 0.12, (label.y - frame.originY) * frame.scale]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none", userSelect: "none" }}><span className="block max-w-52 whitespace-normal break-words rounded-md bg-white/90 px-2 py-1 text-center text-xs font-semibold shadow-sm" style={{ color: label.color || "#1e293b" }}>{label.text}</span></Html>)}
  </group>;
});
