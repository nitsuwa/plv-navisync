import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Eye, FileVideo2, Loader2, ShieldCheck, Trash2, Upload, Volume2 } from "lucide-react";
import type { Campus, FloorRoom, RoomEmergencyEvacuationConfiguration } from "./types";
import { currentStudentEmergencyRouteFingerprint } from "../../lib/studentEmergencyEvacuation";
import { cn } from "../../lib/utils";
import {
  createAdminEmergencyCaptionsPreviewUrl,
  createAdminEmergencyVideoPreviewUrl,
  formatEmergencyVideoSize,
  getEmergencyVideoStorageReadiness,
  EMERGENCY_VIDEO_SETUP_MIGRATION,
  getAdminEmergencyEvacuationVideo,
  publishEmergencyEvacuationVideo,
  unpublishEmergencyEvacuationVideo,
  updateEmergencyVideoDuration,
  updateAdminEmergencyVideoTitle,
  uploadEmergencyEvacuationVideoDraft,
  uploadEmergencyVideoCaptions,
  EmergencyVideoStorageRequestError,
  EmergencyVideoMetadataRequestError,
  type EmergencyVideoStorageFailureDiagnostic,
  type EmergencyEvacuationVideoRow,
} from "../../services/emergencyEvacuationVideoService";

interface EmergencyEvacuationVideoAdminSectionProps {
  campus: Campus;
  buildingId: string;
  floorId: string;
  room: FloorRoom;
  configuration: RoomEmergencyEvacuationConfiguration;
  onChange: (configuration: RoomEmergencyEvacuationConfiguration) => void;
}

function statusText(row: EmergencyEvacuationVideoRow | null, isCurrent: boolean, loading: boolean, failed: boolean): string {
  if (loading) return "Loading video metadata…";
  if (failed) return "Video unavailable";
  if (!row) return "No video uploaded";
  if (row.status === "published" && isCurrent) return "Published";
  if (row.status === "published" || row.status === "needs_review") return "Needs Review";
  if (row.status === "archived") return "Video unavailable";
  return "Uploaded · awaiting review";
}

