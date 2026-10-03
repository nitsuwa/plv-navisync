# Event editor UI/UX polish — approved scope

Date: 2026-10-02

This records the event-editor improvements discussed with the user and accepted for implementation planning. It describes the intended result, not completed work.

## Outcome

Make creating and plotting an event easier on desktop and mobile while preserving the existing event workflow and the published campus map. Keep the PLV NaviSync theme and existing assets. Changes primarily affect `/student/events/:id/edit`; event creation and read-only previews receive compatibility checks.

## Design decisions

1. **Stable quick assets.** The collapsed event picker always shows Chair, Table, Booth, Stage in that order. Selecting Table highlights Table without moving any button. An active asset outside that set is identified in the picker header. The quick row is called **Quick assets**, not Recently used. Do not add a new history or favorites feature.
2. **One compact placement dock.** Combine quick assets, Browse assets, placement status, repeat placement, and **Layouts** in one surface. Layouts creates new preset furniture; **Arrange selection** operates on existing selected furniture. Use a solid theme surface, one subtle shadow, and one selected border/check. Keep keyboard focus outlines distinct from selection.
3. **Assets look like furniture.** Render existing asset artwork without a white rectangular sticker behind every object. Selection must not change the object's stacking order. Render selection outlines/rotation controls in a separate overlay above the artwork. Preserve existing dimensions and all persisted attributes.
4. **Predictable placement.** Show a ghost at the candidate location before adding furniture. Use the same calculated position for preview and commit. Offer Place multiple, enabled initially to preserve the current repeated-placement workflow. Escape/Cancel removes an uncommitted preview. Invalid placement explains the actual issue. Undo reverses one committed placement or an entire preset batch.
5. **Useful layouts.** Retain all five presets. Improve the chair layout with total chairs, chairs per row, separate horizontal and vertical clear gaps, optional center aisle, and orientation. Show row count and a partial last row before placement. Preserve fixed asset sizes; spacing and count do not resize chairs. Capacity means map fit only, never certified real-world occupancy.
6. **Clear selection actions.** Show compact actions only for the current selection. Keep name, rotation, lock and main actions readily available; put coordinates and layer controls in an expandable Advanced section of Details. Object-list search, rename, visibility and layer actions remain available. Alignment and row/column distribution retain their current geometric semantics.
7. **More canvas space.** Desktop locations can collapse. A mobile Locations control opens a themed sheet rather than showing a tall permanent location rail. Location names wrap in the expanded list, retaining authored floor labels. Reduce duplicate editor controls and combine the checks indicator with the tool strip while preserving the checks panel.
8. **Clear state and navigation.** Keep event workflow status separate from save state. Retain Back, Save Draft, the existing review-before-submit dialog, unsaved-change protection and autosave. Label the submission entry point **Review & submit**; final confirmation still submits to GSO. Fit map and Focus selection are separate viewport actions.
9. **Mobile and tutorial continuity.** Assets, layouts, locations and details use theme-matched sheets with close controls, focus restoration and safe-area padding. In touch placement mode, tap to position a preview and press Place here. A selected item also offers Move here as an alternative to dragging. Normal pinch and pan behavior must continue. Update the existing tour copy and spotlight targets to match visible controls.

## What stays unchanged

- Published campus/floor geometry, navigation routes, event location references, overlay data format and asset identities.
- Legacy furniture dimensions. New chairs remain the existing 16 × 16 map units.
- Student-org creation fields: admin retains ownership of event dates and publication scheduling.
- Admin approval/publication, student event visibility, and the student navigation overlay behavior.
- Authentication, demo account autofill, environment files, development command and backend connection.

## Boundaries

No database migrations, new dependencies, global theme redesign, auth changes, new graphics, export feature, calibrated capacity, favorites/history subsystem, persistent viewport subsystem, or generalized canvas engine rewrite. Improve map readability through cleaner editor chrome and selection rendering; do not fade away entrances, remove campus objects, or modify shared map artwork.

## Acceptance

The linked implementation plan defines functional tests, browser checks, and the report needed for final review. Passing unit tests alone does not establish responsive visual quality. Unrun database or browser checks must be reported honestly, without substituting mocked UI evidence for live verification.

Implementation plan: [Event editor UI/UX polish for Luna Max](../plans/2026-10-02-event-editor-uiux-polish-luna-max.md).
