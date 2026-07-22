# -*- coding: utf-8 -*-
import sys
import os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore

"""
Fix all critical issues across admin CRUD pages.
"""

# Read the current admin buildings page to check state
with open('src/pages/AdminBuildingsPage.tsx', 'r', encoding='utf-8') as f:
    abp = f.read()

has_form_errors = 'const [formErrors, setFormErrors]' in abp
has_fix_any = "form[key]" in abp and "(form as any)[key]" not in abp

print(f"AdminBuildingsPage checking... formErrors: {has_form_errors}, as any fix: {not abp.__contains__('(form as any)[key]') if has_fix_any else False}")

# Rewrite the file with all fixes applied
# Add formErrors state after the form state
abp = abp.replace(
    "  const [form, setForm] = useState(initialForm);\n  const modal = useCrudModal<Building>();",
    "  const [form, setForm] = useState(initialForm);\n  const [formErrors, setFormErrors] = useState<Record<string, string>>({});\n  const modal = useCrudModal<Building>();"
)

# Update openAdd to clear errors
abp = abp.replace(
    "  const openAdd = () => {\n    setForm(initialForm);\n    modal.openAdd();\n  };",
    "  const openAdd = () => {\n    setForm(initialForm);\n    setFormErrors({});\n    modal.openAdd();\n  };"
)

# Update openEdit to clear errors
abp = abp.replace(
    "  const openEdit = (b: Building) => {\n    setForm({\n      name: b.name, code: b.code, description: b.description,\n      category: b.category, floor_count: b.floor_count,\n      operating_hours: b.operating_hours ?? \"\", contact: b.contact ?? \"\",\n    });\n    modal.openEdit(b);\n  };",
    "  const openEdit = (b: Building) => {\n    setForm({\n      name: b.name, code: b.code, description: b.description,\n      category: b.category, floor_count: b.floor_count,\n      operating_hours: b.operating_hours ?? \"\", contact: b.contact ?? \"\",\n    });\n    setFormErrors({});\n    modal.openEdit(b);\n  };"
)

# Update handleSave to validate
abp = abp.replace(
    "  const handleSave = async () => {\n    if (!form.name.trim() || !form.code.trim()) return;\n    if (modal.editTarget) {",
    "  const handleSave = async () => {\n    const errors: Record<string, string> = {};\n    if (!form.name.trim()) errors.name = \"Building name is required\";\n    if (!form.code.trim()) errors.code = \"Building code is required\";\n    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }\n    setFormErrors({});\n    if (modal.editTarget) {"
)

# Fix the as any + add error display to dynamic form fields
abp = abp.replace(
    '{ key: "name", placeholder: "e.g. Main Academic Building" },',
    '{ key: "name" as const, placeholder: "e.g. Main Academic Building" },'
)
abp = abp.replace(
    '{ key: "code", placeholder: "e.g. MAB" },',
    '{ key: "code" as const, placeholder: "e.g. MAB" },'
)
abp = abp.replace(
    'value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}',
    'value={form[key]} onChange={(e) => { setForm({ ...form, [key]: e.target.value }); if (formErrors[key]) setFormErrors(prev => { const n = {...prev}; delete n[key]; return n; }); }}'
)
abp = abp.replace(
    'className=\"w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-shadow\" />\n                </div>\n              ))}',
    'className={\"w-full h-10 px-4 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm transition-shadow \" + (formErrors[key] ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />\n                  {formErrors[key] && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors[key]}</p>}\n                </div>\n              ))}'
)

with open('src/pages/AdminBuildingsPage.tsx', 'w', encoding='utf-8') as f:
    f.write(abp)
print("1. AdminBuildingsPage: done")

# --- AdminUsersPage ---
with open('src/pages/AdminUsersPage.tsx', 'r', encoding='utf-8') as f:
    aup = f.read()

