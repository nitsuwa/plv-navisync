import { useState, useRef, useEffect } from "react";
import {
  Send, ChevronDown, CheckCircle2, Bot, User, Sparkles,  MessageCircle, HelpCircle, Mail, Phone, MapPin, Clock, ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LavaLampBackground } from "../components/ui/HeroBackground";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { Footer } from "../components/layout/Footer";
import { PageTransition, FadeIn } from "../components/ui/PageTransition";
import { cn } from "../lib/utils";

// ── Scroll-reveal wrapper ──
function Reveal({ children, className, delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? "translateY(0)" : "translateY(24px)",
      transition: visible
        ? `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`
        : "opacity 0.3s ease, transform 0.3s ease",
    }}>
      {children}
    </div>
  );
}

// ── AI knowledge base ──
const AI_KB: Record<string, string> = {
  registrar:  "The **Registrar's Office** is on the **Ground Floor of the ADM Building (b2)**. Hours: Monday–Friday, 8:00 AM–5:00 PM. Services include enrollment, transcript requests, and authentication.",
  cashier:    "The **Cashier's Office** is on the **Ground Floor of the ADM Building (b2)**, near the main lobby. Accepts tuition and fee payments. Hours: 8:00 AM–4:30 PM, weekdays.",
  library:    "The **Learning Resource Center (LRC, b3)** is PLV's main library. Open Monday–Saturday, 7:30 AM–6:00 PM. Features reading rooms, computer access, study booths, and a media section.",
  admissions: "The **Admissions Office** is on the **Ground Floor of ADM Building (b2)**. Walk-ins are accepted during regular office hours.",
  gymnasium:  "The **PLV Gymnasium (GYM, b5)** is at the south side of campus. It hosts sports events and is open to enrolled students during non-event days.",
  emergency:  "For emergencies: contact the Security Office at the Main Gate. **Emergency Mode** on the map shows exits, evacuation routes, assembly points, and clinic locations.",
  floorplan:  "**Double-click any building** on the campus map to open its interactive floor plan. Zoom, pan, and click stairways or elevators to navigate between floors.",
  parking:    "Parking areas are marked on the campus map near the GYM and ADM Building. Faculty and staff parking requires a valid PLV parking pass.",
  wifi:       "PLV provides free Wi-Fi campus-wide. Connect to **PLV-Student** and log in with your student portal credentials.",
  events:     "Campus events appear as **colored star markers** on the interactive map. Click any marker to view details, venue, date, and navigation.",
  route:      "To get directions: select a building, click **Directions** in the info panel, choose your starting point, and an animated route will appear on the map.",
  default:    "I can help with campus navigation! Try asking about a building, office, or how to use the map. You can also use the map's search bar to find locations directly.",
};

function getAIResponse(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("registrar")) return AI_KB.registrar;
  if (lower.includes("cashier") || lower.includes("payment")) return AI_KB.cashier;
  if (lower.includes("library") || lower.includes("lrc") || lower.includes("reading")) return AI_KB.library;
  if (lower.includes("admission")) return AI_KB.admissions;
  if (lower.includes("gym") || lower.includes("sports")) return AI_KB.gymnasium;
  if (lower.includes("emergency") || lower.includes("fire") || lower.includes("exit")) return AI_KB.emergency;
  if (lower.includes("floor") || lower.includes("plan") || lower.includes("room")) return AI_KB.floorplan;
  if (lower.includes("parking") || lower.includes("car")) return AI_KB.parking;
  if (lower.includes("wifi") || lower.includes("wi-fi") || lower.includes("internet")) return AI_KB.wifi;
  if (lower.includes("event") || lower.includes("fair") || lower.includes("activity")) return AI_KB.events;
  if (lower.includes("direction") || lower.includes("route") || lower.includes("get to")) return AI_KB.route;
  return AI_KB.default;
}

const SUGGESTIONS = [
  "Where is the Registrar?",
  "How do I get to the Library?",
  "What events are happening?",
  "How do I use the floor plan?",
];

const GUEST_LIMIT = 5;
const GUEST_KEY = "plv-ai-daily";

function getGuestCount(): number {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    if (date !== new Date().toDateString()) return 0;
    return count as number;
  } catch { return 0; }
}
function incrementGuestCount(): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({
      date: new Date().toDateString(),
      count: getGuestCount() + 1,
    }));
  } catch {}
}

