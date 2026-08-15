import { useEffect, useMemo } from "react";
import { Pencil, Copy, ChevronUp, ChevronDown, Trash2, Settings2 } from "lucide-react";
import type { FloorPlan } from "./types";

const MENU_WIDTH = 176;

interface FloorActionsMenuProps {
  /** Viewport coordinates where the menu should open. */
  x: number;
  y: number;
  /** The floor this menu operates on (not necessarily the active floor). */
  floor: FloorPlan;
  isFirst: boolean;
  isLast: boolean;
  /** True when this is the only floor — disables Delete. */
  isOnly: boolean;
  /** Directional wording for the canonical vertical floor order. */
  moveUpLabel?: string;
  moveDownLabel?: string;
  /** Include "Floor Settings" (Floor Editor only). */
  showSettings?: boolean;
  testId?: string;
  onClose: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onSettings?: () => void;
}

const itemCls = "w-full h-8 px-2 rounded-lg text-left text-[11px] font-bold hover:bg-muted flex items-center gap-2 transition-colors disabled:opacity-40 disabled:hover:bg-transparent";
const dividerCls = "my-1 h-px bg-border";

/**
 * Shared "floor actions" menu used by the Floor Editor `...` button, Floor tab
 * right-clicks, the Hierarchy floor rows, and (through the same handlers) the
 * Floor Overview sidebar. All surfaces render the exact same action set so the
 * UX stays consistent; only the directional labels and optional Floor Settings
 * entry vary by surface.
 */
export function FloorActionsMenu({
  x, y, floor, isFirst, isLast, isOnly,
  moveUpLabel = "Move Up", moveDownLabel = "Move Down",
  showSettings = false, testId,
  onClose, onRename, onDuplicate, onMoveUp, onMoveDown, onDelete, onSettings,
}: FloorActionsMenuProps) {
  // Keep the menu inside the viewport when opened near an edge.
  const position = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      left: Math.max(8, Math.min(x, vw - MENU_WIDTH - 8)),
      top: Math.max(8, Math.min(y, vh - 252)),
    };
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Click-outside / right-click-outside backdrop */}
      <div
        className="fixed inset-0 z-[139]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        data-testid={testId}
        className="fixed z-[140] w-44 rounded-xl border border-border bg-card shadow-2xl p-1.5"
        style={{ left: position.left, top: position.top }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onRename} className={itemCls}>
          <Pencil className="h-3.5 w-3.5" /> Rename Floor
        </button>
        <button type="button" onClick={onDuplicate} className={itemCls}>
          <Copy className="h-3.5 w-3.5" /> Duplicate Floor
        </button>
        <div className={dividerCls} />
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title={isFirst ? `${moveUpLabel} unavailable — already first` : moveUpLabel}
          className={itemCls}
        >
          <ChevronUp className="h-3.5 w-3.5" /> {moveUpLabel}
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title={isLast ? `${moveDownLabel} unavailable — already last` : moveDownLabel}
          className={itemCls}
        >
          <ChevronDown className="h-3.5 w-3.5" /> {moveDownLabel}
        </button>
        {showSettings && (
          <>
            <div className={dividerCls} />
            <button type="button" onClick={onSettings} className={itemCls}>
              <Settings2 className="h-3.5 w-3.5" /> Floor Settings
            </button>
          </>
        )}
        <div className={dividerCls} />
        <button
          type="button"
          onClick={onDelete}
          disabled={isOnly}
          title={isOnly ? "Delete unavailable — a building must keep at least one floor" : "Delete Floor"}
          className={`${itemCls} text-destructive hover:bg-destructive/10`}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Floor
        </button>
        <p className="px-2 pt-1.5 text-[9px] text-muted-foreground/70 truncate" title={floor.label}>
          {floor.label}
        </p>
      </div>
    </>
  );
}
