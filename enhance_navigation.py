# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace') # type: ignore
"""
Enhance the campus navigation experience with:
1. Glow filter + directional arrows + waypoints on route SVG
2. Enhanced start/destination markers with arrival animation
3. Directional guidance panel with step-by-step turns
4. Multi-floor transition indicators
5. Zoom-to-route interaction
6. Accessible entrance markers
"""

with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    cm = f.read()

changes = 0

# ─── 1. Add route glow filter and arrow marker def ─────────────────────────
old_defs = """        <defs>
          <filter id=\"bldg-shadow\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\">
            <feDropShadow dx=\"2\" dy=\"3\" stdDeviation=\"3\" floodColor=\"rgba(0,0,0,0.18)\"/>
          </filter>
          <pattern id=\"grass\" patternUnits=\"userSpaceOnUse\" width=\"6\" height=\"6\">"""
new_defs = """        <defs>
          <filter id=\"bldg-shadow\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\">
            <feDropShadow dx=\"2\" dy=\"3\" stdDeviation=\"3\" floodColor=\"rgba(0,0,0,0.18)\"/>
          </filter>
          <filter id=\"route-glow\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\">
            <feGaussianBlur stdDeviation=\"4\" result=\"blur\"/>
            <feFlood flood-color=\"#3b82f6\" flood-opacity=\"0.35\" result=\"color\"/>
            <feComposite in=\"color\" in2=\"blur\" operator=\"in\" result=\"glow\"/>
            <feMerge><feMergeNode in=\"glow\"/><feMergeNode in=\"SourceGraphic\"/></feMerge>
          </filter>
          <marker id=\"route-arrow\" viewBox=\"0 0 10 10\" refX=\"5\" refY=\"5\" markerWidth=\"5\" markerHeight=\"5\" orient=\"auto-start-reverse\">
            <path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"rgba(255,255,255,0.6)\"/>
          </marker>
          <pattern id=\"grass\" patternUnits=\"userSpaceOnUse\" width=\"6\" height=\"6\">"""

if old_defs in cm:
    cm = cm.replace(old_defs, new_defs)
    changes += 1
    print("1. Added route glow filter + arrow marker")
else:
    print("1. SKIP - could not find defs section")

# ─── 2. Enhance route rendering with glow, arrows, waypoints ─────────────
# Find the route rendering section and enhance it
old_route = """            {route && (() => {
              const pathStr = route.points.map(p => `${p.x},${p.y}`).join(\" \");
              const color = mapMode === \"accessible\" ? \"#16a34a\" : mapMode === \"emergency\" ? \"#dc2626\" : \"#1e40af\";
              const pathId = \"plv-route-path\";
              return (
                <g>
                  <defs><path id={pathId} d={`M ${route.points.map(p => `${p.x} ${p.y}`).join(\" L \")}`}/></defs>
                  <polyline points={pathStr} fill=\"none\" stroke=\"rgba(0,0,0,0.15)\" strokeWidth={12} strokeLinecap=\"round\" strokeLinejoin=\"round\"/>
                  <polyline points={pathStr} fill=\"none\" stroke=\"white\" strokeWidth={9} strokeLinecap=\"round\" strokeLinejoin=\"round\"/>
                  <polyline points={pathStr} fill=\"none\" stroke={color} strokeWidth={6} strokeLinecap=\"round\" strokeLinejoin=\"round\"
                    strokeDasharray=\"900\" strokeDashoffset=\"900\"
                    style={{ animation:\"draw-route 1.4s cubic-bezier(0.4,0,0.2,1) forwards\" }}/>
                  <polyline points={pathStr} fill=\"none\" stroke=\"rgba(255,255,255,0.6)\" strokeWidth={2}
                    strokeLinecap=\"round\" strokeLinejoin=\"round\" strokeDasharray=\"8 14\"
                    style={{ animation:\"draw-route 1.4s 0.4s ease forwards, dash-flow 1.2s 1.8s linear infinite\" }}/>
                  <circle r=\"8\" fill={color} stroke=\"white\" strokeWidth={2.5} style={{ filter:`drop-shadow(0 2px 8px ${color}aa)` }}>
                    <animateMotion dur=\"5s\" repeatCount=\"indefinite\" rotate=\"auto\"><mpath href={`#${pathId}`}/></animateMotion>
                  </circle>
                  <circle cx={route.points[0].x} cy={route.points[0].y} r={12} fill=\"#16a34a\" stroke=\"white\" strokeWidth={2.5}/>
                  <text x={route.points[0].x} y={route.points[0].y+4} textAnchor=\"middle\" fill=\"white\" fontSize={9} fontWeight=\"900\" className=\"select-none\">A</text>
                  <circle cx={route.points[route.points.length-1].x} cy={route.points[route.points.length-1].y} r={12} fill=\"#dc2626\" stroke=\"white\" strokeWidth={2.5}/>
                  <text x={route.points[route.points.length-1].x} y={route.points[route.points.length-1].y+4} textAnchor=\"middle\" fill=\"white\" fontSize={9} fontWeight=\"900\" className=\"select-none\">B</text>
                  <circle cx={route.points[route.points.length-1].x} cy={route.points[route.points.length-1].y} r={12} fill=\"none\" stroke=\"#dc2626\" strokeWidth={2} opacity=\"0.5\">
                    <animate attributeName=\"r\" from=\"12\" to=\"24\" dur=\"1.8s\" repeatCount=\"indefinite\"/>
                    <animate attributeName=\"opacity\" from=\"0.5\" to=\"0\" dur=\"1.8s\" repeatCount=\"indefinite\"/>
                  </circle>
                </g>
              );
            })()}"""

