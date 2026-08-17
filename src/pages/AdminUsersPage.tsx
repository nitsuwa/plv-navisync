import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Mail, Pencil, Plus, Search, Shield, UserPlus, Users, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField } from "../components/ui/FormField";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { SearchBar } from "../components/ui/SearchBar";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useToast } from "../hooks/useToast";
import { cn } from "../lib/utils";
import {
  inviteManagedUser,
  listManagedProfiles,
  updateManagedProfile,
  type ManagedProfile,
  type ManagedRole,
} from "../services/adminUserService";
import { useSupabaseRealtimeRefresh } from "../hooks/useSupabaseRealtimeData";

type StatusFilter = "all" | "active" | "inactive";

interface UserForm {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  studentNumber: string;
  role: ManagedRole;
  isActive: boolean;
}

const emptyForm: UserForm = {
  firstName: "",
  lastName: "",
  email: "",
  department: "",
  studentNumber: "",
  role: "student",
  isActive: true,
};

function displayName(profile: ManagedProfile) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
}

function initials(profile: ManagedProfile) {
  return `${profile.first_name[0] ?? ""}${profile.last_name[0] ?? ""}`.toUpperCase() || "U";
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "An unexpected error occurred.";
}

export function AdminUsersPage() {
  const { profile: currentProfile } = useAdminAuth();
  const toast = useToast();
  const [users, setUsers] = useState<ManagedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<ManagedRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedProfile | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setUsers(await listManagedProfiles({ search, role: roleFilter, status: statusFilter }));
    } catch (error) {
      toast.error("Unable to load users", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search, statusFilter]);

  useSupabaseRealtimeRefresh({ channel: "users", tables: ["profiles"], onChange: loadUsers });

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, search]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.is_active).length,
    admins: users.filter((user) => user.role === "admin").length,
  }), [users]);

  const openInvite = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (profile: ManagedProfile) => {
    setEditTarget(profile);
    setForm({
      firstName: profile.first_name,
      lastName: profile.last_name,
      email: profile.email,
      department: profile.department ?? "",
      studentNumber: profile.student_number ?? "",
      role: profile.role,
      isActive: profile.is_active,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.firstName.trim()) errors.firstName = "First name is required";
    if (!form.lastName.trim()) errors.lastName = "Last name is required";
    if (!editTarget && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "A valid email is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      if (editTarget) {
        await updateManagedProfile({
          id: editTarget.id,
          firstName: form.firstName,
          lastName: form.lastName,
          department: form.department,
          studentNumber: form.studentNumber,
          role: form.role,
          isActive: form.isActive,
        });
        toast.success("User updated", `${form.firstName} ${form.lastName}'s changes were saved and audited.`);
      } else {
        await inviteManagedUser({
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          department: form.department,
          studentNumber: form.studentNumber,
          role: form.role,
        });
        toast.success("Invitation sent", `${form.email} can finish account setup from the invitation email.`);
      }
      setShowModal(false);
      await loadUsers();
    } catch (error) {
      toast.error(editTarget ? "Unable to update user" : "Unable to invite user", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (profile: ManagedProfile) => {
    try {
      await updateManagedProfile({
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        department: profile.department,
        studentNumber: profile.student_number,
        role: profile.role,
        isActive: !profile.is_active,
      });
      toast.success(profile.is_active ? "Account deactivated" : "Account activated", `${displayName(profile)}'s status was changed and audited.`);
      await loadUsers();
    } catch (error) {
      toast.error("Unable to change status", errorMessage(error));
    }
  };

  if (loading && users.length === 0) return <TablePageSkeleton rows={6} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live profiles · privileged changes are audited</p>
        </div>
        <Button onClick={openInvite}><Plus className="h-3.5 w-3.5" /> Invite User</Button>
      </div>

      <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Matching Users", value: stats.total, icon: Users, style: "bg-primary/8 text-primary" },
          { label: "Active", value: stats.active, icon: Shield, style: "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400" },
          { label: "Administrators", value: stats.admins, icon: Shield, style: "bg-accent/15 text-accent" },
        ].map(({ label, value, icon: Icon, style }) => (
          <motion.div key={label} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} className="bg-card rounded-2xl border border-border shadow-sm p-4">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p><p className="text-2xl font-extrabold mt-1">{value}</p></div><div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", style)}><Icon className="h-5 w-5" /></div></div>
          </motion.div>
        ))}
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 max-w-md"><SearchBar placeholder="Search name, email, department, or student number" value={search} onSearch={setSearch} onClear={() => setSearch("")} size="md" /></div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "student", "admin"] as const).map((role) => <button key={role} type="button" onClick={() => setRoleFilter(role)} className={cn("px-3 py-1.5 rounded-xl text-xs font-bold capitalize", roleFilter === role ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{role === "all" ? "All roles" : role}</button>)}
          {(["all", "active", "inactive"] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={cn("px-3 py-1.5 rounded-xl text-xs font-bold capitalize", statusFilter === status ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{status === "all" ? "Any status" : status}</button>)}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/50">
          <th className="text-left px-5 py-3 text-xs font-bold text-muted-foreground uppercase">User</th><th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase">Role</th><th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase hidden lg:table-cell">Department</th><th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase">Status</th><th className="text-right px-5 py-3 text-xs font-bold text-muted-foreground uppercase">Actions</th>
        </tr></thead><tbody>{users.map((user) => {
          const isSelf = currentProfile?.id === user.id;
          return <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30">
            <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-extrabold text-white">{initials(user)}</div><div><p className="font-bold">{displayName(user)} {isSelf && <span className="text-[10px] text-primary">(you)</span>}</p><p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</p></div></div></td>
            <td className="px-4 py-3.5"><span className={cn("px-2.5 py-1 rounded-full text-xs font-bold capitalize", user.role === "admin" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground")}>{user.role}</span></td>
            <td className="px-4 py-3.5 hidden lg:table-cell text-muted-foreground">{user.department || "—"}</td>
            <td className="px-4 py-3.5"><button type="button" disabled={isSelf} title={isSelf ? "You cannot change your own active status" : undefined} onClick={() => void toggleStatus(user)} className={cn("px-2.5 py-1 rounded-full text-xs font-bold disabled:opacity-50", user.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground")}>{user.is_active ? "● Active" : "○ Inactive"}</button></td>
            <td className="px-5 py-3.5 text-right"><button type="button" aria-label={`Edit ${displayName(user)}`} onClick={() => openEdit(user)} className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button></td>
          </tr>;
        })}</tbody></table></div>
        {users.length === 0 && <EmptyState icon={search || roleFilter !== "all" || statusFilter !== "all" ? Search : UserPlus} title="No matching users" description="Try changing the search or filters." action={<Button variant="outline" size="sm" onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); }}>Clear filters</Button>} />}
      </div>

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editTarget ? "Edit user" : "Invite user"}>
        <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card"><h2 className="font-extrabold">{editTarget ? "Edit User" : "Invite User"}</h2><button aria-label="Close" onClick={() => setShowModal(false)}><X className="h-4 w-4" /></button></div>
          <div className="p-6 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><FormField label="First name" id="first-name" value={form.firstName} onChange={(firstName) => setForm((value) => ({ ...value, firstName }))} error={formErrors.firstName} required maxLength={80} /><FormField label="Last name" id="last-name" value={form.lastName} onChange={(lastName) => setForm((value) => ({ ...value, lastName }))} error={formErrors.lastName} required maxLength={80} /></div>
            <FormField label="Email" id="user-email" value={form.email} onChange={(email) => setForm((value) => ({ ...value, email }))} error={formErrors.email} type="email" required disabled={!!editTarget} helper={editTarget ? "Auth email changes require a separate verified workflow." : "An invitation email will be sent by Supabase Auth."} />
            <FormField label="Department" id="department" value={form.department} onChange={(department) => setForm((value) => ({ ...value, department }))} maxLength={120} />
            <FormField label="Student number" id="student-number" value={form.studentNumber} onChange={(studentNumber) => setForm((value) => ({ ...value, studentNumber }))} maxLength={50} />
            <div className="grid grid-cols-2 gap-4"><div><label htmlFor="user-role" className="block text-xs font-bold mb-1.5 uppercase">Role</label><select id="user-role" value={form.role} disabled={editTarget?.id === currentProfile?.id} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value as ManagedRole }))} className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background disabled:opacity-50"><option value="student">Student</option><option value="admin">Administrator</option></select></div>
              <div><label htmlFor="user-status" className="block text-xs font-bold mb-1.5 uppercase">Status</label><select id="user-status" value={form.isActive ? "active" : "inactive"} disabled={!editTarget || editTarget.id === currentProfile?.id} onChange={(event) => setForm((value) => ({ ...value, isActive: event.target.value === "active" }))} className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background disabled:opacity-50"><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div>
          </div>
          <div className="flex gap-3 px-6 pb-6"><Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button><Button onClick={() => void handleSave()} isLoading={saving} className="flex-1">{editTarget ? "Save Changes" : "Send Invitation"}</Button></div>
        </div>
      </div>}
    </div>
  );
}
