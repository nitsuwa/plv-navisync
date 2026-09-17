import { useEffect, useRef, useState, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);
  const clearTimer = () => {
    if (timerRef.current !== null && typeof window !== "undefined") window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const showAt = (target: HTMLElement) => {
    clearTimer();
    const rect = target.getBoundingClientRect();
    // Keep the compact hint inside the viewport even when a palette item sits
    // against a sidebar edge. The width matches the max-width used by the
    // tooltip surface below, with a small breathing room on either side.
    const viewportWidth = typeof window === "undefined" ? 320 : window.innerWidth;
    const tooltipHalfWidth = Math.min(120, Math.max(80, (viewportWidth - 24) / 2));
    const x = Math.min(
      Math.max(rect.left + rect.width / 2, tooltipHalfWidth + 12),
      viewportWidth - tooltipHalfWidth - 12,
    );
    setPos({ x, y: Math.max(rect.top, 12) });
    // A short delay keeps dense editor palettes from flashing tooltips while
    // the pointer crosses adjacent cards. Focused keyboard users still get
    // the same hint without needing a separate tooltip implementation.
    if (typeof window === "undefined") {
      setShow(true);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setShow(true);
    }, 180);
  };
  const hide = () => { clearTimer(); setShow(false); };
  useEffect(() => () => clearTimer(), []);

  return (
    <>
      <span
        className={`inline-flex ${className ?? ""}`}
        tabIndex={0}
        aria-label={content}
        onFocus={(e) => showAt(e.currentTarget)}
        onBlur={hide}
        onMouseEnter={(e) => showAt(e.currentTarget)}
        onMouseLeave={hide}
      >
        {children}
      </span>
      {show && (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            transform: "translate(-50%, -100%) translateY(-6px)",
            zIndex: 9999,
            pointerEvents: "none",
          }}
          className="max-w-[240px] px-2.5 py-1.5 rounded-lg bg-foreground text-background text-center text-[10px] font-semibold leading-snug whitespace-normal break-words shadow-lg"
        >
          {content}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "100%",
              transform: "translateX(-50%)",
            }}
            className="border-[5px] border-transparent border-t-foreground"
          />
        </div>
      )}
    </>
  );
}
