# A7 — Operations Service Contracts Verification

Status: `FOR REVIEW` on the existing `A6-A9` branch. A6 remains skipped and `BLOCKED`.

## Delivered

- Live migration history reconciled with the local A5 filename before adding the A7 migration.
- Live-generated Database types include `event_stalls`, `recent_destinations`, and the two A7 RPCs.
- Typed report/report-history services, atomic status history/audit updates, and private report-image uploads at `{report_id}/{uuid}.{ext}`.
- Typed event locations/stalls, scheduling and expired-event visibility; typed announcement mappings and temporary closure records.
- Server-synced student favorites and recent destinations, with device-local fallback for legacy mock IDs.
- Atomic system-settings writes, activity-log reads, dashboard summaries, and existing selected CSV/JSON exports.
- Storage bucket enforcement: private, 8 MB maximum, JPEG/PNG/WebP only.

The intentionally callable helpers `campus_is_published`, `is_published_floor_plan`, and `is_admin` expose boolean predicates used by RLS/Storage policies and no private row data. Privileged `admin_update_profile` and `publish_campus_version` remain authenticated entry points with administrator checks inside their bodies. Trigger-only integrity helpers and A7 administrative RPCs have explicit restricted execution grants.

## Automated verification

- `vitest run`: PASS — 26 files, 210 tests.
- `vite build`: PASS.
- `node scripts/verify-a7-operations.mjs`: PASS using controlled, cleaned-up fixtures for guest/student/admin RLS, private Storage, report history, active/expired stalls, mapped closures, favorites, recents, and settings.
- Live migration list: PASS — A5 `20260806114459` and A7 `20260807074958` match local filenames.
- Supabase security/performance advisors rerun. No new A7 access-control defect was reported. Remaining security notices are the documented callable predicate/privileged functions above plus the deployment-dashboard leaked-password setting; performance notices are advisory baseline indexes/policy-overlap opportunities.

## Manual review checklist

1. As student, submit a report with a JPEG/PNG/WebP image under 8 MB and confirm it appears in report history.
2. Confirm an unsupported image type or image over 8 MB is rejected clearly.
3. Save/unsave a published building, calculate a route, refresh, and confirm favorites/recents persist.
4. As admin, move a report through statuses and confirm history, notes, and archive behavior.
5. Create/publish an event with a venue and stall; confirm it appears publicly while active and disappears after expiry.
6. Publish an announcement with a mapped closure; confirm its public visibility and expiry behavior.
7. Save global settings and verify dashboard counts/activity and selected report/map exports.
