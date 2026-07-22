import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

files_fixed = 0

# Fix 1: AdminAnnouncementsPage.tsx
path1 = 'src/pages/AdminAnnouncementsPage.tsx'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()

old1 = '        <input\n            type="text"\n            value={search}\n            onChange={(e) => setSearch(e.target.value)}\n            placeholder="Search announcements..."'
new1 = '        <input id="announcement-search"\n            type="text"\n            value={search}\n            onChange={(e) => setSearch(e.target.value)}\n            placeholder="Search announcements..."'
if old1 in content:
    content = content.replace(old1, new1)
    with open(path1, 'w', encoding='utf-8') as f:
        f.write(content)
    files_fixed += 1
    print(f"FIX 1: AdminAnnouncementsPage")
else:
    # Try alternative pattern
    old1b = '<input\n            type="text"\n            value={search}\n            onChange={(e) => setSearch(e.target.value)}\n            placeholder="Search announcements..."'
    if old1b in content:
        content = content.replace(old1b, new1)
        with open(path1, 'w', encoding='utf-8') as f:
            f.write(content)
        files_fixed += 1
        print(f"FIX 1b: AdminAnnouncementsPage (alt)")
    else:
        print("WARN: AdminAnnouncementsPage NOT FOUND")

# Fix 2: AdminLocationsPage.tsx
path2 = 'src/pages/AdminLocationsPage.tsx'
with open(path2, 'r', encoding='utf-8') as f:
    content = f.read()

old2 = '        <input type="text" placeholder="Search locations..." value={search} onChange={(e) => setSearch(e.target.value)}'
new2 = '        <input id="location-search" type="text" placeholder="Search locations..." value={search} onChange={(e) => setSearch(e.target.value)}'
if old2 in content:
    content = content.replace(old2, new2)
    with open(path2, 'w', encoding='utf-8') as f:
        f.write(content)
    files_fixed += 1
    print(f"FIX 2: AdminLocationsPage")
else:
    print("WARN: AdminLocationsPage NOT FOUND")

# Fix 3: AdminRoutesPage.tsx
path3 = 'src/pages/AdminRoutesPage.tsx'
with open(path3, 'r', encoding='utf-8') as f:
    content = f.read()

old3 = '          <input type="text" placeholder="Search routes..." value={search} onChange={e => setSearch(e.target.value)}'
new3 = '          <input id="route-search" type="text" placeholder="Search routes..." value={search} onChange={e => setSearch(e.target.value)}'
if old3 in content:
    content = content.replace(old3, new3)
    with open(path3, 'w', encoding='utf-8') as f:
        f.write(content)
    files_fixed += 1
    print(f"FIX 3: AdminRoutesPage")
else:
    print("WARN: AdminRoutesPage NOT FOUND")

# Fix 4: AdminUsersPage.tsx
path4 = 'src/pages/AdminUsersPage.tsx'
with open(path4, 'r', encoding='utf-8') as f:
    content = f.read()

old4 = '          <input type="text" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)}'
new4 = '          <input id="user-search" type="text" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)}'
if old4 in content:
    content = content.replace(old4, new4)
    with open(path4, 'w', encoding='utf-8') as f:
        f.write(content)
    files_fixed += 1
    print(f"FIX 4: AdminUsersPage")
else:
    print("WARN: AdminUsersPage NOT FOUND")

# Fix 5: AdminBuildingsPage.tsx
path5 = 'src/pages/AdminBuildingsPage.tsx'
with open(path5, 'r', encoding='utf-8') as f:
    content = f.read()

old5 = '          <input\n            type="text"\n            value={search}\n            onChange={handleSearchChange}\n            placeholder="Search buildings by name, code, or department..."'
new5 = '          <input id="building-search"\n            type="text"\n            value={search}\n            onChange={handleSearchChange}\n            placeholder="Search buildings by name, code, or department..."'
if old5 in content:
    content = content.replace(old5, new5)
    with open(path5, 'w', encoding='utf-8') as f:
        f.write(content)
    files_fixed += 1
    print(f"FIX 5: AdminBuildingsPage")
else:
    print("WARN: AdminBuildingsPage NOT FOUND")

# Fix 6: AdminEventsPage.tsx - feature input
path6 = 'src/pages/AdminEventsPage.tsx'
with open(path6, 'r', encoding='utf-8') as f:
    content = f.read()

old6 = '              <input type="text" value={featureInput} onChange={e => setFeatureInput(e.target.value)}'
new6 = '              <input id="event-feature-input" type="text" value={featureInput} onChange={e => setFeatureInput(e.target.value)}'
if old6 in content:
    content = content.replace(old6, new6)
    with open(path6, 'w', encoding='utf-8') as f:
        f.write(content)
    files_fixed += 1
    print(f"FIX 6: AdminEventsPage feature input")
else:
    print("WARN: AdminEventsPage feature input NOT FOUND")

print(f"\nTotal files fixed: {files_fixed}")
