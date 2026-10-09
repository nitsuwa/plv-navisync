import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Building2, ChevronDown, ChevronUp, Clock3, LoaderCircle, Pencil, Plus, RefreshCw, UserRound, UserRoundPlus, UserRoundX, X } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { eventOrganizationService, OrganizationAccessUnavailable, OrganizationAssignmentChanged, OrganizationRecordChanged } from "../../services/eventOrganizationService";
import type { ManagedProfile } from "../../services/adminUserService";
import type { EventOrganization, EventRepresentativeGrant, SaveEventOrganizationInput } from "../../types/eventOrganization";
import { RepresentativeAssignmentDialog } from "./RepresentativeAssignmentDialog";
const dialogViewport = { maxHeight: "calc(100dvh - max(.75rem, env(safe-area-inset-top, 0px)) - max(.75rem, env(safe-area-inset-bottom, 0px)))" };

interface AdminOrganizationsPanelProps { profiles: ManagedProfile[]; }

function currentGrant(organization: EventOrganization): EventRepresentativeGrant | undefined {
  return organization.grants.find((grant) => !grant.endedAt);
}

function hasEffectiveRepresentative(organization: EventOrganization): boolean {
  const grant = currentGrant(organization);
  return !!organization.isActive && !!grant && Date.parse(grant.expiresAt) > Date.now() && grant.profileActive && grant.profileRole === "student_org";
}

