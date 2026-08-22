import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Keyboard, X, MousePointer2, Square, GitBranch,
  Layers, Grid3X3,
  ArrowUp, Pointer,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface ShortcutCheatSheetProps {
  open: boolean;
  onClose: () => void;
  variant?: "campus" | "floor";
}

interface ShortcutGroup {
  label: string;
  icon: React.ElementType;
  shortcuts: { keys: string; desc: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    label: "Tools",
    icon: MousePointer2,
    shortcuts: [
      { keys: "V", desc: "Select and edit items" },
      { keys: "Space", desc: "Hold to pan the canvas" },
      { keys: "B / A", desc: "Building in Campus; restriction area in Events" },
      { keys: "P", desc: "Pathway in Campus; Connect in Navigation" },
      { keys: "M", desc: "Walking Point in Navigation; event marker in Events" },
      { keys: "E / X", desc: "Remove tool" },
    ],
  },
  {
    label: "Workspace",
    icon: Layers,
    shortcuts: [
      { keys: "1", desc: "Campus workspace" },
      { keys: "2", desc: "Show Navigation focus and the walking network" },
      { keys: "3", desc: "Events workspace" },
    ],
  },
  {
    label: "View",
    icon: Grid3X3,
    shortcuts: [
      { keys: "Ctrl + Scroll", desc: "Zoom in / out (toward cursor)" },
      { keys: "0", desc: "Reset view" },
      { keys: "Ctrl + G", desc: "Toggle Grid Snap" },
    ],
  },
  {
    label: "Selection",
    icon: Pointer,
    shortcuts: [
      { keys: "Click", desc: "Select single item" },
      { keys: "Shift + Click", desc: "Add / remove from selection" },
      { keys: "Drag", desc: "Rubber-band select (on empty space)" },
      { keys: "Ctrl + A", desc: "Select all buildings" },
      { keys: "Escape", desc: "Cancel the active tool or Connect action" },
    ],
  },
  {
    label: "Editing",
    icon: Square,
    shortcuts: [
      { keys: "Delete / Bksp", desc: "Delete selected" },
      { keys: "Ctrl + C", desc: "Copy selected" },
      { keys: "Ctrl + V", desc: "Paste copied with new IDs" },
      { keys: "Ctrl + D", desc: "Duplicate selected" },
      { keys: "Ctrl + Z", desc: "Undo" },
      { keys: "Ctrl + Y / Ctrl + Shift + Z", desc: "Redo" },
      { keys: "Ctrl + S", desc: "Save draft" },
      { keys: "Arrows", desc: "Nudge selected item 1px" },
      { keys: "Shift + Arrows", desc: "Nudge selected item 10px" },
    ],
  },
  {
    label: "Path / Navigation Authoring",
    icon: GitBranch,
    shortcuts: [
      { keys: "Escape", desc: "Cancel Pathway or Connect authoring" },
      { keys: "Delete", desc: "Remove the last Connect bend while authoring" },
    ],
  },
];

const FLOOR_GROUPS: ShortcutGroup[] = [
  {
    label: "Tools",
    icon: MousePointer2,
    shortcuts: [
      { keys: "V", desc: "Select and edit floor items" },
      { keys: "Space", desc: "Hold to pan the floor canvas" },
      { keys: "W", desc: "Wall tool" },
      { keys: "R", desc: "Room tool" },
      { keys: "D", desc: "Door tool" },
      { keys: "I", desc: "Window tool" },
      { keys: "S", desc: "Stairs tool" },
      { keys: "L", desc: "Elevator tool" },
      { keys: "A", desc: "Ramp tool" },
      { keys: "F", desc: "Furniture tool" },
      { keys: "T", desc: "Label tool" },
      { keys: "P", desc: "Floor path tool" },
      { keys: "E", desc: "Remove tool (or navigation Remove when the overlay is on)" },
      { keys: "N", desc: "Walking Point when Navigation is on" },
      { keys: "C", desc: "Connect when Navigation is on" },
    ],
  },
  {
    label: "View & Navigation",
    icon: ArrowUp,
    shortcuts: [
      { keys: "Ctrl + Scroll", desc: "Zoom in / out toward cursor" },
      { keys: "0", desc: "Fit floor / reset view" },
      { keys: "Middle Drag", desc: "Pan canvas" },
      { keys: "H", desc: "Pan tool when Navigation is on" },
    ],
  },
  {
    label: "Selection",
    icon: Pointer,
    shortcuts: [
      { keys: "Click", desc: "Select single item" },
      { keys: "Shift + Click", desc: "Add / remove from selection" },
      { keys: "Ctrl + A", desc: "Select all floor objects" },
      { keys: "Drag", desc: "Marquee select on empty floor" },
      { keys: "Escape", desc: "Cancel drawing or unfinished navigation authoring" },
    ],
  },
  {
    label: "Editing",
    icon: Square,
    shortcuts: [
      { keys: "Delete / Bksp", desc: "Delete selected" },
      { keys: "Ctrl + C", desc: "Copy selected floor object(s)" },
      { keys: "Ctrl + V", desc: "Paste copied with new IDs" },
      { keys: "Ctrl + Z", desc: "Undo" },
      { keys: "Ctrl + Y", desc: "Redo" },
      { keys: "Ctrl + D", desc: "Duplicate selected floor object(s)" },
      { keys: "Ctrl + S", desc: "Save floor" },
      { keys: "Arrows", desc: "Nudge selected item 1px" },
      { keys: "Shift + Arrows", desc: "Nudge selected item 10px" },
    ],
  },
];

export function ShortcutCheatSheet({ open, onClose, variant = "campus" }: ShortcutCheatSheetProps) {
  const groups = variant === "floor" ? FLOOR_GROUPS : GROUPS;
  const title = variant === "floor" ? "Floor Editor Shortcuts" : "Keyboard Shortcuts";
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: -8 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-cheat-sheet-title"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Keyboard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 id="shortcut-cheat-sheet-title" className="font-extrabold text-foreground text-base" style={{ fontFamily: "var(--font-sans)" }}>
                    {title}
                  </h2>
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Press the key or combination shown
                  </p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close Keyboard Shortcuts" className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-show-on-hover p-6 space-y-5">
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 mb-2">
                    <group.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.shortcuts.map((s) => (
                      <div key={s.keys} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <span className="min-w-0 pr-2 text-xs text-foreground">{s.desc}</span>
                        <kbd className={cn(
                          "inline-flex shrink-0 items-center justify-center h-6 px-2 rounded-md border text-[10px] font-bold font-mono",
                          "bg-muted/50 border-border text-muted-foreground",
                          s.keys.includes("+") || s.keys.length > 3 ? "min-w-[60px]" : "min-w-[28px]"
                        )}>
                          {s.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 pt-3 border-t border-border shrink-0">
              <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
                Press <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded border border-border text-[9px] font-bold font-mono bg-muted/50">?</kbd> anytime to open this panel
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
