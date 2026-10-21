import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, Download, Expand, LoaderCircle, Minimize, Pause, Play, RotateCw, Volume2, VolumeX } from "lucide-react";
import { cn } from "../../lib/utils";

interface BrandedRoomVideoPlayerProps {
  src: string;
  title: string;
  /** Native controls keep the Student player compact and consistent with the Home showcase. */
  mode?: "custom" | "native";
  poster?: string | null;
  captionsUrl?: string | null;
  downloadUrl?: string;
  downloadName?: string;
  testId?: string;
  onRetry?: () => void | boolean | Promise<void | boolean>;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const value = Math.floor(seconds);
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}

type RoomVideoFullscreenMode = "none" | "standard" | "webkit" | "expanded";

type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitSupportsFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

function prefersIOSVideoFullscreen(video: WebkitFullscreenVideo | null): boolean {
  if (!video?.webkitEnterFullscreen || video.webkitSupportsFullscreen === false) return false;
  const isIOSUserAgent = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIPadDesktopUserAgent = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOSUserAgent || isIPadDesktopUserAgent;
}

export function BrandedRoomVideoPlayer({
  src,
  title,
  mode = "custom",
  poster,
  captionsUrl,
  downloadUrl,
  downloadName,
  testId = "room-video-player",
  onRetry,
  className,
}: BrandedRoomVideoPlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const playingRef = useRef(false);
  const playRequestedRef = useRef(false);
  const previewFrameSelectedRef = useRef(false);
  const hideControlsTimerRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(() => mode === "custom");
  const [nativeActivated, setNativeActivated] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenMode, setFullscreenMode] = useState<RoomVideoFullscreenMode>("none");
  const fullscreenModeRef = useRef<RoomVideoFullscreenMode>("none");
  const fullscreenAttemptRef = useRef(0);
  const fullscreenEntryTimerRef = useRef<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [interactionTick, setInteractionTick] = useState(0);

  const updateFullscreenMode = useCallback((mode: RoomVideoFullscreenMode) => {
    fullscreenModeRef.current = mode;
    setFullscreenMode(mode);
  }, []);

  const clearFullscreenEntryTimer = useCallback(() => {
    if (fullscreenEntryTimerRef.current !== null) {
      window.clearTimeout(fullscreenEntryTimerRef.current);
      fullscreenEntryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      if (document.fullscreenElement === frameRef.current) {
        clearFullscreenEntryTimer();
        updateFullscreenMode("standard");
      } else if (fullscreenModeRef.current === "standard") {
        clearFullscreenEntryTimer();
        updateFullscreenMode("none");
      }
    };
    const onWebkitFullscreenStart = () => {
      clearFullscreenEntryTimer();
      updateFullscreenMode("webkit");
    };
    const onWebkitFullscreenEnd = () => {
      if (fullscreenModeRef.current === "webkit") {
        clearFullscreenEntryTimer();
        updateFullscreenMode("none");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const mode = fullscreenModeRef.current;
      const isInPageFullscreen = mode === "expanded" || (mode === "standard" && document.fullscreenElement !== frameRef.current);
      if (event.key !== "Escape" || !isInPageFullscreen) return;
      event.preventDefault();
      fullscreenAttemptRef.current += 1;
      clearFullscreenEntryTimer();
      updateFullscreenMode("none");
    };
    const video = videoRef.current as WebkitFullscreenVideo | null;
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("keydown", onKeyDown);
    video?.addEventListener("webkitbeginfullscreen", onWebkitFullscreenStart);
    video?.addEventListener("webkitendfullscreen", onWebkitFullscreenEnd);
    return () => {
      clearFullscreenEntryTimer();
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("keydown", onKeyDown);
      video?.removeEventListener("webkitbeginfullscreen", onWebkitFullscreenStart);
      video?.removeEventListener("webkitendfullscreen", onWebkitFullscreenEnd);
      if (document.fullscreenElement === frameRef.current) void document.exitFullscreen?.().catch(() => {});
      if (video?.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
    };
  }, [clearFullscreenEntryTimer, updateFullscreenMode]);

  useEffect(() => {
    if (hideControlsTimerRef.current !== null) window.clearTimeout(hideControlsTimerRef.current);

    if (!playing || loading || error || hovered || focusWithin) {
      setControlsVisible(true);
      return;
    }

    hideControlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2400);
    return () => {
      if (hideControlsTimerRef.current !== null) {
        window.clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = null;
      }
    };
  }, [playing, loading, error, hovered, focusWithin, interactionTick]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (hideControlsTimerRef.current !== null) window.clearTimeout(hideControlsTimerRef.current);
      // The player is also moved between the Room sidebar and an expanded
      // preview dialog. Stop media immediately when its view unmounts so closing
      // the dialog can never leave audio playing in the background.
      if (video && (playingRef.current || playRequestedRef.current || !video.paused)) video.pause();
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current?.track;
    if (!track) return;
    track.mode = captionsUrl && captionsOn ? "showing" : "disabled";
  }, [captionsOn, captionsUrl, src]);

  useEffect(() => {
    if (mode !== "native") return;
    const video = videoRef.current;
    if (video && (playingRef.current || playRequestedRef.current || !video.paused)) video.pause();
    setNativeActivated(false);
    setPreviewReady(false);
    setPlaying(false);
    setLoading(true);
    setError(null);
    playingRef.current = false;
    playRequestedRef.current = false;
    previewFrameSelectedRef.current = false;
  }, [mode, src]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setError(null);
      playRequestedRef.current = true;
      void video.play().catch(() => {
        playRequestedRef.current = false;
        setError("Playback could not start. Check your connection and try again.");
      });
    } else {
      video.pause();
    }
  }, []);

  const startNativePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setLoading(true);
    setNativeActivated(true);
    playRequestedRef.current = true;
    // Ask the browser for metadata and the first available frame only;
    // playback begins only after the student's explicit Play action.
    if (video.currentTime > 0 && previewFrameSelectedRef.current) video.currentTime = 0;
    void video.play().catch(() => {
      playRequestedRef.current = false;
      setLoading(false);
      setError("Playback could not start. Check your connection and try again.");
    });
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(duration, value));
    video.currentTime = next;
    setCurrentTime(next);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (video) video.muted = next;
  };

  const changeVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolume(next);
    setMuted(next === 0);
    if (videoRef.current) {
      videoRef.current.volume = next;
      videoRef.current.muted = next === 0;
    }
  };

  const toggleFullscreen = () => {
    const video = videoRef.current as WebkitFullscreenVideo | null;
    const frame = frameRef.current;
    const currentMode = fullscreenModeRef.current;

    if (currentMode !== "none") {
      fullscreenAttemptRef.current += 1;
      clearFullscreenEntryTimer();
      if (currentMode === "standard" && document.fullscreenElement) {
        try {
          const exit = document.exitFullscreen?.();
          if (exit) void exit.catch(() => updateFullscreenMode("expanded"));
          else updateFullscreenMode("expanded");
        } catch {
          updateFullscreenMode("expanded");
        }
        return;
      }
      if (currentMode === "webkit" && video?.webkitExitFullscreen) {
        try {
          video.webkitExitFullscreen();
          return;
        } catch {
          // Keep the in-page player available if the platform exit call fails.
        }
      }
      updateFullscreenMode("none");
      return;
    }

    // iPhone Safari exposes fullscreen on the video element; a wrapper's
    // requestFullscreen can exist while remaining unsupported for that wrapper.
    // Prefer the native video gesture on iOS and keep one media element active.
    if (video && prefersIOSVideoFullscreen(video)) {
      try {
        const attempt = ++fullscreenAttemptRef.current;
        video.webkitEnterFullscreen?.();
        updateFullscreenMode("webkit");
        clearFullscreenEntryTimer();
        fullscreenEntryTimerRef.current = window.setTimeout(() => {
          fullscreenEntryTimerRef.current = null;
          if (fullscreenAttemptRef.current === attempt && fullscreenModeRef.current === "webkit" && !video.webkitDisplayingFullscreen) {
            updateFullscreenMode("expanded");
          }
        }, 1500);
      } catch {
        updateFullscreenMode("expanded");
      }
      return;
    }

    // Call the browser API directly in the click handler so transient user
    // activation is still available. If the request is absent or rejected,
    // expand this same media element in-page instead of leaving a dead control.
    if (frame?.requestFullscreen) {
      try {
        const attempt = ++fullscreenAttemptRef.current;
        const request = frame.requestFullscreen();
        updateFullscreenMode("standard");
        clearFullscreenEntryTimer();
        fullscreenEntryTimerRef.current = window.setTimeout(() => {
          fullscreenEntryTimerRef.current = null;
          if (fullscreenAttemptRef.current === attempt && fullscreenModeRef.current === "standard" && document.fullscreenElement !== frame) {
            updateFullscreenMode("expanded");
          }
        }, 1500);
        void request.then(() => {
          clearFullscreenEntryTimer();
          if (fullscreenAttemptRef.current === attempt && document.fullscreenElement !== frame && fullscreenModeRef.current === "standard") {
            updateFullscreenMode("expanded");
          }
        }).catch(() => {
          clearFullscreenEntryTimer();
          if (fullscreenAttemptRef.current === attempt && fullscreenModeRef.current === "standard") updateFullscreenMode("expanded");
        });
      } catch {
        updateFullscreenMode("expanded");
      }
      return;
    }

    if (video?.webkitEnterFullscreen) {
      try {
        const attempt = ++fullscreenAttemptRef.current;
        video.webkitEnterFullscreen();
        updateFullscreenMode("webkit");
        clearFullscreenEntryTimer();
        fullscreenEntryTimerRef.current = window.setTimeout(() => {
          fullscreenEntryTimerRef.current = null;
          if (fullscreenAttemptRef.current === attempt && fullscreenModeRef.current === "webkit" && !video.webkitDisplayingFullscreen) {
            updateFullscreenMode("expanded");
          }
        }, 1500);
      } catch {
        clearFullscreenEntryTimer();
        updateFullscreenMode("expanded");
      }
      return;
    }

    updateFullscreenMode("expanded");
  };

  const fullscreen = fullscreenMode !== "none";
  const expandedFullscreen = fullscreenMode === "standard" || fullscreenMode === "expanded";

  const retry = async () => {
    setError(null);
    setLoading(true);
    if (onRetry) {
      try {
        const refreshed = await onRetry();
        if (refreshed === false) {
          setLoading(false);
          setError("A fresh video link could not be loaded. Please try again shortly.");
        } else videoRef.current?.load();
      } catch {
        setLoading(false);
        setError("A fresh video link could not be loaded. Please try again shortly.");
      }
    }
    else videoRef.current?.load();
  };

  const timePercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const controlsInteractive = !playing || loading || Boolean(error) || controlsVisible || hovered || focusWithin;
  const controlsEmphasized = hovered || focusWithin || (playing && controlsVisible);
  const revealControls = () => {
    setControlsVisible(true);
    setInteractionTick((tick) => tick + 1);
  };

  if (mode === "native") {
    return (
      <div
        ref={frameRef}
        role="group"
        aria-label={`${title} video player`}
        data-testid={`${testId}-frame`}
        data-no-drag
        className={cn("relative isolate aspect-video w-full overflow-hidden rounded-xl bg-[#071440] text-white shadow-sm", className)}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          controls={nativeActivated && !error}
          playsInline
          preload="metadata"
          muted={muted}
          className="absolute inset-0 h-full w-full bg-black object-contain"
          data-testid={testId}
          aria-label={title}
          onLoadStart={() => { setLoading(true); setError(null); }}
          onLoadedData={() => { setLoading(false); setPreviewReady(true); }}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
            setDuration(nextDuration);
            // A few videos begin on black. Preview one second into the file so
            // metadata-only loading can expose a representative paused frame.
            if (!nativeActivated && !previewFrameSelectedRef.current && nextDuration > 1.2) {
              previewFrameSelectedRef.current = true;
              video.currentTime = Math.min(1, nextDuration / 4);
            }
          }}
          onSeeked={() => setPreviewReady(true)}
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onWaiting={() => { if (videoRef.current && !videoRef.current.paused) setLoading(true); }}
          onCanPlay={() => setLoading(false)}
          onPlaying={() => { setLoading(false); setPlaying(true); playingRef.current = true; playRequestedRef.current = true; }}
          onPause={() => { setPlaying(false); playingRef.current = false; playRequestedRef.current = false; }}
          onEnded={() => { setPlaying(false); playingRef.current = false; playRequestedRef.current = false; }}
          onError={() => { setLoading(false); setPlaying(false); playingRef.current = false; playRequestedRef.current = false; setError("This video could not be loaded. Check your connection and retry."); }}
        >
          {captionsUrl && <track ref={trackRef} kind="captions" src={captionsUrl} srcLang="en" label="English captions" onLoad={(event) => { event.currentTarget.track.mode = captionsOn ? "showing" : "disabled"; }} />}
        </video>
        {!nativeActivated && !previewReady && !error && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(79,155,190,.38)_0%,rgba(16,28,43,.12)_50%,rgba(7,20,64,.3)_100%)]" aria-hidden="true" />}
        {loading && nativeActivated && !error && <div role="status" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/25 text-white/90"><LoaderCircle className="h-7 w-7 animate-spin motion-reduce:animate-none" aria-label="Loading video" /></div>}
        {!nativeActivated && !error && <button
          type="button"
          onClick={startNativePlayback}
          aria-label={`Play ${title}`}
          className="absolute left-1/2 top-1/2 z-10 inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-white/95 text-primary shadow-[0_8px_32px_rgba(0,0,0,.28)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200/70 active:scale-95 sm:h-[4.25rem] sm:w-[4.25rem]"
        >
          <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
        </button>}
        {error && <div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/85 px-5 text-center text-white">
          <p className="max-w-xs text-xs font-medium leading-relaxed">{error}</p>
          <button type="button" onClick={retry} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"><RotateCw className="h-3.5 w-3.5" />Try again</button>
        </div>}
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label={`${title} video player`}
      tabIndex={0}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          setHovered(true);
          revealControls();
        }
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") revealControls();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") revealControls();
        else setHovered(true);
      }}
      className={cn("isolate overflow-hidden rounded-xl border border-border/60 bg-slate-950 text-white shadow-sm", expandedFullscreen && "fixed inset-0 z-[10000] flex h-[100dvh] w-screen flex-col rounded-none border-0 bg-black", className)}
      data-testid={`${testId}-frame`}
      data-controls-visible={controlsInteractive}
    >
      <div className={cn("group relative aspect-video overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#1e3a4b_0%,#101c2b_55%,#080d16_100%)]", expandedFullscreen && "min-h-0 w-full flex-1")} style={expandedFullscreen ? { aspectRatio: "auto" } : undefined}>
        <video
          ref={videoRef}
          src={src}
          controls={false}
          playsInline
          preload="metadata"
          muted={muted}
          className="absolute inset-0 h-full w-full object-contain"
          data-testid={testId}
          aria-label={title}
          onLoadStart={() => { setLoading(true); setError(null); }}
          onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onWaiting={() => { if (videoRef.current && !videoRef.current.paused) setLoading(true); }}
          onCanPlay={() => setLoading(false)}
          onPlaying={() => { setLoading(false); setPlaying(true); playingRef.current = true; playRequestedRef.current = true; }}
          onPause={() => { setPlaying(false); playingRef.current = false; playRequestedRef.current = false; }}
          onEnded={() => { setPlaying(false); playingRef.current = false; playRequestedRef.current = false; }}
          onError={() => { setLoading(false); setPlaying(false); playingRef.current = false; playRequestedRef.current = false; setError("This video could not be loaded. Check your connection and retry."); }}
        >
          {captionsUrl && <track ref={trackRef} kind="captions" src={captionsUrl} srcLang="en" label="English captions" onLoad={(event) => { event.currentTarget.track.mode = captionsOn ? "showing" : "disabled"; }} />}
        </video>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/10" aria-hidden="true" />
        {loading && <div role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 text-white/90"><LoaderCircle className="h-7 w-7 animate-spin motion-reduce:animate-none" aria-label="Loading video" /></div>}
        {error && <div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/85 px-5 text-center">
          <p className="max-w-xs text-xs font-medium leading-relaxed text-white/90">{error}</p>
          <button type="button" onClick={retry} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"><RotateCw className="h-3.5 w-3.5" />Try again</button>
        </div>}
        <div
          data-testid={`${testId}-controls`}
          aria-label={`${title} playback controls`}
          aria-hidden={!controlsInteractive}
            style={expandedFullscreen ? {
              paddingLeft: "max(env(safe-area-inset-left), 0.5rem)",
              paddingRight: "max(env(safe-area-inset-right), 0.5rem)",
              paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
            } : undefined}
            className={cn(
            "absolute inset-x-0 bottom-0 z-[5] space-y-0.5 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-transparent px-1.5 pb-1.5 pt-5 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none sm:px-2 sm:pb-2",
            !controlsInteractive && "pointer-events-none translate-y-1 opacity-0",
            controlsInteractive && !controlsEmphasized && "opacity-[.78] hover:opacity-100",
          )}
        >
          <div className="flex items-center gap-1">
            <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-white/80">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              disabled={!duration}
              aria-label={`Seek ${title}`}
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
              onChange={(event) => seek(Number(event.currentTarget.value))}
              tabIndex={controlsInteractive ? undefined : -1}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-teal-300 disabled:cursor-default"
              style={{ background: `linear-gradient(to right, #5eead4 ${timePercent}%, rgba(255,255,255,.22) ${timePercent}%) 0 50% / 100% 3px no-repeat` }}
            />
            <span className="w-7 shrink-0 text-[9px] tabular-nums text-white/75">{formatTime(duration)}</span>
          </div>
          <div className="flex min-h-7 items-center gap-0.5">
          <button type="button" onClick={togglePlayback} tabIndex={controlsInteractive ? undefined : -1} aria-label={playing ? `Pause ${title}` : `Play ${title}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/95 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
            {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
          </button>
          <button type="button" onClick={toggleMute} tabIndex={controlsInteractive ? undefined : -1} aria-label={muted ? "Unmute room video" : "Mute room video"} aria-pressed={muted} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
            {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Room video volume" tabIndex={controlsInteractive ? undefined : -1} onChange={(event) => changeVolume(Number(event.currentTarget.value))} className="h-4 min-w-5 max-w-16 flex-1 cursor-pointer accent-teal-300" />
          {captionsUrl && <button type="button" onClick={() => setCaptionsOn((value) => !value)} tabIndex={controlsInteractive ? undefined : -1} aria-label={captionsOn ? "Turn captions off" : "Turn captions on"} aria-pressed={captionsOn} className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300", captionsOn ? "bg-teal-300 text-slate-950" : "text-white/85 hover:bg-white/15 hover:text-white")}><Captions className="h-3.5 w-3.5" /></button>}
          {downloadUrl && <a href={downloadUrl} download={downloadName} tabIndex={controlsInteractive ? undefined : -1} aria-label={`Download ${title}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"><Download className="h-3.5 w-3.5" aria-hidden="true" /></a>}
          <button type="button" onClick={toggleFullscreen} tabIndex={controlsInteractive ? undefined : -1} aria-label={fullscreen ? "Exit fullscreen" : "View room video fullscreen"} className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">{fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
