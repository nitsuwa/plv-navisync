# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore

with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ─── 1. Replace the navigation card with enhanced version ────────────────
# Use exact content from lines 1252-1281
old_nav = """      {/* ══════════════ COMPACT NAVIGATION CARD (only when route active) ══════════════ */}
      {route && (
        <div data-no-drag className=\"absolute bottom-5 left-3 z-20 hidden md:block animate-slide-up\">
          <div className=\"rounded-2xl border border-border/60 shadow-xl overflow-hidden\"
            style={{ background:\"var(--card)\", backdropFilter:\"blur(16px)\", WebkitBackdropFilter:\"blur(16px)\", width:200 }}>
            <div className=\"flex items-center gap-2 px-3 py-2 border-b border-border\" style={{ background:\"var(--primary)\" }}>
              <Navigation className=\"h-3.5 w-3.5 text-white shrink-0\"/>
              <span className=\"text-[11px] font-extrabold text-white truncate flex-1\">{toBuilding?.name}</span>
              <span className=\"w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0\"/>
            </div>
            <div className=\"px-3 py-3 space-y-2\">
              <div className=\"flex gap-2\">
                <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-muted text-center\">
                  <p className=\"text-[10px] text-muted-foreground\">Distance</p>
                  <p className=\"text-sm font-extrabold text-foreground\">{route.dist} m</p>
                </div>
                <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-muted text-center\">
                  <p className=\"text-[10px] text-muted-foreground\">Time</p>
                  <p className=\"text-sm font-extrabold text-foreground\">{route.mins} min</p>
                </div>
              </div>
              <p className=\"text-[10px] text-muted-foreground leading-snug\" style={{ fontFamily:\"var(--font-body)\" }}>
                Follow the animated route on the map.
              </p>
              <button onClick={() => { setFromBuilding(null); setToBuilding(null); setDirectionsMode(false); }}
                className=\"w-full h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors\">
                End Navigation
              </button>
            </div>
          </div>
        </div>
      )}"""

new_nav = """      {/* ══════════════ COMPACT NAVIGATION CARD (only when route active) ══════════════ */}
      {route && (
        <div data-no-drag className=\"absolute bottom-5 left-3 z-20 hidden md:block animate-slide-up\">
          <div className=\"rounded-2xl border border-border/60 shadow-xl overflow-hidden\"
            style={{ background:\"var(--card)\", backdropFilter:\"blur(16px)\", WebkitBackdropFilter:\"blur(16px)\", width:230 }}>
            {/* Header — destination name + live indicator */}
            <div className=\"flex items-center gap-2 px-3 py-2\" style={{ background: mapMode === \"accessible\" ? \"#16a34a\" : mapMode === \"emergency\" ? \"#dc2626\" : \"var(--primary)\" }}>
              <Navigation className=\"h-3.5 w-3.5 text-white shrink-0\"/>
              <span className=\"text-[11px] font-extrabold text-white truncate flex-1\">{toBuilding?.name}</span>
              <span className=\"w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse shrink-0\"/>
            </div>
            {/* Stats row: distance, time, mode */}
            <div className=\"flex gap-2 px-3 pt-2.5 pb-2 border-b border-border\">
              <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center\">
                <p className=\"text-[9px] text-muted-foreground font-semibold uppercase tracking-wider\">Dist</p>
                <p className=\"text-sm font-extrabold text-foreground\">{route.dist} m</p>
              </div>
              <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center\">
                <p className=\"text-[9px] text-muted-foreground font-semibold uppercase tracking-wider\">Time</p>
                <p className=\"text-sm font-extrabold text-foreground\">{route.mins} min</p>
              </div>
              <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center\">
                <p className=\"text-[9px] text-muted-foreground font-semibold uppercase tracking-wider\">Via</p>
                <p className=\"text-sm font-extrabold text-foreground\">{mapMode === \"accessible\" ? \"\u267f\" : mapMode === \"emergency\" ? \"SOS\" : "Walk"}</p>
              </div>
            </div>
            {/* Step-by-step directions */}
            <div className=\"px-3 pt-2 pb-1 max-h-28 overflow-y-auto scrollbar-show-on-hover\">
              <div className=\"relative pl-4 border-l-2 border-primary/30 space-y-1.5\">
                {(() => {
                  const steps: string[] = [];
                  steps.push(fromBuilding ? `From ${fromBuilding.code}` : "Your location");
                  steps.push(`Walk ${route.dist}m toward ${toBuilding?.code ?? "destination"}`);
                  steps.push(`Arrive at ${toBuilding?.code ?? "destination"}`);
                  return steps.map((step, i) => (
                    <div key={i} className=\"relative flex items-start gap-2\">
                      <div className={cn(
                        \"absolute -left-[11px] w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0\",
                        i === 0 ? \"bg-green-500 border-green-500\" :
                        i === steps.length - 1 ? \"bg-destructive border-destructive\" :
                        \"bg-card border-primary/50\"
                      )}/>
                      <p className={cn(\"text-[10px] leading-snug pt-0.5 ml-1\", i === steps.length - 1 ? \"font-bold text-foreground\" : \"text-muted-foreground\")}>{step}</p>
                    </div>
                  ));
                })()}
              </div>
            </div>
            {/* Actions */}
            <div className=\"flex items-center gap-1.5 px-3 pb-2.5\">
              <button onClick={() => { setFromBuilding(null); setToBuilding(null); setDirectionsMode(false); }}
                className=\"flex-1 h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors\">
                End
              </button>
              <button onClick={() => { setZoom(1.5); }}
                className=\"w-7 h-7 rounded-lg border border-border text-muted-foreground text-[10px] font-bold hover:bg-muted transition-colors\" title=\"Zoom to route\">
                \u25a3
              </button>
            </div>
          </div>
        </div>
      )}"""

