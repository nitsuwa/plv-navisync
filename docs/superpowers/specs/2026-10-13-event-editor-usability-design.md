# Event editor usability and map fidelity

The user requests fixes to 3D asset proportions, the asset selector, placement clarity and persistence across 2D/3D, and differences between the public student floor and event editor. Implement within the existing event workflow and established visual language.

Use the shared published floor geometry. Preserve authored coordinates and all existing saved draft footprints. Render base-floor SVG details outside the nominal indoor canvas and fit the complete scene, including exterior stairs. Editing boundaries remain the authored canvas; showing an exterior detail does not authorize editing the base map. Include building-owned exterior-stair presentation metadata where needed.

Make placement direct: choose an asset, then click/tap the map to add one valid item. Hover is a translucent preview, never a saved item. Escape cancels placement. Keep a keyboard-accessible Place here alternative and explicit success/invalid-position feedback. Update committed layout refs synchronously so location capture/save cannot read the preceding layout while React effects are pending. Verify the actual page coordinator, not only the standalone editor.

Replace the wide native asset dropdown with a compact searchable catalog using existing SVG asset artwork, grouped into furniture, staging, equipment and access. Selection and placement tools use the established navy/white/light-gray UI with existing Plus Jakarta Sans, 44px touch targets and visible keyboard focus. The map gets a bounded, isolated stacking context; map labels cannot cover editor controls. Hide nonfunctional entrance navigation actions in the event planning scene. Numeric geometry fields stay available through a concise selection inspector; no new design system or dependency.

Model heights are stable per asset type rather than increasing with footprint width/depth. Refine seating, tabletop/legs, tent roof, speakers and equipment materials with existing Three.js primitives. Preserve existing event color accents, rotations and footprint sizes. These are illustrative models in existing map units, not a calibrated physical inventory.

Verify indoor/outdoor, irregular/outside-canvas floor details, multi-location save/reopen and autosave, touch cancellation, dark/light themes, mobile, readonly admin, protected access and graphics fallback. No live user-event edits or SQL are needed for verification. Use isolated local fixtures and a read-only published-map snapshot if available. Commit/push only after relevant verification and review; preserve unrelated local files.
