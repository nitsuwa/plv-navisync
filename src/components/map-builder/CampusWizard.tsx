import { useState } from "react";
import { X, Upload, Accessibility, AlertTriangle, CalendarDays, Wifi, MapPin, FileText } from "lucide-react";
import { cn } from "../../lib/utils";
import { CANVAS_SIZES } from "./constants";
import type { Campus, CampusSettings } from "./types";
import { genId } from "./constants";

interface CampusWizardProps {
  draft: Partial<Campus>;
  step: 1 | 2 | 3 | 4 | 5;
  onNext: (data: Partial<Campus>) => void;
  onBack: () => void;
  onFinish: (campus: Campus) => void;
  onClose: () => void;
}

export function CampusWizard({ draft, step, onNext, onBack, onFinish, onClose }: CampusWizardProps) {
  // Step 1: Name & Code
  const [name, setName] = useState(draft.name ?? "");
  const [code, setCode] = useState(draft.code ?? "");
  // Step 2: Description
  const [desc, setDesc] = useState(draft.description ?? "");
  // Step 3: Location
  const [address, setAddress] = useState(draft.address ?? "");
  // Step 4: Map Size
  const [sizeId, setSizeId] = useState("medium");
  const [custW, setCustW] = useState("900");
  const [custH, setCustH] = useState("680");
  // Step 5: Settings
  const [s, setS] = useState<CampusSettings>(
    draft.settings ?? { accessibility: true, emergency: true, eventLayer: false, gps: false }
  );

  const selSize = CANVAS_SIZES.find((c) => c.id === sizeId)!;
  const canvasW = sizeId === "custom" ? parseInt(custW) || 900 : selSize.w;
  const canvasH = sizeId === "custom" ? parseInt(custH) || 680 : selSize.h;
  const aspectW = Math.round((canvasW / Math.max(canvasW, canvasH)) * 180);
  const aspectH = Math.round((canvasH / Math.max(canvasW, canvasH)) * 130);

  const stepTitles = ["Campus Details", "Description", "Location", "Map Size", "Settings"];

  const inputCls =
    "w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-scale-in flex flex-col"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-extrabold text-foreground text-base" style={{ fontFamily: "var(--font-sans)" }}>
              {stepTitles[step - 1]}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "var(--font-body)" }}>
              Step {step} of 5
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted shrink-0">
          <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${(step / 5) * 100}%` }} />
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center gap-1 px-6 py-2 shrink-0">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                s === step ? "w-6 bg-primary" : s < step ? "w-3 bg-primary/40" : "w-3 bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-6 space-y-4">
          {/* Step 1: Name & Code */}
          {step === 1 && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="campus-name" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Campus Name *
                  </label>
                  <input id="campus-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. PLV Main Campus"
                    className={inputCls}
                    style={{ fontFamily: "var(--font-body)" }}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="campus-code" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Campus Code *
                  </label>
                  <input id="campus-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PLV-MAIN"
                    className={inputCls}
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 2: Description */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-3 mb-1">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Provide a brief description of your campus to help students understand what's here.
                </p>
              </div>
              <div>                  <label htmlFor="campus-desc" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Description
                </label>
                <textarea id="campus-desc"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={4}
                  placeholder="Describe the campus, its history, and notable features..."
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ fontFamily: "var(--font-body)" }}
                  autoFocus
                />
              </div>
            </>
          )}

          {/* Step 3: Location */}
          {step === 3 && (
            <>
              <div className="flex items-center gap-3 mb-1">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Set the physical address and location of your campus.
                </p>
              </div>
              <div>
                <label htmlFor="campus-address" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Address
                </label>
                <input id="campus-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, Province"
                  className={inputCls}
                  style={{ fontFamily: "var(--font-body)" }}
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
                <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Campus thumbnail</p>
                  <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    Upload a photo or aerial image (optional)
                  </p>
                </div>
                <button className="ml-auto text-xs font-bold text-primary hover:underline shrink-0">Upload</button>
              </div>
            </>
          )}

          {/* Step 4: Map Size */}
          {step === 4 && (
            <>
              <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                The canvas size determines how much space you have to draw your campus.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CANVAS_SIZES.map((sz) => (
                  <button
                    key={sz.id}
                    onClick={() => setSizeId(sz.id)}
                    className={cn(
                      "flex flex-col gap-1 p-3 rounded-xl border text-left transition-all",
                      sizeId === sz.id
                        ? "border-primary bg-primary/8"
                        : "border-border hover:border-primary/30 hover:bg-muted/30"
                    )}
                  >
                    <span className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
                      {sz.label}
                    </span>
                    {sz.id !== "custom" && (
                      <span className="text-[10px] font-mono text-muted-foreground">{sz.w} x {sz.h}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                      {sz.desc}
                    </span>
                  </button>
                ))}
              </div>
              {sizeId === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="campus-width" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Width (px)</label>
                    <input id="campus-width" type="number" value={custW} onChange={(e) => setCustW(e.target.value)} min={400} max={2000} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="campus-height" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Height (px)</label>
                    <input id="campus-height" type="number" value={custH} onChange={(e) => setCustH(e.target.value)} min={300} max={1500} className={inputCls} />
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col items-center gap-3">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Canvas Preview</p>
                <div className="flex items-center justify-center" style={{ height: 140 }}>
                  <div
                    className="rounded border-2 border-primary/40 bg-[#f0eeea] flex items-center justify-center"
                    style={{ width: Math.max(aspectW, 60), height: Math.max(aspectH, 40) }}
                  >
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {canvasW}x{canvasH}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 5: Settings */}
          {step === 5 && (
            <>
              <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                These settings control which features are available for this campus. They can be changed later.
              </p>
              {([
                { key: "accessibility" as const, icon: Accessibility, label: "Accessibility Features", desc: "Wheelchair routes, accessible entrances, and ramps" },
                { key: "emergency" as const, icon: AlertTriangle, label: "Emergency Layer", desc: "Evacuation routes, assembly areas, first aid locations" },
                { key: "eventLayer" as const, icon: CalendarDays, label: "Event Layer", desc: "Temporary event markers and overlays" },
                { key: "gps" as const, icon: Wifi, label: "GPS Coordinates", desc: "Enable real-world latitude/longitude on markers" },
              ] as const).map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">{label}</p>
                      <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                        {desc}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setS((prev) => ({ ...prev, [key]: !prev[key] }))}
                    aria-pressed={s[key]}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors shrink-0",
                      s[key] ? "bg-primary" : "bg-muted-foreground/25"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                        s[key] ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button
            onClick={onBack}
            className="h-10 px-4 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 5 ? (
            <button
              onClick={() => {
                const data: Partial<Campus> =
                  step === 1 ? { name, code } :
                  step === 2 ? { description: desc } :
                  step === 3 ? { address } :
                  { canvasW, canvasH };
                onNext({ ...draft, ...data });
              }}
              disabled={step === 1 && (!name.trim() || !code.trim())}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={() => {
                const newCampus: Campus = {
                  id: genId("campus"),
                  name: draft.name!,
                  code: draft.code!,
                  description: draft.description ?? "",
                  address: draft.address ?? "",
                  status: "active",
                  publishStatus: "draft",
                  canvasW: draft.canvasW ?? 900,
                  canvasH: draft.canvasH ?? 680,
                  settings: s,
                  buildings: [],
                  markers: [],
                  paths: [],
                  createdAt: new Date().toISOString().slice(0, 10),
                  updatedAt: new Date().toISOString().slice(0, 10),
                };
                onFinish(newCampus);
              }}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors"
            >
              Create Campus
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
