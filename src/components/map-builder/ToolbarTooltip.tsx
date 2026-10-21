import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
// ── Tool descriptor for the tooltip content ──
export interface ToolDescriptor {
  id: string;
  label: string;
  shortcut: string;
  description: string;
}

// ── Detailed tool definitions ──
export const TOOL_DEFINITIONS: Record<string, ToolDescriptor> = {
  back:     { id: "back",     label: "Back",     shortcut: "",        description: "Return to the campus list." },
  campusStatus: { id: "campusStatus", label: "Campus status", shortcut: "", description: "View the campus publishing status." },
  events:   { id: "events",   label: "Events",   shortcut: "",        description: "Manage campus events and temporary restrictions." },
  select:   { id: "select",   label: "Select",   shortcut: "V",     description: "Select, move, resize, and edit items on the canvas." },
  pan:      { id: "pan",      label: "Pan",      shortcut: "Space", description: "Move around the campus canvas without changing any objects." },
  marker:   { id: "marker",   label: "Marker",   shortcut: "M",     description: "Click to drop a point-of-interest marker on the map." },
  building: { id: "building", label: "Building", shortcut: "B",     description: "Add a building footprint, then configure its name, floors, entrances, and other details." },
  path:     { id: "path",     label: "Path",     shortcut: "P",     description: "Draw or connect paths on the campus, depending on the selected tool." },
  erase:    { id: "erase",    label: "Erase",    shortcut: "E",     description: "Remove items from the active campus or navigation workspace." },
  undo:     { id: "undo",     label: "Undo",     shortcut: "Ctrl + Z",             description: "Reverse your most recent editor change." },
  redo:     { id: "redo",     label: "Redo",     shortcut: "Ctrl + Shift + Z",     description: "Restore the most recently undone change." },
  gridSnap: { id: "gridSnap", label: "Grid Snap", shortcut: "Ctrl + G",             description: "Grid snapping is off. Objects can move freely." },
  edgeSnap: { id: "edgeSnap", label: "Edge Snap", shortcut: "",                    description: "Edge snapping is off." },
  zoomIn:   { id: "zoomIn",   label: "Zoom In",   shortcut: "",                    description: "Zoom closer into the canvas." },
  zoomOut:  { id: "zoomOut",  label: "Zoom Out",  shortcut: "",                    description: "Zoom farther out from the canvas." },
  resetView:{ id: "resetView",label: "Reset View",shortcut: "0",                   description: "Return the canvas to its default zoom and position." },
  canvasSettings: { id: "canvasSettings", label: "Canvas Settings", shortcut: "", description: "Adjust canvas display and editing preferences." },
  keyboardShortcuts: { id: "keyboardShortcuts", label: "Keyboard Shortcuts", shortcut: "?", description: "View the available keyboard controls for the Map Builder." },
  tutorial: { id: "tutorial", label: "Tutorial", shortcut: "", description: "Take a guided tour of the editor." },
  navigationVisibility: { id: "navigationVisibility", label: "Navigation", shortcut: "", description: "Show and edit Walking Points and Walking Paths." },
  save:     { id: "save",     label: "Save",     shortcut: "Ctrl + S",             description: "Your current draft is saved." },
  publish:  { id: "publish",  label: "Publish",  shortcut: "",                    description: "Publish the saved campus so it becomes available to users." },
  reviewPublish: { id: "reviewPublish", label: "Review & Publish", shortcut: "", description: "Review validation and publish the latest campus changes." },
  wall:     { id: "wall",     label: "Wall",     shortcut: "W",     description: "Draw walls to define rooms and hallways." },
  room:     { id: "room",     label: "Room",     shortcut: "R",     description: "Add a room area to the floor plan." },
  door:     { id: "door",     label: "Door",     shortcut: "D",     description: "Place a door in a wall or room boundary." },
  window:   { id: "window",   label: "Window",   shortcut: "I",     description: "Place a window along a wall." },
  stairs:   { id: "stairs",   label: "Stairs",   shortcut: "S",     description: "Place stairs that connect this floor to another floor." },
  elevator: { id: "elevator", label: "Elevator", shortcut: "L",     description: "Place an elevator that connects supported floors." },
  ramp:     { id: "ramp",     label: "Ramp",     shortcut: "A",     description: "Place an accessible ramp connection." },
  furniture:{ id: "furniture",label: "Furniture",shortcut: "F",     description: "Place visual furniture and interior objects." },
  text:     { id: "text",     label: "Label",    shortcut: "T",     description: "Add a text label to the floor plan." },
  waypoint: { id: "waypoint", label: "Walking Point", shortcut: "N", description: "Place a routing point where people can walk." },
  connect:  { id: "connect",  label: "Connect",  shortcut: "C",     description: "Connect Walking Points and linked locations to build the walking network." },
  linkLocation: { id: "linkLocation", label: "Link Location", shortcut: "", description: "Link a Room, Door, Stair, Elevator, or Ramp to navigation." },
  testRoute:{ id: "testRoute", label: "Test Route", shortcut: "", description: "Choose a start and destination to test the walking network." },
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
  tooltipClassName,
  titleClassName,
}: {
  children: React.ReactNode;
  tool: string;
  isActive?: boolean;
  label?: string;
  shortcut?: string;
  hint?: string;
  /** Optional compact semantic treatment for status-like tooltips. */
  tooltipClassName?: string;
  titleClassName?: string;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, above: true });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);
  // A pointer activation should dismiss the hint immediately.  The short
  // focus guard prevents the browser's follow-up focus event from reopening
  // it while the activated control opens a dialog/modal.
  const suppressFocusRef = useRef(false);

  const def = TOOL_DEFINITIONS[tool];
  const title = label ?? def?.label ?? tool;
  const shortcutText = shortcut ?? def?.shortcut ?? "";
  const description = hint ?? def?.description ?? "";

  const hasOpenModal = () => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = 104;
    const padding = 12;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const centerX = rect.left + rect.width / 2;
    const clampedX = Math.max(tooltipWidth / 2 + padding, Math.min(centerX, window.innerWidth - tooltipWidth / 2 - padding));
    const spaceAbove = rect.top - padding;
    const spaceBelow = viewportHeight - rect.bottom - padding;
    const showAbove = spaceAbove >= tooltipHeight || spaceAbove >= spaceBelow;
    const y = showAbove
      ? Math.max(padding + tooltipHeight, rect.top - 8)
      : Math.min(rect.bottom + 8, viewportHeight - padding - tooltipHeight);
    setPos({ x: clampedX, y, above: showAbove });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!show || typeof document === "undefined") return;
    const hideForModal = () => {
      if (!hasOpenModal()) return;
      focusedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setShow(false);
    };
    const observer = new MutationObserver(hideForModal);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal"] });
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    hideForModal();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [show]);

  const dismissTooltip = () => {
    focusedRef.current = false;
    suppressFocusRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setShow(false);
    window.setTimeout(() => { suppressFocusRef.current = false; }, 0);
  };

  const handleMouseEnter = () => {
    if (!triggerRef.current || hasOpenModal()) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    updatePosition();

    timerRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleMouseLeave = () => {
    if (focusedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  const handleFocus = () => {
    if (suppressFocusRef.current || hasOpenModal()) return;
    focusedRef.current = true;
    handleMouseEnter();
  };
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    // Focus bubbles from the wrapped button. Keep the hint open while focus
    // moves within the trigger, and dismiss it when keyboard focus leaves.
    if (!triggerRef.current?.contains(event.relatedTarget as Node | null)) {
      focusedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      setShow(false);
    }
  };

  if (!def) return <>{children}</>;

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={dismissTooltip}
      onClick={dismissTooltip}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="relative inline-flex"
    >
      {children}
      {show && createPortal(
        <div
          style={{
            position: "fixed",
            left: pos.x,
            ...(pos.above ? { top: pos.y, transform: "translate(-50%, -100%)" } : { top: pos.y, transform: "translate(-50%, 0)" }),
            // Sit above ordinary properties panels (z-index 50), but below
            // editor modal layers. The open-modal observer hides stale hints.
            zIndex: 55,
            pointerEvents: "none",
          }}
        >
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: pos.above ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={`relative w-[280px] max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 shadow-xl ${tooltipClassName ?? ""}`}
            style={{
              background: "var(--popover, var(--card))",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between gap-3">
              <span className={`text-[11px] font-extrabold text-foreground ${titleClassName ?? ""}`}>{title}</span>
              {shortcutText && (
                <span
                  className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                  style={{
                    background: "color-mix(in srgb, var(--muted) 80%, transparent)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  {shortcutText}
                </span>
              )}
            </div>
            <div className="px-3 py-1.5">
              <p className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-line">{description}</p>
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
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