function assignmentStatus(organization: EventOrganization): { label: string; style: string; message: string } {
  const current = currentGrant(organization);
  if (!organization.isActive) return { label: "Organization inactive", style: "bg-muted text-muted-foreground", message: "Activate the organization before assigning access." };
  if (!current) return { label: "Unassigned", style: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300", message: "No representative currently has access." };
  if (Date.parse(current.expiresAt) <= Date.now()) return { label: "Expired", style: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300", message: "The last assignment has expired. Assign an active representative to restore access." };
  if (!current.profileActive || current.profileRole !== "student_org") return { label: "Account unavailable", style: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300", message: "The assigned account is inactive or no longer has Student Organization access." };
  return { label: "Active representative", style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300", message: "This representative can manage organization event work." };
}

function manilaDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
}

function useDialogKeyboard(ref: RefObject<HTMLElement | null>, onClose: () => void, blocked: boolean, initialFocusSelector: string) {
  const closeRef = useRef(onClose);
  const blockedRef = useRef(blocked);
  closeRef.current = onClose;
  blockedRef.current = blocked;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const container = ref.current;
    (container?.querySelector<HTMLElement>(initialFocusSelector) ?? container)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!blockedRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const focusable = [...container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const [first] = focusable;
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousBodyOverflow; previousFocus?.focus(); };
  }, []);
}

function displayGrantState(grant: EventRepresentativeGrant, organization: EventOrganization) {
  if (grant.endedAt) return grant.endReason === "replaced" ? "Replaced" : "Ended";
  if (!organization.isActive || !grant.profileActive || grant.profileRole !== "student_org") return "Inactive";
  if (Date.parse(grant.expiresAt) <= Date.now()) return "Expired";
  return "Current";
}

function OrganizationDetailsDialog({ organization, onClose, onSave, onConflict }: {
  organization: EventOrganization | null;
  onClose: () => void;
  onSave: (input: SaveEventOrganizationInput) => Promise<void>;
  onConflict: () => Promise<void>;
}) {
  const [code, setCode] = useState(organization?.code ?? "");
  const [name, setName] = useState(organization?.name ?? "");
  const [isActive, setIsActive] = useState(organization?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = organization ? "Edit organization" : "Add organization";
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogKeyboard(dialogRef, onClose, saving, "#organization-code");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim()) { setError("Enter both an organization code and name."); return; }
    setSaving(true); setError(null);
    try {
      await onSave({ id: organization?.id ?? null, code: code.trim(), name: name.trim(), isActive, expectedUpdatedAt: organization?.updatedAt ?? null });
    } catch (cause) {
      if (cause instanceof OrganizationRecordChanged || (cause instanceof Error && cause.name === "OrganizationRecordChanged")) {
        await onConflict();
        onClose();
      } else {
        setError(cause instanceof Error ? cause.message : "The organization could not be saved. Please retry.");
      }
    } finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/45 p-3 pt-[max(.75rem,env(safe-area-inset-top))] pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="organization-details-title" onSubmit={submit} style={dialogViewport} className="my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4"><div><h2 id="organization-details-title" className="font-extrabold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">Verified organization record for event ownership.</p></div><button type="button" aria-label="Close organization form" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
        <label className="block space-y-1.5 text-sm font-semibold" htmlFor="organization-code"><span>Organization code</span><input id="organization-code" maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. IT-ORG" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <label className="block space-y-1.5 text-sm font-semibold" htmlFor="organization-name"><span>Organization name</span><input id="organization-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Official organization name" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="block font-semibold">Organization is active</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Inactive organizations cannot access event drafts, even when an assignment has not expired.</span></span></label>
        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={onClose} className="w-full sm:w-auto">Cancel</Button><Button type="submit" isLoading={saving} disabled={saving} className="w-full sm:w-auto">{organization ? "Save organization" : "Create organization"}</Button></footer>
    </form>
  </div>;
}

function RevokeRepresentativeDialog({ organization, grant, onClose, onConfirm, onConflict }: {
  organization: EventOrganization;
  grant: EventRepresentativeGrant;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  onConflict: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogKeyboard(dialogRef, onClose, saving, "#revoke-reason");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) { setError("A reason is required so the access change is auditable."); return; }
    if (reason.trim().length > 500) { setError("Use 500 characters or fewer."); return; }
    setSaving(true); setError(null);
    try { await onConfirm(reason.trim()); }
    catch (cause) {
      if (cause instanceof OrganizationAssignmentChanged || (cause instanceof Error && cause.name === "OrganizationAssignmentChanged")) { await onConflict(); onClose(); }
      else setError(cause instanceof Error ? cause.message : "Access could not be revoked. Please retry.");
    } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/45 p-3 pt-[max(.75rem,env(safe-area-inset-top))] pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
    <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="revoke-title" onSubmit={submit} style={dialogViewport} className="my-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <header className="shrink-0 border-b border-border px-5 py-4"><h2 id="revoke-title" className="font-extrabold">Revoke organization access</h2><p className="mt-1 break-words text-sm text-muted-foreground">{organization.name} · {grant.representativeName}</p></header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5"><p className="text-sm leading-relaxed text-muted-foreground">This immediately ends the representative’s organization access. Existing event records and creator history remain intact.</p><label className="block space-y-1.5 text-sm font-semibold" htmlFor="revoke-reason"><span>Reason for revocation</span><textarea id="revoke-reason" aria-label="Reason for revocation" maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); setError(null); }} rows={3} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="e.g. Representative term ended" /></label>{error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}</div>
      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={onClose} className="w-full sm:w-auto">Cancel</Button><Button type="submit" variant="danger" isLoading={saving} disabled={saving} className="w-full sm:w-auto">Revoke access</Button></footer>
    </form>
  </div>;
}

