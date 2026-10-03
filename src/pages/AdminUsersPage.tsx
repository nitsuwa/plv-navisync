import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { AlertCircle, Ellipsis, Mail, Plus, Search, Shield, UserPlus, Users, X, GraduationCap, Building2, Crown, RotateCw, Pencil, UserRoundCheck, LoaderCircle } from "lucide-react";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField } from "../components/ui/FormField";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { SearchBar } from "../components/ui/SearchBar";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useToast } from "../hooks/useToast";
import { cn } from "../lib/utils";
import { formatStudentNumberInput } from "../lib/studentAccount";
import { isAdminRole, isSuperAdminRole, roleLabel } from "../lib/roles";
import { countActiveSuperAdmins, getManagedUserEditPolicy } from "../lib/adminUserPermissions";
import {
  inviteManagedUser,
  listManagedProfiles,
  managedUserLoadErrorMessage,
  managedUserErrorMessage,
  resendManagedInvitation,
  updateManagedProfile,
  type ManagedAccountStatus,
  type ManagedProfile,
  type ManagedRole,
} from "../services/adminUserService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../app/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../app/components/ui/dropdown-menu";

type FilterRole = ManagedRole | "all";
type FilterStatus = ManagedAccountStatus | "all";
interface UserForm {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  studentNumber: string;
  role: ManagedRole;
  isActive: boolean;
}
interface PendingConfirmation { title: string; description: string; confirmLabel: string; }

const emptyForm: UserForm = { firstName: "", lastName: "", email: "", department: "", studentNumber: "", role: "student", isActive: false };
const roles: ManagedRole[] = ["student", "student_org", "admin", "super_admin"];
const statusFilters: FilterStatus[] = ["all", "pending_invite", "active", "inactive"];

function displayName(profile: ManagedProfile) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
}

function initials(profile: ManagedProfile) {
  return `${profile.first_name[0] ?? ""}${profile.last_name[0] ?? ""}`.toUpperCase() || "U";
}

function RoleIcon({ role, className }: { role: ManagedRole; className?: string }) {
  if (role === "super_admin") return <Crown className={className ?? "h-4 w-4"} />;
  if (role === "admin") return <Shield className={className ?? "h-4 w-4"} />;
  if (role === "student_org") return <Building2 className={className ?? "h-4 w-4"} />;
  return <GraduationCap className={className ?? "h-4 w-4"} />;
}

function roleDescription(role: ManagedRole) {
  if (role === "student_org") return "Student organization tools";
  if (role === "admin") return "Administrative tools";
  if (role === "super_admin") return "Full account and security management";
  return "Normal student access";
}

function RolePicker({ role, isSuperAdmin, disabled, disabledOptions = [], onChange }: {
  role: ManagedRole;
  isSuperAdmin: boolean;
  disabled?: boolean;
  disabledOptions?: ManagedRole[];
  onChange: (role: ManagedRole) => void;
}) {
  const options = roles.filter((option) => isSuperAdmin || !isAdminRole(option));
  return <Select value={role} disabled={disabled} onValueChange={(value) => onChange(value as ManagedRole)}>
    <SelectTrigger aria-label="Role" className="h-auto min-h-[66px] rounded-2xl border-border bg-card px-3.5 py-2.5 text-left shadow-sm transition-[border-color,box-shadow] hover:border-primary/40 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/10">
      <SelectValue className="w-full !line-clamp-none whitespace-normal">
        <span className="flex min-w-0 items-center gap-3 pr-2 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><RoleIcon role={role} className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-bold text-foreground">{roleLabel(role)}</span><span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{roleDescription(role)}</span></span>
        </span>
      </SelectValue>
    </SelectTrigger>
    <SelectContent position="popper" className="rounded-2xl border-border bg-card p-1.5 shadow-xl">
      {options.map((option) => <SelectItem key={option} value={option} disabled={disabledOptions.includes(option)} className="min-h-14 rounded-xl py-2.5 pl-2.5 pr-9 focus:bg-primary/5 focus:text-foreground data-[state=checked]:bg-primary/8 data-[state=checked]:text-primary">
        <span className="flex min-w-0 items-center gap-3 pr-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><RoleIcon role={option} className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{roleLabel(option)}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{roleDescription(option)}</span></span>
          {isSuperAdmin && isAdminRole(option) && <span className="shrink-0 rounded-full bg-primary/8 px-2 py-1 text-[9px] font-bold text-primary">Super Admin only</span>}
        </span>
      </SelectItem>)}
    </SelectContent>
  </Select>;
}

