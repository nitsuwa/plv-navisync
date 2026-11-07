import { type NaviBuddyAppearance } from "../../lib/naviBuddy";
import { IskolarBust, IskolarCharacterArt } from "./IskolarMarkerArt";

/** Full-body portrait using the marker's shared head, hair and outfit artwork. */
export function NaviBuddyPortrait({ appearance, className = "" }: { appearance: NaviBuddyAppearance; className?: string }) {
  const styleLabel = appearance.outfit === "plv_uniform" ? "PLV Uniform" : appearance.outfit[0].toUpperCase() + appearance.outfit.slice(1);
  return <svg viewBox="0 0 220 330" preserveAspectRatio="xMidYMax meet" role="img" aria-label={`${styleLabel} NaviBuddy`} className={`navibuddy-portrait ${className}`}>
    <IskolarCharacterArt appearance={appearance} />
  </svg>;
}

/** Compact Settings-only bust portrait. It reuses the map character's face,
 * hair and outfit details while omitting the full-body wardrobe illustration. */
export function NaviBuddyOutfitBust({ appearance, className = "" }: { appearance: NaviBuddyAppearance; className?: string }) {
  const styleLabel = appearance.outfit === "plv_uniform" ? "PLV Uniform" : appearance.outfit[0].toUpperCase() + appearance.outfit.slice(1);
  return <svg data-testid="navibuddy-outfit-bust" viewBox="0 0 180 190" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${styleLabel} NaviBuddy`} className={className}>
    <g transform="translate(90 80)">
      <IskolarBust radius={80} appearance={appearance} clip={false} includeBackpack={false} wardrobeFit />
    </g>
  </svg>;
}
