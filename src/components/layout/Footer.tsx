import { MapPin, Phone, Mail, Github, Globe, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router";
import { PLVLogo } from "../ui/PLVLogo";

const CURRENT_VERSION = "v1.0.3";
const LAST_UPDATED = "July 2026";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="max-w-7xl mx-auto px-5 sm:px-7 py-12 lg:py-16">
        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 lg:gap-8">

          {/* Brand — wider on mobile */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="flex items-center gap-3 mb-4 group">
              <PLVLogo size={36} />
              <div>
                <p className="font-extrabold text-foreground text-sm leading-none group-hover:text-primary transition-colors">PLV NaviSync</p>
                <p className="text-[10px] font-bold text-accent tracking-wider uppercase mt-0.5">Smart Campus Navigator</p>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-5">
              The intelligent campus navigation platform of Pamantasan ng Lungsod ng Valenzuela.
            </p>
            {/* System Status */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-50" />
                <div className="absolute inset-0 rounded-full bg-green-500" />
              </div>
              <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">System Online</span>
            </div>
          </div>

          {/* Platform Links */}
          <div>
            <h4 className="font-extrabold text-foreground text-xs uppercase tracking-widest mb-5">Platform</h4>
            <ul className="space-y-3">
              {[
                { label: "Home",        to: "/" },
                { label: "Campus Map",  to: "/map" },
                { label: "Help Center", to: "/help" },
                { label: "Login",       to: "/admin" },
              ].map(({ label, to }) => (
                <li key={to}>                    <Link
                      to={to}
                      className="text-sm text-muted-foreground hover:text-primary transition-all duration-200 flex items-center gap-1.5 group active:scale-[0.97]"
                  >
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors shrink-0" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-extrabold text-foreground text-xs uppercase tracking-widest mb-5">Contact</h4>
            <ul className="space-y-3.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span className="leading-relaxed">Tongco Street, Karuhatan,<br />Valenzuela City, 1440</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <span>(02) 8293-0000</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <span>info@plv.edu.ph</span>
              </li>
            </ul>
          </div>

          {/* Resources / Meta */}
          <div>
            <h4 className="font-extrabold text-foreground text-xs uppercase tracking-widest mb-5">Resources</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/announcements" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 group">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors shrink-0" />
                  Announcements
                </Link>
              </li>
              <li>
                <span className="text-muted-foreground flex items-center gap-1.5 cursor-default">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                  <Github className="h-3 w-3" />
                  GitHub
                </span>
              </li>
              <li className="pt-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                  <CheckCircle2 className="h-3 w-3 text-accent" />
                  Version {CURRENT_VERSION}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-1">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  Updated {LAST_UPDATED}
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border mt-10 pt-7 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <PLVLogo size={16} />
            <span className="text-[11px] text-muted-foreground">
              &copy; {new Date().getFullYear()} Pamantasan ng Lungsod ng Valenzuela. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-mono text-muted-foreground/60">
              PLV NaviSync {CURRENT_VERSION}
            </span>
            <span className="text-muted-foreground/20">|</span>
            <span className="text-[11px] text-muted-foreground/60">
              Built with &hearts; for PLV
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