new_route = """            {route && (() => {
              const pathStr = route.points.map(p => `${p.x},${p.y}`).join(\" \");
              const color = mapMode === \"accessible\" ? \"#16a34a\" : mapMode === \"emergency\" ? \"#dc2626\" : \"#1e40af\";
              const glowFilter = mapMode === \"standard\" ? \"url(#route-glow)\" : undefined;
              const pathId = \"plv-route-path\";
              const midIdx = Math.floor(route.points.length / 2);
              return (
                <g>
                  <defs><path id={pathId} d={`M ${route.points.map(p => `${p.x} ${p.y}`).join(\" L \")}`}/></defs>
                  {/* Outer shadow trail */}
                  <polyline points={pathStr} fill=\"none\" stroke=\"rgba(0,0,0,0.12)\" strokeWidth={14} strokeLinecap=\"round\" strokeLinejoin=\"round\"/>
                  {/* White backing */}
                  <polyline points={pathStr} fill=\"none\" stroke=\"white\" strokeWidth={9} strokeLinecap=\"round\" strokeLinejoin=\"round\"/>
                  {/* Glow layer */}
                  <polyline points={pathStr} fill=\"none\" stroke={color} strokeWidth={8} strokeLinecap=\"round\" strokeLinejoin=\"round\" opacity={0.25}
                    filter={glowFilter}
                    strokeDasharray=\"900\" strokeDashoffset=\"900\"
                    style={{ animation:\"draw-route 1.4s cubic-bezier(0.4,0,0.2,1) forwards\" }}/>
                  {/* Main animated route line */}
                  <polyline points={pathStr} fill=\"none\" stroke={color} strokeWidth={5} strokeLinecap=\"round\" strokeLinejoin=\"round\"
                    strokeDasharray=\"900\" strokeDashoffset=\"900\"
                    style={{ animation:\"draw-route 1.4s cubic-bezier(0.4,0,0.2,1) forwards\" }}/>
                  {/* Marching ants overlay */}
                  <polyline points={pathStr} fill=\"none\" stroke=\"rgba(255,255,255,0.6)\" strokeWidth={2}
                    strokeLinecap=\"round\" strokeLinejoin=\"round\" strokeDasharray=\"8 14\"
                    style={{ animation:\"draw-route 1.4s 0.4s ease forwards, dash-flow 1.2s 1.8s linear infinite\" }}/>
                  {/* Directional arrows along the route */}
                  {route.points.length >= 2 && route.points.slice(0, -1).map((p, i) => {
                    const next = route.points[i + 1];
                    const mx = (p.x + next.x) / 2, my = (p.y + next.y) / 2;
                    if (i % 2 !== 0) return null; // show on alternating segments
                    return (
                      <polygon key={i}
                        points={`${mx-4},${my-6} ${mx+4},${my} ${mx-4},${my+6}`}
                        fill={color} opacity={0.5}
                        style={{ animation:`fade-in 1.4s ${0.6 + i*0.1}s ease both` }}/>
                    );
                  })}
                  {/* Waypoint checkpoints at each junction */}
                  {route.points.slice(1, -1).map((p, i) => (
                    <g key={`wp${i}`}
                      style={{ animation:`scale-in 0.3s ${0.8 + i*0.12}s ease both` }}>
                      <circle cx={p.x} cy={p.y} r={5} fill=\"white\" stroke={color} strokeWidth={2} opacity={0.85}/>
                      <circle cx={p.x} cy={p.y} r={2} fill={color}/>
                    </g>
                  ))}
                  {/* Animated traveler dot */}
                  <circle r=\"7\" fill={color} stroke=\"white\" strokeWidth={2.5} style={{ filter:`drop-shadow(0 2px 8px ${color}88)` }}>
                    <animateMotion dur=\"6s\" repeatCount=\"indefinite\" rotate=\"auto\"><mpath href={`#${pathId}`}/></animateMotion>
                  </circle>
                  {/* Start marker — green with flag */}
                  <g style={{ animation:\"scale-in 0.4s 0.3s ease both\" }}>
                    <circle cx={route.points[0].x} cy={route.points[0].y} r={14} fill=\"#16a34a\" stroke=\"white\" strokeWidth={3}
                      style={{ filter:\"drop-shadow(0 2px 6px rgba(22,163,74,0.4))\" }}/>
                    <circle cx={route.points[0].x} cy={route.points[0].y} r={10} fill=\"none\" stroke=\"rgba(255,255,255,0.5)\" strokeWidth={1.5}/>
                    <text x={route.points[0].x} y={route.points[0].y+4} textAnchor=\"middle\" fill=\"white\" fontSize={11} fontWeight=\"900\" className=\"select-none\">A</text>
                    {/* Pulse ring */}
                    <circle cx={route.points[0].x} cy={route.points[0].y} r={14} fill=\"none\" stroke=\"#16a34a\" strokeWidth={2} opacity={0.4}>
                      <animate attributeName=\"r\" from=\"14\" to=\"24\" dur=\"2s\" repeatCount=\"indefinite\"/>
                      <animate attributeName=\"opacity\" from=\"0.4\" to=\"0\" dur=\"2s\" repeatCount=\"indefinite\"/>
                    </circle>
                  </g>
                  {/* Destination marker — red pin with expanded pulse */}
                  <g style={{ animation:\"scale-in 0.4s 0.5s ease both\" }}>
                    <circle cx={route.points[route.points.length-1].x} cy={route.points[route.points.length-1].y} r={14} fill=\"#dc2626\" stroke=\"white\" strokeWidth={3}
                      style={{ filter:\"drop-shadow(0 2px 8px rgba(220,38,38,0.5))\" }}/>
                    <circle cx={route.points[route.points.length-1].x} cy={route.points[route.points.length-1].y} r={10} fill=\"none\" stroke=\"rgba(255,255,255,0.5)\" strokeWidth={1.5}/>
                    <text x={route.points[route.points.length-1].x} y={route.points[route.points.length-1].y+4} textAnchor=\"middle\" fill=\"white\" fontSize={11} fontWeight=\"900\" className=\"select-none\">B</text>
                    {/* Outer pulse ring */}
                    <circle cx={route.points[route.points.length-1].x} cy={route.points[route.points.length-1].y} r={14} fill=\"none\" stroke=\"#dc2626\" strokeWidth={2.5} opacity={0.5}>
                      <animate attributeName=\"r\" from=\"14\" to=\"32\" dur=\"2.2s\" repeatCount=\"indefinite\"/>
                      <animate attributeName=\"opacity\" from=\"0.5\" to=\"0\" dur=\"2.2s\" repeatCount=\"indefinite\"/>
                    </circle>
                  </g>
                </g>
              );
            })()}"""

