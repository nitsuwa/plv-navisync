import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

files_fixed = 0

# Fix 1: AdminAnnouncementsPage - try more lenient approach
with open('src/pages/AdminAnnouncementsPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Target the search input specifically - find 'Search announcements...' placeholder
if 'id="announcement-search"' not in content:
    # Replace the first <input type="text" ... Search announcements
    import re
    new = content.replace(
        'placeholder="Search announcements..."',
        'id="announcement-search" placeholder="Search announcements..."'
    )
    if new != content:
        content = new
        files_fixed += 1
        print("FIX 1: AdminAnnouncementsPage")
    
    with open('src/pages/AdminAnnouncementsPage.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
else:
    print("OK: AdminAnnouncementsPage already fixed")

# Fix 2: AdminLocationsPage
with open('src/pages/AdminLocationsPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'id="location-search"' not in content:
    new = content.replace(
        'placeholder="Search locations..."',
        'id="location-search" placeholder="Search locations..."'
    )
    if new != content:
        content = new
        files_fixed += 1
        print("FIX 2: AdminLocationsPage")
    
    with open('src/pages/AdminLocationsPage.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
else:
    print("OK: AdminLocationsPage already fixed")

# Fix 3: AdminBuildingsPage
with open('src/pages/AdminBuildingsPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'id="building-search"' not in content:
    new = content.replace(
        'placeholder="Search buildings by name, code, or department..."',
        'id="building-search" placeholder="Search buildings by name, code, or department..."'
    )
    if new != content:
        content = new
        files_fixed += 1
        print("FIX 3: AdminBuildingsPage")
    
    with open('src/pages/AdminBuildingsPage.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
else:
    print("OK: AdminBuildingsPage already fixed")

print(f"\nTotal remaining fixes: {files_fixed}")
