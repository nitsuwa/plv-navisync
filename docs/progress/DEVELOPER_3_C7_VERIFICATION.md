# Developer 3 C7 Verification Evidence

Verified against the deployed Vite development server at `localhost:5173` on August 6, 2026.

## Package C7 — Favorites & Student Profile

### What was delivered

- **studentAccountService** (`src/services/studentAccountService.ts`): Supabase-integrated student account service with:
  - `getSavedBuildings()` — Fetches bookmarked buildings from Supabase `student_bookmarks` table (by `user_id`), merges with locally saved IDs, and returns `Building` objects. Default demo bookmarks are `b1` and `b3`.
  - `toggleSaveBuilding(buildingId)` — Adds or removes a building bookmark. Saves to localStorage immediately for instant UI feedback, then syncs to Supabase asynchronously.
  - `getRecentDestinations()` — Returns the student's recent map search destinations from localStorage (up to 10 items).
  - `addRecentDestination()` — Saves a destination with timestamp, deduplicates by ID, and caps at 10 entries.

- **StudentFavoritesPage** (`src/pages/StudentFavoritesPage.tsx`): Favorite locations page with:
  - List of bookmarked buildings with building photo, name, code, category, and floor count.
  - Search/filter within bookmarks.
  - Remove button with swipe-to-dismiss animation and toast confirmation ("Removed from favorites").
  - Empty state when no bookmarks exist.
  - Quick action buttons: Navigate (opens map), Directions.
  - Skeleton loading state during initial fetch.

- **StudentProfilePage** (`src/pages/StudentProfilePage.tsx`): Student profile page with:
  - Profile display from Supabase `profiles` table (avatar, full name, student ID, course, role).
  - Quick stats cards (Saved Places count, Reports count, Recent Searches count).
  - Settings toggles (Dark Mode, Accessibility Mode, Notifications).
  - Sign Out button with Supabase auth signout.

- **useStudentAuth hook** (`src/hooks/useStudentAuth.ts`): Authentication state manager with:
  - Session listener (`onAuthStateChange`) for reactive login/logout.
  - Profile fetch from Supabase `profiles` table.
  - Guest mode fallback with `isGuest` flag.
  - Loading state for skeleton rendering during auth check.

### What was tested

- Bookmarking a building from the campus map adds it to the Favorites page.
- Unbookmarking from the Favorites page removes the building with animation and shows toast "Removed from favorites".
- Recent destinations are saved when searching on the campus map.
- Student profile page shows correct user data when logged in.
- Guest mode displays placeholder profile information.
- Settings toggles persist across page navigations.
- Sign Out clears the session and redirects to home.
- Skeleton loading states render during auth and data fetch.

### Build evidence

- `vite build` completes without errors.
- Zero console errors in browser DevTools on Favorites and Profile pages.

### Known limitations

- Settings toggles (Dark Mode, Accessibility, Notifications) store preferences in localStorage only. Backend persistence is not implemented.
- Student avatar upload is not implemented in the profile page. Avatars display from the Supabase `profiles.avatar_url` field if set by an administrator.
- Recent destinations are stored in localStorage only and are not synced across devices.
