import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, Map, Building2, Layers, Globe, X, DoorOpen, MapPin,
  MoreHorizontal, ExternalLink, Clock, HelpCircle,
  Pencil, Copy, Eye, EyeOff, Archive, Trash2, CheckCircle2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { TypeToConfirmDialog } from "../ui/TypeToConfirmDialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ActionProgressDialog } from "./ActionProgressDialog";
import { Tooltip } from "../ui/Tooltip";
import { CreateCampusGuide } from "./CreateCampusGuide";
import type { Campus } from "./types";

// ── Empty state illustration — campus creation flow ─────────────────────────
function EmptyStateIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-32 h-24 md:w-40 md:h-[7.5rem] select-none"
      aria-hidden="true"
    >
      {/* Soft background blob */}
      <circle cx={80} cy={60} r={55} fill="var(--accent)" opacity={0.04} />

      {/* Map canvas */}
      <rect x={22} y={22} width={116} height={76} rx={6} fill="#f0eeea" stroke="var(--accent)" strokeOpacity={0.12} strokeWidth={1.5} />

      {/* Grid dots */}
      {[0,1,2,3,4,5].map(row =>
        [0,1,2,3,4,5,6].map(col => (
          <circle key={`${row}-${col}`} cx={34 + col*14} cy={32 + row*11} r={0.6} fill="var(--accent)" opacity={0.08} />
        ))
      )}

      {/* Buildings */}
      <rect x={32} y={58} width={18} height={14} rx={2} fill="var(--accent)" opacity={0.25} stroke="var(--accent)" strokeOpacity={0.15} strokeWidth={1} />
      <rect x={56} y={52} width={22} height={16} rx={2} fill="var(--accent)" opacity={0.35} stroke="var(--accent)" strokeOpacity={0.15} strokeWidth={1} />
      <rect x={88} y={60} width={16} height={12} rx={2} fill="var(--accent)" opacity={0.2} stroke="var(--accent)" strokeOpacity={0.15} strokeWidth={1} />

      {/* Building labels */}
      <text x={41} y={68} textAnchor="middle" fontSize={4} fontWeight="800" fill="var(--accent)" opacity={0.5}>BLDG</text>
      <text x={67} y={63} textAnchor="middle" fontSize={4} fontWeight="800" fill="var(--accent)" opacity={0.6}>BLDG</text>

      {/* Path connecting buildings */}
      <path d="M 41 72 Q 50 84 67 74" fill="none" stroke="var(--accent)" strokeOpacity={0.15} strokeWidth={1.5} strokeLinecap="round" />
      <path d="M 67 74 Q 78 82 96 72" fill="none" stroke="var(--accent)" strokeOpacity={0.15} strokeWidth={1.5} strokeLinecap="round" />

      {/* Map pin marker */}
      <g transform="translate(105, 62)">
        <path d="M0,-5 C-2.5,-5 -4,-2.5 -4,0 C-4,2.5 0,6 0,6 C0,6 4,2.5 4,0 C4,-2.5 2.5,-5 0,-5Z" fill="var(--accent)" opacity={0.4} />
        <circle cx={0} cy={-1} r={1.5} fill="white" />
      </g>

      {/* Plus icon floating top-right */}
      <g transform="translate(125, 30)">
        <circle cx={0} cy={0} r={8} fill="var(--accent)" opacity={0.1} />
        <line x1={-3} y1={0} x2={3} y2={0} stroke="var(--accent)" strokeOpacity={0.3} strokeWidth={1.5} strokeLinecap="round" />
        <line x1={0} y1={-3} x2={0} y2={3} stroke="var(--accent)" strokeOpacity={0.3} strokeWidth={1.5} strokeLinecap="round" />
      </g>
    </svg>
  );
}

