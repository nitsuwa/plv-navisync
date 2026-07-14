import { useState } from "react";
import { Building2, Layers, ChevronRight, CheckCircle2 } from "lucide-react";
import { FLOOR_PLANS, ROOM_COLORS, type RoomType } from "../data/floorPlans";
import { MOCK_BUILDINGS } from "../data/mockData";
import { cn } from "../lib/utils";

function FloorPlanPreview({ buildingId, floorNum }: { buildingId: string; floorNum: number }) {
  const data  = FLOOR_PLANS[buildingId];
  const floor = data?.floors.find(f => f.number === floorNum) ?? data?.floors[0];
  const [hovered, setHovered] = useState<string | null>(null);

  if (!floor) return null;

  return (
    <div className="relative bg-muted/20 rounded-xl overflow-hidden border border-border" style={{ height: 260 }}>
      <svg viewBox="0 0 440 280" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <rect width={440} height={280} className="fill-background"/>
        <rect x={8} y={58} width={424} height={214} rx={8}
          fill="rgba(148,163,184,0.06)" stroke="rgba(14,42,110,0.12)" strokeWidth={1.5}/>
        {floor.rooms.map(room => {
          const c = ROOM_COLORS[room.type as RoomType] ?? ROOM_COLORS.classroom;
          return (
            <g key={room.id}
              onMouseEnter={() => setHovered(room.id)}
              onMouseLeave={() => setHovered(null)}>
              <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={3}
                fill={c.fill} stroke={c.stroke}
                strokeWidth={hovered === room.id ? 2 : 1} opacity={hovered === room.id ? 1 : 0.88}/>
              {room.w >= 50 && room.h >= 22 && (
                <text x={room.x + room.w/2} y={room.y + room.h/2 + 3}
                  textAnchor="middle" fill={c.text}
                  fontSize={room.w > 90 ? 8 : 7} fontWeight="600"
                  className="pointer-events-none select-none">
                  {room.name.length > 13 ? room.name.slice(0,12)+"…" : room.name}
                </text>
              )}
            </g>
          );
        })}
        {/* Compass */}
        <g transform="translate(422,72)">
          <circle r={11} fill="white" fillOpacity={0.9} stroke="#cbd5e1" strokeWidth={1}/>
          <text textAnchor="middle" y={-2} fontSize={6} fontWeight="800" fill="#1e40af">N</text>
          <line y1={0} y2={-8} stroke="#1e40af" strokeWidth={1.5}/>
        </g>
      </svg>
      {hovered && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
          {floor.rooms.find(r => r.id === hovered)?.name}
        </div>
      )}
    </div>
  );
}

export function AdminFloorPlansPage() {
  const [selected, setSelected]     = useState<string | null>(null);
  const [floorNum, setFloorNum]      = useState(1);

  const selectedData = selected ? FLOOR_PLANS[selected] : null;
  const building     = selected ? MOCK_BUILDINGS.find(b => b.id === selected) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Floor Plans</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          View and manage floor plan layouts for all campus buildings. Floor plans are used in the public Campus Map when students click "View Floors" on a building.
        </p>
      </div>

      {/* Building grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MOCK_BUILDINGS.map(b => {
          const hasPlan = !!FLOOR_PLANS[b.id];
          const isSelected = selected === b.id;
          return (
            <button key={b.id}
              onClick={() => { setSelected(b.id); setFloorNum(1); }}
              className={cn(
                "flex items-start gap-3 p-4 rounded-2xl border text-left transition-all hover-lift",
                isSelected ? "border-primary/40 bg-primary/5 shadow-md" : "border-border bg-card shadow-sm hover:border-primary/20",
              )}>
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-secondary shrink-0">
                {b.image_url
                  ? <img src={b.image_url} alt="" className="w-full h-full object-cover"/>
                  : <div className="w-full h-full flex items-center justify-center"><Building2 className="h-5 w-5 text-muted-foreground"/></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono font-bold text-primary">{b.code}</span>
                  {hasPlan
                    ? <span className="flex items-center gap-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3"/>{FLOOR_PLANS[b.id].floors.length} floors
                      </span>
                    : <span className="text-[10px] text-muted-foreground">No plan</span>
                  }
                </div>
                <p className="text-sm font-bold text-foreground truncate">{b.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{b.category}</p>
              </div>
              <ChevronRight className={cn("h-4 w-4 shrink-0 mt-1 transition-colors", isSelected ? "text-primary" : "text-muted-foreground")}/>
            </button>
          );
        })}
      </div>

      {/* Floor plan viewer */}
      {selectedData && building && (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden animate-scale-in">
          {/* Building header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Layers className="h-4 w-4 text-primary"/>
              </div>
              <div>
                <h2 className="font-extrabold text-foreground text-sm">{building.name}</h2>
                <p className="text-xs text-muted-foreground">{selectedData.floors.length} floor{selectedData.floors.length>1?"s":""} available</p>
              </div>
            </div>
            {/* Floor selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {selectedData.floors.map(f => (
                <button key={f.number} onClick={() => setFloorNum(f.number)}
                  className={cn("shrink-0 h-8 px-3 rounded-xl text-xs font-extrabold transition-all",
                    floorNum === f.number ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-secondary")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Floor plan preview */}
          <div className="p-5">
            <FloorPlanPreview buildingId={selectedData.buildingId} floorNum={floorNum}/>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-2">
              {(["classroom","office","lab","lobby","restroom","stairs","storage"] as RoomType[]).map(t => (
                <div key={t} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm shrink-0"
                    style={{ background: ROOM_COLORS[t].fill, border:`1px solid ${ROOM_COLORS[t].stroke}` }}/>
                  <span className="text-[10px] text-muted-foreground capitalize">{t}</span>
                </div>
              ))}
            </div>

            {/* Room count */}
            <div className="mt-4 p-3 rounded-xl bg-muted/50 border border-border">
              <p className="text-xs font-bold text-foreground mb-2">
                {selectedData.floors.find(f=>f.number===floorNum)?.label} — Room Summary
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["classroom","office","lab","restroom"] as RoomType[]).map(type => {
                  const floor = selectedData.floors.find(f=>f.number===floorNum);
                  const count = floor?.rooms.filter(r=>r.type===type).length ?? 0;
                  return count > 0 ? (
                    <div key={type} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{background:ROOM_COLORS[type].fill,border:`1px solid ${ROOM_COLORS[type].stroke}`}}/>
                      <span className="text-muted-foreground capitalize">{type}</span>
                      <span className="font-bold text-foreground ml-auto">{count}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
