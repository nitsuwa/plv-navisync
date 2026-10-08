# Event clarity — first batch

Implemented October 7–8, 2026, Asia/Manila. First batch is complete in the local working tree; the broader manual checklist remains a separate workstream.

## Delivered behavior

- Admin bell shows actionable pending-submission notices, with a red unread count. Event Layouts navigation shows the separate pending-review count in desktop, collapsed sidebar, and mobile drawer.
- A shared store polls saved backend events every 15 seconds while visible and refreshes on focus. Reading one displayed revision does not acknowledge another event or a newer update. Drafts do not produce submission notices; pending map updates refresh one notice per event.
- Opening the bell does not mark submissions read. Exact review links wait for the actual review to render and pass through the existing unsaved-work guard. Unavailable targets keep their unread state and offer retry guidance.
- Public pins show venue/floor labels and a neutral, explicit shared-event count. Selected events scope the marker layer to their own venues. Venue inspection uses the existing desktop panel/mobile sheet with event title, organizer, start/end, phase, and explicit floor choices.
- Pin hit areas cover the gap between the icon and label; building labels sit above the icon so entrance controls remain available. Keyboard/pointer focus uses a circle cue instead of a large rectangular outline.
- Admin pin feedback explicitly remains an unsent review draft until the review decision. Approved admin/org cards and publication management separately explain Published, Scheduled, Unpublished, Ended, or unavailable timing.

## Verification

| Check | Result |
|---|---|
| Regression run | 21 files / 148 tests passed |
| Final affected tests, including unavailable-target regression | 6 files / 34 tests passed |
| Rendered browser UI | 35 checks passed; desktop 1440×900, mobile 390×844 and 360×640 |
| Browser page errors | 0 |
| Event/database mutation attempts in browser run | 0 |
| Production build | Passed after the final notification wording change; 3,019 modules transformed |
| TypeScript comparison against HEAD | 1,013 diagnostics at HEAD and 1,013 locally; no additional diagnostics by file/code count |
| Independent source review | No remaining important findings after slow-queue receipt and unsaved-navigation fixes |

The unavailable-target regression was first run red: a failed fetch incorrectly claimed that the submission was no longer pending. It now provides fetch/retry guidance without acknowledging the event. Other red/green regressions covered delayed review rendering, unsaved-work navigation, and notice ordering by the latest submission/edit time.

Screenshot review also caught the mobile notification popup extending past the left edge, which a document-scroll-width check missed. The browser runner now checks the complete popup bounds; the corrected responsive positioning passed the full run.

See [browser results](evidence/results.json), [type comparison](type-comparison.json), [mobile notifications](evidence/04-admin-notifications-mobile.png), [desktop venue details](evidence/09-student-venue-1440.png), and [small mobile venue details](evidence/09-student-venue-360.png).

## Limits and next batch

- Browser verification used real demo sign-ins and controlled HTTP responses on the actual rendered app. A second published floor was supplied only in the controlled snapshot where the live base lacked one. These checks do not claim a second live published floor or a new live event.
- No event was created, reviewed, published, deleted, or otherwise changed in the database for this batch. The previously retained approved QA record was read as a fixture base and remains unaffected.
- Admin receipts persist per account in the current browser. Cross-device read-status sync requires a later server-backed receipt design.
- The existing `/rest/v1/admin_activity_preferences` endpoint returned six 404 responses during the full run. The new submission feed remains usable independently of the generic activity feed. Backend endpoint repair belongs in the next batch.
- The repository-wide TypeScript command still fails on its existing diagnostic baseline. The comparison checks diagnostic multiplicities per file/code and ignores shifted lines and native union-description ordering; it is not a clean typecheck claim.
- Production build retains the existing large-chunk warnings. Bundle performance, physical-device touch/software keyboard, dark/reduced-motion combinations, disapprove/revise/resubmit, and publication clock boundaries remain separate checks in the broader manual checklist.
- Changes are left in the local working tree for review. No commit, push, migration, deployment, or base-map modification is included in this batch.
