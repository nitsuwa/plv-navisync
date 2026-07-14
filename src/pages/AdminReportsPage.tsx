import { useState, useEffect } from "react";
import {
  Flag, MapPin, Clock, CheckCircle2, XCircle, AlertCircle,
  Search, Eye, ExternalLink, ChevronDown, Image, Filter,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Link } from "react-router";
import { ReportsSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";

// ── Mock report data ───────────────────────────────────────────────────────
type ReportStatus = "pending" | "investigating" | "approved" | "rejected" | "resolved";

interface CampusReport {
  id: string;
  type: string;
  building: string;
  locationDetail: string;
  description: string;
  reporter: string;
  date: string;
  status: ReportStatus;
  hasImage: boolean;
}

const MOCK_REPORTS: CampusReport[] = [
  { id:"rpt1", type:"Broken Elevator",    building:"ADM Building",    locationDetail:"2nd Floor near south wing",        description:"Elevator has been stuck at 2F since Monday. Door opens and closes but doesn't move.",        reporter:"student_2023001", date:"Jan 15, 2025", status:"investigating", hasImage:true  },
  { id:"rpt2", type:"Blocked Walkway",    building:"Near Library",    locationDetail:"Main walkway between LRC and MAB",  description:"Construction materials are blocking the main path between the library and main academic building.", reporter:"student_2023045", date:"Jan 14, 2025", status:"pending",       hasImage:false },
  { id:"rpt3", type:"Broken Light",       building:"MAB",             locationDetail:"Ground floor hallway, east wing",   description:"Three ceiling lights out on the entire ground floor east corridor. Very dark at night.",           reporter:"student_2023102", date:"Jan 13, 2025", status:"approved",      hasImage:true  },
  { id:"rpt4", type:"Inaccessible Ramp",  building:"ELB",             locationDetail:"Main entrance ramp",                description:"The wheelchair ramp at the ELB main entrance has a broken guard rail and uneven surface.",          reporter:"student_2022078", date:"Jan 12, 2025", status:"resolved",      hasImage:true  },
  { id:"rpt5", type:"Flooded Area",       building:"Gymnasium",       locationDetail:"South entrance pathway",            description:"Heavy rain caused flooding near the GYM south entrance. Water is about ankle deep.",               reporter:"student_2023210", date:"Jan 10, 2025", status:"resolved",      hasImage:false },
  { id:"rpt6", type:"Incorrect Room Name",building:"MAB",             locationDetail:"Room 302, 3rd Floor",               description:"Room 302 is labeled as Computer Lab but it was converted to a faculty lounge last semester.",       reporter:"student_2023089", date:"Jan 9, 2025",  status:"pending",       hasImage:false },
  { id:"rpt7", type:"Safety Hazard",      building:"ELB",             locationDetail:"Workshop area, Ground Floor",       description:"Exposed wiring near the electrical workshop. Should be reported to maintenance urgently.",            reporter:"student_2022156", date:"Jan 8, 2025",  status:"investigating", hasImage:true  },
  { id:"rpt8", type:"Facility Problem",   building:"SSC",             locationDetail:"Student Council area, 1st Floor",  description:"Air conditioning unit leaking water onto the floor creating a slip hazard.",                        reporter:"student_2023334", date:"Jan 7, 2025",  status:"rejected",      hasImage:false },
];

const STATUS_CONFIG: Record<ReportStatus, { label:string; color:string; bg:string; icon:React.ElementType }> = {
  pending:       { label:"Pending Review",    color:"text-amber-600 dark:text-amber-400",   bg:"bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30",   icon:Clock         },
  investigating: { label:"Under Investigation",color:"text-blue-600 dark:text-blue-400",    bg:"bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30",       icon:AlertCircle   },
  approved:      { label:"Approved",          color:"text-primary",                         bg:"bg-primary/8 border-primary/20",                                                icon:CheckCircle2  },
  rejected:      { label:"Rejected",          color:"text-destructive",                     bg:"bg-destructive/8 border-destructive/20",                                        icon:XCircle       },
  resolved:      { label:"Resolved",          color:"text-green-600 dark:text-green-400",   bg:"bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30",   icon:CheckCircle2  },
};

const STATUS_OPTIONS: ReportStatus[] = ["pending","investigating","approved","rejected","resolved"];

const ISSUE_TYPES = ["All Types","Broken Light","Flooded Area","Damaged Property","Blocked Walkway","Safety Hazard","Facility Problem","Broken Elevator","Inaccessible Ramp","Incorrect Room Name","Other"];

// ── Detail modal ───────────────────────────────────────────────────────────
function ReportDetailModal({ report, onClose, onStatusChange }: {
  report: CampusReport;
  onClose: () => void;
  onStatusChange: (id: string, s: ReportStatus) => void;
}) {
  const cfg = STATUS_CONFIG[report.status];
  const Icon = cfg.icon;
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Flag className="h-4 w-4 text-destructive"/>
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-sm" style={{ fontFamily:"var(--font-sans)" }}>
                {report.type}
              </h3>
              <p className="text-[11px] text-muted-foreground">Report #{report.id}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground">
            <XCircle className="h-4 w-4"/>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status badge */}
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold w-fit", cfg.bg, cfg.color)}>
            <Icon className="h-4 w-4"/> {cfg.label}
          </div>

          {/* Location */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-muted/60 border border-border">
            <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0"/>
            <div>
              <p className="text-xs font-bold text-foreground">{report.building}</p>
              <p className="text-xs text-muted-foreground">{report.locationDetail}</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">Description</p>
            <p className="text-sm text-foreground leading-relaxed" style={{ fontFamily:"var(--font-body)" }}>
              {report.description}
            </p>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2.5 rounded-xl bg-muted/50">
              <p className="text-[10px] text-muted-foreground mb-0.5">Reporter</p>
              <p className="text-xs font-bold text-foreground">{report.reporter}</p>
            </div>
            <div className="px-3 py-2.5 rounded-xl bg-muted/50">
              <p className="text-[10px] text-muted-foreground mb-0.5">Submitted</p>
              <p className="text-xs font-bold text-foreground">{report.date}</p>
            </div>
          </div>

          {/* Image placeholder */}
          {report.hasImage && (
            <div className="h-32 rounded-xl bg-muted border border-border flex flex-col items-center justify-center gap-2">
              <Image className="h-6 w-6 text-muted-foreground/50"/>
              <p className="text-xs text-muted-foreground">Photo attached · View in full report</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-5">
          <Link to="/map"
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
            <ExternalLink className="h-3.5 w-3.5"/> View on Map
          </Link>
          <Link to="/admin/map-builder"
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors">
            <MapPin className="h-3.5 w-3.5"/> Fix in Map Builder
          </Link>
          <div className="relative ml-auto">
            <button onClick={() => setShowStatusMenu(v => !v)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
              Change Status <ChevronDown className="h-3 w-3"/>
            </button>
            {showStatusMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10 min-w-[180px] animate-scale-in">
                {STATUS_OPTIONS.filter(s => s !== report.status).map(s => {
                  const c = STATUS_CONFIG[s];
                  const I = c.icon;
                  return (
                    <button key={s} onClick={() => { onStatusChange(report.id, s); setShowStatusMenu(false); onClose(); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted transition-colors text-left">
                      <I className={cn("h-3.5 w-3.5 shrink-0", c.color)}/>
                      <span className="text-xs font-semibold text-foreground">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function AdminReportsPage() {
  const [reports, setReports] = useState<CampusReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ReportStatus|"all">("all");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CampusReport|null>(null);
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setReports(MOCK_REPORTS);
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  const handleStatusChange = (id: string, status: ReportStatus) => {
    setReports(prev => prev.map(r => r.id === id ? {...r, status} : r));
    const cfg = STATUS_CONFIG[status];
    toast.success(`Report ${cfg.label.toLowerCase()}`, "Status has been updated successfully.");
  };

  const counts: Record<string, number> = {
    all: reports.length,
    pending: reports.filter(r => r.status === "pending").length,
    investigating: reports.filter(r => r.status === "investigating").length,
    approved: reports.filter(r => r.status === "approved").length,
    rejected: reports.filter(r => r.status === "rejected").length,
    resolved: reports.filter(r => r.status === "resolved").length,
  };

  const filtered = reports.filter(r => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchType   = typeFilter === "All Types" || r.type === typeFilter;
    const matchSearch = !search ||
      r.building.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchType && matchSearch;
  });

  const tabs: { key: ReportStatus|"all"; label: string }[] = [
    { key:"all",           label:"All" },
    { key:"pending",       label:"Pending" },
    { key:"investigating", label:"Investigating" },
    { key:"resolved",      label:"Resolved" },
  ];

  if (loading) return <ReportsSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground" style={{ fontFamily:"var(--font-sans)" }}>
            Student Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5" style={{ fontFamily:"var(--font-body)" }}>
            Review and resolve campus issues reported by students. Reports help keep the navigation system accurate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {counts.pending > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"/>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{counts.pending} pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:"Total Reports",    value:counts.all,           color:"text-foreground",                          bg:"bg-muted/50"          },
          { label:"Pending Review",   value:counts.pending,       color:"text-amber-600 dark:text-amber-400",        bg:"bg-amber-50 dark:bg-amber-900/15" },
          { label:"Investigating",    value:counts.investigating,  color:"text-blue-600 dark:text-blue-400",          bg:"bg-blue-50 dark:bg-blue-900/15"   },
          { label:"Resolved",         value:counts.resolved,       color:"text-green-600 dark:text-green-400",        bg:"bg-green-50 dark:bg-green-900/15" },
        ].map(c => (
          <div key={c.label} className={cn("rounded-2xl border border-border p-4", c.bg)}>
            <p className={cn("text-2xl font-extrabold", c.color)}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily:"var(--font-body)" }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-border">
          {/* Status tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setStatusFilter(t.key)}
                className={cn("shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold transition-all",
                  statusFilter === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {t.label}
                <span className={cn("text-[10px] px-1.5 rounded-full font-extrabold",
                  statusFilter === t.key ? "bg-white/20" : "bg-muted text-foreground")}>
                  {counts[t.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            {/* Type filter */}
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ fontFamily:"var(--font-body)" }}>
              {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"/>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search reports…"
                className="h-9 pl-8 pr-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 w-40"
                style={{ fontFamily:"var(--font-body)" }}/>
            </div>
          </div>
        </div>

        {/* Reports table */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Filter className="h-8 w-8 text-muted-foreground/30"/>
            <p className="text-sm font-bold text-muted-foreground">No reports match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(report => {
              const cfg = STATUS_CONFIG[report.status];
              const StatusIcon = cfg.icon;
              return (
                <div key={report.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors group">
                  {/* Type icon */}
                  <div className="w-9 h-9 rounded-xl bg-destructive/8 flex items-center justify-center shrink-0 mt-0.5">
                    <Flag className="h-4 w-4 text-destructive"/>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-bold text-foreground">{report.type}</span>
                      {report.hasImage && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                          <Image className="h-2.5 w-2.5"/> Photo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <MapPin className="h-3 w-3 text-primary shrink-0"/>
                      <span className="truncate">{report.building} · {report.locationDetail}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1" style={{ fontFamily:"var(--font-body)" }}>
                      {report.description}
                    </p>
                  </div>

                  {/* Status + meta */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold", cfg.bg, cfg.color)}>
                      <StatusIcon className="h-2.5 w-2.5"/>
                      {cfg.label}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{report.date}</span>
                    <button onClick={() => setSelected(report)}
                      className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="h-3 w-3"/> View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <ReportDetailModal
          report={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
