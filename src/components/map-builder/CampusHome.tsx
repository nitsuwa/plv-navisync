import { useState, useRef, useCallback, useEffect, useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  Plus, Map, Building2, Layers, Globe, X, DoorOpen, MapPin, SearchX,
  MoreHorizontal, ExternalLink, Clock, HelpCircle,
  Pencil, Copy, Eye, EyeOff, Archive, CheckCircle2, Check, Loader2, Trash2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ActionProgressDialog, type ActionType, type ActionState } from "./ActionProgressDialog";
import { Tooltip } from "../ui/Tooltip";
import { SearchBar } from "../ui/SearchBar";
import { useDebounce } from "../../hooks/useDebounce";
import { highlightSearch } from "../../hooks/useSearchHighlight";
import { campusMatchesQuery, campusStatusOf, type CampusStatusFilter } from "../../lib/campusHelpers";
import { userFacingCampusMessage } from "../../services/campusService";
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
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
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
  onDuplicate?: (id: string) => void | Promise<void>;
  onTogglePublish?: (id: string, force?: "publish" | "unpublish") => void | Promise<void>;
  onUnpublish?: (id: string) => void | Promise<void>;
  onArchive?: (id: string) => void | Promise<void>;
  onRestore?: (id: string) => void | Promise<void>;
  onBulkRestore?: (ids: string[]) => void | Promise<void>;
  onPermanentDelete?: (id: string) => void | Promise<void>;
  onBulkPermanentDelete?: (
    ids: string[],
    onProgress?: (progress: BulkDeleteProgress) => void,
  ) => void | Promise<BulkDeleteResult | void>;
  /** Kept for callers that have not applied the database delete migration yet. */
  permanentDeleteUnavailableReason?: string;
  onEditDetails?: (id: string) => void;
}

export interface BulkDeleteProgress {
  completed: number;
  total: number;
  currentName?: string;
}

export interface BulkDeleteFailure {
  id: string;
  name: string;
  stage?: string;
  code?: string;
  message: string;
  details?: string;
  hint?: string;
  userMessage: string;
}

export interface BulkDeleteResult {
  succeededIds: string[];
  failedIds: string[];
  failureMessage?: string;
  failures?: BulkDeleteFailure[];
}

// ── Search & filter helpers ─────────────────────────────────────────────────
const STATUS_FILTERS: { id: CampusStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "never", label: "Never Published" },
  { id: "archived", label: "Archived" },
];

