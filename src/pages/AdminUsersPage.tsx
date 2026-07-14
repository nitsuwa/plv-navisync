import { useState, useEffect } from "react";
import { Users, Plus, Search, Pencil, Trash2, X, Shield, Mail, Phone } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
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
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setForm({ name: u.name, email: u.email, role: u.role, department: u.department, status: u.status });
    setEditTarget(u);
    setShowModal(true);
  };

  const handleSave = () => {
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
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: stats.total, icon: Users, cx: "bg-primary/8 text-primary" },
          { label: "Active Users", value: stats.active, icon: Shield, cx: "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400" },
          { label: "Administrators", value: stats.admins, icon: Shield, cx: "bg-accent/15 text-accent" },
        ].map(({ label, value, icon: Icon, cx }) => (
          <div key={label} className="bg-card rounded-2xl border border-border shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-extrabold text-foreground mt-1">{value}</p>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", cx)}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
        </div>
        <div className="flex gap-1.5">
          {["all", "admin", "faculty", "staff", "moderator"].map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize",
                roleFilter === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary")}>
              {r === "all" ? "All Roles" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
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
                        <button onClick={() => openEdit(user)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(user.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
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
          <div className="flex flex-col items-center py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No users match your search.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-show-on-hover">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-3xl">
              <h2 className="font-extrabold text-foreground">{editTarget ? "Edit User" : "Add User"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: "Full Name", key: "name", type: "text", placeholder: "e.g. Dr. Maria Santos" },
                { label: "Email", key: "email", type: "email", placeholder: "user@plv.edu.ph" },
                { label: "Department", key: "department", type: "text", placeholder: "e.g. College of Engineering" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label htmlFor={key} className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">{label}</label>
                  <input id={key} type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-role" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Role</label>
                  <select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User["role"] })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm">
                    {["admin", "faculty", "staff", "moderator"].map((r) => (
                      <option key={r} value={r} className="capitalize">{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="user-status" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Status</label>
                  <select id="user-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as User["status"] })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="font-extrabold text-foreground mb-1">Remove User?</h3>
            <p className="text-sm text-muted-foreground mb-5">This will permanently remove the user account.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
              <Button variant="danger" onClick={() => { const deleted = users.find(u => u.id === deleteId); setUsers((p) => p.filter((u) => u.id !== deleteId)); setDeleteId(null); if (deleted) toast.success("User removed", `${deleted.name} has been removed.`); }} className="flex-1">Remove</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