# Add formErrors state
aup = aup.replace(
    "  const [form, setForm] = useState({\n    name: \"\", email: \"\", role: \"staff\" as User[\"role\"], department: \"\", status: \"active\" as User[\"status\"],\n  });",
    "  const [form, setForm] = useState({\n    name: \"\", email: \"\", role: \"staff\" as User[\"role\"], department: \"\", status: \"active\" as User[\"status\"],\n  });\n  const [formErrors, setFormErrors] = useState<Record<string, string>>({});"
)

# Update openAdd to clear errors
aup = aup.replace(
    "  const openAdd = () => {\n    setForm({ name: \"\", email: \"\", role: \"staff\", department: \"\", status: \"active\" });\n    setEditTarget(null);\n    setShowModal(true);\n  };",
    "  const openAdd = () => {\n    setForm({ name: \"\", email: \"\", role: \"staff\", department: \"\", status: \"active\" });\n    setFormErrors({});\n    setEditTarget(null);\n    setShowModal(true);\n  };"
)

# Update openEdit to clear errors
aup = aup.replace(
    "  const openEdit = (u: User) => {\n    setForm({ name: u.name, email: u.email, role: u.role, department: u.department, status: u.status });\n    setEditTarget(u);\n    setShowModal(true);\n  };",
    "  const openEdit = (u: User) => {\n    setForm({ name: u.name, email: u.email, role: u.role, department: u.department, status: u.status });\n    setFormErrors({});\n    setEditTarget(u);\n    setShowModal(true);\n  };"
)

# Update handleSave to validate
aup = aup.replace(
    """  const handleSave = () => {
    const initials = form.name.split(\" \").map((w) => w[0]).join(\"\").slice(0, 2).toUpperCase();
    if (editTarget) {""",
    """  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = \"Name is required\";
    if (!form.email.trim()) errors.email = \"Email is required\";
    else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email)) errors.email = \"Invalid email format\";
    if (!form.department.trim()) errors.department = \"Department is required\";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    const initials = form.name.split(\" \").map((w) => w[0]).join(\"\").slice(0, 2).toUpperCase();
    if (editTarget) {"""
)

# Fix as any and add errors in dynamic fields
aup = aup.replace(
    '{ key: "name", type: "text", placeholder: "e.g. Dr. Maria Santos" },',
    '{ key: "name" as const, type: "text", placeholder: "e.g. Dr. Maria Santos" },'
)
aup = aup.replace(
    '{ key: "email", type: "email", placeholder: "user@plv.edu.ph" },',
    '{ key: "email" as const, type: "email", placeholder: "user@plv.edu.ph" },'
)
aup = aup.replace(
    '{ key: "department", type: "text", placeholder: "e.g. College of Engineering" },',
    '{ key: "department" as const, type: "text", placeholder: "e.g. College of Engineering" },'
)
aup = aup.replace(
    'value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}',
    'value={form[key]} onChange={(e) => { setForm({ ...form, [key]: e.target.value }); if (formErrors[key]) setFormErrors(prev => { const n = {...prev}; delete n[key]; return n; }); }} placeholder={placeholder}'
)
aup = aup.replace(
    'className=\"w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm\" />\n                </div>\n              ))}',
    'className={\"w-full h-10 px-4 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm \" + (formErrors[key] ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />\n                  {formErrors[key] && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors[key]}</p>}\n                </div>\n              ))}'
)

with open('src/pages/AdminUsersPage.tsx', 'w', encoding='utf-8') as f:
    f.write(aup)
print("2. AdminUsersPage: done")

# --- AdminLocationsPage ---
with open('src/pages/AdminLocationsPage.tsx', 'r', encoding='utf-8') as f:
    alp = f.read()

# Add formErrors state
alp = alp.replace(
    "  const [form, setForm] = useState({\n    name: \"\", type: \"landmark\" as CampusLocation[\"type\"], description: \"\",\n    latitude: \"\", longitude: \"\",\n  });",
    "  const [form, setForm] = useState({\n    name: \"\", type: \"landmark\" as CampusLocation[\"type\"], description: \"\",\n    latitude: \"\", longitude: \"\",\n  });\n  const [formErrors, setFormErrors] = useState<Record<string, string>>({});"
)

