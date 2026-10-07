# Student Org GSO-update badges — October 6, 2026

## Behavior

- Desktop My Events and mobile Events show the same red count of unread **layouts**, not pins or repeated polling results. Only Student Org accounts subscribe to their owner-filtered event data.
- Approved/disapproved cards without a matching read receipt display a red border and New GSO update marker. Each card has its own Mark as read action; opening that card's maps also acknowledges the displayed update. Visiting the list alone does not mark everything read.
- Changed GSO comments/location feedback and a new decision after resubmission become unread again. Draft/pending owner actions, generic timestamps, own layout edits, publication timing and addressed-pin notes do not produce false review alerts.
- One shared source supplies desktop navigation, mobile navigation and My Events. It refreshes visible sessions every 15 seconds and on focus/visibility, protects account/request races, and stops polling when no consumers remain.
- Read receipts are per browser, authenticated owner and layout. They survive reload and listen for same-window/cross-tab receipt changes. A blocked store uses a session-only acknowledgment with an explanatory message. A displayed older card cannot acknowledge a newer version already fetched by the source.
- The public navigation wrapper is sticky and uses horizontal clipping that does not create an unintended scroll container. The badge remains visible while scrolling the My Events list on desktop/tablet.

Existing reviewed layouts with no receipt are initially unread; there is no reliable record of whether they were read before this feature existed. The approved/needs-revision status remains visible after acknowledging the update. Local admin review drafts do not notify the Org until feedback is submitted with a confirmed review decision.

## Verification checklist

- [x] Initial detection and shared-hook tests failed before their implementations were introduced.
- [x] Approval/disapproval, changed feedback, repeated review cycles, own-edit exclusions and per-layout/account read isolation verified.
- [x] Shared subscription, focus/poll refresh, late previous-account response, stale-card read protection and storage failure behavior verified.
- [x] Actual browser initial pending state has no badge, one shared owner read and no foreign-owner card.
- [x] Controlled GSO approval updates only card A; disapproval then updates card B. Reading A leaves B unread; reload preserves both states.
- [x] Later GSO feedback re-notifies; generic/own changes do not. A new review cycle is unread even when verdict/comment repeat.
- [x] Portrait 390×844, landscape 740×390 and tablet 768×1024: count, per-card read, reload, touch-size action, horizontal bounds and sticky desktop badge checked.
- [x] Browser **6/6 PASS**, no page errors, unexpected writes or retained fixtures; all existing Org event metadata/update timestamps unchanged.
- [x] Final affected regressions: **44 tests PASS across seven suites**, exit 0 (detection, shared hook, Org page/access/CRUD, desktop navbar, mobile navbar, badge integration, public layout). Cross-tab receipt synchronization and View maps acknowledgment are included.
- [x] Final production build PASS, exit 0; [build log](org-event-updates-build.txt).

Runner and evidence: [run-org-event-updates.mjs](run-org-event-updates.mjs), [raw final results](evidence/org-updates/org-event-updates.json).

Inspected screenshots: [desktop](evidence/org-updates/desktop-unread.png), [portrait](evidence/org-updates/unread-portrait.png), [landscape](evidence/org-updates/unread-landscape.png), [tablet while scrolled](evidence/org-updates/unread-tablet.png).

The browser tests use the existing Org login, real campus reads, controlled owner-event GET responses and real read/reload actions. Simulated verdict/comment changes never update the database; read markers and fake proposal data remain within the isolated browser context, which is closed afterward. No SQL, account creation, commit, push or deployment occurred.

## Limits

- This is an in-app unread indicator, not an email, push or sound notification. Read receipts do not synchronize across different devices/browser profiles.
- First-rollout historical approvals/returns without receipts appear unread until individually acknowledged.
- GSO status changes were simulated in browser responses; no new real approval/rejection fixture was retained. Existing server review/ownership behavior was preserved.
- Physical phone hardware and the wider original acceptance gaps are not claimed complete. The existing production large-chunk advisory remains.