export interface CampusHomeProps {
  campuses: Campus[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onTogglePublish?: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onEditDetails?: (id: string) => void;
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
      <rect width={svgW} height={svgH} rx={6} fill="rgba(232,234,240,0.5)" />
      <defs>
        <pattern id="miniGrid" width={16} height={16} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.5} fill="rgba(14,42,110,0.06)" />
        </pattern>
      </defs>
      <rect width={svgW} height={svgH} fill="url(#miniGrid)" />
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
      {buildings.map((b) => {
        const bx = b.x * scale;
        const by = b.y * scale;
        const bw = Math.max(b.width * scale, 6);
        const bh = Math.max(b.height * scale, 4);
        return (
          <g key={b.id}>
            <rect x={bx} y={by} width={bw} height={bh} rx={2} fill={b.color} opacity={0.85} stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
            {bw > 14 && bh > 8 && (
              <text x={bx + bw / 2} y={by + bh / 2 + 2} textAnchor="middle" fill="white" fontSize={Math.min(bw / b.code.length * 0.7, bh * 0.35, 7)} fontWeight="700" className="pointer-events-none select-none">
                {b.code}
              </text>
            )}
          </g>
        );
      })}
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
// ── Publish/Archive confirm dialog state ────────────────────────────────────

interface PublishConfirm {
  id: string;
  action: "publish" | "unpublish";
  name: string;
}

interface ArchiveConfirm {
  id: string;
  name: string;
  wasPublished: boolean;
}

// ── Quick actions dropdown ──────────────────────────────────────────────────

function QuickActions({
  campus,
  onDuplicate,
  onTogglePublish,
  onArchive,
  onEditDetails,
  onDelete,
}: {
  campus: Campus;
  onDuplicate?: (id: string) => void;
  onTogglePublish?: (id: string) => void;
  onArchive?: (id: string) => void;
  onEditDetails?: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Publish/unpublish confirmation + progress
  const [publishConfirm, setPublishConfirm] = useState<PublishConfirm | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<ArchiveConfirm | null>(null);
  const [actionProgress, setActionProgress] = useState<{ open: boolean; state: "loading" | "success" | "error"; action: "publish" | "unpublish" }>({ open: false, state: "loading", action: "publish" });
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handlePublishConfirm = useCallback(() => {
    if (!publishConfirm) return;
    const { id, action } = publishConfirm;
    setPublishConfirm(null);

    // Show the animated progress dialog
    setActionProgress({ open: true, state: "loading", action });

    // Simulate a brief loading delay, then execute the action
    progressTimeoutRef.current = setTimeout(() => {
      try {
        onTogglePublish?.(id);
        setActionProgress((prev) => ({ ...prev, state: "success" }));
      } catch {
        setActionProgress((prev) => ({ ...prev, state: "error" }));
      }
    }, 1500);
  }, [publishConfirm, onTogglePublish]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, []);

  const isPublished = campus.publishStatus === "published";

  const actions = [
    ...(onEditDetails ? [{ icon: Pencil, label: "Edit Details", action: () => { setOpen(false); onEditDetails(campus.id); } }] : []),
    ...(onDuplicate ? [{ icon: Copy, label: "Duplicate Campus", action: () => { setOpen(false); onDuplicate(campus.id); } }] : []),
    { type: "separator" as const },
    ...(onTogglePublish ? [{
      icon: isPublished ? EyeOff : Eye,
      label: isPublished ? "Unpublish" : "Publish",
      action: () => {
        setOpen(false);
        setPublishConfirm({ id: campus.id, action: isPublished ? "unpublish" : "publish", name: campus.name });
      },
    }] : []),
    ...(onArchive && campus.status !== "archived" ? [{
      icon: Archive,
      label: "Archive",
      action: () => {
        setOpen(false);
        setArchiveConfirm({ id: campus.id, name: campus.name, wasPublished: campus.publishStatus === "published" });
      },
    }] : []),
    { type: "separator" as const },
    { icon: Trash2, label: "Delete", danger: true, action: () => { setOpen(false); setConfirmAction(campus.id); } },
  ];

  return (
    <>
      <div className="relative">
        <button
          ref={btnRef}
          onClick={(e) => {
            e.stopPropagation();
            if (btnRef.current) {
              const rect = btnRef.current.getBoundingClientRect();
              setDropdownPos({ x: rect.right, y: rect.bottom });
            }
            setOpen((v) => !v);
          }}
          className="w-7 h-7 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground transition-colors"
          title="More actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'fixed',
                  left: Math.min(dropdownPos.x, window.innerWidth - 220),
                  top: dropdownPos.y + 4,
                  zIndex: 50,
                  transformOrigin: 'top right',
                }}
                className="w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
              >
                {/* Campus details header */}
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-[11px] font-extrabold text-foreground truncate">{campus.name}</p>
                  <p className="text-[9px] text-muted-foreground font-mono mt-0.5">{campus.code} · {campus.buildings.length} building{campus.buildings.length !== 1 ? 's' : ''} · {campus.updatedAt}</p>
                </div>
                <div className="py-1">
                  {actions.map((item, idx) => {
                    if ("type" in item && item.type === "separator") {
                      return <div key={idx} className="h-px bg-border mx-2 my-1" />;
                    }
                    if ("icon" in item) {
                      return (
                        <button
                          key={idx}
                          onClick={item.action}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-colors text-left",
                            (item as any).danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted"
                          )}
                        >
                          <item.icon className={cn("h-3.5 w-3.5", (item as any).danger ? "text-destructive" : "text-muted-foreground")} />
                          {item.label}
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Type-to-confirm delete dialog for dropdown */}
      <TypeToConfirmDialog
        open={confirmAction === campus.id}
        title="Delete Campus"
        message={`This action cannot be undone. All buildings, floors, and room data for "${campus.name}" will be permanently removed.`}
        confirmText={campus.name}
        confirmLabel="Delete Campus"
        variant="danger"
        onConfirm={() => { onDelete(campus.id); setConfirmAction(null); }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Publish/Unpublish confirmation dialog */}
      <ConfirmDialog
        open={publishConfirm !== null}
        title={isPublished ? "Unpublish Campus?" : "Publish Campus?"}
        message={
          isPublished
            ? `"${campus.name}" will be taken down from the student-facing map and CampusDataProvider. Students will no longer be able to see it.`
            : `"${campus.name}" will be made visible to all students through the campus map and CampusDataProvider.`
        }
        confirmLabel={isPublished ? "Unpublish" : "Publish"}
        cancelLabel="Cancel"
        variant={isPublished ? "warning" : "info"}
        onConfirm={handlePublishConfirm}
        onCancel={() => setPublishConfirm(null)}
      />

      {/* Archive confirmation dialog */}
      <ConfirmDialog
        open={archiveConfirm !== null}
        title="Archive Campus?"
        message={
          archiveConfirm?.wasPublished
            ? `"${archiveConfirm.name}" will be hidden from all students and visitors. All buildings, floor plans, routes, and settings will be preserved. You can restore this campus at any time.`
            : `"${archiveConfirm?.name}" is currently a draft and not visible to students. Archiving will move it to the archived section. You can restore it at any time.`
        }
        confirmLabel="Archive"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          if (!archiveConfirm) return;
          onArchive?.(archiveConfirm.id);
          setArchiveConfirm(null);
        }}
        onCancel={() => setArchiveConfirm(null)}
      />

      {/* Animated publish/unpublish progress dialog */}
      <ActionProgressDialog
        open={actionProgress.open}
        state={actionProgress.state}
        action={actionProgress.action === "unpublish" ? "unpublishing" : "publishing"}
        entityName={campus.name}
        onClose={() => setActionProgress((prev) => ({ ...prev, open: false }))}
        onRetry={() => {
          setActionProgress({ open: true, state: "loading", action: actionProgress.action });
          progressTimeoutRef.current = setTimeout(() => {
            try {
              onTogglePublish?.(campus.id);
              setActionProgress((prev) => ({ ...prev, state: "success" }));
            } catch {
              setActionProgress((prev) => ({ ...prev, state: "error" }));
            }
          }, 1500);
        }}
        autoDismissMs={1500}
      />
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function CampusHome({
  campuses,
  onOpen,
  onCreate,
  onDelete,
  onDuplicate,
  onTogglePublish,
  onArchive,
  onRestore,
  onEditDetails,
}: CampusHomeProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Filter out archived campuses unless we want to show them
  const activeCampuses = campuses.filter((c) => c.status !== "archived");
  const archivedCampuses = campuses.filter((c) => c.status === "archived");

  const totalRooms = (campus: Campus) =>
    campus.buildings.reduce((s, b) => s + b.floors.reduce((sf, f) => sf + f.rooms.length, 0), 0);

  const totalFloors = (campus: Campus) =>
    campus.buildings.reduce((s, b) => s + b.floors.length, 0);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-6 lg:p-8">
      {/* Type-to-confirm delete dialog for X button */}
      {deleteConfirm && (
        <TypeToConfirmDialog
          open={!!deleteConfirm}
          title="Delete Campus"
          message={`This action cannot be undone. All buildings, floors, and room data for "${deleteConfirm.name}" will be permanently removed.`}
          confirmText={deleteConfirm.name}
          confirmLabel="Delete Campus"
          variant="danger"
          onConfirm={() => {
            onDelete(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Campus Creation Guide */}
      <CreateCampusGuide
        open={showGuide}
        onClose={() => setShowGuide(false)}
        onStartCreating={onCreate}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl font-extrabold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
            Campus Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Create and manage digital campuses with buildings, floor plans, and navigation data.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Guide to creating a campus"
          >
            <HelpCircle className="h-4 w-4 text-primary" />
            Guide
          </button>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Campus
          </button>
        </div>
      </motion.div>

      {/* Empty state — no campuses yet */}
      {activeCampuses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center pt-12 md:pt-16 pb-12 text-center"
        >
          <div className="mb-6">
            <EmptyStateIllustration />
          </div>
          <h2 className="text-xl font-extrabold text-foreground mb-2" style={{ fontFamily: "var(--font-sans)" }}>
            No campuses yet
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
            Create your first campus to begin placing buildings, designing floor plans, and publishing interactive maps for students.
          </p>

          <div className="grid grid-cols-3 gap-6 md:gap-10 max-w-sm mb-6">
            {[
              { icon: Building2, label: "Identity", desc: "Name and describe your campus" },
              { icon: MapPin, label: "Location", desc: "Set address and coordinates" },
              { icon: CheckCircle2, label: "Review", desc: "Review details and publish" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center ring-1 ring-border/50">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-[11px] font-bold text-foreground">{label}</span>
                <span className="text-[9px] text-muted-foreground leading-tight max-w-[90px]">{desc}</span>
              </div>
            ))}
          </div>

          <button
            onClick={onCreate}
            className="flex items-center gap-2 h-12 px-8 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors shadow-md"
          >
            <Plus className="h-4 w-4" /> Create First Campus
          </button>
        </motion.div>
      ) : (
        <>
          {/* Campus cards grid */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {activeCampuses.map((campus) => {
              const rooms = totalRooms(campus);
              const floors = totalFloors(campus);
              return (
                <motion.div
                  key={campus.id}
                  variants={{
                    hidden: { opacity: 0, y: 24, scale: 0.97 },
                    visible: { opacity: 1, y: 0, scale: 1 },
                  }}
                  className="group bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300" style={campus.themeColor ? { borderTopColor: campus.themeColor, borderTopWidth: '3px' } : undefined}
                >
                  {/* Preview area */}
                  <div className="relative h-40 bg-gradient-to-br from-[#e8eaf0] to-[#f0eee8] overflow-hidden">
                    {campus.thumbnail ? (
                      <img
                        src={campus.thumbnail}
                        alt={campus.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
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
                    )}

                    {/* Gradient overlay for readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

                    {/* Status badges */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border shadow-sm backdrop-blur-sm",
                          campus.publishStatus === "published"
                            ? "bg-green-50/90 dark:bg-green-900/25 border-green-200 dark:border-green-700/30 text-green-700 dark:text-green-400"
                            : campus.publishedAt
                              ? "bg-amber-50/90 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/30 text-amber-700 dark:text-amber-400"
                              : "bg-slate-50/90 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/30 text-slate-500 dark:text-slate-400"
                        )}
                      >
                        {campus.publishStatus === "published" ? (
                          <><Globe className="h-2.5 w-2.5" /> Published</>
                        ) : campus.publishedAt ? (
                          <><Clock className="h-2.5 w-2.5" /> Draft</>
                        ) : (
                          <><Clock className="h-2.5 w-2.5" /> Never Published</>
                        )}
                      </span>
                      {campus.visibleToStudents && campus.publishStatus === "published" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border border-blue-200 dark:border-blue-700/30 bg-blue-50/90 dark:bg-blue-900/25 text-blue-700 dark:text-blue-400 shadow-sm backdrop-blur-sm">
                          <Eye className="h-2.5 w-2.5" /> Visible
                        </span>
                      )}
                    </div>

                    {/* Quick actions — always visible delete button + dropdown */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                      <QuickActions
                        campus={campus}
                        onDuplicate={onDuplicate}
                        onTogglePublish={onTogglePublish}
                        onArchive={onArchive}
                        onEditDetails={onEditDetails}
                        onDelete={onDelete}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ id: campus.id, name: campus.name });
                        }}
                        className="w-7 h-7 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center text-destructive/60 hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Delete campus"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Campus code badge at bottom */}
                    <div className="absolute bottom-2 right-2">
                      <span className="text-[10px] font-mono font-bold text-white/80 bg-black/30 px-2 py-0.5 rounded-md backdrop-blur-sm">
                        {campus.code}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4" style={campus.themeColor ? { backgroundColor: campus.themeColor + '08' } : undefined}>
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-foreground text-sm truncate flex items-center gap-1.5" style={{ fontFamily: "var(--font-sans)" }}>
                          {campus.themeColor && (
                            <span className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[9px] font-extrabold text-white" style={{ backgroundColor: campus.themeColor }}>
                              {campus.code?.slice(0, 2) || 'PL'}
                            </span>
                          )}
                          {campus.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1.5">
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
                      <Tooltip content="Buildings">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="font-semibold tabular-nums">{campus.buildings.length}</span>
                        </span>
                      </Tooltip>
                      <Tooltip content="Floors">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                          <Layers className="h-3 w-3 shrink-0" />
                          <span className="font-semibold tabular-nums">{floors}</span>
                        </span>
                      </Tooltip>
                      <Tooltip content="Rooms">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                          <DoorOpen className="h-3 w-3 shrink-0" />
                          <span className="font-semibold tabular-nums">{rooms}</span>
                        </span>
                      </Tooltip>
                      <Tooltip content="Markers">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="font-semibold tabular-nums">{campus.markers.length}</span>
                        </span>
                      </Tooltip>
                      <div className="flex-1" />
                      {campus.publishedAt && (
                        <Tooltip content="Last published">
                          <span className={cn(
                            "flex items-center gap-1 text-[10px] cursor-help",
                            campus.publishStatus === "published" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                          )}>
                            <Globe className="h-3 w-3 shrink-0" />
                            <span className="font-semibold">{campus.publishedAt}</span>
                          </span>
                        </Tooltip>
                      )}
                    </div>

                    {/* Open button */}
                    <button
                      onClick={() => onOpen(campus.id)}
                      className="w-full mt-3 h-9 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5"
                      style={campus.themeColor ? { backgroundColor: campus.themeColor + '15', color: campus.themeColor } : { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}
                      onMouseEnter={(e) => { if (campus.themeColor) { e.currentTarget.style.backgroundColor = campus.themeColor; e.currentTarget.style.color = 'white'; } else { e.currentTarget.style.backgroundColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary-foreground)'; } }}
                      onMouseLeave={(e) => { if (campus.themeColor) { e.currentTarget.style.backgroundColor = campus.themeColor + '15'; e.currentTarget.style.color = campus.themeColor; } else { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--primary) 10%, transparent)'; e.currentTarget.style.color = 'var(--primary)'; } }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Editor
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Archived campuses section */}
          {archivedCampuses.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mt-10"
            >
              <h3 className="text-sm font-extrabold text-muted-foreground mb-3 flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Archived Campuses ({archivedCampuses.length})
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedCampuses.map((campus) => (
                  <div
                    key={campus.id}
                    className="bg-muted/30 rounded-2xl border border-border/50 p-4 opacity-60 hover:opacity-90 transition-opacity"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <Archive className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{campus.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{campus.code}</p>
                      </div>
                      <button
                        onClick={() => onRestore?.(campus.id)}
                        className="text-xs font-bold text-primary hover:underline shrink-0"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
