import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Users, Plus, Search, Pencil, Trash2, X, Shield, Mail, Phone, UserPlus } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { FormField } from "../components/ui/FormField";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchBar } from "../components/ui/SearchBar";
import { cn } from "../lib/utils";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "faculty" | "staff" | "moderator";
  department: string;
  status: "active" | "inactive";
  last_login: string;
  avatar_initials: string;
}

const MOCK_USERS: User[] = [
  { id: "u1", name: "Dr. Maria Santos", email: "m.santos@plv.edu.ph", role: "admin", department: "Office of the President", status: "active", last_login: "2025-01-15T08:30:00Z", avatar_initials: "MS" },
  { id: "u2", name: "Engr. Juan Dela Cruz", email: "j.delacruz@plv.edu.ph", role: "faculty", department: "College of Engineering", status: "active", last_login: "2025-01-14T14:22:00Z", avatar_initials: "JD" },
  { id: "u3", name: "Ana Reyes", email: "a.reyes@plv.edu.ph", role: "staff", department: "Library Services", status: "active", last_login: "2025-01-13T09:10:00Z", avatar_initials: "AR" },
  { id: "u4", name: "Prof. Carlo Mendoza", email: "c.mendoza@plv.edu.ph", role: "moderator", department: "Student Affairs", status: "active", last_login: "2025-01-12T16:45:00Z", avatar_initials: "CM" },
  { id: "u5", name: "Rosa Lim", email: "r.lim@plv.edu.ph", role: "staff", department: "Finance Office", status: "inactive", last_login: "2024-12-28T11:00:00Z", avatar_initials: "RL" },
  { id: "u6", name: "Mark Torres", email: "m.torres@plv.edu.ph", role: "faculty", department: "College of Arts & Sciences", status: "active", last_login: "2025-01-11T10:30:00Z", avatar_initials: "MT" },
];

