import { useState, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  return (
    <>
      <span
        className="inline-flex"
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPos({ x: rect.left + rect.width / 2, y: rect.top });
          setShow(true);
        }}
        onMouseLeave={() => setShow(false)}
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
