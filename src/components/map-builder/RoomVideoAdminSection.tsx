import { useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Expand, FileVideo2, Loader2, MoreHorizontal, Pencil, Play, Plus, Trash2, Upload, X } from "lucide-react";
import type { FloorRoom } from "./types";
import {
  createAdminRoomVideoPreviewUrl,
  deleteAdminRoomVideo,
  formatEmergencyVideoSize,
  getRoomVideoBackendReadiness,
  getAdminRoomVideosForRoom,
  publishRoomVideo,
  roomVideoBackendStatusMessage,
  RoomVideoServiceError,
  unpublishRoomVideo,
  updateAdminRoomVideoTitle,
  uploadRoomVideoCaptions,
  uploadRoomVideoDraft,
  type RoomVideoBackendStatus,
  type RoomVideoRow,
} from "../../services/emergencyEvacuationVideoService";
import { cn } from "../../lib/utils";
import { BrandedRoomVideoPlayer } from "../map/BrandedRoomVideoPlayer";

function roomVideoSetupStatusForFailure(cause: unknown): RoomVideoBackendStatus | null {
  if (!(cause instanceof RoomVideoServiceError)) return null;
  switch (cause.kind) {
    case "missing_table":
    case "missing_bucket":
    case "not_configured":
    case "unauthenticated":
    case "no_access":
      return cause.kind;
    // A failed Storage transfer, network request, validation, or an otherwise
    // unsuccessful operation does not prove that the feature is unconfigured.
    // Keep the loaded list and controls available so the Admin can retry.
    default:
      return null;
  }
}

function roomVideoStatusForReadinessFailure(cause: unknown): RoomVideoBackendStatus {
  const status = roomVideoSetupStatusForFailure(cause);
  return status ?? "unavailable";
}

function statusTitle(status: RoomVideoBackendStatus): string {
  switch (status) {
    case "missing_table":
    case "missing_bucket":
    case "not_configured": return "Video setup required";
    case "unauthenticated": return "Admin sign-in required";
    case "no_access": return "Admin access required";
    default: return "Videos unavailable";
  }
}

function fileTitle(file: File): string {
  return file.name.replace(/\.mp4$/i, "").slice(0, 120) || "Room Video";
}

