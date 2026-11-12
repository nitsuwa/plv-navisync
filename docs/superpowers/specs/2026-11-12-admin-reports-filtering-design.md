# Admin Reports Filtering and Export Design

## Problem

The admin reports page puts `statusFilter`, `categoryFilter`, and `search` in the dependency list for its data-loading callback. Every keystroke or filter change therefore issues another Supabase request. That callback also turns on the page-level loading state, which replaces the report module with a skeleton. The category control is a native `<select>` with styling applied, so its popup still uses the browser's native menu.

Report rows already come from the Supabase-backed `reportService.listAllReports` path. The category list is a fixed set of supported domain values, not seeded report data. CSV export already uses the loaded report rows and excludes private notes and reporter email.

## Goals

- Keep reports visible while the administrator changes filters or types a search.
- Apply search, category, and status filters without another request for each edit.
- Match the category popup to the existing application theme and keyboard interaction patterns.
- Keep report rows, summary counts, and exports derived from actual active Supabase reports.
- Export only the currently filtered rows while preserving the existing safe CSV fields and filename format.

## Design

Load the active report collection once when the page opens by calling `reportService.listAllReports()` without UI filters. Keep the initial loading skeleton for this first request. Compute the visible rows from the loaded reports and the current status, category, and search state. Search case-insensitively across report title, description, category, identifier, location fields, and reporter display name/identifier. Filter changes update the rendered rows locally and do not toggle the page loading state or issue another query.

Replace the native category control with the existing Radix-based select primitives in `src/app/components/ui/select.tsx`, styled with the reports page's current dimensions, border, input background, and theme tokens. Keep the canonical `REPORT_CATEGORIES` choices, including “All Categories.”

Calculate the report summary cards and status-tab counts from the full active collection, so those counts remain meaningful while a subset is selected. Pass the locally filtered rows to the existing CSV row mapper and downloader. The export remains limited to the current status, category, and search results and continues to omit reporter email and private admin notes.

After a workflow status update, refresh the active collection in the background while keeping the current rows visible. If the initial request fails, retain the existing retry state. If a later refresh fails, preserve the last loaded rows and show a retryable refresh error instead of presenting a false empty list.

## Data and boundaries

- The reports table and its existing hydration path remain the source of report data.
- Archived reports stay excluded by `listAllReports`.
- No sample report rows, fallback report fixtures, database changes, or workflow changes are added.
- The fixed category and status options remain application domain configuration.
- The design assumes the active report collection fits the current page's existing all-reports query. If report volume later makes that unsuitable, pagination can replace the data-loading strategy while preserving the same no-skeleton interaction and filtered-export behavior.

## Verification

Add regression coverage before implementation for:

1. Search and status/category changes update results without calling the report service again.
2. Summary counts stay based on the full active dataset while visible rows are filtered.
3. CSV contains exactly the visible filtered rows and continues to omit private fields.
4. The category control exposes a themed, accessible select with the canonical category options.
5. Initial data still comes from the report service and an empty result remains a real empty state.

Run the focused reports UI and service tests, then the production build and diff checks. Do not write to live report records during verification.
