import { Volume2, VolumeX } from "lucide-react";

export function ArrivalSoundToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      data-testid="arrival-sound-toggle"
      aria-label={`Arrival sound ${enabled ? "on" : "off"}. Turn ${enabled ? "off" : "on"}`}
      aria-pressed={enabled}
      title={`Arrival sound ${enabled ? "on" : "off"}`}
      onClick={() => onChange(!enabled)}
      className="flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 text-[9px] font-extrabold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-w-0 sm:justify-start"
    >
      {enabled ? <Volume2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className="hidden sm:inline">Sound {enabled ? "On" : "Off"}</span>
    </button>
  );
}
