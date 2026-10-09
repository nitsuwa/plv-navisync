import { useEffect, type KeyboardEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { CalendarDays, ClipboardCheck, History, ListChecks } from "lucide-react";
import { cn } from "../lib/utils";
import { AdminEventLayoutsPage } from "./AdminEventLayoutsPage";
import { AdminEventsPage } from "./AdminEventsPage";

export type AdminEventsWorkspaceView = "review" | "publication" | "history" | "listings";

const VIEWS: Array<{ id: AdminEventsWorkspaceView; label: string; icon: typeof ClipboardCheck }> = [
  { id: "review", label: "Needs review", icon: ClipboardCheck },
  { id: "publication", label: "Approved & publication", icon: CalendarDays },
  { id: "history", label: "History", icon: History },
  { id: "listings", label: "Campus listings", icon: ListChecks },
];

function isWorkspaceView(value: string | null): value is AdminEventsWorkspaceView {
  return VIEWS.some(view => view.id === value);
}

/** One admin Events workspace for student layouts and legacy campus listings. */
export function AdminEventsWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  // /admin-dashboard/events was the legacy Campus Events URL. Keep direct
  // bookmarks there working; the new sidebar explicitly opens ?view=review.
  const activeView: AdminEventsWorkspaceView = isWorkspaceView(requestedView) ? requestedView : "listings";

  useEffect(() => {
    if (!isWorkspaceView(requestedView)) {
      setSearchParams(current => {
        const next = new URLSearchParams(current);
        next.set("view", "listings");
        return next;
      }, { replace: true });
    }
  }, [requestedView, setSearchParams]);

  const selectView = (view: AdminEventsWorkspaceView) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set("view", view);
      if (view !== "review") next.delete("review");
      return next;
    });
  };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? VIEWS.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length;
    const nextView = VIEWS[nextIndex];
    selectView(nextView.id);
    document.getElementById(`admin-events-tab-${nextView.id}`)?.focus();
  };

  return (
    <div className="space-y-5 animate-fade-in" aria-labelledby="admin-events-title">
      <header className="space-y-1">
        <h1 id="admin-events-title" className="text-2xl font-extrabold text-foreground">Events</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Review organization event maps, manage approved publication, browse past submissions, and maintain campus listings from one workspace.</p>
      </header>

      <div role="tablist" aria-label="Events workspace" className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 no-scrollbar">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`admin-events-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeView === id}
            aria-controls="admin-events-view"
            tabIndex={activeView === id ? 0 : -1}
            onKeyDown={event => handleTabKeyDown(event, VIEWS.findIndex(view => view.id === id))}
            onClick={() => selectView(id)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 sm:px-4 text-xs sm:text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              activeView === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <section id="admin-events-view" role="tabpanel" aria-labelledby={`admin-events-tab-${activeView}`} className="min-w-0">
        {activeView === "listings"
          ? <AdminEventsPage />
          : <AdminEventLayoutsPage key={activeView} workspaceView={activeView} />}
      </section>
    </div>
  );
}

/** Keeps existing review URLs and unrelated query parameters working. */
export function LegacyAdminEventLayoutsRedirect() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  if (next.has("review")) next.set("view", "review");
  else if (!isWorkspaceView(next.get("view"))) next.set("view", "review");
  return <Navigate replace to={{ pathname: "/admin-dashboard/events", search: `?${next.toString()}` }} />;
}
