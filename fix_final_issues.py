# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore

with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Fix 1: Remove dead routeArrived state — keep only showArrival
old = "  const [showArrival, setShowArrival] = useState(false);\n  const [routeArrived, setRouteArrived] = useState(false);"
new = "  const [showArrival, setShowArrival] = useState(false);"
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("1. Removed dead routeArrived state")

# Fix 2: Remove all references to routeArrived
content = content.replace("setRouteArrived(false);", "")
content = content.replace("setRouteArrived(true);", "")
content = content.replace("      setRouteArrived(false);\n", "")
content = content.replace("      setRouteArrived(true);\n", "")

# Fix 3: Remove empty if/else blocks that only had routeArrived calls
# Clean up the empty branches
old = """    } else {
      setShowArrival(false);
    }"""
# Check if there's an empty else with only setShowArrival
# The effect should be clean now

print(f"\n--- Applied {changes} fixes ---")

with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
