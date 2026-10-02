# Event Canvas Viewport UX Design

## Goal

Make Student Event Builder feel like a predictable Visio-style workspace: the
selected floor opens centered on its actual authored content, Space-drag never
overshoots, and scrolling has deliberate pan/zoom semantics with gradual zoom.

## Approved interaction model

- Normal mouse-wheel input pans the canvas. `Shift` turns a vertical wheel into
  horizontal pan when the device does not provide `deltaX`.
- `Ctrl`/`Cmd` + wheel zooms around the cursor with an exponential, small step;
  the pointer stays over the same authored point while zoom changes.
- Space + drag, middle-mouse drag, and the explicit Pan tool use one shared
  clamped pan path. Releasing Space returns to the active tool and never moves
  an event item.
- Zoom controls expose fit-to-content, zoom out, current percentage, and zoom
  in. Fit-to-content is also used when the location changes and after a resize.
- Text fields and dialogs keep normal Space and wheel behavior; the canvas
  prevents page scrolling only while it owns an active pan/zoom gesture.

## View framing

The initial frame uses visible floor-plan geometry plus event additions, not
only the raw canvas dimensions. If a floor has no geometry, the full authored
canvas is used. The frame is padded, centered, and clamped to the workspace so
the user can inspect the whole authored map without landing in a blank corner.
Switching locations resets the frame exactly once for the new floor; ordinary
event edits do not reset the user's view.

## Implementation boundaries

- Add pure viewport helpers for content bounds, wheel normalization, smooth
  zoom targets, fit state, and bounded pan deltas.
- Keep the existing event-overlay persistence boundary and legacy furniture
  data untouched.
- Keep map-builder viewport behavior unchanged in this pass; its existing
  controls are shared only where they already use the generic viewport math.
- Add a small, responsive viewport control cluster without changing global
  navigation or public-page styles.

## Verification

Pure tests cover wheel normalization, gradual zoom, fit framing, and content
bounds. Event editor tests cover wheel pan vs modifier zoom, cursor anchoring,
location-change refit, Space drag clamping, and viewport controls. The focused
suite and production build must pass; existing unrelated baseline errors are
reported separately.
