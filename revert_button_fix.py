# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace') # type: ignore

# Fix: isLoading IS a valid prop in Button component - revert the "disabled" change
for filepath, old, new in [
    ('src/pages/RegistrationPage.tsx',
     'disabled={loading} className="flex-1 h-11">',
     'isLoading={loading} className="flex-1 h-11">'),
    ('src/pages/AdminLoginPage.tsx',
     'disabled={loading} className="w-full h-11">',
     'isLoading={loading} className="w-full h-11">'),
]:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old in content:
        content = content.replace(old, new)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Reverted: {filepath}")
    else:
        print(f"Not found in: {filepath}")

print("Done reverting")
