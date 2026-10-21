import { useEffect, useRef, useState } from "react";
import { Image, Loader2, Trash2, Upload } from "lucide-react";
import type { FloorRoom } from "./types";
import {
  createRoomPhotoPreviewUrl,
  deleteRoomPhotoIfUnreferenced,
  uploadRoomPhoto,
} from "../../services/roomPhotoService";

interface RoomPhotoAdminSectionProps {
  campusId: string;
  buildingId: string;
  floorId: string;
  room: FloorRoom;
  onUpdateRoom: (id: string, changes: Partial<FloorRoom>) => void;
}

export function RoomPhotoAdminSection({ campusId, buildingId, floorId, room, onUpdateRoom }: RoomPhotoAdminSectionProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    setPreviewUrl(null);
    setError(null);
    setNotice(null);
    if (room.roomPhotoPath) {
      void createRoomPhotoPreviewUrl(room.roomPhotoPath).then((url) => {
        if (current) setPreviewUrl(url);
      }).catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "The Room photo preview is unavailable.");
      });
    }
    return () => { current = false; };
  }, [room.id, room.roomPhotoPath]);

  const choosePhoto = async (file: File | undefined) => {
    if (!file || busy) return;
    const previousPath = room.roomPhotoPath;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const path = await uploadRoomPhoto({ campusId, buildingId, floorId, roomId: room.id, file });
      onUpdateRoom(room.id, { roomPhotoPath: path });
      if (previousPath) {
        const removed = await deleteRoomPhotoIfUnreferenced(previousPath);
        if (!removed) setNotice("The previous photo is retained while a saved or published map still references it.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Room photo could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    const path = room.roomPhotoPath;
    if (!path || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    onUpdateRoom(room.id, { roomPhotoPath: undefined });
    setPreviewUrl(null);
    try {
      const removed = await deleteRoomPhotoIfUnreferenced(path);
      if (!removed) setNotice("The stored photo is retained while a saved or published map still references it.");
    } catch {
      setNotice("The photo was removed from this draft, but its stored file was retained for safety.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0 space-y-1.5" data-testid="room-photo-admin-section">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        Room Photo <span className="font-normal normal-case tracking-normal">(optional)</span>
      </span>
      {previewUrl && room.roomPhotoPath && (
        <div className="overflow-hidden rounded-lg border border-border bg-background/70 p-1.5">
          <img src={previewUrl} alt={`${room.name} photo preview`} className="mx-auto max-h-36 max-w-full rounded-md object-contain" loading="lazy" decoding="async" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choose Room photo"
          data-testid="room-photo-file-input"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void choosePhoto(file);
          }}
        />
        <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background/80 px-3 text-[10px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : room.roomPhotoPath ? <Image className="h-3.5 w-3.5" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
          {room.roomPhotoPath ? "Replace Photo" : "Upload Photo"}
        </button>
        {room.roomPhotoPath && <button type="button" disabled={busy} onClick={() => void removePhoto()} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove Photo
        </button>}
        <span className="text-[9px] text-muted-foreground">JPG, PNG or WebP · up to 5 MB</span>
      </div>
      {error && <p role="alert" className="text-[10px] leading-relaxed text-destructive">{error}</p>}
      {notice && <p role="status" className="text-[10px] leading-relaxed text-muted-foreground">{notice}</p>}
    </div>
  );
}
