import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  Pencil, Copy, Lock, EyeOff, Trash2, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface ContextMenuProps {
  x: number;
  y: number;
  type: "building" | "marker" | "path" | "floor" | "wall" | "decorAsset";
  onClose: () => void;
  onAction: (action: string) => void;
}

export function ContextMenu({ x, y, type, onClose, onAction }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  // Also close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const items = type === "building"
    ? [
        { action: "rename", label: "Rename", icon: Pencil },
        { action: "duplicate", label: "Duplicate", icon: Copy },
        { action: "lock", label: "Lock", icon: Lock },
        { action: "hide", label: "Hide", icon: EyeOff },
        { action: "divider" },
        { action: "bring-to-front", label: "Bring to Front", icon: ChevronsUp },
        { action: "bring-forward", label: "Bring Forward", icon: ChevronUp },
        { action: "send-backward", label: "Send Backward", icon: ChevronDown },
        { action: "send-to-back", label: "Send to Back", icon: ChevronsDown },
        { action: "divider" },
        { action: "delete", label: "Delete", icon: Trash2, danger: true },
      ]
    : type === "decorAsset"
    ? [
        { action: "duplicate", label: "Duplicate", icon: Copy },
        { action: "divider" },
        { action: "bring-to-front", label: "Bring to Front", icon: ChevronsUp },
        { action: "bring-forward", label: "Bring Forward", icon: ChevronUp },
        { action: "send-backward", label: "Send Backward", icon: ChevronDown },
        { action: "send-to-back", label: "Send to Back", icon: ChevronsDown },
        { action: "divider" },
        { action: "delete", label: "Delete", icon: Trash2, danger: true },
      ]
    : type === "floor"
    ? [
        { action: "rename", label: "Rename", icon: Pencil },
        { action: "duplicate", label: "Duplicate", icon: Copy },
        { action: "divider" },
        { action: "delete", label: "Delete", icon: Trash2, danger: true },
      ]
    : type === "wall"
    ? [
        { action: "delete", label: "Delete", icon: Trash2, danger: true },
      ]
    : [
        { action: "rename", label: "Rename", icon: Pencil },
        { action: "delete", label: "Delete", icon: Trash2, danger: true },
      ];

  // Adjust position to stay within viewport
  const mx = Math.min(x, window.innerWidth - 180);
  const my = Math.min(y, window.innerHeight - items.filter((i) => i.action !== "divider").length * 36 - 16);

  return (
    <motion.div
      ref={ref}
      className="fixed z-[100]"
      style={{ left: mx, top: my }}
      onContextMenu={(e) => e.preventDefault()}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden py-1 min-w-[160px]">
        {items.map((item, i) =>
          item.action === "divider" ? (
            <div key={i} className="h-px bg-border my-1" />
          ) : (
            <motion.button
              key={item.action}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { onAction(item.action); onClose(); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold transition-colors text-left",
                (item as any).danger
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </motion.button>
          )
        )}
      </div>
    </motion.div>
  );
}
