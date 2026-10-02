import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

const steps = [
  {
    title: "Choose your event location",
    description: "Use Event locations to switch between campus grounds and the building floors requested in your proposal. Each location has its own layout.",
    targets: ["locations"],
  },
  {
    title: "Place event assets",
    description: "Furniture opens the asset picker. Choose an item there, then click the map to place it. Items have fixed map-relative sizes; drag to move them and use undo to correct mistakes.",
    targets: ["furniture", "asset-picker"],
  },
  {
    title: "Arrange seating",
    description: "Open Arrange for a ready-made layout. Set the total chairs and chairs per row, then position the preview on clear space on the map.",
    targets: ["arrange"],
  },
  {
    title: "Inspect and align",
    description: "Select an item on the map to open Details for its position and rotation. Objects helps you find and rename items; select several items to align or distribute them.",
    targets: ["objects", "canvas"],
  },
  {
    title: "Save your draft",
    description: "Save Draft stores your work. Watch the save status before leaving. Back returns to your events and protects unsaved work.",
    targets: ["save", "save-status"],
  },
  {
    title: "Review and submit",
    description: "Open Layout checks and fix overlaps or boundary issues. Submit to GSO sends all requested locations for approval. You can replay this tour from Editor help.",
    targets: ["layout-checks", "submit"],
  },
] as const;

type TourStep = number | null;
type SpotlightRect = { x: number; y: number; width: number; height: number };

function completed(key: string) {
  try { return localStorage.getItem(key) === "done"; } catch { return false; }
}

const EventTourSpotlight = forwardRef<SVGSVGElement, { targets: string[] }>(function EventTourSpotlight({ targets }, forwardedRef) {
  const [rects, setRects] = useState<SpotlightRect[]>([]);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const elements = targets.flatMap((target) => Array.from(document.querySelectorAll<HTMLElement>(`[data-event-tour="${target}"]`)));
        const visible = elements.filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        visible[0]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        setRects(visible.map((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.left - 6, y: rect.top - 6, width: rect.width + 12, height: rect.height + 12 };
        }));
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    targets.forEach((target) => document.querySelectorAll<HTMLElement>(`[data-event-tour="${target}"]`).forEach((element) => observer?.observe(element)));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
  }, [targets.join("|")]);

  const width = window.innerWidth;
  const height = window.innerHeight;
  const path = `M0 0H${width}V${height}H0Z ${rects.map(({ x, y, width: rectWidth, height: rectHeight }) => `M${x} ${y}h${rectWidth}v${rectHeight}h-${rectWidth}Z`).join(" ")}`;
  return (
    <svg ref={forwardedRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={path} fill="rgba(10, 18, 34, .48)" fillRule="evenodd" />
      {rects.map((rect, index) => <rect key={index} {...rect} rx="12" fill="none" stroke="rgb(96, 165, 250)" strokeWidth="3" style={{ filter: "drop-shadow(0 0 9px rgba(96,165,250,.9))" }} />)}
    </svg>
  );
});

export function EventEditorTutorial({ accountId, onStepChange }: { accountId: string; onStepChange?: (step: TourStep) => void }) {
  const key = `navisync:event-editor-tour:v2:${accountId}`;
  const [open, setOpen] = useState(() => !completed(key));
  const [step, setStep] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<SpotlightRect | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 16, width: 448 });
  const currentTargets = [...steps[step].targets];

  const updatePosition = () => {
    const rect = currentTargets
      .map((target) => document.querySelector<HTMLElement>(`[data-event-tour="${target}"]`))
      .find((element) => element && element.getClientRects().length > 0)
      ?.getBoundingClientRect();
    if (rect) anchorRef.current = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    const anchor = anchorRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(448, viewportWidth - 32);
    const cardHeight = contentRef.current?.getBoundingClientRect().height ?? 260;
    if (viewportWidth < 640) {
      setPosition({ left: 16, top: Math.max(16, viewportHeight - cardHeight - 16), width: cardWidth });
      return;
    }
    const left = Math.max(16, Math.min((anchor?.x ?? 16) + Math.min(anchor?.width ?? 0, 24), viewportWidth - cardWidth - 16));
    const below = (anchor?.y ?? 16) + (anchor?.height ?? 0) + 18;
    const above = (anchor?.y ?? 16) - cardHeight - 18;
    const top = below + cardHeight <= viewportHeight - 16 ? below : Math.max(16, above);
    setPosition({ left, top, width: cardWidth });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, step, currentTargets.join("|")]);

  const finish = () => {
    try { localStorage.setItem(key, "done"); } catch { /* The tour can still close without storage. */ }
    onStepChange?.(null);
    setOpen(false);
  };
  const goToStep = (next: number) => {
    setStep(next);
    onStepChange?.(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value) finish(); else setOpen(true); }}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="Editor help" className="h-8 rounded-xl border border-border px-3 text-xs font-bold hover:bg-muted" onClick={() => { setStep(0); onStepChange?.(0); }}>Help</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <EventTourSpotlight targets={currentTargets} />
        <Dialog.Content
          ref={contentRef}
          onOpenAutoFocus={(event) => { event.preventDefault(); nextButtonRef.current?.focus(); }}
          style={{ left: position.left, top: position.top, width: position.width }}
          className="fixed z-[91] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl outline-none sm:p-6"
        >
          <p className="mb-2 text-xs font-bold text-muted-foreground">Event editor tour · {step + 1} of {steps.length}</p>
          <Dialog.Title className="text-lg font-extrabold">{steps[step].title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">{steps[step].description}</Dialog.Description>
          <div className="mt-6 flex items-center justify-between gap-2">
            <button type="button" onClick={finish} className="text-sm text-muted-foreground">Skip tour</button>
            <div className="flex gap-2">
              <button type="button" disabled={step === 0} onClick={() => goToStep(step - 1)} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40">Back</button>
              <button ref={nextButtonRef} type="button" onClick={() => step === steps.length - 1 ? finish() : goToStep(step + 1)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{step === steps.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
