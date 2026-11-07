export const NAVIBUDDY_OUTFITS = ["classic", "casual", "sporty", "plv_uniform", "adventurer"] as const;
export type NaviBuddyOutfit = typeof NAVIBUDDY_OUTFITS[number];
export const NAVIBUDDY_BACKPACKS = ["classic", "compact", "none"] as const;
export type NaviBuddyBackpack = typeof NAVIBUDDY_BACKPACKS[number];

export interface NaviBuddyAppearance {
  outfit: NaviBuddyOutfit;
  backpack: NaviBuddyBackpack;
}

export const DEFAULT_NAVIBUDDY_APPEARANCE: NaviBuddyAppearance = {
  outfit: "classic", backpack: "classic",
};

export const NAVIBUDDY_OUTFIT_DETAILS: Record<NaviBuddyOutfit, { label: string; description: string; jacket: string; accent: string; pants: string }> = {
  classic: { label: "Classic", description: "The original PLV look", jacket: "#0e2a6e", accent: "#c8960c", pants: "#0a1f52" },
  casual: { label: "Casual", description: "Easygoing campus comfort", jacket: "#2d6a68", accent: "#f0bd72", pants: "#334155" },
  sporty: { label: "Sporty", description: "Athletic campus style", jacket: "#a83f45", accent: "#f7f0e4", pants: "#263451" },
  plv_uniform: { label: "PLV Uniform", description: "Light blue and navy campus uniform", jacket: "#9ccce5", accent: "#173c7a", pants: "#0a1f52" },
  adventurer: { label: "Adventurer", description: "A practical explorer look for campus", jacket: "#71834e", accent: "#d5a84c", pants: "#34402f" },
};

export function normalizeNaviBuddyAppearance(value: unknown): NaviBuddyAppearance {
  if (!value || typeof value !== "object") return DEFAULT_NAVIBUDDY_APPEARANCE;
  const candidate = value as Record<string, unknown>;
  return {
    // Preserve older saved looks when presets are renamed or replaced.
    outfit: candidate.outfit === "scholar" ? "plv_uniform" : candidate.outfit === "varsity" ? "adventurer" : NAVIBUDDY_OUTFITS.includes(candidate.outfit as NaviBuddyOutfit) ? candidate.outfit as NaviBuddyOutfit : "classic",
    backpack: NAVIBUDDY_BACKPACKS.includes(candidate.backpack as NaviBuddyBackpack) ? candidate.backpack as NaviBuddyBackpack : "classic",
  };
}

/** The Save Look action only persists outfit and backpack choices. */
export function isNaviBuddyLookDirty(draft: NaviBuddyAppearance, saved: NaviBuddyAppearance): boolean {
  return draft.outfit !== saved.outfit || draft.backpack !== saved.backpack;
}
