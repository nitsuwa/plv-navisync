import { useState, useEffect, useCallback } from "react";
import { Settings, Palette, Save, Check, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/utils";
import { SettingsSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";
import { settingsService, DEFAULT_SETTINGS } from "../services/settingsService";

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "emergency", label: "Emergency", icon: ShieldAlert },
];

interface SettingsForm {
  siteName: string;
  siteTagline: string;
  contactEmail: string;
  campusAddress: string;
  defaultLatitude: string;
  defaultLongitude: string;
  defaultZoom: string;
  defaultTheme: "light" | "dark" | "system";
  emergencyActive: boolean;
  emergencyMessage: string;
  emergencyLevel: "info" | "warning" | "critical";
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/30">
        <h3 className="font-bold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all";

export function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  const [form, setForm] = useState<SettingsForm>({
    siteName: DEFAULT_SETTINGS.site_name,
    siteTagline: DEFAULT_SETTINGS.site_tagline,
    contactEmail: DEFAULT_SETTINGS.contact_email,
    campusAddress: DEFAULT_SETTINGS.campus_address,
    defaultLatitude: DEFAULT_SETTINGS.default_latitude,
    defaultLongitude: DEFAULT_SETTINGS.default_longitude,
    defaultZoom: DEFAULT_SETTINGS.default_zoom,
    defaultTheme: "dark",
    emergencyActive: false,
    emergencyMessage: "",
    emergencyLevel: "warning",
  });

