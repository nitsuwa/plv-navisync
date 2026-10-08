# Map feedback pins — first increment

Admin review can add numbered map-point comments from its inline read-only preview. Pick a location, click the map, enter a comment, and choose Add feedback pin. Close the preview to review/remove pin comments by location. Pins persist only when the administrator confirms approval or disapproval; closing the review discards the unsaved feedback.

The existing locationFeedback string contract stores a versioned text-plus-pins document. Legacy plain comments remain compatible. Ownership/review permissions and preserved-feedback behavior are unchanged; no new SQL migration is required. Public preview projections do not expose locationFeedback. Pins store map coordinates, not physical distances. Limit: 30 pins per location.

Student My Events displays readable comments rather than the storage encoding. The editor renders pins on the correct location and has a GSO map feedback list: click a comment to center the map on that point. Saved layout revisions preserve review feedback; explicit resubmission uses the existing feedback-clearing/history behavior.

Verification: production build passed, with existing bundle-size warning. Five selected regression suites passed: 22 tests, 108 skipped by the targeted filter. Included legacy/encoded feedback conversion, invalid coordinates, read-only pin rendering/no-save action, preview page, admin review and student dashboard. Final feedback remove controls and active-location preservation were added afterward; live backend persistence, browser visuals, touch positioning and end-to-end review require manual verification. No database writes, deployment or push were performed.

Manual acceptance:
1. Student organization submits a proposal with two locations.
2. Admin opens Review submission → Preview requested maps. Select the second location, click a point and add a comment. Confirm the location stays selected and the furniture has not changed.
3. Close preview. Check the numbered comment under Feedback by location. Remove it and add it again. Enter a general administrator comment and disapprove.
4. Student organization refreshes My Events. Feedback must be readable. Open Revise maps, select the corresponding location, and click its feedback-list comment: map centers on its pin.
5. Edit/save the layout; feedback stays. Resubmit; verify the prior administrator feedback remains in history.
6. Repeat on mobile and dark mode. Confirm pin placement at different zoom/pan settings and preview close returns to the same review.

Later increments: map asset revision highlighting, approved-map revision requests, mobile plotting refinements and publication confirmation. These are not implemented by this feedback-pin increment.
