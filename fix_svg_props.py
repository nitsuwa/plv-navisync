with open('src/pages/CampusMapPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Fix flood-color -> floodColor (React camelCase for SVG attributes)
if 'flood-color' in content:
    content = content.replace('flood-color=', 'floodColor=')
    changes += 1
    print("FIX 1: flood-color -> floodColor")

# Fix flood-opacity -> floodOpacity
if 'flood-opacity' in content:
    content = content.replace('flood-opacity=', 'floodOpacity=')
    changes += 1
    print("FIX 2: flood-opacity -> floodOpacity")

with open('src/pages/CampusMapPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Total SVG fixes: {changes}")
