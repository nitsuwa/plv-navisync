import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Building2, Layers3, Map, MapPin, Play, RotateCcw, Route } from "lucide-react";
import { PLVLogo } from "../ui/PLVLogo";
import { HOME_SHOWCASE_MEDIA, type HomeShowcaseMediaConfig } from "../../lib/homeShowcaseMedia";

function ShowcaseArtwork({ posterUrl, videoAvailable }: { posterUrl?: string | null; videoAvailable: boolean }) {
  return (
    <div
      className="home-showcase-art absolute inset-0 overflow-hidden bg-[#071440]"
      role="img"
      aria-label={videoAvailable ? "PLV NaviSync showcase video preview" : "Illustrated PLV NaviSync campus map showcase, coming soon"}
    >
      {posterUrl && <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_42%,rgba(57,123,238,.30),transparent_48%),radial-gradient(ellipse_at_18%_92%,rgba(200,150,12,.16),transparent_42%),linear-gradient(135deg,#081842,#07112d_68%,#030a1d)]" />
      <svg className="absolute inset-0 h-full w-full opacity-80" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="showcase-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="rgba(190,214,255,.09)" strokeWidth="1" />
          </pattern>
          <linearGradient id="showcase-route" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#61dcff" />
            <stop offset="1" stopColor="#e6b943" />
          </linearGradient>
          <filter id="showcase-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="800" height="450" fill="url(#showcase-grid)" />
        <g fill="rgba(212,226,255,.055)" stroke="rgba(204,222,255,.16)" strokeWidth="1.5">
          <path d="M80 126 204 88l47 29-8 81-133 12-39-35z" />
          <path d="m298 84 125-25 53 40-12 89-132 12-47-37z" />
          <path d="m536 112 135-31 46 38-6 78-135 24-51-36z" />
          <path d="m116 259 137-27 47 41-10 83-135 25-48-38z" />
          <path d="m363 244 131-27 47 38-10 91-133 25-45-39z" />
          <path d="m600 260 88-19 34 27-6 74-89 20-36-29z" />
        </g>
        <g fill="none" stroke="rgba(113,163,222,.25)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
          <path d="M122 184 204 238 309 205 388 249 478 206 551 233 652 170" />
          <path d="M204 238 219 319 353 348 431 306 551 329" />
        </g>
        <path d="M127 181 204 238 309 205 388 249 478 206 551 233 652 170" fill="none" stroke="url(#showcase-route)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="9 10" />
        <g filter="url(#showcase-soft-glow)">
          <circle cx="127" cy="181" r="9" fill="#61dcff" stroke="#e8faff" strokeWidth="3" />
          <path d="M652 151c-12 0-21 9-21 21 0 16 21 39 21 39s21-23 21-39c0-12-9-21-21-21Z" fill="#e6b943" stroke="#fff2bd" strokeWidth="2" />
          <circle cx="652" cy="172" r="6" fill="#071440" />
        </g>
      </svg>

      <div className="absolute left-4 top-4 flex items-center gap-2.5 sm:left-6 sm:top-6">
        <PLVLogo size={34} className="shadow-lg" />
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.17em] text-white sm:text-[10px]">PLV NaviSync</p>
          <p className="mt-0.5 text-[8px] font-medium tracking-wide text-blue-100/65 sm:text-[9px]">Smart campus navigator</p>
        </div>
      </div>
      <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/30 px-2.5 py-1.5 text-[8px] font-bold tracking-wide text-white/80 backdrop-blur sm:right-6 sm:top-6 sm:px-3 sm:text-[9px]">
        <Layers3 className="h-3 w-3 text-cyan-200" aria-hidden="true" /> CAMPUS, CONNECTED
      </div>

      <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-end justify-between gap-4 sm:bottom-6 sm:left-6 sm:max-w-[calc(100%-3rem)]">
        <div>
          <p className="text-[8px] font-extrabold uppercase tracking-[.2em] text-cyan-100/65 sm:text-[9px]">PLV NaviSync Showcase</p>
          <p className="mt-1 text-lg font-extrabold tracking-tight text-white sm:text-2xl">Your campus, in view.</p>
          <p className="mt-1 text-[10px] font-semibold text-white/60 sm:text-xs">{videoAvailable ? "Press play to watch" : "Coming soon"}</p>
        </div>
        <div className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-white/[.08] px-3 py-2 text-[9px] font-semibold text-white/70 backdrop-blur sm:flex">
          <MapPin className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" /> Explore with confidence
        </div>
      </div>
      <div className="absolute bottom-[28%] left-[24%] hidden h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-[#0b1d45]/90 text-cyan-100 shadow-xl backdrop-blur sm:flex">
        <Building2 className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="absolute right-[17%] top-[39%] hidden h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#0b1d45]/90 text-amber-200 shadow-xl backdrop-blur sm:flex">
        <Route className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
    </div>
  );
}

function HomeShowcasePlayer({ media }: { media: HomeShowcaseMediaConfig }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const playbackAttemptRef = useRef(0);

  const clearLoadingTimer = () => {
    if (loadingTimerRef.current !== null) {
      window.clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      playbackAttemptRef.current += 1;
      clearLoadingTimer();
      video?.pause();
    };
  }, [media.videoUrl, retry]);

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

  const startPlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = ++playbackAttemptRef.current;
    setEnded(false);
    setFailed(false);
    setStarting(true);
    clearLoadingTimer();
    loadingTimerRef.current = window.setTimeout(() => {
      if (attempt !== playbackAttemptRef.current) return;
      playbackAttemptRef.current += 1;
      loadingTimerRef.current = null;
      video.pause();
      setPlaying(false);
      setStarting(false);
      setFailed(true);
    }, 15000);
    try {
      await video.play();
      if (attempt === playbackAttemptRef.current && video.readyState >= 2) {
        clearLoadingTimer();
        setPlaying(true);
        setStarting(false);
      }
    } catch {
      if (attempt === playbackAttemptRef.current) {
        clearLoadingTimer();
        setPlaying(false);
        setStarting(false);
        setFailed(true);
      }
    }
  };

  const replay = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    await startPlayback();
  };

  const retryPlayback = () => {
    playbackAttemptRef.current += 1;
    clearLoadingTimer();
    setFailed(false);
    setHasFrame(false);
    setEnded(false);
    setPlaying(false);
    setStarting(false);
    setRetry((value) => value + 1);
  };

  return (
    <div
      className="relative isolate aspect-video w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#071440] shadow-[0_24px_70px_rgba(7,20,64,.22)] ring-1 ring-black/5 dark:ring-white/10 sm:rounded-[1.75rem]"
      data-testid="home-showcase-player"
    >
      <ShowcaseArtwork posterUrl={media.posterUrl} videoAvailable={Boolean(media.videoUrl)} />
      {media.videoUrl && <video
          key={`${media.videoUrl}-${retry}`}
          ref={videoRef}
          data-testid="home-showcase-video"
          aria-label="PLV NaviSync showcase video"
          className={`home-showcase-video absolute inset-0 h-full w-full bg-black object-contain transition-opacity duration-200 motion-reduce:transition-none ${hasFrame && !failed ? "opacity-100" : "opacity-0"}`}
          src={media.videoUrl}
          poster={media.posterUrl ?? undefined}
          controls={hasFrame && !failed}
          autoPlay={false}
          muted={false}
          loop={false}
          playsInline
          preload="none"
          onLoadedData={() => { clearLoadingTimer(); setHasFrame(true); setStarting(false); }}
          onPlay={() => { clearLoadingTimer(); setPlaying(true); setStarting(false); setFailed(false); setEnded(false); }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setEnded(true); }}
          onError={() => { clearLoadingTimer(); setPlaying(false); setStarting(false); setFailed(true); }}
        >
          {media.captions && <track kind="captions" src={media.captions.url} srcLang={media.captions.language} label={media.captions.label} />}
        </video>}

      {media.videoUrl && starting && !failed && <span role="status" className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur">
        Loading video…
      </span>}
      {media.videoUrl && !failed && !playing && !starting && <button
        type="button"
        onClick={() => void (ended ? replay() : startPlayback())}
        aria-label={ended ? "Replay PLV NaviSync showcase video" : "Play PLV NaviSync showcase video"}
        className="absolute left-1/2 top-1/2 z-10 inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-white/95 text-primary shadow-[0_8px_32px_rgba(0,0,0,.28)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200/70 active:scale-95 sm:h-[4.25rem] sm:w-[4.25rem]"
      >
        {ended ? <RotateCcw className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />}
      </button>}

      {failed && <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/80 px-5 text-center text-white backdrop-blur-sm">
        <p className="text-sm font-extrabold">Video unavailable</p>
        <p className="text-xs text-white/70">Please try again in a moment.</p>
        <button type="button" onClick={retryPlayback} className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-bold text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </button>
      </div>}
    </div>
  );
}

