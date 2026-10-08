# Event Sync and Workflow Verification — Next Batch

**Approved scope:** Backend 404 cleanup, cross-device read-status sync, loading/motion clarity, and remaining revision/clock checks. User said “Do it now” on October 8, 2026 (Asia/Manila).

**Execution:** Inline in the current checkout. Existing dirty work is part of the app under test and must be preserved. No push, schema-wide rewrite, retained QA event, or event-content modification is needed for this batch.

## 1. Private server receipt and activity repair

- [ ] Restore the existing `admin_activity_preferences` contract additively and expose a guarded cutoff getter to avoid direct absent-table polling.
- [ ] Add `event_notification_receipts`, keyed by authenticated viewer/event/stream, with own-row SELECT and no direct client writes.
- [ ] Add `get_event_notification_states(p_expected_user_id, p_stream, p_candidates)` and `ack_event_notification(p_expected_user_id, p_stream, p_event_id, p_payload)`.
- [ ] Validate identity, current role, event ownership/eligibility, and the exact displayed semantic payload before writing a receipt. Store a compact server-derived SHA-256 fingerprint; avoid putting receipts in JWT user metadata.
- [ ] Validate the full SQL in isolated Postgres, including denied anonymous/student/foreign-org access, account changes, stale payloads, new-review unread state, and preservation of event/base-map data.

Admin payload is `[submittedAt or empty string, lastEditedAt or empty string, numeric revision or 0]`. Org payload is `[submittedAt or null, review status, adminComment or empty string, locationFeedback object]`; JSONB object equality avoids client/server key-order differences. Server reads are scoped to supplied candidates and authenticated actor; ordinary students cannot access either private stream.

## 2. Frontend receipt integration

- [ ] Implement `eventNotificationService` around the typed RPC contract and convert existing local fingerprints into structural payloads.
- [ ] Make server states authoritative for Admin and Org stores; sync on foreground polling/focus and after acknowledgement. Do not clear a newer update using an older displayed card.
- [ ] Keep existing browser receipts only as migration/offline cache. Surface pending/offline/schema-unavailable state honestly and provide an explicit retry.
- [ ] Make Org acknowledgement asynchronous at its consumers; prevent duplicate acknowledgement writes and handle account teardown/out-of-order refreshes.
- [ ] Add test-first regressions for two independent browser/device stores, race/stale versions, failed acknowledgement, and isolated identities.

## 3. Loading, motion, revision and clocks

- [ ] Show action-specific Approving, Requesting changes, Publishing, Scheduling and Unpublishing indicators; preserve unrelated button labels and disable repeated effective mutations.
- [ ] Use short existing-style transitions with reduced-motion support for relevant event panels/dialogs. Preserve cached list content on background refresh failure with visible retry.
- [ ] Test disapprove → Org read feedback → address pins → revise → resubmit → Admin current-revision review, including retained inputs on failure and stale-decision protection.
- [ ] Test scheduled-publication, start and end boundaries using controlled server clocks, including count/filter/overlay dismissal without reload and Asia/Manila display.
- [ ] Capture desktop/mobile browser evidence, including reduced motion and deferred/failing requests. Mark physical-device tests separately.

## 4. Deployment and completion

- [x] Built and locally validated one additive SQL Editor bundle; user applied it successfully.
- [x] Verified hosted RPC/table installation and role gates (10 PASS), actual Org read sync (10 PASS), then real Admin submission/badge sync (19 PASS) across independent desktop/mobile contexts. User-authorized temporary submission withdrawn/deleted afterward. Archived event filtering fixed (two RED/GREEN regressions,65 affected PASS).
- [x] Ran affected tests, production build, diff checks and independent review; preserved TypeScript baseline with zero added diagnostics.
- [x] Recorded installed-vs-controlled evidence and remaining limits in the verification README. No new event created or published in deployment verification.
