import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../app/components/ui/tabs";
import type { OrganizationEventsView } from "../../lib/organizationEventPresentation";

export interface OrganizationEventsWorkspaceTabsProps {
  value: OrganizationEventsView;
  onValueChange: (value: OrganizationEventsView) => void;
  currentCount?: number;
  historyCount?: number;
  currentPanel: ReactNode;
  historyPanel: ReactNode;
}

function documentTop(element: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

export function OrganizationEventsWorkspaceTabs({
  value,
  onValueChange,
  currentCount,
  historyCount,
  currentPanel,
  historyPanel,
}: OrganizationEventsWorkspaceTabsProps) {
  const [navbarHeight, setNavbarHeight] = useState(0);
  const [historyVisited, setHistoryVisited] = useState(value === "history");
  const tabsRef = useRef<HTMLDivElement>(null);
  const previousValue = useRef(value);
  const scrollPositions = useRef<Record<OrganizationEventsView, number>>({ current: 0, history: 0 });
  const historyVisitedRef = useRef(value === "history");
  const navbarHeightRef = useRef(navbarHeight);
  navbarHeightRef.current = navbarHeight;

  useEffect(() => {
    const navbar = document.querySelector<HTMLElement>("[data-public-navbar]");
    if (!navbar) return;
    const measure = () => setNavbarHeight(Math.round(navbar.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(navbar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const rememberScroll = () => { scrollPositions.current[previousValue.current] = window.scrollY; };
    rememberScroll();
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberScroll);
  }, []);

  useLayoutEffect(() => {
    const previous = previousValue.current;
    if (previous === value) return;
    const nextIsFirstHistoryVisit = value === "history" && !historyVisitedRef.current;
    if (nextIsFirstHistoryVisit) {
      historyVisitedRef.current = true;
      setHistoryVisited(true);
    }

    // The sticky bar's offset moves while pinned; its normal-flow Tabs parent stays stable.
    const anchor = tabsRef.current?.parentElement;
    const top = nextIsFirstHistoryVisit
      ? Math.max(0, (anchor ? documentTop(anchor) : 0) - navbarHeightRef.current)
      : scrollPositions.current[value];
    previousValue.current = value;
    const frame = requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, left: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const selectView = (next: string) => {
    if (next !== "current" && next !== "history") return;
    scrollPositions.current[value] = window.scrollY;
    if (next === "history") {
      setHistoryVisited(true);
    }
    onValueChange(next);
  };

  const currentCountDescriptionId = "organization-events-current-count";
  const historyCountDescriptionId = "organization-events-history-count";

  return (
    <Tabs value={value} onValueChange={selectView} activationMode="manual" className="gap-3">
      <div ref={tabsRef} className="sticky z-30 -mx-2 rounded-2xl border border-border/70 bg-background/95 px-2 py-2 shadow-sm backdrop-blur-xl sm:mx-0" style={{ top: navbarHeight }}>
        <TabsList aria-label="Organization event views" className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          <TabsTrigger value="current" aria-label="Current work" aria-describedby={currentCount === undefined ? undefined : currentCountDescriptionId} className="min-h-11 rounded-lg px-3 py-2 text-sm font-bold motion-reduce:transition-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
            <span>Current work</span>
            {currentCount !== undefined && <span aria-hidden="true" className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs tabular-nums text-primary">{currentCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="history" aria-label="Event history" aria-describedby={historyCount === undefined ? undefined : historyCountDescriptionId} className="min-h-11 rounded-lg px-3 py-2 text-sm font-bold motion-reduce:transition-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
            <span>Event history</span>
            {historyCount !== undefined && <span aria-hidden="true" className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs tabular-nums text-primary">{historyCount}</span>}
          </TabsTrigger>
        </TabsList>
      </div>
      {currentCount !== undefined && <span id={currentCountDescriptionId} className="sr-only">{currentCount} current work items</span>}
      {historyCount !== undefined && <span id={historyCountDescriptionId} className="sr-only">{historyCount} organization event records</span>}
      <TabsContent forceMount value="current" aria-label="Current work" aria-hidden={value !== "current"} hidden={value !== "current"} className="mt-0 min-w-0 focus-visible:ring-2 focus-visible:ring-primary/50">
        {currentPanel}
      </TabsContent>
      <TabsContent forceMount value="history" aria-label="Event history" aria-hidden={value !== "history"} hidden={value !== "history"} className="mt-0 min-w-0 focus-visible:ring-2 focus-visible:ring-primary/50">
        {historyVisited ? historyPanel : null}
      </TabsContent>
    </Tabs>
  );
}
