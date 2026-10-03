# Sanitized browser observations — 2026-10-01

Environment: local Vite app at `http://127.0.0.1:5173/student/events`, already authenticated as the Demo Student Org role. The app is configured with a remote Supabase URL; the host value is intentionally omitted. This was a UI-only check. A uniquely labeled proposal was entered in an unsaved modal and never submitted.

## Proposal and campus selection

- Step 1 showed that the administrator sets the event schedule after review. There were no student event date/time fields.
- Step 2 rendered the campus picker as an accessible themed combobox. Opening it showed three campus choices. Selecting a different campus changed the building/floor list (the test campus displayed a different set of buildings from the default campus).
- Selecting one building floor, requesting another campus, then choosing **Keep campus** retained the selected floor and original campus.
- Repeating the campus switch and choosing **Change and clear** selected the new campus, cleared the old floor selection, and showed the new campus's buildings/floors.
- The proposal was discarded with the modal's **Discard changes** action, and the temporary browser tab was closed. No event creation, save, submission, approval, or deletion occurred.

The browser had a pre-existing event card behind the modal, so no screenshot was saved; that would have copied unrelated remote-backed event information into the verification artifact. These observations verify only transient proposal UI behavior. They do not establish campus publication eligibility, request payload contents, persistence, or any admin/student publication workflow.

