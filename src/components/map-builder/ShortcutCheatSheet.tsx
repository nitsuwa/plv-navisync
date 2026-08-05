import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Keyboard, X, MousePointer2, Square, MapPin, GitBranch, Trash2,
  Layers, RotateCcw, Grid3X3, Undo2, Redo2, Save,
  ArrowUp, Pointer,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface ShortcutCheatSheetProps {
  open: boolean;
  onClose: () => void;
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
      { keys: "V", desc: "Select tool" },
      { keys: "B", desc: "Building tool (Campus layer)" },
      { keys: "M", desc: "Marker tool (Campus layer)" },
      { keys: "P", desc: "Path / Route tool" },
      { keys: "E", desc: "Erase tool" },
      { keys: "R", desc: "Room tool (Floor Editor)" },
      { keys: "W", desc: "Waypoint tool (Navigation layer)" },
    ],
  },
  {
    label: "Layers",
    icon: Layers,
    shortcuts: [
      { keys: "1", desc: "Campus layer" },
      { keys: "2", desc: "Navigation layer" },
      { keys: "3", desc: "Accessibility layer" },
      { keys: "4", desc: "Emergency layer" },
      { keys: "5", desc: "Events layer" },
    ],
  },
  {
    label: "Navigation",
    icon: ArrowUp,
    shortcuts: [
      { keys: "Ctrl + Scroll", desc: "Zoom in / out" },
      { keys: "0", desc: "Reset view" },
      { keys: "Arrows", desc: "Nudge selected item 1px" },
      { keys: "Shift + Arrows", desc: "Nudge selected item 10px" },
    ],
  },
  {
    label: "Selection",
    icon: Pointer,
    shortcuts: [
      { keys: "Click", desc: "Select single item" },
      { keys: "Shift + Click", desc: "Add / remove from selection" },
      { keys: "Ctrl + A", desc: "Select all buildings" },
      { keys: "Drag", desc: "Rubber-band select (on empty space)" },
      { keys: "Escape", desc: "Deselect / cancel path" },
    ],
  },
  {
    label: "Editing",
    icon: Square,
    shortcuts: [
      { keys: "Delete / Bksp", desc: "Delete selected" },
      { keys: "Ctrl + Z", desc: "Undo" },
      { keys: "Ctrl + Y", desc: "Redo" },
      { keys: "Ctrl + S", desc: "Save draft" },
      { keys: "Ctrl + G", desc: "Toggle snap to grid" },
      { keys: "Ctrl + D", desc: "Duplicate selected (future)" },
    ],
  },
];

export function ShortcutCheatSheet({ open, onClose }: ShortcutCheatSheetProps) {
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
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "85vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Keyboard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-extrabold text-foreground text-base" style={{ fontFamily: "var(--font-sans)" }}>
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Press the key or combination shown
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-show-on-hover p-6 space-y-5">
              {GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 mb-2">
                    <group.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.shortcuts.map((s) => (
                      <div key={s.keys} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <span className="text-xs text-foreground">{s.desc}</span>
                        <kbd className={cn(
                          "inline-flex items-center justify-center h-6 px-2 rounded-md border text-[10px] font-bold font-mono",
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
