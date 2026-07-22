import re

with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Fix 1: Add QrCode to lucide-react import
old_import1 = "  Footprints,\n} from \"lucide-react\";"
new_import1 = "  Footprints, QrCode,\n} from \"lucide-react\";"

if old_import1 in content:
    content = content.replace(old_import1, new_import1)
    changes += 1
    print("FIX 1: Added QrCode to lucide-react import")
else:
    print("WARN: lucide-react import not found")

# Fix 2: Add QRPlaceholder to map components import
old_import2 = "import {\n  BuildingPicker, ReportModal, EventPopup, SignInPrompt,\n  BuildingInfoPanel, MobileBuildingSheet, type PanelTab,\n} from \"../components/map\";"
new_import2 = "import {\n  BuildingPicker, ReportModal, EventPopup, SignInPrompt,\n  BuildingInfoPanel, MobileBuildingSheet, QRPlaceholder, type PanelTab,\n} from \"../components/map\";"

# Try exact match first
if old_import2 in content:
    content = content.replace(old_import2, new_import2)
    changes += 1
    print("FIX 2a: Added QRPlaceholder to map components import (exact match)")
else:
    # Try with different spacing
    old_import2b = "import {\n  BuildingPicker, ReportModal, EventPopup, SignInPrompt,\n  BuildingInfoPanel, MobileBuildingSheet, type PanelTab\n} from \"../components/map\";"
    new_import2b = "import {\n  BuildingPicker, ReportModal, EventPopup, SignInPrompt,\n  BuildingInfoPanel, MobileBuildingSheet, QRPlaceholder, type PanelTab\n} from \"../components/map\";"
    if old_import2b in content:
        content = content.replace(old_import2b, new_import2b)
        changes += 1
        print("FIX 2b: Added QRPlaceholder to map components import (alt spacing)")
    else:
        # Try one-line
        old_import2c = "import { BuildingPicker, ReportModal, EventPopup, SignInPrompt,\n  BuildingInfoPanel, MobileBuildingSheet, type PanelTab,\n} from \"../components/map\";"
        new_import2c = "import { BuildingPicker, ReportModal, EventPopup, SignInPrompt,\n  BuildingInfoPanel, MobileBuildingSheet, QRPlaceholder, type PanelTab,\n} from \"../components/map\";"
        if old_import2c in content:
            content = content.replace(old_import2c, new_import2c)
            changes += 1
            print("FIX 2c: Added QRPlaceholder to map components import (one-line)")
        else:
            print("WARN: map components import not found with any pattern")

with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTotal fixes applied: {changes}")