export function AdminOrganizationsPanel({ profiles }: AdminOrganizationsPanelProps) {
  const [organizations, setOrganizations] = useState<EventOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [assignmentOrganizationId, setAssignmentOrganizationId] = useState<string | null>(null);
  const [organizationEditor, setOrganizationEditor] = useState<EventOrganization | null | undefined>(undefined);
  const [revokeTarget, setRevokeTarget] = useState<{ organization: EventOrganization; grant: EventRepresentativeGrant } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const refresh = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const data = await eventOrganizationService.listOrganizations();
      setOrganizations(data); setLoaded(true); setLoadError(null);
    } catch (error) { setLoadError(error); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedAssignmentOrganization = useMemo(() => organizations.find((item) => item.id === assignmentOrganizationId) ?? null, [assignmentOrganizationId, organizations]);
  const saveOrganization = async (input: SaveEventOrganizationInput) => {
    await eventOrganizationService.saveOrganization(input);
    setOrganizationEditor(undefined);
    setActionMessage(input.id ? "Organization details saved." : "Organization created. Assign a representative to give it access.");
    await refresh(true);
  };
  const assign = (organization: EventOrganization) => { setActionMessage(null); setAssignmentOrganizationId(organization.id); };
  const revoke = async (reason: string) => {
    if (!revokeTarget) return;
    await eventOrganizationService.revokeRepresentative(revokeTarget.organization.id, revokeTarget.grant.id, reason);
    setRevokeTarget(null); setActionMessage(`${revokeTarget.grant.representativeName} no longer has organization access.`);
    await refresh(true);
  };

  return <section aria-labelledby="admin-organizations-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <header className="flex flex-col gap-3 border-b border-border bg-gradient-to-br from-primary/[.045] to-transparent px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span><div className="min-w-0"><h2 id="admin-organizations-title" className="font-extrabold text-foreground">Student Organizations</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Verify organizations and appoint one active representative to own event work.</p></div></div>
      <div className="flex gap-2 sm:shrink-0"><Button type="button" variant="outline" size="sm" onClick={() => void refresh(true)} disabled={loading || refreshing} aria-label="Refresh organizations">{refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="hidden xs:inline">Refresh</span></Button><Button type="button" size="sm" onClick={() => setOrganizationEditor(null)} disabled={!loaded}><Plus className="h-4 w-4" />Add organization</Button></div>
    </header>
    {actionMessage && <p role="status" className="border-b border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200">{actionMessage}</p>}
    {loading && !loaded ? <div role="status" className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Loading organization assignments…</div>
      : loadError && !loaded ? <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div role="alert" className="flex items-start gap-2.5 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span>{loadError instanceof OrganizationAccessUnavailable ? "Organization management needs the approved database update before it can be used." : loadError instanceof Error ? loadError.message : "Organization assignments could not be loaded. Check your connection and retry."}</span></div><Button type="button" variant="outline" size="sm" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />Try again</Button></div>
      : organizations.length === 0 ? <div className="px-5 py-8 text-center"><Building2 className="mx-auto h-8 w-8 text-muted-foreground/60" /><h3 className="mt-3 text-sm font-bold">No verified organizations yet</h3><p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">Add an organization after verification, then appoint its active Student Organization representative.</p><Button type="button" size="sm" onClick={() => setOrganizationEditor(null)} className="mt-4"><Plus className="h-4 w-4" />Add organization</Button></div>
      : <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-2">{organizations.map((organization) => {
        const current = currentGrant(organization);
        const effective = hasEffectiveRepresentative(organization);
        const state = assignmentStatus(organization);
        const historyOpen = !!expandedHistory[organization.id];
        const historicalGrants = organization.grants;
        return <motion.article key={organization.id} layout initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: prefersReducedMotion ? 0 : .16 }} className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold text-foreground">{organization.name}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{organization.code}</span></div><p className="mt-1 text-xs text-muted-foreground">Verified organization record</p></div><span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold", state.style)}>{state.label}</span></div>
            <div className="mt-4 rounded-xl bg-muted/35 p-3.5">
              {effective && current ? <><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><UserRound className="h-3.5 w-3.5" />Current representative</div><p className="mt-1 break-words text-sm font-bold text-foreground">{current.representativeName}</p><p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"><span>{current.academicYear}</span><span aria-hidden="true">·</span><Clock3 className="h-3 w-3" /><span>Access through {manilaDate(current.expiresAt)} PHT</span></p></>
                : <><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><UserRoundX className="h-3.5 w-3.5" />No active representative</div><p className="mt-1 text-sm font-semibold text-foreground">{current?.representativeName ?? "No representative assigned"}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.message}</p></>}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button type="button" size="sm" onClick={() => assign(organization)} disabled={!organization.isActive} className="w-full sm:w-auto"><UserRoundPlus className="h-4 w-4" />{effective ? "Replace representative" : "Assign representative"}</Button>
              {current && <Button type="button" size="sm" variant="outline" onClick={() => setRevokeTarget({ organization, grant: current })} className="w-full text-destructive hover:text-destructive sm:w-auto"><UserRoundX className="h-4 w-4" />{effective ? "Revoke representative" : "End representative assignment"}</Button>}
              <Button type="button" variant="ghost" size="sm" onClick={() => setOrganizationEditor(organization)} className="w-full sm:ml-auto sm:w-auto"><Pencil className="h-3.5 w-3.5" />Edit organization</Button>
              <Button type="button" variant="ghost" size="sm" aria-expanded={historyOpen} onClick={() => setExpandedHistory((value) => ({ ...value, [organization.id]: !historyOpen }))} className="w-full sm:w-auto">{historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{historyOpen ? "Hide assignment history" : `Show assignment history${historicalGrants.length ? ` (${historicalGrants.length})` : ""}`}</Button>
            </div>
          </div>
          <AnimatePresence initial={false}>{historyOpen && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: prefersReducedMotion ? 0 : .16 }} className="overflow-hidden border-t border-border bg-muted/15"><div className="space-y-2 p-4"><h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Assignment history</h4>{historicalGrants.length ? [...historicalGrants].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map((grant) => <div key={grant.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-sm font-semibold">{grant.representativeName}</p><p className="text-xs text-muted-foreground">{grant.academicYear} · {manilaDate(grant.startsAt)}–{manilaDate(grant.expiresAt)}</p>{grant.endReason && <p className="mt-0.5 break-words text-xs text-muted-foreground">{grant.endReason}</p>}</div><span className="self-start rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{displayGrantState(grant, organization)}</span></div>) : <p className="text-xs text-muted-foreground">No previous representative assignments.</p>}</div></motion.div>}</AnimatePresence>
        </motion.article>;
      })}</div>}
    {Boolean(loadError) && loaded && <div role="alert" className="flex flex-col gap-2 border-t border-amber-300/50 bg-amber-50/60 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"><span>The latest organization assignments could not be refreshed. The information above may be out of date.</span><Button type="button" variant="outline" size="sm" onClick={() => void refresh(true)} disabled={refreshing}>{refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Retry</Button></div>}
    {selectedAssignmentOrganization && <RepresentativeAssignmentDialog organization={selectedAssignmentOrganization} profiles={profiles} onClose={() => setAssignmentOrganizationId(null)} onSaved={() => { setAssignmentOrganizationId(null); setActionMessage("Representative assigned. Existing organization work is now available to the incoming representative."); void refresh(true); }} onConflict={async () => { setAssignmentOrganizationId(null); await refresh(true); setActionMessage("The assignment changed while you were reviewing it. Current representative details have been refreshed."); }} />}
    {organizationEditor !== undefined && <OrganizationDetailsDialog key={organizationEditor?.id ?? "new-organization"} organization={organizationEditor} onClose={() => setOrganizationEditor(undefined)} onSave={saveOrganization} onConflict={async () => { await refresh(true); setActionMessage("Organization details changed in another session. The latest record has been refreshed; reopen it before editing again."); }} />}
    {revokeTarget && <RevokeRepresentativeDialog organization={revokeTarget.organization} grant={revokeTarget.grant} onClose={() => setRevokeTarget(null)} onConfirm={revoke} onConflict={async () => { setRevokeTarget(null); await refresh(true); setActionMessage("The assignment changed while the dialog was open. Current organization assignments have been refreshed."); }} />}
  </section>;
}
