import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Camera, Flashlight, FlashlightOff, Search, X } from "lucide-react";
import { useEscToClose } from "../../hooks/useEscToClose";
import { triggerMapFeedback } from "../../lib/mapFeedback";

interface LocationQRScannerProps {
  onClose: () => void;
  onScan: (value: string) => boolean | void;
  onSearchInstead: () => void;
}

export function LocationQRScanner({ onClose, onScan, onSearchInstead }: LocationQRScannerProps) {
  useEscToClose(onClose);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let active = true;
    const reader = new BrowserQRCodeReader();
    const video = videoRef.current;
    const stopCamera = () => {
      const stream = video?.srcObject as MediaStream | null;
      controlsRef.current?.stop();
      controlsRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      try { if (video) video.srcObject = null; } catch { /* Some embedded WebViews expose a read-only srcObject. */ }
    };

    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera scanning is not available in this browser. Search for your location instead.");
      return;
    }

    void reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (!active || handledRef.current || !result) return;
      handledRef.current = true;
      stopCamera();
      const validLocation = onScanRef.current(result.getText());
      if (validLocation !== false) triggerMapFeedback("scan-success");
    }).then((controls) => {
      if (!active || handledRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      const stream = video.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      try {
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(Boolean(capabilities?.torch));
      } catch { setTorchAvailable(false); }
    }).catch((error: unknown) => {
      if (active) {
        const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
          setCameraError("Camera access was denied. Allow camera access in your browser settings, then reopen the scanner, or search for your location instead.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setCameraError("No camera was found on this device. Search for your location instead.");
        } else {
          setCameraError("Could not start the camera. Check that another app is not using it, or search for your location instead.");
        }
      }
    });

    return () => {
      active = false;
      stopCamera();
    };
  }, []);

  const toggleTorch = async () => {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0] as (MediaStreamTrack & { applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void> }) | undefined;
    if (!track?.applyConstraints) return;
    const nextEnabled = !torchEnabled;
    try {
      await track.applyConstraints({ advanced: [{ torch: nextEnabled } as MediaTrackConstraintSet] });
      setTorchEnabled(nextEnabled);
    } catch {
      setTorchAvailable(false);
      setTorchEnabled(false);
    }
  };

  return createPortal(
    <div data-no-drag data-testid="location-qr-scanner" className="location-qr-scanner fixed inset-0 z-[1000] flex h-[100dvh] min-h-[100svh] items-stretch justify-center overflow-hidden bg-background sm:h-auto sm:min-h-0 sm:items-center sm:bg-black/75 sm:p-3" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        data-testid="location-qr-scanner-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-qr-scanner-title"
        className="flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden bg-card text-card-foreground sm:h-auto sm:max-h-[min(48rem,calc(100dvh-1.5rem))] sm:max-w-md sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top,0px))] sm:py-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Camera className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="location-qr-scanner-title" className="text-base font-extrabold">Scan a location QR</h2>
            <p className="text-xs text-muted-foreground">Point your camera at a NaviSync campus marker.</p>
          </div>
          <button autoFocus type="button" onClick={onClose} aria-label="Close QR scanner" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div data-testid="location-qr-scanner-content" className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 sm:flex-initial sm:justify-start sm:gap-4 sm:overflow-visible sm:p-4">
          <div data-testid="location-qr-viewfinder" className="relative mx-auto flex min-h-[min(58vw,14rem)] max-h-[58dvh] w-full flex-1 overflow-hidden rounded-2xl bg-black sm:aspect-[4/3] sm:min-h-0 sm:max-h-none sm:flex-initial">
            <video ref={videoRef} data-testid="location-qr-video" autoPlay muted playsInline className="h-full w-full object-cover" aria-label="Camera preview for scanning a location QR" />
            {torchAvailable && !cameraError && <button type="button" data-no-drag onClick={() => void toggleTorch()} aria-label={torchEnabled ? "Turn flashlight off" : "Turn flashlight on"} aria-pressed={torchEnabled} className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
              {torchEnabled ? <FlashlightOff className="h-4 w-4" /> : <Flashlight className="h-4 w-4" />}
            </button>}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 px-6 text-center text-white">
                <Camera className="h-7 w-7 text-white/80" />
                <p className="text-sm font-semibold">Camera unavailable</p>
                <p className="text-xs leading-relaxed text-white/75">{cameraError}</p>
              </div>
            )}
          </div>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">A successful scan marks the confirmed location and fills your route starting point. It does not start navigation.</p>
          <button type="button" onClick={onSearchInstead} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <Search className="h-4 w-4" /> Search the map instead
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
