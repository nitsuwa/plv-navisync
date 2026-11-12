import { useEffect, useRef, useState } from "react";
import { BookOpen, Cloud, Map, WifiOff } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../../lib/utils";

/** A small status control with accurate, general guidance about offline support. */
export function OfflineInfoPopover({ className, testId = "offline-info-trigger", resetKey }: { className?: string; testId?: string; resetKey?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeAfterPointerLeaves = useRef(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    setOpen(false);
    closeAfterPointerLeaves.current = false;
  }, [resetKey]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const onOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      closeAfterPointerLeaves.current = true;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", onOutsidePointer, true);
  }, [open]);

  const close = () => {
    window.clearTimeout(hoverTimer.current);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) closeAfterPointerLeaves.current = true;
    }}>
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-testid={testId}
          aria-label="Offline information"
          aria-haspopup="dialog"
          aria-expanded={open}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse" || closeAfterPointerLeaves.current) return;
            window.clearTimeout(hoverTimer.current);
            setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            closeAfterPointerLeaves.current = false;
            hoverTimer.current = window.setTimeout(() => setOpen(false), 160);
          }}
          onClick={() => {
            closeAfterPointerLeaves.current = false;
            setOpen((value) => !value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className={cn("pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-500/25 bg-card/95 px-2.5 text-[10px] font-bold text-foreground shadow-sm transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60", className)}
        >
          <WifiOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Offline</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={contentRef}
        data-testid="offline-info-popover"
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={{ top: 12, right: 12, bottom: 76, left: 12 }}
        onPointerEnter={() => window.clearTimeout(hoverTimer.current)}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          hoverTimer.current = window.setTimeout(() => setOpen(false), 160);
        }}
        className="z-[100] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-border/80 bg-card p-4 text-card-foreground shadow-lg outline-none motion-reduce:animate-none"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><WifiOff aria-hidden="true" className="h-4 w-4" /></span>
            <div><h2 className="text-sm font-extrabold">Offline Mode</h2><p className="text-[11px] text-muted-foreground">Using saved campus information.</p></div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Some features may require an internet connection.</p>
          <div className="grid gap-2 border-t border-border/70 pt-3 text-xs">
            <section>
              <h3 className="mb-1 flex items-center gap-1.5 font-bold text-foreground"><Map aria-hidden="true" className="h-3.5 w-3.5 text-primary" />Available when saved</h3>
              <p className="leading-relaxed text-muted-foreground">Campus maps, room information, supported routes, and previously cached videos.</p>
            </section>
            <section>
              <h3 className="mb-1 flex items-center gap-1.5 font-bold text-foreground"><Cloud aria-hidden="true" className="h-3.5 w-3.5 text-primary" />Requires internet</h3>
              <p className="leading-relaxed text-muted-foreground">Live updates, account services, Google Maps directions, uncached videos, and publishing.</p>
            </section>
          </div>
          <p className="flex gap-1.5 border-t border-border/70 pt-2 text-[10px] leading-relaxed text-muted-foreground"><BookOpen aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />Saved emergency information may be out of date. Follow posted signs and campus personnel.</p>
        </div>
      </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
