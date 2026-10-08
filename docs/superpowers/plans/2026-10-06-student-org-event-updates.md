# Student Org Event Update Badges Implementation Plan

**Goal:** Show an unread My Events count and a targeted card marker when a Student Org layout receives approval, disapproval or changed GSO feedback, on desktop and mobile.

**Architecture:** Reuse the authenticated owner-filtered event-overlay read service. A shared subscribed hook supplies Navbar, mobile navigation and My Events from one polling source; per-account/per-layout browser read receipts identify the exact GSO update that was acknowledged. Draft/pending owner edits and feedback acknowledgments do not generate review notices. Existing reviewed layouts without a receipt are unread until that layout is explicitly read.

**Tech Stack:** React, TypeScript, existing Supabase reads, localStorage, Vitest, Playwright/installed Edge.

## Constraints

- Preserve all existing work. No SQL, account creation, commit, push or deployment.
- Existing accounts only; browser review changes use controlled responses and leave no retained QA event.
- Count unread layouts once each. Do not clear all notices merely by visiting My Events.
- Mark only the displayed update as read; a newer update arriving concurrently must remain unread.
- Read receipts survive reload in the same browser/account and synchronize between tabs. Cross-device receipts are outside this client-side feature.
- Refresh promptly on focus/visibility and poll visible sessions every 15 seconds. Never expose another owner's events or old account responses.

## Tasks

- [x] Write failing detection/read-receipt tests: verdicts, changed comments/location feedback, repeat review after resubmission, owner edits, per-layout read, account isolation and malformed/unavailable storage.
- [x] Implement focused review fingerprints and scoped receipts in `src/lib/studentEventUpdates.ts`.
- [x] Write failing shared-hook tests; implement one owner-scoped subscription/polling source in `src/hooks/useStudentOrgEventUpdates.ts`, including race protection and subscription cleanup.
- [x] Add consistent red unread badges to desktop My Events and mobile Events links. Show per-card New GSO update and a keyboard/touch-accessible Mark as read action; preserve existing CRUD flows and read notices when opening the corresponding maps.
- [x] Use the shared source in My Events so status/comments update without manual reload. Keep fetch errors retryable.
- [x] Actual browser tests on desktop, portrait and landscape: admin-update responses, only affected card unread, navbar/mobile count, per-card read, reload persistence, later feedback re-notification, no unrelated owner data and no duplicate read requests.
- [x] Run affected regression suites and production build; update the companion checklist with exact evidence and limits.
