import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface BuildingCoverProps {
  imageUrl?: string;
  code: string;
  name: string;
  className?: string;
}

export function BuildingCover({ imageUrl, code, name, className }: BuildingCoverProps) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageReady(false);
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div className={cn("relative isolate aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[#0b1b35] via-[#173d68] to-[#287c95]", className)}>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(116,214,220,0.28),transparent_34%),linear-gradient(135deg,transparent_42%,rgba(255,255,255,0.07)_42.2%,transparent_42.8%)]" />
      {!imageUrl || imageFailed ? (
        <div data-testid="building-cover-fallback" className="absolute inset-0 flex items-center justify-center text-white/80">
          <div aria-hidden="true" className="absolute right-[-8%] top-[-38%] h-[120%] aspect-square rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute right-[6%] top-[-20%] h-[85%] aspect-square rounded-full border border-white/10" />
          <div className="relative flex flex-col items-center gap-2">
            <Building2 className="h-10 w-10 text-white/80" strokeWidth={1.35} />
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 font-mono text-[11px] font-extrabold tracking-[0.18em] text-white shadow-sm backdrop-blur-sm">
              {code || "PLV"}
            </span>
          </div>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={`${name} building`}
          onLoad={() => setImageReady(true)}
          onError={() => setImageFailed(true)}
          className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none", imageReady ? "opacity-100" : "opacity-0")}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-slate-950/10" />
    </div>
  );
}
