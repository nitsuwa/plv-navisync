import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bookmark, Check, ChevronDown, ClipboardCopy, Layers3, Loader2, MoreHorizontal, Navigation, QrCode, Share2 } from "lucide-react";
import type { Building } from "../../types";
import type { StudentAuthState } from "../../hooks/useStudentAuth";
import { buildingMapDeepLink, copyBuildingLink, shareBuildingLink } from "../../lib/buildingShare";
import { cn } from "../../lib/utils";
import { useToast } from "../../hooks/useToast";
import { StudentReportAction } from "./StudentReportAction";

interface BuildingDetailsActionsProps {
  building: Building;
  campusId?: string;
  hasFloorPlans: boolean;
  saved: Set<string>;
  savedStateLoading?: boolean;
  savedStateUnavailable?: boolean;
  studentAuth: StudentAuthState;
  showQR: boolean;
  showSecondaryActions?: boolean;
  onDirections: (building: Building) => void;
  onEnterBuilding: (building: Building) => void;
  onSave: (buildingId: string) => void;
  onReport: (building: Building) => void;
  onSignInPrompt: (message: string) => void;
  onToggleQR: () => void;
}

const iconButton = "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground/80 shadow-sm transition-[transform,background-color,color,box-shadow] duration-150 hover:bg-muted hover:text-foreground hover:shadow active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function BuildingDetailsActions({
  building, campusId = "", hasFloorPlans, saved, studentAuth, showQR, showSecondaryActions = true,
  savedStateLoading = false, savedStateUnavailable = false,
  onDirections, onEnterBuilding, onSave, onReport, onSignInPrompt, onToggleQR,
}: BuildingDetailsActionsProps) {
  const toast = useToast();
  const isSaved = saved.has(building.id) || Boolean(building.code && (saved.has(building.code) || saved.has(building.code.toLowerCase())));
  const isCheckingSavedState = studentAuth.isStudent && savedStateLoading;
  const savedStateFailed = studentAuth.isStudent && !savedStateLoading && savedStateUnavailable;
  const share = async () => {
    try {
      const result = await shareBuildingLink({
        buildingName: building.name,
        url: buildingMapDeepLink(campusId, building.id),
      });
      if (result === "copied") toast.success("Link copied.");
    } catch {
      toast.error("Couldn’t share this building", "Please try again.");
    }
  };
  const copyLink = async () => {
    try {
      await copyBuildingLink(buildingMapDeepLink(campusId, building.id));
      toast.success("Link copied.");
    } catch {
      toast.error("Link could not be copied", "Please try again.");
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" data-testid="building-directions" onClick={() => onDirections(building)} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground shadow-sm transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45">
          <Navigation className="h-4 w-4 shrink-0" /> Directions
        </button>
        <button type="button" data-testid="building-enter" onClick={() => hasFloorPlans && onEnterBuilding(building)} disabled={!hasFloorPlans} title={hasFloorPlans ? "Open the indoor map" : "Indoor maps are not available yet"} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 text-sm font-extrabold text-primary transition-[transform,background-color] duration-150 hover:bg-primary/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45">
          <Layers3 className="h-4 w-4 shrink-0" /> Enter Building
        </button>
      </div>

      {showSecondaryActions && <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          aria-label={isCheckingSavedState
            ? `Checking saved status for ${building.name}`
            : savedStateFailed
              ? `Saved status unavailable for ${building.name}`
              : isSaved
                ? `Remove ${building.name} from saved places`
                : `Save ${building.name}`}
          aria-busy={isCheckingSavedState}
          disabled={isCheckingSavedState || savedStateFailed}
          onClick={() => studentAuth.isStudent ? onSave(building.id) : onSignInPrompt("save locations")}
          className={cn(
            iconButton,
            "h-11 gap-1 px-1 text-[10px] disabled:opacity-70",
            isCheckingSavedState && "disabled:cursor-wait",
            savedStateFailed && "disabled:cursor-not-allowed",
            isSaved && studentAuth.isStudent && "border-primary/25 bg-primary/5 text-primary",
          )}
        >
          {isCheckingSavedState
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            : isSaved && studentAuth.isStudent
              ? <Check className="h-3.5 w-3.5 shrink-0" />
              : <Bookmark className={cn("h-3.5 w-3.5 shrink-0", isSaved && "fill-current")} />}
          <span>{isCheckingSavedState ? "Checking" : savedStateFailed ? "Unavailable" : isSaved && studentAuth.isStudent ? "Saved" : "Save"}</span>
        </button>
        <button
          type="button"
          aria-label={showQR ? "Hide building QR code" : "Show building QR code"}
          aria-pressed={showQR}
          onClick={onToggleQR}
          className={cn(iconButton, "h-11 gap-1 px-1 text-[10px]", showQR && "border-primary/25 bg-primary/5 text-primary")}
        >
          <QrCode className="h-3.5 w-3.5 shrink-0" /> <span>QR Code</span>
        </button>
        <StudentReportAction
          testId="building-report"
          ariaLabel="Report map issue"
          onClick={() => studentAuth.isStudent ? onReport(building) : onSignInPrompt("report issues")}
          className="h-11 gap-1 px-1 text-[10px]"
        />

        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label="More building actions" className={cn(iconButton, "h-11 gap-0.5 px-1 text-[10px]")}>
              <MoreHorizontal className="h-3.5 w-3.5 shrink-0" /> <span>More</span> <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={10} className="z-[120] min-w-48 rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 duration-150">
              <DropdownMenu.Item onSelect={() => void share()} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold outline-none transition-colors hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted">
                <Share2 className="h-3.5 w-3.5 text-primary" /> Share
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void copyLink()} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold outline-none transition-colors hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted">
                <ClipboardCopy className="h-3.5 w-3.5 text-primary" /> Copy Link
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>}
    </div>
  );
}
