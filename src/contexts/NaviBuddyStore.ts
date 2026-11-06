import { createContext, useContext } from "react";
import { DEFAULT_NAVIBUDDY_APPEARANCE, type NaviBuddyAppearance } from "../lib/naviBuddy";

export interface NaviBuddyState {
  appearance: NaviBuddyAppearance;
  loaded: boolean;
  saveAppearance: (next: NaviBuddyAppearance) => Promise<void>;
  reaction: string | null;
  react: (message: string) => void;
}

export const NaviBuddyContext = createContext<NaviBuddyState>({
  appearance: DEFAULT_NAVIBUDDY_APPEARANCE,
  loaded: true,
  saveAppearance: async () => {},
  reaction: null,
  react: () => {},
});
export const NaviBuddyAppearanceContext = createContext(DEFAULT_NAVIBUDDY_APPEARANCE);

export function useNaviBuddy() { return useContext(NaviBuddyContext); }
export function useNaviBuddyAppearance() { return useContext(NaviBuddyAppearanceContext); }
