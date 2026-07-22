/**
 * PLV NaviSync — Animation Tokens
 *
 * Single source of truth for all animation durations, easings, and spring
 * configurations. Import these constants instead of inlining values to ensure
 * consistent feel across the entire application.
 *
 * Design rationale:
 * - All standard motion animations use the same cubic-bezier `ease.out`.
 * - Springs are reserved for micro-interactions (buttons, toggles, popovers).
 * - CSS classes in theme.css mirror these tokens for non-JS animations.
 */

// ── Easing ─────────────────────────────────────────────────────────────────
/** Primary cubic-bezier — smooth, premium deceleration curve */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Bouncy spring suitable for cards, panels, and popover entrances */
export const EASE_SPRING_BOUNCE = [0.34, 1.56, 0.64, 1] as const;

// ── Durations ──────────────────────────────────────────────────────────────
export const DURATION = {
  /** Instant feedback — 150ms: hovers, toggles, micro-interactions */
  fast: 0.15,
  /** Standard — 300-350ms: page transitions, panel slides, fades */
  standard: 0.35,
  /** Slower — 400-500ms: modal dialogues, sheet panels, hero reveals */
  slow: 0.5,
  /** Stagger incremental delay per child */
  stagger: 0.05,
} as const;

// ── Spring presets ─────────────────────────────────────────────────────────
export const SPRING = {
  /** Micro-interactions: button hover/press, icon toggles */
  micro: { type: "spring" as const, stiffness: 400, damping: 15 },
  /** Smooth: card lifts, list items, tooltips */
  smooth: { type: "spring" as const, stiffness: 300, damping: 20 },
  /** Modal dialogs & popover panels */
  modal: { type: "spring" as const, duration: 0.4, bounce: 0.25 },
  /** Quick confirmation dialogs (smaller, faster) */
  confirm: { type: "spring" as const, duration: 0.35, bounce: 0.2 },
  /** Page-level spring transitions */
  page: { type: "spring" as const, stiffness: 280, damping: 25, mass: 0.8 },
} as const;

// ── Variant presets (for staggerChildren / whileInView) ────────────────────

/** Standard fade-in-up entrance variant */
export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

/** Lighter fade-in (small vertical offset) */
export const fadeUpSmall = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

/** Scale-in variant for modals and dialogs */
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

/** Stagger container — wraps children with staggered entrance */
export function staggerContainer(delay: number = DURATION.stagger) {
  return {
    visible: { transition: { staggerChildren: delay } },
  };
}

/** Slide-in from left variant (sidebar menus, drawers) */
export const slideLeft = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

/** Slide-in from right variant (panels, sheets) */
export const slideRight = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
};

/** Scale-up variant (cards popping in) */
export const cardPop = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

/** Dialog / modal backdrop fade */
export const backdropFade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Collapse/expand for sidebars and panels */
export const collapseExpand = {
  collapsed: { width: 64, opacity: 1 },
  expanded: { width: 224, opacity: 1 },
};

// ── Transition factories ───────────────────────────────────────────────────

/** Standard entrance transition */
export function enterTransition(delay: number = 0) {
  return { duration: DURATION.standard, ease: EASE_OUT, delay };
}

/** Entrance with spring (for dialogs, cards) */
export function springEnter(delay: number = 0) {
  return { ...SPRING.modal, delay };
}

/** Page exit transition */
export function exitTransition() {
  return { duration: DURATION.fast, ease: EASE_OUT };
}

/** Spring for sidebar collapse/expand */
export function sidebarSpring() {
  return { type: "spring" as const, stiffness: 280, damping: 22, mass: 0.6 };
}

/** Staggered entrance for grid items */
export function staggerItem(delay: number) {
  return { duration: DURATION.standard, ease: EASE_OUT, delay };
}

/** Hover lift transition for cards */
export function hoverLift() {
  return { duration: 0.15, ease: EASE_OUT };
}
