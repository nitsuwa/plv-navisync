import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import plvLogo from "@/imports/image.png";
import { cn } from "../../lib/utils";

interface PLVLogoProps {
  size?: number;
  className?: string;
}

/**
 * PLV Official Seal — white circle container, no blend modes.
 * Works identically on light and dark backgrounds.
 */
export function PLVLogo({ size = 40, className }: PLVLogoProps) {
  // Inner image is slightly smaller than the container so the white ring shows
  const imgSize = Math.round(size * 0.88);

  return (
    <div
      className={cn(
        "rounded-full bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-sm",
        className
      )}
      style={{ width: size, height: size }}
    >
      <ImageWithFallback
        src={plvLogo}
        alt="PLV Official Seal — Pamantasan ng Lungsod ng Valenzuela"
        style={{ width: imgSize, height: imgSize, objectFit: "contain" }}
        draggable={false}
      />
    </div>
  );
}
