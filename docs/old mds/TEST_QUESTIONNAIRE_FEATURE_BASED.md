# PLV NaviSync — Feature-Based Test Questionnaire

> **Purpose:** Evaluate each **feature/module** of PLV NaviSync individually to find which features work well and which need improvement.
> **Audience:** Students and Administrators (two separate sets).
> **Scale:** 5-point Likert — **1 = Strongly Disagree, 2 = Disagree, 3 = Neutral, 4 = Agree, 5 = Strongly Agree** (+ N/A = Feature not tested).
> **Usage note:** This questionnaire pairs with the ISO/IEC 25010 questionnaire: the ISO one measures **quality characteristics**, this one measures **feature coverage and performance**. Reference `SYSTEM_DESCRIPTIVE_SPEC.md` §7 for the feature-to-module map.

---

## Part A — Respondent Profile

1. Role: ☐ Student ☐ Faculty ☐ Administrator ☐ Other
2. Frequency of use: ☐ First time ☐ Occasionally ☐ Weekly ☐ Daily
3. Device: ☐ Desktop ☐ Laptop ☐ Tablet ☐ Smartphone
4. How did you use the app? ☐ Guest ☐ Student account ☐ Admin account

---

## Part B — Student / Guest Feature Questionnaire

> Test each feature below, then rate how well it worked for you. Mark N/A if you did not use the feature.

### B1. Authentication & Registration

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F1-1 | Login (student) | Sign in with `student`/`plv2025`; confirm you land on the campus map | | | | | | |
| F1-2 | Login error handling | Enter a wrong password; confirm a clear error appears | | | | | | |
| F1-3 | Role-based redirect | Sign in with `admin`/`plv2025`; confirm you land on the admin dashboard | | | | | | |
| F2-1 | Registration wizard | Complete both steps; confirm validation works and success screen appears | | | | | | |
| F2-2 | Registration validation | Test invalid email / short password / mismatched passwords; confirm field errors | | | | | | |
| F2-3 | Demo account auto-fill | Use "Use a Demo Account" dropdown to prefill credentials | | | | | | |

### B2. Landing Page & Navigation

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F3-1 | Landing page content | Verify hero, features, and call-to-action buttons render correctly | | | | | | |
| F3-2 | Main navigation | Move between Map, Buildings, Help, Announcements via the navbar | | | | | | |
| F3-3 | Theme toggle | Switch dark/light theme and verify it applies across pages | | | | | | |

### B3. Campus Map — Browsing

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F4-1 | Map load | The campus map loaded with a skeleton then rendered fully | | | | | | |
| F4-2 | Pan | Drag the map; confirm smooth movement (and inertia on release) | | | | | | |
| F4-3 | Zoom | Wheel / pinch / `+` / `-` / double-click; confirm zoom works | | | | | | |
| F4-4 | Reset view | Press `0` or use reset; confirm map returns to default | | | | | | |
| F4-5 | Select building | Click a building; confirm info panel opens and map pans to it | | | | | | |
| F4-6 | Search | Search a building name/code; confirm results and selection | | | | | | |
| F4-7 | Keyboard shortcuts | Arrow keys pan; Escape closes panels | | | | | | |
| F4-8 | QR / share | Open a building's info panel, use Share; confirm the QR placeholder dialog appears | | | | | | |
| F4-9 | Multi-campus selector | If more than one campus is published, confirm a campus selector is available and switching works | | | | | | |

### B4. Directions & Navigation

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F5-1 | Directions mode | Set a From and To; confirm an animated route is drawn | | | | | | |
| F5-2 | Route info | Distance (m) and time (min) shown correctly | | | | | | |
| F5-3 | Step-by-step directions | Text directions match the drawn route | | | | | | |
| F5-4 | Route animation | Route draws with glow/arrows/markers as expected | | | | | | |
| F6-1 | Accessible mode | Toggle Accessible; confirm accessible paths/markers highlighted | | | | | | |
| F6-2 | Emergency mode | Toggle Emergency; confirm exits and assembly areas shown | | | | | | |

### B5. Floor Plans & Indoor Routing

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F7-1 | Open floor plan | Double-click a building; confirm its floor plan opens | | | | | | |
| F7-2 | Switch floors | Change floors; confirm correct rooms display | | | | | | |
| F7-3 | Stairs/elevators | Click a stair/elevator; confirm animated floor transition | | | | | | |
| F8-1 | Indoor route to room | Click a room; confirm a route is drawn from stairs/elevator to that room | | | | | | |
| F8-2 | Indoor directions | Directions and estimated time/distance shown for the indoor route | | | | | | |

