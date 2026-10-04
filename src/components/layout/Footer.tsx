import { Mail, MapPin } from "lucide-react";
import { Link } from "react-router";
import { PLVLogo } from "../ui/PLVLogo";
import { useStudentAuth } from "../../hooks/useStudentAuth";

const CURRENT_VERSION = "v1.0.3";

export function Footer() {
  const { isStudent } = useStudentAuth();
  const quickLinks = [
    { label: "Home", to: "/" },
    { label: "Campus Map", to: "/map" },
    { label: isStudent ? "Student Portal" : "Sign In", to: isStudent ? "/home" : "/admin" },
  ];

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-7 sm:py-11">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-[1.4fr_0.7fr_1fr]">
          <div>
            <Link to="/" className="mb-3 inline-flex items-center gap-3 group">
              <PLVLogo size={36} />
              <span>
                <span className="block text-sm font-extrabold leading-none text-foreground transition-colors group-hover:text-primary">PLV NaviSync</span>
                <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-accent">Smart Campus Navigator</span>
              </span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Navigate buildings, rooms, facilities, and walking routes across PLV.
            </p>
          </div>

          <nav aria-label="Quick links">
            <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground">Quick Links</h2>
            <ul className="space-y-2.5">
              {quickLinks.map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-primary">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground">Contact</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <address className="not-italic leading-relaxed">Maysan Road corner Tongco Street, Barangay Maysan, Valenzuela City, 1440 Metro Manila</address>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <a href="mailto:registrarsoffice@plv.edu.ph" className="transition-colors hover:text-primary">registrarsoffice@plv.edu.ph</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-5 text-center sm:flex-row sm:text-left">
          <p className="text-[11px] text-muted-foreground">© {new Date().getFullYear()} Pamantasan ng Lungsod ng Valenzuela</p>
          <p className="text-[11px] font-mono text-muted-foreground/70">NaviSync {CURRENT_VERSION}</p>
        </div>
      </div>
    </footer>
  );
}