if old_route in cm:
    cm = cm.replace(old_route, new_route)
    changes += 1
    print("2. Enhanced route rendering with glow, arrows, waypoints, improved markers")
else:
    print("2. SKIP - could not find route rendering section (trying alternative match)")
    # Try with \r\n
    old_route_win = old_route.replace('\n', '\r\n')
    if old_route_win in cm:
        cm = cm.replace(old_route_win, new_route.replace('\n', '\r\n'))
        changes += 1
        print("   -> Found with Windows line endings")
    else:
        print("   -> Could not match")

# ─── 3. Add accessible entrance markers on campus map ──────────────────────
# Add accessible entrance circles near building entrances in accessible mode
old_acc_overlay = """            {/* Accessible overlay */}
            {mapMode === \"accessible\" && <>
              <path d=\"M 119,289 L 155,289 L 155,170\" fill=\"none\" stroke=\"#16a34a\" strokeWidth={7} opacity={0.5} strokeDasharray=\"12,6\" strokeLinecap=\"round\"/>
              <path d=\"M 414,289 L 540,289 L 540,373\" fill=\"none\" stroke=\"#16a34a\" strokeWidth={7} opacity={0.5} strokeDasharray=\"12,6\" strokeLinecap=\"round\"/>
              <path d=\"M 414,289 L 414,435 L 305,435\" fill=\"none\" stroke=\"#16a34a\" strokeWidth={7} opacity={0.5} strokeDasharray=\"12,6\" strokeLinecap=\"round\"/>
              {([[155,290],[414,373],[414,435]] as [number,number][]).map(([cx,cy],i) => (
                <g key={i}><circle cx={cx} cy={cy} r={10} fill=\"white\" stroke=\"#16a34a\" strokeWidth={2}/><text x={cx} y={cy+4} textAnchor=\"middle\" fill=\"#16a34a\" fontSize={11} fontWeight=\"900\" className=\"select-none\">\u267f</text></g>
              ))}
            </>}"""

