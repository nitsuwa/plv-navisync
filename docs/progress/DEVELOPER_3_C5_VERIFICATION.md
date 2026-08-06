# Developer 3 C5 Verification Evidence

Verified against the deployed Vite development server at `localhost:5173` on August 6, 2026.

## Package C5 — Reports Workflow (Student Side)

### What was delivered

- **reportService** (`src/services/reportService.ts`): Supabase-integrated report service with:
  - `submitReport()` — Creates a new issue report with optional image upload to Supabase Storage `report-images` bucket, with localStorage fallback for offline/demo mode.
  - `getStudentReports()` — Fetches student's submitted reports from Supabase (by `reporter_id`), merges with locally cached reports, and deduplicates by ID.
  - `uploadReportImage()` — Uploads report photos to Supabase Storage with auto-generated unique paths.
  - `toIssueReport()` — Converts database row (snake_case) to frontend domain object (camelCase).
  - Local storage cache for offline persistence of submitted reports.

- **ReportModal** (`src/components/map/ReportModal.tsx`): In-map report submission modal with:
  - Issue type selector (Broken Light, Flooded Area, Damaged Property, Blocked Walkway, Safety Hazard, Facility Problem, Other).
  - Description text area.
  - Camera/photo upload with file input.
  - Loading spinner during submission.
  - Success confirmation screen with animated checkmark.
  - Toast notification on success/failure.
  - Proper category mapping: hazard/safety → `"hazard"`, blocked → `"accessibility"`, others → `"maintenance"`.

- **StudentReportsPage** (`src/pages/StudentReportsPage.tsx`): Report history page with:
  - Report list with status badges (Pending, Under Review, Resolved, Dismissed).
  - Visual 3-step progress tracker per report (Submitted → Under Review → Resolved).
  - Search by title, building, or issue type.
  - Filter pills (All, Pending, Under Review, Resolved, Dismissed).
  - Refresh button to re-fetch latest report statuses without page reload.
  - "New Report" button linking to the campus map.
  - Empty state when no reports exist.
  - Scroll-reveal animations for card entries.

### What was tested

- Submitting a report from the ReportModal with and without a photo.
- Report appears in the StudentReportsPage list immediately after submission.
- Status badge colors correspond to the correct report status.
- Search filters reports by title and building name.
- Filter pills show only matching statuses.
- Refresh button re-fetches reports with loading spinner animation.
- Empty state renders when no reports are submitted.
- Supabase insert works when authenticated; localStorage fallback works when offline.

### Build evidence

- `vite build` completes without errors.
- Zero console errors in browser DevTools on the Reports page.

### Known limitations

- Report image upload requires Supabase Storage RLS to be properly configured for the `report-images` bucket.
- Report status updates are one-way (student submits, admin resolves). Real-time status push notifications are not implemented.
