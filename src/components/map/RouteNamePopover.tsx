import * as Popover from "@radix-ui/react-popover";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { cn } from "../../lib/utils";

export type RouteNameKind = "origin" | "destination";
type RouteNamePopoverSide = "top" | "right" | "bottom" | "left";

interface RouteNamePopoverProps {
  name: string;
  kind: RouteNameKind;
  side?: RouteNamePopoverSide;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  testId?: string;
  className?: string;
  valueClassName?: string;
}

/** A compact name control that exposes the complete route endpoint on touch, focus, and hover. */
export function RouteNamePopover({
  name,
  kind,
  side = "bottom",
  align = "start",
  contentClassName,
  testId = "guided-destination",
  className,
  valueClassName,
}: RouteNamePopoverProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const endpointLabel = kind === "origin" ? "origin" : "destination";

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  const handleBlur = (event: FocusEvent<HTMLButtonElement>) => {
    if (!contentRef.current?.contains(event.relatedTarget as Node | null)) {
      clearCloseTimer();
      setOpen(false);
    }
  };

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) clearCloseTimer();
        setOpen(nextOpen);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid={testId ? `${testId}-trigger` : undefined}
          aria-label={`Show full ${endpointLabel} name: ${name}`}
          title={`Show full ${endpointLabel} name`}
          onClick={(event) => {
            event.preventDefault();
            clearCloseTimer();
            setOpen(true);
          }}
          onMouseEnter={() => {
            clearCloseTimer();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          className={cn(
            "inline-flex min-h-8 min-w-0 max-w-full items-center rounded-md text-left text-primary transition-colors hover:text-primary/75 active:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
            className,
          )}
        >
          <span
            data-testid={testId}
            title={name}
            className={cn("min-w-0 max-w-full", valueClassName)}
          >
            {name}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          role="dialog"
          aria-label={`${kind === "origin" ? "Origin" : "Destination"} details`}
          side={side}
          align={align}
          sideOffset={5}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          className={cn("z-[130] w-[min(22rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-xl outline-none", contentClassName)}
        >
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-primary">
            {kind}
          </p>
          <p data-testid="route-name-popover-value" className="mt-1 break-words text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
            {name}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
