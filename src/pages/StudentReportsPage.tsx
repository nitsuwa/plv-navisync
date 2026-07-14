import { useEffect, useState } from "react";
import {
  Flag, MapPin, Clock, CheckCircle2, AlertCircle, X, ChevronRight,
  Search, Filter, MessageCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { StudentPageHeader } from "../components/ui/StudentPageHeader";
import { PageTransition } from "../components/ui/PageTransition";
import { EmptyState } from "../components/ui/EmptyState";
import { cn } from "../lib/utils";

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
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  if (!studentAuth) {
    navigate("/admin");
    return null;
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
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search reports by type, building, or location..."
                  className="w-full h-11 pl-10 pr-4 rounded-2xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
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
                        : "bg-muted text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {s === "all" ? "All" : REPORT_STATUS[s]?.label ?? s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {filtered.length === 0 && MY_REPORTS.length === 0 ? (
            <EmptyState
              icon={Flag}
              title="No reports submitted yet"
              description="Report campus issues from the map or Help Center."
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
            <div className="text-center py-16">
              <p className="text-sm text-muted-foreground">No reports match your filters.</p>
              <button onClick={() => { setFilter("all"); setSearch(""); }} className="text-primary font-bold hover:underline mt-2 text-sm">
                Clear filters
              </button>
            </div>
          ) : (
            <AnimatePresence>
              <div className="space-y-4">
                {filtered.map((r, i) => {
                  const st = REPORT_STATUS[r.status];
                  const StatusIcon = st.icon;

                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="surface-card rounded-2xl overflow-hidden"
                    >
                      {/* Header */}
                      <div className="px-5 pt-4 pb-3 border-b border-border">
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
                              {r.building} · {r.location}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{r.date}</p>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="px-5 py-3 border-b border-border bg-muted/40">
                        <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                      </div>

                      {/* Timeline */}
                      {r.updates && r.updates.length > 0 && (
                        <div className="px-5 py-4 border-b border-border">
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
                      <div className="px-5 py-4">
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
                      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                        <Link to="/map" className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                          View on map <ChevronRight className="h-3 w-3" />
                        </Link>
                        {r.status === "resolved" && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Resolved
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>
          )}
        </div>
        {/* Safe area spacer for bottom nav */}
        <div className="h-6 md:hidden" />
      </div>
    </PageTransition>
  );
}