# Update openAdd, openEdit to clear errors
alp = alp.replace(
    "  const openAdd = () => {\n    setForm({ name: \"\", type: \"landmark\", description: \"\", latitude: \"\", longitude: \"\" });\n    setEditTarget(null);\n    setShowModal(true);\n  };",
    "  const openAdd = () => {\n    setForm({ name: \"\", type: \"landmark\", description: \"\", latitude: \"\", longitude: \"\" });\n    setFormErrors({});\n    setEditTarget(null);\n    setShowModal(true);\n  };"
)
alp = alp.replace(
    "  const openEdit = (l: CampusLocation) => {\n    setForm({\n      name: l.name, type: l.type, description: l.description ?? \"\",\n      latitude: l.latitude?.toString() ?? \"\", longitude: l.longitude?.toString() ?? \"\",\n    });\n    setEditTarget(l);\n    setShowModal(true);\n  };",
    "  const openEdit = (l: CampusLocation) => {\n    setForm({\n      name: l.name, type: l.type, description: l.description ?? \"\",\n      latitude: l.latitude?.toString() ?? \"\", longitude: l.longitude?.toString() ?? \"\",\n    });\n    setFormErrors({});\n    setEditTarget(l);\n    setShowModal(true);\n  };"
)

# Update handleSave to validate
alp = alp.replace(
    "  const handleSave = () => {\n    if (editTarget) {",
    "  const handleSave = () => {\n    const errors: Record<string, string> = {};\n    if (!form.name.trim()) errors.name = \"Location name is required\";\n    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }\n    setFormErrors({});\n    if (editTarget) {"
)

# Fix 'as any' cast
alp = alp.replace(
    '(typeColors[loc.type] as any) ?? "default"',
    '(typeColors[loc.type] as string) ?? "default"'
)

# Fix location name input with validation
alp = alp.replace(
    """                  <label htmlFor=\"location-name\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Location Name</label>
                  <input id=\"location-name\" type=\"text\" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder=\"e.g. Main Gate\" className=\"w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm\" />""",
    """                  <label htmlFor=\"location-name\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Location Name *</label>
                  <input id=\"location-name\" type=\"text\" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); if (formErrors.name) setFormErrors(prev => { const n = {...prev}; delete n.name; return n; }); }}
                    placeholder=\"e.g. Main Gate\" className={\"w-full h-10 px-4 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm \" + (formErrors.name ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />
                  {formErrors.name && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors.name}</p>}"""
)

with open('src/pages/AdminLocationsPage.tsx', 'w', encoding='utf-8') as f:
    f.write(alp)
print("3. AdminLocationsPage: done")

# --- AdminAnnouncementsPage ---
with open('src/pages/AdminAnnouncementsPage.tsx', 'r', encoding='utf-8') as f:
    aap = f.read()

# Add formErrors state
aap = aap.replace(
    "  const [form, setForm] = useState({\n    title: \"\", content: \"\", category: \"general\" as Announcement[\"category\"],\n    priority: \"normal\" as Announcement[\"priority\"], author: \"\", expires_at: \"\",\n  });",
    "  const [form, setForm] = useState({\n    title: \"\", content: \"\", category: \"general\" as Announcement[\"category\"],\n    priority: \"normal\" as Announcement[\"priority\"], author: \"\", expires_at: \"\",\n  });\n  const [formErrors, setFormErrors] = useState<Record<string, string>>({});"
)

