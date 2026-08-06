# Developer 3 C3 Verification Evidence

Verified against the deployed Vite development server at `localhost:5173` on August 6, 2026.

## Package C3 — Smart Search & Buildings Directory

### What was delivered

- **useCampusSearch hook** (`src/hooks/useCampusSearch.ts`): Full-text fuzzy search engine that:
  - Indexes buildings, rooms, offices, laboratories, facilities, and campus markers from the active published campus.
  - Supports category filtering (Academic, Administration, Library, Facilities, Laboratory).
  - Uses debounced input (150ms) for smooth search-as-you-type UX.
  - Provides popular searches shortcut for quick access.
  - Returns structured `SearchResult` objects with building/floor/room context.

- **BuildingsPage** (`src/pages/BuildingsPage.tsx`): Buildings directory page with:
  - Search bar with debounced live filtering.
  - Category filter pills (All, Academic, Administration, Facilities, Sports, Dormitory).
  - Sort options (Name A–Z, Name Z–A, Most Floors, Category).
  - Grid/List view toggle.
  - Active filter count badge.
  - Empty state for zero results.
  - Building cards with image, name, code, category, floor count.
  - Click-through to campus map with building pre-selected.

- **BuildingCard** (`src/components/ui/BuildingCard.tsx`): Reusable building card component with:
  - Building photo with gradient overlay.
  - Category badge and floor count indicator.
  - Click/navigate handler.
  - Hover scale animation.

- **useDebounce hook** (`src/hooks/useDebounce.ts`): Generic debounce utility for search inputs.

### What was tested

- Searching "Library" returns the Library building and any rooms inside it.
- Category filter "Academic" shows only academic buildings.
- Sort "Name Z–A" reverses the default alphabetical order.
- Grid/List toggle switches view layout without losing filter state.
- Clearing search restores the full buildings list.
- Clicking a building card navigates to the campus map with that building selected.
- Empty state shows when a search/filter combination has zero results.
- Published campus data is preferred over hardcoded mock data when available.

### Build evidence

- `vite build` completes without errors.
- Zero console errors in browser DevTools on the Buildings page.

### Known limitations

- Search is client-side only. For very large datasets (100+ rooms), a server-side search API would be needed.
- Building images are served from Unsplash for demo. Production should use locally hosted images or Supabase Storage URLs.
