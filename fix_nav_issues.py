import re

with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ============================================================
# FIX 1: Add routeFading state next to showArrival
# ============================================================
old_state_line = "  const [showArrival, setShowArrival] = useState(false);"
new_state_line = "  const [showArrival, setShowArrival] = useState(false);\n  const [routeFading, setRouteFading] = useState(false);"

if old_state_line in content:
    content = content.replace(old_state_line, new_state_line)
    changes += 1
    print("FIX 1: routeFading state added")
else:
    print("WARN: showArrival state not found")

# ============================================================
# FIX 2: Replace DOM-based route fade-out with state-based
# ============================================================
old_route_group = '<g data-route-group className=\"transition-opacity duration-300\">'
new_route_group = '<g data-route-group className={`transition-opacity duration-300 ${routeFading ? \'opacity-0\' : \'\'}`}>'

if old_route_group in content:
    content = content.replace(old_route_group, new_route_group)
    changes += 1
    print("FIX 2a: Route group uses state-based opacity")
else:
    print("WARN: Route group attribute not found")

# Replace the End button DOM manipulation with state
old_end_button_v2 = """              <button onClick={() => {
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

new_end_button_v2 = """              <button onClick={() => {
                  setRouteFading(true);
                  setTimeout(() => {
                    setFromBuilding(null);
                    setToBuilding(null);
                    setDirectionsMode(false);
                    setRouteFading(false);
                  }, 300);
                }}
                className=\"flex-1 h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors\">
                End
              </button>"""

if old_end_button_v2 in content:
    content = content.replace(old_end_button_v2, new_end_button_v2)
    changes += 1
    print("FIX 2b: End button uses state-based fade-out")
else:
    print("WARN: End button v2 not found")

# ============================================================
# FIX 3: Add missing deps to building pan effect
# ============================================================
old_bldg_pan_effect = """  // ── Pan to selected building on click ────────────────────────────
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

new_bldg_pan_effect = """  // ── Pan to selected building on click ────────────────────────────
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
  }, [selected, B_POS, isFloorMode, route, zoom]);"""

if old_bldg_pan_effect in content:
    content = content.replace(old_bldg_pan_effect, new_bldg_pan_effect)
    changes += 1
    print("FIX 3: Building pan effect deps added")
else:
    print("WARN: Building pan effect not found")

# ============================================================
# FIX 4: Accessibility legend with exact comment matching
# Insert after the closing </div> of mode chips (line 1242)
# ============================================================
old_mode_chips_close = """        ))}
      </div>
"""

new_mode_chips_with_legend = """        ))}
      </div>

      {/* Accessibility / SOS Legend (visible only in special modes) */}
      {mapMode !== "standard" && (
        <div data-no-drag className=\"absolute top-14 left-1/2 -translate-x-1/2 z-20 animate-slide-up\">
          <div className=\"flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-lg\"
            style={{
              background: mapMode === "accessible" ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderColor: mapMode === "accessible" ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)",
            }}>
            {mapMode === "accessible" ? (
              <>
                <span className=\"flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400\">
                  <span style={{fontSize:12}}>♿</span> Accessible Route
                </span>
                <span className=\"w-px h-3 bg-green-500/20\"/>
                <span className=\"flex items-center gap-1 text-[10px] font-semibold text-green-600/70 dark:text-green-500/70\">
                  ■ Ramp
                </span>
                <span className=\"text-[10px] font-semibold text-green-600/70 dark:text-green-500/70\">■ Elevator</span>
                <span className=\"text-[10px] font-semibold text-green-600/70 dark:text-green-500/70\">— Wide Paths</span>
              </>
            ) : (
              <>
                <span className=\"flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400\">
                  <AlertTriangle className=\"h-3 w-3\"/> Emergency Mode
                </span>
                <span className=\"w-px h-3 bg-red-500/20\"/>
                <span className=\"text-[10px] font-semibold text-red-500/80\">■ EXIT Points</span>
                <span className=\"text-[10px] font-semibold text-red-500/80\">■ Assembly Area</span>
              </>
            )}
          </div>
        </div>
      )}

"""

# Use the exact 3-line pattern for mode chips closing
# Lines 1241-1243: })}   </div>  (blank line)
old_exact_pattern = """        ))}
      </div>
"""

# Insert BEFORE the floor selector section which starts right after mode chips
# Let me find a more unique pattern
old_floor_selector = """      {/* ══════════════ FLOOR SELECTOR (floor plan mode — always visible when in floor view) ══════════════ */}"""

new_legend_and_floor = """      {/* Accessibility / SOS Legend (visible only in special modes) */}
      {mapMode !== "standard" && (
        <div data-no-drag className=\"absolute top-14 left-1/2 -translate-x-1/2 z-20 animate-slide-up\">
          <div className=\"flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-lg\"
            style={{
              background: mapMode === "accessible" ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderColor: mapMode === "accessible" ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)",
            }}>
            {mapMode === "accessible" ? (
              <>
                <span className=\"flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400\">
                  <span style={{fontSize:12}}>♿</span> Accessible Route
                </span>
                <span className=\"w-px h-3 bg-green-500/20\"/>
                <span className=\"flex items-center gap-1 text-[10px] font-semibold text-green-600/70 dark:text-green-500/70\">■ Ramp</span>
                <span className=\"text-[10px] font-semibold text-green-600/70 dark:text-green-500/70\">■ Elevator</span>
                <span className=\"text-[10px] font-semibold text-green-600/70 dark:text-green-500/70\">— Wide Paths</span>
              </>
            ) : (
              <>
                <span className=\"flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400\">
                  <AlertTriangle className=\"h-3 w-3\"/> Emergency Mode
                </span>
                <span className=\"w-px h-3 bg-red-500/20\"/>
                <span className=\"text-[10px] font-semibold text-red-500/80\">■ EXIT Points</span>
                <span className=\"text-[10px] font-semibold text-red-500/80\">■ Assembly Area</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ FLOOR SELECTOR (floor plan mode — always visible when in floor view) ══════════════ */}"""

if old_floor_selector in content:
    content = content.replace(old_floor_selector, new_legend_and_floor)
    changes += 1
    print("FIX 4: Accessibility legend added (inserted before floor selector)")
else:
    print("WARN: Floor selector comment not found for legend insertion")

# ============================================================
# Write back
# ============================================================
with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTotal fixes applied: {changes}")
