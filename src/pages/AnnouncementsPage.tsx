import { useState, useEffect } from "react";
import { Bell, AlertTriangle, Filter, Search, Circle, Megaphone, ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AnnouncementCard } from "../components/ui/AnnouncementCard";
import { SearchBar } from "../components/ui/SearchBar";
import { MOCK_ANNOUNCEMENTS } from "../data/mockData";
import { SkeletonList } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { cn } from "../lib/utils";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "academic", label: "Academic" },
  { value: "event", label: "Events" },
  { value: "emergency", label: "Emergency" },
  { value: "maintenance", label: "Maintenance" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-yellow-500",
  normal: "text-blue-500",
  low: "text-slate-400",
};

const PRIORITIES = [
  { value: "all", label: "All Priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];export function AnnouncementsPage() {
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");

  const activeFilterCount = (category !== "all" ? 1 : 0) + (priority !== "all" ? 1 : 0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  if (loading) return <SkeletonList count={5} />;

  const urgent = MOCK_ANNOUNCEMENTS.filter((a) => a.priority === "urgent");
  const filtered = MOCK_ANNOUNCEMENTS.filter((a) => {
    const matchCat = category === "all" || a.category === category;
    const matchPri = priority === "all" || a.priority === priority;
    const matchSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase()) ||
      a.author.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchPri && matchSearch;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">Announcements</h1>
            <p className="text-muted-foreground text-sm">Official notices, events, and updates from PLV.</p>
          </div>
        </div>
      </div>

      {/* Urgent alerts */}
      {urgent.length > 0 && (
        <div className="mb-7 rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4 animate-scale-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="font-extrabold text-destructive text-sm">Urgent Announcements</h2>
          </div>
          <div className="space-y-2.5">
            {urgent.map((a) => <AnnouncementCard key={a.id} announcement={a} />)}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-6 space-y-3">
        <div className="max-w-sm">
          <SearchBar
            placeholder="Search announcements..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            showShortcutHint
            size="md"
          />
        </div>

        {/* Desktop: inline chips | Mobile: collapsible filter button + bottom sheet */}
        <div className="hidden md:block">
          <div className="flex flex-wrap gap-1.5 items-center">
            <Filter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
            {CATEGORIES.map(({ value, label }) => (
              <button key={value} onClick={() => setCategory(value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  category === value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {PRIORITIES.map(({ value, label }) => (
              <button key={value} onClick={() => setPriority(value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5",
                  priority === value ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                )}>
                {value !== "all" && <Circle className={cn("h-2.5 w-2.5 fill-current", PRIORITY_COLORS[value])} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile: compact filter toggle */}
        <div className="md:hidden">
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted transition-all w-full"
          >
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground">Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", filtersOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {filtersOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mt-2"
              >
                <div className="space-y-2 pb-1">
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map(({ value, label }) => (
                      <button key={value} onClick={() => setCategory(value)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          category === value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                        )}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRIORITIES.map(({ value, label }) => (
                      <button key={value} onClick={() => setPriority(value)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5",
                          priority === value ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground"
                        )}>
                        {value !== "all" && <Circle className={cn("h-2.5 w-2.5 fill-current", PRIORITY_COLORS[value])} />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Showing <span className="font-bold text-foreground">{filtered.length}</span> announcement{filtered.length !== 1 ? "s" : ""}
      </p>

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((a, i) => (
            <div key={a.id} className="animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <AnnouncementCard announcement={a} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={(search || category !== "all" || priority !== "all") ? Search : Megaphone}
          title={(search || category !== "all" || priority !== "all") ? "No matching announcements" : "No announcements yet"}
          description={(search || category !== "all" || priority !== "all")
            ? "We couldn't find any announcements matching your search or filters. Try different keywords or adjust the filters above."
            : "There are no announcements at the moment. Official notices, events, and updates from PLV will appear here when posted."
          }
          action={(search || category !== "all" || priority !== "all") ? (
            <button
              onClick={() => { setSearch(""); setCategory("all"); setPriority("all"); }}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-sm"
            >
              Clear all filters
            </button>
          ) : undefined}
        />
      )}
    </div>
  );
}
