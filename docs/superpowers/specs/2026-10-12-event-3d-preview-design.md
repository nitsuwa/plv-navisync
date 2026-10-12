# Event plotting and review in 3D

The user approved 2D plotting with a synchronized 3D preview as the first phase. Implement this locally and report the result and follow-up; do not publish or change the live database as part of this task.

## Behavior

- EventFloorEditor offers 2D and 3D views in editable and read-only/admin modes, including compact dialogs.
- 2D remains the editing surface. Switching views commits an active gesture or pending label edit and preserves layout and viewport state. The preview adds no save/submit request; existing parent autosave still persists draft edits normally.
- 3D displays the same live furniture and labels on the published indoor floor or outdoor campus, without editing the base map.
- Event assets retain their exact plotted footprint, rotation, visibility and color. All 14 current event asset types have a model, including chairs, tents, booths and stages.
- Preview controls support orbit/pan/zoom, fit map, and focus event items. Models are lazy loaded, use existing renderers and demand rendering, and offer return to 2D if 3D is unavailable or fails.
- Admin pin placement remains in 2D. Starting pin placement returns to 2D and disables the 3D switch while placing a pin.
- Approved event assets use the same model layer on the existing public indoor/outdoor 3D map. Existing publication/access filtering remains the source of the selected layout.

## Data and limits

Reuse eventFurniture/eventLabels and authored map coordinates. No schema, migration, new runtime dependency or additional database fetch is needed. Asset heights are illustrative presentation defaults; map units are not claimed to be certified physical measurements. Full 3D editing, first-person walking, exports and capacity estimates are later phases.

## Verification

Test indoor/outdoor coordinate transforms, rotated bounds, asset visibility and invalid geometry, camera fit, unsaved draft persistence across views, read-only behavior and pin-placement gating. Run existing event/admin/public-map tests and a production build. Visually inspect a disposable local fixture in indoor/outdoor, desktop/mobile and unsupported-device states; never create or modify a live event for verification.
