import { useEffect, useState } from "react";
import {
  X, Settings2, Copy, ChevronUp, ChevronDown, Trash2, Grid3X3, Eye, EyeOff, Square,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { FloorPlan } from "./types";

interface FloorOverviewSidebarProps {
  floor: FloorPlan;
  canvasW: number;
  canvasH: number;
  isFirst: boolean;
  isLast: boolean;
  isOnly: boolean;
  onClose: () => void;
  /** Rename the active floor (trimmed, non-empty). */
  onRename: (label: string) => void;
  /** Apply a new canvas size (validated/clamped by the caller). */
  onCanvasSize: (width: number, height: number) => void;
  onShowGrid: (visible: boolean) => void;
  onGridSize: (size: 10 | 20 | 40) => void;
  onOpenSettings: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  /** Whether the perimeter wall is currently enabled for this floor. */
  perimeterEnabled?: boolean;
}

const labelCls = "block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground";
const inputCls = "w-full h-8 px-2.5 rounded-lg border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200";
const actionBtnCls = "w-full h-8 px-2 rounded-lg text-left text-[11px] font-bold hover:bg-muted flex items-center gap-2 transition-colors disabled:opacity-40 disabled:hover:bg-transparent";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-[9px] font-extrabold uppercase tracking-widest text-primary/70 mb-1.5">{children}</span>;
}

function CommitInput({ ariaLabel, value, onCommit, min = 1 }: {
  ariaLabel: string;
  value: number | string;
  onCommit: (raw: string) => void;
  min?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed !== String(value)) {
      onCommit(trimmed || String(value));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <input
      aria-label={ariaLabel}
      type={typeof value === "number" ? "number" : "text"}
      min={min}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setDraft(String(value)); (e.target as HTMLInputElement).blur(); }
      }}
      className={inputCls}
    />
  );
}

/**
 * Compact Floor section shown in the properties sidebar when a floor is active
 * and no object is selected (object selection always wins). Floor Settings
 * remains the detailed editor — this is a quick-edit surface only.
 */
export function FloorOverviewSidebar({
  floor, canvasW, canvasH, isFirst, isLast, isOnly,
  onClose, onRename, onCanvasSize, onShowGrid, onGridSize,
  onOpenSettings, onDuplicate, onMoveUp, onMoveDown, onDelete,
  perimeterEnabled = false,
}: FloorOverviewSidebarProps) {
  const showGrid = floor.showGrid !== false;
  const gridSize = floor.gridSize ?? 20;

  return (
    <div className="w-64 shrink-0 flex flex-col border-l border-border overflow-hidden bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">Floor Overview</span>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={floor.label}>{floor.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close floor properties"
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── GENERAL ── */}
        <section>
          <SectionLabel>General</SectionLabel>
          <div>
            <span className={labelCls}>Name</span>
            <CommitInput ariaLabel="Name" value={floor.label} onCommit={(raw) => { if (raw.trim()) onRename(raw); }} />
          </div>
        </section>

        {/* ── CANVAS ── */}
        <section>
          <SectionLabel>Canvas</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={labelCls}>Width</span>
              <CommitInput ariaLabel="Width" value={canvasW} onCommit={(raw) => {
                const next = Number(raw);
                if (Number.isFinite(next)) onCanvasSize(next, canvasH);
              }} />
            </div>
            <div>
              <span className={labelCls}>Height</span>
              <CommitInput ariaLabel="Height" value={canvasH} onCommit={(raw) => {
                const next = Number(raw);
                if (Number.isFinite(next)) onCanvasSize(canvasW, next);
              }} />
            </div>
          </div>
        </section>

        {/* ── GRID ── */}
        <section>
          <SectionLabel>Grid</SectionLabel>
          <button
            type="button"
            aria-label="Show Grid"
            aria-pressed={showGrid}
            onClick={() => onShowGrid(!showGrid)}
            className="w-full h-8 px-2.5 rounded-lg border border-border bg-muted/20 flex items-center gap-2 text-left transition-all hover:bg-muted/40"
          >
            <Grid3X3 className={cn("h-3.5 w-3.5", showGrid ? "text-primary" : "text-muted-foreground/60")} />
            <span className="text-[11px] font-bold flex-1">Show Grid</span>
            <span className="text-[9px] opacity-70">{showGrid ? "Visible" : "Hidden"}</span>
            {showGrid ? <Eye className="h-3 w-3 text-primary" /> : <EyeOff className="h-3 w-3 text-muted-foreground/60" />}
          </button>
          <div className="mt-2">
            <span className={labelCls}>Grid Size</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1">
              {([10, 20, 40] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-label={`Floor grid ${size}`}
                  aria-pressed={gridSize === size}
                  onClick={() => onGridSize(size)}
                  className={cn(
                    "h-7 rounded-md text-[10px] font-extrabold transition-all",
                    gridSize === size
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── PERIMETER WALL ── */}
        <section>
          <SectionLabel>Perimeter Wall</SectionLabel>
          <div className="px-3 py-2.5 rounded-xl border border-border bg-muted/20 space-y-1.5">
            <div className="flex items-center gap-2">
              <Square className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-bold text-foreground">Outer Boundary</span>
              <span className={cn(
                "ml-auto text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md",
                perimeterEnabled
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}>
                {perimeterEnabled ? "On" : "Off"}
              </span>
            </div>
            <p className="text-[9px] leading-relaxed text-muted-foreground">
              {perimeterEnabled
                ? "The outer boundary wall is enabled and follows the floor canvas size."
                : "No outer boundary wall. Enable in Floor Settings."}
            </p>
          </div>
        </section>

        {/* ── ACTIONS ── */}
        <section>
          <SectionLabel>Actions</SectionLabel>
          <div className="space-y-1">
            <button type="button" onClick={onOpenSettings} className={`${actionBtnCls} bg-primary/10 text-primary hover:bg-primary/15`}>
              <Settings2 className="h-3.5 w-3.5" /> Open Floor Settings
            </button>
            <button type="button" onClick={onDuplicate} className={actionBtnCls}>
              <Copy className="h-3.5 w-3.5" /> Duplicate Floor
            </button>
            <button type="button" onClick={onMoveUp} disabled={isFirst} title={isFirst ? "Move Up unavailable — already first" : "Move Up"} className={actionBtnCls}>
              <ChevronUp className="h-3.5 w-3.5" /> Move Up
            </button>
            <button type="button" onClick={onMoveDown} disabled={isLast} title={isLast ? "Move Down unavailable — already last" : "Move Down"} className={actionBtnCls}>
              <ChevronDown className="h-3.5 w-3.5" /> Move Down
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isOnly}
              title={isOnly ? "Delete unavailable — a building must keep at least one floor" : "Delete Floor"}
              className={`${actionBtnCls} text-destructive hover:bg-destructive/10`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Floor
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
