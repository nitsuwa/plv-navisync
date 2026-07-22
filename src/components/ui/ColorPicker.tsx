import { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

// ── Color utility functions ─────────────────────────────────────────────────

function hexToHsl(hex: string): { h: number; s: number; l: number } {
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
  let hVal = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hVal = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hVal = ((b - r) / d + 2) / 6; break;
      case b: hVal = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(hVal * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
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

function SatLightSquare({
  hue,
  sat,
  light,
  onChange,
}: {
  hue: number;
  sat: number;
  light: number;
  onChange: (s: number, l: number) => void;
}) {
  const squareRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromMouse = useCallback((e: MouseEvent | React.MouseEvent) => {
    const el = squareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange(Math.round(x * 100), Math.round((1 - y) * 100));
  }, [onChange]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      updateFromMouse(e);
    };
    const handleUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [updateFromMouse]);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    updateFromMouse(e);
  };

  // Marker position
  const mx = `${sat}%`;
  const my = `${100 - light}%`;

  return (
    <div className="relative w-full h-40 rounded-lg overflow-hidden cursor-crosshair select-none" ref={squareRef} onMouseDown={handleMouseDown}>
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
  const dragging = useRef(false);

  const updateFromMouse = useCallback((e: MouseEvent | React.MouseEvent) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(Math.round(x * 360));
  }, [onChange]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      updateFromMouse(e);
    };
    const handleUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [updateFromMouse]);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    updateFromMouse(e);
  };

  const thumbLeft = `${(hue / 360) * 100}%`;

  return (
    <div className="relative w-full h-6 rounded-lg overflow-hidden cursor-ew-resize select-none" ref={barRef} onMouseDown={handleMouseDown}>
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
  light: number;
  hexInput: string;
  value: string;
  onSatLightChange: (s: number, l: number) => void;
  onHueChange: (h: number) => void;
  onHexInputChange: (v: string) => void;
  onHexSubmit: () => void;
  onHexKeyDown: (e: React.KeyboardEvent) => void;
  onQuickColor: (color: string) => void;
  style?: React.CSSProperties;
}

const ColorPickerPanel = memo(function ColorPickerPanel({
  panelRef,
  hue, sat, light,
  hexInput, value,
  onSatLightChange, onHueChange,
  onHexInputChange, onHexSubmit, onHexKeyDown,
  onQuickColor,
  style,
}: ColorPickerPanelProps) {
  return (
    <div
      ref={panelRef}
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
          <SatLightSquare hue={hue} sat={sat} light={light} onChange={onSatLightChange} />
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
                style={{ backgroundColor: `hsl(${hue},${sat}%,${light}%)` }}
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
  const { h: initH, s: initS, l: initL } = hexToHsl(value);
  const [hue, setHue] = useState(initH);
  const [sat, setSat] = useState(initS);
  const [light, setLight] = useState(initL);

  // Sync external value changes to internal state
  useEffect(() => {
    const { h, s, l } = hexToHsl(value);
    setHue(h);
    setSat(s);
    setLight(l);
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
    const gap = 8; // mt-2 = 0.5rem = 8px
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    // Prefer below, flip above if not enough room
    const spaceBelow = viewH - (rect.bottom + gap);
    const spaceAbove = rect.top - gap;
    const above = spaceBelow < panelHeight && spaceAbove > spaceBelow;

    // Horizontal: align left edge by default, flip to right edge if overflowing
    let left: number | undefined = rect.left;
    let right: number | undefined;
    if (rect.left + panelWidth > viewW - 16) {
      left = undefined;
      right = viewW - rect.right;
    }

    setPopoverPos({ top: above ? rect.top - gap : rect.bottom + gap, left, right, above });
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

  const commitColor = useCallback((h: number, s: number, l: number) => {
    const hex = hslToHex(h, s, l);
    setHexInput(hex);
    onChange(hex);
  }, [onChange]);

  const handleHueChange = useCallback((h: number) => {
    setHue(h);
    commitColor(h, sat, light);
  }, [sat, light, commitColor]);

  const handleSatLightChange = useCallback((s: number, l: number) => {
    setSat(s);
    setLight(l);
    commitColor(hue, s, l);
  }, [hue, commitColor]);

  const handleHexSubmit = useCallback(() => {
    const input = hexInput.trim();
    if (hexIsValid(input)) {
      const { h, s, l } = hexToHsl(input);
      setHue(h); setSat(s); setLight(l);
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
    const { h, s, l } = hexToHsl(c);
    setHue(h); setSat(s); setLight(l);
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
        transform: popoverPos.above ? 'translateY(-8px)' : 'translateY(8px)',
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
          light={light}
          hexInput={hexInput}
          value={value}
          onSatLightChange={handleSatLightChange}
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
