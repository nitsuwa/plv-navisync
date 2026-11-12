import { MousePointer2 } from "lucide-react";
import { motion } from "motion/react";
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export type DiscoverCursorPosition = { x: number; y: number };

export function discoverCursorTargetPosition(target: HTMLElement): DiscoverCursorPosition {
  const bounds = target.getBoundingClientRect();
  return { x: Math.round(bounds.right - 14), y: Math.round(bounds.bottom - 15) };
}

interface Props {
  targetRef: RefObject<HTMLElement>;
  stepKey: string | number;
  clickAfterMs?: number;
  reducedMotion: boolean;
  initialPosition?: DiscoverCursorPosition;
  children: ReactNode;
}

export function DiscoverGuideCursor({ targetRef, stepKey, clickAfterMs, reducedMotion, initialPosition, children }: Props) {
  const [guidePosition, setGuidePosition] = useState<{ x: number; y: number; captionOnLeft: boolean } | null>(null);

  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    let frameId: number;
    let previousPosition: typeof guidePosition = null;
    // The panel can move during its layout animation without resizing the button.
    const updatePosition = () => {
      const { x, y } = discoverCursorTargetPosition(target);
      const captionOnLeft = x > window.innerWidth / 2;
      if (previousPosition?.x !== x || previousPosition.y !== y || previousPosition.captionOnLeft !== captionOnLeft) {
        previousPosition = { x, y, captionOnLeft };
        setGuidePosition(previousPosition);
      }
      frameId = window.requestAnimationFrame(updatePosition);
    };
    updatePosition();
    return () => window.cancelAnimationFrame(frameId);
  }, [targetRef]);

  return guidePosition && createPortal(
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-[80] h-5 w-5"
      initial={reducedMotion ? false : initialPosition ?? { x: -window.innerWidth, y: guidePosition.y }}
      animate={{ x: guidePosition.x, y: guidePosition.y }}
      transition={{ duration: reducedMotion ? 0 : 0.8, ease: "easeInOut" }}
    >
      {!reducedMotion && (
        <motion.span
          key={stepKey}
          aria-hidden="true"
          className="block origin-top-left text-white drop-shadow-md"
          animate={clickAfterMs === undefined ? undefined : { scale: [1, 0.68, 1] }}
          transition={clickAfterMs === undefined ? undefined : { delay: clickAfterMs / 1000 - 0.4, duration: 0.32 }}
        >
          <MousePointer2 className="h-5 w-5 fill-white stroke-slate-900" />
        </motion.span>
      )}
      <div
        role="status"
        className={`absolute w-max max-w-[min(13rem,calc(50vw-1rem))] rounded-xl bg-slate-950 px-3 py-2 text-xs leading-snug text-white shadow-lg ring-1 ring-inset ring-white/25 ${guidePosition.captionOnLeft ? "right-full mr-1" : "left-full ml-1"} ${guidePosition.y > 100 ? "bottom-2" : "top-0"}`}
      >
        {children}
      </div>
    </motion.div>,
    document.body,
  );
}
