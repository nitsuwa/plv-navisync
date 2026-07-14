import { useState } from "react";
import { Bell, AlertTriangle, Filter, Search } from "lucide-react";
import { AnnouncementCard } from "../components/ui/AnnouncementCard";
import { MOCK_ANNOUNCEMENTS } from "../data/mockData";
import { cn } from "../lib/utils";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "academic", label: "Academic" },
  { value: "event", label: "Events" },
  { value: "emergency", label: "Emergency" },
  { value: "maintenance", label: "Maintenance" },
];

const PRIORITIES = [
  { value: "all", label: "All Priorities" },
  { value: "urgent", label: "🔴 Urgent" },
  { value: "high", label: "🟡 High" },
  { value: "normal", label: "🔵 Normal" },
  { value: "low", label: "⚪ Low" },
];

export function AnnouncementsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");

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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements..."
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
          />
        </div>

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

        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map(({ value, label }) => (
            <button key={value} onClick={() => setPriority(value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                priority === value ? "border-primary bg-primary/8 text-primary font-bold" : "border-border text-muted-foreground hover:border-primary/30"
              )}>
              {label}
            </button>
          ))}
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
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground">No announcements found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filter.</p>
          <button onClick={() => { setSearch(""); setCategory("all"); setPriority("all"); }} className="text-sm text-primary font-bold hover:underline">
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
