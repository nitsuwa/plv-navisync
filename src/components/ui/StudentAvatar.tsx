import { useEffect, useState } from "react";
import { getStudentAvatarUrl } from "../../services/studentProfileService";
import { cn } from "../../lib/utils";

interface StudentAvatarProps {
  name: string;
  avatarPath?: string | null;
  /** A just-uploaded signed URL may be shown before its profile refresh. */
  imageUrl?: string | null;
  className?: string;
  imageClassName?: string;
  "aria-hidden"?: boolean;
}

export function StudentAvatar({ name, avatarPath, imageUrl, className, imageClassName, "aria-hidden": ariaHidden }: StudentAvatarProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(imageUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (imageUrl) {
      setResolvedUrl(imageUrl);
      return () => { active = false; };
    }
    if (!avatarPath) {
      setResolvedUrl(null);
      return () => { active = false; };
    }
    void getStudentAvatarUrl(avatarPath).then((url) => {
      if (active) setResolvedUrl(url);
    });
    return () => { active = false; };
  }, [avatarPath, imageUrl]);

  const initials = name.trim().replace(/\s+/g, "").slice(0, 2).toUpperCase() || "ST";
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-extrabold text-primary-foreground", className)} aria-hidden={ariaHidden}>
      {resolvedUrl && !failed
        ? <img src={resolvedUrl} alt="" className={cn("absolute inset-0 h-full w-full object-cover", imageClassName)} onError={() => setFailed(true)} />
        : <span className="flex h-full w-full items-center justify-center" aria-hidden="true">{initials}</span>}
    </span>
  );
}
