import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "motion/react";
import {
  Send, ChevronDown, CheckCircle2, Bot, User, Sparkles, HelpCircle, Mail, Phone, MapPin, Clock, ArrowRight,
  Search, Building2, GraduationCap, CreditCard, BookOpen, HeartHandshake, Stethoscope, Shield, Monitor,
  Map, Navigation, ChevronRight, Plus, X, MessageCircle, Loader2, Upload, ExternalLink, AlertCircle,
} from "lucide-react";
import { LavaLampBackground } from "../components/ui/HeroBackground";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useStudentAuth } from "../hooks/useStudentAuth";
import { Footer } from "../components/layout/Footer";
import { cn } from "../lib/utils";

// ═════════════════════════════════════════════════════════════════════════════
// ── Scroll-reveal wrapper ───────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// ── Section label component ─────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-extrabold uppercase tracking-widest mb-4">
      <Sparkles className="h-3 w-3" />
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Hero floating elements ──────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function HeroFloatingElements() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Soft radial glow */}
      <div className="absolute animate-glow-soft" style={{ top: "20%", right: "15%", width: 300, height: 300, background: "radial-gradient(circle, rgba(59,110,240,0.12) 0%, transparent 60%)", filter: "blur(60px)" }} />
      <div className="absolute animate-glow-soft" style={{ bottom: "10%", left: "10%", width: 250, height: 250, background: "radial-gradient(circle, rgba(200,150,12,0.08) 0%, transparent 60%)", filter: "blur(50px)", animationDelay: "2s" }} />

      {/* Floating map pins */}
      <div className="absolute animate-ag-1" style={{ top: "22%", right: "18%", opacity: 0.15 }}>
        <MapPin className="w-5 h-5 text-white" />
      </div>
      <div className="absolute animate-ag-3" style={{ top: "55%", left: "8%", opacity: 0.1 }}>
        <MapPin className="w-4 h-4 text-white" />
      </div>
      <div className="absolute animate-ag-5" style={{ bottom: "25%", right: "25%", opacity: 0.12 }}>
        <Navigation className="w-5 h-5 text-white" />
      </div>

      {/* Floating route dots */}
      <div className="absolute" style={{ top: "35%", left: "20%", opacity: 0.08 }}>
        <svg width="120" height="60" viewBox="0 0 120 60">
          <path d="M0 30 Q30 10 60 30 T120 30" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="3 6" />
          <circle cx="30" cy="22" r="2" fill="rgba(200,150,12,0.4)" className="animate-pulse-ring-soft" />
          <circle cx="60" cy="30" r="2" fill="rgba(59,110,240,0.4)" className="animate-pulse-ring-soft" style={{ animationDelay: "1s" }} />
          <circle cx="90" cy="38" r="2" fill="rgba(56,189,248,0.3)" className="animate-pulse-ring-soft" style={{ animationDelay: "2s" }} />
        </svg>
      </div>

      {/* Floating particles */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white/15"
          style={{
            left: `${(i * 22 + 7) % 90}%`,
            bottom: "-5%",
            width: 1.5 + (i % 3),
            height: 1.5 + (i % 3),
            animation: `particle-float ${12 + i * 2}s linear ${i * 2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── AI knowledge base (unchanged, works well) ───────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// ── AI Chat Section — premium ───────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const AI_STATS = [
  { label: "Available", value: "24/7", icon: Clock },
  { label: "Avg. Response", value: "~1 sec", icon: Loader2 },
  { label: "Knowledge Base", value: "11 topics", icon: BookOpen },
];

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  time: Date;
}

function ChatBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isAI = message.role === "ai";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      className={cn("flex gap-3 items-start group", isAI ? "" : "flex-row-reverse")}
    >
      {/* Avatar */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16, delay: 0.1 }}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ring-2 ring-background",
          isAI ? "bg-gradient-to-br from-primary to-primary/80" : "bg-gradient-to-br from-secondary to-secondary/80"
        )}
      >
        {isAI
          ? <Sparkles className="h-4 w-4 text-primary-foreground" />
          : <User className="h-4 w-4 text-muted-foreground" />}
      </motion.div>

      {/* Bubble */}
      <div className={cn("flex flex-col max-w-[80%] min-w-0", isAI ? "items-start" : "items-end")}>
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm transition-shadow duration-200",
            isAI
              ? "rounded-tl-sm bg-gradient-to-br from-muted to-muted/80 border border-border/50 group-hover:shadow-md"
              : "rounded-tr-sm bg-gradient-to-br from-primary to-primary/90 text-primary-foreground group-hover:shadow-md"
          )}
        >
          {isAI ? <MD text={message.text} /> : message.text}
        </div>
        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground/50 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
          {format(message.time, "h:mm a")}
        </span>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3 items-start"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shrink-0 mt-0.5 ring-2 ring-background"
      >
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </motion.div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gradient-to-br from-muted to-muted/80 border border-border/50 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/60"
              style={{ animation: `loading-bounce 0.8s ease-in-out ${i * 0.18}s infinite` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function AIChatSection({ studentAuth }: { studentAuth: ReturnType<typeof useStudentAuth> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "ai", text: "Hi! I'm your PLV Campus Assistant. Ask me anything about buildings, navigation, offices, or campus facilities.", time: new Date() },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [guestUsed, setGuestUsed] = useState(getGuestCount);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // Don't count a signed-in student as a guest while the session resolves.
  const isLimited = !studentAuth.isStudent && !studentAuth.loading && guestUsed >= GUEST_LIMIT;

  const sendMessage = (text: string) => {
    if (!text.trim() || typing || isLimited) return;
    const userMsg = text.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: userMsg, time: new Date() }]);
    setTyping(true);
    if (!studentAuth.isStudent && !studentAuth.loading) { incrementGuestCount(); setGuestUsed(getGuestCount()); }
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { role: "ai", text: getAIResponse(userMsg), time: new Date() }]);
    }, 800 + Math.random() * 500);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {AI_STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-card border border-border/60 shadow-sm hover:shadow-md hover:border-primary/15 transition-all duration-200"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 text-primary flex items-center justify-center shrink-0 hover:scale-110 transition-transform duration-200">
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wide">{stat.label}</p>
              <p className="text-xs font-bold text-foreground">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chat card */}
      <div className="rounded-2xl border border-border/80 bg-card shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden">
        {/* Header */}
        <div className="relative flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-primary/[0.03] to-transparent">
          {/* AI Avatar with glow */}
          <div className="relative shrink-0">
            <div className="absolute inset-0 w-10 h-10 rounded-xl bg-primary/20 animate-pulse-ring-soft" />
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-foreground">PLV Campus Assistant</p>
            <p className="text-[11px] text-muted-foreground">
              {studentAuth.isStudent
                ? `Unlimited access · ${studentAuth.role}`
                : `${GUEST_LIMIT - guestUsed} of ${GUEST_LIMIT} questions remaining today`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-50" />
              <span className="relative rounded-full w-2 h-2 bg-green-500" />
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground hidden sm:inline">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex flex-col gap-4 p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40"
          style={{ maxHeight: 400, minHeight: 300 }}
        >
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} index={i} />
          ))}

          {typing && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions — shown after first AI message, hidden after first user message */}
        {messages.length <= 1 && !typing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap gap-2 px-5 pb-4"
          >
            {SUGGESTIONS.map((s, i) => (
              <motion.button
                key={s}
                onClick={() => sendMessage(s)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.25 }}
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.96 }}
                className="text-xs font-semibold px-3.5 py-2 rounded-full border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/25 hover:bg-primary/5 hover:shadow-sm transition-all duration-200 flex items-center gap-1.5 group"
              >
                <Sparkles className="h-3 w-3 opacity-0 -ml-1 group-hover:opacity-100 transition-all duration-200" />
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* Input area */}
        <div className="px-5 pb-5 pt-2 border-t border-border bg-gradient-to-b from-muted/10 to-muted/20">
          {isLimited ? (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-muted text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
              Daily limit reached.{' '}
              <a href="/admin" className="font-bold hover:underline text-primary">Log in for unlimited access.</a>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1 relative group">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={typing ? "PLV Assistant is typing…" : "Ask about campus navigation, buildings, offices…"}
                  disabled={typing}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-input-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {/* Character count */}
                {input.length > 0 && (
                  <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40 tabular-nums pointer-events-none">
                    {input.length}
                  </span>
                )}
                {/* Send button with hover lift */}
                <motion.button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || typing || isLimited}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 hover:shadow-md"
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <Send className="h-3.5 w-3.5" />
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── POPULAR CAMPUS SERVICES — replaces Quick Contacts ───────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const SERVICES = [
  {
    icon: Building2, name: "Registrar", desc: "Enrollment, transcripts, and student records",
    hours: "Mon–Fri, 8AM–5PM", building: "ADM Building (b2) • Ground Floor",
    mapTo: "/map?b=adm", color: "text-blue-500",
  },
  {
    icon: GraduationCap, name: "Admissions", desc: "Applications, walk-ins, and inquiries",
    hours: "Mon–Fri, 8AM–5PM", building: "ADM Building (b2) • Ground Floor",
    mapTo: "/map?b=adm", color: "text-indigo-500",
  },
  {
    icon: CreditCard, name: "Cashier", desc: "Tuition and fee payments",
    hours: "Mon–Fri, 8AM–4:30PM", building: "ADM Building (b2) • Near Lobby",
    mapTo: "/map?b=adm", color: "text-emerald-500",
  },
  {
    icon: BookOpen, name: "Library (LRC)", desc: "Reading rooms, computers, media section",
    hours: "Mon–Sat, 7:30AM–6PM", building: "LRC Building (b3)",
    mapTo: "/map?b=lrc", color: "text-amber-500",
  },
  {
    icon: HeartHandshake, name: "Guidance Office", desc: "Counseling, career advice, and support",
    hours: "Mon–Fri, 8AM–5PM", building: "ADM Building (b2)",
    mapTo: "/map?b=adm", color: "text-rose-500",
  },
  {
    icon: Stethoscope, name: "Clinic", desc: "First aid, medical check-ups, emergencies",
    hours: "Mon–Fri, 7:30AM–5PM", building: "ADM Building (b2)",
    mapTo: "/map?b=adm", color: "text-red-500",
  },
  {
    icon: Shield, name: "Security Office", desc: "Campus safety, lost & found, emergency",
    hours: "24/7", building: "Main Gate",
    mapTo: "/map", color: "text-slate-500",
  },
  {
    icon: Monitor, name: "IT Support", desc: "Wi-Fi, portal access, and tech assistance",
    hours: "Mon–Fri, 8AM–5PM", building: "ADM Building (b2)",
    mapTo: "/map?b=adm", color: "text-cyan-500",
  },
];

function CampusServices() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {SERVICES.map((svc, i) => (
        <Reveal key={svc.name} delay={i * 40}>
          <motion.div
            whileHover={{ y: -3 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="group rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/15 transition-all duration-200 h-full flex flex-col"
          >
            {/* Icon */}
            <div className={cn("w-10 h-10 rounded-xl bg-primary/[0.07] flex items-center justify-center mb-3.5 group-hover:scale-110 transition-transform duration-200", svc.color)}>
              <svc.icon className="h-5 w-5" />
            </div>

            {/* Name & desc */}
            <h3 className="text-sm font-extrabold text-foreground mb-1">{svc.name}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3 flex-1">{svc.desc}</p>

            {/* Hours */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{svc.hours}</span>
            </div>

            {/* Building */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-3.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{svc.building}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border/50">
              <a
                href={svc.mapTo}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors group/btn"
              >
                <Map className="h-3 w-3" />
                Open in Map
                <ChevronRight className="h-3 w-3 transition-transform group-hover/btn:translate-x-0.5" />
              </a>
              <a
                href="mailto:info@plv.edu.ph"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors ml-auto group/contact"
              >
                <ExternalLink className="h-3 w-3 transition-transform group-hover/contact:translate-x-0.5 group-hover/contact:-translate-y-0.5" />
                Contact
              </a>
            </div>
          </motion.div>
        </Reveal>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Inquiry Form — consistent floating labels, custom select, file upload ────
// ═════════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
  "Campus Navigation", "Academic Concern", "Technical Issue",
  "Building Information", "Facilities Request", "General Inquiry",
];

const INPUT_BASE = "peer w-full px-4 pt-5 pb-1.5 rounded-xl border bg-input-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/30 transition-all duration-200";

function FloatingInput({ id, label, value, onChange, placeholder, type = "text", required = false, error }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; required?: boolean; error?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        required={required}
        className={cn(
          INPUT_BASE,
          error
            ? "border-destructive/60 focus:border-destructive focus:ring-destructive/20 text-foreground"
            : focused
              ? "border-primary/40"
              : "border-border"
        )}
        aria-required={required}
        aria-invalid={Boolean(error)}
      />
      <label
        htmlFor={id}
        className={cn(
          "absolute left-4 top-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-200 pointer-events-none select-none",
          error ? "text-destructive" : focused ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {error && (
        <p className="text-[11px] text-destructive font-semibold mt-1 px-1 flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
          {error}
        </p>
      )}
    </div>
  );
}

function FloatingTextarea({ id, label, value, onChange, placeholder, required = false }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        required={required}
        rows={4}
        className={cn(INPUT_BASE, "resize-y min-h-[44px]", focused ? "border-primary/40" : "border-border")}
        aria-required={required}
      />
      <label
        htmlFor={id}
        className={cn(
          "absolute left-4 top-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-200 pointer-events-none select-none",
          "text-muted-foreground",
          focused && "text-primary",
        )}
      >
        {label} {required && <span className="text-destructive">*</span>}
      </label>
    </div>
  );
}

function FloatingSelect({ id, label, value, onChange, options, placeholder, required = false }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasValue = value.length > 0;
  const isFloating = focused || hasValue || open;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        aria-label={!hasValue ? label : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); }
        }}
        className={cn(
          INPUT_BASE, "flex items-center justify-between text-left",
          open || hasValue ? "border-primary/40" : "border-border",
        )}
      >
        <span className={hasValue ? "text-foreground" : "text-transparent select-none"}>
          {hasValue ? value : placeholder}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>

      <label
        htmlFor={id}
        className={cn(
          "absolute left-4 transition-all duration-200 pointer-events-none select-none",
          "text-muted-foreground",
          isFloating
            ? "top-1.5 text-[10px] font-bold uppercase tracking-wide"
            : "top-1/2 -translate-y-1/2 text-sm",
          focused && "text-primary",
        )}
      >
        {label} {required && <span className="text-destructive">*</span>}
      </label>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden"
            role="listbox"
            aria-label={label}
          >
            {options.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); setFocused(true); }}
                role="option"
                aria-selected={value === c}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm transition-colors",
                  value === c
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {c}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InquiryForm() {
  const [form, setForm] = useState({ name: "", email: "", category: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const emailError = form.email.length > 0 && !validEmail
    ? "Please enter a valid email address (e.g. name@gmail.com or name@plv.edu.ph)"
    : undefined;
  const canSubmit = form.name.trim() && form.email.trim() && validEmail && form.category && form.subject.trim() && form.message.trim();

  const handleSubmit = () => {
    if (canSubmit) setSubmitted(true);
  };

  if (submitted) return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-2xl mx-auto rounded-2xl border border-border bg-card flex flex-col items-center justify-center p-8 sm:p-12 text-center shadow-sm"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-4"
      >
        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="font-extrabold text-foreground text-lg mb-2">Inquiry Submitted</h3>
        <p className="text-sm text-muted-foreground mb-2">
          We received your message and will reply to <strong className="text-foreground">{form.email}</strong> within 1–2 business days.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-6">
          <Clock className="h-3 w-3" />
          Typical response time: 1–2 business days
        </div>          <button onClick={() => { setForm({ name: "", email: "", category: "", subject: "", message: "" }); setSubmitted(false); setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
          className="text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-2 py-1">
          Send another inquiry
        </button>
      </motion.div>
    </motion.div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      {/* Header */}
      <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-border bg-gradient-to-r from-primary/[0.02] to-transparent">
        <h3 className="font-extrabold text-foreground text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary shrink-0" /> Send us a Message
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Questions about navigation, academic concerns, technical issues, or anything else.
        </p>
      </div>

      {/* Form */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Name + Email grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          <FloatingInput id="inq-name" label="Full Name" value={form.name} onChange={v => update("name", v)} placeholder="Juan dela Cruz" required />
          <FloatingInput id="inq-email" label="Email" value={form.email} onChange={v => update("email", v)} placeholder="juan@plv.edu.ph" type="email" required error={emailError} />
        </div>

        {/* Category */}
        <FloatingSelect id="inq-category" label="Category" value={form.category} onChange={v => update("category", v)} options={CATEGORIES} placeholder="Select a category…" required />

        {/* Subject */}
        <FloatingInput id="inq-subject" label="Subject" value={form.subject} onChange={v => update("subject", v)} placeholder="Brief summary of your concern" required />

        {/* Message */}
        <div>
          <FloatingTextarea id="inq-message" label="Message" value={form.message} onChange={v => update("message", v)} placeholder="Describe your concern in detail…" required />
          <div className="flex items-center justify-end mt-1">
            <span className="text-[10px] text-muted-foreground tabular-nums" aria-label={`${form.message.length} of 1000 characters`}>{form.message.length}/1000</span>
          </div>
        </div>

        {/* File upload */}
        {fileError && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-[11px] font-semibold">
            {fileError}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border bg-input-background/50 hover:bg-input-background hover:border-primary/30 transition-all duration-200 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/30 text-left"
          aria-label="Attach a file"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/8 text-primary flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <Upload className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            {attachment ? (
              <>
                <p className="text-xs font-bold text-foreground truncate">{attachment.name}</p>
                <p className="text-[10px] text-muted-foreground">{(attachment.size / 1024).toFixed(0)} KB — <button type="button" onClick={(e) => { e.stopPropagation(); setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-destructive hover:underline">Remove</button></p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-foreground">Attach a file (optional)</p>
                <p className="text-[10px] text-muted-foreground">Screenshot, PDF, or image — max 5MB</p>
              </>
            )}
          </div>
          <span className="text-[10px] font-bold text-primary group-hover:underline shrink-0 whitespace-nowrap">{attachment ? 'Change' : 'Browse'}</span>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.pdf"
            aria-label="Choose file to attach"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 5 * 1024 * 1024) {
                  setFileError("Maximum file size is 5MB. Please choose a smaller file.");
                  setTimeout(() => setFileError(null), 3500);
                  e.target.value = '';
                  return;
                }
                setAttachment(file);
              }
            }}
          />
        </button>

        {/* Response time estimate */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-primary/5 border border-primary/10">
          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            Estimated response time: <strong className="text-foreground">1–2 business days</strong>
          </span>
        </div>

        {/* Submit */}
        <motion.button
          type="submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="relative w-full h-12 rounded-xl text-sm font-extrabold bg-primary text-primary-foreground transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed overflow-hidden group hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          whileTap={{ scale: canSubmit ? 0.98 : 1 }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            <Send className="h-4 w-4" />
            Send Inquiry
          </span>
          {canSubmit && (
            <motion.span
              className="absolute inset-0 bg-white/10"
              initial={{ x: "-100%" }}
              whileHover={{ x: "100%" }}
              transition={{ duration: 0.4 }}
            />
          )}
        </motion.button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── FAQ — custom accordion with search filtering ────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

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

function FaqSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative max-w-md mx-auto mb-8">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search frequently asked questions…"
        className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/30 transition-all"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center hover:bg-muted-foreground/30 transition-colors"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

/** FaqAccordion — each item in the FAQ list */
interface FaqAccordionProps {
  q: string;
  a: string;
  defaultOpen?: boolean;
  index: number;
  isFocused: boolean;
  onFocus: (index: number) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}

function FaqAccordion({ q, a, defaultOpen = false, index, isFocused, onFocus, buttonRef }: FaqAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.div
      className={cn(
        "rounded-2xl border transition-all duration-200",
        open
          ? "border-primary/25 bg-card shadow-md"
          : "border-border bg-card/50 hover:border-border/80 hover:shadow-sm",
      )}
      whileHover={{ y: open ? 0 : -1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <button
        ref={buttonRef}
        onClick={() => setOpen(v => !v)}
        onFocus={() => onFocus(index)}
        tabIndex={isFocused ? 0 : -1}
        id={`faq-trigger-${index}`}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:rounded-2xl"
        aria-expanded={open}
        aria-controls={`faq-answer-${index}`}
      >
        <span className={cn(
          "text-sm font-bold flex-1 leading-snug transition-colors",
          open ? "text-foreground" : "text-foreground/85",
        )}>
          {q}
        </span>
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200",
          open ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}>
          <motion.div
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <Plus className="h-3.5 w-3.5" />
          </motion.div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
            id={`faq-answer-${index}`}
            role="region"
            aria-labelledby={`faq-trigger-${index}`}
          >
            <div className="px-5 pb-4 pt-0">
              <div className="h-px bg-border/50 mb-3" />
              <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** AccordionGroup — wraps FAQ items with keyboard navigation */
function AccordionGroup({ items }: { items: { q: string; a: string }[] }) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Clamp focusedIndex when items shrink (e.g. search filtering)
  useEffect(() => {
    if (focusedIndex >= items.length) {
      setFocusedIndex(0);
    }
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset button refs when items change (e.g. search filtering)
  buttonRefs.current = buttonRefs.current.slice(0, items.length);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    let newIndex = focusedIndex;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        newIndex = Math.min(focusedIndex + 1, items.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        newIndex = Math.max(focusedIndex - 1, 0);
        break;
      case "Home":
        e.preventDefault();
        newIndex = 0;
        break;
      case "End":
        e.preventDefault();
        newIndex = items.length - 1;
        break;
      default:
        return;
    }
    if (newIndex !== focusedIndex) {
      setFocusedIndex(newIndex);
      buttonRefs.current[newIndex]?.focus();
    }
  }, [focusedIndex, items.length]);

  const setButtonRef = (index: number) => (el: HTMLButtonElement | null) => {
    buttonRefs.current[index] = el;
  };

  return (
    <div
      role="list"
      aria-label="Frequently asked questions"
      onKeyDown={handleKeyDown}
      className="space-y-3"
    >
      {items.map((f, i) => (
        <Reveal key={i} delay={i * 30}>
          <FaqAccordion
            q={f.q}
            a={f.a}
            index={i}
            isFocused={i === focusedIndex}
            onFocus={setFocusedIndex}
            buttonRef={setButtonRef(i)}
            defaultOpen={i === 0}
          />
        </Reveal>
      ))}
    </div>
  );
}

function EmptyFAQ({ onClear }: { onClear: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      {/* Friendly illustration */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/8 to-primary/3 flex items-center justify-center">
          <Search className="h-8 w-8 text-primary/40" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center animate-bounce" style={{ animationDuration: "2s" }}>
          <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
        </div>
      </div>
      <p className="text-base font-extrabold text-foreground mb-1.5">No matching questions found</p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-5">
        Hmm, we couldn&apos;t find anything for that search. Try a different keyword or browse all questions.
      </p>
      <button
        onClick={onClear}
        className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
      >
        <ArrowRight className="h-3 w-3" />
        Browse all questions
      </button>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── FINAL CTA ───────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function FinalCTA() {
  return (
    <section className="py-20 lg:py-24 relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/50 mx-5 sm:mx-7 max-w-5xl lg:mx-auto">
      {/* Subtle glow */}
      <div className="absolute pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/8 rounded-full blur-[80px] animate-glow-soft" />

      <Reveal className="relative text-center px-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-3 leading-tight">
          Still need help?
        </h2>
        <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
          Can&apos;t find what you&apos;re looking for? Choose one of the options below.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="#ai-assistant"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm hover:bg-primary/90 transition-all shadow-md"
          >
            <Bot className="h-4 w-4" /> Chat with AI
          </motion.a>
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="#contact-form"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-secondary text-secondary-foreground font-bold text-sm hover:bg-secondary/80 transition-all shadow-sm"
          >
            <Mail className="h-4 w-4" /> Contact Support
          </motion.a>
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="/map"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl border border-border text-foreground font-bold text-sm hover:bg-muted transition-all"
          >
            <Map className="h-4 w-4" /> Open Campus Map
          </motion.a>
        </div>
      </Reveal>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ── MAIN ────────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

export function HelpCenterPage() {
  const studentAuth = useStudentAuth();
  const { scrollY } = useScroll();
  const smoothY = useSpring(scrollY, { stiffness: 60, damping: 35, mass: 0.6 });
  const heroBgY = useTransform(smoothY, [0, 600], [0, 60]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  // ── FAQ search state ──
  const [faqSearch, setFaqSearch] = useState("");
  const filteredFAQs = useMemo(() => {
    if (!faqSearch.trim()) return FAQS;
    const q = faqSearch.toLowerCase();
    return FAQS.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [faqSearch]);

  return (
    <div className="min-h-screen bg-background">
      {/* ════════════════════════════════ HERO ══ */}
      <section className="relative overflow-hidden">
        <motion.div className="absolute inset-0" style={{ y: heroBgY, background: "linear-gradient(135deg, #07123a 0%, #0e2a6e 40%, #0a1e5a 70%, #050e2e 100%)" }}>
          <LavaLampBackground />
          <div className="absolute inset-0 bg-grid-pattern opacity-30" />
          <HeroFloatingElements />
        </motion.div>

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

      {/* ════════════════════════════════ CONTENT ══ */}
      <div className="max-w-6xl mx-auto px-6 py-16 space-y-24">

        {/* 1. AI Campus Assistant */}
        <section id="ai-assistant">
          <Reveal>
            <div className="text-center mb-8">
              <SectionLabel>AI-Powered</SectionLabel>
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Campus Assistant</h2>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                Ask anything about campus navigation, buildings, offices, and facilities.
                {!studentAuth.isStudent && (
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

        {/* 2. Popular Campus Services */}
        <section>
          <Reveal>
            <div className="text-center mb-8">
              <SectionLabel>Services</SectionLabel>
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Popular Campus Services</h2>
              <p className="text-sm text-muted-foreground">
                Important campus offices and departments — find them fast on the map.
              </p>
            </div>
          </Reveal>
          <CampusServices />
        </section>

        {/* 3. Contact & Inquiry */}
        <section id="contact-form">
          <Reveal>
            <div className="text-center mb-8">
              <SectionLabel>Contact</SectionLabel>
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Send us a Message</h2>
              <p className="text-sm text-muted-foreground">
                Cannot find your answer? Send a message and we will get back to you within 1–2 business days.
              </p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <InquiryForm />
          </Reveal>
        </section>

        {/* 4. FAQ with Search */}
        <section>
          <Reveal>
            <div className="text-center mb-8">
              <SectionLabel>FAQ</SectionLabel>
              <h2 className="text-2xl font-extrabold text-foreground mb-2">Frequently Asked Questions</h2>
              <p className="text-sm text-muted-foreground">Quick answers to the most common questions.</p>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <FaqSearch value={faqSearch} onChange={setFaqSearch} />
          </Reveal>
          <div className="max-w-2xl mx-auto">
            {filteredFAQs.length > 0 ? (
              <AccordionGroup items={filteredFAQs} />
            ) : (
              <EmptyFAQ onClear={() => setFaqSearch("")} />
            )}
          </div>
        </section>

        {/* 5. Final CTA */}
        <Reveal>
          <FinalCTA />
        </Reveal>
      </div>

      <Footer />
    </div>
  );
}