# Update openAdd, openEdit to clear errors
aap = aap.replace(
    "  const openAdd = () => {\n    setForm({ title: \"\", content: \"\", category: \"general\", priority: \"normal\", author: \"\", expires_at: \"\" });\n    setEditTarget(null);\n    setShowModal(true);\n  };",
    "  const openAdd = () => {\n    setForm({ title: \"\", content: \"\", category: \"general\", priority: \"normal\", author: \"\", expires_at: \"\" });\n    setFormErrors({});\n    setEditTarget(null);\n    setShowModal(true);\n  };"
)
aap = aap.replace(
    "  const openEdit = (a: Announcement) => {\n    setForm({ title: a.title, content: a.content, category: a.category, priority: a.priority, author: a.author, expires_at: a.expires_at ?? \"\" });\n    setEditTarget(a);\n    setShowModal(true);\n  };",
    "  const openEdit = (a: Announcement) => {\n    setForm({ title: a.title, content: a.content, category: a.category, priority: a.priority, author: a.author, expires_at: a.expires_at ?? \"\" });\n    setFormErrors({});\n    setEditTarget(a);\n    setShowModal(true);\n  };"
)

# Update handleSave to validate
aap = aap.replace(
    """  const handleSave = () => {
    if (editTarget) {""",
    """  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = \"Title is required\";
    if (!form.content.trim()) errors.content = \"Content is required\";
    if (!form.author.trim()) errors.author = \"Author is required\";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    if (editTarget) {"""
)

# Add validation to title field
aap = aap.replace(
    "onChange={(e) => setForm({ ...form, title: e.target.value })}",
    "onChange={(e) => { setForm({ ...form, title: e.target.value }); if (formErrors.title) setFormErrors(prev => { const n = {...prev}; delete n.title; return n; }); }}"
)
# Only replace the first one (title field) - add error display
aap = aap.replace(
    """<input id=\"announcement-title\" type=\"text\" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); if (formErrors.title) setFormErrors(prev => { const n = {...prev}; delete n.title; return n; }); }}
                    placeholder=\"Announcement title\" className=\"w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm\" />""",
    """<input id=\"announcement-title\" type=\"text\" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); if (formErrors.title) setFormErrors(prev => { const n = {...prev}; delete n.title; return n; }); }}
                    placeholder=\"Announcement title\" className={\"w-full h-10 px-4 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm \" + (formErrors.title ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />
                  {formErrors.title && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors.title}</p>}"""
)

# Fix content field  
aap = aap.replace(
    """<label htmlFor=\"announcement-content\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Content *</label>
                  <textarea id=\"announcement-content\" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}"""
    if "Content *" in aap else
    """<label htmlFor=\"announcement-content\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Content</label>
                  <textarea id=\"announcement-content\" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}""",
    """<label htmlFor=\"announcement-content\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Content *</label>
                  <textarea id=\"announcement-content\" value={form.content} onChange={(e) => { setForm({ ...form, content: e.target.value }); if (formErrors.content) setFormErrors(prev => { const n = {...prev}; delete n.content; return n; }); }}"""
)
aap = aap.replace(
    'className=\"w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none\" />\n                  {formErrors.content',
    'className={\"w-full px-4 py-2.5 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm resize-none \" + (formErrors.content ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />\n                  {formErrors.content'
)
# Add the content error message if not already there
if '{formErrors.content}' not in aap:
    aap = aap.replace(
        'placeholder=\"Full announcement content...\" rows={4}\n                    className={\"w-full px-4 py-2.5 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm resize-none \" + (formErrors.content ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />',
        'placeholder=\"Full announcement content...\" rows={4}\n                    className={\"w-full px-4 py-2.5 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm resize-none \" + (formErrors.content ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />\n                  {formErrors.content && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors.content}</p>}'
    )

# Fix author field
aap = aap.replace(
    """<label htmlFor=\"announcement-author\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Author *</label>
                  <input id=\"announcement-author\" type=\"text\" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}"""
    if "Author *" in aap else
    """<label htmlFor=\"announcement-author\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Author</label>
                  <input id=\"announcement-author\" type=\"text\" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}""",
    """<label htmlFor=\"announcement-author\" className=\"block text-sm font-semibold text-foreground mb-1.5\">Author *</label>
                  <input id=\"announcement-author\" type=\"text\" value={form.author} onChange={(e) => { setForm({ ...form, author: e.target.value }); if (formErrors.author) setFormErrors(prev => { const n = {...prev}; delete n.author; return n; }); }}"""
)
aap = aap.replace(
    """placeholder=\"e.g. Office of the Registrar\" className=\"w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm\" /></div>""",
    """placeholder=\"e.g. Office of the Registrar\" className={\"w-full h-10 px-4 rounded-xl bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm \" + (formErrors.author ? \"border-destructive focus:ring-destructive/30\" : \"border-border focus:border-primary\")} />
                  {formErrors.author && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors.author}</p>}</div>"""
)

