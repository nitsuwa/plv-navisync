import { useState } from "react";
import { motion } from "motion/react";
import {
  Plus, Map, Building2, Layers, Globe, X, DoorOpen, MapPin,
  MoreHorizontal, ExternalLink, Clock, CalendarDays,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Campus } from "./types";

interface CampusHomeProps {
  campuses: Campus[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

// ── Mini-map SVG component ──────────────────────────────────────────────────
function CampusMiniMap({ campus, className }: { campus: Campus; className?: string }) {
  const { canvasW, canvasH, buildings, markers } = campus;
  const aspect = canvasW / canvasH;
  const svgW = 280;
  const svgH = Math.round(svgW / aspect);
  const scale = svgW / canvasW;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={cn("w-full h-full", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Background */}
      <rect width={svgW} height={svgH} rx={6} fill="rgba(232,234,240,0.5)" />

      {/* Grid dots */}
      <defs>
        <pattern id="miniGrid" width={16} height={16} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.5} fill="rgba(14,42,110,0.06)" />
        </pattern>
      </defs>
      <rect width={svgW} height={svgH} fill="url(#miniGrid)" />

      {/* Paths */}
      {campus.paths.map((p) => (
        <polyline
          key={p.id}
          points={p.points.map((pt) => `${pt.x * scale},${pt.y * scale}`).join(" ")}
          fill="none"
          stroke={p.color}
          strokeWidth={Math.max(1, p.width * scale)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
      ))}

      {/* Buildings */}
      {buildings.map((b) => {
        const bx = b.x * scale;
        const by = b.y * scale;
        const bw = Math.max(b.width * scale, 6);
        const bh = Math.max(b.height * scale, 4);
        return (
          <g key={b.id}>
            <rect
              x={bx} y={by} width={bw} height={bh}
              rx={2}
              fill={b.color}
              opacity={0.85}
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={0.5}
            />
            {bw > 14 && bh > 8 && (
              <text
                x={bx + bw / 2} y={by + bh / 2 + 2}
                textAnchor="middle"
                fill="white"
                fontSize={Math.min(bw / b.code.length * 0.7, bh * 0.35, 7)}
                fontWeight="700"
                className="pointer-events-none select-none"
              >
                {b.code}
              </text>
            )}
          </g>
        );
      })}

      {/* Markers */}
      {markers.map((m) => (
        <g key={m.id}>
          <circle cx={m.x * scale} cy={m.y * scale} r={4} fill={m.color} stroke="white" strokeWidth={1} />
          <circle cx={m.x * scale} cy={m.y * scale} r={4} fill="none" stroke={m.color} strokeWidth={1.5} opacity={0.4} />
        </g>
      ))}
    </svg>
  );
}

// ── Quick actions dropdown ──────────────────────────────────────────────────
function QuickActions({ campus, onOpen }: { campus: Campus; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground transition-colors"
        title="More actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-scale-in"
            style={{ transformOrigin: "top right" }}>
            <button
              onClick={() => { setOpen(false); onOpen(campus.id); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors text-left"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              Open Editor
            </button>
            <div className="h-px bg-border mx-2" />
            <div className="px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" />
                Created {campus.createdAt}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Updated {campus.updatedAt}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function CampusHome({ campuses, onOpen, onCreate, onDelete }: CampusHomeProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const totalRooms = (campus: Campus) =>
    campus.buildings.reduce((s, b) => s + b.floors.reduce((sf, f) => sf + f.rooms.length, 0), 0);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-6 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl font-extrabold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
            Map Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Create and manage campus maps with buildings and floor plans.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm shrink-0"
        >
          <Plus className="h-4 w-4" /> New Campus
        </button>
      </motion.div>

      {/* Empty state */}
      {campuses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
              <Map className="h-12 w-12 text-primary/30" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center animate-float">
              <Plus className="h-4 w-4 text-accent" />
            </div>
          </div>
          <h2 className="text-xl font-extrabold text-foreground mb-2" style={{ fontFamily: "var(--font-sans)" }}>
            No campuses yet
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-sm leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
            Create your first campus to begin placing buildings, designing floor plans, and publishing interactive maps for students.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={onCreate}
              className="flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> Create First Campus
            </button>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
            {[
              { icon: Building2, label: "Add buildings", desc: "Drag to draw on canvas" },
              { icon: Layers, label: "Design floors", desc: "Draw rooms and paths" },
              { icon: Globe, label: "Publish live", desc: "Visible to students" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-[11px] font-bold text-foreground">{label}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">{desc}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        /* Campus cards grid */
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {campuses.map((campus) => {
            const rooms = totalRooms(campus);
            const totalFloors = campus.buildings.reduce((s, b) => s + b.floors.length, 0);
            return (
              <motion.div
                key={campus.id}
                variants={{
                  hidden: { opacity: 0, y: 24, scale: 0.97 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                className="group bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-lg hover:border-primary/20 transition-all duration-300"
              >
                {/* Mini-map preview */}
                <div className="relative h-36 bg-gradient-to-br from-[#e8eaf0] to-[#f0eee8] overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center p-3">
                    {campus.buildings.length > 0 ? (
                      <CampusMiniMap campus={campus} className="max-h-full max-w-full" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
                        <Map className="h-8 w-8" />
                        <span className="text-[9px] font-medium">No buildings yet</span>
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shadow-sm",
                        campus.publishStatus === "published"
                          ? "bg-green-50 dark:bg-green-900/25 border-green-200 dark:border-green-700/30 text-green-700 dark:text-green-400"
                          : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/30 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {campus.publishStatus === "published" ? (
                        <><Globe className="h-2.5 w-2.5" /> Published</>
                      ) : (
                        <><Clock className="h-2.5 w-2.5" /> Draft</>
                      )}
                    </span>
                  </div>

                  {/* Quick actions */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    <QuickActions campus={campus} onOpen={onOpen} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ id: campus.id, name: campus.name });
                      }}
                      className="w-7 h-7 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center text-destructive/60 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete campus"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-foreground text-sm truncate" style={{ fontFamily: "var(--font-sans)" }}>
                        {campus.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">{campus.code}</span>
                        <span className="text-[8px] text-muted-foreground/40">•</span>
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {campus.updatedAt}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {campus.description && (
                    <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                      {campus.description}
                    </p>
                  )}

                  {/* Stats bar */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Buildings">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="font-semibold tabular-nums">{campus.buildings.length}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Floors">
                      <Layers className="h-3 w-3 shrink-0" />
                      <span className="font-semibold tabular-nums">{totalFloors}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Rooms">
                      <DoorOpen className="h-3 w-3 shrink-0" />
                      <span className="font-semibold tabular-nums">{rooms}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Markers">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="font-semibold tabular-nums">{campus.markers.length}</span>
                    </div>
                  </div>

                  {/* Open button */}
                  <button
                    onClick={() => onOpen(campus.id)}
                    className="w-full mt-3 h-9 rounded-xl bg-primary/10 text-primary text-xs font-extrabold hover:bg-primary hover:text-primary-foreground transition-all"
                  >
                    Open Editor
                  </button>
                </div>
              </motion.div>
            );
          })}

          {/* New Campus card */}
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: campuses.length * 0.04, ease: [0.16, 1, 0.3, 1] }}
            onClick={onCreate}
            className="rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 p-8 hover:border-primary/30 hover:bg-primary/5 transition-all min-h-[280px] group"
          >
            <div className="w-14 h-14 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <Plus className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="text-center">
              <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors block">New Campus</span>
              <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">Add a new campus to the system</span>
            </div>
          </motion.button>
        </motion.div>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Campus"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone. All buildings, floors, and room data will be permanently removed.`}
        confirmLabel="Delete Campus"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirm) onDelete(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