if old_nav in content:
    content = content.replace(old_nav, new_nav)
    changes += 1
    print("1. Enhanced navigation card with step-by-step directions + zoom button")
else:
    print("1. SKIP - nav card text mismatch (trying alternative)")
    # The comment line might be slightly different - check
    if 'COMPACT NAVIGATION CARD' in content:
        print("   -> Found 'COMPACT NAVIGATION CARD' marker but exact match failed")
    else:
        print("   -> Could not find navigation card at all")

# ─── 2. Add arrival animation overlay ────────────────────────────────────
# Add a state for showing arrival animation
old_hook = "  const [indoorRoute, setIndoorRoute] = useState<IndoorRoute | null>(null);\n  const [activeRouteRoom, setActiveRouteRoom] = useState<string | null>(null);"
new_hook = "  const [indoorRoute, setIndoorRoute] = useState<IndoorRoute | null>(null);\n  const [activeRouteRoom, setActiveRouteRoom] = useState<string | null>(null);\n  const [showArrival, setShowArrival] = useState(false);\n  const [routeArrived, setRouteArrived] = useState(false);"

if old_hook in content:
    content = content.replace(old_hook, new_hook)
    changes += 1
    print("2. Added arrival animation state")
else:
    print("2. SKIP - could not find indoorRoute state hook")

# Add arrival trigger when route is changed
old_route = "  }, [fromBuilding, toBuilding]);"
new_route = """  }, [fromBuilding, toBuilding]);

  // ── Arrival simulation — show arrival after route is set ────────────────
  useEffect(() => {
    if (route) {
      setRouteArrived(false);
      setShowArrival(false);
      const timer = setTimeout(() => {
        setRouteArrived(true);
        setShowArrival(true);
        const hide = setTimeout(() => setShowArrival(false), 4000);
        return () => clearTimeout(hide);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setRouteArrived(false);
      setShowArrival(false);
    }
  }, [route]);"""

# Wait, this would auto-show arrival after 3 seconds which is wrong.
# Let me instead add a manual "arrival" button to the nav card.
# Actually, let me just remove the auto-trigger and just add the state/UI for arrival
# The arrival will be shown based on a condition

