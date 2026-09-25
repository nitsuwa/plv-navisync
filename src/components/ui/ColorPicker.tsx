import { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

// ── Color utility functions ─────────────────────────────────────────────────

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let r = 0, g = 0, b = 0;
  const h = hex.replace("#", "");
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hVal = 0, s = max === 0 ? 0 : (max - min) / max;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r: hVal = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hVal = ((b - r) / d + 2) / 6; break;
      case b: hVal = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(hVal * 360), s: Math.round(s * 100), v: Math.round(max * 100) };
}

function hsvToHex(h: number, s: number, v: number): string {
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const value = Math.max(0, Math.min(100, v)) / 100;
  const chroma = value * saturation;
  const hueSector = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hueSector % 2) - 1));
  const match = value - chroma;

  let red = 0, green = 0, blue = 0;
  if (hueSector < 1) [red, green, blue] = [chroma, x, 0];
  else if (hueSector < 2) [red, green, blue] = [x, chroma, 0];
  else if (hueSector < 3) [red, green, blue] = [0, chroma, x];
  else if (hueSector < 4) [red, green, blue] = [0, x, chroma];
  else if (hueSector < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  const toHex = (channel: number) => Math.round((channel + match) * 255).toString(16).padStart(2, "0");
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function hexIsValid(hex: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

// ── Quick palette — curated campus-friendly colors ─────────────────────────

const QUICK_COLORS = [
  "#1e3a5f", "#1e40af", "#2563eb", "#0284c7", "#0d9488",
  "#059669", "#16a34a", "#ca8a04", "#ea580c", "#dc2626",
  "#e11d48", "#9333ea", "#7c3aed", "#6366f1", "#64748b",
  "#334155", "#0f172a", "#ffffff",
];

// ── Hue bar gradient stops (rainbow) ────────────────────────────────────────

const HUE_STOPS = [
  "hsl(0,100%,50%)", "hsl(30,100%,50%)", "hsl(60,100%,50%)",
  "hsl(120,100%,50%)", "hsl(180,100%,50%)", "hsl(240,100%,50%)",
  "hsl(300,100%,50%)", "hsl(360,100%,50%)",
];

// ── Props ───────────────────────────────────────────────────────────────────

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

interface PopoverPosition {
  top: number;
  left?: number;
  right?: number;
  above: boolean;
}

// ── Saturation-Lightness square ─────────────────────────────────────────────

function SatValueSquare({
  hue,
  sat,
  brightness,
  onChange,
}: {
  hue: number;
  sat: number;
  brightness: number;
  onChange: (s: number, v: number) => void;
}) {
  const squareRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  const updateFromPointer = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = squareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange(Math.round(x * 100), Math.round((1 - y) * 100));
  }, [onChange]);

  const stopDragging = useCallback((pointerId?: number) => {
    const activePointerId = dragging.current;
    if (activePointerId === null || (pointerId !== undefined && pointerId !== activePointerId)) return;

    dragging.current = null;
    const el = squareRef.current;
    if (el && typeof el.hasPointerCapture === "function" && el.hasPointerCapture(activePointerId)) {
      el.releasePointerCapture(activePointerId);
    }
  }, []);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (dragging.current !== e.pointerId) return;
      updateFromPointer(e);
    };

    const handleUp = (e: PointerEvent) => stopDragging(e.pointerId);
    const handleBlur = () => stopDragging();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") stopDragging();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stopDragging, updateFromPointer]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    dragging.current = e.pointerId;
    if (typeof e.currentTarget.setPointerCapture === "function") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    updateFromPointer(e);
  };

  // Marker position
  const mx = `${sat}%`;
  const my = `${100 - brightness}%`;

  return (
    <div data-testid="color-picker-sat-light-square" className="relative w-full h-40 rounded-lg overflow-hidden cursor-crosshair select-none touch-none" ref={squareRef} onPointerDown={handlePointerDown}>
      {/* Base hue color */}
      <div className="absolute inset-0" style={{ backgroundColor: `hsl(${hue},100%,50%)` }} />
      {/* White gradient (left to right — desaturation) */}
      <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
      {/* Black gradient (bottom to top — lightness) */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
      {/* Crosshair marker */}
      <div
        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg pointer-events-none"
        style={{ left: mx, top: my, boxShadow: "0 0 0 1px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.3)" }}
      />
    </div>
  );
}

// ── Hue bar ─────────────────────────────────────────────────────────────────

