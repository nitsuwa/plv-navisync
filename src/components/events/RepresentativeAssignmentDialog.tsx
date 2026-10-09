import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "../ui/Button";
import { eventOrganizationService, OrganizationAssignmentChanged } from "../../services/eventOrganizationService";
import type { ManagedProfile } from "../../services/adminUserService";
import type { EventOrganization, EventRepresentativeGrant, ReplaceRepresentativeInput } from "../../types/eventOrganization";

interface RepresentativeAssignmentDialogProps {
  organization: EventOrganization;
  profiles: ManagedProfile[];
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => Promise<void>;
}

function activeGrant(organization: EventOrganization): EventRepresentativeGrant | undefined {
  const now = Date.now();
  return organization.grants.find((item) => !item.endedAt && Date.parse(item.expiresAt) > now && item.profileActive && item.profileRole === "student_org");
}

function currentAssignment(organization: EventOrganization): EventRepresentativeGrant | undefined {
  return organization.grants.find((item) => !item.endedAt);
}

function manilaDate(value: string): string {
  return new Date(`${value}T23:59:59+08:00`).toISOString();
}

export function RepresentativeAssignmentDialog({ organization, profiles, onClose, onSaved, onConflict }: RepresentativeAssignmentDialogProps) {
  const current = currentAssignment(organization);
  const effective = activeGrant(organization);
  const [representativeId, setRepresentativeId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const incomingSelectRef = useRef<HTMLSelectElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);
  onCloseRef.current = onClose;
  savingRef.current = saving;

  const eligibleProfiles = useMemo(() => profiles
    .filter((profile) => profile.role === "student_org" && profile.is_active && profile.account_status === "active")
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)), [profiles]);
  const selected = eligibleProfiles.find((profile) => profile.id === representativeId);
  const availableProfiles = effective ? eligibleProfiles.filter((profile) => profile.id !== effective.representativeId) : eligibleProfiles;
  const heading = effective ? "Replace representative" : "Assign representative";

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = dialogRef.current;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (savingRef.current) return;
        onCloseRef.current();
      }
      if (event.key !== "Tab" || !element) return;
      const focusable = [...element.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (confirming) confirmationHeadingRef.current?.focus();
    else if (dialogRef.current?.contains(document.activeElement)) incomingSelectRef.current?.focus();
  }, [confirming]);

  const handleContinue = () => {
    if (!organization.isActive) { setError("Activate this organization before assigning a representative."); return; }
    if (!selected) { setError("Choose an active Student Organization account."); return; }
    if (effective?.representativeId === selected.id) { setError("Choose a different representative to replace the current one."); return; }
    if (!academicYear.trim() || academicYear.trim().length > 40) { setError("Enter the academic year (up to 40 characters)."); return; }
    if (!expiresOn || !Number.isFinite(Date.parse(manilaDate(expiresOn))) || Date.parse(manilaDate(expiresOn)) <= Date.now()) { setError("Choose a future access expiry date."); return; }
    setError(null);
    setConfirming(true);
  };

  const handleConfirm = async () => {
    if (!selected || !expiresOn) return;
    setSaving(true);
    setError(null);
    const input: ReplaceRepresentativeInput = {
      organizationId: organization.id,
      representativeId: selected.id,
      academicYear: academicYear.trim(),
      expiresAt: manilaDate(expiresOn),
      expectedGrantId: current?.id ?? null,
    };
    try {
      await eventOrganizationService.replaceRepresentative(input);
      onSaved();
    } catch (cause) {
      const changed = cause instanceof OrganizationAssignmentChanged || (cause instanceof Error && cause.name === "OrganizationAssignmentChanged");
      if (changed) {
        await onConflict();
        onClose();
      } else {
        setError(cause instanceof Error ? cause.message : "The representative could not be assigned. Please retry.");
      }
    } finally {
      setSaving(false);
    }
  };

  const currentName = effective?.representativeName ?? current?.representativeName;

  return <div className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/45 p-3 pt-[max(.75rem,env(safe-area-inset-top))] pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="representative-dialog-title" aria-describedby="representative-dialog-description" style={{ maxHeight: "calc(100dvh - max(.75rem, env(safe-area-inset-top, 0px)) - max(.75rem, env(safe-area-inset-bottom, 0px)))" }} className="my-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0"><h2 id="representative-dialog-title" className="text-lg font-extrabold text-foreground">{heading}</h2><p id="representative-dialog-description" className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{organization.name} · one active representative at a time</p></div>
        <button ref={closeRef} type="button" aria-label="Close representative assignment" disabled={saving} onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        {currentName && <div className="rounded-xl border border-border bg-muted/35 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{effective ? "Current representative" : "Previous assignment"}</p>
          <p className="mt-1 break-words text-sm font-bold text-foreground">{currentName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{current?.academicYear} · {effective ? `Access ends ${new Date(effective.expiresAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}` : "This assignment no longer has active access."}</p>
        </div>}

        {!confirming ? <>
          <label className="block space-y-1.5 text-sm font-semibold" htmlFor="incoming-representative"><span>Incoming representative</span>
            <select ref={incomingSelectRef} id="incoming-representative" aria-label="Incoming representative" value={representativeId} onChange={(event) => { setRepresentativeId(event.target.value); setError(null); }} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <option value="">Choose an active Student Org account</option>
              {eligibleProfiles.map((profile) => <option key={profile.id} value={profile.id} disabled={effective?.representativeId === profile.id}>{[profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email} · {profile.email}</option>)}
            </select>
          </label>
          {availableProfiles.length === 0 && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{effective ? "No other active Student Organization accounts are available. Activate or invite another representative first." : "No active Student Organization accounts are available. Activate or invite a representative first."}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-semibold" htmlFor="representative-academic-year"><span>Academic year</span><input id="representative-academic-year" aria-label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setError(null); }} maxLength={40} placeholder="e.g. 2026–2027" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
            <label className="block space-y-1.5 text-sm font-semibold" htmlFor="representative-expires"><span>Access expires on</span><input id="representative-expires" aria-label="Access expires on" type="date" value={expiresOn} min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })} onChange={(event) => { setExpiresOn(event.target.value); setError(null); }} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">The representative can work with this organization’s existing drafts, pending submissions, and feedback tasks. Original creator details and review history stay intact.</p>
        </> : <div role="group" aria-label="Confirm representative handover" aria-live="polite" className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <h3 ref={confirmationHeadingRef} tabIndex={-1} className="text-sm font-extrabold text-foreground focus-visible:outline-none">Confirm representative handover</h3>
          <div className="grid items-center gap-2 text-sm font-extrabold text-foreground sm:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)]"><span className="min-w-0 break-words">{effective?.representativeName ?? "No active representative"}</span><ArrowRight aria-hidden="true" className="h-4 w-4 rotate-90 text-primary sm:rotate-0" /><span className="min-w-0 break-words">{selected ? [selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.email : "Incoming representative"}</span></div>
          <p className="break-words text-sm leading-relaxed text-muted-foreground">{effective ? `${effective.representativeName} loses organization access as soon as this handover completes. ` : ""}{selected ? [selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.email : "The incoming representative"} inherits existing drafts, pending submissions, and feedback tasks. Event status, original creator attribution, and revision history do not change.</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Academic year</dt><dd className="font-semibold">{academicYear.trim()}</dd></div><div><dt className="text-xs text-muted-foreground">Access through</dt><dd className="font-semibold">{new Date(`${expiresOn}T23:59:59+08:00`).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })} PHT</dd></div></dl>
        </div>}
        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm leading-relaxed text-destructive">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button type="button" variant="outline" disabled={saving} onClick={() => confirming ? setConfirming(false) : onClose()} className="w-full sm:w-auto">{confirming ? "Back" : "Cancel"}</Button>
        {!confirming ? <Button type="button" disabled={availableProfiles.length === 0 || !organization.isActive} onClick={handleContinue} className="w-full sm:w-auto">Continue to handover</Button> : <Button type="button" disabled={saving} isLoading={saving} onClick={() => void handleConfirm()} className="w-full sm:w-auto">Confirm handover</Button>}
      </footer>
    </section>
  </div>;
}