export function HomeShowcaseSection({ media = HOME_SHOWCASE_MEDIA }: { media?: HomeShowcaseMediaConfig }) {
  return (
    <section
      id="landing-showcase"
      data-testid="landing-showcase"
      aria-labelledby="landing-showcase-heading"
      className="relative scroll-mt-8 overflow-hidden bg-background py-14 sm:py-16 lg:py-24"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-32 top-8 h-72 w-72 rounded-full bg-primary/[.045] blur-3xl" />
        <div className="absolute -bottom-36 left-[28%] h-72 w-72 rounded-full bg-accent/[.06] blur-3xl" />
      </div>
      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-7 px-5 sm:px-7 md:gap-9 lg:grid-cols-[minmax(240px,.78fr)_minmax(0,1.22fr)] lg:gap-12">
        <div className="min-w-0">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[.05] px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.16em] text-primary sm:mb-5 sm:text-[10px]">
            <Map className="h-3.5 w-3.5" aria-hidden="true" /> PLV NaviSync · Platform preview
          </div>
          <h2 id="landing-showcase-heading" className="max-w-xl text-3xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-[2.7rem]">
            See PLV NaviSync <span className="text-primary">in Action</span>
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:text-base">
            Discover an easier way to explore and navigate the PLV campus.
          </p>
          <Link
            to="/map"
            className="group mt-6 hidden min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:inline-flex"
          >
            Explore Campus Map <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </Link>
        </div>
        <HomeShowcasePlayer media={media} />
        <Link
          to="/map"
          className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
        >
          Explore Campus Map <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