function MD({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ── AI Chat ──
function AIChatSection({ studentAuth }: { studentAuth: ReturnType<typeof useStudentAuth> }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Hi! I'm your PLV Campus Assistant. Ask me anything about buildings, navigation, offices, or campus facilities." },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [guestUsed, setGuestUsed] = useState(getGuestCount);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const isLimited = !studentAuth && guestUsed >= GUEST_LIMIT;

  const sendMessage = (text: string) => {
    if (!text.trim() || typing || isLimited) return;
    const userMsg = text.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: userMsg }]);
    setTyping(true);
    if (!studentAuth) { incrementGuestCount(); setGuestUsed(getGuestCount()); }
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { role: "ai", text: getAIResponse(userMsg) }]);
    }, 900 + Math.random() * 600);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/50">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground">PLV Campus Assistant</p>
            <p className="text-[11px] text-muted-foreground">
              {studentAuth
                ? `Unlimited access · ${studentAuth.role}`
                : `${GUEST_LIMIT - guestUsed} of ${GUEST_LIMIT} questions remaining today`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-muted-foreground hidden sm:inline">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex flex-col gap-4 p-5 overflow-y-auto scrollbar-show-on-hover" style={{ maxHeight: 400, minHeight: 260 }}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={cn("flex gap-3 items-start", m.role === "user" && "flex-row-reverse")}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                m.role === "ai" ? "bg-primary/10" : "bg-secondary"
              )}>
                {m.role === "ai"
                  ? <Sparkles className="h-4 w-4 text-primary" />
                  : <User className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div
                className={cn(
                  "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                  m.role === "ai" ? "rounded-tl-sm bg-muted" : "rounded-tr-sm bg-primary text-primary-foreground"
                )}
              >
                {m.role === "ai" ? <MD text={m.text} /> : m.text}
              </div>
            </motion.div>
          ))}

          {typing && (
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-muted flex items-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60"
                    style={{ animation: `loading-bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length === 1 && !typing && (
          <div className="flex flex-wrap gap-2 px-5 pb-4">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-border">
          {isLimited ? (
            <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-muted text-xs text-muted-foreground">
              Daily limit reached.{' '}
              <a href="/admin" className="font-bold hover:underline text-primary">Log in for unlimited access.</a>
            </div>
          ) : (
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about campus navigation, buildings, offices…"
              disabled={typing}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-input-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all disabled:opacity-50"
            />
          )}
          <motion.button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || typing || isLimited}
            className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            whileTap={{ scale: 0.95 }}
          >
            <Send className="h-4 w-4" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ── Inquiry Form ──
const CATEGORIES = [
  "Campus Navigation", "Academic Concern", "Technical Issue",
  "Building Information", "Facilities Request", "General Inquiry",
];

function InquiryForm() {
  const [form, setForm] = useState({ name: "", email: "", category: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const canSubmit = form.name && form.email && form.category && form.subject && form.message;

  if (submitted) return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-2xl mx-auto rounded-2xl border border-border bg-card flex flex-col items-center justify-center p-12 text-center shadow-sm"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-4"
      >
        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
      </motion.div>
      <h3 className="font-extrabold text-foreground text-lg mb-2">Inquiry Submitted</h3>
      <p className="text-sm text-muted-foreground mb-6">
        We received your message and will reply to <strong className="text-foreground">{form.email}</strong> within 1–2 business days.
      </p>
      <button onClick={() => { setForm({ name: "", email: "", category: "", subject: "", message: "" }); setSubmitted(false); }}
        className="text-sm font-bold text-primary hover:underline">
        Send another inquiry
      </button>
    </motion.div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-border bg-muted/30">
        <h3 className="font-extrabold text-foreground text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Send us a Message
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Questions about navigation, academic concerns, technical issues, or anything else.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="inquiry-name" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Full Name *</label>
            <input id="inquiry-name" name="name" type="text" value={form.name} onChange={e => update("name", e.target.value)}
              placeholder="Juan dela Cruz"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          </div>
          <div>
            <label htmlFor="inquiry-email" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Email *</label>
            <input id="inquiry-email" name="email" type="email" value={form.email} onChange={e => update("email", e.target.value)}
              placeholder="juan@plv.edu.ph"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          </div>
        </div>
        <div>
          <label htmlFor="inquiry-category" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Category *</label>
          <select id="inquiry-category" name="category" value={form.category} onChange={e => update("category", e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all">
            <option value="">Select a category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="inquiry-subject" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Subject *</label>            <input id="inquiry-subject" name="subject" type="text" value={form.subject} onChange={e => update("subject", e.target.value)}
              placeholder="Brief summary of your concern"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
        </div>
        <div>
          <label htmlFor="inquiry-message" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Message *</label>            <textarea id="inquiry-message" name="message" value={form.message} onChange={e => update("message", e.target.value)}
              rows={4} placeholder="Describe your concern in detail…"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none" />
        </div>
        <motion.button
          onClick={() => { if (canSubmit) setSubmitted(true); }}
          disabled={!canSubmit}
          className="w-full h-11 rounded-xl text-sm font-extrabold bg-primary text-primary-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
          whileTap={{ scale: 0.98 }}
        >
          Send Inquiry
        </motion.button>
      </div>
    </div>
  );
}

// ── FAQ ──
const FAQS = [
  { q: "How do I search for a building or office?", a: "Use the search bar in the Map page's right panel. Type the building name, code, or department (e.g. 'Registrar', 'MAB', 'Library'). Results appear instantly as a dropdown." },
  { q: "How do I get directions between two buildings?", a: "Click any building on the map to open its info panel, then press 'Directions'. Select your starting point from the dropdown — the route animates on the map with an estimated walking time." },
  { q: "What can I do without a PLV account?", a: "Guests can browse the map, search buildings, get directions, view floor plans, use Emergency Mode, view event markers on the map, and use the AI Assistant with up to 5 questions per day." },
  { q: "How do I use the floor plan?", a: "Double-click any building on the campus map to open its interactive floor plan. Pan and zoom to explore the layout. Click stairways or elevators to navigate between floors." },
  { q: "How do I report a campus issue?", a: "Log in with your PLV student account, select a building on the map, and click 'Report' in the building info panel. The location is automatically attached — just choose the issue type and add a description." },
  { q: "What is Emergency Mode?", a: "Emergency Mode (the SOS chip in the map panel) highlights emergency exits, evacuation routes, assembly points, and the campus clinic. Activate it to quickly locate the nearest exit or emergency facility." },
  { q: "How do I save a building or route?", a: "After logging in as a student, select a building and click 'Save' in the info panel. Saved locations appear in your student profile dashboard for quick access later." },
  { q: "Where can I find campus events?", a: "Campus events appear as colored star markers directly on the interactive map. Click any marker to view event details including the title, date, venue, organizer, and description." },
];

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-4 px-5 text-left gap-4 hover:bg-muted/30 transition-colors">
        <span className="text-sm font-bold text-foreground flex-1">{q}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="pb-4 px-5 text-sm text-muted-foreground leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function HelpCenterPage() {
  const studentAuth = useStudentAuth();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{
          background: "linear-gradient(135deg, #07123a 0%, #0e2a6e 40%, #0a1e5a 70%, #050e2e 100%)",
        }}>
          <LavaLampBackground />
          <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-6 pt-24 pb-40 text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/8 mb-6 shadow-lg"
          >
            <HelpCircle className="h-3.5 w-3.5 text-white/70" />
            <span className="text-[10px] font-bold text-white/75 tracking-[0.18em] uppercase">Help Center</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="font-extrabold text-gradient leading-tight mb-5"
            style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            How can we help?
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-white/65 leading-relaxed mx-auto"
            style={{ fontSize: "clamp(0.9rem, 2vw, 1.05rem)", lineHeight: 1.75, maxWidth: "38ch" }}
          >
            Ask our AI assistant, send a message, or browse the FAQ. We are here to help you navigate PLV campus.
          </motion.p>
        </div>

        {/* Wavy bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none select-none" style={{ height: 130, zIndex: 10 }}>
          <div className="absolute bottom-0 left-0 right-0" style={{ height: 4, background: "var(--background)" }} />
          <svg viewBox="0 0 1440 130" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
            <path d="M0,85 C100,52 200,105 340,72 C480,38 580,96 720,64 C860,30 980,88 1100,58 C1220,26 1340,75 1440,52 L1440,130 L0,130 Z" fill="var(--background)" />
          </svg>
        </div>
      </section>

      {/* ── Content ── */}
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-20">

        {/* 1. AI Campus Assistant */}
        <section>
          <Reveal>
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/30 text-xs font-bold uppercase tracking-widest mb-4 bg-primary/5 text-primary">
                <Sparkles className="h-3 w-3" /> AI-Powered
              </div>
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Campus Assistant</h2>
              <p className="text-sm text-muted-foreground">
                Ask anything about campus navigation, buildings, offices, and facilities.
                {!studentAuth && (
                  <span className="block mt-1">
                    Guests get {GUEST_LIMIT} free questions per day.{' '}
                    <a href="/admin" className="font-bold text-primary hover:underline">Log in for unlimited access.</a>
                  </span>
                )}
              </p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <AIChatSection studentAuth={studentAuth} />
          </Reveal>
        </section>

        <div className="h-px bg-border" />

        {/* 2. Quick Contact Cards */}
        <section>
          <Reveal>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Quick Contacts</h2>
              <p className="text-sm text-muted-foreground">Important campus offices and departments.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: MapPin, label: "Security Office", value: "Main Gate", color: "text-blue-500" },
                { icon: Phone, label: "PLV Trunk Line", value: "(02) 8293-0000", color: "text-green-500" },
                { icon: Clock, label: "Office Hours", value: "Mon–Fri, 8AM–5PM", color: "text-amber-500" },
              ].map(({ icon: ConIcon, label, value, color }) => (
                <div key={label} className="surface-card rounded-2xl p-5 text-center hover:shadow-md transition-shadow">
                  <ConIcon className={cn("h-6 w-6 mx-auto mb-2", color)} />
                  <p className="text-sm font-bold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{value}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <div className="h-px bg-border" />

        {/* 3. Contact & Inquiry */}
        <section>
          <Reveal>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Contact &amp; Inquiry</h2>
              <p className="text-sm text-muted-foreground">
                Cannot find your answer? Send a message and we will get back to you within 1–2 business days.
              </p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <InquiryForm />
          </Reveal>
        </section>

        <div className="h-px bg-border" />

        {/* 4. FAQ */}
        <section>
          <Reveal>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Frequently Asked Questions</h2>
              <p className="text-sm text-muted-foreground">Quick answers to the most common questions.</p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              {FAQS.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} defaultOpen={i === 0} />)}
            </div>
          </Reveal>
        </section>

        <div className="h-8" />
      </div>

      <Footer />
    </div>
  );
}