### B6. Building Directory & Details

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F11-1 | Directory list | Browse all buildings; confirm counts and categories | | | | | | |
| F11-2 | Search & filter | Search, filter by category, sort; confirm results update | | | | | | |
| F11-3 | Grid/list toggle | Switch between grid and list views | | | | | | |
| F11-4 | Building details | Open a building's details; confirm facilities/accessibility shown | | | | | | |

### B7. Student Account Features

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F9-1 | Favorites | Save a building; confirm it appears in Favorites page | | | | | | |
| F9-2 | Remove favorite | Remove a saved building; confirm it disappears | | | | | | |
| F10-1 | Report an issue | Submit a report for a building; confirm success feedback | | | | | | |
| F14-1 | My Day | Open My Day; confirm personalized content loads | | | | | | |
| F14-2 | Profile & settings | View/edit profile; change preferences | | | | | | |
| F14-3 | Guest sign-in prompt | As a guest, try to favorite/report; confirm you are prompted to sign in | | | | | | |

### B8. Information Features

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F12-1 | Announcements | View announcements; confirm urgent alerts are highlighted | | | | | | |
| F12-2 | Announcement filters | Filter by category and priority; confirm results | | | | | | |
| F13-1 | Help Center | Browse the help topics and FAQs | | | | | | |
| F13-2 | AI assistant | Ask "Where is the Registrar?"; confirm a useful answer | | | | | | |
| F13-3 | Guest chat limit | As a guest, confirm the daily query limit message after 5 queries | | | | | | |

> **Note on coverage:** Global cross-cutting features — **F29 (theme & responsiveness)** and **F30 (data persistence / mock vs Supabase)** — are covered by the ISO/IEC 25010 questionnaire (Compatibility, Usability, Reliability sections) rather than dedicated feature rows here.

---

## Part C — Administrator Feature Questionnaire

> Use the **admin** account (`admin` / `plv2025`). Test each feature in the admin portal and Map Builder.

### C1. Dashboard & Portal Navigation

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F15-1 | Dashboard metrics | Confirm metric cards (buildings, rooms, routes, reports) show values | | | | | | |
| F15-2 | Priority items | Click a priority item; confirm it links to the reports page | | | | | | |
| F15-3 | Quick actions | Use each quick action; confirm navigation is correct | | | | | | |
| F26-1 | Reports review | Open Reports; confirm student reports are listed | | | | | | |
| F27-1 | User management | Open Users; confirm accounts are listed and manageable | | | | | | |
| F28-1 | Settings | Open Settings; confirm options are present and changes apply | | | | | | |

### C2. Campus Management

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F16-1 | Campus list | Campus Home shows cards with status and counts | | | | | | |
| F16-2 | Create campus | Create a new campus; confirm it appears in the list | | | | | | |
| F16-3 | Duplicate campus | Duplicate a campus; confirm a copy is created | | | | | | |
| F16-4 | Archive/restore | Archive a campus; confirm it is hidden from students and restorable | | | | | | |
| F16-5 | Delete campus | Delete with confirmation; confirm it is removed | | | | | | |
| F24-1 | Draft saving | Save a campus as draft; confirm status shows Draft | | | | | | |
| F24-2 | Publish | Publish a campus; confirm students can now see it on the map | | | | | | |
| F24-3 | Unpublish | Unpublish; confirm it disappears from the student map | | | | | | |
| F24-4 | Validation | Try publishing incomplete data; confirm validation issues are listed | | | | | | |

