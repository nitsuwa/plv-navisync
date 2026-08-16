# A8 — Cross-System Security and Integration Verification

Status: `ACTIVE` on the existing `A6-A9` branch. The backend/security checkpoint is complete; A8 cannot truthfully move to `FOR REVIEW` until the dependent B6–B9, C4 Phase 2, and C8-C UI packages are merged and retested.

## Delivered checkpoint

- Added a repeatable guest/student/admin matrix covering active and inactive accounts, expired tokens, draft/public isolation, cross-campus associations, cross-user ownership, private reports, Storage, and privileged RPC denial.
- Added `private.is_active_user()`, a non-exposed, fixed-search-path predicate used by RLS and Storage policies. Anonymous roles have neither schema usage nor function execution permission.
- Tightened student-owned profile mutation, reports/history/images, favorites, recent destinations, avatar objects, and report-image objects so an already-issued session immediately loses private access when the profile is deactivated.
- Preserved inactive users' read access to their own profile row so the client can identify the deactivated state, while limiting all other access to guest-equivalent public data.
- Corrected the published campus-image policy to compare `storage.objects.name` with the published campus logo/overview paths. Unreferenced objects in the private bucket remain inaccessible.
- Revalidated student identity with `getUser()` and live profile checks on an interval, focus, and visibility changes, matching the administrator portal's deactivation behavior.
- Moved Student Reports, Favorites, and Settings redirects out of render and prevented their private service queries before active-student authorization resolves.

## Migration

- `20260816094353_enforce_active_account_and_public_image_isolation.sql`

Local and remote migration history match through `20260816094353`.

## Automated and live verification

- `pnpm verify:a8`: PASS with controlled, cleaned-up fixtures and rollback-safe temporary student deactivation/restoration.
- `pnpm verify:a1`, `verify:a2`, `verify:a3`, `verify:a5`, `verify:a6`, and `verify:a7`: PASS after the A8 migration.
- `pnpm test`: PASS — 105 files, 1,417 tests. The existing jsdom canvas-not-implemented diagnostics remain test-environment noise and do not fail suites.
- `pnpm build`: PASS. The existing large Map Builder chunk advisory remains non-blocking.
- `supabase db lint --linked --level warning`: PASS — no schema errors.
- Security Advisor: no errors and no new warning for the private active-user predicate. Remaining warnings are the documented public boolean predicates/internally guarded authenticated admin RPCs and the deployment-level leaked-password setting.
- Performance Advisor: no error. Remaining warnings are the existing multiple-permissive-policy optimization opportunities.
- Browser: guest access to the admin dashboard and private student Reports/Favorites/Settings routes redirects to `/admin`; the corrected checks produce no browser console warnings or errors.

## Confirmed security behavior

1. Deactivating a student does not immediately invalidate the issued Auth identity, but live RLS and Storage policies deny private reads and writes using the current profile state.
2. An inactive student can read only their own inactive profile marker and guest-equivalent published data.
3. Restoring the profile immediately restores ownership-scoped access without replacing the session.
4. Guests and students cannot read draft campuses or draft version snapshots.
5. Cross-campus report/favorite/recent relationships and cross-user records/images are rejected.
6. Expired or invalid access tokens receive HTTP 401.
7. Only Storage paths referenced by a published campus are publicly readable from the private campus-image bucket.

## Remaining dependency-gated verification

- B6 persistence integration against the final authoring UI.
- B7/B9 validation, issue navigation, and save/publish tutorial flows over the A6 contract.
- B8/C4 Phase 2 published-graph routing from the immutable active snapshot.
- C8-C publish/unpublish/archive controls, branding, and remaining admin states.
- Final authenticated browser pass across those merged pages, including permission-denied and stale-session presentation.

These are unresolved integration dependencies, not known critical defects in the current backend/security scope.

## Manual checkpoint checklist

1. As a guest, open `/admin-dashboard`, `/student/reports`, `/student/favorites`, and `/student/settings`; confirm each protected page redirects to `/admin` without a console warning.
2. As an active student, confirm Reports/Favorites/Settings load and private report images remain accessible only to the owner.
3. As admin, deactivate the student while the student tab remains open; refocus the student tab and confirm private navigation is removed without requiring logout.
4. Restore the account and confirm access returns after refocusing.
5. Publish a campus with a logo, confirm guests see that logo, then upload an unreferenced campus image and confirm its direct read is denied.
