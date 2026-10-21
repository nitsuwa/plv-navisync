# Assembly Point connectivity and SOS routing follow-up

## Result

The Admin readiness check now follows actual emergency travel direction across the complete outdoor path. An Assembly Point is not reported as connected if every upstream outdoor edge only permits travel away from its anchor. The route engine and canonical emergency eligibility gate remain unchanged.

MAIN CAMPUS production evacuation is still **BLOCKED BY DATA**: the latest published Student Map snapshot has no Assembly Point entity, and CABA's two ordinary stair transitions remain `emergencySafe: false` pending an authoritative physical-use decision.

## Screenshot issues and root causes

- Connect and the Assembly Point Properties “Edit Connection” action now enter the same Navigation Connect flow. It can target a real waypoint or an eligible Walking Network segment; a mid-segment target is inserted as a real junction and reconciled through the authored pathway graph. A visual-only attachment is rejected with an explanation. No geometry is synthesized from a line crossing.
- Blue and purple are Inspector overlays: blue identifies the largest campus outdoor component and purple identifies the Assembly Point component. They do not encode pathway types or emergency eligibility.
- A campus-level Assembly Point anchor intentionally has no building/floor owner. The graph validator previously treated that as an indoor missing-floor warning. It now recognizes the owned Assembly Point anchor, removing that false warning. The compact Properties panel has one connection status and no routine Safety Review card or destination-policy dropdown; legacy review fields remain serialized for compatibility.
- The apparent central shortcut is not joined in authored navigation topology. The prior read-only graph trace found disconnected junction keys near `(540, 440)` and `(507.397, 540.274)`. The planner therefore takes the shortest eligible path that actually exists, which is the perimeter path. If campus personnel confirm the central crossings are physical walkway junctions, an Admin can connect those authored endpoints in Navigation. Do not join them based on visual overlap alone.
- Room SOS uses its owning building's assigned Primary destination; it does not require a Room-specific Assembly Point or manual Route A/B record. The current published snapshot has no Assembly Point to inherit, and CABA's known connected descent candidates still fail emergency eligibility because their stair transitions are not affirmed for emergency use.
- Serialization is not a reproduced cause of route loss. The Assembly Point entity, graph anchor, assignment and incoming link round-trip through the current snapshot serializer and relational hydration tests. Editable changes do not appear on the Student Map until a later authorized publication.

## Current campus blockers

- **Editable MAIN CAMPUS:** the prior read-only Chromium inspection found the existing Assembly Point connected to a 27-waypoint eligible outdoor component, with Primary assignments for four buildings.
- **Published MAIN CAMPUS:** the current published snapshot contains zero Assembly Point entities. This is a published-version data gap, not a serializer omission. No production data was changed.
- **CABA-201:** the Right Stair transition `677a5a24-9d4d-4855-8011-9eacb0944a2a` and Left Stair transition `23c676f3-27fc-4d8c-9308-8a1571c89b6c` are both marked `emergencySafe: false`. Available data does not establish whether those values are a prohibition or unresolved eligibility, so they remain blocked. The Ground Floor-only exterior stairs do not create an eligible upper-floor route by themselves.

## Admin actions when campus personnel return

1. Use **Inspect Connections** on the existing Assembly Point. Its editable connection was already reported connected; do not recreate it unless the current Inspector identifies a real gap.
2. Confirm whether the central walkway endpoints near the coordinates above physically meet. If they do, use Navigation Connect to author the junction. If they do not, keep the current graph and perimeter route.
3. Have the campus safety authority determine whether the two CABA stairs and their transitions are suitable for emergency descent. Only then update the corresponding physical asset and edge eligibility through Admin Builder. Do not set `emergencySafe` to true by inference.
4. In a future authorized publication, include the existing Assembly Point and its building assignments, then rerun the SOS preflight against that proposed snapshot. No per-room route approval is needed.

## Verification

- Focused SOS, Assembly Point, graph-validator, Admin-properties, Room routing and student Assembly Point marker tests: **186 passed across 6 files**.
- Serializer/hydration and publication-preflight selection: **16 passed, 42 skipped by the test-name filter**.
- Production build: **PASS**. Vite reports existing large-chunk warnings.
- TypeScript: **1029 baseline diagnostics before and after; 0 new identities in touched files**.
- `git diff --check`: **PASS**.
- Broad `CampusEditor.navGraph.test.tsx` run: **53 of 139 failed** on existing toolbar/label expectation differences (for example “waypoint” versus “walking point”); this broad file is not clean. The two other files in that run passed.
- Fresh Chromium screenshots for this continuation: **NOT VERIFIED**. The existing local preview port did not answer HTTP, and the repository has no Playwright CLI. Earlier TEST ONLY route screenshots and the prior read-only browser inspection remain available as historical evidence, not as a fresh screenshot of the current Properties panel.

Historical evidence:

- [Older Admin connection reload screenshot](../assembly-point-ordinary-sos/admin-connect-pathway/assembly-point-admin-explicit-connection-reloaded-1440.png) — shows the pre-simplification review card; not a screenshot of the current panel.
- [TEST ONLY CABA route preview](../assembly-point-ordinary-sos/final-rerun/assembly-point-caba-both-routes-desktop-1440.png).
- [Published CABA-201 unavailable state](../sos-final-audit-20261018/main-campus-caba201-sos-unavailable-deep3-390.png).
- [TypeScript baseline comparison](typescript-diagnostic-comparison.json).

No live campus geometry, emergency-use flags, assignments, published snapshots, migrations, videos, Storage objects, or publication state were modified.
