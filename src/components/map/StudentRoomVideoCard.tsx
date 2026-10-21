import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, FileVideo2 } from "lucide-react";
import { getPublishedRoomVideosForRoom, type PublishedRoomVideo } from "../../services/emergencyEvacuationVideoService";
import { cn } from "../../lib/utils";
import { BrandedRoomVideoPlayer } from "./BrandedRoomVideoPlayer";

// Signed Room Video URLs last 15 minutes. Briefly reuse settled availability
// and in-flight lookups so quick room switches do not repeat the RPC or reuse
// a URL near expiry.
const ROOM_VIDEO_AVAILABILITY_CACHE_MS = 2 * 60 * 1000;
const roomVideoAvailabilityCache = new Map<string, { videos: PublishedRoomVideo[]; expiresAt: number }>();
const roomVideoAvailabilityRequests = new Map<string, Promise<PublishedRoomVideo[]>>();

function roomVideoCacheKey(campusId: string, roomId: string) {
  return `${campusId}\u0000${roomId}`;
}

async function getCachedPublishedVideos(campusId: string, roomId: string, force: boolean) {
  const key = roomVideoCacheKey(campusId, roomId);
  const cached = roomVideoAvailabilityCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.videos;
  if (!force && cached) roomVideoAvailabilityCache.delete(key);
  if (force) roomVideoAvailabilityCache.delete(key);

  const pending = roomVideoAvailabilityRequests.get(key);
  if (pending) return pending;

  const request = getPublishedRoomVideosForRoom({ campusId, roomId });
  roomVideoAvailabilityRequests.set(key, request);
  try {
    const videos = await request;
    roomVideoAvailabilityCache.set(key, { videos, expiresAt: Date.now() + ROOM_VIDEO_AVAILABILITY_CACHE_MS });
    return videos;
  } finally {
    if (roomVideoAvailabilityRequests.get(key) === request) roomVideoAvailabilityRequests.delete(key);
  }
}

interface StudentRoomVideoCardProps {
  campusId: string;
  roomId: string;
  roomName: string;
  onExpandedChange?: (expanded: boolean) => void;
  onVideoAvailabilityChange?: (available: boolean) => void;
  className?: string;
}

export function StudentRoomVideoCard({
  campusId,
  roomId,
  roomName,
  onExpandedChange,
  onVideoAvailabilityChange,
  className,
}: StudentRoomVideoCardProps) {
  const lookupKey = roomVideoCacheKey(campusId, roomId);
  const [availability, setAvailability] = useState<{
    key: string;
    videos: PublishedRoomVideo[];
    settled: boolean;
    error: boolean;
  }>(() => ({ key: lookupKey, videos: [], settled: false, error: false }));
  const [showMore, setShowMore] = useState(false);
  const generationRef = useRef(0);
  const currentAvailability = availability.key === lookupKey ? availability : null;
  const videos = currentAvailability?.videos ?? [];
  const settled = currentAvailability?.settled ?? false;
  const error = currentAvailability?.error ?? false;

  const load = useCallback(async (force = false): Promise<boolean> => {
    const generation = ++generationRef.current;
    setAvailability((current) => ({
      key: lookupKey,
      videos: current.key === lookupKey ? current.videos : [],
      settled: false,
      error: false,
    }));
    try {
      const rows = await getCachedPublishedVideos(campusId, roomId, force);
      if (generation === generationRef.current) {
        setAvailability({
          key: lookupKey,
          videos: [...rows].sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at)),
          settled: true,
          error: false,
        });
      }
      return generation === generationRef.current;
    } catch {
      if (generation === generationRef.current) {
        setAvailability((current) => ({
          key: lookupKey,
          videos: current.key === lookupKey ? current.videos : [],
          settled: true,
          error: true,
        }));
      }
      return false;
    }
  }, [campusId, lookupKey, roomId]);

  useEffect(() => {
    setShowMore(false);
    void load();
    return () => { generationRef.current += 1; };
  }, [load]);

  useEffect(() => {
    const invalidateWhenForegrounded = () => {
      if (document.visibilityState === "visible") roomVideoAvailabilityCache.clear();
    };
    document.addEventListener("visibilitychange", invalidateWhenForegrounded);
    window.addEventListener("focus", invalidateWhenForegrounded);
    return () => {
      document.removeEventListener("visibilitychange", invalidateWhenForegrounded);
      window.removeEventListener("focus", invalidateWhenForegrounded);
    };
  }, []);

  useEffect(() => {
    if (!settled) return;
    const available = videos.length > 0;
    onExpandedChange?.(available);
    onVideoAvailabilityChange?.(available);
  }, [settled, videos.length, onExpandedChange, onVideoAvailabilityChange]);

  // Keep ordinary Room Details usable while availability resolves. The player
  // itself is only mounted after a published video is confirmed.
  if (!settled && videos.length === 0) return null;
  if (videos.length === 0 && !error) return null;

  const primary = videos[0];
  const otherVideos = videos.slice(1);

  if (!primary) return <div className={cn("flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-card/90 px-3 py-2.5 text-muted-foreground", className)} data-testid="student-room-video-unavailable">
    <FileVideo2 className="h-4 w-4 shrink-0" />
    <span role="status" className="min-w-0 flex-1 text-[11px]">Room video is temporarily unavailable.</span>
    <button type="button" onClick={() => void load(true)} className="min-h-9 shrink-0 rounded-lg px-2 text-[11px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Retry</button>
  </div>;

  return <section data-testid="student-room-videos" aria-label={`${roomName} room videos`} className={cn("shrink-0 space-y-2 rounded-xl bg-card/95 text-foreground", className)}>
    <div className="flex min-w-0 items-center gap-2 px-0.5">
      <FileVideo2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[10px] font-extrabold uppercase tracking-[.12em] text-primary">Room Video</span>
      <span className="max-w-[65%] truncate text-right text-[10px] font-semibold text-muted-foreground" title={primary.title}>{primary.title}</span>
    </div>

    <BrandedRoomVideoPlayer
      key={primary.id}
      mode="native"
      src={primary.playbackUrl}
      title={primary.title}
      captionsUrl={primary.captionsUrl}
      testId={`student-room-video-${primary.id}`}
      onRetry={() => load(true)}
    />

    {otherVideos.length > 0 && <div className="border-t border-border/50 pt-1">
      <button type="button" onClick={() => setShowMore((value) => !value)} aria-expanded={showMore} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <span>More room videos <span className="text-muted-foreground/75">({otherVideos.length})</span></span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${showMore ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {showMore && <div className="space-y-3 pt-1">
        {otherVideos.map((video) => <div key={video.id} className="space-y-1.5 border-t border-border/40 pt-2">
          <p className="truncate px-0.5 text-[10px] font-semibold" title={video.title}>{video.title}</p>
          <BrandedRoomVideoPlayer
            mode="native"
            src={video.playbackUrl}
            title={video.title}
            captionsUrl={video.captionsUrl}
            testId={`student-room-video-${video.id}`}
            onRetry={() => load(true)}
          />
        </div>)}
      </div>}
    </div>}
  </section>;
}
