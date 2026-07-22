import { useEffect, useState } from "react";
import {
  Flag, MapPin, Clock, CheckCircle2, AlertCircle, X, ChevronRight,
  Search, Filter, MessageCircle, Sparkles,
} from "lucide-react";
import { SearchBar } from "../components/ui/SearchBar";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { cn } from "../lib/utils";

// ═════════════════════════════════════════════════════════════════════════════
// ── Scroll-reveal wrapper ───────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function Reveal({ children, className, delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? "translateY(0)" : "translateY(24px)",
      transition: visible
        ? `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`
        : "opacity 0.3s ease, transform 0.3s ease",
    }}>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Section label ───────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-extrabold uppercase tracking-widest mb-4">
      <Sparkles className="h-3 w-3" />
      {children}
    </div>
  );
}

type ReportStatus = "pending" | "investigating" | "resolved" | "rejected";
type FilterStatus = "all" | ReportStatus;

interface Report {
  id: string;
  type: string;
  building: string;
  location: string;
  description: string;
  date: string;
  status: ReportStatus;
  updates?: { date: string; text: string }[];
}

const REPORT_STATUS: Record<ReportStatus, {
  label: string; color: string; bg: string; icon: typeof Flag; step: number;
}> = {
  pending:       { label: "Pending",       color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50/80 dark:bg-amber-900/20 border-amber-200/60 dark:border-amber-800/30",  icon: Clock,        step: 1 },
  investigating: { label: "Under Review",  color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50/80 dark:bg-blue-900/20 border-blue-200/60 dark:border-blue-800/30",      icon: AlertCircle,  step: 2 },
  resolved:      { label: "Resolved",      color: "text-green-600 dark:text-green-400",  bg: "bg-green-50/80 dark:bg-green-900/20 border-green-200/60 dark:border-green-800/30",  icon: CheckCircle2, step: 3 },
  rejected:      { label: "Rejected",      color: "text-destructive",                    bg: "bg-destructive/5 border-destructive/20",                                       icon: X,            step: 3 },
};

const STEPS = ["Submitted", "Under Review", "Resolved"];

const MY_REPORTS: Report[] = [
  {
    id: "rpt1",
    type: "Broken Elevator",
    building: "ADM Building",
    location: "Ground Floor, near main lobby",
    description: "The elevator near the main lobby has been out of service since Monday. There is no signage directing students to the alternate entrance.",
    date: "January 15, 2025",
    status: "investigating",
    updates: [
      { date: "Jan 16", text: "Maintenance team has been notified and is assessing the issue." },
      { date: "Jan 14", text: "Report submitted and logged in the system." },
    ],
  },
  {
    id: "rpt2",
    type: "Blocked Walkway",
    building: "Near Library",
    location: "North pathway between LRC and MAB",
    description: "Construction materials are blocking the main pathway between the library and the main academic building.",
    date: "January 10, 2025",
    status: "resolved",
    updates: [
      { date: "Jan 12", text: "Construction materials have been cleared. Pathway is now accessible." },
      { date: "Jan 11", text: "Campus maintenance notified of the obstruction." },
    ],
  },
  {
    id: "rpt3",
    type: "Facility Problem",
    building: "SSC Building",
    location: "SSC Main Hall",
    description: "Ceiling fan in the main hall has been making loud grinding noises and wobbles visibly.",
    date: "January 5, 2025",
    status: "pending",
  },
];

export function StudentReportsPage() {
  const studentAuth = useStudentAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!studentAuth) {
    navigate("/admin");
    return null;
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <div className="max-w-2xl mx-auto px-5 py-6 space-y-4">
            {/* Header skeleton */}
            <div className="flex items-center gap-4 mb-6">
              <Skeleton variant="avatar" className="h-12 w-12" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            {/* Search skeleton */}
            <Skeleton className="h-11 w-full rounded-2xl" />
            {/* Filter pills */}
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-16 rounded-xl" />
              ))}
            </div>
            {/* Report cards */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-6 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  const filtered = MY_REPORTS.filter(r => {
    const matchFilter = filter === "all" || r.status === filter;
    const q = search.toLowerCase().trim();
    const matchSearch = !q ||
      r.type.toLowerCase().includes(q) ||
      r.building.toLowerCase().includes(q) ||
      r.location.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  return (
    <PageTransition>
      <div className="min-h-screen">
        <StudentPageHeader
          backTo="/student"
          title="My Reports"
          subtitle={`${MY_REPORTS.length} submitted ${MY_REPORTS.length === 1 ? "report" : "reports"}`}
          icon={Flag}
          iconBg="color-mix(in srgb, #f59e0b 14%, transparent)"
          iconColor="#d97706"
          action={
            <Link
              to="/help"
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold bg-primary text-primary-foreground shadow-sm shadow-primary/20 shrink-0 hover:brightness-110 transition-all"
            >
              <Flag className="h-3.5 w-3.5" />
              New Report
            </Link>
          }
        />

        <div className="max-w-2xl mx-auto px-5 py-6 space-y-4">
          {/* Search + Filter */}
          {MY_REPORTS.length > 0 && (
            <Reveal>
              <div className="space-y-3">
                <SectionLabel>Submitted Reports</SectionLabel>

                <div className="max-w-sm">
                  <SearchBar
                    placeholder="Search reports by type, building, or location..."
                    value={search}
                    onSearch={setSearch}
                    onClear={() => setSearch("")}
                    size="md"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {(["all", "pending", "investigating", "resolved", "rejected"] as FilterStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className={cn(
                        "shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                        filter === s
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted-foreground/10"
                      )}
                    >
                      {s === "all" ? "All" : REPORT_STATUS[s]?.label ?? s}
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>
          )}

          {filtered.length === 0 && MY_REPORTS.length === 0 ? (
            <EmptyState
              icon={Flag}
              title="No reports yet"
              description="Report campus issues from the map or Help Center to get started."
              action={
                <Link
                  to="/help"
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.97] transition-all"
                >
                  Go to Help Center
                </Link>
              }
            />
          ) : filtered.length === 0 ? (
            <Reveal>
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">No reports match your filters</p>
                <button onClick={() => { setFilter("all"); setSearch(""); }} className="text-xs font-bold text-primary hover:underline mt-1">
                  Clear all filters
                </button>
              </div>
            </Reveal>
          ) : (
            <AnimatePresence>
              <div className="space-y-4">
                {filtered.map((r, i) => {
                  const st = REPORT_STATUS[r.status];
                  const StatusIcon = st.icon;

                  return (
                    <Reveal key={r.id} delay={i * 40}>
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
                      >
                        {/* Header */}
                        <div className="px-5 pt-4 pb-3 border-b border-border/50">
                          <div className="flex items-start gap-3">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", st.bg)}>
                              <StatusIcon className={cn("h-4.5 w-4.5", st.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-extrabold text-foreground">{r.type}</p>
                                <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 whitespace-nowrap", st.bg, st.color)}>
                                  <StatusIcon className="h-2.5 w-2.5" />
                                  {st.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 text-primary shrink-0" />
                                {r.building} &middot; {r.location}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{r.date}</p>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <div className="px-5 py-3 border-b border-border/50 bg-muted/20">
                          <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                        </div>

                        {/* Updates timeline */}
                        {r.updates && r.updates.length > 0 && (
                          <div className="px-5 py-4 border-b border-border/50">
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                              <MessageCircle className="h-3 w-3" /> Updates
                            </p>
                            <div className="space-y-3">
                              {r.updates.map((u, idx) => (
                                <div key={idx} className="flex gap-3">
                                  <div className="flex flex-col items-center">
                                    <div className={cn(
                                      "w-2.5 h-2.5 rounded-full border-2 mt-1",
                                      idx === 0 ? "bg-primary border-primary" : "bg-muted border-border"
                                    )} />
                                    {idx < r.updates!.length - 1 && (
                                      <div className="w-px flex-1 bg-border mt-1" />
                                    )}
                                  </div>
                                  <div className="flex-1 pb-1">
                                    <p className="text-[11px] font-bold text-foreground">{u.text}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{u.date}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Status progress */}
                        <div className="px-5 py-4 border-b border-border/50">
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-3">
                            Status Progress
                          </p>
                          <div className="flex items-center gap-0">
                            {STEPS.map((s, idx) => {
                              const active = idx < st.step;
                              const current = idx === st.step - 1;
                              const last = idx === STEPS.length - 1;
                              return (
                                <div key={s} className="flex items-center flex-1 min-w-0">
                                  <div className="flex flex-col items-center shrink-0">
                                    <div
                                      className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all"
                                      style={{
                                        borderColor: active ? "var(--primary)" : "var(--border)",
                                        background: active ? "var(--primary)" : "var(--card)",
                                      }}
                                    >
                                      {active
                                        ? <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />
                                        : <div className="w-2 h-2 rounded-full bg-border" />
                                      }
                                    </div>
                                    <span
                                      className="text-[9px] font-bold mt-1.5 text-center whitespace-nowrap"
                                      style={{ color: current ? "var(--primary)" : active ? "var(--foreground)" : "var(--muted-foreground)" }}
                                    >
                                      {s}
                                    </span>
                                  </div>
                                  {!last && (
                                    <div
                                      className="flex-1 h-0.5 mx-1 -mt-4 transition-all"
                                      style={{ background: idx < st.step - 1 ? "var(--primary)" : "var(--border)" }}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 flex items-center justify-between bg-muted/10">
                          <Link to="/map" className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline group">
                            View on map <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                          {r.status === "resolved" && (
                            <span className="text-[10px] text-green-600 dark:text-green-400 font-bold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Resolved
                            </span>
                          )}
                        </div>
                      </motion.div>
                    </Reveal>
                  );
                })}
              </div>
            </AnimatePresence>
          )}
        </div>
        {/* Safe area spacer */}
        <div className="h-6 md:hidden" />
      </div>
    </PageTransition>
  );
}
