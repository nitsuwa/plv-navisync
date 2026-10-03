import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

const steps = [
  {
    title: "Choose your event location",
    description: "Use Event locations to switch between campus grounds and the building floors requested in your proposal. Each location keeps its own layout. If the desktop list is collapsed, choose Expand locations first. On mobile, use Event location.",
    targets: ["locations"],
  },
  {
    title: "Choose a fixed-size asset",
    description: "Furniture opens the placement dock. Choose Chair, Table, Booth, or Stage from Quick assets, or browse the catalog with Browse assets. Move the preview over the map; tap Place here on touch screens.",
    targets: ["furniture", "asset-picker"],
  },
  {
    title: "Create a seating layout",
    description: "Open Layouts for ready-made arrangements. Choose the chair count, chairs per row, clear gaps, and optional aisle before placing the preview.",
    targets: ["arrange"],
  },
  {
    title: "Arrange and inspect items",
    description: "Select furniture to use Arrange selection, Rotate, and Move here. Open Details for the item name, fixed size, rotation, and lock; Advanced contains position, visibility, layer, and group controls. Objects helps find an item. Select one first to enable Details; this tour does not create sample items.",
    targets: ["objects"],
  },
  {
    title: "Save your draft",
    description: "Save Draft stores your work. Check the save state before leaving. Back returns to your events and protects unsaved changes.",
    targets: ["save", "save-status"],
  },
  {
    title: "Review and submit",
    description: "Open Layout checks and fix overlaps or boundary issues. Review & submit opens the summary for every requested location before sending the proposal for approval. You can replay this tour from Editor help.",
    targets: ["layout-checks", "submit"],
  },
] as const;

type TourStep = number | null;
type SpotlightRect = { x: number; y: number; width: number; height: number };

function completed(key: string) {
  try { return localStorage.getItem(key) === "done"; } catch { return false; }
}

function firstVisibleTarget(targets: readonly string[]) {
  for (const target of targets) {
    const element = Array.from(document.querySelectorAll<HTMLElement>(`[data-event-tour="${target}"]`))
      .find((candidate) => candidate.getClientRects().length > 0 && getComputedStyle(candidate).visibility !== "hidden");
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { element, rect };
  }
  return null;
}

const EventTourSpotlight = forwardRef<SVGSVGElement, { targets: readonly string[] }>(function EventTourSpotlight({ targets }, forwardedRef) {
  const [rects, setRects] = useState<SpotlightRect[]>([]);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const elements = targets.flatMap((target) => Array.from(document.querySelectorAll<HTMLElement>(`[data-event-tour="${target}"]`)));
        const visible = elements.filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        visible[0]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        setRects(visible.flatMap((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0
            ? [{ x: rect.left - 6, y: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }]
            : [];
        }));
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    targets.forEach((target) => document.querySelectorAll<HTMLElement>(`[data-event-tour="${target}"]`).forEach((element) => observer?.observe(element)));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [targets.join("|")]);

  const width = window.innerWidth;
  const height = window.innerHeight;
  const path = `M0 0H${width}V${height}H0Z ${rects.map(({ x, y, width: rectWidth, height: rectHeight }) => `M${x} ${y}h${rectWidth}v${rectHeight}h-${rectWidth}Z`).join(" ")}`;
  return (
    <svg ref={forwardedRef} aria-hidden="true" data-testid="event-tour-spotlight" className="pointer-events-none fixed inset-0 z-[90] h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
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
  const [position, setPosition] = useState({ left: 16, top: 16, width: 448 });
  const currentTargets = steps[step].targets;

  const updatePosition = () => {
    const visibleTarget = firstVisibleTarget(currentTargets);
    const anchor = visibleTarget?.rect ?? null;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const margin = 16;
    const cardWidth = Math.max(0, Math.min(448, viewportWidth - margin * 2));
    const card = contentRef.current;
    const measuredHeight = card ? Math.max(card.getBoundingClientRect().height, card.scrollHeight) : 0;
    const cardHeight = Math.max(260, Math.min(measuredHeight, viewportHeight - margin * 2));
    const clampLeft = (left: number) => Math.max(margin, Math.min(left, viewportWidth - cardWidth - margin));
    const clampTop = (top: number) => Math.max(margin, Math.min(top, viewportHeight - cardHeight - margin));

    if (!anchor) {
      setPosition({ left: margin, top: margin, width: cardWidth });
      return;
    }

    const below = anchor.bottom + 12;
    const above = anchor.top - cardHeight - 12;
    const centeredLeft = clampLeft(anchor.left + anchor.width / 2 - cardWidth / 2);
    if (viewportWidth < 640) {
      const top = below + cardHeight <= viewportHeight - margin
        ? below
        : above >= margin
          ? above
          : viewportHeight - anchor.bottom >= anchor.top
            ? clampTop(below)
            : clampTop(above);
      setPosition({ left: clampLeft((viewportWidth - cardWidth) / 2), top: clampTop(top), width: cardWidth });
      return;
    }

    const candidates = [
      { left: centeredLeft, top: below },
      { left: centeredLeft, top: above },
      { left: anchor.right + 12, top: anchor.top + anchor.height / 2 - cardHeight / 2 },
      { left: anchor.left - cardWidth - 12, top: anchor.top + anchor.height / 2 - cardHeight / 2 },
    ].filter(({ left, top }) => left >= margin && top >= margin && left + cardWidth <= viewportWidth - margin && top + cardHeight <= viewportHeight - margin);
    const clearCandidate = candidates.find(({ left, top }) =>
      left + cardWidth <= anchor.left - 8 || left >= anchor.right + 8 || top + cardHeight <= anchor.top - 8 || top >= anchor.bottom + 8,
    );
    const fallbackTop = viewportHeight - anchor.bottom >= anchor.top ? below : above;
    const candidate = clearCandidate ?? { left: centeredLeft, top: clampTop(fallbackTop) };
    setPosition({ left: clampLeft(candidate.left), top: clampTop(candidate.top), width: cardWidth });
  };

  useLayoutEffect(() => {
    if (!open) return;
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(updatePosition); });
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (contentRef.current) observer?.observe(contentRef.current);
    currentTargets.forEach((target) => document.querySelectorAll<HTMLElement>(`[data-event-tour="${target}"]`).forEach((element) => observer?.observe(element)));
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      observer?.disconnect();
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
          style={{ left: position.left, top: position.top, width: position.width, paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          className="fixed z-[91] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl outline-none sm:p-6"
        >
          <p className="mb-2 text-xs font-bold text-muted-foreground">Event editor tour · {step + 1} of {steps.length}</p>
          <Dialog.Title className="text-lg font-extrabold">{steps[step].title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">{steps[step].description}</Dialog.Description>
          <div className="mt-6 flex items-center justify-between gap-2">
            <button type="button" onClick={finish} className="min-h-10 text-sm text-muted-foreground">Skip tour</button>
            <div className="flex gap-2">
              <button type="button" disabled={step === 0} onClick={() => goToStep(step - 1)} className="min-h-10 rounded-xl border border-border px-3 py-2 text-sm text-foreground disabled:opacity-40">Back</button>
              <button ref={nextButtonRef} type="button" onClick={() => step === steps.length - 1 ? finish() : goToStep(step + 1)} className="min-h-10 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{step === steps.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
