# Developer 1 A5 Verification Evidence

Verified against the shared Supabase development project `plv-navisync-dev` (`aaketmqvxqjgaznvclqc`) on August 6, 2026.

## Implemented behavior

- Added generated-type-backed CRUD contracts for buildings, floors, map elements, entrances, rooms, navigation nodes, and navigation edges.
- Added lossless Map Builder serialization and hydration for ordering, coordinates, transforms, floor relationships, routes, accessibility, emergency assets, and decor.
- Connected campus and floor Save actions to one transactional RPC and connected editor entry to live structure loading.
- Replaced timestamp-prefixed editor IDs with browser-generated UUID primary keys.
- Added published-directory mapping for buildings, rooms, facilities, and destinations. It reads only RLS-visible published `campus_versions.snapshot` data.
- Restored the Map Builder card's editor entry point, which was hidden when no delete callback was supplied.

## Database contract

Migration `20260806113935_establish_campus_structure_contract.sql` is additive. It adds editor metadata columns, validation constraints, authoring indexes, explicit Data API privileges, and `save_campus_structure(uuid, jsonb)`.

The RPC is `SECURITY INVOKER`, administrator-only, locks the campus, bounds collection sizes, and applies the normalized structure in one transaction. Invalid cross-campus references fail through existing integrity triggers and roll back. Omitted entities are archived, deactivated, or closed rather than physically deleted, keeping failures recoverable.

Guests and students cannot read live authoring rows. Published directory consumers use only RLS-visible published version snapshots.

## Repeatable checks

- Vite production build passed.
- Seven Vitest files passed: 63 tests total.
- `node scripts/verify-a5-campus-structure.mjs` passed with controlled, cleaned-up fixtures: admin atomic save/load, student and guest isolation, student RPC denial, cross-campus rejection, and recoverable archival.
- The A1 live regression passed, including the guest/student/admin RLS and Storage MIME/size matrix.
- A rollback-only database transaction loaded one building, one floor, one room, two nodes, and one edge with expected counts.
- Browser smoke testing authenticated as the demo administrator, opened Campus Management and a live campus editor, and found no console errors.

## Advisor review

The security advisor reports no new A5 finding. Existing warnings remain for intentionally callable policy/helper RPCs and leaked-password protection, a deployment dashboard task. The performance advisor reports the existing project-wide index/policy backlog and flags the new directory index as unused because the development dataset is small.

Relevant guidance: [Supabase database linter](https://supabase.com/docs/guides/database/database-linter) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
