# Demo Student Approval Flow and Mobile Campus Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional regular demo student for manual Student Org approval testing and make legacy published snapshots preserve the configured campus ground color on mobile.

**Architecture:** Keep account provisioning developer-only and environment-driven; the new account is created as an active `student` and is never auto-promoted. Add a pure snapshot compatibility merge in `campusService.ts` so top-level appearance remains authoritative while older `structure.map_elements` appearance records fill only missing fields. The existing `campusGroundAppearance` renderer remains the shared desktop/mobile presentation path.

**Tech Stack:** TypeScript, React, Supabase Auth/RLS, Vitest, Vite, Node.js provisioning script.

## Global Constraints

- Continue in `C:\Users\Rj\Documents\GitHub\plv-navisync`.
- Do not run `git pull`, `git push`, `git reset`, or `git checkout`.
- Preserve all existing working-tree changes; stage only files belonging to this task when committing.
- Do not add a database migration or bypass profile authorization/RLS.
- New demo credentials must come from local environment files and must never be hardcoded into production code.
- Follow RED → GREEN → REFACTOR for each behavior change.

---

### Task 1: Recover campus appearance from legacy published snapshots

**Files:**
- Modify: `src/services/campusService.ts` near `listPublishedCampusSnapshots`
- Test: `src/services/__tests__/campusService.test.ts`

**Interfaces:**
- Produces `mergePublishedCampusAppearance(campus: Campus, structure: unknown): Campus`, a pure helper that fills missing `canvasGroundMaterial`, `canvasGroundColor`, `canvasGroundTexture`, and `canvasColor` from a top-level `canvas_appearance` structure record.
- Consumes the existing published snapshot shape `{ campus, structure }` and the existing `Campus` ground-appearance fields.

- [ ] **Step 1: Write the failing regression test**

Add this import to the existing campus service test imports:

```ts
import { mergePublishedCampusAppearance } from "../campusService";
```

Add a test near the published-campus service tests:

```ts
it("fills missing campus appearance from a legacy published structure record", () => {
  const campus = {
    id: "c-green",
    canvasW: 900,
    canvasH: 680,
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    routes: [],
    decorAssets: [],
    settings: {},
  } as Campus;

  const result = mergePublishedCampusAppearance(campus, {
    map_elements: [{
      element_type: "canvas_appearance",
      metadata: {
        kind: "canvas_appearance",
        ui: {
          canvasGroundMaterial: "grass",
          canvasGroundColor: "#bfd4b8",
          canvasGroundTexture: "subtle",
          canvasColor: "#bfd4b8",
        },
      },
    }],
  });

  expect(result).toMatchObject({
    canvasGroundMaterial: "grass",
    canvasGroundColor: "#bfd4b8",
    canvasGroundTexture: "subtle",
    canvasColor: "#bfd4b8",
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected RED failure**

Run:

```powershell
pnpm exec vitest run src/services/__tests__/campusService.test.ts -t "fills missing campus appearance"
```

Expected: FAIL because `mergePublishedCampusAppearance` is not exported yet.

- [ ] **Step 3: Implement the minimal compatibility helper**

In `src/services/campusService.ts`, add a narrow parser that:

1. Returns the original campus when `structure` is not a record or has no `map_elements` array.
2. Finds the first element where `element_type === "canvas_appearance"` or `metadata.kind === "canvas_appearance"`.
3. Reads `metadata.ui` first, then `metadata`, as the existing structure serializer does.
4. Copies only appearance keys that are `undefined` on the campus, so a current top-level field always wins.

Then call it from `listPublishedCampusSnapshots` before adding publication status fields:

```ts
const value = mergePublishedCampusAppearance(campus as Campus, (snapshot as { structure?: unknown }).structure);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vitest command. Expected: PASS with zero failures.

- [ ] **Step 5: Add a precedence test and keep it green**

Add a second test that starts with `canvasGroundColor: "#123456"` on the campus and `"#bfd4b8"` in the structure record, then asserts the result keeps `"#123456"`. Run the focused file again and confirm both tests pass.

### Task 2: Add a regular demo student applicant account