  const load = useCallback(async () => {
    try {
      const settings = await settingsService.getSettings();
      setForm({
        siteName: String(settings.site_name ?? DEFAULT_SETTINGS.site_name),
        siteTagline: String(settings.site_tagline ?? DEFAULT_SETTINGS.site_tagline),
        contactEmail: String(settings.contact_email ?? DEFAULT_SETTINGS.contact_email),
        campusAddress: String(settings.campus_address ?? DEFAULT_SETTINGS.campus_address),
        defaultLatitude: String(settings.default_latitude ?? DEFAULT_SETTINGS.default_latitude),
        defaultLongitude: String(settings.default_longitude ?? DEFAULT_SETTINGS.default_longitude),
        defaultZoom: String(settings.default_zoom ?? DEFAULT_SETTINGS.default_zoom),
        defaultTheme: (settings.default_theme as SettingsForm["defaultTheme"]) ?? "dark",
        emergencyActive: String(settings.emergency_active ?? "false") === "true",
        emergencyMessage: String(settings.emergency_message ?? ""),
        emergencyLevel: (settings.emergency_level as SettingsForm["emergencyLevel"]) ?? "warning",
      });
    } catch (err) {
      toast.error("Load failed", err instanceof Error ? err.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key: keyof SettingsForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.siteName.trim()) errs.siteName = "Site name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) errs.contactEmail = "Enter a valid email address";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      await settingsService.upsertSettings([
        { key: "site_name", value: form.siteName.trim(), isPublic: true },
        { key: "site_tagline", value: form.siteTagline.trim(), isPublic: true },
        { key: "contact_email", value: form.contactEmail.trim(), isPublic: true },
        { key: "campus_address", value: form.campusAddress.trim(), isPublic: true },
        { key: "default_latitude", value: form.defaultLatitude.trim() || DEFAULT_SETTINGS.default_latitude },
        { key: "default_longitude", value: form.defaultLongitude.trim() || DEFAULT_SETTINGS.default_longitude },
        { key: "default_zoom", value: form.defaultZoom.trim() || DEFAULT_SETTINGS.default_zoom },
        { key: "default_theme", value: form.defaultTheme, isPublic: true },
        { key: "emergency_active", value: form.emergencyActive, isPublic: true },
        { key: "emergency_message", value: form.emergencyMessage.trim(), isPublic: true },
        { key: "emergency_level", value: form.emergencyLevel, isPublic: true },
        { key: "emergency_updated_at", value: Date.now(), isPublic: true },
      ]);
      setSaved(true);
      toast.success("Settings saved", "Your configuration has been updated.");
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await settingsService.upsertSettings(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));
      setForm({
        siteName: DEFAULT_SETTINGS.site_name,
        siteTagline: DEFAULT_SETTINGS.site_tagline,
        contactEmail: DEFAULT_SETTINGS.contact_email,
        campusAddress: DEFAULT_SETTINGS.campus_address,
        defaultLatitude: DEFAULT_SETTINGS.default_latitude,
        defaultLongitude: DEFAULT_SETTINGS.default_longitude,
        defaultZoom: DEFAULT_SETTINGS.default_zoom,
        defaultTheme: "dark",
        emergencyActive: false,
        emergencyMessage: "",
        emergencyLevel: "warning",
      });
      toast.success("Settings reset", "Restored default values.");
    } catch (err) {
      toast.error("Reset failed", err instanceof Error ? err.message : "Could not reset settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Platform settings are persisted to the database.</p>
        </div>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saved ? <><Check className="h-4 w-4" /> Saved!</> : <><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}</>}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar bg-muted/50 rounded-2xl p-1.5 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap active:scale-[0.97]",
              activeTab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* General */}
      {activeTab === "general" && (
        <div className="space-y-5">
          <SectionCard title="Site Identity" description="Customize how PLV NaviSync appears to users.">
            <div className="space-y-4">
              <div>
                <label htmlFor="site-name" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Site Name *</label>
                <input id="site-name" type="text" value={form.siteName} onChange={(e) => update("siteName", e.target.value)}
                  placeholder="e.g. PLV NaviSync"
                  className={cn(inputCls, errors.siteName && "border-destructive focus:ring-destructive/30")} />
                {errors.siteName && <p className="text-[10px] text-destructive mt-1 font-medium">{errors.siteName}</p>}
              </div>
              <div>
                <label htmlFor="site-tagline" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Tagline</label>
                <input id="site-tagline" type="text" value={form.siteTagline} onChange={(e) => update("siteTagline", e.target.value)}
                  placeholder="e.g. Smart Campus Navigator" className={inputCls} />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Contact Email</label>
                <input id="contact-email" type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)}
                  placeholder="navisync@plv.edu.ph"
                  className={cn(inputCls, errors.contactEmail && "border-destructive focus:ring-destructive/30")} />
                {errors.contactEmail && <p className="text-[10px] text-destructive mt-1 font-medium">{errors.contactEmail}</p>}
              </div>
              <div>
                <label htmlFor="campus-address" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Campus Address</label>
                <input id="campus-address" type="text" value={form.campusAddress} onChange={(e) => update("campusAddress", e.target.value)}
                  placeholder="Street, Building, Barangay" className={inputCls} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Map Configuration" description="Configure the campus map display.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="default-latitude" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Default Latitude</label>
                <input id="default-latitude" type="number" value={form.defaultLatitude} onChange={(e) => update("defaultLatitude", e.target.value)}
                  step="0.0001" placeholder="14.7116" className={cn(inputCls, "font-mono")} />
              </div>
              <div>
                <label htmlFor="default-longitude" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Default Longitude</label>
                <input id="default-longitude" type="number" value={form.defaultLongitude} onChange={(e) => update("defaultLongitude", e.target.value)}
                  step="0.0001" placeholder="120.9660" className={cn(inputCls, "font-mono")} />
              </div>
              <div>
                <label htmlFor="default-zoom" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Default Zoom</label>
                <input id="default-zoom" type="number" min={10} max={20} value={form.defaultZoom} onChange={(e) => update("defaultZoom", e.target.value)}
                  placeholder="16" className={cn(inputCls, "font-mono")} />
                <p className="text-[10px] text-muted-foreground mt-1">Zoom level used when the campus map first opens.</p>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Appearance */}
      {activeTab === "appearance" && (
        <div className="space-y-5">
          <SectionCard title="Display Preferences" description="Default theme for the site.">
            <div className="space-y-4">
              <div>
                <label htmlFor="appearance-theme" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Default Theme</label>
                <select id="appearance-theme" value={form.defaultTheme} onChange={(e) => update("defaultTheme", e.target.value)}
                  className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm sm:max-w-xs">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Initial theme for new visitors. Users can still switch themes themselves.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Danger Zone" description="Restore all settings to factory defaults.">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Reset All Settings</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Overwrites saved values with the built-in defaults.</p>
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={handleReset} disabled={saving}>
                <RefreshCw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Emergency */}
      {activeTab === "emergency" && (
        <div className="space-y-5">
          <SectionCard title="Emergency Broadcast" description="Post an alert that appears as a banner on all public pages. Ideal for typhoons, campus closures, or urgent notices.">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    form.emergencyActive
                      ? "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Alert active</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {form.emergencyActive ? "The banner is currently visible to visitors." : "No banner is shown right now."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.emergencyActive}
                  onClick={() => setForm((f) => ({ ...f, emergencyActive: !f.emergencyActive }))}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors shrink-0",
                    form.emergencyActive ? "bg-red-500" : "bg-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    form.emergencyActive ? "translate-x-[22px]" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              <div>
                <label htmlFor="emergency-message" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Alert Message</label>
                <textarea
                  id="emergency-message"
                  rows={3}
                  value={form.emergencyMessage}
                  onChange={(e) => update("emergencyMessage", e.target.value)}
                  placeholder="e.g. Class suspension due to Typhoon — all offices closed today."
                  className={cn(inputCls, "h-auto py-3 resize-none")}
                />
                <p className="text-[10px] text-muted-foreground mt-1">The message is shown on the banner only when the alert is active.</p>
              </div>

              <div>
                <label htmlFor="emergency-level" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Severity Level</label>
                <select id="emergency-level" value={form.emergencyLevel} onChange={(e) => update("emergencyLevel", e.target.value)}
                  className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm sm:max-w-xs">
                  <option value="info">Info (blue)</option>
                  <option value="warning">Warning (amber)</option>
                  <option value="critical">Critical (red)</option>
                </select>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
