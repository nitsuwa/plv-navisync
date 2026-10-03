# NaviSync Landing Page Interactive Tour Design

**Date:** 2026-09-14  
**Status:** Approved for implementation

## Goal

Shorten the public NaviSync landing page so a first-time visitor can understand the campus navigator quickly, preview real system capabilities, and reach the map without wading through a long feature page.

The visual direction keeps the existing dark navy and gold PLV identity. The interface should feel trustworthy and campus-specific, with motion and glassmorphism used as supporting details rather than as decoration that competes with the content.

## Approved direction

- Compact hero with the existing PLV seal, NaviSync message, map CTA, and an in-page scroll cue.
- One interactive “How NaviSync Helps You” tour that previews search, directions, accessible routes, and issue reporting.
- Desktop feature selector presented as a vertical control beside one active preview panel.
- Mobile feature selector presented as a vertical disclosure/accordion. The active preview sits below the selector, so no horizontal scrolling is required.
- A compact capability strip for finding places, getting directions, and choosing accessible routes instead of several long feature grids.
- One clear final map CTA, with official campus information kept in the shared footer.

The public landing page does not include announcements or campus events. Those workflows remain available in their dedicated application pages, but they are not part of this landing-page experience. The final CTA stays focused on opening the map; official campus contact information is owned by the footer so it is not duplicated.

## Mobile behavior

The landing page must not require sideways scrolling. Feature controls are full-width buttons stacked vertically, each with `aria-expanded` and `aria-controls`. Selecting a control replaces the single preview panel below the controls. Only the active demo is mounted, keeping the interaction understandable and avoiding unnecessary timers on mobile.

The page root continues to use `overflow-x-hidden` as a guard, but layout correctness must come from the responsive grid and stacked controls rather than from clipping an overflowing tab row.

## Motion and glassmorphism

Animation is limited to meaningful transitions:

- Hero entrance, route-line movement, ambient glow, and subtle parallax remain part of the PLV/NaviSync identity.
- The active feature panel crossfades and moves a few pixels when the selected scenario changes.
- Compact scenario cards and the contact block reveal on scroll and lift slightly on hover where appropriate.
- `prefers-reduced-motion` must disable or minimize movement and preserve readable state changes.

Glassmorphism is reserved for the active feature preview and the campus information block. Each glass surface uses a translucent layer, visible border, backdrop blur, and highlight/shadow treatment; the underlying card/background color remains legible as a fallback when blur is unavailable.

## Information architecture

The rendered page order is:

1. Compact hero with scroll cue.
2. Interactive feature tour with the single straight building-to-building route demo.
3. Capability strip.
4. Final map CTA, followed by the official-information footer.

The existing navigation labels, route paths, PLV logo treatment, and map/help destinations remain stable.

## Official campus information

The footer must show these exact official values:

- **Address:** Maysan Road corner Tongco Street, Barangay Maysan, Valenzuela City, 1440 Metro Manila
- **Registrar Email:** `registrarsoffice@plv.edu.ph`, linked with `mailto:registrarsoffice@plv.edu.ph`
- **Established:** 2002
- **Main Maysan campus inaugurated:** January 19, 2018

The block is intentionally compact so it improves trust and discoverability without creating another long section.

## Validation

- Vitest regression tests verify disclosure state changes, absence of the removed long-page headings, and the official contact details.
- TypeScript diagnostics are checked for the changed landing-page files.
- Vite production build must complete successfully.
- Responsive inspection confirms the feature selector is stacked on mobile and does not create horizontal overflow.
