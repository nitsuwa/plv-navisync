import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Accessibility, CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";
import { MOCK_BUILDINGS } from "../data/mockData";
import { cn } from "../lib/utils";
import { SPRING, DURATION } from "../config/animation";

// ── Data ──────────────────────────────────────────────────────────────────
interface BuildingA11y {
  buildingId: string;
  wheelchairRamp: boolean;
  elevator: boolean;
  accessibleRestroom: boolean;
  rampMeetsStandards: boolean;
  notes: string;
}

const INITIAL: BuildingA11y[] = [
  { buildingId:"b1", wheelchairRamp:true,  elevator:false, accessibleRestroom:true,  rampMeetsStandards:true,  notes:"Elevator under maintenance since Dec 2024." },
  { buildingId:"b2", wheelchairRamp:true,  elevator:true,  accessibleRestroom:true,  rampMeetsStandards:true,  notes:"Fully compliant. Accessible parking near north entrance." },
  { buildingId:"b3", wheelchairRamp:true,  elevator:false, accessibleRestroom:true,  rampMeetsStandards:false, notes:"Ramp at south entrance has minor surface cracks. Needs repair." },
  { buildingId:"b4", wheelchairRamp:false, elevator:false, accessibleRestroom:false, rampMeetsStandards:false, notes:"No accessibility features. Recommend adding ramp at main entrance." },
  { buildingId:"b5", wheelchairRamp:true,  elevator:false, accessibleRestroom:true,  rampMeetsStandards:true,  notes:"Level entry throughout. No elevator needed (single-story main floor)." },
  { buildingId:"b6", wheelchairRamp:true,  elevator:false, accessibleRestroom:false, rampMeetsStandards:true,  notes:"Accessible restroom under renovation." },
];

const FEATURES: { key: keyof Omit<BuildingA11y,"buildingId"|"notes">; label: string; short: string }[] = [
  { key:"wheelchairRamp",     label:"Wheelchair Ramp",  short:"Ramp"     },
  { key:"elevator",           label:"Elevator Working", short:"Elevator" },
  { key:"accessibleRestroom", label:"Accessible CR",    short:"CR"       },
  { key:"rampMeetsStandards", label:"Ramp Standard",    short:"Standard" },
];

function score(b: BuildingA11y) { return FEATURES.filter(f => b[f.key]).length; }
function levelOf(s: number): "good" | "partial" | "poor" {
  return s >= 3 ? "good" : s >= 1 ? "partial" : "poor";
}
const LEVEL_STYLE = {
  good:    { bar:"bg-green-500", text:"text-green-600 dark:text-green-400", bg:"bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-800/30", label:"Compliant"   },
  partial: { bar:"bg-amber-500", text:"text-amber-600 dark:text-amber-400", bg:"bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800/30", label:"Partial"     },
  poor:    { bar:"bg-red-500",   text:"text-destructive",                   bg:"bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800/30",         label:"Needs Work"  },
};

// ── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Disable feature" : "Enable feature"}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
        on ? "bg-green-500 shadow-md shadow-green-500/20" : "bg-gray-200 dark:bg-gray-700"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white shadow-md transition-all duration-300 ease-in-out",
          on ? "left-[22px]" : "left-[2px]"
        )}
      />
    </button>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function EditModal({ data, buildingName, onSave, onClose }: {
  data: BuildingA11y; buildingName: string;
  onSave: (d: BuildingA11y) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<BuildingA11y>(data);
  const set = (k: keyof BuildingA11y, v: any) => setForm(p => ({...p, [k]:v}));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit accessibility">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-extrabold text-foreground text-sm">
              Edit Accessibility
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {buildingName}
            </p>
          </div>
          <button type="button" aria-label="Close modal" onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary active:scale-90 transition-all text-muted-foreground">
            <X className="h-4 w-4"/>
          </button>
        </div>

        {/* Toggles */}
        <div className="p-6 space-y-3 overflow-y-auto scrollbar-show-on-hover" style={{ maxHeight: "calc(80vh - 180px)" }}>
          {FEATURES.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-4 py-2.5 px-4 rounded-xl border border-border bg-muted/30">
              <div>
                <p className="text-sm font-bold text-foreground">{f.label}</p>
              </div>
              <Toggle on={form[f.key]} onChange={v => set(f.key, v)}/>
            </div>
          ))}

          {/* Notes */}
          <div className="pt-1">
            <label htmlFor="accessibility-notes" className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5"
              style={{ fontFamily:"var(--font-body)" }}>
              Notes
            </label>
            <textarea id="accessibility-notes"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={2}
              placeholder="Any known issues or special notes…"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200"
              style={{ fontFamily:"var(--font-body)", color:"var(--foreground)" }}/>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted active:scale-[0.97] transition-all">
            Cancel
          </button>
          <button onClick={() => { onSave(form); onClose(); }}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 active:scale-[0.97] transition-all">
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function AdminAccessibilityPage() {
  const [data, setData] = useState<BuildingA11y[]>(INITIAL);
  const [editing, setEditing] = useState<BuildingA11y|null>(null);

  const save = (updated: BuildingA11y) =>
    setData(prev => prev.map(b => b.buildingId === updated.buildingId ? updated : b));

  const compliant = data.filter(b => levelOf(score(b)) === "good").length;
  const partial   = data.filter(b => levelOf(score(b)) === "partial").length;
  const poor      = data.filter(b => levelOf(score(b)) === "poor").length;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">
          Accessibility
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage campus building accessibility features. This data powers Accessible Mode routing in the student app.
        </p>
      </div>

      {/* Summary bar */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-foreground">
            Campus Compliance
          </p>
          <p className="text-xs text-muted-foreground">
            {data.length} buildings total
          </p>
        </div>
        {/* Segmented bar */}
        <div className="h-3 rounded-full overflow-hidden flex gap-0.5 mb-4">
          <div className="bg-green-500 rounded-l-full transition-all" style={{ width:`${(compliant/data.length)*100}%` }}/>
          <div className="bg-amber-500 transition-all" style={{ width:`${(partial/data.length)*100}%` }}/>
          <div className="bg-red-400 rounded-r-full transition-all" style={{ width:`${(poor/data.length)*100}%` }}/>
        </div>
        <div className="flex items-center gap-6">
          {[
            { label:"Compliant",  count:compliant, color:"bg-green-500" },
            { label:"Partial",    count:partial,   color:"bg-amber-500" },
            { label:"Needs Work", count:poor,      color:"bg-red-400"   },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.color}`}/>
              <span className="text-xs font-bold text-foreground">{s.count}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Building cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map(bldg => {
          const building = MOCK_BUILDINGS.find(b => b.id === bldg.buildingId);
          if (!building) return null;
          const s     = score(bldg);
          const level = levelOf(s);
          const style = LEVEL_STYLE[level];

          return (
            <div key={bldg.buildingId}
              className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow">

              {/* Card header */}
              <div className="flex items-start justify-between px-4 pt-4 pb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-foreground text-sm truncate">
                    {building.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{building.code}</p>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border ml-2 shrink-0", style.bg, style.text)}>
                  {style.label}
                </span>
              </div>

              {/* Score bar */}
              <div className="px-4 mb-3">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", style.bar)}
                    style={{ width:`${(s / FEATURES.length) * 100}%` }}/>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {s} of {FEATURES.length} features available
                </p>
              </div>

              {/* Feature chips */}
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {FEATURES.map(f => (
                  <span key={f.key}
                    className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                      bldg[f.key]
                        ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400"
                        : "bg-muted border-border text-muted-foreground/60")}>
                    {bldg[f.key]
                      ? <CheckCircle2 className="h-2.5 w-2.5"/>
                      : <XCircle className="h-2.5 w-2.5"/>}
                    {f.short}
                  </span>
                ))}
              </div>

              {/* Note */}
              {bldg.notes && (
                <div className="px-4 pb-3">
                  <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                    {bldg.notes}
                  </p>
                </div>
              )}

              {/* Edit button */}
              <div className="border-t border-border px-4 py-2.5">
                <button onClick={() => setEditing(bldg)}
                  className="w-full text-xs font-bold text-primary hover:underline text-left transition-colors">
                  Edit accessibility →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30">
        <Accessibility className="h-4 w-4 text-primary shrink-0 mt-0.5"/>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Features marked here automatically affect <strong className="text-foreground">Accessible Mode</strong> routing in the student map. Enable all features for a building to ensure wheelchair users receive reliable navigation to and through it.
        </p>
      </div>

      {/* Edit modal */}
      {editing && (
        <EditModal
          data={editing}
          buildingName={MOCK_BUILDINGS.find(b => b.id === editing.buildingId)?.name ?? "Building"}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
