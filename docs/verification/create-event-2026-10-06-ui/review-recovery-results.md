# Admin review pin reload recovery — October 6, 2026

## Confirmed cause and correction

The user confirmed the missing pin had a comment and had already been added using Save pin. That action previously staged feedback only in the parent review's React state. Returning from the nested preview preserved that state, but reloading the app discarded it before an approve/disapprove decision was submitted.

The review now persists a local draft containing saved feedback pins, location comments, admin comment, occurrence dates/times and publication choices. Writes happen during the layout commit, before the updated review is painted; there is no debounce window after Save pin. Reopening the same proposal after reload restores the draft.

The UI explicitly says **Review draft saved on this browser** and explains that Approve or Disapprove sends it to the organization. The same notice appears in the map-preview description. This is browser-local recovery, not a server review decision or cross-device synchronization. A positioned pin without Save pin remains an unconfirmed preview draft.

## Recovery and cleanup rules

- Storage is scoped by authenticated admin ID and proposal ID. The modal also remounts if its admin identity changes.
- Recovery requires the same pending proposal `updatedAt`, submission timestamp and revision. A changed submission produces visible guidance and does not apply old coordinates. Unchanged drafts have no arbitrary expiration deadline.
- Corrupt data is ignored with guidance. Failed storage writes show a warning, retain the current review in memory and do not claim durable recovery.
- Explicit Discard review clears the local draft. Removing newly added feedback prevents it from returning after reload.
- A failed review request retains the draft for retry. An acknowledged server decision clears it before refreshing the queue, so an immediate reload cannot race the later queue refresh. Review controls are disabled while the decision is in flight.
- Pins that were already lost before this correction cannot be reconstructed from the previous in-memory state; they need to be added again once.

## Actual browser checklist

Runner: [run-review-recovery.mjs](run-review-recovery.mjs). Final evidence: [review-recovery.json](evidence/review-recovery/review-recovery.json).

- [x] Two actual UI-added pins on Grounds and floor survive reload with identical IDs, comments and world coordinates. Admin comment and selected event/publication schedule also recover.
- [x] Portrait 390×844 reload restores the saved pin and shows the local-draft notice.
- [x] Injected review failure preserves pins through another reload; a controlled confirmed decision clears the recovery draft.
- [x] Explicit discard does not restore the removed draft after reload.
- [x] Changed server revision blocks old pin coordinates with visible guidance.

**Final browser run: 5/5 PASS**, no page errors or unexpected mutation attempts. The existing sample metadata and update timestamp remained unchanged. No retained QA record was created. The two simulated decision commands targeted only the in-memory proposal and were intercepted, never sent to the database.

Inspected screenshots: [reloaded Grounds](evidence/review-recovery/reloaded-grounds-desktop.png), [reloaded floor](evidence/review-recovery/reloaded-floor-desktop.png), [reloaded portrait](evidence/review-recovery/reloaded-portrait.png), [stale revision](evidence/review-recovery/stale-review.png).

The browser runner uses the existing admin account, real published map reads, controlled proposal GET responses, and real UI actions. It clears its own local recovery key and closes its isolated context afterwards. Initial attempts were corrected to choose a visible point within the floor's authored bounds; a cleanup timing issue was then reproduced and corrected.

## Regression verification

- Final affected regression run: **153 tests PASS across five suites**, exit 0: draft storage, admin review/publication, preview page, preview focus, and editor. One discard test emits non-failing jsdom/Radix async-act warnings; the actual browser run has no page errors.
- Final production build: **PASS**, exit 0; [build output](review-recovery-build.txt). The existing large-chunk advisory remains.
- This pass requires no SQL, account creation, commit, push or deployment. Physical-phone keyboard/hardware, real database review persistence and the remaining original acceptance matrix are outside this controlled recovery pass.
