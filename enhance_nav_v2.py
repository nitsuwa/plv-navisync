import re

with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ============================================================
# CHANGE 1: Add accessibility legend (floating UI outside SVG)
# Insert after the MODE CHIPS div (find the closing of the mode chips section)
# ============================================================
old_mode_chips = """      {/* MODE CHIPS — always visible, same position */}
      <div data-no-drag className=\"absolute top-3 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-1 rounded-2xl border border-border/60 px-2 py-1.5 shadow-lg\""""

new_mode_chips = """      {/* MODE CHIPS — always visible, same position */}
      <div data-no-drag className=\"absolute top-3 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-1 rounded-2xl border border-border/60 px-2 py-1.5 shadow-lg\"""" + """

      {/* Accessibility / SOS Legend (visible only in special modes) */}
      {mapMode !== "standard" && (
        <div data-no-drag className="absolute top-14 left-1/2 -translate-x-1/2 z-20 animate-slide-up">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-lg"
            style={{
              background: mapMode === "accessible" ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderColor: mapMode === "accessible" ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)",
            }}>
            {mapMode === "accessible" ? (
              <>
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400">
                  <span style={{fontSize:12}}>♿</span> Accessible Route
                </span>
                <span className="w-px h-3 bg-green-500/20"/>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600/70 dark:text-green-500/70">
                  ■ Ramp
                </span>
                <span className="text-[10px] font-semibold text-green-600/70 dark:text-green-500/70">■ Elevator</span>
                <span className="text-[10px] font-semibold text-green-600/70 dark:text-green-500/70">— Wide Paths</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3"/> Emergency Mode
                </span>
                <span className="w-px h-3 bg-red-500/20"/>
                <span className="text-[10px] font-semibold text-red-500/80">■ EXIT Points</span>
                <span className="text-[10px] font-semibold text-red-500/80">■ Assembly Area</span>
              </>
            )}
          </div>
        </div>
      )}"""

if old_mode_chips in content:
    content = content.replace(old_mode_chips, new_mode_chips)
    changes += 1
    print("CHANGE 1: Accessibility legend added after mode chips")
else:
    print("WARN: Mode chips section not found for accessibility legend")

# ============================================================
# CHANGE 2: Add zoom level indicator text in the zoom controls
# ============================================================
old_zoom_reset = """        <button onClick={e => { e.stopPropagation(); setZoom(1); setPan({x:0,y:0}); }} title=\"Reset view\"
          className=\"w-9 h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all\">
          <LocateFixed className=\"h-4 w-4\"/>
        </button>
      </div>"""

new_zoom_reset = """        <button onClick={e => { e.stopPropagation(); setZoom(1); setPan({x:0,y:0}); }} title=\"Reset view\"
          className=\"w-9 h-9 rounded-xl bg-card border border-border/60 shadow-md flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all\">
          <LocateFixed className=\"h-4 w-4\"/>
        </button>
        {/* Zoom level indicator */}
        <div className=\"text-center text-[9px] font-semibold text-muted-foreground/60 select-none mt-0.5\">
          {Math.round(displayZoom * 100)}%
        </div>
      </div>"""

if old_zoom_reset in content:
    content = content.replace(old_zoom_reset, new_zoom_reset)
    changes += 1
    print("CHANGE 2: Zoom level indicator added")
else:
    print("WARN: Zoom reset button not found")

# ============================================================
# CHANGE 3: Add building pan-on-click effect
# Add a useEffect after the existing route zoom effect
# ============================================================
old_route_zoom_effect = """  // ── Zoom to route + arrival simulation ────────────────────────────────
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
      
      setShowArrival(false);
      // Simulate arrival after a few seconds (shows the arrival overlay)
      const timer = setTimeout(() => {
        
        setShowArrival(true);
        const hide = setTimeout(() => setShowArrival(false), 4000);
        return () => clearTimeout(hide);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      
      setShowArrival(false);
    }
  }, [route]);"""

new_route_zoom_effect = """  // ── Zoom to route + arrival simulation ────────────────────────────────
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
      
      setShowArrival(false);
      // Simulate arrival after a few seconds (shows the arrival overlay)
      const timer = setTimeout(() => {
        
        setShowArrival(true);
        const hide = setTimeout(() => setShowArrival(false), 4000);
        return () => clearTimeout(hide);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      
      setShowArrival(false);
    }
  }, [route]);

  // ── Pan to selected building on click ────────────────────────────
  useEffect(() => {
    if (selected && !isFloorMode && !route) {
      const pos = B_POS[selected.id];
      if (pos) {
        const cx = pos.x + pos.w / 2;
        const cy = pos.y + pos.h / 2;
        setPan({
          x: SVG_CX - cx * zoom,
          y: SVG_CY - cy * zoom,
        });
      }
    }
  }, [selected, B_POS]);"""

if old_route_zoom_effect in content:
    content = content.replace(old_route_zoom_effect, new_route_zoom_effect)
    changes += 1
    print("CHANGE 3: Building pan-on-click effect added")
else:
    print("WARN: Route zoom effect section not found for building pan")

# ============================================================
# CHANGE 4: Add route fade-out animation when ending navigation
# Modify the "End" button to animate fade-out
# ============================================================
old_end_button = """              <button onClick={() => { setFromBuilding(null); setToBuilding(null); setDirectionsMode(false); }}
                className=\"flex-1 h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors\">
                End
              </button>"""

new_end_button = """              <button onClick={() => {
                  const routeEl = document.querySelector('[data-route-group]');
                  if (routeEl) {
                    routeEl.classList.add('opacity-0', 'transition-opacity', 'duration-300');
                  }
                  setTimeout(() => {
                    setFromBuilding(null);
                    setToBuilding(null);
                    setDirectionsMode(false);
                  }, 300);
                }}
                className=\"flex-1 h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors\">
                End
              </button>"""

if old_end_button in content:
    content = content.replace(old_end_button, new_end_button)
    changes += 1
    print("CHANGE 4a: Route 'End' button fade-out added")
else:
    print("WARN: End button not found")

# Add data-route-group attribute to the route SVG group
old_route_group_open = """            {route && (() => {
              const pathStr = route.points.map(p => `${p.x},${p.y}`).join(\" \");
              const color = mapMode === \"accessible\" ? \"#16a34a\" : mapMode === \"emergency\" ? \"#dc2626\" : \"#1e40af\";
              const glowFilter = mapMode === \"standard\" ? \"url(#route-glow)\" : undefined;
              const pathId = \"plv-route-path\";
              const midIdx = Math.floor(route.points.length / 2);
              return (
                <g>"""

new_route_group_open = """            {route && (() => {
              const pathStr = route.points.map(p => `${p.x},${p.y}`).join(\" \");
              const color = mapMode === \"accessible\" ? \"#16a34a\" : mapMode === \"emergency\" ? \"#dc2626\" : \"#1e40af\";
              const glowFilter = mapMode === \"standard\" ? \"url(#route-glow)\" : undefined;
              const pathId = \"plv-route-path\";
              const midIdx = Math.floor(route.points.length / 2);
              return (
                <g data-route-group className=\"transition-opacity duration-300\">"""

if old_route_group_open in content:
    content = content.replace(old_route_group_open, new_route_group_open)
    changes += 1
    print("CHANGE 4b: Route group data attribute added for fade-out")
else:
    print("WARN: Route group opening not found")

# ============================================================
# Write back
# ============================================================
with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTotal changes applied: {changes}")
