# Responsive feedback rows and indoor event access — October 6, 2026

## Changes

- Feedback pins in admin review now use compact numbered cards with a clear label, complete wrapping comment, and a small Remove action with trash icon. The action retains a ≥44px touch target and its existing accessible label. Removal stays local to the review draft, respects in-flight decisions and uses the latest feedback state.
- Event map is available after normal building entry and on each floor, as well as on the outdoor campus map. Opening it preserves the chosen All/Ongoing/Upcoming filter, starts from the event list and does not automatically place event assets on the regular map.
- The floor picker remains available with the event panel open. Manual floor changes clear the previous event-location highlight instead of labeling an unrelated floor as Viewing. A separate Campus map return action works while normal search is replaced by the event panel.
- Mobile Event map and floor buttons have separate positions. Event-mode floor navigation is at the top, with a downward-opening floor menu. Desktop event-mode floor selection moves to the opposite side of the panel.
- Event-mode mobile utility controls sit below the account control; short landscape uses a horizontal utility row and reserves enough space above the event sheet. Active directions/navigation still takes foreground as in the existing workflow.

## Browser checklist

Runner: [run-event-access-ui.mjs](run-event-access-ui.mjs). Raw final evidence: [event-access-ui.json](evidence/event-access/event-access-ui.json).

| Journey | 1440×900 desktop | 390×844 portrait | 740×390 landscape | 768×1024 tablet |
|---|---|---|---|---|
| Student normal search → Enter Building → open events → Upcoming → change floor → return to campus → close events | PASS | PASS | PASS | PASS |
| Admin feedback rows: full long comment, compact action, viewport bounds and keyboard removal | PASS | PASS | PASS | PASS |

- [x] Indoor event entry and floor picker do not overlap.
- [x] Event panel, floor picker and campus return are within the viewport and separated.
- [x] Mobile profile, Directions, QR and Recenter controls do not cover each other or the event panel.
- [x] Floor menu stays within the viewport; filters remain selected through floor and campus navigation.
- [x] Normal building entry and closing event mode show the regular map without event assets.
- [x] Feedback rows wrap long words, keep complete comments and do not overflow horizontally; Remove is ≤14px text, compact in width, and touch-friendly. Enter removes exactly one intended pin.
- [x] Final browser **8/8 PASS**, no page errors or unexpected mutation attempts; existing sample unchanged, zero retained fixtures.

Student journeys used the actual published campus and existing student event feed. The existing `TEST upcoming` was visible under Upcoming during indoor browsing. Admin review used an intercepted pending proposal GET response with short and long feedback; no review decision or database mutation was sent. Its local draft was discarded between cases.

Inspected screenshots: [admin desktop](evidence/event-access/admin-feedback-desktop.png), [admin portrait](evidence/event-access/admin-feedback-portrait.png), [normal indoor portrait](evidence/event-access/student-indoor-portrait.png), [indoor filters portrait](evidence/event-access/student-filter-floor-portrait.png), [indoor filters landscape](evidence/event-access/student-filter-floor-landscape.png), [tablet](evidence/event-access/student-filter-floor-tablet.png).

The normal-indoor regression first failed because Open event map was absent. Screenshot review then found an existing mobile account/Directions overlap; new browser bounds assertions failed before the spacing correction and passed afterwards.

## Regression checks and scope

- **72 tests PASS across five affected suites**, exit 0: campus map navigation, student controls, event panel, admin review/recovery and feedback-pin rows.
- Final production build PASS, exit 0; [build log](event-access-build.txt). Existing large-chunk advisory remains.
- `git diff --check` PASS. Non-failing existing jsdom scroll and async-act warnings remain in test output; the actual browser run had no page errors.
- No SQL, new account, commit, push or deployment. Physical phone hardware/native keyboards and the original wider acceptance gaps are outside this focused pass.
