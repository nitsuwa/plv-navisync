# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace') # type: ignore

with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Fix 1: Accessible entrance labels - replace tiny unreadable text with compact labels
old = "              {/* Building entrance accessibility markers */}\n              {([[155,170,\"MAB - Ramp Access\"],[395,115,\"ADM - Elevator\"],[540,295,\"LRC - Ground\"],[165,305,\"ELB - Ramp\"],[305,435,\"GYM - Level\"],[605,415,\"SSC - Ground\"]] as [number,number,string][]).map(([ex,ey,label],i) => (\n                <g key={`acc${i}`}>\n                  <circle cx={ex} cy={ey} r={6} fill=\"#16a34a\" stroke=\"white\" strokeWidth={2} opacity={0.7}/>\n                  <text x={ex} y={ey-10} textAnchor=\"middle\" fill=\"#16a34a\" fontSize={5} fontWeight=\"800\" className=\"select-none pointer-events-none\">{label}</text>\n                </g>\n              ))}"
new = "              {/* Building entrance accessibility markers */}\n              {([[155,170,\"MAB\"],[395,115,\"ADM\"],[540,295,\"LRC\"],[165,305,\"ELB\"],[305,435,\"GYM\"],[605,415,\"SSC\"]] as [number,number,string][]).map(([ex,ey,label],i) => (\n                <g key={`acc${i}`}>\n                  <rect x={ex-12} y={ey-14} width={24} height={12} rx={6} fill=\"#16a34a\" fillOpacity={0.85} stroke=\"white\" strokeWidth={1.5}/>\n                  <text x={ex} y={ey-6} textAnchor=\"middle\" fill=\"white\" fontSize={6.5} fontWeight=\"900\" className=\"select-none pointer-events-none\">w/<span style=\"font-size:5px\">{label}</span></text>\n                </g>\n              ))}"

# Actually, let me simplify - just fix the font size and add background
old = "                  <circle cx={ex} cy={ey} r={6} fill=\"#16a34a\" stroke=\"white\" strokeWidth={2} opacity={0.7}/>\n                  <text x={ex} y={ey-10} textAnchor=\"middle\" fill=\"#16a34a\" fontSize={5} fontWeight=\"800\" className=\"select-none pointer-events-none\">{label}</text>"
new = "                  <rect x={ex-10} y={ey-10} width={20} height={10} rx={4} fill=\"#16a34a\" fillOpacity={0.85} stroke=\"white\" strokeWidth={1}/>\n                  <text x={ex} y={ey-3} textAnchor=\"middle\" fill=\"white\" fontSize={5.5} fontWeight=\"900\" className=\"select-none pointer-events-none\">{label}</text>"

if old in content:
    content = content.replace(old, new)
    changes += 1
    print("1. Fixed accessible entrance labels with readable background badges")
else:
    # Try with original versions
    for orig_label in ["MAB - Ramp Access", "ADM - Elevator", "LRC - Ground", "ELB - Ramp", "GYM - Level", "SSC - Ground"]:
        short = orig_label.split(" - ")[0]
        content = content.replace(orig_label, short)
    old2 = "                  <circle cx={ex} cy={ey} r={6} fill=\"#16a34a\" stroke=\"white\" strokeWidth={2} opacity={0.7}/>\n                  <text x={ex} y={ey-10} textAnchor=\"middle\" fill=\"#16a34a\" fontSize={5} fontWeight=\"800\" className=\"select-none pointer-events-none\">{label}</text>"
    new2 = "                  <rect x={ex-10} y={ey-10} width={20} height={10} rx={4} fill=\"#16a34a\" fillOpacity={0.85} stroke=\"white\" strokeWidth={1}/>\n                  <text x={ex} y={ey-3} textAnchor=\"middle\" fill=\"white\" fontSize={5.5} fontWeight=\"900\" className=\"select-none pointer-events-none\">{label}</text>"
    if old2 in content:
        content = content.replace(old2, new2)
        changes += 1
        print("1. Fixed accessible entrance labels (alternative match)")

# Fix 2: Add current location indicator on campus map (next to scale bar)
old = "            {/* Scale bar */}"
new = """            {/* Current location indicator */}
            <g style={{ animation:\"fade-in 0.6s ease both\" }}>
              <circle cx={100} cy={285} r={9} fill=\"#3b82f6\" stroke=\"white\" strokeWidth={3}
                style={{ filter:\"drop-shadow(0 2px 6px rgba(59,130,246,0.5))\", animation:\"pulse-ring 2s ease-in-out infinite\" }}/>
              <circle cx={100} cy={285} r={5} fill=\"white\"/>
              <circle cx={100} cy={285} r={2} fill=\"#3b82f6\"/>
            </g>
            {/* Scale bar */}"""

if old in content:
    content = content.replace(old, new)
    changes += 1
    print("2. Added current location indicator")
else:
    print("2. SKIP - could not find scale bar")

# Fix 3: Add direction arrow on the floor plan near the compass
old_bldg_name = "{currentFloor.label} \u2014 {floorView?.building.code}"
if old_bldg_name in content:
    print(f"3. Floor plan label found at index {content.index(old_bldg_name)}")

with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n--- Applied {changes} changes ---")