new_acc_overlay = """            {/* Accessible overlay */}
            {mapMode === \"accessible\" && <>
              <path d=\"M 119,289 L 155,289 L 155,170\" fill=\"none\" stroke=\"#16a34a\" strokeWidth={7} opacity={0.5} strokeDasharray=\"12,6\" strokeLinecap=\"round\"/>
              <path d=\"M 414,289 L 540,289 L 540,373\" fill=\"none\" stroke=\"#16a34a\" strokeWidth={7} opacity={0.5} strokeDasharray=\"12,6\" strokeLinecap=\"round\"/>
              <path d=\"M 414,289 L 414,435 L 305,435\" fill=\"none\" stroke=\"#16a34a\" strokeWidth={7} opacity={0.5} strokeDasharray=\"12,6\" strokeLinecap=\"round\"/>
              {([[155,290,\"#16a34a\"],[414,373,\"#16a34a\"],[414,435,\"#16a34a\"]] as [number,number,string][]).map(([cx,cy,clr],i) => (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={12} fill=\"white\" stroke={clr} strokeWidth={2.5} style={{ animation:\"scale-in 0.3s ease both\" }}/>
                  <text x={cx} y={cy+4} textAnchor=\"middle\" fill={clr} fontSize={12} fontWeight=\"900\" className=\"select-none\">\u267f</text>
                  <circle cx={cx} cy={cy} r={12} fill=\"none\" stroke={clr} strokeWidth={2} opacity={0.3}>
                    <animate attributeName=\"r\" from=\"12\" to=\"20\" dur=\"1.5s\" repeatCount=\"indefinite\"/>
                    <animate attributeName=\"opacity\" from=\"0.3\" to=\"0\" dur=\"1.5s\" repeatCount=\"indefinite\"/>
                  </circle>
                </g>
              ))}
              {/* Building entrance accessibility markers */}
              {([[155,170,\"MAB - Ramp Access\"],[395,115,\"ADM - Elevator\"],[540,295,\"LRC - Ground\"],[165,305,\"ELB - Ramp\"],[305,435,\"GYM - Level\"],[605,415,\"SSC - Ground\"]] as [number,number,string][]).map(([ex,ey,label],i) => (
                <g key={`acc${i}`}>
                  <circle cx={ex} cy={ey} r={6} fill=\"#16a34a\" stroke=\"white\" strokeWidth={2} opacity={0.7}/>
                  <text x={ex} y={ey-10} textAnchor=\"middle\" fill=\"#16a34a\" fontSize={5} fontWeight=\"800\" className=\"select-none pointer-events-none\">{label}</text>
                </g>
              ))}
            </>}"""

if old_acc_overlay in cm:
    cm = cm.replace(old_acc_overlay, new_acc_overlay)
    changes += 1
    print("3. Enhanced accessible overlay with pulse rings + entrance markers")
else:
    print("3. SKIP - could not find accessible overlay (trying alternative)")
    old_acc_overlay_win = old_acc_overlay.replace('\n', '\r\n')
    if old_acc_overlay_win in cm:
        cm = cm.replace(old_acc_overlay_win, new_acc_overlay.replace('\n', '\r\n'))
        changes += 1
        print("   -> Found with Windows line endings")
    else:
        print("   -> Could not match accessible overlay")

