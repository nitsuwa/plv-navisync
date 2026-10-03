# Event editor interaction refinements

Goal: improve the existing event editor without changing publication, authentication, database, or asset sizing.

- [x] Collapsed locations: replace clipped text with accessible, selectable location icons; retain tutorial target and mobile sheet; animate width with reduced-motion support.
- [x] Checks: keep overlap/building/access/boundary warnings; reduce proximity heuristic from 12 to a footprint-relative threshold capped at 4 map units; exclude chair pairs from proximity hints; do not count informational hints as issues. Test normal seating, genuine overlap, and hints-only summary.
- [x] Back: explicitly confirm even saved drafts; preserve existing capture/save/discard and failed-save guards. Pause autosave while confirmation is open. Test saved Back cancellation and exit, and existing dirty navigation cases.
- [x] Creation: show animated, accessible preparation status while the real create request runs, prevent duplicate submission, retain failure recovery. Add editor entrance transition respecting reduced motion. No artificial delay or fake completion percentage.
- [x] Run targeted event regressions and production build; record results and manual testing instructions. Preserve all existing local edits; no push or database mutation.
