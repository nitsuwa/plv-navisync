# PLV NaviSync — ISO/IEC 25010 Test Questionnaire

> **Standard:** ISO/IEC 25010:2011 — Systems and software Quality Requirements and Evaluation (SQuaRE): **Product Quality Model**.
> **Audience:** Students and Administrators (two separate sets).
> **Scale:** 5-point Likert — **1 = Strongly Disagree, 2 = Disagree, 3 = Neutral, 4 = Agree, 5 = Strongly Agree** (+ N/A = Not Applicable / Did Not Use).
> **Format instructions:** Respondents should use the system with the provided demo accounts (student/admin) and complete the questionnaire afterward. Each item is a statement; the respondent rates their agreement.

---

## Part A — Respondent Profile (both sets)

1. Role: ☐ Student ☐ Faculty ☐ Administrator ☐ Other
2. Frequency of use: ☐ First time ☐ Occasionally ☐ Weekly ☐ Daily
3. Device used: ☐ Desktop ☐ Laptop ☐ Tablet ☐ Smartphone
4. Browser: ☐ Chrome ☐ Edge ☐ Firefox ☐ Safari ☐ Other
5. I used the application: ☐ Without login (guest) ☐ With student account ☐ With admin account

---

## Part B — Student / Guest Questionnaire

> Use the system as a **student or guest** (map, floor plans, directions, search, help). Demo: `student` / `plv2025`.

### B1. Functional Suitability (does it do the right things correctly?)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| FS1 | The campus map displays all buildings and landmarks accurately. | | | | | | |
| FS2 | The search function found the building or room I was looking for. | | | | | | |
| FS3 | The directions feature produced a correct route from my starting point to my destination. | | | | | | |
| FS4 | The estimated distance and travel time shown matched my expectations. | | | | | | |
| FS5 | Floor plans correctly showed the rooms and their locations for each floor. | | | | | | |
| FS6 | Indoor room routing guided me to the correct room on the correct floor. | | | | | | |
| FS7 | Accessible mode highlighted wheelchair-friendly paths and facilities appropriately. | | | | | | |
| FS8 | Emergency mode clearly displayed exits and assembly areas. | | | | | | |
| FS9 | The favorites feature correctly saved and removed buildings. | | | | | | |
| FS10 | The "report an issue" feature successfully submitted my report. | | | | | | |
| FS11 | The Help Center AI assistant answered my questions correctly. | | | | | | |
| FS12 | Announcements were displayed with correct categories and priorities. | | | | | | |

> ⚠️ **Tester note (FS12):** The Announcements page component exists, but at the time of writing it is not wired into the router (no `/announcements` route) — see `SYSTEM_DESCRIPTIVE_SPEC.md` §3.5. If the page is unreachable, mark FS12 as **N/A** and note it in Part D.

### B2. Performance Efficiency (is it fast and responsive?)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| PE1 | The application loaded quickly when I opened it. | | | | | | |
| PE2 | The map was responsive when panning and zooming. | | | | | | |
| PE3 | Search results appeared without noticeable delay. | | | | | | |
| PE4 | Directions were calculated quickly. | | | | | | |
| PE5 | Switching between map modes and floor plans was fast. | | | | | | |
| PE6 | I did not experience freezes, lags, or crashes while using the app. | | | | | | |

### B3. Compatibility (does it work with what I have?)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| CP1 | The application worked correctly on my device and browser. | | | | | | |
| CP2 | Touch gestures (tap, pinch, swipe) worked on my device. | | | | | | |
| CP3 | The layout adjusted properly to my screen size (mobile/tablet/desktop). | | | | | | |
| CP4 | The app worked in both light and dark themes without issues. | | | | | | |

### B4. Usability (is it easy to use and understand?)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| US1 | I was able to understand the purpose of the application immediately. | | | | | | |
| US2 | The interface was intuitive and easy to navigate. | | | | | | |
| US3 | I learned how to use the map without needing assistance or a manual. | | | | | | |
| US4 | Labels, icons, and buttons clearly indicated their function. | | | | | | |
| US5 | The step-by-step directions were easy to follow. | | | | | | |
| US6 | The system prevented me from making errors (e.g., clear validation, confirmation prompts). | | | | | | |
| US7 | Error messages (e.g., wrong login) were clear and helpful. | | | | | | |
| US8 | The overall design (colors, typography, spacing) was visually appealing. | | | | | | |
| US9 | Text and controls were readable and sufficiently large. | | | | | | |
| US10 | I could use the application with keyboard shortcuts where expected. | | | | | | |

### B5. Reliability (is it stable and dependable?)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| RL1 | The application was available whenever I tried to use it. | | | | | | |
| RL2 | My data (favorites, reports) was preserved between sessions. | | | | | | |
| RL3 | If something went wrong, the application recovered gracefully. | | | | | | |
| RL4 | The application performed consistently across multiple uses. | | | | | | |

### B6. Security (are my data and privacy protected?)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| SC1 | Only I could access my account and personal data. | | | | | | |
| SC2 | I felt secure entering my credentials on the login/registration page. | | | | | | |
| SC3 | The system logged me out or protected my session appropriately. | | | | | | |
| SC4 | My submitted reports and favorites were not visible to other users. | | | | | | |

### B7. Maintainability & Portability (technical perspective — optional for students)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| MP1 | The application did not need special installation or setup by me. | | | | | | |
| MP2 | Updates or reloads did not require me to reconfigure anything. | | | | | | |