const ROLE_CONFIG: Record<User["role"], { label: string; variant: any; color: string }> = {
  admin: { label: "Admin", variant: "default", color: "bg-primary/10 text-primary" },
  faculty: { label: "Faculty", variant: "accent", color: "bg-accent/15 text-accent" },
  staff: { label: "Staff", variant: "secondary", color: "bg-secondary text-secondary-foreground" },
  moderator: { label: "Moderator", variant: "success", color: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
};

const avatarColors = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-green-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-violet-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setUsers(MOCK_USERS);
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  const [form, setForm] = useState({
    name: "", email: "", role: "staff" as User["role"], department: "", status: "active" as User["status"],
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filtered = users.filter((u) => {
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const matchSearch =
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.department.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const openAdd = () => {
    setForm({ name: "", email: "", role: "staff", department: "", status: "active" });
    setFormErrors({});
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setForm({ name: u.name, email: u.email, role: u.role, department: u.department, status: u.status });
    setFormErrors({});
    setEditTarget(u);
    setShowModal(true);
  };

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Invalid email format";
    if (!form.department.trim()) errors.department = "Department is required";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    const initials = form.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    if (editTarget) {
      setUsers((prev) => prev.map((u) => u.id === editTarget.id ? { ...u, ...form, avatar_initials: initials } : u));
      toast.success("User updated", `${form.name}'s account has been updated.`);
    } else {
      const nu: User = {
        ...form, id: `u${Date.now()}`, last_login: new Date().toISOString(), avatar_initials: initials,
      };
      setUsers((prev) => [...prev, nu]);
      toast.success("User added", `${form.name} has been added as ${form.role}.`);
    }
    setShowModal(false);
  };

  const toggleStatus = (id: string) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u));
  };

  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    admins: users.filter((u) => u.role === "admin").length,
  };

  if (loading) return <TablePageSkeleton rows={6} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{users.length} registered users · {stats.active} active</p>
        </div>
        <Button onClick={openAdd} variant="primary">
          <Plus className="h-3.5 w-3.5" /> Add User
        </Button>
      </div>

      {/* Summary cards */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {[
          { label: "Total Users", value: stats.total, icon: Users, cx: "bg-primary/8 text-primary" },
          { label: "Active Users", value: stats.active, icon: Shield, cx: "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400" },
          { label: "Administrators", value: stats.admins, icon: Shield, cx: "bg-accent/15 text-accent" },
        ].map(({ label, value, icon: Icon, cx }, i) => (
          <motion.div
            key={label}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="bg-card rounded-2xl border border-border shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-extrabold text-foreground mt-1">{value}</p>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", cx)}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 max-w-sm">
          <SearchBar
            placeholder="Search users..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            showShortcutHint
            size="md"
          />
        </div>
        <div className="flex gap-1.5">
          {["all", "admin", "faculty", "staff", "moderator"].map((r) => (
            <button key={r} type="button" onClick={() => setRoleFilter(r)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize active:scale-[0.97]",
              roleFilter === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary")}>
              {r === "all" ? "All Roles" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Role</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Department</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Status</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, idx) => {
                const rc = ROLE_CONFIG[user.role];
                const gradientClass = avatarColors[idx % avatarColors.length];
                return (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center shrink-0 shadow-sm`}>
                          <span className="text-xs font-extrabold text-white">{user.avatar_initials}</span>
                        </div>
                        <div>
                          <p className="font-bold text-foreground text-sm">{user.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />{user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold", rc.color)}>{rc.label}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell text-muted-foreground text-sm">{user.department}</td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <button onClick={() => toggleStatus(user.id)}
                        type="button"
                        aria-pressed={user.status === "active"}
                        className={cn("px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
                          user.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200"
                            : "bg-muted text-muted-foreground hover:bg-secondary"
                        )}>
                        {user.status === "active" ? "● Active" : "○ Inactive"}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" aria-label="Edit user" onClick={() => openEdit(user)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary active:scale-90 transition-all">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label="Delete user" onClick={() => setDeleteId(user.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            icon={search || roleFilter !== "all" ? Search : UserPlus}
            title={search || roleFilter !== "all" ? "No matching users" : "No users yet"}
            description={(search || roleFilter !== "all")
              ? "We couldn't find any users matching your search or role filter. Try different terms or clear the filters to see all users."
              : "Invite administrators, faculty, and staff to collaborate on managing the campus navigation system."
            }
            action={(search || roleFilter !== "all") ? (
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setRoleFilter("all"); }}>
                Clear Filters
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5" /> Add User
              </Button>
            )}
          />
        )}
      </motion.div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label="Add or edit user">           <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in scrollbar-show-on-hover">
             <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
              <h2 className="font-extrabold text-foreground">{editTarget ? "Edit User" : "Add User"}</h2>
              <button type="button" aria-label="Close modal" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <FormField
                label="Full Name" id="name" value={form.name}
                onChange={(v) => { setForm(f => ({ ...f, name: v })); if (formErrors.name) setFormErrors(prev => { const n = {...prev}; delete n.name; return n; }); }}
                error={formErrors.name} placeholder="e.g. Dr. Maria Santos" required
                helper="First and last name"
              />
              <FormField
                label="Email" id="email" value={form.email} type="email"
                onChange={(v) => { setForm(f => ({ ...f, email: v })); if (formErrors.email) setFormErrors(prev => { const n = {...prev}; delete n.email; return n; }); }}
                error={formErrors.email} placeholder="user@plv.edu.ph" required
                helper="Must be a valid PLV email address"
              />
              <FormField
                label="Department" id="department" value={form.department}
                onChange={(v) => { setForm(f => ({ ...f, department: v })); if (formErrors.department) setFormErrors(prev => { const n = {...prev}; delete n.department; return n; }); }}
                error={formErrors.department} placeholder="e.g. College of Engineering" required
                helper="Department or office assigned to"
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-role" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Role</label>
                  <select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User["role"] })}
                    className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                    {["admin", "faculty", "staff", "moderator"].map((r) => (
                      <option key={r} value={r} className="capitalize">{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="user-status" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Status</label>
                  <select id="user-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as User["status"] })}
                    className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={handleSave} className="flex-1">
                {editTarget ? "Save Changes" : "Add User"}
              </Button>
          </div>
        </div>
      </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirm delete user">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center animate-scale-in">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="font-extrabold text-foreground mb-1">Delete User?</h3>
            <p className="text-sm text-muted-foreground mb-5">This will permanently remove this user account and revoke all access.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
              <Button variant="danger" onClick={() => { const deleted = users.find(u => u.id === deleteId); setUsers((p) => p.filter((u) => u.id !== deleteId)); setDeleteId(null); if (deleted) toast.success("User deleted", `${deleted.name}'s account has been removed.`); }} className="flex-1">Delete User</Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
