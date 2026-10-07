# Defects and environment findings — Create Event browser QA, updated October 6, 2026

| ID | Severity | Case | Finding | Status / evidence |
|---|---|---|---|---|
| ENV-01 | Resolved | B00.2 | The October 4 Vite scan reported duplicate `campusHint`/`targetId` declarations and a malformed conditional in `src/pages/CampusMapPage.tsx`. | Rechecked after fast-forward to `4ea2618`: Vite started cleanly and the transformed module returned HTTP 200 without a parser error. Create Event, editor, and admin journeys also loaded. No source change was made in this test pass. |
| UI-01 | Low | B08.1 admin review | With a one-item proposal, the admin review summary displays `Event Furniture 1 items`; singular count should use `1 item`. | Reconfirmed on `4ea2618` in [`feedback-recheck-main/feedback-admin-review.png`](evidence/feedback-recheck-main/feedback-admin-review.png). Disposable proposal was cleaned. Not fixed under the testing/report-only scope. |
| UI-02 | Low | B08.3 student notifications | The same student notification is rendered twice at the same time. Earlier viewport evidence showed duplicate `Submission maps saved` / `Draft saved` messages; this is consistent with two Sonner toaster mounts. | Reconfirmed after the merge in the ordinary 390×844 viewport screenshot [`feedback-full-owner-mobile-addressed.png`](evidence/feedback-full-owner-mobile-addressed.png). The new `feedback-recheck-main/feedback-editor-mobile.png` is a full-page capture and is not counted as additional confirmation. No product code changed in this task. |

The acceptance issue remains open for implementation follow-up. This was a test/report-only task.