export function EmergencyEvacuationVideoAdminSection({ campus, buildingId, floorId, room, configuration, onChange }: EmergencyEvacuationVideoAdminSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [record, setRecord] = useState<EmergencyEvacuationVideoRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadDiagnostic, setUploadDiagnostic] = useState<EmergencyVideoStorageFailureDiagnostic | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewCaptionsUrl, setPreviewCaptionsUrl] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [title, setTitle] = useState(configuration.videoGuide?.title ?? "");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [storageReadiness, setStorageReadiness] = useState<"checking" | "ready" | "not_configured" | "missing_table" | "missing_bucket" | "no_access" | "unavailable">("checking");
  const [storageCheckKey, setStorageCheckKey] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const guide = configuration.videoGuide;
  const videoId = guide?.videoId;
  const currentRouteFingerprint = useMemo(
    () => videoId
      ? currentStudentEmergencyRouteFingerprint(campus, buildingId, floorId, room.id)
      : null,
    [campus, buildingId, floorId, room.id, videoId],
  );
  const approvedFingerprint = record?.approved_route_fingerprint ? JSON.stringify(record.approved_route_fingerprint) : null;
  const isCurrent = Boolean(currentRouteFingerprint && approvedFingerprint === currentRouteFingerprint
    && guide?.reviewStatus === "approved" && guide.reviewedRouteFingerprint === currentRouteFingerprint);

  useEffect(() => {
    setTitle(guide?.title ?? "");
    setReviewConfirmed(false);
    setPreviewUrl(null);
    setPreviewCaptionsUrl(null);
    setPreviewReady(false);
    if (!videoId) {
      setRecord(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    getAdminEmergencyEvacuationVideo(videoId).then((next) => {
      if (!active) return;
      setRecord(next);
      setTitle(guide?.title || next?.title || "");
      setFailed(!next);
    }).catch(() => {
      if (active) { setRecord(null); setFailed(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [videoId]);

  useEffect(() => { setTitle(guide?.title ?? ""); }, [videoId, guide?.title]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setStorageReadiness("checking");
    getEmergencyVideoStorageReadiness()
      .then((status) => { if (active) setStorageReadiness(status); })
      .catch(() => { if (active) setStorageReadiness("unavailable"); });
    return () => { active = false; };
  }, [expanded, storageCheckKey]);

  useEffect(() => {
    setReviewConfirmed(false);
    setPreviewUrl(null);
    setPreviewCaptionsUrl(null);
    setPreviewReady(false);
  }, [currentRouteFingerprint]);

  const updateGuide = (changes: Partial<NonNullable<RoomEmergencyEvacuationConfiguration["videoGuide"]>>) => {
    onChange({ ...configuration, videoGuide: { ...guide, enabled: guide?.enabled ?? true, ...changes } });
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (storageReadiness !== "ready") return;
    setWorking(true); setProgress(0); setError(null); setUploadDiagnostic(null); setPreviewUrl(null); setPreviewCaptionsUrl(null); setPreviewReady(false);
    try {
      const uploaded = await uploadEmergencyEvacuationVideoDraft({
        campusId: campus.id, buildingId, floorId, roomId: room.id, file,
        title: file.name.replace(/\.mp4$/i, ""),
        onProgress: setProgress,
      });
      setRecord(uploaded);
      setTitle(uploaded.title);
      setFailed(false);
      updateGuide({ enabled: true, videoId: uploaded.id, title: uploaded.title, reviewStatus: "draft", reviewedRouteFingerprint: undefined });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed. Please retry.";
      if (/bucket .{0,40}(?:is not installed|not found|could not be found)/i.test(message)) {
        setStorageReadiness("missing_bucket");
        setError(null);
      } else if (cause instanceof EmergencyVideoStorageRequestError || cause instanceof EmergencyVideoMetadataRequestError) {
        setError("Upload failed. Please retry.");
        setUploadDiagnostic(cause.diagnostic);
      } else setError(message);
    } finally { setWorking(false); setProgress(null); }
  };

  const handleCaptions = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !record || storageReadiness !== "ready") return;
    setWorking(true); setProgress(0); setError(null);
    try {
      await uploadEmergencyVideoCaptions(record.id, file, setProgress);
      setReviewConfirmed(false);
      setPreviewUrl(null);
      setPreviewCaptionsUrl(null);
      setPreviewReady(false);
      const next = await getAdminEmergencyEvacuationVideo(record.id);
      setRecord(next);
      if (record.status === "published") updateGuide({ reviewStatus: "needs_review", reviewedRouteFingerprint: undefined });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Captions could not be attached."); }
    finally { setWorking(false); setProgress(null); }
  };

  const saveTitle = async () => {
    if (!record || !title.trim() || title.trim() === record.title) return;
    setWorking(true); setError(null);
    try {
      await updateAdminEmergencyVideoTitle(record.id, title);
      const next = await getAdminEmergencyEvacuationVideo(record.id);
      setRecord(next);
      updateGuide({ title: title.trim().slice(0, 120) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The title could not be saved."); }
    finally { setWorking(false); }
  };

  const openPreview = async () => {
    if (!record || storageReadiness !== "ready") return;
    setWorking(true); setError(null);
    setPreviewUrl(null); setPreviewCaptionsUrl(null); setPreviewReady(false); setReviewConfirmed(false);
    try {
      const [videoUrl, captionsUrl] = await Promise.all([
        createAdminEmergencyVideoPreviewUrl(record.id),
        createAdminEmergencyCaptionsPreviewUrl(record.id),
      ]);
      setPreviewUrl(videoUrl);
      setPreviewCaptionsUrl(captionsUrl);
      setPreviewReady(false);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The private video preview could not be opened."); }
    finally { setWorking(false); }
  };

  const publish = async () => {
    if (!record || !currentRouteFingerprint || !reviewConfirmed || !previewReady) return;
    setWorking(true); setError(null);
    try {
      await publishEmergencyEvacuationVideo(record.id, currentRouteFingerprint);
      const next = await getAdminEmergencyEvacuationVideo(record.id);
      setRecord(next);
      updateGuide({ enabled: true, videoId: record.id, title: title.trim() || record.title, reviewStatus: "approved", reviewedRouteFingerprint: currentRouteFingerprint });
      setReviewConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Video approval could not be saved."); }
    finally { setWorking(false); }
  };

  const unpublish = async () => {
    if (!record) return;
    setWorking(true); setError(null);
    try {
      await unpublishEmergencyEvacuationVideo(record.id);
      const next = await getAdminEmergencyEvacuationVideo(record.id);
      setRecord(next);
      updateGuide({ reviewStatus: "draft", reviewedRouteFingerprint: undefined });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The video could not be unpublished."); }
    finally { setWorking(false); }
  };

  const remove = async () => {
    if (!record || !window.confirm("Remove this guide from the room configuration? Private media is retained until no saved or published map snapshot references it.")) return;
    setPreviewUrl(null); setPreviewCaptionsUrl(null); setPreviewReady(false); setTitle(""); setFailed(false);
    setRecord(null);
    onChange({ ...configuration, videoGuide: undefined });
  };

  const label = statusText(record, isCurrent, loading, failed);
  const storageSetupMessage = storageReadiness === "not_configured"
    ? "Supabase Storage is not configured for this app."
    : storageReadiness === "missing_table" || storageReadiness === "missing_bucket"
      ? "Video storage setup is required before uploads can begin."
      : storageReadiness === "no_access"
        ? "This Admin account cannot access private video storage. Check its role and Storage policies."
        : storageReadiness === "unavailable"
          ? "Video storage could not be checked. Retry before uploading."
          : null;
  return (
    <section className="space-y-2 border-t border-border pt-3" data-testid="emergency-video-admin-section">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <FileVideo2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-[10px] font-extrabold text-foreground">Emergency Evacuation Video Guide</span>
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && <div className="space-y-3" data-testid="emergency-video-admin-content">
        <label className="flex items-start gap-2.5 rounded-xl border border-border bg-background/70 p-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={Boolean(guide?.enabled)} onChange={(event) => updateGuide({ enabled: event.target.checked })} aria-label="Enable Emergency Video Guide" />
          <span className="min-w-0"><span className="block text-[11px] font-bold text-foreground">Enable Emergency Video Guide</span><span className="mt-0.5 block text-[9px] leading-relaxed text-muted-foreground">Students see this guide after it and the campus map are published.</span></span>
        </label>

        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/55 px-2.5 py-2">
          <span className="min-w-0 text-[9px] font-bold text-foreground">{label}</span>
          {isCurrent ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : record && record.status !== "draft" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : null}
        </div>

        {storageReadiness === "checking" ? <p className="text-[9px] text-muted-foreground" role="status" aria-live="polite">Checking private video storage…</p>
          : storageSetupMessage && <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5" role="status" aria-live="polite" data-testid="emergency-video-storage-setup">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="text-[9px] leading-relaxed text-foreground">{storageSetupMessage}</p>
              {(storageReadiness === "missing_bucket" || storageReadiness === "missing_table") && <><p className="mt-1 break-all font-mono text-[8px] leading-relaxed text-muted-foreground">{EMERGENCY_VIDEO_SETUP_MIGRATION}</p><p className="text-[8px] text-muted-foreground">Apply it in the Supabase SQL Editor.</p></>}
              {(storageReadiness === "unavailable" || storageReadiness === "missing_bucket" || storageReadiness === "missing_table" || storageReadiness === "no_access") && <button type="button" onClick={() => setStorageCheckKey((value) => value + 1)} className="mt-1 min-h-8 rounded-lg px-2 text-[9px] font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Check setup again</button>}
            </div>
          </div>}

        {record && <div className="space-y-2 rounded-xl border border-border bg-card p-3" data-testid="emergency-video-admin-record">
          <label className="block space-y-1"><span className="text-[9px] font-semibold text-muted-foreground">Video title</span>
            <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-[10px] text-foreground" aria-label="Emergency video title" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] text-muted-foreground">
            <span>{record.original_filename}</span><span>{formatEmergencyVideoSize(record.file_size_bytes)}{record.duration_seconds ? ` · ${Math.round(record.duration_seconds)} sec` : ""}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={openPreview} disabled={working || storageReadiness !== "ready"} className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-[9px] font-bold text-foreground hover:bg-muted disabled:opacity-60"><Eye className="h-3.5 w-3.5" />Preview</button>
            <button type="button" onClick={() => videoInputRef.current?.click()} disabled={working || storageReadiness !== "ready"} className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-[9px] font-bold text-foreground hover:bg-muted disabled:opacity-60"><Upload className="h-3.5 w-3.5" />Replace video</button>
          </div>
          {previewUrl && <video
            key={previewUrl}
            controls
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            className="aspect-video max-h-48 w-full rounded-lg bg-slate-950"
            onLoadedMetadata={(event) => {
              setPreviewReady(Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0);
              void updateEmergencyVideoDuration(record.id, event.currentTarget.duration).then(() => getAdminEmergencyEvacuationVideo(record.id)).then((next) => next && setRecord(next)).catch(() => undefined);
            }}
            onError={() => { setPreviewReady(false); setError("This browser cannot decode the video. Export it as a web-compatible MP4 using H.264 video and AAC audio, then upload it again."); }}
          >
            <source src={previewUrl} type="video/mp4" />
            {previewCaptionsUrl && <track kind="captions" src={previewCaptionsUrl} srcLang="en" label="Captions" default />}
          </video>}
          <button type="button" onClick={() => captionInputRef.current?.click()} disabled={working || storageReadiness !== "ready"} className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-[9px] font-bold text-foreground hover:bg-muted disabled:opacity-60"><Volume2 className="h-3.5 w-3.5" />{record.captions_path ? "Replace captions" : "Attach captions (.vtt)"}</button>
          {record.captions_path && <p className="text-[9px] text-muted-foreground">Captions attached. Re-review the guide after changing subtitles.</p>}

          <label className="flex items-start gap-2 rounded-lg border border-border p-2.5">
            <input type="checkbox" checked={reviewConfirmed} disabled={!currentRouteFingerprint || !previewReady || working} onChange={(event) => setReviewConfirmed(event.target.checked)} className="mt-0.5 accent-primary" />
            <span className="text-[9px] leading-relaxed text-muted-foreground">I previewed this video against the current eligible SOS route{configuration.enabled && configuration.routes.length > 1 ? "s" : ""} and its Assembly Point.</span>
          </label>
          {!currentRouteFingerprint && <p className="text-[9px] leading-relaxed text-amber-700">A current eligible SOS route to an approved Assembly Point is required before publishing this guide.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={publish} disabled={working || !currentRouteFingerprint || !previewReady || !reviewConfirmed} className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-[9px] font-bold text-primary-foreground disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />Review &amp; publish</button>
            <button type="button" onClick={unpublish} disabled={working || record.status !== "published"} className="min-h-9 rounded-lg border border-border px-2 text-[9px] font-bold text-foreground hover:bg-muted disabled:opacity-50">Unpublish</button>
          </div>
          <button type="button" onClick={remove} disabled={working} className="flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-[9px] font-bold text-destructive hover:bg-destructive/5 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Remove from room</button>
        </div>}

        {!record && <button type="button" onClick={() => videoInputRef.current?.click()} disabled={working || loading || storageReadiness !== "ready"} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/45 bg-primary/5 px-3 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Upload MP4 video</button>}
        {typeof progress === "number" && <div className="space-y-1" aria-live="polite"><div className="flex items-center justify-between text-[9px] font-semibold text-muted-foreground"><span>Uploading private video</span><span>{progress}%</span></div><progress max={100} value={progress} className="h-1.5 w-full accent-primary" /></div>}
        {working && progress === null && <p className="flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Updating video guide…</p>}
        {error && <p role="alert" className="text-[9px] leading-relaxed text-destructive">{error}</p>}
        {uploadDiagnostic && <details className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2" data-testid="emergency-video-upload-diagnostics">
          <summary className="min-h-8 cursor-pointer select-none py-1 text-[9px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Upload diagnostics</summary>
          <dl className="mt-1 space-y-1 border-t border-border pt-2 text-[9px] leading-relaxed">
            <div className="flex gap-1.5"><dt className="font-semibold text-muted-foreground">HTTP</dt><dd className="font-mono text-foreground">{uploadDiagnostic.status}</dd></div>
            <div className="flex gap-1.5"><dt className="font-semibold text-muted-foreground">Failed stage</dt><dd className="text-foreground">{uploadDiagnostic.phase === "storage_upload" ? "Storage object upload" : "Video metadata insert"}</dd></div>
            <div><dt className="font-semibold text-muted-foreground">Request</dt><dd className="break-all font-mono text-foreground">{uploadDiagnostic.method} {uploadDiagnostic.service === "Storage" ? `${uploadDiagnostic.bucket}/${uploadDiagnostic.objectPath}` : `${uploadDiagnostic.table} (object: ${uploadDiagnostic.objectPath})`}</dd></div>
            <div className="flex flex-wrap gap-x-3"><dt className="font-semibold text-muted-foreground">Uploaded object type</dt><dd className="font-mono text-foreground">{uploadDiagnostic.contentType}</dd><dt className="font-semibold text-muted-foreground">File size</dt><dd className="font-mono text-foreground">{formatEmergencyVideoSize(uploadDiagnostic.fileSizeBytes)}</dd></div>
            {uploadDiagnostic.service === "Storage" && <div className="flex gap-1.5"><dt className="font-semibold text-muted-foreground">Configured bucket limit</dt><dd className="font-mono text-foreground">100 MB</dd></div>}
            {uploadDiagnostic.code && <div className="flex gap-1.5"><dt className="font-semibold text-muted-foreground">Code</dt><dd className="break-all font-mono text-foreground">{uploadDiagnostic.code}</dd></div>}
            {uploadDiagnostic.backendMessage && <div><dt className="font-semibold text-muted-foreground">{uploadDiagnostic.service} response</dt><dd className="break-words text-foreground">{uploadDiagnostic.backendMessage}</dd></div>}
            {uploadDiagnostic.cleanupStatus && <div><dt className="font-semibold text-muted-foreground">Partial upload cleanup</dt><dd className="text-foreground">{uploadDiagnostic.cleanupStatus === "removed" ? "Uploaded object removed." : `Cleanup failed${uploadDiagnostic.cleanupMessage ? `: ${uploadDiagnostic.cleanupMessage}` : "."}`}</dd></div>}
            {uploadDiagnostic.requestId && <div className="flex gap-1.5"><dt className="font-semibold text-muted-foreground">Request ID</dt><dd className="break-all font-mono text-foreground">{uploadDiagnostic.requestId}</dd></div>}
          </dl>
        </details>}
        {record?.status === "published" && !isCurrent && <p className="text-[9px] leading-relaxed text-amber-700">The guide was reviewed against another route version. Students cannot access it until it is reviewed again.</p>}
        {record?.status === "published" && isCurrent && <p className="text-[9px] leading-relaxed text-muted-foreground">Save and publish the campus map to make this approved guide available to students.</p>}
        <p className="text-[9px] leading-relaxed text-muted-foreground">MP4 up to 100 MB. Campus safety review is required.</p>

        <input ref={videoInputRef} hidden type="file" accept="video/mp4,.mp4" onChange={(event) => void handleUpload(event)} />
        <input ref={captionInputRef} hidden type="file" accept="text/vtt,.vtt" onChange={(event) => void handleCaptions(event)} />
      </div>}
    </section>
  );
}
