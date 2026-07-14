import { useState, useEffect } from "react";
import { Settings, Bell, Shield, Globe, Palette, Save, Check, Database, Mail, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLVLogo } from "../components/ui/PLVLogo";
import { cn } from "../lib/utils";
import { SettingsSkeleton } from "../components/ui/PageSkeleton";
import { useToast } from "../hooks/useToast";

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Database },
];

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex w-11 h-6 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className="inline-block w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
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

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 border-b border-border last:border-0">
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  // General settings state
  const [siteName, setSiteName] = useState("PLV NaviSync");
  const [siteTagline, setSiteTagline] = useState("Smart Campus Navigator");
  const [contactEmail, setContactEmail] = useState("navisync@plv.edu.ph");
  const [campusAddress, setCampusAddress] = useState("Tongco Street, Karuhatan, Valenzuela City");

  // Notification toggles
  const [notifs, setNotifs] = useState({
    emailAnnouncements: true,
    emailEmergency: true,
    pushAnnouncements: false,
    pushMaintenance: true,
    smsEmergency: false,
  });

  // Security
  const [security, setSecurity] = useState({
    twoFactor: false,
    sessionTimeout: "30",
    loginAttempts: "5",
  });

  // Appearance
  const [appearance, setAppearance] = useState({
    defaultTheme: "light",
    showHero: true,
    showStats: true,
    showFeaturedBuildings: true,
    compactNav: false,
  });

  const handleSave = () => {
    setSaved(true);
    toast.success("Settings saved", "Your configuration has been updated.");
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure PLV NaviSync platform settings.</p>
        </div>
        <Button variant="primary" onClick={handleSave}>
          {saved ? <><Check className="h-4 w-4" /> Saved!</> : <><Save className="h-4 w-4" /> Save Changes</>}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar bg-muted/50 rounded-2xl p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
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
            <div className="flex items-start gap-6 mb-5">
              <PLVLogo size={60} className="shrink-0" />
              <div className="flex-1 space-y-3">
                <div>
                  <label htmlFor="site-name" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Site Name</label>
                  <input id="site-name" type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
                </div>
                <div>
                  <label htmlFor="site-tagline" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Tagline</label>
                  <input id="site-tagline" type="text" value={siteTagline} onChange={(e) => setSiteTagline(e.target.value)}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="contact-email" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Contact Email</label>
                <input id="contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
              </div>
              <div>
                <label htmlFor="campus-address" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Campus Address</label>
                <input id="campus-address" type="text" value={campusAddress} onChange={(e) => setCampusAddress(e.target.value)}
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Map Configuration" description="Configure the campus map display.">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="default-latitude" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Default Latitude</label>
                <input id="default-latitude" type="number" defaultValue="14.7116" step="0.0001"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-sm" />
              </div>
              <div>
                <label htmlFor="default-longitude" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Default Longitude</label>
                <input id="default-longitude" type="number" defaultValue="120.9660" step="0.0001"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-sm" />
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Notifications */}
      {activeTab === "notifications" && (
        <SectionCard title="Notification Preferences" description="Control how and when notifications are sent.">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Email Notifications</p>
            <SettingRow label="Announcement Emails" description="Send emails when new announcements are posted">
              <ToggleSwitch checked={notifs.emailAnnouncements} onChange={(v) => setNotifs({ ...notifs, emailAnnouncements: v })} />
            </SettingRow>
            <SettingRow label="Emergency Alerts" description="Immediately email all users on emergency alerts">
              <ToggleSwitch checked={notifs.emailEmergency} onChange={(v) => setNotifs({ ...notifs, emailEmergency: v })} />
            </SettingRow>
          </div>
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Push Notifications</p>
            <SettingRow label="New Announcements" description="Browser push for new announcements">
              <ToggleSwitch checked={notifs.pushAnnouncements} onChange={(v) => setNotifs({ ...notifs, pushAnnouncements: v })} />
            </SettingRow>
            <SettingRow label="Maintenance Notices" description="Push notifications for scheduled maintenance">
              <ToggleSwitch checked={notifs.pushMaintenance} onChange={(v) => setNotifs({ ...notifs, pushMaintenance: v })} />
            </SettingRow>
            <SettingRow label="SMS Emergency Alerts" description="Send SMS for emergency-level announcements">
              <ToggleSwitch checked={notifs.smsEmergency} onChange={(v) => setNotifs({ ...notifs, smsEmergency: v })} />
            </SettingRow>
          </div>
        </SectionCard>
      )}

      {/* Security */}
      {activeTab === "security" && (
        <div className="space-y-5">
          <SectionCard title="Authentication" description="Manage login security settings.">
            <SettingRow label="Two-Factor Authentication" description="Require 2FA for all admin accounts">
              <ToggleSwitch checked={security.twoFactor} onChange={(v) => setSecurity({ ...security, twoFactor: v })} />
            </SettingRow>
            <SettingRow label="Session Timeout" description="Auto-logout after inactivity (minutes)">
              <select id="security-timeout" value={security.sessionTimeout} onChange={(e) => setSecurity({ ...security, sessionTimeout: e.target.value })}
                className="h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {["15", "30", "60", "120"].map((v) => (
                  <option key={v} value={v}>{v} min</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Max Login Attempts" description="Lock account after N failed attempts">
              <select id="security-attempts" value={security.loginAttempts} onChange={(e) => setSecurity({ ...security, loginAttempts: e.target.value })}
                className="h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {["3", "5", "10"].map((v) => (
                  <option key={v} value={v}>{v} attempts</option>
                ))}
              </select>
            </SettingRow>
          </SectionCard>

          <SectionCard title="Danger Zone" description="Irreversible actions — proceed with caution.">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-destructive">Reset All Settings</p>
                <p className="text-xs text-muted-foreground mt-0.5">Restore all settings to factory defaults.</p>
              </div>
              <Button variant="danger" size="sm">
                <RefreshCw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Appearance */}
      {activeTab === "appearance" && (
        <SectionCard title="Display Preferences" description="Customize the look of PLV NaviSync.">
          <SettingRow label="Default Theme" description="Initial theme for new visitors">
            <select id="appearance-theme" value={appearance.defaultTheme} onChange={(e) => setAppearance({ ...appearance, defaultTheme: e.target.value })}
              className="h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </SettingRow>
          <SettingRow label="Show Hero Section" description="Display the hero on the landing page">
            <ToggleSwitch checked={appearance.showHero} onChange={(v) => setAppearance({ ...appearance, showHero: v })} />
          </SettingRow>
          <SettingRow label="Show Statistics Bar" description="Display campus statistics on the homepage">
            <ToggleSwitch checked={appearance.showStats} onChange={(v) => setAppearance({ ...appearance, showStats: v })} />
          </SettingRow>
          <SettingRow label="Featured Buildings Section" description="Show featured buildings on the homepage">
            <ToggleSwitch checked={appearance.showFeaturedBuildings} onChange={(v) => setAppearance({ ...appearance, showFeaturedBuildings: v })} />
          </SettingRow>
          <SettingRow label="Compact Navigation" description="Use a smaller navbar on desktop">
            <ToggleSwitch checked={appearance.compactNav} onChange={(v) => setAppearance({ ...appearance, compactNav: v })} />
          </SettingRow>
        </SectionCard>
      )}

      {/* Integrations */}
      {activeTab === "integrations" && (
        <div className="space-y-5">
          <SectionCard title="Supabase Backend" description="Connect your Supabase project for live data.">
            <div className="space-y-3">
              <div>
                <label htmlFor="supabase-url" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Supabase URL</label>
                <input id="supabase-url" type="text" placeholder="https://your-project.supabase.co"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-sm" />
              </div>
              <div>
                <label htmlFor="anon-key" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Anon Key</label>
                <input id="anon-key" type="password" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-sm" />
              </div>
              <Button variant="outline" size="sm" className="mt-1">
                <Database className="h-3.5 w-3.5" /> Test Connection
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Email Service" description="Configure transactional email for announcements.">
            <div className="space-y-3">
              <div>
                <label htmlFor="smtp-host" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">SMTP Host</label>
                <input id="smtp-host" type="text" placeholder="smtp.plv.edu.ph"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="smtp-port" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Port</label>
                  <input id="smtp-port" type="number" defaultValue={587}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-sm" />
                </div>
                <div>
                  <label htmlFor="smtp-from" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">From Email</label>
                  <input id="smtp-from" type="email" placeholder="noreply@plv.edu.ph"
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Mail className="h-3.5 w-3.5" /> Send Test Email
              </Button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
