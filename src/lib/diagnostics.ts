import packageInfo from "../../package.json";
import { isAdminRole } from "./roles";

export type DiagnosticSeverity = "info" | "warning" | "error";
export type DiagnosticCategory = "runtime" | "navigation" | "camera-recovery" | "renderer" | "map-data";

export interface DiagnosticEvent {
  timestamp: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  summary: string;
  source?: string;
}

export interface MapDiagnosticContext {
  mapMode: "2D" | "3D" | "unknown";
  navigationState: string;
  cameraMode: string;
  cameraRecovery: "idle" | "pending" | "failed" | "unknown";
  campus: string | null;
  selectedBuilding: string | null;
  floor: number | null;
  route: { start: string; destination: string; type: string; currentStep: number | null; stepCount: number | null } | null;
  routeStatus: "none" | "preview" | "active" | "paused" | "arrived";
  mapDataStatus: "loading" | "ready" | "unavailable";
  context: "outdoor" | "indoor";
  outdoorTransparency: "enabled" | "disabled";
}

export interface DiagnosticReport {
  title: "PLV NAVISYNC BUG REPORT";
  capturedAt: string;
  application: { name: "PLV NaviSync"; version: string; buildMode: string };
  environment: { browser: string; device: "mobile" | "tablet" | "desktop"; viewport: string };
  page: string;
  context: MapDiagnosticContext | null;
  renderer: { expected: boolean; mounted: boolean; webgl: "ready" | "context-lost" | "unavailable" | "not-applicable" | "unknown" };
  recentEvents: DiagnosticEvent[];
  issue: string | null;
}

const MAX_EVENTS = 30;
const events: DiagnosticEvent[] = [];
const subscribers = new Set<() => void>();
let mapContext: MapDiagnosticContext | null = null;

export function sanitizeDiagnosticText(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "Unavailable";
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:access|refresh|id)?[_ -]?token\s*[:=]\s*[^\s,;]+/gi, "token=[REDACTED]")
    .replace(/\b(?:password|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, "credential=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[token redacted]")
    .replace(/https?:\/\/\S+/gi, "[URL redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function recordDiagnosticEvent(input: {
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  summary: string;
  source?: string;
  timestamp?: string;
}): void {
  events.push({
    timestamp: input.timestamp ?? new Date().toISOString(),
    category: input.category,
    severity: input.severity,
    summary: sanitizeDiagnosticText(input.summary),
    ...(input.source ? { source: sanitizeDiagnosticText(input.source, 60) } : {}),
  });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  subscribers.forEach((subscriber) => subscriber());
}

export function getRecentDiagnosticEvents(): DiagnosticEvent[] {
  return events.map((event) => ({ ...event }));
}

