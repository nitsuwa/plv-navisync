import { MapPin, Phone, Mail } from "lucide-react";
import { Link } from "react-router";
import { PLVLogo } from "../ui/PLVLogo";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="max-w-7xl mx-auto px-5 sm:px-7 py-10 lg:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">

          {/* Brand */}
          <div className="sm:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <PLVLogo size={40} />
              <div>
                <p className="font-extrabold text-foreground text-sm leading-none">PLV NaviSync</p>
                <p className="text-[10px] font-bold text-accent tracking-wider uppercase mt-0.5">Smart Campus Navigator</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              The intelligent campus navigation platform of Pamantasan ng Lungsod ng Valenzuela.
            </p>
          </div>

          {/* Links — per spec: Home, Map, Help Center, Login only */}
          <div>
            <h4 className="font-extrabold text-foreground text-xs uppercase tracking-widest mb-4">Platform</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Home",        to: "/" },
                { label: "Campus Map",  to: "/map" },
                { label: "Help Center", to: "/help" },
                { label: "Login",       to: "/admin" },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 group">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors shrink-0" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-extrabold text-foreground text-xs uppercase tracking-widest mb-4">Contact</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span className="leading-relaxed">Tongco Street, Karuhatan, Valenzuela City, 1440</span>
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
        </div>

        <div className="border-t border-border mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PLVLogo size={18} />
            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Pamantasan ng Lungsod ng Valenzuela. All rights reserved.
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">PLV NaviSync v1.0</span>
        </div>
      </div>
    </footer>
  );
}