function roleBadge(role: ManagedRole) {
  if (role === "super_admin") return "border border-amber-300/70 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  if (role === "admin") return "bg-primary/10 text-primary";
  if (role === "student_org") return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
  return "bg-secondary text-secondary-foreground";
}

function statusStyle(status: ManagedAccountStatus) {
  if (status === "active") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (status === "pending_invite") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

export function AdminUsersPage() {
  const { profile: currentProfile, refreshProfile } = useAdminAuth();
  const toast = useToast();
  const isSuperAdmin = isSuperAdminRole(currentProfile?.role ?? "");
  const [users, setUsers] = useState<ManagedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invitationMetadataAvailable, setInvitationMetadataAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<FilterRole>("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedProfile | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const hasLoadedRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const transitionDuration = prefersReducedMotion ? 0 : 0.18;

  useEffect(() => {
    if (!showModal) return;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousRootOverflow = root.style.overflow;
    const scrollbarWidth = root.clientWidth > 0 ? Math.max(0, window.innerWidth - root.clientWidth) : 0;

    // Lock once for the parent modal. Nested confirmation is portaled separately
    // and leaves this lock and the parent's position untouched.
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      root.style.overflow = previousRootOverflow;
    };
  }, [showModal]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listManagedProfiles();
      setUsers(result.profiles);
      setInvitationMetadataAvailable(result.invitationMetadataAvailable);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      setLoadError(null);
    } catch (error) {
      if (import.meta.env.DEV) console.error("[Admin Users] Failed to load profiles.", error);
      const message = managedUserLoadErrorMessage(error);
      if (hasLoadedRef.current) {
        toast.error("Couldn't refresh users", message);
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void refreshProfile().catch((error) => {
      if (import.meta.env.DEV) console.warn("[Admin Users] Could not refresh the centralized caller profile.", error);
    });
  }, [refreshProfile]);

  const activeSuperAdmins = countActiveSuperAdmins(users, currentProfile ?? {});
  const visibleUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (statusFilter !== "all" && user.account_status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return [user.first_name, user.last_name, `${user.first_name} ${user.last_name}`, user.email, user.department, user.student_number]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [roleFilter, search, statusFilter, users]);
  const stats = useMemo(() => ({
    total: visibleUsers.length,
    active: users.filter((user) => user.account_status === "active").length,
    admins: users.filter((user) => isAdminRole(user.role)).length,
  }), [users, visibleUsers]);

  const canManage = (user: ManagedProfile) => getManagedUserEditPolicy(currentProfile ?? {}, user, activeSuperAdmins).canManageAccount;

  const openInvite = () => {
    if (invitationMetadataAvailable === false) {
      toast.error("User invitations require setup", "Apply the latest database update before sending invitations.");
      return;
    }
    setEditTarget(null);
    setForm({ ...emptyForm, role: "student" });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (user: ManagedProfile) => {
    setEditTarget(user);
    setForm({
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      department: user.department ?? "",
      studentNumber: user.role === "student" ? user.student_number ?? "" : "",
      role: user.role,
      isActive: user.is_active,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.firstName.trim()) errors.firstName = "First name is required.";
    if (!form.lastName.trim()) errors.lastName = "Last name is required.";
    if (!editTarget && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";
    if (form.role === "student" && !/^\d{2}-\d{4}$/.test(form.studentNumber)) errors.studentNumber = "Use the format 23-3314.";
    if (!isSuperAdmin && isAdminRole(form.role)) errors.role = "You don't have permission to assign privileged roles.";
    if (editTarget) {
      const policy = getManagedUserEditPolicy(currentProfile ?? {}, editTarget, activeSuperAdmins);
      if (!policy.canManageAccount) errors.role = "You don't have permission to manage this account.";
      if (policy.isSelf && (form.role !== editTarget.role || form.isActive !== editTarget.is_active)) {
        errors.role = "You can't change your own role or deactivate your own account.";
      }
      if (policy.lastActiveSuperAdmin && (form.role !== "super_admin" || !form.isActive)) {
        errors.role = "At least one active Super Admin is required.";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const persistChanges = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      if (editTarget) {
        await updateManagedProfile({
          id: editTarget.id,
          firstName: form.firstName,
          lastName: form.lastName,
          department: form.department,
          studentNumber: form.role === "student" ? form.studentNumber : null,
          role: form.role,
          isActive: form.isActive,
        });
        toast.success("User updated", "The account changes were saved and audited.");
      } else {
        await inviteManagedUser({
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          department: form.department,
          studentNumber: form.studentNumber,
          role: form.role,
        });
        toast.success("Invitation sent", `An invitation was sent to ${form.email.trim()}.`);
      }
      setShowModal(false);
      setConfirmation(null);
      await loadUsers();
    } catch (error) {
      toast.error(editTarget ? "Unable to update user" : "Unable to invite user", managedUserErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!validate()) return;
    if (!editTarget && isAdminRole(form.role)) {
      const isSuperInvite = form.role === "super_admin";
      setConfirmation({
        title: isSuperInvite ? "Invite a Super Admin?" : "Invite an Administrator?",
        description: isSuperInvite
          ? "This person will be able to manage administrator roles and privileged accounts after completing setup."
          : "This person will receive access to NaviSync administrative tools after completing setup.",
        confirmLabel: "Send invitation",
      });
      return;
    }
    if (editTarget && form.role !== editTarget.role) {
      const isPromotion = form.role === "super_admin"
        ? editTarget.role !== "super_admin"
        : form.role === "admin" && (editTarget.role === "student" || editTarget.role === "student_org");
      const isDemotion = editTarget.role === "super_admin"
        ? form.role !== "super_admin"
        : editTarget.role === "admin" && !isAdminRole(form.role);
      setConfirmation({
        title: form.role === "super_admin" ? "Grant Super Admin access?" : isPromotion ? "Grant Administrator access?" : isDemotion ? "Change administrator access?" : "Change this user's role?",
        description: form.role === "super_admin"
          ? "This user can manage administrator roles and privileged accounts."
          : isPromotion
            ? "This user will gain access to administrative NaviSync features."
            : isDemotion
              ? `This changes this user's access from ${roleLabel(editTarget.role)} to ${roleLabel(form.role)}.`
              : `Change access from ${roleLabel(editTarget.role)} to ${roleLabel(form.role)}?`,
        confirmLabel: form.role === "super_admin" ? "Grant access" : isPromotion ? "Grant access" : isDemotion ? "Change access" : "Change role",
      });
      return;
    }
    if (editTarget && editTarget.account_status === "active" && !form.isActive) {
      setConfirmation({ title: isAdminRole(editTarget.role) ? "Deactivate this administrator?" : "Deactivate this account?", description: "The user will no longer be able to access NaviSync until reactivated. Account data will be kept.", confirmLabel: "Deactivate" });
      return;
    }
    void persistChanges();
  };

  const resend = async (user: ManagedProfile) => {
    setResending(user.id);
    try {
      await resendManagedInvitation(user.id);
      toast.success("Invitation resent", `A fresh setup link was sent to ${user.email}.`);
      await loadUsers();
    } catch (error) {
      toast.error("Unable to resend invitation", managedUserErrorMessage(error));
    } finally {
      setResending(null);
    }
  };

  if (loading && !hasLoaded) return <TablePageSkeleton rows={6} />;
  if (!hasLoaded && loadError) {
    return <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-5 text-center animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="h-7 w-7" /></div>
      <h1 className="mt-5 text-xl font-extrabold text-foreground">Couldn’t load users</h1>
      <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
      <Button onClick={() => void loadUsers()} isLoading={loading} className="mt-5"><RotateCw className="h-4 w-4" />Try Again</Button>
    </div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">User Management</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage accounts and send secure setup invitations.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5"><Button onClick={openInvite} disabled={invitationMetadataAvailable === false} title={invitationMetadataAvailable === false ? "User invitations require the latest database update." : undefined}><Plus className="h-3.5 w-3.5" /> Invite User</Button>{loading && hasLoaded && <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LoaderCircle className="h-3 w-3 animate-spin" />Refreshing users</span>}</div>
      </div>

      {invitationMetadataAvailable === false && <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div><p className="font-bold">Backend setup required</p><p className="mt-0.5 text-xs leading-relaxed">Existing profiles are loaded. Invitation tracking and invitations require the latest database update; account status currently uses Active / Inactive only.</p></div>
      </div>}

      <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Matching Users", value: stats.total, note: undefined, icon: Users, style: "bg-primary/8 text-primary" },
          { label: "Active Users", value: stats.active, note: undefined, icon: UserRoundCheck, style: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
          { label: "Administrators", value: stats.admins, note: "Admins + Super Admins", icon: Shield, style: "bg-primary/10 text-primary" },
        ].map(({ label, value, note, icon: Icon, style }) => (
          <motion.div key={label} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1 h-8 overflow-hidden text-2xl font-extrabold tabular-nums" aria-live="polite"><AnimatePresence initial={false} mode="popLayout"><motion.p key={value} initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }} transition={{ duration: transitionDuration }} className="leading-8">{value}</motion.p></AnimatePresence></div>{note && <p className="mt-0.5 text-[10px] text-muted-foreground">{note}</p>}</div><div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", style)}><Icon className="h-5 w-5" /></div></div>
          </motion.div>
        ))}
      </motion.div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="w-full max-w-md xl:flex-1"><SearchBar placeholder="Search name, email, department, or Student ID" value={search} onSearch={setSearch} onClear={() => setSearch("")} size="md" /></div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {(["all", ...roles] as FilterRole[]).map((role) => <button key={role} type="button" aria-pressed={roleFilter === role} onClick={() => setRoleFilter(role)} className={cn("rounded-xl border px-3 py-1.5 text-xs font-bold transition-[background-color,color,border-color,box-shadow] duration-200 motion-reduce:transition-none", roleFilter === role ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-transparent bg-muted text-muted-foreground hover:border-primary/20 hover:text-foreground")}>{role === "all" ? "All roles" : roleLabel(role)}</button>)}
          {statusFilters.map((status) => <button key={status} type="button" aria-pressed={statusFilter === status} disabled={status === "pending_invite" && invitationMetadataAvailable === false} title={status === "pending_invite" && invitationMetadataAvailable === false ? "Apply the database update to view invitation status." : undefined} onClick={() => setStatusFilter(status)} className={cn("rounded-xl border px-3 py-1.5 text-xs font-bold transition-[background-color,color,border-color,box-shadow] duration-200 motion-reduce:transition-none", statusFilter === status ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-transparent bg-muted text-muted-foreground hover:border-primary/20 hover:text-foreground", status === "pending_invite" && invitationMetadataAvailable === false && "cursor-not-allowed opacity-45")}>{status === "all" ? "Any status" : status === "pending_invite" ? "Pending Invite" : status === "active" ? "Active" : "Inactive"}</button>)}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/50">
          <th className="px-5 py-3 text-left text-xs font-bold uppercase text-muted-foreground">User</th><th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Role</th><th className="hidden px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground lg:table-cell">Department / Organization</th><th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-foreground">Status</th><th className="px-5 py-3 text-right text-xs font-bold uppercase text-muted-foreground">Actions</th>
        </tr></thead><tbody><AnimatePresence initial={false}>{visibleUsers.map((user) => {
          const isSelf = currentProfile?.id === user.id;
          const manageable = canManage(user);
          const policy = getManagedUserEditPolicy(currentProfile ?? {}, user, activeSuperAdmins);
          const lastSuperAdmin = policy.lastActiveSuperAdmin;
          return <motion.tr key={user.id} initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }} transition={{ duration: transitionDuration }} className="border-b border-border last:border-0 hover:bg-muted/30">
            <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-extrabold text-white">{initials(user)}</div><div className="min-w-0"><p className="font-bold">{displayName(user)} {isSelf && <span className="text-[10px] text-primary">(you)</span>}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3 shrink-0" />{user.email}</p></div></div></td>
            <td className="px-4 py-3.5"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", roleBadge(user.role))}><RoleIcon role={user.role} className="h-3.5 w-3.5" />{roleLabel(user.role)}</span></td>
            <td className="hidden px-4 py-3.5 text-muted-foreground lg:table-cell">{user.department || "—"}</td>
            <td className="px-4 py-3.5"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", statusStyle(user.account_status))}>{user.account_status === "pending_invite" ? "Pending Invite" : user.account_status === "active" ? "Active" : "Inactive"}</span></td>
          <td className="px-5 py-3.5 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${displayName(user)}`} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Ellipsis className="h-4 w-4" /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem disabled={!manageable} onSelect={() => openEdit(user)}><Pencil className="h-4 w-4" />Edit account</DropdownMenuItem>
                  {manageable && user.account_status === "pending_invite" && <DropdownMenuItem disabled={resending === user.id} onSelect={() => void resend(user)}><RotateCw className="h-4 w-4" />{resending === user.id ? "Sending…" : "Resend invitation"}</DropdownMenuItem>}
                  {!manageable && <><DropdownMenuSeparator /><div className="px-2 py-1.5 text-xs text-muted-foreground">Only a Super Admin can manage this account.</div></>}
                  {lastSuperAdmin && <><DropdownMenuSeparator /><div className="px-2 py-1.5 text-xs text-muted-foreground">At least one active Super Admin is required.</div></>}
                  {isSelf && <><DropdownMenuSeparator /><div className="px-2 py-1.5 text-xs text-muted-foreground">You can't change your own role or deactivate your own account.</div></>}
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </motion.tr>;
        })}</AnimatePresence></tbody></table></div>
        <AnimatePresence initial={false}>{visibleUsers.length === 0 && <motion.div key="empty-users" initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }} transition={{ duration: transitionDuration }}><EmptyState icon={search || roleFilter !== "all" || statusFilter !== "all" ? Search : UserPlus} title={statusFilter === "pending_invite" && invitationMetadataAvailable === false ? "Pending Invite status is unavailable." : statusFilter === "pending_invite" ? "No pending invitations." : "No users match these filters."} description={statusFilter === "pending_invite" && invitationMetadataAvailable === false ? "Apply the latest database update to view invitation status." : "Try changing the search or filters."} action={<Button variant="outline" size="sm" onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); }}>Clear filters</Button>} /></motion.div>}</AnimatePresence>
      </div>

      {showModal && createPortal(<div className="fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-black/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editTarget ? "Edit user" : "Invite user"}>
        <div style={{ maxHeight: "min(800px, 90dvh, calc(100dvh - max(2rem, env(safe-area-inset-top)) - max(2rem, env(safe-area-inset-bottom))))" }} className="flex max-h-[min(90dvh,800px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-3.5"><div><h2 className="font-extrabold">{editTarget ? "Edit User" : "Invite User"}</h2><p className="mt-0.5 text-xs text-muted-foreground">{editTarget ? "Account details and access" : "The recipient creates their own password."}</p></div><button aria-label="Close" onClick={() => setShowModal(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
          <div className="space-y-4 overflow-y-auto overscroll-contain p-5">
            <section className="space-y-3"><p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Account</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="First name" id="first-name" value={form.firstName} onChange={(firstName) => setForm((value) => ({ ...value, firstName }))} error={formErrors.firstName} required maxLength={80} /><FormField label="Last name" id="last-name" value={form.lastName} onChange={(lastName) => setForm((value) => ({ ...value, lastName }))} error={formErrors.lastName} required maxLength={80} /></div>
              <FormField label="Email" id="user-email" value={form.email} onChange={(email) => setForm((value) => ({ ...value, email }))} error={formErrors.email} type="email" required disabled={!!editTarget} helper={editTarget ? "Email changes require account verification." : "Supabase Auth will send the secure invitation email."} />
            </section>
            <section className="space-y-3"><p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Role</p>
              {(() => {
                const policy = editTarget ? getManagedUserEditPolicy(currentProfile ?? {}, editTarget, activeSuperAdmins) : null;
                const protectedRoleChoices = policy?.lastActiveSuperAdmin ? roles.filter((role) => role !== "super_admin") : [];
                return <RolePicker role={form.role} isSuperAdmin={isSuperAdmin} disabled={!!policy && !policy.canChangeRole} disabledOptions={protectedRoleChoices} onChange={(role) => { setForm((value) => ({ ...value, role, studentNumber: role === "student" ? value.studentNumber : "" })); setFormErrors((errors) => ({ ...errors, role: "", studentNumber: "" })); }} />;
              })()}
              {formErrors.role && <p className="text-xs text-destructive">{formErrors.role}</p>}
              {!isSuperAdmin && !editTarget && <p className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">Administrator accounts can only be invited by a Super Admin.</p>}
              {!isSuperAdmin && editTarget && isAdminRole(editTarget.role) && <p className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">Only a Super Admin can manage Administrator or Super Admin accounts.</p>}
              {editTarget?.id === currentProfile?.id && <p className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">You can't change your own role or deactivate your own account.</p>}
              {editTarget && getManagedUserEditPolicy(currentProfile ?? {}, editTarget, activeSuperAdmins).lastActiveSuperAdmin && <p className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">At least one active Super Admin is required. This account must remain active with Super Admin access.</p>}
            </section>
            <motion.section key={form.role} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{form.role === "student" ? "Student details" : form.role === "student_org" ? "Organization details" : "Admin details"}</p>
              {form.role === "student" && <FormField label="Student ID" id="student-number" value={form.studentNumber} onChange={(studentNumber) => { setForm((value) => ({ ...value, studentNumber: formatStudentNumberInput(studentNumber) })); setFormErrors((errors) => ({ ...errors, studentNumber: "" })); }} error={formErrors.studentNumber} maxLength={7} inputMode="numeric" placeholder="23-3314" helper="Use the format NN-NNNN." required />}
              <FormField label={form.role === "admin" || form.role === "super_admin" ? "Department / Office (optional)" : form.role === "student_org" ? "Organization / Department (optional)" : "Department / Program (optional)"} id="department" value={form.department} onChange={(department) => setForm((value) => ({ ...value, department }))} maxLength={120} />
              {form.role === "student_org" && <p className="rounded-xl bg-muted/55 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">Grant Student Organization access only after the organization has been verified.</p>}
              {form.role === "super_admin" && <p className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Super Admins can manage administrator access and privileged accounts.</p>}
            </motion.section>
            {editTarget && (() => {
              const policy = getManagedUserEditPolicy(currentProfile ?? {}, editTarget, activeSuperAdmins);
              return <section className="space-y-2"><p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Access</p><Select value={form.isActive ? "active" : "inactive"} disabled={!policy.canChangeStatus || editTarget.account_status === "pending_invite"} onValueChange={(status) => setForm((value) => ({ ...value, isActive: status === "active" }))}><SelectTrigger aria-label="Account status" className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive" disabled={policy.lastActiveSuperAdmin}>Inactive</SelectItem></SelectContent></Select>{editTarget.account_status === "pending_invite" && <p className="text-xs text-muted-foreground">Pending invitations become Active after the recipient completes setup.</p>}{policy.lastActiveSuperAdmin && <p className="text-xs text-muted-foreground">At least one active Super Admin is required.</p>}</section>;
            })()}
            {!editTarget && <p className="text-xs text-muted-foreground">The recipient sets their password from the invitation email. New accounts remain Pending Invite until setup is complete.</p>}
          </div>
          <div className="flex shrink-0 gap-3 border-t border-border bg-card px-6 py-4"><Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button><Button onClick={requestSave} isLoading={saving} className="flex-1">{editTarget ? "Save Changes" : "Send Invitation"}</Button></div>
        </div>
      </div>, document.body)}

      {createPortal(<AnimatePresence initial={false}>{confirmation && <motion.div key="user-confirmation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: transitionDuration }} className="fixed inset-0 z-[60] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-black/40 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]" role="alertdialog" aria-modal="true" aria-labelledby="user-confirm-title"><motion.div initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.97 }} transition={{ duration: transitionDuration, ease: "easeOut" }} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><h2 id="user-confirm-title" className="text-lg font-extrabold">{confirmation.title}</h2><p className="mt-2 text-sm text-muted-foreground">{confirmation.description}</p><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={confirmation.confirmLabel === "Deactivate" ? "danger" : "primary"} isLoading={saving} onClick={() => void persistChanges()}>{confirmation.confirmLabel}</Button></div></motion.div></motion.div>}</AnimatePresence>, document.body)}
    </div>
  );
}
