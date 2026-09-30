import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, Check, GraduationCap, Map, Save } from "lucide-react";
import { Button } from "../components/ui/Button";
import { SettingsSkeleton } from "../components/ui/PageSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../app/components/ui/select";
import { useToast } from "../hooks/useToast";
import { cn } from "../lib/utils";
import { campusService } from "../services/campusService";
import {
  DEFAULT_PUBLIC_PLATFORM_SETTINGS,
  logPlatformSettingsActivity,
  normalizePublicPlatformSettings,
  settingsService,
  type PublicPlatformSettings,
  type SettingsEntry,
} from "../services/settingsService";
import {
  adminNotificationPreferencesService,
  DEFAULT_ADMIN_NOTIFICATION_PREFERENCES,
  type AdminNotificationPreferences,
} from "../services/adminNotificationPreferencesService";

const TABS = [
  { id: "student", label: "Student Experience", icon: GraduationCap },
  { id: "map", label: "Map & Navigation", icon: Map },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

const PLATFORM_SETTING_KEYS: Record<keyof PublicPlatformSettings, string> = {
  defaultCampusId: "default_campus_id",
  defaultLandingPage: "default_student_landing_page",
  rememberLastCampus: "remember_last_campus",
  showApprovedEventOverlays: "show_approved_event_overlays",
  defaultRouteMode: "default_route_mode",
  animatedRouteArrows: "animated_route_arrows",
  autoFocusRoute: "auto_focus_route",
  autoFollowFloors: "auto_follow_floors",
  showMapLabels: "show_map_labels",
};

interface CampusOption {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card">
      <div className="border-b border-border/70 px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-extrabold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="divide-y divide-border/60 px-4 sm:px-5">{children}</div>
    </section>
  );
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_300px] sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex w-full items-center sm:justify-end">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2", checked ? "bg-primary" : "bg-muted-foreground/30")}
    >
      <span className={cn("inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-150", checked ? "translate-x-[22px]" : "translate-x-[3px]")} />
    </button>
  );
}

interface SettingsSelectOption {
  value: string;
  label: string;
}