function HueBar({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (h: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  const updateFromPointer = useCallback((e: PointerEvent | React.PointerEvent) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(Math.round(x * 360));
  }, [onChange]);

  const stopDragging = useCallback((pointerId?: number) => {
    const activePointerId = dragging.current;
    if (activePointerId === null || (pointerId !== undefined && pointerId !== activePointerId)) return;

    dragging.current = null;
    const el = barRef.current;
    if (el && typeof el.hasPointerCapture === "function" && el.hasPointerCapture(activePointerId)) {
      el.releasePointerCapture(activePointerId);
    }
  }, []);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (dragging.current !== e.pointerId) return;
      updateFromPointer(e);
    };

    const handleUp = (e: PointerEvent) => stopDragging(e.pointerId);
    const handleBlur = () => stopDragging();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") stopDragging();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stopDragging, updateFromPointer]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    dragging.current = e.pointerId;
    if (typeof e.currentTarget.setPointerCapture === "function") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    updateFromPointer(e);
  };

  const thumbLeft = `${(hue / 360) * 100}%`;

  return (
    <div data-testid="color-picker-hue-bar" className="relative w-full h-6 rounded-lg overflow-hidden cursor-ew-resize select-none touch-none" ref={barRef} onPointerDown={handlePointerDown}>
      <div className="absolute inset-0 rounded-lg" style={{ background: `linear-gradient(to right, ${HUE_STOPS.join(", ")})` }} />
      {/* Stripe overlay for depth */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-white/15 to-black/10" />
      {/* Thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 rounded-md border-2 border-white shadow-lg pointer-events-none"
        style={{ left: thumbLeft, backgroundColor: `hsl(${hue},100%,50%)`, boxShadow: "0 0 0 1px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.2)" }}
      />
    </div>
  );
}

// ── Extracted panel component for stable rendering ─────────────────────────

interface ColorPickerPanelProps {
  panelRef: React.RefObject<HTMLDivElement | null>;
  hue: number;
  sat: number;
  brightness: number;
  hexInput: string;
  value: string;
  onSatValueChange: (s: number, v: number) => void;
  onHueChange: (h: number) => void;
  onHexInputChange: (v: string) => void;
  onHexSubmit: () => void;
  onHexKeyDown: (e: React.KeyboardEvent) => void;
  onQuickColor: (color: string) => void;
  style?: React.CSSProperties;
}

const ColorPickerPanel = memo(function ColorPickerPanel({
  panelRef,
  hue, sat, brightness,
  hexInput, value,
  onSatValueChange, onHueChange,
  onHexInputChange, onHexSubmit, onHexKeyDown,
  onQuickColor,
  style,
}: ColorPickerPanelProps) {
  return (
    <div
      ref={panelRef}
      data-testid="color-picker-panel"
      className={cn(
        "w-[420px] p-4 rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/30 animate-scale-in"
      )}
      style={{
        ...style,
        zIndex: 9999,
      }}
    >
      {/* ── Top row: square (left) + sliders (right) side by side ── */}
      <div className="flex gap-4">
        {/* Saturation-Lightness square — narrower square on the left */}
        <div className="w-[185px] shrink-0 h-full">
          <SatValueSquare hue={hue} sat={sat} brightness={brightness} onChange={onSatValueChange} />
        </div>

        {/* Controls on the right */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Hue bar */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Hue</p>
            <HueBar hue={hue} onChange={onHueChange} />
          </div>

          {/* Hex input + Preview row */}
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">Hex</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground/50">#</span>
                <input
                  type="text"
                  value={hexInput.replace("#", "")}
                  onChange={(e) => onHexInputChange("#" + e.target.value)}
                  onBlur={onHexSubmit}
                  onKeyDown={onHexKeyDown}
                  maxLength={7}
                  placeholder="1e3a5f"
                  className="w-full h-9 pl-6 pr-2 rounded-lg border border-border bg-muted/50 text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                />
              </div>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">Preview</p>
              <div
                className="w-10 h-9 rounded-lg ring-1 ring-black/10"
                style={{ backgroundColor: hsvToHex(hue, sat, brightness) }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick colors — full width at the bottom ── */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Quick colors</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onQuickColor(c)}
              aria-label={`Color ${c}`}
              className={cn(
                "w-6 h-6 rounded-lg border transition-all hover:scale-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                value.toLowerCase() === c.toLowerCase()
                  ? "border-foreground scale-110 ring-2 ring-foreground/20 shadow-md"
                  : c === "#ffffff"
                    ? "border-border"
                    : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ── Main ColorPicker component ──────────────────────────────────────────────

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hexInput, setHexInput] = useState(value);
  // Popover position state
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);

  // Derive HSL from current value
  const { h: initH, s: initS, v: initV } = hexToHsv(value);
  const [hue, setHue] = useState(initH);
  const [sat, setSat] = useState(initS);
  const [brightness, setBrightness] = useState(initV);
  const hsvRef = useRef({ h: initH, s: initS, v: initV });
  const lastCommittedColorRef = useRef<{ raw: string; canonical: string } | null>(null);

  // Sync external value changes to internal state
  useEffect(() => {
    // Parent state usually echoes the exact color emitted by this picker. Do
    // not re-derive HSL from that echo: grayscale colors have no meaningful
    // hue, so doing so would reset the active hue to red while the user is
    // still dragging the saturation/lightness square.
    const committedColor = lastCommittedColorRef.current;
    const normalizedValue = value.trim().toLowerCase();
    if (committedColor && (
      normalizedValue === committedColor.raw ||
      normalizedValue === committedColor.canonical
    )) {
      lastCommittedColorRef.current = null;
      setHexInput(value);
      return;
    }

    const { h, s, v } = hexToHsv(value);
    hsvRef.current = { h, s, v };
    setHue(h);
    setSat(s);
    setBrightness(v);
    setHexInput(value);
  }, [value]);

  // ── Position the popover relative to the trigger button ──────────────
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !open) {
      setPopoverPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 420; // w-[420px]
    const panelHeight = 300; // approximate max height (landscape layout)
    const gap = 10;
    const margin = 24;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    // Prefer below, but flip above early enough to avoid hugging the viewport
    // bottom when the trigger sits low in a modal scroll body.
    const spaceBelow = viewH - margin - (rect.bottom + gap);
    const spaceAbove = rect.top - margin - gap;
    const above = spaceBelow < panelHeight && spaceAbove > spaceBelow;

    const rawTop = above ? rect.top - gap - panelHeight : rect.bottom + gap;
    const top = Math.max(margin, Math.min(rawTop, viewH - margin - panelHeight));

    let left = Math.max(margin, Math.min(rect.left, viewW - margin - panelWidth));
    let right: number | undefined;
    if (left + panelWidth > viewW - margin) {
      left = undefined;
      right = margin;
    }

    setPopoverPos({ top, left, right, above });
  }, [open]);

  // Re-position on open and on scroll/resize while open
  useEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    updatePosition();
    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const commitColor = useCallback((h: number, s: number, v: number) => {
    const hex = hsvToHex(h, s, v);
    lastCommittedColorRef.current = { raw: hex.toLowerCase(), canonical: hex.toLowerCase() };
    setHexInput(hex);
    onChange(hex);
  }, [onChange]);

  const handleHueChange = useCallback((h: number) => {
    hsvRef.current = { ...hsvRef.current, h };
    setHue(h);
    commitColor(h, hsvRef.current.s, hsvRef.current.v);
  }, [commitColor]);

  const handleSatValueChange = useCallback((s: number, v: number) => {
    hsvRef.current = { ...hsvRef.current, s, v };
    setSat(s);
    setBrightness(v);
    commitColor(hsvRef.current.h, s, v);
  }, [commitColor]);

  const handleHexSubmit = useCallback(() => {
    const input = hexInput.trim();
    if (hexIsValid(input)) {
      const { h, s, v } = hexToHsv(input);
      hsvRef.current = { h, s, v };
      lastCommittedColorRef.current = {
        raw: input.toLowerCase(),
        canonical: hsvToHex(h, s, v).toLowerCase(),
      };
      setHue(h); setSat(s); setBrightness(v);
      onChange(input);
    } else {
      setHexInput(value);
    }
  }, [hexInput, value, onChange]);

  const handleHexKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleHexSubmit();
    }
  };

  const handleQuickColor = useCallback((c: string) => {
    const { h, s, v } = hexToHsv(c);
    hsvRef.current = { h, s, v };
    lastCommittedColorRef.current = {
      raw: c.toLowerCase(),
      canonical: hsvToHex(h, s, v).toLowerCase(),
    };
    setHue(h); setSat(s); setBrightness(v);
    setHexInput(c);
    onChange(c);
  }, [onChange]);

  // Build popover style with proper flip-aware transform origin
  const popoverStyle: React.CSSProperties | undefined = popoverPos
    ? ({
        position: 'fixed',
        top: popoverPos.top,
        left: popoverPos.left ?? 'auto',
        right: popoverPos.right ?? 'auto',
        transform: 'none',
        transformOrigin: popoverPos.above ? 'bottom left' : 'top left',
      } satisfies React.CSSProperties)
    : undefined;

  return (
    <div className="relative">
      {/* Trigger button — shows current color */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close color picker" : "Open color picker"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open
            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/50"
        )}
      >
        <span
          className="w-7 h-7 rounded-lg shrink-0 ring-1 ring-black/10 transition-transform group-hover:scale-105"
          style={{ backgroundColor: value }}
        />
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground/60 leading-none">
            Custom
          </span>
          <span className="text-xs font-mono font-bold text-foreground tabular-nums">
            {value.toUpperCase()}
          </span>
        </div>
      </button>

      {/* Dropdown panel — portaled to document.body so it pops out of any overflow/transform container */}
      {open && popoverStyle && createPortal(
        <ColorPickerPanel
          panelRef={panelRef}
          hue={hue}
          sat={sat}
          brightness={brightness}
          hexInput={hexInput}
          value={value}
          onSatValueChange={handleSatValueChange}
          onHueChange={handleHueChange}
          onHexInputChange={setHexInput}
          onHexSubmit={handleHexSubmit}
          onHexKeyDown={handleHexKeyDown}
          onQuickColor={handleQuickColor}
          style={popoverStyle}
        />,
        document.body
      )}
    </div>
  );
}

export default ColorPicker;