---

## Part C — Administrator Questionnaire

> Use the system as an **administrator** (login: `admin` / `plv2025`). Focus on the dashboard, Map Builder (campuses, buildings, floors, layers), and publish workflow.

### C1. Functional Suitability

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| FS13 | The dashboard displayed correct metrics and summaries. | | | | | | |
| FS14 | I was able to create a new campus. | | | | | | |
| FS15 | I was able to add, edit, and delete buildings on the map canvas. | | | | | | |
| FS16 | I was able to draw floor plans and add rooms per floor. | | | | | | |
| FS17 | I was able to draw navigation routes and set their type (walking/accessible/emergency). | | | | | | |
| FS18 | I was able to add accessibility features to buildings. | | | | | | |
| FS19 | I was able to add event pins and overlays. | | | | | | |
| FS20 | Grid snapping, alignment guides, and edge snapping worked as expected. | | | | | | |
| FS21 | Multi-select, group select, and batch operations (move/delete/duplicate) worked correctly. | | | | | | |
| FS22 | Rotating and resizing buildings worked correctly. | | | | | | |
| FS23 | The validation checklist identified missing/incomplete data before publishing. | | | | | | |
| FS24 | Publishing, saving as draft, unpublishing, and archiving worked as expected. | | | | | | |
| FS25 | Published changes became visible in the student map. | | | | | | |
| FS26 | Undo and redo restored my previous changes correctly. | | | | | | |
| FS27 | The reports page let me review student-submitted issues. | | | | | | |
| FS28 | The users page let me manage user accounts. | | | | | | |

### C2. Performance Efficiency

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| PE7 | The admin dashboard and pages loaded quickly. | | | | | | |
| PE8 | The map canvas was responsive while drawing and dragging objects. | | | | | | |
| PE9 | The hierarchy and properties panels updated without noticeable delay. | | | | | | |
| PE10 | Publishing and saving completed in reasonable time. | | | | | | |
| PE11 | I did not experience freezes, lags, or crashes while editing. | | | | | | |

### C3. Compatibility

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| CP5 | The admin interface worked on my device and browser. | | | | | | |
| CP6 | The admin layout adapted correctly to smaller screens. | | | | | | |

### C4. Usability

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| US11 | I could navigate the admin portal without difficulty. | | | | | | |
| US12 | The Map Builder tools were easy to understand and select. | | | | | | |
| US13 | Drawing buildings, rooms, and routes was intuitive. | | | | | | |
| US14 | The properties panel clearly presented editable fields. | | | | | | |
| US15 | The status bar, tooltips, and hints helped me use the editor. | | | | | | |
| US16 | Keyboard shortcuts (V, B, M, P, E, 1–5, Ctrl+Z, etc.) worked as documented. | | | | | | |
| US17 | Confirmation dialogs prevented accidental deletion or loss of work. | | | | | | |
| US18 | The admin interface was visually consistent and professional. | | | | | | |

### C5. Reliability

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| RL5 | My edits were preserved while working (auto-save / draft save). | | | | | | |
| RL6 | Undo/redo history was reliable across multiple operations. | | | | | | |
| RL7 | The application did not lose my work when switching sections. | | | | | | |
| RL8 | The application behaved consistently across multiple sessions. | | | | | | |

### C6. Security

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| SC5 | Only administrators could access the admin dashboard and Map Builder. | | | | | | |
| SC6 | Student users could not modify campus data. | | | | | | |
| SC7 | Login correctly distinguished admin, student, and faculty accounts. | | | | | | |

### C7. Maintainability (technical observations — answer if applicable)

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| MN1 | The application started and ran without configuration problems. | | | | | | |
| MN2 | I could identify which section of the system handled a feature (structured navigation). | | | | | | |
| MN3 | The application handled mock-mode and connected-mode consistently (if applicable). | | | | | | |

### C8. Portability

| # | Item | 1 | 2 | 3 | 4 | 5 | N/A |
|---|------|---|---|---|---|---|---|
| PT1 | The application is installable/usable without special hardware. | | | | | | |
| PT2 | The application can be accessed from any modern web browser. | | | | | | |

---

## Part D — Open-Ended Questions (both sets)

1. What did you **like most** about the application?
2. What did you **like least** about the application?
3. Which feature was **most useful** to you? Why?
4. Which feature was **least useful** or confusing? Why?
5. Did you encounter any **errors, bugs, or unexpected behavior**? Please describe.
6. What **improvements** would you suggest?
7. (Admin only) How would you rate the overall experience of building and publishing a campus map?

---

## Part E — Overall Evaluation Summary

| Aspect | Rating (1–5) |
|--------|--------------|
| Overall satisfaction | |
| Overall functionality | |
| Overall usability | |
| Overall performance | |
| Overall reliability | |
| Overall security | |

**Would you recommend PLV NaviSync to others?** ☐ Yes ☐ No ☐ Maybe — Why? ______________________________

---

## Scoring Guide for Researchers

- Compute **mean and standard deviation** per item and per ISO 25010 characteristic (B1–B7 / C1–C8).
- Interpretation band (example): **4.50–5.00** Excellent · **3.50–4.49** Good · **2.50–3.49** Fair · **1.50–2.49** Poor · **1.00–1.49** Very Poor.
- Items averaging < 3.50 indicate areas requiring improvement before a production release.
- Cross-reference Part D qualitative comments against low-scoring characteristics for triangulation.