**Files:**
- Modify: `scripts/provision-demo-accounts.mjs`
- Modify: `.env.demo.example`
- Modify: `.env.example`
- Modify: `src/pages/AdminLoginPage.tsx`

**Interfaces:**
- Consumes `DEMO_ORG_STUDENT_EMAIL` and `DEMO_ORG_STUDENT_PASSWORD` in the local provisioning environment and `VITE_DEMO_ORG_STUDENT_EMAIL` / `VITE_DEMO_ORG_STUDENT_PASSWORD` in the frontend environment.
- Produces an optional login quick-fill account with id `demo-org-student`, label `Demo Org Applicant`, and description `Regular student — convert in User Management`.

- [ ] **Step 1: Add the environment contract before implementation**

Extend `.env.demo.example` with:

```dotenv
DEMO_ORG_STUDENT_EMAIL=
DEMO_ORG_STUDENT_PASSWORD=
```

Extend `.env.example` with the frontend-only optional values:

```dotenv
VITE_DEMO_ORG_STUDENT_EMAIL=
VITE_DEMO_ORG_STUDENT_PASSWORD=
```

- [ ] **Step 2: Update the provisioning script**

In `scripts/provision-demo-accounts.mjs`:

1. Add the two server-only variables to `REQUIRED_VARS`.
2. Include the new email in the existing-admin collision guard.
3. Call `ensureAuthUser` with display name `Demo Org Applicant`, student number `DEMO-ORG-STUDENT`, and the new credentials.
4. Call `ensureProfileExists` with initial role `student`.
5. After the existing-admin session is established, call `finalizeProfileThroughAdmin` with `role: "student"`, `is_active: true`, and the applicant's name fields.
6. Assert the finalized applicant remains `student` and active.
7. Print the applicant portal/role/email/password in the same local-only final output, without printing service-role or existing-admin secrets.

- [ ] **Step 3: Update the login quick-fill configuration**

In `src/pages/AdminLoginPage.tsx`, read the two Vite variables and append this account only when demo mode and both credentials are configured:

```ts
{
  id: "demo-org-student",
  label: "Demo Org Applicant",
  description: "Regular student — convert in User Management",
  icon: GraduationCap,
  email: DEMO_ORG_STUDENT_EMAIL,
  password: DEMO_ORG_STUDENT_PASSWORD,
}
```

Do not change the existing account behavior: selecting an option only fills the form, and Sign In still uses Supabase Auth.

- [ ] **Step 4: Run static checks for the account changes**

Run:

```powershell
pnpm exec tsc --noEmit
```

Expected: exit code 0. Do not run the provisioning script unless the user has supplied a configured `.env.demo.local`; it would create/update real Supabase accounts.

### Task 3: Verify the complete local result

**Files:**
- Inspect only: all changed files from Tasks 1–2 and existing working-tree status

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
pnpm exec vitest run src/services/__tests__/campusService.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run the production build**

Run:

```powershell
pnpm build
```

Expected: exit code 0. Existing Babel/Vite chunk-size warnings may remain; they are non-fatal and must be reported separately from failures.

- [ ] **Step 3: Check the diff without touching unrelated work**

Run:

```powershell
git diff --check -- docs/superpowers/specs/2026-09-14-demo-student-mobile-map-design.md docs/superpowers/plans/2026-09-14-demo-student-mobile-map.md scripts/provision-demo-accounts.mjs .env.demo.example .env.example src/pages/AdminLoginPage.tsx src/services/campusService.ts src/services/__tests__/campusService.test.ts
git status --short
```

Confirm the diff contains no whitespace errors and the pre-existing modified files remain present.

- [ ] **Step 4: Report the manual test sequence**

After the developer adds the new values to `.env.demo.local` and the Vite env file, the manual flow is:

1. Run `pnpm demo:accounts` locally.
2. Choose `Demo Org Applicant` and sign in; verify it behaves as a regular student.
3. Sign in as Demo Administrator → User Management → edit the applicant → set Role to `Student Org` → Save Changes.
4. Sign out and sign in again as the applicant.
5. Open the student event flow and create an event; verify the event editor is available.
6. Republish the campus after confirming its ground material is Grass, then reload the Mobile View extension; verify the mobile campus surface is green and matches the desktop map.