export function subscribeDiagnosticEvents(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function setMapDiagnosticContext(context: MapDiagnosticContext | null): void {
  mapContext = context;
}

export function getMapDiagnosticContext(): MapDiagnosticContext | null {
  return mapContext ? { ...mapContext, route: mapContext.route ? { ...mapContext.route } : null } : null;
}

export function isDiagnosticsAuthorized(input: {
  status: string;
  hasSession: boolean;
  profile: { role?: unknown; is_active?: boolean } | null;
}): boolean {
  return input.status === "authenticated"
    && input.hasSession
    && input.profile?.is_active === true
    && isAdminRole(input.profile.role);
}

function browserCategory(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return "Safari";
  return "Other / unknown";
}

export function createDiagnosticReport(input: {
  capturedAt?: string;
  pathname: string;
  userAgent: string;
  width: number;
  height: number;
  context: MapDiagnosticContext | null;
  events: readonly DiagnosticEvent[];
  rendererMounted: boolean;
  webgl: DiagnosticReport["renderer"]["webgl"];
  issue?: string;
}): DiagnosticReport {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const width = Math.max(0, Math.round(input.width));
  const height = Math.max(0, Math.round(input.height));
  const rendererExpected = input.context?.mapMode === "3D";
  const device = width < 600 ? "mobile" : width < 1024 ? "tablet" : "desktop";
  const context = input.context ? {
    mapMode: input.context.mapMode,
    navigationState: sanitizeDiagnosticText(input.context.navigationState, 40),
    cameraMode: sanitizeDiagnosticText(input.context.cameraMode, 40),
    cameraRecovery: input.context.cameraRecovery,
    campus: input.context.campus ? sanitizeDiagnosticText(input.context.campus, 100) : null,
    selectedBuilding: input.context.selectedBuilding ? sanitizeDiagnosticText(input.context.selectedBuilding, 100) : null,
    floor: Number.isFinite(input.context.floor) ? input.context.floor : null,
    route: input.context.route ? {
      start: sanitizeDiagnosticText(input.context.route.start, 80),
      destination: sanitizeDiagnosticText(input.context.route.destination, 80),
      type: sanitizeDiagnosticText(input.context.route.type, 30),
      currentStep: Number.isFinite(input.context.route.currentStep) ? input.context.route.currentStep : null,
      stepCount: Number.isFinite(input.context.route.stepCount) ? input.context.route.stepCount : null,
    } : null,
    routeStatus: input.context.routeStatus,
    mapDataStatus: input.context.mapDataStatus,
    context: input.context.context,
    outdoorTransparency: input.context.outdoorTransparency,
  } satisfies MapDiagnosticContext : null;
  return {
    title: "PLV NAVISYNC BUG REPORT",
    capturedAt,
    application: { name: "PLV NaviSync", version: packageInfo.version, buildMode: import.meta.env.MODE || "unknown" },
    environment: { browser: browserCategory(input.userAgent), device, viewport: `${width}x${height}` },
    page: sanitizeDiagnosticText(input.pathname.split(/[?#]/, 1)[0] || "/", 120),
    context,
    renderer: {
      expected: rendererExpected,
      mounted: input.rendererMounted,
      webgl: rendererExpected ? input.webgl : "not-applicable",
    },
    recentEvents: input.events.slice(-MAX_EVENTS).map((event) => ({
      timestamp: event.timestamp,
      category: event.category,
      severity: event.severity,
      summary: sanitizeDiagnosticText(event.summary),
      ...(event.source ? { source: sanitizeDiagnosticText(event.source, 60) } : {}),
    })),
    issue: input.issue ? sanitizeDiagnosticText(input.issue, 500) : null,
  };
}

export function formatDiagnosticSummary(report: DiagnosticReport): string {
  const context = report.context;
  const route = context?.route;
  const recent = report.recentEvents.length
    ? report.recentEvents.map((event) => `- ${event.timestamp} [${event.severity}] ${event.category}: ${event.summary}`).join("\n")
    : "- No recent diagnostic errors or warnings were captured.";
  return [
    report.title,
    `Captured: ${report.capturedAt}`,
    `Application: ${report.application.name} ${report.application.version} (${report.application.buildMode})`,
    `Issue: ${report.issue ?? "Not provided"}`,
    `Page: ${report.page}`,
    `Environment: ${report.environment.browser} / ${report.environment.device} / ${report.environment.viewport}`,
    `Map mode: ${context?.mapMode ?? "Not available"}`,
    `Navigation: ${context ? `${context.navigationState} (${context.cameraMode})` : "Not available"}`,
    `Route: ${route ? `${route.start} → ${route.destination} (${route.type})` : "Not available"}`,
    `Route progress: ${route ? `${route.currentStep ?? "unknown"}/${route.stepCount ?? "unknown"}` : "Not available"}`,
    `Campus/building/floor: ${context ? [context.campus, context.selectedBuilding, context.floor === null ? null : `Floor ${context.floor}`].filter(Boolean).join(" / ") || "Not selected" : "Not available"}`,
    `Camera recovery: ${context?.cameraRecovery ?? "Not available"}`,
    `Renderer: ${report.renderer.expected ? `${report.renderer.mounted ? "mounted" : "not mounted"}, WebGL ${report.renderer.webgl}` : "not expected"}`,
    `Map data: ${context?.mapDataStatus ?? "Not available"}`,
    `Outdoor transparency: ${context?.outdoorTransparency ?? "Not available"}`,
    "Recent events:",
    recent,
  ].join("\n");
}

export function diagnosticReportFilename(timestamp: string): string {
  const date = new Date(timestamp);
  const day = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  return `PLV-NaviSync-Diagnostics-${day}.json`;
}

export const OPEN_DIAGNOSTICS_EVENT = "plv:diagnostics:open";
export function requestOpenDiagnostics(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_DIAGNOSTICS_EVENT));
}

export function clearDiagnosticEventsForTests(): void {
  events.length = 0;
  mapContext = null;
  subscribers.clear();
}