export function RoomVideoAdminSection({
  campusId,
  buildingId,
  floorId,
  room,
}: {
  campusId: string;
  buildingId: string;
  floorId: string;
  room: FloorRoom;
}) {
  const [expanded, setExpanded] = useState(false);
  const [videos, setVideos] = useState<RoomVideoRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<RoomVideoBackendStatus>("checking");
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const expandedPreviewTriggerRef = useRef<HTMLButtonElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const captionTargetRef = useRef<string | null>(null);

  const refresh = async () => {
    setBackendStatus("checking");
    try {
      const status = await getRoomVideoBackendReadiness();
      setBackendStatus(status);
      if (status !== "ready") {
        setVideos([]);
        setError(null);
        return;
      }
      const rows = await getAdminRoomVideosForRoom(room.id);
      setVideos(rows);
      setTitles(Object.fromEntries(rows.map((row) => [row.id, row.title])));
      setError(null);
    } catch (cause) {
      setBackendStatus(roomVideoStatusForReadinessFailure(cause));
      setError(cause instanceof Error ? cause.message : "Room videos could not be loaded.");
    }
  };

  useEffect(() => {
    setVideos([]);
    setPreviewUrls({});
    setPendingFile(null);
    setError(null);
    void refresh();
  // Refresh when the selected room identity changes. The callback intentionally
  // uses the current room id rather than creating a second media state owner.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  const selectUpload = (file: File | undefined, replacingId?: string) => {
    if (!file || backendStatus !== "ready") return;
    setPendingFile(file);
    setTitle(replacingId ? videos.find((video) => video.id === replacingId)?.title ?? fileTitle(file) : fileTitle(file));
    setError(null);
  };

  const handleUpload = async () => {
    if (!pendingFile || busy || backendStatus !== "ready") return;
    const replacingId = replaceTargetRef.current;
    setBusy(replacingId ? `replace:${replacingId}` : "upload");
    setProgress(0);
    setError(null);
    try {
      const row = await uploadRoomVideoDraft({
        campusId,
        buildingId,
        floorId,
        roomId: room.id,
        file: pendingFile,
        title,
        onProgress: setProgress,
      });
      setPendingFile(null);
      replaceTargetRef.current = null;
      setTitle("");
      setPreviewUrls((current) => {
        const next = { ...current };
        if (replacingId) delete next[replacingId];
        return next;
      });
      setVideos((current) => [row, ...current]);
      setTitles((current) => ({ ...current, [row.id]: row.title }));

      if (replacingId) {
        try {
          await deleteAdminRoomVideo(replacingId);
        } catch (cause) {
          await refresh();
          setError(`The new draft was saved, but the previous video could not be fully removed. ${cause instanceof Error ? cause.message : "Retry removal from its video row."}`);
          return;
        }
      }
      await refresh();
    } catch (cause) {
      const setupStatus = roomVideoSetupStatusForFailure(cause);
      if (setupStatus) setBackendStatus(setupStatus);
      setError(cause instanceof Error ? cause.message : "The room video could not be saved.");
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const runAction = async (videoId: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(videoId);
    setError(null);
    try {
      await action();
      setEditingTitleId(null);
      await refresh();
    } catch (cause) {
      const setupStatus = roomVideoSetupStatusForFailure(cause);
      if (setupStatus) {
        setBackendStatus(setupStatus);
      } else if (backendStatus === "ready") {
        // Some operations have a deliberate partial-success boundary. For
        // example, deleting archives the row before removing Storage objects.
        // Reload metadata after a failure so the UI reflects that safe state.
        try {
          const rows = await getAdminRoomVideosForRoom(room.id);
          setVideos(rows);
          setTitles(Object.fromEntries(rows.map((row) => [row.id, row.title])));
        } catch {
          // Preserve the operation's actionable error and the last known rows.
        }
      }
      setError(cause instanceof Error ? cause.message : "The room video could not be updated.");
    } finally {
      setBusy(null);
    }
  };

  const togglePreview = async (videoId: string) => {
    if (previewUrls[videoId]) {
      setPreviewUrls((current) => { const next = { ...current }; delete next[videoId]; return next; });
      return;
    }
    setBusy(`preview:${videoId}`);
    setError(null);
    try {
      const url = await createAdminRoomVideoPreviewUrl(videoId);
      setPreviewUrls((current) => ({ ...current, [videoId]: url }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The room video preview could not be opened.");
    } finally {
      setBusy(null);
    }
  };

  const expandPreview = async (videoId: string, trigger: HTMLButtonElement) => {
    expandedPreviewTriggerRef.current = trigger;
    if (previewUrls[videoId]) {
      setExpandedPreviewId(videoId);
      return;
    }
    setBusy(`preview:${videoId}`);
    setError(null);
    try {
      const url = await createAdminRoomVideoPreviewUrl(videoId);
      setPreviewUrls((current) => ({ ...current, [videoId]: url }));
      setExpandedPreviewId(videoId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The room video preview could not be opened.");
    } finally {
      setBusy(null);
    }
  };

  const refreshPreview = async (videoId: string): Promise<boolean> => {
    setBusy(`preview:${videoId}`);
    setError(null);
    try {
      const url = await createAdminRoomVideoPreviewUrl(videoId);
      setPreviewUrls((current) => ({ ...current, [videoId]: url }));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The room video preview could not be refreshed.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const uploadCaptions = async (videoId: string, file: File | undefined) => {
    if (!file) return;
    await runAction(videoId, async () => {
      await uploadRoomVideoCaptions(videoId, file);
      setPreviewUrls((current) => { const next = { ...current }; delete next[videoId]; return next; });
    });
  };

  const setupMessage = error ?? roomVideoBackendStatusMessage(backendStatus);
  const activeVideos = videos.filter((video) => video.status !== "archived");
  // Keep existing published playback primary while a replacement draft is
  // reviewed. Older versions stay available without crowding the normal flow.
  const currentVideo = activeVideos.find((video) => video.status === "published") ?? activeVideos[0] ?? null;
  const historyVideos = videos.filter((video) => video.id !== currentVideo?.id);
  const expandedPreviewVideo = videos.find((video) => video.id === expandedPreviewId);
  const deleteTarget = videos.find((video) => video.id === deleteVideoId);

  const renderVideoCard = (video: RoomVideoRow, primary: boolean) => {
    const archived = video.status === "archived";
    const editing = editingTitleId === video.id;
    return <article key={video.id} className={cn(
      "space-y-2 rounded-xl border bg-card p-2.5",
      primary ? "border-primary/20 shadow-sm" : "border-border",
    )} data-testid={`room-video-row-${video.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing
            ? <div className="flex items-center gap-1.5">
              <input value={titles[video.id] ?? video.title} maxLength={120}
                onChange={(event) => setTitles((current) => ({ ...current, [video.id]: event.target.value }))}
                aria-label={`Room video title ${video.title}`}
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[10px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <button type="button" title="Save title" aria-label={`Save title for ${video.title}`} disabled={Boolean(busy)}
                onClick={() => void runAction(video.id, () => updateAdminRoomVideoTitle(video.id, titles[video.id] ?? video.title))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-primary disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
              <button type="button" title="Cancel title edit" aria-label={`Cancel title edit for ${video.title}`} onClick={() => { setTitles((current) => ({ ...current, [video.id]: video.title })); setEditingTitleId(null); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
            : <><p className="truncate text-[11px] font-bold text-foreground" title={video.title}>{video.title}</p>
              {primary && <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[.12em] text-primary">Current room video</p>}</>}
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-1 text-[8px] font-bold", video.status === "published" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : archived ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
          {video.status === "published" ? "Published" : archived ? "Archived" : "Draft"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[8px] text-muted-foreground">
        <span className="truncate" title={video.original_filename}>{video.original_filename}</span><span className="shrink-0">{formatEmergencyVideoSize(video.file_size_bytes)}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5" aria-label={`${video.title} actions`}>
        <button type="button" onClick={() => void togglePreview(video.id)} disabled={Boolean(busy)}
          className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-primary/25 bg-primary/5 px-2 text-[9px] font-bold text-primary disabled:opacity-50">
          {busy === `preview:${video.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : previewUrls[video.id] ? <X className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          <span className="truncate">{previewUrls[video.id] ? "Hide preview" : "Preview"}</span>
        </button>
        <button type="button" aria-label="Expand Preview" title="Expand Preview" onClick={(event) => void expandPreview(video.id, event.currentTarget)} disabled={Boolean(busy)}
          className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-border px-1.5 text-[9px] font-bold text-foreground disabled:opacity-50 sm:px-2">
          {busy === `preview:${video.id}` ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Expand className="h-3 w-3 shrink-0" />}<span className="truncate">Expand</span>
        </button>
        {video.status === "published"
          ? <button type="button" disabled={Boolean(busy)} onClick={() => void runAction(video.id, () => unpublishRoomVideo(video.id))} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-[9px] font-bold text-foreground disabled:opacity-50">Unpublish</button>
          : <button type="button" disabled={Boolean(busy) || archived} onClick={() => void runAction(video.id, () => publishRoomVideo(video.id))} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-primary px-2 text-[9px] font-bold text-primary-foreground shadow-sm disabled:opacity-50">Publish</button>}
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" disabled={Boolean(busy)} aria-label={`More actions for ${video.title}`} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-[9px] font-bold text-foreground hover:bg-muted disabled:opacity-50"><MoreHorizontal className="h-3.5 w-3.5" />More</button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-[130] min-w-40 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
              <DropdownMenu.Item onSelect={() => setEditingTitleId(video.id)} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[10px] font-medium outline-none focus:bg-muted"><Pencil className="h-3.5 w-3.5" />Edit title</DropdownMenu.Item>
              {primary && <DropdownMenu.Item onSelect={() => { replaceTargetRef.current = video.id; replaceInputRef.current?.click(); }} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[10px] font-medium outline-none focus:bg-muted"><Upload className="h-3.5 w-3.5" />Replace video</DropdownMenu.Item>}
              <DropdownMenu.Item onSelect={() => { captionTargetRef.current = video.id; captionInputRef.current?.click(); }} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[10px] font-medium outline-none focus:bg-muted"><FileVideo2 className="h-3.5 w-3.5" />Captions</DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item onSelect={() => setDeleteVideoId(video.id)} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[10px] font-semibold text-destructive outline-none focus:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" />Remove</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {previewUrls[video.id] && expandedPreviewId !== video.id && <BrandedRoomVideoPlayer
        src={previewUrls[video.id]}
        title={video.title}
        testId={`room-video-preview-${video.id}`}
        onRetry={() => refreshPreview(video.id)}
      />}
      </article>;
  };

  return (
    <>
    <section className="space-y-2 border-t border-border pt-3" data-testid="room-video-admin-section">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <FileVideo2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-[10px] font-extrabold text-foreground">Room Videos</span>
          {backendStatus === "ready" && activeVideos.length > 1 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-bold text-muted-foreground" aria-label={`${activeVideos.length} active room videos`}>{activeVideos.length}</span>}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && <div className="space-y-2" data-testid="room-video-admin-content">
        {backendStatus === "ready" && <>
          <input ref={uploadInputRef} type="file" accept="video/mp4,.mp4" className="sr-only" data-testid="room-video-upload-input"
            aria-label="Choose a Room Video MP4 file" tabIndex={-1}
            onChange={(event) => { selectUpload(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
          <input ref={replaceInputRef} type="file" accept="video/mp4,.mp4" className="sr-only" data-testid="room-video-replace-input"
            aria-label="Choose a replacement Room Video MP4 file" tabIndex={-1}
            onChange={(event) => { selectUpload(event.currentTarget.files?.[0], replaceTargetRef.current ?? undefined); event.currentTarget.value = ""; }} />
          <input ref={captionInputRef} type="file" accept="text/vtt,.vtt" className="sr-only" data-testid="room-video-captions-input"
            aria-label="Choose a Room Video captions VTT file" tabIndex={-1}
            onChange={(event) => { void uploadCaptions(captionTargetRef.current ?? "", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
        </>}

        {backendStatus === "checking" && <p role="status" className="text-[9px] text-muted-foreground">Checking setup...</p>}
        {backendStatus !== "ready" && backendStatus !== "checking" && <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-2" data-testid="room-video-setup-required">
          <div className="min-w-0">
            <p role="status" className="text-[10px] font-semibold text-foreground">{statusTitle(backendStatus)}</p>
            <details className="mt-0.5">
              <summary className="cursor-pointer text-[9px] font-medium text-muted-foreground">Setup details</summary>
              <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{setupMessage}</p>
            </details>
          </div>
          <button type="button" disabled={Boolean(busy)} onClick={() => void refresh()}
            className="min-h-8 shrink-0 rounded-md px-2 text-[9px] font-bold text-primary hover:bg-primary/10 disabled:opacity-50">Retry</button>
        </div>}

        {backendStatus === "ready" && <>
          {!currentVideo && <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/20 p-3 text-center" data-testid="room-video-empty-state">
            <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileVideo2 className="h-4 w-4" /></span>
            <p className="text-[10px] font-semibold text-foreground">No room video yet</p>
            <button type="button" disabled={Boolean(busy)} onClick={() => uploadInputRef.current?.click()}
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[10px] font-bold text-primary-foreground shadow-sm disabled:opacity-60">
              {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Upload Video
            </button>
          </div>}

          {pendingFile && <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-2.5" data-testid="room-video-upload-details">
            <p className="truncate text-[9px] text-muted-foreground" title={pendingFile.name}>{pendingFile.name}</p>
            <label className="block space-y-1">
              <span className="text-[9px] font-semibold text-muted-foreground">Video title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} aria-label="New room video title"
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[10px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy) || !title.trim()} onClick={() => void handleUpload()}
                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-2 text-[9px] font-bold text-primary-foreground disabled:opacity-50">
                {busy?.startsWith("replace:") || busy === "upload" ? `Uploading ${progress}%` : "Save as draft"}
              </button>
              <button type="button" disabled={Boolean(busy)} onClick={() => { setPendingFile(null); replaceTargetRef.current = null; }}
                className="min-h-9 rounded-lg border border-border px-2 text-[9px] font-semibold text-foreground disabled:opacity-50">Cancel</button>
            </div>
          </div>}

          {currentVideo && renderVideoCard(currentVideo, true)}
          {historyVideos.length > 0 && <details open={showHistory} onToggle={(event) => setShowHistory(event.currentTarget.open)} className="rounded-lg border border-border/70 px-2.5 py-1.5">
            <summary className="min-h-8 cursor-pointer list-none text-[9px] font-semibold text-muted-foreground marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Other versions <span className="ml-1 text-muted-foreground/75">({historyVideos.length})</span></summary>
            <div className="space-y-2 pb-1 pt-2">{historyVideos.map((video) => renderVideoCard(video, false))}</div>
          </details>}
          {!currentVideo && historyVideos.length > 0 && !pendingFile && <p className="text-[9px] text-muted-foreground">Archived versions are kept in History.</p>}
          {videos.some((video) => video.status === "published") && <p className="text-[9px] leading-relaxed text-muted-foreground">Published videos appear when this room is included in the published campus map.</p>}
          {error && <p role="alert" className="text-[9px] leading-relaxed text-destructive">{error}</p>}
        </>}
      </div>}
    </section>
    <Dialog.Root open={Boolean(expandedPreviewVideo && previewUrls[expandedPreviewVideo.id])} onOpenChange={(open) => { if (!open) setExpandedPreviewId(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-sm" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            if (expandedPreviewTriggerRef.current) {
              event.preventDefault();
              expandedPreviewTriggerRef.current.focus();
            }
          }}
          className="fixed left-1/2 top-1/2 z-[121] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3 text-foreground shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:p-5"
          data-testid="room-video-expanded-preview"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-extrabold">{expandedPreviewVideo?.title ?? "Room Video Preview"}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[10px] text-muted-foreground">Expanded video preview</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close expanded preview" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          {expandedPreviewVideo && previewUrls[expandedPreviewVideo.id] && <div className="min-h-0 w-full overflow-y-auto rounded-xl">
            <BrandedRoomVideoPlayer
              src={previewUrls[expandedPreviewVideo.id]}
              title={expandedPreviewVideo.title}
              testId={`room-video-expanded-${expandedPreviewVideo.id}`}
              onRetry={() => refreshPreview(expandedPreviewVideo.id)}
            />
          </div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteVideoId(null); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[140] bg-slate-950/45 backdrop-blur-[1px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[141] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl">
          <AlertDialog.Title className="text-sm font-extrabold">Remove this Room Video?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {deleteTarget ? `“${deleteTarget.title}” will be removed from this room and its published access will end.` : "This video will be removed from the room."} This action cannot be undone.
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel className="min-h-10 rounded-xl border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={() => {
                if (deleteVideoId) void runAction(deleteVideoId, () => deleteAdminRoomVideo(deleteVideoId));
                setDeleteVideoId(null);
              }}
              className="min-h-10 rounded-xl bg-destructive px-3 text-xs font-bold text-destructive-foreground hover:bg-destructive/90"
            >Remove video</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    </>
  );
}