/** Renders text with search matches highlighted (or plain when there is no query). */
function HighlightedName({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {highlightSearch(text, query).map((seg, i) =>
        seg.isHighlight ? (
          <mark key={i} className="bg-primary/20 text-foreground rounded-[3px] px-0.5">{seg.text}</mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

// ── Mini-map SVG component ──────────────────────────────────────────────────
function CampusMiniMap({ campus, className }: { campus: Campus; className?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const { buildings, markers } = campus;
  const canvasW = campus.canvasW ?? 900;
  const canvasH = campus.canvasH ?? 680;
  const aspect = canvasW / canvasH;
  const svgW = 280;
  const svgH = Math.round(svgW / aspect);
  const scale = svgW / canvasW;

  if (!ready) {
    return (
      <div className={cn("w-full h-full rounded-lg bg-gradient-to-br from-[#e8eaf0] to-[#f0eee8]", className)} />
    );
  }

  return (
    <svg
      data-testid="campus-mini-map"
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={cn("w-full h-full", className)}
      preserveAspectRatio="xMidYMid meet"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    >
      <rect width={svgW} height={svgH} rx={6} fill="rgba(232,234,240,0.5)" />
      <defs>
        <pattern id="miniGrid" width={16} height={16} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.5} fill="rgba(14,42,110,0.06)" />
        </pattern>
      </defs>
      <rect width={svgW} height={svgH} fill="url(#miniGrid)" />
      {(campus.paths ?? []).map((p) => (
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
      {(buildings ?? []).map((b) => {
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
      {(markers ?? []).map((m) => (
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

interface PermanentDeleteConfirm {
  id: string;
  name: string;
}

function TypedConfirmationDialog({
  open,
  title,
  message,
  expected,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  expected: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!open) {
      setValue("");
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);
  if (!open) return null;
  const matches = value === expected;
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900/50 bg-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <Trash2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{message}</p>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mt-4 block text-[11px] font-bold text-foreground">
          Type <span className="font-mono text-destructive">{expected}</span> to confirm
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") onCancel(); if (event.key === "Enter" && matches) onConfirm(); }}
            className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            aria-label={`Type ${expected} to confirm`}
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
          <button type="button" disabled={!matches} onClick={onConfirm} className="h-10 flex-1 rounded-xl bg-destructive text-xs font-extrabold text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-40">{confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Quick actions dropdown ──────────────────────────────────────────────────

function QuickActions({
  campus,
  archived = false,
  onOpen,
  onDuplicate,
  onTogglePublish,
  onUnpublish,
  onArchive,
  onRestore,
  onPermanentDelete,
  onEditDetails,
}: {
  campus: Campus;
  archived?: boolean;
  onOpen?: (id: string) => void;
  onDuplicate?: (id: string) => void | Promise<void>;
  onTogglePublish?: (id: string, force?: "publish" | "unpublish") => void | Promise<void>;
  onUnpublish?: (id: string) => void | Promise<void>;
  onArchive?: (id: string) => void | Promise<void>;
  onRestore?: (id: string) => void | Promise<void>;
  onPermanentDelete?: (id: string) => void | Promise<void>;
  onEditDetails?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownLayout, setDropdownLayout] = useState<{ left: number; top: number; transformOrigin: string }>({
    left: 8,
    top: 8,
    transformOrigin: "top right",
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Publish/unpublish confirmation + progress
  const [publishConfirm, setPublishConfirm] = useState<PublishConfirm | null>(null);
  const [emptyPublishConfirm, setEmptyPublishConfirm] = useState<PublishConfirm | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<ArchiveConfirm | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<PermanentDeleteConfirm | null>(null);
  const [actionProgress, setActionProgress] = useState<{
    open: boolean;
    state: ActionState;
    action: ActionType;
    errorMessage?: string;
  } | null>(null);

  // ── Keyboard-accessible menu (role="menu", arrow keys, Escape, focus mgmt) ──
  const menuId = useId();
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeMenu = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger so keyboard users stay in place
    btnRef.current?.focus();
  }, []);

  const focusMenuItem = useCallback((from: number, dir: 1 | -1) => {
    const items = itemRefs.current;
    const n = items.length;
    if (n === 0) return;
    let i = from;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      const el = items[i];
      if (el) { el.focus(); return; }
    }
  }, []);

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const cur = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
      focusMenuItem(cur >= 0 ? cur : -1, 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const cur = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
      focusMenuItem(cur >= 0 ? cur : 0, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusMenuItem(-1, 1);
    } else if (e.key === "End") {
      e.preventDefault();
      focusMenuItem(itemRefs.current.length, -1);
    } else if (e.key === "Tab") {
      // Standard menu behavior: Tab closes the menu and continues
      closeMenu();
    }
  }, [closeMenu, focusMenuItem]);

  const startPublishProgress = useCallback(async (id: string, action: "publish" | "unpublish") => {
    const progressAction: ActionType = action === "unpublish" ? "unpublishing" : "publishing";
    setActionProgress({ open: true, state: "loading", action: progressAction });
    try {
      if (action === "unpublish" && !onTogglePublish) {
        if (!onUnpublish) throw new Error("Unpublish is not available for this campus.");
        await onUnpublish(id);
      } else {
        if (!onTogglePublish) throw new Error("Publish is not available yet.");
        await onTogglePublish(id, action);
      }
      setActionProgress((prev) => (prev ? { ...prev, state: "success" } : prev));
    } catch (error) {
      setActionProgress((prev) => (prev ? { ...prev, state: "error", errorMessage: userFacingCampusMessage(error) } : prev));
    }
  }, [onTogglePublish, onUnpublish]);

  const handlePublishConfirm = useCallback(() => {
    if (!publishConfirm) return;
    const { id, action } = publishConfirm;
    setPublishConfirm(null);

    // Edge-case guard: publishing a campus with zero buildings would expose an empty map
    if (action === "publish" && (campus.buildings ?? []).length === 0) {
      setEmptyPublishConfirm({ id, action, name: campus.name });
      return;
    }

    startPublishProgress(id, action);
  }, [publishConfirm, campus.buildings.length, campus.name, startPublishProgress]);

  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicateTarget) return;
    const id = duplicateTarget;
    setDuplicateTarget(null);
    setActionProgress({ open: true, state: "loading", action: "duplicating" });
    try {
      if (!onDuplicate) throw new Error("Duplicate is not available for this campus.");
      await onDuplicate(id);
      setActionProgress((prev) => (prev ? { ...prev, state: "success" } : prev));
    } catch (error) {
      setActionProgress((prev) => (prev ? { ...prev, state: "error", errorMessage: userFacingCampusMessage(error) } : prev));
    }
  }, [duplicateTarget, onDuplicate]);

  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveConfirm) return;
    const { id } = archiveConfirm;
    setArchiveConfirm(null);
    // Published campuses must be explicitly unpublished first; the admin
    // can then choose Archive again once it is private.
    if (archiveConfirm.wasPublished) {
      await startPublishProgress(id, "unpublish");
      return;
    }
    setActionProgress({ open: true, state: "loading", action: "archiving" });
    try {
      if (!onArchive) throw new Error("Archive is not available for this campus.");
      await onArchive(id);
      setActionProgress((prev) => (prev ? { ...prev, state: "success" } : prev));
    } catch (error) {
      setActionProgress((prev) => (prev ? { ...prev, state: "error", errorMessage: userFacingCampusMessage(error) } : prev));
    }
  }, [archiveConfirm, onArchive, startPublishProgress]);

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreTarget) return;
    const id = restoreTarget;
    setRestoreTarget(null);
    setActionProgress({ open: true, state: "loading", action: "restoring" });
    try {
      if (!onRestore) throw new Error("Restore is not available for this campus.");
      await onRestore(id);
      setActionProgress((prev) => (prev ? { ...prev, state: "success" } : prev));
    } catch (error) {
      setActionProgress((prev) => (prev ? { ...prev, state: "error", errorMessage: userFacingCampusMessage(error) } : prev));
    }
  }, [restoreTarget, onRestore]);

  const handlePermanentDeleteConfirm = useCallback(async () => {
    if (!permanentDeleteTarget || actionProgress?.state === "loading") return;
    const id = permanentDeleteTarget.id;
    setPermanentDeleteTarget(null);
    setActionProgress({ open: true, state: "loading", action: "deleting" });
    try {
      if (!onPermanentDelete) throw new Error("Permanent deletion is not available for this campus.");
      await onPermanentDelete(id);
      setActionProgress((prev) => (prev ? { ...prev, state: "success" } : prev));
    } catch (error) {
      setActionProgress((prev) => (prev ? { ...prev, state: "error", errorMessage: userFacingCampusMessage(error) } : prev));
    }
  }, [permanentDeleteTarget, actionProgress?.state, onPermanentDelete]);


  const handleProgressRetry = useCallback(() => {
    if (!actionProgress) return;
    setActionProgress({ ...actionProgress, state: "loading" });
    const currentAction = actionProgress.action;
    const run = async () => {
      try {
        // Re-run the exact same direction so retrying an unpublish doesn't re-publish
        if (currentAction === "publishing") {
          if (!onTogglePublish) throw new Error("Publish is not available yet.");
          await onTogglePublish(campus.id, "publish");
        } else if (currentAction === "unpublishing") {
          if (onTogglePublish) await onTogglePublish(campus.id, "unpublish");
          else if (onUnpublish) await onUnpublish(campus.id);
          else throw new Error("Unpublish is not available for this campus.");
        } else if (currentAction === "duplicating") {
          if (!onDuplicate) throw new Error("Duplicate is not available for this campus.");
          await onDuplicate(campus.id);
        } else if (currentAction === "archiving") {
          if (!onArchive) throw new Error("Archive is not available for this campus.");
          await onArchive(campus.id);
        } else if (currentAction === "restoring") {
          if (!onRestore) throw new Error("Restore is not available for this campus.");
          await onRestore(campus.id);
        } else if (currentAction === "deleting") {
          if (!onPermanentDelete) throw new Error("Permanent deletion is not available for this campus.");
          await onPermanentDelete(campus.id);
        }
        setActionProgress((prev) => (prev ? { ...prev, state: "success" } : prev));
      } catch (error) {
        setActionProgress((prev) => (prev ? { ...prev, state: "error", errorMessage: userFacingCampusMessage(error) } : prev));
      }
    };
    void run();
  }, [actionProgress, onTogglePublish, onUnpublish, onDuplicate, onArchive, onRestore, onPermanentDelete, campus.id]);

  const isPublished = campus.publishStatus === "published";

  const actions = archived
    ? [
      ...(onRestore ? [{ icon: Archive, label: "Restore Campus", action: () => { setOpen(false); setRestoreTarget(campus.id); } }] : []),
      ...(onPermanentDelete ? [{ icon: Trash2, label: "Delete Permanently", danger: true, action: () => {
        if (actionProgress?.state === "loading") return;
        setOpen(false);
        setPermanentDeleteTarget({ id: campus.id, name: campus.name });
      } }] : []),
    ]
    : [
      ...(onOpen ? [{ icon: ExternalLink, label: "Open Campus", action: () => { setOpen(false); onOpen(campus.id); } }] : []),
      ...(onEditDetails ? [{ icon: Pencil, label: "Edit Details", action: () => { setOpen(false); onEditDetails(campus.id); } }] : []),
      ...(onDuplicate ? [{ icon: Copy, label: "Duplicate Campus", action: () => { setOpen(false); setDuplicateTarget(campus.id); } }] : []),
      { type: "separator" as const },
      ...((onTogglePublish || (isPublished && onUnpublish)) ? [{
        icon: isPublished ? EyeOff : Eye,
        label: isPublished ? "Unpublish" : "Publish",
        action: () => {
          setOpen(false);
          setPublishConfirm({ id: campus.id, action: isPublished ? "unpublish" : "publish", name: campus.name });
        },
      }] : []),
      ...(onArchive && campus.status !== "archived" ? [{
        icon: Archive,
        label: "Archive Campus",
        action: () => {
          setOpen(false);
          setArchiveConfirm({ id: campus.id, name: campus.name, wasPublished: campus.publishStatus === "published" });
        },
      }] : []),
    ];

  // The actions menu is portaled to body, so it is not clipped by the campus
  // card/page.  Recalculate against the viewport after it mounts: cards near
  // the bottom edge should open upward, while long menus remain scrollable.
  const positionMenu = useCallback(() => {
    if (!btnRef.current || !menuRef.current || typeof window === "undefined") return;
    const trigger = btnRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const padding = 8;
    const gap = 4;
    const menuWidth = Math.max(1, menu.width || 208);
    const menuHeight = Math.max(1, menu.height);
    const spaceBelow = window.innerHeight - trigger.bottom - gap - padding;
    const spaceAbove = trigger.top - gap - padding;
    const opensAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const maxTop = Math.max(padding, window.innerHeight - menuHeight - padding);
    const top = Math.max(padding, Math.min(
      opensAbove ? trigger.top - menuHeight - gap : trigger.bottom + gap,
      maxTop,
    ));
    const preferredRight = trigger.right + gap;
    const preferredLeft = trigger.left - menuWidth - gap;
    const left = Math.max(
      padding,
      Math.min(
        preferredRight + menuWidth <= window.innerWidth - padding ? preferredRight : preferredLeft,
        window.innerWidth - menuWidth - padding,
      ),
    );
    setDropdownLayout({
      left,
      top,
      transformOrigin: opensAbove ? "bottom right" : "top right",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
    const update = () => positionMenu();
    window.addEventListener("resize", update);
    // Capture scroll from the page/card scroll container as well as window.
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, positionMenu, actions.length]);

  const progressActionType = actionProgress?.action ?? "publishing";

  return (
    <>
      <div className="relative">
        <button
          ref={btnRef}
          onClick={(e) => {
            e.stopPropagation();
            if (btnRef.current) {
              const rect = btnRef.current.getBoundingClientRect();
              setDropdownLayout({ left: rect.right + 4, top: rect.bottom + 4, transformOrigin: "top right" });
            }
            setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            // Open with the keyboard and focus the first item
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
              requestAnimationFrame(() => itemRefs.current[0]?.focus());
            } else if (e.key === "Escape" && open) {
              closeMenu();
            }
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Actions for ${campus.name}`}
          className="w-7 h-7 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground transition-colors"
          title="More actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {open && createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} />
            <motion.div
              id={menuId}
              role="menu"
              aria-label={`Actions for ${campus.name}`}
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'fixed',
                left: dropdownLayout.left,
                top: dropdownLayout.top,
                zIndex: 50,
                transformOrigin: dropdownLayout.transformOrigin,
              }}
              ref={menuRef}
              className="w-52 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-border bg-card shadow-xl scrollbar-show-on-hover"
              onKeyDown={handleMenuKeyDown}
            >
                {/* Campus details header */}
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-[11px] font-extrabold text-foreground truncate">{campus.name}</p>
                  <p className="text-[9px] text-muted-foreground font-mono mt-0.5">{campus.code} · {(campus.buildings ?? []).length} building{(campus.buildings ?? []).length !== 1 ? 's' : ''} · {campus.updatedAt}</p>
                </div>
                <div className="py-1">
                  {actions.map((item, idx) => {
                    if ("type" in item && item.type === "separator") {
                      return <div key={idx} role="separator" className="h-px bg-border mx-2 my-1" />;
                    }
                    if ("icon" in item) {
                      return (
                        <button
                          key={idx}
                          ref={(el) => { itemRefs.current[idx] = el; }}
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpen(false);
                            item.action();
                          }}
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
          </>,
          document.body
        )}
      </div>

      {/* ── All dialogs portaled to body to avoid parent transform stacking context ── */}

      {/* Duplicate confirmation dialog */}
      {createPortal(
        <ConfirmDialog
          open={duplicateTarget !== null}
          title="Duplicate Campus?"
          message={`A copy of "${campus.name}" will be created as a draft. All buildings, floors, and room data will be duplicated. The original campus will not be affected.`}
          confirmLabel="Duplicate"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={handleDuplicateConfirm}
          onCancel={() => setDuplicateTarget(null)}
        />,
        document.body
      )}

      {/* Publish/Unpublish confirmation dialog */}
      {createPortal(
        <ConfirmDialog
          open={publishConfirm !== null}
          title={isPublished ? "Unpublish Campus?" : "Publish Campus?"}
          message={
            isPublished
              ? `"${campus.name}" will be taken down from the student-facing map. Students will no longer be able to see it, but all campus data will be preserved for later re-publishing.`
              : `"${campus.name}" will be made visible to all students through the campus map.`
          }
          confirmLabel={isPublished ? "Unpublish" : "Publish"}
          cancelLabel="Cancel"
          variant={isPublished ? "warning" : "info"}
          onConfirm={handlePublishConfirm}
          onCancel={() => setPublishConfirm(null)}
        />,
        document.body
      )}

      {/* Archive confirmation dialog */}
      {createPortal(
        <ConfirmDialog
          open={archiveConfirm !== null}
          title={archiveConfirm?.wasPublished ? "Unpublish before archiving?" : "Archive this campus?"}
          message={
            archiveConfirm?.wasPublished
              ? `"${archiveConfirm.name}" is currently published. Unpublish it before archiving so it is no longer visible to students.`
              : `"${archiveConfirm?.name}" will be removed from the active campus list. Buildings, floors, navigation, and other data will be preserved and can be restored later.`
          }
          confirmLabel={archiveConfirm?.wasPublished ? "Unpublish Campus" : "Archive Campus"}
          cancelLabel="Cancel"
          variant="warning"
          onConfirm={handleArchiveConfirm}
          onCancel={() => setArchiveConfirm(null)}
        />,
        document.body
      )}

      {createPortal(
        <TypedConfirmationDialog
          open={permanentDeleteTarget !== null}
          title="Permanently delete this campus?"
          message="This permanently removes the campus and all of its map data. This cannot be undone."
          expected={permanentDeleteTarget?.name ?? ""}
          confirmLabel="Delete Permanently"
          onConfirm={() => void handlePermanentDeleteConfirm()}
          onCancel={() => setPermanentDeleteTarget(null)}
        />,
        document.body
      )}

      {/* Restore confirmation dialog */}
      {createPortal(
        <ConfirmDialog
          open={restoreTarget !== null}
          title="Restore this campus?"
          message={`"${campus.name}" will return to the active list as an unpublished draft. Its buildings, floors, and navigation data will be preserved.`}
          confirmLabel="Restore Campus"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreTarget(null)}
        />,
        document.body
      )}

      {/* Blocking guard: publishing a campus with no buildings yet */}
      {createPortal(
        <ConfirmDialog
          open={emptyPublishConfirm !== null}
          title="Publish Empty Campus?"
          message={
            emptyPublishConfirm
              ? `"${emptyPublishConfirm.name}" has no buildings yet, so students would see an empty map. You can publish it anyway and add buildings later, or cancel and add buildings first.`
              : ""
          }
          confirmLabel="Publish Anyway"
          cancelLabel="Cancel"
          variant="warning"
          onConfirm={() => {
            const c = emptyPublishConfirm;
            setEmptyPublishConfirm(null);
            if (c) startPublishProgress(c.id, "publish");
          }}
          onCancel={() => setEmptyPublishConfirm(null)}
        />,
        document.body
      )}

      {/* Animated action progress dialog (publish, unpublish, duplicate, archive) */}
      {createPortal(
        <ActionProgressDialog
          open={actionProgress?.open ?? false}
          state={actionProgress?.state ?? "loading"}
          action={progressActionType}
          entityName={campus.name}
          errorMessageOverride={actionProgress?.errorMessage}
          onClose={() => setActionProgress(null)}
          onRetry={handleProgressRetry}
          autoDismissMs={1500}
        />,
        document.body
      )}
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function CampusHome({
  campuses,
  onOpen,
  onCreate,
  onDuplicate,
  onTogglePublish,
  onUnpublish,
  onArchive,
  onRestore,
  onBulkRestore,
  onPermanentDelete,
  onBulkPermanentDelete,
  permanentDeleteUnavailableReason,
  onEditDetails,
}: CampusHomeProps) {
  const [showGuide, setShowGuide] = useState(false);
  // Filter out archived campuses unless we want to show them
  const activeCampuses = campuses.filter((c) => c.status !== "archived");
  const archivedCampuses = campuses.filter((c) => c.status === "archived");

  // ── Search & status filter ──
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampusStatusFilter>("all");
  const debouncedQuery = useDebounce(search, 150);
  const q = debouncedQuery.trim().toLowerCase();

  const matches = (c: Campus) => campusMatchesQuery(c, debouncedQuery, statusFilter);

  const activeVisible = activeCampuses.filter(matches);
  const archivedVisible = archivedCampuses.filter(matches);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<Set<string>>(new Set());
  const [bulkRestoreConfirm, setBulkRestoreConfirm] = useState<string[] | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<string[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{
    action: "restoring" | "deleting";
    state: ActionState;
    ids: string[];
    total: number;
    completed: number;
    currentName?: string;
    failedIds?: string[];
    failures?: BulkDeleteFailure[];
    errorMessage?: string;
  } | null>(null);

  useEffect(() => {
    const visibleIds = new Set(archivedVisible.map((campus) => campus.id));
    setSelectedArchivedIds((previous) => {
      const next = new Set([...previous].filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [archivedVisible.map((campus) => campus.id).join("|")]);

  const toggleArchivedSelection = useCallback((id: string) => {
    setSelectedArchivedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllArchived = useCallback(() => {
    setSelectedArchivedIds((previous) => {
      const allVisible = archivedVisible.every((campus) => previous.has(campus.id));
      return allVisible ? new Set() : new Set(archivedVisible.map((campus) => campus.id));
    });
  }, [archivedVisible]);

  const runBulkRestore = useCallback(async (ids: string[]) => {
    if (!onBulkRestore || ids.length === 0) return;
    setBulkProgress({ action: "restoring", state: "loading", ids, total: ids.length, completed: 0 });
    try {
      await onBulkRestore(ids);
      setBulkProgress((prev) => (prev ? { ...prev, state: "success", completed: ids.length } : prev));
      setSelectedArchivedIds(new Set());
      window.setTimeout(() => setBulkProgress(null), 1800);
    } catch {
      setBulkProgress((prev) => (prev ? { ...prev, state: "error", errorMessage: userFacingCampusMessage(new Error("Some campuses could not be restored.")) } : prev));
    }
  }, [onBulkRestore]);

  const runBulkDelete = useCallback(async (ids: string[]) => {
    if (!onBulkPermanentDelete || ids.length === 0 || bulkProgress?.state === "loading") return;
    setBulkProgress({ action: "deleting", state: "loading", ids, total: ids.length, completed: 0 });
    try {
      const reportProgress = (progress: BulkDeleteProgress) => {
        setBulkProgress((prev) => (prev ? {
          ...prev,
          completed: progress.completed,
          currentName: progress.currentName,
        } : prev));
      };
      // Keep compatibility with existing integrations that still accept the
      // original one-argument callback while the page uses the progress-aware
      // form. Real callbacks declare the second parameter; test/legacy mocks
      // therefore continue to receive exactly the original argument list.
      const result = onBulkPermanentDelete.length >= 2
        ? await onBulkPermanentDelete(ids, reportProgress)
        : await onBulkPermanentDelete(ids);
      const failedIds = result?.failedIds ?? [];
      if (failedIds.length > 0) {
        setSelectedArchivedIds(new Set(failedIds));
        setBulkProgress((prev) => (prev ? {
          ...prev,
          state: "error",
          completed: ids.length,
          failedIds,
          failures: result.failures,
          errorMessage: result.failureMessage ?? `${failedIds.length} campus${failedIds.length === 1 ? "" : "es"} could not be deleted.`,
        } : prev));
        return;
      }
      setSelectedArchivedIds(new Set());
      setBulkProgress((prev) => (prev ? { ...prev, state: "success", completed: ids.length } : prev));
    } catch (error) {
      setSelectedArchivedIds(new Set(ids));
      setBulkProgress((prev) => (prev ? {
        ...prev,
        state: "error",
        completed: ids.length,
        failedIds: ids,
        failures: ids.map((id) => {
          const campus = archivedCampuses.find((candidate) => candidate.id === id);
          return { id, name: campus?.name ?? id, message: error instanceof Error ? error.message : "Delete failed.", userMessage: userFacingCampusMessage(error) };
        }),
        errorMessage: userFacingCampusMessage(error),
      } : prev));
    }
  }, [onBulkPermanentDelete, bulkProgress?.state, archivedCampuses]);

  const selectedArchived = [...selectedArchivedIds];
  const allArchivedSelected = archivedVisible.length > 0 && archivedVisible.every((campus) => selectedArchivedIds.has(campus.id));
  const statusCounts: Record<CampusStatusFilter, number> = {
    all: campuses.length, published: 0, draft: 0, never: 0, archived: 0,
  };
  for (const c of campuses) statusCounts[campusStatusOf(c)]++;
  const isFiltering = q.length > 0 || statusFilter !== "all";

  const totalRooms = (campus: Campus) =>
    (campus.buildings ?? []).reduce((s, b) => s + (b.floors ?? []).reduce((sf, f) => sf + (f.rooms ?? []).length, 0), 0);

  const totalFloors = (campus: Campus) =>
    (campus.buildings ?? []).reduce((s, b) => s + (b.floors ?? []).length, 0);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-6 lg:p-8">
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
        className="flex items-start justify-between gap-4 mb-6"
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

      {/* True empty state — no campuses at all */}
      {campuses.length === 0 ? (
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
          {/* ── Toolbar: search + status filter ── */}
          <div className="mb-6 space-y-3">
            <SearchBar
              value={search}
              onSearch={setSearch}
              onClear={() => setSearch("")}
              label="Search campuses"
              placeholder="Search campuses by name, code, or location..."
              className="w-full sm:max-w-sm"
              size="md"
            />
            {/* Pills on their own row so the search bar never squeezes them */}
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Filter campuses by status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  aria-pressed={statusFilter === f.id}
                  className={cn(
                    "flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-lg border text-[11px] font-bold whitespace-nowrap transition-all",
                    statusFilter === f.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  {f.label}
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[9px] font-extrabold tabular-nums leading-none",
                    statusFilter === f.id ? "bg-white/15 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {statusCounts[f.id]}
                  </span>
                </button>
              ))}
              {isFiltering && (
                <p className="ml-auto text-xs text-muted-foreground tabular-nums whitespace-nowrap" role="status" aria-live="polite">
                  {activeVisible.length + archivedVisible.length} of {campuses.length} campuses
                </p>
              )}
            </div>
          </div>

          {/* No results for the current search/filter */}
          {activeVisible.length === 0 && archivedVisible.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <SearchX className="h-10 w-10 text-muted-foreground/40 mb-4" />
              <h3 className="text-base font-extrabold text-foreground mb-1">No campuses found</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm leading-relaxed">
                {debouncedQuery.trim()
                  ? `No campuses match "${debouncedQuery.trim()}". Try a different name, code, or location.`
                  : "No campuses match the current filter."}
              </p>
              <button
                onClick={() => { setSearch(""); setStatusFilter("all"); }}
                className="flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Clear search & filters
              </button>
            </motion.div>
          ) : (
            <>
              {/* Campus cards grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeVisible.map((campus, index) => {
              const hydratedBuildingCount = (campus.buildings ?? []).length;
              const hydratedFloors = totalFloors(campus);
              const hydratedRooms = totalRooms(campus);
              const previewBuildingCount = campus.previewBuildingCount ?? hydratedBuildingCount;
              // `preview_*_count` is the authoritative lightweight summary
              // returned by campusService.list(). Prefer it even when the
              // hydrated editor shape currently contains zero items; using a
              // stale non-zero hydrated/fallback value made Room counts lag
              // until the Map Builder was opened again.
              const floors = campus.previewFloorCount ?? hydratedFloors;
              const rooms = campus.previewRoomCount ?? hydratedRooms;
              const hasHydratedPreview = hydratedBuildingCount > 0;
              const markerCount = campus.markers.length;
              return (
                <motion.div
                  key={campus.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: index * 0.04 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open campus ${campus.name}`}
                  onClick={() => onOpen(campus.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(campus.id);
                    }
                  }}
                  className="group bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  style={campus.themeColor ? { borderTopColor: campus.themeColor, borderTopWidth: '3px', willChange: 'transform, opacity', transform: 'translateZ(0)' } as React.CSSProperties : { willChange: 'transform, opacity', transform: 'translateZ(0)' } as React.CSSProperties}
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
                        {hasHydratedPreview ? (
                          <CampusMiniMap campus={campus} className="max-h-full max-w-full" />
                        ) : previewBuildingCount > 0 ? (
                          <div className="flex flex-col items-center gap-1 text-muted-foreground/60">
                            <Map className="h-8 w-8" />
                            <span className="text-[9px] font-medium">
                              {previewBuildingCount} building{previewBuildingCount !== 1 ? "s" : ""} mapped
                            </span>
                          </div>
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
                            : campus.lifecycleStatus === "unpublished" || campus.publishedAt
                              ? "bg-amber-50/90 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/30 text-amber-700 dark:text-amber-400"
                              : "bg-slate-50/90 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/30 text-slate-500 dark:text-slate-400"
                        )}
                      >
                        {campus.publishStatus === "published" ? (
                          <><Globe className="h-2.5 w-2.5" /> Published</>
                        ) : campus.lifecycleStatus === "unpublished" || campus.publishedAt ? (
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

                    {/* Quick actions — lifecycle actions stay behind the overflow menu. */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                      <QuickActions
                        campus={campus}
                        onOpen={onOpen}
                        onDuplicate={onDuplicate}
                        onTogglePublish={onTogglePublish}
                        onUnpublish={onUnpublish}
                        onArchive={onArchive}
                        onEditDetails={onEditDetails}
                      />
                    </div>

                    {/* Campus code badge at bottom */}
                    <div className="absolute bottom-2 right-2">
                      <span className="text-[10px] font-mono font-bold text-white/80 bg-black/30 px-2 py-0.5 rounded-md backdrop-blur-sm">
                        {campus.code}
                      </span>
                    </div>
                  </div>

                  {/* Content — flex column layout keeps stats & button aligned at bottom */}
                  <div className="p-4 flex flex-col flex-1" style={campus.themeColor ? { backgroundColor: campus.themeColor + '08' } : undefined}>
                    {/* ── Top section: title + optional description ── */}
                    <div>
                      <div className="mb-1.5">
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-foreground text-sm truncate flex items-center gap-1.5" style={{ fontFamily: "var(--font-sans)" }}>
                            {campus.themeColor && (
                              <span className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[9px] font-extrabold text-white" style={{ backgroundColor: campus.themeColor }}>
                                {campus.code?.slice(0, 2) || 'PL'}
                              </span>
                            )}
                            <HighlightedName text={campus.name} query={q} />
                          </h3>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {campus.updatedAt}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Description — conditional; cards with and without it stay aligned */}
                      {campus.description && (
                        <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                          {campus.description}
                        </p>
                      )}
                    </div>

                    {/* ── Bottom section: stats + Open Editor — pushed down by mt-auto ── */}
                    <div className="mt-auto">
                      {/* Stats bar */}
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                        <Tooltip content={`Buildings: ${previewBuildingCount}`}>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help" title={`Buildings: ${previewBuildingCount}`}>
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="font-semibold tabular-nums">{previewBuildingCount}</span>
                          </span>
                        </Tooltip>
                        <Tooltip content={`Floors: ${floors}`}>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help" title={`Floors: ${floors}`}>
                            <Layers className="h-3 w-3 shrink-0" />
                            <span className="font-semibold tabular-nums">{floors}</span>
                          </span>
                        </Tooltip>
                        <Tooltip content={`Rooms: ${rooms}`}>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help" title={`Rooms: ${rooms}`}>
                            <DoorOpen className="h-3 w-3 shrink-0" />
                            <span className="font-semibold tabular-nums">{rooms}</span>
                          </span>
                        </Tooltip>
                        <Tooltip content={`Markers: ${markerCount}`}>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help" title={`Markers: ${markerCount}`}>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="font-semibold tabular-nums">{markerCount}</span>
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
                        onClick={(event) => { event.stopPropagation(); onOpen(campus.id); }}
                        className={cn(
                          "w-full mt-3 h-9 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5",
                          campus.themeColor
                            ? "text-[var(--btn-color)]"
                            : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                        )}
                        style={campus.themeColor ? {
                          '--btn-color': campus.themeColor,
                          backgroundColor: campus.themeColor + '15',
                        } as React.CSSProperties : undefined}
                        onMouseEnter={(e) => {
                          if (campus.themeColor) {
                            e.currentTarget.style.backgroundColor = campus.themeColor;
                            e.currentTarget.style.color = 'white';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (campus.themeColor) {
                            e.currentTarget.style.backgroundColor = campus.themeColor + '15';
                            e.currentTarget.style.color = campus.themeColor;
                          }
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Editor
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Archived campuses section */}
          {archivedVisible.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mt-8"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-muted-foreground flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Archived Campuses ({archivedVisible.length})
                </h3>
                <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Archived campus actions">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allArchivedSelected}
                      onChange={selectAllArchived}
                      aria-label="Select all visible archived campuses"
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Select All
                  </label>
                  {selectedArchived.length > 0 && (
                    <>
                      <span className="text-xs font-bold text-foreground tabular-nums" role="status" aria-live="polite">{selectedArchived.length} selected</span>
                      {onBulkRestore && (
                        <button
                          type="button"
                          disabled={bulkProgress?.state === "loading"}
                          onClick={() => setBulkRestoreConfirm(selectedArchived)}
                          className="h-8 rounded-lg bg-primary/10 px-3 text-[11px] font-extrabold text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                        >Restore</button>
                      )}
                      {onBulkPermanentDelete ? (
                        <button
                          type="button"
                          disabled={bulkProgress?.state === "loading"}
                          onClick={() => setBulkDeleteConfirm(selectedArchived)}
                          className="h-8 rounded-lg bg-destructive/10 px-3 text-[11px] font-extrabold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                        >Delete Permanently</button>
                      ) : permanentDeleteUnavailableReason ? (
                        <span className="max-w-xs text-[10px] leading-tight text-muted-foreground" title={permanentDeleteUnavailableReason}>Permanent deletion unavailable</span>
                      ) : null}
                      <button type="button" onClick={() => setSelectedArchivedIds(new Set())} className="h-8 rounded-lg border border-border px-3 text-[11px] font-bold text-muted-foreground hover:bg-muted">Clear</button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {archivedVisible.map((campus) => (
                  <div
                    key={campus.id}
                    className={cn("relative bg-muted/30 rounded-2xl border p-4 opacity-60 hover:opacity-90 transition-all", selectedArchivedIds.has(campus.id) ? "border-primary ring-2 ring-primary/20" : "border-border/50")}
                  >
                    <div className="flex items-center gap-3 pr-8">
                      <input
                        type="checkbox"
                        checked={selectedArchivedIds.has(campus.id)}
                        onChange={() => toggleArchivedSelection(campus.id)}
                        aria-label={`Select archived campus ${campus.name}`}
                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                      />
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <Archive className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">
                          <HighlightedName text={campus.name} query={q} />
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">{campus.code}</p>
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border border-border bg-muted text-muted-foreground">
                          <Archive className="h-2.5 w-2.5" /> Archived
                        </span>
                      </div>
                    </div>
                    <div className="absolute top-2.5 right-2.5">
                      <QuickActions campus={campus} archived onRestore={onRestore} onPermanentDelete={onPermanentDelete} />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            )}
            {bulkRestoreConfirm && createPortal(
              <ConfirmDialog
                open
                title={`Restore ${bulkRestoreConfirm.length} campus${bulkRestoreConfirm.length === 1 ? "" : "es"}?`}
                message="The selected campuses will return to the active list as private drafts. Their map data will be preserved."
                confirmLabel="Restore Campuses"
                cancelLabel="Cancel"
                variant="info"
                onConfirm={() => {
                  const ids = bulkRestoreConfirm;
                  setBulkRestoreConfirm(null);
                  void runBulkRestore(ids);
                }}
                onCancel={() => setBulkRestoreConfirm(null)}
              />, document.body
            )}
            {bulkDeleteConfirm && createPortal(
              <TypedConfirmationDialog
                open
                title={`Permanently delete ${bulkDeleteConfirm.length} campus${bulkDeleteConfirm.length === 1 ? "" : "es"}?`}
                message="This permanently removes the selected campuses and all associated map data. This cannot be undone."
                expected={`DELETE ${bulkDeleteConfirm.length} CAMPUSES`}
                confirmLabel="Delete Permanently"
                onConfirm={() => {
                  const ids = bulkDeleteConfirm;
                  setBulkDeleteConfirm(null);
                  void runBulkDelete(ids);
                }}
                onCancel={() => setBulkDeleteConfirm(null)}
              />, document.body
            )}
            {bulkProgress?.action === "deleting" && (
              <ActionProgressDialog
                open
                state={bulkProgress.state}
                action="deleting"
                titleOverride="Deleting Campuses"
                loadingMessageOverride="Permanently removing the selected archived campuses and their authored map data."
                progressMessage={bulkProgress.state === "loading"
                  ? `${bulkProgress.completed} of ${bulkProgress.total}${bulkProgress.currentName ? ` · ${bulkProgress.currentName}` : ""}`
                  : undefined}
                successTitleOverride="Campuses Permanently Deleted"
                successMessageOverride={`${bulkProgress.total} campus${bulkProgress.total === 1 ? "" : "es"} and their authored map data were removed.`}
                errorTitleOverride="Some Campuses Were Not Deleted"
                errorMessageOverride={bulkProgress.errorMessage}
                failureItems={bulkProgress.failures?.map((failure) => ({ id: failure.id, name: failure.name, reason: failure.userMessage }))}
                onClose={() => setBulkProgress(null)}
                onRetry={() => void runBulkDelete(bulkProgress.failedIds?.length ? bulkProgress.failedIds : bulkProgress.ids)}
                retryLabel="Retry Failed"
                autoDismissMs={bulkProgress.state === "success" ? 1500 : 0}
              />
            )}
            </>
          )}
        </>
      )}
    </div>
  );
}
