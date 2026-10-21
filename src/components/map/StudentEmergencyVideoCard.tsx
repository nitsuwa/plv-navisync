import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, ChevronDown, Download, Loader2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/utils";
import { createPublishedEmergencyEvacuationVideoDownloadUrl, formatEmergencyVideoSize, getPublishedEmergencyEvacuationVideo, type PublishedEmergencyVideo } from "../../services/emergencyEvacuationVideoService";

interface StudentEmergencyVideoCardProps {
  campusId: string;
  roomId: string;
  roomName: string;
  videoId: string;
  title?: string;
  routeFingerprint: string;
  autoplayEnabled?: boolean;
  initialExpanded?: boolean;
  initialPlaybackState?: EmergencyVideoPlaybackState;
  onPlaybackStateChange?: (state: EmergencyVideoPlaybackState) => void;
}

export type EmergencyVideoPlaybackState = { currentTime: number; muted: boolean; loop: boolean };

export function StudentEmergencyVideoCard({
  campusId, roomId, roomName, videoId, title, routeFingerprint,
  autoplayEnabled = true,
  initialExpanded = false,
  initialPlaybackState,
  onPlaybackStateChange,
}: StudentEmergencyVideoCardProps) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestGenerationRef = useRef(0);
  const mediaRefreshAttemptedRef = useRef(false);
  const [guide, setGuide] = useState<PublishedEmergencyVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [muted, setMuted] = useState(initialPlaybackState?.muted ?? true);
  const [loop, setLoop] = useState(initialPlaybackState?.loop ?? true);
  const [playing, setPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [visible, setVisible] = useState(true);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  onPlaybackStateChangeRef.current = onPlaybackStateChange;
  const mutedRef = useRef(muted);
  const loopRef = useRef(loop);
  const restoreCurrentTimeRef = useRef(Math.max(0, initialPlaybackState?.currentTime ?? 0));
  mutedRef.current = muted;
  loopRef.current = loop;

  const savePlaybackState = useCallback(() => {
    const video = videoRef.current;
    onPlaybackStateChangeRef.current?.({
      currentTime: Number.isFinite(video?.currentTime) ? Math.max(0, video!.currentTime) : restoreCurrentTimeRef.current,
      muted: video?.muted ?? mutedRef.current,
      loop: video?.loop ?? loopRef.current,
    });
  }, []);

  const load = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    videoRef.current?.pause();
    setGuide(null);
    setLoading(true); setError(null);
    try {
      const next = await getPublishedEmergencyEvacuationVideo({ videoId, roomId, campusId, routeFingerprint });
      if (generation !== requestGenerationRef.current) return null;
      setGuide(next);
      if (!next) setError("This room does not have a currently published video guide.");
      return next;
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return null;
      setGuide(null);
      setError(cause instanceof Error ? cause.message : "The video guide could not be loaded.");
      return null;
    } finally { if (generation === requestGenerationRef.current) setLoading(false); }
  }, [campusId, roomId, routeFingerprint, videoId]);

  useEffect(() => {
    mediaRefreshAttemptedRef.current = false;
  }, [campusId, roomId, routeFingerprint, videoId]);

  useEffect(() => {
    void load();
    return () => {
      savePlaybackState();
      requestGenerationRef.current += 1;
      videoRef.current?.pause();
    };
  }, [load, savePlaybackState]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.12 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!video || !guide || !autoplayEnabled || !visible || reducedMotion || saveData || document.visibilityState === "hidden") {
      video?.pause();
      setPlaying(false);
      return;
    }
    video.muted = mutedRef.current;
    void video.play().then(() => {
      setPlaying(true);
      setAutoplayBlocked(false);
    }).catch(() => {
      setPlaying(false);
      setAutoplayBlocked(true);
    });
  }, [autoplayEnabled, guide?.playbackUrl, guide, reducedMotion, visible]);

  useEffect(() => {
    savePlaybackState();
  }, [expanded, loop, muted, savePlaybackState]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        videoRef.current?.pause();
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => () => { videoRef.current?.pause(); }, []);

  useEffect(() => {
    const exitFullscreenOnEscape = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (event.key !== "Escape" || !video || document.fullscreenElement !== video) return;
      event.preventDefault();
      void document.exitFullscreen?.().catch(() => {});
    };
    document.addEventListener("keydown", exitFullscreenOnEscape);
    return () => document.removeEventListener("keydown", exitFullscreenOnEscape);
  }, []);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try { await video.play(); setPlaying(true); setAutoplayBlocked(false); }
      catch { setAutoplayBlocked(true); setError("Press Play again when the browser is ready to play this video."); }
    } else {
      video.pause(); setPlaying(false);
    }
  };

  const toggleSound = async () => {
    const video = videoRef.current;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!video) return;
    video.muted = nextMuted;
    if (!nextMuted && video.paused) {
      try { await video.play(); setPlaying(true); } catch { setAutoplayBlocked(true); }
    }
  };

  const download = async () => {
    setDownloadBusy(true);
    setError(null);
    try {
      const fresh = await createPublishedEmergencyEvacuationVideoDownloadUrl({ videoId, roomId, campusId, routeFingerprint });
      if (!fresh) throw new Error("This guide is no longer published for the current approved routes.");
      const anchor = document.createElement("a");
      anchor.href = fresh.url;
      anchor.download = fresh.filename;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The video download could not be started.");
    } finally { setDownloadBusy(false); }
  };

  const handleMediaError = () => {
    setPlaying(false);
    if (!mediaRefreshAttemptedRef.current) {
      mediaRefreshAttemptedRef.current = true;
      void load();
      return;
    }
    setError("Playback stopped. The private media link may have expired; reload the guide and try again.");
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().then(() => { setPlaying(true); }).catch(() => setAutoplayBlocked(true));
  };

  return (
    <section ref={rootRef} data-testid="student-emergency-video-card" data-expanded={expanded} aria-label={`${roomName} emergency video guide`} className="w-full shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-card/95 text-foreground shadow-[0_8px_22px_rgba(15,23,42,0.14)] backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2 px-3 pt-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-primary">Emergency Video Guide</p>
          <h3 className="truncate text-[11px] font-extrabold">{guide?.title ?? title ?? `${roomName} evacuation guide`}</h3>
        </div>
        <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-label={expanded ? "Collapse emergency video guide" : "Expand emergency video guide"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden="true" /></button>
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="overflow-hidden rounded-xl bg-slate-950">
          {guide ? <video
            key={guide.id}
            ref={videoRef}
            data-testid="student-emergency-video"
            controls={expanded}
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            muted={muted}
            loop={loop}
            className={cn("aspect-video w-full object-contain transition-[max-height] duration-200 motion-reduce:transition-none", expanded ? "max-h-64" : "max-h-28")}
            onPlay={() => { setPlaying(true); setAutoplayBlocked(false); }}
            onPause={() => { setPlaying(false); savePlaybackState(); }}
            onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
            onTimeUpdate={(event) => {
              restoreCurrentTimeRef.current = Math.max(0, event.currentTarget.currentTime || 0);
              savePlaybackState();
            }}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const restoreAt = restoreCurrentTimeRef.current;
              if (restoreAt > 0 && Number.isFinite(video.duration)) {
                video.currentTime = Math.min(restoreAt, Math.max(0, video.duration - 0.05));
              }
              savePlaybackState();
            }}
            onError={handleMediaError}
          >
            <source src={guide.playbackUrl} type="video/mp4" />
            {guide.captionsUrl && <track kind="captions" src={guide.captionsUrl} srcLang="en" label="Captions" default />}
          </video> : <div className="flex aspect-video min-h-20 items-center justify-center px-3 text-center text-[10px] text-white/80">
            {loading ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading approved guide…</span> : "Approved video unavailable"}
          </div>}
        </div>

        {guide && <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {!expanded && <>
            <button type="button" onClick={() => void togglePlayback()} aria-label={playing ? "Pause video guide" : "Play video guide"} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-[9px] font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}{playing ? "Pause" : "Play"}</button>
            <button type="button" onClick={() => void toggleSound()} aria-pressed={!muted} aria-label={muted ? "Enable video voiceover" : "Mute video voiceover"} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted">{muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}</button>
          </>}
          {expanded && <>
            <button type="button" onClick={replay} aria-label="Replay video guide" className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setLoop((current) => !current)} aria-pressed={loop} aria-label={loop ? "Turn video loop off" : "Turn video loop on"} className={cn("min-h-10 rounded-lg border px-2.5 text-[9px] font-bold", loop ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground")}>Loop</button>
            <button type="button" onClick={() => void download()} disabled={loading || downloadBusy} className="ml-auto flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[9px] font-bold text-foreground hover:bg-muted disabled:opacity-60"><Download className="h-3.5 w-3.5" />{downloadBusy ? "Preparing…" : "Download"}</button>
          </>}
          {!expanded && <button type="button" onClick={() => setExpanded(true)} aria-label="Show video guide controls" className="ml-auto min-h-10 rounded-lg border border-border px-2.5 text-[9px] font-bold text-foreground">More controls</button>}
        </div>}

        {expanded && guide && <div className="mt-2 flex items-center justify-between gap-2 text-[8px] text-muted-foreground"><span className="truncate">{guide.original_filename}</span><span className="shrink-0">{formatEmergencyVideoSize(guide.file_size_bytes)}</span>{guide.captionsUrl && <span className="inline-flex shrink-0 items-center gap-1"><Captions className="h-3 w-3" />Captions</span>}</div>}
        {expanded && (error || autoplayBlocked) && <p role="status" className="mt-2 text-[9px] leading-relaxed text-muted-foreground">{error ?? "Muted autoplay was blocked. Press Play to start the guide."}</p>}
        {expanded && guide && error && <button type="button" onClick={() => { mediaRefreshAttemptedRef.current = false; void load(); }} disabled={loading} className="mt-2 min-h-9 rounded-lg border border-border px-3 text-[9px] font-bold text-primary disabled:opacity-60">{loading ? "Refreshing guide…" : "Reload guide"}</button>}
        {expanded && guide && <p className="mt-2 text-[8px] leading-relaxed text-muted-foreground">Follow posted instructions and campus personnel.</p>}
        {!guide && <div className="mt-2 flex items-center justify-between gap-2 text-[8px] text-muted-foreground"><span>{loading ? "Checking publication…" : "Guide unavailable"}</span>{!loading && <button type="button" onClick={() => void load()} aria-label="Retry loading evacuation video" className="font-bold text-primary">Retry</button>}</div>}
      </div>
    </section>
  );
}
