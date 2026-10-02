import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Camera, Search, X } from "lucide-react";
import { useEscToClose } from "../../hooks/useEscToClose";

interface LocationQRScannerProps {
  onClose: () => void;
  onScan: (value: string) => void;
  onSearchInstead: () => void;
}

export function LocationQRScanner({ onClose, onScan, onSearchInstead }: LocationQRScannerProps) {
  useEscToClose(onClose);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let active = true;
    const reader = new BrowserQRCodeReader();
    const video = videoRef.current;

    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera scanning is not available in this browser. Search for your location instead.");
      return;
    }

    void reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (!active || handledRef.current || !result) return;
      handledRef.current = true;
      controlsRef.current?.stop();
      onScanRef.current(result.getText());
    }).then((controls) => {
      if (!active || handledRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
    }).catch(() => {
      if (active) {
        setCameraError("Could not start the camera. Allow camera access or search for your location instead.");
      }
    });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-qr-scanner-title"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Camera className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="location-qr-scanner-title" className="text-base font-extrabold">Scan a location QR</h2>
            <p className="text-xs text-muted-foreground">Point your camera at a NaviSync campus marker.</p>
          </div>
          <button autoFocus type="button" onClick={onClose} aria-label="Close QR scanner" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" aria-label="Camera preview for scanning a location QR" />
            <div className="pointer-events-none absolute inset-[16%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
            {!cameraError && (
              <p className="absolute inset-x-2 bottom-2 rounded-full bg-black/60 px-3 py-1.5 text-center text-[11px] font-semibold text-white">
                Center the full QR code in the frame
              </p>
            )}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 px-6 text-center text-white">
                <Camera className="h-7 w-7 text-white/80" />
                <p className="text-sm font-semibold">Camera unavailable</p>
                <p className="text-xs leading-relaxed text-white/75">{cameraError}</p>
              </div>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">Scanning sets the QR location as your route starting point.</p>
          <button type="button" onClick={onSearchInstead} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <Search className="h-4 w-4" /> Search the map instead
          </button>
        </div>
      </section>
    </div>
  );
}
