# NaviSync Landing Page Full Redesign

**Date:** 2026-09-17
**Status:** Approved for implementation

## Goal

Improve only the public NaviSync landing page so a first-time PLV student, visitor, or staff member understands the product quickly, sees a believable campus-navigation preview, and reaches the interactive map without navigating through a long marketing page.

The redesign keeps the PLV navy and gold identity, the existing map route, and the current interactive feature demos. It makes the first screen more useful by pairing the message with a compact visual map preview instead of relying on decorative motion alone.

## Approved direction

- Use a responsive split hero: concise value proposition and primary map CTA on the left, a static-but-lively campus map preview on the right.
- Keep the PLV seal and NaviSync name prominent, but reduce competing ambient effects so the copy and preview carry the hierarchy.
- Add a small trust/status row in the hero that communicates campus coverage, wayfinding, and accessibility support without inventing live data.
- Preserve the single interactive “How NaviSync Helps You” tour, including search, directions, accessible routes, and issue reporting. Improve its framing and visual rhythm rather than adding another feature grid.
- Keep a compact capability section with clear, scannable cards that explain the practical outcomes of using NaviSync.
- End with one focused CTA to `/map`; official campus information remains in the shared footer.

## Information architecture

The landing page renders in this order:

1. Split hero with campus map preview, primary map CTA, secondary in-page feature cue, and compact trust row.
2. Interactive feature tour with one active demo panel.
3. Capability cards focused on finding places, planning routes, and moving accessibly.
4. Final map CTA, followed by the shared footer.

The page does not add announcements, events, authentication, or new navigation destinations. Existing links and the `landing-feature-tour` anchor remain stable.

## Visual system

- Palette: PLV navy foundation, warm gold accent, blue route highlights, and quiet off-white surfaces.
- Layout: generous horizontal composition on desktop, single-column stacking on small screens, with no sideways scrolling.
- Shape language: rounded map panels and route chips, but no repeated equal-height glass cards.
- Map preview: CSS/SVG geometry only, so it stays deterministic, fast, and available without network images.
- Motion: keep route drawing and small entrance transitions; reduce or remove ambient motion when `prefers-reduced-motion` is enabled.

## Accessibility and responsive behavior

- Keep the existing semantic headings, links, and disclosure controls.
- The map preview is decorative and has an accessible text summary beside it; it must not be the only way to understand the hero.
- Hero actions remain visible and usable at mobile widths, with touch targets at least 44px high.
- Feature controls stay stacked on mobile and continue to expose `aria-expanded` and `aria-controls`.
- Avoid relying on hover for meaning and preserve readable contrast in both light and dark themes.

## Scope guard

Only `src/pages/LandingPage.tsx`, its landing-page interaction tests, and landing-page documentation may change for this work. No map implementation, event workflow, database schema, shared navigation, or backend behavior is part of this redesign.

## Validation

- Run the landing-page interaction tests.
- Run a production build.
- Check the rendered page at desktop and mobile widths, including the interactive tour and CTA links.
- Check reduced-motion behavior and horizontal overflow.
- Review the final diff to confirm unrelated local work remains untouched.