### C3. Campus Editor — Canvas & Objects

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F17-1 | Canvas view | Pan/zoom/reset the canvas; confirm coordinate readout | | | | | | |
| F17-2 | Add building (drag) | Drag on canvas to draw a building | | | | | | |
| F17-3 | Place building (palette) | Select a building type from the palette and click to place | | | | | | |
| F17-4 | Move building | Drag a building; confirm grid/edge snapping and guides | | | | | | |
| F17-5 | Resize building | Drag a corner; confirm resize is smooth and rotation-aware | | | | | | |
| F17-6 | Rotate building | Use the rotation handle; confirm 5° snapping | | | | | | |
| F17-7 | Edit properties | Change name, color, category in the properties panel | | | | | | |
| F17-8 | Place markers | Place a marker; confirm it appears in hierarchy and on canvas | | | | | | |
| F17-9 | Draw paths | Click waypoints, double-click to finish; confirm the path renders | | | | | | |
| F17-10 | Erase tool | Erase a building/marker/path; confirm removal | | | | | | |
| F17-11 | Context menu | Right-click an object; confirm menu actions work | | | | | | |
| F18-1 | Rubber-band select | Drag on empty space; confirm multiple objects are selected | | | | | | |
| F18-2 | Shift+click multi-select | Add/remove objects from selection | | | | | | |
| F18-3 | Ctrl+A select all | Confirm all objects on the layer are selected | | | | | | |
| F18-4 | Batch move/delete/duplicate | Move, delete, and duplicate the selection together | | | | | | |
| F18-5 | Align & distribute | Use the align/distribute toolbar on a multi-selection | | | | | | |
| F25-1 | Undo/redo | Make several edits; undo/redo them | | | | | | |
| F25-2 | Shortcuts | Test V, B, M, P, E, 1–5, Ctrl+S, Delete | | | | | | |
| F25-3 | Shortcut cheat sheet | Press `?`; confirm the shortcut overlay appears | | | | | | |
| F25-4 | Auto-save indicator | Make changes; confirm the unsaved-changes indicator appears | | | | | | |

### C4. Layers & Specialized Authoring

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F19-1 | Layer switching | Switch between Campus, Navigation, Accessibility, Emergency, Events | | | | | | |
| F19-2 | Contextual tools | Confirm the tool palette changes per layer | | | | | | |
| F19-3 | Hierarchy panel | Expand buildings, toggle visibility/lock, search items | | | | | | |
| F20-1 | Floor editor | Open a building's floor editor; add rooms | | | | | | |
| F20-2 | Room types | Place rooms of different types (classroom, lab, stairs, elevator…) | | | | | | |
| F20-3 | Room properties | Edit a room's name/type/dimensions/accessibility | | | | | | |
| F20-4 | Stairs/elevators | Confirm stairs/elevators link floors for routing | | | | | | |
| F21-1 | Draw navigation route | On Navigation layer, draw a route and set its type | | | | | | |
| F21-2 | Route properties | Confirm distance/duration auto-calculate and display | | | | | | |
| F21-3 | Test navigation | Use the test-navigation panel to preview a route | | | | | | |
| F22-1 | Accessibility features | Add ramp/elevator/accessible-entrance data to a building | | | | | | |
| F23-1 | Event pins | Add an event pin with title/date/organizer | | | | | | |
| F23-2 | Restricted areas | Draw a restricted area polygon | | | | | | |
| F23-3 | Active event | Activate one event; confirm it overlays on the student map | | | | | | |

### C5. Publishing & Verification

| # | Feature | Test scenario | 1 | 2 | 3 | 4 | 5 | N/A |
|---|---------|---------------|---|---|---|---|---|---|
| F24-5 | Publish progress | Publish and confirm the progress dialog runs to success | | | | | | |
| F24-6 | Student verification | After publishing, open the public map as a student and verify the changes appear | | | | | | |
| F24-7 | Draft exclusion | Confirm draft/archived campuses do not appear on the student map | | | | | | |

---

## Part D — Feature Priority & Feedback (both sets)

For each feature area you used, mark importance (High / Medium / Low) and satisfaction (1–5):

| Feature area | Importance | Satisfaction | Comments |
|--------------|------------|--------------|----------|
| Campus map & search | | | |
| Directions & routing | | | |
| Floor plans & indoor routing | | | |
| Map modes (accessible/emergency) | | | |
| Favorites & reports | | | |
| Announcements & help | | | |
| Registration & login | | | |
| Admin dashboard | | | |
| Map Builder (campus editing) | | | |
| Floor Editor (room authoring) | | | |
| Publish workflow | | | |

**Most valuable feature overall:** _______________________________________________

**Feature that needs the most improvement:** ______________________________________

**Feature you would remove or change:** ___________________________________________

**Any feature you expected but did not find:** ______________________________________

---

## Part E — Tester Summary Sheet (researcher fills after each tester)

| Tester | Role | # Features tested | Total N/A | Top strength (feature) | Top weakness (feature) | Overall (1–5) |
|--------|------|-------------------|-----------|------------------------|------------------------|---------------|
| | | | | | | |
| | | | | | | |
| | | | | | | |

**Aggregate findings:**
- Features with mean ≥ 4.0 → **working well** (list)
- Features with mean 3.0–3.9 → **needs refinement** (list)
- Features with mean < 3.0 → **critical improvement needed** (list)