function SettingsSelect({
  value,
  onChange,
  options,
  label,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SettingsSelectOption[];
  label: string;
  placeholder: string;
  disabled?: boolean;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label;
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        size="lg"
        aria-label={label}
        title={selectedLabel}
        className="w-full min-w-0 rounded-xl border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/35 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 data-[state=open]:border-primary/50 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground sm:w-[300px]"
      >
        <SelectValue placeholder={placeholder} className="min-w-0 truncate" />
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={6}
        style={{ maxHeight: "min(20rem, var(--radix-select-content-available-height))" }}
        className="max-h-[min(20rem,var(--radix-select-content-available-height))] rounded-xl border-border/90 bg-popover p-1.5 shadow-lg [&[data-state=open]]:duration-150 [&[data-state=closed]]:duration-100 motion-reduce:animate-none motion-reduce:transition-none"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            title={option.label}
            className="min-h-10 rounded-lg px-3 py-2 text-sm focus:bg-primary/10 focus:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground"
          >
            <span className="block min-w-0 truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function publishedCampusOptions(campuses: Awaited<ReturnType<typeof campusService.list>>): CampusOption[] {
  return campuses
    .filter((campus) => campus.lifecycleStatus === "published" || campus.publishStatus === "published")
    .map((campus) => ({ id: campus.id, name: campus.name, code: campus.code ?? "", isDefault: Boolean(campus.isDefault) }));
}

export function AdminSettingsPage() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const prefersReducedMotion = useReducedMotion();
  const saveLock = useRef(false);
  const savedTimer = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("student");
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [campusesLoadFailed, setCampusesLoadFailed] = useState(false);
  const [platform, setPlatform] = useState<PublicPlatformSettings>(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
  const [notifications, setNotifications] = useState<AdminNotificationPreferences>(DEFAULT_ADMIN_NOTIFICATION_PREFERENCES);
  const initialPlatform = useRef<PublicPlatformSettings>(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
  const initialNotifications = useRef<AdminNotificationPreferences>(DEFAULT_ADMIN_NOTIFICATION_PREFERENCES);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsResult, campusesResult, notificationResult] = await Promise.allSettled([
      settingsService.getSettings(),
      campusService.list(),
      adminNotificationPreferencesService.get(),
    ]);

    if (settingsResult.status === "rejected") {
      toastRef.current.error("Settings could not be loaded", settingsResult.reason instanceof Error ? settingsResult.reason.message : "Try again in a moment.");
      setLoading(false);
      return;
    }

    const available = campusesResult.status === "fulfilled" ? publishedCampusOptions(campusesResult.value) : [];
    setCampuses(available);
    setCampusesLoadFailed(campusesResult.status === "rejected");
    if (campusesResult.status === "rejected") {
      toastRef.current.error("Campus list could not be loaded", "The other settings are available, but Default Campus cannot be changed right now.");
    }

    const normalized = normalizePublicPlatformSettings(settingsResult.value);
    const fallbackCampus = available.find((campus) => campus.isDefault) ?? available[0];
    const campusValue = available.some((campus) => campus.id === normalized.defaultCampusId)
      ? normalized.defaultCampusId
      : fallbackCampus?.id ?? "";
    const nextPlatform = { ...normalized, defaultCampusId: campusValue };
    const nextNotifications = notificationResult.status === "fulfilled"
      ? notificationResult.value
      : DEFAULT_ADMIN_NOTIFICATION_PREFERENCES;

    setPlatform(nextPlatform);
    setNotifications(nextNotifications);
    initialPlatform.current = nextPlatform;
    initialNotifications.current = nextNotifications;
    if (notificationResult.status === "rejected") {
      toastRef.current.error("Notification preferences could not be loaded", "Default notification choices are shown.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => () => {
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
  }, []);

  const dirty = JSON.stringify(platform) !== JSON.stringify(initialPlatform.current)
    || JSON.stringify(notifications) !== JSON.stringify(initialNotifications.current);

  const updatePlatform = <K extends keyof PublicPlatformSettings>(key: K, value: PublicPlatformSettings[K]) => {
    setPlatform((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const updateNotification = <K extends keyof AdminNotificationPreferences>(key: K, value: boolean) => {
    setNotifications((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (saveLock.current) return;
    const entries: SettingsEntry[] = (Object.keys(PLATFORM_SETTING_KEYS) as (keyof PublicPlatformSettings)[])
      .filter((key) => platform[key] !== initialPlatform.current[key])
      .map((key) => ({ key: PLATFORM_SETTING_KEYS[key], value: platform[key], isPublic: true }));
    const notificationChanged = JSON.stringify(notifications) !== JSON.stringify(initialNotifications.current);
    if (entries.length === 0 && !notificationChanged) return;

    saveLock.current = true;
    setSaving(true);
    setSaved(false);
    try {
      await settingsService.upsertSettings(entries, false);
      if (notificationChanged) await adminNotificationPreferencesService.save(notifications);
      await logPlatformSettingsActivity([
        ...entries.map((entry) => entry.key),
        ...(notificationChanged ? ["admin_notification_preferences"] : []),
      ]);
      initialPlatform.current = { ...platform };
      initialNotifications.current = { ...notifications };
      setSaved(true);
      toastRef.current.success("Settings saved", "Your changes are updated.");
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 2200);
    } catch (error) {
      toastRef.current.error("Settings could not be saved", error instanceof Error ? error.message : "Try again. Your changes are still here.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex !== undefined) {
      event.preventDefault();
      const nextTab = TABS[nextIndex];
      setActiveTab(nextTab.id);
      document.getElementById(`settings-tab-${nextTab.id}`)?.focus();
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Practical controls for the student experience and admin notifications.</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {dirty && <p className="text-right text-[11px] font-medium text-muted-foreground" aria-live="polite">Unsaved changes</p>}
        <Button variant="primary" onClick={handleSave} disabled={saving || !dirty} isLoading={saving} className={cn("w-full sm:w-auto", !dirty && !saved && "bg-muted text-muted-foreground shadow-none hover:bg-muted hover:shadow-none")}>
          {saved ? <><Check className="h-4 w-4" /> Saved</> : saving ? "Saving..." : <><Save className="h-4 w-4" /> Save Changes</>}
        </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Settings sections" className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-border/70 bg-muted/45 p-1 sm:p-1.5">
        {TABS.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            id={`settings-tab-${id}`}
            type="button"
            role="tab"
            aria-controls={`settings-panel-${id}`}
            aria-selected={activeTab === id}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={cn("flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center text-[10px] font-bold leading-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm", activeTab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/50 hover:text-foreground")}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeTab}
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -2 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
        className="focus:outline-none"
      >
      {activeTab === "student" && <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Student Experience</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Choose the defaults students see when opening NaviSync.</p>
        </div>
        <Section title="Getting started">
          <SettingRow title="Default Campus" description="Campus shown when no previous choice exists.">
            <SettingsSelect
              label="Default Campus"
              value={platform.defaultCampusId}
              disabled={!campuses.length || campusesLoadFailed}
              placeholder={campusesLoadFailed ? "Campus list unavailable" : "No published campuses"}
              options={campuses.map((campus) => ({
                value: campus.id,
                label: campus.code ? `${campus.name} — ${campus.code}` : campus.name,
              }))}
              onChange={(value) => updatePlatform("defaultCampusId", value)}
            />
          </SettingRow>
          <SettingRow title="Default Landing Page" description="Page students see when NaviSync opens.">
            <div className="grid h-[42px] w-full grid-cols-2 rounded-xl border border-border bg-muted/45 p-1 sm:w-[300px]">
              {(["home", "map"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={platform.defaultLandingPage === value} onClick={() => updatePlatform("defaultLandingPage", value)}
                  className={cn("rounded-lg px-3 text-sm font-bold capitalize transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", platform.defaultLandingPage === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{value}</button>
              ))}
            </div>
          </SettingRow>
        </Section>
        <Section title="Student map">
          <SettingRow title="Remember Last Campus" description="Return students to the campus they last viewed.">
            <Toggle label="Remember Last Campus" checked={platform.rememberLastCampus} onChange={(value) => updatePlatform("rememberLastCampus", value)} />
          </SettingRow>
          <SettingRow title="Show Approved Event Overlays" description="Show approved event layouts on student maps.">
            <Toggle label="Show Approved Event Overlays" checked={platform.showApprovedEventOverlays} onChange={(value) => updatePlatform("showApprovedEventOverlays", value)} />
          </SettingRow>
        </Section>
      </div>}

      {activeTab === "map" && <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Map &amp; Navigation</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Set the default map and route experience.</p>
        </div>
        <Section title="Map behavior">
          <SettingRow title="Default Route Mode" description="Mode selected when a new route starts.">
            <SettingsSelect
              label="Default Route Mode"
              value={platform.defaultRouteMode}
              placeholder="Choose a route mode"
              options={[
                { value: "standard", label: "Standard" },
                { value: "accessible", label: "Accessible" },
              ]}
              onChange={(value) => updatePlatform("defaultRouteMode", value as PublicPlatformSettings["defaultRouteMode"])}
            />
          </SettingRow>
          <SettingRow title="Animated Route Arrows" description="Animate direction arrows along active routes.">
            <Toggle label="Animated Route Arrows" checked={platform.animatedRouteArrows} onChange={(value) => updatePlatform("animatedRouteArrows", value)} />
          </SettingRow>
          <SettingRow title="Focus New Routes" description="Fit a newly created route into view.">
            <Toggle label="Focus New Routes" checked={platform.autoFocusRoute} onChange={(value) => updatePlatform("autoFocusRoute", value)} />
          </SettingRow>
          <SettingRow title="Follow Multi-floor Routes" description="Move to the next floor when the route continues.">
            <Toggle label="Follow Multi-floor Routes" checked={platform.autoFollowFloors} onChange={(value) => updatePlatform("autoFollowFloors", value)} />
          </SettingRow>
          <SettingRow title="Show Map Labels" description="Show campus, building, room, and floor labels.">
            <Toggle label="Show Map Labels" checked={platform.showMapLabels} onChange={(value) => updatePlatform("showMapLabels", value)} />
          </SettingRow>
        </Section>
      </div>}

      {activeTab === "notifications" && <div className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Notifications</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Choose which admin activity appears in your notification bell.</p>
        </div>
        <Section title="Notify me about" description="Applies only to your administrator account.">
          <SettingRow title="Reports" description="New reports and important updates.">
            <Toggle label="Reports notifications" checked={notifications.reports} onChange={(value) => updateNotification("reports", value)} />
          </SettingRow>
          <SettingRow title="Events" description="Event and event-layout activity.">
            <Toggle label="Events notifications" checked={notifications.events} onChange={(value) => updateNotification("events", value)} />
          </SettingRow>
          <SettingRow title="Campus & Publishing" description="Campus and publication activity.">
            <Toggle label="Campus and publishing notifications" checked={notifications.campus} onChange={(value) => updateNotification("campus", value)} />
          </SettingRow>
          <SettingRow title="Announcements" description="Announcement activity.">
            <Toggle label="Announcement notifications" checked={notifications.announcements} onChange={(value) => updateNotification("announcements", value)} />
          </SettingRow>
          <SettingRow title="User Management" description="Account and role changes.">
            <Toggle label="User management notifications" checked={notifications.users} onChange={(value) => updateNotification("users", value)} />
          </SettingRow>
          <p className="flex items-center gap-1.5 py-3 text-[11px] text-muted-foreground" role="note">
            <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Activity Logs continue recording all administrative activity.
          </p>
        </Section>
      </div>}

      </motion.div>
      </AnimatePresence>
    </div>
  );
}