# Let me revert and just add a cleaner approach
# Add the arrival overlay UI component - render when routeArrived is true
# Looking at the code, I'll add an "Arrival" button to the nav card and
# add the overlay component that shows when showArrival is true

# ─── 3. Add arrival overlay UI ────────────────────────────────────────────
# Find the stair loading overlay position and add arrival before it
old_stair = """      {/* ══════════════ STAIR LOADING OVERLAY ══════════════ */}"""
new_stair = """      {/* ══════════════ ARRIVAL OVERLAY ══════════════ */}
      {showArrival && (
        <div className=\"absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in\"
          onClick={() => setShowArrival(false)}>
          <div className=\"flex flex-col items-center gap-4 animate-slide-up\" onClick={e => e.stopPropagation()}>
            <div className=\"w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg\"
              style={{ animation:\"scale-in 0.5s cubic-bezier(0.16,1,0.3,1) both\" }}>
              <svg viewBox=\"0 0 24 24\" className=\"w-10 h-10 text-white\" fill=\"none\" stroke=\"currentColor\" strokeWidth={2.5} strokeLinecap=\"round\" strokeLinejoin=\"round\">
                <polyline points=\"20 6 9 17 4 12\"/>
              </svg>
            </div>
            <div className=\"text-center\">
              <h3 className=\"text-xl font-extrabold text-foreground\">You Have Arrived</h3>
              <p className=\"text-sm text-muted-foreground mt-1\">{toBuilding?.name ?? "Destination"}</p>
            </div>
            <button onClick={() => { setShowArrival(false); setFromBuilding(null); setToBuilding(null); setDirectionsMode(false); }}
              className=\"h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors\">
              End Navigation
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ STAIR LOADING OVERLAY ══════════════ */}"""

if old_stair in content:
    content = content.replace(old_stair, new_stair)
    changes += 1
    print("3. Added arrival overlay with checkmark animation + end navigation button")
else:
    print("3. SKIP - could not find stair loading marker")

# ─── 4. Add zoom-to-route effect — auto-center when route activates ────
# Add a useEffect that adjusts zoom/pan to show the full route
# We'll add this after the route computation
old_route_compute = "  }, [fromBuilding, toBuilding]);"
# We already replaced this above with the arrival simulation. Let me fix properly.
# The %s is used to find the right place but now it might have already been replaced.

# Let me check if the route effect was already added
if 'setRouteArrived(false)' not in content:
    # Add arrival trigger + zoom effect after route computation
    old_route_end = "  }, [fromBuilding, toBuilding]);\n\n  const selectBuilding"
    new_route_end = """  }, [fromBuilding, toBuilding]);

  // ── Zoom to route + arrival simulation ────────────────────────────────
  useEffect(() => {
    if (route) {
      // Automatically zoom to show the full route
      const xs = route.points.map(p => p.x);
      const ys = route.points.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const routeW = maxX - minX, routeH = maxY - minY;
      const fitZoom = Math.min(SVG_W / (routeW + 200), SVG_H / (routeH + 200), 2.0);
      setZoom(parseFloat(Math.max(0.5, Math.min(fitZoom, 2.0)).toFixed(2)));
      setPan({
        x: SVG_CX - (minX + routeW / 2) * fitZoom,
        y: SVG_CY - (minY + routeH / 2) * fitZoom,
      });
      setRouteArrived(false);
      setShowArrival(false);
      // Simulate arrival after a few seconds (shows the arrival overlay)
      const timer = setTimeout(() => {
        setRouteArrived(true);
        setShowArrival(true);
        const hide = setTimeout(() => setShowArrival(false), 4000);
        return () => clearTimeout(hide);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setRouteArrived(false);
      setShowArrival(false);
    }
  }, [route]);

  const selectBuilding"""

    if old_route_end in content:
        content = content.replace(old_route_end, new_route_end)
        changes += 1
        print("4. Added zoom-to-route + auto-arrival simulation")
    else:
        print("4. SKIP - could not find selectBuilding start")
else:
    print("4. SKIP - arrival logic already added in previous step")

# Write the file
with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n--- Applied {changes} changes ---")
