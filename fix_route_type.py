# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = "src/pages/CampusMapPage.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = "return { points, dist: calcDist(points), mins: Math.max(1, Math.round(calcDist(points)/80)) };"
new = "return { points, dist: calcDist(points), mins: Math.max(1, Math.round(calcDist(points)/80)), steps: undefined, isGraphBased: false };"

if old not in content:
    print("ERROR: Old string not found!")
    sys.exit(1)

content = content.replace(old, new, 1)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("OK: Fallback route return now includes steps:undefined and isGraphBased:false")