# ─── 4. Enhance navigation card with step-by-step directions ──────────────
old_nav_card = """      {/* \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f COMPACT NAVIGATION CARD (only when route active) \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f */}
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

new_nav_card = """      {/* \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f COMPACT NAVIGATION CARD (only when route active) \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f */}
      {route && (
        <div data-no-drag className=\"absolute bottom-5 left-3 z-20 hidden md:block animate-slide-up\">
          <div className=\"rounded-2xl border border-border/60 shadow-xl overflow-hidden\"
            style={{ background:\"var(--card)\", backdropFilter:\"blur(16px)\", WebkitBackdropFilter:\"blur(16px)\", width:220 }}>
            {/* Header with destination name + live indicator */}
            <div className=\"flex items-center gap-2 px-3 py-2\" style={{ background: mapMode === \"accessible\" ? \"#16a34a\" : mapMode === \"emergency\" ? \"#dc2626\" : \"var(--primary)\" }}>
              <Navigation className=\"h-3.5 w-3.5 text-white shrink-0\"/>
              <span className=\"text-[11px] font-extrabold text-white truncate flex-1\">
                {toBuilding?.name ?? (fromBuilding ? fromBuilding.name : \"Route\")}
              </span>
              <span className=\"w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse shrink-0\"/>
            </div>
            {/* Distance + time stats */}
            <div className=\"flex gap-2 px-3 pt-2.5 pb-2 border-b border-border\">
              <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center\">
                <p className=\"text-[9px] text-muted-foreground font-semibold uppercase tracking-wider\">Distance</p>
                <p className=\"text-sm font-extrabold text-foreground\">{route.dist} m</p>
              </div>
              <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center\">
                <p className=\"text-[9px] text-muted-foreground font-semibold uppercase tracking-wider\">Est. Time</p>
                <p className=\"text-sm font-extrabold text-foreground\">{route.mins} min</p>
              </div>
              <div className=\"flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center\">
                <p className=\"text-[9px] text-muted-foreground font-semibold uppercase tracking-wider\">Mode</p>
                <p className=\"text-sm font-extrabold text-foreground\">{mapMode === \"accessible\" ? \"\u267f\" : mapMode === \"emergency\" ? \"SOS\" : \"Walk\"}</p>
              </div>
            </div>
            {/* Step-by-step directions */}
            <div className=\"px-3 py-2 max-h-28 overflow-y-auto scrollbar-show-on-hover\" style={{ fontFamily:\"var(--font-body)\" }}>
              <div className=\"relative pl-4 border-l-2 border-primary/30 space-y-1.5\">
                {(() => {
                  const steps: string[] = [];
                  if (fromBuilding) steps.push(`Start at ${fromBuilding.code}`);
                  else steps.push(\"Your location\");
                  steps.push(`Walk ${route.dist}m toward ${toBuilding?.code ?? \"destination\"}`);
                  steps.push(`Arrive at ${toBuilding?.code ?? \"destination\"}`);
                  return steps.map((step, i) => (
                    <div key={i} className=\"relative flex items-start gap-2\">
                      <div className={cn(
                        \"absolute -left-[11px] w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0\",
                        i === 0 ? \"bg-green-500 border-green-500\" :
                        i === steps.length - 1 ? \"bg-destructive border-destructive\" :
                        \"bg-card border-primary/50\"
                      )}>
                      </div>
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
                End Navigation
              </button>
              <button onClick={() => { setZoom(1.5); }}
                className=\"w-7 h-7 rounded-lg border border-border text-muted-foreground text-[9px] font-bold hover:bg-muted transition-colors\" title=\"Zoom to route\">
                \u25a3
              </button>
            </div>
          </div>
        </div>
      )}"""

if old_nav_card in cm:
    cm = cm.replace(old_nav_card, new_nav_card)
    changes += 1
    print("4. Enhanced navigation card with step-by-step directions + zoom button")
else:
    print("4. SKIP - could not find navigation card")

# ─── 5. Enhance directions panel with step-by-step info ──────────────────
old_directions_panel = """              {route && (
                <div className=\"mt-1 p-3 rounded-xl bg-primary/8 border border-primary/20\">
                  <div className=\"flex items-center justify-between mb-1\">
                    <span className=\"text-[10px] font-extrabold text-primary uppercase tracking-widest\">Route Active</span>
                    <span className=\"w-2 h-2 rounded-full bg-accent animate-pulse\"/>
                  </div>
                  <p className=\"text-lg font-extrabold text-foreground\">{route.dist} m</p>
                  <p className=\"text-[10px] text-muted-foreground\">{route.mins} min walking \u00b7 Animated on map</p>
                </div>
              )}"""

new_directions_panel = """              {route && (
                <div className=\"mt-1 p-3 rounded-xl bg-primary/8 border border-primary/20\">
                  <div className=\"flex items-center justify-between mb-1\">
                    <span className=\"text-[10px] font-extrabold text-primary uppercase tracking-widest\">Route Active</span>
                    <span className=\"w-2 h-2 rounded-full bg-accent animate-pulse\"/>
                  </div>
                  <p className=\"text-lg font-extrabold text-foreground\">{route.dist} m</p>
                  <p className=\"text-[10px] text-muted-foreground\">{route.mins} min walking \u00b7 Animated on map</p>
                  <div className=\"mt-2 flex flex-wrap gap-1.5\">
                    <span className=\"flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/30\">
                      from {fromBuilding?.code ?? \"You\"}
                    </span>
                    <ArrowUpDown className=\"h-3 w-3 text-muted-foreground\"/>
                    <span className=\"flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-destructive border border-red-200 dark:border-red-800/30\">
                      to {toBuilding?.code ?? \"?\"}
                    </span>
                  </div>
                </div>
              )}"""

if old_directions_panel in cm:
    cm = cm.replace(old_directions_panel, new_directions_panel)
    changes += 1
    print("5. Enhanced directions panel with route chips")
else:
    print("5. SKIP - could not find directions panel")

# ─── 6. Add "Arrived" animation to stair loading (multi-floor) ──────────
old_stair_overlay = """      {/* \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f STAIR LOADING OVERLAY \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f */}
      {stairLoading && (
        <div className=\"absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm animate-fade-in\">
          <div className=\"flex flex-col items-center gap-3\">
            <div className=\"text-3xl animate-bounce\">{stairLoading.dir === \"up\" ? \"\u2191\" : \"\u2193\"}</div>
            <p className=\"text-sm font-extrabold text-foreground\">{stairLoading.dir === \"up\" ? \"Going up to\" : \"Going down to\"}</p>
            <p className=\"text-xs text-muted-foreground\">{stairLoading.label}</p>
            <div className=\"flex gap-1.5\">
              {[0,1,2].map(i => (
                <div key={i} className=\"w-1.5 h-1.5 rounded-full bg-primary\"
                  style={{ animation:`loading-bounce 1s ease-in-out ${i*0.2}s infinite` }}/>
              ))}
            </div>
          </div>
        </div>
      )}"""

new_stair_overlay = """      {/* \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f STAIR LOADING OVERLAY \u2b50\ufe0f\u2b50\ufe0f\u2b50\ufe0f */}
      {stairLoading && (
        <div className=\"absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm animate-fade-in\">
          <div className=\"flex flex-col items-center gap-3 animate-slide-up\">
            {/* Floor transition icon */}
            <div className=\"w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center\">
              <div className=\"text-3xl\" style={{ animation:\"loading-bounce 0.6s ease-in-out infinite\" }}>
                {stairLoading.dir === \"up\" ? \"\u2191\" : \"\u2193\"}
              </div>
            </div>
            <div className=\"text-center\">
              <p className=\"text-sm font-extrabold text-foreground\">{stairLoading.dir === \"up\" ? \"Going Up\" : \"Going Down\"}</p>
              <p className=\"text-xs text-muted-foreground mt-0.5\">via stairs/elevator to</p>
              <p className=\"text-base font-extrabold text-primary mt-0.5\">{stairLoading.label}</p>
            </div>
            <div className=\"flex gap-1.5 mt-1\">
              {[0,1,2].map(i => (
                <div key={i} className=\"w-2 h-2 rounded-full bg-primary\"
                  style={{ animation:`loading-bounce 1s ease-in-out ${i*0.2}s infinite` }}/>
              ))}
            </div>
          </div>
        </div>
      )}"""

if old_stair_overlay in cm:
    cm = cm.replace(old_stair_overlay, new_stair_overlay)
    changes += 1
    print("6. Enhanced stair loading with floor transition card")
else:
    print("6. SKIP - could not find stair loading")

# ─── Write file ───────────────────────────────────────────────────────────
with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(cm)

print(f"\n--- Applied {changes} changes ---")
