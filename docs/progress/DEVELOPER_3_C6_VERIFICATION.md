# Developer 3 C6 Verification Evidence

Verified against the deployed Vite development server at `localhost:5173` on August 6, 2026.

## Package C6 — Events and Announcements

### What was delivered

- **eventService** (`src/services/eventService.ts`): Supabase-integrated events and announcements service with:
  - `getPublishedAnnouncements()` — Fetches published announcements from the `announcements` table, ordered by `created_at` descending. Falls back to curated mock data when Supabase returns empty or errors.
  - `getUpcomingEvents()` — Fetches published events from the `events` table, ordered by `starts_at` ascending. Falls back to mock events with realistic PLV campus data.
  - Type-safe domain interfaces `CampusAnnouncement` and `CampusEvent` mapping database snake_case to frontend camelCase.
  - Mock data includes 2 announcements and 3 events with category variety (Academic, Sports, Cultural).

- **AnnouncementPreview** (integrated in `src/pages/LandingPage.tsx`): Landing page section with:
  - Live fetching from `eventService` on mount.
  - Loading state while data fetches (no blank flash).
  - Announcement cards showing title, content, category badge, and priority indicator.
  - Event cards showing title, description, date/time, organizer, venue, and cover image.
  - "View on Map" button on event cards that navigates to `/map?buildingId=<id>` to highlight the event venue.
  - Category color coding (Academic = blue, Sports = orange, Cultural = purple, etc.).

- **CampusMapPage URL handler** (`src/pages/CampusMapPage.tsx`): Added query parameter processing:
  - `?buildingId=b3` or `?select=b3` auto-selects the target building on page load.
  - URL is cleaned after processing to prevent stale query params.

### What was tested

- Landing page loads announcements and events from Supabase (or mock fallback).
- Announcement cards render with correct category badges and priority colors.
- Event cards show cover images, dates, organizers, and venue labels.
- Clicking "View on Map" navigates to the campus map with the correct building pre-selected.
- URL `?buildingId=` parameter is cleaned after building selection.
- Mock data renders correctly when Supabase is unavailable.

### Build evidence

- `vite build` completes without errors.
- Zero console errors in browser DevTools on the Landing Page.

### Known limitations

- Event venue mapping from Supabase data does not include `building_id` in the events table schema. Events fetched from the database will show `buildingId: null` and the "View on Map" button will be hidden. Mock events include hardcoded building IDs for demonstration.
- Cover images for mock events use Unsplash URLs. Production events should use Supabase Storage URLs.
