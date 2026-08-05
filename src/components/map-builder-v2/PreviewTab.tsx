import { useState, useCallback } from "react";
import { motion } from "motion/react";
import {
  Search, MapPin, Navigation, ArrowRight, Building2, ChevronDown,
  Accessibility, Layers3, Eye, Smartphone, Monitor, ExternalLink,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Campus } from "../map-builder/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface PreviewTabProps {
  campus: Campus;
}

// ══════════════════════════════════════════════════════════════════════════════

export function PreviewTab({ campus }: PreviewTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState<"map" | "list" | "directions">("map");
  const [startSearch, setStartSearch] = useState("");
  const [endSearch, setEndSearch] = useState("");
  const [showRoute, setShowRoute] = useState(false);

  const selectedBuilding = selectedBuildingId
    ? campus.buildings.find((b) => b.id === selectedBuildingId)
    : null;

  const filteredBuildings = searchQuery
    ? campus.buildings.filter(
        (b) =>
          b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : campus.buildings;

  const handleFindRoute = useCallback(() => {
    if (!startSearch || !endSearch) return;
    setShowRoute(true);
  }, [startSearch, endSearch]);

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* ── Main preview area ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-950 dark:to-gray-900">
        <motion.div
          layout
          className={cn(
            "bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-black/5 border border-border overflow-hidden flex flex-col transition-all duration-300",
            deviceMode === "mobile"
              ? "w-[320px] h-[640px] rounded-[2rem] border-2"
              : "w-full max-w-4xl h-full max-h-[700px]"
          )}
        >
          {/* ── Device chrome ──────────────────────────────────────────────── */}
          {deviceMode === "mobile" && (
            <div className="flex items-center justify-center py-2 shrink-0">
              <div className="w-20 h-1.5 rounded-full bg-muted-foreground/20" />
            </div>
          )}

          {/* ── App header ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <MapPin className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-extrabold text-foreground truncate">PLV NaviSync</span>
            </div>
            <button
              onClick={() => setAccessibilityMode(!accessibilityMode)}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                accessibilityMode
                  ? "bg-blue-100 dark:bg-blue-900/20 text-blue-600"
                  : "text-muted-foreground hover:bg-muted"
              )}
              title="Accessibility Mode"
            >
              <Accessibility className="h-4 w-4" />
            </button>
          </div>

          {/* ── App tabs ───────────────────────────────────────────────────── */}
          <div className="flex border-b border-border bg-card/50 shrink-0">
            {(["map", "list", "directions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                  activeTab === tab
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "map" && <MapPin className="h-3 w-3" />}
                {tab === "list" && <Building2 className="h-3 w-3" />}
                {tab === "directions" && <Navigation className="h-3 w-3" />}
                {tab}
              </button>
            ))}
          </div>

          {/* ── Search bar ─────────────────────────────────────────────────── */}
          <div className="px-3 py-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search buildings, rooms..."
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted/50 border border-border/60 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* ── Tab content ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            {/* MAP VIEW */}
            {activeTab === "map" && (
              <div className="p-3">
                {/* Mini campus SVG */}
                <svg viewBox={`0 0 ${campus.canvasW} ${campus.canvasH}`} className="w-full rounded-xl border border-border/50 bg-[#f8f9fc] dark:bg-[#0f1117]">
                  {campus.buildings.map((b) => (
                    <g key={b.id} onClick={() => setSelectedBuildingId(b.id)} className="cursor-pointer">
                      <rect x={b.x} y={b.y} width={b.width} height={b.height}
                        fill={selectedBuildingId === b.id ? (b.color + "30") : (b.color + "15")}
                        stroke={selectedBuildingId === b.id ? b.color : (b.color + "40")}
                        strokeWidth={selectedBuildingId === b.id ? 2 : 1}
                        rx="3" />
                      <text x={b.x + b.width / 2} y={b.y + b.height / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={b.color} fontSize="8" fontWeight="700">
                        {b.code}
                      </text>
                    </g>
                  ))}
                </svg>

                {/* Selected building info */}
                {selectedBuilding && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-3 rounded-xl bg-card border border-border/60"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: selectedBuilding.color + "20" }}>
                        <Building2 className="h-4 w-4" style={{ color: selectedBuilding.color }} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">{selectedBuilding.name}</p>
                        <p className="text-[9px] text-muted-foreground">{selectedBuilding.code} · {selectedBuilding.category}</p>
                      </div>
                    </div>
                    {selectedBuilding.description && (
                      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{selectedBuilding.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <select
                        value={selectedFloor ?? ""}
                        onChange={(e) => setSelectedFloor(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-muted/50 border border-border/60 text-[10px] font-semibold text-foreground focus:outline-none"
                      >
                        <option value="">Select floor</option>
                        {selectedBuilding.floors.map((f) => (
                          <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* LIST VIEW */}
            {activeTab === "list" && (
              <div className="p-3 space-y-1">
                {filteredBuildings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBuildingId(b.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
                      selectedBuildingId === b.id
                        ? "bg-primary/5 border border-primary/20"
                        : "hover:bg-muted border border-transparent"
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: b.color + "20" }}>
                      <Building2 className="h-4 w-4" style={{ color: b.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{b.name}</p>
                      <p className="text-[9px] text-muted-foreground">{b.code} · {b.floors.length} floor{b.floors.length !== 1 ? "s" : ""}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
                {filteredBuildings.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No buildings found</p>
                )}
              </div>
            )}

            {/* DIRECTIONS VIEW */}
            {activeTab === "directions" && (
              <div className="p-3 space-y-3">
                <div className="space-y-2">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
                    <input type="text" value={startSearch}
                      onChange={(e) => setStartSearch(e.target.value)}
                      placeholder="Starting point..."
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-muted/30 border border-border/60 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="flex justify-center -my-1">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-red-500" />
                    <input type="text" value={endSearch}
                      onChange={(e) => setEndSearch(e.target.value)}
                      placeholder="Destination..."
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-muted/30 border border-border/60 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>

                <button
                  onClick={handleFindRoute}
                  disabled={!startSearch || !endSearch}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40 transition-all"
                >
                  <Navigation className="h-4 w-4" />
                  Get Directions
                </button>

                {showRoute && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
                  >
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <Navigation className="h-4 w-4" />
                      <p className="text-xs font-bold">Route Simulated</p>
                    </div>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-1">
                      From <strong>{startSearch}</strong> to <strong>{endSearch}</strong>
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-500">
                      <span>~5 min walk</span>
                      <span>·</span>
                      <span>~350m</span>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* ── Bottom navbar ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-around px-4 py-2 border-t border-border bg-card shrink-0">
            {[
              { icon: MapPin, label: "Map", active: true },
              { icon: Building2, label: "Buildings", active: false },
              { icon: Navigation, label: "Directions", active: false },
              { icon: Layers3, label: "Layers", active: false },
            ].map((item, i) => (
              <button key={i} className={cn("flex flex-col items-center gap-0.5 px-3 py-1 transition-all", item.active ? "text-primary" : "text-muted-foreground")}>
                <item.icon className="h-4 w-4" />
                <span className="text-[8px] font-bold">{item.label}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Preview settings panel ──────────────────────────────────────────── */}
      <div className="w-56 border-l border-border bg-card p-4 space-y-4 shrink-0 overflow-y-auto">
        <div>
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-primary" />
            Preview Settings
          </h3>
        </div>

        {/* Device toggle */}
        <div>
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Device</p>
          <div className="flex rounded-lg bg-muted/50 p-0.5">
            {(["desktop", "mobile"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDeviceMode(mode)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                  deviceMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {mode === "desktop" ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                {mode === "desktop" ? "Desktop" : "Mobile"}
              </button>
            ))}
          </div>
        </div>

        {/* Accessibility toggle */}
        <div>
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Features</p>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 cursor-pointer hover:bg-muted/60 transition-all">
            <input type="checkbox" checked={accessibilityMode}
              onChange={(e) => setAccessibilityMode(e.target.checked)}
              className="rounded border-border" />
            <span className="text-[10px] font-bold text-foreground">Accessibility Mode</span>
          </label>
        </div>

        {/* Campus info */}
        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Statistics</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <p className="text-sm font-bold text-foreground">{campus.buildings.length}</p>
              <p className="text-[8px] text-muted-foreground">Buildings</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <p className="text-sm font-bold text-foreground">
                {campus.buildings.reduce((sum, b) => sum + b.floors.length, 0)}
              </p>
              <p className="text-[8px] text-muted-foreground">Floors</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <p className="text-sm font-bold text-foreground">
                {campus.buildings.reduce((sum, b) => sum + b.floors.reduce((sf, f) => sf + f.rooms.length, 0), 0)}
              </p>
              <p className="text-[8px] text-muted-foreground">Rooms</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <p className="text-sm font-bold text-foreground">{campus.markers.length}</p>
              <p className="text-[8px] text-muted-foreground">Markers</p>
            </div>
          </div>
        </div>

        {campus.publishStatus === "published" && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-center">
            <ExternalLink className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Published to Students</p>
            <p className="text-[8px] text-emerald-600 dark:text-emerald-500 mt-0.5">Visible in the student app</p>
          </div>
        )}
      </div>
    </div>
  );
}
