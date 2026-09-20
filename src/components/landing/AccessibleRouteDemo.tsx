import { useEffect, useState } from "react";
import { Accessibility } from "lucide-react";

/** Feet sit at the origin so the person stays on the illustrated surface. */
function Walker({ walking }: { walking: boolean }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="0" cy="-31" r="5" fill="currentColor" stroke="none" />
      <path d="M0 -23 V-12 M0 -21 L-7 -14 M0 -21 L7 -17" />
      <path d="M0 -12 L-6 0 M0 -12 L6 0">
        {walking && <animate attributeName="d" values="M0 -12 L-6 0 M0 -12 L6 0;M0 -12 L2 0 M0 -12 L-2 0;M0 -12 L6 0 M0 -12 L-6 0" dur="0.65s" repeatCount="indefinite" />}
      </path>
    </g>
  );
}

function SurfaceScene({ ramp, moving }: { ramp: boolean; moving: boolean }) {
  const surface = ramp
    ? "M24 166 H76 L226 86 H280"
    : "M24 166 H96 V150 H122 V134 H148 V118 H174 V102 H200 V86 H280";
  const travel = ramp
    ? "M40 166 H76 L226 86 H260"
    : "M40 166 H88 Q96 166 96 150 H114 Q122 150 122 134 H140 Q148 134 148 118 H166 Q174 118 174 102 H192 Q200 102 200 86 H260";
  return (
    <figure className="min-w-0 rounded-2xl border border-border bg-muted/25 p-4">
      <figcaption>
        <h4 className="text-sm font-bold text-foreground">{ramp ? "Ramp" : "Stairs"}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ramp ? "Follow the gentle slope up." : "Walk up one step at a time."}</p>
      </figcaption>
      <svg viewBox="0 0 304 214" className="mx-auto block w-full max-w-[400px]" role="img" aria-label={ramp ? "Person walking up a ramp" : "Person climbing stairs"}>
        <path d={`${surface} V184 H24 Z`} fill={ramp ? "#d1fae5" : "#dbeafe"} />
        <path d={surface} fill="none" stroke={ramp ? "#047857" : "#315ba8"} strokeWidth="4" strokeLinejoin="round" />
        {ramp && <g fill="none" stroke="#6b9e91" strokeWidth="2.5" strokeLinecap="round">
          <path d="M76 138 L226 58 M86 134 V157 M151 99 V121 M216 64 V91" />
        </g>}
        <g className={ramp ? "text-emerald-700 dark:text-emerald-400" : "text-primary"}>
          <g transform={moving ? undefined : ramp ? "translate(151 126)" : "translate(148 118)"}>
            {moving && <>
              <animateMotion path={travel} dur="7s" keyPoints="0;0;1;1" keyTimes="0;0.08;0.88;1" calcMode="linear" rotate="0" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.92;1" dur="7s" repeatCount="indefinite" />
            </>}
            <Walker walking={moving} />
          </g>
        </g>
        <g fontSize="11" className="fill-muted-foreground" fontWeight="600">
          <text x="24" y="205">Lower level</text>
          <text x="280" y="26" textAnchor="end">Upper level</text>
        </g>
      </svg>
    </figure>
  );
}

function ElevatorScene({ moving }: { moving: boolean }) {
  // All SVG timelines share one clock: enter, close doors, rise, open, exit.
  const times = "0;0.18;0.32;0.62;0.74;0.9;1";
  return (
    <figure className="min-w-0 rounded-2xl border border-border bg-muted/25 p-4">
      <figcaption>
        <h4 className="text-sm font-bold text-foreground">Elevator</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Enter, ride up, then step out.</p>
      </figcaption>
      <svg viewBox="0 0 304 214" className="mx-auto block w-full max-w-[400px]" role="img" aria-label="Person entering an elevator, riding to the upper floor, and exiting">
        <rect x="110" y="25" width="80" height="165" rx="5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
        <path d="M120 30 V184 M180 30 V184" stroke="#cbd5e1" strokeWidth="2" />
        <path d="M24 188 H110 M190 94 H280" stroke="#315ba8" strokeWidth="4" />
        <g>
          {moving && <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 0;0 -94;0 -94;0 -94;0 0" keyTimes={times} dur="10s" repeatCount="indefinite" />}
          <rect x="116" y="133" width="68" height="55" rx="2" fill="#eff6ff" stroke="#315ba8" strokeWidth="2" />
          <path d="M140 126 H160 M146 123 L150 119 L154 123" fill="none" stroke="#315ba8" strokeWidth="2" />
        </g>
        <g className="text-primary">
          <g transform={moving ? undefined : "translate(150 188)"}>
            {moving && <>
              <animateTransform attributeName="transform" type="translate" values="40 188;150 188;150 188;150 94;150 94;252 94;252 94" keyTimes={times} dur="10s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.9;0.94;1" dur="10s" repeatCount="indefinite" />
            </>}
            <Walker walking={false} />
          </g>
        </g>
        {/* Doors are in front of the passenger and travel with the cabin. */}
        {moving && <g>
          <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 0;0 -94;0 -94;0 -94;0 0" keyTimes={times} dur="10s" repeatCount="indefinite" />
          <rect x="117" y="135" width="2" height="51" fill="#93b4e2" fillOpacity="0.65">
            <animate attributeName="width" values="2;2;33;33;2;2;2" keyTimes={times} dur="10s" repeatCount="indefinite" />
          </rect>
          <rect x="181" y="135" width="2" height="51" fill="#93b4e2" fillOpacity="0.65">
            <animate attributeName="x" values="181;181;150;150;181;181;181" keyTimes={times} dur="10s" repeatCount="indefinite" />
            <animate attributeName="width" values="2;2;33;33;2;2;2" keyTimes={times} dur="10s" repeatCount="indefinite" />
          </rect>
        </g>}
        <g fontSize="11" className="fill-muted-foreground" fontWeight="600">
          <text x="24" y="208">Floor 1</text>
          <text x="280" y="70" textAnchor="end">Floor 2</text>
        </g>
      </svg>
    </figure>
  );
}

export function AccessibleRouteDemo() {
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const moving = !reducedMotion && !paused;

  return (
    <div data-testid="a11y-demo" className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <Accessibility className={`h-4 w-4 shrink-0 ${enabled ? "text-emerald-600" : "text-muted-foreground"}`} />
          <span className="text-sm font-bold text-foreground">Accessible Route</span>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Toggle accessible route" onClick={() => setEnabled(!enabled)}
          style={{ minHeight: 24, height: 24 }}
          className={`relative inline-flex h-6 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${enabled ? "bg-green-500" : "bg-muted-foreground/40"}`}>
          <span data-testid="a11y-toggle-knob" className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${enabled ? "translate-x-6" : "translate-x-0"}`} />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs font-semibold text-muted-foreground">{enabled ? "Accessible route: ramps and elevators" : "Normal route: stairs"}</p>
        {!reducedMotion && <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2" onClick={() => setPaused(!paused)}>{paused ? "Play animation" : "Pause animation"}</button>}
      </div>
      <div className={`grid gap-3 ${enabled ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {enabled ? <>
          <SurfaceScene key="ramp" ramp moving={moving} />
          <ElevatorScene moving={moving} />
        </> : <SurfaceScene key="stairs" ramp={false} moving={moving} />}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{enabled ? "Two ways to avoid stairs: use a ramp or take an elevator." : "Switch on Accessible Route to see the step-free options."}</p>
    </div>
  );
}
