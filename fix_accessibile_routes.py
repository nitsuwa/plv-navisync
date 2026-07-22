# -*- coding: utf-8 -*-
import sys
import io

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = "src/pages/CampusMapPage.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# === CHANGE 1: Add findBuildingPath import ===
old_import = 'import { findIndoorRoute, type IndoorRoute } from "../lib/indoorPathfinding";'
new_import = old_import + '\nimport { findBuildingPath } from "../lib/pathfinding";'
assert old_import in content, "CHANGE 1 FAILED: Import line not found"
content = content.replace(old_import, new_import, 1)
print("1. Added findBuildingPath import")

# === CHANGE 2: Modify the route useMemo ===
old_route_memo = """  const route = useMemo(() => {
    if (!fromBuilding || !toBuilding) return null;
    const fp = B_POS[fromBuilding.id], tp = B_POS[toBuilding.id];
    if (!fp || !tp) return null;
    const points = computeRoute(fp, tp);
    return { points, dist: calcDist(points), mins: Math.max(1, Math.round(calcDist(points)/80)) };
  }, [fromBuilding, toBuilding]);"""

new_route_memo = """  const route = useMemo(() => {
    if (!fromBuilding || !toBuilding) return null;

    // Accessible mode: use graph-based pathfinding with accessibleOnly=true
    if (mapMode === "accessible") {
      const graphPath = findBuildingPath(fromBuilding.id, toBuilding.id, true);
      if (graphPath && graphPath.waypoints.length >= 2) {
        return {
          points: graphPath.waypoints,
          dist: graphPath.distanceM,
          mins: graphPath.minutes,
          steps: graphPath.steps,
          isGraphBased: true,
        };
      }
    }

    // Standard/Emergency mode or fallback: use SVG-based route
    const fp = B_POS[fromBuilding.id], tp = B_POS[toBuilding.id];
    if (!fp || !tp) return null;
    const points = computeRoute(fp, tp);
    return { points, dist: calcDist(points), mins: Math.max(1, Math.round(calcDist(points)/80)) };
  }, [fromBuilding, toBuilding, mapMode]);"""

assert old_route_memo in content, "CHANGE 2 FAILED: Route memo not found"
content = content.replace(old_route_memo, new_route_memo, 1)
print("2. Modified route memo to use graph-based pathfinding for accessible mode")

# === CHANGE 3: Update navigation card steps ===
old_steps_block = """                  const steps: string[] = [];
                  steps.push(fromBuilding ? `From ${fromBuilding.code}` : \"Your location\");
                  steps.push(`Walk ${route.dist}m toward ${toBuilding?.code ?? \"destination\"}`);
                  steps.push(`Arrive at ${toBuilding?.code ?? \"destination\"}`);
                  return steps.map((step, i) => (""".replace('                  ', '                  ')

new_steps_block = """                  const steps: string[] = route.steps ?? [
                    fromBuilding ? `From ${fromBuilding.code}` : \"Your location\",
                    `Walk ${route.dist}m toward ${toBuilding?.code ?? \"destination\"}`,
                    `Arrive at ${toBuilding?.code ?? \"destination\"}`,
                  ];
                  return steps.map((step, i) => (""".replace('                  ', '                  ')

if old_steps_block not in content:
    print("DEBUG: Looking for exact steps block...")
    # Try a more lenient search
    if 'const steps: string[] = [];' in content and 'steps.push(fromBuilding ?' in content:
        print("Found the steps block via lenient search")
    print("FAILED: Could not find steps block")
    sys.exit(1)

content = content.replace(old_steps_block, new_steps_block, 1)
print("3. Updated navigation card steps to use graph-based steps when available")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("ALL 3 CHANGES APPLIED SUCCESSFULLY!")
