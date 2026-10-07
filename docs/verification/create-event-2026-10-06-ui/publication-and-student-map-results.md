# Publication and student event-map UI verification — October 6

Base commit `4ea2618`, with local uncommitted UI corrections. Existing super-admin and regular-student accounts were used. The user selected controlled browser/clock tests for scheduled publication, with no retained approved QA event. No SQL, migration, account creation, commit, push, or deployment was performed.

## Publication behavior and corrections

- **Publish now** makes an approved, eligible event visible immediately. It is useful when unpublished or scheduled for later. An already visible event now shows a disabled **Published** state instead of offering a redundant publish action.
- Event start and publication time are different. A past event start is valid for an ongoing event whose end is still in the future. The sample starts October 6 and ends October 10; publishing it on October 7 would make it **Ongoing**, not Upcoming. Upcoming requires publication to have begun while the event start is still in the future.
- Past/invalid schedule inputs and publication at/after the event end are blocked. Expired events cannot be published now or scheduled; the UI requests a proposal with updated event dates. This existing publication command does not edit approved occurrence dates.
- A past stored publication timestamp is normal after publication. It no longer produces a new red error when the dialog opens. Editing to an invalid/past time shows field guidance and keeps Save schedule disabled.
- Saving a future publication for a currently visible event still requires explicit confirmation that it will become hidden until that time.
- The publication dialog now uses the existing modal focus/scroll system, clear status copy, a scrollable body, and footer actions that fit desktop, mobile and short landscape. All displayed times retain AM/PM.

## Student panel, venue and visual corrections

- Desktop details use their content height within the map viewport instead of inheriting a short mobile sheet height. Titles wrap; duplicate Back navigation and the normal search card behind the event panel were removed. Location controls appear before optional poster/description content.
- Mobile sheets fit their content with bounded list/detail heights. Choosing a location collapses the sheet to its header so the map remains visible; the header identifies the viewed location. Expand/back/close remain reachable, including landscape. Map utilities stay above the bottom sheet.
- The Campus Grounds venue is anchored at the visible central monument in the published campus; an event-specific Stage marker no longer relocates the shared grounds venue. Building pins remain at building centers. Pin and location-button entry points use the same viewing flow.
- Public assets use the same catalog artwork/color as the admin view. The public-only white rectangle was removed. Label font weight, size defaults, color defaults, and top-left alignment now match admin review. The actual Stage, floor Booth and visible floor labels were compared using artwork, color and authored coordinates. Camera zoom may change apparent screen size without changing authored geometry.
- The venue layer respects the active filter. Eligible data is checked against the feed's server-time offset; expired selections and overlays are cleared. Closing event mode removes event additions and restores normal map search.

## Actual browser checks

`evidence/publication/publication-parity.json`: **10/10 PASS**, `pageErrors: []`, `actualEventWrites: 0`, `retainedFixtures: 0`, `existingSampleUnchanged: true`.

| Case | Evidence mode | Result |
|---|---|---|
| Full desktop title, both locations, single Back action and no overlapping regular search | Actual existing published sample, read-only | PASS |
| Grounds pin at the published monument center | Actual existing published sample, read-only | PASS |
| Admin/student Stage artwork, color, footprint and no public editing rectangle | Actual existing published sample, read-only | PASS |
| Floor Booth and label alignment/weight | Actual existing published sample, read-only | PASS |
| Already published status, no false initial error and mobile publication footer | Actual existing published sample, read-only | PASS |
| Mobile details/location selection/peek and restoration of regular map | Actual existing published sample, read-only | PASS |
| Location and publication controls at 740×480 | Actual existing published sample, read-only | PASS |
| Hidden-before-publication → Upcoming → Ongoing → expired/removed selection | Controlled server responses and clock boundaries; real UI actions | PASS |
| Admin future-date/time input and intended schedule RPC payload/state | Controlled RPC response; command intercepted before network write | PASS |
| Expired occurrence and past publication input blocked with mobile guidance | Controlled response data; real UI actions | PASS |

The real approved sample was not published, unpublished, rescheduled, edited or deleted. Its full metadata and `updated_at` matched before and after verification. Controlled cases reused its public layout data with a new in-memory identity/time range; they did not create database rows. This does **not** claim a fresh live database scheduling/persistence test or a wall-clock wait for a real future publication.

One initial parity assertion failed because CSSOM rounded `721.706652…` to `721.707px`; that is serialization precision, not a visible coordinate difference. The assertion now compares CSS numeric values within 0.01 map units while still checking the exact public SVG coordinates and label styling.

## Screenshots inspected

- `evidence/publication/student-desktop-details.png`, `student-desktop-grounds.png`, `student-desktop-floor.png`
- `evidence/publication/admin-grounds.png`, `admin-floor.png`, `admin-stage-art.png`, `student-stage-art.png`
- `evidence/publication/student-mobile-details.png`, `student-mobile-map.png`, `student-mobile-floor.png`, `student-landscape-map.png`
- `evidence/publication/publication-desktop.png`, `publication-mobile.png`, `publication-landscape.png`
- `evidence/publication/controlled-upcoming-desktop.png`, `controlled-upcoming-mobile.png`, `controlled-scheduled-admin.png`, `controlled-expired-mobile.png`, `controlled-past-schedule-mobile.png`

## Regression checks

- **132 tests PASS across 12 affected suites**: publication dialog/service/model, event panel/venue/rendering, map controls/selection, server-time feed hook, admin queue and date/time controls. Existing navigation tests emit non-failing jsdom scroll/animation warnings; the actual browser run had no page errors.
- Final production build PASS, with the existing large-chunk advisory.
- Repository-wide TypeScript check remains failing in other existing modules. The final diagnostics are in `publication-typescript-final.txt`; no diagnostics were returned for the modified production publication/map files.
- No whole-plan completion is claimed. Fresh live approval/scheduling fixtures and remaining original acceptance gaps are still outside this controlled verification.
