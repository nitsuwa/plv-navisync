import { useEffect, useRef, useState, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
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
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
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
        className="inline-flex"
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
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            transform: "translate(-50%, -100%) translateY(-6px)",
            zIndex: 9999,
            pointerEvents: "none",
          }}
          className="px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] font-semibold whitespace-nowrap shadow-lg"
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
