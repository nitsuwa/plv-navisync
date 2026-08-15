import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { SimpleTool } from "./types";

// ── Tool descriptor for the tooltip content ──
export interface ToolDescriptor {
  id: SimpleTool;
  label: string;
  shortcut: string;
  description: string;
}

// ── Detailed tool definitions ──
export const TOOL_DEFINITIONS: Record<string, ToolDescriptor> = {
  select:   { id: "select",   label: "Select",   shortcut: "V",     description: "Click to select, drag empty space to pan, Shift+click to multi-select." },
  pan:      { id: "pan",      label: "Pan",      shortcut: "Space", description: "Hold and drag to move around the canvas freely." },
  marker:   { id: "marker",   label: "Marker",   shortcut: "M",     description: "Click to drop a point-of-interest marker on the map." },
  building: { id: "building", label: "Building", shortcut: "B",     description: "Click to place a pre-set building, or drag to draw a custom footprint." },
  path:     { id: "path",     label: "Path",     shortcut: "P",     description: "Click waypoints, double-click to finish. Connects buildings." },
  erase:    { id: "erase",    label: "Erase",    shortcut: "E",     description: "Click any building, marker, or path to remove it." },
};

// ── Custom designed tooltip wrapper ──
// The same tool id can mean different things per layer (e.g. "marker" is
// "Add Waypoint" in the Navigation layer and "Marker" in the Campus layer),
// so callers may override the label/shortcut/hint text shown in the tooltip.
export function ToolbarTooltip({
  children,
  tool,
  isActive,
  label,
  shortcut,
  hint,
}: {
  children: React.ReactNode;
  tool: string;
  isActive?: boolean;
  label?: string;
  shortcut?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, above: true });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const def = TOOL_DEFINITIONS[tool];
  const title = label ?? def?.label ?? tool;
  const shortcutText = shortcut ?? def?.shortcut ?? "";
  const description = hint ?? def?.description ?? "";

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const TOOLTIP_WIDTH = 200;
    const padding = 12;

    // Clamp X to viewport bounds
    const clampedX = Math.max(TOOLTIP_WIDTH / 2 + padding, Math.min(centerX, window.innerWidth - TOOLTIP_WIDTH / 2 - padding));

    // Check if there's enough space above, otherwise show below
    const spaceAbove = rect.top;
    const tooltipHeight = 80; // approximate
    const showAbove = spaceAbove >= tooltipHeight + 12;

    setPos({
      x: clampedX,
      y: showAbove ? rect.top - 8 : rect.bottom + 8,
      above: showAbove,
    });

    timerRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  if (!def) return <>{children}</>;

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative inline-flex"
    >
      {children}
      {show && createPortal(
        <div
          style={{
            position: "fixed",
            left: pos.x,
            ...(pos.above ? { top: pos.y, transform: "translate(-50%, -100%)" } : { top: pos.y, transform: "translate(-50%, 0)" }),
            zIndex: 99999,
            pointerEvents: "none",
          }}
        >
          <div
            className="rounded-lg border border-border/60 shadow-xl overflow-hidden"
            style={{
              background: "var(--popover, var(--card))",
              backdropFilter: "blur(12px)",
              minWidth: 160,
              maxWidth: 220,
            }}
          >
            <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between gap-3">
              <span className="text-[11px] font-extrabold text-foreground">{title}</span>
              <span
                className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                style={{
                  background: "color-mix(in srgb, var(--muted) 80%, transparent)",
                  color: "var(--muted-foreground)",
                }}
              >
                {shortcutText}
              </span>
            </div>
            <div className="px-3 py-1.5">
              <p className="text-[10px] text-muted-foreground leading-relaxed">{description}</p>
            </div>
            {/* Arrow: points down when above, up when below */}
            <div
              className="w-2 h-2 rotate-45 absolute border-r border-b border-border/60"
              style={{
                background: "var(--popover, var(--card))",
                ...(pos.above
                  ? { bottom: -4, left: "50%", marginLeft: -4, transform: "rotate(45deg)" }
                  : { top: -4, left: "50%", marginLeft: -4, transform: "rotate(225deg)" }
                ),
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