with open('src/pages/AdminAnnouncementsPage.tsx', 'w', encoding='utf-8') as f:
    f.write(aap)
print("4. AdminAnnouncementsPage: done")

# --- AdminEventsPage ---
with open('src/pages/AdminEventsPage.tsx', 'r', encoding='utf-8') as f:
    aep = f.read()

# Add formErrors to EventModal
aep = aep.replace(
    "  const [featureInput, setFeatureInput] = useState(\"\");",
    """  const [featureInput, setFeatureInput] = useState(\"\");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});"""
)

# Update handleSave to validate
aep = aep.replace(
    """  const handleSave = () => {
    if (!form.title || !form.venue || !form.dateStart) return;
    onSave({""",
    """  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.title?.trim()) errors.title = \"Event title is required\";
    if (!form.venue?.trim()) errors.venue = \"Venue is required\";
    if (!form.dateStart?.trim()) errors.dateStart = \"Start date is required\";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    onSave({"""
)

# Add validation to title field
aep = aep.replace(
    """<input id=\"event-title\" type=\"text\" value={form.title ?? \"\"} onChange={e => update(\"title\", e.target.value)}
                placeholder=\"e.g. PLV Foundation Day 2025\" className={inputCls} style={{ fontFamily:\"var(--font-body)\" }}/>""",
    """<input id=\"event-title\" type=\"text\" value={form.title ?? \"\"} onChange={e => { update(\"title\", e.target.value); if (formErrors.title) setFormErrors(prev => { const n = {...prev}; delete n.title; return n; }); }}
                placeholder=\"e.g. PLV Foundation Day 2025\" className={inputCls + (formErrors.title ? \" border-destructive focus:ring-destructive/30\" : \"\")} style={{ fontFamily:\"var(--font-body)\" }}/>
              {formErrors.title && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors.title}</p>}"""
)

# Add validation to venue field
aep = aep.replace(
    """<input id=\"event-venue\" type=\"text\" value={form.venue ?? \"\"} onChange={e => update(\"venue\", e.target.value)}
                placeholder=\"Campus-wide / GYM…\" className={inputCls} style={{ fontFamily:\"var(--font-body)\" }}/>""",
    """<input id=\"event-venue\" type=\"text\" value={form.venue ?? \"\"} onChange={e => { update(\"venue\", e.target.value); if (formErrors.venue) setFormErrors(prev => { const n = {...prev}; delete n.venue; return n; }); }}
                placeholder=\"Campus-wide / GYM…\" className={inputCls + (formErrors.venue ? \" border-destructive focus:ring-destructive/30\" : \"\")} style={{ fontFamily:\"var(--font-body)\" }}/>
              {formErrors.venue && <p className=\"text-[10px] text-destructive mt-1 font-medium\">{formErrors.venue}</p>}"""
)

with open('src/pages/AdminEventsPage.tsx', 'w', encoding='utf-8') as f:
    f.write(aep)
print("5. AdminEventsPage: done")

# --- Fix isLoading props ---
for filepath, old, new in [
    ('src/pages/RegistrationPage.tsx', 
     '<Button type="submit" variant="primary" size="lg" isLoading={loading} className="flex-1 h-11">',
     '<Button type="submit" variant="primary" size="lg" disabled={loading} className="flex-1 h-11">'),
    ('src/pages/AdminLoginPage.tsx',
     '<Button type="submit" variant="primary" size="lg" isLoading={loading} className="w-full h-11">',
     '<Button type="submit" variant="primary" size="lg" disabled={loading} className="w-full h-11">'),
]:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"6. {filepath}: done")

print("\nAll fixes applied successfully!")
