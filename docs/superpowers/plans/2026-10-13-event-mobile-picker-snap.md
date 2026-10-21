# Mobile event picker and Snap plan

Execute inline using executing-plans. User requests fixes for the mobile native item dropdown and toolbar, functional Snap and an explanation. The latest UI/UX instruction reinforces that scope; the separate overall-event-flow suggestions are not being implemented here.

Keep the current PLV navy/light/dark design and asset sizing. Replace the native selected-object dropdown with a searchable, viewport-contained dialog, icons and item state. Selecting closes the picker; Details is explicit. On phones show six tools in a three-column grid and keep Snap on/off visible outside the toolbar scroll. Keep touch targets, focus return, keyboard search, empty state and a useful map area.

Snap is shared across views. Furniture placement/movement attracts to nearby grid lines and item edges/centers; labels use grid anchors; rotation uses 15-degree steps; eligible resizing uses grid increments. Turning Snap off allows free geometry. Protected access and boundary constraints always take priority. Numeric inspector values remain explicit user inputs.

- [x] Add meaningful failing mobile picker and label Snap regressions.
- [x] Implement searchable object selection and responsive controls, with clear Snap state.
- [x] Fix label preview/commit snapping and 2D rotation/resize parity; check existing furniture Snap and group movement.
- [x] Run affected unit/native browser checks at phone/desktop sizes, camera retention, save and public map checks; build and independent read-only review.
- [x] Deliver through authorized main workflow and explain Snap with an example. No SQL or live data writes.
